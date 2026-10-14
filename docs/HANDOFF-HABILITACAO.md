# Handoff — Habilitação e documentos da licitação gerados e anexados pelo SIGO

- **Plano:** `docs/superpowers/plans/2026-10-13-habilitacao-documentos-automaticos.md` (partes A, B e C).
- **Spec:** `docs/superpowers/specs/2026-10-09-habilitacao-documentos-automaticos-design.md`. Ela complementa as de
  25/09 (`2026-09-25-conector-claude-editais-design.md`) e de 08/10
  (`2026-10-08-conector-orcamento-cronograma-design.md`).
- **Branch:** `feat/habilitacao-automatica` (worktree `C:/Users/javer/sigoobras-wt-habilitacao`), criada de `master`
  `7b91500`. Sem push e sem PR: o merge é do Javerson.
- **Quem publica:** o Javerson, depois do merge, na ordem abaixo e **com o OK dele a cada passo**. O código foi escrito
  e testado sem rodar nada contra produção: as migrações, os smokes e as funções nunca rodaram no banco nem no Deno.
- **Situação em 14/10/2026:** nada desta branch está publicado. Falta tudo: migrações 0154 a 0156, funções, front e a
  carga inicial da biblioteca.

## O que entra

O problema que isto resolve: o Claude não consegue enviar arquivo ao SIGO (a rede do ambiente dele barra o Storage).
Agora ele manda só dados pequenos pelo conector, e **o servidor do SIGO gera, copia ou baixa os arquivos** e grava nos
Arquivos da oportunidade.

| Parte | O que muda                                                                                                                                                                                                                                       | Migração                                                                                                                                               | Funções                                                                       | Front                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A     | Biblioteca de certidões e documentos da empresa (arquivo, tipo, validade, versões); o "Atende?" e o Resumo do Acervo leem a validade dela; lembretes de vencimento no sino e por WhatsApp; script da carga inicial                               | 0154 (`acervo_documento` e bucket `habilitacao`) e 0155 (configuração, fila do WhatsApp, função de alerta e dois crons)                                | `habilitacao-lembretes` (nova) e `ia-processar` (o "Atende?" lê a biblioteca) | Acervo Técnico → aba "Documentos e certidões" (pacote do mês, versões), cartão "Lembretes" e Resumo do Acervo              |
| B     | Proposta e cronograma (PDF e Excel) e declarações (PDF e Word) gerados no servidor, com o mesmo resultado da tela; todo arquivo gerado grava `origem` (repetir troca no lugar) e todo PDF nasce "falta assinar"; modelos de declaração editáveis | 0156 (`origem` e `assinatura` em `arquivo_oportunidade`, tipos novos no bucket `anexos-oportunidade`, `modelo_declaracao` e `conector_gravar_arquivo`) | nenhuma nova (o `mcp` usa o que a 0156 cria)                                  | Aba Arquivos da oportunidade: selo "falta assinar", "Enviar assinado" e "Baixar"; cartão "Modelos de declaração" no Acervo |
| C     | Seis ferramentas novas do conector (23 no total) e o roteiro "Montar a licitação completa" (4 roteiros no total); o Storage do conector passa a ficar preso à pasta da empresa em TODAS as ferramentas                                           | nenhuma                                                                                                                                                | `mcp`                                                                         | nenhum                                                                                                                     |

As seis ferramentas novas e quem pode usar cada uma (a permissão é conferida no servidor, antes de tudo):

