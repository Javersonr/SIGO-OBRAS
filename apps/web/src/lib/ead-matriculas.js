/**
 * Tabela de matrículas da tela do RH (T22) — regras puras, sem DOM e sem rede.
 *
 * Quem usa: components/seguranca/MatriculasEadCard.jsx (tabela, busca, filtros, ordenação, "Renovar",
 * exportação em CSV e aviso aos atrasados). Os testes ficam em ead-matriculas.test.js.
 *
 * `montarLinhas` junta numa linha só tudo o que a tabela mostra: quem, qual curso, andamento (aulas x/y,
 * nota, tentativas), vencimento, certificado e prazo. A regra de vencimento é a MESMA do painel
 * "Vencimentos" (`conclusoesVigentes`, de ead-vencimentos.js): uma conclusão antiga, que já foi renovada
 * por outra, vira histórico e não conta como vencida.
 *
 * Prazo para concluir (T22, com o prazo do projeto pedagógico da T25): `prazoDaMatricula` olha o
 * `prazo_conclusao_dias` do curso (coluna da migração 0141, escrita no projeto pedagógico) e, na falta dele, o
 * prazo padrão da tela. Sem nenhum dos dois não há prazo e ninguém fica "atrasado": é o comportamento de antes.
 */
import { normalizarTexto } from "./busca";
import { renovacaoParaExibir } from "./portal-curso";
import { emiteCertificado, modalidadeDoCurso } from "./ead-requisitos";
import { textoDoTipoDaMatricula } from "./ead-tipo-matricula";
import {
  conclusoesVigentes,
  diasParaVencer,
  faixaDoVencimento,
  rotuloDoVencimento,
} from "./ead-vencimentos";

// ------------------------------------------------------------------------------------------------ datas

const MS_POR_DIA = 86_400_000;

/** "AAAA-MM-DD" → ms em UTC da meia-noite do dia; null se não for uma data real. */
function diaEmMs(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(texto ?? ""));
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(ano, mes - 1, dia);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return ms;
}

const FORMATO_BRASILIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * O dia ("AAAA-MM-DD") em que o instante caiu, no fuso de Brasília (o mesmo dia que o servidor grava em
 * `data_conclusao`). Data sem hora ("2026-09-10") volta como está. Valor ilegível: null.
 */
