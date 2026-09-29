/**
 * ia-processar — ponte de IA do SIGO: Gemini como padrão e OpenAI de reserva
 * (chaves globais do SaaS Admin; porta única chamarIA em _shared/ia.ts).
 *
 * Exige usuário autenticado (JWT da sessão). A empresa é SEMPRE a do token
 * (usuario.empresa_id) — nunca do corpo. Ações:
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
 * Financeiro — "Ler documento" (financeiro-ler.ts / financeiro-documento.ts):
 *
 *   { acao:"financeiro_ler_documento", file_ref, tipo:"despesa"|"receita" }
 *     → { success, documento: DocumentoFiscal }  (origem "ia"; nada é gravado)
 *     PDF, JPG, JPEG, PNG ou WEBP da empresa do token (HEIC → 400 pedindo
 *     JPEG). Nível padrão e, se vier fraco (sem valor total ou sem a pessoa
 *     do lançamento), o forte — 60 s por nível. Saída normalizada no servidor
 *     (CPF/CNPJ, chave de NF-e com DV, datas, valores, parcelas). Sem cota.
 *
 * Leitura de edital (Oportunidades) — ver edital.ts / edital-schemas.ts:
 *
 *   { acao:"edital_extrair_parte", nome_arquivo, parte, total_partes,
 *     paginas:[{n, texto}], imagens?:[{n, data_url:"data:image/jpeg;base64,..."}] }
 *     → { success, resultado: ParcialEdital, modelo }
 *     Lê SÓ as páginas enviadas (texto com "=== PÁGINA n ===" + imagens das
 *     escaneadas); nível padrão e, se vier fraco/erro, o forte — até ~120 s.
 *     resultado._origem = {nome_arquivo, parte, total_partes, errata}
 *     (extensão: devolva junto nas parciais para a errata ter prioridade).
 *     Limites: 300 mil caracteres, 300 páginas e 30 imagens por parte.
 *
 *   { acao:"edital_consolidar", parciais:[ParcialEdital], nomes_arquivos:[string] }
 *     → { success, resultado: EditalConsolidado, modelo }
 *     Junta em código (dedup exata, errata vence, conflitos em avisos); só chama
 *     o modelo forte se houver conflito ou exigência parecida repetida. Sem IA
 *     (erro/timeout) devolve a junção em código com aviso.
 *
 *   { acao:"edital_atende", extraido: EditalConsolidado }
 *     → { success, resultado: AtendeResultado }
 *     Carrega o acervo da empresa do token (acervo_perfil / _profissional /
 *     _atestado / _quantitativo); econômico-financeiro decidido em código;
 *     técnica e registros pelo modelo forte com totais/tetos calculados em
 *     código. Sem acervo → 422 { codigo:"SEM_ACERVO" }.
 *
 * CONSUMO de TODAS as ações de IA (ia-uso.ts; tabela ia_uso, migrações 0114/0123):
 *   - Depois da ação (sucesso, erro ou exceção), grava 1 linha em ia_uso com os
 *     tokens de entrada/saída de TODAS as chamadas à IA da requisição
 *     (fallback Gemini → OpenAI e escalonamento padrão → forte incluídos),
 *     o(s) provedor(es), o(s) modelo(s) e o custo estimado em US$
 *     (_shared/ia-precos.ts; null se nenhum modelo tem preço). Requisição que
 *     não chamou a IA (validação, consolidação só em código) não grava.
 *
 * COTA só das ações edital_*:
 *   - ANTES de chamar a IA, conta as requisições edital_* da empresa do
 *     token no dia (fuso de Brasília; sem empresa → as do próprio usuário).
 *     Chegou na cota → 429 { codigo:"COTA_IA", cota, usadas }. Cota = saas_config
 *     'ia_cota_edital_dia' (inteiro ≥ 1; ausente/inválido → 400). Super admin
 *     é isento. Contagem "confere e depois age": requisições em paralelo
 *     podem passar a cota em poucas unidades.
 *   - Falha ao ler/contar (ex.: tabela ainda não criada) libera a ação; falha
 *     ao gravar vai só para o log — nunca derruba a ação.
 *
 * Sem chave nenhuma (nem Gemini nem OpenAI) → 503 "IA não configurada".
 */
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { validarRef } from "../_shared/openai.ts";
import { chamarIA } from "../_shared/ia.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { editalAtende, editalConsolidar, editalExtrairParte, falhaIA } from "./edital.ts";
import { chamarComEscalonamento } from "./escalonamento.ts";
import { lerDocumentoFinanceiro } from "./financeiro-ler.ts";
import {
  contabilizar,
  ehAcaoEdital,
  novoMedidor,
  registrarUso,
  verificarCotaEdital,
} from "./ia-uso.ts";

interface Body {
  acao?: string;
  prompt?: string;
  json_schema?: unknown;
  file_refs?: string[];
  checklist?: string[];
  pcmso_ref?: string;
  exames_refs?: string[];
  funcao?: string;
  // financeiro_ler_documento (validados em financeiro-ler.ts)
  file_ref?: unknown;
  tipo?: unknown;
  // edital_* (validados em edital.ts)
  nome_arquivo?: unknown;
  parte?: unknown;
  total_partes?: unknown;
  paginas?: unknown;
  imagens?: unknown;
  parciais?: unknown;
  nomes_arquivos?: unknown;
  extraido?: unknown;
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

