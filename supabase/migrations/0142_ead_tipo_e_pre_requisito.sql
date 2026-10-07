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
--     tipo            'inicial' (padrão) | 'periodico' | 'eventual'. O padrão vale para quem inserir sem dizer. As
--                     matrículas que JÁ existem não ficam todas 'inicial': na PRIMEIRA aplicação (a coluna ainda
--                     não existe) elas recebem o tipo pela regra do "Automático" da tela de matrícula, ou seja,
--                     'periodico' para a que tem outra matrícula concluída e anterior do mesmo funcionário no
--                     mesmo curso (uma renovação) e 'inicial' para as demais (ver o passo 1 e o porquê abaixo).
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
-- Por que as matrículas antigas não ficam todas 'inicial': o botão Renovar existe desde a T20, então já há
-- renovações abertas ou concluídas sem certificado. Se todas virassem 'inicial', o aluno que emitisse o certificado
-- depois do deploy teria "Tipo de treinamento: Inicial" congelado no hash, no PDF e na consulta pública de uma
-- RECICLAGEM, e o mesmo "Inicial" iria para a tabela, o CSV e a planilha do dossiê. Nada depois corrigiria isso: a
-- 0130 impede o RH de mudar o tipo e o certificado emitido fica selado. Por isso o preenchimento acontece UMA vez,
-- aqui. O que a regra não consegue saber: um treinamento feito fora do portal (presencial) não aparece nas matrículas,
-- então a primeira matrícula de quem já fez o curso por fora fica 'inicial'. A regra também depende do dado: "anterior"
-- é a ordem de created_at, então duas matrículas importadas com o MESMO created_at (carga do legado) não contam uma
-- para a outra; e, se o índice único treinamento_matricula_viva_uidx (0139) não pôde ser criado em produção (havia
-- matrícula aberta repetida), uma matrícula repetida aberta antes de a outra concluir também vira 'periodico'. Olhe a
-- conferência no fim com isso em mente.
--
-- Idempotente: a coluna tipo só é criada, e as matrículas antigas só são preenchidas, se a coluna ainda não existe
-- (guarda em information_schema), então rodar de novo NÃO volta a mexer no tipo, nem desfaz a escolha do RH; as demais
-- colunas são "add column if not exists"; as restrições e os triggers são recriados; a função é "create or replace".
-- O único UPDATE de dados é esse preenchimento (só a coluna tipo, só na primeira aplicação). Roda sem JWT (por
-- exemplo com db query --linked), então chamador_eh_servidor() vale true e o trigger da 0130 deixa passar; as linhas
-- alteradas ganham updated_at novo (trigger set_updated_at). Nenhum curso ganha pré-requisito sozinho (o RH escolhe o
-- pré-requisito pela tela do curso). Se uma versão anterior desta migração (sem o preenchimento) já tiver sido aplicada,
-- a coluna já existe e o preenchimento não roda: avise o Javerson antes de aplicar de novo.
--
-- Depois de aplicar: publicar portal-funcionario e validar-certificado (esta SEM --no-verify-jwt) e o site. A ORDEM
-- importa: o portal-funcionario novo lê as colunas tipo e motivo_eventual; publicado antes desta migração, o portal
-- inteiro falha. Em RH & Segurança → Treinamentos → curso, o RH escolhe o pré-requisito (por exemplo, no NR-10
-- Complementar SEP, o NR-10 Básico).

begin;

