# Handoff — Portal de Treinamento (EAD) do SIGO Obras

- **Status:** em aberto. Documento de passagem para o Codex (ou outro agente) terminar o portal.
- **Base:** levantamentos de 30/09/2026 (front, servidor, NR-1 Anexo II, dados de produção e convenções), conferidos no
  código do commit `0c114eb` (código igual em `c6cb273`). Os números de linha citados (`arquivo:linha`) são desse
  commit: se o arquivo mudou, procure pelo trecho.
- **Dono:** Javerson (aplica migrações, publica funções, faz push e toma as decisões da seção 6).
- Leia antes o `AGENTS.md` da raiz: as regras de lá valem aqui.

---

## 1. Para que serve e como usar

Este documento lista, em ordem, o que falta para o Portal de Treinamento ser liberado para alunos de verdade, e o que
depende de decisão do Javerson e do responsável técnico (RT).

Como trabalhar:

1. Pegue **uma tarefa por vez, na ordem** (T1, T2, ...). As de prioridade Alta vêm antes de qualquer matrícula real.
   Trabalhe numa branch própria (`codex/tNN-tema`), num clone ou worktree separado (regra 3 do `AGENTS.md`).
2. Leia a tarefa inteira e os arquivos citados. Se algo não bater com o código, pare e pergunte.
3. Cada tarefa termina com testes passando (`npm test --workspace=apps/web` ou `cd apps/web && npx vitest run <arquivo>`,
   e/ou `node --test`; nunca `npx vitest` na raiz), `npm run lint`, `no-undef` nos arquivos alterados de
   `src/components`, `src/pages` e `src/Layout.jsx` (`cd apps/web && npx eslint --rule "no-undef: error" <arquivos>`,
   caminho relativo a `apps/web`; `src/lib` fica fora do ESLint e quem cobre é o teste), `npm run build` quando mexer
   no front, e **um commit** na branch da tarefa, só com os arquivos dela.
4. **Produção é com o Javerson.** Você não aplica migração, não publica função, não faz push e não abre PR. Na
   descrição do commit, deixe os comandos prontos, na ordem (a linha "Produção" de cada tarefa diz quais):

```bash
# migração (o número é o próximo livre, a partir de 0131, confirmado com o Javerson)
supabase db query --linked -f supabase/migrations/NNNN_nome.sql

# funções com --no-verify-jwt: portal-funcionario, funcionario-acesso, recibo-fornecedor
npx supabase@2.118.0 functions deploy portal-funcionario --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt --use-api

# validar-certificado: SEM --no-verify-jwt (é a única do EAD com verify_jwt = true)
npx supabase@2.118.0 functions deploy validar-certificado --project-ref fpyvdwpvxrubrkdwrqbs --use-api

# front: push em master (o workflow deploy-hostgator publica o site)
```

5. **Teste manual** (clicar na tela) é feito pelo Javerson, ou com ele, usando a matrícula de teste da seção 7. O agente
   não faz login, não digita senha e não cria dado em produção (`npm run dev` usa o banco de produção).
6. Quando uma tarefa depender de decisão (seção 6), implemente o que a tarefa manda e deixe o valor configurável; não
   invente a decisão.

---

## 2. Visão geral

### 2.1 O que o portal faz hoje

**Aluno** (página pública `/PortalFuncionario`):

1. Entra com usuário (CPF) e senha. O RH cria o acesso com senha provisória (vale 7 dias); com ela o aluno cria a
   senha pessoal. Desde a T38 a senha é da pessoa e vale em todas as empresas em que ela tem cadastro: com duas ou
   mais, escolhe a empresa ao entrar e troca de empresa pelo cabeçalho (cada empresa libera com a sua provisória).
2. Vê as matrículas, com barra de progresso.
3. Abre o curso: aulas em ordem (cada uma só libera com a anterior concluída). Vídeo conta tempo só tocando e com a aba
   visível, e conclui aos 90%. Apostila (PDF) e texto contam tempo de leitura e exigem o clique "Marcar como lida".
4. Faz a prova (nota mínima, limite de tentativas, intervalo entre tentativas). Correção no servidor; gabarito comentado
   só depois de aprovado.
5. Assina o certificado com a própria senha e baixa o PDF (frente e verso, com código, QR e SHA-256).
6. Manda dúvidas ao tutor (aviso por WhatsApp se o curso tiver telefone de tutor).
7. Qualquer pessoa confere o certificado em `/ValidarCertificado?codigo=...` (CPF mascarado).

**RH** (RH & Segurança → aba "Treinamentos"):

1. Cadastra curso (carga, validade, nota mínima, tentativas, intervalo, RT, instrutor, tutor, conteúdo programático,
   "Publicado"), aulas (vídeo por upload ou YouTube, PDF, texto, legenda `.srt/.vtt`), questões e projeto pedagógico (PDF).
2. Matricula funcionários ativos em curso publicado e avisa pelo WhatsApp (cria o acesso se faltar).
3. Acompanha a tabela de matrículas e abre a trilha de auditoria (tempo por aula, tentativas, certificado, revogação,
   tentativa extra, CSV).
4. Responde dúvidas. Na Ficha do funcionário: cria, redefine, desativa e reativa o acesso ao portal.

### 2.2 Arquitetura e caminhos

Nas tarefas, os arquivos aparecem pelo nome curto desta tabela.

| Nome curto                      | Caminho                                                                                                    | Papel                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `PortalFuncionario.jsx`         | `apps/web/src/pages/PortalFuncionario.jsx`                                                                 | Login, troca de senha, painel do aluno                                                             |
| `LoginPortal.jsx`               | `apps/web/src/components/portal-funcionario/LoginPortal.jsx`                                               | Login e troca de senha                                                                             |
| `CursoPortal.jsx`               | `apps/web/src/components/portal-funcionario/CursoPortal.jsx`                                               | Aulas, contagem de tempo, prova, certificado                                                       |
| `AvaliacaoPortal.jsx`           | `apps/web/src/components/portal-funcionario/AvaliacaoPortal.jsx`                                           | Prova                                                                                              |
| `CertificadoPortal.jsx`         | `apps/web/src/components/portal-funcionario/CertificadoPortal.jsx`                                         | Assinatura e download do certificado                                                               |
| `DuvidasPortal.jsx`             | `apps/web/src/components/portal-funcionario/DuvidasPortal.jsx`                                             | Dúvidas do aluno                                                                                   |
| `api.js`                        | `apps/web/src/components/portal-funcionario/api.js`                                                        | `chamarPortal`, fila, sessão no `localStorage`                                                     |
| `ValidarCertificado.jsx`        | `apps/web/src/pages/ValidarCertificado.jsx`                                                                | Validação pública                                                                                  |
| `certificado-ead.js`            | `apps/web/src/lib/certificado-ead.js`                                                                      | PDF do certificado (gerado no navegador)                                                           |
| `TreinamentosEadTab.jsx`        | `apps/web/src/components/seguranca/TreinamentosEadTab.jsx`                                                 | Aba do RH (montada em `pages/SegurancaTrabalho.jsx`)                                               |
| `MatriculaAuditoriaSheet.jsx`   | `apps/web/src/components/seguranca/MatriculaAuditoriaSheet.jsx`                                            | Trilha de auditoria da matrícula                                                                   |
| `DuvidasTutorCard.jsx`          | `apps/web/src/components/seguranca/DuvidasTutorCard.jsx`                                                   | Dúvidas (tutor)                                                                                    |
| `AcessoPortalCard.jsx`          | `apps/web/src/components/seguranca/AcessoPortalCard.jsx` + `apps/web/src/lib/portal-funcionario-acesso.js` | Acesso ao portal (Ficha)                                                                           |
| `index.ts`                      | `supabase/functions/portal-funcionario/index.ts` (1.301 linhas)                                            | Tudo do aluno: login, dados, progresso, prova, certificado, ciência, dúvida                        |
| `funcionario-acesso`            | `supabase/functions/funcionario-acesso/index.ts`                                                           | RH cria/redefine/desativa acesso (JWT + permissão)                                                 |
| `validar-certificado`           | `supabase/functions/validar-certificado/index.ts`                                                          | Consulta pública (verify_jwt = true)                                                               |
| `_shared/portal-funcionario.ts` | `supabase/functions/_shared/portal-funcionario.ts`                                                         | Usuário, senha provisória, regra de senha, IP/dispositivo, trilha, código e SHA-256 (módulo puro)  |
| `_shared/portal-credencial.ts`  | idem                                                                                                       | T38: credencial da pessoa, situação do vínculo, login (4 comparações), ativação, sessão, RH (puro) |
| `_shared/portal-token.ts`       | idem                                                                                                       | Token HMAC, comum aos portais (as 12 h são `TTL_SESSAO` do `index.ts`)                             |
| `_shared/limite-tentativas.ts`  | idem                                                                                                       | Limitador por IP/conta (puro, com teste)                                                           |
| `_shared/storage-assinar.ts`    | idem                                                                                                       | `refDaEmpresa`: só assina arquivo da pasta da empresa                                              |

Outros pontos: as rotas públicas estão em `apps/web/src/pages.config.js:31-32` e `apps/web/src/Layout.jsx:141-142`;
o mapa de funções em `apps/web/src/api/sigoClient.js` (`portalFuncionario`, `funcionarioAcesso`, `validarCertificado`);
bucket privado `treinamentos` (até 1 GB por arquivo; o aluno só recebe URL assinada de 3 h).

**Tabelas** (todas com `empresa_id` e RLS, menos a credencial da T38, que é da pessoa e só o servidor lê):

| Tabela                      | O que guarda                                                                                                                                 | Escrita pela empresa (RLS + triggers)                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `treinamento_curso`         | curso, carga, validade, nota, tentativas, intervalo, RT, instrutor, tutor, projeto                                                           | livre (inclusive `DELETE`, ver T17)                                |
| `treinamento_aula`          | `ordem`, `modulo`, `tipo` (video/pdf/texto), `fonte`, refs, `duracao_seg`                                                                    | livre (inclusive `DELETE`)                                         |
| `treinamento_questao`       | `pergunta`, `opcoes` (jsonb), `correta` (índice), `comentario`                                                                               | livre (inclusive `DELETE`)                                         |
| `treinamento_matricula`     | status, datas, nota, `tentativas_extras`, `deleted_at`                                                                                       | criar `pendente`; mudar só `tentativas_extras`/`deleted_at` (0130) |
| `treinamento_progresso`     | segundos e conclusão por aula                                                                                                                | só leitura (0130)                                                  |
| `treinamento_tentativa`     | prova aplicada, respostas, ordem exibida, nota, IP, dispositivo                                                                              | só leitura                                                         |
| `treinamento_certificado`   | código, hash, `dados` congelados, assinatura do aluno, revogação                                                                             | só revogar, uma vez (0119)                                         |
| `treinamento_evento`        | trilha (hora do servidor, IP, dispositivo)                                                                                                   | só leitura                                                         |
| `treinamento_duvida`        | pergunta, resposta                                                                                                                           | só responder (0130)                                                |
| `funcionario_portal_acesso` | vínculo do cadastro (T38): credencial, provisória da empresa (7 dias), geração liberada, confirmação, `sessao_versao`                        | nenhuma (só servidor)                                              |
| `portal_credencial`         | a pessoa (T38): usuário (CPF ou com letras, único), hash bcrypt, geração e origem da senha, bloqueio, relógio do progresso; sem `empresa_id` | nenhuma (só servidor)                                              |
| `portal_credencial_evento`  | registro do operador (T38): o que contaria a uma empresa o que a pessoa faz em outra; sem o CPF                                              | nenhuma (só servidor; só de inclusão)                              |
| `entrega_ciencia`           | ciência eletrônica de entrega de EPI/ferramenta (aparece no portal)                                                                          | **livre** (ver T7)                                                 |

**Migrações do EAD:** `0097` (tabelas base), `0098` (carga), `0100` (vídeo próprio, questões, bucket), `0101`
(ciência), `0102` (legenda, comentário), `0103` (acesso, evento, tentativa, dúvida, certificado, colunas novas),
`0112` (limitador), `0118` (referências da mesma empresa), `0119` (certificado só revoga), `0130` (andamento só pelo
servidor), `0145` (credencial única e vínculo por empresa, T38) e `0146` (limpeza do vínculo, T38, dias depois do
deploy). Base dos triggers: `chamador_eh_servidor()` em `0110`.

**Ferramenta:** `tools/ead-sync-cursos.py` carregou cursos, aulas e apostilas em produção. **Não rode.**

**Testes hoje:** nenhum teste cobre o portal. O único ligado ao EAD é `_shared/limite-tentativas.test.ts`.

---

## 3. Estado em produção (contagens de 30/09/2026)

**Nunca houve uso real.** O caminho matrícula → progresso → prova → certificado nunca rodou com dados em produção.
Nenhum certificado foi emitido, então tudo pode ser corrigido antes da primeira emissão.

| Item                                                                | Valor                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Empresas com curso EAD                                              | 2 (Sinergia e Eletro), 8 cursos em cada (16 no total)                                 |
| Publicados / rascunho                                               | Sinergia 8 / 0; Eletro 0 / 8                                                          |
| Aulas                                                               | 168 (152 vídeos hospedados, todos com legenda e duração; 16 PDFs; 0 texto; 0 YouTube) |
| Apostila                                                            | todo curso tem 1 PDF como 1ª aula (leitura mínima de 15 a 60 min)                     |
| Questões                                                            | 164 (5 a 15 por curso; 28 com 3 alternativas, 136 com 4)                              |
| Numeração das aulas                                                 | 12 cursos começam em `ordem = 0` (o aluno vê "0. Guia do curso")                      |
| Matrículas, progresso, tentativas, certificados, dúvidas, ciências  | 0                                                                                     |
| Eventos na trilha                                                   | 2 (`acesso_criado`)                                                                   |
| Acessos ao portal                                                   | 2, ativos, com senha provisória, nunca usados                                         |
| Carga horária preenchida / RT                                       | 16 de 16 / 16 de 16                                                                   |
| Instrutor                                                           | 14 de 16 (falta nos 2 cursos NR-1)                                                    |
| Tutor (`tutor_telefone`), conteúdo programático, projeto pedagógico | 0 de 16                                                                               |
| Parâmetros                                                          | nota mínima 70, 3 tentativas, 30 min de intervalo em todos                            |
| Storage                                                             | 152 vídeos, 152 legendas e 16 PDFs existem; 0 referências quebradas                   |
| Assinaturas no catálogo antigo (Configurações)                      | 179 referências, todas para `base44.app`, todas mortas (404)                          |

Cursos (iguais nas duas empresas):

| Curso                                                | Carga declarada | Conteúdo medido (vídeos + leitura mínima) | Aulas (vídeo/PDF) | Questões | Validade |
| ---------------------------------------------------- | --------------- | ----------------------------------------- | ----------------- | -------- | -------- |
| NR-1 — Integração (GRO/PGR)                          | 4 h             | ~17 min                                   | 3 / 1             | 5        | sem      |
| NR-6 — EPI                                           | 4 h             | ~17 min                                   | 3 / 1             | 5        | sem      |
| NR-10 Básico                                         | 40 h            | ~2 h                                      | 15 / 1            | 15       | 24 meses |
| NR-10 Básico — Reciclagem Periódica (8h)             | 8 h             | ~2 h                                      | 15 / 1            | 15       | 24 meses |
| NR-10 Complementar — SEP                             | 40 h            | ~46 min                                   | 16 / 1            | 15       | 24 meses |
| NR-10 Complementar — SEP — Reciclagem Periódica (8h) | 8 h             | ~46 min                                   | 16 / 1            | 15       | 24 meses |
| NR-35 — Trabalho em Altura (apoio ao presencial)     | 8 h             | ~23 min                                   | 4 / 1             | 6        | 24 meses |
| NR-35 — Reciclagem Periódica (8h)                    | 8 h             | ~23 min                                   | 4 / 1             | 6        | 24 meses |

---

## 4. Conformidade com a NR-1 (item 1.7 e Anexo II) e NRs dos cursos

Não é parecer jurídico. Situação: **atende**, **parcial** ou **falta**.

| Requisito                                                 | Situação                                              | Resolve              |
| --------------------------------------------------------- | ----------------------------------------------------- | -------------------- |
| 1.7.1.1 Nome e assinatura do trabalhador no certificado   | atende (IP gravado é forjável)                        | T4                   |
| 1.7.1.1 Conteúdo programático                             | atende (lista de aulas; campo vazio)                  | T25, D5              |
| 1.7.1.1 Carga horária                                     | parcial (nominal, sem lastro)                         | T9, T12, D1          |
| 1.7.1.1 Data                                              | atende (conclusão após 21h sai com o dia seguinte)    | T8                   |
| 1.7.1.1 Local de realização                               | falta                                                 | T8, T12              |
| 1.7.1.1 Nome e qualificação do instrutor                  | parcial (opcional; NR-1 sem instrutor)                | T9, D6               |
| 1.7.1.1 Assinatura do responsável técnico                 | falta (só nome impresso)                              | T29, D7              |
| 1.7.1.2 Treinamento inicial, periódico e eventual         | parcial / falta                                       | T23, T24             |
| 1.4.4 e 1.7.1.2.1 Matrícula na admissão/troca de função   | falta (sem alerta "atividade sem treinamento")        | T22, T24             |
| 1.7.3 Certificado ao trabalhador e cópia arquivada        | atende (hash não verificável)                         | T10                  |
| 1.7.3 Guarda do PDF emitido                               | falta (guarda só os `dados` congelados; ver T10)      | fora de escopo       |
| 1.7.4 Capacitação nos documentos funcionais               | parcial                                               | T34                  |
| 1.7.6 a 1.7.8 Aproveitamento e convalidação               | falta                                                 | D17 (só se for usar) |
| 1.7.9.1 Prática a distância só se a NR permitir           | falta (tudo é EAD)                                    | T8, T12, D3, D9      |
| 1.6.2 Documento digital com ICP-Brasil                    | parcial (assinatura eletrônica simples)               | D7                   |
| 1.6.4 Integridade e rastreabilidade                       | parcial                                               | T10, T17             |
| 1.6.5 Acesso da Inspeção do Trabalho                      | parcial (CSV por matrícula)                           | T34                  |
| Anexo II 2.3 Duração EAD ≥ presencial                     | falta (40 h declaradas para ~2 h)                     | T9, D1               |
| 2.4 Conteúdo cobre os tópicos da NR                       | parcial (sem matriz tópico × aula)                    | D1, D9               |
| 2.5 Atividades práticas                                   | falta                                                 | T12, D9              |
| 3.1 Projeto pedagógico (15 itens)                         | falta (0 de 16 cursos)                                | T25, D5              |
| 3.3 Validação do projeto a cada 2 anos                    | falta                                                 | T25                  |
| 4.1 Projeto disponível à fiscalização, sindicato e CIPA   | parcial                                               | T25, T34             |
| 4.2 Material didático disponível                          | atende (PDF ruim no celular; URL vence)               | T11, T13             |
| 4.3 Ambiente que favoreça a concentração                  | falta                                                 | T35                  |
| 4.4 Período exclusivo, sem trabalho simultâneo            | parcial                                               | T35                  |
| 4.5 Canal de dúvidas operacional                          | parcial (nenhum tutor avisado)                        | T21, D4              |
| 4.6 Verificação de aprendizagem                           | parcial (curso sem questão conclui sem prova)         | T9, T16              |
| 4.6 Conceito satisfatório/insatisfatório no certificado   | falta                                                 | D10                  |
| 4.6.1 Prova com identificação e senha individual          | atende                                                | T16 (reforço)        |
| 4.6.2 Rastreabilidade da prova online                     | parcial                                               | T4, T16              |
| 4.6.3 Questões com situações práticas                     | parcial (amostra)                                     | D10                  |
| 4.7 Registros e logs de acesso                            | atende                                                | T17, T18             |
| 4.7.1 Guarda por 2 anos após a validade                   | parcial (curso pode ser apagado em cascata)           | T17, D11             |
| 5.1 Ambiente virtual apropriado                           | atende                                                | T11, T13             |
| NR-35 35.4.5 Treinamento só presencial (desde 16/07/2026) | falta (2 cursos publicados emitiriam certificado EAD) | T8, D3               |
| NR-10 Prática presencial, 40 h, pré-requisito do SEP      | falta                                                 | T12, T23, D1, D9     |
| NR-10 Reciclagem mínima de 16 h (a partir de 01/06/2027)  | falta (8 h)                                           | D9                   |
| NR-6 6.7.2 Ciência na entrega do EPI                      | parcial (ciência sem trava de servidor)               | T7                   |
| NR-6 6.7.2.1 Demonstração prática do uso do EPI           | falta (o curso NR-6 é só EAD)                         | T12, D1              |

