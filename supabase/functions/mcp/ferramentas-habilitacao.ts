/**
 * Ferramentas do conector do Claude: habilitação da licitação montada pelo SERVIDOR (spec
 * 2026-10-09 §4). O Claude manda só ids; o SIGO copia os documentos válidos da biblioteca
 * (acervo_documento) e os PDFs de CAT/atestado (acervo_atestado.arquivo_ref) para a pasta
 * "Envelope 02 – Habilitação" da oportunidade, sem ninguém enviar arquivo.
 *
 * Tudo pela CamadaEmpresa (empresa da chave). Origem e destino das cópias ficam na pasta da
 * empresa; nenhuma ref vem da entrada. A saída traz nome, tipo, validade e situação, nunca o conteúdo.
 */
import type { PromptDef } from "../_shared/mcp/protocolo.ts";
import {
  baixarObjeto,
  BUCKET_ACERVO,
  BUCKET_HABILITACAO,
  caminhoDaEmpresa,
  ErroArquivo,
  gravarNaOportunidade,
  nomeParaExibir,
  PASTA_HABILITACAO,
  registrarNoHistorico,
  TIPOS_DOCUMENTO_BIBLIOTECA,
  tipoPelosBytesServidor,
} from "../_shared/conector/arquivo-servidor.ts";
import { uuidOuNull } from "../_shared/conector/entrada.ts";
import { linkOportunidade } from "../_shared/conector/recurso.ts";
import { hojeBR } from "../_shared/edital/acervo.ts";
import {
  IDS_TIPO_DOCUMENTO,
  rotuloDoTipo,
  situacaoDaValidade,
  TIPOS_ESSENCIAIS,
  tipoDocumento,
  type DocumentoBiblioteca,
} from "../_shared/habilitacao/documentos-regras.ts";
import { falha, naoEncontrado, sucesso, type DepsFerramenta, type Ferramenta } from "./registro.ts";

export const MAX_DOCUMENTOS_POR_CHAMADA = 60;
export const MAX_ATESTADOS_POR_CHAMADA = 40;
const MAX_TIPOS = 20;

const ID_OPORTUNIDADE = { type: "string", description: "UUID da oportunidade" };
const GRAVACAO = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const nomeDoUsuario = (deps: DepsFerramenta) => `${deps.ctx.usuario.nome} (via Claude)`;
const fmtDataBR = (iso: string) => iso.split("-").reverse().join("/");

/** Tem ao menos um caractere que se vê (nem espaço, nem controle, nem caractere de formato invisível). */
const temTextoVisivel = (v: unknown): v is string =>
  typeof v === "string" && /[^\s\p{Cc}\p{Cf}]/u.test(v);

/** edital_analise vem como objeto (ou jsonb-string, do legado). */
function analiseDe(v: unknown): Record<string, unknown> | null {
  let x = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return null;
    }
  }
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/** Data da sessão do edital gravado, se ainda não passou ("AAAA-MM-DD" ou null). */
export function sessaoFutura(
  analise: Record<string, unknown> | null,
  hojeISO: string
): string | null {
  // deno-lint-ignore no-explicit-any
  const data = (analise as any)?.extraido?.datas?.sessao?.data;
  return typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data) && data > hojeISO
    ? data
    : null;
}

type CopiaFeita =
  | { situacao: "copiado"; arquivoId: string; nome: string; substituiu: boolean }
  | { situacao: "mantido_assinado" }
  | { situacao: "falha"; motivo: string }
  | { situacao: "sem_oportunidade" };

/**
 * Copia um arquivo do Storage da empresa (biblioteca ou acervo) para a pasta do envelope da oportunidade.
 * A ref vem do banco, nunca da entrada do Claude: mesmo assim confere bucket e pasta da empresa antes de
 * baixar. Falha DO ARQUIVO (fora da empresa, sumiu, vazio, grande demais, tipo) vira `falha` e quem chama
 * segue com o próximo; qualquer outro erro (banco, Storage fora do ar) sobe e a chamada inteira falha (repetir
 * é seguro: a `origem` troca o arquivo no lugar).
 */
