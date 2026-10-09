-- ============================================================================
-- 0149_conector_envio_texto.sql — link de envio de arquivos e texto do edital
-- para o conector do Claude (Plano 2 do conector, Task 4; spec 2026-09-25 §4.6,
-- §4.8 e §4.9)
--
-- Por quê:
--   * Não existe como passar ao conector um arquivo que está no chat do Claude.
--     O conector gera um LINK DE ENVIO (mcp_link_envio, só do servidor): o
--     servidor monta os caminhos no Storage (pasta da empresa da chave), o
--     usuário solta os arquivos na página /EnviarArquivos ou o Claude Code envia
--     pela URL assinada, e um registro só (registrarEnvio) confere e anexa.
--   * O Claude lê o edital já anexado pelo TEXTO de cada página
--     (arquivo_texto_pagina, RLS da empresa), extraído no navegador (pdf.js). O
--     bucket anexos-oportunidade só aceita pdf/jpeg/png: um "<ref>.paginas.json"
--     no Storage não serve.
--   * sem_acento: busca e duplicatas de oportunidade sem acento (não há unaccent
--     no banco).
--   * edital_analise_mesclar / edital_analise_anexar_arquivos: a análise, o
--     "Atende?" e o envio de arquivos gravam edital_analise por MESCLAGEM no
--     banco, sem ler-e-regravar no TypeScript (um não apaga o outro).
--   * conector_texto_disponivel: quantas páginas de texto cada arquivo tem.
--   * conector_limpeza_envio: apaga os links vencidos há 30 dias (cron diário).
--
-- Funções só do servidor (service role / pg_cron), menos a sem_acento (pura).
-- Ordem: aplicar antes do deploy do mcp com as ferramentas de arquivos e antes
-- do push do front (página de envio e "Preparar para o Claude"). Idempotente.
-- ============================================================================

-- ─── 1. Link de envio (só servidor) ─────────────────────────────────────────
create table if not exists public.mcp_link_envio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  autorizacao_id uuid not null references public.conector_autorizacao(id) on delete cascade,
  usuario_custom_id uuid not null references public.usuario_custom(id) on delete cascade,
  alvo text not null check (alvo in ('oportunidade', 'atestado')),
  oportunidade_id uuid references public.oportunidade(id) on delete cascade,
  atestado_id uuid references public.acervo_atestado(id) on delete cascade,
  bucket text not null check (bucket in ('anexos-oportunidade', 'certificados')),
  arquivos jsonb not null check (jsonb_typeof(arquivos) = 'array'),       -- ArquivoDoLink[]
  registrados jsonb not null default '[]'::jsonb check (jsonb_typeof(registrados) = 'array'),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  usado_em timestamptz,
  usado_por text check (usado_por in ('pagina', 'claude')),
  check ((alvo = 'oportunidade' and oportunidade_id is not null and atestado_id is null)
      or (alvo = 'atestado' and atestado_id is not null and oportunidade_id is null))
);
create index if not exists mcp_link_envio_empresa_idx on public.mcp_link_envio (empresa_id, criado_em desc);

alter table public.mcp_link_envio enable row level security;
revoke all on table public.mcp_link_envio from anon, authenticated;
grant all on table public.mcp_link_envio to service_role;

-- o alvo tem de ser da MESMA empresa do link (0118)
drop trigger if exists referencias_da_empresa on public.mcp_link_envio;
create trigger referencias_da_empresa
  before insert or update of oportunidade_id, atestado_id, empresa_id on public.mcp_link_envio
  for each row execute function public.exigir_referencias_da_empresa(
    'oportunidade_id:oportunidade', 'atestado_id:acervo_atestado');

comment on table public.mcp_link_envio is
  'Conector do Claude: link de envio de arquivos (2 h, até 20 arquivos). Só o servidor lê e grava.';

-- ─── 2. Texto do edital por página (RLS da empresa) ────────────────────────
create table if not exists public.arquivo_texto_pagina (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  arquivo_id uuid not null references public.arquivo_oportunidade(id) on delete cascade,
  pagina int not null check (pagina between 1 and 5000),
  texto text not null default '' check (char_length(texto) <= 100000),
  escaneada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists arquivo_texto_pagina_arquivo_pagina_uidx
  on public.arquivo_texto_pagina (arquivo_id, pagina) where deleted_at is null;
create index if not exists arquivo_texto_pagina_empresa_idx on public.arquivo_texto_pagina (empresa_id);
select public.attach_updated_at_trigger('arquivo_texto_pagina');

do $rls$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'arquivo_texto_pagina' and policyname = 'tenant_isolation'
  ) then
    perform public.apply_tenant_rls('arquivo_texto_pagina');
  end if;
end $rls$;
-- a tela grava e "apaga" (deleted_at) pelo SDK; ninguém apaga de verdade pela API
revoke all on table public.arquivo_texto_pagina from anon, authenticated;
grant select, insert, update on table public.arquivo_texto_pagina to authenticated;
grant all on table public.arquivo_texto_pagina to service_role;

drop trigger if exists referencias_da_empresa on public.arquivo_texto_pagina;
create trigger referencias_da_empresa
  before insert or update of arquivo_id, empresa_id on public.arquivo_texto_pagina
  for each row execute function public.exigir_referencias_da_empresa('arquivo_id:arquivo_oportunidade');

comment on table public.arquivo_texto_pagina is
  'Texto de cada página de um PDF da oportunidade (extraído no navegador) para o conector do Claude.';

