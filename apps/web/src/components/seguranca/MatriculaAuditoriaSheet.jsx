import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileDown, Download, Award, Ban, Plus } from "lucide-react";
import { toast } from "sonner";
import { baixarCertificadoPdf } from "@/lib/certificado-ead";
import { logoParaPdf } from "@/lib/pdf-empresa";

// tabelas só de inclusão (sem deleted_at): o SDK precisa de includeDeleted
const SEM_SOFT_DELETE = { includeDeleted: true };

const ROTULO_EVENTO = {
  login: "Entrou no portal",
  login_falha: "Senha errada no login",
  logout: "Saiu do portal",
  troca_senha: "Trocou a senha",
  acesso_criado: "Acesso criado pelo RH",
  senha_redefinida: "Senha redefinida pelo RH",
  acesso_desativado: "Acesso desativado pelo RH",
  acesso_reativado: "Acesso reativado pelo RH",
  abrir_curso: "Abriu o curso",
  abrir_aula: "Abriu a aula",
  play: "Iniciou o vídeo",
  pausa: "Pausou",
  fim_video: "Terminou o vídeo",
  aba_oculta: "Saiu da tela (tempo parado)",
  aba_visivel: "Voltou à tela",
  progresso_ajustado: "Tempo informado acima do real — ajustado pelo servidor",
  aula_concluida: "Concluiu a aula",
  avaliacao_inicio: "Abriu a avaliação",
  avaliacao_envio: "Enviou a avaliação",
  curso_concluido: "Concluiu o curso",
  certificado_assinado: "Assinou o certificado",
  abrir_certificado: "Baixou o certificado",
  abrir_projeto: "Abriu o projeto pedagógico",
  duvida_enviada: "Enviou dúvida ao tutor",
  ciencia: "Deu ciência de entrega",
};

