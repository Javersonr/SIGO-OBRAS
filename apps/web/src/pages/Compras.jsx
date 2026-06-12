import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../Layout";
import { consumirDraftSC } from "@/lib/sc-draft";
import {
  ShoppingCart,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  FileText,
  Send,
  Check,
  Clock,
  CheckCircle2,
  X,
  TrendingDown,
  Award,
  MessageSquare,
  Rocket,
  PackageCheck,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import SortButton from "../components/shared/SortButton";
import SortableTableHeader from "../components/shared/SortableTableHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import SolicitacaoModal from "../components/compras/SolicitacaoModal";
import CotacaoModal from "../components/compras/CotacaoModal";
import ComparacaoPrecos from "../components/compras/ComparacaoPrecos";
import LinksModal from "../components/compras/LinksModal";
import HistoricoTab from "../components/compras/HistoricoTab";
import AprovacaoModal from "../components/compras/AprovacaoModal";
import PedidoDiretoModal from "../components/compras/PedidoDiretoModal";
import ConferirRecebimentoModal from "../components/compras/ConferirRecebimentoModal";
import ChatContextual from "../components/chat/ChatContextual";
import ConfirmacaoExclusaoModal from "../components/compras/ConfirmacaoExclusaoModal";
import AdicionarItensCotacaoModal from "../components/compras/AdicionarItensCotacaoModal";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ComprasHeader from "../components/compras/ComprasHeader";

const statusColors = {
  "Pendente Aprovação": "bg-yellow-100 text-yellow-700",
  Aprovada: "bg-green-100 text-green-700",
  "Em Cotação": "bg-purple-100 text-purple-700",
  "Cotação Aprovada": "bg-blue-100 text-blue-700",
  "Pedido Gerado": "bg-teal-100 text-teal-700",
  Cancelada: "bg-red-100 text-red-700",
  Emitido: "bg-blue-100 text-blue-700",
  Enviado: "bg-purple-100 text-purple-700",
  Confirmado: "bg-cyan-100 text-cyan-700",
  "Em Trânsito": "bg-amber-100 text-amber-700",
  Entregue: "bg-green-100 text-green-700",
  Aberta: "bg-slate-100 text-slate-700",
  "Enviada aos Fornecedores": "bg-blue-100 text-blue-700",
  "Aguardando Respostas": "bg-purple-100 text-purple-700",
  "Respostas Recebidas": "bg-cyan-100 text-cyan-700",
};

export default function Compras() {
  const { empresaAtiva, perfil, user, temPermissao } = useEmpresa();
  const [activeTab, setActiveTab] = useState("solicitacoes");
  const [loading, setLoading] = useState(true);

  // Dados
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [cotacoes, setCotacoes] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [solicitacaoItens, setSolicitacaoItens] = useState([]);

  // Modais
  const [showSolicitacaoModal, setShowSolicitacaoModal] = useState(false);
  const [showCotacaoModal, setShowCotacaoModal] = useState(false);
  const [showComparacaoModal, setShowComparacaoModal] = useState(false);
  const [showLinksModal, setShowLinksModal] = useState(false);
  const [showAprovacaoModal, setShowAprovacaoModal] = useState(false);
  const [showPedidoDiretoModal, setShowPedidoDiretoModal] = useState(false);
  const [showRecebimentoModal, setShowRecebimentoModal] = useState(false);
  const [aprovacaoData, setAprovacaoData] = useState({
    solicitacao: null,
    aprovacoes: [],
    itens: [],
  });
  const [showChatSolicitacao, setShowChatSolicitacao] = useState(false);
  const [showChatPedido, setShowChatPedido] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showConfirmacaoExclusao, setShowConfirmacaoExclusao] = useState(false);
  const [showAdicionarItensCotacao, setShowAdicionarItensCotacao] = useState(false);
  const [tipoExclusao, setTipoExclusao] = useState(null);
  const [solicitacoesSelecionadas, setSolicitacoesSelecionadas] = useState([]);
  const [cotacoesSelecionadas, setCotacoesSelecionadas] = useState([]);
  const [pedidosSelecionados, setPedidosSelecionados] = useState([]);

  // Forms
  const [solicitacaoForm, setSolicitacaoForm] = useState({
    projeto_id: "",
    projeto_nome: "",
    prioridade: "Normal",
    data_necessidade: "",
    observacoes: "",
    itens: [{ descricao: "", quantidade: 1, unidade: "UN", ultimo_preco: null }],
  });

  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("Pendente Aprovação");
  const [sortConfig, setSortConfig] = useState({ field: "created_date", direction: "desc" });

  const loadData = React.useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const [sols, cots, peds, projs, forns] = await Promise.all([
        sigo.entities.SolicitacaoCompra.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.Cotacao.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.PedidoCompra.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id, arquivado: false }),
        sigo.entities.Fornecedor.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ]);

      setSolicitacoes(sols);
      setCotacoes(cots);
      setPedidos(peds);
      setProjetos(projs);
      setFornecedores(forns);
    } catch (error) {
      console.error("Erro:", error);
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadData();
    }
  }, [empresaAtiva?.id, loadData]);

  useEffect(() => {
    // Consome draft em sessionStorage (vindo de Estoque ou Projetos>Orçamento).
    // consumirDraftSC() lê e remove atomicamente — não dispara 2x.
    if (showSolicitacaoModal) return;
    const data = consumirDraftSC();
    if (!data) return;

    setSolicitacaoForm({
      projeto_id: data.projeto_id || "",
      projeto_nome: data.projeto_nome || "",
      oportunidade_id: data.oportunidade_id || "",
      oportunidade_nome: data.oportunidade_nome || "",
      prioridade: data.prioridade || (data.origem === "Estoque" ? "Alta" : "Normal"),
      origem: data.origem || "Manual",
      data_necessidade: data.data_necessidade || "",
      observacoes: data.observacoes || "",
      itens:
        data.itens?.length > 0
          ? data.itens.map((it) => ({
              material_id: it.material_id || "",
              material_codigo: it.material_codigo || "",
              descricao: it.descricao || "",
              quantidade: it.quantidade ?? 1,
              unidade: it.unidade || "UN",
              preco_unitario_estimado: it.preco_unitario_estimado ?? 0,
              especificacoes: it.especificacoes || "",
            }))
          : [{ descricao: "", quantidade: 1, unidade: "UN", especificacoes: "" }],
    });
    setShowSolicitacaoModal(true);
  }, [showSolicitacaoModal]);

  const gerarNumero = (tipo) => {
    const ano = new Date().getFullYear();
    const lista = tipo === "SC" ? solicitacoes : tipo === "COT" ? cotacoes : pedidos;
    const numero = lista.length + 1;
    return `${tipo}${ano}-${String(numero).padStart(4, "0")}`;
  };

  const handleOpenSolicitacao = () => {
    setSolicitacaoForm({
      projeto_id: "",
      projeto_nome: "",
      prioridade: "Normal",
      data_necessidade: "",
      observacoes: "",
      itens: [{ descricao: "", quantidade: 1, unidade: "UN", especificacoes: "" }],
    });
    setShowSolicitacaoModal(true);
  };

  const handleSaveSolicitacao = async () => {
    const itensValidos = solicitacaoForm.itens.filter((i) => i.descricao);
    if (itensValidos.length === 0) {
      alert("Adicione pelo menos um item");
      return;
    }

    setSaving(true);
    try {
      const proj = projetos.find((p) => p.id === solicitacaoForm.projeto_id);

      const novaSol = await sigo.entities.SolicitacaoCompra.create({
        empresa_id: empresaAtiva.id,
        numero: gerarNumero("SC"),
        projeto_id: solicitacaoForm.projeto_id || null,
        projeto_nome: solicitacaoForm.projeto_nome || proj?.nome || null,
        solicitante_id: user?.id,
        solicitante_nome: user?.full_name,
        solicitante_email: user?.email,
        status: "Pendente Aprovação",
        prioridade: solicitacaoForm.prioridade,
        origem: solicitacaoForm.origem || "Manual",
        data_necessidade: solicitacaoForm.data_necessidade || null,
        observacoes: solicitacaoForm.observacoes,
        total_itens: itensValidos.length,
      });

      for (const item of itensValidos) {
        await sigo.entities.SolicitacaoCompraItem.create({
          empresa_id: empresaAtiva.id,
          solicitacao_id: novaSol.id,
          descricao: item.descricao,
          quantidade: item.quantidade,
          unidade: item.unidade,
          especificacoes: item.especificacoes || "",
          ultimo_preco: item.ultimo_preco || null,
          // Migration 0028: trigger trg_sync_total_solicitacao usa este campo
          // pra recalcular solicitacao_compra.valor_total_estimado.
          preco_unitario_estimado: item.preco_unitario_estimado || null,
          material_id: item.material_id || null,
          material_codigo: item.material_codigo || item.codigo || "",
        });
      }

      // Aprovação: nao precisamos mais chamar Edge Function aqui. A SC ja nasce
      // com status='Pendente Aprovação' e nivel_aprovacao_atual=1 (default da
      // tabela). A primeira chamada de aprovar_solicitacao_compra() vai
      // identificar o nivel pela faixa de valor_total_estimado (recalculado
      // pelo trigger trg_sync_total_solicitacao da migration 0028) e notificar
      // os aprovadores do nivel 1. Codigo de chamada da Edge function
      // 'iniciarFluxoAprovacao' (que nem existe) removido.

      // Recarregar dados
      await loadData();

      setShowSolicitacaoModal(false);
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro ao criar solicitação");
    } finally {
      setSaving(false);
    }
  };

  const handleAprovarSolicitacao = async (solicitacao) => {
    setSelectedItem(solicitacao);
    setShowAprovacaoModal(true);
  };

  const handleCancelarSolicitacao = async (solicitacao) => {
    if (!confirm("Cancelar esta solicitação?")) return;
    try {
      await sigo.entities.SolicitacaoCompra.update(solicitacao.id, { status: "Cancelada" });
      setSolicitacoes(
        solicitacoes.map((s) => (s.id === solicitacao.id ? { ...s, status: "Cancelada" } : s))
      );
    } catch (e) {
      if (e?.message?.includes("not found")) {
        setSolicitacoes((prev) => prev.filter((s) => s.id !== solicitacao.id));
      } else {
        throw e;
      }
    }
  };

  const handleExcluirCotacao = async (cotacao) => {
    setSelectedItem(cotacao);
    setTipoExclusao("cotacao");
    setShowConfirmacaoExclusao(true);
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const deleteSeq = async (items, deleteFn) => {
    for (const item of items) {
      try {
        await deleteFn(item.id);
      } catch (e) {
        /* ignora not found */
      }
      await sleep(300);
    }
  };

  const confirmarExclusaoCotacao = async (cotacao, excluirTudo, itensSelecionados) => {
    if (excluirTudo) {
      const respostas = await sigo.entities.CotacaoResposta.filter({ cotacao_id: cotacao.id });
      await sleep(300);
      const fornecedoresCot = await sigo.entities.CotacaoFornecedor.filter({
        cotacao_id: cotacao.id,
      });
      await sleep(300);
      const itens = await sigo.entities.CotacaoItem.filter({ cotacao_id: cotacao.id });
      await sleep(300);

      await deleteSeq(respostas, (id) => sigo.entities.CotacaoResposta.delete(id));
      await deleteSeq(fornecedoresCot, (id) => sigo.entities.CotacaoFornecedor.delete(id));
      await deleteSeq(itens, (id) => sigo.entities.CotacaoItem.delete(id));

      try {
        await sigo.entities.Cotacao.delete(cotacao.id);
      } catch (e) {
        /* ignora not found */
      }

      if (cotacao.solicitacao_id) {
        try {
          await sigo.entities.SolicitacaoCompra.update(cotacao.solicitacao_id, {
            status: "Aprovada",
          });
        } catch (e) {
          /* ignora */
        }
      }
    } else {
      const respostasItens = await sigo.entities.CotacaoResposta.filter({
        cotacao_id: cotacao.id,
      });
      await sleep(300);
      const respostasExcluir = respostasItens.filter((r) => itensSelecionados.includes(r.item_id));
      await deleteSeq(respostasExcluir, (id) => sigo.entities.CotacaoResposta.delete(id));
      await deleteSeq(
        itensSelecionados.map((id) => ({ id })),
        (id) => sigo.entities.CotacaoItem.delete(id)
      );
    }
  };

  const handleExcluirSolicitacao = async (solicitacao) => {
    setSelectedItem(solicitacao);
    setTipoExclusao("solicitacao");
    setShowConfirmacaoExclusao(true);
  };

  const confirmarExclusaoSolicitacao = async (solicitacao, excluirTudo, itensSelecionados) => {
    if (excluirTudo) {
      const itens = await sigo.entities.SolicitacaoCompraItem.filter({
        solicitacao_id: solicitacao.id,
      });
      await sleep(300);
      const aprovacoes = await sigo.entities.AprovacaoSolicitacao.filter({
        solicitacao_id: solicitacao.id,
      });
      await sleep(300);
      const cotacoesRelacionadas = await sigo.entities.Cotacao.filter({
        solicitacao_id: solicitacao.id,
      });
      await sleep(300);

      for (const cotacao of cotacoesRelacionadas) {
        const respostas = await sigo.entities.CotacaoResposta.filter({ cotacao_id: cotacao.id });
        await sleep(300);
        const fornecedoresCot = await sigo.entities.CotacaoFornecedor.filter({
          cotacao_id: cotacao.id,
        });
        await sleep(300);
        await deleteSeq(respostas, (id) => sigo.entities.CotacaoResposta.delete(id));
        await deleteSeq(fornecedoresCot, (id) => sigo.entities.CotacaoFornecedor.delete(id));
      }

      await deleteSeq(cotacoesRelacionadas, (id) => sigo.entities.Cotacao.delete(id));
      await deleteSeq(itens, (id) => sigo.entities.SolicitacaoCompraItem.delete(id));
      await deleteSeq(aprovacoes, (id) => sigo.entities.AprovacaoSolicitacao.delete(id));

      try {
        await sigo.entities.SolicitacaoCompra.delete(solicitacao.id);
      } catch (e) {
        /* ignora */
      }
    } else {
      await deleteSeq(
        itensSelecionados.map((id) => ({ id })),
        (id) => sigo.entities.SolicitacaoCompraItem.delete(id)
      );
    }
  };

  const handleAbrirCotacao = async (solicitacao) => {
    const itens = await sigo.entities.SolicitacaoCompraItem.filter({
      solicitacao_id: solicitacao.id,
    });
    setSolicitacaoItens(itens);
    setSelectedItem(solicitacao);
    setShowCotacaoModal(true);
  };

  const criarCotacaoAutomatica = async (solicitacao) => {
    try {
      const itens = await sigo.entities.SolicitacaoCompraItem.filter({
        solicitacao_id: solicitacao.id,
      });

      const cotacao = await sigo.entities.Cotacao.create({
        empresa_id: empresaAtiva.id,
        numero: gerarNumero("COT"),
        solicitacao_id: solicitacao.id,
        solicitacao_numero: solicitacao.numero,
        projeto_id: solicitacao.projeto_id,
        projeto_nome: solicitacao.projeto_nome,
        status: "Aberta",
        total_fornecedores: 0,
      });

      // Criar itens da cotação
      await Promise.all(
        itens.map((item) =>
          sigo.entities.CotacaoItem.create({
            empresa_id: empresaAtiva.id,
            cotacao_id: cotacao.id,
            solicitacao_item_id: item.id,
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade: item.unidade,
            especificacoes: item.observacoes || "",
          })
        )
      );

      return cotacao;
    } catch (error) {
      console.error("Erro ao criar cotação automática:", error);
      throw error;
    }
  };

  const handleAbrirComparacao = (cotacao) => {
    setSelectedItem(cotacao);
    setShowComparacaoModal(true);
  };

  const handleCotacaoAprovada = async () => {
    loadData();
  };

  const handleGerarPedido = async (cotacao) => {
    if (!confirm("Gerar pedido de compra a partir desta cotação?")) return;

    try {
      const fornecedor = await sigo.entities.Fornecedor.filter({
        id: cotacao.fornecedor_vencedor_id,
      });
      const respostas = await sigo.entities.CotacaoResposta.filter({ cotacao_id: cotacao.id });
      const cotacaoFornecedor = await sigo.entities.CotacaoFornecedor.filter({
        cotacao_id: cotacao.id,
        fornecedor_id: cotacao.fornecedor_vencedor_id,
      });
      const respostasFornecedor = respostas.filter(
        (r) => r.cotacao_fornecedor_id === cotacaoFornecedor[0]?.id
      );

      const numeroPedido = gerarNumero("PC");
      const total = respostasFornecedor.reduce(
        (sum, r) => sum + r.quantidade * r.valor_unitario,
        0
      );

      const novoPedido = await sigo.entities.PedidoCompra.create({
        empresa_id: empresaAtiva.id,
        numero: numeroPedido,
        fornecedor_id: cotacao.fornecedor_vencedor_id,
        fornecedor_nome: cotacao.fornecedor_vencedor_nome,
        solicitacao_id: cotacao.solicitacao_id,
        cotacao_id: cotacao.id,
        projeto_id: cotacao.projeto_id,
        projeto_nome: cotacao.projeto_nome,
        status: "Emitido",
        data_emissao: new Date().toISOString().split("T")[0],
        total,
        observacoes: cotacao.observacoes,
      });

      // Criar itens do pedido
      for (const resp of respostasFornecedor) {
        await sigo.entities.PedidoCompraItem.create({
          empresa_id: empresaAtiva.id,
          pedido_id: novoPedido.id,
          descricao: resp.descricao,
          quantidade: resp.quantidade,
          unidade: resp.unidade,
          valor_unitario: resp.valor_unitario,
          valor_total: resp.quantidade * resp.valor_unitario,
        });
      }

      // Atualizar status da cotação
      await sigo.entities.Cotacao.update(cotacao.id, { status: "Pedido Gerado" });

      // Atualizar solicitação
      await sigo.entities.SolicitacaoCompra.update(cotacao.solicitacao_id, {
        status: "Pedido Gerado",
      });

      // Enviar email de aprovação ao fornecedor
      if (fornecedor[0]?.email) {
        await sigo.functions.invoke("enviarEmailSMTP", {
          to: fornecedor[0].email,
          subject: `Pedido de Compra ${numeroPedido} - ${empresaAtiva.nome}`,
          body: `
      Olá ${cotacao.fornecedor_vencedor_nome},

      Seu pedido de compra foi APROVADO e gerado!

      Número do Pedido: ${numeroPedido}
      Valor Total: R$ ${total.toFixed(2)}
      Data de Emissão: ${new Date().toLocaleDateString("pt-BR")}

      Por favor, confirme o recebimento deste pedido.

      Atenciosamente,
      ${empresaAtiva.nome}
          `,
        });
      }

      alert("Pedido de compra gerado e enviado com sucesso!");
      loadData();
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro ao gerar pedido");
    }
  };

  const handleChangeStatusPedido = async (pedido, newStatus) => {
    await sigo.entities.PedidoCompra.update(pedido.id, { status: newStatus });
    setPedidos(pedidos.map((p) => (p.id === pedido.id ? { ...p, status: newStatus } : p)));
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const searchLower = searchTerm.toLowerCase();
  const minhasPendentes = solicitacoes.filter((s) => s.status === "Pendente Aprovação").length;

  // Pedido direto: SC Aprovada + valor dentro do limite configurado na empresa.
  // Limite null = recurso desligado pra essa empresa (sempre exige cotação).
  const limitePedidoDireto =
    empresaAtiva?.compras_pular_cotacao_valor_max != null
      ? Number(empresaAtiva.compras_pular_cotacao_valor_max)
      : null;
  const isElegivelPedidoDireto = (sol) =>
    sol?.status === "Aprovada" &&
    limitePedidoDireto != null &&
    Number(sol?.valor_total_estimado || 0) <= limitePedidoDireto;

  const filterData = (data, searchFields) => {
    const filtered = data.filter((item) => {
      const matchSearch =
        !searchTerm || searchFields.some((f) => item[f]?.toLowerCase?.().includes(searchLower));
      const matchStatus = filterStatus === "all" || item.status === filterStatus;
      return matchSearch && matchStatus;
    });

    // Aplicar ordenação
    return filtered.sort((a, b) => {
      let aVal, bVal;

      if (
        sortConfig.field === "created_date" ||
        sortConfig.field === "data_necessidade" ||
        sortConfig.field === "data_emissao" ||
        sortConfig.field === "data_limite"
      ) {
        aVal = a[sortConfig.field] ? new Date(a[sortConfig.field]).getTime() : 0;
        bVal = b[sortConfig.field] ? new Date(b[sortConfig.field]).getTime() : 0;
      } else if (
        sortConfig.field === "total" ||
        sortConfig.field === "total_itens" ||
        sortConfig.field === "total_fornecedores"
      ) {
        aVal = a[sortConfig.field] || 0;
        bVal = b[sortConfig.field] || 0;
      } else {
        aVal = (a[sortConfig.field] || "").toString().toLowerCase();
        bVal = (b[sortConfig.field] || "").toString().toLowerCase();
      }

      if (sortConfig.direction === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });
  };

  const filteredSolicitacoes = filterData(solicitacoes, [
    "numero",
    "projeto_nome",
    "oportunidade_nome",
  ]);
  const filteredCotacoes = filterData(cotacoes, ["numero", "projeto_nome"]);
  const filteredPedidos = filterData(pedidos, ["numero", "fornecedor_nome"]);

  const toggleSolicitacao = (id) => {
    setSolicitacoesSelecionadas((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleTodasSolicitacoes = () => {
    if (solicitacoesSelecionadas.length === filteredSolicitacoes.length) {
      setSolicitacoesSelecionadas([]);
    } else {
      setSolicitacoesSelecionadas(filteredSolicitacoes.map((s) => s.id));
    }
  };

  const toggleCotacao = (id) => {
    setCotacoesSelecionadas((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleTodasCotacoes = () => {
    if (cotacoesSelecionadas.length === filteredCotacoes.length) {
      setCotacoesSelecionadas([]);
    } else {
      setCotacoesSelecionadas(filteredCotacoes.map((c) => c.id));
    }
  };

  const handleExcluirSelecionados = async (tipo) => {
    const selecionados = tipo === "solicitacao" ? solicitacoesSelecionadas : cotacoesSelecionadas;

    if (selecionados.length === 0) {
      alert("Selecione pelo menos um item para excluir");
      return;
    }

    const mensagem =
      `⚠️ CONFIRMAR EXCLUSÃO EM LOTE\n\n` +
      `Serão excluídos ${selecionados.length} ${tipo === "solicitacao" ? "solicitação(ões)" : "cotação(ões)"}\n\n` +
      `Esta ação NÃO pode ser desfeita!\n\n` +
      `Deseja continuar?`;

    if (!confirm(mensagem)) return;

    const resultados = await Promise.allSettled(
      selecionados.map(async (id) => {
        const item =
          tipo === "solicitacao"
            ? solicitacoes.find((s) => s.id === id)
            : cotacoes.find((c) => c.id === id);

        if (tipo === "solicitacao") {
          await confirmarExclusaoSolicitacao(item, true, []);
        } else {
          await confirmarExclusaoCotacao(item, true, []);
        }
      })
    );

    const sucessos = resultados.filter((r) => r.status === "fulfilled").length;
    const erros = resultados.filter((r) => r.status === "rejected").length;

    if (tipo === "solicitacao") {
      setSolicitacoesSelecionadas([]);
    } else {
      setCotacoesSelecionadas([]);
    }

    alert(
      `✅ Exclusão concluída!\n\n${sucessos} excluído(s) com sucesso\n${erros > 0 ? `${erros} erro(s)` : ""}`
    );
    await loadData();
  };

  if (!empresaAtiva) return null;

  return (
    <div className="space-y-6">
      <ComprasHeader onOpenSolicitacao={handleOpenSolicitacao} />

      <Tabs
        value={activeTab}
        onValueChange={(tab) => {
          setActiveTab(tab);
          if (tab === "solicitacoes") {
            setFilterStatus("Pendente Aprovação");
          } else {
            setFilterStatus("all");
          }
        }}
      >
        <TabsList className="bg-slate-100">
          {(perfil === "Admin" || temPermissao("Compras", "Solicitações")) && (
            <TabsTrigger value="solicitacoes" className="gap-2">
              <FileText className="w-4 h-4" /> Solicitações
              {minhasPendentes > 0 && (
                <Badge className="ml-1 bg-orange-500">{minhasPendentes}</Badge>
              )}
            </TabsTrigger>
          )}
          {(perfil === "Admin" || temPermissao("Compras", "Cotações")) && (
            <TabsTrigger value="cotacoes" className="gap-2">
              <TrendingDown className="w-4 h-4" /> Cotações
            </TabsTrigger>
          )}
          {(perfil === "Admin" || temPermissao("Compras", "Pedidos")) && (
            <TabsTrigger value="pedidos" className="gap-2">
              <ShoppingCart className="w-4 h-4" /> Pedidos
            </TabsTrigger>
          )}
          {(perfil === "Admin" || temPermissao("Compras", "Histórico")) && (
            <TabsTrigger value="historico" className="gap-2">
              <Clock className="w-4 h-4" /> Histórico
            </TabsTrigger>
          )}
        </TabsList>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {activeTab === "solicitacoes" && (
                <>
                  <SelectItem value="Pendente Aprovação">Pendente Aprovação</SelectItem>
                  <SelectItem value="Aprovada">Aprovada</SelectItem>
                  <SelectItem value="Em Cotação">Em Cotação</SelectItem>
                  <SelectItem value="Cotação Aprovada">Cotação Aprovada</SelectItem>
                  <SelectItem value="Pedido Gerado">Pedido Gerado</SelectItem>
                  <SelectItem value="Cancelada">Cancelada</SelectItem>
                </>
              )}
              {activeTab === "cotacoes" && (
                <>
                  <SelectItem value="Aberta">Aberta</SelectItem>
                  <SelectItem value="Enviada aos Fornecedores">Enviada</SelectItem>
                  <SelectItem value="Respostas Recebidas">Respostas Recebidas</SelectItem>
                  <SelectItem value="Aprovada">Aprovada</SelectItem>
                </>
              )}
              {activeTab === "pedidos" && (
                <>
                  <SelectItem value="Emitido">Emitido</SelectItem>
                  <SelectItem value="Enviado">Enviado</SelectItem>
                  <SelectItem value="Confirmado">Confirmado</SelectItem>
                  <SelectItem value="Em Trânsito">Em Trânsito</SelectItem>
                  <SelectItem value="Entregue">Entregue</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
          <SortButton
            sortOptions={[
              { label: "Data de Criação", value: "created_date", defaultDirection: "desc" },
              { label: "Número", value: "numero", defaultDirection: "asc" },
              ...(activeTab === "solicitacoes"
                ? [
                    {
                      label: "Data Necessidade",
                      value: "data_necessidade",
                      defaultDirection: "desc",
                    },
                    { label: "Projeto", value: "projeto_nome", defaultDirection: "asc" },
                  ]
                : []),
              ...(activeTab === "cotacoes"
                ? [
                    { label: "Data Limite", value: "data_limite", defaultDirection: "desc" },
                    {
                      label: "Fornecedores",
                      value: "total_fornecedores",
                      defaultDirection: "desc",
                    },
                  ]
                : []),
              ...(activeTab === "pedidos"
                ? [
                    { label: "Data Emissão", value: "data_emissao", defaultDirection: "desc" },
                    { label: "Fornecedor", value: "fornecedor_nome", defaultDirection: "asc" },
                    { label: "Total", value: "total", defaultDirection: "desc" },
                  ]
                : []),
            ]}
            currentSort={sortConfig}
            onSortChange={setSortConfig}
          />
        </div>

        {/* Solicitações */}
        <TabsContent value="solicitacoes">
          {solicitacoesSelecionadas.length > 0 && (
            <div className="mb-4 flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-sm font-medium text-amber-800">
                {solicitacoesSelecionadas.length} solicitação(ões) selecionada(s)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSolicitacoesSelecionadas([])}>
                  Limpar Seleção
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleExcluirSelecionados("solicitacao")}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir Selecionados
                </Button>
              </div>
            </div>
          )}
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="group">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        filteredSolicitacoes.length > 0 &&
                        solicitacoesSelecionadas.length === filteredSolicitacoes.length
                      }
                      onCheckedChange={toggleTodasSolicitacoes}
                    />
                  </TableHead>
                  <SortableTableHeader
                    field="numero"
                    label="Número"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="projeto_nome"
                    label="Projeto"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="solicitante_nome"
                    label="Solicitante"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="prioridade"
                    label="Prioridade"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="status"
                    label="Status"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="origem"
                    label="Origem"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="created_date"
                    label="Data"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <TableHead className="w-32">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSolicitacoes.map((sol) => (
                  <TableRow
                    key={sol.id}
                    className={solicitacoesSelecionadas.includes(sol.id) ? "bg-amber-50" : ""}
                  >
                    <TableCell>
                      <Checkbox
                        checked={solicitacoesSelecionadas.includes(sol.id)}
                        onCheckedChange={() => toggleSolicitacao(sol.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{sol.numero}</TableCell>
                    <TableCell>{sol.projeto_nome || sol.oportunidade_nome || "-"}</TableCell>
                    <TableCell className="text-sm">{sol.solicitante_nome}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          sol.prioridade === "Urgente"
                            ? "border-red-500 text-red-600"
                            : sol.prioridade === "Alta"
                              ? "border-orange-500 text-orange-600"
                              : sol.prioridade === "Normal"
                                ? "border-blue-500 text-blue-600"
                                : "border-slate-400 text-slate-600"
                        }
                      >
                        {sol.prioridade}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge className={statusColors[sol.status]}>{sol.status}</Badge>
                        {isElegivelPedidoDireto(sol) && (
                          <Badge
                            variant="outline"
                            className="border-emerald-500 text-emerald-700 bg-emerald-50 text-[10px]"
                            title="Valor estimado dentro do limite configurado pra pular cotação"
                          >
                            <Rocket className="w-3 h-3 mr-1" /> Elegível pedido direto
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          sol.origem === "Orcamento"
                            ? "border-purple-400 text-purple-600"
                            : sol.origem === "Estoque"
                              ? "border-orange-400 text-orange-600"
                              : "border-slate-400 text-slate-500"
                        }
                      >
                        {sol.origem === "Orcamento"
                          ? "Orçamento"
                          : sol.origem === "Estoque"
                            ? "Estoque"
                            : "Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(sol.created_date).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        {isElegivelPedidoDireto(sol) &&
                          temPermissao("Compras", "Pedidos", "criar") && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedItem(sol);
                                setShowPedidoDiretoModal(true);
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 h-8 px-2"
                              title="Gerar pedido direto sem passar por cotação"
                            >
                              <Rocket className="w-3.5 h-3.5 mr-1" /> Pedido Direto
                            </Button>
                          )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedItem(sol);
                                setShowChatSolicitacao(true);
                              }}
                              className="text-purple-600"
                            >
                              <MessageSquare className="w-4 h-4 mr-2" /> Chat da Solicitação
                            </DropdownMenuItem>
                            {[
                              "Pendente Aprovação",
                              "Aprovada",
                              "Em Cotação",
                              "Cotação Aprovada",
                              "Pedido Gerado",
                            ].includes(sol.status) && (
                              <DropdownMenuItem
                                onClick={() => handleAprovarSolicitacao(sol)}
                                className="text-blue-600"
                              >
                                <Eye className="w-4 h-4 mr-2" /> Ver Fluxo de Aprovação
                              </DropdownMenuItem>
                            )}
                            {isElegivelPedidoDireto(sol) &&
                              temPermissao("Compras", "Pedidos", "criar") && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedItem(sol);
                                    setShowPedidoDiretoModal(true);
                                  }}
                                  className="text-emerald-600"
                                >
                                  <Rocket className="w-4 h-4 mr-2" /> Gerar Pedido Direto
                                </DropdownMenuItem>
                              )}
                            {["Pendente Aprovação", "Aprovada"].includes(sol.status) &&
                              temPermissao("Compras", "Solicitações", "cancelar") && (
                                <DropdownMenuItem
                                  onClick={() => handleCancelarSolicitacao(sol)}
                                  className="text-orange-600"
                                >
                                  <X className="w-4 h-4 mr-2" /> Cancelar
                                </DropdownMenuItem>
                              )}
                            {temPermissao("Compras", "Solicitações", "excluir") && (
                              <DropdownMenuItem
                                onClick={() => handleExcluirSolicitacao(sol)}
                                className="text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Excluir
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredSolicitacoes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                      Nenhuma solicitação encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Cotações */}
        <TabsContent value="cotacoes">
          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowAdicionarItensCotacao(true)}>
              <Plus className="w-4 h-4 mr-2" /> Adicionar Itens em Cotação
            </Button>
          </div>
          {cotacoesSelecionadas.length > 0 && (
            <div className="mb-4 flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-sm font-medium text-amber-800">
                {cotacoesSelecionadas.length} cotação(ões) selecionada(s)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCotacoesSelecionadas([])}>
                  Limpar Seleção
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleExcluirSelecionados("cotacao")}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir Selecionados
                </Button>
              </div>
            </div>
          )}
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="group">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        filteredCotacoes.length > 0 &&
                        cotacoesSelecionadas.length === filteredCotacoes.length
                      }
                      onCheckedChange={toggleTodasCotacoes}
                    />
                  </TableHead>
                  <SortableTableHeader
                    field="numero"
                    label="Número"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="solicitacao_numero"
                    label="Solicitação"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="projeto_nome"
                    label="Projeto"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="total_fornecedores"
                    label="Fornecedores"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="status"
                    label="Status"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="data_limite"
                    label="Data Limite"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <TableHead className="w-32">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCotacoes.map((cot) => (
                  <TableRow
                    key={cot.id}
                    className={cotacoesSelecionadas.includes(cot.id) ? "bg-amber-50" : ""}
                  >
                    <TableCell>
                      <Checkbox
                        checked={cotacoesSelecionadas.includes(cot.id)}
                        onCheckedChange={() => toggleCotacao(cot.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{cot.numero}</TableCell>
                    <TableCell className="text-sm">{cot.solicitacao_numero}</TableCell>
                    <TableCell className="text-sm">{cot.projeto_nome || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{cot.total_fornecedores} fornecedores</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[cot.status]}>{cot.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {cot.data_limite
                        ? new Date(cot.data_limite).toLocaleDateString("pt-BR")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedItem(cot);
                              setShowLinksModal(true);
                            }}
                            className="text-blue-600"
                          >
                            <Eye className="w-4 h-4 mr-2" /> Painel de Status
                          </DropdownMenuItem>
                          {["Aberta", "Enviada aos Fornecedores", "Aguardando Respostas"].includes(
                            cot.status
                          ) &&
                            temPermissao("Compras", "Cotações", "enviar") && (
                              <>
                                <DropdownMenuItem
                                  onClick={async () => {
                                    const sol = solicitacoes.find(
                                      (s) => s.id === cot.solicitacao_id
                                    );
                                    if (sol) {
                                      setSolicitacaoItens(
                                        await sigo.entities.SolicitacaoCompraItem.filter({
                                          solicitacao_id: sol.id,
                                        })
                                      );
                                      setSelectedItem(sol);
                                      setShowCotacaoModal(true);
                                    }
                                  }}
                                  className="text-blue-600"
                                >
                                  <Send className="w-4 h-4 mr-2" /> Enviar aos Fornecedores
                                </DropdownMenuItem>
                                {temPermissao("Compras", "Cotações", "editar") && (
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      const sol = solicitacoes.find(
                                        (s) => s.id === cot.solicitacao_id
                                      );
                                      if (sol) {
                                        setSolicitacaoItens(
                                          await sigo.entities.SolicitacaoCompraItem.filter({
                                            solicitacao_id: sol.id,
                                          })
                                        );
                                        setSelectedItem(sol);
                                        setShowCotacaoModal(true);
                                      }
                                    }}
                                  >
                                    <Edit className="w-4 h-4 mr-2" /> Editar Cotação
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                          <DropdownMenuItem onClick={() => handleAbrirComparacao(cot)}>
                            <Award className="w-4 h-4 mr-2" /> Ver Comparação
                          </DropdownMenuItem>
                          {cot.status === "Aprovada" &&
                            !cot.pedido_gerado &&
                            temPermissao("Compras", "Pedidos", "criar") && (
                              <DropdownMenuItem
                                onClick={() => handleGerarPedido(cot)}
                                className="text-green-600"
                              >
                                <ShoppingCart className="w-4 h-4 mr-2" /> Gerar Pedido
                              </DropdownMenuItem>
                            )}
                          {temPermissao("Compras", "Cotações", "excluir") && (
                            <DropdownMenuItem
                              onClick={() => handleExcluirCotacao(cot)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Excluir
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredCotacoes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                      Nenhuma cotação encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Pedidos */}
        <TabsContent value="pedidos">
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="group">
                  <SortableTableHeader
                    field="numero"
                    label="Número"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="fornecedor_nome"
                    label="Fornecedor"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="projeto_nome"
                    label="Projeto"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="status"
                    label="Status"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="data_emissao"
                    label="Emissão"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="total"
                    label="Total"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                    align="right"
                  />
                  <TableHead className="w-32">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPedidos.map((ped) => (
                  <TableRow key={ped.id}>
                    <TableCell className="font-medium">{ped.numero}</TableCell>
                    <TableCell>{ped.fornecedor_nome}</TableCell>
                    <TableCell className="text-sm">{ped.projeto_nome || "-"}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[ped.status]}>{ped.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {ped.data_emissao
                        ? new Date(ped.data_emissao).toLocaleDateString("pt-BR")
                        : "-"}
                    </TableCell>
                    <TableCell className="font-medium text-green-600">
                      {formatCurrency(ped.total)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedItem(ped);
                              setShowChatPedido(true);
                            }}
                            className="text-purple-600"
                          >
                            <MessageSquare className="w-4 h-4 mr-2" /> Chat do Pedido
                          </DropdownMenuItem>
                          {!["Entregue", "Cancelado"].includes(ped.status) && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedItem(ped);
                                setShowRecebimentoModal(true);
                              }}
                              className="text-emerald-600"
                            >
                              <PackageCheck className="w-4 h-4 mr-2" /> Conferir Recebimento
                            </DropdownMenuItem>
                          )}
                          {ped.status === "Emitido" && (
                            <DropdownMenuItem
                              onClick={() => handleChangeStatusPedido(ped, "Enviado")}
                            >
                              <Send className="w-4 h-4 mr-2" /> Marcar como Enviado
                            </DropdownMenuItem>
                          )}
                          {ped.status === "Enviado" && (
                            <DropdownMenuItem
                              onClick={() => handleChangeStatusPedido(ped, "Confirmado")}
                            >
                              <Check className="w-4 h-4 mr-2" /> Marcar como Confirmado
                            </DropdownMenuItem>
                          )}
                          {["Confirmado", "Em Trânsito"].includes(ped.status) && (
                            <DropdownMenuItem
                              onClick={() => handleChangeStatusPedido(ped, "Entregue")}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar como Entregue
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPedidos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      Nenhum pedido encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        {/* Histórico */}
        <TabsContent value="historico">
          <HistoricoTab empresaAtiva={empresaAtiva} projetos={projetos} />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <SolicitacaoModal
        open={showSolicitacaoModal}
        onOpenChange={setShowSolicitacaoModal}
        form={solicitacaoForm}
        setForm={setSolicitacaoForm}
        onSave={handleSaveSolicitacao}
        saving={saving}
        projetos={projetos}
        empresaAtiva={empresaAtiva}
      />

      {selectedItem && showCotacaoModal && (
        <CotacaoModal
          open={showCotacaoModal}
          onOpenChange={setShowCotacaoModal}
          solicitacao={selectedItem}
          itens={solicitacaoItens}
          fornecedores={fornecedores}
          empresaAtiva={empresaAtiva}
          onSave={() => {
            setShowCotacaoModal(false);
            loadData();
          }}
        />
      )}

      {selectedItem && showComparacaoModal && (
        <ComparacaoPrecos
          open={showComparacaoModal}
          onOpenChange={setShowComparacaoModal}
          cotacao={selectedItem}
          empresaAtiva={empresaAtiva}
          onAprovar={handleCotacaoAprovada}
          onSave={loadData}
        />
      )}

      {selectedItem && showLinksModal && (
        <LinksModal
          open={showLinksModal}
          onOpenChange={setShowLinksModal}
          cotacao={selectedItem}
          empresaAtiva={empresaAtiva}
          onDelete={() => {
            setShowLinksModal(false);
            loadData();
          }}
        />
      )}

      {selectedItem && showAprovacaoModal && (
        <AprovacaoModal
          open={showAprovacaoModal}
          onOpenChange={setShowAprovacaoModal}
          solicitacao={selectedItem}
          empresaAtiva={empresaAtiva}
          user={user}
          onApproved={loadData}
        />
      )}

      {selectedItem && showPedidoDiretoModal && (
        <PedidoDiretoModal
          open={showPedidoDiretoModal}
          onOpenChange={setShowPedidoDiretoModal}
          solicitacao={selectedItem}
          fornecedores={fornecedores}
          user={user}
          onSuccess={async () => {
            await loadData();
            setActiveTab("pedidos");
            setFilterStatus("all");
          }}
        />
      )}

      {selectedItem && showRecebimentoModal && (
        <ConferirRecebimentoModal
          open={showRecebimentoModal}
          onOpenChange={setShowRecebimentoModal}
          pedido={selectedItem}
          user={user}
          onSuccess={loadData}
        />
      )}

      {selectedItem && showChatSolicitacao && (
        <Sheet open={showChatSolicitacao} onOpenChange={setShowChatSolicitacao}>
          <SheetContent className="h-full overflow-y-auto p-0 flex flex-col">
            <SheetHeader>
              <SheetTitle>Chat - {selectedItem.numero}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <ChatContextual
                tipo="Solicitacao"
                contextoId={selectedItem.id}
                contextoNome={selectedItem.numero}
                empresaAtiva={empresaAtiva}
                user={user}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {selectedItem && showChatPedido && (
        <Sheet open={showChatPedido} onOpenChange={setShowChatPedido}>
          <SheetContent className="h-full overflow-y-auto p-0 flex flex-col">
            <SheetHeader>
              <SheetTitle>Chat - {selectedItem.numero}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <ChatContextual
                tipo="Tarefa"
                contextoId={selectedItem.id}
                contextoNome={selectedItem.numero}
                empresaAtiva={empresaAtiva}
                user={user}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      <AdicionarItensCotacaoModal
        open={showAdicionarItensCotacao}
        onOpenChange={setShowAdicionarItensCotacao}
        empresaAtiva={empresaAtiva}
        onSave={() => {
          setShowAdicionarItensCotacao(false);
          loadData();
        }}
      />

      {showConfirmacaoExclusao && selectedItem && (
        <ConfirmacaoExclusaoModal
          open={showConfirmacaoExclusao}
          onOpenChange={setShowConfirmacaoExclusao}
          tipo={tipoExclusao}
          registro={selectedItem}
          onConfirm={
            tipoExclusao === "solicitacao" ? confirmarExclusaoSolicitacao : confirmarExclusaoCotacao
          }
        />
      )}
    </div>
  );
}
