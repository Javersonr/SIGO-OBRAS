/**
 * PDF do RECIBO QUITADO: os dados congelados do recibo + a evidência da
 * quitação eletrônica (quando, IP, aparelho, código, hash). Gerado no servidor
 * quando o fornecedor confirma, salvo no Storage e anexado à despesa.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { linkMapa, textoLocalizacao } from "./localizacao.ts";

export const BUCKET_RECIBOS = "comprovantes";

export interface ReciboRow {
  id: string;
  empresa_id: string;
  transacao_id: string;
  codigo: string;
  hash_sha256: string;
  dados: any;
  status: string;
  confirmada_em: string | null;
  evidencia: any;
  pdf_ref?: string | null;
}

// ------------------------------------------------------------------ formatos
const fmtMoeda = (v: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const fmtData = (d: unknown) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const fmtDataHoraBR = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(iso))
    : "—";
function fmtDoc(doc: unknown): string {
  const d = String(doc ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return String(doc ?? "");
}

// ------------------------------------------------------ valor por extenso
const UNID = [
  "",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZ = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const CEM = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function ate999(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100),
    r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CEM[c]);
  if (r)
    partes.push(
      r < 20 ? UNID[r] : [DEZ[Math.floor(r / 10)], UNID[r % 10]].filter(Boolean).join(" e ")
    );
  return partes.join(" e ");
}

const ESCALAS: Array<[string, string]> = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
];

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const grupos: Array<{ g: number; escala: number }> = [];
  for (let escala = 0; n > 0 && escala < ESCALAS.length; escala++) {
    grupos.unshift({ g: n % 1000, escala });
    n = Math.floor(n / 1000);
  }
  const partes = grupos
    .filter((p) => p.g)
    .map((p) => ({
      ...p,
      texto:
        p.escala === 1 && p.g === 1
          ? "mil"
          : [ate999(p.g), ESCALAS[p.escala][p.g === 1 ? 0 : 1]].filter(Boolean).join(" "),
    }));
  // "dois mil e quinhentos", "mil e cem", "dois mil quinhentos e trinta":
  // "e" antes do último grupo só quando ele é < 100 ou centena redonda
  return partes
    .map((p, i) => {
      if (i === 0) return p.texto;
      const ultimo = i === partes.length - 1;
      return (ultimo && (p.g < 100 || p.g % 100 === 0) ? " e " : " ") + p.texto;
    })
    .join("");
}

export function valorPorExtenso(valor: number): string {
  const centavosTotais = Math.round((Number(valor) || 0) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const cent = centavosTotais % 100;
  const partes: string[] = [];
  if (reais) {
    const milhao = reais % 1_000_000 === 0 && reais >= 1_000_000;
    partes.push(
      `${inteiroPorExtenso(reais)}${milhao ? " de" : ""} ${reais === 1 ? "real" : "reais"}`
    );
  }
  if (cent) partes.push(`${inteiroPorExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero reais";
}

// --------------------------------------------------------- texto p/ o PDF
// Fontes padrão do PDF só têm WinAnsi (Latin-1 + alguns símbolos): o resto
// vira "?" em vez de derrubar a geração.
const EXTRAS_WINANSI = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
function winAnsi(s: unknown): string {
  return Array.from(String(s ?? "").normalize("NFC"))
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      if (ch === "\n") return " ";
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRAS_WINANSI.includes(ch))
        return ch;
      return "?";
    })
    .join("");
}

function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of winAnsi(texto).split(/\s+/).filter(Boolean)) {
    const teste = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(teste, tamanho) <= largura) {
      atual = teste;
      continue;
    }
    if (atual) linhas.push(atual);
    // palavra maior que a linha (hash, user-agent): corta no meio
    let resto = palavra;
    while (fonte.widthOfTextAtSize(resto, tamanho) > largura) {
      let n = resto.length;
      while (n > 1 && fonte.widthOfTextAtSize(resto.slice(0, n), tamanho) > largura) n--;
      linhas.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    atual = resto;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Aparelho legível a partir do user-agent (o bruto também vai no PDF). */
function aparelho(ua: string | null | undefined): string {
  const u = String(ua || "");
  if (!u) return "—";
  const so = /iPhone OS ([\d_]+)/.exec(u)?.[1]
    ? `iPhone · iOS ${/iPhone OS ([\d_]+)/.exec(u)![1].replace(/_/g, ".")}`
    : /iPad/.test(u)
      ? "iPad"
      : /Android ([\d.]+)/.exec(u)
        ? `Android ${/Android ([\d.]+)/.exec(u)![1]}`
        : /Windows NT/.test(u)
          ? "Windows"
          : /Mac OS X/.test(u)
            ? "macOS"
            : "";
  const nav = /EdgA?\//.test(u)
    ? "Edge"
    : /SamsungBrowser/.test(u)
      ? "Samsung Internet"
      : /CriOS|Chrome\//.test(u)
        ? "Chrome"
        : /FxiOS|Firefox\//.test(u)
          ? "Firefox"
          : /Safari\//.test(u)
            ? "Safari"
            : "";
  return [so, nav].filter(Boolean).join(" · ") || "navegador";
}

