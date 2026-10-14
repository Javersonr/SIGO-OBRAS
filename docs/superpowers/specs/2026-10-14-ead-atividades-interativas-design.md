# Atividades interativas no Portal de Treinamento (EAD): questionário do módulo, caso com decisões e tarefa de estudo

- **Data:** 14/10/2026. **Status:** desenho aprovado pelo Javerson na conversa de 13–14/10/2026, por partes (decisões
  A1 a A10 abaixo); texto aprovado por ele em 14/10/2026. Plano:
  `docs/superpowers/plans/2026-10-14-ead-atividades-interativas.md`.
- **Base:** `master` em `7b91500`. Branch `feat/ead-atividades-interativas` (worktree
  `C:\Users\javer\sigoobras-wt-ead-interativas`). Os números de linha citados são desse commit.
- **Migração:** `0170_ead_atividades_interativas.sql` (número confirmado pelo Javerson; a habilitação automática usa
  `0154`–`0156` e a branch financeira reservou `0160`–`0164`).
- Leia antes o `AGENTS.md` e o `docs/HANDOFF-PORTAL-TREINAMENTO.md`: as regras de lá valem aqui.

---

## 1. Problema

Hoje uma aula do EAD só pode ser vídeo, PDF ou texto (`treinamento_aula.tipo`, check da `0103:182`), e a única
avaliação é a prova final de múltipla escolha (`treinamento_questao`, `prova.ts`). O material novo do NR-10 Básico
(12 módulos, edição de avaliação de 13/10/2026, semipresencial 32 h digitais + 8 h presenciais) prevê, em cada módulo,
atividades interativas que não têm onde entrar:

- **casos com decisões** (3 por módulo, 36 no total): a escolha insegura mostra o comentário e leva a uma etapa de
  recuperação ou de volta à mesma etapa; a segura avança; no fim há uma reflexão;
- **questões comentadas do módulo** (8 por módulo, 96 no total), com mínimo pedagógico de 80%;
- **tarefas de estudo** (3 a 6 por módulo), com instruções, evidência esperada e tempo estimado.

Sem elas, o conteúdo cadastrado do NR-10 Básico soma cerca de 5,7 h contra 32 h de carga teórica, e o requisito
`LASTRO` (`requisitos.ts:197-202`) impede publicar e matricular.

Os rascunhos de autoria (`C:\Users\javer\NR10-Material-Avaliacao\conteudo\m1-m4.json` e `m5-m8.json`, fora do
repositório) cobrem M1–M8 (M2 sem atividades): 21 casos com 77 etapas e 179 opções, 56 questões e 33 tarefas
(1.375 min estimados). Nos módulos 3 e 4 os casos são **ramificados**: a escolha insegura leva a uma etapa de
recuperação (`r1`, `r2`), que tem pergunta própria e volta à decisão. A versão final dos 12 módulos está no pacote
`NR10_Parte_1_de_6_Curso_e_Documentos.zip` (pasta `NR10_Basico_Javerson/data/*.json`), que precisa voltar ao PC para a
carga (§12).

## 2. Decisões do Javerson

| #   | Decisão                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Entram as três atividades do pacote, construídas nesta ordem: questionário do módulo, caso com decisões, tarefa de estudo                                                                                                                                                                                   |
| A2  | **Questionário = estudo guiado:** conclui com nota ≥ mínima do módulo (padrão 80%); tentativas livres, sem intervalo, todas gravadas; o servidor sorteia questões e alternativas a cada tentativa; depois de enviar, o aluno vê a correção comentada (aprovado ou não)                                      |
| A3  | **Caso só por clique:** termina pela escolha segura que encerra o caso; a insegura mostra o comentário e segue para onde o roteiro manda (recuperação ou mesma etapa); no fim, tela "Para refletir" com o texto da reflexão e o botão "Concluir caso"; o aluno não escreve                                  |
| A4  | **Tarefa só confirmando:** a aula mostra instruções, o que produzir e o tempo previsto; o aluno faz fora da tela e clica "Fiz a atividade"; não há texto do aluno nem parecer do tutor                                                                                                                      |
| A5  | **Sem relógio:** atividades e leituras (texto e PDF) concluem quando o aluno termina; nas leituras e na tarefa, o botão acende ao rolar até o fim. Vídeo continua exigindo 90%. O tempo cadastrado de cada aula continua somando na carga horária (tempo declarado); a trilha registra o tempo de tela real |
| A6  | Cada atividade é uma **aula** do curso (caminho 1): mesma lista, mesmo cadeado em ordem, mesma marcação de concluída                                                                                                                                                                                        |
| A7  | **Cadastro:** botão "Importar atividades" (arquivo do pacote, prévia, grava tudo ou nada, reimportar não duplica) e criação/edição na tela dos três tipos                                                                                                                                                   |
| A8  | **Tempos padrão na importação:** 15 min por questionário e 10 min por caso (as tarefas trazem o próprio tempo); editáveis um a um                                                                                                                                                                           |
| A9  | **Certificado:** nos cursos com atividades, uma frase de resumo na frente (quantidades congeladas no certificado); o verso não muda                                                                                                                                                                         |
| A10 | Migração `0170`; produção na ordem do §12, cada passo com OK explícito                                                                                                                                                                                                                                      |

