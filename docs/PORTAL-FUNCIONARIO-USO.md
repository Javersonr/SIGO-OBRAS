# Portal do Funcionário — cursos e documentos

## Acesso do RH

No SIGO Obras, inclusive pelo navegador do celular:

1. Abra **RH & Segurança → Treinamentos** para cadastrar um curso.
2. Salve o cadastro, adicione vídeos próprios ou links do YouTube, apostilas PDF, textos e questões.
3. Os vídeos próprios têm a duração lida antes do upload. Para YouTube, informe a duração em `mm:ss`.
4. Confira **Requisitos para publicar e emitir certificado**. Cursos novos começam em rascunho.
5. Publique após regularizar as pendências e use **Matricular funcionários** para atribuir o curso.

Para documentos mensais:

1. Abra **RH & Segurança → Funcionários** e clique no funcionário.
2. Em **PDFs do Portal do Funcionário**, escolha Documentação, Contracheque ou Folha de ponto.
3. Nos documentos mensais, informe a competência. Selecione um PDF de até 20 MB e toque em **Enviar ao portal**.
4. O PDF aparece somente para esse funcionário. O botão de retirada remove sua disponibilidade na lista do portal.
   Links já abertos podem continuar válidos por até cinco minutos; os arquivos não são apagados do Storage.
5. Advertências cadastradas na ficha aparecem na área **Advertências** do funcionário, incluindo o motivo e eventual
   anexo. A visualização não é uma confirmação de ciência ou assinatura da advertência.

Arquivos internos e legados do RH não são disponibilizados automaticamente. Somente os PDFs enviados por essa área
recebem a marca explícita de publicação no portal.

## Acesso do funcionário

O endereço é `/PortalFuncionario` no domínio do SIGO Obras.

O RH cria ou redefine o acesso em **Acesso ao Portal do Funcionário**, na ficha. O funcionário entra com seu usuário
e senha provisória, cria uma senha pessoal e acessa **Cursos**, **Advertências**, **Documentação**, **Contracheques** e
**Folhas de ponto**. Para salvar um PDF no celular, abra o arquivo e use o download do navegador. **Atualizar** renova
os links temporários.

Funcionários inativos ou excluídos não podem acessar o portal. **Sair** invalida a versão da sessão no servidor.

## Carga horária e certificados

O portal verifica aulas e arquivos, duração, pelo menos cinco questões, carga horária, instrutor e responsável
técnico. A soma do tempo obrigatório das aulas precisa cobrir a carga declarada. A conclusão para emitir certificado
é recalculada com o progresso e a aprovação gravados pelo servidor.

Como previsto na decisão **D1** do handoff, os cursos atuais com carga superior ao conteúdo ficam com novas matrículas
e certificados bloqueados até revisão da carga ou complementação do conteúdo. Nenhum curso existente é despublicado
ou regravado em massa. Esta entrega não cria o cadastro de sessões práticas.

### Modalidade do curso (T8)

Cada curso tem uma **modalidade**, escolhida na tela do curso EAD (a migração `0136` cria a coluna):

- **EAD**: todo o treinamento é a distância. É a única modalidade que emite certificado hoje.
- **Semipresencial**: teoria a distância e prática presencial. Não emite certificado até o registro da etapa prática
  existir; o servidor responde 409 `PRATICA_PENDENTE`.
- **Apoio ao presencial**: material de estudo do treinamento presencial. Nunca emite certificado (409
  `CURSO_DE_APOIO`) e o portal avisa o aluno com o texto "Material de apoio ao treinamento presencial: não emite
  certificado".

Quem decide é a modalidade marcada no curso, não o nome. A migração `0136` marca como **apoio** os cursos cujo nome ou
código tem NR-35 (a NR-35 exige treinamento presencial desde 16/07/2026, item 35.4.5, e não vale como EAD nem como
semipresencial: a tela sugere **Apoio ao presencial** para um NR-35 marcado como EAD). Curso EAD antigo, que ainda não
tem o vínculo com o cadastro central, pode ser salvo sem o vínculo (despublicar, preencher o instrutor e marcar a
modalidade); curso novo continua exigindo o vínculo. A tela avisa isso para qualquer curso sem vínculo, não só para os
criados antes do cadastro central.

