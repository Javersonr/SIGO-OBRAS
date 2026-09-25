-- 0120 — cadastro de empresa: só a atual e as dos MEUS vínculos
--
-- A policy "empresa_mesmo_grupo" (papel public) mostrava a qualquer usuário o
-- cadastro (CNPJ, IE/IM, endereço, e-mail, telefone, observações...) de todas
-- as empresas do mesmo grupo — ex.: um frentista de um posto via os 12 postos
-- da rede. Decisão do usuário (25/09/2026): empresas do mesmo grupo NÃO veem
-- o cadastro umas das outras.
--
-- Fica: a empresa da sessão (empresa_tenant) e as empresas em que o próprio
-- usuário tem vínculo ativo (lista "Minhas Empresas", troca de empresa,
-- transferência de oportunidade) — acesso que o administrador concedeu. A
-- troca de empresa sempre exigiu vínculo (trocar-empresa), então listar
-- empresa do grupo sem vínculo não servia para nada além de expor o cadastro.

drop policy if exists empresa_mesmo_grupo on public.empresa;

drop policy if exists empresa_dos_meus_vinculos on public.empresa;
create policy empresa_dos_meus_vinculos on public.empresa
  for select to authenticated
  using (
    id in (
      select ue.empresa_id
        from public.usuario_empresa ue
       where lower(ue.usuario_email) = public.current_user_email()
         and coalesce(ue.ativo, true)
         and ue.deleted_at is null
    )
  );

-- Só a policy removida usava esta função (SECURITY DEFINER, executável por
-- anon desde a 0110 por causa dela).
revoke all on function public.grupo_da_empresa_atual() from public, anon, authenticated;