---

## 5. Tarefas

Ordem de execução de cima para baixo. "Ref." aponta o achado nos levantamentos originais (não versionados; ficam na
máquina do Javerson). Toda tarefa de servidor que mexe em `index.ts` precisa de deploy de `portal-funcionario` (os
deploys de várias tarefas podem ser feitos juntos pelo Javerson).

Regras para todas as tarefas:

- Lógica nova vai para módulo puro com teste: front em `apps/web/src/lib/*.js` + `*.test.js` (Vitest, sem DOM);
  servidor em `supabase/functions/portal-funcionario/regras.ts` + `regras.test.ts` (criado na T3) ou em
  `_shared/portal-funcionario.ts` + `_shared/portal-funcionario.test.ts` (`node:test`).
- Não quebre o que está sólido: conclusão recalculada no servidor; gabarito nunca vai ao navegador antes da aprovação;
  bloqueio linear das aulas; limitador de login consumido antes da senha; sessão revogável por `sessao_versao`;
  isolamento por empresa em toda consulta do servidor; certificado só emitido pelo servidor e só revogável pela empresa.
- Coluna nova que aponta para outra tabela de negócio: trigger `referencias_da_empresa` (modelo em `0118`).
- Migração nova: idempotente, cabeçalho explicando o porquê, `select 'ok' as res;` no fim, **sem UPDATE de dados reais**
  (mudança de dado é decisão do Javerson, feita pela tela).
- Smoke em SQL (`tools/smoke-ead-*.sql`, nas T7, T12 e T17): o arquivo vai para um repositório público, então **nenhum
  UUID real**. O smoke escolhe a empresa em tempo de execução (`select id into v_empresa ...`, como em
  `tools/smoke-compras-aprovacao.sql`) ou usa o placeholder `<empresa_teste>`, que o Javerson troca na hora. Não peça o
  UUID para escrevê-lo no arquivo.
- Toda tarefa tem a linha "Produção" (o que o Javerson roda, na ordem). "Push" quer dizer: o Javerson faz o merge da
  branch em `master` e o push, o que publica o site.

### Prioridade Alta (antes da primeira matrícula real)

#### T1 — Lista de Presença quebrada e regra `no-undef` no ESLint

- **Ref.:** FR-01.
- **Problema:** `gerarListasPresenca` (`TreinamentosEadTab.jsx:500-620`) usa a variável `empresa` (`:528`, `:546-547`),
  que não existe no componente (as props são `empresaAtiva` e `user`, `:114`). O botão "Listas de Presença"
  (`:1319-1326`) pergunta data e instrutor por `prompt()` e depois quebra com `ReferenceError`, sem aviso. O ESLint não
  acusa porque `apps/web/eslint.config.js:15-16` espalha os `recommended` e o bloco `rules` (`:37`) os sobrescreve: só
  valem as 11 regras do bloco. Com `--rule "no-undef: error"` em `src/components src/pages src/Layout.jsx` há 9 erros:
  os 6 acima e 3 `safeParseJSON` sem import em `components/ferramental/InspecaoCaminhaoCampoModal.jsx:74,124` e
  `components/ferramental/ManutencaoEditarModal.jsx:71` (bug fora do EAD).
- **O que fazer:**
  1. Trocar `empresa` por `empresaAtiva` e envolver a função em `try/catch` com `toast.error`.
  2. Na assinatura do rodapé, usar `curso.responsavel_tecnico_nome` e `responsavel_tecnico_registro` no lugar do texto
     fixo "Responsável técnico da empresa" (`:614`).
  3. Acrescentar `"no-undef": "error"` ao bloco `rules` de `apps/web/eslint.config.js`.
  4. Importar `safeParseJSON` de `@/lib/json-utils` nos 2 arquivos de ferramental. Estes arquivos estão fora do EAD:
     **peça OK ao Javerson**; sem OK, faça só 1 e 2 e anote 3 e 4 na descrição.
- **Aceite** (comando: `cd apps/web && npx eslint --rule "no-undef: error" src/components src/pages src/Layout.jsx`):
  - com OK do Javerson (itens 1 a 4): o comando dá 0 erros, `no-undef` está na config e `npm run lint` passa a acusar
    variável inexistente;
  - sem OK (itens 1 e 2): o comando mostra só os 3 erros de ferramental, e a regra **não** entra na config (com ela, o
    `npm run lint` do CI quebraria);
  - nos dois casos, `npm run lint` e `npm run build` passam.
- **Como testar:** os comandos acima. Manual (seção 7): gerar a lista de um curso com a matrícula de teste.
- **Migração:** não.
- **Produção:** push.
- **Cuidados:** não ligue o `recommended` inteiro (abriria centenas de erros fora do escopo). Não mude ainda o texto
  "modalidade EAD" nem o horário fixo da lista: a T12 transforma a lista na ficha da sessão prática.

#### T2 — Gabarito deslocado no editor de questões

- **Ref.:** FR-04.
- **Problema:** `salvarQuestao` (`TreinamentosEadTab.jsx:417-441`) descarta alternativas vazias (`:418`) mas mantém o
  índice marcado como correto (`:426`). Ex.: A, (vazia), C, D com C correta grava `correta = 2`, que passa a ser D, sem
  aviso. O editor tem sempre 4 campos (`:1338`) e corta questão com 5 ou mais alternativas ao editar (`:1356`,
  `.slice(0, 4)`). `ordem: questoes.length + 1` (`:436`) repete números depois de exclusões.
- **O que fazer:** criar `apps/web/src/lib/ead-questao.js` com
  `normalizarQuestao({ pergunta, opcoes, correta, comentario })` → `{ ok, erro, dados }`: remove alternativas vazias **remapeando** o índice da correta, recusa se a
  marcada estiver vazia, exige pergunta e 2+ alternativas. Usar no `salvarQuestao`. Editor com número variável de
  alternativas (2 a 6, botões adicionar/remover), sem cortar as existentes. `ordem` = maior `ordem` + 1.
- **Aceite:** teste cobre: A,(vazia),C,D com C correta → `correta = 1` e 3 opções; correta vazia recusada; 5
  alternativas preservadas; pergunta vazia recusada.
- **Como testar:** `cd apps/web && npx vitest run src/lib/ead-questao.test.js`; lint; build.
- **Migração:** não.
- **Produção:** push.
- **Cuidados:** as 164 questões existentes não mudam; nada de regravação em massa.

#### T3 — Núcleo puro do `portal-funcionario`, com testes

- **Ref.:** M10, §12 do levantamento do servidor.
- **Problema:** toda a regra do aluno está dentro do `Deno.serve` de `index.ts` (1.301 linhas, com
  `await hashPassword(...)` no topo, `:81`, e import de `esm.sh`), então nada pode ser testado no Node. As tarefas seguintes
  precisam de testes.
- **O que fazer:** criar `supabase/functions/portal-funcionario/regras.ts` (sem `Deno.*`, sem import de URL) e mover
  para ele, **sem mudar comportamento**: `aulaLiberada` (`:143-149`); a parte pura de `situacaoReal` (`:213-217`:
  aulas ok, tem avaliação, aprovação, concluído); o crédito de tempo do `progresso` (`:802-811`: decorrido, pedido,
  aceito, teto pela duração); a regra de conclusão de aula (`:826-841`: 90% em vídeo, tempo completo + clique em
  apostila); a correção da prova (`:965-970`); o limite e o intervalo de tentativas (`:931-949`); o cálculo de
  `data_conclusao` e `proxima_renovacao` (`:229-245`, mantendo o comportamento atual em UTC, que a T8 corrige);
  `detalheLimitado` (`:168-184`). O `index.ts` importa de `./regras.ts`. Criar `regras.test.ts` com `node:test`.
- **Aceite:** `index.ts` só troca trechos por chamadas (diff revisável); testes cobrem cada função, inclusive bordas
  (aula sem duração, `pedido` maior que o decorrido, apostila sem clique, última tentativa no limite, intervalo ainda
  correndo, nota arredondada).
- **Como testar:** `node --test supabase/functions/portal-funcionario/regras.test.ts` e
  `node --test "supabase/functions/**/*.test.ts"` (todos continuam passando).
- **Migração:** não.
- **Produção:** deploy de `portal-funcionario` (pode ir junto com T4 a T10).
- **Cuidados:** refatoração pura. Se encontrar bug no caminho, anote e corrija na tarefa certa, não aqui.

#### T4 — IP confiável na trilha, na prova, no certificado e na ciência

- **Ref.:** A1.
- **Problema:** `origemDaRequisicao` (`_shared/portal-funcionario.ts:49-57`) grava a **1ª** entrada do
  `X-Forwarded-For`, que o cliente forja (o gateway concatena o que vier; vale a mais à direita, como documenta
  `ipDaRequisicao` em `_shared/limite-tentativas.ts:56-70`). Esse IP vai para a trilha
  (`_shared/portal-funcionario.ts:78`), a tentativa
  (`index.ts:1000`), a assinatura do certificado (`:1154`), a ciência (`:1217`) e o recibo do fornecedor
  (`recibo-fornecedor/index.ts:292`, `:350`).
- **O que fazer:** em `_shared/limite-tentativas.ts`, exportar `ipBrutoDaRequisicao(req)` (entrada mais à direita do
  `X-Forwarded-For`, senão `x-real-ip`, senão `null`) e fazer `ipDaRequisicao` usar essa função + `normalizarIp` (como
  hoje). `origemDaRequisicao` passa a usar `ipBrutoDaRequisicao` (sem reduzir IPv6 a /64: a trilha guarda o endereço
  completo). Criar `_shared/portal-funcionario.test.ts`.
- **Aceite:** `"198.51.100.7, 203.0.113.9"` → `203.0.113.9` (faixas de documentação, RFC 5737); só `x-real-ip` → ele;
  sem cabeçalho → `null`; `user-agent` cortado em 400; os 13 testes de `limite-tentativas.test.ts` seguem passando.
- **Como testar:**
  `node --test supabase/functions/_shared/portal-funcionario.test.ts supabase/functions/_shared/limite-tentativas.test.ts`.
- **Migração:** não.
- **Produção:** deploy de `portal-funcionario`, `funcionario-acesso` e `recibo-fornecedor` (as três usam o módulo).
- **Cuidados:** o deploy publica `_shared/` inteira: avise o Javerson para deployar com a árvore limpa.

#### T5 — Funcionário desativado ou excluído perde o acesso ao portal

- **Ref.:** A4, M6.
- **Problema:** desativar o funcionário faz só `Funcionario.update(id, { ativo: false })`
  (`pages/SegurancaTrabalho.jsx:435`). O login confere só `deleted_at` (`index.ts:386-392`), a validação da sessão
  confere só o acesso (`:413-432`) e `dados` nem filtra `deleted_at` (`:512-517`). O desligado continua estudando,
  dando ciência e emitindo certificado. Além disso, o `logout` só grava evento (`index.ts:475-478`): o token segue
  válido por até 12 h.
- **O que fazer:** em `regras.ts`, `funcionarioPodeEntrar(func)` (existe, `ativo !== false`, `deleted_at` nulo). No
  login, buscar também `ativo` e recusar com a mesma resposta de hoje para cadastro inativo (`:392`). Na validação da
  sessão (depois de carregar o acesso), carregar o funcionário (`ativo, deleted_at`, mesma empresa) e, se não puder
  entrar, responder 401 com `codigo: "SESSAO"` e mensagem "Cadastro inativo — fale com o RH". Reativar o funcionário
  devolve o acesso sem passo extra. No `logout`, incrementar `sessao_versao` (`sessao_versao + 1`), o que derruba as
  sessões do aluno.
- **Aceite:** testes da função pura; nenhuma ação com sessão funciona para funcionário inativo ou apagado; depois do
  logout, o token antigo recebe 401.
- **Como testar:** `node --test supabase/functions/portal-funcionario/regras.test.ts`. Manual (seção 7, passo final):
  desativar o funcionário de teste e ver o portal voltar ao login.
- **Migração:** não.
- **Produção:** deploy de `portal-funcionario`.
- **Cuidados:** é uma consulta a mais por chamada; use `select("ativo, deleted_at")` com `maybeSingle()`.

#### T6 — Duração do vídeo vem do cadastro, nunca do aluno

- **Ref.:** A2.
- **Problema:** se a aula de vídeo não tem `duracao_seg`, o servidor grava a duração que o navegador do primeiro aluno
  informar (`index.ts:783-791`), para todos. Com `duracao_seg = 1`, `minimoSeg = 0` e a aula conclui no 1º sinal
  (`:828-830`). O cadastro de vídeo não grava duração (`TreinamentosEadTab.jsx:262-282`) e o texto de ajuda diz
  "detectada na primeira exibição" (`:1314-1316`). Hoje as 152 aulas têm duração; o risco é de toda aula nova.
- **O que fazer:**
  1. Cadastro (RH): ao escolher o arquivo de vídeo, ler a duração no navegador (`<video preload="metadata">` com
     `URL.createObjectURL(file)`, evento `loadedmetadata`) e gravar `duracao_seg` no `create`. YouTube: campo
     obrigatório de duração (mm:ss). Permitir editar a duração do vídeo em `salvarAulaEdicao` (hoje só não-vídeo,
     `:383-390`). Selo "sem duração" na lista de aulas. Atualizar o texto de ajuda.
  2. Servidor: parar de gravar a duração enviada pelo aluno; ignorar `body.duracao_seg`. Vídeo sem `duracao_seg`
     responde 409 `codigo: "AULA_SEM_DURACAO"` ("Esta aula está sem duração cadastrada — avise o RH") e não conclui.
  3. Portal: parar de enviar `duracao_seg` (`CursoPortal.jsx:80-92`) e mostrar a mensagem do código novo.
  4. Parse/format de "mm:ss" em `apps/web/src/lib/` com teste.
- **Aceite:** aula de vídeo nova nasce com duração; teste do servidor: vídeo sem duração nunca conclui; as 152 aulas
  atuais não mudam.
- **Como testar:** Vitest do parse/format; `node --test` de `regras.ts`. Manual: cadastrar aula no curso de teste (seção 7).
- **Migração:** não (o `CHECK` de duração fica na T32).
- **Produção:** deploy de `portal-funcionario`; push do front.

#### T7 — Ciência de entrega só confirmada pelo servidor

- **Ref.:** A3; NR-6 6.7.2.
- **Problema:** `entrega_ciencia` (`supabase/migrations/0101_entrega_ciencia.sql:30-40`) só tem `tenant_isolation`
  ALL: qualquer usuário da empresa grava `status='confirmada'`, `confirmada_em` e `evidencia` por `/rest/v1`, o mesmo
  buraco que a `0130` fechou no treinamento. O `UPDATE` do portal não exige `status='pendente'` (`index.ts:1219-1222`):
  uma 2ª aba sobrescreve a evidência.
- **O que fazer:**
  1. Migração nova `NNNN_ciencia_so_servidor.sql` no padrão da `0130` (função `security definer`,
     `set search_path = public`; passam `chamador_eh_servidor()` e `current_user_is_super_admin()`): no INSERT fora do servidor, forçar
     `status='pendente'`, `confirmada_em=null`, `evidencia=null`; no UPDATE fora do servidor, só podem mudar
     `deleted_at` e `updated_at` e, enquanto `old.status='pendente'`, também `tipo`, `descricao`, `itens`.
     `revoke all ... from anon`; `revoke delete, truncate ... from authenticated`.
     `revoke all on function ... from public, anon, authenticated`.
  2. Servidor: `update(...).eq("id", ...).eq("status", "pendente").select("id")`; se não atualizou nada, responder como
     "Já confirmada".
  3. `tools/smoke-ead-ciencia.sql` em `begin; ... rollback;`, simulando o usuário com `set local role authenticated` e
     `set local request.jwt.claims` (role `authenticated`, `app_metadata.empresa_id` de uma empresa de teste escolhida
     pelo Javerson), conferindo: criar pendente funciona; confirmar direto falha com 42501; excluir (soft) funciona. A
     empresa é escolhida em tempo de execução ou fica como `<empresa_teste>` (ver "Regras para todas as tarefas"):
     nenhum UUID real no arquivo.
- **Aceite:** o que a tela faz hoje (`FichaFuncionarioSheet.jsx:184`, `create` com `empresa_id`, `funcionario_id`,
  `tipo`, `descricao`, `criada_por`) continua funcionando; smoke imprime OK.
- **Como testar:** revisão do SQL; o smoke é rodado pelo Javerson depois de aplicar a migração.
- **Migração:** sim (trigger + revokes).
- **Produção:** migração, depois deploy de `portal-funcionario`.
- **Cuidados:** confira com `grep -rn "EntregaCiencia" apps/web/src` que nenhuma tela grava outro campo.

#### T8 — Modalidade do curso, curso de apoio sem certificado, local e data corretos