async function copiarParaEnvelope(
  deps: DepsFerramenta,
  p: {
    oportunidadeId: string;
    bucket: string;
    ref: unknown;
    origem: string;
    /** O nome (sem sanear) a partir da extensão do tipo que os bytes provaram. */
    nomeCom: (extensao: string) => string;
  }
): Promise<CopiaFeita> {
  const caminho = caminhoDaEmpresa(p.ref, p.bucket, deps.db.empresaId);
  if (!caminho) return { situacao: "falha", motivo: "arquivo_fora_da_empresa" };
  try {
    const bytes = await baixarObjeto(deps.storage, p.bucket, caminho);
    const tipo = tipoPelosBytesServidor(bytes.subarray(0, 8), caminho, TIPOS_DOCUMENTO_BIBLIOTECA);
    if (!tipo) return { situacao: "falha", motivo: "tipo_nao_aceito" };
    const nome = nomeParaExibir(p.nomeCom(tipo));
    const g = await gravarNaOportunidade(
      { db: deps.db, storage: deps.storage, agora: deps.agora },
      {
        oportunidadeId: p.oportunidadeId,
        origem: p.origem,
        nome,
        bytes,
        tipo,
        pasta: PASTA_HABILITACAO,
        categoria: null,
        assinatura: null,
        usuarioNome: nomeDoUsuario(deps),
      }
    );
    if (!g) return { situacao: "sem_oportunidade" };
    // não é para acontecer (cópia nunca é gravada com assinatura), mas se a versão assinada ficou, a
    // saída não afirma que anexou
    if (g.mantido_assinado) return { situacao: "mantido_assinado" };
    return { situacao: "copiado", arquivoId: g.arquivo_id, nome, substituiu: g.substituiu };
  } catch (e) {
    if (e instanceof ErroArquivo) return { situacao: "falha", motivo: e.codigo };
    throw e;
  }
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ─── anexar_habilitacao ─────────────────────────────────────────────────────────────────────

/** `tipos` opcional: lista de 1 a 20 ids da tabela de tipos, sem repetir (mantém a ordem do pedido). */
function lerTipos(
  v: unknown
): { ok: true; tipos: string[] | null } | { ok: false; erros: string[] } {
  if (v === undefined || v === null) return { ok: true, tipos: null };
  if (!Array.isArray(v))
    return { ok: false, erros: ["tipos deve ser uma lista de tipos de documento."] };
  if (v.length === 0) {
    return { ok: false, erros: ["tipos está vazio: informe ao menos um tipo ou omita o campo."] };
  }
  if (v.length > MAX_TIPOS) {
    return { ok: false, erros: [`tipos aceita no máximo ${MAX_TIPOS} itens.`] };
  }
  const erros: string[] = [];
  v.forEach((t, i) => {
    if (typeof t !== "string" || !IDS_TIPO_DOCUMENTO.includes(t)) {
      erros.push(`tipos[${i}]: "${String(t).slice(0, 40)}" não é um tipo de documento válido.`);
    }
  });
  return erros.length ? { ok: false, erros } : { ok: true, tipos: [...new Set(v as string[])] };
}

const posicaoDoTipo = (tipo: string) => {
  const i = IDS_TIPO_DOCUMENTO.indexOf(tipo);
  return i < 0 ? IDS_TIPO_DOCUMENTO.length : i;
};

/** "<rótulo> - <nome>"; em "outro" só o nome; nome sem caractere visível: só o rótulo do tipo. */
function nomeBaseDoDocumento(d: DocumentoBiblioteca): string {
  const rotulo = rotuloDoTipo(d.tipo);
  if (!temTextoVisivel(d.nome)) return rotulo;
  return tipoDocumento(d.tipo)?.id === "outro" ? d.nome : `${rotulo} - ${d.nome}`;
}

const ANEXAR_HABILITACAO: Ferramenta = {
  def: {
    name: "anexar_habilitacao",
    title: "Anexar a habilitação da empresa à oportunidade",
    description:
      'Copia para a pasta "Envelope 02 – Habilitação" da oportunidade os documentos VÁLIDOS da biblioteca de habilitação da empresa (certidões, contrato social, balanço…), sem ninguém enviar arquivo. Sem tipos, anexa todos os documentos em vigor. Documento vencido não é anexado: volta em vencidos; o que a empresa não tem volta em faltam. Repetir a chamada troca os arquivos no lugar, sem duplicar.',
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        oportunidade_id: ID_OPORTUNIDADE,
        tipos: {
          type: "array",
          minItems: 1,
          maxItems: MAX_TIPOS,
          description: "só estes tipos de documento (omita para anexar todos os em vigor)",
          items: { type: "string", enum: [...IDS_TIPO_DOCUMENTO] },
        },
      },
      required: ["oportunidade_id"],
    },
    annotations: GRAVACAO,
  },
  async executar(args, deps) {
    const id = uuidOuNull(args.oportunidade_id);
    const pedido = lerTipos(args.tipos);
    if (!pedido.ok) {
      return falha(
        "tipos inválidos.",
        "validacao",
        { erros: pedido.erros, tipos_validos: [...IDS_TIPO_DOCUMENTO] },
        id
      );
    }
    const tipos = pedido.tipos;
    const op = id
      ? await deps.db.porId<{ id: string; edital_analise: unknown }>(
          "oportunidade",
          id,
          "id, edital_analise"
        )
      : null;
    if (!id || !op) return naoEncontrado("oportunidade", id);

    const todos = await deps.db.lerTodos<DocumentoBiblioteca>(
      "acervo_documento",
      "id, tipo, nome, arquivo_ref, numero, validade, ativo",
      (q) => q.eq("ativo", true)
    );
    const docs = todos
      .filter((d) => !tipos || tipos.includes(d.tipo))
      .sort(
        (a, b) =>
          posicaoDoTipo(a.tipo) - posicaoDoTipo(b.tipo) ||
          String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR") ||
          String(a.id).localeCompare(String(b.id))
      );

    const hoje = hojeBR(deps.agora);
    const sessao = sessaoFutura(analiseDe(op.edital_analise), hoje);
    const vencidos: DocumentoBiblioteca[] = [];
    const validos: DocumentoBiblioteca[] = [];
    for (const d of docs) {
      (situacaoDaValidade(d.validade, hoje).situacao === "vencido" ? vencidos : validos).push(d);
    }
    if (validos.length > MAX_DOCUMENTOS_POR_CHAMADA) {
      return falha(
        `São ${validos.length} documentos válidos; o limite é ${MAX_DOCUMENTOS_POR_CHAMADA} por chamada. Informe tipos.`,
        "muitos_documentos",
        { total: validos.length, limite: MAX_DOCUMENTOS_POR_CHAMADA },
        id
      );
    }

    const anexados: Record<string, unknown>[] = [];
    const falhas: Record<string, unknown>[] = [];
    let mantidosAssinados = 0;
    for (const d of validos) {
      const r = await copiarParaEnvelope(deps, {
        oportunidadeId: id,
        bucket: BUCKET_HABILITACAO,
        ref: d.arquivo_ref,
        origem: `biblioteca:${d.id}`,
        nomeCom: (ext) => `${nomeBaseDoDocumento(d)}.${ext}`,
      });
      if (r.situacao === "sem_oportunidade") return naoEncontrado("oportunidade", id);
      if (r.situacao === "falha") {
        falhas.push({ documento_id: d.id, nome: d.nome, motivo: r.motivo });
      } else if (r.situacao === "mantido_assinado") {
        mantidosAssinados++;
        falhas.push({ documento_id: d.id, nome: d.nome, motivo: "mantido_assinado" });
      } else {
        anexados.push({
          documento_id: d.id,
          tipo: d.tipo,
          rotulo: rotuloDoTipo(d.tipo),
          nome: r.nome,
          validade: d.validade ?? null,
          arquivo_id: r.arquivoId,
          substituiu: r.substituiu,
          vence_antes_da_sessao: !!sessao && !!d.validade && d.validade < sessao,
        });
      }
    }

    // o que a empresa não tem nenhum em vigor (nem válido nem vencido: o vencido já aparece em `vencidos`)
    const comDocumento = new Set(docs.map((d) => d.tipo));
    const faltam = (tipos ?? TIPOS_ESSENCIAIS)
      .filter((t) => !comDocumento.has(t))
      .map((t) => ({ tipo: t, rotulo: rotuloDoTipo(t) }));

    const avisos: string[] = [];
    const antesDaSessao = anexados.filter((a) => a.vence_antes_da_sessao).length;
    if (antesDaSessao && sessao) {
      avisos.push(
        `${plural(antesDaSessao, "documento vence", "documentos vencem")} antes da sessão (${fmtDataBR(sessao)}): renove e anexe de novo.`
      );
    }
    if (vencidos.length) {
      avisos.push(
        `${vencidos.length === 1 ? "1 documento vencido não foi anexado" : `${vencidos.length} documentos vencidos não foram anexados`}: atualize em Acervo técnico → Documentos e certidões.`
      );
    }
    if (mantidosAssinados) {
      avisos.push(
        `${mantidosAssinados === 1 ? "1 documento já tem uma versão assinada na oportunidade e foi mantido" : `${mantidosAssinados} documentos já têm uma versão assinada na oportunidade e foram mantidos`}, sem troca.`
      );
    }

    if (anexados.length > 0) {
      await registrarNoHistorico(
        deps.db,
        id,
        nomeDoUsuario(deps),
        `Habilitação anexada pelo Claude: ${anexados.length} documento(s) da biblioteca`
      );
    }
    return sucesso(
      {
        oportunidade_id: id,
        pasta: PASTA_HABILITACAO,
        anexados,
        vencidos: vencidos.map((d) => ({
          documento_id: d.id,
          tipo: d.tipo,
          rotulo: rotuloDoTipo(d.tipo),
          nome: d.nome,
          validade: d.validade ?? null,
        })),
        faltam,
        falhas,
        avisos,
        link: linkOportunidade(id),
      },
      { alvo: id }
    );
  },
};

