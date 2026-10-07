/**
 * Projeto pedagógico estruturado do curso EAD (T25; NR-1, Anexo II, itens 3.1 e 3.3) — regras puras, sem DOM
 * e sem rede. Quem usa: components/seguranca/ProjetoPedagogicoCurso.jsx (a seção do curso),
 * lib/ead-projeto-pdf.js (o PDF do projeto), VencimentosEadPainel.jsx (revisão vencida) e a tela do curso
 * (TreinamentosEadTab.jsx, que grava). Testes em ead-projeto.test.js.
 *
 * O CÓDIGO SÓ ESTRUTURA. O texto do projeto é do responsável técnico (D5): nada aqui escreve, sugere nem
 * preenche conteúdo pedagógico. Os 15 itens do 3.1 (letras a a o) são montados assim:
 *
 *   - 9 itens são preenchidos no curso, em colunas próprias de `treinamento_curso` (migração 0141):
 *     (a) objetivo_geral, (b) principios_sst, (c) estrategia_pedagogica, (f) infraestrutura_apoio,
 *     (h) modulos_objetivos (um objetivo por módulo), (j) dedicacao_diaria_min, (k) prazo_conclusao_dias,
 *     (l) publico_alvo e (n) instrumentos_aprendizagem. São do EAD e ficam FORA do cadastro central: o RH os
 *     escreve no curso e eles não mudam as exigências das funções (a 0131 não toca nessas colunas);
 *   - 6 itens vêm do que o curso já tinha: (d) responsável técnico, (e) instrutor, (g) conteúdo
 *     programático (ou a lista de aulas, quando o campo está vazio), (i) carga horária, (m) material
 *     didático (as aulas) e (o) avaliação (as questões, a nota mínima, as tentativas).
 *
 * Validação do projeto (3.3, a cada 2 anos ou quando a NR mudar): `projeto_validado_por` (quem validou, o
 * responsável técnico), `projeto_validado_em` e `proxima_revisao`. Os gatilhos de mudança de NR estão em
 * GATILHOS_DE_REVISAO (D5 do handoff).
 *
 * PDF x projeto: o PDF é um arquivo parado. Quem o grava (Gerar PDF do projeto, ou o anexo próprio) grava junto a
 * marca dos 12 campos do projeto (`projeto_pdf_marca`, lib ead-projeto-marca.js); o PDF só vale enquanto a marca
 * bate com a dos campos de hoje. Mudou texto, validação ou data de revisão depois do PDF: "desatualizado".
 */
import {
  estadoDoPdfDoProjeto,
  lerListaDeObjetivos,
  marcaDoProjeto,
  objetivosValidos,
} from "./ead-projeto-marca";
import { MIN_QUESTOES, modalidadeDoCurso } from "./ead-requisitos";
import { diasParaVencer, hojeEmBrasilia } from "./ead-vencimentos";
import { numerarAulas } from "./portal-curso";
import { formatarMinutos } from "./portal-prazo";

// a marca do PDF vive num módulo sem dependências (o servidor testa a mesma regra); a tela importa daqui
export { estadoDoPdfDoProjeto, marcaDoProjeto };

/** Limite de cada texto do projeto (igual ao CHECK da migração 0141). */
export const LIMITE_TEXTO_PROJETO = 4000;
/** Limite do nome de quem validou (igual ao CHECK da migração 0141). */
export const LIMITE_VALIDADO_POR = 120;
/** Dedicação diária: de 1 minuto a 24 h (igual ao CHECK da migração 0141). */
export const MAX_DEDICACAO_MIN = 1440;
/** Prazo para concluir: de 1 a 3650 dias, como o prazo da matrícula (igual ao CHECK da migração 0141). */
export const MAX_PRAZO_DIAS = 3650;
/** Anexo II, 3.3: o projeto é validado a cada 2 anos. */
export const ANOS_ENTRE_REVISOES = 2;
/** O painel avisa que a revisão vai vencer quando faltam até tantos dias (como as faixas de vencimento). */
export const DIAS_DE_AVISO_DA_REVISAO = 90;

/** Os seis itens de texto livre do projeto, na ordem em que a tela os mostra. */
export const CAMPOS_DE_TEXTO_DO_PROJETO = [
  "objetivo_geral",
  "principios_sst",
  "estrategia_pedagogica",
  "infraestrutura_apoio",
  "publico_alvo",
  "instrumentos_aprendizagem",
];

