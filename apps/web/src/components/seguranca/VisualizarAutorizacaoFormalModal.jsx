import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Download, Settings } from "lucide-react";
import EPIEditorPanel from "./EPIEditorPanel";

export default function VisualizarAutorizacaoFormalModal({
  open,
  onOpenChange,
  funcionario,
  funcoes,
  empresaAtiva,
}) {
  const printRef = useRef(null);
  const [showEditor, setShowEditor] = useState(false);
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("autorizacao-formal-modal-settings");
      return saved
        ? JSON.parse(saved)
        : {
            fontSizeTitulo: 14,
            fontSizeTabela: 11,
            fontSizeDados: 10,
            fontSizeRodape: 10,
            margemSuperior: 10,
            margemInferior: 10,
            paddingCelula: 6,
            alturaLogo: 70,
            margemLogo: 20,
            espacoInferiorCabecalho: 12,
            espacoDados: 8,
            fontSizeLabels: 10,
            alturaAssinatura: 35,
          };
    } catch {
      return {};
    }
  });

  const funcao = funcoes?.find((f) => f.id === funcionario.funcao_id) || {};

  useEffect(() => {
    localStorage.setItem("autorizacao-formal-modal-settings", JSON.stringify(settings));
  }, [settings]);

  const handleImprimir = () => {
    const printRef = document.getElementById("autorizacao-formal-print-content");
    const printWindow = window.open("", "", "height=800,width=1200");

    printWindow.document.write(`
      <html>
        <head>
          <title>Impressão - Autorização Formal ${funcionario.nome_completo}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            html, body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              font-size: 12px;
              background: white;
            }
            img {
              display: block;
              max-width: 100%;
            }
            h1 {
              font-size: 14px;
              font-weight: bold;
              text-align: center;
              margin: 10px 0;
            }
            .border-b {
              border-bottom: 2px solid #1f2937;
              padding-bottom: 8px;
            }
            .text-sm {
              font-size: 11px;
            }
            .text-xs {
              font-size: 10px;
            }
            .font-bold {
              font-weight: bold;
            }
            @media print {
              body::before, body::after {
                display: none !important;
              }
            }
          </style>
        </head>
        <body>
          ${printRef.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();

    const images = printWindow.document.images;
    let loadedImages = 0;
    const totalImages = images.length;

    if (totalImages === 0) {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }, 500);
    } else {
      Array.from(images).forEach((img) => {
        if (img.complete) {
          loadedImages++;
        } else {
          img.onload = () => {
            loadedImages++;
            if (loadedImages === totalImages) {
              printWindow.focus();
              printWindow.print();
              printWindow.close();
            }
          };
          img.onerror = () => {
            loadedImages++;
            if (loadedImages === totalImages) {
              printWindow.focus();
              printWindow.print();
              printWindow.close();
            }
          };
        }
      });

      if (loadedImages === totalImages) {
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }, 500);
      }

      setTimeout(() => {
        if (loadedImages < totalImages) {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }
      }, 3000);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-hidden p-0 flex flex-row"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <div className="flex-1 flex flex-col overflow-hidden">
          <SheetHeader className="px-6 py-4 border-b flex flex-row items-center justify-between sticky top-0 bg-white">
            <SheetTitle>Visualizar Autorização Formal</SheetTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEditor(!showEditor)}
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                {showEditor ? "Fechar" : "Editar"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleImprimir} className="gap-2">
                <Download className="w-4 h-4" />
                Imprimir
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-auto p-6" key={JSON.stringify(settings)}>
            <div
              id="autorizacao-formal-print-content"
              ref={printRef}
              className="bg-white"
              style={{
                fontFamily: "Arial, sans-serif",
                width: "100%",
                maxWidth: "1200px",
                margin: "0 auto",
              }}
            >
              {/* Logo e Título */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "15px",
                  marginBottom: "15px",
                  paddingBottom: "10px",
                  borderBottom: "1px solid #000",
                }}
              >
                {empresaAtiva?.logo_url && (
                  <img
                    src={empresaAtiva.logo_url}
                    alt="Logo"
                    style={{ height: "40px", width: "auto", objectFit: "contain" }}
                  />
                )}
                <div style={{ textAlign: "center", flex: 1 }}>
                  <h1
                    style={{ fontSize: "13px", fontWeight: "bold", margin: "0", lineHeight: "1.3" }}
                  >
                    Autorização Formal para fins de cumprimento da NR-10, NR-33 e NR-35
                  </h1>
                </div>
              </div>

              {/* Empresa */}
              <div
                style={{
                  textAlign: "center",
                  fontSize: "11px",
                  fontWeight: "bold",
                  marginBottom: "12px",
                  paddingBottom: "8px",
                  borderBottom: "1px solid #000",
                }}
              >
                EMPRESA: {empresaAtiva?.nome || "[EMPRESA]"}
              </div>

              {/* Parágrafo Introdutório com Destaques */}
              <div
                style={{
                  fontSize: "10px",
                  marginBottom: "12px",
                  textAlign: "justify",
                  lineHeight: "1.4",
                }}
              >
                Pelo presente documento, eu,{" "}
                <span style={{ backgroundColor: "#FFFF00", fontWeight: "bold", padding: "0 2px" }}>
                  Responsável Técnico
                </span>
                , designado pelo Responsável Técnico pela Empresa para as funções de Responsável
                Técnico-ET pela implantação da Norma(s)/Regulamentação(ões) NR(s) 10, 33, 35,
                declaro que o empregado,{" "}
                <span style={{ backgroundColor: "#90EE90", fontWeight: "bold", padding: "0 2px" }}>
                  {funcionario.nome_completo || "Nome do Funcionário"}
                </span>
                , empregado(a) desta empresa, ocupante da{" "}
                <span style={{ backgroundColor: "#FFB6C1", fontWeight: "bold", padding: "0 2px" }}>
                  {funcionario.funcao_nome || "função"}
                </span>{" "}
                está autorizado(a) formalmente pela Empresa a realizar a(s) atividade(s) abaixo:
              </div>

              {/* Checkboxes de Autorização */}
              <div style={{ fontSize: "10px", marginBottom: "12px", lineHeight: "1.5" }}>
                <div style={{ marginBottom: "6px", display: "flex", gap: "6px" }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: "1px", flexShrink: 0, width: "14px", height: "14px" }}
                  />
                  <div>
                    Intervenções em Sistema Elétrico de Potência com código de autorização "00"
                    Autorizado a auxiliar na execução de serviços no SEP sem contudo executar
                    atividades que requeiram intervenção diretamente no mesmo.
                  </div>
                </div>

                <div style={{ marginBottom: "6px", display: "flex", gap: "6px" }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: "1px", flexShrink: 0, width: "14px", height: "14px" }}
                  />
                  <div>
                    Atividades em Espaço Confinado atendido ao disposto na NR-33 na função:
                    <div style={{ marginLeft: "20px", marginTop: "4px" }}>
                      <div style={{ marginBottom: "3px" }}>
                        <input
                          type="checkbox"
                          style={{ marginRight: "4px", width: "13px", height: "13px" }}
                        />
                        <span>Supervisor de Entrada</span>
                      </div>
                      <div>
                        <input
                          type="checkbox"
                          style={{ marginRight: "4px", width: "13px", height: "13px" }}
                        />
                        <span>Vigia/Trabalhador Autorizado</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: "6px", display: "flex", gap: "6px" }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: "1px", flexShrink: 0, width: "14px", height: "14px" }}
                  />
                  <div>
                    Atividades em Altura atendido ao disposto na NR-35. Abrangendo Trabalhos em:
                    <div style={{ marginLeft: "20px", marginTop: "4px" }}>
                      <div style={{ marginBottom: "3px" }}>
                        <input
                          type="checkbox"
                          style={{ marginRight: "4px", width: "13px", height: "13px" }}
                        />
                        <span>Estruturas de RDA</span>
                      </div>
                      <div style={{ marginBottom: "3px" }}>
                        <input
                          type="checkbox"
                          style={{ marginRight: "4px", width: "13px", height: "13px" }}
                        />
                        <span>Telhado</span>
                      </div>
                      <div>
                        <input
                          type="checkbox"
                          style={{ marginRight: "4px", width: "13px", height: "13px" }}
                        />
                        <span>Plataforma elevatórias ou andaimes</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: "6px", display: "flex", gap: "6px" }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: "1px", flexShrink: 0, width: "14px", height: "14px" }}
                  />
                  <div>Outros</div>
                </div>

                <div
                  style={{
                    marginBottom: "12px",
                    display: "flex",
                    gap: "6px",
                    border: "1px solid #000",
                    padding: "6px",
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ marginTop: "1px", flexShrink: 0, width: "14px", height: "14px" }}
                  />
                  <div style={{ fontWeight: "bold" }}>
                    Empregado em fase de adaptação profissional. Vigência da autorização:
                  </div>
                </div>
              </div>

              {/* Conteúdo do Modelo */}
              <div
                style={{
                  border: "1px solid #000",
                  padding: "12px",
                  marginBottom: "12px",
                  minHeight: "100px",
                  fontSize: "10px",
                  lineHeight: "1.4",
                  whiteSpace: "pre-wrap",
                }}
              >
                {funcao.modelo_autorizacao_formal || "Conteúdo do modelo de autorização formal..."}
              </div>

              {/* Assinaturas */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "40px",
                  marginTop: "30px",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{ borderBottom: "1px solid #000", height: "40px", marginBottom: "6px" }}
                  ></div>
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: "bold",
                      backgroundColor: "#90EE90",
                      padding: "4px",
                      lineHeight: "1.3",
                    }}
                  >
                    {funcionario.nome_completo || "Funcionário"}
                    <br />
                    CPF: {funcionario.cpf || "_________"}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{ borderBottom: "1px solid #000", height: "40px", marginBottom: "6px" }}
                  ></div>
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: "bold",
                      backgroundColor: "#FFFF00",
                      padding: "4px",
                      lineHeight: "1.3",
                    }}
                  >
                    Responsável Técnico
                    <br />
                    _________________
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Editor Panel */}
        {showEditor && <EPIEditorPanel settings={settings} onSettingsChange={setSettings} />}
      </SheetContent>
    </Sheet>
  );
}
