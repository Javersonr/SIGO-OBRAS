-- ============================================================================
-- 0029 — sincronizar_projeto_com_oportunidade
-- ============================================================================
-- Necessario porque entre 28/05 e o commit 5e500c0 a funcao
-- handleMigrarParaProjeto so copiava 14 dos ~25 campos perservaveis da
-- Oportunidade. Projetos migrados antes desse fix ficaram sem descricao,
-- observacoes, probabilidade, data_fechamento_prevista, origem, licitacao,
-- endereco completo, etc.
--
-- Esta funcao re-aplica a copia de forma idempotente:
--   - So preenche campo do projeto se ele estiver null/vazio
--   - Nao sobrescreve dados ja editados manualmente no projeto
--   - Re-vincula arquivos da oportunidade ao projeto
--   - Re-vincula atualizacoes (timeline) ao projeto
--   - Retorna jsonb com o que foi atualizado pra UI mostrar feedback
--
-- Uso:
--   select * from sincronizar_projeto_com_oportunidade(
--     'uuid-do-projeto'::uuid
--   );
-- ============================================================================

create or replace function public.sincronizar_projeto_com_oportunidade(
  p_projeto_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_proj public.projeto%rowtype;
  v_op public.oportunidade%rowtype;
  v_responsaveis_emails jsonb;
  v_campos_atualizados text[] := array[]::text[];
  v_arquivos_movidos integer := 0;
  v_atualizacoes_movidas integer := 0;
begin
  -- 1. Carrega projeto + valida que tem oportunidade origem
  select * into v_proj
    from public.projeto
    where id = p_projeto_id and deleted_at is null;

  if v_proj.id is null then
    raise exception 'Projeto % nao encontrado', p_projeto_id;
  end if;

  if v_proj.oportunidade_origem_id is null then
    raise exception 'Projeto % nao tem oportunidade origem (oportunidade_origem_id e null)', p_projeto_id;
  end if;

  -- 2. Carrega oportunidade origem
  select * into v_op
    from public.oportunidade
    where id = v_proj.oportunidade_origem_id;

  if v_op.id is null then
    raise exception 'Oportunidade origem % nao encontrada (provavelmente foi deletada)', v_proj.oportunidade_origem_id;
  end if;

  -- 3. Converte responsaveis_ids (uuids) da Oportunidade pra
  --    responsaveis_emails do Projeto via usuario_empresa
  if jsonb_array_length(coalesce(v_op.responsaveis_ids, '[]'::jsonb)) > 0 then
    select coalesce(jsonb_agg(ue.usuario_email), '[]'::jsonb)
      into v_responsaveis_emails
      from public.usuario_empresa ue
      where ue.empresa_id = v_op.empresa_id
        and ue.id in (
          select (jsonb_array_elements_text(v_op.responsaveis_ids))::uuid
        );
  else
    v_responsaveis_emails := '[]'::jsonb;
  end if;

  -- 4. UPDATE do projeto usando coalesce — so preenche se estiver vazio.
  --    Cada coluna que muda incrementa v_campos_atualizados.
  update public.projeto
     set
       descricao = case
         when (descricao is null or trim(descricao) = '') and v_op.descricao is not null
           then v_op.descricao else descricao end,
       observacoes = case
         when (observacoes is null or trim(observacoes) = '') and v_op.observacoes is not null
           then v_op.observacoes else observacoes end,
       probabilidade = case
         when probabilidade is null or probabilidade = 50  -- 50 = default da tabela
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
               or responsaveis_emails = '[]'::jsonb
               or jsonb_array_length(responsaveis_emails) = 0)
              and jsonb_array_length(v_responsaveis_emails) > 0
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
               or etiquetas_ids = '[]'::jsonb
               or jsonb_array_length(etiquetas_ids) = 0)
              and jsonb_array_length(coalesce(v_op.etiquetas_ids, '[]'::jsonb)) > 0
           then v_op.etiquetas_ids else etiquetas_ids end,
       updated_at = now()
   where id = p_projeto_id
   returning
     -- Coleta nomes dos campos que mudaram
     array_remove(array[
       case when descricao = v_op.descricao and v_proj.descricao is distinct from v_op.descricao then 'descricao' end,
       case when observacoes = v_op.observacoes and v_proj.observacoes is distinct from v_op.observacoes then 'observacoes' end,
       case when probabilidade = v_op.probabilidade and v_proj.probabilidade is distinct from v_op.probabilidade then 'probabilidade' end,
       case when data_fechamento_prevista = v_op.data_fechamento_prevista and v_proj.data_fechamento_prevista is distinct from v_op.data_fechamento_prevista then 'data_fechamento_prevista' end,
       case when origem_id = v_op.origem_id and v_proj.origem_id is distinct from v_op.origem_id then 'origem_id' end,
       case when origem_nome = v_op.origem_nome and v_proj.origem_nome is distinct from v_op.origem_nome then 'origem_nome' end,
       case when responsaveis_emails = v_responsaveis_emails and v_proj.responsaveis_emails is distinct from v_responsaveis_emails then 'responsaveis_emails' end,
       case when licitacao_modalidade = v_op.licitacao_modalidade and v_proj.licitacao_modalidade is distinct from v_op.licitacao_modalidade then 'licitacao_modalidade' end,
       case when licitacao_data = v_op.licitacao_data and v_proj.licitacao_data is distinct from v_op.licitacao_data then 'licitacao_data' end,
       case when licitacao_horario = v_op.licitacao_horario and v_proj.licitacao_horario is distinct from v_op.licitacao_horario then 'licitacao_horario' end,
       case when numero = v_op.numero and v_proj.numero is distinct from v_op.numero then 'numero' end,
       case when complemento = v_op.complemento and v_proj.complemento is distinct from v_op.complemento then 'complemento' end,
       case when bairro = v_op.bairro and v_proj.bairro is distinct from v_op.bairro then 'bairro' end,
       case when cep = v_op.cep and v_proj.cep is distinct from v_op.cep then 'cep' end,
       case when endereco = v_op.endereco and v_proj.endereco is distinct from v_op.endereco then 'endereco' end,
       case when cidade = v_op.cidade and v_proj.cidade is distinct from v_op.cidade then 'cidade' end,
       case when estado = v_op.estado and v_proj.estado is distinct from v_op.estado then 'estado' end,
       case when etiquetas_ids = v_op.etiquetas_ids and v_proj.etiquetas_ids is distinct from v_op.etiquetas_ids then 'etiquetas_ids' end
     ], null)
   into v_campos_atualizados;

  -- 5. Re-vincula arquivos da oportunidade ao projeto.
  --    Se ainda existem registros em arquivo_oportunidade com oportunidade_id
  --    apontando pra origem, e projeto_id null, levamos pro projeto.
  begin
    update public.arquivo_oportunidade
       set projeto_id = p_projeto_id,
           oportunidade_id = null,
           updated_at = now()
     where oportunidade_id = v_proj.oportunidade_origem_id
       and projeto_id is null;
    get diagnostics v_arquivos_movidos = row_count;
  exception when undefined_table or undefined_column then
    -- Tabela pode nao existir no schema atual; tudo bem, ignora.
    v_arquivos_movidos := 0;
  end;

  -- 6. Re-vincula timeline / atualizacoes
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

  -- 7. Retorna resumo
  return jsonb_build_object(
    'projeto_id', p_projeto_id,
    'projeto_nome', v_proj.nome,
    'oportunidade_id', v_op.id,
    'oportunidade_nome', v_op.nome,
    'campos_atualizados', coalesce(to_jsonb(v_campos_atualizados), '[]'::jsonb),
    'arquivos_movidos', v_arquivos_movidos,
    'atualizacoes_movidas', v_atualizacoes_movidas
  );
end;
$$;

grant execute on function public.sincronizar_projeto_com_oportunidade(uuid)
  to anon, authenticated;
