// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/declaracao-ambiente-banco.test.ts
//
// Guarda da T35 (declaração de ambiente e horário): migração `0144_ead_declaracao_ambiente.sql`. Não há banco de
// teste (nem Postgres no PC) e `npm run dev` fala com produção, então o que se confere aqui é a FORMA do arquivo; o
// comportamento no banco é o do `tools/smoke-ead-declaracao.sql` (begin ... rollback), que o Javerson roda.
//   - o número é o próximo livre e é um arquivo só; termina em `select 'ok' as res;` e roda numa transação;
//   - a tabela tem RLS por empresa, nada para anon e nada de UPDATE/DELETE/TRUNCATE para authenticated;
//   - versão, quem salvou e quando vêm do trigger (o cliente não escolhe), com trava para dois salvamentos ao mesmo
//     tempo; os limites do texto e da ART são os mesmos da regra do servidor e da tela;
//   - só inclusão: a trava da trilha (0135) em UPDATE, DELETE e TRUNCATE; a tabela não tem `deleted_at`;
//   - a migração não grava dado nenhum (nenhuma versão é aprovada por ela) e não mexe na trilha;
//   - o servidor só LÊ a tabela (conferido em `declaracao-ambiente.test.ts`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ART_MAX, TEXTO_MAX, TEXTO_MIN } from "./declaracao-ambiente.ts";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const pasta = join(RAIZ, "supabase", "migrations");
const arquivos0144 = readdirSync(pasta).filter((n) => /^0144_.+\.sql$/.test(n));

test("existe exatamente uma migração 0144 (o número desta tarefa)", () => {
  assert.equal(arquivos0144.length, 1, `achei: ${arquivos0144.join(", ") || "nenhuma"}`);
  // e a anterior é a da T12: nenhum número no meio ficou de fora
  assert.ok(readdirSync(pasta).some((n) => /^0143_.+\.sql$/.test(n)));
});

const migracao = readFileSync(join(pasta, arquivos0144[0] ?? "0144_ausente.sql"), "utf8");
const migracao0135 = readFileSync(join(pasta, "0135_trilha_imutavel.sql"), "utf8");

/** SQL sem comentário de linha (a migração não tem `--` dentro de texto entre aspas). */
const semComentarios = (sql: string) =>
  sql
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

test("não grava dado: nenhuma versão é aprovada pela migração (o RT salva pela tela)", () => {
  assert.ok(!/\bupdate public\./.test(sql), "UPDATE em tabela");
  assert.ok(!/\binsert into\b/.test(sql), "INSERT");
  assert.ok(!/\bdelete from\b/.test(sql), "DELETE");
});

test("não mexe na trilha (o evento declaracao_ambiente cabe nas colunas que já existem)", () => {
  assert.ok(!sql.includes("alter table public.treinamento_evento"));
  assert.ok(!sql.includes("create table if not exists public.treinamento_evento"));
});

test("a tabela: empresa, versão, texto, ART, quem salvou, quando; sem deleted_at", () => {
  const tabela =
    /create table if not exists public\.treinamento_declaracao_texto \((.*?)\);/.exec(sql)?.[1] ??
    "";
  for (const coluna of [
    "empresa_id uuid not null references public.empresa(id) on delete cascade",
    "versao integer not null",
    "texto text not null",
    "art text",
    "salvo_por uuid",
    "salvo_por_email text",
    "created_at timestamptz not null default now()",
  ]) {
    assert.ok(tabela.includes(coluna), coluna);
  }
  // só inclusão: não existe "apagar" versão
  assert.ok(!tabela.includes("deleted_at"));
  assert.ok(!tabela.includes("updated_at"));
  // um número de versão por empresa
  assert.ok(
    sql.includes(
      "create unique index if not exists treinamento_declaracao_texto_versao_idx on public.treinamento_declaracao_texto(empresa_id, versao)"
    )
  );
  assert.ok(sql.includes("check (versao >= 1)"));
});

test("os limites do texto e da ART são os da regra do servidor e da tela", () => {
  assert.ok(sql.includes(`check (char_length(texto) between ${TEXTO_MIN} and ${TEXTO_MAX})`));
  assert.ok(sql.includes(`check (art is null or char_length(art) between 1 and ${ART_MAX})`));
});

test("RLS por empresa e privilégios: anon sem nada; authenticated só lê e inclui", () => {
  assert.ok(
    sql.includes("drop policy if exists super_admin_all on public.treinamento_declaracao_texto")
  );
  assert.ok(
    sql.includes("drop policy if exists tenant_isolation on public.treinamento_declaracao_texto")
  );
  assert.ok(sql.includes("select apply_tenant_rls('treinamento_declaracao_texto')"));
  assert.ok(sql.includes("revoke all on public.treinamento_declaracao_texto from anon"));
  assert.ok(
    sql.includes(
      "revoke update, delete, truncate on public.treinamento_declaracao_texto from authenticated"
    )
  );
  // nenhuma concessão nova: quem lê e inclui é só a policy da empresa
  assert.ok(!/\bgrant\b/.test(sql));
});