**A11** (14/10/2026, depois da aprovação do texto): os 122 exercícios pós-vídeo de pergunta aberta (zip
`Cursos_Sinergia_Conteudo_Plataforma_RECUPERADO_2026-10-02.zip`) entram como **questionário de clique logo depois de
cada vídeo**: a resposta esperada vira a alternativa certa; as erradas e o comentário são redigidos e revisados pelo
Javerson como RT antes da carga (§5.1 e §12).

Decisões que **substituem** respostas anteriores da mesma conversa: A3 substitui "reflexão escrita no fim do caso";
A4 substitui "entrega escrita com parecer do tutor antes do certificado"; A5 vale também para as leituras (o tempo
mínimo de leitura, criado pela T9/T11, deixa de ser exigido). Todas foram confirmadas pelo Javerson.

## 3. Abordagem

**Escolhida: a atividade é uma aula** (A6). `treinamento_aula.tipo` ganha `questionario`, `caso` e `tarefa`. A
conclusão de cada atividade é a mesma linha de `treinamento_progresso` (`concluida = true`, gravada só pelo servidor,
`0130`), então continuam valendo sem regra nova: bloqueio linear (`aulaLiberada`, `liberacaoDasAulas`), conclusão do
curso (`situacaoDaTrilha`: todas as aulas + prova final aprovada), carga (`tempoObrigatorioSeg`), "Ver como aluno",
conteúdo do verso do certificado e trilha.

Descartadas:

- **Atividades num quadro à parte por módulo:** o curso passaria a ter duas regras de conclusão (aulas e atividades),
  com mais código e risco de divergência entre elas e com o certificado.
- **Abrir o player do próprio pacote:** as escolhas não passariam pelo servidor nem entrariam na trilha (NR-1 Anexo II
  4.6.2 e 4.7).

## 4. Comportamento para o aluno

### 4.1 Leituras: texto, PDF e tarefa (A5)

- O botão "Marcar como lida — li e compreendi" (tarefa: "Fiz a atividade") fica desabilitado até o aluno **chegar ao
  fim** do conteúdo e então acende; não há mais contagem regressiva nem "faltam X min".
- Texto e tarefa: um marcador no fim do texto (IntersectionObserver); texto curto que cabe na tela libera na hora.
- PDF: a apostila passa a ser desenhada pelo pdf.js **em todas as telas** (hoje só no celular,
  `ApostilaPdf.jsx:16-19`; no computador é um `<iframe>`, de onde o portal não consegue saber a rolagem). O fim é a
  última página visível. "Abrir em outra aba" continua. Consequência aceita: no computador some a barra do
  visualizador do navegador (zoom, busca).
- O contador de tempo de tela continua rodando como hoje (tela visível), só para a trilha.
- Servidor: `conclusaoDaAula` (`regras.ts:92-114`) passa a concluir `pdf`, `texto` e `tarefa` com o clique
  (`concluir: true`), sem exigir o tempo; o 409 `TEMPO_LEITURA` deixa de existir. Vídeo não muda (90%).

### 4.2 Questionário do módulo (A2)

1. Ao abrir a aula, o portal chama `questionario_abrir`: o servidor sorteia a ordem das questões e das alternativas
   (mesmo sorteio criptográfico da prova, `sortearProva`) e grava o início na trilha (`questionario_iniciado`, com a
   ordem). Reabrir a mesma tentativa mantém o sorteio, como a prova (`index.ts:1800-1818`).
2. O aluno responde todas e envia (`questionario_enviar`). O servidor confere o envio com as regras da prova
   (`validarEnvio`: início desta tentativa, questões inalteradas, todas respondidas; sem tempo mínimo), corrige
   (`corrigirProva`) com a nota mínima do módulo (`treinamento_curso.nota_minima_modulo`, padrão 80) e grava a
   tentativa.
