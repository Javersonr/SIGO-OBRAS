import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { format } from "date-fns";
import { safeParseJSON } from "@/lib/json-utils";

export default function ImprimirFichaEntregaModal({ open, onOpenChange, entrega, empresaAtiva }) {
  const [tipoImpressao, setTipoImpressao] = useState("ambos"); // 'ambos', 'ferramentas', 'epis'

  if (!entrega) return null;

  const itens = safeParseJSON(entrega.itens, []);

  // Separar ferramentas e EPIs
  const ferramentas = itens.filter((i) => i.tipo !== "EPI");
  const epis = itens.filter((i) => i.tipo === "EPI");

  const handleImprimirFerramentas = () => {
    const logoUrl = empresaAtiva?.logo_url || "";
    const linhasVazias = Math.max(0, 45 - ferramentas.length);

    const rowsHtml = ferramentas
      .map(
        (item) => `
      <tr style="height:20px">
        <td style="border:1px solid #000;padding:4px">${entrega.data_entrega ? format(new Date(entrega.data_entrega + "T12:00:00"), "dd/MM/yyyy") : "__/__/____"}</td>
        <td style="border:1px solid #000;padding:4px">__/__/____</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${item.quantidade || 1}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;font-weight:bold">${item.quantidade_entregue ?? item.quantidade ?? 1}</td>
        <td style="border:1px solid #000;padding:4px;font-size:10px">${item.descricao || item.ferramenta || item.item || ""}</td>
        <td style="border:1px solid #000;padding:4px;font-size:10px">${item.numero_serie || ""}</td>
        <td style="border:1px solid #000;padding:4px">${entrega.biometria_capturada ? "✓ Digital" : ""}</td>
        <td style="border:1px solid #000;padding:4px">${entrega.responsavel_entrega_nome || ""}</td>
      </tr>
    `
      )
      .join("");

    const emptyRowsHtml = Array(linhasVazias)
      .fill(
        `
      <tr style="height:20px">
        <td style="border:1px solid #000;padding:4px">__/__/____</td>
        <td style="border:1px solid #000;padding:4px">__/__/____</td>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px"></td>
      </tr>
    `
      )
      .join("");

    const dataAdmissao = entrega.data_entrega
      ? format(new Date(entrega.data_entrega + "T12:00:00"), "dd/MM/yyyy")
      : "";

    const pw = window.open("", "", "height=800,width=1200");
    pw.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Lista de Ferramentas - ${entrega.funcionario_nome}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; margin-top: 0; margin-bottom: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { font-family: Arial, sans-serif; font-size: 12px; background: white; }
            img { display: block; max-width: 100%; }
            table { border-collapse: collapse; width: 100%; font-size: 11px; }
            table td, table th { border: 1px solid #000; padding: 6px; text-align: left; }
            table th { background-color: #e0e0e0; font-weight: bold; }
            h1 { font-size: 14px; font-weight: bold; text-align: center; margin: 10px 0; }
            @media print { body { margin: 0; padding: 10px; } }
          </style>
        </head>
        <body>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:12px;border-bottom:3px solid #000;gap:20px">
            <div style="min-width:80px">
              ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height:70px;max-width:200px;object-fit:contain" />` : ""}
            </div>
            <div style="text-align:center;flex:1">
              <h1 style="margin:0">LISTA DE ENTREGA DE FERRAMENTAS</h1>
            </div>
          </div>

          <div style="margin-bottom:8px;font-size:10px">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;margin-bottom:4px">
              <div style="border-bottom:1px solid #000;padding-bottom:2px">
                <strong>NOME:</strong>
                <div style="margin-top:2px">${entrega.funcionario_nome}</div>
              </div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px;padding-left:20px">
                <strong>FUNÇÃO:</strong>
                <div style="margin-top:2px">${entrega.funcao_nome || ""}</div>
              </div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px;padding-left:20px">
                <strong>DATA DE ENTREGA:</strong>
                <div style="margin-top:2px">${dataAdmissao}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0">
              <div style="border-bottom:1px solid #000;padding-bottom:2px">
                <strong>SOLICITANTE: ${entrega.solicitante_nome || ""}</strong>
              </div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px;padding-left:20px">
                <strong>RESPONSÁVEL ENTREGA: ${entrega.responsavel_entrega_nome || ""}</strong>
              </div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px;padding-left:20px">
                <strong>BIOMETRIA: ${entrega.biometria_capturada ? "Confirmada ✓" : "Não capturada"}</strong>
              </div>
            </div>
          </div>

          <div style="margin-bottom:12px;font-size:9px;background:#f9f9f9;padding:8px;border:1px solid #ccc">
            <p style="text-align:justify;margin-bottom:8px">
              Declaro sob minha inteira responsabilidade a guarda e conservação das ferramentas e os equipamentos de proteção coletiva (EPC's) constantes nesta ficha – controle. Assumo também a responsabilidade de devolver integralmente ou parcialmente, quando solicitado, ou por ocasião de eventual rescisão de contrato, na data do respectivo aviso de qualquer das partes. Também estou ciente que, na eventualidade de danificar ou extraviar o equipamento por ato doloso ou culposo, estarei sujeito ao desconto do valor em meu salário, conforme parágrafo único do art. 158 da CLT.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
              <div style="border-bottom:1px solid #000;padding-bottom:2px"><strong style="font-size:10px">LOCAL:</strong></div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px"><strong style="font-size:10px">DATA DA EMISSÃO: ${format(new Date(), "dd/MM/yyyy")}</strong></div>
            </div>
          </div>

          <table style="font-size:11px;margin-bottom:20px">
            <thead>
              <tr style="background-color:#e0e0e0">
                <th style="border:1px solid #000;padding:6px;width:9%">DATA RETIRADA</th>
                <th style="border:1px solid #000;padding:6px;width:9%">DEVOLUÇÃO</th>
                <th style="border:1px solid #000;padding:6px;width:5%">SOLICITADA</th>
                <th style="border:1px solid #000;padding:6px;width:5%">ENTREGUE</th>
                <th style="border:1px solid #000;padding:6px;width:28%">DESCRIÇÃO DO EQUIPAMENTO</th>
                <th style="border:1px solid #000;padding:6px;width:12%">Nº DE SÉRIE</th>
                <th style="border:1px solid #000;padding:6px;width:17%">ASSINATURA DO FUNCIONÁRIO</th>
                <th style="border:1px solid #000;padding:6px;width:18%">RESPONSÁVEL PELA ENTREGA</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              ${emptyRowsHtml}
            </tbody>
          </table>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:16px">
            <div style="text-align:center">
              <div style="border-bottom:1px solid #000;height:40px;margin-bottom:4px"></div>
              <strong style="font-size:10px">Assinatura / Biometria do Funcionário</strong>
            </div>
            <div style="text-align:center">
              <div style="border-bottom:1px solid #000;height:40px;margin-bottom:4px"></div>
              <strong style="font-size:10px">Responsável pela Entrega</strong>
            </div>
          </div>
        </body>
      </html>
    `);
    pw.document.close();
    const imgs = pw.document.images;
    if (imgs.length === 0) {
      setTimeout(() => {
        pw.focus();
        pw.print();
        pw.close();
      }, 500);
    } else {
      let loaded = 0;
      Array.from(imgs).forEach((img) => {
        const done = () => {
          loaded++;
          if (loaded === imgs.length) {
            pw.focus();
            pw.print();
            pw.close();
          }
        };
        if (img.complete) done();
        else {
          img.onload = done;
          img.onerror = done;
        }
      });
      setTimeout(() => {
        if (loaded < imgs.length) {
          pw.focus();
          pw.print();
          pw.close();
        }
      }, 3000);
    }
  };

  const handleImprimirEPIs = () => {
    const logoUrl = empresaAtiva?.logo_url || "";
    const epicsPage1 = epis.slice(0, 45);
    const epicsPage2 = epis.slice(45);

    const renderPage = (epicsData, isSecondPage = false) => {
      const emptyRows = Math.max(0, 45 - epicsData.length);
      const rowsHtml = epicsData
        .map(
          (epi) => `
        <tr style="height:20px">
          <td style="border:1px solid #000;padding:4px">__/__/____</td>
          <td style="border:1px solid #000;padding:4px">__/__/____</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">${epi.quantidade || 1}</td>
          <td style="border:1px solid #000;padding:4px">${epi.descricao || epi.item || ""}</td>
          <td style="border:1px solid #000;padding:4px;font-size:10px">${epi.ca || ""}</td>
          <td style="border:1px solid #000;padding:4px"></td>
          <td style="border:1px solid #000;padding:4px"></td>
        </tr>
      `
        )
        .join("");

      const emptyRowsHtml = Array(emptyRows)
        .fill(
          `
        <tr style="height:20px">
          <td style="border:1px solid #000;padding:4px">__/__/____</td>
          <td style="border:1px solid #000;padding:4px">__/__/____</td>
          <td style="border:1px solid #000;padding:4px"></td>
          <td style="border:1px solid #000;padding:4px"></td>
          <td style="border:1px solid #000;padding:4px"></td>
          <td style="border:1px solid #000;padding:4px"></td>
          <td style="border:1px solid #000;padding:4px"></td>
        </tr>
      `
        )
        .join("");

      return `
        <div style="page-break-after: always; margin-bottom: 0">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:12px;border-bottom:3px solid #000;gap:20px">
            <div style="min-width:80px">
              ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height:70px;max-width:200px;object-fit:contain" />` : ""}
            </div>
            <div style="text-align:center;flex:1">
              <h1 style="margin:0">LISTA DE ENTREGA DE EPIs</h1>
              ${isSecondPage ? '<p style="font-size:10px;margin-top:6px">(Continuação)</p>' : ""}
            </div>
          </div>

          ${
            !isSecondPage
              ? `
          <div style="margin-bottom:8px;font-size:10px">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;margin-bottom:4px">
              <div style="border-bottom:1px solid #000;padding-bottom:2px">
                <strong>NOME:</strong>
                <div style="margin-top:2px">${entrega.funcionario_nome}</div>
              </div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px;padding-left:20px">
                <strong>FUNÇÃO:</strong>
                <div style="margin-top:2px">${entrega.funcao_nome || ""}</div>
              </div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px;padding-left:20px">
                <strong>DATA DE ENTREGA:</strong>
                <div style="margin-top:2px">${entrega.data_entrega ? format(new Date(entrega.data_entrega + "T12:00:00"), "dd/MM/yyyy") : "__/__/____"}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
              <div style="border-bottom:1px solid #000;padding-bottom:2px">
                <strong>RESPONSÁVEL PELA ENTREGA:</strong>
                <div style="margin-top:2px">${entrega.responsavel_entrega_nome || ""}</div>
              </div>
            </div>
          </div>

          <div style="margin-bottom:12px;font-size:9px;background:#f9f9f9;padding:8px;border:1px solid #ccc">
            <p style="text-align:justify;margin-bottom:8px;line-height:1.4">
              Recebo da Empresa ELETRO ENERGIA LTDA, CNPJ nº 30.694.170/0001-84, para meu uso obrigatório os EPI's (documentos de proteção individual) constantes nesta ficha, o qual cumpri a utiliza-los corretamente durante o tempo que permanece ao meu dispor, observado o mesmo padrão de disciplina e uso que integram o KR-06 - Equipamento de Proteção Individual - EPI's da portaria nº 3.214 de 08/junho/1970. Declaro saber também que tenhore-lo no meu desembarque, da empresa.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
              <div style="border-bottom:1px solid #000;padding-bottom:2px"><strong style="font-size:10px">LOCAL:</strong></div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px"><strong style="font-size:10px">DATA DA EMISSÃO: __/__/____</strong></div>
            </div>
          </div>
          `
              : ""
          }

          <table style="font-size:11px;margin-bottom:20px">
            <thead>
              <tr style="background-color:#e0e0e0">
                <th style="border:1px solid #000;padding:6px;width:9%">RETIRADA</th>
                <th style="border:1px solid #000;padding:6px;width:9%">DEVOLUÇÃO</th>
                <th style="border:1px solid #000;padding:6px;width:5%">QUANT.</th>
                <th style="border:1px solid #000;padding:6px;width:35%">DESCRIÇÃO</th>
                <th style="border:1px solid #000;padding:6px;width:10%">Nº DO C.A.</th>
                <th style="border:1px solid #000;padding:6px;width:16%">ASSINATURA FUNC.</th>
                <th style="border:1px solid #000;padding:6px;width:16%">RESPONSÁVEL</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              ${emptyRowsHtml}
            </tbody>
          </table>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:16px">
            <div style="text-align:center">
              <div style="border-bottom:1px solid #000;height:40px;margin-bottom:4px"></div>
              <strong style="font-size:10px">Assinatura do Funcionário</strong>
            </div>
            <div style="text-align:center">
              <div style="border-bottom:1px solid #000;height:40px;margin-bottom:4px"></div>
              <strong style="font-size:10px">Responsável pela Entrega</strong>
            </div>
          </div>
        </div>
      `;
    };

    const pw = window.open("", "", "height=800,width=1200");
    pw.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Lista de EPIs - ${entrega.funcionario_nome}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; margin-top: 0; margin-bottom: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { font-family: Arial, sans-serif; font-size: 12px; background: white; }
            img { display: block; max-width: 100%; }
            table { border-collapse: collapse; width: 100%; font-size: 11px; }
            table td, table th { border: 1px solid #000; padding: 6px; text-align: left; }
            table th { background-color: #e0e0e0; font-weight: bold; }
            h1 { font-size: 14px; font-weight: bold; text-align: center; margin: 10px 0; }
            @media print { body { margin: 0; padding: 10px; } }
          </style>
        </head>
        <body>
          ${renderPage(epicsPage1, false)}
          ${epicsPage2.length > 0 ? renderPage(epicsPage2, true) : ""}
        </body>
      </html>
    `);
    pw.document.close();
    const imgs = pw.document.images;
    if (imgs.length === 0) {
      setTimeout(() => {
        pw.focus();
        pw.print();
        pw.close();
      }, 500);
    } else {
      let loaded = 0;
      Array.from(imgs).forEach((img) => {
        const done = () => {
          loaded++;
          if (loaded === imgs.length) {
            pw.focus();
            pw.print();
            pw.close();
          }
        };
        if (img.complete) done();
        else {
          img.onload = done;
          img.onerror = done;
        }
      });
      setTimeout(() => {
        if (loaded < imgs.length) {
          pw.focus();
          pw.print();
          pw.close();
        }
      }, 3000);
    }
  };

  const handleImprimirAmbos = () => {
    handleImprimirFerramentas();
    setTimeout(() => handleImprimirEPIs(), 1500);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full h-full overflow-y-auto p-0"
        data-fullscreen-modal
      >
        <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-white z-10 flex flex-row items-center justify-between">
          <SheetTitle>Ficha de Entrega</SheetTitle>
          <div className="flex gap-2">
            <Button
              onClick={handleImprimirFerramentas}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
            >
              <Printer className="w-4 h-4" />
              Ferramentas
            </Button>
            <Button
              onClick={handleImprimirEPIs}
              className="gap-2 bg-green-600 text-white hover:bg-green-700"
            >
              <Printer className="w-4 h-4" />
              EPIs
            </Button>
            <Button
              onClick={handleImprimirAmbos}
              className="gap-2 bg-slate-800 text-white hover:bg-slate-700"
            >
              <Printer className="w-4 h-4" />
              Ambos
            </Button>
          </div>
        </SheetHeader>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Funcionário:</span>{" "}
              <strong>{entrega.funcionario_nome}</strong>
            </div>
            <div>
              <span className="text-slate-500">Função:</span> <strong>{entrega.funcao_nome}</strong>
            </div>
            <div>
              <span className="text-slate-500">Solicitante:</span>{" "}
              <strong>{entrega.solicitante_nome}</strong>
            </div>
            <div>
              <span className="text-slate-500">Responsável Entrega:</span>{" "}
              <strong>{entrega.responsavel_entrega_nome || "-"}</strong>
            </div>
            <div>
              <span className="text-slate-500">Data Solicitação:</span>{" "}
              <strong>
                {entrega.data_solicitacao
                  ? format(new Date(entrega.data_solicitacao + "T12:00:00"), "dd/MM/yyyy")
                  : "-"}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Data Entrega:</span>{" "}
              <strong>
                {entrega.data_entrega
                  ? format(new Date(entrega.data_entrega + "T12:00:00"), "dd/MM/yyyy")
                  : "-"}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Biometria:</span>{" "}
              <strong className={entrega.biometria_capturada ? "text-green-600" : "text-red-500"}>
                {entrega.biometria_capturada ? "Confirmada ✓" : "Não capturada"}
              </strong>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Tipo</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600">
                    Solicitada
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600">
                    Entregue
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">
                    Nº Série
                  </th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-4 py-2 text-slate-800">
                      {item.descricao || item.ferramenta || item.item || ""}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${item.tipo === "EPI" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}
                      >
                        {item.tipo || "Ferramenta"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-slate-600">{item.quantidade || 1}</td>
                    <td className="px-4 py-2 text-center font-semibold text-slate-800">
                      {item.quantidade_entregue ?? item.quantidade ?? 1}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{item.numero_serie || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
