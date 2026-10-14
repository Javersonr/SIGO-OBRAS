// node --test supabase/functions/_shared/documentos/declaracao-pdf.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import { gerarPdfDeclaracao } from "./declaracao-pdf.ts";
import type { DadosDeclaracao } from "./declaracoes.ts";
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

/** Linha de base do rodapé (297 - 9 mm). */
const Y_DO_RODAPE = 288;
/** Limite inferior do corpo (297 - 20 mm): é a constante que `cabe` usa; nenhuma linha do corpo passa dele. */
const LIMITE_DO_CORPO = 277;
/** Largura útil da página A4 com as margens da declaração (210 - 25 - 20 mm). */
const LARGURA_UTIL = 165;
/** Altura (mm) de uma linha do texto em 11 pt: 11 x 1,4 x 0,3528. */
const ALTURA_DA_LINHA_DO_TEXTO = 11 * 1.4 * 0.3528;
/** Espaço (mm) que o PDF deixa depois de cada parágrafo. */
const ESPACO_ENTRE_PARAGRAFOS = 3;

interface Chamada {
  texto: string;
  pagina: number;
  x: number;
  y: number;
  /** Largura (mm) do texto com a fonte e o tamanho vigentes na hora do desenho. */
  largura: number;
  /** Alinhamento pedido ao jsPDF ("justify" nas linhas esticadas). */
  alinhar?: string;
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
        alinhar: (opcoes as { align?: string } | undefined)?.align,
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

const noRodape = (c: Chamada) => Math.abs(c.y - Y_DO_RODAPE) < 0.01;
/** Tudo o que não é rodapé: o corpo não é escolhido pela posição, para uma linha fora do limite aparecer. */
const corpoDoTexto = (chamadas: Chamada[]) => chamadas.filter((c) => !noRodape(c));

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
  // sem local e data não há a palavra "Cidade" para achar o bloco: ele se acha pelo fim do texto e pelo traço
  { nome: "sem local e data", rep: DADOS.representante, extra: { localData: "" } },
];

/** Linha do texto de teste: uma palavra de 23 "W" (ocupa a linha inteira) ou o parágrafo curto "Fim.". */
const ehLinhaDoTexto = (c: Chamada) => c.texto.startsWith("WWWW") || c.texto === "Fim.";

/**
 * Gera a declaração com o espião e separa o que ela desenhou: as linhas do texto de teste, o bloco (tudo o que
 * vem depois da última linha do texto: local e data e as linhas da assinatura) e o traço da assinatura.
 */
function desenhar(dados: DadosDeclaracao) {
  const { libs, chamadas, tracos } = comEspiao();
  const doc = gerarPdfDeclaracao(dados, libs);
  const corpo = corpoDoTexto(chamadas);
  const texto = corpo.filter(ehLinhaDoTexto);
  const bloco = texto.length > 0 ? corpo.slice(corpo.lastIndexOf(texto[texto.length - 1]) + 1) : [];
  return { doc, corpo, texto, bloco, traco: tracos[tracos.length - 1] };
}

/** Páginas do documento que não têm nenhuma linha do corpo (texto ou bloco). */
function paginasEmBranco(doc: unknown, corpo: Chamada[]): number[] {
  const vazias: number[] = [];
  for (let p = 1; p <= paginas(doc); p++) if (!corpo.some((c) => c.pagina === p)) vazias.push(p);
  return vazias;
}

/**
 * Parágrafos curtos a mais depois do texto: cada um soma 3 mm de espaço, e com isso a última linha do
 * texto cai em fases diferentes de uma linha (5,4 mm). Com 0 o último parágrafo é o longo (duas linhas vão
 * com o bloco); com 1 e 3 o último parágrafo é "Fim." (uma linha só).
 */
const FASES = [0, 1, 3];

