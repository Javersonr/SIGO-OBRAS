import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, ChevronDown, Shield, User, Save, KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { ESTRUTURA_PERMISSOES } from "@/components/shared/PermissoesGranularesEditor";

export default function UsuarioEditModal({ open, onOpenChange, usuario, onSave, empresaAtiva }) {
  const [form, setForm] = useState({
    nome_completo: "",
    email: "",
    telefone: "",
    perfil: "Gestor",
    permissoes: {},
    projeto_id: "",
    projeto_nome: "",
  });
  const [expandedModulos, setExpandedModulos] = useState({});
  const [expandedAbas, setExpandedAbas] = useState({});
  const [projetos, setProjetos] = useState([]);
  const [novoEmail, setNovoEmail] = useState("");
  const [alterandoEmail, setAlterandoEmail] = useState(false);
  const [novaSenhaAdmin, setNovaSenhaAdmin] = useState("");
  const [alterandoSenhaAdmin, setAlterandoSenhaAdmin] = useState(false);
  const [openProjetoPopover, setOpenProjetoPopover] = useState(false);
  const [searchProjeto, setSearchProjeto] = useState("");

  const loadProjetos = React.useCallback(async () => {
    if (!empresaAtiva?.id) return;
    try {
      const projs = await base44.entities.Projeto.filter({ empresa_id: empresaAtiva.id });
      setProjetos(projs.sort((a, b) => (a.nome || "").localeCompare(b.nome || "")));
    } catch (error) {
      console.error("Erro ao carregar projetos:", error);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    if (open) {
      loadProjetos();
    }
  }, [open, loadProjetos]);

  useEffect(() => {
    if (open) {
      setNovoEmail("");
      setNovaSenhaAdmin("");
    }
  }, [open]);

  useEffect(() => {
    if (usuario && open) {
      try {
        const perms = usuario.permissoes ? JSON.parse(usuario.permissoes) : {};
        setForm({
          nome_completo: usuario.nome_completo || "",
          email: usuario.usuario_email,
          telefone: usuario.telefone || "",
          perfil: usuario.perfil,
          permissoes: typeof perms === "object" ? perms : {},
          projeto_id: usuario.projeto_id || "",
          projeto_nome: usuario.projeto_nome || "",
        });
      } catch (e) {
        console.error("Erro ao parsear permissões:", e);
        setForm({
          nome_completo: usuario.nome_completo || "",
          email: usuario.usuario_email,
          telefone: usuario.telefone || "",
          perfil: usuario.perfil,
          permissoes: {},
          projeto_id: usuario.projeto_id || "",
          projeto_nome: usuario.projeto_nome || "",
        });
      }
    } else {
      setForm({
        nome_completo: "",
        email: "",
        telefone: "",
        perfil: "Gestor",
        permissoes: {},
        projeto_id: "",
        projeto_nome: "",
      });
    }
    setExpandedModulos({});
    setExpandedAbas({});
  }, [usuario, open]);

  const toggleModulo = (modulo) => {
    setExpandedModulos((prev) => ({ ...prev, [modulo]: !prev[modulo] }));
  };

  const toggleAba = (modulo, aba) => {
    const key = `${modulo}_${aba}`;
    setExpandedAbas((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleModulo = (modulo, enabled) => {
    const newPerms = JSON.parse(JSON.stringify(form.permissoes));

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

    setForm({ ...form, permissoes: newPerms });
  };

  const handleToggleAba = (modulo, aba, enabled) => {
    const newPerms = JSON.parse(JSON.stringify(form.permissoes));

    if (!newPerms[modulo]) {
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

    setForm({ ...form, permissoes: newPerms });
  };

  const handleToggleFuncao = (modulo, aba, funcao, enabled) => {
    const newPerms = JSON.parse(JSON.stringify(form.permissoes));

    if (!newPerms[modulo]) {
      newPerms[modulo] = {};
    }
    if (!newPerms[modulo][aba]) {
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

    setForm({ ...form, permissoes: newPerms });
  };

  const isModuloHabilitado = (modulo) => {
    return form.permissoes[modulo] && Object.keys(form.permissoes[modulo]).length > 0;
  };

  const isAbaHabilitada = (modulo, aba) => {
    return form.permissoes[modulo]?.[aba] && Object.keys(form.permissoes[modulo][aba]).length > 0;
  };

  const isFuncaoHabilitada = (modulo, aba, funcao) => {
    return form.permissoes[modulo]?.[aba]?.[funcao] === true;
  };

  const formatarNomeFuncao = (funcao) => {
    return funcao.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const contarFuncoesHabilitadas = (modulo) => {
    const moduloPerms = form.permissoes[modulo];
    if (!moduloPerms || typeof moduloPerms !== "object") return 0;
    let count = 0;
    Object.values(moduloPerms).forEach((aba) => {
      if (typeof aba === "object") {
        count += Object.keys(aba).length;
      }
    });
    return count;
  };

  const handleSave = () => {
    onSave(form);
  };

  const handleAlterarEmail = async () => {
    if (!novoEmail || !novoEmail.includes("@")) {
      toast.error("❌ Informe um e-mail válido");
      return;
    }
    setAlterandoEmail(true);
    try {
      const res = await base44.functions.invoke("alterarEmailUsuario", {
        vinculo_id: usuario.id,
        email_antigo: usuario.usuario_email,
        email_novo: novoEmail,
      });
      if (res.data.success) {
        toast.success("✅ E-mail alterado com sucesso");
        setNovoEmail("");
        onSave({ ...form, email: novoEmail.toLowerCase().trim(), _emailAlterado: true });
      } else {
        toast.error("❌ " + (res.data.error || "Erro ao alterar e-mail"));
      }
    } catch (e) {
      toast.error("❌ " + e.message);
    } finally {
      setAlterandoEmail(false);
    }
  };

  const handleRedefinirSenhaAdmin = async () => {
    if (!novaSenhaAdmin || novaSenhaAdmin.length < 6) {
      toast.error("❌ A senha deve ter no mínimo 6 caracteres");
      return;
    }
    setAlterandoSenhaAdmin(true);
    try {
      const res = await base44.functions.invoke("redefinirSenhaAdmin", {
        usuario_email: usuario.usuario_email,
        nova_senha: novaSenhaAdmin,
      });
      if (res.data.success) {
        toast.success("✅ Senha redefinida com sucesso");
        setNovaSenhaAdmin("");
      } else {
        toast.error("❌ " + (res.data.error || "Erro ao redefinir senha"));
      }
    } catch (e) {
      toast.error("❌ " + e.message);
    } finally {
      setAlterandoSenhaAdmin(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[600px] h-full overflow-y-auto p-0 flex flex-col"
      >
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0">
          <SheetHeader>
            <SheetTitle>{usuario ? "Editar Usuário" : "Novo Usuário"}</SheetTitle>
            <p className="text-sm text-slate-500">Gerencie dados e permissões do usuário</p>
          </SheetHeader>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <Tabs defaultValue="dados" className="mt-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dados" className="gap-2">
                <User className="w-4 h-4" />
                Dados do Usuário
              </TabsTrigger>
              <TabsTrigger value="permissoes" className="gap-2">
                <Shield className="w-4 h-4" />
                Permissões
              </TabsTrigger>
            </TabsList>

            {/* Aba de Dados */}
            <TabsContent value="dados" className="space-y-4 mt-6">
              <div>
                <Label>Nome Completo *</Label>
                <Input
                  value={form.nome_completo}
                  onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
                  placeholder="Nome completo do usuário"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={!!usuario}
                  placeholder="email@exemplo.com"
                  className="mt-1.5"
                />
                {!usuario && (
                  <p className="text-xs text-slate-500 mt-1">
                    O usuário receberá um convite por e-mail para definir sua senha
                  </p>
                )}
              </div>

              {/* Alterar e-mail — apenas na edição */}
              {usuario && (
                <div className="border rounded-lg p-4 space-y-3 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> Alterar E-mail
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={novoEmail}
                      onChange={(e) => setNovoEmail(e.target.value)}
                      placeholder="Novo e-mail"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={handleAlterarEmail}
                      disabled={alterandoEmail || !novoEmail}
                      className="shrink-0"
                    >
                      {alterandoEmail ? "Salvando..." : "Alterar"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Redefinir senha diretamente — apenas na edição */}
              {usuario && (
                <div className="border rounded-lg p-4 space-y-3 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" /> Redefinir Senha
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={novaSenhaAdmin}
                      onChange={(e) => setNovaSenhaAdmin(e.target.value)}
                      placeholder="Nova senha (mín. 6 caracteres)"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={handleRedefinirSenhaAdmin}
                      disabled={alterandoSenhaAdmin || !novaSenhaAdmin}
                      className="shrink-0"
                    >
                      {alterandoSenhaAdmin ? "Salvando..." : "Redefinir"}
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  placeholder="(00) 00000-0000"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>Perfil</Label>
                <Select value={form.perfil} onValueChange={(v) => setForm({ ...form, perfil: v })}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Gestor">Gestor</SelectItem>
                    <SelectItem value="Compras">Compras</SelectItem>
                    <SelectItem value="Estoque">Estoque</SelectItem>
                    <SelectItem value="Financeiro">Financeiro</SelectItem>
                    <SelectItem value="Cliente">Cliente</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  {form.perfil === "Admin"
                    ? "✅ Admin tem acesso total a todos os módulos"
                    : form.perfil === "Cliente"
                      ? "👤 Cliente terá acesso apenas ao portal do cliente"
                      : "Configure permissões detalhadas na aba Permissões"}
                </p>
              </div>

              {form.perfil === "Cliente" && (
                <div>
                  <Label>Projeto Vinculado *</Label>
                  <Popover open={openProjetoPopover} onOpenChange={setOpenProjetoPopover}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between mt-1.5">
                        {form.projeto_nome || "Selecione um projeto"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Buscar projeto..."
                          value={searchProjeto}
                          onValueChange={setSearchProjeto}
                        />
                        <CommandList>
                          <CommandEmpty>Nenhum projeto encontrado</CommandEmpty>
                          <CommandGroup>
                            {projetos
                              .filter(
                                (p) =>
                                  !searchProjeto ||
                                  p.nome?.toLowerCase().includes(searchProjeto.toLowerCase())
                              )
                              .map((p) => (
                                <CommandItem
                                  key={p.id}
                                  value={p.nome}
                                  onSelect={() => {
                                    setForm({
                                      ...form,
                                      projeto_id: p.id,
                                      projeto_nome: p.nome,
                                    });
                                    setOpenProjetoPopover(false);
                                    setSearchProjeto("");
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{p.nome}</span>
                                    {p.cliente_nome && (
                                      <span className="text-xs text-slate-500">
                                        {p.cliente_nome}
                                      </span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-slate-500 mt-1">
                    Selecione o projeto que este cliente poderá visualizar
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Aba de Permissões */}
            <TabsContent value="permissoes" className="mt-6 max-h-[50vh] overflow-y-auto">
              {form.perfil === "Admin" ? (
                <div className="p-8 text-center bg-green-50 border border-green-200 rounded-lg">
                  <Shield className="w-12 h-12 mx-auto text-green-600 mb-3" />
                  <h3 className="text-lg font-semibold text-green-800 mb-2">Acesso Total</h3>
                  <p className="text-sm text-green-700">
                    Usuários com perfil Admin têm acesso irrestrito a todos os módulos e
                    funcionalidades
                  </p>
                </div>
              ) : form.perfil === "Cliente" ? (
                <div className="p-8 text-center bg-blue-50 border border-blue-200 rounded-lg">
                  <User className="w-12 h-12 mx-auto text-blue-600 mb-3" />
                  <h3 className="text-lg font-semibold text-blue-800 mb-2">Acesso de Cliente</h3>
                  <p className="text-sm text-blue-700">
                    Usuários com perfil Cliente só podem visualizar o portal do cliente com as
                    informações do projeto
                  </p>
                  <div className="mt-4 text-left bg-white rounded-lg p-4">
                    <p className="text-xs font-semibold text-slate-600 mb-2">
                      O que clientes podem ver:
                    </p>
                    <ul className="text-xs text-slate-600 space-y-1 ml-4 list-disc">
                      <li>Dashboard com métricas do projeto</li>
                      <li>Cronograma de obra e etapas</li>
                      <li>Diário de obra</li>
                      <li>Arquivos do projeto</li>
                      <li>Anotações</li>
                    </ul>
                  </div>
                </div>
              ) : (
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
                          <div className="flex items-center justify-between mb-2 gap-3">
                            <Checkbox
                              checked={moduloHabilitado}
                              onCheckedChange={(checked) => handleToggleModulo(modulo, checked)}
                              className="w-5 h-5"
                            />
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
                                    <div className="flex items-center justify-between gap-3">
                                      <Checkbox
                                        checked={abaHabilitada}
                                        onCheckedChange={(checked) =>
                                          handleToggleAba(modulo, aba, checked)
                                        }
                                        className="w-4 h-4"
                                      />
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
                                              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 gap-2"
                                            >
                                              <span className="text-xs text-slate-700 flex-1">
                                                {formatarNomeFuncao(funcao)}
                                              </span>
                                              <Checkbox
                                                checked={funcaoHabilitada}
                                                onCheckedChange={(checked) =>
                                                  handleToggleFuncao(modulo, aba, funcao, checked)
                                                }
                                                className="w-4 h-4"
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
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="bg-amber-500 hover:bg-amber-600">
            <Save className="w-4 h-4 mr-2" />
            Salvar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
