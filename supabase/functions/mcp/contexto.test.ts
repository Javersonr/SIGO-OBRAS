// node --test supabase/functions/mcp/contexto.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deveGravarUltimoUso,
  resolverChave as resolverChaveComLog,
  ufDaEmpresa,
} from "./contexto.ts";

/** resolverChave sem o console.error de "indisponivel" sujando a saída dos testes. */
async function resolverChave(...args: Parameters<typeof resolverChaveComLog>) {
  const original = console.error;
  console.error = () => {};
  try {
    return await resolverChaveComLog(...args);
  } finally {
    console.error = original;
  }
}

type Resposta = { data?: unknown; error?: { message: string } | null };

/** Só as colunas pedidas no select (como o PostgREST): um campo que o código
 *  esquece de selecionar chega como ausente, e o teste pega. */
function projetar(data: unknown, colunas: string[] | null): unknown {
  if (!colunas || data === null || typeof data !== "object") return data;
  const um = (o: Record<string, unknown>) =>
    Object.fromEntries(colunas.filter((c) => c in o).map((c) => [c, o[c]]));
  return Array.isArray(data) ? data.map(um) : um(data as Record<string, unknown>);
}

/** Fake admin encadeável: cada tabela devolve {data, error} pré-configurados,
 *  independente da cadeia select/eq/in/is/order/limit/maybeSingle/update usada
 *  (mas respeitando as colunas do select). */
