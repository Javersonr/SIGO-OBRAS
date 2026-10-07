-- 0142 — EAD (NR-1 1.7.1.2 a 1.7.1.2.3.1; NR-10): tipo do treinamento e pré-requisito entre cursos (T23 do handoff
-- do Portal de Treinamento)
--
-- Por quê: (1) a matrícula não dizia se o treinamento era inicial, periódico ou eventual, nem o motivo do eventual,
-- e a NR-1 trata os três de forma diferente (1.7.1.2: inicial antes de começar a atividade; periódico no prazo da
-- NR; eventual quando muda o ambiente, o equipamento ou o procedimento, depois de acidente, afastamento longo...).
-- O certificado e a consulta pública precisam dizer qual foi. (2) Não havia pré-requisito: o NR-10 Complementar
-- (SEP) exige o NR-10 Básico, e o sistema deixava matricular e emitir o SEP sem o Básico.
--
-- O que muda:
--
--   treinamento_matricula
--     tipo            'inicial' (padrão) | 'periodico' | 'eventual'. O padrão vale para as matrículas que já
--                     existem (o tipo delas nunca foi perguntado) e para quem inserir sem dizer.
--     motivo_eventual texto de 3 a 200 caracteres, OBRIGATÓRIO quando o tipo é 'eventual' e NULO nos outros dois
--                     (a restrição repete a regra da tela; sem ela, uma chamada direta à API poderia gravar
--                     "eventual" sem motivo, ou um motivo enorme que sairia no certificado e na consulta pública).
--     O trigger matricula_andamento_so_servidor (0130) continua como está: no INSERT ele só zera andamento e
--     conclusão (status, datas, nota, aprovação) e não toca em tipo nem em motivo_eventual; no UPDATE a empresa só
--     muda tentativas_extras e deleted_at, então o tipo escolhido na matrícula NÃO muda depois (quem errou remove a
--     matrícula e matricula de novo). Só o servidor (service role) e o super admin alteram o tipo de uma matrícula.
--
--   treinamento_curso
--     pre_requisito_curso_id  o curso que o aluno tem de ter concluído, e dentro da validade, para MATRICULAR neste
--                             e para EMITIR o certificado deste (o servidor recusa com 409 PRE_REQUISITO). Aponta
--                             para outro treinamento_curso (FK, on delete set null: apagar o curso exigido de vez
--                             solta o vínculo em vez de travar). O pré-requisito fica no CURSO EAD, não no cadastro
--                             central de treinamentos: a 0131 só copia nome, código, carga, validade e conteúdo do
--                             modelo para o curso e não toca nesta coluna.
--     treinamento_curso_pre_requisito_proprio_chk  o curso não pode exigir a si mesmo.
--     pre_requisito_sem_ciclo (trigger)            A exige B e B exige A (ou uma volta maior) nunca terminaria:
--                                                  o trigger recusa o vínculo que fecharia o círculo.
--     referencias_da_empresa_pre_requisito (trigger)  o curso exigido tem de ser da MESMA empresa (modelo: 0118;
--                                                  o nome é outro porque referencias_da_empresa_modelo já é da 0131).
--
-- Idempotente: as colunas são "add column if not exists"; as restrições e os triggers são recriados; a função é
-- "create or replace". Sem UPDATE de dados reais: nenhuma matrícula muda de tipo e nenhum curso ganha pré-requisito
-- sozinho (o RH escolhe o pré-requisito pela tela do curso).
--
-- Depois de aplicar: publicar portal-funcionario e validar-certificado (esta SEM --no-verify-jwt) e o site. A ORDEM
-- importa: o portal-funcionario novo lê as colunas tipo e motivo_eventual; publicado antes desta migração, o portal
-- inteiro falha. Em RH & Segurança → Treinamentos → curso, o RH escolhe o pré-requisito (por exemplo, no NR-10
-- Complementar SEP, o NR-10 Básico).

begin;

-- 1. tipo e motivo na matrícula -------------------------------------------------------------------------------
alter table public.treinamento_matricula
  add column if not exists tipo text not null default 'inicial',
  add column if not exists motivo_eventual text;

alter table public.treinamento_matricula
  drop constraint if exists treinamento_matricula_tipo_chk;
alter table public.treinamento_matricula
  add constraint treinamento_matricula_tipo_chk
  check (tipo in ('inicial', 'periodico', 'eventual'));

-- eventual leva motivo (3 a 200 caracteres úteis); inicial e periódico não levam
alter table public.treinamento_matricula
  drop constraint if exists treinamento_matricula_motivo_eventual_chk;
alter table public.treinamento_matricula
  add constraint treinamento_matricula_motivo_eventual_chk
  check (
    case when tipo = 'eventual'
      then motivo_eventual is not null
        and char_length(btrim(motivo_eventual)) >= 3
        and char_length(motivo_eventual) <= 200
      else motivo_eventual is null
    end
  );

