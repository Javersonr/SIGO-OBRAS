-- 0135 — EAD (NR-1): trilha de auditoria travada (origem do evento e imutabilidade)
--
-- NR-1 (item 1.6.4 e Anexo II, 4.7.1) exige guardar o registro do treinamento (frequência,
-- avaliações, certificado) por 2 anos depois do fim da validade, e a trilha do portal é a prova de que
-- o aluno fez o curso. Três furos deixavam essa prova apagável ou ambígua:
--   1. "authenticated" ainda tinha DELETE em treinamento_curso, treinamento_aula, treinamento_questao
--      e treinamento_duvida, e as chaves estrangeiras são ON DELETE CASCADE (0097, 0100, 0103): um
--      DELETE pela API apagava curso e, junto, matrículas, progresso, tentativas e certificados.
--      O app só faz exclusão lógica (o SDK grava deleted_at; nenhuma tela usa DELETE físico).
--   2. treinamento_evento e treinamento_tentativa não tinham trava contra UPDATE/DELETE: service role,
--      super admin e quem tivesse acesso ao SQL reescreviam a trilha. O certificado também podia ser
--      apagado (a policy super_admin_all da 0103 é ALL).
--   3. Eventos relatados pelo navegador do aluno (abrir a aula, play, pausa, sair da aba) e eventos que
--      o servidor viu e decidiu (login, aula concluída, prova, certificado) ficavam misturados, sem
--      coluna que os distinga.
--
-- Agora:
--   - revoke de DELETE/TRUNCATE de "authenticated" e de tudo de "anon" nas 4 tabelas acima e em
--     treinamento_certificado (a empresa só lê e revoga certificado; a revogação segue pelo UPDATE da
--     0119, que esta migração não toca);
--   - treinamento_evento.origem ('servidor' | 'navegador', default 'servidor'). A Edge Function
--     portal-funcionario grava 'navegador' na ação "evento" (o navegador relata, o servidor carimba a
--     hora e o IP); a tela de auditoria do RH marca esses eventos. As linhas que já existiam ficam
--     'servidor' pelo default: em 30/09/2026 a trilha só tinha 2 eventos "acesso_criado", gravados
--     pelo servidor, então o rótulo está certo e nenhuma linha precisa de UPDATE;
--   - trigger trilha_imutavel: recusa UPDATE e DELETE em treinamento_evento e treinamento_tentativa, e
--     DELETE em treinamento_certificado (o UPDATE do certificado é a revogação, 0119), sempre, até
--     para service role, super admin e o dono do banco. TRUNCATE das três também. O servidor
--     (portal-funcionario) só faz INSERT nelas (conferido no index.ts; o teste
--     supabase/functions/portal-funcionario/trilha-imutavel.test.ts vigia isso).
--
-- A ÚNICA saída é a variável de sessão sigo.permitir_expurgo = 'on', que só quem tem acesso ao SQL
-- consegue ligar (PostgREST e as Edge Functions não conseguem). Uso: o Javerson, na limpeza de dados
-- de teste e no expurgo por retenção (decisão D11 do handoff, ainda sem política escrita; NADA é
-- apagado automaticamente). Sempre dentro de uma transação, com "set local":
--
--   begin;
--   set local sigo.permitir_expurgo = 'on';
--   delete from public.treinamento_matricula where id = '<id>';  -- a cascata leva tentativa/certificado
--   commit;
--
-- ATENÇÃO — o que passa a exigir esse "set local":
--   - apagar de verdade um funcionário, uma empresa, uma matrícula ou um curso que tenha trilha: a
--     cascata (ON DELETE CASCADE) apaga tentativa e certificado, e a regra ON DELETE SET NULL da
--     matrícula em treinamento_evento faz um UPDATE na linha do evento; os dois disparam o trigger. Sem
--     o "set local" o comando falha inteiro (42501) e nada é apagado;
--   - TRUNCATE (inclusive "truncate ... cascade" de empresa, funcionário ou matrícula).
-- Funcionário, matrícula, curso, aula, questão e dúvida continuam com exclusão lógica (deleted_at)
-- como sempre; só o DELETE físico é que fica restrito.
--
-- Esta migração não faz UPDATE nem DELETE de dados.

