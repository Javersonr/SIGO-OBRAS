/** Remove alternativas vazias preservando o gabarito escolhido pelo RH. */
export function normalizarQuestao({ pergunta, opcoes, correta, comentario } = {}) {
  const texto = typeof pergunta === "string" ? pergunta.trim() : "";
  if (!texto) return { ok: false, erro: "Informe a pergunta" };
  if (
    !Array.isArray(opcoes) ||
    !Number.isInteger(correta) ||
    correta < 0 ||
    correta >= opcoes.length
  ) {
    return { ok: false, erro: "Marque a alternativa correta" };
  }
  const alternativas = opcoes.map((opcao) => (typeof opcao === "string" ? opcao.trim() : ""));
  if (!alternativas[correta])
    return { ok: false, erro: "A alternativa correta não pode estar vazia" };
  const preenchidas = alternativas.filter(Boolean);
  if (preenchidas.length < 2) return { ok: false, erro: "Informe pelo menos 2 alternativas" };
  return {
    ok: true,
    dados: {
      pergunta: texto,
      opcoes: preenchidas,
      correta: alternativas.slice(0, correta).filter(Boolean).length,
      comentario: typeof comentario === "string" ? comentario.trim() || null : null,
    },
  };
}
