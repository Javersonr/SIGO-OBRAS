import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, CheckCircle2, AlertCircle, Loader2, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function ImportarCertificadosTSTModal({
  open,
  onOpenChange,
  funcionarios, // lista completa de funcionários
  funcionarioAtual, // funcionário aberto no modal
  empresaAtiva,
  onCertificadosImportados, // callback(funcionarioId, anexos) para salvar no form
  onAvancarFuncionario, // callback(funcionario) para trocar o funcionário ativo
}) {
  const [fase, setFase] = useState("upload"); // 'upload' | 'processando' | 'resultado' | 'concluido'
  const [zipFile, setZipFile] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [filaFuncionarios, setFilaFuncionarios] = useState([]);
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [resultadoAtual, setResultadoAtual] = useState(null);
  const [resumoGeral, setResumoGeral] = useState([]);
  const [zipUrl, setZipUrl] = useState(null);
  const fileInputRef = React.useRef(null);

  const handleZipSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setZipFile(file);
  };

  const handleIniciarImportacao = async () => {
    if (!zipFile) return;

    setProcessando(true);
    setFase("processando");

    try {
      // Upload do ZIP uma única vez
      toast.info("Enviando arquivo ZIP...");
      const { file_url } = await sigo.integrations.Core.UploadFile({ file: zipFile });
      setZipUrl(file_url);

      // Montar fila: começa pelo funcionário atual, depois os demais (em ordem)
      const outrosFuncionarios = funcionarios.filter(
        (f) => f.id !== funcionarioAtual.id && f.ativo !== false
      );
      const fila = [funcionarioAtual, ...outrosFuncionarios];
      setFilaFuncionarios(fila);
      setIndiceAtual(0);

      // Processar primeiro funcionário
      await processarFuncionario(file_url, fila, 0, []);
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao enviar ZIP");
      setFase("upload");
      setProcessando(false);
    }
  };

  const processarFuncionario = async (url, fila, idx, resumoAcumulado) => {
    const func = fila[idx];
    setIndiceAtual(idx);
    setResultadoAtual(null);

    try {
      const response = await sigo.functions.invoke("importarCertificadosFuncionario", {
        zipUrl: url,
        funcionarioId: func.id,
        empresaId: empresaAtiva.id,
      });

      const data = response.data;
      setResultadoAtual(data);
      setFase("resultado");
      setProcessando(false);

      const novoResumo = [...resumoAcumulado, { funcionario: func.nome_completo, ...data }];
      setResumoGeral(novoResumo);
    } catch (error) {
      const errData = {
        sucesso: false,
        funcionario_nome: func.nome_completo,
        processados: 0,
        erros_count: 1,
        resultados: [],
        erros: [{ arquivo: "-", motivo: error.message }],
      };
      setResultadoAtual(errData);
      setFase("resultado");
      setProcessando(false);
      const novoResumo = [...resumoAcumulado, { funcionario: func.nome_completo, ...errData }];
      setResumoGeral(novoResumo);
    }
  };

  const handleConfirmarEAvancar = async () => {
    // Salvar certificados encontrados no funcionário atual
    if (resultadoAtual?.resultados?.length > 0) {
      const func = filaFuncionarios[indiceAtual];

      // Buscar anexos existentes do funcionário
      let anexosExistentes = [];
      try {
        const funcAtualizado = await sigo.entities.Funcionario.filter({ id: func.id });
        if (funcAtualizado.length > 0) {
          anexosExistentes = safeParseJSON(funcAtualizado[0].treinamentos_anexos, []);
        }
      } catch {}

      // Adicionar novos anexos
      const novosAnexos = resultadoAtual.resultados.map((r) => ({
        treinamento_id: r.treinamento_id,
        treinamento_nome: r.match_nome || r.treinamento_nome,
        nome: r.treinamento_nome,
        url: r.file_url,
        tipo: "assinado_importado",
        data_upload: new Date().toISOString(),
        data_inicio: r.data_inicio || "",
        data_fim: r.data_fim || "",
        arquivo_original: r.arquivo,
      }));

      // Mesclar (substituir existentes do mesmo treinamento)
      for (const novo of novosAnexos) {
        const idx = anexosExistentes.findIndex(
          (a) => a.treinamento_id && a.treinamento_id === novo.treinamento_id
        );
        if (idx >= 0) {
          anexosExistentes[idx] = { ...anexosExistentes[idx], ...novo };
        } else {
          anexosExistentes.push(novo);
        }
      }

      // Salvar no banco
      await sigo.entities.Funcionario.update(func.id, {
        treinamentos_anexos: JSON.stringify(anexosExistentes),
      });

      // Se é o funcionário atual no modal, atualizar o form
      if (func.id === funcionarioAtual.id) {
        onCertificadosImportados && onCertificadosImportados(func.id, anexosExistentes);
      }
    }

    // Avançar para próximo
    const proximo = indiceAtual + 1;
    if (proximo >= filaFuncionarios.length) {
      // Concluído
      setFase("concluido");
      return;
    }

    // Trocar funcionário no modal pai
    const proximoFunc = filaFuncionarios[proximo];
    onAvancarFuncionario && onAvancarFuncionario(proximoFunc);

    // Processar próximo
    setProcessando(true);
    setFase("processando");
    await processarFuncionario(zipUrl, filaFuncionarios, proximo, resumoGeral);
  };

  const handlePularFuncionario = async () => {
    const proximo = indiceAtual + 1;
    if (proximo >= filaFuncionarios.length) {
      setFase("concluido");
      return;
    }
    const proximoFunc = filaFuncionarios[proximo];
    onAvancarFuncionario && onAvancarFuncionario(proximoFunc);
    setProcessando(true);
    setFase("processando");
    await processarFuncionario(zipUrl, filaFuncionarios, proximo, resumoGeral);
  };

  const handleFechar = () => {
    setFase("upload");
    setZipFile(null);
    setZipUrl(null);
    setResultadoAtual(null);
    setFilaFuncionarios([]);
    setIndiceAtual(0);
    setResumoGeral([]);
    setProcessando(false);
    onOpenChange(false);
  };

  const funcAtual = filaFuncionarios[indiceAtual];
  const progresso =
    filaFuncionarios.length > 0
      ? Math.round(((indiceAtual + (fase === "resultado" ? 1 : 0)) / filaFuncionarios.length) * 100)
      : 0;

  return (
    <Dialog open={open} onOpenChange={handleFechar}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0" data-fullscreen-modal>
        <DialogHeader className="p-5 border-b sticky top-0 bg-white z-10">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Upload className="w-5 h-5 text-blue-600" />
            Importar Certificados Assinados com IA
          </DialogTitle>
          {fase !== "upload" && fase !== "concluido" && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>
                  Funcionário {indiceAtual + 1} de {filaFuncionarios.length}
                </span>
                <span>{progresso}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* FASE: UPLOAD */}
          {fase === "upload" && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-1">
                <p className="font-semibold">Como funciona:</p>
                <p>1. Prepare um ZIP com os certificados escaneados em PDF</p>
                <p>2. Organize em pastas por funcionário (opcional) ou coloque tudo na raiz</p>
                <p>3. A IA analisará cada PDF e casará com os treinamentos cadastrados</p>
                <p>4. Você confirma funcionário por funcionário antes de salvar</p>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  zipFile
                    ? "border-green-400 bg-green-50"
                    : "border-slate-300 hover:border-blue-400 hover:bg-blue-50"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleZipSelect}
                  className="hidden"
                />
                <Upload
                  className={cn(
                    "w-10 h-10 mx-auto mb-3",
                    zipFile ? "text-green-500" : "text-slate-400"
                  )}
                />
                {zipFile ? (
                  <div>
                    <p className="font-semibold text-green-700">{zipFile.name}</p>
                    <p className="text-xs text-green-600 mt-1">
                      {(zipFile.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-slate-700">
                      Clique para selecionar o arquivo ZIP
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Certificados escaneados em PDF</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleFechar} className="flex-1">
                  Cancelar
                </Button>
                <Button
                  onClick={handleIniciarImportacao}
                  disabled={!zipFile}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Iniciar Importação
                </Button>
              </div>
            </div>
          )}

          {/* FASE: PROCESSANDO */}
          {fase === "processando" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <div className="text-center">
                <p className="font-semibold text-slate-700">Processando com IA Gemini...</p>
                <p className="text-sm text-slate-500 mt-1">{funcAtual?.nome_completo}</p>
              </div>
            </div>
          )}

          {/* FASE: RESULTADO */}
          {fase === "resultado" && resultadoAtual && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
                  {funcAtual?.nome_completo?.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{funcAtual?.nome_completo}</p>
                  <p className="text-xs text-slate-500">{funcAtual?.funcao_nome || "Sem função"}</p>
                </div>
                <div className="ml-auto flex gap-2">
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    {resultadoAtual.processados} ok
                  </Badge>
                  {resultadoAtual.erros_count > 0 && (
                    <Badge className="bg-red-100 text-red-800 border-red-200">
                      {resultadoAtual.erros_count} erro(s)
                    </Badge>
                  )}
                </div>
              </div>

              {/* Certificados encontrados */}
              {resultadoAtual.resultados?.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Certificados identificados:</p>
                  {resultadoAtual.resultados.map((r, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg"
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {r.treinamento_nome}
                        </p>
                        {r.match_encontrado && (
                          <p className="text-xs text-green-700">✓ Casado com: {r.match_nome}</p>
                        )}
                        {!r.match_encontrado && (
                          <p className="text-xs text-amber-600">
                            ⚠ Sem correspondência - será salvo como extra
                          </p>
                        )}
                        <div className="flex gap-3 text-xs text-slate-500 mt-1">
                          {r.data_inicio && <span>Início: {r.data_inicio}</span>}
                          {r.data_fim && <span>Fim: {r.data_fim}</span>}
                          {r.carga_horaria && <span>{r.carga_horaria}h</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">📄 {r.arquivo}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Nenhum certificado encontrado para este funcionário neste ZIP
                </div>
              )}

              {/* Erros */}
              {resultadoAtual.erros?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-red-700">Erros:</p>
                  {resultadoAtual.erros.map((e, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-red-800">{e.arquivo}</p>
                        <p className="text-red-600">{e.motivo}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Restante na fila */}
              <p className="text-xs text-slate-500 text-center">
                {filaFuncionarios.length - indiceAtual - 1 > 0
                  ? `${filaFuncionarios.length - indiceAtual - 1} funcionário(s) restantes`
                  : "Último funcionário"}
              </p>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={handlePularFuncionario} className="flex-1">
                  {filaFuncionarios.length - indiceAtual - 1 > 0 ? "Pular" : "Encerrar"}
                </Button>
                <Button
                  onClick={handleConfirmarEAvancar}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
                  disabled={resultadoAtual.processados === 0}
                >
                  Confirmar e{" "}
                  {filaFuncionarios.length - indiceAtual - 1 > 0 ? (
                    <>
                      <ArrowRight className="w-4 h-4" /> Próximo
                    </>
                  ) : (
                    "Finalizar"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* FASE: CONCLUÍDO */}
          {fase === "concluido" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-6">
                <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
                <p className="text-lg font-bold text-slate-800">Importação Concluída!</p>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {resumoGeral.map((r, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border text-sm",
                      r.processados > 0
                        ? "bg-green-50 border-green-200"
                        : "bg-slate-50 border-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {r.processados > 0 ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <X className="w-4 h-4 text-slate-400" />
                      )}
                      <span className="font-medium truncate max-w-[180px]">{r.funcionario}</span>
                    </div>
                    <div className="flex gap-2">
                      {r.processados > 0 && (
                        <Badge className="bg-green-100 text-green-800 text-xs">
                          {r.processados} importado(s)
                        </Badge>
                      )}
                      {r.erros_count > 0 && (
                        <Badge className="bg-red-100 text-red-800 text-xs">
                          {r.erros_count} erro(s)
                        </Badge>
                      )}
                      {r.processados === 0 && r.erros_count === 0 && (
                        <span className="text-xs text-slate-400">Nenhum certificado</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleFechar}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
