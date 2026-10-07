-- 0139 — EAD (NR-1): travas de integridade no banco (T32 do handoff do Portal de Treinamento)
--
-- Por quê: os números do curso (nota mínima, tentativas, intervalo, carga, validade, duração da aula) e o
-- gabarito da questão só eram conferidos pela tela. Quem grava por /rest/v1 (ou um script) podia pôr nota
-- mínima 500, validade negativa, gabarito apontando para uma alternativa que não existe, ou duas matrículas
-- abertas do mesmo funcionário no mesmo curso. Como o certificado nasce destes números, o banco passa a
-- recusar o que não faz sentido. Esta migração é a parte do banco; ela NÃO apaga nem corrige nenhum dado.
--
-- O que muda:
--
--   1. CHECK (nascem NOT VALID, ver o item "Como não falhar no meio"):
--        treinamento_curso   nota_minima             entre 0 e 100
--                            max_tentativas          >= 0   (0 = sem limite, como diz a tela)
--                            intervalo_tentativa_min >= 0
--                            carga_horaria_horas     > 0    (nulo continua valendo: curso sem carga)
--                            validade_meses          >= 0   (nulo ou 0 = sem validade)
--        treinamento_aula    duracao_seg             >= 0   (nulo continua valendo)
--        treinamento_questao correta                 dentro de opcoes: 0 <= correta < tamanho da lista;
--                            opcoes que não é lista JSON também é recusada (o tamanho só é medido depois
--                            de saber que é lista: jsonb_array_length LANÇA erro em objeto ou texto).
--      Coluna nula passa: CHECK só recusa quando a conta dá FALSE. Curso sem carga ou sem validade é
--      pendência de requisito na tela, não erro de banco. Não existe único em (curso_id, ordem): a troca de
--      ordem das aulas e das questões passa por estado repetido.
--
--   2. Índice único parcial da matrícula aberta: (funcionario_id, curso_id) onde deleted_at é nulo e
--      status <> 'concluido'. É a rede de segurança da regra que a tela já aplica (matriculasNovas): duas
--      abas, ou dois RHs, matriculando a mesma pessoa ao mesmo tempo. Matrícula concluída ou excluída
--      logicamente não conta (renovar cria uma nova ao lado da concluída).
--
--   3. treinamento_curso.ativo passa a nascer FALSE (curso novo é rascunho). A tela já grava ativo
--      explicitamente; o default só protege quem insere sem dizer. Não muda nenhum curso existente.
--
--   4. REVOKE ALL FROM anon nas tabelas do EAD e em entrega_ciencia. As migrações 0130, 0134 e 0135 já
--      fizeram isso em 10 delas; aqui entram também funcionario_portal_acesso (o hash da senha do portal) e
--      a repetição do resto, para o conjunto ficar escrito num lugar só. O portal e a validação pública
--      passam pelas Edge Functions (service role): o anon não usa nenhuma destas tabelas.
--
--   5. C9, a 0131 x o CHECK da carga: o trigger validar_modelo_de_treinamento (0131) copia a carga do
--      cadastro central (treinamento.carga_horaria, que aceita nulo e zero) para treinamento_curso a cada
--      INSERT/UPDATE de curso ligado a um modelo, e o propagar_modelo faz isso nos cursos ligados toda vez
--      que o modelo é editado. Com o CHECK carga_horaria_horas > 0, um modelo com carga 0 faria a edição
--      do cadastro central falhar com um erro de outra tabela. A função é recriada igual à da 0131 com UMA
--      mudança: carga do modelo nula, zero ou negativa vira NULL no curso (curso sem carga, que a tela já
--      mostra como pendência), em vez de gravar 0. Modelo com carga positiva segue copiado como antes. O
--      ramo das exigências das funções (tabela treinamento) não muda: ali não há o CHECK.
--      Esta migração NÃO corrige a carga de nenhum modelo nem curso: se houver curso ligado a modelo com
--      carga 0 hoje, o próprio curso (que tem o mesmo 0) aparece na conferência abaixo, e quem decide é o
--      Javerson, pela tela.
--
-- Como não falhar no meio (o pedido da tarefa):
--   - tudo roda numa transação só: qualquer erro desfaz tudo, não sobra meia migração;
--   - cada CHECK é criado NOT VALID. Isso é instantâneo, não varre a tabela e já vale para toda linha
--     NOVA e para todo UPDATE (uma linha antiga fora da regra só reclama quando for alterada);
--   - a validação das linhas antigas é um passo à parte, que tenta cada trava e, se achar dado fora da
--     regra, avisa (WARNING) e deixa AQUELA trava como NOT VALID em vez de derrubar a migração. Depois que o
--     dado for corrigido pela tela, basta aplicar de novo (ou rodar à mão
--     "alter table <tabela> validate constraint <nome>"): a migração só tenta o que ainda não foi validado;
--   - o índice único só é criado se não houver matrícula aberta repetida; se houver, avisa e segue sem ele.
--
-- Antes de aplicar, o Javerson roda a conferência (só leitura, não grava nada) e leva o resultado junto:
--   supabase db query --linked -f tools/conferir-checks-ead.sql
-- Em 30/09/2026 não havia matrícula, progresso, tentativa nem certificado, e os cursos tinham carga, nota,
-- tentativas e intervalo preenchidos: a conferência deve vir com zero nas linhas 1 a 9 e 12, e com a linha 15
-- "PENDENTE" (a função ainda é a da 0131). Se vier diferente, corrija pela tela antes de aplicar; a linha 15
-- "DIVERGENTE" quer dizer que a função em produção não é a da 0131: confira antes de aplicar, porque a 0139
-- a substitui.
--
-- Aplicar (o número 0139 é o próximo livre depois da 0138; o Javerson confirma o número antes):
--   supabase db query --linked -f supabase/migrations/0139_ead_travas_de_integridade.sql
-- Depois de aplicar, rodar a conferência de novo: a coluna trava_no_banco deve mostrar "validada" nas sete
-- travas e "criado" no índice, e a coluna veredito, "OK" ou "APLICADA" em tudo.
--
-- Idempotente: a função é recriada, cada trava só é criada se não existe, a validação só pega o que
-- está NOT VALID, o índice só é criado se não existe, e os REVOKE e o default repetem sem efeito.
--
-- Esta migração só mexe em esquema e permissão: nenhum INSERT, UPDATE, DELETE nem TRUNCATE de dado real.