-- 1. tipo e motivo na matrícula -------------------------------------------------------------------------------
-- tipo: cria a coluna e, SÓ nesta primeira vez, dá o tipo às matrículas que já existem (regra do "Automático" de
-- lib/ead-tipo-matricula.js: periódico para quem já CONCLUIU o curso antes, inicial para quem nunca concluiu).
-- "Concluída e anterior": outra matrícula viva do mesmo funcionário, no mesmo curso e da mesma empresa, com status
-- 'concluido' e criada antes. O plpgsql só planeja o UPDATE depois do ALTER TABLE, por isso a coluna já existe nele.
do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'treinamento_matricula'
       and column_name = 'tipo'
  ) then
    alter table public.treinamento_matricula
      add column tipo text not null default 'inicial';

    update public.treinamento_matricula m
       set tipo = 'periodico'
     where m.deleted_at is null
       and exists (
         select 1
           from public.treinamento_matricula a
          where a.empresa_id = m.empresa_id
            and a.funcionario_id = m.funcionario_id
            and a.curso_id = m.curso_id
            and a.id <> m.id
            and a.status = 'concluido'
            and a.deleted_at is null
            and a.created_at < m.created_at
       );
  end if;
end
$$;

alter table public.treinamento_matricula
  add column if not exists motivo_eventual text;

alter table public.treinamento_matricula
  drop constraint if exists treinamento_matricula_tipo_chk;
alter table public.treinamento_matricula
  add constraint treinamento_matricula_tipo_chk
  check (tipo in ('inicial', 'periodico', 'eventual'));

-- eventual leva motivo (3 a 200 caracteres úteis); inicial e periódico não levam. "Úteis" = sem espaço, tab, CR, LF, FF
-- e VT nas pontas (\x0b é o VT), nos DOIS limites: é o mesmo aparar e a mesma contagem do servidor e da consulta
-- pública (tipo-treinamento.ts e validar-certificado/regras.ts). Com o btrim simples (só espaço) e o limite sobre o
-- texto cru, um motivo gravado pela API podia passar aqui e sair do certificado sem o tipo (A6).
alter table public.treinamento_matricula
  drop constraint if exists treinamento_matricula_motivo_eventual_chk;
alter table public.treinamento_matricula
  add constraint treinamento_matricula_motivo_eventual_chk
  check (
    case when tipo = 'eventual'
      then motivo_eventual is not null
        and char_length(btrim(motivo_eventual, E' \t\r\n\f\x0b')) >= 3
        and char_length(btrim(motivo_eventual, E' \t\r\n\f\x0b')) <= 200
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

-- Conferência (só leitura): as colunas existem, quantas matrículas vivas têm cada tipo (na primeira aplicação, as
-- periódicas são as renovações que já existiam e as iniciais, o resto; nenhuma eventual), quantas matrículas
-- 'inicial' ainda têm uma concluída anterior e quantos cursos já têm pré-requisito (0 na primeira aplicação; sobe
-- conforme o RH escolhe pela tela). iniciais_com_concluida_anterior é 0 logo após a primeira aplicação. DEPOIS, um
-- número maior que zero NÃO quer dizer que o RH escolheu "Inicial" de propósito: pode ser uma matrícula criada por uma
-- aba antiga do SIGO (aberta desde antes do deploy), que não manda o tipo, ou uma gravação direta pela API sem o tipo,
-- e a coluna assume 'inicial'. Por isso, rode esta conferência DEPOIS de publicar o site e de os RHs recarregarem as
-- abas; se o número passar de zero, o Javerson decide se roda o mesmo UPDATE só para as linhas criadas depois da
-- migração (um certificado emitido fica selado com o tipo, e o RH não muda o tipo depois).
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
       (select count(*)
          from public.treinamento_matricula m
         where m.deleted_at is null
           and m.tipo = 'inicial'
           and exists (
             select 1
               from public.treinamento_matricula a
              where a.empresa_id = m.empresa_id
                and a.funcionario_id = m.funcionario_id
                and a.curso_id = m.curso_id
                and a.id <> m.id
                and a.status = 'concluido'
                and a.deleted_at is null
                and a.created_at < m.created_at
           )) as iniciais_com_concluida_anterior,
       (select count(*) from public.treinamento_curso
         where deleted_at is null and pre_requisito_curso_id is not null) as cursos_com_pre_requisito;

select 'ok' as res;
