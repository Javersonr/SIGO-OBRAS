-- 0138 — EAD (NR-1 1.7.1.2.2): aviso diário de vencimento dos treinamentos do portal (T24 do handoff do
-- Portal de Treinamento)
--
-- Por quê: o `proxima_renovacao` das matrículas do portal (treinamento_matricula) só era exibido. O aviso
-- diário que já existe, `alertar_treinamentos()` (0039), lê a tabela antiga `treinamento` (data_fim +
-- validade_meses) e não enxerga o EAD: um certificado do portal podia vencer sem que o RH recebesse
-- nenhum aviso. Esta migração cria uma função própria e um cron próprio. `alertar_treinamentos()` NÃO é
-- alterada (continua cobrindo os treinamentos lançados à mão).
--
-- O que a função faz (`alertar_treinamentos_ead`): lê SÓ o EAD (matrícula, curso, certificado e o cadastro
-- do funcionário) e manda 1 resumo por empresa por dia, no mesmo padrão da 0039 (`notificar_gestores`:
-- owners + Admin Holding, Admin e Gestor; tipo 'Sistema', porque `notificacao.tipo` não tem 'RH'/'SST').
-- Entra no resumo a matrícula CONCLUÍDA cuja renovação já venceu ou vence em até 30 dias e que ainda não
-- tem nova matrícula aberta no mesmo curso (quem já está renovando não precisa de aviso). A regra é a
-- mesma do painel "Vencimentos" da tela do RH (apps/web/src/lib/ead-vencimentos.js: `selecionarVencimentos`
-- e `precisaDeAviso`); mudou uma, mude a outra:
--   - matrícula viva, concluída, com `proxima_renovacao`, de curso vivo que NÃO seja de apoio (o apoio
--     nunca emite nem renova, D3) e de funcionário ativo;
--   - certificado revogado fica de fora (não há o que renovar);
--   - por funcionário e curso vale só a conclusão de renovação mais distante (a anterior é histórico);
--   - vencido = renovação antes de hoje; "hoje" é o dia de BRASÍLIA (a 0039 usa current_date, em UTC);
--   - "nova matrícula" = outra matrícula viva e ainda não concluída do mesmo funcionário no mesmo curso.
-- Curso sem `validade_meses` não vence: a matrícula concluída dele não tem `proxima_renovacao` e nunca
-- entra aqui. (NR-1 e NR-6 passam a ter 24 meses por decisão do Javerson, D12, mas isso é DADO e não está
-- nesta migração: ver tools/ead-validade-nr1-nr6.sql, que só roda depois da prévia.)
--
-- Não duplica aviso no mesmo dia: o `dedup_key` leva a empresa e a data de Brasília
-- ('treino_ead_resumo:<empresa>:<data>'), e `criar_notificacao_dedup` não cria outra notificação viva com
-- a mesma chave para o mesmo destinatário. Rodar a função duas vezes no mesmo dia não cria nada novo.
--
-- Privilégios (0110): só servidor. `revoke` de public, anon e authenticated e `grant` só para service_role;
-- o pg_cron roda como o dono da função, que não precisa de grant. `security definer` + search_path fixo,
-- como as demais `alertar_*`. Sem `exigir_empresa_do_chamador`: não há chamador de usuário, a função varre
-- todas as empresas e separa o resumo por `empresa_id`.
--
-- Depende de: 0036 (notificar_gestores, pg_cron), 0097/0103/0130 (matrícula, certificado), 0136
-- (treinamento_curso.modalidade).
--
-- Cron: 11:12 UTC (08:12 em Brasília), entre `alertar_treinamentos` (11:10) e `alertar_ferramental` (11:15).
-- `unschedule` antes do `schedule`: reaplicar a migração não cria o job em dobro.
--
-- Idempotente (create or replace; unschedule/schedule). Sem UPDATE de dados reais.
--
-- Depois de aplicar, o Javerson roda a função à mão UMA vez e confere o sino (resultado = quantas empresas
-- receberam resumo; 0 se ninguém tem matrícula do portal vencida ou a vencer em 30 dias):
--   supabase db query --linked "select public.alertar_treinamentos_ead() as empresas_avisadas;"
-- e, para ver o job: a conferência impressa no fim deste arquivo.

begin;

create or replace function public.alertar_treinamentos_ead()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_total int := 0;
begin
  for rec in
    with candidatas as (
      -- por (empresa, funcionário, curso), só a conclusão de renovação mais distante
      select distinct on (m.empresa_id, m.funcionario_id, m.curso_id)
             m.empresa_id, m.funcionario_id, m.curso_id, m.proxima_renovacao
        from public.treinamento_matricula m
        join public.treinamento_curso c
          on c.id = m.curso_id and c.empresa_id = m.empresa_id and c.deleted_at is null
        join public.funcionario f
          on f.id = m.funcionario_id and f.empresa_id = m.empresa_id
         and f.ativo = true and f.deleted_at is null
       where m.deleted_at is null
         and m.status = 'concluido'
         and m.proxima_renovacao is not null
         and c.modalidade <> 'apoio'
         and not exists (
           select 1 from public.treinamento_certificado ce
            where ce.matricula_id = m.id and ce.revogado_em is not null
         )
       order by m.empresa_id, m.funcionario_id, m.curso_id,
                m.proxima_renovacao desc, m.created_at desc, m.id desc
    )
    select k.empresa_id,
           count(*) filter (where k.proxima_renovacao < v_hoje) as vencidas,
           count(*) filter (where k.proxima_renovacao >= v_hoje) as a_vencer
      from candidatas k
     where k.proxima_renovacao <= v_hoje + 30
       and not exists (
         -- renovação já em andamento: outra matrícula aberta no mesmo curso
         select 1 from public.treinamento_matricula a
          where a.empresa_id = k.empresa_id
            and a.funcionario_id = k.funcionario_id
            and a.curso_id = k.curso_id
            and a.deleted_at is null
            and a.status <> 'concluido'
       )
     group by k.empresa_id
  loop
    perform public.notificar_gestores(
      rec.empresa_id,
      array['Admin Holding', 'Admin', 'Gestor'],
      'Treinamentos EAD a vencer',
      format(
        '%s treinamento(s) do portal vencido(s) e %s vencendo em até 30 dias, sem nova matrícula. '
        'Veja em RH e Segurança, aba Treinamentos, painel Vencimentos.',
        rec.vencidas, rec.a_vencer
      ),
      '/SegurancaTrabalho',
      'Sistema',
      case when rec.vencidas > 0 then 'Alta' else 'Normal' end,
      'treino_ead_resumo:' || rec.empresa_id::text || ':' || v_hoje::text
    );
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

comment on function public.alertar_treinamentos_ead() is
  'Resumo diário por empresa dos treinamentos do portal (EAD) vencidos ou a vencer em 30 dias, sem nova '
  'matrícula. Só lê o EAD. Regra espelhada em apps/web/src/lib/ead-vencimentos.js. 1 aviso por empresa por dia.';

revoke all on function public.alertar_treinamentos_ead() from public, anon, authenticated;
grant execute on function public.alertar_treinamentos_ead() to service_role;

-- Agendamento (manhã de Brasília) -----------------------------------------------------------------
do $$ begin perform cron.unschedule('alertar_treinamentos_ead'); exception when others then null; end $$;
select cron.schedule('alertar_treinamentos_ead', '12 11 * * *', $$ select public.alertar_treinamentos_ead(); $$);

commit;

-- Conferência (só leitura): o job existe e está ativo.
select jobname, schedule, active
  from cron.job
 where jobname = 'alertar_treinamentos_ead';

select 'ok' as res;
