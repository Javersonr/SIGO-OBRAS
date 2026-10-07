// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/tipo-e-pre-requisito-banco.test.ts
//
// Guarda da T23 (tipo do treinamento e pré-requisito entre cursos): migração `0142_ead_tipo_e_pre_requisito.sql`.
// Não há banco de teste (nem Postgres no PC) e `npm run dev` fala com produção, então o que se confere aqui é a
// FORMA do arquivo, que é onde a T23 pode errar sem ninguém ver:
//   - o número é o próximo livre e é um arquivo só; termina em `select 'ok' as res;`;
//   - tipo (CHECK dos três valores) e motivo (obrigatório só no eventual, de 3 a 200 caracteres);
//   - o trigger da 0130 continua aceitando o INSERT com tipo e motivo: ele só zera andamento e conclusão no
//     INSERT, e depois do INSERT a empresa só muda tentativas_extras e deleted_at (o tipo não muda);
//   - o pré-requisito é uma FK para o próprio curso (on delete set null), sem apontar para si nem para um círculo,
//     da mesma empresa (trigger de referências com nome próprio: o `referencias_da_empresa_modelo` é da 0131);
//   - a migração é idempotente e não mexe em dado real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const lerArquivo = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), "utf8");
const pasta = join(RAIZ, "supabase", "migrations");

const arquivos0142 = readdirSync(pasta).filter((n) => /^0142_.+\.sql$/.test(n));
test("existe exatamente uma migração 0142 (o número desta tarefa)", () => {
  assert.equal(arquivos0142.length, 1, `achei: ${arquivos0142.join(", ") || "nenhuma"}`);
});

const migracao = lerArquivo("supabase", "migrations", arquivos0142[0] ?? "0142_ausente.sql");
const migracao0130 = lerArquivo("supabase", "migrations", "0130_ead_integridade.sql");

/** SQL sem comentário de linha e de bloco (a migração não tem `--` dentro de texto entre aspas). */
const semComentarios = (sql: string) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((linha) => linha.replace(/--.*$/, ""))
    .join("\n");
const compacto = (sql: string) => sql.replace(/\s+/g, " ").trim();
const sql = compacto(semComentarios(migracao));

test("termina em select 'ok' as res; e roda numa transação só", () => {
  assert.ok(migracao.trimEnd().endsWith("select 'ok' as res;"));
  assert.equal([...sql.matchAll(/\bbegin;/g)].length, 1);
  assert.equal([...sql.matchAll(/\bcommit;/g)].length, 1);
});

// ------------------------------------------------------------------------------------------- tipo e motivo

test("tipo: texto não nulo, padrão 'inicial', com CHECK dos três valores da NR-1", () => {
  assert.ok(
    sql.includes(
      "alter table public.treinamento_matricula add column if not exists tipo text not null default 'inicial'"
    )
  );
  assert.ok(sql.includes("add column if not exists motivo_eventual text"));
  assert.ok(
    sql.includes(
      "add constraint treinamento_matricula_tipo_chk check (tipo in ('inicial', 'periodico', 'eventual'))"
    )
  );
});

test("motivo: obrigatório (3 a 200 caracteres) no eventual e nulo nos outros tipos", () => {
  const m = /add constraint treinamento_matricula_motivo_eventual_chk check \((.*?)\); /.exec(sql);
  assert.ok(m, "CHECK do motivo não encontrado");
  const regra = m[1];
  assert.ok(regra.includes("when tipo = 'eventual'"));
  assert.ok(regra.includes("motivo_eventual is not null"));
  assert.ok(regra.includes("char_length(btrim(motivo_eventual)) >= 3"));
  assert.ok(regra.includes("char_length(motivo_eventual) <= 200"));
  assert.ok(regra.includes("else motivo_eventual is null"));
});

// -------------------------------------------------------------------------- o trigger da 0130 não atrapalha

/** O corpo do trecho `if tg_op = 'INSERT' then ... return new;` da função da 0130. */
function ramoDoInsertDa0130(): string {
  const m = /if tg_op = 'INSERT' then([\s\S]*?)return new;/.exec(migracao0130);
  assert.ok(m, "ramo do INSERT da função da 0130 não encontrado");
  return m[1];
}

test("0130: no INSERT o trigger zera só andamento e conclusão, nunca tipo nem motivo", () => {
  const ramo = ramoDoInsertDa0130();
  const gravados = [...ramo.matchAll(/new\.(\w+)\s*:=/g)].map((x) => x[1]).sort();
  assert.deepEqual(gravados, [
    "avaliacao_aprovada",
    "avaliacao_em",
    "created_at",
    "data_conclusao",
    "iniciado_em",
    "nota_avaliacao",
    "proxima_renovacao",
    "status",
    "updated_at",
  ]);
  assert.equal(/\btipo\b|motivo_eventual/.test(ramo), false);
});

