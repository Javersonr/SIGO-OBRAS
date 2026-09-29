/**
 * nfe-xml — leitura de XML fiscal SEM IA e SEM DOMParser (os testes rodam no
 * Node): NF-e 4.0/2.0 (modelo 55), NFC-e (modelo 65), NFS-e ABRASF (1.x e
 * 2.x) e NFS-e do padrão nacional.
 *
 * `lerXmlFiscal(texto)` devolve o `DocumentoFiscal` comum (o mesmo formato
 * que a leitura por IA devolve, ver documento-financeiro.js) ou null quando o
 * arquivo não é XML bem formado ou não é de um desses tipos — quem chama avisa.
 *
 * Os nomes de tag são comparados sem o prefixo de namespace e sem diferenciar
 * maiúsculas ("ns2:InfNfse" = "infnfse"): cada prefeitura/emissor gera de um
 * jeito.
 */

// ---------------------------------------------------------------------------
// Mini-leitor de XML: árvore { nome, qnome, attrs, filhos, texto }
// ---------------------------------------------------------------------------

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodificar(s) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const hex = e[1] === "x" || e[1] === "X";
      const cp = hex ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    const k = e.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTIDADES, k) ? ENTIDADES[k] : m;
  });
}

const semPrefixo = (nome) => nome.slice(nome.indexOf(":") + 1);

/** Índice do ">" que fecha a tag (ignora ">" dentro de valores de atributo). */
function fimDaTag(s, desde) {
  let aspas = "";
  for (let j = desde; j < s.length; j++) {
    const c = s[j];
    if (aspas) {
      if (c === aspas) aspas = "";
    } else if (c === '"' || c === "'") {
      aspas = c;
    } else if (c === ">") {
      return j;
    }
  }
  return -1;
}

function depoisDe(s, marca, desde) {
  const f = s.indexOf(marca, desde);
  if (f === -1) throw new Error(`XML sem "${marca}"`);
  return f + marca.length;
}

function lerAtributos(s) {
  const attrs = {};
  const re = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) attrs[semPrefixo(m[1]).toLowerCase()] = decodificar(m[2] ?? m[3]);
  return attrs;
}

