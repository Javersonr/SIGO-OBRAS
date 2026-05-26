import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEmpresa } from "../Layout";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Download,
  Upload,
  FileText,
  Eye,
  MapPin,
  Package,
  Camera,
  AlertCircle,
} from "lucide-react";
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
import SheetModalComponent from "@/components/ui/sheet-modal";
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
import { toast } from "sonner";
import ConteudoAbas from "@/components/ferramental/ConteudoAbas";
import CodigoDuplicadoModal from "@/components/ferramental/CodigoDuplicadoModal";
import ScannerCodigoBarras from "@/components/ferramental/ScannerCodigoBarras";
import QRCodeGenerator from "@/components/ferramental/QRCodeGenerator";
import ConfiguracaoManutencaoModal from "@/components/ferramental/ConfiguracaoManutencaoModal";
import GerenciadorCaminhoesModal from "@/components/ferramental/GerenciadorCaminhoesModal";
import FerramentaDetalheModal from "@/components/ferramental/FerramentaDetalheModal";
import FerramentaDetalhesModal from "@/components/ferramental/FerramentaDetalhesModal";
import InventarioModal from "@/components/ferramental/InventarioModal";
import ConciliacaoModal from "@/components/ferramental/ConciliacaoModal";
import { Switch } from "@/components/ui/switch";
import { exportarLaudos } from "@/components/ferramental/useExportarLaudos";
import ExportarLaudosProgress from "@/components/ferramental/ExportarLaudosProgress";
import BarraAcoesMassa from "@/components/ferramental/BarraAcoesMassa";
import VincularMassaCarrosselModal from "@/components/ferramental/VincularMassaCarrosselModal";

import { useVinculosObrigatorios } from "@/components/ferramental/useVinculosObrigatorios";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ObrigatoriosUnificadosTab from "@/components/ferramental/ObrigatoriosUnificadosTab";

const ferramentaSchema = {
  empresa_id: "",
  codigo: "",
  tipo: "Ferramenta",
  descricao: "",
  marca: "",
  modelo: "",
  numero_serie: "",
  ca: "",
  status: "Disponível",
  localizacao: "",
  projeto_id: "",
  projeto_nome: "",
  valor_unitario: 0,
  numero_laudo: "",
  data_vencimento_laudo: "",
  laudo_url: "",
  quantidade_estoque: 1,
  quantidade_minima: 0,
  observacoes: "",
  ativo: true,
};

