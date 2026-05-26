import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Building2, Search, Link2, Unlink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function GruposEmpresariaisTab({ empresas: empresasProps = [] }) {
  const [grupos, setGrupos] = useState([]);
  const [empresas, setEmpresas] = useState(empresasProps);
  const [usuarios, setUsuarios] = useState([]);
  const [usuariosGrupo, setUsuariosGrupo] = useState([]);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showVincularModal, setShowVincularModal] = useState(false);
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [empresaSelecionada, setEmpresaSelecionada] = useState("");
  const [form, setForm] = useState({
    nome: "",
    cnpj_principal: "",
    razao_social: "",
    nome_fantasia: "",
    email: "",
    telefone: "",
    observacoes: "",
  });

  useEffect(() => {
    setEmpresas(empresasProps);
  }, [empresasProps]);

  useEffect(() => {
    loadGrupos();
    loadUsuarios();
  }, []);

  const loadUsuarios = async () => {
    try {
      const usuariosList = await sigo.entities.UsuarioEmpresa.list();
      setUsuarios(usuariosList);
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
    }
  };

  const loadGrupos = async () => {
    setLoading(true);
    try {
      const gruposList = await sigo.entities.GrupoEmpresarial.list();
      setGrupos(gruposList);
    } catch (error) {
      console.error("Erro ao carregar grupos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (grupo = null) => {
    if (grupo) {
      setForm({
        nome: grupo.nome || "",
        cnpj_principal: grupo.cnpj_principal || "",
        razao_social: grupo.razao_social || "",
        nome_fantasia: grupo.nome_fantasia || "",
        email: grupo.email || "",
        telefone: grupo.telefone || "",
        observacoes: grupo.observacoes || "",
      });
      setSelectedGrupo(grupo);
      // Carregar usuários do grupo
      const usuariosDoGrupo = usuarios.filter((u) => u.grupo_id === grupo.id);
      setUsuariosGrupo(usuariosDoGrupo);
    } else {
      setForm({
        nome: "",
        cnpj_principal: "",
        razao_social: "",
        nome_fantasia: "",
        email: "",
        telefone: "",
        observacoes: "",
      });
      setSelectedGrupo(null);
      setUsuariosGrupo([]);
    }
    setUsuarioSelecionado("");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nome) {
      alert("Nome do grupo é obrigatório");
      return;
    }

    try {
      if (selectedGrupo) {
        await sigo.entities.GrupoEmpresarial.update(selectedGrupo.id, form);
      } else {
        await sigo.entities.GrupoEmpresarial.create({
          ...form,
          ativo: true,
        });
      }
      setShowModal(false);
      loadGrupos();
    } catch (error) {
      console.error("Erro ao salvar grupo:", error);
      alert("Erro ao salvar grupo");
    }
  };

  const handleDelete = async (grupo) => {
    if (!confirm(`Excluir grupo "${grupo.nome}"?`)) return;
    try {
      await sigo.entities.GrupoEmpresarial.delete(grupo.id);
      loadGrupos();
    } catch (error) {
      console.error("Erro ao excluir grupo:", error);
      alert("Erro ao excluir grupo");
    }
  };

  const handleVincularEmpresa = async () => {
    if (!empresaSelecionada || !selectedGrupo) {
      alert("Selecione uma empresa");
      return;
    }
    try {
      await sigo.entities.Empresa.update(empresaSelecionada, { grupo_id: selectedGrupo.id });
      setEmpresas((prev) =>
        prev.map((e) => (e.id === empresaSelecionada ? { ...e, grupo_id: selectedGrupo.id } : e))
      );
      alert("Empresa vinculada ao grupo");
      setEmpresaSelecionada("");
      // Recarregar dados para atualizar a contagem
      loadGrupos();
    } catch (error) {
      console.error("Erro ao vincular:", error);
      alert("Erro ao vincular empresa");
    }
  };

  const handleDesvinculaEmpresa = async (empresaId) => {
    if (!confirm("Desvincar empresa do grupo?")) return;
    try {
      await sigo.entities.Empresa.update(empresaId, { grupo_id: null });
      setEmpresas((prev) => prev.map((e) => (e.id === empresaId ? { ...e, grupo_id: null } : e)));
      alert("Empresa desvinculada");
    } catch (error) {
      console.error("Erro ao desvincular:", error);
      alert("Erro ao desvincular empresa");
    }
  };

  const handleVincularUsuario = async () => {
    if (!usuarioSelecionado || !selectedGrupo) {
      alert("Selecione um usuário");
      return;
    }
    try {
      await sigo.entities.UsuarioEmpresa.update(usuarioSelecionado, { grupo_id: selectedGrupo.id });
      setUsuarios((prev) =>
        prev.map((u) => (u.id === usuarioSelecionado ? { ...u, grupo_id: selectedGrupo.id } : u))
      );
      setUsuariosGrupo((prev) => [...prev, usuarios.find((u) => u.id === usuarioSelecionado)]);
      setUsuarioSelecionado("");
      alert("Usuário vinculado ao grupo");
    } catch (error) {
      console.error("Erro ao vincular usuário:", error);
      alert("Erro ao vincular usuário");
    }
  };

  const handleDesvinculaUsuario = async (usuarioId) => {
    if (!confirm("Desvincular usuário do grupo?")) return;
    try {
      await sigo.entities.UsuarioEmpresa.update(usuarioId, { grupo_id: null });
      setUsuarios((prev) => prev.map((u) => (u.id === usuarioId ? { ...u, grupo_id: null } : u)));
      setUsuariosGrupo((prev) => prev.filter((u) => u.id !== usuarioId));
      alert("Usuário desvinculado");
    } catch (error) {
      console.error("Erro ao desvincular usuário:", error);
      alert("Erro ao desvincular usuário");
    }
  };

  const getEmpresasDoGrupo = (grupoId) => {
    return empresas.filter((e) => e.grupo_id === grupoId).length;
  };

  const filteredGrupos = grupos.filter(
    (g) =>
      g.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.cnpj_principal?.includes(searchTerm)
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Grupos Empresariais</CardTitle>
            <Button onClick={() => handleOpenModal()} className="bg-amber-500 hover:bg-amber-600">
              <Plus className="w-4 h-4 mr-2" /> Novo Grupo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou CNPJ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-slate-500">Carregando...</div>
          ) : filteredGrupos.length === 0 ? (
            <div className="text-center py-8 text-slate-500">Nenhum grupo encontrado</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CNPJ Principal</TableHead>
                  <TableHead>Empresas</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGrupos.map((grupo) => (
                  <TableRow key={grupo.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        {grupo.nome}
                      </div>
                    </TableCell>
                    <TableCell>{grupo.cnpj_principal || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getEmpresasDoGrupo(grupo.id)} empresa(s)</Badge>
                    </TableCell>
                    <TableCell>{grupo.email || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          grupo.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }
                      >
                        {grupo.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <span className="text-slate-600">⋮</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedGrupo(grupo);
                              setShowVincularModal(true);
                            }}
                          >
                            <Link2 className="w-4 h-4 mr-2" /> Vincular Empresa
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenModal(grupo)}>
                            <Edit className="w-4 h-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(grupo)}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal Vincular Empresas */}
      <Sheet open={showVincularModal} onOpenChange={setShowVincularModal}>
        <SheetContent side="right" className="w-full overflow-y-auto" data-fullscreen-modal>
          <SheetHeader>
            <SheetTitle>Vincular Empresa ao Grupo</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="font-semibold mb-2 block">Grupo: {selectedGrupo?.nome}</Label>
            </div>

            <div>
              <Label>Empresas Disponíveis</Label>
              <Select value={empresaSelecionada} onValueChange={setEmpresaSelecionada}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas
                    .filter((e) => !e.grupo_id) // Mostrar apenas empresas não vinculadas
                    .map((empresa) => (
                      <SelectItem key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {selectedGrupo && (
              <div className="mt-6">
                <Label className="font-semibold mb-3 block">
                  Empresas Vinculadas ({getEmpresasDoGrupo(selectedGrupo.id)})
                </Label>
                <div className="space-y-2">
                  {empresas.filter((e) => e.grupo_id === selectedGrupo.id).length > 0 ? (
                    empresas
                      .filter((e) => e.grupo_id === selectedGrupo.id)
                      .map((empresa) => (
                        <div
                          key={empresa.id}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
                        >
                          <div>
                            <p className="font-medium text-slate-800">{empresa.nome}</p>
                            <p className="text-xs text-slate-500">{empresa.cnpj || "-"}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDesvinculaEmpresa(empresa.id)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Unlink className="w-4 h-4" />
                          </Button>
                        </div>
                      ))
                  ) : (
                    <p className="text-center text-slate-500 py-4">Nenhuma empresa vinculada</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowVincularModal(false)}>
              Fechar
            </Button>
            <Button onClick={handleVincularEmpresa} className="bg-amber-500 hover:bg-amber-600">
              <Link2 className="w-4 h-4 mr-2" /> Vincular
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal Editar Grupo */}
      <Sheet open={showModal} onOpenChange={setShowModal}>
        <SheetContent side="right" className="w-full overflow-y-auto" data-fullscreen-modal>
          <SheetHeader>
            <SheetTitle>{selectedGrupo ? "Editar Grupo" : "Novo Grupo Empresarial"}</SheetTitle>
          </SheetHeader>
          <Tabs defaultValue="dados" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="usuarios">Usuários</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-4 py-4">
              <div>
                <Label>Nome do Grupo *</Label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Holding ABC"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>CNPJ Principal</Label>
                <Input
                  value={form.cnpj_principal}
                  onChange={(e) => setForm({ ...form, cnpj_principal: e.target.value })}
                  placeholder="00.000.000/0000-00"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Razão Social</Label>
                <Input
                  value={form.razao_social}
                  onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Nome Fantasia</Label>
                <Input
                  value={form.nome_fantasia}
                  onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Observações</Label>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                  rows="3"
                />
              </div>
            </TabsContent>

            <TabsContent value="usuarios" className="space-y-4 py-4">
              <div>
                <Label>Selecionar Usuário</Label>
                <Select value={usuarioSelecionado} onValueChange={setUsuarioSelecionado}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione um usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {usuarios
                      .filter((u) => !usuariosGrupo.some((ug) => ug.id === u.id))
                      .map((usuario) => (
                        <SelectItem key={usuario.id} value={usuario.id}>
                          {usuario.nome_completo} ({usuario.usuario_email})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleVincularUsuario}
                  className="mt-3 w-full bg-amber-500 hover:bg-amber-600"
                  disabled={!usuarioSelecionado}
                >
                  <Plus className="w-4 h-4 mr-2" /> Adicionar Usuário
                </Button>
              </div>

              <div>
                <Label className="font-semibold mb-3 block">
                  Usuários do Grupo ({usuariosGrupo.length})
                </Label>
                <div className="space-y-2">
                  {usuariosGrupo.length > 0 ? (
                    usuariosGrupo.map((usuario) => (
                      <div
                        key={usuario.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
                      >
                        <div>
                          <p className="font-medium text-slate-800">{usuario.nome_completo}</p>
                          <p className="text-xs text-slate-500">{usuario.usuario_email}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDesvinculaUsuario(usuario.id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Unlink className="w-4 h-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-slate-500 py-4">Nenhum usuário vinculado</p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="bg-amber-500 hover:bg-amber-600">
              {selectedGrupo ? "Salvar" : "Criar Grupo"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
