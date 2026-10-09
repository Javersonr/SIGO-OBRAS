// node --test supabase/functions/mcp/despacho.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { alvoDosArgs, despachar, type DepsDespacho, type LinhaAuditoria } from "./despacho.ts";
import { falha, sucesso, type DepsFerramenta, type Ferramenta } from "./registro.ts";
import { camadaDaEmpresa, ErroCamada } from "../_shared/conector/camada-empresa.ts";
import { criarFakeAdmin } from "../_shared/conector/testes/fake-admin.ts";
import { MSG_MUITAS_TENTATIVAS, type Consumo } from "../_shared/limite-tentativas.ts";
import type { Vinculo } from "../_shared/conector/acesso.ts";

const E = "00000000-0000-4000-8000-000000000001";
const OP = "00000000-0000-4000-8000-000000000010";

function ferramenta(
  nome: string,
  leitura: boolean,
  executar: Ferramenta["executar"] = async () => sucesso({ ok: true })
): Ferramenta & { chamadas: number } {
  const f = {
    chamadas: 0,
    def: {
      name: nome,
      title: nome,
      description: nome,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          oportunidade_id: { type: "string" },
          itens: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { exigencia_id: { type: "string" } },
            },
          },
          texto: { type: "string" },
        },
        required: [],
      },
      annotations: { readOnlyHint: leitura, openWorldHint: false },
    },
    async executar(args: Record<string, unknown>, deps: DepsFerramenta) {
      f.chamadas++;
      return await executar(args, deps);
    },
  };
  return f;
}

function montar(
  vinculo: Vinculo,
  ferramentas: Ferramenta[],
  consumo: Consumo = { permitido: true, chaves: {} }
) {
  const limites: { nome: string; leitura: boolean }[] = [];
  const auditoria: LinhaAuditoria[] = [];
  const { admin, storage } = criarFakeAdmin();
  const deps: DepsFerramenta = {
    ctx: {
      autorizacaoId: "00000000-0000-4000-8000-0000000000a1",
      cliente: "Claude",
      usuario: { id: "00000000-0000-4000-8000-0000000000b1", email: "u@exemplo.test", nome: "U" },
      empresa: { id: E, nome: "Empresa Teste", cnpj: null, uf: "MG" },
      vinculo,
      vinculoId: "00000000-0000-4000-8000-0000000000c1",
    },
    db: camadaDaEmpresa(admin, E),
    storage,
    fetchFn: fetch,
    agora: new Date("2026-10-08T12:00:00Z"),
  };
  const d: DepsDespacho = {
    ferramentas,
    deps,
    consumirLimite: async (nome, leitura) => {
      limites.push({ nome, leitura });
      return consumo;
    },
    auditar: async (linha) => {
      auditoria.push(linha);
    },
  };
  return { d, limites, auditoria };
}

const LEITOR: Vinculo = {
  perfil: "Usuario",
  ativo: true,
  permissoes: { Oportunidades: { Lista: { visualizar: true } } },
};
const EDITOR: Vinculo = {
  perfil: "Usuario",
  ativo: true,
  permissoes: { Oportunidades: { Lista: { visualizar: true, editar: true } } },
};

const sc = (r: { structuredContent?: unknown }) => r.structuredContent as Record<string, unknown>;

test("sem permissão: nega, audita sem_permissao com o alvo e NÃO consome o limite", async () => {
  const f = ferramenta("adicionar_nota", false);
  const { d, limites, auditoria } = montar(LEITOR, [f]);
  const r = await despachar("adicionar_nota", { oportunidade_id: OP, texto: "x" }, d);
  assert.equal(r.isError, true);
  assert.deepEqual(sc(r), {
    erro: "Seu usuário não tem a permissão Oportunidades → Lista → editar no SIGO.",
    motivo: "sem_permissao",
    permissao_necessaria: "Oportunidades → Lista → editar",
  });
  assert.equal(limites.length, 0);
  assert.equal(f.chamadas, 0);
  assert.deepEqual(auditoria, [
    { ferramenta: "adicionar_nota", resultado: "negado", motivo: "sem_permissao", alvo: OP },
  ]);
});

test("limite indisponível: recusa sem auditoria", async () => {
  const f = ferramenta("obter_oportunidade", true);
  const { d, auditoria } = montar(LEITOR, [f], {
    permitido: false,
    indisponivel: true,
    chaves: {},
  });
  const r = await despachar("obter_oportunidade", { oportunidade_id: OP }, d);
  assert.deepEqual(sc(r), {
    erro: "SIGO indisponível no momento. Tente de novo.",
    motivo: "indisponivel",
  });
  assert.equal(auditoria.length, 0);
  assert.equal(f.chamadas, 0);
});

test("limite estourado: negado/limite e a mensagem de muitas tentativas", async () => {
  const f = ferramenta("obter_oportunidade", true);
  const { d, auditoria } = montar(LEITOR, [f], { permitido: false, chaves: {} });
  const r = await despachar("obter_oportunidade", { oportunidade_id: OP }, d);
  assert.deepEqual(sc(r), { erro: MSG_MUITAS_TENTATIVAS, motivo: "limite" });
  assert.deepEqual(auditoria, [
    { ferramenta: "obter_oportunidade", resultado: "negado", motivo: "limite", alvo: OP },
  ]);
  assert.equal(f.chamadas, 0);
});

