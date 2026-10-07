/**
 * Declaração de ambiente e horário do aluno (T35; NR-1, Anexo II, 4.3 e 4.4), lado do RH e do RT: o texto padrão,
 * os três itens, os limites e a escolha da versão em vigor. Regras puras, sem DOM e sem rede (não importa
 * `@/api/sigoClient`). Quem usa: components/seguranca/AmbienteHorarioEadCard.jsx e DeclaracaoTextoDialog.jsx.
 * Testes em ead-declaracao-ambiente.test.js.
 *
 * ESPELHO de supabase/functions/portal-funcionario/declaracao-ambiente.ts (é ele quem decide o que o aluno vê e
 * grava na trilha): `supabase/functions/portal-funcionario/declaracao-ambiente.test.ts` compara o texto padrão, os
 * itens, os limites e a escolha da versão dos dois lados. Mudou um, muda o outro.
 *
 * O texto é do responsável técnico (RT): cada salvamento é uma VERSÃO nova (tabela `treinamento_declaracao_texto`,
 * migração 0144, só de inclusão), com a ART (número ou referência) que aparece junto do texto para o aluno. Enquanto
 * o RT não salvar nenhuma versão, vale o texto padrão abaixo, uma sugestão marcada como "pendente de aprovação do
 * RT".
 */

import { dataHoraCurtaBrasilia } from "./data-brasilia.js";

/** Nome do evento na trilha (`treinamento_evento.evento`); só o servidor o grava. */
export const EVENTO_DECLARACAO_AMBIENTE = "declaracao_ambiente";

/** Limites do texto e da ART (os mesmos do check da migração 0144). */
export const TEXTO_MIN = 20;
export const TEXTO_MAX = 4000;
export const ART_MAX = 120;

/** Os três itens que o aluno confirma. Os `id` são os campos do evento da trilha. */
export const ITENS_DA_DECLARACAO = [
  {
    id: "local_adequado",
    rotulo: "Estou em um local adequado, que favorece a minha concentração.",
  },
  {
    id: "horario_reservado",
    rotulo: "Reservei este horário para o treinamento.",
  },
  {
    id: "sem_outra_atividade",
    rotulo: "Não vou fazer trabalho nem outra atividade enquanto estudo.",
  },
];

/** Texto padrão: neutro, só uma sugestão (versão 0, pendente de aprovação do RT). */
export const TEXTO_PADRAO_DA_DECLARACAO = [
  "Antes de começar, leia com atenção.",
  "",
  "Para o treinamento valer, faça-o em condições adequadas:",
  "",
  "1. Local: escolha um lugar que favoreça a concentração, com pouco ruído, boa iluminação e sem interrupções.",
  "2. Horário: reserve este período só para o treinamento. Durante as aulas e a prova, não faça trabalho nem outra atividade ao mesmo tempo.",
  "3. Equipamento: use um aparelho com internet estável, tela legível e som funcionando.",
  "",
  "Se não puder cumprir estas condições agora, saia do curso e volte em outro momento. O seu tempo de estudo só conta com a aula aberta e a tela visível.",
  "",
  "Ao confirmar abaixo, você declara que cumpre estas condições hoje, neste acesso.",
].join("\n");

// Aparar e contar do MESMO jeito que o banco (0144) e o servidor: `btrim(texto, E' \t\r\n\f\x0b')` tira só espaço,
// tab, CR, LF, FF e VT (o `trim()` do JS tira também espaço sem quebra e BOM), e `char_length` conta caracteres (o
// `.length` do JS conta unidades UTF-16: um emoji vale 2). A regra é a de declaracao-ambiente.ts (A6, T35).
const ESPACOS_DO_BANCO = /^[ \t\r\n\f\v]+|[ \t\r\n\f\v]+$/g;
const aparar = (v) => (typeof v === "string" ? v.replace(ESPACOS_DO_BANCO, "") : "");

/** O tamanho do texto em caracteres, como o `char_length` do banco (não em unidades UTF-16). */
export const tamanhoDoTexto = (v) => (typeof v === "string" ? [...v].length : 0);

/**
 * O texto em vigor entre as linhas do banco: a de maior `versao` válida (inteiro >= 1, texto de TEXTO_MIN a
 * TEXTO_MAX caracteres). Linha estragada é ignorada. Sem nenhuma, vale o padrão (versão 0, `aprovado: false`).
 * Devolve `{ versao, texto, art, aprovado }`.
 */
