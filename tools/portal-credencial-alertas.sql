-- ============================================================================
-- portal-credencial-alertas.sql — consulta de alerta do operador (T38, §4.3 defesa 5). SÓ LEITURA.
--
-- O registro do operador (portal_credencial_evento, migração 0145) guarda o que, na trilha de uma empresa, contaria
-- ao RH o que a pessoa faz em outra: senha criada, criação de senha recusada, acesso confirmado, troca na ativação,
-- bloqueio, senha errada (com IP e dispositivo) e o procedimento do operador. Nenhuma empresa lê esse registro.
-- Esta consulta lista as credenciais que merecem o olho do suporte do SIGO (P9: é uma consulta, não um aviso).
--
-- Como rodar (o Javerson, quando quiser; sugestão: uma vez por semana):
--   supabase db query --linked -f tools/portal-credencial-alertas.sql
--
-- Regras (cada linha do resultado é uma credencial numa regra):
--   1. reset_recusado: alguém tentou criar senha nova com a provisória de uma empresa em que a pessoa nunca entrou
--      com a senha (defesa 1), nos últimos 30 dias. Para não encher a lista de inocentes (revisão 2, m7), sai a recusa
--      que foi seguida, em até 1 dia e na mesma empresa, de um acesso_confirmado: é a própria pessoa que tocou em
--      "criar senha" na 2ª empresa e depois usou "Já uso o portal em outra empresa". Fica o que sobra: quem não
--      sabia a senha (pode ser um cadastro com o CPF de outra pessoa).
--   2. senha_criada_em_varias_empresas: senha criada com provisórias de duas ou mais empresas diferentes em 7 dias
--      (uma empresa travando as outras).
--   3. muitas_senhas_criadas: três ou mais senhas criadas em 24 horas.
-- O resultado tem o usuário (CPF): fica no console de quem roda. Para saber o que houve, leia os eventos da
-- credencial:
--   select * from public.portal_credencial_evento where credencial_id = '<credencial_id>' order by created_at;
-- e confira com a PRÓPRIA pessoa, por um canal que não passa pelo RH envolvido, antes de qualquer procedimento
-- (tools/portal-credencial-redefinir.sql).
-- ============================================================================

with recusas as (
  select e.credencial_id,
         'reset_recusado' as regra,
         count(*) as quantidade,
         array_agg(distinct e.empresa_id) filter (where e.empresa_id is not null) as empresas,
         min(e.created_at) as primeiro,
         max(e.created_at) as ultimo
    from public.portal_credencial_evento e
   where e.evento = 'reset_recusado'
     and e.created_at > now() - interval '30 days'
     and not exists (
       select 1
         from public.portal_credencial_evento c
        where c.credencial_id = e.credencial_id
          and c.evento = 'acesso_confirmado'
          and c.empresa_id is not distinct from e.empresa_id
          and c.created_at between e.created_at and e.created_at + interval '1 day'
     )
   group by e.credencial_id
), varias_empresas as (
  select e.credencial_id,
         'senha_criada_em_varias_empresas' as regra,
         count(*) as quantidade,
         array_agg(distinct e.empresa_id) filter (where e.empresa_id is not null) as empresas,
         min(e.created_at) as primeiro,
         max(e.created_at) as ultimo
    from public.portal_credencial_evento e
   where e.evento = 'senha_criada'
     and e.created_at > now() - interval '7 days'
   group by e.credencial_id
  having count(distinct e.empresa_id) >= 2
), em_um_dia as (
  select e.credencial_id,
         'muitas_senhas_criadas' as regra,
         count(*) as quantidade,
         array_agg(distinct e.empresa_id) filter (where e.empresa_id is not null) as empresas,
         min(e.created_at) as primeiro,
         max(e.created_at) as ultimo
    from public.portal_credencial_evento e
   where e.evento = 'senha_criada'
     and e.created_at > now() - interval '24 hours'
   group by e.credencial_id
  having count(*) >= 3
), alertas as (
  select * from recusas
  union all
  select * from varias_empresas
  union all
  select * from em_um_dia
)
select a.regra,
       a.credencial_id,
       c.usuario,
       a.quantidade,
       a.empresas,
       a.primeiro,
       a.ultimo
  from alertas a
  left join public.portal_credencial c on c.id = a.credencial_id
 order by a.ultimo desc, a.regra;
