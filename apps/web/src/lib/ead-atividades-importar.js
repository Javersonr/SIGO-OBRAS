/**
 * Importação das atividades interativas para um curso EAD (tela do RH, "Importar atividades") — regra pura, sem
 * DOM e sem rede. Quem usa: components/seguranca/ImportarAtividadesDialog.jsx. Testes:
 * ead-atividades-importar.test.js. Spec: docs/superpowers/specs/2026-10-14-ead-atividades-interativas-design.md,
 * §5.1 (A7, A8). Os imports levam a extensão: o script de conferência do pacote (fora do repositório) roda este
 * arquivo direto no Node.
 *
 * Dois arquivos de entrada:
 *  1. O pacote do material (lista de módulos, ou { modulos: [...] }): cada módulo { id, titulo, casos, questoes,
 *     estudo } vira, depois da última aula do módulo do curso, um caso por caso ("Mx · Caso n: título", Mx-Cn), um
 *     questionário com todas as questões ("Mx · Questionário do módulo", Mx-Q) e uma atividade de estudo por tarefa
 *     ("Mx · Atividade de estudo n: título", Mx-Tn). Campos desconhecidos (objetivos, apostila, pratica...) ficam de
 *     fora (a prática presencial é das sessões práticas, §13).
 *  2. Os exercícios pós-vídeo ({ tipo: "questionarios_por_video", itens: [{ video, questoes }] }): cada item vira um
 *     questionário logo DEPOIS da aula de vídeo daquele código ("Exercícios do vídeo: <título>", PV-<código>), que
 *     herda o módulo dela.
 *
 * Nada é gravado aqui: o plano mostra a prévia, com os problemas de cada atividade e o que já existe no curso
 * (mesmo código de origem: pulado), e `payloadDaImportacao` monta a lista da RPC `importar_atividades_ead`
 * (contrato C1), que grava tudo ou nada. Como a RPC recusa a lista inteira por um item ruim, o plano também aponta
 * como problema o que ela recusaria: código de origem repetido (nunca vai na lista), código ou título compridos
 * demais e questionário com mais de 50 questões.
 */
import { validarCaso } from "./ead-caso.js";

/** Tempos padrão das atividades sem tempo no pacote (A8); as tarefas trazem o próprio. */
export const TEMPOS_PADRAO = Object.freeze({ questionarioMin: 15, casoMin: 10 });
/** Tempo padrão de cada questionário pós-vídeo. */
export const TEMPO_PADRAO_POS_VIDEO_MIN = 5;
/** Escolha "novo módulo no fim do curso" no diálogo. */
export const MODULO_NOVO = "__novo__";
/** O `tipo` do arquivo dos exercícios pós-vídeo. */
export const FORMATO_POR_VIDEO = "questionarios_por_video";
/** O máximo de atividades que a RPC `importar_atividades_ead` aceita por chamada (22023 acima disso). */
export const MAX_ATIVIDADES_POR_IMPORTACAO = 300;

const LIMITE_DE_MINUTOS = 600;
const MAX_ALTERNATIVAS = 6;
// limites que a RPC importar_atividades_ead confere (recusa a lista inteira): o plano aponta antes
const MAX_QUESTOES = 50;
const MAX_TITULO = 300;
const MAX_CODIGO = 60;

const lista = (v) => (Array.isArray(v) ? v : []);
const texto = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const conjunto = (v) => (v instanceof Set ? v : new Set(lista(v)));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const escaparRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function lerJson(json) {
  if (typeof json !== "string") return { dados: json, erro: null };
  try {
    return { dados: JSON.parse(json.replace(/^\uFEFF/, "")), erro: null };
  } catch {
    return { dados: null, erro: "O arquivo não é um JSON válido." };
  }
}

/** O formato do arquivo: "por_video" (exercícios pós-vídeo) ou "pacote" (o material, lista de módulos). */
export function formatoDoArquivo(json) {
  const { dados } = lerJson(json);
  return dados &&
    typeof dados === "object" &&
    !Array.isArray(dados) &&
    dados.tipo === FORMATO_POR_VIDEO
    ? "por_video"
    : "pacote";
}

