-- ============================================================================
-- 0088_remove_metas_perfis_fabrica.sql — complemento da remoção da Manufatura
--
-- A 0083_fabrica_perfis_metas criou a camada de METAS + PERFIS de fábrica do
-- módulo Manufatura (removido na 0087). Este complemento tira o que sobrou:
--   - tabela `meta` (0 linhas — verificado antes do drop)
--   - view vw_meta_realizado (já caiu em cascata com ordem_producao; idempotente)
--   - CHECK de usuario_empresa.perfil volta à lista original (nenhum usuário
--     ativo usa os 5 perfis de fábrica — verificado: só Admin/Gestor/Admin Holding)
--
-- MANTIDO de propósito: plano "Fábrica" (4b41d06f…) e a assinatura da SG Ligth
-- — dado comercial do SaaS; decisão de desativar é do dono do produto.
-- ============================================================================

drop view if exists public.vw_meta_realizado cascade;
drop table if exists public.meta cascade;

alter table public.usuario_empresa drop constraint if exists usuario_empresa_perfil_check;
alter table public.usuario_empresa
  add constraint usuario_empresa_perfil_check
  check (perfil = any (array[
    'Admin Holding', 'Admin', 'Gestor', 'Compras', 'Estoque', 'Financeiro', 'Cliente'
  ])) not valid;

notify pgrst, 'reload schema';
