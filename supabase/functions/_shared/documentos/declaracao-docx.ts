/**
 * .docx da declaração de habilitação (spec 2026-10-09 §3): papel timbrado (logo opcional e dados da
 * empresa), título, destinatário e referência, os parágrafos justificados, local e data, e o bloco
 * de assinatura do representante legal. Sem biblioteca: um .docx é um ZIP com XML (zip-store.ts).
 * Puro.
 */
import { caixaDoLogo, linhasDaAssinatura, linhasDaEmpresa } from "./declaracao-comum.ts";
import type { LogoDocumento } from "./declaracao-comum.ts";
import type { DadosDeclaracao } from "./declaracoes.ts";
import { zipSemCompressao } from "./zip-store.ts";

// O contrato das próximas tasks importa o logo e a caixa daqui.
export { LOGO_ALTURA_MM, LOGO_LARGURA_MM } from "./declaracao-comum.ts";
export type { LogoDocumento } from "./declaracao-comum.ts";

const EMU_POR_MM = 36000;

/**
 * Texto para dentro de um elemento XML. Tira os caracteres que o XML 1.0 não admite (controles C0,
 * menos tab, LF e CR, e U+FFFE e U+FFFF): com eles o Word recusa o arquivo.
 */
const xml = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

interface Estilo {
  negrito?: boolean;
  tamanho?: number; // pontos
  alinhar?: "left" | "center" | "both" | "right";
  antes?: number; // vigésimos de ponto
  depois?: number;
  recuo?: boolean; // 1,25 cm na primeira linha
  borda?: boolean; // traço embaixo (fecha o papel timbrado)
  manter?: boolean; // keepNext: fica na mesma página que o parágrafo seguinte
}

function paragrafo(texto: string, e: Estilo = {}): string {
  const meiosPontos = Math.round((e.tamanho ?? 11) * 2);
  const ppr =
    `<w:pPr>` +
    // a ordem dos filhos de pPr é a do esquema: keepNext, pBdr, spacing, ind, jc
    (e.manter ? `<w:keepNext/>` : "") +
    (e.borda
      ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="808080"/></w:pBdr>`
      : "") +
    `<w:spacing w:before="${e.antes ?? 0}" w:after="${e.depois ?? 0}" w:line="276" w:lineRule="auto"/>` +
    (e.recuo ? `<w:ind w:firstLine="709"/>` : "") +
    `<w:jc w:val="${e.alinhar ?? "left"}"/></w:pPr>`;
  const rpr =
    `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${e.negrito ? "<w:b/>" : ""}` +
    `<w:sz w:val="${meiosPontos}"/><w:szCs w:val="${meiosPontos}"/></w:rPr>`;
  return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${xml(texto)}</w:t></w:r></w:p>`;
}

function imagem(logo: LogoDocumento): string {
  const { larguraMm, alturaMm } = caixaDoLogo(logo);
  const cx = Math.round(larguraMm * EMU_POR_MM);
  const cy = Math.round(alturaMm * EMU_POR_MM);
  return (
    `<w:p><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Logo"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="1" name="logo"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
}

const CABECALHO_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

export function gerarDocxDeclaracao(
  d: DadosDeclaracao,
  logo: LogoDocumento | null = null
): Uint8Array {
  const enc = new TextEncoder();
  const ext = logo?.formato === "JPEG" ? "jpeg" : "png";
  const corpo: string[] = [];
  if (logo) corpo.push(imagem(logo));
  const linhasEmpresa = linhasDaEmpresa(d);
  linhasEmpresa.forEach((t, i) =>
    corpo.push(
      paragrafo(t, {
        negrito: i === 0,
        tamanho: i === 0 ? 12 : 9,
        borda: i === linhasEmpresa.length - 1,
      })
    )
  );
  corpo.push(
    paragrafo(d.titulo.toUpperCase(), {
      negrito: true,
      tamanho: 13,
      alinhar: "center",
      antes: 480,
      depois: 360,
    })
  );
  if (d.destinatario) corpo.push(paragrafo(d.destinatario, { negrito: true, depois: 60 }));
  if (d.referencia) corpo.push(paragrafo(d.referencia, { depois: 240 }));
  // A assinatura nunca fica sozinha numa página: o último parágrafo do texto, local e data, o traço e
  // todas as linhas da assinatura, menos a última, levam "manter com o próximo" (keepNext). Sem keepLines
  // no texto: um parágrafo longo não salta inteiro de página; o controle de viúva e órfã, que o Word liga
  // por padrão, deixa pelo menos duas linhas do fim do texto junto da data e da assinatura.
  d.paragrafos.forEach((p, i) =>
    corpo.push(
      paragrafo(p, {
        alinhar: "both",
        depois: 160,
        recuo: true,
        manter: i === d.paragrafos.length - 1,
      })
    )
  );
  if (d.localData)
    corpo.push(paragrafo(`${d.localData}.`, { antes: 360, depois: 720, manter: true }));
  corpo.push(
    paragrafo("________________________________________", { alinhar: "center", manter: true })
  );
  const assinatura = linhasDaAssinatura(d);
  assinatura.forEach((t, i) =>
    corpo.push(
      paragrafo(t, {
        alinhar: "center",
        negrito: i === 0,
        tamanho: i === 0 ? 11 : 10,
        manter: i < assinatura.length - 1,
      })
    )
  );

  const documento =
    CABECALHO_XML +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<w:body>${corpo.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/>` +
    `</w:sectPr></w:body></w:document>`;
  const tipos =
    CABECALHO_XML +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    (logo ? `<Default Extension="${ext}" ContentType="image/${ext}"/>` : "") +
    `<Override PartName="/word/document.xml" ` +
    `ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels =
    CABECALHO_XML +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ` +
    `Target="word/document.xml"/></Relationships>`;
  const arquivos: { nome: string; dados: Uint8Array }[] = [
    { nome: "[Content_Types].xml", dados: enc.encode(tipos) },
    { nome: "_rels/.rels", dados: enc.encode(rels) },
    { nome: "word/document.xml", dados: enc.encode(documento) },
  ];
  if (logo) {
    arquivos.push({
      nome: "word/_rels/document.xml.rels",
      dados: enc.encode(
        CABECALHO_XML +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" ` +
          `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
          `Target="media/logo.${ext}"/></Relationships>`
      ),
    });
    arquivos.push({ nome: `word/media/logo.${ext}`, dados: logo.bytes });
  }
  return zipSemCompressao(arquivos);
}