3. A resposta traz nota, acertos, total, aprovado ou não e a **correção comentada** de cada questão (alternativa certa
   e comentário), **também para quem não atingiu a nota** (A2: é estudo; a cobrança é a prova final).
4. Aprovado: a aula conclui e o aluno segue. Não aprovado: "Tentar de novo" abre uma nova tentativa, já re-sorteada.
5. Aula concluída: reabrir mostra a melhor nota e o número de tentativas, sem nova tentativa.

Com 8 questões e mínimo de 80%, o aluno precisa de 7 acertos (a nota é arredondada: 6/8 = 75%).

### 4.3 Caso com decisões (A3)

**Roteiro do caso** (gravado em `treinamento_caso.conteudo`, §6):

```json
{
  "contexto": "Situação apresentada ao aluno",
  "etapas": [
    {
      "id": "e1",
      "pergunta": "Qual é sua primeira decisão?",
      "opcoes": [
        { "texto": "…", "comentario": "…", "segura": true, "proxima": "e2" },
        { "texto": "…", "comentario": "…", "segura": false, "proxima": "r1" }
      ]
    }
  ],
  "reflexao": "Texto para refletir no fim"
}
```

- O caso começa na **primeira** etapa da lista. `proxima` é o `id` de outra etapa ou `null` (fim). Só opção segura
  pode encerrar o caso.
- **Caso válido** (`validarCaso`, mesma regra no front e no servidor): pelo menos 1 etapa; `id` únicos e não vazios;
  2 a 6 opções por etapa; texto e comentário preenchidos; toda `proxima` aponta para uma etapa que existe (ou é
  `null`); `null` só em opção segura; toda etapa tem pelo menos uma opção segura; toda etapa é alcançável a partir da
  primeira; de toda etapa dá para chegar ao fim; existe um caminho **só de opções seguras** da primeira etapa até o
  fim; limites de tamanho (30 etapas; pergunta, comentário e opção até 1.000 caracteres; contexto e reflexão até
  4.000).

**O que o aluno vê:**

1. `caso_abrir` devolve o contexto e a etapa atual: pergunta e opções **só com o texto**, em ordem embaralhada a cada
   vez, cada uma com o índice original. Nunca `segura`, `comentario` ou `proxima` antes do clique.
2. O aluno clica numa opção (`caso_escolher`, com a etapa e o índice). O servidor confere se aquela é a etapa atual
   (senão, 409 `CASO_FORA_DE_ORDEM` com o estado atual), grava a escolha na trilha e devolve o comentário, se foi
   segura e a próxima etapa (ou o fim). A tela mostra o comentário com destaque (verde para segura, âmbar para
   insegura) e o botão "Continuar".
3. No fim: tela "Para refletir" com o texto da reflexão e o botão "Concluir caso" (`caso_concluir`), que conclui a
   aula.
4. Recarregar a página retoma de onde parou (o estado vem da trilha).

**Estado do caso:** é recalculado pelo servidor a partir das escolhas gravadas na trilha (eventos `caso_escolha`
desta matrícula e aula, da rodada atual), refazendo o caminho no roteiro de hoje (`estadoDoCaso`, regra pura). Se o
RH alterou o roteiro e o caminho gravado não confere mais (etapa ou opção que sumiu), a rodada recomeça da primeira
etapa (evento `caso_reiniciado`, com o motivo). A rodada só muda nesse caso; aula concluída não abre nova rodada.

Roteiro inválido no servidor (o RH salvou pela API algo que a tela recusaria): 409 `CASO_INVALIDO`, "Este caso está
com problema — avise o RH", sem gravar nada.

### 4.4 Tarefa de estudo (A4)

A aula mostra o título, as instruções e "o que produzir" (o texto da aula, `conteudo_texto`) e o tempo previsto. O
botão "Fiz a atividade" acende ao rolar até o fim (§4.1) e conclui a aula. A trilha registra a confirmação
(`tarefa_confirmada`) e o tempo de tela.

### 4.5 Lista de aulas, prova final e certificado

- Cada tipo tem ícone e rótulo próprios na lista (questionário, caso, tarefa); o cadeado e "Próxima aula" funcionam
  como hoje.
- A prova final libera como hoje: todas as aulas concluídas, inclusive as atividades. Ela usa **só** as questões da
  prova (`aula_id` vazio, §6).
- Certificado: §9.

## 5. Tela do RH (aba Treinamentos EAD)

Toda gravação exige "Treinamentos EAD → Editar", como as aulas hoje (trigger `zz_permissao_ead`, ramo padrão,
`0147:266-269`).

