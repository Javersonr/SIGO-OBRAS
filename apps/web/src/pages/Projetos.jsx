import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../Layout";
import { safeParseJSON } from "@/lib/json-utils";
import { salvarDraftSC } from "@/lib/sc-draft";
import { createPageUrl } from "../utils";
import {
  Plus,
  Eye,
  Calendar,
  Download,
  Settings,
  FileText,
  ChevronDown,
  FileSpreadsheet,
  Upload,
  User as UserIcon,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import FinanceiroTab from "../components/projetos/FinanceiroTab";
import MedicoesTab from "../components/projetos/MedicoesTab";
import IniciarFluxoButton from "../components/fluxos/IniciarFluxoButton";
import DiarioObraTab from "../components/projetos/DiarioObraTab";
import SolicitacaoModal from "../components/compras/SolicitacaoModal";
import ChatContextual from "../components/chat/ChatContextual";
import BuscaAvancada from "../components/projetos/BuscaAvancada";
import ResponsaveisSelect from "../components/shared/ResponsaveisSelect.jsx";
import ProjetoFormSheet from "../components/projetos/ProjetoFormSheet";
import StatusOrigensSheet from "../components/projetos/StatusOrigensSheet";
import OrcamentoTab from "../components/projetos/OrcamentoTab";
import ProjetoDetailHeader from "../components/projetos/ProjetoDetailHeader";
import EntityActions from "../components/shared/EntityActions";
import SortButton from "../components/shared/SortButton";
import SortableTableHeader from "../components/shared/SortableTableHeader";
import PortalClienteEmbed from "../components/cliente/PortalClienteEmbed";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import * as XLSX from "xlsx";
import AnexoViewer from "../components/shared/AnexoViewer";
import CriarMaterialModal from "../components/materiais/CriarMaterialModal";

export default function Projetos() {
  const navigate = useNavigate();
  const { empresaAtiva, perfil, user, temPermissao, vinculo } = useEmpresa();

  // permissoes/responsaveis_emails são JSONB → vêm como objeto/array pelo
  // supabase-js, JSON.parse direto virava "[object Object]" e quebrava render.
  const permissoes = React.useMemo(
    () => safeParseJSON(vinculo?.permissoes, {}),
    [vinculo?.permissoes]
  );

  const temPermissoesGranulares = Object.keys(permissoes).length > 0;

  // Pode ver valores: Admin OU quem tem 100% acesso aos módulos Oportunidades, Projetos E Financeiro (sem granularidade)
  const podeVerValores = React.useMemo(() => {
    if (perfil === "Admin") return true;

    // Se tem permissões granulares, não pode ver valores
    if (temPermissoesGranulares) return false;

    // Sem permissões granulares = acesso total aos módulos, pode ver valores
    return true;
  }, [perfil, temPermissoesGranulares]);

  const [projetos, setProjetos] = useState([]);
  const [statusList, setStatusList] = useState([]);
  const [origensList, setOrigensList] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [usuariosEmpresa, setUsuariosEmpresa] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(""); // passado para BuscaAvancada
  const [filterStatus, setFilterStatus] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showStatusConfig, setShowStatusConfig] = useState(false);
  const [selectedProj, setSelectedProj] = useState(null);
  const [viewMode, setViewMode] = useState("kanban");
  const [atualizacoes, setAtualizacoes] = useState([]);
  const [novaNota, setNovaNota] = useState("");
  const [orcamentoItens, setOrcamentoItens] = useState([]);
  const [cronogramaEtapas, setCronogramaEtapas] = useState([]); // usado no loadOrcamentoData
  const [arquivos, setArquivos] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [showSalvarTemplate, setShowSalvarTemplate] = useState(false);
  const [showClienteView, setShowClienteView] = useState(false);
  const [showPreviewArquivo, setShowPreviewArquivo] = useState(false);
  const [showCriarMaterial, setShowCriarMaterial] = useState(false);
  const [novoMaterialForm, setNovoMaterialForm] = useState({
    nome: "",
    codigo: "",
    unidade: "UN",
    preco_referencia: 0,
  });
  const fileInputProjetosRef = React.useRef(null);
  const [importacaoProjetos, setImportacaoProjetos] = useState({
    ativo: false,
    total: 0,
    processados: 0,
    erros: 0,
  });
  const [arquivoPreview, setArquivoPreview] = useState(null);
  const fileInputOrcamentoRef = React.useRef(null);
  const [itensSelecionados, setItensSelecionados] = useState(new Set());
  const [showSolicitacaoCompra, setShowSolicitacaoCompra] = useState(false);
  const [savingSolicitacao, setSavingSolicitacao] = useState(false);
  const [solicitacaoCompraForm, setSolicitacaoCompraForm] = useState({
    projeto_id: "",
    projeto_nome: "",
    oportunidade_id: "",
    oportunidade_nome: "",
    aprovador_id: "",
    aprovador_nome: "",
    prioridade: "Normal",
    data_necessidade: "",
    observacoes: "",
    itens: [{ descricao: "", quantidade: 1, unidade: "UN", ultimo_preco: null }],
  });
  const [colunasConfig, setColunasConfig] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [filtroMeus, setFiltroMeus] = useState(true);
  const [sortConfig, setSortConfig] = useState({ field: "created_date", direction: "desc" });

  // Define loadData ANTES de usá-la
  const loadData = React.useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const [projs, status, origens, clientesList, templatesList, usuariosList] = await Promise.all(
        [
          sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id }),
          sigo.entities.StatusOportunidade.filter({ empresa_id: empresaAtiva.id }),
          sigo.entities.OrigemOportunidade.filter({ empresa_id: empresaAtiva.id }),
          sigo.entities.Cliente.filter({ empresa_id: empresaAtiva.id, ativo: true }),
          sigo.entities.TemplateOportunidade.filter({ empresa_id: empresaAtiva.id, ativo: true }),
          sigo.entities.UsuarioEmpresa.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        ]
      );

      setProjetos(projs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      setStatusList(status.sort((a, b) => a.ordem - b.ordem));
      setOrigensList(origens);
      setClientes(clientesList);
      setTemplates(templatesList);
      setUsuariosEmpresa(usuariosList);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    if (empresaAtiva?.id && user?.email) {
      loadData();
    }
  }, [empresaAtiva?.id, user?.email, loadData]);

  // Sincronizar searchResults com projetos
  useEffect(() => {
    setSearchResults(projetos);
  }, [projetos]);

  const loadAtualizacoes = async (projId) => {
    const atualiz = await sigo.entities.OportunidadeAtualizacao.filter({
      empresa_id: empresaAtiva.id,
      projeto_id: projId,
    });
    setAtualizacoes(atualiz.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
  };

  const loadOrcamentoData = async (projId) => {
    // Carregar apenas dados essenciais - materiais serão carregados sob demanda
    const [itens, etapas, arqs, cols] = await Promise.all([
      sigo.entities.OrcamentoItem.filter({ empresa_id: empresaAtiva.id, projeto_id: projId }),
      sigo.entities.CronogramaEtapa.filter({ empresa_id: empresaAtiva.id, projeto_id: projId }),
      sigo.entities.ArquivoOportunidade.filter({
        empresa_id: empresaAtiva.id,
        projeto_id: projId,
      }),
      sigo.entities.OrcamentoColunaConfig.filter({ empresa_id: empresaAtiva.id }),
    ]);

    const sortedItens = itens.sort((a, b) => {
      const descA = (a.descricao || "").toLowerCase();
      const descB = (b.descricao || "").toLowerCase();
      return descA.localeCompare(descB);
    });
    sortedItens.forEach((item, index) => {
      item.item = (index + 1).toString();
    });

    setOrcamentoItens(sortedItens);
    setCronogramaEtapas(etapas.sort((a, b) => a.ordem - b.ordem));
    setArquivos(arqs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    setColunasConfig(cols.sort((a, b) => a.ordem - b.ordem));

    // Carregar TODOS os materiais - sempre atualizar (com delay para evitar rate limit)
    setTimeout(async () => {
      try {
        const [mats, maoObra, ferram] = await Promise.all([
          sigo.entities.Material.filter({ empresa_id: empresaAtiva.id, ativo: true }),
          sigo.entities.MaoDeObra.filter({ empresa_id: empresaAtiva.id, ativo: true }),
          sigo.entities.Ferramental.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        ]);
        setMateriais([
          ...mats.map((m) => ({ ...m, tipo: "Material", nome_item: m.nome })),
          ...maoObra.map((m) => ({ ...m, tipo: "Mão de Obra", nome_item: m.nome })),
          ...ferram.map((f) => ({ ...f, tipo: "Ferramental", nome_item: f.nome })),
        ]);
        console.log(
          `Materiais carregados: ${mats.length} Material, ${maoObra.length} Mão de Obra, ${ferram.length} Ferramental`
        );
      } catch (error) {
        console.error("Erro ao carregar materiais:", error);
      }
    }, 500);
  };

  const handleOpenModal = (proj = null) => {
    setSelectedProj(proj || null);
    setShowModal(true);
  };

  const handleOpenDetail = async (proj) => {
    // Usar versão mais recente do projeto (pode ter responsáveis atualizados no kanban)
    const projAtual = projetos.find((p) => p.id === proj.id) || proj;
    setSelectedProj(projAtual);
    await Promise.all([loadAtualizacoes(proj.id), loadOrcamentoData(proj.id)]);
    setShowDetail(true);
  };

  // Determinar aba padrão baseada nas permissões - retorna primeira aba visível
  const getDefaultTab = () => {
    // Admin tem acesso a tudo, usar primeira aba
    if (perfil === "Admin") return "geral";

    // Verificar permissões na ordem de prioridade
    if (temPermissao("Projetos", "Lista")) return "geral";
    if (temPermissao("Projetos", "Orçamento")) return "orcamento";
    if (temPermissao("Projetos", "Cronograma")) return "obra";
    if (temPermissao("Projetos", "Financeiro")) return "financeiro";
    if (temPermissao("Projetos", "Diário de Obra")) return "diario";
    if (temPermissao("Projetos", "Arquivos")) return "arquivos";
    if (temPermissao("Projetos", "Anotações")) return "anotacoes";
    if (temPermissao("Projetos", "Chat")) return "chat";

    // Sem permissão em nenhuma aba, usar a primeira disponível dinamicamente
    return "diario";
  };

  const handleAddNota = async () => {
    if (!novaNota.trim() || !selectedProj) return;

    await sigo.entities.OportunidadeAtualizacao.create({
      empresa_id: empresaAtiva.id,
      projeto_id: selectedProj.id,
      usuario_id: user?.id,
      usuario_nome: user?.full_name,
      tipo: "Nota",
      descricao: novaNota,
    });

    setNovaNota("");
    loadAtualizacoes(selectedProj.id);
  };

  const handleDeleteOrcamentoItem = async (itemId) => {
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
    if (itensSelecionados.size === 0) return;
    if (!confirm(`Excluir ${itensSelecionados.size} item(ns) selecionado(s)?`)) return;
    await Promise.all(
      [...itensSelecionados].map((id) => sigo.entities.OrcamentoItem.delete(id).catch(() => {}))
    );
    setItensSelecionados(new Set());
    loadOrcamentoData(selectedProj.id);
  };

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProj) return;

    setUploadingFile(true);
    try {
      const uploadResult = await sigo.integrations.Core.UploadFile({ file });
      const fileUrl = uploadResult.file_url || uploadResult.url || uploadResult;

      await sigo.entities.ArquivoOportunidade.create({
        empresa_id: empresaAtiva.id,
        projeto_id: selectedProj.id,
        nome: file.name,
        url: fileUrl,
        tipo: file.type,
        tamanho: file.size,
        usuario_nome: user?.full_name || user?.email || "Usuário",
      });

      await loadOrcamentoData(selectedProj.id);
      e.target.value = "";
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      alert("Erro ao fazer upload do arquivo: " + (error.message || "Erro desconhecido"));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleViewFile = (arquivo) => {
    setArquivoPreview(arquivo);
    setShowPreviewArquivo(true);
  };

  const handleDeleteArquivo = async (arquivoId) => {
    if (!confirm("Excluir este arquivo?")) return;
    await sigo.entities.ArquivoOportunidade.delete(arquivoId);
    loadOrcamentoData(selectedProj.id);
  };

  const handleChangeStatus = async (proj, newStatusId) => {
    const statusNovo = statusList.find((s) => s.id === newStatusId);
    // Atualizar localmente imediatamente (feedback visual instantâneo no kanban)
    setProjetos((prev) =>
      prev.map((p) =>
        p.id === proj.id ? { ...p, status_id: newStatusId, status_nome: statusNovo?.nome } : p
      )
    );

    await sigo.entities.Projeto.update(proj.id, {
      status_id: newStatusId,
      status_nome: statusNovo?.nome,
    });
    await sigo.entities.OportunidadeAtualizacao.create({
      empresa_id: empresaAtiva.id,
      projeto_id: proj.id,
      usuario_id: user?.id,
      usuario_nome: user?.full_name,
      tipo: "Status",
      descricao: `Status alterado de "${statusList.find((s) => s.id === proj.status_id)?.nome}" para "${statusNovo?.nome}"`,
    });
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const { draggableId, destination } = result;
    const projeto = projetos.find((p) => p.id === draggableId);

    if (projeto && projeto.status_id !== destination.droppableId) {
      handleChangeStatus(projeto, destination.droppableId);
    }
  };

  const handleDelete = async (proj) => {
    if (!confirm("Deseja excluir este projeto?")) return;
    setProjetos((prev) => prev.filter((p) => p.id !== proj.id));
    await sigo.entities.Projeto.delete(proj.id);
  };

  const handleArchive = async (proj) => {
    if (!confirm("Deseja arquivar este projeto?")) return;
    setProjetos((prev) => prev.map((p) => (p.id === proj.id ? { ...p, arquivado: true } : p)));
    await sigo.entities.Projeto.update(proj.id, { arquivado: true });
    setShowDetail(false);
  };

  const handleExport = () => {
    const csv = [
      [
        "Nome",
        "Cliente",
        "Status",
        "Valor",
        "Probabilidade",
        "Data Fechamento",
        "Responsável",
      ].join(","),
      ...filteredProjs.map((p) =>
        [
          p.nome,
          p.cliente_nome || "",
          p.status_nome,
          p.valor_estimado || 0,
          p.probabilidade || 0,
          p.data_fechamento_prevista || "",
          p.responsavel_nome || "",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `projetos_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleBaixarModeloProjetos = async () => {
    if (!XLSX) return;
    const modelo = [
      [
        "ID",
        "Nome",
        "Cliente (Razão)",
        "Status",
        "Origem",
        "Cidade",
        "Estado",
        "CEP",
        "Endereço",
        "Valor contrato",
        "Modalidade (opcional)",
        "Data licitação (opcional)",
        "Horário licitação (opcional)",
      ],
      [
        "",
        "Projeto Exemplo",
        "CLIENTE EXEMPLO",
        "Iniciado",
        "Prospecto",
        "São Paulo",
        "SP",
        "01310-100",
        "Avenida Paulista",
        "50000.00",
        "Pregão",
        "01/01/2025",
        "10:00",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(modelo);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Projetos");
    ws["!cols"] = [
      { wch: 10 },
      { wch: 30 },
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 10 },
      { wch: 12 },
      { wch: 30 },
      { wch: 15 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
    ];
    XLSX.writeFile(wb, "Modelo_Importacao_Projetos.xlsx");
  };

  const handleImportarProjetos = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        setImportacaoProjetos({ ativo: true, total: data.length, processados: 0, erros: 0 });
        let importados = 0;
        let erros = 0;
        for (let lote = 0; lote < data.length; lote += 10) {
          const resultados = await Promise.all(
            data.slice(lote, lote + 10).map(async (row, idx) => {
              try {
                if (!row.Nome?.trim()) {
                  setImportacaoProjetos((p) => ({ ...p, processados: lote + idx + 1 }));
                  return false;
                }
                let status =
                  statusList.find((s) => s.nome?.toLowerCase() === row.Status?.toLowerCase()) ||
                  statusList[0];
                let cliente = clientes.find(
                  (c) => c.nome_razao?.toLowerCase() === row["Cliente (Razão)"]?.toLowerCase()
                );
                if (!cliente && row["Cliente (Razão)"]?.trim()) {
                  cliente = await sigo.entities.Cliente.create({
                    empresa_id: empresaAtiva.id,
                    nome_razao: row["Cliente (Razão)"],
                    tipo_pessoa: "PJ",
                    ativo: true,
                  });
                }
                let origem = origensList.find(
                  (o) => o.nome?.toLowerCase() === row.Origem?.toLowerCase()
                );
                if (!origem && row.Origem?.trim()) {
                  origem = await sigo.entities.OrigemOportunidade.create({
                    empresa_id: empresaAtiva.id,
                    nome: row.Origem,
                  });
                }
                const existente = await sigo.entities.Projeto.filter({
                  empresa_id: empresaAtiva.id,
                  nome: row.Nome,
                });
                if (existente.length > 0) {
                  setImportacaoProjetos((p) => ({
                    ...p,
                    processados: lote + idx + 1,
                    erros: p.erros + 1,
                  }));
                  return false;
                }
                const valorEstimado =
                  parseFloat(
                    String(row["Valor contrato"] || "0")
                      .replace(/[^\d,.-]/g, "")
                      .replace(",", ".")
                  ) || 0;
                await sigo.entities.Projeto.create({
                  empresa_id: empresaAtiva.id,
                  nome: row.Nome,
                  cliente_id: cliente?.id || null,
                  cliente_nome: cliente?.nome_razao || null,
                  status_id: status?.id,
                  status_nome: status?.nome,
                  origem_id: origem?.id || null,
                  origem_nome: origem?.nome || null,
                  valor_estimado: valorEstimado,
                  cidade: row.Cidade || null,
                  estado: row.Estado || null,
                  cep: row.CEP || null,
                  endereco: row.Endereço || null,
                  licitacao_modalidade: row["Modalidade (opcional)"] || null,
                  licitacao_data: row["Data licitação (opcional)"] || null,
                  licitacao_horario: row["Horário licitação (opcional)"] || null,
                });
                setImportacaoProjetos((p) => ({ ...p, processados: lote + idx + 1 }));
                return true;
              } catch (err) {
                setImportacaoProjetos((p) => ({
                  ...p,
                  processados: lote + idx + 1,
                  erros: p.erros + 1,
                }));
                return false;
              }
            })
          );
          importados += resultados.filter(Boolean).length;
          erros += resultados.filter((r) => !r).length;
        }
        setTimeout(() => {
          setImportacaoProjetos({ ativo: false, total: 0, processados: 0, erros: 0 });
          alert(`Importação concluída!\n✅ ${importados} importados\n❌ ${erros} erros`);
          loadData();
        }, 500);
      } catch (error) {
        setImportacaoProjetos({ ativo: false, total: 0, processados: 0, erros: 0 });
        alert(`Erro: ${error.message}`);
      } finally {
        e.target.value = null;
      }
    };
    reader.readAsBinaryString(file);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const formatModalidade = (modalidade) => {
    if (!modalidade) return "";
    const formatos = {
      concorrencia: "CONCORRÊNCIA",
      tomada_precos: "TOMADA DE PREÇOS",
      convite: "CONVITE",
      pregao: "PREGÃO",
      dispensa: "DISPENSA",
      inexigibilidade: "INEXIGIBILIDADE",
    };
    return formatos[modalidade] || modalidade.toUpperCase();
  };

  const filteredProjs = React.useMemo(() => {
    let filtered = searchResults;

    // Para usuários com permissões granulares: SEMPRE filtrar apenas seus projetos
    // Para Admin ou usuários sem granular (acesso total): filtrar apenas se filtroMeus = true
    const deveFiltraPorResponsavel =
      (perfil !== "Admin" && temPermissoesGranulares) || (filtroMeus && perfil !== "Admin");

    if (deveFiltraPorResponsavel && user) {
      // Projeto usa responsaveis_emails (array de emails), não IDs
      filtered = filtered.filter((proj) => {
        try {
          const emails = safeParseJSON(proj.responsaveis_emails, []);
          return emails.includes(user.email);
        } catch {
          return false;
        }
      });
    }

    // Filtrar projetos não arquivados
    filtered = filtered.filter((proj) => !proj.arquivado);

    if (filterStatus !== "all") {
      filtered = filtered.filter((proj) => proj.status_id === filterStatus);
    }

    // Aplicar ordenação
    filtered.sort((a, b) => {
      let aVal, bVal;

      if (
        sortConfig.field === "created_date" ||
        sortConfig.field === "data_fechamento_prevista" ||
        sortConfig.field === "licitacao_data"
      ) {
        aVal = a[sortConfig.field] ? new Date(a[sortConfig.field]).getTime() : 0;
        bVal = b[sortConfig.field] ? new Date(b[sortConfig.field]).getTime() : 0;
      } else if (sortConfig.field === "valor_estimado") {
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

    return filtered;
  }, [
    searchResults,
    filterStatus,
    sortConfig,
    filtroMeus,
    perfil,
    temPermissoesGranulares,
    user,
    usuariosEmpresa,
  ]);

  if (!empresaAtiva) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Projetos</h1>
          <p className="text-slate-500">Gerencie seus projetos em andamento</p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Ações
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleExport} className="gap-2">
                <Download className="w-4 h-4" />
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleBaixarModeloProjetos} className="gap-2">
                <Download className="w-4 h-4" />
                Baixar Modelo
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => fileInputProjetosRef.current?.click()}
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                Importar Excel
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowStatusConfig(true)} className="gap-2">
                <Settings className="w-4 h-4" />
                Gerenciar Status e Origens
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInputProjetosRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportarProjetos}
            className="hidden"
          />

          {(perfil === "Admin" || temPermissao("Projetos", "Lista", "criar")) && (
            <Button
              onClick={() => handleOpenModal()}
              className="bg-amber-500 hover:bg-amber-600"
              size="icon"
            >
              <Plus className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <BuscaAvancada
            projetos={projetos}
            onResultsChange={(results, term) => {
              setSearchResults(results);
              setSearchTerm(term);
            }}
            statusList={statusList}
            usuarios={usuariosEmpresa}
          />
        </div>
        <Button
          variant={filtroMeus && perfil !== "Admin" ? "default" : "outline"}
          size="sm"
          onClick={() => setFiltroMeus(!filtroMeus)}
          className="gap-2"
          title={
            perfil === "Admin"
              ? "Admins veem tudo"
              : temPermissoesGranulares
                ? "Você só pode ver seus projetos"
                : ""
          }
          disabled={perfil === "Admin" || temPermissoesGranulares}
        >
          <UserIcon className="w-4 h-4" />
          {filtroMeus || temPermissoesGranulares ? "Meus" : "Todos"}
        </Button>
        <SortButton
          sortOptions={[
            { label: "Data de Criação", value: "created_date", defaultDirection: "desc" },
            { label: "Nome", value: "nome", defaultDirection: "asc" },
            { label: "Valor", value: "valor_estimado", defaultDirection: "desc" },
            { label: "Cliente", value: "cliente_nome", defaultDirection: "asc" },
            { label: "Data Licitação", value: "licitacao_data", defaultDirection: "desc" },
          ]}
          currentSort={sortConfig}
          onSortChange={setSortConfig}
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {statusList.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "kanban" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("kanban")}
          >
            Kanban
          </Button>
          <Button
            variant={viewMode === "lista" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("lista")}
          >
            Lista
          </Button>
          <Button
            variant={viewMode === "relatorios" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("relatorios")}
          >
            Relatórios
          </Button>
        </div>
      </div>

      {viewMode === "kanban" && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className={`flex gap-4 pb-4 ${filterStatus === "all" ? "overflow-x-auto" : ""}`}>
            {statusList
              .filter((status) => filterStatus === "all" || status.id === filterStatus)
              .map((status) => {
                const projsStatus = filteredProjs.filter((p) => p.status_id === status.id);
                const totalValor = projsStatus.reduce((s, p) => s + (p.valor_estimado || 0), 0);

                return (
                  <div
                    key={status.id}
                    className={filterStatus === "all" ? "flex-shrink-0 w-80" : "w-full"}
                  >
                    <div
                      className="rounded-t-lg px-4 py-3 flex items-center justify-between"
                      style={{
                        backgroundColor: status.cor + "20",
                        borderLeft: `4px solid ${status.cor}`,
                      }}
                    >
                      <div>
                        <h3 className="font-semibold text-slate-800">{status.nome}</h3>
                        <p className="text-xs text-slate-500">
                          {projsStatus.length} projetos{" "}
                          {podeVerValores && `• ${formatCurrency(totalValor)}`}
                        </p>
                      </div>
                    </div>
                    <Droppable droppableId={status.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`bg-slate-100 rounded-b-lg p-2 min-h-[400px] space-y-2 transition-colors ${
                            snapshot.isDraggingOver ? "bg-slate-200" : ""
                          }`}
                        >
                          {projsStatus.map((proj, index) => (
                            <Draggable key={proj.id} draggableId={proj.id} index={index}>
                              {(providedDrag, snapshotDrag) => (
                                <div
                                  ref={providedDrag.innerRef}
                                  {...providedDrag.draggableProps}
                                  {...providedDrag.dragHandleProps}
                                >
                                  <Card
                                    className={`cursor-pointer hover:shadow-md transition-all ${
                                      snapshotDrag.isDragging ? "shadow-2xl rotate-2 scale-105" : ""
                                    }`}
                                    onClick={() => handleOpenDetail(proj)}
                                  >
                                    <CardContent className="p-4">
                                      <h4 className="font-medium text-slate-800 mb-2 line-clamp-2">
                                        {proj.nome}
                                      </h4>

                                      {podeVerValores && (
                                        <div className="text-lg font-bold text-green-600 mb-2">
                                          {formatCurrency(proj.valor_estimado)}
                                        </div>
                                      )}

                                      {proj.licitacao_modalidade && (
                                        <p className="text-xs text-blue-700 font-semibold mb-1">
                                          {formatModalidade(proj.licitacao_modalidade)}
                                        </p>
                                      )}

                                      {proj.licitacao_data && (
                                        <p className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                                          <Calendar className="w-3 h-3" />
                                          {new Date(proj.licitacao_data).toLocaleDateString(
                                            "pt-BR"
                                          )}
                                          {proj.licitacao_horario &&
                                            ` às ${proj.licitacao_horario}`}
                                        </p>
                                      )}

                                      <div className="mb-3">
                                        {(() => {
                                          const emails = (() => {
                                            try {
                                              return safeParseJSON(proj.responsaveis_emails, []);
                                            } catch {
                                              return [];
                                            }
                                          })();
                                          return (
                                            <ResponsaveisSelect
                                              responsaveisEmails={emails}
                                              usuarios={usuariosEmpresa}
                                              onUpdate={async (newEmails) => {
                                                setProjetos((prev) =>
                                                  prev.map((p) =>
                                                    p.id === proj.id
                                                      ? {
                                                          ...p,
                                                          responsaveis_emails:
                                                            JSON.stringify(newEmails),
                                                        }
                                                      : p
                                                  )
                                                );
                                                await sigo.entities.Projeto.update(proj.id, {
                                                  responsaveis_emails: JSON.stringify(newEmails),
                                                });
                                              }}
                                            />
                                          );
                                        })()}
                                      </div>

                                      <div className="mt-3 pt-3 border-t">
                                        <EntityActions
                                          entity={proj}
                                          onCopy={(p) =>
                                            handleOpenModal({ ...p, nome: p.nome + " (cópia)" })
                                          }
                                          onArchive={handleArchive}
                                          onDelete={
                                            perfil === "Admin" ||
                                            temPermissao("Projetos", "Lista", "excluir")
                                              ? handleDelete
                                              : undefined
                                          }
                                        />
                                      </div>
                                    </CardContent>
                                  </Card>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
          </div>
        </DragDropContext>
      )}

      {viewMode === "relatorios" && (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-800 mb-2">Relatórios</h3>
            <p className="text-slate-500">Funcionalidade de relatórios em desenvolvimento</p>
          </CardContent>
        </Card>
      )}

      {viewMode === "lista" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b group">
                <tr>
                  <SortableTableHeader
                    field="nome"
                    label="Título"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="valor_estimado"
                    label="Valor"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                    align="right"
                  />
                  <SortableTableHeader
                    field="licitacao_modalidade"
                    label="Modalidade"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="licitacao_data"
                    label="Data Licitação"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">
                    Responsáveis
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjs.map((proj) => {
                  const status = statusList.find((s) => s.id === proj.status_id);
                  return (
                    <tr
                      key={proj.id}
                      className="border-b hover:bg-slate-50 cursor-pointer"
                      onClick={() => handleOpenDetail(proj)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{proj.nome}</p>
                      </td>
                      <td className="px-4 py-3 font-medium text-green-600">
                        {podeVerValores ? formatCurrency(proj.valor_estimado) : "-"}
                      </td>
                      <td className="px-4 py-3 text-blue-700 font-semibold text-sm">
                        {proj.licitacao_modalidade
                          ? formatModalidade(proj.licitacao_modalidade)
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {proj.licitacao_data ? (
                          <div className="flex items-center gap-1 text-xs">
                            <Calendar className="w-3 h-3" />
                            {new Date(proj.licitacao_data).toLocaleDateString("pt-BR")}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const emails = (() => {
                            try {
                              return safeParseJSON(proj.responsaveis_emails, []);
                            } catch {
                              return [];
                            }
                          })();
                          return (
                            <ResponsaveisSelect
                              responsaveisEmails={emails}
                              usuarios={usuariosEmpresa}
                              onUpdate={async (newEmails) => {
                                setProjetos((prev) =>
                                  prev.map((p) =>
                                    p.id === proj.id
                                      ? { ...p, responsaveis_emails: JSON.stringify(newEmails) }
                                      : p
                                  )
                                );
                                await sigo.entities.Projeto.update(proj.id, {
                                  responsaveis_emails: JSON.stringify(newEmails),
                                });
                              }}
                            />
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <EntityActions
                          entity={proj}
                          onCopy={(p) => handleOpenModal({ ...p, nome: p.nome + " (cópia)" })}
                          onArchive={handleArchive}
                          onDelete={
                            perfil === "Admin" || temPermissao("Projetos", "Lista", "excluir")
                              ? handleDelete
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={showDetail} onOpenChange={setShowDetail}>
        <SheetContent
          side="right"
          className="h-full overflow-y-auto p-0 flex flex-col"
          data-fullscreen-modal
        >
          {selectedProj && (
            <>
              <SheetHeader>
                <ProjetoDetailHeader
                  selectedProj={selectedProj}
                  statusList={statusList}
                  usuariosEmpresa={usuariosEmpresa}
                  perfil={perfil}
                  temPermissao={temPermissao}
                  onClose={() => setShowDetail(false)}
                  onEdit={() => {
                    setShowDetail(false);
                    handleOpenModal(selectedProj);
                  }}
                  onClienteView={() => setShowClienteView(true)}
                  onSalvarTemplate={() => setShowSalvarTemplate(true)}
                  onDuplicar={() => {
                    handleOpenModal({ ...selectedProj, nome: selectedProj.nome + " (cópia)" });
                    setShowDetail(false);
                  }}
                  onStatusConfig={() => setShowStatusConfig(true)}
                  onArchive={handleArchive}
                  onDelete={(proj) => {
                    handleDelete(proj);
                    setShowDetail(false);
                  }}
                  setSelectedProj={setSelectedProj}
                  setProjetos={setProjetos}
                />
              </SheetHeader>

              <div className="p-6 flex-1 overflow-y-auto">
                <Tabs defaultValue={getDefaultTab()} className="mt-6">
                  <div className="overflow-x-auto -mx-6 px-6 pb-1">
                    <TabsList className="flex flex-nowrap gap-1 h-auto bg-slate-100 p-1 w-max min-w-full">
                      {(perfil === "Admin" || temPermissao("Projetos", "Lista")) && (
                        <TabsTrigger value="geral" className="flex-shrink-0 text-xs sm:text-sm">
                          Geral
                        </TabsTrigger>
                      )}
                      {(perfil === "Admin" || temPermissao("Projetos", "Orçamento")) && (
                        <TabsTrigger value="orcamento" className="flex-shrink-0 text-xs sm:text-sm">
                          Orçamento
                        </TabsTrigger>
                      )}
                      {(perfil === "Admin" || temPermissao("Projetos", "Cronograma")) && (
                        <TabsTrigger value="obra" className="flex-shrink-0 text-xs sm:text-sm">
                          Cronograma
                        </TabsTrigger>
                      )}
                      {(perfil === "Admin" || temPermissao("Projetos", "Financeiro")) && (
                        <TabsTrigger
                          value="financeiro"
                          className="flex-shrink-0 text-xs sm:text-sm"
                        >
                          Financeiro
                        </TabsTrigger>
                      )}
                      {(perfil === "Admin" || temPermissao("Projetos", "Financeiro")) && (
                        <TabsTrigger value="medicoes" className="flex-shrink-0 text-xs sm:text-sm">
                          Medições
                        </TabsTrigger>
                      )}
                      {(perfil === "Admin" || temPermissao("Projetos", "Diário de Obra")) && (
                        <TabsTrigger value="diario" className="flex-shrink-0 text-xs sm:text-sm">
                          Diário de Obra
                        </TabsTrigger>
                      )}
                      {(perfil === "Admin" || temPermissao("Projetos", "Arquivos")) && (
                        <TabsTrigger value="arquivos" className="flex-shrink-0 text-xs sm:text-sm">
                          Arquivos
                        </TabsTrigger>
                      )}
                      {(perfil === "Admin" || temPermissao("Projetos", "Anotações")) && (
                        <TabsTrigger value="anotacoes" className="flex-shrink-0 text-xs sm:text-sm">
                          Anotações
                        </TabsTrigger>
                      )}
                      {(perfil === "Admin" || temPermissao("Projetos", "Chat")) && (
                        <TabsTrigger value="chat" className="flex-shrink-0 text-xs sm:text-sm">
                          Chat
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </div>

                  <TabsContent value="geral" className="space-y-4 mt-4">
                    <IniciarFluxoButton
                      entidadeAlvo="projeto"
                      registroId={selectedProj.id}
                      empresaAtiva={empresaAtiva}
                      user={user}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-500">Nome do Projeto</Label>
                        <p className="font-medium text-slate-800 mt-1">{selectedProj.nome}</p>
                      </div>
                      <div>
                        <Label className="text-slate-500">Cliente</Label>
                        <p className="font-medium text-slate-800 mt-1">
                          {selectedProj.cliente_nome || "-"}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-slate-500">Valor Estimado</Label>
                        <p className="text-lg font-bold text-green-600 mt-1">
                          {formatCurrency(selectedProj.valor_estimado)}
                        </p>
                      </div>
                      <div>
                        <Label className="text-slate-500">Status</Label>
                        <Badge
                          style={{
                            backgroundColor: statusList.find((s) => s.id === selectedProj.status_id)
                              ?.cor,
                          }}
                          className="mt-1"
                        >
                          {selectedProj.status_nome}
                        </Badge>
                      </div>
                      <div>
                        <Label className="text-slate-500">Origem</Label>
                        <p className="font-medium text-slate-800 mt-1">
                          {selectedProj.origem_nome || "-"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <Label className="text-slate-500">Responsáveis</Label>
                      <div className="flex -space-x-2 mt-2">
                        {(() => {
                          try {
                            const emails = safeParseJSON(selectedProj.responsaveis_emails, []);
                            return emails.map((email, idx) => {
                              const resp = usuariosEmpresa.find((u) => u.usuario_email === email);
                              const label = resp?.nome_completo || email;
                              return (
                                <div
                                  key={email}
                                  className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-sm font-bold text-white border-2 border-white"
                                  style={{ zIndex: emails.length - idx }}
                                  title={label}
                                >
                                  {email?.substring(0, 2).toUpperCase()}
                                </div>
                              );
                            });
                          } catch {
                            return null;
                          }
                        })()}
                      </div>
                    </div>

                    {(selectedProj.licitacao_modalidade || selectedProj.licitacao_data) && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-slate-700 mb-3">Dados da Licitação</h4>
                        <div className="grid grid-cols-3 gap-4">
                          {selectedProj.licitacao_modalidade && (
                            <div>
                              <Label className="text-slate-500">Modalidade</Label>
                              <p className="font-medium text-blue-700 mt-1">
                                {formatModalidade(selectedProj.licitacao_modalidade)}
                              </p>
                            </div>
                          )}
                          {selectedProj.licitacao_data && (
                            <div>
                              <Label className="text-slate-500">Data da Licitação</Label>
                              <p className="font-medium text-slate-800 mt-1">
                                {new Date(selectedProj.licitacao_data).toLocaleDateString("pt-BR")}
                              </p>
                            </div>
                          )}
                          {selectedProj.licitacao_horario && (
                            <div>
                              <Label className="text-slate-500">Horário</Label>
                              <p className="font-medium text-slate-800 mt-1">
                                {selectedProj.licitacao_horario}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="border-t pt-4">
                      <h4 className="font-medium text-slate-700 mb-3">Local do Projeto</h4>
                      <div className="space-y-4">
                        {selectedProj.cep || selectedProj.endereco || selectedProj.numero ? (
                          <>
                            <div className="grid grid-cols-3 gap-4">
                              {selectedProj.cep && (
                                <div>
                                  <Label className="text-slate-500">CEP</Label>
                                  <p className="font-medium text-slate-800 mt-1">
                                    {selectedProj.cep}
                                  </p>
                                </div>
                              )}
                              {selectedProj.endereco && (
                                <div className="col-span-2">
                                  <Label className="text-slate-500">Endereço</Label>
                                  <p className="font-medium text-slate-800 mt-1">
                                    {selectedProj.endereco}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                              {selectedProj.numero && (
                                <div>
                                  <Label className="text-slate-500">Número</Label>
                                  <p className="font-medium text-slate-800 mt-1">
                                    {selectedProj.numero}
                                  </p>
                                </div>
                              )}
                              {selectedProj.complemento && (
                                <div className="col-span-2">
                                  <Label className="text-slate-500">Complemento</Label>
                                  <p className="font-medium text-slate-800 mt-1">
                                    {selectedProj.complemento}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                              {selectedProj.bairro && (
                                <div>
                                  <Label className="text-slate-500">Bairro</Label>
                                  <p className="font-medium text-slate-800 mt-1">
                                    {selectedProj.bairro}
                                  </p>
                                </div>
                              )}
                              {selectedProj.cidade && (
                                <div>
                                  <Label className="text-slate-500">Cidade</Label>
                                  <p className="font-medium text-slate-800 mt-1">
                                    {selectedProj.cidade}
                                  </p>
                                </div>
                              )}
                              {selectedProj.estado && (
                                <div>
                                  <Label className="text-slate-500">Estado</Label>
                                  <p className="font-medium text-slate-800 mt-1">
                                    {selectedProj.estado}
                                  </p>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-slate-500 text-sm">Nenhum endereço cadastrado</p>
                        )}
                      </div>
                    </div>

                    {selectedProj.descricao && (
                      <div className="border-t pt-4">
                        <Label className="text-slate-500">Descrição</Label>
                        <div className="mt-2 p-4 bg-slate-50 rounded-lg">
                          <p className="text-slate-700 whitespace-pre-wrap">
                            {selectedProj.descricao}
                          </p>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="orcamento" className="mt-4">
                    <OrcamentoTab
                      selectedProj={selectedProj}
                      orcamentoItens={orcamentoItens}
                      setOrcamentoItens={setOrcamentoItens}
                      materiais={materiais}
                      empresaAtiva={empresaAtiva}
                      user={user}
                      templates={templates}
                      loadOrcamentoData={loadOrcamentoData}
                      formatCurrency={formatCurrency}
                      onShowStatusConfig={() => setShowStatusConfig(true)}
                      onCreateSolicitacao={(itensOrc) => {
                        // Exige seleção explícita (decisão UX: "só itens marcados").
                        if (!itensOrc || itensOrc.length === 0) {
                          alert(
                            "Marque ao menos 1 item do orçamento (checkbox) antes de solicitar compra."
                          );
                          return;
                        }
                        // Salva rascunho em sessionStorage + navega pro modulo Compras
                        // que vai detectar o draft e abrir o SolicitacaoModal já preenchido.
                        // Isso unifica os 3 pontos de entrada (Compras/Estoque/Orcamento)
                        // num só modal, sem duplicar lógica entre páginas.
                        // preco_unitario_estimado: alimenta o trigger da migration 0028
                        // que recalcula valor_total_estimado e a regra de aprovação.
                        salvarDraftSC({
                          origem: "Orcamento",
                          projeto_id: selectedProj.id,
                          projeto_nome: selectedProj.nome,
                          prioridade: "Normal",
                          observacoes: `Solicitação a partir do orçamento do projeto ${selectedProj.nome}`,
                          itens: itensOrc.map((item) => ({
                            material_id: item.material_id || undefined,
                            material_codigo: item.codigo || item.material_codigo || undefined,
                            descricao: item.descricao,
                            quantidade: item.quantidade,
                            unidade: item.unidade || "UN",
                            preco_unitario_estimado: item.valor_unitario || 0,
                            especificacoes: `Código: ${item.codigo || "-"} | Valor Ref: R$ ${
                              item.valor_unitario?.toFixed(2) || "0.00"
                            }`,
                          })),
                        });
                        navigate(createPageUrl("Compras"));
                      }}
                      onCriarMaterial={(nome, item) => {
                        setNovoMaterialForm({
                          nome,
                          codigo: "",
                          unidade: "UN",
                          preco_referencia: 0,
                        });
                        setEditingItemId(item.id);
                        setShowCriarMaterial(true);
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="obra" className="space-y-4 mt-4">
                    <DiarioObraTab
                      projetoId={selectedProj.id}
                      empresaAtiva={empresaAtiva}
                      usuariosEmpresa={usuariosEmpresa}
                      showOnlyTasks={true}
                      projeto={selectedProj}
                    />
                  </TabsContent>

                  <TabsContent value="financeiro" className="mt-4">
                    <FinanceiroTab
                      projetoId={selectedProj.id}
                      empresaAtiva={empresaAtiva}
                      orcamentoItens={orcamentoItens}
                      temPermissao={temPermissao}
                      perfil={perfil}
                    />
                  </TabsContent>

                  <TabsContent value="medicoes" className="mt-4">
                    <MedicoesTab
                      projeto={selectedProj}
                      empresaAtiva={empresaAtiva}
                      podeEditar={perfil === "Admin" || temPermissao("Projetos", "Financeiro")}
                    />
                  </TabsContent>

                  <TabsContent value="diario" className="mt-4">
                    <DiarioObraTab
                      projetoId={selectedProj.id}
                      empresaAtiva={empresaAtiva}
                      usuariosEmpresa={usuariosEmpresa}
                      showOnlyDiary={true}
                      projeto={selectedProj}
                    />
                  </TabsContent>

                  <TabsContent value="arquivos" className="mt-4">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-slate-800">Arquivos</h3>
                        <div>
                          <input
                            type="file"
                            className="hidden"
                            id="upload-arquivo-projeto"
                            onChange={handleUploadFile}
                          />
                          <Button
                            onClick={() =>
                              document.getElementById("upload-arquivo-projeto").click()
                            }
                            className="gap-2"
                          >
                            <Upload className="w-4 h-4" />
                            {uploadingFile ? "Enviando..." : "Upload Arquivo"}
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {arquivos.map((arquivo) => (
                          <div
                            key={arquivo.id}
                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                <FileText className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-medium text-slate-800">{arquivo.nome}</p>
                                <p className="text-xs text-slate-500">
                                  {new Date(arquivo.created_date).toLocaleDateString("pt-BR")} •{" "}
                                  {arquivo.usuario_nome}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleViewFile(arquivo)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(arquivo.url, "_blank")}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteArquivo(arquivo.id)}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {arquivos.length === 0 && (
                        <div className="text-center py-12 text-slate-500">
                          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>Nenhum arquivo anexado</p>
                        </div>
                      )}
                    </div>

                    <AnexoViewer
                      anexo={arquivoPreview}
                      open={showPreviewArquivo}
                      onOpenChange={setShowPreviewArquivo}
                    />
                  </TabsContent>

                  <TabsContent value="anotacoes" className="mt-4">
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Textarea
                          value={novaNota}
                          onChange={(e) => setNovaNota(e.target.value)}
                          placeholder="Adicionar nova anotação..."
                          rows={3}
                        />
                        <Button
                          onClick={handleAddNota}
                          disabled={!novaNota.trim()}
                          className="shrink-0"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {atualizacoes
                          .filter((a) => a.tipo === "Nota")
                          .map((nota) => (
                            <Card key={nota.id} className="bg-yellow-50 border-yellow-200">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="text-slate-800 whitespace-pre-wrap">
                                      {nota.descricao}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-2">
                                      {nota.usuario_nome} •{" "}
                                      {new Date(nota.created_date).toLocaleDateString("pt-BR")} às{" "}
                                      {new Date(nota.created_date).toLocaleTimeString("pt-BR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                      </div>

                      {atualizacoes.filter((a) => a.tipo === "Nota").length === 0 && (
                        <div className="text-center py-12 text-slate-500">
                          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>Nenhuma anotação criada</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="chat" className="mt-4">
                    <ChatContextual
                      tipo="Projeto"
                      contextoId={selectedProj.id}
                      contextoNome={selectedProj.nome}
                      empresaAtiva={empresaAtiva}
                      user={user}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ProjetoFormSheet
        open={showModal}
        onOpenChange={(open) => {
          setShowModal(open);
          if (!open && selectedProj) setShowDetail(true);
        }}
        selectedProj={selectedProj}
        statusList={statusList}
        origensList={origensList}
        clientes={clientes}
        templates={templates}
        usuariosEmpresa={usuariosEmpresa}
        empresaAtiva={empresaAtiva}
        user={user}
        onSaved={(projAtualizado, isEdit) => {
          if (isEdit) {
            setProjetos((prev) =>
              prev.map((p) => (p.id === projAtualizado.id ? projAtualizado : p))
            );
            setSelectedProj(projAtualizado);
            setShowModal(false);
            setShowDetail(true);
          } else {
            setShowModal(false);
          }
          loadData();
        }}
      />

      <SolicitacaoModal
        open={showSolicitacaoCompra}
        onOpenChange={setShowSolicitacaoCompra}
        form={solicitacaoCompraForm}
        setForm={setSolicitacaoCompraForm}
        empresaAtiva={empresaAtiva}
        onSave={async () => {
          const itensValidos = solicitacaoCompraForm.itens.filter((i) => i.descricao);
          if (itensValidos.length === 0) {
            alert("Adicione pelo menos um item");
            return;
          }
          if (savingSolicitacao) return;
          setSavingSolicitacao(true);

          try {
            const novaSol = await sigo.entities.SolicitacaoCompra.create({
              empresa_id: empresaAtiva.id,
              numero: `SC${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
              projeto_id: solicitacaoCompraForm.projeto_id || null,
              projeto_nome: solicitacaoCompraForm.projeto_nome || null,
              oportunidade_id: solicitacaoCompraForm.oportunidade_id || null,
              oportunidade_nome: solicitacaoCompraForm.oportunidade_nome || null,
              solicitante_id: user?.id,
              solicitante_nome: user?.full_name,
              solicitante_email: user?.email,
              status: "Pendente Aprovação",
              prioridade: solicitacaoCompraForm.prioridade,
              origem: solicitacaoCompraForm.origem || "Orcamento",
              data_necessidade: solicitacaoCompraForm.data_necessidade || null,
              observacoes: solicitacaoCompraForm.observacoes,
              total_itens: itensValidos.length,
            });

            // Criar itens em lotes de 5 para evitar rate limit
            for (let i = 0; i < itensValidos.length; i += 5) {
              const lote = itensValidos.slice(i, i + 5);
              await Promise.all(
                lote.map((item) =>
                  sigo.entities.SolicitacaoCompraItem.create({
                    empresa_id: empresaAtiva.id,
                    solicitacao_id: novaSol.id,
                    descricao: item.descricao,
                    quantidade: item.quantidade,
                    unidade: item.unidade,
                    especificacoes: item.especificacoes || "",
                  })
                )
              );
              if (i + 5 < itensValidos.length) {
                await new Promise((r) => setTimeout(r, 300));
              }
            }

            await sigo.entities.AprovacaoSolicitacao.create({
              solicitacao_id: novaSol.id,
              nivel_aprovacao_id: "default",
              nivel_nome: "Aprovação",
              nivel_ordem: 1,
              status: "Pendente",
              empresa_id: empresaAtiva.id,
            });

            setShowSolicitacaoCompra(false);
            alert("Solicitação de compra criada com sucesso!");
          } catch (error) {
            console.error("Erro:", error);
            alert("Erro ao criar solicitação");
          } finally {
            setSavingSolicitacao(false);
          }
        }}
        saving={savingSolicitacao}
        projetos={projetos}
        oportunidades={[]}
      />

      <Dialog open={showClienteView} onOpenChange={setShowClienteView}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] p-0">
          <PortalClienteEmbed projetoId={selectedProj?.id} empresaAtiva={empresaAtiva} />
        </DialogContent>
      </Dialog>

      <CriarMaterialModal
        open={showCriarMaterial}
        onOpenChange={setShowCriarMaterial}
        empresaAtiva={empresaAtiva}
        nomeInicial={novoMaterialForm.nome}
        onMaterialCriado={async (novoMat) => {
          if (editingItemId) {
            const item = orcamentoItens.find((i) => i.id === editingItemId);
            if (item) {
              const updatedItem = {
                ...item,
                descricao: novoMat.nome,
                codigo: novoMat.codigo || "",
                unidade: novoMat.unidade || "UN",
                valor_unitario: novoMat.preco || 0,
              };
              setOrcamentoItens((prev) => prev.map((i) => (i.id === item.id ? updatedItem : i)));
              await sigo.entities.OrcamentoItem.update(item.id, {
                descricao: novoMat.nome,
                codigo: novoMat.codigo || "",
                unidade: novoMat.unidade || "UN",
                valor_unitario: novoMat.preco || 0,
              });
            }
          }
          await loadOrcamentoData(selectedProj.id);
          setNovoMaterialForm({ nome: "", codigo: "", unidade: "UN", preco_referencia: 0 });
        }}
      />

      <StatusOrigensSheet
        open={showStatusConfig}
        onOpenChange={setShowStatusConfig}
        statusList={statusList}
        origensList={origensList}
        empresaAtiva={empresaAtiva}
        onReload={loadData}
      />
    </div>
  );
}
