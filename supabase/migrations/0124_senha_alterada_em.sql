-- 0124 — usuario_custom.senha_alterada_em: revogação IMPLÍCITA do conector do Claude
--
-- As funções de senha (alterar-senha, redefinir-senha-admin,
-- redefinir-senha-codigo) gravam senha_alterada_em no MESMO UPDATE que grava o
-- senha_hash. O mcp (resolverChave) e o mcp-oauth (troca do código e
-- renovação) tratam como REVOGADA toda autorização do conector com criado_em
-- anterior a essa data.
--
-- Por quê: a revogação explícita (revogarConectorDoUsuario, UPDATE em lote em
-- conector_autorizacao) roda DEPOIS da troca de senha e é best-effort — se
-- falhar (timeout, pooler), a senha muda e as chaves antigas continuariam
-- valendo por até 90 dias, justamente no caso de conta invadida. Com a data
-- gravada junto do hash, a troca de senha derruba o conector mesmo assim. A
-- revogação explícita continua (limpeza e "Apps conectados" certos).
--
-- Ordem do deploy: aplicar ESTA migração ANTES de publicar alterar-senha,
-- redefinir-senha-admin, redefinir-senha-codigo, mcp e mcp-oauth (elas leem
-- ou gravam a coluna; sem ela o PostgREST recusa a consulta).
-- Nula = senha não trocada desde esta migração (nada é revogado por ela).
-- Idempotente.

alter table public.usuario_custom add column if not exists senha_alterada_em timestamptz;

comment on column public.usuario_custom.senha_alterada_em is
  'Última troca/redefinição de senha. Autorizações do conector do Claude criadas antes disso contam como revogadas (0124).';

select 'ok' as res;
