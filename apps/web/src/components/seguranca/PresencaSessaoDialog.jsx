import React, { useEffect, useMemo, useState } from "react";
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
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  LIMITES_DA_SESSAO,
  RESULTADOS_DA_PRATICA,
  descricaoDaSessao,
  participanteParaGravar,
  sessaoNoFuturo,
} from "@/lib/ead-pratica";

const fmtDia = (dia) => (dia ? String(dia).slice(0, 10).split("-").reverse().join("/") : "—");
const linhaDe = (p) => ({
  presente: p.presente === true,
  resultado: p.resultado || "pendente",
  observacao: p.observacao || "",
});
const mudou = (a, b) =>
  a.presente !== b.presente || a.resultado !== b.resultado || a.observacao !== b.observacao;

/**
 * Presença e resultado de cada participante numa sessão prática (T12). O RH inclui as matrículas do curso,
 * marca quem esteve presente e lança "satisfatório" ou "insatisfatório"; o certificado do semipresencial só sai
 * quando a soma das cargas das sessões já realizadas em que o aluno esteve presente e satisfatório chega à carga
 * prática do curso (uma prática de vários dias vale pela soma dos dias). Quem lançou e quando são
 * gravados pelo banco (migração 0143), não por esta tela.
 *
 * `sessao` = null (fechada). `participantes` são os vivos da sessão; `candidatos`, as matrículas que ainda podem
 * entrar (`matriculasParaASessao`). `onIncluir(matriculas)`, `onSalvarLinhas([{ participante, dados }])` e
 * `onRemover(participante)` gravam (e recarregam) e devolvem true quando deu certo.
 */
