-- 0154 — senha do certificado A1 no Vault; tokens bancários nunca em texto puro
--
-- certificado_empresa.senha_encriptada recebia a senha do .pfx EM TEXTO PURO
-- (CertificadoTab.jsx: "senha vai como TEXTO ... TODO: criptografar"), e a
-- policy tenant_isolation (0048) deixa QUALQUER usuário logado da empresa ler
-- a tabela com select * — junto com o .pfx no Storage, dá para assinar em nome
-- da empresa. integracao_bancaria.token_acesso/refresh_token e
-- conta_financeira.token_acesso são colunas "TODO: Vault" (0010) que o app não
-- grava hoje, mas aceitariam texto puro de qualquer usuário.
--
-- Agora:
--   * a senha vai para o Vault do Supabase (supabase_vault) por trigger: o app
--     continua mandando senha_encriptada no insert, o trigger guarda no Vault,
--     põe o id em senha_secret_id e ZERA a coluna — nada mais legível pela API;
--   * senha_secret_id só é mexido pelo servidor (sem apontar para o segredo de
--     outra empresa nem sobrescrevê-lo);
--   * certificado_senha(id): leitura da senha só pelo servidor (worker SEFAZ);
--   * tokens bancários: só o servidor grava (as Edge Functions, quando a
--     integração existir, com o token cifrado).
--
-- Dados: as senhas que já estão na tabela são movidas para o Vault (seção 5).
-- Não há DROP de nada. Se o Vault não existir no projeto, a migração aborta
-- inteira (roda numa transação) sem alterar nada.

do $$
begin
  -- pelo nome: a assinatura muda entre versões (algumas têm new_key_id)
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'vault' and p.proname = 'create_secret'
  ) then
    raise exception 'Vault indisponível: habilite a extensão supabase_vault antes desta migração';
  end if;
end $$;

-- 1. Coluna com o id do segredo no Vault ----------------------------------
alter table public.certificado_empresa
  add column if not exists senha_secret_id uuid;

comment on column public.certificado_empresa.senha_encriptada is
  'Somente escrita: o trigger certificado_senha_para_vault move a senha para o Vault e zera esta coluna.';
comment on column public.certificado_empresa.senha_secret_id is
  'id do segredo em vault.secrets com a senha do .pfx. Ler só pelo servidor: certificado_senha(id).';

-- 2. Trigger: senha → Vault ------------------------------------------------
create or replace function public.certificado_senha_para_vault()
returns trigger
language plpgsql
security definer -- chamador_eh_servidor() e vault.* não são executáveis por authenticated
set search_path = public
as $$
begin
  -- o id do segredo nunca vem do cliente (senão apontaria/sobrescreveria o
  -- segredo de outra empresa via vault.update_secret)
  if not public.chamador_eh_servidor() then
    if tg_op = 'INSERT' then
      new.senha_secret_id := null;
    else
      new.senha_secret_id := old.senha_secret_id;
    end if;
  end if;

  if coalesce(new.senha_encriptada, '') = '' then
    new.senha_encriptada := null;
    return new;
  end if;

  if new.senha_secret_id is null then
    new.senha_secret_id := vault.create_secret(
      new.senha_encriptada,
      null,
      'Senha do certificado A1 (certificado_empresa ' || new.id || ', empresa ' || new.empresa_id || ')'
    );
  else
    perform vault.update_secret(new.senha_secret_id, new.senha_encriptada);
  end if;

  new.senha_encriptada := null;
  return new;
end;
$$;

revoke all on function public.certificado_senha_para_vault() from public, anon, authenticated;

drop trigger if exists certificado_senha_para_vault on public.certificado_empresa;
create trigger certificado_senha_para_vault
  before insert or update on public.certificado_empresa
  for each row execute function public.certificado_senha_para_vault();

-- apagar o registro (hard delete) apaga o segredo junto
create or replace function public.certificado_senha_apagar_vault()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.senha_secret_id is not null then
    delete from vault.secrets where id = old.senha_secret_id;
  end if;
  return old;
end;
$$;

revoke all on function public.certificado_senha_apagar_vault() from public, anon, authenticated;

drop trigger if exists certificado_senha_apagar_vault on public.certificado_empresa;
create trigger certificado_senha_apagar_vault
  after delete on public.certificado_empresa
  for each row execute function public.certificado_senha_apagar_vault();

-- 3. Leitura da senha: só servidor (futuro worker SEFAZ) -------------------
create or replace function public.certificado_senha(p_certificado_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_secret uuid;
  v_senha text;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado: senha do certificado só no servidor' using errcode = '42501';
  end if;

  select senha_secret_id into v_secret
    from public.certificado_empresa
    where id = p_certificado_id and deleted_at is null;

  if v_secret is null then
    return null;
  end if;

  select decrypted_secret into v_senha from vault.decrypted_secrets where id = v_secret;
  return v_senha;
end;
$$;

revoke all on function public.certificado_senha(uuid) from public, anon, authenticated;
grant execute on function public.certificado_senha(uuid) to service_role;

-- 4. Tokens bancários: só o servidor grava ---------------------------------
create or replace function public.tokens_bancarios_so_servidor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novo jsonb := to_jsonb(new);
  v_velho jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_col text;
begin
  if public.chamador_eh_servidor() then
    return new;
  end if;

  foreach v_col in array array['token_acesso', 'refresh_token'] loop
    if v_novo ? v_col
       and v_novo ->> v_col is not null
       and (v_novo -> v_col) is distinct from (v_velho -> v_col) then
      raise exception 'Acesso negado: token bancário só pode ser gravado pelo servidor'
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.tokens_bancarios_so_servidor() from public, anon, authenticated;

drop trigger if exists tokens_bancarios_so_servidor on public.integracao_bancaria;
create trigger tokens_bancarios_so_servidor
  before insert or update on public.integracao_bancaria
  for each row execute function public.tokens_bancarios_so_servidor();

drop trigger if exists tokens_bancarios_so_servidor on public.conta_financeira;
create trigger tokens_bancarios_so_servidor
  before insert or update of token_acesso on public.conta_financeira
  for each row execute function public.tokens_bancarios_so_servidor();

-- 5. Dados: senhas já gravadas vão para o Vault ------------------------------
-- (o próprio trigger faz a troca; roda como servidor dentro da migração)
update public.certificado_empresa
   set senha_encriptada = senha_encriptada
 where senha_encriptada is not null and senha_encriptada <> '';

notify pgrst, 'reload schema';
