-- ============================================================================
-- 0047 — arquivo_oportunidade.enviado_por_cliente
-- ============================================================================
-- O portal do cliente (ClientePortal/portal-cliente-acao) marca os uploads
-- feitos pelo cliente com enviado_por_cliente = true. A coluna nunca existiu no
-- schema — o frontend gravava uma "coluna fantasma" (insert falhava ou era
-- ignorado). Aqui criamos a coluna de forma aditiva e segura (default false).
--
-- Aplicável a qualquer momento (não depende da janela de RLS).
-- ============================================================================

alter table public.arquivo_oportunidade
  add column if not exists enviado_por_cliente boolean not null default false;
