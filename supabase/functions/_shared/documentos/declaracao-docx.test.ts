// node --test supabase/functions/_shared/documentos/declaracao-docx.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { gerarDocxDeclaracao } from "./declaracao-docx.ts";
import { DADOS, PNG_1X1 } from "./testes/amostras.ts";

test("docx sem logo: três partes, texto escapado e o bloco de assinatura", async () => {
  const z = await JSZip.loadAsync(gerarDocxDeclaracao(DADOS), { checkCRC32: true });
  assert.deepEqual(Object.keys(z.files), [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
  ]);
  const doc = await z.file("word/document.xml")!.async("string");
  assert.ok(doc.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'));
  assert.ok(doc.includes("Empresa Teste Construções &amp; Serviços Ltda"));
  assert.ok(doc.includes("DECLARAÇÃO DE QUE NÃO EMPREGA MENOR"));
  assert.ok(doc.includes("Iluminação pública &lt;LED&gt;"));
  assert.ok(doc.includes("Cidade/MG, 13 de outubro de 2026."));
  assert.ok(doc.includes("CPF: 529.982.247-25"));
  assert.ok(doc.indexOf("Fulana de Tal") > doc.indexOf("________"));
  assert.ok(!doc.includes("<w:drawing>"));
  const tipos = await z.file("[Content_Types].xml")!.async("string");
  assert.ok(tipos.includes("wordprocessingml.document.main+xml"));
});

test("docx com logo: imagem em word/media, relação e extensão no content types", async () => {
  const z = await JSZip.loadAsync(
    gerarDocxDeclaracao(DADOS, { formato: "PNG", largura: 200, altura: 100, bytes: PNG_1X1 }),
    {
      checkCRC32: true,
    }
  );
  assert.deepEqual(Object.keys(z.files), [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/_rels/document.xml.rels",
    "word/media/logo.png",
  ]);
  const doc = await z.file("word/document.xml")!.async("string");
  // 200 x 100 px cabe em 50 x 18 mm pela altura: 36 mm x 18 mm = 1296000 x 648000 EMU
  assert.ok(doc.includes('<wp:extent cx="1296000" cy="648000"/>'));
  assert.ok((await z.file("[Content_Types].xml")!.async("string")).includes('Extension="png"'));
  assert.deepEqual(await z.file("word/media/logo.png")!.async("uint8array"), PNG_1X1);
});

test("docx: caractere de controle no texto não quebra o XML", async () => {
  const z = await JSZip.loadAsync(
    gerarDocxDeclaracao({ ...DADOS, paragrafos: ["a\u0001b\u000bc"] })
  );
  assert.ok((await z.file("word/document.xml")!.async("string")).includes(">abc<"));
});

test("docx: U+FFFE e U+FFFF (inválidos em XML 1.0, o Word recusa o arquivo) saem do texto", async () => {
  const z = await JSZip.loadAsync(
    gerarDocxDeclaracao({ ...DADOS, paragrafos: ["a\uFFFEb\uFFFFc"] })
  );
  assert.ok((await z.file("word/document.xml")!.async("string")).includes(">abc<"));
});

/** Caracteres que o XML 1.0 admite: \t, \n, \r, U+0020-U+D7FF, U+E000-U+FFFD e os astrais. */
const FORA_DO_XML_1_0 = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;
const REMOVIDOS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFE\uFFFF]/g;

