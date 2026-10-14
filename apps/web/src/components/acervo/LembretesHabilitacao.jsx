import React, { useEffect, useMemo, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { lerConfig, validarConfig } from "@/lib/habilitacao-lembretes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";

/**
 * Cartão "Lembretes de vencimento" da aba Documentos e certidões: quantos dias antes o SIGO avisa
 * (sino e, se ligado, WhatsApp), quem recebe e se o WhatsApp está ligado. Grava em habilitacao_config
 * (migração 0155, uma linha por empresa); quem avisa é o cron diário do banco.
 * podeEditar=false (padrão) → só leitura: sem alterar nem salvar.
 * Se a leitura falha (a tabela só existe depois da 0155), o cartão não aparece.
 */
export default function LembretesHabilitacao({ empresaId, podeEditar = false }) {
  const [estado, setEstado] = useState("carregando"); // carregando | indisponivel | pronto
  const [linha, setLinha] = useState(null); // a linha de habilitacao_config, ou null (nada gravado ainda)
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState(() => lerConfig(null));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!empresaId) return undefined;
    let ativo = true;
    setEstado("carregando");
    (async () => {
      try {
        const [linhas, vinculos] = await Promise.all([
          sigo.entities.HabilitacaoConfig.filter({ empresa_id: empresaId }, { limit: 1 }),
          sigo.entities.UsuarioEmpresa.filter(
            { empresa_id: empresaId, ativo: true },
            { sort_by: "nome_completo" }
          ),
        ]);
        if (!ativo) return;
        const atual = linhas?.[0] || null;
        setLinha(atual);
        setUsuarios(vinculos || []);
        setForm(lerConfig(atual));
        setEstado("pronto");
      } catch (e) {
        console.error("[Habilitação] lembretes:", e);
        if (ativo) setEstado("indisponivel");
      }
    })();
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  // Os usuários ativos da empresa, mais os e-mails já gravados que a lista não traz (usuário desligado,
  // ou que quem está na tela não enxerga): ficam marcados em vez de sumirem sem querer no próximo salvar.
  const candidatos = useMemo(() => {
    const porEmail = new Map();
    for (const u of usuarios) {
      const email = String(u?.usuario_email ?? "")
        .trim()
        .toLowerCase();
      if (!email || porEmail.has(email)) continue;
      porEmail.set(email, {
        email,
        nome: u.nome_completo || u.usuario_email,
        aviso: String(u.telefone ?? "").trim() ? null : "sem telefone para o WhatsApp",
      });
    }
    for (const email of lerConfig(linha).destinatarios) {
      if (!porEmail.has(email)) {
        porEmail.set(email, { email, nome: email, aviso: "não aparece entre os usuários ativos" });
      }
    }
    return [...porEmail.values()];
  }, [usuarios, linha]);

  if (estado !== "pronto") return null;

  const bloqueado = !podeEditar || salvando;
  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const alternar = (email, marcado) =>
    setForm((f) => ({
      ...f,
      destinatarios: marcado
        ? [...new Set([...f.destinatarios, email])]
        : f.destinatarios.filter((e) => e !== email),
    }));
  const conferido = validarConfig(form, []);
  const dias = conferido.ok ? conferido.dados.dias_antecedencia : null;

  const salvar = async () => {
    if (!podeEditar || salvando) return;
    const { ok, erros, dados } = validarConfig(
      form,
      candidatos.map((c) => ({ usuario_email: c.email }))
    );
    if (!ok) {
      toast.error(erros[0]);
      return;
    }
    setSalvando(true);
    try {
      const gravada = linha?.id
        ? await sigo.entities.HabilitacaoConfig.update(linha.id, dados)
        : await sigo.entities.HabilitacaoConfig.create({ ...dados, empresa_id: empresaId });
      setLinha(gravada);
      setForm(lerConfig(gravada));
      toast.success("Lembretes salvos");
    } catch (e) {
      console.error("[Habilitação] salvar lembretes:", e);
      toast.error("Erro ao salvar" + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-amber-600" /> Lembretes de vencimento
        </CardTitle>
        <CardDescription>
          O SIGO avisa no sino {dias ?? "N"} dias antes do vencimento, 3 dias antes e no dia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <Label htmlFor="lembretes-dias" className="text-sm font-normal">
            Avisar com antecedência de
          </Label>
          <Input
            id="lembretes-dias"
            inputMode="numeric"
            maxLength={2}
            className="h-9 w-16 text-center"
            value={form.dias_antecedencia}
            disabled={bloqueado}
            onChange={(e) => set("dias_antecedencia", e.target.value.replace(/\D/g, ""))}
          />
          <span>dias</span>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Quem recebe</p>
          {candidatos.length > 0 && (
            <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {candidatos.map((c) => (
                <li key={c.email}>
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <Checkbox
                      className="mt-0.5"
                      checked={form.destinatarios.includes(c.email)}
                      disabled={bloqueado}
                      onCheckedChange={(v) => alternar(c.email, v === true)}
                    />
                    <span className="min-w-0 break-words">
                      {c.nome}
                      {c.aviso && <span className="block text-xs text-slate-400">{c.aviso}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {form.destinatarios.length === 0 && (
            <p className="text-xs text-slate-500">
              Ninguém escolhido: recebem os donos e os Admins.
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox
            checked={form.whatsapp}
            disabled={bloqueado}
            onCheckedChange={(v) => set("whatsapp", v === true)}
          />
          Avisar também por WhatsApp
        </label>

        {podeEditar && (
          <div className="flex justify-end">
            <Button
              className="bg-amber-500 hover:bg-amber-600"
              disabled={salvando}
              onClick={salvar}
            >
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {salvando ? "Salvando..." : "Salvar lembretes"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
