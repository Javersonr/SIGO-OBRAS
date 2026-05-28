-- ============================================================================
-- 0028 — Compras: aprovação multi-nível + limites por perfil + pedido rápido
-- ============================================================================
-- Solicitado em 28/05/2026: bloqueio de auto-aprovação + escala de valor +
-- atalho pra compras pequenas sem precisar de cotação.
--
-- Resolve 6 problemas:
--   1. Solicitante aprovava a própria SC
--   2. Limite de valor (nivel_aprovacao.valor_min/max) nunca era validado
--   3. valor_total_estimado existia mas nunca era calculado
--   4. Aprovação multi-nível inexistente (sempre 1 clique direto)
--   5. Histórico de aprovação (aprovacao_solicitacao) nunca era populado
--   6. Sem atalho pra compras pequenas pularem cotação
--
-- Adições:
--   - Colunas em solicitacao_compra (nivel_aprovacao_atual, próximo aprovador, etc)
--   - Coluna preco_unitario_estimado em solicitacao_compra_item
--   - Trigger recalcula valor_total_estimado quando itens mudam
--   - Function aprovar_solicitacao_compra() — multi-nível com lock
--   - Function rejeitar_solicitacao_compra()
--   - Function gerar_pedido_direto() — pula cotação pra SC < limite
--   - Configuração: parametro de "compras < R$X pulam cotação"
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Colunas em solicitacao_compra (estado da aprovação)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.solicitacao_compra
  add column if not exists nivel_aprovacao_atual integer default 1,
  add column if not exists proximo_aprovador_perfis jsonb,
  add column if not exists data_aprovacao_final timestamptz,
  add column if not exists aprovador_final_email text,
  add column if not exists aprovador_final_nome text;

-- valor_total_estimado já existe (migration 0020). Garantimos default 0.
alter table public.solicitacao_compra
  alter column valor_total_estimado set default 0;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Preço estimado por item — base pro cálculo do total
-- ────────────────────────────────────────────────────────────────────────────
-- Vem do orçamento (se SC foi gerada de lá) ou do material.preco_medio,
-- ou o solicitante digita. Aceita ser null (= não sei o preço ainda).
alter table public.solicitacao_compra_item
  add column if not exists preco_unitario_estimado numeric(14,4),
  add column if not exists valor_estimado_item numeric(14,2)
    generated always as (quantidade * coalesce(preco_unitario_estimado, 0)) stored;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Parâmetro por empresa: valor max que pula cotação
-- ────────────────────────────────────────────────────────────────────────────
-- SC aprovada com total <= esse valor pode gerar pedido_compra DIRETO,
-- sem passar por cotação. Default null = sempre exige cotação.
alter table public.empresa
  add column if not exists compras_pular_cotacao_valor_max numeric(14,2);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Trigger: recalcula valor_total_estimado quando itens mudam
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_total_solicitacao()
returns trigger
language plpgsql
as $$
declare
  v_sol_id uuid;
  v_total numeric(14,2);
begin
  v_sol_id := coalesce(NEW.solicitacao_id, OLD.solicitacao_id);

  select coalesce(sum(valor_estimado_item), 0)
    into v_total
    from public.solicitacao_compra_item
    where solicitacao_id = v_sol_id
      and deleted_at is null;

  update public.solicitacao_compra
     set valor_total_estimado = v_total,
         total_itens = (
           select count(*) from public.solicitacao_compra_item
           where solicitacao_id = v_sol_id and deleted_at is null
         ),
         updated_at = now()
   where id = v_sol_id;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_sync_total_solicitacao on public.solicitacao_compra_item;
create trigger trg_sync_total_solicitacao
  after insert or update or delete on public.solicitacao_compra_item
  for each row execute function public.sync_total_solicitacao();

-- Catch-up: recalcula todas as solicitações existentes
update public.solicitacao_compra sc
   set valor_total_estimado = coalesce(sub.total, 0)
  from (
    select solicitacao_id, sum(quantidade * coalesce(preco_unitario_estimado, 0)) as total
      from public.solicitacao_compra_item
      where deleted_at is null
      group by solicitacao_id
  ) sub
 where sc.id = sub.solicitacao_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Helper interno: encontra o nível de aprovação aplicável
