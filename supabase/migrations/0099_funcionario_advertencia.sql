-- 0099: advertências do funcionário (histórico disciplinar na Ficha)
create table if not exists public.funcionario_advertencia (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  funcionario_id uuid not null references public.funcionario(id) on delete cascade,
  data date not null default current_date,
  tipo text not null check (tipo in ('Verbal','Escrita','Suspensão')),
  motivo text not null,
  anexo_ref text,
  aplicada_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists func_adv_func_idx on public.funcionario_advertencia(funcionario_id);
select attach_updated_at_trigger('funcionario_advertencia');

alter table public.funcionario_advertencia enable row level security;
do $pol$ begin
  create policy tenant_isolation on public.funcionario_advertencia
    using (empresa_id = public.current_empresa_id())
    with check (empresa_id = public.current_empresa_id());
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy super_admin_all on public.funcionario_advertencia
    using (public.current_user_is_super_admin())
    with check (public.current_user_is_super_admin());
exception when duplicate_object then null; end $pol$;

select 'ok' as res;