| Ferramenta                  | O que faz                                                                              | Permissão do usuário                         |
| --------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| `anexar_habilitacao`        | copia para "Envelope 02 – Habilitação" os documentos VÁLIDOS da biblioteca             | Oportunidades → Lista **e** Arquivos → criar |
| `anexar_acervo`             | copia para o mesmo envelope os PDFs das CATs (as do "Atende?", ou as pedidas)          | Oportunidades → Lista **e** Arquivos → criar |
| `gerar_documentos_proposta` | gera proposta e cronograma em PDF e Excel em "Envelope 01 – Proposta"                  | Oportunidades → Lista **e** Arquivos → criar |
| `gerar_declaracoes`         | gera declarações em PDF e Word, com bloco de assinatura (modelos da empresa ou edital) | Oportunidades → Lista **e** Arquivos → criar |
| `anexar_edital_por_url`     | o servidor baixa o edital de um link público (https) e grava na pasta "Edital"         | Oportunidades → Lista **e** Arquivos → criar |
| `checklist_habilitacao`     | só lê: o que falta, o que venceu, o que falta assinar e os próximos passos             | Oportunidades → Lista                        |

Os quatro roteiros do conector: `analisar_edital`, `cadastrar_acervo`, `orcamento_cronograma_licitacao` e o novo
`montar_licitacao_completa` ("Montar a licitação completa").

## Antes de publicar

Tudo abaixo é leitura ou conferência. Os comandos que falam com produção só rodam com o OK do Javerson.

1. **Números das migrações.** Conferir que 0154, 0155 e 0156 continuam livres no `master` depois do merge (as `0125` a
   `0129` seguem reservadas à outra branch, que será renumerada para `0160` a `0164`):

   ```bash
   ls supabase/migrations | tail -5
   git ls-tree -r --name-only master supabase/migrations | tail -3
   ```

2. **Limite de upload.** Conferir no painel do Supabase (Storage → Settings) que o limite global de upload é de pelo
   menos 50 MB (já era em 09/10). Os buckets novos e o `anexos-oportunidade` aceitam até 50 MB.
3. **Representante legal.** Ter nome, cargo e CPF do representante preenchidos em Configurações → Empresa. Sem o nome
   (ou com CPF inválido), `gerar_documentos_proposta` e `gerar_declaracoes` respondem `sem_representante` e não geram
   nada; sem o cargo ou sem o CPF, o documento sai, mas com o bloco de assinatura incompleto e um aviso. O logo da
   empresa (também em Configurações → Empresa) é opcional: PNG de até 500×500 pixels ou JPG de até 2 MB; fora disso a
   declaração sai sem logo e com aviso.
4. **Consultas de conferência antes das migrações** (só leitura; cada uma só com o OK do Javerson, no SQL do painel ou
   com a CLI na versão fixada):

   ```bash
   # SÓ COM O OK DO JAVERSON — triggers das tabelas que as migrações e os smokes tocam
   npx supabase@2.118.0 db query --linked "select tgrelid::regclass as tabela, tgname from pg_trigger where not tgisinternal and tgrelid in ('public.empresa'::regclass, 'public.oportunidade'::regclass, 'public.usuario_empresa'::regclass, 'public.arquivo_oportunidade'::regclass, 'public.arquivo_texto_pagina'::regclass) order by 1, 2;"
   # SÓ COM O OK DO JAVERSON — versão do Postgres
   npx supabase@2.118.0 db query --linked "show server_version;"
   ```

   O esperado na primeira consulta: o trigger **`set_updated_at`** (é o que `attach_updated_at_trigger` cria, nas tabelas
   que têm `updated_at`), o **`referencias_da_empresa`** nas tabelas que o têm (por exemplo `arquivo_texto_pagina`, da 0149) e os triggers já conhecidos das tabelas antigas. As tabelas novas das migrações 0154 a 0156 (`acervo_documento`
   com `acervo_documento_versao`, `habilitacao_config` e `modelo_declaracao`) ainda não existem e não entram nesta
   consulta. Se aparecer um trigger com **outro nome**, **cole o resultado no chat e pare** antes de aplicar qualquer
   migração. A versão do Postgres precisa ser 13 ou mais nova.

5. **Os smokes não deixam nada gravado.** Os três terminam em `rollback`. O da 0155 usa empresas sintéticas e roda a
   função de alerta (a mesma varredura do cron): **não rodar perto das 08:45 de Brasília**, que é o horário do job
   `alertar_documentos_habilitacao` (`45 11 * * *`, em UTC). O passo 11 desse smoke, o último, prova que a função falha
   quando TODAS as empresas falham: para isso apaga (só dentro da transação) os avisos de habilitação de hoje e cria um
   gatilho de teste em `notificacao`, o que pede uma trava na tabela até o `rollback` (quem grava aviso espera alguns
   instantes). Se a trava não vier em 3 s o smoke desiste com erro de `lock_timeout`: é só rodar de novo.
