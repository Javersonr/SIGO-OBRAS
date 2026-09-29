-- ============================================================================
-- 0123_ia_uso_provedor_custo.sql — provedor e custo estimado no consumo da IA
--
-- A Edge Function ia-processar passa a usar o Gemini como IA padrão (OpenAI de
-- reserva) e a gravar 1 linha em ia_uso para TODAS as ações de IA (llm,
-- extrair_documentos, validar_exames_pcmso, edital_*, financeiro_ler_documento),
-- não só as edital_*. Cada linha ganha:
--   * provedor  — quem foi chamado na requisição, na ordem: 'gemini', 'openai'
--                 ou 'gemini,openai' (o Gemini falhou e a reserva respondeu);
--   * custo_usd — custo ESTIMADO em US$ de todas as chamadas da requisição
--                 (tabela em supabase/functions/_shared/ia-precos.ts);
--                 null = nenhum modelo usado tem preço na tabela.
-- A cota diária continua contando só acao in (edital_extrair_parte,
-- edital_consolidar, edital_atende).
--
-- Aditivo e idempotente. RLS e privilégios da 0114 continuam valendo (as
-- colunas novas herdam o select da tabela; escrita só service role). Enquanto
-- não for aplicada, a gravação da função nova falha → só log (nada quebra).
-- ============================================================================

alter table public.ia_uso add column if not exists provedor text;
alter table public.ia_uso add column if not exists custo_usd numeric(12,6);

do $chk$
begin
  alter table public.ia_uso
    add constraint ia_uso_custo_usd_nao_negativo check (custo_usd is null or custo_usd >= 0);
exception when duplicate_object then null;
end $chk$;

comment on column public.ia_uso.provedor is
  'Provedor(es) de IA chamados na requisição, na ordem: gemini, openai ou gemini,openai (fallback).';
comment on column public.ia_uso.custo_usd is
  'Custo estimado em US$ de todas as chamadas da requisição (supabase/functions/_shared/ia-precos.ts); null = modelo sem preço.';
comment on column public.ia_uso.acao is
  'Ação da ia-processar: llm, extrair_documentos, validar_exames_pcmso, edital_* ou financeiro_ler_documento. A cota diária conta só edital_*.';
comment on table public.ia_uso is
  'Consumo da IA (Gemini/OpenAI) por requisição da ia-processar: tokens somados de todas as chamadas, provedor, modelo e custo estimado. Base da cota diária das ações edital_* (saas_config ia_cota_edital_dia). Escrita só service role.';

select 'ok' as res;
