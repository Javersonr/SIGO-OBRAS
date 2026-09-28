import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Copy, ExternalLink, KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { copiarTexto } from "@/lib/whatsapp";
import {
  comandoClaudeCode,
  comandoClaudeCodeOAuth,
  linkInstalacaoClaude,
  urlConector,
} from "@/lib/conector";

/**
 * Meu Perfil → Claude (IA): conectar o próprio Claude ao SIGO, gerar chave
 * para o Claude Code e desconectar. Cada usuário conecta o seu; a empresa
 * precisa estar liberada (SaaS Admin → Conector Claude).
 *
 * Piloto: o card NÃO aparece quando a empresa ativa não está liberada — a não
 * ser que o usuário já tenha conexões (de outra empresa), para poder sempre
 * desconectar. Erro ao carregar vira uma linha discreta, nunca "não liberado".
 */

const URL_MCP = urlConector(import.meta.env.VITE_SUPABASE_URL);
const dataHora = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function AppsConectadosCard({ empresaAtiva }) {
  const [dados, setDados] = useState(null);
  const [erroCarga, setErroCarga] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [chaveNova, setChaveNova] = useState(null);

  const carregar = async () => {
    setCarregando(true);
    const { data } = await sigo.functions.invoke("mcpOauth", { acao: "listar" });
    if (data?.success === false) {
      setErroCarga(true);
    } else {
      setErroCarga(false);
      setDados(data);
    }
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, [empresaAtiva?.id]);

  const liberada = !!dados?.empresas_liberadas?.some((e) => e.id === empresaAtiva?.id);

  const copiar = async (texto, rotulo) => {
    if (await copiarTexto(texto)) toast.success(`${rotulo} copiado`);
    else toast.error("Não consegui copiar — selecione o texto e copie manualmente");
  };

  const revogar = async (a) => {
    if (
      !window.confirm(
        `Desconectar "${a.app}" da empresa ${a.empresa}? O Claude perde o acesso na hora.`
      )
    ) {
      return;
    }
    const { data } = await sigo.functions.invoke("mcpOauth", {
      acao: "revogar",
      autorizacao_id: a.id,
    });
    if (data?.success === false) return toast.error(data.error || "Erro ao desconectar");
    toast.success("Desconectado");
    carregar();
  };

  const gerarChave = async () => {
    setGerando(true);
    const { data } = await sigo.functions.invoke("mcpOauth", {
      acao: "gerar_manual",
      empresa_id: empresaAtiva.id,
    });
    setGerando(false);
    if (data?.success === false) return toast.error(data.error || "Erro ao gerar a chave");
    setChaveNova({
      expira_em: data.expira_em,
      comando: comandoClaudeCode(data.url || URL_MCP, data.chave),
    });
    carregar();
  };

  const temConexoes = !!dados?.autorizacoes?.length;

  // Ainda carregando (sem saber se a empresa está liberada) ou empresa fora
  // do piloto sem nenhuma conexão: nada de card.
  if (!dados && !erroCarga) return null;
  if (dados && !liberada && !temConexoes) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-5 h-5" /> Claude (IA)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          Conecte o seu Claude ao SIGO para analisar editais e cadastrar o acervo técnico. O Claude
          só acessa a empresa escolhida na autorização, e você pode desconectar quando quiser.
        </p>

        {erroCarga && (
          <p className="text-xs text-slate-500">
            Não foi possível carregar as conexões do Claude.{" "}
            <button type="button" className="underline" onClick={carregar} disabled={carregando}>
              Tentar de novo
            </button>
          </p>
        )}

        {!dados ? null : !liberada ? (
          <p className="text-sm text-slate-500">
            Para conectar um Claude novo, entre numa empresa com o conector liberado. Você ainda
            pode desconectar as conexões abaixo.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button asChild className="bg-amber-500 hover:bg-amber-600">
              <a href={linkInstalacaoClaude(URL_MCP)} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" /> Conectar ao Claude
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={() => copiar(comandoClaudeCodeOAuth(URL_MCP), "Comando")}
            >
              <Copy className="w-4 h-4 mr-2" /> Comando do Claude Code
            </Button>
            <Button variant="outline" onClick={gerarChave} disabled={gerando}>
              {gerando ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4 mr-2" />
              )}
              Gerar chave do Claude Code
            </Button>
          </div>
        )}

        {chaveNova && (
          <div className="border border-emerald-200 bg-emerald-50 rounded p-3 space-y-2 text-sm">
            <p className="font-medium text-emerald-800">
              Chave criada — ela aparece só agora. Copie o comando e rode no terminal do Claude
              Code.
            </p>
            <code className="block break-all bg-white border rounded p-2 text-xs">
              {chaveNova.comando}
            </code>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copiar(chaveNova.comando, "Comando")}
              >
                <Copy className="w-3.5 h-3.5 mr-1" /> Copiar comando
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setChaveNova(null)}>
                Fechar
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Válida até {dataHora(chaveNova.expira_em)}. Não mande esta chave por WhatsApp ou
              e-mail.
            </p>
          </div>
        )}

        {dados && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Conexões ativas</p>
            {!temConexoes ? (
              <p className="text-sm text-slate-500">Nenhuma conexão.</p>
            ) : (
              dados.autorizacoes.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 border rounded p-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {a.app} · {a.empresa}
                    </p>
                    <p className="text-xs text-slate-500">
                      Conectado em {dataHora(a.criado_em)} · último uso {dataHora(a.ultimo_uso)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => revogar(a)}
                    aria-label={`Desconectar ${a.app}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
