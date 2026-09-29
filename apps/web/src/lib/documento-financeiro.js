/**
 * documento-financeiro — transforma o `DocumentoFiscal` lido ("Ler documento":
 * XML pelo nfe-xml.js ou PDF/foto pela IA) no preenchimento do formulário de
 * NOVA despesa ou NOVA receita. Puro: não salva nada, só devolve o que a tela
 * aplica para o usuário conferir.
 *
 * DocumentoFiscal: { origem, tipo, numero, chave, data_emissao, valor_total,
 *   emitente: { nome, documento, ie, endereco }, destinatario: { nome, documento },
 *   vencimentos: [{ numero, data, valor }], forma_pagamento, descricao,
 *   itens: [{ descricao, codigo, ean, ncm, unidade, quantidade, valor_unitario, valor_total }],
 *   avisos: string[], duvidosos: string[] }
 */
import { normalizarTexto } from "./busca";
import { limparCnpj } from "./cnpj";
import { categoriaDoFornecedor } from "./categorias-fornecedor";

const ROTULOS = {
  nfe: "NF-e",
  nfce: "NFC-e",
  nfse: "NFS-e",
  recibo: "Recibo",
  cupom: "Cupom fiscal",
  boleto: "Boleto",
  comprovante_pix: "PIX",
  outro: "Documento",
};

// opções do Select "Forma de pagamento" de cada tela
const FORMAS_DESPESA = ["dinheiro", "pix", "transferencia", "boleto", "cartao"];
const FORMAS_RECEITA = ["dinheiro", "pix", "transferencia", "boleto"];

/** Texto com espaços colapsados; null se vazio. */
const limpo = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim() || null;

const chaveNome = (s) => normalizarTexto(limpo(s) || "");

/**
 * Pessoa cadastrada (fornecedor ou cliente) do documento: primeiro pelos
 * DÍGITOS do CPF/CNPJ (o cadastro pode ter pontuação), depois pelo nome
 * (sem acento, sem diferença de maiúsculas e espaços).
 * @param {Array<object>} pessoas fornecedores ou clientes (com `nome_razao`)
 * @param {{ nome?: string|null, documento?: string|null }} alvo
 * @param {"cnpj"|"documento"} campoDocumento campo do cadastro com o CPF/CNPJ
 */
export function acharPessoa(pessoas, alvo, campoDocumento) {
  const lista = pessoas || [];
  const digitos = limparCnpj(alvo?.documento);
  if (digitos) {
    const porDocumento = lista.find((p) => limparCnpj(p?.[campoDocumento]) === digitos);
    if (porDocumento) return porDocumento;
  }
  const nome = chaveNome(alvo?.nome);
  if (!nome) return null;
  return lista.find((p) => chaveNome(p?.nome_razao) === nome) || null;
}

const ehCategoriaDeDespesa = (c) => normalizarTexto(c?.tipo || "Despesa") === "despesa";

/**
 * Monta o preenchimento do formulário a partir do documento lido.
 * Só traz no `patch` os campos que o documento trouxe (a tela mescla com
 * `setForm(prev => ({ ...prev, ...patch }))` e mantém o resto).
 *
 * @param {object|null} doc DocumentoFiscal
 * @param {{ tipo: "despesa"|"receita", pessoas?: object[], categorias?: object[] }} opcoes
 *   pessoas = fornecedores (despesa) ou clientes (receita); categorias = CategoriaFinanceira
 * @returns {{ patch: object, parcelas: object[], itens: object[],
 *   pessoaSugerida: { nome: string|null, documento: string|null, endereco: string|null } | null,
 *   avisos: string[] }}
 */