/** As 12 colunas do projeto no curso (migração 0141): os 9 itens escritos pelo RH e os 3 campos da validação. */
export const CAMPOS_DO_PROJETO = [
  ...CAMPOS_DE_TEXTO_DO_PROJETO,
  "dedicacao_diaria_min",
  "prazo_conclusao_dias",
  "modulos_objetivos",
  "projeto_validado_em",
  "projeto_validado_por",
  "proxima_revisao",
];

/** Só os campos do projeto de um formulário de curso (o que o RH escreveu na seção); ausente fica de fora. */
export function camposDoProjeto(curso) {
  const saida = {};
  for (const campo of CAMPOS_DO_PROJETO) {
    if (curso && campo in curso) saida[campo] = curso[campo];
  }
  return saida;
}

/**
 * Os 15 itens do Anexo II, 3.1, na ordem da norma. `origem`: "projeto" (coluna nova, o RH escreve na seção) ou
 * "curso" (vem de campos que o curso já tinha). `ajuda` é a dica da tela; `onde` diz onde editar os de "curso".
 */
export const ITENS_DO_PROJETO = [
  {
    letra: "a",
    titulo: "Objetivo geral",
    origem: "projeto",
    campo: "objetivo_geral",
    ajuda: "O que o aluno estará apto a fazer ao concluir o curso.",
  },
  {
    letra: "b",
    titulo: "Princípios e conceitos de SST definidos nas NR",
    origem: "projeto",
    campo: "principios_sst",
    ajuda: "Os princípios e conceitos de segurança e saúde no trabalho que o curso trabalha.",
  },
  {
    letra: "c",
    titulo: "Estratégia pedagógica (teoria e prática)",
    origem: "projeto",
    campo: "estrategia_pedagogica",
    ajuda: "Como o conteúdo é ensinado: vídeos, apostila, prova e, se houver, a prática.",
  },
  {
    letra: "d",
    titulo: "Responsável técnico",
    origem: "curso",
    onde: "campos Responsável técnico e Registro, acima",
  },
  {
    letra: "e",
    titulo: "Relação de instrutores",
    origem: "curso",
    onde: "campos Instrutor e Qualificação, acima",
  },
  {
    letra: "f",
    titulo: "Infraestrutura operacional de apoio e controle",
    origem: "projeto",
    campo: "infraestrutura_apoio",
    ajuda: "O ambiente virtual, o canal de dúvidas e o controle de acesso e de conclusão.",
  },
  {
    letra: "g",
    titulo: "Conteúdo programático teórico e prático",
    origem: "curso",
    onde: "campo Conteúdo programático, acima (vazio: vale a lista de aulas)",
  },
  {
    letra: "h",
    titulo: "Objetivo de cada módulo",
    origem: "projeto",
    campo: "modulos_objetivos",
    ajuda: "Um objetivo para cada módulo das aulas.",
  },
  {
    letra: "i",
    titulo: "Carga horária",
    origem: "curso",
    onde: "campo Carga horária, acima",
  },
  {
    letra: "j",
    titulo: "Estimativa de tempo mínimo de dedicação diária",
    origem: "projeto",
    campo: "dedicacao_diaria_min",
    ajuda: "Minutos por dia que o aluno precisa reservar. O aluno vê no portal.",
  },
  {
    letra: "k",
    titulo: "Prazo máximo para conclusão",
    origem: "projeto",
    campo: "prazo_conclusao_dias",
    ajuda: "Dias, contados da matrícula. Vale para as matrículas deste curso (RH e aluno veem).",
  },
  {
    letra: "l",
    titulo: "Público-alvo",
    origem: "projeto",
    campo: "publico_alvo",
    ajuda: "Para quem o curso é: funções e atividades.",
  },
  {
    letra: "m",
    titulo: "Material didático",
    origem: "curso",
    onde: "as aulas do curso (vídeos, apostilas e textos), mais abaixo",
  },
  {
    letra: "n",
    titulo: "Instrumentos para potencialização do aprendizado",
    origem: "projeto",
    campo: "instrumentos_aprendizagem",
    ajuda: "O que ajuda o aluno a aprender: legendas, comentários das questões, canal de dúvidas.",
  },
  {
    letra: "o",
    titulo: "Avaliação de aprendizagem",
    origem: "curso",
    onde: "as questões do curso e os campos de nota mínima e tentativas, acima",
  },
];

/** Nome de cada coluna de texto na mensagem de erro. */
const ROTULO_DO_CAMPO = Object.fromEntries(
  ITENS_DO_PROJETO.filter((i) => i.campo).map((i) => [i.campo, i.titulo])
);