/** Minutos digitados no diálogo: inteiro de 1 a 600; o resto é inválido (null). */
export function minutosDoTempo(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const n = Number(String(valor).trim().replace(",", "."));
  return Number.isInteger(n) && n >= 1 && n <= LIMITE_DE_MINUTOS ? n : null;
}

// ------------------------------------------------------------------------------------------- leitura

function lerCaso(bruto) {
  const c = bruto && typeof bruto === "object" ? bruto : {};
  return {
    titulo: texto(c.titulo),
    conteudo: {
      contexto: texto(c.contexto),
      etapas: lista(c.etapas).map((e) => ({
        id: texto(e?.id),
        pergunta: texto(e?.pergunta),
        opcoes: lista(e?.opcoes).map((o) => ({
          texto: texto(o?.texto),
          // o pacote chama de "feedback" o que o SIGO chama de "comentario"
          comentario: texto(o?.feedback ?? o?.comentario),
          segura: o?.segura === true,
          proxima: texto(o?.proxima) || null,
        })),
      })),
      reflexao: texto(c.reflexao),
    },
  };
}

function lerQuestao(bruto) {
  const q = bruto && typeof bruto === "object" ? bruto : {};
  return {
    pergunta: texto(q.enunciado ?? q.pergunta),
    opcoes: lista(q.opcoes).map((o) => texto(o && typeof o === "object" ? o.texto : o)),
    correta: Number.isInteger(q.correta) ? q.correta : null,
    comentario: texto(q.explicacao ?? q.comentario),
  };
}

function lerTarefa(bruto) {
  const t = bruto && typeof bruto === "object" ? bruto : {};
  const digitado = Number(t.tempoEstimadoMin ?? t.minutos);
  const minutos = Math.round(digitado);
  return {
    titulo: texto(t.titulo),
    instrucoes: texto(t.instrucoes),
    evidencia: texto(t.evidencia),
    // 0,4 min arredonda para 0 e a RPC recusa duração menor que 1 s: sem tempo estimado
    minutos:
      Number.isFinite(digitado) && minutos >= 1 && digitado <= LIMITE_DE_MINUTOS ? minutos : null,
  };
}

/**
 * Lê o pacote do material: lista de módulos ou { modulos: [...] } (objeto ou o JSON em texto). Cada módulo sai como
 * { id, titulo, casos: [{ titulo, conteudo }], questoes, tarefas } no formato do SIGO (feedback → comentario,
 * enunciado → pergunta, explicacao → comentario, estudo → tarefas). `erros` lista o que impede ler o arquivo
 * (formato, módulo sem código, código repetido, campo que devia ser lista).
 */
export function lerPacoteDeAtividades(json) {
  const { dados, erro } = lerJson(json);
  if (erro) return { modulos: [], erros: [erro] };
  const brutos = Array.isArray(dados)
    ? dados
    : Array.isArray(dados?.modulos)
      ? dados.modulos
      : null;
  if (!brutos) {
    return {
      modulos: [],
      erros: ['O arquivo não traz a lista de módulos (uma lista, ou { "modulos": [...] }).'],
    };
  }
  if (!brutos.length) return { modulos: [], erros: ["O arquivo não tem nenhum módulo."] };
  const erros = [];
  const vistos = new Set();
  const modulos = [];
  brutos.forEach((m, i) => {
    const id = texto(m?.id);
    if (!id) {
      erros.push(`O ${i + 1}º módulo do arquivo não tem o código (id, ex.: "M3").`);
      return;
    }
    if (vistos.has(id.toUpperCase())) {
      erros.push(`O módulo ${id} aparece mais de uma vez no arquivo.`);
      return;
    }
    vistos.add(id.toUpperCase());
    const tarefas = m.estudo ?? m.tarefas;
    for (const [campo, valor] of [
      ["casos", m.casos],
      ["questoes", m.questoes],
      ["estudo", tarefas],
    ]) {
      if (valor !== undefined && valor !== null && !Array.isArray(valor)) {
        erros.push(`Módulo ${id}: "${campo}" não é uma lista.`);
      }
    }
    modulos.push({
      id,
      titulo: texto(m.titulo),
      casos: lista(m.casos).map(lerCaso),
      questoes: lista(m.questoes).map(lerQuestao),
      tarefas: lista(tarefas).map(lerTarefa),
    });
  });
  return { modulos, erros };
}

