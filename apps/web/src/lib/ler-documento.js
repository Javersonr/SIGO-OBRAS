/**
 * ler-documento — regras puras do botão "Ler documento" (Financeiro → nova
 * despesa / nova receita) e do cadastro rápido da pessoa lida.
 *
 *   - classificarArquivo: XML (NF-e, NFC-e, NFS-e) é lido no navegador e sobe
 *     no bucket nfe-xml; PDF e foto sobem no bucket comprovantes e são lidos
 *     pela IA. Os buckets só aceitam os mimes e tamanhos da migração 0015 e o
 *     navegador às vezes manda o arquivo sem tipo — por isso o mime e o nome
 *     (com a extensão que a ia-processar confere) saem daqui;
 *   - listaConferir: o que o aviso "Confira os campos destacados" mostra;
 *   - dadosIniciaisCadastro / mesclarDadosIniciais: `pessoaSugerida` do
 *     montarPreenchimento → formulário de Novo Fornecedor / Novo Cliente.
 */
import { limparCnpj } from "./cnpj";

/** `accept` do input do botão (lista fixada na spec). */
export const ACEITAR_DOCUMENTO = ".xml,application/pdf,image/jpeg,image/png,image/webp";

const MB = 1024 * 1024;
/** file_size_limit dos buckets (migração 0015) */
const LIMITE_MB = { comprovantes: 10, "nfe-xml": 5 };

const MIME_POR_EXTENSAO = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const EXTENSAO_POR_MIME = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MIMES_XML = ["text/xml", "application/xml"];

const extensaoDe = (nome) => {
  const m = String(nome || "")
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
};

/**
 * Como o arquivo escolhido é lido e onde ele sobe.
 * @param {{ name?: string, type?: string, size?: number } | null} arquivo File do input
 * @returns {{ ok: true, modo: "xml" | "ia", bucket: "nfe-xml" | "comprovantes",
 *   mimeType: string, nomeArquivo: string } | { ok: false, erro: string }}
 */
export function classificarArquivo(arquivo) {
  if (!arquivo) return { ok: false, erro: "Nenhum arquivo escolhido." };
  const nome = String(arquivo.name || "").trim() || "documento";
  const ext = extensaoDe(nome);
  const tipo = String(arquivo.type || "").toLowerCase();

  if (ext === "heic" || ext === "heif" || /^image\/hei[cf]/.test(tipo)) {
    return {
      ok: false,
      erro: "Foto em HEIC (padrão do iPhone) não é aceita — tire a foto em JPEG (iPhone: Ajustes → Câmera → Formatos → Mais Compatível) ou envie o PDF.",
    };
  }

  let destino;
  if (ext === "xml" || MIMES_XML.includes(tipo)) {
    destino = {
      modo: "xml",
      bucket: "nfe-xml",
      mimeType: MIMES_XML.includes(tipo) ? tipo : "text/xml",
      nomeArquivo: ext === "xml" ? nome : `${nome}.xml`,
    };
  } else {
    const mimeType = EXTENSAO_POR_MIME[tipo] ? tipo : MIME_POR_EXTENSAO[ext];
    if (!mimeType) {
      return { ok: false, erro: "Formato não aceito — envie XML, PDF, JPG, PNG ou WEBP." };
    }
    destino = {
      modo: "ia",
      bucket: "comprovantes",
      mimeType,
      // a ia-processar confere a extensão do caminho (pdf/jpg/jpeg/png/webp)
      nomeArquivo: MIME_POR_EXTENSAO[ext] ? nome : `${nome}.${EXTENSAO_POR_MIME[mimeType]}`,
    };
  }

  const tamanho = Number(arquivo.size) || 0;
  if (tamanho <= 0) return { ok: false, erro: "O arquivo está vazio." };
  const limite = LIMITE_MB[destino.bucket];
  if (tamanho > limite * MB) {
    const mb = (tamanho / MB).toFixed(1).replace(".", ",");
    return { ok: false, erro: `Arquivo grande demais (${mb} MB) — o limite é ${limite} MB.` };
  }
  return { ok: true, ...destino };
}

