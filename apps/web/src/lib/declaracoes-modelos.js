/**
 * Modelos de declaração de habilitação (Acervo Técnico → Modelos de declaração). Módulo PURO (sem
 * React, sem banco). Os seis modelos padrão, as variáveis e as regras de `modelosDaEmpresa` e
 * `preencherModelo` são o espelho de supabase/functions/_shared/documentos/declaracoes.ts
 * (paridade em declaracoes-modelos-paridade.test.js): mudou lá, mude aqui.
 */

export const VARIAVEIS_DECLARACAO = [
  "empresa",
  "cnpj",
  "endereco",
  "orgao",
  "edital",
  "objeto",
  "local",
  "data",
  "representante",
  "cargo",
  "cpf",
];

export const LIMITE_TEXTO_DECLARACAO = 20000;
export const LIMITE_TITULO_DECLARACAO = 200;

/** Abertura comum dos seis modelos; o texto de cada um segue depois dela (começa com um espaço). */
const ABERTURA =
  "{empresa}, inscrita no CNPJ sob o nº {cnpj}, com sede em {endereco}, por intermédio de seu representante legal, {representante}, {cargo}, inscrito(a) no CPF sob o nº {cpf}, DECLARA, sob as penas da lei,";

const TEXTO_ELABORACAO_INDEPENDENTE = [
  ABERTURA + " em especial do art. 299 do Código Penal, que:",
  "a) a proposta apresentada para participar do {edital} foi elaborada de maneira independente, e o seu conteúdo não foi, no todo ou em parte, direta ou indiretamente, informado, discutido ou recebido de qualquer outro participante potencial ou de fato do certame, por qualquer meio ou por qualquer pessoa;",
  "b) a intenção de apresentar a proposta não foi informada, discutida ou recebida de qualquer outro participante potencial ou de fato do certame, por qualquer meio ou por qualquer pessoa;",
  "c) não tentou, por qualquer meio ou por qualquer pessoa, influir na decisão de qualquer outro participante potencial ou de fato do certame quanto a participar ou não dele;",
  "d) o conteúdo da proposta não será, no todo ou em parte, direta ou indiretamente, comunicado ou discutido com qualquer outro participante potencial ou de fato do certame antes da adjudicação do objeto;",
  "e) o conteúdo da proposta não foi, no todo ou em parte, direta ou indiretamente, informado, discutido ou recebido de qualquer integrante de {orgao} antes da abertura oficial das propostas; e",
  "f) está plenamente ciente do teor e da extensão desta declaração e detém plenos poderes e informações para firmá-la.",
].join("\n\n");

const m = (chave, titulo, texto, ordem) => ({ chave, titulo, texto, ativo: true, ordem });

export const MODELOS_PADRAO = [
  m(
    "nao_emprega_menor",
    "Declaração de que não emprega menor",
    ABERTURA +
      " para fins do disposto no inciso VI do art. 68 da Lei nº 14.133, de 1º de abril de 2021, e no inciso XXXIII do art. 7º da Constituição Federal, que não emprega menor de 18 (dezoito) anos em trabalho noturno, perigoso ou insalubre e não emprega menor de 16 (dezesseis) anos, salvo na condição de aprendiz, a partir de 14 (quatorze) anos.",
    1
  ),
  m(
    "fato_impeditivo",
    "Declaração de inexistência de fato impeditivo",
    ABERTURA +
      " que até a presente data inexistem fatos impeditivos para a sua habilitação no {edital}, promovido por {orgao}, que não foi declarada inidônea nem está impedida de licitar ou contratar com a Administração Pública, e que está ciente da obrigação de declarar ocorrências posteriores.",
    2
  ),
  m(
    "me_epp",
    "Declaração de enquadramento como microempresa ou empresa de pequeno porte",
    ABERTURA +
      " que se enquadra como microempresa ou empresa de pequeno porte, nos termos do art. 3º da Lei Complementar nº 123, de 14 de dezembro de 2006, que não incorre em nenhuma das vedações do § 4º do mesmo artigo e que, no ano-calendário de realização da licitação, ainda não celebrou contratos com a Administração Pública cujos valores somados extrapolem a receita bruta máxima admitida para fins de enquadramento como empresa de pequeno porte (art. 4º, § 2º, da Lei nº 14.133/2021), estando apta a usufruir do tratamento favorecido dos arts. 42 a 49 daquela Lei Complementar.",
    3
  ),
  m(
    "requisitos_habilitacao",
    "Declaração de cumprimento dos requisitos de habilitação",
    ABERTURA +
      " que cumpre plenamente os requisitos de habilitação exigidos no {edital} e que a sua proposta econômica compreende a integralidade dos custos para atendimento dos direitos trabalhistas assegurados na Constituição Federal, nas leis trabalhistas, nas normas infralegais, nas convenções coletivas de trabalho e nos termos de ajustamento de conduta vigentes na data de entrega das propostas (art. 63, inciso I e § 1º, da Lei nº 14.133/2021).",
    4
  ),
  m(
    "reserva_cargos",
    "Declaração de reserva de cargos para pessoa com deficiência e reabilitado da Previdência Social",
    ABERTURA +
      " que cumpre as exigências de reserva de cargos para pessoa com deficiência e para reabilitado da Previdência Social, previstas em lei e em outras normas específicas (art. 63, inciso IV, da Lei nº 14.133/2021).",
    5
  ),
  m(
    "elaboracao_independente",
    "Declaração de elaboração independente de proposta",
    TEXTO_ELABORACAO_INDEPENDENTE,
    6
  ),
];

