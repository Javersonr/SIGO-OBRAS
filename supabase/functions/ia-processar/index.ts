/**
 * ia-processar — ponte de IA do SIGO (OpenAI, chave global do SaaS).
 *
 * Exige usuário autenticado (JWT da sessão). Ações:
 *
 *   { acao:"llm", prompt, json_schema?, file_refs? }
 *     → { success, resultado }  (JSON parseado quando há schema, senão texto)
 *
 *   { acao:"extrair_documentos", file_refs, checklist }
 *     → { success, resultado: { campos{...}, classificacao[], observacoes } }
 *
 *   { acao:"validar_exames_pcmso", pcmso_ref, exames_refs, funcao }
 *     → { success, resultado: { aprovado, pendencias[], resumo } }
 *
 * Sem chave configurada → 503 "IA não configurada".
 */
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { chamarOpenAI } from "../_shared/openai.ts";

interface Body {
  acao?: string;
  prompt?: string;
  json_schema?: unknown;
  file_refs?: string[];
  checklist?: string[];
  pcmso_ref?: string;
  exames_refs?: string[];
  funcao?: string;
}

const SCHEMA_EXTRACAO = {
  type: "object",
  properties: {
    campos: {
      type: "object",
      properties: {
        nome_completo: { type: ["string", "null"] },
        cpf: { type: ["string", "null"] },
        rg: { type: ["string", "null"] },
        data_nascimento: { type: ["string", "null"], description: "AAAA-MM-DD" },
        telefone: { type: ["string", "null"] },
        endereco: { type: ["string", "null"] },
        cidade: { type: ["string", "null"] },
        estado: { type: ["string", "null"] },
        cep: { type: ["string", "null"] },
        pis_nis: { type: ["string", "null"] },
        ctps_numero: { type: ["string", "null"] },
      },
    },
    classificacao: {
      type: "array",
      items: {
        type: "object",
        properties: {
          arquivo: { type: "string" },
          item_checklist: { type: ["string", "null"] },
        },
      },
    },
    observacoes: { type: ["string", "null"] },
  },
  required: ["campos", "classificacao"],
};

const SCHEMA_PCMSO = {
  type: "object",
  properties: {
    aprovado: { type: "boolean" },
    pendencias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          exame: { type: "string" },
          motivo: { type: "string" },
        },
      },
    },
    resumo: { type: "string" },
  },
  required: ["aprovado", "pendencias", "resumo"],
};

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return fail("Sessão inválida", 401);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    try {
      if (body.acao === "llm") {
        if (!body.prompt) return fail("prompt é obrigatório", 400);
        const r = await chamarOpenAI({
          prompt: body.prompt,
          jsonSchema: body.json_schema,
          fileRefs: body.file_refs,
        });
        if (!r.ok) {
          return r.erro === "IA_NAO_CONFIGURADA"
            ? fail("IA não configurada — defina a chave no SaaS Admin → Integrações", 503)
            : fail(r.erro, 502);
        }
        return ok({ resultado: r.resultado });
      }

      if (body.acao === "extrair_documentos") {
        if (!body.file_refs?.length) return fail("file_refs é obrigatório", 400);
        const checklist = body.checklist?.length ? body.checklist : [];
        const prompt = [
          "Você é o assistente de RH de uma construtora brasileira.",
          "Leia os documentos pessoais anexados (RG, CPF, CNH, CTPS, comprovante de endereço, certidões etc.)",
          "e devolva os dados cadastrais do candidato no JSON pedido.",
          "Datas em AAAA-MM-DD; CPF com pontuação (000.000.000-00); campos não encontrados = null.",
          checklist.length
            ? `Classifique cada arquivo anexado em UM item deste checklist (ou null se não corresponder): ${checklist.join("; ")}.`
            : "Em classificacao, identifique o tipo de cada documento anexado.",
          "Os nomes dos arquivos, na ordem em que foram anexados, são: " +
            (body.file_refs ?? []).map((r) => r.split("/").pop()).join("; "),
        ].join("\n");
        const r = await chamarOpenAI({
          prompt,
          fileRefs: body.file_refs,
          jsonSchema: SCHEMA_EXTRACAO,
        });
        if (!r.ok) {
          return r.erro === "IA_NAO_CONFIGURADA"
            ? fail("IA não configurada — defina a chave no SaaS Admin → Integrações", 503)
            : fail(r.erro, 502);
        }
        return ok({ resultado: r.resultado });
      }

      if (body.acao === "validar_exames_pcmso") {
        if (!body.pcmso_ref) return fail("pcmso_ref é obrigatório", 400);
        if (!body.exames_refs?.length) return fail("exames_refs é obrigatório", 400);
        const prompt = [
          "Você é técnico de segurança do trabalho.",
          "O PRIMEIRO documento anexado é o PCMSO da empresa.",
          `Os documentos seguintes são os exames entregues pela clínica para um candidato à função: ${body.funcao || "(não informada)"}.`,
          "Confira se TODOS os exames exigidos pelo PCMSO para essa função foram entregues, estão dentro da validade e com resultado apto.",
          "Liste como pendência qualquer exame exigido que falte, esteja vencido, ilegível ou com resultado divergente.",
          "aprovado = true somente se não houver NENHUMA pendência.",
        ].join("\n");
        const r = await chamarOpenAI({
          prompt,
          fileRefs: [body.pcmso_ref, ...body.exames_refs],
          jsonSchema: SCHEMA_PCMSO,
        });
        if (!r.ok) {
          return r.erro === "IA_NAO_CONFIGURADA"
            ? fail("IA não configurada — defina a chave no SaaS Admin → Integrações", 503)
            : fail(r.erro, 502);
        }
        return ok({ resultado: r.resultado });
      }

      return fail("Ação desconhecida", 400);
    } catch (e) {
      console.error("[ia-processar]", (e as Error)?.message);
      return fail((e as Error)?.message || "Erro interno", 500);
    }
  })
);
