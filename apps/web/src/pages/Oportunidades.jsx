import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../Layout";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { Plus, Edit, Trash2, Calendar, User, X, FileText, Copy, Archive } from "lucide-react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import EtapaModal from "../components/oportunidades/EtapaModal";
import BuscaAvancada from "../components/oportunidades/BuscaAvancada";
import ResponsaveisSelect from "../components/shared/ResponsaveisSelect.jsx";
import EntityActions from "../components/shared/EntityActions";
import RelatorioOportunidades from "../components/oportunidades/RelatorioOportunidades";
import RelatoriosOrcamento from "../components/oportunidades/RelatoriosOrcamento";
import SortButton from "../components/shared/SortButton";
import SortableTableHeader from "../components/shared/SortableTableHeader";
import PortalClienteEmbed from "../components/cliente/PortalClienteEmbed";
import PermissionGate from "../components/PermissionGate";
import CalendarioOportunidades from "../components/oportunidades/CalendarioOportunidades";
import CriarMaterialModal from "../components/materiais/CriarMaterialModal";
import NovoClienteModal from "../components/clientes/NovoClienteModal";
import OportunidadesHeader from "../components/oportunidades/OportunidadesHeader";
import FormularioOportunidade from "../components/oportunidades/FormularioOportunidade";
import OportunidadeDetalhe from "../components/oportunidades/OportunidadeDetalhe";

