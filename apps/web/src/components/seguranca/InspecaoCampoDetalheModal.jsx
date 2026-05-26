import React, { useState, useEffect, useRef } from "react";
import { sigo } from "@/api/sigoClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Camera,
  Check,
  X,
  Bot,
  AlertCircle,
  CheckCircle2,
  Image,
  Download,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function InspecaoCampoDetalheModal({
  open,
  onOpenChange,
  inspecao,
  empresaAtiva,
  onSaved,
}) {
  const [itens, setItens] = useState([]);
  const [saving, setSaving] = useState(false);
  const [analisando, setAnalisando] = useState(null); // index
  const [uploadingFoto, setUploadingFoto] = useState(null); // index
  const [filtroStatus, setFiltroStatus] = useState("todos"); // todos | pendente | conforme | nao_conforme
  const fileInputRefs = useRef({});

  useEffect(() => {
    if (open && inspecao?.itens_inspecao) {
      try {
        setItens(JSON.parse(inspecao.itens_inspecao));
      } catch {
        setItens([]);
      }
    }
  }, [open, inspecao?.id]);

  const handleUploadFoto = async (e, idx) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFoto(idx);
    try {
      const { file_url } = await sigo.integrations.Core.UploadFile({ file });
      const novosItens = [...itens];
      novosItens[idx] = {
        ...novosItens[idx],
        foto_inspecao_url: file_url,
        status: "pendente",
        resultado_ia: "",
      };
      setItens(novosItens);

      // Analisar com IA automaticamente se tiver foto de referência
      if (novosItens[idx].foto_referencia_url) {
        await analisarComIA(novosItens, idx, file_url);
      } else {
        await salvarItens(novosItens);
      }
    } catch {
      toast.error("Erro ao enviar foto");
    } finally {
      setUploadingFoto(null);
      if (e.target) e.target.value = "";
    }
  };

  const analisarComIA = async (novosItens, idx, foto_url) => {
    setAnalisando(idx);
    try {
      const item = novosItens[idx];
      const prompt = `Você é um inspetor de segurança do trabalho especialista. 
Compare as duas fotos:
1. Foto de REFERÊNCIA (estado esperado): ${item.foto_referencia_url}
2. Foto da INSPEÇÃO (estado atual): ${foto_url}

Item inspecionado: "${item.nome}"
${item.descricao ? `Descrição: ${item.descricao}` : ""}

Analise se o item na foto da inspeção está CONFORME (bom estado, seguindo os padrões de segurança) ou NÃO CONFORME (danificado, ausente, incorreto).

Responda SOMENTE em JSON: {"status": "conforme" ou "nao_conforme", "descricao": "breve justificativa em até 2 frases"}`;

      const resultado = await sigo.integrations.Core.InvokeLLM({
        prompt,
        file_urls: [item.foto_referencia_url, foto_url],
        response_json_schema: {
          type: "object",
          properties: {
            status: { type: "string" },
            descricao: { type: "string" },
          },
        },
      });

      const updated = [...novosItens];
      updated[idx] = {
        ...updated[idx],
        foto_inspecao_url: foto_url,
        status: resultado.status === "conforme" ? "conforme" : "nao_conforme",
        resultado_ia: resultado.descricao || "",
      };
      setItens(updated);
      await salvarItens(updated);
      toast.success(`IA: ${resultado.status === "conforme" ? "✓ Conforme" : "✗ Não Conforme"}`);
    } catch (e) {
      console.error(e);
      toast.error("Erro na análise IA");
      await salvarItens(novosItens);
    } finally {
      setAnalisando(null);
    }
  };

  const handleStatusManual = async (idx, status) => {
    const updated = [...itens];
    updated[idx] = { ...updated[idx], status };
    setItens(updated);
    await salvarItens(updated);
  };

  const handleObservacao = (idx, obs) => {
    const updated = [...itens];
    updated[idx] = { ...updated[idx], observacao: obs };
    setItens(updated);
  };

  const salvarItens = async (itensAtual) => {
    const total = itensAtual.length;
    const inspecionados = itensAtual.filter((i) => i.status !== "pendente").length;
    const conformes = itensAtual.filter((i) => i.status === "conforme").length;
    const naoConformes = itensAtual.filter((i) => i.status === "nao_conforme").length;
    const status =
      inspecionados === 0
        ? "Em Andamento"
        : naoConformes > 0
          ? "Não Conforme"
          : inspecionados === total
            ? "Concluída"
            : "Em Andamento";

    await sigo.entities.InspecaoCampo.update(inspecao.id, {
      itens_inspecao: JSON.stringify(itensAtual),
      total_itens: total,
      total_inspecionados: inspecionados,
      total_conformes: conformes,
      total_nao_conformes: naoConformes,
      status,
    });
    onSaved?.();
  };

  const handleSalvarObservacoes = async () => {
    setSaving(true);
    try {
      await salvarItens(itens);
      toast.success("Salvo");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = itens.map((item, i) => ({
      Nº: i + 1,
      Item: item.nome,
      Descrição: item.descricao || "",
      Obrigatório: item.obrigatorio ? "Sim" : "Não",
      Status:
        item.status === "conforme"
          ? "Conforme"
          : item.status === "nao_conforme"
            ? "Não Conforme"
            : "Pendente",
      "Análise IA": item.resultado_ia || "",
      Observação: item.observacao || "",
      "Foto Referência": item.foto_referencia_url || "",
      "Foto Inspeção": item.foto_inspecao_url || "",
    }));

    // Aba de resumo
    const resumo = [
      { Campo: "Checklist", Valor: inspecao.checklist_nome || "-" },
      {
        Campo: "Data",
        Valor: inspecao.data_inspecao
          ? format(new Date(inspecao.data_inspecao), "dd/MM/yyyy")
          : "-",
      },
      { Campo: "Local", Valor: inspecao.local || "-" },
      { Campo: "Responsável", Valor: inspecao.responsavel_nome || "-" },
      { Campo: "Status", Valor: inspecao.status || "-" },
      { Campo: "Total Itens", Valor: itens.length },
      { Campo: "Inspecionados", Valor: itens.filter((i) => i.status !== "pendente").length },
      { Campo: "Conformes", Valor: itens.filter((i) => i.status === "conforme").length },
      { Campo: "Não Conformes", Valor: itens.filter((i) => i.status === "nao_conforme").length },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Itens");
    XLSX.writeFile(
      wb,
      `inspecao_campo_${inspecao.id}_${new Date().toISOString().split("T")[0]}.xlsx`
    );
    toast.success("Excel exportado");
  };

  const handleExportPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text("Relatório de Inspeção de Campo", 14, 15);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(`Checklist: ${inspecao.checklist_nome || "-"}`, 14, 23);
    doc.text(
      `Data: ${inspecao.data_inspecao ? format(new Date(inspecao.data_inspecao), "dd/MM/yyyy") : "-"} | Local: ${inspecao.local || "-"}`,
      14,
      29
    );
    doc.text(`Responsável: ${inspecao.responsavel_nome || "-"}`, 14, 35);

    let y = 45;
    itens.forEach((item, i) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      const statusLabel =
        item.status === "conforme"
          ? "CONFORME"
          : item.status === "nao_conforme"
            ? "NÃO CONFORME"
            : "PENDENTE";
      doc.setFont(undefined, "bold");
      doc.text(`${i + 1}. ${item.nome}`, 14, y);
      doc.setFont(undefined, "normal");
      doc.text(`Status: ${statusLabel}`, 14, y + 5);
      if (item.resultado_ia) doc.text(`IA: ${item.resultado_ia.substring(0, 80)}`, 14, y + 10);
      if (item.observacao) doc.text(`Obs: ${item.observacao.substring(0, 80)}`, 14, y + 15);
      y += 22;
    });

    doc.save(`inspecao_campo_${inspecao.id}_${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("PDF exportado");
  };

  const statusInfo = {
    conforme: { label: "Conforme", cls: "bg-green-100 text-green-700" },
    nao_conforme: { label: "Não Conforme", cls: "bg-red-100 text-red-700" },
    pendente: { label: "Pendente", cls: "bg-slate-100 text-slate-500" },
  };

  const total = itens.length;
  const inspecionados = itens.filter((i) => i.status !== "pendente").length;
  const conformes = itens.filter((i) => i.status === "conforme").length;
  const naoConformes = itens.filter((i) => i.status === "nao_conforme").length;
  const pendentes = itens.filter((i) => i.status === "pendente").length;

  const itensFiltrados = itens.filter(
    (it) => filtroStatus === "todos" || it.status === filtroStatus
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-fullscreen-modal
        className="p-0 flex flex-col !rounded-none !border-0"
        style={{
          position: "fixed",
          left: "256px",
          top: "64px",
          right: 0,
          bottom: 0,
          width: "calc(100vw - 256px)",
          height: "calc(100vh - 64px)",
          maxWidth: "none",
          maxHeight: "none",
          transform: "none",
        }}
      >
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{inspecao.checklist_nome || "Inspeção de Campo"}</DialogTitle>
              <p className="text-sm text-slate-500 mt-0.5">
                {inspecao.data_inspecao && format(new Date(inspecao.data_inspecao), "dd/MM/yyyy")}
                {inspecao.local && ` · ${inspecao.local}`}
                {inspecao.responsavel_nome && ` · ${inspecao.responsavel_nome}`}
              </p>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="w-4 h-4" /> Exportar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportPDF}>
                    <FileText className="w-4 h-4 mr-2" /> Exportar PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportExcel}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {/* Progresso */}
          <div className="mt-3 flex items-center gap-4">
            <div className="flex-1 bg-slate-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${total > 0 ? (inspecionados / total) * 100 : 0}%` }}
              />
            </div>
            <span className="text-sm text-slate-600 whitespace-nowrap">
              {inspecionados}/{total}
            </span>
            <span className="text-sm text-green-600">✓ {conformes}</span>
            <span className="text-sm text-red-600">✗ {naoConformes}</span>
          </div>
          {/* Filtros rápidos */}
          <div className="mt-3 flex gap-2 flex-wrap">
            {[
              { key: "todos", label: `Todos (${total})` },
              { key: "pendente", label: `Pendentes (${pendentes})`, cls: "text-slate-600" },
              { key: "conforme", label: `Conformes (${conformes})`, cls: "text-green-700" },
              {
                key: "nao_conforme",
                label: `Não Conformes (${naoConformes})`,
                cls: "text-red-700",
              },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltroStatus(f.key)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                  filtroStatus === f.key
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-400"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4 max-w-3xl mx-auto">
            {itensFiltrados.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-sm">
                Nenhum item neste filtro
              </div>
            )}
            {itensFiltrados.map((item) => {
              const idx = itens.findIndex((i) => i === item);
              return (
                <div
                  key={idx}
                  className={cn(
                    "border rounded-xl p-4 transition-all",
                    item.status === "conforme" && "border-green-300 bg-green-50",
                    item.status === "nao_conforme" && "border-red-300 bg-red-50",
                    item.status === "pendente" && "border-slate-200"
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Foto referência */}
                    <div className="flex-shrink-0 text-center">
                      <p className="text-xs text-slate-400 mb-1">Referência</p>
                      {item.foto_referencia_url ? (
                        <img
                          src={item.foto_referencia_url}
                          alt="Ref"
                          className="w-20 h-20 object-cover rounded-lg border"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-slate-100 rounded-lg border flex items-center justify-center">
                          <Image className="w-6 h-6 text-slate-300" />
                        </div>
                      )}
                    </div>

                    {/* Foto inspecionada */}
                    <div className="flex-shrink-0 text-center">
                      <p className="text-xs text-slate-400 mb-1">Inspeção</p>
                      {item.foto_inspecao_url ? (
                        <div className="relative w-20 h-20">
                          <img
                            src={item.foto_inspecao_url}
                            alt="Insp"
                            className="w-20 h-20 object-cover rounded-lg border"
                          />
                          <button
                            onClick={() => {
                              const u = [...itens];
                              u[idx] = {
                                ...u[idx],
                                foto_inspecao_url: "",
                                status: "pendente",
                                resultado_ia: "",
                              };
                              setItens(u);
                              salvarItens(u);
                            }}
                            className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white rounded-bl flex items-center justify-center"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="w-20 h-20 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-amber-400 bg-white">
                          {uploadingFoto === idx || analisando === idx ? (
                            <Bot className="w-6 h-6 text-blue-400 animate-pulse" />
                          ) : (
                            <>
                              <Camera className="w-6 h-6 text-slate-300" />
                              <span className="text-xs text-slate-400 mt-0.5">Foto</span>
                            </>
                          )}
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handleUploadFoto(e, idx)}
                            disabled={uploadingFoto !== null || analisando !== null}
                          />
                        </label>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-800">{item.nome}</p>
                          {item.descricao && (
                            <p className="text-sm text-slate-500">{item.descricao}</p>
                          )}
                          {item.obrigatorio && (
                            <Badge className="text-xs bg-red-100 text-red-700 mt-1">
                              Obrigatório
                            </Badge>
                          )}
                        </div>
                        <Badge className={statusInfo[item.status]?.cls || statusInfo.pendente.cls}>
                          {statusInfo[item.status]?.label || "Pendente"}
                        </Badge>
                      </div>

                      {/* Resultado IA */}
                      {analisando === idx && (
                        <div className="mt-2 p-2 bg-blue-50 rounded-lg flex items-center gap-2">
                          <Bot className="w-4 h-4 text-blue-500 animate-pulse" />
                          <span className="text-xs text-blue-600">Analisando com IA Gemini...</span>
                        </div>
                      )}
                      {item.resultado_ia && analisando !== idx && (
                        <div
                          className={cn(
                            "mt-2 p-2 rounded-lg flex items-start gap-2 text-xs",
                            item.status === "conforme" ? "bg-green-50" : "bg-red-50"
                          )}
                        >
                          {item.status === "conforme" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                          )}
                          <span
                            className={
                              item.status === "conforme" ? "text-green-700" : "text-red-700"
                            }
                          >
                            <strong>IA:</strong> {item.resultado_ia}
                          </span>
                        </div>
                      )}

                      {/* Status manual */}
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant={item.status === "conforme" ? "default" : "outline"}
                          className={cn(
                            "gap-1 h-7 text-xs",
                            item.status === "conforme" ? "bg-green-600 hover:bg-green-700" : ""
                          )}
                          onClick={() => handleStatusManual(idx, "conforme")}
                        >
                          <Check className="w-3 h-3" /> Conforme
                        </Button>
                        <Button
                          size="sm"
                          variant={item.status === "nao_conforme" ? "default" : "outline"}
                          className={cn(
                            "gap-1 h-7 text-xs",
                            item.status === "nao_conforme" ? "bg-red-600 hover:bg-red-700" : ""
                          )}
                          onClick={() => handleStatusManual(idx, "nao_conforme")}
                        >
                          <X className="w-3 h-3" /> Não Conforme
                        </Button>
                      </div>

                      {/* Observação */}
                      <Textarea
                        value={item.observacao || ""}
                        onChange={(e) => handleObservacao(idx, e.target.value)}
                        placeholder="Observação..."
                        rows={1}
                        className="mt-2 text-xs"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t flex-shrink-0 flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            onClick={handleSalvarObservacoes}
            disabled={saving}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {saving ? "Salvando..." : "Salvar Observações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
