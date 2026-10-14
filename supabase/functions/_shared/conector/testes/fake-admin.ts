/**
 * Fake encadeável do supabase-js (tabelas, RPC e Storage) para os testes do conector do Claude.
 * Um lugar só para todas as partes do Plano 2. O nome não termina em .test.ts: o node --test
 * não o roda como teste.
 *
 * - Cada consulta executada (o `await`) vira uma ChamadaFake em `chamadas`, na ordem de execução.
 * - `responder(c)` decide a resposta; sem resposta, volta { data: null, error: null } (ou [] quando o
 *   terminal é lista).
 * - O resultado é projetado nas colunas do select (como o PostgREST): um campo que o código esquece
 *   de selecionar chega ausente, e o teste pega.
 * - Não existe delete: código que chamar .delete() quebra no teste.
 * - O Storage guarda os objetos em memória (`objetos`, chave "<bucket>/<caminho>"): `upload`
 *   grava, `download` lê, `remove` apaga. `responderStorage` decide primeiro e pode devolver erro.
 * - `imitarGravarArquivo(banco)` imita a RPC conector_gravar_arquivo (0156) sobre um banco em
 *   memória (`criarBancoArquivosFake`), para os testes provarem troca no lugar, arquivo assinado
 *   mantido, chave de busca com a empresa e exclusão do texto por página do arquivo trocado.
 */
import type { StorageConector } from "../camada-empresa.ts";

export type OpFake = "select" | "insert" | "update" | "rpc";
export interface ChamadaFake {
  tabela: string; // nome da tabela, ou da RPC quando op = "rpc"
  op: OpFake;
  colunas: string | null; // do select(...) ou do select de retorno
  filtros: { metodo: string; args: unknown[] }[]; // eq, neq, in, is, not, gt, gte, lt, lte, ilike, or, order, range, limit
  payload: unknown; // linhas do insert, patch do update, params da rpc
  terminal: "lista" | "maybeSingle" | "single";
}
export interface RespostaFake {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}
export interface ChamadaStorageFake {
  bucket: string;
  metodo: "createSignedUploadUrl" | "createSignedUrl" | "list" | "remove" | "download" | "upload";
  args: unknown[];
}

const FILTROS = [
  "eq",
  "neq",
  "in",
  "is",
  "not",
  "gt",
  "gte",
  "lt",
  "lte",
  "ilike",
  "like",
  "or",
  "contains",
  "order",
  "range",
  "limit",
];

function projetar(data: unknown, colunas: string | null): unknown {
  if (!colunas || colunas.includes("*") || colunas.includes("(")) return data;
  if (data === null || typeof data !== "object") return data;
  const nomes = colunas.split(",").map((c) => c.trim());
  const um = (o: unknown) =>
    o && typeof o === "object" && !Array.isArray(o)
      ? Object.fromEntries(
          nomes
            .filter((c) => c in (o as Record<string, unknown>))
            .map((c) => [c, (o as Record<string, unknown>)[c]])
        )
      : o;
  return Array.isArray(data) ? data.map(um) : um(data);
}

