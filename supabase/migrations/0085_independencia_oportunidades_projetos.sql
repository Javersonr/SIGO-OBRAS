-- ============================================================================
-- 0085_independencia_oportunidades_projetos.sql
--
-- Objetivo: separar funcionalmente Oportunidades e Projetos.
-- - Projetos passa a ter cadastros proprios de status, origem e template.
-- - Desliga a sincronizacao automatica Oportunidade -> Projeto.
-- - Faturamento de medicao de Projeto deixa de preencher oportunidade_id.
--
-- Esta migration preserva dados existentes e copia os cadastros atuais do CRM
-- como ponto de partida dos cadastros de Projetos.
-- ============================================================================

-- 1. Cadastros proprios do modulo Projetos -------------------------------
create table if not exists public.status_projeto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  cor text,
  ordem integer,
  tipo text check (tipo in ('aberto','ganho','perdido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index if not exists status_projeto_empresa_idx on public.status_projeto(empresa_id);
select attach_updated_at_trigger('status_projeto');
select apply_tenant_rls('status_projeto');
grant select, insert, update, delete on public.status_projeto to authenticated;

create table if not exists public.origem_projeto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index if not exists origem_projeto_empresa_idx on public.origem_projeto(empresa_id);
create unique index if not exists origem_projeto_empresa_nome_uniq
  on public.origem_projeto(empresa_id, nome) where deleted_at is null;
select attach_updated_at_trigger('origem_projeto');
select apply_tenant_rls('origem_projeto');
grant select, insert, update, delete on public.origem_projeto to authenticated;

create table if not exists public.template_projeto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  descricao text,
  campos_padrao jsonb default '{}'::jsonb,
  tipo text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index if not exists template_projeto_empresa_idx on public.template_projeto(empresa_id);
select attach_updated_at_trigger('template_projeto');
select apply_tenant_rls('template_projeto');
grant select, insert, update, delete on public.template_projeto to authenticated;

-- Copia os cadastros herdados, mas com UUIDs NOVOS. Isso evita que uma alteracao
-- em status/origem de Oportunidades pareca afetar Projetos por compartilhamento
-- de ids legados.
create temp table _status_projeto_map (
  old_id uuid primary key,
  new_id uuid not null
) on commit drop;

insert into _status_projeto_map (old_id, new_id)
select so.id, gen_random_uuid()
from public.status_oportunidade so
where not exists (
  select 1
  from public.status_projeto sp
  where sp.empresa_id = so.empresa_id
    and lower(sp.nome) = lower(so.nome)
    and sp.deleted_at is null
);

insert into public.status_projeto (
  id, empresa_id, nome, cor, ordem, tipo, created_at, updated_at, deleted_at, created_by
)
select m.new_id, so.empresa_id, so.nome, so.cor, so.ordem, so.tipo,
       so.created_at, so.updated_at, so.deleted_at, so.created_by
from public.status_oportunidade so
join _status_projeto_map m on m.old_id = so.id
on conflict (id) do nothing;

-- Completa o mapa para cadastros ja existentes em status_projeto.
insert into _status_projeto_map (old_id, new_id)
select so.id, sp.id
from public.status_oportunidade so
join public.status_projeto sp
  on sp.empresa_id = so.empresa_id
 and lower(sp.nome) = lower(so.nome)
 and sp.deleted_at is null
where not exists (
  select 1 from _status_projeto_map m where m.old_id = so.id
)
on conflict (old_id) do nothing;

update public.projeto p
   set status_id = m.new_id,
       updated_at = now()
  from _status_projeto_map m
 where p.status_id = m.old_id
   and p.deleted_at is null;

create temp table _origem_projeto_map (
  old_id uuid primary key,
  new_id uuid not null
) on commit drop;

insert into _origem_projeto_map (old_id, new_id)
select oo.id, gen_random_uuid()
from public.origem_oportunidade oo
where not exists (
  select 1
  from public.origem_projeto op
  where op.empresa_id = oo.empresa_id
    and lower(op.nome) = lower(oo.nome)
    and op.deleted_at is null
);

insert into public.origem_projeto (
  id, empresa_id, nome, created_at, updated_at, deleted_at, created_by
)
select m.new_id, oo.empresa_id, oo.nome, oo.created_at, oo.updated_at, oo.deleted_at, oo.created_by
from public.origem_oportunidade oo
join _origem_projeto_map m on m.old_id = oo.id
on conflict (id) do nothing;

insert into _origem_projeto_map (old_id, new_id)
select oo.id, op.id
from public.origem_oportunidade oo
join public.origem_projeto op
  on op.empresa_id = oo.empresa_id
 and lower(op.nome) = lower(oo.nome)
 and op.deleted_at is null
where not exists (
  select 1 from _origem_projeto_map m where m.old_id = oo.id
)
on conflict (old_id) do nothing;

update public.projeto p
   set origem_id = m.new_id,
       updated_at = now()
  from _origem_projeto_map m
 where p.origem_id = m.old_id
   and p.deleted_at is null;

insert into public.template_projeto (
  empresa_id, nome, descricao, campos_padrao, tipo, ativo,
  created_at, updated_at, deleted_at, created_by
)
select t.empresa_id, t.nome, t.descricao, t.campos_padrao, t.tipo, t.ativo,
       t.created_at, t.updated_at, t.deleted_at, t.created_by
from public.template_oportunidade t
where not exists (
  select 1
  from public.template_projeto tp
  where tp.empresa_id = t.empresa_id
    and lower(tp.nome) = lower(t.nome)
    and tp.deleted_at is null
);

comment on table public.status_projeto is
  'Cadastros de status exclusivos do modulo Projetos; nao compartilhar com Oportunidades.';
comment on table public.origem_projeto is
  'Cadastros de origem exclusivos do modulo Projetos; nao compartilhar com Oportunidades.';
comment on table public.template_projeto is
  'Templates exclusivos do modulo Projetos; nao compartilhar com Oportunidades.';

-- 2. Desliga pontes automaticas Oportunidade -> Projeto -------------------
drop trigger if exists trg_oportunidade_sincroniza_projetos on public.oportunidade;
drop function if exists public.tg_oportunidade_sincroniza_projetos();
drop function if exists public.sincronizar_projeto_com_oportunidade(uuid);

comment on column public.projeto.oportunidade_origem_id is
  'Legado/historico somente. Novas funcionalidades nao devem depender de Oportunidade.';

-- 3. Medicao/faturamento de Projeto nao preenche oportunidade_id ----------
create or replace function public.faturar_medicao(
  p_medicao_id uuid,
  p_data_vencimento date,
  p_ator_email text default null,
  p_ator_nome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.medicao_obra%rowtype;
  v_p public.projeto%rowtype;
  v_pct numeric(5,2);
  v_iss_pct numeric(5,2);
  v_inss_pct numeric(5,2);
  v_ret numeric(14,2);
  v_iss numeric(14,2);
  v_inss numeric(14,2);
  v_liq numeric(14,2);
  v_rec_id uuid;
  v_ret_id uuid;
  v_iss_id uuid;
  v_inss_id uuid;
begin
  select * into v_m
    from public.medicao_obra
    where id = p_medicao_id and deleted_at is null
    for update;

  if v_m.id is null then
    raise exception 'Medicao nao encontrada';
  end if;

  if public.current_empresa_id() is not null
     and v_m.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: medicao de outra empresa';
  end if;

  if v_m.status = 'Faturada' then
    raise exception 'Medicao #% ja foi faturada', v_m.numero;
  end if;

  if p_data_vencimento is null then
    raise exception 'Informe a data de vencimento da fatura';
  end if;

  select * into v_p from public.projeto where id = v_m.projeto_id;

  v_pct      := coalesce(v_m.retencao_percentual, v_p.retencao_percentual, 0);
  v_iss_pct  := coalesce(v_m.iss_percentual, v_p.iss_percentual, 0);
  v_inss_pct := coalesce(v_m.inss_percentual, v_p.inss_percentual, 0);

  v_ret  := round(v_m.valor_medido * v_pct / 100.0, 2);
  v_iss  := round(v_m.valor_medido * v_iss_pct / 100.0, 2);
  v_inss := round(v_m.valor_medido * v_inss_pct / 100.0, 2);
  v_liq  := v_m.valor_medido - v_ret - v_iss - v_inss;

  if v_liq < 0 then
    raise exception 'Percentuais somados excedem 100%% (retencao %% + ISS %% + INSS %%)';
  end if;

  insert into public.transacao_financeira (
    empresa_id, tipo, valor, data, data_vencimento, status, descricao,
    projeto_id, projeto_nome, cliente_id, cliente_nome,
    referencia_tipo, referencia_id, observacoes
  ) values (
    v_m.empresa_id, 'Receita', v_liq, current_date, p_data_vencimento, 'pendente',
    'Medicao #' || v_m.numero || ' - ' || coalesce(v_p.nome, 'obra'),
    v_p.id, v_p.nome, v_p.cliente_id, v_p.cliente_nome,
    'medicao_obra', v_m.id,
    'Medido R$ ' || v_m.valor_medido ||
      case when v_ret > 0 then ' - retencao ' || v_pct || '% (R$ ' || v_ret || ')' else '' end ||
      case when v_iss > 0 then ' - ISS ' || v_iss_pct || '% (R$ ' || v_iss || ')' else '' end ||
      case when v_inss > 0 then ' - INSS ' || v_inss_pct || '% (R$ ' || v_inss || ')' else '' end
  ) returning id into v_rec_id;

  if v_ret > 0 then
    insert into public.transacao_financeira (
      empresa_id, tipo, valor, data, status, descricao,
      projeto_id, projeto_nome, cliente_id, cliente_nome,
      referencia_tipo, referencia_id, observacoes
    ) values (
      v_m.empresa_id, 'Receita', v_ret, current_date, 'pendente',
      'Retencao ' || v_pct || '% - Medicao #' || v_m.numero || ' - ' || coalesce(v_p.nome, 'obra'),
      v_p.id, v_p.nome, v_p.cliente_id, v_p.cliente_nome,
      'medicao_obra_retencao', v_m.id,
      'Caucao contratual; liberar conforme contrato (ajuste o vencimento quando definido).'
    ) returning id into v_ret_id;
  end if;

  if v_iss > 0 then
    insert into public.transacao_financeira (
      empresa_id, tipo, valor, data, data_vencimento, data_pagamento, status,
      descricao, projeto_id, projeto_nome,
      referencia_tipo, referencia_id, observacoes
    ) values (
      v_m.empresa_id, 'Despesa', v_iss, current_date, p_data_vencimento, p_data_vencimento, 'pago',
      'ISS retido ' || v_iss_pct || '% - Medicao #' || v_m.numero || ' - ' || coalesce(v_p.nome, 'obra'),
      v_p.id, v_p.nome,
      'medicao_obra_imposto', v_m.id,
      'Retido na fonte pela contratante - nao transita pelo caixa.'
    ) returning id into v_iss_id;
  end if;

  if v_inss > 0 then
    insert into public.transacao_financeira (
      empresa_id, tipo, valor, data, data_vencimento, data_pagamento, status,
      descricao, projeto_id, projeto_nome,
      referencia_tipo, referencia_id, observacoes
    ) values (
      v_m.empresa_id, 'Despesa', v_inss, current_date, p_data_vencimento, p_data_vencimento, 'pago',
      'INSS retido ' || v_inss_pct || '% - Medicao #' || v_m.numero || ' - ' || coalesce(v_p.nome, 'obra'),
      v_p.id, v_p.nome,
      'medicao_obra_imposto', v_m.id,
      'Retido na fonte pela contratante - nao transita pelo caixa.'
    ) returning id into v_inss_id;
  end if;

  update public.medicao_obra
     set status = 'Faturada',
         retencao_percentual = v_pct,
         iss_percentual = v_iss_pct,
         inss_percentual = v_inss_pct,
         valor_retencao = v_ret,
         valor_iss = v_iss,
         valor_inss = v_inss,
         valor_liquido = v_liq,
         transacao_receita_id = v_rec_id,
         transacao_retencao_id = v_ret_id,
         transacao_iss_id = v_iss_id,
         transacao_inss_id = v_inss_id,
         data_faturamento = now(),
         updated_at = now()
   where id = p_medicao_id;

  return jsonb_build_object(
    'medicao', v_m.numero,
    'valor_medido', v_m.valor_medido,
    'retencao_percentual', v_pct,
    'valor_retencao', v_ret,
    'valor_iss', v_iss,
    'valor_inss', v_inss,
    'valor_liquido', v_liq,
    'transacao_receita_id', v_rec_id,
    'mensagem', 'Medicao faturada: liquido R$ ' || v_liq ||
      case when v_ret > 0 then ' - retencao R$ ' || v_ret else '' end ||
      case when v_iss > 0 then ' - ISS R$ ' || v_iss else '' end ||
      case when v_inss > 0 then ' - INSS R$ ' || v_inss else '' end
  );
end;
$$;

notify pgrst, 'reload schema';
