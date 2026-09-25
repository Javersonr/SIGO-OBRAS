import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Banknote,
  FileWarning,
  Info,
  Trophy,
  Users,
  FileText,
  Clock,
  Ban,
} from "lucide-react";
import {
  calcularResumo,
  fmtMoeda,
  fmtNumero,
  labelCategoria,
  localDocumento,
  rotuloDocumento,
  semExecucao,
  statusValidade,
  TIPOS_DOC,
} from "./acervo-utils";
import { Aviso, TipoDocBadge } from "./AcervoUi";

/** Link para o documento do teto (abre a aba Documentos já expandida nele). */
function DocTeto({ teto, onAbrir }) {
  if (!teto?.atestado) return <span className="text-slate-400">—</span>;
  const a = teto.atestado;
  return (
    <button
      type="button"
      onClick={() => onAbrir?.(a.id)}
      className="group inline-flex min-w-0 max-w-full items-center gap-1.5 text-left"
      title={`Abrir ${rotuloDocumento(a)}`}
    >
      <TipoDocBadge tipo={a.tipo} />
      <span className="truncate text-slate-700 group-hover:text-amber-700 group-hover:underline">
        {a.numero ? `nº ${a.numero}` : "s/ nº"}
        {localDocumento(a) ? ` · ${localDocumento(a)}` : ""}
      </span>
    </button>
  );
}