// ------------------------------------------------------------------------------------------ pequenos

const texto = (v) => String(v ?? "").trim();
const linhasDe = (v) =>
  texto(v)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
const viva = (x) => !!x && !x.deleted_at;
const plural = (n, um, varios) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);
const fmtData = (dia) => String(dia).slice(0, 10).split("-").reverse().join("/");

/** "AAAA-MM-DD" que é um dia real, ou null (vazio, outro formato, 30 de fevereiro...). */
function diaValido(valor) {
  const t = texto(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return diasParaVencer(t, t) === 0 ? t : null;
}

/** Soma anos a "AAAA-MM-DD"; 29/02 num ano sem 29/02 vira 28/02. Data que não vale: null. */
export function somarAnos(dia, anos) {
  const t = diaValido(dia);
  if (!t || !Number.isInteger(anos)) return null;
  const [a, m, d] = t.split("-").map(Number);
  const ano = a + anos;
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return `${String(ano).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(
    Math.min(d, ultimo)
  ).padStart(2, "0")}`;
}

// ------------------------------------------------------------------------------------------- módulos

const aulasEmOrdem = (aulas) =>
  (Array.isArray(aulas) ? aulas : []).filter(viva).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

/**
 * Os módulos do curso, na ordem em que aparecem nas aulas (o módulo é só o rótulo `modulo` da aula). Aula
 * sem módulo vira o grupo "Aulas sem módulo" ("modulo" = ""); se NENHUMA aula tem módulo, o curso inteiro é
 * um módulo só ("Curso inteiro"). Sem aulas, sem módulos.
 * @returns {{ modulo: string, rotulo: string }[]}
 */
export function modulosDoCurso(aulas) {
  const nomes = [];
  for (const a of aulasEmOrdem(aulas)) {
    const m = texto(a.modulo);
    if (!nomes.includes(m)) nomes.push(m);
  }
  const algumNomeado = nomes.some(Boolean);
  return nomes.map((modulo) => ({
    modulo,
    rotulo: modulo || (algumNomeado ? "Aulas sem módulo" : "Curso inteiro"),
  }));
}

// `modulos_objetivos` é jsonb: uma lista de { modulo, objetivo }. Dado vindo do legado pode ser texto (AGENTS.md).
// A leitura é a da marca (ead-projeto-marca.js): uma só, para a marca do que se grava bater com a do banco.
const lerLista = lerListaDeObjetivos;

/** Os objetivos que valem (com texto), aparados: [{ modulo, objetivo }]. Lixo e entrada vazia ficam de fora. */
export function objetivosDosModulos(valor) {
  return objetivosValidos(valor);
}

/** O objetivo do módulo como está na lista (sem aparar: é o que o RH está digitando). */
export function objetivoDoModulo(lista, modulo) {
  const chave = texto(modulo);
  const e = lerLista(lista).find((x) => x && typeof x === "object" && texto(x.modulo) === chave);
  return typeof e?.objetivo === "string" ? e.objetivo : "";
}

/** A lista com o objetivo do módulo trocado (ou acrescentado). Não altera a recebida e não apara o texto. */
export function comObjetivoDoModulo(lista, modulo, objetivo) {
  const base = lerLista(lista).filter((e) => e && typeof e === "object");
  const chave = texto(modulo);
  const novo = { modulo: chave, objetivo: String(objetivo ?? "") };
  const i = base.findIndex((e) => texto(e.modulo) === chave);
  return i < 0 ? [...base, novo] : base.map((e, j) => (j === i ? novo : e));
}

// ------------------------------------------------------------------------------------ os 15 itens

/**
 * Os 15 itens do projeto de um curso, com o que cada um diz e se está preenchido.
 *
 * Cada item: `letra`, `titulo`, `origem`, `campo`/`onde`/`ajuda` (da definição), `linhas` (o texto, uma
 * linha por entrada, para a tela e o PDF), `preenchido`, `pendencia` (o que fazer; null quando preenchido),
 * `fonte` (só no (g): "campo" ou "aulas") e `pendentes` (só no (h): os módulos sem objetivo).
 * @returns {{ itens: object[], total: 15, preenchidos: number, faltam: string[], completo: boolean,
 *   modulos: { modulo: string, rotulo: string }[] }}
 */
export function montarProjeto({ curso, aulas, questoes } = {}) {
  const c = curso || {};
  const vivas = aulasEmOrdem(aulas);
  const modulos = modulosDoCurso(vivas);
  const objetivos = new Map(
    objetivosDosModulos(c.modulos_objetivos).map((e) => [e.modulo, e.objetivo])
  );
  const questoesVivas = (Array.isArray(questoes) ? questoes : []).filter(viva);

  const doTexto = (campo, pendencia) => {
    const linhas = linhasDe(c[campo]);
    return { linhas, preenchido: linhas.length > 0, pendencia: linhas.length ? null : pendencia };
  };
  const pessoa = (nome, complemento, pendencia) => {
    const n = texto(nome);
    const extra = texto(complemento);
    return {
      linhas: n ? [extra ? `${n} — ${extra}` : n] : [],
      preenchido: !!n,
      pendencia: n ? null : pendencia,
    };
  };

  const resolvedores = {
    a: () => doTexto("objetivo_geral", "Escreva o objetivo geral do curso."),
    b: () => doTexto("principios_sst", "Escreva os princípios e conceitos de SST do curso."),
    c: () => doTexto("estrategia_pedagogica", "Descreva a estratégia pedagógica do curso."),
    d: () =>
      pessoa(
        c.responsavel_tecnico_nome,
        c.responsavel_tecnico_registro,
        "Informe o responsável técnico (campo do curso, acima)."
      ),
    e: () =>
      pessoa(
        c.instrutor_nome,
        c.instrutor_qualificacao,
        "Informe o instrutor (campo do curso, acima)."
      ),
    f: () => doTexto("infraestrutura_apoio", "Descreva a infraestrutura de apoio e controle."),
    g: () => {
      const doCampo = linhasDe(c.conteudo_programatico);
      if (doCampo.length) {
        return { linhas: doCampo, preenchido: true, pendencia: null, fonte: "campo" };
      }
      // campo vazio: o conteúdo é a lista de aulas, como o certificado a imprime
      const numeradas = numerarAulas(vivas);
      const linhas = [];
      let ultimo;
      for (const a of numeradas) {
        const modulo = texto(a.modulo);
        if (modulo && modulo !== ultimo) linhas.push(modulo);
        ultimo = modulo;
        linhas.push(`${a.numero}. ${texto(a.titulo) || "(sem título)"}`);
      }
      return {
        linhas,
        preenchido: linhas.length > 0,
        pendencia: linhas.length
          ? null
          : "Preencha o conteúdo programático (campo do curso) ou cadastre as aulas.",
        fonte: linhas.length ? "aulas" : null,
      };
    },
    h: () => {
      const pendentes = modulos.filter((m) => !objetivos.get(m.modulo)).map((m) => m.rotulo);
      const linhas = modulos
        .filter((m) => objetivos.get(m.modulo))
        .map((m) => `${m.rotulo}: ${objetivos.get(m.modulo)}`);
      const preenchido = modulos.length > 0 && pendentes.length === 0;
      return {
        linhas,
        preenchido,
        pendentes,
        pendencia: preenchido
          ? null
          : modulos.length === 0
            ? "Cadastre as aulas do curso: o objetivo é escrito por módulo."
            : `Escreva o objetivo de: ${pendentes.join(", ")}.`,
      };
    },
    i: () => {
      const horas = Number(c.carga_horaria_horas);
      const ok = Number.isFinite(horas) && horas > 0;
      return {
        linhas: ok ? [`${String(horas).replace(".", ",")} h`] : [],
        preenchido: ok,
        pendencia: ok ? null : "Defina a carga horária (campo do curso, acima).",
      };
    },
    j: () => {
      const t = formatarMinutos(c.dedicacao_diaria_min);
      return {
        linhas: t ? [`${t} por dia`] : [],
        preenchido: !!t,
        pendencia: t ? null : "Informe quantos minutos por dia o aluno deve dedicar, no mínimo.",
      };
    },
    k: () => {
      const dias = Number(c.prazo_conclusao_dias);
      const ok = Number.isInteger(dias) && dias > 0;
      return {
        linhas: ok ? [`${plural(dias, "dia", "dias")}, contados da data da matrícula`] : [],
        preenchido: ok,
        pendencia: ok ? null : "Informe o prazo máximo, em dias, para concluir o curso.",
      };
    },
    l: () => doTexto("publico_alvo", "Descreva o público-alvo do curso."),
    m: () => {
      const videos = vivas.filter((a) => (a.tipo || "video") === "video");
      const pdfs = vivas.filter((a) => a.tipo === "pdf");
      const textos = vivas.filter((a) => a.tipo === "texto");
      const linhas = [];
      if (videos.length) {
        const legendas = videos.filter((a) => texto(a.legenda_ref)).length;
        linhas.push(`Vídeos: ${videos.length}` + (legendas ? ` (${legendas} com legenda)` : ""));
      }
      if (pdfs.length) linhas.push(`Apostilas em PDF: ${pdfs.length}`);
      if (textos.length) linhas.push(`Aulas de texto: ${textos.length}`);
      return {
        linhas,
        preenchido: linhas.length > 0,
        pendencia: linhas.length
          ? null
          : "Cadastre as aulas do curso (vídeos, apostilas ou textos).",
      };
    },
    n: () =>
      doTexto("instrumentos_aprendizagem", "Descreva os instrumentos de apoio ao aprendizado."),
    o: () => {
      const total = questoesVivas.length;
      const ok = total >= MIN_QUESTOES;
      const nota = c.nota_minima ?? 70;
      const tentativas = c.max_tentativas ?? 3;
      const intervalo = c.intervalo_tentativa_min ?? 30;
      return {
        linhas: ok
          ? [
              `${plural(total, "questão", "questões")} de múltipla escolha`,
              `Nota mínima para aprovação: ${nota}%`,
              `Tentativas na prova: ${Number(tentativas) === 0 ? "sem limite" : `até ${tentativas}`}`,
              `Intervalo entre tentativas: ${intervalo} min`,
            ]
          : [],
        preenchido: ok,
        pendencia: ok ? null : `Cadastre pelo menos ${MIN_QUESTOES} questões.`,
      };
    },
  };

  const itens = ITENS_DO_PROJETO.map((def) => ({ ...def, ...resolvedores[def.letra]() }));
  const faltam = itens.filter((i) => !i.preenchido).map((i) => i.letra);
  return {
    itens,
    total: itens.length,
    preenchidos: itens.length - faltam.length,
    faltam,
    completo: faltam.length === 0,
    modulos,
  };
}

// ------------------------------------------------------------------------------------- gravação

function inteiroOpcional(valor, maximo, erro) {
  if (valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "")) {
    return { valor: null };
  }
  const n = typeof valor === "string" ? Number(valor.trim()) : valor;
  if (!Number.isInteger(n) || n < 1 || n > maximo) return { erro };
  return { valor: n };
}