function fakeAdmin(respostas: Record<string, Resposta>) {
  const chamadas: string[] = [];
  return {
    chamadas,
    from(tabela: string) {
      chamadas.push(tabela);
      let colunas: string[] | null = null;
      // deno-lint-ignore no-explicit-any
      const q: any = {
        select(cols?: string) {
          if (typeof cols === "string" && !cols.includes("*")) {
            colunas = cols.split(",").map((c) => c.trim());
          }
          return q;
        },
        eq() {
          return q;
        },
        in() {
          return q;
        },
        is() {
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        update() {
          return q;
        },
        maybeSingle() {
          return q;
        },
        then(ok: (x: unknown) => unknown, falha?: (e: unknown) => unknown) {
          const r = respostas[tabela] ?? { data: null, error: null };
          return Promise.resolve({
            data: projetar(r.data ?? null, colunas),
            error: r.error ?? null,
          }).then(ok, falha);
        },
      };
      return q;
    },
  };
}

const FUTURO = new Date(Date.now() + 3_600_000).toISOString();

/** Conjunto de respostas de um caminho feliz completo; os testes sobrescrevem
 *  o que precisam por teste. */
function respostasFeliz(overrides: Record<string, Resposta> = {}): Record<string, Resposta> {
  return {
    conector_chave: { data: { autorizacao_id: "aut1", expira_em: FUTURO, revogada_em: null } },
    conector_autorizacao: {
      data: {
        id: "aut1",
        empresa_id: "e1",
        usuario_custom_id: "u1",
        usuario_email: "user@x.com",
        cliente_id: null,
        tipo: "oauth",
        revogado_em: null,
      },
    },
    usuario_custom: {
      data: {
        id: "u1",
        email: "User@X.com",
        nome_completo: "Fulano",
        ativo: true,
        deleted_at: null,
      },
    },
    usuario_empresa: {
      data: {
        id: "v1",
        perfil: "Usuario",
        is_owner: false,
        permissoes: {},
        ativo: true,
        deleted_at: null,
      },
    },
    empresa: {
      data: {
        id: "e1",
        nome: "Empresa Nome",
        nome_fantasia: null,
        cnpj: "123",
        estado: "mg",
        ativo: true,
        deleted_at: null,
        conector_claude: true,
      },
    },
    assinatura: { data: [{ plano_id: "p1" }] },
    plano: { data: [{ modulos_liberados: { Oportunidades: true } }] },
    ...overrides,
  };
}

test("chave com prefixo errado → chave_invalida sem consultar o banco", async () => {
  const admin = fakeAdmin({});
  const r = await resolverChave(admin, "chave_qualquer_sem_prefixo");
  assert.deepEqual(r, { ok: false, motivo: "chave_invalida" });
  assert.equal(admin.chamadas.length, 0);
});

test("erro na consulta de conector_chave → indisponivel", async () => {
  const admin = fakeAdmin({ conector_chave: { error: { message: "timeout no pooler" } } });
  const r = await resolverChave(admin, "sigo_at_x");
  assert.deepEqual(r, { ok: false, motivo: "indisponivel" });
});

test("chave não encontrada → chave_invalida", async () => {
  const admin = fakeAdmin({ conector_chave: { data: null, error: null } });
  const r = await resolverChave(admin, "sigo_at_x");
  assert.deepEqual(r, { ok: false, motivo: "chave_invalida" });
});

test("erro em uma das consultas do Promise.all (empresa) → indisponivel", async () => {
  const admin = fakeAdmin(respostasFeliz({ empresa: { error: { message: "conexão perdida" } } }));
  const r = await resolverChave(admin, "sigo_at_x");
  assert.deepEqual(r, { ok: false, motivo: "indisponivel" });
});

test("caminho feliz → ok com ctx.empresa.id e ctx.usuario.email corretos", async () => {
  const admin = fakeAdmin(respostasFeliz());
  const r = await resolverChave(admin, "sigo_at_x");
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("esperava ok:true");
  assert.equal(r.ctx.empresa.id, "e1");
  assert.equal(r.ctx.usuario.email, "user@x.com");
});

/** Autorização criada em `criado` + usuário com senha trocada em `troca`. */
function comTrocaDeSenha(criado: string, troca: string | null) {
  const felizes = respostasFeliz();
  return respostasFeliz({
    conector_autorizacao: {
      data: { ...(felizes.conector_autorizacao.data as object), criado_em: criado },
    },
    usuario_custom: {
      data: { ...(felizes.usuario_custom.data as object), senha_alterada_em: troca },
    },
  });
}

test("senha trocada DEPOIS da autorização → chave_invalida (revogação implícita, sem auditoria)", async () => {
  const admin = fakeAdmin(comTrocaDeSenha("2026-09-20T10:00:00+00:00", "2026-09-25T10:00:00Z"));
  const r = await resolverChave(admin, "sigo_at_x");
  assert.equal(r.ok, false);
  if (r.ok) throw new Error("esperava ok:false");
  assert.equal(r.motivo, "chave_invalida");
});

test("autorização criada depois da troca de senha → ok", async () => {
  const admin = fakeAdmin(comTrocaDeSenha("2026-09-26T10:00:00+00:00", "2026-09-25T10:00:00Z"));
  const r = await resolverChave(admin, "sigo_at_x");
  assert.equal(r.ok, true);
});

test("cliente claude aparece como 'Claude' na auditoria (client_name do DCR ignorado)", async () => {
  const felizes = respostasFeliz();
  const admin = fakeAdmin(
    respostasFeliz({
      conector_autorizacao: {
        data: { ...(felizes.conector_autorizacao.data as object), cliente_id: "c1" },
      },
      conector_cliente: {
        data: { nome: "Claude — Suporte SIGO: clique em Permitir", tipo: "claude" },
      },
    })
  );
  const r = await resolverChave(admin, "sigo_at_x");
  if (!r.ok) throw new Error("esperava ok:true");
  assert.equal(r.ctx.cliente, "Claude");
});

test("erro ao ler usuario_custom → indisponivel (não vira chave_invalida)", async () => {
  const admin = fakeAdmin(
    respostasFeliz({ usuario_custom: { error: { message: "statement timeout" } } })
  );
  const r = await resolverChave(admin, "sigo_at_x");
  assert.deepEqual(r, { ok: false, motivo: "indisponivel" });
});

test("usuário desativado → { ok:false, motivo:'usuario_inativo' }", async () => {
  const admin = fakeAdmin(
    respostasFeliz({
      usuario_custom: {
        data: {
          id: "u1",
          email: "User@X.com",
          nome_completo: "Fulano",
          ativo: false,
          deleted_at: null,
        },
      },
    })
  );
  const r = await resolverChave(admin, "sigo_at_x");
  assert.equal(r.ok, false);
  if (r.ok) throw new Error("esperava ok:false");
  assert.equal(r.motivo, "usuario_inativo");
});

test("erro ao ler conector_autorizacao → indisponivel", async () => {
  const admin = fakeAdmin(
    respostasFeliz({ conector_autorizacao: { error: { message: "pooler" } } })
  );
  assert.deepEqual(await resolverChave(admin, "sigo_at_x"), { ok: false, motivo: "indisponivel" });
});

test("erro ao ler plano → indisponivel", async () => {
  const admin = fakeAdmin(respostasFeliz({ plano: { error: { message: "timeout" } } }));
  assert.deepEqual(await resolverChave(admin, "sigo_at_x"), { ok: false, motivo: "indisponivel" });
});

test("erro ao ler conector_cliente → indisponivel", async () => {
  const felizes = respostasFeliz();
  const admin = fakeAdmin(
    respostasFeliz({
      conector_autorizacao: {
        data: { ...(felizes.conector_autorizacao.data as object), cliente_id: "c1" },
      },
      conector_cliente: { error: { message: "conexão perdida" } },
    })
  );
  assert.deepEqual(await resolverChave(admin, "sigo_at_x"), { ok: false, motivo: "indisponivel" });
});

test("ctx: vinculoId do usuario_empresa, uf da empresa e nome que cai para o e-mail", async () => {
  const felizes = respostasFeliz();
  const admin = fakeAdmin(
    respostasFeliz({
      usuario_custom: {
        data: { ...(felizes.usuario_custom.data as object), nome_completo: null },
      },
    })
  );
  const r = await resolverChave(admin, "sigo_at_x");
  if (!r.ok) throw new Error("esperava ok:true");
  assert.equal(r.ctx.vinculoId, "v1");
  assert.equal(r.ctx.empresa.uf, "MG");
  assert.equal(r.ctx.usuario.nome, "user@x.com");
});

test("ufDaEmpresa: duas letras maiúsculas ou null", () => {
  assert.equal(ufDaEmpresa(" sp "), "SP");
  assert.equal(ufDaEmpresa(null), null);
  assert.equal(ufDaEmpresa(""), null);
  assert.equal(ufDaEmpresa("1"), null);
});

test("ultimo_uso: só regrava se nulo ou com mais de 5 min", async () => {
  const agora = new Date("2026-10-08T12:00:00Z");
  assert.equal(deveGravarUltimoUso(null, agora), true);
  assert.equal(deveGravarUltimoUso("2026-10-08T11:56:00Z", agora), false);
  assert.equal(deveGravarUltimoUso("2026-10-08T11:54:59Z", agora), true);
  const felizes = respostasFeliz();
  const recente = fakeAdmin(
    respostasFeliz({
      conector_autorizacao: {
        data: {
          ...(felizes.conector_autorizacao.data as object),
          ultimo_uso: new Date(Date.now() - 60_000).toISOString(),
        },
      },
    })
  );
  await resolverChave(recente, "sigo_at_x");
  assert.equal(recente.chamadas.filter((t) => t === "conector_autorizacao").length, 1);
  const nunca = fakeAdmin(respostasFeliz());
  await resolverChave(nunca, "sigo_at_x");
  assert.equal(nunca.chamadas.filter((t) => t === "conector_autorizacao").length, 2);
});
