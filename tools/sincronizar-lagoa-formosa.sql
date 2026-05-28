-- ============================================================================
-- Sincroniza o projeto "PM Lagoa Formosa - MG" com sua oportunidade origem,
-- preenchendo descricao, observacoes, responsaveis, licitacao, endereco
-- completo, etc.
--
-- Como usar:
--   1. Abrir Supabase Dashboard > SQL Editor
--      https://supabase.com/dashboard/project/fpyvdwpvxrubrkdwrqbs/sql
--   2. Colar este SQL inteiro
--   3. Run.
--   4. Conferir o resultado (campos_atualizados / arquivos_movidos / etc).
-- ============================================================================

-- PASSO 1 — listar projetos com "Lagoa Formosa" no nome pra escolher o certo
select
  p.id,
  p.nome,
  p.cidade,
  p.estado,
  e.nome as empresa,
  p.oportunidade_origem_id,
  case when p.oportunidade_origem_id is null then '⚠️ sem oportunidade origem' else 'OK' end as status
from public.projeto p
join public.empresa e on e.id = p.empresa_id
where p.nome ilike '%lagoa formosa%'
   or p.nome ilike '%PM%lagoa%'
order by p.created_at desc;

-- PASSO 2 — Se achou MAIS DE UM projeto, copiar o uuid do certo aqui:
-- Trocar 'COLE_O_ID_AQUI' pelo id real e rodar SO o select abaixo.
--
-- Se achou SO UM, deixe como esta (usa o primeiro match):

with proj as (
  select id from public.projeto
   where nome ilike '%lagoa formosa%' or nome ilike '%PM%lagoa%'
   order by created_at desc
   limit 1
)
select public.sincronizar_projeto_com_oportunidade((select id from proj));

-- PASSO 3 — Verificar resultado: conferir como ficou o projeto agora
select
  p.id, p.nome,
  substring(p.descricao for 80) as descricao,
  substring(p.observacoes for 80) as observacoes,
  p.probabilidade,
  p.data_fechamento_prevista,
  p.origem_nome,
  p.licitacao_modalidade,
  p.licitacao_data,
  p.cep, p.endereco, p.numero, p.bairro, p.cidade, p.estado,
  p.responsaveis_emails,
  jsonb_array_length(coalesce(p.responsaveis_emails, '[]'::jsonb)) as qt_responsaveis,
  (select count(*) from public.arquivo_oportunidade where projeto_id = p.id) as qt_arquivos,
  (select count(*) from public.oportunidade_atualizacao where projeto_id = p.id) as qt_timeline
from public.projeto p
where p.nome ilike '%lagoa formosa%' or p.nome ilike '%PM%lagoa%'
order by p.created_at desc;