**Curso de apoio (decisão D3, 06/10/2026).** Ele continua **publicado e aceita matrícula** como material de estudo; só
não emite certificado. No requisito "Modalidade" o apoio bloqueia somente a **emissão** (no front e no servidor, que
usam a mesma regra), nunca a publicação nem a matrícula. Na lista de cursos do RH ele ganha o selo neutro "Apoio — sem
certificado" (não "Publicado com pendências"). O semipresencial continua sem publicar, matricular nem emitir até a T12.
**D3 completa (acompanhamento A6, 07/10/2026):** o apoio é material de estudo, então os requisitos que só existem por
causa do certificado **não se aplicam a ele** e saem da lista do curso, no front e no servidor (mesma regra, com teste de
paridade): o mínimo de questões, o conteúdo medido x carga declarada, o instrutor, o responsável técnico, o projeto
pedagógico e a validade. Ficam as aulas, o conteúdo, a carga, o conteúdo programático e a modalidade. A lista de cursos
não mostra "validade N meses" para o apoio e o curso não pede "Confira a validade". Um curso que deixa de ser apoio volta
a ser cobrado do que faltava (a lista é calculada na hora). Não há o que renovar: a conclusão do apoio **não grava `proxima_renovacao`**, o portal não
mostra "renovar até" nem o botão "Certificado" (o cartão concluído diz "Rever material"), e a Ficha do funcionário e a
tabela de matrículas do RH não mostram a renovação. Matrículas de apoio concluídas antes da D3 que já tinham a data
gravada também deixam de mostrá-la (a tela não a exibe; o banco não é alterado).

**Resultado da prova (decisão D10, 06/10/2026).** Quem foi reprovado vê só "insatisfatório", o número de tentativas e a
próxima liberação: a nota, os acertos e o total não vão ao navegador (em prova de 5 ou 6 questões eles deixariam
deduzir o gabarito). O RH continua vendo tudo na trilha do aluno. Quem foi aprovado vê a própria nota. Para reabrir
a nota ao reprovado, troque `REPROVADO_VE_NOTA` em `portal-funcionario/regras.ts` **e** em `lib/portal-previa.js`.

O certificado traz o **local de realização** (a plataforma e o endereço do portal) e as datas no horário de Brasília:
uma conclusão às 23h30 sai com o próprio dia, e a renovação soma os meses sobre essa data. A validação pública
(`/ValidarCertificado`) mostra o local.

**Assinaturas do instrutor e do responsável técnico (T29, decisão D7, 06/10/2026).** Vale a **imagem** da assinatura
(não ICP-Brasil). Na tela do curso (RH & Segurança → Treinamentos → curso), os campos "Assinatura do responsável
técnico" e "Assinatura do instrutor" aceitam PNG ou JPEG de até 2 MB; salve o curso para guardar. As imagens antigas do
cadastro de Configurações apontavam para o sistema antigo e não existem mais: anexe de novo (se a pessoa já tem imagem
nova em Configurações, escolher o nome dela na lista do curso traz a imagem junto). A imagem é de uma pessoa: se o RH
digitar outro nome no campo (ou voltar para "escolher dos salvos"), a imagem de quem estava antes sai do curso e a tela
avisa; anexe a da pessoa nova. O banco guarda só a referência do
arquivo. Na emissão a referência é **congelada no certificado** (entra no hash): trocar a imagem do curso depois não muda
certificados já emitidos, e por isso **o arquivo antigo nunca deve ser apagado do Storage**. O aluno baixa o PDF com as
imagens sobre as linhas de assinatura; a consulta pública não mostra a imagem nem o caminho. Sem imagem (ou se ela não
carregar) o certificado sai só com nome e registro, e a tela avisa que o PDF saiu sem a imagem.

### Vencimentos e alertas (T24)

No topo da aba **RH & Segurança → Treinamentos** há o painel **Vencimentos**, com duas partes.

**Vencimentos.** Lista os treinamentos concluídos no portal que já venceram ou vencem em até 90 dias, em faixas de
30, 60 e 90 dias (clique num número para filtrar), e marca os que estão **sem nova matrícula**: sem outra matrícula
aberta do mesmo funcionário no mesmo curso. O botão **Matricular** abre o painel de matrícula já com o curso e o
funcionário. Não entram: curso de apoio (não renova), curso sem validade, certificado revogado, matrícula removida e
funcionário inativo. Por funcionário e curso vale só a conclusão mais recente. "Vence hoje" ainda é "a vencer". Uma
reciclagem feita em **outro curso** (por exemplo, a "NR-10 Reciclagem" de quem fez o "NR-10 Básico") não é reconhecida
como renovação, porque o cadastro não liga os dois cursos: use o botão para matricular no mesmo curso ou ignore o item.

