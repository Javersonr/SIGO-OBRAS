/**
 * Matrícula por função (T22) — regras puras, sem DOM e sem rede.
 *
 * O caminho é o da migração 0131: função → exigência da função (`treinamento` com `funcao_id`) →
 * treinamento central (`modelo_treinamento_id`) → curso do portal (`treinamento_curso.modelo_treinamento_id`).
 * É o mesmo vínculo do painel "Atividade sem treinamento" (T24, `ead-vencimentos.js`): quem aparece lá como
 * pendência é quem esta tela matricula, com a mesma conta de "matrícula válida".
 *
 * Quem usa: components/seguranca/MatricularEadSheet.jsx (modo "Por função") e as telas que sugerem a
 * matrícula na admissão e na troca de função (`sugestaoDeMatricula`). Os testes ficam em
 * ead-matricula-funcao.test.js.
 *
 * Curso de apoio (D3) pode ser matriculado, mas não emite certificado e por isso não cumpre a exigência
 * quando o modelo também tem curso que emite: a exigência só é "cumprida" por curso que emite certificado.
 * Se o modelo só tem curso de apoio, a matrícula nele conta (senão a pessoa seria cobrada para sempre).
 *
 * Exceção (revisão 1 da T22): o modelo tem curso que emite, mas NENHUM deles aceita matrícula agora (rascunho
 * ou pendência), e o painel matricula no apoio. Aí quem já tem matrícula válida no apoio (aberta, ou concluída
 * dentro da validade) não "falta": senão o painel criaria outra matrícula no mesmo curso a cada conclusão. A
 * situação mostra "apoio feito (sem certificado)", para o RH não confundir com exigência cumprida. Quando o
 * curso que emite volta a aceitar matrícula, o apoio deixa de contar e a pessoa volta a faltar nele.
 */
import { emiteCertificado, modalidadeDoCurso } from "./ead-requisitos";
import { exigenciasPorFuncao, matriculaValida } from "./ead-vencimentos";
import { matriculasNovas } from "./ead-gestao";

const viva = (linha) => !!linha && !linha.deleted_at;
const ativo = (f) => viva(f) && f.ativo !== false;
const COLADOR = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/**
 * As funções de quem está ativo, para escolher no painel: `[{ id, nome, total }]` em ordem de nome.
 * O nome é o `funcao_nome` gravado no funcionário (o primeiro que não estiver vazio).
 */
export function funcoesDosFuncionarios(funcionarios) {
  const porId = new Map();
  for (const f of funcionarios ?? []) {
    if (!ativo(f) || !f.funcao_id) continue;
    const atual = porId.get(f.funcao_id) ?? { id: f.funcao_id, nome: "", total: 0 };
    if (!atual.nome && String(f.funcao_nome ?? "").trim())
      atual.nome = String(f.funcao_nome).trim();
    atual.total += 1;
    porId.set(f.funcao_id, atual);
  }
  return [...porId.values()]
    .map((f) => ({ ...f, nome: f.nome || "(função sem nome)" }))
    .sort((a, b) => COLADOR.compare(a.nome, b.nome));
}

// Situações em que a exigência não está cumprida e o painel pode oferecer a matrícula.
const SITUACOES_QUE_FALTAM = ["vencida", "revogada", "sem_matricula"];

/**
 * Situação de um funcionário numa exigência: olha as matrículas dele nos cursos do modelo que "contam"
 * (os que emitem certificado; se nenhum emite, todos).
 * @returns {"em_dia"|"em_andamento"|"vencida"|"revogada"|"sem_matricula"}
 */
function situacaoNaExigencia(matriculasDele, cursosQueContam, revogadas, hoje) {
  const ids = new Set(cursosQueContam.map((c) => c.id));
  const dele = matriculasDele.filter((m) => ids.has(m.curso_id));
  const validas = dele.filter((m) => matriculaValida(m, revogadas.has(m.id), hoje));
  if (validas.some((m) => m.status === "concluido")) return "em_dia";
  if (validas.length) return "em_andamento";
  if (dele.some((m) => revogadas.has(m.id))) return "revogada";
  if (dele.some((m) => m.status === "concluido")) return "vencida";
  return "sem_matricula";
}

/**
 * Situação no apoio, para quando o curso escolhido da exigência é de apoio porque nenhum curso que emite aceita
 * matrícula: matrícula válida (aberta, ou concluída dentro da validade) em qualquer curso do modelo que não
 * emite certificado. Sem nenhuma, null (vale a situação medida nos cursos que emitem).
 * @returns {"apoio_feito"|"apoio_em_andamento"|null}
 */
