/**
 * importacao-xml — "Importar XML / NF-e" da LISTA de despesas e de receitas:
 * cria o lançamento direto, sem abrir o formulário. Usa o mesmo leitor
 * (lerXmlFiscal) e o mesmo preenchimento (montarPreenchimento) do botão
 * "Ler documento", então descrição, datas, forma de pagamento, chave e
 * categoria saem iguais nos dois caminhos.
 *
 * Puro: quem chama busca/cria a pessoa (casada por acharPessoa, pelos
 * dígitos do CPF/CNPJ) e grava o registro.
 */
import { limparCnpj } from "./cnpj";
import { montarPreenchimento } from "./documento-financeiro";

const ROTULOS = { nfe: "NF-e", nfce: "NFC-e", nfse: "NFS-e" };

/** Pessoa do lançamento: despesa → emitente (quem vendeu); receita → destinatário (quem paga). */
const pessoaDoDocumento = (doc, despesa) => (despesa ? doc?.emitente : doc?.destinatario) || {};

/**
 * Registro de TransacaoFinanceira da importação pela lista.
 * Duplicatas NÃO viram parcelas aqui: o lançamento vence no 1º vencimento
 * (a tela avisa e sugere "Nova → Ler documento" para parcelar).
 *
 * @param {object} doc DocumentoFiscal
 * @param {{ tipo: "despesa" | "receita", pessoa: object | null, conta?: { id, nome },
 *   categorias?: object[], empresaId: string, hoje: string }} opcoes
 *   pessoa = fornecedor/cliente já cadastrado (ou recém-criado); hoje = AAAA-MM-DD
 * @returns {{ registro: object, duplicatas: number, rotulo: string }}
 */
export function lancamentoDoXml(doc, { tipo, pessoa, conta, categorias = [], empresaId, hoje }) {
  const despesa = tipo !== "receita";
  const { patch, parcelas } = montarPreenchimento(doc, {
    tipo,
    pessoas: pessoa ? [pessoa] : [],
    categorias,
  });
  const rotulo = ROTULOS[doc.tipo] || "Nota";
  const numero = doc.numero || "S/N";
  const nome =
    pessoa?.nome_razao ||
    pessoaDoDocumento(doc, despesa).nome ||
    (despesa ? "Fornecedor Desconhecido" : "Cliente Desconhecido");

  const registro = {
    empresa_id: empresaId,
    // mesma grafia do salvar de cada tela
    tipo: despesa ? "Despesa" : "receita",
    conta_id: conta?.id,
    conta_nome: conta?.nome,
    valor: parseFloat(patch.valor) || 0,
    data: patch.data_competencia || hoje,
    data_vencimento: patch.data_vencimento || hoje,
    descricao: patch.descricao || `${rotulo} ${numero} - ${nome}`,
    status: "em_aberto",
    forma_pagamento: patch.forma_pagamento || null,
    observacoes: `Importado de XML - ${rotulo} ${numero}`,
  };
  if (despesa) {
    Object.assign(registro, {
      fornecedor_id: pessoa?.id || null,
      fornecedor_nome: nome,
      categoria_id: patch.categoria_id || null,
      categoria_nome: patch.categoria_nome || null,
      chave_nfe: patch.chave_nfe || null,
      numero_documento: patch.numero_documento || null,
    });
  } else {
    Object.assign(registro, { cliente_id: pessoa?.id || null, cliente_nome: nome });
  }
  return { registro, duplicatas: parcelas.length, rotulo };
}

/**
 * Cadastro criado quando a pessoa do XML não existe.
 * Despesa: sempre cria o fornecedor (como a importação antiga), CNPJ/CPF só
 * dígitos. Receita: só cria o cliente com CPF/CNPJ — sem ele, null (o
 * lançamento guarda só o nome lido).
 * @returns {object | null} campos para Fornecedor.create / Cliente.create (sem empresa_id)
 */
export function cadastroDoXml(doc, tipo) {
  const despesa = tipo !== "receita";
  const p = pessoaDoDocumento(doc, despesa);
  const documento = limparCnpj(p.documento);
  if (!despesa && !documento) return null;
  const base = {
    nome_razao:
      String(p.nome || "").trim() || (despesa ? "Fornecedor Desconhecido" : "Cliente Desconhecido"),
    tipo_pessoa: documento.length === 11 ? "PF" : "PJ",
    ativo: true,
  };
  return despesa
    ? { ...base, cnpj: documento, inscricao_estadual: p.ie || "" }
    : { ...base, documento };
}
