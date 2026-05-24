import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import JSZip from 'jszip';
import { gerarCertificadoDoc } from './certificadoLayout';



const gerarCertificadoPDF = async (treinamento, funcionario, empresaAtiva) => {
  return await gerarCertificadoDoc({ treinamento, funcionario, empresaAtiva });
};

export default function GerarCertificadosLoteModal({ open, onOpenChange, funcionarios, empresaAtiva }) {
  const [treinamentos, setTreinamentos] = useState([]);
  const [selecionados, setSelecionados] = useState({});
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!open || !empresaAtiva?.id) return;
    const carregarTreinamentos = async () => {
      setCarregando(true);
      try {
        const todos = await base44.entities.Treinamento.filter({ empresa_id: empresaAtiva.id, ativo: true });
        setTreinamentos(todos);
      } catch {
        toast.error('Erro ao carregar treinamentos');
      } finally {
        setCarregando(false);
      }
    };
    carregarTreinamentos();
    setSelecionados({});
    setResultado(null);
  }, [open, empresaAtiva?.id]);

  const itens = [];
  funcionarios?.forEach(f => {
    const treinamentosDaFuncao = treinamentos.filter(t => t.funcao_id === f.funcao_id || t.usar_como_modelo);
    treinamentosDaFuncao.forEach(t => {
      itens.push({ id: `${f.id}_${t.id}`, funcionario: f, treinamento: t });
    });
  });

  const handleSelectAll = (checked) => {
    const novos = {};
    if (checked) itens.forEach(i => novos[i.id] = true);
    setSelecionados(novos);
  };

  const handleGerarCertificados = async () => {
    const itensParaGerar = itens.filter(i => selecionados[i.id]);
    if (itensParaGerar.length === 0) { toast.error('Selecione pelo menos um certificado'); return; }

    setGerando(true);
    setResultado(null);
    const resultados = { sucesso: 0, erro: 0, detalhes: [] };

    try {
      const zip = new JSZip();

      for (const item of itensParaGerar) {
        try {
          const doc = await gerarCertificadoPDF(item.treinamento, item.funcionario, empresaAtiva);
          const pdfBlob = doc.output('blob');
          const nomeFuncionario = item.funcionario.nome_completo.replace(/[^a-z0-9]/gi, '_');
          const nomeTreinamento = item.treinamento.nome.replace(/[^a-z0-9]/gi, '_');
          zip.file(`${nomeFuncionario}_${nomeTreinamento}.pdf`, pdfBlob);
          resultados.sucesso++;
          resultados.detalhes.push({ funcionario: item.funcionario.nome_completo, treinamento: item.treinamento.nome, status: 'success' });
        } catch (err) {
          resultados.erro++;
          resultados.detalhes.push({ funcionario: item.funcionario.nome_completo, treinamento: item.treinamento.nome, status: 'error', mensagem: err.message });
        }
      }

      setResultado(resultados);

      if (resultados.sucesso > 0) {
        if (resultados.sucesso === 1) {
          // Um único: baixar direto como PDF
          const unico = itensParaGerar.find((_, i) => resultados.detalhes[i]?.status === 'success');
          if (unico) {
            const doc = await gerarCertificadoPDF(unico.treinamento, unico.funcionario, empresaAtiva);
            doc.save(`certificado_${unico.funcionario.nome_completo.replace(/[^a-z0-9]/gi, '_')}.pdf`);
          }
        } else {
          const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement('a');
          a.href = url; a.download = `certificados_lote_${format(new Date(), 'yyyy-MM-dd')}.zip`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        toast.success(`${resultados.sucesso} certificado(s) gerado(s)`);
      }
      if (resultados.erro > 0) toast.warning(`${resultados.erro} erro(s) ao gerar`);
    } catch (error) {
      toast.error('Erro ao gerar certificados: ' + error.message);
    } finally {
      setGerando(false);
    }
  };

  const totalSelecionados = Object.values(selecionados).filter(Boolean).length;
  const todosSelecionados = itens.length > 0 && totalSelecionados === itens.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Gerar Certificados em Lote</DialogTitle>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            <span className="ml-2 text-sm text-slate-500">Carregando treinamentos...</span>
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto flex-1">
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border">
              <Checkbox checked={todosSelecionados} onCheckedChange={handleSelectAll} disabled={gerando || itens.length === 0} />
              <span className="text-sm font-medium">Selecionar Todos ({totalSelecionados}/{itens.length})</span>
            </div>

            {resultado && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-semibold text-blue-900 mb-2">Resultado:</p>
                <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
                  {resultado.detalhes.map((d, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {d.status === 'success' ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <AlertCircle className="w-3 h-3 text-red-600" />}
                      <span>{d.funcionario} - {d.treinamento}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-y-auto max-h-64 space-y-2 border rounded-lg p-3">
              {itens.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Nenhuma combinação funcionário/treinamento encontrada</p>
              ) : (
                itens.map(item => (
                  <div key={item.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded">
                    <Checkbox checked={!!selecionados[item.id]} onCheckedChange={(checked) => {
                      const novos = { ...selecionados };
                      if (checked) novos[item.id] = true; else delete novos[item.id];
                      setSelecionados(novos);
                    }} disabled={gerando} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.funcionario.nome_completo}</p>
                      <p className="text-xs text-slate-500 truncate">{item.treinamento.nome}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>Cancelar</Button>
              <Button onClick={handleGerarCertificados} disabled={gerando || totalSelecionados === 0} className="gap-2">
                {gerando ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</> : <><Download className="w-4 h-4" /> Gerar ({totalSelecionados})</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}