test("0130: depois do INSERT a empresa só muda tentativas_extras e deleted_at (o tipo não muda)", () => {
  const m = /livres constant text\[\] := array\[(.*?)\]/.exec(migracao0130);
  assert.ok(m);
  const livres = m[1].split(",").map((x) => x.trim().replace(/'/g, ""));
  assert.deepEqual(livres.sort(), ["deleted_at", "tentativas_extras", "updated_at"]);
});

test("a migração nova não recria nem substitui o trigger da matrícula (0130)", () => {
  assert.equal(sql.includes("matricula_andamento_so_servidor"), false);
  assert.equal(/on public\.treinamento_matricula for each row execute/.test(sql), false);
});

// ------------------------------------------------------------------------------------------ pré-requisito

test("pré-requisito: FK para o próprio curso, solta (set null) se o curso exigido for apagado de vez", () => {
  assert.ok(
    sql.includes(
      "alter table public.treinamento_curso add column if not exists pre_requisito_curso_id uuid references public.treinamento_curso(id) on delete set null"
    )
  );
});

test("pré-requisito: o curso não exige a si mesmo (CHECK) e há índice para a FK", () => {
  assert.ok(
    sql.includes(
      "add constraint treinamento_curso_pre_requisito_proprio_chk check (pre_requisito_curso_id is null or pre_requisito_curso_id <> id)"
    )
  );
  assert.ok(
    /create index if not exists treinamento_curso_pre_requisito_idx on public\.treinamento_curso\(pre_requisito_curso_id\)/.test(
      sql
    )
  );
});

test("pré-requisito: trigger recusa o círculo (A exige B e B exige A, ou uma volta maior)", () => {
  assert.ok(sql.includes("create or replace function public.pre_requisito_sem_ciclo()"));
  assert.ok(sql.includes("with recursive cadeia"));
  assert.ok(sql.includes("where cadeia.degrau < 20"), "limite de degraus");
  assert.ok(
    /create trigger pre_requisito_sem_ciclo before insert or update of pre_requisito_curso_id on public\.treinamento_curso for each row execute function public\.pre_requisito_sem_ciclo\(\)/.test(
      sql
    )
  );
  // só confere quando o vínculo muda: o UPDATE de qualquer outra coluna do curso não anda pela cadeia
  assert.ok(
    sql.includes(
      "if tg_op = 'UPDATE' and new.pre_requisito_curso_id is not distinct from old.pre_requisito_curso_id then return new;"
    )
  );
  assert.ok(
    sql.includes(
      "revoke all on function public.pre_requisito_sem_ciclo() from public, anon, authenticated"
    )
  );
});

test("pré-requisito: o curso exigido é da mesma empresa, com trigger de nome próprio (não o da 0131)", () => {
  assert.ok(
    /create trigger referencias_da_empresa_pre_requisito before insert or update of pre_requisito_curso_id, empresa_id on public\.treinamento_curso for each row execute function public\.exigir_referencias_da_empresa\( 'pre_requisito_curso_id:treinamento_curso'\)/.test(
      sql
    )
  );
  // o nome da 0131 continua só dela: esta migração não o recria nem o apaga
  assert.equal(sql.includes("referencias_da_empresa_modelo"), false);
  const da0131 = lerArquivo("supabase", "migrations", "0131_treinamentos_cadastro_integrado.sql");
  assert.ok(da0131.includes("create trigger referencias_da_empresa_modelo"));
});

test("a 0131 (que copia o modelo para o curso) não mexe na coluna do pré-requisito", () => {
  const da0131 = lerArquivo("supabase", "migrations", "0131_treinamentos_cadastro_integrado.sql");
  assert.equal(da0131.includes("pre_requisito"), false);
});

// ----------------------------------------------------------------------------------------- idempotência

test("idempotente: coluna com if not exists; restrição e trigger recriados; função com create or replace", () => {
  for (const m of sql.matchAll(/add column (?!if not exists)/g)) {
    assert.fail(`add column sem "if not exists" em: ${sql.slice(m.index, m.index + 60)}`);
  }
  // toda restrição nova é precedida do drop constraint if exists, do mesmo nome
  for (const m of sql.matchAll(/add constraint (\w+)/g)) {
    assert.ok(
      sql.includes(`drop constraint if exists ${m[1]};`),
      `${m[1]} não é recriada com drop constraint if exists`
    );
  }
  // todo trigger novo é precedido do drop trigger if exists, do mesmo nome
  for (const m of sql.matchAll(/create trigger (\w+) /g)) {
    assert.ok(
      sql.includes(`drop trigger if exists ${m[1]} on public.treinamento_curso;`),
      `${m[1]} não é recriado com drop trigger if exists`
    );
  }
  assert.equal(/\bcreate function\b/.test(sql), false, "função só com create or replace");
});

test("nenhum dado real é gravado, apagado ou apagado em massa", () => {
  const comandos = /(^|;)\s*(insert into|update\s+public\.|delete from|truncate)\b/i;
  assert.equal(comandos.test(semComentarios(migracao)), false);
});
