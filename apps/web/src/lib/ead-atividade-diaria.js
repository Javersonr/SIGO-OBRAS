/**
 * Janela de atividade por aluno e dia, para o RH (T35; NR-1, Anexo II, 4.4 "período exclusivo, sem trabalho
 * simultâneo") — regras puras, sem DOM e sem rede. Quem usa: components/seguranca/AmbienteHorarioEadCard.jsx. Testes
 * em ead-atividade-diaria.test.js.
 *
 * A janela de um aluno num dia (de Brasília) vai do PRIMEIRO ao ÚLTIMO evento de SERVIDOR dele no dia
 * (`treinamento_evento.origem = 'servidor'`: o que o servidor viu e decidiu, com a hora do servidor; o que o
 * navegador relata, como play e pausa, não entra). O RH compara a janela com o horário de trabalho do aluno. Não
 * contam como atividade do aluno: as ações do RH sobre ele (criar acesso, redefinir senha, liberar tentativa,
 * revogar certificado) e a senha errada no login (pode ser de outra pessoa).
 *
 * Junto da janela vai a situação da declaração de ambiente e horário (`declaracao_ambiente`, gravada pelo servidor
 * na 1ª abertura de cada curso no dia): "estudou" é ter, no dia, um evento de ESTUDO (`EVENTOS_DE_ESTUDO`: aula,
 * apostila, prova, conclusão) ligado a uma matrícula, e o curso que teve estudo mas nenhuma declaração no dia é
 * contado em `semDeclaracao`. Assinar o certificado e mandar dúvida também ficam ligados a uma matrícula, mas não
 * são estudo e o portal não pede a declaração para eles (curso concluído só abre para o certificado): no
 * semipresencial o certificado sai depois da prática, sempre num dia diferente do da conclusão, e não pode virar
 * "estudou sem declarar". Quem passa da meia-noite com o curso aberto aparece com o dia seguinte sem declaração (a
 * declaração é na abertura do curso): é o que a regra diz.
 *
 * A declaração só é COBRADA a partir do dia em que ela passou a existir: o dia seguinte ao da primeira declaração da
 * empresa (`inicioDaCobranca`). Antes disso (e no próprio dia da implantação, em que não dá para saber se o aluno
 * estudou antes ou depois de a tela entrar no ar) o estudo aparece na janela, mas sem acusar falta: sem este corte,
 * todo aluno que estudou nas semanas anteriores à publicação sairia como "estudou sem declarar".
 */
import { normalizarTexto } from "./busca";
import { celulaDoCsv } from "./ead-matriculas";
import { EVENTO_DECLARACAO_AMBIENTE } from "./ead-declaracao-ambiente";
import { hojeEmBrasilia } from "./ead-vencimentos";

/**
 * Ações do RH sobre o aluno que ficam na trilha como evento de servidor: não são atividade do aluno.
 * `ead-atividade-diaria.test.js` lê o `funcionario-acesso` e acusa o que faltar aqui.
 */
export const EVENTOS_DO_RH = [
  "acesso_criado",
  "senha_redefinida",
  "acesso_desativado",
  "acesso_reativado",
  "tentativa_liberada",
  "certificado_revogado",
  "duvida_resposta_editada",
];

/** Fora da janela: as ações do RH e a senha errada no login (pode ser de outra pessoa, não é o aluno). */
export const EVENTOS_FORA_DA_JANELA = [...EVENTOS_DO_RH, "login_falha"];

/**
 * Eventos de servidor que são ESTUDAR um curso (cada um ligado a uma matrícula): o progresso que o servidor creditou
 * ou ajustou, a apostila lida, a aula e o curso concluídos, e a prova aberta ou enviada. Só estes fazem o dia contar
 * como "estudou" e exigir a declaração. Ficam de fora, de propósito: `declaracao_ambiente` (é a própria declaração),
 * `certificado_assinado`/`certificado_revogado` e `duvida_enviada` (acontecem depois da conclusão, em outro dia, e o
 * portal não pede a declaração em curso concluído). A lista é fechada: um evento novo do portal só vira estudo se
 * entrar aqui, e `ead-atividade-diaria.test.js` lê o `portal-funcionario` e acusa o evento que ninguém classificou.
 */
export const EVENTOS_DE_ESTUDO = [
  "progresso_ajustado",
  "apostila_lida",
  "aula_concluida",
  "curso_concluido",
  "avaliacao_iniciada",
  "avaliacao_envio",
];

/** O evento é de estudo? (Só o nome importa; a origem e o aluno são conferidos em `ehAtividadeDoAluno`.) */
export function ehEventoDeEstudo(evento) {
  return typeof evento?.evento === "string" && EVENTOS_DE_ESTUDO.includes(evento.evento);
}

