# Financeiro — implantação da auditoria (migrações 0154–0158)

Roteiro para produção da auditoria do módulo financeiro (14 itens confirmados
em 29/09/2026). Cada passo que toca produção precisa do OK do Javerson
imediatamente antes. Nada aqui foi aplicado ainda.

## O que muda

- **0154** — a senha do certificado A1 vai para o Vault (trigger);
  `certificado_senha(id)` só pelo servidor; tokens bancários só o servidor grava.
  _Efeito:_ a senha some da tabela. Exige o Vault habilitado.
- **0155** — o banco cria, ajusta e retira as linhas do extrato a partir da
  transação, na mesma gravação (paga em conta → 1 linha; parcelada → 1 linha por
  parcela paga). `saldo_atual` da conta é sempre derivado.
  - Parcela paga ou desfeita uma a uma pelo banco (`financeiro_marcar_parcela`):
    a tela não regrava mais o JSON inteiro.
  - O gatilho só re-sincroniza quando a mudança mexe em dinheiro (linhas
    esperadas, conta ou tipo). Cron de atrasados e edição de descrição **não
    corrigem o legado de carona**.
  - A parcelada antiga "paga pelo status" tem o JSON normalizado (todas as
    parcelas pagas), sem mexer no extrato.

  _Efeito:_ nada muda sozinho no saldo até a ressincronização (passo 5).

- **0156** — importação OFX/CSV numa chamada, com sinal e sem duplicar. Isso vale
  também contra o extrato importado antes, comparado por data e valor absoluto.
  `conciliar_extrato` / `desconciliar_transacao` gravam os dois lados juntos e
  recusam sentidos opostos (exceto na linha antiga de sentido desconhecido).
  Linhas importadas do banco deixam de contar no saldo.
  _Efeito:_ **o saldo muda nas contas que já tiveram extrato importado.**
- **0157** — a recorrência não gera a mesma ocorrência duas vezes, e a ocorrência
  excluída não volta. A próxima geração só não pode voltar para trás. "Processar
  Agora" vira `processar_recorrencias_empresa()`.
- **0158** — o número do fechamento é dado pelo banco. Fechar, acrescentar,
  aprovar e desfazer acontecem cada um numa transação.
  - Aprovar baixa as despesas dos itens, menos as parceladas. Com conta pagadora,
    repõe o fundo fixo **só pelo que saiu da conta do fundo**.
  - Desfazer o pagamento **reabre** as despesas que a aprovação baixou, sem
    apagá-las, e desfaz a reposição.

O front novo chama as funções novas: **as migrações sobem antes do push**. O
front publicado hoje continua funcionando com as migrações aplicadas. A 0155
descarta a linha de extrato que ele ainda grava à mão.

## 1. Antes de começar

- Backup ou ponto de restauração do banco, pelo painel do Supabase.
- Vault habilitado: Database → Extensions → `supabase_vault`. Sem ele a 0154
  aborta sem alterar nada.
- Conferências (SQL editor, só leitura). Guardar o resultado de cada uma:

```sql
-- 0156: saldo de hoje × saldo sem as linhas importadas, por conta
select c.empresa_id, c.nome, c.saldo_atual as hoje,
       coalesce(c.saldo_inicial,0) + coalesce(sum(e.valor) filter (
         where e.status_conciliacao is null and e.upload_id is null
           and upper(coalesce(e.origem,'')) <> 'OFX'), 0) as depois,
       count(*) filter (where e.status_conciliacao is not null
           or upper(coalesce(e.origem,'')) = 'OFX') as linhas_importadas
  from conta_financeira c
  left join extrato_bancario e on e.conta_id = c.id and e.deleted_at is null
 where c.deleted_at is null
 group by c.id
having count(*) filter (where e.status_conciliacao is not null
           or upper(coalesce(e.origem,'')) = 'OFX') > 0;

-- 0157: ocorrências de recorrência já duplicadas pelo bug antigo
select r.empresa_id, r.descricao, t.data, count(*) as vezes
  from transacao_financeira t
  join transacao_recorrente r on r.id = t.referencia_id
 where t.deleted_at is null
 group by r.empresa_id, r.descricao, t.referencia_id, t.data
having count(*) > 1
 order by 1, 2, 3;

-- 0155: parceladas "pagas pelo status" que terão o JSON normalizado (todas as parcelas pagas)
select empresa_id, count(*) from transacao_financeira
 where coalesce(parcelado,false) and deleted_at is null
   and lower(trim(coalesce(status,''))) in ('pago','realizado')
 group by 1;

-- 0156: linhas antigas de OFX com valor 0 (leitor antigo): lixo que fica em Pendentes
select empresa_id, conta_id, count(*) from extrato_bancario
 where deleted_at is null and coalesce(valor,0) = 0
   and (status_conciliacao is not null or upper(coalesce(origem,'')) = 'OFX')
 group by 1, 2;

-- 0158: números de fechamento já repetidos
select empresa_id, numero, count(*) from fechamento_caixa
 where deleted_at is null group by 1, 2 having count(*) > 1;

-- PlanoContas antigo zerava saldo_inicial ao editar: contas bancárias com 0
select empresa_id, nome, tipo, saldo_inicial, saldo_atual
  from conta_financeira
 where deleted_at is null and coalesce(saldo_inicial, 0) = 0
   and tipo in ('Banco', 'Caixa', 'Fundo Fixo', 'Investimento');
```

