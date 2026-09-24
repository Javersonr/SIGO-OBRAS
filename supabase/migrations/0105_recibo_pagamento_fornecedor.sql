-- ============================================================================
-- 0105: Recibo de pagamento ao fornecedor com QUITAÇÃO eletrônica
--
-- Ao pagar uma despesa, o SIGO emite o recibo com conteúdo CONGELADO (dados
-- jsonb + hash) e manda um link pro fornecedor tocar "Confirmo o recebimento
-- (dou quitação)". Assinatura eletrônica simples (Lei 14.063/2020 e MP
-- 2.200-2/2001): fica gravado quem (telefone do cadastro/token), quando,
-- o quê (hash) e de onde (IP + aparelho) em `evidencia`.
-- Confirmação/contestação passam pela edge function (service role).
-- ============================================================================

create table if not exists public.recibo_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  transacao_id uuid not null references public.transacao_financeira(id) on delete cascade,
  fornecedor_id uuid references public.fornecedor(id) on delete set null,
  codigo text not null unique,
  hash_sha256 text not null,
  dados jsonb not null,
  status text not null default 'pendente' check (status in ('pendente','confirmada','contestada')),
  confirmada_em timestamptz,
  evidencia jsonb,
  contestacao text,
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists recibo_pagamento_transacao_uidx
  on public.recibo_pagamento (transacao_id) where deleted_at is null;
select attach_updated_at_trigger('recibo_pagamento');

alter table public.recibo_pagamento enable row level security;
do $pol$ begin
  create policy tenant_isolation on public.recibo_pagamento
    using (empresa_id = public.current_empresa_id())
    with check (empresa_id = public.current_empresa_id());
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy super_admin_all on public.recibo_pagamento
    using (public.current_user_is_super_admin())
    with check (public.current_user_is_super_admin());
exception when duplicate_object then null; end $pol$;

select 'ok' as res;
