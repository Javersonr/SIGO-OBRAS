-- ============================================================================
-- smoke-habilitacao-lembretes.sql — valida a 0155 (lembretes de vencimento da habilitação)
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK. Cria TRÊS EMPRESAS SINTÉTICAS
-- ("Smoke Lembretes A", "B" e "C"), vínculos de usuário sintéticos (e-mails @exemplo.test,
-- telefones sintéticos) e documentos "Smoke Lembrete …". Empresas só do smoke, e não as da base,
-- porque a função varre todas as empresas e uma empresa real pode já ter documentos,
-- configuração, usuários com telefone e avisos de hoje: nada disso entra nas contas. Nada é
-- persistido. A função das demais empresas roda junto (é a mesma varredura do cron), também
-- dentro do ROLLBACK.
--
-- Empresa A (nome fantasia "Smoke Lembretes A"; os perfis Gestor não são Admin nem dono: valem as
-- permissões):
--   dono     Admin e dono, com telefone  — o destinatário de reserva (ninguém escolhido)
--   editar   Gestor, Oportunidades → Lista → visualizar e editar, com telefone (e-mail gravado com maiúsculas)
--   ver      Gestor, Oportunidades → Lista → visualizar, telefone em branco ("sem telefone")
--   sem      Gestor sem permissão em Oportunidades, sem nome e sem telefone
--   duplo    Gestor com DOIS vínculos vivos: o mais antigo sem telefone, o mais novo com telefone
--   inativo  Gestor desligado, com telefone
-- Empresa B (sem nome fantasia): donob (Admin e dono, com telefone). Nada vence hoje nela.
-- Empresa C (desativada e, depois, excluída): donoc e um documento que vence hoje. Não recebe nada.
--
-- O que confere:
--   1. cria os documentos. A: +10, +3, hoje e +7 dias, um vencido (-2) e três que NÃO contam (fora
--      de vigor, excluído e sem validade). B: +10, +3 e +7. C: hoje. "Hoje" como a função calcula
--      (Brasília);
--   2. sem habilitacao_config: em cada empresa só o dono/Admin dela recebe 1 aviso (tipo Licitação,
--      link da aba). A: prioridade Alta, "1 documento(s) vencem hoje e 2 vencem nos próximos dias",
--      os 3 documentos (+10, +3 e hoje), sem o de +7 nem os que não contam, e "1 documento(s) já
--      vencido(s)". B: prioridade Normal, "2 documento(s) vencem nos próximos dias", sem "vencem
--      hoje" e sem a frase dos vencidos. O aviso de uma empresa não cita documento da outra. A
--      empresa desativada não recebe. Sem WhatsApp, a fila fica vazia. A função devolve quantos
--      avisos criou;
--   3. rodar de novo no mesmo dia não cria aviso novo, e a função devolve o que criou (zero);
--   4. a configuração como authenticated: quem só vê não cria (RLS) e, com a configuração criada,
--      lê, mas o UPDATE não atinge linha; quem tem Lista → editar cria e altera; quem não tem
--      Oportunidades → Lista e quem está em outra empresa não leem; dias fora de 1 a 90,
--      destinatários que não são lista ou com 201 itens e uma segunda configuração viva da empresa
--      são recusados (200 itens passam);
--   5. a RPC habilitacao_usuarios_da_empresa como authenticated: quem edita recebe os usuários
--      ativos da empresa do token (e-mail em minúsculas, nome, se tem telefone, um por e-mail, por
--      nome), sem o inativo e sem os da outra empresa; quem só vê, quem não tem a permissão, o
--      token sem empresa e o token de empresa em que o usuário não tem vínculo são recusados;
--   6. com a configuração. A (7 dias, WhatsApp, destinatários: editar, ver, duplo, inativo e o dono
--      da B): só editar, ver e duplo recebem, a mensagem cita o de +7 e não o de +10, e a fila tem
--      2 linhas (editar e duplo, este com o telefone do vínculo que TEM telefone); o texto começa
--      com "SIGO Obras — <nome da empresa>". B (3 dias = marco repetido, WhatsApp, destinatário:
--      um usuário da A): recebe o dono da B (o usuário da A não é dela), a mensagem cita o de +3
--      UMA vez e a fila tem a linha dele, com o nome da B. Rodar de novo não duplica nada;
--   7. sem nenhum destinatário válido na A (inativo e e-mail de outra empresa), recebe o dono/Admin
--      dela, e o WhatsApp vai para quem tem telefone;
--   8. habilitacao_lembretes_acionar(): true com mensagem pendente; false quando só há mensagem
--      enviada, com 3 tentativas ou com mais de 36 horas;
--   9. authenticated não executa o alerta nem o acionamento, e não lê nem grava a fila;
--  10. os DOIS jobs existem (o alerta às 11:45 UTC e o reenvio a cada 30 minutos), as três
--      policies restritivas da configuração existem, cada uma no seu comando, a fila tem a coluna
--      da reserva e o anon não executa a RPC.
-- Nenhum UUID fixo: as empresas são criadas em tempo de execução.
--
-- O WhatsApp NÃO sai daqui. O acionamento chama net.http_post quando há mensagem pendente, mas
-- (a) o pg_net só grava o pedido numa tabela de fila e o worker dele só enxerga pedido de
-- transação confirmada: com o ROLLBACK ele some; e (b) mesmo que algum pedido escapasse, a
-- função habilitacao-lembretes só esvazia a fila já confirmada, e as linhas da fila deste smoke
-- também somem no ROLLBACK. Nada é enviado a ninguém.
--
-- As funções só do servidor são chamadas como o dono do banco: chamador_eh_servidor() aceita
-- sessão sem token fora do papel authenticator (0110:27-35), e o smoke confere isso antes de
-- começar. Não rode na hora do cron do alerta (08:45 de Brasília): os passos 2, 3 e 6 comparam o
-- número de avisos antes e depois de cada chamada.
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

