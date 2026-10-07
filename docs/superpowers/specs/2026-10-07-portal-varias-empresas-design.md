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
outra empresa ela está.

**Fora do escopo:**

- Aproveitar na empresa B um curso feito na empresa A (D17, aproveitamento e convalidação). Cada empresa matricula,
  acompanha e certifica os seus (§7).
- Recuperar a senha sem o RH, pelo WhatsApp da própria pessoa: fica como fase 2 (opção C da §4, P4).
- Portais de fornecedor e de cliente (usam o mesmo `_shared/portal-token.ts`, mas outro login).
- Histórico da readmissão: o cadastro antigo e o novo da mesma pessoa na mesma empresa continuam separados; a §3.3 só
  evita dois acessos ativos.
- Quem pode criar, redefinir e desativar o acesso dentro da empresa: é a T33 (continua Funcionários → `editar`).

## 3. Modelo: a pessoa (credencial) e os vínculos (um por cadastro)

### 3.1 Tabelas

| Tabela                                                  | Uma linha por                     | Guarda                                                                                                                                                                                                                       | Quem lê e grava                                                                |
| ------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `portal_credencial` (nova)                              | pessoa (usuário)                  | `usuario` (CPF ou usuário com letras), `tipo` (`cpf`/`manual`), hash da senha pessoal (nulo até a pessoa criar), `senha_geracao`, `sessao_versao`, `tentativas`, `bloqueado_ate`, `ultimo_sinal_em`, `senha_alterada_em`     | só o servidor: RLS ligada, sem policy, `revoke` de `anon` e de `authenticated` |
| `funcionario_portal_acesso` (fica e vira o **vínculo**) | cadastro de funcionário (empresa) | `credencial_id`, `empresa_id`, `ativo`, `sessao_versao` do vínculo, `ultimo_acesso` nesta empresa, provisória pendente (`provisoria_hash`, `provisoria_criada_em`, `provisoria_expira_em`), `geracao_liberada`, `criado_por` | só o servidor (como hoje)                                                      |

- `portal_credencial` **não tem `empresa_id`**: é a identidade da pessoa na plataforma, como `auth.users` é a do
  usuário do SIGO. É exceção declarada à regra 5 do `AGENTS.md`: a tabela não é de negócio, não tem policy e o servidor
  só a lê por `id` (vindo do token) ou por `usuario` (vindo do login), nunca em lista. O trigger
  `referencias_da_empresa` (`0118`) não se aplica a `credencial_id`.
- O vínculo continua com chave `funcionario_id`, um por cadastro. Matrícula, progresso, prova, certificado, trilha,
  dúvida, ciência e documentos continuam ligados ao `funcionario_id` de cada empresa: **nenhuma tabela do EAD muda**.
- Saem do vínculo (vão para a credencial): `usuario`, `senha_hash`, `senha_provisoria`, `tentativas`, `bloqueado_ate`,
  `ultimo_sinal_em`. Sai também o índice único global `funcionario_portal_acesso_usuario_uidx`, a origem do 409.
- Índice único novo: um vínculo **ativo** por pessoa e empresa (`credencial_id, empresa_id where ativo`).
- Credencial sem nenhum vínculo (todos os cadastros apagados) é apagada junto, por trigger `after delete` no vínculo:
  CPF e hash não ficam guardados sem motivo (LGPD, minimização).

### 3.2 Situação do vínculo

Calculada pelo servidor (função pura `situacaoDoVinculo`, §9.2), na ordem da tabela:

| Situação                | Quando                                                                                                                                             | Abre com a senha pessoal?    | O que o RH vê na Ficha           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------- |
| `desativado`            | `ativo = false`                                                                                                                                    | não                          | Desativado                       |
| `cadastro_inativo`      | funcionário inativo ou apagado                                                                                                                     | não                          | (o cadastro já aparece inativo)  |
| `cpf_mudou`             | credencial `cpf` e o CPF do cadastro (só dígitos) é outro                                                                                          | não                          | Precisa de nova senha provisória |
| `aguardando_provisoria` | há provisória pendente e não vencida                                                                                                               | não (entra com a provisória) | Aguardando 1º acesso             |
| `liberado`              | `geracao_liberada` igual à `senha_geracao` da credencial                                                                                           | sim                          | Ativo                            |
| `travado`               | nenhum dos anteriores: a senha foi criada com a provisória de **outra** empresa depois que esta foi liberada, ou a provisória desta venceu sem uso | não                          | Precisa de nova senha provisória |

"Bloqueado" (senhas erradas) é da credencial, porque é a mesma pessoa errando, e aparece por cima da situação, como
hoje.

### 3.3 Usuário: o CPF junta as empresas; o usuário com letras não

- **Funcionário com CPF no cadastro:** o usuário é **sempre** o CPF dele, só os dígitos. O `usuario` do corpo é
  ignorado (hoje o servidor aceita outro usuário mesmo com CPF, `funcionario-acesso/index.ts:463`; a tela só o manda
  quando não há CPF, então nada muda na tela). O CPF precisa ter os dígitos verificadores certos (hoje só o tamanho é
  conferido, `:467-472`): CPF digitado errado ligaria o cadastro à credencial de outra pessoa (R4). A conta é a mesma de
  `apps/web/src/lib/cpf.js`, repetida no módulo puro do servidor.
- Se já existe credencial `cpf` com aquele CPF, de qualquer empresa, o vínculo novo **aponta para ela**. Senão, nasce a
  credencial, sem senha.