/**
 * Lê o arquivo dos exercícios pós-vídeo: { tipo: "questionarios_por_video", itens: [{ video, questoes }] }. O
 * código do vídeo sai em maiúsculas (o código de origem "PV-<video>" não duplica por diferença de caixa).
 */
export function lerQuestionariosPorVideo(json) {
  const { dados, erro } = lerJson(json);
  if (erro) return { itens: [], erros: [erro] };
  if (
    !dados ||
    typeof dados !== "object" ||
    Array.isArray(dados) ||
    dados.tipo !== FORMATO_POR_VIDEO
  ) {
    return { itens: [], erros: [`O arquivo não é do formato "${FORMATO_POR_VIDEO}".`] };
  }
  if (!Array.isArray(dados.itens) || !dados.itens.length) {
    return {
      itens: [],
      erros: ['O arquivo não traz a lista "itens", com os vídeos e as questões.'],
    };
  }
  const erros = [];
  const vistos = new Set();
  const itens = [];
  dados.itens.forEach((item, i) => {
    const video = texto(item?.video).toUpperCase();
    if (!video) {
      erros.push(`O ${i + 1}º item do arquivo não tem o código do vídeo ("video").`);
      return;
    }
    if (vistos.has(video)) {
      erros.push(`O vídeo ${video} aparece mais de uma vez no arquivo.`);
      return;
    }
    vistos.add(video);
    if (item.questoes !== undefined && item.questoes !== null && !Array.isArray(item.questoes)) {
      erros.push(`Vídeo ${video}: "questoes" não é uma lista.`);
    }
    itens.push({ video, questoes: lista(item.questoes).map(lerQuestao) });
  });
  return { itens, erros };
}

// ------------------------------------------------------------------------------------- o curso

/**
 * O módulo do curso que casa com o código do módulo do pacote: o texto que É o código ou começa com "M3 " ou
 * "M3·" (sem diferenciar maiúsculas). "M1" não casa com "M10 · ...". Devolve o texto como está no curso (é ele que
 * vai para a aula), ou null.
 */
export function casarModulo(idModulo, modulosDoCurso) {
  const id = texto(idModulo).toUpperCase();
  if (!id) return null;
  for (const m of lista(modulosDoCurso)) {
    const t = texto(m).toUpperCase();
    if (t === id || t.startsWith(`${id} `) || t.startsWith(`${id}·`)) return m;
  }
  return null;
}

const porOrdem = (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0);
const vivas = (aulas) => lista(aulas).filter((a) => a && !a.deleted_at);

/** Os módulos do curso (texto como gravado), na ordem das aulas, sem repetir; aula apagada não conta. */
export function modulosDasAulas(aulas) {
  const modulos = [];
  for (const a of vivas(aulas).sort(porOrdem)) {
    if (typeof a.modulo === "string" && a.modulo.trim() && !modulos.includes(a.modulo)) {
      modulos.push(a.modulo);
    }
  }
  return modulos;
}

/** Os códigos de origem que já existem no curso (aulas não apagadas): reimportar não duplica. */
export function codigosDasAulas(aulas) {
  return new Set(
    vivas(aulas)
      .map((a) => a.codigo_origem)
      .filter(Boolean)
  );
}

/** As aulas de vídeo (não apagadas) cujo arquivo tem o código como pedaço do nome, em ordem. */
function aulasDoVideo(codigo, aulas) {
  const c = texto(codigo);
  if (!c) return [];
  // o upload pela tela grava "<uuid>-<nome>" (lib/ead-upload.js): o hífen também separa o código
  const padrao = new RegExp(`(^|[/_-])${escaparRegex(c)}(_|\\.)`, "i");
  return vivas(aulas)
    .filter(
      (a) =>
        (a.tipo || "video") === "video" &&
        typeof a.video_ref === "string" &&
        padrao.test(a.video_ref)
    )
    .sort(porOrdem);
}