/**
 * O que gravar nas 12 colunas do projeto a partir do formulário do curso (`curso`: o que o RH digitou), ou o
 * primeiro erro. Aparar os textos, esvaziar o que só tem espaços, respeitar os limites do banco e deixar só os
 * objetivos dos módulos que ainda existem nas aulas.
 *
 * Validar o projeto (`projeto_validado_em` + `projeto_validado_por`) pede os dois campos e os 15 itens
 * preenchidos: o responsável técnico não valida um projeto pela metade. Validado e sem data de revisão: a
 * próxima revisão é 2 anos depois (Anexo II, 3.3).
 * @param {object} curso
 * @param {{ aulas?: object[], questoes?: object[], hoje?: string }} [contexto]
 * @returns {{ ok: true, dados: object } | { ok: false, erro: string }}
 */
export function dadosDoProjetoParaGravar(curso, { aulas, questoes, hoje } = {}) {
  const c = curso || {};
  const dia = hoje || hojeEmBrasilia();
  const dados = {};

  for (const campo of CAMPOS_DE_TEXTO_DO_PROJETO) {
    const t = texto(c[campo]);
    if (t.length > LIMITE_TEXTO_PROJETO) {
      return {
        ok: false,
        erro: `${ROTULO_DO_CAMPO[campo]} passa de ${LIMITE_TEXTO_PROJETO} caracteres. Resuma o texto.`,
      };
    }
    dados[campo] = t || null;
  }

  const dedicacao = inteiroOpcional(
    c.dedicacao_diaria_min,
    MAX_DEDICACAO_MIN,
    `A dedicação diária deve ser um número inteiro de minutos, de 1 a ${MAX_DEDICACAO_MIN}.`
  );
  if (dedicacao.erro) return { ok: false, erro: dedicacao.erro };
  dados.dedicacao_diaria_min = dedicacao.valor;

  const prazo = inteiroOpcional(
    c.prazo_conclusao_dias,
    MAX_PRAZO_DIAS,
    `O prazo para concluir deve ser um número inteiro de dias, de 1 a ${MAX_PRAZO_DIAS}.`
  );
  if (prazo.erro) return { ok: false, erro: prazo.erro };
  dados.prazo_conclusao_dias = prazo.valor;

  // só os módulos que existem nas aulas, na ordem delas; objetivo vazio não é gravado
  const guardados = [];
  for (const m of modulosDoCurso(aulas)) {
    const objetivo = texto(objetivoDoModulo(c.modulos_objetivos, m.modulo));
    if (objetivo.length > LIMITE_TEXTO_PROJETO) {
      return {
        ok: false,
        erro: `O objetivo do módulo "${m.rotulo}" passa de ${LIMITE_TEXTO_PROJETO} caracteres. Resuma o texto.`,
      };
    }
    if (objetivo) guardados.push({ modulo: m.modulo, objetivo });
  }
  dados.modulos_objetivos = guardados.length ? guardados : null;

  // validação do responsável técnico (3.3)
  const validadoPor = texto(c.projeto_validado_por);
  if (validadoPor.length > LIMITE_VALIDADO_POR) {
    return {
      ok: false,
      erro: `O nome de quem validou passa de ${LIMITE_VALIDADO_POR} caracteres.`,
    };
  }
  const emBruto = texto(c.projeto_validado_em);
  const validadoEm = emBruto ? diaValido(emBruto) : null;
  if (emBruto && !validadoEm)
    return { ok: false, erro: "A data da validação não é uma data válida." };
  if (validadoEm && validadoEm > dia) {
    return { ok: false, erro: "A data da validação não pode ser futura." };
  }
  if (validadoEm && !validadoPor) return { ok: false, erro: "Informe quem validou o projeto." };
  if (validadoPor && !validadoEm)
    return { ok: false, erro: "Informe a data da validação do projeto." };

  const revisaoBruta = texto(c.proxima_revisao);
  let proximaRevisao = revisaoBruta ? diaValido(revisaoBruta) : null;
  if (revisaoBruta && !proximaRevisao) {
    return { ok: false, erro: "A data da próxima revisão não é uma data válida." };
  }
  if (validadoEm && proximaRevisao && proximaRevisao < validadoEm) {
    return { ok: false, erro: "A próxima revisão não pode ser anterior à data da validação." };
  }
  if (validadoEm && !proximaRevisao) proximaRevisao = somarAnos(validadoEm, ANOS_ENTRE_REVISOES);

  if (validadoEm) {
    const projeto = montarProjeto({ curso: { ...c, ...dados }, aulas, questoes });
    if (!projeto.completo) {
      const faltando = projeto.itens
        .filter((i) => !i.preenchido)
        .map((i) => `(${i.letra}) ${i.titulo}`)
        .join("; ");
      return {
        ok: false,
        erro: `Para registrar a validação, preencha antes os 15 itens do projeto. Faltam: ${faltando}.`,
      };
    }
  }

  dados.projeto_validado_em = validadoEm;
  dados.projeto_validado_por = validadoEm ? validadoPor : null;
  dados.proxima_revisao = proximaRevisao;
  return { ok: true, dados };
}