test("PDF da declaração: a assinatura nunca fica sozinha na página, em todo ponto de quebra", () => {
  const falhas: string[] = [];
  const casosComFalha = new Set<string>();
  const falhar = (onde: string, motivo: string) => {
    falhas.push(`${onde}: ${motivo}`);
    casosComFalha.add(onde);
  };
  const semEmpurrao: string[] = [];
  let casos = 0;
  for (const variante of REPRESENTANTES) {
    for (const extras of FASES) {
      // quantos casos desta combinação tiveram o fim do texto empurrado para a página do bloco só por causa dele
      let empurrados = 0;
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
        const { doc, corpo, texto, bloco, traco } = desenhar(dados);
        casos++;
        const onde = `${variante.nome}, ${extras} parágrafos a mais, ${linhas} linhas`;
        if (bloco.length < 2 || !traco) {
          falhar(onde, `bloco não encontrado`);
          continue;
        }
        // nada do texto se perdeu
        if (texto.length !== linhas + extras) {
          falhar(onde, `${texto.length} linhas de texto em vez de ${linhas + extras}`);
          continue;
        }
        // local e data (1 ou 2 linhas), o traço e as linhas da assinatura (nome, cargo, CPF, empresa)
        const paginasDoBloco = new Set([...bloco.map((c) => c.pagina), traco.pagina]);
        if (paginasDoBloco.size !== 1) {
          falhar(onde, `bloco em ${[...paginasDoBloco].join(" e ")}`);
          continue;
        }
        const paginaDoBloco = bloco[0].pagina;
        // a assinatura leva junto as duas últimas linhas do texto (uma, se o último parágrafo só tem uma)
        const n = Math.min(2, extras > 0 ? 1 : linhas);
        const ultimas = texto.slice(-n);
        const noBloco = texto.filter((c) => c.pagina === paginaDoBloco).length;
        if (noBloco < n)
          falhar(onde, `só ${noBloco} linha(s) do texto na página da assinatura (pede ${n})`);
        if (ultimas.some((c) => c.pagina !== paginaDoBloco))
          falhar(onde, `as ${n} últimas linhas do texto não estão na página da assinatura`);
        // nenhuma linha do corpo passa do limite inferior e nenhuma página fica em branco
        if (corpo.some((c) => c.y > LIMITE_DO_CORPO))
          falhar(onde, `linha abaixo de ${LIMITE_DO_CORPO} mm`);
        const vazias = paginasEmBranco(doc, corpo);
        if (vazias.length > 0) falhar(onde, `página(s) em branco: ${vazias.join(", ")}`);
        // o texto foi empurrado por causa do bloco: havia lugar para as n linhas, mas não para elas e o bloco
        const anterior = texto[texto.length - n - 1];
        const espaco = extras > 0 ? ESPACO_ENTRE_PARAGRAFOS : 0;
        if (
          anterior.pagina < ultimas[0].pagina &&
          anterior.y + (n + 1) * ALTURA_DA_LINHA_DO_TEXTO + espaco <= LIMITE_DO_CORPO
        )
          empurrados++;
      }
      // sem isso o teste não provaria nada: em cada combinação a regra empurrou o fim do texto de uma página para a seguinte
      if (empurrados === 0) semEmpurrao.push(`${variante.nome}, ${extras} parágrafos a mais`);
    }
  }
  assert.ok(casos >= 400, `${casos} casos`);
  assert.equal(
    casosComFalha.size,
    0,
    `${casosComFalha.size} de ${casos} casos deixam a assinatura sem o fim do texto: ${falhas.slice(0, 4).join("; ")}`
  );
  assert.deepEqual(semEmpurrao, [], "combinações em que o fim do texto nunca foi empurrado");
});

test("PDF da declaração: texto que termina junto ao fim da página leva as duas últimas linhas com o bloco", () => {
  const representantes = [
    DADOS.representante,
    { nome: NOME_LONGO, cargo: CARGO_LONGO, cpf: DADOS.representante.cpf },
  ];
  for (const representante of representantes) {
    const situacao = (linhas: number) => {
      const { doc, corpo, texto, bloco, traco } = desenhar({
        ...DADOS,
        paragrafos: [Array(linhas).fill(PALAVRA_DE_UMA_LINHA).join(" ")],
        representante,
      });
      return {
        paginas: paginas(doc),
        terceiraUltimaLinhaDoTextoEm: texto[texto.length - 3]?.pagina,
        penultimaLinhaDoTextoEm: texto[texto.length - 2]?.pagina,
        ultimaLinhaDoTextoEm: texto[texto.length - 1]?.pagina,
        localEDataEm: bloco[0].pagina,
        tracoEm: traco.pagina,
        ultimaLinhaDaAssinaturaEm: corpo[corpo.length - 1].pagina,
      };
    };
    // a maior quantidade de linhas de texto com que o documento inteiro ainda cabe em uma página
    let ultimaQueCabe = 0;
    for (let n = 1; n <= 60; n++) if (situacao(n).paginas === 1) ultimaQueCabe = n;
    assert.ok(ultimaQueCabe > 20, `ultimaQueCabe = ${ultimaQueCabe}`);
    assert.deepEqual(situacao(ultimaQueCabe), {
      paginas: 1,
      terceiraUltimaLinhaDoTextoEm: 1,
      penultimaLinhaDoTextoEm: 1,
      ultimaLinhaDoTextoEm: 1,
      localEDataEm: 1,
      tracoEm: 1,
      ultimaLinhaDaAssinaturaEm: 1,
    });
    // uma linha a mais: só as duas últimas linhas do texto passam para a página 2, junto com o bloco inteiro
    assert.deepEqual(situacao(ultimaQueCabe + 1), {
      paginas: 2,
      terceiraUltimaLinhaDoTextoEm: 1,
      penultimaLinhaDoTextoEm: 2,
      ultimaLinhaDoTextoEm: 2,
      localEDataEm: 2,
      tracoEm: 2,
      ultimaLinhaDaAssinaturaEm: 2,
    });
  }
});

