import React, { useEffect, useRef, useState } from "react";
import { sigo, resolveStorageUrl } from "@/api/sigoClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  FileDown,
  Download,
  Award,
  Ban,
  Plus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { baixarCertificadoPdf } from "@/lib/certificado-ead";
import { mensagemFalhaCertificado } from "@/lib/certificado-ead-falhas";
import { logoParaPdf, logoParaPdfDeUrl } from "@/lib/pdf-empresa";
import {
  assinaturasQueFaltaram,
  avisoAssinaturasNaoCarregadas,
  carregarAssinaturasDoCertificado,
} from "@/lib/ead-assinatura";
import { numerarAulas } from "@/lib/portal-curso";
import { textoDoTipoDaMatricula } from "@/lib/ead-tipo-matricula";
import {
  ROTULO_ORIGEM_NAVEGADOR,
  abertaEmDaTentativa,
  descreverDetalhe,
  eventoInformadoPeloNavegador,
  formatarTempo,
  origemDoEvento,
  rotuloDoEvento,
  tomDoEvento,
} from "@/lib/ead-trilha";
import {
  MOTIVO_REVOGACAO_MAX,
  acessoPortal,
  avisoDaRevogacao,
  extrasDaMatricula,
  falhaDaAcaoDoRH,
  validarMotivoRevogacao,
} from "@/lib/portal-funcionario-acesso";
import { useConfirmar } from "@/components/shared/ConfirmarDialog";
import PedirMotivoDialog from "@/components/shared/PedirMotivoDialog";
import ProvaDaTentativa from "@/components/seguranca/ProvaDaTentativa";

// tabelas só de inclusão (sem deleted_at): o SDK precisa de includeDeleted
const SEM_SOFT_DELETE = { includeDeleted: true };

// cor do texto do evento na trilha (T18: a revogação do certificado destaca em vermelho)
const CLASSE_DO_TOM = {
  normal: "text-slate-800",
  atencao: "text-amber-700",
  revogado: "text-red-700 font-medium",
};

