/**
 * financeiro-ler — ação financeiro_ler_documento da ia-processar: lê um PDF ou
 * foto (DANFE, NFS-e, cupom, recibo, boleto, comprovante de PIX) e devolve o
 * DocumentoFiscal normalizado (financeiro-documento.ts) para o front
 * preencher a nova despesa/receita. Nada é gravado aqui.
 *
 *   - a ref já foi validada no index (validarRef + mesma empresa do token);
 *     aqui: tipo do lançamento e formato (PDF/JPG/JPEG/PNG/WEBP pela
 *     extensão; HEIC é recusado — a reserva OpenAI não lê HEIC);
 *   - nível "padrao" e, se o documento vier fraco (sem valor total ou sem a
 *     pessoa do lançamento), "forte" — 60 s por nível (≤ 120 s, como a
 *     leitura de edital); fica com o não fraco ou, empatados, com o mais
 *     completo; fraco no fim → aviso para o usuário conferir;
 *   - toda chamada (inclusive o fallback Gemini → OpenAI) soma no medidor.
 *
 * Puro: o chamarIA vem por parâmetro (o index passa o de _shared/ia.ts) —
 * testável em Node.
 */
import type { NivelIA, ProvedorIA } from "../_shared/ia-tipos.ts";
import { contarPreenchidos } from "./edital-regras.ts";
import type { ChamarIA } from "./escalonamento.ts";
import {
  documentoFraco,
  normalizarDocumento,
  promptDocumento,
  SCHEMA_DOCUMENTO_FISCAL,
  type DocumentoFiscal,
  type TipoLancamento,
} from "./financeiro-documento.ts";
import { contabilizar, type MedidorUso } from "./ia-uso.ts";

export const EXTENSOES_DOCUMENTO = ["pdf", "jpg", "jpeg", "png", "webp"] as const;
/** por nível: padrão + forte cabem em ~120 s, como a leitura de edital */
export const TEMPO_LEITURA_MS = 60_000;
export const MAX_TOKENS_LEITURA = 8_000;

const NIVEIS: NivelIA[] = ["padrao", "forte"];

/** null = formato aceito; senão a mensagem para o usuário (HTTP 400) */
export function erroArquivoDocumento(ref: string): string | null {
  const nome = ref.split("/").pop() ?? "";
  const ext = nome.includes(".") ? (nome.split(".").pop() ?? "").toLowerCase() : "";
  if (ext === "heic" || ext === "heif") {
    return "Foto em HEIC (padrão do iPhone) não é aceita — tire a foto em JPEG (iPhone: Ajustes → Câmera → Formatos → Mais Compatível) ou envie o PDF.";
  }
  if (!(EXTENSOES_DOCUMENTO as readonly string[]).includes(ext)) {
    return "Formato não aceito — envie PDF, JPG, PNG ou WEBP.";
  }
  return null;
}

export type ResultadoLeitura =
  | { ok: true; documento: DocumentoFiscal; modelo: string; provedor: ProvedorIA; nivel: NivelIA }
  /** entrada=true → 400 com a mensagem; false → falha da IA (falhaIA no index) */
  | { ok: false; erro: string; entrada: boolean };

const ehTipoLancamento = (v: unknown): v is TipoLancamento => v === "despesa" || v === "receita";

/** campos preenchidos, sem contar avisos/duvidosos (não são dado do documento) */
const pontosDe = (doc: DocumentoFiscal) => contarPreenchidos({ ...doc, avisos: [], duvidosos: [] });

function avisoIncompleto(doc: DocumentoFiscal, tipo: TipoLancamento): string {
  const faltas: string[] = [];
  if (doc.valor_total === null) faltas.push("o valor total");
  const pessoa = tipo === "receita" ? doc.destinatario.nome : doc.emitente.nome;
  if (!pessoa) faltas.push(tipo === "receita" ? "o nome do cliente" : "o nome do fornecedor");
  return `Leitura incompleta: não encontrei ${faltas.join(" nem ")} — confira o documento e preencha à mão.`;
}

export async function lerDocumentoFinanceiro(
  chamar: ChamarIA,
  entrada: { file_ref?: unknown; tipo?: unknown },
  medidor?: MedidorUso
): Promise<ResultadoLeitura> {
  const { file_ref: ref, tipo } = entrada;
  if (typeof ref !== "string" || !ref) {
    return { ok: false, erro: "file_ref é obrigatório", entrada: true };
  }
  if (!ehTipoLancamento(tipo)) {
    return { ok: false, erro: 'tipo deve ser "despesa" ou "receita"', entrada: true };
  }
  const erroArquivo = erroArquivoDocumento(ref);
  if (erroArquivo) return { ok: false, erro: erroArquivo, entrada: true };

  let melhor: {
    documento: DocumentoFiscal;
    fraco: boolean;
    pontos: number;
    modelo: string;
    provedor: ProvedorIA;
    nivel: NivelIA;
  } | null = null;
  let ultimoErro = "IA indisponível";
  for (const nivel of NIVEIS) {
    const r = await chamar({
      prompt: promptDocumento(tipo),
      fileRefs: [ref],
      jsonSchema: SCHEMA_DOCUMENTO_FISCAL,
      nomeSchema: "documento_fiscal",
      strict: true,
      timeoutMs: TEMPO_LEITURA_MS,
      maxOutputTokens: MAX_TOKENS_LEITURA,
      esforco: "low",
      nivel,
    });
    contabilizar(medidor, r);
    if (!r.ok) {
      if (r.erro === "IA_NAO_CONFIGURADA") return { ok: false, erro: r.erro, entrada: false };
      ultimoErro = r.erro;
      continue; // erro/timeout/cortada → tenta o forte
    }
    const documento = normalizarDocumento(r.resultado);
    const fraco = documentoFraco(documento, tipo);
    const pontos = pontosDe(documento);
    if (!melhor || (melhor.fraco && !fraco) || (melhor.fraco === fraco && pontos > melhor.pontos)) {
      melhor = { documento, fraco, pontos, modelo: r.modelo, provedor: r.provedor, nivel };
    }
    if (!fraco) break; // bom o suficiente
  }
  if (!melhor) return { ok: false, erro: ultimoErro, entrada: false };
  if (melhor.fraco) melhor.documento.avisos.push(avisoIncompleto(melhor.documento, tipo));
  return {
    ok: true,
    documento: melhor.documento,
    modelo: melhor.modelo,
    provedor: melhor.provedor,
    nivel: melhor.nivel,
  };
}
