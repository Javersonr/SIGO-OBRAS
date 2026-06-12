-- ============================================================================
-- smoke-compras-aprovacao.sql — valida o motor de aprovação de Compras (0028)
-- após a correção dos inserts em notificacao (migration 0054).
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria usuários,
-- 2 níveis de aprovação e 2 solicitações descartáveis numa empresa real,
-- aprova multi-nível e rejeita, checando estados e — o ponto do bug — que os
-- 3 INSERTs em public.notificacao gravam de fato (mensagem/link/tipo='Compra').
-- Nada é persistido.
--
-- Antes da 0054 este teste FALHAVA: os inserts usavam descricao/link_destino e
-- tipo='AprovacaoCompra' (colunas/valor inexistentes → erro em runtime →
-- rollback da aprovação). Depois da 0054 deve imprimir "SMOKE TEST OK".
--
-- Como rodar (precisa da migration 0054 já aplicada):
--   supabase db execute --file tools/smoke-compras-aprovacao.sql
--   -- ou: psql "$DATABASE_URL" -f tools/smoke-compras-aprovacao.sql
--
-- Executa como postgres/service_role → RLS é ignorado (esperado num teste
-- server-side). As funções de Compras não têm guard de empresa.
-- ============================================================================

begin;

do $$
declare
  v_empresa uuid;
  v_solic uuid;                                   -- usuario_empresa do solicitante
  v_solic_email text := 'solic-smoke@teste.com';
  v_gestor_email text := 'gestor-smoke@teste.com';
  v_admin_email text := 'admin-smoke@teste.com';
  v_sc uuid;                                      -- SC do fluxo de aprovação
  v_sc_rej uuid;                                  -- SC do fluxo de rejeição
  v_n1 uuid; v_n2 uuid;                           -- níveis de aprovação
  v_status text;
  v_notifs int;
  r jsonb;
