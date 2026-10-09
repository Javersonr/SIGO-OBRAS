/**
 * Ferramentas do conector do Claude: orçamento, desconto, cronograma e proposta (parte D; spec
 * docs/superpowers/specs/2026-10-08-conector-orcamento-cronograma-design.md).
 *
 * O Claude lê as planilhas da prefeitura no chat e grava aqui, sem o usuário importar arquivo pela
 * tela. As regras são as da tela (_shared/orcamento/, com paridade no Vitest); as gravações que
 * trocam várias linhas vão por RPC numa transação (0153). Tudo pela CamadaEmpresa (empresa da
 * chave): um id de outra empresa dá "nao_encontrado".
 */
import type { PromptDef } from "../_shared/mcp/protocolo.ts";
import { textoCurto, uuidOuNull } from "../_shared/conector/entrada.ts";
import { linkOportunidade } from "../_shared/conector/recurso.ts";
import {
  aplicarDesconto,
  resumoOrcamento,
  validarDesconto,
  type ItemOrcamento,
} from "../_shared/orcamento/desconto.ts";
import {
  LIMITE_LINHAS,
  validarLinhasModelo,
  type InformacoesConector,
  type LinhaConector,
} from "../_shared/orcamento/modelo.ts";
import {
  montarInfoOrcamento,
  montarRegistrosImportacao,
  type RegistroOrcamento,
} from "../_shared/orcamento/registros.ts";
import {
  falha,
  naoEncontrado,
  sucesso,
  type DepsFerramenta,
  type Ferramenta,
  type ResultadoFerramenta,
} from "./registro.ts";

const GRAVACAO = (idempotente: boolean) => ({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: idempotente,
  openWorldHint: false,
});
const ID_OPORTUNIDADE = { type: "string", description: "UUID da oportunidade" };
/** Mensagens devolvidas ao Claude por chamada (o resto vira "… e mais N"). */
const MAX_MENSAGENS = 50;
/** Colunas do orçamento que as contas usam. */
const COLUNAS_ITEM =
  "id, numero, etapa, quantidade, valor_unitario_ref, valor_unitario, valor_total, ordem";

const TEXTO = (descricao?: string) => ({
  type: ["string", "null"],
  ...(descricao ? { description: descricao } : {}),
});
const NUMERO = (descricao: string) => ({
  type: ["number", "string", "null"],
  description: descricao,
});

const SCHEMA_LINHA = {
  type: "object",
  additionalProperties: false,
  properties: {
    item: {
      type: ["string", "number", "null"],
      description: "numeração da prefeitura (1, 1.1, 1.1.2), em texto",
    },
    codigo: { type: ["string", "number", "null"], description: "código SINAPI/SETOP/…" },
    fonte: TEXTO("SINAPI, SETOP, SICRO, CDHU, Próprio…"),
    descricao: TEXTO(),
    unidade: TEXTO(),
    quantidade: NUMERO("até 3 casas; vazio na etapa"),
    preco_unitario: NUMERO(
      "preço da prefeitura COM BDI e SEM desconto, até 4 casas; vazio na etapa"
    ),
    total: NUMERO("total da linha na planilha da prefeitura (só para conferir)"),
  },
  required: ["item", "descricao"],
};

const SCHEMA_INFORMACOES = {
  type: ["object", "null"],
  additionalProperties: false,
  properties: {
    orgao: TEXTO(),
    objeto: TEXTO(),
    edital: TEXTO("nº do edital/processo"),
    data_base: TEXTO("data-base dos preços (ex.: 09/2025)"),
    bdi: { type: ["string", "number", "null"], description: "BDI em % (23,96)" },
    fonte_precos: TEXTO("tabela de preços (ex.: SINAPI 09/2025)"),
    total_prefeitura: NUMERO("valor total da planilha da prefeitura"),
    observacoes: TEXTO(),
  },
};

/** Lista para o Claude: até MAX_MENSAGENS, e "… e mais N" quando passa. */
function resumirLista(lista: string[]): string[] {
  if (lista.length <= MAX_MENSAGENS) return lista;
  return [...lista.slice(0, MAX_MENSAGENS), `… e mais ${lista.length - MAX_MENSAGENS}.`];
}

function erroValidacao(
  mensagem: string,
  erros: string[],
  avisos: string[],
  alvo: string | null
): ResultadoFerramenta {
  return falha(
    mensagem,
    "validacao",
    {
      erros: erros.slice(0, MAX_MENSAGENS),
      total_erros: erros.length,
      avisos: resumirLista(avisos),
    },
    alvo
  );
}

