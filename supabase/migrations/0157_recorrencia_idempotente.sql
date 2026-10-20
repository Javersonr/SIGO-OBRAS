-- 0157 — recorrências: gerar a mesma ocorrência duas vezes fica impossível
--
-- RecorrentesTab.jsx gravava proxima_geracao = data_inicio em TODO salvar,
-- inclusive na edição. O cron processar_recorrencias_vencidas (0037) então
-- "recuperava o atraso" desde o início e recriava as ocorrências já geradas
-- (até 60 por recorrência) — sem nenhuma checagem de duplicidade. E o botão
-- "Processar Agora" chamava uma função não migrada e mesmo assim dizia
-- "Recorrências processadas!".
--
-- Agora:
--   * a ocorrência (recorrência + data) só é criada se ainda não existir —
--     nem apagada: quem excluiu uma ocorrência não a vê voltar;
--   * pelo app, proxima_geracao não volta para trás depois que a recorrência
--     já gerou ocorrências (o cron, no servidor, continua avançando);
--   * a recorrência é travada (for update skip locked) enquanto é processada:
--     cron e botão ao mesmo tempo não geram em dobro;
--   * processar_recorrencias_empresa(): o "Processar Agora", só da empresa do
--     usuário.

-- busca "já gerei esta ocorrência?" sem varrer a tabela
create index if not exists tx_referencia_idx
  on public.transacao_financeira(referencia_id, data)
  where referencia_id is not null;

-- 1. Núcleo (interno) ---------------------------------------------------------
create or replace function public._processar_recorrencias(p_empresa_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_d date;
  v_count int := 0;
  v_guard int;
begin
  for r in
    select * from public.transacao_recorrente
      where ativo = true
        and deleted_at is null
        and proxima_geracao is not null
        and proxima_geracao <= current_date
        and (p_empresa_id is null or empresa_id = p_empresa_id)
      for update skip locked
  loop
    v_d := r.proxima_geracao;
    v_guard := 0;

    -- Catch-up: gera as ocorrências atrasadas (cap 60 p/ segurança).
    while v_d is not null
          and v_d <= current_date
          and (r.data_fim is null or v_d <= r.data_fim)
          and v_guard < 60
    loop
      if not exists (
        select 1 from public.transacao_financeira t
         where t.referencia_id = r.id
           and t.data = v_d
      ) then
        insert into public.transacao_financeira (
          empresa_id, tipo, conta_id, conta_nome, categoria_id, categoria_nome,
          valor, data, data_vencimento,
          projeto_id, projeto_nome, fornecedor_id, fornecedor_nome,
          cliente_id, cliente_nome, descricao, status, forma_pagamento,
          observacoes, referencia_tipo, referencia_id
        ) values (
          r.empresa_id,
          case when lower(r.tipo) = 'receita' then 'Receita' else 'Despesa' end,
          r.conta_id, r.conta_nome, r.categoria_id, r.categoria_nome,
          r.valor, v_d, public.data_vencimento_ocorrencia(v_d, r.dia_vencimento),
          r.projeto_id, r.projeto_nome, r.fornecedor_id, r.fornecedor_nome,
          r.cliente_id, r.cliente_nome, r.descricao, 'em_aberto', r.forma_pagamento,
          trim(coalesce(r.observacoes, '') || ' [gerada automaticamente da recorrência]'),
          'Outro', r.id
        );
        v_count := v_count + 1;
      end if;
      v_d := public.proxima_data_recorrencia(v_d, r.frequencia, r.dia_vencimento);
      v_guard := v_guard + 1;
    end loop;

    -- Grava a próxima data e desativa se passou do fim.
    update public.transacao_recorrente
      set proxima_geracao = v_d,
          ativo = case when r.data_fim is not null and v_d is not null and v_d > r.data_fim
                       then false else ativo end,
          updated_at = now()
      where id = r.id;
  end loop;

  return v_count;
end;
$$;

revoke all on function public._processar_recorrencias(uuid) from public, anon, authenticated;

-- 2. Cron (0037): mesma assinatura, agora idempotente ---------------------------
create or replace function public.processar_recorrencias_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._processar_recorrencias(null);
end;
$$;

comment on function public.processar_recorrencias_vencidas is
  'Gera TransacaoFinanceira das recorrências vencidas (catch-up até 60, sem duplicar ocorrência) e avança proxima_geracao.';

-- 3. Botão "Processar Agora" (app) ----------------------------------------------
create or replace function public.processar_recorrencias_empresa()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.exigir_empresa_do_chamador(v_empresa, 'recorrência');
  return public._processar_recorrencias(v_empresa);
end;
$$;

revoke all on function public.processar_recorrencias_empresa() from public, anon;
grant execute on function public.processar_recorrencias_empresa() to authenticated, service_role;

-- 4. Editar a recorrência não volta a data de geração ---------------------------
create or replace function public.tg_recorrencia_proxima_nao_volta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.chamador_eh_servidor() then
    return new;
  end if;

  -- só VOLTAR é proibido depois de gerar (avançar é o próprio processamento,
  -- inclusive o "Processar Agora", que roda com o login do usuário)
  if new.proxima_geracao < old.proxima_geracao
     and exists (select 1 from public.transacao_financeira t where t.referencia_id = old.id) then
    -- já gerou: segue de onde parou (ou do novo início, se ele for depois)
    new.proxima_geracao := greatest(old.proxima_geracao, new.data_inicio);
  end if;

  return new;
end;
$$;

revoke all on function public.tg_recorrencia_proxima_nao_volta() from public, anon, authenticated;

drop trigger if exists trg_recorrencia_proxima_nao_volta on public.transacao_recorrente;
create trigger trg_recorrencia_proxima_nao_volta
  before update of proxima_geracao on public.transacao_recorrente
  for each row execute function public.tg_recorrencia_proxima_nao_volta();

notify pgrst, 'reload schema';

-- Conferência (SQL editor): ocorrências já duplicadas pelo bug antigo
--
--   select r.empresa_id, r.descricao, t.data, count(*) as vezes
--     from transacao_financeira t
--     join transacao_recorrente r on r.id = t.referencia_id
--    where t.deleted_at is null
--    group by r.empresa_id, r.descricao, t.referencia_id, t.data
--   having count(*) > 1
--    order by 1, 2, 3;