/** O evento conta como atividade do aluno? (Evento de servidor e que não é do RH nem senha errada.) */
export function ehAtividadeDoAluno(evento) {
  return (
    !!evento &&
    evento.origem === "servidor" &&
    typeof evento.evento === "string" &&
    !EVENTOS_FORA_DA_JANELA.includes(evento.evento)
  );
}

// ------------------------------------------------------------------------------------------------ datas

const MS_POR_DIA = 86_400_000;

function instante(iso) {
  const ms = typeof iso === "string" || iso instanceof Date ? new Date(iso).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** O dia de Brasília ("AAAA-MM-DD") do instante `iso`; null se a data não vale. */
export function diaDeBrasilia(iso) {
  const ms = instante(iso);
  return ms === null ? null : hojeEmBrasilia(new Date(ms));
}

const FORMATO_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A hora de Brasília ("08:03") do instante `iso`; vazio se a data não vale. */
export function horaDeBrasilia(iso) {
  const ms = instante(iso);
  return ms === null ? "" : FORMATO_HORA.format(new Date(ms));
}

/** O primeiro dia de um período de `dias` dias que termina em `hoje` (os dois "AAAA-MM-DD"). */
export function diaInicialDoPeriodo(dias, hoje) {
  const [a, m, d] = String(hoje).split("-").map(Number);
  const inicio = new Date(Date.UTC(a, m - 1, d) - (Math.max(1, dias) - 1) * MS_POR_DIA);
  return inicio.toISOString().slice(0, 10);
}

/**
 * De quando a consulta ao banco começa: 24 h antes da meia-noite UTC do dia inicial. Cobre o fuso de Brasília com
 * folga; `janelasPorAlunoEDia({ desde })` corta o que sobra, pelo dia de Brasília.
 */
export function desdeDaConsulta(diaInicial) {
  const [a, m, d] = String(diaInicial).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) - MS_POR_DIA).toISOString();
}

/**
 * O primeiro dia em que o relatório COBRA a declaração: o dia seguinte ao dia de Brasília da primeira declaração da
 * empresa (`primeiraEm`, o `created_at` do primeiro evento `declaracao_ambiente`). Vale também para quem estudou
 * entre a publicação da função e a do site, porque o corte vem da primeira declaração que de fato chegou, e não de
 * uma data fixa. O dia da implantação fica de fora de propósito (ver o cabeçalho). `null` quando a empresa ainda não
 * tem nenhuma declaração (ou a data não vale): nada é cobrado.
 */
export function inicioDaCobranca(primeiraEm) {
  const dia = diaDeBrasilia(primeiraEm);
  if (!dia) return null;
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + MS_POR_DIA).toISOString().slice(0, 10);
}

// ------------------------------------------------------------------------------------------------ janelas

/**
 * Uma linha por aluno e dia: `{ funcionarioId, dia, primeiroEm, ultimoEm, minutos, eventos, estudou, declaracoes,
 * semDeclaracao }`.
 * - `primeiroEm`/`ultimoEm`: o primeiro e o último evento de servidor do aluno no dia (instantes ISO como vieram);
 * - `minutos`: do primeiro ao último, arredondado;
 * - `eventos`: quantos eventos de servidor do aluno há no dia;
 * - `estudou`: houve evento de estudo ligado a uma matrícula (`EVENTOS_DE_ESTUDO`: aula, apostila, prova,
 *   conclusão); declaração, dúvida e certificado não contam;
 * - `declaracoes`: as declarações do dia, `{ matriculaId, versao, textoPadrao, em }`;
 * - `cobrada`: o dia é cobrado (a declaração já existia, ver `cobrarDesde`);
 * - `semDeclaracao`: quantos cursos tiveram estudo no dia sem nenhuma declaração dele. Sempre 0 em dia não cobrado.
 * `desde` ("AAAA-MM-DD"): não traz dia anterior a ele. Evento sem aluno ou com data ilegível é ignorado. A ordem de
 * entrada não importa. A ordem de saída é a de `montarLinhasDeAtividade`.
 * `cobrarDesde` ("AAAA-MM-DD", de `inicioDaCobranca`): primeiro dia em que a falta de declaração é cobrada. Omitido,
 * todo dia é cobrado; `null` (a empresa ainda não tem declaração) ou um valor que não é data, nenhum.
 */
