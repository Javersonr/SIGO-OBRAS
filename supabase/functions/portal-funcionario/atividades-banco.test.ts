// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/atividades-banco.test.ts
//
// Guarda das atividades interativas no banco (spec 2026-10-14 §6): migração `0170_ead_atividades_interativas.sql`
// e o smoke `tools/smoke-ead-atividades.sql`. Não há banco de teste (nem Postgres no PC) e `npm run dev` fala com
// produção, então o que se confere aqui é a FORMA dos arquivos; o comportamento no banco é o do smoke
// (begin ... rollback), que o Javerson roda. O pareamento dos `$$` de todas as migrações e dos smokes do EAD é do
// `migracoes-delimitadores.test.ts`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const lerArquivo = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), "utf8");
const pasta = join(RAIZ, "supabase", "migrations");
const arquivos0170 = readdirSync(pasta).filter((n) => /^0170_.+\.sql$/.test(n));

test("existe exatamente uma migração 0170 (o número desta tarefa)", () => {
  assert.deepEqual(arquivos0170, ["0170_ead_atividades_interativas.sql"]);
});

const migracao = lerArquivo("supabase", "migrations", arquivos0170[0] ?? "0170_ausente.sql");

/** SQL sem comentário de linha (a migração não tem `--` dentro de texto entre aspas). */
const semComentarios = (sql: string) =>
  sql
    .split("\n")
    .map((linha) => linha.replace(/--.*$/, ""))
    .join("\n");
const compacto = (sql: string) => sql.replace(/\s+/g, " ").trim();
const sql = compacto(semComentarios(migracao));
/** A migração sem os corpos das funções: o que roda ao aplicar (os corpos só rodam quando chamados). */
const foraDasFuncoes = sql.replace(/\$\$.*?\$\$/g, "$$$$");
/**
 * O corpo de `create or replace function public.<nome>(...) ... as $$ ... $$;` (compactado), do PRIMEIRO `$$` que o
 * abre ao primeiro `$$;` que o fecha. Entre o cabeçalho e o `$$` não pode haver `$` (`[^$]*?`): um `as $` sozinho
 * não casa e o teste falha, em vez de atravessar até a função seguinte (o defeito da 0143).
 */
const corpo = (nome: string) =>
  new RegExp(`create or replace function public\\.${nome}\\([^)]*\\)[^$]*?\\$\\$(.*?)\\$\\$;`).exec(
    sql
  )?.[1] ?? "";

const FUNCOES = ["questao_do_questionario", "caso_da_aula", "importar_atividades_ead"];

// ------------------------------------------------------------------------------------------------- arquivo
test("termina em select 'ok' as res;, roda numa transação só e pede o bloqueio com lock_timeout", () => {
  assert.ok(migracao.trimEnd().endsWith("select 'ok' as res;"));
  assert.equal([...sql.matchAll(/\bbegin;/g)].length, 1);
  assert.equal([...sql.matchAll(/\bcommit;/g)].length, 1);
  assert.ok(sql.indexOf("set local lock_timeout = '10s';") < sql.indexOf("alter table"));
});

test("três funções, cada uma com o próprio $$, e nenhum corpo atravessa outra função", () => {
  const nomes = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(nomes, FUNCOES);
  assert.equal([...sql.matchAll(/\$/g)].length, FUNCOES.length * 4, "sem $ solto");
  for (const nome of FUNCOES) {
    const f = corpo(nome);
    assert.ok(f, `${nome}: corpo não encontrado`);
    assert.ok(
      !f.includes("create or replace function"),
      `${nome}: o corpo atravessou outra função`
    );
    assert.ok(f.includes("begin") && /end; ?$/.test(f), `${nome}: corpo sem begin/end`);
  }
  assert.equal(/\bcreate function\b/.test(sql), false, "função só com create or replace");
});

test("não grava dado real ao aplicar: INSERT/UPDATE/DELETE só dentro do corpo da RPC", () => {
  assert.equal(/\bupdate public\./.test(foraDasFuncoes), false, "UPDATE fora de função");
  assert.equal(/\binsert into\b/.test(foraDasFuncoes), false, "INSERT fora de função");
  assert.equal(/\bdelete from\b/.test(foraDasFuncoes), false, "DELETE fora de função");
  assert.equal(/\btruncate public\./.test(foraDasFuncoes), false, "TRUNCATE fora de função");
  for (const nome of ["questao_do_questionario", "caso_da_aula"]) {
    assert.equal(/\b(insert|update|delete)\b/.test(corpo(nome)), false, `${nome} só lê`);
  }
});

