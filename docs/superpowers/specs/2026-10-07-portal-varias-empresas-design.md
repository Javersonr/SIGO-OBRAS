# Portal do Funcionário em mais de uma empresa: um login (CPF e senha) e a escolha da empresa

- **Data:** 07/10/2026. **Status:** proposta, aguardando o OK do Javerson. Nada é implementado antes do OK.
- **Tarefa:** T38 do `docs/HANDOFF-PORTAL-TREINAMENTO.md` (M9).
- **Decisão D16 (Javerson, 06/10/2026):** não criar acessos separados por empresa. O funcionário usa o **mesmo login
  (CPF e senha)** e, se tem cadastro em mais de uma empresa, **escolhe a empresa ao entrar**. Este spec detalha como.
- **Base:** branch `feat/portal-treinamento` em `4de5cde`. Os números de linha citados são desse commit.
- **Aceite da T38:** este spec com o OK do Javerson; nenhum código. A implementação vem depois, em outra tarefa, com
  migração.

---

## 1. Problema

O acesso ao portal é uma linha de `funcionario_portal_acesso` por funcionário (`0103:13-30`): usuário, hash da senha,
senha provisória, bloqueio por senhas erradas, versão da sessão e relógio do progresso. O usuário é **único no sistema
inteiro** (`0103:31-32`, índice em `lower(usuario)`) e, para quem tem CPF no cadastro, é o CPF
(`funcionario-acesso/index.ts:463`). Daí:

1. Quem trabalha em duas empresas clientes (saiu da Sinergia e entrou na Eletro, ou presta serviço às duas) só tem
   acesso em uma delas: o RH da segunda não consegue criar o acesso.
2. Ao tentar, o RH da segunda recebe 409 `O usuário "<CPF>" já está em uso — informe outro`
   (`funcionario-acesso/index.ts:483-486`): o servidor confirma que aquele CPF tem acesso ao portal em **outra empresa**
   do SIGO (outro inquilino).
3. A saída que a tela oferece é inventar outro usuário para a mesma pessoa (o campo manual da T27): dois logins e duas
   senhas para a mesma pessoa, ou ninguém com acesso.
4. O mesmo 409 aparece dentro de uma empresa só: o `unique (empresa_id, cpf)` do funcionário caiu na `0021:33` (dados
   antigos com duplicatas), então a mesma pessoa pode ter dois cadastros na mesma empresa (readmissão).

## 2. Objetivo e fora do escopo

**Objetivo:** uma pessoa (CPF) tem uma senha só, que abre o portal em cada empresa em que tem cadastro ativo. Ao
entrar, ela escolhe a empresa; dentro da sessão, tudo continua filtrado por aquela empresa e por aquele cadastro, como
hoje. Nenhum RH consegue, com o que tem nas mãos, entrar no portal da pessoa em outra empresa nem descobrir em qual
outra empresa ela está. Isso vale também para o RH que age de má-fé e cadastra o CPF de outra pessoa: ele não troca a
senha de quem já usa o portal, o que descobre é mínimo e o que faz fica registrado (§4.3). O que sobra está em R1 e R11.

**Fora do escopo:**

- Aproveitar na empresa B um curso feito na empresa A (D17, aproveitamento e convalidação). Cada empresa matricula,
  acompanha e certifica os seus (§7).
- Recuperar a senha sem o RH, pelo WhatsApp da própria pessoa: fica como fase 2 (opção C da §4, P4).
- Conferir que o CPF do cadastro é mesmo da pessoa (documento, e-mail ou telefone confirmados por ela): o SIGO não
  confere hoje e este spec não passa a conferir. A §4.3 limita o estrago de quem cadastra um CPF alheio.
- Portais de fornecedor e de cliente (usam o mesmo `_shared/portal-token.ts`, mas outro login).
- Histórico da readmissão: o cadastro antigo e o novo da mesma pessoa na mesma empresa continuam separados; a §3.3 só
  evita dois acessos ativos.
- Quem pode criar, redefinir e desativar o acesso dentro da empresa: é a T33 (continua Funcionários → `editar`).

## 3. Modelo: a pessoa (credencial) e os vínculos (um por cadastro)

### 3.1 Tabelas

| Tabela                                                  | Uma linha por                     | Guarda                                                                                                                                                                                                                                                                                                                                                                                                 | Quem lê e grava                                                                                                                               |
| ------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `portal_credencial` (nova)                              | pessoa (usuário)                  | `usuario` (CPF ou usuário com letras), `tipo` (`cpf`/`manual`), hash da senha pessoal (nulo até a pessoa criar), `senha_geracao`, `senha_origem_empresa_id` (empresa cuja provisória criou a senha atual, que o RH dela pode conhecer; só a troca na etapa `ativar` de **outra** empresa a zera, §4.2), `sessao_versao`, `tentativas`, `bloqueado_ate`, `ultimo_sinal_em`, `senha_alterada_em`         | só o servidor: RLS ligada, sem policy, `revoke` de `anon` e de `authenticated`                                                                |
| `funcionario_portal_acesso` (fica e vira o **vínculo**) | cadastro de funcionário (empresa) | `credencial_id`, `empresa_id`, `ativo`, `sessao_versao` do vínculo, `ultimo_acesso` nesta empresa, provisória pendente (`provisoria_hash`, `provisoria_criada_em`, `provisoria_expira_em`), `geracao_liberada`, `confirmado_em` (quando a pessoa liberou este vínculo sabendo a senha; nenhuma ação do RH o apaga: só a religação do caso 7 e o procedimento do operador, §4.3, o zeram), `criado_por` | só o servidor (como hoje)                                                                                                                     |
| `portal_credencial_evento` (nova)                       | evento de segurança da pessoa     | `credencial_id` (sem chave estrangeira e sem o CPF), `empresa_id` do vínculo que agiu, `evento`, `detalhe`, `ip`, `dispositivo`, `created_at`                                                                                                                                                                                                                                                          | o servidor grava e só o operador lê (RLS ligada, sem policy, `revoke` de `anon` e de `authenticated`); só de inclusão, como a trilha (`0135`) |

- `portal_credencial` **não tem `empresa_id`**: é a identidade da pessoa na plataforma, como `auth.users` é a do
  usuário do SIGO. É exceção declarada à regra 5 do `AGENTS.md`: a tabela não é de negócio, não tem policy e o servidor
  só a lê por `id` (vindo do token) ou por `usuario` (vindo do login), nunca em lista. O trigger
  `referencias_da_empresa` (`0118`) não se aplica a `credencial_id`. `portal_credencial_evento` também não é de
  negócio: guarda o `empresa_id` do vínculo que agiu só para o operador ler, sem policy, e não leva o CPF (§4.3).
- O vínculo continua com chave `funcionario_id`, um por cadastro. Matrícula, progresso, prova, certificado, trilha,
  dúvida, ciência e documentos continuam ligados ao `funcionario_id` de cada empresa: **nenhuma tabela do EAD muda**.
- Saem do vínculo (vão para a credencial): `usuario`, `senha_hash`, `senha_provisoria`, `tentativas`, `bloqueado_ate`,
  `ultimo_sinal_em`. Sai também, com a `0146` (§9.1), o índice único global `funcionario_portal_acesso_usuario_uidx`, a
  origem do 409.
- Índice único novo: um vínculo **ativo** por pessoa e empresa (`credencial_id, empresa_id where ativo`).
- Credencial sem nenhum vínculo é apagada junto, por trigger `after delete or update of credencial_id` no vínculo (o
  `update` cobre a religação do caso 7 da §4.2, em que o vínculo muda de credencial): CPF e hash não ficam guardados sem
  motivo (LGPD, minimização). O cadastro de funcionário é apagado de forma **lógica** (`deleted_at`), então o vínculo e
  a credencial **não** somem com ele: só a exclusão física dispara o trigger. Varrer as credenciais cujos vínculos são
  todos de cadastros apagados ou inativos é a política de retenção (D11), fora deste spec; até lá a minimização é
  parcial (R6), como é hoje com a linha do acesso.

### 3.2 Situação do vínculo

Calculada pelo servidor (função pura `situacaoDoVinculo`, §9.2), na ordem da tabela:

| Situação                | Quando                                                                                                                                                                                               | Abre com a senha pessoal?    | O que o RH vê na Ficha           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------- |
| `desativado`            | `ativo = false`                                                                                                                                                                                      | não                          | Desativado                       |
| `cadastro_inativo`      | funcionário inativo ou apagado                                                                                                                                                                       | não                          | (o cadastro já aparece inativo)  |
| `cpf_mudou`             | credencial `cpf` e o CPF do cadastro (só dígitos) é outro                                                                                                                                            | não                          | Precisa de nova senha provisória |
| `aguardando_provisoria` | há provisória pendente e não vencida                                                                                                                                                                 | não (entra com a provisória) | Aguardando 1º acesso             |
| `liberado`              | `geracao_liberada` igual à `senha_geracao` da credencial                                                                                                                                             | sim                          | Ativo                            |
| `travado`               | nenhum dos anteriores: a senha foi criada com a provisória de **outra** empresa depois que esta foi liberada; ou a provisória desta venceu sem uso (o vínculo nunca foi liberado, ou o RH redefiniu) | não                          | Precisa de nova senha provisória |