test("PDF da declaração: último parágrafo de uma linha só vai com o bloco; de duas linhas, vai inteiro", () => {
  const longo = (linhas: number) => Array(linhas).fill(PALAVRA_DE_UMA_LINHA).join(" ");
  const variantes = [
    { nome: "uma linha", ultimo: "Fim.", linhasDoUltimo: 1 },
    { nome: "duas linhas", ultimo: longo(2), linhasDoUltimo: 2 },
  ];
  const falhas: string[] = [];
  let casos = 0;
  for (const { nome, ultimo, linhasDoUltimo } of variantes) {
    let empurrados = 0;
    for (let linhas = 14; linhas <= 60; linhas++) {
      const { doc, corpo, texto, bloco, traco } = desenhar({
        ...DADOS,
        paragrafos: [longo(linhas), ultimo],
      });
      casos++;
      const onde = `${nome}, ${linhas} linhas antes`;
      assert.equal(texto.length, linhas + linhasDoUltimo, onde);
      const paginaDoBloco = bloco[0].pagina;
      assert.equal(traco.pagina, paginaDoBloco, onde);
      // todas as linhas do último parágrafo estão na página do bloco
      if (texto.slice(-linhasDoUltimo).some((c) => c.pagina !== paginaDoBloco)) falhas.push(onde);
      assert.deepEqual(paginasEmBranco(doc, corpo), [], onde);
      if (texto[texto.length - linhasDoUltimo - 1].pagina < paginaDoBloco) empurrados++;
    }
    assert.ok(
      empurrados > 0,
      `${nome}: o último parágrafo nunca foi empurrado para a página da assinatura`
    );
  }
  assert.deepEqual(
    falhas,
    [],
    `${falhas.length} de ${casos} casos deixam o último parágrafo fora da página da assinatura`
  );
});

test("PDF da declaração: texto curto de um parágrafo só continua em uma página, com a assinatura", () => {
  const { doc, texto, bloco, traco } = desenhar({
    ...DADOS,
    paragrafos: ["Fim."],
  });
  assert.equal(paginas(doc), 1);
  assert.equal(texto.length, 1);
  assert.equal(bloco[0].pagina, 1);
  assert.equal(traco.pagina, 1);
  // sem texto nenhum (a lista de parágrafos vazia): só o bloco, em uma página
  const semTexto = comEspiao();
  const docSemTexto = gerarPdfDeclaracao({ ...DADOS, paragrafos: [] }, semTexto.libs);
  assert.equal(paginas(docSemTexto), 1);
  assert.deepEqual(paginasEmBranco(docSemTexto, corpoDoTexto(semTexto.chamadas)), []);
});

test("PDF da declaração: assinatura gigante (não cabe nem numa página vazia) termina e não perde texto", () => {
  const nome = Array(1500).fill("Fulano").join(" ");
  const cargo = Array(900).fill("Representante").join(" ");
  const dados = {
    ...DADOS,
    paragrafos: [Array(30).fill(PALAVRA_DE_UMA_LINHA).join(" "), "Fim."],
    representante: { nome, cargo, cpf: DADOS.representante.cpf },
  };
  const { libs, chamadas, tracos } = comEspiao();
  const doc = gerarPdfDeclaracao(dados, libs);
  const corpo = corpoDoTexto(chamadas);
  const texto = corpo.filter(ehLinhaDoTexto);
  // o bloco ocupa mais de uma página: o documento tem de ter várias, mas um número finito e pequeno
  assert.ok(paginas(doc) >= 3 && paginas(doc) <= 8, `${paginas(doc)} páginas`);
  assert.equal(texto.length, 31);
  assert.equal(tracos.length >= 1, true);
  assert.deepEqual(paginasEmBranco(doc, corpo), []);
  // nenhum texto se perde: o nome e o cargo saem inteiros, na ordem (a quebra de linha come os espaços)
  const depois = corpo.slice(corpo.lastIndexOf(texto[texto.length - 1]) + 1);
  const saida = depois
    .map((c) => c.texto)
    .join("")
    .replace(/ /g, "");
  assert.ok(saida.includes("Fulano".repeat(1500)), "o nome inteiro está na saída");
  assert.ok(saida.includes("Representante".repeat(900)), "o cargo inteiro está na saída");
});

// ------------------------------------------------------------------ parágrafo justificado, linha a linha