/** Ordem do modelo; nula ou ausente vai por último. */
function ordemDe(modelo) {
  return typeof modelo.ordem === "number" && Number.isFinite(modelo.ordem)
    ? modelo.ordem
    : Number.POSITIVE_INFINITY;
}

/** Padrão sobreposto pelas linhas da empresa (mesma chave) + modelos próprios; só os ativos; por ordem e título. */
export function modelosDaEmpresa(linhas) {
  const porChave = new Map(MODELOS_PADRAO.map((p) => [p.chave, { ...p }]));
  for (const linha of Array.isArray(linhas) ? linhas : []) {
    if (!linha || typeof linha.chave !== "string" || !linha.chave) continue;
    const padrao = porChave.get(linha.chave);
    porChave.set(linha.chave, {
      chave: linha.chave,
      titulo: typeof linha.titulo === "string" ? linha.titulo : (padrao?.titulo ?? ""),
      texto: typeof linha.texto === "string" ? linha.texto : (padrao?.texto ?? ""),
      ativo: linha.ativo !== false,
      ordem: linha.ordem ?? padrao?.ordem ?? null,
    });
  }
  return [...porChave.values()]
    .filter((x) => x.ativo !== false)
    .sort((a, b) => {
      const oa = ordemDe(a);
      const ob = ordemDe(b);
      if (oa !== ob) return oa < ob ? -1 : 1;
      return a.titulo.localeCompare(b.titulo, "pt-BR");
    });
}

const CAMPO_VAZIO = "________";

/** Troca {variavel}; `sem_valor` = variáveis conhecidas que ficaram vazias; `desconhecidas` = {x} fora da lista. */
export function preencherModelo(texto, vars) {
  const semValor = [];
  const desconhecidas = [];
  const preenchido = String(texto ?? "").replace(/\{([a-z_]+)\}/g, (inteiro, nome) => {
    if (!VARIAVEIS_DECLARACAO.includes(nome)) {
      if (!desconhecidas.includes(nome)) desconhecidas.push(nome);
      return inteiro;
    }
    const valor = vars?.[nome];
    if (valor === undefined || valor === null || String(valor).trim() === "") {
      if (!semValor.includes(nome)) semValor.push(nome);
      return CAMPO_VAZIO;
    }
    return String(valor);
  });
  return { texto: preenchido, sem_valor: semValor, desconhecidas };
}

/** Chave de um modelo próprio a partir do título: sem acento, minúsculas, [^a-z0-9] → "_", até 40. */
export function chaveDoTitulo(titulo) {
  return String(titulo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Mesma regra do CHECK de modelo_declaracao.chave (migração 0156) e da chave aceita pelo conector. */
const CHAVE_VALIDA = /^[a-z][a-z0-9_]{1,59}$/;

/**
 * Valida o formulário de um modelo: { ok, erros, dados }.
 * `chavesEmUso`: chaves dos OUTROS modelos próprios da empresa.
 */
export function validarModelo(form, chavesEmUso) {
  const erros = [];
  const titulo = String(form?.titulo ?? "").trim();
  const texto = String(form?.texto ?? "").trim();
  if (!titulo) erros.push("Informe o título do modelo");
  else if (titulo.length > LIMITE_TITULO_DECLARACAO) erros.push("Título: use até 200 caracteres");
  if (!texto) erros.push("Escreva o texto da declaração");
  else if (texto.length > LIMITE_TEXTO_DECLARACAO) erros.push("Texto: use até 20.000 caracteres");

  let chave = String(form?.chave ?? "").trim();
  if (!chave) {
    chave = chaveDoTitulo(titulo);
    if (titulo && !chave) erros.push("Use letras no título");
  }
  if (chave && !CHAVE_VALIDA.test(chave)) {
    erros.push("O título deve começar com uma letra e ter ao menos 2 caracteres");
  } else if (chave && (chavesEmUso ?? []).includes(chave)) {
    erros.push("Já existe um modelo com este título");
  }

  const desconhecidas = preencherModelo(texto, {}).desconhecidas;
  for (const nome of desconhecidas) erros.push(`Variável desconhecida no texto: {${nome}}`);

  return {
    ok: erros.length === 0,
    erros,
    dados: { chave, titulo, texto, ativo: form?.ativo !== false },
  };
}