6. **Árvore limpa.** O deploy de função leva a árvore de trabalho inteira de `_shared/`. Antes de publicar qualquer
   função:

   ```bash
   git status --short supabase/      # tem de sair vazio
   ```

## Ordem de publicação

**Cada comando abaixo só com o OK do Javerson.** Todos rodam na raiz do repositório, já com o merge em `master`.

```bash
# SÓ COM O OK DO JAVERSON — Parte A: a biblioteca de documentos
npx supabase@2.118.0 db query --linked -f supabase/migrations/0154_acervo_documento.sql
npx supabase@2.118.0 db query --linked -f tools/smoke-habilitacao-documentos.sql      # tem de terminar em "SMOKE TEST OK"

# SÓ COM O OK DO JAVERSON — Parte A: lembretes de vencimento
npx supabase@2.118.0 db query --linked -f supabase/migrations/0155_habilitacao_lembretes.sql
npx supabase@2.118.0 db query --linked -f tools/smoke-habilitacao-lembretes.sql       # "SMOKE TEST OK" (longe das 08:45)
npx supabase@2.118.0 functions deploy habilitacao-lembretes --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt --use-api

# SÓ COM O OK DO JAVERSON — Parte B: arquivos gerados pelo servidor
npx supabase@2.118.0 db query --linked -f supabase/migrations/0156_documentos_gerados.sql
npx supabase@2.118.0 db query --linked -f tools/smoke-documentos-gerados.sql          # "SMOKE TEST OK"

# SÓ COM O OK DO JAVERSON — Partes A (o "Atende?") e C (as ferramentas): as funções levam a árvore de _shared inteira
git status --short supabase/                                                           # vazio
npx supabase@2.118.0 functions deploy mcp --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt --use-api
npx supabase@2.118.0 functions deploy ia-processar --project-ref fpyvdwpvxrubrkdwrqbs --use-api      # SEM --no-verify-jwt

# SÓ COM O OK DO JAVERSON — Front (aba nova, falta assinar, baixar): push do merge em master publica o site
git log --oneline origin/master..master        # conferir o que vai subir
git push origin master
gh run list --limit 2                          # acompanhar o "Deploy frontend to Hostgator"

# SÓ COM O OK DO JAVERSON — Carga inicial da biblioteca (LOGO depois da 0154 e do front, antes de usar as ferramentas;
# com a pasta dos documentos no PC; Node 23.6 ou mais novo)
# o script só ESCREVE enviar.sh e carga.sql na pasta de saída: confira os dois arquivos antes de rodar
node tools/habilitacao/carga-inicial.mjs --csv <inventario.csv> --pasta <pasta dos documentos> --empresa <uuid da empresa> --saida <pasta de saída fora do repositório>
bash <pasta de saída>/enviar.sh
npx supabase@2.118.0 db query --linked -f <pasta de saída>/carga.sql
```

Por que esta ordem, e o que fica de fora:

- **Funções alteradas pela branch:** `habilitacao-lembretes` (nova; `--no-verify-jwt`), `mcp` (`--no-verify-jwt`) e
  `ia-processar` (**sem** `--no-verify-jwt`: o "Atende?" passou a ler a biblioteca). **`mcp-oauth` e
  `portal-cliente-dados` não mudaram nesta branch: não publicar.**
- **0154 antes do `mcp` e do `ia-processar`:** eles leem `acervo_documento`. **0156 antes do `mcp`:** ele grava pela
  função `conector_gravar_arquivo`. Antes da 0154, cada "Atende?" registra um erro no log e usa só o perfil da empresa
  (sem a biblioteca); o erro some depois da 0154.