-- ─── 3. sem_acento (pura) ──────────────────────────────────────────────────
create or replace function public.sem_acento(p text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'));
$$;
revoke all on function public.sem_acento(text) from public, anon;
grant execute on function public.sem_acento(text) to authenticated, service_role;

-- ─── 4. edital_analise por mesclagem ───────────────────────────────────────
create or replace function public.edital_analise_mesclar(
  p_empresa_id uuid,
  p_oportunidade_id uuid,
  p_patch jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'edital_analise: o patch deve ser um objeto' using errcode = '22023';
  end if;
  for v_chave in select jsonb_object_keys(p_patch) loop
    if v_chave not in ('versao', 'extraido', 'atende', 'analisado_em', 'analisado_por') then
      raise exception 'edital_analise: chave não aceita: %', v_chave using errcode = '22023';
    end if;
  end loop;
  update public.oportunidade
     set edital_analise = coalesce(
           case when jsonb_typeof(edital_analise) = 'object' then edital_analise end,
           '{"arquivos":[]}'::jsonb
         ) || p_patch,
         edital_analisado_em = case when p_patch ? 'extraido' then now() else edital_analisado_em end
   where id = p_oportunidade_id and empresa_id = p_empresa_id and deleted_at is null;
  return found;
end;
$$;

create or replace function public.edital_analise_anexar_arquivos(
  p_empresa_id uuid,
  p_oportunidade_id uuid,
  p_arquivos jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_analise jsonb;
  v_lista jsonb;
  v_ids text[];
  v_novos jsonb := '[]'::jsonb;
  v_item jsonb;
  v_id text;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select edital_analise into v_analise
    from public.oportunidade
   where id = p_oportunidade_id and empresa_id = p_empresa_id and deleted_at is null
   for update;
  -- sem análise ainda: os arquivos entram quando a análise for gravada
  if v_analise is null or jsonb_typeof(v_analise) <> 'object' then
    return 0;
  end if;
  v_lista := public.jsonb_to_array(v_analise -> 'arquivos');
  select coalesce(array_agg(x ->> 'arquivo_oportunidade_id'), '{}'::text[]) into v_ids
    from jsonb_array_elements(v_lista) x;
  for v_item in select value from jsonb_array_elements(public.jsonb_to_array(p_arquivos)) loop
    v_id := v_item ->> 'arquivo_oportunidade_id';
    continue when v_id is null or v_id = any(v_ids);
    v_novos := v_novos || jsonb_build_array(jsonb_build_object(
      'arquivo_oportunidade_id', v_id,
      'nome', v_item ->> 'nome',
      'categoria', v_item ->> 'categoria'));
    v_ids := v_ids || v_id;
  end loop;
  if jsonb_array_length(v_novos) > 0 then
    update public.oportunidade
       set edital_analise = jsonb_set(v_analise, '{arquivos}', v_lista || v_novos)
     where id = p_oportunidade_id and empresa_id = p_empresa_id;
  end if;
  return jsonb_array_length(v_novos);
end;
$$;

-- ─── 5. Texto disponível por arquivo ──────────────────────────────────────
create or replace function public.conector_texto_disponivel(
  p_empresa_id uuid,
  p_arquivo_ids uuid[]
)
returns table (arquivo_id uuid, paginas integer, escaneadas integer)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
    select t.arquivo_id, count(*)::integer, (count(*) filter (where t.escaneada))::integer
      from public.arquivo_texto_pagina t
     where t.empresa_id = p_empresa_id
       and t.arquivo_id = any(p_arquivo_ids)
       and t.deleted_at is null
     group by t.arquivo_id;
end;
$$;

-- ─── 6. Limpeza dos links vencidos (cron 07:20 UTC = 04:20 BRT) ────────────
create or replace function public.conector_limpeza_envio()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  delete from public.mcp_link_envio where expira_em < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ─── 7. Privilégios das funções só do servidor ────────────────────────────
revoke all on function public.edital_analise_mesclar(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.edital_analise_anexar_arquivos(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.conector_texto_disponivel(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.conector_limpeza_envio() from public, anon, authenticated;
grant execute on function public.edital_analise_mesclar(uuid, uuid, jsonb) to service_role;
grant execute on function public.edital_analise_anexar_arquivos(uuid, uuid, jsonb) to service_role;
grant execute on function public.conector_texto_disponivel(uuid, uuid[]) to service_role;
grant execute on function public.conector_limpeza_envio() to service_role;

do $$ begin perform cron.unschedule('conector_limpeza_envio'); exception when others then null; end $$;
select cron.schedule('conector_limpeza_envio', '20 7 * * *', $$ select public.conector_limpeza_envio(); $$);

notify pgrst, 'reload schema';

-- ─── Conferência ───────────────────────────────────────────────────────────
select 'tabelas (esperado 2)' as item, count(*)::text as valor
  from information_schema.tables
 where table_schema = 'public' and table_name in ('mcp_link_envio', 'arquivo_texto_pagina')
union all
select 'policies de arquivo_texto_pagina (esperado 2)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename = 'arquivo_texto_pagina'
union all
select 'sem_acento(''Joanópolis'')', public.sem_acento('Joanópolis')
union all
select 'cron conector_limpeza_envio', schedule || ' | ' || command
  from cron.job
 where jobname = 'conector_limpeza_envio';

select 'ok' as res;
