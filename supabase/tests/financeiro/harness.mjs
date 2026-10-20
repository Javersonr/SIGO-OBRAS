// Harness: sobe um Postgres (PGlite) com o recorte do schema do financeiro
// tirado das migrações REAIS do repo + stubs mínimos do Supabase, aplica as
// migrações novas e expõe helpers para os testes.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIG = fileURLToPath(new URL("../../migrations/", import.meta.url));
const ler = (f) => fs.readFileSync(path.join(MIG, f), "utf8");
const linhas = (f, de, ate) =>
  ler(f)
    .split(/\r?\n/)
    .slice(de - 1, ate)
    .join("\n");

// extrai "create or replace function public.<nome>(...) ... $delim$;" de um arquivo
function funcao(f, nome) {
  const txt = ler(f);
  const re = new RegExp(`create or replace function public\\.${nome}\\s*\\(`, "gi");
  let m,
    ultimo = null;
  while ((m = re.exec(txt))) ultimo = m.index; // a última definição vale
  if (ultimo == null) throw new Error(`função ${nome} não achada em ${f}`);
  const resto = txt.slice(ultimo);
  const d = resto.match(/as\s+(\$[a-z_]*\$)/i);
  const delim = d[1];
  const ini = resto.indexOf(delim) + delim.length;
  const fim = resto.indexOf(delim, ini) + delim.length;
  return resto.slice(0, fim) + ";";
}

const STUBS = `
create extension if not exists pgcrypto;
do $$ begin
  create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;

-- Vault (stub): guarda o segredo "cifrado" (aqui só base64) numa tabela
create schema if not exists vault;
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique, description text, secret text not null,
  created_at timestamptz default now(), updated_at timestamptz default now());
create or replace function vault.create_secret(new_secret text, new_name text default null,
  new_description text default '') returns uuid language plpgsql as $$
declare v uuid; begin
  insert into vault.secrets(secret, name, description)
  values (encode(convert_to(new_secret, 'utf8'), 'base64'), new_name, new_description)
  returning id into v; return v; end $$;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null,
  new_name text default null, new_description text default null) returns void language plpgsql as $$
begin
  update vault.secrets set
    secret = coalesce(encode(convert_to(new_secret, 'utf8'), 'base64'), secret),
    name = coalesce(new_name, name), description = coalesce(new_description, description),
    updated_at = now()
  where id = secret_id; end $$;
create or replace view vault.decrypted_secrets as
  select id, name, description, secret,
         convert_from(decode(secret, 'base64'), 'utf8') as decrypted_secret
  from vault.secrets;
create extension if not exists supabase_vault_stub_marker; -- ignorado se não existir
`;

// PGlite não tem a extensão "supabase_vault": o teste da migração do Vault
// procura pelo schema vault (ver migração 0154).
const STUBS_SEM_MARKER = STUBS.replace(
  /create extension if not exists supabase_vault_stub_marker.*\n/,
  ""
);

const BASE_TABELAS = `
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
${linhas("0001_helpers_e_auth.sql", 35, 49).replace("create or replace function attach_updated_at_trigger", "create or replace function public.attach_updated_at_trigger")}
create table public.empresa (id uuid primary key default gen_random_uuid(), nome text not null);
create table public.centro_custo (id uuid primary key default gen_random_uuid(), empresa_id uuid);
create table public.projeto (id uuid primary key default gen_random_uuid(), empresa_id uuid, nome text);
create table public.fornecedor (id uuid primary key default gen_random_uuid(), empresa_id uuid, nome_razao text);
create table public.cliente (id uuid primary key default gen_random_uuid(), empresa_id uuid, nome_razao text);
create table public.oportunidade (id uuid primary key default gen_random_uuid(), empresa_id uuid, nome text);
${linhas("0014_rls_policies.sql", 16, 36)}
`;

export async function novoBanco({ aplicarNovas = [] } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  const exec = async (sql, rotulo) => {
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`[${rotulo}] ${e.message}`);
    }
  };
  await exec(STUBS_SEM_MARKER, "stubs");
  await exec(BASE_TABELAS, "base");
  await exec(ler("0010_financeiro_core.sql"), "0010");
  await exec(linhas("0011_financeiro_extras.sql", 1, 167), "0011");
  // relaxamentos legados que importam aqui (0018-0023)
  await exec(
    `
    alter table public.transacao_financeira drop constraint if exists transacao_financeira_status_check;
    alter table public.transacao_financeira drop constraint if exists transacao_financeira_tipo_check;
    alter table public.transacao_financeira alter column conta_id drop not null;
    alter table public.transacao_financeira drop constraint if exists transacao_financeira_conta_id_fkey;
    alter table public.conta_financeira drop constraint if exists conta_financeira_tipo_check;
    alter table public.extrato_bancario drop constraint if exists extrato_bancario_origem_check;
    alter table public.extrato_bancario drop constraint if exists extrato_bancario_transacao_id_fkey;
    alter table public.extrato_bancario drop constraint if exists extrato_bancario_conta_id_fkey;
    alter table public.transacao_financeira drop constraint if exists tx_pre_lancamento_fk;
    alter table public.pre_lancamento drop constraint if exists pre_lancamento_transacao_id_fkey;
  `,
    "relax"
  );
  await exec(linhas("0027_estoque_integridade.sql", 45, 55), "0027");
  await exec(linhas("0064_medicao_impostos_retidos.sql", 66, 73), "0064");
  await exec(ler("0055_transacao_oportunidade.sql").replace(/notify pgrst.*$/gm, ""), "0055");
  for (const f of [
    "0072_extrato_bancario_campos_frontend.sql",
    "0073_transacao_anexos_tipo_receita.sql",
    "0074_conciliacao_campos.sql",
  ]) {
    await exec(ler(f).replace(/notify pgrst.*$/gm, ""), f);
  }
  await exec(linhas("0033_config_fiscal.sql", 169, 196), "0033");
  await exec(ler("0035_recalc_saldo_conta.sql"), "0035");
  await exec(linhas("0037_automacao_financeiro.sql", 17, 170), "0037");
  // 0110: guard de tenant + versões finais das RPCs usadas
  await exec(linhas("0110_rpc_security_definer_tenant.sql", 27, 71), "0110-guard");
  await exec(
    funcao("0110_rpc_security_definer_tenant.sql", "recalcular_saldo_conta"),
    "0110-recalc"
  );
  await exec(
    funcao("0110_rpc_security_definer_tenant.sql", "criar_transferencia_atomica"),
    "0110-transf"
  );
  for (const f of aplicarNovas) await exec(ler(f), f);
  return db;
}

// Simula o chamador: null = servidor (migração/cron); objeto = JWT da API
export async function comoUsuario(db, claims) {
  const v = claims ? JSON.stringify({ role: "authenticated", ...claims }) : "";
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [v]);
}

export async function um(db, sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows[0];
}
export async function todos(db, sql, params = []) {
  return (await db.query(sql, params)).rows;
}

export async function aplicar(db, arquivo) {
  try {
    await db.exec(fs.readFileSync(path.join(MIG, arquivo), "utf8"));
  } catch (e) {
    throw new Error(`[${arquivo}] ${e.message}`);
  }
}

export async function falha(p, re) {
  try {
    await p;
  } catch (e) {
    if (re && !re.test(e.message)) throw new Error(`erro inesperado: ${e.message}`);
    return e.message;
  }
  throw new Error("era para falhar e não falhou");
}