export default function PresencaSessaoDialog({
  sessao,
  participantes = [],
  candidatos = [],
  nomeDe,
  hoje,
  onFechar,
  onIncluir,
  onSalvarLinhas,
  onRemover,
}) {
  const [linhas, setLinhas] = useState({});
  const [marcados, setMarcados] = useState(() => new Set());
  const [gravando, setGravando] = useState(false);
  const futura = sessaoNoFuturo(sessao, hoje);

  // o rascunho de cada linha recomeça do que está gravado quando a sessão ou os participantes mudam
  const gravadas = useMemo(
    () => Object.fromEntries(participantes.map((p) => [p.id, linhaDe(p)])),
    [participantes]
  );
  useEffect(() => {
    setLinhas(gravadas);
  }, [gravadas]);
  useEffect(() => {
    setMarcados(new Set());
  }, [sessao?.id]);

  const alteradas = participantes.filter(
    (p) => linhas[p.id] && mudou(linhas[p.id], gravadas[p.id])
  );
  const ordenados = [...participantes].sort((a, b) =>
    String(nomeDe(a.funcionario_id)).localeCompare(String(nomeDe(b.funcionario_id)), "pt-BR")
  );

  const mudar = (id, campo, valor) =>
    setLinhas((atual) => {
      const linha = { ...atual[id], [campo]: valor };
      // ausente não fica "satisfatório" (o banco recusa): o resultado volta a pendente
      if (campo === "presente" && !valor && linha.resultado === "satisfatorio") {
        linha.resultado = "pendente";
      }
      return { ...atual, [id]: linha };
    });

  const salvar = async () => {
    // confere todas as linhas antes de gravar a primeira
    const itens = [];
    for (const p of alteradas) {
      const conferido = participanteParaGravar(linhas[p.id]);
      if (!conferido.ok) {
        toast.error(`${nomeDe(p.funcionario_id)}: ${conferido.erro}`);
        return;
      }
      itens.push({ participante: p, dados: conferido.dados });
    }
    setGravando(true);
    try {
      if (await onSalvarLinhas(itens)) toast.success("Presença e resultados salvos");
    } finally {
      setGravando(false);
    }
  };

  const incluir = async () => {
    const escolhidos = candidatos.filter((c) => marcados.has(c.matricula.id));
    if (!escolhidos.length) return;
    setGravando(true);
    try {
      if (await onIncluir(escolhidos.map((c) => c.matricula))) setMarcados(new Set());
    } finally {
      setGravando(false);
    }
  };

  const alternar = (id) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const fechar = () => {
    if (gravando) return;
    if (alteradas.length) {
      toast.warning("Há presença ou resultado sem salvar.", {
        action: { label: "Fechar sem salvar", onClick: onFechar },
        duration: 8000,
      });
      return;
    }
    onFechar();
  };

  return (
    <Dialog open={!!sessao} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">Presença e resultado da sessão</DialogTitle>
          <DialogDescription>{sessao ? descricaoDaSessao(sessao) : ""}</DialogDescription>
        </DialogHeader>

        {futura && (
          <p role="status" className="text-sm text-amber-800 rounded-md bg-amber-50 p-2">
            A sessão é de {fmtDia(sessao?.data)}: dá para incluir os participantes agora, mas
            presença e resultado só depois que ela acontecer.
          </p>
        )}

        <div className="space-y-2">
          {ordenados.length === 0 && (
            <p className="text-sm text-slate-500">
              Nenhum participante ainda. Inclua abaixo os matriculados no curso.
            </p>
          )}
          {ordenados.map((p) => {
            const linha = linhas[p.id] ?? linhaDe(p);
            const nome = nomeDe(p.funcionario_id);
            return (
              <div
                key={p.id}
                className="grid grid-cols-1 gap-2 rounded-lg border p-2 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">{nome}</p>
                  {p.avaliado_em && (
                    <p className="text-[11px] text-slate-500">
                      Lançado em {fmtDia(String(p.avaliado_em).slice(0, 10))}
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={linha.presente}
                    disabled={futura || gravando}
                    onChange={(e) => mudar(p.id, "presente", e.target.checked)}
                    aria-label={`${nome}: presente`}
                  />
                  Presente
                </label>
                <select
                  className="h-8 rounded border bg-white px-2 text-xs"
                  value={linha.resultado}
                  disabled={futura || gravando}
                  onChange={(e) => mudar(p.id, "resultado", e.target.value)}
                  aria-label={`${nome}: resultado`}
                >
                  {RESULTADOS_DA_PRATICA.map((r) => (
                    <option
                      key={r.valor}
                      value={r.valor}
                      disabled={r.valor === "satisfatorio" && !linha.presente}
                    >
                      {r.rotulo}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={gravando}
                  onClick={() => onRemover(p)}
                  aria-label={`Tirar ${nome} da sessão`}
                  title="Tirar da sessão"
                  className="text-red-500 hover:text-red-700 justify-self-start sm:justify-self-auto"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Input
                  value={linha.observacao}
                  maxLength={LIMITES_DA_SESSAO.observacao_participante}
                  disabled={gravando}
                  onChange={(e) => mudar(p.id, "observacao", e.target.value)}
                  placeholder="Observação (opcional)"
                  aria-label={`${nome}: observação`}
                  className="h-8 text-xs sm:col-span-4"
                />
              </div>
            );
          })}
        </div>

        {candidatos.length > 0 && (
          <div className="rounded-lg border p-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">
                Incluir matriculados no curso ({candidatos.length})
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={gravando}
                onClick={() => setMarcados(new Set(candidatos.map((c) => c.matricula.id)))}
              >
                Marcar todos
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {candidatos.map((c) => (
                <label key={c.matricula.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={marcados.has(c.matricula.id)}
                    disabled={gravando}
                    onChange={() => alternar(c.matricula.id)}
                  />
                  {c.funcionario?.nome_completo || "Funcionário"}
                </label>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={gravando || marcados.size === 0}
              onClick={incluir}
            >
              <UserPlus className="w-4 h-4 mr-1" /> Incluir {marcados.size || ""} na sessão
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={fechar} disabled={gravando}>
            Fechar
          </Button>
          <Button
            type="button"
            onClick={salvar}
            disabled={gravando || alteradas.length === 0}
            className="bg-slate-900 hover:bg-slate-800"
          >
            {gravando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Salvar presença e resultados
            {alteradas.length > 0 ? ` (${alteradas.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
