/**
 * Camada de dados do conector do Claude, presa à empresa da chave (spec 25/09 §3, o "ponto mais
 * sensível" do desenho). A chave opaca não é JWT, então não há RLS do usuário: o mcp usa service
 * role, e TODO acesso das ferramentas a tabela passa por aqui.
 *
 * - Lista fechada de tabelas e de RPCs: o resto lança antes de chegar ao banco.
 * - Toda leitura e toda atualização filtram por `empresa_id = <empresa da chave>` (e por
 *   `deleted_at is null`, quando a tabela tem exclusão lógica).
 * - Todo INSERT grava `empresa_id = <empresa da chave>`; um `empresa_id` diferente na linha lança.
 * - Toda RPC recebe `p_empresa_id = <empresa da chave>`, injetado aqui.
 * - Não existe método de exclusão.
 *
 * Puro (banco injetado): roda no Deno e no Node (node --test).
 */

// deno-lint-ignore no-explicit-any
export type Admin = any;
// deno-lint-ignore no-explicit-any
export type Consulta = any; // PostgrestFilterBuilder do supabase-js

export const TABELAS_DA_EMPRESA = [
  "oportunidade",
  "oportunidade_atualizacao",
  "status_oportunidade",
  "arquivo_oportunidade",
  "arquivo_texto_pagina",
  "acervo_perfil",
  "acervo_profissional",
  "acervo_atestado",
  "acervo_quantitativo",
  "orcamento_item",
  "proposta_oportunidade",
  "mcp_link_envio",
] as const;
export type TabelaDaEmpresa = (typeof TABELAS_DA_EMPRESA)[number];

/** Tabelas sem deleted_at: o filtro `deleted_at is null` não é aplicado. */
export const TABELAS_SEM_EXCLUSAO_LOGICA: ReadonlySet<TabelaDaEmpresa> = new Set<TabelaDaEmpresa>([
  "mcp_link_envio",
]);

export const RPCS_DA_EMPRESA = [
  "edital_analise_mesclar",
  "edital_analise_anexar_arquivos",
  "conector_texto_disponivel",
  "conector_buscar_oportunidades",
  "conector_cadastrar_atestado",
  "conector_substituir_orcamento",
  "conector_aplicar_desconto",
] as const;
export type RpcDaEmpresa = (typeof RPCS_DA_EMPRESA)[number];

export type CodigoErroCamada =
  | "tabela_nao_permitida"
  | "rpc_nao_permitida"
  | "campo_proibido"
  | "id_invalido"
  | "banco";

export class ErroCamada extends Error {
  codigo: CodigoErroCamada;
  constructor(codigo: CodigoErroCamada, mensagem: string) {
    super(mensagem);
    this.name = "ErroCamada";
    this.codigo = codigo;
  }
}

export interface CamadaEmpresa {
  readonly empresaId: string;
  /** select(colunas) já com .eq("empresa_id", empresaId) e, se a tabela tiver, .is("deleted_at", null). */
  ler(tabela: TabelaDaEmpresa, colunas: string, opcoes?: { incluirExcluidos?: boolean }): Consulta;
  /** Todas as linhas, paginando de 1000 em 1000 (.order("id").range); `filtrar` acrescenta filtros. Lança ErroCamada("banco") se passar de `limite`. */
  lerTodos<T = Record<string, unknown>>(
    tabela: TabelaDaEmpresa,
    colunas: string,
    filtrar?: (q: Consulta) => Consulta,
    limite?: number
  ): Promise<T[]>;
  /** Linha da empresa por id (null se não existe, se é de outra empresa ou se o id não é UUID). */
  porId<T = Record<string, unknown>>(
    tabela: TabelaDaEmpresa,
    id: string,
    colunas: string
  ): Promise<T | null>;
  /**
   * INSERT com empresa_id = empresaId SEMPRE (sobrescreve o que vier).
   * Linha com "id", "empresa_id" divergente, "created_at" ou "deleted_at" → ErroCamada("campo_proibido").
   */
  inserir<T = Record<string, unknown>>(
    tabela: TabelaDaEmpresa,
    linhas: Record<string, unknown>[],
    colunasRetorno?: string
  ): Promise<T[]>;
  /**
   * UPDATE … where id = $id and empresa_id = empresaId [and deleted_at is null]; `condicao` acrescenta filtros
   * (ex.: q => q.is("usado_em", null).gt("expira_em", agoraIso)). Devolve a linha ou null (nada casou).
   * patch com id, empresa_id, created_at ou deleted_at → ErroCamada("campo_proibido").
   */
  atualizar<T = Record<string, unknown>>(
    tabela: TabelaDaEmpresa,
    id: string,
    patch: Record<string, unknown>,
    colunasRetorno?: string,
    condicao?: (q: Consulta) => Consulta
  ): Promise<T | null>;
  /** RPC com p_empresa_id = empresaId injetado; params com p_empresa_id → ErroCamada("campo_proibido"). */
  rpc<T = unknown>(nome: RpcDaEmpresa, params: Record<string, unknown>): Promise<T>;
}