**Atividade sem treinamento (NR-1, item 1.7.1.2.1).** Lista o funcionário **ativo** que não tem matrícula válida em
algum curso EAD que a função dele exige. O caminho é função → exigência da função (Configurações → Funções →
Treinamentos) → treinamento do cadastro central (migração `0131`) → curso EAD publicado, de modalidade EAD. Matrícula
válida é a em andamento ou pendente, ou a concluída dentro da validade com certificado não revogado. O motivo aparece
em cada linha: sem matrícula, vencido sem nova matrícula ou certificado revogado sem nova matrícula. Exigência marcada
como opcional, exigência sem vínculo com o cadastro central e exigência cujo treinamento não tem curso EAD publicado
**não entram**: o EAD não tem como julgar, e o treinamento presencial lançado na Ficha não é considerado.

**Avisos no sino.** O banco manda **um resumo por empresa por dia** (08h12 de Brasília) aos donos, Admin Holding, Admin
e Gestor, com os vencidos e os que vencem em até 30 dias **sem nova matrícula** (função `alertar_treinamentos_ead`, só
lê o EAD; o aviso antigo `alertar_treinamentos()`, dos treinamentos lançados à mão, continua como está). Rodar de novo
no mesmo dia não duplica o aviso. Quando o aluno **reprova na última tentativa** que tinha (as do curso mais as extras
que o RH liberou), o servidor também avisa o sino na hora, uma vez por tentativa esgotada; a mensagem diz quem, qual
curso e onde liberar mais uma tentativa (Detalhes da matrícula, **Liberar tentativa**), sem nota nem gabarito.

**Validade da NR-1 e da NR-6 (decisão D12: 24 meses).** Curso sem validade não vence, então enquanto a validade dos
cursos NR-1 e NR-6 estiver vazia eles não aparecem no painel nem no aviso. A gravação dos 24 meses não está na migração:
fica no script `tools/ead-validade-nr1-nr6.sql`, com uma prévia (só leitura) e a gravação comentada. Rode a prévia
(`supabase db query --linked -f tools/ead-validade-nr1-nr6.sql`), mostre ao Javerson e só então descomente a gravação.
A prévia é **uma consulta só, com uma linha por curso** (de propósito: o `db query` pode devolver só o resultado do
último comando de um arquivo com vários, então uma segunda consulta esconderia a primeira). A coluna
`o_que_a_gravacao_faz` diz se o curso é atingido pelo passo B1 (validade direto no curso), pelo B2 (validade no
treinamento central) ou por nenhum; as demais mostram as matrículas já concluídas que não ganham data de renovação e,
nos cursos ligados ao cadastro central, o que o treinamento central leva junto. Resultado sem nenhuma linha = não há
nada a gravar. Atenção: nos cursos ligados ao cadastro central a validade tem de ser gravada no **treinamento
central**, que vale também para as exigências das funções que o usam.

### Matrículas na tela do RH (T22)

A tabela **Matrículas** da aba **RH & Segurança → Treinamentos** mostra 50 linhas por vez (**Mostrar mais** ou
**Mostrar todas**) e serve para acompanhar centenas de matrículas:

- **Buscar e filtrar.** A busca acha por funcionário, curso, função ou código do certificado, sem diferenciar acento.
  Os filtros são curso, status (inclui **Atrasada**) e vencimento (as mesmas faixas do painel **Vencimentos**, mais
  **Sem nova matrícula**). Clique no título de uma coluna para ordenar; a ordem padrão é a matrícula mais recente.
- **Andamento.** Cada linha mostra as aulas concluídas (3/12), a nota da última prova, as tentativas usadas (2 de 4,
  contando as extras que o RH liberou) e a data da matrícula. As colunas de aulas e tentativas chegam um instante
  depois da tabela; se não carregarem, a tela avisa e deixa as colunas em branco.
- **Ex-funcionário** aparece como "Nome (inativo)". Ele não recebe aviso pelo WhatsApp (o botão fica desligado), não
  conta como atrasado e não renova.
- **Exportar CSV** baixa as matrículas do filtro atual (não só as 50 da tela), com separador `;`, acentos para o Excel
  e sem CPF. Só libera depois que as aulas e tentativas carregaram, para o arquivo não sair com zeros falsos.
- **Renovar** aparece na matrícula concluída mais recente do funcionário naquele curso, quando ele está ativo, o curso
  aceita matrícula e não há outra matrícula aberta. Cria uma matrícula nova, do zero; a anterior e o certificado dela
  ficam como histórico, sem mudança. Curso de apoio não renova (não emite certificado). Depois de renovar, avise o
  funcionário pelo ícone do WhatsApp da linha nova.

