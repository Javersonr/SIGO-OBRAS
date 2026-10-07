-- ============================================================================
-- conferir-checks-ead.sql — SÓ LEITURA: conta, em produção, as linhas que violariam cada trava da migração
-- 0139 (T32 do handoff do Portal de Treinamento: CHECK, índice único de matrícula aberta, default de
-- treinamento_curso.ativo e revoke do anon), e os modelos do cadastro central que alimentam os cursos EAD (C9).
--
-- Quem roda: o Javerson, ANTES de aplicar a 0139 (e de novo depois, para conferir que tudo ficou validado):
--   supabase db query --linked -f tools/conferir-checks-ead.sql
-- Não grava nada, não abre transação, não cria nada: é UMA consulta só. É de propósito: o `db query` passa pela
-- API de gestão do Supabase, que pode devolver só o resultado do ÚLTIMO comando de um arquivo com vários. Não
-- acrescente outro comando fora de comentário: se precisar de mais uma linha, ponha dentro desta consulta.
--
-- Como ler (uma linha por regra; as linhas vêm na ordem da coluna n):
--   linhas_afetadas  quantas linhas hoje violariam a regra. Conta TAMBÉM as excluídas logicamente (deleted_at),
--                    porque o CHECK vale para a tabela inteira; "vivas" é a parte que ainda aparece na tela.
--   veredito         OK = zero linhas. CORRIGIR = corrija pela tela antes de aplicar a 0139 (ou aplique assim
--                    mesmo: a 0139 deixa aquela trava NOT VALID, avisa, e a trava já vale para dado novo).
--                    INFORMATIVO = não é erro; só mostra o que a 0139 vai fazer.
--   exemplos         até 5 ids das linhas (para o Javerson achar na tela ou pedir a consulta). Sem dado pessoal.
--   trava_no_banco   "ainda não existe" antes da 0139; "NOT VALID" ou "validada" depois (o esperado é "validada").
--
-- Linhas 1 a 8: as sete travas (a do gabarito ocupa duas linhas: 7 = opcoes que não é lista JSON, 8 = gabarito
-- fora da lista). A regra é a MESMA do CHECK: só reprova quando a conta dá FALSE (nulo passa), por isso o
-- "is false".
-- Linha 9: matrícula aberta repetida, as mesmas linhas que o índice único parcial recusaria.
-- Linhas 10 a 12 (C9): modelos do cadastro central (treinamento sem função e sem modelo, vivos) que têm curso
--   EAD vivo ligado. A 0131 copia a carga e a validade do modelo para o curso a cada gravação do curso:
--     10  carga nula no modelo: o curso fica sem carga (já é assim hoje; a tela mostra como pendência);
--     11  carga zero ou negativa no modelo: o CHECK recusaria o 0 no curso; a 0139 recria a função da 0131 e
--         grava NULL no curso nesse caso (sem erro). Quem decide a carga certa é o Javerson, pela tela;
--     12  validade negativa no modelo: a cópia para o curso seria recusada pelo CHECK de validade, e a edição
--         do cadastro central falharia. Corrija o modelo ANTES (a 0139 não mexe na validade do modelo).
--   Linhas 4 e 5 já pegam o curso que carrega um 0 ou um negativo (ligado a modelo ou não).
-- Linha 13: o anon ainda tem privilégio em alguma tabela do EAD? Linha 14: o default de ativo ainda é true?
-- Linha 15: a função validar_modelo_de_treinamento (a que copia o modelo para o curso) ainda é a da 0131?
--   Estas três não são "dado fora da regra": mostram se a 0139 já foi aplicada (veredito PENDENTE/APLICADA).
--   DIVERGENTE na linha 15 = a função em produção não é nem a da 0131 nem a da 0139 (alguém a alterou fora das
--   migrações): a 0139 a substituiria, então confira o texto dela antes de aplicar.
--
-- Este arquivo não tem UUID, nome de empresa nem dado pessoal: tudo é lido do banco na hora.
-- ============================================================================