test("leitura consome com leitura=true; gravação com leitura=false", async () => {
  const ler = ferramenta("obter_oportunidade", true);
  const gravar = ferramenta("adicionar_nota", false);
  const { d, limites } = montar(EDITOR, [ler, gravar]);
  await despachar("obter_oportunidade", { oportunidade_id: OP }, d);
  await despachar("adicionar_nota", { oportunidade_id: OP, texto: "x" }, d);
  assert.deepEqual(limites, [
    { nome: "obter_oportunidade", leitura: true },
    { nome: "adicionar_nota", leitura: false },
  ]);
});

test("campo fora da lista: erro/campos_fora_da_lista com os caminhos, e a ferramenta não roda", async () => {
  const f = ferramenta("adicionar_nota", false);
  const { d, auditoria } = montar(EDITOR, [f]);
  const r = await despachar(
    "adicionar_nota",
    { oportunidade_id: OP, texto: "x", empresa_id: E, itens: [{ exigencia_id: "op1", bdi: 1 }] },
    d
  );
  assert.deepEqual(sc(r), {
    erro: "Campos não aceitos pelo SIGO: empresa_id, itens[0].bdi.",
    motivo: "campos_fora_da_lista",
    campos: ["empresa_id", "itens[0].bdi"],
  });
  assert.equal(f.chamadas, 0);
  assert.deepEqual(auditoria, [
    { ferramenta: "adicionar_nota", resultado: "erro", motivo: "campos_fora_da_lista", alvo: OP },
  ]);
});

test("entrada grande: erro/entrada_grande antes de rodar", async () => {
  const f = ferramenta("adicionar_nota", false);
  const { d, auditoria } = montar(EDITOR, [f]);
  const r = await despachar("adicionar_nota", { texto: "x".repeat(3_000_001) }, d);
  assert.equal(sc(r).motivo, "entrada_grande");
  assert.equal(f.chamadas, 0);
  assert.deepEqual(auditoria, [
    { ferramenta: "adicionar_nota", resultado: "erro", motivo: "entrada_grande" },
  ]);
});

test("sucesso: auditoria ok com o alvo e o motivo do resultado", async () => {
  const f = ferramenta("adicionar_nota", false, async () =>
    sucesso({ nota_id: "n1" }, { alvo: OP, motivo: null })
  );
  const { d, auditoria } = montar(EDITOR, [f]);
  const r = await despachar("adicionar_nota", { texto: "x" }, d);
  assert.equal(r.isError, false);
  assert.deepEqual(sc(r), { nota_id: "n1" });
  assert.deepEqual(auditoria, [
    { ferramenta: "adicionar_nota", resultado: "ok", motivo: null, alvo: OP },
  ]);
});

test("recusa da ferramenta (isError): auditoria erro com o motivo; alvo cai para os args", async () => {
  const f = ferramenta("adicionar_nota", false, async () => falha("Texto vazio.", "validacao"));
  const { d, auditoria } = montar(EDITOR, [f]);
  await despachar("adicionar_nota", { oportunidade_id: OP, texto: "" }, d);
  assert.deepEqual(auditoria, [
    { ferramenta: "adicionar_nota", resultado: "erro", motivo: "validacao", alvo: OP },
  ]);
});

test("exceção: erro/excecao com mensagem genérica; ErroCamada campo_proibido vira campo_proibido", async () => {
  const boom = ferramenta("adicionar_nota", false, async () => {
    throw new Error("detalhe interno do banco");
  });
  const proibido = ferramenta("registrar_atende", false, async () => {
    throw new ErroCamada("campo_proibido", "Campo não aceito no UPDATE: empresa_id");
  });
  const { d, auditoria } = montar(EDITOR, [boom, proibido]);
  const original = console.error;
  console.error = () => {};
  try {
    const r1 = await despachar("adicionar_nota", { oportunidade_id: OP, texto: "x" }, d);
    const r2 = await despachar("registrar_atende", { oportunidade_id: OP }, d);
    assert.deepEqual(sc(r1), {
      erro: "Erro interno ao executar a ferramenta. Tente de novo.",
      motivo: "excecao",
    });
    assert.equal(sc(r2).motivo, "campo_proibido");
  } finally {
    console.error = original;
  }
  assert.deepEqual(
    auditoria.map((a) => [a.ferramenta, a.resultado, a.motivo, a.alvo]),
    [
      ["adicionar_nota", "erro", "excecao", OP],
      ["registrar_atende", "erro", "campo_proibido", OP],
    ]
  );
});

test("ferramenta desconhecida: erro/desconhecida, sem consumir limite", async () => {
  const { d, limites, auditoria } = montar(EDITOR, []);
  const r = await despachar("apagar_tudo", {}, d);
  assert.equal(sc(r).motivo, "desconhecida");
  assert.equal(limites.length, 0);
  assert.deepEqual(auditoria, [
    { ferramenta: "apagar_tudo", resultado: "erro", motivo: "desconhecida" },
  ]);
});

test("auditoria que falha não derruba a resposta", async () => {
  const f = ferramenta("obter_oportunidade", true);
  const { d } = montar(LEITOR, [f]);
  d.auditar = async () => {
    throw new Error("auditoria fora do ar");
  };
  const original = console.error;
  console.error = () => {};
  try {
    const r = await despachar("obter_oportunidade", { oportunidade_id: OP }, d);
    assert.equal(r.isError, false);
  } finally {
    console.error = original;
  }
});

test("alvoDosArgs: o primeiro id que for UUID, na ordem oportunidade, atestado, link, arquivo", () => {
  const A = "00000000-0000-4000-8000-0000000000aa";
  assert.equal(alvoDosArgs({ oportunidade_id: "x", atestado_id: A }), A);
  assert.equal(alvoDosArgs({ arquivo_id: A, link_id: OP }), OP);
  assert.equal(alvoDosArgs({}), null);
});
