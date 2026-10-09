// node --test supabase/functions/_shared/conector/envio-regras.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVISO_CONTEUDO,
  BUCKET_DO_ALVO,
  caminhoDoEnvio,
  CATEGORIAS_EDITAL,
  conferirObjeto,
  LIMITE_BYTES,
  MIME_DO_TIPO,
  montarBlocoTexto,
  PASTA_PROPOSTA,
  pastaParaGravarServidor,
  sanearNomeArquivo,
  situacaoDoLink,
  tipoPelosBytes,
  tipoPeloNome,
  validarPedidoLink,
  type ArquivoDoLink,
} from "./envio-regras.ts";

const OP = "00000000-0000-4000-8000-000000000010";
const AT = "00000000-0000-4000-8000-000000000020";
const E = "00000000-0000-4000-8000-000000000001";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const XLSX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);

test("constantes: buckets, limites, MIME, categorias e a pasta da proposta (travessão)", () => {
  assert.deepEqual(BUCKET_DO_ALVO, {
    oportunidade: "anexos-oportunidade",
    atestado: "certificados",
  });
  assert.deepEqual(LIMITE_BYTES, { oportunidade: 52428800, atestado: 26214400 });
  assert.equal(MIME_DO_TIPO.pdf, "application/pdf");
  assert.equal(
    MIME_DO_TIPO.xlsx,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  assert.deepEqual(
    [...CATEGORIAS_EDITAL],
    ["edital", "termo_referencia", "anexo_edital", "errata"]
  );
  assert.equal(PASTA_PROPOSTA, "Envelope 01 – Proposta");
});

test("validarPedidoLink: oportunidade com PDFs e um Excel na pasta da proposta", () => {
  const r = validarPedidoLink({
    alvo: "oportunidade",
    oportunidade_id: OP.toUpperCase(),
    arquivos: [
      { nome: "Edital.pdf", categoria: "edital" },
      { nome: " Proposta.xlsx ", pasta: "  Envelope 01 –   Proposta ", categoria: null },
    ],
  });
  assert.deepEqual(r, {
    ok: true,
    alvo: "oportunidade",
    alvoId: OP,
    arquivos: [
      { nome: "Edital.pdf", categoria: "edital", pasta: null, tipo: "pdf" },
      { nome: "Proposta.xlsx", categoria: null, pasta: "Envelope 01 – Proposta", tipo: "xlsx" },
    ],
  });
});

test("validarPedidoLink: recusas (sem id, 21 arquivos, .docx, atestado com 2, categoria, xlsx com categoria)", () => {
  const erros = (args: Record<string, unknown>) => {
    const r = validarPedidoLink(args);
    assert.equal(r.ok, false);
    return r.ok ? [] : r.erros;
  };
  assert.deepEqual(erros({ alvo: "obra", arquivos: [] }), [
    "alvo deve ser 'oportunidade' ou 'atestado'",
  ]);
  assert.deepEqual(erros({ alvo: "oportunidade", arquivos: [{ nome: "a.pdf" }] }), [
    "oportunidade_id é obrigatório (UUID) com alvo oportunidade",
  ]);
  const vinteEUm = Array.from({ length: 21 }, (_, i) => ({ nome: `a${i}.pdf` }));
  assert.deepEqual(erros({ alvo: "oportunidade", oportunidade_id: OP, arquivos: vinteEUm }), [
    "arquivos: no máximo 20 por link (vieram 21)",
  ]);
  assert.deepEqual(
    erros({ alvo: "oportunidade", oportunidade_id: OP, arquivos: [{ nome: "Proposta.docx" }] }),
    ["arquivos[0].nome: o arquivo deve terminar em .pdf ou .xlsx"]
  );
  assert.deepEqual(
    erros({
      alvo: "atestado",
      atestado_id: AT,
      arquivos: [{ nome: "cat.pdf" }, { nome: "cat2.pdf" }],
    }),
    ["atestado: envie exatamente 1 arquivo .pdf"]
  );
  assert.deepEqual(
    erros({ alvo: "atestado", atestado_id: AT, arquivos: [{ nome: "cat.pdf", pasta: "X" }] }),
    ["arquivos[0]: o PDF do atestado não leva categoria nem pasta"]
  );
  assert.deepEqual(
    erros({
      alvo: "oportunidade",
      oportunidade_id: OP,
      arquivos: [{ nome: "a.pdf", categoria: "contrato" }],
    }),
    ["arquivos[0].categoria: use edital, termo_referencia, anexo_edital, errata ou null"]
  );
  assert.deepEqual(
    erros({
      alvo: "oportunidade",
      oportunidade_id: OP,
      arquivos: [{ nome: "planilha.xlsx", categoria: "edital" }],
    }),
    ["arquivos[0].categoria: planilha .xlsx não leva categoria do edital"]
  );
  assert.deepEqual(
    erros({
      alvo: "oportunidade",
      oportunidade_id: OP,
      atestado_id: AT,
      arquivos: [{ nome: "a.pdf" }],
    }),
    ["atestado_id não vale com alvo oportunidade"]
  );
  assert.deepEqual(erros({ alvo: "atestado", atestado_id: AT, arquivos: [{ nome: "cat.xlsx" }] }), [
    "atestado: envie exatamente 1 arquivo .pdf",
  ]);
});

test("tipoPeloNome: .pdf e .xlsx sem caixa", () => {
  assert.equal(tipoPeloNome("A.PDF"), "pdf");
  assert.equal(tipoPeloNome("b.Xlsx"), "xlsx");
  assert.equal(tipoPeloNome("c.xls"), null);
  assert.equal(tipoPeloNome("pdf"), null);
});

test("sanearNomeArquivo: sem acento e símbolo, '_' colapsado, extensão mantida, até 120", () => {
  assert.equal(sanearNomeArquivo("Edital Nº 12/2026 (final).PDF"), "Edital_N_12_2026_final_.PDF");
  assert.equal(sanearNomeArquivo("Planilha Orçamentária.xlsx"), "Planilha_Orcamentaria.xlsx");
  assert.equal(sanearNomeArquivo("../../etc/passwd.pdf"), ".._.._etc_passwd.pdf");
  assert.equal(sanearNomeArquivo(".pdf"), "arquivo.pdf");
  const longo = sanearNomeArquivo(`${"a".repeat(300)}.pdf`);
  assert.equal(longo.length, 120);
  assert.ok(longo.endsWith("a.pdf"));
});

test("caminhoDoEnvio: empresa/aaaa/mm/uuid-nome, com o mês de Brasília na virada", () => {
  const u = "00000000-0000-4000-8000-0000000000ff";
  // 01/11 01:30 UTC ainda é 31/10 22:30 em Brasília
  assert.equal(
    caminhoDoEnvio(E, "Edital.pdf", new Date("2026-11-01T01:30:00Z"), u),
    `${E}/2026/10/${u}-Edital.pdf`
  );
  assert.equal(
    caminhoDoEnvio(E, "Edital.pdf", new Date("2026-11-01T03:30:00Z"), u),
    `${E}/2026/11/${u}-Edital.pdf`
  );
});

test("tipoPelosBytes: %PDF- e PK\\x03\\x04; o resto é null", () => {
  assert.equal(tipoPelosBytes(PDF), "pdf");
  assert.equal(tipoPelosBytes(XLSX), "xlsx");
  assert.equal(tipoPelosBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46])), null);
  assert.equal(tipoPelosBytes(new TextEncoder().encode("<html>")), null);
  assert.equal(tipoPelosBytes(null), null);
});

