-- ============================================================================
-- ead-validade-nr1-nr6.sql — NR-1 e NR-6 com validade de 24 meses nos cursos EAD
--
-- Decisão D12 do Javerson (06/10/2026): os cursos de NR-1 e NR-6 vencem em 24 MESES. Hoje eles estão sem
-- `validade_meses`, então a matrícula concluída deles nunca ganha `proxima_renovacao` e nunca entra no painel
-- "Vencimentos" nem no aviso diário (migração 0138, T24).
--
-- Por que é um script à parte e não uma migração: é mudança de DADO (migração do portal não faz UPDATE de
-- dado real; a regra do handoff é "mudança de dado é decisão do Javerson"). Duas partes:
--
--   PARTE A — só leitura. Mostra o que mudaria. Rode primeiro e leve o resultado ao Javerson.
--   PARTE B — grava. Está COMENTADA de propósito: só descomente depois que o Javerson ver a prévia da
--             parte A. Para ensaiar, troque o `commit;` por `rollback;` (tudo é desfeito).
--
-- Como rodar a PARTE A (só leitura):
--   supabase db query --linked -f tools/ead-validade-nr1-nr6.sql
--
-- O que a prévia mostra e por que há dois caminhos:
--
--   * Curso NÃO ligado ao cadastro central (`modelo_treinamento_id` nulo): a validade é gravada direto no
--     curso.
--   * Curso LIGADO ao cadastro central (migração 0131): o curso não manda na própria validade. O trigger
--     `sincronizar_modelo` sobrescreve `validade_meses` do curso com a do treinamento central (o "modelo"),
--     então gravar só no curso não pega. A validade tem de ser gravada no MODELO, e o trigger
--     `propagar_modelo` copia o valor para TODOS os registros ligados a ele:
--       - os cursos EAD ligados ao modelo (o que se quer);
--       - as EXIGÊNCIAS DAS FUNÇÕES (`treinamento` com `funcao_id`) que usam esse modelo (efeito colateral):
--         o modelo vale também para elas. Se alguma exigência já tem `data_fim` lançada, o resumo antigo
--         `alertar_treinamentos()` (0039, que lê `data_fim` + `validade_meses`) passa a contá-la como
--         "vencendo/vencido" assim que a validade existir. A coluna `exigencias_que_passam_a_alertar` da
--         prévia conta esses casos.
--
-- Só muda quem está SEM validade (`validade_meses is null`): nada que alguém já tenha preenchido é
-- sobrescrito. Matrícula já concluída NÃO é recalculada: `proxima_renovacao` só é gravada na conclusão, então
-- quem concluiu antes continua sem data de renovação (a prévia mostra quantas são).
--
-- Quem é NR-1 e NR-6: o código ou o nome do curso contém "NR-1" ou "NR-6" como palavra inteira (também
-- "NR 1", "NR1", "NR-01"...). "NR-10", "NR-16", "NR-35" etc. NÃO entram. Confira a lista da prévia: se algum
-- curso apareceu por engano ou faltou, ajuste antes de gravar.
--
-- Este arquivo não tem UUID, nome de empresa nem dado pessoal: tudo é lido do banco na hora.
-- ============================================================================

-- ============================================================================
-- PARTE A — PRÉVIA (só leitura)
-- ============================================================================

-- A1. Cursos EAD de NR-1/NR-6 sem validade, e onde a validade seria gravada
select e.nome as empresa,
       c.codigo,
       c.nome as curso,
       c.modalidade,
       case when c.ativo then 'publicado' else 'rascunho' end as situacao,
       case
         when c.modelo_treinamento_id is null then 'direto no curso (sem vinculo com o cadastro central)'
         else 'no treinamento central (o curso copia a validade dele)'
       end as onde_gravar,
       (select count(*)
          from public.treinamento_matricula m
         where m.curso_id = c.id and m.deleted_at is null and m.status = 'concluido') as matriculas_concluidas_sem_renovacao
  from public.treinamento_curso c
  join public.empresa e on e.id = c.empresa_id
 where c.deleted_at is null
   and c.validade_meses is null
   and (coalesce(c.codigo, '') || ' ' || coalesce(c.nome, '')) ~* '\mNR[[:space:]-]*0?(1|6)\M'
 order by e.nome, c.nome;