### 5.1 Importar atividades (A7, A8)

Botão "Importar atividades" no painel do curso, com um diálogo em três passos:

1. **Arquivo:** o RH escolhe o arquivo do pacote. O leitor (`lib/ead-atividades-importar.js`, puro, com teste) aceita
   o formato dos módulos do pacote: lista de módulos `{ id, titulo, casos, questoes, estudo }`, com casos
   `{ id, titulo, contexto, etapas[{ id, pergunta, opcoes[{ texto, feedback, segura, proxima }] }], reflexao }`,
   questões `{ enunciado, opcoes, correta, explicacao }` e tarefas `{ titulo, instrucoes, evidencia,
tempoEstimadoMin }`. É o formato dos rascunhos; o do pacote final (`data/*.json`) é conferido quando o zip voltar
   ao PC, e o leitor é ajustado nessa hora se diferir (§12). Campos desconhecidos são ignorados; `pratica` fica fora
   (§13).
2. **Prévia:** por módulo do arquivo, o módulo do curso onde as atividades entram (casado pelo código: "M3" casa com o
   módulo do curso que começa com "M3 " ou "M3 ·"; sem par, o RH escolhe na lista ou "novo módulo no fim"), quantos
   casos, o questionário com quantas questões, quantas tarefas e o tempo somado. Campos para o tempo padrão do
   questionário (15 min) e de cada caso (10 min). Problemas aparecem por atividade (caso inválido, questão sem
   resposta certa ou com menos de 2 alternativas, tarefa sem instruções) e **bloqueiam** o "Confirmar" até o RH
   desmarcar a atividade com problema. Atividades já importadas (mesmo código de origem no curso) aparecem como
   "já existe — será pulada".
3. **Confirmar:** grava tudo de uma vez pela RPC `importar_atividades_ead` (§6): ou entra tudo, ou nada. No fim, um
   resumo (quantas aulas e questões entraram, quantas foram puladas).

**O que vira aula**, por módulo e nesta ordem, depois da última aula do módulo:

| Do pacote      | Aula criada                                                                                                                                     | Código de origem |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| cada caso      | `tipo = caso`, título "Mx · Caso n: <título>", tempo padrão do caso, roteiro em `treinamento_caso`                                              | `M3-C1`          |
| `questoes` (8) | uma aula `tipo = questionario`, título "Mx · Questionário do módulo", tempo padrão; as 8 questões com `aula_id`                                 | `M3-Q`           |
| cada tarefa    | `tipo = tarefa`, título "Mx · Atividade de estudo n: <título>", tempo = `tempoEstimadoMin`, texto = instruções + "O que produzir: " + evidência | `M3-T1`          |

Conversão: `feedback` → `comentario`; `explicacao` → `comentario` da questão; `enunciado` → `pergunta`; o `id` da
etapa é mantido. O módulo gravado é o texto do módulo do curso (ex.: "M3 · Análise de situações…").

**Exercícios pós-vídeo (A11), 2º formato de arquivo.** Os 122 exercícios abertos do zip
`Cursos_Sinergia_Conteudo_Plataforma_RECUPERADO_2026-10-02.zip` (92 em `exercicios_por_video.json`, 2 por vídeo, para
NR-10 SEP e Reciclagem, NR-35 e Reciclagem, NR-6 e NR-1; 30 em `exercicios_modulos.json`, B01–B15, para o NR-10 Básico
Reciclagem) são convertidos em múltipla escolha **fora do repositório** (a resposta esperada vira a alternativa certa;
3 alternativas erradas e o comentário são redigidos e revisados pelo Javerson como RT antes da carga). O arquivo
convertido tem a forma `{ "tipo": "questionarios_por_video", "itens": [{ "video": "S02A", "questoes": [{ pergunta,
opcoes, correta, comentario }] }] }`. O diálogo reconhece esse formato e cria, para cada item, **uma** aula
`tipo = questionario` logo **depois da aula de vídeo** daquele código (achada pelo código no nome do arquivo do
`video_ref`: `(^|/|_|-)S02A(_|.)`, sem diferenciar maiúsculas; o hífen cobre os uploads da tela, `<uuid>-<nome>`), com o módulo dela, título "Exercícios do vídeo: <título
da aula de vídeo>", código de origem `PV-S02A` e tempo padrão de 5 min (editável). Vídeo não achado no curso é
problema que bloqueia aquele item.

### 5.2 Criar e editar na tela

