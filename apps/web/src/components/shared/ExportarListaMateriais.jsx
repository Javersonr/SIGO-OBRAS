import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import * as XLSX from "xlsx";

export default function ExportarListaMateriais({
  empresaId,
  oportunidadeId,
  projetoId,
  titulo = "Lista de Materiais",
}) {
  const [carregando, setCarregando] = useState(false);

  const handleExportar = async () => {
    setCarregando(true);
    try {
      const response = await sigo.functions.invoke("gerarListaMaterialesDoOrcamento", {
        empresaId,
        oportunidadeId,
        projetoId,
      });

      if (response.data.status !== "sucesso") {
        alert("Erro ao gerar lista de materiais");
        return;
      }

      const materiais = response.data.materiais || [];

      // Preparar dados para Excel
      const dadosExcel = materiais.map((m) => ({
        Código: m.material_codigo || "-",
        Material: m.material_nome,
        Unidade: m.material_unidade,
        Quantidade: m.quantidade,
        "Preço Unitário": `R$ ${m.preco_unitario?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}`,
        "Valor Total": `R$ ${m.valor_total?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}`,
      }));

      // Adicionar total
      dadosExcel.push({
        Código: "",
        Material: "TOTAL",
        Unidade: "",
        Quantidade: "",
        "Preço Unitário": "",
        "Valor Total": `R$ ${response.data.valor_total?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "0,00"}`,
      });

      // Criar workbook
      const ws = XLSX.utils.json_to_sheet(dadosExcel);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Materiais");

      // Ajustar largura das colunas
      const colWidths = [12, 30, 10, 12, 18, 18];
      ws["!cols"] = colWidths.map((width) => ({ wch: width }));

      // Salvar arquivo
      XLSX.writeFile(wb, `${titulo}_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (err) {
      console.error("Erro ao exportar:", err);
      alert("Erro ao exportar lista de materiais: " + err.message);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Button
      onClick={handleExportar}
      disabled={carregando}
      className="gap-2 bg-green-600 hover:bg-green-700"
    >
      {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      Exportar Lista de Materiais
    </Button>
  );
}