test("versão, quem salvou e quando vêm do banco, com trava para salvamentos simultâneos", () => {
  const corpo =
    /create or replace function public\.declaracao_texto_pelo_banco\(\)(.*?)\$\$;/.exec(sql)?.[1] ??
    "";
  assert.ok(corpo, "falta o trigger declaracao_texto_pelo_banco");
  assert.ok(corpo.includes("set search_path = public"));
  // o mesmo conjunto que o JS apara (declaracao-ambiente.ts / ead-declaracao-ambiente.js): espaço, tab, CR, LF, FF e VT
  assert.ok(corpo.includes("new.texto := btrim(new.texto, E' \\t\\r\\n\\f\\x0b')"));
  assert.ok(
    corpo.includes("new.art := nullif(btrim(coalesce(new.art, ''), E' \\t\\r\\n\\f\\x0b'), '')")
  );
  assert.ok(corpo.includes("pg_advisory_xact_lock("));
  assert.ok(corpo.includes("coalesce(max(t.versao), 0) + 1"));
  assert.ok(corpo.includes("into new.versao"));
  assert.ok(corpo.includes("t.empresa_id = new.empresa_id"));
  assert.ok(corpo.includes("new.salvo_por := auth.uid()"));
  assert.ok(corpo.includes("auth.jwt() ->> 'email'"));
  assert.ok(corpo.includes("new.created_at := now()"));
  assert.ok(
    sql.includes(
      "create trigger declaracao_texto_pelo_banco before insert on public.treinamento_declaracao_texto for each row execute function public.declaracao_texto_pelo_banco()"
    )
  );
  assert.ok(
    sql.includes(
      "revoke all on function public.declaracao_texto_pelo_banco() from public, anon, authenticated"
    )
  );
});

test("dois índices parciais na trilha para o relatório do RH (A6, T35): só índice, nenhuma coluna nem dado", () => {
  assert.ok(
    sql.includes(
      "create index if not exists treinamento_evento_servidor_idx on public.treinamento_evento (empresa_id, created_at desc, id desc) where origem = 'servidor'"
    )
  );
  assert.ok(
    sql.includes(
      "create index if not exists treinamento_evento_declaracao_idx on public.treinamento_evento (empresa_id, created_at) where evento = 'declaracao_ambiente'"
    )
  );
  // o evento do relatório é lido por "empresa + servidor + período": o índice cobre essa consulta
  assert.ok(!/create unique index[^;]*treinamento_evento\b/.test(sql), "índice único na trilha");
});

test("o cabeçalho avisa do expurgo: apagar a empresa com versões salvas exige sigo.permitir_expurgo", () => {
  assert.ok(migracao.includes("on delete cascade"));
  const cabecalho = migracao.slice(0, migracao.indexOf("begin;"));
  assert.ok(cabecalho.includes("sigo.permitir_expurgo"));
  assert.ok(/apagar de verdade a empresa|apagar a empresa/i.test(cabecalho));
});

test("só inclusão: a trava da trilha (0135) em UPDATE, DELETE e TRUNCATE", () => {
  // a função que a 0144 reaproveita é a da 0135, com a exceção do expurgo deliberado
  assert.ok(migracao0135.includes("create or replace function public.trilha_imutavel()"));
  assert.ok(migracao0135.includes("sigo.permitir_expurgo"));
  assert.ok(
    sql.includes(
      "create trigger trilha_imutavel before update or delete on public.treinamento_declaracao_texto for each row execute function public.trilha_imutavel()"
    )
  );
  assert.ok(
    sql.includes(
      "create trigger trilha_imutavel_truncate before truncate on public.treinamento_declaracao_texto for each statement execute function public.trilha_imutavel()"
    )
  );
  // e a migração avisa com clareza se a 0135 não foi aplicada
  assert.ok(sql.includes("to_regprocedure('public.trilha_imutavel()') is null"));
  assert.ok(sql.includes("Falta a migração 0135"));
});

test("é reaplicável: policies e triggers são recriados; tabela, colunas e índice 'if not exists'", () => {
  assert.ok(sql.includes("drop trigger if exists declaracao_texto_pelo_banco on"));
  assert.ok(sql.includes("drop trigger if exists trilha_imutavel on"));
  assert.ok(sql.includes("drop trigger if exists trilha_imutavel_truncate on"));
  assert.ok(sql.includes("drop constraint if exists treinamento_declaracao_texto_texto_chk"));
  assert.ok(sql.includes("drop constraint if exists treinamento_declaracao_texto_art_chk"));
  assert.ok(sql.includes("drop constraint if exists treinamento_declaracao_texto_versao_chk"));
});