begin;

-- 1. C9: a carga do cadastro central não chega ao curso como zero ------------------------------------
-- Igual à 0131, exceto a linha da carga do curso (ramo "else"): nula, zero ou negativa vira NULL.
create or replace function public.validar_modelo_de_treinamento()
returns trigger language plpgsql set search_path = public as $$
declare modelo public.treinamento%rowtype;
begin
  if new.modelo_treinamento_id is null then return new; end if;
  select * into modelo from public.treinamento
    where id = new.modelo_treinamento_id and empresa_id = new.empresa_id
      and funcao_id is null and modelo_treinamento_id is null and deleted_at is null;
  if not found then
    raise exception 'Selecione um treinamento do cadastro central da mesma empresa' using errcode = '42501';
  end if;
  if tg_table_name = 'treinamento' and new.id = modelo.id then
    raise exception 'Um treinamento não pode ser seu próprio modelo';
  end if;
  new.nome := modelo.nome;
  new.codigo := modelo.codigo;
  new.validade_meses := modelo.validade_meses;
  new.conteudo_programatico := modelo.conteudo_programatico;
  if tg_table_name = 'treinamento' then
    new.carga_horaria := modelo.carga_horaria;
    new.instrutor_nome := modelo.instrutor_nome;
    new.instrutor_cpf := modelo.instrutor_cpf;
    new.instrutor_assinatura_url := modelo.instrutor_assinatura_url;
    new.responsavel_tecnico_nome := modelo.responsavel_tecnico_nome;
    new.responsavel_tecnico_criacao := modelo.responsavel_tecnico_criacao;
    new.responsavel_tecnico_assinatura_url := modelo.responsavel_tecnico_assinatura_url;
    new.engenheiro_responsavel_nome := modelo.engenheiro_responsavel_nome;
    new.engenheiro_responsavel_crea := modelo.engenheiro_responsavel_crea;
    new.engenheiro_responsavel_assinatura_url := modelo.engenheiro_responsavel_assinatura_url;
    if modelo.ativo is false then new.ativo := false; end if;
  else
    -- O CHECK treinamento_curso_carga_horaria_chk exige carga > 0 (ou nula). O cadastro central aceita
    -- nulo e zero: o que não é positivo chega ao curso como NULL, para a edição do modelo não falhar.
    new.carga_horaria_horas := case when modelo.carga_horaria > 0 then modelo.carga_horaria else null end;
    -- Pessoas do EAD têm qualificação e registro próprios: o vínculo preserva
    -- esses campos. Só a identidade pedagógica vem do cadastro central.
    if modelo.ativo is false then new.ativo := false; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validar_modelo_de_treinamento() from public, anon, authenticated;

-- 2. CHECK, todos NOT VALID (valem para dado novo desde já; as linhas antigas são validadas no passo 3) ---
do $chk$ begin
  alter table public.treinamento_curso
    add constraint treinamento_curso_nota_minima_chk
    check (nota_minima between 0 and 100) not valid;
exception when duplicate_object then null; end $chk$;

do $chk$ begin
  alter table public.treinamento_curso
    add constraint treinamento_curso_max_tentativas_chk
    check (max_tentativas >= 0) not valid;
exception when duplicate_object then null; end $chk$;

do $chk$ begin
  alter table public.treinamento_curso
    add constraint treinamento_curso_intervalo_tentativa_chk
    check (intervalo_tentativa_min >= 0) not valid;
exception when duplicate_object then null; end $chk$;

do $chk$ begin
  alter table public.treinamento_curso
    add constraint treinamento_curso_carga_horaria_chk
    check (carga_horaria_horas > 0) not valid;
exception when duplicate_object then null; end $chk$;

do $chk$ begin
  alter table public.treinamento_curso
    add constraint treinamento_curso_validade_meses_chk
    check (validade_meses >= 0) not valid;
