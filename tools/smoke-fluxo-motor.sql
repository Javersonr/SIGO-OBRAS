-- ============================================================================
-- smoke-fluxo-motor.sql — valida o motor de fluxos (migration 0052) por RPC.
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria um template
-- descartável numa empresa real, instancia, conclui, aprova e reprova, checando
-- os estados com RAISE NOTICE. Nada é persistido.
--
-- Como rodar (precisa da migration 0052 já aplicada):
--   supabase db execute --file tools/smoke-fluxo-motor.sql
--   -- ou: psql "$DATABASE_URL" -f tools/smoke-fluxo-motor.sql
--
-- Executa como postgres/service_role → current_empresa_id() é null → os guards
-- de empresa são pulados (esperado num teste server-side).
-- ============================================================================

begin;

do $$
declare
  v_empresa uuid;
  v_tpl uuid;
  v_inst uuid;
  v_e_inicio uuid;
  v_e_exec uuid;     -- etapa simples (sem gate)
  v_e_gate uuid;     -- etapa com aprovação
  v_e_fim uuid;
  v_rec uuid := gen_random_uuid();   -- "registro alvo" fake (oportunidade)
  v_status text;
  v_inst_status text;
  r jsonb;
begin
  -- 1. empresa de teste (a primeira que existir)
  select id into v_empresa from public.empresa order by created_at limit 1;
  if v_empresa is null then
    raise exception 'Nenhuma empresa no banco para testar.';
  end if;
  raise notice '== empresa de teste: %', v_empresa;

  -- 2. template descartável + 4 etapas (inicio → exec → gate → fim)
  insert into public.fluxo_template (empresa_id, nome, entidade_alvo, status)
    values (v_empresa, 'SMOKE TEST FLUXO', 'oportunidade', 'ativo')
    returning id into v_tpl;

  insert into public.fluxo_etapa_template
    (empresa_id, fluxo_template_id, ordem, nome, tipo, papel_responsavel, papel_aprovador, exige_aprovacao)
  values
    (v_empresa, v_tpl, 0, 'Início',        'inicio', null,        null,       false),
    (v_empresa, v_tpl, 1, 'Executar algo', 'etapa',  'Analista',  null,       false),
    (v_empresa, v_tpl, 2, 'Aprovar gate',  'etapa',  'Analista',  'Gestor',   true),
    (v_empresa, v_tpl, 3, 'Fim',           'fim',    null,        null,       false);

  -- 3. INSTANCIAR — deve pular 'inicio' e abrir a etapa 1 em "Em Execução"
  v_inst := public.fluxo_instanciar(v_tpl, 'oportunidade', v_rec,
                                    'ana@teste.com', 'Ana Analista');
  select status into v_inst_status from public.fluxo_instancia where id = v_inst;
  raise notice '[instanciar] instancia=% status=%', v_inst, v_inst_status;

  select id, status into v_e_exec, v_status
    from public.fluxo_etapa_instancia
    where fluxo_instancia_id = v_inst and ordem = 1;
  raise notice '[instanciar] etapa1 status=% (esperado: Em Execução)', v_status;
  if v_status <> 'Em Execução' then raise exception 'FALHOU: etapa1 deveria estar Em Execução'; end if;

  select status into v_status from public.fluxo_etapa_instancia
    where fluxo_instancia_id = v_inst and ordem = 0;
  raise notice '[instanciar] etapa0(inicio) status=% (esperado: Concluída)', v_status;
  if v_status <> 'Concluída' then raise exception 'FALHOU: inicio deveria auto-concluir'; end if;

  -- 4. CONCLUIR etapa 1 (sem gate) → conclui e abre a etapa 2 (gate) em execução
  r := public.fluxo_concluir_etapa(v_e_exec, 'ana@teste.com', 'Ana Analista', 'Analista', null);
  raise notice '[concluir etapa1] %', r;

  select id, status into v_e_gate, v_status
    from public.fluxo_etapa_instancia
    where fluxo_instancia_id = v_inst and ordem = 2;
  raise notice '[concluir etapa1] etapa2(gate) status=% (esperado: Em Execução)', v_status;
  if v_status <> 'Em Execução' then raise exception 'FALHOU: etapa2 deveria abrir'; end if;

  -- 5. Executor conclui a etapa 2 (com gate) → vai para "Em Revisão"
  r := public.fluxo_concluir_etapa(v_e_gate, 'ana@teste.com', 'Ana Analista', 'Analista', null);
  raise notice '[concluir etapa2] %', r;
  select status into v_status from public.fluxo_etapa_instancia where id = v_e_gate;
  if v_status <> 'Em Revisão' then raise exception 'FALHOU: etapa2 com gate deveria ir p/ Em Revisão'; end if;

  -- 6. ANTI-AUTO-APROVAÇÃO: a própria Ana não pode aprovar
  begin
    r := public.fluxo_aprovar_etapa(v_e_gate, 'ana@teste.com', 'Ana Analista', 'Gestor', 'ok');
    raise exception 'FALHOU: anti-auto-aprovação não bloqueou';
  exception when others then
    if sqlerrm like '%não pode aprov%' then
      raise notice '[anti-auto] OK bloqueou: %', sqlerrm;
    else
      raise; -- erro inesperado
    end if;
  end;

  -- 7. REPROVAR (Gestor) → volta etapa2 para "Em Execução"
  r := public.fluxo_reprovar_etapa(v_e_gate, 'gestor@teste.com', 'Gil Gestor', 'Gestor',
                                   'Faltou anexar o documento X');
  raise notice '[reprovar etapa2] %', r;
  select status into v_status from public.fluxo_etapa_instancia where id = v_e_gate;
  if v_status <> 'Em Execução' then raise exception 'FALHOU: reprovar deveria voltar p/ Em Execução'; end if;

  -- 8. Re-executa e APROVA (Gestor) → etapa2 Aprovada e fluxo chega ao fim
  r := public.fluxo_concluir_etapa(v_e_gate, 'ana@teste.com', 'Ana Analista', 'Analista', null);
  r := public.fluxo_aprovar_etapa(v_e_gate, 'gestor@teste.com', 'Gil Gestor', 'Gestor', 'Agora sim');
  raise notice '[aprovar etapa2] %', r;

  select status into v_status from public.fluxo_etapa_instancia where id = v_e_gate;
  if v_status <> 'Aprovada' then raise exception 'FALHOU: etapa2 deveria estar Aprovada'; end if;

  select status into v_inst_status from public.fluxo_instancia where id = v_inst;
  raise notice '[fim] instancia status=% (esperado: Concluído)', v_inst_status;
  if v_inst_status <> 'Concluído' then raise exception 'FALHOU: instância deveria estar Concluída'; end if;

  -- 9. trilha de eventos
  raise notice '[eventos] total registrado: %',
    (select count(*) from public.fluxo_etapa_evento where fluxo_instancia_id = v_inst);

  raise notice '==================== SMOKE TEST OK ====================';
end;
$$;

rollback;