begin
  -- 1. empresa de teste: uma SEM níveis de aprovação reais (encontrar_nivel
  --    usa limit 1 por ordem — um nível real da mesma empresa colidiria com
  --    os níveis semeados pelo smoke e distorceria as asserções)
  select e.id into v_empresa
    from public.empresa e
    where e.deleted_at is null
      and not exists (
        select 1 from public.nivel_aprovacao n
        where n.empresa_id = e.id and n.deleted_at is null
      )
    order by e.created_at
    limit 1;
  if v_empresa is null then
    raise exception 'Nenhuma empresa sem níveis de aprovação para testar.';
  end if;
  raise notice '== empresa de teste: %', v_empresa;

  -- 2. usuários descartáveis: solicitante (Compras), aprovador nível 1 (Gestor),
  --    aprovador nível 2 (Admin). O insert #1 (próximo nível) faz SELECT em
  --    usuario_empresa pelo perfil, então o Admin precisa existir p/ gerar linha.
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, nome_completo)
    values (v_empresa, v_solic_email, 'Compras', true, 'Sol Smoke')
    returning id into v_solic;
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, nome_completo)
    values (v_empresa, v_gestor_email, 'Gestor', true, 'Gil Gestor');
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, nome_completo)
    values (v_empresa, v_admin_email, 'Admin', true, 'Ada Admin');

  -- 3. dois níveis SolicitacaoCompra (faixa aberta): ordem 1 = Gestor, ordem 2 = Admin
  insert into public.nivel_aprovacao (empresa_id, nome, ordem, tipo, perfis_aprovadores)
    values (v_empresa, 'SMOKE Nivel 1', 1, 'SolicitacaoCompra', '["Gestor"]'::jsonb)
    returning id into v_n1;
  insert into public.nivel_aprovacao (empresa_id, nome, ordem, tipo, perfis_aprovadores)
    values (v_empresa, 'SMOKE Nivel 2', 2, 'SolicitacaoCompra', '["Admin"]'::jsonb)
    returning id into v_n2;

  -- 4. solicitação pendente (valor 1000), solicitante = v_solic, nível atual 1
  insert into public.solicitacao_compra
    (empresa_id, numero, status, solicitante_id, solicitante_nome,
     valor_total_estimado, nivel_aprovacao_atual)
    values (v_empresa, 'SC-SMOKE-001', 'Pendente Aprovação', v_solic, 'Sol Smoke',
            1000, 1)
    returning id into v_sc;
  raise notice '== solicitacao de teste: %', v_sc;

  -- 5. APROVA nível 1 (Gestor) → avança p/ nível 2 e NOTIFICA o próximo nível (insert #1)
  r := public.aprovar_solicitacao_compra(v_sc, v_gestor_email, 'Gil Gestor', 'Gestor', 'ok nivel 1');
  raise notice '[aprovar nivel1] %', r;
  if (r->>'aprovada_final')::boolean <> false then
    raise exception 'FALHOU: nivel1 não deveria ser aprovação final';
  end if;
  if (r->>'proximo_nivel')::int <> 2 then
    raise exception 'FALHOU: deveria avançar para o nível 2';
  end if;

  -- A notificação do próximo nível (Admin) foi gravada com as colunas corretas?
  select count(*) into v_notifs from public.notificacao
    where empresa_id = v_empresa
      and usuario_email = v_admin_email
      and tipo = 'Compra'
      and link = '/Compras?solicitacao=' || v_sc::text;
  raise notice '[aprovar nivel1] notificacoes p/ Admin: % (esperado >= 1)', v_notifs;
  if v_notifs < 1 then
    raise exception 'FALHOU: insert #1 (próximo nível) não gravou notificacao';
  end if;

  -- 6. APROVA nível 2 (Admin) → aprovação FINAL e NOTIFICA solicitante (insert #2)
  r := public.aprovar_solicitacao_compra(v_sc, v_admin_email, 'Ada Admin', 'Admin', 'ok final');
  raise notice '[aprovar nivel2] %', r;
  if (r->>'aprovada_final')::boolean <> true then
    raise exception 'FALHOU: nivel2 deveria ser aprovação final';
  end if;

  select status into v_status from public.solicitacao_compra where id = v_sc;
  raise notice '[aprovar nivel2] SC status=% (esperado: Aprovada)', v_status;
  if v_status <> 'Aprovada' then
    raise exception 'FALHOU: SC deveria estar Aprovada (status=%)', v_status;
  end if;

  select count(*) into v_notifs from public.notificacao
    where empresa_id = v_empresa
      and usuario_email = v_solic_email
      and tipo = 'Compra'
      and titulo like '%foi APROVADA%'
      and link = '/Compras?solicitacao=' || v_sc::text;
  raise notice '[aprovar nivel2] notificacoes p/ solicitante: % (esperado >= 1)', v_notifs;
  if v_notifs < 1 then
    raise exception 'FALHOU: insert #2 (aprovação final) não gravou notificacao';
  end if;

  -- 7. ANTI-AUTO-APROVAÇÃO (sanidade): o próprio solicitante não pode aprovar
  insert into public.solicitacao_compra
    (empresa_id, numero, status, solicitante_id, solicitante_nome,
     valor_total_estimado, nivel_aprovacao_atual)
    values (v_empresa, 'SC-SMOKE-002', 'Pendente Aprovação', v_solic, 'Sol Smoke',
            1000, 1)
    returning id into v_sc_rej;
  begin
    r := public.aprovar_solicitacao_compra(v_sc_rej, v_solic_email, 'Sol Smoke', 'Admin', 'auto?');
    raise exception 'FALHOU: anti-auto-aprovação não bloqueou';
  exception when others then
    if sqlerrm like '%não pode aprovar%' then
      raise notice '[anti-auto] OK bloqueou: %', sqlerrm;
    else
      raise; -- erro inesperado
    end if;
  end;

  -- 8. REJEITA (Gestor) → NOTIFICA solicitante (insert #3)
  perform public.rejeitar_solicitacao_compra(
    v_sc_rej, v_gestor_email, 'Gil Gestor', 'Gestor',
    'Documentacao insuficiente para aprovar'
  );
  select status into v_status from public.solicitacao_compra where id = v_sc_rej;
  raise notice '[rejeitar] SC status=% (esperado: Rejeitada)', v_status;
  if v_status <> 'Rejeitada' then
    raise exception 'FALHOU: SC deveria estar Rejeitada (status=%)', v_status;
  end if;

  select count(*) into v_notifs from public.notificacao
    where empresa_id = v_empresa
      and usuario_email = v_solic_email
      and tipo = 'Compra'
      and titulo like '%foi REJEITADA%'
      and link = '/Compras?solicitacao=' || v_sc_rej::text;
  raise notice '[rejeitar] notificacoes p/ solicitante: % (esperado >= 1)', v_notifs;
  if v_notifs < 1 then
    raise exception 'FALHOU: insert #3 (rejeição) não gravou notificacao';
  end if;

  raise notice '============ SMOKE TEST OK (3 inserts em notificacao validados) ============';
end;
$$;

rollback;