begin;

-- 1. Sem DELETE físico no conteúdo do curso, na dúvida e no certificado ---------
-- (anon não precisa de nada aqui: o portal e a validação pública passam pelas Edge Functions)
revoke all on public.treinamento_curso from anon;
revoke all on public.treinamento_aula from anon;
revoke all on public.treinamento_questao from anon;
revoke all on public.treinamento_duvida from anon;
revoke all on public.treinamento_certificado from anon;

revoke delete, truncate on public.treinamento_curso from authenticated;
revoke delete, truncate on public.treinamento_aula from authenticated;
revoke delete, truncate on public.treinamento_questao from authenticated;
revoke delete, truncate on public.treinamento_duvida from authenticated;
revoke delete, truncate on public.treinamento_certificado from authenticated;

-- 2. De onde vem o evento -----------------------------------------------------
-- ADD COLUMN com default constante não reescreve a tabela (nenhum UPDATE de linha)
alter table public.treinamento_evento
  add column if not exists origem text not null default 'servidor';

do $chk$ begin
  alter table public.treinamento_evento
    add constraint treinamento_evento_origem_chk check (origem in ('servidor', 'navegador'));
exception when duplicate_object then null; end $chk$;

comment on column public.treinamento_evento.origem is
  'servidor = o servidor viu e decidiu; navegador = o navegador do aluno relatou (o servidor só carimba hora e IP)';

-- 3. Trilha só de inclusão ----------------------------------------------------
-- Sem exceção para service role nem super admin: só o expurgo deliberado (set local
-- sigo.permitir_expurgo = 'on'). Não é SECURITY DEFINER: não lê nada protegido.
create or replace function public.trilha_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('sigo.permitir_expurgo', true), '') = 'on' then
    if tg_op = 'DELETE' then
      return old;
    elsif tg_op = 'TRUNCATE' then
      return null;
    end if;
    return new;
  end if;

  raise exception 'Acesso negado: o registro de auditoria do treinamento (%) não pode ser %',
    tg_table_name,
    case tg_op when 'UPDATE' then 'alterado' when 'DELETE' then 'apagado' else 'esvaziado' end
    using errcode = '42501',
          hint = 'Limpeza de teste ou expurgo por retenção: ver o cabeçalho da migração 0135.';
end;
$$;

revoke all on function public.trilha_imutavel() from public, anon, authenticated;

-- eventos e tentativas: nem UPDATE nem DELETE
drop trigger if exists trilha_imutavel on public.treinamento_evento;
create trigger trilha_imutavel
  before update or delete on public.treinamento_evento
  for each row execute function public.trilha_imutavel();

drop trigger if exists trilha_imutavel on public.treinamento_tentativa;
create trigger trilha_imutavel
  before update or delete on public.treinamento_tentativa
  for each row execute function public.trilha_imutavel();

-- certificado: o UPDATE é a revogação (0119); aqui só o DELETE
drop trigger if exists trilha_imutavel on public.treinamento_certificado;
create trigger trilha_imutavel
  before delete on public.treinamento_certificado
  for each row execute function public.trilha_imutavel();

-- TRUNCATE não dispara trigger de linha: um por tabela, por comando
drop trigger if exists trilha_imutavel_truncate on public.treinamento_evento;
create trigger trilha_imutavel_truncate
  before truncate on public.treinamento_evento
  for each statement execute function public.trilha_imutavel();

drop trigger if exists trilha_imutavel_truncate on public.treinamento_tentativa;
create trigger trilha_imutavel_truncate
  before truncate on public.treinamento_tentativa
  for each statement execute function public.trilha_imutavel();

drop trigger if exists trilha_imutavel_truncate on public.treinamento_certificado;
create trigger trilha_imutavel_truncate
  before truncate on public.treinamento_certificado
  for each statement execute function public.trilha_imutavel();

commit;
select 'ok' as res;