-- A2. Treinamentos CENTRAIS (modelos) ligados a esses cursos: gravar neles muda também as exigências das funções
select e.nome as empresa,
       m.codigo,
       m.nome as modelo,
       m.validade_meses as validade_atual,
       (select count(*)
          from public.treinamento_curso c2
         where c2.modelo_treinamento_id = m.id and c2.deleted_at is null) as cursos_ead_ligados,
       (select count(*)
          from public.treinamento x
         where x.modelo_treinamento_id = m.id and x.funcao_id is not null and x.deleted_at is null) as exigencias_de_funcoes_que_tambem_mudam,
       (select count(*)
          from public.treinamento x
         where x.modelo_treinamento_id = m.id and x.funcao_id is not null and x.deleted_at is null
           and x.data_fim is not null
           and (x.data_fim + interval '24 months')::date <= current_date + 30) as exigencias_que_passam_a_alertar,
       'ATENCAO: o modelo vale tambem para as exigencias das funcoes e para todos os cursos ligados a ele' as aviso
  from public.treinamento m
  join public.empresa e on e.id = m.empresa_id
 where m.deleted_at is null
   and m.funcao_id is null
   and m.modelo_treinamento_id is null
   and m.validade_meses is null
   and m.id in (
     select c.modelo_treinamento_id
       from public.treinamento_curso c
      where c.deleted_at is null
        and c.validade_meses is null
        and c.modelo_treinamento_id is not null
        and (coalesce(c.codigo, '') || ' ' || coalesce(c.nome, '')) ~* '\mNR[[:space:]-]*0?(1|6)\M'
   )
 order by e.nome, m.nome;

-- ============================================================================
-- PARTE B — GRAVAÇÃO (comentada). Descomente SÓ depois de o Javerson ver a prévia da parte A.
-- Para ensaiar, troque o `commit;` por `rollback;`.
-- ============================================================================

-- begin;
--
-- -- B1. Cursos sem vínculo com o cadastro central: validade direto no curso
-- update public.treinamento_curso
--    set validade_meses = 24
--  where deleted_at is null
--    and validade_meses is null
--    and modelo_treinamento_id is null
--    and (coalesce(codigo, '') || ' ' || coalesce(nome, '')) ~* '\mNR[[:space:]-]*0?(1|6)\M';
--
-- -- B2. Cursos ligados: validade no treinamento central. O trigger `propagar_modelo` (0131) copia para os
-- --     cursos ligados e para as exigências das funções que usam o modelo (ver o aviso da prévia A2).
-- update public.treinamento m
--    set validade_meses = 24
--  where m.deleted_at is null
--    and m.funcao_id is null
--    and m.modelo_treinamento_id is null
--    and m.validade_meses is null
--    and m.id in (
--      select c.modelo_treinamento_id
--        from public.treinamento_curso c
--       where c.deleted_at is null
--         and c.validade_meses is null
--         and c.modelo_treinamento_id is not null
--         and (coalesce(c.codigo, '') || ' ' || coalesce(c.nome, '')) ~* '\mNR[[:space:]-]*0?(1|6)\M'
--    );
--
-- -- B3. Conferência (dentro da transação, antes de confirmar): todo curso de NR-1/NR-6 deve mostrar 24
-- select e.nome as empresa, c.codigo, c.nome as curso, c.validade_meses
--   from public.treinamento_curso c
--   join public.empresa e on e.id = c.empresa_id
--  where c.deleted_at is null
--    and (coalesce(c.codigo, '') || ' ' || coalesce(c.nome, '')) ~* '\mNR[[:space:]-]*0?(1|6)\M'
--  order by e.nome, c.nome;
--
-- commit;
