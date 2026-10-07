# Permissões do Portal de Treinamento (EAD): cursos, cadastro central, documentos e ações do RH

- **Data:** 06/10/2026. **Status:** aprovado pelo Javerson em 07/10/2026 como recomendado (P1 a P7); implementado
  na migração `0147_permissoes_ead.sql` (ver "Implementação" no fim).
- **Tarefa:** T33 do `docs/HANDOFF-PORTAL-TREINAMENTO.md` (FR-12, M2), com o escopo ampliado pelo conflito C8 do
  acompanhamento de 05/10: (a) a propagação do cadastro central (`0131`) e (b) os documentos do portal (`5d2655f`).
- **Base:** branch `feat/portal-treinamento` em `a6bccff`. Os números de linha citados são desse commit.
- **Aceite da T33:** este spec com o OK do Javerson. A implementação vem depois, em outra tarefa, com migração.
- **Revisão 1 (07/10/2026):** a ação `status` do `funcionario-acesso` passa a aceitar também quem só tem Treinamentos
  EAD → `matricular`, porque o "Avisar atrasados" da aba depende dela (§3, §7, §8, §9 e P3).
- **Revisão 2 (07/10/2026):** quem só matricula **não** cria o acesso ao portal na recomendação: o `criar` devolve o
  login (CPF) e a senha provisória, e com ela a pessoa lê os documentos do funcionário. Passa a haver três caminhos
  para a P3 (§7.1), o risco R9 e a decisão `decidirCriar`, que também deixa a ordem "409 antes do 403" sob teste.

---

## 1. Problema

A tela mostra a aba Treinamentos a quem tem qualquer função de "Segurança do Trabalho → Funcionários"
(`pages/SegurancaTrabalho.jsx:1140` e `:1174`) e, dentro dela, não confere mais nada. No banco, as tabelas do EAD só
comparam `empresa_id` (policy `tenant_isolation`, ALL). Resultado: **qualquer usuário logado da empresa** (Compras,
Estoque, Financeiro...) faz pela API, sem abrir a aba:

| #   | O que consegue fazer                                                                                                                                                                                                                                                                    | Caminho                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| H1  | Mudar o curso: nota mínima, tentativas, intervalo, RT, instrutor, imagens de assinatura, modalidade, "Publicado"                                                                                                                                                                        | `treinamento_curso` (UPDATE)                                               |
| H2  | Mudar aulas e questões, inclusive o gabarito (`correta`)                                                                                                                                                                                                                                | `treinamento_aula`, `treinamento_questao`                                  |
| H3  | Trocar ou apagar o vídeo, a apostila ou a legenda de uma aula sem tocar no banco (a aula segue apontando para o mesmo caminho)                                                                                                                                                          | Storage, bucket `treinamentos` (policies da `0108`)                        |
| H4  | **(a)** Editar um treinamento do cadastro central e, com isso, reescrever nome, código, carga, validade e conteúdo programático dos cursos EAD vinculados, ou despublicá-los (desativando o modelo). O trigger da `0131` roda com as permissões de quem edita (`0131:16-55` e `:70-91`) | `treinamento` (UPDATE do modelo)                                           |
| H5  | Matricular e remover matrícula, inclusive com certificado válido (a trava da T20 está só na tela, `lib/ead-gestao.js:77-81`)                                                                                                                                                            | `treinamento_matricula`                                                    |
| H6  | Somar tentativa extra sem evento na trilha e sem a trava de `tentativas_extras_vistas` (a tela já usa o servidor desde a T18, mas a `0130:64` ainda libera a coluna)                                                                                                                    | `treinamento_matricula` (UPDATE)                                           |
| H7  | Revogar certificado sem evento na trilha e sem aviso ao aluno (a tela já usa o servidor; a `0119` ainda aceita a revogação por UPDATE)                                                                                                                                                  | `treinamento_certificado` (UPDATE)                                         |
| H8  | Responder dúvida como se fosse o tutor                                                                                                                                                                                                                                                  | `treinamento_duvida` (UPDATE)                                              |
| H9  | Ler o gabarito (`treinamento_questao.correta` e `treinamento_tentativa.prova[].correta`, gravado em `portal-funcionario/index.ts:1281`) e a trilha com IP e dispositivo do aluno                                                                                                        | SELECT                                                                     |
| H10 | **(b)** Publicar no portal de um funcionário qualquer arquivo da pasta da empresa (de qualquer bucket: o portal assina tudo que passa no `refDaEmpresa`) ou retirar um documento publicado                                                                                              | `funcionario.documentos_rh_anexos` (UPDATE, `DocumentosPortalCard.jsx:55`) |
| H11 | Liberar tentativa e revogar certificado pelo servidor com a permissão emprestada da Ficha ("Funcionários → editar", `funcionario-acesso/index.ts:67-68`)                                                                                                                                | `funcionario-acesso`                                                       |

Há também uma **perda de dado** ligada a (b), sem ataque nenhum: o formulário "Edição completa" do funcionário salva
sozinho o cadastro inteiro, inclusive `documentos_rh_anexos` como foi carregado (`SegurancaTrabalho.jsx:385-402`). Se
um PDF foi publicado pela Ficha depois de o formulário abrir, o salvamento automático o apaga (ou devolve um que foi
retirado). A trava por `updated_at` do cartão só protege a gravação do próprio cartão.

## 2. Objetivo e fora do escopo

**Objetivo:** cada ação do RH no EAD tem permissão própria, e o banco (ou o servidor) confere essa permissão em todo
caminho: tela, API e propagação do cadastro central. A tela só espelha.

**Fora do escopo** (anotar como pendências do RH em geral, não do EAD):

- `funcionario` como um todo: salário, dados bancários e documentos do RH continuam graváveis pela API por qualquer
  usuário da empresa (`tenant_isolation` ALL). Aqui só se trata o pedaço do portal dentro de `documentos_rh_anexos`.
