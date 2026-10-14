// node --test supabase/functions/_shared/documentos/declaracao-pdf.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import { gerarPdfDeclaracao } from "./declaracao-pdf.ts";
import { bytesDoPdf } from "./proposta-export.ts";
import { DADOS, PNG_1X1 } from "./testes/amostras.ts";

// deno-lint-ignore no-explicit-any
const paginas = (doc: unknown) => (doc as any).getNumberOfPages();

test("PDF da declaração: retrato A4, uma página, com e sem logo", () => {
  const doc = gerarPdfDeclaracao(DADOS, { jsPDF });
  const bytes = bytesDoPdf(doc);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.equal(paginas(doc), 1);
  // deno-lint-ignore no-explicit-any
  const pagina = (doc as any).internal.pageSize;
  assert.ok(pagina.getHeight() > pagina.getWidth());
  const comLogo = gerarPdfDeclaracao(
    DADOS,
    { jsPDF },
    { formato: "PNG", largura: 200, altura: 100, bytes: PNG_1X1 }
  );
  assert.ok(bytesDoPdf(comLogo).length > bytes.length);
});

test("PDF da declaração: texto de 20 mil caracteres quebra em várias páginas", () => {
  const frase =
    "A empresa declara, sob as penas da lei, que cumpre o exigido no edital e nos seus anexos. ";
  const longo = { ...DADOS, paragrafos: [frase.repeat(120), frase.repeat(100)] };
  const doc = gerarPdfDeclaracao(longo, { jsPDF });
  assert.ok(paginas(doc) >= 3);
  assert.equal(new TextDecoder().decode(bytesDoPdf(doc).slice(0, 5)), "%PDF-");
});

test("PDF da declaração: logo ilegível não derruba o documento", () => {
  const doc = gerarPdfDeclaracao(
    DADOS,
    { jsPDF },
    { formato: "PNG", largura: 10, altura: 10, bytes: new Uint8Array([1, 2, 3]) }
  );
  assert.equal(paginas(doc), 1);
});

// ------------------------------------------------------------------ jsPDF espião

/** Rodapé em 288 mm; o corpo do texto termina antes de 277 mm. */
const Y_DO_RODAPE = 280;
/** Largura útil da página A4 com as margens da declaração (210 - 25 - 20 mm). */
const LARGURA_UTIL = 165;

interface Chamada {
  texto: string;
  pagina: number;
  x: number;
  y: number;
  /** Largura (mm) do texto com a fonte e o tamanho vigentes na hora do desenho. */
  largura: number;
}

/**
 * jsPDF espião: cria o documento de verdade e anota cada doc.text (a página em que caiu, a posição e a
 * largura) e cada doc.line (a página), sem mudar nada do que é desenhado. Texto em lista (a linha
 * justificada) conta pela primeira linha.
 */
function comEspiao() {
  const chamadas: Chamada[] = [];
  const tracos: { pagina: number; y: number }[] = [];
  // deno-lint-ignore no-explicit-any
  function JsPdfEspiao(...args: any[]) {
    // deno-lint-ignore no-explicit-any
    const doc: any = new (jsPDF as any)(...args);
    const texto = doc.text.bind(doc);
    const linha = doc.line.bind(doc);
    doc.text = (t: string | string[], x: number, y: number, opcoes?: unknown) => {
      const primeira = Array.isArray(t) ? t[0] : t;
      chamadas.push({
        texto: primeira,
        pagina: doc.getCurrentPageInfo().pageNumber,
        x,
        y,
        largura: doc.getTextWidth(primeira),
      });
      return texto(t, x, y, opcoes);
    };
    doc.line = (x1: number, y1: number, x2: number, y2: number) => {
      tracos.push({ pagina: doc.getCurrentPageInfo().pageNumber, y: y1 });
      return linha(x1, y1, x2, y2);
    };
    return doc;
  }
  return { libs: { jsPDF: JsPdfEspiao }, chamadas, tracos };
}

const corpoDoTexto = (chamadas: Chamada[]) => chamadas.filter((c) => c.y < Y_DO_RODAPE);

