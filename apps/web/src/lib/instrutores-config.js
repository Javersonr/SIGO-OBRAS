/**
 * Instrutores e responsáveis técnicos já cadastrados nos treinamentos de
 * Configurações (entidade Treinamento), deduplicados por nome.
 *
 * Legado Base44: `instrutor_nome` costuma guardar uma LISTA em JSON
 * [{nome, cpf, formacao, assinatura_url}], mas pode ser texto puro.
 */
export function pessoasDosTreinamentos(treinamentos) {
  const instrutores = new Map();
  const responsaveis = new Map();
  const chave = (n) => n.trim().toLowerCase();

  for (const t of treinamentos || []) {
    let lista = [];
    const bruto = (t.instrutor_nome || "").trim();
    if (bruto.startsWith("[")) {
      try {
        const p = JSON.parse(bruto);
        if (Array.isArray(p)) lista = p;
      } catch {
        /* JSON quebrado: ignora */
      }
    } else if (bruto) {
      lista = [{ nome: bruto, formacao: "" }];
    }
    for (const i of lista) {
      const nome = (i?.nome || "").trim();
      if (nome && !instrutores.has(chave(nome))) {
        instrutores.set(chave(nome), { nome, qualificacao: (i.formacao || "").trim() });
      }
    }

    for (const [n, reg] of [
      [t.responsavel_tecnico_nome, t.responsavel_tecnico_criacao],
      [t.engenheiro_responsavel_nome, t.engenheiro_responsavel_crea],
    ]) {
      const nome = (n || "").trim();
      if (nome && !responsaveis.has(chave(nome))) {
        responsaveis.set(chave(nome), { nome, registro: (reg || "").trim() });
      }
    }
  }

  const porNome = (a, b) => a.nome.localeCompare(b.nome);
  return {
    instrutores: [...instrutores.values()].sort(porNome),
    responsaveis: [...responsaveis.values()].sort(porNome),
  };
}
