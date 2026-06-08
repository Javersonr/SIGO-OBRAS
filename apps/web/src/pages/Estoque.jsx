import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../Layout";
import { salvarDraftSC } from "@/lib/sc-draft";
import {
  Package,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  AlertTriangle,
  Warehouse,
  RefreshCw,
  FileText,
  Check,
  ChevronsUpDown,
  X,
  ShoppingCart,
  ReceiptText,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import PermissionGate from "../components/PermissionGate";
import ReservaMateriaisModal from "../components/estoque/ReservaMateriaisModal";
import ReservaDetalheModal from "../components/estoque/ReservaDetalheModal";
import EstoqueCaminhaoTab from "../components/estoque/EstoqueCaminhaoTab";
import NotaDevolucaoModal from "../components/estoque/NotaDevolucaoModal";
import ImportarMovimentacoesModal from "../components/estoque/ImportarMovimentacoesModal";
import { createPageUrl } from "../utils";
import { useNavigate } from "react-router-dom";

export default function Estoque() {
  const { empresaAtiva, perfil, user, temPermissao } = useEmpresa();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("saldos");
  const [loading, setLoading] = useState(true);

  // Dados
  const [materiais, setMateriais] = useState([]);
  const [almoxarifados, setAlmoxarifados] = useState([]);
  const [saldos, setSaldos] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [reservas, setReservas] = useState([]);

  // Modais
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showAlmoxarifadoModal, setShowAlmoxarifadoModal] = useState(false);
  const [showMovimentoModal, setShowMovimentoModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  // Forms
  const [materialForm, setMaterialForm] = useState({
    codigo: "",
    descricao: "",
    unidade: "UN",
    categoria: "",
    estoque_minimo: 0,
  });

  const [almoxarifadoForm, setAlmoxarifadoForm] = useState({
    nome: "",
    endereco: "",
    responsavel: "",
  });

  const [movimentoForm, setMovimentoForm] = useState({
    material_id: "",
    almoxarifado_id: "",
    tipo: "Entrada",
    quantidade: 0,
    valor_unitario: 0,
    projeto_id: "",
    observacoes: "",
  });
  const [openMaterialCombo, setOpenMaterialCombo] = useState(false);
  const [openAlmoxCombo, setOpenAlmoxCombo] = useState(false);
  const [openProjetoReservaCombo, setOpenProjetoReservaCombo] = useState(false);
  // setMateriaisDoProjetoReserva é chamado mas o valor nunca é lido em render —
  // mantido como no-op pra não quebrar o fluxo do popover de reservas até
  // que essa feature seja finalizada ou removida (ver task pendente).
  // eslint-disable-next-line no-unused-vars
  const [materiaisDoProjetoReserva, setMateriaisDoProjetoReserva] = useState([]);

  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAlmoxarifado, setFilterAlmoxarifado] = useState("all");
  const [sortConfig, setSortConfig] = useState({ field: "material_descricao", direction: "asc" });
  const [filterCodigo, setFilterCodigo] = useState("");
  const [filterNome, setFilterNome] = useState("");
  const [filterUnidade, setFilterUnidade] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [showReservaModal, setShowReservaModal] = useState(false);
  const [showReservaMateriaisModal, setShowReservaMateriaisModal] = useState(false);
  const [showNotaDevolucaoModal, setShowNotaDevolucaoModal] = useState(false);
  const [showImportarMovimentacoes, setShowImportarMovimentacoes] = useState(false);
  const [notasDevolucao, setNotasDevolucao] = useState([]);
  const [saldosSelecionados, setSaldosSelecionados] = useState(new Set());
  const [reservaForm, setReservaForm] = useState({
    material_id: "",
    almoxarifado_id: "",
    projeto_id: "",
    quantidade_reservada: "",
    data_necessidade: "",
    observacoes: "",
  });
  const [reservaDetalheOpen, setReservaDetalheOpen] = useState(false);
  const [reservaDetalheGrupo, setReservaDetalheGrupo] = useState(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [mats, almoxs, slds, movs, projs, reservasData, notasDevData] = await Promise.all([
        sigo.entities.Material.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Almoxarifado.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.EstoqueSaldo.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.EstoqueMovimento.filter(
          { empresa_id: empresaAtiva.id },
          "-created_date",
          100
        ),
        sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id, arquivado: false }),
        sigo.entities.ReservaMaterial.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.NotaFiscalDevolucao.filter({ empresa_id: empresaAtiva.id }).catch(() => []),
      ]);

      // Calcular quantidade disponível para cada saldo
      const reservasAtivas = reservasData.filter((r) => r.status === "Ativa");

      const saldosComDisponivel = slds.map((saldo) => {
        const reservasDoMaterial = reservasAtivas.filter(
          (r) => r.material_id === saldo.material_id && r.almoxarifado_id === saldo.almoxarifado_id
        );
        const qtdReservada = reservasDoMaterial.reduce(
          (sum, r) => sum + (r.quantidade_reservada || 0),
          0
        );

        return {
          ...saldo,
          quantidade_reservada: qtdReservada,
          quantidade_disponivel: (saldo.quantidade || 0) - qtdReservada,
        };
      });

      setMateriais(
        mats.sort((a, b) =>
          (a.nome || a.descricao || "").localeCompare(b.nome || b.descricao || "")
        )
      );
      setAlmoxarifados(almoxs);
      setSaldos(saldosComDisponivel);
      setMovimentos(movs);
      setProjetos(projs);
      setReservas(reservasData);
      setNotasDevolucao(notasDevData);
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

  // Handlers Material
  const handleOpenMaterial = (mat = null) => {
    if (mat) {
      setMaterialForm({
        codigo: mat.codigo || "",
        nome: mat.nome || mat.descricao || "",
        descricao: mat.descricao || mat.nome || "",
        unidade: mat.unidade || "UN",
        categoria: mat.categoria || "",
        estoque_minimo: mat.estoque_minimo || 0,
      });
      setSelectedItem(mat);
    } else {
      setMaterialForm({
        codigo: "",
        nome: "",
        descricao: "",
        unidade: "UN",
        categoria: "",
        estoque_minimo: 0,
      });
      setSelectedItem(null);
    }
    setShowMaterialModal(true);
  };

  const handleSaveMaterial = async () => {
    if (!materialForm.nome && !materialForm.descricao) return;
    setSaving(true);
    try {
      const data = {
        empresa_id: empresaAtiva.id,
        ...materialForm,
        nome: materialForm.nome || materialForm.descricao,
        descricao: materialForm.descricao || materialForm.nome,
        ativo: true,
      };

      if (selectedItem) {
        await sigo.entities.Material.update(selectedItem.id, data);
      } else {
        await sigo.entities.Material.create(data);
      }

      setShowMaterialModal(false);
      loadData();
    } catch (error) {
      console.error("Erro:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMaterial = async (mat) => {
    if (!confirm("Excluir este material?")) return;
    await sigo.entities.Material.update(mat.id, { ativo: false });
    loadData();
  };

  // Handlers Almoxarifado
  const handleOpenAlmoxarifado = (almox = null) => {
    if (almox) {
      setAlmoxarifadoForm({
        nome: almox.nome || "",
        endereco: almox.endereco || "",
        responsavel: almox.responsavel || "",
      });
      setSelectedItem(almox);
    } else {
      setAlmoxarifadoForm({ nome: "", endereco: "", responsavel: "" });
      setSelectedItem(null);
    }
    setShowAlmoxarifadoModal(true);
  };

  const handleSaveAlmoxarifado = async () => {
    if (!almoxarifadoForm.nome) return;
    setSaving(true);
    try {
      const data = {
        empresa_id: empresaAtiva.id,
        ...almoxarifadoForm,
        ativo: true,
      };

      if (selectedItem) {
        await sigo.entities.Almoxarifado.update(selectedItem.id, data);
      } else {
        await sigo.entities.Almoxarifado.create(data);
      }

      setShowAlmoxarifadoModal(false);
      loadData();
    } catch (error) {
      console.error("Erro:", error);
    } finally {
      setSaving(false);
    }
  };

  // Handlers Movimento
  const handleOpenMovimento = () => {
    setMovimentoForm({
      material_id: "",
      almoxarifado_id: almoxarifados[0]?.id || "",
      tipo: "Entrada",
      quantidade: 0,
      valor_unitario: 0,
      projeto_id: "",
      observacoes: "",
    });
    setShowMovimentoModal(true);
  };

  const handleSaveMovimento = async () => {
    if (
      !movimentoForm.material_id ||
      !movimentoForm.almoxarifado_id ||
      movimentoForm.quantidade <= 0
    )
      return;
    setSaving(true);
    try {
      const material = materiais.find((m) => m.id === movimentoForm.material_id);
      const almoxarifado = almoxarifados.find((a) => a.id === movimentoForm.almoxarifado_id);
      const projeto = projetos.find((p) => p.id === movimentoForm.projeto_id);

      // Buscar saldo existente
      const saldoExistente = saldos.find(
        (s) =>
          s.material_id === movimentoForm.material_id &&
          s.almoxarifado_id === movimentoForm.almoxarifado_id
      );

      // VALIDAR SAÍDA: verificar se há quantidade disponível (não reservada)
      if (movimentoForm.tipo === "Saída") {
        const qtdDisponivel = saldoExistente?.quantidade_disponivel || 0;
        if (movimentoForm.quantidade > qtdDisponivel) {
          alert(
            `❌ Quantidade indisponível!\n\nDisponível: ${qtdDisponivel} ${saldoExistente?.unidade}\nReservado: ${saldoExistente?.quantidade_reservada || 0} ${saldoExistente?.unidade}\n\nLibere as reservas antes de dar saída.`
          );
          setSaving(false);
          return;
        }
      }

      const data = {
        empresa_id: empresaAtiva.id,
        material_id: movimentoForm.material_id,
        material_descricao: material?.descricao,
        almoxarifado_id: movimentoForm.almoxarifado_id,
        almoxarifado_nome: almoxarifado?.nome,
        tipo: movimentoForm.tipo,
        quantidade: movimentoForm.quantidade,
        valor_unitario: movimentoForm.valor_unitario,
        valor_total: movimentoForm.quantidade * movimentoForm.valor_unitario,
        data_movimento: new Date().toISOString().split("T")[0],
        projeto_id: movimentoForm.projeto_id || null,
        projeto_nome: projeto?.nome || null,
        referencia_tipo: "Manual",
        usuario_nome: user?.full_name,
        observacoes: movimentoForm.observacoes,
      };

      // Executar movimento e atualização de saldo em paralelo
      if (saldoExistente) {
        const novaQtd =
          movimentoForm.tipo === "Entrada" || movimentoForm.tipo === "Ajuste"
            ? saldoExistente.quantidade + movimentoForm.quantidade
            : saldoExistente.quantidade - movimentoForm.quantidade;

        await Promise.all([
          sigo.entities.EstoqueMovimento.create(data),
          sigo.entities.EstoqueSaldo.update(saldoExistente.id, {
            quantidade: Math.max(0, novaQtd),
          }),
        ]);
      } else {
        await Promise.all([
          sigo.entities.EstoqueMovimento.create(data),
          sigo.entities.EstoqueSaldo.create({
            empresa_id: empresaAtiva.id,
            material_id: movimentoForm.material_id,
            material_codigo: material?.codigo,
            material_descricao: material?.descricao,
            almoxarifado_id: movimentoForm.almoxarifado_id,
            almoxarifado_nome: almoxarifado?.nome,
            quantidade: movimentoForm.quantidade,
            valor_medio: movimentoForm.valor_unitario,
            estoque_minimo: material?.estoque_minimo || 0,
            unidade: material?.unidade,
          }),
        ]);
      }

      setShowMovimentoModal(false);
      loadData();
    } catch (error) {
      console.error("Erro:", error);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  // Index materiais por id pra trocar O(n) por O(1) dentro do filtro abaixo.
  // Sem isso, com 1k saldos × 1k materiais, era O(n²) por render = ~1s de UI travada.
  const materiaisById = React.useMemo(() => {
    const map = new Map();
    for (const m of materiais) map.set(m.id, m);
    return map;
  }, [materiais]);

  const filteredSaldos = React.useMemo(() => {
    const filtered = saldos.filter((s) => {
      const matchSearch =
        s.material_descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.material_codigo?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchAlmox = filterAlmoxarifado === "all" || s.almoxarifado_id === filterAlmoxarifado;
      const matchCodigo =
        !filterCodigo || s.material_codigo?.toLowerCase().includes(filterCodigo.toLowerCase());
      const matchNome =
        !filterNome || s.material_descricao?.toLowerCase().includes(filterNome.toLowerCase());
      const matchUnidade =
        !filterUnidade || s.unidade?.toLowerCase().includes(filterUnidade.toLowerCase());

      // O(1) lookup pela Map em vez de materiais.find() (O(n))
      const material = materiaisById.get(s.material_id);
      const matchCategoria =
        !filterCategoria ||
        material?.categoria?.toLowerCase().includes(filterCategoria.toLowerCase());

      return (
        matchSearch && matchAlmox && matchCodigo && matchNome && matchUnidade && matchCategoria
      );
    });

    // Aplicar ordenação
    return filtered.sort((a, b) => {
      let aVal, bVal;

      if (
        sortConfig.field === "quantidade" ||
        sortConfig.field === "valor_medio" ||
        sortConfig.field === "estoque_minimo"
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
  }, [
    saldos,
    materiais,
    searchTerm,
    filterAlmoxarifado,
    sortConfig,
    filterCodigo,
    filterNome,
    filterUnidade,
    filterCategoria,
  ]);

  const alertas = React.useMemo(() => {
    return saldos.filter((s) => s.quantidade <= (s.estoque_minimo || 0));
  }, [saldos]);

  if (!empresaAtiva) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Estoque</h1>
          <p className="text-slate-500">Controle de materiais e movimentações</p>
        </div>
        <div className="flex gap-2">
          <PermissionGate modulo="Estoque" aba="Materiais" funcao="criar">
            <Button variant="outline" onClick={() => handleOpenMaterial()}>
              <Plus className="w-4 h-4 mr-2" />
              Material
            </Button>
          </PermissionGate>
          <Button variant="outline" onClick={() => handleOpenAlmoxarifado()}>
            <Warehouse className="w-4 h-4 mr-2" />
            Almoxarifado
          </Button>
          <PermissionGate modulo="Estoque" aba="Movimentações" funcao="entrada">
            <Button
              variant="outline"
              onClick={() => {
                setReservaForm({
                  material_id: "",
                  almoxarifado_id: "",
                  projeto_id: "",
                  projetos_ids: [],
                  quantidade_reservada: "",
                  data_necessidade: "",
                  observacoes: "",
                });
                setShowReservaModal(true);
              }}
            >
              <FileText className="w-4 h-4 mr-2" />
              Reservar Item
            </Button>
          </PermissionGate>
          {saldosSelecionados.size > 0 && activeTab === "saldos" && (
            <Button
              onClick={() => setShowReservaMateriaisModal(true)}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              <FileText className="w-4 h-4" />
              Reservar {saldosSelecionados.size} Item(ns)
            </Button>
          )}
          <PermissionGate modulo="Estoque" aba="Movimentações">
            <Button onClick={handleOpenMovimento} className="bg-amber-500 hover:bg-amber-600">
              <RefreshCw className="w-4 h-4 mr-2" />
              Movimento
            </Button>
          </PermissionGate>
          <Button
            variant="outline"
            onClick={() => setShowNotaDevolucaoModal(true)}
            className="gap-2 border-green-500 text-green-700 hover:bg-green-50"
          >
            <ReceiptText className="w-4 h-4" />
            NF-e Devolução
          </Button>
        </div>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-700">
                    {alertas.length} {alertas.length === 1 ? "item está" : "itens estão"} abaixo do
                    estoque mínimo
                  </p>
                  <p className="text-sm text-red-600">
                    {alertas.map((a) => a.material_descricao).join(", ")}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white flex-shrink-0"
                onClick={() => {
                  // Antes usava window.solicitacaoCompraData (estado global,
                  // sumia no F5). Agora sessionStorage via helper sc-draft.
                  salvarDraftSC({
                    origem: "Estoque",
                    prioridade: "Alta",
                    observacoes: "Solicitação gerada automaticamente por estoque mínimo atingido.",
                    itens: alertas.map((a) => ({
                      material_id: a.material_id || undefined,
                      material_codigo: a.material_codigo || undefined,
                      descricao: a.material_descricao || "",
                      quantidade: Math.max(1, (a.estoque_minimo || 0) - (a.quantidade || 0)),
                      unidade: a.unidade || "UN",
                      // preço estimado vem do saldo (valor_medio) pra alimentar
                      // a aprovação por valor da migration 0028.
                      preco_unitario_estimado: a.valor_medio || 0,
                      especificacoes: `Estoque atual: ${a.quantidade || 0} ${a.unidade || ""} | Mínimo: ${a.estoque_minimo || 0} ${a.unidade || ""}`,
                    })),
                  });
                  navigate(createPageUrl("Compras"));
                }}
              >
                <ShoppingCart className="w-4 h-4 mr-1" />
                Solicitar Compra
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="saldos" className="gap-2">
            <Package className="w-4 h-4" /> Saldos
          </TabsTrigger>
          <TabsTrigger value="reservas" className="gap-2">
            <ArrowUpCircle className="w-4 h-4" /> Reservas
          </TabsTrigger>
          {(perfil === "Admin" || temPermissao("Estoque", "Movimentações")) && (
            <TabsTrigger value="movimentos" className="gap-2">
              <RefreshCw className="w-4 h-4" /> Movimentos
            </TabsTrigger>
          )}
          {(perfil === "Admin" || temPermissao("Estoque", "Materiais")) && (
            <TabsTrigger value="materiais" className="gap-2">
              <FileText className="w-4 h-4" /> Materiais
            </TabsTrigger>
          )}
          <TabsTrigger value="almoxarifados" className="gap-2">
            <Warehouse className="w-4 h-4" /> Almoxarifados
          </TabsTrigger>
          <TabsTrigger value="caminhoes" className="gap-2">
            <Truck className="w-4 h-4" /> Estoque Caminhões
          </TabsTrigger>
          <TabsTrigger value="notas_devolucao" className="gap-2">
            <ReceiptText className="w-4 h-4" /> NF-e Devolução
          </TabsTrigger>
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
          {(activeTab === "saldos" || activeTab === "movimentos") && (
            <Select value={filterAlmoxarifado} onValueChange={setFilterAlmoxarifado}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Almoxarifado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {almoxarifados.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Saldos */}
        <TabsContent value="saldos">
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="group">
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded"
                      checked={
                        filteredSaldos.length > 0 &&
                        filteredSaldos.every((s) => saldosSelecionados.has(s.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSaldosSelecionados(new Set(filteredSaldos.map((s) => s.id)));
                        } else {
                          setSaldosSelecionados(new Set());
                        }
                      }}
                    />
                  </TableHead>
                  <SortableTableHeader
                    field="material_codigo"
                    label="Código"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="material_descricao"
                    label="Material"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="almoxarifado_nome"
                    label="Almoxarifado"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                  <SortableTableHeader
                    field="quantidade"
                    label="Total"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                    align="right"
                  />
                  <SortableTableHeader
                    field="quantidade_reservada"
                    label="Reservado"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                    align="right"
                  />
                  <SortableTableHeader
                    field="quantidade_disponivel"
                    label="Disponível"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                    align="right"
                  />
                  <SortableTableHeader
                    field="valor_medio"
                    label="Valor Médio"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                    align="right"
                  />
                  <SortableTableHeader
                    field="estoque_minimo"
                    label="Est. Mínimo"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                    align="right"
                  />
                  <TableHead>Status</TableHead>
                </TableRow>
                <TableRow className="bg-slate-50">
                  <TableHead className="p-2"></TableHead>
                  <TableHead className="p-2">
                    <Input
                      placeholder="Filtrar..."
                      value={filterCodigo}
                      onChange={(e) => setFilterCodigo(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </TableHead>
                  <TableHead className="p-2">
                    <Input
                      placeholder="Filtrar..."
                      value={filterNome}
                      onChange={(e) => setFilterNome(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </TableHead>
                  <TableHead className="p-2"></TableHead>
                  <TableHead className="p-2"></TableHead>
                  <TableHead className="p-2"></TableHead>
                  <TableHead className="p-2"></TableHead>
                  <TableHead className="p-2"></TableHead>
                  <TableHead className="p-2"></TableHead>
                  <TableHead className="p-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSaldos.map((saldo) => (
                  <TableRow
                    key={saldo.id}
                    className={saldosSelecionados.has(saldo.id) ? "bg-blue-50" : ""}
                  >
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded"
                        checked={saldosSelecionados.has(saldo.id)}
                        onChange={(e) => {
                          const newSet = new Set(saldosSelecionados);
                          if (e.target.checked) {
                            newSet.add(saldo.id);
                          } else {
                            newSet.delete(saldo.id);
                          }
                          setSaldosSelecionados(newSet);
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {saldo.material_codigo || "-"}
                    </TableCell>
                    <TableCell className="font-medium">{saldo.material_descricao}</TableCell>
                    <TableCell>{saldo.almoxarifado_nome}</TableCell>
                    <TableCell className="text-right font-medium">
                      {saldo.quantidade} {saldo.unidade}
                    </TableCell>
                    <TableCell className="text-right text-amber-600 font-medium">
                      {saldo.quantidade_reservada || 0} {saldo.unidade}
                    </TableCell>
                    <TableCell className="text-right text-green-600 font-semibold">
                      {saldo.quantidade_disponivel || 0} {saldo.unidade}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(saldo.valor_medio)}
                    </TableCell>
                    <TableCell className="text-right">{saldo.estoque_minimo}</TableCell>
                    <TableCell>
                      {saldo.quantidade <= (saldo.estoque_minimo || 0) ? (
                        <Badge className="bg-red-100 text-red-700">Baixo</Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-700">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredSaldos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                      Nenhum saldo encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Reservas */}
        <TabsContent value="reservas">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data Reserva</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead className="text-right">Qtd Materiais</TableHead>
                  <TableHead>Necessidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  // Agrupar reservas por grupo_id
                  const grupos = {};
                  reservas.forEach((r) => {
                    const key = r.grupo_id || r.id;
                    if (!grupos[key]) {
                      grupos[key] = { ...r, grupo_id: key, _count: 0 };
                    }
                    grupos[key]._count++;
                  });
                  const gruposList = Object.values(grupos).filter((g) => {
                    return (
                      !searchTerm ||
                      g.numero?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      g.projeto_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      g.material_descricao?.toLowerCase().includes(searchTerm.toLowerCase())
                    );
                  });
                  if (gruposList.length === 0)
                    return (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                          Nenhuma reserva encontrada
                        </TableCell>
                      </TableRow>
                    );
                  return gruposList.map((g) => (
                    <TableRow
                      key={g.grupo_id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => {
                        setReservaDetalheGrupo(g);
                        setReservaDetalheOpen(true);
                      }}
                    >
                      <TableCell className="font-mono font-semibold text-blue-700">
                        {g.numero || "-"}
                      </TableCell>
                      <TableCell>
                        {g.data_reserva
                          ? new Date(g.data_reserva).toLocaleDateString("pt-BR")
                          : "-"}
                      </TableCell>
                      <TableCell className="font-medium">{g.projeto_nome || "-"}</TableCell>
                      <TableCell>{g.solicitante_nome || "-"}</TableCell>
                      <TableCell className="text-right">
                        {g._count} {g._count === 1 ? "item" : "itens"}
                      </TableCell>
                      <TableCell>
                        {g.data_necessidade
                          ? new Date(g.data_necessidade).toLocaleDateString("pt-BR")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            g.status === "Ativa"
                              ? "bg-blue-100 text-blue-700"
                              : g.status === "Concluída"
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-600"
                          }
                        >
                          {g.status}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                const itens = reservas.filter(
                                  (r) => (r.grupo_id || r.id) === g.grupo_id
                                );
                                Promise.all(
                                  itens.map((r) =>
                                    sigo.entities.ReservaMaterial.update(r.id, {
                                      status: "Concluída",
                                    })
                                  )
                                ).then(loadData);
                              }}
                            >
                              Marcar Concluída
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => {
                                const itens = reservas.filter(
                                  (r) => (r.grupo_id || r.id) === g.grupo_id
                                );
                                Promise.all(
                                  itens.map((r) =>
                                    sigo.entities.ReservaMaterial.update(r.id, {
                                      status: "Cancelada",
                                    })
                                  )
                                ).then(loadData);
                              }}
                            >
                              Cancelar Reserva
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ));
                })()}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Movimentos */}
        <TabsContent value="movimentos">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Almoxarifado</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Usuário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimentos.map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell>
                      {new Date(mov.data_movimento || mov.created_date).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="font-medium">{mov.material_descricao}</TableCell>
                    <TableCell>{mov.almoxarifado_nome}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          mov.tipo === "Entrada"
                            ? "bg-green-100 text-green-700"
                            : mov.tipo === "Saída"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                        }
                      >
                        {mov.tipo === "Entrada" && <ArrowDownCircle className="w-3 h-3 mr-1" />}
                        {mov.tipo === "Saída" && <ArrowUpCircle className="w-3 h-3 mr-1" />}
                        {mov.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{mov.quantidade}</TableCell>
                    <TableCell>{mov.projeto_nome || "-"}</TableCell>
                    <TableCell>{mov.usuario_nome}</TableCell>
                  </TableRow>
                ))}
                {movimentos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      Nenhum movimento encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Materiais */}
        <TabsContent value="materiais">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="text-right">Est. Mínimo</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
                <TableRow className="bg-slate-50">
                  <TableHead className="p-2">
                    <Input
                      placeholder="Filtrar..."
                      value={filterCodigo}
                      onChange={(e) => setFilterCodigo(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </TableHead>
                  <TableHead className="p-2">
                    <Input
                      placeholder="Filtrar..."
                      value={filterNome}
                      onChange={(e) => setFilterNome(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </TableHead>
                  <TableHead className="p-2">
                    <Input
                      placeholder="Filtrar..."
                      value={filterUnidade}
                      onChange={(e) => setFilterUnidade(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </TableHead>
                  <TableHead className="p-2">
                    <Input
                      placeholder="Filtrar..."
                      value={filterCategoria}
                      onChange={(e) => setFilterCategoria(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </TableHead>
                  <TableHead className="p-2"></TableHead>
                  <TableHead className="p-2"></TableHead>
                  <TableHead className="p-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materiais
                  .filter((m) => {
                    if (!m.ativo) return false;
                    const matchCodigo =
                      !filterCodigo || m.codigo?.toLowerCase().includes(filterCodigo.toLowerCase());
                    const matchNome =
                      !filterNome ||
                      m.nome?.toLowerCase().includes(filterNome.toLowerCase()) ||
                      m.descricao?.toLowerCase().includes(filterNome.toLowerCase());
                    const matchUnidade =
                      !filterUnidade ||
                      m.unidade?.toLowerCase().includes(filterUnidade.toLowerCase());
                    const matchCategoria =
                      !filterCategoria ||
                      m.categoria?.toLowerCase().includes(filterCategoria.toLowerCase());
                    return matchCodigo && matchNome && matchUnidade && matchCategoria;
                  })
                  .map((mat) => {
                    const estoqueTotal = saldos
                      .filter((s) => s.material_id === mat.id)
                      .reduce((sum, s) => sum + (s.quantidade || 0), 0);

                    return (
                      <TableRow key={mat.id}>
                        <TableCell className="font-mono text-sm">{mat.codigo || "-"}</TableCell>
                        <TableCell className="font-medium">{mat.nome || mat.descricao}</TableCell>
                        <TableCell>{mat.unidade}</TableCell>
                        <TableCell>{mat.categoria || "-"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {estoqueTotal} {mat.unidade}
                        </TableCell>
                        <TableCell className="text-right">{mat.estoque_minimo}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {temPermissao("Estoque", "Materiais", "editar") && (
                                <DropdownMenuItem onClick={() => handleOpenMaterial(mat)}>
                                  <Edit className="w-4 h-4 mr-2" /> Editar
                                </DropdownMenuItem>
                              )}
                              {temPermissao("Estoque", "Materiais", "excluir") && (
                                <DropdownMenuItem
                                  onClick={() => handleDeleteMaterial(mat)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" /> Excluir
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Almoxarifados */}
        <TabsContent value="almoxarifados">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {almoxarifados
              .filter((a) => a.ativo !== false)
              .map((almox) => (
                <Card key={almox.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mb-3">
                        <Warehouse className="w-5 h-5 text-amber-600" />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenAlmoxarifado(almox)}>
                            <Edit className="w-4 h-4 mr-2" /> Editar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <h3 className="font-semibold text-slate-800">{almox.nome}</h3>
                    {almox.endereco && (
                      <p className="text-sm text-slate-500 mt-1">{almox.endereco}</p>
                    )}
                    {almox.responsavel && (
                      <p className="text-sm text-slate-500">Resp: {almox.responsavel}</p>
                    )}
                    <p className="text-sm text-amber-600 mt-2">
                      {saldos.filter((s) => s.almoxarifado_id === almox.id).length} itens
                    </p>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        {/* ABA Estoque Caminhões */}
        <TabsContent value="caminhoes">
          <EstoqueCaminhaoTab
            empresaAtiva={empresaAtiva}
            user={user}
            materiais={materiais}
            saldos={saldos}
            projetos={projetos}
            onRecarregar={loadData}
          />
        </TabsContent>

        {/* ABA NF-e Devolução */}
        <TabsContent value="notas_devolucao">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Almoxarifado</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead>Chave / Protocolo</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notasDevolucao.map((nota) => (
                  <TableRow key={nota.id}>
                    <TableCell>
                      {nota.data_emissao
                        ? new Date(nota.data_emissao).toLocaleDateString("pt-BR")
                        : "-"}
                    </TableCell>
                    <TableCell className="font-medium">{nota.destinatario_nome || "-"}</TableCell>
                    <TableCell>{nota.almoxarifado_nome || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          nota.status === "Autorizada"
                            ? "bg-green-100 text-green-700"
                            : nota.status === "Erro"
                              ? "bg-red-100 text-red-700"
                              : nota.status === "Enviando"
                                ? "bg-blue-100 text-blue-700"
                                : nota.status === "Cancelada"
                                  ? "bg-slate-100 text-slate-600"
                                  : "bg-yellow-100 text-yellow-700"
                        }
                      >
                        {nota.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(nota.valor_total || 0)}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[160px] truncate">
                      {nota.chave_acesso || nota.protocolo || "-"}
                    </TableCell>
                    <TableCell>
                      {nota.pdf_url && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(nota.pdf_url, "_blank")}
                          title="Ver DANFE"
                        >
                          <FileText className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {notasDevolucao.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      Nenhuma nota de devolução emitida ainda
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Material */}
      <Sheet open={showMaterialModal} onOpenChange={setShowMaterialModal}>
        <SheetContent side="right" className="p-0 flex flex-col" data-fullscreen-modal>
          <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
            <SheetHeader className="flex-1">
              <SheetTitle>{selectedItem ? "Editar Material" : "Novo Material"}</SheetTitle>
            </SheetHeader>
            <button
              onClick={() => setShowMaterialModal(false)}
              className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          <div className="p-6 flex-1 overflow-y-auto space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Código</Label>
                <Input
                  value={materialForm.codigo}
                  onChange={(e) => setMaterialForm({ ...materialForm, codigo: e.target.value })}
                  placeholder="MAT-001"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Unidade</Label>
                <Select
                  value={materialForm.unidade}
                  onValueChange={(v) => setMaterialForm({ ...materialForm, unidade: v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UN">UN</SelectItem>
                    <SelectItem value="KG">KG</SelectItem>
                    <SelectItem value="M">M</SelectItem>
                    <SelectItem value="M2">M²</SelectItem>
                    <SelectItem value="M3">M³</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="CX">CX</SelectItem>
                    <SelectItem value="PC">PC</SelectItem>
                    <SelectItem value="SC">SC</SelectItem>
                    <SelectItem value="TN">TN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nome *</Label>
              <Input
                value={materialForm.nome || materialForm.descricao}
                onChange={(e) =>
                  setMaterialForm({
                    ...materialForm,
                    nome: e.target.value,
                    descricao: e.target.value,
                  })
                }
                placeholder="Ex: Cimento CP II 50kg"
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria</Label>
                <Input
                  value={materialForm.categoria}
                  onChange={(e) => setMaterialForm({ ...materialForm, categoria: e.target.value })}
                  placeholder="Ex: Construção"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Estoque Mínimo</Label>
                <Input
                  type="number"
                  value={materialForm.estoque_minimo}
                  onChange={(e) =>
                    setMaterialForm({
                      ...materialForm,
                      estoque_minimo: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowMaterialModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveMaterial}
              disabled={saving || (!materialForm.nome && !materialForm.descricao)}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal Almoxarifado */}
      <Sheet open={showAlmoxarifadoModal} onOpenChange={setShowAlmoxarifadoModal}>
        <SheetContent side="right" className="p-0 flex flex-col" data-fullscreen-modal>
          <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
            <SheetHeader className="flex-1">
              <SheetTitle>{selectedItem ? "Editar Almoxarifado" : "Novo Almoxarifado"}</SheetTitle>
            </SheetHeader>
            <button
              onClick={() => setShowAlmoxarifadoModal(false)}
              className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          <div className="p-6 flex-1 overflow-y-auto space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={almoxarifadoForm.nome}
                onChange={(e) => setAlmoxarifadoForm({ ...almoxarifadoForm, nome: e.target.value })}
                placeholder="Ex: Almoxarifado Central"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Endereço</Label>
              <Input
                value={almoxarifadoForm.endereco}
                onChange={(e) =>
                  setAlmoxarifadoForm({ ...almoxarifadoForm, endereco: e.target.value })
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Responsável</Label>
              <Input
                value={almoxarifadoForm.responsavel}
                onChange={(e) =>
                  setAlmoxarifadoForm({ ...almoxarifadoForm, responsavel: e.target.value })
                }
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowAlmoxarifadoModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveAlmoxarifado}
              disabled={saving || !almoxarifadoForm.nome}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal Movimento */}
      <Sheet open={showMovimentoModal} onOpenChange={setShowMovimentoModal}>
        <SheetContent side="right" className="p-0 flex flex-col" data-fullscreen-modal>
          <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
            <SheetHeader className="flex-1">
              <SheetTitle>Registrar Movimento</SheetTitle>
            </SheetHeader>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportarMovimentacoes(true)}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Ações em Lote
              </Button>
              <button
                onClick={() => setShowMovimentoModal(false)}
                className="ml-2 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          </div>
          <div className="p-6 flex-1 overflow-y-auto space-y-4">
            <div>
              <Label>Tipo de Movimento</Label>
              <Select
                value={movimentoForm.tipo}
                onValueChange={(v) => setMovimentoForm({ ...movimentoForm, tipo: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Entrada">Entrada</SelectItem>
                  <SelectItem value="Saída">Saída</SelectItem>
                  <SelectItem value="Ajuste">Ajuste</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Material *</Label>
              <Popover open={openMaterialCombo} onOpenChange={setOpenMaterialCombo}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openMaterialCombo}
                    className="w-full justify-between mt-1.5"
                  >
                    {movimentoForm.material_id
                      ? materiais.find((m) => m.id === movimentoForm.material_id)?.nome ||
                        materiais.find((m) => m.id === movimentoForm.material_id)?.descricao
                      : "Buscar material..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar material..." />
                    <CommandList>
                      <CommandEmpty>Nenhum material encontrado.</CommandEmpty>
                      <CommandGroup>
                        {materiais
                          .filter((m) => m.ativo)
                          .map((m) => (
                            <CommandItem
                              key={m.id}
                              value={`${m.nome || m.descricao} ${m.codigo}`}
                              onSelect={() => {
                                setMovimentoForm({ ...movimentoForm, material_id: m.id });
                                setOpenMaterialCombo(false);
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  movimentoForm.material_id === m.id ? "opacity-100" : "opacity-0"
                                }`}
                              />
                              <div className="flex flex-col">
                                <span className="font-medium">{m.nome || m.descricao}</span>
                                <span className="text-xs text-slate-500">{m.codigo}</span>
                              </div>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Almoxarifado *</Label>
              <Popover open={openAlmoxCombo} onOpenChange={setOpenAlmoxCombo}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openAlmoxCombo}
                    className="w-full justify-between mt-1.5"
                  >
                    {movimentoForm.almoxarifado_id
                      ? almoxarifados.find((a) => a.id === movimentoForm.almoxarifado_id)?.nome
                      : "Buscar almoxarifado..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar almoxarifado..." />
                    <CommandList>
                      <CommandEmpty>Nenhum almoxarifado encontrado.</CommandEmpty>
                      <CommandGroup>
                        {almoxarifados.map((a) => (
                          <CommandItem
                            key={a.id}
                            value={a.nome || a.id}
                            onSelect={() => {
                              setMovimentoForm({ ...movimentoForm, almoxarifado_id: a.id });
                              setOpenAlmoxCombo(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                movimentoForm.almoxarifado_id === a.id ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            {a.nome}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantidade *</Label>
                <Input
                  type="number"
                  value={movimentoForm.quantidade}
                  onChange={(e) =>
                    setMovimentoForm({
                      ...movimentoForm,
                      quantidade: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Valor Unitário</Label>
                <Input
                  type="number"
                  value={movimentoForm.valor_unitario}
                  onChange={(e) =>
                    setMovimentoForm({
                      ...movimentoForm,
                      valor_unitario: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label>Projeto (opcional)</Label>
              <Select
                value={movimentoForm.projeto_id}
                onValueChange={(v) => setMovimentoForm({ ...movimentoForm, projeto_id: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={movimentoForm.observacoes}
                onChange={(e) =>
                  setMovimentoForm({ ...movimentoForm, observacoes: e.target.value })
                }
                className="mt-1.5"
                rows={2}
              />
            </div>
          </div>
          <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowMovimentoModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveMovimento}
              disabled={
                saving ||
                !movimentoForm.material_id ||
                !movimentoForm.almoxarifado_id ||
                movimentoForm.quantidade <= 0
              }
              className="bg-amber-500 hover:bg-amber-600"
            >
              {saving ? "Salvando..." : "Registrar Movimento"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal de Reserva Múltipla */}
      <ReservaMateriaisModal
        open={showReservaMateriaisModal}
        onOpenChange={setShowReservaMateriaisModal}
        saldosSelecionados={Array.from(saldosSelecionados)}
        projetos={projetos}
        empresaAtiva={empresaAtiva}
        user={user}
        saldos={saldos}
        onSave={() => {
          setSaldosSelecionados(new Set());
          loadData();
        }}
      />

      {/* Modal Importar Movimentações */}
      <ImportarMovimentacoesModal
        open={showImportarMovimentacoes}
        onOpenChange={setShowImportarMovimentacoes}
        empresaAtiva={empresaAtiva}
        materiais={materiais}
        almoxarifados={almoxarifados}
        projetos={projetos}
        user={user}
        onSave={() => {
          setShowImportarMovimentacoes(false);
          loadData();
        }}
      />

      {/* Modal NF-e Devolução */}
      <NotaDevolucaoModal
        open={showNotaDevolucaoModal}
        onOpenChange={(v) => {
          setShowNotaDevolucaoModal(v);
          if (!v) loadData();
        }}
        empresaAtiva={empresaAtiva}
        user={user}
        saldos={saldos}
        materiais={materiais}
        almoxarifados={almoxarifados}
      />

      <ReservaDetalheModal
        open={reservaDetalheOpen}
        onOpenChange={setReservaDetalheOpen}
        reservas={reservas}
        grupo={reservaDetalheGrupo}
        onUpdate={loadData}
      />

      {/* Modal de Reserva */}
      <Sheet open={showReservaModal} onOpenChange={setShowReservaModal}>
        <SheetContent side="right" className="p-0 flex flex-col" data-fullscreen-modal>
          <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
            <SheetHeader className="flex-1">
              <SheetTitle>Nova Reserva de Material</SheetTitle>
            </SheetHeader>
            <button
              onClick={() => setShowReservaModal(false)}
              className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          <div className="p-6 flex-1 overflow-y-auto space-y-4">
            {/* PROJETO PRIMEIRO */}
            <div>
              <Label className="text-sm font-semibold block mb-2">
                Projeto(s) *{" "}
                <span className="text-xs font-normal text-slate-500">(um ou mais)</span>
              </Label>
              <Popover open={openProjetoReservaCombo} onOpenChange={setOpenProjetoReservaCombo}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between">
                    {(reservaForm.projetos_ids || []).length === 0
                      ? "Buscar projetos..."
                      : `${(reservaForm.projetos_ids || []).length} projeto(s) selecionado(s)`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar projeto..." />
                    <CommandList>
                      <CommandEmpty>Nenhum projeto encontrado.</CommandEmpty>
                      <CommandGroup>
                        {projetos.map((p) => {
                          const selected = (reservaForm.projetos_ids || []).includes(p.id);
                          return (
                            <CommandItem
                              key={p.id}
                              value={p.nome || p.id}
                              onSelect={async () => {
                                const current = reservaForm.projetos_ids || [];
                                const next = selected
                                  ? current.filter((id) => id !== p.id)
                                  : [...current, p.id];
                                const firstProj = projetos.find((x) => x.id === next[0]);
                                setReservaForm({
                                  ...reservaForm,
                                  projetos_ids: next,
                                  projeto_id: next[0] || "",
                                  projeto_nome: firstProj?.nome || "",
                                  material_id: "",
                                  material_codigo: "",
                                  material_descricao: "",
                                  almoxarifado_id: "",
                                  almoxarifado_nome: "",
                                  unidade: "",
                                });
                                if (next.length > 0) {
                                  const saldosFiltrados = saldos.filter(
                                    (s) => (s.quantidade_disponivel || 0) > 0
                                  );
                                  setMateriaisDoProjetoReserva(saldosFiltrados);
                                } else {
                                  setMateriaisDoProjetoReserva([]);
                                }
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`}
                              />
                              {p.nome}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {(reservaForm.projetos_ids || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(reservaForm.projetos_ids || []).map((id) => {
                    const proj = projetos.find((p) => p.id === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full"
                      >
                        {proj?.nome}
                        <button
                          type="button"
                          onClick={async () => {
                            const next = (reservaForm.projetos_ids || []).filter((x) => x !== id);
                            const firstProj = projetos.find((p) => p.id === next[0]);
                            setReservaForm({
                              ...reservaForm,
                              projetos_ids: next,
                              projeto_id: next[0] || "",
                              projeto_nome: firstProj?.nome || "",
                              material_id: "",
                              material_descricao: "",
                              material_codigo: "",
                              almoxarifado_id: "",
                              almoxarifado_nome: "",
                              unidade: "",
                            });
                            if (next.length > 0) {
                              setMateriaisDoProjetoReserva(
                                saldos.filter((s) => (s.quantidade_disponivel || 0) > 0)
                              );
                            } else {
                              setMateriaisDoProjetoReserva([]);
                            }
                          }}
                          className="hover:text-blue-900 font-bold"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <Label>Quantidade a Reservar</Label>
              <Input
                type="number"
                value={reservaForm.quantidade_reservada}
                onChange={(e) =>
                  setReservaForm({ ...reservaForm, quantidade_reservada: e.target.value })
                }
                placeholder="0"
                className="mt-1.5"
              />
              {reservaForm.material_id &&
                (() => {
                  const saldo = saldos.find((s) => s.material_id === reservaForm.material_id);
                  return (
                    <p className="text-xs text-slate-500 mt-1">
                      Disponível: {saldo?.quantidade_disponivel || 0} {saldo?.unidade}
                    </p>
                  );
                })()}
            </div>

            <div>
              <Label>Data de Necessidade</Label>
              <Input
                type="date"
                value={reservaForm.data_necessidade}
                onChange={(e) =>
                  setReservaForm({ ...reservaForm, data_necessidade: e.target.value })
                }
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={reservaForm.observacoes}
                onChange={(e) => setReservaForm({ ...reservaForm, observacoes: e.target.value })}
                placeholder="Observações sobre a reserva..."
                className="mt-1.5"
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowReservaModal(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  const projetosParaReservar =
                    reservaForm.projetos_ids?.length > 0
                      ? reservaForm.projetos_ids
                      : reservaForm.projeto_id
                        ? [reservaForm.projeto_id]
                        : [];
                  if (projetosParaReservar.length === 0) {
                    alert("Selecione ao menos um projeto");
                    return;
                  }

                  const qtdReservar = parseFloat(reservaForm.quantidade_reservada) || 0;

                  // Gerar número e grupo únicos para esta reserva
                  const grupoId = `grp_${Date.now()}`;
                  const todasReservas = await sigo.entities.ReservaMaterial.filter({
                    empresa_id: empresaAtiva.id,
                  });
                  const proximoNum = (todasReservas.length || 0) + 1;
                  const numeroReserva = `RES-${String(proximoNum).padStart(4, "0")}`;

                  for (const projId of projetosParaReservar) {
                    const proj = projetos.find((p) => p.id === projId);
                    await sigo.entities.ReservaMaterial.create({
                      empresa_id: empresaAtiva.id,
                      numero: numeroReserva,
                      grupo_id: grupoId,
                      material_id: reservaForm.material_id,
                      material_codigo: reservaForm.material_codigo,
                      material_descricao: reservaForm.material_descricao,
                      almoxarifado_id: reservaForm.almoxarifado_id,
                      almoxarifado_nome: reservaForm.almoxarifado_nome,
                      projeto_id: projId,
                      projeto_nome: proj?.nome,
                      quantidade_reservada: qtdReservar,
                      unidade: reservaForm.unidade,
                      data_reserva: new Date().toISOString().split("T")[0],
                      data_necessidade: reservaForm.data_necessidade || null,
                      solicitante_id: user?.id,
                      solicitante_nome: user?.full_name,
                      status: "Ativa",
                      observacoes: reservaForm.observacoes,
                    });
                  }

                  setShowReservaModal(false);
                  loadData();
                  alert(`✅ Reserva ${numeroReserva} criada com sucesso!`);
                }}
                className="flex-1 bg-amber-500 hover:bg-amber-600"
              >
                Confirmar Reserva
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
