import React, { useEffect, useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

/**
 * Janela que pede um texto (o motivo de uma ação) no lugar de `window.prompt`, no padrão do
 * `ConfirmarDialog` da T37. Quem chama guarda o estado `aberto` e `enviando`:
 *
 *   <PedirMotivoDialog
 *     aberto={pedindo}
 *     titulo="Revogar o certificado?"
 *     texto="..."
 *     rotulo="Motivo da revogação"
 *     validar={validarMotivoRevogacao}      // (texto) => { ok: true, motivo } | { ok: false, erro }
 *     maximo={300}
 *     rotuloConfirmar="Revogar"
 *     destrutivo
 *     enviando={revogando}
 *     onConfirmar={(motivo) => revogar(motivo)}
 *     onCancelar={() => setPedindo(false)}
 *   />
 *
 * O texto digitado só vai a `onConfirmar` depois de passar na `validar` (o erro aparece na janela, que
 * continua aberta). Enquanto `enviando`, Esc, clicar fora e Cancelar não fecham: a ação está a caminho.
 * A janela é limpa a cada abertura. Se `onConfirmar` falhar, quem chama mantém `aberto` e o texto fica.
 */
export default function PedirMotivoDialog({
  aberto,
  titulo,
  texto,
  rotulo = "Motivo",
  validar,
  maximo,
  rotuloConfirmar = "Confirmar",
  destrutivo = false,
  enviando = false,
  onConfirmar,
  onCancelar,
}) {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState("");
  const idCampo = useId();
  const idErro = `${idCampo}-erro`;

  // cada abertura começa em branco (o texto de uma ação anterior não vaza para a próxima)
  useEffect(() => {
    if (aberto) {
      setValor("");
      setErro("");
    }
  }, [aberto]);

  const confirmar = (e) => {
    e.preventDefault();
    if (enviando) return;
    const r = validar ? validar(valor) : { ok: true, motivo: valor.trim() };
    if (!r.ok) {
      setErro(r.erro || "Confira o texto");
      return;
    }
    setErro("");
    onConfirmar(r.motivo);
  };

  return (
    <Dialog open={!!aberto} onOpenChange={(v) => !v && !enviando && onCancelar()}>
      <DialogContent className="max-w-md">
        <form onSubmit={confirmar} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="pr-6 leading-snug">{titulo}</DialogTitle>
            {texto && (
              <DialogDescription className="whitespace-pre-line">{texto}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={idCampo}>{rotulo}</Label>
            <Textarea
              id={idCampo}
              rows={3}
              value={valor}
              maxLength={maximo}
              disabled={enviando}
              aria-invalid={!!erro}
              aria-describedby={erro ? idErro : undefined}
              onChange={(e) => {
                setValor(e.target.value);
                if (erro) setErro("");
              }}
            />
            <div className="flex items-start justify-between gap-2 text-xs">
              <p id={idErro} role="alert" className="text-red-600">
                {erro}
              </p>
              {maximo ? (
                <span className="shrink-0 text-slate-400">
                  {valor.length}/{maximo}
                </span>
              ) : null}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={enviando} onClick={onCancelar}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant={destrutivo ? "destructive" : "default"}
              disabled={enviando}
            >
              {enviando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {rotuloConfirmar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