- **O front não quebra antes das migrações, mas a ordem acima é a recomendada.** Antes da 0154, a aba "Documentos e
  certidões" **aparece**, só com o aviso vermelho "Não foi possível carregar os documentos" (sem a lista, sem o botão
  "Novo documento" e sem os cartões de lembretes e de modelos); o resto do Acervo Técnico continua funcionando. As
  telas e gravações que dependem das colunas e tabelas da 0155 e da 0156 também só funcionam depois delas.
- **A carga inicial** (a biblioteca começa vazia) vem **logo depois da 0154 e do front**, não por último e não "quando der".
  Com a biblioteca parcial (basta UM documento ativo com validade), o "Atende?" e o Resumo do Acervo passam a ler a
  biblioteca **no lugar das certidões do perfil da empresa** (o perfil só vale com a biblioteca vazia): o que ainda não
  foi carregado aparece como faltando. Os nomes dos arquivos têm dado pessoal: o script recusa uma pasta de saída dentro do repositório, e a
  saída nunca é versionada.

## Conferências depois de publicar

Só leitura (cada uma só com o OK do Javerson):

```sql
-- os dois crons novos
select jobname, schedule, active from cron.job
 where jobname in ('alertar_documentos_habilitacao', 'habilitacao_lembretes_reenvio') order by jobname;
-- a última execução de cada um (status 'failed' no alerta = TODAS as empresas falharam; se só algumas falharam o job
-- aparece como 'succeeded' e o aviso fica no log do banco)
select j.jobname, d.status, d.start_time, left(d.return_message, 120) as retorno
  from cron.job_run_details d join cron.job j using (jobid)
 where j.jobname in ('alertar_documentos_habilitacao', 'habilitacao_lembretes_reenvio')
 order by d.start_time desc limit 6;
-- a fila do WhatsApp (pendentes, enviadas e o maior número de tentativas)
select count(*) filter (where enviado_em is null) as pendentes, count(*) filter (where enviado_em is not null) as enviadas,
       max(tentativas) as max_tentativas from public.habilitacao_lembrete_fila;
-- a biblioteca por tipo (sem nome nem arquivo)
select tipo, count(*) filter (where ativo) as em_vigor, count(*) as total
  from public.acervo_documento where deleted_at is null group by tipo order by tipo;
-- as últimas chamadas das seis ferramentas (alvo e motivo)
select criado_em, ferramenta, resultado, motivo, alvo from mcp_auditoria
 where ferramenta in ('anexar_habilitacao', 'anexar_acervo', 'gerar_documentos_proposta', 'gerar_declaracoes',
                      'anexar_edital_por_url', 'checklist_habilitacao')
 order by criado_em desc limit 30;
-- os arquivos que o servidor gravou, por origem e assinatura (sem nome de arquivo)
select split_part(origem, ':', 1) as origem, count(*) as arquivos,
       count(*) filter (where assinatura = 'pendente') as falta_assinar,
       count(*) filter (where assinatura = 'assinado') as assinados
  from public.arquivo_oportunidade where origem is not null and deleted_at is null group by 1 order by 1;
```

E o verificador do conector, que confere as 23 ferramentas e os 4 roteiros na ordem do registro (fala com produção; rode
no seu terminal e não cole a chave no chat; a chave manual sai de Meu Perfil → Claude (IA)):

```bash
# SÓ COM O OK DO JAVERSON
SIGO_CHAVE=<chave manual> SIGO_ANON=<anon key> node tools/conector/verificar-conector.mjs      # "Tudo certo."
```

## Roteiro de teste do Javerson

Numa oportunidade **TESTE** (nunca numa licitação real), com o Claude conectado ao SIGO:

1. No SIGO, abrir Oportunidades → Acervo técnico → **Documentos e certidões**: conferir a biblioteca, o pacote do mês (o
   que vence em 30 dias e o que já venceu) e o cartão "Lembretes" (dias de antecedência, quem recebe e WhatsApp).