- **Funcionário sem CPF:** usuário com letras (T27), credencial `manual` de **um vínculo só**. Ela não se junta com
  nada, porque um nome de usuário não prova quem é a pessoa. Usuário só com números passa a ser recusado ("Usuário só
  com números é CPF: cadastre o CPF no funcionário"); senão, serviria para ligar o cadastro ao CPF de outra pessoa.
- Usuário com letras já usado (em qualquer empresa): 409 `USUARIO_EM_USO`, "Este usuário já existe no portal. Escolha
  outro, por exemplo joao.silva2". Não envolve CPF.
- **Mesma pessoa com dois cadastros ativos na mesma empresa:** 409 `OUTRO_CADASTRO_COM_ACESSO`, com o nome e a admissão
  do outro cadastro (dado da própria empresa). Se o outro cadastro está inativo ou apagado, o vínculo velho é desativado
  e o novo nasce (readmissão).

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

| Opção                                                                                                     | Criar                                                                                                             | Esqueci a senha                                                                                                                                             | Desativar                 | Efeito de uma empresa sobre a outra                                                                                  | A favor                                                                                  | Contra                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A (recomendada):** provisória por empresa; senha criada com a provisória de uma empresa trava as outras | o RH gera a provisória do vínculo dele; com ela a pessoa cria a senha (se ainda não tem) ou confirma a que já usa | o RH de qualquer empresa da pessoa gera nova provisória; com ela a pessoa cria senha nova, que abre só aquela empresa até cada outra gerar a sua provisória | cada RH só o vínculo dele | senha criada com a provisória da A **trava** a B até a B gerar nova provisória (indisponibilidade, sem dado exposto) | nenhum RH entra em outra empresa; nenhum canal novo; os botões do RH continuam os mesmos | quem esquece a senha e está em duas empresas precisa de uma provisória de cada                                                                                                                                                             |
| B: a primeira empresa é dona da senha                                                                     | só a dona gera provisória que cria senha; as outras só ligam o vínculo (a pessoa confirma a senha)                | só a dona                                                                                                                                                   | cada RH o vínculo dele    | a dona controla a senha usada nas outras                                                                             | simples                                                                                  | a dona pode ter desligado o funcionário ou ser concorrente da outra; passar a "posse" vira regra nova                                                                                                                                      |
| C: recuperação pelo próprio funcionário (WhatsApp)                                                        | como na A                                                                                                         | "Esqueci a senha" manda um código ao WhatsApp **que a própria pessoa cadastrou e confirmou** na credencial; o RH só em último caso (aí vale a A)            | como na A                 | nenhum, quando a pessoa recupera sozinha                                                                             | quem esquece não depende de RH nenhum                                                    | depende do canal WhatsApp do SaaS no ar; o telefone tem de ser o da credencial, confirmado pela pessoa (não o `funcionario.telefone`, que hoje qualquer usuário da empresa troca pela API, ver o spec da T33, §2); mais código e mais tela |
| D: qualquer RH redefine, e a senha nova vale em todas                                                     | o RH gera a provisória                                                                                            | qualquer RH                                                                                                                                                 | cada RH o vínculo dele    | o RH da A entra no portal da pessoa na B: documentos, contracheque, prova, assinatura do certificado                 | o mais simples                                                                           | **vazamento entre empresas: descartada**                                                                                                                                                                                                   |

**Recomendação:** A agora. C como fase 2, se pedir a provisória de cada empresa incomodar no uso (P4). A opção A também
convive com o C2 da T33 (servidor manda a provisória pelo WhatsApp do funcionário): a provisória continua por empresa.

### 4.2 Como a opção A funciona

Três conceitos:

- **`senha_geracao` (credencial):** sobe de 1 cada vez que a senha é **criada com uma provisória** (a primeira senha ou
  "não lembro a senha"). Trocar a senha informando a atual não sobe: quem sabe a senha atual já abria todas as empresas.
- **`geracao_liberada` (vínculo):** a geração em que aquela empresa foi liberada. A empresa abre com a senha pessoal só
  quando `geracao_liberada = senha_geracao`.
- **Senha provisória (vínculo):** gerada pelo RH, aparece uma vez, o banco guarda só o hash; vale para **aquela
  empresa**. Hoje ela não vence; a proposta é vencer em 7 dias (P3).

Os casos:

1. **Primeiro acesso de quem ainda não tem senha** (igual a hoje para quem está numa empresa só): o RH da A clica "Criar
   acesso" e entrega o usuário (CPF) e a provisória. A pessoa entra com CPF e provisória e cria a senha. Geração 1; A
   liberada.
2. **Quem já usa o portal na A entra na B:** o RH da B clica "Criar acesso" e recebe **a mesma resposta** do caso 1
   (§6). A pessoa entra com CPF e a provisória da B; o portal diz que ela já tem senha e pede a senha que ela usa. Senha
   certa: B liberada, sem mudar nada na A. Daí em diante, CPF e senha levam à escolha entre A e B.
3. **Esqueceu a senha:** o RH de qualquer empresa dela (digamos a B) clica "Redefinir senha" e entrega a provisória. A
   pessoa entra com ela e escolhe "Não lembro a senha: criar uma nova". A geração sobe, a B fica liberada, **a A fica
   travada** e todas as sessões abertas caem. A pessoa pede a provisória ao RH da A e, com ela, confirma a senha nova
   (caso 2): A liberada.
4. **O RH desconfia que alguém sabe a senha:** "Redefinir senha" na B tira a liberação da B na hora (a senha atual deixa
   de abrir a B e as sessões da B caem), como hoje. A outra empresa não muda. Se a pessoa criar senha nova com a
   provisória, cai no caso 3: as outras travam, e quem sabia a senha antiga perde todas.
5. **Desativar:** só o vínculo daquela empresa (`ativo = false`; as sessões daquela empresa caem). Reativar devolve a
   situação anterior. Nenhum RH desativa a credencial inteira; sem nenhum vínculo que abra, o login responde como no
   §5.1.
6. **Senhas erradas:** o bloqueio (5 erros, 15 min) é da credencial e vale em todas as empresas. Entrar com uma
   provisória válida não é barrado pelo bloqueio, porque é outro segredo, novo; confirmar a senha atual depois da
   provisória é barrado, porque é uma tentativa de senha. Criar senha nova com a provisória zera o bloqueio. "Redefinir
   senha" não mexe no bloqueio (é da pessoa, não da empresa).
7. **CPF corrigido no cadastro:** o vínculo para de abrir (`cpf_mudou`). "Redefinir senha" religa o vínculo à credencial
   do CPF novo (ou cria uma); a credencial velha, se ficar sem vínculo, é apagada.

O que o RH da A consegue com a provisória dele: entrar como o funcionário **na A** (como hoje) e, se criar senha nova,
travar as outras empresas (indisponibilidade, gravada nas trilhas). O que ele **não** consegue: abrir a B, ver o nome da
B, liberar a B.

## 5. Login, escolha da empresa e sessão

### 5.1 Etapas do login

`login { usuario, senha }`, com o limitador de hoje antes de tudo (IP e conta = usuário,
`portal-funcionario/index.ts:432-436`):

1. Busca a credencial pelo usuário. Não existe: compara com o hash fictício e responde 401 `CREDENCIAIS` (como hoje).
2. A senha confere com a senha pessoal:
   - bloqueado: 423 `BLOQUEADO` (como hoje);
   - nenhuma empresa `liberado`: se alguma está `travado`, `cpf_mudou` ou `aguardando_provisoria`, 403
     `PEDIR_PROVISORIA` ("Seu acesso precisa ser liberado de novo: peça ao RH a senha provisória"); senão, se alguma
     está `cadastro_inativo`, 403 "Cadastro inativo — fale com o RH"; senão, 403 `DESATIVADO`. As duas últimas são as
     de hoje. A mensagem **não diz o nome** da empresa (R4);
   - uma empresa `liberado`: entra direto, com a resposta de hoje (`{ token, nome }`);
   - duas ou mais: `{ etapa: "escolher_empresa", token_escolha, empresas: [{ id, nome, logo_url }] }`, só com as
     liberadas. `id` é o `funcionario_id` daquele cadastro (dado da própria pessoa).
3. Não confere com a senha pessoal, mas confere com a provisória pendente de um vínculo da credencial (vínculo ativo,
   cadastro ativo, provisória não vencida): `{ etapa: "senha_provisoria", token_ativacao, empresa: { nome },
tem_senha }`. A credencial ainda sem senha (nunca entrou) sempre cai aqui ou no passo 4.
4. Nada confere: conta a falha na credencial (bloqueia na 5ª), grava `login_falha` na trilha de cada vínculo ativo e
   responde 401 `CREDENCIAIS`.

Comparar a senha com N provisórias leva N vezes o tempo de um bcrypt. Para o tempo da resposta não contar quantas
empresas a pessoa tem, o servidor faz sempre o mesmo número de comparações, completando com o hash fictício.

Ações novas, sem sessão:

- `escolher_empresa { token_escolha, funcionario_id }`: confere que o cadastro é da credencial do token e está
  `liberado`; devolve a sessão daquela empresa.
- `ativar { token_ativacao, senha_atual }` (caso 2) ou `ativar { token_ativacao, nova_senha }` (casos 1 e 3): libera o
  vínculo da provisória, apaga o hash da provisória e devolve a sessão daquela empresa. `nova_senha` passa pelas regras
  de hoje (`motivoSenhaInvalida`, T27) e sobe a geração. `senha_atual` só vale com `tem_senha`.

Os tokens intermediários vencem rápido: escolha em 5 min; ativação em 10 min, amarrada à provisória
(`provisoria_criada_em`), para uma provisória nova anular o token da anterior.

`trocar_senha` (com sessão) passa a exigir sempre a senha atual: o primeiro acesso virou a etapa `ativar`, e a trava
`TROCAR_SENHA` (`index.ts:628-630`) sai.

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

A conferência do começo de toda ação com sessão (`index.ts:514-546`) vira a função pura `sessaoValida`: a credencial
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

`dados` passa a levar `outras_empresas` (quantas outras estão liberadas) e `empresas_aguardando` (quantas esperam
provisória, sem nome). Com uma ou mais liberadas, o cabeçalho mostra "Trocar de empresa", que chama `empresas` (a lista
das liberadas) e `trocar_empresa { funcionario_id }`. Sem pedir a senha de novo (a sessão já provou), o servidor
devolve o token da outra empresa e grava `login` com `detalhe.via = "troca_de_empresa"` na trilha dela. A sessão da
empresa de origem vale até sair ou vencer.

### 5.5 Relógio do progresso e limites, por pessoa

Hoje o `ultimo_sinal_em` fica no acesso, um por funcionário: dois cursos abertos ao mesmo tempo dividem o mesmo relógio,
e a trava otimista da T31 credita o tempo uma vez só. Se o relógio ficasse no vínculo, a pessoa poderia assistir a um
curso da A e a outro da B ao mesmo tempo e somar o dobro, contra o período exclusivo do Anexo II 4.4 (T35). Por isso
ele vai para a credencial, e a trava da T31 continua igual (UPDATE só se o sinal ainda é o que o pedido leu). Pelo mesmo
motivo, os tetos de reconfirmação de senha (5 em 15 min) e de volume de `evento` e `progresso` passam a contar por
pessoa: duas sessões em empresas diferentes não dobram o teto.

## 6. Fim do 409 que revela o CPF em outra empresa

- Sai o índice único global do usuário em `funcionario_portal_acesso`. O índice único de `portal_credencial.usuario`
  não dispara no `criar` do RH: o servidor procura a credencial antes e liga o vínculo a ela ou a cria.
- `criar` para funcionário com CPF devolve **sempre** `{ usuario, senha_provisoria, url_path }`, exista ou não
  credencial daquele CPF em outra empresa: as mesmas chaves, o mesmo status, o mesmo texto. O RH não fica sabendo se a
  pessoa já usa o portal. A mensagem que a tela manda ao funcionário cobre os dois casos (§8).
- Os 409 que continuam, nenhum com dado de outra empresa:
  - `JA_TEM_ACESSO`: o cadastro **desta** empresa já tem vínculo. A T37 e o `avisarNoPortal`
    (`lib/portal-funcionario-acesso.js:169-186`) dependem dele, e o spec da T33 mantém a ordem "409 antes do 403".
  - `OUTRO_CADASTRO_COM_ACESSO`: outro cadastro **desta** empresa, ativo, da mesma pessoa (§3.3).
  - `USUARIO_EM_USO`: usuário com letras já existe; não é CPF.
- `status` (a lista da Ficha) mostra só os vínculos da empresa. O `ultimo_acesso` é o do vínculo (último acesso
  **nesta** empresa): o da credencial contaria quando a pessoa entrou na outra. O "Bloqueado" é o da credencial (§4.2,
  caso 6).
- O que sobra (R3): quem tem a provisória da B e entra com ela descobre se o CPF já tinha senha no portal, porque a
  etapa pede a senha atual. Não descobre a empresa. Só o funcionário e o RH que gerou a provisória a têm, e o uso fica
  na trilha com IP e dispositivo.

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
  a empresa, ou que mexem com a pessoa toda, ficam assim:

| Evento                                                                       | Onde é gravado                             | Detalhe (sem dado de outra empresa)                      |
| ---------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| `login_falha` (inclusive o que bloqueia)                                     | trilha de cada vínculo ativo da credencial | `{ tentativa, bloqueou }`, como hoje                     |
| `login`                                                                      | só a empresa escolhida                     | `{ via: "senha" \| "provisoria" \| "troca_de_empresa" }` |
| `senha_criada` (provisória usada para criar a senha)                         | empresa da provisória                      | `{ primeira: true \| false }`                            |
| `acesso_confirmado` (provisória usada com a senha atual)                     | empresa da provisória                      | sem detalhe                                              |
| `acesso_aguardando_provisoria`                                               | cada **outra** empresa que travou          | `{ motivo: "senha_nova" }`                               |
| `troca_senha` (voluntária)                                                   | empresa da sessão                          | como hoje                                                |
| `acesso_criado`, `senha_redefinida`, `acesso_desativado`, `acesso_reativado` | empresa do RH                              | `{ por }`, como hoje                                     |

O `acesso_aguardando_provisoria` deixa a B saber que a senha mudou sem a provisória dela (portanto, por outra empresa
ou, na fase 2, pelo próprio funcionário), mas não por qual. Sem ele, a Ficha da B mostraria "Precisa de nova senha
provisória" sem explicação. Os eventos novos entram na lista de rótulos da trilha do RH (T18) e são de origem
`servidor` (T17).

## 8. Tela (proposta)

**Aluno** (`LoginPortal.jsx`, `pages/PortalFuncionario.jsx`):

- O login não muda. Depois da senha, com duas ou mais empresas: "Em qual empresa você quer entrar?", um botão por
  empresa, com logo e nome.
- Entrou com a provisória e ainda não tem senha: a tela de hoje, "Crie sua senha pessoal", com as regras da T27.
- Entrou com a provisória e já tem senha: "Você já usa o Portal do Funcionário. Para entrar também na <empresa>, digite
  a senha que você já usa." Botão "Entrar". Link "Não lembro a senha: criar uma nova", que mostra o aviso "A senha nova
  vale em todas as empresas. Nas outras empresas em que você usa o portal, o RH vai precisar te passar uma senha
  provisória nova." e depois a tela de criar a senha.
- `PEDIR_PROVISORIA`: "Seu acesso precisa ser liberado de novo. Peça ao RH a senha provisória."
- Com `empresas_aguardando` maior que zero, um aviso no painel: "Outra empresa com o seu cadastro está esperando
  liberação: peça a senha provisória ao RH dela." Sem o nome da empresa (R4).
- Cabeçalho: o nome da empresa (já existe) e "Trocar de empresa" quando houver outra liberada.
- Trocar a senha: aviso "A senha nova vale em todas as empresas em que você usa o portal."

**RH** (`AcessoPortalCard.jsx`, `lib/portal-funcionario-acesso.js`):

- Os mesmos botões ("Criar acesso", "Redefinir senha", "Desativar"/"Reativar"); a provisória continua aparecendo uma
  vez só.
- Selo novo "Precisa de nova senha provisória" (situações `travado` e `cpf_mudou`), com a dica "A senha do portal mudou
  ou o CPF do cadastro mudou. Gere uma senha provisória em Redefinir senha e entregue ao funcionário."
- A mensagem do WhatsApp (`textoCredenciais` e `avisarNoPortal`) ganha uma linha: "Se você já usa o portal em outra
  empresa, entre com o CPF e esta senha provisória e depois digite a senha que você já usa."

## 9. Plano

### 9.1 Migrações

Números: os próximos livres na hora, confirmados com o Javerson (hoje, nesta branch, `0145` e `0146`).

1. **`0145_portal_credencial.sql`** (antes do deploy): cria `portal_credencial` (RLS ligada, sem policy, `revoke all`
   de `anon` e `authenticated`, índice único em `lower(usuario)`, `attach_updated_at_trigger`); acrescenta ao vínculo
   `credencial_id`, `provisoria_hash`, `provisoria_criada_em`, `provisoria_expira_em` e `geracao_liberada`; cria o
   índice único parcial `(credencial_id, empresa_id) where ativo`; tira o índice único global e o `not null` de
   `usuario` e `senha_hash`; cria o trigger que apaga a credencial sem vínculo; **copia** os acessos existentes, um para
   um (o usuário hoje é único): acesso com senha pessoal vira credencial com o hash, geração 1, e vínculo liberado na
   geração 1; acesso com provisória vira credencial sem senha, geração 0, e o hash da provisória vira o
   `provisoria_hash` do vínculo, sem vencimento (a provisória já entregue continua valendo). Idempotente
   (`on conflict do nothing`, só linhas sem `credencial_id`), termina com `select 'ok' as res;`.
2. **`0146_portal_credencial_limpeza.sql`** (dias depois do deploy, conferido o uso): repete a cópia para linhas sem
   `credencial_id` (criadas pela versão antiga na janela do deploy), põe `credencial_id not null` e tira do vínculo as
   colunas que foram para a credencial.

A cópia grava em linhas reais, contra a regra "sem UPDATE de dados reais" das migrações do handoff (§5). É dado de
acesso, não de negócio, e evita recriar os acessos à mão; mesmo assim, é exceção a aprovar (P7). Sem a cópia, o RH
recria os acessos depois do deploy. Hoje são poucos (2 em 30/09, nunca usados).

### 9.2 Código e testes (TDD, depois do OK)

Regras em módulo puro, com `node:test`:

- `supabase/functions/_shared/portal-credencial.ts` + `.test.ts`: `usuarioDoAcesso` (CPF do cadastro com dígitos
  certos, usuário com letras, recusa de usuário só com números), `cpfValido`, `situacaoDoVinculo` (a tabela da §3.2
  inteira), `decidirLogin` (as etapas da §5.1), `sessaoValida` (cada item da §5.3), `vinculoEscolhido`,
  `efeitoDaSenhaNova` (geração, vínculo liberado, quais travam) e `decidirCriarVinculo` (liga, cria,
  `OUTRO_CADASTRO_COM_ACESSO`, `USUARIO_EM_USO`; o teste confere que a resposta do `criar` tem as mesmas chaves com e
  sem credencial em outra empresa).
- `funcionario-acesso/regras.ts`: `criar`, `redefinir` e `ativo` sobre o vínculo, junto com o `decidirCriar` do spec
  da T33 (a ordem "409 antes do 403" continua).
- Front: `apps/web/src/lib/portal-login.js` + teste Vitest (qual tela mostrar para cada resposta do login e os textos) e
  `statusAcesso` com o selo novo.
- Smoke `tools/smoke-portal-credencial.sql` (`begin; ... rollback;`, sem UUID real, que o Javerson roda): a cópia da
  `0145` em linhas sintéticas, o índice parcial e o trigger da credencial sem vínculo.

Arquivos que mudam: `portal-funcionario/index.ts` (login, sessão, `ativar`, `escolher_empresa`, `empresas`,
`trocar_empresa`, `trocar_senha`, sinal, limites), `funcionario-acesso/index.ts` (`criar`, `redefinir`, `ativo`,
`status`), `LoginPortal.jsx`, `pages/PortalFuncionario.jsx`, `AcessoPortalCard.jsx`, `lib/portal-funcionario-acesso.js`
e o handoff (§2.2 diz "usuário (único global)").

### 9.3 Produção (o Javerson, na ordem, quando a implementação estiver pronta)

1. Migração `0145`.
2. Deploy de `portal-funcionario` e de `funcionario-acesso` (os dois com `--no-verify-jwt`), logo em seguida.
3. Push do front no mesmo dia: o primeiro acesso muda de forma (etapa `ativar`), e o portal antigo com o servidor novo
   não conclui o primeiro acesso.
4. Dias depois, conferido o uso: migração `0146`.

**Nesta etapa (T38, só o spec): nada vai para produção.**

## 10. Riscos

- **R1 — O RH entra como o funcionário com a provisória.** Já acontece hoje. Continua restrito à empresa daquele RH;
  senha criada com a provisória trava as outras; o uso fica na trilha com IP e dispositivo.
- **R2 — Indisponibilidade cruzada.** Uma empresa (ou a própria pessoa, pelo "Não lembro a senha") trava as outras até
  cada uma gerar provisória nova. Não expõe dado, mas atrapalha quem está em duas empresas. Mitigação: o selo e o evento
  explicam ao RH o que fazer; a fase 2 (opção C) tira o RH do caminho.
- **R3 — Vazamento residual.** Quem tem a provisória da B nas mãos descobre se o CPF já tinha senha no portal (não a
  empresa). Mitigação: só o funcionário e o RH que a gerou a têm; o uso fica na trilha.
- **R4 — CPF digitado errado** liga o cadastro à credencial de outra pessoa. Nenhum dado cruza (a outra pessoa não sabe
  a senha da credencial; a empresa travada não aparece pelo nome), mas as duas pessoas se travam uma à outra a cada
  senha nova. Mitigação: dígitos verificadores ao criar o acesso; `cpf_mudou` e "Redefinir senha" religam o vínculo
  quando o RH corrige o CPF.
- **R5 — Bloqueio por senhas erradas é da pessoa.** Quem digitar 5 vezes o CPF de outro com senha errada bloqueia o
  portal dele por 15 min em todas as empresas (hoje, na única). O limitador por IP segura rajadas; a provisória continua
  entrando (§4.2, caso 6).
- **R6 — Credencial fora de qualquer empresa.** CPF e hash da senha passam a ser dado da plataforma, não de um cliente;
  quem responde por eles é a Sinergia Digital (operadora do SaaS). O termo de uso do portal deveria dizer isso. A
  credencial sem vínculo é apagada (§3.1).
- **R7 — Sessões caem no deploy:** os tokens antigos não têm `credencial_id`; todo mundo entra de novo.
- **R8 — Janela entre a `0145` e o deploy:** a versão antiga ainda grava nas colunas antigas. Mitigação: deploy logo
  depois da migração; a `0146` repete a cópia antes de tirar as colunas. Hoje não há uso real.
- **R9 — Pessoa sem CPF numa empresa e com CPF na outra** tem dois logins até a primeira cadastrar o CPF e redefinir a
  senha (o vínculo passa para a credencial do CPF, §4.2, caso 7).
- **R10 — Tempo da resposta do login** poderia contar quantas provisórias a pessoa tem; o servidor completa as
  comparações com o hash fictício (§5.1).

## 11. Perguntas ao Javerson

| #   | Pergunta                                                                                                                                  | Recomendação                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| P1  | Qual opção da §4.1 para criar, redefinir e desativar a senha?                                                                             | A                                                          |
| P2  | Na opção A, quem cria senha nova com a provisória de uma empresa trava as outras até cada uma gerar provisória nova. Aceita esse custo?   | Sim: é o que impede o RH de uma empresa de entrar na outra |
| P3  | A senha provisória passa a vencer (hoje não vence)?                                                                                       | Sim, em 7 dias                                             |
| P4  | Fase 2 com "Esqueci a senha" pelo WhatsApp que o próprio funcionário confirmou (opção C)?                                                 | Só se pedir a provisória de cada empresa incomodar no uso  |
| P5  | Na tela, manter o nome "senha provisória" (e não "código de acesso")?                                                                     | Sim: o RH e os funcionários já conhecem                    |
| P6  | Curso feito numa empresa não vale na outra (cada uma matricula e certifica)?                                                              | Sim; aproveitar é a D17                                    |
| P7  | A migração copia os acessos existentes (a provisória já entregue continua valendo) ou o RH os recria depois do deploy?                    | Copiar                                                     |
| P8  | Usuário só com números passa a ser só o CPF do próprio cadastro, e o CPF precisa ter os dígitos verificadores certos para criar o acesso? | Sim                                                        |
