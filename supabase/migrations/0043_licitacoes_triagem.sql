-- ============================================================================
-- 0043_licitacoes_triagem.sql — FLUXO OPERADOR → VALIDADOR nas licitações
--
-- A aba "Licitações" dentro de Oportunidades precisa de mais estados que o
-- inbox cru (Nova/Em análise/Descartada/Convertida). Adicionamos:
--   - 'Aguardando validação' : operador marcou "vamos participar"; espera o
--                              validador (Admin/Admin Holding/Gestor) aprovar.
--   - 'Recusada'             : validador recusou o go/no-go.
-- E colunas pra registrar QUEM operou e QUEM validou (auditoria) — o que também
-- permite bloquear auto-validação (quem marca participar ≠ quem valida), no
-- mesmo espírito do motor de aprovação de Compras (0028).
--
-- Fluxo: Nova → (Em análise) → Aguardando validação → Convertida | Recusada
--                                              ↘ Descartada (operador descarta)
-- ============================================================================

-- 1. Amplia o CHECK de status (mantém os 4 antigos + 2 novos) ---------------
alter table public.licitacao_encontrada
  drop constraint if exists licitacao_encontrada_status_check;

alter table public.licitacao_encontrada
  add constraint licitacao_encontrada_status_check
  check (status in (
    'Nova', 'Em análise', 'Aguardando validação', 'Convertida', 'Recusada', 'Descartada'
  ));

-- 2. Colunas de operador / validador (auditoria + bloqueio de auto-validação)
alter table public.licitacao_encontrada
  add column if not exists operador_email          text,
  add column if not exists operador_nome           text,
  add column if not exists marcado_participar_em   timestamptz,
  add column if not exists validador_email         text,
  add column if not exists validador_nome          text,
  add column if not exists validado_em             timestamptz,
  add column if not exists decisao                 text,
  add column if not exists justificativa           text;

-- decisao só pode ser aprovada/recusada (ou null enquanto não validada)
alter table public.licitacao_encontrada
  drop constraint if exists licitacao_encontrada_decisao_check;
alter table public.licitacao_encontrada
  add constraint licitacao_encontrada_decisao_check
  check (decisao is null or decisao in ('aprovada', 'recusada'));

-- índice pra a fila do validador (status = 'Aguardando validação')
create index if not exists lic_enc_validacao_idx
  on public.licitacao_encontrada(empresa_id, status)
  where status = 'Aguardando validação';
