// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/_shared/portal-credencial-banco.test.ts
//
// Guarda da T38 no banco: migrações `0145_portal_credencial.sql` e `0146_portal_credencial_limpeza.sql` e os scripts
// do operador em `tools/`. Não há Postgres no PC (e `npm run dev` fala com produção), então aqui se confere a FORMA
// dos arquivos; o comportamento é o do `tools/smoke-portal-credencial.sql` (begin ... rollback), que o Javerson roda.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { OPERADOR_REDEFINIDA } from "./portal-credencial.ts";
import { EVENTO_ACESSO_AGUARDANDO_PROVISORIA } from "./portal-funcionario.ts";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const pasta = join(RAIZ, "supabase", "migrations");
const migracoes = readdirSync(pasta);
const ler = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), "utf8");

/** SQL sem comentário de linha e com os espaços juntados (as migrações não têm `--` dentro de texto). */
const compacto = (sql: string) =>
  sql
    .split("\n")
    .map((linha) => linha.replace(/--.*$/, ""))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();

const arquivo = (prefixo: string) => {
  const achados = migracoes.filter((n) => n.startsWith(`${prefixo}_`) && n.endsWith(".sql"));
  assert.equal(achados.length, 1, `${prefixo}: ${achados.join(", ") || "nenhuma"}`);
  return achados[0];
};

const bruta0145 = ler("supabase", "migrations", arquivo("0145"));
const bruta0146 = ler("supabase", "migrations", arquivo("0146"));
const m0145 = compacto(bruta0145);
const m0146 = compacto(bruta0146);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

test("0145 e 0146 são as desta tarefa (a 0147 é da T33) e terminam em select 'ok' as res;", () => {
  assert.equal(arquivo("0145"), "0145_portal_credencial.sql");
  assert.equal(arquivo("0146"), "0146_portal_credencial_limpeza.sql");
  assert.ok(
    migracoes.some((n) => n.startsWith("0147_")),
    "a 0147 da T33 continua"
  );
  for (const [nome, bruta, sql] of [
    ["0145", bruta0145, m0145],
    ["0146", bruta0146, m0146],
  ] as const) {
    assert.ok(bruta.trimEnd().endsWith("select 'ok' as res;"), nome);
    assert.equal([...sql.matchAll(/\bbegin;/g)].length, 1, `${nome}: um begin`);
    assert.equal([...sql.matchAll(/\bcommit;/g)].length, 1, `${nome}: um commit`);
    assert.equal(UUID.test(bruta), false, `${nome}: nenhum UUID fixo`);
  }
});

test("0145: credencial e registro do operador só do servidor (RLS sem policy, sem privilégio para a API)", () => {
  for (const tabela of ["portal_credencial", "portal_credencial_evento"]) {
    assert.ok(m0145.includes(`create table if not exists public.${tabela} (`), tabela);
    assert.ok(m0145.includes(`alter table public.${tabela} enable row level security;`), tabela);
    assert.ok(m0145.includes(`revoke all on public.${tabela} from anon, authenticated;`), tabela);
  }
  assert.ok(
    m0145.includes("revoke all on public.funcionario_portal_acesso from anon, authenticated;")
  );
  assert.equal(/\bcreate policy\b/.test(m0145), false, "nenhuma policy");
  assert.equal(/\bgrant\b/.test(m0145), false, "nenhum grant (nem das funções)");
  // a credencial não tem empresa_id (é a pessoa); o registro guarda a empresa do vínculo que agiu, sem o CPF
  const credencial = m0145.slice(
    m0145.indexOf("create table if not exists public.portal_credencial (")
  );
  assert.equal(/^[^;]*\bempresa_id uuid\b/.test(credencial), false);
  const registro = m0145.slice(
    m0145.indexOf("create table if not exists public.portal_credencial_evento (")
  );
  assert.match(registro, /^[^;]*credencial_id uuid not null,/);
  assert.equal(/^[^;]*(references|usuario|cpf)/.test(registro), false, "sem FK e sem o CPF");
  // só de inclusão, com a mesma trava da trilha
  assert.match(
    m0145,
    /before update or delete on public\.portal_credencial_evento for each row execute function public\.trilha_imutavel\(\)/
  );
  assert.match(
    m0145,
    /before truncate on public\.portal_credencial_evento for each statement execute function public\.trilha_imutavel\(\)/
  );
});

