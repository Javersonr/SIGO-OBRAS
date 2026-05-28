import React, { useState } from "react";
import { safeParseJSON } from "@/lib/json-utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import AnexoViewer from "@/components/shared/AnexoViewer";
import { gerarRelatorioDiarioPDF } from "./RelatorioPDFDiario";

export default function VisualizarDiarioModal({ diario, open, onOpenChange, empresaAtiva }) {
  const [anexoViewer, setAnexoViewer] = useState({ open: false, anexo: null });

  const handlePrint = () => {
    const dataFormatada = new Date(diario.data).toLocaleDateString("pt-BR");
    const diaS = new Date(diario.data).toLocaleDateString("pt-BR", { weekday: "long" });

    let maoDeObraHTML = "";
    if (maoDeObraData.length > 0) {
      maoDeObraHTML = `
        <tr><td colspan="2" style="background:#fbbf24;font-weight:bold;padding:6px 10px;border:1px solid #ccc;">Mão de Obra Utilizada (${maoDeObraData.length})</td></tr>
        <tr><th style="background:#f3f4f6;border:1px solid #ccc;padding:6px 10px;text-align:left;">Função</th><th style="background:#f3f4f6;border:1px solid #ccc;padding:6px 10px;text-align:center;">Quantidade</th></tr>
        ${maoDeObraData.map((m) => `<tr><td style="border:1px solid #ccc;padding:6px 10px;">${m.nome}</td><td style="border:1px solid #ccc;padding:6px 10px;text-align:center;">${m.quantidade}</td></tr>`).join("")}
      `;
    }

    let fotosHTML = "";
    if (fotosData.length > 0) {
      fotosHTML = `
        <tr><td colspan="2" style="background:#fbbf24;font-weight:bold;padding:6px 10px;border:1px solid #ccc;">Fotos (${fotosData.length})</td></tr>
        <tr><td colspan="2" style="border:1px solid #ccc;padding:10px;">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
            ${fotosData.map((foto, idx) => `<div style="page-break-inside:avoid;"><img src="${foto}" alt="Foto ${idx + 1}" style="width:100%;height:auto;display:block;border:1px solid #ddd;border-radius:4px;" /></div>`).join("")}
          </div>
        </td></tr>
      `;
    }

    const logoHTML = empresaAtiva?.logo_url
      ? `<img src="${empresaAtiva.logo_url}" alt="Logo" style="max-height:80px;max-width:200px;" />`
      : `<div style="font-size:22px;font-weight:bold;color:#1e3a8a;">${empresaAtiva?.nome_fantasia || empresaAtiva?.nome || ""}</div>`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>RDO - ${dataFormatada}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family:Arial,sans-serif; font-size:11px; color:#1a1a1a; background:#fff; }
    table { width:100%; border-collapse:collapse; }
    td, th { border:1px solid #ccc; padding:5px 8px; text-align:left; font-size:11px; }
    .label { background-color:#f3f4f6 !important; font-weight:bold; }
    .amber { background-color:#fbbf24 !important; font-weight:bold; }
    .red-header { background-color:#f87171 !important; font-weight:bold; color:#7f1d1d; }
    .page-header { display:table; width:100%; border-collapse:collapse; margin-bottom:10px; }
    thead { display:table-header-group; }
    tfoot { display:table-footer-group; }
    .no-break { page-break-inside:avoid; }
  </style>
</head>
<body>

<!-- Cabeçalho que se repete em toda página via thead de tabela principal -->
<table style="margin-bottom:0;">
  <thead>
    <tr>
      <td style="padding:0;border:none;">
        <table style="margin-bottom:8px;">
          <tr>
            <td style="border:1px solid #ccc;padding:12px;text-align:center;width:35%;vertical-align:middle;">
              ${logoHTML}
              <div style="font-weight:bold;margin-top:8px;font-size:12px;">Relatório Diário de Obra (RDO)</div>
            </td>
            <td style="border:1px solid #ccc;padding:0;vertical-align:top;">
              <table style="margin:0;border:none;">
                <tr><td class="label" style="width:45%;border:1px solid #ccc;">Relatório nº</td><td style="border:1px solid #ccc;">1</td></tr>
                <tr><td class="label" style="border:1px solid #ccc;">Data do relatório</td><td style="color:#2563eb;border:1px solid #ccc;">${dataFormatada}</td></tr>
                <tr><td class="label" style="border:1px solid #ccc;">Dia da semana</td><td style="color:#2563eb;border:1px solid #ccc;">${diaS}</td></tr>
                <tr><td class="label" style="border:1px solid #ccc;">Contrato</td><td style="border:1px solid #ccc;">${diario.numero_contrato || "-"}</td></tr>
                <tr><td class="label" style="border:1px solid #ccc;">Prazo contratual</td><td style="border:1px solid #ccc;">-</td></tr>
                <tr><td class="label" style="border:1px solid #ccc;">Prazo decorrido</td><td style="border:1px solid #ccc;">${diario.prazo_decorrido || "-"}</td></tr>
                <tr><td class="label" style="border:1px solid #ccc;">Prazo à vencer</td><td style="border:1px solid #ccc;">-</td></tr>
              </table>
            </td>
          </tr>
        </table>
        <table style="margin-bottom:8px;">
          <tr><td class="label" style="width:22%;">Obra</td><td style="color:#2563eb;">${diario.obra_nome || "-"}</td></tr>
          <tr><td class="label">Local</td><td style="color:#2563eb;">${diario.obra_local || "-"}</td></tr>
          <tr><td class="label">Contratante</td><td>${diario.contratante_nome || "-"}</td></tr>
        </table>
        <table style="margin-bottom:8px;">
          <tr>
            <th class="label" style="width:25%;">Condição climática</th>
            <th class="label" style="width:35%;">Tempo</th>
            <th class="label">Condição</th>
          </tr>
          <tr>
            <td>Manhã</td>
            <td>★ ${diario.clima_manha || diario.clima || "Sol"}</td>
            <td>${diario.condicao_manha || "Praticável"}</td>
          </tr>
          <tr>
            <td>Tarde</td>
            <td>★ ${diario.clima_tarde || diario.clima || "Sol"}</td>
            <td>${diario.condicao_tarde || "Praticável"}</td>
          </tr>
        </table>
      </td>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:0;border:none;">

        <!-- Atividades -->
        <table style="margin-bottom:8px;" class="no-break">
          <tr><td class="amber">Atividades Realizadas</td></tr>
          <tr><td style="white-space:pre-wrap;line-height:1.6;padding:8px;">${diario.atividades || "-"}</td></tr>
        </table>

        ${
          diario.observacoes
            ? `
        <table style="margin-bottom:8px;" class="no-break">
          <tr><td class="amber">Observações</td></tr>
          <tr><td style="padding:8px;">${diario.observacoes}</td></tr>
        </table>`
            : ""
        }

        ${
          diario.problemas
            ? `
        <table style="margin-bottom:8px;" class="no-break">
          <tr><td class="red-header">Problemas / Ocorrências</td></tr>
          <tr><td style="padding:8px;color:#7f1d1d;">${diario.problemas}</td></tr>
        </table>`
            : ""
        }

        ${
          maoDeObraData.length > 0
            ? `
        <table style="margin-bottom:8px;" class="no-break">
          <tr><td colspan="2" class="amber">Mão de Obra Utilizada (${maoDeObraData.length})</td></tr>
          <tr><th class="label">Função</th><th class="label" style="text-align:center;">Quantidade</th></tr>
          ${maoDeObraData.map((m) => `<tr><td>${m.nome}</td><td style="text-align:center;">${m.quantidade}</td></tr>`).join("")}
        </table>`
            : ""
        }

        ${
          fotosData.length > 0
            ? `
        <table style="margin-bottom:8px;width:100%;border-collapse:collapse;">
          <thead>
            <tr><th class="amber" style="text-align:left;padding:5px 8px;border:1px solid #ccc;">Fotos (${fotosData.length})</th></tr>
          </thead>
          <tbody>
            ${(() => {
              // agrupar fotos em pares (2 por linha)
              const rows = [];
              for (let i = 0; i < fotosData.length; i += 2) {
                const f1 = fotosData[i];
                const f2 = fotosData[i + 1];
                rows.push(`<tr style="page-break-inside:avoid;">
                  <td style="border:1px solid #ccc;padding:6px;vertical-align:top;">
                    <img src="${f1}" alt="Foto ${i + 1}" style="width:80%;height:auto;display:block;border:1px solid #ddd;border-radius:4px;" />
                  </td>
                  <td style="border:1px solid #ccc;padding:6px;vertical-align:top;width:50%;">
                    ${f2 ? `<img src="${f2}" alt="Foto ${i + 2}" style="width:80%;height:auto;display:block;border:1px solid #ddd;border-radius:4px;" />` : ""}
                  </td>
                </tr>`);
              }
              return rows.join("");
            })()}
          </tbody>
        </table>`
            : ""
        }

        <!-- Assinatura -->
        <div style="margin-top:24px;text-align:center;">
          <div style="border-top:2px solid #333;width:180px;margin:0 auto 6px;"></div>
          <div style="font-size:10px;color:#555;">${diario.responsavel || "Responsável pela Obra"}</div>
        </div>
        <div style="margin-top:14px;padding-top:8px;border-top:1px solid #ccc;font-size:10px;color:#888;">
          Criado por: ${diario.created_by || "-"} | ${new Date(diario.created_date).toLocaleDateString("pt-BR")}
        </div>

      </td>
    </tr>
  </tbody>
</table>

</body>
</html>`;

    const janela = window.open("", "_blank");
    janela.document.write(html);
    janela.document.close();
    setTimeout(() => {
      janela.print();
    }, 800);
  };
  const handleExportPDF = () => gerarRelatorioDiarioPDF(diario, empresaAtiva);

  if (!diario) return null;

  // mao_de_obra/fotos: JSONB → array do supabase-js, string em legacy
  const parsedMao = safeParseJSON(diario.mao_de_obra, []);
  const maoDeObraData = Array.isArray(parsedMao) ? parsedMao : [];
  const parsedFotos = safeParseJSON(diario.fotos, []);
  const fotosData = Array.isArray(parsedFotos) ? parsedFotos : [];

  const dataFormatada = new Date(diario.data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0">
        {/* Conteúdo do Relatório */}
        <div className="bg-white">
          {/* Cabeçalho Navegação - Apenas Imprimir */}
          <div className="flex items-center justify-between p-4 border-b border-slate-300 bg-slate-50">
            <button
              onClick={() => onOpenChange(false)}
              className="text-slate-700 text-sm font-medium"
            >
              Relatório {dataFormatada} nº 1
            </button>
            <Badge className="bg-amber-400 text-slate-800 font-bold">Presenciando Relatório</Badge>
            <div className="flex gap-2">
              <Button size="sm" onClick={handlePrint} variant="outline" className="gap-2">
                <Printer className="w-4 h-4" />
                Imprimir
              </Button>
            </div>
          </div>

          {/* Conteúdo principal */}
          <div id="diario-modal-print" className="p-8">
            {/* Cabeçalho com Logo e Informações */}
            <div className="flex justify-between items-start mb-6 border border-slate-300">
              {/* Logo e Título - esquerda */}
              <div className="flex-1 border-r border-slate-300 p-4 flex flex-col items-center justify-center">
                {empresaAtiva?.logo_url ? (
                  <img src={empresaAtiva.logo_url} alt="Logo" className="h-12 mb-2" />
                ) : (
                  <div className="text-xl font-bold text-amber-600 mb-2">
                    {empresaAtiva?.nome_fantasia || empresaAtiva?.nome}
                  </div>
                )}
                <h1 className="text-sm font-bold text-slate-800 text-center">
                  Relatório Diário de Obra (RDO)
                </h1>
              </div>

              {/* Informações em tabela - direita */}
              <div className="flex-1">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100 w-1/2">
                        Relatório nº
                      </td>
                      <td className="border border-slate-300 px-3 py-2">1</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100">
                        Data do relatório
                      </td>
                      <td className="border border-slate-300 px-3 py-2">{dataFormatada}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100">
                        Dia da semana
                      </td>
                      <td className="border border-slate-300 px-3 py-2">
                        {new Date(diario.data).toLocaleDateString("pt-BR", { weekday: "long" })}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100">
                        Contrato
                      </td>
                      <td className="border border-slate-300 px-3 py-2">
                        {diario.numero_contrato || "-"}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100">
                        Prazo contratual
                      </td>
                      <td className="border border-slate-300 px-3 py-2">-</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100">
                        Prazo decorrido
                      </td>
                      <td className="border border-slate-300 px-3 py-2">
                        {diario.prazo_decorrido || "-"}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100">
                        Prazo à vencer
                      </td>
                      <td className="border border-slate-300 px-3 py-2">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Obra / Local / Contratante */}
            <table className="w-full border-collapse text-sm mb-6">
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100 w-24">
                    Obra
                  </td>
                  <td className="border border-slate-300 px-3 py-2 flex-1">
                    {diario.obra_nome || "-"}
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100">
                    Local
                  </td>
                  <td className="border border-slate-300 px-3 py-2">{diario.obra_local || "-"}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100 w-24">
                    Contratante
                  </td>
                  <td className="border border-slate-300 px-3 py-2 flex-1">
                    {diario.contratante_nome || "-"}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Condição Climática */}
            <table className="w-full border-collapse text-sm mb-6">
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100 w-1/3">
                    Condição climática
                  </td>
                  <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100 w-1/3">
                    Tempo
                  </td>
                  <td className="border border-slate-300 px-3 py-2 font-semibold bg-slate-100 w-1/3">
                    Condição
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-2">Manhã</td>
                  <td className="border border-slate-300 px-3 py-2">★ {diario.clima || "Sol"}</td>
                  <td className="border border-slate-300 px-3 py-2">Praticável</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-2">Tarde</td>
                  <td className="border border-slate-300 px-3 py-2">★ {diario.clima || "Sol"}</td>
                  <td className="border border-slate-300 px-3 py-2">Praticável</td>
                </tr>
              </tbody>
            </table>

            {/* Seção de Atividades */}
            <div className="mb-6">
              <div className="bg-amber-400 text-slate-800 px-3 py-1 font-bold text-sm inline-block mb-3 rounded">
                Atividades Realizadas
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-4 min-h-32">
                <p className="text-slate-800 whitespace-pre-wrap text-sm leading-relaxed">
                  {diario.atividades}
                </p>
              </div>
            </div>

            {/* Observações */}
            {diario.observacoes && (
              <div className="mb-6">
                <div className="bg-amber-400 text-slate-800 px-3 py-1 font-bold text-sm inline-block mb-3 rounded">
                  Observações
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded p-4 min-h-20">
                  <p className="text-slate-800 text-sm">{diario.observacoes}</p>
                </div>
              </div>
            )}

            {/* Problemas */}
            {diario.problemas && (
              <div className="mb-6">
                <div className="bg-red-400 text-white px-3 py-1 font-bold text-sm inline-block mb-3 rounded">
                  Problemas / Ocorrências
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-4 min-h-20">
                  <p className="text-red-900 text-sm">{diario.problemas}</p>
                </div>
              </div>
            )}

            {/* Mão de Obra */}
            {maoDeObraData.length > 0 && (
              <div className="mb-6">
                <div className="bg-amber-400 text-slate-800 px-3 py-1 font-bold text-sm inline-block mb-3 rounded">
                  Mão de Obra Utilizada ({maoDeObraData.length})
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-3 py-2 text-left text-xs font-semibold">
                        Função
                      </th>
                      <th className="border border-slate-300 px-3 py-2 text-center text-xs font-semibold">
                        Quantidade
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {maoDeObraData.map((m, index) => (
                      <tr key={index} className="hover:bg-slate-50">
                        <td className="border border-slate-300 px-3 py-2 text-sm">{m.nome}</td>
                        <td className="border border-slate-300 px-3 py-2 text-center text-sm">
                          {m.quantidade}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Fotos */}
            {fotosData.length > 0 && (
              <div className="mb-6">
                <div className="bg-amber-400 text-slate-800 px-3 py-1 font-bold text-sm inline-block mb-3 rounded">
                  Fotos ({fotosData.length})
                </div>
                <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded p-4">
                  {fotosData.map((foto, index) => (
                    <div
                      key={index}
                      className="aspect-square overflow-hidden rounded border border-slate-300 cursor-pointer hover:border-amber-500 transition-colors"
                      onClick={() =>
                        setAnexoViewer({
                          open: true,
                          anexo: { url: foto, nome: `Foto ${index + 1}`, tipo: "image" },
                        })
                      }
                    >
                      <img
                        src={foto}
                        alt={`Foto ${index + 1}`}
                        className="w-full h-full object-cover hover:scale-110 transition-transform"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Assinatura do Responsável */}
            <div className="mt-12 mb-8">
              <div className="flex justify-center">
                <div className="text-center">
                  <div className="border-t-2 border-slate-800 w-48 mb-2"></div>
                  <p className="text-xs text-slate-600 font-medium">
                    {diario.responsavel || "Responsável pela Obra"}
                  </p>
                </div>
              </div>
            </div>

            {/* Rodapé */}
            <div className="border-t-2 border-slate-300 mt-8 pt-6 flex justify-between items-center">
              <div className="text-xs text-slate-500">
                Criado por: {diario.created_by} |{" "}
                {new Date(diario.created_date).toLocaleDateString("pt-BR")}
              </div>
              <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      <AnexoViewer
        anexo={anexoViewer.anexo}
        open={anexoViewer.open}
        onOpenChange={(open) => setAnexoViewer({ open, anexo: null })}
      />
    </Dialog>
  );
}