`geracao_liberada` e `confirmado_em` nascem **nulos** no vínculo novo, e nulo nunca é igual à geração. "Redefinir senha"
também zera `geracao_liberada` (não o `confirmado_em`): é isso que tira a liberação na hora (caso 4 da §4.2) e faz a
provisória vencida sem uso cair em `travado`, em vez de reabrir a empresa com a senha antiga.

"Bloqueado" (senhas erradas) é da credencial, porque é a mesma pessoa errando, e aparece por cima da situação, como
hoje, mas **só nos vínculos `liberado`** (§4.3, defesa 4).

### 3.3 Usuário: o CPF junta as empresas; o usuário com letras não

- **Funcionário com CPF no cadastro:** o usuário é **sempre** o CPF dele, só os dígitos. O `usuario` do corpo é
  ignorado (hoje o servidor aceita outro usuário mesmo com CPF, `funcionario-acesso/index.ts:463`; a tela só o manda
  quando não há CPF, então nada muda na tela). O CPF precisa ter os dígitos verificadores certos (hoje só o tamanho é
  conferido, `:467-472`): CPF digitado errado ligaria o cadastro à credencial de outra pessoa (R4). A conta é a mesma de
  `apps/web/src/lib/cpf.js`, repetida no módulo puro do servidor; um teste do front importa o módulo do servidor e roda
  nas duas cópias a mesma lista de CPFs, como `portal-senha.test.js` faz com a regra da senha (§9.2). O dígito
  verificador só barra o erro de digitação: não impede quem digita um CPF alheio de propósito (§4.3).
- Se já existe credencial `cpf` com aquele CPF, de qualquer empresa, o vínculo novo **aponta para ela**. Senão, nasce a
  credencial, sem senha.
