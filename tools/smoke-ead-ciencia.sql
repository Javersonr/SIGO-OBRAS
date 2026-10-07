-- ============================================================================
-- smoke-ead-ciencia.sql — valida a 0134: a ciência de entrega só é confirmada
-- pelo servidor (Portal do Funcionário), nunca pelo usuário da empresa.
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria entregas
-- descartáveis para um funcionário que já existe e simula, com
-- `set local role` + `request.jwt.claims`, o usuário da empresa (authenticated),
-- o servidor (service_role, como o portal-funcionario) e o anônimo. Nada é
-- persistido.
--
-- A empresa de teste é escolhida em tempo de execução (a do funcionário ativo
-- mais antigo: sem exclusão lógica e com `ativo` diferente de false, o mesmo
-- critério com que o portal deixa o funcionário entrar): nenhum UUID fixo neste
-- arquivo. Para testar outra empresa, troque o filtro do passo 1 por
-- `and f.empresa_id = '<empresa_teste>'`.
--
-- O que confere:
--   1. criar entrega pendente funciona (e nasce pendente, sem evidência, mesmo
--      que o usuário mande status "confirmada" no INSERT);
--   2. confirmar direto falha com 42501 (status, data e evidência, sozinhos ou
--      juntos), assim como mexer em dono, funcionário e autoria;
--   3. enquanto pendente, tipo/descricao/itens podem ser corrigidos;
--   4. o servidor confirma (e só a 1ª confirmação grava: UPDATE com
--      status = 'pendente' não atinge nada na 2ª vez);
--   5. confirmada, a linha não muda mais (nem volta a pendente), mas pode ser
--      excluída logicamente e a evidência continua no banco;
--   6. DELETE/TRUNCATE de verdade e o acesso anônimo falham com 42501;
--   7. super admin passa (como o servidor).
--
-- Como rodar (precisa da migração 0134 já aplicada):
--   supabase db query --linked -f tools/smoke-ead-ciencia.sql
--   -- ou: psql "$DATABASE_URL" -f tools/smoke-ead-ciencia.sql
-- Deve terminar imprimindo "SMOKE TEST OK" (e a linha da tabela de resultado).
-- ============================================================================

begin;

do $$
declare
  v_empresa uuid;
  v_func uuid;
  v_id uuid;           -- entrega que o servidor confirma
  v_id2 uuid;          -- entrega que o usuário tenta forjar no INSERT e depois exclui
  v_id3 uuid;          -- entrega que o super admin confirma
  v_linha public.entrega_ciencia;
  v_linhas int;
  v_sql text;
  v_falhou boolean;
  v_estado text;
  v_claims_usuario text;
