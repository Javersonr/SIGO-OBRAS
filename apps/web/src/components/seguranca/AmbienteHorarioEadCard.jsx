import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Download, Loader2, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import DeclaracaoTextoDialog from "@/components/seguranca/DeclaracaoTextoDialog";
import { hojeEmBrasilia } from "@/lib/ead-vencimentos";
import {
  EVENTO_DECLARACAO_AMBIENTE,
  declaracaoVigente,
  historicoDeVersoes,
} from "@/lib/ead-declaracao-ambiente";
import {
  avisoDaCobranca,
  csvDaAtividade,
  desdeDaConsulta,
  diaInicialDoPeriodo,
  filtrarAtividade,
  inicioDaCobranca,
  montarLinhasDeAtividade,
  resumirAtividade,
  textoDaDeclaracao,
  textoDaJanela,
} from "@/lib/ead-atividade-diaria";

// tabelas só de inclusão (sem deleted_at): o SDK precisa de includeDeleted
const SEM_SOFT_DELETE = { includeDeleted: true };

const PERIODOS = [7, 15, 30, 60, 90];
const LINHAS_POR_VEZ = 100;
// o SDK busca em páginas de 1000 e para em 30 páginas: com mais eventos que isso a lista vem cortada. A consulta
// vem do mais novo para o mais antigo, então o que se perde é o começo do período.
const TETO_DE_EVENTOS_DO_SDK = 30_000;

const CLASSE_DO_TOM = {
  ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
  atencao: "bg-amber-100 text-amber-800 border-amber-200",
  falta: "bg-red-100 text-red-800 border-red-200",
  neutro: "bg-slate-100 text-slate-600 border-slate-200",
};

// os eventos de servidor do período, do mais novo para o mais antigo
const lerEventosDoPeriodo = (empresaId, inicio) =>
  sigo.entities.TreinamentoEvento.filter(
    {
      empresa_id: empresaId,
      origem: "servidor",
      created_at: { $gte: desdeDaConsulta(inicio) },
    },
    { ...SEM_SOFT_DELETE, sort_by: "-created_at" }
  );

// a hora da primeira declaração da empresa, de qualquer época (não só do período): é dela que vem o dia em que a
// declaração passou a ser cobrada. null = nenhuma ainda.
const lerPrimeiraDeclaracao = async (empresaId) => {
  const [primeira] = await sigo.entities.TreinamentoEvento.filter(
    { empresa_id: empresaId, origem: "servidor", evento: EVENTO_DECLARACAO_AMBIENTE },
    { ...SEM_SOFT_DELETE, sort_by: "created_at", limit: 1 }
  );
  return primeira?.created_at ?? null;
};

const fmtDataHora = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
const fmtDia = (dia) => String(dia).split("-").reverse().join("/");

/**
 * Ambiente e horário do aluno (T35; NR-1, Anexo II, 4.3 e 4.4), na aba Treinamentos. Duas partes:
 * 1. O TEXTO da declaração que o aluno confirma na 1ª abertura de cada curso no dia, e a ART do responsável
 *    técnico (RT): em vigor, pendente de aprovação do RT (texto padrão) ou versão N, com o histórico de versões. A
 *    janela de edição é `DeclaracaoTextoDialog`.
 * 2. O relatório da janela de atividade por aluno e dia: do primeiro ao último evento de SERVIDOR do aluno no dia
 *    (hora de Brasília) e se ele declarou antes de estudar. Só carrega quando o RH pede (a trilha pode ser grande).
 * As regras estão em `lib/ead-declaracao-ambiente.js` e `lib/ead-atividade-diaria.js` (testadas); aqui só se
 * desenha e se liga a tela. A trava por permissão de quem edita o texto depende da T33.
 */
