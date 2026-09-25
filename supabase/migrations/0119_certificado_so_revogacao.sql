-- 0119 — certificado EAD emitido: a empresa só REVOGA
--
-- A policy "tenant_revogar" (UPDATE, empresa_id = current_empresa_id()) e o
-- grant de UPDATE em todas as colunas deixavam a empresa reescrever o
-- certificado já emitido (aluno, curso, carga horária, instrutor/RT — até os
-- de outra empresa —, código, hash) ou "desrevogar"; a página pública
-- (validar-certificado) mostra o que estiver gravado.
--
-- Agora, fora do servidor/super admin, o UPDATE só pode revogar uma vez:
-- revogado_em (de vazio para preenchido), revogado_por e motivo_revogacao.

create or replace function public.certificado_so_revogacao()
returns trigger
language plpgsql
security definer -- chamador_eh_servidor() não é executável por authenticated (0110)
set search_path = public
as $$
declare
  livres constant text[] := array['revogado_em', 'revogado_por', 'motivo_revogacao', 'updated_at'];
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return new;
  end if;

  if (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then
    raise exception 'Acesso negado: certificado emitido não pode ser alterado (só revogado)'
      using errcode = '42501';
  end if;

  if old.revogado_em is not null
     and (new.revogado_em, new.revogado_por, new.motivo_revogacao)
         is distinct from (old.revogado_em, old.revogado_por, old.motivo_revogacao) then
    raise exception 'Acesso negado: certificado já revogado' using errcode = '42501';
  end if;

  if new.revogado_em is null and old.revogado_em is null
     and (new.revogado_por, new.motivo_revogacao)
         is distinct from (old.revogado_por, old.motivo_revogacao) then
    raise exception 'Acesso negado: informe a data da revogação' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.certificado_so_revogacao() from public, anon, authenticated;

drop trigger if exists certificado_so_revogacao on public.treinamento_certificado;
create trigger certificado_so_revogacao
  before update on public.treinamento_certificado
  for each row execute function public.certificado_so_revogacao();
