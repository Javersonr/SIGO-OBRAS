import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { criarConfirmacoes } from "@/lib/confirmacao";

/**
 * Janela de confirmação no lugar de `window.confirm`.
 *
 *   const [confirmar, dialogoConfirmar] = useConfirmar();
 *   ...
 *   if (!(await confirmar({ titulo: "Remover a aula?", texto: "...", rotuloConfirmar: "Remover",
 *                           destrutivo: true }))) return;
 *   ...
 *   return <div>... {dialogoConfirmar}</div>;
 *
 * `texto` aceita quebras de linha (linha em branco separa parágrafos). Cancelar, Esc e clicar fora
 * respondem "não". A lógica da promessa está em `lib/confirmacao.js` (com teste).
 */
export function ConfirmarDialog({ pedido, onResponder }) {
  // no fechamento o pedido já é null; guarda o último para o texto não sumir durante a animação
  const ultimoRef = useRef(pedido);
  if (pedido) ultimoRef.current = pedido;
  const exibido = pedido || ultimoRef.current;

  return (
    <Dialog open={!!pedido} onOpenChange={(aberto) => !aberto && onResponder(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">{exibido?.titulo || "Confirmar"}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{exibido?.texto}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onResponder(false)}>
            {exibido?.rotuloCancelar || "Cancelar"}
          </Button>
          <Button
            type="button"
            variant={exibido?.destrutivo ? "destructive" : "default"}
            onClick={() => onResponder(true)}
          >
            {exibido?.rotuloConfirmar || "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Devolve `[confirmar, dialogo]`: `confirmar(config)` → Promise<boolean>; `dialogo` vai no JSX. */
export function useConfirmar() {
  const [pedido, setPedido] = useState(null);
  const confirmacoesRef = useRef(null);
  if (!confirmacoesRef.current) confirmacoesRef.current = criarConfirmacoes(setPedido);
  const confirmacoes = confirmacoesRef.current;

  // tela desmontada com um pedido aberto: a promessa resolve `false` e a ação não acontece
  useEffect(() => () => confirmacoes.descartar(), [confirmacoes]);

  const confirmar = useCallback((config) => confirmacoes.pedir(config), [confirmacoes]);
  const responder = useCallback((resposta) => confirmacoes.responder(resposta), [confirmacoes]);

  return [confirmar, <ConfirmarDialog pedido={pedido} onResponder={responder} />];
}