// ------------------------------------------------------------------ bloco de assinatura

/** Cada palavra ocupa uma linha inteira (84 mm: duas, com o espaço, passam dos 165 mm da linha). */
const PALAVRA_DE_UMA_LINHA = "W".repeat(23);
const NOME_LONGO =
  "Fulana de Tal e Silva Albuquerque Cavalcanti de Souza Pereira Nascimento Oliveira Santos Lima Prado";
const CARGO_LONGO =
  "Sócia-administradora e representante legal para fins de licitação, com poderes para firmar declarações";
const LOCAL_DATA_LONGO =
  "Cidade de Exemplo, Estado de Minas Gerais, em sessão pública realizada no dia 13 de outubro de 2026";

const REPRESENTANTES = [
  { nome: "completo", rep: DADOS.representante, extra: {} },
  { nome: "sem cargo e sem CPF", rep: { nome: "Fulana de Tal", cargo: "", cpf: "" }, extra: {} },
  {
    nome: "nome e cargo que quebram em duas linhas",
    rep: { nome: NOME_LONGO, cargo: CARGO_LONGO, cpf: DADOS.representante.cpf },
    extra: {},
  },
  {
    nome: "empresa e local e data que quebram em duas linhas",
    rep: { nome: NOME_LONGO, cargo: "", cpf: DADOS.representante.cpf },
    extra: {
      empresa: { ...DADOS.empresa, nome: `${DADOS.empresa.nome} ${DADOS.empresa.nome}` },
      localData: LOCAL_DATA_LONGO,
    },
  },
];

/**
 * Parágrafos curtos a mais depois do texto: cada um soma 3 mm de espaço, e com isso a última linha do
 * texto cai em fases diferentes de uma linha (5,4 mm). Com 0, 1 e 3 a reserva de espaço antiga
 * (menor que o bloco) deixava o bloco partir mesmo com assinatura de uma linha só.
 */
const FASES = [0, 1, 3];

test("PDF da declaração: local e data, traço e assinatura ficam na mesma página em todo ponto de quebra", () => {
  const falhas: string[] = [];
  let casos = 0;
  for (const variante of REPRESENTANTES) {
    for (const extras of FASES) {
      let blocoNaPaginaSeguinte = 0;
      // de 14 a 90 linhas de texto: a quebra de página passa por todas as posições, na 1ª e na 2ª páginas
      for (let linhas = 14; linhas <= 90; linhas++) {
        const dados = {
          ...DADOS,
          ...variante.extra,
          paragrafos: [
            Array(linhas).fill(PALAVRA_DE_UMA_LINHA).join(" "),
            ...Array(extras).fill("Fim."),
          ],
          representante: variante.rep,
        };
        const { libs, chamadas, tracos } = comEspiao();
        gerarPdfDeclaracao(dados, libs);
        casos++;
        const onde = `${variante.nome}, ${extras} parágrafos a mais, ${linhas} linhas`;
        const corpo = corpoDoTexto(chamadas);
        const inicio = corpo.findIndex((c) => c.texto.startsWith("Cidade"));
        if (inicio < 1) {
          falhas.push(`${onde}: bloco não encontrado`);
          continue;
        }
        // local e data (1 ou 2 linhas), o traço e as linhas da assinatura (nome, cargo, CPF, empresa)
        const bloco = corpo.slice(inicio);
        const paginasDoBloco = new Set([
          ...bloco.map((c) => c.pagina),
          tracos[tracos.length - 1].pagina,
        ]);
        if (paginasDoBloco.size !== 1)
          falhas.push(`${onde}: bloco em ${[...paginasDoBloco].join(" e ")}`);
        if (bloco[0].pagina > corpo[inicio - 1].pagina) blocoNaPaginaSeguinte++;
      }
      // sem isso o teste não provaria nada: em cada combinação o bloco foi empurrado inteiro para a página seguinte
      assert.ok(
        blocoNaPaginaSeguinte > 0,
        `${variante.nome}, ${extras} parágrafos a mais: o bloco nunca passou para a página seguinte`
      );
    }
  }
  assert.ok(casos >= 400, `${casos} casos`);
  assert.equal(
    falhas.length,
    0,
    `${falhas.length} de ${casos} casos partem o bloco de assinatura: ${falhas.slice(0, 6).join("; ")}`
  );
});

