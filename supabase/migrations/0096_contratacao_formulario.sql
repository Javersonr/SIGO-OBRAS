-- ============================================================================
-- 0096: contratacao ganha TODOS os campos do "Formulário para Registro"
-- (modelo oficial enviado à contabilidade — mesmo desenho do funcionario).
-- ============================================================================

alter table public.contratacao
  add column if not exists data_admissao date,
  add column if not exists horario_trabalho text,
  add column if not exists nome_mae text,
  add column if not exists nome_pai text,
  add column if not exists bairro text,
  add column if not exists email text,
  add column if not exists rg_data_expedicao date,
  add column if not exists rg_uf text,
  add column if not exists naturalidade text,
  add column if not exists titulo_eleitor text,
  add column if not exists titulo_eleitor_zona text,
  add column if not exists titulo_eleitor_secao text,
  add column if not exists reservista text,
  add column if not exists estado_civil text,
  add column if not exists raca_cor text,
  add column if not exists grau_instrucao text,
  add column if not exists banco_codigo text,
  add column if not exists banco_tipo_conta text,
  add column if not exists banco_agencia text,
  add column if not exists banco_conta text,
  add column if not exists dependentes jsonb not null default '[]'::jsonb;

select json_build_object('colunas', count(*)) as res
from information_schema.columns where table_name = 'contratacao';