/**
 * O que mudar no formulário quando o RH escolhe a data da validação: a data e, se a próxima revisão ainda era
 * a sugerida (vazia, ou 2 anos depois da data antiga), a nova sugestão. Uma revisão que o RH escolheu fica.
 */
export function aoMudarValidacao(curso, novaData) {
  const nova = String(novaData ?? "");
  const patch = { projeto_validado_em: nova };
  const antiga = diaValido(curso?.projeto_validado_em);
  const proxima = texto(curso?.proxima_revisao);
  const sugeridaAntes = antiga ? somarAnos(antiga, ANOS_ENTRE_REVISOES) : null;
  if (proxima === "" || proxima === sugeridaAntes) {
    const sugerida = somarAnos(nova, ANOS_ENTRE_REVISOES);
    if (sugerida) patch.proxima_revisao = sugerida;
    else if (nova === "") patch.proxima_revisao = "";
  }
  return patch;
}

// ------------------------------------------------------------------------------ PDF x projeto (T25)

/**
 * O PDF do projeto diante do que o RH vê na tela agora: "sem_pdf", "atual" ou "desatualizado" (a marca do PDF contra
 * os 12 campos do formulário, já como seriam gravados: aparados e só com os módulos que existem nas aulas).
 */
export function estadoDoPdfDoFormulario(curso, { aulas, questoes } = {}) {
  return estadoDoPdfDoProjeto(comProjetoNormalizado(curso, { aulas, questoes }));
}

