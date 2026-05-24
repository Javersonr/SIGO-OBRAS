import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '../../../Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, Target, FolderKanban } from 'lucide-react';

export default function WidgetMetricasGerais() {
  const { empresaAtiva, perfil, temPermissao } = useEmpresa();
  const [metrics, setMetrics] = useState({ oportunidades: 0, projetos: 0, usuarios: 0, solicitacoes: 0 });
  const [loading, setLoading] = useState(true);

  const isAdmin = perfil === 'Admin';
  const podeVerOportunidades = isAdmin || temPermissao('Oportunidades');
  const podeVerProjetos = isAdmin || temPermissao('Projetos');
  const podeVerSolicitacoes = isAdmin || temPermissao('Compras');

  useEffect(() => {
    if (empresaAtiva) loadMetrics();
  }, [empresaAtiva?.id]);

  const loadMetrics = async () => {
    try {
      const promises = [];
      if (podeVerOportunidades) promises.push(base44.entities.Oportunidade.filter({ empresa_id: empresaAtiva.id }, '', 9999));
      else promises.push(Promise.resolve([]));
      if (podeVerProjetos) promises.push(base44.entities.Projeto.filter({ empresa_id: empresaAtiva.id }, '', 9999));
      else promises.push(Promise.resolve([]));
      if (isAdmin) promises.push(base44.entities.UsuarioEmpresa.filter({ empresa_id: empresaAtiva.id, ativo: true }, '', 9999));
      else promises.push(Promise.resolve([]));
      if (podeVerSolicitacoes) promises.push(base44.entities.SolicitacaoCompra.filter({ empresa_id: empresaAtiva.id }, '', 9999));
      else promises.push(Promise.resolve([]));

      const [ops, projs, users, sols] = await Promise.all(promises);
      setMetrics({ oportunidades: ops.length, projetos: projs.length, usuarios: users.length, solicitacoes: sols.length });
    } catch (error) {
      console.error('Erro ao carregar métricas:', error);
    } finally {
      setLoading(false);
    }
  };

  const allCards = [
    { title: 'Oportunidades', value: metrics.oportunidades, icon: Target, color: 'text-blue-600', visible: podeVerOportunidades },
    { title: 'Projetos', value: metrics.projetos, icon: FolderKanban, color: 'text-green-600', visible: podeVerProjetos },
    { title: 'Usuários', value: metrics.usuarios, icon: Users, color: 'text-purple-600', visible: isAdmin },
    { title: 'Solicitações', value: metrics.solicitacoes, icon: TrendingUp, color: 'text-amber-600', visible: podeVerSolicitacoes }
  ];

  const cards = allCards.filter(c => c.visible);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Métricas Gerais
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`grid gap-4 grid-cols-${Math.min(cards.length, 4)}`}>
          {cards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div key={i} className="p-4 bg-slate-50 rounded-lg">
                <Icon className={`w-6 h-6 mb-2 ${card.color}`} />
                <p className="text-sm text-slate-600">{card.title}</p>
                <p className="text-2xl font-bold text-slate-800">{loading ? '-' : card.value}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}