import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { copiarTexto } from "@/lib/whatsapp";
import { textoDoDialogoDeAviso } from "@/lib/ead-aviso-matricula";

/**
 * Janela que aparece depois de avisar um funcionário pelo WhatsApp quando há o que o RH precisa ver (T22):
 * a senha provisória recém-criada, mostrada UMA vez, ou a mensagem que não saiu (sem telefone, telefone
 * inválido). A mensagem só vai para a área de transferência se o RH clicar em "Copiar mensagem": antes a
 * tela a copiava sempre, com a senha dentro, mesmo quando o aviso já tinha ido pelo WhatsApp.
 *
 * `aviso` = null (fechada) ou `{ nome, usuario, senha, texto, situacao, temSenha }`. Quem usa guarda o
 * estado e o zera em `onFechar`: a senha não fica em nenhum outro lugar da tela.
 */
export default function AvisoAcessoDialog({ aviso, onFechar }) {
  // no fechamento o aviso já é null; guarda o último para o texto não sumir durante a animação
  const [ultimo, setUltimo] = useState(aviso);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (aviso) {
      setUltimo(aviso);
      setCopiado(false);
    }
  }, [aviso]);
  // fechada de vez: a senha sai da memória da janela também
  useEffect(() => {
    if (aviso) return undefined;
    const t = setTimeout(() => setUltimo(null), 400);
    return () => clearTimeout(t);
  }, [aviso]);

  const exibido = aviso || ultimo;

  const copiar = async () => {
    if (await copiarTexto(exibido?.texto || "")) {
      setCopiado(true);
      toast.success("Mensagem copiada");
    } else {
      toast.error("O navegador não deixou copiar. Selecione o texto da mensagem abaixo e copie.");
    }
  };

  return (
    <Dialog open={!!aviso} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6 leading-snug">
            {exibido?.temSenha && <KeyRound className="h-4 w-4 shrink-0 text-slate-600" />}
            {exibido?.temSenha
              ? `Acesso criado para ${exibido?.nome || "o funcionário"}`
              : `Mensagem para ${exibido?.nome || "o funcionário"}`}
          </DialogTitle>
          <DialogDescription>
            {textoDoDialogoDeAviso({ situacao: exibido?.situacao, temSenha: exibido?.temSenha })}
          </DialogDescription>
        </DialogHeader>

        {exibido?.temSenha && (
          <div className="rounded-lg border bg-slate-50 p-3 text-sm">
            <p>
              Usuário: <span className="font-mono font-semibold">{exibido.usuario}</span>
            </p>
            <p className="mt-1">
              Senha provisória:{" "}
              <span className="select-all font-mono text-base font-semibold">{exibido.senha}</span>
            </p>
          </div>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">Ver a mensagem</summary>
          <textarea
            readOnly
            aria-label="Texto da mensagem"
            className="mt-2 h-40 w-full select-text rounded-md border border-slate-200 bg-white p-2 text-xs"
            value={exibido?.texto || ""}
            onFocus={(e) => e.target.select()}
          />
        </details>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={copiar}>
            <Copy className="mr-1 h-4 w-4" />
            {copiado ? "Mensagem copiada" : "Copiar mensagem"}
          </Button>
          <Button type="button" onClick={onFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
