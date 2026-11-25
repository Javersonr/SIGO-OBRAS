/**
 * orcamento-fornecedor — lógica PURA do "anexar orçamento" no link da cotação
 * (pages/AcessoFornecedor.jsx) e do atalho do anexo na comparação de preços
 * (components/compras/ComparacaoPrecos.jsx). Sem React e sem sigoClient.
 *
 * A Edge Function portal-fornecedor-orcamento guarda o arquivo e devolve SUGESTÕES lidas pela
 * IA; aqui elas viram preenchimento dos campos VAZIOS, com marca para o fornecedor conferir.
 * Nada é gravado por aqui: o preço só vai para o servidor no "Enviar Cotação".
 *
 * "Sugerido" = o que a leitura pôs em cada campo. O campo conta como "lido do arquivo" enquanto
 * o valor na tela for igual ao sugerido; se o fornecedor mexer, passa a ser valor dele.
 */

export const MAX_MB_ORCAMENTO = 10;
/** atributo accept do <input type="file"> */
export const ACEITA_ORCAMENTO = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
/** igual a ORIGEM_PORTAL e BUCKET_ORCAMENTO da Edge Function */
const ORIGEM_PORTAL = "portal-fornecedor";
const PREFIXO_REF = "anexos-cotacao/";

const CAMPOS = ["valor_unitario", "prazo_entrega", "observacoes"];

const vazio = (v) => v === undefined || v === null || String(v).trim() === "";

/** confere o arquivo antes de enviar; null = pode seguir (o servidor confere de novo) */
export function erroArquivoOrcamento(arquivo, maxMb = MAX_MB_ORCAMENTO) {
  const nome = String(arquivo?.name ?? "").trim();
  if (!nome) return "Escolha o arquivo do orçamento.";
  if (/\.hei[cf]$/i.test(nome)) {
    return "Foto em HEIC (padrão do iPhone) não é aceita. Envie em JPG ou PNG, ou o PDF do orçamento.";
  }
  if (!/\.(pdf|jpe?g|png)$/i.test(nome)) {
    return "Formato não aceito. Envie o orçamento em PDF, JPG ou PNG.";
  }
  const bytes = Number(arquivo?.size);
  if (!Number.isFinite(bytes) || bytes <= 0) return "O arquivo está vazio. Escolha outro.";
  if (bytes > maxMb * 1024 * 1024) return `O arquivo passa de ${maxMb} MB. Envie um arquivo menor.`;
  return null;
}

