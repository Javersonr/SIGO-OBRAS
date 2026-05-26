import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function TabelaDetalhada({ dados, filtros }) {
  const [tipoSelecionado, setTipoSelecionado] = useState("oportunidades");

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const exportarCSV = () => {
    let headers, linhas;

    switch (tipoSelecionado) {
      case "oportunidades":
        headers = ["Título", "Cliente", "Status", "Valor", "Data"];
        linhas = dados.oportunidades.map((op) => [
          op.titulo,
          op.cliente_nome || "",
          op.status_nome,
          op.valor_estimado || 0,
          new Date(op.created_date).toLocaleDateString("pt-BR"),
        ]);
        break;
      case "projetos":
        headers = ["Título", "Cliente", "Status", "Valor", "Data"];
        linhas = dados.projetos.map((proj) => [
          proj.titulo,
          proj.cliente_nome || "",
          proj.status_nome,
          proj.valor_estimado || 0,
          new Date(proj.created_date).toLocaleDateString("pt-BR"),
        ]);
        break;
      case "solicitacoes":
        headers = ["Número", "Projeto", "Solicitante", "Status", "Data"];
        linhas = dados.solicitacoes.map((sol) => [
          sol.numero,
          sol.projeto_nome || "",
          sol.solicitante_nome,
          sol.status,
          new Date(sol.created_date).toLocaleDateString("pt-BR"),
        ]);
        break;
      case "cotacoes":
        headers = ["Número", "Projeto", "Status", "Fornecedores", "Data"];
        linhas = dados.cotacoes.map((cot) => [
          cot.numero,
          cot.projeto_nome || "",
          cot.status,
          cot.total_fornecedores || 0,
          new Date(cot.created_date).toLocaleDateString("pt-BR"),
        ]);
        break;
      case "pedidos":
        headers = ["Número", "Fornecedor", "Status", "Total", "Data"];
        linhas = dados.pedidos.map((ped) => [
          ped.numero,
          ped.fornecedor_nome,
          ped.status,
          ped.total || 0,
          new Date(ped.created_date).toLocaleDateString("pt-BR"),
        ]);
        break;
    }

    const csv = [headers, ...linhas].map((row) => row.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_${tipoSelecionado}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const exportarPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF("landscape");

    doc.setFontSize(16);
    doc.text(`Relatório - ${tipoSelecionado}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 22);

    let y = 35;
    const items = dados[tipoSelecionado].slice(0, 30);

    items.forEach((item) => {
      const texto =
        tipoSelecionado === "oportunidades" || tipoSelecionado === "projetos"
          ? `${item.titulo} - ${item.status_nome} - ${formatCurrency(item.valor_estimado)}`
          : tipoSelecionado === "solicitacoes"
            ? `${item.numero} - ${item.status} - ${item.solicitante_nome}`
            : tipoSelecionado === "cotacoes"
              ? `${item.numero} - ${item.status}`
              : `${item.numero} - ${item.fornecedor_nome} - ${formatCurrency(item.total)}`;

      doc.text(texto, 14, y);
      y += 7;

      if (y > 190) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save(`relatorio_${tipoSelecionado}_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Relatório Detalhado</CardTitle>
          <div className="flex gap-2">
            <Select value={tipoSelecionado} onValueChange={setTipoSelecionado}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oportunidades">Oportunidades</SelectItem>
                <SelectItem value="projetos">Projetos</SelectItem>
                <SelectItem value="solicitacoes">Solicitações</SelectItem>
                <SelectItem value="cotacoes">Cotações</SelectItem>
                <SelectItem value="pedidos">Pedidos</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <FileText className="w-4 h-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportarPDF}>
              <Download className="w-4 h-4 mr-2" />
              PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {tipoSelecionado === "oportunidades" || tipoSelecionado === "projetos" ? (
                  <>
                    <TableHead>Título</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Data</TableHead>
                  </>
                ) : tipoSelecionado === "solicitacoes" ? (
                  <>
                    <TableHead>Número</TableHead>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </>
                ) : tipoSelecionado === "cotacoes" ? (
                  <>
                    <TableHead>Número</TableHead>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Fornecedores</TableHead>
                    <TableHead>Data</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Número</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Data</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados[tipoSelecionado]?.slice(0, 50).map((item) => (
                <TableRow key={item.id}>
                  {tipoSelecionado === "oportunidades" || tipoSelecionado === "projetos" ? (
                    <>
                      <TableCell className="font-medium">{item.titulo}</TableCell>
                      <TableCell>{item.cliente_nome || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.status_nome}</Badge>
                      </TableCell>
                      <TableCell className="font-medium text-green-600">
                        {formatCurrency(item.valor_estimado)}
                      </TableCell>
                      <TableCell>
                        {new Date(item.created_date).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </>
                  ) : tipoSelecionado === "solicitacoes" ? (
                    <>
                      <TableCell className="font-medium">{item.numero}</TableCell>
                      <TableCell>{item.projeto_nome || "-"}</TableCell>
                      <TableCell>{item.solicitante_nome}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(item.created_date).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </>
                  ) : tipoSelecionado === "cotacoes" ? (
                    <>
                      <TableCell className="font-medium">{item.numero}</TableCell>
                      <TableCell>{item.projeto_nome || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.status}</Badge>
                      </TableCell>
                      <TableCell>{item.total_fornecedores || 0}</TableCell>
                      <TableCell>
                        {new Date(item.created_date).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-medium">{item.numero}</TableCell>
                      <TableCell>{item.fornecedor_nome}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.status}</Badge>
                      </TableCell>
                      <TableCell className="font-medium text-green-600">
                        {formatCurrency(item.total)}
                      </TableCell>
                      <TableCell>
                        {new Date(item.created_date).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
              {dados[tipoSelecionado]?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                    Nenhum dado disponível
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {dados[tipoSelecionado]?.length > 50 && (
          <p className="text-xs text-slate-500 mt-3 text-center">
            Mostrando 50 de {dados[tipoSelecionado].length} registros
          </p>
        )}
      </CardContent>
    </Card>
  );
}