export function declaracaoVigente(linhas) {
  let melhor = null;
  for (const l of Array.isArray(linhas) ? linhas : []) {
    const versao = l?.versao;
    const texto = aparar(l?.texto);
    if (typeof versao !== "number" || !Number.isInteger(versao) || versao < 1) continue;
    const tamanho = tamanhoDoTexto(texto);
    if (tamanho < TEXTO_MIN || tamanho > TEXTO_MAX) continue;
    if (!melhor || versao > melhor.versao) {
      melhor = { versao, texto, art: aparar(l?.art) || null, aprovado: true };
    }
  }
  return melhor ?? { versao: 0, texto: TEXTO_PADRAO_DA_DECLARACAO, art: null, aprovado: false };
}

/** Texto e ART como o banco os guarda: aparados, ART vazia vira null. */
export function normalizarDeclaracao({ texto, art } = {}) {
  return { texto: aparar(texto), art: aparar(art) || null };
}

/**
 * Confere o que o RT digitou. `{ ok, erros: { texto?, art? } }`: o texto tem de ter de TEXTO_MIN a TEXTO_MAX
 * caracteres e a ART até ART_MAX (as mesmas regras do banco, que é quem decide de verdade).
 */
export function validarDeclaracaoDoRT({ texto, art } = {}) {
  const t = normalizarDeclaracao({ texto, art });
  const erros = {};
  const tamanho = tamanhoDoTexto(t.texto);
  if (tamanho < TEXTO_MIN) {
    erros.texto = `Escreva pelo menos ${TEXTO_MIN} caracteres.`;
  } else if (tamanho > TEXTO_MAX) {
    erros.texto = `O texto passa de ${TEXTO_MAX} caracteres (tem ${tamanho}).`;
  }
  if (t.art && tamanhoDoTexto(t.art) > ART_MAX) {
    erros.art = `A ART passa de ${ART_MAX} caracteres.`;
  }
  return { ok: Object.keys(erros).length === 0, erros };
}

/**
 * O que o RT digitou é igual ao que já vale? (Salvar de novo a mesma coisa só criaria uma versão repetida.) Com o
 * texto padrão em vigor (sem versão salva) NUNCA é igual: salvar o padrão como está é a aprovação dele (versão 1).
 */
export function igualAoVigente(vigente, digitado) {
  if (!vigente?.aprovado) return false;
  const d = normalizarDeclaracao(digitado);
  return d.texto === vigente.texto && (d.art || null) === (vigente.art || null);
}

/**
 * Dois RTs com a janela de edição aberta na MESMA versão: o segundo salvava por cima do primeiro sem aviso (o aluno
 * tem o 409 `TEXTO_MUDOU`; o RT não tinha nada). `versaoDaTela` é a versão em vigor quando a janela abriu;
 * `linhasAtuais`, as versões lidas do banco agora, antes de gravar. Devolve `null` se nada mudou, ou
 * `{ versao, salvoPor, salvoEm }` da versão nova mais recente (linha estragada não conta, como em `declaracaoVigente`).
 */
export function conflitoDeEdicao(versaoDaTela, linhasAtuais) {
  const atual = declaracaoVigente(linhasAtuais).versao;
  if (atual <= (Number.isInteger(versaoDaTela) ? versaoDaTela : 0)) return null;
  const nova = historicoDeVersoes(linhasAtuais)[0];
  return { versao: atual, salvoPor: nova?.salvoPor ?? null, salvoEm: nova?.salvoEm ?? null };
}

/** O aviso do conflito: quem, quando (hora de Brasília), qual versão, e que nada foi salvo. */
export function mensagemDeConflitoDeEdicao(conflito) {
  const quem = conflito?.salvoPor || "outra pessoa";
  const quando = dataHoraCurtaBrasilia(conflito?.salvoEm);
  return (
    `O texto foi atualizado por ${quem}${quando ? ` em ${quando}` : ""} (versão ${conflito?.versao}) ` +
    "enquanto você editava. Nada foi salvo e o seu texto continua na janela: leia a versão nova e salve de " +
    "novo se ainda fizer sentido."
  );
}

/** O número da versão que o próximo salvamento cria. */
export function proximaVersaoDaDeclaracao(linhas) {
  return declaracaoVigente(linhas).versao + 1;
}

/**
 * As versões salvas, da mais nova para a mais antiga, só as válidas (a mesma validade de `declaracaoVigente`), com
 * quem salvou e quando para a tela do histórico.
 */
export function historicoDeVersoes(linhas) {
  return (Array.isArray(linhas) ? linhas : [])
    .filter((l) => declaracaoVigente([l]).aprovado)
    .map((l) => ({
      versao: l.versao,
      texto: aparar(l.texto),
      art: aparar(l.art) || null,
      salvoEm: l.created_at ?? null,
      salvoPor: aparar(l.salvo_por_email) || null,
    }))
    .sort((a, b) => b.versao - a.versao);
}