/** Só o Storage que as ferramentas usam (injetado: admin.storage em produção, fake nos testes). */
export interface StorageConector {
  from(bucket: string): {
    createSignedUploadUrl(caminho: string): Promise<{
      data: { signedUrl: string; token: string; path: string } | null;
      error: { message: string } | null;
    }>;
    createSignedUrl(
      caminho: string,
      segundos: number
    ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    list(
      pasta: string,
      opcoes: { search: string; limit: number }
    ): Promise<{
      data: { name: string; metadata: { size?: number; mimetype?: string } | null }[] | null;
      error: { message: string } | null;
    }>;
    remove(caminhos: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGINA = 1000;
const LIMITE_PADRAO = 20000;
const CAMPOS_PROIBIDOS_INSERT = ["id", "created_at", "deleted_at"];
const CAMPOS_PROIBIDOS_UPDATE = ["id", "empresa_id", "created_at", "deleted_at"];

function exigirTabela(tabela: string): TabelaDaEmpresa {
  if (!(TABELAS_DA_EMPRESA as readonly string[]).includes(tabela)) {
    throw new ErroCamada("tabela_nao_permitida", `Tabela fora da camada do conector: ${tabela}`);
  }
  return tabela as TabelaDaEmpresa;
}

/** Resposta do supabase-js → dados, ou ErroCamada("banco") com a mensagem do banco. */
export function dadosOuErro<T>(r: { data: T | null; error: { message: string } | null }): T | null {
  if (r.error) throw new ErroCamada("banco", r.error.message);
  return r.data ?? null;
}

/** empresaId que não é UUID → ErroCamada("id_invalido"). Não existe método de exclusão. */
export function camadaDaEmpresa(admin: Admin, empresaId: string): CamadaEmpresa {
  if (typeof empresaId !== "string" || !UUID.test(empresaId)) {
    throw new ErroCamada("id_invalido", "Empresa da chave inválida");
  }
  const empresa = empresaId.toLowerCase();

  const ler = (
    tabela: TabelaDaEmpresa,
    colunas: string,
    opcoes: { incluirExcluidos?: boolean } = {}
  ): Consulta => {
    const t = exigirTabela(tabela);
    let q = admin.from(t).select(colunas).eq("empresa_id", empresa);
    if (!TABELAS_SEM_EXCLUSAO_LOGICA.has(t) && !opcoes.incluirExcluidos)
      q = q.is("deleted_at", null);
    return q;
  };

  return {
    empresaId: empresa,
    ler,

    async lerTodos<T = Record<string, unknown>>(
      tabela: TabelaDaEmpresa,
      colunas: string,
      filtrar?: (q: Consulta) => Consulta,
      limite = LIMITE_PADRAO
    ): Promise<T[]> {
      const todas: T[] = [];
      for (let de = 0; ; de += PAGINA) {
        let q = ler(tabela, colunas);
        if (filtrar) q = filtrar(q);
        const pagina = (dadosOuErro<T[]>(await q.order("id").range(de, de + PAGINA - 1)) ??
          []) as T[];
        todas.push(...pagina);
        if (todas.length > limite) {
          throw new ErroCamada("banco", `Mais de ${limite} linhas em ${tabela}`);
        }
        if (pagina.length < PAGINA) return todas;
      }
    },

    async porId<T = Record<string, unknown>>(
      tabela: TabelaDaEmpresa,
      id: string,
      colunas: string
    ): Promise<T | null> {
      exigirTabela(tabela);
      if (typeof id !== "string" || !UUID.test(id)) return null;
      return dadosOuErro<T>(await ler(tabela, colunas).eq("id", id.toLowerCase()).maybeSingle());
    },

    async inserir<T = Record<string, unknown>>(
      tabela: TabelaDaEmpresa,
      linhas: Record<string, unknown>[],
      colunasRetorno = "id"
    ): Promise<T[]> {
      const t = exigirTabela(tabela);
      if (!linhas.length) return [];
      const prontas = linhas.map((linha) => {
        const proibido = CAMPOS_PROIBIDOS_INSERT.find((c) => c in linha);
        if (proibido)
          throw new ErroCamada("campo_proibido", `Campo não aceito no INSERT: ${proibido}`);
        const vindo = linha.empresa_id;
        if (vindo !== undefined && String(vindo).toLowerCase() !== empresa) {
          throw new ErroCamada("campo_proibido", "empresa_id diferente da empresa da chave");
        }
        return { ...linha, empresa_id: empresa };
      });
      return (dadosOuErro<T[]>(await admin.from(t).insert(prontas).select(colunasRetorno)) ??
        []) as T[];
    },

    async atualizar<T = Record<string, unknown>>(
      tabela: TabelaDaEmpresa,
      id: string,
      patch: Record<string, unknown>,
      colunasRetorno = "id",
      condicao?: (q: Consulta) => Consulta
    ): Promise<T | null> {
      const t = exigirTabela(tabela);
      const proibido = CAMPOS_PROIBIDOS_UPDATE.find((c) => c in patch);
      if (proibido)
        throw new ErroCamada("campo_proibido", `Campo não aceito no UPDATE: ${proibido}`);
      if (typeof id !== "string" || !UUID.test(id)) return null;
      let q = admin.from(t).update(patch).eq("id", id.toLowerCase()).eq("empresa_id", empresa);
      if (!TABELAS_SEM_EXCLUSAO_LOGICA.has(t)) q = q.is("deleted_at", null);
      if (condicao) q = condicao(q);
      return dadosOuErro<T>(await q.select(colunasRetorno).maybeSingle());
    },

    async rpc<T = unknown>(nome: RpcDaEmpresa, params: Record<string, unknown>): Promise<T> {
      if (!(RPCS_DA_EMPRESA as readonly string[]).includes(nome)) {
        throw new ErroCamada("rpc_nao_permitida", `RPC fora da camada do conector: ${nome}`);
      }
      if ("p_empresa_id" in params) {
        throw new ErroCamada("campo_proibido", "p_empresa_id vem da chave, não dos parâmetros");
      }
      const r = await admin.rpc(nome, { ...params, p_empresa_id: empresa });
      return dadosOuErro<T>(r) as T;
    },
  };
}