test("PDF da declaração: texto que termina junto ao fim da página leva o bloco inteiro para a seguinte", () => {
  const representantes = [
    DADOS.representante,
    { nome: NOME_LONGO, cargo: CARGO_LONGO, cpf: DADOS.representante.cpf },
  ];
  for (const representante of representantes) {
    const situacao = (linhas: number) => {
      const { libs, chamadas, tracos } = comEspiao();
      const doc = gerarPdfDeclaracao(
        {
          ...DADOS,
          paragrafos: [Array(linhas).fill(PALAVRA_DE_UMA_LINHA).join(" ")],
          representante,
        },
        libs
      );
      const corpo = corpoDoTexto(chamadas);
      const inicio = corpo.findIndex((c) => c.texto.startsWith("Cidade"));
      return {
        paginas: paginas(doc),
        ultimaLinhaDoTextoEm: corpo[inicio - 1].pagina,
        localEDataEm: corpo[inicio].pagina,
        tracoEm: tracos[tracos.length - 1].pagina,
        ultimaLinhaDaAssinaturaEm: corpo[corpo.length - 1].pagina,
      };
    };
    // a maior quantidade de linhas de texto com que o documento inteiro ainda cabe em uma página
    let ultimaQueCabe = 0;
    for (let n = 1; n <= 60; n++) if (situacao(n).paginas === 1) ultimaQueCabe = n;
    assert.ok(ultimaQueCabe > 20, `ultimaQueCabe = ${ultimaQueCabe}`);
    assert.deepEqual(situacao(ultimaQueCabe), {
      paginas: 1,
      ultimaLinhaDoTextoEm: 1,
      localEDataEm: 1,
      tracoEm: 1,
      ultimaLinhaDaAssinaturaEm: 1,
    });
    // uma linha a mais: o texto continua na página 1 e o bloco inteiro (com o traço) vai para a 2
    assert.deepEqual(situacao(ultimaQueCabe + 1), {
      paginas: 2,
      ultimaLinhaDoTextoEm: 1,
      localEDataEm: 2,
      tracoEm: 2,
      ultimaLinhaDaAssinaturaEm: 2,
    });
  }
});

// ------------------------------------------------------------------ parágrafo justificado, linha a linha

const FRASE =
  "A empresa declara, sob as penas da lei, que cumpre o exigido no edital e nos seus anexos. ";

test("PDF da declaração: palavra de 250 caracteres sem espaço não sobrepõe a linha seguinte", () => {
  const paragrafo = `Texto antes ${"x".repeat(250)} e texto depois da palavra longa, para fechar o parágrafo.`;
  const paragrafos = Array(24).fill(paragrafo); // atravessa a quebra de página
  const { libs, chamadas } = comEspiao();
  const doc = gerarPdfDeclaracao({ ...DADOS, paragrafos }, libs);
  assert.ok(paginas(doc) >= 2);
  const corpo = corpoDoTexto(chamadas);
  // cada doc.text desenha UMA linha, que cabe na largura útil: nenhum bloco que o jsPDF quebre de novo
  for (const c of corpo) {
    assert.ok(
      c.largura <= LARGURA_UTIL + 0.01,
      `${c.largura.toFixed(1)} mm: ${c.texto.slice(0, 40)}`
    );
  }
  // em cada página, o y só cresce, de uma linha de texto (a menor tem 4,2 mm) ou mais
  for (let p = 1; p <= paginas(doc); p++) {
    const ys = corpo.filter((c) => c.pagina === p).map((c) => c.y);
    assert.ok(ys.length > 10, `página ${p}`);
    ys.slice(1).forEach((y, i) => assert.ok(y - ys[i] >= 4.19, `página ${p}: y ${ys[i]} e ${y}`));
  }
  // nada se perde nem se repete: os caracteres do texto, na ordem (a quebra da palavra longa não leva espaço)
  const inicio = corpo.findIndex((c) => c.texto.startsWith("Texto antes"));
  const fim = corpo.findIndex((c) => c.texto.startsWith("Cidade"));
  assert.equal(
    corpo
      .slice(inicio, fim)
      .map((c) => c.texto)
      .join("")
      .replace(/ /g, ""),
    paragrafos.join("").replace(/ /g, "")
  );
});