-- avisos VIVOS de habilitação de uma empresa (de um usuário, se informado); some no ROLLBACK
create or replace function public.smoke_lemb_avisos(p_empresa uuid, p_email text default null)
returns bigint
language sql
as $f$
  select count(*)
    from public.notificacao n
   where n.empresa_id = p_empresa
     and n.deleted_at is null
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || p_empresa::text || ':%'
     and (p_email is null or n.usuario_email = p_email);
$f$;

-- todos os avisos de habilitação já gravados, de todas as empresas, vivos ou não: a diferença entre
-- antes e depois de uma chamada é o que ela criou; some no ROLLBACK
create or replace function public.smoke_lemb_total_de_avisos()
returns bigint
language sql
as $f$
  select count(*) from public.notificacao n where n.dados_extra ->> 'dedup_key' like 'habilitacao:%';
$f$;

do $$
declare
  v_a uuid;       -- empresa A
  v_b uuid;       -- empresa B
  v_c uuid;       -- empresa C (desativada)
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;  -- como a função calcula
  v_nome_a constant text := 'Smoke Lembretes A';
  v_nome_b constant text := 'Smoke Lembretes B (empresa sintética)';
  v_titulo constant text := 'Documentos de habilitação a vencer';
  v_dono constant text := 'smoke.lemb.dono@exemplo.test';
  v_editar constant text := 'smoke.lemb.editar@exemplo.test';
  v_ver constant text := 'smoke.lemb.ver@exemplo.test';
  v_sem constant text := 'smoke.lemb.sem@exemplo.test';
  v_duplo constant text := 'smoke.lemb.duplo@exemplo.test';
  v_inativo constant text := 'smoke.lemb.inativo@exemplo.test';
  v_dono_b constant text := 'smoke.lemb.donob@exemplo.test';
  v_dono_c constant text := 'smoke.lemb.donoc@exemplo.test';
  v_tel_editar constant text := '34999990000';
  v_tel_dono constant text := '34999990001';
  v_tel_duplo constant text := '34999990003';
  v_tel_dono_b constant text := '34999990004';
  v_cfg uuid;
  v_ret int;
  v_antes bigint;
  v_depois bigint;
  v_msg text;
  v_n bigint;
  v_pendente_real boolean;
  v_ordem text[];
  v_ordem_esperada text[];
  r record;
