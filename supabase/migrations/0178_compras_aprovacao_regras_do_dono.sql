-- ============================================================================
-- 0178 — Lote 2b-1 (F-06, varredura nov/2026): aprovação de compras só pelas RPCs,
-- com as regras do dono de 23/11
--
-- REGRAS DO DONO (23/11):
--   1. Quem pede uma compra NÃO aprova a própria solicitação, salvo se for
--      administrador (perfil Admin ou Admin Holding, ou super admin).
--   2. Solicitação já aprovada não pode ter itens alterados: alterar item
--      (quantidade, valor, incluir, excluir) faz a solicitação voltar para
--      "Pendente Aprovação" (nível 1, sem aprovador final). Solicitação PENDENTE,
--      em qualquer nível, pode ter item ajustado sem mudar de nível: o aprovador
--      ajusta as quantidades antes de aprovar (AprovacaoModal.jsx:195-202) — revisão
--      2b-1, achado 17; recomeçar do nível 1 nesse caso é dúvida do dono.
--   3. Se o valor não cair em nenhuma faixa de aprovação configurada, só o
--      administrador aprova. A faixa é procurada como hoje (encontrar_nivel_aprovacao,
--      só na ordem atual): valor coberto por faixa de OUTRA ordem, ou por faixa com
--      ordem 0, também cai em "só administrador" — falha para o lado seguro (o Admin
--      aprova). Empresa SEM nenhuma faixa segue como hoje (qualquer perfil aprova)
--      até o dono responder: ponto único c_regra3_vale_sem_faixas em aprovar.
--   Suposições em aberto, cada uma num ponto único comentado: dono (is_owner) sem
--   perfil Admin não é administrador (usuario_eh_administrador); "Pedido Gerado"
--   também volta a pendente (c_aprovados no trigger dos itens); Admin Holding pula a
--   lista de perfis do nível (compras_administrador_pula_lista_do_nivel).
--   Consequência lógica: como 1 e 3 dão poder ao administrador, a tabela de alçadas
--   (nivel_aprovacao) só é gravada pelo administrador; senão a regra se contorna
--   pela API (regra_aprovacao e gestor_aprovacao foram dropadas na 0017).
--
-- FUROS QUE ISTO FECHA:
--   * solicitacao_compra tinha a policy da empresa FOR ALL: qualquer usuário fazia
--     `update ... set status = 'Aprovada'` direto, criava já "Aprovada" ou com
--     nivel_aprovacao_atual = 99 (a RPC tratava como "sem nível" e aprovava);
--   * revisão, achado 1: a trava "quem pede não aprova" NÃO funcionava: a tela grava
--     solicitante_id = user.id (Compras.jsx:269, Projetos.jsx:1725,
--     ReservarItensOrcamentoModal.jsx:138), que é o id de usuario_custom
--     (login-custom/index.ts:143-146 e 324-326), e a RPC procurava esse id em
--     usuario_empresa — não achava, não travava e o solicitante nunca recebia o
--     aviso de aprovada/rejeitada. Agora: (a) todo INSERT feito pela API grava
--     created_by = auth.uid() (o autor real, do JWT) e ninguém o muda depois; (b) a
--     RPC acha o solicitante por created_by e por solicitante_id em usuario_custom
--     e em usuario_empresa (id ou usuario_id);
--   * revisão, achado 2: a coluna solicitante_email EXISTE (0084:17-18, enviada por
--     Compras.jsx:271 e Projetos.jsx:1727); esta migração não a usa para decidir
--     nada (é texto do cliente);
--   * revisão, achado 8: sem faixa para o valor, qualquer perfil aprovava (regra 3);
--     o valor podia ser baixado depois do nível 1 (regra 2: mexer no item volta a
--     pendente); o INSERT aceitava qualquer valor_total_estimado (agora nasce 0 e
--     vem só dos itens); "Rejeitada" → "Pendente Aprovação" mantinha o nível (agora
--     volta ao nível 1).
--
-- QUEM USA HOJE (levantado no código):
--   * criação sempre "Pendente Aprovação": Compras.jsx:264, Projetos.jsx:1720,
--     ReservarItensOrcamentoModal.jsx:133, SolicitacaoEPIModal.jsx:126;
--   * status direto pela tela, sempre dentro do grupo aprovado ou "Cancelada":
--     CotacaoModal.jsx:281, ComparacaoPrecos.jsx:413, Compras.jsx:385/566/330,
--     exclusão lógica Compras.jsx:443 e AprovacaoModal.jsx:345;
--     gerar_pedido_direto (0070, invoker): "Aprovada" → "Pedido Gerado";
--   * itens: AprovacaoModal.jsx:199 (quantidade, ANTES de aprovar),
--     AprovacaoModal.jsx:340 e Compras.jsx:439/450 (excluir itens), criação em
--     Compras.jsx:281, Projetos.jsx:1741, ReservarItensOrcamentoModal.jsx:162,
--     SolicitacaoEPIModal.jsx:138; valor só pelo trigger trg_sync_total_solicitacao;
--   * aprovação: AprovacaoModal.jsx:211-230 (RPCs);
--   * alçadas: só configuracoes/AprovacaoConfigTab.jsx:85-95 (aba "Aprovações",
--     só para perfil Admin, Configuracoes.jsx:1040/1075).
--
-- O QUE MUDA PARA O USUÁRIO (detalhe em LOTE2-banco.md):
--   * quem não é administrador e tenta aprovar/rejeitar a própria solicitação
--     recebe "Solicitante não pode aprovar a própria solicitação" (a tela já
--     esconde os botões para o solicitante: AprovacaoModal.jsx:72-75 e 288-291 —
--     inclusive para o Admin, então a exceção da regra 1 só vale pela tela depois
--     de ajustar essa condição no front);
--   * o solicitante passa a receber as notificações "foi APROVADA/REJEITADA";
--   * excluir ou mudar item de solicitação aprovada (Compras.jsx:450,
--     AprovacaoModal.jsx:340) devolve a solicitação para "Pendente Aprovação";
--   * valor fora de todas as faixas: perfil comum recebe "Nenhuma faixa de
--     aprovação cobre R$ ...: só o administrador aprova";
--   * Admin Holding passa a contar como administrador na aprovação (antes só Admin);
--   * super admin sem vínculo na empresa passa a poder aprovar (antes: "Sem vínculo"),
--     em QUALQUER empresa (exigir_empresa_do_chamador deixa o super admin passar,
--     0110:57-59) — revisão 2b-1, achado 20; a confirmar com o dono;
--   * token de usuário sem e-mail é recusado ("login sem e-mail"; o login do SIGO
--     sempre tem e-mail) em vez de cair no ramo do servidor (revisão 2b-1, achado 8);
--   * item que aponta para solicitação de outra empresa é recusado (trigger
--     referencias_da_empresa da 0118; nenhuma tela faz isso: todas gravam o item da
--     solicitação que acabaram de criar, com empresaAtiva.id).
--
-- FORA (sem resposta do dono): restringir fluxo_template/fluxo_etapa_template ao
-- Admin; perfil_permissao só super admin (hoje só a SaasAdmin grava:
-- saas/PermissoesTab.jsx:195-223, aberta em SaasAdmin.jsx:1170, página só de super
-- admin — fica como está); pedido só a partir de cotação aprovada.
--
-- Deploy: depois da 0176 (usa usuario_eh_administrador; recria igual se faltar).
--   supabase db query --linked -f supabase/migrations/0178_compras_aprovacao_regras_do_dono.sql
-- Teste: tools/smoke-lote2-j-compras-aprovacao.sql (termina em ROLLBACK).
-- O smoke antigo tools/smoke-compras-aprovacao.sql continua passando (RPCs como
-- servidor; o passo 7 dele segue barrado porque, sem JWT, a exceção do
-- administrador não vale).
-- ============================================================================