const fmtDataHora = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "—";

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
  onClose,
  onMudou,
}) {
  const [carregando, setCarregando] = useState(true);
  const [progresso, setProgresso] = useState([]);
  const [tentativas, setTentativas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [certificado, setCertificado] = useState(null);
  // Baixar o PDF leva até alguns segundos (QR + logo): enquanto roda, o botão fica desabilitado, e
  // cada clique extra não monta outro QR nem baixa outro arquivo. O ref vale já no 2º clique, antes
  // de a tela redesenhar com o estado.
  const [baixando, setBaixando] = useState(false);
  const baixandoRef = useRef(false);
  // Liberar e revogar são ações do servidor (funcionario-acesso): uma por vez, e o botão fica parado
  // enquanto a anterior roda. O ref vale já no 2º clique, antes de a tela redesenhar.
  const [agindo, setAgindo] = useState(false);
  const agindoRef = useRef(false);
  const [pedindoMotivo, setPedindoMotivo] = useState(false); // janela do motivo da revogação
  const [confirmar, dialogoConfirmar] = useConfirmar();
  // tentativas com a prova aberta na tabela (linha expansível)
  const [abertas, setAbertas] = useState(() => new Set());

  // `silencioso`: recarrega por baixo, sem trocar o painel por "Carregando" (depois de uma ação, a
  // tela fica onde está e só os dados mudam)
  const carregar = async ({ silencioso = false } = {}) => {
    if (!silencioso) setCarregando(true);
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
    setAbertas(new Set());
    if (matricula?.id) carregar();
  }, [matricula?.id]);

  const alternarProva = (id) =>
    setAbertas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  // numeração pela posição na lista (1, 2, 3...), a mesma que o aluno vê no portal
  const aulasNumeradas = numerarAulas(aulas);
  const tituloAula = new Map(aulasNumeradas.map((a) => [a.id, `${a.numero}. ${a.titulo}`]));
  const progPorAula = new Map(progresso.map((p) => [p.aula_id, p]));
  const totalAssistido = progresso.reduce((s, p) => s + (p.segundos_assistidos || 0), 0);

  const exportarCsv = () => {
    const linhas = [
      [
        "data_hora_servidor",
        "evento",
        "descricao",
        "aula",
        "detalhe",
        "ip",
        "dispositivo",
        "origem",
      ],
      ...eventos.map((e) => [
        new Date(e.created_at).toLocaleString("pt-BR"),
        e.evento,
        rotuloDoEvento(e.evento),
        e.aula_id ? tituloAula.get(e.aula_id) || e.aula_id : "",
        e.detalhe ? JSON.stringify(e.detalhe) : "",
        e.ip || "",
        e.dispositivo || "",
        origemDoEvento(e),
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

  // Roda uma ação do servidor sobre a matrícula, uma de cada vez. Devolve true se deu certo. Falhou
  // (sem permissão, conflito, certificado já revogado por outra pessoa): avisa e recarrega por baixo,
  // para a tela mostrar o que o servidor tem agora. Quando o que a tela mostra ficou velho (conflito: a
  // matrícula mudou desde que a tela foi carregada; 409/404: outro RH já agiu), recarrega também a lista
  // da aba (`onMudou`): sem isso o número antigo seguiria valendo, todo clique repetiria o erro e a
  // lixeira da linha continuaria achando que o certificado é válido. Já "efeito sem registro" NÃO a
  // recarrega: a tela antiga é o que impede, no servidor, repetir a liberação (o aviso fica mais tempo,
  // pede para NÃO repetir). `aoFalhar(falha)` deixa a ação reagir à mesma decisão (ex.: fechar a janela).
  const executarAcao = async (tarefa, { aoFalhar } = {}) => {
    if (agindoRef.current) return false;
    agindoRef.current = true;
    setAgindo(true);
    try {
      await tarefa();
      return true;
    } catch (e) {
      console.error("[matricula] ação do RH falhou:", e);
      const falha = falhaDaAcaoDoRH(e);
      toast.error(falha.texto, falha.duracao ? { duration: falha.duracao } : undefined);
      carregar({ silencioso: true });
      if (falha.recarregarMatricula) onMudou?.();
      aoFalhar?.(falha);
      return false;
    } finally {
      agindoRef.current = false;
      setAgindo(false);
    }
  };

  // a tela dos Detalhes recarrega a trilha por baixo, e a lista de matrículas (que o painel não
  // enxerga) é avisada para refletir a liberação e a revogação (a lixeira, T20, depende disto)
  const aposAcao = () => {
    carregar({ silencioso: true });
    onMudou?.();
  };

  const liberarTentativa = async () => {
    // O número que a tela mostra no clique: o servidor só libera se a matrícula ainda tem esse número
    // (depois de uma falha, repetir com a tela antiga dá conflito em vez de somar outra tentativa).
    const extrasVistas = extrasDaMatricula(matricula);
    const confirmado = await confirmar({
      titulo: "Liberar mais uma tentativa?",
      texto:
        `${funcionario?.nome_completo || "O funcionário"} ganha mais uma tentativa da avaliação e pode ` +
        "refazer a prova agora, sem esperar o intervalo entre tentativas.\n\n" +
        "A liberação fica registrada na trilha de auditoria, com o seu e-mail.",
      rotuloConfirmar: "Liberar tentativa",
    });
    if (!confirmado) return;
    await executarAcao(async () => {
      await acessoPortal.liberarTentativa(matricula.id, extrasVistas);
      toast.success("Tentativa liberada: o funcionário já pode refazer a prova.");
      aposAcao();
    });
  };

  const baixar = async () => {
    if (baixandoRef.current) return;
    baixandoRef.current = true;
    setBaixando(true);
    try {
      const logo = await logoParaPdf(empresaAtiva);
      // a imagem da assinatura do instrutor e do RT (T29) é a referência congelada na emissão; o RH a
      // resolve pela própria sessão. Sem imagem, ou se ela não carregar, o PDF sai só com nome e registro.
      const carregadas = await carregarAssinaturasDoCertificado(certificado.dados, {
        urlDe: (pessoa) => resolveStorageUrl(pessoa.assinatura_ref),
        carregar: logoParaPdfDeUrl,
      });
      const { assinaturasDesenhadas } = await baixarCertificadoPdf(
        { ...certificado, revogado: !!certificado.revogado_em },
        { logo, assinaturas: carregadas.imagens }
      );
      const faltaram = assinaturasQueFaltaram(carregadas, assinaturasDesenhadas);
      if (faltaram.length) {
        toast.warning(avisoAssinaturasNaoCarregadas(faltaram), { duration: 12000 });
      }
    } catch (e) {
      console.error("[certificado] falha ao baixar:", e);
      toast.error(mensagemFalhaCertificado(e));
    } finally {
      baixandoRef.current = false;
      setBaixando(false);
    }
  };

  // Com a janela aberta, uma falha deixa o motivo digitado onde está (o erro vai no toast), para tentar
  // de novo. Exceção: a falha que mostra que a tela ficou velha (outro RH já revogou, certificado que já
  // não existe): o botão "Revogar" some depois da recarga, e a janela não pode ficar aberta sem sentido.
  const revogar = async (motivo) => {
    await executarAcao(
      async () => {
        const resposta = await acessoPortal.revogarCertificado(matricula.id, motivo);
        const aviso = avisoDaRevogacao(resposta);
        toast[aviso.tipo](aviso.texto, aviso.tipo === "warning" ? { duration: 12000 } : undefined);
        setPedindoMotivo(false);
        aposAcao();
      },
      {
        aoFalhar: (falha) => {
          if (falha.recarregarMatricula) setPedindoMotivo(false);
        },
      }
    );
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
                ["Tempo total assistido", formatarTempo(totalAssistido)],
                // inicial, periódico ou eventual com o motivo (T23); matrícula de antes da migração não o traz
                ...(textoDoTipoDaMatricula(matricula)
                  ? [["Tipo de treinamento", textoDoTipoDaMatricula(matricula)]]
                  : []),
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
                  {aulasNumeradas.map((a) => {
                    const p = progPorAula.get(a.id);
                    return (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-2">
                          {a.numero}. {a.titulo}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600 whitespace-nowrap">
                          {formatarTempo(p?.segundos_assistidos)}
                          {a.duracao_seg ? ` / ${formatarTempo(a.duracao_seg)}` : ""}
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={liberarTentativa}
                    disabled={agindo}
                    aria-busy={agindo}
                  >
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
                    {tentativas.map((t) => {
                      const aberta = abertas.has(t.id);
                      return (
                        <React.Fragment key={t.id}>
                          <tr className="border-b last:border-0">
                            <td className="py-1.5 pr-2">
                              <button
                                type="button"
                                onClick={() => alternarProva(t.id)}
                                aria-expanded={aberta}
                                aria-controls={`prova-${t.id}`}
                                aria-label={`${aberta ? "Esconder" : "Ver"} a prova da tentativa ${t.numero}`}
                                title={aberta ? "Esconder a prova" : "Ver a prova"}
                                className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-slate-700 hover:bg-slate-100"
                              >
                                {aberta ? (
                                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                )}
                                {t.numero}
                              </button>
                            </td>
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
                          {aberta && (
                            <tr id={`prova-${t.id}`} className="border-b last:border-0">
                              <td colSpan={5} className="pb-3">
                                <ProvaDaTentativa
                                  tentativa={t}
                                  abertaEm={abertaEmDaTentativa(eventos, t.numero)}
                                  formatarDataHora={fmtDataHora}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
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
                    <Button
                      size="sm"
                      onClick={baixar}
                      disabled={baixando}
                      aria-busy={baixando}
                      className="bg-slate-900"
                    >
                      {baixando ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <FileDown className="w-4 h-4 mr-1" />
                      )}{" "}
                      Baixar PDF
                    </Button>
                    {!certificado.revogado_em && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPedindoMotivo(true)}
                        disabled={agindo}
                      >
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
                Os eventos com o selo “{ROTULO_ORIGEM_NAVEGADOR}” são relatos do aparelho do aluno
                (abrir a aula, play, pausa, sair da tela): o servidor registra a hora e o IP, mas
                não confirma que aconteceu. Os eventos de origem “servidor” (login, prova,
                certificado...) o servidor viu e decidiu; a coluna “origem” do CSV traz a origem de
                cada evento, vazia quando o registro não a tem.
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
                          <span className={CLASSE_DO_TOM[tomDoEvento(e.evento)]}>
                            {rotuloDoEvento(e.evento)}
                          </span>
                          {e.aula_id && tituloAula.get(e.aula_id) && (
                            <span className="text-slate-500"> · {tituloAula.get(e.aula_id)}</span>
                          )}
                          {descreverDetalhe(e) && (
                            <span className="text-slate-500"> · {descreverDetalhe(e)}</span>
                          )}
                          {eventoInformadoPeloNavegador(e) && (
                            <Badge
                              variant="outline"
                              className="ml-2 px-1.5 py-0 text-[10px] font-normal bg-amber-50 text-amber-700 border-amber-200"
                              title="O navegador do aluno relatou este evento; o servidor só registrou a hora e o IP."
                            >
                              {ROTULO_ORIGEM_NAVEGADOR}
                            </Badge>
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
      {/* as janelas ficam fora do SheetContent: recarregar a trilha não as desmonta */}
      {dialogoConfirmar}
      <PedirMotivoDialog
        aberto={pedindoMotivo}
        titulo="Revogar o certificado?"
        texto={
          `O certificado de ${funcionario?.nome_completo || "o funcionário"} deixa de valer: a consulta pública ` +
          "passa a mostrar “Revogado” com o motivo abaixo, e o funcionário é avisado por WhatsApp. " +
          "A revogação não pode ser desfeita."
        }
        rotulo="Motivo da revogação (aparece na consulta pública)"
        validar={validarMotivoRevogacao}
        maximo={MOTIVO_REVOGACAO_MAX}
        rotuloConfirmar="Revogar certificado"
        destrutivo
        enviando={agindo}
        onConfirmar={revogar}
        onCancelar={() => setPedindoMotivo(false)}
      />
    </Sheet>
  );
}