export function janelasPorAlunoEDia(eventos, { desde = null, cobrarDesde } = {}) {
  const corte =
    cobrarDesde === undefined
      ? undefined
      : typeof cobrarDesde === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cobrarDesde)
        ? cobrarDesde
        : null;
  const cobra = (dia) => corte === undefined || (corte !== null && dia >= corte);
  const grupos = new Map();
  for (const e of Array.isArray(eventos) ? eventos : []) {
    if (!ehAtividadeDoAluno(e) || typeof e.funcionario_id !== "string" || !e.funcionario_id)
      continue;
    const ms = instante(e.created_at);
    if (ms === null) continue;
    const dia = hojeEmBrasilia(new Date(ms));
    if (desde && dia < desde) continue;
    const chave = `${e.funcionario_id}|${dia}`;
    let g = grupos.get(chave);
    if (!g) {
      g = {
        funcionarioId: e.funcionario_id,
        dia,
        primeiro: { ms, iso: e.created_at },
        ultimo: { ms, iso: e.created_at },
        eventos: 0,
        estudadas: new Set(),
        declaracoes: [],
      };
      grupos.set(chave, g);
    }
    g.eventos += 1;
    if (ms < g.primeiro.ms) g.primeiro = { ms, iso: e.created_at };
    if (ms > g.ultimo.ms) g.ultimo = { ms, iso: e.created_at };
    if (ehEventoDeEstudo(e) && typeof e.matricula_id === "string" && e.matricula_id) {
      g.estudadas.add(e.matricula_id);
    }
    if (e.evento === EVENTO_DECLARACAO_AMBIENTE && typeof e.matricula_id === "string") {
      const versao = e.detalhe?.versao;
      g.declaracoes.push({
        matriculaId: e.matricula_id,
        versao: Number.isInteger(versao) ? versao : null,
        textoPadrao: e.detalhe?.texto_padrao === true,
        em: e.created_at,
      });
    }
  }
  return [...grupos.values()].map((g) => {
    const declaradas = new Set(g.declaracoes.map((d) => d.matriculaId));
    const cobrada = cobra(g.dia);
    return {
      funcionarioId: g.funcionarioId,
      dia: g.dia,
      primeiroEm: g.primeiro.iso,
      ultimoEm: g.ultimo.iso,
      minutos: Math.round((g.ultimo.ms - g.primeiro.ms) / 60_000),
      eventos: g.eventos,
      estudou: g.estudadas.size > 0,
      cobrada,
      declaracoes: g.declaracoes.sort((a, b) => instante(a.em) - instante(b.em)),
      semDeclaracao: cobrada ? [...g.estudadas].filter((m) => !declaradas.has(m)).length : 0,
    };
  });
}

const SEM_NOME = "(funcionário removido)";

/**
 * As linhas da tela: `janelasPorAlunoEDia` com o nome do aluno (`funcionarios` é a lista de TODOS, inclusive
 * inativos), do dia mais novo para o mais antigo e, no mesmo dia, por nome.
 */
export function montarLinhasDeAtividade({ eventos, funcionarios, desde = null, cobrarDesde } = {}) {
  const nomes = new Map(
    (Array.isArray(funcionarios) ? funcionarios : []).map((f) => [f.id, f.nome_completo])
  );
  return janelasPorAlunoEDia(eventos, { desde, cobrarDesde })
    .map((l) => ({ ...l, nome: nomes.get(l.funcionarioId) || SEM_NOME }))
    .sort((a, b) =>
      a.dia === b.dia ? a.nome.localeCompare(b.nome, "pt-BR") : a.dia < b.dia ? 1 : -1
    );
}

// ------------------------------------------------------------------------------------------------ tela

/** "08:03 às 11:47 (3h44)", "08:03 às 08:48 (45 min)" ou "08:03 (um evento)". Horas de Brasília. */
export function textoDaJanela(linha) {
  const inicio = horaDeBrasilia(linha?.primeiroEm);
  if (!linha || !(linha.minutos > 0)) return `${inicio} (um evento)`;
  const horas = Math.floor(linha.minutos / 60);
  const resto = linha.minutos % 60;
  const duracao = horas ? `${horas}h${String(resto).padStart(2, "0")}` : `${resto} min`;
  return `${inicio} às ${horaDeBrasilia(linha.ultimoEm)} (${duracao})`;
}

const cursos = (n) => `${n} ${n === 1 ? "curso" : "cursos"}`;

const TEXTO_ANTES_DA_COBRANCA = "Antes da cobrança da declaração";

/**
 * A situação da declaração do dia, para a tela e o CSV: `{ tom, texto }`. `falta` (estudou sem declarar, vence
 * tudo), `atencao` (declarou com o texto padrão, que o RT ainda não aprovou), `ok` ou `neutro` (nada a declarar, ou
 * dia anterior à cobrança da declaração, em que houve estudo e não se acusa falta).
 */
