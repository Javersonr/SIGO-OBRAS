import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Wrench,
  FileText,
  List,
  Upload,
  Eye,
  Trash2,
  History,
  ChevronUp,
  BookOpen,
} from "lucide-react";
import HistoricoDocumentosModal from "./HistoricoDocumentosModal";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const DOCUMENTOS = [
  {
    key: "ferramentais_anexos",
    label: "Lista de Ferramentas",
    icon: Wrench,
    onVisualizar: "onVisualizarFerramentas",
  },
  { key: "epis_anexos", label: "Lista de EPIs", icon: Shield, onVisualizar: "onVisualizarEPI" },
  {
    key: "autorizacao_formal_anexos",
    label: "Autorização Formal",
    icon: FileText,
    onVisualizar: "onVisualizarAutorizacaoFormal",
  },
  {
    key: "direito_recusa_anexos",
    label: "Direito de Recusa",
    icon: FileText,
    onVisualizar: "onVisualizarDireitoRecusa",
  },
  {
    key: "ordem_servicos_anexos",
    label: "Ordem de Serviço",
    icon: List,
    onVisualizar: "onVisualizarOrdemServico",
  },
];

const LABEL_MAP = {
  ferramentais_anexos: "Lista de Ferramentas",
  epis_anexos: "Lista de EPIs",
  autorizacao_formal_anexos: "Autorização Formal",
  direito_recusa_anexos: "Direito de Recusa",
  ordem_servicos_anexos: "Ordem de Serviço",
};

