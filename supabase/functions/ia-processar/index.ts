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

// Campos do "Formulário para Registro" (modelo oficial da contabilidade).
// Enums IGUAIS aos CHECKs da tabela funcionario — não inventar variações.
const SCHEMA_EXTRACAO = {
  type: "object",
  properties: {
    campos: {
      type: "object",
      properties: {
        nome_completo: { type: ["string", "null"] },
        nome_mae: { type: ["string", "null"] },
        nome_pai: { type: ["string", "null"] },
        cpf: { type: ["string", "null"] },
        rg: { type: ["string", "null"] },
        rg_data_expedicao: { type: ["string", "null"], description: "AAAA-MM-DD" },
        rg_uf: { type: ["string", "null"] },
        data_nascimento: { type: ["string", "null"], description: "AAAA-MM-DD" },
        naturalidade: { type: ["string", "null"] },
        telefone: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        endereco: { type: ["string", "null"] },
        bairro: { type: ["string", "null"] },
        cidade: { type: ["string", "null"] },
        estado: { type: ["string", "null"] },
        cep: { type: ["string", "null"] },
        pis_nis: { type: ["string", "null"] },
        ctps_numero: { type: ["string", "null"] },
        titulo_eleitor: { type: ["string", "null"] },
        titulo_eleitor_zona: { type: ["string", "null"] },
        titulo_eleitor_secao: { type: ["string", "null"] },
        reservista: { type: ["string", "null"] },
        estado_civil: {
          type: ["string", "null"],
          enum: ["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável", "Outros", null],
        },
        raca_cor: {
          type: ["string", "null"],
          enum: ["Indígena", "Branca", "Negra", "Amarela", "Parda", "Outros", null],
        },
        grau_instrucao: {
          type: ["string", "null"],
          enum: [
            "Analfabeto",
            "Fundamental até 5º Incompleto",
            "Fundamental 5º Completo",
            "Fundamental 6º ao 9º",
            "Fundamental Completo",
            "Ensino Médio Incompleto",
            "Ensino Médio Completo",
            "Superior Incompleto",
            "Superior Completo",
            "Pós-Graduação",
            "Mestrado",
            "Doutorado",
            null,
          ],
        },
        banco_codigo: { type: ["string", "null"] },
        banco_tipo_conta: {
          type: ["string", "null"],
          enum: ["Conta Corrente", "Conta Poupança", null],
        },
        banco_agencia: { type: ["string", "null"] },
        banco_conta: { type: ["string", "null"] },
      },
    },
    dependentes: {
      type: "array",
      description: "Filhos menores de 21 anos e cônjuge encontrados nos documentos",
      items: {
        type: "object",
        properties: {
          nome_completo: { type: "string" },
          data_nascimento: { type: ["string", "null"], description: "AAAA-MM-DD" },
          cpf: { type: ["string", "null"] },
          parentesco: { type: ["string", "null"] },
        },
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
          "Leia os documentos pessoais anexados (RG, CPF, CNH, CTPS, título de eleitor, reservista, comprovantes, certidões, cartão do banco etc.)",
          "e preencha o Formulário para Registro do candidato no JSON pedido.",
          "Datas em AAAA-MM-DD; CPF com pontuação (000.000.000-00); campos não encontrados = null — NUNCA invente.",
          "Como ler cada documento:",
          "- CNH: aproveite TUDO — o campo DOC. IDENTIDADE / ÓRG. EMISSOR / UF traz o RG e a UF dele (ex.: '63614652 SSP MG' → rg=63614652, rg_uf=MG); CPF, data de nascimento, filiação (nome_pai e nome_mae) e naturalidade também estão na CNH. A data de 1ª habilitação/emissão da CNH NÃO é a expedição do RG (deixe rg_data_expedicao null se não constar).",
          "- CTPS DIGITAL: o número da carteira é o PRÓPRIO CPF do titular — preencha ctps_numero com ele; NUNCA escreva a palavra 'Digital' como número.",
          "- Comprovante de residência (conta de água/luz): endereco, bairro, cep, cidade e estado.",
          "- Título de eleitor: titulo_eleitor (número), titulo_eleitor_zona e titulo_eleitor_secao.",
          "- Certidão de casamento: estado_civil='Casado' e cônjuge nos dependentes com nome completo, CPF e DATA DE NASCIMENTO (a certidão costuma trazer a data ou a idade dos nubentes — leia o texto corrido com atenção; se só houver idade, deixe null e registre em observacoes).",
          "Inclua em dependentes o cônjuge e os filhos menores de 21 anos que aparecerem em certidões.",
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
