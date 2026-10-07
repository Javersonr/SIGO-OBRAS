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
-- A prévia é UMA consulta só, com UMA linha por curso. É de propósito: o `db query` passa pela API de gestão
-- do Supabase, que pode devolver só o resultado do ÚLTIMO comando de um arquivo com vários. Com um comando só,
-- nada da prévia fica escondido. Não acrescente outro SELECT fora de comentário na parte A: se precisar de mais
-- uma coluna, ponha dentro desta consulta. Sem nenhuma linha no resultado = nenhum curso de NR-1/NR-6 sem
-- validade, ou seja, não há nada a gravar.
--
-- O que cada linha da prévia mostra:
--
--   * `o_que_a_gravacao_faz`: qual passo da parte B atinge o curso.
--       - "B1": curso NÃO ligado ao cadastro central (`modelo_treinamento_id` nulo). A validade é gravada
--         direto no curso.
--       - "B2": curso LIGADO ao cadastro central (migração 0131). O curso não manda na própria validade: o
--         trigger `sincronizar_modelo` sobrescreve `validade_meses` do curso com a do treinamento central (o
--         "modelo"), então gravar só no curso não pega. A validade é gravada no MODELO, e o trigger
--         `propagar_modelo` copia o valor para TODOS os registros ligados a ele:
--           . os cursos EAD ligados ao modelo (o que se quer);
--           . as EXIGÊNCIAS DAS FUNÇÕES (`treinamento` com `funcao_id`) que usam esse modelo (efeito
--             colateral): o modelo vale também para elas. Se alguma exigência já tem `data_fim` lançada, o
--             resumo antigo `alertar_treinamentos()` (0039, que lê `data_fim` + `validade_meses`) passa a
--             contá-la como "vencendo/vencido" assim que a validade existir.
--       - "NADA": o curso aparece, mas nenhum passo da parte B o altera (o modelo já tem validade, ou o curso
--         aponta para um modelo removido). Resolva à mão.
--   * `matriculas_concluidas_sem_renovacao`: matrículas já concluídas do curso sem `proxima_renovacao`. Elas NÃO
--     são recalculadas (a data só é gravada na conclusão): continuam sem data de renovação e nunca vencem.
--   * Colunas `modelo_*` e `aviso` (só nas linhas "B2"): o treinamento central que será alterado, quantos
--     cursos EAD estão ligados a ele (o total, não só os de NR-1/NR-6), quantas exigências de funções mudam
--     junto e quantas delas passam a alertar no `alertar_treinamentos()` antigo. Os números do modelo se
--     repetem nas linhas dos cursos que compartilham o mesmo modelo: não some entre linhas.
--
-- Só muda quem está SEM validade (`validade_meses is null`): nada que alguém já tenha preenchido é
-- sobrescrito.
--
-- Quem é NR-1 e NR-6: o código ou o nome do curso contém "NR-1" ou "NR-6" como palavra inteira (também
-- "NR 1", "NR1", "NR-01" e com travessão no lugar do hífen, como "NR – 1" ou "NR — 6", comum em nome
-- digitado no Word). "NR-10", "NR-16", "NR-35" etc. NÃO entram. Confira a lista da prévia: se algum curso
-- apareceu por engano ou faltou, ajuste antes de gravar.
--
-- Este arquivo não tem UUID, nome de empresa nem dado pessoal: tudo é lido do banco na hora.
-- ============================================================================

-- ============================================================================
-- PARTE A — PRÉVIA (só leitura; um comando só)
-- ============================================================================

