// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/pratica-banco.test.ts
//
// Guarda da T12 (parte prática presencial): migração `0143_ead_pratica_presencial.sql`. Não há banco de teste (nem
// Postgres no PC) e `npm run dev` fala com produção, então o que se confere aqui é a FORMA do arquivo; o
// comportamento no banco é o do `tools/smoke-ead-pratica.sql` (begin ... rollback), que o Javerson roda.
//   - o número é o próximo livre e é um arquivo só; termina em `select 'ok' as res;` e roda numa transação;
//   - as cargas teórica e prática são colunas do curso EAD que o trigger do cadastro central (0131/0139) não toca;
//   - as duas tabelas têm RLS por empresa, nada para anon e nada de DELETE/TRUNCATE para authenticated;
//   - avaliado_por/avaliado_em vêm do trigger; participante coerente (mesmo curso, funcionário da matrícula, nada no
//     futuro); "satisfatório" exige presença; único por sessão + matrícula entre os vivos;
//   - referências da mesma empresa (0118) e a lista assinada só como referência do bucket treinamentos;
//   - a migração não grava dado real (nenhum UPDATE/INSERT/DELETE em tabela que já existe).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const pasta = join(RAIZ, "supabase", "migrations");
const arquivos0143 = readdirSync(pasta).filter((n) => /^0143_.+\.sql$/.test(n));

test("existe exatamente uma migração 0143 (o número desta tarefa)", () => {
  assert.equal(arquivos0143.length, 1, `achei: ${arquivos0143.join(", ") || "nenhuma"}`);
});

const migracao = readFileSync(join(pasta, arquivos0143[0] ?? "0143_ausente.sql"), "utf8");
const migracao0139 = readFileSync(join(pasta, "0139_ead_travas_de_integridade.sql"), "utf8");

/** SQL sem comentário de linha (a migração não tem `--` dentro de texto entre aspas). */
const semComentarios = (sql: string) =>
  sql
    .split("\n")
    .map((linha) => linha.replace(/--.*$/, ""))
    .join("\n");
const compacto = (sql: string) => sql.replace(/\s+/g, " ").trim();
const sql = compacto(semComentarios(migracao));
/** O corpo de uma função `create or replace function public.<nome>() ... $$ ... $$;` (compactado). */
const corpo = (nome: string) =>
  new RegExp(`create or replace function public\\.${nome}\\(\\)(.*?)\\$\\$;`).exec(sql)?.[1] ?? "";

test("termina em select 'ok' as res; e roda numa transação só", () => {
  assert.ok(migracao.trimEnd().endsWith("select 'ok' as res;"));
  assert.equal([...sql.matchAll(/\bbegin;/g)].length, 1);
  assert.equal([...sql.matchAll(/\bcommit;/g)].length, 1);
});

test("não grava dado real: nenhum UPDATE, INSERT ou DELETE de linhas", () => {
  assert.ok(!/\bupdate public\./.test(sql), "UPDATE em tabela");
  assert.ok(!/\binsert into\b/.test(sql), "INSERT");
  assert.ok(!/\bdelete from\b/.test(sql), "DELETE");
});

test("cargas teórica e prática: colunas do curso EAD, positivas, fora do que o cadastro central copia", () => {
  assert.ok(sql.includes("add column if not exists carga_teorica_horas numeric"));
  assert.ok(sql.includes("add column if not exists carga_pratica_horas numeric"));
  assert.ok(
    sql.includes(
      "check (carga_teorica_horas is null or (carga_teorica_horas > 0 and carga_teorica_horas <= 1000))"
    )
  );
  assert.ok(
    sql.includes(
      "check (carga_pratica_horas is null or (carga_pratica_horas > 0 and carga_pratica_horas <= 1000))"
    )
  );
  // C3: o trigger que copia o modelo (a versão vigente é a da 0139) não menciona as colunas novas
  const sincroniza =
    /create or replace function public\.validar_modelo_de_treinamento\(\)[\s\S]*?\$\$;/.exec(
      migracao0139
    )?.[0];
  assert.ok(sincroniza, "a 0139 recria validar_modelo_de_treinamento");
  assert.ok(!/carga_teorica_horas|carga_pratica_horas/.test(sincroniza));
  // e esta migração não mexe nele
  assert.ok(!sql.includes("validar_modelo_de_treinamento"));
});

