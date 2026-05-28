-- ============================================================================
-- 0032 - Fix backfill da 0031 (coluna era 'data', nao 'data_emissao')
-- ============================================================================
-- A 0031 falhou em runtime no backfill porque transacao_financeira nao tem
-- coluna data_emissao - o nome real e 'data'. As DDLs (tabelas/indices/RPC)
-- da 0031 ja foram aplicadas antes do erro; aqui so o INSERT do backfill.
-- ============================================================================

insert into public.nota_fiscal_eletronica (
  empresa_id, tipo, modelo, chave_nfe, numero,
  data_emissao, valor_total, transacao_id, status,
  fornecedor_id
)
select
  t.empresa_id,
  'NFe_recebida' as tipo,
  '55' as modelo,
  t.numero_documento as chave_nfe,
  null as numero,
  t.data as data_emissao,           -- coluna real
  t.valor as valor_total,
  t.id as transacao_id,
  'Pendente Conferencia' as status,
  t.fornecedor_id
from public.transacao_financeira t
where t.numero_documento ~ '^[0-9]{44}$'
  and t.deleted_at is null
  and not exists (
    select 1 from public.nota_fiscal_eletronica n
    where n.empresa_id = t.empresa_id
      and n.chave_nfe = t.numero_documento
      and n.deleted_at is null
  );
