/**
 * Ferramentas de edital e oportunidade do conector do Claude (parte B do Plano 2):
 * buscar_oportunidades e obter_oportunidade (T8).
 *
 * Todo acesso a tabela passa pela CamadaEmpresa (deps.db), presa à empresa da chave; o id que
 * não é da empresa volta "não encontrado", igual ao inexistente. Os valores econômicos do
 * acervo (capital, PL, índices, faturamento) são lidos só para escondê-los do "Atende?" e
 * nunca vão para a saída.
 */
import type { PromptDef } from "../_shared/mcp/protocolo.ts";
import type { CamadaEmpresa } from "../_shared/conector/camada-empresa.ts";
import { inteiroNaFaixa, textoCurto, uuidOuNull } from "../_shared/conector/entrada.ts";
import { linkOportunidade } from "../_shared/conector/recurso.ts";
import { atendeParaConector, valoresEconomicos } from "../_shared/edital/atende-conector.ts";
import { COLUNAS_OPORTUNIDADE_EDITAL } from "../_shared/edital/campos-oportunidade.ts";
import {
  chaveNumeroAno,
  textoNormalizado,
  type OportunidadeResumo,
} from "../_shared/edital/duplicatas.ts";
import type { AcervoPerfil } from "../_shared/edital/edital-regras.ts";
import type { AtendeResultado } from "../_shared/edital/edital-schemas.ts";
import { falha, naoEncontrado, sucesso, type Ferramenta } from "./registro.ts";

type Obj = Record<string, unknown>;
type Resposta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

const ID_OPORTUNIDADE = {
  type: "string",
  format: "uuid",
  description: "id (UUID) da oportunidade no SIGO",
};

/** Colunas econômicas do perfil: lidas SÓ no servidor, para esconder os valores do "Atende?". */
export const COLUNAS_PERFIL_ECONOMICO =
  "capital_social, patrimonio_liquido, ccl, liquidez_corrente, liquidez_geral, solvencia_geral, endividamento_geral, faturamento";
const COLUNAS_OBTER = [
  "id",
  "status_nome",
  "alertar_prazos",
  "edital_analise",
  ...COLUNAS_OPORTUNIDADE_EDITAL,
].join(", ");

async function linhas<T>(q: Resposta, oque: string): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(`Falha ao ler ${oque}: ${error.message}`);
  return (data ?? []) as T[];
}

/** edital_analise vem como objeto (ou jsonb-string, do legado). */
function analiseDe(v: unknown): Obj | null {
  let x = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return null;
    }
  }
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : null;
}

async function perfilEconomico(db: CamadaEmpresa): Promise<AcervoPerfil | null> {
  const [p] = await linhas<AcervoPerfil>(
    db
      .ler("acervo_perfil", COLUNAS_PERFIL_ECONOMICO)
      .order("updated_at", { ascending: false })
      .limit(1),
    "o acervo"
  );
  return p ?? null;
}

// ─── buscar_oportunidades ───────────────────────────────────────────────────

const BUSCAR_OPORTUNIDADES: Ferramenta = {
  def: {
    name: "buscar_oportunidades",
    title: "Buscar oportunidades",
    description:
      "Procura oportunidades (licitações) desta empresa no SIGO pelo nº/ano do edital (12/2026 acha 012/2026 e 12.2026, também no nome das antigas) e/ou por palavras sem acento no nome, descrição, órgão e cidade. Use antes de criar uma oportunidade, para não duplicar.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        texto: {
          type: "string",
          maxLength: 200,
          description: "palavras (3+ letras) que precisam aparecer, ex.: 'joanopolis iluminacao'",
        },
        numero_edital: {
          type: "string",
          maxLength: 80,
          description: "nº do edital ou do processo com o ano, ex.: 'PE 012/2026'",
        },
        limite: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      required: [],
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  async executar(args, { db }) {
    const texto = textoCurto(args.texto, 200);
    const numeroEdital = textoCurto(args.numero_edital, 80);
    const limite = inteiroNaFaixa(args.limite, 1, 50) ?? 20;
    const chave = chaveNumeroAno(numeroEdital);
    // nº sem ano não vira filtro de nº: entra como palavra
    const busca = [texto, numeroEdital && !chave ? numeroEdital : null].filter(Boolean).join(" ");
    const temPalavra = textoNormalizado(busca)
      .split(/[^a-z0-9]+/)
      .some((p) => p.length >= 3);
    if (!chave && !temPalavra) {
      return falha(
        "Informe texto (uma palavra com 3 ou mais letras) ou numero_edital com nº e ano (ex.: 12/2026).",
        "validacao"
      );
    }
    const encontradas = await db.rpc<OportunidadeResumo[] | null>("conector_buscar_oportunidades", {
      p_texto: temPalavra ? busca : null,
      p_numero: chave ? String(chave.numero) : null,
      p_ano: chave ? String(chave.ano) : null,
      p_limite: limite,
    });
    const oportunidades = (encontradas ?? []).map((o) => ({
      id: o.id,
      nome: o.nome,
      status: o.status_nome,
      orgao: o.orgao,
      cidade: o.cidade,
      estado: o.estado,
      licitacao_numero: o.licitacao_numero,
      licitacao_data: o.licitacao_data,
      link: linkOportunidade(o.id),
    }));
    return sucesso({ oportunidades, total: oportunidades.length });
  },
};