- **Ref.:** NR-35 35.4.5 (Portaria MTE 1.259/2026); NR-1 1.7.1.1 (local) e 1.7.9.1; B1.
- **Problema:** o certificado sempre diz "Ensino a distância (EAD) — NR-1, Anexo II" (`index.ts:1126`;
  `certificado-ead.js:125-131`). A NR-35 passou a exigir treinamento presencial em 16/07/2026, e os 2 cursos NR-35 estão
  publicados numa das empresas: emitiriam certificado EAD sem valor. Não há local de realização no certificado
  (`index.ts:1119-1147`). As datas usam `toISOString().slice(0, 10)` (`index.ts:236-245`): conclusão entre 21h e 24h
  (Brasília) sai com o dia seguinte.
- **O que fazer:**
  1. Migração: `treinamento_curso.modalidade text not null default 'ead'` com
     `check (modalidade in ('ead', 'semipresencial', 'apoio'))`.
  2. Tela do curso: seletor "Modalidade" com explicação curta (EAD; semipresencial = teoria EAD + prática presencial;
     apoio = material de apoio ao presencial, **não emite certificado**).
  3. Servidor, ação `certificado`: `apoio` → 409 `codigo: "CURSO_DE_APOIO"`; `semipresencial` → 409
     `codigo: "PRATICA_PENDENTE"` (a T12 troca pela checagem real). `dados.curso.modalidade` passa a vir da modalidade;
     `dados.local = { ambiente: "Plataforma SIGO Obras — https://www.sigoobras.com.br/PortalFuncionario" }`.
  4. Ação `dados`: devolver `curso.modalidade` e `pode_emitir_certificado = false` para apoio. `CertificadoPortal.jsx`:
     para apoio, mostrar "Material de apoio ao treinamento presencial: não emite certificado".
  5. Datas: `dataBrasilia(date)` (ex.: `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })`) em
     `_shared/portal-funcionario.ts`, usada em `data_conclusao`, `proxima_renovacao` (meses somados sobre a data de
     Brasília) e no período do certificado.
  6. `certificado-ead.js` e `validar-certificado`: imprimir/devolver o local.
- **Aceite:** testes: 23h30 de Brasília (02h30Z do dia seguinte) → mesma data; renovação de 24 meses; apoio e
  semipresencial bloqueiam a emissão; texto da modalidade correto.
- **Como testar:** `node --test` de `regras.ts` e `_shared/portal-funcionario.test.ts`; lint e build.
- **Migração:** sim (coluna `modalidade`).
- **Produção:** migração → deploy de `portal-funcionario` e `validar-certificado` (sem `--no-verify-jwt`) → push.
- **Cuidados:** a migração **não** marca nenhum curso como `apoio` nem despublica nada: isso é decisão (D3), feita pelo
  Javerson na tela depois do deploy.

#### T9 — Requisitos para publicar e para emitir; curso novo nasce em rascunho

- **Ref.:** FR-02, M8, B10; Anexo II 2.3 e 4.6; NR-1 1.7.1.1.
- **Problema:** curso novo nasce publicado (`TreinamentosEadTab.jsx:645`, gravado em `:200`), ainda sem aulas. Nada é
  conferido antes de publicar (chave em `:1006-1021`). A emissão só exige carga horária (`index.ts:1115-1117`):
  instrutor e RT podem sair em branco; curso sem questão conclui sem prova (`:215-217`). `pode_emitir_certificado` usa
  `m.status` (`:699-700`) e a emissão recalcula, então o botão pode aparecer e a emissão recusar. A carga declarada não
  tem lastro no conteúdo (40 h para ~2 h).
- **O que fazer:**
  1. `apps/web/src/lib/ead-requisitos.js`: `tempoObrigatorioSeg(aulas)` (soma de `duracao_seg` das aulas não apagadas)
     e `requisitosDoCurso({ curso, aulas, questoes })` → lista `{ codigo, ok, bloqueia, texto }`. **Bloqueiam:** pelo
     menos 1 aula; toda aula com arquivo (`video_ref`, `youtube_id`, `arquivo_ref` ou `conteudo_texto`) e
     `duracao_seg > 0`; pelo menos `MIN_QUESTOES` questões (padrão 5, decisão D10); carga horária > 0; **carga EAD ×
     3600 ≤ tempo obrigatório** (carga EAD = carga total até a T12 existir; depois, a carga teórica); instrutor; RT;
     modalidade. **Avisam:** tutor (D4), projeto pedagógico (D5), conteúdo programático, validade em meses.
  2. Tela do curso: "Novo curso" com `ativo: false`; painel "Requisitos para publicar" com o que falta; chave
     "Publicado" desabilitada enquanto houver bloqueio; linha "Conteúdo medido: X h Y min · carga declarada: Z h". Na
     lista de cursos, selo "publicado com pendências" para os já publicados. No diálogo "Matricular" (`:1473`), só
     cursos publicados sem bloqueio.
  3. Servidor: mesma regra em `regras.ts` (`requisitosEmissao(curso, aulas, nQuestoes)`), aplicada na ação
     `certificado` (409 `codigo: "REQUISITOS"` com a lista) e no cálculo de `pode_emitir_certificado` em `dados`,
     usando os dados que `dados` já carrega (progresso, tentativas, aulas, questões), sem consulta extra por matrícula.
  4. `dados` passa a devolver também `pendencias_certificado`, com os textos dos requisitos que bloqueiam. Hoje
     `CertificadoPortal.jsx:76-83` diz "fica disponível assim que o RH definir a carga horária" sempre que não pode
     emitir; depois da T9 esse motivo seria falso nos 16 cursos atuais. Mostrar a lista no lugar do texto fixo.
- **Aceite:** testes das duas implementações com os mesmos casos (curso vazio, aula sem duração, 4 questões, sem
  instrutor, carga 40 h com 2 h de conteúdo bloqueia, carga 1 h com 1 h de conteúdo passa); o botão "Assine para
  emitir" só aparece quando o servidor permite; curso com carga sem lastro mostra no portal o motivo real.
- **Como testar:** `cd apps/web && npx vitest run src/lib/ead-requisitos.test.js`; `node --test` de `regras.ts`; lint;
  build.
- **Migração:** não.
- **Produção:** deploy de `portal-funcionario`; push.
- **Cuidados:** com a regra da carga, **nenhum dos 16 cursos atuais emite certificado** até a decisão D1. É o
  comportamento esperado; avise o Javerson no commit. Não despublique cursos por código.

#### T10 — Certificado verificável: hash canônico e situação "vencido"

- **Ref.:** M3, FP-01; NR-1 1.6.4.
- **Problema:** o hash é SHA-256 de `JSON.stringify({ codigo, dados, assinatura })` (`index.ts:1159`), mas `dados` e
  `assinatura_aluno` vão para `jsonb`, que reordena as chaves: o hash não é reproduzível a partir do banco, e nada o
  confere. A validação pública mostra "Certificado autêntico" sempre que não está revogado
  (`validar-certificado/index.ts:43`; `ValidarCertificado.jsx:102-108`), mesmo vencido (a validade é só uma linha,
  `:127-132`).
- **O que fazer:**
  1. `jsonCanonico(valor)` em `_shared/portal-funcionario.ts` (chaves ordenadas recursivamente, sem espaços) e hash =
     `sha256Hex(jsonCanonico({ codigo, dados, assinatura }))` na emissão.
  2. `validar-certificado`: recalcular o hash a partir de `codigo`, `dados` e `assinatura_aluno` gravados e devolver
     `integro`; devolver `vencido` (validade anterior à data de Brasília de hoje). Lógica em
     `supabase/functions/validar-certificado/regras.ts` com teste.
  3. `ValidarCertificado.jsx`: estados "Autêntico e válido" (verde), "Autêntico, vencido em DD/MM/AAAA" (âmbar),
     "Revogado" (vermelho), "Dados não conferem com o registro" (vermelho, quando `integro = false`).
- **Aceite:** teste: o mesmo objeto com chaves em outra ordem gera o mesmo hash; certificado com campo alterado →
  `integro = false`; validade ontem → `vencido`.
- **Como testar:**
  `node --test supabase/functions/_shared/portal-funcionario.test.ts supabase/functions/validar-certificado/regras.test.ts`;
  lint; build.
- **Migração:** não.
- **Produção:** deploy de `portal-funcionario` e de `validar-certificado` **sem** `--no-verify-jwt`; push.
- **Cuidados:** fazer **antes da primeira emissão real** (hoje há 0 certificados; depois disso existiriam duas versões
  de hash). Assinatura com chave do servidor (HMAC) não entra aqui: só se o Javerson pedir.

#### T11 — Apostila em PDF que abre no celular

- **Ref.:** FA-01; Anexo II 4.2.
- **Problema:** a apostila é a 1ª aula dos 16 cursos e bloqueia as demais, mas é mostrada só num `<iframe>`
  (`CursoPortal.jsx:356-362`). Navegador de celular costuma não mostrar PDF em `iframe` (o próprio SIGO trata isso em
  `components/shared/AnexoViewer.jsx:49` e `:508-520`). Se `arquivo_url` vem nulo, vira `about:blank`. O contador de
  leitura corre com o quadro em branco; abrir o PDF em outra aba esconde a aba do portal e para o contador
  (`CursoPortal.jsx:201-216`).
- **O que fazer:** em tela pequena ou toque (`(max-width: 640px), (pointer: coarse)`), renderizar o PDF dentro da
  página com `pdfjs-dist` (já é dependência; o carregador está em `apps/web/src/lib/edital-ia.js:60-80`: exporte-o ou
  mova para `apps/web/src/lib/pdfjs.js` sem mudar o comportamento do edital), página a página, com rolagem. No
  computador, manter o `iframe`. Nos dois casos, botão "Abrir em outra aba". URL nula: mensagem "Apostila indisponível
  — avise o RH" e contador parado.
- **Aceite:** a apostila aparece em celular sem sair do portal; o tempo de leitura conta; sem URL não há contador.
- **Como testar:** lint; build. Manual (seção 7) em celular Android e iPhone.
- **Migração:** não.
- **Produção:** push.
- **Cuidados:** a URL assinada vale 3 h (ver T13). Não baixar o PDF inteiro em memória duas vezes.

#### T12 — Parte prática presencial e certificado semipresencial

- **Ref.:** NR-1 1.7.9.1 e 1.7.1.3; Anexo II 2.5; NR-10 (prática presencial; 10.9.13 na redação que vale a partir de
  01/06/2027); plano P0-2 do levantamento da norma.
- **Problema:** não existe prática no produto (nenhuma tabela, campo ou tela). O certificado de NR-10 sairia ao fim da
  teoria em vídeo, declarando EAD. A "Lista de Presença" (`TreinamentosEadTab.jsx:500-620`) declara EAD, usa horário
  fixo de 10 h/dia e não grava nada.
- **O que fazer:**
  1. Migração: `treinamento_sessao_pratica` (curso, data, hora de início e fim, `carga_horas numeric`, local,
     instrutor e qualificação, observações, `lista_presenca_ref`, `deleted_at`) e `treinamento_pratica_participante`
     (sessão, matrícula, funcionário, `presente`, `resultado` em `('pendente','satisfatorio','insatisfatorio')`,
     `avaliado_por`, `avaliado_em`, observação, `deleted_at`; único por sessão + matrícula entre as não apagadas). RLS
     com `apply_tenant_rls`, `updated_at`, triggers `referencias_da_empresa`. Em `treinamento_curso`:
     `carga_teorica_horas numeric` e `carga_pratica_horas numeric`. Só a RLS deixaria qualquer usuário da empresa
     gravar "presente + satisfatório" e liberar o certificado (mesma falha do M2), então também: nas duas tabelas,
     `revoke all ... from anon`; `avaliado_por` e `avaliado_em` preenchidos por trigger (nunca pelo cliente); e anotar
     na descrição que a trava por permissão depende da T33.
  2. Tela do curso semipresencial: seção "Sessões práticas" (criar, lançar presença e resultado por matrícula, anexar a
     lista assinada digitalizada no bucket `treinamentos`). A Lista de Presença vira a ficha da sessão: data, horário,
     local e instrutor reais, texto de treinamento presencial, nomes de RT e instrutor.
  3. Servidor, `certificado`: semipresencial só emite com participação `presente` e `satisfatorio` numa sessão não
     apagada do mesmo curso (troca o bloqueio provisório da T8). Congelar em `dados.pratica` (data, local, instrutor,
     carga, resultado); `dados.local` passa a ter o local da prática; modalidade "Semipresencial: teoria EAD (X h) +
     prática presencial (Y h)".
  4. Requisitos (T9): semipresencial exige cargas teórica e prática preenchidas, somando a carga total; a regra do lastro
     usa a carga teórica.
  5. Portal: "Parte prática: pendente" ou "realizada em DD/MM, em <local>".
- **Aceite:** testes de `podeEmitirSemipresencial(...)` e dos requisitos; certificado semipresencial mostra as duas
  cargas e o local da prática; editar a sessão depois não muda certificado emitido.
- **Como testar:** Vitest e `node --test` das regras; `tools/smoke-ead-pratica.sql` (`begin; ... rollback;`) para o
  Javerson; manual na seção 7 com um curso de teste semipresencial.
- **Migração:** sim.
- **Produção:** migração → deploy de `portal-funcionario` e `validar-certificado` → push.
- **Cuidados:** os valores (carga prática de cada NR, quem é instrutor) são das decisões D1 e D9. Sem esta tarefa, os
  cursos NR-10 ficam sem certificado (bloqueados pela T8/T9).

### Prioridade Média

#### T13 — Player e arquivos: aluno nunca fica travado sem mensagem

- **Ref.:** FA-03, FA-04, FA-05, FA-13 (parte).
- **Problema:** o contador soma 1 s de relógio por segundo tocando (`CursoPortal.jsx:131-134`); quem assiste a 1,5x ou
  2x termina o vídeo com 50% a 67% contados, o `ended` para a contagem (`:336-339`) e a tela não diz nada. O rótulo
  "Assistido X de Y" usa a duração total, mas a aula conclui aos 90% (`:375-379`). URLs assinadas vencem em 3 h
  (`index.ts:49`) e o `<video>` não tem `onError` (`CursoPortal.jsx:320-350`). Aula `upload` com `video_url` nulo cai
  no bloco do YouTube, vazio (`:319-353`, `:172`). `carregarYouTubeAPI` não trata falha do script (`:21-36`). Sem
  `playsInline` (iOS abre em tela cheia).
- **O que fazer:** fixar a velocidade em 1x (`onRateChange` volta para 1 e avisa); no fim do vídeo com menos de 90%
  contado, aviso "só X% foi contado" e botão "Assistir de novo"; rótulo "X de Y (mínimo Z)". `onError` no vídeo:
  recarregar `dados` uma vez e trocar a URL; persistindo, mensagem e botão "Recarregar". Renovar `dados` ao abrir aula
  se o último carregamento passou de 2h30. URL nula: "Arquivo indisponível — avise o RH". `script.onerror` rejeita a
  promessa do YouTube com mensagem. `playsInline` no `<video>`. Lógica (percentual contado, precisa reassistir, idade
  dos dados) em `apps/web/src/lib/portal-video.js` com teste.
- **Aceite:** testes da lib; nenhum dos casos acima deixa tela preta ou em branco sem texto.
- **Como testar:** Vitest; lint; build; manual (seção 7): assistir a 2x, deixar a aba aberta por mais de 3 h.
- **Migração:** não.
- **Produção:** push.

#### T14 — Estados do portal e navegação entre aulas

- **Ref.:** FA-06, FA-07, FA-08 (parte).
- **Problema:** falha de rede no painel mostra o erro e, abaixo, "Nenhum treinamento atribuído" (`PortalFuncionario.jsx:100-113`,
  `:192-196`, `:240-247`), sem "tentar de novo". No curso, falha do `recarregar()` é ignorada e aparece "a próxima já
  está liberada" (`CursoPortal.jsx:102-112`). Curso sem aulas vira beco sem saída (`:399-403`). Não há "Próxima aula";
  "Continuar" abre sem aula selecionada; numeração usa `ordem` ("0. Guia do curso", `:466`; também
  `TreinamentosEadTab.jsx:1046` e `MatriculaAuditoriaSheet.jsx:121`, `:221`). Renovação mostra dois cartões iguais sem
  ordem (`index.ts:519-525`). Na prova, "Voltar" perde as respostas sem confirmação (`AvaliacaoPortal.jsx:164-166`), não
  há contador de respondidas, e o botão "Fazer avaliação final" não reabilita sozinho quando o intervalo acaba
  (`CursoPortal.jsx:234`).
- **O que fazer:** estado de erro com "Tentar de novo" (sem a mensagem de lista vazia); erro de recarga visível no
  curso; mensagem para curso sem aulas; botão "Próxima aula" e "Continuar" abrindo a próxima pendente; numerar pela
  posição (1, 2, 3...) nas três telas; ordenar matrículas (em andamento primeiro, concluídas por data) e separar
  "Concluídos"; selo quando o curso foi despublicado (o servidor passa a devolver `curso.ativo` em `dados`); prova com
  "N de M respondidas", rolar até a primeira sem resposta, confirmar antes de sair; temporizador que reabilita a prova
  no horário de `proxima_em`. Também (FA-07 e FA-08): retomar o vídeo na posição em que o aluno parou (hoje não
  retoma, `CursoPortal.jsx:161-163`) e guardar no navegador as respostas da prova em andamento, para que não se percam
  ao recarregar. Funções puras (`ordenarMatriculas`, `proximaAulaPendente`, `numerarAulas`) em
  `apps/web/src/lib/portal-curso.js` com teste.
- **Aceite:** testes da lib; roteiro manual da seção 7 sem becos sem saída.
- **Como testar:** Vitest; lint; build.
- **Migração:** não.
- **Produção:** deploy de `portal-funcionario` (campo `curso.ativo`); push.

#### T15 — Certificado no portal: logo, erro ao baixar e posição na tela

- **Ref.:** FA-10.
- **Problema:** o PDF baixado pelo aluno sai sem logo (`CertificadoPortal.jsx:39`), o do RH sai com logo
  (`MatriculaAuditoriaSheet.jsx:162-165`). `baixar` não tem `catch` (`CertificadoPortal.jsx:35-43`). O bloco do
  certificado aparece no topo durante a prova (`CursoPortal.jsx:294-302`). Se o QR falha, o erro passa em silêncio
  (`certificado-ead.js:29-47`, `:98`).
- **O que fazer:** `dados` devolve `empresa_logo_url` assinada pelo servidor (só se `empresa.logo_url` for referência
  da pasta da empresa; URL `base44` = sem logo), usando os helpers que já existem em `_shared/storage-assinar.ts`
  (`comLogoAssinado` em `:115` e `assinarDaEmpresa` em `:67`); nova função em `apps/web/src/lib/pdf-empresa.js` que
  carrega a logo a partir de uma URL já assinada (sem mudar `logoParaPdf`); `catch` com mensagem; esconder o bloco com
  `modo === "avaliacao"`; falha do QR mostra mensagem em vez de passar em silêncio.
