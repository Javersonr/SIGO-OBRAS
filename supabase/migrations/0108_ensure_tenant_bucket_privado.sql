-- ensure_tenant_bucket (0015) é SECURITY DEFINER com dono postgres e estava
-- executável por anon/authenticated via /rest/v1/rpc. Qualquer pessoa (até
-- sem login) podia: recriar as policies de um bucket — desfazendo a trava de
-- comprovantes/<empresa>/recibos/ da 0107 —, criar buckets e, com um nome
-- malicioso, injetar SQL (format com "%s" dentro de aspas duplas).
-- Agora: só migrações/service role executam; nomes com %I; e as policies
-- recriadas já trazem a trava da pasta recibos/ (servidor-only).

create or replace function public.ensure_tenant_bucket(bucket_name text)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if bucket_name !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'nome de bucket inválido: %', bucket_name;
  end if;

  insert into storage.buckets (id, name, public)
  values (bucket_name, bucket_name, false)
  on conflict (id) do nothing;

  execute format('drop policy if exists %I on storage.objects', bucket_name || '_tenant_select');
  execute format('drop policy if exists %I on storage.objects', bucket_name || '_tenant_insert');
  execute format('drop policy if exists %I on storage.objects', bucket_name || '_tenant_update');
  execute format('drop policy if exists %I on storage.objects', bucket_name || '_tenant_delete');
  execute format('drop policy if exists %I on storage.objects', bucket_name || '_super_admin');

  -- <empresa>/recibos/ = PDFs de recibo quitado: só o servidor grava/troca/apaga
  execute format($p$
    create policy %I on storage.objects
      for all to authenticated
      using (bucket_id = %L and public.current_user_is_super_admin()
             and coalesce((storage.foldername(name))[2], '') <> 'recibos')
      with check (bucket_id = %L and public.current_user_is_super_admin()
                  and coalesce((storage.foldername(name))[2], '') <> 'recibos')
  $p$, bucket_name || '_super_admin', bucket_name, bucket_name);

  execute format($p$
    create policy %I on storage.objects
      for select to authenticated
      using (bucket_id = %L
             and (storage.foldername(name))[1] = public.current_empresa_id()::text)
  $p$, bucket_name || '_tenant_select', bucket_name);

  execute format($p$
    create policy %I on storage.objects
      for insert to authenticated
      with check (bucket_id = %L
                  and (storage.foldername(name))[1] = public.current_empresa_id()::text
                  and coalesce((storage.foldername(name))[2], '') <> 'recibos')
  $p$, bucket_name || '_tenant_insert', bucket_name);

  execute format($p$
    create policy %I on storage.objects
      for update to authenticated
      using (bucket_id = %L
             and (storage.foldername(name))[1] = public.current_empresa_id()::text
             and coalesce((storage.foldername(name))[2], '') <> 'recibos')
      with check (bucket_id = %L
                  and (storage.foldername(name))[1] = public.current_empresa_id()::text
                  and coalesce((storage.foldername(name))[2], '') <> 'recibos')
  $p$, bucket_name || '_tenant_update', bucket_name, bucket_name);

  execute format($p$
    create policy %I on storage.objects
      for delete to authenticated
      using (bucket_id = %L
             and (storage.foldername(name))[1] = public.current_empresa_id()::text
             and coalesce((storage.foldername(name))[2], '') <> 'recibos')
  $p$, bucket_name || '_tenant_delete', bucket_name);
end;
$$;

revoke execute on function public.ensure_tenant_bucket(text) from public, anon, authenticated;
grant execute on function public.ensure_tenant_bucket(text) to service_role;

-- Recibo de pagamento é prova: apagar a despesa (DELETE físico) não pode
-- levar o recibo junto em cascata. O app só faz exclusão lógica.
do $$
declare fk text;
begin
  select conname into fk
    from pg_constraint
   where conrelid = 'public.recibo_pagamento'::regclass
     and contype = 'f'
     and confrelid = 'public.transacao_financeira'::regclass;
  if fk is not null then
    execute format('alter table public.recibo_pagamento drop constraint %I', fk);
  end if;
  alter table public.recibo_pagamento
    add constraint recibo_pagamento_transacao_id_fkey
    foreign key (transacao_id) references public.transacao_financeira(id) on delete restrict;
end $$;