test("idempotente: restrição, trigger e policy derrubados antes; colunas, tabelas e índices com if not exists", () => {
  for (const m of sql.matchAll(/alter table (public\.\w+) add constraint (\w+)/g)) {
    assert.ok(
      sql.includes(`alter table ${m[1]} drop constraint if exists ${m[2]};`),
      `${m[2]} sem drop constraint if exists`
    );
  }
  for (const m of foraDasFuncoes.matchAll(
    /create trigger (\w+) (?:before|after) .*? on (public\.\w+)/g
  )) {
    assert.ok(sql.includes(`drop trigger if exists ${m[1]} on ${m[2]};`), `${m[1]} em ${m[2]}`);
  }
  for (const m of sql.matchAll(/create policy (\w+) on (public\.\w+)/g)) {
    assert.ok(sql.includes(`drop policy if exists ${m[1]} on ${m[2]};`), `${m[1]} em ${m[2]}`);
  }
  assert.equal(/add column (?!if not exists)/.test(sql), false);
  assert.equal(/create table (?!if not exists)/.test(sql), false);
  assert.equal(/create (unique )?index (?!if not exists)/.test(sql), false);
});

// ------------------------------------------------------------------------------------- aula, questão, curso
test("tipos de aula: o CHECK aceita os três tipos novos além de vídeo, PDF e texto", () => {
  assert.ok(
    sql.includes(
      "alter table public.treinamento_aula add constraint treinamento_aula_tipo_chk check (tipo in ('video', 'pdf', 'texto', 'questionario', 'caso', 'tarefa'));"
    )
  );
  assert.ok(
    sql.includes(
      "alter table public.treinamento_aula drop constraint if exists treinamento_aula_tipo_chk;"
    )
  );
});

test("codigo_origem: coluna e único parcial (curso, código) entre as aulas vivas", () => {
  assert.ok(
    sql.includes("alter table public.treinamento_aula add column if not exists codigo_origem text;")
  );
  assert.ok(
    sql.includes(
      "create unique index if not exists treinamento_aula_codigo_origem_uniq on public.treinamento_aula(curso_id, codigo_origem) where deleted_at is null and codigo_origem is not null;"
    )
  );
});

test("questão: aula_id (vazio = prova final) com FK em cascata, índice e referências da mesma empresa", () => {
  assert.ok(
    sql.includes(
      "alter table public.treinamento_questao add column if not exists aula_id uuid references public.treinamento_aula(id) on delete cascade;"
    )
  );
  assert.ok(
    sql.includes(
      "create index if not exists trein_questao_aula_idx on public.treinamento_questao(aula_id);"
    )
  );
  assert.ok(
    sql.includes(
      "create trigger referencias_da_empresa before insert or update of curso_id, empresa_id, aula_id on public.treinamento_questao for each row execute function public.exigir_referencias_da_empresa( 'curso_id:treinamento_curso', 'aula_id:treinamento_aula' );"
    )
  );
  // a 0118 pula a coluna vazia: a questão da prova final (aula_id NULL) continua gravável
  const da0118 = lerArquivo("supabase", "migrations", "0118_referencias_da_mesma_empresa.sql");
  assert.ok(da0118.includes("continue when valor is null;"));
});

test("questao_do_questionario: a aula é do mesmo curso e empresa, viva e do tipo questionário (23514)", () => {
  const f = corpo("questao_do_questionario");
  // não é SECURITY DEFINER: roda com os direitos (e a RLS) de quem grava, como pratica_participante_coerente
  for (const nome of ["questao_do_questionario", "caso_da_aula"]) {
    const inicio = sql.indexOf(`create or replace function public.${nome}()`);
    assert.equal(sql.slice(inicio, sql.indexOf("$$", inicio)).includes("security definer"), false);
  }
  assert.ok(f.includes("if new.aula_id is null then return new;"), "a prova final passa");
  for (const trecho of [
    "a.id = new.aula_id",
    "a.curso_id = new.curso_id",
    "a.empresa_id = new.empresa_id",
    "(a.deleted_at is null or new.deleted_at is not null)",
    "v_tipo is distinct from 'questionario'",
  ]) {
    assert.ok(f.includes(trecho), trecho);
  }
  assert.equal([...f.matchAll(/using errcode = '23514'/g)].length, 2);
  assert.ok(
    sql.includes(
      "create trigger questao_do_questionario before insert or update of aula_id, curso_id on public.treinamento_questao for each row execute function public.questao_do_questionario();"
    )
  );
  assert.ok(
    sql.includes(
      "revoke all on function public.questao_do_questionario() from public, anon, authenticated;"
    )
  );
});

