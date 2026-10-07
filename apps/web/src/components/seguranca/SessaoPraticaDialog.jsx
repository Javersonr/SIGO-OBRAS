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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  LIMITES_DA_SESSAO,
  avisoDaCargaDaSessao,
  sessaoEmBranco,
  validarSessao,
} from "@/lib/ead-pratica";

const horaCurta = (hora) => (typeof hora === "string" ? hora.slice(0, 5) : "");

/** O formulário a partir da sessão gravada (edição) ou em branco, com os padrões do curso (nova). */
function formularioDe(pedido, curso, hoje) {
  const s = pedido?.sessao;
  if (!s) return sessaoEmBranco(curso, hoje);
  return {
    data: s.data || "",
    hora_inicio: horaCurta(s.hora_inicio),
    hora_fim: horaCurta(s.hora_fim),
    carga_horas: s.carga_horas != null ? String(s.carga_horas) : "",
    local: s.local || "",
    instrutor_nome: s.instrutor_nome || "",
    instrutor_qualificacao: s.instrutor_qualificacao || "",
    observacoes: s.observacoes || "",
  };
}

/**
 * Janela da sessão prática presencial (T12): criar ou editar a data, o horário, a carga, o local e o instrutor
 * reais. Substitui os `prompt()` da lista de presença antiga (data do 1º dia e nome do instrutor): a lista agora
 * sai da sessão gravada. `pedido` = null (fechada) ou `{ sessao? }` (sem sessão = nova). `onSalvar(dados)` grava e
 * devolve true quando deu certo; a janela fecha sozinha.
 */
export default function SessaoPraticaDialog({ pedido, curso, hoje, onFechar, onSalvar }) {
  const [form, setForm] = useState(() => formularioDe(pedido, curso, hoje));
  const [salvando, setSalvando] = useState(false);

  // cada abertura começa do que está gravado (ou dos padrões do curso), nunca do rascunho da anterior
  useEffect(() => {
    if (pedido) setForm(formularioDe(pedido, curso, hoje));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);

  const campo = (nome) => (e) => setForm((atual) => ({ ...atual, [nome]: e.target.value }));
  const aviso = avisoDaCargaDaSessao(
    { carga_horas: Number(String(form.carga_horas).replace(",", ".")) },
    curso
  );

  const salvar = async (e) => {
    e.preventDefault();
    const conferido = validarSessao(form);
    if (!conferido.ok) {
      toast.error(conferido.erro);
      return;
    }
    setSalvando(true);
    try {
      if (await onSalvar(conferido.dados)) onFechar();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!pedido} onOpenChange={(aberto) => !aberto && !salvando && onFechar()}>
      <DialogContent className="max-w-lg">
        <form onSubmit={salvar} className="space-y-3">
          <DialogHeader>
            <DialogTitle className="pr-6 leading-snug">
              {pedido?.sessao ? "Editar sessão prática" : "Nova sessão prática presencial"}
            </DialogTitle>
            <DialogDescription>
              Data, horário, local e instrutor reais da parte prática. Eles saem na lista de
              presença e, para quem tiver resultado satisfatório, no certificado (o certificado já
              emitido não muda).
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2">
              <Label htmlFor="sessao-data" className="text-xs">
                Data
              </Label>
              <Input
                id="sessao-data"
                type="date"
                value={form.data}
                onChange={campo("data")}
                className="mt-0.5"
                required
              />
            </div>
            <div>
              <Label htmlFor="sessao-inicio" className="text-xs">
                Início
              </Label>
              <Input
                id="sessao-inicio"
                type="time"
                value={form.hora_inicio}
                onChange={campo("hora_inicio")}
                className="mt-0.5"
                required
              />
            </div>
            <div>
              <Label htmlFor="sessao-fim" className="text-xs">
                Fim
              </Label>
              <Input
                id="sessao-fim"
                type="time"
                value={form.hora_fim}
                onChange={campo("hora_fim")}
                className="mt-0.5"
                required
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="sessao-carga" className="text-xs">
                Carga desta sessão (h)
              </Label>
              <Input
                id="sessao-carga"
                inputMode="decimal"
                value={form.carga_horas}
                onChange={campo("carga_horas")}
                placeholder="Ex.: 8"
                className="mt-0.5"
                required
              />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <Label htmlFor="sessao-local" className="text-xs">
                Local
              </Label>
              <Input
                id="sessao-local"
                value={form.local}
                onChange={campo("local")}
                maxLength={LIMITES_DA_SESSAO.local}
                placeholder="Ex.: Pátio de treinamento, endereço e cidade"
                className="mt-0.5"
                required
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="sessao-instrutor" className="text-xs">
                Instrutor
              </Label>
              <Input
                id="sessao-instrutor"
                value={form.instrutor_nome}
                onChange={campo("instrutor_nome")}
                maxLength={LIMITES_DA_SESSAO.instrutor_nome}
                className="mt-0.5"
                required
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="sessao-qualificacao" className="text-xs">
                Qualificação do instrutor
              </Label>
              <Input
                id="sessao-qualificacao"
                value={form.instrutor_qualificacao}
                onChange={campo("instrutor_qualificacao")}
                maxLength={LIMITES_DA_SESSAO.instrutor_qualificacao}
                placeholder="Ex.: Eng. eletricista, registro"
                className="mt-0.5"
              />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <Label htmlFor="sessao-observacoes" className="text-xs">
                Observações (opcional)
              </Label>
              <Textarea
                id="sessao-observacoes"
                value={form.observacoes}
                onChange={campo("observacoes")}
                maxLength={LIMITES_DA_SESSAO.observacoes}
                rows={2}
                className="mt-0.5"
              />
            </div>
          </div>
          {aviso && (
            <p role="status" className="text-xs text-amber-700">
              {aviso}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando} className="bg-slate-900 hover:bg-slate-800">
              {salvando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Salvar sessão
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
