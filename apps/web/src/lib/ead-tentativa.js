// Detalhe de uma tentativa da avaliação EAD, para a tela do RH (trilha de auditoria, T18).
// Função pura: sem importar @/api/sigoClient.
//
// Cada tentativa guarda a prova como foi feita (`treinamento_tentativa.prova` e `.respostas`):
//   prova:     [{ questao_id, ordem, pergunta, opcoes, correta }]      (alternativas na ordem do cadastro)
//   respostas: [{ questao_id, resposta, acertou, posicao_exibida, ordem_opcoes_exibida }]
// `resposta` e `correta` são índices na ordem do CADASTRO; `posicao_exibida` é o lugar da questão na
// prova do aluno e `ordem_opcoes_exibida` lista os índices do cadastro na ordem em que as alternativas
// apareceram. Tentativas antigas podem não ter as duas últimas.

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** jsonb como lista: aceita a lista pronta ou o JSON em texto (legado); o resto vira lista vazia. */
function lista(valor) {
  if (Array.isArray(valor)) return valor;
  if (typeof valor === "string") {
    try {
      const lido = JSON.parse(valor);
      return Array.isArray(lido) ? lido : [];
    } catch {
      return [];
    }
  }
  return [];
}

const textoDaAlternativa = (opcao) => {
  if (typeof opcao === "string") return opcao;
  if (opcao && typeof opcao === "object" && "texto" in opcao) return String(opcao.texto ?? "");
  return opcao === null || opcao === undefined ? "" : String(opcao);
};

const indiceValido = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

/** A ordem exibida só vale se for uma permutação de 0..n-1; senão, null (usa a do cadastro). */
function ordemDasAlternativas(ordem, n) {
  if (!Array.isArray(ordem) || ordem.length !== n) return null;
  if (!ordem.every((i) => indiceValido(i, n))) return null;
  return new Set(ordem).size === n ? ordem : null;
}

/**
 * A prova de uma tentativa como o aluno a viu.
 * @returns {{
 *   temDetalhe: boolean,
 *   questoes: Array<{
 *     id: string, posicao: number|null, pergunta: string,
 *     status: "acertou"|"errou"|"sem_resposta",
 *     ordemRegistrada: boolean,
 *     alternativas: Array<{ letra: string, texto: string, indiceOriginal: number,
 *                           marcada: boolean, correta: boolean }>
 *   }>
 * }}
 */
export function detalharTentativa(tentativa) {
  const respostaDaQuestao = new Map();
  for (const r of lista(tentativa?.respostas)) {
    if (r && r.questao_id !== undefined) respostaDaQuestao.set(r.questao_id, r);
  }

  const questoes = lista(tentativa?.prova)
    .filter((q) => q && typeof q === "object")
    .map((q, i) => {
      const opcoes = lista(q.opcoes).map(textoDaAlternativa);
      const r = respostaDaQuestao.get(q.questao_id);
      const ordem = ordemDasAlternativas(r?.ordem_opcoes_exibida, opcoes.length);
      const indices = ordem ?? opcoes.map((_, k) => k);
      const marcada = indiceValido(r?.resposta, opcoes.length) ? r.resposta : null;
      const correta = indiceValido(q.correta, opcoes.length) ? q.correta : null;
      let status = "sem_resposta";
      if (marcada !== null) {
        const acertou = correta !== null ? marcada === correta : r?.acertou === true;
        status = acertou ? "acertou" : "errou";
      }
      return {
        id: String(q.questao_id ?? `q${i}`),
        posicao: Number.isInteger(r?.posicao_exibida) ? r.posicao_exibida : null,
        pergunta: typeof q.pergunta === "string" ? q.pergunta : "",
        status,
        ordemRegistrada: ordem !== null,
        alternativas: indices.map((original, lugar) => ({
          letra: LETRAS[lugar] ?? String(lugar + 1),
          texto: opcoes[original],
          indiceOriginal: original,
          marcada: original === marcada,
          correta: original === correta,
        })),
        ordemNaProva: i,
      };
    });

  // pela posição exibida (quem não tem posição vai depois, na ordem em que a prova foi gravada)
  questoes.sort((a, b) => {
    const pa = a.posicao ?? Number.POSITIVE_INFINITY;
    const pb = b.posicao ?? Number.POSITIVE_INFINITY;
    return pa === pb ? a.ordemNaProva - b.ordemNaProva : pa - pb;
  });

  return {
    temDetalhe: questoes.length > 0,
    questoes: questoes.map(({ ordemNaProva, ...resto }) => resto),
  };
}
