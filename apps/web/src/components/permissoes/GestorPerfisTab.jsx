import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import PermissoesGranularesEditor from "@/components/shared/PermissoesGranularesEditor";

export default function GestorPerfisTab({ empresaAtiva, user }) {
  const [perfis, setPerfis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPerfil, setEditingPerfil] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    nome: "",
    descricao: "",
    permissoes_json: {},
  });

  useEffect(() => {
    loadPerfis();
  }, [empresaAtiva?.id]);

  const loadPerfis = async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const dados = await base44.entities.PerfilPermissao.filter({
        empresa_id: empresaAtiva.id,
      });
      setPerfis(dados);
    } catch (error) {
      console.error("Erro ao carregar perfis:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (perfil = null) => {
    if (perfil) {
      setEditingPerfil(perfil);
      setFormData({
        nome: perfil.nome,
        descricao: perfil.descricao || "",
        permissoes_json: perfil.permissoes_json ? JSON.parse(perfil.permissoes_json) : {},
      });
    } else {
      setEditingPerfil(null);
      setFormData({
        nome: "",
        descricao: "",
        permissoes_json: {},
      });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.nome) return;

    try {
      const data = {
        empresa_id: empresaAtiva.id,
        nome: formData.nome,
        descricao: formData.descricao,
        permissoes_json: JSON.stringify(formData.permissoes_json),
        tipo: "Customizado",
        modificado_por: user?.email,
      };

      if (editingPerfil) {
        await base44.entities.PerfilPermissao.update(editingPerfil.id, data);
      } else {
        data.criado_por = user?.email;
        await base44.entities.PerfilPermissao.create(data);
      }

      setShowModal(false);
      await loadPerfis();
    } catch (error) {
      console.error("Erro ao salvar perfil:", error);
      alert("Erro ao salvar perfil");
    }
  };

  const handleDelete = async (perfil) => {
    if (!confirm("Excluir este perfil?")) return;
    try {
      await base44.entities.PerfilPermissao.delete(perfil.id);
      await loadPerfis();
    } catch (error) {
      console.error("Erro ao deletar:", error);
    }
  };

  const handleDuplicate = async (perfil) => {
    try {
      await base44.entities.PerfilPermissao.create({
        empresa_id: empresaAtiva.id,
        nome: `${perfil.nome} (cópia)`,
        descricao: perfil.descricao,
        permissoes_json: perfil.permissoes_json,
        tipo: "Customizado",
        criado_por: user?.email,
      });
      await loadPerfis();
    } catch (error) {
      console.error("Erro ao duplicar:", error);
    }
  };

  const filteredPerfis = perfis.filter(
    (p) =>
      p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.descricao?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="text-center py-12">Carregando perfis...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Buscar perfis..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <Button onClick={() => handleOpenModal()} className="gap-2 bg-amber-500 hover:bg-amber-600">
          <Plus className="w-4 h-4" />
          Novo Perfil
        </Button>
      </div>

      <div className="grid gap-4">
        {filteredPerfis.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              Nenhum perfil encontrado
            </CardContent>
          </Card>
        ) : (
          filteredPerfis.map((perfil) => (
            <Card key={perfil.id} className="hover:shadow-md transition-all">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-slate-800">{perfil.nome}</h3>
                    {perfil.descricao && (
                      <p className="text-slate-600 text-sm mt-1">{perfil.descricao}</p>
                    )}
                    <div className="text-xs text-slate-500 mt-3 space-y-1">
                      <p>👤 Criado por: {perfil.criado_por}</p>
                      {perfil.modificado_por && <p>✏️ Modificado por: {perfil.modificado_por}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleDuplicate(perfil)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(perfil)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(perfil)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Sheet open={showModal} onOpenChange={setShowModal}>
        <SheetContent className="overflow-y-auto max-w-2xl">
          <SheetHeader>
            <SheetTitle>{editingPerfil ? "Editar Perfil" : "Novo Perfil"}</SheetTitle>
          </SheetHeader>

          <div className="space-y-6 py-6">
            <div>
              <Label>Nome do Perfil *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: Gerente de Compras"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Descrição das responsabilidades..."
                className="mt-1.5"
                rows={3}
              />
            </div>

            <div>
              <Label className="mb-3 block">Permissões por Módulo</Label>
              <PermissoesGranularesEditor
                permissoes={formData.permissoes_json}
                onPermissoesChange={(novasPermissoes) =>
                  setFormData({ ...formData, permissoes_json: novasPermissoes })
                }
              />
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={!formData.nome}
                className="bg-amber-500 hover:bg-amber-600"
              >
                Salvar Perfil
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