const nomeDoUsuario = (deps: DepsFerramenta) => `${deps.ctx.usuario.nome} (via Claude)`;

/** Resumo curto (ok e motivo, nunca o corpo todo) de uma resposta de RPC fora do contrato, para o log. */
const respostaFora = (r: { ok?: unknown; motivo?: unknown } | null | undefined) =>
  r ? `ok=${String(r.ok)}, motivo=${String(r.motivo)}` : "sem resposta";

/** Oportunidade viva da empresa da chave (ou null: outra empresa, inexistente ou id inválido). */
async function lerOportunidade<T>(deps: DepsFerramenta, id: string | null, colunas: string) {
  return id ? await deps.db.porId<T>("oportunidade", id, colunas) : null;
}

// ─── importar_orcamento ─────────────────────────────────────────────────────

const IMPORTAR_ORCAMENTO: Ferramenta = {
  def: {
    name: "importar_orcamento",
    title: "Importar o orçamento da prefeitura",
    description:
      "Grava as etapas e os itens da planilha orçamentária da prefeitura no orçamento da oportunidade, no formato do modelo SIGO (uma linha por etapa ou item, na ordem da planilha). Etapa = linha sem quantidade e preço; todo item precisa estar dentro de uma etapa. O desconto atual da oportunidade é aplicado na importação. Se a oportunidade já tem orçamento, nada é gravado sem substituir: true (pergunte ao usuário antes).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        oportunidade_id: ID_OPORTUNIDADE,
        linhas: { type: "array", minItems: 1, maxItems: LIMITE_LINHAS, items: SCHEMA_LINHA },
        informacoes: SCHEMA_INFORMACOES,
        substituir: { type: "boolean", description: "true só depois de o usuário confirmar" },
        arquivo_nome: {
          type: "string",
          maxLength: 200,
          description: "nome da planilha de origem (padrão: via Claude)",
        },
      },
      required: ["oportunidade_id", "linhas"],
    },
    annotations: GRAVACAO(false),
  },
  async executar(args, deps) {
    const id = uuidOuNull(args.oportunidade_id);
    const linhas = Array.isArray(args.linhas) ? (args.linhas as LinhaConector[]) : [];
    const informacoes =
      args.informacoes && typeof args.informacoes === "object"
        ? (args.informacoes as InformacoesConector)
        : null;

    // 1. as regras da planilha (as mesmas da tela)
    const r = validarLinhasModelo(linhas, informacoes);
    if (r.erros.length > 0) {
      return erroValidacao(
        "A planilha tem erros; nada foi gravado. Corrija as linhas e chame de novo.",
        r.erros,
        r.avisos,
        id
      );
    }
    if (r.itensSemEtapa.length > 0) {
      return erroValidacao(
        "Há itens fora de etapa; nada foi gravado.",
        r.itensSemEtapa.map(
          (n) =>
            `Item ${n} sem etapa acima: todo item precisa estar dentro de uma etapa (linha sem quantidade e preço).`
        ),
        r.avisos,
        id
      );
    }

    // 2. a oportunidade e o desconto atual (a tela importa já com ele)
    const op = await lerOportunidade<{ id: string; desconto_proposta_pct: unknown }>(
      deps,
      id,
      "id, desconto_proposta_pct"
    );
    if (!op || !id) return naoEncontrado("oportunidade", id);
    const descontoPct = Number(op.desconto_proposta_pct) || 0;

    // 3. os registros de orcamento_item (com o desconto) e o orcamento_info
    let registros: RegistroOrcamento[];
    try {
      registros = montarRegistrosImportacao(r.itens, {
        empresaId: deps.db.empresaId,
        oportunidadeId: id,
        descontoPct,
      });
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      return erroValidacao(`Não foi possível importar: ${e.message}.`, [e.message], r.avisos, id);
    }
    const info = montarInfoOrcamento(r.info, {
      arquivoNome: textoCurto(args.arquivo_nome, 200) ?? "via Claude",
      importadoEm: deps.agora.toISOString(),
    });

    // 4. troca a lista toda ou nada (0153)
    const gravado = await deps.db.rpc<{ ok: boolean; motivo?: string; itens_atuais?: number }>(
      "conector_substituir_orcamento",
      {
        p_oportunidade_id: id,
        p_registros: registros,
        p_info: info,
        p_substituir: args.substituir === true,
        p_usuario_nome: nomeDoUsuario(deps),
        p_descricao: `Orçamento importado pelo Claude: ${r.totais.qtdEtapas} etapas e ${r.totais.qtdItens} itens`,
      }
    );
    if (gravado?.ok !== true) {
      if (gravado?.motivo === "ja_existe") {
        const n = Number(gravado.itens_atuais) || 0;
        return sucesso(
          {
            gravado: false,
            motivo: "ja_existe",
            itens_atuais: n,
            pergunta: `Substituir os ${n} itens atuais?`,
          },
          { alvo: id, motivo: "ja_existe" }
        );
      }
      if (gravado?.motivo === "nao_encontrada") return naoEncontrado("oportunidade", id);
      // resposta fora do contrato da 0153: erro interno (o despacho registra), nunca "não encontrada"
      throw new Error(
        `conector_substituir_orcamento: resposta inesperada (${respostaFora(gravado)})`
      );
    }

    return sucesso(
      {
        gravado: true,
        etapas: r.totais.qtdEtapas,
        itens: r.totais.qtdItens,
        total_referencia: r.totais.referencia,
        total_prefeitura: r.totais.prefeitura,
        desconto_aplicado_pct: descontoPct,
        avisos: resumirLista(r.avisos),
        link: linkOportunidade(id),
      },
      { alvo: id }
    );
  },
};

