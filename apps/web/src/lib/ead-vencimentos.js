/**
 * Vencimentos dos treinamentos EAD e "atividade sem treinamento" (T24) — regras puras, sem DOM e sem rede.
 *
 * Quem usa: components/seguranca/VencimentosEadPainel.jsx (painel "Vencimentos" da aba Treinamentos do RH).
 * Os testes ficam em ead-vencimentos.test.js.
 *
 * ESPELHO NO BANCO: a seleção de vencimentos e o critério do aviso diário repetem, em SQL, o que está em
 * `selecionarVencimentos` e `precisaDeAviso` (função `alertar_treinamentos_ead`, migração 0138). Quem mudar
 * uma regra aqui muda lá, e vice-versa. As regras, em resumo:
 *
 * - Só entra no painel a matrícula CONCLUÍDA, viva, com data de renovação (`proxima_renovacao`), de curso
 *   vivo que não seja de apoio (o apoio nunca emite nem renova, D3), de funcionário ativo e sem certificado
 *   revogado (revogado não há o que renovar: o caso aparece em "atividade sem treinamento").
 * - Por funcionário e curso vale só a conclusão de renovação mais distante: a anterior virou histórico.
 * - Vencido é data anterior a hoje; vencer hoje ainda é "a vencer" (0 dia), como o `alertar_treinamentos()`
 *   da 0039. Hoje é o dia de BRASÍLIA.
 * - "Sem matrícula de renovação" quer dizer sem outra matrícula ABERTA (pendente ou em andamento) do mesmo
 *   funcionário no MESMO curso. Reciclagem feita num curso diferente (ex.: "NR-10 Reciclagem" de quem fez o
 *   "NR-10 Básico") não é reconhecida: não há vínculo entre os dois cursos no cadastro.
 */
import { emiteCertificado, modalidadeDoCurso } from "./ead-requisitos";

/** Até quantos dias à frente o painel olha (faixas de 30, 60 e 90 dias). */
export const JANELA_VENCIMENTO_DIAS = 90;
/** O aviso diário do banco só fala do que vence nesta janela (ou já venceu) e está sem renovação. */
export const DIAS_DO_AVISO_DIARIO = 30;

const MS_POR_DIA = 86_400_000;

/** O dia de hoje no fuso de Brasília ("AAAA-MM-DD"), igual ao que o servidor grava em `data_conclusao`. */
export function hojeEmBrasilia(agora = new Date()) {
  // "en-CA" formata como AAAA-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

// "AAAA-MM-DD" (ou timestamp ISO) → ms em UTC da meia-noite do dia; null se não for uma data real
function diaEmMs(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(texto ?? ""));
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(ano, mes - 1, dia);
  const d = new Date(ms);
  // 2026-02-30 vira 2026-03-02 no Date: recusa o que não é o mesmo dia
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return ms;
}

/** Dias de calendário de `hoje` até a data de renovação (negativo = já venceu); null se a data não vale. */
export function diasParaVencer(dataRenovacao, hoje) {
  const alvo = diaEmMs(dataRenovacao);
  const base = diaEmMs(hoje);
  if (alvo === null || base === null) return null;
  return Math.round((alvo - base) / MS_POR_DIA);
}

/** "vencido", "ate30", "ate60", "ate90" (limites inclusivos) ou null (além da janela ou sem dias). */
export function faixaDoVencimento(dias) {
  if (typeof dias !== "number" || Number.isNaN(dias)) return null;
  if (dias < 0) return "vencido";
  if (dias <= 30) return "ate30";
  if (dias <= 60) return "ate60";
  if (dias <= JANELA_VENCIMENTO_DIAS) return "ate90";
  return null;
}

const viva = (linha) => !!linha && !linha.deleted_at;
const emAberto = (m) => m.status !== "concluido";

function revogadas(certificados) {
  return new Set(
    (Array.isArray(certificados) ? certificados : [])
      .filter((c) => c?.revogado_em)
      .map((c) => c.matricula_id)
  );
}

/**
 * A matrícula vale hoje? Viva, sem certificado revogado e: em andamento/pendente (está sendo feita) ou
 * concluída dentro da validade (sem validade, vale sempre). `certificadoRevogado` diz se o certificado
 * da matrícula foi revogado.
 */
