# RH & Segurança — esteira de contratação com IA + morte do Base44

Data: 2026-09-23 · Status: aprovado em conversa (Javerson)

## Objetivo

Evoluir o módulo "Segurança do Trabalho" para **"RH & Segurança"**: controlar a
vida do funcionário desde a contratação (documentos → exames → registro) até
treinamentos e renovações, com leitura e validação de documentos por IA
(OpenAI). No mesmo movimento, **eliminar as últimas referências ao Base44**
(backend antigo, já desativado).

## Decisões travadas (com o dono)

| Decisão               | Escolha                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nome do módulo        | **"RH & Segurança"** (mesmo módulo, mesmas abas + Contratação)                                                                                                                                 |
| Chave OpenAI          | **Global do SaaS** (secret `OPENAI_API_KEY` no Supabase); tela de gestão no **SaaS Admin → Integrações** (só Sinergia Digital), que grava via edge function e nunca expõe a chave ao navegador |
| Validação PCMSO       | **PDF do PCMSO da empresa** anexado 1× (sem matriz cadastrada); a IA compara os exames entregues com o PCMSO a cada validação                                                                  |
| Envio à contabilidade | **Etapa manual**: o sistema gera o dossiê (PDF com dados + checklist + anexos) e alguém registra no sistema da contabilidade; no SIGO só se marca "enviado"/"registrado"                       |
| Documentação mínima   | **Checklist com itens obrigatórios**: sem os obrigatórios não avança para a etapa de contabilidade; pendências (obrigatórias e desejáveis) ficam sempre visíveis para quem anexou              |
| Base44                | **Remover por completo** do runtime (`@base44/sdk` fora do bundle)                                                                                                                             |

## Sub-projeto A — Fundação IA + remoção do Base44

1. **Edge function `ia-processar`** (service role, JWT de usuário exigido):
   ações `extrair_documentos` (recebe refs de arquivos no Storage, envia à
   OpenAI Responses API — PDFs/imagens em base64 — e devolve campos
   estruturados + classificação de cada arquivo no checklist) e
   `validar_exames_pcmso` (exames entregues × PDF do PCMSO → parecer
   `aprovado | pendencias[]`). Chave lida de `OPENAI_API_KEY` (secret).
2. **SaaS Admin → aba Integrações**: mostra status da chave (configurada ✓,
   final `...abc`, modelo padrão) e permite atualizá-la (edge function
   `saas-config`, restrita a super admin; a chave nunca retorna inteira).
3. **`sigoClient` nativo** (fim do `@base44/sdk`):
   - `entities` → já Supabase (mantém);
   - `integrations.Core.UploadFile` → já Supabase (mantém);
   - `integrations.Core.InvokeLLM` → roteia para `ia-processar`;
   - `integrations.Core.SendEmail` → indisponível com erro claro
     ("envio de e-mail ainda não migrado") — 2 telas usam; tratadas para
     degradar com aviso;
   - `functions.invoke(nome não migrado)` → erro claro "função X não migrada"
     (hoje: falha silenciosa com HTML do SPA);
   - `auth.me()/logout()` → implementação nativa sobre a sessão custom
     (sessionStorage `custom_auth`), mesma superfície;
   - `asServiceRole` → eliminado; os 2 usos (Layout: empresas do grupo;
     VisualizarFerramentasModal) passam a consultas normais cobertas por
     policies (super admin / grupo) ou edge function dedicada se a RLS não
     cobrir.
   - Remover `@base44/sdk` de `package.json` (web e shared/sdk) e o
     `appParams` associado.

## Sub-projeto B — Esteira de Contratação

**Tabela `contratacao`** (RLS tenant + super admin): empresa_id, candidato
(nome, cpf, rg, nascimento, telefone, endereço…), funcao, salario,
responsavel_exame (usuário), etapa (`documentos | conferencia |
autorizacao_exames | exames | validacao_pcmso | contabilidade | registrado |
cancelado`), anexos jsonb (`[{checklist_item, storage_ref, nome_arquivo,
classificado_por_ia}]`), exames_anexos jsonb, extracao_ia jsonb,
validacao_ia jsonb (parecer + pendências), pendencias_documentos jsonb,
timestamps por etapa, funcionario_id (preenchido no fim).

**Checklist de documentos da contratação** (constante em
`lib/documentos-contratacao.js`): RG e CPF (ou CNH)_, CTPS_, comprovante de
endereço*, foto 3x4*, certidão nascimento/casamento, título de eleitor,
reservista, escolaridade, cartão de vacina, PIS/NIS. `*` = obrigatório para
registro. A IA classifica cada anexo num item; o usuário pode reclassificar.
Card mostra ✔/✘ por item; **etapa contabilidade só libera com os obrigatórios
completos**; pendências aparecem no card, no dossiê e num aviso para quem
anexou.

**Fluxo (aba "Contratação", kanban por etapa):**

1. Nova contratação → anexa documentos pessoais (Storage, pasta por empresa).
2. "Ler com IA" → formulário preenchido automaticamente (sempre editável) +
   checklist classificado.
3. Define função (cadastro de funções existente), salário e responsável por
   levar ao exame → **gera Autorização de Exames** (PDF via jsPDF, dados da
   empresa + candidato + função, padrão do modelo atual da Eletro).
4. Clínica devolve exames → anexa → "Validar com IA" → parecer contra o PCMSO
   da empresa (anexado 1× em Documentação da Empresa / configuração RH).
5. Parecer OK + obrigatórios completos → etapa contabilidade: botão "Gerar
   dossiê" (PDF com dados, checklist, parecer e anexos listados) e marcações
   manuais "enviado" → "registrado".
6. "Registrado" → cria `funcionario` com os dados e migra anexos para os
   documentos RH do funcionário; contratação arquivada com link.

## Sub-projeto C (fase futura, fora deste ciclo)

Generalizar vencimentos de ASO/treinamentos para qualquer empresa dentro do
SIGO (hoje: Dashboard SST via planilha da Eletro). Renovação dispara
nova autorização de exame reaproveitando a esteira.

## Riscos e cuidados

- **RLS do Layout (grupo)**: trocar `asServiceRole` pode restringir a lista de
  empresas do grupo para usuários não-super-admin — validar com os perfis
  reais antes de publicar.
- **Custo/latência OpenAI**: PDFs grandes; limitar tamanho por arquivo e usar
  modelo econômico com visão por padrão.
- **LGPD**: documentos pessoais ficam no bucket privado com URL assinada
  (padrão já existente); a chave da IA é global — dados de candidatos passam
  pela OpenAI (aceito pelo dono).
- **Funções não migradas**: passarão a falhar com mensagem clara — é o
  comportamento desejado para enxergar o que ainda depende de migração.

## Critérios de aceite

1. Nenhum import de `@base44/sdk` no bundle; login, upload, financeiro e
   portais seguem funcionando (build + testes verdes + smoke em produção).
2. SaaS Admin permite configurar a chave OpenAI sem expô-la; `ia-processar`
   responde com erro claro se a chave faltar.
3. Contratação completa de ponta a ponta em produção: anexos → IA preenche →
   autorização em PDF → exames → parecer PCMSO → dossiê → funcionário criado.
4. Contratação sem documentos obrigatórios **não** chega à contabilidade e
   mostra as pendências.