// ─── aplicar_desconto ───────────────────────────────────────────────────────

const APLICAR_DESCONTO: Ferramenta = {
  def: {
    name: "aplicar_desconto",
    title: "Aplicar o desconto da proposta",
    description:
      "Aplica o desconto linear em % a todos os itens importados (os que têm preço de referência) e grava o % da proposta: unitário = TRUNCAR(referência × (1 − desconto), 2) e total = ARREDONDAR(quantidade × unitário, 2), as contas da tela. Pergunte o desconto ao usuário antes. Devolve o total de referência, o total da proposta e o desconto real.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        oportunidade_id: ID_OPORTUNIDADE,
        desconto_pct: {
          type: ["number", "string"],
          description: "de 0 a 99,99, até 2 casas (12,35 ou 12.35)",
        },
      },
      required: ["oportunidade_id", "desconto_pct"],
    },
    annotations: GRAVACAO(true),
  },
  async executar(args, deps) {
    const id = uuidOuNull(args.oportunidade_id);
    const v = validarDesconto(args.desconto_pct);
    if (!v.ok) return falha(`${v.erro}.`, "validacao", { erros: [v.erro] }, id);

    const op = await lerOportunidade<{ id: string }>(deps, id, "id");
    if (!op || !id) return naoEncontrado("oportunidade", id);

    const lerItens = () =>
      deps.db.lerTodos<ItemOrcamento>("orcamento_item", COLUNAS_ITEM, (q) =>
        q.eq("oportunidade_id", id)
      );
    let alteracoes: ReturnType<typeof aplicarDesconto>;
    try {
      alteracoes = aplicarDesconto(await lerItens(), v.valor);
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      return falha(`Nada foi alterado: ${e.message}.`, "validacao", { erros: [e.message] }, id);
    }
    if (alteracoes.length === 0) {
      return falha(
        "A oportunidade não tem orçamento importado (itens com preço de referência). Chame importar_orcamento antes.",
        "sem_orcamento",
        {},
        id
      );
    }

    const r = await deps.db.rpc<{ ok: boolean; motivo?: string; itens?: number }>(
      "conector_aplicar_desconto",
      {
        p_oportunidade_id: id,
        p_pct: v.valor,
        p_alteracoes: alteracoes,
        p_usuario_nome: nomeDoUsuario(deps),
      }
    );
    if (r?.ok !== true) {
      if (r?.motivo === "orcamento_mudou") {
        return falha(
          "O orçamento mudou enquanto o desconto era gravado (alguém editou na tela). Nada foi gravado: chame aplicar_desconto de novo.",
          "orcamento_mudou",
          {},
          id
        );
      }
      if (r?.motivo === "nao_encontrada") return naoEncontrado("oportunidade", id);
      throw new Error(`conector_aplicar_desconto: resposta inesperada (${respostaFora(r)})`);
    }

    const resumo = resumoOrcamento(await lerItens());
    return sucesso(
      {
        desconto_pct: v.valor,
        itens_alterados: Number(r.itens) || 0,
        total_referencia: resumo.totalReferencia,
        total_proposta: resumo.totalProposta,
        desconto_real: resumo.descontoReal,
        link: linkOportunidade(id),
      },
      { alvo: id }
    );
  },
};

export const FERRAMENTAS_ORCAMENTO: Ferramenta[] = [IMPORTAR_ORCAMENTO, APLICAR_DESCONTO];
export const INSTRUCOES_ORCAMENTO: string[] = [];
export const PROMPTS_ORCAMENTO: PromptDef[] = [];