2. No Claude: "Use o roteiro Montar a licitação completa" com o edital anexado (ou só os passos abaixo, um por vez).
3. `anexar_edital_por_url` com o link público do edital: o arquivo aparece na pasta Edital. Chamar **duas vezes com o
   mesmo link**: a segunda responde que já estava anexado e não mexe em nada. Se possível, testar também um edital
   grande (uns 45 MB).
4. `gerar_documentos_proposta`: quatro arquivos em Envelope 01 – Proposta, os PDFs com "falta assinar", e os números
   iguais aos de **Exportar proposta** e **Exportar cronograma** da tela.
5. `gerar_declaracoes` com dois modelos da empresa e um texto do edital: PDF e .docx em Envelope 02 – Habilitação. Abrir
   o .docx no Word e conferir que **o bloco de assinatura não ficou sozinho numa página**.
6. `gerar_declaracoes` com **12 declarações de uma vez** e o logo da empresa (confere o limite de processamento da
   função: o pior caso é apertado, ver "Limitações").
7. `anexar_habilitacao`: as certidões válidas vão para o Envelope 02; as vencidas voltam no chat e **não são
   anexadas**. Se a chamada parar por tempo (depois de 45 s), volta `nao_processados` e o aviso para chamar de novo.
8. **Renovar uma certidão** na biblioteca (versão nova) e chamar `anexar_habilitacao` e `checklist_habilitacao` de novo:
   a cópia antiga aparece como desatualizada (o SIGO não apaga: quem exclui da pasta é você).
9. `anexar_acervo`: os PDFs das CATs do "Atende?" vão para o Envelope 02.
10. Assinar um PDF no gov.br e usar **"Enviar assinado"**: o selo vira "assinado" e gerar de novo não troca o assinado.
    Repetir com **dois ou três PDFs seguidos**, um depois do outro.
11. `checklist_habilitacao`: o que falta, o que venceu e o que falta assinar. Só aparece "pronto" quando não sobra
    nada. O edital enviado pela tela (pasta Edital) conta como edital anexado, e a declaração gerada com o texto do
    edital cobre a declaração que o edital exige (o checklist não manda gerar de novo).
12. Repetir uma ferramenta: os arquivos são trocados no lugar, sem duplicar.

## Decisões tomadas na execução

Escolhas que apareceram durante a execução e não estavam no plano. O Javerson pode vetar qualquer uma.

1. **Biblioteca, versão atual excluída:** excluir a versão atual de um documento reativa a versão anterior (em vez de
   deixar o tipo sem documento). Restaurar a excluída volta a deixá-la como atual.
2. **Lembretes de vencimento:** a configuração (dias de antecedência, destinatários e WhatsApp) fica num cartão da
   própria aba, não em Configurações. O envio usa uma fila no banco, com reenvio a cada 30 minutos (job
   `habilitacao_lembretes_reenvio`), sem segredo novo.
3. **Dois tipos de documento a mais** na biblioteca: certidão simplificada da Junta Comercial e SICAF (cadastro de
   fornecedor), porque os documentos em vigor da empresa já incluíam os dois.
4. **"Vence antes da sessão":** vale a data de sessão da oportunidade (a que a tela mostra e o usuário corrige quando a
   sessão é adiada); a data lida do edital é só reserva. Sem data futura, a ferramenta avisa que não conferiu.
5. **PDF assinado é sempre mantido**, e o Excel (proposta ou cronograma) ou o .docx (declaração) do mesmo documento
   também, para não ficarem com valores diferentes do assinado. Para refazer, o usuário exclui o PDF assinado na aba
   Arquivos.
6. **Declarações, assinatura nunca sozinha:** o bloco de assinatura nunca fica sozinho numa página. No PDF, as duas
   últimas linhas do texto vão junto; no Word, o último parágrafo inteiro vai junto.
7. **Checklist:** sem cronograma gravado na oportunidade, as linhas do cronograma ficam "sem cronograma" (não travam o
   "pronto"), com aviso e passo para conferir no edital. Exigência que o SIGO não reconhece fica em "verificar" e impede
   o "pronto" até o usuário conferir.