begin;
-- Se der "canceling statement due to lock timeout" (tabela ocupada), é só rodar de novo.
set local lock_timeout = '10s';

-- 0. administrador (igual à 0176; idempotente) ---------------------------------
create or replace function public.usuario_eh_administrador()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return true;
  end if;
  if auth.uid() is null or coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    return false;
  end if;
  -- SUPOSIÇÃO (dúvida em aberto do dono, ponto único): administrador = perfil Admin ou
  -- Admin Holding; o dono da conta (is_owner) com outro perfil NÃO conta. Para contar,
  -- acrescente "or ue.is_owner is true" abaixo. ativo nulo = ativo, como em
  -- current_user_perfil(), na RLS e no front (Layout.jsx:578).
  return exists (
    select 1
      from public.usuario_empresa ue
     where lower(ue.usuario_email) = public.current_user_email()
       and ue.empresa_id = public.current_empresa_id()
       and coalesce(ue.ativo, true) = true
       and ue.deleted_at is null
       and ue.perfil in ('Admin', 'Admin Holding')
  );
end;
$$;
revoke all on function public.usuario_eh_administrador() from public, anon, authenticated;
grant execute on function public.usuario_eh_administrador() to authenticated, service_role;

-- 1. e-mail de quem pediu (achado 1) --------------------------------------------
-- SECURITY DEFINER: usuario_custom é só do servidor (0117). Só usada pelas RPCs.
create or replace function public.solicitacao_compra_email_solicitante(
  p_empresa_id uuid,
  p_solicitante_id uuid,
  p_created_by uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select uc.email from public.usuario_custom uc
      where p_created_by is not null and uc.auth_user_id = p_created_by
      limit 1),
    (select uc.email from public.usuario_custom uc
      where p_solicitante_id is not null and uc.id = p_solicitante_id
      limit 1),
    (select ue.usuario_email from public.usuario_empresa ue
      where p_solicitante_id is not null
        and ue.empresa_id = p_empresa_id
        and (ue.id = p_solicitante_id or ue.usuario_id = p_solicitante_id)
      order by ue.created_at
      limit 1)
  );