- `treinamento` (cadastro central e cópias das funções) além do efeito nos cursos EAD.
- A função `enviarWhatsApp` (qualquer usuário manda mensagem) e o bucket `assinaturas` (ver risco R8).
- Módulos do plano do SaaS, T38/D16.

## 3. As permissões

Nova aba **"Treinamentos EAD"** no módulo "Segurança do Trabalho" de `ESTRUTURA_PERMISSOES`
(`components/shared/PermissoesGranularesEditor.jsx:84`):

| Função                | O que libera                                                                                                                                                                                                                                                         | Onde é conferida                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `visualizar`          | Ver a aba (cursos, matrículas, trilha, dossiê, vencimentos, dúvidas, "Ver como aluno"); ler questões, tentativas e trilha                                                                                                                                            | tela + leitura §4.4                                         |
| `editar`              | Criar curso; alterar dados do curso, aulas, questões, projeto pedagógico, imagens de assinatura, modalidade e vínculo com o cadastro central; enviar ou trocar arquivo de aula; alterar no cadastro central um treinamento que tem curso EAD vinculado               | trigger + Storage                                           |
| `publicar`            | Ligar e desligar "Publicado"; excluir curso; desativar no cadastro central um treinamento com curso EAD vinculado                                                                                                                                                    | trigger                                                     |
| `matricular`          | Matricular (por funcionário, por função, renovar), avisar o aluno que já tem acesso ao portal (por linha e "Avisar atrasados"; consulta quem já tem acesso, só `ativo`; criar o acesso fica em Funcionários → Editar, P3) e remover matrícula sem certificado válido | trigger + `funcionario-acesso` (`status`; `criar` só o 409) |
| `liberar_tentativa`   | Liberar tentativa extra                                                                                                                                                                                                                                              | `funcionario-acesso`                                        |
| `revogar_certificado` | Revogar certificado                                                                                                                                                                                                                                                  | `funcionario-acesso`                                        |
| `responder_duvidas`   | Responder dúvida (tutor)                                                                                                                                                                                                                                             | trigger                                                     |

Regras gerais:

- **Admin, dono (`is_owner`) e super admin** passam em tudo, como no `temPermissao` da tela e no
  `temPermissaoServidor` do servidor. Se hoje só Admin e dono usam o EAD, ninguém perde nada na troca (a conferência
  da §9 mostra quem perderia).
- **Ler é ter qualquer função da aba:** quem tem só `editar` vê o que edita. Assim a leitura não depende de lembrar de
  marcar `visualizar`.
- **Acesso ao portal** (criar, redefinir, desativar, ver situação) continua em "Funcionários", porque fica na Ficha e o
  portal também mostra documentos e ciências: quem tem a senha provisória entra no portal e lê contracheque, folha de
  ponto, documentação e advertências do funcionário (R9). Única mudança proposta: quem tem Treinamentos EAD →
  `matricular` consulta a situação dele (`status`, só com `ativo`) e avisa quem já tem acesso, para o "Avisar
  atrasados" e o aviso por linha funcionarem. **Criar o acesso não entra**, a menos que o Javerson escolha outro
  caminho na P3 (§7.1).
- **Documentos do portal** (contracheque, folha de ponto, documentação) vão para a aba "RH": `criar` publica o PDF e
  `deletar` retira (P2).
- **T12 (prática presencial, ainda não feita):** as sessões entram em `editar`; o lançamento de presença e resultado
  ganha a função `avaliar_pratica` quando a T12 for feita (fica reservado aqui, sem implementar).
- `ESTRUTURA_PERMISSOES` tem uma segunda cópia em `components/saas/PermissoesTab.jsx:25` (perfis do SaaS), que já está
  diferente ("Documentação da Empresa" tem `alertas` e `exportar` só lá). A aba nova entra nas duas; melhor ainda,
  `PermissoesTab.jsx` passa a importar a canônica (correção técnica, sem mudança de tela).

Alternativas descartadas:

- **Três abas** (Cursos, Matrículas, Dúvidas): mais granular, mas são três grupos de caixas para duas empresas que hoje
  usam só Admin. Nada que a lista de funções acima não resolva.
- **Módulo próprio "Treinamentos EAD"**: mexe no plano do SaaS (`modulos_liberados`), no menu e na tela de assinatura.
- **CRUD padrão** (`criar`, `editar`, `deletar`): não separa publicar e revogar, que são os atos com efeito legal.

## 4. Como o banco confere

Desenho geral: **função SQL que lê `usuario_empresa.permissoes` + triggers nas tabelas do EAD**, mantendo as ações que
já são do servidor (`funcionario-acesso`) com o `temPermissaoServidor`. A escrita continua pelo SDK como hoje.

Alternativas do desenho geral:

| Desenho                                                                                  | A favor                                                                                           | Contra                                                                                                               |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **S1 (recomendado):** função SQL + triggers; ações com efeito colateral no servidor      | Pega todo caminho (tela, API, propagação da `0131`); tela quase não muda; padrão da `0119`/`0130` | Duas implementações da regra (SQL e TypeScript): exige tabela de casos comum (§9)                                    |
| S2: toda escrita do RH por Edge Function ou RPC; tabelas só leitura para `authenticated` | Uma porta só                                                                                      | Reescreve todo o salvamento da tela (curso, aula com reordenação, questão, matrícula em lote); muito maior que a T33 |
| S3: só policies de RLS por comando                                                       | Sem trigger                                                                                       | RLS não sabe qual coluna mudou: não separa publicar de editar; UPDATE barrado vira "0 linhas", sem mensagem          |

### 4.1 Função `public.tem_permissao(p_modulo, p_aba, p_funcao)`

Espelho em SQL do `temPermissaoServidor` (`_shared/conector/acesso.ts:35`), `security definer`, `stable`,
`set search_path = public`:

1. `chamador_eh_servidor()` ou `current_user_is_super_admin()` → `true`.
2. Sem login (`auth.uid()` nulo ou `role` diferente de `authenticated`) → `false`.
3. Vínculo do chamador: `usuario_empresa` com `lower(usuario_email) = current_user_email()`,
   `empresa_id = current_empresa_id()`, `ativo = true` e `deleted_at` nulo, o mais antigo (o mesmo critério do
   `vinculoDoChamador` do `funcionario-acesso`). Sem vínculo → `false`.
