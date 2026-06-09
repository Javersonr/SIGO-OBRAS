-- ============================================================================
-- 0054_compras_aprovacao_fix_notificacao.sql — corrige inserts de notificação
-- do motor de aprovação de Compras (migration 0028).
--
-- A 0028 escreveu nos INSERTs em public.notificacao usando nomes de coluna que
-- NÃO existem na tabela real (definida na 0013):
--   descricao             → na verdade é "mensagem"
--   link_destino          → na verdade é "link"
--   tipo='AprovacaoCompra'→ não está no CHECK notificacao_tipo_check
--                           (válidos: Cotação, Projeto, Compra, Financeiro,
--                            Estoque, Sistema, Inspeção, Manutenção, Fluxo)
--
-- plpgsql só valida nomes de coluna em RUNTIME, então a função foi criada sem
-- erro mas QUEBRA ao executar os INSERTs. Isso só dispara quando há
-- nivel_aprovacao configurado (notifica próximo nível / notifica o solicitante
-- na aprovação final). Nesse caso a transação inteira sofre rollback e a
-- aprovação FALHA. Empresas sem nível configurado pegam o caminho de bypass,
-- que não notifica, então o bug ficou escondido em produção.
--
-- Mesmo bug que a 0053 corrigiu no motor de Fluxos (0052). Aqui aplicamos a
-- mesma correção ao motor de Compras (0028).
--
-- Forward-only: a 0028 já está aplicada. Corrigimos por create-or-replace das
-- 2 funções que escrevem em notificacao, ajustando os 3 INSERTs:
--   descricao    → mensagem
--   link_destino → link
--   'AprovacaoCompra' → 'Compra'  (já válido no CHECK; não mexe na constraint)
-- O restante das funções é idêntico à 0028. Aditivo/não-destrutivo.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. aprovar_solicitacao_compra — colunas corretas (mensagem/link/tipo='Compra')
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

-- ────────────────────────────────────────────────────────────────────────────
-- 2. rejeitar_solicitacao_compra — colunas corretas (mensagem/link/tipo='Compra')
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

-- Sem re-grant: `create or replace function` preserva os privilégios já
-- concedidos na 0028 (anon, authenticated) — as assinaturas não mudaram.
-- Mesmo padrão da 0053.
