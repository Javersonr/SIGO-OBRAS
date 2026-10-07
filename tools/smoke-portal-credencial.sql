-- ============================================================================
-- smoke-portal-credencial.sql — valida a 0145 (e a 0146): o Portal do Funcionário com um login em mais de uma
-- empresa (T38; spec docs/superpowers/specs/2026-10-07-portal-varias-empresas-design.md).
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria funcionários, credenciais e vínculos SINTÉTICOS
-- ("SMOKE T38 ...", CPFs 9999999990x que não são de ninguém) nas duas empresas mais antigas e confere as regras do
-- banco. Nada é persistido. As linhas do registro do operador e da trilha só saem pelo ROLLBACK (são só de
-- inclusão): rode o arquivo inteiro, de uma vez, e não tire o `begin;` do começo nem o `rollback;` do fim.
--
-- As empresas são escolhidas em tempo de execução (as duas mais antigas): nenhum UUID fixo neste arquivo. Para usar
-- outras, troque os filtros do passo 1 por `and id = '<empresa_teste>'`.
--
-- O que confere:
--   0. o catálogo: RLS ligada e sem policy em portal_credencial e portal_credencial_evento; anon e authenticated
--      sem privilégio nelas nem no vínculo; o índice único do usuário e o parcial "um vínculo ativo por pessoa e
--      empresa"; o trigger da credencial sem vínculo; o registro do operador só de inclusão; as funções da 0145 sem
--      EXECUTE para anon e authenticated;
--   1. a CÓPIA da 0145 nos tipos de linha (§9.1): CPF com senha pessoal (credencial com o hash, geração 1, origem =
--      a empresa; vínculo liberado e confirmado), CPF com provisória pendente (credencial sem senha, geração 0;
--      o hash vira a provisória do vínculo, sem vencimento), usuário com letras e usuário numérico que não é o CPF
--      (os dois 'manual'); a cópia repetida não mexe no que já foi copiado; e o caso da 0146 (linha antiga de um CPF
--      que já tem credencial é LIGADA a ela, sem liberação). Só roda enquanto as colunas antigas existem (entre a
--      0145 e a 0146); depois da 0146 o passo avisa e segue;
--   2. o índice parcial: um segundo vínculo ATIVO da mesma pessoa na mesma empresa é recusado (23505); inativo, ou
--      em outra empresa, passa;
--   3. o trigger: a credencial some quando o último vínculo é apagado ou religado a outra credencial (update), e fica
--      enquanto tem vínculo;
--   4. o procedimento do operador (§4.3) numa credencial sintética com uma empresa conferida e uma ocupante: recusa
--      sem quem pediu, sem a confirmação, com conferida sem vínculo ativo e com ocupante sem vínculo (nada muda);
--      depois, o hash fica preenchido (bcrypt) e diferente, a origem e o bloqueio zeram, a geração e a versão da
--      sessão sobem, nenhum vínculo fica liberado nem com provisória, só a conferida fica confirmada, a ocupante fica
--      desativada (com a sessão derrubada), a trilha recebe acesso_aguardando_provisoria e acesso_desativado, e o
--      registro do operador guarda quem pediu (a função é a mesma que o tools/portal-credencial-redefinir.sql chama);
--   5. o registro do operador não aceita UPDATE nem DELETE (42501);
--   6. authenticated e anon não leem a credencial nem o registro do operador (42501).
--
-- Como rodar (precisa da 0145 aplicada; o passo 1 só testa a cópia antes da 0146):
--   supabase db query --linked -f tools/smoke-portal-credencial.sql
-- Deve terminar imprimindo "SMOKE TEST OK".
-- ============================================================================

begin;

-- tenta o comando e exige que ele seja RECUSADO com o estado esperado (padrão 42501). Roda com os direitos de quem
-- chama (SECURITY INVOKER). Some no ROLLBACK.
create or replace function public.smoke_t38_recusa(p_sql text, p_estado text default '42501')
returns void
language plpgsql
as $f$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_estado then
      raise exception 'FALHOU: esperava % e veio % (%) em: %', p_estado, sqlstate, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'FALHOU: o comando não foi recusado: %', p_sql;
