import React, { useState, useEffect } from "react";
import { sigo, supabase } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gavel, Search, Save, Loader2, Info } from "lucide-react";
import { toast } from "sonner";

/**
 * Configuração da busca automática de licitações (Alerta Licitação).
 * Lê/edita o registro de licitacao_busca da empresa ativa: UFs, palavras-chave,
 * e o liga/desliga de "criar oportunidade automaticamente".
 */
export default function LicitacoesConfigTab({ empresaAtiva }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const [ufsText, setUfsText] = useState("");
  const [palavrasChave, setPalavrasChave] = useState("");
  const [criarAuto, setCriarAuto] = useState(false);
  const [ativo, setAtivo] = useState(true);

  const ufsArray = ufsText
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const loadConfig = async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const rows = await sigo.entities.LicitacaoBusca.filter({ empresa_id: empresaAtiva.id });
      const cfg = (rows || [])[0] || null;
      setConfig(cfg);
      if (cfg) {
        const ufs = Array.isArray(cfg.ufs) ? cfg.ufs : [];
        setUfsText(ufs.join(", "));
        setPalavrasChave(cfg.palavras_chave || "");
        setCriarAuto(Boolean(cfg.criar_oportunidade_auto));
        setAtivo(cfg.ativo !== false);
      } else {
        // Defaults pra primeira configuração da empresa
        setUfsText("MG, SP, GO");
        setPalavrasChave(
          'iluminação pública, construção, "obras elétricas", engenharia, "campos de futebol", "estádios de futebol", telefonia, -informática'
        );
        setCriarAuto(false);
        setAtivo(true);
      }
    } catch (err) {
      console.error("[Licitacoes] erro carregando config:", err);
      toast.error("Erro ao carregar configuração de licitações");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaAtiva?.id]);

  const handleSave = async () => {
    if (!empresaAtiva?.id) return;
    if (ufsArray.length === 0) {
      toast.error("Informe pelo menos um estado (UF).");
      return;
    }
    if (!palavrasChave.trim()) {
      toast.error("Informe ao menos uma palavra-chave.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        empresa_id: empresaAtiva.id,
        ufs: ufsArray,
        palavras_chave: palavrasChave.trim(),
        criar_oportunidade_auto: criarAuto,
        ativo,
      };
      if (config?.id) {
        await sigo.entities.LicitacaoBusca.update(config.id, payload);
      } else {
        const novo = await sigo.entities.LicitacaoBusca.create({
          nome: "Busca padrão",
          ...payload,
        });
        setConfig(novo);
      }
      toast.success("Configuração de licitações salva.");
      loadConfig();
    } catch (err) {
      console.error("[Licitacoes] erro salvando:", err);
      toast.error("Erro ao salvar: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleBuscarAgora = async () => {
    if (!supabase) {
      toast.error("Cliente Supabase indisponível.");
      return;
    }
    setBuscando(true);
    try {
      const { data, error } = await supabase.functions.invoke("buscar-licitacoes", {
        body: {},
      });
      if (error) throw error;
      const resumo = (data?.resumo || []).find((r) => r.empresa_id === empresaAtiva?.id);
      const novas = resumo?.novas ?? 0;
      toast.success(`Busca executada. ${novas} nova(s) licitação(ões) encontrada(s) hoje.`);
      loadConfig();
    } catch (err) {
      console.error("[Licitacoes] erro buscando:", err);
      toast.error("Erro ao buscar: " + (err?.message || err));
    } finally {
      setBuscando(false);
    }
  };

  const fmtData = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pt-BR");
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gavel className="w-5 h-5 text-blue-600" />
            Busca automática de licitações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Estados */}
          <div>
            <Label>Estados (UF)</Label>
            <Input
              className="mt-1.5"
              value={ufsText}
              onChange={(e) => setUfsText(e.target.value)}
              placeholder="MG, SP, GO"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ufsArray.map((uf) => (
                <Badge key={uf} variant="secondary">
                  {uf}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">Separe por vírgula. Ex: MG, SP, GO</p>
          </div>

          {/* Palavras-chave */}
          <div>
            <Label>Palavras-chave</Label>
            <Textarea
              className="mt-1.5 min-h-[110px] font-mono text-sm"
              value={palavrasChave}
              onChange={(e) => setPalavrasChave(e.target.value)}
              placeholder='iluminação pública, "obras elétricas", -informática'
            />
            <div className="text-xs text-slate-500 mt-2 bg-blue-50 border border-blue-100 rounded-lg p-3 flex gap-2">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Sintaxe:</strong> vírgula separa termos (acha qualquer um) ·{" "}
                <code>"entre aspas"</code> = frase exata · <code>-palavra</code> = exclui.
                <br />
                Ex: <code>"obras elétricas"</code> não pega qualquer "obra";{" "}
                <code>-informática</code> remove resultados de informática.
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3 border-t pt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={criarAuto}
                onCheckedChange={(v) => setCriarAuto(Boolean(v))}
                className="mt-0.5"
              />
              <span className="text-sm">
                <strong>Criar oportunidade automaticamente</strong>
                <span className="block text-slate-500">
                  Cada licitação encontrada vira uma Oportunidade no SIGO (entra no calendário) e
                  ganha uma pasta no Drive. Deixe desligado para apenas listar e revisar antes.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={ativo}
                onCheckedChange={(v) => setAtivo(Boolean(v))}
                className="mt-0.5"
              />
              <span className="text-sm">
                <strong>Busca ativa</strong>
                <span className="block text-slate-500">
                  Quando ligado, o robô busca novas licitações todo dia automaticamente.
                </span>
              </span>
            </label>
          </div>

          {/* Status / ações */}
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </Button>
            <Button
              variant="outline"
              onClick={handleBuscarAgora}
              disabled={buscando || !config?.id}
              className="gap-2"
            >
              {buscando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Buscar agora
            </Button>
            <span className="text-xs text-slate-500">
              Última busca: {fmtData(config?.ultima_execucao)}
              {config?.ultima_qtd_novas != null && ` · ${config.ultima_qtd_novas} nova(s)`}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