- **Aceite:** PDF do aluno igual ao do RH; falha de geração (inclusive do QR) mostra mensagem.
- **Como testar:** lint; build; manual (seção 7).
- **Migração:** não.
- **Produção:** deploy de `portal-funcionario`; push.

#### T16 — Prova mais confiável e aulas bloqueadas sem conteúdo

- **Ref.:** M5, M4, FA-08 (parte); Anexo II 4.6, 4.6.1, 4.6.2.
- **Problema:** as questões vão ao navegador desde a matrícula (`index.ts:561-569`); o sorteio e a "ordem exibida" são
  do cliente (`AvaliacaoPortal.jsx:30-51`; `index.ts:951-966`); o servidor aceita 1 resposta só (`:902`) e não exige
  início nem tempo mínimo; a resposta de reprovação devolve `acertos` e `total` (`:1043-1054`), o que permite deduzir o
  gabarito em bancos de 5 ou 6 questões. Além disso, `dados` assina e devolve `video_url`, `legenda_url`, `arquivo_url`
  e `conteudo_texto` também das aulas ainda bloqueadas (`index.ts:597-610`, `:648-651`): o bloqueio linear só vale
  para o crédito de tempo, e as URLs (3 h) podem ser repassadas.
- **O que fazer:**
  1. Nova ação `iniciar_avaliacao` no servidor: confere aulas concluídas, limite e intervalo; sorteia a ordem das
     questões e das alternativas no servidor (`crypto.getRandomValues`); devolve as questões sem gabarito; grava evento
     de servidor `avaliacao_iniciada` com a ordem sorteada. `dados` deixa de mandar `questoes` (só `tem_avaliacao` e a
     quantidade).
  2. `avaliacao`: exige resposta para todas as questões (400); exige `avaliacao_iniciada` desta matrícula posterior à
     última tentativa (409 `PROVA_NAO_INICIADA`); exige tempo mínimo desde o início (constante, ex. 10 s por questão,
     decisão D10); usa a ordem gravada pelo servidor na tentativa.
  3. Reprovado: devolve só "insatisfatório", tentativas e próxima liberação (sem nota, acertos e total; o RH vê tudo na
     trilha). Aprovado: como hoje.
  4. Opcional, se o Javerson confirmar (D10): pedir a senha ao iniciar, com limite de erros (`consumirTentativa`).
  5. `AvaliacaoPortal.jsx`: chama `iniciar_avaliacao`, remove o sorteio do cliente.
  6. Funções puras `sortearProva(questoes, aleatorio)` e `validarEnvio(...)` em `regras.ts`, com teste.
  7. `dados`: URLs e texto só para aulas com `liberada = true`; nas demais, `video_url`, `legenda_url`, `arquivo_url`
     e `conteudo_texto` vêm nulos e nada é assinado. Regra pura em `regras.ts`, com teste. O front já chama
     `recarregar()` ao concluir uma aula (`CursoPortal.jsx:104`), então a próxima aula recebe as URLs ao ser liberada.
- **Aceite:** testes das regras; nenhuma resposta do servidor contém `correta` antes da aprovação; tentativa sem início
  ou incompleta é recusada; nenhuma URL assinada de aula bloqueada.
- **Como testar:** `node --test`; Vitest se houver lib nova; lint; build; manual (seção 7).
- **Migração:** não (usa `treinamento_evento`).
- **Produção:** deploy de `portal-funcionario`; push (front e servidor juntos: o front antigo deixa de funcionar com o
  servidor novo).

#### T17 — Integridade da trilha no banco

- **Ref.:** M1, B7, §6 do levantamento do servidor; Anexo II 4.7.1; NR-1 1.6.4.
- **Problema:** `authenticated` ainda tem `DELETE` em `treinamento_curso`, `treinamento_aula`, `treinamento_questao` e
  `treinamento_duvida`, e as FKs são `ON DELETE CASCADE` (`0097:28,43,59-60`; `0103:70,99,130`): um `DELETE` pela API
  apaga certificados, tentativas e progresso. `treinamento_evento` e `treinamento_tentativa` não têm trava contra
  `UPDATE`/`DELETE` para service role e super admin. Eventos do navegador e do servidor ficam misturados, sem coluna que
  os distinga.
- **O que fazer:** migração nova:
  1. `revoke delete, truncate` de `authenticated` e `revoke all` de `anon` nessas 4 tabelas (o SDK só faz exclusão
     lógica; confirme com `grep -rn "\.delete()" apps/web/src` que nenhuma tela usa `DELETE` físico nelas).
  2. Trigger `trilha_imutavel` em `treinamento_evento`, `treinamento_tentativa` (UPDATE e DELETE) e
     `treinamento_certificado` (DELETE): recusa sempre, exceto quando
     `current_setting('sigo.permitir_expurgo', true) = 'on'` (usado só pelo Javerson em limpeza de teste e expurgo por retenção).
  3. `treinamento_evento.origem text not null default 'servidor' check (origem in ('servidor', 'navegador'))`; o
     servidor grava `navegador` na ação `evento` (`index.ts:724-769`).
  4. `MatriculaAuditoriaSheet.jsx`: selo "informado pelo navegador" nesses eventos.
  5. `tools/smoke-ead-trilha.sql` (`begin; ... rollback;`) conferindo as travas.
- **Aceite:** o servidor nunca faz UPDATE/DELETE nessas tabelas (confira no `index.ts`); smoke OK; tela mostra a origem.
- **Como testar:** revisão do SQL; lint; build; smoke pelo Javerson.
- **Migração:** sim.
- **Produção:** migração → deploy de `portal-funcionario` → push.
- **Cuidados:** apagar fisicamente funcionário ou empresa passa a exigir o `set local sigo.permitir_expurgo = 'on'`
  (a cascata dispara o trigger). Documente no cabeçalho da migração. A política de retenção é a decisão D11.

#### T18 — Trilha de auditoria na tela do RH

- **Ref.:** FR-10.
- **Problema:** `ROTULO_EVENTO` (`MatriculaAuditoriaSheet.jsx:14-40`) não tem `apostila_lida` (gravado em
  `index.ts:861`). A tabela de tentativas mostra só acertos, nota e IP (`:261-295`), embora a tentativa guarde a prova,
  as respostas e a ordem exibida. "Liberar tentativa" grava `tentativas_extras` direto (`:149-160`), sem evento nem
  autor, e não zera o intervalo entre tentativas (o aluno liberado ainda espera). Revogar usa `window.prompt`
  (`:167-176`) e o aluno não é avisado.
- **O que fazer:** rótulos para todos os eventos (incluindo os novos das T16 e T17); linha expansível por tentativa com
  pergunta, alternativa marcada, correta e ordem exibida; mover "liberar tentativa" e "revogar certificado" para ações
  novas de `funcionario-acesso` (`liberar_tentativa`, `revogar_certificado`), com a permissão "editar" de
  `Segurança do Trabalho / Funcionários` como as outras ações, evento na trilha com o e-mail do RH (`detalhe.por`), e
  aviso ao aluno por WhatsApp na revogação; `Dialog` no lugar de `prompt`. A liberação zera o intervalo: o servidor
  (`portal-funcionario`) ignora o intervalo quando há liberação registrada depois da última tentativa (regra pura em
  `regras.ts`, com teste).
- **Aceite:** trilha legível para todos os eventos; liberação e revogação aparecem na trilha com autor; aluno liberado
  pode fazer a prova na hora.
- **Como testar:** `node --test` (regra do intervalo e validação das ações); lint; build; manual (seção 7).
- **Migração:** não.
- **Produção:** deploy de `funcionario-acesso` e `portal-funcionario`; push.

#### T19 — Tela do RH: erros tratados e sem spinner que desmonta tudo

- **Ref.:** FR-03, FR-05.
- **Problema:** escritas sem `try/catch` em `salvarCurso` (`TreinamentosEadTab.jsx:171-210`), `salvarAulaEdicao`
  (`:376-395`), `moverAula` (`:364-374`), `removerAula` (`:397-401`), `salvarQuestao` (`:417-441`), excluir questão,
  `matricular` (`:444-470`, cria em série e pode parar no meio), `removerMatricula` (`:491-495`) e `baixar` da trilha.
  `recarregar()` liga `carregando` (`:134-135`) e o componente vira só um spinner (`:623-629`): painéis e cartão de
  dúvidas desmontam a cada gravação.
- **O que fazer:** `try/catch` com `toast.error` em todas; `matricular` com `bulkCreate` (um INSERT; mesmo conjunto de
  chaves) e mensagem de falha; `moverAula` renumerando a lista (1..n) em sequência, com erro tratado; spinner só na 1ª
  carga e atualização em segundo plano depois.
- **Aceite:** nenhuma rejeição solta; o painel do curso não fecha ao salvar aula.
- **Como testar:** lint; build; manual (seção 7).
- **Migração:** não.
- **Produção:** push.

#### T20 — Remover matrícula com certificado emitido

- **Ref.:** FR-07.
- **Problema:** `removerMatricula` (`TreinamentosEadTab.jsx:491-495`) só pergunta "Remover esta matrícula?". A
  matrícula some do portal e da tela, mas o certificado continua válido na consulta pública e o botão "Revogar" só
  existe dentro da trilha (`MatriculaAuditoriaSheet.jsx:323-327`).
- **O que fazer:** bloquear a remoção de matrícula com certificado não revogado (mensagem: revogue antes); confirmação
  que diz o que acontece com progresso e tentativas. Regra `podeRemoverMatricula(matricula, certificado)` em lib com
  teste.
- **Aceite:** teste da regra; não há mais certificado válido "órfão".
- **Como testar:** Vitest; lint; build.
- **Migração:** não.
- **Produção:** push.

#### T21 — Tutor e dúvidas

- **Ref.:** FR-11, FA-11, M8 (tutor); Anexo II 4.5.
- **Problema:** nenhum curso tem `tutor_telefone`, então ninguém é avisado de dúvida (`index.ts:1285-1295`). O campo
  aceita qualquer texto (`TreinamentosEadTab.jsx:950-955`). Dúvidas só aparecem dentro da aba; o cartão não filtra nem
  permite editar resposta (`DuvidasTutorCard.jsx:99-105`). O aluno só vê a resposta ao recarregar e sem a aula
  (`DuvidasPortal.jsx:26`, `:41-56`). O WhatsApp ao tutor não tem link direto (`index.ts:1290`).
- **O que fazer:** validar e normalizar o telefone do tutor (mesma regra de `normalizarTelefoneBR` do servidor,
  `supabase/functions/_shared/whatsapp-envio.ts:22`, copiada em lib com teste); colunas `tutor_nome` e `tutor_atendimento` (horário e prazo de resposta) no curso e no portal; contador de
  dúvidas sem resposta no gatilho da aba "Treinamentos" (`pages/SegurancaTrabalho.jsx:1123-1125`, `:1157-1159`);
  filtros por curso e aluno; editar resposta; no portal, aula de cada dúvida e botão "Atualizar"; link
  `https://www.sigoobras.com.br/SegurancaTrabalho` no WhatsApp ao tutor.
- **Aceite:** teste do telefone; tutor avisado quando há telefone válido; aluno vê a resposta sem sair do curso.
- **Como testar:** Vitest; `node --test` se mexer em regra do servidor; lint; build; manual (seção 7).
- **Migração:** sim (`tutor_nome`, `tutor_atendimento`).
- **Produção:** migração → deploy de `portal-funcionario` → push.
- **Cuidados:** quem é o tutor de cada curso é a decisão D4. Não gravar telefone em código ou teste (use número fictício).

#### T22 — Matrículas na tela do RH

- **Ref.:** FR-06.
- **Problema:** a tabela (`TreinamentosEadTab.jsx:684-774`) não tem busca, filtro, ordenação, progresso, nota nem
  exportação. Só há matrícula individual por nome (a spec `docs/superpowers/specs/2026-09-23-rh-contratacao-ia-design.md:113`
  previa "por função"). Não há "renovar". Ex-funcionário aparece como "—" (`:141`, `:713`). O aviso por WhatsApp copia
  para a área de transferência a mensagem com a senha provisória (`:481`).
- **O que fazer:** busca e filtros (curso, status, vencimento); colunas de progresso (aulas x/y, nota, tentativas),
  carregando progresso e tentativas da empresa (`includeDeleted`); exportar CSV; matricular por função; botão "Renovar"
  em concluída ou a vencer; nome do ex-funcionário com "(inativo)"; copiar a mensagem só quando não houver envio
  automático, e mostrar a senha provisória uma única vez num `Dialog`. Também: sugerir a matrícula por função na
  admissão ou troca de função (NR-1 1.4.4 e 1.7.1.2.1); prazo limite por matrícula (data da matrícula +
  `prazo_conclusao_dias` do curso, quando a T25 existir) e aviso em lote aos atrasados. Montagem de linhas e CSV em lib
  com teste.
- **Aceite:** testes da lib; tabela utilizável com centenas de linhas.
- **Como testar:** Vitest; lint; build.
- **Migração:** não.
- **Produção:** push.

#### T23 — Tipo de treinamento (inicial, periódico, eventual) e pré-requisito

- **Ref.:** NR-1 1.7.1.2 a 1.7.1.2.3.1; NR-10 (Complementar SEP exige o Básico).
- **Problema:** a matrícula não tem tipo nem motivo; não há pré-requisito: a matrícula aceita o SEP sem o Básico
  (`TreinamentosEadTab.jsx:444-470`).
- **O que fazer:** migração com `treinamento_matricula.tipo text not null default 'inicial'` (`check` inicial,
  periodico, eventual), `motivo_eventual text`, e `treinamento_curso.pre_requisito_curso_id uuid` (FK para
  `treinamento_curso`, `on delete set null`, com trigger `referencias_da_empresa` novo em `treinamento_curso`).
  Matricular escolhe o tipo (eventual exige motivo) e avisa/bloqueia sem o pré-requisito concluído e válido; servidor
  recusa emitir sem o pré-requisito (409 `PRE_REQUISITO`); certificado e validação mostram o tipo e o motivo.
- **Aceite:** testes da regra de pré-requisito (front e servidor); o trigger da `0130` continua aceitando o INSERT
  com `tipo`/`motivo` (ele só zera andamento e conclusão).
- **Como testar:** Vitest; `node --test`; lint; build.
- **Migração:** sim.
- **Produção:** migração → deploy de `portal-funcionario` e `validar-certificado` → push.

#### T24 — Vencimentos, relatórios e alertas

- **Ref.:** FR-08; NR-1 1.7.1.2.2.
- **Problema:** `proxima_renovacao` só é exibida. O alerta diário `alertar_treinamentos()` (`0039:86-115`, agendado em
  `0039:206-207`) lê a tabela antiga `treinamento`, não o EAD. O RH não sabe quando um aluno esgota as tentativas.
- **O que fazer:** painel "Vencimentos" na aba (vencidos, a vencer em 30/60/90 dias, sem matrícula de renovação);
  migração com `public.alertar_treinamentos_ead()` (`security definer`, `set search_path = public`, `revoke` de
  `public, anon, authenticated`, mesmo padrão de notificação de `0039`) e `cron.schedule` próprio (com `unschedule`
  idempotente antes); aviso ao RH quando o aluno esgota as tentativas (verifique antes se o servidor pode chamar
  `notificar_gestores`, ver grants na `0110`); no painel, alerta "atividade sem treinamento" para funcionário ativo
  sem matrícula válida nos cursos da sua função (NR-1 1.7.1.2.1).
- **Aceite:** teste da seleção de vencimentos (lib); a função SQL só lê o EAD e não duplica aviso no mesmo dia.
- **Como testar:** Vitest; revisão do SQL; o Javerson roda a função à mão uma vez depois de aplicar.
- **Migração:** sim.
- **Produção:** migração → push.
- **Cuidados:** não altere `alertar_treinamentos()` existente. Cursos sem `validade_meses` (NR-1, NR-6) não vencem:
  decisão D12.

#### T25 — Projeto pedagógico estruturado e revisão a cada 2 anos

- **Ref.:** Anexo II 3.1 (a a o) e 3.3.
- **Problema:** só existe o campo de PDF `projeto_pedagogico_ref` (`0103:164`; `TreinamentosEadTab.jsx:970-1005`), vazio
  nos 16 cursos. Dos 15 itens obrigatórios, só RT, instrutor, carga, material e avaliação têm campo. Não há data de
  validação nem alerta de revisão.
- **O que fazer:** migração com colunas no curso: `objetivo_geral`, `principios_sst`, `estrategia_pedagogica`,
  `infraestrutura_apoio`, `publico_alvo`, `instrumentos_aprendizagem` (text), `dedicacao_diaria_min`,
  `prazo_conclusao_dias` (integer), `modulos_objetivos jsonb` (objetivo por módulo), `projeto_validado_em date`,
  `projeto_validado_por text`, `proxima_revisao date`. Seção "Projeto pedagógico (Anexo II 3.1)" no curso mostrando os
  15 itens (os que já existem vêm dos campos atuais); botão "Gerar PDF do projeto" (jsPDF) que grava em
  `projeto_pedagogico_ref` (bucket `treinamentos`); requisito de publicação (aviso; vira bloqueio após D5); prazo de
  conclusão mostrado ao aluno e ao RH; revisão vencida no painel da T24.
- **Aceite:** teste da montagem dos 15 itens (lib); PDF gerado e aberto pelo aluno.
- **Como testar:** Vitest; lint; build; manual (seção 7).
- **Migração:** sim.
- **Produção:** migração → push.
- **Cuidados:** o texto do projeto é do RT (D5); o código só estrutura.

#### T26 — Testes no CI

- **Ref.:** M10.
- **Problema:** `.github/workflows/ci.yml` não roda Vitest nem `node --test`.
- **O que fazer:** job `test` (Node 24, `npm ci`, `npm test --workspace=apps/web`,
  `node --test "supabase/functions/**/*.test.ts"`) incluído no `needs` do `ci-success`. Só o `needs` não basta: o
  `ci-success` roda com `if: always()` e o passo "Check all jobs" confere só `lint`, `build-web`, `test-sdk` e
  `check-migrations` (`.github/workflows/ci.yml:149-164`). Acrescente `[ "${{ needs.test.result }}" != "success" ]` à
  condição desse passo (`ci.yml:157-160`).
- **Aceite:** com os testes passando, o CI fica verde com os dois corredores de teste; com um teste quebrado de
  propósito (num PR de teste aberto pelo Javerson), o "CI Success" fica vermelho.
- **Como testar:** rodar os dois comandos localmente; revisar o YAML.
- **Migração:** não.
- **Produção:** nenhuma (vale a partir do merge em `master`; não publica o site).
- **Cuidados:** pode ser feita a qualquer momento (quanto antes, melhor). Não mexa nos outros jobs.

#### T27 — Login e senha no portal