/**
 * A aula de vídeo do código (ex.: "S02A"): a 1ª aula de vídeo não apagada cujo `video_ref` tem o código como
 * pedaço do nome do arquivo (entre "/", "_" ou "-" e "_" ou "."), sem diferenciar maiúsculas. "S02A" não casa com
 * "S02AB". Vídeo do YouTube (sem arquivo) nunca casa. Sem aula: null.
 */
export function acharAulaDoVideo(codigo, aulas) {
  return aulasDoVideo(codigo, aulas)[0] ?? null;
}

// ------------------------------------------------------------------------------------- o plano

/** As questões no formato da RPC (alternativas vazias saem, a correta acompanha) e os problemas de cada uma. */
function questoesParaGravar(questoes) {
  const problemas = [];
  const paraGravar = lista(questoes).map((q, i) => {
    const n = i + 1;
    const preenchidas = q.opcoes.filter(Boolean);
    const certaOk =
      q.correta !== null && q.correta >= 0 && q.correta < q.opcoes.length && !!q.opcoes[q.correta];
    if (!q.pergunta) problemas.push(`Questão ${n}: sem enunciado`);
    if (preenchidas.length < 2) problemas.push(`Questão ${n}: menos de 2 alternativas`);
    if (preenchidas.length > MAX_ALTERNATIVAS) {
      problemas.push(`Questão ${n}: mais de ${MAX_ALTERNATIVAS} alternativas`);
    }
    if (!certaOk) problemas.push(`Questão ${n}: sem resposta certa`);
    return {
      pergunta: q.pergunta,
      opcoes: preenchidas,
      correta: certaOk ? q.opcoes.slice(0, q.correta).filter(Boolean).length : 0,
      comentario: q.comentario || null,
    };
  });
  return { questoes: paraGravar, problemas };
}

/**
 * Confere os itens do plano com o que a RPC recusa (ela recusa a lista inteira, então o aviso vem antes): código de
 * origem repetido no plano (só a 1ª ocorrência segue sem problema), código ou título compridos demais e questionário
 * com mais de 50 questões. Acrescenta aos `problemas` de cada item e devolve a mesma lista.
 */
function conferirComARpc(itens) {
  const vistos = new Set();
  for (const i of itens) {
    if (i.codigo_origem.length > MAX_CODIGO) {
      i.problemas.push(`código de origem com mais de ${MAX_CODIGO} caracteres`);
    }
    if (i.titulo.length > MAX_TITULO) {
      i.problemas.push(`título com mais de ${MAX_TITULO} caracteres`);
    }
    if (i.tipo === "questionario" && i.questoes.length > MAX_QUESTOES) {
      i.problemas.push(`mais de ${MAX_QUESTOES} questões (tem ${i.questoes.length})`);
    }
    if (vistos.has(i.codigo_origem)) {
      i.problemas.push(`código de origem repetido: ${i.codigo_origem}`);
    }
    vistos.add(i.codigo_origem);
  }
  return itens;
}

/** Para onde vão as atividades do módulo do pacote: o escolhido, o casado pelo código ou um módulo novo. */
function destinoDoModulo(m, modulosDoCurso, escolha) {
  const novo = { modulo: m.titulo ? `${m.id} · ${m.titulo}` : m.id, origem: "novo" };
  if (escolha === MODULO_NOVO) return novo;
  if (typeof escolha === "string" && modulosDoCurso.includes(escolha)) {
    return { modulo: escolha, origem: "escolhido" };
  }
  const casado = casarModulo(m.id, modulosDoCurso);
  return casado ? { modulo: casado, origem: "casado" } : novo;
}

