-- ============================================================================
-- smoke-lote2-i-chat-notificacao.sql — valida a 0177 (Lote 2b-1, F-09 + revisão
-- achados 3, 5, 6 e 7, regra 4 do dono):
--   * "Direto" só para participantes (por e-mail OU pelos ids que a tela usa),
--     criador e administrador; "Geral" e canais de contexto abertos à empresa;
--   * "Direto" antigo sem e-mails continua visível para quem está na lista de ids
--     (id de usuario_custom = user.id da tela, ou id/usuario_id de usuario_empresa);
--   * notificação só do destinatário; a menção (insert ... returning) passa, mas o
--     remetente não lê depois;
--   * sem DELETE físico; só o criador muda tipo/participantes e só o autor muda a
--     mensagem; o autor da mensagem é o do token.
--
-- Transação com ROLLBACK; EMPRESA SINTÉTICA, usuários, canais, mensagens e
-- notificações sintéticos (e-mails @exemplo.test) criados aqui; nenhum UUID fixo.
-- Perfis simulados: ana e beto (Compras, participantes por e-mail), dani
-- (participante só pelo id de usuario_custom), eva (só pelo id de usuario_empresa),
-- caio (de fora), admin (Admin), outra (outra empresa), super.
--
-- Como rodar (com a 0177 aplicada):
--   supabase db query --linked -f tools/smoke-lote2-i-chat-notificacao.sql
-- Deve terminar com a linha "SMOKE LOTE2-I OK" e o número de verificações.
-- ============================================================================

begin;

create or replace function public.smoke_lote2_recusa(p_sql text, p_estado text, p_msg text)
returns text
language plpgsql
as $f$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_estado then
      raise exception 'FALHOU: esperava % e veio % (%) em: %', p_estado, sqlstate, sqlerrm, p_sql;
    end if;
    if sqlerrm not like p_msg then
      raise exception 'FALHOU: recusado pelo motivo errado. Esperava "%" e veio "%" em: %', p_msg, sqlerrm, p_sql;
    end if;
    return sqlerrm;
  end;
  raise exception 'FALHOU: o comando não foi recusado: %', p_sql;
end;
$f$;

create or replace function public.smoke_lote2_claims(p_quem text, p_empresa uuid, p_super boolean default false)
returns text
language sql
as $f$
  select jsonb_build_object(
    'role', 'authenticated',
    'sub', md5('smoke-lote2-' || p_quem)::uuid,
    'email', 'smoke.lote2.' || p_quem || '@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', p_empresa, 'is_super_admin', p_super)
  )::text;
$f$;

grant execute on function public.smoke_lote2_recusa(text, text, text) to authenticated, anon, service_role;
grant execute on function public.smoke_lote2_claims(text, uuid, boolean) to authenticated, anon, service_role;

