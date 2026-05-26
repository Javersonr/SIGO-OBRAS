import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEmpresa } from "../../../Layout";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../../utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WidgetProjetosAtivos() {
  const { empresaAtiva, user, perfil, vinculo } = useEmpresa();
  const [projetos, setProjetos] = useState([]);
  const [usuariosEmpresa, setUsuariosEmpresa] = useState([]);
  const [loading, setLoading] = useState(true);

  // Verificar se tem permissões granulares
  const permissoes = vinculo?.permissoes ? JSON.parse(vinculo.permissoes) : {};
  const temPermissoesGranulares = Object.keys(permissoes).length > 0;

  // Verificar se pode ver projetos: Admin OU acesso total (sem granular) a Projetos
  const podeVerProjetos =
    perfil === "Admin" || (!temPermissoesGranulares && vinculo?.perfil !== "Cliente");

  useEffect(() => {
    if (empresaAtiva?.id && podeVerProjetos) {
      loadProjetos();
    } else {
      setLoading(false);
    }
  }, [empresaAtiva?.id, user?.email, podeVerProjetos]);

  const loadProjetos = async () => {
    try {
      const [projs, usuarios] = await Promise.all([
        base44.entities.Projeto.filter({ empresa_id: empresaAtiva.id }, "-created_date", 50),
        base44.entities.UsuarioEmpresa.filter({
          empresa_id: empresaAtiva.id,
          usuario_email: user?.email,
          ativo: true,
        }),
      ]);

      setUsuariosEmpresa(usuarios);

      // Filtrar apenas projetos onde o usuário é responsável
      const filtradas = projs
        .filter((proj) => {
          try {
            const ids = JSON.parse(proj.responsaveis_ids || "[]");
            const vinculoId = usuarios.length > 0 ? usuarios[0].id : null;
            return vinculoId && ids.includes(vinculoId);
          } catch {
            return false;
          }
        })
        .slice(0, 5);

      setProjetos(filtradas);
    } catch (error) {
      console.error("Erro:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-200 rounded" />
            <div className="h-4 bg-slate-200 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!podeVerProjetos) {
    return (
      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-indigo-600" />
            Projetos Ativos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 text-center py-4">Acesso restrito</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-indigo-600" />
            Projetos Ativos
          </div>
          <Link to={createPageUrl("Projetos")}>
            <Button variant="ghost" size="sm" className="text-xs">
              Ver todos
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {projetos.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">Nenhum projeto ativo</p>
        ) : (
          projetos.map((proj) => (
            <div
              key={proj.id}
              className="flex items-center justify-between p-2 hover:bg-slate-50 rounded"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{proj.nome}</p>
                <p className="text-xs text-slate-500">{proj.cliente_nome}</p>
              </div>
              {proj.valor_estimado > 0 && (
                <span className="text-xs text-slate-600 ml-2">
                  R$ {proj.valor_estimado.toFixed(0)}
                </span>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