exception when duplicate_object then null; end $chk$;

do $chk$ begin
  alter table public.treinamento_aula
    add constraint treinamento_aula_duracao_seg_chk
    check (duracao_seg >= 0) not valid;
exception when duplicate_object then null; end $chk$;

do $chk$ begin
  alter table public.treinamento_questao
    add constraint treinamento_questao_correta_chk
    check (
      case when jsonb_typeof(opcoes) = 'array'
        then correta >= 0 and correta < jsonb_array_length(opcoes)
        else false end
    ) not valid;
exception when duplicate_object then null; end $chk$;

-- 3. Valida as linhas antigas, uma trava por vez; dado fora da regra vira aviso, não erro --------------
-- A trava que não passar continua NOT VALID (protegendo o dado novo). VALIDATE CONSTRAINT não bloqueia
-- escrita na tabela. Uma falha aqui desfaz só a validação daquela trava (cada uma tem o seu bloco).
do $validar$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass::text as tabela, c.conname::text as nome
    from pg_constraint c
    where c.connamespace = 'public'::regnamespace
      and c.contype = 'c'
      and not c.convalidated
      and c.conname = any (array[
        'treinamento_curso_nota_minima_chk',
        'treinamento_curso_max_tentativas_chk',
        'treinamento_curso_intervalo_tentativa_chk',
        'treinamento_curso_carga_horaria_chk',
        'treinamento_curso_validade_meses_chk',
        'treinamento_aula_duracao_seg_chk',
        'treinamento_questao_correta_chk'
      ])
    order by c.conname
  loop
    begin
      execute format('alter table %s validate constraint %I', r.tabela, r.nome);
    exception when check_violation then
      raise warning '0139: a trava % (tabela %) ficou NOT VALID: há linha antiga fora da regra. Rode tools/conferir-checks-ead.sql, corrija pela tela e aplique de novo.',
        r.nome, r.tabela;
    end;
  end loop;
end
$validar$;

-- 4. Matrícula aberta repetida: no máximo uma por funcionário e curso -----------------------------------
do $indice$
declare
  repetidas integer;
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'treinamento_matricula_viva_uidx'
  ) then
    return;
  end if;

  select count(*) into repetidas from (
    select 1
    from public.treinamento_matricula
    where deleted_at is null and status <> 'concluido'
    group by funcionario_id, curso_id having count(*) > 1
  ) d;

  if repetidas > 0 then
    raise warning '0139: o índice treinamento_matricula_viva_uidx NÃO foi criado: % par(es) funcionário x curso com mais de uma matrícula aberta. Rode tools/conferir-checks-ead.sql, exclua a repetida pela tela e aplique de novo.',
      repetidas;
    return;
  end if;

  create unique index if not exists treinamento_matricula_viva_uidx
    on public.treinamento_matricula (funcionario_id, curso_id)
    where deleted_at is null and status <> 'concluido';
end
$indice$;

-- 5. Curso novo nasce como rascunho ------------------------------------------------------------------------
alter table public.treinamento_curso alter column ativo set default false;

-- 6. O anônimo não usa nenhuma tabela do EAD (o portal passa pelas Edge Functions) --------------------------
revoke all on public.treinamento_curso from anon;
revoke all on public.treinamento_aula from anon;
revoke all on public.treinamento_questao from anon;
revoke all on public.treinamento_matricula from anon;
revoke all on public.treinamento_progresso from anon;
revoke all on public.treinamento_tentativa from anon;
revoke all on public.treinamento_evento from anon;
revoke all on public.treinamento_duvida from anon;
revoke all on public.treinamento_certificado from anon;
revoke all on public.funcionario_portal_acesso from anon;
revoke all on public.entrega_ciencia from anon;

commit;

-- Conferência (só leitura): cada trava e o índice, com a situação de agora. "NOT VALID" nas travas ou
-- "NÃO CRIADO" no índice quer dizer que sobrou dado fora da regra: veja os avisos acima e rode
-- tools/conferir-checks-ead.sql para saber quais linhas são.
select c.conrelid::regclass::text as tabela,
       c.conname::text as trava,
       case when c.convalidated then 'validada' else 'NOT VALID (há dado antigo fora da regra)' end as situacao
from pg_constraint c
where c.connamespace = 'public'::regnamespace
  and c.contype = 'c'
  and c.conname = any (array[
    'treinamento_curso_nota_minima_chk',
    'treinamento_curso_max_tentativas_chk',
    'treinamento_curso_intervalo_tentativa_chk',
    'treinamento_curso_carga_horaria_chk',
    'treinamento_curso_validade_meses_chk',
    'treinamento_aula_duracao_seg_chk',
    'treinamento_questao_correta_chk'
  ])
union all
select 'treinamento_matricula',
       'treinamento_matricula_viva_uidx',
       case when exists (
         select 1 from pg_indexes
         where schemaname = 'public' and indexname = 'treinamento_matricula_viva_uidx'
       ) then 'criado' else 'NÃO CRIADO (há matrícula aberta repetida)' end
order by 1, 2;

select 'ok' as res;
