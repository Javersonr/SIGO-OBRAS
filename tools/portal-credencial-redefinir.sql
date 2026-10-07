-- ============================================================================
-- portal-credencial-redefinir.sql — procedimento do operador do Portal do Funcionário (T38, §4.3 e P11)
--
-- QUEM RODA: o Javerson (suporte do SIGO, Sinergia Digital), à mão, uma pessoa por vez. Nunca o agente. GRAVA EM
-- PRODUÇÃO.
--
-- QUANDO: só nestes casos, que a tela não resolve (é o preço de nenhuma empresa poder mexer na senha de quem já usa
-- o portal em outra):
--   a) o CPF foi cadastrado ANTES por uma empresa que não é a da pessoa (ou digitado errado e válido) e ela criou a
--      primeira senha: a empresa real não consegue criar a senha (recebe "Esta senha provisória não pode criar uma
--      senha nova");
--   b) a pessoa esqueceu a senha e não entra mais em nenhuma empresa em que já tinha entrado (saiu da A, entrou na B
--      e esqueceu a senha antes de liberar a B).
--
-- ANTES DE RODAR (revisão 3, m2: quem pede é o RH, e o RH pode ser a parte errada):
--   1. o pedido chega pelo RH da empresa em que a pessoa trabalha hoje. Anote quem pediu (nome, e-mail, empresa);
--   2. confirme COM A PRÓPRIA PESSOA, por um canal que NÃO passa pelo RH que pediu (por exemplo, ligação para o
--      telefone que ela informa com documento com foto conferido por vídeo, ou atendimento presencial), quem ela é e
--      em qual empresa trabalha. Nunca use o telefone ou o e-mail que o RH mandou;
--   3. leia o registro do operador da credencial e decida qual é a empresa CONFERIDA (a da pessoa) e quais são as
--      OCUPANTES (as que cadastraram o CPF sem ser a empresa dela), se houver:
--        select id, usuario, senha_geracao, senha_origem_empresa_id from public.portal_credencial
--         where usuario = '<usuario>';
--        select v.empresa_id, v.funcionario_id, v.ativo, v.geracao_liberada, v.confirmado_em
--          from public.funcionario_portal_acesso v
--          join public.portal_credencial c on c.id = v.credencial_id
--         where c.usuario = '<usuario>';
--        select evento, empresa_id, detalhe, ip, created_at from public.portal_credencial_evento
--         where credencial_id = '<credencial_id>' order by created_at;
--
-- O QUE FAZ (função public.portal_credencial_redefinir_pelo_operador, migração 0145), numa transação só:
--   - a senha vira um segredo aleatório que ninguém conhece (nenhuma senha abre; não existe a janela "sem senha");
--   - todas as empresas passam a pedir provisória; só a CONFERIDA fica confirmada (só a provisória nova dela cria a
--     senha); as que estavam liberadas recebem acesso_aguardando_provisoria na trilha;
--   - o vínculo de cada OCUPANTE é desativado (a trilha dela recebe acesso_desativado "por suporte do SIGO") e ela
--     não consegue criar senha nova nem reativando, redefinindo ou recadastrando;
--   - grava credencial_redefinida_pelo_operador no registro do operador, com quem pediu e como a pessoa confirmou.
-- Não muda nada (erro) se a empresa conferida não tem vínculo ativo, de cadastro ativo, com a credencial.
--
-- DEPOIS: o RH da empresa conferida clica "Redefinir senha" na Ficha e entrega a provisória; a pessoa cria a senha
-- nova. As outras empresas dela geram, cada uma, a sua provisória, e ela as libera com a senha nova.
--
-- COMO RODAR: troque os 5 valores entre <> abaixo e rode o arquivo inteiro:
--   supabase db query --linked -f tools/portal-credencial-redefinir.sql
-- Com os <> no lugar, a conversão para uuid falha e nada é gravado.
-- ============================================================================

begin;

select public.portal_credencial_redefinir_pelo_operador(
  p_usuario := '<usuario: o CPF ou o usuário com letras>',
  p_empresa_conferida := '<empresa_conferida>'::uuid,
  -- sem ocupante: array[]::uuid[]
  p_ocupantes := array['<empresa_ocupante>']::uuid[],
  p_pedido_por := '<quem pediu: nome, e-mail e empresa do RH>',
  p_confirmado_com := '<como a própria pessoa confirmou: canal, data, documento conferido>'
) as resultado;

commit;