4. `perfil = 'Admin'` ou `is_owner` → `true`.
5. `permissoes` como objeto, texto JSON ou texto JSON duas vezes (o `objetoJson` do TypeScript); inválido vira `{}`.
   Depois, as mesmas três regras: só módulo = alguma aba com alguma função; módulo e aba = aba `true` ou alguma função
   da aba; módulo, aba e função = aquela função `true`.

`grant execute` a `authenticated` e `service_role` (ela só revela as permissões do próprio chamador). A permissão é lida
a cada comando, não do token: mudar a permissão em Configurações → Usuários vale na próxima ação, sem novo login.

### 4.2 Trigger `zz_permissao_ead`

Uma função só, `before insert or update ... for each row`, `security definer` (como as da `0119` e da `0130`); servidor
e super admin passam. O nome começa com `zz_` de propósito: o Postgres dispara os triggers BEFORE em ordem alfabética,
e este tem de rodar **depois** do `sincronizar_modelo` (`0131`) e do `set_updated_at`, para ver a linha como ela vai ser
gravada. É isso que pega a propagação do cadastro central (a).

| Tabela                                    | Operação                                             | Exige                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `treinamento_curso`                       | INSERT                                               | `editar` (e `publicar`, se nascer publicado)                                                           |
|                                           | UPDATE só de `ativo`                                 | `publicar`                                                                                             |
|                                           | UPDATE de outras colunas                             | `editar` (e `publicar`, se `ativo` também mudou)                                                       |
|                                           | UPDATE de `deleted_at` (excluir; a tela não oferece) | `editar` e `publicar`                                                                                  |
| `treinamento_aula`, `treinamento_questao` | INSERT e UPDATE (inclusive ordem e exclusão lógica)  | `editar`                                                                                               |
| `treinamento_matricula`                   | INSERT                                               | `matricular`                                                                                           |
|                                           | UPDATE de `deleted_at` (remover)                     | `matricular`; e recusa se há certificado não revogado (a regra do `podeRemoverMatricula` vai ao banco) |
| `treinamento_duvida`                      | UPDATE (resposta)                                    | `responder_duvidas`                                                                                    |

A comparação ignora `updated_at`. O erro é `42501` com o nome que aparece no editor de permissões, por exemplo
"Sem permissão: Segurança do Trabalho → Treinamentos EAD → Publicar". Quando a mudança vem da propagação
(`pg_trigger_depth() > 1`), a mensagem explica a origem: "Este treinamento do cadastro central tem curso EAD vinculado.
Alterar nome, código, carga, validade ou conteúdo exige Treinamentos EAD → Editar; desativar exige também Publicar."

### 4.3 O que fecha nas travas da `0119` e da `0130`

As duas funções são recriadas na migração nova (migração antiga nunca é editada):

- **Matrícula:** `tentativas_extras` sai da lista do que a empresa pode mudar (`0130:64`). Só o `funcionario-acesso`
  soma, com evento na trilha e conferência de `tentativas_extras_vistas` (T18). A tela já não grava a coluna.
- **Certificado:** fora do servidor e do super admin, nenhum UPDATE. A revogação passa só pelo `funcionario-acesso`, que
  grava o evento e avisa o aluno. Sai a policy `tenant_revogar` (`0103:151`) e o `grant update` de `authenticated`.

### 4.4 Leitura do gabarito e da trilha

Policy **restritiva** de SELECT (`as restrictive`, soma-se às que existem) em `treinamento_questao`,
`treinamento_tentativa` e `treinamento_evento`:
`using ((select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD')))`. O `(select ...)` faz o Postgres
calcular uma vez por consulta, não por linha.

Quem lê essas tabelas hoje: `TreinamentosEadTab.jsx`, `MatriculaAuditoriaSheet.jsx` e `exportarDossieEad.js`, todos
dentro da aba. `FichaFuncionarioSheet.jsx` e `TSTTab.jsx` leem só curso, matrícula e certificado, que continuam abertos
à empresa (a situação do treinamento não é segredo). O cron da `0138` e o portal usam service role e não mudam. P5.

### 4.5 Arquivos das aulas (bucket `treinamentos`)

A `0108` deixa qualquer usuário da empresa incluir, sobrescrever e apagar objetos na pasta dela. Entram policies
restritivas em `storage.objects` para INSERT, UPDATE e DELETE:
`bucket_id <> 'treinamentos' or public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD', 'editar')`. Como a
policy restritiva vale para todos os buckets, a primeira condição resolve os outros sem custo. Os nomes são diferentes
dos que o `ensure_tenant_bucket` recria, então reaplicar aquela função não as apaga. A leitura não muda (o aluno recebe
URL assinada do servidor).

## 5. (a) Cadastro central → curso EAD

| Alternativa                                                                                                                                              | A favor                                                                                                                                                                                                 | Contra                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1 (recomendada): a trava fica no curso.** A propagação da `0131` continua como está; o trigger da §4.2 vê o resultado e exige `editar` (e `publicar`) | Uma regra só, para todo caminho; sem mudança na `0131`. Para quem usa a tela não muda nada: Configurações → Funções só aparece para Admin (`Configuracoes.jsx:1028`), e Admin passa. Só a API é barrada | Quem tiver só o cadastro central (no futuro) e não o EAD não consegue editar um treinamento com curso vinculado; a mensagem diz por quê                                                                                                                                 |
| A2: propagação `security definer` e só Admin edita o modelo central (trigger em `treinamento`)                                                           | Espelha a tela de Configurações                                                                                                                                                                         | `treinamento` também é gravada pela Segurança do Trabalho (cópias das funções, datas do certificado em `TSTTab.jsx:120` e `SegurancaTrabalho.jsx:2500`, `ImportarTreinamentosZip`, `OrdenServicoCEMIGModal`): separar modelo de cópia em cada caminho é maior que a T33 |
| A3: a propagação não mexe no curso EAD; o curso fica "modelo mudou, revisar" até o RH do EAD aceitar                                                     | O RH do EAD decide cada mudança                                                                                                                                                                         | Muda a regra de negócio da `0131` e pede tela nova                                                                                                                                                                                                                      |