export function matriculaValida(matricula, certificadoRevogado, hoje) {
  if (!viva(matricula) || certificadoRevogado) return false;
  if (emAberto(matricula)) return true;
  const renovacao = matricula.proxima_renovacao;
  if (!renovacao) return true;
  const dias = diasParaVencer(renovacao, hoje);
  // data ilegível: não se afirma que venceu
  return dias === null || dias >= 0;
}

const porTexto = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "pt-BR");

/**
 * Vencimentos do painel: `{ itens, resumo }`.
 *
 * Cada item é `{ matricula, curso, funcionario, vencimento, dias, faixa, renovacao }`, ordenado pela data
 * (depois funcionário e curso); `renovacao` é "sem" (nenhuma matrícula aberta no curso) ou "andamento".
 * `resumo` conta os itens por faixa e os "sem matrícula de renovação" (`semRenovacao`).
 */
export function selecionarVencimentos({
  matriculas = [],
  cursos = [],
  funcionarios = [],
  certificados = [],
  hoje,
} = {}) {
  const funcPorId = new Map(
    (funcionarios ?? []).filter((f) => viva(f) && f.ativo !== false).map((f) => [f.id, f])
  );
  const cursoPorId = new Map((cursos ?? []).filter(viva).map((c) => [c.id, c]));
  const revogada = revogadas(certificados);
  const todas = (matriculas ?? []).filter(viva);

  // quem tem matrícula aberta (funcionário|curso): a renovação já começou
  const abertas = new Set(todas.filter(emAberto).map((m) => `${m.funcionario_id}|${m.curso_id}`));

  // por funcionário e curso, a conclusão de renovação mais distante (empate: a criada por último)
  const maisRecente = new Map();
  for (const m of todas) {
    if (m.status !== "concluido" || !m.proxima_renovacao || revogada.has(m.id)) continue;
    const curso = cursoPorId.get(m.curso_id);
    if (!curso || modalidadeDoCurso(curso) === "apoio") continue;
    if (!funcPorId.has(m.funcionario_id)) continue;
    if (diaEmMs(m.proxima_renovacao) === null) continue;
    const chave = `${m.funcionario_id}|${m.curso_id}`;
    const atual = maisRecente.get(chave);
    const dia = String(m.proxima_renovacao).slice(0, 10);
    const diaAtual = atual ? String(atual.proxima_renovacao).slice(0, 10) : "";
    if (
      !atual ||
      dia > diaAtual ||
      (dia === diaAtual && String(m.created_at ?? "") > String(atual.created_at ?? ""))
    ) {
      maisRecente.set(chave, m);
    }
  }

  const itens = [];
  for (const [chave, m] of maisRecente) {
    const dias = diasParaVencer(m.proxima_renovacao, hoje);
    const faixa = faixaDoVencimento(dias);
    if (!faixa) continue;
    itens.push({
      matricula: m,
      curso: cursoPorId.get(m.curso_id),
      funcionario: funcPorId.get(m.funcionario_id),
      vencimento: String(m.proxima_renovacao).slice(0, 10),
      dias,
      faixa,
      renovacao: abertas.has(chave) ? "andamento" : "sem",
    });
  }
  itens.sort(
    (a, b) =>
      a.dias - b.dias ||
      porTexto(a.funcionario?.nome_completo, b.funcionario?.nome_completo) ||
      porTexto(a.curso?.nome, b.curso?.nome)
  );

  const resumo = {
    vencidos: 0,
    ate30: 0,
    ate60: 0,
    ate90: 0,
    semRenovacao: 0,
    total: itens.length,
  };
  for (const i of itens) {
    if (i.faixa === "vencido") resumo.vencidos += 1;
    else resumo[i.faixa] += 1;
    if (i.renovacao === "sem") resumo.semRenovacao += 1;
  }
  return { itens, resumo };
}

/**
 * O item entra no aviso diário (`alertar_treinamentos_ead`, no banco)? Vencido ou vencendo em até
 * `DIAS_DO_AVISO_DIARIO` dias e sem nova matrícula aberta: é onde o RH precisa agir.
 */
export function precisaDeAviso(item) {
  return (
    !!item &&
    typeof item.dias === "number" &&
    item.dias <= DIAS_DO_AVISO_DIARIO &&
    item.renovacao === "sem"
  );
}

