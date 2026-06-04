import React from "react";
import { sigo } from "@/api/sigoClient";
import { safeUrl } from "@/lib/safe-url";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Upload, Eye, Trash2, Clock, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import AlertaDocumentosRH from "./AlertaDocumentosRH";

export default function RHTab({
  funcionarioForm,
  setFuncionarioForm,
  handleAutoSave,
  analisarDocumentoComIA,
  setAnalisandoDoc,
  setAlertaIA,
  setShowSelecionarFuncionarioModal,
  setShowUploadDocumentosRHZip,
  setDocumentoVisualizacao,
  setShowVisualizadorDocumento,
  documentosRHAnalisados,
  uploadingDoc,
  setUploadingDoc,
  handleAbrirHistorico,
  verificarDocumentosCompletos,
  handleBaixarTodosAnexos,
}) {
  const renderDocList = (fieldKey, titleNum, title, onHistorico) => {
    const docs = safeParseJSON(funcionarioForm[fieldKey], []);
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {titleNum}. {title}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAbrirHistorico(fieldKey)}
              title="Histórico"
            >
              <Clock className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {docs.map((doc, idx) => {
              const anexos = doc.anexos
                ? Array.isArray(doc.anexos)
                  ? doc.anexos
                  : [doc.anexos]
                : [];
              const temAnexo = anexos.length > 0;
              return (
                <div key={idx} className="p-3 bg-slate-50 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1">
                      <input type="checkbox" checked={temAnexo} readOnly className="w-4 h-4" />
                      <span className={cn("text-sm font-medium", temAnexo && "text-green-700")}>
                        {doc.nome}
                      </span>
                    </div>
                    <label>
                      <Button variant="outline" size="sm" disabled={uploadingDoc} asChild>
                        <span className="text-xs gap-1">
                          <Upload className="w-3 h-3" />
                          {temAnexo ? "Adicionar mais" : "Anexar"}
                        </span>
                      </Button>
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploadingDoc}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingDoc(true);
                          try {
                            const { file_url } = await sigo.integrations.Core.UploadFile({ file });
                            const allDocs = safeParseJSON(funcionarioForm[fieldKey], []);
                            const extensao = file.name.split(".").pop();
                            if (!allDocs[idx].anexos) allDocs[idx].anexos = [];
                            const num = allDocs[idx].anexos.length + 1;
                            const nomeCom = num > 1 ? `${num} - ${doc.nome}` : doc.nome;
                            allDocs[idx].anexos.push({
                              url: file_url,
                              nome_arquivo: `${funcionarioForm.nome_completo} - ${nomeCom}.${extensao}`,
                              data_upload: new Date().toISOString(),
                            });
                            const novoForm = {
                              ...funcionarioForm,
                              [fieldKey]: JSON.stringify(allDocs),
                            };
                            setFuncionarioForm(novoForm);
                            toast.success("Documento anexado");
                            handleAutoSave(novoForm);
                            setAnalisandoDoc({ idx, tipo: fieldKey });
                            setAlertaIA(null);
                            analisarDocumentoComIA(file_url, doc.nome).finally(() =>
                              setAnalisandoDoc(null)
                            );
                            if (
                              fieldKey === "documentos_rh_estruturados" &&
                              doc.nome === "Registro de Empregado"
                            ) {
                              setShowSelecionarFuncionarioModal(true);
                            }
                          } catch {
                            toast.error("Erro ao anexar documento");
                          } finally {
                            setUploadingDoc(false);
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {temAnexo && (
                    <div className="ml-6 space-y-1 pt-2 border-t">
                      {anexos.map((anexo, anexoIdx) => (
                        <div
                          key={anexoIdx}
                          className="flex items-center justify-between p-2 bg-white rounded hover:bg-slate-100"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <FileText className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <a
                              href={safeUrl(anexo.url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-700 truncate"
                            >
                              {anexo.nome_arquivo}
                            </a>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Visualizar"
                              onClick={() => {
                                setDocumentoVisualizacao({
                                  nome: anexo.nome_arquivo,
                                  url: anexo.url,
                                });
                                setShowVisualizadorDocumento(true);
                              }}
                            >
                              <Eye className="w-3 h-3 text-blue-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Excluir"
                              onClick={() => {
                                const allDocs = safeParseJSON(funcionarioForm[fieldKey], []);
                                allDocs[idx].anexos.splice(anexoIdx, 1);
                                const novoForm = {
                                  ...funcionarioForm,
                                  [fieldKey]: JSON.stringify(allDocs),
                                };
                                setFuncionarioForm(novoForm);
                                handleAutoSave(novoForm);
                                toast.success("Documento excluído");
                              }}
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {fieldKey === "documentos_rh_estruturados" && verificarDocumentosCompletos() && (
            <div className="mt-4 pt-4 border-t">
              <Button
                onClick={handleBaixarTodosAnexos}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Exportar Todos os Documentos + Formulário (ZIP)
              </Button>
              <p className="text-xs text-slate-500 text-center mt-2">
                Todos os documentos obrigatórios foram anexados
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto">
      <div className="mb-4">
        <Button
          onClick={() => setShowUploadDocumentosRHZip(true)}
          variant="outline"
          className="w-full border-blue-400 text-blue-700 hover:bg-blue-50"
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload em Lote (ZIP) - IA Verificará os Documentos
        </Button>
      </div>
      <AlertaDocumentosRH documentosRH={documentosRHAnalisados} />
      {renderDocList("documentos_obrigatorios", 1, "Documentos Obrigatórios para Contratação")}
      {safeParseJSON(funcionarioForm.dependentes, []).some(
        (dep) => dep.comprovante_escolar_url
      ) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Comprovantes de Matrícula Escolar - Dependentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {safeParseJSON(funcionarioForm.dependentes, []).map(
                (dep, depIdx) =>
                  dep.comprovante_escolar_url && (
                    <div
                      key={depIdx}
                      className="flex items-center justify-between p-2 bg-slate-50 rounded hover:bg-slate-100"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <a
                          href={safeUrl(dep.comprovante_escolar_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm hover:text-amber-600"
                        >
                          {dep.nome || `Dependente ${depIdx + 1}`} - Comprovante Escolar
                        </a>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.open(dep.comprovante_escolar_url, "_blank")}
                      >
                        <FileText className="w-4 h-4 text-blue-500" />
                      </Button>
                    </div>
                  )
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {renderDocList("documentos_rh_estruturados", 2, "Documentos de RH (Assinados)")}
      {renderDocList("documentos_demissionais", 3, "Documentos Demissionais")}
    </div>
  );
}