with alvo as (
  select c.id as curso_id,
         c.empresa_id,
         c.codigo,
         c.nome,
         c.modalidade,
         c.ativo,
         c.modelo_treinamento_id,
         m.id as modelo_id,
         m.codigo as modelo_codigo,
         m.nome as modelo_nome,
         m.validade_meses as modelo_validade,
         -- true = a parte B2 grava no modelo e o trigger copia para o curso
         (m.id is not null and m.validade_meses is null) as grava_no_modelo
    from public.treinamento_curso c
    left join public.treinamento m
      on m.id = c.modelo_treinamento_id
     and m.empresa_id = c.empresa_id
     and m.deleted_at is null
     and m.funcao_id is null
     and m.modelo_treinamento_id is null
   where c.deleted_at is null
     and c.validade_meses is null
     and (coalesce(c.codigo, '') || ' ' || coalesce(c.nome, '')) ~* '\mNR[[:space:]–—-]*0?(1|6)\M'
)
select e.nome as empresa,
       a.codigo,
       a.nome as curso,
       a.modalidade,
       case when a.ativo then 'publicado' else 'rascunho' end as situacao,
       case
         when a.modelo_treinamento_id is null
           then 'B1: grava 24 direto no curso (sem vinculo com o cadastro central)'
         when a.modelo_id is null
           then 'NADA: o curso aponta para um treinamento central removido ou que nao e modelo, resolver a mao'
         when a.modelo_validade is not null
           then 'NADA: o treinamento central ja tem validade, resolver a mao'
         else 'B2: grava 24 no treinamento central (o curso copia a validade dele)'
       end as o_que_a_gravacao_faz,
       (select count(*)
          from public.treinamento_matricula x
         where x.curso_id = a.curso_id
           and x.deleted_at is null
           and x.status = 'concluido'
           and x.proxima_renovacao is null) as matriculas_concluidas_sem_renovacao,
       case when a.grava_no_modelo then a.modelo_codigo end as modelo_codigo,
       case when a.grava_no_modelo then a.modelo_nome end as modelo,
       case when a.grava_no_modelo then
         (select count(*)
            from public.treinamento_curso c2
           where c2.modelo_treinamento_id = a.modelo_id
             and c2.deleted_at is null)
       end as modelo_cursos_ead_ligados,
       case when a.grava_no_modelo then
         (select count(*)
            from public.treinamento x
           where x.modelo_treinamento_id = a.modelo_id
             and x.funcao_id is not null
             and x.deleted_at is null)
       end as modelo_exigencias_de_funcoes_que_tambem_mudam,
       case when a.grava_no_modelo then
         (select count(*)
            from public.treinamento x
           where x.modelo_treinamento_id = a.modelo_id
             and x.funcao_id is not null
             and x.deleted_at is null
             and x.data_fim is not null
             and (x.data_fim + interval '24 months')::date <= current_date + 30)
       end as modelo_exigencias_que_passam_a_alertar,
       case when a.grava_no_modelo then
         'ATENCAO: o modelo vale tambem para as exigencias das funcoes e para todos os cursos ligados a ele'
       end as aviso
  from alvo a
  join public.empresa e on e.id = a.empresa_id
 order by e.nome, a.nome;

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
--    and (coalesce(codigo, '') || ' ' || coalesce(nome, '')) ~* '\mNR[[:space:]–—-]*0?(1|6)\M';
--
-- -- B2. Cursos ligados: validade no treinamento central. O trigger `propagar_modelo` (0131) copia para os
-- --     cursos ligados e para as exigências das funções que usam o modelo (ver o aviso da prévia).
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
--         and (coalesce(c.codigo, '') || ' ' || coalesce(c.nome, '')) ~* '\mNR[[:space:]–—-]*0?(1|6)\M'
--    );
--
-- -- B3. Conferência (dentro da transação, antes de confirmar): todo curso de NR-1/NR-6 deve mostrar 24
-- select e.nome as empresa, c.codigo, c.nome as curso, c.validade_meses
--   from public.treinamento_curso c
--   join public.empresa e on e.id = c.empresa_id
--  where c.deleted_at is null
--    and (coalesce(c.codigo, '') || ' ' || coalesce(c.nome, '')) ~* '\mNR[[:space:]–—-]*0?(1|6)\M'
--  order by e.nome, c.nome;
--
-- commit;