export function criarFakeAdmin(
  responder?: (c: ChamadaFake) => RespostaFake | undefined,
  responderStorage?: (
    c: ChamadaStorageFake
  ) => { data?: unknown; error?: { message: string } | null } | undefined
): {
  // deno-lint-ignore no-explicit-any
  admin: any;
  chamadas: ChamadaFake[];
  storage: StorageConector;
  chamadasStorage: ChamadaStorageFake[];
  objetos: Map<string, Uint8Array>;
} {
  const chamadas: ChamadaFake[] = [];
  const chamadasStorage: ChamadaStorageFake[] = [];
  const objetos = new Map<string, Uint8Array>();

  function consulta(tabela: string, op: OpFake, payload: unknown) {
    const c: ChamadaFake = { tabela, op, colunas: null, filtros: [], payload, terminal: "lista" };
    // deno-lint-ignore no-explicit-any
    const q: any = {
      select(colunas?: string) {
        c.colunas = colunas ?? "*";
        return q;
      },
      insert(linhas: unknown) {
        c.op = "insert";
        c.payload = linhas;
        return q;
      },
      update(patch: unknown) {
        c.op = "update";
        c.payload = patch;
        return q;
      },
      maybeSingle() {
        c.terminal = "maybeSingle";
        return q;
      },
      single() {
        c.terminal = "single";
        return q;
      },
      then(ok: (x: unknown) => unknown, falha?: (e: unknown) => unknown) {
        chamadas.push(c);
        const r = responder?.(c);
        let data = r && "data" in r ? r.data : undefined;
        if (data === undefined) data = c.terminal === "lista" ? [] : null;
        if (c.terminal !== "lista" && Array.isArray(data)) data = data[0] ?? null;
        return Promise.resolve({
          data: r?.error ? null : projetar(data, c.colunas),
          error: r?.error ?? null,
          count: r?.count ?? null,
        }).then(ok, falha);
      },
    };
    for (const metodo of FILTROS) {
      q[metodo] = (...args: unknown[]) => {
        c.filtros.push({ metodo, args });
        return q;
      };
    }
    return q;
  }

  function padraoStorage(c: ChamadaStorageFake): { data: unknown; error: null } {
    const caminho = String(c.args[0] ?? "");
    if (c.metodo === "createSignedUploadUrl") {
      const token = `tok-${chamadasStorage.length}`;
      return {
        data: {
          signedUrl: `https://storage.test/object/upload/sign/${c.bucket}/${caminho}?token=${token}`,
          token,
          path: caminho,
        },
        error: null,
      };
    }
    if (c.metodo === "createSignedUrl") {
      return {
        data: {
          signedUrl: `https://storage.test/object/sign/${c.bucket}/${caminho}?token=leitura`,
        },
        error: null,
      };
    }
    return { data: [], error: null };
  }

  const storage: StorageConector = {
    from(bucket: string) {
      const chamar = (metodo: ChamadaStorageFake["metodo"], args: unknown[]) => {
        const c: ChamadaStorageFake = { bucket, metodo, args };
        chamadasStorage.push(c);
        const r = responderStorage?.(c);
        const base = padraoStorage(c);
        return Promise.resolve({
          data: r && "data" in r ? r.data : r?.error ? null : base.data,
          error: r?.error ?? null,
          // deno-lint-ignore no-explicit-any
        }) as Promise<any>;
      };
      return {
        createSignedUploadUrl: (caminho: string) => chamar("createSignedUploadUrl", [caminho]),
        createSignedUrl: (caminho: string, segundos: number) =>
          chamar("createSignedUrl", [caminho, segundos]),
        list: (pasta: string, opcoes: { search: string; limit: number }) =>
          chamar("list", [pasta, opcoes]),
        remove: async (caminhos: string[]) => {
          const r = await chamar("remove", [caminhos]);
          if (!r.error) for (const p of caminhos) objetos.delete(`${bucket}/${p}`);
          return r;
        },
        download: async (caminho: string) => {
          const c: ChamadaStorageFake = { bucket, metodo: "download", args: [caminho] };
          chamadasStorage.push(c);
          const r = responderStorage?.(c);
          if (r) return { data: (r.data ?? null) as Blob | null, error: r.error ?? null };
          const bytes = objetos.get(`${bucket}/${caminho}`);
          return bytes
            ? { data: new Blob([bytes as BlobPart]), error: null }
            : { data: null, error: { message: "Object not found" } };
        },
        upload: async (
          caminho: string,
          corpo: Blob | Uint8Array,
          opcoes: { contentType: string; upsert: boolean }
        ) => {
          const c: ChamadaStorageFake = {
            bucket,
            metodo: "upload",
            args: [caminho, corpo, opcoes],
          };
          chamadasStorage.push(c);
          const r = responderStorage?.(c);
          if (r?.error) return { data: null, error: r.error };
          // como o Storage de verdade: sem upsert, objeto que já existe é recusado
          if (!opcoes.upsert && objetos.has(`${bucket}/${caminho}`)) {
            return { data: null, error: { message: "The resource already exists" } };
          }
          const bytes =
            corpo instanceof Uint8Array ? corpo : new Uint8Array(await corpo.arrayBuffer());
          objetos.set(`${bucket}/${caminho}`, bytes);
          return { data: { path: caminho }, error: null };
        },
      };
    },
  };

  const admin = {
    from: (tabela: string) => consulta(tabela, "select", null),
    rpc: (nome: string, params: unknown) => consulta(nome, "rpc", params ?? {}),
    storage,
  };

  return { admin, chamadas, storage, chamadasStorage, objetos };
}

// ─── conector_gravar_arquivo (0156) em memória ──────────────────────────────────────────

