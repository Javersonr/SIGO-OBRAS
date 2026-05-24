import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { BarChart3, PieChart, TrendingUp, Layers, Loader2 } from 'lucide-react';

export default function SugestoesVisualizacao({ transacoes, tipo, onAplicarSugestao }) {
  const [sugestoes, setSugestoes] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    gerarSugestoes();
  }, [transacoes, tipo]);

  const gerarSugestoes = async () => {
    setLoading(true);
    try {
      // Análise dos dados
      const receitas = transacoes.filter(t => t.tipo === 'Receita' && t.status === 'Pago');
      const despesas = transacoes.filter(t => t.tipo === 'Despesa' && t.status === 'Pago');
      
      const temCategorias = new Set(transacoes.map(t => t.categoria_id)).size > 1;
      const temCentrosCusto = transacoes.some(t => t.centro_custo_id);
      const temProjetos = transacoes.some(t => t.projeto_id);
      const temPeriodos = transacoes.length > 30;

      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt: `Como analista de BI, sugira as 5 melhores visualizações para os dados financeiros:
        
        Contexto:
        - Tipo de relatório: ${tipo}
        - Número de transações: ${transacoes.length}
        - Possui categorias: ${temCategorias}
        - Possui centros de custo: ${temCentrosCusto}
        - Possui projetos: ${temProjetos}
        - Período longo (>30 dias): ${temPeriodos}
        
        Para cada sugestão, retorne:
        - titulo: nome da visualização
        - descricao: breve descrição do insight que ela revela
        - tipo_grafico: 'barras', 'linha', 'pizza', 'area', 'scatter'
        - metricas: array com métricas a exibir
        - prioridade: 'alta', 'media', 'baixa'
        - motivo: por que essa visualização é relevante`,
        response_json_schema: {
          type: 'object',
          properties: {
            sugestoes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  titulo: { type: 'string' },
                  descricao: { type: 'string' },
                  tipo_grafico: { type: 'string' },
                  metricas: { type: 'array', items: { type: 'string' } },
                  prioridade: { type: 'string' },
                  motivo: { type: 'string' }
                }
              }
            }
          }
        }
      });

      setSugestoes(resultado.sugestoes || []);
    } catch (error) {
      console.error('Erro ao gerar sugestões:', error);
    } finally {
      setLoading(false);
    }
  };

  const getIconByTipo = (tipoGrafico) => {
    switch (tipoGrafico) {
      case 'barras': return <BarChart3 className="w-4 h-4" />;
      case 'pizza': return <PieChart className="w-4 h-4" />;
      case 'linha': return <TrendingUp className="w-4 h-4" />;
      default: return <Layers className="w-4 h-4" />;
    }
  };

  const getPrioridadeColor = (prioridade) => {
    switch (prioridade) {
      case 'alta': return 'bg-red-100 text-red-700';
      case 'media': return 'bg-amber-100 text-amber-700';
      case 'baixa': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
          <p className="text-sm text-slate-600">Gerando sugestões de visualização...</p>
        </CardContent>
      </Card>
    );
  }

  if (sugestoes.length === 0) return null;

  return (
    <Card className="border-blue-200">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <CardTitle>Visualizações Sugeridas pela IA</CardTitle>
        </div>
        <p className="text-sm text-slate-500">
          Baseado nos seus dados, recomendamos estas análises
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sugestoes.map((sugestao, idx) => (
            <div
              key={idx}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onAplicarSugestao && onAplicarSugestao(sugestao)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getIconByTipo(sugestao.tipo_grafico)}
                  <h4 className="font-medium text-slate-800">{sugestao.titulo}</h4>
                </div>
                <Badge className={getPrioridadeColor(sugestao.prioridade)} variant="outline">
                  {sugestao.prioridade}
                </Badge>
              </div>
              
              <p className="text-sm text-slate-600 mb-3">{sugestao.descricao}</p>
              
              {sugestao.metricas && sugestao.metricas.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {sugestao.metricas.map((metrica, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {metrica}
                    </Badge>
                  ))}
                </div>
              )}
              
              <p className="text-xs text-slate-500 italic">{sugestao.motivo}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}