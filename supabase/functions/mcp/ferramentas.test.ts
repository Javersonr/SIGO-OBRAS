// node --test supabase/functions/mcp/ferramentas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FERRAMENTAS,
  INSTRUCOES,
  INSTRUCOES_BASE,
  permissoesEfetivas,
  PROMPTS,
} from "./ferramentas.ts";
import { INSTRUCOES_ARQUIVOS } from "./ferramentas-arquivos.ts";
import { INSTRUCOES_EDITAL } from "./ferramentas-edital.ts";
import { INSTRUCOES_ACERVO } from "./ferramentas-acervo.ts";
import { INSTRUCOES_ORCAMENTO } from "./ferramentas-orcamento.ts";
import {
  exigenciaDaFerramenta,
  NEGAR,
  NOMES_FERRAMENTAS,
} from "../_shared/conector/permissoes-ferramentas.ts";
import { camadaDaEmpresa } from "../_shared/conector/camada-empresa.ts";
import { criarFakeAdmin } from "../_shared/conector/testes/fake-admin.ts";
import type { ContextoMcp } from "./contexto.ts";

const E = "00000000-0000-4000-8000-000000000001";

function ctx(vinculo: ContextoMcp["vinculo"]): ContextoMcp {
  return {
    autorizacaoId: "00000000-0000-4000-8000-0000000000a1",
    cliente: "Claude",
    usuario: { id: "00000000-0000-4000-8000-0000000000b1", email: "u@exemplo.test", nome: "U" },
    empresa: { id: E, nome: "Empresa Teste", cnpj: "00.000.000/0001-00", uf: "MG" },
    vinculo,
    vinculoId: "00000000-0000-4000-8000-0000000000c1",
  };
}

/** Todo objeto com properties precisa de additionalProperties:false (desce em properties e items). */
function objetosAbertos(s: unknown, caminho = "inputSchema"): string[] {
  if (!s || typeof s !== "object") return [];
  const o = s as Record<string, unknown>;
  const abertos: string[] = [];
  const tipos = Array.isArray(o.type) ? o.type : [o.type];
  if ((tipos.includes("object") || o.properties) && o.additionalProperties !== false) {
    abertos.push(caminho);
  }
  if (o.properties && typeof o.properties === "object") {
    for (const [k, v] of Object.entries(o.properties)) {
      abertos.push(...objetosAbertos(v, `${caminho}.${k}`));
    }
  }
  if (o.items) abertos.push(...objetosAbertos(o.items, `${caminho}[]`));
  return abertos;
}

test("nomes de ferramenta únicos", () => {
  const nomes = FERRAMENTAS.map((f) => f.def.name);
  assert.equal(new Set(nomes).size, nomes.length);
  assert.equal(nomes[0], "empresa_atual");
});

test("todo def: title, anotações certas e inputSchema fechado em todos os objetos", () => {
  for (const { def } of FERRAMENTAS) {
    assert.ok(def.title, `${def.name}: sem title`);
    assert.ok(def.description, `${def.name}: sem description`);
    assert.equal(def.annotations.openWorldHint, false, def.name);
    assert.equal(typeof def.annotations.idempotentHint, "boolean", def.name);
    assert.equal(typeof def.annotations.readOnlyHint, "boolean", def.name);
    if (!def.annotations.readOnlyHint)
      assert.equal(def.annotations.destructiveHint, false, def.name);
    assert.equal(def.inputSchema.type, "object", def.name);
    assert.ok(Array.isArray(def.inputSchema.required), `${def.name}: sem required`);
    assert.deepEqual(objetosAbertos(def.inputSchema), [], def.name);
  }
});

test("toda ferramenta registrada tem exigência diferente de NEGAR", () => {
  for (const { def } of FERRAMENTAS) {
    assert.notDeepEqual(exigenciaDaFerramenta(def.name, {}), NEGAR, def.name);
  }
});

test("INSTRUCOES: base com as 8 linhas, ≤ 4000 caracteres; cada parte ≤ 800", () => {
  assert.equal(INSTRUCOES_BASE.length, 8);
  assert.ok(INSTRUCOES.startsWith(INSTRUCOES_BASE[0]));
  assert.ok(INSTRUCOES.length <= 4000, `INSTRUCOES com ${INSTRUCOES.length} caracteres`);
  for (const [parte, linhas] of Object.entries({
    INSTRUCOES_ARQUIVOS,
    INSTRUCOES_EDITAL,
    INSTRUCOES_ACERVO,
    INSTRUCOES_ORCAMENTO,
  })) {
    const total = linhas.reduce((s, l) => s + l.length, 0);
    assert.ok(total <= 800, `${parte} com ${total} caracteres`);
  }
});

