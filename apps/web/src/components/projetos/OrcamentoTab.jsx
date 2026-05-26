import React from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Trash2,
  FileText,
  Download,
  Upload,
  Copy,
  ShoppingCart,
  Package,
  FileSpreadsheet,
  FilePlus,
  Settings,
} from "lucide-react";
import RelatoriosOrcamento from "../oportunidades/RelatoriosOrcamento";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import PermissionGate from "../PermissionGate";
import ReservarItensOrcamentoModal from "./ReservarItensOrcamentoModal";

export default function OrcamentoTab({
  selectedProj,
  orcamentoItens,
  setOrcamentoItens,
  materiais,
  empresaAtiva,
  user,
  templates,
  loadOrcamentoData,
  formatCurrency,
  onCreateSolicitacao,
  onShowStatusConfig,
  onCriarMaterial,
}) {
  const [visualizacao, setVisualizacao] = React.useState("lista");
  const [filtroTipo, setFiltroTipo] = React.useState("all");
  const [itensSelecionados, setItensSelecionados] = React.useState(new Set());
  const [itemSearchTerm, setItemSearchTerm] = React.useState("");
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [editingItemId, setEditingItemId] = React.useState(null);
  const [showRelatorios, setShowRelatorios] = React.useState(false);
  const [showAplicarTemplate, setShowAplicarTemplate] = React.useState(false);
  const [nomeTemplate, setNomeTemplate] = React.useState("");
  const [showSalvarTemplate, setShowSalvarTemplate] = React.useState(false);
  const [showReservarItens, setShowReservarItens] = React.useState(false);
  const updateTimeoutRef = React.useRef({});
  const fileInputRef = React.useRef(null);

  const handleUpdate = async (itemId, field, value) => {
    const item = orcamentoItens.find((i) => i.id === itemId);
    if (!item) return;
    let processedValue = value;
    if (["quantidade", "valor_unitario", "bdi", "imposto"].includes(field)) {
      processedValue = parseFloat(value) || 0;
    }
    const updatedData = { ...item, [field]: processedValue };
    if (["quantidade", "valor_unitario", "bdi", "imposto"].includes(field)) {
      const qtd = field === "quantidade" ? processedValue : item.quantidade || 0;
      const vlrUnit = field === "valor_unitario" ? processedValue : item.valor_unitario || 0;
      const bdi = field === "bdi" ? processedValue : item.bdi || 0;
      const imp = field === "imposto" ? processedValue : item.imposto || 0;
      updatedData.valor_total = qtd * vlrUnit * (1 + bdi / 100) * (1 + imp / 100);
    }
    setOrcamentoItens((prev) => prev.map((i) => (i.id === itemId ? updatedData : i)));
    const key = `${itemId}-${field}`;
    if (updateTimeoutRef.current[key]) clearTimeout(updateTimeoutRef.current[key]);
    updateTimeoutRef.current[key] = setTimeout(async () => {
      await sigo.entities.OrcamentoItem.update(itemId, updatedData);
      delete updateTimeoutRef.current[key];
    }, 1500);
  };

  const handleDelete = async (itemId) => {
    if (!confirm("Excluir este item?")) return;
    await sigo.entities.OrcamentoItem.delete(itemId);
    setItensSelecionados((prev) => {
      const n = new Set(prev);
      n.delete(itemId);
      return n;
    });
    loadOrcamentoData(selectedProj.id);
  };

  const handleDeleteSelecionados = async () => {
    if (!confirm(`Excluir ${itensSelecionados.size} item(ns)?`)) return;
    for (const id of itensSelecionados) {
      try {
        await sigo.entities.OrcamentoItem.delete(id);
      } catch {}
    }
    setItensSelecionados(new Set());
    loadOrcamentoData(selectedProj.id);
  };

  const handleNovoItem = async () => {
    const maxOrdem = Math.max(0, ...orcamentoItens.map((i) => i.ordem || 0));
    const novoItem = await sigo.entities.OrcamentoItem.create({
      empresa_id: empresaAtiva.id,
      projeto_id: selectedProj.id,
      item: (orcamentoItens.length + 1).toString(),
      tipo: "Material",
      descricao: "",
      codigo: "",
      unidade: "UN",
      quantidade: 0,
      valor_unitario: 0,
      bdi: 0,
      imposto: 0,
      valor_total: 0,
      ordem: maxOrdem + 1,
    });
    setOrcamentoItens((prev) => [...prev, novoItem]);
  };

  const handleLimpar = async () => {
    if (!confirm("⚠️ Apagar TODOS os itens?")) return;
    const itens = await sigo.entities.OrcamentoItem.filter({
      empresa_id: empresaAtiva.id,
      projeto_id: selectedProj.id,
    });
    await Promise.all(itens.map((i) => sigo.entities.OrcamentoItem.delete(i.id)));
    loadOrcamentoData(selectedProj.id);
  };

  const handleExportCSV = () => {
    const csv = [
      ["Nº", "Descrição", "Código", "Unid.", "Qtd", "Vlr Unit.", "BDI %", "Imp. %", "Vlr Total"],
      ...orcamentoItens.map((item, idx) => [
        idx + 1,
        item.descricao || "",
        item.codigo || "",
        item.unidade || "",
        item.quantidade || 0,
        item.valor_unitario || 0,
        item.bdi || 0,
        item.imposto || 0,
        item.valor_total || 0,
      ]),
    ]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell).replace(/"/g, '""');
            return s.includes(";") ? `"${s}"` : s;
          })
          .join(";")
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    );
    link.download = `orcamento_${selectedProj?.nome?.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleExportPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF("landscape");
    doc.setFontSize(16);
    doc.text(`Orçamento: ${selectedProj?.nome || ""}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Cliente: ${selectedProj?.cliente_nome || ""}`, 14, 22);
    let y = 38;
    doc.setFontSize(8);
    [
      "Nº",
      "Descrição",
      "Código",
      "Unid.",
      "Qtd",
      "Vlr Unit.",
      "BDI %",
      "Imp. %",
      "Vlr Total",
    ].forEach((h, i) => doc.text(h, [14, 25, 100, 130, 150, 170, 200, 220, 240][i], y));
    y += 5;
    doc.line(14, y, 280, y);
    y += 5;
    orcamentoItens.forEach((item, idx) => {
      if (y > 190) {
        doc.addPage();
        y = 20;
      }
      doc.text((idx + 1).toString(), 14, y);
      doc.text((item.descricao || "").substring(0, 40), 25, y);
      doc.text(item.codigo || "-", 100, y);
      doc.text(item.unidade || "-", 130, y);
      doc.text((item.quantidade || 0).toString(), 150, y);
      doc.text(`R$ ${(item.valor_unitario || 0).toFixed(2)}`, 170, y);
      doc.text((item.bdi || 0).toString(), 200, y);
      doc.text((item.imposto || 0).toString(), 220, y);
      doc.text(`R$ ${(item.valor_total || 0).toFixed(2)}`, 240, y);
      y += 6;
    });
    y += 5;
    doc.line(14, y, 280, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text(
      `TOTAL: ${formatCurrency(orcamentoItens.reduce((s, i) => s + (i.valor_total || 0), 0))}`,
      240,
      y
    );
    doc.save(
      `orcamento_${selectedProj?.nome?.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`
    );
  };

  const handleBaixarModelo = () => {
    const csv = [
      ["Descrição", "Código", "Unidade", "Quantidade", "Valor Unitário", "BDI %", "Imposto %"],
      ["Cimento Portland CP-II saco 50kg", "MAT001", "SC", "100", "35.50", "25", "18"],
    ]
      .map((row) => row.join(";"))
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    );
    link.download = "modelo_importacao_orcamento.csv";
    link.click();
  };

  const handleImportar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target.result;
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        const firstLine = text.split(/\r?\n/)[0] || "";
        const sep =
          (firstLine.match(/\t/g) || []).length > 0
            ? "\t"
            : (firstLine.match(/;/g) || []).length > 0
              ? ";"
              : ",";
        const parseCSV = (raw, s) => {
          const rows = [];
          let cur = "";
          let inQ = false;
          for (let i = 0; i < raw.length; i++) {
            const c = raw[i];
            const next = raw[i + 1];
            if (c === '"') {
              if (inQ && next === '"') {
                cur += '"';
                i++;
              } else {
                inQ = !inQ;
              }
            } else if ((c === "\r" && next === "\n") || c === "\n") {
              if (inQ) {
                cur += "\n";
                if (c === "\r") i++;
              } else {
                if (c === "\r") i++;
                rows.push(cur);
                cur = "";
              }
            } else {
              cur += c;
            }
          }
          if (cur.trim()) rows.push(cur);
          return rows.map((row) => {
            const vals = [];
            let field = "";
            let inQuote = false;
            for (let k = 0; k < row.length; k++) {
              const ch = row[k];
              if (ch === '"') {
                if (inQuote && row[k + 1] === '"') {
                  field += '"';
                  k++;
                } else {
                  inQuote = !inQuote;
                }
              } else if (ch === s && !inQuote) {
                vals.push(field.trim());
                field = "";
              } else {
                field += ch;
              }
            }
            vals.push(field.trim());
            return vals;
          });
        };
        const allRows = parseCSV(text, sep);
        if (allRows.length <= 1) {
          alert("Arquivo vazio ou sem dados");
          return;
        }
        const dataRows = allRows.slice(1).filter((r) => r.some((v) => v.trim()));
        let materiaisDB = [];
        try {
          const [mats, mao, ferr] = await Promise.all([
            sigo.entities.Material.filter({ empresa_id: empresaAtiva.id, ativo: true }),
            sigo.entities.MaoDeObra.filter({ empresa_id: empresaAtiva.id, ativo: true }),
            sigo.entities.Ferramental.filter({ empresa_id: empresaAtiva.id, ativo: true }),
          ]);
          materiaisDB = [...mats, ...mao, ...ferr];
        } catch {}
        const encontrar = (desc, cod) => {
          const c = (cod || "").toLowerCase();
          const d = (desc || "").toLowerCase();
          return (
            (c && materiaisDB.find((m) => (m.codigo || "").toLowerCase() === c)) ||
            materiaisDB.find((m) => (m.nome || "").toLowerCase() === d) ||
            null
          );
        };
        const itensImportados = [];
        dataRows.forEach((vals, idx) => {
          const descricao = vals[0]?.trim();
          if (!descricao) return;
          const codigoCSV = vals[1]?.trim() || "";
          const mat = encontrar(descricao, codigoCSV);
          const quantidade = parseFloat((vals[3] || "0").replace(",", ".")) || 0;
          const vlrCSV = parseFloat((vals[4] || "0").replace(",", ".")) || 0;
          const valor_unitario =
            vlrCSV > 0
              ? vlrCSV
              : mat
                ? mat.preco_referencia || mat.preco || mat.preco_medio || 0
                : 0;
          const bdi = parseFloat(vals[5]?.replace(",", ".")) || 0;
          const imposto = parseFloat(vals[6]?.replace(",", ".")) || 0;
          itensImportados.push({
            empresa_id: empresaAtiva.id,
            projeto_id: selectedProj.id,
            descricao,
            codigo: codigoCSV || mat?.codigo || "",
            unidade: vals[2]?.trim() || mat?.unidade || "UN",
            quantidade,
            valor_unitario,
            bdi,
            imposto,
            valor_total: quantidade * valor_unitario * (1 + bdi / 100) * (1 + imposto / 100),
            material_id: mat?.id || null,
            ordem: idx,
          });
        });
        if (itensImportados.length > 0) {
          const existentes = new Set(orcamentoItens.map((i) => (i.descricao || "").toLowerCase()));
          const novos = itensImportados.filter(
            (i) => !existentes.has((i.descricao || "").toLowerCase())
          );
          if (novos.length > 0) {
            await sigo.entities.OrcamentoItem.bulkCreate(novos);
            loadOrcamentoData(selectedProj.id);
          }
          alert(
            `${novos.length} itens importados!${itensImportados.length - novos.length > 0 ? `\n⚠️ ${itensImportados.length - novos.length} já existiam.` : ""}`
          );
        }
      } catch (err) {
        alert("Erro ao importar planilha");
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleSalvarTemplate = async () => {
    if (!nomeTemplate.trim()) return;
    await sigo.entities.TemplateOportunidade.create({
      empresa_id: empresaAtiva.id,
      nome: nomeTemplate,
      tipo: "orcamento",
      itens_json: JSON.stringify(orcamentoItens),
      ativo: true,
    });
    setNomeTemplate("");
    setShowSalvarTemplate(false);
    alert("Template salvo!");
  };

  const handleAplicarTemplate = async (templateId) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template?.itens_json) return;
    try {
      const itens = JSON.parse(template.itens_json);
      await sigo.entities.OrcamentoItem.bulkCreate(
        itens.map((item, idx) => ({
          empresa_id: empresaAtiva.id,
          projeto_id: selectedProj.id,
          item: (idx + 1).toString(),
          tipo: item.tipo || "Material",
          descricao: item.descricao || "",
          codigo: item.codigo || "",
          unidade: item.unidade || "UN",
          quantidade: item.quantidade || 0,
          valor_unitario: item.valor_unitario || 0,
          bdi: item.bdi || 0,
          imposto: item.imposto || 0,
          valor_total: item.valor_total || 0,
          ordem: idx,
        }))
      );
      loadOrcamentoData(selectedProj.id);
      setShowAplicarTemplate(false);
      alert("Template aplicado!");
    } catch {
      alert("Erro ao aplicar template");
    }
  };

  const itensFiltrados = orcamentoItens.filter(
    (i) => filtroTipo === "all" || i.tipo === filtroTipo
  );

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".csv"
        onChange={handleImportar}
      />

      {orcamentoItens.length > 0 && (
        <div className="flex items-center justify-between gap-4 border-b pb-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            {itensSelecionados.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1"
                onClick={handleDeleteSelecionados}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir {itensSelecionados.size}
              </Button>
            )}
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="Material">Material</SelectItem>
                <SelectItem value="Mão de Obra">Mão de Obra</SelectItem>
                <SelectItem value="Ferramental">Ferramental</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <FileText className="w-4 h-4" />
                  Ações
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setShowSalvarTemplate(true)} className="gap-2">
                  <Copy className="w-4 h-4 text-purple-600" />
                  Salvar como Template
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowAplicarTemplate(true)} className="gap-2">
                  <Copy className="w-4 h-4 text-indigo-600" />
                  Aplicar Template
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <PermissionGate modulo="Estoque" funcao="criar">
                  <DropdownMenuItem className="gap-2" onClick={() => setShowReservarItens(true)}>
                    <Package className="w-4 h-4 text-green-600" />
                    Reservar Itens
                  </DropdownMenuItem>
                </PermissionGate>
                <PermissionGate modulo="Compras" funcao="criar">
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={() =>
                      onCreateSolicitacao(
                        Array.from(itensSelecionados)
                          .map((id) => orcamentoItens.find((i) => i.id === id))
                          .filter(Boolean)
                      )
                    }
                  >
                    <ShoppingCart className="w-4 h-4 text-blue-600" />
                    Criar Solicitação de Compra
                  </DropdownMenuItem>
                </PermissionGate>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleBaixarModelo} className="gap-2">
                  <Download className="w-4 h-4 text-purple-600" />
                  Baixar Modelo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <Upload className="w-4 h-4 text-blue-600" />
                  Importar Planilha
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCSV} className="gap-2">
                  <FileText className="w-4 h-4 text-green-600" />
                  Exportar Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF} className="gap-2">
                  <FileText className="w-4 h-4 text-red-600" />
                  Exportar PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLimpar} className="gap-2 text-red-600">
                  <Trash2 className="w-4 h-4" />
                  Apagar Lista Completa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="icon" onClick={onShowStatusConfig}>
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={() => setShowRelatorios(true)} className="gap-2">
              <FileText className="w-4 h-4" />
              Relatórios
            </Button>
          </div>
        </div>
      )}

      {orcamentoItens.length === 0 ? (
        <div className="text-center py-16">
          <div className="max-w-2xl mx-auto">
            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
              <FileSpreadsheet className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-3">Novo orçamento</h3>
            <p className="text-slate-500 mb-8">
              Crie ou importe um orçamento para gerenciar itens, valores, quantidades e mais!
            </p>
            <div className="grid grid-cols-3 gap-6">
              <Card
                className="cursor-pointer hover:shadow-lg hover:border-blue-500 transition-all group"
                onClick={handleNovoItem}
              >
                <CardContent className="p-8 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100">
                    <FilePlus className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-2">Começar do zero</h3>
                  <p className="text-sm text-slate-500">Começar orçamento em branco.</p>
                </CardContent>
              </Card>
              <Card
                className="cursor-pointer hover:shadow-lg hover:border-purple-500 transition-all group"
                onClick={() => setShowAplicarTemplate(true)}
              >
                <CardContent className="p-8 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mb-4 group-hover:bg-purple-100">
                    <Copy className="w-8 h-8 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-2">Utilizar modelo</h3>
                  <p className="text-sm text-slate-500">Acelerar com um modelo pronto.</p>
                </CardContent>
              </Card>
              <Card
                className="cursor-pointer hover:shadow-lg hover:border-green-500 transition-all group"
                onClick={() => fileInputRef.current?.click()}
              >
                <CardContent className="p-8 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-4 group-hover:bg-green-100">
                    <Upload className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-2">Importar</h3>
                  <p className="text-sm text-slate-500">Importar um orçamento do Excel.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <div className="px-4 py-2 bg-slate-100 rounded-lg">
              <span className="text-sm font-medium text-slate-600">Total: </span>
              <span className="text-sm font-bold text-slate-800">
                {formatCurrency(itensFiltrados.reduce((s, i) => s + (i.valor_total || 0), 0))}
              </span>
            </div>
            <Button size="sm" onClick={handleNovoItem} className="gap-2">
              <Plus className="w-4 h-4" />
              Adicionar Item
            </Button>
          </div>

          <div className="border rounded-lg" style={{ overflow: "visible" }}>
            <table className="w-full" style={{ tableLayout: "auto" }}>
              <thead className="bg-slate-100 border-b-2">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded"
                      checked={
                        itensFiltrados.length > 0 &&
                        itensFiltrados.every((i) => itensSelecionados.has(i.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked)
                          setItensSelecionados(new Set(itensFiltrados.map((i) => i.id)));
                        else setItensSelecionados(new Set());
                      }}
                    />
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-700">Nº</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700 min-w-[300px]">
                    Descrição
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700">
                    Código
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700">
                    Unid.
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">Qtd</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">
                    Vlr Unit.
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">
                    BDI %
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">
                    Imp. %
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">
                    Vlr Total
                  </th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {itensFiltrados.map((item, index) => {
                  const podeEditar = true; // todos podem editar itens do orçamento do projeto
                  const filteredMats = materiais.filter(
                    (m) =>
                      m.nome_item?.toLowerCase().includes(itemSearchTerm.toLowerCase()) ||
                      m.codigo?.toLowerCase().includes(itemSearchTerm.toLowerCase())
                  );
                  return (
                    <tr
                      key={item.id}
                      className={`border-b hover:bg-slate-50 ${itensSelecionados.has(item.id) ? "bg-amber-50" : ""}`}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded"
                          checked={itensSelecionados.has(item.id)}
                          onChange={(e) => {
                            const n = new Set(itensSelecionados);
                            e.target.checked ? n.add(item.id) : n.delete(item.id);
                            setItensSelecionados(n);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-slate-500">{index + 1}</td>
                      <td className="px-3 py-2 relative min-w-[300px]" data-item-id={item.id}>
                        <Input
                          className="h-8 text-xs"
                          value={item.descricao || ""}
                          onChange={(e) => {
                            handleUpdate(item.id, "descricao", e.target.value);
                            setItemSearchTerm(e.target.value);
                            setShowSuggestions(true);
                            setEditingItemId(item.id);
                          }}
                          placeholder="Digite para buscar..."
                          disabled={!podeEditar}
                          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        />
                        {showSuggestions && editingItemId === item.id && itemSearchTerm && (
                          <div
                            className="absolute top-full left-0 z-[9999] bg-white border rounded-lg shadow-xl max-h-[300px] overflow-y-auto mt-1 w-full"
                            style={{ minWidth: 280 }}
                          >
                            {["Material", "Mão de Obra", "Ferramental"].map((tipo) => {
                              const items = filteredMats.filter((m) => m.tipo === tipo);
                              if (!items.length) return null;
                              return (
                                <div key={tipo}>
                                  <div className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border-b sticky top-0">
                                    {tipo}
                                  </div>
                                  {items.map((m) => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-xs border-b hover:bg-slate-100"
                                      onMouseDown={async (e) => {
                                        e.preventDefault();
                                        const valorUnitario =
                                          m.preco_referencia || m.preco || m.preco_medio || 0;
                                        const updated = {
                                          ...item,
                                          descricao: m.nome_item,
                                          codigo: m.codigo || "",
                                          unidade: m.unidade || "UN",
                                          valor_unitario: valorUnitario,
                                        };
                                        setOrcamentoItens((prev) =>
                                          prev.map((i) => (i.id === item.id ? updated : i))
                                        );
                                        setItemSearchTerm("");
                                        setShowSuggestions(false);
                                        setEditingItemId(null);
                                        const qtd = item.quantidade || 0;
                                        const bdi = item.bdi || 0;
                                        const imp = item.imposto || 0;
                                        const valor_total =
                                          qtd * valorUnitario * (1 + bdi / 100) * (1 + imp / 100);
                                        await sigo.entities.OrcamentoItem.update(item.id, {
                                          descricao: m.nome_item,
                                          codigo: m.codigo || "",
                                          unidade: m.unidade || "UN",
                                          valor_unitario: valorUnitario,
                                          valor_total,
                                        });
                                      }}
                                    >
                                      <div className="font-medium text-slate-800">
                                        {m.nome_item}
                                      </div>
                                      {m.codigo && (
                                        <div className="text-slate-500">Código: {m.codigo}</div>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              );
                            })}
                            {filteredMats.length === 0 && (
                              <button
                                type="button"
                                className="w-full text-left px-3 py-3 bg-blue-50 hover:bg-blue-100"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  onCriarMaterial(itemSearchTerm, item);
                                  setShowSuggestions(false);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <Plus className="w-4 h-4 text-blue-600" />
                                  <span className="font-medium text-blue-600">
                                    Criar: "{itemSearchTerm}"
                                  </span>
                                </div>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-8 text-xs"
                          value={item.codigo || ""}
                          onChange={(e) => handleUpdate(item.id, "codigo", e.target.value)}
                          disabled={!podeEditar}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-8 text-xs"
                          value={item.unidade || ""}
                          onChange={(e) => handleUpdate(item.id, "unidade", e.target.value)}
                          disabled={!podeEditar}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={item.quantidade || 0}
                          onChange={(e) => handleUpdate(item.id, "quantidade", e.target.value)}
                          disabled={!podeEditar}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={item.valor_unitario || 0}
                          onChange={(e) => handleUpdate(item.id, "valor_unitario", e.target.value)}
                          disabled={!podeEditar}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={item.bdi || 0}
                          onChange={(e) => handleUpdate(item.id, "bdi", e.target.value)}
                          disabled={!podeEditar}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={item.imposto || 0}
                          onChange={(e) => handleUpdate(item.id, "imposto", e.target.value)}
                          disabled={!podeEditar}
                          onBlur={async (e) => {
                            await handleUpdate(item.id, "imposto", e.target.value);
                            setTimeout(async () => {
                              const isLast =
                                orcamentoItens[orcamentoItens.length - 1]?.id === item.id;
                              const cur = orcamentoItens.find((i) => i.id === item.id);
                              if (isLast && cur?.descricao?.trim()) {
                                await handleNovoItem();
                              }
                            }, 100);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-xs font-medium text-green-700 whitespace-nowrap">
                          {formatCurrency(item.valor_total)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(item.id)}
                          disabled={!podeEditar}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 border-t-2">
                <tr>
                  <td colSpan={9} className="px-3 py-3 text-right font-semibold text-sm">
                    Total:
                  </td>
                  <td className="px-3 py-3 font-bold text-green-600 text-sm">
                    {formatCurrency(itensFiltrados.reduce((s, i) => s + (i.valor_total || 0), 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <Sheet open={showRelatorios} onOpenChange={setShowRelatorios}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <div className="sticky top-0 bg-white border-b p-6 z-10">
            <SheetHeader>
              <SheetTitle>Relatórios do Orçamento</SheetTitle>
            </SheetHeader>
          </div>
          <div className="p-6 flex-1 overflow-y-auto">
            <RelatoriosOrcamento
              orcamentoItens={orcamentoItens || []}
              nomeOrcamento={selectedProj?.nome || ""}
              clienteNome={selectedProj?.cliente_nome || ""}
            />
          </div>
        </SheetContent>
      </Sheet>

      <ReservarItensOrcamentoModal
        open={showReservarItens}
        onOpenChange={setShowReservarItens}
        projeto={selectedProj}
        empresaAtiva={empresaAtiva}
        user={user}
        onSave={() => loadOrcamentoData(selectedProj.id)}
      />

      <Sheet open={showSalvarTemplate} onOpenChange={setShowSalvarTemplate}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <div className="sticky top-0 bg-white border-b p-6 z-10">
            <SheetHeader>
              <SheetTitle>Salvar como Template</SheetTitle>
            </SheetHeader>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Nome do Template</label>
              <Input
                value={nomeTemplate}
                onChange={(e) => setNomeTemplate(e.target.value)}
                placeholder="Ex: Projeto Padrão Residencial"
                className="mt-1.5"
              />
            </div>
            <Button
              onClick={handleSalvarTemplate}
              disabled={!nomeTemplate.trim()}
              className="w-full bg-amber-500 hover:bg-amber-600"
            >
              Salvar Template
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showAplicarTemplate} onOpenChange={setShowAplicarTemplate}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <div className="sticky top-0 bg-white border-b p-6 z-10">
            <SheetHeader>
              <SheetTitle>Aplicar Template</SheetTitle>
            </SheetHeader>
          </div>
          <div className="p-6 space-y-3">
            {templates
              .filter((t) => t.tipo === "orcamento" && t.itens_json)
              .map((t) => (
                <Card
                  key={t.id}
                  className="cursor-pointer hover:shadow-md"
                  onClick={() => handleAplicarTemplate(t.id)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <Copy className="w-5 h-5 text-purple-600" />
                    <p className="font-medium">{t.nome}</p>
                  </CardContent>
                </Card>
              ))}
            {templates.filter((t) => t.tipo === "orcamento").length === 0 && (
              <p className="text-slate-500 text-center py-8">
                Nenhum template de orçamento criado ainda.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
