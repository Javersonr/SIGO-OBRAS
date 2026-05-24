import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { Brain, TrendingUp, AlertTriangle, Lightbulb, Loader2, RefreshCw, MessageSquare } from 'lucide-react';

export default function InsightsIA({ transacoes, categorias, tipo = 'dre' }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showResumo, setShowResumo] = useState(false);

  useEffect(() => {
    if (transacoes.length > 0) {
      gerarInsights();
    }
  }, [transacoes, tipo]);

  const gerarInsights = async () => {
    setLoading(true);
    try {
      // Preparar dados para análise
      const receitas = transacoes.filter(t => t.tipo === 'Receita' && t.status === 'Pago');
      const despesas = transacoes.filter(t => t.tipo === 'Despesa' && t.status === 'Pago');
      
      const totalReceitas = receitas.reduce((sum, t) => sum + (t.valor || 0), 0);
      const totalDespesas = despesas.reduce((sum, t) => sum + (t.valor || 0), 0);
      const margemLiquida = totalReceitas > 0 ? ((totalReceitas - totalDespesas) / totalReceitas) * 100 : 0;

      // Agrupar por categoria
      const despesasPorCategoria = {};
      despesas.forEach(d => {
        const cat = d.categoria_nome || 'Sem Categoria';
        despesasPorCategoria[cat] = (despesasPorCategoria[cat] || 0) + (d.valor || 0);
      });

      const categoriasMaiores = Object.entries(despesasPorCategoria)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([cat, valor]) => `${cat}: R$ ${valor.toFixed(2)}`);

      // Chamar IA para análise
      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um analista financeiro experiente. Analise os seguintes dados financeiros e identifique:
        1. Anomalias ou valores atípicos que merecem atenção
        2. Tendências positivas ou preocupantes
        3. Recomendações práticas de otimização
        
        Dados:
        - Total Receitas: R$ ${totalReceitas.toFixed(2)}
        - Total Despesas: R$ ${totalDespesas.toFixed(2)}
        - Margem Líquida: ${margemLiquida.toFixed(1)}%
        - Maiores categorias de despesa: ${categoriasMaiores.join(', ')}
        - Número de transações: ${transacoes.length}
        
        Retorne um JSON com:
        - anomalias: array de objetos {titulo, descricao, severidade: 'alta'|'media'|'baixa'}
        - tendencias: array de objetos {titulo, descricao, tipo: 'positiva'|'negativa'|'neutra'}
        - recomendacoes: array de strings com ações práticas`,
        response_json_schema: {
          type: 'object',
          properties: {
            anomalias: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  titulo: { type: 'string' },
                  descricao: { type: 'string' },
                  severidade: { type: 'string' }
                }
              }
            },
            tendencias: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  titulo: { type: 'string' },
                  descricao: { type: 'string' },
                  tipo: { type: 'string' }
                }
              }
            },
            recomendacoes: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      });

      setInsights(resultado);
    } catch (error) {
      console.error('Erro ao gerar insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const gerarResumoExecutivo = async () => {
    setLoading(true);
    try {
      const receitas = transacoes.filter(t => t.tipo === 'Receita' && t.status === 'Pago');
      const despesas = transacoes.filter(t => t.tipo === 'Despesa' && t.status === 'Pago');
      
      const totalReceitas = receitas.reduce((sum, t) => sum + (t.valor || 0), 0);
      const totalDespesas = despesas.reduce((sum, t) => sum + (t.valor || 0), 0);

      const resumo = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um CFO experiente. Crie um resumo executivo conciso (máximo 3 parágrafos) dos resultados financeiros:
        
        - Receitas: R$ ${totalReceitas.toFixed(2)}
        - Despesas: R$ ${totalDespesas.toFixed(2)}
        - Resultado: R$ ${(totalReceitas - totalDespesas).toFixed(2)}
        
        Anomalias identificadas: ${insights?.anomalias?.map(a => a.titulo).join(', ') || 'Nenhuma'}
        Tendências: ${insights?.tendencias?.map(t => t.titulo).join(', ') || 'Nenhuma'}
        
        Use linguagem clara e objetiva, destacando os principais pontos de atenção e oportunidades.`
      });

      setInsights({ ...insights, resumo_executivo: resumo });
      setShowResumo(true);
    } catch (error) {
      console.error('Erro ao gerar resumo:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeveridadeColor = (severidade) => {
    switch (severidade) {
      case 'alta': return 'bg-red-100 text-red-700 border-red-300';
      case 'media': return 'bg-amber-100 text-amber-700 border-amber-300';
      case 'baixa': return 'bg-blue-100 text-blue-700 border-blue-300';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getTipoIcon = (tipo) => {
    switch (tipo) {
      case 'positiva': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'negativa': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default: return <TrendingUp className="w-4 h-4 text-slate-600" />;
    }
  };

  if (loading) {
    return (
      <Card className="border-blue-200">
        <CardContent className="p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
          <p className="text-slate-600">Analisando dados com IA...</p>
        </CardContent>
      </Card>
    );
  }

  if (!insights) return null;

  return (
    <div className="space-y-4">
      {/* Resumo Executivo */}
      {showResumo && insights.resumo_executivo && (
        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-green-600" />
                <CardTitle className="text-green-900">Resumo Executivo</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowResumo(false)}>
                Fechar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-slate-700">
              {insights.resumo_executivo.split('\n').map((paragrafo, idx) => (
                <p key={idx} className="mb-3">{paragrafo}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <CardTitle className="text-purple-900">Insights Inteligentes</CardTitle>
            </div>
            <div className="flex gap-2">
              {!showResumo && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={gerarResumoExecutivo}
                  disabled={loading}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Gerar Resumo Executivo
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={gerarInsights}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Anomalias */}
          {insights.anomalias && insights.anomalias.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold text-slate-800">Anomalias Detectadas</h3>
              </div>
              <div className="space-y-2">
                {insights.anomalias.map((anomalia, idx) => (
                  <div 
                    key={idx} 
                    className={`p-3 rounded-lg border ${getSeveridadeColor(anomalia.severidade)}`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="font-medium">{anomalia.titulo}</span>
                      <Badge variant="outline" className="text-xs">
                        {anomalia.severidade}
                      </Badge>
                    </div>
                    <p className="text-sm opacity-90">{anomalia.descricao}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tendências */}
          {insights.tendencias && insights.tendencias.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-slate-800">Tendências Identificadas</h3>
              </div>
              <div className="space-y-2">
                {insights.tendencias.map((tendencia, idx) => (
                  <div key={idx} className="p-3 bg-white border border-slate-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      {getTipoIcon(tendencia.tipo)}
                      <div className="flex-1">
                        <span className="font-medium text-slate-800 block mb-1">
                          {tendencia.titulo}
                        </span>
                        <p className="text-sm text-slate-600">{tendencia.descricao}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recomendações */}
          {insights.recomendacoes && insights.recomendacoes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-slate-800">Recomendações</h3>
              </div>
              <div className="space-y-2">
                {insights.recomendacoes.map((rec, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <span className="text-amber-600 font-bold text-sm">{idx + 1}.</span>
                    <p className="text-sm text-slate-700 flex-1">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}