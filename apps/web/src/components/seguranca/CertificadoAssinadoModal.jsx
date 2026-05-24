import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Trash2, Eye, CheckCircle2, Loader2, AlertCircle, X, Download } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export default function CertificadoAssinadoModal({ open, onOpenChange, treinamento, funcionario, onSave, onDatasExtraidas }) {
  const [uploading, setUploading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [viewerAnexoUrl, setViewerAnexoUrl] = useState(null);
  const [analisando, setAnalisando] = useState(false);
  const [analiseResultado, setAnaliseResultado] = useState(null);
  const fileInputRef = React.useRef(null);
  const toastIdRef = React.useRef(null);

  React.useEffect(() => {
    console.log('[CertificadoAssinadoModal] open mudou para:', open, '| treinamento:', treinamento?.id, treinamento?.nome, '| funcionario:', funcionario?.nome_completo);
    if (!open) {
      if (toastIdRef.current) { toast.dismiss(toastIdRef.current); toastIdRef.current = null; }
      setAnalisando(false);
      setAnaliseResultado(null);
      setUploading(false);
      setViewerUrl(null);
      setViewerAnexoUrl(null);
    }
  }, [open]);

  const todosAnexos = treinamento && funcionario ? JSON.parse(funcionario.treinamentos_anexos || '[]') : [];
  const anexosDeste = treinamento ? todosAnexos.filter(a => String(a.treinamento_id) === String(treinamento.id)) : [];
  console.log('[CertificadoAssinadoModal] render | open:', open, '| treinamento:', treinamento?.id, '| funcionario:', funcionario?.nome_completo, '| todosAnexos:', todosAnexos.length, '| anexosDeste:', anexosDeste.length);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setAnaliseResultado(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      toastIdRef.current = toast.loading('Analisando certificado com IA...');
      setAnalisando(true);

      let resultData = { status: 'incompleto', mensagem: 'Análise não disponível. Certificado salvo.', campos_atualizados: {} };
      try {
        const result = await base44.functions.invoke('analisarCertificadoComGemini', {
          file_url,
          treinamento_id: treinamento.id,
          funcionario_id: funcionario.id
        });
        resultData = result.data || result;
      } catch (analysisError) {
        console.warn('Análise IA falhou, salvando certificado sem análise:', analysisError.message);
      }
      setAnaliseResultado(resultData);

      const novosAnexos = [
        ...todosAnexos,
        { nome: `${treinamento.nome} - ${file.name}`, url: file_url, treinamento_id: treinamento.id, treinamento_nome: treinamento.nome, data_upload: new Date().toISOString(), analise_gemini: resultData }
      ];
      await onSave(novosAnexos);

      if (resultData.campos_atualizados && onDatasExtraidas) {
        onDatasExtraidas(treinamento.id, resultData.campos_atualizados);
      }

      if (toastIdRef.current) toast.dismiss(toastIdRef.current);
      if (resultData.status === 'válido') toast.success(`✅ Certificado anexado! ${resultData.mensagem}`);
      else if (resultData.status === 'incompleto') toast.warning(`⚠️ Certificado incompleto. ${resultData.mensagem}`);
      else toast.error(`❌ ${resultData.mensagem || 'Erro ao analisar certificado'}`);
    } catch (error) {
      if (toastIdRef.current) toast.dismiss(toastIdRef.current);
      toast.error('Erro ao processar certificado: ' + (error.message || 'tente novamente'));
      setAnaliseResultado({ status: 'erro', mensagem: error.message });
    } finally {
      setUploading(false);
      setAnalisando(false);
      toastIdRef.current = null;
    }
    e.target.value = '';
  };

  const handleRemover = async (idx) => {
    if (!confirm('Remover este certificado assinado?')) return;
    let count = 0;
    const novosAnexos = todosAnexos.filter(a => {
      if (String(a.treinamento_id) === String(treinamento.id)) {
        if (count === idx) { count++; return false; }
        count++;
      }
      return true;
    });
    await onSave(novosAnexos);
    toast.success('Certificado removido');
  };

  return (
    <>
      {/* Viewer de arquivo - FORA do Dialog principal para evitar aninhamento */}
      <Dialog open={!!viewerUrl} onOpenChange={(val) => { if (!val) { setViewerUrl(null); setViewerAnexoUrl(null); } }}>
        <DialogContent className="p-0 flex flex-col max-w-5xl w-full h-[90vh]" aria-describedby={undefined}>
          <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
            <span className="font-medium text-sm">Visualizar Certificado</span>
            {viewerAnexoUrl && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { const l = document.createElement('a'); l.href = viewerAnexoUrl; l.download = 'certificado'; l.click(); }} title="Baixar">
                <Download className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe src={viewerUrl} className="w-full h-full border-0" title="Visualizar Certificado" />
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal principal - usa Dialog, não Sheet, para não conflitar com Sheet pai */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="p-0 flex flex-col h-[90vh] max-w-2xl w-full" aria-describedby={undefined}>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleUpload}
            disabled={uploading || analisando}
          />

          {/* Header */}
          <div className="px-6 py-4 border-b flex-shrink-0 flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-base font-semibold">
                Certificados Assinados — {treinamento?.nome}
              </h2>
              <p className="text-sm text-slate-500 mt-1">{funcionario?.nome_completo}</p>
            </div>
            <button onClick={() => onOpenChange(false)} className="p-2 hover:bg-slate-100 rounded-lg ml-4">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {analiseResultado && (
              <div className={`p-4 rounded-lg border-l-4 ${
                analiseResultado.status === 'válido' ? 'bg-green-50 border-green-500' :
                analiseResultado.status === 'incompleto' ? 'bg-yellow-50 border-yellow-500' :
                'bg-red-50 border-red-500'
              }`}>
                <div className="flex gap-3">
                  {analiseResultado.status === 'válido' && <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />}
                  {(analiseResultado.status === 'incompleto' || analiseResultado.status === 'erro') && <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${analiseResultado.status === 'incompleto' ? 'text-yellow-600' : 'text-red-600'}`} />}
                  <div className="flex-1">
                    <p className={`font-semibold text-sm ${analiseResultado.status === 'válido' ? 'text-green-800' : analiseResultado.status === 'incompleto' ? 'text-yellow-800' : 'text-red-800'}`}>
                      {analiseResultado.status === 'válido' && '✅ Certificado Válido'}
                      {analiseResultado.status === 'incompleto' && '⚠️ Certificado Incompleto'}
                      {analiseResultado.status === 'erro' && '❌ Erro na Análise'}
                    </p>
                    <p className="text-xs mt-1">{analiseResultado.mensagem}</p>
                    {analiseResultado.campos_atualizados && Object.keys(analiseResultado.campos_atualizados).length > 0 && (
                      <div className="mt-2 text-xs space-y-1">
                        <p className="font-medium">Campos atualizados automaticamente:</p>
                        {analiseResultado.campos_atualizados.data_inicio && <p>• Data de início: {analiseResultado.campos_atualizados.data_inicio}</p>}
                        {analiseResultado.campos_atualizados.data_fim && <p>• Data de término: {analiseResultado.campos_atualizados.data_fim}</p>}
                        {analiseResultado.campos_atualizados.aproveitamento && <p>• Aproveitamento: {analiseResultado.campos_atualizados.aproveitamento}%</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="w-full border-dashed border-2 border-green-400 text-green-700 hover:bg-green-50 h-12 gap-2"
              disabled={uploading || analisando}
            >
              {analisando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Enviando...' : analisando ? 'Analisando...' : 'Anexar Novo Certificado Assinado'}
            </Button>

            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                Histórico de Certificados Assinados ({anexosDeste.length})
              </h4>
              {anexosDeste.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-lg border border-dashed">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">Nenhum certificado assinado anexado</p>
                  <p className="text-xs text-slate-400 mt-1">Clique no botão acima para adicionar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {anexosDeste.map((anexo, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white border border-green-200 rounded-lg hover:bg-green-50 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{anexo.nome}</p>
                          <p className="text-xs text-slate-500">
                            Anexado em {anexo.data_upload ? format(new Date(anexo.data_upload), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '-'}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 ml-3 flex-shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setViewerUrl(`https://docs.google.com/viewer?url=${encodeURIComponent(anexo.url)}&embedded=true`); setViewerAnexoUrl(anexo.url); }} title="Visualizar">
                          <Eye className="w-3.5 h-3.5 text-blue-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemover(idx)} title="Remover">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t flex-shrink-0">
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}