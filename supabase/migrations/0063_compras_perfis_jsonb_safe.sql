-- ============================================================================
-- 0063_compras_perfis_jsonb_safe.sql — perfis_aprovadores malformado quebrava
-- a aprovação de compras
--
-- DESCOBERTO PELO SMOKE da 0062: em produção, nivel_aprovacao.perfis_aprovadores
-- tem linhas gravadas como STRING jsonb ("Admin") em vez de ARRAY (["Admin"]) —
-- herança do import do Base44 (mesma família do bug de pre_lancamentos_ids).
-- Com isso, aprovar/rejeitar_solicitacao_compra estouravam em
-- jsonb_array_length(...): "cannot get array length of a scalar".
--
-- Fix em 2 níveis:
--   1. DADOS: normaliza as linhas existentes com o helper jsonb_to_array (0030).
--   2. CÓDIGO: as 2 funções normalizam perfis_aprovadores ao ler (à prova de
--      dado malformado futuro). Corpo = 0062 (prelude de identidade mantido)
--      + jsonb_to_array nos 3 pontos que assumiam array.
-- ============================================================================

-- 1. Normaliza os dados existentes ---------------------------------------------
update public.nivel_aprovacao
   set perfis_aprovadores = public.jsonb_to_array(perfis_aprovadores)
 where perfis_aprovadores is null
    or jsonb_typeof(perfis_aprovadores) <> 'array';

-- 2. aprovar_solicitacao_compra — leitura tolerante ----------------------------
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
  v_perfis_proximo jsonb;
  v_solicitante_email text;
  v_jwt_email text;
  v_perfil_real text;
begin
  -- identidade do token sobrepõe o que o cliente declarou (padrão 0061)
  v_jwt_email := public.current_user_email();
  if v_jwt_email is not null then
    p_aprovador_email := v_jwt_email;
    v_perfil_real := public.current_user_perfil();
    if v_perfil_real is null then
      raise exception 'Sem vínculo ativo nesta empresa';
    end if;
    p_aprovador_perfil := v_perfil_real;
  end if;

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

  select usuario_email into v_solicitante_email
    from public.usuario_empresa
    where id = v_sol.solicitante_id
    limit 1;

  if v_solicitante_email is not null
     and lower(v_solicitante_email) = lower(p_aprovador_email) then
    raise exception 'Solicitante não pode aprovar a própria solicitação';
  end if;

  v_nivel := public.encontrar_nivel_aprovacao(
    v_sol.empresa_id,
    coalesce(v_sol.valor_total_estimado, 0),
    coalesce(v_sol.nivel_aprovacao_atual, 1)
  );

  if v_nivel.id is null then
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

  -- normaliza (dado legado pode ser string jsonb em vez de array)
  v_perfis_aprovadores := public.jsonb_to_array(v_nivel.perfis_aprovadores);

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

  insert into public.aprovacao_solicitacao (
    empresa_id, solicitacao_id, status,
    aprovador_id, aprovador_nome, data_decisao, comentarios
  ) values (
    v_sol.empresa_id, p_solicitacao_id, 'Aprovado',
    null, p_aprovador_nome, now(),
    coalesce(p_comentario, 'Aprovado nível ' || v_nivel.ordem || ' (' || v_nivel.nome || ')')
  );

  v_proximo_nivel := public.encontrar_nivel_aprovacao(
    v_sol.empresa_id,
    coalesce(v_sol.valor_total_estimado, 0),
    v_nivel.ordem + 1
  );

  if v_proximo_nivel.id is not null then
    v_perfis_proximo := public.jsonb_to_array(v_proximo_nivel.perfis_aprovadores);

    update public.solicitacao_compra
       set nivel_aprovacao_atual = v_proximo_nivel.ordem,
           proximo_aprovador_perfis = v_perfis_proximo,
           updated_at = now()
     where id = p_solicitacao_id;

    insert into public.notificacao (
      empresa_id, tipo, titulo, mensagem, usuario_email,
      lida, link
    )
    select v_sol.empresa_id,
           'Compra',
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
            select jsonb_array_elements_text(v_perfis_proximo)
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

  update public.solicitacao_compra
     set status = 'Aprovada',
         data_aprovacao_final = now(),
         aprovador_final_email = p_aprovador_email,
         aprovador_final_nome = p_aprovador_nome,
         proximo_aprovador_perfis = null,
         updated_at = now()
   where id = p_solicitacao_id;

  if v_solicitante_email is not null then
    insert into public.notificacao (
      empresa_id, tipo, titulo, mensagem, usuario_email,
      lida, link
    ) values (
      v_sol.empresa_id,
      'Compra',
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

-- 3. rejeitar_solicitacao_compra — leitura tolerante ----------------------------
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
  v_perfis jsonb;
  v_solicitante_email text;
  v_jwt_email text;
  v_perfil_real text;
begin
  -- identidade do token sobrepõe o que o cliente declarou (padrão 0061)
  v_jwt_email := public.current_user_email();
  if v_jwt_email is not null then
    p_aprovador_email := v_jwt_email;
    v_perfil_real := public.current_user_perfil();
    if v_perfil_real is null then
      raise exception 'Sem vínculo ativo nesta empresa';
    end if;
    p_aprovador_perfil := v_perfil_real;
  end if;

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

  v_nivel := public.encontrar_nivel_aprovacao(
    v_sol.empresa_id,
    coalesce(v_sol.valor_total_estimado, 0),
    coalesce(v_sol.nivel_aprovacao_atual, 1)
  );

  if v_nivel.id is not null and p_aprovador_perfil <> 'Admin' then
    v_perfis := public.jsonb_to_array(v_nivel.perfis_aprovadores);
    if not (
      (v_perfis ? p_aprovador_perfil)
      or jsonb_array_length(v_perfis) = 0
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
      empresa_id, tipo, titulo, mensagem, usuario_email,
      lida, link
    ) values (
      v_sol.empresa_id,
      'Compra',
      'Sua solicitação ' || coalesce(v_sol.numero, p_solicitacao_id::text) || ' foi REJEITADA',
      'Motivo: ' || p_motivo || ' • Por: ' || p_aprovador_nome,
      v_solicitante_email,
      false,
      '/Compras?solicitacao=' || p_solicitacao_id::text
    );
  end if;
end;
$$;

-- Grants preservados pelo create or replace (0056 já removeu anon).