- **Nova aula** ganha os três tipos. Questionário: nasce vazio e as questões são cadastradas nele. Caso: abre o editor
  de caso. Tarefa: título, módulo, texto e tempo previsto.
- **Questionário:** na linha da aula, "Questões" abre a lista das questões **daquela aula** com o editor que já existe
  (`lib/ead-questao.js`, 2 a 6 alternativas, correta, comentário). A lista de questões da prova final passa a mostrar
  só as da prova (`aula_id` vazio).
- **Caso:** editor (`CasoEditor.jsx`, novo) com contexto, etapas (id, pergunta, opções com texto, comentário,
  "segura" e "leva para": uma etapa da lista ou "Fim"), adicionar/remover etapa e opção, reflexão. Os problemas de
  `validarCaso` aparecem na hora e o "Salvar" fica desabilitado enquanto houver algum.
- **Texto e tarefa:** a edição da aula passa a editar também o texto (hoje a tela não edita o texto de uma aula de
  texto; correção só por SQL).
- **Curso:** campo "Nota mínima dos questionários dos módulos" (0 a 100, padrão 80).
- O aviso de impacto (`lib/ead-impacto.js`, matrículas em andamento) vale para as aulas novas como para as atuais.

### 5.3 Detalhes da matrícula, trilha e dossiê

- `lib/ead-trilha.js` ganha os rótulos: `questionario_iniciado`, `questionario_envio`, `caso_escolha` (com etapa,
  segura/insegura e para onde levou), `caso_reiniciado`, `caso_concluido`, `tarefa_confirmada`. `apostila_lida`
  passa a dizer "Leu até o fim".
- `MatriculaAuditoriaSheet.jsx` ganha a seção "Questionários dos módulos": uma linha por tentativa (aula, nº, nota,
  resultado, data, IP), expansível com as questões na ordem mostrada, a alternativa marcada e a certa, como as
  tentativas da prova.
- O dossiê de fiscalização (`lib/ead-dossie.js`) ganha a planilha das tentativas dos questionários. As escolhas dos
  casos já saem na planilha da trilha.

### 5.4 Ver como aluno

A prévia do RT (`lib/portal-previa.js`, `criarApiPrevia`) passa a responder às ações novas localmente, sem gravar
nada: questionário sorteado e corrigido no navegador (com gabarito, como a prova na prévia), caso andando pelo roteiro
com `estadoDoCaso` (mesma regra do servidor) e leituras com o botão liberado ao rolar até o fim.

## 6. Banco: migração `0170_ead_atividades_interativas.sql`

Só estrutura; nenhum dado existente muda. Idempotente, com cabeçalho em português e `select 'ok' as res;` no fim.

1. **Tipos de aula:** `treinamento_aula_tipo_chk` passa a aceitar
   `('video', 'pdf', 'texto', 'questionario', 'caso', 'tarefa')` (drop/add da constraint).
2. **Código de origem:** `treinamento_aula.codigo_origem text` (ex.: `M3-C1`), com índice único parcial
   `(curso_id, codigo_origem) where deleted_at is null and codigo_origem is not null`: reimportar não duplica.
3. **Questões do questionário:** `treinamento_questao.aula_id uuid null references treinamento_aula(id) on delete
cascade`, índice em `aula_id`. Vazio = prova final. O trigger `referencias_da_empresa` da questão passa a conferir
   também `aula_id:treinamento_aula`. Trigger novo `questao_do_questionario` (BEFORE INSERT/UPDATE, nome antes de
   `zz_`): com `aula_id`, a aula tem de ser do mesmo curso e do tipo `questionario`.
4. **Nota mínima do módulo:** `treinamento_curso.nota_minima_modulo integer not null default 80`, check 0–100.
5. **Roteiro do caso:** tabela `treinamento_caso` (`id`, `empresa_id`, `curso_id`, `aula_id`, `conteudo jsonb not
null` com check `jsonb_typeof = 'object'`, `created_at`, `updated_at`, `deleted_at`), único `aula_id` entre as não
   apagadas. RLS: `apply_tenant_rls` + policy **restritiva** de SELECT igual à do gabarito
   (`tem_permissao('Segurança do Trabalho', 'Treinamentos EAD')`, como `0147:414-417`). Triggers: `set_updated_at`,
   `referencias_da_empresa` (`curso_id`, `aula_id`), `caso_da_aula` (a aula é do mesmo curso e do tipo `caso`) e
   `zz_permissao_ead` (ramo padrão: Editar), que tem de continuar sendo o **último** BEFORE. `revoke all` de `anon`;
   `revoke delete, truncate` de `authenticated`.