// ─── anexar_acervo ──────────────────────────────────────────────────────────────────────────

const ROTULO_ACERVO: Record<string, string> = {
  cat: "CAT",
  atestado: "Atestado",
  cao: "CAO",
  cat_profissional: "CAT profissional",
};

interface AtestadoLido {
  id: string;
  tipo: string | null;
  numero: string | null;
  contratante: string | null;
  arquivo_ref: string | null;
}

/** `atestado_ids` opcional: lista de 1 a 40 UUIDs (sem repetir, na ordem do pedido). */
function lerAtestadoIds(
  v: unknown
): { ok: true; ids: string[] | null } | { ok: false; erros: string[] } {
  if (v === undefined || v === null) return { ok: true, ids: null };
  if (!Array.isArray(v)) return { ok: false, erros: ["atestado_ids deve ser uma lista de UUIDs."] };
  if (v.length === 0) {
    return {
      ok: false,
      erros: ["atestado_ids está vazio: informe ao menos um id ou omita o campo."],
    };
  }
  if (v.length > MAX_ATESTADOS_POR_CHAMADA) {
    return {
      ok: false,
      erros: [`atestado_ids aceita no máximo ${MAX_ATESTADOS_POR_CHAMADA} itens.`],
    };
  }
  const ids: string[] = [];
  const erros: string[] = [];
  v.forEach((x, i) => {
    const uuid = uuidOuNull(x);
    if (!uuid) erros.push(`atestado_ids[${i}] não é um UUID válido.`);
    else if (!ids.includes(uuid)) ids.push(uuid);
  });
  return erros.length ? { ok: false, erros } : { ok: true, ids };
}