test("nomes de prompt únicos", () => {
  const nomes = PROMPTS.map((p) => p.name);
  assert.equal(new Set(nomes).size, nomes.length);
});

test("empresa_atual: usuário, empresa com UF, permissões e ferramentas liberadas", async () => {
  const { admin, storage } = criarFakeAdmin();
  const leitor = ctx({
    perfil: "Usuario",
    ativo: true,
    permissoes: { Oportunidades: { Lista: { visualizar: true } } },
  });
  const f = FERRAMENTAS.find((x) => x.def.name === "empresa_atual")!;
  const r = await f.executar(
    {},
    { ctx: leitor, db: camadaDaEmpresa(admin, E), storage, fetchFn: fetch, agora: new Date() }
  );
  const sc = r.resultado.structuredContent as Record<string, unknown>;
  assert.equal(r.resultado.isError, false);
  assert.deepEqual(sc.usuario, { nome: "U", email: "u@exemplo.test" });
  assert.deepEqual(sc.empresa, {
    id: E,
    nome: "Empresa Teste",
    cnpj: "00.000.000/0001-00",
    uf: "MG",
  });
  assert.equal(sc.conectado_por, "Claude");
  assert.deepEqual(sc.permissoes, {
    ler_oportunidades_e_acervo: true,
    criar_oportunidade: false,
    editar_oportunidade: false,
    anexar_arquivos: false,
    editar_orcamento: false,
  });
  const ferramentas = sc.ferramentas as Record<string, boolean>;
  assert.deepEqual(
    Object.keys(ferramentas),
    FERRAMENTAS.map((x) => x.def.name)
  );
  assert.equal(ferramentas.empresa_atual, true);
});

test("permissoesEfetivas: editar_orcamento exige Lista/editar e Orçamento/editar", () => {
  const p = permissoesEfetivas(
    ctx({
      perfil: "Usuario",
      ativo: true,
      permissoes: { Oportunidades: { Lista: { editar: true }, Orcamento: { editar: true } } },
    })
  );
  assert.equal(p.editar_orcamento, true);
  assert.equal(p.editar_oportunidade, true);
  assert.equal(permissoesEfetivas(ctx({ perfil: "Admin" })).editar_orcamento, true);
});

/** §5 do contrato do Plano 2: [leitura, idempotentHint, obrigatórios]. */
const DO_CONTRATO: Record<string, [boolean, boolean, string[]]> = {
  empresa_atual: [true, true, []],
  gerar_link_envio: [false, false, ["alvo", "arquivos"]],
  status_envio: [true, true, ["link_id"]],
  registrar_arquivos: [false, false, ["link_id"]],
  ler_edital_anexado: [true, true, ["oportunidade_id", "arquivo_id"]],
  buscar_oportunidades: [true, true, []],
  obter_oportunidade: [true, true, ["oportunidade_id"]],
  criar_ou_atualizar_oportunidade: [false, false, ["edital"]],
  registrar_atende: [false, true, ["oportunidade_id", "itens"]],
  adicionar_nota: [false, false, ["oportunidade_id", "texto"]],
  ler_acervo: [true, true, []],
  cadastrar_atestado: [
    false,
    false,
    ["confirmado_pelo_usuario", "tipo", "objeto", "quantitativos"],
  ],
  importar_orcamento: [false, false, ["oportunidade_id", "linhas"]],
  aplicar_desconto: [false, true, ["oportunidade_id", "desconto_pct"]],
  importar_cronograma: [false, true, ["oportunidade_id", "meses", "linhas"]],
  registrar_proposta: [false, false, ["oportunidade_id"]],
  ler_orcamento: [true, true, ["oportunidade_id"]],
};

test("Plano 2 completo: as 17 ferramentas na ordem de NOMES_FERRAMENTAS, como no §5, e os 3 prompts", () => {
  assert.deepEqual(
    FERRAMENTAS.map((f) => f.def.name),
    [...NOMES_FERRAMENTAS]
  );
  assert.deepEqual(Object.keys(DO_CONTRATO), [...NOMES_FERRAMENTAS]);
  for (const { def } of FERRAMENTAS) {
    const [leitura, idempotente, obrigatorios] = DO_CONTRATO[def.name];
    assert.equal(def.annotations.readOnlyHint, leitura, `${def.name}: readOnlyHint`);
    assert.equal(def.annotations.idempotentHint, idempotente, `${def.name}: idempotentHint`);
    assert.deepEqual(
      [...(def.inputSchema.required as string[])].sort(),
      [...obrigatorios].sort(),
      `${def.name}: obrigatórios`
    );
  }
  assert.deepEqual(
    PROMPTS.map((p) => p.name),
    ["analisar_edital", "cadastrar_acervo", "orcamento_cronograma_licitacao"]
  );
});
