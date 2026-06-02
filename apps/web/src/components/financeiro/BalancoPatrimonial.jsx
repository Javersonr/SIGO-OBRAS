import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { isReceita, isDespesa, isStatusPago, isStatusPendente } from "@/lib/financeiro-utils";

export default function BalancoPatrimonial({
  transacoes,
  contas,
  versao = "real",
  dataInicio,
  dataFim,
}) {
  // Filtrar transações baseado na versão
  const transacoesFiltradas =
    versao === "contabil" ? transacoes.filter((t) => t.numero_documento) : transacoes;

  const saldoContas = contas.reduce((sum, c) => sum + (c.saldo_atual || 0), 0);

  // Helpers normalizados — comparações case-sensitive deixavam de fora
  // registros gravados como "pago"/"em_aberto" (minúsculas) ou "Realizado".
  const contasReceber = transacoesFiltradas
    .filter((t) => isReceita(t) && isStatusPendente(t.status))
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const ativoCirculante = saldoContas + contasReceber;
  const ativoTotal = ativoCirculante;

  const contasPagar = transacoesFiltradas
    .filter((t) => isDespesa(t) && isStatusPendente(t.status))
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const passivoCirculante = contasPagar;

  const receitasPagas = transacoesFiltradas
    .filter((t) => isReceita(t) && isStatusPago(t.status))
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const despesasPagas = transacoesFiltradas
    .filter((t) => isDespesa(t) && isStatusPago(t.status))
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const lucroAcumulado = receitasPagas - despesasPagas;
  const patrimonioLiquido = lucroAcumulado;

  const passivoTotal = passivoCirculante + patrimonioLiquido;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const handleExportarCSV = () => {
    const dados = [
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
      ["  Lucro/Prejuízo Acumulado", lucroAcumulado],
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
    doc.text("Balanço Patrimonial", 14, 20);
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, 14, 28);

    let y = 40;
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("ATIVO", 14, y);
    doc.setFont(undefined, "normal");
    y += 8;

    doc.text("Ativo Circulante", 14, y);
    doc.text(formatCurrency(ativoCirculante), 150, y);
    y += 6;
    doc.setFontSize(10);
    doc.text("  Caixa e Bancos", 20, y);
    doc.text(formatCurrency(saldoContas), 150, y);
    y += 6;
    doc.text("  Contas a Receber", 20, y);
    doc.text(formatCurrency(contasReceber), 150, y);
    y += 10;

    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("TOTAL DO ATIVO", 14, y);
    doc.text(formatCurrency(ativoTotal), 150, y);
    doc.setFont(undefined, "normal");

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
            <CardTitle>Balanço Patrimonial</CardTitle>
            <p className="text-sm text-slate-500 mt-1">Posição financeira e patrimonial</p>
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
              <LinhaBalanco label="Lucro/Prejuízo Acumulado" valor={lucroAcumulado} identacao={1} />

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
                {passivoCirculante > 0 ? (ativoCirculante / passivoCirculante).toFixed(2) : "∞"}
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
                {ativoTotal > 0 ? ((passivoCirculante / ativoTotal) * 100).toFixed(1) : "0"}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Solvência</p>
              <p className="text-lg font-bold text-slate-800">
                {passivoCirculante > 0 ? (ativoTotal / passivoCirculante).toFixed(2) : "∞"}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
