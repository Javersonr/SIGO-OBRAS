-- 0144 — EAD (NR-1, Anexo II 4.3 e 4.4): texto da declaração de ambiente e horário, em versões (T35 do handoff do
-- Portal de Treinamento)
--
-- Por quê: o Anexo II da NR-1 exige, no ensino a distância, um ambiente que favoreça a concentração (4.3) e um período
-- exclusivo, sem trabalho simultâneo (4.4). O portal não pedia nada disso ao aluno. Agora, na 1ª abertura de um curso em
-- cada dia, o aluno lê a orientação do responsável técnico (RT) e confirma três itens (local adequado, horário
-- reservado, sem outra atividade). Quem grava a confirmação é o SERVIDOR (ação declarar_ambiente da Edge Function
-- portal-funcionario), como evento `declaracao_ambiente` da trilha (treinamento_evento, origem 'servidor', 0135), com o
-- texto inteiro, a versão e a ART que o aluno viu. Esta migração guarda o TEXTO e a ART; o evento já cabe na trilha.
--
-- Decisão do Javerson (06/10/2026): o texto é editável pelo RT, com a versão gravada no evento, e há um campo para o RT
-- preencher a ART (número ou referência), que aparece junto do texto para o aluno. Até o RT salvar uma versão vale um
-- texto padrão neutro (versão 0, no código), que a tela do RH mostra como "pendente de aprovação do RT".
--
-- O que muda:
--
--   treinamento_declaracao_texto (nova)  uma linha por VERSÃO do texto de cada empresa: `versao` (1, 2, 3...),
--                     `texto` (20 a 4000 caracteres), `art` (opcional, até 120), `salvo_por` (auth.uid()) e
--                     `salvo_por_email` (e-mail do JWT) de quem salvou e `created_at`. Só de INCLUSÃO: corrigir o texto é
--                     salvar uma versão nova (a antiga continua lá, porque os eventos dos alunos citam a versão).
--
-- Travas do banco (além da RLS por empresa, `apply_tenant_rls`):
--   - o trigger declaracao_texto_pelo_banco decide o que o cliente não escolhe: `versao` (a maior da empresa + 1, com
--     trava de transação para dois salvamentos ao mesmo tempo não repetirem o número), `salvo_por`, `salvo_por_email`
--     e `created_at`; apara o texto e a ART (ART vazia vira nula);
--   - o trigger trilha_imutavel (0135) recusa UPDATE, DELETE e TRUNCATE, até para o service role e o super admin (só o
--     expurgo deliberado, `set local sigo.permitir_expurgo = 'on'`, como na trilha); `authenticated` nem tem o
--     privilégio de UPDATE, DELETE ou TRUNCATE; `anon` não tem nada;
--   - a tabela não tem `deleted_at`: não existe "apagar" versão.
--
-- LIMITAÇÃO CONHECIDA (depende da T33): a RLS deixa QUALQUER usuário autenticado da empresa salvar uma versão nova do
-- texto (a mesma situação das demais tabelas do EAD hoje). O banco registra quem salvou (`salvo_por`,
-- `salvo_por_email`, que o cliente não forja), mas a trava por PERMISSÃO (só quem é RT ou tem a função de editar o
-- texto) é da T33 (spec das permissões do EAD), ainda não implementada.
--
-- DEPENDÊNCIA: a função public.trilha_imutavel() da 0135 (a migração para com uma mensagem clara se ela não existir).
-- Esta migração NÃO altera treinamento_evento: o evento novo usa as colunas que já existem.
--
-- Idempotente: tabela e colunas "if not exists"; restrições, índices, policies, triggers e função são recriados.
-- Sem UPDATE de dados reais e sem criar nenhuma versão: nenhum texto é aprovado por aqui (o RT salva pela tela).
--
-- Depois de aplicar: publicar portal-funcionario (--no-verify-jwt) e o site. Teste do banco:
-- tools/smoke-ead-declaracao.sql (begin ... rollback).

begin;

-- 0. a trava de imutabilidade da trilha (0135) tem de existir ---------------------------------------------------------
do $dep$
begin
  if to_regprocedure('public.trilha_imutavel()') is null then
    raise exception 'Falta a migração 0135 (função public.trilha_imutavel): aplique as migrações do EAD em ordem.';
  end if;
end;
$dep$;

-- 1. as versões do texto --------------------------------------------------------------------------------------------
create table if not exists public.treinamento_declaracao_texto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  versao integer not null,
  texto text not null,
  art text,
  salvo_por uuid,
  salvo_por_email text,
  created_at timestamptz not null default now()
);

create unique index if not exists treinamento_declaracao_texto_versao_idx
  on public.treinamento_declaracao_texto(empresa_id, versao);

alter table public.treinamento_declaracao_texto
  drop constraint if exists treinamento_declaracao_texto_versao_chk;
