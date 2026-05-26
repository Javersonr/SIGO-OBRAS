import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { gerarCertificadoDoc } from "./certificadoLayout";

export default function ExportacaoMassaModal({
  open,
  onOpenChange,
  funcionariosSelecionados,
  empresaAtiva,
}) {
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [todosTreinamentos, setTodosTreinamentos] = useState([]);

  useEffect(() => {
    if (open && empresaAtiva?.id) {
      loadTreinamentos();
    }
  }, [open, empresaAtiva?.id]);

  const loadTreinamentos = async () => {
    try {
      const data = await sigo.entities.Treinamento.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });
      setTodosTreinamentos(data);
    } catch (error) {
      console.error("Erro ao carregar treinamentos:", error);
    }
  };

  const gerarCertificadoPDF = async (_jsPDF, funcionario, treinamento) => {
    const doc = await gerarCertificadoDoc({ treinamento, funcionario, empresaAtiva });
    return doc.output("blob");
  };

  // Gera PDF de lista de presença para um funcionário com todos seus treinamentos
  const gerarListaPresencaPDF = async (jsPDF, funcionario, treinamentosFunc) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    const nomeEmpresa =
      empresaAtiva.razao_social || empresaAtiva.nome_fantasia || empresaAtiva.nome;

    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("LISTA DE PRESENÇA - TREINAMENTOS", pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(`Empresa: ${nomeEmpresa}`, 14, 30);
    doc.text(`Funcionário: ${funcionario.nome_completo}`, 14, 37);
    doc.text(`CPF: ${funcionario.cpf || "-"}`, 14, 44);
    doc.text(`Função: ${funcionario.funcao_nome || "-"}`, 14, 51);
    doc.text(
      `Data de Admissão: ${funcionario.data_admissao ? funcionario.data_admissao.split("-").reverse().join("/") : "-"}`,
      14,
      58
    );

    // Linha separadora
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 63, pageWidth - 14, 63);

    // Cabeçalho da tabela
    let y = 72;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y - 5, pageWidth - 28, 8, "F");
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Treinamento", 16, y);
    doc.text("Cód.", 105, y);
    doc.text("Carga", 125, y);
    doc.text("Período", 145, y);
    doc.text("Assinatura", 175, y);
    y += 8;

    doc.setFont(undefined, "normal");
    doc.setFontSize(8);
    treinamentosFunc.forEach((t, i) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(14, y - 4, pageWidth - 28, 8, "F");
      }
      doc.setTextColor(40, 40, 40);
      const nomeT = doc.splitTextToSize(t.nome, 85);
      doc.text(nomeT[0], 16, y);
      doc.text(t.codigo || "-", 105, y);
      doc.text(t.carga_horaria ? `${t.carga_horaria}h` : "-", 125, y);
      const periodo =
        t.data_inicio && t.data_fim
          ? `${t.data_inicio.split("-").reverse().join("/")} a ${t.data_fim.split("-").reverse().join("/")}`
          : "-";
      doc.text(periodo, 145, y);
      // Linha para assinatura
      doc.setDrawColor(150, 150, 150);
      doc.line(175, y, pageWidth - 14, y);
      y += 10;
    });

    // Rodapé com assinatura do funcionário
    y += 10;
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setDrawColor(0, 0, 0);
    doc.line(14, y + 15, 90, y + 15);
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.setTextColor(80, 80, 80);
    doc.text("Assinatura do Funcionário", 52, y + 20, { align: "center" });
    doc.text(funcionario.nome_completo, 52, y + 25, { align: "center" });

    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, pageWidth - 14, y + 25, {
      align: "right",
    });

    return doc.output("blob");
  };

  const handleExportarMassa = async () => {
    if (!funcionariosSelecionados || funcionariosSelecionados.length === 0) {
      toast.error("Nenhum funcionário selecionado");
      return;
    }

    setLoading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const zip = new JSZip();
      let totalCertificados = 0;
      let totalFuncionarios = 0;

      for (const funcionario of funcionariosSelecionados) {
        setProgresso(`Processando ${funcionario.nome_completo}...`);

        // Buscar treinamentos da função do funcionário
        let treinamentosFunc = todosTreinamentos.filter(
          (t) => t.funcao_id === funcionario.funcao_id
        );
        if (treinamentosFunc.length === 0 && funcionario.funcao_id) {
          // Buscar direto do banco caso não tenha carregado ainda
          try {
            treinamentosFunc = await sigo.entities.Treinamento.filter({
              empresa_id: empresaAtiva.id,
              funcao_id: funcionario.funcao_id,
              ativo: true,
            });
          } catch {}
        }

        if (treinamentosFunc.length === 0) continue;

        const nomePasta = funcionario.nome_completo.replace(/[^a-z0-9 ]/gi, "_").trim();
        const pasta = zip.folder(nomePasta);

        // Gerar um certificado PDF por treinamento
        for (const treinamento of treinamentosFunc) {
          try {
            const pdfBlob = await gerarCertificadoPDF(jsPDF, funcionario, treinamento);
            const nomeTreinamento = treinamento.nome.replace(/[^a-z0-9 ]/gi, "_").trim();
            pasta.file(`Certificado_${nomeTreinamento}.pdf`, pdfBlob);
            totalCertificados++;
          } catch (err) {
            console.error(`Erro certificado ${treinamento.nome}:`, err);
          }
        }

        // Gerar lista de presença do funcionário
        try {
          const listaBlob = await gerarListaPresencaPDF(jsPDF, funcionario, treinamentosFunc);
          pasta.file(`Lista_de_Presenca_${nomePasta}.pdf`, listaBlob);
        } catch (err) {
          console.error(`Erro lista presença ${funcionario.nome_completo}:`, err);
        }

        totalFuncionarios++;
      }

      if (totalFuncionarios === 0) {
        toast.error("Nenhum funcionário com treinamentos encontrados.");
        return;
      }

      setProgresso("Gerando arquivo ZIP...");
      const conteudo = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      saveAs(conteudo, `treinamentos_${new Date().toISOString().split("T")[0]}.zip`);
      toast.success(
        `✅ ${totalFuncionarios} funcionário(s) exportados com ${totalCertificados} certificados`
      );
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao exportar: " + error.message);
    } finally {
      setLoading(false);
      setProgresso("");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0 flex flex-col w-full">
        <SheetHeader className="p-6 border-b sticky top-0 bg-white z-10">
          <SheetTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Exportação em Massa de Certificados
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Resumo dos funcionários selecionados */}
          <Card>
            <CardContent className="p-4">
              <h4 className="font-semibold text-slate-800 mb-3">
                Funcionários Selecionados ({(funcionariosSelecionados || []).length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(funcionariosSelecionados || []).map((f) => (
                  <div key={f.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{f.nome_completo}</p>
                      <p className="text-xs text-slate-500">
                        {f.funcao_nome || "Sem função definida"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="p-4 text-sm text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">O que será exportado:</p>
              <p>• Uma pasta por funcionário dentro do ZIP</p>
              <p>• Um certificado PDF por treinamento da função</p>
              <p>• Uma lista de presença consolidada por funcionário</p>
            </CardContent>
          </Card>

          {progresso && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-700">{progresso}</p>
            </div>
          )}

          {/* Botão de Exportação */}
          <Button
            onClick={handleExportarMassa}
            disabled={loading || !funcionariosSelecionados?.length}
            className="w-full bg-amber-500 hover:bg-amber-600 gap-2"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Exportar {funcionariosSelecionados?.length || 0} Funcionário(s) em ZIP
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
