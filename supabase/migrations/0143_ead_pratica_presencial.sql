-- 0143 — EAD (NR-1 1.7.9.1 e 1.7.1.3; Anexo II 2.5; NR-10): parte prática presencial do curso semipresencial e
-- divisão da carga entre teoria e prática (T12 do handoff do Portal de Treinamento)
--
-- Por quê: não havia prática no produto (nenhuma tabela, campo ou tela). O certificado de um curso que exige prática
-- presencial (NR-10) sairia ao fim da teoria em vídeo, declarando EAD, e a "Lista de Presença" da tela do RH declarava
-- EAD com horário fixo de 10 h por dia e não gravava nada. Agora o RH registra cada sessão prática (data, horário,
-- carga, local e instrutor reais) e, nela, a presença e o resultado de cada matrícula; o servidor só emite o
-- certificado do curso semipresencial para quem esteve "presente" e teve resultado "satisfatório" numa sessão não
-- apagada do mesmo curso, já realizada (portal-funcionario/pratica.ts, 409 PRATICA_PENDENTE).
--
-- O que muda:
--
--   treinamento_curso
--     carga_teorica_horas / carga_pratica_horas  quanto da carga do curso semipresencial é teoria a distância (no
--                     portal) e quanto é prática presencial. Nulas por padrão; quando preenchidas, maiores que zero e
--                     até 1000 h. São colunas SÓ do curso EAD (C3): o trigger validar_modelo_de_treinamento (0131,
--                     reescrito na 0139) copia do cadastro central nome, código, carga TOTAL, validade e conteúdo, e
--                     não toca nestas duas. A carga total continua a do cadastro central (a carga legal das funções);
--                     a divisão é decisão do curso EAD (D1/D9, preenchida pelo Javerson pela tela). A regra fica no
--                     código (requisitos.ts e ead-requisitos.js): no semipresencial, as duas são obrigatórias e somam
--                     a carga total (requisito CARGAS), e o lastro mede o conteúdo contra a carga TEÓRICA.
--
--   treinamento_sessao_pratica (nova)  uma sessão presencial de um curso: data, horário de início e de fim (o fim
--                     depois do início), carga em horas (> 0 e até 24), local (3 a 120 caracteres, cabe na linha do
--                     certificado), instrutor e qualificação, observações e a lista de presença assinada digitalizada
--                     (`lista_presenca_ref`, referência "treinamentos/<empresa>/..." do bucket treinamentos, nunca URL).
--
--   treinamento_pratica_participante (nova)  a presença e o resultado de uma matrícula numa sessão: `presente`,
--                     `resultado` ('pendente', 'satisfatorio' ou 'insatisfatorio'; "satisfatório" exige presença),
--                     observação (até 300 caracteres), `avaliado_por`/`avaliado_em`. Uma linha viva por sessão e
--                     matrícula (índice único parcial).
--
-- Travas do banco (além da RLS por empresa, `apply_tenant_rls`):
--   - anon não tem nada nas duas tabelas; authenticated não tem DELETE nem TRUNCATE (a exclusão é lógica, pelo SDK, e
--     apagar de vez levaria a prova da prática);
--   - avaliado_por (auth.uid()) e avaliado_em (now()) são gravados pelo trigger pratica_avaliacao_pelo_banco quando a
--     presença ou o resultado mudam, e mantidos quando não mudam: o cliente nunca escolhe quem avaliou nem quando;
--   - o trigger pratica_participante_coerente confere que a matrícula e a sessão são da empresa da linha e do MESMO
--     curso, grava o funcionário da matrícula (nunca o que o cliente mandou), não deixa trocar sessão, matrícula ou
--     funcionário depois (remove e inclui de novo) e recusa presença ou resultado numa sessão de data futura
--     (Brasília): o que não aconteceu não é lançado;
--   - referências da mesma empresa (0118) em curso_id, sessao_id, matricula_id e funcionario_id.
--
-- LIMITAÇÃO CONHECIDA (depende da T33): a RLS deixa QUALQUER usuário autenticado da empresa gravar "presente +
-- satisfatório" e, com isso, liberar o certificado (a mesma falha do M2 na matrícula). O banco registra quem fez
-- (avaliado_por/avaliado_em, que o cliente não forja), mas a trava por PERMISSÃO (só quem tem a função de lançar a
-- prática) é da T33 (spec das permissões do EAD), que ainda não foi implementada.
--
-- Idempotente: colunas e tabelas "if not exists"; restrições, índices, policies, triggers e funções são recriados.
-- Sem UPDATE de dados reais: nenhum curso ganha carga teórica ou prática (D1/D9: o Javerson preenche pela tela) e
-- nenhuma modalidade muda.
--
-- Depois de aplicar: publicar portal-funcionario (--no-verify-jwt) e validar-certificado (SEM --no-verify-jwt) e o
-- site. Teste do banco: tools/smoke-ead-pratica.sql (begin ... rollback).

