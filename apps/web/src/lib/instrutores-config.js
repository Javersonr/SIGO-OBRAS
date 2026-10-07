import { refDeAssinatura } from "@/lib/ead-assinatura";

/**
 * Instrutores e responsáveis técnicos já cadastrados nos treinamentos de
 * Configurações (entidade Treinamento), deduplicados por nome.
 *
 * Legado Base44: `instrutor_nome` costuma guardar uma LISTA em JSON
 * [{nome, cpf, formacao, assinatura_url}], mas pode ser texto puro.
 *
 * Cada pessoa leva também `assinatura_ref` (T29): a referência "assinaturas/<empresa>/..." da imagem da
 * assinatura que o RH anexou em Configurações, ou null. Assinatura do Base44 (arquivo perdido), URL e
 * pasta de outra empresa viram null. A tela do curso usa a referência ao escolher a pessoa; o curso
 * guarda a própria cópia (a imagem congelada no certificado vem do curso, junto do nome e do registro).
 * `empresaId` (opcional) confere a pasta da empresa.
 */
export function pessoasDosTreinamentos(treinamentos, empresaId = null) {
  const instrutores = new Map();
  const responsaveis = new Map();
  const chave = (n) => n.trim().toLowerCase();
  /** Guarda a pessoa na 1ª vez que o nome aparece; depois só completa a assinatura que faltava. */
  const guardar = (mapa, nome, resto, assinatura) => {
    const k = chave(nome);
    const ref = refDeAssinatura(assinatura, empresaId);
    const atual = mapa.get(k);
    if (!atual) mapa.set(k, { nome, ...resto, assinatura_ref: ref });
    else if (!atual.assinatura_ref && ref) atual.assinatura_ref = ref;
  };

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
      lista = [{ nome: bruto, formacao: "", assinatura_url: t.instrutor_assinatura_url }];
    }
    for (const i of lista) {
      const nome = (i?.nome || "").trim();
      if (nome)
        guardar(instrutores, nome, { qualificacao: (i.formacao || "").trim() }, i.assinatura_url);
    }

    for (const [n, reg, assinatura] of [
      [
        t.responsavel_tecnico_nome,
        t.responsavel_tecnico_criacao,
        t.responsavel_tecnico_assinatura_url,
      ],
      [
        t.engenheiro_responsavel_nome,
        t.engenheiro_responsavel_crea,
        t.engenheiro_responsavel_assinatura_url,
      ],
    ]) {
      const nome = (n || "").trim();
      if (nome) guardar(responsaveis, nome, { registro: (reg || "").trim() }, assinatura);
    }
  }

  const porNome = (a, b) => a.nome.localeCompare(b.nome);
  return {
    instrutores: [...instrutores.values()].sort(porNome),
    responsaveis: [...responsaveis.values()].sort(porNome),
  };
}
