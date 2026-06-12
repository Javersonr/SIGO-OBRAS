-- ============================================================================
-- 0066_proposta_versionada.sql — PROPOSTA VERSIONADA por oportunidade
--
-- Lacuna de compliance apontada no parecer: a oportunidade não tinha registro
-- de QUAL proposta foi apresentada, por QUEM e por QUANTO — mudou o preço,
-- perdeu-se o histórico. Em licitação pública isso é rastreabilidade básica.
--
-- Modelo: cada proposta é um SNAPSHOT imutável com versão sequencial por
-- oportunidade (trigger, não confia no frontend). Mudou o valor? Nova versão.
-- Status acompanha o desfecho (Enviada → Aceita/Recusada).
-- ============================================================================

create table if not exists public.proposta_oportunidade (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  oportunidade_id uuid not null references public.oportunidade(id) on delete cascade,
  versao integer not null default 0,               -- sequencial por oportunidade (trigger)
  valor numeric(14,2) not null check (valor >= 0),
  descricao text,                                   -- escopo/condições resumidas
  status text not null default 'Enviada'
    check (status in ('Rascunho', 'Enviada', 'Aceita', 'Recusada')),
  data_envio date default current_date,
  arquivo_url text,                                 -- PDF da proposta (opcional)
  criado_por_email text,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index proposta_op_idx on public.proposta_oportunidade(oportunidade_id, versao desc);
create index proposta_empresa_idx on public.proposta_oportunidade(empresa_id);
create unique index proposta_op_versao_uniq
  on public.proposta_oportunidade(oportunidade_id, versao) where deleted_at is null;
select attach_updated_at_trigger('proposta_oportunidade');
select apply_tenant_rls('proposta_oportunidade');

-- versão sequencial por oportunidade (não confia no frontend)
create or replace function public.tg_proposta_versao()
returns trigger
language plpgsql
as $$
begin
  if new.versao is null or new.versao <= 0 then
    select coalesce(max(versao), 0) + 1 into new.versao
      from public.proposta_oportunidade
      where oportunidade_id = new.oportunidade_id and deleted_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_proposta_versao on public.proposta_oportunidade;
create trigger trg_proposta_versao
  before insert on public.proposta_oportunidade
  for each row execute function public.tg_proposta_versao();

-- imutabilidade do registro histórico: só status/arquivo podem mudar depois
create or replace function public.tg_proposta_imutavel()
returns trigger
language plpgsql
as $$
begin
  if old.valor is distinct from new.valor
     or old.versao is distinct from new.versao
     or old.oportunidade_id is distinct from new.oportunidade_id
     or old.data_envio is distinct from new.data_envio
     or old.criado_por_email is distinct from new.criado_por_email then
    raise exception 'Proposta é histórico imutável — mudou valor/escopo? Crie uma NOVA versão.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_proposta_imutavel on public.proposta_oportunidade;
create trigger trg_proposta_imutavel
  before update on public.proposta_oportunidade
  for each row
  when (old.deleted_at is null and new.deleted_at is null)
  execute function public.tg_proposta_imutavel();

notify pgrst, 'reload schema';