export default function ResumoAcervo({
  atestados,
  quantitativos,
  perfil,
  profissionais,
  onIrPara,
  onAbrirDocumento,
}) {
  const resumo = useMemo(
    () => calcularResumo(atestados, quantitativos),
    [atestados, quantitativos]
  );

  const contagem = useMemo(() => {
    const porTipo = Object.fromEntries(TIPOS_DOC.map((t) => [t.id, 0]));
    let semExec = 0;
    let andamento = 0;
    let comRiscos = 0;
    let semPdf = 0;
    for (const a of atestados) {
      porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
      if (semExecucao(a)) semExec++;
      if (a.situacao === "em_andamento") andamento++;
      if (String(a.riscos || "").trim()) comRiscos++;
      if (!a.arquivo_ref) semPdf++;
    }
    return { porTipo, semExec, andamento, comRiscos, semPdf };
  }, [atestados]);

  const alertas = Array.isArray(perfil?.alertas) ? perfil.alertas.filter(Boolean) : [];

  // certidões / cadastros vencidos ou vencendo em até 30 dias
  const validades = useMemo(() => {
    const out = [];
    for (const c of Array.isArray(perfil?.certidoes) ? perfil.certidoes : []) {
      const s = statusValidade(c?.validade);
      if (s && s.status !== "ok") out.push({ nome: c.tipo || c.numero || "Certidão", ...s });
    }
    for (const c of Array.isArray(perfil?.cadastros) ? perfil.cadastros : []) {
      const s = statusValidade(c?.validade);
      if (s && s.status !== "ok") out.push({ nome: c.orgao || "Cadastro", ...s });
      for (const g of Array.isArray(c?.grupos) ? c.grupos : []) {
        const sg = statusValidade(g?.validade);
        if (sg && sg.status !== "ok") {
          out.push({ nome: `${c.orgao || "Cadastro"} — grupo ${g.codigo || g.descricao}`, ...sg });
        }
      }
    }
    return out.sort((a, b) => a.dias - b.dias);
  }, [perfil]);

  const rtsAtivos = profissionais.filter((p) => p.ativo !== false).length;

  return (
    <div className="space-y-6">
      {/* Alertas do perfil — a IA cita em toda análise */}
      {alertas.length > 0 && (
        <Aviso
          cor="amber"
          icon={AlertTriangle}
          titulo={`Alertas desta empresa (${alertas.length}) — citados em toda análise de edital`}
        >
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {alertas.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Aviso>
      )}
      {!perfil && (
        <Aviso cor="slate" icon={Info}>
          Perfil econômico-financeiro ainda não cadastrado (capital, PL, índices, certidões e
          alertas).{" "}
          <button
            type="button"
            className="font-medium text-amber-700 underline"
            onClick={() => onIrPara?.("perfil")}
          >
            Criar perfil
          </button>
        </Aviso>
      )}
      {validades.length > 0 && (
        <Aviso
          cor={validades.some((v) => v.status === "vencida") ? "red" : "amber"}
          icon={Clock}
          titulo="Validades a providenciar"
        >
          <ul className="mt-1 space-y-0.5">
            {validades.map((v, i) => (
              <li key={i}>
                <span className="font-medium">{v.nome}</span> — {v.texto}
              </li>
            ))}
          </ul>
        </Aviso>
      )}

      {/* Totais (sínteses de CAT + atestado) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Totais do acervo operacional</h2>
          <p className="text-xs text-slate-500">
            Soma das linhas de síntese de {resumo.documentos} documento(s) (CAT + atestado). CAO e
            CAT profissional ficam fora para não contar a mesma obra duas vezes.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-amber-200 bg-amber-50/60 sm:col-span-2 xl:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-800">
                <Banknote className="h-4 w-4" /> Valor somado dos contratos
              </div>
              <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                {fmtMoeda(resumo.valorTotal)}
              </p>
              {resumo.semValor > 0 && (
                <p className="mt-1 text-xs text-amber-800">
                  {resumo.semValor} documento(s) sem valor informado
                </p>
              )}
            </CardContent>
          </Card>
          {resumo.cards.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {c.titulo}
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                  {fmtNumero(c.total)}{" "}
                  <span className="text-sm font-medium text-slate-500">{c.unidade}</span>
                </p>
                {c.outras.length > 0 && (
                  <p className="text-xs text-amber-700">
                    + {c.outras.map((o) => `${fmtNumero(o.quantidade)} ${o.unidade}`).join(", ")} em
                    outra unidade (fora do total)
                  </p>
                )}
                {c.teto && (
                  <p className="mt-1 truncate text-xs text-slate-500">
                    Maior obra: {fmtNumero(c.teto.quantidade)} {c.unidade}
                    {c.tetoCat && ` (só CAT: ${fmtNumero(c.tetoCat.quantidade)})`}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Tetos por obra única */}
      <section className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <Trophy className="h-5 w-5 text-amber-500" /> Tetos por obra única
          </h2>
          <p className="text-xs text-slate-500">
            Maior quantidade num só documento — é o que vale quando o edital exige atestado único
            (sem somatório). Clique no documento para abrir.
          </p>
        </div>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Categoria</th>
                  <th className="px-3 py-2 text-right font-medium">Maior obra</th>
                  <th className="px-3 py-2 font-medium">Documento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-3 py-2 font-medium text-slate-700">Valor do contrato</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoeda(resumo.tetoValor?.valor)}
                    {resumo.tetoValorCat && (
                      <div className="text-xs text-slate-500">
                        só CAT: {fmtMoeda(resumo.tetoValorCat.valor)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <DocTeto teto={resumo.tetoValor} onAbrir={onAbrirDocumento} />
                    {resumo.tetoValorCat && (
                      <div className="mt-1">
                        <DocTeto teto={resumo.tetoValorCat} onAbrir={onAbrirDocumento} />
                      </div>
                    )}
                  </td>
                </tr>
                {[
                  ...resumo.cards.map((c) => ({ ...c, rotulo: c.titulo })),
                  ...resumo.demais.map((d) => ({
                    ...d,
                    id: `${d.categoria}|${d.unidade}`,
                    rotulo: labelCategoria(d.categoria),
                  })),
                ]
                  .filter((l) => l.teto)
                  .map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 text-slate-700">{l.rotulo}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtNumero(l.teto.quantidade)} {l.unidade}
                        {l.tetoCat && (
                          <div className="text-xs text-slate-500">
                            só CAT: {fmtNumero(l.tetoCat.quantidade)} {l.unidade}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <DocTeto teto={l.teto} onAbrir={onAbrirDocumento} />
                        {l.tetoCat && (
                          <div className="mt-1">
                            <DocTeto teto={l.tetoCat} onAbrir={onAbrirDocumento} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Demais totais (sínteses fora dos cards) */}
      {resumo.demais.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700">Outros totais (sínteses)</h3>
          <div className="flex flex-wrap gap-2">
            {resumo.demais.map((d) => (
              <span
                key={`${d.categoria}|${d.unidade}`}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              >
                {labelCategoria(d.categoria)}:{" "}
                <strong className="tabular-nums">
                  {fmtNumero(d.total)} {d.unidade}
                </strong>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Composição do acervo */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <FileText className="h-3.5 w-3.5" /> Documentos
            </p>
            <p className="text-xl font-bold text-slate-800">{atestados.length}</p>
            <p className="text-[11px] text-slate-500">
              {TIPOS_DOC.filter((t) => contagem.porTipo[t.id])
                .map((t) => `${contagem.porTipo[t.id]} ${t.label}`)
                .join(" · ") || "nenhum"}
            </p>
          </CardContent>
        </Card>
        <Card className={contagem.semExec ? "border-red-200" : ""}>
          <CardContent className="p-3">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Ban className="h-3.5 w-3.5" /> Sem execução na ART
            </p>
            <p className="text-xl font-bold text-slate-800">{contagem.semExec}</p>
            <p className="text-[11px] text-slate-500">não comprovam execução de obra</p>
          </CardContent>
        </Card>
        <Card className={contagem.andamento || contagem.comRiscos ? "border-amber-200" : ""}>
          <CardContent className="p-3">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <FileWarning className="h-3.5 w-3.5" /> Riscos / em andamento
            </p>
            <p className="text-xl font-bold text-slate-800">
              {contagem.comRiscos}{" "}
              <span className="text-sm font-medium text-slate-500">/ {contagem.andamento}</span>
            </p>
            <p className="text-[11px] text-slate-500">{contagem.semPdf} sem PDF anexado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Users className="h-3.5 w-3.5" /> Quadro técnico
            </p>
            <p className="text-xl font-bold text-slate-800">{rtsAtivos}</p>
            <Button
              variant="link"
              className="h-auto p-0 text-[11px] text-amber-700"
              onClick={() => onIrPara?.("quadro")}
            >
              ver profissionais
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
