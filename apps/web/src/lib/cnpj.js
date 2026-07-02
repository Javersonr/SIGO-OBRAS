/**
 * Consulta de CNPJ na Receita (via APIs públicas) para autopreencher
 * cadastros de cliente/fornecedor.
 *
 * Fontes (ambas gratuitas, sem chave, com CORS liberado):
 *   1ª BrasilAPI    — https://brasilapi.com.br/api/cnpj/v1/{cnpj}
 *   2ª minhareceita — https://minhareceita.org/{cnpj}  (fallback)
 *
 * Retorna um objeto NEUTRO; cada formulário mapeia pros seus campos.
 */

export function limparCnpj(valor) {
  return String(valor || "").replace(/\D/g, "");
}

/** Validação com dígitos verificadores. */
export function validarCnpj(valor) {
  const cnpj = limparCnpj(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base) => {
    let soma = 0;
    let peso = base.length - 7;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 13));
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

function montarTelefone(t) {
  // BrasilAPI: ddd_telefone_1 = "62999998888"; minhareceita: ddd_1 + telefone_1
  const bruto =
    t.ddd_telefone_1 ||
    (t.ddd_1 && t.telefone_1 ? `${t.ddd_1}${t.telefone_1}` : "") ||
    (t.ddd1 && t.telefone1 ? `${t.ddd1}${t.telefone1}` : "");
  const dig = limparCnpj(bruto).replace(/^0+/, "");
  if (dig.length < 10) return "";
  const ddd = dig.slice(0, 2);
  const num = dig.slice(2);
  return `(${ddd}) ${num.length === 9 ? num.slice(0, 5) + "-" + num.slice(5) : num.slice(0, 4) + "-" + num.slice(4)}`;
}

function mapear(t) {
  const logradouro = [t.descricao_tipo_de_logradouro, t.logradouro]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    razao_social: t.razao_social || "",
    nome_fantasia: t.nome_fantasia || "",
    email: (t.email || "").toLowerCase(),
    telefone: montarTelefone(t),
    endereco: logradouro || t.logradouro || "",
    numero: t.numero || "",
    complemento: t.complemento || "",
    bairro: t.bairro || "",
    cidade: t.municipio || "",
    estado: t.uf || "",
    cep: limparCnpj(t.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2"),
    situacao: t.descricao_situacao_cadastral || t.situacao_cadastral || "",
    atividade: t.cnae_fiscal_descricao || t.cnae_fiscal?.descricao || "",
  };
}

/**
 * Consulta o CNPJ. Lança Error com mensagem amigável em caso de falha.
 * @returns {Promise<ReturnType<typeof mapear>>}
 */
export async function consultarCnpj(valor) {
  const cnpj = limparCnpj(valor);
  if (!validarCnpj(cnpj)) {
    throw new Error("CNPJ inválido — confira os dígitos.");
  }

  // 1ª tentativa: BrasilAPI
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (res.ok) return mapear(await res.json());
    if (res.status === 404) throw new Error("CNPJ não encontrado na Receita.");
  } catch (e) {
    if (e.message?.includes("não encontrado")) throw e;
    // rede/rate-limit → tenta o fallback
  }

  // 2ª tentativa: minhareceita.org
  const res2 = await fetch(`https://minhareceita.org/${cnpj}`);
  if (!res2.ok) {
    throw new Error(
      res2.status === 404
        ? "CNPJ não encontrado na Receita."
        : "Serviço de consulta indisponível no momento — tente de novo em instantes."
    );
  }
  return mapear(await res2.json());
}
