-- ============================================================================
-- 0059_consolidado_grupo.sql — CONSOLIDAÇÃO DO GRUPO (painel do dono)
--
-- Decisão do dono: visão consolidada das ~19 empresas (caixa, mês, pendências,
-- margem) SÓ para ele — demais usuários continuam vendo a própria empresa.
--
-- Desenho de segurança:
--   - _consolidado_grupo_dados(): agrega TODAS as empresas (SECURITY DEFINER,
--     bypassa RLS de propósito). REVOGADA de todos os papéis — não é chamável
--     via PostgREST; só a função pública (e o postgres em testes) a usa.
--   - consolidado_grupo(): pública p/ authenticated, mas com GUARD: o e-mail
--     do JWT precisa ter vínculo ATIVO com perfil 'Admin Holding' (ou ser
--     super admin). Qualquer outro usuário recebe erro.
-- ============================================================================

-- 1. Dados (interna, sem guard — revogada de todos) ---------------------------
create or replace function public._consolidado_grupo_dados()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(linha order by linha->>'empresa_nome'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'empresa_id', e.id,
      'empresa_nome', e.nome,
      'saldo_caixa', coalesce((
        select sum(c.saldo_atual) from public.conta_financeira c
        where c.empresa_id = e.id and c.deleted_at is null
          and coalesce(c.ativo, true) = true), 0),
      'receita_mes', coalesce((
        select sum(t.valor) from public.transacao_financeira t
        where t.empresa_id = e.id and t.deleted_at is null and t.tipo = 'Receita'
          and lower(coalesce(t.status,'')) in ('pago','realizado','recebido')
          and date_trunc('month', coalesce(t.data_pagamento, t.data)) = date_trunc('month', current_date)), 0),
      'despesa_mes', coalesce((
        select sum(t.valor) from public.transacao_financeira t
        where t.empresa_id = e.id and t.deleted_at is null and t.tipo = 'Despesa'
          and lower(coalesce(t.status,'')) in ('pago','realizado')
          and date_trunc('month', coalesce(t.data_pagamento, t.data)) = date_trunc('month', current_date)), 0),
      'a_receber', coalesce((
        select sum(t.valor) from public.transacao_financeira t
        where t.empresa_id = e.id and t.deleted_at is null and t.tipo = 'Receita'
          and lower(coalesce(t.status,'')) not in ('pago','realizado','recebido','cancelado')), 0),
      'a_pagar', coalesce((
        select sum(t.valor) from public.transacao_financeira t
        where t.empresa_id = e.id and t.deleted_at is null and t.tipo = 'Despesa'
          and lower(coalesce(t.status,'')) not in ('pago','realizado','cancelado')), 0),
      'a_pagar_atrasado', coalesce((
        select sum(t.valor) from public.transacao_financeira t
        where t.empresa_id = e.id and t.deleted_at is null and t.tipo = 'Despesa'
          and lower(coalesce(t.status,'')) not in ('pago','realizado','cancelado')
          and t.data_vencimento is not null and t.data_vencimento < current_date), 0)
    ) as linha
    from public.empresa e
    where e.deleted_at is null and coalesce(e.ativo, true) = true
  ) sub;
$$;

revoke all on function public._consolidado_grupo_dados() from public;
revoke all on function public._consolidado_grupo_dados() from anon;
revoke all on function public._consolidado_grupo_dados() from authenticated;

-- 2. Pública com guard (só Admin Holding / super admin) ------------------------
create or replace function public.consolidado_grupo()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if public.current_user_is_super_admin() then
    return public._consolidado_grupo_dados();
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'Acesso restrito: sessão sem e-mail';
  end if;

  if not exists (
    select 1 from public.usuario_empresa ue
    where lower(ue.usuario_email) = v_email
      and ue.perfil = 'Admin Holding'
      and coalesce(ue.ativo, true) = true
      and ue.deleted_at is null
  ) then
    raise exception 'Acesso restrito ao painel do grupo (requer perfil Admin Holding)';
  end if;

  return public._consolidado_grupo_dados();
end;
$$;

revoke all on function public.consolidado_grupo() from public;
revoke all on function public.consolidado_grupo() from anon;
grant execute on function public.consolidado_grupo() to authenticated;

notify pgrst, 'reload schema';