// ─── obter_oportunidade ─────────────────────────────────────────────────────

const OBTER_OPORTUNIDADE: Ferramenta = {
  def: {
    name: "obter_oportunidade",
    title: "Ler oportunidade",
    description:
      'Lê uma oportunidade desta empresa: campos da licitação, a análise do edital gravada (com os ids das exigências op1, pr1, ec1, rg1…), o "Atende?" atual (sem valores econômicos da empresa) e os arquivos anexados, dizendo se o texto de cada PDF já pode ser lido com ler_edital_anexado.',
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { oportunidade_id: ID_OPORTUNIDADE },
      required: ["oportunidade_id"],
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  async executar(args, { db }) {
    const id = uuidOuNull(args.oportunidade_id);
    if (!id) return naoEncontrado("oportunidade", null);
    const op = await db.porId<Obj>("oportunidade", id, COLUNAS_OBTER);
    if (!op) return naoEncontrado("oportunidade", id);

    const analise = analiseDe(op.edital_analise);
    const atende =
      analise?.atende && typeof analise.atende === "object"
        ? (analise.atende as AtendeResultado)
        : null;
    const valores = atende ? valoresEconomicos(await perfilEconomico(db)) : [];

    const arquivos = await linhas<Obj>(
      db
        .ler("arquivo_oportunidade", "id, nome, categoria, pasta, tipo, tamanho")
        .eq("oportunidade_id", id)
        .order("created_at", { ascending: true })
        .limit(500),
      "os arquivos"
    );
    const textos = arquivos.length
      ? await db.rpc<{ arquivo_id: string; paginas: number; escaneadas: number }[] | null>(
          "conector_texto_disponivel",
          { p_arquivo_ids: arquivos.map((a) => a.id) }
        )
      : [];
    const textoDe = new Map(
      (textos ?? [])
        .filter((t) => Number(t.paginas) > 0)
        .map((t) => [
          String(t.arquivo_id),
          { paginas: Number(t.paginas), escaneadas: Number(t.escaneadas) },
        ])
    );

    const oportunidade: Obj = {
      id,
      link: linkOportunidade(id),
      status_nome: op.status_nome ?? null,
      alertar_prazos: op.alertar_prazos === true,
    };
    for (const c of COLUNAS_OPORTUNIDADE_EDITAL) oportunidade[c] = op[c] ?? null;

    return sucesso(
      {
        oportunidade,
        analise: analise
          ? {
              analisado_em: analise.analisado_em ?? null,
              analisado_por: analise.analisado_por ?? null,
              extraido: analise.extraido ?? null,
              atende: atendeParaConector(atende, valores),
            }
          : null,
        arquivos: arquivos.map((a) => ({
          id: a.id,
          nome: a.nome,
          categoria: a.categoria ?? null,
          pasta: a.pasta ?? null,
          tipo: a.tipo ?? null,
          tamanho: a.tamanho ?? null,
          texto: textoDe.get(String(a.id)) ?? null,
        })),
      },
      { alvo: id }
    );
  },
};

export const FERRAMENTAS_EDITAL: Ferramenta[] = [BUSCAR_OPORTUNIDADES, OBTER_OPORTUNIDADE];
export const INSTRUCOES_EDITAL: string[] = [];
export const PROMPTS_EDITAL: PromptDef[] = [];
