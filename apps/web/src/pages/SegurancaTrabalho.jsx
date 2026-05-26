import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEmpresa } from "../Layout";
import { formatCPF } from "../components/utils/cpfFormatter";
import VisualizarEPIModal from "../components/seguranca/VisualizarEPIModal";
import VisualizarFerramentasModal from "../components/seguranca/VisualizarFerramentasModal";
import VisualizarOrdemServicoModal from "../components/seguranca/VisualizarOrdemServicoModal";
import VisualizarAutorizacaoFormalCemigModal from "../components/seguranca/VisualizarAutorizacaoFormalCemigModal";
import VisualizarDireitoRecusaModal from "../components/seguranca/VisualizarDireitoRecusaModal";
import HistoricoDocumentosModal from "../components/seguranca/HistoricoDocumentosModal";
import VisualizadorDocumentoModal from "../components/seguranca/VisualizadorDocumentoModal";
import VisualizarCertificadoModal from "../components/seguranca/VisualizarCertificadoModal";
import CertificadoAssinadoModal from "../components/seguranca/CertificadoAssinadoModal";
import SolicitacaoEPIModal from "../components/seguranca/SolicitacaoEPIModal";
import ExportacaoMassaModal from "../components/seguranca/ExportacaoMassaModal";
import ImportarFuncionariosModal from "../components/seguranca/ImportarFuncionariosModal";
import ImportarCertificadosModal from "../components/seguranca/ImportarCertificadosModal";
import ImportarCertificadosTSTModal from "../components/seguranca/ImportarCertificadosTSTModal";
import UploadDocumentosRHZip from "../components/seguranca/UploadDocumentosRHZip";
import GerarCertificadosLoteModal from "../components/seguranca/GerarCertificadosLoteModal";
import TSTTab from "../components/seguranca/TSTTab";
import RHTab from "../components/seguranca/RHTab";
import DocumentacaoTab from "../components/seguranca/DocumentacaoTab";
import CaminhoesTab from "../components/seguranca/CaminhoesTab";
import InspecaoCampoSegurancaTab from "@/components/seguranca/InspecaoCampoTab";
import InspecaoCampoTabFerramental from "@/components/ferramental/InspecaoCampoTab";
import DocumentacaoEmpresaTab from "@/components/seguranca/DocumentacaoEmpresaTab";
import SolicitarEntregaFerramentasModal from "@/components/seguranca/SolicitarEntregaFerramentasModal";
import SolicitacoesEntregaTab from "@/components/seguranca/SolicitacoesEntregaTab";
import BiometriaFuncionarioPanel from "@/components/seguranca/BiometriaFuncionarioPanel";
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  Download,
  Upload,
  Search,
  AlertCircle,
  FileText,
  X,
  Bot,
  CheckCircle2,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import JSZip from "jszip";