test("0145: usuário único, um vínculo ATIVO por pessoa e empresa, e o índice global do usuário fica até a 0146", () => {
  assert.match(
    m0145,
    /create unique index if not exists portal_credencial_usuario_uidx on public\.portal_credencial \(lower\(usuario\)\);/
  );
  assert.match(
    m0145,
    /create unique index if not exists funcionario_portal_acesso_credencial_empresa_uidx on public\.funcionario_portal_acesso \(credencial_id, empresa_id\) where ativo;/
  );
  assert.equal(m0145.includes("drop index"), false, "a 0145 não tira o índice global (R8)");
  assert.ok(
    m0145.includes(
      "alter table public.funcionario_portal_acesso alter column usuario drop not null;"
    )
  );
  assert.ok(
    m0145.includes(
      "alter table public.funcionario_portal_acesso alter column senha_hash drop not null;"
    )
  );
  for (const coluna of [
    "credencial_id uuid",
    "provisoria_hash text",
    "provisoria_criada_em timestamptz",
    "provisoria_expira_em timestamptz",
    "geracao_liberada integer",
    "confirmado_em timestamptz",
  ]) {
    assert.ok(m0145.includes(`add column if not exists ${coluna}`), coluna);
  }
  assert.match(m0145, /check \(tipo in \('cpf', 'manual'\)\)/);
  assert.match(m0145, /check \(tipo <> 'cpf' or usuario ~ '\^\[0-9\]\{11\}\$'\)/);
});

test("0145: a credencial sem vínculo some (delete ou religação), por trigger after", () => {
  assert.match(
    m0145,
    /after delete or update of credencial_id on public\.funcionario_portal_acesso for each row execute function public\.portal_credencial_sem_vinculo\(\)/
  );
  const funcao = m0145.slice(
    m0145.indexOf("create or replace function public.portal_credencial_sem_vinculo()")
  );
  assert.match(funcao, /security definer set search_path = public/);
  assert.match(
    funcao,
    /new\.credencial_id is not distinct from old\.credencial_id then return null/
  );
  assert.match(
    funcao,
    /delete from public\.portal_credencial c where c\.id = old\.credencial_id and not exists/
  );
});

test("0145: a cópia (P7) segue o §9.1 e é a MESMA função que a 0146 repete", () => {
  const copia = m0145.slice(
    m0145.indexOf("create or replace function public.portal_credencial_copiar_acessos()"),
    m0145.indexOf("revoke all on function public.portal_credencial_copiar_acessos()")
  );
  assert.ok(copia.length > 500, "corpo da cópia não encontrado");
  // só as linhas sem credencial (idempotente)
  assert.match(copia, /where a\.credencial_id is null/);
  // tipo cpf só quando o usuário é o CPF do cadastro (11 dígitos)
  assert.match(
    copia,
    /when v_usuario ~ '\^\[0-9\]\{11\}\$' and v_usuario = r\.cpf_digitos then 'cpf' else 'manual'/
  );
  // senha pessoal: hash, geração 1 e origem = a empresa; provisória: sem senha, geração 0
  assert.match(
    copia,
    /case when r\.senha_provisoria then null else r\.senha_hash end, case when r\.senha_provisoria then 0 else 1 end, case when r\.senha_provisoria then null else r\.empresa_id end/
  );
  // o hash antigo da provisória vira a provisória do vínculo, sem vencimento
  assert.match(copia, /provisoria_hash = case when r\.senha_provisoria then r\.senha_hash end/);
  assert.match(copia, /provisoria_expira_em = null/);
  // vínculo com senha pessoal: liberado na geração 1 e confirmado no último acesso
  assert.match(copia, /geracao_liberada = case when r\.senha_provisoria then null else 1 end/);
  assert.match(
    copia,
    /confirmado_em = case when r\.senha_provisoria then null else coalesce\(r\.ultimo_acesso, now\(\)\) end/
  );
  // m7: a linha de um CPF que já tem credencial é LIGADA a ela (sem liberação); com letras, para tudo
  assert.match(copia, /if v_tipo <> 'cpf' or v_existente\.tipo <> 'cpf' then raise exception/);
  assert.match(
    copia,
    /set credencial_id = v_existente\.id,[^;]*geracao_liberada = null, confirmado_em = null/
  );
  assert.match(m0145, /select public\.portal_credencial_copiar_acessos\(\);/);
  assert.match(
    m0145,
    /revoke all on function public\.portal_credencial_copiar_acessos\(\) from public, anon, authenticated;/
  );
});

