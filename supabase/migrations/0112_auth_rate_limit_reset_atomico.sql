-- ============================================================================
-- 0112_auth_rate_limit_reset_atomico.sql — freio de força bruta nas funções
-- públicas de autenticação + consumo ATÔMICO das tentativas do código de
-- redefinição de senha.
--
-- 1) redefinir-senha-codigo lia reset_tentativas e gravava +1 só DEPOIS do
--    bcrypt: uma rajada paralela testava dezenas de códigos de 6 dígitos com o
--    contador ainda em 0. Agora reset_senha_consumir_tentativa() consome a
--    tentativa num UPDATE condicional ANTES da comparação — a trava de linha
--    serializa as chamadas e o WHERE é reavaliado, então passam no máximo
--    p_max tentativas por código, com ou sem paralelismo.
--
-- 2) auth_rate_limit: contador por janela fixa, por IP e por conta, usado por
--    login-custom, portal-fornecedor-login, recuperar-senha,
--    redefinir-senha-codigo e alterar-senha (_shared/limite-tentativas.ts).
--    A chave é o SHA-256 de "escopo:tipo:valor" — IP e e-mail nunca ficam
--    gravados em claro.
--
-- Tudo só para o service role (as Edge Functions); anon/authenticated sem
-- acesso à tabela nem às funções.
-- ============================================================================

create table if not exists public.auth_rate_limit (
  chave text primary key,
  janela_inicio timestamptz not null default now(),
  contador integer not null default 0
);

alter table public.auth_rate_limit enable row level security;
revoke all on table public.auth_rate_limit from anon, authenticated;

comment on table public.auth_rate_limit is
  'Tentativas de autenticação por janela (chave = sha256 de escopo:tipo:valor). Só service role.';

-- Consome 1 tentativa de cada chave (sempre, mesmo se já estourou) e devolve
-- true se TODAS continuam dentro do limite. As chaves de uma mesma função vêm
-- sempre na mesma ordem (ip, conta), então não há deadlock entre chamadas.
create or replace function public.auth_rate_limit_consumir(
  p_chaves text[],
  p_limites integer[],
  p_janela_seg integer
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_n integer := coalesce(array_length(p_chaves, 1), 0);
  v_contador integer;
  v_ok boolean := true;
begin
  if v_n <> coalesce(array_length(p_limites, 1), 0) then
    raise exception 'auth_rate_limit_consumir: p_chaves e p_limites de tamanhos diferentes';
  end if;

  for i in 1 .. v_n loop
    insert into public.auth_rate_limit as r (chave, janela_inicio, contador)
    values (p_chaves[i], now(), 1)
    on conflict (chave) do update set
      contador = case
        when r.janela_inicio <= now() - make_interval(secs => p_janela_seg) then 1
        else r.contador + 1
      end,
      janela_inicio = case
        when r.janela_inicio <= now() - make_interval(secs => p_janela_seg) then now()
        else r.janela_inicio
      end
    returning contador into v_contador;

    if v_contador > p_limites[i] then
      v_ok := false;
    end if;
  end loop;

  -- faxina ocasional das janelas vencidas há mais de um dia
  if random() < 0.02 then
    delete from public.auth_rate_limit where janela_inicio < now() - interval '1 day';
  end if;

  return v_ok;
end;
$$;

-- Depois de uma autenticação certa: devolve a tentativa das chaves de IP
-- (escritório atrás de um NAT não se tranca com logins válidos) e zera as da
-- conta (erros antigos não somam com os próximos).
create or replace function public.auth_rate_limit_liberar(
  p_devolver text[],
  p_zerar text[]
) returns void
language sql
set search_path = ''
as $$
  update public.auth_rate_limit
     set contador = greatest(contador - 1, 0)
   where chave = any(coalesce(p_devolver, '{}'::text[]));
  delete from public.auth_rate_limit
   where chave = any(coalesce(p_zerar, '{}'::text[]));
$$;

-- Consome 1 tentativa do código de redefinição e devolve o hash para a Edge
-- Function comparar. Nenhuma linha = sem código, código vencido ou tentativas
-- esgotadas (a função responde a MESMA mensagem nos três casos).
-- usuario_custom.email não tem índice único desde a 0023 → trava por id.
create or replace function public.reset_senha_consumir_tentativa(
  p_email text,
  p_max integer
) returns table (id uuid, email text, auth_user_id uuid, reset_token text)
language sql
set search_path = ''
as $$
  update public.usuario_custom u
     set reset_tentativas = u.reset_tentativas + 1
   where u.id = (
           select c.id
             from public.usuario_custom c
            where c.email = p_email
              and c.deleted_at is null
            order by c.created_at
            limit 1
         )
     and u.deleted_at is null
     and u.ativo is true
     and u.reset_token is not null
     and u.reset_token_expira > now()
     and u.reset_tentativas < p_max
  returning u.id, u.email, u.auth_user_id, u.reset_token;
$$;

revoke all on function public.auth_rate_limit_consumir(text[], integer[], integer) from public, anon, authenticated;
revoke all on function public.auth_rate_limit_liberar(text[], text[]) from public, anon, authenticated;
revoke all on function public.reset_senha_consumir_tentativa(text, integer) from public, anon, authenticated;

grant execute on function public.auth_rate_limit_consumir(text[], integer[], integer) to service_role;
grant execute on function public.auth_rate_limit_liberar(text[], text[]) to service_role;
grant execute on function public.reset_senha_consumir_tentativa(text, integer) to service_role;