export default function SegurancaTrabalho() {
  const { empresaAtiva, temPermissao, perfil, user } = useEmpresa();

  // Ler parâmetro tab da URL
  const urlParams = new URLSearchParams(window.location.search);
  const tabFromUrl = urlParams.get("tab") || "funcionarios";

  const [activeTab, setActiveTab] = useState(tabFromUrl);
  const [funcionarios, setFuncionarios] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [inspecoesFerramental, setInspecoesFerramental] = useState([]);
  const [inspecoesCaminhao, setInspecoesCaminhao] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFuncionarioModal, setShowFuncionarioModal] = useState(false);
  const [selectedFuncionario, setSelectedFuncionario] = useState(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showTreinamentosModal, setShowTreinamentosModal] = useState(false);
  const [treinamentosFuncao, setTreinamentosFuncao] = useState([]);
  const [treinamentosSelecionados, setTreinamentosSelecionados] = useState([]);
  const [funcionarioTreinamentos, setFuncionarioTreinamentos] = useState(null);
  const [uploadingTreinamento, setUploadingTreinamento] = useState(null);
  const [editandoDatasTreinamento, setEditandoDatasTreinamento] = useState({});
  const [sortConfig, setSortConfig] = useState({ field: "nome_completo", direction: "asc" });
  const [treinamentosDaFuncao, setTreinamentosDaFuncao] = useState([]);
  const autoSaveTimeoutRef = React.useRef(null);
  const [showHistoricoModal, setShowHistoricoModal] = useState(false);
  const [historicoTipo, setHistoricoTipo] = useState("");
  const [historicoData, setHistoricoData] = useState([]);
  const [showVisualizarEPI, setShowVisualizarEPI] = useState(false);
  const [showVisualizarFerramentas, setShowVisualizarFerramentas] = useState(false);
  const [showVisualizarOrdemServico, setShowVisualizarOrdemServico] = useState(false);
  const [showVisualizarAutorizacaoFormal, setShowVisualizarAutorizacaoFormal] = useState(false);
  const [showVisualizarDireitoRecusa, setShowVisualizarDireitoRecusa] = useState(false);
  const [documentoVisualizacao, setDocumentoVisualizacao] = useState(null);
  const [showVisualizadorDocumento, setShowVisualizadorDocumento] = useState(false);
  const [showVisualizarCertificado, setShowVisualizarCertificado] = useState(false);
  const [certificadoSelecionado, setCertificadoSelecionado] = useState(null);
  const [datasEditadasCertificado, setDatasEditadasCertificado] = useState(null);
  // Instância do VisualizarCertificadoModal gerenciada aqui para evitar Dialog dentro de Sheet
  const [showCertificadoAssinadoExterno, setShowCertificadoAssinadoExterno] = useState(false);
  const [treinamentoAssinadoExterno, setTreinamentoAssinadoExterno] = useState(null);

  const [showSelecionarFuncionarioModal, setShowSelecionarFuncionarioModal] = useState(false);
  const [funcionarioSelecionadoParaGerarDocs, setFuncionarioSelecionadoParaGerarDocs] =
    useState(null);
  const [showSolicitacaoEPI, setShowSolicitacaoEPI] = useState(false);
  const [showSolicitarEntregaFerramentas, setShowSolicitarEntregaFerramentas] = useState(false);
  const [tabAtiva, setTabAtiva] = useState("dados");
  const [analisandoDoc, setAnalisandoDoc] = useState(null); // { idx, tipo }
  const [alertaIA, setAlertaIA] = useState(null); // { ok, mensagem, tipo }
  const [showCaminhaoModal, setShowCaminhaoModal] = useState(false);
  const [funcionariosSelecionadosMassa, setFuncionariosSelecionadosMassa] = useState([]);
  const [showExportacaoMassa, setShowExportacaoMassa] = useState(false);
  const [showImportarFuncionarios, setShowImportarFuncionarios] = useState(false);
  const [showImportarCertificados, setShowImportarCertificados] = useState(false);
  const [showImportarCertificadosMassa, setShowImportarCertificadosMassa] = useState(false);
  const [showGerarCertificadosLote, setShowGerarCertificadosLote] = useState(false);
  const [showUploadDocumentosRHZip, setShowUploadDocumentosRHZip] = useState(false);
  const [documentosRHAnalisados, setDocumentosRHAnalisados] = useState(null);
  const [caminhoes, setCaminhoes] = useState([]);
  const [caminhaoForm, setCaminhaoForm] = useState({
    placa: "",
    modelo: "",
    marca: "",
    ano: "",
    cor: "",
    renavam: "",
    chassi: "",
    km_atual: 0,
    motorista_padrao_id: "",
    motorista_padrao_nome: "",
    foto_url: "",
    observacoes: "",
    ativo: true,
  });
  const [selectedCaminhao, setSelectedCaminhao] = useState(null);
  const [funcionarioForm, setFuncionarioForm] = useState({
    nome_completo: "",
    nome_mae: "",
    nome_pai: "",
    cpf: "",
    numero_registro: "",
    rg: "",
    rg_data_expedicao: "",
    rg_uf: "",
    pis: "",
    data_nascimento: "",
    naturalidade: "",
    titulo_eleitor: "",
    titulo_eleitor_zona: "",
    titulo_eleitor_secao: "",
    reservista: "",
    estado_civil: "",
    raca_cor: "",
    grau_instrucao: "",
    banco_codigo: "",
    banco_tipo_conta: "",
    banco_agencia: "",
    banco_conta: "",
    dependentes: "[]",
    email: "",
    telefone: "",
    cep: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    data_admissao: "",
    funcao_id: "",
    funcao_nome: "",
    aso_vencimento: "",
    foto_url: "",
    documentos_pessoais: "[]",
    documentos_rh_estruturados: JSON.stringify([
      {
        nome: "ASO - Atestado de Saúde Ocupacional *",
        anexado: false,
        url: "",
        data_upload: "",
        anexos: [],
      },
      { nome: "Exames Médicos", anexado: false, url: "", data_upload: "", anexos: [] },
      { nome: "Registro de Empregado", anexado: false, url: "", data_upload: "", anexos: [] },
    ]),
    documentos_demissionais: JSON.stringify([
      { nome: "Aviso Prévio", anexado: false, url: "", data_upload: "", anexos: [] },
      {
        nome: "Comprovante de Acordo Judicial",
        anexado: false,
        url: "",
        data_upload: "",
        anexos: [],
      },
      {
        nome: "Declaração de Empregado Desligado do Contrato",
        anexado: false,
        url: "",
        data_upload: "",
        anexos: [],
      },
      {
        nome: "Declaração de Pedido de Demissão",
        anexado: false,
        url: "",
        data_upload: "",
        anexos: [],
      },
      {
        nome: "Demonstrativo do Trabalhador de Recolhimento FGTS Rescisório",
        anexado: false,
        url: "",
        data_upload: "",
        anexos: [],
      },
      { nome: "Exame Demissional", anexado: false, url: "", data_upload: "", anexos: [] },
      {
        nome: "GRRF - Guia de Recolhimento Rescisório do FGTS e Comprovante de Pagamento",
        anexado: false,
        url: "",
        data_upload: "",
        anexos: [],
      },
      {
        nome: "PPP - Perfil Profissiográfico Previdenciário",
        anexado: false,
        url: "",
        data_upload: "",
        anexos: [],
      },
      {
        nome: "TRCT - Termo de Rescisão de Contrato de Trabalho",
        anexado: false,
        url: "",
        data_upload: "",
        anexos: [],
      },
    ]),
    documentos_obrigatorios: JSON.stringify([
      { nome: "Cópia do CPF *", anexado: false, url: "", data_upload: "" },
      { nome: "Cópia do PIS *", anexado: false, url: "", data_upload: "" },
      { nome: "Cópia da Cédula de Identidade *", anexado: false, url: "", data_upload: "" },
      { nome: "Cópia do Título de Eleitor *", anexado: false, url: "", data_upload: "" },
      { nome: "1 Foto 3x4 recente para crachá", anexado: false, url: "", data_upload: "" },
      {
        nome: "Cópia da Certidão de Casamento ou Declaração de Convívio Marital",
        anexado: false,
        url: "",
        data_upload: "",
      },
      {
        nome: "Cópia da Certidão de Nascimento dos filhos",
        anexado: false,
        url: "",
        data_upload: "",
      },
      {
        nome: "Cópia da Caderneta de vacinação dos filhos menores de 7 anos",
        anexado: false,
        url: "",
        data_upload: "",
      },
      {
        nome: "Cópia da declaração de frequência escolar menores de 14 anos",
        anexado: false,
        url: "",
        data_upload: "",
      },
      {
        nome: "Cópia do Certificado de Reservista (Masculino)",
        anexado: false,
        url: "",
        data_upload: "",
      },
      {
        nome: "Cópia do Comprovante de Residência atualizado *",
        anexado: false,
        url: "",
        data_upload: "",
      },
      { nome: "Certidão de Antecedentes Criminais *", anexado: false, url: "", data_upload: "" },
      {
        nome: "Cópia do cartão da conta para portabilidade",
        anexado: false,
        url: "",
        data_upload: "",
      },
      { nome: "Cópia da Carteira de Trabalho *", anexado: false, url: "", data_upload: "" },
    ]),
    treinamentos_anexos: "[]",
    ferramentais_anexos: "[]",
    epis_anexos: "[]",
    documentos_rh_anexos: "[]",
    autorizacao_formal_anexos: "[]",
    direito_recusa_anexos: "[]",
    ordem_servicos_anexos: "[]",
    observacoes: "",
    ativo: true,
  });

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadData();
    }
  }, [empresaAtiva?.id]);

  const loadData = async () => {
    try {
      const [funcionariosList, funcoesList, ferramentalList, caminhaoList, caminhoesList] =
        await Promise.all([
          base44.entities.Funcionario.filter({ empresa_id: empresaAtiva.id, ativo: true }),
          base44.entities.Funcao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
          base44.entities.InspecaoFerramental.filter({ empresa_id: empresaAtiva.id, ativo: true }),
          base44.entities.InspecaoCaminhao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
          base44.entities.Caminhao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        ]);
      setFuncionarios(funcionariosList);
      setFuncoes(funcoesList);
      setInspecoesFerramental(
        ferramentalList.sort((a, b) => new Date(b.data_inspecao) - new Date(a.data_inspecao))
      );
      setInspecoesCaminhao(
        caminhaoList.sort((a, b) => new Date(b.data_inspecao) - new Date(a.data_inspecao))
      );
      setCaminhoes(caminhoesList);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    }
  };

  const handleAutoSave = (dadosAtualizados = null) => {
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    autoSaveTimeoutRef.current = setTimeout(async () => {
      const dadosParaSalvar = dadosAtualizados || funcionarioForm;
      if (selectedFuncionario && dadosParaSalvar.nome_completo && dadosParaSalvar.cpf) {
        try {
          const data = {
            ...dadosParaSalvar,
            empresa_id: empresaAtiva.id,
          };
          await base44.entities.Funcionario.update(selectedFuncionario.id, data);
        } catch (error) {
          console.error("Erro ao auto-salvar:", error);
        }
      }
    }, 1000);
  };

  const handleSaveFuncionario = async () => {
    if (!funcionarioForm.nome_completo || !funcionarioForm.cpf) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    try {
      const data = {
        ...funcionarioForm,
        cpf: formatCPF(funcionarioForm.cpf),
        empresa_id: empresaAtiva.id,
      };

      if (selectedFuncionario) {
        await base44.entities.Funcionario.update(selectedFuncionario.id, data);
        toast.success("Funcionário atualizado com sucesso");
      } else {
        const novoFuncionario = await base44.entities.Funcionario.create(data);
        toast.success("Funcionário cadastrado com sucesso");
        setSelectedFuncionario(novoFuncionario);
      }

      setShowFuncionarioModal(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar funcionário");
    }
  };

  const handleDeleteFuncionario = async (funcionario) => {
    if (!confirm(`Desativar o funcionário ${funcionario.nome_completo}?`)) return;
    try {
      await base44.entities.Funcionario.update(funcionario.id, { ativo: false });
      toast.success("Funcionário desativado");
      loadData();
    } catch (error) {
      console.error("Erro ao desativar:", error);
      toast.error("Erro ao desativar funcionário");
    }
  };

  const handleUploadFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFuncionarioForm({ ...funcionarioForm, foto_url: file_url });
      toast.success("Foto enviada com sucesso");
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      toast.error("Erro ao enviar foto");
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleUploadDocumento = async (e, tipo) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const docs = JSON.parse(funcionarioForm[tipo] || "[]");
      docs.push({
        nome: file.name,
        url: file_url,
        tipo: tipo.replace("_anexos", ""),
        data_upload: new Date().toISOString(),
      });
      setFuncionarioForm({ ...funcionarioForm, [tipo]: JSON.stringify(docs) });
      toast.success("Documento anexado com sucesso");
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      toast.error("Erro ao anexar documento");
    } finally {
      setUploadingDoc(false);
    }
    e.target.value = "";
  };

  const handleRemoverDocumento = (tipo, index) => {
    const docs = JSON.parse(funcionarioForm[tipo] || "[]");
    docs.splice(index, 1);
    setFuncionarioForm({ ...funcionarioForm, [tipo]: JSON.stringify(docs) });
  };

  const handleUploadAnexo = async (e, tipo) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const anexos = JSON.parse(funcionarioForm[tipo] || "[]");
      anexos.push({
        nome: file.name,
        url: file_url,
        data_upload: new Date().toISOString(),
      });
      const novoForm = { ...funcionarioForm, [tipo]: JSON.stringify(anexos) };
      setFuncionarioForm(novoForm);
      handleAutoSave(novoForm);
      toast.success("Documento anexado");
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      toast.error("Erro ao anexar documento");
    } finally {
      setUploadingDoc(false);
    }
    e.target.value = "";
  };

  const handleRemoverAnexo = (tipo, index) => {
    const anexos = JSON.parse(funcionarioForm[tipo] || "[]");
    anexos.splice(index, 1);
    const novoForm = { ...funcionarioForm, [tipo]: JSON.stringify(anexos) };
    setFuncionarioForm(novoForm);
    handleAutoSave(novoForm);
    toast.success("Documento removido");
  };

  const handleVerHistorico = (tipo) => {
    const anexos = JSON.parse(funcionarioForm[tipo] || "[]");
    setHistoricoData(anexos);
    setHistoricoTipo(tipo.replace("_anexos", ""));
    setShowHistoricoModal(true);
  };

  const handleAbrirModalTreinamentos = async (funcionario) => {
    if (!funcionario.funcao_id) {
      toast.error("Funcionário não possui função definida");
      return;
    }

    try {
      const treinamentos = await base44.entities.Treinamento.filter({
        empresa_id: empresaAtiva.id,
        funcao_id: funcionario.funcao_id,
      });

      if (treinamentos.length === 0) {
        toast.error("Nenhum treinamento cadastrado para esta função");
        return;
      }

      setTreinamentosFuncao(treinamentos);
      setFuncionarioTreinamentos(funcionario);
      setTreinamentosSelecionados([]);
      setEditandoDatasTreinamento({});
      setShowTreinamentosModal(true);
    } catch (error) {
      console.error("Erro ao carregar treinamentos:", error);
      toast.error("Erro ao carregar treinamentos");
    }
  };

  const carregarTreinamentosFuncao = async (funcao_id) => {
    if (!funcao_id) {
      setTreinamentosDaFuncao([]);
      return;
    }
    try {
      let treinamentos = await base44.entities.Treinamento.filter({
        empresa_id: empresaAtiva.id,
        funcao_id,
      });
      if (treinamentos.length === 0) {
        const modelos = await base44.entities.Treinamento.filter({
          empresa_id: empresaAtiva.id,
          usar_como_modelo: true,
        });
        treinamentos = modelos.filter((t) => t.ativo !== false);
      }
      setTreinamentosDaFuncao(
        treinamentos.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))
      );
    } catch {
      setTreinamentosDaFuncao([]);
    }
  };

  const handleAbrirHistorico = (tipo) => {
    let anexosData = [];

    if (
      tipo === "documentos_obrigatorios" ||
      tipo === "documentos_rh_estruturados" ||
      tipo === "documentos_demissionais"
    ) {
      // Para documentos obrigatórios e RH estruturados, compilar todos os anexos
      const docs = JSON.parse(funcionarioForm[tipo] || "[]");
      docs.forEach((doc) => {
        if (doc.anexos && Array.isArray(doc.anexos)) {
          doc.anexos.forEach((anexo) => {
            anexosData.push({
              nome: anexo.nome_arquivo,
              url: anexo.url,
              data_upload: anexo.data_upload,
            });
          });
        }
      });
    } else {
      const anexosKey =
        tipo === "epis"
          ? "epis_anexos"
          : tipo === "ferramentas"
            ? "ferramentais_anexos"
            : tipo === "ordem_servicos"
              ? "ordem_servicos_anexos"
              : tipo === "autorizacao_formal"
                ? "autorizacao_formal_anexos"
                : tipo === "direito_recusa"
                  ? "direito_recusa_anexos"
                  : tipo === "documentos_rh"
                    ? "documentos_rh_anexos"
                    : "ordem_servicos_anexos";

      anexosData = JSON.parse(funcionarioForm[anexosKey] || "[]");
    }

    setHistoricoData(anexosData);
    setHistoricoTipo(tipo);
    setShowHistoricoModal(true);
  };

  const handleEditarDocumento = (tipo) => {
    toast.info(`Edição de modelo de ${tipo} disponível em Configurações → Funções`);
  };

  const verificarDocumentosCompletos = () => {
    const docsObrigatorios = JSON.parse(funcionarioForm.documentos_obrigatorios || "[]");
    const dependentes = JSON.parse(funcionarioForm.dependentes || "[]");

    const documentosSempreObrigatorios = [
      "Cópia do CPF *",
      "Cópia do PIS *",
      "Cópia da Cédula de Identidade *",
      "Cópia do Título de Eleitor *",
      "Cópia do Comprovante de Residência atualizado *",
      "Certidão de Antecedentes Criminais *",
      "Cópia da Carteira de Trabalho *",
    ];

    for (const nomeDoc of documentosSempreObrigatorios) {
      const doc = docsObrigatorios.find((d) => d.nome === nomeDoc);
      const anexos = doc?.anexos ? (Array.isArray(doc.anexos) ? doc.anexos : [doc.anexos]) : [];
      if (anexos.length === 0) return false;
    }

    if (
      funcionarioForm.estado_civil === "Casado" ||
      funcionarioForm.estado_civil === "União Estável"
    ) {
      const certidaoCasamento = docsObrigatorios.find((d) =>
        d.nome.includes("Certidão de Casamento")
      );
      const anexos = certidaoCasamento?.anexos
        ? Array.isArray(certidaoCasamento.anexos)
          ? certidaoCasamento.anexos
          : [certidaoCasamento.anexos]
        : [];
      if (anexos.length === 0) return false;
    }

    if (dependentes.length > 0) {
      const certidaoNascimento = docsObrigatorios.find((d) =>
        d.nome.includes("Certidão de Nascimento dos filhos")
      );
      const anexos = certidaoNascimento?.anexos
        ? Array.isArray(certidaoNascimento.anexos)
          ? certidaoNascimento.anexos
          : [certidaoNascimento.anexos]
        : [];
      if (anexos.length === 0) return false;

      const temFilhoMenor7 = dependentes.some((dep) => {
        if (!dep.data_nascimento) return false;
        const hoje = new Date();
        const nasc = new Date(dep.data_nascimento);
        let idade = hoje.getFullYear() - nasc.getFullYear();
        const m = hoje.getMonth() - nasc.getMonth();
        if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
        return idade < 7;
      });

      if (temFilhoMenor7) {
        const caderneta = docsObrigatorios.find((d) => d.nome.includes("Caderneta de vacinação"));
        const anexos = caderneta?.anexos
          ? Array.isArray(caderneta.anexos)
            ? caderneta.anexos
            : [caderneta.anexos]
          : [];
        if (anexos.length === 0) return false;
      }

      const temFilhoMenor14 = dependentes.some((dep) => {
        if (!dep.data_nascimento) return false;
        const hoje = new Date();
        const nasc = new Date(dep.data_nascimento);
        let idade = hoje.getFullYear() - nasc.getFullYear();
        const m = hoje.getMonth() - nasc.getMonth();
        if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
        return idade < 14;
      });

      if (temFilhoMenor14) {
        const declaracao = docsObrigatorios.find((d) =>
          d.nome.includes("declaração de frequência escolar")
        );
        const anexos = declaracao?.anexos
          ? Array.isArray(declaracao.anexos)
            ? declaracao.anexos
            : [declaracao.anexos]
          : [];
        if (anexos.length === 0) return false;
      }

      for (let i = 0; i < dependentes.length; i++) {
        const dep = dependentes[i];
        if (!dep.data_nascimento) continue;
        const hoje = new Date();
        const nasc = new Date(dep.data_nascimento);
        let idade = hoje.getFullYear() - nasc.getFullYear();
        const m = hoje.getMonth() - nasc.getMonth();
        if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
        if (idade >= 7 && idade <= 14 && !dep.comprovante_escolar_url) return false;
      }
    }

    return true;
  };

  const gerarFormularioRegistroPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const dependentes = JSON.parse(funcionarioForm.dependentes || "[]");
    let y = 35;
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text("FORMULÁRIO PARA REGISTRO", 105, y, { align: "center" });
    y += 10;
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.text(`Data de Admissão: ${funcionarioForm.data_admissao || "____/____/____"}`, 20, y);
    y += 6;
    doc.text(`Função: ${funcionarioForm.funcao_nome || ""}`, 20, y);
    y += 10;
    doc.setFont(undefined, "bold");
    doc.text("1. Dados do empregado:", 20, y);
    y += 5;
    doc.setFont(undefined, "normal");
    doc.text(`Colaborador (a): ${funcionarioForm.nome_completo || ""}`, 20, y);
    y += 4;
    doc.text(`CPF: ${funcionarioForm.cpf || ""}`, 20, y);
    y += 4;
    doc.text(`RG: ${funcionarioForm.rg || ""}`, 20, y);
    y += 4;
    doc.text(`Estado Civil: ${funcionarioForm.estado_civil || ""}`, 20, y);
    y += 10;
    doc.addPage();
    let y2 = 35;
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text("5. Dependentes", 20, y2);
    y2 += 7;
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    if (dependentes.length > 0) {
      dependentes.forEach((dep) => {
        doc.text(`Nome: ${dep.nome || ""}  CPF: ${dep.cpf || ""}`, 20, y2);
        y2 += 5;
      });
    }
    y2 += 10;
    doc.setDrawColor(0, 0, 0);
    doc.line(20, y2, 190, y2);
    y2 += 5;
    doc.text("Assinatura do Funcionário", 105, y2, { align: "center" });
    return doc.output("blob");
  };

  const analisarDocumentoComIA = async (file_url, tipo_documento) => {
    try {
      const response = await base44.functions.invoke("analisarDocumentoSeguranca", {
        file_url,
        tipo_documento,
        nome_funcionario: funcionarioForm.nome_completo,
      });
      const resultado = response.data;
      setAlertaIA(resultado);
    } catch (error) {
      console.error("Erro na análise IA:", error);
    }
  };

  const handleBaixarTodosAnexos = async () => {
    try {
      const docsObrigatorios = JSON.parse(funcionarioForm.documentos_obrigatorios || "[]").map(
        (doc) => ({ ...doc, anexos: doc.anexos || [] })
      );
      const zip = new JSZip();
      const nomeFuncionario = funcionarioForm.nome_completo.replace(/[^a-z0-9]/gi, "_");
      toast.info("Gerando arquivo...");
      try {
        const formularioPDF = await gerarFormularioRegistroPDF();
        zip.file("Formulario_Registro.pdf", formularioPDF);
      } catch {}
      const addDocs = async (docs) => {
        for (const doc of docs) {
          const anexos = (doc.anexos || []).filter((a) => a && a.url && a.url.trim() !== "");
          for (const anexo of anexos) {
            try {
              const response = await fetch(anexo.url);
              const blob = await response.blob();
              if (blob.size === 0) continue;
              let nome = (anexo.nome_arquivo || doc.nome)
                .replace(/\*/g, "")
                .replace(/\s+/g, " ")
                .trim();
              zip.file(nome, blob);
            } catch {}
          }
        }
      };
      await addDocs(docsObrigatorios);
      await addDocs(JSON.parse(funcionarioForm.documentos_rh_estruturados || "[]"));
      const content = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      if (content.size === 0) {
        toast.error("ZIP gerado está vazio.");
        return;
      }
      const url = window.URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `documentos_${nomeFuncionario}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Arquivo compactado gerado com sucesso!");
    } catch (error) {
      toast.error("Erro ao gerar arquivo compactado");
    }
  };

  const resetForm = () => {
    setFuncionarioForm({
      nome_completo: "",
      nome_mae: "",
      nome_pai: "",
      cpf: "",
      numero_registro: "",
      rg: "",
      rg_data_expedicao: "",
      rg_uf: "",
      pis: "",
      data_nascimento: "",
      naturalidade: "",
      titulo_eleitor: "",
      titulo_eleitor_zona: "",
      titulo_eleitor_secao: "",
      reservista: "",
      estado_civil: "",
      raca_cor: "",
      grau_instrucao: "",
      banco_codigo: "",
      banco_tipo_conta: "",
      banco_agencia: "",
      banco_conta: "",
      dependentes: "[]",
      email: "",
      telefone: "",
      cep: "",
      endereco: "",
      numero: "",
      complemento: "",
      bairro: "",
      cidade: "",
      estado: "",
      data_admissao: "",
      funcao_id: "",
      funcao_nome: "",
      aso_vencimento: "",
      foto_url: "",
      documentos_pessoais: "[]",
      documentos_rh_estruturados: JSON.stringify([
        {
          nome: "ASO - Atestado de Saúde Ocupacional *",
          anexado: false,
          url: "",
          data_upload: "",
          anexos: [],
        },
        { nome: "Exames Médicos", anexado: false, url: "", data_upload: "", anexos: [] },
        { nome: "Registro de Empregado", anexado: false, url: "", data_upload: "", anexos: [] },
      ]),
      documentos_demissionais: JSON.stringify([
        { nome: "Aviso Prévio", anexado: false, url: "", data_upload: "", anexos: [] },
        {
          nome: "Comprovante de Acordo Judicial",
          anexado: false,
          url: "",
          data_upload: "",
          anexos: [],
        },
        {
          nome: "Declaração de Empregado Desligado do Contrato",
          anexado: false,
          url: "",
          data_upload: "",
          anexos: [],
        },
        {
          nome: "Declaração de Pedido de Demissão",
          anexado: false,
          url: "",
          data_upload: "",
          anexos: [],
        },
        {
          nome: "Demonstrativo do Trabalhador de Recolhimento FGTS Rescisório",
          anexado: false,
          url: "",
          data_upload: "",
          anexos: [],
        },
        { nome: "Exame Demissional", anexado: false, url: "", data_upload: "", anexos: [] },
        {
          nome: "GRRF - Guia de Recolhimento Rescisório do FGTS e Comprovante de Pagamento",
          anexado: false,
          url: "",
          data_upload: "",
          anexos: [],
        },
        {
          nome: "PPP - Perfil Profissiográfico Previdenciário",
          anexado: false,
          url: "",
          data_upload: "",
          anexos: [],
        },
        {
          nome: "TRCT - Termo de Rescisão de Contrato de Trabalho",
          anexado: false,
          url: "",
          data_upload: "",
          anexos: [],
        },
      ]),
      documentos_obrigatorios: JSON.stringify([
        { nome: "Cópia do CPF *", anexado: false, url: "", data_upload: "" },
        { nome: "Cópia do PIS *", anexado: false, url: "", data_upload: "" },
        { nome: "Cópia da Cédula de Identidade *", anexado: false, url: "", data_upload: "" },
        { nome: "Cópia do Título de Eleitor *", anexado: false, url: "", data_upload: "" },
        { nome: "1 Foto 3x4 recente para crachá", anexado: false, url: "", data_upload: "" },
        {
          nome: "Cópia da Certidão de Casamento ou Declaração de Convívio Marital",
          anexado: false,
          url: "",
          data_upload: "",
        },
        {
          nome: "Cópia da Certidão de Nascimento dos filhos",
          anexado: false,
          url: "",
          data_upload: "",
        },
        {
          nome: "Cópia da Caderneta de vacinação dos filhos menores de 7 anos",
          anexado: false,
          url: "",
          data_upload: "",
        },
        {
          nome: "Cópia da declaração de frequência escolar menores de 14 anos",
          anexado: false,
          url: "",
          data_upload: "",
        },
        {
          nome: "Cópia do Certificado de Reservista (Masculino)",
          anexado: false,
          url: "",
          data_upload: "",
        },
        {
          nome: "Cópia do Comprovante de Residência atualizado *",
          anexado: false,
          url: "",
          data_upload: "",
        },
        { nome: "Certidão de Antecedentes Criminais *", anexado: false, url: "", data_upload: "" },
        {
          nome: "Cópia do cartão da conta para portabilidade",
          anexado: false,
          url: "",
          data_upload: "",
        },
        { nome: "Cópia da Carteira de Trabalho *", anexado: false, url: "", data_upload: "" },
      ]),
      treinamentos_anexos: "[]",
      ferramentais_anexos: "[]",
      epis_anexos: "[]",
      documentos_rh_anexos: "[]",
      autorizacao_formal_anexos: "[]",
      direito_recusa_anexos: "[]",
      ordem_servicos_anexos: "[]",
      observacoes: "",
      ativo: true,
    });
    setSelectedFuncionario(null);
    setTreinamentosDaFuncao([]);
  };

  const filteredFuncionarios = React.useMemo(() => {
    const filtered = funcionarios.filter(
      (f) =>
        f.nome_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.cpf?.includes(searchTerm) ||
        f.funcao_nome?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Aplicar ordenação
    return filtered.sort((a, b) => {
      let aVal, bVal;

      if (
        sortConfig.field === "data_admissao" ||
        sortConfig.field === "aso_vencimento" ||
        sortConfig.field === "data_nascimento" ||
        sortConfig.field === "created_date"
      ) {
        aVal = a[sortConfig.field] ? new Date(a[sortConfig.field]).getTime() : 0;
        bVal = b[sortConfig.field] ? new Date(b[sortConfig.field]).getTime() : 0;
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
  }, [funcionarios, searchTerm, sortConfig]);

  const getASOStatus = (vencimento) => {
    if (!vencimento) return null;
    const hoje = new Date();
    const dataVenc = new Date(vencimento + "T00:00:00");
    const diffDays = Math.ceil((dataVenc - hoje) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: "Vencido", color: "bg-red-100 text-red-700" };
    if (diffDays <= 30) return { label: "Vence em breve", color: "bg-yellow-100 text-yellow-700" };
    return { label: "Em dia", color: "bg-green-100 text-green-700" };
  };

  if (!temPermissao("Segurança do Trabalho")) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500">Sem permissão para acessar este módulo</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-7 h-7 text-amber-600" />
            Segurança do Trabalho
          </h1>
          <p className="text-slate-500">Gestão de funcionários e documentos de segurança</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="md:hidden mb-4">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(perfil === "Admin" || temPermissao("Segurança do Trabalho", "Funcionários")) && (
                <SelectItem value="funcionarios">Funcionários</SelectItem>
              )}
              {(perfil === "Admin" ||
                temPermissao("Segurança do Trabalho", "Inspeção de Campo")) && (
                <SelectItem value="inspecao_campo">Inspeção de Campo</SelectItem>
              )}
              {(perfil === "Admin" ||
                temPermissao("Segurança do Trabalho", "Inspeção de Ferramental")) && (
                <SelectItem value="inspecao_ferramental">Inspeção de Ferramental</SelectItem>
              )}
              {(perfil === "Admin" ||
                temPermissao("Segurança do Trabalho", "Inspeção de Caminhão")) && (
                <SelectItem value="inspecao_caminhao">Inspeção de Caminhão</SelectItem>
              )}
              {(perfil === "Admin" ||
                temPermissao("Segurança do Trabalho", "Documentação da Empresa")) && (
                <SelectItem value="documentacao_empresa">Documentação da Empresa</SelectItem>
              )}
              <SelectItem value="solicitacoes_entrega">Solicitações de Entrega</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <TabsList className="bg-slate-100 hidden md:flex">
          {(perfil === "Admin" || temPermissao("Segurança do Trabalho", "Funcionários")) && (
            <TabsTrigger value="funcionarios">Funcionários</TabsTrigger>
          )}
          {(perfil === "Admin" || temPermissao("Segurança do Trabalho", "Inspeção de Campo")) && (
            <TabsTrigger value="inspecao_campo">Inspeção de Campo</TabsTrigger>
          )}
          {(perfil === "Admin" ||
            temPermissao("Segurança do Trabalho", "Inspeção de Ferramental")) && (
            <TabsTrigger value="inspecao_ferramental">Inspeção de Ferramental</TabsTrigger>
          )}
          {(perfil === "Admin" ||
            temPermissao("Segurança do Trabalho", "Inspeção de Caminhão")) && (
            <TabsTrigger value="inspecao_caminhao">Inspeção de Caminhão</TabsTrigger>
          )}
          {(perfil === "Admin" ||
            temPermissao("Segurança do Trabalho", "Documentação da Empresa")) && (
            <TabsTrigger value="documentacao_empresa">Documentação da Empresa</TabsTrigger>
          )}
          <TabsTrigger value="solicitacoes_entrega">Solicitações de Entrega</TabsTrigger>
        </TabsList>

        {/* Aba Funcionários */}
        <TabsContent value="funcionarios">
          {/* Barra de ações em massa */}
          {funcionariosSelecionadosMassa.length > 0 && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
              <span className="text-sm font-medium text-amber-800">
                {funcionariosSelecionadosMassa.length} funcionário(s) selecionado(s)
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setShowExportacaoMassa(true)}
                  className="bg-amber-500 hover:bg-amber-600 gap-2"
                >
                  <Download className="w-4 h-4" />
                  Exportar Treinamentos / Lista de Presença
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFuncionariosSelecionadosMassa([])}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Funcionários</CardTitle>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Buscar funcionário..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 w-64"
                    />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="gap-2">
                        <Settings className="w-4 h-4" />
                        Ações
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={async () => {
                          const { jsPDF } = await import("jspdf");
                          const doc = new jsPDF("landscape");
                          doc.setFontSize(16);
                          doc.setFont(undefined, "bold");
                          doc.text("Lista de Funcionários", 14, 15);
                          doc.setFontSize(9);
                          doc.setFont(undefined, "normal");
                          doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 22);

                          let y = 32;
                          doc.setFontSize(8);
                          doc.setFont(undefined, "bold");
                          doc.setFillColor(240, 240, 240);
                          doc.rect(14, y - 4, 268, 6, "F");
                          doc.text("Nome", 15, y);
                          doc.text("CPF", 80, y);
                          doc.text("Função", 115, y);
                          doc.text("Admissão", 170, y);
                          doc.text("ASO Vencimento", 205, y);
                          doc.text("Telefone", 250, y);
                          y += 5;
                          doc.setDrawColor(200, 200, 200);
                          doc.line(14, y, 282, y);
                          y += 4;

                          doc.setFont(undefined, "normal");
                          filteredFuncionarios.forEach((f) => {
                            if (y > 190) {
                              doc.addPage();
                              y = 20;
                            }
                            doc.text((f.nome_completo || "").substring(0, 30), 15, y);
                            doc.text(formatCPF(f.cpf) || "-", 80, y);
                            doc.text((f.funcao_nome || "-").substring(0, 20), 115, y);
                            doc.text(
                              f.data_admissao
                                ? f.data_admissao.split("-").reverse().join("/")
                                : "-",
                              170,
                              y
                            );
                            doc.text(
                              f.aso_vencimento
                                ? f.aso_vencimento.split("-").reverse().join("/")
                                : "-",
                              205,
                              y
                            );
                            doc.text(f.telefone || "-", 250, y);
                            y += 6;
                          });

                          doc.save(`funcionarios_${new Date().toISOString().split("T")[0]}.pdf`);
                          toast.success("Lista exportada com sucesso");
                        }}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Exportar PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowImportarFuncionarios(true)}>
                        <Upload className="w-4 h-4 mr-2" />
                        Importar Funcionários
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowImportarCertificados(true)}>
                        <Upload className="w-4 h-4 mr-2" />
                        Importar Certificados (IA)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowImportarCertificadosMassa(true)}>
                        <Upload className="w-4 h-4 mr-2" />
                        Importar Certificados em Massa (IA)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          const cabecalhos = [
                            "Nome Completo *",
                            "CPF *",
                            "Data de Admissão (AAAA-MM-DD)",
                            "Função (Nome)",
                            "ASO Vencimento (AAAA-MM-DD)",
                            "Email",
                            "Telefone",
                          ];
                          const exemplo = [
                            "João da Silva",
                            "123.456.789-00",
                            "2024-01-15",
                            "Eletricista",
                            "2025-01-15",
                            "joao@email.com",
                            "(31) 99999-0000",
                          ];
                          const csv = [cabecalhos, exemplo].map((r) => r.join(";")).join("\n");
                          const blob = new Blob(["\uFEFF" + csv], {
                            type: "text/csv;charset=utf-8;",
                          });
                          const link = document.createElement("a");
                          link.href = URL.createObjectURL(blob);
                          link.download = "modelo_importacao_funcionarios.csv";
                          link.click();
                          toast.success("Modelo baixado com sucesso");
                        }}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Modelo de Importação
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    onClick={() => {
                      resetForm();
                      setShowFuncionarioModal(true);
                    }}
                    className="bg-amber-500 hover:bg-amber-600"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Funcionário
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        checked={
                          filteredFuncionarios.length > 0 &&
                          funcionariosSelecionadosMassa.length === filteredFuncionarios.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFuncionariosSelecionadosMassa(filteredFuncionarios);
                          } else {
                            setFuncionariosSelecionadosMassa([]);
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Foto</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Admissão</TableHead>
                    <TableHead>ASO</TableHead>
                    <TableHead>Documentos</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFuncionarios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                        Nenhum funcionário cadastrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFuncionarios.map((f) => {
                      const asoStatus = getASOStatus(f.aso_vencimento);
                      const docsPessoais = JSON.parse(f.documentos_pessoais || "[]");
                      const treinamentosAnexos = JSON.parse(f.treinamentos_anexos || "[]");
                      const ferramentaisAnexos = JSON.parse(f.ferramentais_anexos || "[]");
                      const episAnexos = JSON.parse(f.epis_anexos || "[]");
                      const totalDocs =
                        docsPessoais.length +
                        treinamentosAnexos.length +
                        ferramentaisAnexos.length +
                        episAnexos.length;

                      const isChecked = funcionariosSelecionadosMassa.some((s) => s.id === f.id);
                      return (
                        <TableRow key={f.id} className={isChecked ? "bg-amber-50" : ""}>
                          <TableCell>
                            <input
                              type="checkbox"
                              className="w-4 h-4"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFuncionariosSelecionadosMassa((prev) => [...prev, f]);
                                } else {
                                  setFuncionariosSelecionadosMassa((prev) =>
                                    prev.filter((s) => s.id !== f.id)
                                  );
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {f.foto_url ? (
                              <img
                                src={f.foto_url}
                                alt={f.nome_completo}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                                <span className="text-xs font-medium text-slate-600">
                                  {f.nome_completo?.charAt(0)}
                                </span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{f.nome_completo}</TableCell>
                          <TableCell className="text-sm">{formatCPF(f.cpf)}</TableCell>
                          <TableCell>
                            {f.funcao_nome ? (
                              <Badge variant="outline">{f.funcao_nome}</Badge>
                            ) : (
                              <span className="text-xs text-slate-400">Não definida</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {f.data_admissao ? f.data_admissao.split("-").reverse().join("/") : "-"}
                          </TableCell>
                          <TableCell>
                            {asoStatus ? (
                              <Badge className={asoStatus.color}>{asoStatus.label}</Badge>
                            ) : (
                              <span className="text-xs text-slate-400">Não informado</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              <FileText className="w-3 h-3" />
                              {totalDocs}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                  setSelectedFuncionario(f);
                                  const docsRH = f.documentos_rh_estruturados
                                    ? JSON.parse(f.documentos_rh_estruturados)
                                    : [
                                        {
                                          nome: "ASO - Atestado de Saúde Ocupacional *",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                        {
                                          nome: "Exames Médicos",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                        {
                                          nome: "Registro de Empregado",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                      ];
                                  const docsDemissionais = f.documentos_demissionais
                                    ? JSON.parse(f.documentos_demissionais)
                                    : [];
                                  setFuncionarioForm({
                                    ...f,
                                    documentos_rh_estruturados: JSON.stringify(docsRH),
                                    documentos_demissionais: JSON.stringify(docsDemissionais),
                                  });
                                  if (f.funcao_id) await carregarTreinamentosFuncao(f.funcao_id);
                                  setEditandoDatasTreinamento({});
                                  setTabAtiva("tst");
                                  setShowFuncionarioModal(true);
                                }}
                                title="Gerenciar Treinamentos"
                              >
                                <Download className="w-4 h-4 text-blue-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                  setSelectedFuncionario(f);

                                  // MANTER os documentos_obrigatorios EXATAMENTE como estão no banco
                                  // Inicializar documentos_rh_estruturados se não existir
                                  const docsRH = f.documentos_rh_estruturados
                                    ? JSON.parse(f.documentos_rh_estruturados)
                                    : [
                                        {
                                          nome: "ASO - Atestado de Saúde Ocupacional *",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                        {
                                          nome: "Exames Médicos",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                        {
                                          nome: "Registro de Empregado",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                      ];

                                  const docsDemissionais = f.documentos_demissionais
                                    ? JSON.parse(f.documentos_demissionais)
                                    : [
                                        {
                                          nome: "Aviso Prévio",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                        {
                                          nome: "Comprovante de Acordo Judicial",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                        {
                                          nome: "Declaração de Empregado Desligado do Contrato",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                        {
                                          nome: "Declaração de Pedido de Demissão",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                        {
                                          nome: "Demonstrativo do Trabalhador de Recolhimento FGTS Rescisório",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                        {
                                          nome: "Exame Demissional",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                        {
                                          nome: "GRRF - Guia de Recolhimento Rescisório do FGTS e Comprovante de Pagamento",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                        {
                                          nome: "PPP - Perfil Profissiográfico Previdenciário",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                        {
                                          nome: "TRCT - Termo de Rescisão de Contrato de Trabalho",
                                          anexado: false,
                                          url: "",
                                          data_upload: "",
                                          anexos: [],
                                        },
                                      ];

                                  setTabAtiva("dados");
                                  setFuncionarioForm({
                                    ...f,
                                    documentos_rh_estruturados: JSON.stringify(docsRH),
                                    documentos_demissionais: JSON.stringify(docsDemissionais),
                                  });

                                  if (f.funcao_id) await carregarTreinamentosFuncao(f.funcao_id);
                                  setEditandoDatasTreinamento({});

                                  setShowFuncionarioModal(true);
                                }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteFuncionario(f)}
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Inspeção de Campo */}
        <TabsContent value="inspecao_campo">
          <InspecaoCampoSegurancaTab empresaAtiva={empresaAtiva} />
        </TabsContent>

        {/* Aba Inspeção de Ferramental */}
        <TabsContent value="inspecao_ferramental">
          <InspecaoCampoTabFerramental
            empresaAtiva={empresaAtiva}
            inspecoesFerramental={inspecoesFerramental}
            reloadData={loadData}
            caminhoes={caminhoes}
          />
        </TabsContent>

        {/* Aba Inspeção de Caminhão */}
        <TabsContent value="inspecao_caminhao">
          <CaminhoesTab
            caminhoes={caminhoes}
            inspecoesCaminhao={inspecoesCaminhao}
            funcionarios={funcionarios}
            empresaAtiva={empresaAtiva}
            selectedCaminhao={selectedCaminhao}
            setSelectedCaminhao={setSelectedCaminhao}
            onNovoCaminhao={() => {
              setSelectedCaminhao(null);
              setCaminhaoForm({
                placa: "",
                modelo: "",
                marca: "",
                ano: "",
                cor: "",
                renavam: "",
                chassi: "",
                km_atual: 0,
                motorista_padrao_id: "",
                motorista_padrao_nome: "",
                foto_url: "",
                observacoes: "",
                ativo: true,
              });
              setShowCaminhaoModal(true);
            }}
            onEditarCaminhao={(caminhao) => {
              setSelectedCaminhao(caminhao);
              setCaminhaoForm(caminhao);
              setShowCaminhaoModal(true);
            }}
            onRecarregar={loadData}
            user={user}
          />
        </TabsContent>

        {/* Aba Documentação da Empresa */}
        <TabsContent value="documentacao_empresa">
          <DocumentacaoEmpresaTab
            empresaAtiva={empresaAtiva}
            temPermissao={temPermissao}
            perfil={perfil}
          />
        </TabsContent>

        {/* Aba Solicitações de Entrega */}
        <TabsContent value="solicitacoes_entrega">
          <SolicitacoesEntregaTab empresaAtiva={empresaAtiva} user={user} />
        </TabsContent>
      </Tabs>

      {/* Modal Funcionário */}
      <Sheet open={showFuncionarioModal} onOpenChange={setShowFuncionarioModal}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
            <SheetHeader className="flex-1">
              <SheetTitle className="text-lg font-semibold">
                {selectedFuncionario ? "Editar Funcionário" : "Novo Funcionário"}
              </SheetTitle>
            </SheetHeader>
            <button
              onClick={() => setShowFuncionarioModal(false)}
              className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          {/* Banner de análise IA */}
          {(analisandoDoc || alertaIA) && (
            <div
              className={cn(
                "mx-4 mt-3 p-3 rounded-lg border flex items-start gap-3",
                analisandoDoc
                  ? "bg-blue-50 border-blue-200"
                  : alertaIA?.ok
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
              )}
            >
              {analisandoDoc ? (
                <>
                  <Bot className="w-5 h-5 text-blue-500 flex-shrink-0 animate-pulse mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-700">
                      Analisando documento com IA Gemini...
                    </p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      Verificando se o documento está correto
                    </p>
                  </div>
                </>
              ) : alertaIA?.ok ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-700">
                      ✓ Documento verificado pela IA
                    </p>
                    <p className="text-xs text-green-600 mt-0.5">{alertaIA.mensagem}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 -mt-1 -mr-1"
                    onClick={() => setAlertaIA(null)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-700">⚠️ Verificar documento</p>
                    <p className="text-xs text-red-600 mt-0.5">{alertaIA?.mensagem}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 -mt-1 -mr-1"
                    onClick={() => setAlertaIA(null)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </>
              )}
            </div>
          )}

          <Tabs
            value={tabAtiva}
            onValueChange={(novaTab) => {
              // Validar permissão antes de trocar de aba
              if (perfil !== "Admin") {
                const abaParaModulo = {
                  dados: "Dados Pessoais",
                  documentacao: "Documentação",
                  instrucao: "Instrução",
                  bancarios: "Dados Bancários",
                  rh: "RH",
                  tst: "TST",
                };
                const moduloAba = abaParaModulo[novaTab];
                if (!temPermissao("Segurança do Trabalho", moduloAba)) {
                  toast.error("Você não tem permissão para acessar esta aba");
                  return;
                }
              }
              setTabAtiva(novaTab);
            }}
            className="mt-6"
          >
            <TabsList className="bg-slate-100 w-full flex flex-wrap">
              {(perfil === "Admin" || temPermissao("Segurança do Trabalho", "Dados Pessoais")) && (
                <TabsTrigger value="dados" className="flex-1 min-w-0">
                  Dados Pessoais
                </TabsTrigger>
              )}
              {(perfil === "Admin" || temPermissao("Segurança do Trabalho", "Documentação")) && (
                <TabsTrigger value="documentacao" className="flex-1 min-w-0">
                  Documentação
                </TabsTrigger>
              )}
              {(perfil === "Admin" || temPermissao("Segurança do Trabalho", "Instrução")) && (
                <TabsTrigger value="instrucao" className="flex-1 min-w-0">
                  Instrução
                </TabsTrigger>
              )}
              {(perfil === "Admin" || temPermissao("Segurança do Trabalho", "Dados Bancários")) && (
                <TabsTrigger value="bancarios" className="flex-1 min-w-0">
                  Bancários
                </TabsTrigger>
              )}
              {(perfil === "Admin" || temPermissao("Segurança do Trabalho", "RH")) && (
                <TabsTrigger value="rh" className="flex-1 min-w-0">
                  RH
                </TabsTrigger>
              )}
              {(perfil === "Admin" || temPermissao("Segurança do Trabalho", "TST")) && (
                <TabsTrigger value="tst" className="flex-1 min-w-0">
                  TST
                </TabsTrigger>
              )}
            </TabsList>

            {/* Aba Dados Pessoais */}
            <TabsContent value="dados" className="space-y-4 mt-4">
              {/* Foto */}
              <div>
                <Label>Foto do Funcionário</Label>
                <div className="mt-2 flex items-start gap-4">
                  {funcionarioForm.foto_url ? (
                    <div className="relative">
                      <img
                        src={funcionarioForm.foto_url}
                        alt="Foto"
                        className="w-24 h-24 rounded-full object-cover border-2"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full"
                        onClick={() => setFuncionarioForm({ ...funcionarioForm, foto_url: "" })}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="w-24 h-24 border-2 border-dashed rounded-full flex items-center justify-center cursor-pointer hover:border-amber-400">
                      <Plus className="w-6 h-6 text-slate-400" />
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleUploadFoto}
                        disabled={uploadingFoto}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Biometria */}
              <BiometriaFuncionarioPanel
                funcionarioForm={funcionarioForm}
                setFuncionarioForm={setFuncionarioForm}
                selectedFuncionario={selectedFuncionario}
                empresaAtiva={empresaAtiva}
                uploadingDoc={uploadingDoc}
                setUploadingDoc={setUploadingDoc}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Nome Completo (Colaborador/a) *</Label>
                  <Input
                    value={funcionarioForm.nome_completo}
                    onChange={(e) => {
                      setFuncionarioForm({ ...funcionarioForm, nome_completo: e.target.value });
                      handleAutoSave();
                    }}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Nome da Mãe</Label>
                  <Input
                    value={funcionarioForm.nome_mae}
                    onChange={(e) =>
                      setFuncionarioForm({ ...funcionarioForm, nome_mae: e.target.value })
                    }
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Nome do Pai</Label>
                  <Input
                    value={funcionarioForm.nome_pai}
                    onChange={(e) =>
                      setFuncionarioForm({ ...funcionarioForm, nome_pai: e.target.value })
                    }
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={funcionarioForm.email}
                    onChange={(e) =>
                      setFuncionarioForm({ ...funcionarioForm, email: e.target.value })
                    }
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={funcionarioForm.telefone}
                    onChange={(e) =>
                      setFuncionarioForm({ ...funcionarioForm, telefone: e.target.value })
                    }
                    placeholder="(00) 00000-0000"
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Endereço</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>CEP</Label>
                    <Input
                      value={funcionarioForm.cep}
                      onChange={async (e) => {
                        const cep = e.target.value;
                        setFuncionarioForm((prev) => ({ ...prev, cep }));
                        handleAutoSave();

                        const cepLimpo = cep.replace(/\D/g, "");
                        if (cepLimpo.length === 8) {
                          try {
                            const response = await fetch(
                              `https://viacep.com.br/ws/${cepLimpo}/json/`
                            );
                            const data = await response.json();
                            if (!data.erro) {
                              setFuncionarioForm((prev) => ({
                                ...prev,
                                endereco: data.logradouro || "",
                                bairro: data.bairro || "",
                                cidade: data.localidade || "",
                                estado: data.uf || "",
                              }));
                              toast.info("Endereço preenchido automaticamente");
                            } else {
                              toast.error("CEP não encontrado");
                            }
                          } catch (error) {
                            console.error("Erro ao buscar CEP:", error);
                            toast.error("Erro ao buscar CEP");
                          }
                        }
                      }}
                      placeholder="00000-000"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Endereço</Label>
                    <Input
                      value={funcionarioForm.endereco}
                      onChange={(e) =>
                        setFuncionarioForm({ ...funcionarioForm, endereco: e.target.value })
                      }
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Número</Label>
                    <Input
                      value={funcionarioForm.numero}
                      onChange={(e) =>
                        setFuncionarioForm({ ...funcionarioForm, numero: e.target.value })
                      }
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Complemento</Label>
                    <Input
                      value={funcionarioForm.complemento}
                      onChange={(e) =>
                        setFuncionarioForm({ ...funcionarioForm, complemento: e.target.value })
                      }
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Bairro</Label>
                    <Input
                      value={funcionarioForm.bairro}
                      onChange={(e) =>
                        setFuncionarioForm({ ...funcionarioForm, bairro: e.target.value })
                      }
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Cidade</Label>
                    <Input
                      value={funcionarioForm.cidade}
                      onChange={(e) =>
                        setFuncionarioForm({ ...funcionarioForm, cidade: e.target.value })
                      }
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Estado</Label>
                    <Input
                      value={funcionarioForm.estado}
                      onChange={(e) =>
                        setFuncionarioForm({ ...funcionarioForm, estado: e.target.value })
                      }
                      placeholder="SP"
                      maxLength={2}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Informações Trabalhistas</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>N° de Registro</Label>
                    <Input
                      value={funcionarioForm.numero_registro}
                      onChange={(e) => {
                        setFuncionarioForm({ ...funcionarioForm, numero_registro: e.target.value });
                        handleAutoSave();
                      }}
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label>Data de Admissão</Label>
                    <Input
                      type="date"
                      value={funcionarioForm.data_admissao}
                      onChange={(e) =>
                        setFuncionarioForm({ ...funcionarioForm, data_admissao: e.target.value })
                      }
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label>Função</Label>
                    <Select
                      value={funcionarioForm.funcao_id}
                      onValueChange={async (v) => {
                        const funcao = funcoes.find((f) => f.id === v);
                        setFuncionarioForm({
                          ...funcionarioForm,
                          funcao_id: v,
                          funcao_nome: funcao?.nome || "",
                        });

                        // Carregar treinamentos da função
                        await carregarTreinamentosFuncao(v);
                      }}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Selecione a função" />
                      </SelectTrigger>
                      <SelectContent>
                        {funcoes.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Vencimento do ASO</Label>
                    <Input
                      type="date"
                      value={funcionarioForm.aso_vencimento}
                      onChange={(e) =>
                        setFuncionarioForm({ ...funcionarioForm, aso_vencimento: e.target.value })
                      }
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  value={funcionarioForm.observacoes}
                  onChange={(e) =>
                    setFuncionarioForm({ ...funcionarioForm, observacoes: e.target.value })
                  }
                  className="mt-1.5"
                  rows={3}
                />
              </div>
            </TabsContent>

            {/* Aba Documentação */}
            <TabsContent value="documentacao">
              <DocumentacaoTab
                funcionarioForm={funcionarioForm}
                setFuncionarioForm={setFuncionarioForm}
                uploadingDoc={uploadingDoc}
                setUploadingDoc={setUploadingDoc}
              />
            </TabsContent>

            {/* Aba Instrução */}
            <TabsContent value="instrucao" className="space-y-4 mt-4">
              <div>
                <Label>Grau de Instrução</Label>
                <Select
                  value={funcionarioForm.grau_instrucao}
                  onValueChange={(v) =>
                    setFuncionarioForm({ ...funcionarioForm, grau_instrucao: v })
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Analfabeto">Analfabeto</SelectItem>
                    <SelectItem value="Fundamental até 5º Incompleto">
                      Fundamental até 5º Incompleto
                    </SelectItem>
                    <SelectItem value="Fundamental 5º Completo">Fundamental 5º Completo</SelectItem>
                    <SelectItem value="Fundamental 6º ao 9º">Fundamental 6º ao 9º</SelectItem>
                    <SelectItem value="Fundamental Completo">Fundamental Completo</SelectItem>
                    <SelectItem value="Ensino Médio Incompleto">Ensino Médio Incompleto</SelectItem>
                    <SelectItem value="Ensino Médio Completo">Ensino Médio Completo</SelectItem>
                    <SelectItem value="Superior Incompleto">Superior Incompleto</SelectItem>
                    <SelectItem value="Superior Completo">Superior Completo</SelectItem>
                    <SelectItem value="Pós-Graduação">Pós-Graduação</SelectItem>
                    <SelectItem value="Mestrado">Mestrado</SelectItem>
                    <SelectItem value="Doutorado">Doutorado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* Aba RH */}
            <TabsContent value="rh">
              <RHTab
                funcionarioForm={funcionarioForm}
                setFuncionarioForm={setFuncionarioForm}
                handleAutoSave={handleAutoSave}
                analisarDocumentoComIA={analisarDocumentoComIA}
                setAnalisandoDoc={setAnalisandoDoc}
                setAlertaIA={setAlertaIA}
                setShowSelecionarFuncionarioModal={setShowSelecionarFuncionarioModal}
                setShowUploadDocumentosRHZip={setShowUploadDocumentosRHZip}
                setDocumentoVisualizacao={setDocumentoVisualizacao}
                setShowVisualizadorDocumento={setShowVisualizadorDocumento}
                documentosRHAnalisados={documentosRHAnalisados}
                uploadingDoc={uploadingDoc}
                setUploadingDoc={setUploadingDoc}
                handleAbrirHistorico={handleAbrirHistorico}
                verificarDocumentosCompletos={verificarDocumentosCompletos}
                handleBaixarTodosAnexos={handleBaixarTodosAnexos}
              />
            </TabsContent>

            {/* Aba TST */}
            <TabsContent value="tst">
              <TSTTab
                funcionarioForm={funcionarioForm}
                setFuncionarioForm={setFuncionarioForm}
                handleAutoSave={handleAutoSave}
                treinamentosDaFuncao={treinamentosDaFuncao}
                editandoDatasTreinamento={editandoDatasTreinamento}
                setEditandoDatasTreinamento={setEditandoDatasTreinamento}
                empresaAtiva={empresaAtiva}
                uploadingDoc={uploadingDoc}
                setUploadingDoc={setUploadingDoc}
                selectedFuncionario={selectedFuncionario}
                loadData={async () => {
                  await loadData();
                  if (funcionarioForm.funcao_id)
                    await carregarTreinamentosFuncao(funcionarioForm.funcao_id);
                }}
                funcionarios={funcionarios}
                onAvancarFuncionario={async (proximoFunc) => {
                  setSelectedFuncionario(proximoFunc);
                  const docsRH = proximoFunc.documentos_rh_estruturados
                    ? JSON.parse(proximoFunc.documentos_rh_estruturados)
                    : [
                        {
                          nome: "ASO - Atestado de Saúde Ocupacional *",
                          anexado: false,
                          url: "",
                          data_upload: "",
                          anexos: [],
                        },
                        {
                          nome: "Exames Médicos",
                          anexado: false,
                          url: "",
                          data_upload: "",
                          anexos: [],
                        },
                        {
                          nome: "Registro de Empregado",
                          anexado: false,
                          url: "",
                          data_upload: "",
                          anexos: [],
                        },
                      ];
                  setFuncionarioForm({
                    ...proximoFunc,
                    documentos_rh_estruturados: JSON.stringify(docsRH),
                  });
                  if (proximoFunc.funcao_id)
                    await carregarTreinamentosFuncao(proximoFunc.funcao_id);
                }}
                setShowCertificadoAssinado={setShowCertificadoAssinadoExterno}
                setTreinamentoAssinado={setTreinamentoAssinadoExterno}
                setShowVisualizarCertificado={setShowVisualizarCertificado}
                setCertificadoSelecionado={setCertificadoSelecionado}
                onVisualizarFerramentas={() => setShowVisualizarFerramentas(true)}
                onVisualizarEPI={() => setShowVisualizarEPI(true)}
                onSolicitarEntregaFerramentas={() => setShowSolicitarEntregaFerramentas(true)}
                onVisualizarAutorizacaoFormal={() => setShowVisualizarAutorizacaoFormal(true)}
                onVisualizarDireitoRecusa={() => setShowVisualizarDireitoRecusa(true)}
                onVisualizarOrdemServico={() => setShowVisualizarOrdemServico(true)}
                user={user}
              />
            </TabsContent>

            {/* Aba Dados Bancários */}
            <TabsContent value="bancarios" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Código do Banco</Label>
                  <Input
                    value={funcionarioForm.banco_codigo}
                    onChange={(e) =>
                      setFuncionarioForm({ ...funcionarioForm, banco_codigo: e.target.value })
                    }
                    placeholder="Ex: 001, 033, 104"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Tipo da Conta</Label>
                  <Select
                    value={funcionarioForm.banco_tipo_conta}
                    onValueChange={(v) =>
                      setFuncionarioForm({ ...funcionarioForm, banco_tipo_conta: v })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Conta Corrente">Conta Corrente</SelectItem>
                      <SelectItem value="Conta Poupança">Conta Poupança</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Código da Agência</Label>
                  <Input
                    value={funcionarioForm.banco_agencia}
                    onChange={(e) =>
                      setFuncionarioForm({ ...funcionarioForm, banco_agencia: e.target.value })
                    }
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Número da Conta</Label>
                  <Input
                    value={funcionarioForm.banco_conta}
                    onChange={(e) =>
                      setFuncionarioForm({ ...funcionarioForm, banco_conta: e.target.value })
                    }
                    className="mt-1.5"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowFuncionarioModal(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveFuncionario}
              disabled={!funcionarioForm.nome_completo || !funcionarioForm.cpf}
              className="flex-1 bg-amber-500 hover:bg-amber-600"
            >
              {selectedFuncionario ? "Atualizar" : "Cadastrar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal Visualizar EPI */}
      {showVisualizarEPI && (
        <VisualizarEPIModal
          open={showVisualizarEPI}
          onOpenChange={setShowVisualizarEPI}
          funcionario={funcionarioForm}
          epis={JSON.parse(
            funcoes.find((f) => f.id === funcionarioForm.funcao_id)?.modelo_epi || "[]"
          )}
          empresaAtiva={empresaAtiva}
        />
      )}

      {/* Modal Visualizar Ferramentas */}
      {showVisualizarFerramentas && (
        <VisualizarFerramentasModal
          open={showVisualizarFerramentas}
          onOpenChange={setShowVisualizarFerramentas}
          funcionario={funcionarioForm}
          ferramentas={JSON.parse(
            funcoes.find((f) => f.id === funcionarioForm.funcao_id)?.modelo_ferramentas || "[]"
          )}
          empresaAtiva={empresaAtiva}
        />
      )}

      {/* Modal Visualizar Ordem de Serviço */}
      {showVisualizarOrdemServico && funcionarioForm.funcao_id && (
        <VisualizarOrdemServicoModal
          open={showVisualizarOrdemServico}
          onOpenChange={setShowVisualizarOrdemServico}
          funcionario={funcionarioForm}
          funcao={funcoes.find((f) => f.id === funcionarioForm.funcao_id)}
          empresaAtiva={empresaAtiva}
        />
      )}

      {/* Modal Visualizar Autorização Formal */}
      {showVisualizarAutorizacaoFormal && funcionarioForm.funcao_id && (
        <VisualizarAutorizacaoFormalCemigModal
          open={showVisualizarAutorizacaoFormal}
          onOpenChange={setShowVisualizarAutorizacaoFormal}
          funcionario={funcionarioForm}
          funcao={funcoes.find((f) => f.id === funcionarioForm.funcao_id)}
          empresaAtiva={empresaAtiva}
        />
      )}

      {/* Modal Visualizar Direito de Recusa */}
      {showVisualizarDireitoRecusa && (
        <VisualizarDireitoRecusaModal
          open={showVisualizarDireitoRecusa}
          onOpenChange={setShowVisualizarDireitoRecusa}
          funcionario={funcionarioForm}
          funcoes={funcoes}
          empresaAtiva={empresaAtiva}
        />
      )}

      {/* ===== MODAIS DA ABA RH ===== */}

      {/* Modal Histórico de Documentos RH */}
      <HistoricoDocumentosModal
        open={showHistoricoModal}
        onOpenChange={setShowHistoricoModal}
        documentos={historicoData}
        tipo={historicoTipo}
      />

      {/* Modal Visualizador de Documento RH */}
      <VisualizadorDocumentoModal
        open={showVisualizadorDocumento}
        onOpenChange={setShowVisualizadorDocumento}
        documento={documentoVisualizacao}
      />

      {/* Modal Visualizar Certificado - fora do Sheet para evitar Dialog aninhado */}
      <VisualizarCertificadoModal
        open={showVisualizarCertificado}
        onOpenChange={setShowVisualizarCertificado}
        treinamento={certificadoSelecionado}
        funcionario={funcionarioForm}
        empresaAtiva={empresaAtiva}
        datasEditadas={
          certificadoSelecionado ? editandoDatasTreinamento[certificadoSelecionado.id] : null
        }
      />

      {/* ===== MODAIS DE IMPORTAÇÃO ===== */}

      {/* Modal Importar Funcionários */}
      <ImportarFuncionariosModal
        open={showImportarFuncionarios}
        onOpenChange={setShowImportarFuncionarios}
        empresaAtiva={empresaAtiva}
        funcoes={funcoes}
        onSuccess={() => {
          loadData();
          setShowImportarFuncionarios(false);
        }}
      />

      {/* Modal Importar Certificados */}
      <ImportarCertificadosModal
        open={showImportarCertificados}
        onOpenChange={setShowImportarCertificados}
        empresaAtiva={empresaAtiva}
      />

      {/* Modal Importar Certificados em Massa (IA) */}
      {showImportarCertificadosMassa && funcionarios.length > 0 && (
        <ImportarCertificadosTSTModal
          open={showImportarCertificadosMassa}
          onOpenChange={setShowImportarCertificadosMassa}
          funcionarios={funcionarios}
          funcionarioAtual={funcionarios[0]}
          empresaAtiva={empresaAtiva}
          onCertificadosImportados={() => loadData()}
          onAvancarFuncionario={() => {}}
        />
      )}

      {/* Modal Upload Documentos RH em Lote (ZIP com IA) */}
      <UploadDocumentosRHZip
        open={showUploadDocumentosRHZip}
        onOpenChange={setShowUploadDocumentosRHZip}
        funcionarioId={selectedFuncionario?.id}
        empresaId={empresaAtiva?.id}
        onSuccess={async (dados) => {
          try {
            const docs = JSON.parse(funcionarioForm.documentos_rh_estruturados || "[]");
            const tipos = { aso: "ASO", exames: "Exames", registro: "Registro de Empregado" };
            const chave = Object.keys(tipos).find((k) => k === dados.tipo);
            if (chave) {
              const idx = docs.findIndex((d) => d.nome.includes(tipos[chave]));
              if (idx >= 0) {
                if (!docs[idx].anexos) docs[idx].anexos = [];
                dados.documentos.forEach((doc) =>
                  docs[idx].anexos.push({
                    url: doc.url,
                    nome_arquivo: doc.arquivo,
                    data_upload: new Date().toISOString(),
                    analise_ia: doc.analise,
                  })
                );
              }
            }
            const novoForm = {
              ...funcionarioForm,
              documentos_rh_estruturados: JSON.stringify(docs),
            };
            setFuncionarioForm(novoForm);
            handleAutoSave(novoForm);
            setDocumentosRHAnalisados(dados);
            toast.success("Documentos anexados com sucesso");
            setShowUploadDocumentosRHZip(false);
          } catch (error) {
            toast.error("Erro ao anexar documentos");
          }
        }}
      />

      {/* ===== MODAIS DA ABA FUNCIONÁRIOS ===== */}

      {/* Modal Exportação em Massa */}
      <ExportacaoMassaModal
        open={showExportacaoMassa}
        onOpenChange={setShowExportacaoMassa}
        funcionariosSelecionados={funcionariosSelecionadosMassa}
        empresaAtiva={empresaAtiva}
      />

      {/* ===== MODAIS DA ABA TST ===== */}

      {/* Modal Certificados Assinados - fora do Sheet para evitar nesting */}
      {showCertificadoAssinadoExterno && treinamentoAssinadoExterno && (
        <CertificadoAssinadoModal
          open={showCertificadoAssinadoExterno}
          onOpenChange={(val) => {
            setShowCertificadoAssinadoExterno(val);
            if (!val) setTreinamentoAssinadoExterno(null);
          }}
          treinamento={treinamentoAssinadoExterno}
          funcionario={funcionarioForm}
          onSave={async (novosAnexos) => {
            const novoForm = {
              ...funcionarioForm,
              treinamentos_anexos: JSON.stringify(novosAnexos),
            };
            setFuncionarioForm(novoForm);
            if (selectedFuncionario) {
              await base44.entities.Funcionario.update(selectedFuncionario.id, {
                treinamentos_anexos: JSON.stringify(novosAnexos),
              });
            }
          }}
          onDatasExtraidas={async (treinamentoId, camposAtualizados) => {
            const updateData = {};
            if (camposAtualizados.data_inicio)
              updateData.data_inicio = camposAtualizados.data_inicio;
            if (camposAtualizados.data_fim) updateData.data_fim = camposAtualizados.data_fim;
            if (camposAtualizados.aproveitamento)
              updateData.aproveitamento = parseInt(camposAtualizados.aproveitamento);
            if (Object.keys(updateData).length > 0) {
              await base44.entities.Treinamento.update(treinamentoId, updateData);
              loadData();
            }
          }}
        />
      )}

      {/* Modal Solicitação de EPI (removido bloco duplicado de CertificadoAssinadoModal acima) */}
      {showSolicitacaoEPI && funcionarioForm.funcao_id && (
        <SolicitacaoEPIModal
          open={showSolicitacaoEPI}
          onOpenChange={setShowSolicitacaoEPI}
          funcionario={funcionarioForm}
          epis={JSON.parse(
            funcoes.find((f) => f.id === funcionarioForm.funcao_id)?.modelo_epi || "[]"
          )}
          empresaAtiva={empresaAtiva}
          onSuccess={() => loadData()}
        />
      )}

      {/* Modal Solicitar Entrega de Ferramentas/EPIs */}
      {showSolicitarEntregaFerramentas && (
        <SolicitarEntregaFerramentasModal
          open={showSolicitarEntregaFerramentas}
          onOpenChange={setShowSolicitarEntregaFerramentas}
          funcionario={funcionarioForm}
          funcao={funcoes.find((f) => f.id === funcionarioForm.funcao_id)}
          empresaAtiva={empresaAtiva}
          user={user}
          onSuccess={() => {
            setShowSolicitarEntregaFerramentas(false);
            toast.success("Solicitação de entrega criada com sucesso!");
          }}
        />
      )}

      {/* Modal Gerar Certificados em Lote */}
      {showGerarCertificadosLote && (
        <GerarCertificadosLoteModal
          open={showGerarCertificadosLote}
          onOpenChange={setShowGerarCertificadosLote}
          funcionarios={funcionarios}
          empresaAtiva={empresaAtiva}
        />
      )}

      {/* Modal Caminhão */}
      <Sheet open={showCaminhaoModal} onOpenChange={setShowCaminhaoModal}>
        <SheetContent
          side="right"
          className="h-full overflow-y-auto p-0 flex flex-col w-full sm:max-w-2xl"
        >
          <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
            <SheetHeader className="flex-1">
              <SheetTitle>{selectedCaminhao ? "Editar Caminhão" : "Novo Caminhão"}</SheetTitle>
            </SheetHeader>
            <button
              onClick={() => setShowCaminhaoModal(false)}
              className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          <div className="p-6 flex-1 overflow-y-auto space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Placa *</Label>
                <Input
                  value={caminhaoForm.placa}
                  onChange={(e) =>
                    setCaminhaoForm({ ...caminhaoForm, placa: e.target.value.toUpperCase() })
                  }
                  placeholder="ABC-1234"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Modelo</Label>
                <Input
                  value={caminhaoForm.modelo}
                  onChange={(e) => setCaminhaoForm({ ...caminhaoForm, modelo: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Marca</Label>
                <Input
                  value={caminhaoForm.marca}
                  onChange={(e) => setCaminhaoForm({ ...caminhaoForm, marca: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Ano</Label>
                <Input
                  type="number"
                  value={caminhaoForm.ano}
                  onChange={(e) =>
                    setCaminhaoForm({ ...caminhaoForm, ano: parseInt(e.target.value) || "" })
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>KM Atual</Label>
                <Input
                  type="number"
                  value={caminhaoForm.km_atual}
                  onChange={(e) =>
                    setCaminhaoForm({ ...caminhaoForm, km_atual: parseInt(e.target.value) || 0 })
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Motorista Padrão</Label>
                <Select
                  value={caminhaoForm.motorista_padrao_id}
                  onValueChange={(v) => {
                    const m = funcionarios.find((f) => f.id === v);
                    setCaminhaoForm({
                      ...caminhaoForm,
                      motorista_padrao_id: v,
                      motorista_padrao_nome: m?.nome_completo || "",
                    });
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {funcionarios.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome_completo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Observações</Label>
                <Textarea
                  value={caminhaoForm.observacoes}
                  onChange={(e) =>
                    setCaminhaoForm({ ...caminhaoForm, observacoes: e.target.value })
                  }
                  className="mt-1.5"
                  rows={3}
                />
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowCaminhaoModal(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!caminhaoForm.placa) {
                  toast.error("Preencha a placa");
                  return;
                }
                try {
                  const data = { ...caminhaoForm, empresa_id: empresaAtiva.id };
                  if (selectedCaminhao) {
                    await base44.entities.Caminhao.update(selectedCaminhao.id, data);
                    toast.success("Caminhão atualizado");
                  } else {
                    await base44.entities.Caminhao.create(data);
                    toast.success("Caminhão cadastrado");
                  }
                  setShowCaminhaoModal(false);
                  loadData();
                } catch {
                  toast.error("Erro ao salvar caminhão");
                }
              }}
              className="bg-amber-500 hover:bg-amber-600 flex-1"
            >
              {selectedCaminhao ? "Atualizar" : "Cadastrar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal Selecionar Funcionário */}
      <Sheet open={showSelecionarFuncionarioModal} onOpenChange={setShowSelecionarFuncionarioModal}>
        <SheetContent
          side="right"
          className="h-full overflow-y-auto p-0 flex flex-col w-full sm:max-w-2xl"
        >
          <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0">
            <SheetHeader>
              <SheetTitle>Selecionar Funcionário - TST</SheetTitle>
            </SheetHeader>
          </div>
          <div className="p-6 flex-1 overflow-y-auto space-y-3">
            {funcionarios
              .filter((f) => f.funcao_id)
              .map((func) => (
                <button
                  key={func.id}
                  onClick={() => setFuncionarioSelecionadoParaGerarDocs(func)}
                  className={cn(
                    "w-full p-3 rounded-lg border-2 transition-all text-left",
                    funcionarioSelecionadoParaGerarDocs?.id === func.id
                      ? "border-amber-500 bg-amber-50"
                      : "border-slate-200 hover:border-amber-300"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                      <span className="text-sm font-medium">{func.nome_completo?.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-medium">{func.nome_completo}</p>
                      <p className="text-xs text-slate-500">{func.funcao_nome}</p>
                    </div>
                  </div>
                </button>
              ))}
          </div>
          <div className="sticky bottom-0 bg-white border-t p-6 flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowSelecionarFuncionarioModal(false);
                setFuncionarioSelecionadoParaGerarDocs(null);
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!funcionarioSelecionadoParaGerarDocs) {
                  toast.error("Selecione um funcionário");
                  return;
                }
                try {
                  const funcSelecionado = funcionarios.find(
                    (f) => f.id === funcionarioSelecionadoParaGerarDocs.id
                  );
                  await carregarTreinamentosFuncao(funcSelecionado.funcao_id);
                  const docsRH = funcSelecionado.documentos_rh_estruturados
                    ? JSON.parse(funcSelecionado.documentos_rh_estruturados)
                    : [
                        {
                          nome: "ASO - Atestado de Saúde Ocupacional *",
                          anexado: false,
                          url: "",
                          data_upload: "",
                          anexos: [],
                        },
                        {
                          nome: "Exames Médicos",
                          anexado: false,
                          url: "",
                          data_upload: "",
                          anexos: [],
                        },
                        {
                          nome: "Registro de Empregado",
                          anexado: false,
                          url: "",
                          data_upload: "",
                          anexos: [],
                        },
                      ];
                  setFuncionarioForm({
                    ...funcSelecionado,
                    documentos_rh_estruturados: JSON.stringify(docsRH),
                  });
                  setSelectedFuncionario(funcSelecionado);
                  setShowSelecionarFuncionarioModal(false);
                  setFuncionarioSelecionadoParaGerarDocs(null);
                  if (perfil === "Admin" || temPermissao("Segurança do Trabalho", "TST")) {
                    setTabAtiva("tst");
                    toast.success("Aba TST aberta.");
                  } else {
                    setTabAtiva("dados");
                    toast.error("Sem permissão para TST");
                  }
                } catch {
                  toast.error("Erro ao carregar dados do funcionário");
                }
              }}
              className="bg-amber-500 hover:bg-amber-600 flex-1"
              disabled={!funcionarioSelecionadoParaGerarDocs}
            >
              Continuar
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