end;
$f$;

do $smoke$
declare
  v_emp1 uuid;
  v_emp2 uuid;
  v_hash constant text := '$2a$10$' || repeat('S', 53);
  v_hash_prov constant text := '$2a$10$' || repeat('P', 53);
  v_colunas_antigas boolean;
  v_f1 uuid;
  v_f2 uuid;
  v_f3 uuid;
  v_f4 uuid;
  v_f5 uuid;
  v_fa uuid;
  v_fa2 uuid;
  v_fb uuid;
  v_fc uuid;
  v_fo uuid;
  v_cred uuid;
  v_cred2 uuid;
  v_cred3 uuid;
  v_cred_op uuid;
  c record;
  v record;
  v_res jsonb;
  v_n integer;
begin
  -- 0. catálogo ----------------------------------------------------------------------------------------------------
  if not (select relrowsecurity from pg_class where oid = 'public.portal_credencial'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.portal_credencial_evento'::regclass) then
    raise exception 'FALHOU: RLS desligada em portal_credencial ou portal_credencial_evento';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename in ('portal_credencial', 'portal_credencial_evento')
  ) then
    raise exception 'FALHOU: portal_credencial e portal_credencial_evento não podem ter policy (só o servidor)';
  end if;
  if has_table_privilege('anon', 'public.portal_credencial', 'select')
     or has_table_privilege('authenticated', 'public.portal_credencial', 'select')
     or has_table_privilege('authenticated', 'public.portal_credencial', 'update')
     or has_table_privilege('anon', 'public.portal_credencial_evento', 'select')
     or has_table_privilege('authenticated', 'public.portal_credencial_evento', 'select')
     or has_table_privilege('authenticated', 'public.portal_credencial_evento', 'insert')
     or has_table_privilege('authenticated', 'public.funcionario_portal_acesso', 'select')
     or has_table_privilege('anon', 'public.funcionario_portal_acesso', 'select') then
    raise exception 'FALHOU: anon/authenticated com privilégio na credencial, no registro ou no vínculo';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'portal_credencial_usuario_uidx')
  then
    raise exception 'FALHOU: falta o índice único do usuário da credencial';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'funcionario_portal_acesso_credencial_empresa_uidx'
       and indexdef ilike '%unique%' and indexdef ilike '%where ativo%'
  ) then
    raise exception 'FALHOU: falta o índice único parcial (credencial_id, empresa_id) where ativo';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.funcionario_portal_acesso'::regclass and tgname = 'portal_credencial_sem_vinculo'
  ) or not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.portal_credencial_evento'::regclass and tgname = 'trilha_imutavel'
  ) then
    raise exception 'FALHOU: falta o trigger da credencial sem vínculo ou o do registro só de inclusão';
  end if;
  if has_function_privilege('authenticated',
       'public.portal_credencial_redefinir_pelo_operador(text, uuid, uuid[], text, text)', 'execute')
     or has_function_privilege('anon',
       'public.portal_credencial_redefinir_pelo_operador(text, uuid, uuid[], text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.portal_credencial_sem_vinculo()', 'execute') then
    raise exception 'FALHOU: as funções da 0145 não podem ser executadas pela API';
  end if;
  raise notice '[0] OK catálogo: RLS sem policy, sem privilégio para a API, índices, triggers e funções';

  -- massa: duas empresas e funcionários sintéticos ------------------------------------------------------------------
  select id into v_emp1 from public.empresa order by created_at limit 1;
  select id into v_emp2 from public.empresa where id <> v_emp1 order by created_at limit 1;
  if v_emp2 is null then
    raise exception 'O smoke precisa de duas empresas cadastradas';
  end if;
  raise notice '== empresas de teste: % e %', v_emp1, v_emp2;

  insert into public.funcionario (empresa_id, nome_completo, cpf) values (v_emp1, 'SMOKE T38 cópia 1', '99999999901')
    returning id into v_f1;
  insert into public.funcionario (empresa_id, nome_completo, cpf) values (v_emp1, 'SMOKE T38 cópia 2', '99999999902')
    returning id into v_f2;
  insert into public.funcionario (empresa_id, nome_completo, cpf) values (v_emp1, 'SMOKE T38 cópia 3', '99999999903')  -- em produção funcionario.cpf é not null
    returning id into v_f3;
  insert into public.funcionario (empresa_id, nome_completo, cpf) values (v_emp1, 'SMOKE T38 cópia 4', '99999999904')
    returning id into v_f4;
  insert into public.funcionario (empresa_id, nome_completo, cpf) values (v_emp2, 'SMOKE T38 cópia 5', '99999999901')
    returning id into v_f5;
  insert into public.funcionario (empresa_id, nome_completo, cpf) values (v_emp1, 'SMOKE T38 A', '99999999921')
    returning id into v_fa;
  insert into public.funcionario (empresa_id, nome_completo, cpf) values (v_emp1, 'SMOKE T38 A readmitido', '99999999921')
    returning id into v_fa2;
  insert into public.funcionario (empresa_id, nome_completo, cpf) values (v_emp2, 'SMOKE T38 B', '99999999921')
    returning id into v_fb;
  insert into public.funcionario (empresa_id, nome_completo, cpf) values (v_emp1, 'SMOKE T38 conferida', '99999999931')
    returning id into v_fc;
  insert into public.funcionario (empresa_id, nome_completo, cpf) values (v_emp2, 'SMOKE T38 ocupante', '99999999931')
    returning id into v_fo;

  -- 1. a cópia (só entre a 0145 e a 0146) ------------------------------------------------------------------------------
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'funcionario_portal_acesso' and column_name = 'usuario'
  ) into v_colunas_antigas;

  if v_colunas_antigas then
    -- linhas do jeito da versão antiga: usuário e senha no vínculo, sem credencial
    execute format(
      'insert into public.funcionario_portal_acesso '
      '(funcionario_id, empresa_id, usuario, senha_hash, senha_provisoria, ativo, ultimo_acesso) values '
      '(%L, %L, %L, %L, false, true, now()), '
      '(%L, %L, %L, %L, true, true, null), '
      '(%L, %L, %L, %L, false, true, null), '
      '(%L, %L, %L, %L, false, true, null)',
      v_f1, v_emp1, '99999999901', v_hash,
      v_f2, v_emp1, '99999999902', v_hash_prov,
      v_f3, v_emp1, 'smoke.t38.letras', v_hash,
      v_f4, v_emp1, '99999999905', v_hash);
    perform public.portal_credencial_copiar_acessos();

    -- a) CPF com senha pessoal
    select * into c from public.portal_credencial where usuario = '99999999901';
    select * into v from public.funcionario_portal_acesso where funcionario_id = v_f1;
    if c.tipo <> 'cpf' or c.senha_hash is distinct from v_hash or c.senha_geracao <> 1
       or c.senha_origem_empresa_id is distinct from v_emp1 or v.credencial_id is distinct from c.id
       or v.geracao_liberada is distinct from 1 or v.confirmado_em is null or v.provisoria_hash is not null then
      raise exception 'FALHOU: cópia do acesso com senha pessoal (tipo %, geração %, liberada %)',
        c.tipo, c.senha_geracao, v.geracao_liberada;
    end if;
    -- b) CPF com provisória pendente
    select * into c from public.portal_credencial where usuario = '99999999902';
    select * into v from public.funcionario_portal_acesso where funcionario_id = v_f2;
    if c.tipo <> 'cpf' or c.senha_hash is not null or c.senha_geracao <> 0 or c.senha_origem_empresa_id is not null
       or v.provisoria_hash is distinct from v_hash_prov or v.provisoria_expira_em is not null
       or v.provisoria_criada_em is null or v.geracao_liberada is not null or v.confirmado_em is not null then
      raise exception 'FALHOU: cópia do acesso com provisória pendente';
    end if;
    -- c) usuário com letras e d) numérico que não é o CPF do cadastro: manual
    if (select tipo from public.portal_credencial where usuario = 'smoke.t38.letras') is distinct from 'manual'
       or (select tipo from public.portal_credencial where usuario = '99999999905') is distinct from 'manual' then
      raise exception 'FALHOU: usuário com letras e usuário numérico que não é o CPF deveriam virar manual';
    end if;
    -- a cópia repetida não mexe no que já foi copiado
    select credencial_id into v_cred from public.funcionario_portal_acesso where funcionario_id = v_f1;
    perform public.portal_credencial_copiar_acessos();
    if (select credencial_id from public.funcionario_portal_acesso where funcionario_id = v_f1) is distinct from v_cred
       or (select count(*) from public.portal_credencial where usuario = '99999999901') <> 1 then
      raise exception 'FALHOU: a cópia repetida mexeu no que já estava copiado';
    end if;
    -- o caso da 0146: linha antiga (sem credencial) de um CPF que já tem credencial é LIGADA a ela, sem liberação
    execute format(
      'insert into public.funcionario_portal_acesso '
      '(funcionario_id, empresa_id, usuario, senha_hash, senha_provisoria, ativo) values (%L, %L, %L, %L, true, true)',
      v_f5, v_emp2, '99999999901 ', v_hash_prov);
    perform public.portal_credencial_copiar_acessos();
    select * into v from public.funcionario_portal_acesso where funcionario_id = v_f5;
    if v.credencial_id is distinct from v_cred or v.geracao_liberada is not null or v.confirmado_em is not null
       or v.provisoria_hash is distinct from v_hash_prov or not v.ativo then
      raise exception 'FALHOU: a linha antiga do mesmo CPF deveria ser ligada à credencial existente, sem liberação';
    end if;
    raise notice '[1] OK cópia: senha pessoal, provisória, manual, repetição e a ligação da 0146';
  else
    raise notice '[1] as colunas antigas já saíram (0146): a cópia não é testada';
  end if;

  -- 2. índice parcial: um vínculo ATIVO por pessoa e empresa ------------------------------------------------------------
  insert into public.portal_credencial (usuario, tipo, senha_hash, senha_geracao)
    values ('99999999921', 'cpf', v_hash, 1) returning id into v_cred;
  insert into public.funcionario_portal_acesso (funcionario_id, empresa_id, credencial_id, ativo, geracao_liberada, confirmado_em)
    values (v_fa, v_emp1, v_cred, true, 1, now());
  perform public.smoke_t38_recusa(format(
    'insert into public.funcionario_portal_acesso (funcionario_id, empresa_id, credencial_id, ativo) values (%L, %L, %L, true)',
    v_fa2, v_emp1, v_cred), '23505');
  insert into public.funcionario_portal_acesso (funcionario_id, empresa_id, credencial_id, ativo)
    values (v_fa2, v_emp1, v_cred, false);
  insert into public.funcionario_portal_acesso (funcionario_id, empresa_id, credencial_id, ativo, geracao_liberada, confirmado_em)
    values (v_fb, v_emp2, v_cred, true, 1, now());
  -- o usuário da credencial é único (sem diferença de maiúsculas)
  perform public.smoke_t38_recusa(
    'insert into public.portal_credencial (usuario, tipo) values (''99999999921'', ''cpf'')', '23505');
  raise notice '[2] OK um vínculo ativo por pessoa e empresa; inativo e outra empresa passam; usuário único';

  -- 3. trigger da credencial sem vínculo -----------------------------------------------------------------------------
  delete from public.funcionario_portal_acesso where funcionario_id = v_fa2;
  if not exists (select 1 from public.portal_credencial where id = v_cred) then
    raise exception 'FALHOU: a credencial com vínculos não pode sumir';
  end if;
  insert into public.portal_credencial (usuario, tipo) values ('99999999922', 'cpf') returning id into v_cred2;
  update public.funcionario_portal_acesso set credencial_id = v_cred2 where funcionario_id = v_fb;
  if not exists (select 1 from public.portal_credencial where id = v_cred) then
    raise exception 'FALHOU: a credencial ainda tem o vínculo da empresa 1';
  end if;
  delete from public.funcionario_portal_acesso where funcionario_id = v_fa;
  if exists (select 1 from public.portal_credencial where id = v_cred) then
    raise exception 'FALHOU: a credencial sem vínculo deveria ter sido apagada (delete)';
  end if;
  insert into public.portal_credencial (usuario, tipo) values ('99999999923', 'cpf') returning id into v_cred3;
  update public.funcionario_portal_acesso set credencial_id = v_cred3 where funcionario_id = v_fb;
  if exists (select 1 from public.portal_credencial where id = v_cred2) then
    raise exception 'FALHOU: a credencial sem vínculo deveria ter sido apagada (religação)';
  end if;
  raise notice '[3] OK a credencial some com o último vínculo (delete e religação) e fica enquanto tem vínculo';

  -- 4. o procedimento do operador --------------------------------------------------------------------------------------
  insert into public.portal_credencial (
    usuario, tipo, senha_hash, senha_geracao, senha_origem_empresa_id, sessao_versao, tentativas, bloqueado_ate
  ) values ('99999999931', 'cpf', v_hash, 2, v_emp2, 4, 3, now() + interval '10 minutes')
  returning id into v_cred_op;
  -- a conferida (empresa 1) estava liberada, com uma provisória pendente; a ocupante (empresa 2), liberada e
  -- confirmada (foi ela que criou a primeira senha)
  insert into public.funcionario_portal_acesso (
    funcionario_id, empresa_id, credencial_id, ativo, sessao_versao, geracao_liberada, confirmado_em,
    provisoria_hash, provisoria_criada_em, provisoria_expira_em
  ) values
    (v_fc, v_emp1, v_cred_op, true, 1, 2, null, v_hash_prov, now(), now() + interval '7 days'),
    (v_fo, v_emp2, v_cred_op, true, 3, 2, now() - interval '10 days', null, null, null);

  -- recusas: nada muda
  perform public.smoke_t38_recusa(format(
    'select public.portal_credencial_redefinir_pelo_operador(%L, %L::uuid, array[%L]::uuid[], %L, %L)',
    '999.999.999-31', v_emp1, v_emp2, '', 'pessoa por vídeo'), 'P0001');
  perform public.smoke_t38_recusa(format(
    'select public.portal_credencial_redefinir_pelo_operador(%L, %L::uuid, array[%L]::uuid[], %L, %L)',
    '999.999.999-31', v_emp1, v_emp2, 'RH da empresa 1', ' '), 'P0001');
  perform public.smoke_t38_recusa(format(
    'select public.portal_credencial_redefinir_pelo_operador(%L, %L::uuid, array[]::uuid[], %L, %L)',
    '999.999.999-31', gen_random_uuid(), 'RH', 'pessoa por vídeo'), 'P0001');
  perform public.smoke_t38_recusa(format(
    'select public.portal_credencial_redefinir_pelo_operador(%L, %L::uuid, array[%L]::uuid[], %L, %L)',
    '999.999.999-31', v_emp1, gen_random_uuid(), 'RH', 'pessoa por vídeo'), 'P0001');
  perform public.smoke_t38_recusa(format(
    'select public.portal_credencial_redefinir_pelo_operador(%L, %L::uuid, array[%L]::uuid[], %L, %L)',
    '999.999.999-31', v_emp1, v_emp1, 'RH', 'pessoa por vídeo'), 'P0001');
  if (select senha_hash from public.portal_credencial where id = v_cred_op) is distinct from v_hash
     or (select count(*) from public.portal_credencial_evento where credencial_id = v_cred_op) <> 0 then
    raise exception 'FALHOU: a chamada recusada mudou a credencial ou gravou no registro';
  end if;

  -- com tudo certo (o usuário com pontuação é normalizado como no portal)
  v_res := public.portal_credencial_redefinir_pelo_operador(
    '999.999.999-31', v_emp1, array[v_emp2], 'RH da empresa 1 (smoke)', 'a própria pessoa, por vídeo (smoke)');
  select * into c from public.portal_credencial where id = v_cred_op;
  if c.senha_hash is null or c.senha_hash = v_hash or c.senha_hash !~ '^\$2' then
    raise exception 'FALHOU: a senha deveria virar um bcrypt novo, que ninguém conhece';
  end if;
  if c.senha_origem_empresa_id is not null or c.tentativas <> 0 or c.bloqueado_ate is not null
     or c.senha_geracao <> 3 or c.sessao_versao <> 5 then
    raise exception 'FALHOU: origem/bloqueio deveriam zerar e geração/sessão subir (geração %, sessão %)',
      c.senha_geracao, c.sessao_versao;
  end if;
  if exists (
    select 1 from public.funcionario_portal_acesso
     where credencial_id = v_cred_op and (geracao_liberada is not null or provisoria_hash is not null)
  ) then
    raise exception 'FALHOU: nenhum vínculo pode ficar liberado nem com provisória pendente';
  end if;
  select * into v from public.funcionario_portal_acesso where funcionario_id = v_fc;
  if v.confirmado_em is null or not v.ativo then
    raise exception 'FALHOU: a empresa conferida deveria ficar ativa e confirmada';
  end if;
  select * into v from public.funcionario_portal_acesso where funcionario_id = v_fo;
  if v.confirmado_em is not null or v.ativo or v.sessao_versao <> 4 then
    raise exception 'FALHOU: a ocupante deveria ficar desativada, sem confirmação e com a sessão derrubada';
  end if;
  if not exists (
    select 1 from public.treinamento_evento
     where funcionario_id = v_fc and evento = 'acesso_aguardando_provisoria' and detalhe ->> 'motivo' = 'suporte'
  ) or not exists (
    select 1 from public.treinamento_evento
     where funcionario_id = v_fo and evento = 'acesso_desativado' and detalhe ->> 'por' = 'suporte do SIGO'
  ) or exists (
    select 1 from public.treinamento_evento where funcionario_id = v_fo and evento = 'acesso_aguardando_provisoria'
  ) then
    raise exception 'FALHOU: a trilha da conferida e a da ocupante não receberam os eventos esperados';
  end if;
  select count(*) into v_n
    from public.portal_credencial_evento
   where credencial_id = v_cred_op
     and evento = 'credencial_redefinida_pelo_operador'
     and empresa_id = v_emp1
     and detalhe ->> 'pedido_por' = 'RH da empresa 1 (smoke)'
     and detalhe ->> 'confirmado_com' like 'a própria pessoa%'
     and detalhe -> 'ocupantes' ? v_emp2::text;
  if v_n <> 1 then
    raise exception 'FALHOU: o registro do operador deveria guardar a conferida, as ocupantes e quem pediu';
  end if;
  if (v_res ->> 'ocupantes_desativados')::int <> 1 or (v_res ->> 'vinculos_zerados')::int <> 2 then
    raise exception 'FALHOU: o resumo do procedimento não bate: %', v_res;
  end if;
  raise notice '[4] OK procedimento do operador: senha inutilizável, só a conferida confirmada, ocupante fora, registro';

  -- 5. o registro do operador é só de inclusão --------------------------------------------------------------------------
  perform public.smoke_t38_recusa(format(
    'update public.portal_credencial_evento set detalhe = null where credencial_id = %L', v_cred_op));
  perform public.smoke_t38_recusa(format(
    'delete from public.portal_credencial_evento where credencial_id = %L', v_cred_op));
  raise notice '[5] OK registro do operador sem UPDATE nem DELETE';

  -- 6. a API não lê a credencial nem o registro ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', gen_random_uuid(), 'app_metadata', jsonb_build_object('empresa_id', v_emp1)
  )::text, true);
  set local role authenticated;
  perform public.smoke_t38_recusa('select 1 from public.portal_credencial');
  perform public.smoke_t38_recusa('select 1 from public.portal_credencial_evento');
  perform public.smoke_t38_recusa('select 1 from public.funcionario_portal_acesso');
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  perform public.smoke_t38_recusa('select 1 from public.portal_credencial');
  perform public.smoke_t38_recusa('select 1 from public.portal_credencial_evento');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[6] OK authenticated e anon sem acesso à credencial, ao registro e ao vínculo';

  raise notice '============ SMOKE TEST OK (portal com um login em mais de uma empresa, 0145) ============';
end;
$smoke$;

-- só chega aqui se o bloco acima terminou sem erro (em psql sem ON_ERROR_STOP, a transação abortada recusa este
-- select e a linha não aparece)
select 'SMOKE TEST OK: portal com um login em mais de uma empresa (0145)' as res;

rollback;
