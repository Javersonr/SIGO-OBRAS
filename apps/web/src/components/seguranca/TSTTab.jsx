import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Upload, Edit, Eye, X, FileText, CheckCircle2, PackageCheck } from "lucide-react";
import DocumentosAssinadosTST from "./DocumentosAssinadosTST";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import ImportarCertificadosTSTModal from "./ImportarCertificadosTSTModal";

export default function TSTTab({
  funcionarioForm,
  setFuncionarioForm,
  handleAutoSave,
  treinamentosDaFuncao,
  editandoDatasTreinamento,
  setEditandoDatasTreinamento,
  empresaAtiva,
  uploadingDoc,
  setUploadingDoc,
  selectedFuncionario,
  loadData,
  funcionarios,
  onAvancarFuncionario,
  setShowCertificadoAssinado: setShowCertificadoAssinadoProp,
  setTreinamentoAssinado: setTreinamentoAssinadoProp,
  setShowVisualizarCertificado: setShowVisualizarCertificadoProp,
  setCertificadoSelecionado: setCertificadoSelecionadoProp,
  // Callbacks para abrir modais de documentos de segurança
  onVisualizarFerramentas,
  onVisualizarEPI,
  onVisualizarAutorizacaoFormal,
  onVisualizarDireitoRecusa,
  onVisualizarOrdemServico,
  onSolicitarEntregaFerramentas,
  user,
}) {
  const [showImportarCertificados, setShowImportarCertificados] = useState(false);
  // Sempre usar props externas (modais gerenciados pelo pai para evitar Sheet aninhado)
  const setShowCertificadoAssinado = setShowCertificadoAssinadoProp;
  const setTreinamentoAssinado = setTreinamentoAssinadoProp;

  const setCertificadoSelecionado = setCertificadoSelecionadoProp;
  const setShowVisualizarCertificado = setShowVisualizarCertificadoProp;

  const handleAbrirCertificado = (treinamento) => {
    setCertificadoSelecionado(treinamento);
    setShowVisualizarCertificado(true);
  };

  const handleAbrirAnexoAssinado = (treinamento) => {
    console.log("[TSTTab] handleAbrirAnexoAssinado chamado", {
      treinamentoId: treinamento?.id,
      treinamentoNome: treinamento?.nome,
      setTreinamentoAssinadoPropExiste: typeof setTreinamentoAssinado,
      setShowCertificadoAssinadoPropExiste: typeof setShowCertificadoAssinado,
    });
    setTreinamentoAssinado(treinamento);
    console.log(
      "[TSTTab] setTreinamentoAssinado chamado, agora chamando setShowCertificadoAssinado(true)"
    );
    setShowCertificadoAssinado(true);
    console.log("[TSTTab] setShowCertificadoAssinado(true) chamado");
  };

  const handleSalvarAnexos = async (novosAnexos) => {
    const novoForm = { ...funcionarioForm, treinamentos_anexos: JSON.stringify(novosAnexos) };
    setFuncionarioForm(novoForm);
    handleAutoSave(novoForm);
    // Persistir no banco se já existe funcionário salvo
    if (selectedFuncionario) {
      await sigo.entities.Funcionario.update(selectedFuncionario.id, {
        treinamentos_anexos: JSON.stringify(novosAnexos),
      });
    }
  };

  const handleDatasExtraidas = async (treinamentoId, camposAtualizados) => {
    try {
      const updateData = {};
      if (camposAtualizados.data_inicio) updateData.data_inicio = camposAtualizados.data_inicio;
      if (camposAtualizados.data_fim) updateData.data_fim = camposAtualizados.data_fim;
      if (camposAtualizados.aproveitamento)
        updateData.aproveitamento = parseInt(camposAtualizados.aproveitamento);

      if (Object.keys(updateData).length > 0) {
        const result = await sigo.entities.Treinamento.update(treinamentoId, updateData);
        toast.success("Datas atualizadas automaticamente do certificado");

        // Atualizar estado local
        const updated = treinamentosDaFuncao.find((t) => t.id === treinamentoId);
        if (updated) {
          updated.data_inicio = result.data_inicio;
          updated.data_fim = result.data_fim;
          updated.aproveitamento = result.aproveitamento;
        }

        loadData && loadData();
      }
    } catch (error) {
      console.error("Erro ao atualizar datas:", error);
    }
  };

  const getAnexosDeTreinamento = (treinamentoId) => {
    const todos = JSON.parse(funcionarioForm.treinamentos_anexos || "[]");
    return todos.filter((a) => a.treinamento_id === treinamentoId);
  };

  const funcionarioParaCertificado = {
    nome_completo: funcionarioForm.nome_completo,
    cpf: funcionarioForm.cpf,
  };

  return (
    <div className="space-y-4 mt-4 pb-4">
      {/* Botões de ação no topo */}
      <div className="flex justify-between items-center gap-2 flex-wrap">
        {onSolicitarEntregaFerramentas && funcionarioForm.funcao_id && (
          <Button
            size="sm"
            onClick={onSolicitarEntregaFerramentas}
            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
          >
            <PackageCheck className="w-4 h-4" />
            Solicitar Entrega de Ferramentas/EPIs
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-blue-400 text-blue-700 hover:bg-blue-50 ml-auto"
          onClick={() => setShowImportarCertificados(true)}
        >
          <Upload className="w-4 h-4" />
          Importar Certificados Assinados (IA)
        </Button>
      </div>

      {/* Documentos de Segurança com Anexos e Histórico */}
      <DocumentosAssinadosTST
        funcionarioForm={funcionarioForm}
        setFuncionarioForm={setFuncionarioForm}
        handleAutoSave={handleAutoSave}
        selectedFuncionario={selectedFuncionario}
        uploadingDoc={uploadingDoc}
        setUploadingDoc={setUploadingDoc}
        onVisualizarFerramentas={onVisualizarFerramentas}
        onVisualizarEPI={onVisualizarEPI}
        onVisualizarAutorizacaoFormal={onVisualizarAutorizacaoFormal}
        onVisualizarDireitoRecusa={onVisualizarDireitoRecusa}
        onVisualizarOrdemServico={onVisualizarOrdemServico}
        empresaAtiva={empresaAtiva}
        user={user}
      />

      {/* Treinamento Extra */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-slate-800">Adicionar Treinamento Extra</h4>
              <p className="text-xs text-slate-600 mt-1">
                Anexe certificados de cursos não obrigatórios na função
              </p>
            </div>
            <label>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-400 hover:bg-amber-100"
                disabled={uploadingDoc}
                asChild
              >
                <span className="gap-2">
                  <Plus className="w-4 h-4" />
                  {uploadingDoc ? "Enviando..." : "Adicionar"}
                </span>
              </Button>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const nomeArquivo = prompt(
                    "Nome do treinamento/diploma:",
                    file.name.replace(/\.[^/.]+$/, "")
                  );
                  if (!nomeArquivo) {
                    e.target.value = "";
                    return;
                  }
                  setUploadingDoc(true);
                  try {
                    const { file_url } = await sigo.integrations.Core.UploadFile({ file });
                    const anexos = JSON.parse(funcionarioForm.treinamentos_anexos || "[]");
                    anexos.push({
                      nome: nomeArquivo,
                      url: file_url,
                      treinamento_id: null,
                      treinamento_nome: nomeArquivo,
                      tipo: "extra",
                      data_upload: new Date().toISOString(),
                    });
                    const novoForm = {
                      ...funcionarioForm,
                      treinamentos_anexos: JSON.stringify(anexos),
                    };
                    setFuncionarioForm(novoForm);
                    handleAutoSave(novoForm);
                    toast.success("Treinamento extra anexado");
                  } catch {
                    toast.error("Erro ao anexar");
                  } finally {
                    setUploadingDoc(false);
                  }
                  e.target.value = "";
                }}
                disabled={uploadingDoc}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Extras anexados */}
      {JSON.parse(funcionarioForm.treinamentos_anexos || "[]").filter(
        (a) => !a.treinamento_id || a.tipo === "extra"
      ).length > 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-green-800">Treinamentos Extras Anexados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {JSON.parse(funcionarioForm.treinamentos_anexos || "[]")
              .filter((a) => !a.treinamento_id || a.tipo === "extra")
              .map((anexo, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-white rounded-lg border border-green-200"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{anexo.nome}</p>
                      <p className="text-xs text-slate-500">
                        {anexo.data_upload ? format(new Date(anexo.data_upload), "dd/MM/yyyy") : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => window.open(anexo.url, "_blank")}
                    >
                      <Eye className="w-3 h-3 text-blue-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        const all = JSON.parse(funcionarioForm.treinamentos_anexos || "[]");
                        const extras = all.filter((a) => !a.treinamento_id || a.tipo === "extra");
                        const toRemove = extras[idx];
                        const novos = all.filter((a) => a !== toRemove);
                        const novoForm = {
                          ...funcionarioForm,
                          treinamentos_anexos: JSON.stringify(novos),
                        };
                        setFuncionarioForm(novoForm);
                        handleAutoSave(novoForm);
                        toast.success("Treinamento extra removido");
                      }}
                    >
                      <X className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Treinamentos obrigatórios */}
      {!funcionarioForm.funcao_id ? (
        <div className="text-center py-8 bg-slate-50 rounded-lg">
          <p className="text-sm text-slate-500">
            Selecione uma função na aba "Dados Pessoais" para ver os treinamentos obrigatórios
          </p>
        </div>
      ) : treinamentosDaFuncao.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 rounded-lg">
          <p className="text-sm text-slate-500">
            Nenhum treinamento obrigatório cadastrado para esta função
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Cadastre treinamentos em Configurações → Funções
          </p>
        </div>
      ) : (
        <>
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-slate-700 mb-3">
              Treinamentos Obrigatórios da Função
            </h4>
          </div>
          <div className="space-y-3">
            {treinamentosDaFuncao.map((treinamento) => {
              const anexosDeste = getAnexosDeTreinamento(treinamento.id);
              const temAnexo = anexosDeste.length > 0;

              return (
                <Card key={treinamento.id} className="border-slate-200">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {/* Header do treinamento */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-800">{treinamento.nome}</h4>
                          {treinamento.codigo && (
                            <p className="text-xs text-slate-500">Código: {treinamento.codigo}</p>
                          )}
                          {treinamento.carga_horaria && (
                            <p className="text-xs text-slate-500">
                              Carga Horária: {treinamento.carga_horaria}h
                            </p>
                          )}

                          {/* Datas salvas */}
                          {!editandoDatasTreinamento[treinamento.id] &&
                            (treinamento.data_inicio || treinamento.data_fim) && (
                              <div className="mt-2">
                                {treinamento.data_inicio && treinamento.data_fim && (
                                  <p className="text-xs text-green-700 font-medium">
                                    📅{" "}
                                    {format(
                                      new Date(treinamento.data_inicio + "T00:00:00"),
                                      "dd/MM/yyyy"
                                    )}{" "}
                                    a{" "}
                                    {format(
                                      new Date(treinamento.data_fim + "T00:00:00"),
                                      "dd/MM/yyyy"
                                    )}
                                  </p>
                                )}
                                {treinamento.aproveitamento != null && (
                                  <p className="text-xs text-green-700 font-medium">
                                    📊 Aproveitamento: {treinamento.aproveitamento}%
                                  </p>
                                )}
                              </div>
                            )}
                        </div>

                        {/* Ações */}
                        <div className="flex gap-1 ml-2">
                          {/* Editar datas */}
                          {editandoDatasTreinamento[treinamento.id] ? (
                            <>
                              <input
                                type="date"
                                value={editandoDatasTreinamento[treinamento.id]?.data_inicio || ""}
                                onChange={(e) =>
                                  setEditandoDatasTreinamento({
                                    ...editandoDatasTreinamento,
                                    [treinamento.id]: {
                                      ...editandoDatasTreinamento[treinamento.id],
                                      data_inicio: e.target.value,
                                    },
                                  })
                                }
                                className="text-xs px-2 py-1 border rounded"
                              />
                              <input
                                type="date"
                                value={editandoDatasTreinamento[treinamento.id]?.data_fim || ""}
                                onChange={(e) =>
                                  setEditandoDatasTreinamento({
                                    ...editandoDatasTreinamento,
                                    [treinamento.id]: {
                                      ...editandoDatasTreinamento[treinamento.id],
                                      data_fim: e.target.value,
                                    },
                                  })
                                }
                                className="text-xs px-2 py-1 border rounded"
                              />
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={
                                  editandoDatasTreinamento[treinamento.id]?.aproveitamento !==
                                    undefined &&
                                  editandoDatasTreinamento[treinamento.id]?.aproveitamento !== ""
                                    ? editandoDatasTreinamento[treinamento.id].aproveitamento
                                    : ""
                                }
                                onChange={(e) =>
                                  setEditandoDatasTreinamento({
                                    ...editandoDatasTreinamento,
                                    [treinamento.id]: {
                                      ...editandoDatasTreinamento[treinamento.id],
                                      aproveitamento: e.target.value,
                                    },
                                  })
                                }
                                className="text-xs px-2 py-1 border rounded w-16"
                                placeholder="%"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={async () => {
                                  try {
                                    const data_inicio =
                                      editandoDatasTreinamento[treinamento.id].data_inicio;
                                    const data_fim =
                                      editandoDatasTreinamento[treinamento.id].data_fim;
                                    const aproveitamento =
                                      editandoDatasTreinamento[treinamento.id].aproveitamento !== ""
                                        ? parseInt(
                                            editandoDatasTreinamento[treinamento.id].aproveitamento
                                          )
                                        : undefined;

                                    console.log("📊 Salvando treinamento:", {
                                      id: treinamento.id,
                                      data_inicio,
                                      data_fim,
                                      aproveitamento,
                                    });

                                    const updateData = {};
                                    if (data_inicio !== undefined && data_inicio !== null)
                                      updateData.data_inicio = data_inicio || null;
                                    if (data_fim !== undefined && data_fim !== null)
                                      updateData.data_fim = data_fim || null;
                                    if (aproveitamento !== undefined)
                                      updateData.aproveitamento = aproveitamento;

                                    const result = await sigo.entities.Treinamento.update(
                                      treinamento.id,
                                      updateData
                                    );
                                    console.log("✅ Resposta do servidor:", result);
                                    toast.success("Dados salvos com sucesso");

                                    // Atualizar o estado local do treinamento
                                    treinamento.data_inicio = result.data_inicio;
                                    treinamento.data_fim = result.data_fim;
                                    treinamento.aproveitamento = result.aproveitamento;

                                    const novos = { ...editandoDatasTreinamento };
                                    delete novos[treinamento.id];
                                    setEditandoDatasTreinamento(novos);

                                    loadData && loadData();
                                  } catch (error) {
                                    console.error("❌ Erro ao salvar treinamento:", error);
                                    toast.error(
                                      `Erro ao salvar: ${error.message || "Erro desconhecido"}`
                                    );
                                  }
                                }}
                              >
                                Salvar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const n = { ...editandoDatasTreinamento };
                                  delete n[treinamento.id];
                                  setEditandoDatasTreinamento(n);
                                }}
                              >
                                <X className="w-3 h-3 text-red-500" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setEditandoDatasTreinamento({
                                  ...editandoDatasTreinamento,
                                  [treinamento.id]: {
                                    data_inicio: treinamento.data_inicio || "",
                                    data_fim: treinamento.data_fim || "",
                                    aproveitamento: treinamento.aproveitamento || "100",
                                  },
                                })
                              }
                              title="Editar datas"
                            >
                              <Edit className="w-3 h-3 text-blue-500" />
                            </Button>
                          )}

                          {/* Visualizar certificado gerado */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAbrirCertificado(treinamento)}
                            title="Visualizar certificado"
                          >
                            <Eye className="w-3 h-3" />
                          </Button>

                          {/* Botão verde: certificados assinados */}
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              temAnexo
                                ? "border-green-500 bg-green-50 hover:bg-green-100 text-green-700"
                                : "border-slate-300 hover:bg-slate-50"
                            )}
                            onClick={() => handleAbrirAnexoAssinado(treinamento)}
                            title="Gerenciar certificados assinados"
                          >
                            <CheckCircle2
                              className={cn(
                                "w-3.5 h-3.5",
                                temAnexo ? "text-green-600" : "text-slate-400"
                              )}
                            />
                            {temAnexo && (
                              <span className="ml-1 text-xs font-medium">{anexosDeste.length}</span>
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Resumo de certificados assinados */}
                      {temAnexo && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                          <p className="text-xs font-medium text-green-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {anexosDeste.length} certificado(s) assinado(s)
                            {anexosDeste[anexosDeste.length - 1]?.data_upload
                              ? ` • último em ${format(new Date(anexosDeste[anexosDeste.length - 1].data_upload), "dd/MM/yyyy", { locale: ptBR })}`
                              : ""}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* VisualizarCertificadoModal e CertificadoAssinadoModal são gerenciados pelo pai para evitar Dialog/Sheet aninhado */}

      {/* Modal Importar Certificados em Lote */}
      {showImportarCertificados && (
        <ImportarCertificadosTSTModal
          open={showImportarCertificados}
          onOpenChange={setShowImportarCertificados}
          funcionarios={funcionarios || []}
          funcionarioAtual={
            selectedFuncionario || {
              id: funcionarioForm.id,
              nome_completo: funcionarioForm.nome_completo,
              funcao_nome: funcionarioForm.funcao_nome,
              funcao_id: funcionarioForm.funcao_id,
              ativo: true,
            }
          }
          empresaAtiva={empresaAtiva}
          onCertificadosImportados={(funcId, novosAnexos) => {
            if (funcId === (selectedFuncionario?.id || funcionarioForm.id)) {
              const novoForm = {
                ...funcionarioForm,
                treinamentos_anexos: JSON.stringify(novosAnexos),
              };
              setFuncionarioForm(novoForm);
              handleAutoSave(novoForm);
              loadData && loadData();
              toast.success("Certificados importados com sucesso!");
            }
          }}
          onAvancarFuncionario={onAvancarFuncionario}
        />
      )}
    </div>
  );
}
