-- Recibo quitado é PROVA a favor do fornecedor: nenhum usuário do app pode
-- alterá-lo. Antes, a policy FOR ALL de 0105 deixava a própria empresa
-- (a parte interessada) mudar status/evidência/dados e o servidor gerava o
-- PDF de "quitação confirmada" com esses dados. Agora só o service role
-- (edge function recibo-fornecedor) grava; o app só lê.

-- 1) recibo_pagamento: leitura por empresa / super admin; escrita só service role
drop policy if exists tenant_isolation on public.recibo_pagamento;
drop policy if exists super_admin_all on public.recibo_pagamento;

create policy recibo_pagamento_select_tenant on public.recibo_pagamento
  for select using (empresa_id = current_empresa_id());
create policy recibo_pagamento_select_super_admin on public.recibo_pagamento
  for select using (current_user_is_super_admin());

revoke insert, update, delete, truncate on public.recibo_pagamento from anon, authenticated;

-- 2) Storage: comprovantes/<empresa>/recibos/ (PDFs quitados) só o servidor
--    grava/troca/apaga. Ler continua igual (policy de SELECT por empresa).
alter policy comprovantes_tenant_insert on storage.objects
  with check (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1] = (current_empresa_id())::text
    and coalesce((storage.foldername(name))[2], '') <> 'recibos'
  );

alter policy comprovantes_tenant_update on storage.objects
  using (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1] = (current_empresa_id())::text
    and coalesce((storage.foldername(name))[2], '') <> 'recibos'
  )
  with check (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1] = (current_empresa_id())::text
    and coalesce((storage.foldername(name))[2], '') <> 'recibos'
  );

alter policy comprovantes_tenant_delete on storage.objects
  using (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1] = (current_empresa_id())::text
    and coalesce((storage.foldername(name))[2], '') <> 'recibos'
  );

alter policy comprovantes_super_admin on storage.objects
  using (
    bucket_id = 'comprovantes'
    and current_user_is_super_admin()
    and coalesce((storage.foldername(name))[2], '') <> 'recibos'
  )
  with check (
    bucket_id = 'comprovantes'
    and current_user_is_super_admin()
    and coalesce((storage.foldername(name))[2], '') <> 'recibos'
  );

-- 3) Um único anexo "recibo quitado" por despesa (duas gerações simultâneas
--    não duplicam; o servidor ignora o 23505). Só para esses PDFs: há
--    duplicatas antigas do Base44 em transacao_anexo que não são tocadas.
create unique index if not exists transacao_anexo_recibo_quitado_uniq
  on public.transacao_anexo (transacao_id, url)
  where deleted_at is null and url like 'comprovantes/%/recibos/recibo-quitado-%';
