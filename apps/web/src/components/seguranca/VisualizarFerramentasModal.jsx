import React, { useRef, useState, useEffect } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Download, Settings, Send, Loader2 } from "lucide-react";
import EPIEditorPanel from "./EPIEditorPanel";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { toast } from "sonner";

export default function VisualizarFerramentasModal({
  open,
  onOpenChange,
  funcionario,
  ferramentas,
  empresaAtiva,
}) {
  const printRef = useRef(null);
  const [showEditor, setShowEditor] = useState(false);
  const [enviandoAssinatura, setEnviandoAssinatura] = useState(false);

  const handleEnviarParaAssinar = async () => {
    if (!funcionario?.telefone) {
      toast.error("Funcionário não possui telefone cadastrado");
      return;
    }
    setEnviandoAssinatura(true);
    try {
      const res = await sigo.functions.invoke("enviarDocumentoAssinafy", {
        tipo: "ferramenta",
        funcionario_id: funcionario.id,
        empresa_id: empresaAtiva?.id,
      });
      toast.success(`Ficha enviada via WhatsApp para ${funcionario.telefone}`);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Erro ao enviar para assinatura");
    } finally {
      setEnviandoAssinatura(false);
    }
  };
  const [settings, setSettings] = useState(() => {
    return safeParseJSON(localStorage.getItem("ferramentas-modal-settings"), {
      fontSizeTitulo: 14,
      fontSizeTabela: 11,
      fontSizeDados: 10,
      fontSizeRodape: 10,
      alturaLinhaTabela: 20,
      alturaAssinatura: 35,
      margemSuperior: 10,
      margemInferior: 10,
      paddingCelula: 6,
      alturaLogo: 70,
      margemLogo: 20,
      espacoInferiorCabecalho: 12,
      espacoDados: 8,
      fontSizeLabels: 10,
      columnWidths: [7, 7, 5, 20, 8, 23, 20],
    });
  });

  useEffect(() => {
    localStorage.setItem("ferramentas-modal-settings", JSON.stringify(settings));
  }, [settings]);

  const handleImprimir = () => {
    const printRef = document.getElementById("ferramentas-print-content");
    const printWindow = window.open("", "", "height=800,width=1200");

    printWindow.document.write(`
      <html>
        <head>
          <title>Impressão - Ferramentas ${funcionario.nome_completo}</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 10mm;
              margin-top: 0;
              margin-bottom: 0;
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
            div[style*="pageBreakAfter"] {
              page-break-after: always;
              break-after: page;
              margin: 0;
              padding: 0;
            }
            div[style*="pageBreakAfter"]:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              font-size: 11px;
            }
            table td, table th {
              border: 1px solid #000;
              padding: 6px;
              text-align: left;
            }
            table th {
              background-color: #e5e5e5;
              font-weight: bold;
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

    // Aguardar o carregamento das imagens antes de imprimir
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

  const [movimentacoes, setMovimentacoes] = useState({});
  const [estoque, setEstoque] = useState([]);

  // Carregar movimentações ao abrir modal
  useEffect(() => {
    if (open && ferramentas.length > 0) {
      carregarMovimentacoes();
    }
  }, [open, ferramentas]);

  const carregarMovimentacoes = async () => {
    try {
      const { sigo } = await import("@/api/sigoClient");
      const ferramentaIds = ferramentas.map((f) => f.id);
      const movs = await sigo.asServiceRole.entities.MovimentacaoFerramenta.filter({
        status: "Realizada",
      });

      // Mapear última movimentação por ferramenta
      const ultimasMovs = {};
      ferramentaIds.forEach((ferrId) => {
        const movsDoFerr = movs.filter((m) => m.ferramenta_id === ferrId);
        if (movsDoFerr.length > 0) {
          ultimasMovs[ferrId] = movsDoFerr[movsDoFerr.length - 1];
        }
      });

      setMovimentacoes(ultimasMovs);
    } catch (error) {
      console.error("Erro ao carregar movimentações:", error);
    }
  };

  const ferramentasOrdenadas = [...ferramentas].sort((a, b) =>
    (a.ferramenta || a.descricao || "").localeCompare(b.ferramenta || b.descricao || "")
  );

  const ferramentasPagina1 = ferramentasOrdenadas.slice(0, 45);
  const ferramentasPagina2 = ferramentasOrdenadas.slice(45);

  const renderPage = (ferramentasPage, isSecondPage = false) => (
    <div style={{ pageBreakAfter: "always", marginBottom: 0 }}>
      {/* Cabeçalho com Logo */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: `${settings.espacoInferiorCabecalho}px`,
          paddingBottom: `${settings.espacoInferiorCabecalho}px`,
          borderBottom: "3px solid #000",
          gap: `${settings.margemLogo}px`,
        }}
      >
        <div style={{ minWidth: "80px" }}>
          {empresaAtiva?.logo_url && (
            <img
              src={empresaAtiva.logo_url}
              alt="Logo"
              style={{
                maxHeight: `${settings.alturaLogo * 2}px`,
                maxWidth: "300px",
                objectFit: "contain",
              }}
            />
          )}
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <h1
            style={{
              fontSize: `${settings.fontSizeTitulo}px`,
              fontWeight: "bold",
              margin: "0",
              lineHeight: "1.4",
              letterSpacing: "0.5px",
            }}
          >
            FICHA DE CONTROLE DE ENTREGA DE FERRAMENTAS
          </h1>
          {isSecondPage && (
            <p style={{ fontSize: `${settings.fontSizeDados}px`, marginTop: "6px" }}>
              (Continuação)
            </p>
          )}
        </div>
      </div>

      {/* Dados do Funcionário */}
      {!isSecondPage && (
        <div
          style={{
            marginBottom: `${settings.espacoDados}px`,
            fontSize: `${settings.fontSizeLabels}px`,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "0",
              marginBottom: "4px",
            }}
          >
            <div style={{ borderBottom: "1px solid #000", paddingBottom: "2px" }}>
              <div style={{ fontWeight: "bold", fontSize: `${settings.fontSizeLabels}px` }}>
                NOME:
              </div>
              <div style={{ marginTop: "2px", fontSize: `${settings.fontSizeLabels}px` }}>
                {funcionario.nome_completo}
              </div>
            </div>
            <div
              style={{ borderBottom: "1px solid #000", paddingBottom: "2px", paddingLeft: "20px" }}
            >
              <div style={{ fontWeight: "bold", fontSize: `${settings.fontSizeLabels}px` }}>
                Nº DE REGISTRO:
              </div>
              <div style={{ marginTop: "2px", fontSize: `${settings.fontSizeLabels}px` }}>
                {funcionario.numero_registro || funcionario.cpf}
              </div>
            </div>
            <div
              style={{ borderBottom: "1px solid #000", paddingBottom: "2px", paddingLeft: "20px" }}
            >
              <div style={{ fontWeight: "bold", fontSize: `${settings.fontSizeLabels}px` }}>
                DATA DE ADMISSÃO:
              </div>
              <div style={{ marginTop: "2px", fontSize: `${settings.fontSizeLabels}px` }}>
                {funcionario.data_admissao
                  ? format(new Date(funcionario.data_admissao), "dd/MM/yyyy")
                  : ""}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0" }}>
            <div style={{ borderBottom: "1px solid #000", paddingBottom: "2px" }}>
              <div style={{ fontWeight: "bold", fontSize: `${settings.fontSizeLabels}px` }}>
                FUNÇÃO: {funcionario.funcao_nome}
              </div>
            </div>
            <div
              style={{ borderBottom: "1px solid #000", paddingBottom: "2px", paddingLeft: "20px" }}
            >
              <div style={{ fontWeight: "bold", fontSize: `${settings.fontSizeLabels}px` }}>
                SEÇÃO: OPERACIONAL
              </div>
            </div>
            <div
              style={{ borderBottom: "1px solid #000", paddingBottom: "2px", paddingLeft: "20px" }}
            >
              <div style={{ fontWeight: "bold", fontSize: `${settings.fontSizeLabels}px` }}>
                DATA DE DEMISSÃO:
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Informativo */}
      {!isSecondPage && (
        <div className="mb-3 text-xs bg-gray-50 p-2 border border-gray-300">
          <p className="text-justify mb-3">
            Declaro sob minha inteira responsabilidade a guarda e conservação das ferramentas e os
            equipamentos de proteção coletiva (EPC's) constantes nesta ficha – controle. Assumo
            também a responsabilidade de devolver integralmente ou parcialmente, quando solicitado,
            ou por ocasião de eventual rescisão de contrato, na data do respectivo aviso de qualquer
            das partes. Também estou ciente que, na eventualidade de danificar ou extraviar o
            equipamento por ato doloso ou culposo, estarei sujeito ao desconto do valor em meu
            salário, conforme parágrafo único do art. 158 da CLT. Também me comprometo a utilizar de
            forma correta e de acordo com as instruções de treinamento referentes ao uso correto, a
            forma de guardar, conservação e higienização das Ferramentas e EPC's, recebidas na
            presente data, fornecidas por profissional Técnico de Segurança do Trabalho. Também
            estou ciente que a não utilização dos mesmos em minhas atividades profissionais, é ato
            faltoso e passível de punições legais e disciplinares de acordo com a Consolidação das
            Leis do Trabalho (CLT) – Capitulo V – Seção I – Art. 158º. c/c Norma Regulamentadora
            (NR) – NR – 1 e NR – 6, alínea 6.7, disciplinadas pela Portaria MTB. n° 3.214/78 e
            artigo 191, itens I e II da CLT e súmula n° 80 do TST. Além do referido treinamento,
            declaro ter recebido orientações sobre os danos da exposição aos riscos,
            comprometendo-me a requisitar a reposição dos EPC's e ferramentas, caso haja
            necessidade, ou com a periodicidade normal requerida. Por ser verdade e dou fé, assino a
            presente.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div style={{ borderBottom: "1px solid #000", paddingBottom: "2px" }}>
              <div style={{ fontWeight: "bold", fontSize: "10px" }}>LOCAL:</div>
            </div>
            <div style={{ borderBottom: "1px solid #000", paddingBottom: "2px" }}>
              <div style={{ fontWeight: "bold", fontSize: "10px" }}>
                DATA DA EMISSÃO: __/__/____
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabela de Ferramentas */}
      <table
        className="w-full border-collapse border border-gray-800 text-xs mb-4"
        style={{ fontSize: `${settings.fontSizeTabela}px` }}
      >
        <thead>
          <tr className="bg-gray-200">
            <th
              className="border border-gray-800 text-left font-bold"
              style={{
                width: `${settings.columnWidths?.[0] || 7}%`,
                padding: `${settings.paddingCelula}px`,
              }}
            >
              RETIRADA
            </th>
            <th
              className="border border-gray-800 text-left font-bold"
              style={{
                width: `${settings.columnWidths?.[1] || 7}%`,
                padding: `${settings.paddingCelula}px`,
              }}
            >
              DEVOLUÇÃO
            </th>
            <th
              className="border border-gray-800 text-center font-bold"
              style={{
                width: `${settings.columnWidths?.[2] || 5}%`,
                padding: `${settings.paddingCelula}px`,
              }}
            >
              QUANT.
            </th>
            <th
              className="border border-gray-800 text-left font-bold"
              style={{
                width: `${settings.columnWidths?.[3] || 20}%`,
                padding: `${settings.paddingCelula}px`,
              }}
            >
              DESCRIÇÃO DO EQUIPAMENTO
            </th>
            <th
              className="border border-gray-800 text-center font-bold"
              style={{
                width: `${settings.columnWidths?.[4] || 8}%`,
                padding: `${settings.paddingCelula}px`,
              }}
            >
              Nº DE SÉRIE
            </th>
            <th
              className="border border-gray-800 text-center font-bold"
              style={{
                width: `${settings.columnWidths?.[5] || 23}%`,
                padding: `${settings.paddingCelula}px`,
              }}
            >
              ASSINATURA DO FUNCIONÁRIO
            </th>
            <th
              className="border border-gray-800 text-center font-bold"
              style={{
                width: `${settings.columnWidths?.[6] || 20}%`,
                padding: `${settings.paddingCelula}px`,
              }}
            >
              RESPONSÁVEL PELA ENTREGA
            </th>
          </tr>
        </thead>
        <tbody>
          {ferramentasPage.map((ferramenta, idx) => {
            const moviStr = movimentacoes[ferramenta.id];
            const dataAssinatura = moviStr?.data_hora_assinatura
              ? new Date(moviStr.data_hora_assinatura).toLocaleDateString("pt-BR")
              : "";

            return (
              <tr key={idx} style={{ height: `${settings.alturaLinhaTabela}px` }}>
                <td
                  className="border border-gray-800"
                  style={{
                    width: `${settings.columnWidths?.[0] || 7}%`,
                    padding: `${settings.paddingCelula}px`,
                  }}
                >
                  __/__/____
                </td>
                <td
                  className="border border-gray-800"
                  style={{
                    width: `${settings.columnWidths?.[1] || 7}%`,
                    padding: `${settings.paddingCelula}px`,
                  }}
                >
                  {dataAssinatura}
                </td>
                <td
                  className="border border-gray-800 text-center"
                  style={{
                    width: `${settings.columnWidths?.[2] || 5}%`,
                    padding: `${settings.paddingCelula}px`,
                  }}
                >
                  {ferramenta.quantidade || 1}
                </td>
                <td
                  className="border border-gray-800"
                  style={{
                    width: `${settings.columnWidths?.[3] || 20}%`,
                    padding: `${settings.paddingCelula}px`,
                    fontSize: `${settings.fontSizeDados}px`,
                  }}
                >
                  {ferramenta.ferramenta || ferramenta.descricao || ""}
                </td>
                <td
                  className="border border-gray-800"
                  style={{
                    width: `${settings.columnWidths?.[4] || 8}%`,
                    padding: `${settings.paddingCelula}px`,
                  }}
                >
                  {ferramenta.numero_serie || ""}
                </td>
                <td
                  className="border border-gray-800"
                  style={{
                    width: `${settings.columnWidths?.[5] || 23}%`,
                    padding: `${settings.paddingCelula}px`,
                  }}
                >
                  {moviStr?.assinatura_url && (
                    <img
                      src={moviStr.assinatura_url}
                      alt="Assinatura"
                      style={{ maxHeight: "30px", maxWidth: "100%" }}
                    />
                  )}
                </td>
                <td
                  className="border border-gray-800 text-center"
                  style={{
                    width: `${settings.columnWidths?.[6] || 20}%`,
                    padding: `${settings.paddingCelula}px`,
                  }}
                ></td>
              </tr>
            );
          })}
          {/* Linhas em branco para preenchimento */}
          {[...Array(Math.max(0, 45 - ferramentasPage.length))].map((_, idx) => (
            <tr key={`empty-${idx}`} style={{ height: `${settings.alturaLinhaTabela}px` }}>
              <td
                className="border border-gray-800"
                style={{
                  width: `${settings.columnWidths?.[0] || 7}%`,
                  padding: `${settings.paddingCelula}px`,
                }}
              >
                __/__/____
              </td>
              <td
                className="border border-gray-800"
                style={{
                  width: `${settings.columnWidths?.[1] || 7}%`,
                  padding: `${settings.paddingCelula}px`,
                }}
              >
                __/__/____
              </td>
              <td
                className="border border-gray-800"
                style={{
                  width: `${settings.columnWidths?.[2] || 5}%`,
                  padding: `${settings.paddingCelula}px`,
                }}
              ></td>
              <td
                className="border border-gray-800"
                style={{
                  width: `${settings.columnWidths?.[3] || 20}%`,
                  padding: `${settings.paddingCelula}px`,
                }}
              ></td>
              <td
                className="border border-gray-800"
                style={{
                  width: `${settings.columnWidths?.[4] || 8}%`,
                  padding: `${settings.paddingCelula}px`,
                }}
              ></td>
              <td
                className="border border-gray-800"
                style={{
                  width: `${settings.columnWidths?.[5] || 23}%`,
                  padding: `${settings.paddingCelula}px`,
                }}
              ></td>
              <td
                className="border border-gray-800"
                style={{
                  width: `${settings.columnWidths?.[6] || 20}%`,
                  padding: `${settings.paddingCelula}px`,
                }}
              ></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Assinaturas */}
      <div className="mt-3 pt-2" style={{ borderTop: "1px solid #1f2937" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "30px",
            fontSize: `${settings.fontSizeRodape}px`,
            marginTop: "8px",
          }}
        >
          <div>
            <div
              style={{
                borderBottom: "1px solid #1f2937",
                height: `${settings.alturaAssinatura}px`,
                marginBottom: "2px",
              }}
            ></div>
            <div style={{ textAlign: "center", fontWeight: "bold" }}>Assinatura do Funcionário</div>
          </div>
          <div>
            <div
              style={{
                borderBottom: "1px solid #1f2937",
                height: `${settings.alturaAssinatura}px`,
                marginBottom: "2px",
              }}
            ></div>
            <div style={{ textAlign: "center", fontWeight: "bold" }}>Responsável pela Entrega</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-hidden p-0 flex flex-row w-full"
        data-fullscreen-modal
      >
        <div className="flex-1 flex flex-col overflow-hidden">
          <SheetHeader className="px-6 py-4 border-b flex flex-row items-center justify-between sticky top-0 bg-white">
            <SheetTitle>Visualizar Lista de Ferramentas</SheetTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnviarParaAssinar}
                disabled={enviandoAssinatura}
                className="gap-2 border-green-500 text-green-700 hover:bg-green-50"
              >
                {enviandoAssinatura ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {enviandoAssinatura ? "Enviando..." : "Assinar via WhatsApp"}
              </Button>
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
              id="ferramentas-print-content"
              ref={printRef}
              className="bg-white"
              style={{
                fontFamily: "Arial, sans-serif",
                width: "100%",
                maxWidth: "1200px",
                margin: "0 auto",
              }}
            >
              {/* Página 1 */}
              {renderPage(ferramentasPagina1, false)}

              {/* Página 2 (se houver ferramentas) */}
              {ferramentasPagina2.length > 0 && renderPage(ferramentasPagina2, true)}
            </div>
          </div>
        </div>

        {/* Editor Panel */}
        {showEditor && <EPIEditorPanel settings={settings} onSettingsChange={setSettings} />}
      </SheetContent>
    </Sheet>
  );
}