/**
 * O curso do formulário com os 12 campos do projeto como SERIAM gravados (aparados, só com os módulos que existem
 * nas aulas, a revisão sugerida de 2 anos quando há validação sem data). É o que a marca do PDF enxerga: a seção e
 * a lista de requisitos do formulário usam esta, para não discordarem logo depois de gerar o PDF (A6, T25). Se o
 * projeto não passa na conferência de gravação, devolve o curso como veio.
 */
export function comProjetoNormalizado(curso, { aulas, questoes } = {}) {
  if (!curso) return curso;
  const normal = dadosDoProjetoParaGravar(curso, { aulas, questoes });
  return normal.ok ? { ...curso, ...normal.dados } : curso;
}

/** O que a tela diz a quem tenta salvar o curso, gerar o PDF do projeto ou anexar um PDF próprio ao mesmo tempo. */
export const AVISO_PROJETO_OCUPADO =
  "Aguarde: o curso está sendo salvo, ou o PDF do projeto está sendo gerado ou enviado. Tente de novo em instantes.";

/** O que a tela diz depois de "Salvar curso" mudar o projeto de um curso que já tem PDF. */
export const AVISO_PDF_DESATUALIZADO =
  "O projeto mudou depois de o PDF ser gerado: o aluno e a fiscalização ainda veem o PDF antigo. " +
  'Clique em "Gerar PDF do projeto" para atualizá-lo (ou anexe o seu de novo).';

