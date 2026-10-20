import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { calcularBalanco } from "@/lib/relatorios-financeiros";

export default function BalancoPatrimonial({
  transacoes,
  transacoesCaixa,
  contas,
  versao = "real",
  dataFim,
}) {
  // antes: PL = receitas − despesas pagas DO PERÍODO, então Ativo ≠ Passivo + PL;
  // agora PL = Ativo − Passivo (fecha sempre), decomposto em capital/saldos
  // iniciais das contas + resultado acumulado. Balanço gerencial, não contábil.
  const {
    saldoContas,
    contasReceber,
    ativoCirculante,
    ativoTotal,
    contasPagar,
    passivoCirculante,
    capital,
    resultadoAcumulado,
    patrimonioLiquido,
    passivoTotal,
  } = calcularBalanco(transacoes, contas, versao, dataFim, transacoesCaixa);

  const dataBase = dataFim
    ? new Date(`${dataFim}T12:00:00`).toLocaleDateString("pt-BR")
    : new Date().toLocaleDateString("pt-BR");

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const handleExportarCSV = () => {
    const dados = [
      ["BALANÇO PATRIMONIAL GERENCIAL", `Data-base: ${dataBase}`],
      ["ATIVO", ""],
      ["Ativo Circulante", ativoCirculante],
      ["  Caixa e Bancos", saldoContas],
      ["  Contas a Receber", contasReceber],
      ["TOTAL DO ATIVO", ativoTotal],
      ["", ""],
      ["PASSIVO", ""],
      ["Passivo Circulante", passivoCirculante],
      ["  Contas a Pagar", contasPagar],
      ["Patrimônio Líquido", patrimonioLiquido],
      ["  Capital / saldos iniciais", capital],
      ["  Resultado acumulado", resultadoAcumulado],
      ["TOTAL DO PASSIVO + PL", passivoTotal],
    ];

    const csv = dados.map((row) => row.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `balanco_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleExportarPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Balanço Patrimonial (gerencial)", 14, 20);
    doc.setFontSize(10);
    doc.text(`Data-base: ${dataBase}`, 14, 28);

    // antes o PDF só tinha o ATIVO; agora sai também Passivo e PL.
    let y = 40;
    const secao = (titulo) => {
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text(titulo, 14, y);
      doc.setFont(undefined, "normal");
      y += 8;
    };
    const linha = (label, valor, { sub = false, negrito = false } = {}) => {
      doc.setFontSize(sub ? 10 : 12);
      if (negrito) doc.setFont(undefined, "bold");
      doc.text(sub ? `  ${label}` : label, sub ? 20 : 14, y);
      doc.text(formatCurrency(valor), 150, y);
      if (negrito) doc.setFont(undefined, "normal");
      y += sub ? 6 : 8;
    };

    secao("ATIVO");
    linha("Ativo Circulante", ativoCirculante);
    linha("Caixa e Bancos", saldoContas, { sub: true });
    linha("Contas a Receber", contasReceber, { sub: true });
    y += 2;
    linha("TOTAL DO ATIVO", ativoTotal, { negrito: true });
    y += 6;

    secao("PASSIVO + PATRIMÔNIO LÍQUIDO");
    linha("Passivo Circulante", passivoCirculante);
    linha("Contas a Pagar", contasPagar, { sub: true });
    linha("Patrimônio Líquido", patrimonioLiquido);
    linha("Capital / saldos iniciais", capital, { sub: true });
    linha("Resultado acumulado", resultadoAcumulado, { sub: true });
    y += 2;
    linha("TOTAL DO PASSIVO + PL", passivoTotal, { negrito: true });

    doc.save(`balanco_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const LinhaBalanco = ({ label, valor, destaque = false, negrito = false, identacao = 0 }) => (
    <div
      className={`flex justify-between py-2 ${destaque ? "border-t-2 border-slate-300 pt-3" : "border-t border-slate-100"}`}
      style={{ paddingLeft: `${identacao * 20}px` }}
    >
      <span className={negrito ? "font-semibold text-slate-800" : "text-slate-700"}>{label}</span>
      <span className={negrito ? "font-bold text-slate-900" : "font-medium text-slate-800"}>
        {formatCurrency(valor)}
      </span>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Balanço Patrimonial (gerencial)</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              Posição em {dataBase}: saldo das contas nessa data + contas a receber/pagar que
              estavam em aberto nela (qualquer vencimento; parcelas uma a uma). PL = Ativo −
              Passivo.
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
      <CardContent>
        <div className="grid grid-cols-2 gap-8">
          {/* ATIVO */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b-2 border-blue-600">
              ATIVO
            </h3>
            <div className="space-y-1">
              <LinhaBalanco label="Ativo Circulante" valor={ativoCirculante} negrito />
              <LinhaBalanco label="Caixa e Bancos" valor={saldoContas} identacao={1} />
              <LinhaBalanco label="Contas a Receber" valor={contasReceber} identacao={1} />

              <LinhaBalanco label="TOTAL DO ATIVO" valor={ativoTotal} negrito destaque />
            </div>
          </div>

          {/* PASSIVO + PATRIMÔNIO LÍQUIDO */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b-2 border-red-600">
              PASSIVO + PATRIMÔNIO LÍQUIDO
            </h3>
            <div className="space-y-1">
              <LinhaBalanco label="Passivo Circulante" valor={passivoCirculante} negrito />
              <LinhaBalanco label="Contas a Pagar" valor={contasPagar} identacao={1} />

              <div className="my-4" />

              <LinhaBalanco label="Patrimônio Líquido" valor={patrimonioLiquido} negrito />
              <LinhaBalanco label="Capital / saldos iniciais" valor={capital} identacao={1} />
              <LinhaBalanco label="Resultado acumulado" valor={resultadoAcumulado} identacao={1} />

              <LinhaBalanco label="TOTAL DO PASSIVO + PL" valor={passivoTotal} negrito destaque />
            </div>
          </div>
        </div>

        {/* Indicadores */}
        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-xs text-slate-500 mb-1">Liquidez Corrente</p>
              <p className="text-lg font-bold text-slate-800">
                {passivoCirculante > 0 ? (ativoCirculante / passivoCirculante).toFixed(2) : "n/d"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Patrimônio Líquido</p>
              <p
                className={`text-lg font-bold ${patrimonioLiquido >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {formatCurrency(patrimonioLiquido)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Endividamento</p>
              <p className="text-lg font-bold text-slate-800">
                {ativoTotal > 0 ? `${((passivoCirculante / ativoTotal) * 100).toFixed(1)}%` : "n/d"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Solvência</p>
              <p className="text-lg font-bold text-slate-800">
                {passivoCirculante > 0 ? (ativoTotal / passivoCirculante).toFixed(2) : "n/d"}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
