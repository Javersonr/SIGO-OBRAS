import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, CheckCircle, AlertCircle, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function ImportarTreinamentosZip({
  open,
  onOpenChange,
  funcionario,
  empresaAtiva,
  onSave,
}) {
  const [loading, setLoading] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [treinamentosExtraidos, setTreinamentosExtraidos] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const fileInputRef = React.useRef(null);

  const handleZipUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessando(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = event.target.result.split(",")[1];

          const response = await base44.functions.invoke("processarPDFsComGemini", {
            zipBase64: base64,
            funcionarioId: funcionario.id,
            empresaId: empresaAtiva.id,
          });

          if (response.data.sucesso) {
            setTreinamentosExtraidos(response.data.treinamentos);
            const novosSelecionados = new Set();
            response.data.treinamentos.forEach((_, idx) => {
              if (!response.data.treinamentos[idx].erro) {
                novosSelecionados.add(idx);
              }
            });
            setSelecionados(novosSelecionados);
            toast.success(`${response.data.totalPDFs} PDFs processados`);
          } else {
            toast.error(response.data.error || "Erro ao processar ZIP");
          }
        } catch (error) {
          console.error("Erro:", error);
          toast.error("Erro ao processar ZIP");
        } finally {
          setProcessando(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao ler arquivo");
      setProcessando(false);
    }
  };

  const handleSalvarTreinamentos = async () => {
    setLoading(true);
    try {
      const treinamentosParaSalvar = treinamentosExtraidos.filter(
        (_, idx) => selecionados.has(idx) && !treinamentosExtraidos[idx].erro
      );

      for (const treino of treinamentosParaSalvar) {
        await base44.entities.Treinamento.create({
          empresa_id: empresaAtiva.id,
          funcao_id: funcionario.funcao_id,
          nome: treino.nome_treinamento || "Treinamento",
          codigo: treino.codigo || "",
          carga_horaria: treino.carga_horaria || 0,
          conteudo_programatico: treino.conteudo_programatico || "",
          validade_meses: treino.validade_meses || 12,
          obrigatorio: true,
          data_inicio: treino.data_inicio || "",
          data_fim: treino.data_fim || "",
          aluno_nome: treino.aluno_nome || funcionario.nome_completo,
          instrutor_nome: treino.instrutor_nome || "",
          arquivo_pdf_url: treino.pdf_url,
          ativo: true,
        });
      }

      toast.success(`${treinamentosParaSalvar.length} treinamento(s) importado(s)`);
      onSave();
      onOpenChange(false);
      setTreinamentosExtraidos([]);
      setSelecionados(new Set());
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao salvar treinamentos");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelecao = (idx) => {
    const novo = new Set(selecionados);
    if (novo.has(idx)) {
      novo.delete(idx);
    } else {
      novo.add(idx);
    }
    setSelecionados(novo);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col w-full">
        <SheetHeader className="p-6 border-b sticky top-0 bg-white z-10">
          <SheetTitle>Importar Treinamentos em PDF</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Upload Zone */}
          {treinamentosExtraidos.length === 0 && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleZipUpload}
                className="hidden"
              />

              {processando ? (
                <div className="space-y-3">
                  <Loader2 className="w-12 h-12 text-blue-500 mx-auto animate-spin" />
                  <p className="text-sm text-slate-600">Processando PDFs com IA...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="w-12 h-12 text-slate-400 mx-auto" />
                  <div>
                    <p className="font-semibold text-slate-700">Clique para selecionar ZIP</p>
                    <p className="text-sm text-slate-500">ou arraste o arquivo aqui</p>
                  </div>
                  <p className="text-xs text-slate-400">
                    ZIP com pasta única contendo PDFs dos treinamentos
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Resultados */}
          {treinamentosExtraidos.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Treinamentos Extraídos</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTreinamentosExtraidos([]);
                    setSelecionados(new Set());
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Novo ZIP
                </Button>
              </div>

              <div className="space-y-3">
                {treinamentosExtraidos.map((treino, idx) => (
                  <Card
                    key={idx}
                    className={selecionados.has(idx) ? "border-blue-500 bg-blue-50" : ""}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <input
                          type="checkbox"
                          checked={selecionados.has(idx)}
                          onChange={() => toggleSelecao(idx)}
                          disabled={!!treino.erro}
                          className="w-5 h-5 rounded cursor-pointer mt-1"
                        />

                        <div className="flex-1 space-y-2">
                          {treino.erro ? (
                            <div className="flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-red-500 mt-1 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-slate-700">
                                  {treino.arquivo_original}
                                </p>
                                <p className="text-xs text-red-600">{treino.erro}</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-semibold text-slate-800">
                                    {treino.nome_treinamento || "Treinamento"}
                                  </p>
                                  {treino.codigo && (
                                    <Badge variant="outline" className="text-xs mt-1">
                                      {treino.codigo}
                                    </Badge>
                                  )}
                                </div>
                                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                              </div>

                              <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
                                {treino.aluno_nome && (
                                  <div>
                                    <span className="font-medium">Aluno:</span> {treino.aluno_nome}
                                  </div>
                                )}
                                {treino.carga_horaria && (
                                  <div>
                                    <span className="font-medium">Carga Horária:</span>{" "}
                                    {treino.carga_horaria}h
                                  </div>
                                )}
                                {treino.data_inicio && (
                                  <div>
                                    <span className="font-medium">Data:</span> {treino.data_inicio}
                                  </div>
                                )}
                                {treino.instrutor_nome && (
                                  <div>
                                    <span className="font-medium">Instrutor:</span>{" "}
                                    {treino.instrutor_nome}
                                  </div>
                                )}
                              </div>

                              {treino.conteudo_programatico && (
                                <p className="text-xs text-slate-600 italic line-clamp-2">
                                  {treino.conteudo_programatico}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleSalvarTreinamentos}
                  disabled={loading || selecionados.size === 0}
                  className="flex-1"
                >
                  {loading ? "Salvando..." : <Plus className="w-4 h-4 mr-2" />}
                  Adicionar{" "}
                  {selecionados.size > 0 ? `${selecionados.size} Treinamento(s)` : "Treinamentos"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
