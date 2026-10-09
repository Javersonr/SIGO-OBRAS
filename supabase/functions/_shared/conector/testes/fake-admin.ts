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
  metodo: "createSignedUploadUrl" | "createSignedUrl" | "list" | "remove";
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
} {
  const chamadas: ChamadaFake[] = [];
  const chamadasStorage: ChamadaStorageFake[] = [];

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
        remove: (caminhos: string[]) => chamar("remove", [caminhos]),
      };
    },
  };

  const admin = {
    from: (tabela: string) => consulta(tabela, "select", null),
    rpc: (nome: string, params: unknown) => consulta(nome, "rpc", params ?? {}),
    storage,
  };

  return { admin, chamadas, storage, chamadasStorage };
}