test("nota mínima do módulo: inteiro, padrão 80, de 0 a 100, fora do que o cadastro central copia", () => {
  assert.ok(
    sql.includes(
      "alter table public.treinamento_curso add column if not exists nota_minima_modulo integer not null default 80;"
    )
  );
  assert.ok(
    sql.includes(
      "add constraint treinamento_curso_nota_minima_modulo_chk check (nota_minima_modulo between 0 and 100);"
    )
  );
  const da0139 = lerArquivo("supabase", "migrations", "0139_ead_travas_de_integridade.sql");
  assert.equal(da0139.includes("nota_minima_modulo"), false);
  assert.equal(sql.includes("validar_modelo_de_treinamento"), false);
});

// --------------------------------------------------------------------------------------- roteiro do caso
test("treinamento_caso: colunas, objeto JSON, um roteiro vivo por aula e índice do curso", () => {
  const tabela =
    /create table if not exists public\.treinamento_caso \((.*?)\);/.exec(sql)?.[1] ?? "";
  for (const coluna of [
    "id uuid primary key default gen_random_uuid()",
    "empresa_id uuid not null references public.empresa(id) on delete cascade",
    "curso_id uuid not null references public.treinamento_curso(id) on delete cascade",
    "aula_id uuid not null references public.treinamento_aula(id) on delete cascade",
    "conteudo jsonb not null",
    "created_at timestamptz not null default now()",
    "updated_at timestamptz not null default now()",
    "deleted_at timestamptz",
  ]) {
    assert.ok(tabela.includes(coluna), coluna);
  }
  assert.ok(
    sql.includes(
      "add constraint treinamento_caso_conteudo_chk check (jsonb_typeof(conteudo) = 'object');"
    )
  );
  assert.ok(
    sql.includes(
      "create unique index if not exists treinamento_caso_aula_uniq on public.treinamento_caso(aula_id) where deleted_at is null;"
    )
  );
  assert.ok(
    sql.includes(
      "create index if not exists treinamento_caso_curso_idx on public.treinamento_caso(curso_id);"
    )
  );
});

test("treinamento_caso: RLS da empresa, leitura só com a aba (restritiva), nada para anon, sem DELETE", () => {
  const t = "public.treinamento_caso";
  assert.ok(sql.includes(`drop policy if exists super_admin_all on ${t};`));
  assert.ok(sql.includes(`drop policy if exists tenant_isolation on ${t};`));
  assert.ok(
    sql.indexOf(`drop policy if exists tenant_isolation on ${t};`) <
      sql.indexOf("select apply_tenant_rls('treinamento_caso');")
  );
  assert.ok(
    sql.includes(
      `create policy ead_leitura_com_permissao on ${t} as restrictive for select to authenticated using ((select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD')));`
    )
  );
  assert.ok(sql.includes(`revoke all on ${t} from anon;`));
  assert.ok(sql.includes(`revoke delete, truncate on ${t} from authenticated;`));
  assert.ok(sql.includes("select attach_updated_at_trigger('treinamento_caso');"));
});

test("treinamento_caso: referências da empresa, caso_da_aula (23514) e zz_permissao_ead sem reescrever a função", () => {
  assert.ok(
    sql.includes(
      "create trigger referencias_da_empresa before insert or update of curso_id, aula_id, empresa_id on public.treinamento_caso for each row execute function public.exigir_referencias_da_empresa( 'curso_id:treinamento_curso', 'aula_id:treinamento_aula' );"
    )
  );
  const f = corpo("caso_da_aula");
  for (const trecho of [
    "a.id = new.aula_id",
    "a.curso_id = new.curso_id",
    "a.empresa_id = new.empresa_id",
    "(a.deleted_at is null or new.deleted_at is not null)",
    "v_tipo is distinct from 'caso'",
  ]) {
    assert.ok(f.includes(trecho), trecho);
  }
  assert.equal([...f.matchAll(/using errcode = '23514'/g)].length, 2);
  assert.ok(
    sql.includes(
      "create trigger caso_da_aula before insert or update of aula_id, curso_id on public.treinamento_caso for each row execute function public.caso_da_aula();"
    )
  );
  assert.ok(
    sql.includes(
      "create trigger zz_permissao_ead before insert or update on public.treinamento_caso for each row execute function public.zz_permissao_ead();"
    )
  );
  // a função da 0147 não muda: o ramo padrão (Editar) já cobre a tabela nova
  assert.equal(sql.includes("create or replace function public.zz_permissao_ead"), false);
  const da0147 = lerArquivo("supabase", "migrations", "0147_permissoes_ead.sql");
  assert.match(
    da0147,
    /else\s+-- treinamento_aula, treinamento_questao[^\n]*\n[^\n]*\n\s+v_exige := array\['editar'\];/
  );
});

