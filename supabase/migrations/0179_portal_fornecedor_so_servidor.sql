-- ============================================================================
-- 0179 — Lote 2b-2 (F-08, varredura nov/2026): senha do Portal do Fornecedor só
-- pelo servidor; links das cotações só para quem trabalha em Compras
--
-- *** SÓ APLICAR DEPOIS DO FRONT NOVO PUBLICADO *** (e da Edge Function
-- fornecedor-acesso no ar). O front antigo lê e grava fornecedor_acesso direto
-- (lib/senha-portal.js, CotacaoModal.jsx, LinksModal.jsx): com esta migração e
-- o front antigo, enviar cotação e o Painel de Status quebram.
-- Ordem: deploy da função → publicar o front → conferir → aplicar esta.
--
-- FURO: fornecedor_acesso (senha_acesso = hash da senha do portal) e
-- cotacao_fornecedor (token = única credencial do link da cotação) tinham só a
-- policy da empresa FOR ALL. Qualquer perfil da empresa podia gravar em
-- fornecedor_acesso o hash de uma senha que conhece e entrar no portal "como o
-- fornecedor", sem rastro, ou ler o token de um concorrente e responder a
-- cotação por ele.
--
-- QUEM USA (levantado no código, depois do front novo):
--   * fornecedor_acesso: só Edge Functions com service role —
--     fornecedor-acesso (lê e grava a senha nova, com auditoria),
--     portal-fornecedor-login (lê e regrava SHA-256 como bcrypt) e
--     portal-fornecedor-cotacoes (confere se o acesso segue ativo). Nenhuma tela
--     (grep de FornecedorAcesso e de fornecedor_acesso em apps/web/src: vazio);
--   * cotacao_fornecedor: telas CotacaoModal, LinksModal, ComparacaoPrecos,
--     HistoricoTab, ConfirmacaoExclusaoModal e pages/Compras.jsx (excluir
--     cotação/solicitação, gerar pedido) — todas dentro da página Compras, e
--     cada ação atrás de uma permissão de Compras (abas Solicitações, Cotações,
--     Pedidos, Histórico) ou do Admin; o trigger referencias_da_empresa (0118,
--     invoker) lê a tabela ao gravar cotacao_resposta, o que só a
--     ComparacaoPrecos faz. O portal do fornecedor usa service role.
--
-- AGORA:
--   * fornecedor_acesso: sai a policy da empresa; super_admin_all fica (na
--     prática, só leitura, pelos grants); anon perde tudo; authenticated perde
--     INSERT/UPDATE/DELETE/TRUNCATE (o mesmo da 0174). O servidor segue lendo e
--     gravando;
--   * cotacao_fornecedor: policies RESTRITIVAS (somadas à da empresa): ler,
--     criar e alterar (inclusive a exclusão lógica) exigem alguma permissão de Compras
--     (tem_permissao('Compras'): Admin, dono e super admin passam) ou ser
--     administrador (usuario_eh_administrador(): Admin, Admin Holding, super
--     admin). DELETE físico sai de authenticated (o SDK só faz exclusão lógica).
--     Sem revoke por coluna do token: quebraria o select * do SDK.
--
-- AINDA (revisão do 2b-2, C3): tem_permissao passa a tratar vínculo com `ativo`
-- NULO como ativo. Só ela divergia: a tela (Layout.jsx, temPermissao) e
-- current_user_perfil() (0061: coalesce(ue.ativo, true) = true) e
-- usuario_eh_administrador() (0176/0178) já tratam nulo como ativo. Sem isto,
-- um usuário de Compras com `ativo` nulo via a aba Cotações e, depois desta
-- migração, não lia nem gravava cotacao_fornecedor. O corpo é o da 0147
-- (137-208) copiado do arquivo, com UMA linha trocada: `ue.ativo = true` →
-- `coalesce(ue.ativo, true) = true`. `ativo = false` continua barrado. A 0147
-- é a última definição dela (grep em supabase/migrations). O efeito vale para
-- todas as policies/funções que a usam: EAD (0147, 0170), acervo (0159),
-- habilitação (0160) e documentos gerados (0161) — ver LOTE2-banco.md.
--
-- FORA: quem tem Compras (qualquer aba) continua lendo o token pela API; fechar
-- isso exige listar colunas nas leituras do SDK (lote de permissão por perfil).
--
-- Deploy (Javerson, depois do front publicado e conferido):
--   supabase db query --linked -f supabase/migrations/0179_portal_fornecedor_so_servidor.sql
-- Teste: tools/smoke-lote2-k-portal-fornecedor.sql (termina em ROLLBACK).
-- Desfazer: ver LOTE2-banco.md, seção "Lote 2b-2".
-- ============================================================================