/**
 * O plano da importação do pacote: as aulas que seriam criadas (por módulo e nesta ordem: casos, questionário,
 * tarefas), cada uma com os problemas que bloqueiam o "Confirmar" e se já existe no curso (pulada), e o resumo por
 * módulo (só os módulos com atividades; `minutos` soma o que ainda não existe). `escolhaDeModulo`: { M3: texto de
 * um módulo do curso | MODULO_NOVO }. Tempos inválidos voltam ao padrão (o diálogo avisa antes).
 */
export function planejarImportacao({
  pacote,
  modulosDoCurso,
  codigosExistentes,
  tempos,
  escolhaDeModulo,
} = {}) {
  const existentes = conjunto(codigosExistentes);
  const doCurso = lista(modulosDoCurso);
  const escolhas = escolhaDeModulo && typeof escolhaDeModulo === "object" ? escolhaDeModulo : {};
  const minQuestionario = minutosDoTempo(tempos?.questionarioMin) ?? TEMPOS_PADRAO.questionarioMin;
  const minCaso = minutosDoTempo(tempos?.casoMin) ?? TEMPOS_PADRAO.casoMin;
  const itens = [];
  const porModulo = [];

  for (const m of lista(pacote?.modulos)) {
    if (!m.casos.length && !m.questoes.length && !m.tarefas.length) continue;
    const { modulo, origem } = destinoDoModulo(m, doCurso, escolhas[m.id]);
    const comum = (codigo_origem) => ({
      codigo_origem,
      modulo,
      moduloPacote: m.id,
      jaExiste: existentes.has(codigo_origem),
    });
    const doModulo = [];

    m.casos.forEach((c, i) => {
      const n = i + 1;
      doModulo.push({
        ...comum(`${m.id}-C${n}`),
        tipo: "caso",
        titulo: c.titulo ? `${m.id} · Caso ${n}: ${c.titulo}` : `${m.id} · Caso ${n}`,
        duracao_seg: minCaso * 60,
        caso: c.conteudo,
        problemas: validarCaso(c.conteudo).map((p) => `Caso ${n}: ${p.texto}`),
      });
    });

    if (m.questoes.length) {
      const { questoes, problemas } = questoesParaGravar(m.questoes);
      doModulo.push({
        ...comum(`${m.id}-Q`),
        tipo: "questionario",
        titulo: `${m.id} · Questionário do módulo`,
        duracao_seg: minQuestionario * 60,
        questoes,
        problemas,
      });
    }

    m.tarefas.forEach((t, i) => {
      const n = i + 1;
      const problemas = [];
      if (!t.instrucoes) problemas.push(`Atividade de estudo ${n}: sem instruções`);
      if (t.minutos === null) problemas.push(`Atividade de estudo ${n}: sem tempo estimado`);
      doModulo.push({
        ...comum(`${m.id}-T${n}`),
        tipo: "tarefa",
        titulo: t.titulo
          ? `${m.id} · Atividade de estudo ${n}: ${t.titulo}`
          : `${m.id} · Atividade de estudo ${n}`,
        duracao_seg: (t.minutos ?? 0) * 60,
        conteudo_texto: t.evidencia
          ? `${t.instrucoes}\n\nO que produzir: ${t.evidencia}`
          : t.instrucoes,
        problemas,
      });
    });

    itens.push(...doModulo);
    porModulo.push({
      moduloPacote: m.id,
      tituloPacote: m.titulo,
      modulo,
      origem,
      casos: m.casos.length,
      questoes: m.questoes.length,
      tarefas: m.tarefas.length,
      minutos: Math.round(
        doModulo.filter((i) => !i.jaExiste).reduce((s, i) => s + i.duracao_seg, 0) / 60
      ),
    });
  }
  return { itens: conferirComARpc(itens), porModulo };
}

/**
 * O plano dos exercícios pós-vídeo (`arquivo` = o que `lerQuestionariosPorVideo` devolveu): um questionário por
 * vídeo, logo depois da aula de vídeo do código (`depois_da_aula_id`), com o módulo dela. Vídeo não encontrado,
 * código em mais de uma aula de vídeo e questão inválida são problemas; código de origem que já existe é pulado.
 */
