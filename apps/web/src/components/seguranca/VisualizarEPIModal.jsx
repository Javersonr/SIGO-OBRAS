import React, { useRef, useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Download, Settings, Upload, Send, Loader2 } from "lucide-react";
import EPIEditorPanel from "./EPIEditorPanel";
import ImportarTreinamentosZip from "./ImportarTreinamentosZip";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { toast } from "sonner";

export default function VisualizarEPIModal({
  open,
  onOpenChange,
  funcionario,
  epis,
  empresaAtiva,
}) {
  const printRef = useRef(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showImportarZip, setShowImportarZip] = useState(false);
  const [enviandoAssinatura, setEnviandoAssinatura] = useState(false);

  const handleEnviarParaAssinar = async () => {
    if (!funcionario?.telefone) {
      toast.error("Funcionário não possui telefone cadastrado");
      return;
    }
    setEnviandoAssinatura(true);
    try {
      await sigo.functions.invoke("enviarDocumentoAssinafy", {
        tipo: "epi",
        funcionario_id: funcionario.id,
        empresa_id: empresaAtiva?.id,
      });
      toast.success(`Ficha de EPI enviada via WhatsApp para ${funcionario.telefone}`);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Erro ao enviar para assinatura");
    } finally {
      setEnviandoAssinatura(false);
    }
  };
  const [episEntregues, setEpisEntregues] = useState([]);
  const [settings, setSettings] = useState(() => {
    return safeParseJSON(localStorage.getItem("epi-modal-settings"), {
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
    localStorage.setItem("epi-modal-settings", JSON.stringify(settings));
  }, [settings]);

  // Buscar EPIs entregues para o funcionário
  useEffect(() => {
    const carregarEpisEntregues = async () => {
      if (!funcionario?.id || !empresaAtiva?.id) return;

      try {
        // Buscar movimentações de entrega
        const movimentacoes = await sigo.entities.MovimentacaoFerramenta.filter({
          empresa_id: empresaAtiva.id,
          funcionario_id: funcionario.id,
          tipo_movimentacao: "Entrega para Funcionário",
          status: "Realizada",
        });

        if (movimentacoes.length === 0) {
          setEpisEntregues([]);
          return;
        }

        // Buscar todas as ferramentas entregues que são do tipo EPI
        const ferramentasIds = movimentacoes.map((m) => m.ferramenta_id).filter(Boolean);
        const ferramentas = await sigo.entities.Ferramenta.filter({
          empresa_id: empresaAtiva.id,
          tipo: "EPI",
          ativo: true,
        });

        // Mapear apenas os EPIs que foram entregues
        const episMapeados = [];
        for (const mov of movimentacoes) {
          const ferramenta = ferramentas.find((f) => f.id === mov.ferramenta_id);
          if (ferramenta) {
            episMapeados.push({
              quantidade: mov.quantidade || 1,
              descricao: ferramenta.descricao,
              ca: ferramenta.ca || "",
            });
          }
        }

        setEpisEntregues(episMapeados);
      } catch (error) {
        console.error("Erro ao carregar EPIs entregues:", error);
        setEpisEntregues([]);
      }
    };

    carregarEpisEntregues();
  }, [funcionario?.id, empresaAtiva?.id, open]);

  const handleImprimir = () => {
    const printRef = document.getElementById("epi-print-content");
    const printWindow = window.open("", "", "height=800,width=1200");

    printWindow.document.write(`
      <html>
        <head>
          <title>Impressão - EPI ${funcionario.nome_completo}</title>
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
      // Sem imagens, imprimir imediatamente
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }, 500);
    } else {
      // Aguardar carregamento de todas as imagens
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

      // Se todas já estiverem carregadas
      if (loadedImages === totalImages) {
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }, 500);
      }

      // Timeout de segurança - imprimir após 3 segundos mesmo que imagens não carreguem
      setTimeout(() => {
        if (loadedImages < totalImages) {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }
      }, 3000);
    }
  };

  // Mesclar EPIs do modelo com EPIs entregues
  const episMerged = useMemo(() => {
    const todosEpis = [...epis];

    // Adicionar EPIs entregues que não estão no modelo
    episEntregues.forEach((epiEntregue) => {
      const jaExiste = todosEpis.some((e) => (e.descricao || e.item) === epiEntregue.descricao);
      if (!jaExiste) {
        todosEpis.push(epiEntregue);
      }
    });

    // Atualizar quantidades dos EPIs que já existem
    return todosEpis.map((epi) => {
      const epiEntregue = episEntregues.find((e) => e.descricao === (epi.descricao || epi.item));
      if (epiEntregue) {
        return {
          ...epi,
          quantidade: epiEntregue.quantidade,
          ca: epiEntregue.ca || epi.ca || "",
        };
      }
      return epi;
    });
  }, [epis, episEntregues]);

  const episOrdenados = [...episMerged].sort((a, b) =>
    (a.item || a.descricao || "").localeCompare(b.item || b.descricao || "")
  );

  // Dividir EPIs em 2 páginas (máximo 45 por página)
  const episPagina1 = episOrdenados.slice(0, 45);
  const episPagina2 = episOrdenados.slice(45);

  const renderPage = (epicsPage, isSecondPage = false) => (
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
            FICHA DE CONTROLE E ENTREGA DE EQUIPAMENTO DE PROTEÇÃO INDIVIDUAL (EPI) E UNIFORME
          </h1>
          {isSecondPage && (
            <p style={{ fontSize: `${settings.fontSizeDados}px`, marginTop: "6px" }}>
              (Continuação)
            </p>
          )}
        </div>
      </div>

      {/* Dados do Funcionário - simplificado na segunda página */}
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

      {/* Informativo - apenas na primeira página */}
      {!isSecondPage && (
        <div className="mb-3 text-xs bg-gray-50 p-2 border border-gray-300">
          <p className="text-justify mb-3">
            Recebo da Empresa ELETRO ENERGIA LTDA, CNPJ nº 30.694.170/0001-84, para meu uso
            obrigatório os EPI's (documentos de proteção individual) constantes nesta ficha, o qual
            cumpri a utiliza-los corretamente durante o tempo que permanece ao meu dispor, observado
            o mesmo padrão de disciplina e uso que integram o KR-06 - Equipamento de Proteção
            Individual - EPI's da portaria nº 3.214 de 08/junho/1970. Declaro saber também que
            tenhore-lo no meu desembarque, da empresa.
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

      {/* Tabela de EPIs */}
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
              Nº DO C.A.
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
          {epicsPage.map((epi, idx) => (
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
                __/__/____
              </td>
              <td
                className="border border-gray-800 text-center"
                style={{
                  width: `${settings.columnWidths?.[2] || 5}%`,
                  padding: `${settings.paddingCelula}px`,
                }}
              >
                {epi.quantidade || 1}
              </td>
              <td
                className="border border-gray-800"
                style={{
                  width: `${settings.columnWidths?.[3] || 20}%`,
                  padding: `${settings.paddingCelula}px`,
                  fontSize: `${settings.fontSizeDados}px`,
                }}
              >
                {epi.item || epi.descricao || ""}
              </td>
              <td
                className="border border-gray-800"
                style={{
                  width: `${settings.columnWidths?.[4] || 8}%`,
                  padding: `${settings.paddingCelula}px`,
                }}
              >
                {epi.ca || ""}
              </td>
              <td
                className="border border-gray-800"
                style={{
                  width: `${settings.columnWidths?.[5] || 23}%`,
                  padding: `${settings.paddingCelula}px`,
                }}
              ></td>
              <td
                className="border border-gray-800 text-center"
                style={{
                  width: `${settings.columnWidths?.[6] || 20}%`,
                  padding: `${settings.paddingCelula}px`,
                }}
              ></td>
            </tr>
          ))}
          {/* Linhas em branco para preenchimento */}
          {[...Array(Math.max(0, 45 - epicsPage.length))].map((_, idx) => (
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
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="h-full overflow-hidden p-0 flex flex-row w-full"
          data-fullscreen-modal
        >
          <div className="flex-1 flex flex-col overflow-hidden">
            <SheetHeader className="px-6 py-4 border-b flex flex-row items-center justify-between sticky top-0 bg-white">
              <SheetTitle>Visualizar Lista de EPIs</SheetTitle>
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
                  onClick={() => setShowImportarZip(true)}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Importar ZIP
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
                id="epi-print-content"
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
                {renderPage(episPagina1, false)}

                {/* Página 2 (se houver EPIs) */}
                {episPagina2.length > 0 && renderPage(episPagina2, true)}
              </div>
            </div>
          </div>

          {/* Editor Panel */}
          {showEditor && <EPIEditorPanel settings={settings} onSettingsChange={setSettings} />}
        </SheetContent>
      </Sheet>

      {/* Modal Importar Treinamentos */}
      <ImportarTreinamentosZip
        open={showImportarZip}
        onOpenChange={setShowImportarZip}
        funcionario={funcionario}
        empresaAtiva={empresaAtiva}
        onSave={() => {
          // Recarregar se necessário
        }}
      />
    </>
  );
}
