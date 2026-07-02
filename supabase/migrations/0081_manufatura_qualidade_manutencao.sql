-- ============================================================================
-- 0081 — Manufatura (Fase 7): Qualidade + Manutenção
-- ============================================================================
--   * inspecao_qualidade — inspeção vinculada à OP ou ao recebimento de compra.
--     Reprovação em OP NÃO mexe em estoque aqui (o refugo entra em
--     concluir_ordem_producao via quantidade_refugo); é registro de qualidade
--     + não-conformidade rastreável.
--   * ordem_manutencao — preventiva/corretiva por centro_trabalho. Parada de
--     máquina no chão continua sendo apontamento_producao.tempo_parada_min;
--     aqui é a GESTÃO da manutenção (abertura, execução, custo).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. inspecao_qualidade
-- ────────────────────────────────────────────────────────────────────────────
create table public.inspecao_qualidade (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero text,
  origem_tipo text not null check (origem_tipo in ('OrdemProducao','Recebimento','Estoque')),
  ordem_producao_id uuid references public.ordem_producao(id) on delete set null,
  ordem_producao_numero text,
  referencia_id uuid,                    -- recebimento/movimento quando não for OP
  material_id uuid not null references public.material(id) on delete cascade,
  material_nome text,
  lote text,
  quantidade_inspecionada numeric(14,4) not null,
  quantidade_aprovada numeric(14,4) default 0,
  quantidade_reprovada numeric(14,4) default 0,
  resultado text check (resultado in ('Aprovada','Reprovada','Parcial','Pendente')) default 'Pendente',
  criterios jsonb default '[]'::jsonb,   -- [{criterio, esperado, medido, ok}]
  nao_conformidade text,                 -- descrição da NC quando reprova
  acao_corretiva text,
  inspetor_id uuid,
  inspetor_nome text,
  data_inspecao timestamptz default now(),
  fotos jsonb default '[]'::jsonb,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index insp_empresa_idx on public.inspecao_qualidade(empresa_id);
create index insp_op_idx on public.inspecao_qualidade(ordem_producao_id) where ordem_producao_id is not null;
create index insp_material_idx on public.inspecao_qualidade(material_id);
create index insp_resultado_idx on public.inspecao_qualidade(empresa_id, resultado);
select attach_updated_at_trigger('inspecao_qualidade');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ordem_manutencao
-- ────────────────────────────────────────────────────────────────────────────
create table public.ordem_manutencao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero text,
  centro_trabalho_id uuid not null references public.centro_trabalho(id) on delete cascade,
  centro_trabalho_nome text,
  tipo text not null check (tipo in ('Preventiva','Corretiva','Preditiva')) default 'Corretiva',
  prioridade text check (prioridade in ('Baixa','Normal','Alta','Urgente')) default 'Normal',
  status text not null check (status in ('Aberta','Programada','EmExecucao','Concluida','Cancelada')) default 'Aberta',
  descricao_problema text,
  descricao_servico text,
  data_prevista date,
  data_inicio timestamptz,
  data_fim timestamptz,
  parou_producao boolean default false,
  tempo_parada_min numeric(12,2),
  responsavel_id uuid,
  responsavel_nome text,
  custo_pecas numeric(14,2) default 0,
  custo_servico numeric(14,2) default 0,
  custo_total numeric(14,2) generated always as (coalesce(custo_pecas,0) + coalesce(custo_servico,0)) stored,
  anexos jsonb default '[]'::jsonb,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
-- nomes omanut_*: manut_empresa_idx/manut_status_idx já existem em manutencao_ferramenta
create index omanut_empresa_idx on public.ordem_manutencao(empresa_id);
create index omanut_centro_idx on public.ordem_manutencao(centro_trabalho_id);
create index omanut_status_idx on public.ordem_manutencao(empresa_id, status);
create index omanut_data_idx on public.ordem_manutencao(empresa_id, data_prevista);
select attach_updated_at_trigger('ordem_manutencao');

-- Plano de manutenção preventiva (recorrência simples por dias)
create table public.plano_manutencao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  centro_trabalho_id uuid not null references public.centro_trabalho(id) on delete cascade,
  centro_trabalho_nome text,
  nome text not null,
  descricao_servico text,
  intervalo_dias integer not null,
  proxima_data date not null,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index plano_manut_empresa_idx on public.plano_manutencao(empresa_id);
create index plano_manut_proxima_idx on public.plano_manutencao(proxima_data) where ativo = true;
select attach_updated_at_trigger('plano_manutencao');

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Cron diário: gera ordens preventivas vencidas a partir dos planos
--    (mesmo padrão de 0038/0042 — security definer, notifica gestores)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.gerar_manutencoes_preventivas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_total integer := 0;
begin
  for rec in
    select * from public.plano_manutencao
     where ativo = true and deleted_at is null
       and proxima_data <= current_date
     for update
  loop
    insert into public.ordem_manutencao (
      empresa_id, centro_trabalho_id, centro_trabalho_nome,
      tipo, status, descricao_servico, data_prevista, observacoes
    ) values (
      rec.empresa_id, rec.centro_trabalho_id, rec.centro_trabalho_nome,
      'Preventiva', 'Aberta', rec.descricao_servico, rec.proxima_data,
      'Gerada automaticamente pelo plano: ' || rec.nome
    );

    update public.plano_manutencao
       set proxima_data = current_date + rec.intervalo_dias,
           updated_at = now()
     where id = rec.id;

    v_total := v_total + 1;

    perform public.notificar_gestores(
      rec.empresa_id,
      array['Admin Holding', 'Admin', 'Gestor'],
      'Manutenção preventiva gerada',
      format('Plano "%s" gerou ordem preventiva para %s.', rec.nome, coalesce(rec.centro_trabalho_nome, 'centro de trabalho')),
      '/Manufatura',
      'Manutenção',  -- precisa casar com notificacao_tipo_check
      'Normal',
      'manut_prev:' || rec.id::text || ':' || current_date
    );
  end loop;
  return v_total;
end;
$$;

comment on function public.gerar_manutencoes_preventivas is
  'Cron diário: abre ordem_manutencao Preventiva para planos com proxima_data vencida e reagenda o plano.';

do $$ begin perform cron.unschedule('gerar_manutencoes_preventivas'); exception when others then null; end $$;
select cron.schedule('gerar_manutencoes_preventivas', '20 6 * * *',
  $$ select public.gerar_manutencoes_preventivas(); $$);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS + grants
-- ────────────────────────────────────────────────────────────────────────────
select apply_tenant_rls('inspecao_qualidade');
select apply_tenant_rls('ordem_manutencao');
select apply_tenant_rls('plano_manutencao');

grant select, insert, update, delete on
  public.inspecao_qualidade,
  public.ordem_manutencao,
  public.plano_manutencao
  to authenticated;