export function textoDaDeclaracao(linha) {
  if ((linha?.semDeclaracao ?? 0) > 0) {
    return { tom: "falta", texto: `Estudou sem declarar (${cursos(linha.semDeclaracao)})` };
  }
  const declaracoes = linha?.declaracoes ?? [];
  if (!declaracoes.length) {
    return linha?.estudou && linha.cobrada === false
      ? { tom: "neutro", texto: TEXTO_ANTES_DA_COBRANCA }
      : { tom: "neutro", texto: "—" };
  }
  const quantos = new Set(declaracoes.map((d) => d.matriculaId)).size;
  const inicio = quantos > 1 ? `Declarou em ${quantos} cursos` : "Declarou";
  if (declaracoes.some((d) => d.textoPadrao)) {
    return { tom: "atencao", texto: `${inicio} (texto padrão, sem aprovação do RT)` };
  }
  const versoes = [...new Set(declaracoes.map((d) => d.versao).filter((v) => v !== null))].sort(
    (a, b) => a - b
  );
  return {
    tom: "ok",
    texto: versoes.length ? `${inicio} (texto ${versoes.map((v) => `v${v}`).join(" e ")})` : inicio,
  };
}

/** Busca por nome (sem acento nem maiúscula) e "só quem estudou sem declarar". */
export function filtrarAtividade(linhas, { busca = "", soSemDeclaracao = false } = {}) {
  const termo = normalizarTexto(busca);
  return (Array.isArray(linhas) ? linhas : []).filter(
    (l) =>
      (!termo || normalizarTexto(l.nome).includes(termo)) &&
      (!soSemDeclaracao || l.semDeclaracao > 0)
  );
}

/** O quadro do topo: alunos com atividade, dias (linhas) e dias em que houve estudo sem declaração. */
export function resumirAtividade(linhas) {
  const lista = Array.isArray(linhas) ? linhas : [];
  return {
    alunos: new Set(lista.map((l) => l.funcionarioId)).size,
    dias: lista.length,
    semDeclaracao: lista.filter((l) => l.semDeclaracao > 0).length,
  };
}

const dataBR = (dia) => String(dia).split("-").reverse().join("/");

/**
 * O aviso do relatório sobre o corte da cobrança, ou `null` quando não há o que avisar: `{ tom, texto }`.
 * `inicioCobranca`: `inicioDaCobranca(...)` (null = a empresa ainda não tem nenhuma declaração); `diaInicial`: o
 * primeiro dia do período mostrado. Só avisa quando o período tem dia sem cobrança.
 */
export function avisoDaCobranca({ inicioCobranca, diaInicial } = {}) {
  if (inicioCobranca === null) {
    return {
      tom: "atencao",
      texto:
        "Nenhum aluno declarou ainda nesta empresa: nada é cobrado. A tabela mostra só a atividade, e a " +
        "cobrança começa no dia seguinte ao da primeira declaração.",
    };
  }
  if (typeof inicioCobranca !== "string" || !diaInicial || diaInicial >= inicioCobranca)
    return null;
  return {
    tom: "neutro",
    texto:
      `A declaração só é cobrada a partir de ${dataBR(inicioCobranca)} (o dia seguinte ao da primeira ` +
      `declaração da empresa). Os dias anteriores aparecem como "${TEXTO_ANTES_DA_COBRANCA}" e não ` +
      "entram na contagem de quem estudou sem declarar.",
  };
}

const COLUNAS_DO_CSV = [
  { titulo: "Aluno", valor: (l) => l.nome },
  { titulo: "Dia", valor: (l) => dataBR(l.dia) },
  { titulo: "Primeiro evento", valor: (l) => horaDeBrasilia(l.primeiroEm) },
  { titulo: "Último evento", valor: (l) => horaDeBrasilia(l.ultimoEm) },
  { titulo: "Janela (min)", valor: (l) => l.minutos },
  { titulo: "Eventos de servidor", valor: (l) => l.eventos },
  { titulo: "Declaração", valor: (l) => textoDaDeclaracao(l).texto },
  { titulo: "Cursos sem declaração", valor: (l) => l.semDeclaracao },
];

/**
 * O CSV das linhas (as que a tela mostra), separador ";" e quebras CRLF. O BOM do UTF-8 é posto por quem grava o
 * arquivo. O nome que começaria uma fórmula no Excel ganha um apóstrofo (`celulaDoCsv`).
 */
export function csvDaAtividade(linhas) {
  const cabecalho = COLUNAS_DO_CSV.map((c) => celulaDoCsv(c.titulo)).join(";");
  const corpo = (Array.isArray(linhas) ? linhas : []).map((l) =>
    COLUNAS_DO_CSV.map((c) => celulaDoCsv(c.valor(l))).join(";")
  );
  return [cabecalho, ...corpo].join("\r\n");
}
