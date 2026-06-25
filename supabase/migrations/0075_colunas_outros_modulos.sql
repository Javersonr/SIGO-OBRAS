-- ============================================================================
-- 0075_colunas_outros_modulos.sql — colunas que o frontend grava (não-financeiro)
--
-- Auditoria coluna-fantasma (agente, verificada) nos módulos não-financeiros.
-- Mesmo padrão das 0072/0073/0074: adiciona, de forma ADITIVA (nullable, sem
-- CHECK), as colunas que o frontend já grava mas não existiam — destravando os
-- creates/updates que falhavam com "Could not find the 'X' column".
--
--   - treinamento.arquivo_pdf_url      : URL/ref do PDF do certificado (import ZIP)
--   - aprovacao_solicitacao.nivel_*    : nível de aprovação registrado (Projetos)
--   - cotacao_resposta.aprovado        : marca a resposta vencedora da cotação
--   - ferramenta.obrigatoria_caminhao  : flag de item obrigatório no caminhão
--   - movimentacao_ferramenta.caminhao_*: entrega de ferramenta vinculada a caminhão
--   - template_oportunidade.tipo       : classificador do template ("orcamento"...)
--
-- (Os renames de campo — itens_json→campos_padrao, usuario_responsavel→usuario_nome,
--  tipo→tipo_movimentacao etc. — são corrigidos no frontend, não precisam de DDL.)
-- + reload do schema cache do PostgREST.
-- ============================================================================

alter table public.treinamento
  add column if not exists arquivo_pdf_url text;

alter table public.aprovacao_solicitacao
  add column if not exists nivel_aprovacao_id uuid,
  add column if not exists nivel_nome text,
  add column if not exists nivel_ordem integer;

alter table public.cotacao_resposta
  add column if not exists aprovado boolean;

alter table public.ferramenta
  add column if not exists obrigatoria_caminhao boolean;

alter table public.movimentacao_ferramenta
  add column if not exists caminhao_id uuid,
  add column if not exists caminhao_placa text;

alter table public.template_oportunidade
  add column if not exists tipo text;

notify pgrst, 'reload schema';
