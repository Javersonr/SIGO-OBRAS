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