// ------------------------------------------------------------------- PDF
export async function gerarPdfReciboQuitado(r: ReciboRow): Promise<Uint8Array> {
  const d = r.dados || {};
  const pag = d.pagamento || {};
  const ev = r.evidencia || {};

  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(`Recibo quitado ${r.codigo}`));
  pdf.setAuthor(winAnsi(d.empresa?.nome || "SIGO Obras"));
  pdf.setCreator("SIGO Obras");
  pdf.setProducer("SIGO Obras");
  pdf.setSubject("Recibo de pagamento com quitação eletrônica");
  const page: PDFPage = pdf.addPage([595.28, 841.89]); // A4
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const neg = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const M = 50;
  const L = 595.28 - 2 * M;
  const escuro = rgb(0.12, 0.16, 0.22);
  const cinza = rgb(0.4, 0.45, 0.52);
  const verde = rgb(0.02, 0.47, 0.34);
  let y = 841.89 - M;

  const texto = (t: string, x: number, yy: number, f: PDFFont, s: number, cor = escuro) =>
    page.drawText(winAnsi(t), { x, y: yy, size: s, font: f, color: cor });
  const paragrafo = (t: string, f: PDFFont, s: number, cor = escuro, recuo = 0, entre = 3) => {
    for (const linha of quebrar(t, f, s, L - recuo)) {
      texto(linha, M + recuo, y, f, s, cor);
      y -= s + entre;
    }
  };
  const linhaH = (yy: number, cor = rgb(0.85, 0.87, 0.9)) =>
    page.drawLine({ start: { x: M, y: yy }, end: { x: M + L, y: yy }, thickness: 0.8, color: cor });

  // Cabeçalho
  texto("RECIBO DE PAGAMENTO", M, y - 4, neg, 20);
  const cod = `Nº ${r.codigo}`;
  texto(cod, M + L - neg.widthOfTextAtSize(winAnsi(cod), 11), y, neg, 11);
  y -= 24;
  texto("com quitação eletrônica do favorecido", M, y, reg, 11, cinza);
  y -= 14;
  linhaH(y);
  y -= 26;

  // Valor
  texto("VALOR", M, y, neg, 9, cinza);
  y -= 22;
  texto(fmtMoeda(pag.valor), M, y, neg, 22, verde);
  y -= 16;
  paragrafo(`(${valorPorExtenso(Number(pag.valor))})`, reg, 10, cinza);
  y -= 12;

  // Dados
  const campos: Array<[string, string]> = [
    [
      "Pagador",
      [d.empresa?.nome, d.empresa?.cnpj ? `CNPJ ${fmtDoc(d.empresa.cnpj)}` : ""]
        .filter(Boolean)
        .join(" · "),
    ],
    [
      "Favorecido",
      [d.fornecedor?.nome, d.fornecedor?.cnpj ? `CPF/CNPJ ${fmtDoc(d.fornecedor.cnpj)}` : ""]
        .filter(Boolean)
        .join(" · "),
    ],
    ["Referente a", pag.descricao || "—"],
    ["Data do pagamento", fmtData(pag.data_pagamento)],
  ];
  if (pag.forma_pagamento) campos.push(["Forma de pagamento", String(pag.forma_pagamento)]);
  if (pag.numero_documento) campos.push(["Documento", String(pag.numero_documento)]);
  if (pag.projeto) campos.push(["Obra/Projeto", String(pag.projeto)]);
  for (const [rotulo, valor] of campos) {
    texto(rotulo, M, y, neg, 10, cinza);
    const linhas = quebrar(valor, reg, 10.5, L - 130);
    linhas.forEach((ln, i) => texto(ln, M + 130, y - i * 14, reg, 10.5));
    y -= Math.max(1, linhas.length) * 14 + 4;
  }
  y -= 6;
  linhaH(y);
  y -= 22;

  // Declaração (o que o favorecido efetivamente fez na página do recibo)
  paragrafo(
    `${d.fornecedor?.nome || "O favorecido"} confirmou eletronicamente o recebimento de ` +
      `${fmtMoeda(pag.valor)} pagos por ${d.empresa?.nome || "a empresa pagadora"}, referente a ` +
      `${pag.descricao || "pagamento"}, ao acionar "Confirmo o recebimento (dou quitação)" no ` +
      `link individual deste recibo, dando quitação quanto a este valor.`,
    reg,
    11,
    escuro,
    0,
    4
  );
  y -= 16;

  // Evidência da quitação — mede antes para desenhar a caixa POR BAIXO do
  // texto (no PDF, o que é desenhado depois cobre o anterior)
  const evid: Array<[string, string, PDFFont?]> = [
    [
      "Confirmado em",
      `${fmtDataHoraBR(r.confirmada_em || ev.confirmado_em)} (horário de Brasília)`,
    ],
    ["Meio", "link individual deste recibo (token assinado), emitido pela empresa pagadora"],
    ["IP de origem", ev.ip || "—"],
    ["Aparelho", aparelho(ev.dispositivo)],
    ["Localização", textoLocalizacao(ev.localizacao)],
    ...(linkMapa(ev.localizacao)
      ? ([["Mapa", linkMapa(ev.localizacao) as string, mono]] as Array<[string, string, PDFFont?]>)
      : []),
    ["User-agent", ev.dispositivo || "—", mono],
    ["Código do recibo", r.codigo, mono],
    ["Hash SHA-256", r.hash_sha256, mono],
    [
      "Emitido por",
      [d.emitido_por, d.emitido_em ? fmtDataHoraBR(d.emitido_em) : ""]
        .filter(Boolean)
        .join(" em ") || "—",
    ],
  ];
  const itens = evid.map(([rotulo, valor, fonte]) => {
    const f = fonte || reg;
    const s = fonte === mono ? 8 : 9.5;
    const linhas = quebrar(String(valor), f, s, L - 24 - 110);
    return { rotulo, f, s, linhas, altura: Math.max(1, linhas.length) * (s + 3) + 5 };
  });
  const alturaCaixa = 20 + 18 + itens.reduce((soma, i) => soma + i.altura, 0) + 4;
  page.drawRectangle({
    x: M,
    y: y - alturaCaixa,
    width: L,
    height: alturaCaixa,
    borderColor: rgb(0.43, 0.8, 0.65),
    borderWidth: 1,
    color: rgb(0.94, 0.99, 0.96),
  });
  const fundoCaixa = y - alturaCaixa;
  y -= 20;
  texto("QUITAÇÃO ELETRÔNICA CONFIRMADA", M + 12, y, neg, 11, verde);
  y -= 18;
  for (const it of itens) {
    texto(it.rotulo, M + 12, y, neg, 9, cinza);
    it.linhas.forEach((ln, i) => texto(ln, M + 12 + 110, y - i * (it.s + 3), it.f, it.s));
    y -= it.altura;
  }
  y = fundoCaixa - 18;

  paragrafo(
    "Assinatura eletrônica simples (art. 4º, I, da Lei 14.063/2020 e art. 10, § 2º, da MP 2.200-2/2001). " +
      "Quitação nos termos dos arts. 319 e 320 do Código Civil. O registro eletrônico desta confirmação " +
      "(data e hora, IP, aparelho, localização informada pelo aparelho quando autorizada e hash do conteúdo) " +
      "é gravado pelo sistema e não pode ser editado pelos usuários.",
    reg,
    8.5,
    cinza,
    0,
    2.5
  );

  texto(
    `Gerado pelo SIGO Obras em ${fmtDataHoraBR(new Date().toISOString())}`,
    M,
    M - 10,
    reg,
    8,
    cinza
  );
  return await pdf.save();
}

