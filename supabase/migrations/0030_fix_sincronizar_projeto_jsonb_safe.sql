-- ============================================================================
-- 0030 - Fix sincronizar_projeto_com_oportunidade: jsonb_array_length defensivo
-- ============================================================================
-- Bug em 0029: "cannot get array length of a scalar" quando responsaveis_ids
-- ou etiquetas_ids estao salvos como STRING (legacy/import) em vez de ARRAY.
--
-- Fix: helper jsonb_arr_len() que retorna 0 se nao for array, alem de
-- tentar parsear string como JSON antes de processar responsaveis_ids.
-- ============================================================================

-- Helper: tamanho de array jsonb defensivo (0 se nao for array)
create or replace function public.jsonb_arr_len(v jsonb)
returns integer
language sql
immutable
as $$
  select case when jsonb_typeof(v) = 'array' then jsonb_array_length(v) else 0 end;
$$;

-- Helper: garante que valor jsonb e um array, parseando string se preciso
create or replace function public.jsonb_to_array(v jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_str text;
  v_parsed jsonb;
begin
  if v is null then return '[]'::jsonb; end if;
  if jsonb_typeof(v) = 'array' then return v; end if;

  -- E uma string ou objeto. Tenta extrair string e re-parsear como jsonb.
  if jsonb_typeof(v) = 'string' then
    v_str := v #>> '{}';  -- extrai texto cru
    begin
      v_parsed := v_str::jsonb;
      if jsonb_typeof(v_parsed) = 'array' then
        return v_parsed;
      end if;
    exception when others then
      return '[]'::jsonb;
    end;
  end if;

  return '[]'::jsonb;
end;
$$;

-- Recriar a funcao usando os helpers defensivos
create or replace function public.sincronizar_projeto_com_oportunidade(
  p_projeto_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_proj public.projeto%rowtype;
  v_op public.oportunidade%rowtype;
  v_resp_ids jsonb;
  v_etiquetas jsonb;
  v_responsaveis_emails jsonb;
  v_arquivos_movidos integer := 0;
  v_atualizacoes_movidas integer := 0;
begin
  select * into v_proj
    from public.projeto
    where id = p_projeto_id and deleted_at is null;

  if v_proj.id is null then
    raise exception 'Projeto % nao encontrado', p_projeto_id;
  end if;

  if v_proj.oportunidade_origem_id is null then
    raise exception 'Projeto % nao tem oportunidade origem', p_projeto_id;
  end if;

  select * into v_op
    from public.oportunidade
    where id = v_proj.oportunidade_origem_id;

  if v_op.id is null then
    raise exception 'Oportunidade origem % nao encontrada (deletada?)',
      v_proj.oportunidade_origem_id;
  end if;

  -- Normaliza responsaveis_ids e etiquetas_ids pra array de verdade
  v_resp_ids  := public.jsonb_to_array(v_op.responsaveis_ids);
  v_etiquetas := public.jsonb_to_array(v_op.etiquetas_ids);

  -- Converte responsaveis_ids (uuids) em responsaveis_emails via lookup
  if public.jsonb_arr_len(v_resp_ids) > 0 then
    select coalesce(jsonb_agg(ue.usuario_email), '[]'::jsonb)
      into v_responsaveis_emails
      from public.usuario_empresa ue
      where ue.empresa_id = v_op.empresa_id
        and ue.id::text in (
          select jsonb_array_elements_text(v_resp_ids)
        );
  else
    v_responsaveis_emails := '[]'::jsonb;
  end if;

  -- UPDATE preenche campos vazios (coalesce-style)
  update public.projeto
     set
       descricao = case
         when (descricao is null or trim(descricao) = '') and v_op.descricao is not null
           then v_op.descricao else descricao end,
       observacoes = case
         when (observacoes is null or trim(observacoes) = '') and v_op.observacoes is not null
           then v_op.observacoes else observacoes end,
       probabilidade = case
         when probabilidade is null or probabilidade = 50
           then coalesce(v_op.probabilidade, probabilidade) else probabilidade end,
       data_fechamento_prevista = case
         when data_fechamento_prevista is null and v_op.data_fechamento_prevista is not null
           then v_op.data_fechamento_prevista else data_fechamento_prevista end,
       origem_id = case
         when origem_id is null and v_op.origem_id is not null
           then v_op.origem_id else origem_id end,
       origem_nome = case
         when (origem_nome is null or trim(origem_nome) = '') and v_op.origem_nome is not null
           then v_op.origem_nome else origem_nome end,
       responsaveis_emails = case
         when (responsaveis_emails is null
               or public.jsonb_arr_len(responsaveis_emails) = 0)
              and public.jsonb_arr_len(v_responsaveis_emails) > 0
           then v_responsaveis_emails else responsaveis_emails end,
       licitacao_modalidade = case
         when (licitacao_modalidade is null or trim(licitacao_modalidade) = '') and v_op.licitacao_modalidade is not null
           then v_op.licitacao_modalidade else licitacao_modalidade end,
       licitacao_data = case
         when licitacao_data is null and v_op.licitacao_data is not null
           then v_op.licitacao_data else licitacao_data end,
       licitacao_horario = case
         when (licitacao_horario is null or trim(licitacao_horario) = '') and v_op.licitacao_horario is not null
           then v_op.licitacao_horario else licitacao_horario end,
       numero = case
         when (numero is null or trim(numero) = '') and v_op.numero is not null
           then v_op.numero else numero end,
       complemento = case
         when (complemento is null or trim(complemento) = '') and v_op.complemento is not null
           then v_op.complemento else complemento end,
       bairro = case
         when (bairro is null or trim(bairro) = '') and v_op.bairro is not null
           then v_op.bairro else bairro end,
       cep = case
         when (cep is null or trim(cep) = '') and v_op.cep is not null
           then v_op.cep else cep end,
       endereco = case
         when (endereco is null or trim(endereco) = '') and v_op.endereco is not null
           then v_op.endereco else endereco end,
       cidade = case
         when (cidade is null or trim(cidade) = '') and v_op.cidade is not null
           then v_op.cidade else cidade end,
       estado = case
         when (estado is null or trim(estado) = '') and v_op.estado is not null
           then v_op.estado else estado end,
       etiquetas_ids = case
         when (etiquetas_ids is null
               or public.jsonb_arr_len(etiquetas_ids) = 0)
              and public.jsonb_arr_len(v_etiquetas) > 0
           then v_etiquetas else etiquetas_ids end,
       updated_at = now()
   where id = p_projeto_id;

  -- Move arquivos da oportunidade pro projeto
  begin
    update public.arquivo_oportunidade
       set projeto_id = p_projeto_id,
           oportunidade_id = null,
           updated_at = now()
     where oportunidade_id = v_proj.oportunidade_origem_id
       and projeto_id is null;
    get diagnostics v_arquivos_movidos = row_count;
  exception when undefined_table or undefined_column then
    v_arquivos_movidos := 0;
  end;

  -- Move timeline pro projeto
  begin
    update public.oportunidade_atualizacao
       set projeto_id = p_projeto_id,
           updated_at = now()
     where oportunidade_id = v_proj.oportunidade_origem_id
       and projeto_id is null;
    get diagnostics v_atualizacoes_movidas = row_count;
  exception when undefined_table or undefined_column then
    v_atualizacoes_movidas := 0;
  end;

  return jsonb_build_object(
    'projeto_id', p_projeto_id,
    'projeto_nome', v_proj.nome,
    'oportunidade_id', v_op.id,
    'oportunidade_nome', v_op.nome,
    'responsaveis_ids_tipo_origem', jsonb_typeof(v_op.responsaveis_ids),
    'etiquetas_ids_tipo_origem', jsonb_typeof(v_op.etiquetas_ids),
    'responsaveis_resolvidos', public.jsonb_arr_len(v_responsaveis_emails),
    'arquivos_movidos', v_arquivos_movidos,
    'atualizacoes_movidas', v_atualizacoes_movidas
  );
end;
$$;

grant execute on function public.sincronizar_projeto_com_oportunidade(uuid)
  to anon, authenticated;
grant execute on function public.jsonb_arr_len(jsonb)
  to anon, authenticated;
grant execute on function public.jsonb_to_array(jsonb)
  to anon, authenticated;