const fmtDataHora = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "—";
const fmtTempo = (s) => {
  const t = Math.floor(s || 0);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min ${t % 60}s`;
};

function descreverDetalhe(e) {
  const d = e.detalhe || {};
  if (e.evento === "avaliacao_envio")
    return `tentativa ${d.tentativa} · nota ${d.nota}% · ${d.aprovada ? "aprovado" : "reprovado"}`;
  if (e.evento === "progresso_ajustado") return `pediu +${d.pedido}s, aceito +${d.aceito}s`;
  if (e.evento === "login_falha")
    return d.bloqueou ? "acesso bloqueado por 15 min" : `tentativa ${d.tentativa}`;
  if (e.evento === "aula_concluida") return `${fmtTempo(d.segundos)} assistidos`;
  if (e.evento === "certificado_assinado") return `código ${d.codigo}`;
  if (d.por) return `por ${d.por}`;
  return "";
}

/**
 * Trilha de auditoria de uma matrícula EAD — o que se mostra à fiscalização:
 * tempo por aula, cada tentativa da prova, todos os acessos (data/hora do
 * servidor, IP, aparelho), certificado e assinatura.
 */
export default function MatriculaAuditoriaSheet({
  matricula,
  curso,
  funcionario,
  aulas,
  empresaAtiva,
  user,
  onClose,
  onMudou,
}) {
  const [carregando, setCarregando] = useState(true);
  const [progresso, setProgresso] = useState([]);
  const [tentativas, setTentativas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [certificado, setCertificado] = useState(null);

  const carregar = async () => {
    setCarregando(true);
    try {
      const [ps, ts, evs, certs] = await Promise.all([
        sigo.entities.TreinamentoProgresso.filter({ matricula_id: matricula.id }, SEM_SOFT_DELETE),
        sigo.entities.TreinamentoTentativa.filter({ matricula_id: matricula.id }, SEM_SOFT_DELETE),
        sigo.entities.TreinamentoEvento.filter(
          { funcionario_id: matricula.funcionario_id },
          SEM_SOFT_DELETE
        ),
        sigo.entities.TreinamentoCertificado.filter(
          { matricula_id: matricula.id },
          SEM_SOFT_DELETE
        ),
      ]);
      setProgresso(ps);
      setTentativas(ts.sort((a, b) => a.numero - b.numero));
      // eventos desta matrícula + os de acesso ao portal (login, senha…)
      setEventos(
        evs
          .filter((e) => e.matricula_id === matricula.id || !e.matricula_id)
          .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
      );
      setCertificado(certs[0] || null);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar a trilha de auditoria");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (matricula?.id) carregar();
  }, [matricula?.id]);

  const tituloAula = new Map((aulas || []).map((a) => [a.id, `${a.ordem}. ${a.titulo}`]));
  const progPorAula = new Map(progresso.map((p) => [p.aula_id, p]));
  const totalAssistido = progresso.reduce((s, p) => s + (p.segundos_assistidos || 0), 0);

  const exportarCsv = () => {
    const linhas = [
      ["data_hora_servidor", "evento", "descricao", "aula", "detalhe", "ip", "dispositivo"],
      ...eventos.map((e) => [
        new Date(e.created_at).toLocaleString("pt-BR"),
        e.evento,
        ROTULO_EVENTO[e.evento] || e.evento,
        e.aula_id ? tituloAula.get(e.aula_id) || e.aula_id : "",
        e.detalhe ? JSON.stringify(e.detalhe) : "",
        e.ip || "",
        e.dispositivo || "",
      ]),
    ];
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `trilha_${(funcionario?.nome_completo || "funcionario").replace(/\s+/g, "_")}_${curso?.codigo || "curso"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const liberarTentativa = async () => {
    if (!window.confirm("Liberar mais uma tentativa de avaliação para este funcionário?")) return;
    try {
      await sigo.entities.TreinamentoMatricula.update(matricula.id, {
        tentativas_extras: (matricula.tentativas_extras || 0) + 1,
      });
      toast.success("Nova tentativa liberada");
      onMudou?.();
    } catch (e) {
      toast.error("Erro: " + (e?.message || e));
    }
  };

  const baixar = async () => {
    const logo = await logoParaPdf(empresaAtiva);
    await baixarCertificadoPdf({ ...certificado, revogado: !!certificado.revogado_em }, { logo });
  };

  const revogar = async () => {
    const motivo = window.prompt("Motivo da revogação (aparece na consulta pública):");
    if (!motivo?.trim()) return;
    try {
      await sigo.entities.TreinamentoCertificado.update(certificado.id, {
        revogado_em: new Date().toISOString(),
        revogado_por: user?.email || user?.full_name || null,
        motivo_revogacao: motivo.trim(),
      });
      toast.success("Certificado revogado");
      carregar();
    } catch (e) {
      toast.error("Erro: " + (e?.message || e));
    }
  };

  return (
    <Sheet open={!!matricula} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {funcionario?.nome_completo} · {curso?.nome}
          </SheetTitle>
        </SheetHeader>

        {carregando ? (
          <div className="flex items-center gap-2 text-slate-500 py-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando trilha…
          </div>
        ) : (
          <div className="space-y-6 py-4 text-sm">
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Status", matricula.status.replace("_", " ")],
                ["Início", fmtDataHora(matricula.iniciado_em)],
                ["Conclusão", matricula.data_conclusao?.split("-").reverse().join("/") || "—"],
                ["Tempo total assistido", fmtTempo(totalAssistido)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-slate-50 p-2">
                  <p className="text-xs text-slate-500">{k}</p>
                  <p className="font-medium text-slate-800">{v}</p>
                </div>
              ))}
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Aulas</h3>
              <table className="w-full">
                <tbody>
                  {(aulas || []).map((a) => {
                    const p = progPorAula.get(a.id);
                    return (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-2">
                          {a.ordem}. {a.titulo}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600 whitespace-nowrap">
                          {fmtTempo(p?.segundos_assistidos)}
                          {a.duracao_seg ? ` / ${fmtTempo(a.duracao_seg)}` : ""}
                        </td>
                        <td className="py-1.5 text-right">
                          {p?.concluida ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                              {fmtDataHora(p.concluida_em)}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">pendente</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-800">
                  Avaliação — tentativas ({tentativas.length}
                  {curso?.max_tentativas
                    ? ` de ${curso.max_tentativas + (matricula.tentativas_extras || 0)}`
                    : ""}
                  )
                </h3>
                {!matricula.avaliacao_aprovada && (
                  <Button size="sm" variant="outline" onClick={liberarTentativa}>
                    <Plus className="w-4 h-4 mr-1" /> Liberar tentativa
                  </Button>
                )}
              </div>
              {tentativas.length === 0 ? (
                <p className="text-slate-400">Nenhuma tentativa ainda.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b">
                      <th className="py-1 pr-2 font-medium">Nº</th>
                      <th className="py-1 pr-2 font-medium">Data/hora</th>
                      <th className="py-1 pr-2 font-medium">Acertos</th>
                      <th className="py-1 pr-2 font-medium">Nota</th>
                      <th className="py-1 font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tentativas.map((t) => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-2">{t.numero}</td>
                        <td className="py-1.5 pr-2">{fmtDataHora(t.created_at)}</td>
                        <td className="py-1.5 pr-2">
                          {t.acertos}/{t.total}
                        </td>
                        <td className="py-1.5 pr-2">
                          <Badge
                            variant="outline"
                            className={
                              t.aprovada
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                : "bg-red-50 text-red-700 border-red-200"
                            }
                          >
                            {t.nota}% · {t.aprovada ? "aprovado" : "reprovado"}
                          </Badge>
                        </td>
                        <td className="py-1.5 text-slate-500">{t.ip || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Certificado</h3>
              {certificado ? (
                <div className="rounded-md border p-3 space-y-2">
                  <p>
                    <Award className="w-4 h-4 inline mr-1 text-emerald-600" />
                    Código <span className="font-mono font-semibold">{certificado.codigo}</span> ·
                    emitido em {fmtDataHora(certificado.emitido_em)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Assinado pelo funcionário com a senha pessoal em{" "}
                    {fmtDataHora(certificado.assinatura_aluno?.assinado_em)} · IP{" "}
                    {certificado.assinatura_aluno?.ip || "—"}
                  </p>
                  {certificado.revogado_em && (
                    <p className="text-red-700 text-xs">
                      Revogado em {fmtDataHora(certificado.revogado_em)} por{" "}
                      {certificado.revogado_por}: {certificado.motivo_revogacao}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={baixar} className="bg-slate-900">
                      <FileDown className="w-4 h-4 mr-1" /> Baixar PDF
                    </Button>
                    {!certificado.revogado_em && (
                      <Button size="sm" variant="outline" onClick={revogar}>
                        <Ban className="w-4 h-4 mr-1" /> Revogar
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-slate-400">
                  {matricula.status === "concluido"
                    ? curso?.carga_horaria_horas
                      ? "Aguardando o funcionário assinar no portal."
                      : "Defina a carga horária do curso para liberar o certificado."
                    : "Emitido quando o funcionário concluir o curso."}
                </p>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-800">
                  Trilha de acessos ({eventos.length})
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={exportarCsv}
                  disabled={!eventos.length}
                >
                  <Download className="w-4 h-4 mr-1" /> Exportar CSV
                </Button>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Data e hora do servidor. Inclui os acessos ao portal (login, senha) do funcionário.
              </p>
              <div className="max-h-96 overflow-y-auto border rounded-md">
                <table className="w-full text-xs">
                  <tbody>
                    {eventos.map((e) => (
                      <tr key={e.id} className="border-b last:border-0 align-top">
                        <td className="py-1 px-2 whitespace-nowrap text-slate-500">
                          {fmtDataHora(e.created_at)}
                        </td>
                        <td className="py-1 px-2">
                          <span
                            className={
                              e.evento === "progresso_ajustado" || e.evento === "login_falha"
                                ? "text-amber-700"
                                : "text-slate-800"
                            }
                          >
                            {ROTULO_EVENTO[e.evento] || e.evento}
                          </span>
                          {e.aula_id && tituloAula.get(e.aula_id) && (
                            <span className="text-slate-500"> · {tituloAula.get(e.aula_id)}</span>
                          )}
                          {descreverDetalhe(e) && (
                            <span className="text-slate-500"> · {descreverDetalhe(e)}</span>
                          )}
                        </td>
                        <td className="py-1 px-2 text-slate-400 whitespace-nowrap">{e.ip || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