8. **Limites do conector** (por causa do tempo máximo de processamento das funções): orçamento até 800 linhas e
   cronograma até 2400 células (etapas × meses); acima disso, exportar pela tela. Logo nas declarações: PNG até 300 mil
   pixels (uns 500×500) ou JPG até 2 MB; fora disso, a declaração sai sem logo e com aviso (WebP não entra).
9. **Edital pelo link:** o mesmo link com o mesmo arquivo não é gravado de novo. Se o arquivo mudou, é trocado no lugar
   e o texto preparado é descartado (clicar de novo em "Preparar para o Claude").
10. **Segurança:** o Storage do conector passou a ser preso à pasta da empresa para TODAS as ferramentas (inclusive as
    que já existiam); refs com caractere de controle ou fora da pasta são recusadas; o download por link só vai a
    endereços públicos, por https na porta 443.
11. **Biblioteca × oportunidade:** cópia de certidão renovada ou vencida que ficou na pasta do envelope é apontada pelo
    `anexar_habilitacao` e pelo checklist. O conector nunca apaga arquivo.

## Pontos para decidir (nada disso foi feito)

1. **Portal do Cliente.** A função `portal-cliente-dados` mostra TODOS os arquivos da oportunidade ou do projeto ao
   cliente que tem acesso ao portal. As cópias da biblioteca (balanço, contrato social, certidões, CATs) passam a
   aparecer lá quando o portal estiver liberado. Recomendação: esconder do portal os arquivos com `origem` começando por
   `biblioteca:` ou `acervo:` (mudança pequena, mais a publicação de `portal-cliente-dados`). **Esta decisão (esconder
   ou não) tem de vir ANTES de usar `anexar_habilitacao` e `anexar_acervo` numa oportunidade com o portal liberado:** o
   arquivo copiado já é visto pelo cliente na hora.
2. **Página de envio por link.** `mcp-oauth/envio-tela.ts` ainda usa o Storage sem o confinamento novo. Não é explorável
   hoje; embrulhar é uma linha, mais a publicação de `mcp-oauth`.

## Limitações conhecidas

- **Nada disto rodou no Deno nem no Edge antes.** O primeiro deploy do `mcp` é o teste real das bibliotecas `npm:` de
  PDF e Excel, do `redirect: "manual"` do download, do DNS e da descompressão do logo. Se voltar
  `gerador_indisponivel`, ver "Se algo der errado".
- **Folga de processamento estreita no pior caso:** 12 declarações longas com o logo no limite levam uns 1,6 s num PC
  i3, para um limite de uns 2 s da função. Por isso o passo 6 do roteiro.
- Antes da 0154, cada "Atende?" registra um erro no log e usa só o perfil (sem a biblioteca): some depois da 0154.
- **Arquivo anexado à mão (sem `origem`) não conta no checklist** como documento da biblioteca, **nem como proposta,
  cronograma ou declaração**: o checklist só reconhece o que o SIGO gerou ou copiou (a `origem` do arquivo), e diz que
  falta o que foi enviado pela tela. Exceção: o edital enviado pela tela conta (arquivo na pasta "Edital").
- **`anexar_habilitacao` para depois de 45 s.** São até 60 cópias em sequência, e o Claude tem um tempo-limite por
  chamada. Depois de 45 s a ferramenta não inicia mais cópia e devolve o que ficou em `nao_processados`, com o aviso
  "Ainda faltam N documento(s): chame anexar_habilitacao de novo para continuar". Chamar de novo é seguro (o que já foi
  copiado não é duplicado). A `anexar_acervo` (até 40 CATs) não tem essa trava.
- **A função pública `habilitacao-lembretes` responde só `{ success: true }`** (as contagens da fila ficam no log da
  função). Quem chamar a função de fora, várias vezes, durante uma queda do WhatsApp pode esgotar as 3 tentativas das
  mensagens pendentes: elas ficam na fila com o erro e não saem mais. Risco aceito: a função só envia o que o banco já
  decidiu, e o aviso do sino continua valendo.