6. **Tentativas dos questionários:** tabela `treinamento_questionario_tentativa` (`id`, `empresa_id`,
   `matricula_id`, `curso_id`, `aula_id`, `funcionario_id`, `numero`, `prova jsonb`, `respostas jsonb`, `acertos`,
   `total`, `nota`, `aprovada`, `ip`, `dispositivo`, `created_at`), único `(matricula_id, aula_id, numero)`, FKs com
   `on delete cascade` como `treinamento_tentativa`. Só o servidor grava: RLS ligada, policy de SELECT da empresa +
   restritiva da aba, sem policy de escrita, `revoke insert, update, delete, truncate` de `authenticated` e `all` de
   `anon`. Imutável: triggers `trilha_imutavel` (UPDATE/DELETE) e `trilha_imutavel_truncate` (`0135`).
   `referencias_da_empresa` em `matricula_id`, `curso_id`, `aula_id`.
7. **RPC `importar_atividades_ead(p_curso_id uuid, p_atividades jsonb) returns jsonb`:** `security definer`,
   `set search_path = public`, `exigir_empresa_do_chamador` com a empresa do curso, `tem_permissao(...,'editar')`
   (senão `42501`). Para cada atividade da lista (já convertida e validada pela tela): pula se o `codigo_origem` já
   existe no curso; abre espaço na `ordem` (as aulas depois do fim do módulo, ou depois da aula indicada em
   `depois_da_aula_id`, sobem; com `depois_da_aula_id` o item herda o módulo dessa aula, que tem de ser do mesmo curso);
   insere a aula; insere as questões
   (questionário) ou o roteiro (caso). Tudo numa transação. Devolve `{ criadas, puladas, questoes }`. `revoke all ...
from public, anon, authenticated; grant execute ... to authenticated, service_role` (modelo `0110`). Os triggers
   das tabelas (inclusive `zz_permissao_ead`, que lê o JWT do chamador) continuam valendo dentro da RPC.

`tools/smoke-ead-atividades.sql` (`begin; ... rollback;`, empresa escolhida em tempo de execução, nenhum UUID real):
tipos novos aceitos; questão com `aula_id` de outro curso ou de aula que não é questionário recusada; caso de aula
que não é caso recusado; `authenticated` sem a aba não lê `treinamento_caso`; `authenticated` não grava em
`treinamento_questionario_tentativa`; UPDATE/DELETE de tentativa recusados; a RPC importa e, rodada de novo, pula
tudo; usuário sem Editar recebe `42501`.

## 7. Servidor (`portal-funcionario`)

**Regras puras novas, com teste `node:test`** (sem `Deno.*`):

- `caso.ts`: `validarCaso(conteudo)` → lista de problemas; `estadoDoCaso(conteudo, escolhas)` → `{ etapaAtual | fim,
passagens, valido }` refazendo o caminho; `etapaParaAluno(etapa, aleatorio)` → pergunta + opções só com texto e
  índice original, embaralhadas; `resultadoDaEscolha(conteudo, estado, etapaId, opcao)` → recusa ou
  `{ comentario, segura, proxima, fim, passagem }`. `validarCaso` tem uma cópia no front (`lib/ead-caso.js`), e o teste
  do servidor importa as duas com os mesmos casos (como `requisitos.test.ts`).
- `questionario.ts`: preparo (aula liberada, tipo, questões da aula, curso, tentativas), número da tentativa,
  resposta com a correção comentada para aprovado e não aprovado. Reaproveita `sortearProva`, `provaDaOrdem`,
  `validarEnvio` (tempo mínimo 0) e `corrigirProva` de `regras.ts`. Toda leitura confere o `error` (503 em falha,
  como `prova.ts`).

**Ações novas** (sessão do aluno; matrícula pela sessão, nunca pelo corpo; aula do curso da matrícula, liberada e do
tipo certo; toda consulta filtrada pela empresa da sessão; limite de volume como `evento`/`progresso`):

| Ação                  | Corpo                                    | Faz                                                                                                                        |
| --------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `questionario_abrir`  | `matricula_id, aula_id`                  | sorteia ou retoma a tentativa; evento `questionario_iniciado`; questões sem gabarito                                       |
| `questionario_enviar` | `matricula_id, aula_id, respostas`       | valida, corrige, grava a tentativa; aprovado conclui a aula; evento `questionario_envio`; correção comentada               |
| `caso_abrir`          | `matricula_id, aula_id`                  | estado do caso; contexto + etapa atual (só textos) ou fim (reflexão) ou concluído                                          |
| `caso_escolher`       | `matricula_id, aula_id, etapa_id, opcao` | confere a etapa atual; evento `caso_escolha` (rodada, etapa, opção, segura, próxima, passagem); comentário e próxima etapa |
| `caso_concluir`       | `matricula_id, aula_id`                  | só com o estado no fim; conclui a aula; eventos `caso_concluido` e `aula_concluida`                                        |