do $$
declare
  v_e1 uuid;
  v_e2 uuid := gen_random_uuid();
  v_uc_dani uuid;
  v_uc_ana uuid;
  v_uid uuid;
  v_nome text;
  v_data timestamptz;
  v_ue_eva uuid;
  v_direto uuid;
  v_direto_antigo uuid;
  v_geral uuid;
  v_ctx uuid;
  v_msg_direto uuid;
  v_msg_beto uuid;
  v_not_ana uuid;
  v_not_beto uuid;
  v_novo uuid;
  v_email text;
  v_cnt bigint;
  v_rows bigint;
  v_n int := 0;
  -- o front grava a lista como JSON.stringify(...) → string jsonb
  v_emails jsonb := to_jsonb('["Smoke.Lote2.Ana@exemplo.test","smoke.lote2.beto@exemplo.test"]'::text);
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'canal_chat'
                  and policyname = 'canal_chat_ler') then
    raise exception 'A 0177 não está aplicada (falta canal_chat_ler).';
  end if;

  -- 0. catálogo: sem DELETE físico nem TRUNCATE (achado 6) ----------------------------------------------------
  if has_table_privilege('authenticated', 'public.canal_chat', 'DELETE')
     or has_table_privilege('authenticated', 'public.mensagem_chat', 'DELETE')
     or has_table_privilege('authenticated', 'public.notificacao', 'DELETE')
     or has_table_privilege('authenticated', 'public.canal_chat', 'TRUNCATE')
     or has_table_privilege('anon', 'public.mensagem_chat', 'INSERT') then
    raise exception 'FALHOU: ainda há DELETE/TRUNCATE para authenticated ou escrita para anon no chat';
  end if;
  v_n := v_n + 1;
  if has_function_privilege('anon', 'public.chat_meus_ids()', 'EXECUTE') then
    raise exception 'FALHOU: chat_meus_ids executável por anon';
  end if;
  v_n := v_n + 1;

  -- 1. massa (como servidor) -----------------------------------------------------------------------------------
  insert into public.empresa (nome) values ('SMOKE LOTE2 empresa sintética') returning id into v_e1;
  raise notice '== empresa sintética: %', v_e1;

  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    select v_e1, 'smoke.lote2.' || q || '@exemplo.test', p, true, null, 'Smoke Lote2'
      from (values ('admin', 'Admin'), ('holding', 'Admin Holding'), ('ana', 'Compras'), ('beto', 'Compras'),
                   ('caio', 'Compras'), ('dani', 'Compras')) as u(q, p);
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    values (v_e1, 'smoke.lote2.eva@exemplo.test', 'Compras', true, null, 'Smoke Lote2') returning id into v_ue_eva;
  insert into public.usuario_custom (email, senha_hash, nome_completo, empresa_id)
    values ('smoke.lote2.dani@exemplo.test', 'smoke-sem-senha', 'Smoke Dani', v_e1) returning id into v_uc_dani;
  insert into public.usuario_custom (email, senha_hash, nome_completo, empresa_id)
    values ('smoke.lote2.ana@exemplo.test', 'smoke-sem-senha', 'Smoke Ana', v_e1) returning id into v_uc_ana;

  insert into public.canal_chat (empresa_id, tipo, nome, participantes_emails)
    values (v_e1, 'Direto', 'SMOKE direto', v_emails) returning id into v_direto;
  -- achado 3: Direto antigo, só com ids (os da tela), sem e-mails
  insert into public.canal_chat (empresa_id, tipo, nome, participantes, participantes_emails)
    values (v_e1, 'Direto', 'SMOKE direto antigo',
            to_jsonb(jsonb_build_array(v_uc_dani::text, v_ue_eva::text)::text), '[]'::jsonb)
    returning id into v_direto_antigo;
  insert into public.canal_chat (empresa_id, tipo, nome) values (v_e1, 'Geral', 'SMOKE geral')
    returning id into v_geral;
  insert into public.canal_chat (empresa_id, tipo, nome, participantes_emails)
    values (v_e1, 'Projeto', 'SMOKE contexto', '["smoke.lote2.ana@exemplo.test"]'::jsonb)
    returning id into v_ctx;
  insert into public.mensagem_chat (empresa_id, canal_id, usuario_email, mensagem)
    values (v_e1, v_direto, 'smoke.lote2.ana@exemplo.test', 'SMOKE privado') returning id into v_msg_direto;
  insert into public.mensagem_chat (empresa_id, canal_id, usuario_email, mensagem)
    values (v_e1, v_geral, 'smoke.lote2.beto@exemplo.test', 'SMOKE do beto') returning id into v_msg_beto;
  insert into public.notificacao (empresa_id, usuario_email, titulo, mensagem, tipo)
    values (v_e1, 'smoke.lote2.ana@exemplo.test', 'SMOKE', 'para ana', 'Sistema') returning id into v_not_ana;
  insert into public.notificacao (empresa_id, usuario_email, titulo, mensagem, tipo)
    values (v_e1, 'Smoke.Lote2.Beto@exemplo.test', 'SMOKE', 'para beto', 'Sistema') returning id into v_not_beto;

  -- 2. ana (participante por e-mail) ----------------------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('ana', v_e1), true);
  set local role authenticated;
  select count(*) into v_cnt from public.canal_chat where id in (v_direto, v_geral, v_ctx);
  if v_cnt <> 3 then raise exception 'FALHOU [ana]: devia ver Direto, Geral e contexto (viu %)', v_cnt; end if;
  v_n := v_n + 1;
  select count(*) into v_cnt from public.canal_chat where id = v_direto_antigo;
  if v_cnt <> 0 then raise exception 'FALHOU [ana]: viu Direto em que não participa'; end if;
  v_n := v_n + 1;
  select count(*) into v_cnt from public.mensagem_chat where canal_id = v_direto;
  if v_cnt <> 1 then raise exception 'FALHOU [ana]: participante devia ler a conversa direta'; end if;
  v_n := v_n + 1;
  -- autor pelo login: tentar falar em nome do beto (e-mail, id, nome, data) grava como ana
  insert into public.mensagem_chat (empresa_id, canal_id, usuario_email, usuario_id, usuario_nome, mensagem, created_at)
    values (v_e1, v_direto, 'smoke.lote2.beto@exemplo.test', gen_random_uuid(), 'Smoke Beto', 'SMOKE resposta', '2099-01-01')
    returning usuario_email, usuario_id, usuario_nome, created_at into v_email, v_uid, v_nome, v_data;
  if v_email <> 'smoke.lote2.ana@exemplo.test' or v_uid is distinct from v_uc_ana or v_nome <> 'Smoke Ana'
     or v_data > now() + interval '1 minute' then
    raise exception 'FALHOU [ana]: mensagem gravada em nome de % / % / % / %', v_email, v_uid, v_nome, v_data;
  end if;
  v_n := v_n + 1;
  -- o que a tela manda (ChatWindow.jsx:64-68) passa igual
  insert into public.mensagem_chat (empresa_id, canal_id, usuario_email, usuario_id, usuario_nome, mensagem)
    values (v_e1, v_direto, 'smoke.lote2.ana@exemplo.test', v_uc_ana, 'Smoke Ana', 'SMOKE como a tela')
    returning usuario_id into v_uid;
  if v_uid is distinct from v_uc_ana then raise exception 'FALHOU [ana]: a mensagem da tela mudou de autor'; end if;
  v_n := v_n + 1;
  update public.canal_chat set ultima_mensagem = 'SMOKE resposta', ultima_mensagem_data = now() where id = v_direto;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU [ana]: ChatWindow não atualizou a última mensagem'; end if;
  v_n := v_n + 1;
  update public.mensagem_chat set lida_por = '["x"]'::jsonb where id = v_msg_beto;   -- ChatWindow.jsx:50
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU [ana]: não marcou mensagem alheia como lida'; end if;
  v_n := v_n + 1;
  -- achado 7: não reescreve mensagem alheia nem esconde o canal Geral
  perform public.smoke_lote2_recusa(format('update public.mensagem_chat set mensagem = %L where id = %L', 'SMOKE adulterada', v_msg_beto),
    '42501', 'Acesso negado: só o autor altera ou exclui a mensagem');
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format('update public.canal_chat set tipo = %L where id = %L', 'Direto', v_geral),
    '42501', 'Acesso negado: só quem criou o canal muda tipo, participantes ou o exclui');
  v_n := v_n + 1;
  -- exclusão lógica alheia (revisão 2b-1, achado 5): nem a mensagem do beto nem o canal Geral
  perform public.smoke_lote2_recusa(format('update public.mensagem_chat set deleted_at = now() where id = %L', v_msg_beto),
    '42501', 'Acesso negado: só o autor altera ou exclui a mensagem');
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format('update public.canal_chat set deleted_at = now() where id = %L', v_geral),
    '42501', 'Acesso negado: só quem criou o canal muda tipo, participantes ou o exclui');
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format('update public.canal_chat set ativo = false where id = %L', v_geral),
    '42501', 'Acesso negado: só quem criou o canal muda tipo, participantes ou o exclui');
  v_n := v_n + 1;
  -- notificações: só as próprias
  select count(*) into v_cnt from public.notificacao where id = v_not_ana;
  if v_cnt <> 1 then raise exception 'FALHOU [ana]: sino não mostra a própria notificação'; end if;
  v_n := v_n + 1;
  select count(*) into v_cnt from public.notificacao where id = v_not_beto;
  if v_cnt <> 0 then raise exception 'FALHOU [ana]: leu notificação de outro usuário'; end if;
  v_n := v_n + 1;
  update public.notificacao set lida = true where id = v_not_ana;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU [ana]: não marcou a própria como lida'; end if;
  v_n := v_n + 1;
  update public.notificacao set deleted_at = now() where id = v_not_beto;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FALHOU [ana]: apagou notificação de outro usuário'; end if;
  v_n := v_n + 1;
  -- menção (ChatWindow.jsx:97): insert ... returning para o beto passa
  v_novo := null;
  insert into public.notificacao (empresa_id, usuario_email, tipo, titulo, mensagem, link, prioridade, icone)
    values (v_e1, 'smoke.lote2.beto@exemplo.test', 'Sistema', 'SMOKE mencionou você', 'SMOKE', '#/Chat', 'Normal', 'MessageSquare')
    returning id into v_novo;
  if v_novo is null then raise exception 'FALHOU [ana]: a menção não criou a notificação'; end if;
  v_n := v_n + 1;
  -- created_at forjado (revisão 2b-1, achado 6): o servidor grava now()
  insert into public.notificacao (empresa_id, usuario_email, tipo, titulo, mensagem, created_at)
    values (v_e1, 'smoke.lote2.beto@exemplo.test', 'Sistema', 'SMOKE forjada', 'SMOKE', '2099-01-01')
    returning created_at into v_data;
  if v_data > now() + interval '1 minute' then
    raise exception 'FALHOU [ana]: created_at da notificação foi escolhido pelo cliente';
  end if;
  v_n := v_n + 1;
  reset role;

  -- achado 5: passados os 2 minutos, a remetente não lê mais a notificação do beto
  update public.notificacao set created_at = now() - interval '1 hour' where id = v_novo;
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('ana', v_e1), true);
  set local role authenticated;
  select count(*) into v_cnt from public.notificacao where id = v_novo;
  if v_cnt <> 0 then raise exception 'FALHOU [ana]: remetente continua lendo a notificação do colega'; end if;
  v_n := v_n + 1;
  reset role;

  -- 3. dani e eva: Direto antigo só com ids (achado 3) ------------------------------------------------------------
  foreach v_email in array array['dani', 'eva'] loop
    perform set_config('request.jwt.claims', public.smoke_lote2_claims(v_email, v_e1), true);
    set local role authenticated;
    select count(*) into v_cnt from public.canal_chat where id = v_direto_antigo;
    if v_cnt <> 1 then raise exception 'FALHOU [%]: Direto antigo (só ids) sumiu para o participante', v_email; end if;
    v_n := v_n + 1;
    select count(*) into v_cnt from public.canal_chat where id = v_direto;
    if v_cnt <> 0 then raise exception 'FALHOU [%]: viu Direto alheio', v_email; end if;
    v_n := v_n + 1;
    reset role;
  end loop;

  -- 4. caio (de fora) ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('caio', v_e1), true);
  set local role authenticated;
  select count(*) into v_cnt from public.canal_chat where id in (v_direto, v_direto_antigo);
  if v_cnt <> 0 then raise exception 'FALHOU [caio]: viu canal Direto de outros'; end if;
  v_n := v_n + 1;
  select count(*) into v_cnt from public.mensagem_chat where canal_id = v_direto;
  if v_cnt <> 0 then raise exception 'FALHOU [caio]: leu conversa direta de outros'; end if;
  v_n := v_n + 1;
  select count(*) into v_cnt from public.canal_chat where id in (v_geral, v_ctx);
  if v_cnt <> 2 then raise exception 'FALHOU [caio]: deixou de ver o canal Geral/de contexto'; end if;
  v_n := v_n + 1;
  -- UPDATE comum de quem não criou o canal nem escreveu a mensagem (o que o defeito 1 quebrava)
  update public.canal_chat set ultima_mensagem = 'SMOKE do caio', ultima_mensagem_data = now() where id = v_ctx;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU [caio]: não atualizou a última mensagem (ChatContextual.jsx:128)'; end if;
  v_n := v_n + 1;
  update public.mensagem_chat set lida_por = '["caio"]'::jsonb where id = v_msg_beto;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU [caio]: não marcou como lida (ChatWindow.jsx:50)'; end if;
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format(
    'insert into public.mensagem_chat (empresa_id, canal_id, usuario_email, mensagem) values (%L, %L, %L, %L)',
    v_e1, v_direto, 'smoke.lote2.caio@exemplo.test', 'SMOKE intruso'),
    '42501', 'new row violates row-level security%');
  v_n := v_n + 1;
  -- NovoCanal "Direto": o criador não entra na lista; continua vendo e mudando o que criou
  v_novo := null;
  insert into public.canal_chat (empresa_id, tipo, nome, participantes, participantes_emails, ativo)
    values (v_e1, 'Direto', 'SMOKE direto do caio', to_jsonb('["x"]'::text),
            to_jsonb('["smoke.lote2.ana@exemplo.test"]'::text), true)
    returning id into v_novo;
  if v_novo is null then raise exception 'FALHOU [caio]: NovoCanal não criou o Direto'; end if;
  v_n := v_n + 1;
  insert into public.mensagem_chat (empresa_id, canal_id, usuario_email, mensagem)
    values (v_e1, v_novo, 'smoke.lote2.caio@exemplo.test', 'SMOKE oi');
  update public.canal_chat set nome = 'SMOKE renomeado', participantes_emails = '[]'::jsonb where id = v_novo;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU [caio]: o criador não alterou o próprio canal'; end if;
  v_n := v_n + 1;
  reset role;

  -- 5. admin: lê o Direto (regra 4) e pode reorganizar canais; sino só dele ---------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('admin', v_e1), true);
  set local role authenticated;
  select count(*) into v_cnt from public.mensagem_chat where canal_id = v_direto;
  if v_cnt < 1 then raise exception 'FALHOU [admin]: Admin devia ver a conversa direta'; end if;
  v_n := v_n + 1;
  update public.canal_chat set tipo = 'Geral' where id = v_direto_antigo;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU [admin]: Admin não alterou o tipo do canal'; end if;
  v_n := v_n + 1;
  select count(*) into v_cnt from public.notificacao where id in (v_not_ana, v_not_beto);
  if v_cnt <> 0 then raise exception 'FALHOU [admin]: leu notificação de outro usuário'; end if;
  v_n := v_n + 1;
  reset role;

  -- 5b. Admin Holding também é administrador: lê o Direto (regra 4) --------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('holding', v_e1), true);
  set local role authenticated;
  select count(*) into v_cnt from public.mensagem_chat where canal_id = v_direto;
  if v_cnt < 1 then raise exception 'FALHOU [holding]: Admin Holding devia ver a conversa direta'; end if;
  v_n := v_n + 1;
  reset role;

  -- 6. beto: vê a própria (e-mail em maiúsculas) ---------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('beto', v_e1), true);
  set local role authenticated;
  select count(*) into v_cnt from public.notificacao where id = v_not_beto;
  if v_cnt <> 1 then raise exception 'FALHOU [beto]: não viu a própria notificação (e-mail em maiúsculas)'; end if;
  v_n := v_n + 1;
  reset role;

  -- 7. outra empresa e super admin ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('outra', v_e2), true);
  set local role authenticated;
  select (select count(*) from public.canal_chat where id in (v_direto, v_geral, v_ctx))
       + (select count(*) from public.notificacao where id in (v_not_ana, v_not_beto)) into v_cnt;
  if v_cnt <> 0 then raise exception 'FALHOU [outra]: viu chat/notificação de outra empresa'; end if;
  v_n := v_n + 1;
  reset role;

  perform set_config('request.jwt.claims', public.smoke_lote2_claims('super', v_e1, true), true);
  set local role authenticated;
  select count(*) into v_cnt from public.canal_chat where id = v_direto;
  if v_cnt <> 1 then raise exception 'FALHOU [super]: super admin deixou de ver'; end if;
  v_n := v_n + 1;
  reset role;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('smoke.lote2_ok', v_n::text, true);
  raise notice '============ SMOKE LOTE2-I OK (% verificações) ============', v_n;
end;
$$;

select 'SMOKE LOTE2-I OK: chat direto e notificações privados (0177)' as res,
       current_setting('smoke.lote2_ok', true)::int as verificacoes_ok;

rollback;
