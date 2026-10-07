-- ============================================================================
-- 0146 — Portal do Funcionário: limpeza depois da credencial única (T38, segunda parte)
--
-- Por quê: a 0145 criou a credencial da pessoa (portal_credencial) e transformou funcionario_portal_acesso no
-- vínculo de cada cadastro, mas MANTEVE as colunas antigas e o índice único global do usuário, para a versão
-- antiga das funções continuar barrada (409) na janela entre a migração e o deploy (R8 do spec
-- docs/superpowers/specs/2026-10-07-portal-varias-empresas-design.md). Com o código novo no ar e conferido o
-- uso, o que era da senha sai do vínculo: ela é da pessoa.
--
-- Aplicar DIAS DEPOIS do deploy de portal-funcionario e funcionario-acesso (§9.3, passo 4), nunca antes:
--   supabase db query --linked -f supabase/migrations/0146_portal_credencial_limpeza.sql
--
-- O que faz:
--   1. repete a cópia da 0145 (a MESMA função) nas linhas sem credencial_id, criadas pela versão antiga na janela
--      do deploy. Linha de um CPF que o código novo já ligou a uma credencial (em outra empresa) é LIGADA a ela como
--      vínculo novo (sem liberação nem confirmação; a provisória pendente continua valendo), e fica desativada se a
--      pessoa já tem vínculo ativo naquela empresa. Usuário com letras que colide com credencial existente PARA a
--      migração inteira, dizendo qual linha é (revisão 3, m7): nada é aplicado e o Javerson decide pela tela;
--   2. credencial_id passa a ser obrigatório;
--   3. sai o índice único global do usuário (a origem do 409 que revelava o CPF em outra empresa);
--   4. saem as colunas que foram para a credencial: usuario, senha_hash, senha_provisoria, tentativas,
--      bloqueado_ate e ultimo_sinal_em (o código novo não lê nem grava nenhuma delas);
--   5. sai a função da cópia (não serve mais).
--
-- Idempotente: a cópia só roda enquanto a coluna antiga existe; os drops são "if exists"; o "set not null" pode
-- repetir. Não grava dado de negócio.
-- ============================================================================

begin;

-- 1. A cópia das linhas que a versão antiga criou na janela do deploy -------------------------------------------
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'funcionario_portal_acesso'
       and column_name = 'usuario'
  ) then
    perform public.portal_credencial_copiar_acessos();
  end if;
end;
$$;

-- 2. Todo vínculo tem credencial --------------------------------------------------------------------------------
alter table public.funcionario_portal_acesso alter column credencial_id set not null;

-- 3. Sem o índice único global do usuário -----------------------------------------------------------------------
drop index if exists public.funcionario_portal_acesso_usuario_uidx;

-- 4. O que era da senha sai do vínculo --------------------------------------------------------------------------
alter table public.funcionario_portal_acesso
  drop column if exists usuario,
  drop column if exists senha_hash,
  drop column if exists senha_provisoria,
  drop column if exists tentativas,
  drop column if exists bloqueado_ate,
  drop column if exists ultimo_sinal_em;

-- 5. A cópia não serve mais -------------------------------------------------------------------------------------
drop function if exists public.portal_credencial_copiar_acessos();

commit;

select 'ok' as res;