test("conferirObjeto: ok e os motivos ausente, vazio, grande_demais e tipo_errado", () => {
  const pdf: ArquivoDoLink = {
    indice: 1,
    nome: "a.pdf",
    tipo: "pdf",
    categoria: null,
    pasta: null,
    caminho: "x",
  };
  const xlsx: ArquivoDoLink = { ...pdf, nome: "b.xlsx", tipo: "xlsx" };
  const lim = 1000;
  assert.deepEqual(conferirObjeto(pdf, { existe: true, tamanho: 10, primeiros: PDF }, lim), {
    ok: true,
  });
  assert.deepEqual(conferirObjeto(xlsx, { existe: true, tamanho: 10, primeiros: XLSX }, lim), {
    ok: true,
  });
  assert.deepEqual(conferirObjeto(pdf, { existe: false, tamanho: null, primeiros: null }, lim), {
    ok: false,
    motivo: "ausente",
  });
  assert.deepEqual(conferirObjeto(pdf, { existe: true, tamanho: 0, primeiros: null }, lim), {
    ok: false,
    motivo: "vazio",
  });
  assert.deepEqual(conferirObjeto(pdf, { existe: true, tamanho: 1001, primeiros: PDF }, lim), {
    ok: false,
    motivo: "grande_demais",
  });
  assert.deepEqual(conferirObjeto(pdf, { existe: true, tamanho: 10, primeiros: XLSX }, lim), {
    ok: false,
    motivo: "tipo_errado",
  });
  assert.deepEqual(conferirObjeto(xlsx, { existe: true, tamanho: 10, primeiros: PDF }, lim), {
    ok: false,
    motivo: "tipo_errado",
  });
});