/**
 * Garante o PDF quitado no Storage + anexo na despesa (idempotente).
 * Devolve a referência "bucket/caminho".
 */
export async function garantirPdfQuitado(supabase: SupabaseClient, r: ReciboRow): Promise<string> {
  if (r.status !== "confirmada") throw new Error("Recibo ainda não quitado");
  const caminho = `${r.empresa_id}/recibos/recibo-quitado-${r.codigo}.pdf`;
  const ref = `${BUCKET_RECIBOS}/${caminho}`;

  if (r.pdf_ref !== ref) {
    const bytes = await gerarPdfReciboQuitado(r);
    const { error: upErr } = await supabase.storage
      .from(BUCKET_RECIBOS)
      .upload(caminho, new Blob([bytes], { type: "application/pdf" }), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) throw new Error("Falha ao salvar o PDF: " + upErr.message);
    await supabase.from("recibo_pagamento").update({ pdf_ref: ref }).eq("id", r.id);
  }

  const { data: jaAnexado } = await supabase
    .from("transacao_anexo")
    .select("id")
    .eq("transacao_id", r.transacao_id)
    .eq("url", ref)
    .is("deleted_at", null)
    .limit(1);
  if (!jaAnexado?.length) {
    // índice único (0107) impede anexo duplicado em gerações simultâneas
    const { error: axErr } = await supabase.from("transacao_anexo").insert({
      empresa_id: r.empresa_id,
      transacao_id: r.transacao_id,
      nome: `Recibo quitado ${r.codigo}.pdf`,
      url: ref,
      tipo: "application/pdf",
    });
    if (axErr && axErr.code !== "23505") throw new Error("Falha ao anexar o PDF: " + axErr.message);
  }
  return ref;
}