/** Só as colunas de arquivo_oportunidade que a RPC lê ou grava. */
export interface ArquivoOportunidadeFake {
  id: string;
  empresa_id: string;
  oportunidade_id: string;
  nome: string;
  url: string;
  tipo: string | null;
  tamanho: number | null;
  pasta: string | null;
  categoria: string | null;
  origem: string | null;
  assinatura: string | null;
  usuario_nome: string | null;
  deleted_at: string | null;
}
/** arquivo_texto_pagina (0149): o texto por página que o ler_edital_anexado devolve. */
export interface PaginaTextoFake {
  id: string;
  empresa_id: string;
  arquivo_id: string;
  deleted_at: string | null;
}
export interface OportunidadeFake {
  id: string;
  empresa_id: string;
  deleted_at: string | null;
}
export interface BancoArquivosFake {
  oportunidades: OportunidadeFake[];
  arquivos: ArquivoOportunidadeFake[];
  paginasTexto: PaginaTextoFake[];
}

export function criarBancoArquivosFake(
  parcial: Partial<BancoArquivosFake> = {}
): BancoArquivosFake {
  return {
    oportunidades: parcial.oportunidades ?? [],
    arquivos: parcial.arquivos ?? [],
    paginasTexto: parcial.paginasTexto ?? [],
  };
}

/**
 * Os 11 parâmetros da função SQL public.conector_gravar_arquivo (0156), na ordem dela. O PostgREST acha a
 * função pelo CONJUNTO de nomes: um a mais, a menos ou errado dá PGRST202. Um teste lê a 0156 e confere
 * que esta lista continua igual à assinatura do SQL.
 */
export const PARAMETROS_GRAVAR_ARQUIVO: readonly string[] = Object.freeze([
  "p_empresa_id",
  "p_oportunidade_id",
  "p_origem",
  "p_nome",
  "p_url",
  "p_tipo",
  "p_tamanho",
  "p_pasta",
  "p_categoria",
  "p_assinatura",
  "p_usuario_nome",
]);

/**
 * As validações que o banco faz antes de gravar, para a chamada da RPC conector_gravar_arquivo `c`:
 * null se o banco aceitaria; senão a RespostaFake de erro que ele daria. Usada por imitarGravarArquivo e
 * pela resposta padrão de montarDeps (mcp/testes), para um teste verde não esconder chamada que o banco
 * recusaria.
 *  - conjunto de parâmetros diferente dos 11 → PGRST202 ("Could not find the function …");
 *  - 22023: empresa/oportunidade nulas; origem sem caractere visível ou acima de 200; nome sem caractere
 *    visível; url fora de "anexos-oportunidade/<empresa>/<algo>" ou com SEGMENTO "." ou ".." ("Ltda..pdf"
 *    passa); assinatura diferente de nulo/"pendente".
 */
export function recusaGravarArquivo(c: ChamadaFake): RespostaFake | null {
  const p = (c.payload ?? {}) as Record<string, unknown>;
  // parâmetro `undefined` não vai no JSON do supabase-js: para o PostgREST é como se não existisse
  const recebidos = Object.keys(p)
    .filter((nome) => p[nome] !== undefined)
    .sort();
  const esperados = [...PARAMETROS_GRAVAR_ARQUIVO].sort();
  if (recebidos.length !== esperados.length || recebidos.some((nome, i) => nome !== esperados[i])) {
    return {
      error: {
        message: `Could not find the function public.conector_gravar_arquivo(${recebidos.join(", ")}) in the schema cache`,
        code: "PGRST202",
      },
    };
  }
  const recusa = (message: string): RespostaFake => ({ error: { message, code: "22023" } });
  const visivel = (v: unknown) => typeof v === "string" && /\S/.test(v);
  const empresa = p.p_empresa_id;
  if (empresa == null || p.p_oportunidade_id == null) {
    return recusa("empresa e oportunidade são obrigatórias");
  }
  if (!visivel(p.p_origem) || String(p.p_origem).length > 200) return recusa("origem inválida");
  if (!visivel(p.p_nome)) return recusa("nome inválido");
  const url = p.p_url;
  const prefixo = `anexos-oportunidade/${String(empresa).toLowerCase()}/`;
  if (
    typeof url !== "string" ||
    !url.startsWith(prefixo) ||
    url.length <= prefixo.length ||
    /(^|\/)\.{1,2}(\/|$)/.test(url)
  ) {
    return recusa("arquivo fora da pasta da empresa");
  }
  if (p.p_assinatura != null && p.p_assinatura !== "pendente") {
    return recusa("assinatura inválida");
  }
  return null;
}

