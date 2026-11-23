-- ============================================================================
-- 0173 — F-04 (varredura nov/2026, Lote 2): audit_log só recebe linhas novas,
-- e só pelo servidor; ninguém da empresa altera nem apaga
--
-- FURO: audit_log tinha a policy da empresa FOR ALL e todos os privilégios para
-- authenticated: qualquer usuário apagava o próprio rastro
-- (delete ... where usuario_email = '<eu>'), reescrevia linhas de outro ou
-- inseria registros falsos em nome de um colega.
--
-- QUEM USA HOJE (levantado no código):
--   * escrita: só as Edge Functions redefinir-senha-admin (index.ts:226) e
--     enviar-whatsapp (index.ts:90), com service role (INSERT);
--   * leitura: só a página AuditLogs (AuditLogs.jsx:68, AuditLog.filter pela
--     empresa ativa). O front NÃO insere em audit_log (grep de AuditLog e de
--     from("audit_log") em apps/web/src: só a leitura acima).
--
-- AGORA:
--   * authenticated e anon perdem INSERT, UPDATE, DELETE e TRUNCATE (a escrita é
--     do servidor, que usa service_role e não depende destes grants);
--   * a policy da empresa vira só SELECT (mesmo filtro); super_admin_all fica
--     (na prática, só leitura, pelos grants);
--   * trigger audit_log_imutavel: UPDATE, DELETE e TRUNCATE são recusados para
--     TODOS (inclusive service role e super admin), como a trilha do EAD (0135).
--     Expurgo deliberado (retenção, limpeza de teste), numa transação, com chave
--     PRÓPRIA desta tabela (a sigo.permitir_expurgo da 0135/0144/0145 não vale aqui):
--       begin; set local sigo.permitir_expurgo_audit_log = 'on'; delete from public.audit_log where ...; commit;
--
-- FORA deste item (decisão do dono, ver LOTE2-banco.md): quem pode LER a
-- auditoria. Hoje qualquer perfil da empresa abre /AuditLogs pela URL e lê IP e
-- user agent de todos; restringir ao Admin muda a tela para os outros perfis.
--
-- Deploy: independente das outras do lote.
--   supabase db query --linked -f supabase/migrations/0173_audit_log_so_insercao.sql
-- Teste: tools/smoke-lote2-b-audit-log.sql (termina em ROLLBACK).
-- ============================================================================

begin;
-- Se der "canceling statement due to lock timeout" (tabela ocupada), é só rodar de novo.
set local lock_timeout = '10s';

-- 1. grants: só leitura para quem não é servidor ------------------------------
revoke insert, update, delete, truncate on public.audit_log from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated;

-- 2. policy da empresa: só SELECT ---------------------------------------------
drop policy if exists tenant_isolation on public.audit_log;
drop policy if exists tenant_ler on public.audit_log;
create policy tenant_ler on public.audit_log
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

-- 3. imutável até para o servidor, salvo expurgo deliberado --------------------
-- Não é SECURITY DEFINER: não lê nada protegido (modelo: trilha_imutavel, 0135).
create or replace function public.audit_log_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('sigo.permitir_expurgo_audit_log', true), '') = 'on' then
    if tg_op = 'DELETE' then
      return old;
    elsif tg_op = 'TRUNCATE' then
      return null;
    end if;
    return new;
  end if;

  raise exception 'Acesso negado: o registro de auditoria não pode ser %',
    case tg_op when 'UPDATE' then 'alterado' when 'DELETE' then 'apagado' else 'esvaziado' end
    using errcode = '42501',
          hint = 'Expurgo por retenção ou limpeza de teste: ver o cabeçalho da migração 0173.';
end;
$$;

revoke all on function public.audit_log_imutavel() from public, anon, authenticated;

drop trigger if exists audit_log_imutavel on public.audit_log;
create trigger audit_log_imutavel
  before update or delete on public.audit_log
  for each row execute function public.audit_log_imutavel();

-- TRUNCATE não dispara trigger de linha
drop trigger if exists audit_log_imutavel_truncate on public.audit_log;
create trigger audit_log_imutavel_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_imutavel();

notify pgrst, 'reload schema';

commit;
select 'ok' as res;
