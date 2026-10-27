-- 0170 — EAD: atividades interativas no Portal de Treinamento (questionário do módulo, caso com decisões e tarefa
-- de estudo)
--
-- Spec aprovada pelo Javerson em 14/10/2026: docs/superpowers/specs/2026-10-14-ead-atividades-interativas-design.md
-- (decisões A1 a A10; esta migração é o §6; número confirmado pelo Javerson, A10).
--
-- Por quê: uma aula do EAD só podia ser vídeo, PDF ou texto (CHECK da 0103) e a única avaliação era a prova final.
-- O material novo do NR-10 Básico traz, em cada módulo, casos com decisões, questões comentadas (mínimo de 80%) e
-- tarefas de estudo, que não tinham onde entrar: sem elas o conteúdo cadastrado não cobre a carga teórica e o
-- requisito LASTRO impede publicar e matricular. Cada atividade passa a ser uma AULA (A6): mesma lista, mesmo
-- cadeado em ordem e a mesma linha de treinamento_progresso, gravada só pelo servidor (0130).
--
-- O que muda:
--
--   1. treinamento_aula.tipo   aceita também 'questionario', 'caso' e 'tarefa' (CHECK treinamento_aula_tipo_chk
--                     recriado).
--   2. treinamento_aula.codigo_origem   o código da atividade no pacote (ex.: M3-C1, M3-Q, M3-T1, PV-<vídeo>), único
--                     no curso entre as aulas vivas: reimportar o pacote não duplica.
--   3. treinamento_questao.aula_id   vazio = questão da PROVA FINAL (todas as de hoje); preenchido = questão do
--                     questionário daquela aula. O trigger referencias_da_empresa (0118) passa a conferir também a
--                     aula (ele já pula coluna NULL: "continue when valor is null"), e o trigger novo
--                     questao_do_questionario exige que a aula seja do mesmo curso e da mesma empresa, viva, e do
--                     tipo questionário.
--   4. treinamento_curso.nota_minima_modulo   nota mínima dos questionários dos módulos (0 a 100, padrão 80, A2). É
--                     coluna só do curso EAD: o trigger do cadastro central (validar_modelo_de_treinamento, 0139)
--                     não a toca.
--   5. treinamento_caso (nova)   o roteiro do caso de uma aula do tipo caso (`conteudo` jsonb, objeto), um por aula
--                     viva. O roteiro diz qual opção é segura e para onde cada uma leva: só lê quem tem a aba
--                     Treinamentos EAD (policy restritiva, como o gabarito na 0147) e só grava quem tem Editar
--                     (zz_permissao_ead, ramo padrão da 0147: a função não muda). Exclusão só lógica.
--   6. treinamento_questionario_tentativa (nova)   cada envio de um questionário (a prova sorteada, as respostas, a
--                     nota, IP e dispositivo), como treinamento_tentativa. Só o servidor grava (authenticated não tem
--                     INSERT/UPDATE/DELETE) e ninguém altera nem apaga (trilha_imutavel, 0135). O único (matrícula,
--                     aula, número) também serve de índice para (matrícula, aula).
--   7. RPC importar_atividades_ead(p_curso_id, p_atividades)   a importação do pacote, tudo ou nada (A7). Exige a
--                     empresa do curso (exigir_empresa_do_chamador, 0110) e Treinamentos EAD → Editar (42501). Para
--                     cada atividade: confere o formato (22023, com o código de origem na mensagem); pula a que já
--                     existe no curso (mesmo codigo_origem, viva); insere a aula, as questões (questionário) ou o
--                     roteiro (caso). Onde entra: com `depois_da_aula_id`, logo depois daquela aula (do mesmo curso
--                     e viva; o módulo é o dela); sem ele, depois da última aula do módulo, e módulo que o curso não
--                     tem vai para o fim. As aulas seguintes sobem com UM UPDATE de `ordem` por grupo (a mesma aula
--                     de referência, ou o mesmo módulo). Código de origem repetido na própria lista é RECUSADO
--                     (22023): a lista vem da prévia (planejarImportacao), que não repete código; repetido é pacote
--                     malformado, e pular em silêncio perderia conteúdo numa importação tudo ou nada. Os triggers
--                     das tabelas (inclusive zz_permissao_ead, que lê o JWT de quem chamou) valem dentro da RPC.
--
-- Os triggers novos (questao_do_questionario, caso_da_aula) têm nome ANTES de "zz_": o zz_permissao_ead continua o
-- último BEFORE de cada tabela do EAD (0147). Eles não são SECURITY DEFINER (rodam com os direitos de quem grava, como
-- pratica_participante_coerente, 0143) e não chamam função nenhuma: nada de EXECUTE a conceder.
--
-- Idempotente: colunas, tabelas e índices "if not exists"; restrições, triggers e policies derrubados antes de
-- recriados; funções com create or replace; revoke/grant repetíveis. Sem UPDATE, INSERT ou DELETE de dado real: os
-- únicos comandos de escrita do arquivo estão no corpo da RPC, que só roda quando o RH importa.
--
-- Depois de aplicar (ordem do §12 da spec, cada passo com OK do Javerson): tools/smoke-ead-atividades.sql (begin ...
-- rollback); publicar portal-funcionario (--no-verify-jwt); push do site logo depois.