Os duplicados e os saldos iniciais zerados **não são corrigidos pelas migrações**.
Conferir com o financeiro e corrigir à mão antes do passo 5.

## 2. Aplicar as migrações

Em ordem, de 0154 a 0158, cada uma inteira (cada arquivo roda numa transação).
Pelo SQL editor ou `supabase db push --linked`, conforme o costume do projeto.

## 3. Conferir que subiu

```sql
select proname from pg_proc
 where proname in ('certificado_senha', 'financeiro_extrato_esperado', 'importar_extrato_bancario',
                   'conciliar_extrato', 'desconciliar_transacao', 'processar_recorrencias_empresa',
                   'fechar_caixa', 'aprovar_pagamento_fechamento');
select count(*) as senhas_em_texto from certificado_empresa
 where coalesce(senha_encriptada, '') <> '';   -- deve dar 0
```

## 4. Diagnóstico do extrato (só leitura)

```sql
select * from financeiro_diagnostico_extrato();          -- todas as empresas
select empresa_id, count(*), sum(diferenca) from financeiro_diagnostico_extrato() group by 1;
```

Cada linha é uma transação cujo extrato gravado difere do que a regra nova
espera: pagamento sem linha, parcela lançada antes de paga, duplicata etc.
Conferir uma amostra com o financeiro.

Enquanto a ressincronização não roda, o legado fica como está. Só uma mudança
de dinheiro naquela transação a acerta (pagar, estornar, mudar valor ou conta).

## 5. Ressincronizar (com OK, por empresa)

```sql
select financeiro_ressincronizar_extrato('<empresa_id>');  -- devolve quantas ajustou
```

Depois, repetir o diagnóstico do passo 4: ele deve voltar vazio para a empresa.

## 6. Publicar o front

Push na `master`. A Hostgator publica sozinha. Teste rápido em produção:

- marcar e desmarcar um pagamento;
- importar duas vezes o mesmo OFX (a segunda vez sai "já existentes");
- conciliar e desfazer;
- "Processar Agora" nas recorrências;
- abrir o histórico de fechamentos.

## Se precisar voltar

- **Front:** revert dos commits e push. As funções antigas continuam existindo.
  Só as telas novas dependem das novas.
- **Banco:** as migrações não apagam nada. Desfazer o efeito no saldo da 0156
  exige recriar `_saldo_extrato` como na 0155, somando as linhas importadas.
  Isso não é recomendável, porque essas linhas contavam errado.
- **A senha do certificado** não volta para a tabela. Ela fica no Vault e é lida
  por `certificado_senha(id)` com a service role.

## Pendências conhecidas (fora destas migrações)

- Plano de contas e contas bancárias seguem na mesma tabela (`conta_financeira`).
  Os relatórios separam por `tipo` + `tipo_natureza`, mas as telas listam tudo junto.
- A integração bancária automática (Open Finance) não existe. A tela agora diz
  isso e manda importar o OFX.
- Testes SQL: `supabase/tests/financeiro/` (PGlite, ver README). Testes do front:
  `apps/web/src/lib/*.test.js`.
