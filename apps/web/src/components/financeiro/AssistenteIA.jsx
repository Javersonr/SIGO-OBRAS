import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Sparkles, Send, Loader2, AlertTriangle, TrendingUp, Lightbulb } from 'lucide-react';

export default function AssistenteIA({ transacoes, onAplicarFiltros, categorias, centrosCusto }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  const exemplos = [
    "Mostrar DRE do último trimestre com despesas por centro de custo",
    "Comparar receitas do mês atual vs. mês anterior",
    "Identificar despesas que cresceram mais de 20% no último mês",
    "Mostrar fluxo de caixa projetado para os próximos 3 meses",
    "Listar maiores fornecedores por valor total pago"
  ];

  const handleConsulta = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    try {
      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um assistente financeiro especializado. Analise a seguinte solicitação do usuário e retorne um JSON com:
        1. tipo: tipo de relatório solicitado ('dre', 'balanco', 'fluxo', 'comparacao', 'lista', 'analise')
        2. filtros: objeto com filtros a serem aplicados (dataInicio, dataFim, categoriaId, centroCustoId, etc)
        3. visualizacao: tipo de visualização sugerida ('tabela', 'grafico_barras', 'grafico_linha', 'grafico_pizza')
        4. explicacao: explicação resumida do que será mostrado
        5. metricas_sugeridas: array com métricas relevantes a exibir
        
        Solicitação do usuário: "${prompt}"
        
        Período disponível: últimos 12 meses
        Categorias disponíveis: ${categorias.map(c => c.nome).join(', ')}
        Centros de custo disponíveis: ${centrosCusto?.map(c => c.nome).join(', ') || 'Nenhum'}`,
        response_json_schema: {
          type: 'object',
          properties: {
            tipo: { type: 'string' },
            filtros: { type: 'object' },
            visualizacao: { type: 'string' },
            explicacao: { type: 'string' },
            metricas_sugeridas: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setResultado(resultado);
    } catch (error) {
      console.error('Erro ao processar consulta:', error);
      alert('Erro ao processar sua solicitação. Tente reformular.');
    } finally {
      setLoading(false);
    }
  };

  const handleAplicar = () => {
    if (resultado?.filtros) {
      onAplicarFiltros(resultado.filtros, resultado.tipo);
      setResultado(null);
      setPrompt('');
    }
  };

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <CardTitle className="text-purple-900">Assistente Financeiro com IA</CardTitle>
        </div>
        <p className="text-sm text-purple-700 mt-2">
          Crie relatórios personalizados usando linguagem natural
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input de Consulta */}
        <div className="flex gap-2">
          <Input
            placeholder="Ex: Mostre as despesas do último trimestre por categoria..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleConsulta()}
            className="flex-1"
          />
          <Button 
            onClick={handleConsulta} 
            disabled={loading || !prompt.trim()}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Exemplos */}
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Exemplos de consultas:</p>
          <div className="flex flex-wrap gap-2">
            {exemplos.map((ex, idx) => (
              <Badge
                key={idx}
                variant="outline"
                className="cursor-pointer hover:bg-purple-100"
                onClick={() => setPrompt(ex)}
              >
                {ex}
              </Badge>
            ))}
          </div>
        </div>

        {/* Resultado */}
        {resultado && (
          <div className="bg-white border border-purple-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-purple-600" />
                  <span className="font-medium text-purple-900">Interpretação da IA</span>
                </div>
                <p className="text-sm text-slate-700">{resultado.explicacao}</p>
              </div>
            </div>

            {resultado.metricas_sugeridas && resultado.metricas_sugeridas.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Métricas sugeridas:</p>
                <div className="flex flex-wrap gap-2">
                  {resultado.metricas_sugeridas.map((metrica, idx) => (
                    <Badge key={idx} variant="secondary">{metrica}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Tipo: {resultado.tipo}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Visualização: {resultado.visualizacao}
              </Badge>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleAplicar}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
              >
                Aplicar Filtros
              </Button>
              <Button 
                variant="outline"
                onClick={() => setResultado(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}