**Matricular por função.** No painel **Matricular funcionários**, a aba **Por função** pede a função e mostra os
treinamentos que ela exige (função → exigência → treinamento do cadastro central → curso do portal, migração `0131`),
o curso em que cada um será matriculado e a situação de cada funcionário ativo da função (em dia, em andamento,
vencida, certificado revogado ou sem matrícula). Já vem marcado quem falta, e só se criam as matrículas que faltam. O
treinamento sem curso no portal, ou com curso em rascunho ou com pendências, aparece desligado com o motivo. **Curso de
apoio** pode ser matriculado, mas não emite certificado e o painel avisa; ele também não cumpre a exigência quando o
treinamento tem um curso EAD que emite. Se esse curso EAD não aceita matrícula agora (rascunho ou pendência) e o
treinamento tem curso de apoio publicado, o painel matricula no apoio, e quem já o fez (ou está fazendo) aparece como
"apoio feito (sem certificado)" e não é matriculado de novo; quando o curso EAD voltar a aceitar matrícula, o apoio
deixa de contar e a pessoa volta a aparecer como "sem matrícula". Ao **cadastrar um funcionário**, **trocar a função
dele** ou **registrar uma contratação**, a tela oferece o botão **Matricular**, que abre esse painel já na função, com
a pessoa marcada (NR-1, itens 1.4.4 e 1.7.1.2.1: o treinamento vem antes da atividade). A importação em lote de
funcionários não faz essa oferta.

**Aviso pelo WhatsApp e senha provisória.** O ícone do WhatsApp na linha avisa o funcionário com o link do portal e,
se ele ainda não tem acesso, cria o acesso na hora. A mensagem **não é mais copiada sozinha** para a área de
transferência. Quando o acesso é criado, uma janela mostra o usuário e a **senha provisória uma única vez** (ela não
fica guardada em lugar nenhum) e o botão **Copiar mensagem**. A mesma janela abre, sem senha, quando nada foi enviado
(sem telefone ou telefone inválido), para o RH copiar e entregar. Enviado pelo canal automático e sem acesso novo, só
aparece o aviso de que foi enviado.

**Prazo para concluir e aviso aos atrasados.** Por padrão **não há prazo**: ninguém fica atrasado (o comportamento de
sempre). No campo **Prazo para concluir** (dias após a matrícula), acima da tabela, o RH define um prazo padrão. Ele
fica salvo **só neste navegador** (por empresa) e vale para os cursos que não têm prazo próprio; o curso que tem
prazo no projeto pedagógico (`prazo_conclusao_dias`, T25) usa o dele, que vale mais e vale para todos. A matrícula aberta que passou do limite ganha o
selo **Atrasada**, e o botão **Avisar atrasados** manda um lembrete pelo WhatsApp **automático**, uma mensagem por
funcionário, juntando os cursos atrasados e sem senha. Só recebe quem já tem acesso ao portal, telefone válido e ainda
não foi avisado hoje; os demais ficam listados com o motivo. Cada rodada manda no máximo 30 mensagens (o canal aceita 60
por hora por usuário), com uma pausa entre elas, e para se o canal recusar.

O projeto completo de conformidade EAD continua documentado em `HANDOFF-PORTAL-TREINAMENTO.md`. Esta entrega acrescenta
as áreas de documentos e as proteções necessárias ao fluxo solicitado; não declara concluídas todas as 38 tarefas
daquele documento. Permanecem, por exemplo, os desenhos e migrações de ciência protegida no banco,
permissões granulares e sessões práticas. Os imports de Ferramental e a ativação global de `no-undef` continuam
dependentes da autorização específica já solicitada.

### Projeto pedagógico do curso (T25)

A NR-1 (Anexo II, item 3.1) pede, para todo curso a distância, um projeto pedagógico com 15 itens (de a até o), e o item
3.3 pede que ele seja validado a cada 2 anos ou quando a NR do curso mudar. No formulário do curso (**RH & Segurança →
Treinamentos → curso**) há a seção **Projeto pedagógico (Anexo II 3.1)**:

- **Os 15 itens, com o que falta.** Cada item mostra "Preenchido" ou "Falta" e o que fazer. Nove são escritos ali mesmo
  (objetivo geral, princípios e conceitos de SST, estratégia pedagógica, infraestrutura de apoio e controle, objetivo
  de cada módulo, dedicação diária mínima, prazo máximo para concluir, público-alvo e instrumentos de aprendizagem). Os
  outros seis vêm dos campos que o curso já tinha e só se leem ali: responsável técnico, instrutor, conteúdo
  programático (com o campo vazio vale a lista de aulas), carga horária, material didático (as aulas) e avaliação
  (as questões, a nota mínima e as tentativas). O objetivo é escrito **por módulo**: cada rótulo de módulo das aulas
  ganha o seu campo (aulas sem módulo formam um grupo só).