export default function AmbienteHorarioEadCard({ empresaId, funcionariosTodos = [] }) {
  // ---------------------------------------------------------------- o texto
  const [versoes, setVersoes] = useState([]);
  const [carregandoTexto, setCarregandoTexto] = useState(true);
  const [erroTexto, setErroTexto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);

  const carregarTexto = useCallback(async () => {
    setCarregandoTexto(true);
    try {
      const linhas = await sigo.entities.TreinamentoDeclaracaoTexto.filter(
        { empresa_id: empresaId },
        SEM_SOFT_DELETE
      );
      setVersoes(linhas);
      setErroTexto(false);
    } catch (e) {
      console.error("[declaração de ambiente] texto não carregado:", e);
      setErroTexto(true);
    } finally {
      setCarregandoTexto(false);
    }
  }, [empresaId]);

  useEffect(() => {
    if (empresaId) carregarTexto();
  }, [empresaId, carregarTexto]);

  const vigente = useMemo(() => declaracaoVigente(versoes), [versoes]);
  const historico = useMemo(() => historicoDeVersoes(versoes), [versoes]);
  const atual = historico[0] || null; // metadados da versão em vigor (quem salvou e quando)

  const salvarTexto = async ({ texto, art }) => {
    try {
      await sigo.entities.TreinamentoDeclaracaoTexto.create({
        empresa_id: empresaId,
        texto,
        art,
      });
      toast.success(
        vigente.aprovado
          ? "Nova versão do texto salva. Vale a partir da próxima abertura de curso."
          : "Texto aprovado e salvo como versão 1."
      );
      await carregarTexto();
      return true;
    } catch (e) {
      console.error("[declaração de ambiente] texto não salvo:", e);
      toast.error("Não foi possível salvar o texto. Confira os limites e tente de novo.");
      return false;
    }
  };

  // ---------------------------------------------------------------- o relatório
  const [dias, setDias] = useState(15);
  const [eventos, setEventos] = useState(null); // null = ainda não carregado
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);
  const [erroRelatorio, setErroRelatorio] = useState(false);
  const [diaInicial, setDiaInicial] = useState("");
  // o dia em que a falta de declaração passou a ser cobrada (null = a empresa ainda não tem nenhuma declaração)
  const [inicioCobranca, setInicioCobranca] = useState(null);
  const [cortado, setCortado] = useState(false);
  const [busca, setBusca] = useState("");
  const [soSemDeclaracao, setSoSemDeclaracao] = useState(false);
  const [limite, setLimite] = useState(LINHAS_POR_VEZ);
  // só a última consulta vale (trocar a empresa ou o período no meio de uma busca não mistura resultados)
  const pedidoRef = useRef(0);

  // trocou a empresa: o relatório da anterior não fica na tela
  useEffect(() => {
    pedidoRef.current += 1;
    setEventos(null);
    setInicioCobranca(null);
    setErroRelatorio(false);
    setCarregandoRelatorio(false);
  }, [empresaId]);

  const carregarRelatorio = async (periodo = dias) => {
    const pedido = ++pedidoRef.current;
    const inicio = diaInicialDoPeriodo(periodo, hojeEmBrasilia());
    setCarregandoRelatorio(true);
    setErroRelatorio(false);
    try {
      // sem o corte da cobrança os dias anteriores à declaração sairiam todos como "estudou sem declarar": se um
      // dos dois pedidos falha, o relatório inteiro falha (melhor que acusar quem não devia)
      const [linhas, primeiraDeclaracao] = await Promise.all([
        lerEventosDoPeriodo(empresaId, inicio),
        lerPrimeiraDeclaracao(empresaId),
      ]);
      if (pedido !== pedidoRef.current) return;
      setInicioCobranca(inicioDaCobranca(primeiraDeclaracao));
      setEventos(linhas);
      setCortado(linhas.length >= TETO_DE_EVENTOS_DO_SDK);
      setDiaInicial(inicio);
      setLimite(LINHAS_POR_VEZ);
    } catch (e) {
      if (pedido !== pedidoRef.current) return;
      console.error("[atividade por aluno e dia] não carregada:", e);
      setErroRelatorio(true);
    } finally {
      if (pedido === pedidoRef.current) setCarregandoRelatorio(false);
    }
  };

  const linhas = useMemo(
    () =>
      eventos
        ? montarLinhasDeAtividade({
            eventos,
            funcionarios: funcionariosTodos,
            desde: diaInicial,
            cobrarDesde: inicioCobranca,
          })
        : [],
    [eventos, funcionariosTodos, diaInicial, inicioCobranca]
  );
  const filtradas = useMemo(
    () => filtrarAtividade(linhas, { busca, soSemDeclaracao }),
    [linhas, busca, soSemDeclaracao]
  );
  const resumo = useMemo(() => resumirAtividade(linhas), [linhas]);
  const avisoCobranca = useMemo(
    () => (eventos ? avisoDaCobranca({ inicioCobranca, diaInicial }) : null),
    [eventos, inicioCobranca, diaInicial]
  );

  const baixarCsv = () => {
    try {
      // o BOM faz o Excel ler os acentos; vão todas as linhas do filtro, não só as da tela
      const blob = new Blob(["\uFEFF" + csvDaAtividade(filtradas)], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `atividade_ead_${hojeEmBrasilia()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${filtradas.length} linha(s) exportada(s) em CSV`);
    } catch (e) {
      console.error("Erro ao exportar a atividade por aluno e dia:", e);
      toast.error("Não foi possível exportar o CSV. Tente novamente.");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-5 w-5" /> Ambiente e horário do aluno
        </CardTitle>
        <p className="text-xs text-slate-500">
          NR-1, Anexo II, itens 4.3 e 4.4. Na primeira vez que abre cada curso no dia, o aluno lê a
          orientação do responsável técnico e confirma três itens: local adequado, horário reservado
          e sem outra atividade. O servidor grava a confirmação na trilha, com o texto que ele leu.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ------------------------------------------------------------ o texto */}
        <section aria-labelledby="declaracao-titulo" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="declaracao-titulo" className="text-sm font-semibold text-slate-800">
              Texto da declaração
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditando(true)}
              disabled={carregandoTexto || erroTexto}
            >
              <Pencil className="mr-1 h-4 w-4" />
              {vigente.aprovado ? "Editar texto e ART" : "Revisar e aprovar o texto"}
            </Button>
          </div>

          {carregandoTexto ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando o texto...
            </p>
          ) : erroTexto ? (
            <p role="alert" className="text-sm text-red-700">
              Não foi possível carregar o texto da declaração.{" "}
              <button type="button" className="underline" onClick={carregarTexto}>
                Tentar de novo
              </button>
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {vigente.aprovado ? (
                  <>
                    <Badge className={CLASSE_DO_TOM.ok}>Versão {vigente.versao} em vigor</Badge>
                    {atual && (
                      <span className="text-slate-500">
                        salva em {fmtDataHora(atual.salvoEm)}
                        {atual.salvoPor ? ` por ${atual.salvoPor}` : ""}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Badge className={CLASSE_DO_TOM.atencao}>
                      Texto padrão: pendente de aprovação do RT
                    </Badge>
                    <span className="text-slate-500">
                      Os alunos já veem este texto, mas ele só conta como aprovado quando o RT o
                      salvar.
                    </span>
                  </>
                )}
                <span className="text-slate-700">
                  ART: <strong>{vigente.art || "não informada"}</strong>
                </span>
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-800">
                {vigente.texto}
              </pre>
              {historico.length > 1 && (
                <div className="text-xs">
                  <button
                    type="button"
                    className="text-sky-700 underline"
                    onClick={() => setVerHistorico((v) => !v)}
                    aria-expanded={verHistorico}
                  >
                    {verHistorico ? "Esconder" : "Ver"} as versões anteriores (
                    {historico.length - 1})
                  </button>
                  {verHistorico && (
                    <ul className="mt-2 space-y-2">
                      {historico.slice(1).map((h) => (
                        <li key={h.versao} className="rounded-md border border-slate-200 p-2">
                          <p className="text-slate-600">
                            Versão {h.versao} · {fmtDataHora(h.salvoEm)}
                            {h.salvoPor ? ` · ${h.salvoPor}` : ""}
                            {h.art ? ` · ART: ${h.art}` : ""}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-slate-700">{h.texto}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* ------------------------------------------------------ o relatório */}
        <section aria-labelledby="atividade-titulo" className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 id="atividade-titulo" className="text-sm font-semibold text-slate-800">
                Atividade por aluno e dia
              </h3>
              <p className="text-xs text-slate-500">
                Do primeiro ao último evento de servidor do aluno em cada dia (hora de Brasília):
                entrada no portal, aula concluída, prova, certificado, dúvida e declaração. Não
                conta o que o navegador informa (play, pausa). Compare com o horário de trabalho
                dele.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="atividade-periodo" className="text-xs">
                  Período
                </Label>
                <select
                  id="atividade-periodo"
                  className="mt-0.5 block h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                  value={dias}
                  onChange={(e) => {
                    const novo = Number(e.target.value);
                    setDias(novo);
                    if (eventos) carregarRelatorio(novo);
                  }}
                >
                  {PERIODOS.map((d) => (
                    <option key={d} value={d}>
                      Últimos {d} dias
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => carregarRelatorio()}
                disabled={carregandoRelatorio}
              >
                {carregandoRelatorio ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                {eventos ? "Atualizar" : "Ver o relatório"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={baixarCsv}
                disabled={!eventos || filtradas.length === 0}
              >
                <Download className="mr-1 h-4 w-4" /> Exportar CSV
              </Button>
            </div>
          </div>

          {erroRelatorio && (
            <p role="alert" className="text-sm text-red-700">
              Não foi possível carregar a atividade. Tente de novo.
            </p>
          )}

          {eventos && cortado && (
            <p role="alert" className="text-sm text-amber-700">
              O período tem eventos demais e a lista foi cortada: os dias mais antigos podem estar
              incompletos. Escolha um período menor.
            </p>
          )}

          {eventos && (
            <>
              {avisoCobranca && (
                <p
                  role="status"
                  className={`text-xs ${avisoCobranca.tom === "atencao" ? "text-amber-700" : "text-slate-600"}`}
                >
                  {avisoCobranca.texto}
                </p>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <Label htmlFor="atividade-busca" className="text-xs">
                    Buscar aluno
                  </Label>
                  <Input
                    id="atividade-busca"
                    type="search"
                    placeholder="Nome do funcionário"
                    value={busca}
                    onChange={(e) => {
                      setBusca(e.target.value);
                      setLimite(LINHAS_POR_VEZ);
                    }}
                    className="mt-0.5 h-9"
                  />
                </div>
                <label className="flex h-9 items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={soSemDeclaracao}
                    onChange={(e) => {
                      setSoSemDeclaracao(e.target.checked);
                      setLimite(LINHAS_POR_VEZ);
                    }}
                    className="h-4 w-4 accent-slate-900"
                  />
                  Só quem estudou sem declarar
                </label>
              </div>

              <p className="text-xs text-slate-500" aria-live="polite">
                {resumo.alunos} {resumo.alunos === 1 ? "aluno" : "alunos"} · {resumo.dias}{" "}
                {resumo.dias === 1 ? "dia com atividade" : "dias com atividade"} ·{" "}
                <span className={resumo.semDeclaracao ? "font-medium text-red-700" : ""}>
                  {resumo.semDeclaracao} com estudo sem declaração
                </span>
                {filtradas.length !== linhas.length && ` · ${filtradas.length} no filtro`}
              </p>

              {filtradas.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">
                  {linhas.length === 0
                    ? "Nenhuma atividade de aluno no período."
                    : "Nenhuma linha neste filtro."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-slate-500">
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Aluno
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Dia
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Janela de atividade
                        </th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">
                          Eventos
                        </th>
                        <th scope="col" className="py-2 font-medium">
                          Declaração
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.slice(0, limite).map((l) => {
                        const decl = textoDaDeclaracao(l);
                        return (
                          <tr
                            key={`${l.funcionarioId}|${l.dia}`}
                            className="border-b last:border-0"
                          >
                            <td className="py-2 pr-3 font-medium text-slate-800">{l.nome}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{fmtDia(l.dia)}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{textoDaJanela(l)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{l.eventos}</td>
                            <td className="py-2">
                              <Badge className={`${CLASSE_DO_TOM[decl.tom]} whitespace-normal`}>
                                {decl.texto}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {filtradas.length > limite && (
                <div className="text-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLimite((n) => n + LINHAS_POR_VEZ)}
                  >
                    Mostrar mais ({filtradas.length - limite} restantes)
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </CardContent>

      <DeclaracaoTextoDialog
        aberto={editando}
        vigente={vigente}
        onFechar={() => setEditando(false)}
        onSalvar={salvarTexto}
      />
    </Card>
  );
}