$$;
revoke all on function public.solicitacao_compra_email_solicitante(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.solicitacao_compra_email_solicitante(uuid, uuid, uuid) to service_role;

-- 1b. quem pula a lista de perfis do nível ---------------------------------------
-- SUPOSIÇÃO (dúvida em aberto do dono, PONTO ÚNICO): todo administrador (Admin, Admin
-- Holding, super admin) pula a lista de perfis do nível, como o "Admin" já pulava
-- (0063). Se o dono disser que o Admin Holding NÃO pula, troque o corpo por
--   select coalesce(p_perfil, '') = 'Admin' or public.current_user_is_super_admin();
create or replace function public.compras_administrador_pula_lista_do_nivel(p_perfil text, p_admin boolean)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_admin, false) or coalesce(p_perfil, '') = 'Admin';
$$;
revoke all on function public.compras_administrador_pula_lista_do_nivel(text, boolean) from public, anon, authenticated;
grant execute on function public.compras_administrador_pula_lista_do_nivel(text, boolean) to service_role;

-- 2a. aprovar_solicitacao_compra: SECURITY DEFINER + regras 1 e 3 ----------------
create or replace function public.aprovar_solicitacao_compra(
  p_solicitacao_id uuid,
  p_aprovador_email text,
  p_aprovador_nome text,
  p_aprovador_perfil text,
  p_comentario text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol public.solicitacao_compra%rowtype;
  v_nivel public.nivel_aprovacao%rowtype;
  v_proximo_nivel public.nivel_aprovacao%rowtype;
  v_perfis_aprovadores jsonb;
  v_perfis_proximo jsonb;
  -- SUPOSIÇÃO (dúvida em aberto do dono, PONTO ÚNICO): empresa SEM nenhuma faixa de
  -- SolicitacaoCompra continua como hoje (qualquer perfil aprova). Se o dono disser que
  -- a regra 3 vale também para ela, troque para true.
  c_regra3_vale_sem_faixas constant boolean := false;
  v_solicitante_email text;
  v_jwt_email text;
  v_perfil_real text;
  v_admin boolean;
  v_proprio boolean;
  v_servidor boolean := public.chamador_eh_servidor();
begin
  -- identidade do token sobrepõe o que o cliente declarou (padrão 0061)
  -- o ramo é decidido por chamador_eh_servidor() (0110), não pela falta de e-mail:
  -- token de usuário sem e-mail não vira "servidor" (revisão 2b-1, achado 8)
  v_jwt_email := public.current_user_email();
  if not v_servidor then
    if v_jwt_email is null then
      raise exception 'Acesso negado: login sem e-mail' using errcode = '42501';
    end if;
    p_aprovador_email := v_jwt_email;
    v_perfil_real := public.current_user_perfil();
    -- super admin é administrador mesmo sem vínculo nesta empresa (regra 1 do dono)
    if v_perfil_real is null and not public.current_user_is_super_admin() then
      raise exception 'Sem vínculo ativo nesta empresa';
    end if;
    p_aprovador_perfil := coalesce(v_perfil_real, 'Super Admin');
    v_admin := public.usuario_eh_administrador();
  else
    -- servidor (sem JWT): perfil declarado, como antes
    v_admin := coalesce(p_aprovador_perfil, '') in ('Admin', 'Admin Holding');
  end if;

  select * into v_sol
    from public.solicitacao_compra
    where id = p_solicitacao_id and deleted_at is null
    for update;

  if v_sol.id is null then
    raise exception 'Solicitação não encontrada';
  end if;

  -- definer não passa pela RLS: a solicitação tem de ser da empresa do token
  perform public.exigir_empresa_do_chamador(v_sol.empresa_id, 'solicitação');

  if v_sol.status not in ('Pendente Aprovação') then
    raise exception 'Solicitação não está pendente (status atual: %)', v_sol.status;
  end if;

  -- regra 1: quem pediu não aprova, salvo administrador (só com JWT: o perfil
  -- declarado pelo servidor não libera a própria aprovação)
  v_solicitante_email := public.solicitacao_compra_email_solicitante(
    v_sol.empresa_id, v_sol.solicitante_id, v_sol.created_by);
  v_proprio := (v_sol.created_by is not null and v_sol.created_by = auth.uid())
            or (v_solicitante_email is not null and lower(v_solicitante_email) = lower(p_aprovador_email));
  if v_proprio and (v_servidor or not v_admin) then
    raise exception 'Solicitante não pode aprovar a própria solicitação (só o administrador pode)';
  end if;

  v_nivel := public.encontrar_nivel_aprovacao(
    v_sol.empresa_id,
    coalesce(v_sol.valor_total_estimado, 0),
    coalesce(v_sol.nivel_aprovacao_atual, 1)
  );

  if v_nivel.id is null then
    -- regra 3: nenhuma faixa cobre o valor → só administrador. A faixa é procurada como
    -- o sistema faz hoje (encontrar_nivel_aprovacao: só a ordem ATUAL). Valor coberto
    -- por faixa de OUTRA ordem, ou por faixa gravada com ordem 0
    -- (AprovacaoConfigTab.jsx:78), também cai aqui: falha para o lado seguro (o
    -- administrador aprova).
    if not v_admin and (c_regra3_vale_sem_faixas or exists (
      select 1 from public.nivel_aprovacao n
       where n.empresa_id = v_sol.empresa_id
         and n.tipo = 'SolicitacaoCompra'
         and n.deleted_at is null
    )) then
      raise exception 'Nenhuma faixa de aprovação cobre R$ %: só o administrador aprova',
        coalesce(v_sol.valor_total_estimado, 0);
    end if;

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

    if v_solicitante_email is not null then
      insert into public.notificacao (empresa_id, tipo, titulo, mensagem, usuario_email, lida, link)
      values (
        v_sol.empresa_id, 'Compra',
        'Sua solicitação ' || coalesce(v_sol.numero, p_solicitacao_id::text) || ' foi APROVADA',
        'Aprovador final: ' || p_aprovador_nome,
        v_solicitante_email, false,
        '/Compras?solicitacao=' || p_solicitacao_id::text
      );
    end if;

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
    or public.compras_administrador_pula_lista_do_nivel(p_aprovador_perfil, v_admin)
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
        and coalesce(ue.ativo, true) = true   -- ativo nulo = ativo (revisão 2b-1, achado 21)
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

revoke all on function public.aprovar_solicitacao_compra(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.aprovar_solicitacao_compra(uuid, text, text, text, text)
  to authenticated, service_role;

-- 2b. rejeitar_solicitacao_compra: SECURITY DEFINER + regra 1 --------------------
create or replace function public.rejeitar_solicitacao_compra(
  p_solicitacao_id uuid,
  p_aprovador_email text,
  p_aprovador_nome text,
  p_aprovador_perfil text,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol public.solicitacao_compra%rowtype;
  v_nivel public.nivel_aprovacao%rowtype;
  v_perfis jsonb;
  v_solicitante_email text;
  v_jwt_email text;
  v_perfil_real text;
  v_admin boolean;
  v_proprio boolean;
  v_servidor boolean := public.chamador_eh_servidor();
begin
  -- identidade do token sobrepõe o que o cliente declarou (padrão 0061)
  -- o ramo é decidido por chamador_eh_servidor() (0110), não pela falta de e-mail:
  -- token de usuário sem e-mail não vira "servidor" (revisão 2b-1, achado 8)
  v_jwt_email := public.current_user_email();
  if not v_servidor then
    if v_jwt_email is null then
      raise exception 'Acesso negado: login sem e-mail' using errcode = '42501';
    end if;
    p_aprovador_email := v_jwt_email;
    v_perfil_real := public.current_user_perfil();
    -- super admin é administrador mesmo sem vínculo nesta empresa (regra 1 do dono)
    if v_perfil_real is null and not public.current_user_is_super_admin() then
      raise exception 'Sem vínculo ativo nesta empresa';
    end if;
    p_aprovador_perfil := coalesce(v_perfil_real, 'Super Admin');
    v_admin := public.usuario_eh_administrador();
  else
    v_admin := coalesce(p_aprovador_perfil, '') in ('Admin', 'Admin Holding');
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

  perform public.exigir_empresa_do_chamador(v_sol.empresa_id, 'solicitação');

  if v_sol.status <> 'Pendente Aprovação' then
    raise exception 'Solicitação não está pendente (status: %)', v_sol.status;
  end if;

  v_solicitante_email := public.solicitacao_compra_email_solicitante(
    v_sol.empresa_id, v_sol.solicitante_id, v_sol.created_by);
  v_proprio := (v_sol.created_by is not null and v_sol.created_by = auth.uid())
            or (v_solicitante_email is not null and lower(v_solicitante_email) = lower(p_aprovador_email));
  if v_proprio and (v_servidor or not v_admin) then
    raise exception 'Solicitante não pode rejeitar a própria solicitação (só o administrador pode)';
  end if;

  v_nivel := public.encontrar_nivel_aprovacao(
    v_sol.empresa_id,
    coalesce(v_sol.valor_total_estimado, 0),
    coalesce(v_sol.nivel_aprovacao_atual, 1)
  );

  if v_nivel.id is not null and not public.compras_administrador_pula_lista_do_nivel(p_aprovador_perfil, v_admin) then
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

revoke all on function public.rejeitar_solicitacao_compra(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.rejeitar_solicitacao_compra(uuid, text, text, text, text)
  to authenticated, service_role;

-- 3. status, autor e campos de aprovação só pelas RPCs --------------------------
-- Não é SECURITY DEFINER de propósito: precisa ver o papel de quem grava
-- (current_user). Dentro das RPCs definer (e do trigger de itens, também definer)
-- o papel é o dono da função; pela API é authenticated (ou anon). Só chama
-- current_user_is_super_admin() e auth.uid(), que authenticated executa.
create or replace function public.solicitacao_compra_aprovacao_so_por_rpc()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- grupo "aprovada": só uma RPC (ou o servidor) faz a solicitação ENTRAR nele
  aprovados constant text[] := array['Aprovada', 'Em Cotação', 'Cotação Aprovada', 'Pedido Gerado'];
  -- campos que só a aprovação grava (to_jsonb: coluna ausente vira null dos dois lados)
  campos constant text[] := array[
    'data_aprovacao_final', 'aprovador_final_email', 'aprovador_final_nome',
    'nivel_aprovacao_atual', 'proximo_aprovador_perfis', 'valor_total_aprovado',
    'proximo_aprovador_id', 'proximo_aprovador_nome', 'proximo_aprovador_email'
  ];
  v_novo jsonb := to_jsonb(new);
  v_velho jsonb;
  c text;
begin
  -- achado 1: o autor de toda solicitação criada pela API é o do token (inclusive o
  -- super admin, que pula as demais travas)
  if tg_op = 'INSERT' and current_user::text = 'authenticated' and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;

  if current_user::text not in ('authenticated', 'anon') or public.current_user_is_super_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = any (aprovados) then
      raise exception 'Acesso negado: a solicitação de compra nasce pendente; a aprovação é pela tela de aprovação'
        using errcode = '42501';
    end if;
    foreach c in array campos loop
      if c = 'nivel_aprovacao_atual' then
        if coalesce((v_novo ->> c)::integer, 1) <> 1 then
          raise exception 'Acesso negado: a solicitação de compra nasce no nível 1 de aprovação'
            using errcode = '42501';
        end if;
      elsif jsonb_typeof(v_novo -> c) is not null and jsonb_typeof(v_novo -> c) <> 'null' then
        raise exception 'Acesso negado: o campo % da solicitação de compra é gravado pela aprovação', c
          using errcode = '42501';
      end if;
    end loop;
    -- achado 8: o valor vem só dos itens
    new.valor_total_estimado := 0;
    return new;
  end if;

  v_velho := to_jsonb(old);

  if new.created_by is distinct from old.created_by then
    raise exception 'Acesso negado: o autor da solicitação de compra não muda'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and new.status = any (aprovados)
     and not (coalesce(old.status, '') = any (aprovados)) then
    raise exception 'Acesso negado: só a tela de aprovação muda a solicitação de "%" para "%"',
      old.status, new.status
      using errcode = '42501';
  end if;

  foreach c in array campos loop
    if (v_novo -> c) is distinct from (v_velho -> c) then
      raise exception 'Acesso negado: o campo % da solicitação de compra é gravado pela aprovação', c
        using errcode = '42501';
    end if;
  end loop;

  -- o valor estimado vem dos itens (trigger trg_sync_total_solicitacao, que roda
  -- dentro de outro trigger: pg_trigger_depth() > 1)
  if (v_novo -> 'valor_total_estimado') is distinct from (v_velho -> 'valor_total_estimado')
     and pg_trigger_depth() <= 1 then
    raise exception 'Acesso negado: o valor estimado da solicitação vem dos itens'
      using errcode = '42501';
  end if;

  -- voltar para pendente recomeça a aprovação do nível 1 (achado 8)
  if new.status = 'Pendente Aprovação' and old.status is distinct from 'Pendente Aprovação' then
    new.nivel_aprovacao_atual := 1;
    new.proximo_aprovador_perfis := null;
    new.data_aprovacao_final := null;
    new.aprovador_final_email := null;
    new.aprovador_final_nome := null;
  end if;

  return new;
end;
$$;

revoke all on function public.solicitacao_compra_aprovacao_so_por_rpc() from public, anon;
grant execute on function public.solicitacao_compra_aprovacao_so_por_rpc() to authenticated, service_role;

drop trigger if exists solicitacao_compra_aprovacao_so_por_rpc on public.solicitacao_compra;
create trigger solicitacao_compra_aprovacao_so_por_rpc
  before insert or update on public.solicitacao_compra
  for each row execute function public.solicitacao_compra_aprovacao_so_por_rpc();

-- 4. regra 2: mexeu no item de solicitação aprovada → volta para pendente -------
-- SECURITY DEFINER: o UPDATE da solicitação mexe em campos que só a aprovação grava
-- (o trigger acima deixa passar o dono da função). Vale para qualquer autor.
create or replace function public.solicitacao_compra_item_volta_pendente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_empresas uuid[];
  -- SUPOSIÇÃO (dúvida em aberto do dono, PONTO ÚNICO): "Pedido Gerado" também volta a
  -- pendente (o pedido já emitido NÃO é cancelado). Para não voltar, tire-o da lista.
  c_aprovados constant text[] := array['Aprovada', 'Em Cotação', 'Cotação Aprovada', 'Pedido Gerado'];
begin
  if tg_op = 'UPDATE'
     and (new.quantidade, new.preco_unitario_estimado, new.material_id, new.descricao, new.unidade,
          new.deleted_at, new.solicitacao_id)
         is not distinct from
         (old.quantidade, old.preco_unitario_estimado, old.material_id, old.descricao, old.unidade,
          old.deleted_at, old.solicitacao_id) then
    return null;
  end if;

  v_ids := case tg_op
             when 'INSERT' then array[new.solicitacao_id]
             when 'DELETE' then array[old.solicitacao_id]
             else array[new.solicitacao_id, old.solicitacao_id]
           end;
  -- só a solicitação da MESMA empresa do item (a função é definer e não passa pela
  -- RLS; revisão 2b-1, achado 2)
  v_empresas := case tg_op
                  when 'INSERT' then array[new.empresa_id]
                  when 'DELETE' then array[old.empresa_id]
                  else array[new.empresa_id, old.empresa_id]
                end;

  update public.solicitacao_compra s
     set status = 'Pendente Aprovação',
         nivel_aprovacao_atual = 1,
         proximo_aprovador_perfis = null,
         data_aprovacao_final = null,
         aprovador_final_email = null,
         aprovador_final_nome = null,
         updated_at = now()
   where s.id = any (v_ids)
     and s.empresa_id = any (v_empresas)
     and s.deleted_at is null
     and s.status = any (c_aprovados);

  return null;
end;
$$;

revoke all on function public.solicitacao_compra_item_volta_pendente() from public, anon, authenticated;

-- nome depois de trg_sync_total_solicitacao (AFTER, ordem alfabética): o valor já
-- está recalculado quando a solicitação volta a pendente
drop trigger if exists trg_volta_pendente_item_alterado on public.solicitacao_compra_item;
create trigger trg_volta_pendente_item_alterado
  after insert or update or delete on public.solicitacao_compra_item
  for each row execute function public.solicitacao_compra_item_volta_pendente();

-- 4b. o item só aponta para solicitação da própria empresa (regra 5 do AGENTS.md,
-- 0118). Vale para INSERT e para UPDATE de solicitacao_id/empresa_id; itens legados
-- não são revalidados (conferência em LOTE2-banco.md).
drop trigger if exists referencias_da_empresa on public.solicitacao_compra_item;
create trigger referencias_da_empresa
  before insert or update of solicitacao_id, empresa_id on public.solicitacao_compra_item
  for each row execute function public.exigir_referencias_da_empresa('solicitacao_id:solicitacao_compra');

-- 5. alçadas: escrita só do administrador (consequência das regras 1 e 3) --------
drop policy if exists nivel_aprovacao_criar_so_admin on public.nivel_aprovacao;
create policy nivel_aprovacao_criar_so_admin on public.nivel_aprovacao
  as restrictive for insert to authenticated
  with check ((select public.usuario_eh_administrador()));

drop policy if exists nivel_aprovacao_alterar_so_admin on public.nivel_aprovacao;
create policy nivel_aprovacao_alterar_so_admin on public.nivel_aprovacao
  as restrictive for update to authenticated
  using ((select public.usuario_eh_administrador()))
  with check ((select public.usuario_eh_administrador()));

drop policy if exists nivel_aprovacao_apagar_so_admin on public.nivel_aprovacao;
create policy nivel_aprovacao_apagar_so_admin on public.nivel_aprovacao
  as restrictive for delete to authenticated
  using ((select public.usuario_eh_administrador()));

-- 6. anon não escreve (a 0175 já tirou; aqui por garantia) ------------------------
revoke insert, update, delete, truncate on public.solicitacao_compra, public.solicitacao_compra_item,
  public.nivel_aprovacao from anon;

notify pgrst, 'reload schema';

commit;
select 'ok' as res;