/**
 * Responder para o criarFakeAdmin que imita a RPC conector_gravar_arquivo (migração 0156) sobre `banco`:
 *  - confere o CONJUNTO de parâmetros (exatamente os 11 da função SQL): nome a mais, a menos ou errado →
 *    erro PGRST202, como o PostgREST responderia em produção (recusaGravarArquivo);
 *  - recusa (erro 22023) empresa/oportunidade nulas, origem ou nome sem caractere visível, origem acima de
 *    200, url fora de "anexos-oportunidade/<empresa>/<algo>" ou com SEGMENTO "." ou ".." ("Ltda..pdf" passa)
 *    e assinatura diferente de nulo/"pendente";
 *  - oportunidade de outra empresa, excluída ou inexistente → { ok: false, motivo: "nao_encontrada" };
 *  - procura o arquivo por (empresa, oportunidade, origem) entre as linhas vivas;
 *  - assinado → mantido (nada muda, o texto fica); senão troca no lugar (mesmo id, ref_anterior = a url
 *    de antes) e exclui (deleted_at) as páginas de texto vivas do arquivo, na mesma empresa;
 *  - sem arquivo → linha nova com id novo.
 * Devolve undefined para qualquer outra chamada: componha com `?? responderDoTeste(c)`.
 */
export function imitarGravarArquivo(
  banco: BancoArquivosFake,
  agora: () => string = () => new Date().toISOString()
): (c: ChamadaFake) => RespostaFake | undefined {
  let n = 0;
  const igual = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();

  return (c) => {
    if (c.op !== "rpc" || c.tabela !== "conector_gravar_arquivo") return undefined;
    const recusada = recusaGravarArquivo(c);
    if (recusada) return recusada;
    const p = c.payload as Record<string, unknown>;
    const empresa = p.p_empresa_id;
    const oportunidade = p.p_oportunidade_id;
    const url = p.p_url as string;

    const achou = banco.oportunidades.some(
      (o) => igual(o.id, oportunidade) && igual(o.empresa_id, empresa) && o.deleted_at == null
    );
    if (!achou) return { data: { ok: false, motivo: "nao_encontrada" } };

    const atual = banco.arquivos.find(
      (a) =>
        igual(a.empresa_id, empresa) &&
        igual(a.oportunidade_id, oportunidade) &&
        a.origem === p.p_origem &&
        a.deleted_at == null
    );
    if (atual) {
      if (atual.assinatura === "assinado") {
        return {
          data: {
            ok: true,
            arquivo_id: atual.id,
            substituiu: false,
            mantido_assinado: true,
            ref_anterior: null,
          },
        };
      }
      const refAnterior = atual.url;
      atual.nome = String(p.p_nome);
      atual.url = url;
      atual.tipo = (p.p_tipo as string | null) ?? null;
      atual.tamanho = (p.p_tamanho as number | null) ?? null;
      atual.pasta = (p.p_pasta as string | null) ?? null;
      atual.categoria = (p.p_categoria as string | null) ?? null;
      atual.assinatura = (p.p_assinatura as string | null) ?? null;
      atual.usuario_nome = (p.p_usuario_nome as string | null) ?? null;
      for (const pg of banco.paginasTexto) {
        if (igual(pg.empresa_id, empresa) && pg.arquivo_id === atual.id && pg.deleted_at == null) {
          pg.deleted_at = agora();
        }
      }
      return {
        data: {
          ok: true,
          arquivo_id: atual.id,
          substituiu: true,
          mantido_assinado: false,
          ref_anterior: refAnterior,
        },
      };
    }

    const id = `00000000-0000-4000-9000-${String(++n).padStart(12, "0")}`;
    banco.arquivos.push({
      id,
      empresa_id: String(empresa).toLowerCase(),
      oportunidade_id: String(oportunidade).toLowerCase(),
      nome: String(p.p_nome),
      url,
      tipo: (p.p_tipo as string | null) ?? null,
      tamanho: (p.p_tamanho as number | null) ?? null,
      pasta: (p.p_pasta as string | null) ?? null,
      categoria: (p.p_categoria as string | null) ?? null,
      origem: String(p.p_origem),
      assinatura: (p.p_assinatura as string | null) ?? null,
      usuario_nome: (p.p_usuario_nome as string | null) ?? null,
      deleted_at: null,
    });
    return {
      data: {
        ok: true,
        arquivo_id: id,
        substituiu: false,
        mantido_assinado: false,
        ref_anterior: null,
      },
    };
  };
}