/** Lê o XML e devolve o elemento raiz. Lança em XML malformado. */
function lerArvore(texto) {
  const s = texto.replace(/^﻿/, "");
  const documento = { nome: "#documento", qnome: "", attrs: {}, filhos: [], texto: "" };
  const pilha = [documento];
  const atual = () => pilha[pilha.length - 1];
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    const fimTexto = lt === -1 ? s.length : lt;
    if (fimTexto > i) atual().texto += decodificar(s.slice(i, fimTexto));
    if (lt === -1) break;
    if (s.startsWith("<!--", lt)) {
      i = depoisDe(s, "-->", lt + 4);
    } else if (s.startsWith("<![CDATA[", lt)) {
      i = depoisDe(s, "]]>", lt + 9);
      atual().texto += s.slice(lt + 9, i - 3);
    } else if (s.startsWith("<?", lt)) {
      i = depoisDe(s, "?>", lt + 2);
    } else if (s.startsWith("<!", lt)) {
      i = depoisDe(s, ">", lt + 2); // DOCTYPE simples
    } else {
      const gt = fimDaTag(s, lt + 1);
      if (gt === -1) throw new Error("tag sem fim");
      let corpo = s.slice(lt + 1, gt);
      i = gt + 1;
      if (corpo[0] === "/") {
        const qnome = corpo.slice(1).trim();
        const topo = pilha.pop();
        if (pilha.length === 0 || topo.qnome !== qnome) {
          throw new Error(`fechamento inesperado </${qnome}>`);
        }
        continue;
      }
      const vazio = corpo.endsWith("/");
      if (vazio) corpo = corpo.slice(0, -1);
      const m = /^([^\s/<>"'=]+)([\s\S]*)$/.exec(corpo);
      if (!m) throw new Error("tag inválida");
      const el = {
        nome: semPrefixo(m[1]).toLowerCase(),
        qnome: m[1],
        attrs: lerAtributos(m[2]),
        filhos: [],
        texto: "",
      };
      atual().filhos.push(el);
      if (!vazio) pilha.push(el);
    }
  }
  if (pilha.length !== 1) throw new Error("tag sem fechamento");
  if (documento.filhos.length !== 1 || documento.texto.trim()) {
    throw new Error("não é um documento XML");
  }
  return documento.filhos[0];
}

// ---------------------------------------------------------------------------
// Navegação e conversão de valores
// ---------------------------------------------------------------------------

/** 1º filho direto com esse nome. */
function filho(el, nome) {
  if (!el) return null;
  const n = nome.toLowerCase();
  return el.filhos.find((f) => f.nome === n) || null;
}

function filhos(el, nome) {
  if (!el) return [];
  const n = nome.toLowerCase();
  return el.filhos.filter((f) => f.nome === n);
}

/** 1º descendente (em ordem de documento) com esse nome. */
function busca(el, nome) {
  if (!el) return null;
  const n = nome.toLowerCase();
  const pendentes = [...el.filhos].reverse();
  while (pendentes.length) {
    const f = pendentes.pop();
    if (f.nome === n) return f;
    for (let k = f.filhos.length - 1; k >= 0; k--) pendentes.push(f.filhos[k]);
  }
  return null;
}

/** O próprio elemento, se tiver o nome, senão o 1º descendente. */
const achar = (el, nome) => (el.nome === nome.toLowerCase() ? el : busca(el, nome));

/** Texto do caminho de filhos diretos (espaços colapsados); null se faltar ou vazio. */
function txt(el, ...caminho) {
  let a = el;
  for (const n of caminho) a = filho(a, n);
  const t = a ? a.texto.replace(/\s+/g, " ").trim() : "";
  return t || null;
}

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

function numero(v) {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Valor em reais: número ≥ 0 com 2 casas, ou null. */
function valor(v) {
  const n = numero(v);
  return n != null && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** AAAA-MM-DD (aceita também DD/MM/AAAA e data-hora ISO); null se inválida. */
function dataIso(v) {
  const s = String(v ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const br = iso ? null : /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (!iso && !br) return null;
  const [a, m, d] = iso ? [iso[1], iso[2], iso[3]] : [br[3], br[2], br[1]];
  const dt = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
  const ok =
    dt.getUTCFullYear() === Number(a) &&
    dt.getUTCMonth() === Number(m) - 1 &&
    dt.getUTCDate() === Number(d);
  return ok ? `${a}-${m}-${d}` : null;
}

/** CPF (11) ou CNPJ (14) só com dígitos; senão null. */
function documentoDe(v) {
  const d = soDigitos(v);
  return d.length === 11 || d.length === 14 ? d : null;
}

function montarEndereco({ logradouro, numero: nro, complemento, bairro, cidade, uf, cep }) {
  const rua = [logradouro, nro].filter(Boolean).join(", ");
  const cepDig = soDigitos(cep);
  const cepFmt = cepDig.length === 8 ? `CEP ${cepDig.slice(0, 5)}-${cepDig.slice(5)}` : null;
  const local = [cidade, uf].filter(Boolean).join("/");
  const partes = [rua, complemento, bairro, local, cepFmt].filter(Boolean);
  return partes.length ? partes.join(" - ") : null;
}

const reais = (n) => `R$ ${n.toFixed(2).replace(".", ",")}`;

function documentoVazio() {
  return {
    origem: "xml",
    tipo: "outro",
    numero: null,
    chave: null,
    data_emissao: null,
    valor_total: null,
    emitente: { nome: null, documento: null, ie: null, endereco: null },
    destinatario: { nome: null, documento: null },
    vencimentos: [],
    forma_pagamento: null,
    descricao: null,
    itens: [],
    avisos: [],
    duvidosos: [],
  };
}

// ---------------------------------------------------------------------------
// NF-e / NFC-e
// ---------------------------------------------------------------------------

// tPag da NF-e → forma de pagamento da tela (demais códigos: sem forma)
const FORMA_POR_TPAG = {
  "01": "dinheiro",
  "03": "cartao",
  "04": "cartao",
  15: "boleto",
  16: "transferencia",
  17: "pix",
  18: "transferencia",
  20: "pix",
};

/** Forma do pagamento de maior valor que tenha correspondência (pag/detPag/tPag). */
function formaDePagamento(infNFe) {
  let melhor = null;
  for (const pag of filhos(infNFe, "pag")) {
    // 4.0: pag/detPag/tPag · 3.10: vários <pag> com tPag direto
    const dets = filhos(pag, "detPag").length ? filhos(pag, "detPag") : [pag];
    for (const det of dets) {
      const forma = FORMA_POR_TPAG[(txt(det, "tPag") || "").padStart(2, "0")];
      const v = valor(txt(det, "vPag")) ?? 0;
      if (forma && (!melhor || v > melhor.v)) melhor = { forma, v };
    }
  }
  return melhor ? melhor.forma : null;
}

function lerNfe(raiz, inf) {
  const ide = filho(inf, "ide");
  const emit = filho(inf, "emit");
  const dest = filho(inf, "dest");
  const ender = filho(emit, "enderEmit");
  const chave =
    [soDigitos(txt(busca(raiz, "infProt"), "chNFe")), soDigitos(inf.attrs.id)].find(
      (c) => c.length === 44
    ) || null;

  const vencimentos = filhos(filho(inf, "cobr"), "dup")
    .map((d) => ({
      numero: txt(d, "nDup"),
      data: dataIso(txt(d, "dVenc")),
      valor: valor(txt(d, "vDup")),
    }))
    .filter((d) => d.data && d.valor != null)
    .sort((a, b) => a.data.localeCompare(b.data));

  const itens = filhos(inf, "det")
    .map((det) => {
      const p = filho(det, "prod");
      return {
        descricao: txt(p, "xProd") || "",
        codigo: txt(p, "cProd"),
        ean: soDigitos(txt(p, "cEAN")) || null,
        ncm: txt(p, "NCM"),
        unidade: txt(p, "uCom"),
        quantidade: numero(txt(p, "qCom")),
        valor_unitario: numero(txt(p, "vUnCom")),
        valor_total: valor(txt(p, "vProd")),
      };
    })
    .filter((item) => item.descricao);

  const valorTotal = valor(txt(busca(inf, "ICMSTot"), "vNF"));

  const avisos = [];
  if (!busca(raiz, "protNFe")) {
    avisos.push("XML sem o protocolo de autorização da SEFAZ: confira se a nota foi autorizada.");
  }
  if (txt(ide, "tpAmb") === "2") {
    avisos.push("Nota emitida em ambiente de homologação (sem valor fiscal).");
  }
  if (vencimentos.length && valorTotal != null) {
    const soma = vencimentos.reduce((s, v) => s + v.valor, 0);
    if (Math.abs(soma - valorTotal) > 0.05) {
      avisos.push(
        `A soma das duplicatas (${reais(soma)}) é diferente do total da nota (${reais(valorTotal)}).`
      );
    }
  }

  return {
    ...documentoVazio(),
    tipo: txt(ide, "mod") === "65" ? "nfce" : "nfe",
    numero: txt(ide, "nNF"),
    chave,
    data_emissao: dataIso(txt(ide, "dhEmi") || txt(ide, "dEmi")),
    valor_total: valorTotal,
    emitente: {
      nome: txt(emit, "xNome"),
      documento: documentoDe(txt(emit, "CNPJ") || txt(emit, "CPF")),
      ie: txt(emit, "IE"),
      endereco: montarEndereco({
        logradouro: txt(ender, "xLgr"),
        numero: txt(ender, "nro"),
        complemento: txt(ender, "xCpl"),
        bairro: txt(ender, "xBairro"),
        cidade: txt(ender, "xMun"),
        uf: txt(ender, "UF"),
        cep: txt(ender, "CEP"),
      }),
    },
    destinatario: {
      nome: txt(dest, "xNome"),
      documento: documentoDe(txt(dest, "CNPJ") || txt(dest, "CPF")),
    },
    vencimentos,
    forma_pagamento: formaDePagamento(inf),
    descricao: txt(ide, "natOp"),
    itens,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// NFS-e
// ---------------------------------------------------------------------------

/** 1º valor não vazio de fn(el) entre os elementos. */
function primeiro(els, fn) {
  for (const el of els) {
    const v = fn(el);
    if (v) return v;
  }
  return null;
}

const cnpjOuCpf = (el) => documentoDe(txt(busca(el, "Cnpj")) || txt(busca(el, "Cpf")));

function lerNfseAbrasf(raiz, inf) {
  // 1.x: InfNfse/PrestadorServico (com IdentificacaoPrestador/Cnpj)
  // 2.x: o CNPJ fica em .../InfDeclaracaoPrestacaoServico/Prestador/CpfCnpj
  const prestadores = [busca(inf, "PrestadorServico"), busca(inf, "Prestador")].filter(Boolean);
  const tomadores = [busca(inf, "TomadorServico"), busca(inf, "Tomador")].filter(Boolean);
  const end = primeiro(prestadores, (p) => filho(p, "Endereco"));
  const comp = achar(raiz, "CompNfse") || raiz;
  const descricao = txt(busca(inf, "Discriminacao"));

  return {
    ...documentoVazio(),
    tipo: "nfse",
    numero: txt(inf, "Numero"),
    data_emissao: dataIso(txt(inf, "DataEmissao") || txt(busca(inf, "DataEmissao"))),
    valor_total: valor(txt(busca(inf, "ValorServicos"))),
    emitente: {
      nome: primeiro(prestadores, (p) => txt(p, "RazaoSocial")),
      documento: primeiro(prestadores, cnpjOuCpf),
      ie: null,
      endereco: end
        ? montarEndereco({
            logradouro: txt(end, "Endereco"),
            numero: txt(end, "Numero"),
            complemento: txt(end, "Complemento"),
            bairro: txt(end, "Bairro"),
            cidade: null,
            uf: txt(end, "Uf"),
            cep: txt(end, "Cep"),
          })
        : null,
    },
    destinatario: {
      nome: primeiro(tomadores, (t) => txt(t, "RazaoSocial")),
      documento: primeiro(tomadores, cnpjOuCpf),
    },
    descricao: descricao ? descricao.slice(0, 500) : null,
    avisos: busca(comp, "NfseCancelamento") ? ["Esta NFS-e consta como CANCELADA no XML."] : [],
  };
}

/** NFS-e do padrão nacional (NFSe/infNFSe, com a DPS dentro). */
function lerNfseNacional(inf) {
  const emit = filho(inf, "emit");
  const ender = filho(emit, "enderNac");
  const dps = busca(inf, "infDPS");
  const toma = filho(dps, "toma");
  const descricao = txt(busca(dps, "xDescServ"));

  return {
    ...documentoVazio(),
    tipo: "nfse",
    numero: txt(inf, "nNFSe"),
    data_emissao: dataIso(txt(dps, "dhEmi") || txt(inf, "dhProc")),
    valor_total: valor(txt(busca(dps, "vServPrest"), "vServ")),
    emitente: {
      nome: txt(emit, "xNome"),
      documento: documentoDe(txt(emit, "CNPJ") || txt(emit, "CPF")),
      ie: null,
      endereco: montarEndereco({
        logradouro: txt(ender, "xLgr"),
        numero: txt(ender, "nro"),
        complemento: txt(ender, "xCpl"),
        bairro: txt(ender, "xBairro"),
        cidade: null,
        uf: txt(ender, "UF"),
        cep: txt(ender, "CEP"),
      }),
    },
    destinatario: {
      nome: txt(toma, "xNome"),
      documento: documentoDe(txt(toma, "CNPJ") || txt(toma, "CPF")),
    },
    descricao: descricao ? descricao.slice(0, 500) : null,
  };
}

// ---------------------------------------------------------------------------

/**
 * Lê o texto de um XML fiscal e devolve o DocumentoFiscal (origem "xml"),
 * ou null se não for NF-e, NFC-e ou NFS-e legível.
 * @param {string} texto
 */
/**
 * Texto do arquivo XML respeitando o encoding do cabeçalho
 * (<?xml … encoding="ISO-8859-1"?>, comum em NFS-e de prefeituras). Sem cabeçalho
 * ou com encoding desconhecido, lê como UTF-8. `arquivo` é um File/Blob.
 */
export async function textoDoXml(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const cabeca = new TextDecoder("latin1").decode(bytes.slice(0, 200));
  const m = /encoding=["']([\w.:-]+)["']/i.exec(cabeca);
  const encoding = (m?.[1] || "utf-8").toLowerCase();
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export function lerXmlFiscal(texto) {
  if (typeof texto !== "string" || !texto.trim()) return null;
  try {
    const raiz = lerArvore(texto);
    const infNFe = achar(raiz, "infNFe");
    if (infNFe) return lerNfe(raiz, infNFe);
    const infNfse = achar(raiz, "InfNfse"); // também casa o infNFSe do padrão nacional
    if (infNfse) {
      return filho(infNfse, "nNFSe") ? lerNfseNacional(infNfse) : lerNfseAbrasf(raiz, infNfse);
    }
    return null;
  } catch {
    return null;
  }
}
