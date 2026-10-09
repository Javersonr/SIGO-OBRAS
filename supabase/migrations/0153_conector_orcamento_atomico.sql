-- ============================================================================
-- 0153_conector_orcamento_atomico.sql — o conector do Claude grava o orçamento da
-- prefeitura e o desconto numa transação (Plano 2 do conector, T14; spec
-- docs/superpowers/specs/2026-10-08-conector-orcamento-cronograma-design.md §2)
--
-- Por quê:
--   * Na tela, "Importar planilha" apaga (exclusão lógica) os itens e grava os
--     novos em lotes de 200: uma falha no meio deixa o orçamento pela metade e a
--     tela pede para importar de novo. O conector não tem quem olhe a tela: a
--     troca tem de ser TUDO OU NADA. conector_substituir_orcamento faz numa
--     transação só: confere a oportunidade (travada com FOR UPDATE), recusa se já
--     há itens e p_substituir não é true ("Substituir os N itens atuais?"), marca
--     os itens atuais com deleted_at (como a tela), grava os novos, grava o
--     orcamento_info e registra a atualização "Sistema".
--   * "Aplicar desconto" na tela grava item a item. conector_aplicar_desconto
--     grava os preços com desconto e o desconto_proposta_pct numa transação, e
--     recusa (orcamento_mudou) se a lista de itens com referência mudou entre a
--     leitura do conector e a gravação (alguém editou na tela): nada é gravado e
--     o Claude chama de novo.
--
-- As contas (corte do unitário, arredondamento do total) ficam no TypeScript
-- (_shared/orcamento/, com paridade com a tela); o banco só grava o que recebe.
-- O empresa_id e o oportunidade_id dos itens vêm SEMPRE dos parâmetros (a camada
-- do conector injeta p_empresa_id da chave), nunca do JSON.
--
-- Funções só do servidor (service role). Depende da 0127 (numero, etapa, fonte,
-- valor_unitario_ref, desconto_proposta_pct, orcamento_info). Aplicar antes do
-- deploy do mcp com as ferramentas de orçamento. Idempotente (create or replace).
-- ============================================================================