Editar um treinamento central **sem** curso EAD vinculado segue como hoje. P4 trata o desativar.

## 6. (b) Documentos do portal

| Alternativa                                                                                                         | A favor                                                                                                                     | Contra                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B2 (recomendada): duas RPC `security definer` + trigger que protege os itens do portal**                          | Sem deploy de função; gravação atômica (sem ler e regravar a lista); usa a mesma `tem_permissao`; nenhum dado muda de lugar | A regra fica em SQL: teste por smoke, não por `node --test`                                                                                                                                              |
| B1: ações `publicar_documento` e `retirar_documento` no `funcionario-acesso`                                        | Regra testável em TypeScript; junto do acesso ao portal                                                                     | Para ser atômica, ainda precisa de uma função SQL só do servidor; exige deploy                                                                                                                           |
| B3: tabela própria `funcionario_documento_portal` (RLS, trigger de permissão, histórico de quem publicou e retirou) | O modelo mais limpo; acaba o conflito com `documentos_rh_anexos`                                                            | Migrar os itens existentes (dado real: decisão), mudar o `portal-funcionario` (deploy) e o cartão; o PDF sai do histórico "Documentos RH" da ficha. Fica como caminho se o portal ganhar mais documentos |

Detalhe da B2:

- `portal_documento_publicar(p_funcionario_id, p_tipo, p_competencia, p_ref, p_nome_arquivo)` e
  `portal_documento_retirar(p_funcionario_id, p_documento_id)`, no padrão da `0110`: `set search_path = public`,
  `revoke` de `public`/`anon`/`authenticated`, `exigir_empresa_do_chamador(<empresa do funcionário>)` e `grant execute`
  a `authenticated` e `service_role`.
- Permissão: `tem_permissao('Segurança do Trabalho', 'RH', 'criar')` para publicar e `'deletar'` para retirar (P2).
- Publicar confere: funcionário vivo da empresa; `p_ref` só `contratacao/<empresa>/...`, sem `.`, `..` ou `//` e fora de
  `recibos/`; o objeto existe em `storage.objects` com `mimetype` `application/pdf`; tipo em `documentacao`,
  `contracheque`, `folha_ponto`; competência `AAAA-MM` quando o tipo pede (a mesma regra de `validarPdfPortal`,
  `lib/portal-documentos.js:14`). O banco monta o item (`id`, `origem`, `funcionario_id`, `publicado`, `data_upload` =
  `now()`, e o novo `publicado_por` com o e-mail do token) e grava num UPDATE só:
  `documentos_rh_anexos = jsonb_to_array(documentos_rh_anexos) || jsonb_build_array(item)`.
- Retirar tira o item pelo `id` no mesmo UPDATE (o arquivo fica no Storage, como hoje).
- Trigger `zz_documentos_portal` em `funcionario` (`before update of documentos_rh_anexos`, **sem** `security definer`)
  compara só os itens do portal (`origem = 'portal_funcionario'`) da linha antiga e da nova:
  - iguais → passa;
  - `current_user` diferente de `authenticated` (service role, dono do banco ou dentro da RPC `security definer`) →
    passa. Isso não depende de variável de sessão que alguém possa esquecer de ligar;
  - só os itens do portal mudaram e nada mais na linha (nem as outras colunas, nem os outros anexos, fora
    `updated_at`) → `42501` "Publique ou retire o PDF pelo cartão PDFs do Portal do Funcionário". É o que faz a chamada
    direta à API ou o cartão antigo entre a migração e o push; como nada mais mudou, recusar não perde dado;
  - mudou mais alguma coisa (o salvamento automático do formulário inteiro com a lista velha) → mantém os itens do
    portal da linha antiga e grava o resto. Corrige a perda de dado da §1 sem derrubar o salvamento automático, que
    hoje só escreve o erro no console (`SegurancaTrabalho.jsx:398`).
- Nenhuma linha existente é alterada e nada muda de lugar: os itens já publicados continuam valendo.

## 7. (c) Ações do RH no servidor (`funcionario-acesso`)

- Função pura nova em `funcionario-acesso/regras.ts`: `permissaoDaAcao(acao)` devolve duas listas de permissões (basta
  uma de cada lista):
  - `entrar`: o portão que hoje fica em `index.ts:376-378` e vale antes de qualquer ação. Sem ele, 403 "Sem permissão
    para gerenciar o acesso ao Portal do Funcionário".
  - `agir`: o que a ação exige de fato (hoje o `podeEditar` de `:380`, com a mensagem de `MENSAGEM_SEM_EDICAO`).
  - As duas existem para manter o que já funciona: em `criar`, quem entra mas não age ainda recebe o 409
    `JA_TEM_ACESSO` antes do 403 (é assim que `avisarNoPortal` segue quando o funcionário já tem acesso, como no
    "Avisar" da Ficha).

| Ação                  | Entrar                                                            | Agir                                               |
| --------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| `status`              | Funcionários (qualquer função) ou Treinamentos EAD → `matricular` | o mesmo que entrar                                 |
| `criar`               | Funcionários (qualquer função) ou Treinamentos EAD → `matricular` | Funcionários → `editar`, como hoje (P3 e §7.1)     |
| `redefinir`, `ativo`  | Funcionários (qualquer função)                                    | Funcionários → `editar`, como hoje                 |
| `liberar_tentativa`   | Treinamentos EAD → `liberar_tentativa`                            | o mesmo que entrar (hoje: Funcionários → `editar`) |
| `revogar_certificado` | Treinamentos EAD → `revogar_certificado`                          | o mesmo que entrar (hoje: Funcionários → `editar`) |

