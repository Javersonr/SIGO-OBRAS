-- ============================================================================
-- 0067_gerar_pedido_direto_identidade.sql — emissor do pedido vem do token
--
-- Achado da re-análise: gerar_pedido_direto (0028) recebia p_emissor_email/nome
-- como PARÂMETRO do cliente — o "emissor" registrado podia ser falsificado.
-- (NÃO é vazamento multi-tenant: a função é security INVOKER, então a RLS já
--  isola por empresa; o problema é só de AUDITORIA.)
--
-- Fix mínimo (mantém security invoker + RLS): se há JWT, o e-mail do emissor é
-- sobrescrito pelo do token (current_user_email, helper da 0061). Sem JWT
-- (serviço), o parâmetro segue valendo. Corpo idêntico ao da 0028.
-- ============================================================================

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
  v_jwt_email text;
begin
  -- identidade do emissor vem do token (audit à prova de spoof)
  v_jwt_email := public.current_user_email();
  if v_jwt_email is not null then
    p_emissor_email := v_jwt_email;
  end if;

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

  select compras_pular_cotacao_valor_max into v_limite
    from public.empresa where id = v_sol.empresa_id;

  if v_limite is null then
    raise exception 'Pedido direto não está habilitado para essa empresa. Configure o valor máximo em Configurações.';
  end if;

  if coalesce(v_sol.valor_total_estimado, 0) > v_limite then
    raise exception 'Valor da solicitação (R$ %) excede o limite para pedido direto (R$ %). Faça cotação.',
      v_sol.valor_total_estimado, v_limite;
  end if;

  select nome into v_fornecedor_nome
    from public.fornecedor
    where id = p_fornecedor_id
      and (ativo is null or ativo = true)
      and deleted_at is null;

  if v_fornecedor_nome is null then
    raise exception 'Fornecedor não encontrado ou inativo';
  end if;

  v_numero := 'PC-' || to_char(now(), 'YYYYMM') || '-' ||
    lpad((
      select coalesce(max(substring(numero from '\d+$')::int), 0) + 1
        from public.pedido_compra
        where empresa_id = v_sol.empresa_id
          and numero like 'PC-' || to_char(now(), 'YYYYMM') || '-%'
    )::text, 3, '0');

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
    'Pedido direto (sem cotação) emitido por ' || coalesce(p_emissor_nome, p_emissor_email)
  ) returning id into v_pedido_id;

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

  update public.solicitacao_compra
     set status = 'Pedido Gerado',
         updated_at = now()
   where id = p_solicitacao_id;

  return v_pedido_id;
end;
$$;
