/**
 * Carga inicial da biblioteca de documentos de habilitação (acervo_documento): transforma o
 * inventário dos documentos em vigor (CSV) num PLANO — que arquivo vai para onde no bucket
 * "habilitacao", e o SQL que grava as linhas. Puro: não lê a pasta, não envia, não grava.
 * Quem escreve os comandos e o SQL em arquivo é tools/habilitacao/carga-inicial.mjs; quem roda é
 * o Javerson, com o OK dele (plano de 2026-10-09, decisão 19).
 *
 * Os nomes dos arquivos do inventário têm dado pessoal: nada daqui deve ser versionado com dados
 * reais, e o teste usa só um CSV sintético.
 */
import { IDS_TIPO_DOCUMENTO } from "./documentos-regras.ts";
import { sanearNomeArquivo } from "../conector/envio-regras.ts";

export interface LinhaInventario {
  subpasta: string;
  arquivo: string;
  tipo: string;
  emissao: string | null;
  validade: string | null;
}

export interface ItemCarga extends LinhaInventario {
  /** pastaBase + subpasta + arquivo, com "/" */
  caminhoLocal: string;
  /** "<empresaId>/<anoMes>/<uuid>-<nome saneado>": o objeto dentro do bucket */
  caminhoStorage: string;
  /** "habilitacao/<caminhoStorage>": o que vai em acervo_documento.arquivo_ref */
  ref: string;
  /** o nome do arquivo sem a extensão (CHECK da tabela: de 1 a 200 caracteres) */
  nome: string;
  mime: string;
}

