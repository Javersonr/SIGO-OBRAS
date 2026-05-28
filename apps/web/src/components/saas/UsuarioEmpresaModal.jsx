import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import PermissoesGranularesEditor from "@/components/shared/PermissoesGranularesEditor";

export default function UsuarioEmpresaModal({
  open,
  onOpenChange,
  usuario = null,
  onSave,
  empresaId = null,
  empresaNome = "",
  modulosLiberados = [],
}) {
  const [form, setForm] = useState({
    nome_completo: usuario?.nome_completo || "",
    email: usuario?.usuario_email || "",
    telefone: usuario?.telefone || "",
    perfil: usuario?.perfil || "Admin",
    grupo_id: usuario?.grupo_id || "",
    permissoes: safeParseJSON(usuario?.permissoes, {}),
    ativo: usuario?.ativo !== false,
    senha: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (usuario && open) {
      try {
        const perms = safeParseJSON(usuario.permissoes, {});
        setForm({
          nome_completo: usuario.nome_completo || "",
          email: usuario.usuario_email || "",
          telefone: usuario.telefone || "",
          perfil: usuario.perfil || "Admin",
          grupo_id: usuario.grupo_id || "",
          permissoes: typeof perms === "object" ? perms : {},
          ativo: usuario.ativo !== false,
        });
      } catch (e) {
        console.error("Erro ao processar usuário:", e);
        setForm({
          nome_completo: usuario.nome_completo || "",
          email: usuario.usuario_email || "",
          telefone: usuario.telefone || "",
          perfil: usuario.perfil || "Admin",
          grupo_id: usuario.grupo_id || "",
          permissoes: {},
          ativo: usuario.ativo !== false,
        });
      }
    } else {
      setForm({
        nome_completo: "",
        email: "",
        telefone: "",
        perfil: "Admin",
        grupo_id: "",
        permissoes: {},
        ativo: true,
        senha: "",
      });
    }
  }, [usuario, open]);

  const handleSave = async () => {
    if (!form.nome_completo || !form.email) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    if (!usuario && !form.senha) {
      alert("Informe uma senha para o novo usuário");
      return;
    }

    setLoading(true);

    try {
      // Se for novo usuário, criar UsuarioCustom com senha definida pelo admin
      if (!usuario) {
        if (!empresaId) {
          throw new Error("ID da empresa não fornecido");
        }
        const result = await sigo.functions.invoke("criarUsuarioComSenha", {
          usuario_email: form.email,
          nome_completo: form.nome_completo,
          empresa_id: empresaId,
          senha: form.senha,
        });
        console.log("Usuário criado:", result);
      } else if (form.senha) {
        // Admin está redefinindo a senha de um usuário existente
        await sigo.functions.invoke("criarUsuarioComSenha", {
          usuario_email: form.email,
          senha: form.senha,
          apenas_senha: true,
        });
        setForm({ ...form, senha: "" });
        onOpenChange(false);
        return;
      }

      // Validar e serializar permissões
      let permissoesJson = "{}";
      try {
        // Se form.permissoes é um objeto, serializar normalmente
        if (typeof form.permissoes === "object" && form.permissoes !== null) {
          permissoesJson = JSON.stringify(form.permissoes);
        } else if (typeof form.permissoes === "string") {
          // Valida via safeParseJSON antes de aceitar a string original.
          // Fallback `undefined` distingue parse válido (nunca volta undefined) de inválido.
          if (safeParseJSON(form.permissoes, undefined) === undefined) {
            throw new Error("permissoes em formato inválido");
          }
          permissoesJson = form.permissoes;
        }
      } catch (e) {
        console.error("Erro ao serializar permissões:", e);
        permissoesJson = "{}";
      }

      // Salvar dados em UsuarioEmpresa (criar novo ou atualizar existente)
      const data = {
        usuario_email: form.email,
        nome_completo: form.nome_completo,
        telefone: form.telefone || "",
        perfil: form.perfil || "Admin",
        grupo_id: form.grupo_id || null,
        permissoes: permissoesJson,
        ativo: form.ativo,
      };

      await onSave(data);
      onOpenChange(false);
    } catch (error) {
      console.error("Erro detalhado:", error);
      alert("Erro ao criar usuário: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <SheetHeader className="p-6 border-b">
          <SheetTitle>{usuario ? "Editar Usuário" : "Novo Usuário"}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="dados" className="mt-6 px-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dados">Dados do Usuário</TabsTrigger>
              <TabsTrigger value="permissoes">Permissões</TabsTrigger>
            </TabsList>

            {/* Dados do Usuário */}
            <TabsContent value="dados" className="space-y-4 py-4">
              <div>
                <Label>Nome Completo *</Label>
                <Input
                  value={form.nome_completo}
                  onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
                  placeholder="Nome do usuário"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@exemplo.com"
                  className="mt-1.5"
                  disabled={!!usuario}
                />
              </div>

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
                <Label>{usuario ? "Nova Senha (opcional)" : "Senha *"}</Label>
                <Input
                  type="password"
                  value={form.senha || ""}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  placeholder={
                    usuario ? "Deixe em branco para não alterar" : "Defina uma senha para o usuário"
                  }
                  className="mt-1.5"
                />
                {!usuario && (
                  <p className="text-xs text-slate-500 mt-1">
                    O usuário poderá alterar a senha depois em "Meu Perfil"
                  </p>
                )}
              </div>

              <div className="border-t pt-4 mt-6">
                <h4 className="font-semibold text-sm mb-3">Perfil e Acesso</h4>
                <div className="space-y-4">
                  <div>
                    <Label>Perfil do Usuário</Label>
                    <Select
                      value={form.perfil}
                      onValueChange={(v) => setForm({ ...form, perfil: v })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="Admin Holding">Admin Holding</SelectItem>
                        <SelectItem value="Gestor">Gestor</SelectItem>
                        <SelectItem value="Compras">Compras</SelectItem>
                        <SelectItem value="Financeiro">Financeiro</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">
                      {form.perfil === "Admin Holding"
                        ? "📊 Admin Holding: Acesso consolidado a todas as empresas do grupo"
                        : ""}
                    </p>
                  </div>

                  {form.perfil === "Admin Holding" && (
                    <div>
                      <Label>Grupo Empresarial ID</Label>
                      <Input
                        value={form.grupo_id}
                        onChange={(e) => setForm({ ...form, grupo_id: e.target.value })}
                        placeholder="ID do GrupoEmpresarial"
                        className="mt-1.5"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Preencha o ID do grupo para acesso consolidado
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  id="ativo"
                  checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <Label htmlFor="ativo" className="cursor-pointer font-normal">
                  Usuário ativo
                </Label>
              </div>
            </TabsContent>

            {/* Permissões Granulares */}
            <TabsContent value="permissoes" className="space-y-4 py-4">
              <div className="mb-4">
                <p className="text-sm text-slate-600 mb-4">
                  Configure quais módulos, abas e ações este usuário pode acessar
                </p>
                {modulosLiberados.length > 0 ? (
                  <>
                    <p className="text-xs text-slate-500 mb-3">
                      Módulos liberados para esta empresa:{" "}
                      <strong>{modulosLiberados.join(", ")}</strong>
                    </p>
                    <PermissoesGranularesEditor
                      permissoes={form.permissoes}
                      onChange={(novasPermissoes) =>
                        setForm({ ...form, permissoes: novasPermissoes })
                      }
                      modulosPermitidos={modulosLiberados}
                    />
                  </>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    Nenhum módulo liberado para esta empresa. Configure um plano com módulos.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            className="bg-amber-500 hover:bg-amber-600 gap-2"
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {usuario ? "Salvar" : "Criar Usuário"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
