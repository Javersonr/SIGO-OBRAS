import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { X, Package, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function ReservarItensOrcamentoModal({
  open,
  onOpenChange,
  projeto,
  empresaAtiva,
  user,
  onSave
}) {
  const [orcamentoItens, setOrcamentoItens] = useState([]);
  const [saldos, setSaldos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const [dataNecessidade, setDataNecessidade] = useState('');

  useEffect(() => {
    if (open && projeto?.id) {
      loadData();
    }
  }, [open, projeto?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Buscar itens do orçamento
      const itens = await base44.entities.OrcamentoItem.filter({
        projeto_id: projeto.id,
        empresa_id: empresaAtiva.id
      });
      const materiaisItens = itens.filter(i => i.tipo === 'Material');
      console.log('OrcamentoItens carregados:', materiaisItens);
      setOrcamentoItens(materiaisItens);

      // Buscar saldos de estoque
      const todosOsSaldos = await base44.entities.EstoqueSaldo.filter({
        empresa_id: empresaAtiva.id
      });
      console.log('EstoqueSaldos carregados:', todosOsSaldos);
      setSaldos(todosOsSaldos);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mapear itens do orçamento com estoque disponível
  const itensComEstoque = orcamentoItens
    .map(item => {
      const saldo = saldos.find(s => s.material_id === item.material_id);
      return {
        orcamento_item: item,
        saldo: saldo,
        disponivel: saldo?.quantidade_disponivel || 0,
        quantidade_necessaria: item.quantidade || 0,
        faltam: Math.max(0, (item.quantidade || 0) - (saldo?.quantidade_disponivel || 0))
      };
    })
    .sort((a, b) => b.faltam - a.faltam);

  const comEstoque = itensComEstoque.filter(i => i.disponivel > 0);
  const semEstoque = itensComEstoque.filter(i => i.disponivel === 0);

  const handleSave = async () => {
    if (comEstoque.length === 0) {
      alert('Nenhum material com estoque disponível para reservar');
      return;
    }

    setSaving(true);
    try {
      // Gerar número de reserva único
      const todasReservas = await base44.entities.ReservaMaterial.filter({
       empresa_id: empresaAtiva.id
      });
      const proximoNum = (todasReservas.length || 0) + 1;
      const numeroReserva = `RES-${String(proximoNum).padStart(4, '0')}`;

      // 1. Criar reservas para TODOS os itens do orçamento (quantidade necessária)
      const reservasParaCriar = orcamentoItens.map(item => {
        const saldo = saldos.find(s => s.material_id === item.material_id);
        console.log('Item orçamento:', item, 'Saldo encontrado:', saldo);
        return {
          numero: numeroReserva,
          empresa_id: empresaAtiva.id,
          material_id: item.material_id,
          material_codigo: item.material_codigo || item.codigo || '',
          material_descricao: item.material_descricao || item.descricao || '',
          almoxarifado_id: saldo?.almoxarifado_id || '',
          almoxarifado_nome: saldo?.almoxarifado_nome || '',
          projeto_id: projeto.id,
          projeto_nome: projeto.nome,
          quantidade_reservada: item.quantidade || 0,
          unidade: item.unidade,
          data_reserva: new Date().toISOString().split('T')[0],
          data_necessidade: dataNecessidade || null,
          solicitante_id: user?.id,
          solicitante_nome: user?.full_name,
          status: 'Ativa',
          observacoes
        };
      });
      console.log('Reservas a criar:', reservasParaCriar);

      await base44.entities.ReservaMaterial.bulkCreate(reservasParaCriar);

      // 2. Criar movimentos de estoque (descontar apenas o disponível)
      const movimentos = comEstoque.map(item => ({
        empresa_id: empresaAtiva.id,
        material_id: item.orcamento_item.material_id,
        almoxarifado_id: item.saldo.almoxarifado_id,
        tipo_movimento: 'Reserva',
        quantidade: item.quantidade_necessaria,
        motivo: `Reserva ${numeroReserva} - Projeto ${projeto.nome}`,
        referencia_id: numeroReserva,
        referencia_tipo: 'ReservaMaterial',
        data_movimento: new Date().toISOString().split('T')[0],
        observacoes: `Reservado para projeto ${projeto.nome}`
      }));

      await base44.entities.EstoqueMovimento.bulkCreate(movimentos);

      // 3. Criar solicitação de compra para itens faltantes
      if (semEstoque.length > 0 || itensComEstoque.some(i => i.faltam > 0)) {
        const numeroSolicitacao = `SC-${Date.now()}`;
        const solicitacao = await base44.entities.SolicitacaoCompra.create({
          empresa_id: empresaAtiva.id,
          numero: numeroSolicitacao,
          projeto_id: projeto.id,
          projeto_nome: projeto.nome,
          solicitante_id: user?.id,
          solicitante_nome: user?.full_name,
          status: 'Pendente Aprovação',
          prioridade: 'Normal',
          origem: 'Orcamento',
          data_necessidade: dataNecessidade || null,
          observacoes: `Itens faltantes do projeto ${projeto.nome}\n${observacoes}`
        });

        // Criar itens da solicitação para faltantes
        const itensSolicitacao = itensComEstoque
          .filter(i => i.faltam > 0)
          .map(item => ({
            empresa_id: empresaAtiva.id,
            solicitacao_id: solicitacao.id,
            material_id: item.orcamento_item.material_id,
            material_codigo: item.orcamento_item.codigo,
            descricao: item.orcamento_item.descricao,
            quantidade: item.faltam,
            unidade: item.orcamento_item.unidade,
            observacoes: `Faltam ${item.faltam} un. (reservado: ${item.disponivel})`
          }));

        if (itensSolicitacao.length > 0) {
          await base44.entities.SolicitacaoCompraItem.bulkCreate(itensSolicitacao);
        }
      }

      setOrcamentoItens([]);
      setObservacoes('');
      setDataNecessidade('');
      onSave?.();
      onOpenChange(false);

      const msg = `✅ Reserva ${numeroReserva} criada com ${comEstoque.length} item(ns)!`;
      if (semEstoque.length > 0 || itensComEstoque.some(i => i.faltam > 0)) {
        alert(`${msg}\n\n📋 Solicitação de Compra para ${semEstoque.length + itensComEstoque.filter(i => i.faltam > 0).length} item(ns) faltante(s) criada!`);
      } else {
        alert(msg);
      }
    } catch (error) {
      console.error('Erro ao criar reserva/solicitação:', error);
      alert('Erro ao criar reserva/solicitação');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col w-full md:w-auto" data-fullscreen-modal>
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle>Reservar Itens do Orçamento</SheetTitle>
          </SheetHeader>
          <button onClick={() => onOpenChange(false)} className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-slate-600">Carregando dados...</p>
            </div>
          ) : (
            <>
              {/* Itens com estoque */}
              <div>
                <Label className="text-base font-semibold block mb-3">
                  ✅ Itens com Estoque ({comEstoque.length})
                </Label>
                {comEstoque.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                    Nenhum material com estoque disponível
                  </p>
                ) : (
                  <div className="space-y-2 bg-green-50 p-4 rounded-lg border border-green-200">
                    {comEstoque.map(item => (
                      <div key={item.orcamento_item.id} className="flex items-start gap-2 text-sm">
                        <Package className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <div className="font-medium text-slate-800">{item.orcamento_item.descricao}</div>
                          <div className="text-xs text-slate-600">
                            Código: {item.orcamento_item.codigo || '-'} • Necessário: {item.quantidade_necessaria} {item.orcamento_item.unidade} • Disponível: {item.disponivel}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Itens sem estoque ou faltantes */}
              {itensComEstoque.some(i => i.faltam > 0) && (
                <div>
                  <Label className="text-base font-semibold block mb-3 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    Itens Faltantes ({itensComEstoque.filter(i => i.faltam > 0).length})
                  </Label>
                  <div className="space-y-2 bg-amber-50 p-4 rounded-lg border border-amber-200">
                    {itensComEstoque
                      .filter(i => i.faltam > 0)
                      .map(item => (
                        <div key={item.orcamento_item.id} className="flex items-start gap-2 text-sm">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="font-medium text-slate-800">{item.orcamento_item.descricao}</div>
                            <div className="text-xs text-slate-600">
                              Necessário: {item.quantidade_necessaria} {item.orcamento_item.unidade} • Faltam: {item.faltam} un.
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                  <p className="text-xs text-amber-700 mt-2 p-2 bg-amber-100 rounded">
                    💡 Uma solicitação de compra será criada automaticamente para os itens faltantes
                  </p>
                </div>
              )}

              <div>
                <Label>Data de Necessidade</Label>
                <input
                  type="date"
                  value={dataNecessidade}
                  onChange={(e) => setDataNecessidade(e.target.value)}
                  className="w-full mt-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Observações sobre as reservas..."
                  className="mt-1.5"
                  rows={3}
                />
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t p-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || comEstoque.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {saving ? 'Processando...' : `Criar Reserva e Solicitação`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}