export default function DocumentosAssinadosTST({
  funcionarioForm,
  setFuncionarioForm,
  handleAutoSave,
  selectedFuncionario,
  uploadingDoc,
  setUploadingDoc,
  onVisualizarFerramentas,
  onVisualizarEPI,
  onVisualizarAutorizacaoFormal,
  onVisualizarDireitoRecusa,
  onVisualizarOrdemServico,
  empresaAtiva,
  user,
}) {
  const [expandido, setExpandido] = useState({});
  const [showHistoricoKey, setShowHistoricoKey] = useState(null);
  const [historicoData, setHistoricoData] = useState([]);
  const callbacks = {
    onVisualizarFerramentas,
    onVisualizarEPI,
    onVisualizarAutorizacaoFormal,
    onVisualizarDireitoRecusa,
    onVisualizarOrdemServico,
  };

  const abrirHistoricoCompleto = async (key) => {
    try {
      const registros = await sigo.entities.HistoricoDocumentoAssinado.filter({
        funcionario_id: selectedFuncionario?.id,
        tipo_documento: key,
      });
      const sorted = registros.sort((a, b) => new Date(b.data_upload) - new Date(a.data_upload));
      setHistoricoData(
        sorted.map((r) => ({ nome: r.nome_arquivo, url: r.url, data_upload: r.data_upload }))
      );
      setShowHistoricoKey(key);
    } catch {
      const local = getAnexos(key);
      setHistoricoData(local);
      setShowHistoricoKey(key);
    }
  };

  const getAnexos = (key) => {
    try {
      return JSON.parse(funcionarioForm[key] || "[]");
    } catch {
      return [];
    }
  };

  const handleUpload = async (e, key) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      const { file_url } = await sigo.integrations.Core.UploadFile({ file });
      const agora = new Date().toISOString();
      const anexos = getAnexos(key);
      anexos.push({ nome: file.name, url: file_url, data_upload: agora });
      const novoForm = { ...funcionarioForm, [key]: JSON.stringify(anexos) };
      setFuncionarioForm(novoForm);
      handleAutoSave(novoForm);
      if (selectedFuncionario) {
        await sigo.entities.Funcionario.update(selectedFuncionario.id, {
          [key]: JSON.stringify(anexos),
        });
      }
      // Salvar no histórico permanente
      if (selectedFuncionario && empresaAtiva) {
        await sigo.entities.HistoricoDocumentoAssinado.create({
          empresa_id: empresaAtiva.id,
          funcionario_id: selectedFuncionario.id,
          funcionario_nome: funcionarioForm.nome_completo,
          tipo_documento: key,
          label_documento: LABEL_MAP[key] || key,
          nome_arquivo: file.name,
          url: file_url,
          data_upload: agora,
          usuario_email: user?.email || "",
          usuario_nome: user?.full_name || "",
        });
      }
      toast.success("Documento assinado anexado");
      setExpandido((prev) => ({ ...prev, [key]: true }));
    } catch {
      toast.error("Erro ao anexar documento");
    } finally {
      setUploadingDoc(false);
    }
    e.target.value = "";
  };

  const handleRemover = async (key, idx) => {
    if (!confirm("Remover este documento?")) return;
    const anexos = getAnexos(key);
    anexos.splice(idx, 1);
    const novoForm = { ...funcionarioForm, [key]: JSON.stringify(anexos) };
    setFuncionarioForm(novoForm);
    handleAutoSave(novoForm);
    if (selectedFuncionario) {
      await sigo.entities.Funcionario.update(selectedFuncionario.id, {
        [key]: JSON.stringify(anexos),
      });
    }
    toast.success("Documento removido");
  };

  return (
    <>
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <h4 className="font-medium text-slate-800 mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            Documentos de Segurança
          </h4>
          <div className="space-y-2">
            {DOCUMENTOS.map(({ key, label, icon: Icon, onVisualizar }) => {
              const anexos = getAnexos(key);
              const aberto = expandido[key];

              return (
                <div
                  key={key}
                  className="bg-white rounded-lg border border-slate-200 overflow-hidden"
                >
                  {/* Linha principal */}
                  <div className="flex items-center gap-2 p-2.5">
                    <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span className="flex-1 text-sm font-medium text-slate-700 truncate">
                      {label}
                    </span>

                    {/* Badge com contagem */}
                    {anexos.length > 0 && (
                      <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">
                        {anexos.length} assinado{anexos.length > 1 ? "s" : ""}
                      </Badge>
                    )}

                    {/* Botão Visualizar/Imprimir */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      title="Visualizar / Imprimir"
                      onClick={callbacks[onVisualizar]}
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-500" />
                    </Button>

                    {/* Botão Anexar Assinado */}
                    <label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0"
                        title="Anexar documento assinado"
                        disabled={uploadingDoc}
                        asChild
                      >
                        <span>
                          <Upload className="w-3.5 h-3.5 text-green-600" />
                        </span>
                      </Button>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleUpload(e, key)}
                        disabled={uploadingDoc}
                      />
                    </label>

                    {/* Botão Expandir histórico local */}
                    {anexos.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0"
                        title="Ver histórico"
                        onClick={() => setExpandido((prev) => ({ ...prev, [key]: !aberto }))}
                      >
                        {aberto ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                        ) : (
                          <History className="w-3.5 h-3.5 text-slate-500" />
                        )}
                      </Button>
                    )}

                    {/* Botão Histórico Permanente */}
                    {selectedFuncionario && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0"
                        title="Histórico completo (permanente)"
                        onClick={() => abrirHistoricoCompleto(key)}
                      >
                        <BookOpen className="w-3.5 h-3.5 text-purple-500" />
                      </Button>
                    )}
                  </div>

                  {/* Histórico expandido */}
                  {aberto && anexos.length > 0 && (
                    <div className="border-t border-slate-100 px-2.5 pb-2.5 pt-2 space-y-1.5 bg-slate-50">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        Histórico de anexos
                      </p>
                      {anexos.map((anexo, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 bg-white rounded border border-slate-200 p-2"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 truncate">
                              {anexo.nome}
                            </p>
                            {anexo.data_upload && (
                              <p className="text-xs text-slate-400">
                                {format(new Date(anexo.data_upload), "dd/MM/yyyy 'às' HH:mm", {
                                  locale: ptBR,
                                })}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={() => window.open(anexo.url, "_blank")}
                            title="Visualizar arquivo"
                          >
                            <Eye className="w-3 h-3 text-blue-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={() => handleRemover(key, idx)}
                            title="Remover"
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <HistoricoDocumentosModal
        open={!!showHistoricoKey}
        onOpenChange={(v) => {
          if (!v) setShowHistoricoKey(null);
        }}
        documentos={historicoData}
        tipo={showHistoricoKey ? LABEL_MAP[showHistoricoKey] || showHistoricoKey : ""}
      />
    </>
  );
}
