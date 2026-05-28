import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2, Download, X, ShieldCheck, Eye, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import VisualizarAutorizacaoFormalModal from "../seguranca/VisualizarAutorizacaoFormalModal";
import TreinamentoModal from "./TreinamentoModal";
import SelecionarTreinamentoModal from "./SelecionarTreinamentoModal";
import OrdenServicoCEMIGModal from "./OrdenServicoCEMIGModal";
import SalarioInput from "./SalarioInput";
import EPIListaModelo from "./EPIListaModelo";

export default function FuncaoModal({
  open,
  onClose,
  funcao,
  empresaAtiva,
  onSave,
  treinamentosDisponiveis = [],
}) {
  const [activeTab, setActiveTab] = useState("dados");
  const [loading, setLoading] = useState(false);
  const [showVisualizarEpis, setShowVisualizarEpis] = useState(false);
  const [showVisualizarAutorizacao, setShowVisualizarAutorizacao] = useState(false);
  const [showVisualizarOrdemServico, setShowVisualizarOrdemServico] = useState(false);
  const [showSelecionarTreinamento, setShowSelecionarTreinamento] = useState(false);
  const [buscaTreinamento, setBuscaTreinamento] = useState("");
  const [buscaTreinamentoRealizado, setBuscaTreinamentoRealizado] = useState("");

  // Dados da função
  const [formData, setFormData] = useState({
    nome: "",
    descricao: "",
    categoria: "",
    salario: "",
    modelo_epi: "[]",
    modelo_ferramentas: "[]",
    modelo_treinamentos: "[]",
    modelo_autorizacao_formal: "",
    modelo_autorizacao_formal_opcoes: "{}",
    modelo_direito_recusa: "",
    modelo_ordem_servicos: "",
    ativo: true,
  });

  // Treinamentos
  const [treinamentos, setTreinamentos] = useState([]);
  const [showEditarTreinamentoModal, setShowEditarTreinamentoModal] = useState(false);
  const [treinamentoEditando, setTreinamentoEditando] = useState(null);
  const [gerandoCertificado, setGerandoCertificado] = useState(false);
  const [showTreinamentoCEMIG, setShowTreinamentoCEMIG] = useState(false);

  // Modal Seleção de EPIs e Ferramentas
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [searchFerramentaValue, setSearchFerramentaValue] = useState("");
  const [searchEPIValue, setSearchEPIValue] = useState("");
  const [allFerramentas, setAllFerramentas] = useState([]);
  const [allFerramentasFerramenta, setAllFerramentasFerramenta] = useState([]);
  const [episEstoque, setEpisEstoque] = useState([]);
  const [destinoEpis, setDestinoEpis] = useState("");
  const fileInputEPIRef = React.useRef(null);
  const fileInputFerramentasRef = React.useRef(null);

  useEffect(() => {
    if (open && empresaAtiva) {
      loadFerramentas();
    }
  }, [open, empresaAtiva]);

  useEffect(() => {
    if (funcao) {
      setFormData({
        nome: funcao.nome || "",
        descricao: funcao.descricao || "",
        categoria: funcao.categoria || "",
        salario: funcao.salario || "",
        modelo_epi: funcao.modelo_epi || "[]",
        modelo_ferramentas: funcao.modelo_ferramentas || "[]",
        modelo_treinamentos: funcao.modelo_treinamentos || "[]",
        modelo_autorizacao_formal: funcao.modelo_autorizacao_formal || "",
        modelo_autorizacao_formal_opcoes: funcao.modelo_autorizacao_formal_opcoes || "{}",
        modelo_direito_recusa: funcao.modelo_direito_recusa || "",
        modelo_ordem_servicos: funcao.modelo_ordem_servicos || "",
        ativo: funcao.ativo !== false,
      });
      loadTreinamentos(funcao.id);
    } else {
      setFormData({
        nome: "",
        descricao: "",
        categoria: "",
        salario: "",
        modelo_epi: "[]",
        modelo_ferramentas: "[]",
        modelo_treinamentos: "[]",
        modelo_autorizacao_formal: "",
        modelo_autorizacao_formal_opcoes: "{}",
        modelo_direito_recusa: "",
        modelo_ordem_servicos: "",
        ativo: true,
      });
      setTreinamentos([]);
    }
    setActiveTab("dados");
  }, [funcao]);

  const loadFerramentas = async () => {
    try {
      const todasFerramentas = await sigo.entities.Ferramenta.filter(
        {
          empresa_id: empresaAtiva.id,
          ativo: true,
        },
        "",
        2000
      );
      // Separar por tipo (se tiver), mas mostrar tudo nas sugestões
      const epis = todasFerramentas.filter((f) => f.tipo === "EPI");
      const ferramentas = todasFerramentas.filter((f) => f.tipo !== "EPI");
      setAllFerramentas(epis.length > 0 ? epis : todasFerramentas);
      setAllFerramentasFerramenta(ferramentas.length > 0 ? ferramentas : todasFerramentas);
      setEpisEstoque(epis.length > 0 ? epis : todasFerramentas);
    } catch (error) {
      console.error("Erro ao carregar EPIs e Ferramentas:", error);
    }
  };

  const loadTreinamentos = async (funcaoId) => {
    if (!funcaoId || !empresaAtiva) {
      setTreinamentos([]);
      return;
    }
    try {
      const result = await sigo.entities.Treinamento.filter({
        empresa_id: empresaAtiva.id,
        funcao_id: funcaoId,
        ativo: true,
      });
      setTreinamentos(
        result.sort(
          (a, b) =>
            new Date(b.created_date || b.data_inicio) - new Date(a.created_date || a.data_inicio)
        )
      );
    } catch (error) {
      console.error("Erro ao carregar treinamentos:", error);
      setTreinamentos([]);
    }
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) return;
    setLoading(true);
    try {
      const dataToSave = {
        ...formData,
        salario: formData.salario ? parseFloat(formData.salario) : 0,
      };
      await onSave(dataToSave);
      onClose();
    } catch (error) {
      console.error("Erro ao salvar função:", error);
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTreinamento = async (id) => {
    if (!confirm("Deseja excluir este treinamento?")) return;
    try {
      await sigo.entities.Treinamento.delete(id);
      if (funcao?.id) loadTreinamentos(funcao.id);
      toast.success("Treinamento excluído");
    } catch (error) {
      console.error("Erro ao excluir treinamento:", error);
      toast.error("Erro ao excluir treinamento");
    }
  };

  const handleGerarCertificado = async (treinamento) => {
    setGerandoCertificado(true);
    try {
      const response = await sigo.functions.invoke("gerarCertificadoTreinamento", {
        treinamento_id: treinamento.id,
        empresa_id: empresaAtiva.id,
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificado_${treinamento.aluno_nome.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error("Erro ao gerar certificado:", error);
      alert("Erro ao gerar certificado");
    } finally {
      setGerandoCertificado(false);
    }
  };

  const handleLimparTodosEPIs = () => {
    if (!confirm("Deseja limpar todos os EPIs da lista?")) return;
    setFormData({ ...formData, modelo_epi: "[]" });
  };

  const handleLimparTodasFerramentas = () => {
    if (!confirm("Deseja limpar todas as ferramentas da lista?")) return;
    setFormData({ ...formData, modelo_ferramentas: "[]" });
  };

  const handleImportarEPIs = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target.result;
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length <= 1) {
          alert("Arquivo vazio ou sem dados válidos");
          return;
        }

        // Obter EPIs já existentes
        const episExistentes = safeParseJSON(formData.modelo_epi, []);
        const nomesExistentes = episExistentes.map((e) => e.item?.toLowerCase().trim());

        const episImportados = [];
        let duplicados = 0;

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(";").map((v) => v.trim());
          const item = values[0]?.trim();
          if (!item) continue;

          // Verificar se já existe
          if (nomesExistentes.includes(item.toLowerCase())) {
            duplicados++;
            continue;
          }

          episImportados.push({
            item: item,
            ca: values[1]?.trim() || "",
            quantidade: parseInt(values[2]) || 1,
            validade: values[3]?.trim() || "",
          });
          nomesExistentes.push(item.toLowerCase());
        }

        if (episImportados.length > 0) {
          const todosEpis = [...episExistentes, ...episImportados];
          setFormData({ ...formData, modelo_epi: JSON.stringify(todosEpis) });

          let mensagem = `✅ ${episImportados.length} EPIs importados com sucesso!`;
          if (duplicados > 0) {
            mensagem += `\n⚠️ ${duplicados} item(ns) ignorado(s) por duplicação.`;
          }
          alert(mensagem);
        } else if (duplicados > 0) {
          alert(`⚠️ Nenhum EPI importado. ${duplicados} item(ns) já existem na lista.`);
        }
      } catch (error) {
        console.error("Erro:", error);
        alert("Erro ao processar arquivo");
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleImportarFerramentas = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target.result;
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length <= 1) {
          alert("Arquivo vazio ou sem dados válidos");
          return;
        }

        // Obter ferramentas já existentes
        const ferramentasExistentes = safeParseJSON(formData.modelo_ferramentas, []);
        const nomesExistentes = ferramentasExistentes.map((f) =>
          f.ferramenta?.toLowerCase().trim()
        );

        const ferramentasImportadas = [];
        let duplicados = 0;

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(";").map((v) => v.trim());
          const ferramenta = values[0]?.trim();
          if (!ferramenta) continue;

          // Verificar se já existe
          if (nomesExistentes.includes(ferramenta.toLowerCase())) {
            duplicados++;
            continue;
          }

          ferramentasImportadas.push({
            ferramenta: ferramenta,
            quantidade: parseInt(values[1]) || 1,
            numero_serie: values[2]?.trim() || "",
          });
          nomesExistentes.push(ferramenta.toLowerCase());
        }

        if (ferramentasImportadas.length > 0) {
          const todasFerramentas = [...ferramentasExistentes, ...ferramentasImportadas];
          setFormData({ ...formData, modelo_ferramentas: JSON.stringify(todasFerramentas) });

          let mensagem = `✅ ${ferramentasImportadas.length} ferramentas importadas com sucesso!`;
          if (duplicados > 0) {
            mensagem += `\n⚠️ ${duplicados} item(ns) ignorado(s) por duplicação.`;
          }
          alert(mensagem);
        } else if (duplicados > 0) {
          alert(`⚠️ Nenhuma ferramenta importada. ${duplicados} item(ns) já existem na lista.`);
        }
      } catch (error) {
        console.error("Erro:", error);
        alert("Erro ao processar arquivo");
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleBaixarModeloEPIs = () => {
    const modelo = [
      ["Item", "CA", "Quantidade", "Validade"],
      ["CAPACETE DE SEGURANÇA", "CA-1234", "1", ""],
      ["LUVA DE SEGURANÇA", "CA-5678", "2", ""],
    ];

    const csv = modelo.map((row) => row.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "modelo_importacao_epis.csv";
    link.click();
  };

  const handleBaixarModeloFerramentas = () => {
    const modelo = [
      ["Ferramenta", "Quantidade", "Número de Série"],
      ["FURADEIRA DE IMPACTO", "1", "SN123456"],
      ["CHAVE DE FENDA", "2", ""],
    ];

    const csv = modelo.map((row) => row.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "modelo_importacao_ferramentas.csv";
    link.click();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="right" className="w-full overflow-y-auto" data-fullscreen-modal>
          <SheetHeader className="p-6 border-b">
            <SheetTitle>{funcao ? "Editar Função" : "Nova Função"}</SheetTitle>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="bg-slate-100 mx-6 mt-6">
              <TabsTrigger value="dados">Dados da Função</TabsTrigger>
              {funcao && <TabsTrigger value="treinamentos">Treinamentos</TabsTrigger>}
              <TabsTrigger value="documentos">Documentos de Segurança</TabsTrigger>
            </TabsList>

            {/* Aba Dados */}
            <TabsContent value="dados" className="space-y-4 p-6">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Eletricista, Ajudante de Eletricista"
                  className="mt-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Categoria</Label>
                  <Input
                    value={formData.categoria}
                    onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                    placeholder="Ex: Elétrica, Hidráulica, Estrutura"
                    className="mt-1.5"
                  />
                </div>

                <SalarioInput
                  value={formData.salario}
                  onChange={(val) => setFormData({ ...formData, salario: val })}
                />
              </div>

              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descreva as responsabilidades..."
                  className="mt-1.5"
                  rows={3}
                />
              </div>

              <div>
                <Label>Status</Label>
                <Select
                  value={formData.ativo ? "ativo" : "inativo"}
                  onValueChange={(v) => setFormData({ ...formData, ativo: v === "ativo" })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativa</SelectItem>
                    <SelectItem value="inativo">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleSave}
                  disabled={loading || !formData.nome.trim()}
                  className="flex-1"
                >
                  {loading ? "Salvando..." : funcao ? "Atualizar" : "Criar"}
                </Button>
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Cancelar
                </Button>
              </div>
            </TabsContent>

            {/* Aba Treinamentos Unificada */}
            {funcao && (
              <TabsContent value="treinamentos" className="space-y-6 p-6">
                {/* Treinamentos Realizados */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b-2 border-slate-200">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">
                        Treinamentos Realizados
                      </h3>
                      <p className="text-sm text-slate-600">
                        Migre os treinamentos existentes para modelos
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          setShowSelecionarTreinamento(true);
                        }}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Adicionar Treinamento
                      </Button>
                      <Button
                        onClick={() => {
                          setShowTreinamentoCEMIG(true);
                        }}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Treinamento CEMIG
                      </Button>
                      <Button
                        onClick={async () => {
                          try {
                            const modelosAtuais = safeParseJSON(formData.modelo_treinamentos, []);
                            let novosModelos = 0;

                            // Para cada treinamento realizado, verificar se já existe como modelo
                            for (const treinamento of treinamentos) {
                              const jaExiste = modelosAtuais.some(
                                (m) =>
                                  m.nome === treinamento.nome && m.codigo === treinamento.codigo
                              );

                              if (!jaExiste) {
                                modelosAtuais.push({
                                  nome: treinamento.nome,
                                  codigo: treinamento.codigo,
                                  carga_horaria: treinamento.carga_horaria,
                                  conteudo_programatico: treinamento.conteudo_programatico,
                                  validade_meses: 12,
                                  obrigatorio: true,
                                });
                                novosModelos++;
                              }
                            }

                            if (novosModelos > 0) {
                              // Salvar na função
                              await sigo.entities.Funcao.update(funcao.id, {
                                modelo_treinamentos: JSON.stringify(modelosAtuais),
                              });

                              // Atualizar estado local
                              setFormData({
                                ...formData,
                                modelo_treinamentos: JSON.stringify(modelosAtuais),
                              });
                              alert(
                                `✅ ${novosModelos} treinamento(s) migrado(s) para modelos com sucesso!`
                              );
                            } else {
                              alert("ℹ️ Todos os treinamentos já estão nos modelos.");
                            }
                          } catch (error) {
                            console.error("Erro ao migrar:", error);
                            alert("Erro ao migrar treinamentos");
                          }
                        }}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={treinamentos.length === 0}
                      >
                        <Download className="w-4 h-4" />
                        Migrar Todos para Modelos
                      </Button>
                    </div>
                  </div>

                  {/* Campo de Busca */}
                  {treinamentos.length > 0 && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="Buscar por nome, código ou aluno..."
                        value={buscaTreinamentoRealizado}
                        onChange={(e) => setBuscaTreinamentoRealizado(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  )}

                  {/* Lista de treinamentos */}
                  {treinamentos.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <p>Nenhum treinamento cadastrado para esta função</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {treinamentos
                        .filter((t) => {
                          const busca = buscaTreinamentoRealizado.toLowerCase().trim();
                          if (!busca) return true;
                          return (
                            t.nome?.toLowerCase().includes(busca) ||
                            t.codigo?.toLowerCase().includes(busca) ||
                            t.aluno_nome?.toLowerCase().includes(busca)
                          );
                        })
                        .map((treinamento) => (
                          <Card key={treinamento.id} className="hover:shadow-md transition-all">
                            <CardContent className="p-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h5 className="font-semibold text-sm text-slate-800">
                                      {treinamento.nome}
                                    </h5>
                                    {treinamento.codigo && (
                                      <Badge variant="outline" className="text-xs">
                                        {treinamento.codigo}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="space-y-0.5 text-xs text-slate-600">
                                    <p>
                                      <span className="font-medium">Aluno:</span>{" "}
                                      {treinamento.aluno_nome}
                                    </p>
                                    {treinamento.data_inicio && treinamento.data_fim && (
                                      <p>
                                        <span className="font-medium">Período:</span>{" "}
                                        {format(new Date(treinamento.data_inicio), "dd/MM/yyyy")} a{" "}
                                        {format(new Date(treinamento.data_fim), "dd/MM/yyyy")}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-1 ml-2 items-center">
                                  <label
                                    className="flex items-center gap-1 cursor-pointer mr-2"
                                    title="Usar como modelo"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={treinamento.usar_como_modelo === true}
                                      onChange={async (e) => {
                                        try {
                                          const isChecked = e.target.checked;

                                          await sigo.entities.Treinamento.update(treinamento.id, {
                                            usar_como_modelo: isChecked,
                                          });

                                          if (isChecked && funcao?.id) {
                                            const modelosAtuais = safeParseJSON(
                                              formData.modelo_treinamentos,
                                              []
                                            );

                                            const jaExiste = modelosAtuais.some(
                                              (m) =>
                                                m.nome === treinamento.nome &&
                                                m.codigo === treinamento.codigo
                                            );

                                            if (!jaExiste) {
                                              modelosAtuais.push({
                                                nome: treinamento.nome,
                                                codigo: treinamento.codigo,
                                                carga_horaria: treinamento.carga_horaria,
                                                conteudo_programatico:
                                                  treinamento.conteudo_programatico,
                                                validade_meses: 12,
                                                obrigatorio: true,
                                              });

                                              await sigo.entities.Funcao.update(funcao.id, {
                                                modelo_treinamentos: JSON.stringify(modelosAtuais),
                                              });

                                              setFormData({
                                                ...formData,
                                                modelo_treinamentos: JSON.stringify(modelosAtuais),
                                              });
                                            }
                                          }

                                          if (funcao?.id) loadTreinamentos(funcao.id);
                                        } catch (error) {
                                          console.error("Erro ao atualizar:", error);
                                          alert("Erro ao salvar como modelo");
                                        }
                                      }}
                                      className="w-4 h-4"
                                    />
                                    <span className="text-xs text-slate-600">Modelo</span>
                                  </label>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleGerarCertificado(treinamento)}
                                    disabled={gerandoCertificado}
                                    title="Gerar Certificado"
                                  >
                                    <Download className="w-3.5 h-3.5 text-green-500" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setTreinamentoEditando(treinamento);
                                      setShowEditarTreinamentoModal(true);
                                    }}
                                    title="Editar Treinamento"
                                  >
                                    <Edit className="w-3.5 h-3.5 text-blue-500" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleDeleteTreinamento(treinamento.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}

                      {treinamentos.filter((t) => {
                        const busca = buscaTreinamentoRealizado.toLowerCase().trim();
                        if (!busca) return true;
                        return (
                          t.nome?.toLowerCase().includes(busca) ||
                          t.codigo?.toLowerCase().includes(busca) ||
                          t.aluno_nome?.toLowerCase().includes(busca)
                        );
                      }).length === 0 &&
                        buscaTreinamentoRealizado && (
                          <div className="text-center py-8 text-slate-500">
                            <p>Nenhum treinamento encontrado</p>
                            <p className="text-xs mt-1">Tente outro termo de busca</p>
                          </div>
                        )}
                    </div>
                  )}

                  {/* Botão Salvar */}
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSave}
                      disabled={loading || !formData.nome.trim()}
                      className="flex-1"
                    >
                      {loading ? "Salvando..." : "Salvar Modelos"}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            )}

            {/* Aba Documentos de Segurança */}
            <TabsContent value="documentos" className="space-y-4 p-6">
              <EPIListaModelo
                modeloEpi={formData.modelo_epi}
                allFerramentas={allFerramentas}
                onChangeModeloEpi={(val) => setFormData({ ...formData, modelo_epi: val })}
                onBaixarModelo={handleBaixarModeloEPIs}
                onImportar={handleImportarEPIs}
                fileInputRef={fileInputEPIRef}
              />
              {/* Modelo Ferramentas */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-slate-800">Modelo de Lista de Ferramentas</h4>
                    <div className="flex gap-2">
                      <input
                        ref={fileInputFerramentasRef}
                        type="file"
                        className="hidden"
                        accept=".csv,.xlsx"
                        onChange={handleImportarFerramentas}
                      />

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            <FileText className="w-4 h-4 mr-2" />
                            Ações
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={handleBaixarModeloFerramentas}>
                            <Download className="w-4 h-4 mr-2" />
                            Baixar Modelo
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => fileInputFerramentasRef.current?.click()}
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Importar Lista
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={handleLimparTodasFerramentas}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Limpar Todos
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  {safeParseJSON(formData.modelo_ferramentas, []).length === 0 ? (
                    <div className="text-center py-4 text-slate-500 text-sm">
                      Nenhuma ferramenta adicionada. Digite no campo "Ferramenta" abaixo para
                      adicionar.
                    </div>
                  ) : null}
                  <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3 bg-white">
                    <div
                      className="grid gap-2 items-center p-2 bg-slate-100 rounded font-semibold text-xs sticky top-0"
                      style={{ gridTemplateColumns: "2.5fr 0.6fr 1fr 0.4fr" }}
                    >
                      <span>Ferramenta</span>
                      <span>Qtd</span>
                      <span>Nº Série</span>
                      <span>Ação</span>
                    </div>
                    {safeParseJSON(formData.modelo_ferramentas, [])
                      .sort((a, b) => (a.ferramenta || "").localeCompare(b.ferramenta || ""))
                      .map((ferr, idx) => (
                        <div
                          key={idx}
                          className="grid gap-2 items-center p-2 bg-slate-50 rounded hover:bg-slate-100 transition-colors"
                          style={{ gridTemplateColumns: "2.5fr 0.6fr 1fr 0.4fr" }}
                        >
                          <div className="relative z-0">
                            <Input
                              placeholder="Digite para buscar ferramenta..."
                              value={ferr.ferramenta || ""}
                              onChange={(e) => {
                                const itens = safeParseJSON(formData.modelo_ferramentas, []);
                                itens[idx].ferramenta = e.target.value;
                                setFormData({
                                  ...formData,
                                  modelo_ferramentas: JSON.stringify(itens),
                                });

                                // Mostrar sugestões se houver texto
                                if (e.target.value.trim()) {
                                  const filtered = allFerramentasFerramenta.filter(
                                    (f) =>
                                      f.descricao
                                        ?.toLowerCase()
                                        .includes(e.target.value.toLowerCase()) ||
                                      f.codigo?.toLowerCase().includes(e.target.value.toLowerCase())
                                  );
                                  setFilteredSuggestions(filtered);
                                  setShowSuggestions(`ferr-${idx}`);
                                } else {
                                  setShowSuggestions(false);
                                }
                              }}
                              onFocus={() => {
                                if (ferr.ferramenta?.trim()) {
                                  const filtered = allFerramentasFerramenta.filter(
                                    (f) =>
                                      f.descricao
                                        ?.toLowerCase()
                                        .includes(ferr.ferramenta.toLowerCase()) ||
                                      f.codigo
                                        ?.toLowerCase()
                                        .includes(ferr.ferramenta.toLowerCase())
                                  );
                                  setFilteredSuggestions(filtered);
                                  setShowSuggestions(`ferr-${idx}`);
                                }
                              }}
                              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                              className="text-xs h-8"
                            />

                            {showSuggestions === `ferr-${idx}` &&
                              filteredSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 mt-1 border rounded bg-white shadow-lg z-[1000] max-h-48 overflow-y-auto min-w-[300px]">
                                  {filteredSuggestions.map((f) => (
                                    <button
                                      key={f.id}
                                      onClick={() => {
                                        const itens = safeParseJSON(
                                          formData.modelo_ferramentas,
                                          []
                                        );
                                        itens[idx] = {
                                          ferramenta: f.descricao || "",
                                          quantidade: 1,
                                          numero_serie: f.numero_serie || "",
                                        };
                                        setFormData({
                                          ...formData,
                                          modelo_ferramentas: JSON.stringify(itens),
                                        });
                                        setShowSuggestions(false);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b last:border-b-0 flex flex-col gap-1 text-xs"
                                    >
                                      <p className="font-medium text-slate-800">{f.descricao}</p>
                                      <p className="text-slate-500">
                                        Código: {f.codigo || "-"} | Série: {f.numero_serie || "-"}
                                      </p>
                                    </button>
                                  ))}
                                </div>
                              )}
                          </div>
                          <Input
                            placeholder="Qtd"
                            type="number"
                            value={ferr.quantidade || ""}
                            onChange={(e) => {
                              const itens = safeParseJSON(formData.modelo_ferramentas, []);
                              itens[idx].quantidade = e.target.value;
                              setFormData({
                                ...formData,
                                modelo_ferramentas: JSON.stringify(itens),
                              });
                            }}
                            className="text-xs h-8"
                          />

                          <Input
                            placeholder="Nº Série (opcional)"
                            value={ferr.numero_serie || ""}
                            onChange={(e) => {
                              const itens = safeParseJSON(formData.modelo_ferramentas, []);
                              itens[idx].numero_serie = e.target.value;
                              setFormData({
                                ...formData,
                                modelo_ferramentas: JSON.stringify(itens),
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Tab" && !e.shiftKey) {
                                const itens = safeParseJSON(formData.modelo_ferramentas, []);
                                // Se for a última linha E ferramenta está preenchida, criar nova
                                if (idx === itens.length - 1 && ferr.ferramenta?.trim()) {
                                  e.preventDefault();
                                  itens.push({ ferramenta: "", quantidade: 1, numero_serie: "" });
                                  setFormData({
                                    ...formData,
                                    modelo_ferramentas: JSON.stringify(itens),
                                  });
                                  // Focar no primeiro campo da nova linha
                                  setTimeout(() => {
                                    const inputs = document.querySelectorAll(
                                      '[placeholder="Digite para buscar ferramenta..."]'
                                    );
                                    inputs[inputs.length - 1]?.focus();
                                  }, 50);
                                }
                              }
                            }}
                            className="text-xs h-8"
                          />

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 justify-self-center"
                            onClick={() => {
                              const itens = safeParseJSON(formData.modelo_ferramentas, []);
                              itens.splice(idx, 1);
                              setFormData({
                                ...formData,
                                modelo_ferramentas: JSON.stringify(itens),
                              });
                            }}
                          >
                            <X className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    {/* Linha vazia para adicionar nova */}
                    <div
                      className="grid gap-2 items-center p-2 bg-white rounded border-2 border-dashed border-slate-300"
                      style={{ gridTemplateColumns: "2.5fr 0.6fr 1fr 0.4fr" }}
                    >
                      <div className="relative z-0">
                        <Input
                          placeholder="Digite para buscar e adicionar ferramenta..."
                          value={searchFerramentaValue}
                          onChange={(e) => {
                            const value = e.target.value;
                            setSearchFerramentaValue(value);

                            if (value.trim()) {
                              const filtered = allFerramentasFerramenta.filter(
                                (f) =>
                                  f.descricao?.toLowerCase().includes(value.toLowerCase()) ||
                                  f.codigo?.toLowerCase().includes(value.toLowerCase())
                              );
                              setFilteredSuggestions(filtered);
                              setShowSuggestions("ferr-new");
                            } else {
                              setShowSuggestions(false);
                            }
                          }}
                          onFocus={() => {
                            if (searchFerramentaValue.trim()) {
                              const filtered = allFerramentasFerramenta.filter(
                                (f) =>
                                  f.descricao
                                    ?.toLowerCase()
                                    .includes(searchFerramentaValue.toLowerCase()) ||
                                  f.codigo
                                    ?.toLowerCase()
                                    .includes(searchFerramentaValue.toLowerCase())
                              );
                              setFilteredSuggestions(filtered);
                              setShowSuggestions("ferr-new");
                            }
                          }}
                          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                          className="text-xs h-8"
                        />

                        {showSuggestions === "ferr-new" && filteredSuggestions.length > 0 && (
                          <div className="absolute top-full left-0 mt-1 border rounded bg-white shadow-lg z-[1000] max-h-48 overflow-y-auto min-w-[300px]">
                            {filteredSuggestions.map((f) => (
                              <button
                                key={f.id}
                                onClick={() => {
                                  const itens = safeParseJSON(formData.modelo_ferramentas, []);
                                  itens.push({
                                    ferramenta: f.descricao || "",
                                    quantidade: 1,
                                    numero_serie: f.numero_serie || "",
                                  });
                                  setFormData({
                                    ...formData,
                                    modelo_ferramentas: JSON.stringify(itens),
                                  });
                                  setSearchFerramentaValue("");
                                  setShowSuggestions(false);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b last:border-b-0 flex flex-col gap-1 text-xs"
                              >
                                <p className="font-medium text-slate-800">{f.descricao}</p>
                                <p className="text-slate-500">
                                  Código: {f.codigo || "-"} | Série: {f.numero_serie || "-"}
                                </p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-xs h-8 flex items-center text-slate-400">-</div>
                      <div className="text-xs h-8 flex items-center text-slate-400">-</div>
                      <div className="h-8 w-8"></div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Modelos Textuais */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-slate-800">Modelo de Autorização Formal</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowVisualizarAutorizacao(true)}
                      className="gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      Visualizar Modelo
                    </Button>
                  </div>

                  <div className="space-y-2 border rounded-lg p-3 bg-white">
                    {(() => {
                      const opcoes = (() => {
                        try {
                          return safeParseJSON(formData.modelo_autorizacao_formal_opcoes, {});
                        } catch {
                          return {};
                        }
                      })();

                      const handleCheckboxChange = (key, value) => {
                        const novasOpcoes = { ...opcoes, [key]: value };
                        setFormData({
                          ...formData,
                          modelo_autorizacao_formal_opcoes: JSON.stringify(novasOpcoes),
                        });
                      };

                      return (
                        <>
                          {/* NR-10 */}
                          <div className="pb-2 border-b space-y-2">
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={opcoes.nr10 === true}
                                onChange={(e) => handleCheckboxChange("nr10", e.target.checked)}
                                className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
                              />
                              <label className="text-xs font-semibold text-slate-700 cursor-pointer">
                                NR-10 - Sistema Elétrico de Potência
                              </label>
                            </div>

                            <div className="ml-6 space-y-2">
                              <div>
                                <Label className="text-xs text-slate-600">
                                  Código de Autorização
                                </Label>
                                <Input
                                  type="text"
                                  value={opcoes.codigo_autorizacao || ""}
                                  onChange={(e) =>
                                    handleCheckboxChange("codigo_autorizacao", e.target.value)
                                  }
                                  placeholder="Ex: 15-C,I ou 10-D-G-J-P-Q-R"
                                  className="h-7 text-xs mt-1 font-bold text-blue-600 bg-blue-50 border-blue-300"
                                />
                              </div>

                              <div>
                                <Label className="text-xs text-slate-600">
                                  Descrição da Autorização
                                </Label>
                                <Textarea
                                  value={
                                    opcoes.descricao_nr10 ||
                                    "Autorizado a auxiliar na execução de serviços no SEP sem contudo executar atividades que requeiram intervenção diretamente no mesmo. Suas atividades são realizadas somente ao nível do solo e restritas à zona livre, de acordo com os limites estabelecidos no anexo I da NR-10 e critérios corporativos definidos pelo item 4.5.12.2 da ET- VCTE-GM-0832."
                                  }
                                  onChange={(e) =>
                                    handleCheckboxChange("descricao_nr10", e.target.value)
                                  }
                                  placeholder="Descreva as autorizações e limitações..."
                                  className="text-xs mt-1 min-h-20"
                                  rows={3}
                                />
                              </div>
                            </div>
                          </div>

                          {/* NR-33 */}
                          <div className="pb-2 border-b">
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={opcoes.nr33 === true}
                                onChange={(e) => handleCheckboxChange("nr33", e.target.checked)}
                                className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
                              />
                              <label className="text-xs text-slate-700 cursor-pointer flex-1">
                                Atividades em Espaço Confinado atendido ao disposto na NR-33 na
                                função:
                              </label>
                            </div>
                            <div className="ml-6 mt-2 space-y-1">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={opcoes.nr33_supervisor === true}
                                  onChange={(e) =>
                                    handleCheckboxChange("nr33_supervisor", e.target.checked)
                                  }
                                  className="w-3 h-3 cursor-pointer flex-shrink-0"
                                />
                                <label className="text-xs text-slate-700 cursor-pointer">
                                  Supervisor de Entrada
                                </label>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={opcoes.nr33_vigia === true}
                                  onChange={(e) =>
                                    handleCheckboxChange("nr33_vigia", e.target.checked)
                                  }
                                  className="w-3 h-3 cursor-pointer flex-shrink-0"
                                />
                                <label className="text-xs text-slate-700 cursor-pointer">
                                  Vigia/Trabalhador Autorizado
                                </label>
                              </div>
                            </div>
                          </div>

                          {/* NR-35 */}
                          <div className="pb-2 border-b">
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={opcoes.nr35 === true}
                                onChange={(e) => handleCheckboxChange("nr35", e.target.checked)}
                                className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
                              />
                              <label className="text-xs text-slate-700 cursor-pointer flex-1">
                                Atividades em Altura atendido ao disposto na NR-35. Abrangendo
                                Trabalhos em:
                              </label>
                            </div>
                            <div className="ml-6 mt-2 space-y-1">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={opcoes.nr35_rda === true}
                                  onChange={(e) =>
                                    handleCheckboxChange("nr35_rda", e.target.checked)
                                  }
                                  className="w-3 h-3 cursor-pointer flex-shrink-0"
                                />
                                <label className="text-xs text-slate-700 cursor-pointer">
                                  Estruturas de RDA
                                </label>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={opcoes.nr35_telhado === true}
                                  onChange={(e) =>
                                    handleCheckboxChange("nr35_telhado", e.target.checked)
                                  }
                                  className="w-3 h-3 cursor-pointer flex-shrink-0"
                                />
                                <label className="text-xs text-slate-700 cursor-pointer">
                                  Telhado
                                </label>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={opcoes.nr35_plataforma === true}
                                  onChange={(e) =>
                                    handleCheckboxChange("nr35_plataforma", e.target.checked)
                                  }
                                  className="w-3 h-3 cursor-pointer flex-shrink-0"
                                />
                                <label className="text-xs text-slate-700 cursor-pointer">
                                  Plataforma elevatórias ou andaimes
                                </label>
                              </div>
                            </div>
                          </div>

                          {/* Outros */}
                          <div className="pb-2 border-b">
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={opcoes.outros === true}
                                onChange={(e) => handleCheckboxChange("outros", e.target.checked)}
                                className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
                              />
                              <label className="text-xs text-slate-700 cursor-pointer">
                                Outros
                              </label>
                            </div>
                          </div>

                          {/* Fase de Adaptação */}
                          <div>
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={opcoes.fase_adaptacao === true}
                                onChange={(e) =>
                                  handleCheckboxChange("fase_adaptacao", e.target.checked)
                                }
                                className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
                              />
                              <label className="text-xs text-slate-700 cursor-pointer">
                                Empregado em fase de adaptação profissional. Vigência da
                                autorização:
                              </label>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <Textarea
                    value={formData.modelo_autorizacao_formal}
                    onChange={(e) =>
                      setFormData({ ...formData, modelo_autorizacao_formal: e.target.value })
                    }
                    placeholder="Conteúdo do modelo de autorização formal..."
                    rows={5}
                  />
                </CardContent>
              </Card>

              <div>
                <Label>Modelo de Direito de Recusa</Label>
                <Textarea
                  value={formData.modelo_direito_recusa}
                  onChange={(e) =>
                    setFormData({ ...formData, modelo_direito_recusa: e.target.value })
                  }
                  placeholder="Conteúdo do modelo de direito de recusa..."
                  className="mt-1.5"
                  rows={4}
                />
              </div>

              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-slate-800">Modelo de Ordem de Serviços</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowVisualizarOrdemServico(true)}
                      className="gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      Visualizar Modelo
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-semibold">Cargo e Função</Label>
                      <div className="space-y-2 mt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-slate-600">Função</Label>
                            <Input
                              value={(() => {
                                try {
                                  const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                  return data.funcao || "";
                                } catch {
                                  return "";
                                }
                              })()}
                              onChange={(e) => {
                                try {
                                  const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                  data.funcao = e.target.value;
                                  setFormData({
                                    ...formData,
                                    modelo_ordem_servicos: JSON.stringify(data),
                                  });
                                } catch {}
                              }}
                              placeholder="Ex: AJUDANTE DE SERV. ELÉTRICOS"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-600">Setor</Label>
                            <Input
                              value={(() => {
                                try {
                                  const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                  return data.setor || "";
                                } catch {
                                  return "";
                                }
                              })()}
                              onChange={(e) => {
                                try {
                                  const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                  data.setor = e.target.value;
                                  setFormData({
                                    ...formData,
                                    modelo_ordem_servicos: JSON.stringify(data),
                                  });
                                } catch {}
                              }}
                              placeholder="Ex: Operacional"
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs text-slate-600">Locais de Trabalho</Label>
                          <Input
                            value={(() => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                return data.locais_trabalho || "";
                              } catch {
                                return "";
                              }
                            })()}
                            onChange={(e) => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                data.locais_trabalho = e.target.value;
                                setFormData({
                                  ...formData,
                                  modelo_ordem_servicos: JSON.stringify(data),
                                });
                              } catch {}
                            }}
                            placeholder="Ex: Céu Aberto"
                            className="h-8 text-xs"
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-slate-600">Descrição Sumária</Label>
                          <Textarea
                            value={(() => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                return data.descricao_sumaria || "";
                              } catch {
                                return "";
                              }
                            })()}
                            onChange={(e) => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                data.descricao_sumaria = e.target.value;
                                setFormData({
                                  ...formData,
                                  modelo_ordem_servicos: JSON.stringify(data),
                                });
                              } catch {}
                            }}
                            placeholder="Ex: Realiza manutenções e instalações nas redes..."
                            rows={2}
                            className="text-xs"
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-slate-600">Atividades Desenvolvidas</Label>
                          <Textarea
                            value={(() => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                return data.atividades_desenvolvidas || "";
                              } catch {
                                return "";
                              }
                            })()}
                            onChange={(e) => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                data.atividades_desenvolvidas = e.target.value;
                                setFormData({
                                  ...formData,
                                  modelo_ordem_servicos: JSON.stringify(data),
                                });
                              } catch {}
                            }}
                            placeholder="Ex: Realiza trabalhos no solo, preparando e enviando materiais..."
                            rows={3}
                            className="text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">
                        Agentes Ambientais Inerentes ao Local de Trabalho/Atividades
                      </Label>
                      <div className="space-y-2 mt-1">
                        <div>
                          <Label className="text-xs text-slate-600">Físicos</Label>
                          <Textarea
                            value={(() => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                return data.agentes_fisicos || "";
                              } catch {
                                return "";
                              }
                            })()}
                            onChange={(e) => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                data.agentes_fisicos = e.target.value;
                                setFormData({
                                  ...formData,
                                  modelo_ordem_servicos: JSON.stringify(data),
                                });
                              } catch {}
                            }}
                            placeholder="Ex: Radiação não ionizante (radiação solar). Ruído (motor de fundo guindauto e veículos)."
                            rows={2}
                            className="text-xs"
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-slate-600">Químicos</Label>
                          <Textarea
                            value={(() => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                return data.agentes_quimicos || "";
                              } catch {
                                return "";
                              }
                            })()}
                            onChange={(e) => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                data.agentes_quimicos = e.target.value;
                                setFormData({
                                  ...formData,
                                  modelo_ordem_servicos: JSON.stringify(data),
                                });
                              } catch {}
                            }}
                            placeholder="Ex: Poeira mineral. Cimento (manuseio e preparação para fixação de poste)."
                            rows={2}
                            className="text-xs"
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-slate-600">Biológicos</Label>
                          <Input
                            value={(() => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                return data.agentes_biologicos || "";
                              } catch {
                                return "";
                              }
                            })()}
                            onChange={(e) => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                data.agentes_biologicos = e.target.value;
                                setFormData({
                                  ...formData,
                                  modelo_ordem_servicos: JSON.stringify(data),
                                });
                              } catch {}
                            }}
                            placeholder="Ex: Inexistente"
                            className="h-8 text-xs"
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-slate-600">Ergonômicos</Label>
                          <Input
                            value={(() => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                return data.agentes_ergonomicos || "";
                              } catch {
                                return "";
                              }
                            })()}
                            onChange={(e) => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                data.agentes_ergonomicos = e.target.value;
                                setFormData({
                                  ...formData,
                                  modelo_ordem_servicos: JSON.stringify(data),
                                });
                              } catch {}
                            }}
                            placeholder="Ex: Postura inadequada. (Esforço físico)"
                            className="h-8 text-xs"
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-slate-600">Acidentes</Label>
                          <Textarea
                            value={(() => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                return data.agentes_acidentes || "";
                              } catch {
                                return "";
                              }
                            })()}
                            onChange={(e) => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                data.agentes_acidentes = e.target.value;
                                setFormData({
                                  ...formData,
                                  modelo_ordem_servicos: JSON.stringify(data),
                                });
                              } catch {}
                            }}
                            placeholder="Ex: Acidentes de trânsito, picadas de animais peçonhentos, ataques de abelhas..."
                            rows={2}
                            className="text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Tecnologias de Proteção</Label>
                      <div className="space-y-2 mt-1">
                        <div>
                          <Label className="text-xs text-slate-600">EPC</Label>
                          <Textarea
                            value={(() => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                return data.tecnologias_epc || "";
                              } catch {
                                return "";
                              }
                            })()}
                            onChange={(e) => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                data.tecnologias_epc = e.target.value;
                                setFormData({
                                  ...formData,
                                  modelo_ordem_servicos: JSON.stringify(data),
                                });
                              } catch {}
                            }}
                            placeholder="Ex: Cones de sinalização, corda para isolamento de área, tendas..."
                            rows={2}
                            className="text-xs"
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-slate-600">EPI</Label>
                          <Textarea
                            value={(() => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                return data.tecnologias_epi || "";
                              } catch {
                                return "";
                              }
                            })()}
                            onChange={(e) => {
                              try {
                                const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                                data.tecnologias_epi = e.target.value;
                                setFormData({
                                  ...formData,
                                  modelo_ordem_servicos: JSON.stringify(data),
                                });
                              } catch {}
                            }}
                            placeholder="Ex: óculos escuro/incolor; luvas de vaqueta; calçado de segurança..."
                            rows={2}
                            className="text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">
                        Instruções de Segurança e Saúde Ocupacional
                      </Label>
                      <Textarea
                        value={(() => {
                          try {
                            const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                            return data.instrucoes_seguranca || "";
                          } catch {
                            return "";
                          }
                        })()}
                        onChange={(e) => {
                          try {
                            const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                            data.instrucoes_seguranca = e.target.value;
                            setFormData({
                              ...formData,
                              modelo_ordem_servicos: JSON.stringify(data),
                            });
                          } catch {}
                        }}
                        placeholder="Ex: Lista de instruções de segurança..."
                        rows={5}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Observações</Label>
                      <Textarea
                        value={(() => {
                          try {
                            const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                            return data.observacoes || "";
                          } catch {
                            return "";
                          }
                        })()}
                        onChange={(e) => {
                          try {
                            const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                            data.observacoes = e.target.value;
                            setFormData({
                              ...formData,
                              modelo_ordem_servicos: JSON.stringify(data),
                            });
                          } catch {}
                        }}
                        placeholder="Ex: Observações gerais..."
                        rows={3}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Punições</Label>
                      <Textarea
                        value={(() => {
                          try {
                            const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                            return data.punicoes || "";
                          } catch {
                            return "";
                          }
                        })()}
                        onChange={(e) => {
                          try {
                            const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                            data.punicoes = e.target.value;
                            setFormData({
                              ...formData,
                              modelo_ordem_servicos: JSON.stringify(data),
                            });
                          } catch {}
                        }}
                        placeholder="Ex: Tipos de punições aplicáveis..."
                        rows={3}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Ministério do Trabalho</Label>
                      <Textarea
                        value={(() => {
                          try {
                            const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                            return data.ministerio_trabalho || "";
                          } catch {
                            return "";
                          }
                        })()}
                        onChange={(e) => {
                          try {
                            const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                            data.ministerio_trabalho = e.target.value;
                            setFormData({
                              ...formData,
                              modelo_ordem_servicos: JSON.stringify(data),
                            });
                          } catch {}
                        }}
                        placeholder="Ex: Informações sobre fiscalização..."
                        rows={3}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Medicina do Trabalho</Label>
                      <Textarea
                        value={(() => {
                          try {
                            const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                            return data.medicina_trabalho || "";
                          } catch {
                            return "";
                          }
                        })()}
                        onChange={(e) => {
                          try {
                            const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                            data.medicina_trabalho = e.target.value;
                            setFormData({
                              ...formData,
                              modelo_ordem_servicos: JSON.stringify(data),
                            });
                          } catch {}
                        }}
                        placeholder="Ex: Informações sobre exames médicos..."
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleSave}
                  disabled={loading || !formData.nome.trim()}
                  className="flex-1"
                >
                  {loading ? "Salvando..." : "Salvar Modelos"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Modal Visualizar Ordem de Serviço */}
          <Sheet open={showVisualizarOrdemServico} onOpenChange={setShowVisualizarOrdemServico}>
            <SheetContent
              side="right"
              className="h-full overflow-y-auto p-0 flex flex-col bg-white"
              style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
            >
              <div className="flex-1 overflow-y-auto">
                <div className="p-8">
                  {/* Header com linha horizontal */}
                  <div className="pb-4 mb-6 border-b-4 border-black">
                    <div className="flex items-start justify-center gap-6 mb-4">
                      {empresaAtiva?.logo_url && (
                        <img
                          src={empresaAtiva.logo_url}
                          alt="Logo"
                          className="h-16 object-contain"
                        />
                      )}
                    </div>
                    <h2 className="text-center text-lg font-bold mb-2">ORDEM DE SERVIÇO</h2>
                    <p className="text-center text-xs"></p>
                  </div>

                  {/* Informações do Funcionário */}
                  <div className="mb-4">
                    <div className="bg-slate-400 text-white p-2 text-xs font-bold mb-0.5">
                      Informações sobre o funcionário
                    </div>
                    <div className="border-2 border-slate-400 bg-slate-100 p-3 text-xs space-y-1">
                      <div>
                        <span className="font-bold">Nome:</span>{" "}
                        _________________________________________________
                      </div>
                      <div>
                        <span className="font-bold">Função:</span>{" "}
                        {funcao?.nome || "_______________________________"}
                      </div>
                      <div>
                        <span className="font-bold">CPF:</span> _________________________
                      </div>
                      <div>
                        <span className="font-bold">DATA:</span> ___/___/______
                      </div>
                    </div>
                  </div>

                  {/* Parágrafo */}
                  <div className="mb-6 text-xs text-justify leading-relaxed">
                    <p>
                      Conforme estabelecido no item 1.7, letra "b", NR-01 da Portaria 3214/MTE, cabe
                      ao empregador elaborar Ordem de Serviço (OS) sobre Segurança e Medicina do
                      Trabalho, dando ciência aos empregados:
                    </p>
                  </div>

                  {/* Cargo e Função */}
                  <div className="mb-6 border-2 border-slate-400">
                    <div className="bg-slate-200 p-2 font-bold text-xs border-b-2 border-slate-400 text-center">
                      Cargo e Função:
                    </div>
                    <div className="p-3 text-xs space-y-2">
                      {(() => {
                        try {
                          const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                          return (
                            <>
                              <div className="grid grid-cols-2 gap-4 border-b border-slate-300 pb-2">
                                <div>
                                  <span className="font-bold">Função:</span> {data.funcao || ""}
                                </div>
                                <div>
                                  <span className="font-bold">Setor:</span> {data.setor || ""}
                                </div>
                              </div>
                              <div className="border-b border-slate-300 pb-2">
                                <span className="font-bold">Locais de Trabalho:</span>{" "}
                                {data.locais_trabalho || ""}
                              </div>
                              <div className="border-b border-slate-300 pb-2">
                                <span className="font-bold">Descrição Sumária:</span>{" "}
                                {data.descricao_sumaria || ""}
                              </div>
                              <div>
                                <span className="font-bold">Atividades Desenvolvidas:</span>{" "}
                                {data.atividades_desenvolvidas || ""}
                              </div>
                            </>
                          );
                        } catch {
                          return "Nenhum conteúdo definido";
                        }
                      })()}
                    </div>
                  </div>

                  {/* Agentes Ambientais */}
                  <div className="mb-6 border-2 border-slate-400">
                    <div className="bg-slate-200 p-2 font-bold text-xs border-b-2 border-slate-400 text-center">
                      Agentes ambientais inerentes ao local de trabalho/atividades:
                    </div>
                    <div className="p-3 text-xs">
                      {(() => {
                        try {
                          const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                          return (
                            <>
                              <div className="grid grid-cols-2 gap-4 mb-2">
                                <div className="border-b border-slate-300 pb-2">
                                  <span className="font-bold">Físicos:</span>{" "}
                                  {data.agentes_fisicos || ""}
                                </div>
                                <div className="border-b border-slate-300 pb-2">
                                  <span className="font-bold">Químicos:</span>{" "}
                                  {data.agentes_quimicos || ""}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4 mb-2">
                                <div className="border-b border-slate-300 pb-2">
                                  <span className="font-bold">Biológicos:</span>{" "}
                                  {data.agentes_biologicos || ""}
                                </div>
                                <div className="border-b border-slate-300 pb-2">
                                  <span className="font-bold">Ergonômicos:</span>{" "}
                                  {data.agentes_ergonomicos || ""}
                                </div>
                              </div>
                              <div className="border-b border-slate-300 pb-2">
                                <span className="font-bold">Acidentes:</span>{" "}
                                {data.agentes_acidentes || ""}
                              </div>
                            </>
                          );
                        } catch {
                          return "Nenhum conteúdo definido";
                        }
                      })()}
                    </div>
                  </div>

                  {/* Tecnologias de Proteção */}
                  <div className="mb-6 border-2 border-slate-400">
                    <div className="bg-slate-200 p-2 font-bold text-xs border-b-2 border-slate-400 text-center">
                      Tecnologias de proteção:
                    </div>
                    <div className="p-3 text-xs space-y-2">
                      {(() => {
                        try {
                          const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                          return (
                            <>
                              <div className="border-b border-slate-300 pb-2">
                                <span className="font-bold">EPC:</span> {data.tecnologias_epc || ""}
                              </div>
                              <div>
                                <span className="font-bold">EPI:</span> {data.tecnologias_epi || ""}
                              </div>
                            </>
                          );
                        } catch {
                          return "Nenhum conteúdo definido";
                        }
                      })()}
                    </div>
                  </div>

                  {/* Instruções de Segurança */}
                  <div className="mb-6 border-2 border-slate-400">
                    <div className="bg-slate-200 p-2 font-bold text-xs border-b-2 border-slate-400 text-center">
                      Instruções de Segurança e Saúde Ocupacional
                    </div>
                    <div className="p-3 text-xs whitespace-pre-wrap leading-relaxed">
                      {(() => {
                        try {
                          const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                          return data.instrucoes_seguranca || "Nenhum conteúdo definido";
                        } catch {
                          return "Nenhum conteúdo definido";
                        }
                      })()}
                    </div>
                  </div>

                  {/* Observações */}
                  <div className="mb-6 border-2 border-slate-400">
                    <div className="bg-slate-200 p-2 font-bold text-xs border-b-2 border-slate-400 text-center">
                      Observações:
                    </div>
                    <div className="p-3 text-xs whitespace-pre-wrap leading-relaxed">
                      {(() => {
                        try {
                          const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                          return data.observacoes || "Nenhum conteúdo definido";
                        } catch {
                          return "Nenhum conteúdo definido";
                        }
                      })()}
                    </div>
                  </div>

                  {/* Punições */}
                  <div className="mb-6 border-2 border-slate-400">
                    <div className="bg-slate-200 p-2 font-bold text-xs border-b-2 border-slate-400 text-center">
                      Punições
                    </div>
                    <div className="p-3 text-xs whitespace-pre-wrap leading-relaxed">
                      {(() => {
                        try {
                          const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                          return data.punicoes || "Nenhum conteúdo definido";
                        } catch {
                          return "Nenhum conteúdo definido";
                        }
                      })()}
                    </div>
                  </div>

                  {/* Ministério do Trabalho */}
                  <div className="mb-6 border-2 border-slate-400">
                    <div className="bg-slate-200 p-2 font-bold text-xs border-b-2 border-slate-400 text-center">
                      Ministério do Trabalho
                    </div>
                    <div className="p-3 text-xs whitespace-pre-wrap leading-relaxed">
                      {(() => {
                        try {
                          const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                          return data.ministerio_trabalho || "Nenhum conteúdo definido";
                        } catch {
                          return "Nenhum conteúdo definido";
                        }
                      })()}
                    </div>
                  </div>

                  {/* Medicina do Trabalho */}
                  <div className="mb-6 border-2 border-slate-400">
                    <div className="bg-slate-200 p-2 font-bold text-xs border-b-2 border-slate-400 text-center">
                      Medicina do trabalho
                    </div>
                    <div className="p-3 text-xs whitespace-pre-wrap leading-relaxed">
                      {(() => {
                        try {
                          const data = safeParseJSON(formData.modelo_ordem_servicos, {});
                          return data.medicina_trabalho || "Nenhum conteúdo definido";
                        } catch {
                          return "Nenhum conteúdo definido";
                        }
                      })()}
                    </div>
                  </div>

                  {/* Bases Legais */}
                  <div className="mb-6 bg-slate-800 text-white p-3 text-center text-xs font-bold border-2 border-slate-400">
                    BASES LEGAIS - SEGURANÇA E SAÚDE OCUPACIONAL
                    <br />
                    PORTARIA 3214 DE 8 DE JUNHO DE 1978 – NR - 1
                  </div>

                  {/* Termo de Responsabilidade */}
                  <div className="mb-6 border-2 border-slate-400">
                    <div className="bg-slate-200 p-2 font-bold text-xs border-b-2 border-slate-400 text-center">
                      Termo de Responsabilidade
                    </div>
                    <div className="p-3 text-xs text-justify leading-relaxed">
                      Declaro que recebi da{" "}
                      {empresaAtiva?.razao_social || empresaAtiva?.nome || "[EMPRESA]"} a Ordem de
                      Serviço contida neste documento, inclusive uma cópia do mesmo pelo qual me
                      comprometo sempre a cumpri-las durante o exercício do trabalho. Estou ciente
                      que estas instruções são essenciais para a proteção da minha integridade
                      física e saúde, inclusive a de meus colegas de trabalho. Afirmo aqui que a
                      empresa fornece os EPI's necessários ao desempenho seguro das minhas
                      atividades. Sou ciente de que pelo não cumprimento das instruções de segurança
                      ou pela recusa ao uso dos EPI's estará sujeito às punições cabíveis.
                    </div>
                  </div>

                  {/* Tabela de Assinatura */}
                  <div className="border-2 border-slate-400 mb-6">
                    <div className="grid grid-cols-4 gap-0">
                      <div className="border-r border-slate-400 p-2 text-xs font-bold text-center bg-slate-100">
                        Data
                      </div>
                      <div className="border-r border-slate-400 p-2 text-xs font-bold text-center bg-slate-100">
                        Nome
                      </div>
                      <div className="border-r border-slate-400 p-2 text-xs font-bold text-center bg-slate-100">
                        CPF
                      </div>
                      <div className="p-2 text-xs font-bold text-center bg-slate-100">
                        Assinatura
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-0 border-t-2 border-slate-400">
                      <div className="border-r border-slate-400 p-4 text-xs">__/__/____</div>
                      <div className="border-r border-slate-400 p-4 text-xs">_________________</div>
                      <div className="border-r border-slate-400 p-4 text-xs">___.___.___-__</div>
                      <div className="p-4 text-xs">_________________</div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="pt-4 border-t-4 border-black text-center text-xs text-slate-600">
                    SESMT – Serviço Especializado em Engenharia de Segurança e Medicina do Trabalho
                  </div>
                </div>
              </div>

              <div className="p-6 border-t sticky bottom-0 bg-white">
                <Button
                  variant="outline"
                  onClick={() => setShowVisualizarOrdemServico(false)}
                  className="w-full"
                >
                  Fechar
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Modal Visualizar Autorização Formal */}
          {showVisualizarAutorizacao && (
            <VisualizarAutorizacaoFormalModal
              open={showVisualizarAutorizacao}
              onOpenChange={setShowVisualizarAutorizacao}
              funcionario={{
                funcao_nome: funcao?.nome,
                funcao_id: funcao?.id,
                nome_completo: "",
                cpf: "",
              }}
              funcao={funcao}
              empresaAtiva={empresaAtiva}
            />
          )}

          {/* Modal Treinamento CEMIG */}
          <OrdenServicoCEMIGModal
            open={showTreinamentoCEMIG}
            onOpenChange={setShowTreinamentoCEMIG}
            formData={formData}
            setFormData={setFormData}
            handleSave={handleSave}
            loading={loading}
            funcao={funcao}
            empresaAtiva={empresaAtiva}
            onTreinamentoCriado={() => {
              if (funcao?.id) loadTreinamentos(funcao.id);
            }}
          />

          {/* Modal Selecionar Treinamento */}
          <SelecionarTreinamentoModal
            open={showSelecionarTreinamento}
            onOpenChange={setShowSelecionarTreinamento}
            treinamentosDisponiveis={treinamentosDisponiveis}
            treinamentosVinculados={treinamentos}
            funcao={funcao}
            empresaAtiva={empresaAtiva}
            onTreinamentoAdicionado={() => {
              if (funcao?.id) loadTreinamentos(funcao.id);
            }}
          />

          {/* Modal Visualizar Lista de EPIs */}
          <Sheet open={showVisualizarEpis} onOpenChange={setShowVisualizarEpis}>
            <SheetContent
              side="right"
              className="h-full overflow-y-auto p-0 flex flex-col bg-white"
              style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
            >
              <div className="flex-1 overflow-y-auto">
                <div className="p-8 space-y-4">
                  {/* Logo e Título */}
                  <div className="flex items-start gap-6 pb-4 border-b-2 border-slate-800">
                    {empresaAtiva?.logo_url && (
                      <img src={empresaAtiva.logo_url} alt="Logo" className="h-20 object-contain" />
                    )}
                    <div className="flex-1 text-center">
                      <h2 className="text-sm font-bold">
                        FICHA DE CONTROLE E ENTREGA DE EQUIPAMENTO DE PROTEÇÃO INDIVIDUAL (EPI) E
                        UNIFORME
                      </h2>
                    </div>
                  </div>

                  {/* Informações do Funcionário */}
                  <div className="grid grid-cols-3 gap-4 text-xs border-b-2 border-slate-800 pb-3">
                    <div>
                      <div className="font-bold">NOME:</div>
                      <div className="border-b border-slate-400 mt-1 h-5"></div>
                    </div>
                    <div>
                      <div className="font-bold">Nº DE REGISTRO:</div>
                      <div className="border-b border-slate-400 mt-1 h-5"></div>
                    </div>
                    <div>
                      <div className="font-bold">DATA DE ADMISSÃO:</div>
                      <div className="border-b border-slate-400 mt-1 h-5"></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-xs border-b-2 border-slate-800 pb-4">
                    <div>
                      <div className="font-bold">FUNÇÃO: {funcao?.nome || ""}</div>
                      <div className="border-b border-slate-400 mt-1 h-5"></div>
                    </div>
                    <div>
                      <div className="font-bold">SEÇÃO: OPERACIONAL</div>
                      <div className="border-b border-slate-400 mt-1 h-5"></div>
                    </div>
                    <div>
                      <div className="font-bold">DATA DE DEMISSÃO:</div>
                      <div className="border-b border-slate-400 mt-1 h-5"></div>
                    </div>
                  </div>

                  {/* Declaração */}
                  <div className="text-xs mb-4 pb-4 border-b-2 border-slate-800">
                    <div className="flex gap-4 mb-3">
                      <span className="font-bold">J. PINHEIRO</span>
                      <span className="flex-1">
                        Assinatura do Funcionário:X_____________________________________________
                      </span>
                    </div>
                    <p className="text-justify leading-relaxed">
                      Recebi da Empresa ELETRO E ENERGIA LTDA, CNPJ Nº 30.694.170/0001-84, para meu
                      uso obrigatório os EPI´s (Equipamentos de proteção Individual) constantes
                      nesta ficha, o qual obrigou-me a utilizá-los corretamente durante o tempo que
                      permanecerem ao meu dispor, observando as medidas gerais de disciplina e uso
                      que integram a NR-06 – Equipamento de Proteção Individual – EPI´s – da
                      portaria nº 3.214 de 06/jun/1970. Declaro saber também que terei que
                      devolvê-los no ato de meu desligamento da empresa.
                    </p>
                  </div>

                  {/* Tabela de EPIs */}
                  <div className="border-2 border-slate-800">
                    <div
                      className="grid gap-0 border-b-2 border-slate-800"
                      style={{ gridTemplateColumns: "1fr 1fr 0.6fr 2fr 0.8fr 1.5fr 1fr" }}
                    >
                      <div className="p-2 text-xs font-bold border-r border-slate-800">
                        RETIRADA
                      </div>
                      <div className="p-2 text-xs font-bold border-r border-slate-800">
                        DEVOLUÇÃO
                      </div>
                      <div className="p-2 text-xs font-bold border-r border-slate-800 text-center">
                        QUANT.
                      </div>
                      <div className="p-2 text-xs font-bold border-r border-slate-800">
                        DESCRIÇÃO DO EQUIPAMENTO
                      </div>
                      <div className="p-2 text-xs font-bold border-r border-slate-800 text-center">
                        Nº DO C.A.
                      </div>
                      <div className="p-2 text-xs font-bold border-r border-slate-800 text-center">
                        ASSINATURA DO FUNCIONÁRIO
                      </div>
                      <div className="p-2 text-xs font-bold">RESPONSÁVEL PELA ENTREGA</div>
                    </div>

                    {/* Campo Destino */}
                    <div className="p-4 border-b-2 border-slate-800 bg-slate-50">
                      <Label className="text-xs font-bold">
                        Para onde estão indo? (Destino dos EPIs)
                      </Label>
                      <Input
                        value={destinoEpis}
                        onChange={(e) => setDestinoEpis(e.target.value)}
                        placeholder="Ex: Almoxarifado, Projeto X, Canteiro de obras..."
                        className="mt-2 text-xs h-8"
                      />
                    </div>

                    {episEstoque.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-xs">
                        Nenhum EPI no estoque
                      </div>
                    ) : (
                      episEstoque.map((epi, idx) => (
                        <div
                          key={idx}
                          className="grid gap-0 border-b border-slate-300"
                          style={{ gridTemplateColumns: "1fr 1fr 0.6fr 2fr 0.8fr 1.5fr 1fr" }}
                        >
                          <div className="p-2 text-xs border-r border-slate-300">__/__</div>
                          <div className="p-2 text-xs border-r border-slate-300">__/__</div>
                          <div className="p-2 text-xs border-r border-slate-300 text-center">1</div>
                          <div className="p-2 text-xs border-r border-slate-300 uppercase font-semibold">
                            {epi.descricao || ""}
                          </div>
                          <div className="p-2 text-xs border-r border-slate-300 text-center">
                            {epi.ca || "-"}
                          </div>
                          <div className="p-2 text-xs border-r border-slate-300 text-center">X</div>
                          <div className="p-2 text-xs">
                            {destinoEpis ? `→ ${destinoEpis}` : "-"}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-12 text-xs">
                    <div>
                      <div className="pb-6 border-b border-slate-800"></div>
                      <div className="text-center font-semibold mt-2">
                        Assinatura do Funcionário
                      </div>
                    </div>
                    <div>
                      <div className="pb-6 border-b border-slate-800"></div>
                      <div className="text-center font-semibold mt-2">Responsável pela Entrega</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t sticky bottom-0 bg-white">
                <Button
                  variant="outline"
                  onClick={() => setShowVisualizarEpis(false)}
                  className="w-full"
                >
                  Fechar
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </SheetContent>
      </Sheet>

      {/* Modal Editar Treinamento - fora do Sheet pai para evitar conflito de portais */}
      <TreinamentoModal
        open={showEditarTreinamentoModal}
        onClose={() => {
          setShowEditarTreinamentoModal(false);
          setTreinamentoEditando(null);
        }}
        treinamento={treinamentoEditando}
        empresaAtiva={empresaAtiva}
        onSave={() => {
          if (funcao?.id) loadTreinamentos(funcao.id);
          setShowEditarTreinamentoModal(false);
          setTreinamentoEditando(null);
          toast.success("Treinamento atualizado");
        }}
      />
    </>
  );
}