test("sessão prática: curso, data, horário, carga, local, instrutor, lista assinada e exclusão lógica", () => {
  const tabela =
    /create table if not exists public\.treinamento_sessao_pratica \((.*?)\);/.exec(sql)?.[1] ?? "";
  for (const coluna of [
    "empresa_id uuid not null references public.empresa(id) on delete cascade",
    "curso_id uuid not null references public.treinamento_curso(id) on delete cascade",
    "data date not null",
    "hora_inicio time not null",
    "hora_fim time not null",
    "carga_horas numeric not null",
    "local text not null",
    "instrutor_nome text not null",
    "instrutor_qualificacao text",
    "observacoes text",
    "lista_presenca_ref text",
    "deleted_at timestamptz",
  ]) {
    assert.ok(tabela.includes(coluna), coluna);
  }
  assert.ok(sql.includes("check (hora_fim > hora_inicio)"));
  assert.ok(sql.includes("check (carga_horas > 0 and carga_horas <= 24)"));
  assert.ok(sql.includes("char_length(btrim(local)) between 3 and 120"));
  // a lista assinada é referência da pasta da empresa no bucket treinamentos (nunca URL assinada)
  assert.ok(
    sql.includes(
      "lista_presenca_ref is null or lista_presenca_ref like ('treinamentos/' || empresa_id::text || '/%')"
    )
  );
});

test("participante: sessão, matrícula, funcionário, presença, resultado, avaliação e observação", () => {
  const tabela =
    /create table if not exists public\.treinamento_pratica_participante \((.*?)\);/.exec(
      sql
    )?.[1] ?? "";
  for (const coluna of [
    "sessao_id uuid not null references public.treinamento_sessao_pratica(id) on delete cascade",
    "matricula_id uuid not null references public.treinamento_matricula(id) on delete cascade",
    "funcionario_id uuid not null references public.funcionario(id) on delete cascade",
    "presente boolean not null default false",
    "resultado text not null default 'pendente'",
    "avaliado_por uuid",
    "avaliado_em timestamptz",
    "observacao text",
    "deleted_at timestamptz",
  ]) {
    assert.ok(tabela.includes(coluna), coluna);
  }
  assert.ok(sql.includes("check (resultado in ('pendente', 'satisfatorio', 'insatisfatorio'))"));
  assert.ok(sql.includes("check (resultado <> 'satisfatorio' or presente)"));
  // único por sessão + matrícula entre os não apagados
  assert.ok(
    sql.includes(
      "create unique index if not exists treinamento_pratica_participante_unico_idx on public.treinamento_pratica_participante(sessao_id, matricula_id) where deleted_at is null"
    )
  );
});

test("RLS por empresa (apply_tenant_rls, reaplicável), nada para anon, sem DELETE de verdade", () => {
  for (const t of ["treinamento_sessao_pratica", "treinamento_pratica_participante"]) {
    assert.ok(sql.includes(`drop policy if exists super_admin_all on public.${t};`), t);
    assert.ok(sql.includes(`drop policy if exists tenant_isolation on public.${t};`), t);
    assert.ok(sql.includes(`select apply_tenant_rls('${t}');`), t);
    assert.ok(sql.includes(`revoke all on public.${t} from anon;`), t);
    assert.ok(sql.includes(`revoke delete, truncate on public.${t} from authenticated;`), t);
    assert.ok(sql.includes(`select attach_updated_at_trigger('${t}');`), t);
    // a policy só é recriada DEPOIS de derrubada
    assert.ok(
      sql.indexOf(`drop policy if exists tenant_isolation on public.${t};`) <
        sql.indexOf(`select apply_tenant_rls('${t}');`)
    );
  }
});

test("referências da mesma empresa (0118) nas colunas que apontam para outra tabela", () => {
  assert.ok(
    sql.includes(
      "before insert or update of curso_id, empresa_id on public.treinamento_sessao_pratica for each row execute function public.exigir_referencias_da_empresa('curso_id:treinamento_curso');"
    )
  );
  assert.ok(
    sql.includes(
      "for each row execute function public.exigir_referencias_da_empresa( 'sessao_id:treinamento_sessao_pratica', 'matricula_id:treinamento_matricula', 'funcionario_id:funcionario' );"
    )
  );
});

test("avaliado_por e avaliado_em: sempre do banco (auth.uid() e now()), nunca do cliente", () => {
  const f = corpo("pratica_avaliacao_pelo_banco");
  assert.ok(f, "função não encontrada");
  assert.ok(f.includes("new.avaliado_por := auth.uid();"));
  assert.ok(f.includes("new.avaliado_em := now();"));
  // sem mudança na presença/resultado, mantém o que estava (o cliente não reescreve)
  assert.ok(f.includes("new.avaliado_por := old.avaliado_por;"));
  assert.ok(f.includes("new.avaliado_em := old.avaliado_em;"));
  assert.ok(
    f.includes("(new.presente, new.resultado) is distinct from (old.presente, old.resultado)")
  );
  assert.ok(
    sql.includes(
      "revoke all on function public.pratica_avaliacao_pelo_banco() from public, anon, authenticated;"
    )
  );
  assert.ok(
    sql.includes(
      "create trigger pratica_avaliacao_pelo_banco before insert or update on public.treinamento_pratica_participante"
    )
  );
});

