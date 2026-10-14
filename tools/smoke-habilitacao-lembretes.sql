-- ============================================================================
-- smoke-habilitacao-lembretes.sql — valida a 0155 (lembretes de vencimento da habilitação)
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK. Cria uma EMPRESA SINTÉTICA
-- ("Smoke Lembretes"), quatro vínculos de usuário sintéticos (e-mails @exemplo.test, telefones
-- sintéticos) e documentos "Smoke Lembrete …". Uma empresa só do smoke, e não a mais antiga da
-- base, porque a função varre todas as empresas e a empresa real pode já ter documentos,
-- configuração, usuários com telefone e avisos de hoje: nada disso entra nas contas. Nada é
-- persistido. A função das demais empresas roda junto (é a mesma varredura do cron), também
-- dentro do ROLLBACK.
--
-- Usuários de teste (os perfis Gestor não são Admin nem dono: valem as permissões):
--   dono     Admin e dono, com telefone  — o destinatário de reserva (ninguém escolhido)
--   editar   Gestor, Oportunidades → Lista → visualizar e editar, com telefone (e-mail gravado com maiúsculas)
--   ver      Gestor, Oportunidades → Lista → visualizar, telefone em branco ("sem telefone")
--   inativo  Gestor desligado, com telefone
--
-- O que confere:
--   1. cria os documentos: +10, +3, hoje e +7 dias, um vencido (-2) e três que NÃO contam
--      (fora de vigor, excluído e sem validade); "hoje" como a função calcula (Brasília);
--   2. sem habilitacao_config: a função devolve pelo menos 1 e só o dono/Admin recebe 1 aviso
--      (tipo Licitação, link da aba, prioridade Alta) que cita os 3 documentos (+10, +3 e hoje),
--      não cita o de +7 nem os que não contam e diz "1 documento(s) já vencido(s)"; sem
--      WhatsApp, a fila fica vazia (mesmo com o dono tendo telefone);
--   3. rodar de novo no mesmo dia não cria aviso novo;
--   4. a escrita LEGÍTIMA da configuração como authenticated: quem só vê não cria (RLS) e, com a
--      configuração criada, lê, mas o UPDATE não atinge linha; quem tem Lista → editar cria e
--      altera; dias fora de 1 a 90, destinatários que não são lista e uma segunda configuração
--      viva da empresa são recusados;
--   5. com a configuração (7 dias, WhatsApp ligado, 4 destinatários: editar, ver, inativo e um
--      e-mail que não é usuário): só editar e ver recebem (o e-mail é gravado em minúsculas), a
--      mensagem passa a citar o de +7 e não o de +10, e a fila tem 1 linha, a de quem tem
--      telefone, com a dedup_key esperada; rodar de novo não duplica nada;
--   6. sem nenhum destinatário válido (inativo e e-mail desconhecido), recebem o dono/Admin, e o
--      WhatsApp vai para quem tem telefone entre eles;
--   7. authenticated não executa a função nem lê ou grava a fila (permission denied);
--   8. o job existe (45 11 * * *) e as duas policies restritivas da configuração existem, cada
--      uma no seu comando.
-- Nenhum UUID fixo: a empresa é criada em tempo de execução.
--
-- O WhatsApp NÃO sai daqui. A função chama net.http_post quando enfileira (passos 5 e 6), mas
-- (a) o pg_net só grava o pedido numa tabela de fila e o worker dele só enxerga pedido de
-- transação confirmada: com o ROLLBACK ele some; e (b) mesmo que algum pedido escapasse, a
-- função habilitacao-lembretes só esvazia a fila já confirmada, e as linhas da fila deste smoke
-- também somem no ROLLBACK. Nada é enviado a ninguém.
--
-- A função é chamada como o dono do banco (servidor): chamador_eh_servidor() aceita sessão sem
-- token fora do papel authenticator (0110:27-35), e o smoke confere isso antes de começar.
--
-- Como rodar (com a 0154 e a 0155 já aplicadas; quem roda é o Javerson):
--   supabase db query --linked -f tools/smoke-habilitacao-lembretes.sql
-- Deve terminar imprimindo "SMOKE TEST OK".
-- ============================================================================

begin;

