import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Upload, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function UploadDocumentosRHZip({
  open,
  onOpenChange,
  funcionarioId,
  empresaId,
  onSuccess,
}) {
  const [arquivo, setArquivo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Por favor, selecione um arquivo ZIP");
      return;
    }

    setArquivo(file);
    setLoading(true);
    setResultado(null);

    try {
      // Upload do ZIP
      const { file_url } = await sigo.integrations.Core.UploadFile({ file });

      // Processar com IA
      const response = await sigo.functions.invoke("verificarDocumentosRH", {
        zipUrl: file_url,
        funcionarioId,
        empresaId,
      });

      setResultado(response.data);

      if (response.data.sucesso) {
        toast.success(`${response.data.total_processados} documento(s) analisado(s)`);
      }
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao processar documentos");
    } finally {
      setLoading(false);
    }
  };

  const handleAnexar = (tipoDocumento, docs) => {
    onSuccess({
      tipo: tipoDocumento,
      documentos: docs,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload de Documentos de RH em Lote</DialogTitle>
        </DialogHeader>

        {!resultado ? (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 mb-2">
                Prepare um arquivo ZIP contendo os documentos de RH organizados por tipo:
              </p>
              <ul className="text-sm text-blue-800 space-y-1 ml-4">
                <li>📁 ASO/ (Atestado de Saúde Ocupacional)</li>
                <li>📁 Exames/ (Exames Médicos)</li>
                <li>📁 Registro/ (Registro de Empregado)</li>
              </ul>
            </div>

            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition">
              <label
                htmlFor="zip-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
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
              <div className="flex items-center justify-center gap-2 text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Analisando documentos com IA...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {/* ASO */}
            {resultado.documentos.aso.length > 0 && (
              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-3">ASO - Atestado de Saúde Ocupacional</h3>
                <div className="space-y-2">
                  {resultado.documentos.aso.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-slate-50 rounded border flex items-start justify-between"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">{doc.arquivo}</p>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {doc.analise.data_documento && (
                            <Badge variant="outline" className="text-xs">
                              Data: {doc.analise.data_documento}
                            </Badge>
                          )}
                          {doc.analise.data_validade && (
                            <Badge variant="outline" className="text-xs">
                              Validade: {doc.analise.data_validade}
                            </Badge>
                          )}
                          <Badge
                            className={`text-xs ${doc.analise.confianca === "Alto" ? "bg-green-100 text-green-800" : doc.analise.confianca === "Médio" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}
                          >
                            {doc.analise.confianca}
                          </Badge>
                        </div>
                        {doc.analise.inconsistencias.length > 0 && (
                          <div className="mt-2 text-xs text-red-600">
                            <AlertCircle className="w-3 h-3 inline mr-1" />
                            {doc.analise.inconsistencias.join(", ")}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAnexar("aso", [doc])}
                      >
                        Anexar
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Exames */}
            {resultado.documentos.exames.length > 0 && (
              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-3">Exames Médicos</h3>
                <div className="space-y-2">
                  {resultado.documentos.exames.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-slate-50 rounded border flex items-start justify-between"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">{doc.arquivo}</p>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {doc.analise.data_documento && (
                            <Badge variant="outline" className="text-xs">
                              Data: {doc.analise.data_documento}
                            </Badge>
                          )}
                          <Badge
                            className={`text-xs ${doc.analise.confianca === "Alto" ? "bg-green-100 text-green-800" : doc.analise.confianca === "Médio" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}
                          >
                            {doc.analise.confianca}
                          </Badge>
                        </div>
                        {doc.analise.inconsistencias.length > 0 && (
                          <div className="mt-2 text-xs text-red-600">
                            <AlertCircle className="w-3 h-3 inline mr-1" />
                            {doc.analise.inconsistencias.join(", ")}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAnexar("exames", [doc])}
                      >
                        Anexar
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Registro */}
            {resultado.documentos.registro.length > 0 && (
              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-3">Registro de Empregado</h3>
                <div className="space-y-2">
                  {resultado.documentos.registro.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-slate-50 rounded border flex items-start justify-between"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">{doc.arquivo}</p>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {doc.analise.data_documento && (
                            <Badge variant="outline" className="text-xs">
                              Data: {doc.analise.data_documento}
                            </Badge>
                          )}
                          <Badge
                            className={`text-xs ${doc.analise.confianca === "Alto" ? "bg-green-100 text-green-800" : doc.analise.confianca === "Médio" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}
                          >
                            {doc.analise.confianca}
                          </Badge>
                        </div>
                        {doc.analise.inconsistencias.length > 0 && (
                          <div className="mt-2 text-xs text-red-600">
                            <AlertCircle className="w-3 h-3 inline mr-1" />
                            {doc.analise.inconsistencias.join(", ")}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAnexar("registro", [doc])}
                      >
                        Anexar
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resultado.total_erros > 0 && (
              <div className="border border-red-200 bg-red-50 rounded-lg p-3">
                <p className="text-sm text-red-800">
                  <AlertCircle className="w-4 h-4 inline mr-2" />
                  {resultado.total_erros} arquivo(s) não puderam ser processados
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setResultado(null);
              setArquivo(null);
            }}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