test("participante coerente: mesma empresa, mesmo curso, funcionário da matrícula, imutável e nada no futuro", () => {
  const f = corpo("pratica_participante_coerente");
  assert.ok(f, "função não encontrada");
  // sem security definer: roda com os direitos (e a RLS) de quem grava
  assert.ok(!/security definer/.test(f));
  assert.ok(f.includes("and m.empresa_id = new.empresa_id"));
  assert.ok(f.includes("and s.empresa_id = new.empresa_id"));
  assert.ok(f.includes("v_matricula.curso_id is distinct from v_sessao.curso_id"));
  assert.ok(f.includes("new.funcionario_id := v_matricula.funcionario_id;"));
  assert.ok(
    f.includes(
      "(new.sessao_id, new.matricula_id, new.funcionario_id, new.empresa_id) is distinct from (old.sessao_id, old.matricula_id, old.funcionario_id, old.empresa_id)"
    )
  );
  // Brasília, e só recusa quando há presença ou resultado (excluir sempre pode)
  assert.ok(f.includes("(now() at time zone 'America/Sao_Paulo')::date"));
  assert.ok(f.includes("v_sessao.data > v_hoje"));
  assert.ok(f.includes("new.deleted_at is null"));
  assert.ok(
    sql.includes(
      "create trigger pratica_participante_coerente before insert or update on public.treinamento_pratica_participante"
    )
  );
  // dispara antes de referencias_da_empresa (ordem alfabética dos triggers BEFORE)
  assert.ok("pratica_participante_coerente" < "referencias_da_empresa");
});

test("a descrição registra que a trava por permissão depende da T33", () => {
  assert.match(migracao, /depende da T33/);
  assert.match(sql, /comment on table public\.treinamento_pratica_participante is '.*T33/);
});

// ---------------------------------------------------------------------------------- A6 (revisões 1 e 2 da T12)

test("sessão: a carga não passa do tempo do horário (um CHECK barato, como o do horário) (N2)", () => {
  assert.ok(
    sql.includes(
      "add constraint treinamento_sessao_pratica_carga_horario_chk check (carga_horas * 3600 <= extract(epoch from (hora_fim - hora_inicio)))"
    )
  );
  assert.ok(sql.includes("drop constraint if exists treinamento_sessao_pratica_carga_horario_chk"));
  // a regra do front (validarSessao) e a do servidor (crédito por horário) dizem o mesmo
  const front = readFileSync(
    join(RAIZ, "apps", "web", "src", "lib", "ead-pratica.js"),
    "utf8"
  );
  assert.ok(front.includes("avisoDaCargaDaSessao") || front.includes("validarSessao"));
});

test("participante coerente: não entra em sessão ou matrícula apagada (só se está sendo excluído) (M1)", () => {
  const f = corpo("pratica_participante_coerente");
  assert.ok(f.includes("and (s.deleted_at is null or new.deleted_at is not null)"));
  assert.ok(f.includes("and (m.deleted_at is null or new.deleted_at is not null)"));
});

test("sessão com participantes: não troca de curso, e não vai para o futuro depois de lançados presença ou resultado (M2)", () => {
  const f = corpo("pratica_sessao_com_participantes");
  assert.ok(f, "função não encontrada");
  assert.ok(!/security definer/.test(f));
  // troca de curso: com qualquer participante vivo
  assert.ok(f.includes("new.curso_id is distinct from old.curso_id"));
  assert.ok(f.includes("from public.treinamento_pratica_participante p where p.sessao_id = new.id and p.deleted_at is null"));
  // data para o futuro: só se já há presença ou resultado lançados
  assert.ok(f.includes("(now() at time zone 'America/Sao_Paulo')::date"));
  assert.ok(f.includes("new.data > v_hoje"));
  assert.ok(f.includes("(p.presente or p.resultado <> 'pendente')"));
  assert.ok(
    sql.includes(
      "revoke all on function public.pratica_sessao_com_participantes() from public, anon, authenticated;"
    )
  );
  assert.ok(
    sql.includes(
      "create trigger pratica_sessao_com_participantes before update on public.treinamento_sessao_pratica"
    )
  );
});

test("a descrição da tabela de participantes diz que vale a SOMA das cargas, não 'uma sessão' (N5)", () => {
  const comentario = /comment on table public\.treinamento_pratica_participante is '(.*?)';/.exec(sql)?.[1] ?? "";
  assert.ok(comentario.includes("soma"), comentario);
  assert.ok(!comentario.includes("numa sessão viva do curso"), comentario);
  // o cabeçalho também
  assert.ok(!migracao.includes("presença + satisfatório numa sessão"));
  assert.ok(migracao.includes("soma das cargas"));
  // a conferência final conta os triggers novos
  assert.ok(sql.includes("'pratica_sessao_com_participantes'"));
  assert.ok(sql.includes("as triggers_de_5"));
});