-- exige que o comando seja RECUSADO com o estado e a mensagem esperados; some no ROLLBACK
-- (o estado sozinho não basta: 42501 também é o "permission denied" de um grant que falta)
create or replace function public.smoke_lemb_recusa(p_sql text, p_msg text, p_estado text)
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

-- o token simulado de cada usuário de teste (e-mail sintético, empresa do token); some no ROLLBACK
create or replace function public.smoke_lemb_claims(p_quem text, p_empresa uuid)
returns text
language sql
as $f$
  select jsonb_build_object(
    'role', 'authenticated',
    'sub', md5('smoke-lemb-' || p_quem)::uuid,
    'email', 'smoke.lemb.' || p_quem || '@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', p_empresa)
  )::text;
$f$;

do $$
declare
  v_empresa uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;  -- como a função calcula
  v_ref text;
  v_dono constant text := 'smoke.lemb.dono@exemplo.test';
  v_editar constant text := 'smoke.lemb.editar@exemplo.test';
  v_ver constant text := 'smoke.lemb.ver@exemplo.test';
  v_inativo constant text := 'smoke.lemb.inativo@exemplo.test';
  v_tel_dono constant text := '34999990001';
  v_tel_editar constant text := '34999990000';
  v_cfg uuid;
  v_ret int;
  v_msg text;
  v_n bigint;
  r record;