/**
 * Atividade sem treinamento (NR-1, 1.7.1.2.1): funcionário ATIVO cuja função exige um treinamento que tem
 * curso EAD publicado e que não tem matrícula válida em nenhum desses cursos.
 *
 * O caminho é função → exigência da função (`treinamento` com `funcao_id`) → treinamento central
 * (`modelo_treinamento_id`, migração 0131) → curso EAD (`treinamento_curso.modelo_treinamento_id`). Só
 * contam como exigência as ativas, não removidas e não marcadas como opcionais (`obrigatorio === false`).
 * Só habilita o curso EAD publicado (`ativo !== false`) e de modalidade EAD: o de apoio não emite
 * certificado e o semipresencial ainda não emite. Exigência sem nenhum curso assim fica de fora: o EAD não
 * tem como julgar, e o treinamento presencial registrado na Ficha não entra nesta conta.
 *
 * Devolve `[{ funcionario, pendencias: [{ exigencia, cursos, motivo }] }]` por nome do funcionário, só de
 * quem tem pendência. `motivo`: "revogada" (certificado revogado), "vencida" (concluiu e venceu) ou
 * "sem_matricula" (nunca foi matriculado, ou a matrícula foi removida).
 */
export function atividadeSemTreinamento({
  funcionarios = [],
  treinamentos = [],
  cursos = [],
  matriculas = [],
  certificados = [],
  hoje,
} = {}) {
  const revogada = revogadas(certificados);
  const cursosEad = (cursos ?? []).filter(
    (c) => viva(c) && c.ativo !== false && emiteCertificado(modalidadeDoCurso(c))
  );
  const matriculasDoFuncionario = new Map();
  for (const m of (matriculas ?? []).filter(viva)) {
    const lista = matriculasDoFuncionario.get(m.funcionario_id) ?? [];
    lista.push(m);
    matriculasDoFuncionario.set(m.funcionario_id, lista);
  }
  const exigenciasDaFuncao = new Map();
  for (const t of treinamentos ?? []) {
    if (!viva(t) || t.ativo === false || t.obrigatorio === false) continue;
    if (!t.funcao_id || !t.modelo_treinamento_id) continue;
    const lista = exigenciasDaFuncao.get(t.funcao_id) ?? [];
    // duas exigências do mesmo modelo são uma só para o aluno
    if (!lista.some((e) => e.modelo_treinamento_id === t.modelo_treinamento_id)) lista.push(t);
    exigenciasDaFuncao.set(t.funcao_id, lista);
  }

  const resultado = [];
  for (const f of (funcionarios ?? []).filter((x) => viva(x) && x.ativo !== false)) {
    if (!f.funcao_id) continue;
    const suas = matriculasDoFuncionario.get(f.id) ?? [];
    const pendencias = [];
    for (const exigencia of exigenciasDaFuncao.get(f.funcao_id) ?? []) {
      const cursosDaExigencia = cursosEad.filter(
        (c) => c.modelo_treinamento_id === exigencia.modelo_treinamento_id
      );
      if (cursosDaExigencia.length === 0) continue;
      const ids = new Set(cursosDaExigencia.map((c) => c.id));
      const doModelo = suas.filter((m) => ids.has(m.curso_id));
      if (doModelo.some((m) => matriculaValida(m, revogada.has(m.id), hoje))) continue;
      const motivo = doModelo.some((m) => revogada.has(m.id))
        ? "revogada"
        : doModelo.some((m) => m.status === "concluido")
          ? "vencida"
          : "sem_matricula";
      pendencias.push({ exigencia, cursos: cursosDaExigencia, motivo });
    }
    if (pendencias.length) resultado.push({ funcionario: f, pendencias });
  }
  return resultado.sort((a, b) =>
    porTexto(a.funcionario.nome_completo, b.funcionario.nome_completo)
  );
}

const dias = (n) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** "Vencido há 16 dias", "Vence hoje", "Vence em 1 dia", "Vence em 45 dias". */
export function rotuloDoVencimento(diasAteVencer) {
  if (diasAteVencer < 0) return `Vencido há ${dias(-diasAteVencer)}`;
  if (diasAteVencer === 0) return "Vence hoje";
  return `Vence em ${dias(diasAteVencer)}`;
}

/** Texto do motivo de uma pendência de "atividade sem treinamento". */
export function rotuloDoMotivo(motivo) {
  if (motivo === "vencida") return "Treinamento vencido, sem nova matrícula";
  if (motivo === "revogada") return "Certificado revogado, sem nova matrícula";
  return "Sem matrícula";
}