export default function Oportunidades() {
  const { empresaAtiva, perfil, user, temPermissao, vinculo } = useEmpresa();

  const permissoes = React.useMemo(() => {
    try {
      return vinculo?.permissoes ? JSON.parse(vinculo.permissoes) : {};
    } catch {
      return {};
    }
  }, [vinculo?.permissoes]);

  const temPermissoesGranulares = Object.keys(permissoes).length > 0;
  const podeVerValores = perfil === "Admin" || !temPermissoesGranulares;
  const navigate = useNavigate();

  const [oportunidades, setOportunidades] = useState([]);
  const [statusList, setStatusList] = useState([]);
  const [origensList, setOrigensList] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [usuariosEmpresa, setUsuariosEmpresa] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showArquivados, setShowArquivados] = useState(false);
  const [filtroMeus, setFiltroMeus] = useState(true);
  const [sortConfig, setSortConfig] = useState({ field: "created_date", direction: "desc" });
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showStatusConfig, setShowStatusConfig] = useState(false);
  const [selectedOp, setSelectedOp] = useState(null);
  const [viewMode, setViewMode] = useState("kanban");
  const [statusForm, setStatusForm] = useState({
    nome: "",
    cor: "#3B82F6",
    ordem: 0,
    tipo: "aberto",
  });
  const [editingStatus, setEditingStatus] = useState(null);
  const [formData, setFormData] = useState({
    titulo: "",
    cliente_id: "",
    status_id: "",
    origem_id: "",
    valor_estimado: "",
    probabilidade: 50,
    data_fechamento_prevista: "",
    descricao: "",
    observacoes: "",
    template_id: "",
    responsaveis_ids: [],
    licitacao_modalidade: "",
    licitacao_data: "",
    licitacao_horario: "",
    cep: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
  });
  const [saving, setSaving] = useState(false);
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [showRelatoriosOrcamento, setShowRelatoriosOrcamento] = useState(false);
  const [filtroTipoOrcamento, setFiltroTipoOrcamento] = useState("all");
  const [showTemplateSelection, setShowTemplateSelection] = useState(false);
  const [templateSearchTerm, setTemplateSearchTerm] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [atualizacoes, setAtualizacoes] = useState([]);
  const [novaNota, setNovaNota] = useState("");
  const [orcamentoItens, setOrcamentoItens] = useState([]);
  const [cronogramaEtapas, setCronogramaEtapas] = useState([]);
  const [arquivos, setArquivos] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [showAddEtapa, setShowAddEtapa] = useState(false);
  const [etapaForm, setEtapaForm] = useState({
    etapa: "",
    descricao: "",
    data_inicio_planejada: "",
    data_fim_planejada: "",
    data_inicio_real: "",
    data_fim_real: "",
    status: "A Fazer",
    prioridade: "Média",
    percentual_conclusao: 0,
    responsavel_id: "",
    responsaveis_ids: [],
    ordem: 0,
  });
  const [uploadingFile, setUploadingFile] = useState(false);
  const [colunasConfig, setColunasConfig] = useState([]);
  const [showSalvarTemplate, setShowSalvarTemplate] = useState(false);
  const [showAplicarTemplate, setShowAplicarTemplate] = useState(false);
  const [nomeTemplate, setNomeTemplate] = useState("");
  const [showCriarMaterial, setShowCriarMaterial] = useState(false);
  const [novoMaterialForm, setNovoMaterialForm] = useState({
    nome: "",
    codigo: "",
    unidade: "UN",
    preco_referencia: 0,
  });
  const [itensSelecionados, setItensSelecionados] = useState(new Set());
  const [showClienteView, setShowClienteView] = useState(false);
  const updateTimeoutRef = React.useRef({});
  const fileInputOrcamentoRef = React.useRef(null);
  const [searchResults, setSearchResults] = useState([]);

  React.useEffect(() => {
    return () => {
      Object.values(updateTimeoutRef.current).forEach((t) => clearTimeout(t));
    };
  }, []);

  // Abrir oportunidade por URL param (?openId=...)
  React.useEffect(() => {
    if (!oportunidades.length) return;
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("openId");
    if (openId) {
      const op = oportunidades.find((o) => o.id === openId);
      if (op) {
        handleOpenDetail(op);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [oportunidades]);

  // Abrir modal de nova oportunidade por URL param (?new=1&licitacao_data=...)
  React.useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      const licitacaoData = params.get("licitacao_data") || "";
      const meuVinculo = usuariosEmpresa.find((u) => u.usuario_email === user?.email);
      setFormData({
        titulo: "",
        cliente_id: "",
        status_id: statusList[0]?.id || "",
        origem_id: "",
        valor_estimado: "",
        probabilidade: 50,
        data_fechamento_prevista: "",
        descricao: "",
        observacoes: "",
        template_id: "",
        responsaveis_ids: meuVinculo ? [meuVinculo.id] : [],
        licitacao_modalidade: "",
        licitacao_data: licitacaoData,
        licitacao_horario: "",
        licitacao_data_impugnacao: "",
        licitacao_data_proposta: "",
        licitacao_horario_proposta: "",
        licitacao_garantia_proposta: false,
        cep: "",
        endereco: "",
        numero: "",
        complemento: "",
        bairro: "",
        cidade: "",
        estado: "",
      });
      setSelectedOp(null);
      setShowTemplateSelection(false);
      setShowModal(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loading, statusList, usuariosEmpresa]);

  const loadData = React.useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const [ops, status, origens, clientesList, templatesList, usuariosList] = await Promise.all([
        sigo.entities.Oportunidade.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.StatusOportunidade.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.OrigemOportunidade.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.Cliente.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.TemplateOportunidade.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.UsuarioEmpresa.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ]);
      setOportunidades(ops.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      setStatusList(status.sort((a, b) => a.ordem - b.ordem));
      setOrigensList(origens);
      setClientes(clientesList);
      setTemplates(templatesList);
      setUsuariosEmpresa(usuariosList);
      // Setar status padrão apenas se formulário ainda não tem status (nova oportunidade)
      if (status.length > 0) {
        setFormData((prev) => (prev.status_id ? prev : { ...prev, status_id: status[0].id }));
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    if (empresaAtiva?.id) loadData();
  }, [loadData, empresaAtiva?.id]);

  // Callback estável para BuscaAvancada não re-renderizar em loop
  const handleSearchResults = React.useCallback((results, term) => {
    setSearchResults(results);
    setSearchTerm(term);
  }, []);

  useEffect(() => {
    setSearchResults(oportunidades);
  }, [oportunidades]);

  const handleMigrarParaProjeto = async (op) => {
    if (!confirm("Migrar esta oportunidade para Projetos?")) return;
    const statusGanho = statusList.find((s) => s.tipo === "ganho");
    await sigo.entities.Oportunidade.update(op.id, {
      arquivado: true,
      status_id: statusGanho?.id || op.status_id,
      status_nome: statusGanho?.nome || op.status_nome,
    });
    // BUG FIX: Projeto usa responsaveis_emails (array de emails), Oportunidade usa responsaveis_ids
    // Converter IDs de responsáveis para emails ao migrar
    let responsaveisEmails = "[]";
    try {
      const ids = JSON.parse(op.responsaveis_ids || "[]");
      const emails = ids
        .map((id) => {
          const vinculo = usuariosEmpresa.find((u) => u.id === id);
          return vinculo?.usuario_email || null;
        })
        .filter(Boolean);
      responsaveisEmails = JSON.stringify(emails);
    } catch {}
    const novoProjeto = await sigo.entities.Projeto.create({
      empresa_id: op.empresa_id,
      nome: op.nome || op.titulo,
      cliente_id: op.cliente_id,
      cliente_nome: op.cliente_nome,
      valor_estimado: op.valor_estimado,
      responsaveis_emails: responsaveisEmails,
      oportunidade_origem_id: op.id,
      endereco: op.endereco,
      cidade: op.cidade,
      estado: op.estado,
      cep: op.cep,
      status_id: statusGanho?.id || null,
      status_nome: statusGanho?.nome || null,
    });
    const [itensOrcamento, etapas, arquivosOp, atualizacoesOp] = await Promise.all([
      sigo.entities.OrcamentoItem.filter({ oportunidade_id: op.id }),
      sigo.entities.CronogramaEtapa.filter({ oportunidade_id: op.id }),
      sigo.entities.ArquivoOportunidade.filter({ oportunidade_id: op.id }),
      sigo.entities.OportunidadeAtualizacao.filter({ oportunidade_id: op.id }),
    ]);
    await Promise.all([
      ...itensOrcamento.map((item) =>
        sigo.entities.OrcamentoItem.update(item.id, {
          projeto_id: novoProjeto.id,
          oportunidade_id: null,
        })
      ),
      ...etapas.map((e) =>
        sigo.entities.CronogramaEtapa.update(e.id, {
          projeto_id: novoProjeto.id,
          oportunidade_id: null,
        })
      ),
      ...arquivosOp.map((a) =>
        sigo.entities.ArquivoOportunidade.update(a.id, {
          projeto_id: novoProjeto.id,
          oportunidade_id: null,
        })
      ),
      ...atualizacoesOp.map((a) =>
        sigo.entities.OportunidadeAtualizacao.update(a.id, {
          projeto_id: novoProjeto.id,
          oportunidade_id: null,
        })
      ),
    ]);
    alert("Oportunidade migrada para Projetos!");
    navigate(createPageUrl("Projetos"));
  };

  const loadAtualizacoes = async (opId) => {
    const atualiz = await sigo.entities.OportunidadeAtualizacao.filter({
      empresa_id: empresaAtiva.id,
      oportunidade_id: opId,
    });
    setAtualizacoes(atualiz.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
  };

  const loadOrcamentoData = async (opId) => {
    const [itens, etapas, arqs, cols] = await Promise.all([
      sigo.entities.OrcamentoItem.filter({ empresa_id: empresaAtiva.id, oportunidade_id: opId }),
      sigo.entities.CronogramaEtapa.filter({
        empresa_id: empresaAtiva.id,
        oportunidade_id: opId,
      }),
      sigo.entities.ArquivoOportunidade.filter({
        empresa_id: empresaAtiva.id,
        oportunidade_id: opId,
      }),
      sigo.entities.OrcamentoColunaConfig.filter({ empresa_id: empresaAtiva.id }),
    ]);
    // Usar índice imutavelmente (não modificar objetos originais)
    const sorted = itens
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((item, i) => ({ ...item, item: (i + 1).toString() }));
    setOrcamentoItens(sorted);
    setCronogramaEtapas(etapas.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));
    setArquivos(arqs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    setColunasConfig(cols.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));
    // Carregar materiais em paralelo sem bloquear (apenas para autocomplete)
    if (materiais.length === 0) {
      Promise.all([
        sigo.entities.Material.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.MaoDeObra.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Ferramental.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ])
        .then(([mats, maoObra, ferram]) => {
          setMateriais([
            ...mats.map((m) => ({ ...m, tipo: "Material", nome_item: m.nome })),
            ...maoObra.map((m) => ({ ...m, tipo: "Mão de Obra", nome_item: m.nome })),
            ...ferram.map((f) => ({ ...f, tipo: "Ferramental", nome_item: f.nome })),
          ]);
        })
        .catch((e) => console.warn("Erro ao carregar materiais para autocomplete:", e));
    }
  };

  const handleOpenModal = (op = null) => {
    if (op) {
      setFormData({
        titulo: op.nome || op.titulo || "",
        cliente_id: op.cliente_id || "",
        status_id: op.status_id || "",
        origem_id: op.origem_id || "",
        valor_estimado: op.valor_estimado?.toString() || "",
        probabilidade: op.probabilidade || 50,
        data_fechamento_prevista: op.data_fechamento_prevista || "",
        descricao: op.descricao || "",
        observacoes: op.observacoes || "",
        template_id: "",
        responsaveis_ids: Array.isArray(op.responsaveis_ids)
          ? op.responsaveis_ids
          : (() => {
              try {
                return JSON.parse(op.responsaveis_ids || "[]");
              } catch {
                return [];
              }
            })(),
        licitacao_modalidade: op.licitacao_modalidade || "",
        licitacao_data: op.licitacao_data || "",
        licitacao_horario: op.licitacao_horario || "",
        licitacao_data_impugnacao: op.licitacao_data_impugnacao || "",
        licitacao_data_proposta: op.licitacao_data_proposta || "",
        licitacao_horario_proposta: op.licitacao_horario_proposta || "",
        licitacao_garantia_proposta: op.licitacao_garantia_proposta || false,
        cep: op.cep || "",
        endereco: op.endereco || "",
        numero: op.numero || "",
        complemento: op.complemento || "",
        bairro: op.bairro || "",
        cidade: op.cidade || "",
        estado: op.estado || "",
      });
      setSelectedOp(op);
      setShowTemplateSelection(false);
    } else {
      setFormData({
        titulo: "",
        cliente_id: "",
        status_id: statusList[0]?.id || "",
        origem_id: "",
        valor_estimado: "",
        probabilidade: 50,
        data_fechamento_prevista: "",
        descricao: "",
        observacoes: "",
        template_id: "",
        responsaveis_ids: (() => {
          const meuVinculo = usuariosEmpresa.find((u) => u.usuario_email === user?.email);
          return meuVinculo ? [meuVinculo.id] : [];
        })(),
        licitacao_modalidade: "",
        licitacao_data: "",
        licitacao_horario: "",
        licitacao_data_impugnacao: "",
        licitacao_data_proposta: "",
        licitacao_horario_proposta: "",
        licitacao_garantia_proposta: false,
        cep: "",
        endereco: "",
        numero: "",
        complemento: "",
        bairro: "",
        cidade: "",
        estado: "",
      });
      setSelectedOp(null);
      setShowTemplateSelection(true);
    }
    setShowModal(true);
  };

  const handleOpenDetail = async (op) => {
    // Setar imediatamente sem limpar os dados anteriores (evita flash)
    setSelectedOp(op);
    setShowDetail(true);
    // Carregar dados em background
    Promise.all([loadAtualizacoes(op.id), loadOrcamentoData(op.id)]).catch((error) => {
      console.error("Erro ao carregar detalhe:", error);
    });
  };

  const handleSave = async () => {
    if (!formData.titulo) return;
    setSaving(true);
    try {
      const cliente = clientes.find((c) => c.id === formData.cliente_id);
      const status = statusList.find((s) => s.id === formData.status_id);
      const origem = origensList.find((o) => o.id === formData.origem_id);
      const valorEstimado =
        typeof formData.valor_estimado === "string"
          ? parseFloat(formData.valor_estimado.replace(/\./g, "").replace(/,/g, ".")) || 0
          : parseFloat(formData.valor_estimado) || 0;
      const data = {
        empresa_id: empresaAtiva.id,
        nome: formData.titulo,
        cliente_id: formData.cliente_id || null,
        cliente_nome: cliente?.nome_razao || null,
        status_id: formData.status_id,
        status_nome: status?.nome || null,
        origem_id: formData.origem_id || null,
        origem_nome: origem?.nome || null,
        valor_estimado: valorEstimado,
        probabilidade: formData.probabilidade,
        data_fechamento_prevista: formData.data_fechamento_prevista || null,
        descricao: formData.descricao,
        observacoes: formData.observacoes,
        responsaveis_ids: JSON.stringify(
          Array.isArray(formData.responsaveis_ids)
            ? formData.responsaveis_ids
            : (() => {
                try {
                  return JSON.parse(formData.responsaveis_ids || "[]");
                } catch {
                  return [];
                }
              })()
        ),
        licitacao_modalidade: formData.licitacao_modalidade || null,
        licitacao_data: formData.licitacao_data || null,
        licitacao_horario: formData.licitacao_horario || null,
        licitacao_data_impugnacao: formData.licitacao_data_impugnacao || null,
        licitacao_data_proposta: formData.licitacao_data_proposta || null,
        licitacao_horario_proposta: formData.licitacao_horario_proposta || null,
        licitacao_garantia_proposta: formData.licitacao_garantia_proposta || false,
        cep: formData.cep || null,
        endereco: formData.endereco || null,
        numero: formData.numero || null,
        complemento: formData.complemento || null,
        bairro: formData.bairro || null,
        cidade: formData.cidade || null,
        estado: formData.estado || null,
      };
      if (selectedOp) {
        // Registrar mudança de status se houve
        if (selectedOp.status_id !== formData.status_id) {
          const statusAnterior = statusList.find((s) => s.id === selectedOp.status_id);
          sigo.entities.OportunidadeAtualizacao.create({
            empresa_id: empresaAtiva.id,
            oportunidade_id: selectedOp.id,
            usuario_nome: user?.full_name,
            tipo: "Status",
            descricao: `Status alterado de "${statusAnterior?.nome}" para "${status?.nome}"`,
          }).catch(() => {});
        }
        await sigo.entities.Oportunidade.update(selectedOp.id, data);
        const opAtualizada = { ...selectedOp, ...data, id: selectedOp.id };
        setSelectedOp(opAtualizada);
        setOportunidades((prev) => prev.map((o) => (o.id === selectedOp.id ? opAtualizada : o)));
        setShowModal(false);
        setShowDetail(true);
        loadData(); // reload em background
      } else {
        const novaOp = await sigo.entities.Oportunidade.create(data);
        sigo.entities.OportunidadeAtualizacao.create({
          empresa_id: empresaAtiva.id,
          oportunidade_id: novaOp.id,
          usuario_nome: user?.full_name,
          tipo: "Sistema",
          descricao: "Oportunidade criada",
        }).catch(() => {});
        setShowModal(false);
        await loadData();
      }
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Erro ao salvar oportunidade");
    } finally {
      setSaving(false);
    }
  };

  const handleAddNota = async () => {
    if (!novaNota.trim() || !selectedOp) return;
    const nota = novaNota;
    setNovaNota("");
    await sigo.entities.OportunidadeAtualizacao.create({
      empresa_id: empresaAtiva.id,
      oportunidade_id: selectedOp.id,
      usuario_nome: user?.full_name,
      tipo: "Nota",
      descricao: nota,
    });
    await loadAtualizacoes(selectedOp.id);
  };

  const handleDeleteOrcamentoItem = async (itemId) => {
    if (!confirm("Excluir este item?")) return;
    // Atualização otimista
    setOrcamentoItens((prev) => prev.filter((i) => i.id !== itemId));
    setItensSelecionados((prev) => {
      const n = new Set(prev);
      n.delete(itemId);
      return n;
    });
    sigo.entities.OrcamentoItem.delete(itemId).catch(() => {
      if (selectedOp) loadOrcamentoData(selectedOp.id);
    });
  };

  const handleDeleteSelecionados = async () => {
    if (itensSelecionados.size === 0) return;
    if (!confirm(`Excluir ${itensSelecionados.size} item(ns)?`)) return;
    await Promise.all([...itensSelecionados].map((id) => sigo.entities.OrcamentoItem.delete(id)));
    setItensSelecionados(new Set());
    loadOrcamentoData(selectedOp.id);
  };

  const handleAddEtapa = async () => {
    if (!etapaForm.etapa || !selectedOp) return;
    await sigo.entities.CronogramaEtapa.create({
      empresa_id: empresaAtiva.id,
      oportunidade_id: selectedOp.id,
      etapa: etapaForm.etapa,
      descricao: etapaForm.descricao,
      data_inicio_planejada: etapaForm.data_inicio_planejada || null,
      data_fim_planejada: etapaForm.data_fim_planejada || null,
      status: etapaForm.status,
      prioridade: etapaForm.prioridade,
      percentual_conclusao: parseFloat(etapaForm.percentual_conclusao) || 0,
      ordem: etapaForm.ordem,
      responsaveis_ids: JSON.stringify(etapaForm.responsaveis_ids),
    });
    setEtapaForm({
      etapa: "",
      descricao: "",
      data_inicio_planejada: "",
      data_fim_planejada: "",
      data_inicio_real: "",
      data_fim_real: "",
      status: "A Fazer",
      prioridade: "Média",
      percentual_conclusao: 0,
      responsavel_id: "",
      responsaveis_ids: [],
      ordem: 0,
    });
    setShowAddEtapa(false);
    loadOrcamentoData(selectedOp.id);
  };

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOp) return;
    setUploadingFile(true);
    try {
      const uploadResult = await sigo.integrations.Core.UploadFile({ file });
      const fileUrl = uploadResult.file_url || uploadResult.url || uploadResult;
      let fileType = file.type;
      if (!fileType) {
        const ext = file.name.toLowerCase().split(".").pop();
        const typeMap = {
          pdf: "application/pdf",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
        };
        fileType = typeMap[ext] || "application/octet-stream";
      }
      await sigo.entities.ArquivoOportunidade.create({
        empresa_id: empresaAtiva.id,
        oportunidade_id: selectedOp.id,
        nome: file.name,
        url: fileUrl,
        tipo: fileType,
        tamanho: file.size,
        usuario_nome: user?.full_name || user?.email || "Usuário",
      });
      await loadOrcamentoData(selectedOp.id);
      e.target.value = "";
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      alert("Erro ao fazer upload: " + (error.message || "Erro desconhecido"));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteArquivo = async (arquivoId) => {
    if (!confirm("Excluir este arquivo?")) return;
    await sigo.entities.ArquivoOportunidade.delete(arquivoId);
    loadOrcamentoData(selectedOp.id);
  };

  const handleChangeStatus = async (op, newStatusId) => {
    const statusAnterior = statusList.find((s) => s.id === op.status_id);
    const statusNovo = statusList.find((s) => s.id === newStatusId);
    // Atualização otimista imediata
    setOportunidades((prev) =>
      prev.map((o) =>
        o.id === op.id ? { ...o, status_id: newStatusId, status_nome: statusNovo?.nome } : o
      )
    );
    sigo.entities.Oportunidade.update(op.id, {
      status_id: newStatusId,
      status_nome: statusNovo?.nome,
    }).catch(() => {
      // Reverter em caso de erro
      setOportunidades((prev) =>
        prev.map((o) =>
          o.id === op.id ? { ...o, status_id: op.status_id, status_nome: op.status_nome } : o
        )
      );
    });
    sigo.entities.OportunidadeAtualizacao.create({
      empresa_id: empresaAtiva.id,
      oportunidade_id: op.id,
      usuario_nome: user?.full_name,
      tipo: "Status",
      descricao: `Status alterado de "${statusAnterior?.nome}" para "${statusNovo?.nome}"`,
    }).catch(() => {});
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const op = oportunidades.find((o) => o.id === result.draggableId);
    if (op && op.status_id !== result.destination.droppableId) {
      handleChangeStatus(op, result.destination.droppableId);
    }
  };

  const handleDelete = async (op) => {
    if (!confirm("Excluir esta oportunidade?")) return;
    // Atualização otimista
    setOportunidades((prev) => prev.filter((o) => o.id !== op.id));
    if (selectedOp?.id === op.id) {
      setShowDetail(false);
      setSelectedOp(null);
    }
    sigo.entities.Oportunidade.delete(op.id).catch(() => loadData());
  };

  const handleArquivar = async (op) => {
    const acao = op.arquivado ? "desarquivar" : "arquivar";
    if (!confirm(`Deseja ${acao} esta oportunidade?`)) return;
    const novoArquivado = !op.arquivado;
    // Atualização otimista
    setOportunidades((prev) =>
      prev.map((o) => (o.id === op.id ? { ...o, arquivado: novoArquivado } : o))
    );
    if (selectedOp?.id === op.id) {
      setShowDetail(false);
    }
    sigo.entities.Oportunidade.update(op.id, { arquivado: novoArquivado }).catch(() => loadData());
    sigo.entities.OportunidadeAtualizacao.create({
      empresa_id: empresaAtiva.id,
      oportunidade_id: op.id,
      usuario_nome: user?.full_name,
      tipo: "Sistema",
      descricao: novoArquivado ? "Oportunidade arquivada" : "Oportunidade desarquivada",
    }).catch(() => {});
  };

  const handleApplyTemplate = (templateId) => {
    const template = templates.find((t) => t.id === templateId);
    if (template?.campos_padrao) {
      try {
        const campos = JSON.parse(template.campos_padrao);
        setFormData((prev) => ({ ...prev, ...campos, template_id: templateId }));
      } catch {}
    }
  };

  const handleExport = () => {
    const csv = [
      "Título,Cliente,Status,Valor,Probabilidade,Data Fechamento",
      ...filteredOps.map((op) =>
        [
          op.nome || op.titulo,
          op.cliente_nome || "",
          op.status_nome,
          op.valor_estimado || 0,
          op.probabilidade || 0,
          op.data_fechamento_prevista || "",
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `oportunidades_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleSaveStatus = async () => {
    if (!statusForm.nome) return;
    if (editingStatus) {
      await sigo.entities.StatusOportunidade.update(editingStatus.id, statusForm);
    } else {
      await sigo.entities.StatusOportunidade.create({
        empresa_id: empresaAtiva.id,
        ...statusForm,
      });
    }
    setStatusForm({ nome: "", cor: "#3B82F6", ordem: 0, tipo: "aberto" });
    setEditingStatus(null);
    await loadData();
  };

  const handleDeleteStatus = async (status) => {
    if (!confirm("Excluir este status?")) return;
    setStatusList((prev) => prev.filter((s) => s.id !== status.id));
    sigo.entities.StatusOportunidade.delete(status.id).catch(() => loadData());
  };

  const handleBuscarCep = async (cep) => {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setFormData((prev) => ({
          ...prev,
          endereco: data.logradouro || "",
          bairro: data.bairro || "",
          cidade: data.localidade || "",
          estado: data.uf || "",
        }));
      }
    } catch {
    } finally {
      setBuscandoCep(false);
    }
  };

  const handleCriarOrigem = async (nomeOrigem) => {
    if (!nomeOrigem?.trim()) return;
    const origemCriada = await sigo.entities.OrigemOportunidade.create({
      empresa_id: empresaAtiva.id,
      nome: nomeOrigem,
    });
    await loadData();
    setFormData((prev) => ({ ...prev, origem_id: origemCriada.id }));
  };

  const formatCurrency = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
  const formatModalidade = (m) => {
    if (!m) return "";
    const f = {
      concorrencia: "CONCORRÊNCIA",
      tomada_precos: "TOMADA DE PREÇOS",
      convite: "CONVITE",
      pregao: "PREGÃO",
      dispensa: "DISPENSA",
      inexigibilidade: "INEXIGIBILIDADE",
    };
    return f[m] || m.toUpperCase();
  };

  const handleExportarOrcamentoExcel = () => {
    const headers = [
      "Nº",
      "Descrição",
      "Código",
      "Unid.",
      "Qtd",
      "Vlr Unit.",
      "BDI %",
      "Imp. %",
      "Vlr Total",
    ];
    const rows = orcamentoItens.map((item, i) => [
      i + 1,
      item.descricao || "",
      item.codigo || "",
      item.unidade || "",
      item.quantidade || 0,
      item.valor_unitario || 0,
      item.bdi || 0,
      item.imposto || 0,
      item.valor_total || 0,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => String(c)).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `orcamento_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleExportarOrcamentoPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF("landscape");
    doc.setFontSize(14);
    doc.text(`Orçamento: ${selectedOp?.nome || selectedOp?.titulo || ""}`, 14, 15);
    doc.setFontSize(9);
    let y = 30;
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
    ].forEach((h, i) => {
      doc.text(h, 14 + i * 30, y);
    });
    y += 7;
    orcamentoItens.forEach((item, idx) => {
      if (y > 190) {
        doc.addPage();
        y = 20;
      }
      const row = [
        idx + 1,
        (item.descricao || "").substring(0, 20),
        item.codigo || "-",
        item.unidade || "-",
        item.quantidade || 0,
        `R$${(item.valor_unitario || 0).toFixed(2)}`,
        item.bdi || 0,
        item.imposto || 0,
        `R$${(item.valor_total || 0).toFixed(2)}`,
      ];
      row.forEach((v, i) => doc.text(String(v), 14 + i * 30, y));
      y += 6;
    });
    doc.save(`orcamento_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const handleBaixarModeloOrcamento = () => {
    const csv =
      "Descrição;Código;Unidade;Quantidade;Valor Unitário;BDI %;Imposto %\nExemplo Material;MAT001;UN;10;100,00;25;18";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "modelo_importacao_orcamento.csv";
    link.click();
  };

  const handleImportarOrcamento = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOp) return;
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
        const rows = text
          .split(/\r?\n/)
          .filter((r) => r.trim())
          .slice(1);
        const itens = rows
          .map((row, idx) => {
            const vals = row.split(sep);
            const descricao = vals[0]?.trim();
            if (!descricao) return null;
            const qtd = parseFloat((vals[3] || "0").replace(",", ".")) || 0;
            const vlr = parseFloat((vals[4] || "0").replace(",", ".")) || 0;
            const bdi = parseFloat((vals[5] || "0").replace(",", ".")) || 0;
            const imp = parseFloat((vals[6] || "0").replace(",", ".")) || 0;
            return {
              empresa_id: empresaAtiva.id,
              oportunidade_id: selectedOp.id,
              descricao,
              codigo: vals[1]?.trim() || "",
              unidade: vals[2]?.trim() || "UN",
              quantidade: qtd,
              valor_unitario: vlr,
              bdi,
              imposto: imp,
              valor_total: qtd * vlr * (1 + bdi / 100) * (1 + imp / 100),
              ordem: idx,
            };
          })
          .filter(Boolean);
        if (itens.length > 0) {
          await sigo.entities.OrcamentoItem.bulkCreate(itens);
          loadOrcamentoData(selectedOp.id);
          alert(`${itens.length} itens importados!`);
        }
      } catch (err) {
        console.error(err);
        alert("Erro ao importar planilha");
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleLimparOrcamento = async () => {
    if (!confirm("⚠️ Isso irá apagar TODOS os itens do orçamento. Continuar?")) return;
    if (!selectedOp) return;
    const itens = await sigo.entities.OrcamentoItem.filter({
      empresa_id: empresaAtiva.id,
      oportunidade_id: selectedOp.id,
    });
    await Promise.all(itens.map((item) => sigo.entities.OrcamentoItem.delete(item.id)));
    loadOrcamentoData(selectedOp.id);
  };

  const handleNovoOrcamentoSelect = async (tipo) => {
    if (tipo === "zero") {
      await sigo.entities.OrcamentoItem.create({
        empresa_id: empresaAtiva.id,
        oportunidade_id: selectedOp.id,
        item: "1",
        tipo: "Material",
        descricao: "",
        codigo: "",
        unidade: "UN",
        quantidade: 0,
        valor_unitario: 0,
        bdi: 0,
        imposto: 0,
        valor_total: 0,
        ordem: 0,
      });
      loadOrcamentoData(selectedOp.id);
    } else if (tipo === "modelo") {
      setShowAplicarTemplate(true);
    } else if (tipo === "importar") {
      fileInputOrcamentoRef.current?.click();
    }
  };

  const handleSalvarTemplate = async () => {
    if (!nomeTemplate.trim() || !selectedOp) return;
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
    loadData();
  };

  const handleAplicarTemplateOrcamento = async (templateId) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template?.itens_json || !selectedOp) return;
    try {
      const itens = JSON.parse(template.itens_json);
      await sigo.entities.OrcamentoItem.bulkCreate(
        itens.map((item, i) => ({
          empresa_id: empresaAtiva.id,
          oportunidade_id: selectedOp.id,
          item: (i + 1).toString(),
          tipo: item.tipo || "Material",
          descricao: item.descricao || "",
          codigo: item.codigo || "",
          unidade: item.unidade || "UN",
          quantidade: item.quantidade || 0,
          valor_unitario: item.valor_unitario || 0,
          bdi: item.bdi || 0,
          imposto: item.imposto || 0,
          valor_total: item.valor_total || 0,
          ordem: i,
        }))
      );
      loadOrcamentoData(selectedOp.id);
      setShowAplicarTemplate(false);
      alert("Template aplicado!");
    } catch {
      alert("Erro ao aplicar template");
    }
  };

  const filteredOps = React.useMemo(() => {
    let filtered = searchResults;
    const deveFiltraPorResponsavel =
      (perfil !== "Admin" && temPermissoesGranulares) || (filtroMeus && perfil !== "Admin");
    if (deveFiltraPorResponsavel && user) {
      const meuVinculo = usuariosEmpresa.find((u) => u.usuario_email === user.email);
      filtered = filtered.filter((op) => {
        try {
          const ids = JSON.parse(op.responsaveis_ids || "[]");
          // Verificar por email (padrão atual) OU por ID (compatibilidade com registros antigos)
          return ids.includes(user.email) || (meuVinculo ? ids.includes(meuVinculo.id) : false);
        } catch {
          return false;
        }
      });
    }
    if (filterStatus !== "all") filtered = filtered.filter((op) => op.status_id === filterStatus);
    if (!showArquivados) filtered = filtered.filter((op) => !op.arquivado);
    filtered.sort((a, b) => {
      let aVal, bVal;
      if (
        ["created_date", "data_fechamento_prevista", "licitacao_data"].includes(sortConfig.field)
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
      return sortConfig.direction === "asc"
        ? aVal > bVal
          ? 1
          : aVal < bVal
            ? -1
            : 0
        : aVal < bVal
          ? 1
          : aVal > bVal
            ? -1
            : 0;
    });
    return filtered;
  }, [
    searchResults,
    filterStatus,
    showArquivados,
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
      <OportunidadesHeader
        onOpenModal={() => handleOpenModal()}
        onExport={handleExport}
        onStatusConfig={() => setShowStatusConfig(true)}
        onHandleOpenModal={handleOpenModal}
      />

      <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <BuscaAvancada
            oportunidades={oportunidades}
            onResultsChange={handleSearchResults}
            statusList={statusList}
            usuarios={usuariosEmpresa}
          />
        </div>
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
        <Button
          variant={filtroMeus && perfil !== "Admin" ? "default" : "outline"}
          size="sm"
          onClick={() => setFiltroMeus(!filtroMeus)}
          disabled={perfil === "Admin" || temPermissoesGranulares}
          className="gap-2"
        >
          <User className="w-4 h-4" />
          {filtroMeus || temPermissoesGranulares ? "Minhas" : "Todas"}
        </Button>
        <Button
          variant={showArquivados ? "default" : "outline"}
          size="sm"
          onClick={() => setShowArquivados(!showArquivados)}
          className="gap-2"
        >
          <Archive className="w-4 h-4" />
          {showArquivados ? "Ocultar Arquivados" : "Ver Arquivados"}
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
        <div className="flex gap-2">
          {["kanban", "lista", "calendario", "relatorios"].map((m) => (
            <Button
              key={m}
              variant={viewMode === m ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode(m)}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {viewMode === "kanban" && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className={`flex gap-4 pb-4 ${filterStatus === "all" ? "overflow-x-auto" : ""}`}>
            {statusList
              .filter((status) => filterStatus === "all" || status.id === filterStatus)
              .map((status) => {
                const opsStatus = filteredOps.filter((op) => op.status_id === status.id);
                const totalValor = opsStatus.reduce((s, op) => s + (op.valor_estimado || 0), 0);
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
                          {opsStatus.length} oportunidades • {formatCurrency(totalValor)}
                        </p>
                      </div>
                    </div>
                    <Droppable droppableId={status.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`bg-slate-100 rounded-b-lg p-2 min-h-[400px] space-y-2 transition-colors ${snapshot.isDraggingOver ? "bg-slate-200" : ""}`}
                        >
                          {opsStatus.map((op, index) => (
                            <Draggable key={op.id} draggableId={op.id} index={index}>
                              {(providedDrag, snapshotDrag) => (
                                <div
                                  ref={providedDrag.innerRef}
                                  {...providedDrag.draggableProps}
                                  {...providedDrag.dragHandleProps}
                                >
                                  <Card
                                    className={`cursor-pointer hover:shadow-md transition-all ${snapshotDrag.isDragging ? "shadow-2xl rotate-2 scale-105" : ""}`}
                                    onClick={() => handleOpenDetail(op)}
                                  >
                                    <CardContent className="p-4">
                                      <h4 className="font-medium text-slate-800 mb-2 line-clamp-2">
                                        {op.nome || op.titulo}
                                      </h4>
                                      {podeVerValores && (
                                        <div className="text-lg font-bold text-green-600 mb-2">
                                          {formatCurrency(op.valor_estimado)}
                                        </div>
                                      )}
                                      {op.licitacao_modalidade && (
                                        <p className="text-xs text-blue-700 font-semibold mb-1">
                                          {formatModalidade(op.licitacao_modalidade)}
                                        </p>
                                      )}
                                      {op.licitacao_data && (
                                        <p className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                                          <Calendar className="w-3 h-3" />
                                          {new Date(
                                            op.licitacao_data + "T00:00:00"
                                          ).toLocaleDateString("pt-BR")}
                                          {op.licitacao_horario && ` às ${op.licitacao_horario}`}
                                        </p>
                                      )}
                                      <div className="mb-3">
                                        <ResponsaveisSelect
                                          responsaveisEmails={(() => {
                                            try {
                                              return Array.isArray(op.responsaveis_ids)
                                                ? op.responsaveis_ids
                                                : JSON.parse(op.responsaveis_ids || "[]");
                                            } catch {
                                              return [];
                                            }
                                          })()}
                                          usuarios={usuariosEmpresa}
                                          onUpdate={async (newIds) => {
                                            const v = JSON.stringify(newIds);
                                            setOportunidades((prev) =>
                                              prev.map((o) =>
                                                o.id === op.id ? { ...o, responsaveis_ids: v } : o
                                              )
                                            );
                                            await sigo.entities.Oportunidade.update(op.id, {
                                              responsaveis_ids: v,
                                            });
                                          }}
                                        />
                                      </div>
                                      <div className="mt-3 pt-3 border-t">
                                        <PermissionGate modulo="Oportunidades" aba="Lista">
                                          <EntityActions
                                            entity={op}
                                            markAsCompleteTitle="Migrar para Projetos"
                                            onMarkAsComplete={
                                              temPermissao("Oportunidades", "Lista", "editar")
                                                ? handleMigrarParaProjeto
                                                : null
                                            }
                                            onCopy={
                                              temPermissao("Oportunidades", "Lista", "criar")
                                                ? (o) =>
                                                    handleOpenModal({
                                                      ...o,
                                                      nome: (o.nome || o.titulo) + " (cópia)",
                                                    })
                                                : null
                                            }
                                            onArchive={
                                              temPermissao("Oportunidades", "Lista", "editar")
                                                ? handleArquivar
                                                : null
                                            }
                                            onDelete={
                                              temPermissao("Oportunidades", "Lista", "excluir")
                                                ? handleDelete
                                                : null
                                            }
                                          />
                                        </PermissionGate>
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

      {viewMode === "relatorios" && <RelatorioOportunidades />}

      {viewMode === "calendario" && (
        <CalendarioOportunidades
          oportunidades={filteredOps}
          onSelectOportunidade={handleOpenDetail}
          formatCurrency={formatCurrency}
        />
      )}

      {viewMode === "lista" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
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
                {filteredOps.map((op) => (
                  <tr
                    key={op.id}
                    className="border-b hover:bg-slate-50 cursor-pointer"
                    onClick={() => handleOpenDetail(op)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{op.nome || op.titulo}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-green-600">
                      {podeVerValores ? formatCurrency(op.valor_estimado) : "-"}
                    </td>
                    <td className="px-4 py-3 text-blue-700 font-semibold text-sm">
                      {op.licitacao_modalidade ? formatModalidade(op.licitacao_modalidade) : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {op.licitacao_data ? (
                        <div className="flex items-center gap-1 text-xs">
                          <Calendar className="w-3 h-3" />
                          {new Date(op.licitacao_data + "T00:00:00").toLocaleDateString("pt-BR")}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ResponsaveisSelect
                        responsaveisEmails={(() => {
                          try {
                            return Array.isArray(op.responsaveis_ids)
                              ? op.responsaveis_ids
                              : JSON.parse(op.responsaveis_ids || "[]");
                          } catch {
                            return [];
                          }
                        })()}
                        usuarios={usuariosEmpresa}
                        onUpdate={async (newIds) => {
                          const v = JSON.stringify(newIds);
                          setOportunidades((prev) =>
                            prev.map((o) => (o.id === op.id ? { ...o, responsaveis_ids: v } : o))
                          );
                          await sigo.entities.Oportunidade.update(op.id, { responsaveis_ids: v });
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <EntityActions
                        entity={op}
                        markAsCompleteTitle="Migrar para Projetos"
                        onMarkAsComplete={handleMigrarParaProjeto}
                        onCopy={(o) =>
                          handleOpenModal({ ...o, nome: (o.nome || o.titulo) + " (cópia)" })
                        }
                        onArchive={handleArquivar}
                        onDelete={handleDelete}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal criar/editar oportunidade */}
      <Sheet
        open={showModal}
        onOpenChange={(open) => {
          setShowModal(open);
          if (!open && selectedOp) setShowDetail(true);
        }}
      >
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0">
            <SheetHeader>
              <div className="flex items-center justify-between">
                <SheetTitle>{selectedOp ? "Editar Oportunidade" : "Nova Oportunidade"}</SheetTitle>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </SheetHeader>
          </div>
          <div className="flex-1 overflow-y-auto">
            {showTemplateSelection ? (
              <div className="flex flex-col items-center justify-center py-12 px-6">
                <Card
                  className="cursor-pointer hover:shadow-lg hover:border-blue-500 transition-all group w-full max-w-sm mb-8"
                  onClick={() => setShowTemplateSelection(false)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Plus className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold text-slate-800 mb-1">Começar do Zero</h3>
                        <p className="text-sm text-slate-500">Criar sem template</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {templates.filter((t) => t.tipo !== "orcamento").length > 0 && (
                  <div className="space-y-2 w-full max-w-2xl">
                    {templates
                      .filter((t) => t.tipo !== "orcamento")
                      .map((template) => (
                        <Card
                          key={template.id}
                          className="cursor-pointer hover:shadow-md transition-all"
                          onClick={() => {
                            handleApplyTemplate(template.id);
                            setShowTemplateSelection(false);
                          }}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                                <FileText className="w-5 h-5 text-purple-600" />
                              </div>
                              <div>
                                <p className="font-medium text-slate-800">{template.nome}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <FormularioOportunidade
                formData={formData}
                setFormData={setFormData}
                clientes={clientes}
                statusList={statusList}
                origensList={origensList}
                usuariosEmpresa={usuariosEmpresa}
                onNovoCliente={() => setShowNovoCliente(true)}
                onNovaOrigem={handleCriarOrigem}
                buscandoCep={buscandoCep}
                handleBuscarCep={handleBuscarCep}
              />
            )}
          </div>
          {!showTemplateSelection && (
            <div className="sticky bottom-0 bg-white border-t p-6 z-10 flex-shrink-0 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowModal(false);
                  if (selectedOp) setShowDetail(true);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !formData.titulo}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Detalhe da oportunidade - componente separado */}
      <OportunidadeDetalhe
        open={showDetail}
        onOpenChange={setShowDetail}
        selectedOp={selectedOp}
        setSelectedOp={setSelectedOp}
        statusList={statusList}
        usuariosEmpresa={usuariosEmpresa}
        empresaAtiva={empresaAtiva}
        user={user}
        perfil={perfil}
        temPermissao={temPermissao}
        podeVerValores={podeVerValores}
        atualizacoes={atualizacoes}
        orcamentoItens={orcamentoItens}
        setOrcamentoItens={setOrcamentoItens}
        cronogramaEtapas={cronogramaEtapas}
        arquivos={arquivos}
        materiais={materiais}
        novaNota={novaNota}
        setNovaNota={setNovaNota}
        itensSelecionados={itensSelecionados}
        setItensSelecionados={setItensSelecionados}
        filtroTipoOrcamento={filtroTipoOrcamento}
        setFiltroTipoOrcamento={setFiltroTipoOrcamento}
        updateTimeoutRef={updateTimeoutRef}
        onAddNota={handleAddNota}
        onDeleteArquivo={handleDeleteArquivo}
        onUploadFile={handleUploadFile}
        onReloadArquivos={() => loadOrcamentoData(selectedOp.id)}
        onLimparOrcamento={handleLimparOrcamento}
        onExportarExcel={handleExportarOrcamentoExcel}
        onExportarPDF={handleExportarOrcamentoPDF}
        onBaixarModelo={handleBaixarModeloOrcamento}
        onImportarOrcamento={handleImportarOrcamento}
        onDeleteOrcamentoItem={handleDeleteOrcamentoItem}
        onDeleteSelecionados={handleDeleteSelecionados}
        onNovoOrcamentoSelect={handleNovoOrcamentoSelect}
        onOpenModal={handleOpenModal}
        onDelete={handleDelete}
        onShowStatusConfig={setShowStatusConfig}
        onShowSalvarTemplate={setShowSalvarTemplate}
        onShowAplicarTemplate={setShowAplicarTemplate}
        onShowRelatoriosOrcamento={setShowRelatoriosOrcamento}
        onShowClienteView={setShowClienteView}
        setOportunidades={setOportunidades}
        fileInputOrcamentoRef={fileInputOrcamentoRef}
        uploadingFile={uploadingFile}
      />

      {/* Relatórios do orçamento */}
      <Sheet open={showRelatoriosOrcamento} onOpenChange={setShowRelatoriosOrcamento}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0">
            <SheetHeader>
              <SheetTitle>Relatórios do Orçamento</SheetTitle>
            </SheetHeader>
          </div>
          <div className="p-6 flex-1 overflow-y-auto">
            <RelatoriosOrcamento
              orcamentoItens={orcamentoItens || []}
              nomeOrcamento={selectedOp?.nome || selectedOp?.titulo || ""}
              clienteNome={selectedOp?.cliente_nome || ""}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Etapa modal */}
      <EtapaModal
        open={showAddEtapa}
        onOpenChange={setShowAddEtapa}
        etapaForm={etapaForm}
        setEtapaForm={setEtapaForm}
        onSave={handleAddEtapa}
        usuariosEmpresa={usuariosEmpresa}
      />

      {/* Salvar template */}
      <Sheet open={showSalvarTemplate} onOpenChange={setShowSalvarTemplate}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <SheetHeader>
            <SheetTitle>Salvar como Template</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-6 px-6">
            <div>
              <Label>Nome do Template</Label>
              <Input
                value={nomeTemplate}
                onChange={(e) => setNomeTemplate(e.target.value)}
                placeholder="Ex: Orçamento Padrão"
                className="mt-1.5"
              />
            </div>
            <Button
              onClick={handleSalvarTemplate}
              disabled={!nomeTemplate.trim()}
              className="w-full"
            >
              Salvar Template
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Aplicar template */}
      <Sheet open={showAplicarTemplate} onOpenChange={setShowAplicarTemplate}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <SheetHeader>
            <SheetTitle>Aplicar Template</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-6 px-6">
            {templates.filter((t) => t.tipo === "orcamento").length > 0 ? (
              templates
                .filter((t) => t.tipo === "orcamento")
                .map((template) => (
                  <Card
                    key={template.id}
                    className="cursor-pointer hover:shadow-md transition-all"
                    onClick={() => handleAplicarTemplateOrcamento(template.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                          <Copy className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{template.nome}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
            ) : (
              <div className="text-center py-12 text-slate-500">
                <Copy className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum template de orçamento salvo</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Config status */}
      <Sheet open={showStatusConfig} onOpenChange={setShowStatusConfig}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <SheetHeader>
            <SheetTitle>Configurar Status</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 py-4 px-6">
            <div className="space-y-3">
              <div>
                <Label>Nome do Status</Label>
                <Input
                  value={statusForm.nome}
                  onChange={(e) => setStatusForm({ ...statusForm, nome: e.target.value })}
                  placeholder="Ex: Em Análise"
                  className="mt-1.5"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Cor</Label>
                  <Input
                    type="color"
                    value={statusForm.cor}
                    onChange={(e) => setStatusForm({ ...statusForm, cor: e.target.value })}
                    className="mt-1.5 h-10"
                  />
                </div>
                <div>
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    value={statusForm.ordem}
                    onChange={(e) =>
                      setStatusForm({ ...statusForm, ordem: parseInt(e.target.value) || 0 })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={statusForm.tipo}
                    onValueChange={(v) => setStatusForm({ ...statusForm, tipo: v })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aberto">Aberto</SelectItem>
                      <SelectItem value="ganho">Ganho</SelectItem>
                      <SelectItem value="perdido">Perdido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleSaveStatus} className="w-full bg-amber-500 hover:bg-amber-600">
                <Plus className="w-4 h-4 mr-2" />
                {editingStatus ? "Atualizar" : "Adicionar"} Status
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Status Cadastrados</Label>
              {statusList.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: s.cor }} />
                    <div>
                      <p className="font-medium">{s.nome}</p>
                      <p className="text-xs text-slate-500">
                        Ordem: {s.ordem} • {s.tipo}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setStatusForm(s);
                        setEditingStatus(s);
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteStatus(s)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Portal cliente */}
      <Dialog open={showClienteView} onOpenChange={setShowClienteView}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] p-0">
          <PortalClienteEmbed projetoId={selectedOp?.id} empresaAtiva={empresaAtiva} />
        </DialogContent>
      </Dialog>

      {/* Novo cliente */}
      <NovoClienteModal
        open={showNovoCliente}
        onOpenChange={setShowNovoCliente}
        empresaAtiva={empresaAtiva}
        onClienteCriado={async (c) => {
          await loadData();
          setFormData((prev) => ({ ...prev, cliente_id: c.id }));
        }}
      />

      {/* Criar material */}
      <CriarMaterialModal
        open={showCriarMaterial}
        onOpenChange={setShowCriarMaterial}
        empresaAtiva={empresaAtiva}
        nomeInicial={novoMaterialForm.nome}
        onMaterialCriado={async (novoMat) => {
          setNovoMaterialForm({ nome: "", codigo: "", unidade: "UN", preco_referencia: 0 });
          if (selectedOp) await loadOrcamentoData(selectedOp.id);
        }}
      />
    </div>
  );
}