Conclusão de aula pelas ações novas: a mesma sequência do `progresso` (`index.ts:1706-1756`): upsert do progresso com
`concluida`, `aula_concluida`, `concluirSeCompleto`, `curso_concluido` e `fecharAdiada`. Extraída para uma função
(`concluirAula`) usada pelas três ações e pelo `progresso`.

**Mudanças nas existentes:**

- `progresso`: `conclusaoDaAula` sem tempo para `pdf`, `texto`, `tarefa` (§4.1); para `questionario` e `caso`,
  `progresso` só credita tempo de tela e **nunca** conclui. `tarefa` grava `tarefa_confirmada`; leitura grava
  `apostila_lida`.
- `dados`: `aulasParaAluno` manda `conteudo_texto` também para `tarefa` liberada; questionário e caso não levam
  conteúdo em `dados` (vem das ações próprias). A contagem de questões da prova (`index.ts:1148`) filtra
  `aula_id is null`.
- Prova final: `prova.ts:84-94`, `conclusao.ts:86-91` e `index.ts:2129-2133` filtram `aula_id is null`.
- `certificado`: requisitos com as aulas, as questões dos questionários e os roteiros (§8); `dados.atividades` (§9).

## 8. Requisitos e carga horária

`lib/ead-requisitos.js` e `requisitos.ts` (cópias conferidas pelo mesmo teste) passam a receber também os roteiros
dos casos (`casos`) e todas as questões (com `aula_id`):

- `CONTEUDO`: além de hoje, `tarefa` exige texto; `questionario` exige pelo menos 1 questão válida da aula
  (pergunta, 2+ alternativas, correta dentro delas); `caso` exige roteiro que passa em `validarCaso`. Todas exigem
  `duracao_seg > 0` (o tempo previsto).
- `QUESTOES` (mínimo de 5 da prova final): conta só `aula_id` vazio.
- `LASTRO`: não muda. Soma o `duracao_seg` de todas as aulas, atividades inclusive (tempo declarado, A5).

## 9. Certificado (A9)

Na emissão, `dados.atividades = { questionarios, casos, tarefas, nota_minima_modulo }` com as quantidades de aulas de
cada tipo do curso (todas concluídas, porque a conclusão do curso exige). Só entra quando a soma é maior que zero:
cursos sem atividades emitem exatamente como hoje. Faz parte do `dados` congelado e do hash.

`lib/certificado-ead.js`, frente, logo depois do aproveitamento (`:341`): "e conclusão das atividades dos módulos:
12 questionários (nota mínima de 80%), 36 estudos de caso e 55 atividades de estudo" (singular/plural e itens com
zero omitidos). O verso não muda (conteúdo programático ou aulas por módulo, que já incluem as atividades pelo
título).

## 10. Segurança e integridade (o que não pode quebrar)

- O navegador nunca recebe `correta`, `comentario` (antes do envio), `segura` ou `proxima`. O gabarito do
  questionário só vai na resposta do envio daquela tentativa.
- Quem decide nota, escolha segura, etapa atual e conclusão é o servidor; o caso não pula etapa.
- Tentativas e trilha imutáveis; escrita do progresso e das tentativas só pelo servidor.
- Gabarito e roteiro do caso só legíveis por quem tem a aba (policy restritiva); escrita com Editar.
- Prova final intacta: só questões com `aula_id` vazio, em todos os leitores.
- Isolamento por empresa em toda consulta; matrícula e aula conferidas contra a sessão.
- `zz_permissao_ead` continua sendo o último trigger BEFORE em todas as tabelas do EAD.

## 11. Testes

- **Servidor (`node --test "supabase/functions/**/\*.test.ts"`):** `caso.test.ts`(validade, com um caso linear e um
ramificado com recuperação no formato dos rascunhos; estado refeito; etapa fora de ordem; roteiro alterado →
rodada nova; opções sem campos secretos),`questionario.test.ts`(7/8 aprova e 6/8 não com 80; correção comentada
nos dois; tentativa numerada por aula; leitura com erro → 503),`regras.test.ts`(leitura e tarefa sem tempo;
questionário e caso nunca concluem pelo`progresso`), `requisitos.test.ts` (tipos novos, nas duas cópias), testes do
certificado (`atividades`só quando há), filtro`aula_id` da prova.
- **Front (`npm test --workspace=apps/web`):** `ead-caso.test.js`, `ead-atividades-importar.test.js` (módulo
  sintético com caso ramificado, questões e tarefas; casamento de módulos; problemas; reimportação pulada),
  `ead-requisitos.test.js`, `certificado-ead` (frase), `portal-previa` (ações novas) e o fim da leitura.