alter table public.treinamento_declaracao_texto
  add constraint treinamento_declaracao_texto_versao_chk
  check (versao >= 1);

-- os mesmos limites da tela do RT e do servidor (TEXTO_MIN/TEXTO_MAX/ART_MAX); o trigger apara antes de conferir
alter table public.treinamento_declaracao_texto
  drop constraint if exists treinamento_declaracao_texto_texto_chk;
alter table public.treinamento_declaracao_texto
  add constraint treinamento_declaracao_texto_texto_chk
  check (char_length(texto) between 20 and 4000);

alter table public.treinamento_declaracao_texto
  drop constraint if exists treinamento_declaracao_texto_art_chk;
alter table public.treinamento_declaracao_texto
  add constraint treinamento_declaracao_texto_art_chk
  check (art is null or char_length(art) between 1 and 120);

comment on table public.treinamento_declaracao_texto is
  'T35: versões do texto da declaração de ambiente e horário que o aluno confirma ao abrir o curso (NR-1, Anexo II, 4.3 e 4.4). Só inclusão: corrigir é salvar versão nova. O evento declaracao_ambiente da trilha guarda a versão e o texto que cada aluno viu. A trava por permissão depende da T33.';
comment on column public.treinamento_declaracao_texto.versao is
  'Número da versão (1, 2, 3...), gravado pelo trigger declaracao_texto_pelo_banco: a maior da empresa + 1. O cliente não escolhe.';
comment on column public.treinamento_declaracao_texto.art is
  'ART (número ou referência) do responsável técnico, que aparece junto do texto para o aluno. Opcional.';
comment on column public.treinamento_declaracao_texto.salvo_por is
  'auth.uid() de quem salvou a versão (gravado pelo trigger, nunca pelo cliente).';

-- 2. RLS por empresa (0014) e privilégios ----------------------------------------------------------------------------
-- apply_tenant_rls cria as policies sem "if not exists": derrubá-las antes deixa a migração reaplicável
drop policy if exists super_admin_all on public.treinamento_declaracao_texto;
drop policy if exists tenant_isolation on public.treinamento_declaracao_texto;
select apply_tenant_rls('treinamento_declaracao_texto');

revoke all on public.treinamento_declaracao_texto from anon;
-- a versão não se corrige nem se apaga: só se inclui outra
revoke update, delete, truncate on public.treinamento_declaracao_texto from authenticated;

-- 3. o que o cliente não escolhe: versão, quem salvou e quando -------------------------------------------------------
create or replace function public.declaracao_texto_pelo_banco()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.texto := btrim(new.texto);
  new.art := nullif(btrim(coalesce(new.art, '')), '');
  -- dois salvamentos ao mesmo tempo na mesma empresa: um de cada vez, para não repetirem o número da versão
  perform pg_advisory_xact_lock(
    hashtextextended('treinamento_declaracao_texto:' || new.empresa_id::text, 0)
  );
  select coalesce(max(t.versao), 0) + 1
    into new.versao
    from public.treinamento_declaracao_texto t
   where t.empresa_id = new.empresa_id;
  new.salvo_por := auth.uid();
  new.salvo_por_email := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.declaracao_texto_pelo_banco() from public, anon, authenticated;

drop trigger if exists declaracao_texto_pelo_banco on public.treinamento_declaracao_texto;
create trigger declaracao_texto_pelo_banco
  before insert on public.treinamento_declaracao_texto
  for each row execute function public.declaracao_texto_pelo_banco();

-- 4. só inclusão: nem UPDATE nem DELETE nem TRUNCATE (a mesma trava da trilha, 0135) -----------------------------
drop trigger if exists trilha_imutavel on public.treinamento_declaracao_texto;
create trigger trilha_imutavel
  before update or delete on public.treinamento_declaracao_texto
  for each row execute function public.trilha_imutavel();

drop trigger if exists trilha_imutavel_truncate on public.treinamento_declaracao_texto;
create trigger trilha_imutavel_truncate
  before truncate on public.treinamento_declaracao_texto
  for each statement execute function public.trilha_imutavel();

commit;

-- Conferência (só leitura): na primeira aplicação a tabela existe com RLS ligada, tem os 3 triggers próprios (a versão
-- pelo banco e as duas travas de imutabilidade) e está vazia: o texto padrão vale até o RT salvar o dele.
select (select count(*) from pg_class
        where relnamespace = 'public'::regnamespace
          and relname = 'treinamento_declaracao_texto'
          and relrowsecurity) as tabela_com_rls_de_1,
       (select count(*) from pg_trigger
        where not tgisinternal
          and tgrelid = 'public.treinamento_declaracao_texto'::regclass
          and tgname in ('declaracao_texto_pelo_banco', 'trilha_imutavel', 'trilha_imutavel_truncate'))
         as triggers_de_3,
       (select count(*) from public.treinamento_declaracao_texto) as versoes_salvas;

select 'ok' as res;