begin
  if to_regclass('public.acervo_documento') is null then
    raise exception 'Falta a migração 0154 (public.acervo_documento): aplique antes de rodar este smoke.';
  end if;
  if to_regclass('public.habilitacao_config') is null
     or to_regclass('public.habilitacao_lembrete_fila') is null
     or to_regprocedure('public.alertar_documentos_habilitacao()') is null
     or to_regprocedure('public.habilitacao_lembretes_acionar()') is null
     or to_regprocedure('public.habilitacao_usuarios_da_empresa()') is null then
    raise exception 'Falta a migração 0155 (lembretes de habilitação), ou ela está numa versão anterior: aplique antes de rodar este smoke.';
  end if;

  -- as funções do alerta só aceitam o servidor: sem token e fora do papel authenticator (0110:27-35)
  perform set_config('request.jwt.claims', '', true);
  if not public.chamador_eh_servidor() then
    raise exception 'FALHOU: o smoke tem de rodar como servidor (sessão sem token, fora do papel authenticator): a função só aceita o servidor';
  end if;

  -- empresas e vínculos sintéticos (como servidor: sem token)
  insert into public.empresa (nome, nome_fantasia)
  values ('Smoke Lembretes A (razão sintética)', v_nome_a)
  returning id into v_a;
  insert into public.empresa (nome, nome_fantasia) values (v_nome_b, '   ')
  returning id into v_b;
  insert into public.empresa (nome, ativo) values ('Smoke Lembretes C (desativada)', false)
  returning id into v_c;

  insert into public.usuario_empresa
    (empresa_id, usuario_email, perfil, is_owner, ativo, permissoes, nome_completo, telefone, created_at)
  values
    (v_a, v_dono, 'Admin', true, true, null, 'Smoke Dono', v_tel_dono, now()),
    (v_a, 'Smoke.Lemb.Editar@exemplo.test', 'Gestor', false, true,
       '{"Oportunidades":{"Lista":{"visualizar":true,"editar":true}}}'::jsonb, 'Smoke Editar', v_tel_editar, now()),
    (v_a, v_ver, 'Gestor', false, true,
       '{"Oportunidades":{"Lista":{"visualizar":true}}}'::jsonb, 'Smoke Ver', '   ', now()),
    (v_a, v_sem, 'Gestor', false, true,
       '{"Financeiro":{"Despesas":{"visualizar":true}}}'::jsonb, null, null, now()),
    -- o vínculo mais antigo de "duplo": sem telefone
    (v_a, v_duplo, 'Gestor', false, true, null, 'Smoke Duplo', '  ', now() - interval '2 days'),
    (v_a, v_inativo, 'Gestor', false, false, null, 'Smoke Inativo', '34999990002', now()),
    (v_b, v_dono_b, 'Admin', true, true, null, 'Smoke Dono B', v_tel_dono_b, now()),
    (v_c, v_dono_c, 'Admin', true, true, null, 'Smoke Dono C', '34999990005', now());

  -- o segundo vínculo vivo de "duplo" na mesma empresa (o unique caiu na 0023), este com telefone.
  -- Se a base não aceitar dois vínculos do mesmo e-mail, o telefone vai para o único vínculo: o resto
  -- do smoke vale igual, só o caso do vínculo repetido não é exercitado.
  begin
    insert into public.usuario_empresa
      (empresa_id, usuario_email, perfil, is_owner, ativo, permissoes, nome_completo, telefone, created_at)
    values
      (v_a, v_duplo, 'Gestor', false, true, null, 'Smoke Duplo (segundo vínculo)', v_tel_duplo,
       now() - interval '1 day');
  exception when unique_violation then
    update public.usuario_empresa set telefone = v_tel_duplo
     where empresa_id = v_a and usuario_email = v_duplo;
    raise notice 'PULADO: a base não aceita dois vínculos do mesmo e-mail na empresa; o caso do vínculo repetido não foi exercitado';
  end;

  -- 1. os documentos --------------------------------------------------------------------------------------------
  insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, validade, ativo, deleted_at)
  select d.empresa_id, d.tipo, d.nome,
         'habilitacao/' || d.empresa_id::text || '/2026/10/smoke-lembrete.pdf',
         d.validade, d.ativo, d.deleted_at
    from (values
      (v_a, 'cnd_federal', 'Smoke Lembrete D+10', v_hoje + 10, true, null::timestamptz),
      (v_a, 'crf_fgts', 'Smoke Lembrete D+3', v_hoje + 3, true, null),
      (v_a, 'cndt_trabalhista', 'Smoke Lembrete D+0', v_hoje, true, null),
      (v_a, 'cnd_estadual', 'Smoke Lembrete D+7', v_hoje + 7, true, null),
      (v_a, 'cnd_municipal', 'Smoke Lembrete vencido', v_hoje - 2, true, null),
      -- os três que não contam: fora de vigor, excluído e sem validade
      (v_a, 'cnd_federal', 'Smoke Lembrete fora de vigor', v_hoje + 10, false, null),
      (v_a, 'sicaf', 'Smoke Lembrete excluido', v_hoje + 10, true, now()),
      (v_a, 'alvara', 'Smoke Lembrete sem validade', null::date, true, null),
      -- empresa B: nada vence hoje
      (v_b, 'cnd_federal', 'Smoke Lembrete B D+10', v_hoje + 10, true, null),
      (v_b, 'crf_fgts', 'Smoke Lembrete B D+3', v_hoje + 3, true, null),
      (v_b, 'cnd_estadual', 'Smoke Lembrete B D+7', v_hoje + 7, true, null),
      -- empresa C (desativada): venceria hoje
      (v_c, 'cnd_federal', 'Smoke Lembrete C D+0', v_hoje, true, null)
    ) as d(empresa_id, tipo, nome, validade, ativo, deleted_at);
  raise notice '[1] documentos sintéticos criados (hoje = %)', v_hoje;

  -- 2. sem configuração: o dono/Admin de cada empresa recebe, sem WhatsApp --------------------------------------
  v_antes := public.smoke_lemb_total_de_avisos();
  v_ret := public.alertar_documentos_habilitacao();
  v_depois := public.smoke_lemb_total_de_avisos();
  if v_ret < 2 then
    raise exception 'FALHOU: sem configuração a função devolveu % (esperava pelo menos 2: o dono da A e o da B)', v_ret;
  end if;
  if v_ret <> v_depois - v_antes then
    raise exception 'FALHOU: a função devolveu % e criou % aviso(s) (deveria devolver o que criou)', v_ret, v_depois - v_antes;
  end if;

  -- empresa A
  if public.smoke_lemb_avisos(v_a) <> 1 or public.smoke_lemb_avisos(v_a, v_dono) <> 1 then
    raise exception 'FALHOU: sem configuração a empresa A deveria ter 1 aviso, o do dono/Admin (% no total, % dele)',
      public.smoke_lemb_avisos(v_a), public.smoke_lemb_avisos(v_a, v_dono);
  end if;
  select n.* into r from public.notificacao n
   where n.empresa_id = v_a and n.deleted_at is null and n.usuario_email = v_dono
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_a::text || ':%';
  if r.titulo is distinct from v_titulo then
    raise exception 'FALHOU: título do aviso "%"', r.titulo;
  end if;
  if r.tipo is distinct from 'Licitação' then
    raise exception 'FALHOU: tipo do aviso "%" (esperado Licitação)', r.tipo;
  end if;
  if r.link is distinct from '/AcervoTecnico?aba=habilitacao' then
    raise exception 'FALHOU: link do aviso "%"', r.link;
  end if;
  if r.prioridade is distinct from 'Alta' then
    raise exception 'FALHOU: prioridade do aviso da A "%" (esperada Alta: há documento que vence hoje)', r.prioridade;
  end if;
  if r.dados_extra ->> 'dedup_key'
       is distinct from 'habilitacao:' || v_a::text || ':' || v_hoje::text || '|' || v_dono then
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
  if strpos(v_msg, 'Smoke Lembrete B') > 0 or strpos(v_msg, 'Smoke Lembrete C') > 0 then
    raise exception 'FALHOU: o aviso da empresa A citou documento de outra empresa: %', v_msg;
  end if;
  if strpos(v_msg, '1 documento(s) vencem hoje e 2 vencem nos próximos dias: ') <> 1 then
    raise exception 'FALHOU: a mensagem da A deveria começar com "1 documento(s) vencem hoje e 2 vencem nos próximos dias: ": %', v_msg;
  end if;
  if strpos(v_msg, ' Há também 1 documento(s) já vencido(s).') = 0 then
    raise exception 'FALHOU: a mensagem deveria dizer "Há também 1 documento(s) já vencido(s).": %', v_msg;
  end if;
  if strpos(v_msg, 'Atualize em Oportunidades → Acervo técnico → Documentos e certidões.') = 0 then
    raise exception 'FALHOU: a mensagem deveria terminar com o caminho da tela: %', v_msg;
  end if;

  -- empresa B: nada vence hoje
  if public.smoke_lemb_avisos(v_b) <> 1 or public.smoke_lemb_avisos(v_b, v_dono_b) <> 1 then
    raise exception 'FALHOU: sem configuração a empresa B deveria ter 1 aviso, o do dono/Admin dela (% no total, % dele)',
      public.smoke_lemb_avisos(v_b), public.smoke_lemb_avisos(v_b, v_dono_b);
  end if;
  select n.* into r from public.notificacao n
   where n.empresa_id = v_b and n.deleted_at is null and n.usuario_email = v_dono_b
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_b::text || ':%';
  if r.prioridade is distinct from 'Normal' then
    raise exception 'FALHOU: prioridade do aviso da B "%" (esperada Normal: nada vence hoje)', r.prioridade;
  end if;
  v_msg := r.mensagem;
  if strpos(v_msg, '2 documento(s) vencem nos próximos dias: ') <> 1 then
    raise exception 'FALHOU: a mensagem da B deveria começar com "2 documento(s) vencem nos próximos dias: ": %', v_msg;
  end if;
  if strpos(v_msg, 'vencem hoje') > 0 or strpos(v_msg, 'já vencido') > 0 then
    raise exception 'FALHOU: a mensagem da B falou de documento que vence hoje ou já vencido (não há nenhum): %', v_msg;
  end if;
  if strpos(v_msg, 'Smoke Lembrete B D+10') = 0 or strpos(v_msg, 'Smoke Lembrete B D+3') = 0
     or strpos(v_msg, 'Smoke Lembrete B D+7') > 0 then
    raise exception 'FALHOU: a mensagem da B deveria citar os documentos de +10 e +3, e não o de +7: %', v_msg;
  end if;
  if strpos(v_msg, 'Smoke Lembrete D+') > 0 or strpos(v_msg, 'Smoke Lembrete C') > 0 then
    raise exception 'FALHOU: o aviso da empresa B citou documento de outra empresa: %', v_msg;
  end if;

  -- ninguém recebe aviso de empresa que não é a sua, e a empresa desativada não recebe nada
  if public.smoke_lemb_avisos(v_a, v_dono_b) <> 0 or public.smoke_lemb_avisos(v_b, v_dono) <> 0 then
    raise exception 'FALHOU: um usuário recebeu aviso de empresa que não é a dele';
  end if;
  if public.smoke_lemb_avisos(v_c) <> 0 then
    raise exception 'FALHOU: a empresa desativada recebeu % aviso(s)', public.smoke_lemb_avisos(v_c);
  end if;

  select count(*) into v_n from public.habilitacao_lembrete_fila where empresa_id in (v_a, v_b, v_c);
  if v_n <> 0 then
    raise exception 'FALHOU: sem WhatsApp ligado a fila deveria estar vazia e tem % linha(s)', v_n;
  end if;
  -- há mensagem pendente DE VERDADE na fila (de outra empresa)? Então o acionamento devolve true de
  -- qualquer jeito, e a conferência de "false" é pulada
  select exists (
    select 1 from public.habilitacao_lembrete_fila f
     where f.enviado_em is null and f.tentativas < 3 and f.criado_em > now() - interval '36 hours'
       and f.empresa_id not in (v_a, v_b, v_c)
  ) into v_pendente_real;
  if v_pendente_real then
    raise notice '[2] PULADO: há mensagem pendente de outra empresa na fila; "sem pendente" não foi conferido aqui';
  elsif public.habilitacao_lembretes_acionar() then
    raise exception 'FALHOU: sem mensagem pendente o acionamento deveria devolver false';
  end if;
  raise notice '[2] sem configuração: 1 aviso para o dono/Admin de cada empresa, com a mensagem certa e a fila vazia';

  -- 3. no mesmo dia, nada de aviso novo -------------------------------------------------------------------------
  v_antes := public.smoke_lemb_total_de_avisos();
  v_ret := public.alertar_documentos_habilitacao();
  v_depois := public.smoke_lemb_total_de_avisos();
  if public.smoke_lemb_avisos(v_a) <> 1 or public.smoke_lemb_avisos(v_b) <> 1 then
    raise exception 'FALHOU: rodar de novo no mesmo dia criou aviso novo (A: %, B: %; esperado 1 e 1)',
      public.smoke_lemb_avisos(v_a), public.smoke_lemb_avisos(v_b);
  end if;
  if v_ret <> v_depois - v_antes then
    raise exception 'FALHOU: rodar de novo devolveu % e criou % aviso(s) (deveria devolver o que criou: o aviso que já existia não conta)',
      v_ret, v_depois - v_antes;
  end if;
  raise notice '[3] rodar de novo no mesmo dia não cria aviso, e a função devolve só o que criou (%)', v_ret;

  -- 4. a configuração como authenticated ------------------------------------------------------------------------
  -- 4.1 quem só vê não cria: a policy restritiva de INSERT recusa (a configuração ainda não existe)
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('ver', v_a), true);
  set local role authenticated;
  perform public.smoke_lemb_recusa(format(
    'insert into public.habilitacao_config (empresa_id, dias_antecedencia) values (%L, 5)', v_a),
    '%row-level security%', '42501');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 4.2 quem tem Lista → editar cria e altera. O trigger set_updated_at não é SECURITY DEFINER: roda como
  --     authenticated, sob a RLS; um grant ou uma policy que falte derruba o INSERT/UPDATE, e só este passo pega.
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('editar', v_a), true);
  set local role authenticated;
  begin
    insert into public.habilitacao_config (empresa_id, dias_antecedencia, destinatarios, whatsapp)
    values (v_a, 10, '[]'::jsonb, false)
    returning id into v_cfg;
    -- 200 destinatários ainda passam
    update public.habilitacao_config
       set destinatarios = (select jsonb_agg('smoke.lemb.x' || g::text) from generate_series(1, 200) as g)
     where id = v_cfg;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'a lista de 200 destinatários não foi gravada (linhas=%)', v_n; end if;
    update public.habilitacao_config
       set dias_antecedencia = 7,
           destinatarios = jsonb_build_array(v_editar, v_ver, v_duplo, v_inativo, v_dono_b),
           whatsapp = true
     where id = v_cfg;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'a alteração não atingiu a configuração (linhas=%)', v_n; end if;
    select count(*) into v_n from public.habilitacao_config
     where id = v_cfg and dias_antecedencia = 7 and whatsapp and jsonb_array_length(destinatarios) = 5;
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
    'update public.habilitacao_config set destinatarios = %L::jsonb where id = %L', '"texto"', v_cfg),
    '%habilitacao_config_destinatarios_check%', '23514');
  perform public.smoke_lemb_recusa(format(
    'update public.habilitacao_config set destinatarios = (select jsonb_agg(%L || g::text) from generate_series(1, 201) as g) where id = %L',
    'smoke.lemb.x', v_cfg),
    '%habilitacao_config_destinatarios_check%', '23514');
  perform public.smoke_lemb_recusa(format(
    'insert into public.habilitacao_config (empresa_id, dias_antecedencia) values (%L, 5)', v_a),
    '%habilitacao_config_empresa_uidx%', '23505');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 4.3 quem só vê lê a configuração, mas o UPDATE não atinge linha (nem a edição, nem a exclusão lógica)
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('ver', v_a), true);
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

  -- 4.4 quem não tem Oportunidades → Lista não lê a configuração (policy restritiva de SELECT), e quem está
  --     em outra empresa também não (policy da empresa)
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('sem', v_a), true);
  set local role authenticated;
  select count(*) into v_n from public.habilitacao_config where empresa_id = v_a;
  if v_n <> 0 then
    raise exception 'FALHOU: quem não tem Oportunidades → Lista leu % configuração(ões)', v_n;
  end if;
  reset role;
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('donob', v_b), true);
  set local role authenticated;
  select count(*) into v_n from public.habilitacao_config where empresa_id = v_a;
  if v_n <> 0 then
    raise exception 'FALHOU: o Admin da empresa B leu % configuração(ões) da empresa A', v_n;
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.habilitacao_config
   where id = v_cfg and dias_antecedencia = 7 and deleted_at is null;
  if v_n <> 1 then raise exception 'FALHOU: a configuração mudou depois das tentativas de quem só vê'; end if;
  raise notice '[4] configuração: quem edita cria e altera; quem só vê lê e não grava; sem permissão ou de outra empresa não lê; valores inválidos recusados';

  -- 5. a RPC do cartão "Quem recebe" como authenticated ----------------------------------------------------------
  -- 5.1 quem edita recebe os usuários ativos da empresa do token: um por e-mail, sem o inativo e sem os da B
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('editar', v_a), true);
  set local role authenticated;
  for r in
    select * from (values
      (v_dono, 'Smoke Dono', true),
      (v_editar, 'Smoke Editar', true),   -- o e-mail gravado com maiúsculas sai em minúsculas
      (v_ver, 'Smoke Ver', false),        -- telefone em branco
      (v_sem, v_sem, false),              -- sem nome: aparece o e-mail
      (v_duplo, 'Smoke Duplo', true)      -- o nome do vínculo mais antigo; tem telefone porque um deles tem
    ) as e(email, nome, tem_telefone)
  loop
    select count(*) into v_n from public.habilitacao_usuarios_da_empresa() u
     where u.usuario_email = r.email and u.nome = r.nome and u.tem_telefone = r.tem_telefone;
    if v_n <> 1 then
      raise exception 'FALHOU: a RPC deveria devolver 1 linha de % com nome "%" e tem_telefone = % (devolveu %)',
        r.email, r.nome, r.tem_telefone, v_n;
    end if;
  end loop;
  select count(*) into v_n from public.habilitacao_usuarios_da_empresa();
  if v_n <> 5 then
    raise exception 'FALHOU: a RPC deveria devolver os 5 usuários ativos da empresa A, um por e-mail (devolveu %)', v_n;
  end if;
  select count(*) into v_n from public.habilitacao_usuarios_da_empresa() u
   where u.usuario_email in (v_inativo, v_dono_b, v_dono_c);
  if v_n <> 0 then
    raise exception 'FALHOU: a RPC devolveu o usuário inativo ou usuário de outra empresa (% linha(s))', v_n;
  end if;
  select array_agg(u.usuario_email) into v_ordem from public.habilitacao_usuarios_da_empresa() u;
  select array_agg(u.usuario_email order by lower(u.nome), u.usuario_email) into v_ordem_esperada
    from public.habilitacao_usuarios_da_empresa() u;
  if v_ordem is distinct from v_ordem_esperada then
    raise exception 'FALHOU: a RPC deveria devolver os usuários por nome (veio %, esperado %)', v_ordem, v_ordem_esperada;
  end if;
  reset role;

  -- 5.2 quem só vê e quem não tem a permissão são recusados (pela função, não por falta de grant)
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('ver', v_a), true);
  set local role authenticated;
  perform public.smoke_lemb_recusa('select * from public.habilitacao_usuarios_da_empresa()', 'Acesso negado', '42501');
  reset role;
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('sem', v_a), true);
  set local role authenticated;
  perform public.smoke_lemb_recusa('select * from public.habilitacao_usuarios_da_empresa()', 'Acesso negado', '42501');
  reset role;

  -- 5.3 token sem empresa, e token de uma empresa em que o usuário não tem vínculo
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('editar', null), true);
  set local role authenticated;
  perform public.smoke_lemb_recusa('select * from public.habilitacao_usuarios_da_empresa()', 'Acesso negado', '42501');
  reset role;
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('editar', v_b), true);
  set local role authenticated;
  perform public.smoke_lemb_recusa('select * from public.habilitacao_usuarios_da_empresa()', 'Acesso negado', '42501');
  reset role;

  -- 5.4 o Admin da B, com o token na B, recebe só os usuários da B
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('donob', v_b), true);
  set local role authenticated;
  select count(*) into v_n from public.habilitacao_usuarios_da_empresa() u
   where u.usuario_email = v_dono_b and u.nome = 'Smoke Dono B' and u.tem_telefone;
  if v_n <> 1 then raise exception 'FALHOU: a RPC deveria devolver o dono da empresa B para ele mesmo'; end if;
  select count(*) into v_n from public.habilitacao_usuarios_da_empresa();
  if v_n <> 1 then
    raise exception 'FALHOU: com o token na empresa B a RPC deveria devolver 1 usuário (devolveu %)', v_n;
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 5.5 sem token (servidor) não há empresa: recusado
  perform public.smoke_lemb_recusa('select * from public.habilitacao_usuarios_da_empresa()', 'Acesso negado', '42501');
  raise notice '[5] RPC dos usuários: quem edita vê a empresa do token; os demais são recusados';

  -- 6. com a configuração -----------------------------------------------------------------------------------------
  -- B: 3 dias (o marco N coincide com o de 3 dias), WhatsApp, e como destinatário um usuário que é da A.
  -- O aviso de hoje da B é apagado para a mensagem nova (com 3 dias) poder ser conferida.
  insert into public.habilitacao_config (empresa_id, dias_antecedencia, destinatarios, whatsapp)
  values (v_b, 3, jsonb_build_array(v_editar), true);
  update public.notificacao set deleted_at = now()
   where empresa_id = v_b and dados_extra ->> 'dedup_key' like 'habilitacao:' || v_b::text || ':%';
  -- C: reativada, mas excluída. Continua sem receber.
  update public.empresa set ativo = true, deleted_at = now() where id = v_c;

  v_antes := public.smoke_lemb_total_de_avisos();
  v_ret := public.alertar_documentos_habilitacao();
  v_depois := public.smoke_lemb_total_de_avisos();
  if v_ret < 4 then
    raise exception 'FALHOU: com a configuração a função devolveu % (esperava pelo menos 4: editar, ver e duplo na A e o dono da B)', v_ret;
  end if;
  if v_ret <> v_depois - v_antes then
    raise exception 'FALHOU: a função devolveu % e criou % aviso(s) (deveria devolver o que criou)', v_ret, v_depois - v_antes;
  end if;

  -- empresa A: só editar, ver e duplo (escolhidos e ativos) recebem; o e-mail é gravado em minúsculas
  if public.smoke_lemb_avisos(v_a, v_editar) <> 1 or public.smoke_lemb_avisos(v_a, v_ver) <> 1
     or public.smoke_lemb_avisos(v_a, v_duplo) <> 1 then
    raise exception 'FALHOU: editar, ver e duplo deveriam receber 1 aviso cada (editar %, ver %, duplo %)',
      public.smoke_lemb_avisos(v_a, v_editar), public.smoke_lemb_avisos(v_a, v_ver),
      public.smoke_lemb_avisos(v_a, v_duplo);
  end if;
  if public.smoke_lemb_avisos(v_a, v_dono) <> 1 then
    raise exception 'FALHOU: o dono/Admin da A ficou com % aviso(s) (esperado 1, o do passo 2: não foi escolhido agora)',
      public.smoke_lemb_avisos(v_a, v_dono);
  end if;
  if public.smoke_lemb_avisos(v_a) <> 4 then
    raise exception 'FALHOU: a empresa A deveria ter 4 avisos (dono, editar, ver e duplo) e tem %: o inativo ou o usuário de outra empresa recebeu',
      public.smoke_lemb_avisos(v_a);
  end if;
  select n.mensagem into v_msg from public.notificacao n
   where n.empresa_id = v_a and n.deleted_at is null and n.usuario_email = v_editar
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_a::text || ':%';
  if strpos(v_msg, 'Smoke Lembrete D+7') = 0 or strpos(v_msg, 'Smoke Lembrete D+3') = 0
     or strpos(v_msg, 'Smoke Lembrete D+0') = 0 then
    raise exception 'FALHOU: com 7 dias a mensagem deveria citar os documentos de +7, +3 e hoje: %', v_msg;
  end if;
  if strpos(v_msg, 'Smoke Lembrete D+10') > 0 then
    raise exception 'FALHOU: com 7 dias a mensagem citou o documento de +10: %', v_msg;
  end if;
  if strpos(v_msg, '1 documento(s) vencem hoje e 2 vencem nos próximos dias: ') <> 1
     or strpos(v_msg, ' Há também 1 documento(s) já vencido(s).') = 0 then
    raise exception 'FALHOU: contagens da mensagem com 7 dias: %', v_msg;
  end if;

  -- a fila da A: 2 linhas, as de quem tem telefone (ver tem telefone em branco; o inativo nem recebe)
  select count(*) into v_n from public.habilitacao_lembrete_fila where empresa_id = v_a;
  if v_n <> 2 then
    raise exception 'FALHOU: a fila da A deveria ter 2 linhas (editar e duplo) e tem %', v_n;
  end if;
  select f.* into r from public.habilitacao_lembrete_fila f
   where f.empresa_id = v_a and f.usuario_email = v_editar;
  if r.id is null or r.telefone is distinct from v_tel_editar then
    raise exception 'FALHOU: a fila deveria ter a linha de editar com o telefone dele (veio %)', r.telefone;
  end if;
  if r.dedup_key is distinct from
       'habilitacao_wa:' || v_a::text || ':' || v_hoje::text || '|' || v_editar then
    raise exception 'FALHOU: dedup_key da fila "%"', r.dedup_key;
  end if;
  if r.enviado_em is not null or r.tentativas <> 0 or r.erro is not null or r.reivindicado_em is not null then
    raise exception 'FALHOU: a linha da fila deveria nascer pendente e sem reserva (enviado_em %, tentativas %, erro %, reivindicado_em %)',
      r.enviado_em, r.tentativas, r.erro, r.reivindicado_em;
  end if;
  -- o texto começa com o nome da empresa (o nome fantasia), depois o título e a mensagem
  if strpos(r.texto, 'SIGO Obras — ' || v_nome_a || E'\n' || v_titulo || E'\n' || '1 documento(s) vencem hoje') <> 1
     or strpos(r.texto, 'Smoke Lembrete D+7') = 0 then
    raise exception 'FALHOU: texto da fila da A: %', r.texto;
  end if;
  -- duplo: o telefone é o do vínculo que TEM telefone, não o do mais antigo (em branco)
  select count(*) into v_n from public.habilitacao_lembrete_fila f
   where f.empresa_id = v_a and f.usuario_email = v_duplo and f.telefone = v_tel_duplo;
  if v_n <> 1 then
    raise exception 'FALHOU: a fila deveria ter a linha de duplo com o telefone do vínculo que tem telefone';
  end if;

  -- empresa B: o destinatário escolhido é da A, então recebe o dono/Admin da B; 3 dias = marco repetido
  if public.smoke_lemb_avisos(v_b) <> 1 or public.smoke_lemb_avisos(v_b, v_dono_b) <> 1 then
    raise exception 'FALHOU: a empresa B deveria ter 1 aviso vivo, o do dono/Admin dela (% no total, % dele)',
      public.smoke_lemb_avisos(v_b), public.smoke_lemb_avisos(v_b, v_dono_b);
  end if;
  select n.* into r from public.notificacao n
   where n.empresa_id = v_b and n.deleted_at is null and n.usuario_email = v_dono_b
     and n.dados_extra ->> 'dedup_key' like 'habilitacao:' || v_b::text || ':%';
  v_msg := r.mensagem;
  if r.prioridade is distinct from 'Normal' then
    raise exception 'FALHOU: prioridade do aviso da B "%" (esperada Normal)', r.prioridade;
  end if;
  if strpos(v_msg, '1 documento(s) vencem nos próximos dias: Smoke Lembrete B D+3 (') <> 1 then
    raise exception 'FALHOU: com 3 dias a mensagem da B deveria começar com "1 documento(s) vencem nos próximos dias: Smoke Lembrete B D+3 (": %', v_msg;
  end if;
  if (length(v_msg) - length(replace(v_msg, 'Smoke Lembrete B D+3', ''))) / length('Smoke Lembrete B D+3') <> 1 then
    raise exception 'FALHOU: o documento de +3 deveria aparecer UMA vez (N = 3 repete o marco de 3 dias): %', v_msg;
  end if;
  if strpos(v_msg, 'Smoke Lembrete B D+10') > 0 or strpos(v_msg, 'Smoke Lembrete B D+7') > 0
     or strpos(v_msg, 'Smoke Lembrete D+') > 0 then
    raise exception 'FALHOU: com 3 dias a mensagem da B citou documento fora do marco ou de outra empresa: %', v_msg;
  end if;
  select count(*) into v_n from public.habilitacao_lembrete_fila where empresa_id = v_b;
  if v_n <> 1 then
    raise exception 'FALHOU: a fila da B deveria ter 1 linha (o dono dela) e tem %', v_n;
  end if;
  select f.* into r from public.habilitacao_lembrete_fila f where f.empresa_id = v_b;
  if r.usuario_email is distinct from v_dono_b or r.telefone is distinct from v_tel_dono_b then
    raise exception 'FALHOU: a linha da fila da B deveria ser do dono dela, com o telefone dele (veio % / %)',
      r.usuario_email, r.telefone;
  end if;
  -- sem nome fantasia, vale o nome da empresa; o texto de uma empresa não leva o nome da outra
  if strpos(r.texto, 'SIGO Obras — ' || v_nome_b || E'\n' || v_titulo || E'\n' || '1 documento(s) vencem nos próximos dias') <> 1
     or strpos(r.texto, v_nome_a) > 0 then
    raise exception 'FALHOU: texto da fila da B: %', r.texto;
  end if;
  -- a empresa excluída continua sem receber, e ninguém entra na fila de outra empresa
  if public.smoke_lemb_avisos(v_c) <> 0 then
    raise exception 'FALHOU: a empresa excluída recebeu % aviso(s)', public.smoke_lemb_avisos(v_c);
  end if;
  select count(*) into v_n from public.habilitacao_lembrete_fila f
   where f.empresa_id = v_c
      or (f.empresa_id = v_a and f.usuario_email not in (v_editar, v_duplo))
      or (f.empresa_id = v_b and f.usuario_email <> v_dono_b);
  if v_n <> 0 then
    raise exception 'FALHOU: há % linha(s) na fila para quem não deveria receber', v_n;
  end if;

  -- rodar de novo: nem aviso nem linha de fila a mais
  v_antes := public.smoke_lemb_total_de_avisos();
  v_ret := public.alertar_documentos_habilitacao();
  v_depois := public.smoke_lemb_total_de_avisos();
  select count(*) into v_n from public.habilitacao_lembrete_fila where empresa_id in (v_a, v_b, v_c);
  if v_n <> 3 then
    raise exception 'FALHOU: rodar de novo mudou a fila (% linhas, esperado 3: 2 da A e 1 da B)', v_n;
  end if;
  if public.smoke_lemb_avisos(v_a) <> 4 or public.smoke_lemb_avisos(v_b) <> 1 then
    raise exception 'FALHOU: rodar de novo mudou os avisos (A: %, B: %; esperado 4 e 1)',
      public.smoke_lemb_avisos(v_a), public.smoke_lemb_avisos(v_b);
  end if;
  if v_ret <> v_depois - v_antes then
    raise exception 'FALHOU: rodar de novo devolveu % e criou % aviso(s)', v_ret, v_depois - v_antes;
  end if;
  raise notice '[6] com configuração: só os escolhidos de cada empresa recebem; fila com o nome da empresa; rodar de novo não duplica';

  -- 7. sem nenhum destinatário válido na A: dono/Admin (e o WhatsApp dele, que tem telefone) ------------------
  update public.notificacao set deleted_at = now()
   where empresa_id = v_a and dados_extra ->> 'dedup_key' like 'habilitacao:' || v_a::text || ':%';
  delete from public.habilitacao_lembrete_fila where empresa_id = v_a;
  update public.habilitacao_config
     set destinatarios = jsonb_build_array(v_inativo, v_dono_b)
   where id = v_cfg;
  perform public.alertar_documentos_habilitacao();
  if public.smoke_lemb_avisos(v_a) <> 1 or public.smoke_lemb_avisos(v_a, v_dono) <> 1 then
    raise exception 'FALHOU: sem destinatário válido só o dono/Admin da A deveria receber (% no total, % dele)',
      public.smoke_lemb_avisos(v_a), public.smoke_lemb_avisos(v_a, v_dono);
  end if;
  select count(*) into v_n from public.habilitacao_lembrete_fila where empresa_id = v_a;
  if v_n <> 1 then
    raise exception 'FALHOU: sem destinatário válido a fila da A deveria ter 1 linha (o dono/Admin) e tem %', v_n;
  end if;
  select count(*) into v_n from public.habilitacao_lembrete_fila
   where empresa_id = v_a and usuario_email = v_dono and telefone = v_tel_dono;
  if v_n <> 1 then
    raise exception 'FALHOU: o WhatsApp do dono/Admin (que tem telefone) deveria estar na fila (% linha(s))', v_n;
  end if;
  raise notice '[7] sem destinatário válido: recebe o dono/Admin da empresa';

  -- 8. o acionamento do envio ---------------------------------------------------------------------------------
  -- há mensagem pendente (as da fila deste smoke): true. O pedido do pg_net some no ROLLBACK.
  if not public.habilitacao_lembretes_acionar() then
    raise exception 'FALHOU: com mensagem pendente na fila o acionamento deveria devolver true';
  end if;
  -- de novo: as rodadas acima podem ter enfileirado mensagem de outra empresa (dentro desta transação)
  select exists (
    select 1 from public.habilitacao_lembrete_fila f
     where f.enviado_em is null and f.tentativas < 3 and f.criado_em > now() - interval '36 hours'
       and f.empresa_id not in (v_a, v_b, v_c)
  ) into v_pendente_real;
  if v_pendente_real then
    raise notice '[8] PULADO: há mensagem pendente de outra empresa na fila; os casos de "false" não foram conferidos';
  else
    -- esgotadas as tentativas
    update public.habilitacao_lembrete_fila set tentativas = 3 where empresa_id in (v_a, v_b);
    if public.habilitacao_lembretes_acionar() then
      raise exception 'FALHOU: mensagem com 3 tentativas não é pendente: o acionamento deveria devolver false';
    end if;
    -- criadas há mais de 36 horas
    update public.habilitacao_lembrete_fila
       set tentativas = 0, criado_em = now() - interval '37 hours'
     where empresa_id in (v_a, v_b);
    if public.habilitacao_lembretes_acionar() then
      raise exception 'FALHOU: mensagem com mais de 36 horas não é pendente: o acionamento deveria devolver false';
    end if;
    -- já enviadas
    update public.habilitacao_lembrete_fila
       set criado_em = now(), enviado_em = now()
     where empresa_id in (v_a, v_b);
    if public.habilitacao_lembretes_acionar() then
      raise exception 'FALHOU: mensagem enviada não é pendente: o acionamento deveria devolver false';
    end if;
    -- de volta a pendente (a reserva de quem está enviando não tira a mensagem da conta)
    update public.habilitacao_lembrete_fila
       set enviado_em = null, reivindicado_em = now()
     where empresa_id in (v_a, v_b);
    if not public.habilitacao_lembretes_acionar() then
      raise exception 'FALHOU: de volta a pendente, o acionamento deveria devolver true';
    end if;
  end if;
  raise notice '[8] acionamento: true com pendente; false com enviada, 3 tentativas ou mais de 36 horas';

  -- 9. authenticated não executa as funções do servidor nem mexe na fila ----------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lemb_claims('editar', v_a), true);
  set local role authenticated;
  perform public.smoke_lemb_recusa('select public.alertar_documentos_habilitacao()',
    'permission denied for function alertar_documentos_habilitacao%', '42501');
  perform public.smoke_lemb_recusa('select public.habilitacao_lembretes_acionar()',
    'permission denied for function habilitacao_lembretes_acionar%', '42501');
  perform public.smoke_lemb_recusa('select count(*) from public.habilitacao_lembrete_fila',
    'permission denied for table habilitacao_lembrete_fila%', '42501');
  perform public.smoke_lemb_recusa(format(
    'insert into public.habilitacao_lembrete_fila (empresa_id, usuario_email, telefone, texto, dedup_key) values (%L, %L, %L, %L, %L)',
    v_a, v_editar, v_tel_editar, 'Smoke', 'smoke-lemb-fila-authenticated'),
    'permission denied for table habilitacao_lembrete_fila%', '42501');
  perform public.smoke_lemb_recusa(format(
    'update public.habilitacao_lembrete_fila set enviado_em = now() where empresa_id = %L', v_a),
    'permission denied for table habilitacao_lembrete_fila%', '42501');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[9] authenticated não executa o alerta nem o acionamento, e não acessa a fila';

  -- 10. os jobs, as policies restritivas da configuração, a reserva da fila e os privilégios da RPC ------------
  select count(*) into v_n from cron.job
   where jobname = 'alertar_documentos_habilitacao' and schedule = '45 11 * * *'
     and command like '%alertar_documentos_habilitacao()%' and active;
  if v_n <> 1 then raise exception 'FALHOU: job alertar_documentos_habilitacao ausente, inativo ou com outro horário'; end if;
  select count(*) into v_n from cron.job
   where jobname = 'habilitacao_lembretes_reenvio' and schedule = '*/30 * * * *'
     and command like '%habilitacao_lembretes_acionar()%' and active;
  if v_n <> 1 then raise exception 'FALHOU: job habilitacao_lembretes_reenvio ausente, inativo ou com outro horário'; end if;
  for r in
    select * from (values
      ('habilitacao_config_ler_com_permissao', 'SELECT'),
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
  if v_n <> 3 then raise exception 'FALHOU: % policies restritivas na configuração (esperado 3)', v_n; end if;
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'habilitacao_lembrete_fila'
     and column_name = 'reivindicado_em' and data_type = 'timestamp with time zone';
  if v_n <> 1 then raise exception 'FALHOU: a fila não tem a coluna reivindicado_em (timestamptz)'; end if;
  if has_function_privilege('anon', 'public.habilitacao_usuarios_da_empresa()', 'execute')
     or not has_function_privilege('authenticated', 'public.habilitacao_usuarios_da_empresa()', 'execute') then
    raise exception 'FALHOU: a RPC habilitacao_usuarios_da_empresa deveria ser executável pelo authenticated e não pelo anon';
  end if;
  raise notice '[10] jobs agendados, policies restritivas, reserva da fila e privilégios da RPC ok';

  raise notice 'SMOKE TEST OK';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro
select 'SMOKE TEST OK: lembretes de habilitação (0155)' as res;

rollback;