comment on column public.treinamento_matricula.tipo is
  'Tipo do treinamento (NR-1 1.7.1.2): inicial (padrão), periodico ou eventual. Escolhido pelo RH ao matricular; só o servidor muda depois.';
comment on column public.treinamento_matricula.motivo_eventual is
  'Motivo do treinamento eventual (3 a 200 caracteres). Obrigatório quando tipo = eventual; nulo nos outros tipos. Sai no certificado e na consulta pública.';

-- 2. pré-requisito no curso -----------------------------------------------------------------------------------
alter table public.treinamento_curso
  add column if not exists pre_requisito_curso_id uuid
  references public.treinamento_curso(id) on delete set null;

create index if not exists treinamento_curso_pre_requisito_idx
  on public.treinamento_curso(pre_requisito_curso_id)
  where pre_requisito_curso_id is not null;

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_pre_requisito_proprio_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_pre_requisito_proprio_chk
  check (pre_requisito_curso_id is null or pre_requisito_curso_id <> id);

comment on column public.treinamento_curso.pre_requisito_curso_id is
  'Curso que o aluno precisa ter concluído, dentro da validade, para matricular e emitir o certificado deste (ex.: NR-10 Básico para o SEP). Mesma empresa; sem ciclo.';

-- A exige B e B exige A (ou uma volta maior) nunca terminaria. O trigger anda pela cadeia de pré-requisitos do
-- curso escolhido: se ela passa pelo próprio curso, recusa. O limite de 20 degraus também protege contra uma
-- cadeia que já nasceu torta. Roda com os direitos de quem grava; a RLS esconde cursos de outra empresa, e o
-- trigger de referências (abaixo) recusa pré-requisito de outra empresa de qualquer forma.
create or replace function public.pre_requisito_sem_ciclo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.pre_requisito_curso_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.pre_requisito_curso_id is not distinct from old.pre_requisito_curso_id then
    return new;
  end if;
  if new.pre_requisito_curso_id = new.id then
    raise exception 'Um curso não pode ser pré-requisito de si mesmo' using errcode = '23514';
  end if;
  if exists (
    with recursive cadeia(id, pre_id, degrau) as (
      select c.id, c.pre_requisito_curso_id, 1
        from public.treinamento_curso c
       where c.id = new.pre_requisito_curso_id
      union all
      select c.id, c.pre_requisito_curso_id, cadeia.degrau + 1
        from public.treinamento_curso c
        join cadeia on c.id = cadeia.pre_id
       where cadeia.degrau < 20
    )
    select 1 from cadeia where id = new.id
  ) then
    raise exception 'Pré-requisito circular: o curso escolhido já exige este curso (direta ou indiretamente)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.pre_requisito_sem_ciclo() from public, anon, authenticated;

drop trigger if exists pre_requisito_sem_ciclo on public.treinamento_curso;
create trigger pre_requisito_sem_ciclo
  before insert or update of pre_requisito_curso_id on public.treinamento_curso
  for each row execute function public.pre_requisito_sem_ciclo();

-- o curso exigido é da mesma empresa (0118). Nome próprio: referencias_da_empresa_modelo já existe nesta tabela.
drop trigger if exists referencias_da_empresa_pre_requisito on public.treinamento_curso;
create trigger referencias_da_empresa_pre_requisito
  before insert or update of pre_requisito_curso_id, empresa_id on public.treinamento_curso
  for each row execute function public.exigir_referencias_da_empresa(
    'pre_requisito_curso_id:treinamento_curso');

commit;

-- Conferência (só leitura): as colunas existem, quantas matrículas já têm cada tipo (todas 'inicial' na primeira
-- aplicação) e quantos cursos já têm pré-requisito (0 na primeira aplicação; sobe conforme o RH escolhe pela tela).
select (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'treinamento_matricula'
          and column_name in ('tipo', 'motivo_eventual')) as colunas_da_matricula_de_2,
       (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'treinamento_curso'
          and column_name = 'pre_requisito_curso_id') as coluna_do_curso_de_1,
       (select count(*) from public.treinamento_matricula where deleted_at is null and tipo = 'inicial')
         as matriculas_iniciais,
       (select count(*) from public.treinamento_matricula where deleted_at is null and tipo = 'periodico')
         as matriculas_periodicas,
       (select count(*) from public.treinamento_matricula where deleted_at is null and tipo = 'eventual')
         as matriculas_eventuais,
       (select count(*) from public.treinamento_curso
         where deleted_at is null and pre_requisito_curso_id is not null) as cursos_com_pre_requisito;

select 'ok' as res;
