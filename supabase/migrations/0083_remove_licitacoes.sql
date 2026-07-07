-- ============================================================================
-- 0083_remove_licitacoes.sql — remove a funcionalidade de BUSCA de licitação
--
-- O monitoramento de licitações passou a ser feito fora do sistema, então a
-- busca automática (API Alerta Licitação + PNCP) foi aposentada. Remove o que
-- fica no BANCO:
--   - os 2 crons diários (buscar_licitacoes, buscar_licitacoes_pncp)
--   - as tabelas licitacao_busca e licitacao_encontrada
--
-- Removidos FORA do banco (à parte): as edge functions buscar-licitacoes,
-- buscar-licitacoes-pncp, config-licitacao, licitacoes-triagem, e o secret
-- ALERTA_LICITACAO_TOKEN; e a UI (aba Oportunidades/Configurações).
--
-- MANTIDO: os campos licitacao_* da tabela `oportunidade` (uma oportunidade pode
-- ser uma licitação preenchida à mão — dado legítimo, não faz parte da busca).
--
-- ⚠️ Destrutivo: dropa licitacao_encontrada (~18k linhas de histórico da busca).
-- FK só interna (encontrada.busca_id → busca); nenhuma tabela externa aponta.
-- ============================================================================

-- 1. Desagenda os crons diários de busca (idempotente; unschedule lança se o job
--    não existe, então engolimos o erro).
do $$ begin perform cron.unschedule('buscar_licitacoes'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('buscar_licitacoes_pncp'); exception when others then null; end $$;

-- 2. Dropa as tabelas da busca. CASCADE remove views/objetos dependentes.
drop table if exists public.licitacao_encontrada cascade;
drop table if exists public.licitacao_busca cascade;

notify pgrst, 'reload schema';
