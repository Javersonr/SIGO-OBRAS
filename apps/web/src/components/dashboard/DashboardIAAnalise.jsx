import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../../Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function DashboardIAAnalise({ moduloAtivo, dadosModulo }) {
  const { empresaAtiva } = useEmpresa();
  const [analise, setAnalise] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  const gerarAnalise = async () => {
    setLoading(true);
    setErro(null);
    try {
      const prompt = `Você é um analista de negócios especialista. Analise os dados abaixo do módulo "${moduloAtivo}" da empresa "${empresaAtiva?.nome || empresaAtiva?.razao_social}" e forneça:

1. **Resumo Executivo** (2-3 linhas)
2. **Principais Alertas** (liste os pontos críticos que precisam de atenção imediata)
3. **Tendências Observadas** (o que os números indicam)
4. **Recomendações de Ação** (3-5 ações concretas e priorizadas)

Dados do módulo ${moduloAtivo}:
${JSON.stringify(dadosModulo, null, 2)}

Seja direto, objetivo e use linguagem empresarial. Foque em insights acionáveis.`;

      const resultado = await sigo.integrations.Core.InvokeLLM({ prompt, model: "gemini_3_flash" });
      setAnalise(
        typeof resultado === "string" ? resultado : resultado?.response || JSON.stringify(resultado)
      );
    } catch (e) {
      setErro("Erro ao gerar análise. Tente novamente.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <CardTitle className="text-sm text-purple-700">
              Análise por Inteligência Artificial
            </CardTitle>
          </div>
          <Button
            size="sm"
            onClick={gerarAnalise}
            disabled={loading || !dadosModulo}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-7 px-3"
          >
            {loading ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Analisando...
              </>
            ) : analise ? (
              <>
                <RefreshCw className="w-3 h-3 mr-1" />
                Reanalisar
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 mr-1" />
                Analisar com IA
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {erro && <p className="text-xs text-red-500">{erro}</p>}
        {!analise && !loading && !erro && (
          <p className="text-xs text-purple-400 italic">
            Clique em "Analisar com IA" para obter insights automáticos sobre este módulo.
          </p>
        )}
        {loading && (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
            <p className="text-xs text-purple-500">Analisando dados e gerando insights...</p>
          </div>
        )}
        {analise && !loading && (
          <div className="prose prose-sm max-w-none text-slate-700 text-xs leading-relaxed">
            <ReactMarkdown>{analise}</ReactMarkdown>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