with travas as (
  select c.conname::text as nome,
         case when c.convalidated then 'validada' else 'NOT VALID' end as estado
  from pg_constraint c
  where c.connamespace = 'public'::regnamespace
    and c.contype = 'c'
),
-- modelos do cadastro central que têm curso EAD vivo ligado (a 0131 copia carga e validade para o curso)
modelos_em_uso as (
  select m.id, m.carga_horaria, m.validade_meses
  from public.treinamento m
  where m.funcao_id is null and m.modelo_treinamento_id is null and m.deleted_at is null
    and exists (
      select 1 from public.treinamento_curso c
      where c.modelo_treinamento_id = m.id and c.deleted_at is null
    )
)
select r.n, r.tabela, r.regra, r.linhas_afetadas, r.vivas, r.veredito, r.exemplos, r.trava_no_banco
from (
  -- 1. nota mínima entre 0 e 100
  select 1 as n,
         'treinamento_curso'::text as tabela,
         'nota_minima entre 0 e 100'::text as regra,
         count(*) as linhas_afetadas,
         count(*) filter (where deleted_at is null) as vivas,
         case when count(*) = 0 then 'OK' else 'CORRIGIR' end as veredito,
         array_to_string((array_agg(id::text order by id))[1:5], ', ') as exemplos,
         coalesce((select estado from travas where nome = 'treinamento_curso_nota_minima_chk'), 'ainda não existe') as trava_no_banco
  from public.treinamento_curso
  where (nota_minima between 0 and 100) is false

  union all
  -- 2. máximo de tentativas (0 = sem limite)
  select 2, 'treinamento_curso', 'max_tentativas >= 0',
         count(*), count(*) filter (where deleted_at is null),
         case when count(*) = 0 then 'OK' else 'CORRIGIR' end,
         array_to_string((array_agg(id::text order by id))[1:5], ', '),
         coalesce((select estado from travas where nome = 'treinamento_curso_max_tentativas_chk'), 'ainda não existe')
  from public.treinamento_curso
  where (max_tentativas >= 0) is false

  union all
  -- 3. intervalo entre tentativas
  select 3, 'treinamento_curso', 'intervalo_tentativa_min >= 0',
         count(*), count(*) filter (where deleted_at is null),
         case when count(*) = 0 then 'OK' else 'CORRIGIR' end,
         array_to_string((array_agg(id::text order by id))[1:5], ', '),
         coalesce((select estado from travas where nome = 'treinamento_curso_intervalo_tentativa_chk'), 'ainda não existe')
  from public.treinamento_curso
  where (intervalo_tentativa_min >= 0) is false

  union all
  -- 4. carga horária positiva (nula passa); inclui o curso ligado a modelo cuja carga copiada é 0
  select 4, 'treinamento_curso', 'carga_horaria_horas > 0 (nula passa)',
         count(*), count(*) filter (where deleted_at is null),
         case when count(*) = 0 then 'OK' else 'CORRIGIR' end,
         array_to_string((array_agg(id::text order by id))[1:5], ', '),
         coalesce((select estado from travas where nome = 'treinamento_curso_carga_horaria_chk'), 'ainda não existe')
  from public.treinamento_curso
  where (carga_horaria_horas > 0) is false

  union all
  -- 5. validade (nula ou 0 = sem validade)
  select 5, 'treinamento_curso', 'validade_meses >= 0 (nula passa)',
         count(*), count(*) filter (where deleted_at is null),
         case when count(*) = 0 then 'OK' else 'CORRIGIR' end,
         array_to_string((array_agg(id::text order by id))[1:5], ', '),
         coalesce((select estado from travas where nome = 'treinamento_curso_validade_meses_chk'), 'ainda não existe')
  from public.treinamento_curso
  where (validade_meses >= 0) is false

  union all
  -- 6. duração da aula (em PDF e texto é o tempo mínimo de leitura)
  select 6, 'treinamento_aula', 'duracao_seg >= 0 (nula passa)',
         count(*), count(*) filter (where deleted_at is null),
         case when count(*) = 0 then 'OK' else 'CORRIGIR' end,
         array_to_string((array_agg(id::text order by id))[1:5], ', '),
         coalesce((select estado from travas where nome = 'treinamento_aula_duracao_seg_chk'), 'ainda não existe')
  from public.treinamento_aula
  where (duracao_seg >= 0) is false

  union all
  -- 7. questão: opcoes que não é lista JSON (objeto, texto legado, número)
  select 7, 'treinamento_questao', 'correta dentro de opcoes: opcoes precisa ser uma lista JSON',
         count(*), count(*) filter (where deleted_at is null),
         case when count(*) = 0 then 'OK' else 'CORRIGIR' end,
         array_to_string((array_agg(id::text order by id))[1:5], ', '),
         coalesce((select estado from travas where nome = 'treinamento_questao_correta_chk'), 'ainda não existe')
  from public.treinamento_questao
  where jsonb_typeof(opcoes) is distinct from 'array'

  union all
  -- 8. questão: gabarito fora da lista (a conta de tamanho só roda em lista: jsonb_array_length falha em escalar)
  select 8, 'treinamento_questao', 'correta dentro de opcoes: 0 <= correta < tamanho da lista',
         count(*), count(*) filter (where deleted_at is null),
         case when count(*) = 0 then 'OK' else 'CORRIGIR' end,
         array_to_string((array_agg(id::text order by id))[1:5], ', '),
         coalesce((select estado from travas where nome = 'treinamento_questao_correta_chk'), 'ainda não existe')
  from public.treinamento_questao
  where case when jsonb_typeof(opcoes) = 'array'
          then (correta >= 0 and correta < jsonb_array_length(opcoes)) is false
          else false end

  union all
  -- 9. matrícula aberta (viva e não concluída) repetida para o mesmo funcionário e curso
  select 9, 'treinamento_matricula', 'no máximo 1 matrícula aberta por funcionário e curso (índice único)',
         count(*), count(*),
         case when count(*) = 0 then 'OK' else 'CORRIGIR' end,
         array_to_string((array_agg(d.id::text order by d.id))[1:5], ', '),
         coalesce((select 'criado' from pg_indexes
                   where schemaname = 'public' and indexname = 'treinamento_matricula_viva_uidx'), 'ainda não existe')
  from (
    select id, funcionario_id, curso_id,
           count(*) over (partition by funcionario_id, curso_id) as qtd
    from public.treinamento_matricula
    where deleted_at is null and status <> 'concluido'
  ) d
  where d.qtd > 1

  union all
  -- 10. C9: modelo do cadastro central com carga nula
  select 10, 'treinamento (modelo)', 'C9: modelo com curso EAD ligado e carga_horaria nula',
         count(*), count(*),
         case when count(*) = 0 then 'OK' else 'INFORMATIVO: o curso ligado fica sem carga (pendência na tela, não é erro de banco)' end,
         array_to_string((array_agg(m.id::text order by m.id))[1:5], ', '),
         '-'
  from modelos_em_uso m
  where m.carga_horaria is null

  union all
  -- 11. C9: modelo com carga zero ou negativa (o CHECK do curso recusaria; a 0139 grava NULL no curso)
  select 11, 'treinamento (modelo)', 'C9: modelo com curso EAD ligado e carga_horaria <= 0',
         count(*), count(*),
         case when count(*) = 0 then 'OK' else 'INFORMATIVO: a 0139 grava NULL no curso ligado em vez de 0 - defina a carga certa pela tela' end,
         array_to_string((array_agg(m.id::text order by m.id))[1:5], ', '),
         '-'
  from modelos_em_uso m
  where m.carga_horaria <= 0

  union all
  -- 12. C9: modelo com validade negativa (a cópia para o curso seria recusada pelo CHECK de validade)
  select 12, 'treinamento (modelo)', 'C9: modelo com curso EAD ligado e validade_meses < 0',
         count(*), count(*),
         case when count(*) = 0 then 'OK' else 'CORRIGIR O MODELO ANTES: a cópia para o curso seria recusada' end,
         array_to_string((array_agg(m.id::text order by m.id))[1:5], ', '),
         '-'
  from modelos_em_uso m
  where m.validade_meses < 0

  union all
  -- 13. o anon ainda tem algum privilégio em tabela do EAD ou em entrega_ciencia?
  select 13, 'EAD (11 tabelas)', 'anon sem nenhum privilégio nas tabelas do EAD e em entrega_ciencia',
         count(*), null::bigint,
         case when count(*) = 0 then 'APLICADA' else 'PENDENTE: a 0139 retira o acesso do anon' end,
         string_agg(t.relname, ', ' order by t.relname),
         '-'
  from (
    select c.relname::text as relname
    from pg_class c
    join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname = any (array[
        'treinamento_curso', 'treinamento_aula', 'treinamento_questao', 'treinamento_matricula',
        'treinamento_progresso', 'treinamento_tentativa', 'treinamento_evento', 'treinamento_duvida',
        'treinamento_certificado', 'funcionario_portal_acesso', 'entrega_ciencia'
      ])
      and exists (
        select 1
        from aclexplode(c.relacl) a
        join pg_roles r on r.oid = a.grantee
        where r.rolname = 'anon'
      )
  ) t

  union all
  -- 14. default da coluna ativo (hoje true; a 0139 muda para false)
  select 14, 'treinamento_curso', 'coluna ativo nasce false (curso novo é rascunho)',
         case when x.padrao is distinct from 'false' then 1 else 0 end::bigint, null::bigint,
         case when x.padrao is distinct from 'false' then 'PENDENTE: a 0139 troca o default' else 'APLICADA' end,
         x.padrao,
         '-'
  from (
    select column_default as padrao
    from information_schema.columns
    where table_schema = 'public' and table_name = 'treinamento_curso' and column_name = 'ativo'
  ) x

  union all
  -- 15. C9: a função da 0131 que copia carga e validade do modelo para o curso (a 0139 troca só a linha da carga)
  select 15, 'função validar_modelo_de_treinamento', 'C9: carga do modelo nula ou zero chega ao curso como NULL',
         case when p.prosrc like '%case when modelo.carga_horaria > 0%' then 0 else 1 end::bigint, null::bigint,
         case when p.prosrc like '%case when modelo.carga_horaria > 0%' then 'APLICADA'
              when p.prosrc like '%new.carga_horaria_horas := modelo.carga_horaria%' then 'PENDENTE: a 0139 recria a função'
              else 'DIVERGENTE da 0131: confira o texto da função antes de aplicar a 0139' end,
         null::text,
         '-'
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'validar_modelo_de_treinamento'
) r
order by r.n;