- **Quem escreve.** O texto do projeto é do responsável técnico: o sistema não sugere nem preenche conteúdo. Os campos
  ficam no **curso EAD**, não no cadastro central de treinamentos: são exclusivos do EAD e não mudam as exigências das
  funções (a sincronização com o cadastro central não toca neles).
- **Gravar.** Os campos são gravados com **Salvar curso**. Textos até 4.000 caracteres; dedicação de 1 a 1.440 minutos
  por dia; prazo de 1 a 3.650 dias.
- **Validação (3.3).** Os campos **Validado por** (o botão "Usar o responsável técnico do curso" preenche o nome), **Data
  da validação** e **Próxima revisão até** (o sistema sugere 2 anos depois e o RH pode mudar). Quem validou e a data
  andam juntos, e **só se registra a validação com os 15 itens preenchidos**. A tela também lembra das mudanças de NR
  que obrigam a revisar: **NR-35** (mudou em 16/07/2026, Portaria MTE 1.259/2026) e **NR-10** (muda em 01/06/2027). Curso
  cujo projeto foi validado antes da mudança da NR aparece como revisão vencida; a NR que ainda vai mudar antecipa a data
  de revisão para o dia da mudança. É a lista `GATILHOS_DE_REVISAO` em `lib/ead-projeto.js`: surgindo outra mudança de
  norma, é só acrescentar uma linha lá.
- **Gerar PDF do projeto.** O botão grava os campos do projeto e gera o PDF com os 15 itens, a validação e a linha de
  assinatura do responsável técnico, envia para o bucket `treinamentos` e põe a referência em `projeto_pedagogico_ref`:
  é esse PDF que o aluno abre pelo botão **Projeto pedagógico** do curso. O PDF usa os dados **já salvos** do curso
  (nome, carga, responsável técnico, instrutor) com o projeto escrito na tela; item vazio sai como "Não preenchido" e o
  documento leva a tarja de rascunho enquanto faltar item. Gerar de novo troca o PDF que o aluno vê; os arquivos
  anteriores ficam no Storage (são o histórico das versões do projeto, não os apague). **Anexar PDF próprio** continua
  existindo, para o RT que prefere um documento seu (vale para o projeto **salvo** na hora do envio).
- **O PDF tem de dizer o mesmo que o projeto.** O PDF é um arquivo parado: quem o grava (o botão ou o anexo próprio)
  grava junto a **marca** dos 12 campos do projeto daquele momento (`projeto_pdf_marca`: os 9 itens escritos no curso,
  quem validou, a data da validação e a data da próxima revisão). Se qualquer um deles mudar depois, a marca deixa de
  bater e o PDF fica **desatualizado**: a seção mostra o selo "PDF desatualizado", "Salvar curso" avisa, o requisito
  volta a pedir e o painel Vencimentos lista o curso. Cenário típico: o RH gera o PDF para o RT ler (ele diz "ainda não
  foi validado"), o RT aprova e o RH registra a validação: é preciso **gerar o PDF de novo** (o botão já grava a
  validação junto), senão o aluno e a fiscalização continuariam abrindo o rascunho. O que o PDF busca em outras partes
  (aulas, questões, carga, instrutor) não entra na marca: mudou isso, gere o PDF de novo por conta própria.
- **Aviso na lista de requisitos.** O item "Projeto pedagógico" dos requisitos do curso só some com o PDF **e** a data
  da validação **e** o PDF em dia com o projeto (a marca bate). É **aviso**: não impede publicar, matricular nem emitir
  certificado. Virar bloqueio é uma decisão do Javerson (uma linha em `ead-requisitos.js` e `requisitos.ts`).
- **Revisão no painel Vencimentos.** O painel ganhou o cartão **Projeto pedagógico: revisão**, com os cursos publicados
  que estão sem validação, com a revisão vencida (inclusive por mudança de NR), vencendo em até 90 dias ou com o PDF
  desatualizado, e o botão **Abrir curso**. Curso em rascunho e curso de apoio não entram.
- **Prazo e dedicação para o aluno e para o RH.** O prazo (dias a partir da matrícula) e a dedicação diária mínima
  aparecem para o aluno no curso e o prazo na lista de cursos ("Prazo para concluir: até 31/10/2026"). Passar do prazo
  só avisa o aluno para falar com o RH; o portal **não** tranca o curso. O RH vê o prazo e o selo **Atrasada** na tabela
  de matrículas, e o prazo do curso vale mais que o prazo padrão daquele navegador (T22). Curso sem prazo no projeto
  continua como era.

### Tipo de treinamento e pré-requisito entre cursos (T23)