- **Risco residual aceito no download por link:** troca de IP entre a consulta ao DNS e a conexão. A defesa é https,
  porta 443 e certificado válido: nunca relaxar para http nem para certificado inválido.
- O `tools/conector/isolamento-conector.mjs` não foi estendido às seis ferramentas novas: o isolamento entre empresas
  delas é conferido só pelos testes com banco falso.

## Se algo der errado

- **As migrações são aditivas e inofensivas para o código antigo:** criam tabelas, funções, bucket e cron, e a 0156
  também (1) acrescenta os tipos .docx, .doc, .xls e .zip aos aceitos do bucket `anexos-oportunidade` e (2) acrescenta
  duas colunas nulas (`origem` e `assinatura`) e um índice único parcial em `arquivo_oportunidade`. Nada disso muda o que
  o código antigo faz, e não é preciso desfazer. Para parar os lembretes:

  ```sql
  select cron.unschedule('alertar_documentos_habilitacao');
  select cron.unschedule('habilitacao_lembretes_reenvio');
  ```

- **Função com problema:** publicar de novo a versão anterior (`git checkout <commit anterior> -- supabase/functions`
  num worktree limpo e o mesmo `functions deploy`).
- **`gerador_indisponivel`** (as bibliotecas `npm:` não carregaram no Edge Runtime; só `gerar_documentos_proposta` e
  `gerar_declaracoes` voltam isso). Duas saídas, na ordem:
  - **Plano B:** trocar os três imports de `supabase/functions/mcp/gerador.ts` por `https://esm.sh/<pacote>@<versão>`,
    continuando com import dinâmico (`import("https://esm.sh/jspdf@2.5.2")`,
    `import("https://esm.sh/jspdf-autotable@3.8.4")` e `import("https://esm.sh/xlsx@0.18.5")`: as mesmas versões da tela)
    e publicar o `mcp` de novo. As outras 21 ferramentas não são afetadas.
  - **Plano C**, se o plano B também não carregar: import **estático** no topo de `gerador.ts` (no lugar dos três
    `import(...)` dentro de `carregarLibs`). Aviso: com import estático o `mcp` carrega as três bibliotecas em toda
    partida a frio da função, e portanto em qualquer chamada, mesmo nas ferramentas que não geram arquivo (mais lento e
    com mais memória). Só vale a pena se o dinâmico não funcionar de jeito nenhum.
- **`anexar_edital_por_url` recusando todo link** com `destino_bloqueado`: o DNS do Edge não respondeu (nem pelo
  `Deno.resolveDns`, nem pela consulta de reserva por HTTPS). A recusa é de propósito. Até corrigir, use
  `gerar_link_envio` e peça ao usuário para soltar o arquivo do edital na página de envio.
- **Front com problema:** reverter num commit novo e fazer push. O `git revert -m 1 <commit do merge>` só vale se o merge
  criou um commit de merge (`--no-ff`). Com **fast-forward** não existe commit de merge: reverta os commits da branch,
  do mais novo para o mais antigo, com `git revert --no-edit 7b91500..<último commit da branch>` (`7b91500` é o
  `master` de onde a branch saiu; `git log --oneline 7b91500..HEAD` lista os commits que serão revertidos). As migrações
  ficam como estão (são só tabelas e colunas novas).
- **Arquivo gerado errado numa oportunidade:** excluir pela aba Arquivos e rodar a ferramenta de novo (o conector nunca
  apaga).
- **Tirar o conector de uma empresa na hora:** SaaS Admin → "Conector Claude" desligado (`empresa.conector_claude`).

## Commits da branch (`git log --oneline 7b91500..HEAD`)

Plano:

- `046e5ab` docs(plano): habilitação e documentos da licitação gerados e anexados pelo SIGO

Parte A — biblioteca de documentos e lembretes:

- `c3f0c7b` feat(habilitacao): regras da biblioteca de documentos, na tela e no servidor
- `723c742` feat(habilitacao): tabela acervo_documento e bucket habilitacao (0154)
- `3bf690c` test(habilitacao): cobre a trava de formato de data e as bordas das regras da biblioteca
- `e7d1ae7` feat(habilitacao): aba Documentos e certidões no Acervo Técnico
- `12dde3e` fix(habilitacao): cadeia de versões íntegra na 0154 e smoke com a escrita como authenticated
- `6b22eb4` fix(habilitacao): aba de documentos mostra erro de carga, avisa da versão anterior e trata as recusas do
  banco
- `4dca9c1` feat(habilitacao): Atende? e Resumo leem a validade da biblioteca de documentos
- `f1d53f1` feat(habilitacao): lembretes de vencimento no sino, com configuração na aba (0155)
- `2e2a8bb` feat(habilitacao): lembrete de vencimento por WhatsApp pela fila do banco
- `5c83cf2` feat(habilitacao): plano da carga inicial da biblioteca a partir do inventário
- `713be3e` fix(habilitacao): lembretes com destinatários de toda a empresa, reenvio e nome da empresa no WhatsApp
- `f37c1e0` fix(habilitacao): fila do WhatsApp com reserva, sem envio repetido e com erro de gravação tratado

Parte B — documentos gerados no servidor:

- `836024d` feat(documentos): dados da proposta e do cronograma no servidor, com paridade
- `1bca5ca` feat(documentos): Excel e PDF da proposta e do cronograma gerados no servidor
- `05b0cea` feat(documentos): modelos de declaração, variáveis e validação, na tela e no servidor
- `198b23e` feat(documentos): declaração em PDF e .docx com papel timbrado e bloco de assinatura
- `676579c` fix(documentos): chave das declarações sem colisão em título longo e validações dos modelos
- `e76b47a` feat(documentos): origem e assinatura dos arquivos, modelos de declaração e gravação atômica (0156)
- `bb2bb24` fix(documentos): bloco de assinatura inteiro na página, .docx válido com texto hostil e logo conferido
- `bbaa7f9` fix(documentos): índice de origem por empresa e texto por página zerado na troca do arquivo (0156)
- `7f39df2` fix(documentos): assinatura da declaração nunca fica sozinha na página (PDF e Word)
- `2653210` feat(oportunidades): falta assinar, enviar assinado e baixar nos Arquivos; modelos de declaração no Acervo
- `e1c7b0c` fix(oportunidades): envio do assinado não se perde ao assinar em sequência; regra dos modelos sem duplicação

Parte C — ferramentas do conector:

- `e9b1abb` feat(conector): servidor grava arquivos na oportunidade (cópia, geração e download)
- `b56b1f1` fix(conector): Storage do conector confinado à pasta da empresa e gravação de arquivo mais defensiva
- `50dd466` feat(conector): anexar_habilitacao e anexar_acervo copiam os documentos pelo servidor
- `d404b63` fix(conector): caminho com caractere de controle não sai mais da pasta da empresa
- `4b9e334` fix(conector): anexar_habilitacao avisa cópia substituída ou vencida e usa a data da sessão da oportunidade
- `414eda8` feat(conector): gerar_documentos_proposta e gerar_declaracoes geram os arquivos no servidor
- `468242e` feat(conector): anexar_edital_por_url baixa o edital pelo servidor, com travas contra rede interna
- `036a5ac` fix(conector): geração de documentos segue quando um arquivo falha, logo conferido e assinado mantém o par
- `fb87bc9` feat(conector): checklist_habilitacao cruza o edital com os arquivos e a biblioteca
- `b2996dd` fix(documentos): logo PNG até 300 mil pixels e descompressão em fatias para caber no limite da Edge
- `180712a` fix(conector): checklist não dá "pronto" sem análise do edital e não confunde declaração com certidão
- `2ff61d6` feat(conector): registra as seis ferramentas de habilitação e o roteiro Montar a licitação completa
- `d980b65` fix(conector): checklist trava o pronto com análise vazia, registro sem Atende? e Atende? negativo
- Onda final da revisão geral: (este commit)
