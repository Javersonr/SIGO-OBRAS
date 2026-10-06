// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/trilha-imutavel.test.ts
//
// Guarda da T17 (migração 0135): a trilha de auditoria do EAD (treinamento_evento,
// treinamento_tentativa e treinamento_certificado) é só de inclusão. O banco recusa UPDATE e DELETE
// nelas (trigger `trilha_imutavel`), até para o service role. Este teste confere o outro lado: o
// código das Edge Functions NUNCA tenta escrever assim nessas tabelas (se tentasse, o trigger
// derrubaria a ação em produção). O `index.ts` não é importável no Node, então a conferência é pelo
// texto do código: cada `.from("tabela")` e a cadeia de métodos que vem depois dele.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const TABELAS_DA_TRILHA = [
  "treinamento_evento",
  "treinamento_tentativa",
  "treinamento_certificado",
];
// o supabase-js escreve com insert/update/upsert/delete; só o insert é permitido na trilha
const ESCRITAS_PROIBIDAS = new Set(["update", "upsert", "delete"]);

/**
 * A única escrita (além do insert) permitida na trilha: a REVOGAÇÃO do certificado (T18), feita pelo
 * `funcionario-acesso` a pedido do RH (e o seu desfazer, se o evento da trilha não for gravado). Antes
 * ela era feita direto do navegador do RH; o banco (0119) só deixa a empresa mudar as 3 colunas da
 * revogação, mas o service role passa por essa trava, então o código fica restrito: só este arquivo,
 * só estas duas atualizações, e o `funcionario-acesso` testa que as colunas vêm de `dadosDaRevogacao`.
 */
export const ESCRITAS_PERMITIDAS: Record<string, string[]> = {
  "funcionario-acesso/index.ts": [
    "treinamento_certificado.update",
    "treinamento_certificado.update",
  ],
};

/** Tira de `achadas` cada escrita permitida (uma vez por permissão); o que sobra é proibido. */
export function semAsPermitidas(achadas: string[], permitidas: string[]): string[] {
  const restantes = [...achadas];
  for (const p of permitidas) {
    const i = restantes.indexOf(p);
    if (i !== -1) restantes.splice(i, 1);
  }
  return restantes;
}

interface Cadeia {
  tabela: string;
  metodos: string[];
}

/** Índice do primeiro caractere depois de espaços e comentários, a partir de `i`. */
function pularEspacos(codigo: string, i: number): number {
  while (i < codigo.length) {
    if (/\s/.test(codigo[i])) i++;
    else if (codigo.startsWith("//", i)) {
      const fim = codigo.indexOf("\n", i);
      i = fim === -1 ? codigo.length : fim + 1;
    } else if (codigo.startsWith("/*", i)) {
      const fim = codigo.indexOf("*/", i + 2);
      i = fim === -1 ? codigo.length : fim + 2;
    } else break;
  }
  return i;
}

/** `i` aponta para um "(": devolve o índice logo depois do ")" que o fecha (ignora texto e comentário). */
function pularParenteses(codigo: string, i: number): number {
  let profundidade = 0;
  while (i < codigo.length) {
    const c = codigo[i];
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < codigo.length && codigo[i] !== c) i += codigo[i] === "\\" ? 2 : 1;
      i++;
    } else if (codigo.startsWith("//", i) || codigo.startsWith("/*", i)) {
      i = pularEspacos(codigo, i);
    } else {
      if (c === "(") profundidade++;
      if (c === ")" && --profundidade === 0) return i + 1;
      i++;
    }
  }
  return i;
}