const ROTULOS_CAMPO = {
  tipo: "Tipo do documento",
  numero: "Número",
  chave: "Chave da NF-e",
  data_emissao: "Data de emissão",
  valor_total: "Valor",
  emitente: "Emitente",
  "emitente.nome": "Nome do emitente",
  "emitente.documento": "CNPJ/CPF do emitente",
  "emitente.ie": "Inscrição estadual do emitente",
  "emitente.endereco": "Endereço do emitente",
  destinatario: "Destinatário",
  "destinatario.nome": "Nome do destinatário",
  "destinatario.documento": "CNPJ/CPF do destinatário",
  vencimentos: "Vencimentos",
  forma_pagamento: "Forma de pagamento",
  descricao: "Descrição",
  itens: "Itens",
};

/**
 * Rótulo do campo que a IA marcou em `duvidosos` ("valor_total",
 * "emitente.documento", "vencimentos[1].data"...). Desconhecido → o próprio texto.
 */
export function rotuloCampo(campo) {
  const bruto = String(campo ?? "").trim();
  if (!bruto) return "";
  // a posição na lista não importa: "vencimentos[1].data" / "itens.2.quantidade" → a lista
  const chave = bruto.replace(/\[\d+\].*$/, "").replace(/\.\d+(\..*)?$/, "");
  return ROTULOS_CAMPO[chave] || ROTULOS_CAMPO[chave.split(".")[0]] || bruto;
}

/**
 * O que o aviso "Confira os campos destacados" lista.
 * @param {string[] | undefined} duvidosos DocumentoFiscal.duvidosos
 * @param {string[] | undefined} avisos DocumentoFiscal.avisos
 * @returns {{ campos: string[], avisos: string[] }} sem repetição e sem vazios
 */
export function listaConferir(duvidosos, avisos) {
  const campos = [];
  for (const c of duvidosos || []) {
    const r = rotuloCampo(c);
    if (r && !campos.includes(r)) campos.push(r);
  }
  const textos = (avisos || []).map((a) => String(a ?? "").trim()).filter(Boolean);
  return { campos, avisos: [...new Set(textos)] };
}

/** CNPJ (14 dígitos) e CPF (11) com pontuação; o resto fica como veio. */
export function formatarCpfCnpj(valor) {
  const d = limparCnpj(valor);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return String(valor ?? "").trim();
}

/**
 * `pessoaSugerida` ({ nome, documento, endereco }) → prop `dadosIniciais` do
 * cadastro rápido: fornecedor usa `cnpj`, cliente usa `documento`.
 * @param {"cnpj" | "documento"} campoDocumento
 */
export function dadosIniciaisCadastro(pessoa, campoDocumento) {
  if (!pessoa) return null;
  return {
    nome_razao: pessoa.nome || "",
    [campoDocumento]: formatarCpfCnpj(pessoa.documento),
    endereco: pessoa.endereco || "",
  };
}

/**
 * Formulário vazio do cadastro + `dadosIniciais` (só os campos que existem no
 * formulário e vieram preenchidos). CPF (11 dígitos) → PF; CNPJ (14) → PJ.
 * @param {"cnpj" | "documento"} campoDocumento
 */
export function mesclarDadosIniciais(formVazio, dados, campoDocumento) {
  const form = { ...formVazio };
  if (!dados) return form;
  for (const [campo, valor] of Object.entries(dados)) {
    if (campo in formVazio && typeof valor === "string" && valor.trim()) form[campo] = valor.trim();
  }
  if ("tipo_pessoa" in formVazio) {
    const digitos = limparCnpj(form[campoDocumento]);
    if (digitos.length === 11) form.tipo_pessoa = "PF";
    else if (digitos.length === 14) form.tipo_pessoa = "PJ";
  }
  return form;
}
