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
código tem NR-35 (a NR-35 exige treinamento presencial desde 16/07/2026, item 35.4.5), o que mantém o comportamento
anterior. Os cursos de apoio e semipresenciais seguem fora de nova matrícula e de publicação enquanto o requisito de
modalidade estiver pendente. Curso EAD antigo, que ainda não tem o vínculo com o cadastro central, pode ser salvo sem
o vínculo (despublicar, preencher o instrutor e marcar a modalidade); curso novo continua exigindo o vínculo.

O certificado traz o **local de realização** (a plataforma e o endereço do portal) e as datas no horário de Brasília:
uma conclusão às 23h30 sai com o próprio dia, e a renovação soma os meses sobre essa data. A validação pública
(`/ValidarCertificado`) mostra o local.

O projeto completo de conformidade EAD continua documentado em `HANDOFF-PORTAL-TREINAMENTO.md`. Esta entrega acrescenta
as áreas de documentos e as proteções necessárias ao fluxo solicitado; não declara concluídas todas as 38 tarefas
daquele documento. Permanecem, por exemplo, os desenhos e migrações de ciência protegida no banco,
permissões granulares e sessões práticas. Os imports de Ferramental e a ativação global de `no-undef` continuam
dependentes da autorização específica já solicitada.

## Validação e publicação

Validação local: testes do front, testes Node das Edge Functions, lint, `no-undef` nos componentes alterados,
Prettier, build e verificação móvel com dados sintéticos. Os testes não usam o banco real.

A publicação desta entrega não exige migração. Primeiro publique **portal-funcionario**, depois o front pelo
workflow **Deploy — Hostgator**. Integre apenas os commits do portal; não inclua as alterações locais de Orçamento,
Financeiro ou Pastas.

O teste completo de matrícula real, tempo de estudo, avaliação e certificado deve seguir o roteiro da seção 7 do
handoff, com o Javerson e após as decisões e tarefas correspondentes.
