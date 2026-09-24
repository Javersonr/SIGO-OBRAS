import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Download } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { resolveStorageUrl } from "@/api/sigoClient";
import { ehBase44 } from "@/lib/anexo-ref";
import VisualizadorDocumentoModal from "./VisualizadorDocumentoModal";

/** Baixa o documento: `url` é a referência "bucket/caminho" (ou URL legada). */
async function baixarDocumento(doc) {
  const nome = doc.nome_arquivo || doc.nome || "documento";
  const url = await resolveStorageUrl(doc.url);
  if (!url) {
    toast.error(
      ehBase44(doc.url) ? "Arquivo do sistema antigo, indisponível" : "Arquivo indisponível"
    );
    return;
  }
  // URL assinada do Storage aceita &download= (força o download sem sair da página)
  const assinada = /[?&]token=/.test(url);
  const link = document.createElement("a");
  link.href = assinada ? `${url}&download=${encodeURIComponent(nome)}` : url;
  link.download = nome;
  if (!assinada) {
    link.target = "_blank";
    link.rel = "noopener";
  }
  link.click();
}

export default function HistoricoDocumentosModal({ open, onOpenChange, documentos, tipo }) {
  const [documentoSelecionado, setDocumentoSelecionado] = useState(null);
  const [showVisualizador, setShowVisualizador] = useState(false);

  const getTituloTipo = (tipo) => {
    const titulos = {
      documentos_obrigatorios: "Documentos Obrigatórios",
      documentos_rh: "Documentos de RH",
      epis: "Lista de EPIs",
      ferramentas: "Lista de Ferramentas",
      autorizacao_formal: "Autorização Formal",
      direito_recusa: "Direito de Recusa",
      ordem_servicos: "Ordem de Serviços",
    };
    return titulos[tipo] || "Documentos";
  };

  const handleVisualizarDocumento = (doc) => {
    setDocumentoSelecionado(doc);
    setShowVisualizador(true);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto" data-fullscreen-modal>
        <SheetHeader className="mb-6">
          <SheetTitle>Histórico de {getTituloTipo(tipo)}</SheetTitle>
        </SheetHeader>

        {!documentos || documentos.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">Nenhum documento encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documentos.map((doc, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-amber-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <FileText className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{doc.nome}</p>
                      {doc.data_upload && (
                        <p className="text-xs text-slate-500 mt-1">
                          Enviado em {format(new Date(doc.data_upload), "dd/MM/yyyy HH:mm")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleVisualizarDocumento(doc)}
                      title="Visualizar"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => baixarDocumento(doc)}
                      title="Baixar"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>

      <VisualizadorDocumentoModal
        open={showVisualizador}
        onOpenChange={setShowVisualizador}
        documento={documentoSelecionado}
      />
    </Sheet>
  );
}
