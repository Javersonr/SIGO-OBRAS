import { useState, useEffect } from 'react';
import { Download, Search, CheckCircle2, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ConfirmarEntregaModal({ open, onOpenChange, entrega, user, onConfirmed, empresaAtiva }) {
  const [loading, setLoading] = useState(false);
  const [itensEntrega, setItensEntrega] = useState([]);
  const [acaoEntregaParcial, setAcaoEntregaParcial] = useState('pendente');
  const [abaFerramentas, setAbaFerramentas] = useState('pendentes');
  const [abaEpis, setAbaEpis] = useState('pendentes');
  const [abaModal, setAbaModal] = useState('ferramentas');
  const [observacoes, setObservacoes] = useState('');
  const [buscaForramentas, setBuscaForramentas] = useState('');
  const [buscaEpis, setBuscaEpis] = useState('');
  const [ferramentasDisponiveis, setFerramentasDisponiveis] = useState([]);

  const itens = (() => {
    if (!entrega?.itens) return [];
    try { return JSON.parse(entrega.itens); } catch (e) { return []; }
  })();

  useEffect(() => {
    if (open && entrega?.id) {
      const carregarDados = async () => {
        // Buscar ferramentas disponíveis (sem funcionario vinculado)
        let ferrsDisp = [];
        if (entrega.empresa_id) {
          ferrsDisp = await base44.entities.Ferramenta.filter({ empresa_id: entrega.empresa_id, status: 'Disponível' }).catch(() => []);
          setFerramentasDisponiveis(ferrsDisp.filter(f => !f.funcionario_id));
        }

        // Para cada item com ferramenta_id, pré-popular laudo/série do cadastro
        const dados = itens && itens.length > 0 ? itens : [];
        const itensComDados = await Promise.all(dados.map(async (i) => {
          let numero_laudo = i.numero_laudo || '';
          let numero_serie = i.numero_serie || '';
          if (i.ferramenta_id) {
            const ferrs = await base44.entities.Ferramenta.filter({ id: i.ferramenta_id }).catch(() => []);
            if (ferrs.length > 0) {
              numero_laudo = i.numero_laudo || ferrs[0].numero_laudo || '';
              numero_serie = i.numero_serie || ferrs[0].numero_serie || '';
            }
          }
          return { ...i, quantidade_entregue: i.quantidade_entregue ?? 0, conferido: i.conferido ?? false, numero_laudo, numero_serie };
        }));

        setItensEntrega(itensComDados);
        setObservacoes(entrega.observacoes || '');
        setAbaFerramentas('pendentes');
        setAbaEpis('pendentes');
      };
      carregarDados();
    }
  }, [open, entrega?.id]);

  const handleConfirmar = async () => {
    const itensEntreguesConferidos = itensEntrega.filter((i) => i.conferido && (i.quantidade_entregue ?? 0) > 0);
    if (itensEntreguesConferidos.length === 0) {
      toast.error('Você precisa entregar e conferir pelo menos 1 item');
      return;
    }

    const itensComQuantidadeEntregada = itensEntrega.filter((i) => (i.quantidade_entregue ?? 0) > 0);
    if (itensComQuantidadeEntregada.length > 0 && itensComQuantidadeEntregada.length !== itensEntreguesConferidos.length) {
      const naoConferidos = itensComQuantidadeEntregada.length - itensEntreguesConferidos.length;
      toast.error(`${naoConferidos} item(ns) entregue(s) ainda não foi(foram) conferido(s). Marque o checkbox para confirmar cada item.`);
      return;
    }

    setLoading(true);
    try {
      const dataEntrega = format(new Date(), 'yyyy-MM-dd');

      const todasAsQuantidadesBatem = itensEntrega.length > 0 &&
        itensEntrega.every((item) => (item.quantidade_entregue ?? 0) === (item.quantidade ?? 1));

      const novoStatus = todasAsQuantidadesBatem ? 'Entregue' : (acaoEntregaParcial === 'concluir' ? 'Entregue' : 'Pendente');

      await base44.entities.EntregaFerramental.update(entrega.id, {
        status: novoStatus,
        responsavel_entrega_nome: user?.full_name || '',
        responsavel_entrega_email: user?.email || '',
        data_entrega: dataEntrega,
        biometria_capturada: false,
        biometria_template: '',
        observacoes: observacoes || entrega.observacoes || '',
        itens: JSON.stringify(itensEntrega)
      });

      const movimentacoes = itensEntrega
        .filter((item) => item.quantidade_entregue > 0 && item.ferramenta_id && item.conferido)
        .map((item) => {
          const mov = {
            empresa_id: entrega.empresa_id,
            data_movimentacao: dataEntrega,
            tipo_movimentacao: 'Entrega',
            ferramenta_descricao: item.descricao || item.ferramenta || item.item || '',
            numero_serie: item.numero_serie || '',
            quantidade: item.quantidade_entregue,
            tipo: item.tipo || 'Ferramenta',
            usuario_responsavel: user?.full_name || '',
            observacoes: `Entrega confirmada - ${entrega.solicitante_nome || 'Sem solicitante'}`,
            ferramenta_id: item.ferramenta_id
          };
          if (entrega.funcionario_id) mov.funcionario_id = entrega.funcionario_id;
          if (entrega.funcionario_nome) mov.funcionario_nome = entrega.funcionario_nome;
          if (entrega.caminhao_id) mov.caminhao_id = entrega.caminhao_id;
          if (entrega.caminhao_placa) mov.caminhao_placa = entrega.caminhao_placa;
          return mov;
        });

      if (movimentacoes.length > 0) {
        await base44.entities.MovimentacaoFerramenta.bulkCreate(movimentacoes);
      }

      // Atualizar número de série, laudo e STATUS das ferramentas entregues → Em Uso
      const atualizacoes = itensEntrega.filter((item) => item.ferramenta_id && item.conferido && item.quantidade_entregue > 0);
      await Promise.all(atualizacoes.map((item) => {
        const updates = { status: 'Em Uso' };
        if (item.numero_serie !== undefined) updates.numero_serie = item.numero_serie;
        if (item.numero_laudo !== undefined) updates.numero_laudo = item.numero_laudo;
        if (entrega.funcionario_id) { updates.funcionario_id = entrega.funcionario_id; updates.funcionario_nome = entrega.funcionario_nome || ''; }
        if (entrega.caminhao_id) { updates.localizacao = entrega.caminhao_placa || ''; }
        return base44.entities.Ferramenta.update(item.ferramenta_id, updates).catch(() => {});
      }));

      toast.success('Entrega confirmada com sucesso!');
      onConfirmed?.();
      onOpenChange(false);
    } catch (err) {
      toast.error('Erro ao confirmar entrega');
    } finally {
      setLoading(false);
    }
  };

  const handleImprimir = () => {
    const printElement = document.getElementById('epi-print-content-entrega');
    const printWindow = window.open('', '', 'height=800,width=1200');
    printWindow.document.write(`
      <html>
        <head>
          <title>Ficha de Entrega - ${entrega.funcionario_nome || entrega.caminhao_placa}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { font-family: Arial, sans-serif; background: white; }
            table { border-collapse: collapse; width: 100%; font-size: 11px; }
            table td, table th { border: 1px solid #000; padding: 6px; text-align: left; }
            table th { background-color: #e5e5e5; font-weight: bold; }
            h1 { font-size: 14px; font-weight: bold; text-align: center; margin: 10px 0; }
            .border-b { border-bottom: 2px solid #1f2937; padding-bottom: 8px; }
          </style>
        </head>
        <body>${printElement.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); printWindow.close(); }, 500);
  };

  const episOrdenados = [...itensEntrega]
    .filter((i) => i.tipo === 'EPI' && i.conferido && (i.quantidade_entregue ?? i.quantidade ?? 1) > 0)
    .sort((a, b) => (a.descricao || a.item || '').localeCompare(b.descricao || b.item || ''));

  const renderFichaEPI = () => (
    <div style={{ fontFamily: 'Arial, sans-serif', width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '12px', borderBottom: '3px solid #000', gap: '20px' }}>
        <div style={{ minWidth: '80px' }}>
          {empresaAtiva?.logo_url && <img src={empresaAtiva.logo_url} alt="Logo" style={{ maxHeight: '140px', maxWidth: '300px', objectFit: 'contain' }} />}
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <h1 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0', lineHeight: '1.4', letterSpacing: '0.5px' }}>
            FICHA DE CONTROLE E ENTREGA DE EQUIPAMENTO DE PROTEÇÃO INDIVIDUAL (EPI) E UNIFORME
          </h1>
        </div>
      </div>
      <div style={{ marginBottom: '8px', fontSize: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0', marginBottom: '4px' }}>
          <div style={{ borderBottom: '1px solid #000', paddingBottom: '2px' }}><div style={{ fontWeight: 'bold' }}>NOME:</div><div style={{ marginTop: '2px' }}>{entrega.funcionario_nome || `Caminhão ${entrega.caminhao_placa}` || ''}</div></div>
          <div style={{ borderBottom: '1px solid #000', paddingBottom: '2px', paddingLeft: '20px' }}><div style={{ fontWeight: 'bold' }}>Nº DE REGISTRO:</div><div style={{ marginTop: '2px' }}>{entrega.funcionario_id || entrega.caminhao_id || ''}</div></div>
          <div style={{ borderBottom: '1px solid #000', paddingBottom: '2px', paddingLeft: '20px' }}><div style={{ fontWeight: 'bold' }}>DATA DE EMISSÃO:</div><div style={{ marginTop: '2px' }}>{format(new Date(), 'dd/MM/yyyy')}</div></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0' }}>
          <div style={{ borderBottom: '1px solid #000', paddingBottom: '2px' }}><div style={{ fontWeight: 'bold' }}>FUNÇÃO/TIPO:</div><div style={{ marginTop: '2px' }}>{entrega.funcao_nome || entrega.caminhao_modelo || ''}</div></div>
          <div style={{ borderBottom: '1px solid #000', paddingBottom: '2px', paddingLeft: '20px' }}><div style={{ fontWeight: 'bold' }}>SEÇÃO: OPERACIONAL</div></div>
          <div style={{ borderBottom: '1px solid #000', paddingBottom: '2px', paddingLeft: '20px' }}><div style={{ fontWeight: 'bold' }}>DATA DE EMISSÃO:</div></div>
        </div>
      </div>
      <div style={{ marginBottom: '12px', fontSize: '9px', backgroundColor: '#f5f5f5', padding: '8px', border: '1px solid #ccc' }}>
        <p style={{ textAlign: 'justify', marginBottom: '8px', lineHeight: '1.4' }}>
          Recebo da Empresa ELETRO ENERGIA LTDA, CNPJ nº 30.694.170/0001-84, para meu uso obrigatório os EPI's (documentos de proteção individual) constantes nesta ficha, o qual cumpri a utiliza-los corretamente durante o tempo que permanece ao meu dispor.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ borderBottom: '1px solid #000', paddingBottom: '2px' }}><div style={{ fontWeight: 'bold', fontSize: '10px' }}>LOCAL:</div></div>
          <div style={{ borderBottom: '1px solid #000', paddingBottom: '2px' }}><div style={{ fontWeight: 'bold', fontSize: '10px' }}>DATA DA EMISSÃO: __/__/____</div></div>
        </div>
      </div>
      <table style={{ fontSize: '11px', marginBottom: '12px' }}>
        <thead>
          <tr style={{ backgroundColor: '#e5e5e5' }}>
            <th style={{ width: '7%', padding: '6px' }}>RETIRADA</th>
            <th style={{ width: '7%', padding: '6px' }}>DEVOLUÇÃO</th>
            <th style={{ width: '5%', padding: '6px', textAlign: 'center' }}>QUANT.</th>
            <th style={{ width: '5%', padding: '6px', textAlign: 'center' }}>ENTREGUE</th>
            <th style={{ width: '15%', padding: '6px' }}>DESCRIÇÃO DO EQUIPAMENTO</th>
            <th style={{ width: '8%', padding: '6px', textAlign: 'center' }}>Nº DO C.A.</th>
            <th style={{ width: '23%', padding: '6px', textAlign: 'center' }}>ASSINATURA DO FUNCIONÁRIO</th>
            <th style={{ width: '20%', padding: '6px', textAlign: 'center' }}>RESPONSÁVEL PELA ENTREGA</th>
          </tr>
        </thead>
        <tbody>
          {episOrdenados.map((epi, idx) => (
            <tr key={idx} style={{ height: '20px' }}>
              <td style={{ padding: '6px' }}>__/__/____</td>
              <td style={{ padding: '6px' }}>__/__/____</td>
              <td style={{ padding: '6px', textAlign: 'center' }}>{epi.quantidade || 1}</td>
              <td style={{ padding: '6px', textAlign: 'center' }}>{epi.quantidade_entregue || epi.quantidade || 1}</td>
              <td style={{ padding: '6px', fontSize: '10px' }}>{epi.descricao || epi.item || ''}</td>
              <td style={{ padding: '6px' }}>{epi.numero_laudo || ''}</td>
              <td style={{ padding: '6px' }}></td>
              <td style={{ padding: '6px' }}></td>
            </tr>
          ))}
          {episOrdenados.length === 0 && (
            <tr style={{ height: '20px' }}><td colSpan={7} style={{ padding: '6px', textAlign: 'center', fontSize: '10px' }}>Nenhum EPI entregue e conferido</td></tr>
          )}
          {[...Array(Math.max(0, episOrdenados.length > 0 ? 30 - episOrdenados.length : 30))].map((_, idx) => (
            <tr key={`empty-${idx}`} style={{ height: '20px' }}>
              <td style={{ padding: '6px' }}>__/__/____</td><td style={{ padding: '6px' }}>__/__/____</td>
              <td style={{ padding: '6px' }}></td><td style={{ padding: '6px' }}></td>
              <td style={{ padding: '6px' }}></td><td style={{ padding: '6px' }}></td>
              <td style={{ padding: '6px' }}></td><td style={{ padding: '6px' }}></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: '24px', paddingTop: '8px', borderTop: '1px solid #1f2937' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', fontSize: '10px', marginTop: '8px' }}>
          <div><div style={{ borderBottom: '1px solid #1f2937', height: '35px', marginBottom: '2px' }}></div><div style={{ textAlign: 'center', fontWeight: 'bold' }}>Assinatura do Funcionário</div></div>
          <div><div style={{ borderBottom: '1px solid #1f2937', height: '35px', marginBottom: '2px' }}></div><div style={{ textAlign: 'center', fontWeight: 'bold' }}>Responsável pela Entrega</div></div>
        </div>
      </div>
    </div>
  );

  if (!entrega) return null;

  const renderLinhaFerramenta = (item, idx) => {
    const originalIdx = itensEntrega.indexOf(item);
    if (abaFerramentas === 'entregues' && !item.conferido) return null;
    if (abaFerramentas === 'pendentes' && item.conferido) return null;
    return (
      <tr key={idx} className={item.conferido ? 'bg-green-50 border-l-4 border-green-500' : 'bg-red-50 border-l-4 border-red-400'}>
        <td className="px-3 py-2 text-center">
          <input type="checkbox" checked={item.conferido || false}
            onChange={(e) => setItensEntrega((prev) => prev.map((it, i) => i === originalIdx ? { ...it, conferido: e.target.checked } : it))}
            className="w-4 h-4 cursor-pointer accent-green-600" />
        </td>
        <td className="px-3 py-2">
          <div className="font-medium text-slate-800 text-sm">{item.descricao || item.item || ''}</div>
          {!item.ferramenta_id && (
            <select
              className="mt-1 w-full border border-amber-300 rounded px-2 py-1 text-xs bg-amber-50 focus:outline-none focus:border-blue-400"
              value=""
              onChange={(e) => {
                const ferr = ferramentasDisponiveis.find(f => f.id === e.target.value);
                if (!ferr) return;
                setItensEntrega(prev => prev.map((it, i) => i === originalIdx ? {
                  ...it,
                  ferramenta_id: ferr.id,
                  numero_laudo: it.numero_laudo || ferr.numero_laudo || '',
                  numero_serie: it.numero_serie || ferr.numero_serie || '',
                } : it));
              }}
            >
              <option value="">⚠️ Vincular ferramenta disponível...</option>
              {ferramentasDisponiveis.map(f => (
                <option key={f.id} value={f.id}>{f.descricao}{f.numero_serie ? ` - S/N: ${f.numero_serie}` : ''}</option>
              ))}
            </select>
          )}
          {item.ferramenta_id && (
            <span className="text-xs text-green-600 mt-0.5 block">✓ Ferramenta vinculada</span>
          )}
        </td>
        <td className="px-3 py-2 text-center">
          <span className="inline-flex items-center justify-center w-10 h-7 bg-slate-100 border border-slate-200 rounded text-slate-500 font-semibold text-xs">{item.quantidade || 1}</span>
        </td>
        <td className="px-3 py-2">
          <input type="number" min={0} value={item.quantidade_entregue ?? 0}
            onChange={(e) => setItensEntrega((prev) => prev.map((it, i) => i === originalIdx ? { ...it, quantidade_entregue: parseInt(e.target.value) || 0 } : it))}
            className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-blue-400" />
        </td>
        <td className="px-3 py-2">
          <input type="text" value={item.numero_laudo || ''}
            onChange={(e) => setItensEntrega((prev) => prev.map((it, i) => i === originalIdx ? { ...it, numero_laudo: e.target.value } : it))}
            placeholder="Ex: 12345" className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400" />
        </td>
        <td className="px-3 py-2">
          <input type="text" value={item.numero_serie || ''}
            onChange={(e) => setItensEntrega((prev) => prev.map((it, i) => i === originalIdx ? { ...it, numero_serie: e.target.value } : it))}
            placeholder="Nº série (opcional)" className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400" />
        </td>
      </tr>
    );
  };

  const renderLinhaEPI = (item, idx) => {
    const originalIdx = itensEntrega.indexOf(item);
    if (abaEpis === 'entregues' && !item.conferido) return null;
    if (abaEpis === 'pendentes' && item.conferido) return null;
    return (
      <tr key={idx} className={item.conferido ? 'bg-green-50 border-l-4 border-green-500' : 'bg-red-50 border-l-4 border-red-400'}>
        <td className="px-3 py-2 text-center">
          <input type="checkbox" checked={item.conferido || false}
            onChange={(e) => setItensEntrega((prev) => prev.map((it, i) => i === originalIdx ? { ...it, conferido: e.target.checked } : it))}
            className="w-4 h-4 cursor-pointer accent-green-600" />
        </td>
        <td className="px-3 py-2 text-slate-800 font-medium">{item.descricao || item.item || ''}</td>
        <td className="px-3 py-2 text-center">
          <span className="inline-flex items-center justify-center w-10 h-7 bg-slate-100 border border-slate-200 rounded text-slate-500 font-semibold text-xs">{item.quantidade || 1}</span>
        </td>
        <td className="px-3 py-2">
          <input type="number" min={0} value={item.quantidade_entregue ?? 0}
            onChange={(e) => setItensEntrega((prev) => prev.map((it, i) => i === originalIdx ? { ...it, quantidade_entregue: parseInt(e.target.value) || 0 } : it))}
            className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-blue-400" />
        </td>
        <td className="px-3 py-2">
          <input type="text" value={item.numero_laudo || ''}
            onChange={(e) => setItensEntrega((prev) => prev.map((it, i) => i === originalIdx ? { ...it, numero_laudo: e.target.value } : it))}
            placeholder="Ex: 12345" className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400" />
        </td>
        <td className="px-3 py-2">
          <input type="text" value={item.numero_serie || ''}
            onChange={(e) => setItensEntrega((prev) => prev.map((it, i) => i === originalIdx ? { ...it, numero_serie: e.target.value } : it))}
            placeholder="Nº série (opcional)" className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400" />
        </td>
      </tr>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full h-full overflow-y-auto p-0 flex flex-col" data-fullscreen-modal>
        <SheetHeader className="sticky top-0 bg-white z-10 space-y-3 border-b">
          <SheetTitle className="sr-only">Confirmar Entrega - {entrega.funcionario_nome || entrega.caminhao_placa}</SheetTitle>
          <div className="px-6 pt-4 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-800">{entrega.funcionario_nome || entrega.caminhao_placa || 'Entrega'}</span>
          </div>

          <div className="px-6 flex items-center justify-between w-full gap-4">
            <div className="flex gap-2 flex-1">
              <button
                onClick={() => setAbaModal('ferramentas')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all text-white ${abaModal === 'ferramentas' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-400 hover:bg-slate-500'}`}>
                ⚙️ Ferramentas
              </button>
              <button
                onClick={() => setAbaModal('epis')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all text-white ${abaModal === 'epis' ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-400 hover:bg-slate-500'}`}>
                🛡️ EPIs
              </button>
            </div>
            <div className="flex gap-2 border-l pl-4">
              <div className="text-xs space-y-1">
                <div className="text-slate-600"><span className="font-semibold text-green-600">{itensEntrega.filter((i) => i.conferido).length}</span> Entregues</div>
                <div className="text-slate-600"><span className="font-semibold text-red-600">{itensEntrega.filter((i) => !i.conferido).length}</span> Pendentes</div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleImprimir} className="gap-2">
              <Download className="w-4 h-4" />Imprimir
            </Button>
          </div>
        </SheetHeader>

        <div className="px-5 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style>{`div::-webkit-scrollbar { display: none; }`}</style>

          {/* ABA FERRAMENTAS */}
          {abaModal === 'ferramentas' && (
            <div>
              <div className="sticky top-0 bg-white pt-4 pb-3 space-y-3 z-10">
                <div className="mx-1 flex gap-2 border-b">
                  <button onClick={() => setAbaFerramentas('entregues')} className={`px-4 py-2 font-medium text-sm border-b-2 transition-all ${abaFerramentas === 'entregues' ? 'border-green-600 text-green-700' : 'border-transparent text-slate-600 hover:text-slate-800'}`}>
                    ✓ Entregues ({itensEntrega.filter((i) => i.tipo !== 'EPI' && i.conferido).length})
                  </button>
                  <button onClick={() => setAbaFerramentas('pendentes')} className={`px-4 py-2 font-medium text-sm border-b-2 transition-all ${abaFerramentas === 'pendentes' ? 'border-red-600 text-red-700' : 'border-transparent text-slate-600 hover:text-slate-800'}`}>
                    ⏳ Pendentes ({itensEntrega.filter((i) => i.tipo !== 'EPI' && !i.conferido).length})
                  </button>
                </div>
                <input type="text" placeholder="Buscar ferramentas..." value={buscaForramentas || ''} onChange={(e) => setBuscaForramentas(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <p className="text-sm text-slate-500">Itens sem ferramenta vinculada mostram um seletor para escolher uma ferramenta disponível no estoque.</p>
              </div>
              <div className="space-y-4">
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-10">✓</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Descrição / Ferramenta</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-24">Qtd. Solicitada</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-28">Qtd. Entregue</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-32">Nº de Laudo</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-32">Nº de Série</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const ferramentas = itensEntrega.filter((i) => i.tipo !== 'EPI').filter((i) => !buscaForramentas || i.descricao?.toLowerCase().includes(buscaForramentas.toLowerCase()) || i.item?.toLowerCase().includes(buscaForramentas.toLowerCase()));
                        if (ferramentas.length === 0) return (<tr><td colSpan={6} className="px-3 py-4 text-center text-slate-500 text-sm">Nenhuma ferramenta</td></tr>);
                        return ferramentas.map((item, idx) => renderLinhaFerramenta(item, idx));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ABA EPIs */}
          {abaModal === 'epis' && (
            <div>
              <div className="space-y-4">
                <div className="flex gap-2 border-b mt-4">
                  <button onClick={() => setAbaEpis('entregues')} className={`px-4 py-2 font-medium text-sm border-b-2 transition-all ${abaEpis === 'entregues' ? 'border-green-600 text-green-700' : 'border-transparent text-slate-600 hover:text-slate-800'}`}>
                    ✓ Entregues ({itensEntrega.filter((i) => i.tipo === 'EPI' && i.conferido).length})
                  </button>
                  <button onClick={() => setAbaEpis('pendentes')} className={`px-4 py-2 font-medium text-sm border-b-2 transition-all ${abaEpis === 'pendentes' ? 'border-red-600 text-red-700' : 'border-transparent text-slate-600 hover:text-slate-800'}`}>
                    ⏳ Pendentes ({itensEntrega.filter((i) => i.tipo === 'EPI' && !i.conferido).length})
                  </button>
                </div>
                <input type="text" placeholder="Buscar EPIs..." value={buscaEpis || ''} onChange={(e) => setBuscaEpis(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <p className="text-sm text-slate-500">Informe a quantidade entregue, o Nº do C.A. e Nº de Série antes de confirmar.</p>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-10">✓</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Descrição</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-24">Qtd. Solicitada</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-28">Qtd. Entregue</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-28">Nº do C.A.</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-32">Nº de Série</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const epis = itensEntrega.filter((i) => i.tipo === 'EPI').filter((i) => !buscaEpis || i.descricao?.toLowerCase().includes(buscaEpis.toLowerCase()) || i.item?.toLowerCase().includes(buscaEpis.toLowerCase()));
                        if (epis.length === 0) return (<tr><td colSpan={6} className="px-3 py-4 text-center text-slate-500 text-sm">Nenhum EPI</td></tr>);
                        return epis.map((item, idx) => renderLinhaEPI(item, idx));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Observações */}
        <div className="px-6 border-t space-y-3 pt-3">
          <div className="mx-1 space-y-2">
            <label className="text-sm font-medium text-slate-700">Observações:</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Adicione observações adicionais se necessário..."
              className="px-1 text-sm rounded-lg w-full border border-slate-300 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              rows={3} />
          </div>
        </div>

        {/* Opção de entrega parcial */}
        {(() => {
          const algumPendente = itensEntrega.some(i => (i.quantidade_entregue ?? 0) < (i.quantidade ?? 1));
          if (!algumPendente) return null;
          return (
            <div className="px-6 py-3 bg-amber-50 border-t border-amber-200">
              <p className="text-xs font-semibold text-amber-800 mb-2">⚠️ Entrega parcial detectada — o que deseja fazer?</p>
              <div className="flex gap-3">
                <label className={`flex-1 flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer transition-all ${acaoEntregaParcial === 'pendente' ? 'border-amber-500 bg-amber-100' : 'border-slate-200 bg-white'}`}>
                  <input type="radio" name="acao_parcial" value="pendente" checked={acaoEntregaParcial === 'pendente'} onChange={() => setAcaoEntregaParcial('pendente')} className="accent-amber-600" />
                  <div><div className="text-xs font-semibold text-amber-800">Deixar Pendente</div><div className="text-xs text-amber-600">Salva progresso, entrega continua aberta</div></div>
                </label>
                <label className={`flex-1 flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer transition-all ${acaoEntregaParcial === 'concluir' ? 'border-green-600 bg-green-50' : 'border-slate-200 bg-white'}`}>
                  <input type="radio" name="acao_parcial" value="concluir" checked={acaoEntregaParcial === 'concluir'} onChange={() => setAcaoEntregaParcial('concluir')} className="accent-green-600" />
                  <div><div className="text-xs font-semibold text-green-800">Concluir Entrega</div><div className="text-xs text-green-600">Marca como entregue mesmo incompleta</div></div>
                </label>
              </div>
            </div>
          );
        })()}

        {/* Ações */}
        <div className="px-6 py-2 border-t space-y-2">
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
            <Button onClick={handleConfirmar} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {loading ? 'Salvando...' : 'Confirmar Entrega'}
            </Button>
          </div>
        </div>

        {/* Ficha para impressão (hidden) */}
        <div id="epi-print-content-entrega" style={{ display: 'none' }}>
          {renderFichaEPI()}
        </div>
      </SheetContent>
    </Sheet>
  );
}