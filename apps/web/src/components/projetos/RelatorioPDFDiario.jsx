import jsPDF from "jspdf";
import { safeParseJSON } from "@/lib/json-utils";

export function gerarRelatorioDiarioPDF(diario, empresaAtiva) {
  try {
    const doc = new jsPDF("p", "mm", "a4");
    const larguraTotal = 190;

    // Logo/Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(empresaAtiva?.nome || "SINERGIA", 20, 15);

    doc.setFontSize(14);
    doc.text("Relatório Diário de Obra (RDO)", 20, 25);

    // Informações principais
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    let y = 35;

    const info = [
      ["Relatório nº", "1"],
      ["Data do relatório", new Date(diario.data).toLocaleDateString("pt-BR")],
      ["Dia da semana", new Date(diario.data).toLocaleDateString("pt-BR", { weekday: "long" })],
      ["Contrato", diario.numero_contrato || "-"],
      ["Prazo contratual", "-"],
      ["Prazo decorrido", diario.prazo_decorrido || "-"],
      ["Prazo à vencer", "-"],
    ];

    doc.setFillColor(245, 245, 245);
    info.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(value), 100, y);
      y += 6;
    });

    y += 5;

    // Dados da Obra
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Dados da Obra", 20, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const dadosObra = [
      ["Obra", diario.obra_nome || "-"],
      ["Local", diario.obra_local || "-"],
      ["Contratante", diario.contratante_nome || "-"],
      ["Responsável", "-"],
    ];

    dadosObra.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(label, 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(value).substring(0, 80), 60, y);
      y += 6;
    });

    y += 5;

    // Condições climáticas
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Condição climática", 20, y);
    y += 8;

    const climaMap = { Sol: "☀", Nublado: "☁", Chuva: "🌧", Vento: "💨" };
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Manhã: ${climaMap[diario.clima] || ""} ${diario.clima || "-"}`, 20, y);
    doc.text("Tarde: ☀ Sol", 120, y);
    y += 8;
    doc.text("Tempo", 20, y);
    doc.text(diario.temperatura ? `${diario.temperatura}°C` : "-", 120, y);
    y += 6;
    doc.text("Condição", 20, y);
    doc.text("Praticável", 120, y);

    y += 12;

    // Atividades realizadas
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setFillColor(255, 193, 7);
    doc.rect(20, y, larguraTotal, 7, "F");
    doc.setTextColor(0, 0, 0);
    doc.text("Atividades Realizadas", 22, y + 5);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const ativLines = doc.splitTextToSize(diario.atividades || "-", larguraTotal - 4);
    doc.text(ativLines, 22, y);
    y += ativLines.length * 5 + 5;

    // Mão de obra: JSONB → array (supabase-js) ou string (legacy)
    if (diario.mao_de_obra) {
      try {
        const maoObra = safeParseJSON(diario.mao_de_obra, []);
        if (Array.isArray(maoObra) && maoObra.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.text("Mão de Obra", 20, y);
          y += 6;

          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          maoObra.forEach((m) => {
            doc.text(`${m.nome}: ${m.quantidade} pessoa(s)`, 22, y);
            y += 5;
          });
          y += 3;
        }
      } catch (e) {
        console.error("Erro ao parse mão de obra:", e);
      }
    }

    // Fotos: JSONB → array (supabase-js) ou string (legacy)
    if (diario.fotos) {
      try {
        const fotos = safeParseJSON(diario.fotos, []);
        if (Array.isArray(fotos) && fotos.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setFillColor(255, 193, 7);
          doc.rect(20, y, larguraTotal, 7, "F");
          doc.setTextColor(0, 0, 0);
          doc.text(`Fotos (${fotos.length})`, 22, y + 5);
          y += 12;

          // Adicionar miniaturas das fotos (até 2 por linha)
          let fotasAdicionadas = 0;
          fotos.slice(0, 6).forEach((foto, idx) => {
            if (y > 250) {
              doc.addPage();
              y = 20;
            }
            try {
              doc.addImage(foto, "JPEG", 20 + (idx % 2) * 95, y, 85, 60);
              fotasAdicionadas++;
              if (fotasAdicionadas % 2 === 0) y += 65;
            } catch (e) {
              console.error("Erro ao adicionar foto:", e);
            }
          });
        }
      } catch (e) {
        console.error("Erro ao parse fotos:", e);
      }
    }

    doc.save(
      `RDO_${diario.obra_nome?.replace(/\s/g, "_")}_${new Date(diario.data).toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`
    );
  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    alert("Erro ao gerar PDF. Por favor, verifique o console para detalhes.");
  }
}

export function imprimirDiario(diario, empresaAtiva) {
  try {
    const janela = window.open("", "_blank");
    const dataFormatada = new Date(diario.data).toLocaleDateString("pt-BR");
    const diaS = new Date(diario.data).toLocaleDateString("pt-BR", { weekday: "long" });

    let maoDeObraHTML = "";
    if (diario.mao_de_obra) {
      try {
        const maoObra = safeParseJSON(diario.mao_de_obra, []);
        if (Array.isArray(maoObra) && maoObra.length > 0) {
          maoDeObraHTML = `
            <h3 style="background-color: #fbbf24; padding: 8px 10px; margin: 20px 0 10px 0; font-weight: bold; font-size: 12px;">Mão de Obra Utilizada</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tbody>
                ${maoObra
                  .map(
                    (m) => `
                  <tr>
                    <td style="border: 1px solid #d1d5db; padding: 8px; width: 70%;">${m.nome}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">${m.quantidade}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          `;
        }
      } catch (e) {
        console.error("Erro ao processar mão de obra:", e);
      }
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>RDO - ${dataFormatada}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; color: #1a1a1a; }
            .page { width: 210mm; height: 297mm; margin: 0 auto; padding: 15mm; }
            .header-section { display: flex; gap: 15px; margin-bottom: 15px; border: 1px solid #333; }
            .logo-box { width: 80px; border-right: 1px solid #333; padding: 10px; text-align: center; display: flex; align-items: center; justify-content: center; }
            .logo-img { width: 60px; height: 60px; background-color: #f0f0f0; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #1e40af; }
            .header-info { flex: 1; padding: 10px; }
            .header-title { font-weight: bold; font-size: 14px; margin-bottom: 8px; }
            .header-table { width: 100%; }
            .header-table td { padding: 4px 8px; border: 1px solid #ddd; font-size: 11px; }
            .header-table td:first-child { background-color: #f3f4f6; font-weight: bold; width: 35%; }
            h3 { background-color: #fbbf24; color: #1a1a1a; padding: 6px 8px; margin: 12px 0 8px 0; font-size: 11px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
            td { border: 1px solid #ddd; padding: 6px 8px; font-size: 11px; }
            .section-label { background-color: #f3f4f6; font-weight: bold; }
            .content-box { background-color: #f9fafb; border: 1px solid #ddd; padding: 8px; min-height: 40px; margin-bottom: 12px; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
            .footer { margin-top: 15px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 10px; color: #666; }
            @media print { body { margin: 0; padding: 0; } .page { margin: 0; width: 100%; height: 100%; } }
          </style>
        </head>
        <body>
          <div class="page">
            <!-- Header -->
            <div class="header-section">
              <div class="logo-box">
                <div class="logo-img">${empresaAtiva?.nome?.substring(0, 1) || "S"}</div>
              </div>
              <div class="header-info">
                <div class="header-title">${empresaAtiva?.nome || "Empresa"}</div>
                <div style="font-size: 11px; margin-bottom: 8px;">Relatório Diário de Obra (RDO)</div>
                <table class="header-table">
                  <tr>
                    <td class="section-label">Relatório nº</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td class="section-label">Data do relatório</td>
                    <td>${dataFormatada}</td>
                  </tr>
                  <tr>
                    <td class="section-label">Dia da semana</td>
                    <td>${diaS}</td>
                  </tr>
                  <tr>
                    <td class="section-label">Contrato</td>
                    <td>${diario.numero_contrato || "-"}</td>
                  </tr>
                  <tr>
                    <td class="section-label">Prazo contratual</td>
                    <td>-</td>
                  </tr>
                  <tr>
                    <td class="section-label">Prazo decorrido</td>
                    <td>${diario.prazo_decorrido || "-"}</td>
                  </tr>
                  <tr>
                    <td class="section-label">Prazo à vencer</td>
                    <td>-</td>
                  </tr>
                </table>
              </div>
            </div>

            <!-- Dados da Obra -->
            <h3>Dados da Obra</h3>
            <table>
              <tr>
                <td class="section-label" style="width: 25%;">Obra</td>
                <td>${diario.obra_nome || "-"}</td>
              </tr>
              <tr>
                <td class="section-label">Local</td>
                <td>${diario.obra_local || "-"}</td>
              </tr>
              <tr>
                <td class="section-label">Contratante</td>
                <td>${diario.contratante_nome || "-"}</td>
              </tr>
            </table>

            <!-- Condição Climática -->
            <h3>Condição Climática</h3>
            <table>
              <tr>
                <td class="section-label" style="width: 25%;">Manhã</td>
                <td style="width: 30%; text-align: center;">★ ${diario.clima || "Sol"}</td>
                <td class="section-label" style="width: 20%;">Tarde</td>
                <td style="width: 25%; text-align: center;">★ Sol</td>
              </tr>
              <tr>
                <td class="section-label">Condição</td>
                <td colspan="3">Praticável</td>
              </tr>
            </table>

            <!-- Atividades -->
            <h3>Atividades Realizadas</h3>
            <div class="content-box">${diario.atividades || "-"}</div>

            ${
              diario.observacoes
                ? `
              <h3>Observações</h3>
              <div class="content-box">${diario.observacoes}</div>
            `
                : ""
            }

            ${
              diario.problemas
                ? `
              <h3 style="background-color: #fca5a5;">Problemas / Ocorrências</h3>
              <div style="background-color: #fee2e2; border: 1px solid #fca5a5; padding: 8px; margin-bottom: 12px; font-size: 11px; color: #7f1d1d;">${diario.problemas}</div>
            `
                : ""
            }

            ${maoDeObraHTML}

            <!-- Fotos -->
            ${(() => {
              let fotosHTML = "";
              if (diario.fotos) {
                try {
                  const fotos = safeParseJSON(diario.fotos, []);
                  if (Array.isArray(fotos) && fotos.length > 0) {
                    fotosHTML = `
                      <h3>Fotos (${fotos.length})</h3>
                      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px;">
                        ${fotos
                          .slice(0, 10)
                          .map(
                            (foto, idx) => `
                          <div>
                            <img src="${foto}" alt="Foto ${idx + 1}" style="width: 100%; height: 60px; object-fit: cover; border: 1px solid #ddd; border-radius: 2px;" />
                          </div>
                        `
                          )
                          .join("")}
                      </div>
                    `;
                  }
                } catch (e) {
                  console.error("Erro ao processar fotos:", e);
                }
              }
              return fotosHTML;
            })()}

            <!-- Assinatura -->
            <div style="margin-top: 20px; text-align: center;">
              <div style="border-top: 1px solid #333; width: 150px; margin: 0 auto 4px; height: 40px;"></div>
              <div style="font-size: 10px;">${diario.responsavel || "Responsável pela Obra"}</div>
            </div>

            <!-- Footer -->
            <div class="footer">
              Criado por: ${diario.created_by || "-"} | ${new Date(diario.created_date).toLocaleDateString("pt-BR")}
            </div>
          </div>
        </body>
      </html>
    `;

    janela.document.write(html);
    janela.document.close();
    janela.focus();

    setTimeout(() => {
      janela.print();
    }, 500);
  } catch (error) {
    console.error("Erro ao imprimir:", error);
    alert("Erro ao imprimir. Por favor, verifique o console para detalhes.");
  }
}
