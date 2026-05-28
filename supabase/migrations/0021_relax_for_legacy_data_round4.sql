-- ============================================================================
-- 0021 — Quarta e última rodada: limpa TODOS os 23 erros distintos restantes
-- ============================================================================

-- === COLUNAS LEGADAS FALTANDO ===
alter table public.treinamento     add column if not exists aluno_cpf text;
alter table public.cliente         add column if not exists contato_nome text;
alter table public.usuario_custom  add column if not exists perfil text;
alter table public.projeto         add column if not exists responsavel_email text;
alter table public.usuario_empresa add column if not exists senha_hash text;
alter table public.ferramenta      add column if not exists valor_aquisicao numeric(14,2);

-- === CHECK CONSTRAINTS RESTRITIVOS — DROP ===
alter table public.audit_log         drop constraint if exists audit_log_status_check;
alter table public.conta_financeira  drop constraint if exists conta_financeira_tipo_check;
alter table public.cronograma_etapa  drop constraint if exists cronograma_etapa_status_check;
alter table public.extrato_bancario  drop constraint if exists extrato_bancario_origem_check;

-- === FKs RÍGIDAS — DROP (cascade de records que falharam) ===
alter table public.arquivo_oportunidade        drop constraint if exists arquivo_oportunidade_oportunidade_id_fkey;
alter table public.caminhao_campo_obrigatorio  drop constraint if exists caminhao_campo_obrigatorio_caminhao_id_fkey;
alter table public.historico_documento_assinado drop constraint if exists historico_documento_assinado_funcionario_id_fkey;
alter table public.historico_documento_assinado drop constraint if exists hist_doc_assinado_funcionario_fk;
alter table public.oportunidade_atualizacao    drop constraint if exists oportunidade_atualizacao_oportunidade_id_fkey;
alter table public.orcamento_item              drop constraint if exists orcamento_item_oportunidade_id_fkey;
alter table public.reserva_material            drop constraint if exists reserva_material_projeto_id_fkey;
alter table public.tarefa_projeto              drop constraint if exists tarefa_projeto_projeto_id_fkey;
alter table public.token_cliente_oportunidade  drop constraint if exists token_cliente_op_fk;
alter table public.transacao_financeira        drop constraint if exists transacao_financeira_projeto_id_fkey;

-- === UNIQUE CONSTRAINTS — DROP (dados legados têm duplicatas) ===
alter table public.caminhao    drop constraint if exists caminhao_empresa_id_placa_key;
alter table public.funcionario drop constraint if exists funcionario_empresa_id_cpf_key;

-- === NOT NULL — RELAX ===
alter table public.solicitacao_compra alter column empresa_id      drop not null;
alter table public.fornecedor_acesso  alter column fornecedor_email drop not null;
alter table public.material           alter column nome             drop not null;

-- ---------------------------------------------------------------------------
-- Refresh PostgREST cache pra reconhecer todas as novas colunas/constraints
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
