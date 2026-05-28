import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Edit, Trash2, ChevronRight, ChevronDown, Copy } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ESTRUTURA CANÔNICA — idêntica a UsuarioEditModal e PermissoesGranularesEditor
const ESTRUTURA_PERMISSOES = {
  Oportunidades: {
    abas: {
      Geral: { funcoes: ["visualizar", "criar", "editar", "deletar", "aprovar"] },
      Orçamento: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Obra: { funcoes: ["visualizar", "editar"] },
      Arquivos: { funcoes: ["visualizar", "criar", "deletar"] },
      Anotações: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Chat: { funcoes: ["visualizar", "enviar"] },
    },
  },
  Projetos: {
    abas: {
      Geral: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Orçamento: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Obra: { funcoes: ["visualizar", "editar"] },
      Financeiro: { funcoes: ["visualizar", "editar"] },
      "Diário da Obra": { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Arquivos: { funcoes: ["visualizar", "criar", "deletar"] },
      Anotações: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Chat: { funcoes: ["visualizar", "enviar"] },
    },
  },
  Compras: {
    abas: {
      Solicitações: { funcoes: ["visualizar", "criar", "editar", "deletar", "aprovar"] },
      Cotações: { funcoes: ["visualizar", "criar", "editar"] },
      Pedidos: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Fornecedores: { funcoes: ["visualizar", "criar", "editar"] },
    },
  },
  Estoque: {
    abas: {
      Materiais: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Movimento: { funcoes: ["visualizar", "criar", "editar"] },
      Almoxarifados: { funcoes: ["visualizar", "criar", "editar"] },
      Retiradas: { funcoes: ["visualizar", "criar", "editar"] },
    },
  },
  "Ferramental e EPI": {
    abas: {
      Ferramental: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Inspeção: { funcoes: ["visualizar", "criar", "editar"] },
    },
  },
  "Segurança do Trabalho": {
    abas: {
      Funcionários: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      "Dados Pessoais": { funcoes: ["visualizar", "editar"] },
      Documentação: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      "Dados Bancários": { funcoes: ["visualizar", "editar"] },
      RH: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      TST: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      "Inspeção de Campo": { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      "Inspeção de Ferramental": { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      "Inspeção de Caminhão": { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      "Documentação da Empresa": {
        funcoes: ["visualizar", "criar", "editar", "deletar", "alertas", "exportar"],
      },
    },
  },
  Financeiro: {
    abas: {
      Resumo: { funcoes: ["visualizar"] },
      Receitas: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Despesas: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Recorrentes: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      "Pré-Lançamentos": { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Transferências: { funcoes: ["visualizar", "criar", "editar"] },
      "Contas e Extratos": { funcoes: ["visualizar", "editar"] },
      Relatórios: { funcoes: ["visualizar", "exportar"] },
    },
  },
  Contabilidade: {
    abas: {
      "Plano de Contas": { funcoes: ["visualizar", "criar", "editar"] },
      Lançamentos: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Relatórios: { funcoes: ["visualizar", "exportar"] },
    },
  },
  Relatórios: {
    abas: {
      Oportunidades: { funcoes: ["visualizar", "exportar"] },
      Projetos: { funcoes: ["visualizar", "exportar"] },
      Compras: { funcoes: ["visualizar", "exportar"] },
      Estoque: { funcoes: ["visualizar", "exportar"] },
    },
  },
  Configurações: {
    abas: {
      Empresa: { funcoes: ["visualizar", "editar"] },
      Usuários: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Clientes: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Fornecedores: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Materiais: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      "Mão de Obra": { funcoes: ["visualizar", "criar", "editar", "deletar"] },
      Categorias: { funcoes: ["visualizar", "criar", "editar", "deletar"] },
    },
  },
};

export default function PermissoesTab() {
  const [perfis, setPerfis] = useState([]);
  const [permissoes, setPermissoes] = useState([]);
  const [showPerfilModal, setShowPerfilModal] = useState(false);
  const [selectedPerfil, setSelectedPerfil] = useState(null);
  const [perfilForm, setPerfilForm] = useState({
    nome: "",
    descricao: "",
    tipo: "Global",
    permissoes: {},
    nivel_hierarquico: 5,
  });
  const [expandedModulos, setExpandedModulos] = useState({});
  const [expandedAbas, setExpandedAbas] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [perfisList, permList] = await Promise.all([
      sigo.entities.PerfilPermissao.list(),
      sigo.entities.PermissaoDetalhada.list(),
    ]);
    setPerfis(perfisList);
    setPermissoes(permList);
  };

  const handleOpenPerfilModal = (perfil = null) => {
    if (perfil) {
      const perms = safeParseJSON(perfil.permissoes, {});
      setPerfilForm({
        nome: perfil.nome,
        descricao: perfil.descricao || "",
        tipo: perfil.tipo || "Global",
        permissoes: perms,
        nivel_hierarquico: perfil.nivel_hierarquico || 5,
      });
      setSelectedPerfil(perfil);
    } else {
      setPerfilForm({
        nome: "",
        descricao: "",
        tipo: "Global",
        permissoes: {},
        nivel_hierarquico: 5,
      });
      setSelectedPerfil(null);
    }
    setShowPerfilModal(true);
  };

  const handleSavePerfil = async () => {
    if (!perfilForm.nome) return;

    const data = {
      nome: perfilForm.nome,
      descricao: perfilForm.descricao,
      tipo: perfilForm.tipo,
      empresa_id: perfilForm.tipo === "Customizado" ? null : null,
      permissoes: JSON.stringify(perfilForm.permissoes),
      nivel_hierarquico: perfilForm.nivel_hierarquico,
      ativo: true,
    };

    if (selectedPerfil) {
      await sigo.entities.PerfilPermissao.update(selectedPerfil.id, data);
    } else {
      await sigo.entities.PerfilPermissao.create(data);
    }

    setShowPerfilModal(false);
    loadData();
  };

  const handleCopiarPerfil = async (perfil) => {
    try {
      const perms = safeParseJSON(perfil.permissoes, {});
      await sigo.entities.PerfilPermissao.create({
        nome: `${perfil.nome} (Cópia)`,
        descricao: perfil.descricao,
        tipo: "Customizado",
        permissoes: JSON.stringify(perms),
        nivel_hierarquico: perfil.nivel_hierarquico,
        ativo: true,
      });
      loadData();
    } catch (error) {
      console.error("Erro ao copiar perfil:", error);
    }
  };

  const handleDeletePerfil = async (perfil) => {
    if (!confirm("Excluir este perfil?")) return;
    await sigo.entities.PerfilPermissao.delete(perfil.id);
    loadData();
  };

  const toggleModulo = (modulo) => {
    setExpandedModulos((prev) => ({ ...prev, [modulo]: !prev[modulo] }));
  };

  const toggleAba = (modulo, aba) => {
    const key = `${modulo}_${aba}`;
    setExpandedAbas((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleModulo = (modulo, enabled) => {
    const newPerms = { ...perfilForm.permissoes };

    if (enabled) {
      newPerms[modulo] = {};
      Object.keys(ESTRUTURA_PERMISSOES[modulo].abas).forEach((aba) => {
        newPerms[modulo][aba] = {};
        ESTRUTURA_PERMISSOES[modulo].abas[aba].funcoes.forEach((funcao) => {
          newPerms[modulo][aba][funcao] = true;
        });
      });
    } else {
      delete newPerms[modulo];
    }

    setPerfilForm({ ...perfilForm, permissoes: newPerms });
  };

  const handleToggleAba = (modulo, aba, enabled) => {
    const newPerms = { ...perfilForm.permissoes };

    if (!newPerms[modulo] || typeof newPerms[modulo] !== "object") {
      newPerms[modulo] = {};
    }

    if (enabled) {
      newPerms[modulo][aba] = {};
      ESTRUTURA_PERMISSOES[modulo].abas[aba].funcoes.forEach((funcao) => {
        newPerms[modulo][aba][funcao] = true;
      });
    } else {
      delete newPerms[modulo][aba];
      if (Object.keys(newPerms[modulo]).length === 0) {
        delete newPerms[modulo];
      }
    }

    setPerfilForm({ ...perfilForm, permissoes: newPerms });
  };

  const handleToggleFuncao = (modulo, aba, funcao, enabled) => {
    const newPerms = { ...perfilForm.permissoes };

    if (!newPerms[modulo] || typeof newPerms[modulo] !== "object") {
      newPerms[modulo] = {};
    }
    if (!newPerms[modulo][aba] || typeof newPerms[modulo][aba] !== "object") {
      newPerms[modulo][aba] = {};
    }

    if (enabled) {
      newPerms[modulo][aba][funcao] = true;
    } else {
      delete newPerms[modulo][aba][funcao];

      if (Object.keys(newPerms[modulo][aba]).length === 0) {
        delete newPerms[modulo][aba];
      }

      if (Object.keys(newPerms[modulo]).length === 0) {
        delete newPerms[modulo];
      }
    }

    setPerfilForm({ ...perfilForm, permissoes: newPerms });
  };

  const isModuloHabilitado = (modulo) => {
    return perfilForm.permissoes[modulo] && Object.keys(perfilForm.permissoes[modulo]).length > 0;
  };

  const isAbaHabilitada = (modulo, aba) => {
    return (
      perfilForm.permissoes[modulo]?.[aba] &&
      Object.keys(perfilForm.permissoes[modulo][aba]).length > 0
    );
  };

  const isFuncaoHabilitada = (modulo, aba, funcao) => {
    return perfilForm.permissoes[modulo]?.[aba]?.[funcao] === true;
  };

  const formatarNomeFuncao = (funcao) => {
    return funcao.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const contarFuncoesHabilitadas = (modulo) => {
    const moduloPerms = perfilForm.permissoes[modulo];
    if (!moduloPerms || typeof moduloPerms !== "object") return 0;
    let count = 0;
    Object.values(moduloPerms).forEach((aba) => {
      if (typeof aba === "object") {
        count += Object.keys(aba).length;
      }
    });
    return count;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Perfis de Permissão</CardTitle>
          <Button
            onClick={() => handleOpenPerfilModal()}
            className="bg-amber-500 hover:bg-amber-600"
          >
            <Plus className="w-4 h-4 mr-2" /> Novo Perfil
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead>Permissões</TableHead>
                <TableHead className="w-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perfis.map((perfil) => {
                const perms = safeParseJSON(perfil.permissoes, {});

                const contarPermissoes = () => {
                  let count = 0;
                  if (typeof perms === "object") {
                    Object.values(perms).forEach((modulo) => {
                      if (typeof modulo === "object") {
                        Object.values(modulo).forEach((aba) => {
                          if (typeof aba === "object") {
                            count += Object.keys(aba).length;
                          }
                        });
                      }
                    });
                  }
                  return count;
                };

                return (
                  <TableRow key={perfil.id}>
                    <TableCell className="font-medium">{perfil.nome}</TableCell>
                    <TableCell>
                      <Badge variant={perfil.tipo === "Global" ? "default" : "secondary"}>
                        {perfil.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell>Nível {perfil.nivel_hierarquico}</TableCell>
                    <TableCell>
                      <Badge className="bg-blue-100 text-blue-700">
                        {contarPermissoes()} funções habilitadas
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenPerfilModal(perfil)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopiarPerfil(perfil)}
                          title="Duplicar perfil"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        {perfil.tipo !== "Global" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeletePerfil(perfil)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal Perfil */}
      <Sheet open={showPerfilModal} onOpenChange={setShowPerfilModal}>
        <SheetContent
          side="right"
          className="!w-full !max-w-none overflow-y-auto p-0 flex flex-col h-screen"
        >
          <div className="sticky top-0 bg-white border-b p-6 z-10">
            <SheetHeader>
              <SheetTitle>
                {selectedPerfil ? "Editar Perfil" : "Novo Perfil de Permissão"}
              </SheetTitle>
            </SheetHeader>
          </div>

          <div className="p-6 flex-1 overflow-y-auto">
            <Tabs defaultValue="dados">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="dados">Dados do Perfil</TabsTrigger>
                <TabsTrigger value="permissoes">Permissões</TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="space-y-4 mt-6">
                <div>
                  <Label>Nome do Perfil *</Label>
                  <Input
                    value={perfilForm.nome}
                    onChange={(e) => setPerfilForm({ ...perfilForm, nome: e.target.value })}
                    placeholder="Ex: Gerente de Compras"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    value={perfilForm.descricao}
                    onChange={(e) => setPerfilForm({ ...perfilForm, descricao: e.target.value })}
                    placeholder="Descrição do perfil..."
                    className="mt-1.5"
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Nível Hierárquico</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={perfilForm.nivel_hierarquico}
                    onChange={(e) =>
                      setPerfilForm({
                        ...perfilForm,
                        nivel_hierarquico: parseInt(e.target.value) || 5,
                      })
                    }
                    className="mt-1.5"
                  />
                  <p className="text-xs text-slate-500 mt-1">1 = mais alto, 10 = mais baixo</p>
                </div>
              </TabsContent>

              <TabsContent value="permissoes" className="mt-6">
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                  {Object.entries(ESTRUTURA_PERMISSOES).map(([modulo, config]) => {
                    const moduloHabilitado = isModuloHabilitado(modulo);
                    const moduloExpanded = expandedModulos[modulo];

                    return (
                      <Card
                        key={modulo}
                        className={cn(
                          "transition-all border-2",
                          moduloHabilitado ? "border-amber-200 bg-amber-50/30" : "border-slate-200"
                        )}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <button
                              onClick={() => toggleModulo(modulo)}
                              className="flex items-center gap-2 flex-1 text-left"
                            >
                              {moduloExpanded ? (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                              )}
                              <h4 className="font-semibold text-slate-900 text-sm">{modulo}</h4>
                              <div className="flex gap-2 ml-2">
                                <Badge variant="outline" className="text-xs">
                                  {Object.keys(config.abas).length} abas
                                </Badge>
                                {moduloHabilitado && (
                                  <Badge className="bg-green-100 text-green-700 text-xs">
                                    {contarFuncoesHabilitadas(modulo)} funções
                                  </Badge>
                                )}
                              </div>
                            </button>
                            <Switch
                              checked={moduloHabilitado}
                              onCheckedChange={(checked) => handleToggleModulo(modulo, checked)}
                            />
                          </div>

                          {moduloExpanded && (
                            <div className="ml-6 space-y-2 mt-2">
                              {Object.entries(config.abas).map(([aba, abaConfig]) => {
                                const abaHabilitada = isAbaHabilitada(modulo, aba);
                                const abaKey = `${modulo}_${aba}`;
                                const abaExpanded = expandedAbas[abaKey];

                                return (
                                  <div
                                    key={aba}
                                    className={cn(
                                      "border rounded-lg p-2",
                                      abaHabilitada
                                        ? "border-green-200 bg-green-50/30"
                                        : "border-slate-200"
                                    )}
                                  >
                                    <div className="flex items-center justify-between">
                                      <button
                                        onClick={() => toggleAba(modulo, aba)}
                                        className="flex items-center gap-2 flex-1 text-left"
                                      >
                                        {abaExpanded ? (
                                          <ChevronDown className="w-3 h-3 text-slate-400" />
                                        ) : (
                                          <ChevronRight className="w-3 h-3 text-slate-400" />
                                        )}
                                        <span className="font-medium text-slate-800 text-xs">
                                          {aba}
                                        </span>
                                        <Badge variant="outline" className="ml-2 text-xs">
                                          {abaConfig.funcoes.length} funções
                                        </Badge>
                                      </button>
                                      <Switch
                                        checked={abaHabilitada}
                                        onCheckedChange={(checked) =>
                                          handleToggleAba(modulo, aba, checked)
                                        }
                                      />
                                    </div>

                                    {abaExpanded && (
                                      <div className="ml-5 space-y-1 mt-2">
                                        {abaConfig.funcoes.map((funcao) => {
                                          const funcaoHabilitada = isFuncaoHabilitada(
                                            modulo,
                                            aba,
                                            funcao
                                          );

                                          return (
                                            <div
                                              key={funcao}
                                              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50"
                                            >
                                              <span className="text-xs text-slate-700">
                                                {formatarNomeFuncao(funcao)}
                                              </span>
                                              <Switch
                                                checked={funcaoHabilitada}
                                                onCheckedChange={(checked) =>
                                                  handleToggleFuncao(modulo, aba, funcao, checked)
                                                }
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="sticky bottom-0 bg-white border-t p-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowPerfilModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePerfil} className="bg-amber-500 hover:bg-amber-600">
              Salvar Perfil
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
