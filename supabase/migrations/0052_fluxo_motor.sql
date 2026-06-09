-- ============================================================================
-- 0052_fluxo_motor.sql — MOTOR DE FLUXOS (Fase A): núcleo executa → aprova
--
-- Lê os templates da Fase 1 (fluxo_template / fluxo_etapa_template — 0051) e dá
-- a eles EXECUÇÃO: instanciar um fluxo num registro (oportunidade/projeto),
-- concluir etapas, aprovar/reprovar (gate) e avançar sozinho até o fim.
--
-- Espelha o motor de Compras (0028 aprovar_solicitacao_compra): lock pessimista,
-- anti-auto-aprovação, validação por papel, notificação, histórico.
--
-- NÃO tem UI nem cron — é validável 100% por RPC. As telas (Minhas Pendências,
-- régua na Oportunidade) são fases seguintes.
--
-- Aditivo e não-destrutivo: cria 3 tabelas novas + funções. Nada existente é
-- tocado (Compras/oportunidade/notificacao seguem iguais). Decisão da spec §11.1
-- resolvida a favor de uma tabela de eventos DEDICADA (fluxo_etapa_evento), em
-- vez de mexer em aprovacao_solicitacao — isolamento total do módulo de Compras.
--
-- Segurança (spec §10): funções de entrada SECURITY DEFINER com guard de empresa
-- via current_empresa_id(); grant execute só p/ authenticated; helpers internos
-- revogados do public.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. fluxo_instancia — uma execução viva do template num registro
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.fluxo_instancia (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  fluxo_template_id uuid not null references public.fluxo_template(id),
  template_nome text,                               -- snapshot p/ histórico estável
  entidade_alvo text not null default 'oportunidade',
  registro_id uuid not null,                        -- id da oportunidade/projeto
  etapa_atual_id uuid,                              -- aponta p/ a etapa em aberto
  status text not null default 'Em Andamento'
    check (status in ('Em Andamento', 'Concluído', 'Cancelado')),
  created_by_email text,
  created_by_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index fluxo_inst_empresa_idx on public.fluxo_instancia(empresa_id);
create index fluxo_inst_registro_idx on public.fluxo_instancia(entidade_alvo, registro_id);
create index fluxo_inst_template_idx on public.fluxo_instancia(fluxo_template_id);
select attach_updated_at_trigger('fluxo_instancia');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. fluxo_etapa_instancia — a régua de etapas viva (cópia do template)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.fluxo_etapa_instancia (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  fluxo_instancia_id uuid not null references public.fluxo_instancia(id) on delete cascade,
  etapa_template_id uuid,                           -- origem (auditoria)
  ordem integer not null default 0,
  nome text not null,                               -- snapshot
  tipo text not null default 'etapa',              -- inicio|etapa|decisao|fim
  papel_responsavel text,
  papel_aprovador text,
  exige_aprovacao boolean not null default false,
  checklist jsonb default '[]'::jsonb,             -- snapshot dos itens
  opcoes jsonb default '[]'::jsonb,                -- snapshot das saídas da decisão
  proxima_etapa_ordem integer,                      -- linear (quando não-decisão)
  status text not null default 'A Fazer'
    check (status in (
      'A Fazer', 'Em Execução', 'Em Revisão',
      'Aprovada', 'Reprovada', 'Concluída', 'Pulada'
    )),
  executor_email text,
  executor_nome text,
  data_execucao timestamptz,
  aprovador_email text,
  aprovador_nome text,
  data_decisao timestamptz,
  comentario text,                                  -- motivo (obrigatório na reprovação)
  checklist_estado jsonb default '[]'::jsonb,      -- itens marcados ☑
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index fluxo_etapa_inst_instancia_idx
  on public.fluxo_etapa_instancia(fluxo_instancia_id, ordem);
create index fluxo_etapa_inst_empresa_idx on public.fluxo_etapa_instancia(empresa_id);
create index fluxo_etapa_inst_status_idx
  on public.fluxo_etapa_instancia(empresa_id, status);
select attach_updated_at_trigger('fluxo_etapa_instancia');

-- ────────────────────────────────────────────────────────────────────────────
-- 3. fluxo_etapa_evento — trilha de auditoria append-only (quem fez o quê)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.fluxo_etapa_evento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  fluxo_instancia_id uuid not null references public.fluxo_instancia(id) on delete cascade,
  fluxo_etapa_instancia_id uuid references public.fluxo_etapa_instancia(id) on delete cascade,
  evento text not null,                             -- Instanciou|Concluiu|Aprovou|Reprovou
  ator_email text,
  ator_nome text,
  ator_perfil text,
  comentario text,
  opcao_escolhida text,
  created_at timestamptz not null default now()
);
create index fluxo_evento_instancia_idx on public.fluxo_etapa_evento(fluxo_instancia_id);
create index fluxo_evento_empresa_idx on public.fluxo_etapa_evento(empresa_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS multi-tenant (mesma política tenant_isolation do resto do sistema)
-- ────────────────────────────────────────────────────────────────────────────
select apply_tenant_rls('fluxo_instancia');
select apply_tenant_rls('fluxo_etapa_instancia');
select apply_tenant_rls('fluxo_etapa_evento');

-- ════════════════════════════════════════════════════════════════════════════
-- HELPERS INTERNOS (não expostos via RPC — revogados do public no fim)
-- ════════════════════════════════════════════════════════════════════════════

-- 5. Notifica todos os usuários de um PAPEL (perfil) na empresa -----------------
create or replace function public.fluxo_notificar_papel(
  p_empresa_id uuid,
  p_papel text,
  p_titulo text,
  p_descricao text,
  p_link text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_papel is null or length(trim(p_papel)) = 0 then
    return;  -- etapa sem papel definido = ninguém específico a notificar
  end if;

  insert into public.notificacao (
    empresa_id, tipo, titulo, descricao, usuario_email, lida, link_destino
  )
  select p_empresa_id, 'Fluxo', p_titulo, p_descricao, ue.usuario_email, false, p_link
    from public.usuario_empresa ue
    where ue.empresa_id = p_empresa_id
      and ue.ativo = true
      and ue.deleted_at is null
      and (ue.perfil = p_papel or ue.perfil = 'Admin');
end;
$$;

-- 6. Resolve o id da PRÓXIMA etapa de uma instância ----------------------------
-- p_destino_ordem:
--   null  → roteamento linear (proxima_etapa_ordem da etapa, ou próxima por ordem)
--   < 0   → 'fim' (sem próxima) → retorna null
--   >= 0  → etapa com aquela ordem (decisão com destino explícito)
create or replace function public.fluxo_proxima_etapa_id(
  p_instancia_id uuid,
  p_etapa_atual_id uuid,
  p_destino_ordem integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.fluxo_etapa_instancia%rowtype;
  v_next_id uuid;
begin
  if p_destino_ordem is not null then
    if p_destino_ordem < 0 then
      return null;  -- 'fim'
    end if;
    select id into v_next_id
      from public.fluxo_etapa_instancia
      where fluxo_instancia_id = p_instancia_id
        and ordem = p_destino_ordem
        and deleted_at is null
      order by ordem
      limit 1;
    return v_next_id;
  end if;

  select * into v_atual
    from public.fluxo_etapa_instancia
    where id = p_etapa_atual_id;

  if v_atual.proxima_etapa_ordem is not null then
    select id into v_next_id
      from public.fluxo_etapa_instancia
      where fluxo_instancia_id = p_instancia_id
        and ordem = v_atual.proxima_etapa_ordem
        and deleted_at is null
      order by ordem
      limit 1;
    return v_next_id;
  end if;

  -- linear: a menor ordem estritamente maior que a atual
  select id into v_next_id
    from public.fluxo_etapa_instancia
    where fluxo_instancia_id = p_instancia_id
      and ordem > v_atual.ordem
      and deleted_at is null
    order by ordem
    limit 1;
  return v_next_id;
end;
$$;

-- 7. Abre o fluxo A PARTIR de uma etapa (pulando marcadores inicio/fim) ---------
-- Coloca a etapa em "Em Execução" e notifica o responsável. Se a etapa for
-- 'inicio' (marcador), conclui e avança automaticamente; se for 'fim' (ou não
-- houver próxima), encerra a instância.
create or replace function public.fluxo_abrir_a_partir(
  p_instancia_id uuid,
  p_etapa_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa public.fluxo_etapa_instancia%rowtype;
  v_next uuid;
  v_guard integer := 0;
begin
  loop
    v_guard := v_guard + 1;
    if v_guard > 200 then
      raise exception 'Fluxo: loop de etapas (template com ciclo?)';
    end if;

    if p_etapa_id is null then
      update public.fluxo_instancia
         set status = 'Concluído', etapa_atual_id = null, updated_at = now()
       where id = p_instancia_id;
      return;
    end if;

    select * into v_etapa
      from public.fluxo_etapa_instancia
      where id = p_etapa_id
      for update;

    if v_etapa.id is null then
      update public.fluxo_instancia
         set status = 'Concluído', etapa_atual_id = null, updated_at = now()
       where id = p_instancia_id;
      return;
    end if;

    if v_etapa.tipo = 'fim' then
      update public.fluxo_etapa_instancia
         set status = 'Concluída', updated_at = now()
       where id = v_etapa.id;
      update public.fluxo_instancia
         set status = 'Concluído', etapa_atual_id = null, updated_at = now()
       where id = p_instancia_id;
      return;

    elsif v_etapa.tipo = 'inicio' then
      -- marcador: conclui sem ação humana e avança
      update public.fluxo_etapa_instancia
         set status = 'Concluída', data_execucao = now(), updated_at = now()
       where id = v_etapa.id;
      v_next := public.fluxo_proxima_etapa_id(p_instancia_id, v_etapa.id, null);
      p_etapa_id := v_next;
      -- continua o loop

    else
      update public.fluxo_etapa_instancia
         set status = 'Em Execução', updated_at = now()
       where id = v_etapa.id;
      update public.fluxo_instancia
         set etapa_atual_id = v_etapa.id, status = 'Em Andamento', updated_at = now()
       where id = p_instancia_id;
      perform public.fluxo_notificar_papel(
        v_etapa.empresa_id,
        v_etapa.papel_responsavel,
        'Nova etapa para executar: ' || v_etapa.nome,
        'O fluxo avançou. Responsável pela execução: papel "'
          || coalesce(v_etapa.papel_responsavel, '—') || '".',
        '/MinhasPendencias'
      );
      return;
    end if;
  end loop;
end;
$$;

-- 8. Avança após uma etapa concluída/aprovada (resolve próxima + abre) ----------
create or replace function public.fluxo_abrir_proxima(
  p_instancia_id uuid,
  p_etapa_concluida_id uuid,
  p_destino_ordem integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fluxo_abrir_a_partir(
    p_instancia_id,
    public.fluxo_proxima_etapa_id(p_instancia_id, p_etapa_concluida_id, p_destino_ordem)
  );
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs PÚBLICAS (expostas a authenticated) — SECURITY DEFINER + guard de empresa
-- ════════════════════════════════════════════════════════════════════════════

-- 9. fluxo_instanciar — cria a instância e abre a 1ª etapa ----------------------
create or replace function public.fluxo_instanciar(
  p_template_id uuid,
  p_entidade_alvo text,
  p_registro_id uuid,
  p_ator_email text,
  p_ator_nome text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tpl public.fluxo_template%rowtype;
  v_inst_id uuid;
  v_primeira uuid;
begin
  select * into v_tpl
    from public.fluxo_template
    where id = p_template_id and deleted_at is null
    for update;

  if v_tpl.id is null then
    raise exception 'Template de fluxo não encontrado';
  end if;

  -- guard multi-tenant (definer bypassa RLS, então validamos na mão)
  if public.current_empresa_id() is not null
     and v_tpl.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: template de outra empresa';
  end if;

  -- evita duas instâncias ativas pro mesmo registro do mesmo template
  if exists (
    select 1 from public.fluxo_instancia
      where fluxo_template_id = p_template_id
        and registro_id = p_registro_id
        and status = 'Em Andamento'
        and deleted_at is null
  ) then
    raise exception 'Já existe um fluxo em andamento para este registro.';
  end if;

  insert into public.fluxo_instancia (
    empresa_id, fluxo_template_id, template_nome, entidade_alvo,
    registro_id, status, created_by_email, created_by_nome
  ) values (
    v_tpl.empresa_id, v_tpl.id, v_tpl.nome,
    coalesce(p_entidade_alvo, v_tpl.entidade_alvo, 'oportunidade'),
    p_registro_id, 'Em Andamento', p_ator_email, p_ator_nome
  ) returning id into v_inst_id;

  -- copia as etapas do template (snapshot)
  insert into public.fluxo_etapa_instancia (
    empresa_id, fluxo_instancia_id, etapa_template_id, ordem, nome, tipo,
    papel_responsavel, papel_aprovador, exige_aprovacao, checklist, opcoes,
    proxima_etapa_ordem, status
  )
  select v_tpl.empresa_id, v_inst_id, et.id, et.ordem, et.nome, et.tipo,
         et.papel_responsavel, et.papel_aprovador, coalesce(et.exige_aprovacao, false),
         coalesce(et.checklist, '[]'::jsonb), coalesce(et.opcoes, '[]'::jsonb),
         et.proxima_etapa_ordem, 'A Fazer'
    from public.fluxo_etapa_template et
    where et.fluxo_template_id = v_tpl.id
      and et.deleted_at is null
    order by et.ordem;

  if not exists (
    select 1 from public.fluxo_etapa_instancia where fluxo_instancia_id = v_inst_id
  ) then
    raise exception 'Template não tem etapas para executar.';
  end if;

  insert into public.fluxo_etapa_evento (
    empresa_id, fluxo_instancia_id, evento, ator_email, ator_nome
  ) values (
    v_tpl.empresa_id, v_inst_id, 'Instanciou', p_ator_email, p_ator_nome
  );

  -- abre a primeira etapa (menor ordem)
  select id into v_primeira
    from public.fluxo_etapa_instancia
    where fluxo_instancia_id = v_inst_id and deleted_at is null
    order by ordem
    limit 1;

  perform public.fluxo_abrir_a_partir(v_inst_id, v_primeira);

  return v_inst_id;
end;
$$;

-- 10. fluxo_concluir_etapa — executor conclui (vai p/ revisão ou conclui) -------
create or replace function public.fluxo_concluir_etapa(
  p_etapa_id uuid,
  p_executor_email text,
  p_executor_nome text,
  p_executor_perfil text default null,
  p_checklist_estado jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.fluxo_etapa_instancia%rowtype;
begin
  select * into v_e
    from public.fluxo_etapa_instancia
    where id = p_etapa_id and deleted_at is null
    for update;

  if v_e.id is null then
    raise exception 'Etapa não encontrada';
  end if;

  if public.current_empresa_id() is not null
     and v_e.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: etapa de outra empresa';
  end if;

  if v_e.status <> 'Em Execução' then
    raise exception 'Etapa não está em execução (status atual: %)', v_e.status;
  end if;

  -- valida papel do executor (se a etapa define um e o perfil foi informado)
  if v_e.papel_responsavel is not null
     and p_executor_perfil is not null
     and p_executor_perfil <> v_e.papel_responsavel
     and p_executor_perfil <> 'Admin' then
    raise exception 'Perfil "%" não é o responsável por esta etapa (requer "%")',
      p_executor_perfil, v_e.papel_responsavel;
  end if;

  update public.fluxo_etapa_instancia
     set executor_email = p_executor_email,
         executor_nome = p_executor_nome,
         data_execucao = now(),
         checklist_estado = coalesce(p_checklist_estado, checklist_estado),
         status = case when v_e.exige_aprovacao then 'Em Revisão' else 'Concluída' end,
         updated_at = now()
   where id = p_etapa_id;

  insert into public.fluxo_etapa_evento (
    empresa_id, fluxo_instancia_id, fluxo_etapa_instancia_id, evento,
    ator_email, ator_nome, ator_perfil
  ) values (
    v_e.empresa_id, v_e.fluxo_instancia_id, v_e.id, 'Concluiu',
    p_executor_email, p_executor_nome, p_executor_perfil
  );

  if v_e.exige_aprovacao then
    perform public.fluxo_notificar_papel(
      v_e.empresa_id,
      v_e.papel_aprovador,
      'Etapa aguardando sua aprovação: ' || v_e.nome,
      'Executada por ' || coalesce(p_executor_nome, p_executor_email, '—')
        || '. Revise e aprove ou reprove.',
      '/MinhasPendencias'
    );
    return jsonb_build_object('status', 'Em Revisão',
      'mensagem', 'Etapa enviada para aprovação.');
  else
    perform public.fluxo_abrir_proxima(v_e.fluxo_instancia_id, v_e.id, null);
    return jsonb_build_object('status', 'Concluída',
      'mensagem', 'Etapa concluída; o fluxo avançou.');
  end if;
end;
$$;

-- 11. fluxo_aprovar_etapa — aprovador libera o gate (anti-auto-aprovação) -------
create or replace function public.fluxo_aprovar_etapa(
  p_etapa_id uuid,
  p_aprovador_email text,
  p_aprovador_nome text,
  p_aprovador_perfil text,
  p_comentario text default null,
  p_opcao_escolhida text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.fluxo_etapa_instancia%rowtype;
  v_destino integer;
begin
  select * into v_e
    from public.fluxo_etapa_instancia
    where id = p_etapa_id and deleted_at is null
    for update;

  if v_e.id is null then
    raise exception 'Etapa não encontrada';
  end if;

  if public.current_empresa_id() is not null
     and v_e.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: etapa de outra empresa';
  end if;

  if v_e.status <> 'Em Revisão' then
    raise exception 'Etapa não está em revisão (status atual: %)', v_e.status;
  end if;

  -- anti-auto-aprovação (regra herdada de Compras)
  if v_e.executor_email is not null
     and lower(v_e.executor_email) = lower(p_aprovador_email) then
    raise exception 'Quem executou a etapa não pode aprová-la.';
  end if;

  -- valida perfil do aprovador (Admin é super-aprovador)
  if v_e.papel_aprovador is not null
     and p_aprovador_perfil <> v_e.papel_aprovador
     and p_aprovador_perfil <> 'Admin' then
    raise exception 'Perfil "%" não autorizado a aprovar esta etapa (requer "%")',
      p_aprovador_perfil, v_e.papel_aprovador;
  end if;

  -- decisão: se opcoes forem objetos {rotulo, destino_ordem|destino}, resolve a saída.
  -- (o editor atual grava opcoes como array de strings → v_destino fica null →
  --  roteamento linear; forward-compatible quando o editor passar a gravar objetos.)
  v_destino := null;
  if v_e.tipo = 'decisao'
     and p_opcao_escolhida is not null
     and jsonb_typeof(v_e.opcoes) = 'array'
     and jsonb_array_length(v_e.opcoes) > 0
     and jsonb_typeof(v_e.opcoes -> 0) = 'object' then
    select case
             when (op ->> 'destino_ordem') ~ '^-?\d+$' then (op ->> 'destino_ordem')::int
             when (op ->> 'destino') ~ '^-?\d+$' then (op ->> 'destino')::int
             when lower(coalesce(op ->> 'destino', '')) = 'fim' then -1
             else null
           end
      into v_destino
      from jsonb_array_elements(v_e.opcoes) op
      where lower(coalesce(op ->> 'rotulo', op ->> 'label', '')) = lower(p_opcao_escolhida)
      limit 1;
  end if;

  update public.fluxo_etapa_instancia
     set status = 'Aprovada',
         aprovador_email = p_aprovador_email,
         aprovador_nome = p_aprovador_nome,
         data_decisao = now(),
         comentario = p_comentario,
         updated_at = now()
   where id = p_etapa_id;

  insert into public.fluxo_etapa_evento (
    empresa_id, fluxo_instancia_id, fluxo_etapa_instancia_id, evento,
    ator_email, ator_nome, ator_perfil, comentario, opcao_escolhida
  ) values (
    v_e.empresa_id, v_e.fluxo_instancia_id, v_e.id, 'Aprovou',
    p_aprovador_email, p_aprovador_nome, p_aprovador_perfil, p_comentario, p_opcao_escolhida
  );

  perform public.fluxo_abrir_proxima(v_e.fluxo_instancia_id, v_e.id, v_destino);

  return jsonb_build_object('status', 'Aprovada',
    'mensagem', 'Etapa aprovada; o fluxo avançou.');
end;
$$;

-- 12. fluxo_reprovar_etapa — devolve p/ execução com motivo obrigatório ---------
create or replace function public.fluxo_reprovar_etapa(
  p_etapa_id uuid,
  p_aprovador_email text,
  p_aprovador_nome text,
  p_aprovador_perfil text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.fluxo_etapa_instancia%rowtype;
begin
  if p_motivo is null or length(trim(p_motivo)) < 5 then
    raise exception 'Motivo da reprovação é obrigatório (mín. 5 caracteres)';
  end if;

  select * into v_e
    from public.fluxo_etapa_instancia
    where id = p_etapa_id and deleted_at is null
    for update;

  if v_e.id is null then
    raise exception 'Etapa não encontrada';
  end if;

  if public.current_empresa_id() is not null
     and v_e.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: etapa de outra empresa';
  end if;

  if v_e.status <> 'Em Revisão' then
    raise exception 'Etapa não está em revisão (status atual: %)', v_e.status;
  end if;

  if v_e.executor_email is not null
     and lower(v_e.executor_email) = lower(p_aprovador_email) then
    raise exception 'Quem executou a etapa não pode decidir sobre ela.';
  end if;

  if v_e.papel_aprovador is not null
     and p_aprovador_perfil <> v_e.papel_aprovador
     and p_aprovador_perfil <> 'Admin' then
    raise exception 'Perfil "%" não autorizado a reprovar esta etapa (requer "%")',
      p_aprovador_perfil, v_e.papel_aprovador;
  end if;

  -- volta p/ execução (re-trabalho), guardando quem reprovou e o motivo
  update public.fluxo_etapa_instancia
     set status = 'Em Execução',
         aprovador_email = p_aprovador_email,
         aprovador_nome = p_aprovador_nome,
         data_decisao = now(),
         comentario = p_motivo,
         updated_at = now()
   where id = p_etapa_id;

  update public.fluxo_instancia
     set etapa_atual_id = v_e.id, updated_at = now()
   where id = v_e.fluxo_instancia_id;

  insert into public.fluxo_etapa_evento (
    empresa_id, fluxo_instancia_id, fluxo_etapa_instancia_id, evento,
    ator_email, ator_nome, ator_perfil, comentario
  ) values (
    v_e.empresa_id, v_e.fluxo_instancia_id, v_e.id, 'Reprovou',
    p_aprovador_email, p_aprovador_nome, p_aprovador_perfil, p_motivo
  );

  -- notifica o executor diretamente (por e-mail) com o motivo
  if v_e.executor_email is not null then
    insert into public.notificacao (
      empresa_id, tipo, titulo, descricao, usuario_email, lida, link_destino
    ) values (
      v_e.empresa_id, 'Fluxo',
      'Etapa reprovada: ' || v_e.nome,
      'Motivo: ' || p_motivo || ' • Por: ' || coalesce(p_aprovador_nome, p_aprovador_email),
      v_e.executor_email, false, '/MinhasPendencias'
    );
  end if;

  return jsonb_build_object('status', 'Em Execução',
    'mensagem', 'Etapa reprovada; voltou para execução (re-trabalho).');
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 13. Permissões — só authenticated nos 4 pontos de entrada;
--     helpers internos revogados do public/anon.
-- ════════════════════════════════════════════════════════════════════════════
revoke all on function public.fluxo_notificar_papel(uuid, text, text, text, text) from public;
revoke all on function public.fluxo_proxima_etapa_id(uuid, uuid, integer) from public;
revoke all on function public.fluxo_abrir_a_partir(uuid, uuid) from public;
revoke all on function public.fluxo_abrir_proxima(uuid, uuid, integer) from public;

grant execute on function public.fluxo_instanciar(uuid, text, uuid, text, text)
  to authenticated;
grant execute on function public.fluxo_concluir_etapa(uuid, text, text, text, jsonb)
  to authenticated;
grant execute on function public.fluxo_aprovar_etapa(uuid, text, text, text, text, text)
  to authenticated;
grant execute on function public.fluxo_reprovar_etapa(uuid, text, text, text, text)
  to authenticated;
