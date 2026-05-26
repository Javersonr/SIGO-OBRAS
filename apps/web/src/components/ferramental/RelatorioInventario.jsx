import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Package, DollarSign } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { utils, write } from "xlsx";

export default function RelatorioInventario({
  ferramentas = [],
  movimentacoes = [],
  empresaAtiva,
}) {
  const [filtroLocalizacao, setFiltroLocalizacao] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [tipoRelatorio, setTipoRelatorio] = useState("resumo"); // resumo, quantidade, movimentacao

  // Extrair localizações únicas
  const localizacoes = useMemo(() => {
    return [...new Set(ferramentas.map((f) => f.localizacao).filter(Boolean))];
  }, [ferramentas]);

  // Filtrar ferramentas
  const ferramentasFiltradas = useMemo(() => {
    return ferramentas.filter((f) => {
      if (filtroLocalizacao && f.localizacao !== filtroLocalizacao) return false;
      if (filtroStatus && f.status !== filtroStatus) return false;
      return true;
    });
  }, [ferramentas, filtroLocalizacao, filtroStatus]);

  // Cálculos gerais
  const calculos = useMemo(() => {
    const totalValor = ferramentasFiltradas.reduce(
      (sum, f) => sum + (f.valor_unitario || 0) * (f.quantidade_estoque || 0),
      0
    );
    const totalItens = ferramentasFiltradas.reduce(
      (sum, f) => sum + (f.quantidade_estoque || 0),
      0
    );
    const totalFerramentas = ferramentasFiltradas.length;

    // Itens com maior quantidade
    const maiorQuantidade = [...ferramentasFiltradas]
      .sort((a, b) => (b.quantidade_estoque || 0) - (a.quantidade_estoque || 0))
      .slice(0, 5);

    // Itens com menor quantidade
    const menorQuantidade = ferramentasFiltradas
      .filter((f) => f.quantidade_estoque && f.quantidade_estoque > 0)
      .sort((a, b) => (a.quantidade_estoque || 0) - (b.quantidade_estoque || 0))
      .slice(0, 5);

    // Ferramentas que mais movimentaram
    const movPorFerramenta = {};
    movimentacoes.forEach((mov) => {
      if (!movPorFerramenta[mov.ferramenta_id]) {
        movPorFerramenta[mov.ferramenta_id] = {
          id: mov.ferramenta_id,
          codigo: mov.ferramenta_codigo,
          descricao: mov.ferramenta_descricao,
          movimentacoes: 0,
        };
      }
      movPorFerramenta[mov.ferramenta_id].movimentacoes += 1;
    });
    const maiorMovimentacao = Object.values(movPorFerramenta)
      .sort((a, b) => b.movimentacoes - a.movimentacoes)
      .slice(0, 5);

    // Distribuição por status
    const distribuicaoStatus = {};
    ferramentasFiltradas.forEach((f) => {
      distribuicaoStatus[f.status] = (distribuicaoStatus[f.status] || 0) + 1;
    });
    const statusChartData = Object.entries(distribuicaoStatus).map(([status, count]) => ({
      status,
      count,
    }));

    // Distribuição por localização
    const distribuicaoLocal = {};
    ferramentasFiltradas.forEach((f) => {
      distribuicaoLocal[f.localizacao || "Sem localização"] =
        (distribuicaoLocal[f.localizacao || "Sem localização"] || 0) + 1;
    });
    const localChartData = Object.entries(distribuicaoLocal).map(([local, count]) => ({
      local,
      count,
    }));

    return {
      totalValor,
      totalItens,
      totalFerramentas,
      maiorQuantidade,
      menorQuantidade,
      maiorMovimentacao,
      statusChartData,
      localChartData,
    };
  }, [ferramentasFiltradas, movimentacoes]);

  // Função para exportar como CSV
  const exportarCSV = () => {
    const dados = ferramentasFiltradas.map((f) => ({
      Código: f.codigo,
      Descrição: f.descricao,
      Marca: f.marca || "",
      Modelo: f.modelo || "",
      Status: f.status,
      Localização: f.localizacao || "",
      Quantidade: f.quantidade_estoque || 0,
      "Valor Unitário": f.valor_unitario || 0,
      "Valor Total": (f.valor_unitario || 0) * (f.quantidade_estoque || 0),
    }));

    const ws = utils.json_to_sheet(dados);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Inventário");
    write(wb, { bookType: "csv", type: "binary", fileName: "relatorio-inventario.csv" });
    toast.success("✓ Relatório exportado como CSV");
  };

  // Função para exportar como PDF
  const exportarPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("Relatório de Inventário", 20, 20);

      doc.setFontSize(10);
      doc.text(`Empresa: ${empresaAtiva?.nome || "N/A"}`, 20, 30);
      doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, 20, 37);

      // Resumo
      doc.setFontSize(12);
      doc.text("Resumo Executivo", 20, 50);

      const resumoDados = [
        ["Total de Ferramentas", calculos.totalFerramentas.toString()],
        ["Total de Itens", calculos.totalItens.toString()],
        ["Valor Total", `R$ ${calculos.totalValor.toFixed(2)}`],
      ];

      doc.autoTable({
        startY: 55,
        head: [["Métrica", "Valor"]],
        body: resumoDados,
        margin: { left: 20, right: 20 },
      });

      // Itens com maior quantidade
      const startYMaior = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text("Itens com Maior Quantidade", 20, startYMaior);

      const maiorDados = calculos.maiorQuantidade.map((item) => [
        item.codigo,
        item.descricao,
        item.quantidade_estoque || 0,
      ]);

      doc.autoTable({
        startY: startYMaior + 5,
        head: [["Código", "Descrição", "Quantidade"]],
        body: maiorDados,
        margin: { left: 20, right: 20 },
      });

      // Ferramentas que mais movimentaram
      const startYMov = doc.lastAutoTable.finalY + 10;
      if (calculos.maiorMovimentacao.length > 0) {
        doc.setFontSize(12);
        doc.text("Ferramentas com Maior Movimentação", 20, startYMov);

        const movDados = calculos.maiorMovimentacao.map((item) => [
          item.codigo,
          item.descricao,
          item.movimentacoes.toString(),
        ]);

        doc.autoTable({
          startY: startYMov + 5,
          head: [["Código", "Descrição", "Movimentações"]],
          body: movDados,
          margin: { left: 20, right: 20 },
        });
      }

      doc.save("relatorio-inventario.pdf");
      toast.success("✓ Relatório exportado como PDF");
    } catch (error) {
      toast.error("Erro ao exportar PDF");
      console.error(error);
    }
  };

  const COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"];

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm">Localização</Label>
              <Select value={filtroLocalizacao} onValueChange={setFiltroLocalizacao}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Todas</SelectItem>
                  {localizacoes.map((local) => (
                    <SelectItem key={local} value={local}>
                      {local}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">Status</Label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Todos</SelectItem>
                  <SelectItem value="Disponível">Disponível</SelectItem>
                  <SelectItem value="Em Uso">Em Uso</SelectItem>
                  <SelectItem value="Em Manutenção">Em Manutenção</SelectItem>
                  <SelectItem value="Danificado">Danificado</SelectItem>
                  <SelectItem value="Inativo">Inativo</SelectItem>
                  <SelectItem value="Sucata">Sucata</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">Tipo de Relatório</Label>
              <Select value={tipoRelatorio} onValueChange={setTipoRelatorio}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resumo">Resumo Executivo</SelectItem>
                  <SelectItem value="quantidade">Quantidade</SelectItem>
                  <SelectItem value="movimentacao">Movimentação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Ferramentas</p>
                <p className="text-2xl font-bold text-slate-800">{calculos.totalFerramentas}</p>
              </div>
              <Package className="w-10 h-10 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Itens</p>
                <p className="text-2xl font-bold text-slate-800">{calculos.totalItens}</p>
              </div>
              <TrendingUp className="w-10 h-10 text-green-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Valor Total</p>
                <p className="text-2xl font-bold text-slate-800">
                  R$ {(calculos.totalValor / 1000).toFixed(1)}k
                </p>
              </div>
              <DollarSign className="w-10 h-10 text-amber-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Movimentações</p>
                <p className="text-2xl font-bold text-slate-800">{movimentacoes.length}</p>
              </div>
              <TrendingDown className="w-10 h-10 text-purple-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Relatório Resumo */}
      {tipoRelatorio === "resumo" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribuição por Status */}
            {calculos.statusChartData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Distribuição por Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={calculos.statusChartData}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {calculos.statusChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Distribuição por Localização */}
            {calculos.localChartData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Distribuição por Localização</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={calculos.localChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="local" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Relatório Quantidade */}
      {tipoRelatorio === "quantidade" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Maior Quantidade */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                Maior Quantidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {calculos.maiorQuantidade.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border"
                  >
                    <div>
                      <p className="font-semibold text-sm text-slate-800">{item.codigo}</p>
                      <p className="text-xs text-slate-600">{item.descricao}</p>
                    </div>
                    <Badge className="bg-green-100 text-green-800">
                      {item.quantidade_estoque || 0}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Menor Quantidade */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-orange-600" />
                Menor Quantidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {calculos.menorQuantidade.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border"
                  >
                    <div>
                      <p className="font-semibold text-sm text-slate-800">{item.codigo}</p>
                      <p className="text-xs text-slate-600">{item.descricao}</p>
                    </div>
                    <Badge className="bg-orange-100 text-orange-800">
                      {item.quantidade_estoque || 0}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Relatório Movimentação */}
      {tipoRelatorio === "movimentacao" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ferramentas com Maior Movimentação</CardTitle>
          </CardHeader>
          <CardContent>
            {calculos.maiorMovimentacao.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={calculos.maiorMovimentacao}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="codigo" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="movimentacoes" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-600 text-center py-6">Sem movimentações registradas</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabela Detalhada */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detalhamento do Inventário</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Valor Unit.</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ferramentasFiltradas.slice(0, 20).map((item) => (
                  <TableRow key={item.id} className="hover:bg-slate-50">
                    <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                    <TableCell className="text-sm">{item.descricao}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {item.quantidade_estoque || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      R$ {(item.valor_unitario || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      R$ {((item.valor_unitario || 0) * (item.quantidade_estoque || 0)).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm">{item.localizacao || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {ferramentasFiltradas.length > 20 && (
            <p className="text-xs text-slate-500 mt-2">
              Exibindo 20 de {ferramentasFiltradas.length} itens
            </p>
          )}
        </CardContent>
      </Card>

      {/* Exportar */}
      <div className="flex gap-2 sticky bottom-0 bg-white py-4 border-t">
        <Button onClick={exportarCSV} variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Exportar CSV
        </Button>
        <Button onClick={exportarPDF} className="bg-amber-600 hover:bg-amber-700 gap-2">
          <Download className="w-4 h-4" />
          Exportar PDF
        </Button>
      </div>
    </div>
  );
}
