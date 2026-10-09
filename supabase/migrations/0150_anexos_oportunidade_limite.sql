-- ============================================================================
-- 0150_anexos_oportunidade_limite.sql — bucket anexos-oportunidade: 50 MB e
-- planilha .xlsx (Plano 2 do conector, Task 4; spec 2026-09-25 §4.6 e §7, spec
-- 2026-10-08 §4 passo 6)
--
-- Por quê: editais grandes passam de 25 MB, e a proposta e o cronograma em Excel
-- (montados pelo Claude) vão para a pasta "Envelope 01 – Proposta" da
-- oportunidade. Pela 0015 o bucket aceita só pdf/jpeg/png até 25 MB.
--
-- APLICAR SÓ COM A P3 CONFIRMADA: o limite global de upload do plano do
-- Supabase precisa ser de pelo menos 50 MB. Antes, conferir o estado atual:
--   select id, file_size_limit, allowed_mime_types from storage.buckets
--    where id in ('anexos-oportunidade', 'certificados');
--
-- Não restringe nada do que hoje está livre e é idempotente: o limite só sobe
-- (greatest) e o MIME do xlsx só entra onde já existe lista; limite ou lista
-- nulos (= livres) continuam nulos.
-- ============================================================================

update storage.buckets
   set file_size_limit = case when file_size_limit is null then null
                              else greatest(file_size_limit, 52428800) end,
       allowed_mime_types = case when allowed_mime_types is null then null
         else (select array(select distinct unnest(allowed_mime_types
                 || array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']))) end
 where id = 'anexos-oportunidade';

select id, file_size_limit, allowed_mime_types
  from storage.buckets
 where id = 'anexos-oportunidade';

select 'ok' as res;