test("os triggers novos disparam ANTES do zz_permissao_ead (ordem de bytes, como o Postgres)", () => {
  const novos = [...foraDasFuncoes.matchAll(/create trigger (\w+) before/g)].map((m) => m[1]);
  assert.ok(novos.includes("questao_do_questionario") && novos.includes("caso_da_aula"));
  for (const nome of novos) {
    if (nome === "zz_permissao_ead") continue;
    assert.ok(Buffer.compare(Buffer.from(nome), Buffer.from("zz_permissao_ead")) < 0, nome);
    assert.equal(nome.startsWith("zz"), false, nome);
  }
});

// ------------------------------------------------------------------------------- tentativas do questionário
test("treinamento_questionario_tentativa: colunas, número >= 1 e único por matrícula, aula e número", () => {
  const tabela =
    /create table if not exists public\.treinamento_questionario_tentativa \((.*?)\);/.exec(
      sql
    )?.[1] ?? "";
  for (const coluna of [
    "empresa_id uuid not null references public.empresa(id) on delete cascade",
    "matricula_id uuid not null references public.treinamento_matricula(id) on delete cascade",
    "curso_id uuid not null",
    "aula_id uuid not null references public.treinamento_aula(id) on delete cascade",
    "funcionario_id uuid not null references public.funcionario(id) on delete cascade",
    "numero integer not null",
    "prova jsonb not null",
    "respostas jsonb not null",
    "acertos integer not null",
    "total integer not null",
    "nota numeric not null",
    "aprovada boolean not null",
    "ip text",
    "dispositivo text",
    "created_at timestamptz not null default now()",
    "unique (matricula_id, aula_id, numero)",
  ]) {
    assert.ok(tabela.includes(coluna), coluna);
  }
  assert.ok(
    sql.includes(
      "add constraint treinamento_questionario_tentativa_numero_chk check (numero >= 1);"
    )
  );
});

test("tentativas: só o servidor grava, leitura da empresa com a aba, imutáveis (trilha_imutavel da 0135)", () => {
  const t = "public.treinamento_questionario_tentativa";
  assert.ok(sql.includes(`alter table ${t} enable row level security;`));
  assert.ok(
    sql.includes(
      `create policy tenant_read on ${t} for select using (empresa_id = public.current_empresa_id());`
    )
  );
  assert.ok(
    sql.includes(
      `create policy super_admin_read on ${t} for select using (public.current_user_is_super_admin());`
    )
  );
  assert.ok(
    sql.includes(`create policy ead_leitura_com_permissao on ${t} as restrictive for select`)
  );
  // nenhuma policy de escrita: INSERT/UPDATE/DELETE só pelo service role
  assert.equal(
    new RegExp(`create policy \\w+ on ${t} for (insert|update|delete|all)`).test(sql),
    false
  );
  assert.ok(sql.includes(`revoke all on ${t} from anon;`));
  assert.ok(sql.includes(`revoke insert, update, delete, truncate on ${t} from authenticated;`));
  assert.ok(
    sql.includes(
      `create trigger trilha_imutavel before update or delete on ${t} for each row execute function public.trilha_imutavel();`
    )
  );
  assert.ok(
    sql.includes(
      `create trigger trilha_imutavel_truncate before truncate on ${t} for each statement execute function public.trilha_imutavel();`
    )
  );
  assert.equal(
    sql.includes("create or replace function public.trilha_imutavel"),
    false,
    "a função da 0135 não muda"
  );
  assert.ok(
    sql.includes(
      "public.exigir_referencias_da_empresa( 'matricula_id:treinamento_matricula', 'curso_id:treinamento_curso', 'aula_id:treinamento_aula', 'funcionario_id:funcionario' );"
    )
  );
});

// ------------------------------------------------------------------------------------- RPC de importação
const rpc = corpo("importar_atividades_ead");

