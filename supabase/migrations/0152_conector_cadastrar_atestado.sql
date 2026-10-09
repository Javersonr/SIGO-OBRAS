-- ============================================================================
-- 0152_conector_cadastrar_atestado.sql — cadastro atômico de CAT/atestado pelo
-- conector do Claude (Plano 2 do conector, T10; spec 2026-09-25 §5)
--
-- Por quê: o Claude lê os PDFs de CAT/atestado no chat e grava o acervo pela
-- ferramenta cadastrar_atestado. Pela camada da empresa seriam vários INSERTs
-- soltos (profissional, atestado, quantitativos): uma falha no meio deixaria
-- um atestado sem quantitativos, e duas chamadas iguais seguidas (o Claude
-- repete quando a resposta demora) cadastrariam a mesma CAT duas vezes. Aqui
-- tudo vai numa transação, com trava consultiva por empresa e nº da CAT.
--
-- O que faz: public.conector_cadastrar_atestado(p_empresa_id, p_atestado,
-- p_quantitativos, p_profissional) → jsonb
--   1. nº normalizado: só dígitos e "/" ("CAT nº 3.239.747/2025" →
--      "3239747/2025"); sem nenhum dígito ("s/n") não há nº. O atestado sem
--      CAT (tipo 'atestado') não deduplica: cada contratante numera os seus.
--   2. com nº: pg_advisory_xact_lock(empresa + nº) e, se a empresa já tem
--      CAT/CAO/CAT profissional não excluída com o mesmo nº normalizado,
--      devolve {"ok":false,"motivo":"duplicado","atestado_id":…} sem gravar.
--   3. profissional (opcional): reaproveita o ativo da empresa com o mesmo
--      registro (só dígitos) ou com o mesmo nome sem acento (desde que o
--      registro não seja outro); senão cria (responsavel_tecnico false).
--   4. atestado com as colunas explícitas (empresa_id SEMPRE o do parâmetro,
--      nunca do jsonb) e ordem = maior ordem da empresa + 1.
--   5. quantitativos (1 a 200) com exatamente uma 'síntese' por categoria —
--      o TypeScript já garante; aqui é a última barreira.
--   6. devolve {"ok":true,"atestado_id","profissional_id",
--      "profissional_criado","quantitativos"}.
--
-- Só o servidor executa (o conector chama pela CamadaEmpresa, que injeta o
-- p_empresa_id da chave). Depende da 0149 (public.sem_acento). Idempotente.
-- ============================================================================