export function planejarImportacaoPorVideo({ arquivo, aulas, codigosExistentes, minutos } = {}) {
  const existentes = conjunto(codigosExistentes);
  const min = minutosDoTempo(minutos) ?? TEMPO_PADRAO_POS_VIDEO_MIN;
  const itens = lista(arquivo?.itens).map((item) => {
    const achadas = aulasDoVideo(item.video, aulas);
    const aula = achadas[0] ?? null;
    const codigo_origem = `PV-${item.video}`;
    const { questoes, problemas } = questoesParaGravar(item.questoes);
    if (!questoes.length) problemas.push("sem questões");
    if (!aula) problemas.unshift(`vídeo ${item.video} não encontrado neste curso`);
    else if (achadas.length > 1) {
      problemas.unshift(
        `o código ${item.video} aparece em ${achadas.length} aulas de vídeo deste curso`
      );
    }
    return {
      codigo_origem,
      tipo: "questionario",
      depois_da_aula_id: aula ? aula.id : null,
      modulo: aula ? (aula.modulo ?? null) : null,
      titulo: texto(aula?.titulo)
        ? `Exercícios do vídeo: ${texto(aula.titulo)}`
        : `Exercícios do vídeo ${item.video}`,
      duracao_seg: min * 60,
      questoes,
      video: item.video,
      aulaDoVideo: aula ? { id: aula.id, titulo: aula.titulo } : null,
      problemas,
      jaExiste: existentes.has(codigo_origem),
    };
  });
  return { itens: conferirComARpc(itens) };
}

// ------------------------------------------------------------------------------------ gravação

/**
 * A lista da RPC `importar_atividades_ead` (contrato C1): só as atividades sem problema, que ainda não existem e
 * não foram desmarcadas (`desmarcados`: Set ou lista de códigos de origem), sem os campos da prévia e sem repetir
 * código de origem.
 */
export function payloadDaImportacao(itens, desmarcados) {
  const fora = conjunto(desmarcados);
  const enviados = new Set(); // a RPC recusa código repetido na lista: nunca mais de um item por código
  return lista(itens)
    .filter((i) => {
      if (!i || i.jaExiste || lista(i.problemas).length || fora.has(i.codigo_origem)) return false;
      if (enviados.has(i.codigo_origem)) return false;
      enviados.add(i.codigo_origem);
      return true;
    })
    .map((i) => {
      const base = {
        codigo_origem: i.codigo_origem,
        tipo: i.tipo,
        modulo: i.modulo,
        titulo: i.titulo,
        duracao_seg: i.duracao_seg,
      };
      if (i.tipo === "caso") return { ...base, caso: i.caso };
      if (i.tipo === "questionario") {
        return {
          ...base,
          questoes: i.questoes,
          ...(i.depois_da_aula_id ? { depois_da_aula_id: i.depois_da_aula_id } : {}),
        };
      }
      return { ...base, conteudo_texto: i.conteudo_texto };
    });
}

/**
 * O rodapé do diálogo: quantas atividades entram (e quantas questões e minutos), quantas já existem (puladas) e
 * quais estão marcadas com problema. Só confirma com algo a importar, nenhuma marcada com problema, no máximo
 * `MAX_ATIVIDADES_POR_IMPORTACAO` (a RPC recusa a lista inteira acima disso) e sem erros do leitor do arquivo.
 * `opcoes.erros` (3º parâmetro) = o `erros` que `lerPacoteDeAtividades` ou `lerQuestionariosPorVideo` devolveu: o
 * leitor descarta o módulo ou o vídeo repetido (ou sem código) e segue com o resto, e importar assim seria importar o
 * arquivo pela metade.
 */