- `index.ts` troca o `MODULO`/`ABA` fixos (`:67-68`) e a conferência única de `:370-383` pela decisão de
  `permissaoDaAcao`. `MENSAGEM_SEM_EDICAO` (`regras.ts:15-21`) passa a ter as cinco ações de escrita (hoje só tem as
  duas de matrícula; `criar`, `redefinir` e `ativo` usam o `semEdicao()` fixo de `index.ts:382-383`, `:462` e `:495`),
  cada mensagem citando a permissão que falta. A de `criar` diz o que fazer: "Este funcionário ainda não tem acesso ao
  portal. Criar o acesso exige Segurança do Trabalho → Funcionários → Editar."
- **A ordem "409 antes do 403" fica sob teste:** função pura `decidirCriar({ entra, age, jaTemAcesso })` em `regras.ts`,
  que devolve `"conflito"` (409 `JA_TEM_ACESSO`), `"sem_permissao"` (403) ou `"criar"`. A ordem é fixa: sem `entra`,
  403; com acesso já criado, 409 (mesmo para quem não age); sem `age`, 403; senão cria. Hoje a ordem só existe no
  `index.ts:456-462`, que o `node --test` não importa; sem a função, mudar essa ordem quebraria o "Avisar" da Ficha
  (para quem só vê Funcionários) e o aviso por linha da aba (para quem só matricula) sem nenhum teste falhar.
- **Por que `status` também aceita a aba nova:** o "Avisar atrasados" da aba Treinamentos chama `status`
  (`AvisoAtrasadosDialog.jsx:90-91`) para saber quem já tem acesso ao portal (o lote só usa `funcionario_id` e `ativo`,
  `lib/ead-aviso-matricula.js:159-176`). Sem isso, quem só recebe a aba nova leva 403 e o diálogo mostra "Não foi
  possível conferir o acesso ao portal". Como `status` devolve o login (o CPF) e o último acesso de todos os
  funcionários da empresa, quem entra só pela aba nova recebe a lista **recortada**: só `funcionario_id` e `ativo`
  (função pura `recortarAcessosParaEad`). Super admin e quem tem Funcionários seguem recebendo a lista inteira. Só
  `matricular` entra: quem tem apenas `visualizar` não vê o botão de avisar e não precisa do `status`. A chamada de
  `SegurancaTrabalho.jsx:350` (coluna de acesso da lista de funcionários) segue só avisando no console quando vier 403.
- **Por que `criar` também deixa entrar quem só matricula, mas não o deixa agir:** é o botão "Avisar" da linha
  (`MatriculasEadCard.jsx:611-616` → `TreinamentosEadTab.jsx:1167-1170` → `avisarNoPortal`) que chama `criar`, e não o
  ato de matricular (matricular só grava `treinamento_matricula`, `TreinamentosEadTab.jsx:1143-1157`). Para quem já tem
  acesso, o 409 `JA_TEM_ACESSO` faz o aviso sair só com o link, sem senha. Se o funcionário ainda não tem acesso,
  criá-lo entrega login e senha a quem chamou: ver §7.1.

### 7.1 Criar o acesso ao portal: quem pode (P3)

O `criar` devolve a quem chamou o login (o CPF, ou o `usuario` do corpo) e a senha provisória (`index.ts:491`), e o
servidor não confere se o funcionário tem matrícula. Com essa senha, a pessoa faz o primeiro acesso ao portal (a senha
provisória dispensa a atual na troca, `portal-funcionario/index.ts:532-566`) e passa a ver contracheque, folha de ponto,
documentação e advertências do funcionário (`:586-596`, `documentos.ts:42-60`). Esses PDFs podem estar publicados antes
de o funcionário ter acesso, porque o cartão da Ficha não depende dele (`FichaFuncionarioSheet.jsx:315-325`), e são os
documentos que a §6 põe atrás de RH → `criar`/`deletar`. O funcionário, por sua vez, fica sem entrar até alguém com
Funcionários → `editar` redefinir a senha (R9). Portanto, dar o `criar` a quem só matricula **é dar a leitura desses
documentos**, não só uma conveniência. Três caminhos:

| Caminho                                                                          | O que muda                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | A favor                                                                                                                                | Contra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1 (recomendado): criar o acesso só com Funcionários → `editar`, como hoje**   | `criar` entra para quem tem a aba nova (só para o 409), mas age só com Funcionários → `editar`. Quem só matricula avisa quem já tem acesso (mensagem sem senha) e consulta o `status` recortado. Sem acesso, leva o 403 com a mensagem do §7                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Nenhuma credencial na mão de quem só matricula; nada de código além de `permissaoDaAcao` e `decidirCriar`; nada muda para quem já cria | Quem só matricula não cria o acesso: pede a alguém com Funcionários → `editar` (quem cuida da Ficha tem). O "Avisar atrasados" já pula quem não tem acesso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| C2: quem só matricula cria, e a senha vai só ao WhatsApp do funcionário          | Em `criar`, quem não tem Funcionários → `editar` mas tem Treinamentos EAD → `matricular` cai numa terceira saída: o servidor confere o destino antes (`destinoDoAviso`: funcionário ativo, com telefone válido), cria o acesso com o CPF (ignora o `usuario` do corpo), manda ele mesmo a mensagem com login e senha (`enviarWhatsAppTexto`, texto fixo do servidor) e responde só `{ acesso_criado, enviado }`, sem `usuario` nem `senha_provisoria`. Se o envio não sai (sem telefone, canal não configurado, falha, tempo esgotado), apaga o acesso que acabou de criar e recusa, pedindo alguém com Funcionários → `editar`. O evento `acesso_criado` só é gravado depois do envio e leva `detalhe.via = "matricular"` | Dá a conveniência e a senha só chega ao dono do telefone; nunca fica acesso com senha que ninguém conhece                              | Código novo no servidor (envio, desfazer, terceira saída de `decidirCriar`) e a URL pública do portal no servidor (hoje ele devolve só `url_path`); sem telefone ou sem canal, não cria; envio que estoura o tempo mas chega entrega uma senha de acesso já apagado (o funcionário não entra e alguém recria). A tela também muda (§8). **Hoje o C2 não protege:** qualquer usuário da empresa troca `funcionario.telefone` pela API (RLS `tenant_isolation` ALL, sem trava de coluna, §2); quem só matricula poria o próprio número e receberia a senha. O C2 só vale com uma trava no telefone (ex.: trigger que exija Funcionários → `editar` para mudar `telefone`, ou o servidor recusar quando o telefone mudou depois do último evento do acesso) |
| C3: quem só matricula cria e recebe a senha, só de funcionário que tem matrícula | Uma condição a mais no `criar`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Pouco código                                                                                                                           | **Não fecha**: quem matricula pode matricular qualquer funcionário e, em seguida, criar o acesso dele. Descartado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Recomendação: **C1**. É o único que fecha o problema sem código além do que a §7 já pede, e o custo é pequeno: o RH
que cuida da Ficha já tem Funcionários → `editar`. Se aparecer um perfil que só matricula e precisa criar o acesso, o
C2 só entra depois de uma trava no telefone do funcionário (ver o "Contra" do C2), como a terceira saída de `decidirCriar`. Redefinir a senha e desativar seguem
exigindo Funcionários → `editar`, nos três caminhos.