/** Para cada `.from("tabela")`, os métodos encadeados depois dele (`select`, `eq`, `update`...). */
export function cadeiasDeConsulta(codigo: string): Cadeia[] {
  const cadeias: Cadeia[] = [];
  const de = /\.from\(\s*["'`]([A-Za-z0-9_.]+)["'`]\s*\)/g;
  let achado: RegExpExecArray | null;
  while ((achado = de.exec(codigo))) {
    const metodos: string[] = [];
    let i = achado.index + achado[0].length;
    for (;;) {
      i = pularEspacos(codigo, i);
      if (codigo[i] !== ".") break;
      i = pularEspacos(codigo, i + 1);
      const nome = /^[A-Za-z_$][\w$]*/.exec(codigo.slice(i))?.[0];
      if (!nome) break;
      i = pularEspacos(codigo, i + nome.length);
      if (codigo[i] !== "(") break; // propriedade (.data, .error), não é chamada
      metodos.push(nome);
      i = pularParenteses(codigo, i);
    }
    cadeias.push({ tabela: achado[1], metodos });
  }
  return cadeias;
}

/** Escritas proibidas na trilha: uma linha "tabela.método" por ocorrência. */
export function escritasProibidasNaTrilha(codigo: string): string[] {
  return cadeiasDeConsulta(codigo)
    .filter((c) => TABELAS_DA_TRILHA.includes(c.tabela))
    .flatMap((c) =>
      c.metodos.filter((m) => ESCRITAS_PROIBIDAS.has(m)).map((m) => `${c.tabela}.${m}`)
    );
}

// ------------------------------------------------------------------ o leitor de código

test("leitor: acusa update, upsert e delete encadeados na tabela da trilha", () => {
  const codigo = `
    await supabase.from("treinamento_evento").update({ ip: null }).eq("id", 1);
    await supabase.from('treinamento_tentativa').delete().eq("id", 1);
    await supabase.from(\`treinamento_certificado\`).upsert({ codigo: "X" });
  `;
  assert.deepEqual(escritasProibidasNaTrilha(codigo), [
    "treinamento_evento.update",
    "treinamento_tentativa.delete",
    "treinamento_certificado.upsert",
  ]);
});

test("leitor: acusa a escrita mesmo com quebra de linha, comentário e argumentos longos", () => {
  const codigo = `
    const r = await supabase
      .from("treinamento_evento")
      // deno-lint-ignore no-explicit-any
      .select("id, detalhe (parênteses) ) \\" ")
      /* meio */
      .eq("matricula_id", mat.id)
      .update({ evento: "x" });
  `;
  assert.deepEqual(escritasProibidasNaTrilha(codigo), ["treinamento_evento.update"]);
});

test("leitor: leitura e insert na trilha, e escrita em outra tabela, passam", () => {
  const codigo = `
    await supabase.from("treinamento_evento").insert({ evento: "login" });
    await supabase.from("treinamento_tentativa").insert({ prova: q.map((x) => ({ a: x })) });
    const { data } = await supabase.from("treinamento_certificado").select("codigo").eq("a", 1).maybeSingle();
    await supabase.from("treinamento_matricula").update({ status: "concluido" }).eq("id", 1);
    await supabase.from("funcionario_portal_acesso").update({ tentativas: 0 });
  `;
  assert.deepEqual(escritasProibidasNaTrilha(codigo), []);
});

test("leitor: um update numa consulta vizinha não é atribuído à tabela da trilha", () => {
  const codigo = `
    const [a, b] = await Promise.all([
      supabase.from("treinamento_tentativa").select("numero").eq("matricula_id", id),
      supabase.from("treinamento_matricula").update({ status: "x" }).eq("id", id),
    ]);
  `;
  assert.deepEqual(escritasProibidasNaTrilha(codigo), []);
});

test("permitidas: uma atualização do certificado além das combinadas é acusada", () => {
  const achadas = Array(3).fill("treinamento_certificado.update");
  assert.deepEqual(semAsPermitidas(achadas, ESCRITAS_PERMITIDAS["funcionario-acesso/index.ts"]), [
    "treinamento_certificado.update",
  ]);
  assert.deepEqual(
    semAsPermitidas(["treinamento_evento.update"], ["treinamento_certificado.update"]),
    ["treinamento_evento.update"]
  );
  assert.deepEqual(semAsPermitidas([], ESCRITAS_PERMITIDAS["funcionario-acesso/index.ts"]), []);
});

// ------------------------------------------------------------------ o código de verdade

const RAIZ_FUNCOES = fileURLToPath(new URL("../", import.meta.url));

function arquivosDasFuncoes(): string[] {
  return (readdirSync(RAIZ_FUNCOES, { recursive: true }) as string[])
    .map((p) => p.split("\\").join("/"))
    .filter((p) => p.endsWith(".ts") && !p.endsWith(".test.ts") && !p.includes("node_modules"));
}

test("nenhuma Edge Function faz UPDATE, UPSERT ou DELETE na trilha (só a revogação, no funcionario-acesso)", () => {
  const arquivos = arquivosDasFuncoes();
  assert.ok(arquivos.length > 10, "a varredura precisa achar as funções");
  const achados: string[] = [];
  let referencias = 0;
  for (const arquivo of arquivos) {
    const codigo = readFileSync(join(RAIZ_FUNCOES, arquivo), "utf8");
    referencias += cadeiasDeConsulta(codigo).filter((c) =>
      TABELAS_DA_TRILHA.includes(c.tabela)
    ).length;
    const achadas = escritasProibidasNaTrilha(codigo);
    for (const a of semAsPermitidas(achadas, ESCRITAS_PERMITIDAS[arquivo] ?? [])) {
      achados.push(`${arquivo}: ${a}`);
    }
  }
  // sem isso o teste passaria vazio se o leitor deixasse de achar as consultas
  assert.ok(referencias >= 8, `esperava achar as consultas à trilha (achou ${referencias})`);
  assert.deepEqual(achados, []);
});

test("nenhuma Edge Function apaga linha de tabela alguma (a exclusão é lógica, deleted_at)", () => {
  const achados: string[] = [];
  for (const arquivo of arquivosDasFuncoes()) {
    const codigo = readFileSync(join(RAIZ_FUNCOES, arquivo), "utf8");
    for (const c of cadeiasDeConsulta(codigo)) {
      if (c.metodos.includes("delete")) achados.push(`${arquivo}: ${c.tabela}.delete`);
    }
  }
  assert.deepEqual(achados, []);
});

test("a ação evento do portal grava origem 'navegador' (e só ela)", () => {
  const codigo = readFileSync(join(RAIZ_FUNCOES, "portal-funcionario/index.ts"), "utf8");
  const inicio = codigo.indexOf('body.acao === "evento"');
  assert.ok(inicio > 0, "ação evento não encontrada");
  const fim = codigo.indexOf('body.acao === "', inicio + 10);
  assert.ok(fim > inicio, "fim da ação evento não encontrado");
  const bloco = codigo.slice(inicio, fim);
  assert.match(bloco, /origem:\s*"navegador"/);
  // o resto do servidor registra eventos próprios: sem a marca, vale o 'servidor' do banco
  assert.equal(codigo.match(/origem:\s*"navegador"/g)?.length, 1);
});
