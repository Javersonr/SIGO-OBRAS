import React, { useEffect, useMemo, useState } from "react";
import { sigo, supabase } from "@/api/sigoClient";
import {
  candidatosDeLembrete,
  ehConfigDuplicada,
  lerConfig,
  validarConfig,
} from "@/lib/habilitacao-lembretes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";

/** A linha viva de habilitacao_config da empresa, ou null (nada gravado ainda). */
async function lerLinha(empresaId) {
  const linhas = await sigo.entities.HabilitacaoConfig.filter(
    { empresa_id: empresaId },
    { limit: 1 }
  );
  return linhas?.[0] || null;
}

/**
 * Os usuários ativos da empresa do token (e-mail, nome e se têm telefone), pela RPC
 * habilitacao_usuarios_da_empresa (0160). Não dá para ler usuario_empresa direto: a RLS só deixa o
 * usuário comum ver os próprios vínculos. A RPC exige Oportunidades → Lista → editar.
 */
async function listarUsuarios() {
  if (!supabase) throw new Error("Sem conexão com o servidor");
  const { data, error } = await supabase.rpc("habilitacao_usuarios_da_empresa");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * Cartão "Lembretes de vencimento" da aba Documentos e certidões: quantos dias antes o SIGO avisa
 * (sino e, se ligado, WhatsApp), quem recebe e se o WhatsApp está ligado. Grava em habilitacao_config
 * (migração 0160, uma linha por empresa); quem avisa é o cron diário do banco.
 * podeEditar=false (padrão) → só leitura: sem alterar nem salvar, e sem a lista de usuários (a RPC é
 * de quem edita): aparecem só os e-mails já escolhidos.
 * Se a leitura falha (a tabela e a RPC só existem depois da 0160), o cartão não aparece.
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
        const [atual, lista] = await Promise.all([
          lerLinha(empresaId),
          podeEditar ? listarUsuarios() : [],
        ]);
        if (!ativo) return;
        setLinha(atual);
        setUsuarios(lista);
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
  }, [empresaId, podeEditar]);

  // Os usuários ativos da empresa, mais os e-mails já gravados que a lista não traz (ficam marcados em
  // vez de sumirem sem querer no próximo salvar). Quem só lê não tem a lista: vê só os gravados.
  const candidatos = useMemo(
    () =>
      candidatosDeLembrete(usuarios, lerConfig(linha).destinatarios, {
        listaCarregada: podeEditar,
      }),
    [usuarios, linha, podeEditar]
  );

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

  const gravar = async (dados) => {
    if (linha?.id) return sigo.entities.HabilitacaoConfig.update(linha.id, dados);
    try {
      return await sigo.entities.HabilitacaoConfig.create({ ...dados, empresa_id: empresaId });
    } catch (e) {
      // outra pessoa criou a configuração da empresa neste meio-tempo (uma linha viva por empresa):
      // recarrega a linha dela e grava por cima
      if (!ehConfigDuplicada(e)) throw e;
      const atual = await lerLinha(empresaId);
      if (!atual?.id) throw e;
      return sigo.entities.HabilitacaoConfig.update(atual.id, dados);
    }
  };

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
      const gravada = await gravar(dados);
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
          <p className="text-xs text-slate-500">
            {form.destinatarios.length > 0
              ? "Só os marcados recebem."
              : "Ninguém escolhido: recebem os donos e os Admins."}
          </p>
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
