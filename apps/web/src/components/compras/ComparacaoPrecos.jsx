import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  Trophy,
  Check,
  Upload,
  Link2,
  Eye,
  Trash2,
  MoreVertical,
  Download,
  FileSpreadsheet,
  X,
  RefreshCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import VisualizarMaterialModal from "./VisualizarMaterialModal";

function TotalRow({ itens, fornecedores, precos, totais, collapsedCols, formatMoeda }) {
  const totalMenoresPrecos = itens.reduce((acc, item) => {
    const precosItem = fornecedores.map((f) => precos[`${item.id}_${f.id}`]).filter((p) => p > 0);
    const menor = precosItem.length > 0 ? Math.min(...precosItem) : 0;
    return acc + menor * (item.quantidade || 1);
  }, 0);

  return (
    <tr className="bg-slate-100 font-bold">
      <td colSpan="3" className="px-2 py-2 border-r" style={{ fontSize: 10 }}>
        TOTAL GERAL
      </td>
      <td
        className="px-2 py-2 border-r text-center text-blue-700 bg-blue-100"
        style={{ fontSize: 10 }}
      >
        -
      </td>
      <td
        className="px-2 py-2 border-r text-center text-green-700 bg-green-100"
        style={{ fontSize: 10 }}
      >
        {totalMenoresPrecos > 0 ? formatMoeda(totalMenoresPrecos) : "-"}
      </td>
      {fornecedores.map((f) => {
        const collapsed = collapsedCols[f.id];
        const total = totais.totaisPorFornecedor[f.id] || 0;
        const ehMenor = f.id === totais.menorFornecedor;
        if (collapsed) return <td key={f.id} className="border-r" />;
        return (
          <td key={f.id} className="px-2 py-2 border-r text-center" style={{ fontSize: 10 }}>
            <span className={ehMenor ? "text-green-700" : ""}>
              {formatMoeda(total)}
              {ehMenor && <Trophy className="w-3 h-3 inline ml-1" />}
            </span>
          </td>
        );
      })}
      <td />
    </tr>
  );
}

