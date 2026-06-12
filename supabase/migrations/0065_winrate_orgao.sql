-- ============================================================================
-- 0065_winrate_orgao.sql — win-rate por órgão (BI comercial de licitação)
--
-- O órgão licitante ficava ÓRFÃO em licitacao_encontrada — a oportunidade não
-- o recebia, então não dava pra responder "em qual órgão eu ganho mais?".
--
-- Entrega:
--   1. oportunidade.orgao + backfill a partir de licitacao_encontrada
--   2. view v_winrate_orgao: por empresa × órgão — total, ganhas, perdidas,
--      abertas, valor ganho e taxa de conversão. Ganho/perdido detectado por
--      status_nome (mesma heurística da 0040; melhora quando o motivo_perda
--      for estruturado).
--   (A Edge Function buscar-licitacoes passa a gravar o orgao no insert.)
-- ============================================================================

-- 1. Campo + backfill ----------------------------------------------------------
alter table public.oportunidade
  add column if not exists orgao text;

update public.oportunidade o
   set orgao = le.orgao
  from public.licitacao_encontrada le
 where le.oportunidade_id = o.id
   and o.orgao is null
   and le.orgao is not null;

create index if not exists oportunidade_orgao_idx
  on public.oportunidade(empresa_id, orgao) where orgao is not null;

-- 2. View de win-rate por órgão -------------------------------------------------
create or replace view public.v_winrate_orgao
with (security_invoker = on)
as
select
  o.empresa_id,
  coalesce(nullif(trim(o.orgao), ''), '(sem órgão)') as orgao,
  count(*) as total,
  count(*) filter (where coalesce(o.status_nome,'') ~* '(ganh)') as ganhas,
  count(*) filter (where coalesce(o.status_nome,'') ~* '(perdid)') as perdidas,
  count(*) filter (where coalesce(o.status_nome,'') !~* '(ganh|perdid|conclu|cancel|fechad)'
                     and coalesce(o.arquivado, false) = false) as abertas,
  coalesce(sum(o.valor_estimado) filter (where coalesce(o.status_nome,'') ~* '(ganh)'), 0)
    as valor_ganho,
  round(
    100.0 * count(*) filter (where coalesce(o.status_nome,'') ~* '(ganh)')
    / nullif(count(*) filter (where coalesce(o.status_nome,'') ~* '(ganh|perdid)'), 0)
  , 1) as taxa_conversao  -- % sobre as decididas (ganhas+perdidas)
from public.oportunidade o
where o.deleted_at is null
group by o.empresa_id, coalesce(nullif(trim(o.orgao), ''), '(sem órgão)');

revoke all on public.v_winrate_orgao from public;
revoke all on public.v_winrate_orgao from anon;
grant select on public.v_winrate_orgao to authenticated;

notify pgrst, 'reload schema';
