-- ============================================================================
-- 0014 — RLS habilitada + policies por empresa_id
-- ============================================================================
-- Executar APENAS após:
--   1. Seed dos dados ter completado (com client service-role)
--   2. Fluxo de login estar pronto, gerando JWT com claim `empresa_id`
--
-- O JWT precisa conter empresa_id na app_metadata (não user_metadata),
-- porque user_metadata pode ser editado pelo próprio usuário.
-- A Edge Function login-custom será responsável por setar essa claim.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Função helper: extrai empresa_id do JWT (jwt() é função do Supabase Auth)
-- ---------------------------------------------------------------------------
create or replace function public.current_empresa_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'empresa_id')::uuid,
    (auth.jwt() ->> 'empresa_id')::uuid  -- fallback para tokens custom
  );
$$;

create or replace function public.current_user_is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean,
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Macro: aplicar RLS + policy padrão de isolamento por empresa_id
-- ---------------------------------------------------------------------------
create or replace function apply_tenant_rls(tname text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', tname);

  -- Service role bypassa RLS automaticamente (não precisa de policy)
  -- Super admin: acesso total
  execute format(
    'create policy super_admin_all on public.%I
       for all to authenticated
       using (public.current_user_is_super_admin())
       with check (public.current_user_is_super_admin())',
    tname
  );

  -- Tenant: isolamento por empresa_id
  execute format(
    'create policy tenant_isolation on public.%I
       for all to authenticated
       using (empresa_id = public.current_empresa_id())
       with check (empresa_id = public.current_empresa_id())',
    tname
  );
end;
$$;

-- ============================================================================
-- Aplicar em todas as tabelas com empresa_id
-- ============================================================================

-- 0001 — Auth
select apply_tenant_rls('empresa');
select apply_tenant_rls('usuario_custom');
select apply_tenant_rls('usuario_empresa');
select apply_tenant_rls('cliente_portal_usuario');
select apply_tenant_rls('fornecedor_acesso');
select apply_tenant_rls('token_cliente_oportunidade');

-- grupo_empresarial: super_admin only (não tem empresa_id)
alter table public.grupo_empresarial enable row level security;
create policy grupo_super_admin on public.grupo_empresarial
  for all to authenticated
  using (public.current_user_is_super_admin())
  with check (public.current_user_is_super_admin());
create policy grupo_select_membros on public.grupo_empresarial
  for select to authenticated
  using (id in (select grupo_id from public.empresa where id = public.current_empresa_id()));

-- profiles: cada usuário vê o próprio
alter table public.profiles enable row level security;
create policy profile_self on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 0002 — Permissões / Auditoria
select apply_tenant_rls('perfil_permissao');
select apply_tenant_rls('nivel_aprovacao');
select apply_tenant_rls('regra_aprovacao');
select apply_tenant_rls('gestor_aprovacao');
select apply_tenant_rls('aprovacao_solicitacao');
select apply_tenant_rls('audit_log');

-- permissao_detalhada é catálogo global (leitura para todos autenticados)
alter table public.permissao_detalhada enable row level security;
create policy perm_det_read on public.permissao_detalhada
  for select to authenticated using (true);
create policy perm_det_write_super on public.permissao_detalhada
  for all to authenticated
  using (public.current_user_is_super_admin())
  with check (public.current_user_is_super_admin());

-- 0003 — Cadastros / catálogos
select apply_tenant_rls('cliente');
select apply_tenant_rls('fornecedor');
select apply_tenant_rls('etiqueta');
select apply_tenant_rls('caminhao');
select apply_tenant_rls('caminhao_campo_obrigatorio');
select apply_tenant_rls('categoria_material');
select apply_tenant_rls('unidade_medida');
select apply_tenant_rls('categoria_mao_de_obra');
select apply_tenant_rls('centro_custo');

-- 0004 — CRM
select apply_tenant_rls('status_oportunidade');
select apply_tenant_rls('origem_oportunidade');
select apply_tenant_rls('template_oportunidade');
select apply_tenant_rls('oportunidade');
select apply_tenant_rls('oportunidade_atualizacao');
select apply_tenant_rls('arquivo_oportunidade');

-- 0005 — Projetos / Orçamento
select apply_tenant_rls('projeto');
select apply_tenant_rls('tarefa_projeto');
select apply_tenant_rls('cronograma_etapa');
select apply_tenant_rls('diario_obra');
select apply_tenant_rls('orcamento_coluna_config');
select apply_tenant_rls('orcamento_item');
select apply_tenant_rls('mao_de_obra');

-- 0006 — Estoque
select apply_tenant_rls('material');
select apply_tenant_rls('almoxarifado');
select apply_tenant_rls('almoxarifado_local');
select apply_tenant_rls('estoque_movimento');
select apply_tenant_rls('estoque_saldo');
select apply_tenant_rls('retirada_estoque');
select apply_tenant_rls('retirada_estoque_item');
select apply_tenant_rls('reserva_material');
select apply_tenant_rls('kit');
select apply_tenant_rls('kit_item');

-- 0007 — Compras
select apply_tenant_rls('solicitacao_compra');
select apply_tenant_rls('solicitacao_compra_item');
select apply_tenant_rls('cotacao');
select apply_tenant_rls('cotacao_fornecedor');
select apply_tenant_rls('cotacao_item');
select apply_tenant_rls('cotacao_resposta');
select apply_tenant_rls('arquivo_cotacao_fornecedor');
select apply_tenant_rls('pedido_compra');
select apply_tenant_rls('pedido_compra_item');

-- 0008 — Ferramental / Inspeções
select apply_tenant_rls('ferramenta');
select apply_tenant_rls('ferramental');
select apply_tenant_rls('epi');
select apply_tenant_rls('movimentacao_ferramenta');
select apply_tenant_rls('entrega_ferramental');
select apply_tenant_rls('laudo_ferramenta');
select apply_tenant_rls('manutencao_ferramenta');
select apply_tenant_rls('ferramenta_nota');
select apply_tenant_rls('checklist_inspecao_campo');
select apply_tenant_rls('inspecao_campo');
select apply_tenant_rls('inspecao_ferramenta');
select apply_tenant_rls('inspecao_ferramental');
select apply_tenant_rls('inspecao_caminhao');
select apply_tenant_rls('inspecao_historico');
select apply_tenant_rls('inventario_historico');

-- 0009 — RH/SST
select apply_tenant_rls('funcao');
select apply_tenant_rls('treinamento');
select apply_tenant_rls('funcionario');
select apply_tenant_rls('historico_documento_assinado');
select apply_tenant_rls('documento_empresa');
select apply_tenant_rls('vencimento');

-- 0010 — Financeiro core
select apply_tenant_rls('conta_financeira');
select apply_tenant_rls('categoria_financeira');
select apply_tenant_rls('integracao_bancaria');
select apply_tenant_rls('transacao_financeira');
select apply_tenant_rls('transacao_anexo');
select apply_tenant_rls('transacao_transferencia');
select apply_tenant_rls('transacao_recorrente');

-- 0011 — Financeiro extras
select apply_tenant_rls('upload_ofx');
select apply_tenant_rls('extrato_bancario');
select apply_tenant_rls('regra_conciliacao');
select apply_tenant_rls('pre_lancamento');
select apply_tenant_rls('fechamento_caixa');
-- boleto_bancario e nota_fiscal_devolucao têm fluxo SaaS distinto
select apply_tenant_rls('nota_fiscal_devolucao');

-- boleto_bancario: empresa_id pode ser null (boletos SaaS para empresas clientes)
alter table public.boleto_bancario enable row level security;
create policy blt_super_admin on public.boleto_bancario
  for all to authenticated
  using (public.current_user_is_super_admin())
  with check (public.current_user_is_super_admin());
create policy blt_tenant on public.boleto_bancario
  for all to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

-- 0012 — SaaS: catálogo global + dados super_admin
alter table public.plano enable row level security;
create policy plano_read on public.plano for select to authenticated using (true);
create policy plano_super on public.plano
  for all to authenticated
  using (public.current_user_is_super_admin())
  with check (public.current_user_is_super_admin());

alter table public.proposta_comercial enable row level security;
create policy prop_super on public.proposta_comercial
  for all to authenticated
  using (public.current_user_is_super_admin())
  with check (public.current_user_is_super_admin());

select apply_tenant_rls('assinatura');
select apply_tenant_rls('pagamento');

-- 0013 — Notif / Chat / Relatorios
select apply_tenant_rls('notificacao');
select apply_tenant_rls('preferencia_notificacao');
select apply_tenant_rls('canal_chat');
select apply_tenant_rls('mensagem_chat');
select apply_tenant_rls('relatorio_customizado');

-- ============================================================================
-- Conferência manual
-- ============================================================================
-- Para confirmar que todas as tabelas têm RLS habilitada:
--   select tablename from pg_tables where schemaname='public' and rowsecurity=false;
-- Esperado: vazio (exceto possivelmente tabelas auxiliares como spatial_ref_sys)