function situacaoNoApoio(matriculasDele, cursosSemCertificado, revogadas, hoje) {
  const ids = new Set(cursosSemCertificado.map((c) => c.id));
  const validas = matriculasDele.filter(
    (m) => ids.has(m.curso_id) && matriculaValida(m, revogadas.has(m.id), hoje)
  );
  if (validas.some((m) => m.status === "concluido")) return "apoio_feito";
  return validas.length ? "apoio_em_andamento" : null;
}

/**
 * O que matricular numa função.
 *
 * `cursoMatriculavel(curso)` devolve null quando o curso aceita matrícula (publicado e sem pendência) ou o
 * texto do motivo quando não aceita. Devolve:
 *  - `exigencias`: uma por treinamento exigido da função, `{ id, modeloId, nome, cursos, curso, apoio,
 *    motivo, detalheMotivo }`. `curso` é o curso em que matricular (o primeiro que aceita matrícula,
 *    preferindo os que emitem certificado); sem ele, `motivo` é "sem_curso" (o treinamento não tem curso no
 *    portal) ou "indisponivel" (tem, mas nenhum aceita matrícula; `detalheMotivo` diz por quê);
 *  - `pessoas`: os funcionários ativos da função, por nome, `{ funcionario, itens, faltam }`. `itens` é a
 *    situação em cada exigência (inclui "apoio_feito" e "apoio_em_andamento", ver o topo do arquivo) e
 *    `faltam` lista as exigências (com curso disponível) em que falta matrícula: vencida, revogada ou
 *    nunca matriculado.
 */
export function planoDaFuncao({
  funcaoId,
  funcionarios = [],
  treinamentos = [],
  cursos = [],
  matriculas = [],
  certificados = [],
  hoje,
  cursoMatriculavel = () => null,
} = {}) {
  const revogadas = new Set(
    (certificados ?? []).filter((c) => c?.revogado_em).map((c) => c.matricula_id)
  );
  const cursosVivos = (cursos ?? []).filter(viva);

  const exigencias = (exigenciasPorFuncao(treinamentos).get(funcaoId) ?? []).map((e) => {
    const doModelo = cursosVivos
      .filter((c) => c.modelo_treinamento_id === e.modelo_treinamento_id)
      .sort(
        (a, b) =>
          Number(emiteCertificado(modalidadeDoCurso(b))) -
            Number(emiteCertificado(modalidadeDoCurso(a))) ||
          COLADOR.compare(a.nome ?? "", b.nome ?? "")
      );
    const motivos = doModelo.map((c) => cursoMatriculavel(c));
    const posicao = motivos.findIndex((m) => !m);
    const curso = posicao >= 0 ? doModelo[posicao] : null;
    return {
      id: e.id,
      modeloId: e.modelo_treinamento_id,
      nome: e.nome || doModelo[0]?.nome || "Treinamento",
      cursos: doModelo,
      curso,
      apoio: !!curso && modalidadeDoCurso(curso) === "apoio",
      motivo: curso ? null : doModelo.length ? "indisponivel" : "sem_curso",
      detalheMotivo: curso || !doModelo.length ? null : (motivos[0] ?? null),
    };
  });

  const matriculasPorFuncionario = new Map();
  for (const m of (matriculas ?? []).filter(viva)) {
    const lista = matriculasPorFuncionario.get(m.funcionario_id) ?? [];
    lista.push(m);
    matriculasPorFuncionario.set(m.funcionario_id, lista);
  }

  const pessoas = (funcionarios ?? [])
    .filter((f) => ativo(f) && f.funcao_id === funcaoId)
    .sort((a, b) => COLADOR.compare(a.nome_completo ?? "", b.nome_completo ?? ""))
    .map((funcionario) => {
      const suas = matriculasPorFuncionario.get(funcionario.id) ?? [];
      const itens = {};
      const faltam = [];
      for (const e of exigencias) {
        const queEmitem = e.cursos.filter((c) => emiteCertificado(modalidadeDoCurso(c)));
        const queContam = queEmitem.length ? queEmitem : e.cursos;
        let situacao = situacaoNaExigencia(suas, queContam, revogadas, hoje);
        // O curso escolhido é de apoio, mas o modelo tem curso que emite (que não aceita matrícula agora):
        // o apoio feito ou em andamento tira a pessoa de "faltam", sem virar exigência cumprida.
        if (e.apoio && queEmitem.length && SITUACOES_QUE_FALTAM.includes(situacao)) {
          const semCertificado = e.cursos.filter((c) => !emiteCertificado(modalidadeDoCurso(c)));
          situacao = situacaoNoApoio(suas, semCertificado, revogadas, hoje) ?? situacao;
        }
        itens[e.id] = situacao;
        if (e.curso && SITUACOES_QUE_FALTAM.includes(situacao)) faltam.push(e.id);
      }
      return { funcionario, itens, faltam };
    });

  return { funcaoId, exigencias, pessoas };
}