begin
  if to_regclass('public.acervo_documento') is null then
    raise exception 'Falta a migração 0154 (public.acervo_documento): aplique antes de rodar este smoke.';
  end if;
  if to_regclass('public.habilitacao_config') is null
     or to_regclass('public.habilitacao_lembrete_fila') is null
     or to_regprocedure('public.alertar_documentos_habilitacao()') is null then
    raise exception 'Falta a migração 0155 (lembretes de habilitação): aplique antes de rodar este smoke.';
  end if;

  -- a função só aceita o servidor: sem token e fora do papel authenticator (0110:27-35)
  perform set_config('request.jwt.claims', '', true);
  if not public.chamador_eh_servidor() then
    raise exception 'FALHOU: o smoke tem de rodar como servidor (sessão sem token, fora do papel authenticator): a função só aceita o servidor';
  end if;

  -- empresa e vínculos sintéticos (como servidor: sem token)
  insert into public.empresa (nome) values ('Smoke Lembretes (empresa sintética)')
  returning id into v_empresa;
  v_ref := 'habilitacao/' || v_empresa::text || '/2026/10/smoke-lembrete.pdf';

  insert into public.usuario_empresa
    (empresa_id, usuario_email, perfil, is_owner, ativo, permissoes, nome_completo, telefone)
  values
    (v_empresa, v_dono, 'Admin', true, true, null, 'Smoke Dono', v_tel_dono),
    (v_empresa, 'Smoke.Lemb.Editar@exemplo.test', 'Gestor', false, true,
       '{"Oportunidades":{"Lista":{"visualizar":true,"editar":true}}}'::jsonb, 'Smoke Editar', v_tel_editar),
    (v_empresa, v_ver, 'Gestor', false, true,
       '{"Oportunidades":{"Lista":{"visualizar":true}}}'::jsonb, 'Smoke Ver', '   '),
    (v_empresa, v_inativo, 'Gestor', false, false, null, 'Smoke Inativo', '34999990002');

  -- 1. os documentos --------------------------------------------------------------------------------------------
  insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, validade, ativo, deleted_at)
  values
    (v_empresa, 'cnd_federal', 'Smoke Lembrete D+10', v_ref, v_hoje + 10, true, null),
    (v_empresa, 'crf_fgts', 'Smoke Lembrete D+3', v_ref, v_hoje + 3, true, null),
    (v_empresa, 'cndt_trabalhista', 'Smoke Lembrete D+0', v_ref, v_hoje, true, null),
    (v_empresa, 'cnd_estadual', 'Smoke Lembrete D+7', v_ref, v_hoje + 7, true, null),
    (v_empresa, 'cnd_municipal', 'Smoke Lembrete vencido', v_ref, v_hoje - 2, true, null),
    -- os três que não contam: fora de vigor, excluído e sem validade
    (v_empresa, 'cnd_federal', 'Smoke Lembrete fora de vigor', v_ref, v_hoje + 10, false, null),
    (v_empresa, 'sicaf', 'Smoke Lembrete excluido', v_ref, v_hoje + 10, true, now()),
    (v_empresa, 'alvara', 'Smoke Lembrete sem validade', v_ref, null, true, null);
  raise notice '[1] documentos sintéticos criados (hoje = %)', v_hoje;

  -- 2. sem configuração: o dono/Admin recebe, sem WhatsApp ------------------------------------------------------
  v_ret := public.alertar_documentos_habilitacao();
  if v_ret < 1 then
    raise exception 'FALHOU: sem configuração a função devolveu % (esperava pelo menos 1)', v_ret;
  end if;
  select count(*) into v_n from public.notificacao n
   where n.empresa_id = v_empresa and n.deleted_at is null
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_empresa::text || ':%';
  if v_n <> 1 then
    raise exception 'FALHOU: sem configuração deveria haver 1 aviso (o do dono/Admin) e há %', v_n;
  end if;
  select n.* into r from public.notificacao n
   where n.empresa_id = v_empresa and n.deleted_at is null
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_empresa::text || ':%';
  if r.usuario_email is distinct from v_dono then
    raise exception 'FALHOU: o aviso deveria ir para o dono/Admin (%) e foi para %', v_dono, r.usuario_email;
  end if;
  if r.tipo is distinct from 'Licitação' then
    raise exception 'FALHOU: tipo do aviso "%" (esperado Licitação)', r.tipo;
  end if;
  if r.link is distinct from '/AcervoTecnico?aba=habilitacao' then
    raise exception 'FALHOU: link do aviso "%"', r.link;
  end if;
  if r.prioridade is distinct from 'Alta' then
    raise exception 'FALHOU: prioridade do aviso "%" (esperada Alta: há documento que vence hoje)', r.prioridade;
  end if;
  if r.dados_extra ->> 'dedup_key'
       is distinct from 'habilitacao:' || v_empresa::text || ':' || v_hoje::text || '|' || v_dono then
    raise exception 'FALHOU: dedup_key do aviso "%"', r.dados_extra ->> 'dedup_key';
  end if;
  v_msg := r.mensagem;
  if strpos(v_msg, 'Smoke Lembrete D+10') = 0 or strpos(v_msg, 'Smoke Lembrete D+3') = 0
     or strpos(v_msg, 'Smoke Lembrete D+0') = 0 then
    raise exception 'FALHOU: a mensagem deveria citar os 3 documentos (+10, +3 e hoje): %', v_msg;
  end if;
  if strpos(v_msg, 'Smoke Lembrete D+7') > 0 then
    raise exception 'FALHOU: a mensagem citou o documento de +7 (não é marco com 10 dias): %', v_msg;
  end if;
  if strpos(v_msg, 'Smoke Lembrete vencido') > 0 or strpos(v_msg, 'fora de vigor') > 0
     or strpos(v_msg, 'excluido') > 0 or strpos(v_msg, 'sem validade') > 0 then
    raise exception 'FALHOU: a mensagem citou documento que não conta: %', v_msg;
  end if;
  if strpos(v_msg, '1 vence(m) hoje e 2 nos próximos dias') = 0 then
    raise exception 'FALHOU: contagem da mensagem (esperava 1 hoje e 2 nos próximos dias): %', v_msg;
  end if;
  if strpos(v_msg, '1 documento(s) já vencido(s)') = 0 then
    raise exception 'FALHOU: a mensagem deveria dizer "1 documento(s) já vencido(s)": %', v_msg;
  end if;
  select count(*) into v_n from public.habilitacao_lembrete_fila where empresa_id = v_empresa;
  if v_n <> 0 then
    raise exception 'FALHOU: sem WhatsApp ligado a fila deveria estar vazia e tem % linha(s)', v_n;
  end if;
  raise notice '[2] sem configuração: 1 aviso para o dono/Admin, com a mensagem certa e a fila vazia';

  -- 3. no mesmo dia, nada de aviso novo -------------------------------------------------------------------------
  perform public.alertar_documentos_habilitacao();
  select count(*) into v_n from public.notificacao n
   where n.empresa_id = v_empresa and n.deleted_at is null
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_empresa::text || ':%';
  if v_n <> 1 then
    raise exception 'FALHOU: rodar de novo no mesmo dia criou aviso novo (há % avisos, esperado 1)', v_n;
  end if;
  raise notice '[3] rodar de novo no mesmo dia não cria aviso';

  -- 4. a escrita legítima da configuração como authenticated --------------------------------------------------
  -- 4.1 quem só vê não cria: a policy restritiva de INSERT recusa (a configuração ainda não existe)
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('ver', v_empresa), true);
  set local role authenticated;
  perform public.smoke_lemb_recusa(format(
    'insert into public.habilitacao_config (empresa_id, dias_antecedencia) values (%L, 5)', v_empresa),
    '%row-level security%', '42501');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 4.2 quem tem Lista → editar cria e altera. O trigger set_updated_at não é SECURITY DEFINER: roda como
  --     authenticated, sob a RLS; um grant ou uma policy que falte derruba o INSERT/UPDATE, e só este passo pega.
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('editar', v_empresa), true);
  set local role authenticated;
  begin
    insert into public.habilitacao_config (empresa_id, dias_antecedencia, destinatarios, whatsapp)
    values (v_empresa, 10, '[]'::jsonb, false)
    returning id into v_cfg;
    update public.habilitacao_config
       set dias_antecedencia = 7,
           destinatarios = jsonb_build_array(v_editar, v_ver, v_inativo, 'ninguem@exemplo.test'),
           whatsapp = true
     where id = v_cfg;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'a alteração não atingiu a configuração (linhas=%)', v_n; end if;
    select count(*) into v_n from public.habilitacao_config
     where id = v_cfg and dias_antecedencia = 7 and whatsapp and jsonb_array_length(destinatarios) = 4;
    if v_n <> 1 then raise exception 'a configuração não ficou como foi gravada'; end if;
  exception when others then
    raise exception 'FALHOU: quem tem Oportunidades → Lista → editar deveria criar e alterar a configuração como authenticated, e veio: % (%)',
      sqlerrm, sqlstate;
  end;
  -- valores inválidos e segunda configuração viva da empresa: recusados pelo banco
  perform public.smoke_lemb_recusa(format(
    'update public.habilitacao_config set dias_antecedencia = 0 where id = %L', v_cfg),
    '%habilitacao_config_dias_antecedencia_check%', '23514');
  perform public.smoke_lemb_recusa(format(
    'update public.habilitacao_config set dias_antecedencia = 91 where id = %L', v_cfg),
    '%habilitacao_config_dias_antecedencia_check%', '23514');
  perform public.smoke_lemb_recusa(format(
    'update public.habilitacao_config set destinatarios = %L::jsonb where id = %L', '{"a":1}', v_cfg),
    '%habilitacao_config_destinatarios_check%', '23514');
  perform public.smoke_lemb_recusa(format(
    'insert into public.habilitacao_config (empresa_id, dias_antecedencia) values (%L, 5)', v_empresa),
    '%habilitacao_config_empresa_uidx%', '23505');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 4.3 quem só vê lê a configuração, mas o UPDATE não atinge linha (nem a edição, nem a exclusão lógica)
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('ver', v_empresa), true);
  set local role authenticated;
  select count(*) into v_n from public.habilitacao_config where id = v_cfg;
  if v_n <> 1 then
    raise exception 'FALHOU: quem tem Oportunidades → Lista deveria ler a configuração (leu % de 1)', v_n;
  end if;
  update public.habilitacao_config set dias_antecedencia = 30 where id = v_cfg;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHOU: quem só vê alterou % configuração(ões)', v_n; end if;
  update public.habilitacao_config set deleted_at = now() where id = v_cfg;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHOU: quem só vê excluiu % configuração(ões)', v_n; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.habilitacao_config
   where id = v_cfg and dias_antecedencia = 7 and deleted_at is null;
  if v_n <> 1 then raise exception 'FALHOU: a configuração mudou depois das tentativas de quem só vê'; end if;
  raise notice '[4] configuração: quem edita cria e altera; quem só vê lê e não grava; valores inválidos recusados';

  -- 5. com a configuração: 7 dias, WhatsApp, 4 destinatários -----------------------------------------------------
  v_ret := public.alertar_documentos_habilitacao();
  -- só editar e ver (escolhidos e ativos) recebem; o e-mail é gravado em minúsculas
  select count(*) into v_n from public.notificacao n
   where n.empresa_id = v_empresa and n.deleted_at is null
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_empresa::text || ':%'
     and n.usuario_email in (v_editar, v_ver);
  if v_n <> 2 then
    raise exception 'FALHOU: editar e ver deveriam receber 1 aviso cada e receberam % no total', v_n;
  end if;
  select count(*) into v_n from public.notificacao n
   where n.empresa_id = v_empresa and n.deleted_at is null
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_empresa::text || ':%'
     and n.usuario_email not in (v_dono, v_editar, v_ver);
  if v_n <> 0 then
    raise exception 'FALHOU: o usuário inativo ou o e-mail desconhecido recebeu aviso (% aviso(s))', v_n;
  end if;
  select count(*) into v_n from public.notificacao n
   where n.empresa_id = v_empresa and n.deleted_at is null
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_empresa::text || ':%'
     and n.usuario_email = v_dono;
  if v_n <> 1 then
    raise exception 'FALHOU: o dono/Admin ficou com % aviso(s) (esperado 1, o do passo 2: não foi escolhido agora)', v_n;
  end if;
  select n.mensagem into v_msg from public.notificacao n
   where n.empresa_id = v_empresa and n.deleted_at is null and n.usuario_email = v_editar
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_empresa::text || ':%';
  if strpos(v_msg, 'Smoke Lembrete D+7') = 0 or strpos(v_msg, 'Smoke Lembrete D+3') = 0
     or strpos(v_msg, 'Smoke Lembrete D+0') = 0 then
    raise exception 'FALHOU: com 7 dias a mensagem deveria citar os documentos de +7, +3 e hoje: %', v_msg;
  end if;
  if strpos(v_msg, 'Smoke Lembrete D+10') > 0 then
    raise exception 'FALHOU: com 7 dias a mensagem citou o documento de +10: %', v_msg;
  end if;
  if strpos(v_msg, '1 vence(m) hoje e 2 nos próximos dias') = 0
     or strpos(v_msg, '1 documento(s) já vencido(s)') = 0 then
    raise exception 'FALHOU: contagens da mensagem com 7 dias: %', v_msg;
  end if;
  -- a fila: 1 linha, a de quem tem telefone (ver tem telefone em branco; inativo e desconhecido nem recebem)
  select count(*) into v_n from public.habilitacao_lembrete_fila where empresa_id = v_empresa;
  if v_n <> 1 then
    raise exception 'FALHOU: a fila deveria ter 1 linha (só editar tem telefone) e tem %', v_n;
  end if;
  select f.* into r from public.habilitacao_lembrete_fila f where f.empresa_id = v_empresa;
  if r.usuario_email is distinct from v_editar or r.telefone is distinct from v_tel_editar then
    raise exception 'FALHOU: a linha da fila deveria ser de editar com o telefone dele e é de % (%)',
      r.usuario_email, r.telefone;
  end if;
  if r.dedup_key is distinct from
       'habilitacao_wa:' || v_empresa::text || ':' || v_hoje::text || '|' || v_editar then
    raise exception 'FALHOU: dedup_key da fila "%"', r.dedup_key;
  end if;
  if r.enviado_em is not null or r.tentativas <> 0 or r.erro is not null then
    raise exception 'FALHOU: a linha da fila deveria nascer pendente (enviado_em %, tentativas %, erro %)',
      r.enviado_em, r.tentativas, r.erro;
  end if;
  if strpos(r.texto, 'SIGO Obras — Documentos de habilitação a vencer') <> 1
     or strpos(r.texto, 'Smoke Lembrete D+7') = 0 then
    raise exception 'FALHOU: texto da fila: %', r.texto;
  end if;
  -- rodar de novo: nem aviso nem linha de fila a mais
  perform public.alertar_documentos_habilitacao();
  select count(*) into v_n from public.habilitacao_lembrete_fila where empresa_id = v_empresa;
  if v_n <> 1 then
    raise exception 'FALHOU: rodar de novo duplicou a fila (% linhas)', v_n;
  end if;
  select count(*) into v_n from public.notificacao n
   where n.empresa_id = v_empresa and n.deleted_at is null
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_empresa::text || ':%';
  if v_n <> 3 then
    raise exception 'FALHOU: rodar de novo mudou os avisos (% no total, esperado 3: dono, editar e ver)', v_n;
  end if;
  raise notice '[5] com configuração: editar e ver recebem; fila com 1 linha; rodar de novo não duplica';

  -- 6. sem nenhum destinatário válido: dono/Admin (e o WhatsApp dele, que tem telefone) ------------------------
  update public.notificacao set deleted_at = now()
   where empresa_id = v_empresa and dados_extra ->> 'dedup_key' like 'habilitacao:' || v_empresa::text || ':%';
  delete from public.habilitacao_lembrete_fila where empresa_id = v_empresa;
  update public.habilitacao_config
     set destinatarios = jsonb_build_array(v_inativo, 'ninguem@exemplo.test')
   where id = v_cfg;
  perform public.alertar_documentos_habilitacao();
  select count(*) into v_n from public.notificacao n
   where n.empresa_id = v_empresa and n.deleted_at is null
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_empresa::text || ':%'
     and n.usuario_email = v_dono;
  if v_n <> 1 then
    raise exception 'FALHOU: sem destinatário válido o dono/Admin deveria receber 1 aviso e recebeu %', v_n;
  end if;
  select count(*) into v_n from public.notificacao n
   where n.empresa_id = v_empresa and n.deleted_at is null
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_empresa::text || ':%';
  if v_n <> 1 then
    raise exception 'FALHOU: sem destinatário válido só o dono/Admin deveria receber e há % avisos', v_n;
  end if;
  select count(*) into v_n from public.habilitacao_lembrete_fila
   where empresa_id = v_empresa and usuario_email = v_dono and telefone = v_tel_dono;
  if v_n <> 1 then
    raise exception 'FALHOU: o WhatsApp do dono/Admin (que tem telefone) deveria estar na fila (% linha(s))', v_n;
  end if;
  raise notice '[6] sem destinatário válido: recebem o dono/Admin';

  -- 7. authenticated não executa a função nem mexe na fila -------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('editar', v_empresa), true);
  set local role authenticated;
  perform public.smoke_lemb_recusa('select public.alertar_documentos_habilitacao()',
    'permission denied for function alertar_documentos_habilitacao%', '42501');
  perform public.smoke_lemb_recusa('select count(*) from public.habilitacao_lembrete_fila',
    'permission denied for table habilitacao_lembrete_fila%', '42501');
  perform public.smoke_lemb_recusa(format(
    'insert into public.habilitacao_lembrete_fila (empresa_id, usuario_email, telefone, texto, dedup_key) values (%L, %L, %L, %L, %L)',
    v_empresa, v_editar, v_tel_editar, 'Smoke', 'smoke-lemb-fila-authenticated'),
    'permission denied for table habilitacao_lembrete_fila%', '42501');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[7] authenticated não executa a função nem acessa a fila';

  -- 8. o job e as policies restritivas da configuração -----------------------------------------------------------
  select count(*) into v_n from cron.job
   where jobname = 'alertar_documentos_habilitacao' and schedule = '45 11 * * *'
     and command like '%alertar_documentos_habilitacao()%' and active;
  if v_n <> 1 then raise exception 'FALHOU: job alertar_documentos_habilitacao ausente, inativo ou com outro horário'; end if;
  for r in
    select * from (values
      ('habilitacao_config_criar_com_permissao', 'INSERT'),
      ('habilitacao_config_alterar_com_permissao', 'UPDATE')
    ) as e(nome, comando)
  loop
    select count(*) into v_n from pg_policies p
     where p.schemaname = 'public' and p.tablename = 'habilitacao_config' and p.policyname = r.nome
       and p.cmd = r.comando and p.permissive = 'RESTRICTIVE' and p.roles = '{authenticated}';
    if v_n <> 1 then
      raise exception 'FALHOU: a policy % deveria ser restritiva, de %, para authenticated, em habilitacao_config',
        r.nome, r.comando;
    end if;
  end loop;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'habilitacao_config' and permissive = 'RESTRICTIVE';
  if v_n <> 2 then raise exception 'FALHOU: % policies restritivas na configuração (esperado 2)', v_n; end if;
  raise notice '[8] job agendado e policies restritivas ok';

  raise notice 'SMOKE TEST OK';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro
select 'SMOKE TEST OK: lembretes de habilitação (0155)' as res;

rollback;