/** O primeiro texto visível entre número, contratante e o começo do id. */
function identificacaoDoAtestado(a: AtestadoLido): string {
  const texto = [a.numero, a.contratante].find(temTextoVisivel);
  return texto ? texto : String(a.id).slice(0, 8);
}

const ANEXAR_ACERVO: Ferramenta = {
  def: {
    name: "anexar_acervo",
    title: "Anexar CATs e atestados do acervo à oportunidade",
    description:
      'Copia para a pasta "Envelope 02 – Habilitação" os PDFs das CATs e atestados do acervo técnico. Sem atestado_ids, usa as CATs indicadas no Atende? (cats_anexar). Atestado sem PDF no acervo volta em sem_pdf. Repetir a chamada não duplica.',
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        oportunidade_id: ID_OPORTUNIDADE,
        atestado_ids: {
          type: "array",
          minItems: 1,
          maxItems: MAX_ATESTADOS_POR_CHAMADA,
          description: "ids (UUID) do ler_acervo; omita para usar as CATs do Atende?",
          items: { type: "string" },
        },
      },
      required: ["oportunidade_id"],
    },
    annotations: GRAVACAO,
  },
  async executar(args, deps) {
    const id = uuidOuNull(args.oportunidade_id);
    const pedido = lerAtestadoIds(args.atestado_ids);
    if (!pedido.ok) {
      return falha(
        "atestado_ids inválidos.",
        "validacao",
        { erros: pedido.erros, limite: MAX_ATESTADOS_POR_CHAMADA },
        id
      );
    }
    const op = id
      ? await deps.db.porId<{ id: string; edital_analise: unknown }>(
          "oportunidade",
          id,
          "id, edital_analise"
        )
      : null;
    if (!id || !op) return naoEncontrado("oportunidade", id);

    let ids = pedido.ids;
    if (!ids) {
      // padrão: as CATs que o Atende? mandou anexar (ids que são UUID, sem repetir)
      // deno-lint-ignore no-explicit-any
      const cats = (analiseDe(op.edital_analise) as any)?.atende?.cats_anexar;
      ids = [];
      for (const c of Array.isArray(cats) ? cats : []) {
        const uuid = uuidOuNull(c?.id);
        if (uuid && !ids.includes(uuid)) ids.push(uuid);
      }
      if (ids.length === 0) {
        return falha(
          "Nenhuma CAT indicada: grave o Atende? com registrar_atende (cats_anexar) ou informe atestado_ids.",
          "sem_cats",
          {},
          id
        );
      }
      if (ids.length > MAX_ATESTADOS_POR_CHAMADA) {
        return falha(
          `O Atende? indica ${ids.length} atestados; o limite é ${MAX_ATESTADOS_POR_CHAMADA} por chamada. Informe atestado_ids em lotes.`,
          "validacao",
          { erros: [`${ids.length} atestados no cats_anexar.`], limite: MAX_ATESTADOS_POR_CHAMADA },
          id
        );
      }
    }

    const anexados: Record<string, unknown>[] = [];
    const semPdf: Record<string, unknown>[] = [];
    const naoEncontrados: string[] = [];
    const falhas: Record<string, unknown>[] = [];
    for (const idAtestado of ids) {
      const a = await deps.db.porId<AtestadoLido>(
        "acervo_atestado",
        idAtestado,
        "id, tipo, numero, contratante, arquivo_ref"
      );
      if (!a) {
        naoEncontrados.push(idAtestado);
        continue;
      }
      if (typeof a.arquivo_ref !== "string" || !a.arquivo_ref.trim()) {
        semPdf.push({ atestado_id: a.id, numero: a.numero ?? null });
        continue;
      }
      const r = await copiarParaEnvelope(deps, {
        oportunidadeId: id,
        bucket: BUCKET_ACERVO,
        ref: a.arquivo_ref,
        origem: `acervo:${a.id}`,
        nomeCom: (ext) =>
          `${ROTULO_ACERVO[String(a.tipo)] ?? "Atestado"} ${identificacaoDoAtestado(a)}.${ext}`,
      });
      if (r.situacao === "sem_oportunidade") return naoEncontrado("oportunidade", id);
      if (r.situacao === "falha") {
        falhas.push({ atestado_id: a.id, motivo: r.motivo });
      } else if (r.situacao === "mantido_assinado") {
        falhas.push({ atestado_id: a.id, motivo: "mantido_assinado" });
      } else {
        anexados.push({
          atestado_id: a.id,
          numero: a.numero ?? null,
          nome: r.nome,
          arquivo_id: r.arquivoId,
          substituiu: r.substituiu,
        });
      }
    }

    if (anexados.length > 0) {
      await registrarNoHistorico(
        deps.db,
        id,
        nomeDoUsuario(deps),
        `Acervo técnico anexado pelo Claude: ${anexados.length} documento(s)`
      );
    }
    return sucesso(
      {
        oportunidade_id: id,
        pasta: PASTA_HABILITACAO,
        anexados,
        sem_pdf: semPdf,
        nao_encontrados: naoEncontrados,
        falhas,
        link: linkOportunidade(id),
      },
      { alvo: id }
    );
  },
};

export const FERRAMENTAS_HABILITACAO: Ferramenta[] = [ANEXAR_HABILITACAO, ANEXAR_ACERVO];
export const INSTRUCOES_HABILITACAO: string[] = [];
export const PROMPTS_HABILITACAO: PromptDef[] = [];