begin;
set local lock_timeout = '10s';

-- 1. tipos de aula ------------------------------------------------------------------------------------------------
alter table public.treinamento_aula
  drop constraint if exists treinamento_aula_tipo_chk;
alter table public.treinamento_aula
  add constraint treinamento_aula_tipo_chk
  check (tipo in ('video', 'pdf', 'texto', 'questionario', 'caso', 'tarefa'));

-- 2. código de origem (reimportar não duplica) ----------------------------------------------------------------------
alter table public.treinamento_aula
  add column if not exists codigo_origem text;

create unique index if not exists treinamento_aula_codigo_origem_uniq
  on public.treinamento_aula(curso_id, codigo_origem)
  where deleted_at is null and codigo_origem is not null;

comment on column public.treinamento_aula.codigo_origem is
  'Código da atividade no pacote importado (M3-C1, M3-Q, M3-T1, PV-<vídeo>). Único no curso entre as aulas vivas: reimportar não duplica. Nulo nas aulas cadastradas pela tela.';

-- 3. questões do questionário -------------------------------------------------------------------------------------
alter table public.treinamento_questao
  add column if not exists aula_id uuid references public.treinamento_aula(id) on delete cascade;

create index if not exists trein_questao_aula_idx
  on public.treinamento_questao(aula_id);

comment on column public.treinamento_questao.aula_id is
  'Vazio = questão da prova final. Preenchido = questão do questionário daquela aula (tipo questionario, mesmo curso).';

drop trigger if exists referencias_da_empresa on public.treinamento_questao;
create trigger referencias_da_empresa
  before insert or update of curso_id, empresa_id, aula_id on public.treinamento_questao
  for each row execute function public.exigir_referencias_da_empresa(
    'curso_id:treinamento_curso',
    'aula_id:treinamento_aula'
  );

-- a aula do questionário é do mesmo curso e da mesma empresa, viva e do tipo questionario
create or replace function public.questao_do_questionario()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tipo text;
begin
  if new.aula_id is null then
    return new; -- questão da prova final
  end if;

  select a.tipo
    into v_tipo
    from public.treinamento_aula a
   where a.id = new.aula_id
     and a.curso_id = new.curso_id
     and a.empresa_id = new.empresa_id
     and (a.deleted_at is null or new.deleted_at is not null);
  if not found then
    raise exception 'A questão do questionário precisa de uma aula viva do mesmo curso'
      using errcode = '23514';
  end if;
  if v_tipo is distinct from 'questionario' then
    raise exception 'A questão só entra numa aula do tipo questionário (esta aula é do tipo %)', v_tipo
      using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function public.questao_do_questionario() from public, anon, authenticated;