test("situacaoDoLink: usado, expirado e pendente", () => {
  const agora = new Date("2026-10-08T12:00:00Z");
  assert.equal(
    situacaoDoLink({ expira_em: "2026-10-08T13:00:00Z", usado_em: null }, agora),
    "pendente"
  );
  assert.equal(
    situacaoDoLink({ expira_em: "2026-10-08T12:00:00Z", usado_em: null }, agora),
    "expirado"
  );
  assert.equal(
    situacaoDoLink({ expira_em: "2026-10-08T13:00:00Z", usado_em: "2026-10-08T11:00:00Z" }, agora),
    "usado"
  );
});

test("pastaParaGravarServidor: os 4 casos do pastaParaGravar do front", () => {
  // Outros (qualquer grafia) ou vazio → null
  assert.equal(pastaParaGravarServidor("Outros", null), null);
  assert.equal(pastaParaGravarServidor("  outros ", null), null);
  assert.equal(pastaParaGravarServidor("", null), null);
  assert.equal(pastaParaGravarServidor(null, null), null);
  // as demais gravam o nome aparado
  assert.equal(
    pastaParaGravarServidor("  Envelope 02 – Habilitação ", null),
    "Envelope 02 – Habilitação"
  );
  assert.equal(pastaParaGravarServidor("Recurso   Administrativo", null), "Recurso Administrativo");
  // categoria do edital em Outros grava "Outros"
  assert.equal(pastaParaGravarServidor("Outros", "edital"), "Outros");
  assert.equal(pastaParaGravarServidor("Outros", "errata"), "Outros");
  assert.equal(pastaParaGravarServidor("Outros", "contrato"), null);
  // outra pasta com categoria do edital fica com a pasta
  assert.equal(pastaParaGravarServidor("Credenciamento", "edital"), "Credenciamento");
});

test("montarBlocoTexto: aviso, marcadores, escaneada e próxima página", () => {
  const b = montarBlocoTexto([
    { pagina: 3, texto: "Prazo da proposta: 20/10/2026.", escaneada: false },
    { pagina: 4, texto: "", escaneada: true },
  ]);
  assert.equal(
    b.texto,
    `${AVISO_CONTEUDO}\n=== PÁGINA 3 ===\nPrazo da proposta: 20/10/2026.\n=== PÁGINA 4 === [escaneada: sem texto legível]\n\n`
  );
  assert.deepEqual([b.de, b.ate, b.proxima_pagina, b.escaneadas], [3, 4, null, [4]]);
});

test("montarBlocoTexto: para antes do limite e diz a próxima página", () => {
  const paginas = [1, 2, 3].map((n) => ({ pagina: n, texto: "x".repeat(400), escaneada: false }));
  const b = montarBlocoTexto(paginas, 1000);
  assert.deepEqual([b.de, b.ate, b.proxima_pagina], [1, 2, 3]);
  assert.ok(b.texto.length <= 1000);
});

test("montarBlocoTexto: uma página maior que o limite sai cortada com ' […]'", () => {
  const b = montarBlocoTexto(
    [
      { pagina: 7, texto: "y".repeat(5000), escaneada: false },
      { pagina: 8, texto: "z", escaneada: false },
    ],
    1000
  );
  assert.deepEqual([b.de, b.ate, b.proxima_pagina], [7, 7, 8]);
  assert.ok(b.texto.endsWith(" […]\n"));
  assert.ok(b.texto.length <= 1000, String(b.texto.length));
  assert.ok(b.texto.startsWith(`${AVISO_CONTEUDO}\n=== PÁGINA 7 ===\n`));
});

test("montarBlocoTexto: sem páginas, só o aviso", () => {
  assert.deepEqual(montarBlocoTexto([]), {
    texto: `${AVISO_CONTEUDO}\n`,
    de: null,
    ate: null,
    proxima_pagina: null,
    escaneadas: [],
  });
});

test("validarPedidoLink: quebra de linha e caractere de controle no nome ou na pasta são recusados", () => {
  const erros = (arquivos: unknown[]) => {
    const r = validarPedidoLink({ alvo: "oportunidade", oportunidade_id: OP, arquivos });
    assert.equal(r.ok, false);
    return r.ok ? [] : r.erros;
  };
  const msgNome = "arquivos[0].nome: sem quebra de linha nem caractere de controle";
  assert.deepEqual(erros([{ nome: "a\nrm -rf ~.pdf" }]), [msgNome]);
  assert.deepEqual(erros([{ nome: "a\u0000.pdf" }]), [msgNome]);
  assert.deepEqual(erros([{ nome: "a.pdf", pasta: "Env\u001b[0m" }]), [
    "arquivos[0].pasta: sem caractere de controle",
  ]);
  // tabulação e espaços repetidos na pasta seguem virando um espaço só
  const ok = validarPedidoLink({
    alvo: "oportunidade",
    oportunidade_id: OP,
    arquivos: [{ nome: "a.pdf", pasta: "Credenciamento\t Geral" }],
  });
  assert.equal(ok.ok && ok.arquivos[0].pasta, "Credenciamento Geral");
});
