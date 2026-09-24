-- ============================================================================
-- 0101: Ciência eletrônica de entregas (EPI, ferramenta, documento)
--
-- Substitui a biometria: o funcionário DÁ CIÊNCIA pelo Portal do Funcionário
-- (token pessoal). Vale como assinatura eletrônica simples (Lei 14.063/2020 e
-- MP 2.200-2/2001): registra QUEM (token do funcionário), QUANDO (timestamp),
-- O QUÊ (itens/descrição) e DE ONDE (IP + dispositivo) em `evidencia`.
-- NR-6 aceita registro eletrônico de fornecimento de EPI.
-- ============================================================================

create table if not exists public.entrega_ciencia (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  funcionario_id uuid not null references public.funcionario(id) on delete cascade,
  tipo text not null check (tipo in ('EPI','Ferramenta','Documento')),
  descricao text not null,
  itens jsonb not null default '[]'::jsonb,
  anexo_ref text,
  status text not null default 'pendente' check (status in ('pendente','confirmada')),
  criada_por text,
  confirmada_em timestamptz,
  evidencia jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists entrega_ciencia_func_idx on public.entrega_ciencia(funcionario_id);
select attach_updated_at_trigger('entrega_ciencia');

alter table public.entrega_ciencia enable row level security;
do $pol$ begin
  create policy tenant_isolation on public.entrega_ciencia
    using (empresa_id = public.current_empresa_id())
    with check (empresa_id = public.current_empresa_id());
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy super_admin_all on public.entrega_ciencia
    using (public.current_user_is_super_admin())
    with check (public.current_user_is_super_admin());
exception when duplicate_object then null; end $pol$;

select 'ok' as res;