const FRASE =
  "A empresa declara, sob as penas da lei, que cumpre o exigido no edital e nos seus anexos. ";

test("PDF da declaração: a linha antes da quebra do último parágrafo continua justificada; a última, à esquerda", () => {
  let comQuebra = 0;
  // de 20 a 60 repetições da frase: o último parágrafo atravessa a quebra de página em várias posições
  for (let k = 20; k <= 60; k++) {
    const { libs, chamadas } = comEspiao();
    const doc = gerarPdfDeclaracao({ ...DADOS, paragrafos: [FRASE.repeat(k)] }, libs);
    const corpo = corpoDoTexto(chamadas);
    const inicio = corpo.findIndex((c) => c.texto.startsWith("A empresa"));
    const fim = corpo.findIndex((c) => c.texto.startsWith("Cidade"));
    const linhas = corpo.slice(inicio, fim);
    const onde = `${k} frases`;
    // todas justificadas, menos a última (que fica à esquerda), com a quebra de página onde estiver
    linhas
      .slice(0, -1)
      .forEach((c, i) => assert.equal(c.alinhar, "justify", `${onde}, linha ${i + 1}`));
    assert.notEqual(linhas[linhas.length - 1].alinhar, "justify", onde);
    // as duas últimas linhas do texto estão na página da assinatura (a do bloco)
    const bloco = corpo[fim];
    assert.deepEqual(
      linhas.slice(-2).map((c) => c.pagina),
      [bloco.pagina, bloco.pagina],
      onde
    );
    assert.deepEqual(paginasEmBranco(doc, corpo), [], onde);
    // a linha antes da quebra, na página anterior, é uma linha justificada (não a última do parágrafo)
    const quebra = linhas.findIndex((c, i) => i > 0 && c.pagina > linhas[i - 1].pagina);
    if (quebra > 0 && quebra >= linhas.length - 2 && linhas[quebra - 1].pagina < bloco.pagina) {
      comQuebra++;
      assert.equal(linhas[quebra - 1].alinhar, "justify", onde);
    }
  }
  assert.ok(comQuebra > 0, "nenhum caso empurrou o fim do parágrafo para a página da assinatura");
});

test("PDF da declaração: espaço no fim do parágrafo não vira linha em branco nem estica a última linha", () => {
  const marca = (chamadas: Chamada[]) =>
    corpoDoTexto(chamadas).map(
      (c) => `${c.pagina}|${c.y.toFixed(3)}|${c.alinhar ?? "-"}|${c.texto.trimEnd()}`
    );
  for (let k = 20; k <= 60; k += 3) {
    const aparado = comEspiao();
    gerarPdfDeclaracao({ ...DADOS, paragrafos: [FRASE.repeat(k).trimEnd()] }, aparado.libs);
    for (const sobra of [" ", "   "]) {
      const comEspaco = comEspiao();
      gerarPdfDeclaracao(
        { ...DADOS, paragrafos: [FRASE.repeat(k).trimEnd() + sobra] },
        comEspaco.libs
      );
      assert.deepEqual(
        marca(comEspaco.chamadas),
        marca(aparado.chamadas),
        `${k} frases, sobra de ${sobra.length}`
      );
    }
  }
});

test("PDF da declaração: palavra de 250 caracteres sem espaço não sobrepõe a linha seguinte", () => {
  const paragrafo = `Texto antes ${"x".repeat(250)} e texto depois da palavra longa, para fechar o parágrafo.`;
  const paragrafos = Array(24).fill(paragrafo); // atravessa a quebra de página
  const { libs, chamadas } = comEspiao();
  const doc = gerarPdfDeclaracao({ ...DADOS, paragrafos }, libs);
  assert.ok(paginas(doc) >= 2);
  const corpo = corpoDoTexto(chamadas);
  // nenhuma linha do corpo passa do limite inferior do corpo (a constante que o gerador usa em `cabe`)
  for (const c of corpo) assert.ok(c.y <= LIMITE_DO_CORPO, `y = ${c.y} na página ${c.pagina}`);
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
    // todo Tw positivo é desfeito (0 Tw) antes do próximo ET: o espaçamento não vaza para o texto seguinte
    for (const bt of bruto.split(/^ET$/m)) {
      const tw = [...bt.matchAll(/^(\d+(?:\.\d+)?) Tw$/gm)].map((m) => Number(m[1]));
      tw.forEach((valor, i) => {
        if (valor > 0) assert.equal(tw[i + 1], 0, `Tw ${valor} sem 0 Tw depois, antes do ET`);
      });
    }
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
    const rodape = chamadas.filter(noRodape);
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
  assert.ok(chamadas.some((c) => noRodape(c) && c.texto === DADOS.empresa.nome));
});