**Tipo do treinamento (NR-1, itens 1.7.1.2 a 1.7.1.2.3.1).** O treinamento é **inicial** (antes de o funcionário começar
a atividade), **periódico** (no prazo que a norma pede) ou **eventual** (mudança de procedimento, equipamento ou
ambiente, ocorrência grave, retorno de afastamento longo...). No painel **Matricular funcionários** o RH escolhe o tipo
de **todas as matrículas daquele painel**:

- **Automático** (o padrão): **periódico** para quem já concluiu aquele curso antes (mesmo com o certificado vencido ou
  revogado) e **inicial** para quem nunca o concluiu. O botão **Renovar** da tabela cria a matrícula como periódica.
- **Inicial**, **Periódico** ou **Eventual** valem para todos os escolhidos. O **eventual exige o motivo** (3 a 200
  caracteres).
- O tipo e o motivo ficam **gravados na matrícula** e **não mudam depois** (só o servidor altera): quem errou remove a
  matrícula e matricula de novo. Aparecem nos detalhes da matrícula, na coluna **Tipo de treinamento** do CSV da tabela e
  do dossiê do curso e, para periódico e eventual, sob o nome do curso na tabela.
- Na **emissão**, o servidor congela o tipo (e o motivo do eventual) no certificado: o PDF imprime "Tipo de
  treinamento: ..." e a consulta pública em **/ValidarCertificado** mostra o tipo e o motivo. Certificado emitido antes
  da T23 não tem o tipo e continua como era. **O motivo aparece na consulta pública**: não escreva nome de pessoa nem dado
  sigiloso nele.
- **Matrículas que já existiam antes da migração `0142`.** O tipo delas nunca foi perguntado e depois não dá para
  corrigir (o RH não muda o tipo e o certificado emitido fica selado), então a própria `0142` preenche o tipo **uma vez,
  na primeira aplicação**, pela mesma regra do **Automático**: **periódico** para a matrícula viva que tem outra
  matrícula **concluída e anterior** do mesmo funcionário no mesmo curso (uma renovação feita pelo botão **Renovar**,
  que existe desde a T20) e **inicial** para as demais. Rodar a migração de novo **não** repete o preenchimento (ele só
  acontece se a coluna `tipo` ainda não existe) e, por isso, nunca desfaz a escolha do RH. A regra não enxerga o que foi
  feito fora do portal (treinamento presencial): quem já fez o curso por fora e é matriculado pela primeira vez fica
  como inicial. O certificado já emitido continua sem o tipo. "Anterior" é a ordem de `created_at`: duas matrículas
  importadas com o mesmo `created_at` (carga do legado) não contam uma para a outra, e, se o índice único da `0139`
  (`treinamento_matricula_viva_uidx`) não pôde ser criado em produção, uma matrícula repetida aberta antes de a outra
  concluir também vira periódica. A consulta de conferência no fim da migração mostra, em
  `iniciais_com_concluida_anterior`, quantas matrículas iniciais ainda têm uma concluída anterior: **0 logo depois da
  primeira aplicação**. Depois, um número maior que zero **não** quer dizer que o RH escolheu "Inicial" de propósito:
  pode ser uma matrícula criada por uma aba antiga do SIGO (aberta desde antes do deploy), que não manda o tipo, ou uma
  gravação direta pela API sem o tipo, e a coluna assume "inicial". Rode a conferência **depois** de publicar o site e de
  os RHs recarregarem as abas; se o número passar de zero, o Javerson decide se roda o mesmo UPDATE só para as linhas
  criadas depois da migração (o certificado emitido fica selado com o tipo, e o RH não muda o tipo depois). O motivo do
  eventual é aparado e contado do mesmo jeito no banco, no servidor e na consulta pública (espaço, tab, CR, LF, FF e VT
  nas pontas; limite em caracteres, não em bytes). O smoke `tools/smoke-ead-pre-requisito.sql` confere os CHECKs, o
  tipo imutável para o RH e o pré-requisito (sem ciclo, da mesma empresa), dentro de um `begin ... rollback`.

**Pré-requisito.** No formulário do curso (**RH & Segurança → Treinamentos → curso**) o campo **Pré-requisito** escolhe o
curso que o funcionário precisa ter **concluído e dentro da validade** antes deste. Exemplo: o NR-10 Complementar (SEP)
exige o NR-10 Básico. O pré-requisito fica no **curso EAD**, não no cadastro central de treinamentos (a sincronização
com o cadastro central não toca nele).