create or replace function public.conector_cadastrar_atestado(
  p_empresa_id uuid,
  p_atestado jsonb,
  p_quantitativos jsonb,
  p_profissional jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
  v_numero_norm text;
  v_existente uuid;
  v_prof_id uuid;
  v_prof_criado boolean := false;
  v_prof_nome text;
  v_prof_registro text;
  v_registro_dig text;
  v_nome_norm text;
  v_atestado_id uuid;
  v_qtd integer;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  -- ─── entrada (o TypeScript valida tudo; aqui só o que estragaria o cadastro) ───
  if p_empresa_id is null then
    raise exception 'p_empresa_id é obrigatório' using errcode = '22023';
  end if;
  if jsonb_typeof(p_atestado) is distinct from 'object' then
    raise exception 'p_atestado deve ser um objeto' using errcode = '22023';
  end if;
  v_tipo := p_atestado ->> 'tipo';
  if v_tipo is null or v_tipo not in ('cat', 'atestado', 'cao', 'cat_profissional') then
    raise exception 'Tipo de documento inválido: %', v_tipo using errcode = '22023';
  end if;
  if nullif(btrim(p_atestado ->> 'objeto'), '') is null then
    raise exception 'O objeto do atestado é obrigatório' using errcode = '22023';
  end if;
  if jsonb_typeof(p_quantitativos) is distinct from 'array' then
    raise exception 'p_quantitativos deve ser uma lista' using errcode = '22023';
  end if;
  if jsonb_array_length(p_quantitativos) not between 1 and 200 then
    raise exception 'Informe de 1 a 200 quantitativos' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_quantitativos) as e(q)
     where jsonb_typeof(e.q) is distinct from 'object'
        or nullif(btrim(e.q ->> 'descricao'), '') is null
  ) then
    raise exception 'Todo quantitativo precisa de descrição' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_quantitativos) as q(categoria text, observacao text)
     group by coalesce(nullif(btrim(q.categoria), ''), 'outro')
    having count(*) filter (where q.observacao = 'síntese') <> 1
  ) then
    raise exception 'Cada categoria precisa de exatamente uma linha de síntese' using errcode = '22023';
  end if;
  if p_profissional is not null and jsonb_typeof(p_profissional) not in ('object', 'null') then
    raise exception 'p_profissional deve ser um objeto' using errcode = '22023';
  end if;

  -- ─── 1 e 2. nº da CAT e duplicidade ───────────────────────────────────────
  if v_tipo <> 'atestado' then
    v_numero_norm := nullif(regexp_replace(coalesce(p_atestado ->> 'numero', ''), '[^0-9/]', '', 'g'), '');
    if v_numero_norm !~ '[0-9]' then
      v_numero_norm := null;
    end if;
  end if;
  if v_numero_norm is not null then
    perform pg_advisory_xact_lock(hashtext(p_empresa_id::text || ':cat:' || v_numero_norm));
    select a.id into v_existente
      from public.acervo_atestado a
     where a.empresa_id = p_empresa_id
       and a.deleted_at is null
       and a.tipo <> 'atestado'
       and regexp_replace(coalesce(a.numero, ''), '[^0-9/]', '', 'g') = v_numero_norm
     order by a.created_at, a.id
     limit 1;
    if v_existente is not null then
      return jsonb_build_object('ok', false, 'motivo', 'duplicado', 'atestado_id', v_existente);
    end if;
  end if;

  -- ─── 3. profissional ────────────────────────────────────────────────────────
  if jsonb_typeof(p_profissional) = 'object' then
    v_prof_nome := nullif(btrim(p_profissional ->> 'nome'), '');
    if v_prof_nome is null then
      raise exception 'O nome do profissional é obrigatório' using errcode = '22023';
    end if;
    v_prof_registro := nullif(btrim(p_profissional ->> 'registro'), '');
    v_registro_dig := regexp_replace(coalesce(v_prof_registro, ''), '\D', '', 'g');
    v_nome_norm := regexp_replace(btrim(public.sem_acento(v_prof_nome)), '\s+', ' ', 'g');
    -- o mesmo profissional em dois cadastros simultâneos não vira dois
    perform pg_advisory_xact_lock(hashtext(p_empresa_id::text || ':prof:' || v_nome_norm));

    select p.id into v_prof_id
      from public.acervo_profissional p
      cross join lateral (
        select regexp_replace(coalesce(p.registro, ''), '\D', '', 'g') as dig,
               regexp_replace(btrim(public.sem_acento(p.nome)), '\s+', ' ', 'g') as nome_norm
      ) x
     where p.empresa_id = p_empresa_id
       and p.deleted_at is null
       and p.ativo
       and (
         (v_registro_dig <> '' and x.dig = v_registro_dig)
         or (x.nome_norm = v_nome_norm and (v_registro_dig = '' or x.dig in ('', v_registro_dig)))
       )
     order by (v_registro_dig <> '' and x.dig = v_registro_dig) desc, p.created_at, p.id
     limit 1;

    if v_prof_id is null then
      insert into public.acervo_profissional (empresa_id, nome, registro, titulos, responsavel_tecnico, ativo)
      values (p_empresa_id, v_prof_nome, v_prof_registro, nullif(btrim(p_profissional ->> 'titulos'), ''), false, true)
      returning id into v_prof_id;
      v_prof_criado := true;
    end if;
  end if;

  -- ─── 4. atestado (colunas explícitas; empresa_id do parâmetro) ──────────────
  insert into public.acervo_atestado (
    empresa_id, tipo, numero, conselho, art_numero, contratante, contratante_cnpj, contrato,
    data_inicio, data_fim, objeto, cidade, uf, atividades, com_execucao, situacao,
    profissional_id, profissional_nome, empresa_executora, cobre_arts, riscos, observacoes, ordem
  )
  values (
    p_empresa_id,
    v_tipo,
    nullif(btrim(p_atestado ->> 'numero'), ''),
    nullif(btrim(p_atestado ->> 'conselho'), ''),
    nullif(btrim(p_atestado ->> 'art_numero'), ''),
    nullif(btrim(p_atestado ->> 'contratante'), ''),
    nullif(btrim(p_atestado ->> 'contratante_cnpj'), ''),
    nullif(btrim(p_atestado ->> 'contrato'), ''),
    (nullif(p_atestado ->> 'data_inicio', ''))::date,
    (nullif(p_atestado ->> 'data_fim', ''))::date,
    btrim(p_atestado ->> 'objeto'),
    nullif(btrim(p_atestado ->> 'cidade'), ''),
    nullif(upper(btrim(p_atestado ->> 'uf')), ''),
    case when jsonb_typeof(p_atestado -> 'atividades') = 'array' then p_atestado -> 'atividades' else '[]'::jsonb end,
    (p_atestado ->> 'com_execucao')::boolean,
    coalesce(nullif(p_atestado ->> 'situacao', ''), 'concluida'),
    v_prof_id,
    coalesce(nullif(btrim(p_atestado ->> 'profissional_nome'), ''), v_prof_nome),
    nullif(btrim(p_atestado ->> 'empresa_executora'), ''),
    case when jsonb_typeof(p_atestado -> 'cobre_arts') = 'array' then p_atestado -> 'cobre_arts' else '[]'::jsonb end,
    nullif(btrim(p_atestado ->> 'riscos'), ''),
    nullif(btrim(p_atestado ->> 'observacoes'), ''),
    (select coalesce(max(a.ordem), 0) + 1
       from public.acervo_atestado a
      where a.empresa_id = p_empresa_id and a.deleted_at is null)
  )
  returning id into v_atestado_id;

  -- ─── 5. quantitativos ───────────────────────────────────────────────────────
  insert into public.acervo_quantitativo (
    empresa_id, atestado_id, categoria, descricao, quantidade, unidade, especificacao,
    na_atividade_tecnica, observacao, ordem
  )
  select p_empresa_id,
         v_atestado_id,
         coalesce(nullif(btrim(q.categoria), ''), 'outro'),
         btrim(q.descricao),
         q.quantidade,
         nullif(btrim(q.unidade), ''),
         nullif(btrim(q.especificacao), ''),
         coalesce(q.na_atividade_tecnica, false),
         q.observacao,
         q.ordem
    from jsonb_to_recordset(p_quantitativos) as q(
      categoria text, descricao text, quantidade numeric, unidade text, especificacao text,
      na_atividade_tecnica boolean, observacao text, ordem int
    );
  get diagnostics v_qtd = row_count;

  return jsonb_build_object(
    'ok', true,
    'atestado_id', v_atestado_id,
    'profissional_id', v_prof_id,
    'profissional_criado', v_prof_criado,
    'quantitativos', v_qtd
  );
end;
$$;

revoke all on function public.conector_cadastrar_atestado(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.conector_cadastrar_atestado(uuid, jsonb, jsonb, jsonb) to service_role;

select 'ok' as res;