/**
 * O aviso para o RH depois de salvar, ou null. `gravado` é o curso como estava no banco e `dados` os 12 campos do
 * projeto que "Salvar curso" vai gravar (`dadosDoProjetoParaGravar`). Só avisa se o projeto MUDOU neste salvar e o
 * PDF passou a destoar dele (mudar de volta para o que o PDF diz não avisa; PDF já antigo e projeto igual também não:
 * a seção do curso e o painel já mostram).
 */
export function avisoDoPdfAoSalvar(gravado, dados) {
  if (marcaDoProjeto(gravado) === marcaDoProjeto(dados)) return null;
  return estadoDoPdfDoProjeto({ ...gravado, ...dados }) === "desatualizado"
    ? AVISO_PDF_DESATUALIZADO
    : null;
}

// ------------------------------------------------------------------------- revisão (Anexo II, 3.3)

/**
 * Mudanças de NR que obrigam a revisar o projeto (D5 do handoff: "NR-35 mudou em 16/07/2026; NR-10 muda em
 * 01/06/2027"). É dado do código: quando surgir outro gatilho, é só acrescentar uma linha. `padrao` reconhece o
 * curso pelo nome ou código (como o aviso de NR-35 da modalidade). Não é parecer jurídico.
 */
export const GATILHOS_DE_REVISAO = [
  {
    norma: "NR-35",
    padrao: /\bNR[\s-]*35\b/i,
    data: "2026-07-16",
    texto: "Portaria MTE 1.259/2026: o treinamento da NR-35 passa a ser presencial (item 35.4.5).",
  },
  {
    norma: "NR-10",
    padrao: /\bNR[\s-]*10\b/i,
    data: "2027-06-01",
    texto: "Nova redação da NR-10: teoria e prática separadas e reciclagem de no mínimo 16 h.",
  },
];

/** Os gatilhos de revisão que valem para o curso (pelo nome e código). */
export function gatilhosDoCurso(curso) {
  if (!curso) return [];
  const alvo = `${curso.codigo || ""} ${curso.nome || ""}`;
  return GATILHOS_DE_REVISAO.filter((g) => g.padrao.test(alvo));
}

/**
 * A situação da revisão do projeto em `hoje` (dia de Brasília):
 * `{ estado, data, dias, motivo, gatilho }`.
 *  - "sem_validacao": nunca foi validado (ou a data está ilegível);
 *  - "vencida": a data de revisão passou, ou a NR mudou DEPOIS da última validação (motivo "norma");
 *  - "a_vencer": faltam até 90 dias (vence hoje também);
 *  - "em_dia": o resto.
 * A data de revisão é a `proxima_revisao` do curso, ou 2 anos depois da validação; se a NR do curso ainda vai
 * mudar antes dela, a data é a da mudança (motivo "norma_futura").
 */
