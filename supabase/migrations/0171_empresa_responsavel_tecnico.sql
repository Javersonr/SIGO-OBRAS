-- 0171 — Responsável técnico (RT) cadastrado na empresa
--
-- Por quê: a Autorização Formal (NR-10/NR-33/NR-35) e o Direito de Recusa imprimiam o nome, o registro
-- no conselho e o CPF de uma pessoa fixa no código do front. O documento saía com essa pessoa como RT de
-- QUALQUER empresa cliente, e o dado pessoal ficava no código (repositório e pacote JS do site). O RT
-- passa a ser um cadastro da empresa, em Configurações → Empresa.
--
-- empresa:
--   responsavel_tecnico_nome      nome completo do RT;
--   responsavel_tecnico_titulo    título profissional ("Engenheiro Eletricista");
--   responsavel_tecnico_conselho  conselho e UF ("CREA-MG"); em branco, o documento imprime "CREA";
--   responsavel_tecnico_registro  número do registro no conselho;
--   responsavel_tecnico_cpf       CPF formatado (000.000.000-00).
--
-- Só aditiva e idempotente. A RLS não muda (mesma tabela, mesmas policies).
-- Ordem do deploy: aplicar ESTA migração ANTES do push do front. O Salvar da aba Empresa manda as colunas
-- novas; sem elas o PostgREST responde PGRST204. Depois do push, cada empresa preenche o próprio RT: até
-- lá os dois documentos saem com linhas em branco para preencher à mão.

alter table public.empresa add column if not exists responsavel_tecnico_nome text;
alter table public.empresa add column if not exists responsavel_tecnico_titulo text;
alter table public.empresa add column if not exists responsavel_tecnico_conselho text;
alter table public.empresa add column if not exists responsavel_tecnico_registro text;
alter table public.empresa add column if not exists responsavel_tecnico_cpf text;
notify pgrst, 'reload schema';

select 'ok' as res;