test("docx: texto hostil não deixa caractere inválido no XML nem escapa do escape", async () => {
  const hostil =
    "A\u0000B\u0001C\u0008D\u000bE\u000cF\u001fG\uFFFEH\uFFFFI\uD800J\uDFFFK " +
    "</w:t></w:r></w:p><w:p> &amp; &lt; ]]> <![CDATA[x]]> \"aspas\" 'apóstrofo' \u{1F600}";
  const documentoXml = async (paragrafos: string[]) => {
    const z = await JSZip.loadAsync(gerarDocxDeclaracao({ ...DADOS, paragrafos }), {
      checkCRC32: true,
    });
    return z.file("word/document.xml")!.async("string");
  };
  const base = await documentoXml(["um", "dois", "três"]);
  const doc = await documentoXml([hostil, hostil, hostil]);
  const contar = (xml: string, padrao: RegExp) => xml.match(padrao)?.length ?? 0;

  // a estrutura é a mesma de um documento com texto comum: nada do texto virou marcação
  for (const padrao of [/<w:p>/g, /<w:r>/g, /<w:t /g, /<\/w:t>/g, /<\/w:p>/g, /<w:/g, /<\//g]) {
    assert.equal(contar(doc, padrao), contar(base, padrao), String(padrao));
  }
  // nenhum caractere fora do conjunto válido do XML 1.0
  assert.doesNotMatch(doc, FORA_DO_XML_1_0);
  // fora das tags, nenhum < ou > solto e todo & abre uma entidade
  const soTexto = doc.replace(/<[^<>]*>/g, "");
  assert.doesNotMatch(soTexto, /[<>]/);
  assert.doesNotMatch(soTexto, /&(?!(?:amp|lt|gt|quot);)/);
  // o texto volta igual depois de desfeito o escape; só os caracteres inválidos foram tirados
  // (o par solto de surrogates vira U+FFFD na codificação em UTF-8, que o XML admite)
  const esperado = hostil.replace(REMOVIDOS, "").toWellFormed();
  const trechos = [...doc.matchAll(/<w:t xml:space="preserve">([^<]*)<\/w:t>/g)].map((m) =>
    m[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
  );
  assert.equal(trechos.filter((t) => t === esperado).length, 3);
});

test("docx: o conjunto de caracteres válidos do XML 1.0 não perde nenhum caractere legítimo", async () => {
  const legitimo =
    "Tab\tLF\nCR\rEspaço \u007f\u0085\u00a0 \u00e7\u00e3 \uD7FF\uE000\uFFFD \u{1F600}";
  const z = await JSZip.loadAsync(gerarDocxDeclaracao({ ...DADOS, paragrafos: [legitimo] }));
  const doc = await z.file("word/document.xml")!.async("string");
  assert.doesNotMatch(doc, FORA_DO_XML_1_0);
  assert.ok(doc.includes(`>${legitimo}<`));
});

// ------------------------------------------------------------------ assinatura junto do fim do texto (keepNext)

/**
 * Confere que o XML está bem formado (tags que abrem e fecham em ordem, uma raiz só, atributos entre aspas,
 * nenhum < ou > solto no texto). Devolve o problema achado, ou null.
 */
function problemaDeXml(xml: string): string | null {
  const corpo = xml.replace(/^<\?xml[^?]*\?>/, "");
  const pilha: string[] = [];
  let posicao = 0;
  let raizes = 0;
  for (const m of corpo.matchAll(/<[^<>]*>/g)) {
    const entre = corpo.slice(posicao, m.index);
    if (/[<>]/.test(entre)) return "< ou > solto no texto";
    if (pilha.length === 0 && entre.trim() !== "") return "texto fora da raiz";
    posicao = (m.index ?? 0) + m[0].length;
    const fecha = /^<\/([^\s>]+)\s*>$/.exec(m[0]);
    if (fecha) {
      if (pilha.pop() !== fecha[1]) return `fechamento fora de ordem: ${m[0]}`;
      continue;
    }
    const abre = /^<([A-Za-z_][^\s/>]*)((?:\s+[^\s=/>]+="[^"<]*")*)\s*(\/?)>$/.exec(m[0]);
    if (!abre) return `tag mal formada: ${m[0].slice(0, 60)}`;
    if (pilha.length === 0) raizes++;
    if (!abre[3]) pilha.push(abre[1]);
  }
  if (/[<>]/.test(corpo.slice(posicao))) return "< ou > solto no fim";
  return pilha.length === 0 && raizes === 1 ? null : "tags abertas ou mais de uma raiz";
}

test("docx: o conferidor de XML dos testes enxerga o que está errado", () => {
  assert.equal(problemaDeXml('<?xml version="1.0"?><a x="1"><b/><c>t &amp; u</c></a>'), null);
  assert.notEqual(problemaDeXml("<a><b></a></b>"), null);
  assert.notEqual(problemaDeXml("<a><b></a>"), null);
  assert.notEqual(problemaDeXml("<a></a><a></a>"), null);
  assert.notEqual(problemaDeXml("<a>1 < 2</a>"), null);
  assert.notEqual(problemaDeXml("<a x=1></a>"), null);
});

/** Ordem dos filhos de <w:pPr> no esquema do WordprocessingML (só os que o gerador usa). */
const ORDEM_DO_PPR = ["keepNext", "pBdr", "spacing", "ind", "jc"];

/** Os parágrafos do document.xml: o texto (ainda escapado) e os filhos diretos do <w:pPr>, na ordem. */
function paragrafosDoXml(doc: string) {
  return [...doc.matchAll(/<w:p>(.*?)<\/w:p>/gs)].map((m) => {
    const ppr = /<w:pPr>(.*?)<\/w:pPr>/s.exec(m[1])?.[1] ?? "";
    // o conteúdo do <w:pBdr> não conta como filho do <w:pPr>
    const semBorda = ppr.replace(/<w:pBdr>.*?<\/w:pBdr>/gs, "<w:pBdr/>");
    const filhos = [...semBorda.matchAll(/<w:(\w+)/g)].map((x) => x[1]);
    const texto = [...m[1].matchAll(/<w:t [^>]*>([^<]*)<\/w:t>/g)].map((x) => x[1]).join("");
    return { texto, filhos, manter: filhos.includes("keepNext") };
  });
}

const TRACO = "________________________________________";
const EMPRESA_NA_ASSINATURA = "Empresa Teste Construções &amp; Serviços Ltda";
const ULTIMO_PARAGRAFO = "Por ser verdade, firma a presente.";
const LOCAL_E_DATA = "Cidade/MG, 13 de outubro de 2026.";

const VARIANTES_DE_ASSINATURA = [
  {
    nome: "completo",
    dados: DADOS,
    // o último parágrafo do texto, local e data, o traço e as linhas da assinatura menos a última (a empresa)
    mantidos: [
      ULTIMO_PARAGRAFO,
      LOCAL_E_DATA,
      TRACO,
      "Fulana de Tal",
      "Sócia-administradora",
      "CPF: 529.982.247-25",
    ],
  },
  {
    nome: "sem local e data",
    dados: { ...DADOS, localData: "" },
    mantidos: [
      ULTIMO_PARAGRAFO,
      TRACO,
      "Fulana de Tal",
      "Sócia-administradora",
      "CPF: 529.982.247-25",
    ],
  },
  {
    nome: "sem cargo e sem CPF",
    dados: { ...DADOS, representante: { nome: "Fulana de Tal", cargo: "", cpf: "" } },
    mantidos: [ULTIMO_PARAGRAFO, LOCAL_E_DATA, TRACO, "Fulana de Tal"],
  },
  {
    nome: "um parágrafo só",
    dados: { ...DADOS, paragrafos: ["Único parágrafo."] },
    mantidos: [
      "Único parágrafo.",
      LOCAL_E_DATA,
      TRACO,
      "Fulana de Tal",
      "Sócia-administradora",
      "CPF: 529.982.247-25",
    ],
  },
  {
    nome: "sem parágrafos",
    dados: { ...DADOS, paragrafos: [] },
    mantidos: [LOCAL_E_DATA, TRACO, "Fulana de Tal", "Sócia-administradora", "CPF: 529.982.247-25"],
  },
  {
    nome: "só a empresa na assinatura",
    dados: { ...DADOS, representante: { nome: "", cargo: "", cpf: "" } },
    mantidos: [ULTIMO_PARAGRAFO, LOCAL_E_DATA, TRACO],
  },
];

test("docx: o fim do texto, local e data, traço e assinatura (menos a última linha) levam keepNext", async () => {
  for (const comLogo of [false, true]) {
    for (const v of VARIANTES_DE_ASSINATURA) {
      const logo = comLogo
        ? { formato: "PNG" as const, largura: 200, altura: 100, bytes: PNG_1X1 }
        : null;
      const z = await JSZip.loadAsync(gerarDocxDeclaracao(v.dados, logo), { checkCRC32: true });
      const doc = await z.file("word/document.xml")!.async("string");
      const onde = `${v.nome}${comLogo ? " com logo" : ""}`;
      const paragrafos = paragrafosDoXml(doc);
      // exatamente estes parágrafos têm keepNext, na ordem do documento, e nenhum outro
      assert.deepEqual(
        paragrafos.filter((p) => p.manter).map((p) => p.texto),
        v.mantidos,
        onde
      );
      assert.equal(doc.match(/<w:keepNext\/>/g)?.length ?? 0, v.mantidos.length, onde);
      // a última linha da assinatura fecha o documento sem keepNext
      assert.equal(paragrafos[paragrafos.length - 1].manter, false, onde);
      // a ordem dos filhos do <w:pPr> segue o esquema: keepNext antes de pBdr, spacing, ind e jc
      for (const p of paragrafos) {
        const posicoes = p.filhos.map((f) => ORDEM_DO_PPR.indexOf(f));
        assert.ok(!posicoes.includes(-1), `${onde}: filho desconhecido em ${p.filhos.join(",")}`);
        assert.deepEqual(
          posicoes,
          [...posicoes].sort((a, b) => a - b),
          `${onde}: ${p.texto}`
        );
        if (p.manter) assert.equal(p.filhos[0], "keepNext", `${onde}: ${p.texto}`);
      }
      // um parágrafo longo não salta inteiro de página (sem keepLines); viúva e órfã ficam no padrão do Word
      assert.ok(!doc.includes("keepLines"), onde);
      assert.ok(!doc.includes("widowControl"), onde);
      // o XML segue bem formado
      assert.equal(problemaDeXml(doc), null, onde);
    }
  }
  const z = await JSZip.loadAsync(gerarDocxDeclaracao(DADOS));
  for (const nome of ["[Content_Types].xml", "_rels/.rels"]) {
    assert.equal(problemaDeXml(await z.file(nome)!.async("string")), null, nome);
  }
});

test("docx: a empresa é a última linha da assinatura, sem keepNext, e os filhos do pPr estão na ordem do esquema", async () => {
  const z = await JSZip.loadAsync(gerarDocxDeclaracao(DADOS));
  const paragrafos = paragrafosDoXml(await z.file("word/document.xml")!.async("string"));
  const ultimo = paragrafos[paragrafos.length - 1];
  assert.equal(ultimo.texto, EMPRESA_NA_ASSINATURA);
  assert.deepEqual(ultimo.filhos, ["spacing", "jc"]);
  const traco = paragrafos.find((p) => p.texto === TRACO)!;
  assert.deepEqual(traco.filhos, ["keepNext", "spacing", "jc"]);
  const localEData = paragrafos.find((p) => p.texto === LOCAL_E_DATA)!;
  assert.deepEqual(localEData.filhos, ["keepNext", "spacing", "jc"]);
  const fimDoTexto = paragrafos.find((p) => p.texto === ULTIMO_PARAGRAFO)!;
  assert.deepEqual(fimDoTexto.filhos, ["keepNext", "spacing", "ind", "jc"]);
  // o primeiro parágrafo do texto não leva keepNext (só o último)
  const inicioDoTexto = paragrafos.find((p) => p.texto.startsWith("A empresa DECLARA"))!;
  assert.deepEqual(inicioDoTexto.filhos, ["spacing", "ind", "jc"]);
  // a borda do papel timbrado (pBdr) vem antes de spacing, e não leva keepNext
  const timbrado = paragrafos.find((p) => p.filhos.includes("pBdr"))!;
  assert.deepEqual(timbrado.filhos, ["pBdr", "spacing", "jc"]);
});

test("docx com texto hostil e com texto comprido: keepNext só onde deve e XML bem formado", async () => {
  const hostil = 'A\u0000B</w:t></w:r></w:p><w:p> &amp; <![CDATA[x]]> "aspas"';
  for (const paragrafos of [[hostil, hostil, hostil], Array(40).fill("Texto. ".repeat(80))]) {
    const z = await JSZip.loadAsync(gerarDocxDeclaracao({ ...DADOS, paragrafos }));
    const doc = await z.file("word/document.xml")!.async("string");
    assert.equal(problemaDeXml(doc), null);
    // o último parágrafo do texto, local e data, traço e 3 linhas da assinatura
    assert.equal(paragrafosDoXml(doc).filter((p) => p.manter).length, 6);
    assert.equal(doc.match(/<w:keepNext\/>/g)?.length, 6);
  }
});
