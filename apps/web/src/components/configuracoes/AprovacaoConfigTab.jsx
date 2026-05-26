import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit } from "lucide-react";

export default function AprovacaoConfigTab({ empresaAtiva }) {
  const [niveis, setNiveis] = useState([]);
  const [perfis, setPerfis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingNivel, setEditingNivel] = useState(null);

  const loadData = React.useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const [niveisData, usuariosData] = await Promise.all([
        base44.entities.NivelAprovacao.filter({ empresa_id: empresaAtiva.id }),
        base44.entities.UsuarioEmpresa.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ]);
      setNiveis(niveisData.sort((a, b) => a.ordem - b.ordem));
      const perfisUnicos = [...new Set(usuariosData.map((u) => u.perfil))];
      setPerfis(perfisUnicos);
    } catch (error) {
      console.error("Erro ao carregar dados de aprovação:", error);
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveNivel = async (tipo) => {
    if (!editingNivel || !editingNivel.nome) return;

    const dataToSave = {
      ...editingNivel,
      empresa_id: empresaAtiva.id,
      tipo: tipo,
      ordem: parseInt(editingNivel.ordem) || 0,
      valor_minimo: parseFloat(editingNivel.valor_minimo) || 0,
      valor_maximo: parseFloat(editingNivel.valor_maximo) || null,
      perfis_aprovadores: JSON.stringify(editingNivel.perfis_aprovadores || []),
    };

    if (editingNivel.id) {
      await base44.entities.NivelAprovacao.update(editingNivel.id, dataToSave);
    } else {
      await base44.entities.NivelAprovacao.create(dataToSave);
    }
    setEditingNivel(null);
    loadData();
  };

  const handleDeleteNivel = async (id) => {
    if (confirm("Deseja excluir este nível de aprovação?")) {
      await base44.entities.NivelAprovacao.delete(id);
      loadData();
    }
  };

  const renderNiveis = (tipo) => {
    const niveisFiltrados = niveis.filter((n) => n.tipo === tipo);
    return (
      <Card>
        <CardHeader>
          <CardTitle className="capitalize">
            {tipo
              .replace("SolicitacaoCompra", "Solicitações de Compra")
              .replace("OrcamentoProjeto", "Orçamentos de Projeto")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {niveisFiltrados.map((nivel) => (
            <div key={nivel.id} className="p-4 border rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold">
                  {nivel.ordem}. {nivel.nome}
                </h4>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setEditingNivel(nivel)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteNivel(nivel.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Aplica-se de {`R$ ${nivel.valor_minimo || 0}`} até{" "}
                {nivel.valor_maximo ? `R$ ${nivel.valor_maximo}` : "infinito"}
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.isArray(JSON.parse(nivel.perfis_aprovadores || "[]")) &&
                  JSON.parse(nivel.perfis_aprovadores || "[]").map((p) => (
                    <Badge key={p} variant="secondary">
                      {p}
                    </Badge>
                  ))}
              </div>
            </div>
          ))}

          {editingNivel && editingNivel.tipo === tipo ? (
            <div className="p-4 border border-blue-500 rounded-lg space-y-4">
              <Input
                placeholder="Nome do nível (ex: Gerente)"
                value={editingNivel.nome}
                onChange={(e) => setEditingNivel({ ...editingNivel, nome: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Ordem"
                value={editingNivel.ordem}
                onChange={(e) => setEditingNivel({ ...editingNivel, ordem: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  type="number"
                  placeholder="Valor Mínimo"
                  value={editingNivel.valor_minimo}
                  onChange={(e) =>
                    setEditingNivel({ ...editingNivel, valor_minimo: e.target.value })
                  }
                />
                <Input
                  type="number"
                  placeholder="Valor Máximo (opcional)"
                  value={editingNivel.valor_maximo}
                  onChange={(e) =>
                    setEditingNivel({ ...editingNivel, valor_maximo: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Perfis Aprovadores</label>
                <div className="border rounded-lg p-3 space-y-2 max-h-32 overflow-y-auto">
                  {perfis.map((p) => (
                    <label key={p} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(editingNivel.perfis_aprovadores || []).includes(p)}
                        onChange={(e) => {
                          const perfisCurrent = editingNivel.perfis_aprovadores || [];
                          const novos = e.target.checked
                            ? [...perfisCurrent, p]
                            : perfisCurrent.filter((x) => x !== p);
                          setEditingNivel({ ...editingNivel, perfis_aprovadores: novos });
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">{p}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setEditingNivel(null)}>
                  Cancelar
                </Button>
                <Button onClick={() => handleSaveNivel(tipo)}>Salvar</Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                setEditingNivel({
                  tipo: tipo,
                  nome: "",
                  ordem: niveisFiltrados.length + 1,
                  valor_minimo: 0,
                  perfis_aprovadores: [],
                })
              }
            >
              <Plus className="w-4 h-4 mr-2" /> Adicionar Nível
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) return <p>Carregando...</p>;

  return (
    <div className="space-y-6">
      {renderNiveis("SolicitacaoCompra")}
      {renderNiveis("OrcamentoProjeto")}
    </div>
  );
}
