import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { KeyRound, Loader2, Copy, MessageCircle, RefreshCw, Power } from "lucide-react";
import { toast } from "sonner";
import { dispararWhatsApp } from "@/lib/whatsapp";
import { acessoPortal, textoCredenciais, statusAcesso } from "@/lib/portal-funcionario-acesso";

const fmtDataHora = (iso) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

/**
 * Login do funcionário no Portal (treinamentos, ciência de entregas,
 * certificados). O RH cria/redefine com senha provisória; a senha pessoal só
 * o funcionário conhece — é o que dá valor de assinatura às confirmações dele.
 */
export default function AcessoPortalCard({ funcionario, empresaAtiva, onMudou }) {
  const [acesso, setAcesso] = useState(undefined); // undefined = carregando; null = sem acesso
  const [credenciais, setCredenciais] = useState(null); // {usuario, senha}
  const [usuarioManual, setUsuarioManual] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = async () => {
    try {
      const r = await acessoPortal.status(empresaAtiva.id);
      setAcesso((r.acessos || []).find((a) => a.funcionario_id === funcionario.id) || null);
    } catch (e) {
      setAcesso(null);
      toast.error(e.message);
    }
  };

  useEffect(() => {
    setCredenciais(null);
    setAcesso(undefined);
    carregar();
  }, [funcionario.id]);

  const executar = async (fn) => {
    setOcupado(true);
    try {
      await fn();
      await carregar();
      onMudou?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const criar = () =>
    executar(async () => {
      const r = await acessoPortal.criar(funcionario.id, usuarioManual.trim());
      setCredenciais({ usuario: r.usuario, senha: r.senha_provisoria });
      toast.success("Acesso criado");
    });

  const redefinir = () => {
    if (
      !window.confirm(
        `Gerar nova senha provisória para ${funcionario.nome_completo}? A senha atual deixa de valer e ele terá de criar outra no próximo acesso.`
      )
    )
      return;
    executar(async () => {
      const r = await acessoPortal.redefinir(funcionario.id);
      setCredenciais({ usuario: r.usuario, senha: r.senha_provisoria });
      toast.success("Senha redefinida");
    });
  };

  const alternarAtivo = () => {
    const desativar = acesso?.ativo;
    if (desativar && !window.confirm("Desativar o acesso? O funcionário sai do portal na hora."))
      return;
    executar(async () => {
      await acessoPortal.ativo(funcionario.id, !desativar);
      toast.success(desativar ? "Acesso desativado" : "Acesso reativado");
    });
  };

  const mensagem =
    credenciais &&
    textoCredenciais({
      nome: funcionario.nome_completo,
      usuario: credenciais.usuario,
      senha: credenciais.senha,
    });

  const enviarWhats = async () => {
    if (!funcionario.telefone) {
      toast.error("Funcionário sem telefone cadastrado — copie a mensagem");
      return;
    }
    const via = await dispararWhatsApp(funcionario.telefone, mensagem);
    if (via === "evolution") toast.success("📲 Acesso enviado pelo WhatsApp");
  };

  const status = statusAcesso(acesso);

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="w-4 h-4 text-slate-600" />
        <span className="font-semibold text-slate-800">Acesso ao Portal do Funcionário</span>
        {acesso === undefined ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        ) : (
          <Badge variant="outline" className={status.classe}>
            {status.rotulo}
          </Badge>
        )}
      </div>

      {acesso && (
        <p className="text-sm text-slate-600">
          Usuário: <span className="font-mono">{acesso.usuario}</span>
          {acesso.ultimo_acesso && ` · último acesso ${fmtDataHora(acesso.ultimo_acesso)}`}
        </p>
      )}

      {acesso === null && (
        <div className="flex flex-wrap items-end gap-2">
          {!funcionario.cpf && (
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs text-slate-500 mb-1">
                Sem CPF no cadastro — informe um usuário:
              </p>
              <Input
                value={usuarioManual}
                onChange={(e) => setUsuarioManual(e.target.value)}
                placeholder="ex.: joao.silva"
                className="h-9"
              />
            </div>
          )}
          <Button
            size="sm"
            onClick={criar}
            disabled={ocupado || (!funcionario.cpf && !usuarioManual.trim())}
          >
            {ocupado ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4 mr-1" />
            )}
            Criar acesso {funcionario.cpf ? "(usuário = CPF)" : ""}
          </Button>
        </div>
      )}

      {acesso && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={redefinir} disabled={ocupado}>
            <RefreshCw className="w-4 h-4 mr-1" /> Redefinir senha
          </Button>
          <Button size="sm" variant="outline" onClick={alternarAtivo} disabled={ocupado}>
            <Power className="w-4 h-4 mr-1" /> {acesso.ativo ? "Desativar" : "Reativar"}
          </Button>
        </div>
      )}

      {credenciais && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
          <p className="text-xs text-amber-800 font-medium">
            Entregue agora — a senha provisória não aparece de novo. No primeiro acesso o
            funcionário cria a senha pessoal dele.
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-xs text-slate-500">Usuário</p>
              <p className="font-mono text-base">{credenciais.usuario}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Senha provisória</p>
              <p className="font-mono text-base tracking-wider">{credenciais.senha}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(mensagem);
                toast.success("Mensagem copiada");
              }}
            >
              <Copy className="w-4 h-4 mr-1" /> Copiar mensagem
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={enviarWhats}>
              <MessageCircle className="w-4 h-4 mr-1" /> Enviar pelo WhatsApp
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