## 8. Tela (espelho; quem protege é o banco)

- Lib pura `apps/web/src/lib/ead-permissoes.js`, com teste: `permissoesEad(temPermissao)` devolve um objeto com
  `visualizar`, `editar`, `publicar`, `matricular`, `liberarTentativa`, `revogarCertificado` e `responderDuvidas`.
- `SegurancaTrabalho.jsx:1140` e `:1174`: a aba Treinamentos aparece para quem tem a aba nova (qualquer função), não
  mais para quem tem Funcionários.
- `TreinamentosEadTab.jsx`: os botões que a pessoa não pode usar ficam escondidos. A chave "Publicado" fica visível e
  desabilitada, com a dica "Publicar exige a permissão Treinamentos EAD → Publicar" (quem edita precisa saber por que
  o curso não publica).
- `MatriculaAuditoriaSheet.jsx`: "Liberar tentativa" e "Revogar" só com a função de cada um. `DuvidasTutorCard.jsx`:
  "Responder" só com `responder_duvidas`.
- `MatriculasEadCard.jsx`: o botão "Avisar atrasados" (`:283`) e o aviso por linha (`:611-614`) só aparecem com
  `matricular`. O diálogo chama `status` (`AvisoAtrasadosDialog.jsx:90-91`) e o aviso por linha chama `criar` (pelo
  `avisarNoPortal`); as duas ações aceitam quem só tem a aba nova (§7), e o `status` dele vem recortado.