export function montarPreenchimento(doc, { tipo, pessoas = [], categorias = [] } = {}) {
  const vazio = { patch: {}, parcelas: [], itens: [], pessoaSugerida: null, avisos: [] };
  if (!doc) return vazio;

  const despesa = tipo !== "receita";
  const patch = {};

  const vencimentos = (doc.vencimentos || [])
    .filter((v) => v && v.data && Number.isFinite(v.valor))
    .sort((a, b) => a.data.localeCompare(b.data));

  // valor: total do documento; sem total (boleto lido pela IA), a soma dos vencimentos
  const valor = Number.isFinite(doc.valor_total)
    ? doc.valor_total
    : vencimentos.length
      ? vencimentos.reduce((s, v) => s + v.valor, 0)
      : null;
  if (valor != null) patch.valor = valor.toFixed(2);

  if (doc.data_emissao) patch.data_competencia = doc.data_emissao;
  const vencimento = vencimentos[0]?.data || doc.data_emissao;
  if (vencimento) patch.data_vencimento = vencimento;

  const forma =
    doc.forma_pagamento ||
    (doc.tipo === "boleto" ? "boleto" : doc.tipo === "comprovante_pix" ? "pix" : null);
  if (forma && (despesa ? FORMAS_DESPESA : FORMAS_RECEITA).includes(forma)) {
    patch.forma_pagamento = forma;
  }

  // despesa: a pessoa é quem vendeu/prestou (emitente); receita: quem paga (destinatário/tomador)
  const pessoaDoc = (despesa ? doc.emitente : doc.destinatario) || {};
  const nomeDoc = limpo(pessoaDoc.nome);
  const documentoDoc = limpo(pessoaDoc.documento);

  const rotulo = [ROTULOS[doc.tipo] || ROTULOS.outro, limpo(doc.numero)].filter(Boolean).join(" ");
  const complemento = nomeDoc || limpo(doc.descricao);
  if (limpo(doc.numero) || complemento) {
    patch.descricao = [rotulo, complemento].filter(Boolean).join(" - ");
  }

  if (despesa) {
    if (doc.chave) patch.chave_nfe = doc.chave;
    // chave primeiro: a Nota de Devolução procura despesas com numero_documento de 44 dígitos
    const numeroDocumento = limpo(doc.chave) || limpo(doc.numero);
    if (numeroDocumento) patch.numero_documento = numeroDocumento;
  }

  let pessoaSugerida = null;
  if (nomeDoc || documentoDoc) {
    const [campoId, campoNome] = despesa
      ? ["fornecedor_id", "fornecedor_nome"]
      : ["cliente_id", "cliente_nome"];
    const achada = acharPessoa(
      pessoas,
      { nome: nomeDoc, documento: documentoDoc },
      despesa ? "cnpj" : "documento"
    );
    if (achada) {
      patch[campoId] = achada.id;
      patch[campoNome] = achada.nome_razao || nomeDoc || "";
      if (despesa) {
        const categoria = categoriaDoFornecedor(
          achada,
          (categorias || []).filter(ehCategoriaDeDespesa)
        );
        if (categoria) {
          patch.categoria_id = categoria.id;
          patch.categoria_nome = categoria.nome;
        }
      }
    } else {
      // documento de outra pessoa: tira a seleção anterior e guarda o nome lido
      patch[campoId] = "";
      patch[campoNome] = nomeDoc || "";
      pessoaSugerida = {
        nome: nomeDoc,
        documento: documentoDoc,
        endereco: limpo(pessoaDoc.endereco),
      };
    }
  }

  const parcelas =
    vencimentos.length > 1
      ? vencimentos.map((v, i) => ({
          numero: i + 1,
          valor: v.valor,
          data_vencimento: v.data,
          data_pagamento: despesa ? null : "",
          status: "em_aberto",
        }))
      : [];

  // mesmo formato que o AssociarMateriaisModal recebia do importador de XML antigo
  const itens = (doc.itens || [])
    .filter((i) => i && limpo(i.descricao))
    .map((i) => ({
      descricao: limpo(i.descricao),
      codigo: i.codigo || "",
      ean: i.ean || "",
      ncm: i.ncm || "",
      unidade: i.unidade || "UN",
      quantidade: i.quantidade ?? 0,
      valor_unitario: i.valor_unitario ?? 0,
      valor_total: i.valor_total ?? 0,
    }));

  return { patch, parcelas, itens, pessoaSugerida, avisos: [...(doc.avisos || [])] };
}