begin
  -- 1. empresa e funcionário de teste (ativos, só leitura aqui)
  select f.empresa_id, f.id into v_empresa, v_func
    from public.funcionario f
    where f.deleted_at is null
      and f.ativo is not false
    order by f.created_at
    limit 1;
  if v_empresa is null then
    raise exception 'Nenhum funcionário ativo para testar.';
  end if;
  raise notice '== empresa de teste: %', v_empresa;

  v_claims_usuario := jsonb_build_object(
    'role', 'authenticated',
    'sub', gen_random_uuid(),
    'app_metadata', jsonb_build_object('empresa_id', v_empresa)
  )::text;

  -- ---------------------------------------------------------------- usuário
  perform set_config('request.jwt.claims', v_claims_usuario, true);
  set local role authenticated;

  -- 2. criar pendente funciona, como a Ficha faz (create sem status)
  insert into public.entrega_ciencia (empresa_id, funcionario_id, tipo, descricao, criada_por)
    values (v_empresa, v_func, 'EPI', 'SMOKE capacete', 'smoke')
    returning id into v_id;
  select * into v_linha from public.entrega_ciencia where id = v_id;
  if v_linha.status is distinct from 'pendente'
     or v_linha.confirmada_em is not null or v_linha.evidencia is not null then
    raise exception 'FALHOU: entrega nova deveria nascer pendente e sem evidência (%)', v_linha.status;
  end if;
  raise notice '[criar pendente] OK';

  -- 3. INSERT já "confirmado" e com data antiga: o trigger zera tudo
  insert into public.entrega_ciencia
    (empresa_id, funcionario_id, tipo, descricao, status, confirmada_em, evidencia, created_at)
    values (v_empresa, v_func, 'Documento', 'SMOKE forjada', 'confirmada',
            now() - interval '30 days', '{"metodo":"forjado"}'::jsonb, now() - interval '30 days')
    returning id into v_id2;
  select * into v_linha from public.entrega_ciencia where id = v_id2;
  if v_linha.status is distinct from 'pendente'
     or v_linha.confirmada_em is not null or v_linha.evidencia is not null then
    raise exception 'FALHOU: INSERT com status confirmada não foi neutralizado (status=%)', v_linha.status;
  end if;
  if v_linha.created_at < now() - interval '1 minute' then
    raise exception 'FALHOU: INSERT com created_at antigo não foi neutralizado';
  end if;
  raise notice '[insert forjado] OK nasceu pendente, sem evidência e com data do servidor';

  -- 4. pendente: tipo, descricao e itens podem ser corrigidos
  update public.entrega_ciencia
    set tipo = 'Ferramenta', descricao = 'SMOKE capacete (corrigido)', itens = '[{"nome":"capacete"}]'::jsonb
    where id = v_id;
  select * into v_linha from public.entrega_ciencia where id = v_id;
  if v_linha.tipo <> 'Ferramenta' or v_linha.descricao <> 'SMOKE capacete (corrigido)'
     or v_linha.itens is distinct from '[{"nome":"capacete"}]'::jsonb then
    raise exception 'FALHOU: pendente deveria aceitar a correção de tipo/descricao/itens';
  end if;
  raise notice '[corrigir pendente] OK';

  -- 5. confirmar direto (ou mexer no que não é livre) falha com 42501
  foreach v_sql in array array[
    format('update public.entrega_ciencia set status = %L where id = %L', 'confirmada', v_id),
    format('update public.entrega_ciencia set confirmada_em = now() where id = %L', v_id),
    format('update public.entrega_ciencia set evidencia = %L::jsonb where id = %L', '{"metodo":"forjado"}', v_id),
    format('update public.entrega_ciencia set status = %L, confirmada_em = now(), evidencia = %L::jsonb where id = %L',
           'confirmada', '{"metodo":"forjado"}', v_id),
    format('update public.entrega_ciencia set funcionario_id = gen_random_uuid() where id = %L', v_id),
    format('update public.entrega_ciencia set empresa_id = gen_random_uuid() where id = %L', v_id),
    format('update public.entrega_ciencia set criada_por = %L where id = %L', 'outro', v_id),
    format('update public.entrega_ciencia set created_at = now() - interval %L where id = %L', '1 year', v_id)
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '42501' then
        raise exception 'FALHOU: esperava 42501 e veio % (%) em: %', sqlstate, sqlerrm, v_sql;
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o usuário conseguiu executar: %', v_sql;
    end if;
  end loop;
  select * into v_linha from public.entrega_ciencia where id = v_id;
  if v_linha.status <> 'pendente' or v_linha.evidencia is not null then
    raise exception 'FALHOU: a entrega foi alterada apesar do bloqueio';
  end if;
  raise notice '[confirmar direto] OK bloqueado com 42501 (8 tentativas)';

  -- 6. DELETE e TRUNCATE de verdade: sem privilégio para o usuário
  foreach v_sql in array array[
    format('delete from public.entrega_ciencia where id = %L', v_id),
    'truncate public.entrega_ciencia'
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '42501' then
        raise exception 'FALHOU: esperava 42501 e veio % (%) em: %', sqlstate, sqlerrm, v_sql;
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o usuário conseguiu executar: %', v_sql;
    end if;
  end loop;
  raise notice '[delete/truncate] OK sem privilégio';

  -- --------------------------------------------------------------- servidor
  -- o portal-funcionario (service role): confirma só se ainda estiver pendente
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;

  update public.entrega_ciencia
    set status = 'confirmada', confirmada_em = now(),
        evidencia = '{"metodo":"portal_funcionario_login","usuario":"smoke"}'::jsonb
    where id = v_id and status = 'pendente';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'FALHOU: o servidor deveria confirmar a entrega pendente (linhas=%)', v_linhas;
  end if;

  -- 2ª aba: o mesmo UPDATE já não atinge nada e a evidência da 1ª fica
  update public.entrega_ciencia
    set status = 'confirmada', confirmada_em = now(),
        evidencia = '{"metodo":"portal_funcionario_login","usuario":"segunda-aba"}'::jsonb
    where id = v_id and status = 'pendente';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU: a 2ª confirmação não deveria atingir nenhuma linha (linhas=%)', v_linhas;
  end if;
  select * into v_linha from public.entrega_ciencia where id = v_id;
  if v_linha.status <> 'confirmada' or v_linha.evidencia ->> 'usuario' <> 'smoke' then
    raise exception 'FALHOU: a evidência da 1ª confirmação deveria permanecer';
  end if;
  raise notice '[servidor confirma] OK; 2ª confirmação não sobrescreve';

  -- ---------------------------------------------------------------- usuário
  reset role;
  perform set_config('request.jwt.claims', v_claims_usuario, true);
  set local role authenticated;

  -- 7. confirmada: nada muda (nem volta a pendente), a evidência é intocável
  foreach v_sql in array array[
    format('update public.entrega_ciencia set descricao = %L where id = %L', 'reescrita', v_id),
    format('update public.entrega_ciencia set tipo = %L where id = %L', 'EPI', v_id),
    format('update public.entrega_ciencia set itens = %L::jsonb where id = %L', '[]', v_id),
    format('update public.entrega_ciencia set status = %L where id = %L', 'pendente', v_id),
    format('update public.entrega_ciencia set evidencia = %L::jsonb where id = %L', '{"metodo":"forjado"}', v_id),
    format('update public.entrega_ciencia set confirmada_em = null where id = %L', v_id)
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '42501' then
        raise exception 'FALHOU: esperava 42501 e veio % (%) em: %', sqlstate, sqlerrm, v_sql;
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o usuário conseguiu executar: %', v_sql;
    end if;
  end loop;
  raise notice '[confirmada é imutável] OK';

  -- 8. excluir (exclusão lógica do SDK) funciona, pendente ou confirmada
  update public.entrega_ciencia set deleted_at = now() where id = v_id2;
  update public.entrega_ciencia set deleted_at = now() where id = v_id;
  select * into v_linha from public.entrega_ciencia where id = v_id;
  if v_linha.deleted_at is null or v_linha.status <> 'confirmada' or v_linha.evidencia is null then
    raise exception 'FALHOU: a exclusão lógica deveria marcar deleted_at e manter a evidência';
  end if;
  select * into v_linha from public.entrega_ciencia where id = v_id2;
  if v_linha.deleted_at is null then
    raise exception 'FALHOU: a exclusão lógica da pendente não gravou deleted_at';
  end if;
  raise notice '[excluir (soft)] OK; a evidência da confirmada continua no banco';

  -- ----------------------------------------------------------------- anônimo
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  foreach v_sql in array array[
    'select count(*) from public.entrega_ciencia',
    format('insert into public.entrega_ciencia (empresa_id, funcionario_id, tipo, descricao) values (%L, %L, %L, %L)',
           v_empresa, v_func, 'EPI', 'anon')
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '42501' then
        raise exception 'FALHOU: esperava 42501 e veio % (%) em: %', sqlstate, sqlerrm, v_sql;
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o anônimo conseguiu executar: %', v_sql;
    end if;
  end loop;
  raise notice '[anon] OK sem acesso à tabela';

  -- ------------------------------------------------------------- super admin
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated',
    'sub', gen_random_uuid(),
    'app_metadata', jsonb_build_object('empresa_id', v_empresa, 'is_super_admin', true)
  )::text, true);
  set local role authenticated;

  insert into public.entrega_ciencia (empresa_id, funcionario_id, tipo, descricao)
    values (v_empresa, v_func, 'EPI', 'SMOKE super admin')
    returning id into v_id3;
  update public.entrega_ciencia
    set status = 'confirmada', confirmada_em = now(), evidencia = '{"metodo":"super_admin"}'::jsonb
    where id = v_id3;
  select status into v_estado from public.entrega_ciencia where id = v_id3;
  if v_estado <> 'confirmada' then
    raise exception 'FALHOU: o super admin deveria passar pelo trigger';
  end if;
  raise notice '[super admin] OK';

  reset role;
  perform set_config('request.jwt.claims', '', true);

  raise notice '============ SMOKE TEST OK (ciência de entrega só pelo servidor) ============';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro (em psql sem ON_ERROR_STOP,
-- a transação abortada recusa este select e a linha não aparece)
select 'SMOKE TEST OK: ciência de entrega só pelo servidor (0134)' as res;

rollback;
