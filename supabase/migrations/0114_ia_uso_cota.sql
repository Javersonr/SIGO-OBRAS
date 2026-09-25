-- ============================================================================
-- 0114_ia_uso_cota.sql — consumo da IA por empresa + base da cota diária
--
-- A Edge Function ia-processar (ações edital_*):
--   * ANTES de chamar a OpenAI, conta as linhas da empresa no dia (fuso de
--     Brasília) e recusa com 429 { codigo:"COTA_IA" } quando chega na cota —
--     saas_config 'ia_cota_edital_dia' (inteiro >= 1; padrão 400). Super
--     admin é isento.
--   * depois da ação, grava 1 linha por requisição que chamou a OpenAI, com os
--     tokens de TODAS as chamadas da requisição somados (escalonamento etc.).
--   Detalhes no cabeçalho de supabase/functions/ia-processar/index.ts.
--
-- Leitura: a própria empresa (tenant) e o super admin.
-- Escrita: SÓ service role (a Edge Function) — anon/authenticated sem
-- insert/update/delete (RLS sem policy de escrita + privilégios revogados).
--
-- Aditivo e idempotente. Enquanto não for aplicada, a função segue
-- funcionando (a contagem falha → libera; a gravação falha → só log).
-- ============================================================================

create table if not exists public.ia_uso (
  id uuid primary key default gen_random_uuid(),
  -- null = super admin sem empresa ativa na sessão
  empresa_id uuid references public.empresa(id) on delete cascade,
  usuario_email text,
  acao text not null,                       -- edital_extrair_parte / edital_consolidar / edital_atende
  modelo text,                              -- modelo(s) usado(s), ex.: 'gpt-4o-mini,gpt-4o'
  tokens_entrada integer not null default 0 check (tokens_entrada >= 0),
  tokens_saida integer not null default 0 check (tokens_saida >= 0),
  criado_em timestamptz not null default now()
);

comment on table public.ia_uso is
  'Consumo da IA (OpenAI) por requisição da ia-processar: tokens somados de todas as chamadas. Base da cota diária (saas_config ia_cota_edital_dia). Escrita só service role.';

-- contagem da cota: empresa + dia
create index if not exists ia_uso_empresa_criado_idx on public.ia_uso (empresa_id, criado_em);

-- RLS ------------------------------------------------------------------------
alter table public.ia_uso enable row level security;

-- default ACL do schema public dá arwdDxtm a anon/authenticated (PG 17, com
-- MAINTAIN): tira tudo e devolve só SELECT ao authenticated (filtrado pela RLS)
revoke all on table public.ia_uso from anon, authenticated;
grant select on table public.ia_uso to authenticated;
grant all on table public.ia_uso to service_role;

do $rls$
begin
  create policy ia_uso_select on public.ia_uso
    for select to authenticated
    using (empresa_id = public.current_empresa_id() or public.current_user_is_super_admin());
exception when duplicate_object then null;
end $rls$;

select 'ok' as res;
