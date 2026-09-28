import React, { useEffect, useMemo, useState } from "react";
import { sigo, supabase, encerrarSessao } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from "lucide-react";
import { erroDeSessao, lerPedidoAutorizacao, sessaoCustomConfere } from "@/lib/conector";

/**
 * Tela de autorização do conector do Claude (authorization_endpoint do
 * servidor OAuth do SIGO). Pública no Layout: confere sozinha a sessão —
 * a do Supabase E o custom_auth desta aba, do mesmo usuário (sessão "zumbi"
 * do Supabase no localStorage não basta); sem isso, vai ao login com ?voltar=
 * e retorna para cá. Quem valida tudo é o mcp-oauth (cliente, redirect,
 * empresa, PKCE).
 *
 * Erros: só o de sessão (401 `codigo: "sessao_invalida"`) oferece "Entrar no
 * SIGO de novo"; os outros (pedido inválido, senha provisória, serviço fora
 * do ar) mandam voltar ao Claude e conectar de novo.
 */

const PODE = [
  "Ver seu usuário e a empresa escolhida",
  "Ler oportunidades e o acervo técnico da empresa",
  "Criar e atualizar oportunidades a partir de editais",
  "Anexar os arquivos que você enviar",
  "Cadastrar atestados e CATs no acervo técnico",
];
const NUNCA = [
  "Apagar dados",
  "Mexer em financeiro, usuários ou configurações",
  "Enviar e-mail ou WhatsApp",
  "Acessar outra empresa",
];

function irParaLogin() {
  const voltar = window.location.pathname + window.location.search;
  window.location.replace(`/EntrarSistema?voltar=${encodeURIComponent(voltar)}`);
}

function lerCustomAuth() {
  try {
    return sessionStorage.getItem("custom_auth");
  } catch {
    return null;
  }
}

export default function AutorizarConector() {
  const { pedido, faltando } = useMemo(() => lerPedidoAutorizacao(window.location.search), []);
  const [estado, setEstado] = useState("carregando"); // carregando | pronto | enviando | erro
  const [erro, setErro] = useState("");
  const [erroSessao, setErroSessao] = useState(false); // só ele leva ao login
  const [naoFechou, setNaoFechou] = useState(false);
  const [ctx, setCtx] = useState(null);
  const [empresaId, setEmpresaId] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (faltando.length) {
        setErro(
          `Pedido de autorização incompleto (faltam: ${faltando.join(", ")}). Volte ao Claude e tente conectar de novo.`
        );
        setErroSessao(false);
        setEstado("erro");
        return;
      }
      const sessao = supabase ? (await supabase.auth.getSession()).data?.session : null;
      // Sessão do Supabase sozinha não basta: precisa do login desta aba
      // (custom_auth) do mesmo usuário — senão é sessão "zumbi" (navegador
      // reaberto) e ninguém digitou a senha.
      if (!sessao || !sessaoCustomConfere(lerCustomAuth(), sessao.user?.email)) {
        irParaLogin();
        return;
      }
      const { data } = await sigo.functions.invoke("mcpOauth", {
        acao: "contexto",
        client_id: pedido.client_id,
        redirect_uri: pedido.redirect_uri,
      });
      if (cancelado) return;
      if (data?.success === false) {
        setErro(data.error || "Não foi possível abrir a autorização.");
        setErroSessao(erroDeSessao(data));
        setEstado("erro");
        return;
      }
      setCtx(data);
      // Empresa NUNCA pré-selecionada (nem quando só há uma): a escolha é um
      // passo consciente contra link de autorização mandado por outra pessoa.
      setEstado("pronto");
    })();
    return () => {
      cancelado = true;
    };
  }, [pedido, faltando]);

  const decidir = async (acao) => {
    setEstado("enviando");
    const payload =
      acao === "aprovar"
        ? { acao, ...pedido, empresa_id: empresaId }
        : {
            acao,
            client_id: pedido.client_id,
            redirect_uri: pedido.redirect_uri,
            state: pedido.state,
          };
    const { data } = await sigo.functions.invoke("mcpOauth", payload);
    if (data?.success === false || !data?.redirect_url) {
      setErro(data?.error || "Não foi possível concluir.");
      setErroSessao(erroDeSessao(data));
      setEstado("erro");
      return;
    }
    window.location.assign(data.redirect_url);
  };

  // A tela costuma abrir numa aba/janela do Claude: fechar devolve a pessoa a
  // ele. O navegador só deixa fechar a aba aberta por script — senão, avisa.
  const voltarAoClaude = () => {
    window.close();
    setTimeout(() => setNaoFechou(true), 300);
  };

  const trocarUsuario = async () => {
    await encerrarSessao();
    sessionStorage.clear();
    irParaLogin();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 pt-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-500" /> Autorizar acesso ao SIGO Obras
          </CardTitle>
          {ctx && (
            <CardDescription>
              <strong>{ctx.cliente.nome}</strong> ({ctx.cliente.destino}) quer acessar o SIGO Obras
              em seu nome.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {estado === "carregando" && (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          )}

          {estado === "erro" && (
            <div className="space-y-3">
              <p className="flex gap-2 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {erro}
              </p>
              {erroSessao ? (
                <Button variant="outline" onClick={irParaLogin}>
                  Entrar no SIGO de novo
                </Button>
              ) : (
                <Button variant="outline" onClick={voltarAoClaude}>
                  Volte ao Claude e conecte de novo
                </Button>
              )}
              {!erroSessao && naoFechou && (
                <p className="text-xs text-slate-500">
                  Feche esta aba e peça a conexão de novo no seu Claude.
                </p>
              )}
            </div>
          )}

          {ctx && (estado === "pronto" || estado === "enviando") && (
            <>
              <p className="text-sm text-slate-600">
                Entrando como <strong>{ctx.usuario.nome}</strong> ({ctx.usuario.email}).{" "}
                <button type="button" className="underline" onClick={trocarUsuario}>
                  Não é você?
                </button>
              </p>

              <p
                role="note"
                className="flex gap-2 text-sm font-medium text-amber-900 bg-amber-50 border border-amber-300 rounded p-3"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                Só clique em Permitir se você acabou de pedir a conexão no seu Claude. Se recebeu
                este link de outra pessoa, clique em Negar.
              </p>

              {ctx.empresas.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                  Nenhuma das suas empresas tem o conector do Claude liberado, ou você não tem
                  acesso a Oportunidades. Fale com o administrador.
                </p>
              ) : (
                <div>
                  <Label>Empresa que o Claude vai usar</Label>
                  <Select value={empresaId} onValueChange={setEmpresaId}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Escolha a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {ctx.empresas.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="font-medium mb-1">O Claude poderá</p>
                  <ul className="space-y-1">
                    {PODE.map((t) => (
                      <li key={t} className="flex gap-1.5">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium mb-1">O Claude nunca vai</p>
                  <ul className="space-y-1">
                    {NUNCA.map((t) => (
                      <li key={t} className="flex gap-1.5">
                        <X className="w-4 h-4 text-red-600 shrink-0" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  disabled={estado === "enviando"}
                  onClick={() => decidir("negar")}
                >
                  Negar
                </Button>
                <Button
                  className="bg-amber-500 hover:bg-amber-600"
                  disabled={estado === "enviando" || !empresaId}
                  onClick={() => decidir("aprovar")}
                >
                  {estado === "enviando" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Permitir
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