export function situacaoDaRevisao(curso, hoje = hojeEmBrasilia()) {
  const validadoEm = diaValido(curso?.projeto_validado_em);
  if (!validadoEm) {
    return { estado: "sem_validacao", data: null, dias: null, motivo: null, gatilho: null };
  }
  const gatilhos = gatilhosDoCurso(curso)
    .filter((g) => g.data > validadoEm)
    .sort((a, b) => (a.data < b.data ? -1 : 1));

  const mudou = gatilhos.find((g) => g.data <= hoje);
  if (mudou) {
    return {
      estado: "vencida",
      data: mudou.data,
      dias: diasParaVencer(mudou.data, hoje),
      motivo: "norma",
      gatilho: mudou,
    };
  }

  const base = diaValido(curso?.proxima_revisao) ?? somarAnos(validadoEm, ANOS_ENTRE_REVISOES);
  const futuro = gatilhos.find((g) => g.data < base);
  const data = futuro ? futuro.data : base;
  const dias = diasParaVencer(data, hoje);
  const estado = dias < 0 ? "vencida" : dias <= DIAS_DE_AVISO_DA_REVISAO ? "a_vencer" : "em_dia";
  return {
    estado,
    data,
    dias,
    motivo: futuro ? "norma_futura" : "prazo",
    gatilho: futuro ?? null,
  };
}

/** Texto curto da situação da revisão, para o painel e para a seção do curso. */
export function rotuloDaRevisao(situacao) {
  const s = situacao || {};
  if (s.estado === "sem_validacao" || !s.estado) return "Sem validação registrada";
  if (s.motivo === "norma" && s.gatilho) {
    return `A ${s.gatilho.norma} mudou em ${fmtData(s.gatilho.data)}, depois da última validação`;
  }
  if (s.motivo === "norma_futura" && s.gatilho) {
    return (
      `A ${s.gatilho.norma} muda em ${fmtData(s.gatilho.data)}: revise o projeto antes ` +
      `(${s.dias === 1 ? "falta 1 dia" : `faltam ${s.dias} dias`})`
    );
  }
  if (s.estado === "vencida") return `Revisão vencida há ${plural(-s.dias, "dia", "dias")}`;
  if (s.estado === "a_vencer") {
    return s.dias === 0
      ? "Revisão vence hoje"
      : `Revisão vence em ${plural(s.dias, "dia", "dias")}`;
  }
  return "Revisão em dia";
}

const ORDEM_DOS_ESTADOS = { vencida: 0, sem_validacao: 1, a_vencer: 2, em_dia: 3 };

/**
 * Os projetos que pedem ação, para o painel "Vencimentos": cursos vivos, PUBLICADOS e que não sejam de apoio
 * (o apoio é só material de estudo e não emite certificado; rascunho ainda está sendo escrito). Vencidos
 * primeiro (o mais atrasado antes), depois os sem validação (por nome) e os que vencem (o mais próximo antes),
 * e por último os em dia que só têm o PDF desatualizado (o projeto mudou depois do PDF que o aluno e a
 * fiscalização veem). `pdfDesatualizado` marca o item cujo PDF destoa do projeto, qualquer que seja a revisão.
 * @returns {{ itens: { curso: object, situacao: object, pdfDesatualizado: boolean }[],
 *   resumo: { semValidacao: number, vencidas: number, aVencer: number, emDia: number,
 *     pdfDesatualizado: number } }}
 */
export function selecionarRevisoes({ cursos = [], hoje = hojeEmBrasilia() } = {}) {
  const resumo = { semValidacao: 0, vencidas: 0, aVencer: 0, emDia: 0, pdfDesatualizado: 0 };
  const itens = [];
  for (const curso of Array.isArray(cursos) ? cursos : []) {
    if (!viva(curso) || curso.ativo === false || modalidadeDoCurso(curso) === "apoio") continue;
    const situacao = situacaoDaRevisao(curso, hoje);
    const pdfDesatualizado = estadoDoPdfDoProjeto(curso) === "desatualizado";
    if (pdfDesatualizado) resumo.pdfDesatualizado++;
    if (situacao.estado === "em_dia") resumo.emDia++;
    else if (situacao.estado === "vencida") resumo.vencidas++;
    else if (situacao.estado === "a_vencer") resumo.aVencer++;
    else resumo.semValidacao++;
    if (situacao.estado !== "em_dia" || pdfDesatualizado) {
      itens.push({ curso, situacao, pdfDesatualizado });
    }
  }
  itens.sort((a, b) => {
    const porEstado = ORDEM_DOS_ESTADOS[a.situacao.estado] - ORDEM_DOS_ESTADOS[b.situacao.estado];
    if (porEstado) return porEstado;
    if (a.situacao.estado === "sem_validacao") {
      return String(a.curso.nome ?? "").localeCompare(String(b.curso.nome ?? ""), "pt-BR");
    }
    return a.situacao.dias - b.situacao.dias;
  });
  return { itens, resumo };
}
