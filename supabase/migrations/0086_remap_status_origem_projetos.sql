-- ============================================================================
-- 0086_remap_status_origem_projetos.sql
--
-- Correção defensiva para ambientes onde a 0085 anterior possa ter copiado
-- status/origens de Projetos com os mesmos UUIDs de Oportunidades.
--
-- Resultado: Projetos fica com status_id/origem_id apontando para registros
-- exclusivos de status_projeto/origem_projeto, com UUIDs diferentes.
-- ============================================================================

do $$
declare
  r record;
  v_new_id uuid;
begin
  for r in
    select sp.*, so.id as old_id
    from public.status_projeto sp
    join public.status_oportunidade so on so.id = sp.id
    where exists (
      select 1
      from public.projeto p
      where p.status_id = sp.id
        and p.deleted_at is null
    )
  loop
    v_new_id := gen_random_uuid();

    insert into public.status_projeto (
      id, empresa_id, nome, cor, ordem, tipo,
      created_at, updated_at, deleted_at, created_by
    ) values (
      v_new_id, r.empresa_id, r.nome, r.cor, r.ordem, r.tipo,
      r.created_at, now(), r.deleted_at, r.created_by
    );

    update public.projeto
       set status_id = v_new_id,
           updated_at = now()
     where status_id = r.old_id
       and deleted_at is null;
  end loop;
end $$;

do $$
declare
  r record;
  v_new_id uuid;
begin
  for r in
    select op.*, oo.id as old_id
    from public.origem_projeto op
    join public.origem_oportunidade oo on oo.id = op.id
    where exists (
      select 1
      from public.projeto p
      where p.origem_id = op.id
        and p.deleted_at is null
    )
  loop
    v_new_id := gen_random_uuid();

    insert into public.origem_projeto (
      id, empresa_id, nome,
      created_at, updated_at, deleted_at, created_by
    ) values (
      v_new_id, r.empresa_id, r.nome,
      r.created_at, now(), r.deleted_at, r.created_by
    );

    update public.projeto
       set origem_id = v_new_id,
           updated_at = now()
     where origem_id = r.old_id
       and deleted_at is null;
  end loop;
end $$;

notify pgrst, 'reload schema';