/** "340 KB", "1,2 MB" */
export function tamanhoLegivel(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** valor numérico → texto do <input type="number"> (ponto decimal, até 4 casas) */
export function valorParaCampo(n) {
  const v = Number(n);
  return Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : "";
}

/** "R$ 48,90" (até 4 casas quando o valor tem fração de centavo) */
export function reais(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

const linhaDe = (r) => ({
  valor_unitario: r?.valor_unitario ?? "",
  prazo_entrega: r?.prazo_entrega ?? "",
  observacoes: r?.observacoes ?? "",
});

/** o campo ainda está com o valor que a leitura pôs? */
export function campoLido(respostas, sugerido, itemId, campo) {
  const s = sugerido?.[itemId]?.[campo];
  if (vazio(s)) return false;
  return String(respostas?.[itemId]?.[campo] ?? "") === String(s);
}

/**
 * Tira dos campos o que veio de uma leitura e o fornecedor não mexeu (troca ou remoção do
 * arquivo: valor de um orçamento errado não pode ficar na tela como se fosse digitado).
 */
export function limparSugeridos(respostas, sugerido) {
  const novas = { ...(respostas || {}) };
  for (const itemId of Object.keys(sugerido || {})) {
    if (!novas[itemId]) continue;
    const linha = linhaDe(novas[itemId]);
    for (const campo of CAMPOS) {
      if (campoLido(respostas, sugerido, itemId, campo)) linha[campo] = "";
    }
    novas[itemId] = linha;
  }
  return novas;
}

/**
 * Aplica as sugestões da leitura nos campos VAZIOS. O que o fornecedor já digitou fica: se o
 * valor digitado for diferente do lido, a linha inteira é mantida e o item entra em `mantidos`.
 * `sugeridoAnterior` = marcas da leitura anterior (campos ainda intocados são substituídos).
 *
 * @returns {{ respostas: object, sugerido: object, mantidos: string[] }}
 */
export function aplicarSugestoes(respostas, sugestoes, sugeridoAnterior = {}) {
  const novas = limparSugeridos(respostas, sugeridoAnterior);
  const sugerido = {};
  const mantidos = [];
  for (const [itemId, s] of Object.entries(sugestoes || {})) {
    const valor = valorParaCampo(s?.valor_unitario);
    if (!valor || !(Number(valor) > 0)) continue;
    const linha = linhaDe(novas[itemId]);
    const marcas = {};
    if (vazio(linha.valor_unitario)) {
      linha.valor_unitario = valor;
      marcas.valor_unitario = valor;
    } else if (Number(String(linha.valor_unitario).replace(",", ".")) !== Number(valor)) {
      mantidos.push(itemId);
      continue;
    }
    if (vazio(linha.prazo_entrega) && !vazio(s?.prazo_entrega)) {
      linha.prazo_entrega = String(s.prazo_entrega);
      marcas.prazo_entrega = linha.prazo_entrega;
    }
    if (vazio(linha.observacoes) && !vazio(s?.observacoes)) {
      linha.observacoes = String(s.observacoes);
      marcas.observacoes = linha.observacoes;
    }
    novas[itemId] = linha;
    if (Object.keys(marcas).length) sugerido[itemId] = marcas;
  }
  return { respostas: novas, sugerido, mantidos };
}

/** quantos itens ainda estão com o valor unitário exatamente como a leitura pôs */
export function contarValoresLidos(respostas, sugerido) {
  return Object.keys(sugerido || {}).filter((id) =>
    campoLido(respostas, sugerido, id, "valor_unitario")
  ).length;
}

/**
 * Marca a mostrar embaixo do item, ou null.
 *   lido            → valor veio do arquivo, sem ressalva
 *   atencao         → valor veio do arquivo, com motivo para conferir (textos)
 *   mantido         → o fornecedor já tinha digitado outro valor; mostra o do arquivo
 *   nao_encontrado  → item sem valor no arquivo e ainda em branco
 *
 * @returns {{ tipo: string, textos: string[], noDocumento: string } | null}
 */
export function marcaDoItem(itemId, { respostas, sugerido, leitura, mantidos } = {}) {
  if (!leitura?.feita) return null;
  const s = leitura.sugestoes?.[itemId];
  if (s) {
    const noDocumento = String(s.descricao_no_documento || "");
    if (campoLido(respostas, sugerido, itemId, "valor_unitario")) {
      const textos = Array.isArray(s.atencao) ? s.atencao.filter(Boolean).map(String) : [];
      return { tipo: textos.length ? "atencao" : "lido", textos, noDocumento };
    }
    if ((mantidos || []).includes(itemId)) {
      return {
        tipo: "mantido",
        textos: [`No arquivo o valor é ${reais(s.valor_unitario)}. Mantivemos o que você digitou.`],
        noDocumento,
      };
    }
    return null; // o fornecedor mexeu no valor: agora é dele
  }
  if (
    (leitura.nao_encontrados || []).includes(itemId) &&
    vazio(respostas?.[itemId]?.valor_unitario)
  ) {
    return { tipo: "nao_encontrado", textos: [], noDocumento: "" };
  }
  return null;
}

/** faixa de resultado da leitura: { tom: "ok" | "aviso", titulo, detalhe } */
export function resumoDaLeitura(leitura) {
  if (!leitura) return null;
  if (!leitura.feita) {
    return {
      tom: "aviso",
      titulo: "Arquivo anexado, mas os valores não foram lidos",
      detalhe: String(leitura.mensagem || "Preencha os valores à mão."),
    };
  }
  const lidos = Number(leitura.lidos) || 0;
  const total = Number(leitura.total) || 0;
  if (lidos === 0) {
    return {
      tom: "aviso",
      titulo: "Não encontramos os itens desta cotação no arquivo",
      detalhe: "Confira se anexou o orçamento certo ou preencha os valores à mão.",
    };
  }
  return {
    tom: "ok",
    titulo: `Lemos ${lidos} de ${total} ${total === 1 ? "item" : "itens"} do seu orçamento`,
    detalhe: "Confira os valores destacados antes de enviar. Nada foi enviado ainda.",
  };
}

/** aviso dos itens do arquivo que não são da cotação (mostra até 5 nomes), ou "" */
export function textoForaDaCotacao(fora) {
  const lista = (Array.isArray(fora) ? fora : [])
    .map((f) => String(f?.descricao || "").trim())
    .filter(Boolean);
  if (lista.length === 0) return "";
  const nomes = lista.slice(0, 5).join("; ");
  const resto = lista.length > 5 ? ` e mais ${lista.length - 5}` : "";
  return lista.length === 1
    ? `No seu arquivo há 1 item que não faz parte desta cotação e foi ignorado: ${nomes}.`
    : `No seu arquivo há ${lista.length} itens que não fazem parte desta cotação e foram ignorados: ${nomes}${resto}.`;
}

/** pergunta antes de enviar com valores ainda como a leitura pôs; "" = não precisa perguntar */
export function perguntaAntesDeEnviar(respostas, sugerido) {
  const n = contarValoresLidos(respostas, sugerido);
  if (n === 0) return "";
  return n === 1
    ? "1 valor foi preenchido pela leitura do seu arquivo. Você conferiu esse valor?"
    : `${n} valores foram preenchidos pela leitura do seu arquivo. Você conferiu todos?`;
}

/**
 * Orçamentos que o fornecedor anexou pelo link, a partir de
 * cotacao_fornecedor.arquivos_anexados (lista, ou texto JSON em linha do legado). Só entra
 * ref do nosso bucket de cotação marcada como vinda do portal; o mais recente fica por último.
 *
 * @returns {{ ref: string, nome: string, tamanho: number, enviado_em: string }[]}
 */
export function anexosDoOrcamento(valor) {
  let lista = valor;
  if (typeof lista === "string") {
    try {
      lista = JSON.parse(lista);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  return lista
    .filter(
      (a) =>
        a &&
        typeof a === "object" &&
        a.origem === ORIGEM_PORTAL &&
        typeof a.ref === "string" &&
        a.ref.startsWith(PREFIXO_REF) &&
        !a.ref.split("/").some((p) => !p || p === "." || p === "..")
    )
    .map((a) => ({
      ref: a.ref,
      nome: String(a.nome || "orcamento"),
      tamanho: Number(a.tamanho) || 0,
      enviado_em: String(a.enviado_em || ""),
    }));
}
