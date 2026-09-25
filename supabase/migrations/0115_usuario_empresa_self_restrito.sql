-- 0115 — usuario_empresa: vínculo com empresa só pelo administrador
--
-- A policy "usuario_empresa_self" (ALL, usuario_email = e-mail do token)
-- deixava QUALQUER usuário logado inserir um vínculo seu com QUALQUER empresa
-- (perfil Admin) ou mudar o empresa_id/perfil do próprio vínculo; o
-- trocar-empresa só confere se o vínculo existe e emitia a sessão na empresa
-- alheia → acesso total aos dados de outra empresa.
--
-- Agora:
--   - o próprio usuário só LÊ os seus vínculos (lista de empresas) e altera o
--     vínculo da empresa ATUAL (Meu Perfil: nome, telefone, endereço, foto);
--   - perfil, permissões, empresa, grupo, ativo etc. só mudam pelo super
--     admin ou pelo servidor (Edge Function / service_role) — trigger abaixo;
--   - criar/apagar vínculo: super admin (policy super_admin_all) ou servidor.

drop policy if exists usuario_empresa_self on public.usuario_empresa;

create policy usuario_empresa_self_select on public.usuario_empresa
  for select to authenticated
  using (lower(usuario_email) = public.current_user_email());

create policy usuario_empresa_self_update on public.usuario_empresa
  for update to authenticated
  using (
    lower(usuario_email) = public.current_user_email()
    and empresa_id = public.current_empresa_id()
  )
  with check (
    lower(usuario_email) = public.current_user_email()
    and empresa_id = public.current_empresa_id()
  );

create or replace function public.usuario_empresa_protege_vinculo()
returns trigger
language plpgsql
security definer -- chamador_eh_servidor() não é executável por authenticated (0110)
set search_path = public
as $$
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return new;
  end if;

  if (new.usuario_email, new.empresa_id, new.grupo_id, new.perfil, new.permissoes,
      new.is_owner, new.ativo, new.deleted_at, new.projeto_id, new.projeto_nome,
      new.senha_hash, new.usuario_id)
     is distinct from
     (old.usuario_email, old.empresa_id, old.grupo_id, old.perfil, old.permissoes,
      old.is_owner, old.ativo, old.deleted_at, old.projeto_id, old.projeto_nome,
      old.senha_hash, old.usuario_id) then
    raise exception 'Acesso negado: perfil, permissões e vínculo só pelo administrador'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.usuario_empresa_protege_vinculo() from public, anon, authenticated;

drop trigger if exists usuario_empresa_protege_vinculo on public.usuario_empresa;
create trigger usuario_empresa_protege_vinculo
  before update on public.usuario_empresa
  for each row execute function public.usuario_empresa_protege_vinculo();