- **Quem conta como "cumpriu".** Matrícula do funcionário no curso exigido que esteja concluída, sem certificado
  revogado e com a validade em dia (no último dia ainda vale; curso sem validade vale sempre). Uma conclusão boa basta:
  a antiga, vencida ou revogada, não derruba a renovação que já foi feita. Matrícula ainda aberta não conta. Só o curso
  exigido **diretamente** é conferido.
- **Matricular.** O painel lista quem não cumpre ("Para NR-10 SEP é preciso ter concluído NR-10 Básico: Fulano, ainda
  não fez o curso") e **só matricula o resto**. Se ninguém da seleção cumpre, o botão fica desligado. **Renovar** um
  curso que exige outro pede o outro dentro da validade.
- **Emitir.** O servidor confere de novo na hora e, sem o pré-requisito, responde **409 `PRE_REQUISITO`** antes de
  pedir a senha. O aluno vê o que falta no curso (aviso no alto, enquanto estuda) e no bloco do certificado (depois de
  concluir): o curso fica concluído, mas o certificado só sai quando o curso exigido estiver em dia.
- **Escolha do curso exigido.** A lista não traz o próprio curso, curso de apoio (conclui sem certificado, então nunca
  valeria) nem curso que já exige este (o banco recusa o círculo). A lista de cursos mostra "Exige: ...". Curso exigido em
  rascunho, semipresencial (ainda não emite) ou excluído gera aviso na tela do curso: ninguém consegue cumpri-lo.
- **Fora do portal.** O pré-requisito cumprido **fora do portal** (por exemplo, o NR-10 Básico feito presencialmente
  antes do EAD) **não é reconhecido**: hoje a saída é matricular a pessoa no curso exigido.

## Validação e publicação

Validação local: testes do front, testes Node das Edge Functions, lint, `no-undef` nos componentes alterados,
Prettier, build e verificação móvel com dados sintéticos. Os testes não usam o banco real.

A entrega do portal (T1 a T8 e os acompanhamentos A1 a A5) exige as migrações **`0134`**, **`0135`** e **`0136`**, nesta
ordem, e o deploy das funções alteradas: **portal-funcionario** e **funcionario-acesso** (com `--no-verify-jwt`) e
**validar-certificado** (SEM `--no-verify-jwt`). A `0136` cria a coluna `modalidade` e marca os cursos NR-35 como
apoio (se a coluna já existir, a marcação é pulada e a migração avisa); aplique-a **antes** de publicar o
`portal-funcionario`, que lê a coluna. Depois publique o front pelo workflow **Deploy — Hostgator**. Integre apenas os
commits do portal; não inclua as alterações locais de Orçamento, Financeiro ou Pastas. Os comandos exatos, por tarefa,
ficam na descrição de cada commit.

A T29 (assinaturas) acrescenta a migração **`0137`** (colunas `instrutor_assinatura_ref` e
`responsavel_tecnico_assinatura_ref` no curso): aplique-a **antes** de publicar o front, porque "Salvar curso" passa a
gravar essas colunas. Depois publique **portal-funcionario** (`--no-verify-jwt`) e **validar-certificado** (SEM
`--no-verify-jwt`: a consulta pública passa a devolver só nome e registro do responsável técnico, sem o caminho da
imagem) e, por último, o front.

A T24 (vencimentos e alertas) acrescenta a migração **`0138`** (a função `alertar_treinamentos_ead` e o agendamento
diário; sem alteração de dado) e muda o **portal-funcionario** (aviso ao RH quando o aluno esgota as tentativas, com
`--no-verify-jwt`). Ordem: migração, depois a função, depois o front (o painel só lê dados que já existem). Depois de
aplicar a migração, rode a função à mão uma vez e confira o sino:
`supabase db query --linked "select public.alertar_treinamentos_ead() as empresas_avisadas;"`.

A T25 (projeto pedagógico estruturado) acrescenta a migração **`0141`** (13 colunas novas no curso, entre elas a marca
do PDF do projeto, e as restrições de tamanho; sem alteração de dado) e muda o **portal-funcionario** (o aluno recebe o prazo e a dedicação diária do curso,
com `--no-verify-jwt`). Ordem: migração, depois a função, depois o front. A migração vem **antes** do front: depois dele,
"Salvar curso" passa a gravar as colunas novas. Publicar a função antes da migração não quebra nada (as colunas só são
lidas quando existem). A `0141` é idempotente: se a versão anterior dela (sem a marca do PDF) já tiver sido aplicada, rodar o arquivo de novo só acrescenta a coluna da marca.

A T23 (tipo do treinamento e pré-requisito) acrescenta a migração **`0142`** (`tipo` e `motivo_eventual` na
matrícula, com o tipo das matrículas que já existem preenchido uma vez pela regra do Automático;
`pre_requisito_curso_id` no curso, com os triggers contra o círculo e contra curso de outra empresa; nenhum outro dado
é alterado) e muda o **portal-funcionario** (com `--no-verify-jwt`) e o **validar-certificado** (SEM
`--no-verify-jwt`). A ordem importa: **migração, depois as funções, depois o front.** O `portal-funcionario` novo lê as
colunas `tipo` e `motivo_eventual` da matrícula, e publicá-lo antes da migração derruba o portal inteiro; o front novo
grava `tipo`, `motivo_eventual` e `pre_requisito_curso_id`, e publicá-lo antes da migração faz matricular e salvar
curso falharem.

O acompanhamento técnico A6 (07/10/2026) **editou no lugar** as migrações ainda não aplicadas `0136`, `0137`, `0139`,
`0142`, `0143` e `0144` (todas idempotentes). Antes de aplicar, confirme que a
versão anterior de cada uma não foi aplicada em nenhum lugar; se foi, rodar o arquivo novo é seguro (cada uma só
acrescenta o que falta e recria restrições, triggers e funções; o preenchimento do tipo da `0142` só roda se a coluna
`tipo` ainda não existe). A `0144` também cria dois índices parciais em `treinamento_evento` (relatório do RH): numa
tabela grande, aplique fora do horário de pico. Funções alteradas: **portal-funcionario** e **funcionario-acesso**
(`--no-verify-jwt`) e **validar-certificado** (SEM `--no-verify-jwt`). O smoke de cada migração fica em `tools/`
(`smoke-ead-pratica.sql`, `smoke-ead-declaracao.sql`, `smoke-ead-pre-requisito.sql`).

**Conclusão que não foi registrada (A6, revisões 1 e 2).** O servidor só conclui a matrícula quando consegue ler o
curso e gravar a conclusão (a validade e a modalidade definem a renovação, e a conclusão é permanente). Se a leitura do
curso ou a gravação falha no instante da última aula (ou da aprovação na prova), a matrícula não vira "concluída" na
hora e o servidor grava na trilha o evento **`conclusao_adiada`** ("Conclusão adiada pelo sistema"), com o motivo. A
**próxima abertura do portal** conclui **só as matrículas marcadas por esse evento** (o curso de apoio e o curso sem
prova, que ninguém mais regravaria, ficavam "em andamento" ou "Atrasada" para sempre) e grava o evento
**`conclusao_registrada`** ("Conclusão registrada pelo sistema"), que mostra à auditoria quando e como a conclusão
foi feita. Isso acontece sozinho, sem ação do aluno nem do RH. Os dois eventos são do sistema: não contam como
atividade do aluno nem estendem a janela do dia no relatório de ambiente e horário, e não gravam `curso_concluido`
(abrir o portal não é estudar). A `data_conclusao` da matrícula, e a renovação que conta dela, são o **dia (Brasília)
do último marco da trilha** (a última aula concluída ou a aprovação na prova), não o dia em que o portal a registrou:
atraso na abertura do portal não estende a validade.

Uma trilha que só **parece** completa não é concluída por esse caminho. Exemplo: o aluno reprovou nas tentativas e o
RH excluiu as questões antigas antes de cadastrar as novas; nesse intervalo o curso fica sem prova e a trilha "fecha",
mas nada foi adiado e o aluno nunca foi aprovado, então a matrícula continua em andamento (e continua aparecendo em
"Tentativas da prova esgotadas"). O mesmo vale para a aula que o RH apaga e o aluno não tinha feito. Quem fez a prova
e não foi aprovado nunca é concluído pela retomada, mesmo com a conclusão adiada. Matrículas que já estavam com a
trilha completa e abertas antes desta função (sem o evento) **não** são concluídas sozinhas: quem precisar delas
concluídas pede o certificado (o pedido confere a trilha) ou o RH trata caso a caso.

O pedido de certificado com a conclusão ainda sem registro responde "Não foi possível registrar a conclusão do curso
agora. Tente de novo." (503) e confere a matrícula depois de gravar: nunca emite sem a conclusão. Vale também para quem
publicar o `portal-funcionario` antes da `0136` (o select de `modalidade` falha): as conclusões dessa janela
ficam marcadas como adiadas e são registradas depois, mas a ordem correta continua sendo migração primeiro. Não há
migração nova: os dois eventos usam as colunas que `treinamento_evento` já tem.

O teste completo de matrícula real, tempo de estudo, avaliação e certificado deve seguir o roteiro da seção 7 do
handoff, com o Javerson e após as decisões e tarefas correspondentes.