- **Ref.:** FA-09, M7 (parte).
- **Problema:** o campo "Usuário" tem `inputMode="numeric"` (`LoginPortal.jsx:87`), mas o RH pode criar usuário com
  letras para quem não tem CPF (`AcessoPortalCard.jsx:137-148`): no celular não dá para digitar. A troca de senha só
  diz "mínimo 6 caracteres" (`LoginPortal.jsx:170`), mas o servidor recusa CPF e senhas fáceis
  (`_shared/portal-funcionario.ts:39-47`). Na troca voluntária, o botão não exige a senha atual (`:186`). A
  reconfirmação de senha no certificado (`index.ts:1078`) e a troca com senha atual (`:444`) não têm limite de erros.
- **O que fazer:** `inputMode="text"` com dica "CPF ou usuário"; regras da senha visíveis antes de enviar (cópia da
  regra em `apps/web/src/lib/portal-senha.js`, com teste e comentário apontando a regra do servidor); senha atual
  obrigatória na troca voluntária; limite de erros (`consumirTentativa`, escopo próprio, por funcionário) nas duas
  reconfirmações, com 429.
- **Aceite:** testes da regra (front) e do limite (servidor, função pura); usuário com letras entra pelo celular.
- **Como testar:** Vitest; `node --test`; lint; build.
- **Migração:** não.
- **Produção:** deploy de `portal-funcionario`; push.
- **Cuidados:** não mude o mínimo de 6 caracteres sem OK do Javerson.

#### T28 — "Ver como aluno" para o responsável técnico revisar

- **Ref.:** FR-02 (parte).
- **Problema:** para revisar vídeos, questões e gabarito como o aluno vê, o RT teria de matricular alguém de verdade,
  gerando trilha, tentativas e certificado reais.
- **O que fazer:** botão "Ver como aluno" no editor do curso, abrindo `CursoPortal`/`AvaliacaoPortal` em modo prévia:
  dados montados na tela do RH (URLs com `resolveStorageUrl`), todas as aulas liberadas, nenhuma chamada ao portal,
  nenhum evento, gabarito e comentário visíveis para o RT. Os componentes passam a aceitar uma API injetada. Montagem do
  "item" de prévia em lib com teste.
- **Aceite:** prévia não grava nada (nenhuma chamada a `portalFuncionario`); teste da montagem.
- **Como testar:** Vitest; lint; build; manual pelo Javerson num curso existente.
- **Migração:** não.
- **Produção:** push.

#### T29 — Assinaturas de instrutor e responsável técnico no certificado

- **Ref.:** NR-1 1.7.1.1 (assinatura do RT); levantamento de dados §5.
- **Problema:** o certificado imprime só nome e registro do RT e do instrutor (`certificado-ead.js:143-181`). As
  assinaturas do catálogo antigo (Configurações) apontam todas para `base44.app` e estão mortas. O curso EAD não tem
  coluna de assinatura (`0103:162-171`).
- **O que fazer (depois da decisão D7):** migração com `instrutor_assinatura_ref` e `responsavel_tecnico_assinatura_ref`
  no curso (bucket `assinaturas`); upload da imagem na tela do curso; congelar as referências em `dados` na emissão
  (entram no hash); `dados` do portal devolve URLs assinadas; o PDF desenha as imagens sobre as linhas.
- **Aceite:** certificado com as duas assinaturas; referência `base44` ignorada.
- **Como testar:** lint; build; `node --test` se houver regra nova; manual (seção 7).
- **Migração:** sim.
- **Produção:** migração → deploy de `portal-funcionario` → push.
- **Cuidados:** se a decisão for ICP-Brasil, esta tarefa muda de forma; não implemente sem a D7.

### Prioridade Baixa

Por que estas ficaram em Baixa (os levantamentos tratavam algumas como Média):

- **T33 (M2):** gabarito, revogação e tentativas extras continuam graváveis pela API por qualquer usuário logado da
  própria empresa. O conserto exige desenho e decisão antes de código. O spec da T33 (sem código) pode ser escrito a
  qualquer momento, inclusive junto com as tarefas Médias; a implementação espera o OK do Javerson.
- **T31 (M6):** o `logout` que revoga a sessão foi para a T5; o resto da T31 é reforço de algo que já funciona.
- **T38 (M9):** só afeta quem trabalha em duas empresas clientes, e depende da decisão D16.
- **T30 (FR-09):** conforto do RH na edição de aulas; não afeta o aluno nem o certificado.
- **Limites aceitos, sem tarefa:**
  - B2: o limite de tentativas de login por CPF pode ser consumido por quem sabe o CPF, e o dono fica bloqueado
    enquanto o ataque durar (troca consciente: protege a senha contra força bruta);
  - B11: senha com mínimo de 6 caracteres e lista curta de senhas fracas (a T27 só mostra a regra; mudar o mínimo é
    decisão do Javerson);
  - A5: o tempo de vídeo creditado é um teto (o servidor não prova que o vídeo tocou), o que é inerente a vídeo
    hospedado sem sinal assinado pelo player; os excessos ficam registrados na trilha.

#### T30 — Edição de aulas

- **Ref.:** FR-09, FR-02 (parte). **Problema:** só se edita título, módulo e tempo (`TreinamentosEadTab.jsx:376-395`);
  trocar o arquivo exige remover e recriar (a aula vai para o fim); `removerAula` (`:397-401`) não avisa quantas
  matrículas têm progresso; upload de até 1 GB sem validação de tipo (`:262-274`), sem barra de progresso e sem
  "Cancelar"; linha da aula sem `truncate` em 360 px (`:1043-1124`). Mudar gabarito, nota mínima ou aulas de curso
  publicado com matrículas em andamento não mostra aviso.
- **O que fazer:** "trocar arquivo" mantendo a posição (nova ref + nova duração); aviso de progresso existente antes de
  remover; validar tipo (`video/mp4`, `video/webm`, `application/pdf`) e tamanho antes de subir; barra de progresso e
  botão "Cancelar" no upload; aviso com o número de matrículas em andamento antes de salvar mudança de gabarito, nota
  mínima ou aulas de curso publicado; layout estreito com menu de ações. **Aceite / testar:** lint; build; manual.
  **Migração:** não. **Produção:** push.

#### T31 — Endurecimento do `portal-funcionario`

- **Ref.:** M7 (volume), B5, B9, B12 (o M6, `logout`, foi para a T5).
- **O que fazer:** limite de volume para `evento` e `progresso` por funcionário (`consumirTentativa`); remover a ação
  legada `link` (`index.ts:295-318`; nenhuma tela chama, confirme com `grep`); `dados` devolve a matrícula com lista
  fixa de colunas (`:519-524`, `:672`); trava otimista em `ultimo_sinal_em` (`:804-815`: atualizar só se o valor lido
  não mudou).
- **Aceite / testar:** `node --test` das regras; o portal segue funcionando no roteiro da seção 7. **Migração:** não.
  **Produção:** deploy de `portal-funcionario`.

#### T32 — Endurecimento do banco do EAD

- **Ref.:** B4, B6, B8.
- **O que fazer:** migração com `CHECK` (`nota_minima` 0–100, `max_tentativas >= 0`, `intervalo_tentativa_min >= 0`,
  `carga_horaria_horas > 0`, `validade_meses >= 0`, `duracao_seg >= 0`, `correta` dentro de `opcoes`), criados
  `not valid` e validados em seguida; índice único parcial de matrícula viva (`funcionario_id, curso_id` onde
  `deleted_at is null and status <> 'concluido'`); `revoke all ... from anon` nas tabelas do EAD e em `entrega_ciencia`;
  default de `treinamento_curso.ativo` para `false`. Em `supabase/config.toml`, declarar `verify_jwt` de
  `portal-funcionario` (false), `funcionario-acesso` (false) e `validar-certificado` (true).
- **Aceite / testar:** revisão do SQL; o Javerson confere antes que os dados atuais passam nos `CHECK`.
  **Migração:** sim. **Produção:** migração (depois de o Javerson conferir os `CHECK`); sem deploy. **Cuidados:** não
  crie único em `(curso_id, ordem)`: a troca de ordem passa por estado repetido.

#### T33 — Permissão própria do EAD e autorização no servidor (desenho primeiro)

- **Ref.:** FR-12, M2. **Problema:** uma só permissão ("Segurança do Trabalho / Funcionários") libera tudo no EAD, e a
  RLS só confere `empresa_id`: qualquer usuário da empresa altera gabarito, aulas e matrículas pela API.
- **O que fazer:** escrever um spec curto em `docs/superpowers/specs/` com a proposta (aba "Treinamentos EAD" em
  `ESTRUTURA_PERMISSOES`, `components/shared/PermissoesGranularesEditor.jsx:84-97`; e como o banco confere a permissão:
  função SQL que lê `usuario_empresa.permissoes` ou escrita só por RPC/Edge Function) e esperar o OK do Javerson antes
  de implementar. **Aceite:** spec em `docs/superpowers/specs/` com OK do Javerson; nenhum código. **Migração:** sim,
  depois do desenho. **Produção:** nenhuma nesta etapa.

#### T34 — Dossiê de fiscalização e certificado nos documentos do funcionário

- **Ref.:** NR-1 1.6.5, 1.7.4; Anexo II 4.1.
- **O que fazer:** botão "Exportar dossiê" por curso (ZIP com `jszip`, já é dependência): projeto pedagógico, matrículas,
  trilha de todas as matrículas (CSV), tentativas com respostas (CSV) e certificados (PDF). Na Ficha do funcionário
  (`FichaFuncionarioSheet.jsx:405-435`), baixar o certificado de cada curso EAD.
- **Aceite / testar:** lib de montagem com teste; lint; build. **Migração:** não. **Produção:** push.

#### T35 — Declaração de ambiente e horário

- **Ref.:** Anexo II 4.3 e 4.4; NR-1 1.7.2.
- **O que fazer:** na 1ª abertura do curso em cada dia, orientação + declaração do aluno (local adequado, horário
  reservado ao treinamento, sem outra atividade), gravada por ação nova do servidor como evento de servidor com a versão
  do texto; relatório para o RH com a janela de atividade por aluno e dia (primeiro e último evento de servidor).
- **Aceite / testar:** `node --test`; Vitest; lint; build. **Migração:** não. **Produção:** deploy de
  `portal-funcionario` → push.

#### T36 — Acabamento do portal e da validação

- **Ref.:** FA-12, FA-13, FP-02. Histórico de ciências confirmadas no portal (`PortalFuncionario.jsx:157`, `:198-238`);
  tirar emojis de textos de interface (`PortalFuncionario.jsx:202`, `CursoPortal.jsx:107-109`, `:401`,
  `AvaliacaoPortal.jsx:100`, `:121`, `CertificadoPortal.jsx:79`); na validação, logo, "imprimir", máscara do código e
  "consultar outro". **Aceite:** nenhum emoji nos trechos citados (`grep`); a validação tem logo, "imprimir", máscara
  do código e "consultar outro"; lint; build. **Migração:** não. **Produção:** push.

#### T37 — Acabamento da tela do RH

- **Ref.:** FR-13, FR-14. `Dialog` no lugar de `prompt`/`confirm` (`TreinamentosEadTab.jsx:398`, `:1366`;
  `AcessoPortalCard.jsx:70`, `:84`); `title`/`aria-label` nos botões de ícone (`TreinamentosEadTab.jsx:1121`,
  `:1364-1372`); `funcionario-acesso` devolve `codigo: "JA_TEM_ACESSO"` e `avisarNoPortal` deixa de ler o texto do erro
  (`lib/portal-funcionario-acesso.js:46`); texto na tela explicando a diferença entre o EAD e o catálogo antigo de
  treinamentos por função. **Aceite:** nenhum `prompt`/`confirm` em `TreinamentosEadTab.jsx` e `AcessoPortalCard.jsx`
  (`grep`); botões de ícone com `aria-label`; `avisarNoPortal` testa `codigo === "JA_TEM_ACESSO"`; lint; build.
  **Migração:** não. **Produção:** deploy de `funcionario-acesso`; push.

#### T38 — Acesso ao portal em mais de uma empresa (desenho primeiro)

- **Ref.:** M9. O usuário (CPF) é único no sistema inteiro (`0103:31-32`): quem trabalha em duas empresas clientes não
  tem o 2º acesso, e o 409 "usuário já está em uso" (`funcionario-acesso/index.ts:171-173`) revela o CPF em outro
  inquilino. Escrever spec com opções (usuário por empresa + escolha da empresa no login, ou login único com várias
  empresas) e esperar a decisão D16. **Aceite:** spec em `docs/superpowers/specs/` com OK do Javerson; nenhum código.
  **Migração:** sim, depois do desenho. **Produção:** nenhuma nesta etapa.
- **Implementação (07/10/2026):** spec `docs/superpowers/specs/2026-10-07-portal-varias-empresas-design.md` aprovado
  com todas as recomendações da §11 (P1 a P12). Credencial da pessoa e vínculo por empresa (`0145`), regras em
  `_shared/portal-credencial.ts`, login com escolha da empresa e ativação pela provisória, troca de empresa, defesas
  da §4.3, scripts do operador em `tools/portal-credencial-*.sql` e smoke `tools/smoke-portal-credencial.sql`.
  **Produção:** `tools/portal-credencial-conferir.sql` (só leitura), `0145`, deploy de `portal-funcionario` e
  `funcionario-acesso` logo em seguida, push no mesmo dia; `0146` dias depois, conferido o uso.

---

## 6. Decisões do Javerson e do responsável técnico (não são tarefas de código)

| #   | Decisão                                            | O que o código já suporta                                                                                                                                           | O que falta decidir                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Carga horária × conteúdo                           | Campo de carga; trilha com tempo real por aula; T9 mede o conteúdo e bloqueia carga sem lastro; T12 separa teoria e prática                                         | Por curso: produzir conteúdo até a carga, reduzir a carga EAD e completar com prática presencial, ou virar "apoio". Hoje: NR-10 40 h para ~2 h; NR-1 e NR-6 4 h para ~17 min; reciclagens 8 h para ~2 h ou ~46 min. NR-6: onde fica a demonstração prática do uso do EPI (6.7.2.1)          |
| D2  | Publicação dos cursos                              | Chave "Publicado"; após T9, requisitos e rascunho por padrão; T28 permite revisar sem matrícula                                                                     | Despublicar os 8 cursos da Sinergia até as tarefas Altas e as decisões? Quem revisa e libera cada curso (RT)? Quando publicar os da Eletro?                                                                                                                                                 |
| D3  | NR-35 só presencial (35.4.5, desde 16/07/2026)     | Após T8, modalidade "apoio" sem certificado; após T12, registro da sessão presencial                                                                                | Manter "NR-35 (apoio)" e "NR-35 Reciclagem (8h)" como apoio ou remover; registrar o treinamento presencial no SIGO (T12)? Conferir no DOU o art. 8º da Portaria 1.259/2026 (prazo de 1 ano)                                                                                                 |
| D4  | Tutor por curso                                    | `tutor_telefone` existe (0 de 16 preenchidos); T21 acrescenta nome, horário e prazo                                                                                 | Quem é o tutor de cada curso, telefone, horário de atendimento e prazo de resposta; se tutor vira requisito para publicar                                                                                                                                                                   |
| D5  | Projeto pedagógico                                 | Campo de PDF; após T25, 15 itens estruturados e PDF gerado                                                                                                          | Texto do projeto de cada curso (objetivo, público, estratégia, prazo, dedicação diária...), quem valida e a data de revisão (gatilhos: NR-35 mudou em 16/07/2026; NR-10 muda em 01/06/2027)                                                                                                 |
| D6  | Instrutores                                        | `instrutor_nome` e qualificação por curso (falta nos 2 NR-1)                                                                                                        | Instrutor do NR-1 nas duas empresas; comprovação de proficiência (NR-35 35.4.3; NR-10)                                                                                                                                                                                                      |
| D7  | Assinaturas e ICP-Brasil                           | Nome e registro impressos; assinatura do aluno por senha (eletrônica simples); T29 prevê imagem                                                                     | Re-anexar as assinaturas de instrutor e RT (as 179 do catálogo antigo apontam para `base44` e estão mortas); usar imagem autorizada ou assinatura ICP-Brasil (NR-1 1.6.2)                                                                                                                   |
| D8  | Versão Eletro do material                          | Os cursos da Eletro foram copiados do material da Sinergia (`tools/ead-sync-cursos.py --copiar-de sinergia`); as apostilas vieram de arquivos `GUIA_*_RASCUNHO.pdf` | Conferir se vídeos e apostilas citam a outra empresa ou outro instrutor; Eletro usa o mesmo material ou ganha versão própria; apostilas são a versão final?                                                                                                                                 |
| D9  | NR-10                                              | Após T12, semipresencial com prática; após T23, pré-requisito                                                                                                       | Carga teórica e prática, local e instrutor da prática; matriz tópico do Anexo III × aula; reciclagem de 8 h passa a 16 h em 01/06/2027 (10.9.10) e conteúdo novo até lá                                                                                                                     |
| D10 | Prova                                              | Nota mínima, tentativas e intervalo por curso; T9 e T16                                                                                                             | Mínimo de questões para publicar (padrão proposto: 5); tempo mínimo de prova; mostrar só "satisfatório/insatisfatório" ao reprovado; pedir senha ao iniciar; revisão das 164 questões pelo RT (situações práticas, 4.6.3); imprimir o conceito "satisfatório" no certificado (Anexo II 4.6) |
| D11 | Retenção da trilha                                 | Nada é apagado automaticamente; T17 trava a trilha                                                                                                                  | Política escrita (Anexo II 4.7.1: 2 anos após o fim da validade); quando anonimizar IP e dispositivo                                                                                                                                                                                        |
| D12 | Validade de NR-1 e NR-6                            | `validade_meses` vazio nesses cursos (sem renovação)                                                                                                                | Definir a validade/periodicidade ou manter sem vencimento                                                                                                                                                                                                                                   |
| D13 | Lista de presença                                  | Hoje 10 h/dia fixas, texto "EAD" (T1 conserta a quebra; T12 transforma em ficha da sessão)                                                                          | Modelo oficial da lista da sessão prática                                                                                                                                                                                                                                                   |
| D14 | Conteúdo para terceiros                            | Hoje o conteúdo é de uso próprio                                                                                                                                    | Se o SIGO vender cursos, vira "instituição especializada" (Anexo II 2.1.1, 2.2, 4.1.1): contrato, termo de uso, entrega do projeto                                                                                                                                                          |
| D15 | Agente                                             | —                                                                                                                                                                   | Rodapé de co-autoria dos commits do Codex; se o agente terá CLI do Supabase (hoje: não roda nada em produção)                                                                                                                                                                               |
| D16 | Acesso em mais de uma empresa                      | Um login (CPF e senha) em todas as empresas, com escolha da empresa ao entrar; provisória por empresa (T38, `0145`/`0146`)                                          | Decidida em 06/10 e spec aprovado em 07/10 (P1 a P12 com as recomendações). Fica para depois: "Esqueci a senha" pelo WhatsApp (fase 2, P4) e o aviso ao operador por WhatsApp (P9)                                                                                                          |
| D17 | Aproveitamento e convalidação (NR-1 1.7.6 a 1.7.8) | Nada                                                                                                                                                                | Só se a empresa for aproveitar conteúdo ou aceitar treinamento de outra organização                                                                                                                                                                                                         |

