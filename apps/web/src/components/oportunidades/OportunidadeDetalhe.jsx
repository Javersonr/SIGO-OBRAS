import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { safeUrl } from "@/lib/safe-url";
import { analisarAtende } from "@/lib/edital-ia";
import { subtotaisEtapas, totalLinhaLegado } from "@/lib/orcamento-desconto";
import { rotuloItem } from "@/lib/orcamento-registros";
import { useEmpresa } from "@/Layout";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Settings,
  Edit,
  Eye,
  Copy,
  FilePlus,
  Trash2,
  X,
  Target,
  Calendar,
  User,
  FileText,
  Plus,
  Upload,
  FileSpreadsheet,
  Link2,
  ExternalLink,
  Check,
  Building2,
  Sparkles,
  Bell,
  Folder,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ResponsaveisSelect from "../shared/ResponsaveisSelect";
import PermissionGate, { usePermission } from "../PermissionGate";
import ChatContextual from "../chat/ChatContextual";
import DiarioObraTab from "../projetos/DiarioObraTab";
import VisualizadorPDF from "./VisualizadorPDF";
import PropostasOportunidade from "./PropostasOportunidade";
import OrcamentoLicitacaoBarra from "./OrcamentoLicitacaoBarra";
import AnexoViewer from "@/components/shared/AnexoViewer";
import ImgStorage from "@/components/ImgStorage";
import LerEditalSheet from "@/components/oportunidades/edital/LerEditalSheet";
import EditalResumoCard from "./EditalResumoCard";
import ArquivosPastas from "./ArquivosPastas";
import {
  PASTA_OUTROS,
  lerPastasExtras,
  listarPastas,
  mesmaPasta,
  pastaDoArquivo,
  pastaParaGravar,
} from "@/lib/pastas-arquivo";
import DescricaoRica from "./DescricaoRica";
import { preservarAtende } from "./oportunidade-form";

// "AAAA-MM-DD" → "DD/MM/AAAA" por split (new Date() cai 1 dia no fuso BR)
const dataBR = (iso) => {
  const [a, m, d] = String(iso || "")
    .slice(0, 10)
    .split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
};
const dataHoraBR = (data, hora) => (data ? dataBR(data) + (hora ? ` às ${hora}` : "") : "");

const FORMAS_LICITACAO = { eletronica: "Eletrônica", presencial: "Presencial" };

// Categoria do arquivo marcada na leitura do edital
const CATEGORIAS_ARQUIVO = {
  edital: "Edital",
  termo_referencia: "TR",
  anexo_edital: "Anexo do edital",
  errata: "Errata",
};

const ehPdfArquivo = (a) =>
  !!a && (/pdf/i.test(a.tipo || "") || /\.pdf$/i.test(String(a.nome || "")));

