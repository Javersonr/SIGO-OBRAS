import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  PlugZap,
  RefreshCw,
  Save,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import WhatsAppConexaoCard from "./WhatsAppConexaoCard";
import {
  GEMINI_MODELO_FORTE,
  GEMINI_MODELO_PADRAO,
  OPCOES_GEMINI_FORTE,
  OPCOES_GEMINI_PADRAO,
  payloadGemini,
  resultadoTesteGemini,
} from "@/lib/integracoes-ia";

/**
 * Card do Google Gemini (IA padrão). Salvar manda só o que mudou; "Testar"
 * chama o Google com a chave SALVA (por isso fica desabilitado enquanto há
 * uma chave digitada e não salva).
 */
function CardGemini({ status, carregando, onSalvo }) {
  const [novaChave, setNovaChave] = useState("");
  const [modelo, setModelo] = useState(GEMINI_MODELO_PADRAO);
  const [modeloForte, setModeloForte] = useState(GEMINI_MODELO_FORTE);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState(null);

  useEffect(() => {
    setModelo(status?.modelo || GEMINI_MODELO_PADRAO);
    setModeloForte(status?.modelo_forte || GEMINI_MODELO_FORTE);
  }, [status]);

  const payload = payloadGemini({ novaChave, modelo, modeloForte, status });
  const chaveDigitada = novaChave.trim().length > 0;

  const salvar = async () => {
    if (!payload) return;
    setSalvando(true);
    try {
      const { data } = await sigo.functions.invoke("saasConfig", payload);
      if (data?.success !== false) {
        toast.success("Gemini salvo");
        setNovaChave("");
        setTeste(null);
        onSalvo();
      } else {
        toast.error(data?.error || "Erro ao salvar o Gemini");
      }
    } catch (e) {
      toast.error("Erro ao salvar o Gemini");
      console.error(e);
    } finally {
      setSalvando(false);
    }
  };

  const testar = async () => {
    setTestando(true);
    setTeste(null);
    try {
      const { data } = await sigo.functions.invoke("saasConfig", { acao: "testar_gemini" });
      const r = resultadoTesteGemini(data);
      setTeste(r);
      if (r.ok) toast.success(r.mensagem);
      else toast.error(r.mensagem);
    } catch (e) {
      setTeste({ ok: false, mensagem: "Não foi possível testar a chave" });
      console.error(e);
    } finally {
      setTestando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="w-5 h-5 text-blue-600" /> Google Gemini (IA padrão)
        </CardTitle>
        <CardDescription>
          Usado primeiro em todas as ações de IA, para todas as empresas: leitura de documentos,
          editais, exames (PCMSO) e assistentes. Sem chave ou com falha, o sistema usa a OpenAI
          (reserva).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Use uma chave <strong>nova</strong> do Google AI Studio, criada num projeto com{" "}
            <strong>faturamento ativo</strong>. Sem faturamento, o Google usa os dados enviados para
            melhorar os produtos dele, e documentos de clientes não podem ir assim.
          </p>
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">Status:</span>
              {status?.configurada ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  ● Configurada (final ...{status.final})
                  {status.origem === "secret" ? " · via secret" : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500">
                  ○ Não configurada
                </Badge>
              )}
            </div>

            <div>
              <Label>Nova chave da API do Gemini</Label>
              <Input
                type="password"
                value={novaChave}
                onChange={(e) => setNovaChave(e.target.value)}
                placeholder={
                  status?.configurada ? "Deixe vazio para manter a atual" : "Cole a chave aqui"
                }
                className="mt-1 font-mono"
                autoComplete="off"
              />
              <p className="text-xs text-slate-400 mt-1">
                A chave é gravada no servidor e nunca volta para o navegador.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Modelo padrão</Label>
                <Select value={modelo} onValueChange={setModelo}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPCOES_GEMINI_PADRAO.map((o) => (
                      <SelectItem key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 mt-1">Leituras do dia a dia.</p>
              </div>
              <div>
                <Label>Modelo forte</Label>
                <Select value={modeloForte} onValueChange={setModeloForte}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPCOES_GEMINI_FORTE.map((o) => (
                      <SelectItem key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 mt-1">
                  Usado quando a leitura com o padrão vem incompleta.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={salvar}
                disabled={salvando || !payload}
                className="bg-slate-900 hover:bg-slate-800"
              >
                {salvando ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
              <Button
                variant="outline"
                onClick={testar}
                disabled={testando || !status?.configurada || chaveDigitada}
                title={
                  chaveDigitada ? "Salve a chave antes de testar" : "Testa a chave salva no Google"
                }
              >
                {testando ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <PlugZap className="w-4 h-4 mr-2" />
                )}
                Testar
              </Button>
            </div>

            {teste && (
              <p
                className={`flex items-center gap-1.5 text-sm ${
                  teste.ok ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {teste.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {teste.mensagem}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Integrações do SaaS (só Sinergia Digital / super admin).
 * Gerencia as chaves globais de IA usadas pelo ia-processar — Gemini (padrão)
 * e OpenAI (reserva) — e a conexão do WhatsApp dos envios automáticos.
 * As chaves nunca voltam do servidor — só status + últimos 4 dígitos.
 */
export default function IntegracoesTab() {
  const [status, setStatus] = useState(null);
  const [statusGemini, setStatusGemini] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [novaChave, setNovaChave] = useState("");
  const [modelo, setModelo] = useState("gpt-4o-mini");

  const carregar = async () => {
    setCarregando(true);
    try {
      const { data } = await sigo.functions.invoke("saasConfig", { acao: "status" });
      if (data?.success !== false) {
        setStatus(data.openai);
        setModelo(data.openai?.modelo || "gpt-4o-mini");
        setStatusGemini(data.gemini || null);
      } else {
        toast.error(data?.error || "Erro ao carregar status");
      }
    } catch (e) {
      toast.error("Erro ao carregar status da integração");
      console.error(e);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const salvar = async () => {
    const payload = { acao: "definir", modelo };
    if (novaChave.trim()) payload.chave_openai = novaChave.trim();
    setSalvando(true);
    try {
      const { data } = await sigo.functions.invoke("saasConfig", payload);
      if (data?.success !== false) {
        toast.success("✅ Configuração salva");
        setNovaChave("");
        carregar();
      } else {
        toast.error("❌ " + (data?.error || "Erro ao salvar"));
      }
    } catch (e) {
      toast.error("❌ Erro ao salvar configuração");
      console.error(e);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <CardGemini status={statusGemini} carregando={carregando} onSalvo={carregar} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-5 h-5 text-violet-600" /> OpenAI (reserva)
          </CardTitle>
          <CardDescription>
            Usada quando o Gemini não tem chave ou falha. Chave global, vale para todas as empresas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {carregando ? (
            <div className="flex items-center gap-2 text-slate-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">Status:</span>
                {status?.configurada ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                    ● Configurada (final ...{status.final})
                    {status.origem === "secret" ? " · via secret" : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-500">
                    ○ Não configurada
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={carregar} title="Atualizar">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              <div>
                <Label>Nova chave da API (sk-...)</Label>
                <Input
                  type="password"
                  value={novaChave}
                  onChange={(e) => setNovaChave(e.target.value)}
                  placeholder={
                    status?.configurada ? "Deixe vazio para manter a atual" : "Cole a chave aqui"
                  }
                  className="mt-1 font-mono"
                  autoComplete="off"
                />
                <p className="text-xs text-slate-400 mt-1">
                  A chave é gravada no servidor e nunca volta para o navegador.
                </p>
              </div>

              <div>
                <Label>Modelo padrão</Label>
                <Select value={modelo} onValueChange={setModelo}>
                  <SelectTrigger className="mt-1 w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o-mini">gpt-4o-mini (econômico)</SelectItem>
                    <SelectItem value="gpt-4o">gpt-4o (mais preciso)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={salvar}
                disabled={salvando || (!novaChave.trim() && modelo === (status?.modelo || ""))}
                className="bg-slate-900 hover:bg-slate-800"
              >
                {salvando ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <WhatsAppConexaoCard />
    </div>
  );
}