create or replace function public.conector_substituir_orcamento(
  p_empresa_id uuid,
  p_oportunidade_id uuid,
  p_registros jsonb,
  p_info jsonb,
  p_substituir boolean,
  p_usuario_nome text,
  p_descricao text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd integer;
  v_n integer;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_empresa_id is null or p_oportunidade_id is null then
    raise exception 'conector_substituir_orcamento: empresa e oportunidade são obrigatórias' using errcode = '22023';
  end if;

  -- 1. a oportunidade é da empresa e está viva; a trava segura duas importações ao mesmo tempo
  perform 1
     from public.oportunidade
    where id = p_oportunidade_id
      and empresa_id = p_empresa_id
      and deleted_at is null
      for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  end if;

  -- 2. já tem orçamento e não pediram para substituir: nada muda
  select count(*) into v_qtd
    from public.orcamento_item
   where empresa_id = p_empresa_id
     and oportunidade_id = p_oportunidade_id
     and deleted_at is null;
  if v_qtd > 0 and p_substituir is not true then
    return jsonb_build_object('ok', false, 'motivo', 'ja_existe', 'itens_atuais', v_qtd);
  end if;

  -- 3. de 1 a 3000 linhas (o limite do modelo) e informações em objeto
  if p_registros is null or jsonb_typeof(p_registros) <> 'array'
     or jsonb_array_length(p_registros) not between 1 and 3000 then
    raise exception 'conector_substituir_orcamento: envie de 1 a 3000 registros' using errcode = '22023';
  end if;
  if p_info is null or jsonb_typeof(p_info) <> 'object' then
    raise exception 'conector_substituir_orcamento: p_info deve ser um objeto' using errcode = '22023';
  end if;

  -- 4. exclusão lógica dos itens atuais (igual ao deleteMany da tela)
  update public.orcamento_item
     set deleted_at = now()
   where empresa_id = p_empresa_id
     and oportunidade_id = p_oportunidade_id
     and deleted_at is null;

  -- 5. os novos itens: empresa e oportunidade dos parâmetros; tipo null, bdi 0 e imposto 0
  insert into public.orcamento_item (
    empresa_id, oportunidade_id, numero, item, etapa, tipo, codigo, fonte, descricao, unidade,
    quantidade, valor_unitario_ref, valor_unitario, bdi, imposto, valor_total, ordem
  )
  select p_empresa_id, p_oportunidade_id, r.numero, r.item, coalesce(r.etapa, false), null,
         r.codigo, r.fonte, r.descricao, r.unidade, r.quantidade, r.valor_unitario_ref,
         r.valor_unitario, 0, 0, r.valor_total, r.ordem
    from jsonb_to_recordset(p_registros) as r(
      numero text, item text, etapa boolean, codigo text, fonte text, descricao text, unidade text,
      quantidade numeric, valor_unitario_ref numeric, valor_unitario numeric, valor_total numeric,
      ordem int
    );
  get diagnostics v_n = row_count;

  -- 6. aba Informações da planilha + arquivo e data
  update public.oportunidade
     set orcamento_info = p_info
   where id = p_oportunidade_id
     and empresa_id = p_empresa_id;

  -- 7. linha do tempo da oportunidade
  insert into public.oportunidade_atualizacao (
    empresa_id, oportunidade_id, usuario_nome, tipo, descricao, dados_novos
  ) values (
    p_empresa_id, p_oportunidade_id, p_usuario_nome, 'Sistema',
    coalesce(p_descricao, 'Orçamento importado pelo Claude'),
    jsonb_build_object('itens', v_n, 'substituidos', v_qtd)
  );

  return jsonb_build_object('ok', true, 'itens_gravados', v_n, 'substituidos', v_qtd);
end;
$$;

revoke all on function public.conector_substituir_orcamento(uuid, uuid, jsonb, jsonb, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.conector_substituir_orcamento(uuid, uuid, jsonb, jsonb, boolean, text, text)
  to service_role;

create or replace function public.conector_aplicar_desconto(
  p_empresa_id uuid,
  p_oportunidade_id uuid,
  p_pct numeric,
  p_alteracoes jsonb,
  p_usuario_nome text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_esperados integer;
  v_n integer;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_empresa_id is null or p_oportunidade_id is null then
    raise exception 'conector_aplicar_desconto: empresa e oportunidade são obrigatórias' using errcode = '22023';
  end if;

  -- 1. trava a oportunidade; o desconto vai de 0 a 99,99 com até 2 casas
  perform 1
     from public.oportunidade
    where id = p_oportunidade_id
      and empresa_id = p_empresa_id
      and deleted_at is null
      for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  end if;
  if p_pct is null or p_pct < 0 or p_pct > 99.99 or p_pct <> round(p_pct, 2) then
    raise exception 'conector_aplicar_desconto: desconto fora de 0 a 99,99%%' using errcode = '22023';
  end if;
  if p_alteracoes is null or jsonb_typeof(p_alteracoes) <> 'array' then
    raise exception 'conector_aplicar_desconto: p_alteracoes deve ser uma lista' using errcode = '22023';
  end if;

  -- 2. a lista que o conector calculou tem de ter todos os itens com referência, nem mais nem menos
  select count(*) into v_esperados
    from public.orcamento_item
   where empresa_id = p_empresa_id
     and oportunidade_id = p_oportunidade_id
     and deleted_at is null
     and etapa is not true
     and valor_unitario_ref is not null;
  if jsonb_array_length(p_alteracoes) <> v_esperados then
    return jsonb_build_object('ok', false, 'motivo', 'orcamento_mudou');
  end if;

  -- 3. grava; se algum id não casou (lista trocada entre a leitura e a gravação), desfaz este
  --    bloco (subtransação) e devolve orcamento_mudou: nada fica gravado
  begin
    update public.orcamento_item i
       set valor_unitario = a.valor_unitario,
           valor_total = a.valor_total
      from jsonb_to_recordset(p_alteracoes) as a(id uuid, valor_unitario numeric, valor_total numeric)
     where i.id = a.id
       and i.empresa_id = p_empresa_id
       and i.oportunidade_id = p_oportunidade_id
       and i.deleted_at is null
       and i.etapa is not true
       and i.valor_unitario_ref is not null;
    get diagnostics v_n = row_count;
    if v_n <> v_esperados then
      raise exception 'orcamento_mudou' using errcode = 'P0001';
    end if;
  exception when raise_exception then
    return jsonb_build_object('ok', false, 'motivo', 'orcamento_mudou');
  end;

  -- 4. o % da proposta
  update public.oportunidade
     set desconto_proposta_pct = p_pct
   where id = p_oportunidade_id
     and empresa_id = p_empresa_id;

  -- 5. linha do tempo da oportunidade ("Desconto de 12,35% aplicado pelo Claude em 57 itens")
  insert into public.oportunidade_atualizacao (
    empresa_id, oportunidade_id, usuario_nome, tipo, descricao, dados_novos
  ) values (
    p_empresa_id, p_oportunidade_id, p_usuario_nome, 'Sistema',
    format('Desconto de %s%% aplicado pelo Claude em %s itens',
           replace(to_char(p_pct, 'FM990.00'), '.', ','), v_n),
    jsonb_build_object('desconto_proposta_pct', p_pct, 'itens', v_n)
  );

  return jsonb_build_object('ok', true, 'itens', v_n);
end;
$$;

revoke all on function public.conector_aplicar_desconto(uuid, uuid, numeric, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.conector_aplicar_desconto(uuid, uuid, numeric, jsonb, text)
  to service_role;

select 'ok' as res;