const ROTULO_DA_SITUACAO = {
  em_dia: "em dia",
  em_andamento: "em andamento",
  vencida: "vencida",
  revogada: "certificado revogado",
  sem_matricula: "sem matrícula",
  apoio_feito: "apoio feito (sem certificado)",
  apoio_em_andamento: "apoio em andamento (sem certificado)",
};

/** Texto de tela da situação de uma pessoa numa exigência. */
export function rotuloDaSituacao(situacao) {
  return ROTULO_DA_SITUACAO[situacao] ?? "sem matrícula";
}

/** Quem precisa de pelo menos uma das exigências marcadas (ids dos funcionários, na ordem do plano). */
export function idsQueFaltam(plano, exigenciaIds) {
  const marcadas = new Set(exigenciaIds ?? []);
  return (plano?.pessoas ?? [])
    .filter((p) => p.faltam.some((id) => marcadas.has(id)))
    .map((p) => p.funcionario.id);
}

/**
 * O que o painel marca ao escolher a função: os treinamentos que têm curso disponível e quem falta neles.
 * `preferidos` (ids de funcionários, vindos da sugestão de admissão ou troca de função) limita a seleção
 * a essas pessoas, se faltar algo a elas.
 * @returns {{ exigenciaIds: string[], funcionarioIds: string[] }}
 */
export function selecaoDaFuncao(plano, preferidos = null) {
  const exigenciaIds = (plano?.exigencias ?? []).filter((e) => e.curso).map((e) => e.id);
  const faltam = idsQueFaltam(plano, exigenciaIds);
  return {
    exigenciaIds,
    funcionarioIds: preferidos ? faltam.filter((id) => preferidos.includes(id)) : faltam,
  };
}

/**
 * As matrículas a criar: para cada exigência marcada, o curso escolhido do plano e as pessoas marcadas que
 * precisam dele. `matriculas` (as de agora) só serve para não duplicar uma matrícula aberta que apareceu
 * depois de a tela montar o plano e para o tipo automático (periódico para quem já concluiu o curso). Todas as
 * linhas levam as mesmas chaves (o `bulkCreate` exige). `tipo` e `motivo` são a escolha do RH (T23, ver
 * `matriculasNovas`); sem escolha vale o automático.
 * @returns {{ novas: object[], ignorados: number }}
 */
export function matriculasDoPlano({
  plano,
  exigenciaIds,
  funcionarioIds,
  matriculas,
  empresaId,
  tipo,
  motivo,
}) {
  const marcadas = new Set(exigenciaIds ?? []);
  const escolhidos = new Set(funcionarioIds ?? []);
  const novas = [];
  let ignorados = 0;
  const jaTem = new Set();
  for (const e of plano?.exigencias ?? []) {
    if (!marcadas.has(e.id) || !e.curso) continue;
    const quem = (plano.pessoas ?? [])
      .filter((p) => escolhidos.has(p.funcionario.id) && p.faltam.includes(e.id))
      .map((p) => p.funcionario.id);
    const r = matriculasNovas({
      matriculas,
      cursoId: e.curso.id,
      funcionarioIds: quem,
      empresaId,
      tipo,
      motivo,
    });
    ignorados += r.ignorados;
    for (const n of r.novas) {
      const chave = `${n.curso_id}|${n.funcionario_id}`;
      if (jaTem.has(chave)) continue;
      jaTem.add(chave);
      novas.push(n);
    }
  }
  return { novas, ignorados };
}

/**
 * Admissão ou troca de função: vale sugerir ao RH a matrícula nos treinamentos da função (NR-1, 1.4.4 e
 * 1.7.1.2.1: o treinamento vem antes da atividade). `anterior` é o cadastro de antes (null = funcionário
 * novo) e `atual` o que acabou de ser gravado. Sem função, sem funcionário ou funcionário inativo: null.
 * @returns {{ motivo: "admissao"|"troca_de_funcao", funcionarioId: string, funcaoId: string } | null}
 */
export function sugestaoDeMatricula({ anterior, atual } = {}) {
  if (!atual?.id || !atual.funcao_id || !ativo(atual)) return null;
  if (!anterior) return { motivo: "admissao", funcionarioId: atual.id, funcaoId: atual.funcao_id };
  if (anterior.funcao_id === atual.funcao_id) return null;
  return { motivo: "troca_de_funcao", funcionarioId: atual.id, funcaoId: atual.funcao_id };
}

/** O texto do aviso que oferece a matrícula. */
export function textoDaSugestao(sugestao, nome) {
  const quem = String(nome ?? "").trim() || "Funcionário";
  if (sugestao?.motivo === "troca_de_funcao") {
    return `${quem} mudou de função. Veja os treinamentos EAD da nova função e matricule o que faltar.`;
  }
  return `${quem} acabou de ser cadastrado. Matricule nos treinamentos EAD da função antes de iniciar a atividade.`;
}