const CABECALHO = "subpasta;arquivo;tipo;emissao;validade";
const BUCKET = "habilitacao";
const MAX_NOME = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Os tipos que o bucket aceita (0159: PDF, JPEG e PNG). Map, para "constructor" não passar. */
const MIME_POR_EXTENSAO = new Map<string, string>([
  ["pdf", "application/pdf"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
]);

/** Tira um par de aspas em volta do campo (CSV do Excel/PowerShell); `""` vira `"`. */
function desaspar(campo: string): string {
  const t = campo.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  return campo;
}

/** AAAA-MM-DD de verdade (o Postgres recusa 2026-02-30 e o ano 0). */
function dataIsoValida(texto: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ano < 1) return false;
  const d = new Date(0);
  d.setUTCFullYear(ano, mes - 1, dia);
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Lê o CSV do inventário (separado por ";", com ou sem BOM, CRLF ou LF). "Linha N" é a linha do
 * ARQUIVO (o cabeçalho é a 1), para o Javerson achar a linha no Excel. Só tem erro de formato:
 * o que o inventário traz de errado quanto ao conteúdo (tipo, extensão) vai para `ignorados`.
 */
export function lerInventario(csv: string): { linhas: LinhaInventario[]; erros: string[] } {
  const brutas = String(csv ?? "")
    .replace(/^﻿/, "")
    .split(/\r?\n/);
  const posCabecalho = brutas.findIndex((l) => l.trim() !== "");
  const cabecalho =
    posCabecalho < 0
      ? ""
      : brutas[posCabecalho]
          .split(";")
          .map((c) => desaspar(c).trim())
          .join(";");
  if (!cabecalho.startsWith(CABECALHO)) {
    return { linhas: [], erros: [`Cabeçalho inesperado: use ${CABECALHO}`] };
  }

  const linhas: LinhaInventario[] = [];
  const erros: string[] = [];
  for (let i = posCabecalho + 1; i < brutas.length; i++) {
    if (brutas[i].trim() === "") continue;
    const numero = i + 1;
    const campos = brutas[i].split(";").map(desaspar);
    const [subpasta = "", arquivo = "", tipo = ""] = campos;
    if (campos.length < 3 || arquivo.trim() === "" || tipo.trim() === "") {
      erros.push(`Linha ${numero}: faltam campos`);
      continue;
    }
    const emissao = (campos[3] ?? "").trim() || null;
    const validade = (campos[4] ?? "").trim() || null;
    if ((emissao && !dataIsoValida(emissao)) || (validade && !dataIsoValida(validade))) {
      erros.push(`Linha ${numero}: data inválida`);
      continue;
    }
    linhas.push({
      subpasta: subpasta.trim() === "" ? "." : subpasta,
      arquivo,
      tipo: tipo.trim(),
      emissao,
      validade,
    });
  }
  return { linhas, erros };
}

/** "Balanço.PDF" → { extensao: "pdf", base: "Balanço" }; sem extensão → extensao "". */
function dividirNome(arquivo: string): { extensao: string; base: string } {
  const m = /\.([^./\\]+)$/.exec(arquivo);
  if (!m) return { extensao: "", base: arquivo };
  return { extensao: m[1].toLowerCase(), base: arquivo.slice(0, arquivo.length - m[0].length) };
}

/** Sem espaço nas pontas e com no máximo 200 caracteres (do Postgres, não unidades UTF-16). */
function nomeDoDocumento(base: string): string {
  return Array.from(base.trim()).slice(0, MAX_NOME).join("").trim();
}

/**
 * Para cada linha do inventário, na ordem: confere a extensão (pdf, jpg, jpeg, png), o tipo (a
 * lista do CHECK da tabela) e o que o banco recusaria (nome vazio, validade antes da emissão,
 * subpasta que sai da pasta base); o que passa ganha o caminho local, o caminho no bucket e o
 * `ref`. O uuid só é sorteado para quem entra. `empresaId` vai para minúsculas: o CHECK de
 * `arquivo_ref` compara com `empresa_id::text`.
 */
export function planejarCarga(
  linhas: LinhaInventario[],
  p: { empresaId: string; pastaBase: string; anoMes: string; novoUuid: () => string }
): { itens: ItemCarga[]; ignorados: { arquivo: string; motivo: string }[] } {
  const empresa = p.empresaId.toLowerCase();
  const base = p.pastaBase.replace(/\\/g, "/").replace(/\/+$/, "");
  const itens: ItemCarga[] = [];
  const ignorados: { arquivo: string; motivo: string }[] = [];

  for (const l of linhas) {
    const recusar = (motivo: string) => void ignorados.push({ arquivo: l.arquivo, motivo });
    const { extensao, base: semExtensao } = dividirNome(l.arquivo);
    const mime = MIME_POR_EXTENSAO.get(extensao);
    if (!mime) {
      recusar("extensão não aceita (use pdf, jpg ou png)");
      continue;
    }
    if (!IDS_TIPO_DOCUMENTO.includes(l.tipo)) {
      recusar(`tipo fora da lista: ${l.tipo}`);
      continue;
    }
    const nome = nomeDoDocumento(semExtensao);
    if (!nome) {
      recusar("nome do arquivo vazio");
      continue;
    }
    if (l.emissao && l.validade && l.validade < l.emissao) {
      recusar("validade anterior à emissão");
      continue;
    }
    const pastas = l.subpasta
      .replace(/\\/g, "/")
      .split("/")
      .filter((s) => s !== "" && s !== ".");
    if (pastas.includes("..")) {
      recusar("subpasta fora da pasta base");
      continue;
    }

    const caminhoStorage = `${empresa}/${p.anoMes}/${p.novoUuid()}-${sanearNomeArquivo(l.arquivo)}`;
    itens.push({
      ...l,
      caminhoLocal: `${base}/${[...pastas, l.arquivo].join("/")}`,
      caminhoStorage,
      ref: `${BUCKET}/${caminhoStorage}`,
      nome,
      mime,
    });
  }
  return { itens, ignorados };
}

/** Texto SQL entre aspas simples, com `'` dobrado. */
function literal(texto: string): string {
  return `'${String(texto).replace(/'/g, "''")}'`;
}

/**
 * Data como `date 'AAAA-MM-DD'` ou nulo. O nulo da PRIMEIRA linha do `values` leva `::date`: sem
 * ele, se todas as linhas tivessem a coluna nula, o Postgres inferiria `text` e o INSERT falharia.
 */
function dataSql(data: string | null, primeira: boolean): string {
  if (data) return `date ${literal(data)}`;
  return primeira ? "null::date" : "null";
}

/** Etiqueta do `$etiqueta$ … $etiqueta$` que não aparece no texto (um nome com "$carga$" fecharia o bloco). */
function etiquetaLivre(texto: string): string {
  let etiqueta = "carga";
  while (texto.includes(`$${etiqueta}$`)) etiqueta += "_";
  return etiqueta;
}

/**
 * SQL da carga: uma transação, um bloco `do` com guardas (empresa existe, ref já gravada não se
 * repete, todo documento vivo tem o arquivo no bucket — se faltar, desfaz tudo). Para rodar com
 * `supabase db query --linked -f`, DEPOIS do envio dos arquivos. Sem itens, o SQL só avisa.
 */
export function sqlDaCarga(itens: ItemCarga[], empresaId: string): string {
  if (!UUID.test(empresaId)) throw new Error("empresaId inválido: esperado um UUID");
  if (itens.length === 0) {
    return [
      "begin;",
      "do $carga$",
      "begin",
      "  raise notice 'Nenhum documento na carga: nada foi gravado';",
      "end",
      "$carga$;",
      "commit;",
      "",
    ].join("\n");
  }

  const valores = itens
    .map((i, n) => {
      const colunas = [
        literal(i.tipo),
        literal(i.nome),
        literal(i.ref),
        dataSql(i.emissao, n === 0),
        dataSql(i.validade, n === 0),
      ];
      return `      (${colunas.join(", ")})`;
    })
    .join(",\n");
  const e = etiquetaLivre(valores);

  return [
    "begin;",
    `do $${e}$`,
    "declare",
    `  v_empresa uuid := ${literal(empresaId.toLowerCase())};`,
    "  v_antes int;",
    "  v_depois int;",
    "  v_sem_arquivo int;",
    "begin",
    "  if not exists (select 1 from public.empresa where id = v_empresa and deleted_at is null) then",
    "    raise exception 'Empresa não encontrada: nada foi gravado';",
    "  end if;",
    "  select count(*) into v_antes from public.acervo_documento where empresa_id = v_empresa and deleted_at is null;",
    "",
    "  insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, emissao, validade)",
    "  select v_empresa, x.tipo, x.nome, x.arquivo_ref, x.emissao, x.validade",
    "    from (values",
    valores,
    "    ) as x(tipo, nome, arquivo_ref, emissao, validade)",
    "   where not exists (select 1 from public.acervo_documento d where d.arquivo_ref = x.arquivo_ref);",
    "",
    "  -- todo documento gravado tem de ter o arquivo no bucket (envie os arquivos ANTES deste SQL)",
    "  select count(*) into v_sem_arquivo",
    "    from public.acervo_documento d",
    "   where d.empresa_id = v_empresa and d.deleted_at is null",
    "     and not exists (",
    "       select 1 from storage.objects o",
    "        where o.bucket_id = 'habilitacao' and 'habilitacao/' || o.name = d.arquivo_ref",
    "     );",
    "  if v_sem_arquivo > 0 then",
    "    raise exception '% documento(s) sem o arquivo no bucket habilitacao: nada foi gravado', v_sem_arquivo;",
    "  end if;",
    "",
    "  select count(*) into v_depois from public.acervo_documento where empresa_id = v_empresa and deleted_at is null;",
    "  raise notice 'Biblioteca: % antes, % depois (% novos)', v_antes, v_depois, v_depois - v_antes;",
    "end",
    `$${e}$;`,
    "commit;",
    "",
  ].join("\n");
}

/** Texto entre aspas duplas do bash: `\`, `"`, `$` e crase seriam interpretados, então levam `\`. */
function aspasBash(texto: string): string {
  return `"${texto.replace(/[\\"$`]/g, "\\$&")}"`;
}

/** Um `supabase storage cp` por arquivo (bucket habilitacao, pasta da empresa). Quem roda é o Javerson. */
export function comandosDeEnvio(itens: ItemCarga[]): string[] {
  return itens.map(
    (i) =>
      `npx supabase@2.118.0 storage cp ${aspasBash(i.caminhoLocal)} ${aspasBash(`ss:///${i.ref}`)} --experimental --linked --content-type ${i.mime}`
  );
}
