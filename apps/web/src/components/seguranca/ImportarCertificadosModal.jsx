import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle2, AlertCircle, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import VisualizarCertificadoModal from "./VisualizarCertificadoModal";

export default function ImportarCertificadosModal({ open, onOpenChange, empresaAtiva }) {
  const [arquivo, setArquivo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [treinamentoSelecionado, setTreinamentoSelecionado] = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArquivo(file);
    setLoading(true);
    setResultado(null);

    try {
      // Upload do ZIP primeiro
      const { file_url } = await sigo.integrations.Core.UploadFile({ file });

      // Enviar URL para função backend
      const response = await sigo.functions.invoke("processarCertificadosComIA", {
        zipUrl: file_url,
        empresaId: empresaAtiva.id,
      });

      setResultado(response.data);

      if (response.data.sucesso > 0) {
        toast.success(`${response.data.sucesso} certificado(s) importado(s) com sucesso!`);
      }
      if (response.data.erros_count > 0) {
        toast.warning(`${response.data.erros_count} erro(s) durante a importação`);
      }
    } catch (error) {
      console.error("Erro ao processar:", error);
      toast.error("Erro ao processar certificados");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col w-full sm:max-w-2xl"
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            Importar Certificados com IA
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {/* Instruções */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">Como funciona:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>1. Prepare um ZIP contendo os certificados dos funcionários</li>
              <li>2. Organize as pastas como: Nome_Funcionario/certificado_*.pdf</li>
              <li>3. A IA analisará os certificados automaticamente</li>
              <li>4. Os dados serão vinculados aos funcionários e treinamentos</li>
            </ul>
          </div>

          {/* Upload */}
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition">
            <label htmlFor="zip-upload" className="cursor-pointer flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">
                Clique ou arraste o ZIP aqui
              </span>
              <span className="text-xs text-slate-500">Máximo: 100MB</span>
              <input
                id="zip-upload"
                type="file"
                accept=".zip"
                onChange={handleUpload}
                disabled={loading}
                className="hidden"
              />
            </label>
          </div>

          {arquivo && !loading && (
            <p className="text-sm text-slate-600">
              ✓ Arquivo: <span className="font-medium">{arquivo.name}</span>
            </p>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 text-amber-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Processando certificados com IA...</span>
            </div>
          )}

          {/* Resultados */}
          {resultado && (
            <div className="space-y-4">
              {/* Resumo */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-2xl font-bold text-green-600">{resultado.sucesso}</p>
                  <p className="text-xs text-green-700">Importados com sucesso</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-2xl font-bold text-red-600">{resultado.erros_count}</p>
                  <p className="text-xs text-red-700">Erros encontrados</p>
                </div>
              </div>

              {/* Processados */}
              {resultado.processados.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Certificados Importados
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {resultado.processados.map((item, idx) => (
                      <div
                        key={idx}
                        className="text-xs bg-green-50 border border-green-200 rounded p-3 cursor-pointer hover:bg-green-100 transition flex items-start justify-between gap-2"
                        onClick={() => setTreinamentoSelecionado(item)}
                      >
                        <div className="flex-1">
                          <p className="font-medium text-green-900 mb-1">✓ {item.funcionario}</p>
                          <div className="ml-3 space-y-1">
                            <p className="text-green-700">
                              <strong>Treinamento:</strong> {item.treinamento}
                            </p>
                            {item.data_inicio && (
                              <p className="text-green-600">📅 {item.data_inicio}</p>
                            )}
                            {item.data_fim && <p className="text-green-600">→ {item.data_fim}</p>}
                            <p className="text-green-600">📄 {item.arquivo}</p>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-green-600 hover:bg-green-200 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTreinamentoSelecionado(item);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Erros */}
              {resultado.erros.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    Erros
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {resultado.erros.map((item, idx) => (
                      <div
                        key={idx}
                        className="text-xs bg-red-50 border border-red-200 rounded p-2"
                      >
                        <p className="font-medium text-red-900">{item.arquivo}</p>
                        <p className="text-red-700">{item.motivo}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="border-t p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {resultado && (
            <Button
              onClick={() => {
                setArquivo(null);
                setResultado(null);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Importar Outro ZIP
            </Button>
          )}
        </SheetFooter>

        {/* Modal de visualização */}
        {treinamentoSelecionado && (
          <VisualizarCertificadoModal
            open={!!treinamentoSelecionado}
            onOpenChange={(isOpen) => {
              if (!isOpen) setTreinamentoSelecionado(null);
            }}
            treinamento={treinamentoSelecionado}
            funcionario={{ nome_completo: treinamentoSelecionado.funcionario || "", cpf: "" }}
            empresaAtiva={empresaAtiva}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