test("0145: o procedimento do operador (§4.3) fica numa função só, sem EXECUTE para a API", () => {
  const assinatura = "public.portal_credencial_redefinir_pelo_operador(";
  const corpo = m0145.slice(m0145.indexOf(`create or replace function ${assinatura}`));
  assert.match(corpo, /^[^$]*security definer set search_path = public as/);
  assert.match(
    m0145,
    /revoke all on function public\.portal_credencial_redefinir_pelo_operador\(text, uuid, uuid\[\], text, text\) from public, anon, authenticated;/
  );
  // m2: quem pediu e como a própria pessoa confirmou são obrigatórios e ficam no registro
  assert.match(
    corpo,
    /coalesce\(btrim\(p_pedido_por\), ''\) = '' or coalesce\(btrim\(p_confirmado_com\), ''\) = ''/
  );
  assert.match(
    corpo,
    /'pedido_por', btrim\(p_pedido_por\), 'confirmado_com', btrim\(p_confirmado_com\)/
  );
  // senha que ninguém conhece (bcrypt de um segredo aleatório), origem e bloqueio zerados, geração e sessão sobem
  assert.match(
    corpo,
    /senha_hash = extensions\.crypt\(encode\(extensions\.gen_random_bytes\(32\), 'hex'\), extensions\.gen_salt\('bf', 10\)\)/
  );
  assert.match(
    corpo,
    /senha_origem_empresa_id = null, tentativas = 0, bloqueado_ate = null, senha_geracao = senha_geracao \+ 1, sessao_versao = sessao_versao \+ 1/
  );
  // todos sem liberação, confirmação e provisória; só a conferida confirmada; ocupantes desativadas
  assert.match(corpo, /set geracao_liberada = null, confirmado_em = null, provisoria_hash = null/);
  assert.match(
    corpo,
    /set confirmado_em = now\(\) where credencial_id = v_cred\.id and empresa_id = p_empresa_conferida and ativo;/
  );
  assert.match(
    corpo,
    /set ativo = false, sessao_versao = sessao_versao \+ 1 where credencial_id = v_cred\.id and empresa_id = any \(v_ocupantes\)/
  );
  // os eventos têm os mesmos nomes do código (a trilha e o registro do operador)
  assert.ok(corpo.includes(`'${EVENTO_ACESSO_AGUARDANDO_PROVISORIA}'`));
  assert.ok(corpo.includes(`'${OPERADOR_REDEFINIDA}'`));
  assert.ok(corpo.includes("'acesso_desativado', jsonb_build_object('por', 'suporte do SIGO')"));
  // conferida sem vínculo ativo de cadastro ativo: nada muda
  assert.match(corpo, /A empresa conferida não tem vínculo ativo, de cadastro ativo/);
});