---

## 7. Roteiro de teste ponta a ponta

Executado pelo Javerson (ou com ele) **depois das tarefas Altas em produção**, em `https://www.sigoobras.com.br`.
Tudo o que for criado leva "TESTE EAD" no nome e é apagado no fim. **Só começar com o OK explícito do Javerson.**

**Preparação**

1. Escolher a empresa de teste (uma das que já têm EAD) e anotar, fora do repositório, os IDs criados abaixo.
2. Criar o funcionário "TESTE EAD — apagar" (sem CPF, função qualquer, sem telefone real).
3. Criar o curso "TESTE EAD — apagar" (modalidade EAD, carga 1 h, validade 24 meses, nota 70, 3 tentativas, intervalo
   2 min, instrutor e RT preenchidos, tutor com o telefone do próprio Javerson) com: 1 apostila PDF de 1 página com
   tempo previsto de 60 min (a regra de lastro da T9 exige conteúdo de pelo menos 1 h para carga de 1 h); 1 vídeo curto
   (até 1 min; conferir que a duração foi gravada no cadastro); 1 aula de texto com 1 min; 5 questões. Conferir o
   painel de requisitos (T9) e publicar. Reserve cerca de 1h30 para o roteiro inteiro.
4. Usar "Ver como aluno" (se a T28 já existir) para revisar.

**Fluxo do aluno** (computador e celular)

5. Na Ficha do funcionário de teste → Acesso ao Portal, criar o acesso com um usuário manual com letras (testa a T27)
   e anotar a senha provisória, que aparece uma vez só (o funcionário de teste não tem CPF, então o botão de WhatsApp
   não consegue criar o acesso). Depois, na aba Treinamentos, matricular o funcionário e usar o botão de WhatsApp só
   para conferir a mensagem: ela sai sem senha, porque o acesso já existe.
6. Login com a senha provisória; trocar a senha (testar senha igual ao usuário e "123456": devem ser recusadas).
7. Abrir o curso: a 2ª aula está bloqueada. Abrir a apostila no celular e no computador (T11 e seção 9): ela aparece
   na página, desenhada pelo pdf.js; "Marcar como lida" só habilita ao chegar à última página (A5: sem tempo mínimo).
8. Vídeo: tentar 2x (a velocidade volta a 1x, T13); assistir até o fim e ver a aula concluir.
9. Texto: concluir.
10. Mandar uma dúvida; responder pelo RH; ver a resposta no portal (T21) e o aviso no WhatsApp do tutor.
11. Prova: errar de propósito (reprovado, sem gabarito, sem acertos/total se a T16 estiver feita); esperar o intervalo
    e ver o botão reabilitar sozinho (T14); esgotar as tentativas; liberar uma tentativa extra pelo RH (fica na
    trilha com o autor, T18); passar.
12. Certificado: assinar com a senha (testar senha errada antes); baixar o PDF (com logo, local, modalidade e data
    correta, T8/T15); ler o QR no celular e ver "Autêntico e válido" (T10).
13. Na tela do RH: abrir a trilha (todos os eventos com rótulo; tentativas com respostas); exportar CSV; gerar a Lista de
    Presença (T1).
14. Revogar o certificado com motivo; a validação pública mostra "Revogado".
15. Desativar o funcionário de teste: a próxima ação no portal volta ao login com "Cadastro inativo" (T5).

**Limpeza** (Javerson, no SQL do Supabase, com os IDs anotados):

```sql
begin;
set local sigo.permitir_expurgo = 'on'; -- só tem efeito depois da T17
-- conferir que os dois registros são mesmo os de teste antes de apagar
select id, nome_completo from public.funcionario where id = '<funcionario_teste>';
select id, nome from public.treinamento_curso where id = '<curso_teste>';
-- apagar o funcionário leva em cascata acesso, matrícula, progresso, tentativas, eventos, dúvidas e certificado
delete from public.funcionario where id = '<funcionario_teste>' and nome_completo like 'TESTE EAD%';
-- apagar o curso leva aulas e questões
delete from public.treinamento_curso where id = '<curso_teste>' and nome like 'TESTE EAD%';
commit;
```

Depois, apagar no Storage (bucket `treinamentos`) os arquivos enviados para o curso de teste e conferir que o código
do certificado de teste não valida mais. O funcionário de teste pode gerar alertas de SST enquanto existir: apagar no
mesmo dia.

---

## 8. O que NÃO fazer

- Não rodar nada que fale com produção (regra 1 do `AGENTS.md`): nada com `--linked` ou `--project-ref` (inclusive
  `supabase db query --linked`, `db push`, `functions deploy`), nenhum `npm run supabase:*` nem `npm run sdk:test`,
  nenhum `git push`, `gh pr create`, `gh pr merge`, `gh workflow run` ou `gh release`, nenhum script de `tools/`
  (inclusive `tools/ead-sync-cursos.py`).
- Não trabalhar no checkout principal nem commitar em `master`: branch própria, num clone ou worktree separado.
- Não fazer login no `npm run dev` (usa o banco de produção) nem criar, alterar ou apagar matrícula, curso, aula,
  questão, acesso ou funcionário real. Teste manual é do Javerson (seção 7).
- Não despublicar, reclassificar nem editar cursos por migração ou script: dados de curso mudam pela tela, pelo Javerson.
- Não enfraquecer o que está sólido: conclusão recalculada no servidor, gabarito fora do navegador antes da aprovação,
  triggers `0119`/`0130`, limitador de login, `sessao_versao`, isolamento por empresa.
- Não editar migrações já existentes nem reaproveitar número (`0125`–`0130` estão ocupados).
- Não publicar `validar-certificado` com `--no-verify-jwt`.
- Não gravar URL assinada no banco, nem segredo, UUID de empresa ou dado pessoal no repositório.
- Não misturar tarefas num commit nem mexer em arquivo fora da tarefa.

---

## 9. Atividades interativas: questionário, caso e tarefa (14/10/2026)

- **Spec:** `docs/superpowers/specs/2026-10-14-ead-atividades-interativas-design.md` (decisões A1–A11). **Plano:**
  `docs/superpowers/plans/2026-10-14-ead-atividades-interativas.md`. **Branch:** `feat/ead-atividades-interativas`
  (worktree `C:\Users\javer\sigoobras-wt-ead-interativas`). **Migração:** `0170_ead_atividades_interativas.sql`.
- **Base:** a branch recebeu o `origin/master` de 21/10/2026 (merge `dd5fb7b`). No master as migrações vão até a `0161`
  e a `0170` continua livre (nenhuma outra branch usa esse número). Conferir de novo antes de aplicar, listando a pasta
  `supabase/migrations` do master.
- **Status:** código pronto e verificado na branch (9.7). A produção (9.3) e as cargas (9.4 e 9.5) esperam o OK do
  Javerson, passo a passo.

### 9.1 O que mudou

- A aula ganhou três tipos: **questionário do módulo** (`questionario`), **caso com decisões** (`caso`) e **atividade
  de estudo** (`tarefa`). Cada atividade é uma aula (A6): mesma lista, mesmo cadeado em ordem, mesma conclusão
  (`treinamento_progresso`, gravada só pelo servidor) e o tempo previsto soma na carga (`LASTRO`).
- **Questionário:** questões próprias (`treinamento_questao.aula_id`; vazio = prova final), sorteio de questões e
  alternativas a cada tentativa, tentativas livres e todas gravadas (`treinamento_questionario_tentativa`), correção
  comentada depois de cada envio (aprovado ou não); conclui com a nota mínima dos questionários do curso
  (`treinamento_curso.nota_minima_modulo`, padrão 80). Com 8 questões e 80%, o aluno precisa de 7 acertos.
- **Caso:** roteiro em `treinamento_caso.conteudo` (etapas, opções com comentário, "segura" e "leva para"), validado
  pela mesma regra na tela e no servidor. O aluno só clica: a insegura mostra o comentário e leva à recuperação (ou à
  mesma etapa); no fim, "Para refletir" e "Concluir caso". O estado vem da trilha; roteiro alterado no meio faz o aluno
  recomeçar (evento "Caso recomeçado") quando o caminho que ele já fez deixa de existir no roteiro novo.
- **Tarefa:** instruções e o que produzir; o aluno faz fora da tela e clica "Fiz a atividade" (sem texto do aluno nem
  parecer do tutor, A4).
- **Leituras sem relógio (A5):** texto, PDF (agora pelo pdf.js em todas as telas) e tarefa liberam o botão ao rolar
  até o fim; o 409 `TEMPO_LEITURA` saiu. Vídeo continua com 90%. A aula aberta (e a "Próxima aula") começa no topo da
  tela.
- **Tela do RH:** "Nova aula" com os seis tipos; o texto das aulas de texto e de tarefa passa a ser editado na tela;
  "Questões" no menu de cada questionário; "Editar caso" com o editor (problemas na hora, "Salvar caso" só sem
  problema); campo "Nota mínima dos questionários dos módulos"; "Importar atividades" (9.4 e 9.5), que aceita o
  arquivo do pacote do material e o dos exercícios pós-vídeo (`questionarios_por_video`); a avaliação final lista só
  as questões sem aula; requisitos e "Ver como aluno" com questionário e caso.
- **Remover aula:** em aula de questionário ou de caso, "Remover aula" apaga junto, por exclusão lógica, as questões ou
  o roteiro (a confirmação avisa). As tentativas que alunos já fizeram continuam guardadas na trilha.
- **Detalhes da matrícula e dossiê:** seção "Questionários dos módulos" (cada tentativa abre como a prova); trilha com
  os eventos novos ("Escolha no caso", "Confirmou a atividade de estudo", "Leu até o fim"...); dossiê com
  `questionarios.csv` nos cursos com questionário.
- **Certificado (A9):** nos cursos com atividades, a frente ganha a frase das atividades (quantidades congeladas); o
  verso não muda. Cursos sem atividades emitem exatamente como antes.