export default function OportunidadeDetalhe({
  open,
  onOpenChange,
  selectedOp,
  setSelectedOp,
  statusList,
  usuariosEmpresa,
  empresaAtiva,
  user,
  perfil,
  temPermissao,
  podeVerValores,
  atualizacoes,
  orcamentoItens,
  setOrcamentoItens,
  cronogramaEtapas,
  arquivos,
  materiais,
  novaNota,
  setNovaNota,
  itensSelecionados,
  setItensSelecionados,
  filtroTipoOrcamento,
  setFiltroTipoOrcamento,
  updateTimeoutRef,
  onAddNota,
  onDeleteArquivo,
  onUploadFile,
  onLimparOrcamento,
  onDeleteOrcamentoItem,
  onDeleteSelecionados,
  onNovoOrcamentoSelect,
  onOpenModal,
  onDuplicar, // opcional: abre a cópia como CRIAÇÃO (sem → item escondido)
  onAnaliseGravada, // opcional: (id, edital_analise) quando o "Atende?" grava
  onDelete,
  onShowStatusConfig,
  onShowSalvarTemplate,
  onShowAplicarTemplate,
  onShowRelatoriosOrcamento,
  onShowClienteView,
  setOportunidades,
  uploadingFile,
  onReloadArquivos,
}) {
  const [showPreviewArquivo, setShowPreviewArquivo] = useState(false);
  const [arquivoPreview, setArquivoPreview] = useState(null);
  const [showAddLink, setShowAddLink] = useState(false);
  const [showTransferirEmpresa, setShowTransferirEmpresa] = useState(false);
  const [empresasDisponiveis, setEmpresasDisponiveis] = useState([]);
  const [empresaSelecionada, setEmpresaSelecionada] = useState("");
  const [transferindo, setTransferindo] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNome, setLinkNome] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingValues, setEditingValues] = useState({});
  const [itemSearchTerm, setItemSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Âncora do autocomplete de material. O dropdown é portalado pro <body> com
  // position:fixed (em vez de absolute dentro do <td>), pra não ser RECORTADO
  // pelos containers do grid que têm overflow-auto/overflow-x-auto — z-index não
  // vence overflow. Reposiciona em scroll/resize enquanto está aberto.
  const itemDescRef = useRef(null);
  const [, setSuggestReposition] = useState(0);
  useEffect(() => {
    if (!showSuggestions) return;
    const onMove = () => setSuggestReposition((n) => n + 1);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [showSuggestions]);
  const [activeTab, setActiveTab] = useState("geral");
  const [visitedTabs, setVisitedTabs] = useState(new Set(["geral"]));
  const fileInputArquivosRef = useRef(null);
  // Pasta atual da aba Arquivos: destino do upload/link e primeira aberta. Guarda de qual
  // oportunidade ela é: ao abrir outra, volta para Outros já no primeiro render (sem efeito).
  const [destinoPasta, setDestinoPasta] = useState({ opId: null, pasta: PASTA_OUTROS });
  const pastaAtual = destinoPasta.opId === selectedOp?.id ? destinoPasta.pasta : PASTA_OUTROS;
  const setPastaAtual = (pasta) => setDestinoPasta({ opId: selectedOp?.id, pasta });
  const pastasExtras = lerPastasExtras(selectedOp?.pastas_arquivos);
  const pastasArquivos = listarPastas(pastasExtras, arquivos || []);

  const gravarPastasExtras = async (novas) => {
    await sigo.entities.Oportunidade.update(selectedOp.id, { pastas_arquivos: novas });
    const aplicar = (o) => (o?.id === selectedOp.id ? { ...o, pastas_arquivos: novas } : o);
    setSelectedOp?.((prev) => aplicar(prev));
    setOportunidades?.((prev) => (Array.isArray(prev) ? prev.map(aplicar) : prev));
  };

  const handleCriarPasta = async (nome) => {
    try {
      await gravarPastasExtras([...pastasExtras, nome]);
      setPastaAtual(nome);
      toast.success(`Pasta "${nome}" criada`);
      return true;
    } catch (e) {
      toast.error(`Não foi possível criar a pasta: ${e?.message || "erro"}`);
      return false;
    }
  };

  const handleApagarPasta = async (nome) => {
    if (!confirm(`Apagar a pasta "${nome}"?`)) return;
    try {
      await gravarPastasExtras(pastasExtras.filter((p) => !mesmaPasta(p, nome)));
      if (mesmaPasta(pastaAtual, nome)) setPastaAtual(PASTA_OUTROS);
    } catch (e) {
      toast.error(`Não foi possível apagar a pasta: ${e?.message || "erro"}`);
    }
  };

  const handleMoverArquivo = async (arq, pasta) => {
    try {
      // "Outros" grava null (segue a regra da categoria); só um edital movido para Outros grava o nome
      await sigo.entities.ArquivoOportunidade.update(arq.id, {
        pasta: pastaParaGravar(pasta, arq.categoria),
      });
      toast.success(`"${arq.nome}" movido para ${pasta}`);
      onReloadArquivos();
    } catch (e) {
      toast.error(`Não foi possível mover: ${e?.message || "erro"}`);
    }
  };
  const [perdidoOpen, setPerdidoOpen] = useState(false);
  const [motivoPerda, setMotivoPerda] = useState("");
  const [salvandoPerda, setSalvandoPerda] = useState(false);
  const [showLerEdital, setShowLerEdital] = useState(false);
  // Diálogo "Importar planilha" do orçamento: o estado fica aqui porque a barra
  // do orçamento E o card "Importar" do estado vazio abrem o mesmo diálogo.
  const [importarAberto, setImportarAberto] = useState(false);
  // "Aplicar" desconto gravando (a barra avisa): a tabela fica só leitura até terminar, senão uma
  // edição no meio deixa preço e total da linha incoerentes. O ref serve ao handleUpdateItem, que
  // também roda de callbacks atrasados (o blur da descrição) e não pode ler o estado do render.
  const [aplicandoDesconto, setAplicandoDesconto] = useState(false);
  const aplicandoDescontoRef = useRef(false);
  const mudarAplicandoDesconto = (aplicando) => {
    aplicandoDescontoRef.current = aplicando;
    setAplicandoDesconto(aplicando);
  };
  // IA do edital (ler/reanalisar = análise paga que grava na oportunidade): usa a
  // permissão REAL da sessão — o CalendarioConsolidado passa
  // temPermissao={() => true} e perfil="Admin" por props.
  const sessao = useEmpresa();
  const podeUsarIaEdital =
    sessao.perfil === "Admin" || sessao.temPermissao("Oportunidades", "Lista", "editar");
  // Orçamento (barra da licitação e card "Importar"): permissão REAL da sessão,
  // aceitando "Orçamento" (catálogo) e "Orcamento" (grafia antiga do trigger).
  const { can, isAdmin } = usePermission();
  const podeEditarOrcamento =
    isAdmin ||
    can("Oportunidades", "Orçamento", "editar") ||
    can("Oportunidades", "Orcamento", "editar");
  // detalhe fechado por fora (excluir/arquivar): não reabre a leitura depois
  useEffect(() => {
    if (!open) {
      setShowLerEdital(false);
      setImportarAberto(false);
    }
  }, [open]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => new Set([...prev, tab]));
  };

  // Card "Importar" do estado vazio: abre o diálogo da planilha (modelo SIGO)
  // da barra do orçamento, no lugar do seletor de CSV antigo.
  const abrirImportacaoPlanilha = () => {
    if (!podeEditarOrcamento) {
      toast.error("Sem permissão para editar o orçamento");
      return;
    }
    setImportarAberto(true);
  };

  // Marca a oportunidade como Perdida: move para o status tipo "perdido",
  // grava o motivo (win-rate) e arquiva (sai do funil ativo).
  const handleMarcarPerdido = async () => {
    const statusPerdido = (statusList || []).find((s) => s.tipo === "perdido");
    const patch = {
      status_id: statusPerdido?.id ?? selectedOp.status_id,
      status_nome: statusPerdido?.nome ?? "Perdido",
      motivo_perda: motivoPerda.trim() || null,
      arquivado: true,
    };
    setSalvandoPerda(true);
    try {
      await sigo.entities.Oportunidade.update(selectedOp.id, patch);
      setSelectedOp((prev) => ({ ...prev, ...patch }));
      setOportunidades((prev) =>
        prev.map((o) => (o.id === selectedOp.id ? { ...o, ...patch } : o))
      );
      setPerdidoOpen(false);
      setMotivoPerda("");
      handleOpenChange(false);
    } catch (e) {
      alert("Erro ao marcar como perdido: " + (e?.message || e));
    } finally {
      setSalvandoPerda(false);
    }
  };

  // Relê a oportunidade (e os arquivos) depois da leitura do edital.
  const recarregarOportunidade = async () => {
    const id = selectedOp?.id;
    if (!id) return;
    try {
      const op = await sigo.entities.Oportunidade.get(id);
      if (!op) return;
      // o "Atende?" pode ter gravado (onAnaliseGravada) depois que esta leitura
      // saiu: não troca a análise conferida pela mesma sem o resultado
      const mesclar = (atual) => ({
        ...atual,
        ...op,
        edital_analise: preservarAtende(atual.edital_analise, op.edital_analise),
      });
      setSelectedOp((prev) => (prev?.id === id ? mesclar(prev) : prev));
      setOportunidades((prev) => prev.map((o) => (o.id === id ? mesclar(o) : o)));
      onReloadArquivos?.();
    } catch (e) {
      console.error("Erro ao recarregar a oportunidade:", e);
    }
  };

  // O "Atende?" da leitura do edital gravou (mesmo com o Sheet já fechado):
  // atualiza o detalhe e a lista sem nova chamada paga.
  const handleAnaliseGravada = (id, analise) => {
    if (!id || !analise) return;
    setSelectedOp((prev) => (prev?.id === id ? { ...prev, edital_analise: analise } : prev));
    setOportunidades((prev) =>
      prev.map((o) => (o.id === id ? { ...o, edital_analise: analise } : o))
    );
    onAnaliseGravada?.(id, analise);
  };

  // "Reanalisar" do card Edital (IA): confere o edital já lido com o acervo atual.
  const handleReanalisarAtende = async () => {
    const id = selectedOp?.id;
    const analise = safeParseJSON(selectedOp?.edital_analise, null);
    if (!id || !analise?.extraido) {
      toast.error("Leia o edital antes de conferir o acervo");
      return;
    }
    try {
      const resultado = await analisarAtende(analise.extraido);
      const nova = { ...analise, atende: resultado };
      await sigo.entities.Oportunidade.update(id, { edital_analise: nova });
      setSelectedOp((prev) => (prev?.id === id ? { ...prev, edital_analise: nova } : prev));
      setOportunidades((prev) =>
        prev.map((o) => (o.id === id ? { ...o, edital_analise: nova } : o))
      );
      toast.success("Acervo conferido");
    } catch (e) {
      console.error("Erro ao conferir o acervo:", e);
      toast.error(`Erro ao conferir o acervo: ${e?.message || "erro desconhecido"}`);
    }
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

  const formatModalidade = (modalidade) => {
    if (!modalidade) return "";
    const formatos = {
      concorrencia: "CONCORR\u00caNCIA",
      tomada_precos: "TOMADA DE PRE\u00c7OS",
      convite: "CONVITE",
      pregao: "PREG\u00c3O",
      dispensa: "DISPENSA",
      inexigibilidade: "INEXIGIBILIDADE",
    };
    return formatos[modalidade] || modalidade.toUpperCase();
  };

  const handleUpdateItem = (itemId, field, value) => {
    if (aplicandoDescontoRef.current) {
      toast.info("Aguarde o desconto terminar de aplicar para editar a tabela");
      return;
    }
    const item = orcamentoItens.find((i) => i.id === itemId);
    if (!item) return;
    const numFields = ["quantidade", "valor_unitario", "bdi", "imposto"];
    const ehNumerico = numFields.includes(field);
    // Campo numérico entra no estado e no banco como número (texto vazio ou inválido
    // vira 0, como no OrcamentoTab): um "1e3" digitado à mão não fica como texto,
    // que a conta estrita do total leria como vazio e gravaria total 0.
    const valorFinal = ehNumerico ? parseFloat(value) || 0 : value;
    const updatedData = { ...item, [field]: valorFinal };
    if (ehNumerico) {
      const qtd = field === "quantidade" ? valorFinal : item.quantidade || 0;
      const vlrUnit = field === "valor_unitario" ? valorFinal : item.valor_unitario || 0;
      const bdi = field === "bdi" ? valorFinal : item.bdi || 0;
      const imp = field === "imposto" ? valorFinal : item.imposto || 0;
      updatedData.valor_total = totalLinhaLegado({
        quantidade: qtd,
        valor_unitario: vlrUnit,
        bdi,
        imposto: imp,
      });
    }
    setOrcamentoItens((prev) => prev.map((i) => (i.id === itemId ? updatedData : i)));
    const key = `${itemId}-${field}`;
    clearTimeout(updateTimeoutRef.current[key]);
    const timer = setTimeout(async () => {
      try {
        await sigo.entities.OrcamentoItem.update(itemId, updatedData);
      } catch {}
      // A chave fica no mapa até a gravação terminar (é o que o Aplicar enxerga como pendente).
      // Uma reedição durante a gravação em voo põe um timer novo na mesma chave: não apague o dele.
      if (updateTimeoutRef.current[key] === timer) delete updateTimeoutRef.current[key];
    }, 1500);
    updateTimeoutRef.current[key] = timer;
  };

  const handleSalvarLink = async () => {
    if (!linkUrl.trim()) return;
    const isOneDrive = linkUrl.includes("onedrive") || linkUrl.includes("sharepoint");
    const isGDrive = linkUrl.includes("drive.google") || linkUrl.includes("docs.google");
    const nome =
      linkNome.trim() ||
      (isOneDrive ? "Link OneDrive" : isGDrive ? "Link Google Drive" : "Link externo");
    try {
      await sigo.entities.ArquivoOportunidade.create({
        empresa_id: empresaAtiva.id,
        oportunidade_id: selectedOp.id,
        nome,
        url: linkUrl.trim(),
        tipo: "link",
        // "Outros" grava null: um edital lido depois pela IA cai em "Edital" pela regra da categoria
        pasta: pastaParaGravar(pastaAtual),
        usuario_nome: user?.full_name || "",
      });
      setLinkUrl("");
      setLinkNome("");
      setShowAddLink(false);
      onReloadArquivos();
    } catch (e) {
      toast.error(`Não foi possível salvar o link: ${e?.message || "erro"}`);
    }
  };

  // Reset tab quando abre nova oportunidade
  const handleAbrirTransferencia = async () => {
    try {
      const vinculos = await sigo.entities.UsuarioEmpresa.filter({
        usuario_email: user.email,
        ativo: true,
      });
      const ids = vinculos.map((v) => v.empresa_id).filter((id) => id !== empresaAtiva.id);
      if (ids.length === 0) {
        alert("Você não tem acesso a outras empresas.");
        return;
      }
      const resultados = await Promise.all(
        ids.map((id) => sigo.entities.Empresa.filter({ id, ativo: true }))
      );
      setEmpresasDisponiveis(resultados.flat());
      setEmpresaSelecionada("");
      setShowTransferirEmpresa(true);
    } catch (e) {
      console.error("Erro ao buscar empresas:", e);
    }
  };

  const handleTransferir = async () => {
    if (!empresaSelecionada) return;
    setTransferindo(true);
    try {
      await sigo.entities.Oportunidade.update(selectedOp.id, { empresa_id: empresaSelecionada });
      setOportunidades((prev) => prev.filter((o) => o.id !== selectedOp.id));
      setShowTransferirEmpresa(false);
      handleOpenChange(false);
    } catch (e) {
      console.error("Erro ao transferir:", e);
    } finally {
      setTransferindo(false);
    }
  };

  const handleOpenChange = (val) => {
    if (!val) {
      setActiveTab("geral");
      setVisitedTabs(new Set(["geral"]));
      setShowPreviewArquivo(false);
      setArquivoPreview(null);
      setShowLerEdital(false);
    }
    onOpenChange(val);
  };

  if (!open) return null;

  const currentStatus = selectedOp ? statusList.find((s) => s.id === selectedOp.status_id) : null;

  // Seção "Dados da Licitação": só o que estiver preenchido
  const op = selectedOp || {};
  const licitacaoItens = [
    { rotulo: "Órgão", valor: op.orgao, largo: true },
    { rotulo: "Modalidade", valor: formatModalidade(op.licitacao_modalidade), destaque: true },
    { rotulo: "Nº do edital", valor: op.licitacao_numero },
    { rotulo: "Processo", valor: op.licitacao_processo },
    { rotulo: "Forma", valor: FORMAS_LICITACAO[op.licitacao_forma] || op.licitacao_forma },
    { rotulo: "Critério de julgamento", valor: op.licitacao_criterio_julgamento },
    { rotulo: "Sessão", valor: dataHoraBR(op.licitacao_data, op.licitacao_horario) },
    {
      rotulo: "Proposta até",
      valor: dataHoraBR(op.licitacao_data_proposta, op.licitacao_horario_proposta),
    },
    {
      rotulo: "Impugnação até",
      valor: dataHoraBR(op.licitacao_data_impugnacao, op.licitacao_horario_impugnacao),
    },
    {
      rotulo: "Esclarecimento até",
      valor: dataHoraBR(op.licitacao_data_esclarecimento, op.licitacao_horario_esclarecimento),
    },
    { rotulo: "Prazo de execução", valor: op.licitacao_prazo_execucao },
    { rotulo: "Garantia de proposta", valor: op.licitacao_garantia_proposta ? "Exigida" : null },
    {
      rotulo: "Exclusiva ME/EPP",
      valor:
        op.licitacao_exclusiva_me_epp === true
          ? "Sim"
          : op.licitacao_exclusiva_me_epp === false
            ? "Não"
            : null,
    },
    { rotulo: "Visita técnica", valor: op.licitacao_visita_tecnica, largo: true },
  ].filter((i) => i.valor);
  const portalLicitacao = String(op.licitacao_portal || "").trim();
  const diasAlerta =
    Array.isArray(op.alerta_antecedencia_dias) && op.alerta_antecedencia_dias.length
      ? op.alerta_antecedencia_dias
      : [3, 1, 0];
  const textoDiasAlerta =
    diasAlerta.length > 1
      ? `${diasAlerta.slice(0, -1).join(", ")} e ${diasAlerta[diasAlerta.length - 1]}`
      : String(diasAlerta[0]);

  // Aba Orçamento: com orçamento importado (itens com `numero`), o filtro de tipo
  // some e vale "Todos" (item importado tem tipo nulo), e cada etapa mostra o
  // subtotal dos seus itens.
  const orcamentoNumerado = (orcamentoItens || []).some((i) => i.numero);
  const filtroTipoEfetivo = orcamentoNumerado ? "all" : filtroTipoOrcamento;
  const subtotalPorEtapa = orcamentoNumerado ? subtotaisEtapas(orcamentoItens) : {};

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          {!selectedOp ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-500">Carregando...</p>
            </div>
          ) : (
            <>
              <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0">
                <SheetHeader>
                  <div className="mb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <SheetTitle className="text-xl">
                            {selectedOp.nome || selectedOp.titulo}
                          </SheetTitle>
                          <button
                            onClick={() => handleOpenChange(false)}
                            className="ml-2 p-1 rounded-lg hover:bg-slate-100 text-slate-500 flex-shrink-0"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <p className="text-slate-500 mt-1 mb-4">
                          {selectedOp.cliente_nome || "Sem cliente"}
                        </p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="gap-2">
                                <Settings className="w-4 h-4" />
                                {"A\u00e7\u00f5es"}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56">
                              <DropdownMenuItem
                                onClick={() => {
                                  handleOpenChange(false);
                                  onOpenModal(selectedOp);
                                }}
                              >
                                <Edit className="w-4 h-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              {podeUsarIaEdital && (
                                <DropdownMenuItem onClick={() => setShowLerEdital(true)}>
                                  <Sparkles className="w-4 h-4 mr-2 text-amber-600" />
                                  Ler edital com IA
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => onShowClienteView(true)}>
                                <Eye className="w-4 h-4 mr-2" />
                                Ver como cliente
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onShowSalvarTemplate(true)}>
                                <Copy className="w-4 h-4 mr-2" />
                                Salvar como template
                              </DropdownMenuItem>
                              {onDuplicar && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    // c\u00f3pia abre como NOVA (antes: edi\u00e7\u00e3o com o id \u2192 sobrescrevia)
                                    const original = selectedOp;
                                    handleOpenChange(false);
                                    onDuplicar(original);
                                  }}
                                >
                                  <FilePlus className="w-4 h-4 mr-2" />
                                  Duplicar
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={handleAbrirTransferencia}>
                                <Building2 className="w-4 h-4 mr-2" />
                                Transferir Empresa
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onShowStatusConfig(true)}>
                                <Settings className="w-4 h-4 mr-2" />
                                Gerenciar Status
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setPerdidoOpen(true)}
                                className="text-amber-700"
                              >
                                <X className="w-4 h-4 mr-2" />
                                Marcar como Perdido
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  onDelete(selectedOp);
                                  handleOpenChange(false);
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Dialog open={perdidoOpen} onOpenChange={setPerdidoOpen}>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle>Marcar como Perdido</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-3">
                                <Label>Motivo da perda</Label>
                                <Textarea
                                  value={motivoPerda}
                                  onChange={(e) => setMotivoPerda(e.target.value)}
                                  placeholder="Ex.: preço acima do teto, não habilitado, desistimos…"
                                  rows={3}
                                />
                                <div className="flex justify-end gap-2 pt-2">
                                  <Button variant="outline" onClick={() => setPerdidoOpen(false)}>
                                    Cancelar
                                  </Button>
                                  <Button
                                    onClick={handleMarcarPerdido}
                                    disabled={salvandoPerda}
                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                  >
                                    {salvandoPerda ? "Salvando…" : "Marcar Perdido"}
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>

                          <ResponsaveisSelect
                            // responsaveis_ids é JSONB: vem como array pelo
                            // supabase-js. Em registros legacy pode vir string —
                            // safeParseJSON aceita ambos.
                            responsaveisEmails={safeParseJSON(selectedOp.responsaveis_ids, [])}
                            usuarios={usuariosEmpresa}
                            onUpdate={async (newIds) => {
                              const novoValor = JSON.stringify(newIds);
                              setSelectedOp((prev) => ({ ...prev, responsaveis_ids: novoValor }));
                              setOportunidades((prev) =>
                                prev.map((o) =>
                                  o.id === selectedOp.id ? { ...o, responsaveis_ids: novoValor } : o
                                )
                              );
                              await sigo.entities.Oportunidade.update(selectedOp.id, {
                                responsaveis_ids: novoValor,
                              });
                            }}
                            buttonSize="h-9 w-9"
                          />

                          {currentStatus && (
                            <Badge
                              style={{
                                backgroundColor: currentStatus.cor + "20",
                                color: currentStatus.cor,
                                borderColor: currentStatus.cor,
                              }}
                              className="border text-sm"
                            >
                              {selectedOp.status_nome}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </SheetHeader>
              </div>

              <div className="p-6 flex-1 overflow-y-auto">
                <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-2">
                  <div className="overflow-x-auto -mx-6 px-6 pb-1">
                    <TabsList className="flex flex-nowrap gap-1 h-auto bg-slate-100 p-1 w-max min-w-full">
                      <TabsTrigger value="geral" className="flex-shrink-0 text-xs sm:text-sm">
                        Geral
                      </TabsTrigger>
                      {(perfil === "Admin" ||
                        temPermissao("Oportunidades", "Orçamento") ||
                        temPermissao("Oportunidades", "Orcamento")) && (
                        <TabsTrigger value="orcamento" className="flex-shrink-0 text-xs sm:text-sm">
                          {"Or\u00e7amento"}
                        </TabsTrigger>
                      )}
                      {(perfil === "Admin" || temPermissao("Oportunidades", "Cronograma")) && (
                        <TabsTrigger value="obra" className="flex-shrink-0 text-xs sm:text-sm">
                          Planejamento
                        </TabsTrigger>
                      )}
                      {(perfil === "Admin" || temPermissao("Oportunidades", "Arquivos")) && (
                        <TabsTrigger value="arquivos" className="flex-shrink-0 text-xs sm:text-sm">
                          Arquivos
                        </TabsTrigger>
                      )}
                      <TabsTrigger value="anotacoes" className="flex-shrink-0 text-xs sm:text-sm">
                        {"Anota\u00e7\u00f5es"}
                      </TabsTrigger>
                      <TabsTrigger value="chat" className="flex-shrink-0 text-xs sm:text-sm">
                        Chat
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* ABA GERAL */}
                  <TabsContent value="geral" className="space-y-4 mt-4">
                    <PropostasOportunidade
                      oportunidadeId={selectedOp.id}
                      empresaAtiva={empresaAtiva}
                      user={user}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-500">Nome</Label>
                        <p className="font-medium text-slate-800 mt-1">
                          {selectedOp.nome || selectedOp.titulo}
                        </p>
                      </div>
                      <div>
                        <Label className="text-slate-500">Cliente</Label>
                        <p className="font-medium text-slate-800 mt-1">
                          {selectedOp.cliente_nome || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-slate-500">Valor Estimado</Label>
                        <p className="text-lg font-bold text-green-600 mt-1">
                          {podeVerValores ? formatCurrency(selectedOp.valor_estimado) : "-"}
                        </p>
                      </div>
                      <div>
                        <Label className="text-slate-500">Status</Label>
                        {currentStatus && (
                          <Badge style={{ backgroundColor: currentStatus.cor }} className="mt-1">
                            {selectedOp.status_nome}
                          </Badge>
                        )}
                      </div>
                      <div>
                        <Label className="text-slate-500">Origem</Label>
                        <p className="font-medium text-slate-800 mt-1">
                          {selectedOp.origem_nome || "-"}
                        </p>
                      </div>
                    </div>

                    {(licitacaoItens.length > 0 ||
                      portalLicitacao ||
                      selectedOp.alertar_prazos) && (
                      <div className="border-t pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <h4 className="font-medium text-slate-700">Dados da Licitação</h4>
                          {selectedOp.alertar_prazos && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-300 bg-amber-50 font-medium text-amber-800"
                            >
                              <Bell className="w-3 h-3" />
                              Alerta de prazos ({textoDiasAlerta} dias antes)
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                          {licitacaoItens.map((item) => (
                            <div
                              key={item.rotulo}
                              className={item.largo ? "col-span-2 sm:col-span-3" : ""}
                            >
                              <Label className="text-slate-500">{item.rotulo}</Label>
                              <p
                                className={`font-medium mt-1 break-words ${item.destaque ? "text-blue-700" : "text-slate-800"}`}
                              >
                                {item.valor}
                              </p>
                            </div>
                          ))}
                          {portalLicitacao && (
                            <div className="col-span-2 sm:col-span-3">
                              <Label className="text-slate-500">Portal / link da disputa</Label>
                              {/^https?:\/\//i.test(portalLicitacao) ? (
                                <a
                                  href={safeUrl(portalLicitacao)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-1 flex items-center gap-1 break-all font-medium text-amber-700 underline"
                                >
                                  {portalLicitacao}
                                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                </a>
                              ) : (
                                <p className="font-medium text-slate-800 mt-1 break-words">
                                  {portalLicitacao}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedOp.edital_analise && (
                      <EditalResumoCard
                        analise={selectedOp.edital_analise}
                        onReanalisar={podeUsarIaEdital ? handleReanalisarAtende : undefined}
                      />
                    )}

                    {(selectedOp.cep || selectedOp.endereco) && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-slate-700 mb-3">
                          {"Endere\u00e7o da Obra"}
                        </h4>
                        <p className="text-sm text-slate-700">
                          {[
                            selectedOp.endereco,
                            selectedOp.numero,
                            selectedOp.complemento,
                            selectedOp.bairro,
                            selectedOp.cidade,
                            selectedOp.estado,
                            selectedOp.cep,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </div>
                    )}

                    {selectedOp.descricao && (
                      <div className="border-t pt-4">
                        <Label className="text-slate-500">{"Descri\u00e7\u00e3o"}</Label>
                        {/* HTML do editor rico remontado sem dangerouslySetInnerHTML
                            (whitelist de tags, ver DescricaoRica) — sem XSS e sem tags cruas. */}
                        <DescricaoRica
                          valor={selectedOp.descricao}
                          className="mt-2 p-4 bg-slate-50 rounded-lg text-sm text-slate-700 leading-relaxed"
                        />
                      </div>
                    )}
                  </TabsContent>

                  {/* ABA ORÇAMENTO */}
                  <TabsContent value="orcamento" className="mt-4 space-y-4">
                    {visitedTabs.has("orcamento") && (
                      <div className="space-y-4">
                        <OrcamentoLicitacaoBarra
                          selectedOp={selectedOp}
                          setSelectedOp={setSelectedOp}
                          setOportunidades={setOportunidades}
                          orcamentoItens={orcamentoItens}
                          setOrcamentoItens={setOrcamentoItens}
                          empresaAtiva={empresaAtiva}
                          updateTimeoutRef={updateTimeoutRef}
                          podeEditar={podeEditarOrcamento}
                          user={user}
                          importarAberto={importarAberto}
                          onImportarAbertoChange={setImportarAberto}
                          onAplicandoChange={mudarAplicandoDesconto}
                        />

                        {orcamentoItens.length > 0 && (
                          <div className="flex items-center justify-between gap-4 border-b pb-4 flex-wrap">
                            <div className="flex items-center gap-2">
                              {itensSelecionados.size > 0 && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="gap-1"
                                  onClick={onDeleteSelecionados}
                                  disabled={aplicandoDesconto}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Excluir {itensSelecionados.size}
                                </Button>
                              )}
                              {!orcamentoNumerado && (
                                <Select
                                  value={filtroTipoOrcamento}
                                  onValueChange={setFiltroTipoOrcamento}
                                >
                                  <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="Tipo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">Todos</SelectItem>
                                    <SelectItem value="Material">Material</SelectItem>
                                    <SelectItem value={"Mão de Obra"}>Mão de Obra</SelectItem>
                                    <SelectItem value="Ferramental">Ferramental</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <PermissionGate
                                modulo="Oportunidades"
                                aba={"Orçamento"}
                                funcao="editar"
                              >
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild disabled={aplicandoDesconto}>
                                    <Button
                                      variant="outline"
                                      className="gap-2"
                                      disabled={aplicandoDesconto}
                                    >
                                      <FileText className="w-4 h-4" />
                                      {"A\u00e7\u00f5es"}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem
                                      onClick={() => onShowSalvarTemplate(true)}
                                      className="gap-2"
                                    >
                                      <Copy className="w-4 h-4 text-purple-600" />
                                      Salvar como Template
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => onShowAplicarTemplate(true)}
                                      className="gap-2"
                                    >
                                      <Copy className="w-4 h-4 text-indigo-600" />
                                      Aplicar Template
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={onLimparOrcamento}
                                      className="gap-2 text-red-600"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      Apagar Lista Completa
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </PermissionGate>
                              <PermissionGate
                                modulo="Oportunidades"
                                aba={"Orçamento"}
                                funcao="gerar_pdf"
                              >
                                <Button
                                  variant="outline"
                                  onClick={() => onShowRelatoriosOrcamento(true)}
                                  className="gap-2"
                                >
                                  <FileText className="w-4 h-4" />
                                  {"Relat\u00f3rios"}
                                </Button>
                              </PermissionGate>
                            </div>
                          </div>
                        )}

                        {orcamentoItens.length === 0 ? (
                          <div className="text-center py-16">
                            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
                              <FileSpreadsheet className="w-10 h-10 text-blue-600" />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-800 mb-3">
                              {"Novo or\u00e7amento"}
                            </h3>
                            <p className="text-slate-500 mb-8">
                              {"Crie ou importe um or\u00e7amento"}
                            </p>
                            <div className="grid grid-cols-3 gap-6 max-w-2xl mx-auto">
                              {[
                                {
                                  tipo: "zero",
                                  icon: FilePlus,
                                  color: "blue",
                                  label: "Começar do zero",
                                },
                                {
                                  tipo: "modelo",
                                  icon: Copy,
                                  color: "purple",
                                  label: "Utilizar modelo",
                                },
                                {
                                  tipo: "importar",
                                  icon: Upload,
                                  color: "green",
                                  label: "Importar",
                                },
                              ].map(({ tipo, icon: IconComp, color, label }) => (
                                <Card
                                  key={tipo}
                                  className={`cursor-pointer hover:shadow-lg transition-all group`}
                                  onClick={() =>
                                    tipo === "importar"
                                      ? abrirImportacaoPlanilha()
                                      : onNovoOrcamentoSelect(tipo)
                                  }
                                >
                                  <CardContent className="p-8 flex flex-col items-center text-center">
                                    <div
                                      className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4`}
                                      style={{
                                        backgroundColor:
                                          color === "blue"
                                            ? "#eff6ff"
                                            : color === "purple"
                                              ? "#f5f3ff"
                                              : "#f0fdf4",
                                      }}
                                    >
                                      <IconComp
                                        className={`w-8 h-8`}
                                        style={{
                                          color:
                                            color === "blue"
                                              ? "#2563eb"
                                              : color === "purple"
                                                ? "#7c3aed"
                                                : "#16a34a",
                                        }}
                                      />
                                    </div>
                                    <h3 className="font-semibold text-slate-800">{label}</h3>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="border rounded-lg overflow-auto">
                            <table className="w-full" style={{ tableLayout: "auto" }}>
                              <thead className="bg-slate-100 border-b-2">
                                <tr>
                                  <th className="px-3 py-2 w-8">
                                    <input
                                      type="checkbox"
                                      checked={
                                        orcamentoItens.filter(
                                          (i) =>
                                            filtroTipoEfetivo === "all" ||
                                            i.tipo === filtroTipoEfetivo
                                        ).length > 0 &&
                                        orcamentoItens
                                          .filter(
                                            (i) =>
                                              filtroTipoEfetivo === "all" ||
                                              i.tipo === filtroTipoEfetivo
                                          )
                                          .every((i) => itensSelecionados.has(i.id))
                                      }
                                      onChange={(e) => {
                                        const vis = orcamentoItens.filter(
                                          (i) =>
                                            filtroTipoEfetivo === "all" ||
                                            i.tipo === filtroTipoEfetivo
                                        );
                                        setItensSelecionados(
                                          e.target.checked
                                            ? new Set(vis.map((i) => i.id))
                                            : new Set()
                                        );
                                      }}
                                    />
                                  </th>
                                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-700">
                                    {"N\u00ba"}
                                  </th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700 min-w-[300px]">
                                    {"Descri\u00e7\u00e3o"}
                                  </th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700">
                                    {"C\u00f3digo"}
                                  </th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700">
                                    Unid.
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">
                                    Qtd
                                  </th>
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
                                {orcamentoItens
                                  .filter(
                                    (item) =>
                                      filtroTipoEfetivo === "all" || item.tipo === filtroTipoEfetivo
                                  )
                                  .map((item, index) => {
                                    const permissaoLinha =
                                      perfil === "Admin" ||
                                      !item.created_by ||
                                      item.created_by === user?.email;
                                    // durante o Aplicar a tabela inteira fica só leitura
                                    const podeEditar = !aplicandoDesconto && permissaoLinha;
                                    // Etapa (título do orçamento importado): número, descrição,
                                    // subtotal dos itens e lixeira, sem inputs. 11 colunas, como o
                                    // cabeçalho: a descrição ocupa de Descrição a Imp. %.
                                    if (item.etapa) {
                                      return (
                                        <tr
                                          key={item.id}
                                          className="border-b bg-slate-100 font-semibold"
                                        >
                                          <td className="px-3 py-2"></td>
                                          <td className="px-3 py-2 text-center text-xs text-slate-700">
                                            {rotuloItem(item, index)}
                                          </td>
                                          <td
                                            colSpan={7}
                                            className="px-3 py-2 text-xs text-slate-800"
                                          >
                                            {item.descricao || ""}
                                          </td>
                                          <td className="px-3 py-2 text-right">
                                            <span className="text-xs text-slate-800 whitespace-nowrap">
                                              {formatCurrency(subtotalPorEtapa[item.numero] ?? 0)}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7"
                                              title="Excluir etapa"
                                              onClick={() => onDeleteOrcamentoItem(item.id)}
                                              disabled={!podeEditar}
                                            >
                                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                            </Button>
                                          </td>
                                        </tr>
                                      );
                                    }
                                    return (
                                      <tr
                                        key={item.id}
                                        className={`border-b hover:bg-slate-50 ${itensSelecionados.has(item.id) ? "bg-amber-50" : ""}`}
                                      >
                                        <td className="px-3 py-2 text-center">
                                          <input
                                            type="checkbox"
                                            checked={itensSelecionados.has(item.id)}
                                            onChange={(e) => {
                                              const n = new Set(itensSelecionados);
                                              e.target.checked ? n.add(item.id) : n.delete(item.id);
                                              setItensSelecionados(n);
                                            }}
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-center text-xs text-slate-500">
                                          {rotuloItem(item, index)}
                                        </td>
                                        <td className="px-3 py-2 min-w-[300px]">
                                          <div
                                            className="relative"
                                            ref={
                                              editingItemId === item.id ? itemDescRef : undefined
                                            }
                                          >
                                            <Input
                                              className="h-8 text-xs"
                                              value={
                                                editingItemId === item.id
                                                  ? (editingValues.descricao ?? item.descricao)
                                                  : item.descricao || ""
                                              }
                                              onFocus={() => {
                                                if (podeEditar) {
                                                  setEditingItemId(item.id);
                                                  setEditingValues(item);
                                                  setItemSearchTerm(item.descricao || "");
                                                }
                                              }}
                                              onChange={(e) => {
                                                setEditingValues({
                                                  ...editingValues,
                                                  descricao: e.target.value,
                                                });
                                                setItemSearchTerm(e.target.value);
                                                setShowSuggestions(true);
                                              }}
                                              onBlur={() => {
                                                setTimeout(() => {
                                                  setShowSuggestions(false);
                                                  if (
                                                    editingItemId === item.id &&
                                                    editingValues.descricao !== item.descricao
                                                  ) {
                                                    handleUpdateItem(
                                                      item.id,
                                                      "descricao",
                                                      editingValues.descricao
                                                    );
                                                  }
                                                  setEditingItemId(null);
                                                }, 200);
                                              }}
                                              placeholder={
                                                permissaoLinha
                                                  ? "Clique para editar..."
                                                  : "Sem permissão"
                                              }
                                              disabled={!podeEditar}
                                              readOnly={editingItemId !== item.id}
                                            />
                                            {editingItemId === item.id &&
                                              showSuggestions &&
                                              itemSearchTerm &&
                                              (() => {
                                                const filtered = materiais.filter(
                                                  (m) =>
                                                    m.nome_item
                                                      ?.toLowerCase()
                                                      .includes(itemSearchTerm.toLowerCase()) ||
                                                    m.codigo
                                                      ?.toLowerCase()
                                                      .includes(itemSearchTerm.toLowerCase())
                                                );
                                                if (filtered.length === 0) return null;
                                                const r =
                                                  itemDescRef.current?.getBoundingClientRect();
                                                return createPortal(
                                                  <div
                                                    className="z-[9999] bg-white border rounded-lg shadow-lg max-h-[250px] overflow-y-auto"
                                                    style={
                                                      r
                                                        ? {
                                                            position: "fixed",
                                                            top: r.bottom + 4,
                                                            left: r.left,
                                                            width: r.width,
                                                          }
                                                        : { display: "none" }
                                                    }
                                                  >
                                                    {filtered.slice(0, 20).map((m) => (
                                                      <button
                                                        key={m.id}
                                                        type="button"
                                                        className="w-full text-left px-3 py-2 text-xs border-b hover:bg-slate-100"
                                                        onMouseDown={async (e) => {
                                                          e.preventDefault();
                                                          const valorUnitario =
                                                            m.preco_referencia ||
                                                            m.preco ||
                                                            m.preco_medio ||
                                                            0;
                                                          const updatedItem = {
                                                            ...item,
                                                            descricao: m.nome_item,
                                                            codigo: m.codigo || "",
                                                            unidade: m.unidade || "UN",
                                                            valor_unitario: valorUnitario,
                                                          };
                                                          setOrcamentoItens((prev) =>
                                                            prev.map((i) =>
                                                              i.id === item.id ? updatedItem : i
                                                            )
                                                          );
                                                          setShowSuggestions(false);
                                                          setEditingItemId(null);
                                                          await sigo.entities.OrcamentoItem.update(
                                                            item.id,
                                                            updatedItem
                                                          );
                                                        }}
                                                      >
                                                        <div className="font-medium text-slate-800">
                                                          {m.nome_item}
                                                        </div>
                                                        {m.codigo && (
                                                          <div className="text-slate-500">
                                                            {"C\u00f3digo"}: {m.codigo}
                                                          </div>
                                                        )}
                                                      </button>
                                                    ))}
                                                  </div>,
                                                  document.body
                                                );
                                              })()}
                                          </div>
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            className="h-8 text-xs"
                                            value={item.codigo || ""}
                                            disabled={!podeEditar}
                                            onChange={(e) =>
                                              setOrcamentoItens((prev) =>
                                                prev.map((i) =>
                                                  i.id === item.id
                                                    ? { ...i, codigo: e.target.value }
                                                    : i
                                                )
                                              )
                                            }
                                            onBlur={(e) =>
                                              handleUpdateItem(item.id, "codigo", e.target.value)
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            className="h-8 text-xs"
                                            value={item.unidade || ""}
                                            disabled={!podeEditar}
                                            onChange={(e) =>
                                              setOrcamentoItens((prev) =>
                                                prev.map((i) =>
                                                  i.id === item.id
                                                    ? { ...i, unidade: e.target.value }
                                                    : i
                                                )
                                              )
                                            }
                                            onBlur={(e) =>
                                              handleUpdateItem(item.id, "unidade", e.target.value)
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            type="number"
                                            className="h-8 text-xs"
                                            value={item.quantidade || 0}
                                            disabled={!podeEditar}
                                            onChange={(e) => {
                                              const v = parseFloat(e.target.value) || 0;
                                              const u = { ...item, quantidade: v };
                                              u.valor_total = totalLinhaLegado(u);
                                              setOrcamentoItens((prev) =>
                                                prev.map((i) => (i.id === item.id ? u : i))
                                              );
                                            }}
                                            onBlur={(e) =>
                                              handleUpdateItem(
                                                item.id,
                                                "quantidade",
                                                e.target.value
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            type="number"
                                            className="h-8 text-xs"
                                            value={item.valor_unitario || 0}
                                            disabled={!podeEditar}
                                            onChange={(e) => {
                                              const v = parseFloat(e.target.value) || 0;
                                              const u = { ...item, valor_unitario: v };
                                              u.valor_total = totalLinhaLegado(u);
                                              setOrcamentoItens((prev) =>
                                                prev.map((i) => (i.id === item.id ? u : i))
                                              );
                                            }}
                                            onBlur={(e) =>
                                              handleUpdateItem(
                                                item.id,
                                                "valor_unitario",
                                                e.target.value
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            type="number"
                                            className="h-8 text-xs"
                                            value={item.bdi || 0}
                                            disabled={!podeEditar}
                                            onChange={(e) => {
                                              const v = parseFloat(e.target.value) || 0;
                                              const u = { ...item, bdi: v };
                                              u.valor_total = totalLinhaLegado(u);
                                              setOrcamentoItens((prev) =>
                                                prev.map((i) => (i.id === item.id ? u : i))
                                              );
                                            }}
                                            onBlur={(e) =>
                                              handleUpdateItem(item.id, "bdi", e.target.value)
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            type="number"
                                            className="h-8 text-xs"
                                            value={item.imposto || 0}
                                            disabled={!podeEditar}
                                            onChange={(e) => {
                                              const v = parseFloat(e.target.value) || 0;
                                              const u = { ...item, imposto: v };
                                              u.valor_total = totalLinhaLegado(u);
                                              setOrcamentoItens((prev) =>
                                                prev.map((i) => (i.id === item.id ? u : i))
                                              );
                                            }}
                                            onBlur={(e) =>
                                              handleUpdateItem(item.id, "imposto", e.target.value)
                                            }
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
                                            onClick={() => onDeleteOrcamentoItem(item.id)}
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
                                  <td colSpan={2} className="px-3 py-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="gap-1 text-xs text-blue-600 hover:text-blue-800"
                                      onClick={() => onNovoOrcamentoSelect("zero")}
                                      disabled={aplicandoDesconto}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      Novo item
                                    </Button>
                                  </td>
                                  <td
                                    colSpan={7}
                                    className="px-3 py-3 text-right font-semibold text-sm"
                                  >
                                    Total:
                                  </td>
                                  <td className="px-3 py-3 font-bold text-green-600 text-sm">
                                    {formatCurrency(
                                      orcamentoItens
                                        .filter(
                                          (i) =>
                                            filtroTipoEfetivo === "all" ||
                                            i.tipo === filtroTipoEfetivo
                                        )
                                        .reduce((s, i) => s + (i.valor_total || 0), 0)
                                    )}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  {/* ABA PLANEJAMENTO */}
                  <TabsContent value="obra" className="space-y-4 mt-4">
                    {visitedTabs.has("obra") && (
                      <DiarioObraTab
                        projetoId={selectedOp.id}
                        empresaAtiva={empresaAtiva}
                        usuariosEmpresa={usuariosEmpresa}
                        showOnlyTasks={true}
                      />
                    )}
                  </TabsContent>

                  {/* ABA ARQUIVOS */}
                  <TabsContent value="arquivos" className="space-y-4 mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-800">Arquivos</h3>
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={fileInputArquivosRef}
                          type="file"
                          className="hidden"
                          onChange={(e) => onUploadFile(e, pastaAtual)}
                          accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx"
                        />
                        <Select value={pastaAtual} onValueChange={setPastaAtual}>
                          <SelectTrigger
                            className="h-9 w-[210px]"
                            title="Pasta onde o upload/link é gravado"
                          >
                            <Folder className="mr-1 h-4 w-4 text-amber-500" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {pastasArquivos.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowAddLink(true)}
                          className="gap-2"
                        >
                          <Link2 className="w-4 h-4" /> Adicionar Link
                        </Button>
                        <Button
                          size="sm"
                          disabled={uploadingFile}
                          onClick={() => fileInputArquivosRef.current?.click()}
                          className="gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          {uploadingFile ? "Enviando..." : "Upload"}
                        </Button>
                      </div>
                    </div>

                    {showAddLink && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                        <p className="text-sm font-medium text-blue-800">
                          Adicionar Link (OneDrive, Google Drive, etc.)
                        </p>
                        <Input
                          placeholder="URL do arquivo (ex: https://drive.google.com/...)"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                        />
                        <Input
                          placeholder="Nome do arquivo (opcional)"
                          value={linkNome}
                          onChange={(e) => setLinkNome(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleSalvarLink}
                            disabled={!linkUrl.trim()}
                            className="gap-2"
                          >
                            <Check className="w-4 h-4" /> Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setShowAddLink(false);
                              setLinkUrl("");
                              setLinkNome("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                    <ArquivosPastas
                      key={selectedOp?.id}
                      arquivos={arquivos}
                      pastas={pastasArquivos}
                      pastaAtual={pastaAtual}
                      onAbrirPasta={setPastaAtual}
                      onCriarPasta={handleCriarPasta}
                      onApagarPasta={handleApagarPasta}
                      renderArquivo={(arq) => {
                        const isLink = arq.tipo === "link";
                        const isPdf =
                          !isLink &&
                          (arq.tipo?.includes("pdf") || arq.nome?.toLowerCase().endsWith(".pdf"));
                        const isImage =
                          !isLink &&
                          (arq.tipo?.includes("image") ||
                            /\.(jpg|jpeg|png|gif|webp)$/i.test(arq.nome));
                        const canPreview = isPdf || isImage;
                        const isOneDrive =
                          isLink &&
                          (arq.url?.includes("onedrive") || arq.url?.includes("sharepoint"));
                        const isGDrive =
                          isLink &&
                          (arq.url?.includes("drive.google") || arq.url?.includes("docs.google"));
                        return (
                          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              {isImage ? (
                                <div className="w-12 h-12 rounded overflow-hidden bg-slate-200">
                                  <ImgStorage
                                    referencia={arq.url}
                                    alt={arq.nome}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : isLink ? (
                                <div
                                  className={`w-12 h-12 rounded flex items-center justify-center ${isOneDrive ? "bg-blue-100" : isGDrive ? "bg-green-100" : "bg-slate-200"}`}
                                >
                                  <Link2
                                    className={`w-6 h-6 ${isOneDrive ? "text-blue-600" : isGDrive ? "text-green-600" : "text-slate-600"}`}
                                  />
                                </div>
                              ) : (
                                <div
                                  className={`w-12 h-12 rounded flex items-center justify-center ${isPdf ? "bg-red-100" : "bg-slate-200"}`}
                                >
                                  <FileText
                                    className={`w-6 h-6 ${isPdf ? "text-red-600" : "text-slate-600"}`}
                                  />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-slate-800 flex flex-wrap items-center gap-2">
                                  <span className="break-all">{arq.nome}</span>
                                  {CATEGORIAS_ARQUIVO[arq.categoria] && (
                                    <Badge
                                      variant="outline"
                                      className="border-amber-300 bg-amber-50 font-medium text-amber-800"
                                    >
                                      {CATEGORIAS_ARQUIVO[arq.categoria]}
                                    </Badge>
                                  )}
                                </p>
                                {isLink && (
                                  <p className="text-xs text-blue-500 truncate max-w-[200px]">
                                    {arq.url}
                                  </p>
                                )}
                                <p className="text-xs text-slate-500">
                                  {arq.usuario_nome} •{" "}
                                  {new Date(arq.created_date).toLocaleDateString("pt-BR")}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {isLink && (
                                <Button
                                  size="icon"
                                  className="h-8 w-8 bg-blue-500 hover:bg-blue-600 text-white"
                                  onClick={() =>
                                    window.open(safeUrl(arq.url), "_blank", "noopener")
                                  }
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </Button>
                              )}
                              {canPreview && (
                                <Button
                                  size="icon"
                                  className="h-8 w-8 bg-green-500 hover:bg-green-600 text-white"
                                  onClick={() => {
                                    setArquivoPreview({
                                      url: arq.url,
                                      nome: arq.nome,
                                      tipo: arq.tipo,
                                    });
                                    setShowPreviewArquivo(true);
                                  }}
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Mover para outra pasta"
                                  >
                                    <Folder className="w-4 h-4 text-amber-600" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {pastasArquivos
                                    .filter((p) => !mesmaPasta(p, pastaDoArquivo(arq)))
                                    .map((p) => (
                                      <DropdownMenuItem
                                        key={p}
                                        onClick={() => handleMoverArquivo(arq, p)}
                                      >
                                        Mover para {p}
                                      </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDeleteArquivo(arq.id)}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        );
                      }}
                    />
                  </TabsContent>

                  {/* ABA ANOTAÇÕES */}
                  <TabsContent value="anotacoes" className="space-y-4 mt-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder={"Adicionar anota\u00e7\u00e3o..."}
                        value={novaNota}
                        onChange={(e) => setNovaNota(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && onAddNota()}
                      />
                      <Button onClick={onAddNota} disabled={!novaNota.trim()}>
                        Adicionar
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {atualizacoes.map((atualiz) => (
                        <div key={atualiz.id} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${atualiz.tipo === "Status" ? "bg-blue-100" : atualiz.tipo === "Sistema" ? "bg-slate-200" : "bg-amber-100"}`}
                          >
                            {atualiz.tipo === "Status" ? (
                              <Target className="w-4 h-4 text-blue-600" />
                            ) : atualiz.tipo === "Sistema" ? (
                              <Calendar className="w-4 h-4 text-slate-600" />
                            ) : (
                              <User className="w-4 h-4 text-amber-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-slate-800">{atualiz.descricao}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {atualiz.usuario_nome} •{" "}
                              {new Date(atualiz.created_date).toLocaleString("pt-BR")}
                            </p>
                          </div>
                        </div>
                      ))}
                      {atualizacoes.length === 0 && (
                        <div className="text-center py-12 text-slate-500">
                          <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>{"Nenhuma anota\u00e7\u00e3o"}</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* ABA CHAT */}
                  <TabsContent value="chat" className="mt-4">
                    {visitedTabs.has("chat") && (
                      <ChatContextual
                        tipo="Oportunidade"
                        contextoId={selectedOp.id}
                        contextoNome={selectedOp.nome || selectedOp.titulo}
                        empresaAtiva={empresaAtiva}
                        user={user}
                      />
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Modal Transferir Empresa */}
      <Dialog open={showTransferirEmpresa} onOpenChange={setShowTransferirEmpresa}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir para outra empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-500">
              Selecione a empresa de destino. A oportunidade <strong>{selectedOp?.nome}</strong>{" "}
              será movida e não aparecerá mais na empresa atual.
            </p>
            <Select value={empresaSelecionada} onValueChange={setEmpresaSelecionada}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa..." />
              </SelectTrigger>
              <SelectContent className="z-[9999]" position="popper">
                {empresasDisponiveis.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.razao_social || e.nome_fantasia || e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowTransferirEmpresa(false)}>
                Cancelar
              </Button>
              <Button onClick={handleTransferir} disabled={!empresaSelecionada || transferindo}>
                {transferindo ? "Transferindo..." : "Transferir"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Arquivo gravado como ref "bucket/caminho": os dois resolvem a URL assinada na hora */}
      {showPreviewArquivo && ehPdfArquivo(arquivoPreview) ? (
        <VisualizadorPDF
          fileUrl={arquivoPreview.url}
          fileName={arquivoPreview.nome}
          onClose={() => {
            setShowPreviewArquivo(false);
            setArquivoPreview(null);
          }}
        />
      ) : (
        <AnexoViewer
          anexo={arquivoPreview}
          open={showPreviewArquivo && !!arquivoPreview}
          onOpenChange={(val) => {
            setShowPreviewArquivo(val);
            if (!val) setArquivoPreview(null);
          }}
        />
      )}

      {/* Ler edital com IA (oportunidade existente → atualiza) */}
      {selectedOp && podeUsarIaEdital && (
        <LerEditalSheet
          open={showLerEdital}
          onOpenChange={(val) => {
            setShowLerEdital(val);
            if (!val) recarregarOportunidade();
          }}
          empresaAtiva={empresaAtiva}
          user={user}
          oportunidade={selectedOp}
          onConcluido={() => handleTabChange("geral")}
          onAnaliseGravada={handleAnaliseGravada}
        />
      )}
    </>
  );
}