begin;

-- 1. a divisão da carga do curso EAD -----------------------------------------------------------------------------
alter table public.treinamento_curso
  add column if not exists carga_teorica_horas numeric,
  add column if not exists carga_pratica_horas numeric;

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_carga_teorica_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_carga_teorica_chk
  check (carga_teorica_horas is null or (carga_teorica_horas > 0 and carga_teorica_horas <= 1000));

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_carga_pratica_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_carga_pratica_chk
  check (carga_pratica_horas is null or (carga_pratica_horas > 0 and carga_pratica_horas <= 1000));

comment on column public.treinamento_curso.carga_teorica_horas is
  'Semipresencial (T12): horas de teoria a distância no portal. Só do curso EAD (o cadastro central não a sobrescreve). Com a prática, soma a carga total; o lastro do conteúdo usa esta carga.';
comment on column public.treinamento_curso.carga_pratica_horas is
  'Semipresencial (T12): horas de prática presencial. Só do curso EAD (o cadastro central não a sobrescreve). Com a teórica, soma a carga total.';

-- 2. sessão prática ----------------------------------------------------------------------------------------------
create table if not exists public.treinamento_sessao_pratica (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  curso_id uuid not null references public.treinamento_curso(id) on delete cascade,
  data date not null,
  hora_inicio time not null,
  hora_fim time not null,
  carga_horas numeric not null,
  local text not null,
  instrutor_nome text not null,
  instrutor_qualificacao text,
  observacoes text,
  lista_presenca_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists treinamento_sessao_pratica_curso_idx
  on public.treinamento_sessao_pratica(curso_id)
  where deleted_at is null;
create index if not exists treinamento_sessao_pratica_empresa_idx
  on public.treinamento_sessao_pratica(empresa_id);

alter table public.treinamento_sessao_pratica
  drop constraint if exists treinamento_sessao_pratica_horario_chk;
alter table public.treinamento_sessao_pratica
  add constraint treinamento_sessao_pratica_horario_chk
  check (hora_fim > hora_inicio);

alter table public.treinamento_sessao_pratica
  drop constraint if exists treinamento_sessao_pratica_carga_chk;
alter table public.treinamento_sessao_pratica
  add constraint treinamento_sessao_pratica_carga_chk
  check (carga_horas > 0 and carga_horas <= 24);

alter table public.treinamento_sessao_pratica
  drop constraint if exists treinamento_sessao_pratica_textos_chk;
alter table public.treinamento_sessao_pratica
  add constraint treinamento_sessao_pratica_textos_chk
  check (
    char_length(btrim(local)) between 3 and 120
    and char_length(btrim(instrutor_nome)) between 1 and 120
    and (instrutor_qualificacao is null or char_length(instrutor_qualificacao) <= 200)
    and (observacoes is null or char_length(observacoes) <= 1000)
  );

-- a lista assinada é uma referência do bucket treinamentos, na pasta da própria empresa (nunca URL assinada)
alter table public.treinamento_sessao_pratica
  drop constraint if exists treinamento_sessao_pratica_lista_chk;
alter table public.treinamento_sessao_pratica
  add constraint treinamento_sessao_pratica_lista_chk
  check (
    lista_presenca_ref is null
    or lista_presenca_ref like ('treinamentos/' || empresa_id::text || '/%')
  );

comment on table public.treinamento_sessao_pratica is
  'T12: sessão da parte prática presencial de um curso semipresencial (data, horário, carga, local e instrutor reais; lista de presença assinada em lista_presenca_ref). A trava por permissão de quem registra depende da T33.';

-- 3. presença e resultado de cada matrícula na sessão -------------------------------------------------------------
create table if not exists public.treinamento_pratica_participante (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  sessao_id uuid not null references public.treinamento_sessao_pratica(id) on delete cascade,
  matricula_id uuid not null references public.treinamento_matricula(id) on delete cascade,
  funcionario_id uuid not null references public.funcionario(id) on delete cascade,
  presente boolean not null default false,
  resultado text not null default 'pendente',
  avaliado_por uuid,
  avaliado_em timestamptz,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists treinamento_pratica_participante_unico_idx
  on public.treinamento_pratica_participante(sessao_id, matricula_id)
  where deleted_at is null;
create index if not exists treinamento_pratica_participante_matricula_idx
  on public.treinamento_pratica_participante(matricula_id);
create index if not exists treinamento_pratica_participante_empresa_idx
  on public.treinamento_pratica_participante(empresa_id);

alter table public.treinamento_pratica_participante
  drop constraint if exists treinamento_pratica_participante_resultado_chk;
alter table public.treinamento_pratica_participante
  add constraint treinamento_pratica_participante_resultado_chk
  check (resultado in ('pendente', 'satisfatorio', 'insatisfatorio'));

-- "satisfatório" sem presença seria um certificado de prática que não houve
alter table public.treinamento_pratica_participante
  drop constraint if exists treinamento_pratica_participante_satisfatorio_chk;
alter table public.treinamento_pratica_participante
  add constraint treinamento_pratica_participante_satisfatorio_chk
  check (resultado <> 'satisfatorio' or presente);

alter table public.treinamento_pratica_participante
  drop constraint if exists treinamento_pratica_participante_observacao_chk;
alter table public.treinamento_pratica_participante
  add constraint treinamento_pratica_participante_observacao_chk
  check (observacao is null or char_length(observacao) <= 300);

comment on table public.treinamento_pratica_participante is
  'T12: presença e resultado (pendente, satisfatorio, insatisfatorio) de uma matrícula numa sessão prática. O certificado do semipresencial exige presente + satisfatorio numa sessão viva do curso, já realizada. avaliado_por/avaliado_em vêm do trigger. A trava por permissão de quem lança depende da T33.';
comment on column public.treinamento_pratica_participante.avaliado_por is
  'auth.uid() de quem mudou a presença ou o resultado pela última vez (gravado pelo trigger pratica_avaliacao_pelo_banco, nunca pelo cliente).';

-- 4. updated_at ------------------------------------------------------------------------------------------------
select attach_updated_at_trigger('treinamento_sessao_pratica');
select attach_updated_at_trigger('treinamento_pratica_participante');

-- 5. RLS por empresa (0014) e privilégios ----------------------------------------------------------------------
-- apply_tenant_rls cria as policies sem "if not exists": derrubá-las antes deixa a migração reaplicável
drop policy if exists super_admin_all on public.treinamento_sessao_pratica;
drop policy if exists tenant_isolation on public.treinamento_sessao_pratica;
select apply_tenant_rls('treinamento_sessao_pratica');
drop policy if exists super_admin_all on public.treinamento_pratica_participante;
drop policy if exists tenant_isolation on public.treinamento_pratica_participante;
select apply_tenant_rls('treinamento_pratica_participante');

revoke all on public.treinamento_sessao_pratica from anon;
revoke all on public.treinamento_pratica_participante from anon;
-- exclusão só lógica (deleted_at, pelo SDK): DELETE de verdade apagaria a prova da prática
revoke delete, truncate on public.treinamento_sessao_pratica from authenticated;
revoke delete, truncate on public.treinamento_pratica_participante from authenticated;

-- 6. referências da mesma empresa (0118) -----------------------------------------------------------------------
drop trigger if exists referencias_da_empresa on public.treinamento_sessao_pratica;
create trigger referencias_da_empresa
  before insert or update of curso_id, empresa_id on public.treinamento_sessao_pratica
  for each row execute function public.exigir_referencias_da_empresa('curso_id:treinamento_curso');

drop trigger if exists referencias_da_empresa on public.treinamento_pratica_participante;
create trigger referencias_da_empresa
  before insert or update of sessao_id, matricula_id, funcionario_id, empresa_id
  on public.treinamento_pratica_participante
  for each row execute function public.exigir_referencias_da_empresa(
    'sessao_id:treinamento_sessao_pratica',
    'matricula_id:treinamento_matricula',
    'funcionario_id:funcionario'
  );

-- 7. participante coerente: mesma empresa, mesmo curso, funcionário da matrícula, nada lançado no futuro -------
-- Roda com os direitos de quem grava (a RLS já esconde matrícula e sessão de outra empresa; o filtro por empresa_id
-- vale também para o servidor). O nome começa com "pratica_", então dispara antes de referencias_da_empresa
-- (ordem alfabética dos triggers BEFORE): o funcionário conferido lá já é o da matrícula.
create or replace function public.pratica_participante_coerente()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_matricula record;
  v_sessao record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if tg_op = 'UPDATE'
     and (new.sessao_id, new.matricula_id, new.funcionario_id, new.empresa_id)
         is distinct from (old.sessao_id, old.matricula_id, old.funcionario_id, old.empresa_id) then
    raise exception 'Sessão, matrícula e funcionário do participante não mudam: remova e inclua de novo'
      using errcode = '42501';
  end if;

  select s.curso_id, s.data
    into v_sessao
    from public.treinamento_sessao_pratica s
   where s.id = new.sessao_id
     and s.empresa_id = new.empresa_id;
  if not found then
    raise exception 'Acesso negado: sessão prática não encontrada nesta empresa' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    select m.funcionario_id, m.curso_id
      into v_matricula
      from public.treinamento_matricula m
     where m.id = new.matricula_id
       and m.empresa_id = new.empresa_id;
    if not found then
      raise exception 'Acesso negado: matrícula não encontrada nesta empresa' using errcode = '42501';
    end if;
    if v_matricula.curso_id is distinct from v_sessao.curso_id then
      raise exception 'A matrícula é de outro curso: só entra na sessão prática quem está matriculado no curso dela'
        using errcode = '23514';
    end if;
    -- o funcionário é sempre o da matrícula, nunca o que o cliente mandou
    new.funcionario_id := v_matricula.funcionario_id;
  end if;

  -- sessão de data futura (Brasília) ainda não aconteceu: sem presença nem resultado. Excluir (deleted_at) sempre
  -- pode, e a regra só olha quando presença ou resultado mudam.
  if new.deleted_at is null
     and (new.presente or new.resultado <> 'pendente')
     and (tg_op = 'INSERT'
          or (new.presente, new.resultado) is distinct from (old.presente, old.resultado))
     and v_sessao.data > v_hoje then
    raise exception 'A sessão prática é de %: presença e resultado só depois que ela acontecer',
      to_char(v_sessao.data, 'DD/MM/YYYY')
      using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function public.pratica_participante_coerente() from public, anon, authenticated;

drop trigger if exists pratica_participante_coerente on public.treinamento_pratica_participante;
create trigger pratica_participante_coerente
  before insert or update on public.treinamento_pratica_participante
  for each row execute function public.pratica_participante_coerente();

-- 8. quem avaliou e quando: sempre do banco --------------------------------------------------------------------
-- Mudou a presença ou o resultado: grava auth.uid() (null para o servidor/SQL sem JWT) e now(). Não mudou: mantém o
-- que estava, mesmo que o cliente mande outro valor. No INSERT sem presença e pendente, fica vazio.
create or replace function public.pratica_avaliacao_pelo_banco()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.presente or new.resultado <> 'pendente' then
      new.avaliado_por := auth.uid();
      new.avaliado_em := now();
    else
      new.avaliado_por := null;
      new.avaliado_em := null;
    end if;
  elsif (new.presente, new.resultado) is distinct from (old.presente, old.resultado) then
    new.avaliado_por := auth.uid();
    new.avaliado_em := now();
  else
    new.avaliado_por := old.avaliado_por;
    new.avaliado_em := old.avaliado_em;
  end if;
  return new;
end;
$$;
revoke all on function public.pratica_avaliacao_pelo_banco() from public, anon, authenticated;

drop trigger if exists pratica_avaliacao_pelo_banco on public.treinamento_pratica_participante;
create trigger pratica_avaliacao_pelo_banco
  before insert or update on public.treinamento_pratica_participante
  for each row execute function public.pratica_avaliacao_pelo_banco();

commit;

-- Conferência (só leitura): as colunas, as tabelas com RLS, os triggers e o que já existe. Na primeira aplicação:
-- 2 colunas no curso, as duas tabelas com RLS ligada e vazias, 4 triggers próprios (2 por tabela, fora o
-- updated_at) e nenhum curso com carga teórica ou prática (quem preenche é o Javerson, pela tela).
select (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'treinamento_curso'
          and column_name in ('carga_teorica_horas', 'carga_pratica_horas')) as colunas_do_curso_de_2,
       (select count(*) from pg_class
        where relnamespace = 'public'::regnamespace
          and relname in ('treinamento_sessao_pratica', 'treinamento_pratica_participante')
          and relrowsecurity) as tabelas_com_rls_de_2,
       (select count(*) from pg_trigger
        where not tgisinternal
          and tgname in ('pratica_participante_coerente', 'pratica_avaliacao_pelo_banco', 'referencias_da_empresa')
          and tgrelid in ('public.treinamento_sessao_pratica'::regclass,
                          'public.treinamento_pratica_participante'::regclass)) as triggers_de_4,
       (select count(*) from public.treinamento_sessao_pratica) as sessoes,
       (select count(*) from public.treinamento_pratica_participante) as participantes,
       (select count(*) from public.treinamento_curso
         where deleted_at is null
           and (carga_teorica_horas is not null or carga_pratica_horas is not null)) as cursos_com_cargas,
       (select count(*) from public.treinamento_curso
         where deleted_at is null and modalidade = 'semipresencial') as cursos_semipresenciais;

select 'ok' as res;
