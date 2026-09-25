-- ============================================================================
-- 0113_cotacao_token_aleatorio.sql — token do link de cotação gerado pelo banco
--
-- FURO: o navegador (CotacaoModal) gerava cotacao_fornecedor.token como
-- btoa("<cotacao_id>-<fornecedor_id>-<Date.now()>") — sem segredo nenhum.
-- O token é a ÚNICA credencial das Edge Functions portal-fornecedor-cotacao /
-- portal-fornecedor-resposta: um fornecedor decodificava o próprio link (que
-- traz cotacao_id e o timestamp, igual p/ todos gerados no mesmo clique) e só
-- precisava do fornecedor_id do concorrente para LER e SOBRESCREVER a resposta
-- dele. Os 9 tokens vivos (3 cotações de mar/abr 2026) ainda codificam os
-- ObjectIds do Base44, também previsíveis.
--
-- Agora:
--   * trigger: todo INSERT recebe 32 bytes aleatórios (pgcrypto) em base64url
--     (43 chars), ignorando o que o cliente mandar — vale inclusive para um
--     bundle antigo do front ainda aberto no navegador de alguém;
--   * UPDATE que mexe no token = reemissão pelo servidor (o valor enviado é
--     descartado): para trocar um link, `update ... set token = null`;
--   * reemite TODO token fora do formato novo (decisão do usuário: troca
--     imediata; o link antigo passa a mostrar "link substituído, peça o novo
--     ou entre pelo Portal do Fornecedor" — ver _shared/cotacao-portal.ts);
--     o portal logado (HistoricoCotacoes) já lê o token novo sozinho;
--   * CHECK de formato + NOT NULL.
--
-- Sem rollback do token antigo, de propósito (era a própria falha).
-- ============================================================================

begin;

create or replace function public.cotacao_fornecedor_token_servidor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.token is distinct from old.token then
    new.token := rtrim(
      translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'),
      '='
    );
  end if;
  return new;
end;
$$;

comment on function public.cotacao_fornecedor_token_servidor() is
  'Token do link de cotação do fornecedor: 32 bytes aleatórios base64url, só pelo servidor (0113).';

drop trigger if exists cotacao_fornecedor_token_servidor on public.cotacao_fornecedor;
create trigger cotacao_fornecedor_token_servidor
  before insert or update of token on public.cotacao_fornecedor
  for each row execute function public.cotacao_fornecedor_token_servidor();

-- Reemissão: o trigger troca qualquer token alterado (aqui, para null) por um novo.
update public.cotacao_fornecedor
   set token = null
 where token is null
    or token !~ '^[A-Za-z0-9_-]{43}$';

alter table public.cotacao_fornecedor
  alter column token set not null;

alter table public.cotacao_fornecedor
  drop constraint if exists cotacao_fornecedor_token_formato;
alter table public.cotacao_fornecedor
  add constraint cotacao_fornecedor_token_formato
  check (token ~ '^[A-Za-z0-9_-]{43}$');

commit;
