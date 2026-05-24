import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Search, Eye, Edit2, Trash2, MoreVertical, ClipboardList, Settings, Download, FileText } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ChecklistManagerModal from './ChecklistManagerModal';
import InspecaoCampoFormModal from './InspecaoCampoFormModal';
import InspecaoCampoDetalheModal from './InspecaoCampoDetalheModal';

export default function InspecaoCampoTab({ empresaAtiva }) {
  const [inspecoes, setInspecoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showChecklistManager, setShowChecklistManager] = useState(false);
  const [showNovaInspecao, setShowNovaInspecao] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState(false);
  const [inspecaoSelecionada, setInspecaoSelecionada] = useState(null);

  useEffect(() => {
    if (empresaAtiva?.id) loadInspecoes();
  }, [empresaAtiva?.id]);

  const loadInspecoes = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.InspecaoCampo.filter({ empresa_id: empresaAtiva.id }, '-data_inspecao', 200);
      setInspecoes(data.filter(i => i.ativo !== false));
    } catch (e) {
      toast.error('Erro ao carregar inspeções');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (insp) => {
    if (!confirm(`Excluir inspeção de ${insp.data_inspecao}?`)) return;
    try {
      await base44.entities.InspecaoCampo.update(insp.id, { ativo: false });
      toast.success('Inspeção excluída');
      loadInspecoes();
    } catch { toast.error('Erro ao excluir'); }
  };

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = inspecoes.map(i => ({
      'Data': i.data_inspecao ? format(new Date(i.data_inspecao), 'dd/MM/yyyy') : '-',
      'Checklist': i.checklist_nome || '-',
      'Local': i.local || '-',
      'Responsável': i.responsavel_nome || '-',
      'Status': i.status || '-',
      'Total Itens': i.total_itens || 0,
      'Inspecionados': i.total_inspecionados || 0,
      'Conformes': i.total_conformes || 0,
      'Não Conformes': i.total_nao_conformes || 0,
      'Observações': i.observacoes || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inspeções de Campo');
    XLSX.writeFile(wb, `inspecoes_campo_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Excel exportado');
  };

  const handleExportPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF('landscape');
    doc.setFontSize(16); doc.setFont(undefined, 'bold');
    doc.text('Relatório de Inspeções de Campo', 14, 15);
    doc.setFontSize(9); doc.setFont(undefined, 'normal');
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | ${empresaAtiva?.nome || ''}`, 14, 22);

    let y = 32;
    doc.setFontSize(8); doc.setFont(undefined, 'bold');
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y - 4, 268, 6, 'F');
    ['Data', 'Checklist', 'Local', 'Responsável', 'Status', 'Itens', 'Conform.'].forEach((h, i) => {
      doc.text(h, [14, 50, 90, 130, 180, 220, 245][i], y);
    });
    y += 5;
    doc.setFont(undefined, 'normal');
    inspecoes.forEach(insp => {
      if (y > 190) { doc.addPage(); y = 20; }
      doc.text(insp.data_inspecao ? format(new Date(insp.data_inspecao), 'dd/MM/yy') : '-', 14, y);
      doc.text((insp.checklist_nome || '-').substring(0, 20), 50, y);
      doc.text((insp.local || '-').substring(0, 20), 90, y);
      doc.text((insp.responsavel_nome || '-').substring(0, 20), 130, y);
      doc.text(insp.status || '-', 180, y);
      doc.text(`${insp.total_inspecionados || 0}/${insp.total_itens || 0}`, 220, y);
      doc.text(`${insp.total_conformes || 0}`, 245, y);
      y += 6;
    });
    doc.save(`inspecoes_campo_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF exportado');
  };

  const filtradas = inspecoes.filter(i =>
    !search ||
    i.checklist_nome?.toLowerCase().includes(search.toLowerCase()) ||
    i.local?.toLowerCase().includes(search.toLowerCase()) ||
    i.responsavel_nome?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = {
    'Em Andamento': 'bg-blue-100 text-blue-700',
    'Concluída': 'bg-green-100 text-green-700',
    'Não Conforme': 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar inspeção..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowChecklistManager(true)} className="gap-2">
            <Settings className="w-4 h-4" />
            Gerenciar Checklists
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileText className="w-4 h-4 mr-2" />
                Exportar Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF}>
                <FileText className="w-4 h-4 mr-2" />
                Exportar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => { setInspecaoSelecionada(null); setShowNovaInspecao(true); }} className="bg-amber-500 hover:bg-amber-600 gap-2">
            <Plus className="w-4 h-4" />
            Nova Inspeção
          </Button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Carregando...</div>
      ) : filtradas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Nenhuma inspeção cadastrada</p>
            <p className="text-slate-400 text-sm mt-1">Crie um checklist primeiro e depois inicie uma inspeção</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtradas.map(insp => {
            const pct = insp.total_itens > 0 ? Math.round((insp.total_inspecionados / insp.total_itens) * 100) : 0;
            return (
              <Card key={insp.id} className="p-4 hover:border-amber-300 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">{insp.checklist_nome || 'Inspeção'}</span>
                      <Badge className={statusColor[insp.status] || 'bg-slate-100 text-slate-700'}>{insp.status}</Badge>
                    </div>
                    <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                      {insp.data_inspecao && <span>{format(new Date(insp.data_inspecao + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })}</span>}
                      {insp.local && <span>📍 {insp.local}</span>}
                      {insp.responsavel_nome && <span>👤 {insp.responsavel_nome}</span>}
                    </div>
                    {insp.total_itens > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">{insp.total_inspecionados}/{insp.total_itens}</span>
                        {insp.total_conformes > 0 && <span className="text-xs text-green-600">✓ {insp.total_conformes}</span>}
                        {insp.total_nao_conformes > 0 && <span className="text-xs text-red-600">✗ {insp.total_nao_conformes}</span>}
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setInspecaoSelecionada(insp); setShowDetalhe(true); }}>
                        <Eye className="w-4 h-4 mr-2" />
                        {insp.status === 'Em Andamento' ? 'Continuar Inspeção' : 'Visualizar'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setInspecaoSelecionada(insp); setShowNovaInspecao(true); }}>
                        <Edit2 className="w-4 h-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(insp)} className="text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modais */}
      <ChecklistManagerModal
        open={showChecklistManager}
        onOpenChange={setShowChecklistManager}
        empresaAtiva={empresaAtiva}
      />

      <InspecaoCampoFormModal
        open={showNovaInspecao}
        onOpenChange={setShowNovaInspecao}
        empresaAtiva={empresaAtiva}
        inspecao={inspecaoSelecionada}
        onSaved={() => { loadInspecoes(); setShowNovaInspecao(false); }}
      />

      {inspecaoSelecionada && showDetalhe && (
        <InspecaoCampoDetalheModal
          open={showDetalhe}
          onOpenChange={(v) => { setShowDetalhe(v); if (!v) setInspecaoSelecionada(null); }}
          inspecao={inspecaoSelecionada}
          empresaAtiva={empresaAtiva}
          onSaved={() => { loadInspecoes(); }}
        />
      )}
    </div>
  );
}