drop trigger if exists questao_do_questionario on public.treinamento_questao;
create trigger questao_do_questionario
  before insert or update of aula_id, curso_id on public.treinamento_questao
  for each row execute function public.questao_do_questionario();

-- 4. nota mínima dos questionários dos módulos ----------------------------------------------------------------------
alter table public.treinamento_curso
  add column if not exists nota_minima_modulo integer not null default 80;

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_nota_minima_modulo_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_nota_minima_modulo_chk
  check (nota_minima_modulo between 0 and 100);

comment on column public.treinamento_curso.nota_minima_modulo is
  'Nota mínima (0 a 100) dos questionários dos módulos (A2): o questionário conclui com nota >= esta. Só do curso EAD (o cadastro central não a sobrescreve).';

-- 5. roteiro do caso ----------------------------------------------------------------------------------------------
create table if not exists public.treinamento_caso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  curso_id uuid not null references public.treinamento_curso(id) on delete cascade,
  aula_id uuid not null references public.treinamento_aula(id) on delete cascade,
  conteudo jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.treinamento_caso
  drop constraint if exists treinamento_caso_conteudo_chk;
alter table public.treinamento_caso
  add constraint treinamento_caso_conteudo_chk
  check (jsonb_typeof(conteudo) = 'object');

create unique index if not exists treinamento_caso_aula_uniq
  on public.treinamento_caso(aula_id)
  where deleted_at is null;
create index if not exists treinamento_caso_curso_idx
  on public.treinamento_caso(curso_id);

comment on table public.treinamento_caso is
  'Roteiro do caso com decisões de uma aula do tipo caso (spec 2026-10-14 §4.3): { contexto, etapas[{ id, pergunta, opcoes[{ texto, comentario, segura, proxima }] }], reflexao }. Gabarito: só lê quem tem a aba Treinamentos EAD; só grava quem tem Editar.';

select attach_updated_at_trigger('treinamento_caso');

-- apply_tenant_rls cria as policies sem "if not exists": derrubá-las antes deixa a migração reaplicável
drop policy if exists super_admin_all on public.treinamento_caso;
drop policy if exists tenant_isolation on public.treinamento_caso;
select apply_tenant_rls('treinamento_caso');

