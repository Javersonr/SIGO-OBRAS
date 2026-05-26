import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useEmpresa } from "../Layout";
import { Plus, Trash2 } from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AprovacaoConfigTab from "@/components/configuracoes/AprovacaoConfigTab";
import UsuarioEditModal from "@/components/configuracoes/UsuarioEditModal";
import FuncoesTab from "@/components/configuracoes/FuncoesTab";
import KitsTab from "@/components/configuracoes/KitsTab";
import ClientesTab from "@/components/configuracoes/ClientesTab";
import FornecedoresTab from "@/components/configuracoes/FornecedoresTab";
import MateriaisTab from "@/components/configuracoes/MateriaisTab";
import MaoDeObraTab from "@/components/configuracoes/MaoDeObraTab";
import EmpresaTab from "@/components/configuracoes/EmpresaTab";
import UsuariosTab from "@/components/configuracoes/UsuariosTab";
import VisualizarCatalogModal from "@/components/compras/VisualizarCatalogModal";
import { useBulkOperations } from "@/components/configuracoes/useBulkOperations";
import ConfiguracaoNotificacoes from "@/components/notificacoes/ConfiguracaoNotificacoes";
import CaminhoesConfigTab from "@/components/configuracoes/CaminhoesConfigTab";

export default function Configuracoes() {
  const { empresaAtiva, perfil, user, reloadEmpresaAtiva, empresas, setEmpresaAtiva } =
    useEmpresa();
  const { deleteProgress, deletarTodos, deletarSelecionados } = useBulkOperations();
  const [activeTab, setActiveTab] = useState("notificacoes");
  const [modulosLiberados, setModulosLiberados] = useState({});
  const [showNovaEmpresa, setShowNovaEmpresa] = useState(false);
  const [empresaForm, setEmpresaForm] = useState({ nome: "" });

  // Empresa
  const [empresaData, setEmpresaData] = useState({});
  const [savingEmpresa, setSavingEmpresa] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [buscandoCepEmpresa, setBuscandoCepEmpresa] = useState(false);

  // Usuários
  const [usuarios, setUsuarios] = useState([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Categorias Financeiras
  const [categorias, setCategorias] = useState([]);
  const [showCategoriaModal, setShowCategoriaModal] = useState(false);
  const [categoriaForm, setCategoriaForm] = useState({ nome: "", tipo: "Despesa" });

  // Clientes
  const [clientes, setClientes] = useState([]);

  // Fornecedores
  const [fornecedores, setFornecedores] = useState([]);

  // Materiais
  const [materiais, setMateriais] = useState([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState([]);

  // Mão de Obra
  const [maoDeObra, setMaoDeObra] = useState([]);
  const [selectedMaoDeObraIds, setSelectedMaoDeObraIds] = useState([]);
  const [categoriasMaoDeObra, setCategoriasMaoDeObra] = useState([]);
  const [showPrecoUSModal, setShowPrecoUSModal] = useState(false);
  const [selectedMaoObraUS, setSelectedMaoObraUS] = useState(null);
  const [precoUSForm, setPrecoUSForm] = useState({ valor_us_global: "" });

  // Categorias de Material
  const [categoriasMaterial, setCategoriasMaterial] = useState([]);

  // Unidades de Medida
  const [unidadesMedida, setUnidadesMedida] = useState([]);

  // Import/Export/Visualizar
  const [importProgress, setImportProgress] = useState({ show: false, current: 0, total: 0 });
  const [updateUSProgress, setUpdateUSProgress] = useState({ show: false, current: 0, total: 0 });
  const [showVisualizarCatalog, setShowVisualizarCatalog] = useState(false);
  const [catalogItemId, setCatalogItemId] = useState(null);
  const [catalogItemTipo, setCatalogItemTipo] = useState(null);

  // Define loadData early to avoid initialization issues
  const loadData = useCallback(async () => {
    if (!empresaAtiva?.id) return;

    // Carregar módulos liberados do plano
    try {
      const todasAssinaturas = await base44.entities.Assinatura.filter({
        empresa_id: empresaAtiva.id,
      });
      const assinaturas = todasAssinaturas.filter(
        (a) => a.status === "Ativa" || a.status === "Trial"
      );

      if (assinaturas.length > 0) {
        const assinatura = assinaturas[0];
        const planos = await base44.entities.Plano.filter({ id: assinatura.plano_id });
        if (planos.length > 0) {
          const plano = planos[0];
          let modulos = {};
          if (plano.modulos_liberados) {
            try {
              modulos = JSON.parse(plano.modulos_liberados);
            } catch {}
          }
          setModulosLiberados(modulos);
        } else {
          setModulosLiberados({});
        }
      } else {
        setModulosLiberados({});
      }
    } catch (error) {
      console.error("[Configuracoes] Erro ao buscar assinatura/plano:", error);
      setModulosLiberados({});
    }

    setEmpresaData({
      nome: empresaAtiva.nome || "",
      razao_social: empresaAtiva.razao_social || "",
      nome_fantasia: empresaAtiva.nome_fantasia || "",
      cnpj: empresaAtiva.cnpj || "",
      inscricao_estadual: empresaAtiva.inscricao_estadual || "",
      inscricao_municipal: empresaAtiva.inscricao_municipal || "",
      email: empresaAtiva.email || "",
      telefone: empresaAtiva.telefone || "",
      whatsapp_financeiro: empresaAtiva.whatsapp_financeiro || "",
      cep: empresaAtiva.cep || "",
      endereco: empresaAtiva.endereco || "",
      numero: empresaAtiva.numero || "",
      complemento: empresaAtiva.complemento || "",
      bairro: empresaAtiva.bairro || "",
      cidade: empresaAtiva.cidade || "",
      estado: empresaAtiva.estado || "",
      responsavel_principal: empresaAtiva.responsavel_principal || "",
      observacoes: empresaAtiva.observacoes || "",
      logo_url: empresaAtiva.logo_url || "",
      tema_cores: empresaAtiva.tema_cores,
    });

    // Batch 1: Fetch usuarios
    const vinculos = await base44.entities.UsuarioEmpresa.filter({
      empresa_id: empresaAtiva.id,
      ativo: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Batch 2: Fetch categorias financeiras
    const cats = await base44.entities.CategoriaFinanceira.filter({ empresa_id: empresaAtiva.id });
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Batch 3: Fetch clientes
    const clientesList = await base44.entities.Cliente.filter({
      empresa_id: empresaAtiva.id,
      ativo: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Batch 4: Fetch fornecedores
    const fornecedoresList = await base44.entities.Fornecedor.filter({
      empresa_id: empresaAtiva.id,
      ativo: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Batch 5: Fetch materiais
    const materiaisList = await base44.entities.Material.filter({
      empresa_id: empresaAtiva.id,
      ativo: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Batch 6: Fetch mão de obra
    const maoDeObraList = await base44.entities.MaoDeObra.filter({
      empresa_id: empresaAtiva.id,
      ativo: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Batch 7: Fetch categorias
    const catsMaterial = await base44.entities.CategoriaMaterial.filter({
      empresa_id: empresaAtiva.id,
      ativo: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const catsMaoObra = await base44.entities.CategoriaMaoDeObra.filter({
      empresa_id: empresaAtiva.id,
      ativo: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const unidades = await base44.entities.UnidadeMedida.filter({
      empresa_id: empresaAtiva.id,
      ativo: true,
    });

    setUsuarios(vinculos);
    setCategorias(cats);
    setClientes(clientesList);
    setFornecedores(fornecedoresList);
    setMateriais(materiaisList);
    setMaoDeObra(maoDeObraList);
    setCategoriasMaterial(catsMaterial);
    setCategoriasMaoDeObra(catsMaoObra);
    setUnidadesMedida(unidades);
  }, [empresaAtiva?.id, user?.email]);

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadData();
    }
  }, [loadData, empresaAtiva?.id]);

  // Empresa handlers
  const handleSaveEmpresa = async () => {
    setSavingEmpresa(true);
    try {
      await base44.entities.Empresa.update(empresaAtiva.id, empresaData);
      await reloadEmpresaAtiva();
      toast.success("✅ Dados da empresa salvos com sucesso", { duration: 3000 });
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("❌ Erro ao salvar dados da empresa", { duration: 4000 });
    } finally {
      setSavingEmpresa(false);
    }
  };

  const handleUploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setEmpresaData({ ...empresaData, logo_url: file_url });
      toast.success("✅ Logo enviado com sucesso", { duration: 3000 });
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      toast.error("❌ Erro ao enviar logo", { duration: 4000 });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleBuscarCepEmpresa = async (cep) => {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;

    setBuscandoCepEmpresa(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await response.json();

      if (!data.erro) {
        setEmpresaData((prev) => ({
          ...prev,
          endereco: data.logradouro || "",
          bairro: data.bairro || "",
          cidade: data.localidade || "",
          estado: data.uf || "",
        }));
        toast.success("✅ CEP encontrado", { duration: 2000 });
      } else {
        toast.error("❌ CEP não encontrado", { duration: 3000 });
      }
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
      toast.error("❌ Erro ao buscar CEP", { duration: 3000 });
    } finally {
      setBuscandoCepEmpresa(false);
    }
  };

  const handleBuscarCnpj = async (cnpj) => {
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    if (cnpjLimpo.length !== 14) {
      toast.error("❌ CNPJ deve ter 14 dígitos", { duration: 3000 });
      return;
    }

    setBuscandoCepEmpresa(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
      const data = await response.json();

      if (data && data.razao_social) {
        setEmpresaData((prev) => ({
          ...prev,
          cnpj: data.cnpj || cnpjLimpo,
          razao_social: data.razao_social || prev.razao_social,
          nome_fantasia: data.nome_fantasia || prev.nome_fantasia,
          endereco: data.logradouro || prev.endereco,
          numero: data.numero || prev.numero,
          bairro: data.bairro || prev.bairro,
          cidade: data.municipio || prev.cidade,
          estado: data.uf || prev.estado,
          cep: data.cep || prev.cep,
          email: data.email || prev.email,
          telefone: data.ddd_telefone_1 || prev.telefone,
        }));
        toast.success("✅ CNPJ encontrado", { duration: 2000 });
      } else {
        toast.error("❌ CNPJ não encontrado", { duration: 3000 });
      }
    } catch (error) {
      console.error("Erro ao buscar CNPJ:", error);
      toast.error("❌ Erro ao buscar CNPJ - verifique se o número está correto", {
        duration: 3000,
      });
    } finally {
      setBuscandoCepEmpresa(false);
    }
  };

  // Usuários handlers
  const handleSaveUser = async (formData) => {
    if (!formData.email) return;

    // Validar se Cliente tem projeto vinculado
    if (formData.perfil === "Cliente" && !formData.projeto_id) {
      toast.error("❌ Selecione um projeto para vincular ao cliente");
      return;
    }

    try {
      const permissoes = formData.perfil === "Admin" ? {} : formData.permissoes || {};

      const userData = {
        nome_completo: formData.nome_completo,
        telefone: formData.telefone,
        perfil: formData.perfil,
        permissoes: JSON.stringify(permissoes),
        projeto_id: formData.perfil === "Cliente" ? formData.projeto_id : null,
        projeto_nome: formData.perfil === "Cliente" ? formData.projeto_nome : null,
        ativo: true,
      };

      if (selectedUser) {
        await base44.entities.UsuarioEmpresa.update(selectedUser.id, userData);
        toast.success("✅ Usuário atualizado com sucesso");
      } else {
        // Criar novo usuário direto (já vinculado à empresa)
        await base44.entities.UsuarioEmpresa.create({
          usuario_email: formData.email,
          empresa_id: empresaAtiva.id,
          ...userData,
        });
        toast.success("✅ Usuário criado com sucesso!");
      }
      setShowUserModal(false);
      setSelectedUser(null);
      loadData();
    } catch (error) {
      console.error("Erro:", error);
      toast.error("❌ Erro ao processar: " + error.message);
    }
  };

  const handleDeleteUser = async (vinculo) => {
    if (!confirm("Remover este usuário da empresa?")) return;
    await base44.entities.UsuarioEmpresa.update(vinculo.id, { ativo: false });
    loadData();
  };

  const [enviandoReset, setEnviandoReset] = useState(null);
  const [linkResetModal, setLinkResetModal] = useState(null); // { nome, link, email }

  const handleGerarLinkReset = async (usuario) => {
    setEnviandoReset(usuario.id);
    try {
      const response = await base44.functions.invoke("enviarResetSenhaAdmin", {
        usuario_email: usuario.usuario_email,
      });
      if (response.data.success) {
        setLinkResetModal({
          nome: response.data.nome || usuario.nome_completo || usuario.usuario_email,
          link: response.data.link,
          email: usuario.usuario_email,
        });
      } else {
        toast.error("❌ " + (response.data.error || "Erro ao gerar link"));
      }
    } catch (error) {
      toast.error("❌ Erro: " + error.message);
    } finally {
      setEnviandoReset(null);
    }
  };

  // Categoria handlers
  const handleSaveCategoria = async () => {
    if (!categoriaForm.nome) return;
    try {
      await base44.entities.CategoriaFinanceira.create({
        empresa_id: empresaAtiva.id,
        nome: categoriaForm.nome,
        tipo: categoriaForm.tipo,
        ativo: true,
      });
      setShowCategoriaModal(false);
      setCategoriaForm({ nome: "", tipo: "Despesa" });
      loadData();
    } catch (error) {
      console.error("Erro:", error);
    }
  };

  const handleDeleteCategoria = async (cat) => {
    if (!confirm("Excluir esta categoria?")) return;
    await base44.entities.CategoriaFinanceira.delete(cat.id);
    loadData();
  };

  const handleLimparTodosMaoDeObra = async () => {
    await deletarTodos(
      base44.entities.MaoDeObra,
      { empresa_id: empresaAtiva.id, ativo: true },
      "serviços"
    );
    setSelectedMaoDeObraIds([]);
    loadData();
  };

  const handleDeletarSelecionadosMaoDeObra = async () => {
    await deletarSelecionados(base44.entities.MaoDeObra, selectedMaoDeObraIds, "serviços");
    setSelectedMaoDeObraIds([]);
    loadData();
  };

  // Handlers para Materiais
  const handleLimparTodosMateriais = async () => {
    await deletarTodos(base44.entities.Material, { empresa_id: empresaAtiva.id }, "materiais");
    setSelectedMaterialIds([]);
    loadData();
  };

  const handleDeletarSelecionadosMateriais = async () => {
    await deletarSelecionados(base44.entities.Material, selectedMaterialIds, "materiais");
    setSelectedMaterialIds([]);
    loadData();
  };

  const handleCriarEmpresa = async () => {
    if (!empresaForm.nome) return;
    try {
      const novaEmpresa = await base44.entities.Empresa.create({
        nome: empresaForm.nome,
        ativo: true,
      });

      await base44.entities.UsuarioEmpresa.create({
        usuario_email: user.email,
        empresa_id: novaEmpresa.id,
        perfil: "Admin",
        is_owner: true,
        ativo: true,
      });

      await Promise.all([
        base44.entities.StatusOportunidade.bulkCreate([
          {
            empresa_id: novaEmpresa.id,
            nome: "Novo Lead",
            cor: "#94a3b8",
            ordem: 1,
            tipo: "aberto",
          },
          {
            empresa_id: novaEmpresa.id,
            nome: "Em Negociação",
            cor: "#3b82f6",
            ordem: 2,
            tipo: "aberto",
          },
          { empresa_id: novaEmpresa.id, nome: "Ganho", cor: "#10b981", ordem: 3, tipo: "ganho" },
          {
            empresa_id: novaEmpresa.id,
            nome: "Perdido",
            cor: "#ef4444",
            ordem: 4,
            tipo: "perdido",
          },
        ]),
        base44.entities.OrigemOportunidade.bulkCreate([
          { empresa_id: novaEmpresa.id, nome: "Indicação" },
          { empresa_id: novaEmpresa.id, nome: "Site" },
          { empresa_id: novaEmpresa.id, nome: "Telefone" },
        ]),
        base44.entities.CategoriaFinanceira.bulkCreate([
          { empresa_id: novaEmpresa.id, nome: "Materiais", tipo: "Despesa", ativo: true },
          { empresa_id: novaEmpresa.id, nome: "Mão de Obra", tipo: "Despesa", ativo: true },
          { empresa_id: novaEmpresa.id, nome: "Receita de Projeto", tipo: "Receita", ativo: true },
        ]),
      ]);

      setShowNovaEmpresa(false);
      setEmpresaForm({ nome: "" });
      toast.success("✅ Empresa criada com sucesso!");
      window.location.reload();
    } catch (error) {
      console.error("Erro:", error);
      toast.error("❌ Erro ao criar empresa");
    }
  };

  const handleSavePrecoUS = async () => {
    if (!selectedMaoObraUS) return;

    const valorUS = parseFloat(precoUSForm.valor_us_global) || 0;

    // Se for atualização em massa (múltiplos selecionados)
    if (selectedMaoObraUS.ids && selectedMaoObraUS.ids.length > 0) {
      setShowPrecoUSModal(false);
      await new Promise((resolve) => setTimeout(resolve, 100));

      try {
        const todosItens = await base44.entities.MaoDeObra.filter(
          {
            empresa_id: empresaAtiva.id,
          },
          null,
          null
        );

        // Pegar apenas os itens selecionados
        const itensParaAtualizar = todosItens.filter((item) =>
          selectedMaoObraUS.ids.includes(item.id)
        );

        const totalValidos = itensParaAtualizar.length;

        if (totalValidos === 0) {
          toast.error("❌ Nenhum serviço encontrado", { duration: 4000 });
          return;
        }

        setUpdateUSProgress({ show: true, current: 0, total: totalValidos });

        let processados = 0;
        const BATCH_SIZE = 200;

        for (let i = 0; i < itensParaAtualizar.length; i += BATCH_SIZE) {
          const batch = itensParaAtualizar.slice(i, i + BATCH_SIZE);

          await Promise.allSettled(
            batch.map((item) => {
              const raior = parseFloat(item.raior_us) || 1;
              const precoRef = valorUS * raior;

              return base44.entities.MaoDeObra.update(item.id, {
                valor_us_global: valorUS,
                preco_referencia: precoRef,
              });
            })
          );

          processados += batch.length;
          setUpdateUSProgress({ show: true, current: processados, total: totalValidos });

          if (i + BATCH_SIZE < itensParaAtualizar.length) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        await loadData();
        await new Promise((resolve) => setTimeout(resolve, 500));

        setUpdateUSProgress({ show: false, current: 0, total: 0 });
        setSelectedMaoObraUS(null);
        setPrecoUSForm({ valor_us_global: "" });
        setSelectedMaoDeObraIds([]);

        toast.success(`✅ ${processados} serviço(s) atualizado(s)`, { duration: 4000 });
      } catch (error) {
        setUpdateUSProgress({ show: false, current: 0, total: 0 });
        toast.error("❌ Erro: " + error.message, { duration: 4000 });
      }
    } else if (selectedMaoObraUS.id) {
      // Atualização individual
      try {
        const raior = parseFloat(selectedMaoObraUS?.raior_us) || 1;
        const precoRef = valorUS * raior;

        await base44.entities.MaoDeObra.update(selectedMaoObraUS.id, {
          valor_us_global: valorUS,
          preco_referencia: precoRef,
        });

        setShowPrecoUSModal(false);
        setSelectedMaoObraUS(null);
        setPrecoUSForm({ valor_us_global: "" });
        toast.success("✅ Preço atualizado com sucesso", { duration: 4000 });
        await loadData();
      } catch (error) {
        console.error("Erro:", error);
        toast.error("❌ Erro ao atualizar preço: " + error.message, { duration: 4000 });
      }
    }
  };

  // Exportação e Importação de Mão de Obra
  const handleExportarMaoObraExcel = () => {
    const dados = maoDeObra.map((m) => [
      m.nome || "",
      m.descricao || "",
      m.unidade || "",
      m.codigo || "",
      m.categoria || "",
      m.preco_referencia || 0,
      m.raior_us || 1,
      m.observacoes || "",
    ]);

    const headers = [
      "nome",
      "descricao",
      "unidade",
      "codigo",
      "categoria",
      "preco_referencia",
      "raior_us",
      "observacoes",
    ];
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
    link.download = `mao_de_obra_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleExportarMaoObraPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF("landscape");

    doc.setFontSize(16);
    doc.text("Lista de Mão de Obra", 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 22);

    let y = 30;
    doc.setFontSize(8);

    // Cabeçalhos
    doc.text("Nome", 14, y);
    doc.text("Categoria", 80, y);
    doc.text("Código", 130, y);
    doc.text("Unid.", 160, y);
    doc.text("Preço Ref.", 180, y);
    doc.text("Fator US", 220, y);

    y += 5;
    doc.line(14, y, 280, y);
    y += 5;

    maoDeObra.forEach((m) => {
      if (y > 190) {
        doc.addPage();
        y = 20;
      }

      doc.text((m.nome || "").substring(0, 30), 14, y);
      doc.text((m.categoria || "-").substring(0, 20), 80, y);
      doc.text(m.codigo || "-", 130, y);
      doc.text(m.unidade || "-", 160, y);
      doc.text(`R$ ${(m.preco_referencia || 0).toFixed(2)}`, 180, y);
      doc.text((m.raior_us || 1).toString(), 220, y);

      y += 6;
    });

    doc.save(`mao_de_obra_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const handleBaixarModeloMaoObra = () => {
    const modelo = [
      [
        "nome",
        "descricao",
        "unidade",
        "codigo",
        "categoria",
        "preco_referencia",
        "raior_us",
        "observacoes",
      ],
      [
        "Alvenaria de Tijolos",
        "Execução de alvenaria com tijolos cerâmicos",
        "M2",
        "SERV001",
        "Alvenaria",
        "150",
        "1.5",
        "",
      ],
    ];

    const csv = modelo.map((row) => row.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "modelo_importacao_mao_de_obra.csv";
    link.click();
  };

  const handleImportarMaoObra = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportProgress({ show: true, current: 0, total: 0 });

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target.result;

        // Remover BOM UTF-8 se presente
        if (text.charCodeAt(0) === 0xfeff) {
          text = text.slice(1);
        }

        // Detectar separador pela primeira linha
        const firstLineMO = text.split(/\r?\n/)[0] || "";
        const totalTabMO = (firstLineMO.match(/\t/g) || []).length;
        const totalSemiMO = (firstLineMO.match(/;/g) || []).length;
        const totalCommaMO = (firstLineMO.match(/,/g) || []).length;
        const sepMO =
          totalTabMO > 0 && totalTabMO >= totalSemiMO && totalTabMO >= totalCommaMO
            ? "\t"
            : totalSemiMO > 0
              ? ";"
              : ",";

        // Parser que lida com campos entre aspas contendo quebras de linha
        const parseCSVFullMO = (rawText, separator) => {
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

        const allRowsMO = parseCSVFullMO(text, sepMO);
        if (allRowsMO.length <= 1) {
          toast.error("❌ Arquivo vazio ou sem dados válidos", { duration: 4000 });
          setImportProgress({ show: false, current: 0, total: 0 });
          return;
        }
        const dataRowsMO = allRowsMO.slice(1).filter((r) => r.some((v) => v.trim()));

        const maoObraImportada = [];
        let linhasIgnoradas = 0;
        let duplicados = 0;

        for (let i = 0; i < dataRowsMO.length; i++) {
          try {
            const values = dataRowsMO[i];
            const nome = values[0]?.trim();
            if (!nome || nome === "") {
              linhasIgnoradas++;
              continue;
            }

            // Colunas: 0: nome | 1: descricao | 2: unidade | 3: codigo | 4: categoria | 5: preco_referencia | 6: raior_us | 7: observacoes
            const precoRef = parseFloat(values[5]?.replace(",", ".")) || 0;
            const raiorUs = parseFloat(values[6]?.replace(",", ".")) || 1;
            const valorUSGlobal = raiorUs !== 0 ? precoRef / raiorUs : 0;

            const maoObra = {
              empresa_id: empresaAtiva.id,
              nome: nome,
              descricao: values[1]?.trim() || "",
              unidade: values[2]?.trim() || "H",
              codigo: values[3]?.trim() || "",
              categoria: values[4]?.trim() || "",
              valor_us_global: valorUSGlobal,
              raior_us: raiorUs,
              preco_referencia: precoRef,
              observacoes: values[7]?.trim() || "",
              ativo: true,
            };

            maoObraImportada.push(maoObra);
          } catch (error) {
            linhasIgnoradas++;
          }
        }

        if (maoObraImportada.length === 0) {
          setImportProgress({ show: false, current: 0, total: 0 });
          const msg =
            duplicados > 0
              ? `Todos os ${duplicados} serviços já existem no banco de dados`
              : "Nenhum serviço válido encontrado no arquivo";
          toast.error(`❌ ${msg}`, { duration: 4000 });
          return;
        }

        setImportProgress({ show: true, current: 0, total: maoObraImportada.length });

        try {
          const BATCH_SIZE = 200;
          let importados = 0;

          for (let i = 0; i < maoObraImportada.length; i += BATCH_SIZE) {
            const batch = maoObraImportada.slice(i, i + BATCH_SIZE);

            const batchLimpo = batch.map((m) => {
              const maoObraLimpa = { ...m };
              Object.keys(maoObraLimpa).forEach((key) => {
                if (
                  maoObraLimpa[key] === "" ||
                  maoObraLimpa[key] === null ||
                  maoObraLimpa[key] === undefined
                ) {
                  if (key === "nome" || key === "unidade" || key === "empresa_id") return;
                  delete maoObraLimpa[key];
                }
              });
              return maoObraLimpa;
            });

            await base44.entities.MaoDeObra.bulkCreate(batchLimpo);
            importados += batch.length;
            setImportProgress({ show: true, current: importados, total: maoObraImportada.length });

            if (i + BATCH_SIZE < maoObraImportada.length) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }

          setImportProgress({ show: false, current: 0, total: 0 });
          let mensagem = `✅ ${importados} serviços importados!`;
          if (duplicados > 0 || linhasIgnoradas > 0) {
            const detalhes = [];
            if (duplicados > 0) detalhes.push(`${duplicados} duplicados`);
            if (linhasIgnoradas > 0) detalhes.push(`${linhasIgnoradas} vazias`);
            mensagem += ` (${detalhes.join(", ")} ignorados)`;
          }
          toast.success(mensagem, { duration: 4000 });
          loadData();
        } catch (dbError) {
          setImportProgress({ show: false, current: 0, total: 0 });
          toast.error(`❌ Erro ao salvar: ${dbError.message}`, { duration: 6000 });
        }
      } catch (error) {
        setImportProgress({ show: false, current: 0, total: 0 });
        toast.error(`❌ Erro ao processar: ${error.message}`, { duration: 6000 });
      }
    };

    reader.onerror = () => {
      setImportProgress({ show: false, current: 0, total: 0 });
      toast.error("❌ Erro ao ler o arquivo", { duration: 4000 });
    };

    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  if (!empresaAtiva) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500">Selecione uma empresa</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-right" richColors />

      {/* Barra de Progresso da Importação */}
      {importProgress.show && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              Importando{" "}
              {activeTab === "materiais"
                ? "Materiais"
                : activeTab === "maodeobra"
                  ? "Mão de Obra"
                  : activeTab === "fornecedores"
                    ? "Fornecedores"
                    : "Clientes"}
              ...
            </h3>
            <div className="space-y-2">
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-slate-600 text-center">
                {importProgress.current} de {importProgress.total} registros
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Progresso da Exclusão */}
      {deleteProgress.show && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Apagando {deleteProgress.type}...</h3>
            <div className="space-y-2">
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 transition-all duration-300"
                  style={{ width: `${(deleteProgress.current / deleteProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-slate-600 text-center">
                {deleteProgress.current} de {deleteProgress.total} registros
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Progresso da Atualização de Preço US */}
      {updateUSProgress.show && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Atualizando Preços...</h3>
            <div className="space-y-2">
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${(updateUSProgress.current / updateUSProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-slate-600 text-center">
                {updateUSProgress.current} de {updateUSProgress.total} serviços
              </p>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configurações</h1>
        <p className="text-slate-500">Gerencie as configurações da empresa</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
          <TabsList className="bg-slate-100 flex w-max min-w-full">
            {perfil === "Admin" && (
              <>
                <TabsTrigger value="notificacoes" className="whitespace-nowrap text-xs sm:text-sm">
                  Notificações
                </TabsTrigger>
                <TabsTrigger value="empresa" className="whitespace-nowrap text-xs sm:text-sm">
                  Empresa
                </TabsTrigger>
                <TabsTrigger value="usuarios" className="whitespace-nowrap text-xs sm:text-sm">
                  Usuários
                </TabsTrigger>
                {(modulosLiberados["Oportunidades"] || modulosLiberados["Projetos"]) && (
                  <TabsTrigger value="clientes" className="whitespace-nowrap text-xs sm:text-sm">
                    Clientes
                  </TabsTrigger>
                )}
                {modulosLiberados["Compras"] && (
                  <TabsTrigger
                    value="fornecedores"
                    className="whitespace-nowrap text-xs sm:text-sm"
                  >
                    Fornecedores
                  </TabsTrigger>
                )}
                {(modulosLiberados["Estoque"] || modulosLiberados["Compras"]) && (
                  <TabsTrigger value="materiais" className="whitespace-nowrap text-xs sm:text-sm">
                    Materiais
                  </TabsTrigger>
                )}
                {(modulosLiberados["Oportunidades"] || modulosLiberados["Projetos"]) && (
                  <TabsTrigger value="maodeobra" className="whitespace-nowrap text-xs sm:text-sm">
                    Mão de Obra
                  </TabsTrigger>
                )}
                {modulosLiberados["Compras"] && (
                  <TabsTrigger value="aprovacoes" className="whitespace-nowrap text-xs sm:text-sm">
                    Aprovações
                  </TabsTrigger>
                )}
                {modulosLiberados["Financeiro"] && (
                  <TabsTrigger value="categorias" className="whitespace-nowrap text-xs sm:text-sm">
                    Categorias
                  </TabsTrigger>
                )}
                {(modulosLiberados["Ferramental e EPI"] ||
                  modulosLiberados["Segurança do Trabalho"]) && (
                  <TabsTrigger value="funcoes" className="whitespace-nowrap text-xs sm:text-sm">
                    Funções
                  </TabsTrigger>
                )}
                {(modulosLiberados["Ferramental e EPI"] ||
                  modulosLiberados["Segurança do Trabalho"]) && (
                  <TabsTrigger value="caminhoes" className="whitespace-nowrap text-xs sm:text-sm">
                    Caminhões
                  </TabsTrigger>
                )}
              </>
            )}
          </TabsList>
        </div>

        {/* Notificações */}
        <TabsContent value="notificacoes">
          <ConfiguracaoNotificacoes />
        </TabsContent>

        {/* Empresa */}
        <TabsContent value="empresa">
          <EmpresaTab
            empresaAtiva={empresaAtiva}
            empresaData={empresaData}
            setEmpresaData={setEmpresaData}
            handleSaveEmpresa={handleSaveEmpresa}
            savingEmpresa={savingEmpresa}
            handleUploadLogo={handleUploadLogo}
            uploadingLogo={uploadingLogo}
            handleBuscarCnpj={handleBuscarCnpj}
            handleBuscarCepEmpresa={handleBuscarCepEmpresa}
            buscandoCepEmpresa={buscandoCepEmpresa}
          />
        </TabsContent>

        {/* Usuários */}
        <TabsContent value="usuarios">
          <UsuariosTab
            usuarios={usuarios}
            user={user}
            enviandoReset={enviandoReset}
            setSelectedUser={setSelectedUser}
            setShowUserModal={setShowUserModal}
            handleDeleteUser={handleDeleteUser}
            handleGerarLinkReset={handleGerarLinkReset}
          />
        </TabsContent>

        {/* Aprovações */}
        <TabsContent value="aprovacoes">
          <AprovacaoConfigTab empresaAtiva={empresaAtiva} />
        </TabsContent>

        {/* Clientes */}
        <TabsContent value="clientes">
          <ClientesTab empresaAtiva={empresaAtiva} clientes={clientes} loadData={loadData} />
        </TabsContent>

        {/* KITs */}
        <TabsContent value="kits">
          <KitsTab empresaAtiva={empresaAtiva} />
        </TabsContent>

        {/* Fornecedores */}
        <TabsContent value="fornecedores">
          <FornecedoresTab
            empresaAtiva={empresaAtiva}
            fornecedores={fornecedores}
            loadData={loadData}
          />
        </TabsContent>

        {/* Materiais */}
        <TabsContent value="materiais">
          <MateriaisTab
            empresaAtiva={empresaAtiva}
            materiais={materiais}
            categoriasMaterial={categoriasMaterial}
            loadData={loadData}
            setShowVisualizarCatalog={setShowVisualizarCatalog}
            setCatalogItemId={setCatalogItemId}
            setCatalogItemTipo={setCatalogItemTipo}
          />
        </TabsContent>

        {/* Mão de Obra */}
        <TabsContent value="maodeobra">
          <MaoDeObraTab
            empresaAtiva={empresaAtiva}
            maoDeObra={maoDeObra}
            categoriasMaoDeObra={categoriasMaoDeObra}
            unidadesMedida={unidadesMedida}
            loadData={loadData}
            handleImportarMaoObra={handleImportarMaoObra}
            handleExportarMaoObraExcel={handleExportarMaoObraExcel}
            handleExportarMaoObraPDF={handleExportarMaoObraPDF}
            handleBaixarModeloMaoObra={handleBaixarModeloMaoObra}
            handleLimparTodosMaoDeObra={handleLimparTodosMaoDeObra}
            handleDeletarSelecionadosMaoDeObra={handleDeletarSelecionadosMaoDeObra}
            setShowVisualizarCatalog={setShowVisualizarCatalog}
            setCatalogItemId={setCatalogItemId}
            setCatalogItemTipo={setCatalogItemTipo}
            setShowPrecoUSModal={setShowPrecoUSModal}
            setSelectedMaoObraUS={setSelectedMaoObraUS}
            setPrecoUSForm={setPrecoUSForm}
          />
        </TabsContent>

        {/* Funções */}
        <TabsContent value="funcoes">
          <FuncoesTab empresaAtiva={empresaAtiva} />
        </TabsContent>

        {/* Caminhões */}
        <TabsContent value="caminhoes">
          <CaminhoesConfigTab empresaAtiva={empresaAtiva} />
        </TabsContent>

        {/* Categorias */}
        <TabsContent value="categorias">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Categorias Financeiras</CardTitle>
              <Button
                onClick={() => {
                  setCategoriaForm({ nome: "", tipo: "Despesa" });
                  setShowCategoriaModal(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" /> Nova Categoria
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-red-600 mb-3">Despesas</h4>
                  <div className="space-y-2">
                    {categorias
                      .filter((c) => c.tipo === "Despesa")
                      .map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-3 bg-red-50 rounded-lg"
                        >
                          <span>{c.nome}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteCategoria(c)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-green-600 mb-3">Receitas</h4>
                  <div className="space-y-2">
                    {categorias
                      .filter((c) => c.tipo === "Receita")
                      .map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
                        >
                          <span>{c.nome}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteCategoria(c)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Usuário */}
      <UsuarioEditModal
        open={showUserModal}
        onOpenChange={setShowUserModal}
        usuario={selectedUser}
        onSave={handleSaveUser}
        empresaAtiva={empresaAtiva}
      />

      {/* Modais de Material/MaoDeObra movidos para componentes externos */}

      {/* Modal Categoria */}
      <Sheet open={showCategoriaModal} onOpenChange={setShowCategoriaModal}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <SheetHeader>
            <SheetTitle>Nova Categoria Financeira</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={categoriaForm.nome}
                onChange={(e) => setCategoriaForm({ ...categoriaForm, nome: e.target.value })}
                placeholder="Ex: Materiais, Mão de Obra..."
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={categoriaForm.tipo}
                onValueChange={(v) => setCategoriaForm({ ...categoriaForm, tipo: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Despesa">Despesa</SelectItem>
                  <SelectItem value="Receita">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowCategoriaModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCategoria} className="bg-amber-500 hover:bg-amber-600">
              Salvar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal Preço US */}
      <Sheet open={showPrecoUSModal} onOpenChange={setShowPrecoUSModal}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <SheetHeader>
            <SheetTitle>Atualizar Preço de US</SheetTitle>
            <p className="text-sm text-slate-500">
              {selectedMaoObraUS?.nome ||
                `${selectedMaoObraUS?.ids?.length || 0} serviço(s) selecionado(s)`}
            </p>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Valor de US</Label>
              <Input
                type="number"
                step="0.01"
                value={precoUSForm.valor_us_global}
                onChange={(e) =>
                  setPrecoUSForm({ ...precoUSForm, valor_us_global: e.target.value })
                }
                placeholder="Ex: 100.00"
                className="mt-1.5"
              />
              <p className="text-xs text-slate-500 mt-1">
                Este valor será multiplicado pelo Fator de US de cada serviço
              </p>
            </div>

            {selectedMaoObraUS?.id && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <Label className="text-amber-800">Preço de Referência (Calculado)</Label>
                <p className="text-2xl font-bold text-amber-700 mt-2">
                  R${" "}
                  {(
                    (parseFloat(precoUSForm.valor_us_global) || 0) *
                    (selectedMaoObraUS?.raior_us || 1)
                  ).toFixed(2)}
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  {precoUSForm.valor_us_global || "0"} × {selectedMaoObraUS?.raior_us || "1"} (Fator
                  de US)
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowPrecoUSModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePrecoUS} className="bg-amber-500 hover:bg-amber-600">
              Atualizar Preço
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal Visualizar Catálogo */}
      <VisualizarCatalogModal
        open={showVisualizarCatalog}
        onOpenChange={setShowVisualizarCatalog}
        itemId={catalogItemId}
        tipo={catalogItemTipo}
      />

      {/* Modal Link Reset Senha */}
      {linkResetModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-1">
                Link de Redefinição de Senha
              </h3>
              <p className="text-sm text-slate-500 mb-5">
                Copie o link abaixo ou envie direto pelo WhatsApp para{" "}
                <strong>{linkResetModal.nome}</strong>.
              </p>

              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 mb-4">
                <p className="text-xs text-slate-400 mb-1">Link (válido por 24h)</p>
                <p className="text-xs text-slate-700 break-all font-mono">{linkResetModal.link}</p>
              </div>

              <div className="flex flex-col gap-3">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Olá ${linkResetModal.nome}! Acesse o link abaixo para criar sua nova senha no SIGO OBRAS (válido por 24h):\n\n${linkResetModal.link}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Enviar pelo WhatsApp
                </a>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(linkResetModal.link);
                    toast.success("✅ Link copiado!");
                  }}
                  className="flex items-center justify-center gap-2 border border-slate-300 text-slate-700 font-medium py-2.5 px-4 rounded-lg hover:bg-slate-50 transition-colors text-sm"
                >
                  Copiar Link
                </button>

                <button
                  onClick={() => setLinkResetModal(null)}
                  className="text-sm text-slate-400 hover:text-slate-600 text-center"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Empresa */}
      <Sheet open={showNovaEmpresa} onOpenChange={setShowNovaEmpresa}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Criar Nova Empresa</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome da Empresa *</Label>
              <Input
                value={empresaForm.nome}
                onChange={(e) => setEmpresaForm({ ...empresaForm, nome: e.target.value })}
                placeholder="Digite o nome da empresa"
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowNovaEmpresa(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCriarEmpresa} className="bg-amber-500 hover:bg-amber-600">
              Criar Empresa
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