    // Arquivos são baixados com service role: só da pasta da empresa do
    // usuário ("bucket/<empresa_id>/..."). Sem isto, qualquer usuário lia
    // arquivo de outra empresa pedindo para a IA "transcrever".
    const refsPedidos = [
      ...(body.file_refs ?? []),
      ...(body.pcmso_ref ? [body.pcmso_ref] : []),
      ...(body.exames_refs ?? []),
      ...(body.file_ref ? [body.file_ref] : []),
    ];
    // validarRef recusa "..", "%", "?", "#" etc. (o download com service role
    // montaria outra URL) — vale inclusive para super admin
    for (const r of refsPedidos) {
      let empresaDoRef: string;
      try {
        empresaDoRef = validarRef(r).empresaId;
      } catch {
        return fail("Referência de arquivo inválida", 403);
      }
      if (
        !usuario.is_super_admin &&
        empresaDoRef !== String(usuario.empresa_id || "").toLowerCase()
      ) {
        return fail("Arquivo de outra empresa", 403);
      }
    }

    // consumo: toda chamada à IA desta requisição soma no medidor, gravado no
    // finally (ok, erro ou exceção); sem chamada à IA não grava nada
    const admin = createAdminClient();
    const medidor = novoMedidor();

    try {
      if (body.acao === "llm") {
        if (!body.prompt) return fail("prompt é obrigatório", 400);
        const r = await chamarIA({
          prompt: body.prompt,
          jsonSchema: body.json_schema,
          fileRefs: body.file_refs,
          esforco: "low",
        });
        contabilizar(medidor, r);
        if (!r.ok) return falhaIA(r);
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
          "- Certidão de casamento: estado_civil='Casado' e cônjuge nos dependentes com nome completo, CPF e DATA DE NASCIMENTO — procure no texto corrido expressões como 'nascida aos 23/05/1998', 'nascido em ...' (se só houver idade, deixe null e registre em observacoes).",
          "Inclua em dependentes o cônjuge e os filhos menores de 21 anos que aparecerem em certidões.",
          checklist.length
            ? `Classifique cada arquivo anexado em UM item deste checklist (ou null se não corresponder): ${checklist.join("; ")}.`
            : "Em classificacao, identifique o tipo de cada documento anexado.",
          "Os nomes dos arquivos, na ordem em que foram anexados, são: " +
            (body.file_refs ?? []).map((r) => r.split("/").pop()).join("; "),
        ].join("\n");
        // fraco = faltou o básico OU dependente sem data OU anexo sem classificar
        // deno-lint-ignore no-explicit-any
        const extracaoFraca = (res: any) => {
          if (!res?.campos?.nome_completo || !res?.campos?.cpf) return true;
          if ((res?.dependentes ?? []).some((d: any) => !d?.data_nascimento)) return true;
          const cls = res?.classificacao ?? [];
          const semItem = cls.filter((x: any) => !x?.item_checklist).length;
          return cls.length > 0 && semItem > cls.length / 2;
        };
        const r = await chamarComEscalonamento(
          chamarIA,
          { prompt, fileRefs: body.file_refs, jsonSchema: SCHEMA_EXTRACAO, esforco: "low" },
          extracaoFraca,
          medidor
        );
        if (!r.ok) return falhaIA(r);
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
        // parecer sem resumo ou sem estrutura clara = fraco → escala pro forte
        // deno-lint-ignore no-explicit-any
        const parecerFraco = (res: any) =>
          typeof res?.aprovado !== "boolean" || !res?.resumo || !Array.isArray(res?.pendencias);
        const r = await chamarComEscalonamento(
          chamarIA,
          {
            prompt,
            fileRefs: [body.pcmso_ref, ...body.exames_refs],
            jsonSchema: SCHEMA_PCMSO,
            esforco: "low",
          },
          parecerFraco,
          medidor
        );
        if (!r.ok) return falhaIA(r);
        return ok({ resultado: r.resultado });
      }

      if (body.acao === "financeiro_ler_documento") {
        // ref já conferida acima (mesma empresa do token); formato, tipo e
        // escalonamento padrão → forte em financeiro-ler.ts; uso gravado no finally
        const r = await lerDocumentoFinanceiro(
          chamarIA,
          { file_ref: body.file_ref, tipo: body.tipo },
          medidor
        );
        if (!r.ok) return r.entrada ? fail(r.erro, 400) : falhaIA(r);
        return ok({ documento: r.documento });
      }

      if (ehAcaoEdital(body.acao)) {
        const acao = body.acao;
        const estouro = await verificarCotaEdital(admin, usuario);
        if (estouro) {
          return fail(
            `Limite diário da IA na leitura de editais atingido para esta empresa (${estouro.usadas} de ${estouro.cota} chamadas hoje) — tente amanhã ou fale com o suporte do SIGO.`,
            429,
            { codigo: "COTA_IA", cota: estouro.cota, usadas: estouro.usadas }
          );
        }
        const dados = body as Record<string, unknown>;
        if (acao === "edital_extrair_parte") return await editalExtrairParte(dados, medidor);
        if (acao === "edital_consolidar") return await editalConsolidar(dados, medidor);
        return await editalAtende(dados, usuario, medidor);
      }

      return fail("Ação desconhecida", 400);
    } catch (e) {
      console.error("[ia-processar]", (e as Error)?.message);
      return fail((e as Error)?.message || "Erro interno", 500);
    } finally {
      // TODA ação de IA grava o consumo; registrarUso ignora medidor sem chamada
      await registrarUso(admin, usuario, String(body.acao ?? ""), medidor);
    }
  })
);
