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
import { Bot, Loader2, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import WhatsAppConexaoCard from "./WhatsAppConexaoCard";

/**
 * Integrações do SaaS (só Sinergia Digital / super admin).
 * Gerencia a chave global da OpenAI usada pelo ia-processar e a conexão do
 * WhatsApp dos envios automáticos.
 * A chave nunca volta do servidor — só status + últimos 4 dígitos.
 */
export default function IntegracoesTab() {
  const [status, setStatus] = useState(null);
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-5 h-5 text-violet-600" /> OpenAI (IA do sistema)
          </CardTitle>
          <CardDescription>
            Chave global usada por todas as empresas: leitura de documentos na contratação,
            validação de exames (PCMSO) e assistentes de IA.
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