export function diaEmBrasilia(valor) {
  if (!valor) return null;
  const texto = String(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return diaEmMs(texto) === null ? null : texto;
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return null;
  return FORMATO_BRASILIA.format(data);
}

/** Soma `n` dias de calendário a uma data "AAAA-MM-DD" (n pode ser negativo); null se a data não vale. */
export function somarDias(dia, n) {
  const ms = diaEmMs(dia);
  if (ms === null || !Number.isFinite(n)) return null;
  return new Date(ms + n * MS_POR_DIA).toISOString().slice(0, 10);
}

/** Dias de prazo aceitos: inteiro de 1 a 3650 (número ou texto numérico); o resto é "sem prazo". */
export function diasDePrazoValidos(valor) {
  const n = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor;
  return Number.isInteger(n) && n > 0 && n <= 3650 ? n : null;
}

/**
 * Prazo para concluir uma matrícula ainda aberta: data da matrícula (dia de Brasília) mais os dias. Os
 * dias vêm do curso (`prazo_conclusao_dias`, T25) e, se ele não tiver, do `prazoPadraoDias` da tela.
 * Devolve null quando não há prazo (nenhum dos dois valendo), a matrícula já está concluída ou não tem data.
 * `atrasada` só passa a valer no dia seguinte ao limite.
 * @returns {{ dias: number, limite: string, origem: "curso"|"padrao", atrasada: boolean, diasDeAtraso: number } | null}
 */
export function prazoDaMatricula({ matricula, curso, prazoPadraoDias, hoje } = {}) {
  if (!matricula || matricula.status === "concluido") return null;
  const doCurso = diasDePrazoValidos(curso?.prazo_conclusao_dias);
  const dias = doCurso ?? diasDePrazoValidos(prazoPadraoDias);
  if (!dias) return null;
  const base = diaEmBrasilia(matricula.created_at);
  const limite = base ? somarDias(base, dias) : null;
  if (!limite) return null;
  const faltam = diasParaVencer(limite, hoje);
  const passou = typeof faltam === "number" && faltam < 0;
  return {
    dias,
    limite,
    origem: doCurso ? "curso" : "padrao",
    atrasada: passou,
    diasDeAtraso: passou ? -faltam : 0,
  };
}

// ------------------------------------------------------------------------------------------- rótulos

const ROTULO_STATUS = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

/** Texto de tela do status da matrícula ("em_andamento" → "Em andamento"). */
export function rotuloDoStatus(status) {
  if (!status) return "—";
  return ROTULO_STATUS[status] ?? String(status);
}

/**
 * Nome para a tabela: o do cadastro; ex-funcionário (inativo ou excluído do cadastro) leva "(inativo)" e
 * a matrícula dele não vira "—". Sem cadastro nenhum: "—".
 */
export function nomeDoFuncionario(funcionario) {
  if (!funcionario) return "—";
  const nome = String(funcionario.nome_completo || "").trim() || "—";
  return ehInativo(funcionario) ? `${nome} (inativo)` : nome;
}

function ehInativo(funcionario) {
  return !funcionario || funcionario.ativo === false || !!funcionario.deleted_at;
}

// ------------------------------------------------------------------------------------------- linhas

const viva = (linha) => !!linha && !linha.deleted_at;
const emAberto = (m) => m.status !== "concluido";
const numeroOuNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Uma linha por matrícula viva, com tudo o que a tabela e o CSV mostram.
 *
 * `funcionarios` traz TODOS (ativos e ex-funcionários): quem não está ativo aparece como "Nome (inativo)".
 * `progresso` = linhas de `treinamento_progresso` (matricula_id, aula_id, concluida) e `tentativas` = linhas
 * de `treinamento_tentativa` (matricula_id, numero, nota). `aulas` são as aulas vivas dos cursos: só elas
 * entram na conta de "aulas x de y" (progresso de aula removida não conta). `andamentoCarregado` = false
 * (o progresso e as tentativas ainda não chegaram, ou falharam): aulas feitas, percentual e tentativas ficam
 * NULOS em vez de 0, para a tela e o CSV não afirmarem que ninguém começou.
 *
 * Campos de cada linha (além de `id`, `matricula`, `curso` e `funcionario`):
 *  - nomes: funcionarioNome, inativo, funcaoNome, cursoNome, cursoCodigo, modalidade, apoio, tipoTexto (o
 *    tipo do treinamento da T23: "Inicial", "Periódico" ou "Eventual: motivo");
 *  - andamento: status, statusRotulo, aulasFeitas, aulasTotal, percentual (null sem aulas), nota,
 *    aprovada, tentativas, tentativasMax (null = sem limite), matriculadoEm;
 *  - fim: dataConclusao, renovacao ("renovar até"; null no curso de apoio), dias, vigente, faixa
 *    ("vencido" | "ate30" | "ate60" | "ate90" | null; só da conclusão vigente de quem está ativo),
 *    renovacaoEmAndamento (concluída e já há outra matrícula aberta no curso), substituida (concluída e
 *    já há outra concluída mais nova do mesmo funcionário no curso: virou histórico), podeRenovar;
 *  - certificado: certificado, certificadoCodigo, certificadoSituacao ("emitido" | "revogado" |
 *    "nao_emite" | "sem");
 *  - prazo: prazo (ver `prazoDaMatricula`) e atrasada (prazo vencido E funcionário ativo);
 *  - textoBusca: o que a busca varre, já normalizado.
 */
export function montarLinhas({
  matriculas = [],
  cursos = [],
  funcionarios = [],
  aulas = [],
  progresso = [],
  tentativas = [],
  certificados = [],
  hoje,
  prazoPadraoDias = null,
  andamentoCarregado = true,
} = {}) {
  const vivas = (matriculas ?? []).filter(viva);
  const funcPorId = new Map((funcionarios ?? []).map((f) => [f.id, f]));
  const cursoPorId = new Map((cursos ?? []).filter(viva).map((c) => [c.id, c]));

  const aulasDoCurso = new Map();
  for (const a of aulas ?? []) {
    if (!viva(a)) continue;
    const ids = aulasDoCurso.get(a.curso_id) ?? new Set();
    ids.add(a.id);
    aulasDoCurso.set(a.curso_id, ids);
  }
  const feitasDaMatricula = new Map();
  for (const p of progresso ?? []) {
    if (!p?.concluida) continue;
    const ids = feitasDaMatricula.get(p.matricula_id) ?? new Set();
    ids.add(p.aula_id);
    feitasDaMatricula.set(p.matricula_id, ids);
  }
  const tentativasDaMatricula = new Map();
  for (const t of tentativas ?? []) {
    const lista = tentativasDaMatricula.get(t.matricula_id) ?? [];
    lista.push(t);
    tentativasDaMatricula.set(t.matricula_id, lista);
  }
  const certificadoDaMatricula = new Map();
  for (const c of certificados ?? []) {
    if (c?.matricula_id && !certificadoDaMatricula.has(c.matricula_id)) {
      certificadoDaMatricula.set(c.matricula_id, c);
    }
  }

  // o par funcionário|curso: há matrícula aberta? qual é a concluída mais nova?
  const abertaNoPar = new Set();
  const maisNovaConcluida = new Map();
  for (const m of vivas) {
    const chave = `${m.funcionario_id}|${m.curso_id}`;
    if (emAberto(m)) {
      abertaNoPar.add(chave);
      continue;
    }
    const atual = maisNovaConcluida.get(chave);
    if (!atual || String(m.created_at ?? "") > String(atual.created_at ?? "")) {
      maisNovaConcluida.set(chave, m);
    }
  }
  const vigentes = new Set(
    [...conclusoesVigentes({ matriculas: vivas, cursos, funcionarios, certificados }).values()].map(
      (m) => m.id
    )
  );

  return vivas.map((m) => {
    const funcionario = funcPorId.get(m.funcionario_id);
    const curso = cursoPorId.get(m.curso_id);
    const inativo = ehInativo(funcionario);
    const modalidade = modalidadeDoCurso(curso);
    const apoio = modalidade === "apoio";
    const par = `${m.funcionario_id}|${m.curso_id}`;
    const concluida = m.status === "concluido";

    const idsDasAulas = aulasDoCurso.get(m.curso_id) ?? new Set();
    const feitas = feitasDaMatricula.get(m.id) ?? new Set();
    let aulasFeitas = 0;
    for (const id of feitas) if (idsDasAulas.has(id)) aulasFeitas += 1;
    const aulasTotal = idsDasAulas.size;

    const suasTentativas = tentativasDaMatricula.get(m.id) ?? [];
    const ultimaTentativa = suasTentativas.reduce(
      (a, t) => (!a || Number(t.numero) > Number(a.numero) ? t : a),
      null
    );
    const nota = numeroOuNull(m.nota_avaliacao) ?? numeroOuNull(ultimaTentativa?.nota);
    const percentual = aulasTotal ? Math.floor((aulasFeitas * 100) / aulasTotal) : null;
    const limiteTentativas = Number(curso?.max_tentativas) || 0;
    const extras = Math.max(0, Number(m.tentativas_extras) || 0);

    const renovacao = renovacaoParaExibir(curso, m);
    const dias = renovacao ? diasParaVencer(renovacao, hoje) : null;
    const vigente = vigentes.has(m.id);
    const certificado = certificadoDaMatricula.get(m.id) ?? null;
    const emite = emiteCertificado(modalidade);
    const prazo = prazoDaMatricula({ matricula: m, curso, prazoPadraoDias, hoje });

    const funcionarioNome = nomeDoFuncionario(funcionario);
    const cursoNome = curso?.nome || "(curso removido)";
    const funcaoNome = funcionario?.funcao_nome || "";
    const certificadoCodigo = certificado?.codigo || "";

    return {
      id: m.id,
      matricula: m,
      curso,
      funcionario,
      funcionarioId: m.funcionario_id,
      cursoId: m.curso_id,
      funcionarioNome,
      inativo,
      funcaoNome,
      cursoNome,
      cursoCodigo: curso?.codigo || "",
      modalidade,
      apoio,
      // inicial, periódico ou eventual com o motivo (T23); vazio na matrícula lida antes da migração 0142
      tipoTexto: textoDoTipoDaMatricula(m),
      status: m.status,
      statusRotulo: rotuloDoStatus(m.status),
      aulasFeitas: andamentoCarregado ? aulasFeitas : null,
      aulasTotal,
      percentual: andamentoCarregado ? percentual : null,
      nota,
      aprovada: typeof m.avaliacao_aprovada === "boolean" ? m.avaliacao_aprovada : null,
      tentativas: andamentoCarregado ? suasTentativas.length : null,
      tentativasMax: limiteTentativas > 0 ? limiteTentativas + extras : null,
      matriculadoEm: diaEmBrasilia(m.created_at),
      dataConclusao: m.data_conclusao ? String(m.data_conclusao).slice(0, 10) : null,
      renovacao: renovacao ? String(renovacao).slice(0, 10) : null,
      dias,
      vigente,
      faixa: vigente && !inativo ? faixaDoVencimento(dias) : null,
      renovacaoEmAndamento: concluida && abertaNoPar.has(par),
      substituida: concluida && maisNovaConcluida.get(par)?.id !== m.id,
      podeRenovar:
        concluida &&
        !apoio &&
        !inativo &&
        !!curso &&
        !abertaNoPar.has(par) &&
        maisNovaConcluida.get(par)?.id === m.id,
      certificado,
      certificadoCodigo,
      certificadoSituacao: certificado
        ? certificado.revogado_em
          ? "revogado"
          : "emitido"
        : emite
          ? "sem"
          : "nao_emite",
      prazo,
      atrasada: !!prazo?.atrasada && !inativo,
      textoBusca: normalizarTexto(
        [funcionarioNome, cursoNome, curso?.codigo, funcaoNome, certificadoCodigo].join(" ")
      ),
    };
  });
}

// -------------------------------------------------------------------------------- filtros e ordem

/** Filtros zerados da tabela. `status`: "" | pendente | em_andamento | concluido | atrasada. */
export const FILTROS_VAZIOS = Object.freeze({
  busca: "",
  cursoId: "",
  status: "",
  vencimento: "",
});

/**
 * Aplica busca e filtros (todos precisam valer).
 *  - `busca`: cada palavra precisa aparecer no funcionário, curso, código do curso, função ou código do
 *    certificado, sem diferenciar maiúsculas nem acentos;
 *  - `cursoId` e `status` (inclui "atrasada");
 *  - `vencimento`: "vencido" | "ate30" | "ate60" | "ate90" (as faixas do painel Vencimentos) ou
 *    "sem_renovacao" (vencida ou a vencer em 90 dias e sem outra matrícula aberta no curso).
 */
export function filtrarLinhas(linhas, filtros = FILTROS_VAZIOS) {
  const f = { ...FILTROS_VAZIOS, ...(filtros ?? {}) };
  const termos = normalizarTexto(f.busca).split(/\s+/).filter(Boolean);
  return (linhas ?? []).filter((l) => {
    if (f.cursoId && l.cursoId !== f.cursoId) return false;
    if (f.status === "atrasada") {
      if (!l.atrasada) return false;
    } else if (f.status && l.status !== f.status) {
      return false;
    }
    if (f.vencimento === "sem_renovacao") {
      if (!l.faixa || l.renovacaoEmAndamento) return false;
    } else if (f.vencimento && l.faixa !== f.vencimento) {
      return false;
    }
    return termos.every((t) => l.textoBusca.includes(t));
  });
}

const COLADOR = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const ORDEM_DO_STATUS = { pendente: 0, em_andamento: 1, concluido: 2 };

const CHAVES_DE_ORDEM = {
  funcionario: (l) => l.funcionarioNome,
  curso: (l) => l.cursoNome,
  status: (l) => ORDEM_DO_STATUS[l.status] ?? 9,
  progresso: (l) => l.percentual,
  nota: (l) => l.nota,
  tentativas: (l) => l.tentativas,
  matriculadoEm: (l) => l.matriculadoEm,
  conclusao: (l) => l.dataConclusao,
  renovacao: (l) => l.renovacao,
  prazo: (l) => l.prazo?.limite ?? null,
};

/** As colunas pelas quais a tabela pode ser ordenada. */
export const CAMPOS_DE_ORDEM = Object.keys(CHAVES_DE_ORDEM);

function compararValores(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return COLADOR.compare(String(a), String(b));
}

/**
 * Ordena sem mexer na lista original. Valor vazio (sem nota, sem data...) fica sempre no fim, em qualquer
 * direção. Empate: nome do funcionário, depois curso, depois id (a ordem não muda de uma vez para outra).
 * Campo desconhecido ou ausente mantém a ordem recebida.
 */
export function ordenarLinhas(linhas, ordem) {
  const lista = [...(linhas ?? [])];
  const chave = CHAVES_DE_ORDEM[ordem?.campo];
  if (!chave) return lista;
  const sinal = ordem.direcao === "desc" ? -1 : 1;
  return lista.sort((a, b) => {
    const va = chave(a);
    const vb = chave(b);
    const semA = va === null || va === undefined || va === "";
    const semB = vb === null || vb === undefined || vb === "";
    if (semA !== semB) return semA ? 1 : -1;
    const c = semA ? 0 : sinal * compararValores(va, vb);
    return (
      c ||
      COLADOR.compare(a.funcionarioNome, b.funcionarioNome) ||
      COLADOR.compare(a.cursoNome, b.cursoNome) ||
      String(a.id).localeCompare(String(b.id))
    );
  });
}

/** Contagem para o rodapé da tabela: total, por status e atrasadas. */
export function resumirLinhas(linhas) {
  const resumo = { total: 0, pendente: 0, em_andamento: 0, concluido: 0, atrasadas: 0 };
  for (const l of linhas ?? []) {
    resumo.total += 1;
    if (l.status in resumo) resumo[l.status] += 1;
    if (l.atrasada) resumo.atrasadas += 1;
  }
  return resumo;
}

// ------------------------------------------------------------------------------------------------ CSV

const dataBR = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const notaBR = (n) =>
  n === null || n === undefined ? "" : String(Number(n.toFixed(1))).replace(".", ",");
const textoOuVazio = (v) => (v === null || v === undefined ? "" : String(v));

const SITUACAO_DO_CERTIFICADO = {
  emitido: "Emitido",
  revogado: "Revogado",
  nao_emite: "Não emite certificado",
  sem: "Ainda sem certificado",
};

/** Colunas do CSV, na ordem: o título e como tirar o valor da linha. */
export const COLUNAS_DO_CSV = [
  { titulo: "Funcionário", valor: (l) => l.funcionarioNome },
  { titulo: "Função", valor: (l) => l.funcaoNome },
  { titulo: "Curso", valor: (l) => l.cursoNome },
  {
    titulo: "Modalidade",
    valor: (l) => (l.apoio ? "Apoio" : l.modalidade === "ead" ? "EAD" : l.modalidade),
  },
  { titulo: "Tipo de treinamento", valor: (l) => l.tipoTexto },
  { titulo: "Status", valor: (l) => l.statusRotulo },
  { titulo: "Aulas concluídas", valor: (l) => l.aulasFeitas },
  { titulo: "Total de aulas", valor: (l) => l.aulasTotal },
  { titulo: "Progresso (%)", valor: (l) => l.percentual },
  { titulo: "Nota", valor: (l) => notaBR(l.nota) },
  { titulo: "Tentativas", valor: (l) => l.tentativas },
  { titulo: "Matriculado em", valor: (l) => dataBR(l.matriculadoEm) },
  { titulo: "Prazo limite", valor: (l) => dataBR(l.prazo?.limite) },
  { titulo: "Atrasada", valor: (l) => (l.atrasada ? "Sim" : "") },
  { titulo: "Concluído em", valor: (l) => dataBR(l.dataConclusao) },
  { titulo: "Renovar até", valor: (l) => dataBR(l.renovacao) },
  {
    titulo: "Situação do vencimento",
    valor: (l) => (l.vigente && typeof l.dias === "number" ? rotuloDoVencimento(l.dias) : ""),
  },
  { titulo: "Certificado", valor: (l) => l.certificadoCodigo },
  {
    titulo: "Situação do certificado",
    valor: (l) => SITUACAO_DO_CERTIFICADO[l.certificadoSituacao] ?? "",
  },
];

/**
 * Uma célula do CSV (separador ";", como o Excel em português espera). Texto que começa com = + - @ (ou
 * tabulação/retorno) seria lido como fórmula: ganha um apóstrofo na frente. Aspas, ";" e quebras de linha
 * pedem aspas (as aspas de dentro são dobradas).
 */
export function celulaDoCsv(valor) {
  let texto = textoOuVazio(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * O CSV das linhas (as que a tela mostra, já filtradas e ordenadas), com cabeçalho e quebras CRLF. O
 * BOM do UTF-8 (para o Excel acertar os acentos) é posto por quem grava o arquivo.
 */
export function csvDasLinhas(linhas) {
  const cabecalho = COLUNAS_DO_CSV.map((c) => celulaDoCsv(c.titulo)).join(";");
  const corpo = (linhas ?? []).map((l) =>
    COLUNAS_DO_CSV.map((c) => celulaDoCsv(c.valor(l))).join(";")
  );
  return [cabecalho, ...corpo].join("\r\n");
}
