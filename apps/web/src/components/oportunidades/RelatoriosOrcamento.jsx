import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, Download, ChevronDown, BarChart3, TrendingUp, Layers } from "lucide-react";

export default function RelatoriosOrcamento({
  orcamentoItens = [],
  nomeOrcamento = "",
  clienteNome = "",
  onClose,
}) {
  const [tipoRelatorio, setTipoRelatorio] = useState("sintetico");

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const gerarRelatorioSintetico = () => {
    const total = orcamentoItens.reduce((s, i) => s + (i.valor_total || 0), 0);
    const totalItens = orcamentoItens.length;
    const subtotal = orcamentoItens.reduce(
      (s, i) => s + (i.quantidade || 0) * (i.valor_unitario || 0),
      0
    );
    const bdiMedio =
      totalItens > 0 ? orcamentoItens.reduce((s, i) => s + (i.bdi || 0), 0) / totalItens : 0;
    const impostoMedio =
      totalItens > 0 ? orcamentoItens.reduce((s, i) => s + (i.imposto || 0), 0) / totalItens : 0;

    return (
      <Card>
        <CardHeader>
          <CardTitle>Relatório Sintético</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-600 mb-1">Total de Itens</p>
              <p className="text-2xl font-bold text-blue-900">{totalItens}</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-600 mb-1">Valor Total</p>
              <p className="text-2xl font-bold text-green-900">{formatCurrency(total)}</p>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal (Qtd × Vlr Unit.)</span>
              <span className="font-semibold">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">BDI Médio</span>
              <span className="font-semibold">{bdiMedio.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Imposto Médio</span>
              <span className="font-semibold">{impostoMedio.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between pt-3 border-t">
              <span className="text-slate-800 font-semibold">Total Geral</span>
              <span className="text-lg font-bold text-green-600">{formatCurrency(total)}</span>
            </div>
          </div>

          <Button onClick={exportarPDFSintetico} className="w-full gap-2">
            <Download className="w-4 h-4" />
            Exportar PDF Sintético
          </Button>
        </CardContent>
      </Card>
    );
  };

  const gerarRelatorioAnalitico = () => {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Relatório Analítico</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">Item</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">Descrição</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">Código</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700">Qtd</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">Unid.</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700">Vlr Unit.</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700">Subtotal</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700">BDI %</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700">Imp. %</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {orcamentoItens.map((item, idx) => {
                  const subtotal = (item.quantidade || 0) * (item.valor_unitario || 0);
                  return (
                    <tr key={item.id} className="border-b hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium">{item.descricao}</td>
                      <td className="px-3 py-2 text-slate-600">{item.codigo || "-"}</td>
                      <td className="px-3 py-2 text-right">{item.quantidade || 0}</td>
                      <td className="px-3 py-2">{item.unidade}</td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(item.valor_unitario)}
                      </td>
                      <td className="px-3 py-2 text-right">{formatCurrency(subtotal)}</td>
                      <td className="px-3 py-2 text-right">{item.bdi || 0}%</td>
                      <td className="px-3 py-2 text-right">{item.imposto || 0}%</td>
                      <td className="px-3 py-2 text-right font-semibold text-green-600">
                        {formatCurrency(item.valor_total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 sticky bottom-0">
                <tr className="border-t-2">
                  <td colSpan={9} className="px-3 py-3 text-right font-semibold">
                    Total Geral:
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-green-600">
                    {formatCurrency(orcamentoItens.reduce((s, i) => s + (i.valor_total || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <Button onClick={exportarPDFAnalitico} className="w-full gap-2 mt-4">
            <Download className="w-4 h-4" />
            Exportar PDF Analítico
          </Button>
        </CardContent>
      </Card>
    );
  };

  const calcularCurvaABC = () => {
    const itensComPercentual = orcamentoItens.map((item) => ({
      ...item,
      percentual: 0,
    }));

    const totalGeral = itensComPercentual.reduce((s, i) => s + (i.valor_total || 0), 0);

    itensComPercentual.forEach((item) => {
      item.percentual = totalGeral > 0 ? ((item.valor_total || 0) / totalGeral) * 100 : 0;
    });

    const ordenados = [...itensComPercentual].sort(
      (a, b) => (b.valor_total || 0) - (a.valor_total || 0)
    );

    let acumulado = 0;
    const comClassificacao = ordenados.map((item) => {
      const percentualItem = item.percentual;
      acumulado += percentualItem;

      let classe = "C";
      if (acumulado <= 80) {
        classe = "A";
      } else if (acumulado <= 95) {
        classe = "B";
      }

      return {
        ...item,
        classe,
        percentual_acumulado: acumulado,
      };
    });

    return { comClassificacao, totalGeral };
  };

  const gerarRelatorioCurvaABC = () => {
    const { comClassificacao, totalGeral } = calcularCurvaABC();

    const totalA = comClassificacao
      .filter((i) => i.classe === "A")
      .reduce((s, i) => s + (i.valor_total || 0), 0);
    const totalB = comClassificacao
      .filter((i) => i.classe === "B")
      .reduce((s, i) => s + (i.valor_total || 0), 0);
    const totalC = comClassificacao
      .filter((i) => i.classe === "C")
      .reduce((s, i) => s + (i.valor_total || 0), 0);
    const countA = comClassificacao.filter((i) => i.classe === "A").length;
    const countB = comClassificacao.filter((i) => i.classe === "B").length;
    const countC = comClassificacao.filter((i) => i.classe === "C").length;

    return (
      <Card>
        <CardHeader>
          <CardTitle>Curva ABC - Análise de Pareto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <p className="font-bold text-red-700">Classe A</p>
              </div>
              <p className="text-xs text-slate-600 mb-2">{countA} itens • 80% do valor</p>
              <p className="text-xl font-bold text-red-900">{formatCurrency(totalA)}</p>
              <p className="text-xs text-red-600 mt-1">
                {totalGeral > 0 ? ((totalA / totalGeral) * 100).toFixed(1) : 0}% do total
              </p>
            </div>

            <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <p className="font-bold text-yellow-700">Classe B</p>
              </div>
              <p className="text-xs text-slate-600 mb-2">{countB} itens • 15% do valor</p>
              <p className="text-xl font-bold text-yellow-900">{formatCurrency(totalB)}</p>
              <p className="text-xs text-yellow-600 mt-1">
                {totalGeral > 0 ? ((totalB / totalGeral) * 100).toFixed(1) : 0}% do total
              </p>
            </div>

            <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <p className="font-bold text-green-700">Classe C</p>
              </div>
              <p className="text-xs text-slate-600 mb-2">{countC} itens • 5% do valor</p>
              <p className="text-xl font-bold text-green-900">{formatCurrency(totalC)}</p>
              <p className="text-xs text-green-600 mt-1">
                {totalGeral > 0 ? ((totalC / totalGeral) * 100).toFixed(1) : 0}% do total
              </p>
            </div>
          </div>

          <div className="border rounded-lg overflow-auto max-h-[400px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">Classe</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">Item</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">Descrição</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700">Qtd</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700">Valor Total</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700">
                    % Individual
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700">% Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {comClassificacao.map((item, idx) => (
                  <tr key={item.id} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-white ${
                          item.classe === "A"
                            ? "bg-red-500"
                            : item.classe === "B"
                              ? "bg-yellow-500"
                              : "bg-green-500"
                        }`}
                      >
                        {item.classe}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium">{item.descricao}</td>
                    <td className="px-3 py-2 text-right">{item.quantidade || 0}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatCurrency(item.valor_total)}
                    </td>
                    <td className="px-3 py-2 text-right">{item.percentual.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {item.percentual_acumulado.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">💡 Interpretação da Curva ABC</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>
                <strong>Classe A:</strong> Itens de alto valor (80% do custo) - Controle rigoroso
              </li>
              <li>
                <strong>Classe B:</strong> Itens de valor médio (15% do custo) - Controle moderado
              </li>
              <li>
                <strong>Classe C:</strong> Itens de baixo valor (5% do custo) - Controle simples
              </li>
            </ul>
          </div>

          <Button onClick={exportarPDFCurvaABC} className="w-full gap-2">
            <Download className="w-4 h-4" />
            Exportar PDF Curva ABC
          </Button>
        </CardContent>
      </Card>
    );
  };

  const exportarPDFSintetico = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Relatório Sintético de Orçamento", 14, 20);

    doc.setFontSize(12);
    doc.text(`Orçamento: ${nomeOrcamento}`, 14, 30);
    doc.text(`Cliente: ${clienteNome || "Não informado"}`, 14, 37);
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 44);

    doc.setFontSize(10);
    let y = 60;

    const total = orcamentoItens.reduce((s, i) => s + (i.valor_total || 0), 0);
    const subtotal = orcamentoItens.reduce(
      (s, i) => s + (i.quantidade || 0) * (i.valor_unitario || 0),
      0
    );
    const totalItens = orcamentoItens.length;
    const bdiMedio =
      totalItens > 0 ? orcamentoItens.reduce((s, i) => s + (i.bdi || 0), 0) / totalItens : 0;
    const impostoMedio =
      totalItens > 0 ? orcamentoItens.reduce((s, i) => s + (i.imposto || 0), 0) / totalItens : 0;

    doc.text(`Total de Itens: ${totalItens}`, 14, y);
    y += 10;
    doc.text(`Subtotal (Qtd × Vlr Unit.): ${formatCurrency(subtotal)}`, 14, y);
    y += 10;
    doc.text(`BDI Médio: ${bdiMedio.toFixed(2)}%`, 14, y);
    y += 10;
    doc.text(`Imposto Médio: ${impostoMedio.toFixed(2)}%`, 14, y);
    y += 15;

    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(`TOTAL GERAL: ${formatCurrency(total)}`, 14, y);

    doc.save(`relatorio_sintetico_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportarPDFAnalitico = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF("landscape");

    doc.setFontSize(16);
    doc.text("Relatório Analítico de Orçamento", 14, 15);
    doc.setFontSize(10);
    doc.text(`Orçamento: ${nomeOrcamento}`, 14, 22);
    doc.text(`Cliente: ${clienteNome || "Não informado"}`, 14, 28);
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 34);

    let y = 45;
    doc.setFontSize(8);

    doc.text("Nº", 14, y);
    doc.text("Descrição", 25, y);
    doc.text("Código", 100, y);
    doc.text("Qtd", 130, y);
    doc.text("Un", 145, y);
    doc.text("Vlr Unit.", 160, y);
    doc.text("Subtotal", 185, y);
    doc.text("BDI %", 210, y);
    doc.text("Imp %", 230, y);
    doc.text("Total", 250, y);

    y += 5;
    doc.line(14, y, 280, y);
    y += 5;

    orcamentoItens.forEach((item, idx) => {
      if (y > 190) {
        doc.addPage();
        y = 20;
      }

      const subtotal = (item.quantidade || 0) * (item.valor_unitario || 0);

      doc.text((idx + 1).toString(), 14, y);
      doc.text((item.descricao || "").substring(0, 35), 25, y);
      doc.text(item.codigo || "-", 100, y);
      doc.text((item.quantidade || 0).toString(), 130, y);
      doc.text(item.unidade || "-", 145, y);
      doc.text(`R$ ${(item.valor_unitario || 0).toFixed(2)}`, 160, y);
      doc.text(`R$ ${subtotal.toFixed(2)}`, 185, y);
      doc.text(`${item.bdi || 0}%`, 210, y);
      doc.text(`${item.imposto || 0}%`, 230, y);
      doc.text(`R$ ${(item.valor_total || 0).toFixed(2)}`, 250, y);

      y += 6;
    });

    y += 5;
    doc.line(14, y, 280, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text(
      `TOTAL: ${formatCurrency(orcamentoItens.reduce((s, i) => s + (i.valor_total || 0), 0))}`,
      250,
      y
    );

    doc.save(`relatorio_analitico_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportarPDFCurvaABC = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF("landscape");

    const { comClassificacao } = calcularCurvaABC();

    doc.setFontSize(16);
    doc.text("Curva ABC - Análise de Pareto", 14, 15);
    doc.setFontSize(10);
    doc.text(`Orçamento: ${nomeOrcamento}`, 14, 22);
    doc.text(`Cliente: ${clienteNome || "Não informado"}`, 14, 28);
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 34);

    let y = 45;
    doc.setFontSize(8);

    doc.text("Classe", 14, y);
    doc.text("Nº", 35, y);
    doc.text("Descrição", 50, y);
    doc.text("Código", 120, y);
    doc.text("Qtd", 145, y);
    doc.text("Valor Total", 165, y);
    doc.text("% Indiv.", 200, y);
    doc.text("% Acum.", 225, y);

    y += 5;
    doc.line(14, y, 280, y);
    y += 5;

    comClassificacao.forEach((item, idx) => {
      if (y > 190) {
        doc.addPage();
        y = 20;
      }

      doc.setFillColor(
        item.classe === "A" ? 239 : item.classe === "B" ? 234 : 220,
        item.classe === "A" ? 68 : item.classe === "B" ? 179 : 252,
        item.classe === "A" ? 68 : item.classe === "B" ? 0 : 220
      );
      doc.circle(20, y - 1.5, 2, "F");

      doc.text(item.classe, 14, y);
      doc.text((idx + 1).toString(), 35, y);
      doc.text((item.descricao || "").substring(0, 30), 50, y);
      doc.text(item.codigo || "-", 120, y);
      doc.text((item.quantidade || 0).toString(), 145, y);
      doc.text(`R$ ${(item.valor_total || 0).toFixed(2)}`, 165, y);
      doc.text(`${item.percentual.toFixed(2)}%`, 200, y);
      doc.text(`${item.percentual_acumulado.toFixed(2)}%`, 225, y);

      y += 6;
    });

    doc.save(`curva_abc_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">Relatórios do Orçamento</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <FileText className="w-4 h-4" />
              Relatórios
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setTipoRelatorio("sintetico")} className="gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              Sintético
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTipoRelatorio("analitico")} className="gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Analítico
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTipoRelatorio("curva_abc")} className="gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              Curva ABC
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {tipoRelatorio === "sintetico" && gerarRelatorioSintetico()}
      {tipoRelatorio === "analitico" && gerarRelatorioAnalitico()}
      {tipoRelatorio === "curva_abc" && gerarRelatorioCurvaABC()}
    </div>
  );
}