-- ────────────────────────────────────────────────────────────────────────────
-- Dado empresa + valor + número do nível (1, 2, 3...), retorna o registro
-- de nivel_aprovacao correspondente (ou null se não há mais níveis).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.encontrar_nivel_aprovacao(
  p_empresa_id uuid,
  p_valor numeric,
  p_ordem integer
)
returns public.nivel_aprovacao
language plpgsql
as $$
declare
  v_nivel public.nivel_aprovacao%rowtype;
begin
  -- Pega o nível com a `ordem` exata, cuja faixa cobre o valor.
  -- valor_minimo null = sem mínimo; valor_maximo null = sem teto.
  select * into v_nivel
    from public.nivel_aprovacao
    where empresa_id = p_empresa_id
      and tipo = 'SolicitacaoCompra'
      and ordem = p_ordem
      and (valor_minimo is null or p_valor >= valor_minimo)
      and (valor_maximo is null or p_valor <= valor_maximo)
      and deleted_at is null
    limit 1;

  return v_nivel;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Function aprovar_solicitacao_compra
-- ────────────────────────────────────────────────────────────────────────────
-- Multi-nível com:
--   - Bloqueio de auto-aprovação (solicitante != aprovador)
--   - Validação de perfil (aprovador tem que estar em perfis_aprovadores)
--   - Validação de valor (cai dentro da faixa do nível)
--   - Avanço pra próximo nível se houver
--   - Log em aprovacao_solicitacao
--   - Notificação ao próximo aprovador (ou ao solicitante se aprovou final)
--
-- Retorna jsonb: { aprovada_final, proximo_nivel, mensagem }
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.aprovar_solicitacao_compra(
  p_solicitacao_id uuid,
  p_aprovador_email text,
  p_aprovador_nome text,
  p_aprovador_perfil text,
  p_comentario text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_sol public.solicitacao_compra%rowtype;
  v_nivel public.nivel_aprovacao%rowtype;
  v_proximo_nivel public.nivel_aprovacao%rowtype;
  v_perfis_aprovadores jsonb;
  v_solicitante_email text;
begin
  -- LOCK pessimista na solicitação (qualquer concorrência aguarda)
  select * into v_sol
    from public.solicitacao_compra
    where id = p_solicitacao_id and deleted_at is null
    for update;

  if v_sol.id is null then
    raise exception 'Solicitação não encontrada';
  end if;

  if v_sol.status not in ('Pendente Aprovação') then
    raise exception 'Solicitação não está pendente (status atual: %)', v_sol.status;
  end if;

  -- 1. Bloqueia auto-aprovação. solicitante_email seria o ideal mas a tabela
  --    tem solicitante_id. Buscamos email via usuario_empresa.
  select usuario_email into v_solicitante_email
    from public.usuario_empresa
    where id = v_sol.solicitante_id
    limit 1;

  if v_solicitante_email is not null
     and lower(v_solicitante_email) = lower(p_aprovador_email) then
    raise exception 'Solicitante não pode aprovar a própria solicitação';
  end if;

  -- 2. Encontra o nível de aprovação atual
  v_nivel := public.encontrar_nivel_aprovacao(
    v_sol.empresa_id,
    coalesce(v_sol.valor_total_estimado, 0),
    coalesce(v_sol.nivel_aprovacao_atual, 1)
  );

  if v_nivel.id is null then
    -- Sem nível configurado pra essa faixa = bypass: aprova direto
    update public.solicitacao_compra
       set status = 'Aprovada',
           data_aprovacao_final = now(),
           aprovador_final_email = p_aprovador_email,
           aprovador_final_nome = p_aprovador_nome,
           updated_at = now()
     where id = p_solicitacao_id;

    insert into public.aprovacao_solicitacao (
      empresa_id, solicitacao_id, status,
      aprovador_id, aprovador_nome, data_decisao, comentarios
    ) values (
      v_sol.empresa_id, p_solicitacao_id, 'Aprovado',
      null, p_aprovador_nome, now(),
      coalesce(p_comentario, 'Sem nível de aprovação configurado para esta faixa de valor')
    );

    return jsonb_build_object(
      'aprovada_final', true,
      'proximo_nivel', null,
      'mensagem', 'Solicitação aprovada (nenhum nível configurado).'
    );
  end if;

  -- 3. Valida perfil do aprovador contra perfis_aprovadores do nível
  v_perfis_aprovadores := coalesce(v_nivel.perfis_aprovadores, '[]'::jsonb);

  -- perfis_aprovadores é array de strings; check se p_aprovador_perfil está dentro.
  -- Aceita também perfil "Admin" como super-aprovador universal.
  if not (
    v_perfis_aprovadores ? p_aprovador_perfil
    or p_aprovador_perfil = 'Admin'
    or jsonb_array_length(v_perfis_aprovadores) = 0
  ) then
    raise exception 'Perfil "%" não autorizado para aprovação de nível % (R$ % a R$ %)',
      p_aprovador_perfil,
      v_nivel.ordem,
      coalesce(v_nivel.valor_minimo, 0),
      coalesce(v_nivel.valor_maximo::text, '∞');
  end if;

  -- 4. Registra a decisão deste nível
  insert into public.aprovacao_solicitacao (
    empresa_id, solicitacao_id, status,
    aprovador_id, aprovador_nome, data_decisao, comentarios
  ) values (
    v_sol.empresa_id, p_solicitacao_id, 'Aprovado',
    null, p_aprovador_nome, now(),
    coalesce(p_comentario, 'Aprovado nível ' || v_nivel.ordem || ' (' || v_nivel.nome || ')')
  );

  -- 5. Tem próximo nível?
  v_proximo_nivel := public.encontrar_nivel_aprovacao(
    v_sol.empresa_id,
    coalesce(v_sol.valor_total_estimado, 0),
    v_nivel.ordem + 1
  );

  if v_proximo_nivel.id is not null then
    -- Avança pro próximo nível
    update public.solicitacao_compra
       set nivel_aprovacao_atual = v_proximo_nivel.ordem,
           proximo_aprovador_perfis = v_proximo_nivel.perfis_aprovadores,
           updated_at = now()
     where id = p_solicitacao_id;

    -- Notificação pro próximo nível (cria 1 notificação por perfil)
    -- Frontend filtra pelo perfil do usuário logado.
    insert into public.notificacao (
      empresa_id, tipo, titulo, descricao, usuario_email,
      lida, link_destino
    )
    select v_sol.empresa_id,
           'AprovacaoCompra',
           'Solicitação ' || coalesce(v_sol.numero, p_solicitacao_id::text) || ' aguardando sua aprovação',
           'Valor R$ ' || coalesce(v_sol.valor_total_estimado::text, '0') ||
             ' • Nível ' || v_proximo_nivel.ordem || ' (' || v_proximo_nivel.nome || ')',
           ue.usuario_email,
           false,
           '/Compras?solicitacao=' || p_solicitacao_id::text
      from public.usuario_empresa ue
      where ue.empresa_id = v_sol.empresa_id
        and ue.ativo = true
        and ue.deleted_at is null
        and (
          ue.perfil = any (
            select jsonb_array_elements_text(v_proximo_nivel.perfis_aprovadores)
          )
          or ue.perfil = 'Admin'
        );

    return jsonb_build_object(
      'aprovada_final', false,
      'proximo_nivel', v_proximo_nivel.ordem,
      'proximo_nivel_nome', v_proximo_nivel.nome,
      'mensagem', 'Aprovado nível ' || v_nivel.ordem || '. Aguardando nível ' || v_proximo_nivel.ordem || '.'
    );
  end if;

  -- 6. Não tem próximo nível = aprovação FINAL
  update public.solicitacao_compra
     set status = 'Aprovada',
         data_aprovacao_final = now(),
         aprovador_final_email = p_aprovador_email,
         aprovador_final_nome = p_aprovador_nome,
         proximo_aprovador_perfis = null,
         updated_at = now()
   where id = p_solicitacao_id;

  -- Notifica o solicitante
  if v_solicitante_email is not null then
    insert into public.notificacao (
      empresa_id, tipo, titulo, descricao, usuario_email,
      lida, link_destino
    ) values (
      v_sol.empresa_id,
      'AprovacaoCompra',
      'Sua solicitação ' || coalesce(v_sol.numero, p_solicitacao_id::text) || ' foi APROVADA',
      'Aprovador final: ' || p_aprovador_nome,
      v_solicitante_email,
      false,
      '/Compras?solicitacao=' || p_solicitacao_id::text
    );
  end if;

  return jsonb_build_object(
    'aprovada_final', true,
    'proximo_nivel', null,
    'mensagem', 'Solicitação aprovada em todos os níveis.'
  );
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Function rejeitar_solicitacao_compra
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.rejeitar_solicitacao_compra(
  p_solicitacao_id uuid,
  p_aprovador_email text,
  p_aprovador_nome text,
  p_aprovador_perfil text,
  p_motivo text
)
returns void
language plpgsql
as $$
declare
  v_sol public.solicitacao_compra%rowtype;
  v_nivel public.nivel_aprovacao%rowtype;
  v_solicitante_email text;
begin
  if p_motivo is null or length(trim(p_motivo)) < 5 then
    raise exception 'Motivo da rejeição é obrigatório (mín. 5 caracteres)';
  end if;

  select * into v_sol
    from public.solicitacao_compra
    where id = p_solicitacao_id and deleted_at is null
    for update;

  if v_sol.id is null then
    raise exception 'Solicitação não encontrada';
  end if;

  if v_sol.status <> 'Pendente Aprovação' then
    raise exception 'Solicitação não está pendente (status: %)', v_sol.status;
  end if;

  select usuario_email into v_solicitante_email
    from public.usuario_empresa
    where id = v_sol.solicitante_id
    limit 1;

  if v_solicitante_email is not null
     and lower(v_solicitante_email) = lower(p_aprovador_email) then
    raise exception 'Solicitante não pode rejeitar a própria solicitação';
  end if;

  -- Mesma validação de perfil que aprovação
  v_nivel := public.encontrar_nivel_aprovacao(
    v_sol.empresa_id,
    coalesce(v_sol.valor_total_estimado, 0),
    coalesce(v_sol.nivel_aprovacao_atual, 1)
  );

  if v_nivel.id is not null and p_aprovador_perfil <> 'Admin' then
    if not (
      (v_nivel.perfis_aprovadores ? p_aprovador_perfil)
      or jsonb_array_length(coalesce(v_nivel.perfis_aprovadores, '[]'::jsonb)) = 0
    ) then
      raise exception 'Perfil "%" não autorizado para decidir sobre essa solicitação', p_aprovador_perfil;
    end if;
  end if;

  update public.solicitacao_compra
     set status = 'Rejeitada',
         updated_at = now()
   where id = p_solicitacao_id;

  insert into public.aprovacao_solicitacao (
    empresa_id, solicitacao_id, status,
    aprovador_id, aprovador_nome, data_decisao, comentarios
  ) values (
    v_sol.empresa_id, p_solicitacao_id, 'Rejeitado',
    null, p_aprovador_nome, now(), p_motivo
  );

  if v_solicitante_email is not null then
    insert into public.notificacao (
      empresa_id, tipo, titulo, descricao, usuario_email,
      lida, link_destino
    ) values (
      v_sol.empresa_id,
      'AprovacaoCompra',
      'Sua solicitação ' || coalesce(v_sol.numero, p_solicitacao_id::text) || ' foi REJEITADA',
      'Motivo: ' || p_motivo || ' • Por: ' || p_aprovador_nome,
      v_solicitante_email,
      false,
      '/Compras?solicitacao=' || p_solicitacao_id::text
    );
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Function gerar_pedido_direto — pula cotação pra compras pequenas
-- ────────────────────────────────────────────────────────────────────────────
-- Pré-requisitos:
--   - SC está 'Aprovada'
--   - valor_total_estimado <= empresa.compras_pular_cotacao_valor_max
--   - Fornecedor informado existe e está ativo
--
-- Cria pedido_compra + itens copiados da SC. Marca SC como 'Pedido Gerado'.
-- Retorna o pedido_id criado.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.gerar_pedido_direto(
  p_solicitacao_id uuid,
  p_fornecedor_id uuid,
  p_emissor_email text,
  p_emissor_nome text,
  p_condicao_pagamento text default null,
  p_previsao_entrega date default null
)
returns uuid
language plpgsql
as $$
declare
  v_sol public.solicitacao_compra%rowtype;
  v_limite numeric(14,2);
  v_fornecedor_nome text;
  v_pedido_id uuid;
  v_numero text;
begin
  select * into v_sol
    from public.solicitacao_compra
    where id = p_solicitacao_id and deleted_at is null
    for update;

  if v_sol.id is null then
    raise exception 'Solicitação não encontrada';
  end if;

  if v_sol.status <> 'Aprovada' then
    raise exception 'Solicitação precisa estar Aprovada para gerar pedido direto (status: %)', v_sol.status;
  end if;

  -- Verifica limite da empresa
  select compras_pular_cotacao_valor_max into v_limite
    from public.empresa where id = v_sol.empresa_id;

  if v_limite is null then
    raise exception 'Pedido direto não está habilitado para essa empresa. Configure o valor máximo em Configurações.';
  end if;

  if coalesce(v_sol.valor_total_estimado, 0) > v_limite then
    raise exception 'Valor da solicitação (R$ %) excede o limite para pedido direto (R$ %). Faça cotação.',
      v_sol.valor_total_estimado, v_limite;
  end if;

  -- Fornecedor
  select nome into v_fornecedor_nome
    from public.fornecedor
    where id = p_fornecedor_id
      and (ativo is null or ativo = true)
      and deleted_at is null;

  if v_fornecedor_nome is null then
    raise exception 'Fornecedor não encontrado ou inativo';
  end if;

  -- Numeração: PC-AAAAMM-NNN
  v_numero := 'PC-' || to_char(now(), 'YYYYMM') || '-' ||
    lpad((
      select coalesce(max(substring(numero from '\d+$')::int), 0) + 1
        from public.pedido_compra
        where empresa_id = v_sol.empresa_id
          and numero like 'PC-' || to_char(now(), 'YYYYMM') || '-%'
    )::text, 3, '0');

  -- 1. Cria pedido_compra
  insert into public.pedido_compra (
    empresa_id, numero, fornecedor_id, fornecedor_nome,
    solicitacao_id, projeto_id, projeto_nome,
    status, data_emissao, previsao_entrega,
    condicao_pagamento, total,
    observacoes
  ) values (
    v_sol.empresa_id, v_numero, p_fornecedor_id, v_fornecedor_nome,
    p_solicitacao_id, v_sol.projeto_id, v_sol.projeto_nome,
    'Emitido', current_date, p_previsao_entrega,
    p_condicao_pagamento, v_sol.valor_total_estimado,
    'Pedido direto (sem cotação) emitido por ' || p_emissor_nome
  ) returning id into v_pedido_id;

  -- 2. Copia itens com preço estimado como preço unitário
  insert into public.pedido_compra_item (
    empresa_id, pedido_id, material_id, descricao,
    quantidade, unidade, valor_unitario, valor_total
  )
  select v_sol.empresa_id, v_pedido_id, sci.material_id, sci.descricao,
         sci.quantidade, sci.unidade,
         coalesce(sci.preco_unitario_estimado, 0),
         sci.quantidade * coalesce(sci.preco_unitario_estimado, 0)
    from public.solicitacao_compra_item sci
    where sci.solicitacao_id = p_solicitacao_id
      and sci.deleted_at is null;

  -- 3. Marca SC como Pedido Gerado
  update public.solicitacao_compra
     set status = 'Pedido Gerado',
         updated_at = now()
   where id = p_solicitacao_id;

  return v_pedido_id;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. Permissões: expor as 3 functions via PostgREST/RPC
-- ────────────────────────────────────────────────────────────────────────────
grant execute on function public.aprovar_solicitacao_compra(
  uuid, text, text, text, text
) to anon, authenticated;

grant execute on function public.rejeitar_solicitacao_compra(
  uuid, text, text, text, text
) to anon, authenticated;

grant execute on function public.gerar_pedido_direto(
  uuid, uuid, text, text, text, date
) to anon, authenticated;