export default function Ferramental() {
  const { empresaAtiva, perfil, user, temPermissao, vinculo } = useEmpresa();
  const [ferramentas, setFerramentas] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterLaudo, setFilterLaudo] = useState("all");
  const [filterCaminhao, setFilterCaminhao] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState(ferramentaSchema);
  const [saving, setSaving] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState("");
  const [ferramentaParaEditarAposImage, setFerramentaParaEditarAposImage] = useState(null);
  const [showEntradaModal, setShowEntradaModal] = useState(false);
  const [entradaForm, setEntradaForm] = useState({
    ferramenta_id: "",
    quantidade: "",
    valor_unitario: "",
    observacoes: "",
    localizacao: "",
  });
  const [showConciliacaoModal, setShowConciliacaoModal] = useState(false);
  const [itensConciliacao, setItensConciliacao] = useState([]);
  const [showDetalhesModal, setShowDetalhesModal] = useState(false);
  const [ferramentaDetalhes, setFerramentaDetalhes] = useState(null);
  const [editandoDoDetalhe, setEditandoDoDetalhe] = useState(false);
  const [showAlmoxarifadosModal, setShowAlmoxarifadosModal] = useState(false);
  const [almoxarifados, setAlmoxarifados] = useState([]);
  const [novoAlmoxarifado, setNovoAlmoxarifado] = useState("");
  const [historicoMovimentacoes, setHistoricoMovimentacoes] = useState([]);
  const [showHistoricoModal, setShowHistoricoModal] = useState(false);
  const [historicoItemSelecionado, setHistoricoItemSelecionado] = useState([]);
  const [editandoCampoItem, setEditandoCampoItem] = useState({});
  const [showConfigurarManutencaoModal, setShowConfigurarManutencaoModal] = useState(false);
  const [ferramentaConfigurarManutencao, setFerramentaConfigurarManutencao] = useState(null);
  const [showCodigoDuplicadoModal, setShowCodigoDuplicadoModal] = useState(false);
  const [showGerenciadorCaminhoesModal, setShowGerenciadorCaminhoesModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [funcionarios, setFuncionarios] = useState([]);
  const [caminhoes, setCaminhoes] = useState([]);
  const [showQRCodeModal, setShowQRCodeModal] = useState(false);
  const [qrcodeData, setQrcodeData] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [tipoLocalizacao, setTipoLocalizacao] = useState("almoxarifado");
  const [showFerramentaDetalhe, setShowFerramentaDetalhe] = useState(false);
  const [ferramentaDetalhe, setFerramentaDetalhe] = useState(null);
  const [showInventario, setShowInventario] = useState(false);
  const [uploadingLaudo, setUploadingLaudo] = useState(false);
  const [showLaudoMassaModal, setShowLaudoMassaModal] = useState(false);
  const [salvandoLaudoMassa, setSalvandoLaudoMassa] = useState(false);
  const [laudoMassaObrigatorio, setLaudoMassaObrigatorio] = useState(true);
  const [exportProgress, setExportProgress] = useState(null);
  const [camposObrigatorios, setCamposObrigatorios] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [showVincularMassa, setShowVincularMassa] = useState(false);
  const vinculosObrigatorios = useVinculosObrigatorios(camposObrigatorios, funcoes, ferramentas);

  useEffect(() => {
    if (empresaAtiva) {
      migrarLocaisAntigos().then(() => {
        loadData();
      });
      loadAlmoxarifados();
      loadFuncionarios();
      loadCaminhoes();
      loadCamposObrigatorios();
      loadFuncoes();
    }
  }, [empresaAtiva?.id]);

  const loadFuncionarios = async () => {
    try {
      const funcs = await base44.entities.Funcionario.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });
      setFuncionarios(funcs);
    } catch (error) {
      console.error("Erro ao carregar funcionários:", error);
    }
  };

  const loadCaminhoes = async () => {
    try {
      const caminhoesDb = await base44.entities.Caminhao.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });
      setCaminhoes(caminhoesDb.map((c) => ({ id: c.id, placa: c.placa, modelo: c.modelo })));
    } catch (error) {
      console.error("Erro ao carregar caminhões:", error);
    }
  };

  const loadCamposObrigatorios = async () => {
    try {
      const campos = await base44.entities.CaminhaoCampoObrigatorio.filter({
        empresa_id: empresaAtiva.id,
      });
      setCamposObrigatorios(campos);
    } catch (error) {
      console.error("Erro ao carregar campos obrigatórios:", error);
    }
  };

  const loadFuncoes = async () => {
    try {
      const funcs = await base44.entities.Funcao.filter({ empresa_id: empresaAtiva.id });
      setFuncoes(funcs);
    } catch (error) {
      console.error("Erro ao carregar funções:", error);
    }
  };

  const migrarLocaisAntigos = async () => {
    try {
      const [caminhoesList, almoxarifadosList, ferramentasList] = await Promise.all([
        base44.entities.Caminhao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        base44.entities.Almoxarifado.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        base44.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }, "", 1000),
      ]);
      const placasValidas = new Set(
        caminhoesList.map((c) => c.placa?.toUpperCase()).filter(Boolean)
      );
      const almoxNomesValidos = new Set(
        almoxarifadosList.map((a) => a.nome?.toLowerCase()).filter(Boolean)
      );
      for (const ferr of ferramentasList) {
        const loc = ferr.localizacao || "";
        if (ferr.caminhao_id) {
          const cam = caminhoesList.find((c) => c.id === ferr.caminhao_id);
          if (cam && loc !== cam.placa) {
            await base44.entities.Ferramenta.update(ferr.id, { localizacao: cam.placa });
          }
          continue;
        }
        if (!loc) continue;
        if (placasValidas.has(loc.toUpperCase()) || almoxNomesValidos.has(loc.toLowerCase()))
          continue;
        const caminhaoMatch = caminhoesList.find(
          (c) => c.placa && loc.toUpperCase().includes(c.placa.toUpperCase())
        );
        if (caminhaoMatch) {
          await base44.entities.Ferramenta.update(ferr.id, {
            localizacao: caminhaoMatch.placa,
            caminhao_id: caminhaoMatch.id,
          });
          continue;
        }
        if (almoxarifadosList.length > 0) {
          await base44.entities.Ferramenta.update(ferr.id, {
            localizacao: almoxarifadosList[0].nome,
          });
        }
      }
    } catch (error) {
      console.error("Erro na normalização de locais:", error);
    }
  };

  const loadAlmoxarifados = async () => {
    try {
      const almoxarifadosDb = await base44.entities.Almoxarifado.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });
      setAlmoxarifados(almoxarifadosDb.map((a) => a.nome).sort());
    } catch (error) {
      console.error("Erro ao carregar almoxarifados:", error);
    }
  };

  const handleAdicionarAlmoxarifado = async () => {
    if (novoAlmoxarifado.trim() && !almoxarifados.includes(novoAlmoxarifado.trim())) {
      try {
        await base44.entities.Almoxarifado.create({
          empresa_id: empresaAtiva.id,
          nome: novoAlmoxarifado.trim(),
          ativo: true,
        });
        loadAlmoxarifados();
        setNovoAlmoxarifado("");
        toast.success("Local adicionado com sucesso!");
      } catch (error) {
        console.error("Erro ao adicionar local:", error);
        toast.error("Erro ao adicionar local");
      }
    }
  };

  const handleRemoverAlmoxarifado = async (local) => {
    try {
      const almoxDb = await base44.entities.Almoxarifado.filter({
        empresa_id: empresaAtiva.id,
        nome: local,
        ativo: true,
      });
      if (almoxDb.length > 0) {
        await base44.entities.Almoxarifado.update(almoxDb[0].id, { ativo: false });
        loadAlmoxarifados();
        toast.success("Local removido com sucesso");
      }
    } catch (error) {
      console.error("Erro ao remover local:", error);
      toast.error("Erro ao remover local");
    }
  };

  const loadHistoricoMovimentacoes = async (ferramentaIds) => {
    try {
      const movimentacoes = await base44.entities.MovimentacaoFerramenta.filter(
        { empresa_id: empresaAtiva.id, ferramenta_id: { $in: ferramentaIds } },
        "-data_movimentacao"
      );
      setHistoricoMovimentacoes(movimentacoes);
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
      setHistoricoMovimentacoes([]);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [ferrs, projs] = await Promise.all([
        base44.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }, "", 1000),
        base44.entities.Projeto.filter({ empresa_id: empresaAtiva.id }, "", 1000),
      ]);
      setFerramentas(ferrs.sort((a, b) => (a.descricao || "").localeCompare(b.descricao || "")));
      setProjetos(projs);
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao carregar ferramentas");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (ferr = null) => {
    if (ferr) {
      setSelectedItem(ferr);
      const dadosCompletos = {
        ...ferramentaSchema,
        empresa_id: ferr.empresa_id || empresaAtiva.id,
        id: ferr.id,
        codigo: ferr.codigo || "",
        tipo: ferr.tipo || "Ferramenta",
        descricao: ferr.descricao || "",
        marca: ferr.marca || "",
        modelo: ferr.modelo || "",
        numero_serie: ferr.numero_serie || "",
        ca: ferr.ca || "",
        status: ferr.status || "Disponível",
        localizacao: ferr.localizacao || "",
        caminhao_id:
          ferr.caminhao_id || caminhoes.find((c) => c.placa === ferr.localizacao)?.id || "",
        funcionario_id: ferr.funcionario_id || "",
        funcionario_nome: ferr.funcionario_nome || "",
        projeto_id: ferr.projeto_id || "",
        projeto_nome: ferr.projeto_nome || "",
        valor_unitario: parseFloat(ferr.valor_unitario) || 0,
        numero_laudo: ferr.numero_laudo || "",
        data_vencimento_laudo: ferr.data_vencimento_laudo || "",
        laudo_url: ferr.laudo_url || "",
        quantidade_estoque: parseInt(ferr.quantidade_estoque) || 1,
        observacoes: ferr.observacoes || "",
        ativo: ferr.ativo !== undefined ? ferr.ativo : true,
      };
      setFormData(dadosCompletos);
      if (ferr.funcionario_id) {
        setTipoLocalizacao("funcionario");
      } else if (
        ferr.caminhao_id ||
        (ferr.localizacao &&
          (ferr.localizacao.toLowerCase().includes("caminhão") ||
            ferr.localizacao.toLowerCase().includes("caminhao") ||
            caminhoes.some((c) => c.placa === ferr.localizacao)))
      ) {
        setTipoLocalizacao("caminhao");
      } else {
        setTipoLocalizacao("almoxarifado");
      }
    } else {
      setSelectedItem(null);
      setFormData({ ...ferramentaSchema, empresa_id: empresaAtiva.id });
      setTipoLocalizacao("almoxarifado");
    }
    setShowModal(true);
  };

  const gerarCodigoAutomatico = (tipoFerramenta = null, descricao = null) => {
    const tipo = (tipoFerramenta || formData.tipo) === "EPI" ? "EPI" : "FER";
    if (descricao) {
      const ferramentasMesmaDescricao = ferramentas.filter(
        (f) => f.descricao && f.descricao.toLowerCase() === descricao.toLowerCase()
      );
      if (ferramentasMesmaDescricao.length > 0) {
        const codigoBase = ferramentasMesmaDescricao[0].codigo.split("-").slice(0, 2).join("-");
        const subCodigos = ferramentasMesmaDescricao
          .map((f) => f.codigo)
          .filter((c) => c.startsWith(codigoBase + "-"))
          .map((c) => parseInt(c.split("-")[2]) || 0)
          .sort((a, b) => b - a);
        const proximoSubCodigo = subCodigos.length > 0 ? subCodigos[0] + 1 : 1;
        return `${codigoBase}-${proximoSubCodigo}`;
      }
    }
    const codigosBase = ferramentas
      .map((f) => f.codigo)
      .filter((c) => c && c.startsWith(tipo + "-"))
      .map((c) => {
        const partes = c.split("-");
        return partes.length >= 2 ? parseInt(partes[1]) : 0;
      })
      .filter((n) => !isNaN(n))
      .sort((a, b) => b - a);
    const proximoNumero = codigosBase.length > 0 ? codigosBase[0] + 1 : 1;
    return `${tipo}-${String(proximoNumero).padStart(3, "0")}-1`;
  };

  const handleSave = async () => {
    if (!formData.descricao) {
      toast.error("Preencha a descrição");
      return;
    }

    let codigo = formData.codigo;
    if (!codigo || codigo.trim() === "") {
      codigo = gerarCodigoAutomatico(formData.tipo, formData.descricao);
    }
    const dataToSave = {
      empresa_id: formData.empresa_id || empresaAtiva.id,
      codigo,
      tipo: formData.tipo,
      descricao: formData.descricao,
      marca: formData.marca || "",
      modelo: formData.modelo || "",
      numero_serie: formData.numero_serie || "",
      ca: formData.ca || "",
      status: formData.status,
      localizacao: formData.localizacao || "",
      caminhao_id: tipoLocalizacao === "caminhao" ? formData.caminhao_id || "" : "",
      funcionario_id: tipoLocalizacao === "funcionario" ? formData.funcionario_id || "" : "",
      funcionario_nome: tipoLocalizacao === "funcionario" ? formData.funcionario_nome || "" : "",
      projeto_id: formData.projeto_id || "",
      projeto_nome: formData.projeto_nome || "",
      valor_unitario: parseFloat(formData.valor_unitario) || 0,
      numero_laudo: formData.numero_laudo || "",
      data_vencimento_laudo: formData.data_vencimento_laudo || "",
      laudo_url: formData.laudo_url || "",
      quantidade_estoque: parseInt(formData.quantidade_estoque) || 1,
      observacoes: formData.observacoes || "",
      qrcode_data: codigo,
      ativo: true,
    };
    setSaving(true);
    try {
      if (selectedItem) {
        await base44.entities.Ferramenta.update(selectedItem.id, dataToSave);
        toast.success("Ferramenta atualizada com sucesso");
      } else {
        await base44.entities.Ferramenta.create(dataToSave);
        toast.success(
          formData.tipo === "EPI" ? "EPI cadastrado com sucesso" : "Ferramenta criada com sucesso"
        );
      }

      setShowModal(false);
      setSelectedItem(null);
      setFormData({ ...ferramentaSchema, empresa_id: empresaAtiva.id });
      setTipoLocalizacao("almoxarifado");
      await loadData();
    } catch (error) {
      console.error("Erro completo ao salvar:", error);
      toast.error("Erro ao salvar ferramenta: " + (error.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Deseja deletar esta ferramenta?")) return;
    try {
      await base44.entities.Ferramenta.delete(id);
      toast.success("Ferramenta deletada");
      loadData();
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao deletar ferramenta");
    }
  };

  const handleDuplicarItem = async (ferramentaOrigem) => {
    if (!ferramentaOrigem || !ferramentaOrigem.id) {
      toast.error("Ferramenta não encontrada. Tente recarregar a página.");
      return;
    }
    const novoCodigo = prompt(
      `Informe o novo código para a cópia de "${ferramentaOrigem.descricao}":\n(Código original: ${ferramentaOrigem.codigo})`,
      gerarCodigoAutomatico(ferramentaOrigem.tipo, ferramentaOrigem.descricao)
    );
    if (!novoCodigo || !novoCodigo.trim()) return;
    const codigoExistente = ferramentas.find((f) => f.codigo === novoCodigo.trim());
    if (codigoExistente) {
      toast.error(`Código "${novoCodigo.trim()}" já está em uso`);
      return;
    }
    try {
      const { id, created_date, updated_date, created_by, ...dadosOriginais } = ferramentaOrigem;
      await base44.entities.Ferramenta.create({
        ...dadosOriginais,
        codigo: novoCodigo.trim(),
        qrcode_data: novoCodigo.trim(),
        status: "Disponível",
        funcionario_id: "",
        funcionario_nome: "",
        numero_serie: "",
      });
      toast.success(`Ferramenta duplicada com código "${novoCodigo.trim()}"`);
      await loadData();
      if (ferramentaDetalhes) {
        const ferramentasAtualizadas = await base44.entities.Ferramenta.filter(
          { empresa_id: empresaAtiva.id, ativo: true },
          "",
          1000
        );
        const grupoAtualizado = ferramentasAtualizadas.filter(
          (f) =>
            f.descricao?.toLowerCase().trim() === ferramentaDetalhes.descricao?.toLowerCase().trim()
        );
        setFerramentaDetalhes((prev) => ({
          ...prev,
          itens: grupoAtualizado.map((f) => ({
            id: f.id,
            codigo: f.codigo,
            localizacao: f.localizacao,
            status: f.status,
            numero_serie: f.numero_serie,
            numero_laudo: f.numero_laudo,
            data_vencimento_laudo: f.data_vencimento_laudo,
            numero: f.numero,
            ca: f.ca,
            observacoes: f.observacoes,
            funcionario_nome: f.funcionario_nome,
            funcionario_id: f.funcionario_id,
            fornecedor_nome: f.fornecedor_nome,
            fornecedor_id: f.fornecedor_id,
          })),
        }));
      }
    } catch (error) {
      console.error("Erro ao duplicar:", error);
      toast.error("Erro ao duplicar ferramenta");
    }
  };

  const handleSaveEntrada = async () => {
    if (!entradaForm.ferramenta_id || !entradaForm.quantidade) {
      toast.error("Preencha ferramenta e quantidade");
      return;
    }
    try {
      let ferramentaBase = ferramentas.find((f) => f.id === entradaForm.ferramenta_id);
      if (!ferramentaBase) {
        const candidatos = ferramentas.filter(
          (f) => (f.descricao || "").toLowerCase() === entradaForm.ferramenta_id.toLowerCase()
        );
        if (candidatos.length > 0) {
          ferramentaBase = candidatos[0];
        } else {
          toast.error("Ferramenta não encontrada");
          return;
        }
      }
      const quantidade = parseInt(entradaForm.quantidade);
      const valorUnitario =
        parseFloat(entradaForm.valor_unitario) || ferramentaBase.valor_unitario || 0;
      let ferramentasAtuais = await base44.entities.Ferramenta.filter(
        { empresa_id: empresaAtiva.id, ativo: true },
        "",
        1000
      );
      for (let i = 0; i < quantidade; i++) {
        const novoCodigo = gerarCodigoLocal(
          ferramentasAtuais,
          ferramentaBase.tipo,
          ferramentaBase.descricao
        );
        const novaFerramenta = await base44.entities.Ferramenta.create({
          empresa_id: empresaAtiva.id,
          codigo: novoCodigo,
          descricao: ferramentaBase.descricao,
          tipo: ferramentaBase.tipo,
          marca: ferramentaBase.marca,
          ca: ferramentaBase.ca,
          status: "Disponível",
          localizacao: entradaForm.localizacao || "Almoxarifado",
          valor_unitario: valorUnitario,
          quantidade_estoque: 1,
          numero_serie: "",
          qrcode_data: novoCodigo,
          observacoes: entradaForm.observacoes || "",
          ativo: true,
        });
        ferramentasAtuais = [...ferramentasAtuais, { ...novaFerramenta, codigo: novoCodigo }];
        await base44.entities.MovimentacaoFerramenta.create({
          empresa_id: empresaAtiva.id,
          ferramenta_id: novaFerramenta.id,
          ferramenta_codigo: novoCodigo,
          ferramenta_descricao: ferramentaBase.descricao,
          tipo_movimentacao: "Entrada Estoque",
          quantidade: 1,
          usuario_nome: user.full_name,
          usuario_email: user.email,
          destino: entradaForm.localizacao || "Almoxarifado",
          observacoes: entradaForm.observacoes || "Entrada manual de estoque",
          data_movimentacao: new Date().toISOString().split("T")[0],
          status: "Realizada",
        });
      }
      toast.success(
        `${quantidade} ${quantidade === 1 ? "unidade registrada" : "unidades registradas"} com sucesso`
      );
      setShowEntradaModal(false);
      setEntradaForm({
        ferramenta_id: "",
        quantidade: "",
        valor_unitario: "",
        observacoes: "",
        localizacao: "",
      });
      await loadData();
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao registrar entrada");
    }
  };

  const handleExportarFerramentas = () => {
    const dados = ferramentas.map((f) => [
      f.codigo || "",
      f.descricao || "",
      f.marca || "",
      "",
      "",
      "",
    ]);
    const headers = ["Código", "Descrição", "Marca", "Quantidade", "Valor Unitário", "Observações"];
    const linhas = [headers, ...dados];
    const csv = linhas
      .map((row) =>
        row
          .map((cell) => {
            const cellStr = String(cell).replace(/"/g, '""');
            return cellStr.includes(";") || cellStr.includes("\n") || cellStr.includes('"')
              ? `"${cellStr}"`
              : cellStr;
          })
          .join(";")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `modelo_entrada_estoque_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success("Modelo de entrada exportado");
  };

  const handleBaixarModelo = () => {
    const headers = ["Código", "Descrição", "Marca", "Quantidade", "Valor Unitário", "Observações"];
    const exemploData = [
      ["FER-001", "Furadeira de Impacto", "Bosch", "10", "250.00", "Entrada de estoque"],
      ["EPI-001", "Capacete de Segurança", "Protenge", "50", "50.00", "Compra mensal"],
      ["FER-003", "Nível a Laser", "DeWalt", "5", "450.00", "Reposição"],
    ];
    const linhas = [headers, ...exemploData];
    const csv = linhas
      .map((row) =>
        row
          .map((cell) => {
            const cellStr = String(cell).replace(/"/g, '""');
            return cellStr.includes(";") || cellStr.includes("\n") || cellStr.includes('"')
              ? `"${cellStr}"`
              : cellStr;
          })
          .join(";")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "modelo_entrada_estoque.csv";
    link.click();
    toast.success("Modelo baixado com sucesso");
  };

  const calcularSimilaridade = (str1, str2) => {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    if (s1 === s2) return 1;
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    const editDistance = (s1, s2) => {
      s1 = s1.toLowerCase();
      s2 = s2.toLowerCase();
      const costs = [];
      for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
          if (i === 0) {
            costs[j] = j;
          } else if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            }
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
        if (i > 0) costs[s2.length] = lastValue;
      }
      return costs[s2.length];
    };
    return (longer.length - editDistance(longer, shorter)) / longer.length;
  };

  const handleImportarFerramentas = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target.result;
        if (text.charCodeAt(0) === 0xfeff) {
          text = text.slice(1);
        }
        const firstLine = text.split(/\r?\n/)[0] || "";
        const totalTabFirst = (firstLine.match(/\t/g) || []).length;
        const totalSemiFirst = (firstLine.match(/;/g) || []).length;
        const totalCommaFirst = (firstLine.match(/,/g) || []).length;
        const sep =
          totalTabFirst > 0 && totalTabFirst >= totalSemiFirst && totalTabFirst >= totalCommaFirst
            ? "\t"
            : totalSemiFirst > 0
              ? ";"
              : ",";
        const parseCSVFull = (rawText, separator) => {
          const rows = [];
          let cur = "";
          let inQ = false;
          for (let i = 0; i < rawText.length; i++) {
            const c = rawText[i];
            const next = rawText[i + 1];
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
              } else if (ch === separator && !inQuote) {
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
        const allRows = parseCSVFull(text, sep);
        if (allRows.length <= 1) {
          toast.error("Arquivo vazio ou sem dados válidos");
          return;
        }
        const dataRows = allRows.slice(1).filter((r) => r.some((v) => v.trim()));
        const entradasParaConciliar = [];
        for (let i = 0; i < dataRows.length; i++) {
          const values = dataRows[i];
          const codigo = values[0]?.trim();
          const descricao = values[1]?.trim();
          const marca = values[2]?.trim();
          const quantidade = parseInt(values[3]) || 0;
          const valorUnitario = parseFloat(values[4]) || 0;
          const observacoes = values[5]?.trim() || "";
          if (!descricao || quantidade <= 0) continue;
          let ferramentaEncontrada = ferramentas.find((f) => f.codigo === codigo);
          if (!ferramentaEncontrada && codigo) {
            const candidatos = ferramentas
              .map((f) => ({
                ferramenta: f,
                similaridade: calcularSimilaridade(descricao, f.descricao || ""),
              }))
              .filter((c) => c.similaridade > 0.6)
              .sort((a, b) => b.similaridade - a.similaridade);
            if (candidatos.length > 0) {
              entradasParaConciliar.push({
                codigo,
                descricao,
                marca,
                quantidade,
                valorUnitario,
                observacoes,
                candidatos: candidatos.slice(0, 5),
              });
              continue;
            }
          }
          if (ferramentaEncontrada) {
            entradasParaConciliar.push({
              codigo,
              descricao,
              marca,
              quantidade,
              valorUnitario,
              observacoes,
              ferramentaSelecionada: ferramentaEncontrada.id,
              candidatos: [{ ferramenta: ferramentaEncontrada, similaridade: 1 }],
            });
          }
        }
        if (entradasParaConciliar.length === 0) {
          toast.error("Nenhuma entrada válida encontrada");
          return;
        }
        setItensConciliacao(entradasParaConciliar);
        setShowConciliacaoModal(true);
      } catch (error) {
        console.error("Erro ao importar:", error);
        toast.error("Erro ao importar: " + error.message);
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const gerarCodigoLocal = (lista, tipo, descricao) => {
    const tipoPrefix = tipo === "EPI" ? "EPI" : "FER";
    const mesmDesc = lista.filter((f) => f.descricao?.toLowerCase() === descricao?.toLowerCase());
    if (mesmDesc.length > 0) {
      const base = mesmDesc[0].codigo.split("-").slice(0, 2).join("-");
      const nums = lista
        .filter((f) => f.codigo?.startsWith(base + "-"))
        .map((f) => parseInt(f.codigo.split("-")[2]) || 0)
        .sort((a, b) => b - a);
      return `${base}-${(nums[0] || 0) + 1}`;
    }
    const nums = lista
      .filter((f) => f.codigo?.startsWith(tipoPrefix + "-"))
      .map((f) => parseInt(f.codigo.split("-")[1]) || 0)
      .filter((n) => !isNaN(n))
      .sort((a, b) => b - a);
    return `${tipoPrefix}-${String((nums[0] || 0) + 1).padStart(3, "0")}-1`;
  };

  const handleConfirmarConciliacao = async () => {
    try {
      let totalItens = 0;
      let listaLocal = await base44.entities.Ferramenta.filter(
        { empresa_id: empresaAtiva.id, ativo: true },
        "",
        1000
      );
      for (const item of itensConciliacao) {
        if (!item.ferramentaSelecionada || item.ferramentaSelecionada === "ignorar") continue;
        const ferramentaBase = ferramentas.find((f) => f.id === item.ferramentaSelecionada);
        if (!ferramentaBase) continue;
        const valorUnitario = item.valorUnitario || ferramentaBase.valor_unitario || 0;
        for (let i = 0; i < item.quantidade; i++) {
          const novoCodigo = gerarCodigoLocal(
            listaLocal,
            ferramentaBase.tipo,
            ferramentaBase.descricao
          );
          const nova = await base44.entities.Ferramenta.create({
            empresa_id: empresaAtiva.id,
            codigo: novoCodigo,
            descricao: ferramentaBase.descricao,
            tipo: ferramentaBase.tipo,
            marca: item.marca || ferramentaBase.marca,
            ca: ferramentaBase.ca,
            status: "Disponível",
            localizacao: "Almoxarifado",
            valor_unitario: valorUnitario,
            quantidade_estoque: 1,
            numero_serie: "",
            qrcode_data: novoCodigo,
            observacoes: item.observacoes || "",
            caminhao_id: ferramentaBase.caminhao_id || "",
            ativo: true,
          });
          listaLocal = [...listaLocal, { ...nova, codigo: novoCodigo }];
          await base44.entities.MovimentacaoFerramenta.create({
            empresa_id: empresaAtiva.id,
            ferramenta_id: nova.id,
            ferramenta_codigo: novoCodigo,
            ferramenta_descricao: ferramentaBase.descricao,
            tipo_movimentacao: "Entrada Estoque",
            quantidade: 1,
            usuario_nome: user.full_name,
            usuario_email: user.email,
            destino: "Almoxarifado",
            observacoes: item.observacoes || "Entrada via importação",
            data_movimentacao: new Date().toISOString().split("T")[0],
            status: "Realizada",
          });
          totalItens++;
        }
      }
      toast.success(
        `${totalItens} ${totalItens === 1 ? "unidade processada" : "unidades processadas"} com sucesso`
      );
      setShowConciliacaoModal(false);
      setItensConciliacao([]);
      loadData();
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao processar entradas");
    }
  };

  const handleMarcarLaudoObrigatorioEmMassa = async () => {
    const ferramentasSelecionadas = ferramentas.filter((f) => {
      const codigoBase = f.codigo?.split("-").slice(0, 2).join("-") || f.codigo;
      return itensSelecionados.includes(`${codigoBase}-${f.descricao}`);
    });
    if (ferramentasSelecionadas.length === 0) {
      toast.error("Nenhuma ferramenta selecionada");
      return;
    }
    setSalvandoLaudoMassa(true);
    try {
      await Promise.all(
        ferramentasSelecionadas.map((f) =>
          base44.entities.Ferramenta.update(f.id, { laudo_obrigatorio: laudoMassaObrigatorio })
        )
      );
      toast.success(`${ferramentasSelecionadas.length} ferramenta(s) atualizadas`);
      setShowLaudoMassaModal(false);
      setItensSelecionados([]);
      await loadData();
    } catch (error) {
      toast.error("Erro ao atualizar ferramentas");
    } finally {
      setSalvandoLaudoMassa(false);
    }
  };

  const placasAtivas = new Set(caminhoes.map((c) => c.placa).filter(Boolean));
  const locsNasFerramentas = new Set(
    ferramentas
      .filter((f) => !f.funcionario_id)
      .map((f) => f.localizacao)
      .filter(Boolean)
  );
  const localizacoes = [
    ...almoxarifados.filter((a) => locsNasFerramentas.has(a)),
    ...[...placasAtivas].filter((p) => locsNasFerramentas.has(p)),
  ];

  const ferramentasAgrupadas = ferramentas.reduce((acc, f) => {
    const descricaoKey = f.descricao?.toLowerCase().trim() || "sem-descricao";
    if (!acc[descricaoKey]) {
      const codigoPartes = f.codigo?.split("-") || [];
      const codigoBase =
        codigoPartes.length >= 2 ? `${codigoPartes[0]}-${codigoPartes[1]}` : f.codigo;
      acc[descricaoKey] = {
        codigo: codigoBase,
        descricao: f.descricao,
        marca: f.marca,
        modelo: f.modelo,
        tipo: f.tipo,
        valor_unitario: f.valor_unitario,
        foto_url: f.foto_url,
        data_vencimento_laudo: f.data_vencimento_laudo,
        numero_laudo: f.numero_laudo,
        laudo_obrigatorio: f.laudo_obrigatorio || false,
        controle_individual: f.controle_individual || false,
        itens: [],
      };
    }
    // Para itens SEM controle individual, atualiza quantidade total somando quantidade_estoque
    acc[descricaoKey].itens.push({
      id: f.id,
      codigo: f.codigo,
      localizacao: f.localizacao,
      status: f.status,
      numero_serie: f.numero_serie,
      numero_laudo: f.numero_laudo,
      data_vencimento_laudo: f.data_vencimento_laudo,
      numero: f.numero,
      ca: f.ca,
      observacoes: f.observacoes,
      funcionario_nome: f.funcionario_nome || "",
      funcionario_id: f.funcionario_id || "",
      fornecedor_nome: f.fornecedor_nome || "",
      fornecedor_id: f.fornecedor_id || "",
      quantidade_estoque: f.quantidade_estoque || 1,
      controle_individual: f.controle_individual || false,
    });
    return acc;
  }, {});

  const buscaFuzzy = (ferramenta, termo) => {
    if (!termo || termo.trim() === "") return { match: true, score: 100 };
    const termoLower = termo.toLowerCase().trim();
    const campos = [
      { valor: ferramenta.codigo, peso: 3 },
      { valor: ferramenta.descricao, peso: 2 },
      { valor: ferramenta.marca, peso: 1 },
      ...(ferramenta.itens || []).map((item) => ({ valor: item.numero_serie, peso: 2 })),
    ];
    let melhorScore = 0;
    let matched = false;
    for (const campo of campos) {
      if (!campo.valor) continue;
      const valorLower = campo.valor.toLowerCase();
      if (valorLower === termoLower) return { match: true, score: 100 * campo.peso };
      if (valorLower.startsWith(termoLower)) {
        matched = true;
        melhorScore = Math.max(melhorScore, 90 * campo.peso);
        continue;
      }
      if (valorLower.includes(termoLower)) {
        matched = true;
        melhorScore = Math.max(melhorScore, 70 * campo.peso);
        continue;
      }
      const similaridade = calcularSimilaridade(termoLower, valorLower);
      if (similaridade > 0.6) {
        matched = true;
        melhorScore = Math.max(melhorScore, similaridade * 50 * campo.peso);
      }
    }
    return { match: matched, score: melhorScore };
  };

  const filteredFerramentasAgrupadas = Object.values(ferramentasAgrupadas)
    .map((f) => {
      const buscaResult = buscaFuzzy(f, searchTerm);
      const matchLocalizacao =
        filterStatus === "all" ||
        (f.itens &&
          f.itens.some(
            (item) =>
              item.localizacao === filterStatus ||
              (item.localizacao &&
                item.localizacao.toLowerCase().includes(filterStatus.toLowerCase()))
          ));
      const matchTipo = filterTipo === "all" || f.tipo === filterTipo;
      const matchLaudo =
        filterLaudo === "all" ||
        (filterLaudo === "com_laudo" ? f.laudo_obrigatorio === true : f.laudo_obrigatorio !== true);
      const matchCaminhao =
        filterCaminhao === "all" ||
        (f.itens && f.itens.some((item) => item.localizacao === filterCaminhao));
      return {
        ...f,
        _searchScore: buscaResult.score,
        _matchFilters:
          buscaResult.match && matchLocalizacao && matchTipo && matchLaudo && matchCaminhao,
      };
    })
    .filter((f) => f._matchFilters)
    .sort((a, b) => b._searchScore - a._searchScore);

  if (!empresaAtiva) return null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Ferramental</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Controle de ferramentas e equipamentos
          </p>
        </div>
      </div>

      <input
        id="importFerramentasInput"
        type="file"
        className="hidden"
        accept=".csv"
        onChange={handleImportarFerramentas}
      />

      <Tabs defaultValue="ferramentas" className="w-full">
        <TabsList>
          <TabsTrigger value="ferramentas">Ferramentas</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
          <TabsTrigger value="manutencao">Manutenção</TabsTrigger>
          <TabsTrigger value="entregas">Entregas</TabsTrigger>
          <TabsTrigger value="obrigatorios">Obrigatórios</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="ferramentas" className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-800">Ferramentas</h2>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <FileText className="w-4 h-4" />
                    Ações
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => exportarLaudos(ferramentas, caminhoes, setExportProgress)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Exportar Laudos (ZIP)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExportarFerramentas}>
                    <Download className="w-4 h-4 mr-2" />
                    Exportar Modelo Entrada
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleBaixarModelo}>
                    <FileText className="w-4 h-4 mr-2" />
                    Baixar Modelo Vazio
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => document.getElementById("importFerramentasInput")?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Importar Entrada de Estoque
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowAlmoxarifadosModal(true)}>
                    <MapPin className="w-4 h-4 mr-2" />
                    Gerenciar Locais
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowCodigoDuplicadoModal(true)}
                    className="text-orange-600"
                  >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Rastrear Códigos Duplicados
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      if (
                        !confirm(
                          "Deseja limpar todos os registros? Esta ação não pode ser desfeita!"
                        )
                      )
                        return;
                      try {
                        for (const ferr of ferramentas) {
                          await base44.entities.Ferramenta.delete(ferr.id);
                        }
                        toast.success("Todos os registros foram excluídos");
                        loadData();
                      } catch (error) {
                        toast.error("Erro ao limpar registros");
                      }
                    }}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Limpar Todos
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                onClick={() => setShowInventario(true)}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Package className="w-4 h-4" />
                Inventário
              </Button>
              <Button
                onClick={() => setShowScannerModal(true)}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Camera className="w-4 h-4" />
                Scanner
              </Button>
              <Button
                onClick={() => handleOpenModal()}
                className="bg-slate-900 hover:bg-slate-800 gap-2"
                size="sm"
              >
                <Plus className="w-4 h-4" />
                Novo Ferramental
              </Button>
            </div>
          </div>

          <BarraAcoesMassa
            itensSelecionados={itensSelecionados}
            ferramentasAgrupadas={ferramentasAgrupadas}
            ferramentas={ferramentas}
            onLaudoMassa={() => setShowLaudoMassaModal(true)}
            onClearSelecao={() => setItensSelecionados([])}
            empresaAtiva={empresaAtiva}
            perfil={perfil}
            vinculo={vinculo}
            onRefresh={loadData}
            onVincularMassa={() => setShowVincularMassa(true)}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 min-w-0 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por descrição, código ou número de série..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 text-sm"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="w-[150px] text-sm">
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="Ferramenta">Ferramenta</SelectItem>
                  <SelectItem value="EPI">EPI</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[200px] text-sm">
                  <SelectValue placeholder="Todos os locais" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os locais</SelectItem>
                  {localizacoes.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterLaudo} onValueChange={setFilterLaudo}>
                <SelectTrigger className="w-[170px] text-sm">
                  <SelectValue placeholder="Laudo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos (laudo)</SelectItem>
                  <SelectItem value="com_laudo">📄 Com laudo obrigatório</SelectItem>
                  <SelectItem value="sem_laudo">Sem laudo obrigatório</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300"
                      checked={
                        filteredFerramentasAgrupadas.length > 0 &&
                        itensSelecionados.length === filteredFerramentasAgrupadas.length
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setItensSelecionados(
                            filteredFerramentasAgrupadas.map((f) => `${f.codigo}-${f.descricao}`)
                          );
                        } else {
                          setItensSelecionados([]);
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead className="text-xs sm:text-sm">Descrição</TableHead>
                  <TableHead className="text-xs sm:text-sm">Código</TableHead>
                  <TableHead className="text-xs sm:text-sm">Tipo</TableHead>
                  <TableHead className="text-xs sm:text-sm">Localização</TableHead>
                  <TableHead className="text-xs sm:text-sm text-center">Quant.</TableHead>
                  <TableHead className="text-xs sm:text-sm text-right">Valor Unit.</TableHead>
                  <TableHead className="text-xs sm:text-sm w-28">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filteredFerramentasAgrupadas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                      Nenhuma ferramenta encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFerramentasAgrupadas.map((ferr) => {
                    const itens = ferr.itens || [];
                    const itemKey = `${ferr.codigo}-${ferr.descricao}`;
                    return (
                      <TableRow
                        key={itemKey}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => {
                          setFerramentaDetalhes(ferr);
                          setShowDetalhesModal(true);
                          loadHistoricoMovimentacoes(itens.map((item) => item.id));
                        }}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300"
                            checked={itensSelecionados.includes(itemKey)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setItensSelecionados([...itensSelecionados, itemKey]);
                              } else {
                                setItensSelecionados(
                                  itensSelecionados.filter((id) => id !== itemKey)
                                );
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            {ferr.descricao}
                            {ferr.laudo_obrigatorio && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 flex-shrink-0">
                                <FileText className="w-3 h-3" />
                                Laudo
                              </span>
                            )}
                            {(() => {
                              const v =
                                vinculosObrigatorios[(ferr.descricao || "").toLowerCase().trim()];
                              return v ? (
                                <>
                                  {v.caminhoes?.length > 0 && (
                                    <span
                                      title={v.caminhoes.join(", ")}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 flex-shrink-0"
                                    >
                                      🚛 {v.caminhoes.length}
                                    </span>
                                  )}
                                  {v.funcoes?.length > 0 && (
                                    <span
                                      title={v.funcoes.join(", ")}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200 flex-shrink-0"
                                    >
                                      👤 {v.funcoes.length}
                                    </span>
                                  )}
                                </>
                              ) : null;
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{ferr.codigo}</TableCell>
                        <TableCell>
                          <Badge
                            variant={ferr.tipo === "EPI" ? "default" : "outline"}
                            className="text-xs"
                          >
                            {ferr.tipo || "Ferramenta"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-xs font-semibold">
                            {ferr.controle_individual
                              ? itens.length
                              : itens.reduce((sum, i) => sum + (i.quantidade_estoque || 1), 0)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          R$ {(ferr.valor_unitario || 0).toFixed(2)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                const ferramentaCompleta = ferramentas.find(
                                  (f) => f.id === itens[0].id
                                );
                                setFerramentaDetalhe(ferramentaCompleta);
                                setShowFerramentaDetalhe(true);
                              }}
                              title="Ver Detalhes"
                              className="h-8 w-8"
                            >
                              <Eye className="w-4 h-4 text-blue-500" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (itens.length === 1) {
                                  handleOpenModal(
                                    ferramentas.find((f) => f.id === itens[0].id) || itens[0]
                                  );
                                } else {
                                  setFerramentaDetalhes(ferr);
                                  setShowDetalhesModal(true);
                                  loadHistoricoMovimentacoes(itens.map((item) => item.id));
                                }
                              }}
                              title="Editar"
                              className="h-8 w-8"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={async () => {
                                if (
                                  !confirm(
                                    `Deseja deletar todas as ${itens.length} unidades de "${ferr.descricao}"?`
                                  )
                                )
                                  return;
                                try {
                                  for (const item of itens) {
                                    await base44.entities.Ferramenta.delete(item.id);
                                  }
                                  toast.success("Ferramentas deletadas");
                                  loadData();
                                } catch (error) {
                                  toast.error("Erro ao deletar");
                                }
                              }}
                              title="Excluir"
                              className="h-8 w-8"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="obrigatorios">
          <ObrigatoriosUnificadosTab
            ferramentas={ferramentas}
            camposObrigatorios={camposObrigatorios}
            funcoes={funcoes}
          />
        </TabsContent>

        <ConteudoAbas
          empresaAtiva={empresaAtiva}
          user={user}
          ferramentas={ferramentas}
          historicoMovimentacoes={historicoMovimentacoes}
          almoxarifados={almoxarifados}
        />
      </Tabs>

      {/* Modal Nova/Editar Ferramenta */}
      <SheetModalComponent
        open={showModal}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedItem(null);
            setFormData({ ...ferramentaSchema, empresa_id: empresaAtiva.id });
            setTipoLocalizacao("almoxarifado");
            if (editandoDoDetalhe) {
              setEditandoDoDetalhe(false);
              setShowModal(false);
              setShowDetalhesModal(true);
              return;
            }
          }
          setShowModal(open);
        }}
        title={selectedItem ? "Editar Ferramenta" : "Nova Ferramenta"}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.descricao}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-2">
                Código{" "}
                <span className="text-xs text-green-600 font-normal">
                  (opcional - gerado automaticamente)
                </span>
              </Label>
              <Input
                value={formData.codigo}
                onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                placeholder={`Deixe vazio para gerar (ex: ${formData.tipo === "EPI" ? "EPI-001" : "FER-001"})`}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select
                value={formData.tipo}
                onValueChange={(v) => setFormData({ ...formData, tipo: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ferramenta">Ferramenta</SelectItem>
                  <SelectItem value="EPI">EPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Select
              value={formData.status}
              onValueChange={(v) => setFormData({ ...formData, status: v })}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Disponível">Disponível</SelectItem>
                <SelectItem value="Em Uso">Em Uso</SelectItem>
                <SelectItem value="Em Manutenção">Em Manutenção</SelectItem>
                <SelectItem value="Danificado">Danificado</SelectItem>
                <SelectItem value="Sucata">Sucata</SelectItem>
                <SelectItem value="Inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.tipo === "EPI" && (
            <div>
              <Label>
                CA (Certificado de Aprovação){" "}
                <span className="text-xs text-slate-400 font-normal">(opcional)</span>
              </Label>
              <Input
                value={formData.ca}
                onChange={(e) => setFormData({ ...formData, ca: e.target.value })}
                placeholder="CA-XXXXX"
                className="mt-1.5"
              />
            </div>
          )}

          <div>
            <Label>Descrição *</Label>
            <Input
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Ex: Furadeira de Impacto"
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Marca</Label>
              <Input
                value={formData.marca}
                onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                placeholder="Ex: Bosch"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Modelo</Label>
              <Input
                value={formData.modelo}
                onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label>Número de Série</Label>
            <Input
              value={formData.numero_serie}
              onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>N° do Laudo</Label>
              <Input
                value={formData.numero_laudo}
                onChange={(e) => setFormData({ ...formData, numero_laudo: e.target.value })}
                placeholder="Ex: LAU-001"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Vencimento Laudo</Label>
              <Input
                type="date"
                value={formData.data_vencimento_laudo}
                onChange={(e) =>
                  setFormData({ ...formData, data_vencimento_laudo: e.target.value })
                }
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label>Arquivo do Laudo (PDF ou imagem)</Label>
            <div className="mt-1.5 space-y-2">
              {formData.laudo_url ? (
                <div className="flex items-center gap-2 p-2 border rounded-lg bg-slate-50">
                  <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span className="text-sm text-slate-700 truncate flex-1">Laudo anexado</span>
                  <a
                    href={formData.laudo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => setFormData({ ...formData, laudo_url: "" })}
                    className="text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label
                  className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${uploadingLaudo ? "opacity-50 cursor-not-allowed" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"}`}
                >
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    disabled={uploadingLaudo}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingLaudo(true);
                      try {
                        const { file_url } = await base44.integrations.Core.UploadFile({ file });
                        setFormData((prev) => ({ ...prev, laudo_url: file_url }));
                        toast.success("Laudo anexado com sucesso");
                      } catch (err) {
                        toast.error("Erro ao enviar arquivo");
                      } finally {
                        setUploadingLaudo(false);
                      }
                    }}
                  />
                  {uploadingLaudo ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-slate-600">Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-slate-500" />
                      <span className="text-sm text-slate-600">
                        Clique para anexar laudo (PDF/imagem)
                      </span>
                    </>
                  )}
                </label>
              )}
            </div>
          </div>

          <div>
            <Label>Valor Unitário (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={formData.valor_unitario}
              onChange={(e) =>
                setFormData({ ...formData, valor_unitario: parseFloat(e.target.value) || 0 })
              }
              className="mt-1.5"
              placeholder="0.00"
            />
          </div>

          <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
            <Label className="text-base font-semibold">Localização</Label>
            <div>
              <Label>Tipo de Localização</Label>
              <Select
                value={tipoLocalizacao}
                onValueChange={(v) => {
                  setTipoLocalizacao(v);
                  setFormData({
                    ...formData,
                    localizacao: "",
                    funcionario_id: "",
                    funcionario_nome: "",
                  });
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="almoxarifado">📦 Almoxarifado</SelectItem>
                  <SelectItem value="caminhao">🚛 Caminhão</SelectItem>
                  <SelectItem value="funcionario">👤 Funcionário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tipoLocalizacao === "almoxarifado" && (
              <div>
                <Label>Local</Label>
                <Select
                  value={formData.localizacao}
                  onValueChange={(v) => setFormData({ ...formData, localizacao: v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione o local" />
                  </SelectTrigger>
                  <SelectContent>
                    {almoxarifados.map((local) => (
                      <SelectItem key={local} value={local}>
                        {local}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {tipoLocalizacao === "caminhao" && (
              <div>
                <Label>Caminhão</Label>
                <Select
                  value={formData.caminhao_id || ""}
                  onValueChange={(v) => {
                    const caminhao = caminhoes.find((c) => c.id === v);
                    setFormData({
                      ...formData,
                      caminhao_id: v,
                      localizacao: caminhao?.placa || "",
                    });
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione o caminhão" />
                  </SelectTrigger>
                  <SelectContent>
                    {caminhoes.map((cam) => (
                      <SelectItem key={cam.id} value={cam.id}>
                        {cam.placa}
                        {cam.modelo ? ` - ${cam.modelo}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {tipoLocalizacao === "funcionario" && (
              <div>
                <Label>Funcionário</Label>
                <Select
                  value={formData.funcionario_id}
                  onValueChange={(v) => {
                    const func = funcionarios.find((f) => f.id === v);
                    setFormData({
                      ...formData,
                      funcionario_id: v,
                      funcionario_nome: func?.nome_completo || "",
                      localizacao: `Funcionário - ${func?.nome_completo || ""}`,
                    });
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione o funcionário" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...funcionarios]
                      .sort((a, b) => (a.nome_completo || "").localeCompare(b.nome_completo || ""))
                      .map((func) => (
                        <SelectItem key={func.id} value={func.id}>
                          {func.nome_completo}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Controle Individual</Label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ative para itens com número de série, cinto, talabarte, etc. Desative para itens
                  como luvas, capacetes, alicates, chaves.
                </p>
              </div>
              <Switch
                checked={formData.controle_individual || false}
                onCheckedChange={(v) => setFormData({ ...formData, controle_individual: v })}
              />
            </div>
            {!formData.controle_individual && (
              <div>
                <Label>Quantidade em Estoque</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.quantidade_estoque}
                  onChange={(e) =>
                    setFormData({ ...formData, quantidade_estoque: parseInt(e.target.value) || 1 })
                  }
                  className="mt-1.5"
                />
              </div>
            )}
            {formData.controle_individual && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                  Cada unidade será um registro individual. Para adicionar mais unidades, use o
                  botão "Duplicar" na tela de detalhes.
                </p>
              </div>
            )}
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              className="mt-1.5"
              rows={2}
            />
          </div>

          {selectedItem && formData.codigo && (
            <div className="pt-4 border-t">
              <Label className="mb-3 block">QR Code da Ferramenta</Label>
              <QRCodeGenerator
                value={formData.codigo}
                size={200}
                level="H"
                showDownload={true}
                showPrint={true}
                label={formData.descricao}
              />
            </div>
          )}
        </div>
      </SheetModalComponent>

      {/* Modal Entrada de Estoque */}
      <SheetModalComponent
        open={showEntradaModal}
        onOpenChange={setShowEntradaModal}
        title="Entrada de Estoque"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowEntradaModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEntrada} className="bg-amber-500 hover:bg-amber-600">
              Registrar Entrada
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>Ferramenta *</Label>
            <Select
              value={entradaForm.ferramenta_id}
              onValueChange={(v) => {
                const ferr = ferramentas.find((f) => f.id === v);
                setEntradaForm({
                  ...entradaForm,
                  ferramenta_id: v,
                  valor_unitario: ferr?.valor_unitario?.toString() || "",
                });
              }}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Selecione a ferramenta" />
              </SelectTrigger>
              <SelectContent>
                {ferramentas.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.codigo} - {f.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Quantidade *</Label>
              <Input
                type="number"
                min="1"
                value={entradaForm.quantidade}
                onChange={(e) => setEntradaForm({ ...entradaForm, quantidade: e.target.value })}
                placeholder="Ex: 10"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Valor Unitário (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={entradaForm.valor_unitario}
                onChange={(e) => setEntradaForm({ ...entradaForm, valor_unitario: e.target.value })}
                placeholder="0.00"
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label>Localização</Label>
            <Select
              value={entradaForm.localizacao}
              onValueChange={(v) => setEntradaForm({ ...entradaForm, localizacao: v })}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Selecione o local" />
              </SelectTrigger>
              <SelectContent>
                {almoxarifados.map((local) => (
                  <SelectItem key={local} value={local}>
                    {local}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea
              value={entradaForm.observacoes}
              onChange={(e) => setEntradaForm({ ...entradaForm, observacoes: e.target.value })}
              placeholder="Informações sobre a entrada..."
              className="mt-1.5"
              rows={3}
            />
          </div>
        </div>
      </SheetModalComponent>

      {showImageModal && (
        <SheetModalComponent
          open={showImageModal}
          onOpenChange={(o) => {
            setShowImageModal(o);
            if (!o && ferramentaParaEditarAposImage) {
              setTimeout(() => handleOpenModal(ferramentaParaEditarAposImage), 100);
              setFerramentaParaEditarAposImage(null);
            }
          }}
          title="Visualizar Imagem"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowImageModal(false)}>
                Fechar
              </Button>
              <Button
                onClick={() => window.open(imageModalUrl, "_blank")}
                className="bg-amber-500 hover:bg-amber-600"
              >
                Abrir em Nova Aba
              </Button>
            </div>
          }
        >
          <div className="flex items-center justify-center p-6 bg-slate-50 rounded-lg min-h-[400px]">
            {imageModalUrl && (
              <img
                src={imageModalUrl}
                alt="Ferramenta"
                className="max-w-full max-h-[600px] object-contain rounded-lg shadow-lg"
              />
            )}
          </div>
        </SheetModalComponent>
      )}

      <ConciliacaoModal
        open={showConciliacaoModal}
        onOpenChange={setShowConciliacaoModal}
        itensConciliacao={itensConciliacao}
        setItensConciliacao={setItensConciliacao}
        onConfirmar={handleConfirmarConciliacao}
      />

      <GerenciadorCaminhoesModal
        open={showGerenciadorCaminhoesModal}
        onOpenChange={setShowGerenciadorCaminhoesModal}
        ferramentas={ferramentas}
        onAlmoxarifadoUpdated={loadData}
      />

      <FerramentaDetalhesModal
        open={showDetalhesModal}
        onOpenChange={setShowDetalhesModal}
        ferramentaDetalhes={ferramentaDetalhes}
        ferramentas={ferramentas}
        historicoMovimentacoes={historicoMovimentacoes}
        editandoCampoItem={editandoCampoItem}
        setEditandoCampoItem={setEditandoCampoItem}
        onEditItem={(ferramentaCompleta) => {
          if (ferramentaCompleta) {
            setEditandoDoDetalhe(true);
            setShowDetalhesModal(false);
            handleOpenModal(ferramentaCompleta);
          }
        }}
        onDeleteItem={handleDelete}
        onDuplicarItem={handleDuplicarItem}
        onShowQRCode={(ferramentaCompleta, item) => {
          setQrcodeData({
            codigo: ferramentaCompleta?.codigo,
            descricao: ferramentaDetalhes.descricao,
            numero_serie: item.numero_serie,
          });
          setShowQRCodeModal(true);
        }}
        loadData={loadData}
      />

      {showConfigurarManutencaoModal && ferramentaConfigurarManutencao && (
        <ConfiguracaoManutencaoModal
          open={showConfigurarManutencaoModal}
          onOpenChange={setShowConfigurarManutencaoModal}
          ferramenta={ferramentaConfigurarManutencao}
          onSave={() => {
            loadData();
            if (ferramentaDetalhes) {
              loadHistoricoMovimentacoes((ferramentaDetalhes.itens || []).map((i) => i.id));
            }
          }}
        />
      )}

      <CodigoDuplicadoModal
        open={showCodigoDuplicadoModal}
        onClose={() => setShowCodigoDuplicadoModal(false)}
        empresaAtiva={empresaAtiva}
        onSave={loadData}
      />

      <ScannerCodigoBarras
        open={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        empresaAtiva={empresaAtiva}
        user={user}
        ferramentas={ferramentas}
        funcionarios={funcionarios}
        projetos={projetos}
        almoxarifados={almoxarifados}
        onFerramentaScaneada={(ferramenta) => {
          if (ferramenta) {
            setFerramentaDetalhes({
              codigo: ferramenta.codigo,
              descricao: ferramenta.descricao,
              marca: ferramenta.marca,
              tipo: ferramenta.tipo,
              valor_unitario: ferramenta.valor_unitario,
              foto_url: ferramenta.foto_url,
              itens: ferramentas.filter(
                (f) => f.codigo === ferramenta.codigo && f.descricao === ferramenta.descricao
              ),
            });
            setShowDetalhesModal(true);
            loadHistoricoMovimentacoes(
              ferramentas
                .filter(
                  (f) => f.codigo === ferramenta.codigo && f.descricao === ferramenta.descricao
                )
                .map((f) => f.id)
            );
          }
          loadData();
          setShowScannerModal(false);
        }}
      />

      <SheetModalComponent
        open={showQRCodeModal}
        onOpenChange={setShowQRCodeModal}
        title="QR Code da Ferramenta"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowQRCodeModal(false)}>
              Fechar
            </Button>
          </div>
        }
      >
        {qrcodeData && (
          <QRCodeGenerator
            value={qrcodeData.codigo}
            size={240}
            level="H"
            showDownload={true}
            showPrint={true}
            label={qrcodeData.descricao}
            className="w-full"
          />
        )}
      </SheetModalComponent>

      <FerramentaDetalheModal
        open={showFerramentaDetalhe}
        onOpenChange={setShowFerramentaDetalhe}
        ferramenta={ferramentaDetalhe}
        onRefresh={loadData}
      />

      <InventarioModal
        open={showInventario}
        onOpenChange={setShowInventario}
        almoxarifados={almoxarifados}
        ferramentas={ferramentas}
        empresaAtiva={empresaAtiva}
        user={user}
      />

      <SheetModalComponent
        open={showLaudoMassaModal}
        onOpenChange={setShowLaudoMassaModal}
        title="Laudo Obrigatório em Massa"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowLaudoMassaModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleMarcarLaudoObrigatorioEmMassa}
              disabled={salvandoLaudoMassa}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {salvandoLaudoMassa ? "Salvando..." : "Confirmar"}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-600">
            Esta ação será aplicada a <strong>todas as unidades</strong> dos{" "}
            <strong>{itensSelecionados.length} grupo(s)</strong> selecionados.
          </p>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium text-slate-800">Laudo Obrigatório</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {laudoMassaObrigatorio
                  ? "As ferramentas exigirão laudo técnico"
                  : "As ferramentas não exigirão laudo técnico"}
              </p>
            </div>
            <Switch checked={laudoMassaObrigatorio} onCheckedChange={setLaudoMassaObrigatorio} />
          </div>
        </div>
      </SheetModalComponent>

      {exportProgress && (
        <ExportarLaudosProgress
          progresso={exportProgress.atual}
          atual={exportProgress.atual}
          total={exportProgress.total}
          fase={exportProgress.fase}
        />
      )}

      <VincularMassaCarrosselModal
        open={showVincularMassa}
        onOpenChange={setShowVincularMassa}
        ferramentas={ferramentas}
        funcionarios={funcionarios}
        caminhoes={caminhoes}
        empresaAtiva={empresaAtiva}
        onRefresh={loadData}
      />
    </div>
  );
}