test("PDF da declaração: linhas do parágrafo justificadas (menos a última), sem NaN nem Infinity no conteúdo", () => {
  const palavraLonga = "y".repeat(250);
  for (const texto of [
    FRASE.repeat(12), // texto comum
    `${FRASE.repeat(3)}${palavraLonga} ${FRASE.repeat(3)}`, // palavra que ocupa linhas inteiras no meio
    `${palavraLonga} ${FRASE.repeat(2)}`, // palavra longa no começo
  ]) {
    const { libs, chamadas } = comEspiao();
    const doc = gerarPdfDeclaracao({ ...DADOS, paragrafos: [texto] }, libs);
    const corpo = corpoDoTexto(chamadas);
    const inicio = corpo.findIndex(
      (c) => c.texto.startsWith("A empresa") || c.texto.startsWith("yyy")
    );
    const fim = corpo.findIndex((c) => c.texto.startsWith("Cidade"));
    const linhas = corpo.slice(inicio, fim);
    const bruto = new TextDecoder("latin1").decode(bytesDoPdf(doc));
    // palavra solta em uma linha não tem espaço para esticar: a divisão por zero dava "Infinity Tw"
    assert.doesNotMatch(bruto, /NaN|Infinity/);
    // espaçamento entre palavras (Tw) maior que zero só nas linhas não finais que têm mais de uma palavra
    const justificadas = [...bruto.matchAll(/^(\d+(?:\.\d+)?) Tw$/gm)].filter(
      (m) => Number(m[1]) > 0
    );
    const esperadas = linhas.slice(0, -1).filter((c) => c.texto.trim().includes(" "));
    assert.ok(esperadas.length > 0);
    assert.equal(justificadas.length, esperadas.length);
  }
});

// ------------------------------------------------------------------ rodapé

test("PDF da declaração: nome de empresa muito longo é cortado no rodapé e não encosta em 'Página X de Y'", () => {
  for (const nome of ["Empresa de Engenharia ".repeat(10).trim(), "X".repeat(200)]) {
    assert.equal(nome.length >= 200, true);
    const { libs, chamadas } = comEspiao();
    const doc = gerarPdfDeclaracao(
      { ...DADOS, empresa: { ...DADOS.empresa, nome }, paragrafos: [FRASE.repeat(60)] },
      libs
    );
    assert.ok(paginas(doc) >= 2);
    const rodape = chamadas.filter((c) => c.y >= Y_DO_RODAPE);
    const nomes = rodape.filter((c) => !c.texto.startsWith("Página "));
    const numeros = rodape.filter((c) => c.texto.startsWith("Página "));
    assert.equal(nomes.length, paginas(doc));
    assert.equal(numeros.length, paginas(doc));
    nomes.forEach((n, i) => {
      assert.ok(
        n.texto.length > 10 && n.texto.length < nome.length,
        `${n.texto.length} caracteres`
      );
      assert.ok(nome.startsWith(n.texto.trimEnd()), "o rodapé é o começo do nome");
      assert.ok(n.largura <= LARGURA_UTIL - 35 + 0.01, `${n.largura.toFixed(1)} mm`);
      // "Página X de Y" é alinhado à direita em x; o nome começa em n.x e termina antes dele
      assert.ok(n.x + n.largura < numeros[i].x - numeros[i].largura, `página ${i + 1}`);
    });
  }
  // nome curto: sai inteiro
  const { libs, chamadas } = comEspiao();
  gerarPdfDeclaracao(DADOS, libs);
  assert.ok(chamadas.some((c) => c.y >= Y_DO_RODAPE && c.texto === DADOS.empresa.nome));
});