test("RPC: SECURITY DEFINER, search_path fixo, curso travado, empresa e Editar antes de tudo; grants da 0110", () => {
  const cabecalho = sql.slice(
    sql.indexOf("create or replace function public.importar_atividades_ead("),
    sql.indexOf("$$", sql.indexOf("create or replace function public.importar_atividades_ead("))
  );
  assert.ok(
    cabecalho.includes(
      "(p_curso_id uuid, p_atividades jsonb) returns jsonb language plpgsql security definer set search_path = public as"
    )
  );
  const trava = rpc.indexOf("for update;");
  const empresa = rpc.indexOf(
    "perform public.exigir_empresa_do_chamador(v_curso.empresa_id, 'curso');"
  );
  const permissao = rpc.indexOf(
    "if not public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD', 'editar') then"
  );
  const primeiraEscrita = rpc.search(/\b(insert into|update public\.)/);
  assert.ok(trava > 0 && empresa > trava && permissao > empresa, "trava, empresa, permissão");
  assert.ok(primeiraEscrita > permissao, "nada é gravado antes das conferências");
  assert.match(rpc, /Treinamentos EAD → Editar \(importar atividades\)' using errcode = '42501'/);
  assert.ok(
    sql.includes(
      "revoke all on function public.importar_atividades_ead(uuid, jsonb) from public, anon, authenticated;"
    )
  );
  assert.ok(
    sql.includes(
      "grant execute on function public.importar_atividades_ead(uuid, jsonb) to authenticated, service_role;"
    )
  );
});

test("RPC: confere o lote inteiro antes de gravar (22023 com o código), recusa código repetido na lista", () => {
  const conferencia = rpc.slice(0, rpc.indexOf("for v_grupo in"));
  assert.ok(rpc.includes("jsonb_typeof(p_atividades) <> 'array'"));
  assert.ok(
    rpc.includes(
      "if v_codigo = any (v_vistos) then raise exception 'Código de origem repetido na lista: %'"
    )
  );
  assert.ok(rpc.includes("v_tipo not in ('questionario', 'caso', 'tarefa')"));
  assert.ok(rpc.includes("v_duracao < 1 or v_duracao > 86400"));
  assert.ok(rpc.includes("jsonb_array_length(v_opcoes) not between 2 and 6"));
  assert.ok(rpc.includes("v_correta >= jsonb_array_length(v_opcoes)"));
  // toda recusa de formato é 22023 e cita a atividade (código ou posição)
  const recusas = [
    ...conferencia.matchAll(/raise exception '([^']*)'[^;]*?using errcode = '(\w+)'/g),
  ];
  const deFormato = recusas.filter(([, , codigo]) => codigo === "22023");
  assert.ok(deFormato.length >= 15, `recusas 22023: ${deFormato.length}`);
  for (const [, mensagem] of deFormato) {
    if (/^(A importação precisa|No máximo 300)/.test(mensagem)) continue;
    assert.match(mensagem, /^(Atividade (nº )?%|Código de origem repetido na lista: %)/, mensagem);
  }
  // nenhuma recusa depois do 1º passo: quando começa a gravar, já conferiu tudo
  assert.ok(rpc.lastIndexOf("raise exception") < rpc.indexOf("for v_grupo in"));
});

test("RPC: pula o código já existente no curso e confere a aula de referência só de quem vai entrar", () => {
  const pula = rpc.indexOf("a.codigo_origem = v_codigo and a.deleted_at is null");
  const ancora = rpc.indexOf(
    "where a.id = v_ancora and a.curso_id = v_curso.id and a.deleted_at is null;"
  );
  assert.ok(pula > 0, "pula o existente");
  assert.ok(rpc.includes("v_puladas := v_puladas + 1; continue;"));
  assert.ok(ancora > pula, "a aula de referência é conferida depois do pulo");
  assert.match(
    rpc,
    /a aula de referência \(depois_da_aula_id\) não é deste curso ou foi apagada', v_codigo using errcode = '22023'/
  );
  // o módulo do item com aula de referência é o da aula (o do item é ignorado)
  assert.ok(
    rpc.includes(
      "select a.modulo into v_modulo from public.treinamento_aula a where a.id = v_ancora"
    )
  );
});