export default function ComparacaoPrecos({
  open,
  onOpenChange,
  cotacao,
  empresaAtiva,
  onAprovar,
  onSave,
}) {
  const [fornecedores, setFornecedores] = useState([]);
  const [itens, setItens] = useState([]);
  const [precos, setPrecos] = useState({}); // { [itemId_fornecedorId]: valor }
  const [precosOriginais, setPrecosOriginais] = useState({}); // Para comparar o que mudou
  const [materiais, setMateriais] = useState({ byId: {}, byCode: {} });
  const [colWidths, setColWidths] = useState({});
  const [collapsedCols, setCollapsedCols] = useState({});
  const resizingRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [materialSelecionado, setMaterialSelecionado] = useState(null);
  const [visualizarMaterialOpen, setVisualizarMaterialOpen] = useState(false);
  const [importando, setImportando] = useState(false);
  const [valoresDigitando, setValoresDigitando] = useState({}); // valor bruto enquanto edita
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open && cotacao?.id) {
      console.log("🔄 Carregando dados da cotação:", cotacao.numero);
      carregarDados();
    }
  }, [open, cotacao?.id]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Buscar fornecedores e itens da cotação
      const [cotFornecedores, cotItens, respostas] = await Promise.all([
        base44.entities.CotacaoFornecedor.filter({ cotacao_id: cotacao.id }),
        base44.entities.CotacaoItem.filter({ cotacao_id: cotacao.id }),
        base44.entities.CotacaoResposta.filter({ cotacao_id: cotacao.id }),
      ]);

      setFornecedores(cotFornecedores);
      setItens(cotItens);

      // Buscar todos os materiais da empresa
      const materiaisList = await base44.entities.Material.filter({ empresa_id: empresaAtiva.id });
      const materiaisMap = {};
      const materiaisByCode = {};
      materiaisList.forEach((mat) => {
        materiaisMap[mat.id] = mat;
        if (mat.codigo) materiaisByCode[mat.codigo.trim().toLowerCase()] = mat;
        // também indexar pelo nome normalizado para fallback
        if (mat.nome) materiaisByCode["nome_" + mat.nome.trim().toLowerCase()] = mat;
      });

      // Buscar SolicitacaoCompraItems para cruzar material_id -> codigo
      // Os CotacaoItem têm solicitacao_item_id que aponta para SolicitacaoCompraItem
      const solItemIds = [...new Set(cotItens.map((i) => i.solicitacao_item_id).filter(Boolean))];
      const solItensMap = {};
      if (solItemIds.length > 0 && cotacao.solicitacao_id) {
        try {
          const solItens = await base44.entities.SolicitacaoCompraItem.filter({
            solicitacao_id: cotacao.solicitacao_id,
          });
          solItens.forEach((si) => {
            solItensMap[si.id] = si;
          });
        } catch (e) {
          /* ignora */
        }
      }

      setMateriais({ byId: materiaisMap, byCode: materiaisByCode, solItens: solItensMap });

      // Mapear preços existentes
      const precosMap = {};
      respostas.forEach((resp) => {
        // Usar cotacao_item_id (que é o id do CotacaoItem) e cotacao_fornecedor_id (id do CotacaoFornecedor)
        const itemId = resp.cotacao_item_id || resp.item_id;
        const fornecedorCotId = resp.cotacao_fornecedor_id;

        if (itemId && fornecedorCotId) {
          const chave = `${itemId}_${fornecedorCotId}`;
          const valorUnit = parseFloat(resp.valor_unitario);
          // Só adicionar se for um valor válido > 0
          if (valorUnit > 0) {
            precosMap[chave] = valorUnit;
          }
        }
      });
      console.log("📊 Preços carregados do banco:", precosMap);
      setPrecos(precosMap);
      setPrecosOriginais(precosMap);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const salvarPreco = async (itemId, fornecedorCotacaoId, valor) => {
    if (!valor || valor === "" || isNaN(parseFloat(valor))) {
      console.log("❌ salvarPreco: valor inválido", { valor });
      return false;
    }

    const valorNum = parseFloat(valor);

    console.log("💾 Salvando preço no banco:", { itemId, fornecedorCotacaoId, valorNum });

    try {
      const item = itens.find((i) => i.id === itemId);
      const cotacaoFornecedor = fornecedores.find((f) => f.id === fornecedorCotacaoId);

      if (!item || !cotacaoFornecedor) {
        console.log("❌ Item ou fornecedor não encontrado");
        return false;
      }

      // Buscar resposta existente usando cotacao_item_id e cotacao_fornecedor_id
      const respostasExistentes = await base44.entities.CotacaoResposta.filter({
        cotacao_id: cotacao.id,
        cotacao_item_id: itemId,
        cotacao_fornecedor_id: fornecedorCotacaoId,
      });

      if (respostasExistentes.length > 0) {
        // Atualizar
        console.log("🔄 Atualizando resposta existente:", respostasExistentes[0].id);
        await base44.entities.CotacaoResposta.update(respostasExistentes[0].id, {
          valor_unitario: valorNum,
          valor_total: valorNum * (item.quantidade || 1),
        });
      } else {
        // Criar novo
        console.log("➕ Criando nova resposta");
        await base44.entities.CotacaoResposta.create({
          empresa_id: empresaAtiva.id,
          cotacao_id: cotacao.id,
          cotacao_item_id: itemId,
          cotacao_fornecedor_id: fornecedorCotacaoId,
          fornecedor_id: cotacaoFornecedor.fornecedor_id,
          item_descricao: item.descricao,
          valor_unitario: valorNum,
          valor_total: valorNum * (item.quantidade || 1),
          prazo_entrega_dias: 0,
        });
      }

      console.log("✅ Preço salvo com sucesso!");

      // Atualizar precosOriginais após salvar
      const chave = `${itemId}_${fornecedorCotacaoId}`;
      setPrecosOriginais((prev) => ({ ...prev, [chave]: valorNum }));

      // Atualizar status da cotação se estiver "Enviada aos Fornecedores"
      if (
        cotacao.status === "Enviada aos Fornecedores" ||
        cotacao.status === "Aguardando Respostas"
      ) {
        await base44.entities.Cotacao.update(cotacao.id, {
          status: "Respostas Recebidas",
        });

        // Notificar página pai para recarregar dados
        if (onSave) {
          onSave();
        }
      }

      return true;
    } catch (error) {
      console.error("❌ Erro ao salvar preço:", error);
      return false;
    }
  };

  const navegarProximoCampo = (itemAtual, fornecedorId) => {
    const itensOrdenados = [...itens].sort((a, b) =>
      (a.descricao || "").localeCompare(b.descricao || "", "pt-BR")
    );
    const idxAtual = itensOrdenados.findIndex((i) => i.id === itemAtual.id);

    if (idxAtual < itensOrdenados.length - 1) {
      const proximoItem = itensOrdenados[idxAtual + 1];
      setTimeout(() => {
        const input = document.querySelector(
          `input[data-campo="${proximoItem.id}_${fornecedorId}"]`
        );
        if (input) {
          input.focus();
          input.select();
        }
      }, 50);
    }
  };

  const handleReabrirFornecedor = async (fornecedorCotId) => {
    const fornecedor = fornecedores.find((f) => f.id === fornecedorCotId);
    if (
      !fornecedor ||
      !confirm(
        `Reabrir cotação para ${fornecedor.fornecedor_nome}? O fornecedor poderá modificar os preços novamente.`
      )
    )
      return;

    try {
      await base44.entities.CotacaoFornecedor.update(fornecedorCotId, {
        status: "Enviada",
        data_resposta: null,
      });
      await carregarDados();
    } catch (error) {
      console.error("Erro ao reabrir:", error);
      alert("Erro ao reabrir cotação para o fornecedor");
    }
  };

  const handleExcluirItem = async (itemId) => {
    if (!confirm("Excluir este item?")) return;

    try {
      await base44.entities.CotacaoItem.delete(itemId);
      await carregarDados();
    } catch (error) {
      console.error("Erro ao excluir:", error);
      alert("Erro ao excluir item");
    }
  };

  // Calcular totais por fornecedor e identificar menor preço
  const totais = useMemo(() => {
    const totaisPorFornecedor = {};

    fornecedores.forEach((f) => {
      totaisPorFornecedor[f.id] = 0;
    });

    itens.forEach((item) => {
      fornecedores.forEach((f) => {
        const chave = `${item.id}_${f.id}`;
        const preco = precos[chave] || 0;
        totaisPorFornecedor[f.id] += preco * (item.quantidade || 1);
      });
    });

    // Encontrar fornecedor com menor preço
    let menorFornecedor = null;
    let menorValor = Infinity;

    Object.entries(totaisPorFornecedor).forEach(([fornecedorId, total]) => {
      if (total > 0 && total < menorValor) {
        menorValor = total;
        menorFornecedor = fornecedorId;
      }
    });

    return { totaisPorFornecedor, menorFornecedor };
  }, [fornecedores, itens, precos]);

  // itensSelecionados: { [itemId]: fornecedorCotId }
  const [itensSelecionados, setItensSelecionados] = useState({});
  const [aprovando, setAprovando] = useState(false);

  // Pré-seleciona o menor preço por item ao abrir
  useEffect(() => {
    if (!loading && itens.length > 0 && fornecedores.length > 0) {
      const selecionados = {};
      itens.forEach((item) => {
        let menorPreco = Infinity;
        let menorFornId = null;
        fornecedores.forEach((f) => {
          const p = precos[`${item.id}_${f.id}`];
          if (p > 0 && p < menorPreco) {
            menorPreco = p;
            menorFornId = f.id;
          }
        });
        if (menorFornId) selecionados[item.id] = menorFornId;
      });
      setItensSelecionados(selecionados);
    }
  }, [loading, itens, fornecedores, precos]);

  const handleAprovarPorItem = async () => {
    const totalAprovado = Object.entries(itensSelecionados).reduce((acc, [itemId, fornId]) => {
      const item = itens.find((i) => i.id === itemId);
      const preco = precos[`${itemId}_${fornId}`] || 0;
      return acc + preco * (item?.quantidade || 1);
    }, 0);

    // Fornecedores vencedores (aqueles que têm pelo menos 1 item)
    const fornecedoresVencedores = [...new Set(Object.values(itensSelecionados))];
    const nomesVencedores = fornecedoresVencedores
      .map((fId) => fornecedores.find((f) => f.id === fId)?.fornecedor_nome)
      .filter(Boolean)
      .join(", ");

    if (
      !confirm(
        `Confirmar aprovação por item?\n\nFornecedores selecionados: ${nomesVencedores}\nTotal: ${formatMoeda(totalAprovado)}`
      )
    )
      return;

    setAprovando(true);
    try {
      // Marcar cada CotacaoResposta selecionada como aprovada
      for (const [itemId, fornId] of Object.entries(itensSelecionados)) {
        const respostas = await base44.entities.CotacaoResposta.filter({
          cotacao_id: cotacao.id,
          cotacao_item_id: itemId,
          cotacao_fornecedor_id: fornId,
        });
        if (respostas.length > 0) {
          await base44.entities.CotacaoResposta.update(respostas[0].id, { aprovado: true });
        }
      }

      // Atualizar a cotação (vencedor principal = quem tem mais itens)
      const contagem = {};
      Object.values(itensSelecionados).forEach((fId) => {
        contagem[fId] = (contagem[fId] || 0) + 1;
      });
      const principalId = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]?.[0];
      const principal = fornecedores.find((f) => f.id === principalId);

      await base44.entities.Cotacao.update(cotacao.id, {
        status: "Aprovada",
        fornecedor_vencedor_id: principal?.fornecedor_id || "",
        fornecedor_vencedor_nome:
          fornecedoresVencedores.length > 1
            ? `Split: ${nomesVencedores}`
            : principal?.fornecedor_nome || "",
        valor_aprovado: totalAprovado,
      });

      if (cotacao.solicitacao_id) {
        await base44.entities.SolicitacaoCompra.update(cotacao.solicitacao_id, {
          status: "Cotação Aprovada",
        });
      }

      alert("✅ Cotação aprovada com sucesso!");
      if (onAprovar) onAprovar();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao aprovar:", error);
      alert("Erro ao aprovar cotação");
    } finally {
      setAprovando(false);
    }
  };

  const formatMoeda = (valor) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor || 0);
  };

  const handleSalvarTodos = async () => {
    setSalvando(true);
    try {
      const precosPendentes = [];

      Object.keys(precos).forEach((chave) => {
        const valorAtual = precos[chave];

        if (
          valorAtual !== "" &&
          valorAtual !== null &&
          valorAtual !== undefined &&
          valorAtual > 0
        ) {
          const [itemId, fornecedorCotacaoId] = chave.split("_");
          precosPendentes.push({ itemId, fornecedorCotacaoId, valor: valorAtual });
        }
      });

      for (const { itemId, fornecedorCotacaoId, valor } of precosPendentes) {
        const valorNum = parseFloat(valor);
        if (!isNaN(valorNum)) {
          await salvarPreco(itemId, fornecedorCotacaoId, valorNum.toString());
        }
      }

      // Atualizar status da cotação
      if (
        cotacao.status === "Enviada aos Fornecedores" ||
        cotacao.status === "Aguardando Respostas"
      ) {
        await base44.entities.Cotacao.update(cotacao.id, {
          status: "Respostas Recebidas",
        });

        if (onSave) {
          onSave();
        }
      }

      setPrecosOriginais({ ...precos });
      alert("✅ Todos os preços foram salvos com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("❌ Erro ao salvar alguns preços. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  const handleFecharModal = () => {
    onOpenChange(false);
  };

  const exportarModelo = () => {
    const itensOrdenados = [...itens].sort((a, b) =>
      (a.descricao || "").localeCompare(b.descricao || "", "pt-BR")
    );

    const colunas = [
      "Código",
      "Descrição",
      "Quantidade",
      "Unidade",
      ...fornecedores.map((f) => f.fornecedor_nome),
    ];
    const linhas = itensOrdenados.map((item) => [
      item.material_codigo || "",
      item.descricao,
      item.quantidade,
      item.unidade,
      ...fornecedores.map(() => ""),
    ]);

    const csv = [colunas, ...linhas].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Modelo_Cotacao_${cotacao.numero}.csv`;
    link.click();
  };

  const importarExcel = async (arquivo) => {
    setImportando(true);
    try {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const csv = e.target.result;
          const linhas = csv
            .split("\n")
            .slice(1)
            .filter((l) => l.trim());

          let importados = 0;
          let erros = 0;

          for (const linhaStr of linhas) {
            const colunas = linhaStr.split(";").map((c) => c.replace(/^"/, "").replace(/"$/, ""));
            const descricao = colunas[1];
            const item = itens.find((i) => i.descricao === descricao);

            if (!item) {
              erros++;
              continue;
            }

            for (let i = 0; i < fornecedores.length; i++) {
              const valorStr = colunas[4 + i];
              if (valorStr && !isNaN(parseFloat(valorStr))) {
                const valor = parseFloat(valorStr);
                await salvarPreco(item.id, fornecedores[i].id, valor.toString());
                importados++;
              }
            }
          }

          alert(
            `Importação concluída!\n${importados} preços importados${erros > 0 ? `\n${erros} erros encontrados` : ""}`
          );
          await carregarDados();
        } catch (error) {
          console.error("Erro ao processar arquivo:", error);
          alert("Erro ao processar arquivo");
        } finally {
          setImportando(false);
        }
      };

      reader.readAsText(arquivo);
    } catch (error) {
      console.error("Erro ao importar:", error);
      alert("Erro ao importar arquivo");
      setImportando(false);
    }
  };

  if (loading) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="h-full p-6 overflow-y-auto"
          style={{
            position: "fixed",
            inset: 0,
            width: "100vw",
            maxWidth: "100vw",
            height: "100vh",
            zIndex: 9999,
          }}
        >
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-slate-600">Carregando...</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const itensOrdenados = [...itens].sort((a, b) =>
    (a.descricao || "").localeCompare(b.descricao || "", "pt-BR")
  );

  const getMaterialCodigo = (item) => {
    // 1. Cruzar pelo material_id direto
    if (item.material_id && materiais.byId?.[item.material_id]) {
      return materiais.byId[item.material_id].codigo || "-";
    }
    // 2. Cruzar pelo solicitacao_item_id -> SolicitacaoCompraItem -> material_id ou material_codigo
    if (item.solicitacao_item_id && materiais.solItens?.[item.solicitacao_item_id]) {
      const si = materiais.solItens[item.solicitacao_item_id];
      if (si.material_id && materiais.byId?.[si.material_id]) {
        return materiais.byId[si.material_id].codigo || "-";
      }
      if (si.material_codigo) {
        const found = materiais.byCode?.[si.material_codigo.trim().toLowerCase()];
        if (found) return found.codigo;
        return si.material_codigo;
      }
    }
    // 3. Cruzar pelo material_codigo do próprio item
    if (item.material_codigo) {
      const found = materiais.byCode?.[item.material_codigo.trim().toLowerCase()];
      if (found) return found.codigo;
      return item.material_codigo;
    }
    return "-";
  };

  const startResize = (e, colKey) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[colKey] || 140;
    const onMove = (ev) =>
      setColWidths((prev) => ({ ...prev, [colKey]: Math.max(60, startW + ev.clientX - startX) }));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const toggleCollapse = (colKey) =>
    setCollapsedCols((prev) => ({ ...prev, [colKey]: !prev[colKey] }));

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="h-full p-0 flex flex-col"
          style={{
            position: "fixed",
            inset: 0,
            width: "100vw",
            maxWidth: "100vw",
            height: "100vh",
            maxHeight: "100vh",
            zIndex: 9999,
          }}
        >
          <div className="sticky top-0 bg-white border-b px-3 py-1 z-10 flex-shrink-0 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Comparação de Preços - {cotacao?.numero}
            </span>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 hover:bg-slate-100 rounded lg:hidden"
            >
              <X className="w-3 h-3 text-slate-600" />
            </button>
          </div>
          <div className="flex-1 p-2 overflow-hidden">
            <Tabs defaultValue="manual" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-2 h-7">
                <TabsTrigger value="manual" className="text-xs py-0">
                  Digitação Manual
                </TabsTrigger>
                <TabsTrigger value="excel" className="text-xs py-0">
                  <Upload className="w-3 h-3 mr-1" />
                  Importar Excel
                </TabsTrigger>
                <TabsTrigger value="links" disabled className="text-xs py-0">
                  <Link2 className="w-3 h-3 mr-1" />
                  Links Fornecedores
                </TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="space-y-2">
                {/* Cards Resumo */}
                <div className="flex gap-2 items-center">
                  <div className="bg-slate-50 border rounded px-3 py-1 flex items-center gap-2">
                    <span className="text-xs text-slate-500">Fornecedores:</span>
                    <span className="text-sm font-bold text-slate-800">{fornecedores.length}</span>
                  </div>
                  <div className="bg-slate-50 border rounded px-3 py-1 flex items-center gap-2">
                    <span className="text-xs text-slate-500">Itens:</span>
                    <span className="text-sm font-bold text-blue-600">{itens.length}</span>
                  </div>
                  <div className="bg-slate-50 border rounded px-3 py-1 flex items-center gap-2">
                    <span className="text-xs text-slate-500">Melhor Preço (por item):</span>
                    <span className="text-sm font-bold text-green-600">
                      {formatMoeda(
                        itens.reduce((acc, item) => {
                          const precosItem = fornecedores
                            .map((f) => precos[`${item.id}_${f.id}`])
                            .filter((p) => p > 0);
                          const menor = precosItem.length > 0 ? Math.min(...precosItem) : 0;
                          return acc + menor * (item.quantidade || 1);
                        }, 0)
                      )}
                    </span>
                  </div>
                </div>

                {/* Tabela */}
                <Card>
                  <CardHeader className="py-1 px-3">
                    <CardTitle style={{ fontSize: 10 }}>Tabela de Preços</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "72vh" }}>
                      <table
                        className="border-collapse"
                        style={{
                          fontSize: 10,
                          tableLayout: "fixed",
                          width: "max-content",
                          minWidth: "100%",
                        }}
                      >
                        <thead className="bg-slate-50 sticky top-0 z-20">
                          <tr>
                            {/* Código */}
                            <th
                              style={{
                                width: colWidths["cod"] || 70,
                                minWidth: 40,
                                position: "relative",
                                fontSize: 10,
                              }}
                              className="text-left px-2 py-1 font-semibold border-b border-r whitespace-normal break-words"
                            >
                              Código
                              <div
                                onMouseDown={(e) => startResize(e, "cod")}
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: 5,
                                  cursor: "col-resize",
                                  background: "transparent",
                                }}
                              />
                            </th>
                            {/* Item */}
                            <th
                              style={{
                                width: colWidths["item"] || 220,
                                minWidth: 80,
                                position: "relative",
                                fontSize: 10,
                              }}
                              className="text-left px-2 py-1 font-semibold border-b border-r whitespace-normal break-words"
                            >
                              Item
                              <div
                                onMouseDown={(e) => startResize(e, "item")}
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: 5,
                                  cursor: "col-resize",
                                  background: "transparent",
                                }}
                              />
                            </th>
                            {/* Qtd */}
                            <th
                              style={{
                                width: colWidths["qtd"] || 60,
                                minWidth: 40,
                                position: "relative",
                                fontSize: 10,
                              }}
                              className="text-center px-2 py-1 font-semibold border-b border-r whitespace-normal break-words"
                            >
                              Qtd
                              <div
                                onMouseDown={(e) => startResize(e, "qtd")}
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: 5,
                                  cursor: "col-resize",
                                  background: "transparent",
                                }}
                              />
                            </th>
                            {/* Menor Unitário */}
                            <th
                              style={{
                                width: colWidths["menorUnit"] || 80,
                                minWidth: 50,
                                position: "relative",
                                fontSize: 10,
                              }}
                              className="text-center px-2 py-1 font-semibold border-b border-r bg-blue-50 whitespace-normal break-words"
                            >
                              Menor Unit.
                              <div
                                onMouseDown={(e) => startResize(e, "menorUnit")}
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: 5,
                                  cursor: "col-resize",
                                  background: "transparent",
                                }}
                              />
                            </th>
                            {/* Menor Total */}
                            <th
                              style={{
                                width: colWidths["melhor"] || 90,
                                minWidth: 50,
                                position: "relative",
                                fontSize: 10,
                              }}
                              className="text-center px-2 py-1 font-semibold border-b border-r bg-green-50 whitespace-normal break-words"
                            >
                              Menor Total
                              <div
                                onMouseDown={(e) => startResize(e, "melhor")}
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: 5,
                                  cursor: "col-resize",
                                  background: "transparent",
                                }}
                              />
                            </th>
                            {fornecedores.map((f) => {
                              const collapsed = collapsedCols[f.id];
                              const w = collapsed ? 28 : colWidths[f.id] || 140;
                              return (
                                <th
                                  key={f.id}
                                  style={{
                                    width: w,
                                    minWidth: collapsed ? 28 : 60,
                                    position: "relative",
                                    fontSize: 10,
                                  }}
                                  className="text-center px-1 py-1 font-semibold border-b border-r whitespace-normal break-words"
                                >
                                  {collapsed ? (
                                    <button
                                      onClick={() => toggleCollapse(f.id)}
                                      title={f.fornecedor_nome}
                                      className="writing-mode-vertical text-xs rotate-180"
                                      style={{ writingMode: "vertical-rl", fontSize: 9 }}
                                    >
                                      ▶
                                    </button>
                                  ) : (
                                    <div className="flex flex-col gap-0.5 items-center">
                                      <div className="flex items-center gap-1 justify-center w-full">
                                        <span
                                          className="break-words text-center"
                                          style={{ fontSize: 10 }}
                                        >
                                          {f.fornecedor_nome}
                                        </span>
                                        <button
                                          onClick={() => toggleCollapse(f.id)}
                                          title="Recolher coluna"
                                          className="text-slate-400 hover:text-slate-700 flex-shrink-0"
                                          style={{ fontSize: 9 }}
                                        >
                                          ◀
                                        </button>
                                      </div>
                                      <Badge
                                        variant={
                                          f.status === "Respondida" ? "default" : "secondary"
                                        }
                                        className="text-xs"
                                        style={{ fontSize: 9 }}
                                      >
                                        {f.status}
                                      </Badge>
                                      {(f.status === "Respondida Totalmente" ||
                                        f.status === "Respondida Parcialmente" ||
                                        f.status === "Respondida") && (
                                        <button
                                          onClick={() => handleReabrirFornecedor(f.id)}
                                          className="flex items-center gap-0.5 text-amber-600 hover:text-amber-700 underline"
                                          style={{ fontSize: 9 }}
                                        >
                                          <RefreshCw className="w-2 h-2" /> Reabrir
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {!collapsed && (
                                    <div
                                      onMouseDown={(e) => startResize(e, f.id)}
                                      style={{
                                        position: "absolute",
                                        right: 0,
                                        top: 0,
                                        bottom: 0,
                                        width: 5,
                                        cursor: "col-resize",
                                        background: "transparent",
                                      }}
                                    />
                                  )}
                                </th>
                              );
                            })}
                            <th
                              style={{ width: 50, fontSize: 10 }}
                              className="text-center px-2 py-1 font-semibold border-b"
                            >
                              Ações
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {itensOrdenados.map((item) => {
                            const precosItem = fornecedores
                              .map((f) => precos[`${item.id}_${f.id}`])
                              .filter((p) => p > 0);
                            const menorPrecoItem =
                              precosItem.length > 0 ? Math.min(...precosItem) : null;
                            return (
                              <tr key={item.id} className="border-b hover:bg-slate-50">
                                <td
                                  className="px-2 py-1 border-r text-slate-600 break-words"
                                  style={{ fontSize: 10, wordBreak: "break-all" }}
                                >
                                  {getMaterialCodigo(item)}
                                </td>
                                <td
                                  className="px-2 py-1 border-r break-words"
                                  style={{ fontSize: 10, wordBreak: "break-word" }}
                                >
                                  {item.descricao}
                                </td>
                                <td
                                  className="px-2 py-1 border-r text-center break-words"
                                  style={{ fontSize: 10 }}
                                >
                                  {item.quantidade} {item.unidade}
                                </td>
                                <td
                                  className="px-2 py-1 border-r text-center font-bold text-blue-700 bg-blue-50"
                                  style={{ fontSize: 10 }}
                                >
                                  {menorPrecoItem ? formatMoeda(menorPrecoItem) : "-"}
                                </td>
                                <td
                                  className="px-2 py-1 border-r text-center font-bold text-green-700 bg-green-50"
                                  style={{ fontSize: 10 }}
                                >
                                  {menorPrecoItem
                                    ? formatMoeda(menorPrecoItem * item.quantidade)
                                    : "-"}
                                </td>
                                {fornecedores.map((f) => {
                                  const collapsed = collapsedCols[f.id];
                                  const chave = `${item.id}_${f.id}`;
                                  const preco = precos[chave] || 0;
                                  const ehMenor =
                                    preco > 0 && menorPrecoItem && preco === menorPrecoItem;
                                  const ehSelecionado = itensSelecionados[item.id] === f.id;
                                  const semPreco = !preco || preco <= 0;
                                  const ehPerdendo =
                                    preco > 0 && menorPrecoItem && preco > menorPrecoItem;
                                  if (collapsed)
                                    return (
                                      <td
                                        key={f.id}
                                        className="border-r bg-slate-50"
                                        style={{ width: 28 }}
                                      />
                                    );
                                  return (
                                    <td
                                      key={f.id}
                                      className={`px-1 py-1 border-r ${ehSelecionado ? "bg-green-50" : semPreco ? "bg-yellow-50" : ehPerdendo ? "bg-red-50" : ""}`}
                                    >
                                      <div
                                        className={`p-1 rounded border ${ehSelecionado ? "border-green-600 bg-green-50" : ehMenor ? "border-blue-400 bg-blue-50" : semPreco ? "border-yellow-300 bg-yellow-50" : ehPerdendo ? "border-red-300 bg-red-50" : "border-slate-200"}`}
                                      >
                                        <Input
                                          type="text"
                                          placeholder="0,00"
                                          value={
                                            chave in valoresDigitando
                                              ? valoresDigitando[chave]
                                              : preco > 0
                                                ? preco.toFixed(2).replace(".", ",")
                                                : ""
                                          }
                                          disabled={salvando}
                                          data-campo={chave}
                                          style={{
                                            fontSize: 10,
                                            height: 24,
                                            textAlign: "center",
                                            padding: "0 4px",
                                          }}
                                          className={ehMenor ? "font-bold text-green-700" : ""}
                                          onFocus={() => {
                                            setValoresDigitando((prev) => ({
                                              ...prev,
                                              [chave]:
                                                preco > 0 ? preco.toFixed(2).replace(".", ",") : "",
                                            }));
                                          }}
                                          onChange={(e) => {
                                            setValoresDigitando((prev) => ({
                                              ...prev,
                                              [chave]: e.target.value,
                                            }));
                                          }}
                                          onKeyDown={async (e) => {
                                            if (e.key === "Tab" || e.key === "Enter") {
                                              e.preventDefault();
                                              const raw = (valoresDigitando[chave] || "")
                                                .replace("R$", "")
                                                .replace(/\s/g, "")
                                                .replace(",", ".");
                                              if (raw && !isNaN(parseFloat(raw))) {
                                                const valorNum = parseFloat(raw);
                                                setPrecos((prev) => ({
                                                  ...prev,
                                                  [chave]: valorNum,
                                                }));
                                                await salvarPreco(item.id, f.id, raw);
                                              }
                                              setValoresDigitando((prev) => {
                                                const n = { ...prev };
                                                delete n[chave];
                                                return n;
                                              });
                                              navegarProximoCampo(item, f.id);
                                            }
                                          }}
                                          onBlur={async (e) => {
                                            const raw = (valoresDigitando[chave] || "")
                                              .replace("R$", "")
                                              .replace(/\s/g, "")
                                              .replace(",", ".");
                                            if (raw && !isNaN(parseFloat(raw))) {
                                              const valorNum = parseFloat(raw);
                                              setPrecos((prev) => ({ ...prev, [chave]: valorNum }));
                                              await salvarPreco(item.id, f.id, raw);
                                            }
                                            setValoresDigitando((prev) => {
                                              const n = { ...prev };
                                              delete n[chave];
                                              return n;
                                            });
                                          }}
                                        />
                                        {preco > 0 && (
                                          <p
                                            className={`mt-0.5 text-center cursor-pointer ${ehSelecionado ? "text-green-700 font-bold" : "text-slate-500"}`}
                                            style={{ fontSize: 9 }}
                                            onClick={() =>
                                              preco > 0 &&
                                              setItensSelecionados((prev) => ({
                                                ...prev,
                                                [item.id]: f.id,
                                              }))
                                            }
                                            title="Clique para selecionar como vencedor"
                                          >
                                            {formatMoeda(
                                              (parseFloat(preco) || 0) * item.quantidade
                                            )}
                                            {ehSelecionado && (
                                              <Check className="w-2 h-2 inline ml-0.5 text-green-600" />
                                            )}
                                            {!ehSelecionado && ehMenor && (
                                              <Trophy className="w-2 h-2 inline ml-0.5 text-blue-600" />
                                            )}
                                          </p>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="px-1 py-1 text-center">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                        <MoreVertical className="w-3 h-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setMaterialSelecionado(item.solicitacao_item_id);
                                          setVisualizarMaterialOpen(true);
                                        }}
                                      >
                                        <Eye className="w-3 h-3 mr-2" /> Ver Detalhes
                                      </DropdownMenuItem>
                                      {fornecedores.map((f) => {
                                        const p = precos[`${item.id}_${f.id}`];
                                        if (!p || p <= 0) return null;
                                        const ehSelecionado = itensSelecionados[item.id] === f.id;
                                        return (
                                          <DropdownMenuItem
                                            key={f.id}
                                            onClick={() =>
                                              setItensSelecionados((prev) => ({
                                                ...prev,
                                                [item.id]: f.id,
                                              }))
                                            }
                                            className={
                                              ehSelecionado ? "text-green-700 font-bold" : ""
                                            }
                                          >
                                            <Check className="w-3 h-3 mr-2" />{" "}
                                            {ehSelecionado ? "✓ " : ""}
                                            {f.fornecedor_nome}
                                          </DropdownMenuItem>
                                        );
                                      })}
                                      <DropdownMenuItem
                                        onClick={() => handleExcluirItem(item.id)}
                                        className="text-red-600"
                                      >
                                        <Trash2 className="w-3 h-3 mr-2" /> Excluir
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </td>
                              </tr>
                            );
                          })}
                          {/* Linha de Totais */}
                          <TotalRow
                            itens={itensOrdenados}
                            fornecedores={fornecedores}
                            precos={precos}
                            totais={totais}
                            collapsedCols={collapsedCols}
                            formatMoeda={formatMoeda}
                          />
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Botão Aprovar */}
                <div className="flex justify-end">
                  <Button
                    onClick={handleAprovarPorItem}
                    disabled={aprovando || Object.keys(itensSelecionados).length === 0}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    {aprovando ? "Aprovando..." : "Confirmar Aprovação por Item"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="excel" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Importar Preços via Excel</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Passo 1: Baixar Modelo */}
                    <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">
                        1
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-800 mb-1">Baixar Modelo</h4>
                        <p className="text-sm text-slate-600 mb-3">
                          Baixe a planilha modelo com os itens da cotação
                        </p>
                        <Button onClick={exportarModelo} variant="outline" size="sm">
                          <Download className="w-4 h-4 mr-2" />
                          Baixar Modelo Excel
                        </Button>
                      </div>
                    </div>

                    {/* Passo 2: Preencher */}
                    <div className="flex items-start gap-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="w-8 h-8 bg-amber-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">
                        2
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-800 mb-1">Preencher Preços</h4>
                        <p className="text-sm text-slate-600">
                          Abra o arquivo Excel e preencha os preços unitários nas colunas de cada
                          fornecedor
                        </p>
                      </div>
                    </div>

                    {/* Passo 3: Importar */}
                    <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">
                        3
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-800 mb-1">Importar Planilha</h4>
                        <p className="text-sm text-slate-600 mb-3">
                          Faça upload do arquivo preenchido para importar os preços
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              importarExcel(e.target.files[0]);
                            }
                          }}
                        />
                        <Button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={importando}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {importando ? "Importando..." : "Importar Excel"}
                        </Button>
                      </div>
                    </div>

                    {/* Informações */}
                    <div className="bg-slate-50 p-4 rounded-lg border">
                      <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4" />
                        Informações Importantes
                      </h4>
                      <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                        <li>Não altere os nomes das colunas (Descrição, fornecedores, etc)</li>
                        <li>Preencha apenas os valores unitários</li>
                        <li>Use ponto (.) como separador decimal</li>
                        <li>Células vazias serão ignoradas</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="links">
                <Card>
                  <CardContent className="p-8 text-center">
                    <Link2 className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Links para Fornecedores</h3>
                    <p className="text-slate-500">Próxima etapa</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
          <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex justify-end gap-3">
            <Button
              onClick={handleSalvarTodos}
              disabled={salvando}
              className="bg-green-600 hover:bg-green-700"
            >
              {salvando ? "Salvando..." : "💾 Salvar Tudo"}
            </Button>
            <Button variant="outline" onClick={handleFecharModal} disabled={salvando}>
              Fechar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <VisualizarMaterialModal
        open={visualizarMaterialOpen}
        onOpenChange={setVisualizarMaterialOpen}
        solicitacaoItemId={materialSelecionado}
      />
    </>
  );
}