begin;
-- Se der "canceling statement due to lock timeout" (tabela ocupada), é só rodar de novo.
set local lock_timeout = '10s';

-- 0. tem_permissao: ativo nulo = ativo (corpo da 0147, uma linha trocada) -------
create or replace function public.tem_permissao(
  p_modulo text,
  p_aba text default null,
  p_funcao text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_perfil text;
  v_dono boolean;
  v_bruto jsonb;
  v_modulo jsonb;
  v_aba jsonb;
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return true;
  end if;
  if auth.uid() is null or coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    return false;
  end if;

  select ue.perfil, ue.is_owner, ue.permissoes
    into v_perfil, v_dono, v_bruto
    from public.usuario_empresa ue
   where lower(ue.usuario_email) = public.current_user_email()
     and ue.empresa_id = public.current_empresa_id()
     and coalesce(ue.ativo, true) = true  -- 0179: ativo nulo conta como ativo (era ue.ativo = true)
     and ue.deleted_at is null
   order by ue.created_at asc
   limit 1;
  if not found then
    return false;
  end if;
  if v_perfil = 'Admin' or v_dono is true then
    return true;
  end if;

  v_modulo := public.permissoes_como_objeto(v_bruto) -> p_modulo;
  if v_modulo is null or jsonb_typeof(v_modulo) <> 'object' then
    return false;
  end if;

  if p_aba is null and p_funcao is null then
    return exists (
      select 1
        from jsonb_each(v_modulo) a
       where jsonb_typeof(a.value) = 'object'
         and exists (select 1 from jsonb_each(a.value) f where f.value = 'true'::jsonb)
    );
  end if;

  v_aba := case when p_aba is null then null else v_modulo -> p_aba end;
  if p_funcao is null then
    if jsonb_typeof(v_aba) = 'boolean' then
      return v_aba = 'true'::jsonb;
    end if;
    if jsonb_typeof(v_aba) = 'object' then
      return exists (select 1 from jsonb_each(v_aba) f where f.value = 'true'::jsonb);
    end if;
    return false;
  end if;

  if v_aba is null or jsonb_typeof(v_aba) <> 'object' then
    return false;
  end if;
  return coalesce((v_aba -> p_funcao) = 'true'::jsonb, false);
end;
$$;
revoke all on function public.tem_permissao(text, text, text) from public, anon, authenticated;
grant execute on function public.tem_permissao(text, text, text) to authenticated, service_role;

comment on function public.tem_permissao(text, text, text) is
  'T33: o chamador tem a permissão (módulo, aba, função) do editor de permissões? Espelho do temPermissaoServidor (acesso.ts). Servidor, super admin, Admin e dono passam; vínculo ativo (ativo nulo conta como ativo desde a 0179, como na tela e em current_user_perfil) do e-mail e da empresa do token.';


-- 1. fornecedor_acesso: só o servidor -----------------------------------------
drop policy if exists tenant_isolation on public.fornecedor_acesso;

revoke all on public.fornecedor_acesso from anon;
revoke insert, update, delete, truncate on public.fornecedor_acesso from authenticated;

-- 2. cotacao_fornecedor: só quem trabalha em Compras ---------------------------
drop policy if exists cotacao_fornecedor_ler_com_compras on public.cotacao_fornecedor;
create policy cotacao_fornecedor_ler_com_compras on public.cotacao_fornecedor
  as restrictive for select to authenticated
  using ((select public.tem_permissao('Compras')) or (select public.usuario_eh_administrador()));

drop policy if exists cotacao_fornecedor_criar_com_compras on public.cotacao_fornecedor;
create policy cotacao_fornecedor_criar_com_compras on public.cotacao_fornecedor
  as restrictive for insert to authenticated
  with check ((select public.tem_permissao('Compras')) or (select public.usuario_eh_administrador()));

drop policy if exists cotacao_fornecedor_alterar_com_compras on public.cotacao_fornecedor;
create policy cotacao_fornecedor_alterar_com_compras on public.cotacao_fornecedor
  as restrictive for update to authenticated
  using ((select public.tem_permissao('Compras')) or (select public.usuario_eh_administrador()))
  with check ((select public.tem_permissao('Compras')) or (select public.usuario_eh_administrador()));

-- apagar: só exclusão lógica (UPDATE de deleted_at, coberta acima); DELETE físico sai
revoke delete, truncate on public.cotacao_fornecedor from authenticated;

notify pgrst, 'reload schema';

commit;
select 'ok' as res;