test("RPC: agrupa pela aula de referência ou pelo módulo e abre espaço com UM UPDATE de ordem por grupo", () => {
  assert.ok(
    rpc.includes(
      "group by n.ancora, (case when n.ancora is null then n.modulo end) order by min(n.pos)"
    )
  );
  // com aula de referência: logo depois dela; sem: depois da última do módulo, ou no fim do curso
  assert.ok(
    rpc.includes(
      "select a.ordem into v_base from public.treinamento_aula a where a.id = v_grupo.ancora;"
    )
  );
  assert.ok(rpc.includes("a.modulo is not distinct from v_grupo.chave_modulo"));
  assert.ok(rpc.includes("select coalesce(max(a.ordem), 0) into v_base"));
  // um único UPDATE no corpo, dentro do laço dos grupos, antes dos INSERT do grupo
  const updates = [...rpc.matchAll(/\bupdate public\.treinamento_aula\b/g)];
  assert.equal(updates.length, 1);
  assert.ok(
    rpc.includes(
      "update public.treinamento_aula a set ordem = a.ordem + v_grupo.qtd where a.curso_id = v_curso.id and a.deleted_at is null and a.ordem > v_base;"
    )
  );
  assert.ok(rpc.indexOf("for v_grupo in") < updates[0].index!);
  assert.ok(updates[0].index! < rpc.indexOf("insert into public.treinamento_aula"));
});

test("RPC: grava aula, questões (ordem 1..n, aula_id) ou roteiro e devolve { criadas, puladas, questoes }", () => {
  assert.ok(
    rpc.includes(
      "insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, duracao_seg, conteudo_texto, codigo_origem) values (v_curso.empresa_id, v_curso.id, v_base + v_seq, v_grupo.modulo,"
    )
  );
  assert.ok(
    rpc.includes(
      "insert into public.treinamento_questao (empresa_id, curso_id, aula_id, ordem, pergunta, opcoes, correta, comentario)"
    )
  );
  assert.ok(rpc.includes("with ordinality as q(value, ordem)"));
  assert.ok(
    rpc.includes(
      "insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo) values (v_curso.empresa_id, v_curso.id, v_aula_id, v_novo.item -> 'caso');"
    )
  );
  assert.ok(
    rpc.includes(
      "return jsonb_build_object('criadas', v_criadas, 'puladas', v_puladas, 'questoes', v_questoes);"
    )
  );
  // a RPC não apaga nada e não desliga trigger nenhum (o zz_permissao_ead vale lá dentro)
  assert.equal(/\bdelete from\b|disable trigger|session_replication_role/.test(rpc), false);
});

test("conferência final: o zz_permissao_ead continua o último BEFORE (ordem C) e nada muda no dado", () => {
  const depois = sql.slice(sql.indexOf("commit;"));
  assert.ok(depois.includes('max(t.tgname::text collate "C")'));
  assert.ok(depois.includes("as tabelas_com_trigger_depois_do_zz"));
  assert.ok(depois.includes("as triggers_zz_de_9"));
  assert.ok(depois.includes("as rpc_executavel_pela_api"));
  assert.ok(depois.includes("as aulas_com_tipo_novo"));
});

// ------------------------------------------------------------------------------------------------ smoke
const smoke = lerArquivo("tools", "smoke-ead-atividades.sql");

test("smoke da 0170: transação que termina em rollback, sem UUID fixo, como authenticated com token simulado", () => {
  assert.ok(/^begin;$/m.test(smoke));
  assert.ok(smoke.trimEnd().endsWith("rollback;"));
  assert.ok(smoke.includes("SMOKE TEST OK"));
  assert.equal(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(smoke),
    false,
    "UUID fixo no smoke"
  );
  assert.ok(smoke.includes("set local role authenticated"));
  assert.ok(smoke.includes("request.jwt.claims"));
  assert.ok(smoke.includes("@exemplo.test"));
});

test("smoke da 0170: confere cada trava da spec §6", () => {
  for (const trecho of [
    "'questionario'",
    "'caso'",
    "'tarefa'",
    "treinamento_aula_tipo_chk",
    "A questão só entra numa aula do tipo questionário%",
    "A questão do questionário precisa de uma aula viva do mesmo curso%",
    "O roteiro só entra numa aula do tipo caso%",
    "treinamento_caso_conteudo_chk",
    "treinamento_caso_aula_uniq",
    "treinamento_curso_nota_minima_modulo_chk",
    "permission denied%",
    "Acesso negado: o registro de auditoria%",
    "importar_atividades_ead",
    "Sem permissão: Segurança do Trabalho → Treinamentos EAD → Editar%",
    "Código de origem repetido na lista%",
    "depois_da_aula_id",
    "a aula de referência (depois_da_aula_id) não é deste curso ou foi apagada%",
    "'criadas', 0",
    "zz_permissao_ead",
    "23514",
    "22023",
    "42501",
  ]) {
    assert.ok(smoke.includes(trecho), trecho);
  }
});