export function situacaoDaImportacao(itens, desmarcados, opcoes) {
  const fora = conjunto(desmarcados);
  let aImportar = 0;
  let questoes = 0;
  let segundos = 0;
  let puladas = 0;
  const comProblema = [];
  for (const i of lista(itens)) {
    if (i.jaExiste) {
      puladas += 1;
      continue;
    }
    if (fora.has(i.codigo_origem)) continue;
    if (lista(i.problemas).length) {
      comProblema.push(i.codigo_origem);
      continue;
    }
    aImportar += 1;
    segundos += Number(i.duracao_seg) || 0;
    if (i.tipo === "questionario") questoes += lista(i.questoes).length;
  }
  const acimaDoLimite = aImportar > MAX_ATIVIDADES_POR_IMPORTACAO;
  const errosDoArquivo = lista(opcoes?.erros).length;
  return {
    aImportar,
    questoes,
    minutos: Math.round(segundos / 60),
    puladas,
    comProblema,
    acimaDoLimite,
    errosDoArquivo,
    podeConfirmar: aImportar > 0 && comProblema.length === 0 && !acimaDoLimite && !errosDoArquivo,
  };
}

/** A frase do rodapé do diálogo (a `situacaoDaImportacao`): o que entra, o que é pulado e por que não confirma. */
export function textoDaSituacaoDaImportacao(situacao) {
  const s = situacao ?? {};
  const aImportar = Number(s.aImportar) || 0;
  const puladas = Number(s.puladas) || 0;
  const comProblema = lista(s.comProblema).length;
  let frase =
    `${plural(aImportar, "atividade a importar", "atividades a importar")} ` +
    `(${plural(Number(s.questoes) || 0, "questão", "questões")}, ${Number(s.minutos) || 0} min)`;
  if (puladas)
    frase += `; ${plural(puladas, "já existe e será pulada", "já existem e serão puladas")}`;
  frase += ".";
  if (s.errosDoArquivo) {
    frase += " O arquivo tem erros (acima): corrija-o e escolha-o de novo para importar.";
  }
  if (comProblema) {
    frase +=
      comProblema === 1
        ? " Desmarque a atividade com problema para confirmar."
        : ` Desmarque as ${comProblema} atividades com problema para confirmar.`;
  }
  if (s.acimaDoLimite) {
    frase +=
      ` O banco aceita no máximo ${MAX_ATIVIDADES_POR_IMPORTACAO} atividades por importação, e esta tem ${aImportar}.` +
      " Desmarque algumas ou divida o arquivo.";
  }
  if (!aImportar && !comProblema && !s.errosDoArquivo) frase += " Nada novo para importar.";
  return frase;
}

/** O resumo da RPC ({ criadas, puladas, questoes }) em uma frase. */
export function textoDoResumoDaImportacao(resumo) {
  const criadas = Number(resumo?.criadas) || 0;
  const puladas = Number(resumo?.puladas) || 0;
  const questoes = Number(resumo?.questoes) || 0;
  if (!criadas) {
    if (!puladas) return "Nenhuma atividade foi importada.";
    return puladas === 1
      ? "Nada novo: a atividade já existia e foi pulada."
      : `Nada novo: as ${puladas} atividades já existiam e foram puladas.`;
  }
  let frase = plural(criadas, "aula criada", "aulas criadas");
  if (questoes) frase += ` e ${plural(questoes, "questão gravada", "questões gravadas")}`;
  if (puladas) {
    frase +=
      puladas === 1 ? "; 1 já existia e foi pulada" : `; ${puladas} já existiam e foram puladas`;
  }
  return `${frase}.`;
}

/** O erro da RPC (PostgREST: `code` e `message`) numa frase para o toast. */
export function mensagemDoErroDaImportacao(erro) {
  const codigo = erro?.code;
  const mensagem = texto(erro?.message);
  if (codigo === "42501") {
    return "Sem permissão para importar atividades: é preciso Treinamentos EAD → Editar.";
  }
  if (codigo === "22023") return `O banco recusou uma atividade do arquivo: ${mensagem}`;
  if (codigo === "23505") {
    return "Outra importação gravou estas atividades ao mesmo tempo. Feche e abra de novo para ver o que já existe.";
  }
  return `Não foi possível importar as atividades${mensagem ? `: ${mensagem}` : "."}`;
}
