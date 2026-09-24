-- Dados bancários de pagamento no financeiro:
--   fornecedor.dados_bancarios  → como PAGAR o fornecedor (banco/agência/conta/PIX,
--     texto livre) — aparece no detalhe da despesa e no modal de pagamento
--   conta_financeira.chave_pix  → como RECEBER (junto de banco/agência/nº que a
--     conta já tem) — aparece no detalhe da receita
alter table public.fornecedor
  add column if not exists dados_bancarios text;

alter table public.conta_financeira
  add column if not exists chave_pix text;

select 'ok' as res;