- Lint, `no-undef` nos arquivos alterados de `src/components`, build e `npx prettier --check` nos arquivos tocados.
- TDD nas regras puras (teste antes do código).

## 12. Produção e carga do NR-10

Cada passo só com OK explícito do Javerson.

1. `npx supabase@2.118.0 db query --linked -f supabase/migrations/0170_ead_atividades_interativas.sql`
2. `tools/smoke-ead-atividades.sql` (desfaz tudo no fim).
3. `npx supabase@2.118.0 functions deploy portal-funcionario --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt --use-api`
4. Push em `master` logo depois do passo 3 (o site novo das leituras precisa do servidor novo e vice-versa).
5. **Carga:** com o zip do pacote final de volta ao PC, conferir o formato de `data/*.json` (ajustar o leitor se
   diferir), gerar o arquivo de importação dos 12 módulos fora do repositório, com um relatório de revisão
   (contagens por módulo, casos ramificados, problemas) para o Javerson aprovar.
6. O Javerson importa pela tela no NR-10 Básico da Sinergia e da Eletro (prévia → Confirmar).
7. Conferência: consulta só de leitura (contagem de aulas por tipo e módulo, questões por questionário, roteiros
   válidos, `LASTRO`) para o Javerson rodar e me devolver.
8. Roteiro de teste com uma matrícula de teste (cadastrar um questionário e um caso, fazer como aluno, ver a trilha).
9. **Exercícios pós-vídeo (A11):** converter as 122 perguntas abertas em múltipla escolha fora do repositório, com um
   relatório de revisão por curso para o Javerson aprovar como RT; ele importa pela tela em cada curso das duas
   empresas (NR-10 SEP e Reciclagem, NR-35 e Reciclagem, NR-6, NR-1, NR-10 Básico Reciclagem); conferência só de
   leitura. Os exercícios cujo vídeo não existe mais (os `B02A…` e o piloto) ficam de fora.

## 13. Fora do escopo e avisos

- Estações de **prática presencial** do pacote (`pratica`): ficam na parte de sessões práticas que já existe (T12).
- Aviso por WhatsApp de atividades; anexos e texto do aluno; parecer do tutor (A4).
- Avisos herdados da carga de 13/10 (não mudam aqui): o caderno de atividades traz nas págs. 27–28 o "gabarito
  exclusivo do instrutor"; o material se diz "edição de avaliação" ainda não aprovada; a Eletro está como EAD 40 h e
  as duas com nota mínima 70 na prova final, enquanto o material fala em semipresencial 32 + 8 e 80%.
- `tools/ead-sync-cursos.py` não conhece os tipos novos e **não deve ser rodado** (apagaria as aulas atuais do NR-10).

## 14. Arquivos

| Onde                                          | O quê                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/0170_…sql`               | §6                                                                                                                                                      |
| `tools/smoke-ead-atividades.sql`              | §6                                                                                                                                                      |
| `supabase/functions/portal-funcionario/`      | `caso.ts`, `questionario.ts` (+ testes); `regras.ts`, `requisitos.ts`, `prova.ts`, `conclusao.ts`, `index.ts`                                           |
| `apps/web/src/lib/`                           | `ead-caso.js`, `ead-atividades-importar.js` (+ testes); `ead-requisitos.js`, `portal-previa.js`, `certificado-ead.js`, `ead-trilha.js`, `ead-dossie.js` |
| `apps/web/src/components/portal-funcionario/` | `QuestionarioPortal.jsx`, `CasoPortal.jsx` (novos); `CursoPortal.jsx`, `ApostilaPdf.jsx`                                                                |
| `apps/web/src/components/seguranca/`          | `CasoEditor.jsx`, `ImportarAtividadesDialog.jsx` (novos); `TreinamentosEadTab.jsx`, `AulaLinhaEad.jsx`, `MatriculaAuditoriaSheet.jsx`                   |
| `docs/HANDOFF-PORTAL-TREINAMENTO.md`          | seção nova com o que mudou e o roteiro de teste                                                                                                         |
