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
certificado" (não "Publicado com pendências"). O semipresencial continua sem publicar, matricular nem emitir até a T12,
e os outros requisitos do curso (carga x conteúdo medido, instrutor, responsável técnico, questões) valem para o apoio
como para qualquer curso. Não há o que renovar: a conclusão do apoio **não grava `proxima_renovacao`**, o portal não
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
treinamento tem um curso EAD que emite. Ao **cadastrar um funcionário**, **trocar a função dele** ou **registrar uma
contratação**, a tela oferece o botão **Matricular**, que abre esse painel já na função, com a pessoa marcada (NR-1,
itens 1.4.4 e 1.7.1.2.1: o treinamento vem antes da atividade). A importação em lote de funcionários não faz essa oferta.

**Aviso pelo WhatsApp e senha provisória.** O ícone do WhatsApp na linha avisa o funcionário com o link do portal e,
se ele ainda não tem acesso, cria o acesso na hora. A mensagem **não é mais copiada sozinha** para a área de
transferência. Quando o acesso é criado, uma janela mostra o usuário e a **senha provisória uma única vez** (ela não
fica guardada em lugar nenhum) e o botão **Copiar mensagem**. A mesma janela abre, sem senha, quando nada foi enviado
(sem telefone ou telefone inválido), para o RH copiar e entregar. Enviado pelo canal automático e sem acesso novo, só
aparece o aviso de que foi enviado.

**Prazo para concluir e aviso aos atrasados.** Por padrão **não há prazo**: ninguém fica atrasado (o comportamento de
sempre). No campo **Prazo para concluir** (dias após a matrícula), acima da tabela, o RH define um prazo padrão. Ele
fica salvo **só neste navegador** (por empresa), porque ainda não há onde guardá-lo para todos; quando o curso passar a
ter prazo próprio (`prazo_conclusao_dias`, T25), o do curso vale mais. A matrícula aberta que passou do limite ganha o
selo **Atrasada**, e o botão **Avisar atrasados** manda um lembrete pelo WhatsApp **automático**, uma mensagem por
funcionário, juntando os cursos atrasados e sem senha. Só recebe quem já tem acesso ao portal, telefone válido e ainda
não foi avisado hoje; os demais ficam listados com o motivo. Cada rodada manda no máximo 30 mensagens (o canal aceita 60
por hora por usuário), com uma pausa entre elas, e para se o canal recusar.

O projeto completo de conformidade EAD continua documentado em `HANDOFF-PORTAL-TREINAMENTO.md`. Esta entrega acrescenta
as áreas de documentos e as proteções necessárias ao fluxo solicitado; não declara concluídas todas as 38 tarefas
daquele documento. Permanecem, por exemplo, os desenhos e migrações de ciência protegida no banco,
permissões granulares e sessões práticas. Os imports de Ferramental e a ativação global de `no-undef` continuam
dependentes da autorização específica já solicitada.

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

O teste completo de matrícula real, tempo de estudo, avaliação e certificado deve seguir o roteiro da seção 7 do
handoff, com o Javerson e após as decisões e tarefas correspondentes.
