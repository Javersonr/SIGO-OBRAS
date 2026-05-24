import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { X, Package } from 'lucide-react';

export default function ReservaMateriaisModal({
  open,
  onOpenChange,
  saldosSelecionados,
  projetos,
  empresaAtiva,
  user,
  onSave,
  saldos
}) {
  const [projetosSelecionados, setProjetosSelecionados] = useState([]);
  const [dataNecessidade, setDataNecessidade] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);

  const saldosValidos = saldosSelecionados
    .map(id => saldos.find(s => s.id === id))
    .filter(s => s && (s.quantidade_disponivel || 0) > 0);

  const toggleProjeto = (projetoId) => {
    setProjetosSelecionados(prev =>
      prev.includes(projetoId) ? prev.filter(id => id !== projetoId) : [...prev, projetoId]
    );
  };

  const handleSave = async () => {
    if (projetosSelecionados.length === 0) {
      alert('Selecione pelo menos um projeto');
      return;
    }
    if (saldosValidos.length === 0) {
      alert('Nenhum material com estoque disponível selecionado');
      return;
    }

    setSaving(true);
    try {
      const todasReservas = await base44.entities.ReservaMaterial.filter({ empresa_id: empresaAtiva.id });
      const proximoNum = (todasReservas.length || 0) + 1;
      const numeroReserva = `RES-${String(proximoNum).padStart(4, '0')}`;
      const grupoId = `grp_${Date.now()}`;

      const reservasParaCriar = [];
      for (const projetoId of projetosSelecionados) {
        const projeto = projetos.find(p => p.id === projetoId);
        for (const saldo of saldosValidos) {
          reservasParaCriar.push({
            numero: numeroReserva,
            grupo_id: grupoId,
            empresa_id: empresaAtiva.id,
            material_id: saldo.material_id,
            material_codigo: saldo.material_codigo,
            material_descricao: saldo.material_descricao,
            almoxarifado_id: saldo.almoxarifado_id,
            almoxarifado_nome: saldo.almoxarifado_nome,
            projeto_id: projetoId,
            projeto_nome: projeto?.nome,
            quantidade_reservada: saldo.quantidade_disponivel,
            unidade: saldo.unidade,
            data_reserva: new Date().toISOString().split('T')[0],
            data_necessidade: dataNecessidade || null,
            solicitante_id: user?.id,
            solicitante_nome: user?.full_name,
            status: 'Ativa',
            observacoes
          });
        }
      }

      await base44.entities.ReservaMaterial.bulkCreate(reservasParaCriar);

      setProjetosSelecionados([]);
      setDataNecessidade('');
      setObservacoes('');

      onSave();
      onOpenChange(false);
      alert(`✅ Reserva ${numeroReserva} criada com ${reservasParaCriar.length} item(ns)!`);
    } catch (error) {
      console.error('Erro ao criar reservas:', error);
      alert('Erro ao criar reservas');
    } finally {
      setSaving(false);
    }
  };

  const saldosIgnorados = saldosSelecionados.length - saldosValidos.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col w-full md:w-auto md:inset-auto md:right-0" data-fullscreen-modal>
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle>Criar Reservas de Materiais</SheetTitle>
          </SheetHeader>
          <button onClick={() => onOpenChange(false)} className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div>
            <Label className="text-base font-semibold block mb-1">Selecione os Projetos *</Label>
            <p className="text-xs text-slate-500 mb-3">Clique nos projetos para selecionar/deselecionar.</p>
            {projetos.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">Nenhum projeto ativo encontrado</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {projetos.map(p => {
                  const selected = projetosSelecionados.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProjeto(p.id)}
                      className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-all ${
                        selected
                          ? 'border-blue-500 bg-blue-500 text-white shadow-md'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      {selected ? '✓ ' : ''}{p.nome}
                    </button>
                  );
                })}
              </div>
            )}
            {projetosSelecionados.length > 0 && (
              <p className="text-sm text-blue-600 font-medium mt-3">
                ✅ {projetosSelecionados.length} projeto(s) selecionado(s) → {projetosSelecionados.length * saldosValidos.length} reserva(s) serão criadas
              </p>
            )}
          </div>

          <div className="bg-slate-50 p-4 rounded-lg">
            <p className="text-sm font-medium text-slate-700 mb-2">
              Materiais com estoque disponível ({saldosValidos.length}):
            </p>
            {saldosIgnorados > 0 && (
              <p className="text-xs text-amber-600 mb-2">
                ⚠️ {saldosIgnorados} item(ns) ignorado(s) por não ter estoque disponível
              </p>
            )}
            <div className="space-y-2">
              {saldosValidos.map(saldo => (
                <div key={saldo.id} className="flex items-center gap-2 text-sm text-slate-600">
                  <Package className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{saldo.material_descricao}</span>
                    <span className="text-xs text-slate-400 ml-2">
                      {saldo.material_codigo} • Disponível: {saldo.quantidade_disponivel} {saldo.unidade}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Data de Necessidade</Label>
            <Input
              type="date"
              value={dataNecessidade}
              onChange={(e) => setDataNecessidade(e.target.value)}
              className="mt-1.5"
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
        </div>

        <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving || projetosSelecionados.length === 0 || saldosValidos.length === 0}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {saving ? 'Salvando...' : `Criar Reservas (${projetosSelecionados.length} projeto(s))`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}