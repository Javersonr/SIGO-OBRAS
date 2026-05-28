import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Plus, AlertCircle, Loader2 } from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PermissoesTab from "@/components/saas/PermissoesTab";
import UsuarioEmpresaModal from "@/components/saas/UsuarioEmpresaModal";
import GruposEmpresariaisTab from "@/components/saas/GruposEmpresariaisTab";
import ExportacaoDadosTab from "@/components/saas/ExportacaoDadosTab";

const statusColors = {
  Ativa: "bg-green-100 text-green-700",
  Trial: "bg-blue-100 text-blue-700",
  Suspensa: "bg-yellow-100 text-yellow-700",
  Cancelada: "bg-red-100 text-red-700",
  Pago: "bg-green-100 text-green-700",
  Pendente: "bg-yellow-100 text-yellow-700",
  Vencido: "bg-red-100 text-red-700",
  Enviado: "bg-blue-100 text-blue-700",
  Emitido: "bg-slate-100 text-slate-700",
};

const pagamentoColors = {
  Pago: "bg-green-100 text-green-700",
  Pendente: "bg-yellow-100 text-yellow-700",
  Atrasado: "bg-red-100 text-red-700",
  Cancelado: "bg-slate-100 text-slate-700",
};

const formatCurrency = (value) => {
  if (!value) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

export default function SaasAdmin() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("empresas");
  const [empresas, setEmpresas] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [assinaturas, setAssinaturas] = useState([]);
  const [propostas, setPropostas] = useState([]);
  const [boletos, setBoletos] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [superAdmins, setSuperAdmins] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  // Form states
  const [showEmpresaModal, setShowEmpresaModal] = useState(false);
  const [showPlanoModal, setShowPlanoModal] = useState(false);
  const [showAssinaturaModal, setShowAssinaturaModal] = useState(false);
  const [showPropostaModal, setShowPropostaModal] = useState(false);
  const [showBoletoModal, setShowBoletoModal] = useState(false);
  const [showPagamentoModal, setShowPagamentoModal] = useState(false);
  const [showUsuarioModal, setShowUsuarioModal] = useState(false);
  const [showSuperAdminModal, setShowSuperAdminModal] = useState(false);
  const [showEmpresaDetalheModal, setShowEmpresaDetalheModal] = useState(false);
  const [showCriarAdminModal, setShowCriarAdminModal] = useState(false);
  const [criarAdminForm, setCriarAdminForm] = useState({
    nome_completo: "",
    email: "",
    senha: "",
    confirmar_senha: "",
  });
  const [salvandoAdmin, setSalvandoAdmin] = useState(false);
  const [sqlQuery, setSqlQuery] = useState("");
  const [sqlResult, setSqlResult] = useState(null);

  const [selectedEmpresa, setSelectedEmpresa] = useState(null);
  const [selectedPlano, setSelectedPlano] = useState(null);
  const [selectedAssinatura, setSelectedAssinatura] = useState(null);
  const [selectedProposta, setSelectedProposta] = useState(null);
  const [selectedBoleto, setSelectedBoleto] = useState(null);
  const [selectedUsuario, setSelectedUsuario] = useState(null);
  const [duplicandoDados, setDuplicandoDados] = useState(false);
  const [resultadoDuplicacao, setResultadoDuplicacao] = useState(null);
  const [duplicarEmpresaOrigemId, setDuplicarEmpresaOrigemId] = useState("");
  const [duplicarCategorias, setDuplicarCategorias] = useState({
    treinamentos: false,
    funcoes: false,
    ferramentas: false,
    mao_de_obra: false,
    materiais: false,
    contas_financeiras: false,
    categorias_financeiras: false,
    fornecedores: false,
    clientes: false,
    almoxarifados: false,
  });

  // Form data
  const [empresaForm, setEmpresaForm] = useState({
    nome: "",
    razao_social: "",
    cnpj: "",
    email: "",
    telefone: "",
    is_super_admin_empresa: false,
  });
  const [planoForm, setPlanoForm] = useState({
    nome: "",
    descricao: "",
    valor_mensal: 0,
    max_usuarios: 5,
    max_projetos: 10,
    modulos_liberados: {
      Oportunidades: false,
      Projetos: false,
      Compras: false,
      Estoque: false,
      "Ferramental e EPI": false,
      "Segurança do Trabalho": false,
      Financeiro: false,
      Contabilidade: false,
    },
  });
  const [assinaturaForm, setAssinaturaForm] = useState({
    empresa_id: "",
    plano_id: "",
    status: "Ativa",
    forma_pagamento: "Boleto",
    data_inicio: "",
    data_vencimento: "",
    observacoes: "",
  });
  const [propostaForm, setPropostaForm] = useState({
    empresa_nome: "",
    empresa_cnpj: "",
    contato_nome: "",
    contato_email: "",
    plano_id: "",
    desconto_percentual: 0,
    vigencia_meses: 12,
    observacoes: "",
  });
  const [boletoForm, setBoletoForm] = useState({
    empresa_id: "",
    valor: 0,
    data_vencimento: "",
    instrucoes: "",
  });
  const [pagamentoForm, setPagamentoForm] = useState({
    empresa_id: "",
    valor: 0,
    data_vencimento: "",
    status: "Pendente",
    forma_pagamento: "Boleto",
    assinatura_id: "",
  });
  const [superAdminForm, setSuperAdminForm] = useState({ nome_completo: "", email: "", senha: "" });

  const [stats, setStats] = useState({ receitaMensal: 0, assinaturasAtivas: 0, empresasAtivas: 0 });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const customAuth = sessionStorage.getItem("custom_auth");
      if (customAuth) {
        const authData = JSON.parse(customAuth);
        if (!authData.is_super_admin) {
          setLoading(false);
          return;
        }
      }

      const [
        empresasList,
        planosList,
        assinaturasList,
        propostasList,
        boletosList,
        pagamentosList,
        usuariosList,
        superAdminsList,
      ] = await Promise.all([
        sigo.entities.Empresa.filter({ ativo: true }),
        sigo.entities.Plano.filter({}),
        sigo.entities.Assinatura.filter({}),
        sigo.entities.PropostaComercial.filter({}),
        sigo.entities.BoletoBancario.filter({}),
        sigo.entities.Pagamento.filter({}),
        sigo.entities.UsuarioEmpresa.filter({}),
        sigo.entities.UsuarioCustom?.filter?.({ is_super_admin: true }) || [],
      ]);

      setEmpresas(empresasList);
      setPlanos(planosList);
      setAssinaturas(assinaturasList);
      setPropostas(propostasList);
      setBoletos(boletosList);
      setPagamentos(pagamentosList);
      setUsuarios(usuariosList);
      setSuperAdmins(superAdminsList);

      const assinaturasAtivas = assinaturasList.filter((a) => a.status === "Ativa");
      const receitaMensal = assinaturasAtivas.reduce((sum, a) => sum + (a.valor_mensal || 0), 0);
      setStats({
        receitaMensal,
        assinaturasAtivas: assinaturasAtivas.length,
        empresasAtivas: empresasList.length,
      });
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEmpresaModal = (empresa = null) => {
    if (empresa) {
      setSelectedEmpresa(empresa);
      setEmpresaForm({
        nome: empresa.nome,
        razao_social: empresa.razao_social || "",
        cnpj: empresa.cnpj || "",
        email: empresa.email || "",
        telefone: empresa.telefone || "",
        is_super_admin_empresa: empresa.is_super_admin_empresa || false,
      });
    } else {
      setSelectedEmpresa(null);
      setEmpresaForm({
        nome: "",
        razao_social: "",
        cnpj: "",
        email: "",
        telefone: "",
        is_super_admin_empresa: false,
      });
      setDuplicarEmpresaOrigemId("");
      setDuplicarCategorias({
        treinamentos: false,
        funcoes: false,
        ferramentas: false,
        mao_de_obra: false,
        materiais: false,
        contas_financeiras: false,
        categorias_financeiras: false,
        fornecedores: false,
        clientes: false,
        almoxarifados: false,
      });
      setResultadoDuplicacao(null);
    }
    setShowEmpresaModal(true);
  };

  const handleCloseEmpresaModal = () => {
    setShowEmpresaModal(false);
    setSelectedEmpresa(null);
  };

  const handleSaveEmpresa = async () => {
    if (!empresaForm.nome || !empresaForm.email) {
      toast.error("Preencha nome e email");
      return;
    }

    try {
      if (selectedEmpresa) {
        await sigo.entities.Empresa.update(selectedEmpresa.id, empresaForm);
        toast.success("Empresa atualizada");
      } else {
        await sigo.entities.Empresa.create(empresaForm);
        toast.success("Empresa criada");
      }
      handleCloseEmpresaModal();
      loadData();
    } catch (error) {
      toast.error("Erro ao salvar empresa");
    }
  };

  const handleOpenPlanoModal = (plano = null) => {
    if (plano) {
      setSelectedPlano(plano);
      // modulos_liberados é JSONB → pode vir como objeto OU como string (legado)
      const modulos = safeParseJSON(plano.modulos_liberados, {});
      setPlanoForm({
        nome: plano.nome,
        descricao: plano.descricao || "",
        valor_mensal: plano.valor_mensal,
        max_usuarios: plano.max_usuarios,
        max_projetos: plano.max_projetos,
        modulos_liberados: modulos,
      });
    } else {
      setSelectedPlano(null);
      setPlanoForm({
        nome: "",
        descricao: "",
        valor_mensal: 0,
        max_usuarios: 5,
        max_projetos: 10,
        modulos_liberados: {
          Oportunidades: false,
          Projetos: false,
          Compras: false,
          Estoque: false,
          "Ferramental e EPI": false,
          "Segurança do Trabalho": false,
          Financeiro: false,
          Contabilidade: false,
        },
      });
    }
    setShowPlanoModal(true);
  };

  const handleSavePlano = async () => {
    if (!planoForm.nome) {
      toast.error("Preencha o nome do plano");
      return;
    }

    try {
      const data = {
        ...planoForm,
        modulos_liberados: JSON.stringify(planoForm.modulos_liberados),
      };

      if (selectedPlano) {
        await sigo.entities.Plano.update(selectedPlano.id, data);
        toast.success("Plano atualizado");
      } else {
        await sigo.entities.Plano.create(data);
        toast.success("Plano criado");
      }
      setShowPlanoModal(false);
      loadData();
    } catch (error) {
      toast.error("Erro ao salvar plano");
    }
  };

  const handleDeletePlano = async (plano) => {
    if (confirm("Tem certeza que deseja deletar este plano?")) {
      try {
        await sigo.entities.Plano.delete(plano.id);
        toast.success("Plano deletado");
        loadData();
      } catch (error) {
        toast.error("Erro ao deletar plano");
      }
    }
  };

  const handleOpenAssinaturaModal = (assinatura = null) => {
    if (assinatura) {
      setSelectedAssinatura(assinatura);
      setAssinaturaForm({
        empresa_id: assinatura.empresa_id,
        plano_id: assinatura.plano_id,
        status: assinatura.status,
        forma_pagamento: assinatura.forma_pagamento,
        data_inicio: assinatura.data_inicio,
        data_vencimento: assinatura.data_vencimento,
        observacoes: assinatura.observacoes || "",
      });
    } else {
      setSelectedAssinatura(null);
      setAssinaturaForm({
        empresa_id: "",
        plano_id: "",
        status: "Ativa",
        forma_pagamento: "Boleto",
        data_inicio: "",
        data_vencimento: "",
        observacoes: "",
      });
    }
    setShowAssinaturaModal(true);
  };

  const handleSaveAssinatura = async () => {
    if (!assinaturaForm.empresa_id || !assinaturaForm.plano_id) {
      toast.error("Selecione empresa e plano");
      return;
    }

    try {
      const empresa = empresas.find((e) => e.id === assinaturaForm.empresa_id);
      const plano = planos.find((p) => p.id === assinaturaForm.plano_id);

      const data = {
        ...assinaturaForm,
        empresa_nome: empresa?.nome || "",
        plano_nome: plano?.nome || "",
        valor_mensal: plano?.valor_mensal || 0,
      };

      if (selectedAssinatura) {
        await sigo.entities.Assinatura.update(selectedAssinatura.id, data);
        toast.success("Assinatura atualizada");
      } else {
        await sigo.entities.Assinatura.create(data);
        toast.success("Assinatura criada");
      }
      setShowAssinaturaModal(false);
      loadData();
    } catch (error) {
      toast.error("Erro ao salvar assinatura");
    }
  };

  const handleDeleteAssinatura = async (assinatura) => {
    if (confirm("Deletar esta assinatura?")) {
      try {
        await sigo.entities.Assinatura.delete(assinatura.id);
        toast.success("Assinatura deletada");
        loadData();
      } catch (error) {
        toast.error("Erro ao deletar");
      }
    }
  };

  const handleOpenPropostaModal = (proposta = null) => {
    if (proposta) {
      setSelectedProposta(proposta);
      setPropostaForm({
        empresa_nome: proposta.empresa_nome,
        empresa_cnpj: proposta.empresa_cnpj,
        contato_nome: proposta.contato_nome,
        contato_email: proposta.contato_email,
        plano_id: proposta.plano_id,
        desconto_percentual: proposta.desconto_percentual || 0,
        vigencia_meses: proposta.vigencia_meses || 12,
        observacoes: proposta.observacoes || "",
      });
    } else {
      setSelectedProposta(null);
      setPropostaForm({
        empresa_nome: "",
        empresa_cnpj: "",
        contato_nome: "",
        contato_email: "",
        plano_id: "",
        desconto_percentual: 0,
        vigencia_meses: 12,
        observacoes: "",
      });
    }
    setShowPropostaModal(true);
  };

  const handleSaveProposta = async () => {
    if (!propostaForm.empresa_nome || !propostaForm.plano_id) {
      toast.error("Preencha empresa e selecione plano");
      return;
    }

    try {
      const plano = planos.find((p) => p.id === propostaForm.plano_id);
      const valorBase = plano?.valor_mensal || 0;
      const desconto = (valorBase * propostaForm.desconto_percentual) / 100;
      const valorFinal = valorBase - desconto;

      const data = {
        ...propostaForm,
        plano_nome: plano?.nome || "",
        valor_mensal: valorBase,
        valor_final: valorFinal,
        status: selectedProposta?.status || "Rascunho",
      };

      if (selectedProposta) {
        await sigo.entities.PropostaComercial.update(selectedProposta.id, data);
        toast.success("Proposta atualizada");
      } else {
        await sigo.entities.PropostaComercial.create(data);
        toast.success("Proposta criada");
      }
      setShowPropostaModal(false);
      loadData();
    } catch (error) {
      toast.error("Erro ao salvar proposta");
    }
  };

  const handleGerarPDFProposta = (proposta) => {
    toast.success("PDF em desenvolvimento");
  };

  const handleEnviarProposta = async (proposta) => {
    try {
      await sigo.entities.PropostaComercial.update(proposta.id, { status: "Enviada" });
      toast.success("Proposta enviada");
      loadData();
    } catch (error) {
      toast.error("Erro ao enviar proposta");
    }
  };

  const handleOpenBoletoModal = (boleto = null) => {
    if (boleto) {
      setSelectedBoleto(boleto);
      setBoletoForm({
        empresa_id: boleto.empresa_id,
        valor: boleto.valor,
        data_vencimento: boleto.data_vencimento,
        instrucoes: boleto.instrucoes || "",
      });
    } else {
      setSelectedBoleto(null);
      setBoletoForm({ empresa_id: "", valor: 0, data_vencimento: "", instrucoes: "" });
    }
    setShowBoletoModal(true);
  };

  const handleSaveBoleto = async () => {
    if (!boletoForm.empresa_id || !boletoForm.valor || !boletoForm.data_vencimento) {
      toast.error("Preencha todos os campos");
      return;
    }

    try {
      const empresa = empresas.find((e) => e.id === boletoForm.empresa_id);
      const data = {
        ...boletoForm,
        empresa_nome: empresa?.nome || "",
        status: selectedBoleto?.status || "Emitido",
      };

      if (selectedBoleto) {
        await sigo.entities.BoletoBancario.update(selectedBoleto.id, data);
        toast.success("Boleto atualizado");
      } else {
        await sigo.entities.BoletoBancario.create(data);
        toast.success("Boleto criado");
      }
      setShowBoletoModal(false);
      loadData();
    } catch (error) {
      toast.error("Erro ao salvar boleto");
    }
  };

  const handleEmitirBoleto = async (boleto) => {
    toast.success("Boleto emitido via gateway");
  };

  const handleDeleteBoleto = async (boleto) => {
    if (confirm("Deletar este boleto?")) {
      try {
        await sigo.entities.BoletoBancario.delete(boleto.id);
        toast.success("Boleto deletado");
        loadData();
      } catch (error) {
        toast.error("Erro ao deletar");
      }
    }
  };

  const handleOpenPagamentoModal = () => {
    setPagamentoForm({
      empresa_id: "",
      valor: 0,
      data_vencimento: "",
      status: "Pendente",
      forma_pagamento: "Boleto",
      assinatura_id: "",
    });
    setShowPagamentoModal(true);
  };

  const handleSavePagamento = async () => {
    if (!pagamentoForm.empresa_id) {
      toast.error("Selecione uma empresa");
      return;
    }

    try {
      const empresa = empresas.find((e) => e.id === pagamentoForm.empresa_id);
      const data = {
        ...pagamentoForm,
        empresa_nome: empresa?.nome || "",
      };

      await sigo.entities.Pagamento.create(data);
      toast.success("Pagamento registrado");
      setShowPagamentoModal(false);
      loadData();
    } catch (error) {
      toast.error("Erro ao registrar pagamento");
    }
  };

  const handleMarcarPago = async (pagamento) => {
    try {
      await sigo.entities.Pagamento.update(pagamento.id, {
        status: "Pago",
        data_pagamento: new Date().toISOString().split("T")[0],
      });
      toast.success("Pagamento marcado como pago");
      loadData();
    } catch (error) {
      toast.error("Erro ao marcar pagamento");
    }
  };

  const handleOpenSuperAdminModal = () => {
    setSuperAdminForm({ nome_completo: "", email: "", senha: "" });
    setShowSuperAdminModal(true);
  };

  const handleSaveSuperAdmin = async () => {
    if (!superAdminForm.nome_completo || !superAdminForm.email || !superAdminForm.senha) {
      toast.error("Preencha todos os campos");
      return;
    }

    try {
      await sigo.functions.invoke("criarSuperAdmin", superAdminForm);
      toast.success("Super admin criado");
      setShowSuperAdminModal(false);
      loadData();
    } catch (error) {
      toast.error("Erro ao criar super admin");
    }
  };

  const handleRemoveSuperAdmin = async (admin) => {
    if (confirm("Remover super admin?")) {
      try {
        await sigo.entities.UsuarioCustom.delete(admin.id);
        toast.success("Super admin removido");
        loadData();
      } catch (error) {
        toast.error("Erro ao remover");
      }
    }
  };

  const handleOpenUsuarioModal = (usuario = null) => {
    setSelectedUsuario(usuario);
    setShowUsuarioModal(true);
  };

  const handleSaveUsuario = async (data) => {
    try {
      if (selectedEmpresa) {
        if (selectedUsuario) {
          await sigo.entities.UsuarioEmpresa.update(selectedUsuario.id, {
            ...data,
            empresa_id: selectedEmpresa.id,
          });
          toast.success("Usuário atualizado");
        } else {
          await sigo.entities.UsuarioEmpresa.create({
            ...data,
            empresa_id: selectedEmpresa.id,
          });
          toast.success("Usuário criado");
        }
      }
      setShowUsuarioModal(false);
      loadData();
    } catch (error) {
      toast.error("Erro ao salvar usuário");
    }
  };

  const handleOpenEmpresaDetalheModal = (empresa) => {
    setSelectedEmpresa(empresa);
    setShowEmpresaDetalheModal(true);
  };

  const handleCriarAdmin = async () => {
    if (!criarAdminForm.nome_completo || !criarAdminForm.email || !criarAdminForm.senha) {
      toast.error("Preencha todos os campos");
      return;
    }
    if (criarAdminForm.senha !== criarAdminForm.confirmar_senha) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (criarAdminForm.senha.length < 6) {
      toast.error("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    setSalvandoAdmin(true);
    try {
      // 1. Criar UsuarioEmpresa (vínculo Admin)
      await sigo.entities.UsuarioEmpresa.create({
        usuario_email: criarAdminForm.email.toLowerCase().trim(),
        empresa_id: selectedEmpresa.id,
        nome_completo: criarAdminForm.nome_completo,
        perfil: "Admin",
        ativo: true,
        is_owner: false,
      });
      // 2. Criar UsuarioCustom com senha hash via função
      const { data } = await sigo.functions.invoke("criarUsuarioComSenha", {
        usuario_email: criarAdminForm.email.toLowerCase().trim(),
        nome_completo: criarAdminForm.nome_completo,
        empresa_id: selectedEmpresa.id,
        senha: criarAdminForm.senha,
      });
      if (data.success || data.usuarioCustomId) {
        toast.success("Administrador criado com sucesso!");
        setShowCriarAdminModal(false);
        setCriarAdminForm({ nome_completo: "", email: "", senha: "", confirmar_senha: "" });
        loadData();
      } else {
        toast.error(data.error || "Erro ao criar usuário");
      }
    } catch (error) {
      toast.error("Erro ao criar administrador");
      console.error(error);
    } finally {
      setSalvandoAdmin(false);
    }
  };

  const handleAlterarEmailUsuario = async (usuario, novoEmail) => {
    try {
      await sigo.functions.invoke("alterarEmailUsuario", {
        usuario_email: usuario.usuario_email,
        novo_email: novoEmail,
        empresa_id: usuario.empresa_id,
      });
      toast.success("Email alterado");
      loadData();
    } catch (error) {
      toast.error("Erro ao alterar email");
    }
  };

  const handleToggleUsuario = async (usuario) => {
    try {
      await sigo.entities.UsuarioEmpresa.update(usuario.id, {
        ativo: !usuario.ativo,
      });
      toast.success(usuario.ativo ? "Usuário desativado" : "Usuário ativado");
      loadData();
    } catch (error) {
      toast.error("Erro ao atualizar usuário");
    }
  };

  const usuariosEmpresaFiltrados = usuarios.filter((u) => u.empresa_id === selectedEmpresa?.id);

  const customAuth = sessionStorage.getItem("custom_auth");
  const customAuthData = customAuth ? JSON.parse(customAuth) : null;
  const isSuperAdmin = customAuthData?.is_super_admin === true;

  if (!customAuthData || !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h3 className="text-lg font-medium text-slate-800 mb-2">Acesso Negado</h3>
          <p className="text-slate-500">Apenas super administradores podem acessar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-right" richColors />

      <div>
        <h1 className="text-2xl font-bold text-slate-800">Administração SaaS</h1>
        <p className="text-slate-500">Gerencie empresas, planos e assinaturas</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="empresas">Empresas</TabsTrigger>
          <TabsTrigger value="planos">Planos</TabsTrigger>
          <TabsTrigger value="assinaturas">Assinaturas</TabsTrigger>
          <TabsTrigger value="propostas">Propostas</TabsTrigger>
          <TabsTrigger value="boletos">Boletos</TabsTrigger>
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="permissoes">Permissões</TabsTrigger>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
          <TabsTrigger value="superadmins">Super Admins</TabsTrigger>
          <TabsTrigger value="exportacao">Exportação</TabsTrigger>
        </TabsList>

        {/* Empresas */}
        <TabsContent value="empresas">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Empresas</CardTitle>
              <Button onClick={() => handleOpenEmpresaModal()} className="bg-amber-500">
                <Plus className="w-4 h-4 mr-2" /> Nova
              </Button>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mb-4"
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empresas
                    .filter((e) => e.nome?.includes(searchTerm))
                    .map((empresa) => (
                      <TableRow key={empresa.id}>
                        <TableCell className="font-medium">{empresa.nome}</TableCell>
                        <TableCell>{empresa.cnpj || "-"}</TableCell>
                        <TableCell>{empresa.email}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEmpresaDetalheModal(empresa)}
                          >
                            Ver
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEmpresaModal(empresa)}
                          >
                            Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Planos */}
        <TabsContent value="planos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Planos</CardTitle>
              <Button onClick={() => handleOpenPlanoModal()} className="bg-amber-500">
                <Plus className="w-4 h-4 mr-2" /> Novo
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {planos.map((plano) => (
                  <Card key={plano.id} className="border-2">
                    <CardContent className="p-6">
                      <h3 className="font-bold text-lg">{plano.nome}</h3>
                      <p className="text-2xl font-bold text-amber-600 my-2">
                        {formatCurrency(plano.valor_mensal)}
                      </p>
                      <p className="text-xs text-slate-500">• {plano.max_usuarios} usuários</p>
                      <p className="text-xs text-slate-500">• {plano.max_projetos} projetos</p>
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenPlanoModal(plano)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePlano(plano)}
                          className="text-red-600"
                        >
                          Deletar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assinaturas */}
        <TabsContent value="assinaturas">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Assinaturas</CardTitle>
              <Button onClick={() => handleOpenAssinaturaModal()} className="bg-amber-500">
                <Plus className="w-4 h-4 mr-2" /> Nova
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assinaturas.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.empresa_nome}</TableCell>
                      <TableCell>{a.plano_nome}</TableCell>
                      <TableCell>{formatCurrency(a.valor_mensal)}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[a.status]}>{a.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenAssinaturaModal(a)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAssinatura(a)}
                          className="text-red-600"
                        >
                          Deletar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Propostas */}
        <TabsContent value="propostas">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Propostas</CardTitle>
              <Button onClick={() => handleOpenPropostaModal()} className="bg-amber-500">
                <Plus className="w-4 h-4 mr-2" /> Nova
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {propostas.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.empresa_nome}</TableCell>
                      <TableCell>{p.plano_nome}</TableCell>
                      <TableCell>{formatCurrency(p.valor_final || p.valor_mensal)}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[p.status]}>{p.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenPropostaModal(p)}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Boletos */}
        <TabsContent value="boletos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Boletos</CardTitle>
              <Button onClick={() => handleOpenBoletoModal()} className="bg-amber-500">
                <Plus className="w-4 h-4 mr-2" /> Emitir
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boletos.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.empresa_nome}</TableCell>
                      <TableCell>{formatCurrency(b.valor)}</TableCell>
                      <TableCell>
                        {new Date(b.data_vencimento).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[b.status]}>{b.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleOpenBoletoModal(b)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteBoleto(b)}
                          className="text-red-600"
                        >
                          Deletar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pagamentos */}
        <TabsContent value="pagamentos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Pagamentos</CardTitle>
              <Button onClick={handleOpenPagamentoModal} className="bg-amber-500">
                <Plus className="w-4 h-4 mr-2" /> Registrar
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagamentos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.empresa_nome}</TableCell>
                      <TableCell>{formatCurrency(p.valor)}</TableCell>
                      <TableCell>
                        <Badge className={pagamentoColors[p.status]}>{p.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {p.status === "Pendente" && (
                          <Button
                            size="sm"
                            onClick={() => handleMarcarPago(p)}
                            className="bg-green-500"
                          >
                            Marcar Pago
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financeiro */}
        <TabsContent value="financeiro">
          <div className="grid gap-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-green-600">Receita Mensal</p>
                  <p className="text-2xl font-bold text-green-700">
                    {formatCurrency(stats.receitaMensal)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-blue-600">Assinaturas Ativas</p>
                  <p className="text-2xl font-bold text-blue-700">{stats.assinaturasAtivas}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-orange-600">Empresas Ativas</p>
                  <p className="text-2xl font-bold text-orange-700">{stats.empresasAtivas}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Permissões */}
        <TabsContent value="permissoes">
          <PermissoesTab />
        </TabsContent>

        {/* Grupos */}
        <TabsContent value="grupos">
          <GruposEmpresariaisTab empresas={empresas} />
        </TabsContent>

        {/* Exportação */}
        <TabsContent value="exportacao">
          <ExportacaoDadosTab />
        </TabsContent>

        {/* Super Admins */}
        <TabsContent value="superadmins">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Super Admins</CardTitle>
              <Button onClick={handleOpenSuperAdminModal} className="bg-amber-500">
                <Plus className="w-4 h-4 mr-2" /> Novo
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {superAdmins.map((admin) => (
                    <TableRow key={admin.id}>
                      <TableCell>{admin.nome_completo}</TableCell>
                      <TableCell>{admin.email}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveSuperAdmin(admin)}
                          className="text-red-600"
                        >
                          Remover
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modais */}
      <Sheet open={showEmpresaModal} onOpenChange={setShowEmpresaModal}>
        <SheetContent side="right" className="w-full overflow-y-auto" data-fullscreen-modal>
          <SheetHeader>
            <SheetTitle>{selectedEmpresa ? "Editar Empresa" : "Nova Empresa"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={empresaForm.nome}
                onChange={(e) => setEmpresaForm({ ...empresaForm, nome: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Razão Social</Label>
              <Input
                value={empresaForm.razao_social}
                onChange={(e) => setEmpresaForm({ ...empresaForm, razao_social: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>CNPJ</Label>
                <Input
                  value={empresaForm.cnpj}
                  onChange={(e) => setEmpresaForm({ ...empresaForm, cnpj: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={empresaForm.email}
                  onChange={(e) => setEmpresaForm({ ...empresaForm, email: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowEmpresaModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEmpresa} className="bg-amber-500">
              Salvar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showPlanoModal} onOpenChange={setShowPlanoModal}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedPlano ? "Editar Plano" : "Novo Plano"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={planoForm.nome}
                onChange={(e) => setPlanoForm({ ...planoForm, nome: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Valor Mensal</Label>
                <Input
                  type="number"
                  value={planoForm.valor_mensal}
                  onChange={(e) =>
                    setPlanoForm({ ...planoForm, valor_mensal: parseFloat(e.target.value) })
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Max. Usuários</Label>
                <Input
                  type="number"
                  value={planoForm.max_usuarios}
                  onChange={(e) =>
                    setPlanoForm({ ...planoForm, max_usuarios: parseInt(e.target.value) })
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Max. Projetos</Label>
                <Input
                  type="number"
                  value={planoForm.max_projetos}
                  onChange={(e) =>
                    setPlanoForm({ ...planoForm, max_projetos: parseInt(e.target.value) })
                  }
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="border-t pt-4">
              <Label className="font-semibold">Módulos Liberados</Label>
              <div className="grid grid-cols-2 gap-3 mt-3">
                {Object.keys(planoForm.modulos_liberados).map((modulo) => (
                  <div key={modulo} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={modulo}
                      checked={planoForm.modulos_liberados[modulo]}
                      onChange={(e) =>
                        setPlanoForm({
                          ...planoForm,
                          modulos_liberados: {
                            ...planoForm.modulos_liberados,
                            [modulo]: e.target.checked,
                          },
                        })
                      }
                      className="rounded"
                    />
                    <Label htmlFor={modulo} className="cursor-pointer">
                      {modulo}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowPlanoModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePlano} className="bg-amber-500">
              Salvar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showAssinaturaModal} onOpenChange={setShowAssinaturaModal}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Assinatura</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Empresa *</Label>
                <Select
                  value={assinaturaForm.empresa_id}
                  onValueChange={(v) => setAssinaturaForm({ ...assinaturaForm, empresa_id: v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Plano *</Label>
                <Select
                  value={assinaturaForm.plano_id}
                  onValueChange={(v) => setAssinaturaForm({ ...assinaturaForm, plano_id: v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {planos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowAssinaturaModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveAssinatura} className="bg-amber-500">
              Salvar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showPropostaModal} onOpenChange={setShowPropostaModal}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Proposta</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Empresa"
              value={propostaForm.empresa_nome}
              onChange={(e) => setPropostaForm({ ...propostaForm, empresa_nome: e.target.value })}
            />
            <Select
              value={propostaForm.plano_id}
              onValueChange={(v) => setPropostaForm({ ...propostaForm, plano_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione plano" />
              </SelectTrigger>
              <SelectContent>
                {planos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowPropostaModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveProposta} className="bg-amber-500">
              Salvar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showBoletoModal} onOpenChange={setShowBoletoModal}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Boleto</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <Select
              value={boletoForm.empresa_id}
              onValueChange={(v) => setBoletoForm({ ...boletoForm, empresa_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Valor"
              value={boletoForm.valor}
              onChange={(e) => setBoletoForm({ ...boletoForm, valor: parseFloat(e.target.value) })}
            />
            <Input
              type="date"
              value={boletoForm.data_vencimento}
              onChange={(e) => setBoletoForm({ ...boletoForm, data_vencimento: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowBoletoModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveBoleto} className="bg-amber-500">
              Salvar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showPagamentoModal} onOpenChange={setShowPagamentoModal}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Registrar Pagamento</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <Select
              value={pagamentoForm.empresa_id}
              onValueChange={(v) => setPagamentoForm({ ...pagamentoForm, empresa_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Valor"
              value={pagamentoForm.valor}
              onChange={(e) =>
                setPagamentoForm({ ...pagamentoForm, valor: parseFloat(e.target.value) })
              }
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowPagamentoModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePagamento} className="bg-amber-500">
              Salvar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showSuperAdminModal} onOpenChange={setShowSuperAdminModal}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Novo Super Admin</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Nome"
              value={superAdminForm.nome_completo}
              onChange={(e) =>
                setSuperAdminForm({ ...superAdminForm, nome_completo: e.target.value })
              }
            />
            <Input
              type="email"
              placeholder="Email"
              value={superAdminForm.email}
              onChange={(e) => setSuperAdminForm({ ...superAdminForm, email: e.target.value })}
            />
            <Input
              type="password"
              placeholder="Senha"
              value={superAdminForm.senha}
              onChange={(e) => setSuperAdminForm({ ...superAdminForm, senha: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowSuperAdminModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveSuperAdmin} className="bg-amber-500">
              Criar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showEmpresaDetalheModal} onOpenChange={setShowEmpresaDetalheModal}>
        <SheetContent side="right" className="w-full overflow-y-auto" data-fullscreen-modal>
          <SheetHeader>
            <SheetTitle>Detalhes da Empresa</SheetTitle>
          </SheetHeader>
          {selectedEmpresa && (
            <Tabs defaultValue="info" className="mt-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="usuarios">
                  Usuários ({usuariosEmpresaFiltrados.length})
                </TabsTrigger>
                <TabsTrigger value="assinatura">Assinatura</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 py-4">
                <div>
                  <p className="text-sm text-slate-500">Nome</p>
                  <p className="font-medium">{selectedEmpresa.nome}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">CNPJ</p>
                  <p className="font-medium">{selectedEmpresa.cnpj}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Email</p>
                  <p className="font-medium">{selectedEmpresa.email}</p>
                </div>
              </TabsContent>

              <TabsContent value="usuarios" className="space-y-4 py-4">
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setCriarAdminForm({
                        nome_completo: "",
                        email: "",
                        senha: "",
                        confirmar_senha: "",
                      });
                      setShowCriarAdminModal(true);
                    }}
                    className="bg-amber-500"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Criar Admin com Senha
                  </Button>
                  <Button onClick={() => handleOpenUsuarioModal()} variant="outline">
                    <Plus className="w-4 h-4 mr-2" /> Novo Usuário (sem senha)
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usuariosEmpresaFiltrados.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>{u.nome_completo}</TableCell>
                        <TableCell>{u.usuario_email}</TableCell>
                        <TableCell>{u.perfil}</TableCell>
                        <TableCell>
                          <Badge className={u.ativo ? "bg-green-100" : "bg-red-100"}>
                            {u.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="assinatura">
                {assinaturas.find((a) => a.empresa_id === selectedEmpresa.id) ? (
                  <div className="py-4 space-y-4">
                    <div>
                      <p className="text-sm text-slate-500">Plano</p>
                      <p className="font-medium">
                        {assinaturas.find((a) => a.empresa_id === selectedEmpresa.id)?.plano_nome}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Valor</p>
                      <p className="font-medium">
                        {formatCurrency(
                          assinaturas.find((a) => a.empresa_id === selectedEmpresa.id)?.valor_mensal
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Status</p>
                      <Badge
                        className={
                          statusColors[
                            assinaturas.find((a) => a.empresa_id === selectedEmpresa.id)?.status
                          ]
                        }
                      >
                        {assinaturas.find((a) => a.empresa_id === selectedEmpresa.id)?.status}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 py-4">Sem assinatura</p>
                )}
              </TabsContent>
            </Tabs>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <Button onClick={() => setShowEmpresaDetalheModal(false)}>Fechar</Button>
          </div>
        </SheetContent>
      </Sheet>

      {selectedEmpresa && (
        <UsuarioEmpresaModal
          open={showUsuarioModal}
          onOpenChange={setShowUsuarioModal}
          usuario={selectedUsuario}
          onSave={handleSaveUsuario}
          empresaId={selectedEmpresa.id}
          empresaNome={selectedEmpresa.nome}
          modulosLiberados={[]}
        />
      )}

      {/* Modal Criar Admin com Senha */}
      <Sheet open={showCriarAdminModal} onOpenChange={setShowCriarAdminModal}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Criar Administrador</SheetTitle>
            <p className="text-sm text-slate-500">
              Empresa: <strong>{selectedEmpresa?.nome}</strong>
            </p>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome Completo *</Label>
              <Input
                value={criarAdminForm.nome_completo}
                onChange={(e) =>
                  setCriarAdminForm({ ...criarAdminForm, nome_completo: e.target.value })
                }
                placeholder="Nome do administrador"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={criarAdminForm.email}
                onChange={(e) => setCriarAdminForm({ ...criarAdminForm, email: e.target.value })}
                placeholder="email@empresa.com"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Senha *</Label>
              <Input
                type="password"
                value={criarAdminForm.senha}
                onChange={(e) => setCriarAdminForm({ ...criarAdminForm, senha: e.target.value })}
                placeholder="Mínimo 6 caracteres"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Confirmar Senha *</Label>
              <Input
                type="password"
                value={criarAdminForm.confirmar_senha}
                onChange={(e) =>
                  setCriarAdminForm({ ...criarAdminForm, confirmar_senha: e.target.value })
                }
                placeholder="Digite a senha novamente"
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowCriarAdminModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCriarAdmin} disabled={salvandoAdmin} className="bg-amber-500">
              {salvandoAdmin ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...
                </>
              ) : (
                "Criar Administrador"
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
