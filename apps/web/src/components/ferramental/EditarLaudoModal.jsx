import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeUrl } from "@/lib/safe-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, Download, FileText, Trash2, Eye, Clock } from "lucide-react";

export default function EditarLaudoModal({ open, onClose, ferramenta, onSaved }) {
  const [form, setForm] = useState({
    numero_serie: "",
    numero_laudo: "",
    data_vencimento_laudo: "",
    laudo_url: "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  useEffect(() => {
    if (open && ferramenta) {
      setForm({
        numero_serie: ferramenta.numero_serie || "",
        numero_laudo: ferramenta.numero_laudo || "",
        data_vencimento_laudo: ferramenta.data_vencimento_laudo || "",
        laudo_url: ferramenta.laudo_url || "",
      });
      loadHistorico(ferramenta.id);
    }
  }, [open, ferramenta?.id]);

  const loadHistorico = async (ferramentaId) => {
    setLoadingHistorico(true);
    try {
      const laudos = await sigo.entities.LaudoFerramenta.filter(
        { ferramenta_id: ferramentaId },
        "-data_laudo"
      );
      setHistorico(laudos);
    } catch {
      setHistorico([]);
    } finally {
      setLoadingHistorico(false);
    }
  };

  const handleUploadLaudo = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await sigo.integrations.Core.UploadFile({ file });
      setForm((prev) => ({ ...prev, laudo_url: file_url }));
      toast.success("Arquivo enviado");
    } catch {
      toast.error("Erro ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!ferramenta?.id) return;
    setSaving(true);
    try {
      await sigo.entities.Ferramenta.update(ferramenta.id, {
        numero_serie: form.numero_serie,
        numero_laudo: form.numero_laudo,
        data_vencimento_laudo: form.data_vencimento_laudo,
        laudo_url: form.laudo_url,
      });

      // Se tiver laudo novo com número, salvar no histórico
      if (form.numero_laudo && form.laudo_url) {
        const jaExiste = historico.some(
          (h) => h.numero_laudo === form.numero_laudo && h.foto_laudo_url === form.laudo_url
        );
        if (!jaExiste) {
          await sigo.entities.LaudoFerramenta.create({
            ferramenta_id: ferramenta.id,
            empresa_id: ferramenta.empresa_id,
            ferramenta_codigo: ferramenta.codigo,
            ferramenta_descricao: ferramenta.descricao,
            numero_laudo: form.numero_laudo,
            data_vencimento: form.data_vencimento_laudo,
            data_laudo: new Date().toISOString().split("T")[0],
            foto_laudo_url: form.laudo_url,
            resultado: "Aprovado",
            instituicao_responsavel: "Não informado",
          });
        }
      }

      toast.success("Ferramenta atualizada");
      onSaved?.();
      onClose();
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const isVencido = form.data_vencimento_laudo && new Date(form.data_vencimento_laudo) < new Date();
  const isVencendoBreve =
    form.data_vencimento_laudo &&
    !isVencido &&
    new Date(form.data_vencimento_laudo) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  if (!ferramenta) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Laudo / Série — {ferramenta.descricao}</DialogTitle>
          <p className="text-xs text-slate-500 font-mono">{ferramenta.codigo}</p>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Número de Série */}
          <div>
            <Label>Número de Série</Label>
            <Input
              value={form.numero_serie}
              onChange={(e) => setForm((p) => ({ ...p, numero_serie: e.target.value }))}
              placeholder="Ex: SN-12345"
              className="mt-1.5"
            />
          </div>

          {/* Laudo */}
          <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
            <p className="font-semibold text-sm text-slate-700">📄 Laudo Técnico</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Número do Laudo</Label>
                <Input
                  value={form.numero_laudo}
                  onChange={(e) => setForm((p) => ({ ...p, numero_laudo: e.target.value }))}
                  placeholder="Ex: LAU-2024-001"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={form.data_vencimento_laudo}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, data_vencimento_laudo: e.target.value }))
                  }
                  className="mt-1.5"
                />
              </div>
            </div>

            {form.data_vencimento_laudo && (
              <Badge
                className={
                  isVencido
                    ? "bg-red-100 text-red-700"
                    : isVencendoBreve
                      ? "bg-amber-100 text-amber-700"
                      : "bg-green-100 text-green-700"
                }
              >
                {isVencido ? "⚠️ Vencido" : isVencendoBreve ? "⏰ Vence em breve" : "✓ Válido"}
                {" · "}
                {new Date(form.data_vencimento_laudo + "T00:00:00").toLocaleDateString("pt-BR")}
              </Badge>
            )}

            {/* Arquivo do laudo */}
            {form.laudo_url ? (
              <div className="flex items-center gap-2 p-2 border rounded bg-white">
                <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-sm text-slate-700 flex-1 truncate">Laudo anexado</span>
                <a
                  href={safeUrl(form.laudo_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700"
                  title="Visualizar"
                >
                  <Eye className="w-4 h-4" />
                </a>
                <a
                  href={safeUrl(form.laudo_url)}
                  download
                  className="text-slate-500 hover:text-slate-700"
                  title="Baixar"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setForm((p) => ({ ...p, laudo_url: "" }))}
                  className="text-red-500 hover:text-red-600"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label
                className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${uploading ? "opacity-50 cursor-not-allowed" : "border-slate-300 hover:border-slate-400 hover:bg-white"}`}
              >
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => handleUploadLaudo(e.target.files?.[0])}
                />
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-slate-600">Enviando...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-600">Anexar novo laudo (PDF/imagem)</span>
                  </>
                )}
              </label>
            )}
          </div>

          {/* Histórico de Laudos */}
          <div>
            <p className="font-semibold text-sm text-slate-700 mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Histórico de Laudos ({historico.length})
            </p>
            {loadingHistorico ? (
              <p className="text-xs text-slate-400">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Nenhum laudo no histórico ainda.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {historico.map((h) => {
                  const venc = h.data_vencimento ? new Date(h.data_vencimento) < new Date() : false;
                  return (
                    <div
                      key={h.id}
                      className="flex items-center justify-between p-2 border rounded bg-white text-xs gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-mono font-semibold text-slate-700">
                          {h.numero_laudo || "S/N"}
                        </span>
                        {h.data_laudo && (
                          <span className="text-slate-400 ml-2">
                            emissão:{" "}
                            {new Date(h.data_laudo + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        )}
                        {h.data_vencimento && (
                          <span className={`ml-2 ${venc ? "text-red-600" : "text-green-600"}`}>
                            · venc:{" "}
                            {new Date(h.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        )}
                        {h.resultado && (
                          <Badge
                            className={`ml-2 text-xs ${h.resultado === "Aprovado" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                          >
                            {h.resultado}
                          </Badge>
                        )}
                      </div>
                      {h.foto_laudo_url && (
                        <div className="flex gap-1 flex-shrink-0">
                          <a
                            href={safeUrl(h.foto_laudo_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Visualizar"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                          <a
                            href={safeUrl(h.foto_laudo_url)}
                            download
                            className="p-1 text-slate-500 hover:bg-slate-50 rounded"
                            title="Baixar"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-slate-900 hover:bg-slate-800"
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