-- RESTRITIVA, como o gabarito da prova (0147): o roteiro diz a opção segura de cada etapa
drop policy if exists ead_leitura_com_permissao on public.treinamento_caso;
create policy ead_leitura_com_permissao on public.treinamento_caso
  as restrictive for select to authenticated
  using ((select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD')));

revoke all on public.treinamento_caso from anon;
-- exclusão só lógica (deleted_at, pelo SDK)
revoke delete, truncate on public.treinamento_caso from authenticated;

drop trigger if exists referencias_da_empresa on public.treinamento_caso;
create trigger referencias_da_empresa
  before insert or update of curso_id, aula_id, empresa_id on public.treinamento_caso
  for each row execute function public.exigir_referencias_da_empresa(
    'curso_id:treinamento_curso',
    'aula_id:treinamento_aula'
  );

-- a aula do roteiro é do mesmo curso e da mesma empresa, viva e do tipo caso
create or replace function public.caso_da_aula()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tipo text;
begin
  select a.tipo
    into v_tipo
    from public.treinamento_aula a
   where a.id = new.aula_id
     and a.curso_id = new.curso_id
     and a.empresa_id = new.empresa_id
     and (a.deleted_at is null or new.deleted_at is not null);
  if not found then
    raise exception 'O roteiro do caso precisa de uma aula viva do mesmo curso'
      using errcode = '23514';
  end if;
  if v_tipo is distinct from 'caso' then
    raise exception 'O roteiro só entra numa aula do tipo caso (esta aula é do tipo %)', v_tipo
      using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function public.caso_da_aula() from public, anon, authenticated;

drop trigger if exists caso_da_aula on public.treinamento_caso;
create trigger caso_da_aula
  before insert or update of aula_id, curso_id on public.treinamento_caso
  for each row execute function public.caso_da_aula();

-- Editar (ramo padrão da função da 0147, que NÃO é reescrita aqui); o nome zz_ o mantém como o último BEFORE
drop trigger if exists zz_permissao_ead on public.treinamento_caso;
create trigger zz_permissao_ead
  before insert or update on public.treinamento_caso
  for each row execute function public.zz_permissao_ead();

-- 6. tentativas dos questionários ---------------------------------------------------------------------------------
create table if not exists public.treinamento_questionario_tentativa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  matricula_id uuid not null references public.treinamento_matricula(id) on delete cascade,
  curso_id uuid not null,
  aula_id uuid not null references public.treinamento_aula(id) on delete cascade,
  funcionario_id uuid not null references public.funcionario(id) on delete cascade,
  numero integer not null,
  prova jsonb not null,
  respostas jsonb not null,
  acertos integer not null,
  total integer not null,
  nota numeric not null,
  aprovada boolean not null,
  ip text,
  dispositivo text,
  created_at timestamptz not null default now(),
  unique (matricula_id, aula_id, numero)
);

alter table public.treinamento_questionario_tentativa
  drop constraint if exists treinamento_questionario_tentativa_numero_chk;
alter table public.treinamento_questionario_tentativa
  add constraint treinamento_questionario_tentativa_numero_chk
  check (numero >= 1);

comment on table public.treinamento_questionario_tentativa is
  'Cada envio de um questionário do módulo (spec 2026-10-14 §4.2): a prova sorteada, as respostas, a nota, IP e dispositivo. Só o servidor grava (portal-funcionario); imutável (trilha_imutavel, 0135).';

alter table public.treinamento_questionario_tentativa enable row level security;

drop policy if exists tenant_read on public.treinamento_questionario_tentativa;
create policy tenant_read on public.treinamento_questionario_tentativa for select
  using (empresa_id = public.current_empresa_id());
drop policy if exists super_admin_read on public.treinamento_questionario_tentativa;
create policy super_admin_read on public.treinamento_questionario_tentativa for select
  using (public.current_user_is_super_admin());
drop policy if exists ead_leitura_com_permissao on public.treinamento_questionario_tentativa;
create policy ead_leitura_com_permissao on public.treinamento_questionario_tentativa
  as restrictive for select to authenticated
  using ((select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD')));

revoke all on public.treinamento_questionario_tentativa from anon;
revoke insert, update, delete, truncate on public.treinamento_questionario_tentativa from authenticated;

drop trigger if exists referencias_da_empresa on public.treinamento_questionario_tentativa;
create trigger referencias_da_empresa
  before insert or update of matricula_id, curso_id, aula_id, funcionario_id, empresa_id
  on public.treinamento_questionario_tentativa
  for each row execute function public.exigir_referencias_da_empresa(
    'matricula_id:treinamento_matricula',
    'curso_id:treinamento_curso',
    'aula_id:treinamento_aula',
    'funcionario_id:funcionario'
  );

-- nem UPDATE nem DELETE, nem para o servidor (função da 0135, que não muda)
drop trigger if exists trilha_imutavel on public.treinamento_questionario_tentativa;
create trigger trilha_imutavel
  before update or delete on public.treinamento_questionario_tentativa
  for each row execute function public.trilha_imutavel();

drop trigger if exists trilha_imutavel_truncate on public.treinamento_questionario_tentativa;
create trigger trilha_imutavel_truncate
  before truncate on public.treinamento_questionario_tentativa
  for each statement execute function public.trilha_imutavel();

-- 7. importação do pacote (tudo ou nada) ----------------------------------------------------------------------------
create or replace function public.importar_atividades_ead(p_curso_id uuid, p_atividades jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso record;
  v_item jsonb;
  v_pos integer := 0;
  v_codigo text;
  v_tipo text;
  v_titulo text;
  v_modulo text;
  v_ancora uuid;
  v_duracao numeric;
  v_questao jsonb;
  v_opcoes jsonb;
  v_correta numeric;
  v_vistos text[] := '{}';
  v_novos jsonb := '[]'::jsonb;
  v_grupo record;
  v_novo record;
  v_base integer;
  v_seq integer;
  v_aula_id uuid;
  v_criadas integer := 0;
  v_puladas integer := 0;
  v_questoes integer := 0;
begin
  -- o curso, travado: duas importações do mesmo curso não se cruzam
  select c.id, c.empresa_id
    into v_curso
    from public.treinamento_curso c
   where c.id = p_curso_id
     and c.deleted_at is null
     for update;
  if not found then
    raise exception 'Curso não encontrado' using errcode = 'P0002';
  end if;
  perform public.exigir_empresa_do_chamador(v_curso.empresa_id, 'curso');
  if not public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD', 'editar') then
    raise exception 'Sem permissão: Segurança do Trabalho → Treinamentos EAD → Editar (importar atividades)'
      using errcode = '42501';
  end if;

  if p_atividades is null or jsonb_typeof(p_atividades) <> 'array' then
    raise exception 'A importação precisa de uma lista de atividades' using errcode = '22023';
  end if;
  if jsonb_array_length(p_atividades) > 300 then
    raise exception 'No máximo 300 atividades por importação' using errcode = '22023';
  end if;

  -- 1º passo: confere TUDO antes de gravar qualquer coisa
  for v_item in select e.value from jsonb_array_elements(p_atividades) e loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Atividade nº %: formato inválido', v_pos using errcode = '22023';
    end if;

    v_codigo := case when jsonb_typeof(v_item -> 'codigo_origem') = 'string'
                     then btrim(v_item ->> 'codigo_origem') else '' end;
    if v_codigo = '' or char_length(v_codigo) > 60 then
      raise exception 'Atividade nº %: código de origem ausente ou com mais de 60 caracteres', v_pos
        using errcode = '22023';
    end if;
    if v_codigo = any (v_vistos) then
      raise exception 'Código de origem repetido na lista: %', v_codigo using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_codigo;

    v_tipo := case when jsonb_typeof(v_item -> 'tipo') = 'string' then v_item ->> 'tipo' end;
    if v_tipo is null or v_tipo not in ('questionario', 'caso', 'tarefa') then
      raise exception 'Atividade %: tipo inválido (questionario, caso ou tarefa)', v_codigo
        using errcode = '22023';
    end if;

    v_titulo := case when jsonb_typeof(v_item -> 'titulo') = 'string'
                     then btrim(v_item ->> 'titulo') else '' end;
    if v_titulo = '' or char_length(v_titulo) > 300 then
      raise exception 'Atividade %: título ausente ou com mais de 300 caracteres', v_codigo
        using errcode = '22023';
    end if;

    if v_item ? 'modulo' and jsonb_typeof(v_item -> 'modulo') not in ('string', 'null') then
      raise exception 'Atividade %: módulo inválido', v_codigo using errcode = '22023';
    end if;
    v_modulo := case when jsonb_typeof(v_item -> 'modulo') = 'string'
                     then nullif(btrim(v_item ->> 'modulo'), '') end;

    v_ancora := null;
    if v_item ? 'depois_da_aula_id' and jsonb_typeof(v_item -> 'depois_da_aula_id') <> 'null' then
      -- 36 caracteres no formato do uuid (sem âncora de fim no regex: o tamanho já fecha)
      if jsonb_typeof(v_item -> 'depois_da_aula_id') <> 'string'
         or char_length(v_item ->> 'depois_da_aula_id') <> 36
         or (v_item ->> 'depois_da_aula_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then
        raise exception 'Atividade %: depois_da_aula_id inválido', v_codigo using errcode = '22023';
      end if;
      v_ancora := (v_item ->> 'depois_da_aula_id')::uuid;
    end if;

    if jsonb_typeof(v_item -> 'duracao_seg') is distinct from 'number' then
      raise exception 'Atividade %: tempo previsto (duracao_seg) ausente', v_codigo using errcode = '22023';
    end if;
    v_duracao := (v_item ->> 'duracao_seg')::numeric;
    if v_duracao <> trunc(v_duracao) or v_duracao < 1 or v_duracao > 86400 then
      raise exception 'Atividade %: tempo previsto inválido (de 1 a 86400 segundos, inteiro)', v_codigo
        using errcode = '22023';
    end if;

    if v_tipo = 'tarefa' then
      if jsonb_typeof(v_item -> 'conteudo_texto') is distinct from 'string'
         or btrim(v_item ->> 'conteudo_texto') = '' then
        raise exception 'Atividade %: a tarefa precisa do texto com as instruções', v_codigo
          using errcode = '22023';
      end if;
    elsif v_tipo = 'caso' then
      if jsonb_typeof(v_item -> 'caso') is distinct from 'object'
         or jsonb_typeof(v_item #> '{caso,etapas}') is distinct from 'array' then
        raise exception 'Atividade %: o caso precisa do roteiro (contexto, etapas e reflexão)', v_codigo
          using errcode = '22023';
      end if;
      if jsonb_array_length(v_item #> '{caso,etapas}') = 0 then
        raise exception 'Atividade %: o roteiro do caso precisa de pelo menos uma etapa', v_codigo
          using errcode = '22023';
      end if;
    else
      if jsonb_typeof(v_item -> 'questoes') is distinct from 'array' then
        raise exception 'Atividade %: o questionário precisa da lista de questões', v_codigo
          using errcode = '22023';
      end if;
      if jsonb_array_length(v_item -> 'questoes') not between 1 and 50 then
        raise exception 'Atividade %: o questionário precisa de 1 a 50 questões', v_codigo
          using errcode = '22023';
      end if;
      for v_questao in select q.value from jsonb_array_elements(v_item -> 'questoes') q loop
        if jsonb_typeof(v_questao) is distinct from 'object'
           or jsonb_typeof(v_questao -> 'pergunta') is distinct from 'string'
           or jsonb_typeof(v_questao -> 'opcoes') is distinct from 'array'
           or jsonb_typeof(v_questao -> 'correta') is distinct from 'number' then
          raise exception 'Atividade %: questão fora do formato (pergunta, opcoes e correta)', v_codigo
            using errcode = '22023';
        end if;
        v_opcoes := v_questao -> 'opcoes';
        if btrim(v_questao ->> 'pergunta') = ''
           or jsonb_array_length(v_opcoes) not between 2 and 6
           or exists (
             select 1 from jsonb_array_elements(v_opcoes) o
              where jsonb_typeof(o.value) is distinct from 'string' or btrim(o.value #>> '{}') = ''
           ) then
          raise exception 'Atividade %: cada questão precisa da pergunta e de 2 a 6 alternativas preenchidas', v_codigo
            using errcode = '22023';
        end if;
        v_correta := (v_questao ->> 'correta')::numeric;
        if v_correta <> trunc(v_correta) or v_correta < 0 or v_correta >= jsonb_array_length(v_opcoes) then
          raise exception 'Atividade %: a alternativa correta tem de ser uma das alternativas', v_codigo
            using errcode = '22023';
        end if;
        if v_questao ? 'comentario' and jsonb_typeof(v_questao -> 'comentario') not in ('string', 'null') then
          raise exception 'Atividade %: comentário da questão inválido', v_codigo using errcode = '22023';
        end if;
      end loop;
    end if;

    -- já importada (mesmo código no curso, viva): pula, sem conferir a aula de referência
    if exists (
      select 1 from public.treinamento_aula a
       where a.curso_id = v_curso.id
         and a.codigo_origem = v_codigo
         and a.deleted_at is null
    ) then
      v_puladas := v_puladas + 1;
      continue;
    end if;

    -- com aula de referência: do mesmo curso e viva; o módulo é o dela (o do item é ignorado)
    if v_ancora is not null then
      select a.modulo
        into v_modulo
        from public.treinamento_aula a
       where a.id = v_ancora
         and a.curso_id = v_curso.id
         and a.deleted_at is null;
      if not found then
        raise exception 'Atividade %: a aula de referência (depois_da_aula_id) não é deste curso ou foi apagada', v_codigo
          using errcode = '22023';
      end if;
    end if;

    v_novos := v_novos || jsonb_build_array(jsonb_build_object(
      'pos', v_pos,
      'ancora', v_ancora,
      'modulo', v_modulo,
      'codigo', v_codigo,
      'tipo', v_tipo,
      'titulo', v_titulo,
      'duracao', v_duracao::integer,
      'item', v_item
    ));
  end loop;

  -- 2º passo: grava por grupo (a mesma aula de referência, ou o mesmo módulo), na ordem em que o grupo aparece
  for v_grupo in
    select n.ancora,
           (case when n.ancora is null then n.modulo end) as chave_modulo,
           max(n.modulo) as modulo,
           count(*)::integer as qtd
      from jsonb_to_recordset(v_novos) as n(pos integer, ancora uuid, modulo text)
     group by n.ancora, (case when n.ancora is null then n.modulo end)
     order by min(n.pos)
  loop
    if v_grupo.ancora is not null then
      -- logo depois da aula de referência (a ordem dela já conta o que os grupos anteriores abriram)
      select a.ordem into v_base from public.treinamento_aula a where a.id = v_grupo.ancora;
    else
      -- depois da última aula do módulo; módulo que o curso não tem vai para o fim do curso
      select max(a.ordem)
        into v_base
        from public.treinamento_aula a
       where a.curso_id = v_curso.id
         and a.deleted_at is null
         and a.modulo is not distinct from v_grupo.chave_modulo;
      if v_base is null then
        select coalesce(max(a.ordem), 0)
          into v_base
          from public.treinamento_aula a
         where a.curso_id = v_curso.id
           and a.deleted_at is null;
      end if;
    end if;

    -- abre espaço: as aulas depois do ponto de entrada sobem de uma vez (UM UPDATE por grupo)
    update public.treinamento_aula a
       set ordem = a.ordem + v_grupo.qtd
     where a.curso_id = v_curso.id
       and a.deleted_at is null
       and a.ordem > v_base;

    v_seq := 0;
    for v_novo in
      select n.codigo, n.tipo, n.titulo, n.duracao, n.item
        from jsonb_to_recordset(v_novos)
             as n(pos integer, ancora uuid, modulo text, codigo text, tipo text, titulo text, duracao integer,
                  item jsonb)
       where n.ancora is not distinct from v_grupo.ancora
         and (v_grupo.ancora is not null or n.modulo is not distinct from v_grupo.chave_modulo)
       order by n.pos
    loop
      v_seq := v_seq + 1;
      insert into public.treinamento_aula
        (empresa_id, curso_id, ordem, modulo, titulo, tipo, duracao_seg, conteudo_texto, codigo_origem)
      values
        (v_curso.empresa_id, v_curso.id, v_base + v_seq, v_grupo.modulo, v_novo.titulo, v_novo.tipo,
         v_novo.duracao,
         case when v_novo.tipo = 'tarefa' then btrim(v_novo.item ->> 'conteudo_texto') end,
         v_novo.codigo)
      returning id into v_aula_id;
      v_criadas := v_criadas + 1;

      if v_novo.tipo = 'questionario' then
        insert into public.treinamento_questao
          (empresa_id, curso_id, aula_id, ordem, pergunta, opcoes, correta, comentario)
        select v_curso.empresa_id,
               v_curso.id,
               v_aula_id,
               q.ordem::integer,
               btrim(q.value ->> 'pergunta'),
               (select jsonb_agg(to_jsonb(btrim(o.value #>> '{}')) order by o.ordem)
                  from jsonb_array_elements(q.value -> 'opcoes') with ordinality as o(value, ordem)),
               (q.value ->> 'correta')::numeric::integer,
               nullif(btrim(coalesce(q.value ->> 'comentario', '')), '')
          from jsonb_array_elements(v_novo.item -> 'questoes') with ordinality as q(value, ordem);
        v_questoes := v_questoes + jsonb_array_length(v_novo.item -> 'questoes');
      elsif v_novo.tipo = 'caso' then
        insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo)
        values (v_curso.empresa_id, v_curso.id, v_aula_id, v_novo.item -> 'caso');
      end if;
    end loop;
  end loop;

  return jsonb_build_object('criadas', v_criadas, 'puladas', v_puladas, 'questoes', v_questoes);
end;
$$;
revoke all on function public.importar_atividades_ead(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.importar_atividades_ead(uuid, jsonb) to authenticated, service_role;

comment on function public.importar_atividades_ead(uuid, jsonb) is
  'Importa as atividades do pacote no curso (spec 2026-10-14 §5.1/§6), tudo ou nada: empresa do curso + Treinamentos EAD → Editar; pula codigo_origem já existente; depois_da_aula_id (opcional) põe o item logo depois daquela aula; sem ele, depois da última aula do módulo (módulo novo no fim). Devolve { criadas, puladas, questoes }.';

commit;

-- Conferência (só leitura). Na primeira aplicação: colunas_de_3 = 3, tabelas_com_rls_de_2 = 2, triggers_zz_de_9 = 9
-- (8 da 0147 + treinamento_caso), tabelas_com_trigger_depois_do_zz = 0 (o zz_permissao_ead é o último BEFORE em todas
-- as tabelas do EAD), rpc_executavel_pela_api = true, rpc_fechada_ao_anon = true, aulas_com_tipo_novo = 0,
-- roteiros = 0, tentativas = 0, questoes_de_questionario = 0 e cursos_fora_de_80 = 0 (nenhum dado muda).
select (select count(*) from information_schema.columns
         where table_schema = 'public'
           and ((table_name = 'treinamento_aula' and column_name = 'codigo_origem')
             or (table_name = 'treinamento_questao' and column_name = 'aula_id')
             or (table_name = 'treinamento_curso' and column_name = 'nota_minima_modulo'))) as colunas_de_3,
       (select count(*) from pg_class
         where relnamespace = 'public'::regnamespace
           and relname in ('treinamento_caso', 'treinamento_questionario_tentativa')
           and relrowsecurity) as tabelas_com_rls_de_2,
       (select count(*) from pg_trigger where not tgisinternal and tgname = 'zz_permissao_ead') as triggers_zz_de_9,
       (select count(*) from (
          select t.tgrelid, max(t.tgname::text collate "C") as ultimo
            from pg_trigger t
           where not t.tgisinternal
             and (t.tgtype & 3) = 3 -- BEFORE e FOR EACH ROW
             and t.tgrelid in (select z.tgrelid from pg_trigger z where z.tgname = 'zz_permissao_ead')
           group by t.tgrelid
        ) u where u.ultimo <> 'zz_permissao_ead') as tabelas_com_trigger_depois_do_zz,
       has_function_privilege('authenticated', 'public.importar_atividades_ead(uuid, jsonb)', 'execute')
         as rpc_executavel_pela_api,
       not has_function_privilege('anon', 'public.importar_atividades_ead(uuid, jsonb)', 'execute')
         as rpc_fechada_ao_anon,
       (select count(*) from public.treinamento_aula
         where tipo in ('questionario', 'caso', 'tarefa')) as aulas_com_tipo_novo,
       (select count(*) from public.treinamento_caso) as roteiros,
       (select count(*) from public.treinamento_questionario_tentativa) as tentativas,
       (select count(*) from public.treinamento_questao where aula_id is not null) as questoes_de_questionario,
       (select count(*) from public.treinamento_curso where nota_minima_modulo <> 80) as cursos_fora_de_80;

select 'ok' as res;