- **Não rodar** `tools/ead-sync-cursos.py` nos cursos com atividades: ele não conhece os tipos novos e apaga as aulas.
- As seções 2 e 3 deste documento descrevem o estado de 30/09/2026 (apostila e texto "contam tempo de leitura", "leitura
  mínima"): onde divergirem, vale esta seção 9 (A5).

**Onde está no código**

- Banco: `supabase/migrations/0170_ead_atividades_interativas.sql` (colunas, tabelas `treinamento_caso` e
  `treinamento_questionario_tentativa`, RPC `importar_atividades_ead`) e o smoke `tools/smoke-ead-atividades.sql`.
- Servidor, em `supabase/functions/portal-funcionario/`: `caso.ts` (regra pura do roteiro: validar, refazer o caminho,
  resultado da escolha; cópia conferida de `lib/ead-caso.js`), `caso-aluno.ts` (a orquestração das ações `caso_abrir`,
  `caso_escolher` e `caso_concluir`: lê o roteiro e a trilha e responde sem `segura`, `comentario` nem `proxima` antes
  do clique), `questionario.ts` (as ações `questionario_abrir` e `questionario_enviar`: sorteio, tentativa numerada e
  correção comentada), `regras.ts` (leitura e tarefa sem relógio), `requisitos.ts` (requisitos por tipo), `prova.ts` e
  `conclusao.ts` (a prova final só com as questões sem aula) e `index.ts` (liga as ações; a função interna
  `concluirAula` é a conclusão única das ações novas e do `progresso`).
- Portal do aluno, em `apps/web/src/components/portal-funcionario/`: `QuestionarioPortal.jsx` e `CasoPortal.jsx`
  (novos), `CursoPortal.jsx` (lista de aulas, leitura até o fim, "Próxima aula") e `ApostilaPdf.jsx` (pdf.js em todas as
  telas); a lógica pura está em `apps/web/src/lib/` (`portal-leitura.js`, `portal-questionario.js`, `portal-caso.js`).
- Tela do RH, em `apps/web/src/components/seguranca/`: `TreinamentosEadTab.jsx` (nova aula, nota mínima, remover aula),
  `AulaLinhaEad.jsx` (menu "Questões" e "Editar caso"), `QuestoesEad.jsx`, `CasoEditor.jsx`,
  `ImportarAtividadesDialog.jsx`, `MatriculaAuditoriaSheet.jsx`, `PreviaAlunoCurso.jsx`, `ProvaDaTentativa.jsx` e
  `exportarDossieEad.js`; a lógica pura está em `apps/web/src/lib/` (`ead-caso.js`, `ead-caso-edicao.js`,
  `ead-aula-nova.js`, `ead-atividades-importar.js`, `ead-requisitos.js`, `ead-impacto.js`, `ead-trilha.js`,
  `ead-dossie.js`, `portal-previa.js`, `certificado-ead.js`, `apostila-pdf.js`).

### 9.2 Decisões do Javerson

| #   | Decisão                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Entram as três atividades do pacote, nesta ordem: questionário do módulo, caso com decisões, tarefa de estudo                                                                                                                              |
| A2  | Questionário = estudo guiado: nota ≥ mínima do módulo (80%), tentativas livres e gravadas, correção comentada                                                                                                                              |
| A3  | Caso só por clique; a insegura mostra o comentário e segue o roteiro; no fim, "Para refletir" e "Concluir caso"                                                                                                                            |
| A4  | Tarefa só confirmando ("Fiz a atividade"); sem texto do aluno nem parecer do tutor                                                                                                                                                         |
| A5  | Sem relógio em atividades e leituras (botão ao rolar até o fim); vídeo segue em 90%; o tempo soma na carga                                                                                                                                 |
| A6  | Cada atividade é uma aula do curso                                                                                                                                                                                                         |
| A7  | "Importar atividades" (prévia, tudo ou nada, reimportar não duplica) e criação/edição na tela                                                                                                                                              |
| A8  | Tempos padrão na importação: 15 min por questionário e 10 por caso (as tarefas trazem o seu)                                                                                                                                               |
| A9  | Certificado: frase de resumo na frente nos cursos com atividades; o verso não muda                                                                                                                                                         |
| A10 | Migração 0170; produção na ordem de 9.3, cada passo com OK explícito                                                                                                                                                                       |
| A11 | Exercícios pós-vídeo (14/10, depois da spec): cada um vira um questionário de clique logo depois do vídeo; as alternativas erradas e o comentário são redigidos fora do repositório e revisados pelo Javerson como RT antes da carga (9.5) |

A11 em detalhe: a importação aceita também os **exercícios pós-vídeo** já convertidos em múltipla escolha
(`{ "tipo": "questionarios_por_video", "itens": [{ "video", "questoes" }] }`): cada item vira um questionário logo
depois da aula de vídeo daquele código (código de origem `PV-<vídeo>`, título "Exercícios do vídeo: <título>", 5 min por
padrão), no módulo do vídeo.

### 9.3 Produção (ordem obrigatória; cada passo só com o OK explícito do Javerson)

**Quem roda os comandos de produção é o Javerson, na máquina dele.** O agente que o estiver ajudando só explica cada
passo em linguagem simples (o que será aplicado e o que muda para o aluno e para o RH) e espera o "sim" dele no chat,
para aquele passo; nada com `--linked`, `--project-ref` ou `git push` é rodado por agente (regra 1 do `AGENTS.md`).
Nunca digitar senha nem colar chave.

**Onde rodar cada passo.** O vínculo da CLI com o projeto (a pasta `supabase\.temp`) só existe no **checkout principal**
(`C:\Users\javer\sigoobras-base`), porque o git a ignora: o worktree não tem. Por isso a migração e o smoke (`--linked`)
rodam **a partir do checkout principal**, passando o caminho completo dos arquivos, que estão no worktree
(`C:\Users\javer\sigoobras-wt-ead-interativas`), onde está a branch. O deploy da função (`--project-ref`) roda **no
worktree**, para levar o código da branch: ele leva a pasta `_shared/` inteira como está no disco, então o worktree tem
de estar na branch `feat/ead-atividades-interativas` e com `git status` vazio. O merge e o push (passo 4) rodam no
checkout principal. Se o master andou depois de 21/10/2026, trazer o `origin/master` para a branch de novo e repetir a
verificação (9.7) antes do passo 1.

```powershell
# 1. migração (estrutura, tabelas novas e a RPC importar_atividades_ead; nenhum dado existente muda). Esperado: ok
cd C:\Users\javer\sigoobras-base
npx supabase@2.118.0 db query --linked -f C:\Users\javer\sigoobras-wt-ead-interativas\supabase\migrations\0170_ead_atividades_interativas.sql

# 2. smoke (begin; ... rollback;: desfaz tudo no fim), ainda no checkout principal.
#    Esperado: SMOKE TEST OK: atividades interativas (0170); sem essa linha mas sem erro nenhum, também vale como passou
npx supabase@2.118.0 db query --linked -f C:\Users\javer\sigoobras-wt-ead-interativas\tools\smoke-ead-atividades.sql

# 3. função do portal (questionário, caso, leitura sem relógio, certificado), NO WORKTREE
cd C:\Users\javer\sigoobras-wt-ead-interativas
npx supabase@2.118.0 functions deploy portal-funcionario --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt --use-api

# 4. site: merge da branch em master e push LOGO DEPOIS do passo 3, no checkout principal (o push publica o site).
#    Antes, o git status não pode mostrar alteração em arquivo do projeto. O --no-ff deixa um commit de merge só, fácil de reverter
cd C:\Users\javer\sigoobras-base
git status
git switch master
git pull
git merge --no-ff feat/ead-atividades-interativas
git push origin master
```

**Por que nessa ordem**

- **Migração primeiro.** A função nova e o site novo leem `treinamento_caso`, `treinamento_questionario_tentativa` e a
  coluna `aula_id` das questões. Sem a migração, a ação `dados` do `portal-funcionario` novo responde 503 ("Não foi
  possível carregar seus cursos agora"): nenhum aluno vê os cursos. No site novo, a aba Treinamentos do RH mostra "Erro
  ao carregar treinamentos" e os Detalhes da matrícula, "Erro ao carregar a trilha de auditoria". A 0170 só acrescenta
  (não muda dado existente) e o portal e o site de hoje continuam iguais depois dela: pode ser aplicada sozinha.
- **Smoke logo depois da migração.** O `tools/smoke-ead-atividades.sql` cria e desfaz tudo na mesma execução, com dados
  de mentira numa empresa que já existe (nada fica gravado).
- **Função e push juntos, um logo depois do outro, e o push só depois do deploy.** As leituras sem relógio mudam nos
  dois lados. Site novo com função velha: a leitura trava no 409 `TEMPO_LEITURA` e as telas de questionário e caso
  chamam ações que a função velha não conhece. Função nova com site velho: nada quebra (o site velho continua esperando
  o tempo mínimo de leitura), mas também nada de novo aparece. Por isso o push sai logo depois do deploy, e o deploy só
  depois da 0170. O merge e o push em `master` são do Javerson (regra 3 do `AGENTS.md`).
- **Voltar atrás.** A 0170 pode ficar (só acrescenta). O que se desfaz é o código: reverter o merge no master
  (`git revert -m 1 <commit do merge>` e push, que republica o site antigo) e publicar de novo a função a partir do
  commit anterior, os dois juntos.

**Se aparecer erro**

- **"Cannot find project ref"** (ou parecido) nos passos 1 e 2: o comando foi rodado numa pasta sem o vínculo com o
  projeto (o worktree). Voltar para `C:\Users\javer\sigoobras-base` e rodar de lá, com o caminho completo do arquivo.
- **Erro de tempo de bloqueio (`lock timeout`) na migração:** ela espera no máximo 10 segundos (`lock_timeout`) para
  conseguir trancar as tabelas. Rodar de novo em outro horário, de preferência com pouca gente usando o sistema: a
  migração pode ser repetida sem problema (ela confere o que já existe).
- **Smoke com `FALHOU` ou qualquer erro:** parar e mandar o texto inteiro para quem estiver ajudando. Se a linha
  `SMOKE TEST OK` não aparecer, mas também não houver erro nenhum, vale como passou.

Depois do passo 4 (esperar o workflow `deploy-hostgator.yml` terminar), abrir a aba Treinamentos EAD e o portal do
funcionário de teste: os cursos têm de abrir como antes. Em seguida, **primeiro o roteiro de teste (9.6)**, num curso
"TESTE EAD — apagar"; só depois as cargas nos cursos de verdade: NR-10 Básico (9.4) e exercícios pós-vídeo (9.5).

### 9.4 Carga das atividades do NR-10 Básico (Sinergia e Eletro)

**1. (agente)** Trazer de volta ao PC o zip do pacote final, `NR10_Parte_1_de_6_Curso_e_Documentos.zip`, e extraí-lo numa
pasta própria, fora do repositório (ex.: `C:\Users\javer\NR10-Material-Avaliacao\pacote-final\`). Em 21/10/2026 ele
ainda não estava no PC: só os rascunhos M1–M8, em `C:\Users\javer\NR10-Material-Avaliacao\conteudo`.

**2. (agente)** Conferir o formato de `NR10_Basico_Javerson/data/*.json` contra o leitor (`lerPacoteDeAtividades`):
módulos `{ id, titulo, casos, questoes, estudo }`, casos `{ titulo, contexto, etapas[{ id, pergunta, opcoes[{ texto,
feedback, segura, proxima }] }], reflexao }`, questões `{ enunciado, opcoes, correta, explicacao }` e tarefas
`{ titulo, instrucoes, evidencia, tempoEstimadoMin }`. Se diferir, ajustar o leitor e o teste numa task própria antes
de seguir.

**3. (agente)** Gerar o arquivo de importação e o relatório de revisão, fora do repositório, com o script abaixo
(salvo, por exemplo, em `C:\Users\javer\NR10-Material-Avaliacao\conferir-pacote.mjs`). Ele só lê o pacote e grava o
arquivo de saída; não fala com o banco. O 3º argumento é um checkout do SIGO com esta branch (o worktree, ou o
principal depois do merge).

```js
// Conferência do pacote do NR-10 e geração do arquivo de importação ("Importar atividades").
// Fica FORA do repositório. Só lê o pacote e grava o arquivo de saída: não fala com o banco.
// Uso: node conferir-pacote.mjs "<pasta data do pacote>" "<arquivo de saída .json>" ["<checkout do SIGO>"]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [pasta, saida, repo = "C:/Users/javer/sigoobras-base"] = process.argv.slice(2);
if (!pasta || !saida) {
  console.error('uso: node conferir-pacote.mjs "<pasta data>" "<saida.json>" ["<checkout do SIGO>"]');
  process.exit(2);
}
const { lerPacoteDeAtividades, planejarImportacao, TEMPOS_PADRAO } = await import(
  pathToFileURL(join(repo, "apps/web/src/lib/ead-atividades-importar.js")).href
);

let arquivos;
try {
  arquivos = readdirSync(pasta).filter((f) => f.toLowerCase().endsWith(".json"));
} catch {
  console.error(`Não achei a pasta do pacote: ${pasta}`);
  process.exit(2);
}
arquivos.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
// arquivo com JSON quebrado: para e diz qual é (em vez de uma tela de erro do Node)
const lerArquivo = (f) => {
  try {
    return JSON.parse(readFileSync(join(pasta, f), "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    console.error(`O arquivo ${f} não é um JSON válido: ${e.message}`);
    process.exit(1);
  }
};
// cada arquivo pode ser a lista de módulos, { modulos: [...] } ou um módulo só
const brutos = arquivos
  .flatMap((f) => {
    const j = lerArquivo(f);
    return Array.isArray(j) ? j : Array.isArray(j?.modulos) ? j.modulos : [j];
  })
  .filter((m) => m && typeof m === "object" && m.id);
// só o que a importação usa (objetivos, apostila, pratica... ficam fora)
const modulos = brutos.map(({ id, titulo, casos, questoes, estudo }) => ({
  id,
  titulo,
  casos,
  questoes,
  estudo,
}));

const pacote = lerPacoteDeAtividades(modulos);
if (pacote.erros.length) {
  console.error("O pacote não pode ser lido:\n- " + pacote.erros.join("\n- "));
  process.exit(1);
}
const { itens, porModulo } = planejarImportacao({
  pacote,
  modulosDoCurso: [],
  codigosExistentes: [],
  tempos: TEMPOS_PADRAO,
  escolhaDeModulo: {},
});
const ramificado = (caso) =>
  caso.etapas.some((e) => e.opcoes.some((o) => !o.segura && o.proxima && o.proxima !== e.id));

console.log("Módulo | casos (ramificados) | questões | tarefas | minutos");
let total = { casos: 0, questoes: 0, tarefas: 0, minutos: 0 };
for (const m of pacote.modulos) {
  const r = porModulo.find((p) => p.moduloPacote === m.id);
  const n = m.casos.filter((c) => ramificado(c.conteudo)).length;
  console.log(`${m.id} | ${m.casos.length} (${n}) | ${m.questoes.length} | ${m.tarefas.length} | ${r ? r.minutos : 0}`);
  total = {
    casos: total.casos + m.casos.length,
    questoes: total.questoes + m.questoes.length,
    tarefas: total.tarefas + m.tarefas.length,
    minutos: total.minutos + (r ? r.minutos : 0),
  };
}
console.log(`TOTAL | ${total.casos} | ${total.questoes} | ${total.tarefas} | ${total.minutos}`);
const comProblema = itens.filter((i) => i.problemas.length);
console.log(
  comProblema.length
    ? `\nPROBLEMAS (corrigir no pacote antes de importar):\n${comProblema
        .map((i) => `- ${i.codigo_origem}: ${i.problemas.join("; ")}`)
        .join("\n")}`
    : "\nNenhum problema."
);
writeFileSync(saida, JSON.stringify(modulos, null, 2) + "\n", "utf8");
console.log(`\nArquivo de importação: ${saida}`);
```

```bash
node "C:/Users/javer/NR10-Material-Avaliacao/conferir-pacote.mjs" \
  "C:/Users/javer/NR10-Material-Avaliacao/pacote-final/NR10_Basico_Javerson/data" \
  "C:/Users/javer/NR10-Material-Avaliacao/atividades-nr10-m1-m12.json" \
  "C:/Users/javer/sigoobras-wt-ead-interativas"
```

O script para com uma mensagem clara se a pasta não existir, se algum `.json` estiver quebrado (diz qual) ou se o pacote
não puder ser lido. O relatório (contagens por módulo, quantos casos são ramificados, problemas) vai para o Javerson
aprovar antes do passo 4. Esperado no pacote completo: 36 casos e 96 questões nos 12 módulos, e "Nenhum problema".
Problema apontado = corrigir no pacote (fora do repositório) e rodar de novo.

**4. (Javerson)** Importar pela tela, em cada empresa (Sinergia e Eletro): Treinamentos EAD → curso NR-10 Básico →
seção "Aulas" → "Importar atividades" → o arquivo do passo 3. Se o curso já tiver alunos em andamento, a tela mostra
antes um aviso com quantos são: ler e seguir. Na prévia, conferir que cada módulo M1–M12 entrou no módulo do curso
"casado pelo código" (se algum vier como "Novo módulo", escolher o módulo certo na lista), tempos 15/10 e nenhuma
atividade com problema; então "Confirmar e importar" e anotar o resumo (aulas criadas, questões, puladas). Importar o
mesmo arquivo de novo não duplica: tudo aparece como "já existe — será pulada". O banco aceita no máximo 300 atividades
por importação (o pacote completo tem bem menos).

**5. (Javerson roda, o agente lê o resultado)** Conferência, só leitura, no SQL do Supabase. O bloco abaixo tem 5
consultas; cada uma começa num comentário `-- 1)`, `-- 2)`, ... e termina em `;`. Colar **uma consulta por vez** (do
comentário até o `;`), rodar e copiar o resultado de volta para o chat: o editor do Supabase mostra só o resultado da
última que rodou. As consultas escolhem o curso pelo nome e a empresa pelo nome (a 1ª mostra quais cursos o filtro
pegou: precisam ser os dois NR-10 Básico).

```sql
-- Conferência da carga das atividades do NR-10 Básico. SÓ LEITURA: nenhum insert, update ou delete.
-- Rode uma consulta por vez (o editor do Supabase mostra só o resultado da última).

-- 1) Os cursos que o filtro pegou: precisam ser os dois NR-10 Básico (um da Sinergia, um da Eletro)
select e.nome as empresa, c.nome as curso, c.modalidade, c.carga_horaria_horas, c.carga_teorica_horas,
       c.nota_minima_modulo, c.ativo
from public.treinamento_curso c
join public.empresa e on e.id = c.empresa_id
where c.deleted_at is null
  and c.nome ilike '%NR%10%B_sico%'
  and c.nome not ilike '%recicl%'
  and (e.nome ilike '%sinergia%' or e.nome ilike '%eletro%')
order by e.nome;

-- 2) Aulas por módulo e tipo (minutos = tempo previsto somado)
with alvo as (
  select c.id, e.nome as empresa
  from public.treinamento_curso c
  join public.empresa e on e.id = c.empresa_id
  where c.deleted_at is null
    and c.nome ilike '%NR%10%B_sico%'
    and c.nome not ilike '%recicl%'
    and (e.nome ilike '%sinergia%' or e.nome ilike '%eletro%')
)
select al.empresa, coalesce(a.modulo, '(sem módulo)') as modulo, a.tipo, count(*) as aulas,
       round(sum(coalesce(a.duracao_seg, 0)) / 60.0) as minutos
from alvo al
join public.treinamento_aula a on a.curso_id = al.id and a.deleted_at is null
group by al.empresa, a.modulo, a.tipo
order by al.empresa, min(a.ordem), a.tipo;

-- 3) Questões por questionário (e quantas com problema: sem pergunta, menos de 2 alternativas ou correta fora)
with alvo as (
  select c.id, e.nome as empresa
  from public.treinamento_curso c
  join public.empresa e on e.id = c.empresa_id
  where c.deleted_at is null
    and c.nome ilike '%NR%10%B_sico%'
    and c.nome not ilike '%recicl%'
    and (e.nome ilike '%sinergia%' or e.nome ilike '%eletro%')
)
select al.empresa, a.ordem, a.codigo_origem, a.titulo,
       count(q.id) as questoes,
       count(q.id) filter (
         where coalesce(trim(q.pergunta), '') = ''
            or n.alternativas < 2
            or q.correta < 0
            or q.correta >= n.alternativas
       ) as questoes_com_problema
from alvo al
join public.treinamento_aula a
  on a.curso_id = al.id and a.deleted_at is null and a.tipo = 'questionario'
left join public.treinamento_questao q on q.aula_id = a.id and q.deleted_at is null
left join lateral (
  select case when jsonb_typeof(q.opcoes) = 'array' then jsonb_array_length(q.opcoes) else 0 end
           as alternativas
) n on true
group by al.empresa, a.id, a.ordem, a.codigo_origem, a.titulo
order by al.empresa, a.ordem;

-- 4) Roteiros dos casos: aula sem roteiro, etapas, opções, etapa sem escolha segura e insegura que encerra
--    (a validação completa é a da tela: o painel de requisitos do curso acusa roteiro inválido)
with alvo as (
  select c.id, e.nome as empresa
  from public.treinamento_curso c
  join public.empresa e on e.id = c.empresa_id
  where c.deleted_at is null
    and c.nome ilike '%NR%10%B_sico%'
    and c.nome not ilike '%recicl%'
    and (e.nome ilike '%sinergia%' or e.nome ilike '%eletro%')
)
select al.empresa, a.ordem, a.codigo_origem, a.titulo,
       k.id is not null as tem_roteiro,
       jsonb_array_length(et.lista) as etapas,
       (select count(*)
          from jsonb_array_elements(et.lista) e,
               jsonb_array_elements(coalesce(e -> 'opcoes', '[]'::jsonb)) o) as opcoes,
       (select count(*)
          from jsonb_array_elements(et.lista) e
         where not exists (
           select 1 from jsonb_array_elements(coalesce(e -> 'opcoes', '[]'::jsonb)) o
            where (o ->> 'segura')::boolean is true
         )) as etapas_sem_escolha_segura,
       (select count(*)
          from jsonb_array_elements(et.lista) e,
               jsonb_array_elements(coalesce(e -> 'opcoes', '[]'::jsonb)) o
         where (o ->> 'segura')::boolean is not true
           and jsonb_typeof(o -> 'proxima') is distinct from 'string') as inseguras_que_encerram
from alvo al
join public.treinamento_aula a on a.curso_id = al.id and a.deleted_at is null and a.tipo = 'caso'
left join public.treinamento_caso k on k.aula_id = a.id and k.deleted_at is null
left join lateral (
  select case when jsonb_typeof(k.conteudo -> 'etapas') = 'array' then k.conteudo -> 'etapas'
              else '[]'::jsonb end as lista
) et on true
order by al.empresa, a.ordem;

-- 5) Resumo: conteúdo x carga (LASTRO), atividades, códigos repetidos e questões da prova final
with alvo as (
  select c.id, e.nome as empresa, c.nome,
         case when c.modalidade = 'semipresencial' then c.carga_teorica_horas
              else c.carga_horaria_horas end as carga_a_cobrir
  from public.treinamento_curso c
  join public.empresa e on e.id = c.empresa_id
  where c.deleted_at is null
    and c.nome ilike '%NR%10%B_sico%'
    and c.nome not ilike '%recicl%'
    and (e.nome ilike '%sinergia%' or e.nome ilike '%eletro%')
)
select al.empresa, al.nome, al.carga_a_cobrir,
       round(sum(coalesce(a.duracao_seg, 0)) / 3600.0, 2) as horas_de_conteudo,
       coalesce(al.carga_a_cobrir, 0) > 0
         and sum(coalesce(a.duracao_seg, 0)) >= 3600 * al.carga_a_cobrir as lastro_ok,
       count(*) filter (where a.tipo = 'questionario') as questionarios,
       count(*) filter (where a.tipo = 'caso') as casos,
       count(*) filter (where a.tipo = 'tarefa') as tarefas,
       count(a.codigo_origem) - count(distinct a.codigo_origem) as codigos_repetidos,
       (select count(*) from public.treinamento_questao q
         where q.curso_id = al.id and q.deleted_at is null and q.aula_id is null) as questoes_da_prova_final
from alvo al
join public.treinamento_aula a on a.curso_id = al.id and a.deleted_at is null
group by al.id, al.empresa, al.nome, al.carga_a_cobrir
order by al.empresa;
```

Esperado com o pacote completo: em cada empresa, 12 questionários com 8 questões cada e 0 com problema, 36 casos todos
com roteiro, 0 etapa sem escolha segura e 0 insegura que encerra, as tarefas do pacote, 0 código repetido e as
questões da prova final como antes da carga. `lastro_ok` diz se o conteúdo (aulas e atividades) já cobre a carga; o que
faltar é decisão do Javerson e do RT (D1 e D9 da seção 6).

**6. (Javerson)** Na tela: o painel "Requisitos para publicar e emitir certificado" do curso sem pendência de
conteúdo; "Ver como aluno" num módulo (questionário, caso e tarefa).

### 9.5 Carga dos exercícios pós-vídeo

**1. (agente)** Origem: o zip `Cursos_Sinergia_Conteudo_Plataforma_RECUPERADO_2026-10-02.zip` (em Downloads),
extraído numa pasta própria fora do repositório: `Exercicios_Pos_Video_Rascunho/exercicios_por_video.json` (46 vídeos
× 2 perguntas abertas com a resposta esperada; códigos começando por S = NR-10 SEP, H = NR-35, E = NR-6, G = NR-1) e
`NR10_Basico_Expandido_Rascunho/exercicios_modulos.json` (módulos B01–B15 × 2 perguntas = NR-10 Básico Reciclagem). Ao
todo são 122 perguntas. Ficam de fora os exercícios cujo vídeo não existe mais (os `B02A…` e o piloto).

**2. (agente)** Conversão para múltipla escolha (trabalho de conteúdo, fora do repositório): cada pergunta aberta vira
uma questão em que a resposta esperada é a alternativa certa, mais 3 erradas plausíveis redigidas, e um comentário que
explica a certa. Um arquivo por curso no formato:

```json
{
  "tipo": "questionarios_por_video",
  "itens": [
    {
      "video": "S02A",
      "questoes": [
        {
          "pergunta": "Texto da pergunta?",
          "opcoes": ["Alternativa certa", "Errada 1", "Errada 2", "Errada 3"],
          "correta": 0,
          "comentario": "Por que a certa é a certa."
        }
      ]
    }
  ]
}
```

O código do vídeo precisa aparecer no nome do arquivo do vídeo no curso (ex.: `NR10_S02A_cena.mp4`, `S02A.mp4`, ou
`<uuid>-S02A_...` como a tela grava): "S02A" não casa com "S02AB". Vídeo do YouTube não tem arquivo e não é achado. Nos
módulos B01–B15 da Reciclagem, `video` é o código que está no nome do arquivo do vídeo de cada módulo; se os vídeos
não tiverem B01... no nome, a prévia mostra "vídeo B01 não encontrado neste curso" e o caminho é decidido com o
Javerson antes de importar.

**3. (Javerson, como RT)** Revisão de todas as perguntas, alternativas e comentários antes de importar. Nenhum texto
desse material entra no repositório.

**4. (Javerson)** Importação pela tela, curso a curso, nas duas empresas: NR-10 SEP e Reciclagem, NR-35 e Reciclagem,
NR-6, NR-1 e NR-10 Básico Reciclagem ("Importar atividades" → o arquivo do curso → prévia por vídeo: código, aula
achada, número de questões e problemas → desmarcar o que tiver problema, se o Javerson concordar → "Confirmar e
importar"). Cada questionário entra logo depois da aula de vídeo, no módulo dela, e soma 5 min na carga (editável na
prévia, campo "Tempo de cada questionário pós-vídeo (min)"). Com 2 questões e nota mínima de 80%, o aluno precisa
acertar as 2 (tentativas livres, com a correção comentada).

**5. (Javerson roda, o agente lê o resultado)** Conferência, só leitura: é uma consulta só, do comentário até o `;`,
para rodar uma vez por curso, trocando o filtro do nome do curso (`ilike '%NR%35%'` etc.) e copiando o resultado de
volta para o chat:

```sql
-- Exercícios pós-vídeo: cada questionário "PV-" logo depois do vídeo do mesmo código. SÓ LEITURA.
with alvo as (
  select c.id, e.nome as empresa, c.nome
  from public.treinamento_curso c
  join public.empresa e on e.id = c.empresa_id
  where c.deleted_at is null
    and c.nome ilike '%NR%35%'
    and (e.nome ilike '%sinergia%' or e.nome ilike '%eletro%')
)
select al.empresa, al.nome, a.ordem, a.codigo_origem, a.titulo,
       ant.tipo as tipo_da_aula_anterior, ant.titulo as aula_anterior,
       (select count(*) from public.treinamento_questao q
         where q.aula_id = a.id and q.deleted_at is null) as questoes
from alvo al
join public.treinamento_aula a
  on a.curso_id = al.id and a.deleted_at is null and a.codigo_origem like 'PV-%'
left join lateral (
  select v.tipo, v.titulo
  from public.treinamento_aula v
  where v.curso_id = a.curso_id and v.deleted_at is null and v.ordem < a.ordem
  order by v.ordem desc
  limit 1
) ant on true
order by al.empresa, al.nome, a.ordem;
```

Esperado: `tipo_da_aula_anterior` = `video` em todas as linhas e 2 questões em cada questionário.

### 9.6 Roteiro de teste (Javerson)

Depois de 9.3, em `https://www.sigoobras.com.br`, no curso "TESTE EAD — apagar" e com o funcionário de teste da seção 7
(se já foram apagados, criar de novo como lá). Para o aluno (passo 11 em diante), o curso precisa estar publicado, com o
painel de requisitos sem pendência, e o funcionário matriculado **sem nenhuma aula feita**: se ele já fez o curso na
seção 7, usar outro funcionário de teste ("TESTE EAD 2 — apagar"), com acesso e matrícula criados como lá. Tudo o que
for criado leva "TESTE" no nome e é apagado no fim (passo 25). **Só começar com o OK explícito do Javerson.** Este
roteiro é mais longo que o da seção 7 (1h30), porque monta e testa os seis tipos de aula: reserve cerca de 2 horas, fora
o tempo de criar o curso e o funcionário de teste se ainda não existirem. Cada grupo de passos diz onde fazer: na tela
do RH (computador) ou no portal do aluno (de preferência no celular). Se algo sair diferente do "deve acontecer",
anotar o número do passo, tirar uma foto da tela e mandar para quem estiver ajudando; não consertar pelo banco.

**Os dois arquivos de teste.** Salvar, fora do repositório (por exemplo em `C:\Users\javer\teste-ead\`), como UTF-8 (o
padrão do Bloco de Notas), com o texto abaixo, que é de mentira. O primeiro é `teste-atividades.json` (formato do
pacote do material, usado no passo 9):

```json
[
  {
    "id": "M1",
    "titulo": "Teste",
    "casos": [
      {
        "titulo": "Caso importado",
        "contexto": "Situação de teste.",
        "etapas": [
          {
            "id": "e1",
            "pergunta": "Primeira decisão?",
            "opcoes": [
              { "texto": "Escolha segura", "feedback": "Certo.", "segura": true, "proxima": "e2" },
              { "texto": "Escolha insegura", "feedback": "Arriscado.", "segura": false, "proxima": "r1" }
            ]
          },
          {
            "id": "r1",
            "pergunta": "Como corrigir?",
            "opcoes": [
              { "texto": "Voltar", "feedback": "Isso.", "segura": true, "proxima": "e1" },
              { "texto": "Insistir", "feedback": "Ainda arriscado.", "segura": false, "proxima": "r1" }
            ]
          },
          {
            "id": "e2",
            "pergunta": "Segunda decisão?",
            "opcoes": [
              { "texto": "Encerrar com segurança", "feedback": "Fim seguro.", "segura": true, "proxima": null },
              { "texto": "Pular a etapa", "feedback": "Não.", "segura": false, "proxima": "e2" }
            ]
          }
        ],
        "reflexao": "O que você faria diferente?"
      }
    ],
    "questoes": [
      {
        "enunciado": "Pergunta de teste 1?",
        "opcoes": ["Certa", "Errada", "Errada", "Errada"],
        "correta": 0,
        "explicacao": "Porque é a certa."
      },
      { "enunciado": "Pergunta de teste 2?", "opcoes": ["Errada", "Certa"], "correta": 1, "explicacao": "Idem." }
    ],
    "estudo": [
      {
        "titulo": "Tarefa importada",
        "instrucoes": "Faça um desenho do posto.",
        "evidencia": "Foto do desenho.",
        "tempoEstimadoMin": 5
      }
    ]
  }
]
```

O segundo é `teste-posvideo.json` (formato dos exercícios pós-vídeo, usado no passo 10):

```json
{
  "tipo": "questionarios_por_video",
  "itens": [
    {
      "video": "V01",
      "questoes": [
        {
          "pergunta": "Pergunta de teste do vídeo 1?",
          "opcoes": ["Certa", "Errada", "Errada", "Errada"],
          "correta": 0,
          "comentario": "Porque é a certa."
        },
        {
          "pergunta": "Pergunta de teste do vídeo 2?",
          "opcoes": ["Errada", "Certa", "Errada", "Errada"],
          "correta": 1,
          "comentario": "Idem."
        }
      ]
    }
  ]
}
```

**Montar as atividades pela tela (computador, tela do RH)**

1. **Nota mínima.** No curso, campo "Nota mínima dos questionários dos módulos (%)": colocar 80 e "Salvar curso". Deve
   salvar sem erro (se o curso tiver aluno em andamento, aparece antes um aviso com quantos são).
2. **Questionário.** Em "Aulas", "Nova aula": tipo "Questionário", título `TESTE · Questionário`, módulo `M1 · Teste`,
   tempo previsto 5 min, botão `+`. No menu ⋮ da aula, "Questões": cadastrar 3 questões (4 alternativas, a certa
   marcada, um comentário em cada). Deve acontecer: a linha da aula mostra "3 questões"; a "Avaliação final" (mais
   abaixo) continua só com as questões de antes (as 3 novas não aparecem lá). Editar o comentário de uma questão e
   salvar: a mudança fica.
3. **Caso, criar.** "Nova aula": tipo "Caso", título `TESTE · Caso`, módulo `M1 · Teste`, tempo 5 min, `+`: abre o
   editor do caso. Preencher a situação (contexto), clicar "Adicionar etapa" duas vezes (nascem `e2` e `e3`) e trocar o
   código da 3ª etapa de `e3` para `r1`. Montar assim: etapa 1 (`e1`): a escolha segura "leva para" `e2` e a insegura
   "leva para" `r1`; etapa `r1`: a segura "leva para" `e1` e a insegura continua em `r1`; etapa `e2`: a segura "leva
   para" "Fim do caso" e a insegura continua em `e2`. Escrever a pergunta de cada etapa, o texto e o comentário de cada
   opção e o texto "Para refletir". Deve acontecer: "Salvar caso" só acende quando não há problema apontado na tela; "Fim
   do caso" fica desabilitado numa opção insegura. Salvar: aparece "Caso criado" e a aula entra na lista.
4. **Caso, editar.** No menu ⋮ da aula do caso, "Editar caso": mudar o comentário de uma opção e o texto "Para
   refletir"; salvar ("Caso salvo"). Abrir de novo: as mudanças estão lá.
5. **Tarefa.** "Nova aula": tipo "Tarefa", título `TESTE · Tarefa`, módulo `M1 · Teste`, instruções longas (para
   precisar rolar no celular), tempo 5 min, `+`.
6. **Texto e apostila.** Editar (lápis) a aula de texto do curso de teste: trocar uma palavra e salvar (antes isso só
   dava por SQL); deixar o texto longo, de várias telas de celular, para precisar rolar. Trocar a apostila por um PDF de
   3 páginas ou mais (menu ⋮ da aula, "Trocar o arquivo (PDF)"). Com uma apostila de 1 página, o botão do aluno acende
   na hora, o que também é o esperado, mas não testa a rolagem.
7. **Remover.** Criar uma aula `TESTE · Caso para apagar` (basta preencher os textos: o editor já começa com uma etapa
   que fecha o caso) e uma `TESTE · Questionário para apagar` (1 questão). Em cada uma, menu ⋮ → "Remover aula". Deve
   acontecer: a confirmação diz "O roteiro do caso é removido junto com a aula." e "A questão deste questionário é
   removida junto com a aula."; depois de confirmar, a aula some da lista. A "Avaliação final" continua com as mesmas
   questões.

**Ver como aluno (computador, tela do RH)**

8. No curso de teste, "Ver como aluno" (nada é gravado). No questionário: errar 1 de 3 (67%): não conclui e mostra a
   correção comentada; "Tentar de novo" sorteia de novo a ordem; acertar as 3: conclui. No caso: escolher a insegura (o
   comentário aparece em âmbar; "Continuar" leva a `r1`), voltar e terminar ("Para refletir", "Concluir caso"). Na
   tarefa, na apostila e no texto: o botão só acende ao rolar até o fim.

**Importar um arquivo pequeno de cada formato (computador, tela do RH)**

9. **Pacote do material.** "Importar atividades" → `teste-atividades.json`. Na prévia: "M1" casa com "M1 · Teste";
   aparecem 1 caso (10 min), 1 questionário com 2 questões (15 min) e 1 atividade de estudo (5 min, vinda do arquivo);
   nenhum problema. "Confirmar e importar": o resumo diz "3 aulas criadas e 2 questões gravadas". Importar o mesmo
   arquivo de novo: tudo aparece como "já existe — será pulada" e o "Confirmar e importar" fica desabilitado.
10. **Exercícios pós-vídeo.** O vídeo do curso de teste precisa ter `V01` no nome do arquivo (por exemplo
    `TESTE_V01.mp4`; se o nome for outro, troque o código `V01` no arquivo de teste pelo que está no nome, ou use
    "Trocar o arquivo" na aula de vídeo). "Importar atividades" → `teste-posvideo.json`. Na prévia: o vídeo é achado,
    com 2 questões e 5 min. Confirmar: "1 aula criada e 2 questões gravadas"; o questionário "Exercícios do vídeo: ..."
    entra logo depois da aula de vídeo, no módulo dela. Para ver o erro, trocar `V01` por `V99` numa cópia do arquivo: a
    prévia diz "vídeo V99 não encontrado neste curso" e o "Confirmar e importar" não acende.

**Aluno de verdade (portal do funcionário, de preferência no celular)**

**As aulas abrem em sequência:** cada uma só abre quando todas as anteriores estão concluídas (regra do servidor).
Por isso o aluno percorre o curso na ordem em que os passos 1 a 10 o montaram: 1ª apostila; 2ª vídeo; 3ª "Exercícios
do vídeo: ..." (do passo 10; sem ele essa aula não existe e as seguintes sobem um número); 4ª texto;
5ª `TESTE · Questionário`; 6ª `TESTE · Caso`; 7ª `TESTE · Tarefa`; 8ª `M1 · Caso 1: Caso importado`;
9ª `M1 · Questionário do módulo` (importado); 10ª `M1 · Atividade de estudo 1: Tarefa importada`. Os passos abaixo
seguem essa ordem e dizem qual aula é: não pular nenhuma.

11. Entrar no portal com o funcionário de teste (acesso e senha provisória como no passo 5 da seção 7) e abrir o curso:
    só a 1ª aula está aberta.
12. **Apostila (1ª aula) e vídeo (2ª).** Primeiro no computador, abrir a apostila (PDF de 3 páginas ou mais) só para
    olhar, sem concluir: ela aparece desenhada na própria página, sem a barra do visualizador do navegador, e "Abrir em
    outra aba" funciona. Depois, no celular: o botão "Marcar como lida — li e compreendi" fica apagado, com o aviso "Role
    a apostila até o fim da última página para liberar o botão". Rolar até o fim da última página: o botão acende;
    tocar e a aula conclui. Não há contagem regressiva nem "faltam X min". A 2ª aula (vídeo) abre: assistir até o fim.
13. **Exercícios do vídeo (3ª aula; só se o passo 10 foi feito).** São 2 questões e a nota mínima é 80%, então é
    preciso acertar as 2. Errar uma e tocar "Enviar respostas": aparece a correção comentada e a aula não conclui.
    "Tentar de novo" e acertar as 2: conclui.
14. **Texto (4ª aula).** O texto longo do passo 6: o botão fica apagado, com o aviso "Role o texto até o fim para
    liberar o botão". Rolar até o fim: acende; concluir. (Um texto curto, que cabe na tela, acende na hora.)
15. **Questionário (5ª aula, `TESTE · Questionário`).** Responder todas, errando uma (3 questões = 67%), e "Enviar
    respostas": aparece a correção comentada, a aula não conclui e aparece "Tentar de novo". Tocar: as questões e as
    alternativas vêm em outra ordem. Acertar as 3: a aula conclui; ao reabrir, mostra a melhor nota e quantas
    tentativas foram.
16. **Caso (6ª aula, `TESTE · Caso`).** Escolher a opção insegura de `e1` (o comentário aparece em âmbar), "Continuar",
    ir por `r1` de volta a `e1` e terminar pela escolha segura até o fim: aparece "Para refletir" e "Concluir caso". No
    meio do caminho, recarregar a página: o caso volta de onde parou.
17. **"Próxima aula" começa no topo.** Com o caso concluído, rolar a página para baixo, até a lista de aulas, e tocar em
    "Próxima aula" (a da `TESTE · Tarefa`). Deve acontecer: a tarefa abre com o começo dela no topo da tela, não no meio
    da página, e o botão "Fiz a atividade" continua apagado (aviso "Leia as instruções até o fim para liberar o
    botão") até rolar as instruções.
18. **Tarefa (7ª aula, `TESTE · Tarefa`).** Rolar até o fim e tocar "Fiz a atividade": conclui.
19. **Caso importado (8ª aula), toque duplo e parar no meio.** Abrir "M1 · Caso 1: Caso importado". Na 1ª etapa, tocar
    duas vezes bem rápido em "Escolha segura". Deve acontecer: a escolha vale uma vez só (aparece o comentário dela,
    sem mensagem de erro e sem o caso recomeçar). "Continuar" leva a `e2`; escolher "Pular a etapa" (continua em `e2`),
    "Continuar" e **parar aí**, sem concluir.

**O RH muda o roteiro com o aluno no meio (computador, tela do RH)**

20. "Editar caso" no caso importado: "Remover etapa" na etapa `e2` (a escolha segura de `e1` passa a encerrar o caso) e
    "Salvar caso". Deve acontecer: antes de gravar, aparece o aviso "Mudar o roteiro do caso com alunos?"; escolher
    "Salvar mesmo assim". Se o aviso não aparecer, tudo bem, siga (ele só aparece quando o aluno já tem tempo registrado
    nessa aula). Trocar só o texto de uma opção não faz o aluno recomeçar: ele recomeça quando o caminho que já fez
    deixa de existir, como aqui.

**Terminar o curso (portal do funcionário)**

21. **Caso importado, de novo (8ª aula).** Recarregar a página do caso: ele recomeça da primeira etapa. Chegar ao fim e,
    em "Concluir caso", tocar duas vezes bem rápido: conclui uma vez só, sem erro.
22. **Questionário importado (9ª aula) e tarefa importada (10ª).** No questionário "M1 · Questionário do módulo" (2
    questões), acertar as 2. Na tarefa "M1 · Atividade de estudo 1: Tarefa importada", rolar e tocar "Fiz a atividade".
23. **Prova e certificado.** Com todas as aulas concluídas, fazer a prova final (só tem as 5 questões de sempre: as dos
    questionários não entram nela) e assinar o certificado com a senha, como na seção 7. A frente do PDF traz a frase
    "conclusão das atividades dos módulos: 3 questionários (nota mínima de 80%), 2 estudos de caso e 2 atividades de
    estudo" (com os números do que o curso de teste tiver: sem o passo 10, são 2 questionários). O verso não muda.

**Conferir e limpar (computador, tela do RH)**

24. **RH confere.** Detalhes da matrícula do funcionário de teste: a seção "Questionários dos módulos" lista as
    tentativas (a abaixo da nota e a aprovada), cada uma abre com as questões na ordem que o aluno viu, a alternativa
    marcada e a certa. A trilha mostra "Escolha no caso", "Caso recomeçado (o roteiro mudou)", "Concluiu o caso", "Leu
    até o fim" e "Confirmou a atividade de estudo"; o toque duplo dos passos 19 e 21 deixou uma só "Escolha no caso" por
    clique e uma só "Concluiu o caso". "Exportar CSV". Depois, no curso, "Exportar dossiê": abrir o ZIP e conferir que
    `questionarios.csv` está lá, com as tentativas.
25. **Limpeza**, como na seção 7 (o `sigo.permitir_expurgo` dela vale também para as tentativas dos questionários).
    Apagar o curso leva as aulas, as questões e os roteiros dos casos; apagar o funcionário leva as matrículas e, com
    elas, as tentativas dos questionários (repetir para o "TESTE EAD 2", se foi criado). Depois, apagar no Storage
    (bucket `treinamentos`) os arquivos enviados e apagar os dois arquivos de teste do PC.

### 9.7 Verificação da branch (feita antes de entregar)

Feita em 21/10/2026, na raiz do worktree, com a branch no commit anterior ao deste documento. Todas sem erro:

- `node --test "supabase/functions/**/*.test.ts"`: 2174 testes, 0 falhas.
- `npm test --workspace=apps/web`: 155 arquivos, 2958 testes, 0 falhas.
- `npm run lint` e `npm run build`: sem erro.
- `npx prettier --check` em todos os arquivos tocados pela branch (`git diff --name-only --diff-filter=d origin/master...HEAD`) e
  neste documento; `no-undef` nos componentes alterados (`cd apps/web && npx eslint --rule "no-undef: error" ...`): sem
  erro.
- Nenhum UUID real nem texto do material no repositório (busca por UUID no diff da branch).

As contagens crescem a cada task e a cada merge do master: vale a da última verificação.