test("0146: repete a cópia (se as colunas existem), exige credencial e tira o índice global e as colunas antigas", () => {
  assert.match(
    m0146,
    /if exists \( select 1 from information_schema\.columns [^)]*column_name = 'usuario' \) then perform public\.portal_credencial_copiar_acessos\(\); end if;/
  );
  assert.ok(
    m0146.includes(
      "alter table public.funcionario_portal_acesso alter column credencial_id set not null;"
    )
  );
  assert.ok(m0146.includes("drop index if exists public.funcionario_portal_acesso_usuario_uidx;"));
  for (const coluna of [
    "usuario",
    "senha_hash",
    "senha_provisoria",
    "tentativas",
    "bloqueado_ate",
    "ultimo_sinal_em",
  ]) {
    assert.ok(m0146.includes(`drop column if exists ${coluna}`), coluna);
  }
  assert.ok(m0146.includes("drop function if exists public.portal_credencial_copiar_acessos();"));
  // a cópia vem antes do not null e da remoção das colunas
  assert.ok(m0146.indexOf("portal_credencial_copiar_acessos();") < m0146.indexOf("set not null"));
  assert.ok(m0146.indexOf("set not null") < m0146.indexOf("drop column"));
});

// ------------------------------------------------------------------------------------------------- tools/

const smoke = ler("tools", "smoke-portal-credencial.sql");
const alertas = ler("tools", "portal-credencial-alertas.sql");
const conferir = ler("tools", "portal-credencial-conferir.sql");
const redefinir = ler("tools", "portal-credencial-redefinir.sql");

test("tools: nenhum UUID fixo nem dado pessoal; a conferência e os alertas são só de leitura", () => {
  for (const [nome, texto] of [
    ["smoke", smoke],
    ["alertas", alertas],
    ["conferir", conferir],
    ["redefinir", redefinir],
  ] as const) {
    assert.equal(UUID.test(texto), false, `${nome}: UUID`);
  }
  for (const [nome, texto] of [
    ["alertas", alertas],
    ["conferir", conferir],
  ] as const) {
    const sql = compacto(texto);
    assert.equal(
      /\b(insert into|update public\.|delete from|alter table|drop |create |begin;|commit;)/.test(
        sql
      ),
      false,
      nome
    );
  }
});

test("tools: o smoke roda em begin ... rollback e chama a MESMA função do script do operador (m6)", () => {
  const sql = compacto(smoke);
  assert.ok(sql.startsWith("begin;"));
  assert.ok(smoke.trimEnd().endsWith("rollback;"));
  assert.equal(/\bcommit;/.test(sql), false);
  assert.ok(sql.includes("public.portal_credencial_redefinir_pelo_operador("));
  assert.ok(
    compacto(redefinir).includes("select public.portal_credencial_redefinir_pelo_operador(")
  );
  // o smoke confere a cópia, o índice parcial, o trigger (delete e religação) e o procedimento
  for (const passo of [
    "[0] OK",
    "[1] OK",
    "[2] OK",
    "[3] OK",
    "[4] OK",
    "[5] OK",
    "[6] OK",
    "SMOKE TEST OK",
  ]) {
    assert.ok(smoke.includes(passo), passo);
  }
});

test("tools: o script do operador exige os parâmetros (placeholders falham) e grava quem pediu", () => {
  const sql = compacto(redefinir);
  assert.ok(sql.startsWith("begin;") && sql.endsWith("commit;"));
  for (const parametro of [
    "p_usuario",
    "p_empresa_conferida",
    "p_ocupantes",
    "p_pedido_por",
    "p_confirmado_com",
  ]) {
    assert.ok(sql.includes(`${parametro} :=`), parametro);
  }
  assert.match(sql, /'<empresa_conferida>'::uuid/);
  // o procedimento confirma com a própria pessoa, fora do RH que pediu (revisão 3, m2)
  assert.match(
    redefinir,
    /confirme COM A PRÓPRIA PESSOA, por um canal que NÃO passa pelo RH que pediu/
  );
});
