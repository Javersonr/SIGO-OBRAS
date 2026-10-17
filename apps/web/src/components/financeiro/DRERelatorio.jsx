import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { calcularDRE } from "@/lib/relatorios-financeiros";

export default function DRERelatorio({ transacoes, versao = "real", dataInicio, dataFim }) {
  // antes: custos = despesas com tipo_despesa "material" (coluna inexistente →
  // sempre 0), deduções fixas em 0 e "Lucro Líquido" = Lucro Operacional; agora
  // custos diretos = despesas pagas com projeto, deduções = ISS/INSS retidos na
  // medição e o resultado final é "antes de IR/CSLL" (não há IR/CSLL no sistema).
  const {
    receitaBruta: receitasBrutas,
    deducoes,
    receitaLiquida: receitasLiquidas,
    custosDiretos,
    lucroBruto,
    margemBruta,
    despesasOperacionais,
    resultadoAntesIR,
    margemAntesIR,
  } = calcularDRE(transacoes, versao);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const handleExportarCSV = () => {
    const dados = [
      ["Item", "Valor"],
      ["Receita Bruta", receitasBrutas],
      ["Deduções (ISS/INSS retidos)", deducoes],
      ["Receita Líquida", receitasLiquidas],
      ["Custos diretos de obra", custosDiretos],
      [`Lucro Bruto (${margemBruta.toFixed(1)}%)`, lucroBruto],
      ["Despesas Operacionais", despesasOperacionais],
      [`Resultado antes de IR/CSLL (${margemAntesIR.toFixed(1)}%)`, resultadoAntesIR],
    ];

    const csv = dados.map((row) => row.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `dre_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleExportarPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("DRE - Demonstração do Resultado", 14, 20);
    doc.setFontSize(10);
    doc.text(`Período: ${dataInicio || "Início"} a ${dataFim || "Hoje"}`, 14, 28);
    doc.text(`Regime: ${versao === "real" ? "Real" : "Contábil (NF-e)"}`, 14, 34);

    let y = 45;
    doc.setFontSize(12);

    const items = [
      { label: "Receita Bruta", valor: receitasBrutas, negrito: true },
      { label: "Deduções (ISS/INSS retidos)", valor: -deducoes },
      { label: "Receita Líquida", valor: receitasLiquidas, negrito: true },
      { label: "Custos diretos de obra", valor: -custosDiretos },
      { label: `Lucro Bruto (${margemBruta.toFixed(1)}%)`, valor: lucroBruto, negrito: true },
      { label: "Despesas Operacionais", valor: -despesasOperacionais },
      {
        label: `Resultado antes de IR/CSLL (${margemAntesIR.toFixed(1)}%)`,
        valor: resultadoAntesIR,
        negrito: true,
      },
    ];

    items.forEach((item) => {
      if (item.negrito) doc.setFont(undefined, "bold");
      doc.text(item.label, 14, y);
      // antes: Math.abs escondia o sinal de resultado negativo (prejuízo saía
      // igual a lucro); agora só as linhas de dedução/custo, que já são "(-)".
      doc.text(formatCurrency(item.negrito ? item.valor : Math.abs(item.valor)), 150, y);
      if (item.negrito) doc.setFont(undefined, "normal");
      y += 8;
    });

    doc.save(`dre_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const LinhaRelatorio = ({ label, valor, destaque = false, negrito = false, identacao = 0 }) => (
    <div
      className={`flex justify-between py-2 ${destaque ? "border-t-2 border-slate-300 pt-3" : "border-t border-slate-100"}`}
      style={{ paddingLeft: `${identacao * 20}px` }}
    >
      <span className={negrito ? "font-semibold text-slate-800" : "text-slate-700"}>{label}</span>
      <span
        className={`${negrito ? "font-bold" : "font-medium"} ${valor < 0 ? "text-red-600" : "text-slate-900"}`}
      >
        {formatCurrency(Math.abs(valor))}
      </span>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Demonstração do Resultado do Exercício (DRE)</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              {dataInicio && dataFim
                ? `Período: ${new Date(dataInicio).toLocaleDateString("pt-BR")} a ${new Date(dataFim).toLocaleDateString("pt-BR")}`
                : "Todos os períodos"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportarCSV}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportarPDF}>
              <FileDown className="w-4 h-4 mr-2" />
              PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <LinhaRelatorio label="(+) Receita Bruta" valor={receitasBrutas} negrito />
        <LinhaRelatorio label="(-) Deduções (ISS/INSS retidos)" valor={-deducoes} identacao={1} />
        <LinhaRelatorio label="(=) Receita Líquida" valor={receitasLiquidas} negrito destaque />

        <LinhaRelatorio label="(-) Custos diretos de obra" valor={-custosDiretos} identacao={1} />
        <LinhaRelatorio
          label={`(=) Lucro Bruto (${margemBruta.toFixed(1)}%)`}
          valor={lucroBruto}
          negrito
          destaque
        />

        <LinhaRelatorio
          label="(-) Despesas Operacionais"
          valor={-despesasOperacionais}
          identacao={1}
        />
        <LinhaRelatorio
          label={`(=) Resultado antes de IR/CSLL (${margemAntesIR.toFixed(1)}%)`}
          valor={resultadoAntesIR}
          negrito
          destaque
        />

        <p className="pt-2 text-xs text-slate-500">
          Regime de caixa (lançamentos pagos). Custos diretos = despesas vinculadas a uma obra;
          despesas operacionais = sem obra. IR/CSLL não são apurados no sistema.
        </p>

        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-xs text-slate-500 mb-1">Margem Bruta</p>
              <p className="text-lg font-bold text-slate-800">{margemBruta.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Margem antes de IR/CSLL</p>
              <p
                className={`text-lg font-bold ${resultadoAntesIR >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {margemAntesIR.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