- **Funcionário sem CPF:** usuário com letras (T27), credencial `manual` de **um vínculo só**. Ela não se junta com
  nada, porque um nome de usuário não prova quem é a pessoa. Usuário só com números passa a ser recusado ("Usuário só
  com números é CPF: cadastre o CPF no funcionário"); senão, serviria para ligar o cadastro ao CPF de outra pessoa.
- Usuário com letras já usado (em qualquer empresa): 409 `USUARIO_EM_USO`, "Este usuário já existe no portal. Escolha
  outro, por exemplo joao.silva2". Não envolve CPF, salvo o caso raro de um CPF que coincide com um usuário `manual`
  legado de 11 dígitos (§9.1): a consulta de conferência da `0145` diz se existe algum.
- **Mesma pessoa com dois cadastros ativos na mesma empresa:** 409 `OUTRO_CADASTRO_COM_ACESSO`, com o nome e a admissão
  do outro cadastro (dado da própria empresa). Se o outro cadastro está inativo ou apagado, o vínculo velho é desativado
  e o novo nasce (readmissão). A mesma recusa vale ao **reativar** um vínculo desativado, ou ao "Redefinir senha" nele,
  quando outro cadastro da pessoa já tem vínculo ativo na empresa: o índice parcial da §3.1 não deixa os dois ativos.

### 3.4 Alternativas descartadas

- **Acesso separado por empresa** (usuário e senha por cadastro, como hoje, com a empresa escolhida antes da senha):
  descartada pela D16.
- **Várias linhas em `funcionario_portal_acesso` com a mesma senha copiada:** cada troca de senha reescreveria as
  linhas das outras empresas, e o "Redefinir senha" de uma empresa mudaria a senha que vale na outra.
- **Mostrar as empresas antes da senha:** qualquer um que digitasse um CPF saberia onde a pessoa trabalha.

## 4. Quem cria, redefine e desativa a senha

A senha é uma só, mas cada RH só pode mexer no que vale na **sua** empresa. O ponto difícil é a senha provisória: quem
a gera (o RH) pode entrar como o funcionário até ele usá-la. Hoje isso fica dentro da empresa. Com a senha única, o RH
da empresa A criaria, com a provisória dele, uma senha que abre também a empresa B.

### 4.1 Opções

| Opção                                                                                                     | Criar                                                                                                                                                                                    | Esqueci a senha                                                                                                                                                                         | Desativar                 | Efeito de uma empresa sobre a outra                                                                                  | A favor                                                                                  | Contra                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A (recomendada):** provisória por empresa; senha criada com a provisória de uma empresa trava as outras | o RH gera a provisória do vínculo dele; com ela a pessoa cria a senha (se ainda não tem) ou confirma a que já usa (e escolhe uma nova, se a atual nasceu da provisória de outra empresa) | o RH de qualquer empresa em que a pessoa já entrou com a senha gera nova provisória; com ela a pessoa cria senha nova, que abre só aquela empresa até cada outra gerar a sua provisória | cada RH só o vínculo dele | senha criada com a provisória da A **trava** a B até a B gerar nova provisória (indisponibilidade, sem dado exposto) | nenhum RH entra em outra empresa; nenhum canal novo; os botões do RH continuam os mesmos | quem esquece a senha e está em duas empresas precisa de uma provisória de cada, e quem só tem empresas em que nunca entrou com a senha precisa antes da provisória de uma em que já entrou ou, se não resta nenhuma, do operador (§4.3)                                                              |
| B: a primeira empresa é dona da senha                                                                     | só a dona gera provisória que cria senha; as outras só ligam o vínculo (a pessoa confirma a senha)                                                                                       | só a dona                                                                                                                                                                               | cada RH o vínculo dele    | a dona controla a senha usada nas outras                                                                             | simples                                                                                  | a dona pode ter desligado o funcionário ou ser concorrente da outra; passar a "posse" vira regra nova                                                                                                                                                                                                |
| C: recuperação pelo próprio funcionário (WhatsApp)                                                        | como na A                                                                                                                                                                                | "Esqueci a senha" manda um código ao WhatsApp **que a própria pessoa cadastrou e confirmou** na credencial; o RH só em último caso (aí vale a A)                                        | como na A                 | nenhum, quando a pessoa recupera sozinha                                                                             | quem esquece não depende de RH nenhum                                                    | depende do canal WhatsApp do SaaS no ar; o telefone tem de ser o da credencial, confirmado pela pessoa (não o `funcionario.telefone`, que hoje qualquer usuário da empresa troca pela API, ver o spec da T33, §2); mais código e mais tela; não resolve o CPF ocupado antes pela empresa real (§4.3) |
| D: qualquer RH redefine, e a senha nova vale em todas                                                     | o RH gera a provisória                                                                                                                                                                   | qualquer RH                                                                                                                                                                             | cada RH o vínculo dele    | o RH da A entra no portal da pessoa na B: documentos, contracheque, prova, assinatura do certificado                 | o mais simples                                                                           | **vazamento entre empresas: descartada**                                                                                                                                                                                                                                                             |

**Recomendação:** A agora. C como fase 2, se pedir a provisória de cada empresa incomodar no uso (P4). A opção A também
convive com o C2 da T33 (servidor manda a provisória pelo WhatsApp do funcionário): a provisória continua por empresa.

### 4.2 Como a opção A funciona

Cinco conceitos:

- **`senha_geracao` (credencial):** sobe de 1 cada vez que a senha é **criada com uma provisória** (a primeira senha ou
  "criar senha nova"). Trocar a senha informando a atual não sobe: quem sabe a senha atual já abria todas as empresas.
- **`geracao_liberada` (vínculo):** a geração em que aquela empresa foi liberada. A empresa abre com a senha pessoal só
  quando `geracao_liberada = senha_geracao`. Nulo no vínculo novo e depois de "Redefinir senha" (§3.2).
- **Senha provisória (vínculo):** gerada pelo RH, aparece uma vez, o banco guarda só o hash; vale para **aquela
  empresa**. Hoje ela não vence; a proposta é vencer em 7 dias (P3).
- **`senha_origem_empresa_id` (credencial):** a empresa cuja provisória criou a senha atual. Quem recebeu essa
  provisória pode conhecer a senha: viu a provisória, ou digitou a senha "pela" pessoa. Quem pode trocar a senha dentro
  dessa empresa é quem sabe a senha atual, o RH que a criou inclusive, e uma troca feita ali não prova que ele deixou
  de saber a nova: `trocar_senha` e a troca da etapa `ativar` na própria empresa de origem **mantêm** a origem. Só a
  troca da etapa `ativar` numa empresa **diferente** da origem (caso 2) a zera. Com isso vale esta regra: enquanto a
  origem não é nula, **só a empresa de origem está liberada**. Os casos 1 e 3 e a cópia da `0145` já deixam assim, e
  nenhuma ação libera outra empresa sem antes zerar a origem.
- **`confirmado_em` (vínculo):** a primeira vez em que alguém liberou este vínculo **sabendo a senha**: criou a
  primeira senha da credencial ou digitou a senha atual. Nenhuma ação do RH o apaga: só a religação do caso 7 e o
  procedimento do operador (§4.3) o zeram. Serve à regra da §4.3 (defesa 1).

Os casos:

1. **Primeiro acesso de quem ainda não tem senha** (igual a hoje para quem está numa empresa só): o RH da A clica "Criar
   acesso" e entrega o usuário (CPF) e a provisória. A pessoa entra com CPF e provisória e cria a senha. Geração 1; A
   liberada e confirmada; `senha_origem_empresa_id` = A.
2. **Quem já usa o portal na A entra na B:** o RH da B clica "Criar acesso" e recebe **a mesma resposta** do caso 1
   (§6). A pessoa entra com CPF e a provisória da B e vê **a mesma tela** do primeiro acesso, com o link "Já uso o
   portal em outra empresa" (§5.1, §8). Ela usa o link e digita a senha que já usa. Senha certa: B liberada e
   confirmada, sem mudar nada na A. Só que a senha atual pode ser conhecida pelo RH da A, que viu a provisória ou
   digitou a senha pela pessoa, e então ele entraria na B com ela. Por isso, quando `senha_origem_empresa_id` é de
   **outra** empresa (a senha nasceu da provisória da A, mesmo que a pessoa a tenha trocado dentro da A), o portal pede,
   antes de liberar a B, uma **senha nova que só ela conhece**: senha atual e senha nova na mesma tela. A troca não sobe
   a geração (a A continua liberada), derruba as sessões abertas e zera `senha_origem_empresa_id`, e só esta troca a
   zera. É um passo só: nas próximas empresas, só a senha atual. Daí em diante, CPF e senha levam à escolha entre A e B.
3. **Esqueceu a senha:** o RH de uma empresa **em que a pessoa já entrou com a senha** (vínculo `confirmado`, §4.3),
   digamos a B, clica "Redefinir senha" e entrega a provisória. A pessoa entra com ela e cria uma senha nova. A geração
   sobe, a B fica liberada, **a A fica travada**, `senha_origem_empresa_id` passa a ser a B e todas as sessões abertas
   caem. A pessoa pede a provisória ao RH da A e, com ela, confirma a senha nova (caso 2, com a troca obrigatória: a
   senha nova nasceu da provisória da B): A liberada. Se a provisória é de uma empresa em que a pessoa nunca entrou com
   a senha, o portal recusa criar a senha nova (§4.3, defesa 1) e diz o que fazer: pedir a provisória a uma empresa em
   que ela já entra. Se não resta nenhuma (saiu da A, entrou na B e esqueceu a senha antes de confirmar a B), o caminho
   é o RH da B e, por ele, o suporte do SIGO (a Sinergia Digital, que opera o SaaS), que roda o procedimento do operador
   (§4.3).
4. **O RH desconfia que alguém sabe a senha:** "Redefinir senha" na B tira a liberação da B na hora (`geracao_liberada`
   fica nulo: a senha atual deixa de abrir a B e as sessões da B caem), como hoje. A outra empresa não muda. Se a pessoa
   criar senha nova com a provisória, cai no caso 3: as outras travam, e quem sabia a senha antiga perde todas.
5. **Desativar:** só o vínculo daquela empresa (`ativo = false`; as sessões daquela empresa caem). Reativar devolve a
   situação anterior, e é recusado com 409 `OUTRO_CADASTRO_COM_ACESSO` se a pessoa já tem outro vínculo ativo na empresa
   (§3.3). Nenhum RH desativa a credencial inteira; sem nenhum vínculo que abra, o login responde como no §5.1.
6. **Senhas erradas:** o bloqueio (5 erros, 15 min) é da credencial e vale em todas as empresas. Entrar com uma
   provisória válida não é barrado pelo bloqueio, porque é outro segredo, novo; confirmar a senha atual depois da
   provisória é barrado, porque é uma tentativa de senha. Criar senha nova com a provisória zera o bloqueio. "Redefinir
   senha" não mexe no bloqueio (é da pessoa, não da empresa; hoje ele o zera, `funcionario-acesso/index.ts:505-506`).
7. **CPF corrigido no cadastro:** o vínculo para de abrir (`cpf_mudou`). "Redefinir senha" religa o vínculo à credencial
   do CPF novo (ou cria uma), como vínculo novo: `geracao_liberada` e `confirmado_em` ficam nulos, porque a confirmação
   era da outra credencial. A credencial velha, se ficar sem vínculo, é apagada.

O que o RH da A consegue com a provisória dele: entrar como o funcionário **na A** (como hoje) e, se o vínculo dele é
`confirmado`, criar senha nova e travar as outras empresas (indisponibilidade, gravada no registro do operador e, na
trilha das outras empresas, como `acesso_aguardando_provisoria`, §4.3 e §7). O que ele **não** consegue: abrir a B, ver
o nome da B, liberar a B, **desde que não conheça a senha atual**. Se a conhece (viu a provisória ou digitou a senha), o
caso 2 exige a troca antes de liberar a B, e a troca feita na própria A não adianta: a origem continua sendo a A, e a B
só abre depois de a pessoa escolher uma senha nova na própria B. O que sobra é próprio da senha única da D16: se a
pessoa deixa um RH digitar a senha dela (inclusive a senha nova da troca obrigatória), esse RH passa a conhecê-la, e ela
abre todas as empresas liberadas (R1).

### 4.3 Cadastro com o CPF de outra pessoa (abuso entre empresas)

O SIGO não confere se o CPF do cadastro é mesmo da pessoa. Qualquer empresa cliente com Funcionários → `editar` pode
cadastrar um funcionário com o CPF **certo** de outra pessoa (o `unique (empresa_id, cpf)` caiu na `0021:33`, e o
dígito verificador só barra o erro de digitação), criar o acesso e usar a provisória como se fosse a pessoa. Sem defesa,
essa empresa conseguiria:

1. descobrir se o CPF já usa o portal, uma informação parecida com a que o 409 de hoje revela e que a T38 quer fechar;
2. criar senha nova com a provisória dela: isso derruba as sessões da pessoa e trava as empresas reais dela, quantas
   vezes quisesse, e as vítimas só veriam "precisa de nova provisória", sem saber quem fez;
3. saber quantas outras empresas do SIGO têm cadastro daquele CPF (o aviso de empresas esperando liberação);
4. ler, na trilha do cadastro falso, o IP e o dispositivo de cada erro de senha da pessoa real.

O desenho fecha cada ponto assim:

- **Defesa 1: só vínculo confirmado cria senha nova numa credencial que já tem senha.** `ativar { nova_senha }` com a
  credencial **já com senha** só vale se o vínculo da provisória tem `confirmado_em`, isto é, se alguém já o liberou
  sabendo a senha. Senão, 403 `RESET_NEGADO` com texto igual para todos (§8), nada muda, e o evento `reset_recusado` vai
  só para o registro do operador: na trilha da empresa ele contaria ao RH que a credencial já tem senha, mesmo quando
  quem tocou no botão foi a própria pessoa (§7). Credencial **sem senha** (a primeira senha, caso 1) aceita qualquer
  vínculo. Fecha o ponto 2: o cadastro falso nunca soube a senha, então não consegue trocá-la nem travar as empresas
  reais. Custo: quem esquece a senha precisa da provisória de uma empresa **em que já entrou com a senha e que ainda
  está ativa** (caso 3); a de uma empresa nova, nunca confirmada, não serve. Se não resta nenhuma, a tela não tem saída:
  é o caso de quem **saiu da A, entrou na B e esqueceu a senha**, o mesmo que motivou a D16. O vínculo confirmado é o da
  A, mas o cadastro dela está inativo e a provisória dela nem conta (§5.1, passo 0); o da B nunca foi confirmado, porque
  a pessoa não lembrava a senha para confirmar. O caminho é o RH da B, depois o suporte do SIGO, que roda o procedimento
  do operador (abaixo). É o preço de não deixar a empresa que cadastrou o CPF mexer na senha.
- **Defesa 2: mesma tela com e sem senha.** A etapa `senha_provisoria` do login não devolve mais `tem_senha`. A tela é
  a mesma para todos ("Crie sua senha pessoal" e o link "Já uso o portal em outra empresa"), então entrar com a
  provisória não diz mais nada sobre o CPF. Quem quer saber tem de agir, e cada caminho deixa rastro no registro do
  operador: criar senha nova é recusado (defesa 1) ou vira a primeira senha da credencial; errar a "senha atual" dá a
  mesma resposta com e sem senha (401 `CREDENCIAIS`, o mesmo bcrypt, conta no bloqueio). Fecha o ponto 1 só em parte:
  sobra descobrir **por tentativa** se há senha (R3).
- **Defesa 3: sem contagem de outras empresas.** `dados` deixa de levar `empresas_aguardando`. `outras_empresas` conta
  só empresas **liberadas**, e uma empresa só fica liberada quando alguém provou a senha atual (quem acabou de criar a
  senha com a provisória não tem nenhuma outra liberada). O aviso "tem empresa esperando" vira uma dica fixa, igual para
  todos e sem número (§8). Fecha o ponto 3.
- **Defesa 4: erro de senha sem IP na empresa.** `login_falha` entra na trilha só dos vínculos `liberado`, com
  `{ tentativa, bloqueou }` e **sem IP e dispositivo** (opção nova de `registrarEvento`, §9.2). O "Bloqueado" da Ficha
  também só aparece em vínculo `liberado`. O IP e o dispositivo completos vão para o registro do operador (defesa 5).
  Fecha o ponto 4.
- **Defesa 5: registro e alerta para o operador.** `portal_credencial_evento` (§3.1) guarda `senha_criada`,
  `reset_recusado`, `acesso_confirmado`, `troca_senha` (a da etapa `ativar`), `credencial_bloqueada`,
  `login_falha` (com IP e dispositivo) e `credencial_redefinida_pelo_operador`, cada um com a empresa do vínculo que
  agiu. São os eventos que, na trilha de uma empresa, contariam ao RH o que a pessoa faz em outra (§7). A consulta de
  alerta, só de leitura (`tools/portal-credencial-alertas.sql`, que o Javerson roda), lista as credenciais com
  `reset_recusado`, com `senha_criada` por duas ou mais empresas diferentes em 7 dias, ou com três ou mais
  `senha_criada` em 24 horas. Nesta etapa o alerta é uma consulta, não uma notificação (P9). Com o registro o operador
  diz a uma vítima **qual** empresa mexeu na senha, coisa que o evento `acesso_aguardando_provisoria` da empresa dela
  (§7) não diz, e decide o que contar.

**O que as defesas não resolvem: o CPF ocupado antes pela empresa real, e quem ficou sem nenhuma empresa confirmada.**
Se a empresa mal-intencionada cadastra o CPF **primeiro**, quando a credencial ainda não tem senha, ela cria a primeira
senha (caso 1) e vira a dona dela. A empresa real que cadastrar depois liga o vínculo a essa credencial, a pessoa não
sabe a senha e a defesa 1 recusa criar outra. Hoje o mesmo cadastro falso faz pior: o 409 impede a empresa real de criar
o acesso com o CPF. O outro caso é o de quem esqueceu a senha e não tem mais nenhuma empresa em que entra (custo da
defesa 1). A saída dos dois é o **procedimento do operador**, sem tela: o RH da empresa em que a pessoa trabalha hoje
pede ao suporte do SIGO e o operador, depois de conferir quem é a pessoa fora do sistema (documento) e **qual é a
empresa dela** (a "conferida"), roda `tools/portal-credencial-redefinir.sql`, que o Javerson executa (§9.2), com o
usuário, a empresa conferida e, se houver, as empresas que ocuparam o CPF (as "ocupantes"). Numa só transação, o
script:

1. troca a senha da credencial por um hash bcrypt de um segredo aleatório que ninguém guarda: a credencial continua "com
   senha" e nenhuma senha abre, então não existe a janela "sem senha" em que qualquer vínculo cria a primeira. Zera a
   origem e o bloqueio e sobe a geração e a versão da sessão (as sessões de todas as empresas caem);
2. zera `geracao_liberada` e `confirmado_em` de todos os vínculos (todas as empresas passam a pedir provisória) e marca
   `confirmado_em` **só** no vínculo da empresa conferida: só a provisória dela cria a senha nova (defesa 1);
3. desativa o vínculo de cada empresa ocupante e sobe a `sessao_versao` dele. O ocupante fica sem senha, sem
   `confirmado_em` e sem como criar senha nova, mesmo que o RH dele reative o cadastro, clique em "Redefinir senha" ou
   cadastre a pessoa de novo: a defesa 1 responde `RESET_NEGADO`;
4. grava `credencial_redefinida_pelo_operador`, com a empresa conferida e as ocupantes.

O script não muda nada se a empresa conferida não tem vínculo ativo de cadastro ativo. Depois dele, o RH da empresa
conferida gera a provisória ("Redefinir senha") e a pessoa cria a senha; as outras empresas dela pedem, cada uma, a sua
provisória e a liberam com a senha nova (caso 2). A fase 2 (opção C) **não** substitui esse procedimento: um telefone
"confirmado" por quem ocupou o CPF primeiro serviria ao ocupante (ela só cobre quem já tinha confirmado o WhatsApp antes
de esquecer a senha). Como dissuasão, o uso fica no registro do operador (a trilha da empresa que cadastrou não pode
mostrar a recusa, §7), e o termo de uso do portal deve proibir cadastrar CPF alheio (R6). O risco que sobra é o R11.

## 5. Login, escolha da empresa e sessão

### 5.1 Etapas do login

`login { usuario, senha }`, com o limitador de hoje antes de tudo (IP e conta = usuário,
`portal-funcionario/index.ts:432-436`):

0. **As mesmas K comparações em todos os caminhos.** Hoje o login paga um bcrypt, exista ou não o CPF (`:446-448` e
   `:458`). Para o tempo da resposta não dizer se o CPF tem credencial, se ela tem senha, nem quantas provisórias tem
   pendentes, o servidor faz sempre **K = 4** comparações, uma com a senha pessoal e três com as provisórias, **sem sair
   antes**, e só depois decide. O que faltar é completado com o hash fictício: credencial inexistente, credencial ainda
   sem senha, menos de três provisórias. Provisória pendente é a de vínculo ativo, de cadastro ativo e não vencida;
   valem as três mais recentes (`provisoria_criada_em`). Com mais de três pendentes na mesma pessoa, as mais antigas só
   voltam a valer quando o RH gerar outra; o vencimento de 7 dias (P3) torna isso raro. Custo: 4 bcrypts por login (uns
   80 ms cada com o bcryptjs de `_shared/passwords.ts`) em vez de 1; o limitador (30 por IP e 8 por conta) segura a
   rajada. A conta de K fica na função pura `conferirLogin` (§9.2), e o teste conta as comparações caminho a caminho. O
   que sobra de diferença (algumas consultas e gravações, na casa dos milissegundos) é pequeno perto de 4 bcrypts.
1. A senha confere com a senha pessoal:
   - bloqueado: 423 `BLOQUEADO` (como hoje);
   - nenhuma empresa `liberado`: se alguma está `travado`, `cpf_mudou` ou `aguardando_provisoria`, 403
     `PEDIR_PROVISORIA` ("Seu acesso precisa ser liberado de novo: peça ao RH a senha provisória"); senão, se alguma
     está `cadastro_inativo`, 403 "Cadastro inativo — fale com o RH"; senão, 403 `DESATIVADO`. As duas últimas são as
     de hoje. A mensagem **não diz o nome** da empresa (R4);
   - uma empresa `liberado`: entra direto, com a resposta de hoje (`{ token, nome }`);
   - duas ou mais: `{ etapa: "escolher_empresa", token_escolha, empresas: [{ id, nome, logo_url }] }`, só com as
     liberadas. `id` é o `funcionario_id` daquele cadastro (dado da própria pessoa).
2. Não confere com a senha pessoal, mas confere com uma provisória pendente. A resposta é
   `{ etapa: "senha_provisoria", token_ativacao, empresa: { nome } }`, a **mesma com e sem senha** na credencial: a
   tela não sabe se a pessoa já usa o portal (§4.3, defesa 2). A empresa é a do vínculo cuja provisória conferiu, e
   quem digitou a provisória já a conhece.
3. Nada confere (inclusive credencial inexistente): 401 `CREDENCIAIS`. Se a credencial existe e não está bloqueada,
   conta a falha nela (bloqueia na 5ª), grava `login_falha` na trilha dos vínculos `liberado`, sem IP e dispositivo, e
   no registro do operador, com os dois (§4.3, defesas 4 e 5). Credencial bloqueada não conta falha, como hoje.

Ações novas, sem sessão:

- `escolher_empresa { token_escolha, funcionario_id }`: confere que o cadastro é da credencial do token e está
  `liberado`; devolve a sessão daquela empresa.
- `ativar`, com o `token_ativacao`, em três formas. Em todas, o vínculo da provisória fica liberado e confirmado, o hash
  da provisória é apagado e a resposta é a sessão daquela empresa:
  - `{ nova_senha }` (casos 1 e 3, "criar a senha"): passa pelas regras de hoje (`motivoSenhaInvalida`, T27), sobe a
    geração, grava `senha_origem_empresa_id` = a empresa da provisória e zera o bloqueio. Com a credencial já com
    senha e o vínculo sem `confirmado_em`: 403 `RESET_NEGADO`, e nada muda (§4.3, defesa 1);
  - `{ senha_atual }` (caso 2): confere a senha atual (conta no bloqueio do caso 6). Certa, e `senha_origem_empresa_id`
    nulo ou da mesma empresa: libera. Certa, e `senha_origem_empresa_id` de **outra** empresa: responde
    `{ etapa: "nova_senha_obrigatoria" }` e não muda nada. Errada, ou credencial sem senha: 401 `CREDENCIAIS`, com o
    mesmo bcrypt nos dois casos;
  - `{ senha_atual, nova_senha }` (a segunda volta do caso 2): confere a senha atual e troca por uma nova, que passa
    pelas mesmas regras; **não** sobe a geração, sobe a `sessao_versao` da credencial (derruba as sessões abertas, as do
    RH da A inclusive) e libera o vínculo. Zera `senha_origem_empresa_id` **só** quando a empresa da provisória é
    diferente da origem; na própria empresa de origem, a origem fica (§4.2).

Os tokens intermediários vencem rápido: escolha em 5 min; ativação em 10 min, amarrada à provisória
(`provisoria_criada_em`), para uma provisória nova anular o token da anterior. Eles levam **escopo próprio**
(`funcionario_escolha` e `funcionario_ativacao`). O `verifyPortalToken` de `_shared/portal-token.ts` serve aos três
portais e não confere escopo: quem confere é cada função, e a sessão exige `funcionario_sessao`, então um token
intermediário nunca vale como sessão, nem o de outro portal vale aqui. O de escolha também leva `vc` e só vale enquanto
a `sessao_versao` da credencial for a mesma.

`trocar_senha` (com sessão) passa a exigir sempre a senha atual: o primeiro acesso virou a etapa `ativar`, e a trava
`TROCAR_SENHA` (`index.ts:628-630`) sai. A troca não sobe a geração e **mantém** `senha_origem_empresa_id`: quem pode
trocar a senha na sessão da empresa de origem é quem sabe a senha atual, o RH que a criou inclusive (§4.2). Ela derruba
as sessões de todas as empresas (`vc`).

### 5.2 O que vai no token

Hoje: `{ scope: "funcionario_sessao", empresa_id, funcionario_id, v }` (`index.ts:502-510`). Proposta:

```json
{
  "scope": "funcionario_sessao",
  "credencial_id": "<uuid da credencial>",
  "empresa_id": "<uuid da empresa escolhida>",
  "funcionario_id": "<uuid do cadastro escolhido>",
  "v": 3,
  "vc": 2,
  "exp": 1791380000
}
```

- `funcionario_id` e `empresa_id`: o cadastro escolhido. É **só daqui** que as ações tiram a empresa, como hoje.
- `v`: `sessao_versao` do vínculo. Redefinir, desativar e sair nesta empresa derrubam as sessões desta empresa.
- `vc`: `sessao_versao` da credencial. Senha criada com provisória e troca de senha derrubam as sessões de todas as
  empresas.
- Os tokens de hoje (sem `credencial_id`) caem com 401 `SESSAO` no deploy; a pessoa entra de novo (a sessão dura 12 h).

O navegador guarda o token no `localStorage`, como hoje (`components/portal-funcionario/api.js:8-31`), mais o nome da
empresa para o cabeçalho. Duas abas em empresas diferentes funcionam, cada uma com o token em memória; ao recarregar,
vale a última empresa escolhida no aparelho.

### 5.3 A cada ação

A conferência do começo de toda ação com sessão (`index.ts:514-551`) vira a função pura `sessaoValida`: a credencial
existe e `vc` confere; o vínculo do `funcionario_id` existe, é da `credencial_id` e da `empresa_id` do token, está
`ativo` e `liberado`, e `v` confere; o funcionário está ativo naquela empresa e, se a credencial é `cpf`, tem o mesmo
CPF. Qualquer item falhou: 401 `SESSAO`, como hoje.

Depois dela, **o filtro das ações não muda**: matrícula, curso, aula, prova, certificado, ciência, dúvida, documentos e
declaração já filtram pelo `funcionarioId` e pela `empresaId` do token (por exemplo, `minhaMatricula`,
`index.ts:650-668`, e `documentos`, `:633-643`, que lê só o token). Nenhuma ação lê empresa ou funcionário do corpo. A
exceção nova é conferida: `escolher_empresa` e `trocar_empresa` recebem o `funcionario_id` escolhido e só o aceitam se
for de um vínculo liberado da credencial do token (função pura `vinculoEscolhido`).

O que muda dentro de `portal-funcionario/index.ts` (o resto fica igual):

| Hoje (linha)                                                                                               | Passa a usar                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `acesso.senha_hash` na reconfirmação (`:561`) e na troca (`:590`)                                          | `credencial.senha_hash`                                                                          |
| `acesso.usuario` na regra da senha (`:588`), na assinatura do certificado (`:1753`) e na ciência (`:1898`) | `credencial.usuario`: é o mesmo valor (o CPF), então o formato do certificado e o hash não mudam |
| `acesso.sessao_versao` na troca de senha (`:593`)                                                          | `credencial.sessao_versao`: a troca derruba as sessões de todas as empresas                      |
| `acesso.sessao_versao` no sair (`:616-626`)                                                                | continua o do vínculo: sair derruba esta empresa, em todos os aparelhos, como hoje               |
| `ultimo_sinal_em` em `abrir_aula` (`:1044-1048`) e no progresso (`:1147-1163`)                             | `credencial.ultimo_sinal_em` (§5.5)                                                              |
| limites por `funcionarioId` em `reconfirmarSenha` e `dentroDoVolume` (`regras.ts:951`, `:1024`)            | por `credencial_id` (§5.5)                                                                       |
| `acesso.senha_provisoria` (`:500`, `:511`, `:581`, `:603`, `:628`)                                         | sai: a provisória virou a etapa `ativar`                                                         |

### 5.4 Trocar de empresa

`dados` passa a levar `outras_empresas`: quantas **outras** empresas estão liberadas. Só conta quem prova a senha atual;
não há número de empresas esperando liberação (§4.3, defesa 3). Com uma ou mais liberadas, o cabeçalho mostra "Trocar
de empresa", que chama `empresas` (a lista das liberadas) e `trocar_empresa { funcionario_id }`. Sem pedir a senha de
novo (a sessão já provou), o servidor devolve o token da outra empresa e grava `login` com `via: "senha"` na trilha
dela, igual ao de quem entrou com a senha (§7: a trilha de uma empresa não diz que a pessoa veio de outra). O token novo
**vence junto com o de origem** (o `exp` é o do token
de origem, e o ttl passado a `signPortalToken` é o que sobra): alternar entre empresas não renova a sessão para sempre,
e passadas as 12 h do login a pessoa entra de novo com a senha. A sessão da empresa de origem vale até sair ou vencer.

### 5.5 Relógio do progresso e limites, por pessoa

Hoje o `ultimo_sinal_em` fica no acesso, um por funcionário: dois cursos abertos ao mesmo tempo dividem o mesmo relógio,
e a trava otimista da T31 credita o tempo uma vez só. Se o relógio ficasse no vínculo, a pessoa poderia assistir a um
curso da A e a outro da B ao mesmo tempo e somar o dobro, contra o período exclusivo do Anexo II 4.4 (T35). Por isso
ele vai para a credencial, e a trava da T31 continua igual (UPDATE só se o sinal ainda é o que o pedido leu). Pelo mesmo
motivo, os tetos de reconfirmação de senha (5 em 15 min) e de volume de `evento` e `progresso` passam a contar por
pessoa: duas sessões em empresas diferentes não dobram o teto.

## 6. Fim do 409 que revela o CPF em outra empresa

- O índice único global do usuário em `funcionario_portal_acesso` sai com a `0146`. Até lá o código novo grava
  `usuario` nulo no vínculo, e nulo não colide (§9.1). O índice único de `portal_credencial.usuario` não dispara no
  `criar` do RH: o servidor procura a credencial antes e liga o vínculo a ela ou a cria.
- `criar` para funcionário com CPF devolve **sempre** `{ usuario, senha_provisoria, url_path }`, exista ou não
  credencial daquele CPF em outra empresa: as mesmas chaves, o mesmo status, o mesmo texto. O RH não fica sabendo se a
  pessoa já usa o portal, nem na resposta nem depois, pela trilha da empresa dele (§7: o que só existiria por haver
  outra empresa vai para o registro do operador). A mensagem que a tela manda ao funcionário cobre os dois casos (§8).
- Os 409 que continuam, nenhum com dado de outra empresa:
  - `JA_TEM_ACESSO`: o cadastro **desta** empresa já tem vínculo. A T37 e o `avisarNoPortal`
    (`lib/portal-funcionario-acesso.js:169-186`) dependem dele, e o spec da T33 mantém a ordem "409 antes do 403".
  - `OUTRO_CADASTRO_COM_ACESSO`: outro cadastro **desta** empresa, ativo, da mesma pessoa (§3.3).
  - `USUARIO_EM_USO`: usuário com letras já existe; não é CPF.
- `status` (a lista da Ficha) mostra só os vínculos da empresa. O `ultimo_acesso` é o do vínculo (último acesso
  **nesta** empresa): o da credencial contaria quando a pessoa entrou na outra. O "Bloqueado" é o da credencial (§4.2,
  caso 6) e só aparece em vínculo `liberado` (§4.3, defesa 4).
- O que sobra (R3 e R11): quem tem a provisória da B vê a mesma tela com e sem senha (defesa 2) e não vê quantas
  empresas há (defesa 3). Descobre **se há senha** só por tentativa: criar senha nova é recusado quando a credencial já
  tem senha e o vínculo nunca foi confirmado (defesa 1), e a tentativa fica só no registro do operador (defesa 5), não
  na trilha da empresa dele. Não descobre a empresa. Quem tem a provisória pode ser o RH que cadastrou um CPF alheio de
  propósito: §4.3.

O que muda em `funcionario-acesso/index.ts` (o resto, inclusive as ações de matrícula, fica igual):

| Ação        | Hoje (linha)                                                                                                                                           | Passa a                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `criar`     | `:455-495`: insere a linha com o usuário e o hash da provisória em `senha_hash`; o 23505 vira o 409 (`:483-486`)                                       | procura a credencial do CPF (ou cria uma, sem senha) e cria o vínculo: `provisoria_hash`, `provisoria_criada_em` agora, `provisoria_expira_em` agora + 7 dias (P3), `geracao_liberada` e `confirmado_em` nulos. Resposta igual com e sem credencial; os 409 acima                                                                                                                                                                                                                                                                                                          |
| `redefinir` | `:497-517`: troca o hash, `senha_provisoria: true`, reativa (`ativo: true`), zera `tentativas` e `bloqueado_ate` (`:505-506`) e sobe a `sessao_versao` | nova provisória do vínculo (hash, `provisoria_criada_em`, `provisoria_expira_em`); zera `geracao_liberada` (a senha atual deixa de abrir esta empresa, §3.2); sobe a `sessao_versao` do vínculo; **continua reativando** o vínculo (`ativo = true`), com a recusa de `OUTRO_CADASTRO_COM_ACESSO` (§3.3); **deixa de** zerar `tentativas` e `bloqueado_ate`, que agora são da credencial (o RH de uma empresa não desbloqueia a pessoa nas outras); não sobe `senha_geracao` nem mexe na senha pessoal; religa o vínculo ao CPF novo quando está `cpf_mudou` (§4.2, caso 7) |
| `ativo`     | `:519-532`: grava `ativo` e, ao desativar, sobe a `sessao_versao`                                                                                      | o mesmo, no vínculo; ao reativar, a recusa de `OUTRO_CADASTRO_COM_ACESSO` (§3.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `status`    | `:385-406`: lê `usuario`, `senha_provisoria`, `bloqueado_ate` e `ultimo_acesso` da linha                                                               | só os vínculos da empresa, com a situação (§3.2); `usuario` da credencial; `ultimo_acesso` do vínculo; "Bloqueado" da credencial só em vínculo `liberado`                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 7. Trilha e certificado por empresa

- Tudo que é do curso continua no cadastro de cada empresa: matrícula, progresso, tentativas, certificado, dúvidas,
  ciências, documentos, declaração do ambiente (T35) e prática presencial (T12). Cada empresa vê só os seus, como hoje.
- **Curso feito numa empresa não vale na outra:** a B matricula e certifica de novo; o pré-requisito (T23) e o painel de
  vencimentos (T24) olham só a própria empresa. Aproveitar o curso da outra empresa é a D17 (NR-1 1.7.6 a 1.7.8), fora
  deste spec (P6).
- **Certificado:** emitido na empresa da sessão, com o cadastro, o logo, o instrutor e o RT dela. Nada muda em `dados`
  nem no hash; `assinatura.usuario` continua o CPF. A assinatura é a senha pessoal, a mesma nas duas empresas: a
  evidência continua "a dona da credencial assinou, nesta sessão, deste IP e deste dispositivo". A validação pública não
  muda.
- **Trilha:** cada evento vai para a trilha do cadastro da sessão, como hoje. Os eventos que acontecem antes de escolher
  a empresa, ou que mexem com a pessoa toda, ficam assim. A regra é que a trilha de uma empresa só grava o que ela
  gravaria se a pessoa usasse o portal só nela (a única exceção é o `acesso_aguardando_provisoria`, abaixo): o RH lê,
  na auditoria da matrícula e no dossiê, os eventos do funcionário sem matrícula (`MatriculaAuditoriaSheet.jsx:103-118`,
  `exportarDossieEad.js:88-96`), então o que a trilha grava ele fica sabendo sem ter agido. O que contaria o que a
  pessoa faz em outra empresa vai só para `portal_credencial_evento`, que o operador lê:

| Evento                                                                                                                  | Onde é gravado                                                             | Detalhe (sem dado de outra empresa)                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `login_falha` (inclusive o que bloqueia)                                                                                | trilha dos vínculos `liberado` da credencial; e `portal_credencial_evento` | trilha: `{ tentativa, bloqueou }`, sem IP e dispositivo; registro do operador: o mesmo, com IP e dispositivo                                                        |
| `login`                                                                                                                 | só a empresa escolhida                                                     | `{ via: "senha" \| "provisoria" }`. A troca de empresa (§5.4) grava o mesmo `login` de quem entrou com a senha                                                      |
| `acesso_liberado` (a provisória liberou o vínculo: primeira senha criada, ou senha atual confirmada, com ou sem troca)  | empresa da provisória                                                      | sem detalhe: a trilha não diz se a pessoa já tinha senha nem se a trocou                                                                                            |
| `senha_criada`, `acesso_confirmado`, `troca_senha` da etapa `ativar` e `reset_recusado` (criar senha nova negado, §4.3) | só `portal_credencial_evento`                                              | `senha_criada`: `{ primeira: true \| false }`; `acesso_confirmado`: `{ troca: true \| false }`; `troca_senha`: `{ via: "ativacao" }`; `reset_recusado`: sem detalhe |
| `acesso_aguardando_provisoria`                                                                                          | cada **outra** empresa que travou (estava `liberado` e deixou de estar)    | `{ motivo: "senha_nova" }`                                                                                                                                          |
| `troca_senha` voluntária (com sessão)                                                                                   | empresa da sessão                                                          | `{ via: "sessao" }`                                                                                                                                                 |
| `credencial_bloqueada`, `credencial_redefinida_pelo_operador`                                                           | só `portal_credencial_evento`                                              | `credencial_bloqueada`: `{ tentativa }`; o outro, com a empresa conferida e as ocupantes                                                                            |
| `acesso_criado`, `senha_redefinida`, `acesso_desativado`, `acesso_reativado`                                            | empresa do RH                                                              | `{ por }`, como hoje                                                                                                                                                |

O `acesso_aguardando_provisoria` deixa a B saber que a senha mudou sem a provisória dela (portanto, por outra empresa
ou, na fase 2, pelo próprio funcionário), mas não por qual. Só chega à B se ela estava `liberado`, isto é, se a pessoa
já entrava nela, e é o único evento em que a trilha de uma empresa mostra algo que aconteceu fora dela (R3). Sem ele, a
Ficha da B mostraria "Precisa de nova senha provisória" sem explicação. Quem sabe por qual empresa foi é o operador,
pelo `portal_credencial_evento`, e decide o que contar à vítima. Os eventos da trilha da empresa levam IP e dispositivo
(`registrarEvento`, `_shared/portal-funcionario.ts:111`); o `login_falha` é a exceção, gravado sem eles (§4.3, defesa
4). Os eventos novos entram na lista de rótulos da trilha do RH (T18) e são de origem `servidor` (T17).

## 8. Tela (proposta)

**Aluno** (`LoginPortal.jsx`, `pages/PortalFuncionario.jsx`):

- O login não muda. Depois da senha, com duas ou mais empresas: "Em qual empresa você quer entrar?", um botão por
  empresa, com logo e nome.
- Entrou com a provisória: **a mesma tela para todos** (§4.3, defesa 2), a de hoje, "Crie sua senha pessoal", com as
  regras da T27 e, no alto, o link "Já uso o portal em outra empresa". Embaixo, sempre, o aviso: "A senha nova vale em
  todas as empresas. Se você já usa o portal em outra empresa, o RH dela vai precisar te passar uma senha provisória
  nova."
- O link "Já uso o portal em outra empresa" troca o formulário por "Digite a senha que você já usa", com o botão
  "Entrar". Se o servidor responder `nova_senha_obrigatoria`, a tela pede, com a senha atual já digitada, a senha nova
  e a confirmação: "Por segurança, escolha uma senha nova, que só você conhece. A que você usa hoje foi criada com uma
  senha provisória, e quem gerou essa provisória pode saber qual é."
- `RESET_NEGADO` (criar senha nova recusado): "Esta senha provisória não pode criar uma senha nova. Se você já usa o
  portal em outra empresa, toque em "Já uso o portal em outra empresa" e digite a senha que você usa. Se não lembra
  dela, peça uma senha provisória ao RH de uma empresa em que você já entra. Se não entra mais em nenhuma, peça ao RH
  desta empresa que procure o suporte do SIGO." O texto é o mesmo para todos.
- `PEDIR_PROVISORIA`: "Seu acesso precisa ser liberado de novo. Peça ao RH a senha provisória."
- Dica fixa no rodapé do painel, igual para todos e sem número: "Trabalha em outra empresa e ela não aparece? Peça ao RH
  dela a senha provisória." Ela substitui o aviso com a contagem de empresas esperando (§4.3, defesa 3) e não diz o nome
  de nenhuma (R4).
- Cabeçalho: o nome da empresa (já existe) e "Trocar de empresa" quando houver outra liberada.
- Trocar a senha: aviso "A senha nova vale em todas as empresas em que você usa o portal."

**RH** (`AcessoPortalCard.jsx`, `lib/portal-funcionario-acesso.js`):

- Os mesmos botões ("Criar acesso", "Redefinir senha", "Desativar"/"Reativar"); a provisória continua aparecendo uma
  vez só.
- Selo novo "Precisa de nova senha provisória" (situações `travado` e `cpf_mudou`), com a dica "A senha do portal mudou
  ou o CPF do cadastro mudou. Gere uma senha provisória em Redefinir senha e entregue ao funcionário." O selo
  "Bloqueado" só aparece em vínculo liberado (§4.3, defesa 4). A Ficha não diz se a provisória pode ou não criar senha
  nova: isso revelaria se a credencial já tem senha.
- A mensagem do WhatsApp (`textoCredenciais` e `avisarNoPortal`) ganha uma linha: "Se você já usa o portal em outra
  empresa, entre com o CPF e esta senha provisória, toque em "Já uso o portal em outra empresa" e digite a senha que
  você já usa."

## 9. Plano

### 9.1 Migrações

Números: os próximos livres na hora, confirmados com o Javerson (hoje, nesta branch, `0145` e `0146`).

1. **`0145_portal_credencial.sql`** (antes do deploy):
   - cria `portal_credencial` e `portal_credencial_evento` (RLS ligada, sem policy, `revoke all` de `anon` e
     `authenticated`; índice único em `lower(usuario)` na credencial; `attach_updated_at_trigger`; o evento é só de
     inclusão, como `treinamento_evento`);
   - acrescenta ao vínculo `credencial_id`, `provisoria_hash`, `provisoria_criada_em`, `provisoria_expira_em`,
     `geracao_liberada` e `confirmado_em`, e cria o índice único parcial `(credencial_id, empresa_id) where ativo`;
   - tira só o `not null` de `usuario` e `senha_hash` e **mantém o índice único global do usuário até a `0146`**. O
     código novo grava `usuario` nulo no vínculo (nulo não colide), e a versão antiga, na janela do deploy, continua
     barrada pelo índice: o `criar` antigo recebe o 23505 e o 409 de hoje, e o login antigo acha uma linha por CPF (R8);
   - cria o trigger que apaga a credencial sem vínculo (`after delete or update of credencial_id`);
   - **copia** os acessos existentes, um para um (o usuário hoje é único):
     - `tipo` = `cpf` quando o usuário (só dígitos) é o CPF do cadastro (só dígitos); qualquer outro (usuário
       numérico diferente do CPF, usuário de 11 dígitos de cadastro sem CPF, usuário com letras) = `manual`, que
       continua entrando e não se junta a outra empresa;
     - acesso com senha pessoal (`senha_provisoria = false`): credencial com o hash, `senha_geracao` 1 e
       `senha_origem_empresa_id` = a empresa do acesso (a pessoa a criou com a provisória dela, então o caso 2 pede a
       troca quando ela entrar numa empresa nova, e trocar a senha dentro da empresa não tira a origem); vínculo
       liberado na geração 1, com `confirmado_em` = o último acesso (ou agora);
     - acesso com provisória pendente (`senha_provisoria = true`): credencial sem senha e geração 0; o hash antigo
       vira o `provisoria_hash` do vínculo, sem vencimento (a provisória já entregue continua valendo), com
       `geracao_liberada` e `confirmado_em` nulos.

   É idempotente (`on conflict do nothing`, só linhas sem `credencial_id`) e termina com `select 'ok' as res;`. No
   cabeçalho do arquivo vai a consulta de conferência que o Javerson roda antes: lista os acessos com usuário numérico
   diferente do CPF do cadastro e os CPFs que coincidem com um usuário `manual` (§3.3).

2. **`0146_portal_credencial_limpeza.sql`** (dias depois do deploy, conferido o uso): repete a cópia para linhas sem
   `credencial_id` (criadas pela versão antiga na janela do deploy), põe `credencial_id not null`, tira o índice único
   global do usuário e as colunas que foram para a credencial (`usuario`, `senha_hash`, `senha_provisoria`,
   `tentativas`, `bloqueado_ate`, `ultimo_sinal_em`).

A cópia grava em linhas reais, contra a regra "sem UPDATE de dados reais" das migrações do handoff (§5). É dado de
acesso, não de negócio, e evita recriar os acessos à mão; mesmo assim, é exceção a aprovar (P7). Sem a cópia, o RH
recria os acessos depois do deploy. Hoje são poucos (2 em 30/09, nunca usados).

### 9.2 Código e testes (TDD, depois do OK)

Regras em módulo puro, com `node:test`. `supabase/functions/_shared/portal-credencial.ts` + `.test.ts`:

- `usuarioDoAcesso` (CPF do cadastro com dígitos certos, usuário com letras, recusa de usuário só com números) e
  `cpfValido`;
- `situacaoDoVinculo` (a tabela da §3.2 inteira, inclusive `geracao_liberada` nulo e a provisória vencida);
- `conferirLogin` (as K = 4 comparações da §5.1; recebe a função `comparar` por injeção, e o teste **conta as chamadas**
  em cada caminho: credencial inexistente, sem senha, com senha certa e errada, com 0, 1, 3 e 5 provisórias. Sempre 4, e
  só as três provisórias mais recentes valem);
- `decidirLogin` (as etapas da §5.1; o teste confere que a etapa `senha_provisoria` tem as mesmas chaves, e nenhum
  `tem_senha`, com e sem senha na credencial);
- `sessaoValida` (cada item da §5.3) e `vinculoEscolhido`;
- `efeitoDaSenhaNova` (geração, vínculo liberado, quais travam; o teste confere a regra do §4.2: com origem não nula,
  só a origem fica liberada), `podeCriarSenhaNova` (defesa 1: credencial sem senha aceita qualquer vínculo; com senha,
  só vínculo com `confirmado_em`; o hash inutilizável do operador conta como "com senha", então um vínculo sem
  `confirmado_em` não cria senha nova nele, e o da empresa conferida cria), `exigeTrocaNaAtivacao` (caso 2:
  `senha_origem_empresa_id` de outra empresa exige a troca, inclusive depois de um `trocar_senha` na empresa de origem;
  nulo ou da mesma empresa não exige) e
  `origemDepoisDaTroca` (`trocar_senha` e a troca da `ativar` na própria empresa de origem mantêm a origem; só a troca
  da `ativar` em outra empresa a zera; origem nula continua nula);
- `decidirCriarVinculo` (liga, cria, `OUTRO_CADASTRO_COM_ACESSO` ao criar e ao reativar, `USUARIO_EM_USO`; o teste
  confere que a resposta do `criar` tem as mesmas chaves com e sem credencial em outra empresa).

Mais:

- `_shared/portal-funcionario.ts`: `registrarEvento` ganha a opção de gravar sem IP e dispositivo (defesa 4), com teste.
- `funcionario-acesso/regras.ts`: `criar`, `redefinir` e `ativo` sobre o vínculo (a tabela da §6), junto com o
  `decidirCriar` do spec da T33 (a ordem "409 antes do 403" continua).
- Front: `apps/web/src/lib/portal-login.js` + teste Vitest (qual tela mostrar para cada resposta do login e os textos) e
  `statusAcesso` com o selo novo. Um teste de paridade importa `cpfValido` do servidor e `validarCpf` de `lib/cpf.js` e
  roda nas duas a mesma lista de CPFs válidos e inválidos (modelo: `portal-senha.test.js`, que importa o servidor).
- Smoke `tools/smoke-portal-credencial.sql` (`begin; ... rollback;`, sem UUID real, que o Javerson roda): a cópia da
  `0145` nos três tipos de linha (§9.1), o índice parcial e o trigger da credencial sem vínculo, inclusive o `update`, e
  o procedimento do operador (§4.3) numa credencial sintética com um ocupante: o hash fica preenchido, só a empresa
  conferida fica com `confirmado_em`, nenhum vínculo fica com `geracao_liberada` e o vínculo do ocupante fica
  desativado (o smoke repete o corpo do script).
- Para o operador (§4.3, defesa 5), em `tools/`, que o Javerson roda e o agente não: `portal-credencial-alertas.sql`
  (só leitura, as três regras da defesa 5) e `portal-credencial-redefinir.sql` (o procedimento do operador da §4.3, por
  usuário, com a empresa conferida e as ocupantes como parâmetros, dentro de `begin; ... commit;`; sem vínculo ativo de
  cadastro ativo na empresa conferida, não muda nada).

Arquivos que mudam: `portal-funcionario/index.ts` (login, sessão, `ativar`, `escolher_empresa`, `empresas`,
`trocar_empresa`, `trocar_senha`, sinal, limites), `funcionario-acesso/index.ts` (`criar`, `redefinir`, `ativo`,
`status`), `_shared/portal-funcionario.ts`, `LoginPortal.jsx`, `pages/PortalFuncionario.jsx`, `AcessoPortalCard.jsx`,
`lib/portal-funcionario-acesso.js` e o handoff (§2.2 diz "usuário (único global)").

### 9.3 Produção (o Javerson, na ordem, quando a implementação estiver pronta)

1. Migração `0145`, depois de rodar a consulta de conferência do cabeçalho.
2. Deploy de `portal-funcionario` e de `funcionario-acesso` (os dois com `--no-verify-jwt`), logo em seguida.
3. Push do front no mesmo dia: o primeiro acesso muda de forma (etapa `ativar`), e o portal antigo com o servidor novo
   não conclui o primeiro acesso.
4. Dias depois, conferido o uso: migração `0146`.

Os dois scripts do operador ficam em `tools/` e não rodam no deploy.

**Nesta etapa (T38, só o spec): nada vai para produção.**

## 10. Riscos

- **R1 — O RH entra como o funcionário com a provisória.** Já acontece hoje. Continua restrito à empresa daquele RH:
  senha criada com a provisória só trava as outras se o vínculo dele é `confirmado` (§4.3), e a senha que ele conhece
  não abre outra empresa: a origem fica nela até a pessoa escolher uma senha nova na outra empresa (caso 2, troca
  obrigatória, P10), e trocar a senha dentro da empresa de origem não tira a origem, porque quem a troca ali sabe a
  atual. O que sobra é próprio da senha única da D16: se a pessoa deixa um RH digitar a senha dela, inclusive a senha
  nova da troca obrigatória, esse RH passa a conhecê-la, e ela abre todas as empresas liberadas. O uso fica na trilha
  com IP e dispositivo.
- **R2 — Indisponibilidade cruzada.** Uma empresa em que a pessoa já entrou com a senha (ou a própria pessoa, pelo
  "criar senha nova") trava as outras até cada uma gerar provisória nova. Não expõe dado, mas atrapalha quem está em
  duas empresas. A empresa em que a pessoa nunca entrou com a senha não consegue (defesa 1). Duas lacunas ficam: (a) o
  **ex-empregador** mantém esse poder enquanto o RH dele puder reativar o cadastro e clicar "Redefinir senha", porque o
  `confirmado_em` não é apagado pelo fluxo normal (§3.1); (b) quem **saiu da A, entrou na B e esqueceu a senha** (o caso
  que motivou a D16) não tem saída na tela: o vínculo confirmado é o da A, com cadastro inativo, e o da B nunca foi
  confirmado. O caminho é o RH da B, o suporte do SIGO e o procedimento do operador (§4.3): uma intervenção do operador
  por pessoa, que a P11 pede para aceitar e a P12 propõe evitar. Mitigação: o selo e o evento explicam ao RH o que
  fazer; a fase 2 (opção C) tira o RH do caminho, para quem tem telefone confirmado.
- **R3 — Vazamento residual.** Quem tem a provisória da B não vê, ao entrar, se o CPF já tem senha (mesma tela,
  defesa 2) nem quantas empresas há (defesa 3). Ainda descobre **se há senha**, por tentativa: criar senha nova é
  recusado quando a credencial já tem senha e o vínculo nunca foi confirmado (defesa 1). Não descobre a empresa. Quem
  tem a provisória é o funcionário ou o RH que a gerou, e este pode ser o adversário do R11: a tentativa fica no
  registro do operador (defesa 5) e não na trilha da empresa dele, que o próprio RH leria sem ter agido (§7). A trilha
  de uma empresa só mostra algo de fora dela em um caso, o `acesso_aguardando_provisoria`, num vínculo que já estava
  liberado (a pessoa já entrava ali): ele diz que a senha mudou, sem dizer onde nem por quem.
- **R4 — CPF digitado errado** liga o cadastro à credencial de outra pessoa. Nenhum dado cruza (a outra pessoa não sabe
  a senha da credencial; a empresa travada não aparece pelo nome), mas as duas pessoas se travam uma à outra a cada
  senha nova. Mitigação: dígitos verificadores ao criar o acesso; `cpf_mudou` e "Redefinir senha" religam o vínculo
  quando o RH corrige o CPF. Digitar o CPF alheio de propósito é o R11.
- **R5 — Bloqueio por senhas erradas é da pessoa.** Quem digitar 5 vezes o CPF de outro com senha errada bloqueia o
  portal dele por 15 min em todas as empresas (hoje, na única). O limitador por IP segura rajadas; a provisória continua
  entrando (§4.2, caso 6).
- **R6 — Credencial fora de qualquer empresa.** CPF e hash da senha passam a ser dado da plataforma, não de um cliente;
  quem responde por eles é a Sinergia Digital (operadora do SaaS). O termo de uso do portal deveria dizer isso e
  **proibir cadastrar CPF de outra pessoa** (R11). A credencial sem vínculo é apagada na exclusão física; a exclusão
  lógica do cadastro não a apaga, e varrer essas credenciais é a política de retenção da D11 (§3.1).
- **R7 — Sessões caem no deploy:** os tokens antigos não têm `credencial_id`; todo mundo entra de novo.
- **R8 — Janela entre a `0145` e o deploy:** a versão antiga ainda grava nas colunas antigas. A `0145` **mantém o índice
  único global** do usuário até a `0146`, então o `criar` antigo continua recebendo o 23505 e o login antigo continua
  achando uma linha por CPF. Linha criada pela versão antiga na janela não tem `credencial_id`: o login novo não a
  reconhece até a `0146` repetir a cópia. Mitigação: deploy logo depois da migração. Hoje não há uso real.
- **R9 — Pessoa sem CPF numa empresa e com CPF na outra** tem dois logins até a primeira cadastrar o CPF e redefinir a
  senha (o vínculo passa para a credencial do CPF, §4.2, caso 7).
- **R10 — Tempo da resposta do login** poderia dizer se o CPF tem credencial, se ela tem senha ou quantas provisórias
  tem pendentes. O servidor faz sempre as mesmas 4 comparações, sem sair antes, e o teste da `conferirLogin` conta as
  chamadas de cada caminho (§5.1). O custo é 4 bcrypts por login em vez de 1.
- **R11 — Cadastro com o CPF de outra pessoa, de propósito.** O SIGO não confere o CPF do cadastro (§4.3): uma empresa
  cliente mal-intencionada, com Funcionários → `editar`, liga um cadastro dela à credencial de qualquer pessoa. Com as
  defesas da §4.3 ela **não** troca a senha de quem já usa o portal, não vê quantas empresas a pessoa tem e não recebe
  IP nem dispositivo de quem erra a senha. Sobra: (a) descobrir por tentativa se o CPF tem senha (R3); (b) se o CPF
  ainda **não tinha senha**, criar a primeira e ocupar o CPF: a empresa real que cadastrar depois não consegue criar a
  senha da pessoa, e a saída é o procedimento do operador, que confere a identidade fora do sistema e tira o poder do
  ocupante (desativa o vínculo dele e zera o `confirmado_em`); (c) errar a senha e bloquear a pessoa por 15 min (R5).
  Hoje o mesmo cadastro falso já ocupa o CPF pelo 409, sem saída para a empresa real. Detecção: o registro e a consulta
  de alerta do operador (defesa 5); dissuasão: o termo de uso (R6). Aceitar o que sobra é a P9 e a P11.

## 11. Perguntas ao Javerson

| #   | Pergunta                                                                                                                                                                                                                                     | Recomendação                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Qual opção da §4.1 para criar, redefinir e desativar a senha?                                                                                                                                                                                | A                                                                                                                                   |
| P2  | Na opção A, quem cria senha nova com a provisória de uma empresa em que já entrou com a senha trava as outras até cada uma gerar provisória nova. Aceita esse custo?                                                                         | Sim: é o que impede o RH de uma empresa de entrar na outra                                                                          |
| P3  | A senha provisória passa a vencer (hoje não vence)?                                                                                                                                                                                          | Sim, em 7 dias                                                                                                                      |
| P4  | Fase 2 com "Esqueci a senha" pelo WhatsApp que o próprio funcionário confirmou (opção C)?                                                                                                                                                    | Só se pedir a provisória de cada empresa incomodar no uso                                                                           |
| P5  | Na tela, manter o nome "senha provisória" (e não "código de acesso")?                                                                                                                                                                        | Sim: o RH e os funcionários já conhecem                                                                                             |
| P6  | Curso feito numa empresa não vale na outra (cada uma matricula e certifica)?                                                                                                                                                                 | Sim; aproveitar é a D17                                                                                                             |
| P7  | A migração copia os acessos existentes (a provisória já entregue continua valendo) ou o RH os recria depois do deploy?                                                                                                                       | Copiar                                                                                                                              |
| P8  | Usuário só com números passa a ser só o CPF do próprio cadastro, e o CPF precisa ter os dígitos verificadores certos para criar o acesso?                                                                                                    | Sim                                                                                                                                 |
| P9  | Aceita as defesas da §4.3 contra cadastro com CPF alheio (só vínculo já confirmado cria senha nova, mesma tela com e sem senha, registro e consulta de alerta para o operador)? Avisar o operador por WhatsApp fica para depois.             | Sim: limita o estrago sem exigir prova de identidade; o que sobra é o R11                                                           |
| P10 | Ao entrar na segunda empresa, quem tem a senha criada com a provisória da primeira (mesmo que a tenha trocado dentro da primeira) escolhe uma senha nova na própria segunda (um passo a mais, uma vez só)?                                   | Sim: sem isso o RH que viu ou digitou a senha entraria na outra empresa. Sobra o RH a quem a pessoa deixa digitar a senha nova (R1) |
| P11 | O CPF ocupado antes pela empresa real, e quem saiu da empresa em que era confirmado e esqueceu a senha, só se resolvem pelo operador: o RH pede ao suporte do SIGO, que confere a pessoa fora do sistema e roda o script. Aceita esse canal? | Sim, enquanto for raro; se virar rotina, a opção C (fase 2) cobre quem já confirmou o WhatsApp                                      |
| P12 | Quando a credencial tem senha mas nenhuma empresa confirmada e ativa, o vínculo não confirmado pode criar senha nova sem passar pelo operador?                                                                                               | Não: o cadastro falso tomaria a credencial de quem não trabalha em nenhuma empresa do SIGO; rever se o operador virar gargalo       |