- Quem tem `matricular` mas não tem Funcionários → `editar` (C1, recomendado na P3) avisa só quem já tem acesso. A dica
  do botão ("cria o acesso ao portal se ainda não tiver", `MatriculasEadCard.jsx:611-613`) e o motivo `sem_acesso` do
  lote ("o botão do WhatsApp da linha... cria o acesso e envia a senha", `lib/ead-aviso-matricula.js:111-112`) passam a
  mandar procurar quem tem Funcionários → Editar. Com o C2, o `avisarNoPortal` reconhece a resposta sem
  `senha_provisoria` e o `decidirAvisoAoRH` ganha a situação "enviado pelo servidor" (toast "Acesso criado: o
  funcionário recebeu o usuário e a senha no WhatsApp"), sem abrir a janela da senha.
- `DocumentosPortalCard.jsx`: passa a chamar as RPC; enviar com RH → `criar`, retirar com RH → `deletar`; sem nenhuma
  das duas, só a lista.
- Erro `42501` do banco vira toast com a mensagem como veio (já é o padrão do `gravar` da aba). Em Configurações, o erro
  da propagação (§5) também aparece como veio.

## 9. Plano de migração e de produção

**Migração** `0147_permissoes_ead.sql` (próximo livre desta branch em 07/10: `0134` a `0144` já usados e `0145`/`0146`
reservados ao spec da T38; o `master` tem até `0133`). Idempotente, cabeçalho com o porquê, sem UPDATE de dado real,
`select 'ok' as res;` no fim, e no cabeçalho o bloco "para desfazer" (`drop trigger`, `drop policy`, funções da `0119`
e da `0130` como eram):

1. `tem_permissao` (§4.1).
2. `zz_permissao_ead` em `treinamento_curso`, `treinamento_aula`, `treinamento_questao`, `treinamento_matricula` e
   `treinamento_duvida` (§4.2).
3. `matricula_andamento_so_servidor` e `certificado_so_revogacao` recriadas; `drop policy tenant_revogar`;
   `revoke update` do certificado (§4.3).
4. Policies restritivas de leitura (§4.4) e do Storage (§4.5).
5. RPC `portal_documento_*` e trigger `zz_documentos_portal` (§6). Se o Javerson preferir aplicar em separado, este
   item vira a `0148`.

**Arquivos de apoio** (na implementação):

- `tools/conferir-permissoes-ead.sql`, só leitura: por empresa, os vínculos ativos que não são Admin nem dono, têm
  Funcionários e não têm a aba nova (perderiam a aba Treinamentos); vínculos com `ativo` nulo (a função exige
  `ativo = true`); e quantos PDFs estão publicados no portal. Sem UUID no arquivo.
- `tools/smoke-permissoes-ead.sql`, em `begin; ... rollback;`, no modelo do `tools/smoke-ead-trilha.sql` (empresa
  escolhida na hora, e-mail sintético, token simulado com `set_config('request.jwt.claims', ...)` e `set local role`).

**Ordem em produção** (o Javerson roda):

1. `supabase db query --linked -f tools/conferir-permissoes-ead.sql` (leitura).
2. Fase 1, se a conferência listar alguém: push só do editor de permissões com a aba nova (nada muda de comportamento)
   e marcar a aba e a função de RH para essas pessoas. Se a lista vier vazia (só Admin e dono usam o EAD), a fase 1 vai
   junto com a 2.
3. Deploy do `funcionario-acesso` (`--no-verify-jwt`).
4. Aplicar a migração.
5. Push da fase 2 (tela).
6. Smoke e roteiro manual (seção 7 do handoff) com quatro usuários de teste: sem a aba, só com `visualizar`, só com
   Treinamentos EAD → `matricular` (sem Funcionários) e com tudo.

Entre os passos 3 e 5, a tela antiga continua funcionando para Admin e dono. O cartão antigo de documentos recebe o
erro claro da §6 (não perde o PDF em silêncio) até o push.

**Testes da implementação:**

- `node --test`, `permissaoDaAcao` (RED/GREEN): uma linha de teste por célula da tabela da §7, com estes casos:
  - só Funcionários → `visualizar`: entra em `status` e em `criar` (e não age em `criar`, então recebe o 409 quando o
    funcionário já tem acesso e o 403 quando não tem), entra em `redefinir`, e não entra em `liberar_tentativa` nem em
    `revogar_certificado`;
  - só Treinamentos EAD → `matricular`: entra e age em `status`, **entra em `criar` mas não age** (C1: só recebe o 409;
    sem acesso, o 403), e não entra em `redefinir`, `ativo`, `liberar_tentativa` nem `revogar_certificado`;
  - só Treinamentos EAD → `visualizar` (ou só `liberar_tentativa`): não entra em `status` nem em `criar`;
  - Funcionários → `editar` sem a aba nova: não entra em `liberar_tentativa` nem em `revogar_certificado`.
- `node --test`, `decidirCriar`: sem `entra`, `"sem_permissao"` em qualquer combinação; entra, não age e já tem acesso,
  `"conflito"`; entra, não age e não tem acesso, `"sem_permissao"`; entra, age e já tem acesso, `"conflito"`; entra,
  age e não tem acesso, `"criar"`. Com o C2, mais os casos da terceira saída e do desfazer quando o envio falha.
- `node --test`, `recortarAcessosParaEad`: devolve só `funcionario_id` e `ativo` (sem `usuario`, `ultimo_acesso`,
  `bloqueado` nem `primeiro_acesso_pendente`); quem tem Funcionários ou é super admin recebe a lista inteira.
- `node --test`, `acesso.test.ts`: a tabela de casos de permissão que o smoke SQL repete igual (sem vínculo, vínculo
  inativo, Admin, dono, aba como `true`, função `true`/`false`, permissões em texto JSON e em texto duas vezes, JSON
  inválido).
- Vitest: `ead-permissoes.js`.
- Roteiro manual do usuário só com Treinamentos EAD → `matricular` (sem Funcionários): "Avisar atrasados" abre, lista os
  atrasados e não mostra "Não foi possível conferir o acesso ao portal"; o "Avisar" da linha de quem já tem acesso envia
  o link sem senha; o "Avisar" da linha de quem ainda não tem acesso mostra a mensagem que manda procurar quem tem
  Funcionários → Editar e **não cria o acesso** (conferir na Ficha: continua "Sem acesso"); a chamada direta de `criar`
  para esse funcionário recebe 403 sem `usuario` nem `senha_provisoria` na resposta; Redefinir senha e Desativar (Ficha)
  continuam fora do alcance. Com só `visualizar`, o botão "Avisar atrasados" não aparece e a chamada direta de `status`
  recebe 403.
- Smoke SQL: cada linha da tabela da §4.2; propagação do cadastro central com e sem `editar`/`publicar`;
  `tentativas_extras` e revogação pelo cliente recusadas; remoção de matrícula com certificado válido recusada; questão,
  tentativa e evento invisíveis sem a aba; as duas RPC; salvamento do formulário inteiro com a lista velha preserva o
  PDF; UPDATE só do item do portal recusado.

## 10. Riscos

- **R1 — Perder a aba no dia da troca.** Quem usa o EAD sem ser Admin ou dono perde a aba até ganhar a permissão nova.
  Mitigação: a conferência e a fase 1 da §9.
- **R2 — Ordem dos triggers.** Um trigger futuro em `treinamento_curso` com nome depois de `zz_` pode mudar a linha
  depois da conferência. Mitigação: comentário no trigger, nota no `AGENTS.md` (seção Banco) e o smoke da propagação.
- **R3 — Regra em dois lugares** (SQL e TypeScript). Mitigação: a mesma tabela de casos no teste e no smoke.
- **R4 — Custo.** `tem_permissao` roda por linha nos triggers: a matrícula em lote (200 por vez) faz 200 buscas em
  `usuario_empresa` por e-mail e empresa (há índice por empresa). Aceitável; se pesar, índice em
  `(empresa_id, lower(usuario_email))`.
- **R5 — Policy restritiva no Storage** é avaliada em toda escrita de todos os buckets; o teste do `bucket_id` vem
  antes, então o custo fora de `treinamentos` é uma comparação.
- **R6 — Leitores esquecidos.** Uma tela fora da aba que leia questão, tentativa ou evento passa a receber lista vazia
  (sem erro). Mitigação: refazer o levantamento da §4.4 na implementação (`grep` de `TreinamentoQuestao`,
  `TreinamentoTentativa`, `TreinamentoEvento` e `treinamento_`).
- **R7 — `current_user` no trigger dos documentos** depende de o trigger não ser `security definer` e de as RPC serem do
  dono do banco. Mitigação: comentário na função e caso no smoke.
- **R8 — Fora do escopo, mas perto:** as imagens de assinatura do instrutor e do RT (bucket `assinaturas`) podem ser
  trocadas por qualquer usuário da empresa, e o certificado emitido guarda só a referência (a imagem impressa muda).
  Caminho futuro: pasta `assinaturas/<empresa>/ead/` com policy restritiva. Também ficam de fora `funcionario` como um
  todo, `treinamento` e `enviarWhatsApp` (§2).
- **R9 — Credencial do portal na mão de quem só matricula.** Se quem tem só Treinamentos EAD → `matricular` pudesse
  criar o acesso, receberia o login (CPF) e a senha provisória de qualquer funcionário sem acesso
  (`funcionario-acesso/index.ts:491`), faria o primeiro acesso (`portal-funcionario/index.ts:532-566`) e leria os
  documentos publicados no portal (contracheque, folha de ponto, documentação e advertências), justamente os que a §6
  põe atrás de RH → `criar`/`deletar`. Esses PDFs podem estar publicados antes de o funcionário ter acesso
  (`FichaFuncionarioSheet.jsx:315-325`), e o funcionário ficaria sem entrar até alguém com Funcionários → `editar`
  redefinir a senha. O `status` recortado não tem esse efeito: só diz quem já tem acesso. Mitigação: o C1 da P3 (criar o
  acesso só com Funcionários → `editar`, como hoje); o C2 sozinho **não** mitiga: a senha iria ao telefone gravado, que
  hoje qualquer usuário da empresa troca pela API (§2); ele só vale junto com uma trava no telefone. O roteiro da §9 confere que a chamada direta de `criar` não devolve senha a quem só
  matricula.

## 11. Perguntas ao Javerson

| #   | Pergunta                                                                                                                                                                                                                                                                                                                         | Recomendação                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | A aba "Treinamentos EAD" com as 7 funções da §3 serve?                                                                                                                                                                                                                                                                           | Sim                                                                                                                                                                       |
| P2  | Documentos do portal: aba RH (`criar`/`deletar`), Funcionários → `editar` (a mesma do acesso) ou uma aba nova "Portal do Funcionário"?                                                                                                                                                                                           | Aba RH (contracheque e folha de ponto são do RH)                                                                                                                          |
| P3  | Quem tem Treinamentos EAD → `matricular` (sem Funcionários) pode consultar quem já tem acesso ao portal (só `ativo`, sem CPF) e avisar quem já tem acesso? E pode **criar** o acesso de quem ainda não tem? Criar entrega login e senha, e com a senha a pessoa lê os documentos do funcionário no portal (R9). Caminhos na §7.1 | Consultar e avisar: sim. Criar: **não** (C1, só Funcionários → `editar`). C2 (senha só no WhatsApp do funcionário) só com uma trava no telefone, se aparecer quem precise |
| P4  | Desativar no cadastro central um treinamento com curso EAD vinculado exige Treinamentos EAD → `publicar`?                                                                                                                                                                                                                        | Sim                                                                                                                                                                       |
| P5  | Esconder gabarito, tentativas e trilha (IP e dispositivo) de quem não tem a aba?                                                                                                                                                                                                                                                 | Sim                                                                                                                                                                       |
| P6  | (a) A1, (b) B2 e o desenho geral S1?                                                                                                                                                                                                                                                                                             | Sim                                                                                                                                                                       |
| P7  | Número da migração (`0147`, e `0148` se os documentos forem separados) e fase 1 separada ou junto com a 2 (depende da conferência)?                                                                                                                                                                                              | `0147`; decidir a fase depois da conferência                                                                                                                              |

## 12. Implementação (07/10/2026)

O que mudou em relação ao texto acima, por ter vindo depois dele na branch:

- **T12 (prática presencial) e T35 (texto da declaração) já existem.** Sessão prática, presença e resultado
  (`treinamento_sessao_pratica`, `treinamento_pratica_participante`) e o texto da declaração
  (`treinamento_declaracao_texto`) entram no `zz_permissao_ead` com Treinamentos EAD → `editar`. A função própria do
  lançamento (`avaliar_pratica`, §3) segue reservada: até ela ser aprovada, lançar presença e resultado também exige
  `editar` (antes era livre para qualquer usuário da empresa).
- **Editar a resposta de uma dúvida (A6, ação `editar_resposta_duvida` do `funcionario-acesso`)** exige Treinamentos
  EAD → `responder_duvidas`, a mesma função da primeira resposta.
- `PermissoesTab.jsx` (perfis do SaaS) ganhou a aba nova na cópia própria em vez de importar a canônica: as duas
  cópias já são diferentes em outras abas, e trocar mudaria a tela do SaaS.
- O trigger `zz_documentos_portal` também recusa INSERT de funcionário já com item do portal (API).
- **Revisão 1 (07/10):** o `zz_documentos_portal` não é SECURITY DEFINER (R7) e chama `anexos_como_lista` e
  `anexos_do_portal` como `authenticated`; as duas ganharam `grant execute ... to authenticated` (funções puras),
  senão todo INSERT de funcionário e todo UPDATE com `documentos_rh_anexos` pela API falharia. O smoke passa a rodar
  logo depois da migração (passo 4), antes do push da tela e de liberar o uso, e cobre o INSERT e o UPDATE comuns.
- **Revisão 2 (07/10):** o bloco "para desfazer" pedido na §9 virou o arquivo `tools/desfazer-permissoes-ead.sql`, pronto
  para rodar (o cabeçalho da `0147` aponta para ele): o bloco abreviado do cabeçalho derrubava só 1 dos 8 triggers
  `zz_permissao_ead`, 1 das 3 policies de leitura e 1 das 3 do Storage, e não trazia as funções da `0119` e da `0130`.
  O arquivo derruba tudo o que a `0147` criou (inclusive as RPC dos documentos, então rode antes do push da tela),
  devolve `matricula_andamento_so_servidor` e `certificado_so_revogacao` ao texto de antes, recria `tenant_revogar` e o
  UPDATE do certificado. O teste `migracao-0147-desfazer.test.ts` compara o arquivo com a migração e com as migrações
  que definiram o texto de antes (`0103`, `0119`, `0130`).
- Arquivos: `supabase/migrations/0147_permissoes_ead.sql`, `tools/conferir-permissoes-ead.sql` (só leitura),
  `tools/smoke-permissoes-ead.sql`, `tools/desfazer-permissoes-ead.sql`, `supabase/functions/funcionario-acesso/{regras,index,duvida}.ts`,
  `apps/web/src/lib/ead-permissoes.js` e as telas da §8.
