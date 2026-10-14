# Atividades interativas no Portal de Treinamento (EAD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar ao portal EAD do SIGO três tipos novos de aula — questionário do módulo, caso com decisões e tarefa de
estudo —, liberar as leituras (texto/PDF) ao rolar até o fim, dar ao RH a importação do pacote e a edição na tela, e
registrar tudo na trilha e no certificado.

**Architecture:** Cada atividade é uma aula (`treinamento_aula.tipo` = `questionario` | `caso` | `tarefa`) e conclui
pela mesma linha de `treinamento_progresso`, gravada só pelo servidor; bloqueio linear, conclusão do curso, carga e
certificado continuam valendo. As regras (roteiro do caso, questionário, conclusão sem tempo, requisitos, resumo do
certificado) ficam em módulos puros com teste (`node:test` no servidor, Vitest no front, cópias conferidas pelo mesmo
teste). O `index.ts` do `portal-funcionario` só liga rede e banco; a migração `0170` cria a estrutura e a RPC de
importação tudo-ou-nada.

**Tech Stack:** Supabase (Postgres + Edge Functions Deno; TypeScript apagado pelo Node 24 nos testes), React 18 +
Vite (JavaScript) + Tailwind/shadcn, Vitest (ambiente node, sem DOM), pdf.js (`pdfjs-dist`, já dependência).

## Global Constraints

Valem para todas as tasks. Os valores são exatos.

**Especificação e escopo**

- Spec aprovada: `docs/superpowers/specs/2026-10-14-ead-atividades-interativas-design.md` (decisões A1–A10). Em caso
  de dúvida, a spec vence; se a spec e o código divergirem, pare e pergunte.
- Os nomes, assinaturas, tabelas, colunas, eventos, ações e formatos JSON da seção **"Contrato das interfaces"** são
  fixos. Quem precisar mudar um deles muda primeiro o contrato e avisa as tasks que o consomem.

**Repositório e entrega**

- Trabalho na branch `feat/ead-atividades-interativas`, no worktree `C:/Users/javer/sigoobras-wt-ead-interativas`
  (base `master` `7b91500`; `node_modules` e `apps/web/node_modules` são junções para o checkout principal). Nada no
  checkout principal. Sem push e sem PR (AGENTS.md, regra 3).
- Commit por task: `git add <caminhos explícitos>` e `git commit -F - -- <os mesmos caminhos>`. Mensagem em Conventional
  Commits, pt-BR, no imperativo, com corpo explicando o porquê; rodapé
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `-A`, `-a`, `--amend`, `--no-verify`, `--force`,
  `git stash` sem tag.
- **Nada contra produção nas Tasks 1 a 20.** Proibidos: `--linked`, `--project-ref`, `npm run supabase:*`,
  `npm run sdk:test`, `tools/*` (inclusive `tools/ead-sync-cursos.py`), `npm run dev`, `git push`. Os comandos de
  produção vão prontos na descrição do commit e na seção "Produção" do fim (executada só com OK do Javerson).
- Repositório público: nada de segredo, UUID de empresa ou dado pessoal em código, teste, doc ou commit. UUIDs de teste
  no formato `00000000-0000-4000-8000-0000000000NN`. Textos de caso e questão nos testes são sintéticos (não copie o
  material do NR-10).
- Migração: **só** `supabase/migrations/0170_ead_atividades_interativas.sql` (arquivo novo, idempotente, cabeçalho em
  português, termina em `select 'ok' as res;`, sem UPDATE de dados reais). Nas tabelas do EAD o trigger
  `zz_permissao_ead` tem de continuar sendo o **último** trigger BEFORE (ordem alfabética): nenhum trigger novo com
  nome depois de `zz_`.

**Testes e checagens (toda task termina com tudo verde)**

- Servidor: `node --test "supabase/functions/**/*.test.ts"` (Node 24, na raiz do worktree). Linha de base: **1534
  testes, 0 falhas**.
- Front: `npm test --workspace=apps/web` (ou `cd apps/web && npx vitest run <arquivo>`). **Nunca `npx vitest` na
  raiz.** Linha de base: ver "Linha de base" abaixo.
- `npx prettier --check <arquivos da task>`; em arquivo alterado de `src/components`, `src/pages` ou `src/Layout.jsx`:
  `cd apps/web && npx eslint --rule "no-undef: error" <caminho relativo a apps/web>`; `npm run lint`; quando a task
  mexe no front, `npm run build`.
- TDD nas regras puras: teste primeiro, ver falhar, implementar, ver passar.

**TypeScript das Edge Functions**

- Só sintaxe que o Node apaga sem compilar (nada de `enum`, `namespace`, parameter properties). Imports com extensão
  `.ts`; `import type` para tipos. Regras em módulos puros, sem `Deno.*` e sem import de URL; banco injetado. O
  `index.ts` não é importável no Node.
- O postgrest-js não lança: toda leitura confere o `error` e responde 503 em falha (padrão `prova.ts`), nunca decide
  com uma leitura que falhou.
- Identidade só pela sessão do portal: matrícula conferida com `minhaMatricula`, aula conferida contra o curso da
  matrícula, toda consulta com `.eq("empresa_id", empresaId)`.

**Front**

- JavaScript (não TypeScript). Backend só por `@/api/sigoClient` (`sigo`, `supabase`); no portal do aluno, só pela
  `api` injetada (`api.chamarPortal(acao, dados, token)`), que a prévia do RT substitui.
- Lógica nova em `apps/web/src/lib/<nome>.js` com `<nome>.test.js` (Vitest, ambiente node, sem DOM); a lib não importa
  `@/api/sigoClient`. Toasts por `sonner`. `Select`/`Popover` dentro de `Dialog` com `className="z-[9999]"`.
- Textos de interface em português do Brasil, sem emoji (há teste `sem-emoji.test.js` no portal).

---

## Linha de base

| Suíte                                           | Antes desta branch                  |
| ----------------------------------------------- | ----------------------------------- |
| `node --test "supabase/functions/**/*.test.ts"` | 1534 testes, 0 falhas               |
| `npm test --workspace=apps/web`                 | 129 arquivos, 2448 testes, 0 falhas |

Cada task anota no fim do relatório os totais novos das duas suítes.

---

## Mapa de arquivos

| Arquivo                                                                              | Responsabilidade                                                                                                                                                  | Task(s) |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `supabase/migrations/0170_ead_atividades_interativas.sql`                            | Tipos novos, `codigo_origem`, `aula_id` da questão, `nota_minima_modulo`, `treinamento_caso`, `treinamento_questionario_tentativa`, RPC `importar_atividades_ead` | 1       |
| `supabase/functions/portal-funcionario/atividades-banco.test.ts`                     | Forma da migração 0170 (lida como texto, como `travas-banco.test.ts`)                                                                                             | 1       |
| `tools/smoke-ead-atividades.sql`                                                     | Smoke `begin; … rollback;` para o Javerson                                                                                                                        | 1       |
| `apps/web/src/lib/ead-caso.js` (+ `.test.js`)                                        | Roteiro do caso: validar, refazer o estado, etapa para o aluno, resultado da escolha (cópia do front)                                                             | 2       |
| `supabase/functions/portal-funcionario/caso.ts` (+ `.test.ts`)                       | Mesma regra no servidor + escolhas da rodada a partir da trilha; o teste confere as duas cópias                                                                   | 3       |
| `supabase/functions/portal-funcionario/regras.ts` (+ `regras.test.ts`)               | Conclusão sem tempo (leitura/tarefa), questionário e caso nunca concluem pelo `progresso`, texto da tarefa, resumo do certificado                                 | 4       |
| `apps/web/src/lib/ead-requisitos.js`, `portal-funcionario/requisitos.ts` (+ testes)  | `CONTEUDO` por tipo, `QUESTOES` só da prova final                                                                                                                 | 5       |
| `supabase/functions/portal-funcionario/questionario.ts` (+ `.test.ts`)               | Preparo, mensagens e resposta do questionário                                                                                                                     | 6       |
| `portal-funcionario/index.ts`, `prova.ts`, `conclusao.ts`                            | Filtro `aula_id is null` da prova, `concluirAula`, `progresso`, `dados`, `certificado`                                                                            | 7       |
| `portal-funcionario/index.ts`                                                        | Ações `questionario_abrir` e `questionario_enviar`                                                                                                                | 8       |
| `portal-funcionario/index.ts`                                                        | Ações `caso_abrir`, `caso_escolher` e `caso_concluir`                                                                                                             | 9       |
| `apps/web/src/components/portal-funcionario/CursoPortal.jsx`, `ApostilaPdf.jsx`      | Leitura até o fim (texto, PDF em pdf.js em todas as telas, tarefa), ícones dos tipos novos                                                                        | 10      |
| `apps/web/src/components/portal-funcionario/QuestionarioPortal.jsx`                  | Tela do questionário                                                                                                                                              | 11      |
| `apps/web/src/components/portal-funcionario/CasoPortal.jsx`                          | Tela do caso                                                                                                                                                      | 12      |
| `apps/web/src/lib/portal-previa.js` (+ teste), `PreviaAlunoCurso.jsx`                | "Ver como aluno" com as ações novas                                                                                                                               | 13      |
| `apps/web/src/lib/certificado-ead.js` (+ teste)                                      | Frase das atividades na frente do certificado                                                                                                                     | 14      |
| `apps/web/src/lib/ead-trilha.js`, `MatriculaAuditoriaSheet.jsx`, `lib/ead-dossie.js` | Rótulos, tentativas dos questionários na auditoria e no dossiê                                                                                                    | 15      |
| `apps/web/src/components/seguranca/TreinamentosEadTab.jsx`, `AulaLinhaEad.jsx`       | Tipos novos na "Nova aula", edição do texto, nota mínima do módulo, questões por questionário, casos nos requisitos                                               | 16      |
| `apps/web/src/components/seguranca/CasoEditor.jsx`                                   | Editor do caso                                                                                                                                                    | 17      |
| `apps/web/src/lib/ead-atividades-importar.js` (+ `.test.js`)                         | Leitura do pacote, casamento de módulos, plano e payload da importação                                                                                            | 18      |
| `apps/web/src/components/seguranca/ImportarAtividadesDialog.jsx`                     | Diálogo de importação (arquivo → prévia → confirmar)                                                                                                              | 19      |
| `docs/HANDOFF-PORTAL-TREINAMENTO.md`                                                 | Seção nova, roteiro de teste e comandos de produção                                                                                                               | 20      |

---

## Contrato das interfaces

### C1. Banco (migração `0170_ead_atividades_interativas.sql`)

| Objeto                                                                           | Definição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `treinamento_aula_tipo_chk`                                                      | `check (tipo in ('video','pdf','texto','questionario','caso','tarefa'))` (drop if exists + add)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `treinamento_aula.codigo_origem`                                                 | `text` null; índice único parcial `treinamento_aula_codigo_origem_uniq` em `(curso_id, codigo_origem) where deleted_at is null and codigo_origem is not null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `treinamento_questao.aula_id`                                                    | `uuid` null `references public.treinamento_aula(id) on delete cascade`; índice `trein_questao_aula_idx (aula_id)`. **Vazio = questão da prova final**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| trigger `referencias_da_empresa` em `treinamento_questao`                        | recriado: `before insert or update of curso_id, empresa_id, aula_id` com `exigir_referencias_da_empresa('curso_id:treinamento_curso', 'aula_id:treinamento_aula')`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| função + trigger `questao_do_questionario`                                       | BEFORE INSERT OR UPDATE OF `aula_id, curso_id` em `treinamento_questao`: com `aula_id`, a aula existe, é do mesmo `curso_id` e da mesma empresa e tem `tipo = 'questionario'`; senão `raise exception ... using errcode = '23514'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `treinamento_curso.nota_minima_modulo`                                           | `integer not null default 80`, constraint `treinamento_curso_nota_minima_modulo_chk check (nota_minima_modulo between 0 and 100)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| tabela `treinamento_caso`                                                        | `id uuid pk default gen_random_uuid()`, `empresa_id uuid not null → empresa on delete cascade`, `curso_id uuid not null → treinamento_curso on delete cascade`, `aula_id uuid not null → treinamento_aula on delete cascade`, `conteudo jsonb not null check (jsonb_typeof(conteudo) = 'object')`, `created_at`, `updated_at`, `deleted_at`; único parcial `treinamento_caso_aula_uniq (aula_id) where deleted_at is null`; índice `(curso_id)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| RLS de `treinamento_caso`                                                        | `apply_tenant_rls` (derrubando antes `super_admin_all`/`tenant_isolation`, como `0143:209-215`) + policy restritiva `ead_leitura_com_permissao` de SELECT (`tem_permissao('Segurança do Trabalho', 'Treinamentos EAD')`); `revoke all ... from anon`; `revoke delete, truncate ... from authenticated`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| triggers de `treinamento_caso`                                                   | `attach_updated_at_trigger`; `referencias_da_empresa` (`curso_id:treinamento_curso`, `aula_id:treinamento_aula`); `caso_da_aula` (aula do mesmo curso e empresa, `tipo = 'caso'`, errcode `23514`); `zz_permissao_ead` (função existente da `0147`, ramo padrão = Editar)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| tabela `treinamento_questionario_tentativa`                                      | `id uuid pk`, `empresa_id → empresa on delete cascade`, `matricula_id → treinamento_matricula on delete cascade`, `curso_id uuid not null`, `aula_id → treinamento_aula on delete cascade`, `funcionario_id → funcionario on delete cascade`, `numero integer not null check (numero >= 1)`, `prova jsonb not null`, `respostas jsonb not null`, `acertos integer not null`, `total integer not null`, `nota numeric not null`, `aprovada boolean not null`, `ip text`, `dispositivo text`, `created_at timestamptz not null default now()`; `unique (matricula_id, aula_id, numero)`; índice `(matricula_id, aula_id)`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| RLS de `treinamento_questionario_tentativa`                                      | RLS ligada; policies `tenant_read` (SELECT da empresa) e `super_admin_read`, como `0103:56-64`; restritiva `ead_leitura_com_permissao`; `revoke all ... from anon`; `revoke insert, update, delete, truncate ... from authenticated`; triggers `trilha_imutavel` (UPDATE/DELETE) e `trilha_imutavel_truncate` (função existente da `0135`); `referencias_da_empresa` (`matricula_id:treinamento_matricula`, `curso_id:treinamento_curso`, `aula_id:treinamento_aula`, `funcionario_id:funcionario`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| RPC `importar_atividades_ead(p_curso_id uuid, p_atividades jsonb) returns jsonb` | `security definer`, `set search_path = public`; trava a linha do curso (`for update`); `exigir_empresa_do_chamador(<empresa do curso>, 'curso')`; sem `tem_permissao('Segurança do Trabalho', 'Treinamentos EAD', 'editar')` → `raise ... errcode '42501'`; item malformado → `errcode '22023'` com o código de origem na mensagem. Pula item cujo `codigo_origem` já existe (não apagado) no curso. Com `depois_da_aula_id` (opcional; aula do mesmo curso, não apagada, senão `22023`), o item entra **logo depois dessa aula** (e depois dos itens anteriores do payload com a mesma âncora) e herda o `modulo` dela; sem ele, entra **depois da última aula do módulo** (`modulo` igual; módulo ausente → no fim do curso). Abre espaço na `ordem` com **um** UPDATE por grupo de âncora (aula indicada ou módulo). Insere as questões (`ordem` 1..n, `aula_id`) ou o roteiro (`treinamento_caso`). Devolve `{"criadas": int, "puladas": int, "questoes": int}`. `revoke all ... from public, anon, authenticated; grant execute ... to authenticated, service_role` |

**Payload da RPC** (`p_atividades`, lista na ordem de inserção; produzido por `payloadDaImportacao`, Task 18):

```json
[
  {
    "codigo_origem": "M3-C1",
    "tipo": "caso",
    "modulo": "M3 · Análise de situações",
    "titulo": "M3 · Caso 1: A luminária",
    "duracao_seg": 600,
    "caso": { "contexto": "…", "etapas": [], "reflexao": "…" }
  },
  {
    "codigo_origem": "M3-Q",
    "tipo": "questionario",
    "modulo": "M3 · Análise de situações",
    "titulo": "M3 · Questionário do módulo",
    "duracao_seg": 900,
    "questoes": [{ "pergunta": "…", "opcoes": ["a", "b", "c", "d"], "correta": 2, "comentario": "…" }]
  },
  {
    "codigo_origem": "M3-T1",
    "tipo": "tarefa",
    "modulo": "M3 · Análise de situações",
    "titulo": "M3 · Atividade de estudo 1: Mapa de riscos",
    "duracao_seg": 2100,
    "conteudo_texto": "Instruções…\n\nO que produzir: …"
  },
  {
    "codigo_origem": "PV-S02A",
    "tipo": "questionario",
    "depois_da_aula_id": "00000000-0000-4000-8000-000000000031",
    "titulo": "Exercícios do vídeo: Riscos no poste",
    "duracao_seg": 300,
    "questoes": [{ "pergunta": "…", "opcoes": ["a", "b", "c", "d"], "correta": 0, "comentario": "…" }]
  }
]
```

O último item é um **exercício pós-vídeo** (decisão A11): questionário logo depois da aula de vídeo de código `S02A`,
achada pela tela (Task 18, `acharAulaDoVideo`) e mandada como `depois_da_aula_id`.

### C2. Eventos novos na trilha (`treinamento_evento`, sempre `origem = 'servidor'`, com `aula_id` na coluna)

| `evento`                | `detalhe`                                                                                                   | Gravado por                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `questionario_iniciado` | `detalheDaProvaIniciada({ tentativa, agora, prova })` (o mesmo formato do `avaliacao_iniciada`)             | `questionario_abrir`           |
| `questionario_envio`    | `{ tentativa, nota, aprovada }`                                                                             | `questionario_enviar`          |
| `caso_escolha`          | `{ rodada, etapa, opcao, segura, proxima, passagem }` (`opcao` = índice original; `proxima` = id ou `null`) | `caso_escolher`                |
| `caso_reiniciado`       | `{ rodada, motivo }` (`rodada` = a nova; `motivo` = `"caso_alterado"`)                                      | `caso_abrir` / `caso_escolher` |
| `caso_concluido`        | `{ rodada, escolhas }` (`escolhas` = quantos cliques na rodada)                                             | `caso_concluir`                |
| `tarefa_confirmada`     | `{ segundos }`                                                                                              | `progresso` (tipo `tarefa`)    |
| `apostila_lida`         | `{ segundos }` (já existe; deixa de levar `minimo`; rótulo passa a "Leu até o fim")                         | `progresso` (`pdf`/`texto`)    |

### C3. Roteiro do caso — mesma API em `apps/web/src/lib/ead-caso.js` (Task 2) e `portal-funcionario/caso.ts` (Task 3)

```ts
// conteudo = { contexto: string, etapas: Etapa[], reflexao: string }
// Etapa = { id: string, pergunta: string, opcoes: Opcao[] }
// Opcao = { texto: string, comentario: string, segura: boolean, proxima: string | null }
export const LIMITES_CASO = { etapas: 30, opcoesMin: 2, opcoesMax: 6, texto: 1000, longo: 4000 };
export type ProblemaDoCaso = { codigo: string; texto: string; etapa: string | null };
export function validarCaso(conteudo: unknown): ProblemaDoCaso[]; // [] = válido
//   códigos: FORMATO, SEM_ETAPAS, MUITAS_ETAPAS, ID_VAZIO, ID_REPETIDO, PERGUNTA_VAZIA, OPCOES_QTD, TEXTO_VAZIO,
//   COMENTARIO_VAZIO, PROXIMA_INEXISTENTE, FIM_INSEGURO, SEM_SEGURA, INALCANCAVEL, SEM_SAIDA, SEM_CAMINHO_SEGURO,
//   TAMANHO. `contexto` e `reflexao` podem ser vazios (até LIMITES_CASO.longo).
export type EstadoDoCaso = {
  valido: boolean; // false: roteiro inválido ou caminho gravado não confere
  motivo: "CASO_INVALIDO" | "CAMINHO_DIVERGENTE" | null;
  fim: boolean; // a última escolha encerrou o caso (opção segura com proxima null)
  etapaAtual: string | null; // null quando fim ou inválido
  passagens: Record<string, number>; // vezes que o aluno esteve em cada etapa nesta rodada (a 1ª etapa começa com 1)
  ultimo: { comentario: string; segura: boolean } | null; // resultado da última escolha
};
export function estadoDoCaso(conteudo: unknown, escolhas: { etapa: string; opcao: number }[]): EstadoDoCaso;
export function etapaParaAluno(
  conteudo: unknown,
  etapaId: string,
  aleatorio: (n: number) => number // inteiro em [0, n); fora disso lança RangeError
): { id: string; pergunta: string; opcoes: { indice: number; texto: string }[] }; // nunca segura/comentario/proxima
export function resultadoDaEscolha(
  conteudo: unknown,
  estado: EstadoDoCaso,
  etapaId: string,
  opcao: unknown
):
  | { ok: false; codigo: "CASO_INVALIDO" | "CASO_ENCERRADO" | "CASO_FORA_DE_ORDEM" | "OPCAO_INVALIDA" }
  | { ok: true; comentario: string; segura: boolean; proxima: string | null; fim: boolean; passagem: number };
//   passagem = estado.passagens[etapaId] (a visita atual àquela etapa)
// só no front (ead-caso.js):
export function novoCasoVazio(): object; // 1 etapa "e1" com 1 opção segura (proxima null) e 1 insegura (proxima "e1")
export function proximoIdDeEtapa(conteudo: unknown): string; // "e<n>" livre
// só no servidor (caso.ts):
export function escolhasDaRodada(
  eventos: { evento: string; detalhe: unknown }[] // da matrícula e aula, em ordem de gravação
): { rodada: number; escolhas: { etapa: string; opcao: number }[] }; // rodada = maior de caso_reiniciado, ou 1
```

### C4. Regras do servidor (Tasks 4–6)

```ts
// regras.ts (Task 4)
export function conclusaoDaAula(p: {
  tipo?: string | null;
  duracao: number;
  segundos: number;
  jaConcluida?: boolean | null;
  pediuConcluir?: unknown;
}): { ehVideo; minimoSeg; atingiuTempo; concluirCedo; faltamSeg; concluiu; podeConcluir }; // mesma forma de hoje
//   video: igual a hoje. pdf/texto/tarefa: concluiu = jaConcluida || pediuConcluir === true; concluirCedo = false;
//   podeConcluir = !concluiu. questionario/caso: concluiu = !!jaConcluida; concluirCedo = false; podeConcluir = false.
export const TIPOS_COM_ACAO_PROPRIA = ["questionario", "caso"] as const; // concluem só pelas ações próprias
export function atividadesDoCertificado(
  aulas: { tipo?: string | null; deleted_at?: string | null }[],
  curso: { nota_minima_modulo?: number | null } | null
): { questionarios: number; casos: number; tarefas: number; nota_minima_modulo: number } | null; // null se 0+0+0
//   aulasParaAluno: `conteudo_texto` também para `tarefa` liberada; questionario/caso nunca levam conteúdo.

// requisitos.ts e lib/ead-requisitos.js (Task 5)
export function requisitosDoCurso(p: { curso?; aulas?; questoes?; casos? }): Requisito[];
//   questoes: TODAS as do curso, cada uma com aula_id (null = prova final), pergunta, opcoes, correta, deleted_at.
//   casos: [{ aula_id, conteudo, deleted_at }]. QUESTOES conta só !aula_id. CONTEUDO por tipo (spec §8).
export function questaoValida(q): boolean; // pergunta preenchida, 2+ opções texto não vazio, correta inteira no intervalo

// questionario.ts (Task 6)
export const NOTA_MINIMA_MODULO_PADRAO = 80;
export function notaMinimaDoModulo(curso: { nota_minima_modulo?: unknown } | null): number; // 0–100; inválido = 80
export async function prepararQuestionario(
  supabase,
  mat,
  aulaId: string,
  empresaId: string,
  comGabarito: boolean
): Promise<
  | { falha: RecusaDaProva }
  | { falha: null; questoes: any[]; curso: any; usadas: number; concluida: boolean; melhorNota: number | null }
>;
//   recusas: 503 (leitura), 400 "Aula não pertence ao curso", 400 "Esta aula não é um questionário",
//   409 { codigo: "AULA_BLOQUEADA" }, 409 { codigo: "QUESTIONARIO_VAZIO" } "Este questionário ainda não tem
//   questões — avise o RH". `RecusaDaProva` vem de prova.ts.
export function mensagemDoEnvio(codigo: string, mensagemPadrao: string): string; // troca "prova" por "questionário"
export function respostaDoQuestionario(p: {
  aprovada: boolean;
  nota: number;
  acertos: number;
  total: number;
  notaMinima: number;
  tentativa: number;
  cursoConcluido: boolean;
  revisao: { questao_id: string; acertou: boolean; resposta_correta: string | null; comentario: string | null }[];
}): {
  resultado: "satisfatorio" | "insatisfatorio";
  aprovada;
  nota;
  acertos;
  total;
  nota_minima;
  tentativa;
  aula_concluida: boolean;
  curso_concluido: boolean;
  revisao;
}; // revisão vai nos dois resultados (A2)
```

### C5. Ações do `portal-funcionario` (Tasks 7–9)

Todas: sessão do portal; `matricula_id` conferida por `minhaMatricula`; aula do curso da matrícula, liberada
(`AULA_BLOQUEADA` 409) e do tipo certo (400); limite de volume novo `VOLUME_POR_ACAO.atividade =
{ escopo: "portal-atividade", janelaSeg: 600, max: 180 }` consumido em toda ação nova; leitura com erro → 503.

| Ação                  | Corpo                                                                                         | Resposta de sucesso (`ok({...})`)                                                                                                                                                       | Recusas                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `questionario_abrir`  | `matricula_id, aula_id`                                                                       | concluída: `{ concluida: true, nota_minima, melhor_nota, tentativas }`; senão `{ concluida: false, tentativa, nota_minima, questoes: [{ id, pergunta, opcoes, ordem_opcoes }] }`        | as de `prepararQuestionario`                                                                                                            |
| `questionario_enviar` | `matricula_id, aula_id, respostas: [{ questao_id, resposta }]` (`resposta` = índice ORIGINAL) | `respostaDoQuestionario(...)`                                                                                                                                                           | 409 `QUESTIONARIO_CONCLUIDO`; códigos de `validarEnvio` com `mensagemDoEnvio`; 409 tentativa repetida                                   |
| `caso_abrir`          | `matricula_id, aula_id`                                                                       | `{ situacao: "concluido", contexto, reflexao }` \| `{ situacao: "fim", contexto, reflexao, ultimo }` \| `{ situacao: "etapa", contexto, etapa: etapaParaAluno(...), passagem, ultimo }` | 409 `CASO_INVALIDO` ("Este caso está com problema — avise o RH")                                                                        |
| `caso_escolher`       | `matricula_id, aula_id, etapa_id, opcao`                                                      | `{ comentario, segura, passagem, fim, etapa: etapaParaAluno(...) \| null, reflexao: string \| null }`                                                                                   | 409 `CASO_FORA_DE_ORDEM` com `estado` = o mesmo objeto do `caso_abrir`; 400 `OPCAO_INVALIDA`; 409 `CASO_ENCERRADO`; 409 `CASO_INVALIDO` |
| `caso_concluir`       | `matricula_id, aula_id`                                                                       | `{ aula_concluida: true, curso_concluido, precisa_avaliacao, status }` (idempotente)                                                                                                    | 409 `CASO_INCOMPLETO` ("Chegue ao fim do caso para concluir")                                                                           |

`progresso` (Task 7): `questionario`/`caso` só creditam tempo (o `concluir` é ignorado); `pdf`/`texto`/`tarefa`
concluem com `concluir: true`, sem tempo mínimo (o 409 `TEMPO_LEITURA` some). A conclusão de aula das ações novas e
do `progresso` passa por uma função interna do `index.ts`, `concluirAula(mat, aula, segundos, eventoExtra)`, que faz o
upsert do progresso, os eventos (`eventoExtra`, `aula_concluida`), `concluirSeCompleto`, `curso_concluido`,
`fecharAdiada` e a troca de status, e devolve `{ aula_concluida, curso_concluido, precisa_avaliacao, status }`.

`dados` (Task 7): `aulasParaAluno` como no C4; a contagem de questões da prova filtra `aula_id is null`; carrega
também as questões dos questionários e os roteiros dos casos dos cursos (só para os requisitos, nunca devolvidos ao
navegador). `certificado` (Task 7): requisitos com `questoes` (todas) e `casos`; `dados.atividades =
atividadesDoCertificado(aulas, curso)` só quando não é `null`.

### C6. Front (Tasks 10–19)

```js
// componentes do portal (props)
<QuestionarioPortal api item aula token fila tratarErro onConcluida /> // Task 11
<CasoPortal api item aula token fila tratarErro onConcluida />          // Task 12
<ApostilaPdf url titulo onEstado obterUrlNova onFim />                  // Task 10: onFim() uma vez, na última página
// lib/certificado-ead.js (Task 14)
export function textoDasAtividades(atividades) // "" se ausente; senão "e conclusão das atividades dos módulos: …"
// lib/portal-previa.js (Task 13)
montarItemPrevia({ curso, aulas, questoes, casos, urls }) // questoes = todas (com aula_id); casos = [{ aula_id, conteudo }]
criarApiPrevia({ item }) // responde também questionario_abrir/enviar e caso_abrir/escolher/concluir, sem gravar
// lib/ead-atividades-importar.js (Task 18)
export const TEMPOS_PADRAO = { questionarioMin: 15, casoMin: 10 };
export function lerPacoteDeAtividades(json) // → { modulos: [{ id, titulo, casos, questoes, tarefas }], erros: string[] }
export function casarModulo(idModulo, modulosDoCurso) // "M3" casa com o texto que começa com "M3 " ou "M3 ·"; senão null
export function planejarImportacao({ pacote, modulosDoCurso, codigosExistentes, tempos, escolhaDeModulo })
//   → { itens: [{ codigo_origem, tipo, modulo, titulo, duracao_seg, conteudo_texto?, caso?, questoes?,
//        moduloPacote, problemas: string[], jaExiste: boolean }], porModulo: [{ moduloPacote, modulo, casos,
//        questoes, tarefas, minutos }] }
export function payloadDaImportacao(itens, desmarcados) // itens sem problema, não existentes e não desmarcados → C1
//   (leva `depois_da_aula_id` quando o item tiver)
// exercícios pós-vídeo já convertidos em múltipla escolha (A11), 2º formato de arquivo:
//   { "tipo": "questionarios_por_video", "itens": [{ "video": "S02A", "questoes": [{ pergunta, opcoes, correta, comentario }] }] }
export const TEMPO_PADRAO_POS_VIDEO_MIN = 5;
export function lerQuestionariosPorVideo(json) // → { itens: [{ video, questoes }], erros: string[] }
export function acharAulaDoVideo(codigo, aulas) // aula "video" não apagada com o código no nome do arquivo do video_ref:
//   /(^|[/_-])CODIGO(_|\.)/i ("S02A" não casa com "S02AB"); senão null
export function planejarImportacaoPorVideo({ arquivo, aulas, codigosExistentes, minutos })
//   → { itens: [{ codigo_origem: "PV-<video>", tipo: "questionario", depois_da_aula_id, modulo,
//        titulo: "Exercícios do vídeo: <título da aula de vídeo>", duracao_seg, questoes, video, problemas, jaExiste }] }
//   vídeo não achado = problema "vídeo <código> não encontrado neste curso"
<ImportarAtividadesDialog aberto onFechar curso aulas onImportado /> // Task 19; chama supabase.rpc("importar_atividades_ead", { p_curso_id, p_atividades })
<CasoEditor valor onChange desabilitado /> // Task 17; controlado; mostra validarCaso(valor) e expõe se há problema
```

Entidades novas no SDK (nome em PascalCase → tabela, `shared/sdk/src/name-mapper.js`): `TreinamentoCaso`
(`treinamento_caso`) e `TreinamentoQuestionarioTentativa` (`treinamento_questionario_tentativa`, só leitura no front).

---

## Ajustes ao contrato (conciliação da redação)

Feitos pelo coordenador depois de ler as quatro partes; valem sobre o texto de C1–C6 acima.

1. **RPC:** código de origem repetido **na própria lista** é recusado (`22023`, "Código de origem repetido na lista:
   <código>"), não pulado. A âncora `depois_da_aula_id` só é conferida para o item que vai entrar (o pulado por já
   existir não exige a aula). O índice `(matricula_id, aula_id)` da tentativa foi omitido: o
   `unique (matricula_id, aula_id, numero)` já o cobre.
2. **Nota mínima do módulo:** `NOTA_MINIMA_MODULO_PADRAO` e `notaMinimaDoModulo` nascem em `regras.ts` (Task 4), porque
   `atividadesDoCertificado` as usa e `questionario.ts` importa `regras.ts`. A Task 6 só reexporta
   (`export { NOTA_MINIMA_MODULO_PADRAO, notaMinimaDoModulo } from "./regras.ts";`).
3. **Caso:** `resultadoDaEscolha` recusa nesta ordem: `CASO_INVALIDO`, `CASO_ENCERRADO` (estado no fim), `CASO_FORA_DE_ORDEM`,
   `OPCAO_INVALIDA`. A orquestração do aluno (leitura com banco injetado + respostas) fica em
   `portal-funcionario/caso-aluno.ts` (Task 9), para não mexer no `caso.ts` cujo teste confere as duas cópias.
4. **Questionário:** `prepararQuestionario` devolve também `aula`; `questionario.ts` exporta ainda `aulaDaAtividade`,
   `revisaoDoQuestionario`, `EVENTO_QUESTIONARIO_INICIADO`, `EVENTO_QUESTIONARIO_ENVIO`,
   `MSG_QUESTIONARIO_INDISPONIVEL`, `MSG_QUESTIONARIO_VAZIO`. Recusas extras: envio repetido = 409
   `TENTATIVA_REPETIDA`; `caso_escolher` sem `etapa_id` = 400. A tentativa grava `prova` e `respostas` no **mesmo
   formato** de `treinamento_tentativa` (`index.ts:1867-1894`), que a Task 15 lê com `detalharTentativa`.
5. **`progresso`:** o pedido que só credita tempo não regrava `concluida`/`concluida_em` (não desfaz a conclusão gravada
   ao mesmo tempo por `questionario_enviar`/`caso_concluir`); tipo de aula desconhecido nunca conclui por ele.
   `dados` responde 503 se as leituras novas falharem: o deploy da função vem **depois** da migração 0170.
6. **Vídeo da importação pós-vídeo:** `acharAulaDoVideo` usa `/(^|[/_-])CODIGO(_|\.)/i` (o hífen cobre os uploads da
   tela, gravados como `<uuid>-<nome>`); o código do vídeo é guardado em maiúsculas. `ead-atividades-importar.js`
   exporta também `MODULO_NOVO`, `FORMATO_POR_VIDEO`, `formatoDoArquivo`, `minutosDoTempo`, `modulosDasAulas`,
   `codigosDasAulas`, `situacaoDaImportacao`, `textoDoResumoDaImportacao`, `mensagemDoErroDaImportacao`.
7. **Portal e prévia:** `onConcluida(resposta)` recebe a resposta da ação; `criarApiPrevia({ item, aleatorio })`
   aceita `aleatorio` (testes); na prévia, `questionario_enviar` e `caso_concluir` devolvem `aula_concluida: false` e o
   caso recomeça depois de concluído; o item da prévia ganha `atividades_previa`. O rascunho do questionário no
   aparelho usa a chave `<matrícula>:questionario:<aula>` (não colide com a prova). `apostilaNaPagina` e
   `MEDIA_APOSTILA_NA_PAGINA` saem de `lib/apostila-pdf.js` (só eram usados pelo `ApostilaPdf` e pelo `CursoPortal`).
8. **RH:** o projeto pedagógico (`lib/ead-projeto.js`) e a prova da prévia contam só as questões sem `aula_id`. A troca
   do `tipo` de uma aula que já tem questões ou roteiro **não** é barrada no banco; a tela não oferece a troca (a
   edição da aula não muda o tipo) e o servidor confere o tipo em toda ação. Fica registrado como limite aceito.

**Arquivos além do "Mapa de arquivos":** `portal-funcionario/caso-aluno.ts` (+ teste, Task 9),
`portal-funcionario/atividades-index.test.ts` (Tasks 7–9), `lib/portal-leitura.js`, `lib/portal-questionario.js`,
`lib/portal-caso.js` (+ testes, Tasks 10–12; `CorrecaoComentada` passa a ser exportada de `AvaliacaoPortal.jsx`),
`components/seguranca/exportarDossieEad.js` (+ teste) e `ProvaDaTentativa.jsx` (Task 15), `QuestoesEad.jsx` (novo),
`lib/ead-aula-nova.js` (novo), `lib/ead-impacto.js`, `lib/ead-curso-numeros.js`, `lib/ead-projeto.js` (Task 16),
`lib/ead-caso-edicao.js` (novo, Task 17).

## Ordem das tasks

**Ordem de execução:** 1, 2, 3, 4, 5, 6, **15**, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20 (a ordem em que as
tasks aparecem abaixo). A Task 15 vem antes da 7 porque o `ead-trilha.test.js` ("todo evento que o servidor grava tem
rótulo") lê o `index.ts`: com os rótulos antes, a suíte do front não fica vermelha nas Tasks 7–9. Os totais de testes
citados em cada task supõem a numeração; conte pelo resultado real.

| #   | Task                                                                                            | Parte |
| --- | ----------------------------------------------------------------------------------------------- | ----- |
| 1   | Migração 0170, teste de forma e smoke                                                           | A     |
| 2   | Roteiro do caso no front (`ead-caso.js`)                                                        | A     |
| 3   | Roteiro do caso no servidor (`caso.ts`)                                                         | A     |
| 4   | Conclusão sem tempo, texto da tarefa, resumo do certificado (`regras.ts`)                       | A     |
| 5   | Requisitos por tipo (as duas cópias)                                                            | A     |
| 6   | Questionário no servidor (`questionario.ts`)                                                    | A     |
| 7   | `index.ts`: prova só com `aula_id` vazio, `concluirAula`, `progresso`, `dados`, `certificado`   | A     |
| 8   | `index.ts`: ações do questionário                                                               | A     |
| 9   | `index.ts`: ações do caso                                                                       | A     |
| 10  | Portal: leitura até o fim, PDF em pdf.js, tarefa, ícones                                        | B     |
| 11  | Portal: tela do questionário                                                                    | B     |
| 12  | Portal: tela do caso                                                                            | B     |
| 13  | "Ver como aluno" com as atividades                                                              | B     |
| 14  | Certificado: frase das atividades                                                               | B     |
| 15  | Trilha, auditoria e dossiê                                                                      | C     |
| 16  | Tela do RH: tipos novos, texto, nota do módulo, questões por questionário, casos nos requisitos | C     |
| 17  | Editor do caso                                                                                  | C     |
| 18  | Leitor e plano da importação (`ead-atividades-importar.js`)                                     | C     |
| 19  | Diálogo "Importar atividades"                                                                   | C     |
| 20  | Handoff, roteiro de teste e verificação final                                                   | C     |

---

## Notas de integração (da redação das partes)

Os redatores de cada parte conferiram o código numa cópia descartável do repositório. As notas abaixo registram o que
acrescentaram ao contrato ou supuseram de outra parte; o coordenador já as conciliou (ver "Ajustes ao contrato"
acima). Valem como explicação; o código das tasks é que se aplica.

### Notas — Tasks 1–5

> NOTA AO COORDENADOR (parte A1, Tasks 1–5). Nada impede o contrato; são ajustes e avisos para as outras tasks:
>
> 1. **`depois_da_aula_id` (mudança do C1 pedida em 14/10) já está na Task 1** (migração, teste de forma e smoke). Falta
>    só atualizar a linha da RPC na tabela C1 do plano: campo opcional por item; a aula tem de ser do mesmo curso e viva
>    (senão 22023 com o código de origem); o item entra logo depois dela (e depois dos itens anteriores com a mesma
>    âncora, na ordem da lista) e herda o `modulo` dela; o UPDATE de `ordem` é um por grupo (a mesma âncora, ou o mesmo
>    módulo). Decisão minha: a âncora só é conferida para o item que VAI entrar (item pulado por já existir não exige
>    que a aula de referência ainda exista).
> 2. **Código de origem repetido na própria lista: RECUSADO** (22023 `Código de origem repetido na lista: <código>`),
>    não pulado: a lista vem da prévia, e repetir código é pacote malformado; pular em silêncio perderia conteúdo
>    numa importação tudo ou nada. A Task 18 (`planejarImportacao`) deve marcar código repetido como problema.
> 3. **`NOTA_MINIMA_MODULO_PADRAO` e `notaMinimaDoModulo` nascem em `regras.ts` (Task 4)**, porque
>    `atividadesDoCertificado` (C4, `regras.ts`) precisa deles e `questionario.ts` importa `regras.ts` (o contrário
>    seria import circular). A Task 6 deve só reexportar, sem redefinir:
>    `export { NOTA_MINIMA_MODULO_PADRAO, notaMinimaDoModulo } from "./regras.ts";` (os consumidores do C4 não mudam).
> 4. **Índice `(matricula_id, aula_id)` da tentativa omitido**: o `unique (matricula_id, aula_id, numero)` já é índice
>    com esse prefixo; outro seria redundante.
> 5. **Para a Task 7**: `requisitosDoCurso` casa questão e roteiro com a aula por `aula.id` (aula sem `id` nunca casa).
>    O SELECT das aulas do `certificado` (`index.ts:2118-2121`) não traz `id`, e o das questões do `dados`
>    (`index.ts:1149`, `.select("id, curso_id")`) não traz `aula_id, pergunta, opcoes, correta`: os dois precisam
>    dessas colunas, e os roteiros (`treinamento_caso`) também precisam ser lidos, ou o CONTEUDO de questionário e caso
>    fica pendente.
> 6. **Para a Task 16**: `lib/ead-projeto.js:293` (`montarProjeto`) conta TODAS as questões vivas no item de avaliação
>    do projeto pedagógico, e `TreinamentosEadTab.jsx:554-557` passa `todasQuestoes`: passe só as `!aula_id`. O mesmo
>    vale para `montarItemPrevia` (Task 13).
> 7. **`conclusaoDaAula`**: tipo desconhecido (que o CHECK não deixa gravar) passa a NUNCA concluir pelo `progresso`
>    (antes era tratado como leitura com tempo); fora do vídeo, `minimoSeg` e `faltamSeg` são 0 e `atingiuTempo` é
>    `true` só na leitura/tarefa. `aulasParaAluno`/`refsDasAulasLiberadas` também não assinam legenda nem arquivo de
>    questionário e caso.
> 8. Fora do contrato, não implementado (decidir): mudar o `tipo` de uma aula que já tem questões ou roteiro não é
>    barrado no banco (os triggers novos só olham a questão e o roteiro). O servidor confere o tipo nas ações; a tela da
>    Task 16 pode impedir a troca.

### Notas — Tasks 6–9

> NOTA AO COORDENADOR: o contrato é viável; abaixo, o que estas tasks acrescentam ou assumem (nada é renomeado).
>
> 1. **Arquivo novo fora do mapa (Task 9):** `supabase/functions/portal-funcionario/caso-aluno.ts` (+ `caso-aluno.test.ts`)
>    com a orquestração do caso (leitura com banco injetado + respostas puras). Fica fora do `caso.ts` da Task 3 para
>    não mexer no arquivo cujo teste confere as duas cópias. Acrescentar ao "Mapa de arquivos", linha da Task 9.
> 2. **Extensões compatíveis do C4 (Task 6):** `prepararQuestionario` também devolve `aula` (a linha da trilha, que o
>    `concluirAula` precisa); `questionario.ts` exporta ainda `aulaDaAtividade`, `type AulaDaTrilha`,
>    `revisaoDoQuestionario`, `EVENTO_QUESTIONARIO_INICIADO`, `EVENTO_QUESTIONARIO_ENVIO`,
>    `MSG_QUESTIONARIO_INDISPONIVEL` e `MSG_QUESTIONARIO_VAZIO`.
> 3. **Suposições sobre o C3 (Task 3):** com `estado.fim`, `resultadoDaEscolha` devolve `CASO_ENCERRADO` (antes de
>    `CASO_FORA_DE_ORDEM`); `estadoDoCaso(roteiroVálido, [])` dá a 1ª etapa com `passagens = { <1ª>: 1 }`;
>    `escolhasDaRodada` lê `detalhe.rodada/etapa/opcao`. O `caso-aluno.test.ts` depende disso.
> 4. **Suposição sobre o C4 (Task 5):** `QUESTOES` só CONTA as questões sem `aula_id` (não as valida); por isso as
>    leituras da prova em `dados`/`certificado` trazem só `id, curso_id, aula_id`. Se a Task 5 validar, trocar o select.
> 5. **Detalhes de comportamento:** o `progresso` só de tempo deixa de regravar `concluida/concluida_em` (senão um
>    sinal em voo desfaria a conclusão gravada ao mesmo tempo por `questionario_enviar`/`caso_concluir`); `dados`
>    responde 503 se as leituras novas falharem, então o deploy da função vem DEPOIS da migração 0170 (§12 já está
>    nessa ordem); recusas extras: `questionario_enviar` duplicado = 409 `TENTATIVA_REPETIDA`; `caso_escolher` sem
>    `etapa_id` = 400; `caso_concluir` repetido devolve `curso_concluido: mat.status === "concluido"`.
> 6. **Testes existentes:** nenhum teste do servidor precisa ser corrigido (conferidos um a um na Task 7, Step 7); só há
>    acréscimos em `prova.test.ts`, `conclusao.test.ts` (Task 7), `regras.test.ts` e `trilha-imutavel.test.ts` (Task 8).
>    Do front, o `ead-trilha.test.js` (`apostila_lida` com `minimo`) é da Task 15.

### Notas — Tasks 15–20

> NOTA AO COORDENADOR:
>
> 1. **Ordem das tasks e o teste da trilha.** `apps/web/src/lib/ead-trilha.test.js` ("todo evento que o servidor grava
>    tem rótulo") lê `portal-funcionario/index.ts` e acusa qualquer `evento: "..."` sem rótulo. As Tasks 7–9 gravam
>    `tarefa_confirmada`, `questionario_iniciado`, `questionario_envio`, `caso_escolha`, `caso_reiniciado` e
>    `caso_concluido`: a suíte do front fica vermelha da Task 7 até a Task 15. A Task 15 só depende das Tasks 1–6
>    (tabela e eventos do contrato; `caso.ts` e `questionario.ts` existem). **Proposta:** executar a Task 15 logo
>    depois da Task 6 (antes da 7), ou mover os Steps 1–4 dela (só `ead-trilha.js` e o teste) para dentro da Task 7.
> 2. **Formato da tentativa do questionário.** Os Detalhes da matrícula e o dossiê (Task 15) leem
>    `treinamento_questionario_tentativa.prova` e `.respostas` com `detalharTentativa` (`lib/ead-tentativa.js`), como
>    as tentativas da prova. A Task 8 precisa gravar o mesmo formato de `treinamento_tentativa`
>    (`index.ts:1867`): `prova: [{ questao_id, ordem, pergunta, opcoes, correta }]` e
>    `respostas: [{ questao_id, resposta, acertou, posicao_exibida, ordem_opcoes_exibida }]`.
> 3. **Exercícios pós-vídeo (mudança de contrato de 14/10).** `acharAulaDoVideo` usa `(^|[/_-])CODIGO(_|\.)`, com o
>    **hífen** também como separador anterior: o upload pela tela grava `treinamentos/<empresa>/<ano>/<mês>/<uuid>-<nome>`
>    (`lib/ead-upload.js:104-111`), e sem o hífen nenhum vídeo enviado pela tela casaria. O hífen não cria falso
>    positivo dentro do uuid (segmento hexadecimal seguido de `-`, nunca de `_` ou `.`), e "S02A" continua não casando
>    com "S02AB". A RPC da Task 1 precisa aceitar o campo opcional `depois_da_aula_id` no item (C1 atualizado).
> 4. **Arquivos fora do "Mapa de arquivos"** que estas tasks tocam, por consequência direta da feature:
>    `components/seguranca/exportarDossieEad.js` (+ teste) e `ProvaDaTentativa.jsx` (Task 15);
>    `components/seguranca/QuestoesEad.jsx` (novo: o editor de questões sai da aba para servir à prova e aos
>    questionários), `lib/ead-aula-nova.js` (novo), `lib/ead-impacto.js`, `lib/ead-curso-numeros.js` e
>    `lib/ead-projeto.js` (o item "o" do projeto pedagógico contaria as questões dos questionários como questões da
>    prova final) (Task 16); `lib/ead-caso-edicao.js` (novo, Task 17).
> 5. Exports extras (o contrato C6 diz o mínimo): `ead-atividades-importar.js` exporta também `MODULO_NOVO`,
>    `FORMATO_POR_VIDEO`, `formatoDoArquivo`, `minutosDoTempo`, `modulosDasAulas`, `codigosDasAulas`,
>    `situacaoDaImportacao`, `textoDoResumoDaImportacao` e `mensagemDoErroDaImportacao`; os itens do plano levam também
>    `tituloPacote`/`origem` (por módulo) e `aulaDoVideo` (pós-vídeo). `lerQuestionariosPorVideo` grava o código do
>    vídeo em maiúsculas (o `codigo_origem` "PV-<video>" não duplica por diferença de caixa).

---

## Tasks (na ordem de execução)

<!-- prettier-ignore-start -->

### Task 1: Migração 0170, teste de forma e smoke

**Files:**

- Create: `supabase/migrations/0170_ead_atividades_interativas.sql`
- Create: `supabase/functions/portal-funcionario/atividades-banco.test.ts`
- Create: `tools/smoke-ead-atividades.sql`
- Read (não muda): `supabase/migrations/0118_referencias_da_mesma_empresa.sql:24-62` (o `exigir_referencias_da_empresa`
  pula coluna NULL em `:41`, `continue when valor is null;`: a questão da prova final, com `aula_id` vazio, continua
  gravável sem ajuste), `0135_trilha_imutavel.sql:96-152`, `0147_permissoes_ead.sql:217-308` (o ramo `else` em
  `:266-270` já exige Editar de tabela nova: a função NÃO é reescrita), `0147:414-427` (policy restritiva),
  `0110_rpc_security_definer_tenant.sql:39-71` e `:1264-1268` (grants), `0103_portal_funcionario_login_auditoria.sql:56-64`
  (`tenant_read`/`super_admin_read`), `0143_ead_pratica_presencial.sql:208-308` (modelo de tabela nova e de trigger
  "coerente"), `tools/smoke-ead-pre-requisito.sql` e `tools/smoke-permissoes-ead.sql:81-117` (modelo do smoke).

**Interfaces:**

- Consumes (já no banco): `public.exigir_referencias_da_empresa()` (0118), `public.trilha_imutavel()` (0135),
  `public.zz_permissao_ead()` (0147, ramo padrão = Editar), `public.tem_permissao(text, text, text)` (0147),
  `public.exigir_empresa_do_chamador(uuid, text)` (0110), `apply_tenant_rls(text)` (0014),
  `attach_updated_at_trigger(text)` (0001).
- Produces (C1): `treinamento_aula_tipo_chk` com `('video','pdf','texto','questionario','caso','tarefa')`;
  `treinamento_aula.codigo_origem` + `treinamento_aula_codigo_origem_uniq`; `treinamento_questao.aula_id` +
  `trein_questao_aula_idx` + trigger `questao_do_questionario`; `treinamento_curso.nota_minima_modulo` (padrão 80,
  `treinamento_curso_nota_minima_modulo_chk`); tabelas `treinamento_caso` e `treinamento_questionario_tentativa`; RPC
  `public.importar_atividades_ead(p_curso_id uuid, p_atividades jsonb) returns jsonb` → `{"criadas": int, "puladas": int,
  "questoes": int}`, com o item do payload `{ codigo_origem, tipo, modulo, titulo, duracao_seg, conteudo_texto? |
  questoes? | caso?, depois_da_aula_id? }`.

- [ ] **Step 1: Escrever o teste de forma (falha: a migração ainda não existe)**

Crie `supabase/functions/portal-funcionario/atividades-banco.test.ts`:

```ts
// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/atividades-banco.test.ts
//
// Guarda das atividades interativas no banco (spec 2026-10-14 §6): migração `0170_ead_atividades_interativas.sql`
// e o smoke `tools/smoke-ead-atividades.sql`. Não há banco de teste (nem Postgres no PC) e `npm run dev` fala com
// produção, então o que se confere aqui é a FORMA dos arquivos; o comportamento no banco é o do smoke
// (begin ... rollback), que o Javerson roda. O pareamento dos `$$` de todas as migrações e dos smokes do EAD é do
// `migracoes-delimitadores.test.ts`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const lerArquivo = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), "utf8");
const pasta = join(RAIZ, "supabase", "migrations");
const arquivos0170 = readdirSync(pasta).filter((n) => /^0170_.+\.sql$/.test(n));

test("existe exatamente uma migração 0170 (o número desta tarefa)", () => {
  assert.deepEqual(arquivos0170, ["0170_ead_atividades_interativas.sql"]);
});

const migracao = lerArquivo("supabase", "migrations", arquivos0170[0] ?? "0170_ausente.sql");

/** SQL sem comentário de linha (a migração não tem `--` dentro de texto entre aspas). */
const semComentarios = (sql: string) =>
  sql
    .split("\n")
    .map((linha) => linha.replace(/--.*$/, ""))
    .join("\n");
const compacto = (sql: string) => sql.replace(/\s+/g, " ").trim();
const sql = compacto(semComentarios(migracao));
/** A migração sem os corpos das funções: o que roda ao aplicar (os corpos só rodam quando chamados). */
const foraDasFuncoes = sql.replace(/\$\$.*?\$\$/g, "$$$$");
/**
 * O corpo de `create or replace function public.<nome>(...) ... as $$ ... $$;` (compactado), do PRIMEIRO `$$` que o
 * abre ao primeiro `$$;` que o fecha. Entre o cabeçalho e o `$$` não pode haver `$` (`[^$]*?`): um `as $` sozinho
 * não casa e o teste falha, em vez de atravessar até a função seguinte (o defeito da 0143).
 */
const corpo = (nome: string) =>
  new RegExp(`create or replace function public\\.${nome}\\([^)]*\\)[^$]*?\\$\\$(.*?)\\$\\$;`).exec(
    sql
  )?.[1] ?? "";

const FUNCOES = ["questao_do_questionario", "caso_da_aula", "importar_atividades_ead"];

// ------------------------------------------------------------------------------------------------- arquivo
test("termina em select 'ok' as res;, roda numa transação só e pede o bloqueio com lock_timeout", () => {
  assert.ok(migracao.trimEnd().endsWith("select 'ok' as res;"));
  assert.equal([...sql.matchAll(/\bbegin;/g)].length, 1);
  assert.equal([...sql.matchAll(/\bcommit;/g)].length, 1);
  assert.ok(sql.indexOf("set local lock_timeout = '10s';") < sql.indexOf("alter table"));
});

test("três funções, cada uma com o próprio $$, e nenhum corpo atravessa outra função", () => {
  const nomes = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(nomes, FUNCOES);
  assert.equal([...sql.matchAll(/\$/g)].length, FUNCOES.length * 4, "sem $ solto");
  for (const nome of FUNCOES) {
    const f = corpo(nome);
    assert.ok(f, `${nome}: corpo não encontrado`);
    assert.ok(
      !f.includes("create or replace function"),
      `${nome}: o corpo atravessou outra função`
    );
    assert.ok(f.includes("begin") && /end; ?$/.test(f), `${nome}: corpo sem begin/end`);
  }
  assert.equal(/\bcreate function\b/.test(sql), false, "função só com create or replace");
});

test("não grava dado real ao aplicar: INSERT/UPDATE/DELETE só dentro do corpo da RPC", () => {
  assert.equal(/\bupdate public\./.test(foraDasFuncoes), false, "UPDATE fora de função");
  assert.equal(/\binsert into\b/.test(foraDasFuncoes), false, "INSERT fora de função");
  assert.equal(/\bdelete from\b/.test(foraDasFuncoes), false, "DELETE fora de função");
  assert.equal(/\btruncate public\./.test(foraDasFuncoes), false, "TRUNCATE fora de função");
  for (const nome of ["questao_do_questionario", "caso_da_aula"]) {
    assert.equal(/\b(insert|update|delete)\b/.test(corpo(nome)), false, `${nome} só lê`);
  }
});

test("idempotente: restrição, trigger e policy derrubados antes; colunas, tabelas e índices com if not exists", () => {
  for (const m of sql.matchAll(/alter table (public\.\w+) add constraint (\w+)/g)) {
    assert.ok(
      sql.includes(`alter table ${m[1]} drop constraint if exists ${m[2]};`),
      `${m[2]} sem drop constraint if exists`
    );
  }
  for (const m of foraDasFuncoes.matchAll(
    /create trigger (\w+) (?:before|after) .*? on (public\.\w+)/g
  )) {
    assert.ok(sql.includes(`drop trigger if exists ${m[1]} on ${m[2]};`), `${m[1]} em ${m[2]}`);
  }
  for (const m of sql.matchAll(/create policy (\w+) on (public\.\w+)/g)) {
    assert.ok(sql.includes(`drop policy if exists ${m[1]} on ${m[2]};`), `${m[1]} em ${m[2]}`);
  }
  assert.equal(/add column (?!if not exists)/.test(sql), false);
  assert.equal(/create table (?!if not exists)/.test(sql), false);
  assert.equal(/create (unique )?index (?!if not exists)/.test(sql), false);
});

// ------------------------------------------------------------------------------------- aula, questão, curso
test("tipos de aula: o CHECK aceita os três tipos novos além de vídeo, PDF e texto", () => {
  assert.ok(
    sql.includes(
      "alter table public.treinamento_aula add constraint treinamento_aula_tipo_chk check (tipo in ('video', 'pdf', 'texto', 'questionario', 'caso', 'tarefa'));"
    )
  );
  assert.ok(
    sql.includes(
      "alter table public.treinamento_aula drop constraint if exists treinamento_aula_tipo_chk;"
    )
  );
});

test("codigo_origem: coluna e único parcial (curso, código) entre as aulas vivas", () => {
  assert.ok(
    sql.includes("alter table public.treinamento_aula add column if not exists codigo_origem text;")
  );
  assert.ok(
    sql.includes(
      "create unique index if not exists treinamento_aula_codigo_origem_uniq on public.treinamento_aula(curso_id, codigo_origem) where deleted_at is null and codigo_origem is not null;"
    )
  );
});

test("questão: aula_id (vazio = prova final) com FK em cascata, índice e referências da mesma empresa", () => {
  assert.ok(
    sql.includes(
      "alter table public.treinamento_questao add column if not exists aula_id uuid references public.treinamento_aula(id) on delete cascade;"
    )
  );
  assert.ok(
    sql.includes(
      "create index if not exists trein_questao_aula_idx on public.treinamento_questao(aula_id);"
    )
  );
  assert.ok(
    sql.includes(
      "create trigger referencias_da_empresa before insert or update of curso_id, empresa_id, aula_id on public.treinamento_questao for each row execute function public.exigir_referencias_da_empresa( 'curso_id:treinamento_curso', 'aula_id:treinamento_aula' );"
    )
  );
  // a 0118 pula a coluna vazia: a questão da prova final (aula_id NULL) continua gravável
  const da0118 = lerArquivo("supabase", "migrations", "0118_referencias_da_mesma_empresa.sql");
  assert.ok(da0118.includes("continue when valor is null;"));
});

test("questao_do_questionario: a aula é do mesmo curso e empresa, viva e do tipo questionário (23514)", () => {
  const f = corpo("questao_do_questionario");
  // não é SECURITY DEFINER: roda com os direitos (e a RLS) de quem grava, como pratica_participante_coerente
  for (const nome of ["questao_do_questionario", "caso_da_aula"]) {
    const inicio = sql.indexOf(`create or replace function public.${nome}()`);
    assert.equal(sql.slice(inicio, sql.indexOf("$$", inicio)).includes("security definer"), false);
  }
  assert.ok(f.includes("if new.aula_id is null then return new;"), "a prova final passa");
  for (const trecho of [
    "a.id = new.aula_id",
    "a.curso_id = new.curso_id",
    "a.empresa_id = new.empresa_id",
    "(a.deleted_at is null or new.deleted_at is not null)",
    "v_tipo is distinct from 'questionario'",
  ]) {
    assert.ok(f.includes(trecho), trecho);
  }
  assert.equal([...f.matchAll(/using errcode = '23514'/g)].length, 2);
  assert.ok(
    sql.includes(
      "create trigger questao_do_questionario before insert or update of aula_id, curso_id on public.treinamento_questao for each row execute function public.questao_do_questionario();"
    )
  );
  assert.ok(
    sql.includes(
      "revoke all on function public.questao_do_questionario() from public, anon, authenticated;"
    )
  );
});

test("nota mínima do módulo: inteiro, padrão 80, de 0 a 100, fora do que o cadastro central copia", () => {
  assert.ok(
    sql.includes(
      "alter table public.treinamento_curso add column if not exists nota_minima_modulo integer not null default 80;"
    )
  );
  assert.ok(
    sql.includes(
      "add constraint treinamento_curso_nota_minima_modulo_chk check (nota_minima_modulo between 0 and 100);"
    )
  );
  const da0139 = lerArquivo("supabase", "migrations", "0139_ead_travas_de_integridade.sql");
  assert.equal(da0139.includes("nota_minima_modulo"), false);
  assert.equal(sql.includes("validar_modelo_de_treinamento"), false);
});

// --------------------------------------------------------------------------------------- roteiro do caso
test("treinamento_caso: colunas, objeto JSON, um roteiro vivo por aula e índice do curso", () => {
  const tabela =
    /create table if not exists public\.treinamento_caso \((.*?)\);/.exec(sql)?.[1] ?? "";
  for (const coluna of [
    "id uuid primary key default gen_random_uuid()",
    "empresa_id uuid not null references public.empresa(id) on delete cascade",
    "curso_id uuid not null references public.treinamento_curso(id) on delete cascade",
    "aula_id uuid not null references public.treinamento_aula(id) on delete cascade",
    "conteudo jsonb not null",
    "created_at timestamptz not null default now()",
    "updated_at timestamptz not null default now()",
    "deleted_at timestamptz",
  ]) {
    assert.ok(tabela.includes(coluna), coluna);
  }
  assert.ok(
    sql.includes(
      "add constraint treinamento_caso_conteudo_chk check (jsonb_typeof(conteudo) = 'object');"
    )
  );
  assert.ok(
    sql.includes(
      "create unique index if not exists treinamento_caso_aula_uniq on public.treinamento_caso(aula_id) where deleted_at is null;"
    )
  );
  assert.ok(
    sql.includes(
      "create index if not exists treinamento_caso_curso_idx on public.treinamento_caso(curso_id);"
    )
  );
});

test("treinamento_caso: RLS da empresa, leitura só com a aba (restritiva), nada para anon, sem DELETE", () => {
  const t = "public.treinamento_caso";
  assert.ok(sql.includes(`drop policy if exists super_admin_all on ${t};`));
  assert.ok(sql.includes(`drop policy if exists tenant_isolation on ${t};`));
  assert.ok(
    sql.indexOf(`drop policy if exists tenant_isolation on ${t};`) <
      sql.indexOf("select apply_tenant_rls('treinamento_caso');")
  );
  assert.ok(
    sql.includes(
      `create policy ead_leitura_com_permissao on ${t} as restrictive for select to authenticated using ((select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD')));`
    )
  );
  assert.ok(sql.includes(`revoke all on ${t} from anon;`));
  assert.ok(sql.includes(`revoke delete, truncate on ${t} from authenticated;`));
  assert.ok(sql.includes("select attach_updated_at_trigger('treinamento_caso');"));
});

test("treinamento_caso: referências da empresa, caso_da_aula (23514) e zz_permissao_ead sem reescrever a função", () => {
  assert.ok(
    sql.includes(
      "create trigger referencias_da_empresa before insert or update of curso_id, aula_id, empresa_id on public.treinamento_caso for each row execute function public.exigir_referencias_da_empresa( 'curso_id:treinamento_curso', 'aula_id:treinamento_aula' );"
    )
  );
  const f = corpo("caso_da_aula");
  for (const trecho of [
    "a.id = new.aula_id",
    "a.curso_id = new.curso_id",
    "a.empresa_id = new.empresa_id",
    "(a.deleted_at is null or new.deleted_at is not null)",
    "v_tipo is distinct from 'caso'",
  ]) {
    assert.ok(f.includes(trecho), trecho);
  }
  assert.equal([...f.matchAll(/using errcode = '23514'/g)].length, 2);
  assert.ok(
    sql.includes(
      "create trigger caso_da_aula before insert or update of aula_id, curso_id on public.treinamento_caso for each row execute function public.caso_da_aula();"
    )
  );
  assert.ok(
    sql.includes(
      "create trigger zz_permissao_ead before insert or update on public.treinamento_caso for each row execute function public.zz_permissao_ead();"
    )
  );
  // a função da 0147 não muda: o ramo padrão (Editar) já cobre a tabela nova
  assert.equal(sql.includes("create or replace function public.zz_permissao_ead"), false);
  const da0147 = lerArquivo("supabase", "migrations", "0147_permissoes_ead.sql");
  assert.match(
    da0147,
    /else\s+-- treinamento_aula, treinamento_questao[^\n]*\n[^\n]*\n\s+v_exige := array\['editar'\];/
  );
});

test("os triggers novos disparam ANTES do zz_permissao_ead (ordem de bytes, como o Postgres)", () => {
  const novos = [...foraDasFuncoes.matchAll(/create trigger (\w+) before/g)].map((m) => m[1]);
  assert.ok(novos.includes("questao_do_questionario") && novos.includes("caso_da_aula"));
  for (const nome of novos) {
    if (nome === "zz_permissao_ead") continue;
    assert.ok(Buffer.compare(Buffer.from(nome), Buffer.from("zz_permissao_ead")) < 0, nome);
    assert.equal(nome.startsWith("zz"), false, nome);
  }
});

// ------------------------------------------------------------------------------- tentativas do questionário
test("treinamento_questionario_tentativa: colunas, número >= 1 e único por matrícula, aula e número", () => {
  const tabela =
    /create table if not exists public\.treinamento_questionario_tentativa \((.*?)\);/.exec(
      sql
    )?.[1] ?? "";
  for (const coluna of [
    "empresa_id uuid not null references public.empresa(id) on delete cascade",
    "matricula_id uuid not null references public.treinamento_matricula(id) on delete cascade",
    "curso_id uuid not null",
    "aula_id uuid not null references public.treinamento_aula(id) on delete cascade",
    "funcionario_id uuid not null references public.funcionario(id) on delete cascade",
    "numero integer not null",
    "prova jsonb not null",
    "respostas jsonb not null",
    "acertos integer not null",
    "total integer not null",
    "nota numeric not null",
    "aprovada boolean not null",
    "ip text",
    "dispositivo text",
    "created_at timestamptz not null default now()",
    "unique (matricula_id, aula_id, numero)",
  ]) {
    assert.ok(tabela.includes(coluna), coluna);
  }
  assert.ok(
    sql.includes(
      "add constraint treinamento_questionario_tentativa_numero_chk check (numero >= 1);"
    )
  );
});

test("tentativas: só o servidor grava, leitura da empresa com a aba, imutáveis (trilha_imutavel da 0135)", () => {
  const t = "public.treinamento_questionario_tentativa";
  assert.ok(sql.includes(`alter table ${t} enable row level security;`));
  assert.ok(
    sql.includes(
      `create policy tenant_read on ${t} for select using (empresa_id = public.current_empresa_id());`
    )
  );
  assert.ok(
    sql.includes(
      `create policy super_admin_read on ${t} for select using (public.current_user_is_super_admin());`
    )
  );
  assert.ok(
    sql.includes(`create policy ead_leitura_com_permissao on ${t} as restrictive for select`)
  );
  // nenhuma policy de escrita: INSERT/UPDATE/DELETE só pelo service role
  assert.equal(
    new RegExp(`create policy \\w+ on ${t} for (insert|update|delete|all)`).test(sql),
    false
  );
  assert.ok(sql.includes(`revoke all on ${t} from anon;`));
  assert.ok(sql.includes(`revoke insert, update, delete, truncate on ${t} from authenticated;`));
  assert.ok(
    sql.includes(
      `create trigger trilha_imutavel before update or delete on ${t} for each row execute function public.trilha_imutavel();`
    )
  );
  assert.ok(
    sql.includes(
      `create trigger trilha_imutavel_truncate before truncate on ${t} for each statement execute function public.trilha_imutavel();`
    )
  );
  assert.equal(
    sql.includes("create or replace function public.trilha_imutavel"),
    false,
    "a função da 0135 não muda"
  );
  assert.ok(
    sql.includes(
      "public.exigir_referencias_da_empresa( 'matricula_id:treinamento_matricula', 'curso_id:treinamento_curso', 'aula_id:treinamento_aula', 'funcionario_id:funcionario' );"
    )
  );
});

// ------------------------------------------------------------------------------------- RPC de importação
const rpc = corpo("importar_atividades_ead");

test("RPC: SECURITY DEFINER, search_path fixo, curso travado, empresa e Editar antes de tudo; grants da 0110", () => {
  const cabecalho = sql.slice(
    sql.indexOf("create or replace function public.importar_atividades_ead("),
    sql.indexOf("$$", sql.indexOf("create or replace function public.importar_atividades_ead("))
  );
  assert.ok(
    cabecalho.includes(
      "(p_curso_id uuid, p_atividades jsonb) returns jsonb language plpgsql security definer set search_path = public as"
    )
  );
  const trava = rpc.indexOf("for update;");
  const empresa = rpc.indexOf(
    "perform public.exigir_empresa_do_chamador(v_curso.empresa_id, 'curso');"
  );
  const permissao = rpc.indexOf(
    "if not public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD', 'editar') then"
  );
  const primeiraEscrita = rpc.search(/\b(insert into|update public\.)/);
  assert.ok(trava > 0 && empresa > trava && permissao > empresa, "trava, empresa, permissão");
  assert.ok(primeiraEscrita > permissao, "nada é gravado antes das conferências");
  assert.match(rpc, /Treinamentos EAD → Editar \(importar atividades\)' using errcode = '42501'/);
  assert.ok(
    sql.includes(
      "revoke all on function public.importar_atividades_ead(uuid, jsonb) from public, anon, authenticated;"
    )
  );
  assert.ok(
    sql.includes(
      "grant execute on function public.importar_atividades_ead(uuid, jsonb) to authenticated, service_role;"
    )
  );
});

test("RPC: confere o lote inteiro antes de gravar (22023 com o código), recusa código repetido na lista", () => {
  const conferencia = rpc.slice(0, rpc.indexOf("for v_grupo in"));
  assert.ok(rpc.includes("jsonb_typeof(p_atividades) <> 'array'"));
  assert.ok(
    rpc.includes(
      "if v_codigo = any (v_vistos) then raise exception 'Código de origem repetido na lista: %'"
    )
  );
  assert.ok(rpc.includes("v_tipo not in ('questionario', 'caso', 'tarefa')"));
  assert.ok(rpc.includes("v_duracao < 1 or v_duracao > 86400"));
  assert.ok(rpc.includes("jsonb_array_length(v_opcoes) not between 2 and 6"));
  assert.ok(rpc.includes("v_correta >= jsonb_array_length(v_opcoes)"));
  // toda recusa de formato é 22023 e cita a atividade (código ou posição)
  const recusas = [
    ...conferencia.matchAll(/raise exception '([^']*)'[^;]*?using errcode = '(\w+)'/g),
  ];
  const deFormato = recusas.filter(([, , codigo]) => codigo === "22023");
  assert.ok(deFormato.length >= 15, `recusas 22023: ${deFormato.length}`);
  for (const [, mensagem] of deFormato) {
    if (/^(A importação precisa|No máximo 300)/.test(mensagem)) continue;
    assert.match(mensagem, /^(Atividade (nº )?%|Código de origem repetido na lista: %)/, mensagem);
  }
  // nenhuma recusa depois do 1º passo: quando começa a gravar, já conferiu tudo
  assert.ok(rpc.lastIndexOf("raise exception") < rpc.indexOf("for v_grupo in"));
});

test("RPC: pula o código já existente no curso e confere a aula de referência só de quem vai entrar", () => {
  const pula = rpc.indexOf("a.codigo_origem = v_codigo and a.deleted_at is null");
  const ancora = rpc.indexOf(
    "where a.id = v_ancora and a.curso_id = v_curso.id and a.deleted_at is null;"
  );
  assert.ok(pula > 0, "pula o existente");
  assert.ok(rpc.includes("v_puladas := v_puladas + 1; continue;"));
  assert.ok(ancora > pula, "a aula de referência é conferida depois do pulo");
  assert.match(
    rpc,
    /a aula de referência \(depois_da_aula_id\) não é deste curso ou foi apagada', v_codigo using errcode = '22023'/
  );
  // o módulo do item com aula de referência é o da aula (o do item é ignorado)
  assert.ok(
    rpc.includes(
      "select a.modulo into v_modulo from public.treinamento_aula a where a.id = v_ancora"
    )
  );
});

test("RPC: agrupa pela aula de referência ou pelo módulo e abre espaço com UM UPDATE de ordem por grupo", () => {
  assert.ok(
    rpc.includes(
      "group by n.ancora, (case when n.ancora is null then n.modulo end) order by min(n.pos)"
    )
  );
  // com aula de referência: logo depois dela; sem: depois da última do módulo, ou no fim do curso
  assert.ok(
    rpc.includes(
      "select a.ordem into v_base from public.treinamento_aula a where a.id = v_grupo.ancora;"
    )
  );
  assert.ok(rpc.includes("a.modulo is not distinct from v_grupo.chave_modulo"));
  assert.ok(rpc.includes("select coalesce(max(a.ordem), 0) into v_base"));
  // um único UPDATE no corpo, dentro do laço dos grupos, antes dos INSERT do grupo
  const updates = [...rpc.matchAll(/\bupdate public\.treinamento_aula\b/g)];
  assert.equal(updates.length, 1);
  assert.ok(
    rpc.includes(
      "update public.treinamento_aula a set ordem = a.ordem + v_grupo.qtd where a.curso_id = v_curso.id and a.deleted_at is null and a.ordem > v_base;"
    )
  );
  assert.ok(rpc.indexOf("for v_grupo in") < updates[0].index!);
  assert.ok(updates[0].index! < rpc.indexOf("insert into public.treinamento_aula"));
});

test("RPC: grava aula, questões (ordem 1..n, aula_id) ou roteiro e devolve { criadas, puladas, questoes }", () => {
  assert.ok(
    rpc.includes(
      "insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, duracao_seg, conteudo_texto, codigo_origem) values (v_curso.empresa_id, v_curso.id, v_base + v_seq, v_grupo.modulo,"
    )
  );
  assert.ok(
    rpc.includes(
      "insert into public.treinamento_questao (empresa_id, curso_id, aula_id, ordem, pergunta, opcoes, correta, comentario)"
    )
  );
  assert.ok(rpc.includes("with ordinality as q(value, ordem)"));
  assert.ok(
    rpc.includes(
      "insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo) values (v_curso.empresa_id, v_curso.id, v_aula_id, v_novo.item -> 'caso');"
    )
  );
  assert.ok(
    rpc.includes(
      "return jsonb_build_object('criadas', v_criadas, 'puladas', v_puladas, 'questoes', v_questoes);"
    )
  );
  // a RPC não apaga nada e não desliga trigger nenhum (o zz_permissao_ead vale lá dentro)
  assert.equal(/\bdelete from\b|disable trigger|session_replication_role/.test(rpc), false);
});

test("conferência final: o zz_permissao_ead continua o último BEFORE (ordem C) e nada muda no dado", () => {
  const depois = sql.slice(sql.indexOf("commit;"));
  assert.ok(depois.includes('max(t.tgname::text collate "C")'));
  assert.ok(depois.includes("as tabelas_com_trigger_depois_do_zz"));
  assert.ok(depois.includes("as triggers_zz_de_9"));
  assert.ok(depois.includes("as rpc_executavel_pela_api"));
  assert.ok(depois.includes("as aulas_com_tipo_novo"));
});

// ------------------------------------------------------------------------------------------------ smoke
const smoke = lerArquivo("tools", "smoke-ead-atividades.sql");

test("smoke da 0170: transação que termina em rollback, sem UUID fixo, como authenticated com token simulado", () => {
  assert.ok(/^begin;$/m.test(smoke));
  assert.ok(smoke.trimEnd().endsWith("rollback;"));
  assert.ok(smoke.includes("SMOKE TEST OK"));
  assert.equal(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(smoke),
    false,
    "UUID fixo no smoke"
  );
  assert.ok(smoke.includes("set local role authenticated"));
  assert.ok(smoke.includes("request.jwt.claims"));
  assert.ok(smoke.includes("@exemplo.test"));
});

test("smoke da 0170: confere cada trava da spec §6", () => {
  for (const trecho of [
    "'questionario'",
    "'caso'",
    "'tarefa'",
    "treinamento_aula_tipo_chk",
    "A questão só entra numa aula do tipo questionário%",
    "A questão do questionário precisa de uma aula viva do mesmo curso%",
    "O roteiro só entra numa aula do tipo caso%",
    "treinamento_caso_conteudo_chk",
    "treinamento_caso_aula_uniq",
    "treinamento_curso_nota_minima_modulo_chk",
    "permission denied%",
    "Acesso negado: o registro de auditoria%",
    "importar_atividades_ead",
    "Sem permissão: Segurança do Trabalho → Treinamentos EAD → Editar%",
    "Código de origem repetido na lista%",
    "depois_da_aula_id",
    "a aula de referência (depois_da_aula_id) não é deste curso ou foi apagada%",
    "'criadas', 0",
    "zz_permissao_ead",
    "23514",
    "22023",
    "42501",
  ]) {
    assert.ok(smoke.includes(trecho), trecho);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test supabase/functions/portal-funcionario/atividades-banco.test.ts`

Expected: FAIL ao carregar o arquivo, com `ENOENT: no such file or directory, open '...supabase/migrations/0170_ausente.sql'`
e `ℹ fail 1`.

- [ ] **Step 3: Criar a migração**

Antes, confira que o número está livre (a spec diz confirmado pelo Javerson; `0154`–`0156` e `0160`–`0164` são de
outras branches): `git ls-tree -r --name-only HEAD supabase/migrations | grep "/0170_"` não pode imprimir nada.

Crie `supabase/migrations/0170_ead_atividades_interativas.sql` (LF; sem `$` fora dos `$$`: o regex do uuid não tem
âncora de fim de propósito, o `char_length = 36` fecha o tamanho):

```sql
-- 0170 — EAD: atividades interativas no Portal de Treinamento (questionário do módulo, caso com decisões e tarefa
-- de estudo)
--
-- Spec aprovada pelo Javerson em 14/10/2026: docs/superpowers/specs/2026-10-14-ead-atividades-interativas-design.md
-- (decisões A1 a A10; esta migração é o §6; número confirmado pelo Javerson, A10).
--
-- Por quê: uma aula do EAD só podia ser vídeo, PDF ou texto (CHECK da 0103) e a única avaliação era a prova final.
-- O material novo do NR-10 Básico traz, em cada módulo, casos com decisões, questões comentadas (mínimo de 80%) e
-- tarefas de estudo, que não tinham onde entrar: sem elas o conteúdo cadastrado não cobre a carga teórica e o
-- requisito LASTRO impede publicar e matricular. Cada atividade passa a ser uma AULA (A6): mesma lista, mesmo
-- cadeado em ordem e a mesma linha de treinamento_progresso, gravada só pelo servidor (0130).
--
-- O que muda:
--
--   1. treinamento_aula.tipo   aceita também 'questionario', 'caso' e 'tarefa' (CHECK treinamento_aula_tipo_chk
--                     recriado).
--   2. treinamento_aula.codigo_origem   o código da atividade no pacote (ex.: M3-C1, M3-Q, M3-T1, PV-<vídeo>), único
--                     no curso entre as aulas vivas: reimportar o pacote não duplica.
--   3. treinamento_questao.aula_id   vazio = questão da PROVA FINAL (todas as de hoje); preenchido = questão do
--                     questionário daquela aula. O trigger referencias_da_empresa (0118) passa a conferir também a
--                     aula (ele já pula coluna NULL: "continue when valor is null"), e o trigger novo
--                     questao_do_questionario exige que a aula seja do mesmo curso e da mesma empresa, viva, e do
--                     tipo questionário.
--   4. treinamento_curso.nota_minima_modulo   nota mínima dos questionários dos módulos (0 a 100, padrão 80, A2). É
--                     coluna só do curso EAD: o trigger do cadastro central (validar_modelo_de_treinamento, 0139)
--                     não a toca.
--   5. treinamento_caso (nova)   o roteiro do caso de uma aula do tipo caso (`conteudo` jsonb, objeto), um por aula
--                     viva. O roteiro diz qual opção é segura e para onde cada uma leva: só lê quem tem a aba
--                     Treinamentos EAD (policy restritiva, como o gabarito na 0147) e só grava quem tem Editar
--                     (zz_permissao_ead, ramo padrão da 0147: a função não muda). Exclusão só lógica.
--   6. treinamento_questionario_tentativa (nova)   cada envio de um questionário (a prova sorteada, as respostas, a
--                     nota, IP e dispositivo), como treinamento_tentativa. Só o servidor grava (authenticated não tem
--                     INSERT/UPDATE/DELETE) e ninguém altera nem apaga (trilha_imutavel, 0135). O único (matrícula,
--                     aula, número) também serve de índice para (matrícula, aula).
--   7. RPC importar_atividades_ead(p_curso_id, p_atividades)   a importação do pacote, tudo ou nada (A7). Exige a
--                     empresa do curso (exigir_empresa_do_chamador, 0110) e Treinamentos EAD → Editar (42501). Para
--                     cada atividade: confere o formato (22023, com o código de origem na mensagem); pula a que já
--                     existe no curso (mesmo codigo_origem, viva); insere a aula, as questões (questionário) ou o
--                     roteiro (caso). Onde entra: com `depois_da_aula_id`, logo depois daquela aula (do mesmo curso
--                     e viva; o módulo é o dela); sem ele, depois da última aula do módulo, e módulo que o curso não
--                     tem vai para o fim. As aulas seguintes sobem com UM UPDATE de `ordem` por grupo (a mesma aula
--                     de referência, ou o mesmo módulo). Código de origem repetido na própria lista é RECUSADO
--                     (22023): a lista vem da prévia (planejarImportacao), que não repete código; repetido é pacote
--                     malformado, e pular em silêncio perderia conteúdo numa importação tudo ou nada. Os triggers
--                     das tabelas (inclusive zz_permissao_ead, que lê o JWT de quem chamou) valem dentro da RPC.
--
-- Os triggers novos (questao_do_questionario, caso_da_aula) têm nome ANTES de "zz_": o zz_permissao_ead continua o
-- último BEFORE de cada tabela do EAD (0147). Eles não são SECURITY DEFINER (rodam com os direitos de quem grava, como
-- pratica_participante_coerente, 0143) e não chamam função nenhuma: nada de EXECUTE a conceder.
--
-- Idempotente: colunas, tabelas e índices "if not exists"; restrições, triggers e policies derrubados antes de
-- recriados; funções com create or replace; revoke/grant repetíveis. Sem UPDATE, INSERT ou DELETE de dado real: os
-- únicos comandos de escrita do arquivo estão no corpo da RPC, que só roda quando o RH importa.
--
-- Depois de aplicar (ordem do §12 da spec, cada passo com OK do Javerson): tools/smoke-ead-atividades.sql (begin ...
-- rollback); publicar portal-funcionario (--no-verify-jwt); push do site logo depois.

begin;
set local lock_timeout = '10s';

-- 1. tipos de aula ------------------------------------------------------------------------------------------------
alter table public.treinamento_aula
  drop constraint if exists treinamento_aula_tipo_chk;
alter table public.treinamento_aula
  add constraint treinamento_aula_tipo_chk
  check (tipo in ('video', 'pdf', 'texto', 'questionario', 'caso', 'tarefa'));

-- 2. código de origem (reimportar não duplica) ----------------------------------------------------------------------
alter table public.treinamento_aula
  add column if not exists codigo_origem text;

create unique index if not exists treinamento_aula_codigo_origem_uniq
  on public.treinamento_aula(curso_id, codigo_origem)
  where deleted_at is null and codigo_origem is not null;

comment on column public.treinamento_aula.codigo_origem is
  'Código da atividade no pacote importado (M3-C1, M3-Q, M3-T1, PV-<vídeo>). Único no curso entre as aulas vivas: reimportar não duplica. Nulo nas aulas cadastradas pela tela.';

-- 3. questões do questionário -------------------------------------------------------------------------------------
alter table public.treinamento_questao
  add column if not exists aula_id uuid references public.treinamento_aula(id) on delete cascade;

create index if not exists trein_questao_aula_idx
  on public.treinamento_questao(aula_id);

comment on column public.treinamento_questao.aula_id is
  'Vazio = questão da prova final. Preenchido = questão do questionário daquela aula (tipo questionario, mesmo curso).';

drop trigger if exists referencias_da_empresa on public.treinamento_questao;
create trigger referencias_da_empresa
  before insert or update of curso_id, empresa_id, aula_id on public.treinamento_questao
  for each row execute function public.exigir_referencias_da_empresa(
    'curso_id:treinamento_curso',
    'aula_id:treinamento_aula'
  );

-- a aula do questionário é do mesmo curso e da mesma empresa, viva e do tipo questionario
create or replace function public.questao_do_questionario()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tipo text;
begin
  if new.aula_id is null then
    return new; -- questão da prova final
  end if;

  select a.tipo
    into v_tipo
    from public.treinamento_aula a
   where a.id = new.aula_id
     and a.curso_id = new.curso_id
     and a.empresa_id = new.empresa_id
     and (a.deleted_at is null or new.deleted_at is not null);
  if not found then
    raise exception 'A questão do questionário precisa de uma aula viva do mesmo curso'
      using errcode = '23514';
  end if;
  if v_tipo is distinct from 'questionario' then
    raise exception 'A questão só entra numa aula do tipo questionário (esta aula é do tipo %)', v_tipo
      using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function public.questao_do_questionario() from public, anon, authenticated;

drop trigger if exists questao_do_questionario on public.treinamento_questao;
create trigger questao_do_questionario
  before insert or update of aula_id, curso_id on public.treinamento_questao
  for each row execute function public.questao_do_questionario();

-- 4. nota mínima dos questionários dos módulos ----------------------------------------------------------------------
alter table public.treinamento_curso
  add column if not exists nota_minima_modulo integer not null default 80;

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_nota_minima_modulo_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_nota_minima_modulo_chk
  check (nota_minima_modulo between 0 and 100);

comment on column public.treinamento_curso.nota_minima_modulo is
  'Nota mínima (0 a 100) dos questionários dos módulos (A2): o questionário conclui com nota >= esta. Só do curso EAD (o cadastro central não a sobrescreve).';

-- 5. roteiro do caso ----------------------------------------------------------------------------------------------
create table if not exists public.treinamento_caso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  curso_id uuid not null references public.treinamento_curso(id) on delete cascade,
  aula_id uuid not null references public.treinamento_aula(id) on delete cascade,
  conteudo jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.treinamento_caso
  drop constraint if exists treinamento_caso_conteudo_chk;
alter table public.treinamento_caso
  add constraint treinamento_caso_conteudo_chk
  check (jsonb_typeof(conteudo) = 'object');

create unique index if not exists treinamento_caso_aula_uniq
  on public.treinamento_caso(aula_id)
  where deleted_at is null;
create index if not exists treinamento_caso_curso_idx
  on public.treinamento_caso(curso_id);

comment on table public.treinamento_caso is
  'Roteiro do caso com decisões de uma aula do tipo caso (spec 2026-10-14 §4.3): { contexto, etapas[{ id, pergunta, opcoes[{ texto, comentario, segura, proxima }] }], reflexao }. Gabarito: só lê quem tem a aba Treinamentos EAD; só grava quem tem Editar.';

select attach_updated_at_trigger('treinamento_caso');

-- apply_tenant_rls cria as policies sem "if not exists": derrubá-las antes deixa a migração reaplicável
drop policy if exists super_admin_all on public.treinamento_caso;
drop policy if exists tenant_isolation on public.treinamento_caso;
select apply_tenant_rls('treinamento_caso');

-- RESTRITIVA, como o gabarito da prova (0147): o roteiro diz a opção segura de cada etapa
drop policy if exists ead_leitura_com_permissao on public.treinamento_caso;
create policy ead_leitura_com_permissao on public.treinamento_caso
  as restrictive for select to authenticated
  using ((select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD')));

revoke all on public.treinamento_caso from anon;
-- exclusão só lógica (deleted_at, pelo SDK)
revoke delete, truncate on public.treinamento_caso from authenticated;

drop trigger if exists referencias_da_empresa on public.treinamento_caso;
create trigger referencias_da_empresa
  before insert or update of curso_id, aula_id, empresa_id on public.treinamento_caso
  for each row execute function public.exigir_referencias_da_empresa(
    'curso_id:treinamento_curso',
    'aula_id:treinamento_aula'
  );

-- a aula do roteiro é do mesmo curso e da mesma empresa, viva e do tipo caso
create or replace function public.caso_da_aula()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tipo text;
begin
  select a.tipo
    into v_tipo
    from public.treinamento_aula a
   where a.id = new.aula_id
     and a.curso_id = new.curso_id
     and a.empresa_id = new.empresa_id
     and (a.deleted_at is null or new.deleted_at is not null);
  if not found then
    raise exception 'O roteiro do caso precisa de uma aula viva do mesmo curso'
      using errcode = '23514';
  end if;
  if v_tipo is distinct from 'caso' then
    raise exception 'O roteiro só entra numa aula do tipo caso (esta aula é do tipo %)', v_tipo
      using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function public.caso_da_aula() from public, anon, authenticated;

drop trigger if exists caso_da_aula on public.treinamento_caso;
create trigger caso_da_aula
  before insert or update of aula_id, curso_id on public.treinamento_caso
  for each row execute function public.caso_da_aula();

-- Editar (ramo padrão da função da 0147, que NÃO é reescrita aqui); o nome zz_ o mantém como o último BEFORE
drop trigger if exists zz_permissao_ead on public.treinamento_caso;
create trigger zz_permissao_ead
  before insert or update on public.treinamento_caso
  for each row execute function public.zz_permissao_ead();

-- 6. tentativas dos questionários ---------------------------------------------------------------------------------
create table if not exists public.treinamento_questionario_tentativa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  matricula_id uuid not null references public.treinamento_matricula(id) on delete cascade,
  curso_id uuid not null,
  aula_id uuid not null references public.treinamento_aula(id) on delete cascade,
  funcionario_id uuid not null references public.funcionario(id) on delete cascade,
  numero integer not null,
  prova jsonb not null,
  respostas jsonb not null,
  acertos integer not null,
  total integer not null,
  nota numeric not null,
  aprovada boolean not null,
  ip text,
  dispositivo text,
  created_at timestamptz not null default now(),
  unique (matricula_id, aula_id, numero)
);

alter table public.treinamento_questionario_tentativa
  drop constraint if exists treinamento_questionario_tentativa_numero_chk;
alter table public.treinamento_questionario_tentativa
  add constraint treinamento_questionario_tentativa_numero_chk
  check (numero >= 1);

comment on table public.treinamento_questionario_tentativa is
  'Cada envio de um questionário do módulo (spec 2026-10-14 §4.2): a prova sorteada, as respostas, a nota, IP e dispositivo. Só o servidor grava (portal-funcionario); imutável (trilha_imutavel, 0135).';

alter table public.treinamento_questionario_tentativa enable row level security;

drop policy if exists tenant_read on public.treinamento_questionario_tentativa;
create policy tenant_read on public.treinamento_questionario_tentativa for select
  using (empresa_id = public.current_empresa_id());
drop policy if exists super_admin_read on public.treinamento_questionario_tentativa;
create policy super_admin_read on public.treinamento_questionario_tentativa for select
  using (public.current_user_is_super_admin());
drop policy if exists ead_leitura_com_permissao on public.treinamento_questionario_tentativa;
create policy ead_leitura_com_permissao on public.treinamento_questionario_tentativa
  as restrictive for select to authenticated
  using ((select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD')));

revoke all on public.treinamento_questionario_tentativa from anon;
revoke insert, update, delete, truncate on public.treinamento_questionario_tentativa from authenticated;

drop trigger if exists referencias_da_empresa on public.treinamento_questionario_tentativa;
create trigger referencias_da_empresa
  before insert or update of matricula_id, curso_id, aula_id, funcionario_id, empresa_id
  on public.treinamento_questionario_tentativa
  for each row execute function public.exigir_referencias_da_empresa(
    'matricula_id:treinamento_matricula',
    'curso_id:treinamento_curso',
    'aula_id:treinamento_aula',
    'funcionario_id:funcionario'
  );

-- nem UPDATE nem DELETE, nem para o servidor (função da 0135, que não muda)
drop trigger if exists trilha_imutavel on public.treinamento_questionario_tentativa;
create trigger trilha_imutavel
  before update or delete on public.treinamento_questionario_tentativa
  for each row execute function public.trilha_imutavel();

drop trigger if exists trilha_imutavel_truncate on public.treinamento_questionario_tentativa;
create trigger trilha_imutavel_truncate
  before truncate on public.treinamento_questionario_tentativa
  for each statement execute function public.trilha_imutavel();

-- 7. importação do pacote (tudo ou nada) ----------------------------------------------------------------------------
create or replace function public.importar_atividades_ead(p_curso_id uuid, p_atividades jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso record;
  v_item jsonb;
  v_pos integer := 0;
  v_codigo text;
  v_tipo text;
  v_titulo text;
  v_modulo text;
  v_ancora uuid;
  v_duracao numeric;
  v_questao jsonb;
  v_opcoes jsonb;
  v_correta numeric;
  v_vistos text[] := '{}';
  v_novos jsonb := '[]'::jsonb;
  v_grupo record;
  v_novo record;
  v_base integer;
  v_seq integer;
  v_aula_id uuid;
  v_criadas integer := 0;
  v_puladas integer := 0;
  v_questoes integer := 0;
begin
  -- o curso, travado: duas importações do mesmo curso não se cruzam
  select c.id, c.empresa_id
    into v_curso
    from public.treinamento_curso c
   where c.id = p_curso_id
     and c.deleted_at is null
     for update;
  if not found then
    raise exception 'Curso não encontrado' using errcode = 'P0002';
  end if;
  perform public.exigir_empresa_do_chamador(v_curso.empresa_id, 'curso');
  if not public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD', 'editar') then
    raise exception 'Sem permissão: Segurança do Trabalho → Treinamentos EAD → Editar (importar atividades)'
      using errcode = '42501';
  end if;

  if p_atividades is null or jsonb_typeof(p_atividades) <> 'array' then
    raise exception 'A importação precisa de uma lista de atividades' using errcode = '22023';
  end if;
  if jsonb_array_length(p_atividades) > 300 then
    raise exception 'No máximo 300 atividades por importação' using errcode = '22023';
  end if;

  -- 1º passo: confere TUDO antes de gravar qualquer coisa
  for v_item in select e.value from jsonb_array_elements(p_atividades) e loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Atividade nº %: formato inválido', v_pos using errcode = '22023';
    end if;

    v_codigo := case when jsonb_typeof(v_item -> 'codigo_origem') = 'string'
                     then btrim(v_item ->> 'codigo_origem') else '' end;
    if v_codigo = '' or char_length(v_codigo) > 60 then
      raise exception 'Atividade nº %: código de origem ausente ou com mais de 60 caracteres', v_pos
        using errcode = '22023';
    end if;
    if v_codigo = any (v_vistos) then
      raise exception 'Código de origem repetido na lista: %', v_codigo using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_codigo;

    v_tipo := case when jsonb_typeof(v_item -> 'tipo') = 'string' then v_item ->> 'tipo' end;
    if v_tipo is null or v_tipo not in ('questionario', 'caso', 'tarefa') then
      raise exception 'Atividade %: tipo inválido (questionario, caso ou tarefa)', v_codigo
        using errcode = '22023';
    end if;

    v_titulo := case when jsonb_typeof(v_item -> 'titulo') = 'string'
                     then btrim(v_item ->> 'titulo') else '' end;
    if v_titulo = '' or char_length(v_titulo) > 300 then
      raise exception 'Atividade %: título ausente ou com mais de 300 caracteres', v_codigo
        using errcode = '22023';
    end if;

    if v_item ? 'modulo' and jsonb_typeof(v_item -> 'modulo') not in ('string', 'null') then
      raise exception 'Atividade %: módulo inválido', v_codigo using errcode = '22023';
    end if;
    v_modulo := case when jsonb_typeof(v_item -> 'modulo') = 'string'
                     then nullif(btrim(v_item ->> 'modulo'), '') end;

    v_ancora := null;
    if v_item ? 'depois_da_aula_id' and jsonb_typeof(v_item -> 'depois_da_aula_id') <> 'null' then
      -- 36 caracteres no formato do uuid (sem âncora de fim no regex: o tamanho já fecha)
      if jsonb_typeof(v_item -> 'depois_da_aula_id') <> 'string'
         or char_length(v_item ->> 'depois_da_aula_id') <> 36
         or (v_item ->> 'depois_da_aula_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then
        raise exception 'Atividade %: depois_da_aula_id inválido', v_codigo using errcode = '22023';
      end if;
      v_ancora := (v_item ->> 'depois_da_aula_id')::uuid;
    end if;

    if jsonb_typeof(v_item -> 'duracao_seg') is distinct from 'number' then
      raise exception 'Atividade %: tempo previsto (duracao_seg) ausente', v_codigo using errcode = '22023';
    end if;
    v_duracao := (v_item ->> 'duracao_seg')::numeric;
    if v_duracao <> trunc(v_duracao) or v_duracao < 1 or v_duracao > 86400 then
      raise exception 'Atividade %: tempo previsto inválido (de 1 a 86400 segundos, inteiro)', v_codigo
        using errcode = '22023';
    end if;

    if v_tipo = 'tarefa' then
      if jsonb_typeof(v_item -> 'conteudo_texto') is distinct from 'string'
         or btrim(v_item ->> 'conteudo_texto') = '' then
        raise exception 'Atividade %: a tarefa precisa do texto com as instruções', v_codigo
          using errcode = '22023';
      end if;
    elsif v_tipo = 'caso' then
      if jsonb_typeof(v_item -> 'caso') is distinct from 'object'
         or jsonb_typeof(v_item #> '{caso,etapas}') is distinct from 'array' then
        raise exception 'Atividade %: o caso precisa do roteiro (contexto, etapas e reflexão)', v_codigo
          using errcode = '22023';
      end if;
      if jsonb_array_length(v_item #> '{caso,etapas}') = 0 then
        raise exception 'Atividade %: o roteiro do caso precisa de pelo menos uma etapa', v_codigo
          using errcode = '22023';
      end if;
    else
      if jsonb_typeof(v_item -> 'questoes') is distinct from 'array' then
        raise exception 'Atividade %: o questionário precisa da lista de questões', v_codigo
          using errcode = '22023';
      end if;
      if jsonb_array_length(v_item -> 'questoes') not between 1 and 50 then
        raise exception 'Atividade %: o questionário precisa de 1 a 50 questões', v_codigo
          using errcode = '22023';
      end if;
      for v_questao in select q.value from jsonb_array_elements(v_item -> 'questoes') q loop
        if jsonb_typeof(v_questao) is distinct from 'object'
           or jsonb_typeof(v_questao -> 'pergunta') is distinct from 'string'
           or jsonb_typeof(v_questao -> 'opcoes') is distinct from 'array'
           or jsonb_typeof(v_questao -> 'correta') is distinct from 'number' then
          raise exception 'Atividade %: questão fora do formato (pergunta, opcoes e correta)', v_codigo
            using errcode = '22023';
        end if;
        v_opcoes := v_questao -> 'opcoes';
        if btrim(v_questao ->> 'pergunta') = ''
           or jsonb_array_length(v_opcoes) not between 2 and 6
           or exists (
             select 1 from jsonb_array_elements(v_opcoes) o
              where jsonb_typeof(o.value) is distinct from 'string' or btrim(o.value #>> '{}') = ''
           ) then
          raise exception 'Atividade %: cada questão precisa da pergunta e de 2 a 6 alternativas preenchidas', v_codigo
            using errcode = '22023';
        end if;
        v_correta := (v_questao ->> 'correta')::numeric;
        if v_correta <> trunc(v_correta) or v_correta < 0 or v_correta >= jsonb_array_length(v_opcoes) then
          raise exception 'Atividade %: a alternativa correta tem de ser uma das alternativas', v_codigo
            using errcode = '22023';
        end if;
        if v_questao ? 'comentario' and jsonb_typeof(v_questao -> 'comentario') not in ('string', 'null') then
          raise exception 'Atividade %: comentário da questão inválido', v_codigo using errcode = '22023';
        end if;
      end loop;
    end if;

    -- já importada (mesmo código no curso, viva): pula, sem conferir a aula de referência
    if exists (
      select 1 from public.treinamento_aula a
       where a.curso_id = v_curso.id
         and a.codigo_origem = v_codigo
         and a.deleted_at is null
    ) then
      v_puladas := v_puladas + 1;
      continue;
    end if;

    -- com aula de referência: do mesmo curso e viva; o módulo é o dela (o do item é ignorado)
    if v_ancora is not null then
      select a.modulo
        into v_modulo
        from public.treinamento_aula a
       where a.id = v_ancora
         and a.curso_id = v_curso.id
         and a.deleted_at is null;
      if not found then
        raise exception 'Atividade %: a aula de referência (depois_da_aula_id) não é deste curso ou foi apagada', v_codigo
          using errcode = '22023';
      end if;
    end if;

    v_novos := v_novos || jsonb_build_array(jsonb_build_object(
      'pos', v_pos,
      'ancora', v_ancora,
      'modulo', v_modulo,
      'codigo', v_codigo,
      'tipo', v_tipo,
      'titulo', v_titulo,
      'duracao', v_duracao::integer,
      'item', v_item
    ));
  end loop;

  -- 2º passo: grava por grupo (a mesma aula de referência, ou o mesmo módulo), na ordem em que o grupo aparece
  for v_grupo in
    select n.ancora,
           (case when n.ancora is null then n.modulo end) as chave_modulo,
           max(n.modulo) as modulo,
           count(*)::integer as qtd
      from jsonb_to_recordset(v_novos) as n(pos integer, ancora uuid, modulo text)
     group by n.ancora, (case when n.ancora is null then n.modulo end)
     order by min(n.pos)
  loop
    if v_grupo.ancora is not null then
      -- logo depois da aula de referência (a ordem dela já conta o que os grupos anteriores abriram)
      select a.ordem into v_base from public.treinamento_aula a where a.id = v_grupo.ancora;
    else
      -- depois da última aula do módulo; módulo que o curso não tem vai para o fim do curso
      select max(a.ordem)
        into v_base
        from public.treinamento_aula a
       where a.curso_id = v_curso.id
         and a.deleted_at is null
         and a.modulo is not distinct from v_grupo.chave_modulo;
      if v_base is null then
        select coalesce(max(a.ordem), 0)
          into v_base
          from public.treinamento_aula a
         where a.curso_id = v_curso.id
           and a.deleted_at is null;
      end if;
    end if;

    -- abre espaço: as aulas depois do ponto de entrada sobem de uma vez (UM UPDATE por grupo)
    update public.treinamento_aula a
       set ordem = a.ordem + v_grupo.qtd
     where a.curso_id = v_curso.id
       and a.deleted_at is null
       and a.ordem > v_base;

    v_seq := 0;
    for v_novo in
      select n.codigo, n.tipo, n.titulo, n.duracao, n.item
        from jsonb_to_recordset(v_novos)
             as n(pos integer, ancora uuid, modulo text, codigo text, tipo text, titulo text, duracao integer,
                  item jsonb)
       where n.ancora is not distinct from v_grupo.ancora
         and (v_grupo.ancora is not null or n.modulo is not distinct from v_grupo.chave_modulo)
       order by n.pos
    loop
      v_seq := v_seq + 1;
      insert into public.treinamento_aula
        (empresa_id, curso_id, ordem, modulo, titulo, tipo, duracao_seg, conteudo_texto, codigo_origem)
      values
        (v_curso.empresa_id, v_curso.id, v_base + v_seq, v_grupo.modulo, v_novo.titulo, v_novo.tipo,
         v_novo.duracao,
         case when v_novo.tipo = 'tarefa' then btrim(v_novo.item ->> 'conteudo_texto') end,
         v_novo.codigo)
      returning id into v_aula_id;
      v_criadas := v_criadas + 1;

      if v_novo.tipo = 'questionario' then
        insert into public.treinamento_questao
          (empresa_id, curso_id, aula_id, ordem, pergunta, opcoes, correta, comentario)
        select v_curso.empresa_id,
               v_curso.id,
               v_aula_id,
               q.ordem::integer,
               btrim(q.value ->> 'pergunta'),
               (select jsonb_agg(to_jsonb(btrim(o.value #>> '{}')) order by o.ordem)
                  from jsonb_array_elements(q.value -> 'opcoes') with ordinality as o(value, ordem)),
               (q.value ->> 'correta')::numeric::integer,
               nullif(btrim(coalesce(q.value ->> 'comentario', '')), '')
          from jsonb_array_elements(v_novo.item -> 'questoes') with ordinality as q(value, ordem);
        v_questoes := v_questoes + jsonb_array_length(v_novo.item -> 'questoes');
      elsif v_novo.tipo = 'caso' then
        insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo)
        values (v_curso.empresa_id, v_curso.id, v_aula_id, v_novo.item -> 'caso');
      end if;
    end loop;
  end loop;

  return jsonb_build_object('criadas', v_criadas, 'puladas', v_puladas, 'questoes', v_questoes);
end;
$$;
revoke all on function public.importar_atividades_ead(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.importar_atividades_ead(uuid, jsonb) to authenticated, service_role;

comment on function public.importar_atividades_ead(uuid, jsonb) is
  'Importa as atividades do pacote no curso (spec 2026-10-14 §5.1/§6), tudo ou nada: empresa do curso + Treinamentos EAD → Editar; pula codigo_origem já existente; depois_da_aula_id (opcional) põe o item logo depois daquela aula; sem ele, depois da última aula do módulo (módulo novo no fim). Devolve { criadas, puladas, questoes }.';

commit;

-- Conferência (só leitura). Na primeira aplicação: colunas_de_3 = 3, tabelas_com_rls_de_2 = 2, triggers_zz_de_9 = 9
-- (8 da 0147 + treinamento_caso), tabelas_com_trigger_depois_do_zz = 0 (o zz_permissao_ead é o último BEFORE em todas
-- as tabelas do EAD), rpc_executavel_pela_api = true, rpc_fechada_ao_anon = true, aulas_com_tipo_novo = 0,
-- roteiros = 0, tentativas = 0, questoes_de_questionario = 0 e cursos_fora_de_80 = 0 (nenhum dado muda).
select (select count(*) from information_schema.columns
         where table_schema = 'public'
           and ((table_name = 'treinamento_aula' and column_name = 'codigo_origem')
             or (table_name = 'treinamento_questao' and column_name = 'aula_id')
             or (table_name = 'treinamento_curso' and column_name = 'nota_minima_modulo'))) as colunas_de_3,
       (select count(*) from pg_class
         where relnamespace = 'public'::regnamespace
           and relname in ('treinamento_caso', 'treinamento_questionario_tentativa')
           and relrowsecurity) as tabelas_com_rls_de_2,
       (select count(*) from pg_trigger where not tgisinternal and tgname = 'zz_permissao_ead') as triggers_zz_de_9,
       (select count(*) from (
          select t.tgrelid, max(t.tgname::text collate "C") as ultimo
            from pg_trigger t
           where not t.tgisinternal
             and (t.tgtype & 3) = 3 -- BEFORE e FOR EACH ROW
             and t.tgrelid in (select z.tgrelid from pg_trigger z where z.tgname = 'zz_permissao_ead')
           group by t.tgrelid
        ) u where u.ultimo <> 'zz_permissao_ead') as tabelas_com_trigger_depois_do_zz,
       has_function_privilege('authenticated', 'public.importar_atividades_ead(uuid, jsonb)', 'execute')
         as rpc_executavel_pela_api,
       not has_function_privilege('anon', 'public.importar_atividades_ead(uuid, jsonb)', 'execute')
         as rpc_fechada_ao_anon,
       (select count(*) from public.treinamento_aula
         where tipo in ('questionario', 'caso', 'tarefa')) as aulas_com_tipo_novo,
       (select count(*) from public.treinamento_caso) as roteiros,
       (select count(*) from public.treinamento_questionario_tentativa) as tentativas,
       (select count(*) from public.treinamento_questao where aula_id is not null) as questoes_de_questionario,
       (select count(*) from public.treinamento_curso where nota_minima_modulo <> 80) as cursos_fora_de_80;

select 'ok' as res;
```

- [ ] **Step 4: Rodar e ver falhar só pelo smoke**

Run: `node --test supabase/functions/portal-funcionario/atividades-banco.test.ts`

Expected: FAIL ao carregar, agora com `ENOENT: no such file or directory, open '...tools/smoke-ead-atividades.sql'`.

- [ ] **Step 5: Criar o smoke**

Crie `tools/smoke-ead-atividades.sql` (o agente NÃO roda: é do Javerson, AGENTS.md regra 1):

```sql
-- ============================================================================
-- smoke-ead-atividades.sql — valida a 0170 (atividades interativas do EAD:
-- questionário do módulo, caso com decisões e tarefa de estudo; spec
-- docs/superpowers/specs/2026-10-14-ead-atividades-interativas-design.md §6).
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria vínculos de
-- usuário sintéticos (e-mails @exemplo.test), dois cursos, aulas, questões,
-- um roteiro de caso, uma matrícula e uma tentativa descartáveis, para um
-- funcionário que já existe, e simula com `set local role authenticated` +
-- `request.jwt.claims` cada usuário da empresa. Nada é persistido. Rode o
-- arquivo inteiro, de uma vez.
--
-- A empresa de teste é escolhida em tempo de execução (a do funcionário ativo
-- mais antigo): nenhum UUID fixo neste arquivo. Para testar outra empresa,
-- troque o filtro do passo 1 por `and f.empresa_id = '<empresa_teste>'`.
--
-- Usuários de teste (vínculos sintéticos na empresa de teste):
--   editar  Treinamentos EAD → editar
--   ver     Treinamentos EAD → visualizar
--   nada    só Segurança do Trabalho → Funcionários (sem a aba do EAD)
--
-- O que confere:
--   1. colunas novas, tabelas novas e o zz_permissao_ead como ÚLTIMO trigger
--      BEFORE em todas as tabelas do EAD;
--   2. os tipos novos de aula (questionario, caso, tarefa) entram; tipo
--      desconhecido não (23514); curso novo nasce com nota mínima do módulo 80;
--   3. questão do questionário: aula de OUTRO curso ou que não é questionário
--      é recusada (23514); a questão da prova final (sem aula) continua;
--   4. roteiro do caso: aula que não é caso (23514), conteúdo que não é objeto
--      (23514), segundo roteiro vivo da mesma aula (23505) e DELETE de verdade
--      (permission denied) recusados;
--   5. nota mínima do módulo fora de 0 a 100 recusada (23514);
--   6. leitura: quem não tem a aba não lê o roteiro nem a tentativa; quem só
--      vê não grava o roteiro (42501);
--   7. tentativa do questionário: authenticated não grava (permission denied);
--      UPDATE e DELETE recusados até para o servidor (trilha_imutavel);
--   8. RPC importar_atividades_ead: quem não tem Editar recebe 42501; "editar"
--      importa um caso e um questionário no fim do módulo, um questionário
--      logo DEPOIS de uma aula (depois_da_aula_id, no meio do curso, herdando
--      o módulo dela) e uma tarefa de módulo novo no fim; as ordens ficam
--      contínuas; rodada de novo, pula tudo; código repetido na lista, aula de
--      referência de outro curso, tipo e questão malformados e lista que não é
--      lista recusados (22023) sem gravar nada; curso de outra empresa (42501).
--
-- Cada recusa confere a MENSAGEM esperada (smoke_0170_recusa): 42501 sozinho
-- aceitaria a recusa pelo motivo errado (grant ou RLS).
--
-- Como rodar (precisa da migração 0170 já aplicada; termina em ROLLBACK):
--   supabase db query --linked -f tools/smoke-ead-atividades.sql
--   -- ou: psql "$DATABASE_URL" -f tools/smoke-ead-atividades.sql
-- Deve terminar imprimindo "SMOKE TEST OK" (e a linha da tabela de resultado).
-- ============================================================================

begin;

-- tenta o comando e exige que ele seja RECUSADO com o estado e a mensagem esperados (LIKE). Roda com os direitos de
-- quem chama (SECURITY INVOKER). Some no ROLLBACK. Sem p_msg, a recusa por grant ou RLS é falha do smoke.
create or replace function public.smoke_0170_recusa(
  p_sql text, p_estado text default '42501', p_msg text default null)
returns text
language plpgsql
as $f$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_estado then
      raise exception 'FALHOU: esperava % e veio % (%) em: %', p_estado, sqlstate, sqlerrm, p_sql;
    end if;
    if p_msg is not null and sqlerrm not like p_msg then
      raise exception 'FALHOU: recusado, mas pelo motivo errado. Esperava "%" e veio "%" em: %', p_msg, sqlerrm, p_sql;
    end if;
    if p_msg is null and (sqlerrm like 'permission denied%' or sqlerrm like 'new row violates row-level security%') then
      raise exception 'FALHOU: recusado por grant ou RLS ("%"), não pela regra, em: %', sqlerrm, p_sql;
    end if;
    return sqlerrm;
  end;
  raise exception 'FALHOU: o comando não foi recusado: %', p_sql;
end;
$f$;

-- o token simulado de cada usuário de teste (e-mail sintético, empresa de teste)
create or replace function public.smoke_0170_claims(p_quem text, p_empresa uuid)
returns text
language sql
as $f$
  select jsonb_build_object(
    'role', 'authenticated',
    'sub', md5('smoke-0170-' || p_quem)::uuid,
    'email', 'smoke.0170.' || p_quem || '@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', p_empresa)
  )::text;
$f$;

do $$
declare
  v_empresa uuid;
  v_func uuid;
  v_outra_empresa_curso uuid;
  v_curso uuid;      -- curso A: aulas de teste e a importação
  v_curso_b uuid;    -- curso B: as recusas de "outro curso"
  v_a1 uuid;
  v_quest uuid;
  v_caso uuid;
  v_tarefa uuid;
  v_quest_b uuid;
  v_texto_b uuid;
  v_questao uuid;
  v_roteiro uuid;
  v_mat uuid;
  v_tent uuid;
  v_n bigint;
  v_texto text;
  v_res jsonb;
  v_payload jsonb;
  v_roteiro_json jsonb := '{"contexto":"SMOKE contexto","etapas":[{"id":"e1","pergunta":"SMOKE decisão?","opcoes":[{"texto":"SMOKE segura","comentario":"SMOKE certo","segura":true,"proxima":null},{"texto":"SMOKE insegura","comentario":"SMOKE errado","segura":false,"proxima":"e1"}]}],"reflexao":"SMOKE reflexão"}';
  v_duas_questoes jsonb := '[{"pergunta":"SMOKE q1?","opcoes":["a","b","c"],"correta":2,"comentario":"SMOKE comentário"},{"pergunta":"SMOKE q2?","opcoes":["a","b"],"correta":0}]';
begin
  if to_regprocedure('public.importar_atividades_ead(uuid,jsonb)') is null then
    raise exception 'Falta a migração 0170 (public.importar_atividades_ead): aplique antes de rodar este smoke.';
  end if;

  -- 1. empresa e funcionário de teste (ativos, só leitura aqui) ------------------------------------------------
  select f.empresa_id, f.id into v_empresa, v_func
    from public.funcionario f
    where f.deleted_at is null
      and f.ativo is not false
    order by f.created_at
    limit 1;
  if v_empresa is null then
    raise exception 'Nenhum funcionário ativo para testar.';
  end if;
  raise notice '== empresa de teste: %', v_empresa;

  -- um curso de outra empresa (se houver), lido como servidor
  select c.id into v_outra_empresa_curso
    from public.treinamento_curso c
   where c.empresa_id <> v_empresa and c.deleted_at is null
   limit 1;

  -- colunas e tabelas da 0170; zz_permissao_ead como o último BEFORE (ordem C, a do Postgres)
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'treinamento_aula' and column_name = 'codigo_origem')
       or (table_name = 'treinamento_questao' and column_name = 'aula_id')
       or (table_name = 'treinamento_curso' and column_name = 'nota_minima_modulo'));
  if v_n <> 3 then
    raise exception 'FALHOU: esperava 3 colunas novas e achei %', v_n;
  end if;
  if to_regclass('public.treinamento_caso') is null
     or to_regclass('public.treinamento_questionario_tentativa') is null then
    raise exception 'FALHOU: faltam as tabelas treinamento_caso e treinamento_questionario_tentativa';
  end if;
  select count(*) into v_n
    from (
      select t.tgrelid, max(t.tgname::text collate "C") as ultimo
        from pg_trigger t
       where not t.tgisinternal
         and (t.tgtype & 3) = 3
         and t.tgrelid in (select z.tgrelid from pg_trigger z where z.tgname = 'zz_permissao_ead')
       group by t.tgrelid
    ) u
   where u.ultimo <> 'zz_permissao_ead';
  if v_n <> 0 then
    raise exception 'FALHOU: % tabela(s) do EAD com trigger BEFORE depois do zz_permissao_ead', v_n;
  end if;
  select count(*) into v_n
    from pg_trigger where tgname = 'zz_permissao_ead' and tgrelid = 'public.treinamento_caso'::regclass;
  if v_n <> 1 then
    raise exception 'FALHOU: treinamento_caso sem o zz_permissao_ead';
  end if;
  raise notice '[estrutura] OK colunas, tabelas e zz_permissao_ead por último';

  -- usuários de teste (como servidor: sem token)
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    select v_empresa, 'smoke.0170.' || u.quem || '@exemplo.test', 'Gestor', true, u.permissoes, 'Smoke 0170'
      from (values
        ('editar', '{"Segurança do Trabalho":{"Treinamentos EAD":{"editar":true}}}'::jsonb),
        ('ver', '{"Segurança do Trabalho":{"Treinamentos EAD":{"visualizar":true}}}'::jsonb),
        ('nada', '{"Segurança do Trabalho":{"Funcionários":{"visualizar":true,"editar":true}}}'::jsonb)
      ) as u(quem, permissoes);

  -- 2. como "editar": cursos, aulas e os tipos novos ---------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_0170_claims('editar', v_empresa), true);
  set local role authenticated;

  insert into public.treinamento_curso (empresa_id, nome, ativo)
    values (v_empresa, 'SMOKE 0170 curso A', false) returning id into v_curso;
  insert into public.treinamento_curso (empresa_id, nome, ativo)
    values (v_empresa, 'SMOKE 0170 curso B', false) returning id into v_curso_b;
  select nota_minima_modulo into v_n from public.treinamento_curso where id = v_curso;
  if v_n <> 80 then
    raise exception 'FALHOU: o curso novo devia nascer com nota mínima do módulo 80 (veio %)', v_n;
  end if;

  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, conteudo_texto, duracao_seg)
    values (v_empresa, v_curso, 1, 'SMOKE M1', 'SMOKE A1', 'texto', 'SMOKE texto A1', 60) returning id into v_a1;
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, conteudo_texto, duracao_seg)
    values (v_empresa, v_curso, 2, 'SMOKE M1', 'SMOKE A2', 'texto', 'SMOKE texto A2', 60);
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, conteudo_texto, duracao_seg)
    values (v_empresa, v_curso, 3, 'SMOKE M2', 'SMOKE A3', 'texto', 'SMOKE texto A3', 60);
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, duracao_seg)
    values (v_empresa, v_curso, 4, 'SMOKE M2', 'SMOKE Q', 'questionario', 900) returning id into v_quest;
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, duracao_seg)
    values (v_empresa, v_curso, 5, 'SMOKE M2', 'SMOKE C', 'caso', 600) returning id into v_caso;
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, conteudo_texto, duracao_seg)
    values (v_empresa, v_curso, 6, 'SMOKE M2', 'SMOKE T', 'tarefa', 'SMOKE instruções', 1200) returning id into v_tarefa;
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, duracao_seg)
    values (v_empresa, v_curso_b, 1, 'SMOKE M1', 'SMOKE B1', 'questionario', 900) returning id into v_quest_b;
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, conteudo_texto, duracao_seg)
    values (v_empresa, v_curso_b, 2, 'SMOKE M1', 'SMOKE B2', 'texto', 'SMOKE texto B2', 60) returning id into v_texto_b;
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_aula (empresa_id, curso_id, titulo, tipo) values (%L, %L, %L, %L)',
    v_empresa, v_curso, 'SMOKE X', 'inventado'), '23514', '%treinamento_aula_tipo_chk%');
  raise notice '[tipos] OK questionario, caso e tarefa entram; tipo desconhecido não; nota do módulo nasce 80';

  -- 3. questão do questionário -----------------------------------------------------------------------------------
  insert into public.treinamento_questao (empresa_id, curso_id, aula_id, pergunta, opcoes, correta)
    values (v_empresa, v_curso, v_quest, 'SMOKE pergunta do questionário?', '["a","b"]'::jsonb, 0)
    returning id into v_questao;
  -- a questão da prova final (sem aula) continua gravável
  insert into public.treinamento_questao (empresa_id, curso_id, pergunta, opcoes, correta)
    values (v_empresa, v_curso, 'SMOKE pergunta da prova?', '["a","b"]'::jsonb, 1);
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_questao (empresa_id, curso_id, aula_id, pergunta, opcoes, correta) values (%L, %L, %L, %L, %L::jsonb, 0)',
    v_empresa, v_curso, v_quest_b, 'SMOKE outro curso?', '["a","b"]'),
    '23514', 'A questão do questionário precisa de uma aula viva do mesmo curso%');
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_questao (empresa_id, curso_id, aula_id, pergunta, opcoes, correta) values (%L, %L, %L, %L, %L::jsonb, 0)',
    v_empresa, v_curso, v_a1, 'SMOKE aula de texto?', '["a","b"]'),
    '23514', 'A questão só entra numa aula do tipo questionário%');
  perform public.smoke_0170_recusa(format(
    'update public.treinamento_questao set aula_id = %L where id = %L', v_tarefa, v_questao),
    '23514', 'A questão só entra numa aula do tipo questionário%');
  raise notice '[questão] OK aula de outro curso e aula que não é questionário recusadas; prova final continua';

  -- 4. roteiro do caso ---------------------------------------------------------------------------------------------
  insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo)
    values (v_empresa, v_curso, v_caso, v_roteiro_json) returning id into v_roteiro;
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo) values (%L, %L, %L, %L::jsonb)',
    v_empresa, v_curso, v_tarefa, v_roteiro_json), '23514', 'O roteiro só entra numa aula do tipo caso%');
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo) values (%L, %L, %L, %L::jsonb)',
    v_empresa, v_curso, v_caso, '[]'), '23514', '%treinamento_caso_conteudo_chk%');
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo) values (%L, %L, %L, %L::jsonb)',
    v_empresa, v_curso, v_caso, v_roteiro_json), '23505', '%treinamento_caso_aula_uniq%');
  perform public.smoke_0170_recusa(format(
    'delete from public.treinamento_caso where id = %L', v_roteiro), '42501', 'permission denied%');
  raise notice '[caso] OK aula que não é caso, conteúdo que não é objeto, segundo roteiro e DELETE recusados';

  -- 5. nota mínima do módulo -----------------------------------------------------------------------------------
  update public.treinamento_curso set nota_minima_modulo = 70 where id = v_curso;
  perform public.smoke_0170_recusa(format(
    'update public.treinamento_curso set nota_minima_modulo = 101 where id = %L', v_curso),
    '23514', '%treinamento_curso_nota_minima_modulo_chk%');
  raise notice '[nota do módulo] OK 70 grava; 101 recusado';

  -- 6. leitura e escrita do roteiro por quem não tem Editar ---------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', public.smoke_0170_claims('nada', v_empresa), true);
  set local role authenticated;
  select count(*) into v_n from public.treinamento_caso where id = v_roteiro;
  if v_n <> 0 then
    raise exception 'FALHOU: quem não tem a aba Treinamentos EAD leu o roteiro do caso';
  end if;
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo) values (%L, %L, %L, %L::jsonb)',
    v_empresa, v_curso, v_caso, v_roteiro_json),
    '42501', 'Sem permissão: Segurança do Trabalho → Treinamentos EAD → Editar%');

  reset role;
  perform set_config('request.jwt.claims', public.smoke_0170_claims('ver', v_empresa), true);
  set local role authenticated;
  select count(*) into v_n from public.treinamento_caso where id = v_roteiro;
  if v_n <> 1 then
    raise exception 'FALHOU: quem tem a aba (visualizar) devia ler o roteiro';
  end if;
  perform public.smoke_0170_recusa(format(
    'update public.treinamento_caso set conteudo = conteudo || %L::jsonb where id = %L',
    '{"reflexao":"SMOKE mudou"}', v_roteiro),
    '42501', 'Sem permissão: Segurança do Trabalho → Treinamentos EAD → Editar%');
  raise notice '[leitura do roteiro] OK sem a aba não lê; visualizar lê e não grava';

  -- 7. tentativas do questionário ----------------------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id)
    values (v_empresa, v_curso, v_func) returning id into v_mat;
  insert into public.treinamento_questionario_tentativa
    (empresa_id, matricula_id, curso_id, aula_id, funcionario_id, numero, prova, respostas, acertos, total, nota, aprovada)
    values (v_empresa, v_mat, v_curso, v_quest, v_func, 1, '[]'::jsonb, '[]'::jsonb, 0, 1, 0, false)
    returning id into v_tent;
  perform public.smoke_0170_recusa(format(
    'update public.treinamento_questionario_tentativa set nota = 100 where id = %L', v_tent),
    '42501', 'Acesso negado: o registro de auditoria%');
  perform public.smoke_0170_recusa(format(
    'delete from public.treinamento_questionario_tentativa where id = %L', v_tent),
    '42501', 'Acesso negado: o registro de auditoria%');

  perform set_config('request.jwt.claims', public.smoke_0170_claims('editar', v_empresa), true);
  set local role authenticated;
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_questionario_tentativa (empresa_id, matricula_id, curso_id, aula_id, funcionario_id, numero, prova, respostas, acertos, total, nota, aprovada) values (%L, %L, %L, %L, %L, 2, %L::jsonb, %L::jsonb, 1, 1, 100, true)',
    v_empresa, v_mat, v_curso, v_quest, v_func, '[]', '[]'), '42501', 'permission denied%');
  select count(*) into v_n from public.treinamento_questionario_tentativa where id = v_tent;
  if v_n <> 1 then
    raise exception 'FALHOU: quem tem a aba devia ler a tentativa do questionário';
  end if;

  reset role;
  perform set_config('request.jwt.claims', public.smoke_0170_claims('nada', v_empresa), true);
  set local role authenticated;
  select count(*) into v_n from public.treinamento_questionario_tentativa where id = v_tent;
  if v_n <> 0 then
    raise exception 'FALHOU: quem não tem a aba leu a tentativa do questionário';
  end if;
  raise notice '[tentativas] OK só o servidor grava; UPDATE e DELETE recusados; leitura só com a aba';

  -- 8. RPC importar_atividades_ead ----------------------------------------------------------------------------------
  v_payload := jsonb_build_array(
    jsonb_build_object('codigo_origem', 'SMK-M1-C1', 'tipo', 'caso', 'modulo', 'SMOKE M1',
      'titulo', 'SMOKE caso importado', 'duracao_seg', 600, 'caso', v_roteiro_json),
    jsonb_build_object('codigo_origem', 'SMK-M1-Q', 'tipo', 'questionario', 'modulo', 'SMOKE M1',
      'titulo', 'SMOKE questionário importado', 'duracao_seg', 900, 'questoes', v_duas_questoes),
    -- pós-vídeo: logo depois da aula A1, no meio do curso; o módulo do item é ignorado (fica o da A1)
    jsonb_build_object('codigo_origem', 'SMK-PV-A1', 'tipo', 'questionario', 'modulo', 'SMOKE ignorado',
      'depois_da_aula_id', v_a1, 'titulo', 'SMOKE pós-aula A1', 'duracao_seg', 300, 'questoes', v_duas_questoes),
    jsonb_build_object('codigo_origem', 'SMK-M9-T1', 'tipo', 'tarefa', 'modulo', 'SMOKE M9 novo',
      'titulo', 'SMOKE tarefa importada', 'duracao_seg', 1200,
      'conteudo_texto', E'SMOKE instruções\n\nO que produzir: SMOKE evidência')
  );

  reset role;
  perform set_config('request.jwt.claims', public.smoke_0170_claims('ver', v_empresa), true);
  set local role authenticated;
  perform public.smoke_0170_recusa(format(
    'select public.importar_atividades_ead(%L::uuid, %L::jsonb)', v_curso, v_payload),
    '42501', 'Sem permissão: Segurança do Trabalho → Treinamentos EAD → Editar%');

  reset role;
  perform set_config('request.jwt.claims', public.smoke_0170_claims('editar', v_empresa), true);
  set local role authenticated;
  v_res := public.importar_atividades_ead(v_curso, v_payload);
  if v_res is distinct from jsonb_build_object('criadas', 4, 'puladas', 0, 'questoes', 4) then
    raise exception 'FALHOU: a importação devolveu %', v_res;
  end if;
  -- ordem: o pós-aula logo depois da A1; caso e questionário no fim do M1; a tarefa do módulo novo no fim
  select string_agg(a.titulo, ' | ' order by a.ordem) into v_texto
    from public.treinamento_aula a where a.curso_id = v_curso and a.deleted_at is null;
  if v_texto is distinct from
     'SMOKE A1 | SMOKE pós-aula A1 | SMOKE A2 | SMOKE caso importado | SMOKE questionário importado | SMOKE A3 | SMOKE Q | SMOKE C | SMOKE T | SMOKE tarefa importada' then
    raise exception 'FALHOU: ordem das aulas depois da importação: %', v_texto;
  end if;
  select string_agg(a.ordem::text, ',' order by a.ordem) into v_texto
    from public.treinamento_aula a where a.curso_id = v_curso and a.deleted_at is null;
  if v_texto is distinct from '1,2,3,4,5,6,7,8,9,10' then
    raise exception 'FALHOU: as ordens deviam ficar contínuas (vieram %)', v_texto;
  end if;
  select a.modulo into v_texto from public.treinamento_aula a where a.curso_id = v_curso and a.codigo_origem = 'SMK-PV-A1';
  if v_texto is distinct from 'SMOKE M1' then
    raise exception 'FALHOU: o item com depois_da_aula_id devia herdar o módulo da aula (veio %)', v_texto;
  end if;
  select string_agg(q.ordem::text || ':' || q.correta::text || ':' || coalesce(q.comentario, '-'), ',' order by q.ordem)
    into v_texto
    from public.treinamento_questao q
    join public.treinamento_aula a on a.id = q.aula_id
   where a.curso_id = v_curso and a.codigo_origem = 'SMK-M1-Q';
  if v_texto is distinct from '1:2:SMOKE comentário,2:0:-' then
    raise exception 'FALHOU: questões do questionário importado: %', v_texto;
  end if;
  select count(*) into v_n
    from public.treinamento_caso c join public.treinamento_aula a on a.id = c.aula_id
   where a.curso_id = v_curso and a.codigo_origem = 'SMK-M1-C1' and c.conteudo = v_roteiro_json;
  if v_n <> 1 then
    raise exception 'FALHOU: o roteiro do caso importado não foi gravado';
  end if;
  select a.conteudo_texto into v_texto from public.treinamento_aula a where a.curso_id = v_curso and a.codigo_origem = 'SMK-M9-T1';
  if v_texto is distinct from E'SMOKE instruções\n\nO que produzir: SMOKE evidência' then
    raise exception 'FALHOU: texto da tarefa importada: %', v_texto;
  end if;
  raise notice '[importação] OK 4 aulas, 4 questões, 1 roteiro; pós-aula depois da A1 (módulo dela); ordens contínuas';

  -- de novo: pula tudo, nada muda
  v_res := public.importar_atividades_ead(v_curso, v_payload);
  if v_res is distinct from jsonb_build_object('criadas', 0, 'puladas', 4, 'questoes', 0) then
    raise exception 'FALHOU: a reimportação devia pular tudo e devolveu %', v_res;
  end if;
  select count(*) into v_n from public.treinamento_aula where curso_id = v_curso and deleted_at is null;
  if v_n <> 10 then
    raise exception 'FALHOU: a reimportação mudou o número de aulas (%)', v_n;
  end if;
  raise notice '[reimportação] OK pula as 4, nada duplica';

  -- recusas de formato (22023), sem gravar nada (tudo ou nada)
  perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)', v_curso,
    jsonb_build_array(
      jsonb_build_object('codigo_origem', 'SMK-OK', 'tipo', 'tarefa', 'titulo', 'SMOKE ok', 'duracao_seg', 60,
        'conteudo_texto', 'SMOKE texto'),
      jsonb_build_object('codigo_origem', 'SMK-OK', 'tipo', 'tarefa', 'titulo', 'SMOKE repetido', 'duracao_seg', 60,
        'conteudo_texto', 'SMOKE texto'))),
    '22023', 'Código de origem repetido na lista%');
  perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)', v_curso,
    jsonb_build_array(
      jsonb_build_object('codigo_origem', 'SMK-OK', 'tipo', 'tarefa', 'titulo', 'SMOKE ok', 'duracao_seg', 60,
        'conteudo_texto', 'SMOKE texto'),
      jsonb_build_object('codigo_origem', 'SMK-PV-B2', 'tipo', 'questionario', 'depois_da_aula_id', v_texto_b,
        'titulo', 'SMOKE âncora de outro curso', 'duracao_seg', 300, 'questoes', v_duas_questoes))),
    '22023', 'Atividade SMK-PV-B2: a aula de referência (depois_da_aula_id) não é deste curso ou foi apagada%');
  perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)', v_curso,
    jsonb_build_array(jsonb_build_object('codigo_origem', 'SMK-X', 'tipo', 'video', 'titulo', 'SMOKE x',
      'duracao_seg', 60))),
    '22023', 'Atividade SMK-X: tipo inválido%');
  perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)', v_curso,
    jsonb_build_array(jsonb_build_object('codigo_origem', 'SMK-Y', 'tipo', 'questionario', 'titulo', 'SMOKE y',
      'duracao_seg', 60, 'questoes', '[{"pergunta":"SMOKE?","opcoes":["a","b"],"correta":2}]'::jsonb))),
    '22023', 'Atividade SMK-Y: a alternativa correta%');
  perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)', v_curso,
    '{}'), '22023', 'A importação precisa de uma lista de atividades%');
  select count(*) into v_n from public.treinamento_aula where curso_id = v_curso and codigo_origem = 'SMK-OK';
  if v_n <> 0 then
    raise exception 'FALHOU: a importação recusada gravou parte da lista';
  end if;
  perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)',
    gen_random_uuid(), '[]'), 'P0002', 'Curso não encontrado%');
  if v_outra_empresa_curso is null then
    raise notice '[importação de outra empresa] pulado: não há curso de outra empresa';
  else
    perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)',
      v_outra_empresa_curso, '[]'), '42501', 'Acesso negado: curso de outra empresa%');
  end if;
  raise notice '[importação] OK recusas: código repetido, âncora de outro curso, tipo, questão, lista; nada gravado';

  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '============ SMOKE TEST OK (atividades interativas, 0170) ============';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro (em psql sem ON_ERROR_STOP,
-- a transação abortada recusa este select e a linha não aparece)
select 'SMOKE TEST OK: atividades interativas (0170)' as res;

rollback;
```

- [ ] **Step 6: Rodar o teste de forma e o dos delimitadores**

Run:
`node --test supabase/functions/portal-funcionario/atividades-banco.test.ts supabase/functions/portal-funcionario/migracoes-delimitadores.test.ts`

Expected: PASS, `ℹ tests 197`, `ℹ pass 197`, `ℹ fail 0` (24 do teste novo; o dos delimitadores ganha 2 casos, a
`0170` e o `smoke-ead-atividades.sql`, que casa com o filtro `smoke-ead-`).

- [ ] **Step 7: Checagens**

- `node --test "supabase/functions/**/*.test.ts"` → `ℹ tests 1560`, `ℹ fail 0` (linha de base 1534 + 26).
- `npm test --workspace=apps/web` → 129 arquivos, 2448 testes, 0 falhas (nada do front mudou).
- `npx prettier --check supabase/functions/portal-funcionario/atividades-banco.test.ts` → "All matched files use
  Prettier code style!" (os `.sql` ficam fora: o Prettier do projeto não tem parser de SQL).
- `npm run lint` → sem erros (nenhum arquivo de `apps/web`).
- `git status --short` → só os três arquivos novos (e o que já estava fora do seu escopo).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0170_ead_atividades_interativas.sql supabase/functions/portal-funcionario/atividades-banco.test.ts tools/smoke-ead-atividades.sql
git commit -F - -- supabase/migrations/0170_ead_atividades_interativas.sql supabase/functions/portal-funcionario/atividades-banco.test.ts tools/smoke-ead-atividades.sql <<'EOF'
feat(ead): migração 0170 das atividades interativas (questionário, caso e tarefa)

Cada atividade do material novo do NR-10 vira uma aula (spec 2026-10-14, A6): o banco passa a aceitar os tipos
questionario, caso e tarefa, guarda o código de origem do pacote (reimportar não duplica), as questões do questionário
(treinamento_questao.aula_id; vazio = prova final), a nota mínima dos módulos (padrão 80), o roteiro do caso
(treinamento_caso, leitura só com a aba e escrita com Editar) e as tentativas dos questionários (só o servidor grava,
imutáveis). A RPC importar_atividades_ead grava o pacote tudo ou nada: pula o código existente, põe o item depois da
aula indicada (depois_da_aula_id) ou no fim do módulo, com um UPDATE de ordem por grupo, e recusa código repetido na
lista (22023). Nenhum dado existente muda.

Como testar: node --test supabase/functions/portal-funcionario/atividades-banco.test.ts (forma) e o smoke abaixo.

Produção (só com OK do Javerson, ordem do §12 da spec):
1. npx supabase@2.118.0 db query --linked -f supabase/migrations/0170_ead_atividades_interativas.sql
2. npx supabase@2.118.0 db query --linked -f tools/smoke-ead-atividades.sql (termina em ROLLBACK; tem de imprimir SMOKE TEST OK)
O deploy do portal-funcionario e o push do site vêm depois (Task 20).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

---

### Task 2: Roteiro do caso no front (`ead-caso.js`)

**Files:**

- Create: `apps/web/src/lib/ead-caso.js`
- Create: `apps/web/src/lib/ead-caso.test.js`
- Read (não muda): `supabase/functions/portal-funcionario/regras.ts:759-773` (`sortear` e `embaralhar`, o Fisher–Yates
  da prova, copiado aqui sem import: a lib do front não importa o servidor).

**Interfaces:**

- Consumes: nada (módulo puro, sem import; o `caso.test.ts` do servidor importa este arquivo pelo caminho com extensão).
- Produces (C3, front): `LIMITES_CASO = { etapas: 30, opcoesMin: 2, opcoesMax: 6, texto: 1000, longo: 4000 }`;
  `validarCaso(conteudo) → { codigo, texto, etapa }[]` (códigos `FORMATO`, `SEM_ETAPAS`, `MUITAS_ETAPAS`, `ID_VAZIO`,
  `ID_REPETIDO`, `PERGUNTA_VAZIA`, `OPCOES_QTD`, `TEXTO_VAZIO`, `COMENTARIO_VAZIO`, `PROXIMA_INEXISTENTE`,
  `FIM_INSEGURO`, `SEM_SEGURA`, `INALCANCAVEL`, `SEM_SAIDA`, `SEM_CAMINHO_SEGURO`, `TAMANHO`);
  `estadoDoCaso(conteudo, escolhas) → { valido, motivo, fim, etapaAtual, passagens, ultimo }`;
  `etapaParaAluno(conteudo, etapaId, aleatorio) → { id, pergunta, opcoes: [{ indice, texto }] }`;
  `resultadoDaEscolha(conteudo, estado, etapaId, opcao) → { ok: false, codigo } | { ok: true, comentario, segura,
  proxima, fim, passagem }`; `novoCasoVazio()`; `proximoIdDeEtapa(conteudo) → "e<n>"`.

Regras fixadas aqui (as duas cópias seguem): FORMATO volta sozinho (sem ele o resto lê o roteiro sem cuidado); com
`ID_VAZIO` ou `ID_REPETIDO` o caminho (`INALCANCAVEL`, `SEM_SAIDA`, `SEM_CAMINHO_SEGURO`) não é conferido; o fim é só
a opção SEGURA com `proxima: null`; `passagens` é montado com `Map` + `Object.fromEntries` (um id `"__proto__"` vira
chave própria, sem mexer no protótipo).

- [ ] **Step 1: Escrever o teste (falha: o módulo ainda não existe)**

Crie `apps/web/src/lib/ead-caso.test.js` (textos sintéticos; caso LINEAR, em que a insegura volta à mesma etapa, e
RAMIFICADO com recuperação `r1`/`r2`, no formato dos rascunhos):

```js
import { describe, it, expect } from "vitest";
import {
  LIMITES_CASO,
  estadoDoCaso,
  etapaParaAluno,
  novoCasoVazio,
  proximoIdDeEtapa,
  resultadoDaEscolha,
  validarCaso,
} from "./ead-caso";

// Textos sintéticos (nada do material do NR-10). Linear: a insegura volta à mesma etapa.
const opc = (texto, segura, proxima) => ({
  texto,
  comentario: `Comentário: ${texto}`,
  segura,
  proxima,
});
const CASO_LINEAR = {
  contexto: "Equipe sintética prepara uma tarefa de teste.",
  etapas: [
    {
      id: "e1",
      pergunta: "Primeira decisão?",
      opcoes: [opc("Pular a conferência", false, "e1"), opc("Conferir o plano", true, "e2")],
    },
    {
      id: "e2",
      pergunta: "Segunda decisão?",
      opcoes: [opc("Seguir sem aviso", false, "e2"), opc("Avisar a equipe", true, "e3")],
    },
    {
      id: "e3",
      pergunta: "Última decisão?",
      opcoes: [opc("Encerrar às pressas", false, "e3"), opc("Registrar e encerrar", true, null)],
    },
  ],
  reflexao: "Reflexão sintética.",
};
// Ramificado (formato dos rascunhos): a insegura leva à recuperação, cuja segura volta à decisão.
const CASO_RAMIFICADO = {
  contexto: "Situação sintética com recuperação.",
  etapas: [
    {
      id: "e1",
      pergunta: "Decisão A?",
      opcoes: [
        opc("A segura", true, "e2"),
        opc("A insegura 1", false, "r1"),
        opc("A insegura 2", false, "r1"),
      ],
    },
    {
      id: "r1",
      pergunta: "Recuperação 1?",
      opcoes: [opc("R1 segura", true, "e1"), opc("R1 insegura", false, "r1")],
    },
    {
      id: "e2",
      pergunta: "Decisão B?",
      opcoes: [opc("B segura", true, null), opc("B insegura", false, "r2")],
    },
    {
      id: "r2",
      pergunta: "Recuperação 2?",
      opcoes: [opc("R2 segura", true, "e2"), opc("R2 insegura", false, "r2")],
    },
  ],
  reflexao: "Reflexão sintética do ramificado.",
};
const copia = (v) => JSON.parse(JSON.stringify(v));
const codigos = (conteudo) => validarCaso(conteudo).map((p) => p.codigo);

describe("validarCaso", () => {
  it("aceita o caso linear e o ramificado com recuperação", () => {
    expect(validarCaso(CASO_LINEAR)).toEqual([]);
    expect(validarCaso(CASO_RAMIFICADO)).toEqual([]);
  });

  it("contexto e reflexão podem ficar vazios ou faltar", () => {
    const sem = copia(CASO_LINEAR);
    delete sem.contexto;
    sem.reflexao = "";
    expect(validarCaso(sem)).toEqual([]);
  });

  it("recusa o que não é roteiro (FORMATO) e para por aí", () => {
    for (const ruim of [null, undefined, "texto", 3, [], {}, { etapas: "x" }, { etapas: [1] }]) {
      expect(codigos(ruim), JSON.stringify(ruim)).toEqual(["FORMATO"]);
    }
    const seguraTexto = copia(CASO_LINEAR);
    seguraTexto.etapas[0].opcoes[0].segura = "sim";
    expect(codigos(seguraTexto)).toEqual(["FORMATO"]);
    const proximaNumero = copia(CASO_LINEAR);
    proximaNumero.etapas[1].opcoes[1].proxima = 3;
    expect(codigos(proximaNumero)).toEqual(["FORMATO"]);
    const contextoNumero = copia(CASO_LINEAR);
    contextoNumero.contexto = 5;
    expect(codigos(contextoNumero)).toEqual(["FORMATO"]);
    const opcoesTexto = copia(CASO_LINEAR);
    opcoesTexto.etapas[2].opcoes = "a, b";
    expect(validarCaso(opcoesTexto)).toEqual([
      { codigo: "FORMATO", texto: "As opções da etapa nº 3 precisam ser uma lista", etapa: "e3" },
    ]);
  });

  it("SEM_ETAPAS e MUITAS_ETAPAS", () => {
    expect(codigos({ contexto: "", etapas: [], reflexao: "" })).toEqual(["SEM_ETAPAS"]);
    const longo = {
      etapas: Array.from({ length: LIMITES_CASO.etapas + 1 }, (_, i) => ({
        id: `e${i + 1}`,
        pergunta: `Pergunta ${i + 1}?`,
        opcoes: [
          opc(`Volta ${i + 1}`, false, `e${i + 1}`),
          opc(`Segue ${i + 1}`, true, i === LIMITES_CASO.etapas ? null : `e${i + 2}`),
        ],
      })),
    };
    expect(codigos(longo)).toEqual(["MUITAS_ETAPAS"]);
    longo.etapas.pop();
    longo.etapas[LIMITES_CASO.etapas - 1].opcoes[1].proxima = null;
    expect(validarCaso(longo)).toEqual([]);
  });

  it("ID_VAZIO e ID_REPETIDO (e não confere o caminho com identificadores ruins)", () => {
    const vazio = copia(CASO_LINEAR);
    vazio.etapas[1].id = "  ";
    // as duas opções que levavam a "e2" passam a apontar para uma etapa que não existe; sem INALCANCAVEL/SEM_SAIDA
    expect(codigos(vazio)).toEqual(["ID_VAZIO", "PROXIMA_INEXISTENTE", "PROXIMA_INEXISTENTE"]);
    const repetido = copia(CASO_LINEAR);
    repetido.etapas[2].id = "e2";
    expect(validarCaso(repetido)[0]).toEqual({
      codigo: "ID_REPETIDO",
      texto: 'O identificador "e2" está em mais de uma etapa',
      etapa: "e2",
    });
    expect(codigos(repetido)).toEqual([
      "ID_REPETIDO",
      "PROXIMA_INEXISTENTE",
      "PROXIMA_INEXISTENTE",
    ]);
  });

  it("PERGUNTA_VAZIA, OPCOES_QTD, TEXTO_VAZIO e COMENTARIO_VAZIO", () => {
    const c = copia(CASO_LINEAR);
    c.etapas[0].pergunta = "";
    c.etapas[1].opcoes[0].texto = " ";
    c.etapas[1].opcoes[1].comentario = "";
    expect(validarCaso(c)).toEqual([
      { codigo: "PERGUNTA_VAZIA", texto: 'A etapa "e1" está sem pergunta', etapa: "e1" },
      { codigo: "TEXTO_VAZIO", texto: 'A opção 1 da etapa "e2" está sem texto', etapa: "e2" },
      {
        codigo: "COMENTARIO_VAZIO",
        texto: 'A opção 2 da etapa "e2" está sem comentário',
        etapa: "e2",
      },
    ]);
    const uma = copia(CASO_LINEAR);
    uma.etapas[0].opcoes = [opc("Conferir o plano", true, "e2")];
    expect(codigos(uma)).toEqual(["OPCOES_QTD"]);
    const sete = copia(CASO_LINEAR);
    sete.etapas[0].opcoes = [
      ...Array.from({ length: 6 }, (_, i) => opc(`Volta ${i}`, false, "e1")),
      opc("Conferir o plano", true, "e2"),
    ];
    expect(codigos(sete)).toEqual(["OPCOES_QTD"]);
  });

  it("PROXIMA_INEXISTENTE, FIM_INSEGURO e SEM_SEGURA", () => {
    const leva = copia(CASO_LINEAR);
    leva.etapas[0].opcoes[0].proxima = "e9";
    expect(codigos(leva)).toEqual(["PROXIMA_INEXISTENTE"]);
    const fimInseguro = copia(CASO_LINEAR);
    fimInseguro.etapas[1].opcoes[0].proxima = null;
    expect(codigos(fimInseguro)).toEqual(["FIM_INSEGURO"]);
    const semSegura = copia(CASO_LINEAR);
    semSegura.etapas[2].opcoes[1].segura = false;
    // a etapa e3 perdeu a única saída: sem segura, fim inseguro e ninguém chega ao fim
    expect(codigos(semSegura)).toEqual([
      "FIM_INSEGURO",
      "SEM_SEGURA",
      "SEM_SAIDA",
      "SEM_SAIDA",
      "SEM_SAIDA",
      "SEM_CAMINHO_SEGURO",
    ]);
  });

  it("INALCANCAVEL, SEM_SAIDA e SEM_CAMINHO_SEGURO, cada um sozinho", () => {
    const solta = copia(CASO_RAMIFICADO);
    solta.etapas.push({
      id: "x1",
      pergunta: "Etapa solta?",
      opcoes: [opc("Fim", true, null), opc("Volta", false, "x1")],
    });
    expect(validarCaso(solta)).toEqual([
      {
        codigo: "INALCANCAVEL",
        texto: 'A etapa "x1" nunca é alcançada a partir da primeira etapa',
        etapa: "x1",
      },
    ]);
    const armadilha = copia(CASO_RAMIFICADO);
    armadilha.etapas[1].opcoes[0].proxima = "r1"; // a recuperação r1 não devolve mais à decisão
    expect(validarCaso(armadilha)).toEqual([
      {
        codigo: "SEM_SAIDA",
        texto: 'Da etapa "r1" não há como chegar ao fim do caso',
        etapa: "r1",
      },
    ]);
    const soPelaInsegura = {
      etapas: [
        {
          id: "e1",
          pergunta: "Decisão?",
          opcoes: [opc("Segura", true, "r1"), opc("Atalho", false, "e2")],
        },
        {
          id: "r1",
          pergunta: "Volta?",
          opcoes: [opc("Volta", true, "e1"), opc("Fica", false, "r1")],
        },
        {
          id: "e2",
          pergunta: "Fim?",
          opcoes: [opc("Encerra", true, null), opc("Fica", false, "e2")],
        },
      ],
    };
    expect(validarCaso(soPelaInsegura)).toEqual([
      {
        codigo: "SEM_CAMINHO_SEGURO",
        texto: "Não há caminho só de opções seguras da primeira etapa até o fim do caso",
        etapa: null,
      },
    ]);
  });

  it("TAMANHO: pergunta, opção e comentário até 1.000; contexto e reflexão até 4.000", () => {
    const c = copia(CASO_LINEAR);
    c.contexto = "x".repeat(LIMITES_CASO.longo + 1);
    c.reflexao = "x".repeat(LIMITES_CASO.longo);
    c.etapas[0].pergunta = "p".repeat(LIMITES_CASO.texto + 1);
    c.etapas[1].opcoes[0].texto = "t".repeat(LIMITES_CASO.texto + 1);
    c.etapas[2].opcoes[0].comentario = "c".repeat(LIMITES_CASO.texto + 1);
    expect(validarCaso(c).map((p) => [p.codigo, p.texto])).toEqual([
      ["TAMANHO", "O contexto do caso passa de 4.000 caracteres"],
      ["TAMANHO", 'A pergunta da etapa "e1" passa de 1.000 caracteres'],
      ["TAMANHO", 'A opção 1 da etapa "e2" passa de 1.000 caracteres'],
      ["TAMANHO", 'O comentário da opção 1 da etapa "e3" passa de 1.000 caracteres'],
    ]);
    expect(LIMITES_CASO).toEqual({
      etapas: 30,
      opcoesMin: 2,
      opcoesMax: 6,
      texto: 1000,
      longo: 4000,
    });
  });
});

describe("estadoDoCaso", () => {
  it("sem escolhas: na primeira etapa, visitada uma vez", () => {
    expect(estadoDoCaso(CASO_LINEAR, [])).toEqual({
      valido: true,
      motivo: null,
      fim: false,
      etapaAtual: "e1",
      passagens: { e1: 1 },
      ultimo: null,
    });
    expect(estadoDoCaso(CASO_LINEAR, undefined).etapaAtual).toBe("e1");
  });

  it("linear: a insegura volta à mesma etapa (2ª passagem); a segura avança; a última encerra", () => {
    const umaInsegura = estadoDoCaso(CASO_LINEAR, [{ etapa: "e1", opcao: 0 }]);
    expect(umaInsegura.etapaAtual).toBe("e1");
    expect(umaInsegura.passagens).toEqual({ e1: 2 });
    expect(umaInsegura.ultimo).toEqual({
      comentario: "Comentário: Pular a conferência",
      segura: false,
    });
    const fim = estadoDoCaso(CASO_LINEAR, [
      { etapa: "e1", opcao: 0 },
      { etapa: "e1", opcao: 1 },
      { etapa: "e2", opcao: 1 },
      { etapa: "e3", opcao: 1 },
    ]);
    expect(fim).toEqual({
      valido: true,
      motivo: null,
      fim: true,
      etapaAtual: null,
      passagens: { e1: 2, e2: 1, e3: 1 },
      ultimo: { comentario: "Comentário: Registrar e encerrar", segura: true },
    });
  });

  it("ramificado: insegura leva à recuperação, que devolve à decisão; o fim só pela segura", () => {
    const caminho = [
      { etapa: "e1", opcao: 2 },
      { etapa: "r1", opcao: 1 },
      { etapa: "r1", opcao: 0 },
      { etapa: "e1", opcao: 0 },
      { etapa: "e2", opcao: 1 },
      { etapa: "r2", opcao: 0 },
    ];
    const meio = estadoDoCaso(CASO_RAMIFICADO, caminho);
    expect(meio.etapaAtual).toBe("e2");
    expect(meio.passagens).toEqual({ e1: 2, r1: 2, e2: 2, r2: 1 });
    expect(meio.fim).toBe(false);
    const fim = estadoDoCaso(CASO_RAMIFICADO, [...caminho, { etapa: "e2", opcao: 0 }]);
    expect(fim.fim).toBe(true);
    expect(fim.etapaAtual).toBe(null);
  });

  it("caminho que não confere: CAMINHO_DIVERGENTE (etapa errada, opção que não existe, clique depois do fim)", () => {
    const divergente = {
      valido: false,
      motivo: "CAMINHO_DIVERGENTE",
      fim: false,
      etapaAtual: null,
      passagens: {},
      ultimo: null,
    };
    expect(estadoDoCaso(CASO_LINEAR, [{ etapa: "e2", opcao: 1 }])).toEqual(divergente);
    expect(estadoDoCaso(CASO_LINEAR, [{ etapa: "e1", opcao: 5 }])).toEqual(divergente);
    expect(estadoDoCaso(CASO_LINEAR, [{ etapa: "e1", opcao: "1" }])).toEqual(divergente);
    expect(estadoDoCaso(CASO_LINEAR, [null])).toEqual(divergente);
    const ateOFim = [
      { etapa: "e1", opcao: 1 },
      { etapa: "e2", opcao: 1 },
      { etapa: "e3", opcao: 1 },
    ];
    expect(estadoDoCaso(CASO_LINEAR, [...ateOFim, { etapa: "e3", opcao: 1 }])).toEqual(divergente);
    // o RH tirou a etapa e2 do roteiro: o caminho gravado deixa de conferir
    const alterado = copia(CASO_LINEAR);
    alterado.etapas.splice(1, 1);
    alterado.etapas[0].opcoes[1].proxima = "e3";
    expect(estadoDoCaso(alterado, ateOFim)).toEqual(divergente);
  });

  it("roteiro inválido: CASO_INVALIDO, sem etapa atual", () => {
    expect(estadoDoCaso({ etapas: [] }, [])).toEqual({
      valido: false,
      motivo: "CASO_INVALIDO",
      fim: false,
      etapaAtual: null,
      passagens: {},
      ultimo: null,
    });
  });
});

describe("etapaParaAluno", () => {
  it("só pergunta e opções com texto e índice original; nunca segura, comentário ou próxima", () => {
    const semTroca = (n) => n - 1; // Fisher–Yates trocando cada posição com ela mesma
    const etapa = etapaParaAluno(CASO_RAMIFICADO, "e1", semTroca);
    expect(etapa).toEqual({
      id: "e1",
      pergunta: "Decisão A?",
      opcoes: [
        { indice: 0, texto: "A segura" },
        { indice: 1, texto: "A insegura 1" },
        { indice: 2, texto: "A insegura 2" },
      ],
    });
    const texto = JSON.stringify(etapa);
    for (const segredo of ['segura":', "comentario", "proxima", "Comentário:"]) {
      expect(texto.includes(segredo), segredo).toBe(false);
    }
  });

  it("embaralha com o sorteio recebido (Fisher–Yates) e recusa sorteio fora do intervalo", () => {
    const sempreZero = () => 0;
    expect(etapaParaAluno(CASO_RAMIFICADO, "e1", sempreZero).opcoes.map((o) => o.indice)).toEqual([
      1, 2, 0,
    ]);
    expect(() => etapaParaAluno(CASO_LINEAR, "e1", (n) => n)).toThrow(RangeError);
    expect(() => etapaParaAluno(CASO_LINEAR, "e1", () => 0.5)).toThrow(RangeError);
    expect(() => etapaParaAluno(CASO_LINEAR, "e9", sempreZero)).toThrow(RangeError);
  });
});

describe("resultadoDaEscolha", () => {
  const inicio = estadoDoCaso(CASO_LINEAR, []);

  it("insegura: comentário, volta à etapa e conta a passagem; segura: avança", () => {
    expect(resultadoDaEscolha(CASO_LINEAR, inicio, "e1", 0)).toEqual({
      ok: true,
      comentario: "Comentário: Pular a conferência",
      segura: false,
      proxima: "e1",
      fim: false,
      passagem: 1,
    });
    const segunda = estadoDoCaso(CASO_LINEAR, [{ etapa: "e1", opcao: 0 }]);
    expect(resultadoDaEscolha(CASO_LINEAR, segunda, "e1", 1)).toMatchObject({
      ok: true,
      segura: true,
      proxima: "e2",
      fim: false,
      passagem: 2,
    });
  });

  it("a segura que encerra devolve fim", () => {
    const naUltima = estadoDoCaso(CASO_LINEAR, [
      { etapa: "e1", opcao: 1 },
      { etapa: "e2", opcao: 1 },
    ]);
    expect(resultadoDaEscolha(CASO_LINEAR, naUltima, "e3", 1)).toMatchObject({
      ok: true,
      segura: true,
      proxima: null,
      fim: true,
    });
  });

  it("recusas: fora de ordem, opção inválida, caso encerrado e caso inválido", () => {
    expect(resultadoDaEscolha(CASO_LINEAR, inicio, "e2", 1)).toEqual({
      ok: false,
      codigo: "CASO_FORA_DE_ORDEM",
    });
    for (const opcao of [2, -1, "1", 1.5, null, undefined]) {
      expect(resultadoDaEscolha(CASO_LINEAR, inicio, "e1", opcao), String(opcao)).toEqual({
        ok: false,
        codigo: "OPCAO_INVALIDA",
      });
    }
    const fim = estadoDoCaso(CASO_LINEAR, [
      { etapa: "e1", opcao: 1 },
      { etapa: "e2", opcao: 1 },
      { etapa: "e3", opcao: 1 },
    ]);
    expect(resultadoDaEscolha(CASO_LINEAR, fim, "e3", 1)).toEqual({
      ok: false,
      codigo: "CASO_ENCERRADO",
    });
    expect(resultadoDaEscolha({ etapas: [] }, inicio, "e1", 0)).toEqual({
      ok: false,
      codigo: "CASO_INVALIDO",
    });
    expect(
      resultadoDaEscolha(
        CASO_LINEAR,
        estadoDoCaso(CASO_LINEAR, [{ etapa: "e2", opcao: 0 }]),
        "e1",
        0
      )
    ).toEqual({ ok: false, codigo: "CASO_INVALIDO" });
  });
});

describe("novoCasoVazio e proximoIdDeEtapa", () => {
  it("o caso novo tem a forma certa e só os campos de texto por preencher", () => {
    const novo = novoCasoVazio();
    expect(novo.etapas).toHaveLength(1);
    expect(novo.etapas[0].id).toBe("e1");
    expect(novo.etapas[0].opcoes.map((o) => [o.segura, o.proxima])).toEqual([
      [true, null],
      [false, "e1"],
    ]);
    expect(codigos(novo)).toEqual([
      "PERGUNTA_VAZIA",
      "TEXTO_VAZIO",
      "COMENTARIO_VAZIO",
      "TEXTO_VAZIO",
      "COMENTARIO_VAZIO",
    ]);
    // cada chamada devolve um objeto novo (o editor muda o que recebe)
    expect(novoCasoVazio()).not.toBe(novo);
  });

  it("o próximo id é o menor e<n> livre", () => {
    expect(proximoIdDeEtapa(novoCasoVazio())).toBe("e2");
    expect(proximoIdDeEtapa(CASO_RAMIFICADO)).toBe("e3");
    expect(proximoIdDeEtapa({ etapas: [{ id: "e2" }, { id: "r1" }] })).toBe("e1");
    expect(proximoIdDeEtapa(null)).toBe("e1");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web; npx vitest run src/lib/ead-caso.test.js`

Expected: FAIL, `Error: Cannot find module './ead-caso' imported from '.../src/lib/ead-caso.test.js'` (`Failed to load url
./ead-caso ... Does the file exist?`), `Test Files 1 failed (1)`, `Tests no tests`.

- [ ] **Step 3: Implementar**

Crie `apps/web/src/lib/ead-caso.js`:

```js
// Roteiro do caso com decisões (atividade interativa do EAD, spec 2026-10-14 §4.3): regra PURA, sem import.
// Espelho do servidor (supabase/functions/portal-funcionario/caso.ts): o caso.test.ts do servidor roda a mesma
// tabela de casos contra as duas cópias. Mudou aqui, mude lá (e vice-versa).
//
// conteudo = { contexto, etapas: [{ id, pergunta, opcoes: [{ texto, comentario, segura, proxima }] }], reflexao }
// O caso começa na PRIMEIRA etapa da lista; `proxima` é o id de outra etapa ou null (fim). Só opção segura encerra.

export const LIMITES_CASO = { etapas: 30, opcoesMin: 2, opcoesMax: 6, texto: 1000, longo: 4000 };

const ehObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const preenchido = (v) => typeof v === "string" && v.trim() !== "";
const milhar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Problemas de FORMA (tipos errados): sem eles, o resto da validação pode ler o roteiro sem cuidado. */
function problemasDeFormato(conteudo) {
  const formato = (texto, etapa = null) => ({ codigo: "FORMATO", texto, etapa });
  if (!ehObjeto(conteudo) || !Array.isArray(conteudo.etapas)) {
    return [
      formato("O roteiro do caso não está no formato esperado (contexto, etapas e reflexão)"),
    ];
  }
  const problemas = [];
  for (const campo of ["contexto", "reflexao"]) {
    const v = conteudo[campo];
    if (v !== undefined && v !== null && typeof v !== "string") {
      problemas.push(formato(`O campo "${campo}" do caso precisa ser um texto`));
    }
  }
  conteudo.etapas.forEach((etapa, i) => {
    const nome = ehObjeto(etapa) && typeof etapa.id === "string" ? etapa.id : null;
    if (!ehObjeto(etapa)) {
      problemas.push(formato(`A etapa nº ${i + 1} não está no formato esperado`));
      return;
    }
    if (etapa.id !== undefined && etapa.id !== null && typeof etapa.id !== "string") {
      problemas.push(formato(`O identificador da etapa nº ${i + 1} precisa ser um texto`));
    }
    if (
      etapa.pergunta !== undefined &&
      etapa.pergunta !== null &&
      typeof etapa.pergunta !== "string"
    ) {
      problemas.push(formato(`A pergunta da etapa nº ${i + 1} precisa ser um texto`, nome));
    }
    if (!Array.isArray(etapa.opcoes)) {
      problemas.push(formato(`As opções da etapa nº ${i + 1} precisam ser uma lista`, nome));
      return;
    }
    etapa.opcoes.forEach((opcao, k) => {
      const ok =
        ehObjeto(opcao) &&
        (opcao.texto === undefined || opcao.texto === null || typeof opcao.texto === "string") &&
        (opcao.comentario === undefined ||
          opcao.comentario === null ||
          typeof opcao.comentario === "string") &&
        typeof opcao.segura === "boolean" &&
        (opcao.proxima === null || typeof opcao.proxima === "string");
      if (!ok) {
        problemas.push(
          formato(
            `A opção ${k + 1} da etapa nº ${i + 1} não está no formato esperado (texto, comentário, segura e próxima)`,
            nome
          )
        );
      }
    });
  });
  return problemas;
}

/**
 * Problemas do roteiro; lista vazia = caso válido. A mesma regra vale na tela do RH (o "Salvar" fica desabilitado
 * com qualquer problema) e no servidor (roteiro inválido: 409 CASO_INVALIDO, nada é gravado).
 */
export function validarCaso(conteudo) {
  const formato = problemasDeFormato(conteudo);
  if (formato.length) return formato;

  const problemas = [];
  const add = (codigo, texto, etapa = null) => problemas.push({ codigo, texto, etapa });
  const L = LIMITES_CASO;

  for (const [campo, rotulo] of [
    ["contexto", "O contexto"],
    ["reflexao", "A reflexão"],
  ]) {
    if ((conteudo[campo] ?? "").length > L.longo) {
      add("TAMANHO", `${rotulo} do caso passa de ${milhar(L.longo)} caracteres`);
    }
  }

  const etapas = conteudo.etapas;
  if (etapas.length === 0) {
    add("SEM_ETAPAS", "O caso precisa de pelo menos uma etapa");
    return problemas;
  }
  if (etapas.length > L.etapas) {
    add("MUITAS_ETAPAS", `O caso pode ter no máximo ${L.etapas} etapas (tem ${etapas.length})`);
  }

  const ids = new Set();
  let idsConfiaveis = true;
  etapas.forEach((etapa, i) => {
    const id = preenchido(etapa.id) ? etapa.id : null;
    const nome = id ? `"${id}"` : `nº ${i + 1}`;
    if (!id) {
      add("ID_VAZIO", `A etapa nº ${i + 1} está sem identificador`);
      idsConfiaveis = false;
    } else if (ids.has(id)) {
      add("ID_REPETIDO", `O identificador "${id}" está em mais de uma etapa`, id);
      idsConfiaveis = false;
    } else {
      ids.add(id);
    }
    if (id && id.length > L.texto) {
      add(
        "TAMANHO",
        `O identificador da etapa nº ${i + 1} passa de ${milhar(L.texto)} caracteres`,
        id
      );
    }
    if (!preenchido(etapa.pergunta)) {
      add("PERGUNTA_VAZIA", `A etapa ${nome} está sem pergunta`, id);
    } else if (etapa.pergunta.length > L.texto) {
      add("TAMANHO", `A pergunta da etapa ${nome} passa de ${milhar(L.texto)} caracteres`, id);
    }
    if (etapa.opcoes.length < L.opcoesMin || etapa.opcoes.length > L.opcoesMax) {
      add(
        "OPCOES_QTD",
        `A etapa ${nome} precisa de ${L.opcoesMin} a ${L.opcoesMax} opções (tem ${etapa.opcoes.length})`,
        id
      );
    }
  });

  etapas.forEach((etapa, i) => {
    const id = preenchido(etapa.id) ? etapa.id : null;
    const nome = id ? `"${id}"` : `nº ${i + 1}`;
    etapa.opcoes.forEach((opcao, k) => {
      const qual = `A opção ${k + 1} da etapa ${nome}`;
      if (!preenchido(opcao.texto)) add("TEXTO_VAZIO", `${qual} está sem texto`, id);
      else if (opcao.texto.length > L.texto)
        add("TAMANHO", `${qual} passa de ${milhar(L.texto)} caracteres`, id);
      if (!preenchido(opcao.comentario)) add("COMENTARIO_VAZIO", `${qual} está sem comentário`, id);
      else if (opcao.comentario.length > L.texto)
        add(
          "TAMANHO",
          `O comentário da opção ${k + 1} da etapa ${nome} passa de ${milhar(L.texto)} caracteres`,
          id
        );
      if (opcao.proxima !== null && !ids.has(opcao.proxima)) {
        add(
          "PROXIMA_INEXISTENTE",
          `${qual} leva para uma etapa que não existe ("${opcao.proxima}")`,
          id
        );
      }
      if (opcao.proxima === null && opcao.segura !== true) {
        add(
          "FIM_INSEGURO",
          `${qual} encerra o caso, mas não é segura: só a opção segura encerra`,
          id
        );
      }
    });
    if (!etapa.opcoes.some((o) => o.segura === true)) {
      add("SEM_SEGURA", `A etapa ${nome} precisa de pelo menos uma opção segura`, id);
    }
  });

  // o caminho só é conferido com identificadores confiáveis (sem vazio nem repetido)
  if (!idsConfiaveis) return problemas;
  const porId = new Map(etapas.map((e) => [e.id, e]));
  const destinos = (etapa, soSeguras) =>
    etapa.opcoes.filter((o) => !soSeguras || o.segura === true).map((o) => o.proxima);

  // alcançáveis a partir da primeira etapa (por qualquer opção)
  const alcancadas = new Set([etapas[0].id]);
  const fila = [etapas[0].id];
  while (fila.length) {
    const etapa = porId.get(fila.shift());
    for (const destino of destinos(etapa, false)) {
      if (destino !== null && porId.has(destino) && !alcancadas.has(destino)) {
        alcancadas.add(destino);
        fila.push(destino);
      }
    }
  }
  for (const etapa of etapas) {
    if (!alcancadas.has(etapa.id)) {
      add(
        "INALCANCAVEL",
        `A etapa "${etapa.id}" nunca é alcançada a partir da primeira etapa`,
        etapa.id
      );
    }
  }

  // de onde se chega ao fim (o fim é uma opção SEGURA com proxima null)
  const chegaAoFim = (soSeguras) => {
    const chega = new Set();
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const etapa of etapas) {
        if (chega.has(etapa.id)) continue;
        const sai = etapa.opcoes.some(
          (o) =>
            (!soSeguras || o.segura === true) &&
            ((o.proxima === null && o.segura === true) ||
              (o.proxima !== null && chega.has(o.proxima)))
        );
        if (sai) {
          chega.add(etapa.id);
          mudou = true;
        }
      }
    }
    return chega;
  };
  const comSaida = chegaAoFim(false);
  for (const etapa of etapas) {
    if (!comSaida.has(etapa.id)) {
      add("SEM_SAIDA", `Da etapa "${etapa.id}" não há como chegar ao fim do caso`, etapa.id);
    }
  }
  if (!chegaAoFim(true).has(etapas[0].id)) {
    add(
      "SEM_CAMINHO_SEGURO",
      "Não há caminho só de opções seguras da primeira etapa até o fim do caso"
    );
  }
  return problemas;
}

const estadoInvalido = (motivo) => ({
  valido: false,
  motivo,
  fim: false,
  etapaAtual: null,
  passagens: {},
  ultimo: null,
});

/**
 * Refaz o caminho do aluno no roteiro de HOJE a partir das escolhas gravadas (em ordem). Roteiro inválido:
 * `CASO_INVALIDO`; escolha que não confere (etapa que não é a atual, etapa ou opção que sumiu, clique depois do
 * fim): `CAMINHO_DIVERGENTE` (o servidor recomeça a rodada). `passagens` conta as visitas a cada etapa nesta rodada.
 */
export function estadoDoCaso(conteudo, escolhas) {
  if (validarCaso(conteudo).length) return estadoInvalido("CASO_INVALIDO");
  const porId = new Map(conteudo.etapas.map((e) => [e.id, e]));
  let atual = conteudo.etapas[0].id;
  const passagens = new Map([[atual, 1]]);
  let fim = false;
  let ultimo = null;
  for (const escolha of Array.isArray(escolhas) ? escolhas : []) {
    if (fim || !ehObjeto(escolha) || escolha.etapa !== atual) {
      return estadoInvalido("CAMINHO_DIVERGENTE");
    }
    const etapa = porId.get(atual);
    const opcao = Number.isInteger(escolha.opcao) ? etapa.opcoes[escolha.opcao] : undefined;
    if (!opcao) return estadoInvalido("CAMINHO_DIVERGENTE");
    ultimo = { comentario: opcao.comentario, segura: opcao.segura === true };
    if (opcao.proxima === null) {
      fim = true;
    } else {
      atual = opcao.proxima;
      passagens.set(atual, (passagens.get(atual) ?? 0) + 1);
    }
  }
  return {
    valido: true,
    motivo: null,
    fim,
    etapaAtual: fim ? null : atual,
    passagens: Object.fromEntries(passagens),
    ultimo,
  };
}

function sortear(n, aleatorio) {
  const j = aleatorio(n);
  if (!Number.isInteger(j) || j < 0 || j >= n) throw new RangeError("sorteio fora do intervalo");
  return j;
}

/** Fisher–Yates (o mesmo `embaralhar` da prova, regras.ts): embaralha uma cópia. */
function embaralhar(itens, aleatorio) {
  const a = [...itens];
  for (let i = a.length - 1; i > 0; i--) {
    const j = sortear(i + 1, aleatorio);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A etapa como o aluno a vê: pergunta e opções SÓ com o texto e o índice original, em ordem embaralhada. Nunca
 * `segura`, `comentario` ou `proxima`. `aleatorio(n)` devolve um inteiro em [0, n); fora disso, RangeError.
 */
export function etapaParaAluno(conteudo, etapaId, aleatorio) {
  const etapas = ehObjeto(conteudo) && Array.isArray(conteudo.etapas) ? conteudo.etapas : [];
  const etapa = etapas.find((e) => ehObjeto(e) && e.id === etapaId);
  if (!etapa || !Array.isArray(etapa.opcoes)) throw new RangeError("etapa inexistente no roteiro");
  const ordem = embaralhar(
    etapa.opcoes.map((_, i) => i),
    aleatorio
  );
  return {
    id: etapa.id,
    pergunta: String(etapa.pergunta ?? ""),
    opcoes: ordem.map((i) => ({ indice: i, texto: String(etapa.opcoes[i]?.texto ?? "") })),
  };
}

/**
 * O que acontece com o clique do aluno na opção `opcao` (índice ORIGINAL) da etapa `etapaId`, dado o estado
 * refeito: recusa (`CASO_INVALIDO`, `CASO_ENCERRADO`, `CASO_FORA_DE_ORDEM`, `OPCAO_INVALIDA`) ou o comentário,
 * se foi segura, para onde leva e a visita atual àquela etapa (`passagem`).
 */
export function resultadoDaEscolha(conteudo, estado, etapaId, opcao) {
  if (!estado?.valido || validarCaso(conteudo).length)
    return { ok: false, codigo: "CASO_INVALIDO" };
  if (estado.fim) return { ok: false, codigo: "CASO_ENCERRADO" };
  if (etapaId !== estado.etapaAtual) return { ok: false, codigo: "CASO_FORA_DE_ORDEM" };
  const etapa = conteudo.etapas.find((e) => e.id === etapaId);
  if (!Number.isInteger(opcao) || opcao < 0 || opcao >= etapa.opcoes.length) {
    return { ok: false, codigo: "OPCAO_INVALIDA" };
  }
  const escolhida = etapa.opcoes[opcao];
  const segura = escolhida.segura === true;
  return {
    ok: true,
    comentario: escolhida.comentario,
    segura,
    proxima: escolhida.proxima,
    fim: segura && escolhida.proxima === null,
    passagem: estado.passagens[etapaId],
  };
}

/** Roteiro novo do editor: 1 etapa "e1" com 1 opção segura que encerra e 1 insegura que volta a ela. */
export function novoCasoVazio() {
  return {
    contexto: "",
    etapas: [
      {
        id: "e1",
        pergunta: "",
        opcoes: [
          { texto: "", comentario: "", segura: true, proxima: null },
          { texto: "", comentario: "", segura: false, proxima: "e1" },
        ],
      },
    ],
    reflexao: "",
  };
}

/** O menor "e<n>" (n >= 1) que nenhuma etapa usa. */
export function proximoIdDeEtapa(conteudo) {
  const usados = new Set(
    (ehObjeto(conteudo) && Array.isArray(conteudo.etapas) ? conteudo.etapas : [])
      .filter((e) => ehObjeto(e) && typeof e.id === "string")
      .map((e) => e.id)
  );
  let n = 1;
  while (usados.has(`e${n}`)) n++;
  return `e${n}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web; npx vitest run src/lib/ead-caso.test.js`

Expected: PASS, `Tests 21 passed (21)`.

- [ ] **Step 5: Checagens**

- `npm test --workspace=apps/web` → 130 arquivos, 2469 testes, 0 falhas (2448 + 21).
- `node --test "supabase/functions/**/*.test.ts"` → 1560, 0 falhas (nada do servidor mudou ainda).
- `npx prettier --check apps/web/src/lib/ead-caso.js apps/web/src/lib/ead-caso.test.js` → sem avisos.
- `npm run lint` → sem erros (`src/lib` fica fora do ESLint; quem cobre é o teste).
- `npm run build` → termina sem erro (o arquivo ainda não é importado pela tela; confere a sintaxe no Vite).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ead-caso.js apps/web/src/lib/ead-caso.test.js
git commit -F - -- apps/web/src/lib/ead-caso.js apps/web/src/lib/ead-caso.test.js <<'EOF'
feat(ead): regra do roteiro do caso com decisões no front (ead-caso.js)

O caso com decisões (spec 2026-10-14 §4.3) precisa da mesma regra na tela do RH (o editor só salva roteiro válido),
na prévia "Ver como aluno" e no servidor. Esta é a cópia do front: validarCaso (formato, ids, 2 a 6 opções, textos,
próxima existente, fim só pela segura, etapa alcançável, saída, caminho só de seguras e limites de tamanho),
estadoDoCaso (refaz o caminho a partir das escolhas; caminho que não confere = CAMINHO_DIVERGENTE), etapaParaAluno
(opções só com texto e índice original, embaralhadas por Fisher-Yates), resultadoDaEscolha, novoCasoVazio e
proximoIdDeEtapa. O servidor ganha a mesma regra na próxima task, com um teste que roda as duas cópias.

Como testar: cd apps/web; npx vitest run src/lib/ead-caso.test.js

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

---

### Task 3: Roteiro do caso no servidor (`caso.ts`)

**Files:**

- Create: `supabase/functions/portal-funcionario/caso.ts`
- Create: `supabase/functions/portal-funcionario/caso.test.ts`
- Read (não muda): `supabase/functions/portal-funcionario/requisitos.test.ts:17-27` (modelo do import da cópia do
  front: `../../../apps/web/src/lib/ead-requisitos.js`), `apps/web/src/lib/ead-caso.js` (Task 2).

**Interfaces:**

- Consumes: `apps/web/src/lib/ead-caso.js` (só no teste, para conferir as duas cópias).
- Produces (C3, servidor): a mesma API da Task 2 (sem `novoCasoVazio`/`proximoIdDeEtapa`) com tipos
  (`ProblemaDoCaso`, `EstadoDoCaso`, `EscolhaDoCaso`, `ResultadoDaEscolha`), mais
  `escolhasDaRodada(eventos: { evento: string; detalhe: unknown }[]) → { rodada: number; escolhas: { etapa: string;
  opcao: number }[] }` (rodada = maior `detalhe.rodada` de `caso_reiniciado`, ou 1; só os `caso_escolha` dessa rodada,
  com etapa texto e opção inteira; `detalhe` em objeto ou texto JSON).

- [ ] **Step 1: Escrever o teste (falha: o módulo ainda não existe)**

Crie `supabase/functions/portal-funcionario/caso.test.ts` (a MESMA tabela de roteiros e caminhos roda contra
`caso.ts` e `ead-caso.js`):

```ts
// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/caso.test.ts
//
// Roteiro do caso com decisões (spec 2026-10-14 §4.3 e §7). Confere a regra do servidor (caso.ts) e, com a MESMA
// tabela de casos, a cópia do front (apps/web/src/lib/ead-caso.js), como o requisitos.test.ts faz com os
// requisitos. Textos sintéticos: nada do material do NR-10.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITES_CASO,
  escolhasDaRodada,
  estadoDoCaso,
  etapaParaAluno,
  resultadoDaEscolha,
  validarCaso,
} from "./caso.ts";
import {
  LIMITES_CASO as LIMITES_FRONT,
  estadoDoCaso as estadoFront,
  etapaParaAluno as etapaFront,
  resultadoDaEscolha as resultadoFront,
  validarCaso as validarFront,
} from "../../../apps/web/src/lib/ead-caso.js";

const opc = (texto: string, segura: boolean, proxima: string | null) => ({
  texto,
  comentario: `Comentário: ${texto}`,
  segura,
  proxima,
});
// linear: a insegura volta à mesma etapa
const CASO_LINEAR = {
  contexto: "Equipe sintética prepara uma tarefa de teste.",
  etapas: [
    {
      id: "e1",
      pergunta: "Primeira decisão?",
      opcoes: [opc("Pular a conferência", false, "e1"), opc("Conferir o plano", true, "e2")],
    },
    {
      id: "e2",
      pergunta: "Segunda decisão?",
      opcoes: [opc("Seguir sem aviso", false, "e2"), opc("Avisar a equipe", true, "e3")],
    },
    {
      id: "e3",
      pergunta: "Última decisão?",
      opcoes: [opc("Encerrar às pressas", false, "e3"), opc("Registrar e encerrar", true, null)],
    },
  ],
  reflexao: "Reflexão sintética.",
};
// ramificado (formato dos rascunhos): a insegura leva à recuperação, cuja segura volta à decisão
const CASO_RAMIFICADO = {
  contexto: "Situação sintética com recuperação.",
  etapas: [
    {
      id: "e1",
      pergunta: "Decisão A?",
      opcoes: [
        opc("A segura", true, "e2"),
        opc("A insegura 1", false, "r1"),
        opc("A insegura 2", false, "r1"),
      ],
    },
    {
      id: "r1",
      pergunta: "Recuperação 1?",
      opcoes: [opc("R1 segura", true, "e1"), opc("R1 insegura", false, "r1")],
    },
    {
      id: "e2",
      pergunta: "Decisão B?",
      opcoes: [opc("B segura", true, null), opc("B insegura", false, "r2")],
    },
    {
      id: "r2",
      pergunta: "Recuperação 2?",
      opcoes: [opc("R2 segura", true, "e2"), opc("R2 insegura", false, "r2")],
    },
  ],
  reflexao: "Reflexão sintética do ramificado.",
};
// deno-lint-ignore no-explicit-any
const copia = (v: any) => JSON.parse(JSON.stringify(v));
const mudado = (base: unknown, mudar: (c: any) => void) => {
  const c = copia(base);
  mudar(c);
  return c;
};

// ------------------------------------------------------------------ a tabela das duas cópias
const ROTEIROS: [string, unknown][] = [
  ["linear", CASO_LINEAR],
  ["ramificado", CASO_RAMIFICADO],
  ["nulo", null],
  ["lista", []],
  ["sem etapas", { contexto: "", etapas: [], reflexao: "" }],
  ["etapa número", { etapas: [1] }],
  ["segura texto", mudado(CASO_LINEAR, (c) => (c.etapas[0].opcoes[0].segura = "sim"))],
  ["id vazio", mudado(CASO_LINEAR, (c) => (c.etapas[1].id = " "))],
  ["id repetido", mudado(CASO_LINEAR, (c) => (c.etapas[2].id = "e2"))],
  ["pergunta vazia", mudado(CASO_LINEAR, (c) => (c.etapas[0].pergunta = ""))],
  ["uma opção", mudado(CASO_LINEAR, (c) => c.etapas[0].opcoes.splice(0, 1))],
  ["próxima inexistente", mudado(CASO_LINEAR, (c) => (c.etapas[0].opcoes[0].proxima = "e9"))],
  ["fim inseguro", mudado(CASO_LINEAR, (c) => (c.etapas[1].opcoes[0].proxima = null))],
  ["sem segura", mudado(CASO_LINEAR, (c) => (c.etapas[2].opcoes[1].segura = false))],
  [
    "inalcançável",
    mudado(CASO_RAMIFICADO, (c) =>
      c.etapas.push({
        id: "x1",
        pergunta: "Solta?",
        opcoes: [opc("Fim", true, null), opc("Volta", false, "x1")],
      })
    ),
  ],
  ["sem saída", mudado(CASO_RAMIFICADO, (c) => (c.etapas[1].opcoes[0].proxima = "r1"))],
  [
    "sem caminho seguro",
    {
      etapas: [
        {
          id: "e1",
          pergunta: "Decisão?",
          opcoes: [opc("Segura", true, "r1"), opc("Atalho", false, "e2")],
        },
        {
          id: "r1",
          pergunta: "Volta?",
          opcoes: [opc("Volta", true, "e1"), opc("Fica", false, "r1")],
        },
        {
          id: "e2",
          pergunta: "Fim?",
          opcoes: [opc("Encerra", true, null), opc("Fica", false, "e2")],
        },
      ],
    },
  ],
  ["contexto longo", mudado(CASO_LINEAR, (c) => (c.contexto = "x".repeat(4001)))],
  ["pergunta longa", mudado(CASO_LINEAR, (c) => (c.etapas[1].pergunta = "p".repeat(1001)))],
];

const CAMINHOS: [string, unknown, unknown][] = [
  ["linear sem escolha", CASO_LINEAR, []],
  ["linear insegura", CASO_LINEAR, [{ etapa: "e1", opcao: 0 }]],
  [
    "linear até o fim",
    CASO_LINEAR,
    [
      { etapa: "e1", opcao: 0 },
      { etapa: "e1", opcao: 1 },
      { etapa: "e2", opcao: 1 },
      { etapa: "e3", opcao: 1 },
    ],
  ],
  [
    "ramificado com recuperação",
    CASO_RAMIFICADO,
    [
      { etapa: "e1", opcao: 2 },
      { etapa: "r1", opcao: 1 },
      { etapa: "r1", opcao: 0 },
      { etapa: "e1", opcao: 0 },
      { etapa: "e2", opcao: 1 },
      { etapa: "r2", opcao: 0 },
    ],
  ],
  ["fora de ordem", CASO_LINEAR, [{ etapa: "e2", opcao: 1 }]],
  ["opção que não existe", CASO_LINEAR, [{ etapa: "e1", opcao: 7 }]],
  ["opção em texto", CASO_LINEAR, [{ etapa: "e1", opcao: "1" }]],
  ["escolhas que não são lista", CASO_LINEAR, "x"],
  ["roteiro inválido", { etapas: [] }, []],
];

test("LIMITES_CASO: os mesmos valores nas duas cópias", () => {
  assert.deepEqual(LIMITES_CASO, {
    etapas: 30,
    opcoesMin: 2,
    opcoesMax: 6,
    texto: 1000,
    longo: 4000,
  });
  assert.deepEqual(LIMITES_CASO, LIMITES_FRONT);
});

test("validarCaso: servidor e front dizem o mesmo em toda a tabela", () => {
  for (const [nome, roteiro] of ROTEIROS) {
    assert.deepEqual(validarCaso(roteiro), validarFront(roteiro), nome);
  }
});

test("estadoDoCaso e resultadoDaEscolha: servidor e front dizem o mesmo em toda a tabela", () => {
  for (const [nome, roteiro, escolhas] of CAMINHOS) {
    const estado = estadoDoCaso(roteiro, escolhas);
    assert.deepEqual(estado, estadoFront(roteiro, escolhas), nome);
    for (const etapa of ["e1", "e2", "e3", "r1", "r2", "x"]) {
      for (const opcao of [0, 1, 2, 5, "1", null]) {
        assert.deepEqual(
          resultadoDaEscolha(roteiro, estado, etapa, opcao),
          resultadoFront(roteiro, estado, etapa, opcao),
          `${nome} / ${etapa} / ${String(opcao)}`
        );
      }
    }
  }
});

test("etapaParaAluno: servidor e front embaralham igual com o mesmo sorteio", () => {
  const sorteios = [() => 0, (n: number) => n - 1, (n: number) => Math.floor(n / 2)];
  for (const sorteio of sorteios) {
    for (const [roteiro, etapa] of [
      [CASO_LINEAR, "e1"],
      [CASO_RAMIFICADO, "e1"],
      [CASO_RAMIFICADO, "r2"],
    ] as const) {
      assert.deepEqual(
        etapaParaAluno(roteiro, etapa, sorteio),
        etapaFront(roteiro, etapa, sorteio)
      );
    }
  }
});

// ---------------------------------------------------------------------------- a regra em si
test("validarCaso: o linear e o ramificado com recuperação são válidos; os quebrados dão o código certo", () => {
  assert.deepEqual(validarCaso(CASO_LINEAR), []);
  assert.deepEqual(validarCaso(CASO_RAMIFICADO), []);
  const codigos = new Map(ROTEIROS.map(([nome, r]) => [nome, validarCaso(r).map((p) => p.codigo)]));
  assert.deepEqual(codigos.get("nulo"), ["FORMATO"]);
  assert.deepEqual(codigos.get("sem etapas"), ["SEM_ETAPAS"]);
  assert.deepEqual(codigos.get("segura texto"), ["FORMATO"]);
  assert.ok(codigos.get("id vazio")?.includes("ID_VAZIO"));
  assert.ok(codigos.get("id repetido")?.includes("ID_REPETIDO"));
  assert.deepEqual(codigos.get("pergunta vazia"), ["PERGUNTA_VAZIA"]);
  assert.deepEqual(codigos.get("uma opção"), ["OPCOES_QTD"]);
  assert.deepEqual(codigos.get("próxima inexistente"), ["PROXIMA_INEXISTENTE"]);
  assert.deepEqual(codigos.get("fim inseguro"), ["FIM_INSEGURO"]);
  assert.ok(codigos.get("sem segura")?.includes("SEM_SEGURA"));
  assert.deepEqual(codigos.get("inalcançável"), ["INALCANCAVEL"]);
  assert.deepEqual(codigos.get("sem saída"), ["SEM_SAIDA"]);
  assert.deepEqual(codigos.get("sem caminho seguro"), ["SEM_CAMINHO_SEGURO"]);
  assert.deepEqual(codigos.get("contexto longo"), ["TAMANHO"]);
  assert.deepEqual(codigos.get("pergunta longa"), ["TAMANHO"]);
});

test("estadoDoCaso: refaz o caminho do ramificado (recuperação devolve à decisão; passagens por etapa)", () => {
  const estado = estadoDoCaso(CASO_RAMIFICADO, CAMINHOS[3][2]);
  assert.equal(estado.valido, true);
  assert.equal(estado.etapaAtual, "e2");
  assert.deepEqual(estado.passagens, { e1: 2, r1: 2, e2: 2, r2: 1 });
  assert.deepEqual(estado.ultimo, { comentario: "Comentário: R2 segura", segura: true });
  const fim = estadoDoCaso(CASO_RAMIFICADO, [
    ...(CAMINHOS[3][2] as object[]),
    { etapa: "e2", opcao: 0 },
  ]);
  assert.equal(fim.fim, true);
  assert.equal(fim.etapaAtual, null);
});

test("resultadoDaEscolha: etapa fora de ordem é recusada (o caso não pula etapa)", () => {
  const inicio = estadoDoCaso(CASO_LINEAR, []);
  assert.deepEqual(resultadoDaEscolha(CASO_LINEAR, inicio, "e3", 1), {
    ok: false,
    codigo: "CASO_FORA_DE_ORDEM",
  });
  assert.deepEqual(resultadoDaEscolha(CASO_LINEAR, inicio, "e1", 1), {
    ok: true,
    comentario: "Comentário: Conferir o plano",
    segura: true,
    proxima: "e2",
    fim: false,
    passagem: 1,
  });
});

test("etapaParaAluno: as opções vão sem segura, comentário e próxima, com o índice original", () => {
  for (const etapa of ["e1", "r1", "e2", "r2"]) {
    const vista = etapaParaAluno(CASO_RAMIFICADO, etapa, () => 0);
    for (const o of vista.opcoes) assert.deepEqual(Object.keys(o).sort(), ["indice", "texto"]);
    assert.deepEqual(Object.keys(vista).sort(), ["id", "opcoes", "pergunta"]);
    assert.ok(!JSON.stringify(vista).includes("Comentário:"), etapa);
  }
  assert.throws(() => etapaParaAluno(CASO_LINEAR, "e1", (n) => n), RangeError);
});

// ---------------------------------------------------------------- escolhasDaRodada (só no servidor)
const ev = (evento: string, detalhe: unknown) => ({ evento, detalhe });

test("escolhasDaRodada: sem eventos, rodada 1 e nenhuma escolha", () => {
  assert.deepEqual(escolhasDaRodada([]), { rodada: 1, escolhas: [] });
  assert.deepEqual(escolhasDaRodada(null), { rodada: 1, escolhas: [] });
});

test("escolhasDaRodada: só as escolhas da maior rodada, em ordem; o resto da trilha é ignorado", () => {
  const eventos = [
    ev("aula_aberta", { aula: "x" }),
    ev("caso_escolha", {
      rodada: 1,
      etapa: "e1",
      opcao: 0,
      segura: false,
      proxima: "e1",
      passagem: 1,
    }),
    ev("caso_escolha", {
      rodada: 1,
      etapa: "e1",
      opcao: 1,
      segura: true,
      proxima: "e2",
      passagem: 2,
    }),
    ev("caso_reiniciado", { rodada: 2, motivo: "caso_alterado" }),
    ev("caso_escolha", {
      rodada: 2,
      etapa: "e1",
      opcao: 1,
      segura: true,
      proxima: "e2",
      passagem: 1,
    }),
    ev("caso_escolha", JSON.stringify({ rodada: 2, etapa: "e2", opcao: 1 })),
    ev("caso_escolha", { rodada: 2, etapa: "e2" }), // sem opção: ignorada
    ev("caso_escolha", { rodada: 2, etapa: 3, opcao: 0 }), // etapa que não é texto: ignorada
    ev("caso_escolha", "não é JSON"),
    ev("caso_escolha", null),
  ];
  assert.deepEqual(escolhasDaRodada(eventos), {
    rodada: 2,
    escolhas: [
      { etapa: "e1", opcao: 1 },
      { etapa: "e2", opcao: 1 },
    ],
  });
});

test("roteiro alterado pelo RH: o caminho gravado diverge e a rodada nova recomeça da primeira etapa", () => {
  const gravadas = [
    ev("caso_escolha", { rodada: 1, etapa: "e1", opcao: 1 }),
    ev("caso_escolha", { rodada: 1, etapa: "e2", opcao: 1 }),
  ];
  const rodada1 = escolhasDaRodada(gravadas);
  assert.equal(estadoDoCaso(CASO_LINEAR, rodada1.escolhas).etapaAtual, "e3");
  // o RH tirou a etapa e2: o mesmo caminho não confere mais
  const alterado = mudado(CASO_LINEAR, (c) => {
    c.etapas.splice(1, 1);
    c.etapas[0].opcoes[1].proxima = "e3";
  });
  assert.deepEqual(validarCaso(alterado), []);
  const divergente = estadoDoCaso(alterado, rodada1.escolhas);
  assert.equal(divergente.valido, false);
  assert.equal(divergente.motivo, "CAMINHO_DIVERGENTE");
  // o servidor grava caso_reiniciado com a rodada seguinte: a nova rodada começa sem escolhas, na 1ª etapa
  const depois = escolhasDaRodada([
    ...gravadas,
    ev("caso_reiniciado", { rodada: rodada1.rodada + 1, motivo: "caso_alterado" }),
  ]);
  assert.deepEqual(depois, { rodada: 2, escolhas: [] });
  const recomeco = estadoDoCaso(alterado, depois.escolhas);
  assert.equal(recomeco.valido, true);
  assert.equal(recomeco.etapaAtual, "e1");
  assert.deepEqual(recomeco.passagens, { e1: 1 });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test supabase/functions/portal-funcionario/caso.test.ts`

Expected: FAIL ao carregar, `ERR_MODULE_NOT_FOUND` (`Cannot find module '...portal-funcionario/caso.ts'`), `ℹ fail 1`.

- [ ] **Step 3: Implementar**

Crie `supabase/functions/portal-funcionario/caso.ts` (só sintaxe que o Node apaga: `type`, anotações e `as`; nada de
`enum`):

```ts
/**
 * Roteiro do caso com decisões (atividade interativa do EAD, spec 2026-10-14 §4.3 e §7): módulo PURO.
 *
 * Sem `Deno.*`, sem import de URL e sem banco: o `index.ts` lê o roteiro (`treinamento_caso.conteudo`) e as
 * escolhas gravadas na trilha (`treinamento_evento`) e chama estas funções. Espelho do front
 * (`apps/web/src/lib/ead-caso.js`): `caso.test.ts` roda a mesma tabela de casos contra as duas cópias. Mudou aqui,
 * mude lá (e vice-versa). Só aqui: `escolhasDaRodada` (a trilha só existe no servidor).
 *
 * conteudo = { contexto, etapas: [{ id, pergunta, opcoes: [{ texto, comentario, segura, proxima }] }], reflexao }
 * O caso começa na PRIMEIRA etapa da lista; `proxima` é o id de outra etapa ou null (fim). Só opção segura encerra.
 */

export const LIMITES_CASO = { etapas: 30, opcoesMin: 2, opcoesMax: 6, texto: 1000, longo: 4000 };

export type ProblemaDoCaso = { codigo: string; texto: string; etapa: string | null };

export type OpcaoDoCaso = {
  texto: string;
  comentario: string;
  segura: boolean;
  proxima: string | null;
};
export type EtapaDoCaso = { id: string; pergunta: string; opcoes: OpcaoDoCaso[] };
export type RoteiroDoCaso = {
  contexto?: string | null;
  etapas: EtapaDoCaso[];
  reflexao?: string | null;
};

export type EstadoDoCaso = {
  valido: boolean;
  motivo: "CASO_INVALIDO" | "CAMINHO_DIVERGENTE" | null;
  fim: boolean;
  etapaAtual: string | null;
  passagens: Record<string, number>;
  ultimo: { comentario: string; segura: boolean } | null;
};

export type EscolhaDoCaso = { etapa: string; opcao: number };

export type ResultadoDaEscolha =
  | {
      ok: false;
      codigo: "CASO_INVALIDO" | "CASO_ENCERRADO" | "CASO_FORA_DE_ORDEM" | "OPCAO_INVALIDA";
    }
  | {
      ok: true;
      comentario: string;
      segura: boolean;
      proxima: string | null;
      fim: boolean;
      passagem: number;
    };

// deno-lint-ignore no-explicit-any
type Qualquer = any;

const ehObjeto = (v: unknown): v is Record<string, Qualquer> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const preenchido = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const milhar = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Problemas de FORMA (tipos errados): sem eles, o resto da validação pode ler o roteiro sem cuidado. */
function problemasDeFormato(conteudo: unknown): ProblemaDoCaso[] {
  const formato = (texto: string, etapa: string | null = null): ProblemaDoCaso => ({
    codigo: "FORMATO",
    texto,
    etapa,
  });
  if (!ehObjeto(conteudo) || !Array.isArray(conteudo.etapas)) {
    return [
      formato("O roteiro do caso não está no formato esperado (contexto, etapas e reflexão)"),
    ];
  }
  const problemas: ProblemaDoCaso[] = [];
  for (const campo of ["contexto", "reflexao"]) {
    const v = conteudo[campo];
    if (v !== undefined && v !== null && typeof v !== "string") {
      problemas.push(formato(`O campo "${campo}" do caso precisa ser um texto`));
    }
  }
  conteudo.etapas.forEach((etapa: unknown, i: number) => {
    const nome = ehObjeto(etapa) && typeof etapa.id === "string" ? etapa.id : null;
    if (!ehObjeto(etapa)) {
      problemas.push(formato(`A etapa nº ${i + 1} não está no formato esperado`));
      return;
    }
    if (etapa.id !== undefined && etapa.id !== null && typeof etapa.id !== "string") {
      problemas.push(formato(`O identificador da etapa nº ${i + 1} precisa ser um texto`));
    }
    if (
      etapa.pergunta !== undefined &&
      etapa.pergunta !== null &&
      typeof etapa.pergunta !== "string"
    ) {
      problemas.push(formato(`A pergunta da etapa nº ${i + 1} precisa ser um texto`, nome));
    }
    if (!Array.isArray(etapa.opcoes)) {
      problemas.push(formato(`As opções da etapa nº ${i + 1} precisam ser uma lista`, nome));
      return;
    }
    etapa.opcoes.forEach((opcao: unknown, k: number) => {
      const ok =
        ehObjeto(opcao) &&
        (opcao.texto === undefined || opcao.texto === null || typeof opcao.texto === "string") &&
        (opcao.comentario === undefined ||
          opcao.comentario === null ||
          typeof opcao.comentario === "string") &&
        typeof opcao.segura === "boolean" &&
        (opcao.proxima === null || typeof opcao.proxima === "string");
      if (!ok) {
        problemas.push(
          formato(
            `A opção ${k + 1} da etapa nº ${i + 1} não está no formato esperado (texto, comentário, segura e próxima)`,
            nome
          )
        );
      }
    });
  });
  return problemas;
}

/**
 * Problemas do roteiro; lista vazia = caso válido. A mesma regra vale na tela do RH (o "Salvar" fica desabilitado
 * com qualquer problema) e no servidor (roteiro inválido: 409 CASO_INVALIDO, nada é gravado).
 */
export function validarCaso(conteudo: unknown): ProblemaDoCaso[] {
  const formato = problemasDeFormato(conteudo);
  if (formato.length) return formato;
  const roteiro = conteudo as RoteiroDoCaso;

  const problemas: ProblemaDoCaso[] = [];
  const add = (codigo: string, texto: string, etapa: string | null = null) =>
    problemas.push({ codigo, texto, etapa });
  const L = LIMITES_CASO;

  for (const [campo, rotulo] of [
    ["contexto", "O contexto"],
    ["reflexao", "A reflexão"],
  ] as const) {
    if ((roteiro[campo] ?? "").length > L.longo) {
      add("TAMANHO", `${rotulo} do caso passa de ${milhar(L.longo)} caracteres`);
    }
  }

  const etapas = roteiro.etapas;
  if (etapas.length === 0) {
    add("SEM_ETAPAS", "O caso precisa de pelo menos uma etapa");
    return problemas;
  }
  if (etapas.length > L.etapas) {
    add("MUITAS_ETAPAS", `O caso pode ter no máximo ${L.etapas} etapas (tem ${etapas.length})`);
  }

  const ids = new Set<string>();
  let idsConfiaveis = true;
  etapas.forEach((etapa, i) => {
    const id = preenchido(etapa.id) ? etapa.id : null;
    const nome = id ? `"${id}"` : `nº ${i + 1}`;
    if (!id) {
      add("ID_VAZIO", `A etapa nº ${i + 1} está sem identificador`);
      idsConfiaveis = false;
    } else if (ids.has(id)) {
      add("ID_REPETIDO", `O identificador "${id}" está em mais de uma etapa`, id);
      idsConfiaveis = false;
    } else {
      ids.add(id);
    }
    if (id && id.length > L.texto) {
      add(
        "TAMANHO",
        `O identificador da etapa nº ${i + 1} passa de ${milhar(L.texto)} caracteres`,
        id
      );
    }
    if (!preenchido(etapa.pergunta)) {
      add("PERGUNTA_VAZIA", `A etapa ${nome} está sem pergunta`, id);
    } else if (etapa.pergunta.length > L.texto) {
      add("TAMANHO", `A pergunta da etapa ${nome} passa de ${milhar(L.texto)} caracteres`, id);
    }
    if (etapa.opcoes.length < L.opcoesMin || etapa.opcoes.length > L.opcoesMax) {
      add(
        "OPCOES_QTD",
        `A etapa ${nome} precisa de ${L.opcoesMin} a ${L.opcoesMax} opções (tem ${etapa.opcoes.length})`,
        id
      );
    }
  });

  etapas.forEach((etapa, i) => {
    const id = preenchido(etapa.id) ? etapa.id : null;
    const nome = id ? `"${id}"` : `nº ${i + 1}`;
    etapa.opcoes.forEach((opcao, k) => {
      const qual = `A opção ${k + 1} da etapa ${nome}`;
      if (!preenchido(opcao.texto)) add("TEXTO_VAZIO", `${qual} está sem texto`, id);
      else if (opcao.texto.length > L.texto)
        add("TAMANHO", `${qual} passa de ${milhar(L.texto)} caracteres`, id);
      if (!preenchido(opcao.comentario)) add("COMENTARIO_VAZIO", `${qual} está sem comentário`, id);
      else if (opcao.comentario.length > L.texto)
        add(
          "TAMANHO",
          `O comentário da opção ${k + 1} da etapa ${nome} passa de ${milhar(L.texto)} caracteres`,
          id
        );
      if (opcao.proxima !== null && !ids.has(opcao.proxima)) {
        add(
          "PROXIMA_INEXISTENTE",
          `${qual} leva para uma etapa que não existe ("${opcao.proxima}")`,
          id
        );
      }
      if (opcao.proxima === null && opcao.segura !== true) {
        add(
          "FIM_INSEGURO",
          `${qual} encerra o caso, mas não é segura: só a opção segura encerra`,
          id
        );
      }
    });
    if (!etapa.opcoes.some((o) => o.segura === true)) {
      add("SEM_SEGURA", `A etapa ${nome} precisa de pelo menos uma opção segura`, id);
    }
  });

  // o caminho só é conferido com identificadores confiáveis (sem vazio nem repetido)
  if (!idsConfiaveis) return problemas;
  const porId = new Map(etapas.map((e) => [e.id, e]));
  const destinos = (etapa: EtapaDoCaso, soSeguras: boolean) =>
    etapa.opcoes.filter((o) => !soSeguras || o.segura === true).map((o) => o.proxima);

  // alcançáveis a partir da primeira etapa (por qualquer opção)
  const alcancadas = new Set<string>([etapas[0].id]);
  const fila = [etapas[0].id];
  while (fila.length) {
    const etapa = porId.get(fila.shift() as string) as EtapaDoCaso;
    for (const destino of destinos(etapa, false)) {
      if (destino !== null && porId.has(destino) && !alcancadas.has(destino)) {
        alcancadas.add(destino);
        fila.push(destino);
      }
    }
  }
  for (const etapa of etapas) {
    if (!alcancadas.has(etapa.id)) {
      add(
        "INALCANCAVEL",
        `A etapa "${etapa.id}" nunca é alcançada a partir da primeira etapa`,
        etapa.id
      );
    }
  }

  // de onde se chega ao fim (o fim é uma opção SEGURA com proxima null)
  const chegaAoFim = (soSeguras: boolean) => {
    const chega = new Set<string>();
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const etapa of etapas) {
        if (chega.has(etapa.id)) continue;
        const sai = etapa.opcoes.some(
          (o) =>
            (!soSeguras || o.segura === true) &&
            ((o.proxima === null && o.segura === true) ||
              (o.proxima !== null && chega.has(o.proxima)))
        );
        if (sai) {
          chega.add(etapa.id);
          mudou = true;
        }
      }
    }
    return chega;
  };
  const comSaida = chegaAoFim(false);
  for (const etapa of etapas) {
    if (!comSaida.has(etapa.id)) {
      add("SEM_SAIDA", `Da etapa "${etapa.id}" não há como chegar ao fim do caso`, etapa.id);
    }
  }
  if (!chegaAoFim(true).has(etapas[0].id)) {
    add(
      "SEM_CAMINHO_SEGURO",
      "Não há caminho só de opções seguras da primeira etapa até o fim do caso"
    );
  }
  return problemas;
}

const estadoInvalido = (motivo: "CASO_INVALIDO" | "CAMINHO_DIVERGENTE"): EstadoDoCaso => ({
  valido: false,
  motivo,
  fim: false,
  etapaAtual: null,
  passagens: {},
  ultimo: null,
});

/**
 * Refaz o caminho do aluno no roteiro de HOJE a partir das escolhas gravadas (em ordem). Roteiro inválido:
 * `CASO_INVALIDO`; escolha que não confere (etapa que não é a atual, etapa ou opção que sumiu, clique depois do
 * fim): `CAMINHO_DIVERGENTE` (o servidor recomeça a rodada). `passagens` conta as visitas a cada etapa nesta rodada.
 */
export function estadoDoCaso(conteudo: unknown, escolhas: unknown): EstadoDoCaso {
  if (validarCaso(conteudo).length) return estadoInvalido("CASO_INVALIDO");
  const roteiro = conteudo as RoteiroDoCaso;
  const porId = new Map(roteiro.etapas.map((e) => [e.id, e]));
  let atual = roteiro.etapas[0].id;
  const passagens = new Map<string, number>([[atual, 1]]);
  let fim = false;
  let ultimo: EstadoDoCaso["ultimo"] = null;
  for (const escolha of Array.isArray(escolhas) ? escolhas : []) {
    if (fim || !ehObjeto(escolha) || escolha.etapa !== atual) {
      return estadoInvalido("CAMINHO_DIVERGENTE");
    }
    const etapa = porId.get(atual) as EtapaDoCaso;
    const opcao = Number.isInteger(escolha.opcao) ? etapa.opcoes[escolha.opcao] : undefined;
    if (!opcao) return estadoInvalido("CAMINHO_DIVERGENTE");
    ultimo = { comentario: opcao.comentario, segura: opcao.segura === true };
    if (opcao.proxima === null) {
      fim = true;
    } else {
      atual = opcao.proxima;
      passagens.set(atual, (passagens.get(atual) ?? 0) + 1);
    }
  }
  return {
    valido: true,
    motivo: null,
    fim,
    etapaAtual: fim ? null : atual,
    passagens: Object.fromEntries(passagens),
    ultimo,
  };
}

function sortear(n: number, aleatorio: (n: number) => number) {
  const j = aleatorio(n);
  if (!Number.isInteger(j) || j < 0 || j >= n) throw new RangeError("sorteio fora do intervalo");
  return j;
}

/** Fisher–Yates (o mesmo `embaralhar` da prova, regras.ts): embaralha uma cópia. */
function embaralhar<T>(itens: T[], aleatorio: (n: number) => number): T[] {
  const a = [...itens];
  for (let i = a.length - 1; i > 0; i--) {
    const j = sortear(i + 1, aleatorio);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A etapa como o aluno a vê: pergunta e opções SÓ com o texto e o índice original, em ordem embaralhada. Nunca
 * `segura`, `comentario` ou `proxima`. `aleatorio(n)` devolve um inteiro em [0, n); fora disso, RangeError. O
 * servidor passa o sorteio criptográfico (`inteiroAleatorioSeguro`), como na prova.
 */
export function etapaParaAluno(
  conteudo: unknown,
  etapaId: string,
  aleatorio: (n: number) => number
): { id: string; pergunta: string; opcoes: { indice: number; texto: string }[] } {
  const etapas: unknown[] =
    ehObjeto(conteudo) && Array.isArray(conteudo.etapas) ? conteudo.etapas : [];
  const etapa = etapas.find((e) => ehObjeto(e) && e.id === etapaId) as Qualquer;
  if (!etapa || !Array.isArray(etapa.opcoes)) throw new RangeError("etapa inexistente no roteiro");
  const ordem = embaralhar(
    etapa.opcoes.map((_: unknown, i: number) => i),
    aleatorio
  );
  return {
    id: etapa.id,
    pergunta: String(etapa.pergunta ?? ""),
    opcoes: ordem.map((i) => ({ indice: i, texto: String(etapa.opcoes[i]?.texto ?? "") })),
  };
}

/**
 * O que acontece com o clique do aluno na opção `opcao` (índice ORIGINAL) da etapa `etapaId`, dado o estado
 * refeito: recusa (`CASO_INVALIDO`, `CASO_ENCERRADO`, `CASO_FORA_DE_ORDEM`, `OPCAO_INVALIDA`) ou o comentário,
 * se foi segura, para onde leva e a visita atual àquela etapa (`passagem`).
 */
export function resultadoDaEscolha(
  conteudo: unknown,
  estado: EstadoDoCaso | null | undefined,
  etapaId: unknown,
  opcao: unknown
): ResultadoDaEscolha {
  if (!estado?.valido || validarCaso(conteudo).length)
    return { ok: false, codigo: "CASO_INVALIDO" };
  if (estado.fim) return { ok: false, codigo: "CASO_ENCERRADO" };
  if (etapaId !== estado.etapaAtual) return { ok: false, codigo: "CASO_FORA_DE_ORDEM" };
  const etapa = (conteudo as RoteiroDoCaso).etapas.find((e) => e.id === etapaId) as EtapaDoCaso;
  if (
    typeof opcao !== "number" ||
    !Number.isInteger(opcao) ||
    opcao < 0 ||
    opcao >= etapa.opcoes.length
  ) {
    return { ok: false, codigo: "OPCAO_INVALIDA" };
  }
  const escolhida = etapa.opcoes[opcao];
  const segura = escolhida.segura === true;
  return {
    ok: true,
    comentario: escolhida.comentario,
    segura,
    proxima: escolhida.proxima,
    fim: segura && escolhida.proxima === null,
    passagem: estado.passagens[etapaId as string],
  };
}

/** `detalhe` do evento como objeto: objeto, texto JSON (jsonb gravado como texto) ou nada. */
function detalheComoObjeto(detalhe: unknown): Record<string, Qualquer> | null {
  if (typeof detalhe === "string") {
    try {
      const lido = JSON.parse(detalhe);
      return ehObjeto(lido) ? lido : null;
    } catch {
      return null;
    }
  }
  return ehObjeto(detalhe) ? detalhe : null;
}

/**
 * As escolhas da rodada ATUAL, a partir dos eventos da trilha desta matrícula e aula, em ordem de gravação.
 * A rodada é a maior de `caso_reiniciado` (o roteiro mudou e o caminho gravado não conferia), ou 1. Só entram os
 * `caso_escolha` dessa rodada, com etapa (texto) e opção (inteiro); o resto é ignorado.
 */
export function escolhasDaRodada(
  eventos: { evento: string; detalhe: unknown }[] | null | undefined
): {
  rodada: number;
  escolhas: EscolhaDoCaso[];
} {
  const lista = Array.isArray(eventos) ? eventos : [];
  let rodada = 1;
  for (const e of lista) {
    if (e?.evento !== "caso_reiniciado") continue;
    const r = detalheComoObjeto(e.detalhe)?.rodada;
    if (Number.isInteger(r) && r > rodada) rodada = r;
  }
  const escolhas: EscolhaDoCaso[] = [];
  for (const e of lista) {
    if (e?.evento !== "caso_escolha") continue;
    const d = detalheComoObjeto(e.detalhe);
    if (!d || d.rodada !== rodada) continue;
    if (typeof d.etapa !== "string" || !Number.isInteger(d.opcao)) continue;
    escolhas.push({ etapa: d.etapa, opcao: d.opcao });
  }
  return { rodada, escolhas };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test supabase/functions/portal-funcionario/caso.test.ts`

Expected: PASS, `ℹ tests 11`, `ℹ pass 11`, `ℹ fail 0`.

- [ ] **Step 5: Checagens**

- `node --test "supabase/functions/**/*.test.ts"` → `ℹ tests 1571`, `ℹ fail 0` (1560 + 11).
- `npm test --workspace=apps/web` → 130 arquivos, 2469 testes, 0 falhas.
- `npx prettier --check supabase/functions/portal-funcionario/caso.ts supabase/functions/portal-funcionario/caso.test.ts`
  → sem avisos.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/portal-funcionario/caso.ts supabase/functions/portal-funcionario/caso.test.ts
git commit -F - -- supabase/functions/portal-funcionario/caso.ts supabase/functions/portal-funcionario/caso.test.ts <<'EOF'
feat(portal-funcionario): regra do roteiro do caso no servidor (caso.ts)

Quem decide a etapa atual, a escolha segura e o fim do caso é o servidor (spec 2026-10-14 §7 e §10): caso.ts tem a
mesma regra do front (validarCaso, estadoDoCaso, etapaParaAluno sem campos secretos, resultadoDaEscolha) e
escolhasDaRodada, que lê as escolhas da rodada atual na trilha (a rodada sobe com caso_reiniciado quando o RH muda o
roteiro e o caminho gravado deixa de conferir). O teste roda a mesma tabela de roteiros e caminhos contra as duas
cópias, como o requisitos.test.ts, e cobre o caso linear, o ramificado com recuperação, a etapa fora de ordem e a
rodada nova depois de o roteiro mudar.

Como testar: node --test supabase/functions/portal-funcionario/caso.test.ts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

---

### Task 4: Conclusão sem tempo, texto da tarefa, resumo do certificado (`regras.ts`)

**Files:**

- Modify: `supabase/functions/portal-funcionario/regras.ts:15-18` (cabeçalho), `:85-114` (`conclusaoDaAula`; logo
  depois entram `TIPOS_COM_ACAO_PROPRIA`, `NOTA_MINIMA_MODULO_PADRAO`, `notaMinimaDoModulo` e
  `atividadesDoCertificado`), `:1145-1147` (`refsDaAula`), `:1172-1199` (`aulasParaAluno`)
- Modify: `supabase/functions/portal-funcionario/regras.test.ts:3-65` (import), `:318-343` e `:366-372` (testes que
  exigiam o tempo de leitura) e depois de `:2681` (testes novos)
- NÃO muda: `supabase/functions/portal-funcionario/index.ts`. Depois desta task, o ramo `if (concluirCedo)` de
  `index.ts:1698-1705` (409 `TEMPO_LEITURA`) fica morto (`concluirCedo` é sempre `false`) e o `apostila_lida` de
  `index.ts:1731` ainda manda `minimo`; quem tira os dois é a Task 7.

**Interfaces:**

- Consumes: nada novo.
- Produces (C4): `conclusaoDaAula(p)` com a mesma forma (`{ ehVideo, minimoSeg, atingiuTempo, concluirCedo, faltamSeg,
  concluiu, podeConcluir }`): vídeo igual a hoje; `pdf`/`texto`/`tarefa`: `concluiu = !!jaConcluida || pediuConcluir
  === true`, `concluirCedo = false`, `podeConcluir = !concluiu`, `minimoSeg = faltamSeg = 0`, `atingiuTempo = true`;
  `questionario`/`caso` (e tipo desconhecido): `concluiu = !!jaConcluida`, `podeConcluir = false`,
  `atingiuTempo = false`. `TIPOS_COM_ACAO_PROPRIA = ["questionario", "caso"] as const`.
  `atividadesDoCertificado(aulas, curso) → { questionarios, casos, tarefas, nota_minima_modulo } | null`.
  `NOTA_MINIMA_MODULO_PADRAO = 80`, `notaMinimaDoModulo(curso) → number` (ver a NOTA 3: a Task 6 reexporta).
  `aulasParaAluno`: `conteudo_texto` para `texto` e `tarefa` liberadas; `questionario`/`caso` sem conteúdo nenhum.

Testes de hoje que exigem o tempo de leitura e são reescritos (Step 1): `regras.test.ts:318-327` ("apostila exige o
tempo completo, não 90%": esperava `concluirCedo` e `faltamSeg` 1), `:329-335` ("apostila com o tempo completo mas sem
clique fica aguardando o clique": esperava `atingiuTempo` só com o tempo), `:337-343` ("apostila com o tempo completo e
o clique conclui": esperava `faltamSeg` −10) e `:366-372` ("aula sem duração (0) nunca atinge o tempo", com `pdf`).
Continuam iguais e passando: `:287-316` (vídeo), `:345-351` (só o clique literal vale) e `:353-364` (já concluída).

- [ ] **Step 1: Escrever os testes (falham: as exportações novas não existem)**

Em `supabase/functions/portal-funcionario/regras.test.ts`, troque o `import` de `:3-65` inteiro por (entram
`NOTA_MINIMA_MODULO_PADRAO`, `TIPOS_COM_ACAO_PROPRIA`, `atividadesDoCertificado` e `notaMinimaDoModulo`):

```ts
import {
  COLUNAS_MATRICULA_ALUNO,
  COLUNAS_MATRICULA_PORTAL,
  ESCOPO_RECONFIRMAR_SENHA,
  EVENTO_CONCLUSAO_ADIADA,
  EVENTO_CONCLUSAO_REGISTRADA,
  EVENTO_PROVA_INICIADA,
  JANELA_RECONFIRMAR_SENHA_SEG,
  LOCAL_DO_CERTIFICADO,
  MAX_DETALHE,
  MAX_TENTATIVAS_RECONFIRMAR_SENHA,
  MSG_MUITAS_ACOES,
  MSG_SINAL_CONCORRENTE,
  MSG_TRILHA_INDISPONIVEL,
  NOTA_MINIMA_MODULO_PADRAO,
  PCT_CONCLUSAO,
  REPROVADO_VE_NOTA,
  TEMPO_MINIMO_PROVA_POR_QUESTAO_SEG,
  TIPOS_COM_ACAO_PROPRIA,
  TOLERANCIA_SEG,
  VOLUME_POR_ACAO,
  type AcaoComVolume,
  acaoDeVolumeDoEvento,
  atividadesDoCertificado,
  aulaLiberada,
  aulasParaAluno,
  bloqueioDaTrilhaNoCertificado,
  conclusaoDaAula,
  comRastroDeFalha,
  conclusoesAdiadas,
  corrigirProva,
  creditarTempo,
  cursoPublicado,
  datasDeConclusao,
  decisaoDeConclusao,
  dentroDoVolume,
  detalheDaProvaIniciada,
  fecharConclusaoAdiada,
  horaDeBrasilia,
  detalheLimitado,
  inicioDaProva,
  liberacaoDasAulas,
  liberacoesPorMatricula,
  logoAssinadoParaPdf,
  marcoDaTrilha,
  matriculaParaAluno,
  matriculasAbertasComTrilhaCompleta,
  matriculasComConclusaoPorRegistrar,
  notaMinimaDoModulo,
  ordemDaProva,
  periodoDoCertificado,
  proximaTentativaEm,
  provaDaOrdem,
  reconfirmarSenha,
  refsDasAulasLiberadas,
  renovacaoAPartirDe,
  respostaDaCorrecao,
  resultadoDoSinal,
  retomarConclusoes,
  situacaoDasTentativas,
  situacaoDaTrilha,
  sortearProva,
  textoDaModalidade,
  travaDoSinal,
  ultimaLiberacao,
  validarEnvio,
} from "./regras.ts";
```

Troque os três testes de `:318-343`, hoje:

```ts
test("conclusaoDaAula: apostila exige o tempo completo, não 90%", () => {
  for (const tipo of ["pdf", "texto"]) {
    const quase = conclusaoDaAula({ tipo, duracao: 120, segundos: 119, pediuConcluir: true });
    assert.equal(quase.minimoSeg, 120);
    assert.equal(quase.atingiuTempo, false);
    assert.equal(quase.concluiu, false);
    assert.equal(quase.faltamSeg, 1);
    assert.equal(quase.concluirCedo, true);
  }
});

test("conclusaoDaAula: apostila com o tempo completo mas sem clique fica aguardando o clique", () => {
  const c = conclusaoDaAula({ tipo: "pdf", duracao: 120, segundos: 120 });
  assert.equal(c.atingiuTempo, true);
  assert.equal(c.concluiu, false);
  assert.equal(c.podeConcluir, true);
  assert.equal(c.concluirCedo, false);
});

test("conclusaoDaAula: apostila com o tempo completo e o clique conclui", () => {
  const c = conclusaoDaAula({ tipo: "texto", duracao: 120, segundos: 130, pediuConcluir: true });
  assert.equal(c.concluiu, true);
  assert.equal(c.podeConcluir, false);
  assert.equal(c.concluirCedo, false);
  assert.equal(c.faltamSeg, -10);
});
```

por:

```ts
test("conclusaoDaAula: leitura (pdf, texto) e tarefa concluem com o clique, sem tempo mínimo (A5)", () => {
  for (const tipo of ["pdf", "texto", "tarefa"]) {
    for (const segundos of [0, 1, 119, 120, 5000]) {
      const c = conclusaoDaAula({ tipo, duracao: 120, segundos, pediuConcluir: true });
      assert.equal(c.ehVideo, false, `${tipo}/${segundos}`);
      assert.equal(c.concluiu, true, `${tipo}/${segundos}`);
      assert.equal(c.concluirCedo, false, `${tipo}/${segundos}`); // o 409 TEMPO_LEITURA deixa de existir
      assert.equal(c.podeConcluir, false, `${tipo}/${segundos}`);
      assert.equal(c.minimoSeg, 0, `${tipo}/${segundos}`);
      assert.equal(c.faltamSeg, 0, `${tipo}/${segundos}`);
      assert.equal(c.atingiuTempo, true, `${tipo}/${segundos}`);
    }
  }
});

test("conclusaoDaAula: leitura e tarefa sem o clique ficam aguardando o clique, com qualquer tempo", () => {
  for (const tipo of ["pdf", "texto", "tarefa"]) {
    for (const segundos of [0, 120, 999]) {
      const c = conclusaoDaAula({ tipo, duracao: 120, segundos });
      assert.equal(c.concluiu, false, `${tipo}/${segundos}`);
      assert.equal(c.podeConcluir, true, `${tipo}/${segundos}`);
      assert.equal(c.concluirCedo, false, `${tipo}/${segundos}`);
    }
  }
});

test("conclusaoDaAula: questionário e caso NUNCA concluem pelo progresso (só pelas ações próprias)", () => {
  assert.deepEqual([...TIPOS_COM_ACAO_PROPRIA], ["questionario", "caso"]);
  for (const tipo of TIPOS_COM_ACAO_PROPRIA) {
    for (const pediuConcluir of [true, undefined]) {
      const c = conclusaoDaAula({ tipo, duracao: 600, segundos: 600, pediuConcluir });
      assert.equal(c.ehVideo, false, tipo);
      assert.equal(c.concluiu, false, tipo);
      assert.equal(c.podeConcluir, false, tipo);
      assert.equal(c.concluirCedo, false, tipo);
      assert.equal(c.atingiuTempo, false, tipo);
    }
    // a conclusão gravada pela ação própria continua valendo quando o progresso volta a chegar
    const feita = conclusaoDaAula({ tipo, duracao: 600, segundos: 0, jaConcluida: true });
    assert.equal(feita.concluiu, true, tipo);
    assert.equal(feita.podeConcluir, false, tipo);
  }
});

test("conclusaoDaAula: tipo desconhecido não conclui pelo progresso (fecha na dúvida)", () => {
  const c = conclusaoDaAula({ tipo: "inventado", duracao: 60, segundos: 60, pediuConcluir: true });
  assert.equal(c.concluiu, false);
  assert.equal(c.podeConcluir, false);
  assert.equal(c.concluirCedo, false);
});
```

Troque o teste de `:366-372`, hoje:

```ts
test("conclusaoDaAula: aula sem duração (0) nunca atinge o tempo", () => {
  for (const tipo of ["video", "pdf"]) {
    const c = conclusaoDaAula({ tipo, duracao: 0, segundos: 0, pediuConcluir: true });
    assert.equal(c.atingiuTempo, false, tipo);
    assert.equal(c.concluiu, false, tipo);
  }
});
```

por:

```ts
test("conclusaoDaAula: vídeo sem duração (0) nunca atinge o tempo; a leitura conclui com o clique", () => {
  const video = conclusaoDaAula({ tipo: "video", duracao: 0, segundos: 0, pediuConcluir: true });
  assert.equal(video.atingiuTempo, false);
  assert.equal(video.concluiu, false);
  // A5: a leitura não depende do tempo cadastrado (o requisito CONTEUDO é que cobra a duração do RH)
  const pdf = conclusaoDaAula({ tipo: "pdf", duracao: 0, segundos: 0, pediuConcluir: true });
  assert.equal(pdf.concluiu, true);
});
```

Depois do teste que termina em `:2681` (o "aula sem tipo (legado) aparece como vídeo", logo antes de
`test("o evento da prova iniciada tem um nome só do servidor"` em `:2683`), acrescente (deixe uma linha em branco antes
e depois):

```ts
// ------------------------------------------------ atividades interativas (spec 2026-10-14)
const ATIVIDADES = [
  {
    ...aulaBase,
    id: "t1",
    ordem: 1,
    tipo: "tarefa",
    titulo: "T1",
    conteudo_texto: "Texto da tarefa T1",
  },
  {
    ...aulaBase,
    id: "q1",
    ordem: 2,
    tipo: "questionario",
    titulo: "Q1",
    // nada disto vai ao aluno: o questionário vem de questionario_abrir
    conteudo_texto: "Texto reservado Q1",
    youtube_id: "ID_YT_Q1",
    legenda_ref: "treinamentos/e/q1.vtt",
    duracao_seg: 900,
  },
  {
    ...aulaBase,
    id: "c1",
    ordem: 3,
    tipo: "caso",
    titulo: "C1",
    conteudo_texto: "Texto reservado C1",
    arquivo_ref: "treinamentos/e/c1.pdf",
    duracao_seg: 600,
  },
  {
    ...aulaBase,
    id: "t2",
    ordem: 4,
    tipo: "tarefa",
    titulo: "T2",
    conteudo_texto: "Texto da tarefa T2",
  },
];

test("aulasParaAluno: a tarefa liberada leva o texto (instruções); a bloqueada, não", () => {
  const [t1, , , t2] = aulasParaAluno({
    aulas: ATIVIDADES,
    progresso: progDe([]),
    urlDe: assinadaEm,
    tempoMinimoPadrao: 60,
  });
  assert.equal(t1.tipo, "tarefa");
  assert.equal(t1.liberada, true);
  assert.equal(t1.conteudo_texto, "Texto da tarefa T1");
  assert.equal(t1.duracao_seg, 60); // sem tempo cadastrado: o padrão, como as leituras
  assert.equal(t2.liberada, false);
  assert.equal(t2.conteudo_texto, null);
});

test("aulasParaAluno: questionário e caso nunca levam conteúdo, nem liberados (vem das ações próprias)", () => {
  const pedidos: (string | null | undefined)[] = [];
  const urlDe = (ref?: string | null) => {
    pedidos.push(ref);
    return assinadaEm(ref);
  };
  const todas = aulasParaAluno({
    aulas: ATIVIDADES,
    progresso: progDe(["t1", "q1", "c1"]),
    urlDe,
    tempoMinimoPadrao: 60,
  });
  for (const a of todas.filter((x) => x.tipo === "questionario" || x.tipo === "caso")) {
    assert.equal(a.liberada, true, a.id);
    assert.equal(a.conteudo_texto, null, a.id);
    assert.equal(a.youtube_id, null, a.id);
    assert.equal(a.video_url, null, a.id);
    assert.equal(a.legenda_url, null, a.id);
    assert.equal(a.arquivo_url, null, a.id);
  }
  // a lista continua completa para o aluno: título, tipo, duração e conclusão
  assert.deepEqual(
    todas.map((a) => [a.id, a.tipo, a.duracao_seg, a.concluida]),
    [
      ["t1", "tarefa", 60, true],
      ["q1", "questionario", 900, true],
      ["c1", "caso", 600, true],
      ["t2", "tarefa", 60, false],
    ]
  );
  const texto = JSON.stringify(todas);
  for (const reservado of ["Texto reservado", "ID_YT_Q1", "q1.vtt", "c1.pdf"]) {
    assert.equal(texto.includes(reservado), false, reservado);
  }
  // nenhuma referência delas chega ao assinador, e o `dados` não as assina
  assert.deepEqual(pedidos.filter(Boolean), []);
  assert.deepEqual(refsDasAulasLiberadas(ATIVIDADES, progDe(["t1", "q1", "c1"])), []);
});

test("notaMinimaDoModulo: 0 a 100 inteiro; ausente ou inválido vale 80", () => {
  assert.equal(NOTA_MINIMA_MODULO_PADRAO, 80);
  assert.equal(notaMinimaDoModulo({ nota_minima_modulo: 70 }), 70);
  assert.equal(notaMinimaDoModulo({ nota_minima_modulo: 0 }), 0);
  assert.equal(notaMinimaDoModulo({ nota_minima_modulo: 100 }), 100);
  assert.equal(notaMinimaDoModulo({ nota_minima_modulo: "90" }), 90);
  for (const ruim of [undefined, null, "", "  ", "abc", 101, -1, 79.5, true, {}]) {
    assert.equal(notaMinimaDoModulo({ nota_minima_modulo: ruim }), 80, String(ruim));
  }
  assert.equal(notaMinimaDoModulo(null), 80);
  assert.equal(notaMinimaDoModulo(undefined), 80);
});

test("atividadesDoCertificado: quantas de cada tipo (sem as apagadas) e a nota mínima; null sem atividades", () => {
  const aulas = [
    { tipo: "video" },
    { tipo: "pdf" },
    { tipo: "questionario" },
    { tipo: "questionario" },
    { tipo: "questionario", deleted_at: "2026-10-14T00:00:00Z" },
    { tipo: "caso" },
    { tipo: "caso" },
    { tipo: "caso" },
    { tipo: "tarefa" },
  ];
  assert.deepEqual(atividadesDoCertificado(aulas, { nota_minima_modulo: 75 }), {
    questionarios: 2,
    casos: 3,
    tarefas: 1,
    nota_minima_modulo: 75,
  });
  assert.deepEqual(atividadesDoCertificado([{ tipo: "tarefa" }], null), {
    questionarios: 0,
    casos: 0,
    tarefas: 1,
    nota_minima_modulo: 80,
  });
  // curso sem atividades (ou só com atividades apagadas): o certificado sai como hoje
  assert.equal(atividadesDoCertificado([{ tipo: "video" }, { tipo: "texto" }], {}), null);
  assert.equal(
    atividadesDoCertificado([{ tipo: "caso", deleted_at: "2026-10-14T00:00:00Z" }], {}),
    null
  );
  assert.equal(atividadesDoCertificado([], {}), null);
  assert.equal(atividadesDoCertificado(null, null), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test supabase/functions/portal-funcionario/regras.test.ts`

Expected: FAIL ao carregar, `SyntaxError: The requested module './regras.ts' does not provide an export named
'NOTA_MINIMA_MODULO_PADRAO'`, `ℹ fail 1`.

- [ ] **Step 3: Implementar em `regras.ts`**

3a. Cabeçalho, `regras.ts:15-18`, hoje:

```ts
 * de tentativas das reconfirmações de senha (`reconfirmarSenha`). A T31 acrescentou o limite de volume
 * de `evento` e `progresso` (`dentroDoVolume`), a trava otimista do sinal de progresso
 * (`travaDoSinal`, `resultadoDoSinal`) e a lista fixa de colunas da matrícula.
 */
```

passa a:

```ts
 * de tentativas das reconfirmações de senha (`reconfirmarSenha`). A T31 acrescentou o limite de volume
 * de `evento` e `progresso` (`dentroDoVolume`), a trava otimista do sinal de progresso
 * (`travaDoSinal`, `resultadoDoSinal`) e a lista fixa de colunas da matrícula.
 *
 * Atividades interativas (spec 2026-10-14): `conclusaoDaAula` não exige mais tempo de leitura (A5) e nunca
 * conclui questionário e caso (`TIPOS_COM_ACAO_PROPRIA`); `aulasParaAluno` manda o texto da tarefa; o resumo do
 * certificado é `atividadesDoCertificado` (A9), com `notaMinimaDoModulo`.
 */
```

3b. `conclusaoDaAula`, `regras.ts:85-114`, hoje:

```ts
/**
 * Conclusão de UMA aula. Vídeo conclui sozinho aos 90% (arredondado para cima);
 * apostila (pdf/texto) exige o tempo de leitura COMPLETO e o clique explícito em
 * "Marcar como lida" (`pediuConcluir === true`). Aula sem duração nunca atinge o
 * tempo. `concluirCedo` = clicou em concluir a apostila antes do tempo (o servidor
 * recusa); `podeConcluir` = apostila com o tempo completo, só falta o clique.
 */
export function conclusaoDaAula(p: {
  tipo?: string | null;
  duracao: number;
  segundos: number;
  jaConcluida?: boolean | null;
  pediuConcluir?: unknown;
}) {
  const ehVideo = !p.tipo || p.tipo === "video";
  const minimoSeg = ehVideo ? Math.ceil(p.duracao * PCT_CONCLUSAO) : p.duracao;
  const atingiuTempo = p.duracao > 0 && p.segundos >= minimoSeg;
  const pediu = p.pediuConcluir === true;
  const concluirCedo = pediu && !ehVideo && !atingiuTempo;
  const concluiu = !!p.jaConcluida || (ehVideo ? atingiuTempo : atingiuTempo && pediu);
  return {
    ehVideo,
    minimoSeg,
    atingiuTempo,
    concluirCedo,
    faltamSeg: p.duracao - p.segundos,
    concluiu,
    podeConcluir: !ehVideo && atingiuTempo && !concluiu,
  };
}
```

passa a (a função e, logo depois dela, as três exportações novas; o resto do arquivo continua a partir do comentário
de `corrigirProva`):

```ts
/**
 * Tipos de aula que concluem SÓ pelas ações próprias (`questionario_enviar` e `caso_concluir`, spec 2026-10-14
 * §7): o `progresso` deles credita o tempo de tela e nunca conclui, e o `dados` não manda conteúdo deles.
 */
export const TIPOS_COM_ACAO_PROPRIA = ["questionario", "caso"] as const;
/** Leituras e tarefa: concluem com o clique do aluno, sem tempo mínimo (A5). */
const TIPOS_DE_LEITURA = ["pdf", "texto", "tarefa"];
const temAcaoPropria = (tipo: unknown) =>
  (TIPOS_COM_ACAO_PROPRIA as readonly unknown[]).includes(tipo);

/**
 * Conclusão de UMA aula pelo `progresso`. Vídeo conclui sozinho aos 90% (arredondado para cima). Leitura (pdf,
 * texto) e tarefa concluem com o clique explícito ("Marcar como lida" / "Fiz a atividade", `pediuConcluir ===
 * true`), SEM tempo mínimo (A5, spec 2026-10-14 §4.1: o botão acende quando o aluno rola até o fim). Questionário e
 * caso nunca concluem por aqui (`TIPOS_COM_ACAO_PROPRIA`); tipo desconhecido também não (o CHECK do banco não o
 * deixa gravar: na dúvida, fecha). A forma da resposta é a de antes: fora do vídeo `minimoSeg` e `faltamSeg` são 0,
 * `concluirCedo` é sempre false (o 409 TEMPO_LEITURA deixa de existir) e `podeConcluir` = leitura que só espera o
 * clique.
 */
export function conclusaoDaAula(p: {
  tipo?: string | null;
  duracao: number;
  segundos: number;
  jaConcluida?: boolean | null;
  pediuConcluir?: unknown;
}) {
  const ehVideo = !p.tipo || p.tipo === "video";
  if (ehVideo) {
    const minimoSeg = Math.ceil(p.duracao * PCT_CONCLUSAO);
    const atingiuTempo = p.duracao > 0 && p.segundos >= minimoSeg;
    return {
      ehVideo,
      minimoSeg,
      atingiuTempo,
      concluirCedo: false,
      faltamSeg: p.duracao - p.segundos,
      concluiu: !!p.jaConcluida || atingiuTempo,
      podeConcluir: false,
    };
  }
  const leitura = TIPOS_DE_LEITURA.includes(p.tipo as string);
  const concluiu = !!p.jaConcluida || (leitura && p.pediuConcluir === true);
  return {
    ehVideo,
    minimoSeg: 0,
    atingiuTempo: leitura,
    concluirCedo: false,
    faltamSeg: 0,
    concluiu,
    podeConcluir: leitura && !concluiu,
  };
}

/** Nota mínima dos questionários dos módulos quando o curso não define uma (spec 2026-10-14, A2). */
export const NOTA_MINIMA_MODULO_PADRAO = 80;

/**
 * `treinamento_curso.nota_minima_modulo` como número inteiro de 0 a 100; ausente, vazio ou inválido vale 80. A
 * coluna (0170) é `not null default 80` com CHECK 0–100: o padrão só aparece em curso lido sem a coluna.
 */
export function notaMinimaDoModulo(
  curso: { nota_minima_modulo?: unknown } | null | undefined
): number {
  const valor = curso?.nota_minima_modulo;
  if (typeof valor !== "number" && !(typeof valor === "string" && valor.trim() !== "")) {
    return NOTA_MINIMA_MODULO_PADRAO;
  }
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : NOTA_MINIMA_MODULO_PADRAO;
}

/**
 * O resumo das atividades que o certificado imprime na frente (A9, spec 2026-10-14 §9): quantas aulas de cada tipo
 * de atividade o curso tem (as não apagadas; todas concluídas, porque a conclusão do curso exige) e a nota mínima
 * dos questionários. `null` quando o curso não tem nenhuma: o certificado sai exatamente como hoje.
 */
export function atividadesDoCertificado(
  aulas: { tipo?: string | null; deleted_at?: string | null }[] | null | undefined,
  curso: { nota_minima_modulo?: unknown } | null | undefined
): { questionarios: number; casos: number; tarefas: number; nota_minima_modulo: number } | null {
  const vivas = (aulas ?? []).filter((a) => a && !a.deleted_at);
  const quantas = (tipo: string) => vivas.filter((a) => a.tipo === tipo).length;
  const questionarios = quantas("questionario");
  const casos = quantas("caso");
  const tarefas = quantas("tarefa");
  if (questionarios + casos + tarefas === 0) return null;
  return { questionarios, casos, tarefas, nota_minima_modulo: notaMinimaDoModulo(curso) };
}
```

3c. `refsDaAula`, `regras.ts:1145-1147`, hoje:

```ts
/** Referências de arquivo que a aula pode ter, por tipo: vídeo próprio, legenda e apostila. */
function refsDaAula(a: AulaDoBanco) {
  return {
```

passa a:

```ts
/**
 * Referências de arquivo que a aula pode ter, por tipo: vídeo próprio, legenda e apostila. Questionário e caso não
 * têm arquivo para o aluno (o conteúdo vem das ações próprias): nada a assinar, mesmo com referência gravada.
 */
function refsDaAula(a: AulaDoBanco) {
  if (temAcaoPropria(a.tipo)) return { video: null, legenda: null, arquivo: null };
  return {
```

3d. `aulasParaAluno`, `regras.ts:1172-1199` (do comentário até a linha do `conteudo_texto`; o resto da função não
muda), hoje:

```ts
/**
 * Aulas de uma matrícula como o aluno as recebe em `dados`. A lista vem inteira (título, módulo,
 * tipo, duração, conclusão e se está liberada), mas só a aula LIBERADA leva `video_url`,
 * `legenda_url`, `arquivo_url`, `conteudo_texto` e `youtube_id`; nas bloqueadas esses campos vão
 * nulos e `urlDe` nem é consultado. `urlDe` devolve a URL assinada de uma referência (ou null).
 */
export function aulasParaAluno(p: {
  aulas: AulaDoBanco[];
  progresso: (aulaId: string) => ProgressoDaAula;
  urlDe: (ref?: string | null) => string | null;
  tempoMinimoPadrao: number;
}) {
  const liberacao = liberacaoDasAulas(p.aulas, p.progresso);
  return p.aulas.map((a, i) => {
    const { concluida, liberada } = liberacao[i];
    const refs = refsDaAula(a);
    return {
      id: a.id,
      ordem: a.ordem,
      modulo: a.modulo,
      tipo: a.tipo || "video",
      titulo: a.titulo,
      fonte: a.fonte || "youtube",
      youtube_id: liberada ? (a.youtube_id ?? null) : null,
      video_url: liberada ? p.urlDe(refs.video) : null,
      legenda_url: liberada ? p.urlDe(refs.legenda) : null,
      arquivo_url: liberada ? p.urlDe(refs.arquivo) : null,
      conteudo_texto: liberada && a.tipo === "texto" ? (a.conteudo_texto ?? null) : null,
```

passa a:

```ts
/**
 * Aulas de uma matrícula como o aluno as recebe em `dados`. A lista vem inteira (título, módulo,
 * tipo, duração, conclusão e se está liberada), mas só a aula LIBERADA leva `video_url`,
 * `legenda_url`, `arquivo_url`, `conteudo_texto` (texto e tarefa) e `youtube_id`; nas bloqueadas esses
 * campos vão nulos e `urlDe` nem é consultado. Questionário e caso nunca levam conteúdo, nem liberados
 * (vem das ações próprias). `urlDe` devolve a URL assinada de uma referência (ou null).
 */
export function aulasParaAluno(p: {
  aulas: AulaDoBanco[];
  progresso: (aulaId: string) => ProgressoDaAula;
  urlDe: (ref?: string | null) => string | null;
  tempoMinimoPadrao: number;
}) {
  const liberacao = liberacaoDasAulas(p.aulas, p.progresso);
  return p.aulas.map((a, i) => {
    const { concluida, liberada } = liberacao[i];
    const refs = refsDaAula(a);
    const mostra = liberada && !temAcaoPropria(a.tipo);
    return {
      id: a.id,
      ordem: a.ordem,
      modulo: a.modulo,
      tipo: a.tipo || "video",
      titulo: a.titulo,
      fonte: a.fonte || "youtube",
      youtube_id: mostra ? (a.youtube_id ?? null) : null,
      video_url: liberada ? p.urlDe(refs.video) : null,
      legenda_url: liberada ? p.urlDe(refs.legenda) : null,
      arquivo_url: liberada ? p.urlDe(refs.arquivo) : null,
      conteudo_texto:
        mostra && (a.tipo === "texto" || a.tipo === "tarefa") ? (a.conteudo_texto ?? null) : null,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test supabase/functions/portal-funcionario/regras.test.ts`

Expected: PASS, `ℹ tests 233`, `ℹ pass 233`, `ℹ fail 0` (eram 228: 4 testes antigos viraram 5 e há 4 novos).

- [ ] **Step 5: Checagens**

- `node --test "supabase/functions/**/*.test.ts"` → `ℹ tests 1576`, `ℹ fail 0` (1571 + 5).
- `npm test --workspace=apps/web` → 130 arquivos, 2469 testes, 0 falhas.
- `npx prettier --check supabase/functions/portal-funcionario/regras.ts supabase/functions/portal-funcionario/regras.test.ts`
  → sem avisos.
- `git diff --stat` → só `regras.ts` e `regras.test.ts` (o `index.ts` não muda nesta task).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/portal-funcionario/regras.ts supabase/functions/portal-funcionario/regras.test.ts
git commit -F - -- supabase/functions/portal-funcionario/regras.ts supabase/functions/portal-funcionario/regras.test.ts <<'EOF'
feat(portal-funcionario): conclusão sem tempo de leitura e resumo das atividades no certificado

A5 da spec 2026-10-14: leitura (PDF e texto) e tarefa concluem com o clique do aluno, sem o tempo mínimo de leitura
(o botão acende ao rolar até o fim, na tela); o vídeo continua nos 90%. Questionário e caso nunca concluem pelo
progresso (TIPOS_COM_ACAO_PROPRIA): só pelas ações próprias, que vêm nas próximas tasks; tipo desconhecido também não.
aulasParaAluno manda o texto da tarefa liberada e nenhum conteúdo de questionário e caso (nem legenda ou arquivo
assinados). atividadesDoCertificado conta questionários, casos e tarefas para a frase do certificado (A9), com a nota
mínima do módulo (notaMinimaDoModulo, padrão 80). Os testes que exigiam o tempo de leitura foram reescritos.
O index.ts não muda aqui: o ramo TEMPO_LEITURA fica morto até a Task 7 tirá-lo.

Como testar: node --test supabase/functions/portal-funcionario/regras.test.ts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

---

### Task 5: Requisitos por tipo (as duas cópias)

**Files:**

- Modify: `supabase/functions/portal-funcionario/requisitos.ts:21-22` (import), `:149-167` (`questaoValida` nova e o
  começo de `requisitosDoCurso`), `:176` (CONTEUDO), `:184` (QUESTOES)
- Modify: `apps/web/src/lib/ead-requisitos.js:2-3` (import), `:115-129`, `:138`, `:146` (os mesmos pontos)
- Modify: `supabase/functions/portal-funcionario/requisitos.test.ts:3-27` (import) e o fim do arquivo (depois de
  `:435`)
- Modify: `apps/web/src/lib/ead-requisitos.test.js:3-14` (import) e o fim do arquivo (depois de `:388`)

**Interfaces:**

- Consumes: `validarCaso` de `./caso.ts` (Task 3) no servidor e de `./ead-caso.js` (Task 2) no front (com a
  extensão: o teste do servidor importa o arquivo do front direto, sem o resolvedor do Vite).
- Produces (C4): `requisitosDoCurso({ curso, aulas, questoes, casos = [] })`; `questaoValida(q): boolean`. CONTEUDO por
  tipo (spec §8): vídeo, PDF e texto como hoje; `tarefa` exige texto; `questionario`, pelo menos 1 questão viva e
  válida da aula (`q.aula_id === aula.id`, aula com `id`); `caso`, um roteiro vivo da aula que passa em `validarCaso`;
  todas exigem `duracao_seg > 0`. QUESTOES conta só as questões vivas com `aula_id` vazio. LASTRO não muda (soma todas
  as aulas vivas, atividades inclusive).

Chamadores de hoje (`grep -rn "requisitosDoCurso(" apps/web/src supabase/functions --include=*.js --include=*.jsx
--include=*.ts`), todos continuam funcionando sem `casos` (padrão `[]`) e sem `aula_id` nas questões (vazio = prova
final, como todas as de hoje):

- `apps/web/src/components/seguranca/TreinamentosEadTab.jsx:543-548` (`requisitos`) e `:573-579`
  (`cursoMatriculavel`): passam `curso`, `aulas` e `todasQuestoes` do curso. Atualizados na Task 16 (passar `casos` e
  o `id` das aulas já vem da entidade).
- `supabase/functions/portal-funcionario/index.ts:1381-1385` (`dados`) e `:2136-2140` (`certificado`, que passa
  `Array.from({ length: nQuestoes }, () => ({}))`: objetos sem `aula_id` continuam contando para QUESTOES). Atualizados
  na Task 7 (ver a NOTA 5).
- Testes que chamam e não mudam: `apps/web/src/lib/ead-modalidade.test.js:119`, `ead-projeto.test.js:966`, `:1051`,
  `:1070`, `ead-requisitos.test.js` e `requisitos.test.ts` (os casos de hoje dão o mesmo resultado).

- [ ] **Step 1: Escrever os testes (falham: `questaoValida` e as regras por tipo não existem)**

Em `supabase/functions/portal-funcionario/requisitos.test.ts`, troque o `import` de `:3-27` por (entram
`questaoValida` e `questaoValida as questaoValidaFront`):

```ts
import {
  bloqueioDeEmissaoPorModalidade,
  cargaTeoricaDoCurso,
  duracaoParaProgresso,
  emiteCertificado,
  formatarHoras,
  modalidadeDoCurso,
  motivoSemCertificado,
  pendenciasParaEmitir,
  pendenciasParaPublicar,
  questaoValida,
  requisitosDoCurso,
  TEXTO_PDF_DO_PROJETO_DESATUALIZADO,
} from "./requisitos.ts";
import { marcaDoProjeto } from "./projeto.ts";
import {
  cargaTeoricaDoCurso as cargaTeoricaFront,
  emiteCertificado as emiteFront,
  formatarHoras as formatarHorasFront,
  modalidadeDoCurso as modalidadeFront,
  motivoSemCertificado as motivoFront,
  pendenciasParaEmitir as emitirFront,
  pendenciasParaPublicar as publicarFront,
  questaoValida as questaoValidaFront,
  requisitosDoCurso as requisitosFront,
  TEXTO_PDF_DO_PROJETO_DESATUALIZADO as textoPdfDesatualizadoFront,
} from "../../../apps/web/src/lib/ead-requisitos.js";
```

e acrescente no fim do arquivo (depois de `:435`; UUIDs sintéticos `00000000-0000-4000-8000-0000000000NN`):

```ts
// --------------------------------------------- atividades interativas (spec 2026-10-14 §8), nas duas cópias
const ROTEIRO_VALIDO = {
  contexto: "Contexto sintético.",
  etapas: [
    {
      id: "e1",
      pergunta: "Decisão sintética?",
      opcoes: [
        { texto: "Segura", comentario: "Comentário da segura", segura: true, proxima: null },
        { texto: "Insegura", comentario: "Comentário da insegura", segura: false, proxima: "e1" },
      ],
    },
  ],
  reflexao: "Reflexão sintética.",
};
const AULA_Q = "00000000-0000-4000-8000-000000000001";
const AULA_C = "00000000-0000-4000-8000-000000000002";
const AULA_T = "00000000-0000-4000-8000-000000000003";
const ATIVIDADES = [
  { id: AULA_Q, tipo: "questionario", duracao_seg: 900 },
  { id: AULA_C, tipo: "caso", duracao_seg: 600 },
  { id: AULA_T, tipo: "tarefa", conteudo_texto: "Instruções sintéticas", duracao_seg: 1200 },
];
const QUESTAO_DO_Q = {
  aula_id: AULA_Q,
  pergunta: "Pergunta sintética?",
  opcoes: ["Alternativa A", "Alternativa B", "Alternativa C"],
  correta: 1,
};
const PROVA_FINAL = Array.from({ length: 5 }, () => ({ aula_id: null }));
const CASOS_OK = [{ aula_id: AULA_C, conteudo: ROTEIRO_VALIDO }];
const COMPLETO = {
  curso,
  aulas: [...aulas, ...ATIVIDADES],
  questoes: [...PROVA_FINAL, QUESTAO_DO_Q],
  casos: CASOS_OK,
};
const trocarAtividade = (indice: number, mudanca: Record<string, unknown>) =>
  ATIVIDADES.map((a, i) => (i === indice ? { ...a, ...mudanca } : a));
const CASOS_DAS_ATIVIDADES: [string, Parameters<typeof requisitosDoCurso>[0], string[]][] = [
  ["completo", COMPLETO, []],
  [
    "tarefa sem texto",
    { ...COMPLETO, aulas: [...aulas, ...trocarAtividade(2, { conteudo_texto: "" })] },
    ["CONTEUDO"],
  ],
  [
    "tarefa só com espaços",
    { ...COMPLETO, aulas: [...aulas, ...trocarAtividade(2, { conteudo_texto: "   " })] },
    ["CONTEUDO"],
  ],
  ["questionário sem questões", { ...COMPLETO, questoes: PROVA_FINAL }, ["CONTEUDO"]],
  [
    "questionário só com questão inválida",
    {
      ...COMPLETO,
      questoes: [...PROVA_FINAL, { ...QUESTAO_DO_Q, opcoes: ["Só uma"], correta: 0 }],
    },
    ["CONTEUDO"],
  ],
  [
    "questão do questionário apagada",
    {
      ...COMPLETO,
      questoes: [...PROVA_FINAL, { ...QUESTAO_DO_Q, deleted_at: "2026-10-14T00:00:00Z" }],
    },
    ["CONTEUDO"],
  ],
  [
    "questão de outra aula",
    { ...COMPLETO, questoes: [...PROVA_FINAL, { ...QUESTAO_DO_Q, aula_id: AULA_T }] },
    ["CONTEUDO"],
  ],
  [
    "caso sem roteiro (chamador antigo, sem casos)",
    { ...COMPLETO, casos: undefined },
    ["CONTEUDO"],
  ],
  [
    "caso com roteiro inválido",
    { ...COMPLETO, casos: [{ aula_id: AULA_C, conteudo: { etapas: [] } }] },
    ["CONTEUDO"],
  ],
  [
    "roteiro apagado",
    { ...COMPLETO, casos: [{ ...CASOS_OK[0], deleted_at: "2026-10-14T00:00:00Z" }] },
    ["CONTEUDO"],
  ],
  [
    "atividade sem tempo previsto",
    { ...COMPLETO, aulas: [...aulas, ...trocarAtividade(0, { duracao_seg: 0 })] },
    ["CONTEUDO"],
  ],
  [
    "aula sem id não casa com questão sem aula",
    {
      ...COMPLETO,
      aulas: [...aulas, { tipo: "questionario", duracao_seg: 900 }],
      questoes: PROVA_FINAL,
    },
    ["CONTEUDO"],
  ],
  [
    "questões dos questionários não contam para a prova final",
    {
      ...COMPLETO,
      questoes: [
        ...PROVA_FINAL.slice(1),
        ...Array.from({ length: 5 }, (_, i) => ({ ...QUESTAO_DO_Q, pergunta: `Pergunta ${i}?` })),
      ],
    },
    ["QUESTOES"],
  ],
  [
    "LASTRO soma o tempo das atividades (2 h de carga, 1 h de aula + 45 min de atividades)",
    { ...COMPLETO, curso: { ...curso, carga_horaria_horas: 2 } },
    ["LASTRO"],
  ],
  [
    "LASTRO coberto com as atividades (2 h de carga, 1 h de aula + 1 h de atividades)",
    {
      ...COMPLETO,
      curso: { ...curso, carga_horaria_horas: 2 },
      aulas: [...aulas, ...trocarAtividade(2, { duracao_seg: 2100 })],
    },
    [],
  ],
  ["chamador antigo sem atividades e sem casos", { curso, aulas, questoes }, []],
];

test("atividades (spec §8): CONTEUDO por tipo, QUESTOES só da prova final e LASTRO com as atividades", () => {
  for (const [nome, dados, esperado] of CASOS_DAS_ATIVIDADES) {
    assert.deepEqual(pendencias(dados), esperado, nome);
    assert.deepEqual(requisitosDoCurso(dados), requisitosFront(dados), nome);
  }
});

test("questaoValida: pergunta, 2+ alternativas preenchidas e a correta entre elas (igual no front)", () => {
  const ok = { pergunta: "Pergunta?", opcoes: ["A", "B"], correta: 0 };
  assert.equal(questaoValida(ok), true);
  assert.equal(questaoValida({ ...ok, opcoes: ["A", "B", "C", "D"], correta: 3 }), true);
  const ruins: unknown[] = [
    null,
    {},
    "texto",
    { ...ok, pergunta: "  " },
    { ...ok, pergunta: 3 },
    { ...ok, opcoes: ["A"] },
    { ...ok, opcoes: ["A", " "] },
    { ...ok, opcoes: '["A","B"]' },
    { ...ok, opcoes: [1, 2] },
    { ...ok, correta: 2 },
    { ...ok, correta: -1 },
    { ...ok, correta: "1" },
    { ...ok, correta: 0.5 },
  ];
  for (const q of ruins) assert.equal(questaoValida(q), false, JSON.stringify(q));
  for (const q of [ok, ...ruins])
    assert.equal(questaoValida(q), questaoValidaFront(q), JSON.stringify(q));
});
```

Em `apps/web/src/lib/ead-requisitos.test.js`, troque o `import` de `:3-14` por:

```js
import {
  MODALIDADES,
  TEXTO_PDF_DO_PROJETO_DESATUALIZADO,
  cargaTeoricaDoCurso,
  emiteCertificado,
  modalidadeDoCurso,
  motivoSemCertificado,
  pendenciasParaEmitir,
  pendenciasParaPublicar,
  questaoValida,
  requisitosDoCurso,
  tempoObrigatorioSeg,
} from "./ead-requisitos";
```

e acrescente no fim do arquivo (depois de `:388`):

```js
describe("atividades interativas (spec 2026-10-14 §8)", () => {
  const ROTEIRO = {
    contexto: "Contexto sintético.",
    etapas: [
      {
        id: "e1",
        pergunta: "Decisão sintética?",
        opcoes: [
          { texto: "Segura", comentario: "Comentário da segura", segura: true, proxima: null },
          { texto: "Insegura", comentario: "Comentário da insegura", segura: false, proxima: "e1" },
        ],
      },
    ],
    reflexao: "Reflexão sintética.",
  };
  const AULA_Q = "00000000-0000-4000-8000-000000000011";
  const AULA_C = "00000000-0000-4000-8000-000000000012";
  const AULA_T = "00000000-0000-4000-8000-000000000013";
  const atividades = [
    { id: AULA_Q, tipo: "questionario", duracao_seg: 900 },
    { id: AULA_C, tipo: "caso", duracao_seg: 600 },
    { id: AULA_T, tipo: "tarefa", conteudo_texto: "Instruções sintéticas", duracao_seg: 1200 },
  ];
  const questaoDoQ = {
    aula_id: AULA_Q,
    pergunta: "Pergunta sintética?",
    opcoes: ["Alternativa A", "Alternativa B"],
    correta: 0,
  };
  const prova = Array.from({ length: 5 }, () => ({ aula_id: null }));
  const completo = {
    curso,
    aulas: [...aulas, ...atividades],
    questoes: [...prova, questaoDoQ],
    casos: [{ aula_id: AULA_C, conteudo: ROTEIRO }],
  };

  it("curso com questionário, caso e tarefa completos publica", () => {
    expect(pendencias(completo)).toEqual([]);
  });

  it("CONTEUDO: tarefa sem texto, questionário sem questão válida e caso sem roteiro válido travam", () => {
    const semTexto = atividades.map((a) => (a.id === AULA_T ? { ...a, conteudo_texto: " " } : a));
    expect(pendencias({ ...completo, aulas: [...aulas, ...semTexto] })).toEqual(["CONTEUDO"]);
    expect(pendencias({ ...completo, questoes: prova })).toEqual(["CONTEUDO"]);
    expect(
      pendencias({ ...completo, questoes: [...prova, { ...questaoDoQ, opcoes: ["Só uma"] }] })
    ).toEqual(["CONTEUDO"]);
    expect(pendencias({ ...completo, casos: undefined })).toEqual(["CONTEUDO"]);
    expect(
      pendencias({ ...completo, casos: [{ aula_id: AULA_C, conteudo: { etapas: [] } }] })
    ).toEqual(["CONTEUDO"]);
  });

  it("QUESTOES conta só as questões da prova final (aula_id vazio)", () => {
    const soDoQuestionario = Array.from({ length: 6 }, (_, i) => ({
      ...questaoDoQ,
      pergunta: `Pergunta ${i}?`,
    }));
    expect(pendencias({ ...completo, questoes: soDoQuestionario })).toEqual(["QUESTOES"]);
  });

  it("questaoValida: pergunta, 2+ alternativas preenchidas e a correta entre elas", () => {
    expect(questaoValida(questaoDoQ)).toBe(true);
    expect(questaoValida({ ...questaoDoQ, correta: 2 })).toBe(false);
    expect(questaoValida({ ...questaoDoQ, opcoes: ["A", ""] })).toBe(false);
    expect(questaoValida({ ...questaoDoQ, pergunta: "" })).toBe(false);
    expect(questaoValida(null)).toBe(false);
  });

  it("o tempo das atividades soma no lastro (tempo declarado, A5)", () => {
    expect(tempoObrigatorioSeg(completo.aulas)).toBe(3600 + 900 + 600 + 1200);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test supabase/functions/portal-funcionario/requisitos.test.ts`

Expected: FAIL ao carregar, `SyntaxError: The requested module './requisitos.ts' does not provide an export named
'questaoValida'`.

Run: `cd apps/web; npx vitest run src/lib/ead-requisitos.test.js`

Expected: FAIL, `Tests 3 failed | 34 passed (37)`: "curso com questionário, caso e tarefa completos publica" (dá
`["CONTEUDO"]`), "QUESTOES conta só as questões da prova final" (dá `["CONTEUDO"]`) e "questaoValida..." (`TypeError:
(0 , questaoValida) is not a function`).

- [ ] **Step 3: Implementar no servidor (`requisitos.ts`)**

3a. Import, `requisitos.ts:21-22`, hoje:

```ts
import { normalizarTelefoneBR } from "../_shared/whatsapp-envio.ts";
import { estadoDoPdfDoProjeto } from "./projeto.ts";
```

passa a:

```ts
import { normalizarTelefoneBR } from "../_shared/whatsapp-envio.ts";
import { validarCaso } from "./caso.ts";
import { estadoDoPdfDoProjeto } from "./projeto.ts";
```

3b. `requisitos.ts:149-167` (o começo de `requisitosDoCurso`, até o fim da função `arquivo`), hoje:

```ts
export function requisitosDoCurso({
  curso = {},
  aulas = [],
  questoes = [],
}: { curso?: any; aulas?: any[]; questoes?: any[] } = {}): Requisito[] {
  const pdfDoProjeto = estadoDoPdfDoProjeto(curso);
  const ativas = aulas.filter((a) => !a.deleted_at);
  const carga = Number(curso.carga_horaria_horas) || 0;
  const lastro = tempoObrigatorioSeg(ativas);
  // o conteúdo cobre a carga TEÓRICA no semipresencial (T12, C3) e a total nos outros
  const cargaTeorica = cargaTeoricaDoCurso(curso);
  const arquivo = (a: any) =>
    a.tipo === "pdf"
      ? a.arquivo_ref
      : a.tipo === "texto"
        ? a.conteudo_texto?.trim()
        : a.fonte === "upload"
          ? a.video_ref
          : a.youtube_id;
```

passa a (a `questaoValida` nova, o comentário e o começo da função com `casos` e `temConteudo` no lugar de `arquivo`):

```ts
/**
 * Questão utilizável (prova final ou questionário do módulo): pergunta preenchida, 2 ou mais alternativas, todas
 * texto não vazio, e a correta (inteiro) entre elas. Mesma regra do editor (lib/ead-questao.js).
 */
export function questaoValida(q: any): boolean {
  if (!q || typeof q !== "object") return false;
  const opcoes = q.opcoes;
  return (
    typeof q.pergunta === "string" &&
    q.pergunta.trim() !== "" &&
    Array.isArray(opcoes) &&
    opcoes.length >= 2 &&
    opcoes.every((o: unknown) => typeof o === "string" && o.trim() !== "") &&
    Number.isInteger(q.correta) &&
    q.correta >= 0 &&
    q.correta < opcoes.length
  );
}
/**
 * Atividades interativas (spec 2026-10-14 §8): `questoes` são TODAS as do curso, cada uma com `aula_id` (vazio =
 * prova final; preenchido = questão do questionário daquela aula), e `casos` são os roteiros
 * (`treinamento_caso`: `aula_id`, `conteudo`, `deleted_at`). QUESTOES conta só as da prova final. CONTEUDO, por
 * tipo: vídeo, PDF e texto como antes; tarefa exige o texto; questionário, pelo menos 1 questão válida da aula;
 * caso, um roteiro que passa em `validarCaso`. Toda aula exige a duração (o tempo previsto). Quem ainda não passa
 * `casos` (padrão []) segue igual enquanto o curso não tiver aula de caso.
 */
export function requisitosDoCurso({
  curso = {},
  aulas = [],
  questoes = [],
  casos = [],
}: { curso?: any; aulas?: any[]; questoes?: any[]; casos?: any[] } = {}): Requisito[] {
  const pdfDoProjeto = estadoDoPdfDoProjeto(curso);
  const ativas = aulas.filter((a) => !a.deleted_at);
  const carga = Number(curso.carga_horaria_horas) || 0;
  const lastro = tempoObrigatorioSeg(ativas);
  // o conteúdo cobre a carga TEÓRICA no semipresencial (T12, C3) e a total nos outros
  const cargaTeorica = cargaTeoricaDoCurso(curso);
  const questoesVivas = questoes.filter((q) => q && !q.deleted_at);
  const casosVivos = casos.filter((c) => c && !c.deleted_at);
  // a aula sem id (leitura que não trouxe a coluna) nunca casa com questão ou roteiro
  const daAula = (x: any, a: any) => a.id != null && x.aula_id === a.id;
  const temConteudo = (a: any): unknown => {
    switch (a.tipo) {
      case "pdf":
        return a.arquivo_ref;
      case "texto":
      case "tarefa":
        return a.conteudo_texto?.trim();
      case "questionario":
        return questoesVivas.some((q) => daAula(q, a) && questaoValida(q));
      case "caso": {
        const roteiro = casosVivos.find((c) => daAula(c, a));
        return !!roteiro && validarCaso(roteiro.conteudo).length === 0;
      }
      default:
        return a.fonte === "upload" ? a.video_ref : a.youtube_id;
    }
  };
```

3c. CONTEUDO, `requisitos.ts:176`, hoje:

```ts
      ativas.length > 0 && ativas.every((a) => arquivo(a) && Number(a.duracao_seg) > 0),
```

passa a:

```ts
      ativas.length > 0 && ativas.every((a) => temConteudo(a) && Number(a.duracao_seg) > 0),
```

3d. QUESTOES, `requisitos.ts:184`, hoje:

```ts
            questoes.filter((q) => !q.deleted_at).length >= MIN_QUESTOES,
```

passa a:

```ts
            questoesVivas.filter((q) => !q.aula_id).length >= MIN_QUESTOES,
```

- [ ] **Step 4: Implementar no front (`ead-requisitos.js`), igual**

4a. Import, `ead-requisitos.js:2-3`, hoje:

```js
import { normalizarTelefoneBR } from "./telefone.js";
import { estadoDoPdfDoProjeto } from "./ead-projeto-marca.js";
```

passa a:

```js
import { normalizarTelefoneBR } from "./telefone.js";
import { estadoDoPdfDoProjeto } from "./ead-projeto-marca.js";
import { validarCaso } from "./ead-caso.js";
```

4b. `ead-requisitos.js:115-129`, hoje:

```js
export function requisitosDoCurso({ curso = {}, aulas = [], questoes = [] } = {}) {
  const pdfDoProjeto = estadoDoPdfDoProjeto(curso);
  const ativas = aulas.filter((a) => !a.deleted_at);
  const carga = Number(curso.carga_horaria_horas) || 0;
  const lastro = tempoObrigatorioSeg(ativas);
  // o conteúdo cobre a carga TEÓRICA no semipresencial (T12, C3) e a total nos outros
  const cargaTeorica = cargaTeoricaDoCurso(curso);
  const arquivo = (a) =>
    a.tipo === "pdf"
      ? a.arquivo_ref
      : a.tipo === "texto"
        ? a.conteudo_texto?.trim()
        : a.fonte === "upload"
          ? a.video_ref
          : a.youtube_id;
```

passa a:

```js
/**
 * Questão utilizável (prova final ou questionário do módulo): pergunta preenchida, 2 ou mais alternativas, todas
 * texto não vazio, e a correta (inteiro) entre elas. Mesma regra do editor (lib/ead-questao.js).
 */
export function questaoValida(q) {
  if (!q || typeof q !== "object") return false;
  const opcoes = q.opcoes;
  return (
    typeof q.pergunta === "string" &&
    q.pergunta.trim() !== "" &&
    Array.isArray(opcoes) &&
    opcoes.length >= 2 &&
    opcoes.every((o) => typeof o === "string" && o.trim() !== "") &&
    Number.isInteger(q.correta) &&
    q.correta >= 0 &&
    q.correta < opcoes.length
  );
}
/**
 * Atividades interativas (spec 2026-10-14 §8): `questoes` são TODAS as do curso, cada uma com `aula_id` (vazio =
 * prova final; preenchido = questão do questionário daquela aula), e `casos` são os roteiros
 * (`treinamento_caso`: `aula_id`, `conteudo`, `deleted_at`). QUESTOES conta só as da prova final. CONTEUDO, por
 * tipo: vídeo, PDF e texto como antes; tarefa exige o texto; questionário, pelo menos 1 questão válida da aula;
 * caso, um roteiro que passa em `validarCaso`. Toda aula exige a duração (o tempo previsto). Quem ainda não passa
 * `casos` (padrão []) segue igual enquanto o curso não tiver aula de caso.
 */
export function requisitosDoCurso({ curso = {}, aulas = [], questoes = [], casos = [] } = {}) {
  const pdfDoProjeto = estadoDoPdfDoProjeto(curso);
  const ativas = aulas.filter((a) => !a.deleted_at);
  const carga = Number(curso.carga_horaria_horas) || 0;
  const lastro = tempoObrigatorioSeg(ativas);
  // o conteúdo cobre a carga TEÓRICA no semipresencial (T12, C3) e a total nos outros
  const cargaTeorica = cargaTeoricaDoCurso(curso);
  const questoesVivas = questoes.filter((q) => q && !q.deleted_at);
  const casosVivos = casos.filter((c) => c && !c.deleted_at);
  // a aula sem id (leitura que não trouxe a coluna) nunca casa com questão ou roteiro
  const daAula = (x, a) => a.id != null && x.aula_id === a.id;
  const temConteudo = (a) => {
    switch (a.tipo) {
      case "pdf":
        return a.arquivo_ref;
      case "texto":
      case "tarefa":
        return a.conteudo_texto?.trim();
      case "questionario":
        return questoesVivas.some((q) => daAula(q, a) && questaoValida(q));
      case "caso": {
        const roteiro = casosVivos.find((c) => daAula(c, a));
        return !!roteiro && validarCaso(roteiro.conteudo).length === 0;
      }
      default:
        return a.fonte === "upload" ? a.video_ref : a.youtube_id;
    }
  };
```

4c. CONTEUDO, `ead-requisitos.js:138`, hoje:

```js
      ativas.length > 0 && ativas.every((a) => arquivo(a) && Number(a.duracao_seg) > 0),
```

passa a:

```js
      ativas.length > 0 && ativas.every((a) => temConteudo(a) && Number(a.duracao_seg) > 0),
```

4d. QUESTOES, `ead-requisitos.js:146`, hoje:

```js
            questoes.filter((q) => !q.deleted_at).length >= MIN_QUESTOES,
```

passa a:

```js
            questoesVivas.filter((q) => !q.aula_id).length >= MIN_QUESTOES,
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test supabase/functions/portal-funcionario/requisitos.test.ts supabase/functions/portal-funcionario/regras.test.ts`

Expected: PASS, `ℹ tests 245`, `ℹ pass 245`, `ℹ fail 0` (12 de `requisitos.test.ts`, 233 de `regras.test.ts`, que
importa `requisitos.ts`).

Run: `cd apps/web; npx vitest run src/lib/ead-requisitos.test.js src/lib/ead-modalidade.test.js src/lib/ead-projeto.test.js`

Expected: PASS, `Test Files 3 passed (3)`, `Tests 127 passed (127)` (37 + os de hoje dos outros dois).

- [ ] **Step 6: Checagens**

- `node --test "supabase/functions/**/*.test.ts"` → `ℹ tests 1578`, `ℹ fail 0` (1576 + 2).
- `npm test --workspace=apps/web` → 130 arquivos, 2474 testes, 0 falhas (2469 + 5).
- `npx prettier --check supabase/functions/portal-funcionario/requisitos.ts supabase/functions/portal-funcionario/requisitos.test.ts apps/web/src/lib/ead-requisitos.js apps/web/src/lib/ead-requisitos.test.js`
  → sem avisos.
- `npm run lint` → sem erros; `npm run build` → termina sem erro (o `TreinamentosEadTab.jsx` importa
  `ead-requisitos.js`, que agora importa `ead-caso.js`).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/portal-funcionario/requisitos.ts supabase/functions/portal-funcionario/requisitos.test.ts apps/web/src/lib/ead-requisitos.js apps/web/src/lib/ead-requisitos.test.js
git commit -F - -- supabase/functions/portal-funcionario/requisitos.ts supabase/functions/portal-funcionario/requisitos.test.ts apps/web/src/lib/ead-requisitos.js apps/web/src/lib/ead-requisitos.test.js <<'EOF'
feat(ead): requisitos por tipo de atividade e prova final só com as questões sem aula

Spec 2026-10-14 §8: o requisito CONTEUDO passa a conferir cada tipo novo (tarefa com texto; questionário com pelo
menos uma questão válida da aula; caso com roteiro que passa em validarCaso), sempre com o tempo previsto, e QUESTOES
(mínimo de 5 da prova final) conta só as questões sem aula_id, para as dos questionários não inflarem a prova. O
LASTRO continua somando todas as aulas, atividades inclusive (tempo declarado, A5). requisitosDoCurso recebe os
roteiros em `casos` (padrão []) e exporta questaoValida; as duas cópias (servidor e front) são conferidas pelo mesmo
teste. Os chamadores de hoje seguem iguais; os da tela do RH e do index.ts passam casos nas Tasks 7 e 16.

Como testar: node --test supabase/functions/portal-funcionario/requisitos.test.ts e
cd apps/web; npx vitest run src/lib/ead-requisitos.test.js

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Questionário no servidor (`questionario.ts`)

**Files:**

- Create: `supabase/functions/portal-funcionario/questionario.ts`
- Create: `supabase/functions/portal-funcionario/questionario.test.ts`

**Interfaces:**

- Consumes:
  - `trilhaDoCurso(supabase, cursoId, matriculaId, empresaId) → { aulas, feitas, concluidaEm, lida }` e
    `causa(erro)` (`conclusao.ts`).
  - `aulaLiberada(trilha, aulaId)`, `MSG_TRILHA_INDISPONIVEL` (`regras.ts`); `type RecusaDaProva` (`prova.ts`).
  - Só nos testes: `sortearProva`, `detalheDaProvaIniciada`, `inicioDaProva`, `validarEnvio`, `corrigirProva`
    (`regras.ts`).
  - Banco (C1): `treinamento_questao.aula_id`, `treinamento_curso.nota_minima_modulo`,
    `treinamento_questionario_tentativa (matricula_id, aula_id, empresa_id, numero, nota, aprovada)`.
- Produces (C4 + extensões da nota 2):

```ts
export const NOTA_MINIMA_MODULO_PADRAO = 80;
export const EVENTO_QUESTIONARIO_INICIADO = "questionario_iniciado";
export const EVENTO_QUESTIONARIO_ENVIO = "questionario_envio";
export const MSG_QUESTIONARIO_INDISPONIVEL: string; // 503
export const MSG_QUESTIONARIO_VAZIO = "Este questionário ainda não tem questões — avise o RH";
export type AulaDaTrilha = { id: string; ordem?: unknown; tipo?: string | null; duracao_seg?: unknown };
export function notaMinimaDoModulo(curso: { nota_minima_modulo?: unknown } | null | undefined): number;
export async function aulaDaAtividade(supabase, mat, aulaId: unknown, empresaId: string,
  tipo: "questionario" | "caso"): Promise<{ falha: RecusaDaProva } | { falha: null; aula: AulaDaTrilha; concluida: boolean }>;
export async function prepararQuestionario(supabase, mat, aulaId: string, empresaId: string, comGabarito: boolean):
  Promise<{ falha: RecusaDaProva } | { falha: null; aula: AulaDaTrilha; questoes: any[]; curso: any; usadas: number;
    concluida: boolean; melhorNota: number | null }>;
export function mensagemDoEnvio(codigo: string, mensagemPadrao: string): string;
export function revisaoDoQuestionario(questoes, acertou): { questao_id; acertou; resposta_correta; comentario }[];
export function respostaDoQuestionario(p): { resultado; aprovada; nota; acertos; total; nota_minima; tentativa;
  aula_concluida; curso_concluido; revisao };
```

- [ ] **Step 1: Escrever o teste que falha**

Crie `supabase/functions/portal-funcionario/questionario.test.ts`:

```ts
// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/questionario.test.ts
//
// Questionário do módulo (A2, spec 2026-10-14 §4.2). `prepararQuestionario` recebe o banco por parâmetro; aqui ele é
// um banco de teste que devolve, por tabela, o que cada cenário pede (inclusive `error`, como o postgrest-js faz: ele
// não lança em falha de rede ou de banco). O sorteio, a validação do envio e a correção são os da prova (regras.ts);
// o teste confere que valem com as questões da AULA, a nota mínima do módulo e sem tempo mínimo. Dados sintéticos:
// ids, textos e datas inventados.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aulaDaAtividade,
  MSG_QUESTIONARIO_INDISPONIVEL,
  MSG_QUESTIONARIO_VAZIO,
  mensagemDoEnvio,
  NOTA_MINIMA_MODULO_PADRAO,
  notaMinimaDoModulo,
  prepararQuestionario,
  respostaDoQuestionario,
  revisaoDoQuestionario,
} from "./questionario.ts";
import {
  corrigirProva,
  detalheDaProvaIniciada,
  inicioDaProva,
  MSG_TRILHA_INDISPONIVEL,
  sortearProva,
  validarEnvio,
} from "./regras.ts";

type Resposta = { data: unknown; error?: unknown };
type Chamada = { tabela: string; filtros: unknown[][] };

/** Banco de teste: `cenario[tabela]` dá a resposta da leitura (uma lista dá uma resposta por chamada). */
function bancoDeTeste(cenario: Record<string, Resposta | Resposta[]>) {
  const chamadas: Chamada[] = [];
  const usadas = new Map<string, number>();
  const proxima = (tabela: string): Resposta => {
    const r = cenario[tabela];
    if (!Array.isArray(r)) return r ?? { data: [], error: null };
    const i = usadas.get(tabela) ?? 0;
    usadas.set(tabela, i + 1);
    return r[Math.min(i, r.length - 1)];
  };
  const db = {
    from(tabela: string) {
      const chamada: Chamada = { tabela, filtros: [] };
      chamadas.push(chamada);
      const anotar =
        (nome: string) =>
        (...args: unknown[]) => (chamada.filtros.push([nome, ...args]), consulta);
      const consulta: Record<string, unknown> = {
        select: anotar("select"),
        eq: anotar("eq"),
        in: anotar("in"),
        is: anotar("is"),
        not: anotar("not"),
        order: anotar("order"),
        limit: anotar("limit"),
        maybeSingle: anotar("maybeSingle"),
        insert: anotar("insert"),
        update: anotar("update"),
        upsert: anotar("upsert"),
        then: (resolve: (v: unknown) => unknown, rejeitar?: (e: unknown) => unknown) =>
          Promise.resolve()
            .then(() => proxima(tabela))
            .then(resolve, rejeitar),
      };
      return consulta;
    },
  };
  const de = (tabela: string) => chamadas.filter((c) => c.tabela === tabela);
  const escritas = () =>
    chamadas.filter((c) =>
      c.filtros.some((f) => ["insert", "update", "upsert"].includes(String(f[0])))
    );
  return { db, chamadas, de, escritas };
}

const tem = (c: Chamada | undefined, filtro: unknown[]) =>
  !!c?.filtros.some((f) => JSON.stringify(f) === JSON.stringify(filtro));

/** Roda `fn` com o console.error capturado (as causas que a função manda ao log). */
async function comLog<T>(fn: () => Promise<T>): Promise<{ valor: T; erros: unknown[][] }> {
  const original = console.error;
  const erros: unknown[][] = [];
  console.error = (...a: unknown[]) => void erros.push(a);
  try {
    return { valor: await fn(), erros };
  } finally {
    console.error = original;
  }
}

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const CURSO_ID = "00000000-0000-4000-8000-000000000002";
const MAT = {
  id: "00000000-0000-4000-8000-000000000003",
  curso_id: CURSO_ID,
  status: "em_andamento",
};
const AULA_VIDEO = "00000000-0000-4000-8000-000000000010";
const AULA_QUEST = "00000000-0000-4000-8000-000000000011";
const AULA_CASO = "00000000-0000-4000-8000-000000000012";
const AULA_DE_OUTRO_CURSO = "00000000-0000-4000-8000-000000000019";
const FALHA = { message: "conexão com o banco caiu" };
const ok = (data: unknown): Resposta => ({ data, error: null });
const erro: Resposta = { data: null, error: FALHA };
// 14h (UTC) de 14/10/2026 = 11h em Brasília
const AGORA = Date.parse("2026-10-14T14:00:00.000Z");

const OPCOES = ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"];
/** As 8 questões do questionário, com gabarito: a certa da questão i é a de índice i % 4. */
const QUESTOES = Array.from({ length: 8 }, (_, i) => ({
  id: `00000000-0000-4000-8000-0000000000${21 + i}`,
  ordem: i + 1,
  pergunta: `Pergunta sintética ${i + 1}`,
  opcoes: OPCOES,
  correta: i % 4,
  comentario: `Comentário sintético ${i + 1}`,
}));

const AULAS = ok([
  { id: AULA_VIDEO, ordem: 1, tipo: "video", duracao_seg: 600 },
  { id: AULA_QUEST, ordem: 2, tipo: "questionario", duracao_seg: 900 },
  { id: AULA_CASO, ordem: 3, tipo: "caso", duracao_seg: 600 },
]);
const feita = (aulaId: string, hora: string) => ({
  aula_id: aulaId,
  concluida: true,
  concluida_em: `2026-10-14T${hora}:00.000Z`,
});
const SO_O_VIDEO = ok([feita(AULA_VIDEO, "12:00")]);
const VIDEO_E_QUESTIONARIO = ok([feita(AULA_VIDEO, "12:00"), feita(AULA_QUEST, "13:00")]);

/** O cenário padrão: vídeo feito, questionário liberado com 8 questões, curso com 80, nenhuma tentativa. */
const cenario = (troca: Record<string, Resposta | Resposta[]> = {}) => ({
  treinamento_aula: AULAS,
  treinamento_progresso: SO_O_VIDEO,
  treinamento_questao: ok(QUESTOES),
  treinamento_curso: ok({ nota_minima_modulo: 80 }),
  treinamento_questionario_tentativa: ok([]),
  ...troca,
});

async function preparar(
  troca: Record<string, Resposta | Resposta[]> = {},
  { comGabarito = false, aulaId = AULA_QUEST }: { comGabarito?: boolean; aulaId?: string } = {}
) {
  const banco = bancoDeTeste(cenario(troca));
  const { valor, erros } = await comLog(() =>
    prepararQuestionario(banco.db, MAT, aulaId, EMPRESA, comGabarito)
  );
  return { preparo: valor, erros, ...banco };
}

/** Marca a certa em todas, menos nas `erros` primeiras (nelas, a alternativa seguinte). */
const marcar = (erros: number) =>
  QUESTOES.map((q, i) => ({ questao_id: q.id, resposta: i < erros ? (q.correta + 1) % 4 : q.correta }));

// ------------------------------------------------------------------------------- nota mínima do módulo

test("notaMinimaDoModulo: a do curso (inteiro de 0 a 100); ausente ou inválida vale 80", () => {
  assert.equal(NOTA_MINIMA_MODULO_PADRAO, 80);
  for (const n of [0, 70, 80, 100]) assert.equal(notaMinimaDoModulo({ nota_minima_modulo: n }), n);
  assert.equal(notaMinimaDoModulo({ nota_minima_modulo: "90" }), 90);
  for (const v of [null, undefined, -1, 101, 79.5, "abc", "", Number.NaN, {}]) {
    assert.equal(notaMinimaDoModulo({ nota_minima_modulo: v }), 80, String(v));
  }
  assert.equal(notaMinimaDoModulo(null), 80);
  assert.equal(notaMinimaDoModulo({}), 80);
});

// ------------------------------------------------------------------------------- preparo (banco injetado)

test("prepararQuestionario: aula liberada do tipo certo devolve as questões DA AULA, o curso e as tentativas (só a empresa da sessão)", async () => {
  const { preparo, de, erros, escritas } = await preparar();
  assert.equal(preparo.falha, null);
  if (preparo.falha !== null) return;
  assert.equal(preparo.aula.id, AULA_QUEST);
  assert.equal(preparo.questoes.length, 8);
  assert.equal(preparo.curso.nota_minima_modulo, 80);
  assert.equal(preparo.usadas, 0);
  assert.equal(preparo.concluida, false);
  assert.equal(preparo.melhorNota, null);
  assert.deepEqual(erros, []);
  const q = de("treinamento_questao")[0];
  for (const filtro of [
    ["eq", "aula_id", AULA_QUEST],
    ["eq", "curso_id", CURSO_ID],
    ["eq", "empresa_id", EMPRESA],
    ["is", "deleted_at", null],
  ]) {
    assert.ok(tem(q, filtro), JSON.stringify(filtro));
  }
  assert.ok(tem(de("treinamento_curso")[0], ["eq", "empresa_id", EMPRESA]));
  const t = de("treinamento_questionario_tentativa")[0];
  assert.ok(tem(t, ["eq", "matricula_id", MAT.id]));
  assert.ok(tem(t, ["eq", "aula_id", AULA_QUEST]));
  assert.ok(tem(t, ["eq", "empresa_id", EMPRESA]));
  // preparar não grava nada
  assert.equal(escritas().length, 0);
});

test("prepararQuestionario: abrir nunca lê o gabarito; só a correção carrega `correta` e `comentario`", async () => {
  const sem = await preparar({}, { comGabarito: false });
  const com = await preparar({}, { comGabarito: true });
  const colunas = (de: (t: string) => Chamada[]) =>
    String(de("treinamento_questao")[0].filtros.find((f) => f[0] === "select")?.[1]);
  assert.doesNotMatch(colunas(sem.de), /correta|comentario/);
  assert.match(colunas(com.de), /correta/);
  assert.match(colunas(com.de), /comentario/);
});

test("prepararQuestionario: a tentativa é numerada por matrícula e aula; a melhor nota é a maior", async () => {
  const { preparo } = await preparar({
    treinamento_questionario_tentativa: ok([
      { numero: 2, nota: "75", aprovada: false },
      { numero: 1, nota: 50, aprovada: false },
    ]),
  });
  assert.equal(preparo.falha, null);
  if (preparo.falha !== null) return;
  // a próxima é a 3 desta aula (a leitura é só desta aula nesta matrícula: ver o primeiro teste)
  assert.equal(preparo.usadas, 2);
  assert.equal(preparo.melhorNota, 75);
  assert.equal(preparo.concluida, false);
});

test("prepararQuestionario: cada leitura com erro (questões, curso, tentativas) é 503 e nada é preparado", async () => {
  const leituras: [string, string][] = [
    ["treinamento_questao", "questões"],
    ["treinamento_curso", "curso"],
    ["treinamento_questionario_tentativa", "tentativas"],
  ];
  for (const comGabarito of [false, true]) {
    for (const [tabela, nome] of leituras) {
      const { preparo, erros, escritas } = await preparar({ [tabela]: erro }, { comGabarito });
      assert.deepEqual(
        preparo,
        { falha: { mensagem: MSG_QUESTIONARIO_INDISPONIVEL, status: 503 } },
        tabela
      );
      assert.equal(erros.length, 1, tabela);
      assert.match(String(erros[0][0]), new RegExp(`prepararQuestionario: ${nome}`));
      assert.ok(erros[0].includes(FALHA.message), "a causa vai ao log");
      assert.equal(escritas().length, 0);
    }
  }
});

test("prepararQuestionario: trilha ilegível (aulas ou progresso) é 503 e nem chega às questões", async () => {
  for (const tabela of ["treinamento_aula", "treinamento_progresso"]) {
    const { preparo, de } = await preparar({ [tabela]: erro });
    assert.deepEqual(preparo, { falha: { mensagem: MSG_TRILHA_INDISPONIVEL, status: 503 } }, tabela);
    assert.equal(de("treinamento_questao").length, 0, tabela);
  }
});

test("prepararQuestionario: aula de outro tipo ou de fora do curso é 400, sem ler as questões", async () => {
  const casos: [string, string][] = [
    [AULA_VIDEO, "Esta aula não é um questionário"],
    [AULA_CASO, "Esta aula não é um questionário"],
    [AULA_DE_OUTRO_CURSO, "Aula não pertence ao curso"],
  ];
  for (const [aulaId, mensagem] of casos) {
    const { preparo, de } = await preparar({}, { aulaId });
    assert.deepEqual(preparo, { falha: { mensagem, status: 400 } }, aulaId);
    assert.equal(de("treinamento_questao").length, 0, aulaId);
  }
});

test("prepararQuestionario: com a aula anterior por concluir é 409 AULA_BLOQUEADA", async () => {
  const { preparo, de } = await preparar({ treinamento_progresso: ok([]) });
  assert.deepEqual(preparo, {
    falha: {
      mensagem: "Conclua a aula anterior primeiro",
      status: 409,
      extra: { codigo: "AULA_BLOQUEADA" },
    },
  });
  assert.equal(de("treinamento_questao").length, 0);
});

test("prepararQuestionario: questionário sem questões é 409 QUESTIONARIO_VAZIO (avise o RH)", async () => {
  const { preparo } = await preparar({ treinamento_questao: ok([]) });
  assert.deepEqual(preparo, {
    falha: { mensagem: MSG_QUESTIONARIO_VAZIO, status: 409, extra: { codigo: "QUESTIONARIO_VAZIO" } },
  });
  assert.equal(MSG_QUESTIONARIO_VAZIO, "Este questionário ainda não tem questões — avise o RH");
});

test("prepararQuestionario: aula concluída devolve concluida: true com a melhor nota (mesmo se o RH apagou as questões)", async () => {
  const tentativas = ok([
    { numero: 2, nota: 88, aprovada: true },
    { numero: 1, nota: 63, aprovada: false },
  ]);
  for (const questoes of [ok(QUESTOES), ok([])]) {
    const { preparo } = await preparar({
      treinamento_progresso: VIDEO_E_QUESTIONARIO,
      treinamento_questionario_tentativa: tentativas,
      treinamento_questao: questoes,
    });
    assert.equal(preparo.falha, null);
    if (preparo.falha !== null) return;
    assert.equal(preparo.concluida, true);
    assert.equal(preparo.melhorNota, 88);
    assert.equal(preparo.usadas, 2);
  }
});

test("aulaDaAtividade: serve também ao caso (tipo, liberação e concluída)", async () => {
  const banco = bancoDeTeste(cenario({ treinamento_progresso: VIDEO_E_QUESTIONARIO }));
  const caso = await aulaDaAtividade(banco.db, MAT, AULA_CASO, EMPRESA, "caso");
  assert.equal(caso.falha, null);
  if (caso.falha !== null) return;
  assert.equal(caso.aula.id, AULA_CASO);
  assert.equal(caso.concluida, false);
  assert.deepEqual(await aulaDaAtividade(banco.db, MAT, AULA_QUEST, EMPRESA, "caso"), {
    falha: { mensagem: "Esta aula não é um caso", status: 400 },
  });
  assert.deepEqual(await aulaDaAtividade(banco.db, MAT, undefined, EMPRESA, "caso"), {
    falha: { mensagem: "Aula não pertence ao curso", status: 400 },
  });
});

// ---------------------------------------------------------------- correção com as regras da prova (A2)

test("questionário: abrir sorteia, o envio confere o sorteio gravado (sem tempo mínimo) e 7 de 8 aprova com 80", async () => {
  const abrir = await preparar({}, { comGabarito: false });
  if (abrir.preparo.falha !== null) return assert.fail("a abertura não foi preparada");
  const numero = abrir.preparo.usadas + 1;
  const prova = sortearProva(abrir.preparo.questoes, (n) => n - 1);
  // o que o index.ts grava em `questionario_iniciado`: o mesmo formato do `avaliacao_iniciada`
  const detalhe = detalheDaProvaIniciada({
    tentativa: numero,
    agora: AGORA,
    prova,
    tempoMinimoPorQuestaoSeg: 0,
  });
  assert.equal(detalhe.tempo_minimo_seg, 0);
  const enviar = await preparar({}, { comGabarito: true });
  if (enviar.preparo.falha !== null) return assert.fail("o envio não foi preparado");
  const { questoes, curso } = enviar.preparo;
  // enviado no mesmo instante da abertura: sem tempo mínimo, passa
  const envio = validarEnvio({
    questoes,
    respostas: marcar(1),
    inicio: inicioDaProva({ detalhe }),
    numero,
    agora: AGORA,
    tempoMinimoPorQuestaoSeg: 0,
  });
  assert.equal(envio.ok, true);
  if (!envio.ok) return;
  const c = corrigirProva({
    questoes,
    respostas: envio.respostas,
    notaMinima: notaMinimaDoModulo(curso),
  });
  assert.equal(c.acertos, 7);
  assert.equal(c.nota, 88);
  assert.equal(c.aprovada, true);
});

test("questionário: com a mínima 80, 7 de 8 aprova (88) e 6 de 8 não (75); a correção comentada vai nos dois (A2)", () => {
  const notaMinima = notaMinimaDoModulo({ nota_minima_modulo: 80 });
  const casos: [number, number, boolean][] = [
    [1, 88, true],
    [2, 75, false],
  ];
  for (const [erros, nota, aprovada] of casos) {
    const c = corrigirProva({ questoes: QUESTOES, respostas: marcar(erros), notaMinima });
    assert.equal(c.nota, nota);
    assert.equal(c.aprovada, aprovada);
    const r = respostaDoQuestionario({
      aprovada: c.aprovada,
      nota: c.nota,
      acertos: c.acertos,
      total: c.total,
      notaMinima,
      tentativa: 3,
      cursoConcluido: false,
      revisao: revisaoDoQuestionario(QUESTOES, c.acertou),
    });
    assert.equal(r.resultado, aprovada ? "satisfatorio" : "insatisfatorio");
    assert.equal(r.aprovada, aprovada);
    assert.equal(r.aula_concluida, aprovada);
    assert.equal(r.nota, nota);
    assert.equal(r.acertos, 8 - erros);
    assert.equal(r.total, 8);
    assert.equal(r.nota_minima, 80);
    assert.equal(r.tentativa, 3);
    // é estudo: quem não atingiu a nota também vê a alternativa certa e o comentário de cada questão
    assert.equal(r.revisao.length, 8);
    assert.deepEqual(r.revisao[0], {
      questao_id: QUESTOES[0].id,
      acertou: false,
      resposta_correta: OPCOES[QUESTOES[0].correta],
      comentario: "Comentário sintético 1",
    });
    assert.equal(r.revisao[7].acertou, true);
  }
});

test("respostaDoQuestionario: curso_concluido só com a aprovação (o reprovado nunca conclui nada)", () => {
  const base = { nota: 75, acertos: 6, total: 8, notaMinima: 80, tentativa: 1, revisao: [] };
  assert.equal(
    respostaDoQuestionario({ ...base, aprovada: false, cursoConcluido: true }).curso_concluido,
    false
  );
  assert.equal(
    respostaDoQuestionario({ ...base, aprovada: true, cursoConcluido: true }).curso_concluido,
    true
  );
  assert.equal(
    respostaDoQuestionario({ ...base, aprovada: true, cursoConcluido: false }).curso_concluido,
    false
  );
});

test("revisaoDoQuestionario: alternativa certa pelo índice (lista ou texto JSON do legado); sem comentário vai null", () => {
  const revisao = revisaoDoQuestionario(
    [
      { id: "q1", opcoes: JSON.stringify(["Sim", "Não"]), correta: 1 },
      { id: "q2", opcoes: ["Sim", "Não"], correta: 5, comentario: "Veja o módulo 2" },
      { id: "q3", opcoes: "quebrado", correta: 0, comentario: 7 },
    ],
    (q) => q.id === "q1"
  );
  assert.deepEqual(revisao, [
    { questao_id: "q1", acertou: true, resposta_correta: "Não", comentario: null },
    { questao_id: "q2", acertou: false, resposta_correta: null, comentario: "Veja o módulo 2" },
    { questao_id: "q3", acertou: false, resposta_correta: null, comentario: null },
  ]);
});

test("mensagemDoEnvio: as recusas do envio falam em questionário, nunca em prova", () => {
  const duas = QUESTOES.slice(0, 2);
  const detalhe = detalheDaProvaIniciada({
    tentativa: 1,
    agora: AGORA,
    prova: sortearProva(duas, () => 0),
    tempoMinimoPorQuestaoSeg: 0,
  });
  const recusas = [
    validarEnvio({ questoes: duas, respostas: [], inicio: null, numero: 1, agora: AGORA }),
    validarEnvio({
      questoes: QUESTOES.slice(0, 3),
      respostas: [],
      inicio: inicioDaProva({ detalhe }),
      numero: 1,
      agora: AGORA,
    }),
    validarEnvio({
      questoes: duas,
      respostas: [],
      inicio: inicioDaProva({ detalhe }),
      numero: 1,
      agora: AGORA,
      tempoMinimoPorQuestaoSeg: 0,
    }),
  ];
  assert.deepEqual(
    recusas.map((r) => (r.ok ? "ok" : r.codigo)),
    ["PROVA_NAO_INICIADA", "PROVA_ALTERADA", "RESPOSTAS_INCOMPLETAS"]
  );
  for (const r of recusas) {
    if (r.ok) continue;
    assert.doesNotMatch(mensagemDoEnvio(r.codigo, r.mensagem), /prova/i, r.codigo);
  }
  assert.match(mensagemDoEnvio("PROVA_NAO_INICIADA", "x"), /questionário/);
  assert.match(mensagemDoEnvio("PROVA_ALTERADA", "x"), /questionário/);
  // o que não fala em prova passa como veio; código desconhecido (ou de Object.prototype) também
  assert.equal(mensagemDoEnvio("OUTRO", "Mensagem padrão"), "Mensagem padrão");
  assert.equal(mensagemDoEnvio("constructor", "Mensagem padrão"), "Mensagem padrão");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test supabase/functions/portal-funcionario/questionario.test.ts`

Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../portal-funcionario/questionario.ts'
imported from .../questionario.test.ts` (o arquivo conta como `# fail 1`).

- [ ] **Step 3: Implementar**

Crie `supabase/functions/portal-funcionario/questionario.ts`:

```ts
/**
 * Questionário do módulo no portal-funcionario (A2: estudo guiado): o que a matrícula precisa para abrir ou enviar o
 * questionário de uma aula, as mensagens do envio e a resposta da correção.
 *
 * Fora do `index.ts` (que não é importável no Node) para ser testado com um banco injetado (`questionario.test.ts`),
 * como `prova.ts`. Sem `Deno.*` e sem import de URL. O sorteio, o início gravado na trilha, a validação do envio e a
 * correção são os da prova final (`sortearProva`, `detalheDaProvaIniciada`, `inicioDaProva`, `validarEnvio`,
 * `corrigirProva`, em regras.ts). O que muda é o alcance: as questões são as DA AULA (`aula_id`), a nota mínima é a
 * dos módulos (`treinamento_curso.nota_minima_modulo`, padrão 80), as tentativas são livres (sem limite e sem
 * intervalo), numeradas por matrícula e aula (`treinamento_questionario_tentativa`), e a correção comentada vai
 * também a quem não atingiu a nota (é estudo; a cobrança é a prova final).
 *
 * O postgrest-js NÃO lança em falha de rede ou de banco: devolve `data: null` com `error`. Cada leitura confere o seu
 * `error`, manda a causa ao log e, com qualquer uma ilegível, o questionário não é preparado (503): nem aberto, nem
 * corrigido, nem gravado.
 */

import { causa, trilhaDoCurso } from "./conclusao.ts";
import { aulaLiberada, MSG_TRILHA_INDISPONIVEL } from "./regras.ts";
import type { RecusaDaProva } from "./prova.ts";

// A nota mínima dos módulos mora em regras.ts (Task 4): o resumo do certificado também a usa, e regras.ts não pode
// importar este arquivo (ciclo). Aqui só se reexporta, para os consumidores do contrato C4.
export { NOTA_MINIMA_MODULO_PADRAO, notaMinimaDoModulo } from "./regras.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const LOG = "[portal-funcionario]";

/** Eventos do questionário na trilha (C2): gravados só pelo servidor, nunca pela ação `evento`. */
export const EVENTO_QUESTIONARIO_INICIADO = "questionario_iniciado";
export const EVENTO_QUESTIONARIO_ENVIO = "questionario_envio";

/** A leitura do questionário (questões, curso ou tentativas) falhou: o aluno só precisa tentar de novo. */
export const MSG_QUESTIONARIO_INDISPONIVEL =
  "Não foi possível conferir o questionário agora. Tente de novo em instantes.";

/** O RH criou a aula do questionário e ainda não cadastrou as questões dela. */
export const MSG_QUESTIONARIO_VAZIO = "Este questionário ainda não tem questões — avise o RH";

/** A aula como `trilhaDoCurso` a lê (`id, ordem, tipo, duracao_seg`). */
export type AulaDaTrilha = {
  id: string;
  ordem?: unknown;
  tipo?: string | null;
  duracao_seg?: unknown;
};

const NOME_DO_TIPO = { questionario: "um questionário", caso: "um caso" } as const;

export type AulaDaAtividade =
  | { falha: RecusaDaProva }
  | { falha: null; aula: AulaDaTrilha; concluida: boolean };

/**
 * A aula de uma atividade (questionário ou caso) nesta matrícula: do curso da matrícula, na empresa da sessão, do
 * tipo pedido e liberada (todas as anteriores concluídas). Serve ao questionário e ao caso (caso-aluno.ts). Trilha
 * ilegível é 503, nunca "aula de outro curso" nem "aula bloqueada" (A7). `concluida` = a aula já está concluída.
 */
export async function aulaDaAtividade(
  supabase: Db,
  // deno-lint-ignore no-explicit-any
  mat: any,
  aulaId: unknown,
  empresaId: string,
  tipo: keyof typeof NOME_DO_TIPO
): Promise<AulaDaAtividade> {
  const trilha = await trilhaDoCurso(supabase, mat.curso_id, mat.id, empresaId);
  if (!trilha.lida) return { falha: { mensagem: MSG_TRILHA_INDISPONIVEL, status: 503 } };
  const aula = (trilha.aulas as AulaDaTrilha[]).find((a) => a.id === aulaId);
  if (!aula) return { falha: { mensagem: "Aula não pertence ao curso", status: 400 } };
  if (aula.tipo !== tipo) {
    return { falha: { mensagem: `Esta aula não é ${NOME_DO_TIPO[tipo]}`, status: 400 } };
  }
  if (!aulaLiberada(trilha, aula.id)) {
    return {
      falha: {
        mensagem: "Conclua a aula anterior primeiro",
        status: 409,
        extra: { codigo: "AULA_BLOQUEADA" },
      },
    };
  }
  return { falha: null, aula, concluida: trilha.feitas.has(aula.id) };
}

/** O que `prepararQuestionario` devolve: a recusa, ou o que o questionário precisa (`falha: null`). */
export type PreparoDoQuestionario =
  | { falha: RecusaDaProva }
  | {
      falha: null;
      aula: AulaDaTrilha;
      // deno-lint-ignore no-explicit-any
      questoes: any[];
      // deno-lint-ignore no-explicit-any
      curso: any;
      /** a maior tentativa já feita nesta aula (a próxima é `usadas + 1`) */
      usadas: number;
      concluida: boolean;
      melhorNota: number | null;
    };

/**
 * Confere se a matrícula pode abrir ou enviar o questionário desta aula AGORA e traz o que ele precisa: a aula (do
 * curso, do tipo `questionario`, liberada), as questões dela, a nota mínima do curso e as tentativas desta matrícula
 * nesta aula. `comGabarito`: só a correção lê `correta` e `comentario`. Recusas: 503 (leitura), 400 (aula de fora
 * do curso ou de outro tipo), 409 `AULA_BLOQUEADA` e 409 `QUESTIONARIO_VAZIO`. Aula já concluída devolve
 * `concluida: true` com a melhor nota, mesmo sem questões (o RH pode tê-las apagado depois).
 */
export async function prepararQuestionario(
  supabase: Db,
  // deno-lint-ignore no-explicit-any
  mat: any,
  aulaId: string,
  empresaId: string,
  comGabarito: boolean
): Promise<PreparoDoQuestionario> {
  const atividade = await aulaDaAtividade(supabase, mat, aulaId, empresaId, "questionario");
  if (atividade.falha) return { falha: atividade.falha };
  const { aula, concluida } = atividade;
  const [
    { data: questoes, error: erroQuestoes },
    { data: curso, error: erroCurso },
    { data: tentativas, error: erroTentativas },
  ] = await Promise.all([
    supabase
      .from("treinamento_questao")
      .select(
        comGabarito
          ? "id, ordem, pergunta, opcoes, correta, comentario"
          : "id, ordem, pergunta, opcoes"
      )
      .eq("curso_id", mat.curso_id)
      .eq("aula_id", aula.id)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .order("ordem", { ascending: true }),
    supabase
      .from("treinamento_curso")
      .select("nota_minima_modulo")
      .eq("id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    supabase
      .from("treinamento_questionario_tentativa")
      .select("numero, nota, aprovada")
      .eq("matricula_id", mat.id)
      .eq("aula_id", aula.id)
      .eq("empresa_id", empresaId)
      .order("numero", { ascending: false }),
  ]);
  const falhas: [string, unknown][] = [
    ["questões", erroQuestoes],
    ["curso", erroCurso],
    ["tentativas", erroTentativas],
  ];
  let ilegivel = false;
  for (const [leitura, erro] of falhas) {
    if (!erro) continue;
    ilegivel = true;
    console.error(`${LOG} prepararQuestionario: ${leitura}:`, causa(erro));
  }
  if (ilegivel) return { falha: { mensagem: MSG_QUESTIONARIO_INDISPONIVEL, status: 503 } };

  // deno-lint-ignore no-explicit-any
  const feitas: any[] = tentativas ?? [];
  const usadas = feitas.reduce((maior, t) => Math.max(maior, Number(t.numero) || 0), 0);
  const notas = feitas.map((t) => Number(t.nota)).filter((n) => Number.isFinite(n));
  const melhorNota = notas.length ? Math.max(...notas) : null;
  if (concluida) {
    return { falha: null, aula, questoes: questoes ?? [], curso, usadas, concluida, melhorNota };
  }
  if (!questoes?.length) {
    return {
      falha: { mensagem: MSG_QUESTIONARIO_VAZIO, status: 409, extra: { codigo: "QUESTIONARIO_VAZIO" } },
    };
  }
  return { falha: null, aula, questoes, curso, usadas, concluida, melhorNota };
}

/** As mensagens de `validarEnvio` que falam em "prova", reescritas para o questionário. */
const MENSAGENS_DO_ENVIO: Record<string, string> = {
  PROVA_NAO_INICIADA:
    "Abra o questionário de novo para enviar as respostas: esta tentativa não foi iniciada.",
  PROVA_ALTERADA:
    "As questões deste questionário foram alteradas pelo RH enquanto você respondia. Abra o questionário de novo.",
};

/** A mensagem de uma recusa do envio (`validarEnvio`) no questionário; código sem troca passa a mensagem como veio. */
export function mensagemDoEnvio(codigo: string, mensagemPadrao: string): string {
  return Object.hasOwn(MENSAGENS_DO_ENVIO, codigo) ? MENSAGENS_DO_ENVIO[codigo] : mensagemPadrao;
}

/** `opcoes` é jsonb: lista, texto JSON (legado) ou quebrado (vira lista vazia). */
function listaDeOpcoes(opcoes: unknown): unknown[] {
  if (Array.isArray(opcoes)) return opcoes;
  if (typeof opcoes !== "string") return [];
  try {
    const lista = JSON.parse(opcoes);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export type RevisaoDaQuestao = {
  questao_id: string;
  acertou: boolean;
  resposta_correta: string | null;
  comentario: string | null;
};

/** A correção comentada de cada questão (a alternativa certa e o comentário), na ordem recebida. */
export function revisaoDoQuestionario(
  questoes: { id: string; opcoes?: unknown; correta?: unknown; comentario?: unknown }[],
  acertou: (q: { id: string; correta: number }) => boolean
): RevisaoDaQuestao[] {
  return questoes.map((q) => {
    const certa = Number.isInteger(q.correta)
      ? listaDeOpcoes(q.opcoes)[q.correta as number]
      : undefined;
    return {
      questao_id: q.id,
      acertou: acertou(q as { id: string; correta: number }),
      resposta_correta: typeof certa === "string" ? certa : null,
      comentario: typeof q.comentario === "string" ? q.comentario : null,
    };
  });
}

/**
 * A resposta de `questionario_enviar` (C4). Diferente da prova final (D10), o resultado vai inteiro aprovado ou não:
 * nota, acertos, total e a correção comentada (A2: é estudo). `aula_concluida` = aprovou (o `index.ts` só responde
 * depois de concluir a aula); `curso_concluido` só com a aprovação.
 */
export function respostaDoQuestionario(p: {
  aprovada: boolean;
  nota: number;
  acertos: number;
  total: number;
  notaMinima: number;
  tentativa: number;
  cursoConcluido: boolean;
  revisao: RevisaoDaQuestao[];
}) {
  return {
    resultado: p.aprovada ? ("satisfatorio" as const) : ("insatisfatorio" as const),
    aprovada: p.aprovada,
    nota: p.nota,
    acertos: p.acertos,
    total: p.total,
    nota_minima: p.notaMinima,
    tentativa: p.tentativa,
    aula_concluida: p.aprovada,
    curso_concluido: p.aprovada && p.cursoConcluido,
    revisao: p.revisao,
  };
}
```

- [ ] **Step 4: Formatar e rodar**

Run:

```bash
npx prettier --write supabase/functions/portal-funcionario/questionario.ts supabase/functions/portal-funcionario/questionario.test.ts
node --test supabase/functions/portal-funcionario/questionario.test.ts
```

Expected: PASS — `# tests 16`, `# pass 16`, `# fail 0`.

- [ ] **Step 5: Checagens**

Run:

```bash
npx prettier --check supabase/functions/portal-funcionario/questionario.ts supabase/functions/portal-funcionario/questionario.test.ts
node --test "supabase/functions/**/*.test.ts"
npm test --workspace=apps/web
npm run lint
```

Expected: prettier sem avisos; servidor = total ao fim da Task 5 **+ 16**, 0 falhas; front igual ao da Task 5 (nada do
front mudou); lint sem erros. Anote os dois totais no relatório.

- [ ] **Step 6: Commit**

```bash
git status
git add supabase/functions/portal-funcionario/questionario.ts supabase/functions/portal-funcionario/questionario.test.ts
git diff --staged --stat
git commit -F - -- supabase/functions/portal-funcionario/questionario.ts supabase/functions/portal-funcionario/questionario.test.ts <<'EOF'
feat(ead): questionário do módulo no servidor (preparo, mensagens e correção comentada)

O questionário de cada módulo (A2) usa o sorteio, a validação e a correção da prova final, mas com as questões da
aula, a nota mínima dos módulos (padrão 80), tentativas livres numeradas por matrícula e aula e a correção comentada
também para quem não atingiu a nota. O preparo lê com o banco injetado e nunca decide com leitura que falhou (503).
aulaDaAtividade confere a aula (do curso, do tipo, liberada) e serve também ao caso.

Como testar: node --test supabase/functions/portal-funcionario/questionario.test.ts

Produção: nada sozinho; o deploy vai com as Tasks 7 a 9, depois da migração 0170 (seção Produção do plano):
npx supabase@2.118.0 functions deploy portal-funcionario --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt --use-api

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

---

### Task 15: Trilha, Detalhes da matrícula e dossiê com as atividades interativas

**Files:**

- Modify: `apps/web/src/lib/ead-trilha.js` (`ROTULO_EVENTO` :33-70, `tomDoEvento` :79-89, `descreverDetalhe`
  :110-186, funções novas depois de `abertaEmDaTentativa` :188-201)
- Modify: `apps/web/src/lib/ead-trilha.test.js` (import :3-12, lista de arquivos :82-90, rótulo da apostila :120-124,
  `describe` novos no fim)
- Modify: `apps/web/src/lib/ead-dossie.js` (`csvDosQuestionarios` depois de `csvDasTentativas` :336-426,
  `ROTULO_DO_TIPO_DE_AULA` :487, LEIA-ME :524-527, `ROTULO_DA_LEITURA` :606-612, `montarDossie` :650-818)
- Modify: `apps/web/src/lib/ead-dossie.test.js` (import :3-19, `describe` novos no fim)
- Modify: `apps/web/src/components/seguranca/exportarDossieEad.js` (:57-70, :99-116)
- Modify: `apps/web/src/components/seguranca/exportarDossieEad.test.js` (`describe` novo depois de :305)
- Modify: `apps/web/src/components/seguranca/ProvaDaTentativa.jsx` (:18-31)
- Modify: `apps/web/src/components/seguranca/MatriculaAuditoriaSheet.jsx` (:27-36, :80-131, :146-150, seção nova
  depois de :448)
- Modify: `apps/web/src/components/seguranca/MatriculaAuditoriaSheet.test.js` (`describe` novo no fim)

**Interfaces:**

- Consumes: eventos do C2 (`questionario_iniciado` com `detalheDaProvaIniciada(...)`, `questionario_envio`
  `{ tentativa, nota, aprovada }`, `caso_escolha` `{ rodada, etapa, opcao, segura, proxima, passagem }`,
  `caso_reiniciado` `{ rodada, motivo }`, `caso_concluido` `{ rodada, escolhas }`, `tarefa_confirmada`
  `{ segundos }`, `apostila_lida` `{ segundos }`); tabela `treinamento_questionario_tentativa` (C1) pela entidade
  `TreinamentoQuestionarioTentativa` (só leitura, sem `deleted_at`: `{ includeDeleted: true }`), com `prova` e
  `respostas` no formato de `treinamento_tentativa` (nota 2 ao coordenador).
- Produces:
  - `ROTULO_EVENTO` com os 6 eventos novos; `ROTULO_EVENTO.apostila_lida === "Leu até o fim"`;
    `tomDoEvento("caso_reiniciado") === "atencao"`; `descreverDetalhe` para os eventos novos.
  - `abertaEmDoQuestionario(eventos, aulaId, numero): string | null`
  - `tentativasDosQuestionarios({ tentativas, aulas }): Array<{ tentativa, aula: string, ordem: number }>`
  - `csvDosQuestionarios({ tentativas, matriculas, funcionarios, aulas }): string`
  - `montarDossie(entrada)`: aceita `entrada.tentativasQuestionario`; grava `questionarios.csv` só em curso com aula
    `questionario` ou com tentativa; `resumo.tentativasQuestionario: number`; `leituraIncompleta` aceita
    `"questionarios"`.
  - `lerDadosDoDossie(...)` devolve também `tentativasQuestionario` (e `"questionarios"` em `leituraIncompleta`).
  - `<ProvaDaTentativa tentativa abertaEm formatarDataHora rotuloAberta? />` (padrão `"Prova aberta em"`).

- [ ] **Step 1: Escrever os testes da trilha (vão falhar)**

Em `apps/web/src/lib/ead-trilha.test.js`, troque o import do topo (:3-12):

```js
import {
  ROTULO_EVENTO,
  abertaEmDaTentativa,
  abertaEmDoQuestionario,
  ROTULO_ORIGEM_NAVEGADOR,
  descreverDetalhe,
  eventoInformadoPeloNavegador,
  origemDoEvento,
  rotuloDoEvento,
  tentativasDosQuestionarios,
  tomDoEvento,
} from "./ead-trilha";
```

Na leitura do código do servidor (:82-86), acrescente os dois módulos novos das Tasks 3 e 6 à lista:

```js
  for (const arquivo of [
    "_shared/portal-funcionario.ts",
    "portal-funcionario/regras.ts",
    "portal-funcionario/declaracao-ambiente.ts",
    // atividades interativas (Tasks 3 e 6): se o nome do evento morar numa constante EVENTO_*, ele entra aqui
    "portal-funcionario/caso.ts",
    "portal-funcionario/questionario.ts",
  ]) {
```

No teste "os eventos novos do RH e da apostila têm rótulo em português" (:120-124), troque a linha da apostila:

```js
    expect(rotuloDoEvento("apostila_lida")).toMatch(/apostila/i);
```

por:

```js
    // A5 (atividades interativas): a leitura conclui ao chegar ao fim, sem tempo mínimo
    expect(rotuloDoEvento("apostila_lida")).toBe("Leu até o fim");
```

E acrescente no fim do arquivo:

```js
// ---------------------------------------------------------------------------------------------
// Atividades interativas (spec 2026-10-14, contrato C2): questionário, caso e tarefa
// ---------------------------------------------------------------------------------------------

describe("eventos das atividades interativas (C2)", () => {
  const NOVOS = [
    "questionario_iniciado",
    "questionario_envio",
    "caso_escolha",
    "caso_reiniciado",
    "caso_concluido",
    "tarefa_confirmada",
  ];

  it("todo evento novo tem rótulo em português, nunca o nome técnico", () => {
    for (const nome of NOVOS) {
      expect(Object.hasOwn(ROTULO_EVENTO, nome), nome).toBe(true);
      expect(rotuloDoEvento(nome), nome).not.toBe(nome);
    }
    expect(rotuloDoEvento("questionario_envio")).toMatch(/question[áa]rio/i);
    expect(rotuloDoEvento("caso_escolha")).toMatch(/caso/i);
    expect(rotuloDoEvento("tarefa_confirmada")).toMatch(/atividade de estudo/i);
  });

  it("A5: o rótulo da leitura diz que o aluno chegou ao fim; eventos antigos (com mínimo) seguem legíveis", () => {
    expect(rotuloDoEvento("apostila_lida")).toBe("Leu até o fim");
    expect(descreverDetalhe({ evento: "apostila_lida", detalhe: { segundos: 125 } })).toBe(
      "2min 5s de leitura"
    );
    expect(
      descreverDetalhe({ evento: "apostila_lida", detalhe: { segundos: 600, minimo: 540 } })
    ).toBe("10min 0s de leitura (mínimo 9min 0s)");
  });

  it("caso recomeçado tem tom de atenção; as outras atividades, normal", () => {
    expect(tomDoEvento("caso_reiniciado")).toBe("atencao");
    for (const nome of NOVOS.filter((n) => n !== "caso_reiniciado")) {
      expect(tomDoEvento(nome), nome).toBe("normal");
    }
  });
});

describe("descreverDetalhe das atividades interativas", () => {
  const d = (evento, detalhe) => descreverDetalhe({ evento, detalhe });

  it("questionário aberto e enviado: tentativa, nota e se atingiu a nota mínima", () => {
    expect(
      d("questionario_iniciado", { tentativa: 2, iniciada_em: "2026-10-14T10:00:00Z", prova: [] })
    ).toBe("tentativa 2");
    expect(d("questionario_envio", { tentativa: 3, nota: 75, aprovada: false })).toBe(
      "tentativa 3 · nota 75% · abaixo da nota mínima"
    );
    expect(d("questionario_envio", { tentativa: 1, nota: 88, aprovada: true })).toBe(
      "tentativa 1 · nota 88% · atingiu a nota mínima"
    );
  });

  it("escolha no caso: etapa, opção do cadastro, segura ou não e para onde levou", () => {
    expect(
      d("caso_escolha", {
        rodada: 1,
        etapa: "e1",
        opcao: 1,
        segura: false,
        proxima: "r1",
        passagem: 1,
      })
    ).toBe("etapa e1 · opção 2 do cadastro · escolha insegura · seguiu para r1");
    expect(
      d("caso_escolha", {
        rodada: 2,
        etapa: "e2",
        opcao: 0,
        segura: true,
        proxima: null,
        passagem: 2,
      })
    ).toBe("rodada 2 · etapa e2 (2ª vez) · opção 1 do cadastro · escolha segura · encerrou o caso");
  });

  it("caso recomeçado e concluído", () => {
    expect(d("caso_reiniciado", { rodada: 2, motivo: "caso_alterado" })).toBe(
      "rodada 2 · o RH mudou o roteiro e o caminho feito deixou de existir"
    );
    expect(d("caso_concluido", { rodada: 1, escolhas: 4 })).toBe("4 escolhas");
    expect(d("caso_concluido", { rodada: 2, escolhas: 1 })).toBe("rodada 2 · 1 escolha");
  });

  it("atividade de estudo confirmada: o tempo de tela", () => {
    expect(d("tarefa_confirmada", { segundos: 754 })).toBe("12min 34s de tela");
  });

  it("detalhe fora do formato não quebra nem vira lixo na linha", () => {
    expect(() => d("caso_escolha", { etapa: 5, opcao: "x" })).not.toThrow();
    expect(d("caso_escolha", { etapa: 5, opcao: "x" })).toBe("");
    expect(d("questionario_envio", null)).toBe("");
    expect(d("caso_reiniciado", { motivo: "outro" })).toBe("");
    expect(d("tarefa_confirmada", undefined)).toBe("0min 0s de tela");
  });
});

describe("abertaEmDoQuestionario", () => {
  const abriu = (aula_id, tentativa, created_at) => ({
    evento: "questionario_iniciado",
    aula_id,
    detalhe: { tentativa },
    created_at,
  });

  it("devolve a 1ª abertura daquela tentativa daquele questionário", () => {
    const eventos = [
      abriu("aq1", 1, "2026-10-14T10:00:00Z"),
      abriu("aq2", 1, "2026-10-14T09:00:00Z"),
      // reabriu a mesma tentativa: vale a primeira
      abriu("aq1", 1, "2026-10-14T10:30:00Z"),
      abriu("aq1", 2, "2026-10-14T11:00:00Z"),
      // a prova final não conta
      {
        evento: "avaliacao_iniciada",
        aula_id: null,
        detalhe: { tentativa: 1 },
        created_at: "2026-10-14T08:00:00Z",
      },
    ];
    expect(abertaEmDoQuestionario(eventos, "aq1", 1)).toBe("2026-10-14T10:00:00Z");
    expect(abertaEmDoQuestionario(eventos, "aq2", 1)).toBe("2026-10-14T09:00:00Z");
    expect(abertaEmDoQuestionario(eventos, "aq1", 2)).toBe("2026-10-14T11:00:00Z");
    expect(abertaEmDoQuestionario(eventos, "aq1", 3)).toBeNull();
    expect(abertaEmDoQuestionario(undefined, "aq1", 1)).toBeNull();
  });
});

describe("tentativasDosQuestionarios", () => {
  const aulas = [
    { id: "a1", titulo: "Vídeo de abertura" },
    { id: "aq1", titulo: "M1 · Questionário do módulo" },
    { id: "aq2", titulo: "M2 · Questionário do módulo" },
  ];

  it("em ordem de aula e de número, com o rótulo numerado que o aluno vê", () => {
    const linhas = tentativasDosQuestionarios({
      aulas,
      tentativas: [
        { id: "t3", aula_id: "aq2", numero: 1 },
        { id: "t2", aula_id: "aq1", numero: 2 },
        { id: "t1", aula_id: "aq1", numero: 1 },
      ],
    });
    expect(linhas.map((l) => [l.tentativa.id, l.aula])).toEqual([
      ["t1", "2. M1 · Questionário do módulo"],
      ["t2", "2. M1 · Questionário do módulo"],
      ["t3", "3. M2 · Questionário do módulo"],
    ]);
  });

  it("aula que saiu da lista vai para o fim como 'Questionário removido'", () => {
    const linhas = tentativasDosQuestionarios({
      aulas,
      tentativas: [
        { id: "tx", aula_id: "apagada", numero: 1 },
        { id: "t1", aula_id: "aq1", numero: 1 },
      ],
    });
    expect(linhas.map((l) => l.aula)).toEqual([
      "2. M1 · Questionário do módulo",
      "Questionário removido",
    ]);
  });

  it("entrada vazia não quebra", () => {
    expect(tentativasDosQuestionarios()).toEqual([]);
    expect(tentativasDosQuestionarios({ tentativas: null, aulas: null })).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/lib/ead-trilha.test.js`
Expected: FAIL — `abertaEmDoQuestionario is not a function`, rótulos dos eventos novos ausentes e
`rotuloDoEvento("apostila_lida")` ainda "Leu a apostila (tempo mínimo cumprido)". Se as Tasks 7–9 já gravaram os
eventos, o teste "todo evento que o servidor grava tem rótulo" também falha (nota 1 ao coordenador).

- [ ] **Step 3: Implementar em `apps/web/src/lib/ead-trilha.js`**

Em `ROTULO_EVENTO`, troque a linha da apostila:

```js
  apostila_lida: "Leu a apostila (tempo mínimo cumprido)",
```

por:

```js
  // A5 (atividades interativas): texto, PDF e tarefa concluem ao chegar ao fim, sem tempo mínimo
  apostila_lida: "Leu até o fim",
```

e acrescente, depois de `ciencia: "Deu ciência de entrega",` (última linha do objeto):

```js
  // atividades interativas (spec 2026-10-14, contrato C2)
  questionario_iniciado: "Questionário do módulo aberto (ordem sorteada pelo servidor)",
  questionario_envio: "Enviou o questionário do módulo",
  caso_escolha: "Escolha no caso",
  caso_reiniciado: "Caso recomeçado (o roteiro mudou)",
  caso_concluido: "Concluiu o caso",
  tarefa_confirmada: "Confirmou a atividade de estudo",
```

Em `tomDoEvento`, troque:

```js
  if (
    nome === "progresso_ajustado" ||
    nome === "login_falha" ||
    nome === "acesso_aguardando_provisoria"
  ) {
```

por:

```js
  if (
    nome === "progresso_ajustado" ||
    nome === "login_falha" ||
    nome === "acesso_aguardando_provisoria" ||
    // o RH mudou o roteiro e o aluno recomeçou o caso: vale olhar
    nome === "caso_reiniciado"
  ) {
```

Em `descreverDetalhe`, acrescente estes `case` logo antes do `default:` (o `apostila_lida` de hoje fica como está: o
evento novo vem sem `minimo` e cai no texto curto):

```js
    case "questionario_iniciado":
      return Number.isInteger(d.tentativa) ? `tentativa ${d.tentativa}` : "";
    case "questionario_envio":
      // A2: é estudo guiado; "aprovado" fica para a prova final
      return juntar(
        Number.isInteger(d.tentativa) && `tentativa ${d.tentativa}`,
        typeof d.nota === "number" && Number.isFinite(d.nota) && `nota ${d.nota}%`,
        typeof d.aprovada === "boolean" &&
          (d.aprovada ? "atingiu a nota mínima" : "abaixo da nota mínima")
      );
    case "caso_escolha":
      // `opcao` é o índice ORIGINAL (a ordem do cadastro, que o RH vê no editor do caso); o aluno viu embaralhado
      return juntar(
        Number.isInteger(d.rodada) && d.rodada > 1 && `rodada ${d.rodada}`,
        typeof d.etapa === "string" &&
          d.etapa &&
          `etapa ${d.etapa}${Number.isInteger(d.passagem) && d.passagem > 1 ? ` (${d.passagem}ª vez)` : ""}`,
        Number.isInteger(d.opcao) && `opção ${d.opcao + 1} do cadastro`,
        typeof d.segura === "boolean" && (d.segura ? "escolha segura" : "escolha insegura"),
        d.proxima === null
          ? "encerrou o caso"
          : typeof d.proxima === "string" && d.proxima && `seguiu para ${d.proxima}`
      );
    case "caso_reiniciado":
      return juntar(
        Number.isInteger(d.rodada) && `rodada ${d.rodada}`,
        d.motivo === "caso_alterado" && "o RH mudou o roteiro e o caminho feito deixou de existir"
      );
    case "caso_concluido":
      return juntar(
        Number.isInteger(d.rodada) && d.rodada > 1 && `rodada ${d.rodada}`,
        Number.isInteger(d.escolhas) && plural(d.escolhas, "escolha", "escolhas")
      );
    case "tarefa_confirmada":
      return `${formatarTempo(d.segundos)} de tela`;
```

E acrescente no fim do arquivo, depois de `abertaEmDaTentativa`:

```js
/**
 * Hora (do servidor) em que o questionário do módulo `aulaId` foi aberto pela 1ª vez na tentativa `numero`: o
 * evento `questionario_iniciado` daquela aula e tentativa (atividades interativas). Sem o evento: null.
 */
export function abertaEmDoQuestionario(eventos, aulaId, numero) {
  let primeira = null;
  for (const e of eventos || []) {
    if (e?.evento !== "questionario_iniciado" || e.aula_id !== aulaId) continue;
    if (e.detalhe?.tentativa !== numero) continue;
    const t = Date.parse(e.created_at);
    if (Number.isFinite(t) && (primeira === null || t < Date.parse(primeira)))
      primeira = e.created_at;
  }
  return primeira;
}

/**
 * As tentativas dos questionários dos módulos de UMA matrícula, para a seção "Questionários dos módulos" dos
 * Detalhes: em ordem de aula (a do curso, `aulas` já em ordem) e, na aula, de número. `aula` é o rótulo
 * "3. Título" (a numeração que o aluno vê) ou "Questionário removido" quando a aula já não está na lista; essas
 * vão para o fim.
 */
export function tentativasDosQuestionarios({ tentativas, aulas } = {}) {
  const vivas = (Array.isArray(aulas) ? aulas : []).filter((a) => a && !a.deleted_at);
  const posicao = new Map(
    vivas.map((a, i) => [a.id, { numero: i + 1, titulo: a.titulo || "(sem título)" }])
  );
  return (Array.isArray(tentativas) ? tentativas : [])
    .filter(Boolean)
    .map((t) => {
      const p = posicao.get(t.aula_id);
      return {
        tentativa: t,
        aula: p ? `${p.numero}. ${p.titulo}` : "Questionário removido",
        ordem: p ? p.numero : Number.POSITIVE_INFINITY,
      };
    })
    .sort(
      (a, b) =>
        (a.ordem === b.ordem ? 0 : a.ordem - b.ordem) ||
        (Number(a.tentativa.numero) || 0) - (Number(b.tentativa.numero) || 0) ||
        String(a.tentativa.created_at ?? "").localeCompare(String(b.tentativa.created_at ?? ""))
    );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/lib/ead-trilha.test.js`
Expected: PASS (todos os testes do arquivo, inclusive "todo evento que o servidor grava tem rótulo").

- [ ] **Step 5: Escrever os testes do dossiê (vão falhar)**

Em `apps/web/src/lib/ead-dossie.test.js`, acrescente `csvDosQuestionarios,` ao import de `./ead-dossie` (depois de
`csvDasTentativas,`) e cole no fim do arquivo:

```js
// ---------------------------------------------------------------------------------------------
// Atividades interativas: tentativas dos questionários dos módulos (spec 2026-10-14, §5.3)

const AULAS_Q = [
  ...AULAS,
  {
    id: "aq",
    curso_id: "c1",
    ordem: 4,
    titulo: "Questionário do módulo",
    tipo: "questionario",
    duracao_seg: 900,
  },
];
const TQ = [
  {
    id: "tq2",
    matricula_id: "m1",
    funcionario_id: "f1",
    curso_id: "c1",
    aula_id: "aq",
    numero: 2,
    nota: 100,
    acertos: 2,
    total: 2,
    aprovada: true,
    ip: "203.0.113.8",
    dispositivo: "Navegador de Teste",
    created_at: "2026-09-09T10:00:00Z",
    prova: TENT[0].prova,
    respostas: [
      {
        questao_id: "q1",
        resposta: 2,
        acertou: true,
        posicao_exibida: 1,
        ordem_opcoes_exibida: [2, 0, 1],
      },
      {
        questao_id: "q2",
        resposta: 0,
        acertou: true,
        posicao_exibida: 2,
        ordem_opcoes_exibida: [0, 1],
      },
    ],
  },
  {
    id: "tq1",
    matricula_id: "m1",
    funcionario_id: "f1",
    curso_id: "c1",
    aula_id: "aq",
    numero: 1,
    nota: 50,
    acertos: 1,
    total: 2,
    aprovada: false,
    created_at: "2026-09-08T10:00:00Z",
    prova: null,
    respostas: null,
  },
  // de uma matrícula de outro curso: não entra no dossiê deste
  {
    id: "tq9",
    matricula_id: "m9",
    funcionario_id: "f1",
    curso_id: "c9",
    aula_id: "ax",
    numero: 1,
    nota: 100,
    acertos: 1,
    total: 1,
    aprovada: true,
    created_at: "2026-09-08T10:00:00Z",
  },
];

describe("csvDosQuestionarios", () => {
  const csv = csvDosQuestionarios({
    tentativas: TQ.slice(0, 2),
    matriculas: MATS,
    funcionarios: FUNCS,
    aulas: AULAS_Q,
  });
  const linhas = linhasDe(csv).map(celulas);
  const cab = linhas[0];
  const col = (linha, titulo) => linha[cab.indexOf(titulo)];

  it("uma linha por questão de cada tentativa; a tentativa sem prova gravada sai numa linha só", () => {
    expect(linhas).toHaveLength(1 + 1 + 2);
    expect(linhas.slice(1).map((l) => col(l, "Tentativa"))).toEqual(["1", "2", "2"]);
    expect(col(linhas[1], "Resultado da questão")).toBe("Questionário não gravado nesta tentativa");
  });

  it("diz qual questionário (a aula numerada como o aluno vê) e se atingiu a nota mínima", () => {
    expect(col(linhas[1], "Questionário (aula)")).toBe("3. Questionário do módulo");
    expect(col(linhas[1], "Resultado")).toBe("Abaixo da nota mínima");
    expect(col(linhas[2], "Resultado")).toBe("Atingiu a nota mínima");
    expect(col(linhas[2], "IP")).toBe("203.0.113.8");
    expect(col(linhas[2], "Data e hora (UTC)")).toBe("2026-09-09T10:00:00.000Z");
  });

  it("questões na ordem em que o aluno viu, com a marcada e a correta pela letra exibida", () => {
    const [primeira, segunda] = linhas.slice(2);
    expect(col(primeira, "Posição no questionário")).toBe("1");
    expect(col(primeira, "Pergunta")).toBe("Primeira?");
    expect(col(primeira, "Alternativa marcada")).toBe("A) a3");
    expect(col(primeira, "Alternativa correta")).toBe("A) a3");
    expect(col(segunda, "Pergunta")).toBe("Segunda?");
    expect(col(segunda, "Resultado da questão")).toBe("Acertou");
  });

  it("sem tentativas sai só o cabeçalho", () => {
    expect(linhasDe(csvDosQuestionarios({ tentativas: [], aulas: AULAS_Q }))).toHaveLength(1);
  });
});

describe("montarDossie com os questionários dos módulos", () => {
  const raiz = "dossie_ead_NRT_2026-10-06";

  it("curso sem questionário (e sem tentativas): o ZIP sai como antes, sem questionarios.csv", async () => {
    const r = await montarDossie(entrada(), deps());
    const zip = await abrir(r.conteudo);
    expect(nomes(zip)).not.toContain(`${raiz}/questionarios.csv`);
    expect(r.resumo.tentativasQuestionario).toBe(0);
  });

  it("com questionário: a planilha entra só com as matrículas do curso, e o LEIA-ME a descreve", async () => {
    const r = await montarDossie(entrada({ aulas: AULAS_Q, tentativasQuestionario: TQ }), deps());
    const zip = await abrir(r.conteudo);
    expect(nomes(zip)).toContain(`${raiz}/questionarios.csv`);
    const planilha = await zip.file(`${raiz}/questionarios.csv`).async("string");
    expect(planilha).toBe(
      BOM +
        csvDosQuestionarios({
          tentativas: TQ.slice(0, 2),
          matriculas: MATS,
          funcionarios: FUNCS,
          aulas: AULAS_Q,
        })
    );
    expect(r.resumo.tentativasQuestionario).toBe(2);
    const leiame = await zip.file(`${raiz}/LEIA-ME.txt`).async("string");
    expect(leiame).toContain("questionarios.csv");
    expect(leiame).toContain("Nota mínima nos questionários dos módulos: 80%");
    expect(leiame).toContain("questionário do módulo");
  });

  it("curso com questionário que ninguém fez ainda: a planilha entra só com o cabeçalho", async () => {
    const r = await montarDossie(entrada({ aulas: AULAS_Q }), deps());
    const zip = await abrir(r.conteudo);
    const planilha = await zip.file(`${raiz}/questionarios.csv`).async("string");
    expect(linhasDe(planilha.slice(BOM.length))).toHaveLength(1);
  });

  it("leitura incompleta dos questionários vira aviso, nunca silêncio", async () => {
    const r = await montarDossie(entrada({ leituraIncompleta: ["questionarios"] }), deps());
    expect(r.resumo.avisos.join(" ")).toMatch(/questionários dos módulos/);
  });
});
```

Em `apps/web/src/components/seguranca/exportarDossieEad.test.js`, cole depois do `describe("lerDadosDoDossie: ...")`
(que termina na linha 307):

```js
describe("lerDadosDoDossie: tentativas dos questionários dos módulos", () => {
  it("lê as do curso, da empresa da sessão, e deixa as de outro curso e de outra empresa de fora", async () => {
    h.estado.tabelas.treinamento_questionario_tentativa = [
      { id: "q1", empresa_id: EMPRESA, curso_id: CURSO, matricula_id: "m1", aula_id: "a1", numero: 1 },
      {
        id: "q9",
        empresa_id: EMPRESA,
        curso_id: "c-outro",
        matricula_id: "m9",
        aula_id: "a9",
        numero: 1,
      },
      {
        id: "qx",
        empresa_id: OUTRA_EMPRESA,
        curso_id: CURSO,
        matricula_id: "mx",
        aula_id: "a1",
        numero: 1,
      },
    ];
    const d = await lerDadosDoDossie({ empresaId: EMPRESA, cursoId: CURSO });
    expect(d.tentativasQuestionario.map((t) => t.id)).toEqual(["q1"]);
    const consulta = h.estado.consultas.find(
      (c) => c.tabela === "treinamento_questionario_tentativa"
    );
    expect(consulta.filtros).toContainEqual({ op: "eq", col: "curso_id", valor: CURSO });
    expect(d.leituraIncompleta).toEqual([]);
  });

  it("curso sem questionário: a lista vem vazia", async () => {
    const d = await lerDadosDoDossie({ empresaId: EMPRESA, cursoId: CURSO });
    expect(d.tentativasQuestionario).toEqual([]);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/lib/ead-dossie.test.js src/components/seguranca/exportarDossieEad.test.js`
Expected: FAIL — `csvDosQuestionarios is not a function`, `r.resumo.tentativasQuestionario` `undefined` e
`d.tentativasQuestionario` `undefined`.

- [ ] **Step 7: Implementar o dossiê**

Em `apps/web/src/lib/ead-dossie.js`, logo depois do fim de `csvDasTentativas` (a linha
`  return montarCsv(TITULOS_DAS_TENTATIVAS, linhas);` e o `}` seguinte), acrescente:

```js
const TITULOS_DOS_QUESTIONARIOS = [
  "Funcionário",
  "CPF",
  "Questionário (aula)",
  "Tentativa",
  "Data e hora (Brasília)",
  "Data e hora (UTC)",
  "Nota (%)",
  "Acertos",
  "Total de questões",
  "Resultado",
  "IP",
  "Dispositivo",
  "Posição no questionário",
  "Pergunta",
  "Alternativa marcada",
  "Alternativa correta",
  "Resultado da questão",
  "Ordem das alternativas",
  "Matrícula",
];

const SEM_QUESTIONARIO_GRAVADO = "Questionário não gravado nesta tentativa";

/**
 * Tentativas dos questionários dos módulos (atividades interativas, A2): uma linha por questão de cada tentativa,
 * na ordem em que o aluno viu, como a planilha da prova. "Questionário (aula)" é a aula numerada como o aluno vê
 * (a removida aparece pelo título). O resultado diz se a tentativa atingiu a nota mínima dos questionários: é
 * estudo guiado, com tentativas livres; "aprovado" fica para a prova final. Em ordem de nome, matrícula, aula e
 * número da tentativa.
 */
export function csvDosQuestionarios({ tentativas, matriculas, funcionarios, aulas } = {}) {
  const funcs = mapaPorId(funcionarios);
  const matriculaPorId = mapaPorId(matriculas);
  const { rotulos, vivas } = rotulosDasAulas(aulas);
  const posicaoDaAula = new Map(vivas.map((a, i) => [a.id, i]));
  const funcionarioDe = (t) =>
    funcs.get(t.funcionario_id ?? matriculaPorId.get(t.matricula_id)?.funcionario_id);
  const ordenadas = lista(tentativas).sort(
    (a, b) =>
      COLADOR.compare(nomeDoFuncionario(funcionarioDe(a)), nomeDoFuncionario(funcionarioDe(b))) ||
      iguais(
        textoOuVazio(matriculaPorId.get(a.matricula_id)?.created_at),
        textoOuVazio(matriculaPorId.get(b.matricula_id)?.created_at)
      ) ||
      iguais(textoOuVazio(a.matricula_id), textoOuVazio(b.matricula_id)) ||
      (posicaoDaAula.get(a.aula_id) ?? Number.MAX_SAFE_INTEGER) -
        (posicaoDaAula.get(b.aula_id) ?? Number.MAX_SAFE_INTEGER) ||
      (Number(a.numero) || 0) - (Number(b.numero) || 0)
  );

  const linhas = [];
  for (const t of ordenadas) {
    const funcionario = funcionarioDe(t);
    const inicio = [
      nomeDoFuncionario(funcionario),
      cpfFormatado(funcionario?.cpf),
      t.aula_id ? (rotulos.get(t.aula_id) ?? t.aula_id) : "",
      textoOuVazio(t.numero),
      horaBR(t.created_at),
      isoUtc(t.created_at),
      notaBR(numeroOuNull(t.nota)),
      textoOuVazio(t.acertos),
      textoOuVazio(t.total),
      t.aprovada === true
        ? "Atingiu a nota mínima"
        : t.aprovada === false
          ? "Abaixo da nota mínima"
          : "",
      textoOuVazio(t.ip),
      textoOuVazio(t.dispositivo),
    ];
    const fim = [textoOuVazio(t.matricula_id)];
    const detalhe = detalharTentativa(t);
    if (!detalhe.temDetalhe) {
      linhas.push([...inicio, "", "", "", "", SEM_QUESTIONARIO_GRAVADO, "", ...fim]);
      continue;
    }
    for (const q of detalhe.questoes) {
      const marcada = q.alternativas.find((a) => a.marcada);
      const correta = q.alternativas.find((a) => a.correta);
      linhas.push([
        ...inicio,
        q.posicao ?? "",
        q.pergunta,
        marcada ? alternativaTexto(marcada) : "(sem resposta)",
        alternativaTexto(correta),
        RESULTADO_DA_QUESTAO[q.status] ?? "",
        q.ordemRegistrada ? "Como o aluno viu" : "Ordem do cadastro (não registrada)",
        ...fim,
      ]);
    }
  }
  return montarCsv(TITULOS_DOS_QUESTIONARIOS, linhas);
}
```

Troque `ROTULO_DO_TIPO_DE_AULA` (:487):

```js
const ROTULO_DO_TIPO_DE_AULA = { video: "vídeo", pdf: "PDF", texto: "texto" };
```

por:

```js
const ROTULO_DO_TIPO_DE_AULA = {
  video: "vídeo",
  pdf: "PDF",
  texto: "texto",
  // atividades interativas
  questionario: "questionário do módulo",
  caso: "estudo de caso",
  tarefa: "atividade de estudo",
};
```

Em `textoLeiaMe`, logo depois do `campo("Nota mínima na avaliação", ...)` (:524-527), acrescente:

```js
  // atividades interativas: só nos cursos com questionário de módulo (os outros saem como antes)
  if (lista(aulas).some((a) => !a.deleted_at && a.tipo === "questionario")) {
    campo(
      "Nota mínima nos questionários dos módulos",
      `${numeroOuNull(c.nota_minima_modulo) ?? 80}%`
    );
  }
```

Em `ROTULO_DA_LEITURA` (:606-612), acrescente a linha:

```js
  questionarios: "das tentativas dos questionários dos módulos",
```

Em `montarDossie`, logo depois de

```js
  const tentativas = lista(e.tentativas).filter((t) => idsDasMatriculas.has(t.matricula_id));
```

acrescente:

```js
  // questionários dos módulos (atividades interativas): a planilha só entra em curso que os tem (os outros cursos
  // saem como antes)
  const tentativasQuestionario = lista(e.tentativasQuestionario).filter((t) =>
    idsDasMatriculas.has(t.matricula_id)
  );
  const temQuestionarios =
    tentativasQuestionario.length > 0 || lista(e.aulas).some((a) => a.tipo === "questionario");
```

Logo depois do `arquivos.push({ caminho: "tentativas.csv", ... });` acrescente:

```js
  if (temQuestionarios) {
    pasta.file(
      "questionarios.csv",
      BOM +
        csvDosQuestionarios({
          tentativas: tentativasQuestionario,
          matriculas,
          funcionarios: e.funcionarios,
          aulas: e.aulas,
        })
    );
    arquivos.push({
      caminho: "questionarios.csv",
      descricao: `${plural(tentativasQuestionario.length, "tentativa", "tentativas")} dos questionários dos módulos (estudo guiado, tentativas livres), com cada questão, a alternativa marcada e a correta.`,
    });
  }
```

E no `resumo` devolvido no fim, depois de `tentativas: tentativas.length,`:

```js
      tentativasQuestionario: tentativasQuestionario.length,
```

Em `apps/web/src/components/seguranca/exportarDossieEad.js`, troque a primeira leitura inteira (:57-68):

```js
  const [cursoLido, matriculas, aulas, tentativas, certificados] = await Promise.all([
    tabela("treinamento_curso").eq("id", cursoId).maybeSingle(),
    lerEmPaginas(() => tabela("treinamento_matricula").eq("curso_id", cursoId).order("id")),
    lerEmPaginas(() =>
      tabela("treinamento_aula", COLUNAS_DA_AULA).eq("curso_id", cursoId).order("id")
    ),
    lerEmPaginas(
      () => tabela("treinamento_tentativa").eq("curso_id", cursoId).order("id"),
      OPCOES_DAS_TENTATIVAS
    ),
    lerEmPaginas(() => tabela("treinamento_certificado").eq("curso_id", cursoId).order("id")),
  ]);
```

por:

```js
  const [cursoLido, matriculas, aulas, tentativas, certificados, tentativasQuestionario] =
    await Promise.all([
      tabela("treinamento_curso").eq("id", cursoId).maybeSingle(),
      lerEmPaginas(() => tabela("treinamento_matricula").eq("curso_id", cursoId).order("id")),
      lerEmPaginas(() =>
        tabela("treinamento_aula", COLUNAS_DA_AULA).eq("curso_id", cursoId).order("id")
      ),
      lerEmPaginas(
        () => tabela("treinamento_tentativa").eq("curso_id", cursoId).order("id"),
        OPCOES_DAS_TENTATIVAS
      ),
      lerEmPaginas(() => tabela("treinamento_certificado").eq("curso_id", cursoId).order("id")),
      // tentativas dos questionários dos módulos (atividades interativas): a prova inteira em jsonb, como as da
      // avaliação
      lerEmPaginas(
        () => tabela("treinamento_questionario_tentativa").eq("curso_id", cursoId).order("id"),
        OPCOES_DAS_TENTATIVAS
      ),
    ]);
```

Em `leituraIncompleta`, depois de `if (tentativas.truncado) leituraIncompleta.push("tentativas");`:

```js
  if (tentativasQuestionario.truncado) leituraIncompleta.push("questionarios");
```

E no objeto devolvido, depois de `tentativas: tentativas.linhas,`:

```js
    tentativasQuestionario: tentativasQuestionario.linhas,
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/lib/ead-dossie.test.js src/components/seguranca/exportarDossieEad.test.js src/components/seguranca/TreinamentosEadTab.dossie.test.js`
Expected: PASS (o teste "baixa um ZIP com projeto, planilhas e um PDF por certificado" continua sem
`questionarios.csv`: o curso de lá não tem questionário).

- [ ] **Step 9: Escrever o teste de contrato dos Detalhes (vai falhar)**

Cole no fim de `apps/web/src/components/seguranca/MatriculaAuditoriaSheet.test.js`:

```js
describe("MatriculaAuditoriaSheet: questionários dos módulos (atividades interativas)", () => {
  it("lê as tentativas da matrícula (tabela só de inclusão: includeDeleted) e monta a seção pela lib", () => {
    expect(sheet).toMatch(
      /TreinamentoQuestionarioTentativa\.filter\(\s*\{ matricula_id: matricula\.id \},\s*SEM_SOFT_DELETE\s*\)/
    );
    expect(sheet).toContain("tentativasDosQuestionarios({");
    expect(sheet).toContain("Questionários dos módulos");
  });

  it("cada tentativa abre o questionário como o aluno viu, como a prova", () => {
    expect(sheet.match(/<ProvaDaTentativa/g)).toHaveLength(2);
    expect(sheet).toContain("abertaEmDoQuestionario(eventos, t.aula_id, t.numero)");
    expect(sheet).toContain('rotuloAberta="Questionário aberto em"');
  });
});
```

Run: `cd apps/web && npx vitest run src/components/seguranca/MatriculaAuditoriaSheet.test.js`
Expected: FAIL nos dois testes novos.

- [ ] **Step 10: Implementar `ProvaDaTentativa` e os Detalhes**

Em `apps/web/src/components/seguranca/ProvaDaTentativa.jsx`, troque a assinatura e a primeira linha do texto
(:24 e :30):

```jsx
export default function ProvaDaTentativa({ tentativa, abertaEm, formatarDataHora }) {
```

por:

```jsx
export default function ProvaDaTentativa({
  tentativa,
  abertaEm,
  formatarDataHora,
  // o questionário do módulo (atividades interativas) usa a mesma tela
  rotuloAberta = "Prova aberta em",
}) {
```

e

```jsx
        {abertaEm ? `Prova aberta em ${formatarDataHora(abertaEm)} · ` : ""}
```

por:

```jsx
        {abertaEm ? `${rotuloAberta} ${formatarDataHora(abertaEm)} · ` : ""}
```

Em `apps/web/src/components/seguranca/MatriculaAuditoriaSheet.jsx`:

1. No import de `@/lib/ead-trilha` (:27-36), acrescente `abertaEmDoQuestionario,` e `tentativasDosQuestionarios,`
   (em ordem alfabética dentro da lista, depois de `abertaEmDaTentativa,` e de `rotuloDoEvento,`).
2. Depois de `const [tentativas, setTentativas] = useState([]);` acrescente:

```jsx
  // tentativas dos questionários dos módulos (atividades interativas): todas gravadas, tentativas livres
  const [tentativasQuestionario, setTentativasQuestionario] = useState([]);
```

3. Em `carregar`, troque `const [ps, ts, evs, certs] = await Promise.all([` por
   `const [ps, ts, evs, certs, tqs] = await Promise.all([` e acrescente como último item da lista (depois da leitura
   de `TreinamentoCertificado`):

```jsx
        // tabela só de inclusão, como a das tentativas da prova
        sigo.entities.TreinamentoQuestionarioTentativa.filter(
          { matricula_id: matricula.id },
          SEM_SOFT_DELETE
        ),
```

   e, depois de `setCertificado(certs[0] || null);`:

```jsx
      setTentativasQuestionario(tqs);
```

4. Depois de `const totalAssistido = ...` (:150), acrescente:

```jsx
  // questionários dos módulos: a seção só aparece em curso que os tem (ou com tentativa gravada)
  const questionarios = tentativasDosQuestionarios({ tentativas: tentativasQuestionario, aulas });
  const temQuestionarios =
    questionarios.length > 0 || (aulas || []).some((a) => a.tipo === "questionario");
```

5. Logo depois do `</section>` que fecha "Avaliação — tentativas" (:448) e antes da seção "Certificado", acrescente:

```jsx
            {temQuestionarios && (
              <section>
                <h3 className="font-semibold text-slate-800 mb-2">
                  Questionários dos módulos ({questionarios.length}{" "}
                  {questionarios.length === 1 ? "tentativa" : "tentativas"})
                </h3>
                <p className="text-xs text-slate-500 mb-2">
                  Estudo guiado: tentativas livres, todas registradas, com a correção comentada depois
                  de cada envio. A aula conclui na primeira tentativa que atinge a nota mínima dos
                  questionários
                  {curso?.nota_minima_modulo != null ? ` (${curso.nota_minima_modulo}%)` : ""}.
                </p>
                {questionarios.length === 0 ? (
                  <p className="text-slate-400">Nenhuma tentativa ainda.</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 border-b">
                        <th className="py-1 pr-2 font-medium">Questionário</th>
                        <th className="py-1 pr-2 font-medium">Nº</th>
                        <th className="py-1 pr-2 font-medium">Data/hora</th>
                        <th className="py-1 pr-2 font-medium">Acertos</th>
                        <th className="py-1 pr-2 font-medium">Nota</th>
                        <th className="py-1 font-medium">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questionarios.map(({ tentativa: t, aula }) => {
                        // chave própria: o conjunto das linhas abertas é o mesmo da prova
                        const chave = `questionario-${t.id}`;
                        const aberta = abertas.has(chave);
                        return (
                          <React.Fragment key={chave}>
                            <tr className="border-b last:border-0">
                              <td className="py-1.5 pr-2">{aula}</td>
                              <td className="py-1.5 pr-2">
                                <button
                                  type="button"
                                  onClick={() => alternarProva(chave)}
                                  aria-expanded={aberta}
                                  aria-controls={chave}
                                  aria-label={`${aberta ? "Esconder" : "Ver"} o questionário da tentativa ${t.numero} de ${aula}`}
                                  title={aberta ? "Esconder o questionário" : "Ver o questionário"}
                                  className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-slate-700 hover:bg-slate-100"
                                >
                                  {aberta ? (
                                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                  )}
                                  {t.numero}
                                </button>
                              </td>
                              <td className="py-1.5 pr-2">{fmtDataHora(t.created_at)}</td>
                              <td className="py-1.5 pr-2">
                                {t.acertos}/{t.total}
                              </td>
                              <td className="py-1.5 pr-2">
                                <Badge
                                  variant="outline"
                                  className={
                                    t.aprovada
                                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                      : "bg-amber-50 text-amber-800 border-amber-200"
                                  }
                                >
                                  {t.nota}% · {t.aprovada ? "atingiu a nota" : "abaixo da nota"}
                                </Badge>
                              </td>
                              <td className="py-1.5 text-slate-500">{t.ip || "—"}</td>
                            </tr>
                            {aberta && (
                              <tr id={chave} className="border-b last:border-0">
                                <td colSpan={6} className="pb-3">
                                  <ProvaDaTentativa
                                    tentativa={t}
                                    abertaEm={abertaEmDoQuestionario(eventos, t.aula_id, t.numero)}
                                    formatarDataHora={fmtDataHora}
                                    rotuloAberta="Questionário aberto em"
                                  />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            )}
```

- [ ] **Step 11: Rodar os testes da task e as checagens**

Run: `cd apps/web && npx vitest run src/components/seguranca/MatriculaAuditoriaSheet.test.js src/components/seguranca/ProvaDaTentativa.test.jsx src/lib/ead-trilha.test.js src/lib/ead-dossie.test.js src/components/seguranca/exportarDossieEad.test.js`
Expected: PASS.

Run (na raiz do worktree):

```bash
npx prettier --write apps/web/src/lib/ead-trilha.js apps/web/src/lib/ead-trilha.test.js apps/web/src/lib/ead-dossie.js apps/web/src/lib/ead-dossie.test.js apps/web/src/components/seguranca/exportarDossieEad.js apps/web/src/components/seguranca/exportarDossieEad.test.js apps/web/src/components/seguranca/ProvaDaTentativa.jsx apps/web/src/components/seguranca/MatriculaAuditoriaSheet.jsx apps/web/src/components/seguranca/MatriculaAuditoriaSheet.test.js
npx prettier --check apps/web/src/lib/ead-trilha.js apps/web/src/lib/ead-trilha.test.js apps/web/src/lib/ead-dossie.js apps/web/src/lib/ead-dossie.test.js apps/web/src/components/seguranca/exportarDossieEad.js apps/web/src/components/seguranca/exportarDossieEad.test.js apps/web/src/components/seguranca/ProvaDaTentativa.jsx apps/web/src/components/seguranca/MatriculaAuditoriaSheet.jsx apps/web/src/components/seguranca/MatriculaAuditoriaSheet.test.js
(cd apps/web && npx eslint --rule "no-undef: error" src/components/seguranca/MatriculaAuditoriaSheet.jsx src/components/seguranca/ProvaDaTentativa.jsx src/components/seguranca/exportarDossieEad.js)
npm run lint
npm run build
npm test --workspace=apps/web
node --test "supabase/functions/**/*.test.ts"
```

Expected: prettier "All matched files use Prettier code style!"; ESLint sem erros; build OK; Vitest com cerca de
**+24 testes** em relação à task anterior, 0 falhas; `node --test` sem mudança (0 falhas). Anote os totais no
relatório.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/lib/ead-trilha.js apps/web/src/lib/ead-trilha.test.js apps/web/src/lib/ead-dossie.js apps/web/src/lib/ead-dossie.test.js apps/web/src/components/seguranca/exportarDossieEad.js apps/web/src/components/seguranca/exportarDossieEad.test.js apps/web/src/components/seguranca/ProvaDaTentativa.jsx apps/web/src/components/seguranca/MatriculaAuditoriaSheet.jsx apps/web/src/components/seguranca/MatriculaAuditoriaSheet.test.js
git status --short && git diff --staged --stat
git commit -F - -- apps/web/src/lib/ead-trilha.js apps/web/src/lib/ead-trilha.test.js apps/web/src/lib/ead-dossie.js apps/web/src/lib/ead-dossie.test.js apps/web/src/components/seguranca/exportarDossieEad.js apps/web/src/components/seguranca/exportarDossieEad.test.js apps/web/src/components/seguranca/ProvaDaTentativa.jsx apps/web/src/components/seguranca/MatriculaAuditoriaSheet.jsx apps/web/src/components/seguranca/MatriculaAuditoriaSheet.test.js <<'EOF'
feat(ead): trilha, detalhes e dossiê das atividades interativas

Os eventos novos do servidor (questionário, caso e tarefa) ganham rótulo e descrição em
português, e "apostila_lida" passa a dizer "Leu até o fim" (A5). Os Detalhes da matrícula
mostram as tentativas dos questionários dos módulos, cada uma aberta como a prova; o dossiê
leva questionarios.csv nos cursos com questionário (os outros saem como antes).

Produção: nenhuma nesta task (vai junto com o push do fim do plano).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: `index.ts`: prova só com `aula_id` vazio, `concluirAula`, `progresso`, `dados`, `certificado`

**Files:**

- Modify: `supabase/functions/portal-funcionario/index.ts` (cabeçalho `:25`; imports `:202-204`; depois de
  `minhaMatricula` `:1085`; `dados` `:1115-1204` e `:1380-1386`; `progresso` `:1689-1766`; `certificado`
  `:2117-2141` e `:2161-2196`)
- Modify: `supabase/functions/portal-funcionario/prova.ts:83-94`
- Modify: `supabase/functions/portal-funcionario/conclusao.ts:85-91`
- Modify: `supabase/functions/portal-funcionario/prova.test.ts` (teste novo depois de `:155`)
- Modify: `supabase/functions/portal-funcionario/conclusao.test.ts` (teste novo depois de `:179`)
- Create: `supabase/functions/portal-funcionario/atividades-index.test.ts`

**Interfaces:**

- Consumes:
  - Task 4 (`regras.ts`): `conclusaoDaAula` (pdf/texto/tarefa concluem com `pediuConcluir === true`, sem tempo;
    questionário e caso nunca pelo `progresso`; `concluirCedo` sempre `false`), `aulasParaAluno` (texto da tarefa),
    `atividadesDoCertificado(aulas, curso)`.
  - Task 5 (`requisitos.ts`): `requisitosDoCurso({ curso, aulas, questoes, casos })` — `questoes` todas (com
    `aula_id`), `casos` = `[{ aula_id, conteudo }]`.
  - C1: `treinamento_questao.aula_id`, `treinamento_caso (curso_id, aula_id, conteudo, empresa_id, deleted_at)`,
    `treinamento_curso.nota_minima_modulo`.
- Produces:
  - `concluirAula(mat, aula, segundos: number, eventoExtra: { evento: string; detalhe: Record<string, unknown> } |
    null): Promise<{ aula_concluida: true; curso_concluido: boolean; precisa_avaliacao: boolean; status: string } |
    null>` (interna do `index.ts`, C5; `null` = o progresso não foi gravado).
  - Eventos `tarefa_confirmada { segundos }` e `apostila_lida { segundos }` (C2); `dados.atividades` no certificado.
  - Prova final, conclusão e contagem de questões só com `aula_id is null`.

- [ ] **Step 1: Escrever os testes que falham**

1a. Em `supabase/functions/portal-funcionario/prova.test.ts`, logo depois do teste
`prepararProva: abrir a prova nunca lê o gabarito; só a correção carrega \`correta\` e \`comentario\`` (termina na
linha `:155`), acrescente:

```ts
test("prepararProva: só as questões da prova final (aula_id vazio); as dos questionários dos módulos ficam de fora", async () => {
  for (const comGabarito of [false, true]) {
    const { de } = await preparar({}, { comGabarito });
    assert.ok(tem(de("treinamento_questao")[0], ["is", "aula_id", null]), String(comGabarito));
  }
});
```

1b. Em `supabase/functions/portal-funcionario/conclusao.test.ts`, logo depois do teste
`situacaoReal: tudo lido e completo conclui, com o marco da aprovação` (termina na linha `:179`), acrescente:

```ts
test("situacaoReal: 'o curso tem prova' conta só as questões da prova final (aula_id vazio)", async () => {
  // com questão só de questionário de módulo, o curso não "tem avaliação": sem o filtro, nunca concluiria
  const { db, de } = bancoDeTeste(cenario());
  await situacaoReal(db, MAT, EMPRESA);
  assert.ok(tem(de("treinamento_questao")[0], ["is", "aula_id", null]));
  assert.ok(tem(de("treinamento_questao")[0], ["is", "deleted_at", null]));
});
```

1c. Crie `supabase/functions/portal-funcionario/atividades-index.test.ts`:

```ts
// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/atividades-index.test.ts
//
// Atividades interativas do EAD (spec 2026-10-14: questionário do módulo, caso com decisões e tarefa de estudo):
// guardas de TEXTO do index.ts, que não é importável no Node (Deno.serve e imports de URL), como
// `acompanhamento-a6.test.ts` e `endurecimento.test.ts`. O comportamento está nos testes das regras puras e dos
// módulos com banco injetado (questionario.test.ts, caso-aluno.test.ts, caso.test.ts, regras.test.ts,
// requisitos.test.ts, prova.test.ts, conclusao.test.ts); aqui se confere que o index.ts os USA, na ordem certa, e
// que a prova final nunca lê as questões dos questionários. Sem dado real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Código sem comentários de linha e de bloco (o que é explicação não conta como código). */
const semComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ler = (arquivo: string) =>
  semComentarios(readFileSync(new URL(arquivo, import.meta.url), "utf8"));
const codigo = ler("./index.ts");

/** O trecho de uma ação: do `if (body.acao === "<nome>")` até a próxima ação (ou o "Ação desconhecida"). */
function trechoDaAcao(nome: string): string {
  const inicio = codigo.indexOf(`if (body.acao === "${nome}")`);
  assert.ok(inicio >= 0, `ação ${nome} não encontrada no index.ts`);
  const resto = codigo.slice(inicio + 10);
  const proximo = resto.search(/\n {4}(?:if \(body\.acao === |return fail\("Ação desconhecida")/);
  return codigo.slice(inicio, proximo >= 0 ? inicio + 10 + proximo : undefined);
}

/** A definição de uma função interna do index.ts (`const nome = async (` até o `};` que a fecha). */
function definicao(nome: string): string {
  const inicio = codigo.indexOf(`const ${nome} = async (`);
  assert.ok(inicio > 0, `${nome} não encontrada no index.ts`);
  return codigo.slice(inicio, codigo.indexOf("\n    };", inicio) + 7);
}

/**
 * Cada consulta a `tabela`: o `.from("tabela")` e a cadeia de métodos logo depois, com os argumentos (parênteses
 * equilibrados, textos entre aspas pulados), até o primeiro token que não é `.metodo(`.
 */
function cadeias(texto: string, tabela: string): string[] {
  const marca = `.from("${tabela}")`;
  const achadas: string[] = [];
  for (let i = texto.indexOf(marca); i >= 0; i = texto.indexOf(marca, i + marca.length)) {
    let j = i + marca.length;
    for (;;) {
      const metodo = /^\s*\.[A-Za-z_]\w*\(/.exec(texto.slice(j));
      if (!metodo) break;
      j += metodo[0].length;
      let profundidade = 1;
      while (j < texto.length && profundidade > 0) {
        const c = texto[j];
        if (c === '"' || c === "'" || c === "`") {
          j++;
          while (j < texto.length && texto[j] !== c) j += texto[j] === "\\" ? 2 : 1;
        } else if (c === "(") profundidade++;
        else if (c === ")") profundidade--;
        j++;
      }
    }
    achadas.push(texto.slice(i, j));
  }
  return achadas;
}

// ---------------------------------------------------- Task 7: prova final, concluirAula, progresso, dados, certificado

const SO_PROVA = /\.is\(\s*"aula_id",\s*null\s*\)/;
const SO_QUESTIONARIOS = /\.not\(\s*"aula_id",\s*"is",\s*null\s*\)/;

test("a prova final só lê as questões sem aula; as dos questionários só servem aos requisitos", () => {
  const prova = cadeias(ler("./prova.ts"), "treinamento_questao");
  const conclusao = cadeias(ler("./conclusao.ts"), "treinamento_questao");
  const index = cadeias(codigo, "treinamento_questao");
  assert.equal(prova.length, 1, "prova.ts: a leitura das questões da prova");
  assert.equal(conclusao.length, 1, "conclusao.ts: 'o curso tem prova?'");
  for (const c of [...prova, ...conclusao]) assert.match(c, SO_PROVA);
  // index.ts: dados e certificado leem as duas listas separadas (a da prova e a dos questionários)
  assert.equal(index.length, 4, index.join("\n---\n"));
  assert.equal(index.filter((c) => SO_PROVA.test(c)).length, 2);
  assert.equal(index.filter((c) => SO_QUESTIONARIOS.test(c)).length, 2);
  for (const c of index) assert.equal(SO_PROVA.test(c) && SO_QUESTIONARIOS.test(c), false);
  // toda leitura é da empresa da sessão e ignora as apagadas
  for (const c of [...prova, ...conclusao, ...index]) {
    assert.match(c, /\.eq\(\s*"empresa_id",\s*empresaId\s*\)/);
    assert.match(c, /\.is\(\s*"deleted_at",\s*null\s*\)/);
  }
});

test("concluirAula: progresso concluído, trilha, conclusão do curso (com a marca adiada) e status, nesta ordem", () => {
  const c = definicao("concluirAula");
  assert.match(
    c,
    /const concluirAula = async \(\s*mat: any,\s*aula: any,\s*segundos: number,\s*eventoExtra: /
  );
  // definida uma vez, depois de minhaMatricula e antes das ações que a usam
  assert.equal(codigo.split("const concluirAula = async (").length - 1, 1);
  assert.ok(codigo.indexOf("const concluirAula = async (") > codigo.indexOf("const minhaMatricula"));
  assert.ok(codigo.indexOf("const concluirAula = async (") < codigo.indexOf('body.acao === "dados"'));
  const upsert = c.search(/\.from\("treinamento_progresso"\)\s*\.upsert\(/);
  assert.ok(upsert > 0, "concluirAula grava o progresso");
  const gravacao = c.slice(upsert, c.indexOf("onConflict", upsert));
  assert.match(gravacao, /segundos_assistidos: segundos/);
  assert.match(gravacao, /concluida: true/);
  assert.match(gravacao, /concluida_em: agoraIso\(\)/);
  // o progresso que não ficou gravado não conclui nada: null para quem chama responder o erro
  assert.match(c, /if \(upErr\) \{[\s\S]*?return null;/);
  const extra = c.search(
    /if \(eventoExtra\) \{\s*await ev\(\{\s*\.\.\.eventoExtra,\s*matricula_id: mat\.id,\s*curso_id: mat\.curso_id,\s*aula_id: aula\.id,?\s*\}\);/
  );
  const aulaConcluida = c.indexOf('evento: "aula_concluida"');
  const conclusao = c.indexOf(
    "await concluirSeCompleto(supabase, mat, empresaId, adiarConclusao(mat))"
  );
  const status = c.search(/\.from\("treinamento_matricula"\)\s*\.update\(\{ status: resultado\.status \}\)/);
  assert.ok(upsert < extra && extra < aulaConcluida, "evento extra depois do progresso e antes da aula");
  assert.ok(aulaConcluida < conclusao && conclusao < status, "aula, curso e só então o status");
  assert.match(
    c.slice(aulaConcluida, conclusao),
    /detalhe: \{ segundos, duracao: duracaoParaProgresso\(aula, TEMPO_MINIMO_PADRAO\) \}/
  );
  assert.match(
    c,
    /evento: "curso_concluido", matricula_id: mat\.id, curso_id: mat\.curso_id \}\);\s*await fecharAdiada\(mat, resultado\.data_conclusao, "aula"\);/
  );
  assert.match(c.slice(status), /\.eq\("id", mat\.id\)\s*\.eq\("empresa_id", empresaId\)/);
  assert.match(c, /aula_concluida: true,/);
  assert.match(c, /curso_concluido: resultado\.concluiu,/);
  assert.match(c, /precisa_avaliacao: resultado\.precisaAvaliacao && !mat\.avaliacao_aprovada,/);
  assert.match(c, /status: resultado\.status,/);
  // só duas gravações do progresso no portal: a conclusão (aqui) e o tempo (progresso)
  assert.equal([...codigo.matchAll(/\.from\("treinamento_progresso"\)\s*\.upsert\(/g)].length, 2);
});

test("progresso: leitura e tarefa concluem com o clique e sem tempo mínimo; a conclusão passa por concluirAula", () => {
  const p = trechoDaAcao("progresso");
  assert.doesNotMatch(codigo, /TEMPO_LEITURA/);
  assert.doesNotMatch(p, /concluirCedo|faltamSeg|minimo:/);
  assert.match(p, /if \(concluiu && !atual\?\.concluida\) \{/);
  // a trilha diz como a aula terminou: leitura até o fim ou tarefa confirmada; vídeo, só a aula
  assert.match(p, /const extra = ehVideo\s*\?\s*null/);
  assert.match(p, /aula\.tipo === "tarefa" \? "tarefa_confirmada" : "apostila_lida"/);
  assert.match(p, /detalhe: \{ segundos: novoSeg \}/);
  assert.match(p, /const fim = await concluirAula\(mat, aula, novoSeg, extra\);/);
  assert.match(p, /if \(!fim\) return fail\("Erro ao salvar progresso", 500\);/);
  // o progresso não tem mais cópia da sequência de conclusão
  assert.doesNotMatch(p, /concluirSeCompleto\(|"aula_concluida"|"curso_concluido"|fecharAdiada\(/);
  // o upsert só de tempo não regrava a conclusão (uma conclusão gravada ao mesmo tempo não volta atrás)
  const soTempo = p.slice(p.search(/\.from\("treinamento_progresso"\)\s*\.upsert\(/));
  const gravacao = soTempo.slice(0, soTempo.indexOf("onConflict"));
  assert.match(gravacao, /segundos_assistidos: novoSeg/);
  assert.doesNotMatch(gravacao, /concluida/);
});

test("dados: a contagem da prova é só das questões sem aula; questionários e casos só entram nos requisitos", () => {
  const d = trechoDaAcao("dados");
  assert.match(d, /\{ data: questoesDosQuestionarios, error: erroQuestionarios \}/);
  assert.match(d, /\{ data: roteiros, error: erroRoteiros \}/);
  const casos = cadeias(d, "treinamento_caso");
  assert.equal(casos.length, 1);
  assert.match(casos[0], /\.in\(\s*"curso_id",\s*cursoIds\s*\)/);
  assert.match(casos[0], /\.eq\(\s*"empresa_id",\s*empresaId\s*\)/);
  assert.match(casos[0], /\.is\(\s*"deleted_at",\s*null\s*\)/);
  // leitura com erro: 503 antes da conta da trilha e da retomada (nunca decide com o que não leu)
  const falha = d.indexOf("if (erroQuestionarios || erroRoteiros)");
  assert.ok(falha > 0, "o dados não confere o erro das leituras novas");
  assert.match(d.slice(falha, falha + 600), /return fail\([^)]*503\s*\)/);
  assert.ok(falha < d.indexOf("const concluidoNaTrilha"));
  // os requisitos recebem a prova, os questionários e os roteiros do curso da matrícula
  assert.match(
    d,
    /requisitosDoCurso\(\{[\s\S]*?questoes: \[\s*\.\.\.questoesCurso,\s*\.\.\.\(questoesDosQuestionarios \?\? \[\]\)\.filter\(/
  );
  assert.match(d, /casos: \(roteiros \?\? \[\]\)\.filter\(/);
  // e nada disso vai ao navegador: o objeto de cada curso não cita as listas nem o gabarito
  const resposta = d.slice(d.indexOf("matricula: matriculaParaAluno(m)"), d.indexOf("duvidas:"));
  for (const proibido of ["questoesDosQuestionarios", "roteiros", "correta"]) {
    assert.equal(resposta.includes(proibido), false, proibido);
  }
});

test("certificado: requisitos com as aulas, todas as questões e os roteiros; atividades congeladas só quando há", () => {
  const c = trechoDaAcao("certificado");
  // as aulas trazem o id (questões e roteiros apontam para ele) e o tipo
  assert.match(c, /\.select\(\s*"id, ordem, modulo, titulo, tipo, /);
  assert.match(
    c,
    /questoes: \[\s*\.\.\.\(questoesDaProva \?\? \[\]\),\s*\.\.\.\(questoesDosQuestionarios \?\? \[\]\)\s*\]/
  );
  assert.match(c, /casos: roteiros \?\? \[\]/);
  const casos = cadeias(c, "treinamento_caso");
  assert.equal(casos.length, 1);
  assert.match(casos[0], /\.eq\(\s*"curso_id",\s*mat\.curso_id\s*\)/);
  assert.match(casos[0], /\.eq\(\s*"empresa_id",\s*empresaId\s*\)/);
  assert.match(casos[0], /\.is\(\s*"deleted_at",\s*null\s*\)/);
  assert.match(c, /if \(erroQuestoes \|\| erroQuestionarios \|\| erroRoteiros\)[\s\S]{0,200}503/);
  // a contagem antiga (head: true) saiu: os requisitos precisam das questões
  assert.doesNotMatch(c, /head: true/);
  // resumo das atividades (A9): regra pura, e só entra quando não é null (curso sem atividade emite como antes)
  assert.match(c, /const atividades = atividadesDoCertificado\(aulas \?\? \[\], curso\);/);
  const congela = c.indexOf("...(atividades ? { atividades } : {})");
  assert.ok(congela > c.indexOf("const dados = {"), "dentro do `dados` do certificado");
  assert.ok(congela < c.indexOf("hashDoCertificado("), "antes do hash");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run:

```bash
node --test supabase/functions/portal-funcionario/atividades-index.test.ts supabase/functions/portal-funcionario/prova.test.ts supabase/functions/portal-funcionario/conclusao.test.ts
```

Expected: FAIL — 7 falhas: os 5 de `atividades-index.test.ts` (`The input did not match the regular expression
/\.is\(\s*"aula_id"…/` em `prova.ts`; `concluirAula não encontrada no index.ts`; `TEMPO_LEITURA` ainda presente;
`questoesDosQuestionarios` ausente; select das aulas sem `id`) e os dois novos de `prova.test.ts` e
`conclusao.test.ts` (`AssertionError: false == true`). Os demais testes desses arquivos passam.

- [ ] **Step 3: Filtrar a prova em `prova.ts` e `conclusao.ts`**

3a. `supabase/functions/portal-funcionario/prova.ts`, trecho atual (`:83-94`):

```ts
  ] = await Promise.all([
    supabase
      .from("treinamento_questao")
      .select(
        comGabarito
          ? "id, ordem, pergunta, opcoes, correta, comentario"
          : "id, ordem, pergunta, opcoes"
      )
      .eq("curso_id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .order("ordem", { ascending: true }),
```

Novo:

```ts
  ] = await Promise.all([
    // só a prova final: questão com `aula_id` é de um questionário de módulo (questionario.ts)
    supabase
      .from("treinamento_questao")
      .select(
        comGabarito
          ? "id, ordem, pergunta, opcoes, correta, comentario"
          : "id, ordem, pergunta, opcoes"
      )
      .eq("curso_id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .is("aula_id", null)
      .order("ordem", { ascending: true }),
```

3b. `supabase/functions/portal-funcionario/conclusao.ts`, trecho atual (`:85-91`):

```ts
    supabase
      .from("treinamento_questao")
      .select("id")
      .eq("curso_id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .limit(1),
```

Novo:

```ts
    // "o curso tem prova" = tem questão da prova final (sem aula); a dos questionários dos módulos não conta
    supabase
      .from("treinamento_questao")
      .select("id")
      .eq("curso_id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .is("aula_id", null)
      .limit(1),
```

- [ ] **Step 4: `index.ts` — cabeçalho, import e `concluirAula`**

4a. Cabeçalho, linha atual (`:25`):

```ts
 *   progresso { matricula_id, aula_id, segundos_assistidos }  (a duração vem do cadastro da aula)
```

Nova:

```ts
 *   progresso { matricula_id, aula_id, segundos_assistidos, concluir? }  (a duração vem do cadastro da aula; o vídeo
 *     conclui aos 90%; leitura e tarefa concluem com `concluir`, sem tempo mínimo (A5); questionário e caso só
 *     creditam o tempo de tela e concluem pelas ações próprias)
```

4b. Import de `regras.ts`, trecho atual (`:203-204`):

```ts
  acaoDeVolumeDoEvento,
  aulaLiberada,
```

Novo:

```ts
  acaoDeVolumeDoEvento,
  atividadesDoCertificado,
  aulaLiberada,
```

4c. Depois de `minhaMatricula`, trecho atual (`:1084-1087`):

```ts
      return curso ? data : null;
    };

    // ---------------------------------------------------------------- dados
```

Novo:

```ts
      return curso ? data : null;
    };

    /**
     * Conclui UMA aula agora (C5): grava o progresso concluído, a trilha (`eventoExtra`, se houver, e
     * `aula_concluida`), confere a conclusão do curso (`concluirSeCompleto`, com a marca adiada), fecha a marca e
     * acerta o status da matrícula. Quem chama já conferiu a matrícula, a aula (do curso, liberada, do tipo certo) e
     * que ela ainda não estava concluída. `segundos` = o tempo de tela creditado à aula (vai ao progresso e à trilha).
     * Serve ao `progresso` (vídeo, leitura e tarefa) e às ações do questionário e do caso. Devolve o que a resposta
     * leva, ou null se o progresso não foi gravado (nada mais foi gravado; quem chama responde o erro).
     */
    const concluirAula = async (
      // deno-lint-ignore no-explicit-any
      mat: any,
      // deno-lint-ignore no-explicit-any
      aula: any,
      segundos: number,
      eventoExtra: { evento: string; detalhe: Record<string, unknown> } | null
    ) => {
      const { error: upErr } = await supabase.from("treinamento_progresso").upsert(
        {
          empresa_id: empresaId,
          matricula_id: mat.id,
          aula_id: aula.id,
          segundos_assistidos: segundos,
          concluida: true,
          concluida_em: agoraIso(),
        },
        { onConflict: "matricula_id,aula_id" }
      );
      if (upErr) {
        console.error("[portal-funcionario] conclusão da aula:", upErr);
        return null;
      }
      if (eventoExtra) {
        await ev({ ...eventoExtra, matricula_id: mat.id, curso_id: mat.curso_id, aula_id: aula.id });
      }
      await ev({
        evento: "aula_concluida",
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        aula_id: aula.id,
        detalhe: { segundos, duracao: duracaoParaProgresso(aula, TEMPO_MINIMO_PADRAO) },
      });
      const resultado = await concluirSeCompleto(supabase, mat, empresaId, adiarConclusao(mat));
      if (resultado.concluiu) {
        await ev({ evento: "curso_concluido", matricula_id: mat.id, curso_id: mat.curso_id });
        await fecharAdiada(mat, resultado.data_conclusao, "aula");
      }
      if (resultado.status !== mat.status && resultado.status !== "concluido") {
        await supabase
          .from("treinamento_matricula")
          .update({ status: resultado.status })
          .eq("id", mat.id)
          .eq("empresa_id", empresaId);
      }
      return {
        aula_concluida: true,
        curso_concluido: resultado.concluiu,
        precisa_avaliacao: resultado.precisaAvaliacao && !mat.avaliacao_aprovada,
        status: resultado.status,
      };
    };

    // ---------------------------------------------------------------- dados
```

- [ ] **Step 5: `index.ts` — `dados`**

5a. Desestruturação, trecho atual (`:1121-1124`):

```ts
        { data: duvidas },
        { data: liberacoes },
      ] = await Promise.all([
```

Novo:

```ts
        { data: duvidas },
        { data: liberacoes },
        { data: questoesDosQuestionarios, error: erroQuestionarios },
        { data: roteiros, error: erroRoteiros },
      ] = await Promise.all([
```

5b. Contagem da prova, trecho atual (`:1144-1153`):

```ts
        // só para contar (tem_avaliacao e total_questoes): o texto e as alternativas saem apenas em
        // iniciar_avaliacao, já sorteados, e o gabarito nunca sai antes da aprovação (T16)
        cursoIds.length
          ? supabase
              .from("treinamento_questao")
              .select("id, curso_id")
              .in("curso_id", cursoIds)
              .eq("empresa_id", empresaId)
              .is("deleted_at", null)
          : vazio,
```

Novo:

```ts
        // só para contar (tem_avaliacao e total_questoes): o texto e as alternativas saem apenas em
        // iniciar_avaliacao, já sorteados, e o gabarito nunca sai antes da aprovação (T16). Só as da PROVA
        // FINAL (`aula_id` vazio): questão de questionário de módulo não faz o curso "ter avaliação"
        cursoIds.length
          ? supabase
              .from("treinamento_questao")
              .select("id, curso_id, aula_id")
              .in("curso_id", cursoIds)
              .eq("empresa_id", empresaId)
              .is("deleted_at", null)
              .is("aula_id", null)
          : vazio,
```

5c. Fim do `Promise.all`, trecho atual (`:1178-1188`):

```ts
        // liberações do RH (T18): quem foi liberado depois da última tentativa não espera o intervalo
        matIds.length
          ? supabase
              .from("treinamento_evento")
              .select("matricula_id, created_at")
              .eq("empresa_id", empresaId)
              .eq("funcionario_id", funcionarioId)
              .eq("evento", EVENTO_TENTATIVA_LIBERADA)
              .in("matricula_id", matIds)
          : vazio,
      ]);
```

Novo:

```ts
        // liberações do RH (T18): quem foi liberado depois da última tentativa não espera o intervalo
        matIds.length
          ? supabase
              .from("treinamento_evento")
              .select("matricula_id, created_at")
              .eq("empresa_id", empresaId)
              .eq("funcionario_id", funcionarioId)
              .eq("evento", EVENTO_TENTATIVA_LIBERADA)
              .in("matricula_id", matIds)
          : vazio,
        // As questões dos questionários dos módulos e os roteiros dos casos só servem aos requisitos do
        // certificado (`pendencias_certificado`): nunca vão ao navegador (saem pelas ações próprias, sem gabarito)
        cursoIds.length
          ? supabase
              .from("treinamento_questao")
              .select("id, curso_id, aula_id, pergunta, opcoes, correta")
              .in("curso_id", cursoIds)
              .eq("empresa_id", empresaId)
              .is("deleted_at", null)
              .not("aula_id", "is", null)
          : vazio,
        cursoIds.length
          ? supabase
              .from("treinamento_caso")
              .select("curso_id, aula_id, conteudo")
              .in("curso_id", cursoIds)
              .eq("empresa_id", empresaId)
              .is("deleted_at", null)
          : vazio,
      ]);
```

5d. Erro das leituras novas, linha atual (`:1205`):

```ts
      const liberadaEm = liberacoesPorMatricula(liberacoes);
```

Novo:

```ts
      // Questões dos questionários e roteiros dos casos (A2, A3): lidos com erro, o curso pareceria sem conteúdo e o
      // portal esconderia o "Emitir certificado" com uma pendência falsa. 503, como as questões e as tentativas.
      if (erroQuestionarios || erroRoteiros) {
        if (erroQuestionarios) {
          console.error("[portal-funcionario] dados: questionários:", erroQuestionarios.message);
        }
        if (erroRoteiros) console.error("[portal-funcionario] dados: casos:", erroRoteiros.message);
        return fail(
          "Não foi possível carregar seus cursos agora. Tente de novo em instantes.",
          503
        );
      }
      const liberadaEm = liberacoesPorMatricula(liberacoes);
```

5e. Requisitos de cada curso, trecho atual (`:1379-1386`):

```ts
        // o que impede EMITIR (D3: o curso de apoio publica e matricula, mas nunca emite)
        const pendencias = pendenciasParaEmitir(
          requisitosDoCurso({
            curso: curso || {},
            aulas: (aulas ?? []).filter((a: { curso_id: string }) => a.curso_id === m.curso_id),
            questoes: questoesCurso,
          })
        );
```

Novo:

```ts
        // o que impede EMITIR (D3: o curso de apoio publica e matricula, mas nunca emite). Os requisitos contam a
        // prova pelas questões sem aula e conferem cada questionário (questões) e cada caso (roteiro), C4
        const pendencias = pendenciasParaEmitir(
          requisitosDoCurso({
            curso: curso || {},
            aulas: (aulas ?? []).filter((a: { curso_id: string }) => a.curso_id === m.curso_id),
            questoes: [
              ...questoesCurso,
              // deno-lint-ignore no-explicit-any
              ...(questoesDosQuestionarios ?? []).filter((q: any) => q.curso_id === m.curso_id),
            ],
            // deno-lint-ignore no-explicit-any
            casos: (roteiros ?? []).filter((c: any) => c.curso_id === m.curso_id),
          })
        );
```

- [ ] **Step 6: `index.ts` — `progresso` e `certificado`**

6a. `progresso`, trecho atual (`:1689-1766`, do comentário do vídeo até o `}` que fecha a ação):

```ts
      // vídeo conclui sozinho aos 90% assistidos; apostila (pdf/texto) exige o
      // tempo de leitura COMPLETO e o clique explícito em "Marcar como lida"
      const { ehVideo, concluirCedo, faltamSeg, concluiu, podeConcluir } = conclusaoDaAula({
        tipo: aula.tipo,
        duracao,
        segundos: novoSeg,
        jaConcluida: atual?.concluida,
        pediuConcluir: body.concluir,
      });
      if (concluirCedo) {
        const faltam = Math.ceil(faltamSeg / 60);
        return fail(`Continue lendo: ainda faltam ${faltam} min do tempo mínimo de leitura.`, 409, {
          codigo: "TEMPO_LEITURA",
          segundos_assistidos: novoSeg,
          faltam_seg: faltamSeg,
        });
      }
      const { error: upErr } = await supabase.from("treinamento_progresso").upsert(
        {
          empresa_id: empresaId,
          matricula_id: mat.id,
          aula_id: aula.id,
          segundos_assistidos: novoSeg,
          concluida: concluiu,
          concluida_em: concluiu && !atual?.concluida ? agoraIso() : (atual?.concluida_em ?? null),
        },
        { onConflict: "matricula_id,aula_id" }
      );
      if (upErr) {
        console.error("[portal-funcionario] progresso:", upErr);
        return fail("Erro ao salvar progresso", 500);
      }

      let resultado = {
        status: mat.status,
        concluiu: false,
        precisaAvaliacao: false,
        data_conclusao: null as string | null,
      };
      if (concluiu && !atual?.concluida) {
        if (!ehVideo) {
          await ev({
            evento: "apostila_lida",
            matricula_id: mat.id,
            curso_id: mat.curso_id,
            aula_id: aula.id,
            detalhe: { segundos: novoSeg, minimo: duracao },
          });
        }
        await ev({
          evento: "aula_concluida",
          matricula_id: mat.id,
          curso_id: mat.curso_id,
          aula_id: aula.id,
          detalhe: { segundos: novoSeg, duracao },
        });
        resultado = await concluirSeCompleto(supabase, mat, empresaId, adiarConclusao(mat));
        if (resultado.concluiu) {
          await ev({ evento: "curso_concluido", matricula_id: mat.id, curso_id: mat.curso_id });
          await fecharAdiada(mat, resultado.data_conclusao, "aula");
        }
      }
      if (resultado.status !== mat.status && resultado.status !== "concluido") {
        await supabase
          .from("treinamento_matricula")
          .update({ status: resultado.status })
          .eq("id", mat.id);
      }

      return ok({
        segundos_assistidos: novoSeg,
        pode_concluir: podeConcluir,
        aula_concluida: concluiu,
        curso_concluido: resultado.concluiu,
        precisa_avaliacao: resultado.precisaAvaliacao && !mat.avaliacao_aprovada,
        status: resultado.status,
      });
    }
```

Novo:

```ts
      // Vídeo conclui sozinho aos 90% assistidos. Leitura (pdf/texto) e tarefa concluem com o clique ("Marcar como
      // lida" / "Fiz a atividade", `concluir: true`), sem tempo mínimo: o botão acende quando o aluno chega ao fim
      // (A5). Questionário e caso só creditam o tempo de tela aqui: `conclusaoDaAula` nunca os conclui pelo
      // `progresso` (concluem por questionario_enviar e caso_concluir).
      const { ehVideo, concluiu, podeConcluir } = conclusaoDaAula({
        tipo: aula.tipo,
        duracao,
        segundos: novoSeg,
        jaConcluida: atual?.concluida,
        pediuConcluir: body.concluir,
      });
      if (concluiu && !atual?.concluida) {
        // a trilha diz como a aula terminou: a leitura chegou ao fim ou a tarefa foi confirmada (vídeo: só a aula)
        const extra = ehVideo
          ? null
          : {
              evento: aula.tipo === "tarefa" ? "tarefa_confirmada" : "apostila_lida",
              detalhe: { segundos: novoSeg },
            };
        const fim = await concluirAula(mat, aula, novoSeg, extra);
        if (!fim) return fail("Erro ao salvar progresso", 500);
        return ok({ segundos_assistidos: novoSeg, pode_concluir: false, ...fim });
      }

      // Só tempo: o upsert não regrava `concluida` nem `concluida_em`, então a conclusão gravada ao mesmo tempo por
      // outra ação (questionário aprovado, caso concluído) não volta atrás com um sinal que já estava a caminho.
      const { error: upErr } = await supabase.from("treinamento_progresso").upsert(
        {
          empresa_id: empresaId,
          matricula_id: mat.id,
          aula_id: aula.id,
          segundos_assistidos: novoSeg,
        },
        { onConflict: "matricula_id,aula_id" }
      );
      if (upErr) {
        console.error("[portal-funcionario] progresso:", upErr);
        return fail("Erro ao salvar progresso", 500);
      }

      return ok({
        segundos_assistidos: novoSeg,
        pode_concluir: podeConcluir,
        aula_concluida: concluiu,
        curso_concluido: false,
        precisa_avaliacao: false,
        status: mat.status,
      });
    }
```

6b. `certificado`, select das aulas, trecho atual (`:2119-2121`):

```ts
          .select(
            "ordem, modulo, titulo, tipo, fonte, video_ref, youtube_id, arquivo_ref, conteudo_texto, duracao_seg"
          )
```

Novo (o `id` liga as questões e os roteiros à aula; não entra no `dados`, que só leva `modulo` e `titulo`):

```ts
          .select(
            "id, ordem, modulo, titulo, tipo, fonte, video_ref, youtube_id, arquivo_ref, conteudo_texto, duracao_seg"
          )
```

6c. `certificado`, requisitos, trecho atual (`:2128-2141`):

```ts
      const { count: nQuestoes, error: erroQuestoes } = await supabase
        .from("treinamento_questao")
        .select("id", { count: "exact", head: true })
        .eq("curso_id", mat.curso_id)
        .eq("empresa_id", empresaId)
        .is("deleted_at", null);
      if (erroQuestoes) return fail("Não foi possível validar os requisitos do curso", 503);
      const pendencias = pendenciasParaEmitir(
        requisitosDoCurso({
          curso: curso || {},
          aulas: aulas || [],
          questoes: Array.from({ length: nQuestoes || 0 }, () => ({})),
        })
      );
```

Novo:

```ts
      // Requisitos (C5): a prova final pelas questões sem aula, cada questionário pelas questões dele e cada caso
      // pelo roteiro. Três leituras da empresa da sessão; qualquer uma com erro é 503 (nunca decide sem ler).
      const [
        { data: questoesDaProva, error: erroQuestoes },
        { data: questoesDosQuestionarios, error: erroQuestionarios },
        { data: roteiros, error: erroRoteiros },
      ] = await Promise.all([
        supabase
          .from("treinamento_questao")
          .select("id, aula_id")
          .eq("curso_id", mat.curso_id)
          .eq("empresa_id", empresaId)
          .is("deleted_at", null)
          .is("aula_id", null),
        supabase
          .from("treinamento_questao")
          .select("id, aula_id, pergunta, opcoes, correta")
          .eq("curso_id", mat.curso_id)
          .eq("empresa_id", empresaId)
          .is("deleted_at", null)
          .not("aula_id", "is", null),
        supabase
          .from("treinamento_caso")
          .select("aula_id, conteudo")
          .eq("curso_id", mat.curso_id)
          .eq("empresa_id", empresaId)
          .is("deleted_at", null),
      ]);
      if (erroQuestoes || erroQuestionarios || erroRoteiros) {
        return fail("Não foi possível validar os requisitos do curso", 503);
      }
      const pendencias = pendenciasParaEmitir(
        requisitosDoCurso({
          curso: curso || {},
          aulas: aulas || [],
          questoes: [...(questoesDaProva ?? []), ...(questoesDosQuestionarios ?? [])],
          casos: roteiros ?? [],
        })
      );
```

6d. `certificado`, `dados` congelado. Trecho atual (`:2161-2162`):

```ts
      const dados = {
        aluno: { nome: func?.nome_completo, cpf: func?.cpf, funcao: func?.funcao_nome ?? null },
```

Novo:

```ts
      // atividades dos módulos (A9): quantas aulas de cada tipo e a nota mínima dos questionários, congeladas no
      // certificado (entram no hash). null = curso sem atividade: a chave nem entra e ele emite como antes.
      const atividades = atividadesDoCertificado(aulas ?? [], curso);
      const dados = {
        aluno: { nome: func?.nome_completo, cpf: func?.cpf, funcao: func?.funcao_nome ?? null },
```

E, no mesmo objeto, trecho atual (`:2194-2196`):

```ts
        avaliacao: sit.aprovacao
          ? { nota: sit.aprovacao.nota, tentativa: sit.aprovacao.numero }
          : null,
```

Novo:

```ts
        avaliacao: sit.aprovacao
          ? { nota: sit.aprovacao.nota, tentativa: sit.aprovacao.numero }
          : null,
        ...(atividades ? { atividades } : {}),
```

- [ ] **Step 7: Formatar, rodar e conferir os testes existentes**

Run:

```bash
npx prettier --write supabase/functions/portal-funcionario/index.ts supabase/functions/portal-funcionario/prova.ts supabase/functions/portal-funcionario/conclusao.ts supabase/functions/portal-funcionario/prova.test.ts supabase/functions/portal-funcionario/conclusao.test.ts supabase/functions/portal-funcionario/atividades-index.test.ts
node --test supabase/functions/portal-funcionario/atividades-index.test.ts supabase/functions/portal-funcionario/prova.test.ts supabase/functions/portal-funcionario/conclusao.test.ts
```

Expected: PASS — `# fail 0` (5 em `atividades-index.test.ts`, 1 novo em cada um dos outros dois).

Os testes de texto que já liam o trecho mudado continuam valendo sem edição (confira que estão verdes na suíte do
Step 8; se algum falhar, o código divergiu do mostrado acima):

- `acompanhamento-a6.test.ts`: "progresso e avaliação marcam a conclusão adiada" (a chamada com `adiarConclusao(mat)`
  agora está em `concluirAula`: continuam 2), "A7: a conclusão normal (aula, prova)…" (o
  `fecharAdiada(mat, resultado.data_conclusao, "aula")` está em `concluirAula`), "A7: toda leitura da trilha confere
  `lida`" (continuam 2 `const trilha = await trilhaDoCurso(` no `index.ts`), "A7: o dados não monta a resposta…"
  (o bloco `if (erroQuestoes || erroTentativas)` não mudou; o das leituras novas vem logo depois), "dados: a
  retomada não grava o evento curso_concluido" (`concluirAula` fica fora do trecho do `dados`);
- `endurecimento.test.ts`: o limite de volume continua antes das leituras do `progresso`; a trava do sinal vem antes do
  `from("treinamento_progresso").upsert` (o upsert só de tempo); `concluirAula` só lê `mat.id`, `mat.curso_id`,
  `mat.status` e `mat.avaliacao_aprovada` (todas em `COLUNAS_MATRICULA_PORTAL`); o UPDATE da matrícula não lê;
- `emissao-certificado.test.ts`, `pratica.test.ts` e `assinaturas.test.ts` (ação `certificado`): nenhuma regra deles
  mudou (o `.insert({` continua depois da validade do semipresencial; o 503 do curso continua antes do 404);
- `trilha-imutavel.test.ts`: nenhuma escrita nova na trilha além de `insert`.

- [ ] **Step 8: Checagens**

Run:

```bash
npx prettier --check supabase/functions/portal-funcionario/index.ts supabase/functions/portal-funcionario/prova.ts supabase/functions/portal-funcionario/conclusao.ts supabase/functions/portal-funcionario/prova.test.ts supabase/functions/portal-funcionario/conclusao.test.ts supabase/functions/portal-funcionario/atividades-index.test.ts
node --test "supabase/functions/**/*.test.ts"
npm test --workspace=apps/web
npm run lint
```

Expected: prettier sem avisos; servidor = total da Task 6 **+ 7**, 0 falhas; front igual ao da Task 6; lint sem erros.
Anote os dois totais.

- [ ] **Step 9: Commit**

```bash
git status
git add supabase/functions/portal-funcionario/index.ts supabase/functions/portal-funcionario/prova.ts supabase/functions/portal-funcionario/conclusao.ts supabase/functions/portal-funcionario/prova.test.ts supabase/functions/portal-funcionario/conclusao.test.ts supabase/functions/portal-funcionario/atividades-index.test.ts
git diff --staged --stat
git commit -F - -- supabase/functions/portal-funcionario/index.ts supabase/functions/portal-funcionario/prova.ts supabase/functions/portal-funcionario/conclusao.ts supabase/functions/portal-funcionario/prova.test.ts supabase/functions/portal-funcionario/conclusao.test.ts supabase/functions/portal-funcionario/atividades-index.test.ts <<'EOF'
feat(ead): portal separa a prova dos questionários e conclui aulas por concluirAula

A prova final, a conclusão do curso e a contagem de questões passam a ler só as questões sem aula (aula_id vazio):
as dos questionários dos módulos não fazem o curso "ter avaliação" nem entram na prova.
A conclusão de uma aula saiu do progresso para concluirAula (progresso, trilha, conclusão do curso, marca adiada e
status), que as ações do questionário e do caso vão usar. Leitura e tarefa concluem com o clique, sem tempo mínimo
(A5): some o 409 TEMPO_LEITURA; a tarefa grava tarefa_confirmada e a leitura apostila_lida { segundos }. O upsert
só de tempo não regrava concluida, para um sinal em voo não desfazer a conclusão de outra ação.
dados e certificado carregam as questões dos questionários e os roteiros dos casos só para os requisitos (nunca vão
ao navegador); o certificado congela dados.atividades quando o curso tem atividades (A9).

Como testar: node --test "supabase/functions/**/*.test.ts"

Produção (só o Javerson, na ordem da seção Produção do plano; a migração 0170 ANTES, porque sem a coluna aula_id
toda leitura de questões falha):
npx supabase@2.118.0 functions deploy portal-funcionario --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt --use-api

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

---

### Task 8: `index.ts`: ações do questionário

**Files:**

- Modify: `supabase/functions/portal-funcionario/regras.ts:1260-1303` (`VOLUME_POR_ACAO`, `acaoDeVolumeDoEvento`)
- Modify: `supabase/functions/portal-funcionario/regras.test.ts` (teste novo depois de `:3155`)
- Modify: `supabase/functions/portal-funcionario/index.ts` (cabeçalho `:26-28`; imports depois de `:242`; `tempoDaAula`
  antes de `// ---- dados`; ações novas depois de `duvida`, antes de `return fail("Ação desconhecida", 400)`)
- Modify: `supabase/functions/portal-funcionario/trilha-imutavel.test.ts:16-20`
- Modify: `supabase/functions/portal-funcionario/atividades-index.test.ts` (testes no fim)

**Interfaces:**

- Consumes: Task 6 (`prepararQuestionario`, `notaMinimaDoModulo`, `mensagemDoEnvio`, `revisaoDoQuestionario`,
  `respostaDoQuestionario`, `EVENTO_QUESTIONARIO_INICIADO`, `EVENTO_QUESTIONARIO_ENVIO`); Task 7 (`concluirAula`);
  `regras.ts` (`sortearProva`, `provaDaOrdem`, `inicioDaProva`, `detalheDaProvaIniciada`, `validarEnvio`,
  `corrigirProva`); `inteiroAleatorioSeguro`, `origemDaRequisicao` (`_shared/portal-funcionario.ts`); C1
  (`treinamento_questionario_tentativa`).
- Produces:
  - `VOLUME_POR_ACAO.atividade = { escopo: "portal-atividade", janelaSeg: 600, max: 180 }`;
    `acaoDeVolumeDoEvento(nome): Exclude<AcaoComVolume, "progresso" | "atividade">`.
  - Interna: `tempoDaAula(mat, aulaId): Promise<number | null>` (null = leitura com erro);
    `ultimoInicioDoQuestionario(mat, aulaId)`.
  - Ações (C5): `questionario_abrir { matricula_id, aula_id }` → `{ concluida: true, nota_minima, melhor_nota,
    tentativas }` | `{ concluida: false, tentativa, nota_minima, questoes: [{ id, pergunta, opcoes, ordem_opcoes }] }`;
    `questionario_enviar { matricula_id, aula_id, respostas }` → `respostaDoQuestionario(...)`. Eventos
    `questionario_iniciado` e `questionario_envio` (C2).

- [ ] **Step 1: Escrever os testes que falham**

1a. Em `supabase/functions/portal-funcionario/regras.test.ts`, logo depois do teste
`VOLUME_POR_ACAO: o teto deixa folga sobre o ritmo do portal (sinal a cada 10 s)` (que termina com
`  assert.ok(MSG_MUITAS_ACOES.length > 0);\n});`, linhas `:3154-3155`), acrescente:

```ts
test("VOLUME_POR_ACAO.atividade: questionário e caso têm teto próprio (portal-atividade, 180 em 10 min)", async () => {
  assert.deepEqual(VOLUME_POR_ACAO.atividade, {
    escopo: "portal-atividade",
    janelaSeg: 600,
    max: 180,
  });
  // nenhum evento do navegador cai nele: o teto é só das ações das atividades
  for (const nome of ["abrir_aula", "play", "abrir_curso", "atividade", "questionario_abrir", undefined]) {
    assert.notEqual(acaoDeVolumeDoEvento(nome), "atividade", String(nome));
  }
  // estourar o das atividades não trava o progresso nem a troca de aula
  const admin = limitadorFalso();
  for (let i = 0; i < VOLUME_POR_ACAO.atividade.max; i++) {
    assert.equal(await volumeComLimitador(admin, "atividade", "func-1"), true);
  }
  assert.equal(await volumeComLimitador(admin, "atividade", "func-1"), false);
  assert.equal(await volumeComLimitador(admin, "progresso", "func-1"), true);
  assert.equal(await volumeComLimitador(admin, "abrir_aula", "func-1"), true);
});
```

1b. No fim de `supabase/functions/portal-funcionario/atividades-index.test.ts`, acrescente:

```ts
// ---------------------------------------------------------------------- Task 8: questionário do módulo

test("leituras de apoio: o último questionario_iniciado e o tempo da aula, só desta matrícula, aula e empresa", () => {
  const inicio = codigo.indexOf("const ultimoInicioDoQuestionario = ");
  assert.ok(inicio > 0, "ultimoInicioDoQuestionario não encontrada");
  const ultimo = codigo.slice(inicio, codigo.indexOf(".maybeSingle()", inicio));
  assert.match(ultimo, /\.from\("treinamento_evento"\)/);
  assert.match(ultimo, /\.eq\("matricula_id", mat\.id\)/);
  assert.match(ultimo, /\.eq\("aula_id", aulaId\)/);
  assert.match(ultimo, /\.eq\("empresa_id", empresaId\)/);
  assert.match(ultimo, /\.eq\("evento", EVENTO_QUESTIONARIO_INICIADO\)/);
  assert.match(ultimo, /\.order\("id", \{ ascending: false \}\)\s*\.limit\(1\)/);
  const tempo = definicao("tempoDaAula");
  assert.match(tempo, /\.from\("treinamento_progresso"\)\s*\.select\("segundos_assistidos"\)/);
  assert.match(tempo, /\.eq\("matricula_id", mat\.id\)/);
  assert.match(tempo, /\.eq\("aula_id", aulaId\)/);
  assert.match(tempo, /\.eq\("empresa_id", empresaId\)/);
  assert.match(tempo, /if \(error\) \{[\s\S]*?return null;/);
});

test("questionario_abrir: teto de atividade, preparo sem gabarito e a mesma tentativa reabre com o mesmo sorteio", () => {
  const a = trechoDaAcao("questionario_abrir");
  const limite = a.indexOf('if (!(await dentroDoLimite("atividade"))) return muitasAcoes();');
  assert.ok(limite >= 0, "sem o teto de atividade");
  assert.ok(limite < a.indexOf("minhaMatricula(body.matricula_id)"));
  assert.match(
    a,
    /const preparo = await prepararQuestionario\(supabase, mat, body\.aula_id, empresaId, false\);\s*if \(preparo\.falha\) return recusaDaProva\(preparo\.falha\);/
  );
  // concluída: a melhor nota e as tentativas, sem sorteio novo
  const concluida = a.indexOf("if (preparo.concluida)");
  assert.ok(concluida > 0 && concluida < a.indexOf("sortearProva("));
  assert.match(
    a.slice(concluida, concluida + 300),
    /concluida: true,[\s\S]*melhor_nota: preparo\.melhorNota,[\s\S]*tentativas: preparo\.usadas/
  );
  assert.match(a, /const numero = preparo\.usadas \+ 1;/);
  assert.match(a, /inicio && inicio\.tentativa === numero \? provaDaOrdem\(questoes, inicio\.ordem\) : null/);
  assert.match(a, /sortearProva\(questoes, inteiroAleatorioSeguro\)/);
  // o início vai à trilha com a aula, no formato do avaliacao_iniciada, sem tempo mínimo; sem a linha, não abre
  const evento = a.indexOf("evento: EVENTO_QUESTIONARIO_INICIADO");
  assert.ok(evento > a.indexOf("sortearProva("));
  const gravacao = a.slice(evento, evento + 400);
  assert.match(gravacao, /aula_id: aula\.id/);
  assert.match(gravacao, /detalheDaProvaIniciada\(\{[\s\S]*tempoMinimoPorQuestaoSeg: 0/);
  assert.match(a, /if \(!gravou\) return fail\([^)]*503\)/);
  // o aluno recebe só o texto: nada de gabarito no trecho
  assert.doesNotMatch(a, /correta|comentario/);
  assert.match(a, /questoes: prova\.map\(\(\{ id, pergunta, opcoes, ordem_opcoes \}\) => \(\{/);
});

test("questionario_enviar: valida contra o sorteio, corrige com a nota do módulo, grava a tentativa e só o aprovado conclui", () => {
  const e = trechoDaAcao("questionario_enviar");
  const pos = (alvo: string | RegExp) => (typeof alvo === "string" ? e.indexOf(alvo) : e.search(alvo));
  assert.ok(pos('if (!(await dentroDoLimite("atividade"))) return muitasAcoes();') >= 0);
  assert.ok(pos("dentroDoLimite(") < pos("minhaMatricula("));
  assert.match(
    e,
    /const preparo = await prepararQuestionario\(supabase, mat, body\.aula_id, empresaId, true\);\s*if \(preparo\.falha\) return recusaDaProva\(preparo\.falha\);/
  );
  assert.match(e, /if \(preparo\.concluida\) \{?\s*return fail\([^)]*409,\s*\{\s*codigo: "QUESTIONARIO_CONCLUIDO"/);
  // as leituras (início e tempo de tela) vêm antes de qualquer gravação; erro = 503
  assert.match(e, /ultimoInicioDoQuestionario\(mat, aula\.id\)/);
  assert.match(e, /tempoDaAula\(mat, aula\.id\)/);
  assert.match(e, /if \(erroLeitura \|\| segundos === null\)[\s\S]{0,200}503/);
  // a regra da prova, sem tempo mínimo, com a mensagem do questionário
  assert.match(e, /validarEnvio\(\{[\s\S]*?tempoMinimoPorQuestaoSeg: 0,?\s*\}\)/);
  assert.match(e, /fail\(mensagemDoEnvio\(envio\.codigo, envio\.mensagem\), envio\.status/);
  assert.match(e, /const notaMinima = notaMinimaDoModulo\(curso\);/);
  assert.match(e, /corrigirProva\(\{[\s\S]*?notaMinima,?\s*\}\)/);
  // a tentativa é imutável e numerada por matrícula e aula: o envio duplo é 409
  const insert = pos(/\.from\("treinamento_questionario_tentativa"\)\s*\.insert\(\{/);
  assert.ok(insert > pos("corrigirProva("));
  assert.ok(insert > pos("tempoDaAula("));
  const linha = e.slice(insert, e.indexOf("});", insert));
  for (const campo of [
    "empresa_id: empresaId",
    "matricula_id: mat.id",
    "curso_id: mat.curso_id",
    "aula_id: aula.id",
    "funcionario_id: funcionarioId",
    "numero,",
    "acertos,",
    "aprovada,",
    "...origemDaRequisicao(req)",
  ]) {
    assert.ok(linha.includes(campo), campo);
  }
  assert.match(e, /tErr\.code === "23505"[\s\S]{0,200}409/);
  // trilha e conclusão depois da tentativa gravada; só o aprovado conclui a aula
  const envio = pos("evento: EVENTO_QUESTIONARIO_ENVIO");
  assert.ok(envio > insert);
  assert.match(e.slice(envio, envio + 200), /detalhe: \{ tentativa: numero, nota, aprovada \}/);
  assert.match(e, /if \(aprovada\) \{\s*const fim = await concluirAula\(mat, aula, segundos, null\);/);
  assert.equal((e.match(/concluirAula\(/g) ?? []).length, 1);
  assert.ok(pos("concluirAula(") > envio);
  // a resposta é a da regra, com a correção comentada aprovado ou não (A2)
  assert.match(e, /respostaDoQuestionario\(\{[\s\S]*?revisao: revisaoDoQuestionario\(questoes, acertou\)/);
});

test("o navegador não grava os eventos do questionário, da tarefa e da leitura (fora de EVENTOS_CLIENTE)", () => {
  const original = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const inicio = original.indexOf("const EVENTOS_CLIENTE = new Set([");
  const lista = original.slice(inicio, original.indexOf("]);", inicio));
  assert.ok(lista.length > 50, "a lista de eventos do navegador não foi lida");
  for (const evento of [
    "questionario_iniciado",
    "questionario_envio",
    "tarefa_confirmada",
    "apostila_lida",
    "aula_concluida",
  ]) {
    assert.equal(lista.includes(evento), false, evento);
  }
});
```

1c. Em `supabase/functions/portal-funcionario/trilha-imutavel.test.ts`, trecho atual (`:16-20`):

```ts
const TABELAS_DA_TRILHA = [
  "treinamento_evento",
  "treinamento_tentativa",
  "treinamento_certificado",
];
```

Novo (guarda: a tentativa do questionário é imutável como a da prova; passa antes e depois desta task):

```ts
const TABELAS_DA_TRILHA = [
  "treinamento_evento",
  "treinamento_tentativa",
  "treinamento_certificado",
  // tentativas dos questionários dos módulos (0170): imutáveis como as da prova (trilha_imutavel)
  "treinamento_questionario_tentativa",
];
```

- [ ] **Step 2: Rodar e ver falhar**

Run:

```bash
node --test supabase/functions/portal-funcionario/atividades-index.test.ts supabase/functions/portal-funcionario/regras.test.ts supabase/functions/portal-funcionario/trilha-imutavel.test.ts
```

Expected: FAIL — 4 falhas: em `atividades-index.test.ts`, `ultimoInicioDoQuestionario não encontrada`,
`ação questionario_abrir não encontrada no index.ts` e `ação questionario_enviar não encontrada no index.ts` (o teste
de `EVENTOS_CLIENTE` já passa); em `regras.test.ts`, `Expected values to be strictly deep-equal: undefined …`
(`VOLUME_POR_ACAO.atividade`). `trilha-imutavel.test.ts` passa.

- [ ] **Step 3: Teto de volume das atividades (`regras.ts`)**

Trecho atual (`:1282-1290`):

```ts
 * Somados, o pior caso por funcionário é 570 em 10 min (abrir_aula 120 + player 300 + evento 150), pouco
 * mais de três vezes o teto único antigo.
 */
export const VOLUME_POR_ACAO = {
  evento: { escopo: "portal-evento", janelaSeg: 10 * 60, max: 150 },
  abrir_aula: { escopo: "portal-abrir-aula", janelaSeg: 10 * 60, max: 120 },
  player: { escopo: "portal-player", janelaSeg: 10 * 60, max: 300 },
  progresso: { escopo: "portal-progresso", janelaSeg: 10 * 60, max: 180 },
} as const;
```

Novo:

```ts
 * Somados, o pior caso por funcionário é 570 em 10 min (abrir_aula 120 + player 300 + evento 150), pouco
 * mais de três vezes o teto único antigo.
 *
 * `atividade` (questionário e caso dos módulos: abrir, enviar, escolher e concluir) tem escopo próprio: cada
 * clique no caso grava uma linha na trilha, e um caso longo com recuperação dá dezenas de cliques em poucos
 * minutos. 180 em 10 min é o teto do progresso; estourar não trava o vídeo, a troca de aula nem o progresso.
 */
export const VOLUME_POR_ACAO = {
  evento: { escopo: "portal-evento", janelaSeg: 10 * 60, max: 150 },
  abrir_aula: { escopo: "portal-abrir-aula", janelaSeg: 10 * 60, max: 120 },
  player: { escopo: "portal-player", janelaSeg: 10 * 60, max: 300 },
  progresso: { escopo: "portal-progresso", janelaSeg: 10 * 60, max: 180 },
  atividade: { escopo: "portal-atividade", janelaSeg: 10 * 60, max: 180 },
} as const;
```

E a assinatura, linha atual (`:1299`):

```ts
export function acaoDeVolumeDoEvento(nome: unknown): Exclude<AcaoComVolume, "progresso"> {
```

Nova:

```ts
export function acaoDeVolumeDoEvento(
  nome: unknown
): Exclude<AcaoComVolume, "progresso" | "atividade"> {
```

- [ ] **Step 4: `index.ts` — cabeçalho, imports e `tempoDaAula`**

4a. Cabeçalho, trecho atual (`:27-28`):

```ts
 *   avaliacao { matricula_id, respostas:[{questao_id,resposta}] }  (exige iniciar_avaliacao antes; quem
 *     reprova na ÚLTIMA tentativa avisa o RH no sino via `notificar_gestores`, T24: ver avisos.ts)
```

Novo:

```ts
 *   avaliacao { matricula_id, respostas:[{questao_id,resposta}] }  (exige iniciar_avaliacao antes; quem
 *     reprova na ÚLTIMA tentativa avisa o RH no sino via `notificar_gestores`, T24: ver avisos.ts)
 *   questionario_abrir { matricula_id, aula_id } → sorteia (ou retoma) a tentativa do questionário do módulo
 *   questionario_enviar { matricula_id, aula_id, respostas } → corrige com a nota mínima do módulo, grava a tentativa
 *     e devolve a correção comentada aprovado ou não; aprovado conclui a aula (questionario.ts)
```

4b. Imports, linha atual (`:242`):

```ts
import { prepararProva, type RecusaDaProva } from "./prova.ts";
```

Novo:

```ts
import { prepararProva, type RecusaDaProva } from "./prova.ts";
import {
  EVENTO_QUESTIONARIO_ENVIO,
  EVENTO_QUESTIONARIO_INICIADO,
  mensagemDoEnvio,
  notaMinimaDoModulo,
  prepararQuestionario,
  respostaDoQuestionario,
  revisaoDoQuestionario,
} from "./questionario.ts";
```

4c. `tempoDaAula`, logo depois de `concluirAula` (Task 7). Trecho atual:

```ts
    // ---------------------------------------------------------------- dados
    if (body.acao === "dados") {
```

Novo:

```ts
    /**
     * O tempo de tela já creditado à aula nesta matrícula (quem credita é o `progresso`; o questionário e o caso
     * concluem pelas ações próprias e levam esse tempo ao progresso concluído e à trilha). null = leitura com erro:
     * quem chama responde 503 antes de gravar qualquer coisa.
     */
    // deno-lint-ignore no-explicit-any
    const tempoDaAula = async (mat: any, aulaId: string): Promise<number | null> => {
      const { data, error } = await supabase
        .from("treinamento_progresso")
        .select("segundos_assistidos")
        .eq("matricula_id", mat.id)
        .eq("aula_id", aulaId)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (error) {
        console.error("[portal-funcionario] tempo da aula:", error.message);
        return null;
      }
      return Math.max(0, Math.floor(Number(data?.segundos_assistidos) || 0));
    };

    // ---------------------------------------------------------------- dados
    if (body.acao === "dados") {
```

- [ ] **Step 5: `index.ts` — as duas ações**

Trecho atual (fim da ação `duvida`, `:2456-2459`):

```ts
      return ok({ duvida, tutor_avisado: tutorAvisado });
    }

    return fail("Ação desconhecida", 400);
```

Novo:

```ts
      return ok({ duvida, tutor_avisado: tutorAvisado });
    }

    // ------------------------------------------------------ questionário do módulo
    // A2: estudo guiado. `questionario_abrir` confere a aula (do curso, do tipo, liberada), sorteia questões e
    // alternativas no servidor (o mesmo sorteio da prova) e grava o início na trilha (`questionario_iniciado`); reabrir
    // a mesma tentativa mantém o sorteio. `questionario_enviar` valida contra esse sorteio (sem tempo mínimo), corrige
    // com a nota mínima dos módulos, grava a tentativa (imutável) e devolve a correção comentada aprovado ou não;
    // aprovado conclui a aula por `concluirAula`. Tentativas livres, sem limite e sem intervalo.

    /** O último início do questionário desta aula nesta matrícula (a linha da trilha), ou erro de leitura. */
    // deno-lint-ignore no-explicit-any
    const ultimoInicioDoQuestionario = (mat: any, aulaId: string) =>
      supabase
        .from("treinamento_evento")
        .select("created_at, detalhe")
        .eq("matricula_id", mat.id)
        .eq("aula_id", aulaId)
        .eq("empresa_id", empresaId)
        .eq("evento", EVENTO_QUESTIONARIO_INICIADO)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (body.acao === "questionario_abrir") {
      if (!(await dentroDoLimite("atividade"))) return muitasAcoes();
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat || !body.aula_id) return fail("Matrícula não encontrada", 404);
      const preparo = await prepararQuestionario(supabase, mat, body.aula_id, empresaId, false);
      if (preparo.falha) return recusaDaProva(preparo.falha);
      const notaMinima = notaMinimaDoModulo(preparo.curso);
      // aula concluída: o aluno vê a melhor nota e quantas tentativas fez; não há tentativa nova
      if (preparo.concluida) {
        return ok({
          concluida: true,
          nota_minima: notaMinima,
          melhor_nota: preparo.melhorNota,
          tentativas: preparo.usadas,
        });
      }
      const { questoes, aula } = preparo;
      const numero = preparo.usadas + 1;

      // Questionário já aberto nesta tentativa (recarregou a página): mesmo sorteio e mesma hora, sem outro evento.
      // Se o RH mexeu nas questões nesse meio tempo, a ordem gravada não confere e o sorteio é refeito.
      const { data: gravado, error: erroLeitura } = await ultimoInicioDoQuestionario(mat, aula.id);
      if (erroLeitura) return fail("Não foi possível abrir o questionário. Tente de novo.", 503);
      const inicio = inicioDaProva(gravado);
      let prova =
        inicio && inicio.tentativa === numero ? provaDaOrdem(questoes, inicio.ordem) : null;
      if (!prova) {
        prova = sortearProva(questoes, inteiroAleatorioSeguro);
        const gravou = await ev({
          evento: EVENTO_QUESTIONARIO_INICIADO,
          matricula_id: mat.id,
          curso_id: mat.curso_id,
          aula_id: aula.id,
          detalhe: detalheDaProvaIniciada({
            tentativa: numero,
            agora: Date.now(),
            prova,
            tempoMinimoPorQuestaoSeg: 0,
          }),
        });
        // sem o início na trilha o envio seria recusado: melhor nem abrir
        if (!gravou) return fail("Não foi possível abrir o questionário. Tente de novo.", 503);
      }

      return ok({
        concluida: false,
        tentativa: numero,
        nota_minima: notaMinima,
        // só o que o aluno vê: o gabarito só vai na correção desta tentativa
        questoes: prova.map(({ id, pergunta, opcoes, ordem_opcoes }) => ({
          id,
          pergunta,
          opcoes,
          ordem_opcoes,
        })),
      });
    }

    if (body.acao === "questionario_enviar") {
      if (!(await dentroDoLimite("atividade"))) return muitasAcoes();
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat || !body.aula_id) return fail("Matrícula não encontrada", 404);
      const preparo = await prepararQuestionario(supabase, mat, body.aula_id, empresaId, true);
      if (preparo.falha) return recusaDaProva(preparo.falha);
      if (preparo.concluida) {
        return fail("Este questionário já foi concluído", 409, {
          codigo: "QUESTIONARIO_CONCLUIDO",
        });
      }
      const { questoes, curso, aula } = preparo;
      const numero = preparo.usadas + 1;

      // tudo o que a gravação precisa é lido ANTES de gravar: o início desta tentativa e o tempo de tela da aula
      const [{ data: gravado, error: erroLeitura }, segundos] = await Promise.all([
        ultimoInicioDoQuestionario(mat, aula.id),
        tempoDaAula(mat, aula.id),
      ]);
      if (erroLeitura || segundos === null) {
        return fail("Não foi possível conferir o questionário. Tente de novo.", 503);
      }
      const envio = validarEnvio({
        questoes,
        respostas: body.respostas,
        inicio: inicioDaProva(gravado),
        numero,
        agora: Date.now(),
        tempoMinimoPorQuestaoSeg: 0,
      });
      if (!envio.ok) {
        return fail(mensagemDoEnvio(envio.codigo, envio.mensagem), envio.status, {
          codigo: envio.codigo,
          ...envio.extra,
        });
      }

      // a ordem exibida é a que o SERVIDOR sorteou (não a que o navegador diz ter mostrado)
      const exibicao = new Map(
        envio.prova.map((q, i) => [q.id, { posicao: i + 1, ordem_opcoes: q.ordem_opcoes }])
      );
      const notaMinima = notaMinimaDoModulo(curso);
      const { marcada, acertou, acertos, nota, aprovada } = corrigirProva({
        questoes,
        respostas: envio.respostas,
        notaMinima,
      });

      // o mesmo formato de `treinamento_tentativa` (prova e respostas), mais a aula do questionário
      const { error: tErr } = await supabase.from("treinamento_questionario_tentativa").insert({
        empresa_id: empresaId,
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        aula_id: aula.id,
        funcionario_id: funcionarioId,
        numero,
        // deno-lint-ignore no-explicit-any
        prova: questoes.map((q: any) => ({
          questao_id: q.id,
          ordem: q.ordem,
          pergunta: q.pergunta,
          opcoes: q.opcoes,
          correta: q.correta,
        })),
        // deno-lint-ignore no-explicit-any
        respostas: questoes.map((q: any) => ({
          questao_id: q.id,
          resposta: marcada.get(q.id) ?? null,
          acertou: acertou(q),
          posicao_exibida: exibicao.get(q.id)?.posicao ?? null,
          ordem_opcoes_exibida: exibicao.get(q.id)?.ordem_opcoes ?? null,
        })),
        acertos,
        total: questoes.length,
        nota,
        aprovada,
        ...origemDaRequisicao(req),
      });
      if (tErr) {
        // unique(matricula_id, aula_id, numero): envio duplo simultâneo (outra aba já gravou esta tentativa)
        if (tErr.code === "23505") {
          return fail("Esta tentativa já foi registrada — recarregue a página", 409, {
            codigo: "TENTATIVA_REPETIDA",
          });
        }
        console.error("[portal-funcionario] tentativa do questionário:", tErr);
        return fail("Não foi possível registrar o questionário. Tente de novo.", 500);
      }
      await ev({
        evento: EVENTO_QUESTIONARIO_ENVIO,
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        aula_id: aula.id,
        detalhe: { tentativa: numero, nota, aprovada },
      });

      let cursoConcluido = false;
      if (aprovada) {
        const fim = await concluirAula(mat, aula, segundos, null);
        // a tentativa aprovada já está gravada (imutável): sem a conclusão, o aluno abre de novo e refaz
        if (!fim) {
          return fail(
            "Sua tentativa foi registrada, mas a aula não foi concluída agora. Abra o questionário de novo.",
            500
          );
        }
        cursoConcluido = fim.curso_concluido;
      }

      // A2: a correção comentada vai aprovado ou não (é estudo; a cobrança é a prova final)
      return ok(
        respostaDoQuestionario({
          aprovada,
          nota,
          acertos,
          total: questoes.length,
          notaMinima,
          tentativa: numero,
          cursoConcluido,
          revisao: revisaoDoQuestionario(questoes, acertou),
        })
      );
    }

    return fail("Ação desconhecida", 400);
```

- [ ] **Step 6: Formatar e rodar**

Run:

```bash
npx prettier --write supabase/functions/portal-funcionario/index.ts supabase/functions/portal-funcionario/regras.ts supabase/functions/portal-funcionario/regras.test.ts supabase/functions/portal-funcionario/trilha-imutavel.test.ts supabase/functions/portal-funcionario/atividades-index.test.ts
node --test supabase/functions/portal-funcionario/atividades-index.test.ts supabase/functions/portal-funcionario/regras.test.ts supabase/functions/portal-funcionario/trilha-imutavel.test.ts
```

Expected: PASS — `# fail 0` (`atividades-index.test.ts` com 9 testes; o loop de `dentroDoVolume: passa até o teto da
ação…` em `regras.test.ts` passa a cobrir também `atividade`).

- [ ] **Step 7: Checagens**

Run:

```bash
npx prettier --check supabase/functions/portal-funcionario/index.ts supabase/functions/portal-funcionario/regras.ts supabase/functions/portal-funcionario/regras.test.ts supabase/functions/portal-funcionario/trilha-imutavel.test.ts supabase/functions/portal-funcionario/atividades-index.test.ts
node --test "supabase/functions/**/*.test.ts"
npm test --workspace=apps/web
npm run lint
```

Expected: prettier sem avisos; servidor = total da Task 7 **+ 5**, 0 falhas (`avisos.test.ts`, `acompanhamento-a6.test.ts`
e `tutor.test.ts` continuam verdes: as ações novas ficam depois de `duvida` e não usam `prepararProva`,
`avisarGestores` nem `treinamento_tentativa`); front igual; lint sem erros. Anote os dois totais.

- [ ] **Step 8: Commit**

```bash
git status
git add supabase/functions/portal-funcionario/index.ts supabase/functions/portal-funcionario/regras.ts supabase/functions/portal-funcionario/regras.test.ts supabase/functions/portal-funcionario/trilha-imutavel.test.ts supabase/functions/portal-funcionario/atividades-index.test.ts
git diff --staged --stat
git commit -F - -- supabase/functions/portal-funcionario/index.ts supabase/functions/portal-funcionario/regras.ts supabase/functions/portal-funcionario/regras.test.ts supabase/functions/portal-funcionario/trilha-imutavel.test.ts supabase/functions/portal-funcionario/atividades-index.test.ts <<'EOF'
feat(ead): ações questionario_abrir e questionario_enviar no portal do aluno

O questionário do módulo (A2) abre pelo servidor: sorteio criptográfico das questões e alternativas, início gravado
na trilha (questionario_iniciado) e a mesma tentativa reabre com o mesmo sorteio. O envio confere o sorteio, corrige
com a nota mínima dos módulos, grava a tentativa imutável em treinamento_questionario_tentativa, registra
questionario_envio e devolve a correção comentada aprovado ou não; aprovado conclui a aula por concluirAula.
As ações novas têm teto de volume próprio (portal-atividade, 180 em 10 min), e a guarda da trilha passa a cobrir as
tentativas dos questionários.

Como testar: node --test "supabase/functions/**/*.test.ts"

Produção (só o Javerson, na ordem da seção Produção do plano; a migração 0170 antes):
npx supabase@2.118.0 functions deploy portal-funcionario --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt --use-api

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

---

### Task 9: `index.ts`: ações do caso

**Files:**

- Create: `supabase/functions/portal-funcionario/caso-aluno.ts`
- Create: `supabase/functions/portal-funcionario/caso-aluno.test.ts`
- Modify: `supabase/functions/portal-funcionario/index.ts` (cabeçalho depois das linhas do questionário da Task 8;
  `Body` `:302-303`; imports depois do `} from "./questionario.ts";`; ações novas antes de
  `return fail("Ação desconhecida", 400)`)
- Modify: `supabase/functions/portal-funcionario/atividades-index.test.ts` (testes no fim)

**Interfaces:**

- Consumes:
  - C3 (`caso.ts`, Task 3): `validarCaso`, `estadoDoCaso`, `etapaParaAluno`, `resultadoDaEscolha`,
    `escolhasDaRodada`, `type EstadoDoCaso`.
  - Task 6: `aulaDaAtividade`, `type AulaDaTrilha`; `type RecusaDaProva` (`prova.ts`); `causa` (`conclusao.ts`).
  - Task 7: `concluirAula`; Task 8: `tempoDaAula`, `VOLUME_POR_ACAO.atividade`.
  - C1: `treinamento_caso (empresa_id, curso_id, aula_id, conteudo, deleted_at)`; `treinamento_evento.id` (identidade,
    ordem de gravação).
- Produces (`caso-aluno.ts`):

```ts
export const EVENTO_CASO_ESCOLHA = "caso_escolha";
export const EVENTO_CASO_REINICIADO = "caso_reiniciado";
export const EVENTO_CASO_CONCLUIDO = "caso_concluido";
export const MOTIVO_CASO_ALTERADO = "caso_alterado";
export const MSG_CASO_INDISPONIVEL: string; // 503
export const RECUSAS_DO_CASO: Record<"CASO_INVALIDO" | "CASO_ENCERRADO" | "CASO_FORA_DE_ORDEM" | "OPCAO_INVALIDA"
  | "CASO_INCOMPLETO", { status: 400 | 409; mensagem: string }>;
export function recusaDoCaso(codigo, extra?): RecusaDaProva; // extra = { codigo, ...extra }
export async function prepararCaso(supabase, mat, aulaId: unknown, empresaId: string): Promise<{ falha: RecusaDaProva }
  | { falha: null; aula: AulaDaTrilha; concluida: boolean; conteudo: unknown; eventos: { evento; detalhe }[] }>;
export function situacaoDoCaso(conteudo, eventos): { recusa: RecusaDaProva } | { recusa: null; rodada: number;
  escolhas: { etapa: string; opcao: number }[]; estado: EstadoDoCaso; reiniciar: { rodada: number; motivo: string } | null };
export function respostaDoCasoConcluido(conteudo): { situacao: "concluido"; contexto; reflexao };
export function respostaDaAbertura(conteudo, estado, aleatorio):
  { situacao: "fim"; contexto; reflexao; ultimo } | { situacao: "etapa"; contexto; etapa; passagem; ultimo };
export function escolhaNoCaso(conteudo, situacao, etapaId: string, opcao: unknown, aleatorio):
  { recusa: RecusaDaProva } | { recusa: null; detalhe: { rodada; etapa; opcao; segura; proxima; passagem };
    resposta: { comentario; segura; passagem; fim; etapa; reflexao } };
export function conclusaoDoCaso(situacao): { recusa: RecusaDaProva } | { recusa: null;
  eventoExtra: { evento: "caso_concluido"; detalhe: { rodada: number; escolhas: number } } };
```

- Produces (`index.ts`): ações `caso_abrir`, `caso_escolher`, `caso_concluir` (C5) e os eventos `caso_escolha`,
  `caso_reiniciado`, `caso_concluido` (C2).

- [ ] **Step 1: Escrever o teste da orquestração (que falha)**

Crie `supabase/functions/portal-funcionario/caso-aluno.test.ts`:

```ts
// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/caso-aluno.test.ts
//
// Caso com decisões (A3, spec 2026-10-14 §4.3): a leitura do caso com o banco injetado (`prepararCaso`) e as
// respostas das três ações, sobre a regra do roteiro de caso.ts. O roteiro de teste é sintético e ramificado como os
// rascunhos (a escolha insegura leva a uma etapa de recuperação, que volta à decisão). Nada de material real.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conclusaoDoCaso,
  escolhaNoCaso,
  EVENTO_CASO_ESCOLHA,
  EVENTO_CASO_REINICIADO,
  MSG_CASO_INDISPONIVEL,
  prepararCaso,
  recusaDoCaso,
  respostaDaAbertura,
  respostaDoCasoConcluido,
  situacaoDoCaso,
} from "./caso-aluno.ts";
import { MSG_TRILHA_INDISPONIVEL } from "./regras.ts";

type Resposta = { data: unknown; error?: unknown };
type Chamada = { tabela: string; filtros: unknown[][] };
type Evento = { evento: string; detalhe: unknown };

/** Banco de teste: `cenario[tabela]` dá a resposta da leitura (uma lista dá uma resposta por chamada). */
function bancoDeTeste(cenario: Record<string, Resposta | Resposta[]>) {
  const chamadas: Chamada[] = [];
  const usadas = new Map<string, number>();
  const proxima = (tabela: string): Resposta => {
    const r = cenario[tabela];
    if (!Array.isArray(r)) return r ?? { data: [], error: null };
    const i = usadas.get(tabela) ?? 0;
    usadas.set(tabela, i + 1);
    return r[Math.min(i, r.length - 1)];
  };
  const db = {
    from(tabela: string) {
      const chamada: Chamada = { tabela, filtros: [] };
      chamadas.push(chamada);
      const anotar =
        (nome: string) =>
        (...args: unknown[]) => (chamada.filtros.push([nome, ...args]), consulta);
      const consulta: Record<string, unknown> = {
        select: anotar("select"),
        eq: anotar("eq"),
        in: anotar("in"),
        is: anotar("is"),
        not: anotar("not"),
        order: anotar("order"),
        limit: anotar("limit"),
        maybeSingle: anotar("maybeSingle"),
        insert: anotar("insert"),
        update: anotar("update"),
        upsert: anotar("upsert"),
        then: (resolve: (v: unknown) => unknown, rejeitar?: (e: unknown) => unknown) =>
          Promise.resolve()
            .then(() => proxima(tabela))
            .then(resolve, rejeitar),
      };
      return consulta;
    },
  };
  const de = (tabela: string) => chamadas.filter((c) => c.tabela === tabela);
  const escritas = () =>
    chamadas.filter((c) =>
      c.filtros.some((f) => ["insert", "update", "upsert"].includes(String(f[0])))
    );
  return { db, chamadas, de, escritas };
}

const tem = (c: Chamada | undefined, filtro: unknown[]) =>
  !!c?.filtros.some((f) => JSON.stringify(f) === JSON.stringify(filtro));

/** Roda `fn` com o console.error capturado (as causas que a função manda ao log). */
async function comLog<T>(fn: () => Promise<T>): Promise<{ valor: T; erros: unknown[][] }> {
  const original = console.error;
  const erros: unknown[][] = [];
  console.error = (...a: unknown[]) => void erros.push(a);
  try {
    return { valor: await fn(), erros };
  } finally {
    console.error = original;
  }
}

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const CURSO_ID = "00000000-0000-4000-8000-000000000002";
const MAT = {
  id: "00000000-0000-4000-8000-000000000003",
  curso_id: CURSO_ID,
  status: "em_andamento",
};
const AULA_VIDEO = "00000000-0000-4000-8000-000000000010";
const AULA_QUEST = "00000000-0000-4000-8000-000000000011";
const AULA_CASO = "00000000-0000-4000-8000-000000000012";
const AULA_DE_OUTRO_CURSO = "00000000-0000-4000-8000-000000000019";
const FALHA = { message: "conexão com o banco caiu" };
const ok = (data: unknown): Resposta => ({ data, error: null });
const erro: Resposta = { data: null, error: FALHA };

/** Caso ramificado: a insegura de e1 leva à recuperação r1, que volta a e1; a segura de e2 encerra. */
const ROTEIRO = {
  contexto: "Contexto sintético do caso.",
  etapas: [
    {
      id: "e1",
      pergunta: "Pergunta 1?",
      opcoes: [
        { texto: "Segura 1", comentario: "Certo 1", segura: true, proxima: "e2" },
        { texto: "Insegura 1", comentario: "Errado 1", segura: false, proxima: "r1" },
      ],
    },
    {
      id: "r1",
      pergunta: "Recuperação?",
      opcoes: [
        { texto: "Volta", comentario: "Volte à decisão", segura: true, proxima: "e1" },
        { texto: "Insiste", comentario: "Ainda errado", segura: false, proxima: "r1" },
      ],
    },
    {
      id: "e2",
      pergunta: "Pergunta 2?",
      opcoes: [
        { texto: "Segura 2", comentario: "Certo 2", segura: true, proxima: null },
        { texto: "Insegura 2", comentario: "Errado 2", segura: false, proxima: "e2" },
      ],
    },
  ],
  reflexao: "Reflexão sintética.",
};
/** O roteiro depois que o RH o trocou: outra etapa inicial (o caminho gravado no antigo não confere). */
const ROTEIRO_NOVO = {
  contexto: "Contexto novo.",
  etapas: [
    {
      id: "n1",
      pergunta: "Pergunta nova?",
      opcoes: [
        { texto: "Segura nova", comentario: "Certo novo", segura: true, proxima: null },
        { texto: "Insegura nova", comentario: "Errado novo", segura: false, proxima: "n1" },
      ],
    },
  ],
  reflexao: "Reflexão nova.",
};

const primeiro = () => 0;
const escolhaGravada = (rodada: number, etapa: string, opcao: number): Evento => ({
  evento: EVENTO_CASO_ESCOLHA,
  detalhe: { rodada, etapa, opcao, segura: true, proxima: null, passagem: 1 },
});

const AULAS = ok([
  { id: AULA_VIDEO, ordem: 1, tipo: "video", duracao_seg: 600 },
  { id: AULA_QUEST, ordem: 2, tipo: "questionario", duracao_seg: 900 },
  { id: AULA_CASO, ordem: 3, tipo: "caso", duracao_seg: 600 },
]);
const feita = (aulaId: string) => ({
  aula_id: aulaId,
  concluida: true,
  concluida_em: "2026-10-14T13:00:00.000Z",
});
const ATE_O_CASO = ok([feita(AULA_VIDEO), feita(AULA_QUEST)]);

const cenario = (troca: Record<string, Resposta | Resposta[]> = {}) => ({
  treinamento_aula: AULAS,
  treinamento_progresso: ATE_O_CASO,
  treinamento_caso: ok({ conteudo: ROTEIRO }),
  treinamento_evento: ok([]),
  ...troca,
});

async function preparar(troca: Record<string, Resposta | Resposta[]> = {}, aulaId: string = AULA_CASO) {
  const banco = bancoDeTeste(cenario(troca));
  const { valor, erros } = await comLog(() => prepararCaso(banco.db, MAT, aulaId, EMPRESA));
  return { preparo: valor, erros, ...banco };
}

/** A situação de um roteiro que tem de ser aceito (o teste falha se a regra o recusar). */
function situacao(conteudo: unknown, eventos: Evento[]) {
  const s = situacaoDoCaso(conteudo, eventos);
  if (s.recusa) return assert.fail(`roteiro recusado: ${s.recusa.mensagem}`);
  return s;
}

// ------------------------------------------------------------------------------ leitura (banco injetado)

test("prepararCaso: aula do tipo caso e liberada, com o roteiro e a trilha desta matrícula (empresa da sessão, ordem de gravação)", async () => {
  const eventos = [escolhaGravada(1, "e1", 1)];
  const { preparo, de, erros, escritas } = await preparar({ treinamento_evento: ok(eventos) });
  assert.equal(preparo.falha, null);
  if (preparo.falha !== null) return;
  assert.equal(preparo.aula.id, AULA_CASO);
  assert.equal(preparo.concluida, false);
  assert.deepEqual(preparo.conteudo, ROTEIRO);
  assert.deepEqual(preparo.eventos, eventos);
  assert.deepEqual(erros, []);
  const roteiro = de("treinamento_caso")[0];
  for (const filtro of [
    ["eq", "aula_id", AULA_CASO],
    ["eq", "curso_id", CURSO_ID],
    ["eq", "empresa_id", EMPRESA],
    ["is", "deleted_at", null],
  ]) {
    assert.ok(tem(roteiro, filtro), JSON.stringify(filtro));
  }
  const trilha = de("treinamento_evento")[0];
  for (const filtro of [
    ["eq", "matricula_id", MAT.id],
    ["eq", "aula_id", AULA_CASO],
    ["eq", "empresa_id", EMPRESA],
    ["in", "evento", ["caso_escolha", "caso_reiniciado"]],
    ["order", "id", { ascending: true }],
  ]) {
    assert.ok(tem(trilha, filtro), JSON.stringify(filtro));
  }
  assert.equal(escritas().length, 0);
});

test("prepararCaso: sem roteiro gravado volta conteudo null, e a situação dele é CASO_INVALIDO", async () => {
  const { preparo } = await preparar({ treinamento_caso: ok(null) });
  assert.equal(preparo.falha, null);
  if (preparo.falha !== null) return;
  assert.equal(preparo.conteudo, null);
  assert.equal(situacaoDoCaso(preparo.conteudo, []).recusa?.extra?.codigo, "CASO_INVALIDO");
});

test("prepararCaso: roteiro ou trilha ilegíveis são 503 (com a causa no log); trilha do curso ilegível também", async () => {
  for (const [tabela, nome] of [
    ["treinamento_caso", "roteiro"],
    ["treinamento_evento", "trilha"],
  ]) {
    const { preparo, erros } = await preparar({ [tabela]: erro });
    assert.deepEqual(preparo, { falha: { mensagem: MSG_CASO_INDISPONIVEL, status: 503 } }, tabela);
    assert.equal(erros.length, 1, tabela);
    assert.match(String(erros[0][0]), new RegExp(`prepararCaso: ${nome}`));
    assert.ok(erros[0].includes(FALHA.message), "a causa vai ao log");
  }
  for (const tabela of ["treinamento_aula", "treinamento_progresso"]) {
    const { preparo, de } = await preparar({ [tabela]: erro });
    assert.deepEqual(preparo, { falha: { mensagem: MSG_TRILHA_INDISPONIVEL, status: 503 } }, tabela);
    assert.equal(de("treinamento_caso").length, 0, tabela);
  }
});

test("prepararCaso: aula de outro tipo ou de fora do curso é 400; bloqueada é 409 AULA_BLOQUEADA; nada é lido do roteiro", async () => {
  const quest = await preparar({}, AULA_QUEST);
  assert.deepEqual(quest.preparo, { falha: { mensagem: "Esta aula não é um caso", status: 400 } });
  const fora = await preparar({}, AULA_DE_OUTRO_CURSO);
  assert.deepEqual(fora.preparo, { falha: { mensagem: "Aula não pertence ao curso", status: 400 } });
  const bloqueada = await preparar({ treinamento_progresso: ok([feita(AULA_VIDEO)]) });
  assert.deepEqual(bloqueada.preparo, {
    falha: {
      mensagem: "Conclua a aula anterior primeiro",
      status: 409,
      extra: { codigo: "AULA_BLOQUEADA" },
    },
  });
  for (const r of [quest, fora, bloqueada]) assert.equal(r.de("treinamento_caso").length, 0);
});

test("prepararCaso: aula concluída volta concluida: true", async () => {
  const { preparo } = await preparar({
    treinamento_progresso: ok([feita(AULA_VIDEO), feita(AULA_QUEST), feita(AULA_CASO)]),
  });
  assert.equal(preparo.falha, null);
  if (preparo.falha !== null) return;
  assert.equal(preparo.concluida, true);
});

// ------------------------------------------------------------------------------ situação refeita da trilha

test("situacaoDoCaso: roteiro inválido (ou ausente) é 409 CASO_INVALIDO, sem rodada nem reinício", () => {
  for (const conteudo of [{ contexto: "", etapas: [], reflexao: "" }, null, "texto"]) {
    const s = situacaoDoCaso(conteudo, []);
    assert.deepEqual(s, {
      recusa: {
        mensagem: "Este caso está com problema — avise o RH",
        status: 409,
        extra: { codigo: "CASO_INVALIDO" },
      },
    });
  }
});

test("situacaoDoCaso: sem escolhas, a rodada 1 começa na primeira etapa (sem reinício)", () => {
  const s = situacao(ROTEIRO, []);
  assert.equal(s.rodada, 1);
  assert.deepEqual(s.escolhas, []);
  assert.equal(s.reiniciar, null);
  assert.equal(s.estado.etapaAtual, "e1");
  assert.equal(s.estado.fim, false);
  assert.equal(s.estado.passagens.e1, 1);
  assert.equal(s.estado.ultimo, null);
});

test("situacaoDoCaso: roteiro alterado depois das escolhas recomeça a rodada (caso_alterado); a rodada nova passa a valer", () => {
  const antigas = [escolhaGravada(1, "e1", 0)];
  const s = situacao(ROTEIRO_NOVO, antigas);
  assert.deepEqual(s.reiniciar, { rodada: 2, motivo: "caso_alterado" });
  assert.equal(s.rodada, 2);
  assert.deepEqual(s.escolhas, []);
  assert.equal(s.estado.etapaAtual, "n1");
  // depois de gravar o reinício e uma escolha da rodada 2, a rodada 1 fica para trás
  const depois = situacao(ROTEIRO_NOVO, [
    ...antigas,
    { evento: EVENTO_CASO_REINICIADO, detalhe: { rodada: 2, motivo: "caso_alterado" } },
    escolhaGravada(2, "n1", 1),
  ]);
  assert.equal(depois.reiniciar, null);
  assert.equal(depois.rodada, 2);
  assert.deepEqual(depois.escolhas, [{ etapa: "n1", opcao: 1 }]);
  assert.equal(depois.estado.etapaAtual, "n1");
  assert.equal(depois.estado.passagens.n1, 2);
});

// ------------------------------------------------------------------------------ respostas ao aluno

test("respostaDaAbertura: a etapa vai só com a pergunta e o texto das opções (índice original); no fim, a reflexão", () => {
  const r = respostaDaAbertura(ROTEIRO, situacao(ROTEIRO, []).estado, primeiro);
  assert.equal(r.situacao, "etapa");
  if (r.situacao !== "etapa") return;
  assert.equal(r.contexto, ROTEIRO.contexto);
  assert.equal(r.passagem, 1);
  assert.equal(r.ultimo, null);
  assert.equal(r.etapa.id, "e1");
  assert.equal(r.etapa.pergunta, "Pergunta 1?");
  assert.deepEqual(r.etapa.opcoes.map((o) => o.indice).sort(), [0, 1]);
  for (const o of r.etapa.opcoes) assert.equal(o.texto, ROTEIRO.etapas[0].opcoes[o.indice].texto);
  // nada do que decide o caso sai antes do clique
  const json = JSON.stringify(r);
  for (const segredo of ["segura", "comentario", "proxima", "Certo 1", "Errado 1", ROTEIRO.reflexao]) {
    assert.equal(json.includes(segredo), false, segredo);
  }
  const fim = situacao(ROTEIRO, [escolhaGravada(1, "e1", 0), escolhaGravada(1, "e2", 0)]);
  assert.deepEqual(respostaDaAbertura(ROTEIRO, fim.estado, primeiro), {
    situacao: "fim",
    contexto: ROTEIRO.contexto,
    reflexao: ROTEIRO.reflexao,
    ultimo: { comentario: "Certo 2", segura: true },
  });
});

test("respostaDoCasoConcluido: o contexto e a reflexão (texto vazio se o roteiro sumiu)", () => {
  assert.deepEqual(respostaDoCasoConcluido(ROTEIRO), {
    situacao: "concluido",
    contexto: ROTEIRO.contexto,
    reflexao: ROTEIRO.reflexao,
  });
  assert.deepEqual(respostaDoCasoConcluido(null), { situacao: "concluido", contexto: "", reflexao: "" });
});

test("escolhaNoCaso: o detalhe do C2 para a trilha e a resposta com o comentário e a próxima etapa (sem segredos dela)", () => {
  const e = escolhaNoCaso(ROTEIRO, situacao(ROTEIRO, []), "e1", 1, primeiro);
  if (e.recusa) return assert.fail(e.recusa.mensagem);
  assert.deepEqual(e.detalhe, {
    rodada: 1,
    etapa: "e1",
    opcao: 1,
    segura: false,
    proxima: "r1",
    passagem: 1,
  });
  assert.equal(e.resposta.comentario, "Errado 1");
  assert.equal(e.resposta.segura, false);
  assert.equal(e.resposta.passagem, 1);
  assert.equal(e.resposta.fim, false);
  assert.equal(e.resposta.reflexao, null);
  assert.equal(e.resposta.etapa?.id, "r1");
  const json = JSON.stringify(e.resposta.etapa);
  for (const segredo of ["segura", "comentario", "proxima"]) {
    assert.equal(json.includes(segredo), false, segredo);
  }
});

test("escolhaNoCaso: etapa que não é a atual é 409 com o estado; opção inválida 400; caso no fim 409 encerrado", () => {
  // o aluno já está em e2 e a página velha manda e1
  const emE2 = situacao(ROTEIRO, [escolhaGravada(1, "e1", 0)]);
  const fora = escolhaNoCaso(ROTEIRO, emE2, "e1", 0, primeiro);
  assert.equal(fora.recusa?.status, 409);
  assert.equal(fora.recusa?.extra?.codigo, "CASO_FORA_DE_ORDEM");
  const estado = fora.recusa?.extra?.estado as { situacao: string; etapa: { id: string } };
  assert.equal(estado.situacao, "etapa");
  assert.equal(estado.etapa.id, "e2");
  for (const opcao of [7, -1, null]) {
    const r = escolhaNoCaso(ROTEIRO, emE2, "e2", opcao, primeiro);
    assert.equal(r.recusa?.status, 400, String(opcao));
    assert.equal(r.recusa?.extra?.codigo, "OPCAO_INVALIDA", String(opcao));
  }
  const noFim = situacao(ROTEIRO, [escolhaGravada(1, "e1", 0), escolhaGravada(1, "e2", 0)]);
  const encerrado = escolhaNoCaso(ROTEIRO, noFim, "e2", 0, primeiro);
  assert.equal(encerrado.recusa?.status, 409);
  assert.equal(encerrado.recusa?.extra?.codigo, "CASO_ENCERRADO");
});

test("fluxo: a insegura leva à recuperação, que volta à decisão; a segura final encerra e só então o caso conclui", () => {
  const eventos: Evento[] = [];
  /** Uma escolha como o index.ts faz: refaz a situação pela trilha, confere pela regra e grava o detalhe. */
  const escolher = (etapa: string, opcao: number) => {
    const escolha = escolhaNoCaso(ROTEIRO, situacao(ROTEIRO, eventos), etapa, opcao, primeiro);
    if (!escolha.recusa) eventos.push({ evento: EVENTO_CASO_ESCOLHA, detalhe: escolha.detalhe });
    return escolha;
  };
  const errou = escolher("e1", 1);
  if (errou.recusa) return assert.fail(errou.recusa.mensagem);
  assert.equal(errou.resposta.etapa?.id, "r1");
  const voltou = escolher("r1", 0);
  if (voltou.recusa) return assert.fail(voltou.recusa.mensagem);
  assert.equal(voltou.resposta.etapa?.id, "e1");
  // de volta à decisão: a segunda passagem por e1, com o último comentário para a tela retomar
  const retomada = respostaDaAbertura(ROTEIRO, situacao(ROTEIRO, eventos).estado, primeiro);
  if (retomada.situacao !== "etapa") return assert.fail("esperava a etapa e1");
  assert.equal(retomada.etapa.id, "e1");
  assert.equal(retomada.passagem, 2);
  assert.deepEqual(retomada.ultimo, { comentario: "Volte à decisão", segura: true });
  const acertou = escolher("e1", 0);
  if (acertou.recusa) return assert.fail(acertou.recusa.mensagem);
  assert.deepEqual(acertou.detalhe, {
    rodada: 1,
    etapa: "e1",
    opcao: 0,
    segura: true,
    proxima: "e2",
    passagem: 2,
  });
  // ainda não chegou ao fim: concluir é recusado
  assert.equal(conclusaoDoCaso(situacao(ROTEIRO, eventos)).recusa?.extra?.codigo, "CASO_INCOMPLETO");
  const fim = escolher("e2", 0);
  if (fim.recusa) return assert.fail(fim.recusa.mensagem);
  assert.equal(fim.resposta.fim, true);
  assert.equal(fim.resposta.etapa, null);
  assert.equal(fim.resposta.reflexao, ROTEIRO.reflexao);
  // depois do fim: nova escolha é recusada e concluir passa, com as 4 escolhas da rodada
  assert.equal(escolher("e2", 0).recusa?.extra?.codigo, "CASO_ENCERRADO");
  const conclusao = conclusaoDoCaso(situacao(ROTEIRO, eventos));
  if (conclusao.recusa) return assert.fail(conclusao.recusa.mensagem);
  assert.deepEqual(conclusao.eventoExtra, {
    evento: "caso_concluido",
    detalhe: { rodada: 1, escolhas: 4 },
  });
});

test("recusaDoCaso: status e textos das recusas do caso (C5)", () => {
  assert.deepEqual(recusaDoCaso("CASO_INVALIDO"), {
    mensagem: "Este caso está com problema — avise o RH",
    status: 409,
    extra: { codigo: "CASO_INVALIDO" },
  });
  assert.deepEqual(recusaDoCaso("CASO_INCOMPLETO"), {
    mensagem: "Chegue ao fim do caso para concluir",
    status: 409,
    extra: { codigo: "CASO_INCOMPLETO" },
  });
  assert.equal(recusaDoCaso("OPCAO_INVALIDA").status, 400);
  assert.equal(recusaDoCaso("CASO_ENCERRADO").status, 409);
  assert.deepEqual(recusaDoCaso("CASO_FORA_DE_ORDEM", { estado: { situacao: "fim" } }).extra, {
    codigo: "CASO_FORA_DE_ORDEM",
    estado: { situacao: "fim" },
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test supabase/functions/portal-funcionario/caso-aluno.test.ts`

Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../portal-funcionario/caso-aluno.ts' imported
from .../caso-aluno.test.ts` (`# fail 1`).

- [ ] **Step 3: Implementar a orquestração**

Crie `supabase/functions/portal-funcionario/caso-aluno.ts`:

```ts
/**
 * Caso com decisões no portal-funcionario (A3): o que as ações `caso_abrir`, `caso_escolher` e `caso_concluir`
 * leem do banco e o que respondem.
 *
 * A regra do roteiro (validar, refazer o caminho, etapa para o aluno, resultado do clique) é a de `caso.ts`, cópia
 * conferida do front (`lib/ead-caso.js`). Aqui fica a orquestração do lado do aluno, fora do `index.ts` (que não é
 * importável no Node) para ser testada: `prepararCaso` recebe o banco por parâmetro (`caso-aluno.test.ts` injeta um
 * banco de teste) e o resto é puro. Sem `Deno.*` e sem import de URL. O `index.ts` liga a rede, grava os eventos na
 * trilha e conclui a aula (`concluirAula`).
 *
 * O estado do caso não fica em tabela nenhuma: é refeito a cada pedido a partir das escolhas gravadas na trilha
 * (`caso_escolha` desta matrícula e aula, da rodada atual), sobre o roteiro de HOJE. Caminho que não confere mais (o
 * RH mudou o roteiro) recomeça a rodada (`caso_reiniciado`, motivo `caso_alterado`). Roteiro inválido (gravado sem
 * passar pela tela) é 409 `CASO_INVALIDO`, sem gravar nada. O navegador nunca recebe `segura`, `comentario` nem
 * `proxima` de uma opção antes do clique.
 */

import {
  escolhasDaRodada,
  estadoDoCaso,
  etapaParaAluno,
  resultadoDaEscolha,
  validarCaso,
} from "./caso.ts";
import type { EstadoDoCaso } from "./caso.ts";
import { causa } from "./conclusao.ts";
import type { RecusaDaProva } from "./prova.ts";
import { aulaDaAtividade } from "./questionario.ts";
import type { AulaDaTrilha } from "./questionario.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const LOG = "[portal-funcionario]";

/** Eventos do caso na trilha (C2): gravados só pelo servidor, nunca pela ação `evento`. */
export const EVENTO_CASO_ESCOLHA = "caso_escolha";
export const EVENTO_CASO_REINICIADO = "caso_reiniciado";
export const EVENTO_CASO_CONCLUIDO = "caso_concluido";
/** Por que a rodada recomeçou: o caminho gravado não confere com o roteiro de hoje. */
export const MOTIVO_CASO_ALTERADO = "caso_alterado";

/** A leitura do caso (roteiro ou trilha) falhou, ou o reinício não ficou gravado: o aluno só tenta de novo. */
export const MSG_CASO_INDISPONIVEL =
  "Não foi possível abrir o caso agora. Tente de novo em instantes.";

/** As recusas do caso (C5): status e o texto que o portal mostra. */
export const RECUSAS_DO_CASO = {
  CASO_INVALIDO: { status: 409, mensagem: "Este caso está com problema — avise o RH" },
  CASO_ENCERRADO: { status: 409, mensagem: "Este caso já chegou ao fim" },
  CASO_FORA_DE_ORDEM: {
    status: 409,
    mensagem: "O caso já está em outra etapa: continue de onde ele parou",
  },
  OPCAO_INVALIDA: { status: 400, mensagem: "Escolha uma das opções desta etapa" },
  CASO_INCOMPLETO: { status: 409, mensagem: "Chegue ao fim do caso para concluir" },
} as const;

export type CodigoDoCaso = keyof typeof RECUSAS_DO_CASO;

/** A recusa como o `index.ts` a devolve (`recusaDaProva`): o código vai no `extra`, junto com o que houver. */
export function recusaDoCaso(codigo: CodigoDoCaso, extra?: Record<string, unknown>): RecusaDaProva {
  const { status, mensagem } = RECUSAS_DO_CASO[codigo];
  return { mensagem, status, extra: { codigo, ...extra } };
}

export type EventoDoCaso = { evento: string; detalhe: unknown };

export type PreparoDoCaso =
  | { falha: RecusaDaProva }
  | {
      falha: null;
      aula: AulaDaTrilha;
      concluida: boolean;
      conteudo: unknown;
      eventos: EventoDoCaso[];
    };

/**
 * Confere a aula (do curso da matrícula, do tipo `caso` e liberada: `aulaDaAtividade`) e lê o roteiro (só o da
 * empresa da sessão, não apagado) e as escolhas e reinícios desta matrícula nesta aula, na ordem de gravação (o `id`
 * da trilha). Leitura com erro é 503: o caminho refeito sem a trilha toda mandaria o aluno para a etapa errada.
 * Roteiro ausente volta `conteudo: null` (a situação dele é `CASO_INVALIDO`).
 */
export async function prepararCaso(
  supabase: Db,
  // deno-lint-ignore no-explicit-any
  mat: any,
  aulaId: unknown,
  empresaId: string
): Promise<PreparoDoCaso> {
  const atividade = await aulaDaAtividade(supabase, mat, aulaId, empresaId, "caso");
  if (atividade.falha) return { falha: atividade.falha };
  const { aula, concluida } = atividade;
  const [{ data: roteiro, error: erroRoteiro }, { data: eventos, error: erroEventos }] =
    await Promise.all([
      supabase
        .from("treinamento_caso")
        .select("conteudo")
        .eq("aula_id", aula.id)
        .eq("curso_id", mat.curso_id)
        .eq("empresa_id", empresaId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("treinamento_evento")
        .select("evento, detalhe")
        .eq("matricula_id", mat.id)
        .eq("aula_id", aula.id)
        .eq("empresa_id", empresaId)
        .in("evento", [EVENTO_CASO_ESCOLHA, EVENTO_CASO_REINICIADO])
        .order("id", { ascending: true }),
    ]);
  if (erroRoteiro) console.error(`${LOG} prepararCaso: roteiro:`, causa(erroRoteiro));
  if (erroEventos) console.error(`${LOG} prepararCaso: trilha:`, causa(erroEventos));
  if (erroRoteiro || erroEventos) {
    return { falha: { mensagem: MSG_CASO_INDISPONIVEL, status: 503 } };
  }
  return {
    falha: null,
    aula,
    concluida,
    conteudo: roteiro?.conteudo ?? null,
    eventos: eventos ?? [],
  };
}

export type SituacaoDoCaso =
  | { recusa: RecusaDaProva }
  | {
      recusa: null;
      rodada: number;
      escolhas: { etapa: string; opcao: number }[];
      estado: EstadoDoCaso;
      /** a rodada nova que o `index.ts` grava (`caso_reiniciado`) ANTES de responder; null = nada a gravar */
      reiniciar: { rodada: number; motivo: string } | null;
    };

/**
 * Onde o aluno está no caso, refeito das escolhas da rodada atual sobre o roteiro de hoje. Roteiro inválido: recusa
 * `CASO_INVALIDO`. Caminho gravado que não confere (o RH mudou o roteiro): a rodada seguinte começa da primeira etapa,
 * e `reiniciar` diz o que gravar na trilha.
 */
export function situacaoDoCaso(conteudo: unknown, eventos: EventoDoCaso[]): SituacaoDoCaso {
  if (validarCaso(conteudo).length > 0) return { recusa: recusaDoCaso("CASO_INVALIDO") };
  const { rodada, escolhas } = escolhasDaRodada(eventos);
  const estado = estadoDoCaso(conteudo, escolhas);
  if (estado.valido) return { recusa: null, rodada, escolhas, estado, reiniciar: null };
  if (estado.motivo !== "CAMINHO_DIVERGENTE") return { recusa: recusaDoCaso("CASO_INVALIDO") };
  const nova = rodada + 1;
  return {
    recusa: null,
    rodada: nova,
    escolhas: [],
    estado: estadoDoCaso(conteudo, []),
    reiniciar: { rodada: nova, motivo: MOTIVO_CASO_ALTERADO },
  };
}

/** `contexto` ou `reflexao` do roteiro (texto vazio se o roteiro não tem). */
const textoDo = (conteudo: unknown, campo: "contexto" | "reflexao"): string => {
  const valor =
    conteudo && typeof conteudo === "object"
      ? (conteudo as Record<string, unknown>)[campo]
      : undefined;
  return typeof valor === "string" ? valor : "";
};

/** A abertura de um caso já concluído: o aluno revê o contexto e a reflexão (não há rodada nova). */
export function respostaDoCasoConcluido(conteudo: unknown) {
  return {
    situacao: "concluido" as const,
    contexto: textoDo(conteudo, "contexto"),
    reflexao: textoDo(conteudo, "reflexao"),
  };
}

/**
 * A abertura de um caso em andamento (C5): no fim, o contexto, a reflexão e o último comentário; senão, o contexto e
 * a etapa atual só com os textos, embaralhada por `aleatorio` (o servidor passa `inteiroAleatorioSeguro`), com a
 * passagem atual por ela e o último comentário (a tela retoma de onde parou).
 */
export function respostaDaAbertura(
  conteudo: unknown,
  estado: EstadoDoCaso,
  aleatorio: (n: number) => number
) {
  const contexto = textoDo(conteudo, "contexto");
  if (estado.fim) {
    return {
      situacao: "fim" as const,
      contexto,
      reflexao: textoDo(conteudo, "reflexao"),
      ultimo: estado.ultimo,
    };
  }
  const etapaId = estado.etapaAtual as string;
  return {
    situacao: "etapa" as const,
    contexto,
    etapa: etapaParaAluno(conteudo, etapaId, aleatorio),
    passagem: estado.passagens[etapaId] ?? 1,
    ultimo: estado.ultimo,
  };
}

/**
 * O clique do aluno (C5): confere pela regra (`resultadoDaEscolha`) e devolve o detalhe do evento `caso_escolha`
 * (C2) e a resposta, ou a recusa. Fora de ordem (outra aba, página velha) leva o estado atual (`estado`, o mesmo
 * objeto da abertura) para a tela continuar de onde o caso está.
 */
export function escolhaNoCaso(
  conteudo: unknown,
  situacao: { rodada: number; estado: EstadoDoCaso },
  etapaId: string,
  opcao: unknown,
  aleatorio: (n: number) => number
) {
  const r = resultadoDaEscolha(conteudo, situacao.estado, etapaId, opcao);
  if (!r.ok) {
    const extra =
      r.codigo === "CASO_FORA_DE_ORDEM"
        ? { estado: respostaDaAbertura(conteudo, situacao.estado, aleatorio) }
        : undefined;
    return { recusa: recusaDoCaso(r.codigo, extra) };
  }
  return {
    recusa: null,
    detalhe: {
      rodada: situacao.rodada,
      etapa: etapaId,
      opcao: Number(opcao),
      segura: r.segura,
      proxima: r.proxima,
      passagem: r.passagem,
    },
    resposta: {
      comentario: r.comentario,
      segura: r.segura,
      passagem: r.passagem,
      fim: r.fim,
      etapa: r.fim || r.proxima === null ? null : etapaParaAluno(conteudo, r.proxima, aleatorio),
      reflexao: r.fim ? textoDo(conteudo, "reflexao") : null,
    },
  };
}

/**
 * Concluir o caso (C5): só com o caso no fim, nesta rodada e no roteiro de hoje; senão `CASO_INCOMPLETO`. Devolve o
 * evento extra que `concluirAula` grava antes do `aula_concluida` (`caso_concluido { rodada, escolhas }`).
 */
export function conclusaoDoCaso(situacao: {
  rodada: number;
  escolhas: unknown[];
  estado: EstadoDoCaso;
  reiniciar: unknown;
}) {
  if (situacao.reiniciar || !situacao.estado.fim) {
    return { recusa: recusaDoCaso("CASO_INCOMPLETO") };
  }
  return {
    recusa: null,
    eventoExtra: {
      evento: EVENTO_CASO_CONCLUIDO,
      detalhe: { rodada: situacao.rodada, escolhas: situacao.escolhas.length },
    },
  };
}
```

- [ ] **Step 4: Rodar a orquestração**

Run:

```bash
npx prettier --write supabase/functions/portal-funcionario/caso-aluno.ts supabase/functions/portal-funcionario/caso-aluno.test.ts
node --test supabase/functions/portal-funcionario/caso-aluno.test.ts
```

Expected: PASS — `# tests 14`, `# pass 14`, `# fail 0`. Se falhar só por uma suposição sobre o `caso.ts` (nota 3 do
topo: `CASO_ENCERRADO` antes de `CASO_FORA_DE_ORDEM`, passagem inicial 1), pare e compare com o C3 antes de mexer.

- [ ] **Step 5: Escrever os testes de texto das ações (que falham)**

No fim de `supabase/functions/portal-funcionario/atividades-index.test.ts`, acrescente:

```ts
// ---------------------------------------------------------------------- Task 9: caso com decisões

const ACOES_DO_CASO = ["caso_abrir", "caso_escolher", "caso_concluir"];

test("ações do caso: teto de atividade antes de ler, matrícula da sessão e preparo do caso; nada cru ao navegador", () => {
  for (const nome of ACOES_DO_CASO) {
    const t = trechoDaAcao(nome);
    const limite = t.indexOf('if (!(await dentroDoLimite("atividade"))) return muitasAcoes();');
    assert.ok(limite >= 0, `${nome}: sem o teto de atividade`);
    assert.ok(limite < t.indexOf("minhaMatricula(body.matricula_id)"), nome);
    assert.match(
      t,
      /const preparo = await prepararCaso\(supabase, mat, body\.aula_id, empresaId\);\s*if \(preparo\.falha\) return recusaDaProva\(preparo\.falha\);/,
      nome
    );
    // o roteiro e a trilha nunca vão crus: só as respostas montadas pela regra
    for (const [, chamada] of t.matchAll(/\bok\(\s*([A-Za-z_.{]+)/g)) {
      assert.ok(
        ["respostaDoCasoConcluido", "respostaDaAbertura", "escolha.resposta", "{", "fim"].includes(chamada),
        `${nome}: ok(${chamada}`
      );
    }
  }
});

test("caso_abrir: concluído só revê; roteiro inválido é 409 sem gravar; caminho que não confere grava a rodada nova antes de responder", () => {
  const t = trechoDaAcao("caso_abrir");
  const concluido = t.indexOf("if (preparo.concluida) return ok(respostaDoCasoConcluido(conteudo));");
  assert.ok(concluido > 0, "aula concluída não abre rodada nova");
  const situacao = t.indexOf("const situacao = situacaoDoCaso(conteudo, preparo.eventos);");
  assert.ok(situacao > concluido);
  assert.match(t, /if \(situacao\.recusa\) return recusaDaProva\(situacao\.recusa\);/);
  const reinicio = t.indexOf("evento: EVENTO_CASO_REINICIADO");
  assert.ok(reinicio > situacao);
  assert.match(t.slice(reinicio, reinicio + 300), /aula_id: aula\.id,\s*detalhe: situacao\.reiniciar/);
  assert.match(t, /if \(!reiniciou\) return fail\(MSG_CASO_INDISPONIVEL, 503\)/);
  assert.ok(reinicio < t.indexOf("respostaDaAbertura("));
  assert.match(t, /ok\(respostaDaAbertura\(conteudo, situacao\.estado, inteiroAleatorioSeguro\)\)/);
  // a única gravação é o reinício (abrir não escolhe nem conclui)
  assert.equal((t.match(/\bev\(\{/g) ?? []).length, 1);
  assert.doesNotMatch(t, /concluirAula\(/);
});

test("caso_escolher: confere a etapa atual pela regra, grava a escolha na trilha e só então responde", () => {
  const t = trechoDaAcao("caso_escolher");
  assert.match(t, /typeof body\.etapa_id !== "string"[\s\S]{0,160}400/);
  assert.ok(t.indexOf('typeof body.etapa_id !== "string"') < t.indexOf("prepararCaso("));
  assert.match(t, /if \(preparo\.concluida\) return recusaDaProva\(recusaDoCaso\("CASO_ENCERRADO"\)\);/);
  assert.match(t, /if \(situacao\.recusa\) return recusaDaProva\(situacao\.recusa\);/);
  // o reinício (roteiro mudado) também é gravado aqui, antes de conferir a escolha
  const reinicio = t.indexOf("evento: EVENTO_CASO_REINICIADO");
  const escolha = t.indexOf("escolhaNoCaso(");
  assert.ok(reinicio > 0 && reinicio < escolha);
  assert.match(
    t,
    /escolhaNoCaso\(\s*conteudo,\s*situacao,\s*body\.etapa_id,\s*body\.opcao,\s*inteiroAleatorioSeguro\s*\)/
  );
  assert.match(t, /if \(escolha\.recusa\) return recusaDaProva\(escolha\.recusa\);/);
  const gravacao = t.indexOf("evento: EVENTO_CASO_ESCOLHA");
  assert.ok(gravacao > escolha);
  assert.match(t.slice(gravacao, gravacao + 300), /aula_id: aula\.id,\s*detalhe: escolha\.detalhe/);
  assert.match(t, /if \(!gravou\) return fail\([^)]*503\)/);
  assert.ok(t.indexOf("ok(escolha.resposta)") > gravacao);
  assert.doesNotMatch(t, /concluirAula\(/);
});

test("caso_concluir: idempotente, só com o caso no fim e pela mesma conclusão de aula (caso_concluido + aula_concluida)", () => {
  const t = trechoDaAcao("caso_concluir");
  const repetido = t.indexOf("if (preparo.concluida)");
  assert.ok(repetido > 0, "concluir de novo tem de responder sem gravar");
  const bloco = t.slice(repetido, t.indexOf("}", repetido) + 1);
  assert.match(bloco, /aula_concluida: true/);
  assert.doesNotMatch(bloco, /ev\(|concluirAula\(/);
  assert.match(
    t,
    /const conclusao = conclusaoDoCaso\(situacao\);\s*if \(conclusao\.recusa\) return recusaDaProva\(conclusao\.recusa\);/
  );
  assert.match(t, /tempoDaAula\(mat, aula\.id\)/);
  assert.match(t, /const fim = await concluirAula\(mat, aula, segundos, conclusao\.eventoExtra\);/);
  assert.ok(t.indexOf("conclusaoDoCaso(") < t.indexOf("concluirAula("));
  assert.match(t, /if \(!fim\) return fail\([^)]*500\)/);
  // concluir não grava reinício nem escolha (só a conclusão, dentro de concluirAula)
  assert.doesNotMatch(t, /EVENTO_CASO_REINICIADO|EVENTO_CASO_ESCOLHA/);
  assert.equal((t.match(/\bev\(\{/g) ?? []).length, 0);
});

test("o navegador não grava os eventos do caso (fora de EVENTOS_CLIENTE)", () => {
  const original = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const inicio = original.indexOf("const EVENTOS_CLIENTE = new Set([");
  const lista = original.slice(inicio, original.indexOf("]);", inicio));
  assert.ok(lista.length > 50, "a lista de eventos do navegador não foi lida");
  for (const evento of ["caso_escolha", "caso_reiniciado", "caso_concluido"]) {
    assert.equal(lista.includes(evento), false, evento);
  }
});
```

Run: `node --test supabase/functions/portal-funcionario/atividades-index.test.ts`

Expected: FAIL — 4 falhas (`ação caso_abrir não encontrada no index.ts`, idem `caso_escolher` e `caso_concluir`); o
teste de `EVENTOS_CLIENTE` e os 9 das Tasks 7 e 8 passam.

- [ ] **Step 6: `index.ts` — cabeçalho, `Body` e imports**

6a. Cabeçalho, trecho atual (as linhas do questionário que a Task 8 pôs):

```ts
 *   questionario_enviar { matricula_id, aula_id, respostas } → corrige com a nota mínima do módulo, grava a tentativa
 *     e devolve a correção comentada aprovado ou não; aprovado conclui a aula (questionario.ts)
```

Novo:

```ts
 *   questionario_enviar { matricula_id, aula_id, respostas } → corrige com a nota mínima do módulo, grava a tentativa
 *     e devolve a correção comentada aprovado ou não; aprovado conclui a aula (questionario.ts)
 *   caso_abrir { matricula_id, aula_id }, caso_escolher { matricula_id, aula_id, etapa_id, opcao } e caso_concluir
 *     { matricula_id, aula_id } → o caso com decisões, com o estado refeito da trilha (caso.ts, caso-aluno.ts)
```

6b. `Body`, trecho atual (`:302-303`):

```ts
  concluir?: boolean;
  respostas?: unknown;
```

Novo:

```ts
  concluir?: boolean;
  respostas?: unknown;
  // caso_escolher: a etapa em que o aluno está e o índice ORIGINAL da opção clicada
  etapa_id?: string;
  opcao?: unknown;
```

6c. Imports, linha atual (o fim do import da Task 8):

```ts
} from "./questionario.ts";
```

Novo:

```ts
} from "./questionario.ts";
import {
  conclusaoDoCaso,
  escolhaNoCaso,
  EVENTO_CASO_ESCOLHA,
  EVENTO_CASO_REINICIADO,
  MSG_CASO_INDISPONIVEL,
  prepararCaso,
  recusaDoCaso,
  respostaDaAbertura,
  respostaDoCasoConcluido,
  situacaoDoCaso,
} from "./caso-aluno.ts";
```

- [ ] **Step 7: `index.ts` — as três ações**

Trecho atual (fim de `questionario_enviar`, da Task 8):

```ts
          revisao: revisaoDoQuestionario(questoes, acertou),
        })
      );
    }

    return fail("Ação desconhecida", 400);
```

Novo:

```ts
          revisao: revisaoDoQuestionario(questoes, acertou),
        })
      );
    }

    // ------------------------------------------------------------- caso com decisões
    // A3: só por clique. O estado é refeito a cada pedido a partir das escolhas da trilha (caso-aluno.ts, caso.ts); o
    // navegador recebe a pergunta e as opções só com o texto, embaralhadas, e só vê o comentário e se foi segura
    // depois do clique. Roteiro inválido: 409 sem gravar nada. Caminho que não confere com o roteiro de hoje: rodada
    // nova (`caso_reiniciado`), gravada ANTES da resposta. Concluir só com o caso no fim, por `concluirAula`.
    if (body.acao === "caso_abrir") {
      if (!(await dentroDoLimite("atividade"))) return muitasAcoes();
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat || !body.aula_id) return fail("Matrícula não encontrada", 404);
      const preparo = await prepararCaso(supabase, mat, body.aula_id, empresaId);
      if (preparo.falha) return recusaDaProva(preparo.falha);
      const { aula, conteudo } = preparo;
      // aula concluída não abre rodada nova: o aluno revê o contexto e a reflexão
      if (preparo.concluida) return ok(respostaDoCasoConcluido(conteudo));
      const situacao = situacaoDoCaso(conteudo, preparo.eventos);
      if (situacao.recusa) return recusaDaProva(situacao.recusa);
      if (situacao.reiniciar) {
        const reiniciou = await ev({
          evento: EVENTO_CASO_REINICIADO,
          matricula_id: mat.id,
          curso_id: mat.curso_id,
          aula_id: aula.id,
          detalhe: situacao.reiniciar,
        });
        // sem a marca na trilha, o próximo pedido refaria o caminho velho
        if (!reiniciou) return fail(MSG_CASO_INDISPONIVEL, 503);
      }
      return ok(respostaDaAbertura(conteudo, situacao.estado, inteiroAleatorioSeguro));
    }

    if (body.acao === "caso_escolher") {
      if (!(await dentroDoLimite("atividade"))) return muitasAcoes();
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat || !body.aula_id) return fail("Matrícula não encontrada", 404);
      if (typeof body.etapa_id !== "string" || !body.etapa_id) {
        return fail("Informe a etapa do caso", 400);
      }
      const preparo = await prepararCaso(supabase, mat, body.aula_id, empresaId);
      if (preparo.falha) return recusaDaProva(preparo.falha);
      const { aula, conteudo } = preparo;
      if (preparo.concluida) return recusaDaProva(recusaDoCaso("CASO_ENCERRADO"));
      const situacao = situacaoDoCaso(conteudo, preparo.eventos);
      if (situacao.recusa) return recusaDaProva(situacao.recusa);
      if (situacao.reiniciar) {
        const reiniciou = await ev({
          evento: EVENTO_CASO_REINICIADO,
          matricula_id: mat.id,
          curso_id: mat.curso_id,
          aula_id: aula.id,
          detalhe: situacao.reiniciar,
        });
        if (!reiniciou) return fail(MSG_CASO_INDISPONIVEL, 503);
      }
      const escolha = escolhaNoCaso(
        conteudo,
        situacao,
        body.etapa_id,
        body.opcao,
        inteiroAleatorioSeguro
      );
      if (escolha.recusa) return recusaDaProva(escolha.recusa);
      const gravou = await ev({
        evento: EVENTO_CASO_ESCOLHA,
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        aula_id: aula.id,
        detalhe: escolha.detalhe,
      });
      // a escolha que não ficou na trilha não aconteceu: o próximo pedido refaria o caso sem ela
      if (!gravou) return fail("Não foi possível registrar sua escolha. Tente de novo.", 503);
      return ok(escolha.resposta);
    }

    if (body.acao === "caso_concluir") {
      if (!(await dentroDoLimite("atividade"))) return muitasAcoes();
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat || !body.aula_id) return fail("Matrícula não encontrada", 404);
      const preparo = await prepararCaso(supabase, mat, body.aula_id, empresaId);
      if (preparo.falha) return recusaDaProva(preparo.falha);
      const { aula, conteudo } = preparo;
      // idempotente: concluir de novo (resposta perdida, duas abas) não grava nada
      if (preparo.concluida) {
        return ok({
          aula_concluida: true,
          curso_concluido: mat.status === "concluido",
          precisa_avaliacao: false,
          status: mat.status,
        });
      }
      const situacao = situacaoDoCaso(conteudo, preparo.eventos);
      if (situacao.recusa) return recusaDaProva(situacao.recusa);
      const conclusao = conclusaoDoCaso(situacao);
      if (conclusao.recusa) return recusaDaProva(conclusao.recusa);
      const segundos = await tempoDaAula(mat, aula.id);
      if (segundos === null) return fail(MSG_CASO_INDISPONIVEL, 503);
      const fim = await concluirAula(mat, aula, segundos, conclusao.eventoExtra);
      if (!fim) return fail("Não foi possível concluir o caso agora. Tente de novo.", 500);
      return ok(fim);
    }

    return fail("Ação desconhecida", 400);
```

- [ ] **Step 8: Formatar e rodar**

Run:

```bash
npx prettier --write supabase/functions/portal-funcionario/index.ts supabase/functions/portal-funcionario/atividades-index.test.ts
node --test supabase/functions/portal-funcionario/atividades-index.test.ts supabase/functions/portal-funcionario/caso-aluno.test.ts
```

Expected: PASS — `# fail 0` (`atividades-index.test.ts` com 14 testes, `caso-aluno.test.ts` com 14).

- [ ] **Step 9: Checagens**

Run:

```bash
npx prettier --check supabase/functions/portal-funcionario/caso-aluno.ts supabase/functions/portal-funcionario/caso-aluno.test.ts supabase/functions/portal-funcionario/index.ts supabase/functions/portal-funcionario/atividades-index.test.ts
node --test "supabase/functions/**/*.test.ts"
npm test --workspace=apps/web
npm run lint
```

Expected: prettier sem avisos; servidor = total da Task 8 **+ 19**, 0 falhas (`tutor.test.ts`, `assinaturas.test.ts`,
`endurecimento.test.ts` e `trilha-imutavel.test.ts` continuam verdes: as ações novas não leem a matrícula com
`select(*)`, só usam `mat.id`, `mat.curso_id` e `mat.status`, e só fazem `insert` na trilha); front igual; lint sem
erros. Anote os dois totais.

- [ ] **Step 10: Commit**

```bash
git status
git add supabase/functions/portal-funcionario/caso-aluno.ts supabase/functions/portal-funcionario/caso-aluno.test.ts supabase/functions/portal-funcionario/index.ts supabase/functions/portal-funcionario/atividades-index.test.ts
git diff --staged --stat
git commit -F - -- supabase/functions/portal-funcionario/caso-aluno.ts supabase/functions/portal-funcionario/caso-aluno.test.ts supabase/functions/portal-funcionario/index.ts supabase/functions/portal-funcionario/atividades-index.test.ts <<'EOF'
feat(ead): ações caso_abrir, caso_escolher e caso_concluir no portal do aluno

O caso com decisões (A3) roda pelo servidor: o estado é refeito a cada pedido a partir das escolhas da rodada na
trilha, sobre o roteiro de hoje (caso.ts). A etapa vai ao aluno só com os textos, embaralhada pelo sorteio
criptográfico; o comentário e a escolha segura só saem depois do clique, gravado como caso_escolha. Roteiro
inválido responde 409 CASO_INVALIDO sem gravar; caminho que não confere com o roteiro alterado grava
caso_reiniciado e recomeça. Concluir só com o caso no fim, idempotente, por concluirAula (caso_concluido).
A orquestração fica em caso-aluno.ts, testada com banco injetado; o index.ts só liga rede, trilha e conclusão.

Como testar: node --test "supabase/functions/**/*.test.ts"

Produção (só o Javerson, na ordem da seção Produção do plano; a migração 0170 antes):
npx supabase@2.118.0 functions deploy portal-funcionario --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt --use-api

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Portal — leitura até o fim, PDF no pdf.js em todas as telas, tarefa e ícones dos tipos novos

**Depende de:** nada no front (o servidor que conclui leitura sem tempo é a Task 7; o front desta task funciona com
ele). Pode rodar em paralelo às Tasks 1–9.

**Files:**

- Create: `apps/web/src/lib/portal-leitura.js`
- Test: `apps/web/src/lib/portal-leitura.test.js` (novo)
- Modify: `apps/web/src/lib/apostila-pdf.js` (cabeçalho e `MEDIA_APOSTILA_NA_PAGINA`/`apostilaNaPagina` em `:1-25` saem;
  `leituraPodeContar` em `:44-60`; `fimDaApostilaAlcancado` nova)
- Modify: `apps/web/src/lib/apostila-pdf.test.js` (`:1-35` e `:70-74`; describe novo no fim)
- Modify: `apps/web/src/components/portal-funcionario/ApostilaPdf.jsx` (arquivo inteiro: some o `<iframe>` e a
  consulta de mídia; `onFim`)
- Modify: `apps/web/src/components/portal-funcionario/CursoPortal.jsx` (`:4-19`, `:26`, `:103`, `:154`, `:264-281`,
  `:295`, `:694-696`, `:949-962`, `:983-1006`, `:1117-1119`)
- Modify: `apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js` (`:49-52`; describes novos no fim)
- Modify: `apps/web/src/components/portal-funcionario/sem-emoji.test.js` (`:28-30`)

**Interfaces:**

- Consumes: C6 `<ApostilaPdf url titulo onEstado obterUrlNova onFim />`; C4/C5 (Task 7): `progresso` com
  `concluir: true` conclui `pdf`/`texto`/`tarefa` sem tempo mínimo e não responde mais 409 `TEMPO_LEITURA`;
  `questionario`/`caso` só creditam tempo; `dados` manda `conteudo_texto` também para `tarefa`.
- Produces:
  - `lib/portal-leitura.js`: `TIPOS_DE_LEITURA = ["pdf", "texto", "tarefa"]`, `ROTULO_LIDA`, `ROTULO_TAREFA`,
    `MSG_PREVIA_CONCLUSAO`, `ehLeitura(tipo): boolean`,
    `botaoDeLeitura({ tipo, chegouAoFim, concluida, previa, indisponivel }): { rotulo, habilitado, dica } | null`,
    `rotuloDoTipoNaLista(tipo): string`, `tempoPrevisto(duracaoSeg): string | null`,
    `avisoDeAulaConcluida({ resposta, dados, matriculaId }): string` (usada pela Task 11/12).
  - `lib/apostila-pdf.js`: `leituraPodeContar(aula, estadoPdf)` passa a valer também para `tarefa`, `questionario` e
    `caso` (tempo de tela que vai para a trilha, C5); `fimDaApostilaAlcancado({ total, largura, visivel }): boolean`.
    Saem `MEDIA_APOSTILA_NA_PAGINA` e `apostilaNaPagina` (só o `ApostilaPdf` as usava).
  - `ApostilaPdf`: prop nova `onFim()`, chamada uma vez quando o marcador logo depois da última página entra na área de
    leitura.
  - `CursoPortal`: estado interno `fimAlcancado` (`{ [aulaId]: true }`) e `marcarFim(aulaId)`; nenhuma prop nova.

Regras que a implementação segue (e os testes fixam):

- O botão é um só para `pdf`, `texto` e `tarefa`: "Marcar como lida — li e compreendi" (tarefa: "Fiz a atividade"),
  desligado até chegar ao fim, com a dica de rolar embaixo; não existe mais "faltam X min" nem o tratamento do
  `TEMPO_LEITURA`.
- Na prévia do RT o botão aparece (antes sumia) e acende do mesmo jeito; o clique só mostra `MSG_PREVIA_CONCLUSAO`.
- O fim do texto/tarefa é um marcador (IntersectionObserver, raiz = janela); texto curto libera na hora; sem
  IntersectionObserver o botão libera (o aluno não fica preso).
- O fim da apostila é um marcador logo depois da última página, observado com a área de rolagem como raiz, que só vale
  com o documento aberto e a largura medida (`fimDaApostilaAlcancado`) e sem falha na tela.
- O contador de tempo de tela continua igual (tela visível), agora também em `tarefa`, `questionario` e `caso`.

- [ ] **Step 1: Escrever o teste da lib nova**

`apps/web/src/lib/portal-leitura.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  MSG_PREVIA_CONCLUSAO,
  ROTULO_LIDA,
  ROTULO_TAREFA,
  TIPOS_DE_LEITURA,
  avisoDeAulaConcluida,
  botaoDeLeitura,
  ehLeitura,
  rotuloDoTipoNaLista,
  tempoPrevisto,
} from "./portal-leitura";

describe("botaoDeLeitura (A5: acende ao chegar ao fim, sem relógio)", () => {
  it("texto e PDF: 'Marcar como lida — li e compreendi', desligado até o fim e com a dica de rolar", () => {
    expect(botaoDeLeitura({ tipo: "texto", chegouAoFim: false })).toEqual({
      rotulo: ROTULO_LIDA,
      habilitado: false,
      dica: "Role o texto até o fim para liberar o botão.",
    });
    expect(botaoDeLeitura({ tipo: "pdf" })).toEqual({
      rotulo: ROTULO_LIDA,
      habilitado: false,
      dica: "Role a apostila até o fim da última página para liberar o botão.",
    });
    expect(ROTULO_LIDA).toBe("Marcar como lida — li e compreendi");
  });

  it("chegou ao fim: acende, sem dica", () => {
    for (const tipo of ["texto", "pdf"]) {
      expect(botaoDeLeitura({ tipo, chegouAoFim: true })).toEqual({
        rotulo: ROTULO_LIDA,
        habilitado: true,
        dica: "",
      });
    }
  });

  it("tarefa: 'Fiz a atividade', com a mesma regra do fim", () => {
    expect(ROTULO_TAREFA).toBe("Fiz a atividade");
    expect(botaoDeLeitura({ tipo: "tarefa" })).toEqual({
      rotulo: ROTULO_TAREFA,
      habilitado: false,
      dica: "Leia as instruções até o fim para liberar o botão.",
    });
    expect(botaoDeLeitura({ tipo: "tarefa", chegouAoFim: true })).toEqual({
      rotulo: ROTULO_TAREFA,
      habilitado: true,
      dica: "",
    });
  });

  it("some com a aula concluída, com a apostila indisponível e nos tipos que não são leitura", () => {
    expect(botaoDeLeitura({ tipo: "texto", chegouAoFim: true, concluida: true })).toBeNull();
    expect(botaoDeLeitura({ tipo: "pdf", chegouAoFim: true, indisponivel: true })).toBeNull();
    for (const tipo of ["video", "questionario", "caso", undefined, null, "outro"]) {
      expect(botaoDeLeitura({ tipo, chegouAoFim: true })).toBeNull();
    }
    expect(botaoDeLeitura()).toBeNull();
  });

  it("prévia do RT: o botão aparece e acende do mesmo jeito, e a dica avisa que nada é gravado", () => {
    expect(botaoDeLeitura({ tipo: "texto", previa: true })).toMatchObject({ habilitado: false });
    expect(botaoDeLeitura({ tipo: "texto", chegouAoFim: true, previa: true })).toEqual({
      rotulo: ROTULO_LIDA,
      habilitado: true,
      dica: "Prévia: o clique não conclui a aula nem grava nada.",
    });
    expect(MSG_PREVIA_CONCLUSAO).toBe(
      "Prévia: aqui a aula seria concluída para o aluno. Nada foi gravado."
    );
  });

  it("nenhum texto fala em tempo (não há contagem regressiva)", () => {
    for (const tipo of TIPOS_DE_LEITURA) {
      for (const chegouAoFim of [false, true]) {
        const b = botaoDeLeitura({ tipo, chegouAoFim });
        expect(`${b.rotulo} ${b.dica}`).not.toMatch(/faltam|\bmin\b|tempo/i);
      }
    }
  });
});

describe("ehLeitura e rótulo do tipo na lista", () => {
  it("leitura = PDF, texto e tarefa", () => {
    expect(TIPOS_DE_LEITURA).toEqual(["pdf", "texto", "tarefa"]);
    expect(TIPOS_DE_LEITURA.every(ehLeitura)).toBe(true);
    for (const tipo of ["video", "questionario", "caso", undefined]) {
      expect(ehLeitura(tipo)).toBe(false);
    }
  });

  it("os três tipos de atividade ganham rótulo; vídeo, PDF e texto ficam como antes", () => {
    expect(rotuloDoTipoNaLista("questionario")).toBe("questionário");
    expect(rotuloDoTipoNaLista("caso")).toBe("estudo de caso");
    expect(rotuloDoTipoNaLista("tarefa")).toBe("atividade de estudo");
    for (const tipo of ["video", "pdf", "texto", undefined]) {
      expect(rotuloDoTipoNaLista(tipo)).toBe("");
    }
  });
});

describe("tempoPrevisto (tarefa: o tempo cadastrado da aula)", () => {
  it("minutos e horas", () => {
    expect(tempoPrevisto(2100)).toBe("35 min");
    expect(tempoPrevisto(900)).toBe("15 min");
    expect(tempoPrevisto(3600)).toBe("1 h");
    expect(tempoPrevisto(4200)).toBe("1 h 10 min");
    expect(tempoPrevisto(20)).toBe("1 min");
    expect(tempoPrevisto("600")).toBe("10 min");
  });

  it("sem tempo válido: null", () => {
    for (const v of [0, -60, null, undefined, NaN, "abc"]) {
      expect(tempoPrevisto(v)).toBeNull();
    }
  });
});

describe("avisoDeAulaConcluida (atividade concluída pela ação própria)", () => {
  const dados = ({ aulas, temAvaliacao = true, matricula = {} }) => ({
    cursos: [
      { matricula: { id: "outra" }, curso: { tem_avaliacao: true }, aulas: [] },
      {
        matricula: { id: "m1", status: "em_andamento", avaliacao_aprovada: false, ...matricula },
        curso: { tem_avaliacao: temAvaliacao },
        aulas,
      },
    ],
  });
  const feita = { concluida: true };
  const pendente = { concluida: false };

  it("sem os dados novos (a busca falhou): só o que o servidor confirmou", () => {
    expect(
      avisoDeAulaConcluida({ resposta: { aula_concluida: true }, dados: null, matriculaId: "m1" })
    ).toBe("Aula concluída.");
    expect(avisoDeAulaConcluida()).toBe("Aula concluída.");
  });

  it("curso concluído", () => {
    expect(
      avisoDeAulaConcluida({
        resposta: { curso_concluido: true },
        dados: dados({ aulas: [feita] }),
        matriculaId: "m1",
      })
    ).toBe("Curso concluído!");
  });

  it("ainda há aulas: a próxima está liberada", () => {
    expect(
      avisoDeAulaConcluida({
        resposta: {},
        dados: dados({ aulas: [feita, pendente] }),
        matriculaId: "m1",
      })
    ).toBe("Aula concluída — a próxima já está liberada.");
  });

  it("todas feitas e há prova final: manda para a avaliação, mesmo sem `precisa_avaliacao` na resposta (questionário)", () => {
    expect(
      avisoDeAulaConcluida({
        resposta: { aprovada: true },
        dados: dados({ aulas: [feita, feita] }),
        matriculaId: "m1",
      })
    ).toBe("Todas as aulas concluídas — agora faça a avaliação final.");
  });

  it("o `precisa_avaliacao` da resposta (caso) também manda para a avaliação", () => {
    expect(
      avisoDeAulaConcluida({
        resposta: { precisa_avaliacao: true },
        dados: dados({ aulas: [feita, pendente] }),
        matriculaId: "m1",
      })
    ).toBe("Todas as aulas concluídas — agora faça a avaliação final.");
  });

  it("todas feitas, com a prova já aprovada ou sem prova: só 'Aula concluída.'", () => {
    expect(
      avisoDeAulaConcluida({
        resposta: {},
        dados: dados({ aulas: [feita], matricula: { avaliacao_aprovada: true } }),
        matriculaId: "m1",
      })
    ).toBe("Aula concluída.");
    expect(
      avisoDeAulaConcluida({
        resposta: {},
        dados: dados({ aulas: [feita], temAvaliacao: false }),
        matriculaId: "m1",
      })
    ).toBe("Aula concluída.");
  });
});
```

- [ ] **Step 2: Ajustar o teste de `apostila-pdf`**

Em `apps/web/src/lib/apostila-pdf.test.js`, trecho atual (`:1-35`):

```js
import { describe, it, expect } from "vitest";
import {
  MEDIA_APOSTILA_NA_PAGINA,
  apostilaNaPagina,
  urlApostilaValida,
  leituraPodeContar,
  medidasDaPagina,
  mensagemFalhaPdf,
} from "./apostila-pdf";

describe("apostilaNaPagina", () => {
  it("usa a mesma consulta de mídia do SIGO (tela pequena ou toque)", () => {
    expect(MEDIA_APOSTILA_NA_PAGINA).toBe("(max-width: 640px), (pointer: coarse)");
  });

  it("é verdadeiro quando a consulta casa (celular, tablet, janela estreita)", () => {
    const perguntas = [];
    const matchMedia = (q) => {
      perguntas.push(q);
      return { matches: true };
    };
    expect(apostilaNaPagina(matchMedia)).toBe(true);
    expect(perguntas).toEqual([MEDIA_APOSTILA_NA_PAGINA]);
  });

  it("é falso no computador (não casa) e sem matchMedia (mantém o iframe)", () => {
    expect(apostilaNaPagina(() => ({ matches: false }))).toBe(false);
    expect(apostilaNaPagina(undefined)).toBe(false);
    expect(
      apostilaNaPagina(() => {
        throw new Error("sem suporte");
      })
    ).toBe(false);
  });
});
```

novo:

```js
import { describe, it, expect } from "vitest";
import * as modulo from "./apostila-pdf";
import {
  fimDaApostilaAlcancado,
  urlApostilaValida,
  leituraPodeContar,
  medidasDaPagina,
  mensagemFalhaPdf,
} from "./apostila-pdf";

describe("a apostila é desenhada pelo pdf.js em todas as telas (A5)", () => {
  it("não existe mais a escolha entre iframe e pdf.js pela consulta de mídia", () => {
    expect("apostilaNaPagina" in modulo).toBe(false);
    expect("MEDIA_APOSTILA_NA_PAGINA" in modulo).toBe(false);
  });
});
```

Trecho atual (`:70-74`):

```js
  it("texto conta sempre; vídeo conta pelo player, não por aqui", () => {
    expect(leituraPodeContar({ tipo: "texto", conteudo_texto: "oi" }, "carregando")).toBe(true);
    expect(leituraPodeContar({ tipo: "video" }, "pronto")).toBe(false);
    expect(leituraPodeContar(null, "pronto")).toBe(false);
  });
});
```

novo:

```js
  it("texto, tarefa, questionário e caso contam sempre; vídeo conta pelo player, não por aqui", () => {
    expect(leituraPodeContar({ tipo: "texto", conteudo_texto: "oi" }, "carregando")).toBe(true);
    for (const tipo of ["tarefa", "questionario", "caso"]) {
      expect(leituraPodeContar({ tipo }, "carregando")).toBe(true);
    }
    expect(leituraPodeContar({ tipo: "video" }, "pronto")).toBe(false);
    expect(leituraPodeContar(null, "pronto")).toBe(false);
  });
});

describe("fimDaApostilaAlcancado", () => {
  it("vale com o documento aberto, a largura medida e o marcador do fim à vista", () => {
    expect(fimDaApostilaAlcancado({ total: 12, largura: 700, visivel: true })).toBe(true);
    expect(fimDaApostilaAlcancado({ total: 1, largura: 320, visivel: true })).toBe(true);
  });

  it("marcador fora da área de leitura: ainda não chegou ao fim", () => {
    expect(fimDaApostilaAlcancado({ total: 12, largura: 700, visivel: false })).toBe(false);
  });

  it("antes de abrir o documento ou de medir a largura não vale (as páginas ainda não têm altura)", () => {
    for (const p of [
      { total: null, largura: 700, visivel: true },
      { total: 0, largura: 700, visivel: true },
      { total: 12, largura: 0, visivel: true },
      { total: 12, largura: NaN, visivel: true },
      {},
    ]) {
      expect(fimDaApostilaAlcancado(p)).toBe(false);
    }
    expect(fimDaApostilaAlcancado()).toBe(false);
  });
});
```

- [ ] **Step 3: Travar o contrato do componente no teste de fonte**

Em `apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js`, trecho atual (`:49-52`):

```js
    const sincronizar = trecho(
      "const sincronizar = async",
      "// leitura (PDF/texto) pode contar agora?"
    );
```

novo:

```js
    const sincronizar = trecho(
      "const sincronizar = async",
      "// tempo de tela das aulas sem player"
    );
```

E no fim do arquivo, depois do último `});` (`:71`), acrescente:

```js

describe("leitura até o fim, sem relógio (A5)", () => {
  it("o botão de concluir a leitura vem de botaoDeLeitura e só acende com o fim alcançado", () => {
    expect(fonte).toContain("botaoDeLeitura({");
    expect(fonte).toContain("chegouAoFim: fimAlcancado[aula.id] === true");
    expect(fonte).toMatch(/disabled=\{!botaoLeitura\.habilitado\}/);
  });

  it("não sobrou contagem regressiva nem o 409 de tempo de leitura", () => {
    expect(fonte).not.toMatch(/faltam \$\{fmtTempo/);
    expect(fonte).not.toContain("segundosTela < minimo");
    expect(fonte).not.toContain("TEMPO_LEITURA");
  });

  it("texto e tarefa têm o marcador de fim; a apostila avisa o fim pelo onFim", () => {
    expect(fonte).toMatch(/<MarcadorDeFim[\s\S]*?onVisivel=\{\(\) => marcarFim\(aula\.id\)\}/);
    expect(fonte).toMatch(/onFim=\{\(\) => marcarFim\(aula\.id\)\}/);
  });
});

describe("ApostilaPdf: o pdf.js desenha a apostila em todas as telas (A5)", () => {
  const apostila = readFileSync(fileURLToPath(new URL("ApostilaPdf.jsx", import.meta.url)), "utf8");

  it("não usa mais o iframe do navegador nem a consulta de mídia do celular", () => {
    expect(apostila).not.toContain("<iframe");
    expect(apostila).not.toContain("apostilaNaPagina");
  });

  it("o fim só vale com o documento aberto e medido, e é avisado uma vez só", () => {
    expect(apostila).toContain("fimDaApostilaAlcancado({");
    expect(apostila).toMatch(
      /if \(fimAvisadoRef\.current\) return;\s*fimAvisadoRef\.current = true;/
    );
  });
});
```

Em `apps/web/src/components/portal-funcionario/sem-emoji.test.js`, trecho atual (`:28-30`):

```js
  "../../lib/validacao-certificado.js",
  "../../lib/certificado-ead.js",
];
```

novo:

```js
  "../../lib/validacao-certificado.js",
  "../../lib/certificado-ead.js",
  "../../lib/portal-leitura.js",
];
```

- [ ] **Step 4: Rodar e ver falhar**

Run:

```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas/apps/web && npx vitest run src/lib/portal-leitura.test.js src/lib/apostila-pdf.test.js src/components/portal-funcionario/CursoPortal.efeitos.test.js src/components/portal-funcionario/sem-emoji.test.js
```

Expected: FAIL — `portal-leitura.test.js` não carrega (`Failed to resolve import "./portal-leitura"`);
`apostila-pdf.test.js` falha em "não existe mais a escolha..." e nos de `fimDaApostilaAlcancado` (`is not a
function`); o teste de fonte falha nos 5 casos novos e no "aviso de 409/429" (o marcador `// tempo de tela das aulas
sem player` ainda não existe); `sem-emoji.test.js` falha ao ler `portal-leitura.js` (`ENOENT`).

- [ ] **Step 5: Implementar a lib**

`apps/web/src/lib/portal-leitura.js`:

```js
/**
 * Leituras e atividades no portal do aluno (A5) — regras puras, sem DOM e sem rede.
 *
 * Texto, apostila em PDF e tarefa de estudo concluem quando o aluno CHEGA AO FIM do conteúdo: o botão de
 * concluir fica desligado até lá e então acende. Não há relógio (contagem regressiva, "faltam X min"): o
 * tempo de tela continua contando com a tela aberta, só para a trilha. Questionário e caso têm tela
 * própria (QuestionarioPortal, CasoPortal) e concluem pelas ações deles, no servidor.
 * Quem usa: components/portal-funcionario/CursoPortal.jsx. Testes em portal-leitura.test.js.
 */

/** Tipos de aula que concluem pelo botão, depois de o aluno chegar ao fim do conteúdo. */
export const TIPOS_DE_LEITURA = ["pdf", "texto", "tarefa"];

export const ROTULO_LIDA = "Marcar como lida — li e compreendi";
export const ROTULO_TAREFA = "Fiz a atividade";

/** Aviso da prévia do RT no lugar da conclusão (na prévia nada é gravado). */
export const MSG_PREVIA_CONCLUSAO =
  "Prévia: aqui a aula seria concluída para o aluno. Nada foi gravado.";

const DICA_ATE_O_FIM = {
  pdf: "Role a apostila até o fim da última página para liberar o botão.",
  texto: "Role o texto até o fim para liberar o botão.",
  tarefa: "Leia as instruções até o fim para liberar o botão.",
};
const DICA_PREVIA = "Prévia: o clique não conclui a aula nem grava nada.";

/** A aula conclui pelo botão de leitura (PDF, texto ou tarefa)? */
export function ehLeitura(tipo) {
  return TIPOS_DE_LEITURA.includes(tipo);
}

/**
 * O botão de concluir uma leitura: null quando não aparece (outro tipo de aula, aula já concluída,
 * apostila indisponível); senão o rótulo, se está habilitado (só com o fim alcançado) e a dica de baixo.
 * Na prévia do RT o botão aparece e acende do mesmo jeito, mas o clique não grava nada.
 *
 * @param {{ tipo?: string, chegouAoFim?: boolean, concluida?: boolean, previa?: boolean,
 *   indisponivel?: boolean }} [p]
 * @returns {{ rotulo: string, habilitado: boolean, dica: string } | null}
 */
export function botaoDeLeitura({
  tipo,
  chegouAoFim = false,
  concluida = false,
  previa = false,
  indisponivel = false,
} = {}) {
  if (!ehLeitura(tipo) || concluida === true || indisponivel === true) return null;
  const habilitado = chegouAoFim === true;
  return {
    rotulo: tipo === "tarefa" ? ROTULO_TAREFA : ROTULO_LIDA,
    habilitado,
    dica: !habilitado ? DICA_ATE_O_FIM[tipo] : previa ? DICA_PREVIA : "",
  };
}

const ROTULO_NA_LISTA = {
  questionario: "questionário",
  caso: "estudo de caso",
  tarefa: "atividade de estudo",
};

/** Rótulo pequeno do tipo na lista de aulas: só os tipos de atividade; vídeo, PDF e texto ficam como antes. */
export function rotuloDoTipoNaLista(tipo) {
  return ROTULO_NA_LISTA[tipo] ?? "";
}

/** "35 min", "1 h", "1 h 10 min" a partir do tempo cadastrado da aula (segundos); null sem tempo válido. */
export function tempoPrevisto(duracaoSeg) {
  const s = Number(duracaoSeg);
  if (!Number.isFinite(s) || s <= 0) return null;
  const minutos = Math.max(1, Math.round(s / 60));
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (!horas) return `${resto} min`;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

/**
 * Aviso depois de uma atividade concluir a aula pela ação própria (questionário aprovado, caso concluído).
 * `dados` é a resposta da ação `dados` buscada de novo (null = a busca falhou: a tela só afirma o que o
 * servidor confirmou). A resposta do questionário não diz se falta a prova final: a conta sai das aulas
 * buscadas de novo.
 */
export function avisoDeAulaConcluida({ resposta, dados, matriculaId } = {}) {
  const item = dados?.cursos?.find?.((c) => c?.matricula?.id === matriculaId) ?? null;
  if (!item) return "Aula concluída.";
  if (resposta?.curso_concluido === true || item.matricula?.status === "concluido") {
    return "Curso concluído!";
  }
  const aulas = Array.isArray(item.aulas) ? item.aulas.filter(Boolean) : [];
  const todas = aulas.length > 0 && aulas.every((a) => a.concluida === true);
  const faltaProva =
    resposta?.precisa_avaliacao === true ||
    (todas && item.curso?.tem_avaliacao === true && item.matricula?.avaliacao_aprovada !== true);
  if (faltaProva) return "Todas as aulas concluídas — agora faça a avaliação final.";
  return todas ? "Aula concluída." : "Aula concluída — a próxima já está liberada.";
}
```

- [ ] **Step 6: Ajustar `apostila-pdf.js`**

Em `apps/web/src/lib/apostila-pdf.js`, trecho atual (`:1-25`):

```js
/**
 * Apostila em PDF no Portal do Funcionário (T11) — regras puras, sem DOM.
 *
 * A apostila é a 1ª aula dos cursos e bloqueia as demais. No computador ela
 * aparece num <iframe>; no celular o navegador costuma não mostrar PDF em
 * iframe (Chrome Android, WebView e Safari mostram só a 1ª página ou nada),
 * então o portal desenha as páginas com o pdf.js, dentro da própria tela.
 * Quem usa: components/portal-funcionario/ApostilaPdf.jsx e CursoPortal.jsx.
 */

/**
 * Mesma consulta que o SIGO usa em components/shared/AnexoViewer.jsx
 * (`pdfSemIframe`): tela estreita OU toque como ponteiro principal.
 */
export const MEDIA_APOSTILA_NA_PAGINA = "(max-width: 640px), (pointer: coarse)";

/** true = desenhar o PDF na página (pdf.js); false = manter o iframe. */
export function apostilaNaPagina(matchMedia) {
  if (typeof matchMedia !== "function") return false;
  try {
    return !!matchMedia(MEDIA_APOSTILA_NA_PAGINA)?.matches;
  } catch {
    return false;
  }
}
```

novo:

```js
/**
 * Apostila em PDF no Portal do Funcionário (T11, A5) — regras puras, sem DOM.
 *
 * O portal desenha as páginas com o pdf.js, dentro da própria tela, em TODOS os aparelhos: no computador a
 * apostila era um iframe do navegador, de onde o portal não sabe até onde o aluno rolou, e a leitura passou
 * a concluir quando o aluno chega ao fim (A5). No celular o iframe nem mostrava o PDF direito.
 * Quem usa: components/portal-funcionario/ApostilaPdf.jsx e CursoPortal.jsx.
 */
```

Trecho atual (`:44-60`):

```js
/**
 * O tempo de leitura só corre com o conteúdo de fato na tela:
 * - texto: sempre (está na própria página);
 * - PDF: com URL válida E a apostila já aberta (`estadoPdf === "pronto"`);
 *   com a URL nula ou com o quadro em branco/carregando/falha, o contador fica
 *   parado (antes ele corria com o iframe em about:blank);
 * - vídeo: quem conta é o player (play/pausa), não esta regra.
 *
 * @param {{tipo?: string, arquivo_url?: string|null}|null} aula
 * @param {"carregando"|"pronto"|"erro"|undefined} estadoPdf
 */
export function leituraPodeContar(aula, estadoPdf) {
  if (!aula) return false;
  if (aula.tipo === "texto") return true;
  if (aula.tipo === "pdf") return urlApostilaValida(aula.arquivo_url) && estadoPdf === "pronto";
  return false;
}
```

novo:

```js
/** Aulas sem player cujo conteúdo está na própria página: o tempo de tela conta enquanto estão abertas. */
const CONTA_COM_A_TELA_ABERTA = ["texto", "tarefa", "questionario", "caso"];

/**
 * O tempo de tela das aulas sem player só corre com o conteúdo de fato na tela. Ele não libera nada (A5:
 * a leitura conclui ao chegar ao fim); vai para a trilha.
 * - texto, tarefa, questionário e caso: sempre (estão na própria página);
 * - PDF: com URL válida E a apostila já aberta (`estadoPdf === "pronto"`);
 *   com a URL nula ou com o quadro em branco/carregando/falha, o contador fica parado;
 * - vídeo: quem conta é o player (play/pausa), não esta regra.
 *
 * @param {{tipo?: string, arquivo_url?: string|null}|null} aula
 * @param {"carregando"|"pronto"|"erro"|undefined} estadoPdf
 */
export function leituraPodeContar(aula, estadoPdf) {
  if (!aula) return false;
  if (CONTA_COM_A_TELA_ABERTA.includes(aula.tipo)) return true;
  if (aula.tipo === "pdf") return urlApostilaValida(aula.arquivo_url) && estadoPdf === "pronto";
  return false;
}

/**
 * O aluno chegou ao fim da apostila: o marcador logo depois da última página apareceu na área de leitura.
 * Só vale com o documento aberto (`total` de páginas) e a largura da área medida: antes disso as páginas
 * ainda não têm altura, o marcador fica à vista de cara e liberaria a leitura sem rolar nada.
 *
 * @param {{ total?: number|null, largura?: number, visivel?: boolean }} [p]
 */
export function fimDaApostilaAlcancado({ total, largura, visivel } = {}) {
  return (
    Number.isInteger(total) &&
    total > 0 &&
    Number.isFinite(largura) &&
    largura > 0 &&
    visivel === true
  );
}
```

- [ ] **Step 7: Reescrever o `ApostilaPdf.jsx`**

`apps/web/src/components/portal-funcionario/ApostilaPdf.jsx` (arquivo inteiro; o `PaginaPdf` não muda):

```jsx
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { carregarPdfjs } from "@/lib/pdfjs";
import {
  fimDaApostilaAlcancado,
  medidasDaPagina,
  mensagemFalhaPdf,
  urlApostilaValida,
} from "@/lib/apostila-pdf";

/**
 * Apostila em PDF de uma aula.
 *
 * - As páginas são desenhadas aqui com o pdf.js, uma a uma, numa área com rolagem, em TODAS as telas (A5).
 *   No computador era o iframe do navegador, de onde o portal não sabe até onde o aluno rolou; a leitura
 *   agora conclui ao chegar ao fim. O PDF é baixado uma vez só, direto pelo pdf.js (sem passar por blob).
 *   Consequência aceita: no computador some a barra do visualizador do navegador (zoom, busca).
 * - `onFim()` é chamado UMA vez, quando o fim da última página aparece na área de leitura (o marcador logo
 *   depois dela): é o que acende o "Marcar como lida".
 * - "Abrir em outra aba" continua (o tempo de tela fica parado enquanto o aluno estiver fora do portal, e o
 *   fim só conta rolando aqui).
 * - Sem URL válida: "Apostila indisponível — avise o RH".
 *
 * `onEstado("carregando" | "pronto" | "erro")` diz ao CursoPortal quando a apostila está de fato na tela;
 * só então o tempo de tela corre (regra em lib/apostila-pdf.js).
 * `obterUrlNova()` devolve uma URL assinada nova (a de 3 h pode vencer) para "Tentar de novo".
 */
export default function ApostilaPdf({ url, titulo, onEstado, obterUrlNova, onFim }) {
  const [total, setTotal] = useState(null);

  // os callbacks do pai mudam a cada render (o contador de tempo re-renderiza a cada segundo):
  // guardados em ref para o leitor não recarregar nem re-renderizar por causa deles
  const onEstadoRef = useRef(onEstado);
  onEstadoRef.current = onEstado;
  const obterUrlNovaRef = useRef(obterUrlNova);
  obterUrlNovaRef.current = obterUrlNova;
  const onFimRef = useRef(onFim);
  onFimRef.current = onFim;
  const fimAvisadoRef = useRef(false);
  const avisar = useCallback((estado) => onEstadoRef.current?.(estado), []);
  const pedirUrlNova = useCallback(() => obterUrlNovaRef.current?.(), []);
  // o fim vale uma vez por apostila aberta (o CursoPortal monta uma ApostilaPdf por aula)
  const avisarFim = useCallback(() => {
    if (fimAvisadoRef.current) return;
    fimAvisadoRef.current = true;
    onFimRef.current?.();
  }, []);

  // A URL assinada muda a cada recarga dos dados do portal (concluir aula, dúvida...). A que
  // abriu a apostila fica travada: recarregar o PDF no meio da leitura baixaria o arquivo de
  // novo e voltaria a rolagem ao topo.
  const atual = urlApostilaValida(url) ? url.trim() : null;
  const travadaRef = useRef(null);
  if (atual && !travadaRef.current) travadaRef.current = atual;
  const urlLeitura = travadaRef.current;

  useEffect(() => {
    if (!urlLeitura) avisar("erro");
  }, [urlLeitura, avisar]);

  if (!urlLeitura) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-1"
      >
        <p className="font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Apostila indisponível — avise o RH
        </p>
        <p>O tempo de leitura não está sendo contado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          {total
            ? `Apostila em PDF · ${total} ${total === 1 ? "página" : "páginas"}`
            : "Apostila em PDF"}
        </span>
        <Button asChild variant="outline" size="sm">
          <a href={atual || urlLeitura} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> Abrir em outra aba
          </a>
        </Button>
      </div>
      <PdfNaPagina
        url={urlLeitura}
        titulo={titulo}
        avisar={avisar}
        pedirUrlNova={pedirUrlNova}
        aoSaberTotal={setTotal}
        aoChegarAoFim={avisarFim}
      />
      <p className="text-[11px] text-slate-500">
        Role até o fim da última página para liberar o botão. Em outra aba, o tempo de tela fica
        parado.
      </p>
    </div>
  );
}

const PdfNaPagina = memo(function PdfNaPagina({
  url,
  titulo,
  avisar,
  pedirUrlNova,
  aoSaberTotal,
  aoChegarAoFim,
}) {
  const rolagemRef = useRef(null);
  const fimRef = useRef(null);
  const urlDaTentativaRef = useRef(url);
  const prontoRef = useRef(false);
  const [largura, setLargura] = useState(0);
  const [tentativa, setTentativa] = useState(0);
  const [renovando, setRenovando] = useState(false);
  const [doc, setDoc] = useState(null); // { pdf, total, base: { w, h } }
  const [falha, setFalha] = useState("");

  // largura da área de leitura: a página é desenhada nela (gira a tela = redesenha)
  useEffect(() => {
    const el = rolagemRef.current;
    if (!el) return undefined;
    const medir = () => setLargura(Math.floor(el.clientWidth));
    medir();
    if (typeof ResizeObserver !== "function") {
      window.addEventListener("resize", medir);
      return () => window.removeEventListener("resize", medir);
    }
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  // abre o documento (o pdf.js baixa o arquivo; as páginas são desenhadas só quando aparecem)
  useEffect(() => {
    let vivo = true;
    let tarefa = null;
    prontoRef.current = false;
    setDoc(null);
    setFalha("");
    avisar("carregando");
    (async () => {
      try {
        const pdfjs = await carregarPdfjs();
        if (!vivo) return;
        tarefa = pdfjs.getDocument({ url: urlDaTentativaRef.current, isEvalSupported: false });
        const pdf = await tarefa.promise;
        const primeira = await pdf.getPage(1);
        const medida = primeira.getViewport({ scale: 1 });
        primeira.cleanup();
        if (!vivo) return;
        aoSaberTotal(pdf.numPages);
        setDoc({ pdf, total: pdf.numPages, base: { w: medida.width, h: medida.height } });
      } catch (e) {
        if (!vivo) return;
        setFalha(mensagemFalhaPdf(e));
        avisar("erro");
      }
    })();
    return () => {
      vivo = false;
      tarefa?.destroy?.(); // libera o documento e o que o worker guardou dele
    };
  }, [tentativa, avisar, aoSaberTotal]);

  // fim da leitura (A5): o marcador logo depois da última página entra na área de leitura. Só vale com o
  // documento aberto, a largura medida (fimDaApostilaAlcancado) e nenhuma falha na tela: antes disso as
  // páginas não têm altura e o marcador ficaria à vista de cara. Sem IntersectionObserver (navegador
  // antigo) o fim não pode ser medido, e o aluno não pode ficar preso: vale como alcançado.
  useEffect(() => {
    const marcador = fimRef.current;
    if (!doc || falha || !marcador) return undefined;
    if (typeof IntersectionObserver !== "function") {
      if (fimDaApostilaAlcancado({ total: doc.total, largura, visivel: true })) aoChegarAoFim();
      return undefined;
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas.some((e) => e.isIntersecting);
        if (!fimDaApostilaAlcancado({ total: doc.total, largura, visivel })) return;
        observador.disconnect();
        aoChegarAoFim();
      },
      { root: rolagemRef.current }
    );
    observador.observe(marcador);
    return () => observador.disconnect();
  }, [doc, falha, largura, aoChegarAoFim]);

  // o tempo de tela da apostila só corre com a 1ª página na tela
  const aoDesenharPagina = useCallback(() => {
    if (prontoRef.current) return;
    prontoRef.current = true;
    avisar("pronto");
  }, [avisar]);

  const aoFalharPagina = useCallback(
    (n, erro) => {
      // falha numa página do meio não derruba a leitura (a página mostra "tentar de novo")
      if (n !== 1 || prontoRef.current) return;
      setFalha(mensagemFalhaPdf(erro));
      avisar("erro");
    },
    [avisar]
  );

  const tentarDeNovo = async () => {
    setRenovando(true);
    try {
      const nova = await pedirUrlNova?.();
      if (urlApostilaValida(nova)) urlDaTentativaRef.current = nova.trim();
    } catch {
      /* sem URL nova: tenta com a que já tinha */
    } finally {
      setRenovando(false);
    }
    setTentativa((t) => t + 1);
  };

  const paginas = doc ? Array.from({ length: doc.total }, (_, i) => i + 1) : [];
  return (
    <div className="relative">
      <div
        ref={rolagemRef}
        role="region"
        aria-label={titulo}
        tabIndex={0}
        className="h-[70vh] overflow-y-auto rounded-lg border bg-slate-200 py-2 space-y-2"
      >
        {paginas.map((n) => (
          <PaginaPdf
            key={n}
            pdf={doc.pdf}
            n={n}
            total={doc.total}
            base={doc.base}
            largura={largura}
            rolagemRef={rolagemRef}
            aoDesenhar={aoDesenharPagina}
            aoFalhar={aoFalharPagina}
          />
        ))}
        {/* marcador do fim da leitura: só existe com o documento aberto */}
        {doc && <div ref={fimRef} aria-hidden="true" className="h-px" />}
      </div>
      {!doc && !falha && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-600 pointer-events-none">
          <Loader2 className="w-4 h-4 animate-spin" /> Abrindo a apostila...
        </div>
      )}
      {falha && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/95 p-4">
          <div className="max-w-xs text-center space-y-3">
            <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
            <p role="alert" className="text-sm text-slate-700">
              {falha}
            </p>
            <Button className="w-full" onClick={tentarDeNovo} disabled={renovando}>
              {renovando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Tentar de novo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Uma página do PDF. Só fica desenhada perto da área visível (uma tela para cima e para baixo):
 * 100 páginas desenhadas ao mesmo tempo derrubariam a aba do iPhone por falta de memória.
 * Fora disso o canvas é zerado e a caixa mantém a altura, para a rolagem não pular.
 */
const PaginaPdf = memo(function PaginaPdf({
  pdf,
  n,
  total,
  base,
  largura,
  rolagemRef,
  aoDesenhar,
  aoFalhar,
}) {
  const caixaRef = useRef(null);
  const canvasRef = useRef(null);
  const [visivel, setVisivel] = useState(n === 1);
  const [tamanho, setTamanho] = useState(base);
  const [desenhada, setDesenhada] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa || typeof IntersectionObserver !== "function") {
      setVisivel(true);
      return undefined;
    }
    const observador = new IntersectionObserver(
      (entradas) => setVisivel(entradas[entradas.length - 1].isIntersecting),
      { root: rolagemRef.current, rootMargin: "100% 0px" }
    );
    observador.observe(caixa);
    return () => observador.disconnect();
  }, [rolagemRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const liberar = () => {
      canvas.width = 0; // devolve a memória do canvas (Safari só solta assim)
      canvas.height = 0;
    };
    if (!visivel || !largura) {
      liberar();
      setDesenhada(false);
      return undefined;
    }
    let vivo = true;
    let tarefa = null;
    let pagina = null;
    setFalhou(false);
    (async () => {
      try {
        pagina = await pdf.getPage(n);
        if (!vivo) return;
        const real = pagina.getViewport({ scale: 1 });
        setTamanho((t) =>
          t.w === real.width && t.h === real.height ? t : { w: real.width, h: real.height }
        );
        const m = medidasDaPagina({
          paginaLargura: real.width,
          paginaAltura: real.height,
          larguraDisponivel: largura,
          dpr: window.devicePixelRatio,
        });
        const viewport = pagina.getViewport({ scale: m.escala });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        tarefa = pagina.render({ canvasContext: ctx, viewport });
        await tarefa.promise;
        if (!vivo) return;
        setDesenhada(true);
        aoDesenhar();
      } catch (e) {
        if (!vivo || e?.name === "RenderingCancelledException") return;
        setFalhou(true);
        aoFalhar(n, e);
      }
    })();
    return () => {
      vivo = false;
      tarefa?.cancel();
      pagina?.cleanup?.();
    };
  }, [visivel, largura, pdf, n, tentativa, aoDesenhar, aoFalhar]);

  // ao sair da tela (troca de aula, voltar), zera o canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, []);

  const m = medidasDaPagina({
    paginaLargura: tamanho.w,
    paginaAltura: tamanho.h,
    larguraDisponivel: largura,
  });
  return (
    <div
      ref={caixaRef}
      className="relative mx-auto bg-white shadow-sm"
      style={{ width: m.cssLargura, height: m.cssAltura }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Página ${n} de ${total}`}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {visivel && !desenhada && !falhou && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 pointer-events-none">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}
      {falhou && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-sm text-slate-600">
          <p>Não foi possível mostrar a página {n}.</p>
          <Button size="sm" variant="outline" onClick={() => setTentativa((t) => t + 1)}>
            <RefreshCw /> Tentar de novo
          </Button>
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 8: Ligar o fim da leitura, a tarefa e os ícones no `CursoPortal.jsx`**

Todas as mudanças em `apps/web/src/components/portal-funcionario/CursoPortal.jsx`.

(a) Ícones — trecho atual (`:17-19`):

```jsx
  ChevronRight,
  Eye,
} from "lucide-react";
```

novo:

```jsx
  ChevronRight,
  Eye,
  ListChecks,
  Signpost,
  ClipboardList,
  Clock,
} from "lucide-react";
```

(b) Lib nova — trecho atual (`:26`):

```js
import { leituraPodeContar, urlApostilaValida } from "@/lib/apostila-pdf";
```

novo:

```js
import { leituraPodeContar, urlApostilaValida } from "@/lib/apostila-pdf";
import {
  MSG_PREVIA_CONCLUSAO,
  botaoDeLeitura,
  rotuloDoTipoNaLista,
  tempoPrevisto,
} from "@/lib/portal-leitura";
```

(c) Ícones por tipo, marcador de fim e tarefa — trecho atual (`:103`):

```js
const ICONE_TIPO = { video: PlayCircle, pdf: FileText, texto: BookOpen };
```

novo:

```jsx
const ICONE_TIPO = {
  video: PlayCircle,
  pdf: FileText,
  texto: BookOpen,
  questionario: ListChecks,
  caso: Signpost,
  tarefa: ClipboardList,
};

/**
 * Marcador no fim do texto da aula (texto e tarefa, A5): quando ele aparece na tela, o botão de concluir
 * acende. Texto curto, que cabe na tela, mostra o marcador de cara e libera na hora. Sem
 * IntersectionObserver (navegador antigo) o fim não pode ser medido, e o aluno não pode ficar preso: libera.
 */
function MarcadorDeFim({ onVisivel }) {
  const ref = useRef(null);
  const onVisivelRef = useRef(onVisivel);
  onVisivelRef.current = onVisivel;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver !== "function") {
      onVisivelRef.current?.();
      return undefined;
    }
    const observador = new IntersectionObserver((entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      observador.disconnect();
      onVisivelRef.current?.();
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  return <div ref={ref} aria-hidden="true" className="h-px" />;
}

/** Tarefa de estudo (A4): instruções e "o que produzir" (o texto da aula) e o tempo previsto. */
function TarefaDeEstudo({ aula }) {
  const previsto = tempoPrevisto(aula.duracao_seg);
  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-slate-800">
          <ClipboardList className="w-4 h-4 text-slate-500" /> Atividade de estudo
        </span>
        {previsto && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" /> Tempo previsto: {previsto}
          </span>
        )}
      </div>
      <div className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
        {aula.conteudo_texto}
      </div>
      <p className="text-xs text-slate-500">
        Faça a atividade fora desta tela, como as instruções pedem, e volte aqui para confirmar.
      </p>
    </div>
  );
}
```

(d) Estado do fim — trecho atual (`:153-154`):

```js
  // relógio que só serve para refazer a conta quando acaba o intervalo da próxima tentativa da prova
  const [relogio, setRelogio] = useState(() => Date.now());
```

novo:

```js
  // relógio que só serve para refazer a conta quando acaba o intervalo da próxima tentativa da prova
  const [relogio, setRelogio] = useState(() => Date.now());
  // leituras (PDF, texto, tarefa) que o aluno já rolou até o fim nesta visita ao curso: o botão de
  // concluir só acende com o fim à vista (A5); voltar à aula não pede a rolagem de novo
  const [fimAlcancado, setFimAlcancado] = useState({});
```

(e) Sem o 409 de tempo de leitura — trecho atual (`:264-281`):

```js
    } catch (e) {
      // servidor mede o tempo real: se ainda falta leitura, volta a contar
      if (e?.codigo === "TEMPO_LEITURA") {
        if (Number.isFinite(e.extra?.segundos_assistidos)) {
          assistidoRef.current = e.extra.segundos_assistidos;
          setSegundosTela(assistidoRef.current);
        }
        setErro(e.message);
        iniciarContagem();
        return;
      }
      tratarErroDeEnvio(e);
    }
  };

  // leitura (PDF/texto) pode contar agora? PDF: só com URL válida e a apostila aberta na tela
  const leituraLiberada = (a) =>
```

novo:

```js
    } catch (e) {
      // a leitura não exige mais tempo mínimo (A5): o servidor conclui com o clique
      tratarErroDeEnvio(e);
    }
  };

  // tempo de tela das aulas sem player (leituras e atividades) pode contar agora? PDF: só com URL válida
  // e a apostila aberta na tela
  const leituraLiberada = (a) =>
```

(f) `marcarFim` — trecho atual (`:295`):

```js
  // URL assinada nova (a de 3 h pode vencer) para o "Tentar de novo" da apostila
```

novo:

```js
  // o aluno chegou ao fim do conteúdo da aula (marcador do texto/tarefa ou última página da apostila)
  const marcarFim = (id) =>
    setFimAlcancado((atual) => (atual[id] ? atual : { ...atual, [id]: true }));

  // URL assinada nova (a de 3 h pode vencer) para o "Tentar de novo" da apostila
```

(g) Botão sem relógio — trecho atual (`:694-696`):

```js
  const minimo = aula?.duracao_seg || 0;
  // PDF sem URL: o leitor mostra "Apostila indisponível" e não há contador nem "marcar como lida"
  const apostilaIndisponivel = aula?.tipo === "pdf" && !urlApostilaValida(aula.arquivo_url);
```

novo:

```js
  // PDF sem URL: o leitor mostra "Apostila indisponível" e não há contador nem "marcar como lida"
  const apostilaIndisponivel = aula?.tipo === "pdf" && !urlApostilaValida(aula.arquivo_url);
  // botão de concluir a leitura (texto, PDF, tarefa): acende ao chegar ao fim, sem relógio (A5)
  const botaoLeitura = aula
    ? botaoDeLeitura({
        tipo: aula.tipo,
        chegouAoFim: fimAlcancado[aula.id] === true,
        concluida: aula.concluida,
        previa,
        indisponivel: apostilaIndisponivel,
      })
    : null;
  const concluirLeitura = async () => {
    // prévia: nada é gravado e a aula não conclui; o RT só vê que o botão funcionaria
    if (previa) {
      setAviso(MSG_PREVIA_CONCLUSAO);
      return;
    }
    await pararContagem(false);
    sincronizar({ concluir: true });
  };
```

(h) Apostila, texto e tarefa — trecho atual (`:949-962`):

```jsx
            {aula.tipo === "pdf" && (
              <ApostilaPdf
                key={aula.id}
                url={aula.arquivo_url}
                titulo={aula.titulo}
                onEstado={(estado) => aoMudarEstadoPdf(aula.id, estado)}
                obterUrlNova={() => urlNovaDaApostila(aula.id)}
              />
            )}
            {aula.tipo === "texto" && (
              <div className="bg-white rounded-lg border p-4 text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                {aula.conteudo_texto}
              </div>
            )}
```

novo:

```jsx
            {aula.tipo === "pdf" && (
              <ApostilaPdf
                key={aula.id}
                url={aula.arquivo_url}
                titulo={aula.titulo}
                onEstado={(estado) => aoMudarEstadoPdf(aula.id, estado)}
                obterUrlNova={() => urlNovaDaApostila(aula.id)}
                onFim={() => marcarFim(aula.id)}
              />
            )}
            {aula.tipo === "texto" && (
              <div className="bg-white rounded-lg border p-4 text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                {aula.conteudo_texto}
              </div>
            )}
            {aula.tipo === "tarefa" && <TarefaDeEstudo aula={aula} />}
            {(aula.tipo === "texto" || aula.tipo === "tarefa") && (
              <MarcadorDeFim key={aula.id} onVisivel={() => marcarFim(aula.id)} />
            )}
```

(i) Tempo de tela e botão — trecho atual (`:983-1006`):

```jsx
              ) : previa ? (
                <span>Prévia: o tempo de leitura não é contado nem gravado.</span>
              ) : (
                <span>
                  Tempo de leitura: {fmtTempo(segundosTela)}
                  {minimo ? ` de ${fmtTempo(minimo)}` : ""} · o tempo só conta com esta tela aberta
                </span>
              )}
            </div>
            {aula.tipo !== "video" && !aula.concluida && !apostilaIndisponivel && !previa && (
              <Button
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700"
                disabled={minimo > 0 && segundosTela < minimo}
                onClick={async () => {
                  await pararContagem(false);
                  sincronizar({ concluir: true });
                }}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {minimo > 0 && segundosTela < minimo
                  ? `Marcar como lida (faltam ${fmtTempo(minimo - segundosTela)})`
                  : "Marcar como lida — li e compreendi"}
              </Button>
            )}
```

novo:

```jsx
              ) : previa ? (
                <span>Prévia: o tempo de tela não é contado nem gravado.</span>
              ) : (
                <span>
                  Tempo de tela: {fmtTempo(segundosTela)} · vai para a trilha do curso e só conta
                  com esta tela aberta
                </span>
              )}
            </div>
            {botaoLeitura && (
              <div className="space-y-1">
                <Button
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700"
                  disabled={!botaoLeitura.habilitado}
                  onClick={concluirLeitura}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {botaoLeitura.rotulo}
                </Button>
                {botaoLeitura.dica && (
                  <p className="text-xs text-center text-slate-500">{botaoLeitura.dica}</p>
                )}
              </div>
            )}
```

(j) Rótulo do tipo na lista — trecho atual (`:1117-1119`):

```jsx
                    <span className="flex-1 text-sm">
                      {a.numero}. {a.titulo}
                    </span>
```

novo:

```jsx
                    <span className="flex-1 min-w-0 text-sm">
                      {a.numero}. {a.titulo}
                      {rotuloDoTipoNaLista(a.tipo) && (
                        <span className="block text-[11px] text-slate-400">
                          {rotuloDoTipoNaLista(a.tipo)}
                        </span>
                      )}
                    </span>
```

- [ ] **Step 9: Rodar e ver passar**

Run:

```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas/apps/web && npx vitest run src/lib/portal-leitura.test.js src/lib/apostila-pdf.test.js src/components/portal-funcionario/CursoPortal.efeitos.test.js src/components/portal-funcionario/sem-emoji.test.js src/components/portal-funcionario/CursoPortal.previa.test.jsx
```

Expected: PASS — `portal-leitura.test.js` 16 testes; `apostila-pdf.test.js` 17 (eram 16: saem os 3 de
`apostilaNaPagina`, entram 1 + 3); `CursoPortal.efeitos.test.js` 10 (eram 5); `sem-emoji.test.js` 2;
`CursoPortal.previa.test.jsx` 18 (sem mudança).

- [ ] **Step 10: Formato, lint, build e a suíte do front**

Run:

<!-- prettier-ignore -->
```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas && npx prettier --write apps/web/src/lib/portal-leitura.js apps/web/src/lib/portal-leitura.test.js apps/web/src/lib/apostila-pdf.js apps/web/src/lib/apostila-pdf.test.js apps/web/src/components/portal-funcionario/ApostilaPdf.jsx apps/web/src/components/portal-funcionario/CursoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js apps/web/src/components/portal-funcionario/sem-emoji.test.js && npx prettier --check apps/web/src/lib/portal-leitura.js apps/web/src/lib/portal-leitura.test.js apps/web/src/lib/apostila-pdf.js apps/web/src/lib/apostila-pdf.test.js apps/web/src/components/portal-funcionario/ApostilaPdf.jsx apps/web/src/components/portal-funcionario/CursoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js apps/web/src/components/portal-funcionario/sem-emoji.test.js && (cd apps/web && npx eslint --rule "no-undef: error" src/components/portal-funcionario/CursoPortal.jsx src/components/portal-funcionario/ApostilaPdf.jsx) && npm run lint && npm run build && npm test --workspace=apps/web
```

Expected:

- "All matched files use Prettier code style!";
- ESLint sem erro nos dois componentes; `npm run lint` sem erro; `vite build` termina (`✓ built in ...`);
- Vitest: o total da task anterior + 1 arquivo e + 22 testes (16 novos + 1 + 5), 0 falhas (na linha de base da branch
  seriam 130 arquivos e 2470 testes; as Tasks 2 e 5 somam os delas).

- [ ] **Step 11: Commit**

<!-- prettier-ignore -->
```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas && git status --short && git add apps/web/src/lib/portal-leitura.js apps/web/src/lib/portal-leitura.test.js apps/web/src/lib/apostila-pdf.js apps/web/src/lib/apostila-pdf.test.js apps/web/src/components/portal-funcionario/ApostilaPdf.jsx apps/web/src/components/portal-funcionario/CursoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js apps/web/src/components/portal-funcionario/sem-emoji.test.js && git diff --staged --stat && git commit -F - -- apps/web/src/lib/portal-leitura.js apps/web/src/lib/portal-leitura.test.js apps/web/src/lib/apostila-pdf.js apps/web/src/lib/apostila-pdf.test.js apps/web/src/components/portal-funcionario/ApostilaPdf.jsx apps/web/src/components/portal-funcionario/CursoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js apps/web/src/components/portal-funcionario/sem-emoji.test.js <<'EOF'
feat(ead): leituras concluem ao chegar ao fim, com a apostila no pdf.js em todas as telas

A5 da spec de 14/10: texto, PDF e tarefa deixam de ter relógio. O botão "Marcar como lida — li e compreendi"
(tarefa: "Fiz a atividade") acende quando o aluno chega ao fim (marcador no fim do texto; na apostila, o fim da
última página), sem contagem regressiva. A apostila passa a ser desenhada pelo pdf.js também no computador: o
iframe não dizia até onde o aluno rolou. O tempo de tela continua contando, só para a trilha, também na tarefa,
no questionário e no caso. A lista ganha os ícones e os rótulos dos tipos novos; a prévia mostra o botão.

Produção: nenhum comando sozinho. O site novo precisa do portal-funcionario da Task 7 (o de hoje ainda exige o
tempo mínimo): push em master só depois do deploy da função (spec §12, passos 3 e 4).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

---

### Task 11: Portal — tela do questionário do módulo

**Depende de:** Task 10 (`lib/portal-leitura.js`, `MSG_PREVIA_CONCLUSAO`, `avisoDeAulaConcluida`). O servidor das
ações é a Task 8; o front não importa nada dele.

**Files:**

- Create: `apps/web/src/lib/portal-questionario.js`
- Test: `apps/web/src/lib/portal-questionario.test.js` (novo)
- Create: `apps/web/src/components/portal-funcionario/QuestionarioPortal.jsx`
- Test: `apps/web/src/components/portal-funcionario/QuestionarioPortal.test.jsx` (novo)
- Modify: `apps/web/src/components/portal-funcionario/AvaliacaoPortal.jsx:24` (`CorrecaoComentada` passa a ser
  exportada; nada mais muda na prova final)
- Modify: `apps/web/src/components/portal-funcionario/CursoPortal.jsx` (imports, banner da prévia,
  `aoConcluirAtividade`, despacho do tipo `questionario`)
- Modify: `apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js` (describe novo no fim)
- Modify: `apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx:324-329` (guarda da API injetada)
- Modify: `apps/web/src/components/portal-funcionario/sem-emoji.test.js` (lib nova e o componente na lista)

**Interfaces:**

- Consumes:
  - C5 `questionario_abrir` → `{ concluida: true, nota_minima, melhor_nota, tentativas }` ou
    `{ concluida: false, tentativa, nota_minima, questoes: [{ id, pergunta, opcoes, ordem_opcoes }] }`; recusas
    `QUESTIONARIO_VAZIO` (409), `AULA_BLOQUEADA` (409), 400 de aula/tipo, 503;
  - C5 `questionario_enviar` (corpo `matricula_id, aula_id, respostas: [{ questao_id, resposta }]`, `resposta` =
    índice ORIGINAL, o `op.indice` de `provaParaTela`) → `respostaDoQuestionario(...)` (C4: `resultado`, `aprovada`,
    `nota`, `acertos`, `total`, `nota_minima`, `tentativa`, `aula_concluida`, `curso_concluido`, `revisao` nos dois
    resultados); recusas `QUESTIONARIO_CONCLUIDO` (409), `PROVA_NAO_INICIADA`/`PROVA_ALTERADA` (409, códigos da prova
    com o texto de `mensagemDoEnvio`), `RESPOSTAS_INCOMPLETAS` (400), 409 de tentativa repetida;
  - `lib/portal-curso.js`: `provaParaTela`, `provaPrecisaReabrir`, `mensagemDeFalha`, `resumoRespostas`,
    `guardarRascunhoProva`/`lerRascunhoProva`/`limparRascunhoProva`;
  - Task 10: `MSG_PREVIA_CONCLUSAO`, `avisoDeAulaConcluida`.
- Produces:
  - C6 `<QuestionarioPortal api item aula token fila tratarErro onConcluida />` (default). `onConcluida(resposta)`
    recebe a resposta do envio aprovado (ou `{}` quando o servidor diz `QUESTIONARIO_CONCLUIDO`); quem chama pode
    ignorar o argumento;
  - exports nomeados para teste: `QuestionarioEmAndamento`, `QuestoesDoQuestionario({ prova, respostas, resultado,
    previa, destacarFaltas, onMarcar })`, `ResultadoDoQuestionario({ resultado, onTentarDeNovo })`,
    `SituacaoDoQuestionario({ estado, onTentar })`;
  - `lib/portal-questionario.js`: `MSG_QUESTIONARIO_INVALIDO`, `CODIGOS_SEM_NOVA_TENTATIVA`,
    `idDoRascunhoDoQuestionario(matriculaId, aulaId)`, `questionarioParaTela(resposta, { previa })`,
    `detalheDaTentativa(prova)`, `acertosNecessarios(total, notaMinima)`, `resultadoDoQuestionario(r)`,
    `textoDoQuestionarioConcluido({ melhorNota, tentativas, notaMinima })`, `avisoDoQuestionarioReaberto(erro)`,
    `textoDasFaltas(resumo)`, `reacaoAoErroDaAbertura(erro)`, `reacaoAoErroDoEnvio(erro)`;
  - `AvaliacaoPortal.jsx`: `export function CorrecaoComentada({ item })`;
  - `CursoPortal`: `aoConcluirAtividade(resposta)` interno (reaproveitado pela Task 12).

Decisão sobre o `ProvaEmAndamento` (`AvaliacaoPortal.jsx:158`): **não** é reaproveitado. Ele chama a ação
`avaliacao`, mostra "Avaliação final", o comentário "o aluno só vê depois de aprovado", "Voltar às aulas" e a regra de
tentativas da prova, e guarda o rascunho em `sigo_portal_prova:<matrícula>:<tentativa>`; parametrizar tudo isso mexeria
na prova final. O questionário reaproveita só as regras puras e a `CorrecaoComentada`; o rascunho usa a mesma função
com o id `<matrícula>:questionario:<aula>`, então a chave fica `sigo_portal_prova:<matrícula>:questionario:<aula>:
<tentativa>` — não colide com a da prova (cuja tentativa é inteira) nem com a de outro questionário, e
`limparRascunhosPortal` (sair do portal) apaga as duas pelo mesmo prefixo.

- [ ] **Step 1: Escrever o teste da lib**

`apps/web/src/lib/portal-questionario.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  CODIGOS_SEM_NOVA_TENTATIVA,
  MSG_QUESTIONARIO_INVALIDO,
  acertosNecessarios,
  detalheDaTentativa,
  idDoRascunhoDoQuestionario,
  questionarioParaTela,
  reacaoAoErroDaAbertura,
  reacaoAoErroDoEnvio,
  resultadoDoQuestionario,
  textoDasFaltas,
  textoDoQuestionarioConcluido,
} from "./portal-questionario";
import {
  MSG_SEM_CONEXAO,
  PREFIXO_PROVA,
  guardarRascunhoProva,
  lerRascunhoProva,
  limparRascunhosPortal,
} from "./portal-curso";

/** localStorage de mentira (só o que o portal usa). */
function memoria() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    chaves: () => [...m.keys()],
  };
}

/** Erro no formato do ErroPortal (components/portal-funcionario/api.js): `extra` é o corpo da resposta. */
const erro = (codigo, mensagem = "Recusado", extra = {}) =>
  Object.assign(new Error(mensagem), { codigo, extra: { codigo, error: mensagem, ...extra } });

// resposta sintética de `questionario_abrir`: sorteada e sem gabarito
const aberta = {
  success: true,
  concluida: false,
  tentativa: 2,
  nota_minima: 80,
  questoes: [
    { id: "x2", pergunta: "Segunda?", opcoes: ["c", "a", "b"], ordem_opcoes: [2, 0, 1] },
    { id: "x1", pergunta: "Primeira?", opcoes: ["b", "a"], ordem_opcoes: [1, 0] },
  ],
};

describe("questionarioParaTela", () => {
  it("tentativa aberta: as questões na ordem do servidor, com o índice original de cada alternativa", () => {
    const tela = questionarioParaTela(aberta);
    expect(tela.fase).toBe("respondendo");
    expect(tela.prova).toMatchObject({ tentativa: 2, notaMinima: 80 });
    expect(tela.prova.questoes.map((q) => q.id)).toEqual(["x2", "x1"]);
    expect(tela.prova.questoes[0].exibicao).toEqual([
      { texto: "c", indice: 2 },
      { texto: "a", indice: 0 },
      { texto: "b", indice: 1 },
    ]);
  });

  it("o gabarito e o comentário só passam na prévia do RT", () => {
    const comGabarito = {
      ...aberta,
      questoes: aberta.questoes.map((q) => ({ ...q, correta: 0, comentario: "Reservado" })),
    };
    expect(questionarioParaTela(comGabarito).prova.questoes[0]).not.toHaveProperty("correta");
    expect(JSON.stringify(questionarioParaTela(comGabarito))).not.toContain("Reservado");
    expect(questionarioParaTela(comGabarito, { previa: true }).prova.questoes[0]).toMatchObject({
      correta: 0,
      comentario: "Reservado",
    });
  });

  it("aula concluída: a melhor nota e as tentativas, sem questão", () => {
    expect(
      questionarioParaTela({ concluida: true, nota_minima: 80, melhor_nota: 88, tentativas: 2 })
    ).toEqual({ fase: "concluido", notaMinima: 80, melhorNota: 88, tentativas: 2 });
  });

  it("resposta fora do formato: null (a tela mostra o problema)", () => {
    for (const ruim of [
      null,
      undefined,
      {},
      { ...aberta, questoes: [] },
      { ...aberta, tentativa: 0 },
      {
        ...aberta,
        questoes: [{ id: "x", pergunta: "?", opcoes: ["a", "b"], ordem_opcoes: [0, 0] }],
      },
    ]) {
      expect(questionarioParaTela(ruim)).toBeNull();
    }
  });
});

describe("rascunho das respostas no aparelho", () => {
  it("o do questionário não se mistura com o da prova final nem com o de outro questionário", () => {
    const s = memoria();
    const questoes = [{ id: "x1", opcoes: ["a", "b"] }];
    guardarRascunhoProva(s, "m1", 1, { x1: 0 });
    guardarRascunhoProva(s, idDoRascunhoDoQuestionario("m1", "aq1"), 1, { x1: 1 });
    guardarRascunhoProva(s, idDoRascunhoDoQuestionario("m1", "aq2"), 1, { x1: 0 });
    expect(s.chaves()).toHaveLength(3);
    expect(lerRascunhoProva(s, "m1", 1, questoes)).toEqual({ x1: 0 });
    expect(lerRascunhoProva(s, idDoRascunhoDoQuestionario("m1", "aq1"), 1, questoes)).toEqual({
      x1: 1,
    });
    expect(lerRascunhoProva(s, idDoRascunhoDoQuestionario("m1", "aq2"), 1, questoes)).toEqual({
      x1: 0,
    });
  });

  it("sair do portal apaga também os rascunhos dos questionários (mesmo prefixo)", () => {
    const s = memoria();
    guardarRascunhoProva(s, idDoRascunhoDoQuestionario("m1", "aq1"), 3, { x1: 1 });
    expect(s.chaves()[0].startsWith(PREFIXO_PROVA)).toBe(true);
    limparRascunhosPortal(s);
    expect(s.chaves()).toEqual([]);
  });
});

describe("acertosNecessarios", () => {
  it("8 questões com 80% pedem 7 (6/8 = 75%), com o arredondamento do servidor", () => {
    expect(acertosNecessarios(8, 80)).toBe(7);
    expect(acertosNecessarios(8, 75)).toBe(6);
    expect(acertosNecessarios(10, 70)).toBe(7);
    expect(acertosNecessarios(3, 67)).toBe(2);
    expect(acertosNecessarios(3, 100)).toBe(3);
  });

  it("mínima 0 ou sem questões: zero", () => {
    expect(acertosNecessarios(5, 0)).toBe(0);
    expect(acertosNecessarios(0, 80)).toBe(0);
    expect(acertosNecessarios(null, 80)).toBe(0);
  });
});

describe("resultadoDoQuestionario", () => {
  it("aprovado: placar e o aviso de conclusão", () => {
    expect(
      resultadoDoQuestionario({ aprovada: true, nota: 88, acertos: 7, total: 8, nota_minima: 80 })
    ).toEqual({
      aprovada: true,
      titulo: "Nota: 88% (7/8)",
      mensagem: "Questionário concluído. Confira abaixo a correção comentada.",
    });
  });

  it("não aprovado: placar e quantos acertos a nota mínima pede (A2: é estudo, tenta de novo)", () => {
    expect(
      resultadoDoQuestionario({ aprovada: false, nota: 75, acertos: 6, total: 8, nota_minima: 80 })
    ).toEqual({
      aprovada: false,
      titulo: "Nota: 75% (6/8)",
      mensagem:
        "Para concluir, acerte pelo menos 7 de 8 (nota mínima 80%). Confira a correção comentada e tente de novo.",
    });
  });

  it("resposta sem nota: só o conceito, sem número inventado", () => {
    expect(resultadoDoQuestionario({ aprovada: false })).toEqual({
      aprovada: false,
      titulo: "Resultado: insatisfatório",
      mensagem:
        "Você ainda não atingiu a nota mínima. Confira a correção comentada e tente de novo.",
    });
    expect(resultadoDoQuestionario(null).aprovada).toBe(false);
    expect(resultadoDoQuestionario({ aprovada: true }).titulo).toBe("Resultado: satisfatório");
  });
});

describe("textos da tela", () => {
  it("aula concluída: melhor nota, tentativas e nota mínima", () => {
    expect(textoDoQuestionarioConcluido({ melhorNota: 88, tentativas: 2, notaMinima: 80 })).toBe(
      "Questionário concluído · melhor nota 88% · 2 tentativas · nota mínima 80%"
    );
    expect(textoDoQuestionarioConcluido({ melhorNota: 100, tentativas: 1, notaMinima: 80 })).toBe(
      "Questionário concluído · melhor nota 100% · 1 tentativa · nota mínima 80%"
    );
    expect(textoDoQuestionarioConcluido({})).toBe("Questionário concluído");
    expect(textoDoQuestionarioConcluido()).toBe("Questionário concluído");
  });

  it("cabeçalho da tentativa", () => {
    expect(detalheDaTentativa({ notaMinima: 80, tentativa: 2 })).toBe(
      "Nota mínima 80% · tentativa 2 · a correção comentada aparece depois de enviar"
    );
    expect(detalheDaTentativa({ tentativa: 1 })).toBe(
      "Tentativa 1 · a correção comentada aparece depois de enviar"
    );
  });

  it("questões sem resposta no envio", () => {
    expect(textoDasFaltas({ faltam: 1, primeiraSemResposta: 2 })).toBe(
      "Responda todas as questões antes de enviar: falta 1 (a primeira sem resposta é a questão 3)."
    );
    expect(textoDasFaltas({ faltam: 3, primeiraSemResposta: 0 })).toBe(
      "Responda todas as questões antes de enviar: faltam 3 (a primeira sem resposta é a questão 1)."
    );
  });
});

describe("reações às recusas do servidor", () => {
  it("abertura: sessão vai ao portal; questionário vazio e aula bloqueada não oferecem 'Tentar de novo'", () => {
    expect(CODIGOS_SEM_NOVA_TENTATIVA).toEqual(["QUESTIONARIO_VAZIO", "AULA_BLOQUEADA"]);
    expect(reacaoAoErroDaAbertura(erro("SESSAO", "Sessão expirada"))).toEqual({ acao: "sessao" });
    expect(reacaoAoErroDaAbertura(erro("TROCAR_SENHA", "Troque a senha"))).toEqual({
      acao: "sessao",
    });
    expect(
      reacaoAoErroDaAbertura(
        erro("QUESTIONARIO_VAZIO", "Este questionário ainda não tem questões — avise o RH")
      )
    ).toEqual({
      acao: "erro",
      mensagem: "Este questionário ainda não tem questões — avise o RH",
      definitivo: true,
    });
    expect(
      reacaoAoErroDaAbertura(erro("AULA_BLOQUEADA", "Conclua a aula anterior primeiro")).definitivo
    ).toBe(true);
  });

  it("abertura: rede e resposta fora do formato deixam tentar de novo", () => {
    expect(reacaoAoErroDaAbertura(new Error("Failed to fetch"))).toEqual({
      acao: "erro",
      mensagem: MSG_SEM_CONEXAO,
      definitivo: false,
    });
    expect(reacaoAoErroDaAbertura(new Error(MSG_QUESTIONARIO_INVALIDO))).toEqual({
      acao: "erro",
      mensagem: MSG_QUESTIONARIO_INVALIDO,
      definitivo: false,
    });
  });

  it("envio: questionário que não vale mais é aberto de novo, com o aviso certo", () => {
    const alterada = reacaoAoErroDoEnvio(erro("PROVA_ALTERADA", "As questões foram alteradas"));
    expect(alterada.acao).toBe("reabrir");
    expect(alterada.aviso).toMatch(/RH alterou as questões/);
    const naoIniciada = reacaoAoErroDoEnvio(erro("PROVA_NAO_INICIADA", "Abra de novo"));
    expect(naoIniciada.acao).toBe("reabrir");
    expect(naoIniciada.aviso).toMatch(/não estava mais aberto/);
  });

  it("envio: concluído em outra aba, sessão e o resto", () => {
    expect(reacaoAoErroDoEnvio(erro("QUESTIONARIO_CONCLUIDO", "Já concluído"))).toEqual({
      acao: "concluido",
    });
    expect(reacaoAoErroDoEnvio(erro("SESSAO", "Sessão expirada"))).toEqual({ acao: "sessao" });
    expect(
      reacaoAoErroDoEnvio(erro("RESPOSTAS_INCOMPLETAS", "Responda todas as questões: falta 1."))
    ).toEqual({ acao: "mensagem", mensagem: "Responda todas as questões: falta 1." });
  });
});
```

- [ ] **Step 2: Escrever o teste do componente**

`apps/web/src/components/portal-funcionario/QuestionarioPortal.test.jsx`:

```jsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Os componentes importam utilitários que leem `window` ao carregar; o ambiente de teste não tem DOM.
vi.hoisted(() => {
  const janela = {};
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

// O teste NUNCA carrega o cliente de produção (ver CursoPortal.previa.test.jsx).
vi.mock("@/api/sigoClient", () => ({
  sigo: {
    functions: {
      invoke: vi.fn(() => {
        throw new Error("o portal chamou o backend durante o teste");
      }),
    },
  },
  supabase: {},
  resolveStorageUrl: vi.fn(),
}));

import { sigo } from "@/api/sigoClient";
import QuestionarioPortal, {
  QuestoesDoQuestionario,
  ResultadoDoQuestionario,
  SituacaoDoQuestionario,
} from "./QuestionarioPortal";
import { provaParaTela } from "@/lib/portal-curso";

const semOperacao = () => {};
const fila = (tarefa) => tarefa();
const item = { matricula: { id: "m1" } };
const aula = { id: "aq", tipo: "questionario", titulo: "M1 · Questionário do módulo" };

// a resposta de `questionario_abrir` do servidor: sorteada e SEM gabarito (dados sintéticos)
const aberta = {
  success: true,
  concluida: false,
  tentativa: 2,
  nota_minima: 80,
  questoes: [
    { id: "x2", pergunta: "Segunda sintética?", opcoes: ["c", "a", "b"], ordem_opcoes: [2, 0, 1] },
    { id: "x1", pergunta: "Primeira sintética?", opcoes: ["b", "a"], ordem_opcoes: [1, 0] },
  ],
};

describe("QuestionarioPortal", () => {
  it("abre pelo servidor: antes da resposta só o 'Preparando', sem questão nenhuma", () => {
    const html = renderToStaticMarkup(
      <QuestionarioPortal
        item={item}
        aula={aula}
        token="t"
        fila={fila}
        tratarErro={semOperacao}
        onConcluida={semOperacao}
      />
    );
    expect(html).toContain("Questionário do módulo");
    expect(html).toContain("Preparando o questionário");
    expect(html).not.toContain("sintética");
    expect(sigo.functions.invoke).not.toHaveBeenCalled(); // o render estático não roda efeitos
  });

  it("as questões saem na ordem do servidor, sem gabarito para o aluno", () => {
    const html = renderToStaticMarkup(
      <QuestoesDoQuestionario prova={provaParaTela(aberta)} respostas={{}} onMarcar={semOperacao} />
    );
    expect(html.indexOf("Segunda sintética?")).toBeLessThan(html.indexOf("Primeira sintética?"));
    expect(html).toMatch(/A\) c<[\s\S]*B\) a<[\s\S]*C\) b</);
    expect(html).not.toContain("gabarito");
  });

  it("na prévia do RT marca o gabarito e mostra o comentário antes do envio", () => {
    const comGabarito = {
      ...aberta,
      questoes: aberta.questoes.map((q) => ({ ...q, correta: 0, comentario: `Comentário de ${q.id}` })),
    };
    const html = renderToStaticMarkup(
      <QuestoesDoQuestionario
        prova={provaParaTela(comGabarito, { previa: true })}
        respostas={{}}
        previa
        onMarcar={semOperacao}
      />
    );
    expect((html.match(/gabarito<\/span>/g) || []).length).toBe(2);
    expect(html).toContain("Comentário de x1");
  });

  it("depois do envio: a correção comentada de cada questão, acertando ou não (A2), e as alternativas travadas", () => {
    const resultado = {
      aprovada: false,
      nota: 50,
      acertos: 1,
      total: 2,
      nota_minima: 80,
      revisao: [
        { questao_id: "x1", acertou: true, resposta_correta: "a", comentario: "Por causa de A." },
        { questao_id: "x2", acertou: false, resposta_correta: "c", comentario: "Por causa de C." },
      ],
    };
    const html = renderToStaticMarkup(
      <QuestoesDoQuestionario
        prova={provaParaTela(aberta)}
        respostas={{ x1: 0, x2: 1 }}
        resultado={resultado}
        onMarcar={semOperacao}
      />
    );
    expect(html).toContain("Você acertou");
    expect(html).toContain("Resposta certa: c");
    expect(html).toContain("Por causa de A.");
    expect(html).toContain("Por causa de C.");
    expect((html.match(/<input[^>]*disabled=""/g) || []).length).toBe(5);
  });

  it("não aprovado: placar, quantos acertos faltam e 'Tentar de novo'", () => {
    const html = renderToStaticMarkup(
      <ResultadoDoQuestionario
        resultado={{ aprovada: false, nota: 75, acertos: 6, total: 8, nota_minima: 80 }}
        onTentarDeNovo={semOperacao}
      />
    );
    expect(html).toContain("Nota: 75% (6/8)");
    expect(html).toContain("acerte pelo menos 7 de 8");
    expect(html).toContain("Tentar de novo");
  });

  it("aprovado: placar e conclusão, sem 'Tentar de novo'", () => {
    const html = renderToStaticMarkup(
      <ResultadoDoQuestionario
        resultado={{ aprovada: true, nota: 88, acertos: 7, total: 8, nota_minima: 80 }}
        onTentarDeNovo={semOperacao}
      />
    );
    expect(html).toContain("Nota: 88% (7/8)");
    expect(html).toContain("Questionário concluído");
    expect(html).not.toContain("Tentar de novo");
  });

  it("aula concluída: a melhor nota e as tentativas, sem nova tentativa", () => {
    const html = renderToStaticMarkup(
      <SituacaoDoQuestionario
        estado={{ fase: "concluido", melhorNota: 88, tentativas: 2, notaMinima: 80 }}
        onTentar={semOperacao}
      />
    );
    expect(html).toContain(
      "Questionário concluído · melhor nota 88% · 2 tentativas · nota mínima 80%"
    );
    expect(html).not.toContain("Tentar de novo");
  });

  it("questionário vazio: a mensagem do servidor, sem 'Tentar de novo' (falta o RH agir)", () => {
    const html = renderToStaticMarkup(
      <SituacaoDoQuestionario
        estado={{
          fase: "erro",
          mensagem: "Este questionário ainda não tem questões — avise o RH",
          definitivo: true,
        }}
        onTentar={semOperacao}
      />
    );
    expect(html).toContain("ainda não tem questões");
    expect(html).not.toContain("Tentar de novo");
  });
});
```

- [ ] **Step 3: Travar a fiação no `CursoPortal` e as guardas**

No fim de `apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js` acrescente:

```js

describe("questionário do módulo (A2)", () => {
  it("o CursoPortal abre o QuestionarioPortal com a API injetada; a conclusão vem da ação própria", () => {
    expect(fonte).toMatch(
      /aula\.tipo === "questionario" && \(\s*<QuestionarioPortal[\s\S]*?api=\{api\}[\s\S]*?onConcluida=\{aoConcluirAtividade\}/
    );
    const conclusao = trecho("const aoConcluirAtividade = async", "\n  };");
    expect(conclusao).toMatch(/if \(previa\) \{\s*setAviso\(MSG_PREVIA_CONCLUSAO\);\s*return;/);
    // o progresso que vai junto só leva o tempo de tela: quem conclui é a ação do questionário/caso
    expect(conclusao).not.toContain("concluir:");
    expect(conclusao).toContain("avisoDeAulaConcluida({");
  });
});
```

Em `apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx`, trecho atual (`:324-329`):

```js
  for (const arquivo of [
    "CursoPortal.jsx",
    "AvaliacaoPortal.jsx",
    "DuvidasPortal.jsx",
    "CertificadoPortal.jsx",
  ]) {
```

novo:

```js
  for (const arquivo of [
    "CursoPortal.jsx",
    "AvaliacaoPortal.jsx",
    "DuvidasPortal.jsx",
    "CertificadoPortal.jsx",
    "QuestionarioPortal.jsx",
  ]) {
```

Em `apps/web/src/components/portal-funcionario/sem-emoji.test.js`, trecho atual:

```js
    expect(componentes).toContain("./CienciasPortal.jsx");
  });
```

novo:

```js
    expect(componentes).toContain("./CienciasPortal.jsx");
    expect(componentes).toContain("./QuestionarioPortal.jsx");
  });
```

e trecho atual (o fim da lista, depois da Task 10):

```js
  "../../lib/portal-leitura.js",
];
```

novo:

```js
  "../../lib/portal-leitura.js",
  "../../lib/portal-questionario.js",
];
```

- [ ] **Step 4: Rodar e ver falhar**

Run:

```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas/apps/web && npx vitest run src/lib/portal-questionario.test.js src/components/portal-funcionario/QuestionarioPortal.test.jsx src/components/portal-funcionario/CursoPortal.efeitos.test.js src/components/portal-funcionario/CursoPortal.previa.test.jsx src/components/portal-funcionario/sem-emoji.test.js
```

Expected: FAIL — `portal-questionario.test.js` e `QuestionarioPortal.test.jsx` não carregam (`Failed to resolve import`);
o teste de fonte falha em "questionário do módulo" (`não achei: const aoConcluirAtividade = async`); a guarda de
`QuestionarioPortal.jsx` falha (`ENOENT`); `sem-emoji.test.js` falha (lista sem o componente e lib inexistente).

- [ ] **Step 5: Implementar a lib**

`apps/web/src/lib/portal-questionario.js`:

```js
/**
 * Questionário do módulo no portal do aluno (A2) — regras puras, sem DOM e sem rede.
 *
 * O questionário é do SERVIDOR (ações `questionario_abrir` e `questionario_enviar` do portal-funcionario): ele
 * sorteia as questões e as alternativas a cada tentativa, corrige com a nota mínima do módulo e devolve a
 * correção comentada ao aprovado E ao não aprovado (é estudo; a cobrança é a prova final). Tentativas livres,
 * sem intervalo. Aula concluída: a abertura devolve a melhor nota e quantas tentativas houve.
 *
 * A tela reaproveita as regras da prova final (lib/portal-curso.js): `provaParaTela` (questões na ordem do
 * servidor, resposta pelo índice ORIGINAL da alternativa) e o rascunho das respostas no aparelho, com um id
 * próprio por questionário para não se misturar com o da prova final.
 * Quem usa: components/portal-funcionario/QuestionarioPortal.jsx. Testes em portal-questionario.test.js.
 */
import { mensagemDeFalha, provaParaTela, provaPrecisaReabrir } from "./portal-curso";

export const MSG_QUESTIONARIO_INVALIDO =
  "O questionário chegou incompleto. Tente de novo; se continuar, avise o RH.";

/** Recusas da abertura em que tentar de novo não adianta: falta o RH cadastrar questões, ou a aula anterior. */
export const CODIGOS_SEM_NOVA_TENTATIVA = ["QUESTIONARIO_VAZIO", "AULA_BLOQUEADA"];

const ehSessao = (erro) => erro?.codigo === "SESSAO" || erro?.codigo === "TROCAR_SENHA";
const numero = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * "Matrícula" usada nas chaves do rascunho (`guardarRascunhoProva`/`lerRascunhoProva` de portal-curso.js). A
 * chave da prova final é `sigo_portal_prova:<matrícula>:<tentativa>`; a do questionário fica
 * `sigo_portal_prova:<matrícula>:questionario:<aula>:<tentativa>`: nada se mistura, e sair do portal apaga as
 * duas pelo mesmo prefixo.
 */
export function idDoRascunhoDoQuestionario(matriculaId, aulaId) {
  return `${matriculaId}:questionario:${aulaId}`;
}

/**
 * A resposta de `questionario_abrir` pronta para a tela, ou null se não tem a forma esperada:
 * - aula concluída: `{ fase: "concluido", notaMinima, melhorNota, tentativas }`;
 * - tentativa aberta: `{ fase: "respondendo", prova }` (`prova` de `provaParaTela`: gabarito e comentário só
 *   na prévia do RT, `previa: true`).
 */
export function questionarioParaTela(resposta, { previa = false } = {}) {
  if (resposta?.concluida === true) {
    return {
      fase: "concluido",
      notaMinima: numero(resposta.nota_minima),
      melhorNota: numero(resposta.melhor_nota),
      tentativas: Number.isInteger(resposta.tentativas) ? resposta.tentativas : null,
    };
  }
  const prova = provaParaTela(resposta, { previa });
  return prova ? { fase: "respondendo", prova } : null;
}

/** "Nota mínima 80% · tentativa 2 · a correção comentada aparece depois de enviar". */
export function detalheDaTentativa(prova) {
  const partes = [];
  if (numero(prova?.notaMinima) !== null) partes.push(`Nota mínima ${prova.notaMinima}%`);
  if (Number.isInteger(prova?.tentativa)) partes.push(`tentativa ${prova.tentativa}`);
  partes.push("a correção comentada aparece depois de enviar");
  const texto = partes.join(" · ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Menor número de acertos que atinge a nota mínima, com a conta do servidor (nota inteira arredondada):
 * 8 questões e 80% pedem 7 (6/8 = 75%).
 */
export function acertosNecessarios(total, notaMinima) {
  if (!Number.isInteger(total) || total <= 0) return 0;
  const minima = numero(notaMinima) ?? 0;
  for (let acertos = 0; acertos <= total; acertos++) {
    if (Math.round((acertos / total) * 100) >= minima) return acertos;
  }
  return total;
}

/** O que a tela diz depois do envio: o placar e o próximo passo (o aprovado segue; o outro tenta de novo). */
export function resultadoDoQuestionario(resultado) {
  const r = resultado && typeof resultado === "object" ? resultado : {};
  const aprovada = r.aprovada === true;
  const nota = numero(r.nota);
  const acertos = Number.isInteger(r.acertos) ? r.acertos : null;
  const total = Number.isInteger(r.total) ? r.total : null;
  let titulo;
  if (nota === null) titulo = aprovada ? "Resultado: satisfatório" : "Resultado: insatisfatório";
  else if (acertos !== null && total !== null) titulo = `Nota: ${nota}% (${acertos}/${total})`;
  else titulo = `Nota: ${nota}%`;
  if (aprovada) {
    return {
      aprovada,
      titulo,
      mensagem: "Questionário concluído. Confira abaixo a correção comentada.",
    };
  }
  const minima = numero(r.nota_minima);
  const meta =
    minima !== null && total
      ? `Para concluir, acerte pelo menos ${acertosNecessarios(total, minima)} de ${total} (nota mínima ${minima}%).`
      : "Você ainda não atingiu a nota mínima.";
  return { aprovada, titulo, mensagem: `${meta} Confira a correção comentada e tente de novo.` };
}

/** "Questionário concluído · melhor nota 88% · 2 tentativas · nota mínima 80%". */
export function textoDoQuestionarioConcluido({ melhorNota, tentativas, notaMinima } = {}) {
  const partes = ["Questionário concluído"];
  if (numero(melhorNota) !== null) partes.push(`melhor nota ${melhorNota}%`);
  if (Number.isInteger(tentativas) && tentativas > 0) {
    partes.push(tentativas === 1 ? "1 tentativa" : `${tentativas} tentativas`);
  }
  if (numero(notaMinima) !== null) partes.push(`nota mínima ${notaMinima}%`);
  return partes.join(" · ");
}

/** Aviso depois de abrir o questionário de novo porque o envio não valia mais (mesmos códigos da prova). */
export function avisoDoQuestionarioReaberto(erro) {
  if (erro?.codigo === "PROVA_ALTERADA") {
    return "O RH alterou as questões enquanto você respondia: o questionário foi aberto de novo. Confira suas respostas e envie.";
  }
  return "Este questionário não estava mais aberto: ele foi aberto de novo. Confira suas respostas e envie.";
}

/** "Responda todas as questões antes de enviar: falta 1 (a primeira sem resposta é a questão 3)." */
export function textoDasFaltas({ faltam, primeiraSemResposta } = {}) {
  const quantas = faltam === 1 ? "falta 1" : `faltam ${faltam}`;
  return `Responda todas as questões antes de enviar: ${quantas} (a primeira sem resposta é a questão ${
    primeiraSemResposta + 1
  }).`;
}

/** Falha ao abrir: a sessão vai para o portal; o resto vira mensagem, com ou sem "Tentar de novo". */
export function reacaoAoErroDaAbertura(erro) {
  if (ehSessao(erro)) return { acao: "sessao" };
  return {
    acao: "erro",
    mensagem: mensagemDeFalha(erro),
    definitivo: CODIGOS_SEM_NOVA_TENTATIVA.includes(erro?.codigo),
  };
}

/**
 * Recusa do envio:
 * - sessão: o portal pede login de novo;
 * - questionário que não vale mais (`PROVA_NAO_INICIADA`, `PROVA_ALTERADA`): abre de novo, e as respostas que
 *   ainda valem continuam marcadas (rascunho);
 * - `QUESTIONARIO_CONCLUIDO` (concluído em outra aba): a lista é atualizada e a tela mostra a melhor nota;
 * - o resto (rede, respostas incompletas, tentativa repetida): a mensagem fica e o aluno envia de novo.
 */
export function reacaoAoErroDoEnvio(erro) {
  if (ehSessao(erro)) return { acao: "sessao" };
  if (provaPrecisaReabrir(erro)) {
    return { acao: "reabrir", aviso: avisoDoQuestionarioReaberto(erro) };
  }
  if (erro?.codigo === "QUESTIONARIO_CONCLUIDO") return { acao: "concluido" };
  return { acao: "mensagem", mensagem: mensagemDeFalha(erro) };
}
```

- [ ] **Step 6: Exportar a correção comentada da prova**

Em `apps/web/src/components/portal-funcionario/AvaliacaoPortal.jsx`, trecho atual (`:24`):

```jsx
function CorrecaoComentada({ item }) {
```

novo:

```jsx
/** Correção comentada de uma questão (prova final e questionário do módulo). */
export function CorrecaoComentada({ item }) {
```

- [ ] **Step 7: Implementar o componente**

`apps/web/src/components/portal-funcionario/QuestionarioPortal.jsx`:

```jsx
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, ListChecks, Loader2, RotateCcw } from "lucide-react";
import { apiPortal, armazenamentoPortal } from "./api";
import { CorrecaoComentada } from "./AvaliacaoPortal";
import {
  guardarRascunhoProva,
  lerRascunhoProva,
  limparRascunhoProva,
  resumoRespostas,
} from "@/lib/portal-curso";
import {
  MSG_QUESTIONARIO_INVALIDO,
  detalheDaTentativa,
  idDoRascunhoDoQuestionario,
  questionarioParaTela,
  reacaoAoErroDaAbertura,
  reacaoAoErroDoEnvio,
  resultadoDoQuestionario,
  textoDasFaltas,
  textoDoQuestionarioConcluido,
} from "@/lib/portal-questionario";

/**
 * Questionário do módulo (A2): estudo guiado, com tentativas livres. O questionário é do SERVIDOR: ao abrir, a
 * tela pede `questionario_abrir` e o servidor sorteia questões e alternativas (sem gabarito) ou, com a aula já
 * concluída, devolve a melhor nota. O envio (`questionario_enviar`) leva o índice ORIGINAL de cada resposta; o
 * servidor corrige com a nota mínima do módulo e devolve a correção comentada, aprovado ou não. Aprovado: a aula
 * conclui (`onConcluida(resposta)`); não aprovado: "Tentar de novo" abre uma tentativa nova, já re-sorteada.
 *
 * `api` é injetada (padrão: o portal de verdade). Na prévia do RT (`api.previa`) o sorteio e a correção são
 * locais, as questões chegam com gabarito e comentário (só o RT vê) e nada é guardado no aparelho.
 */
export default function QuestionarioPortal({
  api = apiPortal,
  item,
  aula,
  token,
  fila,
  tratarErro,
  onConcluida,
}) {
  const { chamarPortal } = api;
  const previa = api.previa === true;
  // { fase: "carregando" } | { fase: "erro", mensagem, definitivo }
  // | { fase: "concluido", notaMinima, melhorNota, tentativas } | { fase: "respondendo", prova, abertura, aviso }
  const [estado, setEstado] = useState({ fase: "carregando" });
  const abrindoRef = useRef(false); // uma abertura por vez (duplo clique)
  const aberturasRef = useRef(0); // remonta a tentativa quando o questionário é aberto de novo

  const abrir = async (aviso = "") => {
    if (abrindoRef.current) return;
    abrindoRef.current = true;
    setEstado({ fase: "carregando" });
    try {
      const resposta = await fila(() =>
        chamarPortal(
          "questionario_abrir",
          { matricula_id: item.matricula.id, aula_id: aula.id },
          token
        )
      );
      const tela = questionarioParaTela(resposta, { previa });
      if (!tela) throw new Error(MSG_QUESTIONARIO_INVALIDO);
      aberturasRef.current += 1;
      setEstado({ ...tela, abertura: aberturasRef.current, aviso });
    } catch (e) {
      const reacao = reacaoAoErroDaAbertura(e);
      if (reacao.acao === "sessao") tratarErro(e);
      else setEstado({ fase: "erro", mensagem: reacao.mensagem, definitivo: reacao.definitivo });
    } finally {
      abrindoRef.current = false;
    }
  };

  useEffect(() => {
    abrir();
  }, []);

  if (estado.fase === "respondendo") {
    return (
      <QuestionarioEmAndamento
        key={estado.abertura}
        prova={estado.prova}
        aviso={estado.aviso}
        item={item}
        aula={aula}
        token={token}
        fila={fila}
        tratarErro={tratarErro}
        onReabrir={abrir}
        onConcluida={onConcluida}
        api={api}
      />
    );
  }
  return <SituacaoDoQuestionario estado={estado} onTentar={() => abrir()} />;
}

function CabecalhoDoQuestionario({ detalhe = "" }) {
  return (
    <div className="space-y-1">
      <h2 className="flex items-center gap-2 font-semibold text-slate-800 text-lg">
        <ListChecks className="w-5 h-5 text-violet-600" /> Questionário do módulo
      </h2>
      {detalhe && <p className="text-sm text-slate-500">{detalhe}</p>}
    </div>
  );
}

/** Antes das questões: carregando, falha (com ou sem "Tentar de novo") ou a aula já concluída. */
export function SituacaoDoQuestionario({ estado, onTentar }) {
  return (
    <div className="space-y-3">
      <CabecalhoDoQuestionario />
      {estado.fase === "concluido" ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{textoDoQuestionarioConcluido(estado)}</span>
        </div>
      ) : estado.fase === "erro" ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
          <p className="flex items-start gap-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{estado.mensagem}</span>
          </p>
          {!estado.definitivo && (
            <Button type="button" variant="outline" className="bg-white" onClick={onTentar}>
              <RotateCcw /> Tentar de novo
            </Button>
          )}
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Preparando o questionário...
        </p>
      )}
    </div>
  );
}

/**
 * Uma tentativa aberta: as questões na ordem do servidor. As respostas ficam guardadas no aparelho (por
 * matrícula, aula e tentativa): recarregar a página não as perde. Depois do envio, o resultado e a correção
 * comentada; sem aprovação, "Tentar de novo".
 */
export function QuestionarioEmAndamento({
  prova,
  aviso = "",
  item,
  aula,
  token,
  fila,
  tratarErro,
  onReabrir,
  onConcluida,
  api = apiPortal,
}) {
  const { chamarPortal } = api;
  const previa = api.previa === true;
  const armazenamento = () => (previa ? null : armazenamentoPortal());
  const raizRef = useRef(null);
  const questoes = prova.questoes;
  const idRascunho = idDoRascunhoDoQuestionario(item.matricula.id, aula.id);
  const tentativa = prova.tentativa;
  const [respostas, setRespostas] = useState(() =>
    lerRascunhoProva(armazenamento(), idRascunho, tentativa, questoes)
  ); // questao_id -> índice ORIGINAL
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [destacarFaltas, setDestacarFaltas] = useState(false);
  const resumo = resumoRespostas(questoes, respostas);

  // cada resposta marcada vai para o aparelho (a tentativa enviada não deixa rascunho)
  useEffect(() => {
    if (resultado) return;
    guardarRascunhoProva(armazenamento(), idRascunho, tentativa, respostas);
  }, [respostas, resultado]);

  const enviar = async () => {
    if (resumo.faltam > 0) {
      setDestacarFaltas(true);
      setErro(textoDasFaltas(resumo));
      const el = document.getElementById(`questionario-${questoes[resumo.primeiraSemResposta].id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      const r = await fila(() =>
        chamarPortal(
          "questionario_enviar",
          {
            matricula_id: item.matricula.id,
            aula_id: aula.id,
            respostas: questoes.map((q) => ({ questao_id: q.id, resposta: respostas[q.id] })),
          },
          token
        )
      );
      limparRascunhoProva(armazenamento(), idRascunho, tentativa);
      setResultado(r);
      setDestacarFaltas(false);
      raizRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (r?.aprovada === true) onConcluida?.(r);
    } catch (e) {
      const reacao = reacaoAoErroDoEnvio(e);
      if (reacao.acao === "sessao") tratarErro(e);
      else if (reacao.acao === "reabrir") onReabrir(reacao.aviso);
      else if (reacao.acao === "concluido") {
        onConcluida?.({});
        onReabrir();
      } else setErro(reacao.mensagem);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div ref={raizRef} className="space-y-3">
      <CabecalhoDoQuestionario detalhe={detalheDaTentativa(prova)} />

      {aviso && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"
        >
          {aviso}
        </p>
      )}

      {resultado ? (
        <ResultadoDoQuestionario resultado={resultado} onTentarDeNovo={() => onReabrir()} />
      ) : (
        <p className="text-sm font-medium text-slate-700">
          {resumo.respondidas} de {resumo.total} respondidas
        </p>
      )}

      <QuestoesDoQuestionario
        prova={prova}
        respostas={respostas}
        resultado={resultado}
        previa={previa}
        destacarFaltas={destacarFaltas && !resultado}
        onMarcar={(id, indice) => setRespostas((r) => ({ ...r, [id]: indice }))}
      />

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
      {!resultado && (
        <Button onClick={enviar} className="w-full bg-slate-900 h-11" disabled={enviando}>
          {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Enviar respostas
        </Button>
      )}
    </div>
  );
}

/** As questões da tentativa; depois do envio, travadas e com a correção comentada de cada uma. */
export function QuestoesDoQuestionario({
  prova,
  respostas,
  resultado = null,
  previa = false,
  destacarFaltas = false,
  onMarcar,
}) {
  return (
    <div className="space-y-3">
      {prova.questoes.map((q, qi) => {
        const marcada = respostas?.[q.id];
        const faltando = destacarFaltas && !Number.isInteger(marcada);
        return (
          <div
            key={q.id}
            id={`questionario-${q.id}`}
            tabIndex={-1}
            className={`bg-white border rounded-lg p-3 outline-none ${
              faltando ? "border-red-300 ring-1 ring-red-200" : ""
            }`}
          >
            <p className="font-medium text-sm mb-2">
              {qi + 1}. {q.pergunta}
            </p>
            <div className="space-y-1">
              {q.exibicao.map((op, pos) => (
                <label
                  key={op.indice}
                  className="flex items-start gap-2 text-sm cursor-pointer p-1"
                >
                  <input
                    type="radio"
                    name={`questionario-${prova.tentativa}-${q.id}`}
                    className="mt-1"
                    checked={marcada === op.indice}
                    onChange={() => onMarcar?.(q.id, op.indice)}
                    disabled={!!resultado}
                  />
                  <span>
                    {String.fromCharCode(65 + pos)}) {op.texto}
                    {previa && op.indice === q.correta && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                        <CheckCircle2 className="w-3 h-3" /> gabarito
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {previa && !resultado && q.comentario && (
              <p className="mt-2 rounded-md border border-dashed border-violet-300 bg-violet-50 p-2 text-xs text-violet-900">
                <span className="font-medium">Comentário (o aluno vê depois de enviar):</span>{" "}
                {q.comentario}
              </p>
            )}
            {faltando && <p className="text-xs text-red-600 mt-1">Falta responder esta questão.</p>}
            <CorrecaoComentada item={resultado?.revisao?.find?.((r) => r.questao_id === q.id)} />
          </div>
        );
      })}
    </div>
  );
}

/** Placar depois do envio; o não aprovado vê quantos acertos faltam e "Tentar de novo". */
export function ResultadoDoQuestionario({ resultado, onTentarDeNovo }) {
  const final = resultadoDoQuestionario(resultado);
  return (
    <div
      role="status"
      className={`rounded-lg border p-4 text-center space-y-1 ${
        final.aprovada
          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
          : "bg-amber-50 border-amber-200 text-amber-900"
      }`}
    >
      <p className="text-lg font-bold">{final.titulo}</p>
      <p className="text-sm">{final.mensagem}</p>
      {!final.aprovada && (
        <Button type="button" className="mt-2 bg-slate-900" onClick={onTentarDeNovo}>
          <RotateCcw /> Tentar de novo
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Despachar o questionário no `CursoPortal.jsx`**

(a) Import do componente — trecho atual:

```js
import ApostilaPdf from "./ApostilaPdf";
```

novo:

```js
import ApostilaPdf from "./ApostilaPdf";
import QuestionarioPortal from "./QuestionarioPortal";
```

(b) Lib — trecho atual (da Task 10):

```js
import {
  MSG_PREVIA_CONCLUSAO,
  botaoDeLeitura,
  rotuloDoTipoNaLista,
  tempoPrevisto,
} from "@/lib/portal-leitura";
```

novo:

```js
import {
  MSG_PREVIA_CONCLUSAO,
  avisoDeAulaConcluida,
  botaoDeLeitura,
  rotuloDoTipoNaLista,
  tempoPrevisto,
} from "@/lib/portal-leitura";
```

(c) Conclusão pela ação própria — trecho atual (da Task 10, logo depois de `concluirLeitura`):

```js
    await pararContagem(false);
    sincronizar({ concluir: true });
  };
```

novo:

```js
    await pararContagem(false);
    sincronizar({ concluir: true });
  };

  // Questionário aprovado ou caso concluído: quem concluiu a aula foi a ação própria, no servidor (o
  // `progresso` nunca conclui essas aulas). O tempo de tela que ainda não tinha ido segue para a trilha, sem
  // pedir conclusão, e a lista é buscada de novo para liberar a próxima aula. Prévia: só o aviso.
  const aoConcluirAtividade = async (resposta) => {
    if (previa) {
      setAviso(MSG_PREVIA_CONCLUSAO);
      return;
    }
    const a = aulaRef.current;
    pararContagem(false);
    if (a) {
      const segundos = Math.floor(assistidoRef.current);
      fila(() =>
        chamarPortal(
          "progresso",
          { matricula_id: mat.id, aula_id: a.id, segundos_assistidos: segundos },
          token
        )
      )
        .then(() => envioDeuCerto())
        .catch(tratarErroDeEnvio);
    }
    const novos = await atualizarAulas();
    setAviso(avisoDeAulaConcluida({ resposta, dados: novos, matriculaId: mat.id }));
  };
```

(d) Tela do questionário — trecho atual (da Task 10):

```jsx
            {(aula.tipo === "texto" || aula.tipo === "tarefa") && (
              <MarcadorDeFim key={aula.id} onVisivel={() => marcarFim(aula.id)} />
            )}
```

novo:

```jsx
            {(aula.tipo === "texto" || aula.tipo === "tarefa") && (
              <MarcadorDeFim key={aula.id} onVisivel={() => marcarFim(aula.id)} />
            )}
            {aula.tipo === "questionario" && (
              <QuestionarioPortal
                key={aula.id}
                api={api}
                item={item}
                aula={aula}
                token={token}
                fila={fila}
                tratarErro={tratarErro}
                onConcluida={aoConcluirAtividade}
              />
            )}
```

(e) Banner da prévia — trecho atual:

```jsx
              <strong>Prévia como aluno.</strong> Nada é gravado: sem matrícula, tempo, tentativa,
              certificado nem trilha. Todas as aulas estão liberadas e a prova mostra o gabarito.
```

novo:

```jsx
              <strong>Prévia como aluno.</strong> Nada é gravado: sem matrícula, tempo, tentativa,
              certificado nem trilha. Todas as aulas estão liberadas e a prova e os questionários
              mostram o gabarito.
```

- [ ] **Step 9: Rodar e ver passar**

Run:

```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas/apps/web && npx vitest run src/lib/portal-questionario.test.js src/components/portal-funcionario/QuestionarioPortal.test.jsx src/components/portal-funcionario/CursoPortal.efeitos.test.js src/components/portal-funcionario/CursoPortal.previa.test.jsx src/components/portal-funcionario/sem-emoji.test.js
```

Expected: PASS — `portal-questionario.test.js` 18 testes; `QuestionarioPortal.test.jsx` 8;
`CursoPortal.efeitos.test.js` 11; `CursoPortal.previa.test.jsx` 19 (a guarda ganhou um arquivo); `sem-emoji.test.js` 2.

- [ ] **Step 10: Formato, lint, build e a suíte do front**

Run:

<!-- prettier-ignore -->
```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas && npx prettier --write apps/web/src/lib/portal-questionario.js apps/web/src/lib/portal-questionario.test.js apps/web/src/components/portal-funcionario/QuestionarioPortal.jsx apps/web/src/components/portal-funcionario/QuestionarioPortal.test.jsx apps/web/src/components/portal-funcionario/AvaliacaoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx apps/web/src/components/portal-funcionario/sem-emoji.test.js && npx prettier --check apps/web/src/lib/portal-questionario.js apps/web/src/lib/portal-questionario.test.js apps/web/src/components/portal-funcionario/QuestionarioPortal.jsx apps/web/src/components/portal-funcionario/QuestionarioPortal.test.jsx apps/web/src/components/portal-funcionario/AvaliacaoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx apps/web/src/components/portal-funcionario/sem-emoji.test.js && (cd apps/web && npx eslint --rule "no-undef: error" src/components/portal-funcionario/QuestionarioPortal.jsx src/components/portal-funcionario/AvaliacaoPortal.jsx src/components/portal-funcionario/CursoPortal.jsx) && npm run lint && npm run build && npm test --workspace=apps/web
```

Expected: Prettier sem diferenças; ESLint sem erro; build ok; Vitest: o total da Task 10 + 2 arquivos e + 28 testes
(18 + 8 + 1 + 1), 0 falhas.

- [ ] **Step 11: Commit**

<!-- prettier-ignore -->
```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas && git status --short && git add apps/web/src/lib/portal-questionario.js apps/web/src/lib/portal-questionario.test.js apps/web/src/components/portal-funcionario/QuestionarioPortal.jsx apps/web/src/components/portal-funcionario/QuestionarioPortal.test.jsx apps/web/src/components/portal-funcionario/AvaliacaoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx apps/web/src/components/portal-funcionario/sem-emoji.test.js && git diff --staged --stat && git commit -F - -- apps/web/src/lib/portal-questionario.js apps/web/src/lib/portal-questionario.test.js apps/web/src/components/portal-funcionario/QuestionarioPortal.jsx apps/web/src/components/portal-funcionario/QuestionarioPortal.test.jsx apps/web/src/components/portal-funcionario/AvaliacaoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx apps/web/src/components/portal-funcionario/sem-emoji.test.js <<'EOF'
feat(ead): tela do questionário do módulo no portal do aluno

A2 da spec de 14/10: o questionário é estudo guiado. A tela abre a tentativa pelo servidor (questionario_abrir,
questões e alternativas sorteadas, sem gabarito), envia o índice original de cada resposta
(questionario_enviar) e mostra a nota, o resultado e a correção comentada aprovado ou não. Sem aprovação,
"Tentar de novo" abre uma tentativa nova; aprovado, a aula conclui e a lista é buscada de novo. Aula concluída
mostra a melhor nota. O rascunho das respostas usa uma chave por questionário, sem colidir com o da prova final.

Produção: nada sozinho; depende das ações das Tasks 7 e 8 no portal-funcionario (deploy antes do push).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

---

### Task 12: Portal — tela do caso com decisões

**Depende de:** Task 11 (`aoConcluirAtividade` no `CursoPortal`). O servidor das ações é a Task 9.

**Files:**

- Create: `apps/web/src/lib/portal-caso.js`
- Test: `apps/web/src/lib/portal-caso.test.js` (novo)
- Create: `apps/web/src/components/portal-funcionario/CasoPortal.jsx`
- Test: `apps/web/src/components/portal-funcionario/CasoPortal.test.jsx` (novo)
- Modify: `apps/web/src/components/portal-funcionario/CursoPortal.jsx` (import e despacho do tipo `caso`)
- Modify: `apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js` (describe novo no fim)
- Modify: `apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx` (guarda da API injetada)
- Modify: `apps/web/src/components/portal-funcionario/sem-emoji.test.js` (lib nova e o componente na lista)

**Interfaces:**

- Consumes (C5, Task 9):
  - `caso_abrir` → `{ situacao: "concluido", contexto, reflexao }` | `{ situacao: "fim", contexto, reflexao, ultimo }`
    | `{ situacao: "etapa", contexto, etapa: { id, pergunta, opcoes: [{ indice, texto }] }, passagem, ultimo }`;
    409 `CASO_INVALIDO`;
  - `caso_escolher` (corpo `matricula_id, aula_id, etapa_id, opcao` = índice ORIGINAL) →
    `{ comentario, segura, passagem, fim, etapa | null, reflexao | null }`; 409 `CASO_FORA_DE_ORDEM` com `estado`
    (o mesmo objeto do `caso_abrir`, que o `ErroPortal` entrega em `erro.extra.estado`), 400 `OPCAO_INVALIDA`, 409
    `CASO_ENCERRADO`, 409 `CASO_INVALIDO`;
  - `caso_concluir` → `{ aula_concluida: true, curso_concluido, precisa_avaliacao, status }`; 409 `CASO_INCOMPLETO`;
  - `mensagemDeFalha` (`lib/portal-curso.js`); `aoConcluirAtividade` (Task 11).
- Produces:
  - C6 `<CasoPortal api item aula token fila tratarErro onConcluida />` (default); `onConcluida(resposta)` recebe a
    resposta do `caso_concluir`;
  - export nomeado para teste: `CasoNaTela({ tela, aviso, enviando, onEscolher, onContinuar, onConcluir, onTentar })`;
  - `lib/portal-caso.js`: `MSG_CASO_RESPOSTA_INVALIDA`, `MSG_CASO_ATUALIZADO`, `MSG_CASO_ENCERRADO`,
    `MSG_OPCAO_INVALIDA`, `casoParaTela(resposta)`, `telaDepoisDaEscolha(tela, resposta, indice)`,
    `telaConcluida(tela)`, `reacaoAoErroDoCaso(erro)`, `reacaoAoErroDaAberturaDoCaso(erro)`.

Estados da tela (`fase`): `carregando` → `etapa` (pergunta e opções clicáveis) → `comentario` (destaque verde na
segura, âmbar na insegura, "Continuar") → `etapa` seguinte ou `fim` ("Para refletir" + "Concluir caso") → `concluido`;
`erro` (com "Tentar de novo" só quando adianta). A tela só passa de uma resposta do servidor para a próxima; quem
decide etapa, segura e fim é o servidor. As opções que chegam são copiadas só com `indice` e `texto`.

- [ ] **Step 1: Escrever o teste da lib**

`apps/web/src/lib/portal-caso.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  MSG_CASO_ATUALIZADO,
  MSG_CASO_ENCERRADO,
  MSG_CASO_RESPOSTA_INVALIDA,
  MSG_OPCAO_INVALIDA,
  casoParaTela,
  reacaoAoErroDaAberturaDoCaso,
  reacaoAoErroDoCaso,
  telaConcluida,
  telaDepoisDaEscolha,
} from "./portal-caso";
import { MSG_SEM_CONEXAO } from "./portal-curso";

/** Erro no formato do ErroPortal (components/portal-funcionario/api.js): `extra` é o corpo da resposta. */
const erro = (codigo, mensagem = "Recusado", extra = {}) =>
  Object.assign(new Error(mensagem), { codigo, extra: { codigo, error: mensagem, ...extra } });

// respostas sintéticas da ação `caso_abrir` (nenhum texto do material do curso)
const abertoNaEtapa = {
  success: true,
  situacao: "etapa",
  contexto: "Contexto sintético",
  etapa: {
    id: "e1",
    pergunta: "Qual a decisão?",
    opcoes: [
      { indice: 1, texto: "Opção B" },
      { indice: 0, texto: "Opção A" },
    ],
  },
  passagem: 1,
  ultimo: null,
};
const etapaSeguinte = {
  id: "e2",
  pergunta: "E agora?",
  opcoes: [
    { indice: 0, texto: "X" },
    { indice: 1, texto: "Y" },
  ],
};

describe("casoParaTela", () => {
  it("etapa: contexto, pergunta e opções só com índice e texto (qualquer campo a mais é descartado)", () => {
    const vazando = {
      ...abertoNaEtapa,
      etapa: {
        ...abertoNaEtapa.etapa,
        opcoes: abertoNaEtapa.etapa.opcoes.map((o) => ({
          ...o,
          segura: true,
          comentario: "não pode aparecer",
          proxima: "e9",
        })),
      },
    };
    expect(casoParaTela(vazando)).toEqual({
      fase: "etapa",
      contexto: "Contexto sintético",
      etapa: {
        id: "e1",
        pergunta: "Qual a decisão?",
        opcoes: [
          { indice: 1, texto: "Opção B" },
          { indice: 0, texto: "Opção A" },
        ],
      },
      passagem: 1,
      ultimo: null,
    });
  });

  it("fim, concluído e o comentário da última escolha (recarregar retoma de onde parou)", () => {
    expect(
      casoParaTela({
        situacao: "fim",
        contexto: "C",
        reflexao: "R",
        ultimo: { comentario: "Fim seguro.", segura: true },
      })
    ).toEqual({
      fase: "fim",
      contexto: "C",
      reflexao: "R",
      ultimo: { comentario: "Fim seguro.", segura: true },
    });
    expect(casoParaTela({ situacao: "concluido", contexto: "C", reflexao: "R" })).toEqual({
      fase: "concluido",
      contexto: "C",
      reflexao: "R",
    });
    expect(
      casoParaTela({ ...abertoNaEtapa, passagem: 2, ultimo: { comentario: "Volte.", segura: false } })
    ).toMatchObject({ passagem: 2, ultimo: { comentario: "Volte.", segura: false } });
  });

  it("resposta fora do formato: null", () => {
    for (const ruim of [
      null,
      undefined,
      {},
      { situacao: "outra" },
      { ...abertoNaEtapa, etapa: null },
      { ...abertoNaEtapa, etapa: { ...abertoNaEtapa.etapa, opcoes: [] } },
      { ...abertoNaEtapa, etapa: { ...abertoNaEtapa.etapa, opcoes: [{ indice: "0", texto: "A" }] } },
      { ...abertoNaEtapa, etapa: { ...abertoNaEtapa.etapa, id: "" } },
    ]) {
      expect(casoParaTela(ruim)).toBeNull();
    }
  });
});

describe("telaDepoisDaEscolha", () => {
  const etapa = casoParaTela(abertoNaEtapa);

  it("insegura que volta à mesma etapa: comentário, a escolha feita e a etapa de novo com a passagem seguinte", () => {
    const tela = telaDepoisDaEscolha(
      etapa,
      {
        comentario: "Arriscado.",
        segura: false,
        fim: false,
        passagem: 1,
        etapa: abertoNaEtapa.etapa,
        reflexao: null,
      },
      1
    );
    expect(tela).toMatchObject({
      fase: "comentario",
      contexto: "Contexto sintético",
      escolhida: "Opção B",
      comentario: "Arriscado.",
      segura: false,
      fim: false,
    });
    expect(tela.etapa.id).toBe("e1"); // a pergunta respondida continua à vista
    expect(tela.seguinte).toMatchObject({ fase: "etapa", passagem: 2, ultimo: null });
    expect(tela.seguinte.etapa.id).toBe("e1");
  });

  it("segura que avança: a próxima etapa, sem repetir o comentário depois do 'Continuar'", () => {
    const tela = telaDepoisDaEscolha(
      etapa,
      { comentario: "Isso.", segura: true, fim: false, passagem: 1, etapa: etapaSeguinte, reflexao: null },
      0
    );
    expect(tela).toMatchObject({ escolhida: "Opção A", segura: true });
    expect(tela.seguinte).toEqual({
      fase: "etapa",
      contexto: "Contexto sintético",
      etapa: etapaSeguinte,
      passagem: null,
      ultimo: null,
    });
  });

  it("escolha que encerra: a seguinte é 'Para refletir', com a reflexão", () => {
    const tela = telaDepoisDaEscolha(
      etapa,
      {
        comentario: "Fim seguro.",
        segura: true,
        fim: true,
        passagem: 1,
        etapa: null,
        reflexao: "Reflexão sintética",
      },
      0
    );
    expect(tela.fim).toBe(true);
    expect(tela.seguinte).toEqual({
      fase: "fim",
      contexto: "Contexto sintético",
      reflexao: "Reflexão sintética",
      ultimo: null,
    });
  });

  it("resposta incompleta ou tela que não é etapa: null", () => {
    expect(telaDepoisDaEscolha(etapa, { segura: true, fim: false, etapa: etapaSeguinte }, 0)).toBeNull();
    expect(
      telaDepoisDaEscolha(etapa, { comentario: "x", segura: true, fim: false, etapa: null }, 0)
    ).toBeNull();
    expect(telaDepoisDaEscolha(etapa, null, 0)).toBeNull();
    expect(
      telaDepoisDaEscolha({ fase: "fim" }, { comentario: "x", segura: true, fim: true }, 0)
    ).toBeNull();
  });
});

describe("telaConcluida", () => {
  it("guarda o contexto e a reflexão para o aluno rever", () => {
    expect(telaConcluida({ fase: "fim", contexto: "C", reflexao: "R", ultimo: null })).toEqual({
      fase: "concluido",
      contexto: "C",
      reflexao: "R",
    });
    expect(telaConcluida({})).toEqual({ fase: "concluido", contexto: "", reflexao: "" });
  });
});

describe("reações às recusas do servidor", () => {
  it("CASO_FORA_DE_ORDEM: a tela vai para o estado que o servidor mandou (ou abre de novo)", () => {
    const r = reacaoAoErroDoCaso(
      erro("CASO_FORA_DE_ORDEM", "Fora de ordem", {
        estado: { ...abertoNaEtapa, etapa: etapaSeguinte },
      })
    );
    expect(r.acao).toBe("tela");
    expect(r.aviso).toBe(MSG_CASO_ATUALIZADO);
    expect(r.tela.etapa.id).toBe("e2");
    expect(reacaoAoErroDoCaso(erro("CASO_FORA_DE_ORDEM", "Fora de ordem"))).toEqual({
      acao: "reabrir",
      aviso: MSG_CASO_ATUALIZADO,
    });
  });

  it("caso encerrado, opção que sumiu e conclusão antes do fim: abre de novo, com o aviso", () => {
    expect(reacaoAoErroDoCaso(erro("CASO_ENCERRADO"))).toEqual({
      acao: "reabrir",
      aviso: MSG_CASO_ENCERRADO,
    });
    expect(reacaoAoErroDoCaso(erro("OPCAO_INVALIDA"))).toEqual({
      acao: "reabrir",
      aviso: MSG_OPCAO_INVALIDA,
    });
    expect(
      reacaoAoErroDoCaso(erro("CASO_INCOMPLETO", "Chegue ao fim do caso para concluir"))
    ).toEqual({ acao: "reabrir", aviso: "Chegue ao fim do caso para concluir" });
  });

  it("caso com problema e aula bloqueada: erro sem 'Tentar de novo'; rede: a mensagem fica; sessão: portal", () => {
    expect(
      reacaoAoErroDoCaso(erro("CASO_INVALIDO", "Este caso está com problema — avise o RH"))
    ).toEqual({
      acao: "erro",
      mensagem: "Este caso está com problema — avise o RH",
      definitivo: true,
    });
    expect(
      reacaoAoErroDoCaso(erro("AULA_BLOQUEADA", "Conclua a aula anterior primeiro")).definitivo
    ).toBe(true);
    expect(reacaoAoErroDoCaso(new Error("Failed to fetch"))).toEqual({
      acao: "mensagem",
      mensagem: MSG_SEM_CONEXAO,
    });
    expect(reacaoAoErroDoCaso(new Error(MSG_CASO_RESPOSTA_INVALIDA))).toEqual({
      acao: "mensagem",
      mensagem: MSG_CASO_RESPOSTA_INVALIDA,
    });
    expect(reacaoAoErroDoCaso(erro("SESSAO", "Sessão expirada"))).toEqual({ acao: "sessao" });
  });

  it("abertura: caso com problema não oferece 'Tentar de novo'; rede oferece; sessão vai ao portal", () => {
    expect(
      reacaoAoErroDaAberturaDoCaso(erro("CASO_INVALIDO", "Este caso está com problema — avise o RH"))
    ).toEqual({
      acao: "erro",
      mensagem: "Este caso está com problema — avise o RH",
      definitivo: true,
    });
    expect(reacaoAoErroDaAberturaDoCaso(new Error("Failed to fetch"))).toEqual({
      acao: "erro",
      mensagem: MSG_SEM_CONEXAO,
      definitivo: false,
    });
    expect(reacaoAoErroDaAberturaDoCaso(erro("TROCAR_SENHA", "Troque a senha"))).toEqual({
      acao: "sessao",
    });
  });
});
```

- [ ] **Step 2: Escrever o teste do componente**

`apps/web/src/components/portal-funcionario/CasoPortal.test.jsx`:

```jsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Os componentes importam utilitários que leem `window` ao carregar; o ambiente de teste não tem DOM.
vi.hoisted(() => {
  const janela = {};
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

// O teste NUNCA carrega o cliente de produção (ver CursoPortal.previa.test.jsx).
vi.mock("@/api/sigoClient", () => ({
  sigo: {
    functions: {
      invoke: vi.fn(() => {
        throw new Error("o portal chamou o backend durante o teste");
      }),
    },
  },
  supabase: {},
  resolveStorageUrl: vi.fn(),
}));

import { sigo } from "@/api/sigoClient";
import CasoPortal, { CasoNaTela } from "./CasoPortal";
import { casoParaTela, telaConcluida, telaDepoisDaEscolha } from "@/lib/portal-caso";

const semOperacao = () => {};
const fila = (tarefa) => tarefa();
const desenhar = (tela, extra = {}) =>
  renderToStaticMarkup(
    <CasoNaTela
      tela={tela}
      onEscolher={semOperacao}
      onContinuar={semOperacao}
      onConcluir={semOperacao}
      onTentar={semOperacao}
      {...extra}
    />
  );

// dados sintéticos (nenhum texto do material do curso)
const aberto = {
  situacao: "etapa",
  contexto: "Contexto sintético do caso",
  etapa: {
    id: "e1",
    pergunta: "Qual a decisão?",
    opcoes: [
      { indice: 1, texto: "Opção B" },
      { indice: 0, texto: "Opção A" },
    ],
  },
  passagem: 1,
  ultimo: null,
};
const etapa = casoParaTela(aberto);
const proxima = {
  id: "e2",
  pergunta: "E agora?",
  opcoes: [
    { indice: 0, texto: "X" },
    { indice: 1, texto: "Y" },
  ],
};

describe("CasoPortal", () => {
  it("abre pelo servidor: antes da resposta só o 'Abrindo o caso...'", () => {
    const html = renderToStaticMarkup(
      <CasoPortal
        item={{ matricula: { id: "m1" } }}
        aula={{ id: "ac", tipo: "caso", titulo: "Caso" }}
        token="t"
        fila={fila}
        tratarErro={semOperacao}
        onConcluida={semOperacao}
      />
    );
    expect(html).toContain("Estudo de caso");
    expect(html).toContain("Abrindo o caso...");
    expect(sigo.functions.invoke).not.toHaveBeenCalled(); // o render estático não roda efeitos
  });

  it("etapa: contexto, pergunta e as opções como botões, só com o texto, na ordem do servidor", () => {
    const html = desenhar(etapa);
    expect(html).toContain("Contexto sintético do caso");
    expect(html).toContain("Qual a decisão?");
    expect(html.indexOf("Opção B")).toBeLessThan(html.indexOf("Opção A"));
    expect((html.match(/<button/g) || []).length).toBe(2);
    expect(html).not.toMatch(/segura|insegura/i);
  });

  it("de volta à etapa (recarregou a página): o comentário da última escolha e o aviso da passagem", () => {
    const html = desenhar(
      casoParaTela({ ...aberto, passagem: 2, ultimo: { comentario: "Volte e reveja.", segura: false } })
    );
    expect(html).toContain("Volte e reveja.");
    expect(html).toContain("Escolha insegura");
    expect(html).toContain("Você já passou por esta etapa");
  });

  it("escolha segura: comentário em verde, a escolha feita e 'Continuar' (a próxima pergunta só depois)", () => {
    const tela = telaDepoisDaEscolha(
      etapa,
      { comentario: "Muito bem: é o caminho seguro.", segura: true, fim: false, passagem: 1, etapa: proxima, reflexao: null },
      0
    );
    const html = desenhar(tela);
    expect(html).toContain("Sua escolha: Opção A");
    expect(html).toContain("Escolha segura");
    expect(html).toContain("Muito bem: é o caminho seguro.");
    expect(html).toContain("border-emerald-200");
    expect(html).toContain("Continuar");
    expect(html).not.toContain("E agora?");
  });

  it("escolha insegura: comentário em âmbar", () => {
    const tela = telaDepoisDaEscolha(
      etapa,
      { comentario: "Arriscado.", segura: false, fim: false, passagem: 1, etapa: aberto.etapa, reflexao: null },
      1
    );
    const html = desenhar(tela);
    expect(html).toContain("Escolha insegura");
    expect(html).toContain("border-amber-200");
    expect(html).toContain("Arriscado.");
  });

  it("fim: 'Para refletir' com a reflexão e só o botão 'Concluir caso'", () => {
    const fim = telaDepoisDaEscolha(
      etapa,
      { comentario: "Fim seguro.", segura: true, fim: true, passagem: 1, etapa: null, reflexao: "Reflexão sintética" },
      0
    ).seguinte;
    const html = desenhar(fim);
    expect(html).toContain("Para refletir");
    expect(html).toContain("Reflexão sintética");
    expect(html).toContain("Concluir caso");
    expect((html.match(/<button/g) || []).length).toBe(1);
  });

  it("concluído: a reflexão para rever, sem botão nenhum", () => {
    const html = desenhar(
      telaConcluida({ fase: "fim", contexto: "Contexto sintético do caso", reflexao: "Reflexão sintética" })
    );
    expect(html).toContain("Caso concluído.");
    expect(html).toContain("Reflexão sintética");
    expect(html).not.toContain("<button");
  });

  it("caso com problema: a mensagem do servidor, sem 'Tentar de novo'", () => {
    const html = desenhar({
      fase: "erro",
      mensagem: "Este caso está com problema — avise o RH",
      definitivo: true,
    });
    expect(html).toContain("Este caso está com problema — avise o RH");
    expect(html).not.toContain("Tentar de novo");
  });
});
```

- [ ] **Step 3: Travar a fiação e as guardas**

No fim de `apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js` acrescente:

```js

describe("caso com decisões (A3)", () => {
  it("o CursoPortal abre o CasoPortal com a API injetada e conclui pela mesma rotina do questionário", () => {
    expect(fonte).toMatch(
      /aula\.tipo === "caso" && \(\s*<CasoPortal[\s\S]*?api=\{api\}[\s\S]*?onConcluida=\{aoConcluirAtividade\}/
    );
  });
});
```

Em `apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx`, trecho atual (da Task 11):

```js
    "CertificadoPortal.jsx",
    "QuestionarioPortal.jsx",
  ]) {
```

novo:

```js
    "CertificadoPortal.jsx",
    "QuestionarioPortal.jsx",
    "CasoPortal.jsx",
  ]) {
```

Em `apps/web/src/components/portal-funcionario/sem-emoji.test.js`, trecho atual (da Task 11):

```js
    expect(componentes).toContain("./QuestionarioPortal.jsx");
  });
```

novo:

```js
    expect(componentes).toContain("./QuestionarioPortal.jsx");
    expect(componentes).toContain("./CasoPortal.jsx");
  });
```

e trecho atual:

```js
  "../../lib/portal-questionario.js",
];
```

novo:

```js
  "../../lib/portal-questionario.js",
  "../../lib/portal-caso.js",
];
```

- [ ] **Step 4: Rodar e ver falhar**

Run:

```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas/apps/web && npx vitest run src/lib/portal-caso.test.js src/components/portal-funcionario/CasoPortal.test.jsx src/components/portal-funcionario/CursoPortal.efeitos.test.js src/components/portal-funcionario/CursoPortal.previa.test.jsx src/components/portal-funcionario/sem-emoji.test.js
```

Expected: FAIL — `portal-caso.test.js` e `CasoPortal.test.jsx` não carregam (`Failed to resolve import`); o teste de
fonte falha em "caso com decisões"; a guarda de `CasoPortal.jsx` e o `sem-emoji` falham (`ENOENT`).

- [ ] **Step 5: Implementar a lib**

`apps/web/src/lib/portal-caso.js`:

```js
/**
 * Caso com decisões no portal do aluno (A3) — regras puras, sem DOM e sem rede.
 *
 * Quem decide a etapa atual, se a escolha foi segura e o fim é o SERVIDOR (ações `caso_abrir`, `caso_escolher` e
 * `caso_concluir`); a tela só passa de uma resposta para a próxima tela:
 * etapa (pergunta e opções só com o texto) → comentário da escolha (verde na segura, âmbar na insegura) →
 * "Continuar" → próxima etapa ou "Para refletir" → "Concluir caso" → concluído.
 * As opções nunca trazem `segura`, `comentario` ou `proxima` antes do clique; mesmo que viessem, a tela as
 * descarta (só `indice` e `texto` passam).
 * Quem usa: components/portal-funcionario/CasoPortal.jsx. Testes em portal-caso.test.js.
 */
import { mensagemDeFalha } from "./portal-curso";

export const MSG_CASO_RESPOSTA_INVALIDA =
  "O caso chegou incompleto. Tente de novo; se continuar, avise o RH.";
export const MSG_CASO_ATUALIZADO =
  "O caso andou em outra aba ou aparelho: a tela foi atualizada para a etapa atual.";
export const MSG_CASO_ENCERRADO = "Este caso já chegou ao fim: leia a reflexão e conclua.";
export const MSG_OPCAO_INVALIDA =
  "Essa opção não está mais no caso (o RH pode tê-lo alterado): a etapa foi aberta de novo.";

/** Recusas em que tentar de novo não adianta: o roteiro está com problema, ou falta a aula anterior. */
const CODIGOS_DEFINITIVOS = ["CASO_INVALIDO", "AULA_BLOQUEADA"];

const ehSessao = (erro) => erro?.codigo === "SESSAO" || erro?.codigo === "TROCAR_SENHA";
const texto = (v) => (typeof v === "string" ? v : "");

/** A etapa para a tela, só com o que o aluno pode ver; null se não tem a forma esperada. */
function etapaDaTela(etapa) {
  const valida =
    !!etapa &&
    typeof etapa.id === "string" &&
    etapa.id !== "" &&
    typeof etapa.pergunta === "string" &&
    Array.isArray(etapa.opcoes) &&
    etapa.opcoes.length > 0 &&
    etapa.opcoes.every(
      (o) => o && Number.isInteger(o.indice) && o.indice >= 0 && typeof o.texto === "string"
    );
  if (!valida) return null;
  return {
    id: etapa.id,
    pergunta: etapa.pergunta,
    opcoes: etapa.opcoes.map((o) => ({ indice: o.indice, texto: o.texto })),
  };
}

function ultimoDaTela(ultimo) {
  return ultimo && typeof ultimo.comentario === "string" && typeof ultimo.segura === "boolean"
    ? { comentario: ultimo.comentario, segura: ultimo.segura }
    : null;
}

/**
 * A resposta de `caso_abrir` (ou o `estado` de um `CASO_FORA_DE_ORDEM`) pronta para a tela, ou null:
 * - `{ fase: "etapa", contexto, etapa, passagem, ultimo }` (`passagem` = vezes nesta etapa nesta rodada);
 * - `{ fase: "fim", contexto, reflexao, ultimo }`;
 * - `{ fase: "concluido", contexto, reflexao }`.
 */
export function casoParaTela(resposta) {
  const r = resposta && typeof resposta === "object" ? resposta : null;
  if (!r) return null;
  const contexto = texto(r.contexto);
  if (r.situacao === "concluido") {
    return { fase: "concluido", contexto, reflexao: texto(r.reflexao) };
  }
  if (r.situacao === "fim") {
    return { fase: "fim", contexto, reflexao: texto(r.reflexao), ultimo: ultimoDaTela(r.ultimo) };
  }
  if (r.situacao !== "etapa") return null;
  const etapa = etapaDaTela(r.etapa);
  if (!etapa) return null;
  return {
    fase: "etapa",
    contexto,
    etapa,
    passagem: Number.isInteger(r.passagem) && r.passagem >= 1 ? r.passagem : null,
    ultimo: ultimoDaTela(r.ultimo),
  };
}

/**
 * Depois de `caso_escolher`: a tela do comentário (a pergunta respondida, a opção escolhida e o comentário,
 * em destaque) e, em `seguinte`, o que vem com o "Continuar" (a próxima etapa ou "Para refletir"). Voltar à
 * mesma etapa soma uma passagem; numa etapa nova a passagem fica desconhecida (null). null se a resposta não
 * tem a forma esperada ou se a tela não estava numa etapa.
 */
export function telaDepoisDaEscolha(tela, resposta, indice) {
  if (tela?.fase !== "etapa" || !tela.etapa) return null;
  const r = resposta && typeof resposta === "object" ? resposta : null;
  if (
    !r ||
    typeof r.comentario !== "string" ||
    typeof r.segura !== "boolean" ||
    typeof r.fim !== "boolean"
  ) {
    return null;
  }
  const contexto = texto(tela.contexto);
  let seguinte;
  if (r.fim) {
    seguinte = { fase: "fim", contexto, reflexao: texto(r.reflexao), ultimo: null };
  } else {
    const etapa = etapaDaTela(r.etapa);
    if (!etapa) return null;
    const mesma = etapa.id === tela.etapa.id;
    seguinte = {
      fase: "etapa",
      contexto,
      etapa,
      passagem: mesma ? (tela.passagem ?? 1) + 1 : null,
      ultimo: null,
    };
  }
  return {
    fase: "comentario",
    contexto,
    etapa: tela.etapa,
    escolhida: tela.etapa.opcoes.find((o) => o.indice === indice)?.texto ?? "",
    comentario: r.comentario,
    segura: r.segura,
    fim: r.fim,
    seguinte,
  };
}

/** Depois de `caso_concluir`: o caso concluído, com o contexto e a reflexão para rever. */
export function telaConcluida(tela) {
  return { fase: "concluido", contexto: texto(tela?.contexto), reflexao: texto(tela?.reflexao) };
}

/** Falha ao abrir o caso: a sessão vai ao portal; o resto vira mensagem, com ou sem "Tentar de novo". */
export function reacaoAoErroDaAberturaDoCaso(erro) {
  if (ehSessao(erro)) return { acao: "sessao" };
  return {
    acao: "erro",
    mensagem: mensagemDeFalha(erro),
    definitivo: CODIGOS_DEFINITIVOS.includes(erro?.codigo),
  };
}

/**
 * Recusa de uma escolha ou da conclusão. O servidor é quem sabe onde o caso está:
 * - `CASO_FORA_DE_ORDEM`: a tela vai para o `estado` que ele mandou (sem estado legível, abre de novo);
 * - `CASO_ENCERRADO`, `OPCAO_INVALIDA`, `CASO_INCOMPLETO`: abre de novo, com o aviso;
 * - `CASO_INVALIDO`, `AULA_BLOQUEADA`: erro sem "Tentar de novo";
 * - sessão: o portal pede login; o resto (rede, resposta fora do formato): a mensagem fica e a tela não muda.
 */
export function reacaoAoErroDoCaso(erro) {
  if (ehSessao(erro)) return { acao: "sessao" };
  switch (erro?.codigo) {
    case "CASO_FORA_DE_ORDEM": {
      const tela = casoParaTela(erro.extra?.estado);
      return tela
        ? { acao: "tela", tela, aviso: MSG_CASO_ATUALIZADO }
        : { acao: "reabrir", aviso: MSG_CASO_ATUALIZADO };
    }
    case "CASO_ENCERRADO":
      return { acao: "reabrir", aviso: MSG_CASO_ENCERRADO };
    case "OPCAO_INVALIDA":
      return { acao: "reabrir", aviso: MSG_OPCAO_INVALIDA };
    case "CASO_INCOMPLETO":
      return { acao: "reabrir", aviso: mensagemDeFalha(erro) };
    default:
      if (CODIGOS_DEFINITIVOS.includes(erro?.codigo)) {
        return { acao: "erro", mensagem: mensagemDeFalha(erro), definitivo: true };
      }
      return { acao: "mensagem", mensagem: mensagemDeFalha(erro) };
  }
}
```

- [ ] **Step 6: Implementar o componente**

`apps/web/src/components/portal-funcionario/CasoPortal.jsx`:

```jsx
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Signpost,
} from "lucide-react";
import { apiPortal } from "./api";
import {
  MSG_CASO_RESPOSTA_INVALIDA,
  casoParaTela,
  reacaoAoErroDaAberturaDoCaso,
  reacaoAoErroDoCaso,
  telaConcluida,
  telaDepoisDaEscolha,
} from "@/lib/portal-caso";

/**
 * Caso com decisões (A3): o aluno lê a situação e escolhe, etapa por etapa, só clicando. O caso é do SERVIDOR:
 * `caso_abrir` diz onde ele está (refeito a partir da trilha: recarregar a página retoma de onde parou),
 * `caso_escolher` confere a etapa, grava a escolha e devolve o comentário e a próxima etapa, e `caso_concluir`
 * conclui a aula no fim ("Para refletir"). A escolha insegura mostra o comentário em âmbar e segue para onde o
 * roteiro manda; a segura, em verde.
 *
 * `api` é injetada (padrão: o portal de verdade). Na prévia do RT o roteiro anda no navegador, sem gravar nada
 * (lib/portal-previa.js).
 */
export default function CasoPortal({
  api = apiPortal,
  item,
  aula,
  token,
  fila,
  tratarErro,
  onConcluida,
}) {
  const { chamarPortal } = api;
  const [tela, setTela] = useState({ fase: "carregando" });
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const ocupadoRef = useRef(false); // uma chamada por vez: dois cliques rápidos não viram duas escolhas
  const corpo = (extra = {}) => ({ matricula_id: item.matricula.id, aula_id: aula.id, ...extra });

  const abrir = async (avisoNovo = "") => {
    setTela({ fase: "carregando" });
    setAviso("");
    try {
      const r = await fila(() => chamarPortal("caso_abrir", corpo(), token));
      const nova = casoParaTela(r);
      if (!nova) throw new Error(MSG_CASO_RESPOSTA_INVALIDA);
      setTela(nova);
      setAviso(avisoNovo);
    } catch (e) {
      const reacao = reacaoAoErroDaAberturaDoCaso(e);
      if (reacao.acao === "sessao") tratarErro(e);
      else setTela({ fase: "erro", mensagem: reacao.mensagem, definitivo: reacao.definitivo });
    }
  };

  useEffect(() => {
    abrir();
  }, []);

  // recusa de uma escolha ou da conclusão: vale o que o servidor diz (lib/portal-caso.js)
  const tratarRecusa = async (e) => {
    const reacao = reacaoAoErroDoCaso(e);
    if (reacao.acao === "sessao") tratarErro(e);
    else if (reacao.acao === "tela") {
      setTela(reacao.tela);
      setAviso(reacao.aviso);
    } else if (reacao.acao === "reabrir") await abrir(reacao.aviso);
    else if (reacao.acao === "erro") {
      setTela({ fase: "erro", mensagem: reacao.mensagem, definitivo: reacao.definitivo });
    } else setAviso(reacao.mensagem);
  };

  const enviar = async (acao, extra, aoResponder) => {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setEnviando(true);
    setAviso("");
    try {
      const r = await fila(() => chamarPortal(acao, corpo(extra), token));
      aoResponder(r);
    } catch (e) {
      await tratarRecusa(e);
    } finally {
      ocupadoRef.current = false;
      setEnviando(false);
    }
  };

  const escolher = (indice) => {
    if (tela.fase !== "etapa") return undefined;
    const atual = tela;
    return enviar("caso_escolher", { etapa_id: atual.etapa.id, opcao: indice }, (r) => {
      const nova = telaDepoisDaEscolha(atual, r, indice);
      if (!nova) throw new Error(MSG_CASO_RESPOSTA_INVALIDA);
      setTela(nova);
    });
  };

  const continuar = () => {
    if (tela.fase === "comentario") setTela(tela.seguinte);
  };

  const concluir = () => {
    if (tela.fase !== "fim") return undefined;
    const atual = tela;
    return enviar("caso_concluir", {}, (r) => {
      setTela(telaConcluida(atual));
      onConcluida?.(r);
    });
  };

  return (
    <CasoNaTela
      tela={tela}
      aviso={aviso}
      enviando={enviando}
      onEscolher={escolher}
      onContinuar={continuar}
      onConcluir={concluir}
      onTentar={() => abrir()}
    />
  );
}

/** Comentário de uma escolha: verde na segura, âmbar na insegura. */
function ComentarioDaEscolha({ comentario, segura }) {
  return (
    <div
      role="status"
      className={`rounded-lg border p-3 text-sm space-y-1 ${
        segura
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <p className="font-semibold flex items-center gap-2">
        {segura ? (
          <ShieldCheck className="w-4 h-4 shrink-0" />
        ) : (
          <ShieldAlert className="w-4 h-4 shrink-0" />
        )}
        {segura ? "Escolha segura" : "Escolha insegura"}
      </p>
      <p className="whitespace-pre-wrap">{comentario}</p>
    </div>
  );
}

/** O caso na tela, a partir do estado montado em lib/portal-caso.js (sem rede: os testes o desenham direto). */
export function CasoNaTela({
  tela,
  aviso = "",
  enviando = false,
  onEscolher,
  onContinuar,
  onConcluir,
  onTentar,
}) {
  const mostraContexto =
    ["etapa", "comentario", "fim", "concluido"].includes(tela.fase) && !!tela.contexto;
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 font-semibold text-slate-800 text-lg">
        <Signpost className="w-5 h-5 text-sky-600" /> Estudo de caso
      </h2>

      {mostraContexto && (
        <div className="bg-white rounded-lg border p-4 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Situação</p>
          <p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
            {tela.contexto}
          </p>
        </div>
      )}

      {aviso && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"
        >
          {aviso}
        </p>
      )}

      {tela.fase === "carregando" && (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Abrindo o caso...
        </p>
      )}

      {tela.fase === "erro" && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
          <p className="flex items-start gap-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{tela.mensagem}</span>
          </p>
          {!tela.definitivo && (
            <Button type="button" variant="outline" className="bg-white" onClick={onTentar}>
              <RotateCcw /> Tentar de novo
            </Button>
          )}
        </div>
      )}

      {tela.fase === "etapa" && (
        <div className="space-y-2">
          {tela.ultimo && (
            <>
              <p className="text-xs text-slate-500">Comentário da sua última escolha:</p>
              <ComentarioDaEscolha
                comentario={tela.ultimo.comentario}
                segura={tela.ultimo.segura}
              />
            </>
          )}
          {tela.passagem > 1 && (
            <p className="text-xs text-amber-700">
              Você já passou por esta etapa. Releia a situação antes de escolher.
            </p>
          )}
          <p className="font-medium text-slate-800 whitespace-pre-wrap">{tela.etapa.pergunta}</p>
          <div className="space-y-2">
            {tela.etapa.opcoes.map((op) => (
              <Button
                key={op.indice}
                type="button"
                variant="outline"
                disabled={enviando}
                onClick={() => onEscolher?.(op.indice)}
                className="w-full h-auto min-h-11 justify-start whitespace-normal bg-white py-2 text-left"
              >
                <span className="min-w-0 flex-1 break-words">{op.texto}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {tela.fase === "comentario" && (
        <div className="space-y-2">
          <p className="font-medium text-slate-800 whitespace-pre-wrap">{tela.etapa.pergunta}</p>
          {tela.escolhida && (
            <p className="text-sm text-slate-600">Sua escolha: {tela.escolhida}</p>
          )}
          <ComentarioDaEscolha comentario={tela.comentario} segura={tela.segura} />
          <Button
            type="button"
            className="w-full h-11 bg-slate-900 hover:bg-slate-800"
            onClick={onContinuar}
          >
            Continuar <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {tela.fase === "fim" && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-3">
          <p className="flex items-center gap-2 font-semibold text-sky-900">
            <Lightbulb className="w-4 h-4" /> Para refletir
          </p>
          {tela.reflexao && (
            <p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
              {tela.reflexao}
            </p>
          )}
          <Button
            type="button"
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700"
            disabled={enviando}
            onClick={onConcluir}
          >
            {enviando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Concluir caso
          </Button>
        </div>
      )}

      {tela.fase === "concluido" && (
        <div className="space-y-2">
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" /> Caso concluído.
          </p>
          {tela.reflexao && (
            <div className="rounded-lg border bg-white p-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Para refletir
              </p>
              <p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                {tela.reflexao}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Despachar o caso no `CursoPortal.jsx`**

(a) Import — trecho atual (da Task 11):

```js
import QuestionarioPortal from "./QuestionarioPortal";
```

novo:

```js
import QuestionarioPortal from "./QuestionarioPortal";
import CasoPortal from "./CasoPortal";
```

(b) Tela do caso — trecho atual (da Task 11):

```jsx
            {aula.tipo === "questionario" && (
              <QuestionarioPortal
                key={aula.id}
                api={api}
                item={item}
                aula={aula}
                token={token}
                fila={fila}
                tratarErro={tratarErro}
                onConcluida={aoConcluirAtividade}
              />
            )}
```

novo:

```jsx
            {aula.tipo === "questionario" && (
              <QuestionarioPortal
                key={aula.id}
                api={api}
                item={item}
                aula={aula}
                token={token}
                fila={fila}
                tratarErro={tratarErro}
                onConcluida={aoConcluirAtividade}
              />
            )}
            {aula.tipo === "caso" && (
              <CasoPortal
                key={aula.id}
                api={api}
                item={item}
                aula={aula}
                token={token}
                fila={fila}
                tratarErro={tratarErro}
                onConcluida={aoConcluirAtividade}
              />
            )}
```

- [ ] **Step 8: Rodar e ver passar**

Run:

```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas/apps/web && npx vitest run src/lib/portal-caso.test.js src/components/portal-funcionario/CasoPortal.test.jsx src/components/portal-funcionario/CursoPortal.efeitos.test.js src/components/portal-funcionario/CursoPortal.previa.test.jsx src/components/portal-funcionario/sem-emoji.test.js
```

Expected: PASS — `portal-caso.test.js` 12 testes; `CasoPortal.test.jsx` 8; `CursoPortal.efeitos.test.js` 12;
`CursoPortal.previa.test.jsx` 20; `sem-emoji.test.js` 2.

- [ ] **Step 9: Formato, lint, build e a suíte do front**

Run:

<!-- prettier-ignore -->
```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas && npx prettier --write apps/web/src/lib/portal-caso.js apps/web/src/lib/portal-caso.test.js apps/web/src/components/portal-funcionario/CasoPortal.jsx apps/web/src/components/portal-funcionario/CasoPortal.test.jsx apps/web/src/components/portal-funcionario/CursoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx apps/web/src/components/portal-funcionario/sem-emoji.test.js && npx prettier --check apps/web/src/lib/portal-caso.js apps/web/src/lib/portal-caso.test.js apps/web/src/components/portal-funcionario/CasoPortal.jsx apps/web/src/components/portal-funcionario/CasoPortal.test.jsx apps/web/src/components/portal-funcionario/CursoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx apps/web/src/components/portal-funcionario/sem-emoji.test.js && (cd apps/web && npx eslint --rule "no-undef: error" src/components/portal-funcionario/CasoPortal.jsx src/components/portal-funcionario/CursoPortal.jsx) && npm run lint && npm run build && npm test --workspace=apps/web
```

Expected: Prettier sem diferenças; ESLint sem erro; build ok; Vitest: o total da Task 11 + 2 arquivos e + 22 testes
(12 + 8 + 1 + 1), 0 falhas.

- [ ] **Step 10: Commit**

<!-- prettier-ignore -->
```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas && git status --short && git add apps/web/src/lib/portal-caso.js apps/web/src/lib/portal-caso.test.js apps/web/src/components/portal-funcionario/CasoPortal.jsx apps/web/src/components/portal-funcionario/CasoPortal.test.jsx apps/web/src/components/portal-funcionario/CursoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx apps/web/src/components/portal-funcionario/sem-emoji.test.js && git diff --staged --stat && git commit -F - -- apps/web/src/lib/portal-caso.js apps/web/src/lib/portal-caso.test.js apps/web/src/components/portal-funcionario/CasoPortal.jsx apps/web/src/components/portal-funcionario/CasoPortal.test.jsx apps/web/src/components/portal-funcionario/CursoPortal.jsx apps/web/src/components/portal-funcionario/CursoPortal.efeitos.test.js apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx apps/web/src/components/portal-funcionario/sem-emoji.test.js <<'EOF'
feat(ead): tela do caso com decisões no portal do aluno

A3 da spec de 14/10: o aluno lê a situação e escolhe só clicando. A tela abre o caso pelo servidor (caso_abrir,
que retoma de onde parou), manda cada escolha (caso_escolher) e mostra o comentário em destaque, verde na
escolha segura e âmbar na insegura, com "Continuar". No fim, "Para refletir" e "Concluir caso" (caso_concluir).
Escolha fora de ordem leva a tela ao estado que o servidor devolveu; as opções só passam com o texto e o índice.

Produção: nada sozinho; depende das ações das Tasks 7 e 9 no portal-funcionario (deploy antes do push).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

---

### Task 13: "Ver como aluno" com o questionário, o caso e a tarefa

**Depende de:** Task 2 (`lib/ead-caso.js`), Tasks 10–12 (as telas que a prévia alimenta). Não mexe no
`TreinamentosEadTab.jsx`: quem passa `casos` à prévia é a Task 16.

**Files:**

- Modify: `apps/web/src/lib/portal-previa.js` (cabeçalho `:1-28`, `montarItemPrevia` `:113-193`, `criarApiPrevia`
  `:255-332`; funções novas `notaMinimaDoModulo`, `roteiroDoCaso`, `erroDoPortal`)
- Modify: `apps/web/src/lib/portal-previa.test.js` (`:456-467`; describe novo no fim)
- Modify: `apps/web/src/components/seguranca/PreviaAlunoCurso.jsx:14-25`
- Modify: `apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx` (imports `:29-34`, `:71-73`,
  describe novo no fim)
- Modify: `apps/web/src/components/portal-funcionario/sem-emoji.test.js` (lib da prévia na lista)

**Interfaces:**

- Consumes: C3 (Task 2) `estadoDoCaso(conteudo, escolhas)`, `etapaParaAluno(conteudo, etapaId, aleatorio)`,
  `resultadoDaEscolha(conteudo, estado, etapaId, opcao)`. Premissas desta task sobre a Task 2 (o contrato as implica;
  se a Task 2 decidir diferente, ajuste só o teste): `resultadoDaEscolha` com o estado no fim devolve
  `CASO_ENCERRADO` antes de conferir a etapa; `passagens` conta 1 na primeira visita a cada etapa e soma a cada volta;
  `ultimo` é `null` antes da primeira escolha. Aula de caso sem roteiro (ou com o roteiro apagado) nem chega ao
  `estadoDoCaso`: a prévia responde `CASO_INVALIDO` direto.
- Produces:
  - C6 `montarItemPrevia({ curso, aulas, questoes, casos, urls })`: `item.questoes` = só as da prova final (`aula_id`
    vazio, sem as apagadas); `item.avaliacao.total_questoes` e `item.curso.tem_avaliacao` contam só essas; `tarefa`
    leva `conteudo_texto`; campo novo, só da prévia, `item.atividades_previa = { nota_minima_modulo, questionarios:
    { [aulaId]: questao[] }, casos: { [aulaId]: roteiro } }` (o servidor nunca manda isso ao aluno);
  - C6 `criarApiPrevia({ item, aleatorio? })` (o `aleatorio`, opcional, existe para o teste; padrão
    `Math.random`): responde `questionario_abrir` (sorteio local, com gabarito, `tentativa` = enviadas + 1,
    `QUESTIONARIO_VAZIO` sem questões), `questionario_enviar` (correção local com a nota mínima do módulo, revisão nos
    dois resultados, `aula_concluida: false`), `caso_abrir`, `caso_escolher` (`CASO_FORA_DE_ORDEM` com
    `extra.estado`, e os demais códigos de `resultadoDaEscolha`) e `caso_concluir` (`CASO_INCOMPLETO` antes do fim;
    no fim devolve `aula_concluida: false` e o caso recomeça). Estado só na memória da prévia; nada é gravado;
  - `PreviaAlunoCurso({ curso, aulas, questoes, casos = [], onFechar })`.

- [ ] **Step 1: Escrever os testes da prévia**

Em `apps/web/src/lib/portal-previa.test.js`, trecho atual (`:456-467`):

```js
    const acoes = [
      "evento",
      "progresso",
      "iniciar_avaliacao",
      "avaliacao",
      "duvida",
      "certificado",
      "ciencia",
      "dados",
      "login",
      "qualquer_outra",
    ];
```

novo:

```js
    const acoes = [
      "evento",
      "progresso",
      "iniciar_avaliacao",
      "avaliacao",
      "questionario_abrir",
      "questionario_enviar",
      "caso_abrir",
      "caso_escolher",
      "caso_concluir",
      "duvida",
      "certificado",
      "ciencia",
      "dados",
      "login",
      "qualquer_outra",
    ];
```

No fim do arquivo (depois do describe "paridade da prévia com o servidor (A6)") acrescente:

```js

describe("atividades dos módulos na prévia (questionário, caso e tarefa)", () => {
  // roteiro sintético (nenhum texto do material do curso): e1 -> e2 -> fim; a insegura de e1 vai à recuperação r1
  const roteiro = {
    contexto: "Situação sintética: um quadro de teste precisa de manutenção.",
    etapas: [
      {
        id: "e1",
        pergunta: "Primeira decisão?",
        opcoes: [
          { texto: "Testar a ausência de tensão", comentario: "Certo: teste antes.", segura: true, proxima: "e2" },
          { texto: "Ligar sem testar", comentario: "Arriscado: teste antes.", segura: false, proxima: "r1" },
        ],
      },
      {
        id: "r1",
        pergunta: "O que fazer agora?",
        opcoes: [
          { texto: "Voltar e testar", comentario: "Isso: volte e teste.", segura: true, proxima: "e1" },
          { texto: "Seguir assim mesmo", comentario: "Ainda arriscado.", segura: false, proxima: "r1" },
        ],
      },
      {
        id: "e2",
        pergunta: "Como liberar o quadro?",
        opcoes: [
          { texto: "Liberar com tudo conferido", comentario: "Fim seguro.", segura: true, proxima: null },
          { texto: "Liberar sem avisar a equipe", comentario: "Avise sempre.", segura: false, proxima: "e2" },
        ],
      },
    ],
    reflexao: "Reflexão sintética: o teste vem antes do toque.",
  };
  const aulasAtividades = [
    { id: "t1", ordem: 1, tipo: "tarefa", titulo: "Tarefa", conteudo_texto: "Instruções sintéticas", duracao_seg: 2100 },
    { id: "qz", ordem: 2, tipo: "questionario", titulo: "Questionário do módulo", conteudo_texto: "não vai", duracao_seg: 900 },
    { id: "cs", ordem: 3, tipo: "caso", titulo: "Caso 1", duracao_seg: 600 },
    { id: "cv", ordem: 4, tipo: "caso", titulo: "Caso com roteiro apagado", duracao_seg: 600 },
    { id: "qv", ordem: 5, tipo: "questionario", titulo: "Questionário vazio", duracao_seg: 900 },
  ];
  const questoesDoModulo = Array.from({ length: 8 }, (_, i) => ({
    id: `m${i + 1}`,
    aula_id: "qz",
    ordem: i + 1,
    pergunta: `Questão sintética ${i + 1}?`,
    opcoes: ["certa", "errada", "outra"],
    correta: 0,
    comentario: `Comentário ${i + 1}`,
  }));
  const montar = (extra = {}) =>
    montarItemPrevia({
      curso: { ...curso, ...extra },
      aulas: aulasAtividades,
      questoes: [
        ...questoes,
        ...questoesDoModulo,
        { ...questoesDoModulo[0], id: "apagada", deleted_at: "2026-10-01T00:00:00Z" },
      ],
      casos: [
        { aula_id: "cs", conteudo: roteiro },
        { aula_id: "cv", conteudo: roteiro, deleted_at: "2026-10-01T00:00:00Z" },
      ],
      urls,
    });
  const respostasCom = (acertos) =>
    questoesDoModulo.map((q, i) => ({ questao_id: q.id, resposta: i < acertos ? 0 : 1 }));
  const indice = (etapa, texto) => etapa.opcoes.find((o) => o.texto === texto).indice;

  it("a prova final usa só as questões sem aula; as dos questionários e os roteiros ficam à parte", () => {
    const item = montar();
    expect(item.questoes.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(item.avaliacao.total_questoes).toBe(2);
    expect(item.curso.tem_avaliacao).toBe(true);
    expect(item.atividades_previa.questionarios.qz.map((q) => q.id)).toEqual(
      questoesDoModulo.map((q) => q.id)
    );
    expect(JSON.stringify(item.atividades_previa)).not.toContain("apagada");
    expect(Object.keys(item.atividades_previa.casos)).toEqual(["cs"]);
  });

  it("a tarefa leva o texto da aula; questionário e caso, não (vêm das ações próprias)", () => {
    const item = montar();
    expect(item.aulas.find((a) => a.id === "t1").conteudo_texto).toBe("Instruções sintéticas");
    expect(item.aulas.find((a) => a.id === "qz").conteudo_texto).toBeNull();
    expect(item.aulas.find((a) => a.id === "cs").conteudo_texto).toBeNull();
  });

  it("nota mínima dos questionários: a do curso (0 a 100), ou 80", () => {
    expect(montar().atividades_previa.nota_minima_modulo).toBe(80);
    expect(montar({ nota_minima_modulo: 70 }).atividades_previa.nota_minima_modulo).toBe(70);
    expect(montar({ nota_minima_modulo: "90" }).atividades_previa.nota_minima_modulo).toBe(90);
    expect(montar({ nota_minima_modulo: 0 }).atividades_previa.nota_minima_modulo).toBe(0);
    for (const ruim of [150, -1, "", "abc", 7.5]) {
      expect(montar({ nota_minima_modulo: ruim }).atividades_previa.nota_minima_modulo).toBe(80);
    }
  });

  it("questionario_abrir sorteia as questões da aula, com gabarito só para o RT", async () => {
    const api = criarApiPrevia({ item: montar() });
    const r = await api.chamarPortal("questionario_abrir", { aula_id: "qz" });
    expect(r).toMatchObject({ success: true, concluida: false, tentativa: 1, nota_minima: 80 });
    expect(r.questoes.map((q) => q.id).sort()).toEqual(questoesDoModulo.map((q) => q.id).sort());
    const prova = provaParaTela(r, { previa: true });
    expect(prova).not.toBeNull();
    const q = prova.questoes[0];
    expect(q.exibicao.find((o) => o.indice === q.correta).texto).toBe("certa");
  });

  it("6 de 8 não aprova (75%) e 7 de 8 aprova (88%); a correção comentada vem nos dois (A2) e nada conclui", async () => {
    const api = criarApiPrevia({ item: montar() });
    await api.chamarPortal("questionario_abrir", { aula_id: "qz" });
    const reprovado = await api.chamarPortal("questionario_enviar", {
      aula_id: "qz",
      respostas: respostasCom(6),
    });
    expect(reprovado).toMatchObject({
      resultado: "insatisfatorio",
      aprovada: false,
      nota: 75,
      acertos: 6,
      total: 8,
      nota_minima: 80,
      tentativa: 1,
      aula_concluida: false,
    });
    expect(reprovado.revisao).toHaveLength(8);
    expect(reprovado.revisao[7]).toEqual({
      questao_id: "m8",
      acertou: false,
      resposta_correta: "certa",
      comentario: "Comentário 8",
    });
    await api.chamarPortal("questionario_abrir", { aula_id: "qz" });
    const aprovado = await api.chamarPortal("questionario_enviar", {
      aula_id: "qz",
      respostas: respostasCom(7),
    });
    expect(aprovado).toMatchObject({
      resultado: "satisfatorio",
      aprovada: true,
      nota: 88,
      tentativa: 2,
      aula_concluida: false,
      curso_concluido: false,
    });
    expect(aprovado.revisao).toHaveLength(8);
  });

  it("tentativas livres: cada abertura depois de um envio é a tentativa seguinte", async () => {
    const api = criarApiPrevia({ item: montar() });
    expect((await api.chamarPortal("questionario_abrir", { aula_id: "qz" })).tentativa).toBe(1);
    expect((await api.chamarPortal("questionario_abrir", { aula_id: "qz" })).tentativa).toBe(1);
    await api.chamarPortal("questionario_enviar", { aula_id: "qz", respostas: respostasCom(0) });
    expect((await api.chamarPortal("questionario_abrir", { aula_id: "qz" })).tentativa).toBe(2);
  });

  it("questionário sem questões: QUESTIONARIO_VAZIO; aula de outro tipo: recusa", async () => {
    const api = criarApiPrevia({ item: montar() });
    const vazio = await api.chamarPortal("questionario_abrir", { aula_id: "qv" }).catch((e) => e);
    expect(vazio.codigo).toBe("QUESTIONARIO_VAZIO");
    expect(vazio.message).toMatch(/avise o RH/);
    const outro = await api.chamarPortal("questionario_abrir", { aula_id: "cs" }).catch((e) => e);
    expect(outro).toBeInstanceOf(Error);
    expect(outro.message).toMatch(/não é um questionário/);
  });

  it("caso: etapa só com os textos; a insegura vai à recuperação e volta; a segura leva ao fim", async () => {
    const api = criarApiPrevia({ item: montar() });
    const abrir = () => api.chamarPortal("caso_abrir", { aula_id: "cs" });
    const escolher = (etapa_id, opcao) =>
      api.chamarPortal("caso_escolher", { aula_id: "cs", etapa_id, opcao });

    const inicio = await abrir();
    expect(inicio).toMatchObject({
      situacao: "etapa",
      contexto: roteiro.contexto,
      passagem: 1,
      ultimo: null,
    });
    expect(inicio.etapa.id).toBe("e1");
    for (const op of inicio.etapa.opcoes) expect(Object.keys(op).sort()).toEqual(["indice", "texto"]);

    const insegura = await escolher("e1", indice(inicio.etapa, "Ligar sem testar"));
    expect(insegura).toMatchObject({
      comentario: "Arriscado: teste antes.",
      segura: false,
      fim: false,
      passagem: 1,
      reflexao: null,
    });
    expect(insegura.etapa.id).toBe("r1");

    const volta = await escolher("r1", indice(insegura.etapa, "Voltar e testar"));
    expect(volta.etapa.id).toBe("e1");
    const retomado = await abrir();
    expect(retomado).toMatchObject({
      situacao: "etapa",
      passagem: 2,
      ultimo: { comentario: "Isso: volte e teste.", segura: true },
    });

    const segura = await escolher("e1", indice(retomado.etapa, "Testar a ausência de tensão"));
    expect(segura).toMatchObject({ segura: true, fim: false, passagem: 2 });
    const fim = await escolher("e2", indice(segura.etapa, "Liberar com tudo conferido"));
    expect(fim).toMatchObject({ segura: true, fim: true, etapa: null, reflexao: roteiro.reflexao });
    expect(await abrir()).toMatchObject({ situacao: "fim", reflexao: roteiro.reflexao });
  });

  it("escolha numa etapa que não é a atual: CASO_FORA_DE_ORDEM com o estado atual", async () => {
    const api = criarApiPrevia({ item: montar() });
    const inicio = await api.chamarPortal("caso_abrir", { aula_id: "cs" });
    await api.chamarPortal("caso_escolher", {
      aula_id: "cs",
      etapa_id: "e1",
      opcao: indice(inicio.etapa, "Ligar sem testar"),
    });
    const erro = await api
      .chamarPortal("caso_escolher", { aula_id: "cs", etapa_id: "e1", opcao: 0 })
      .catch((e) => e);
    expect(erro.codigo).toBe("CASO_FORA_DE_ORDEM");
    expect(erro.extra.estado).toMatchObject({ situacao: "etapa", contexto: roteiro.contexto });
    expect(erro.extra.estado.etapa.id).toBe("r1");
  });

  it("concluir antes do fim: CASO_INCOMPLETO; no fim, nada é gravado e o caso recomeça", async () => {
    const api = criarApiPrevia({ item: montar() });
    const antes = await api.chamarPortal("caso_concluir", { aula_id: "cs" }).catch((e) => e);
    expect(antes.codigo).toBe("CASO_INCOMPLETO");
    const inicio = await api.chamarPortal("caso_abrir", { aula_id: "cs" });
    const meio = await api.chamarPortal("caso_escolher", {
      aula_id: "cs",
      etapa_id: "e1",
      opcao: indice(inicio.etapa, "Testar a ausência de tensão"),
    });
    await api.chamarPortal("caso_escolher", {
      aula_id: "cs",
      etapa_id: "e2",
      opcao: indice(meio.etapa, "Liberar com tudo conferido"),
    });
    const encerrado = await api
      .chamarPortal("caso_escolher", { aula_id: "cs", etapa_id: "e2", opcao: 0 })
      .catch((e) => e);
    expect(encerrado.codigo).toBe("CASO_ENCERRADO");
    expect(await api.chamarPortal("caso_concluir", { aula_id: "cs" })).toMatchObject({
      aula_concluida: false,
      curso_concluido: false,
    });
    const deNovo = await api.chamarPortal("caso_abrir", { aula_id: "cs" });
    expect(deNovo).toMatchObject({ situacao: "etapa", passagem: 1 });
    expect(deNovo.etapa.id).toBe("e1");
  });

  it("caso sem roteiro (ou com o roteiro apagado): CASO_INVALIDO, como o servidor", async () => {
    const api = criarApiPrevia({ item: montar() });
    const erro = await api.chamarPortal("caso_abrir", { aula_id: "cv" }).catch((e) => e);
    expect(erro.codigo).toBe("CASO_INVALIDO");
    expect(erro.message).toBe("Este caso está com problema — avise o RH");
  });
});
```

Em `apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx`, trecho atual (`:29-34`):

```js
import { sigo } from "@/api/sigoClient";
import CursoPortal from "./CursoPortal";
import AvaliacaoPortal, { ProvaEmAndamento } from "./AvaliacaoPortal";
import DuvidasPortal from "./DuvidasPortal";
import { montarItemPrevia, criarApiPrevia } from "@/lib/portal-previa";
import { provaParaTela } from "@/lib/portal-curso";
```

novo:

```js
import { sigo } from "@/api/sigoClient";
import CursoPortal from "./CursoPortal";
import AvaliacaoPortal, { ProvaEmAndamento } from "./AvaliacaoPortal";
import DuvidasPortal from "./DuvidasPortal";
import QuestionarioPortal from "./QuestionarioPortal";
import CasoPortal from "./CasoPortal";
import { montarItemPrevia, criarApiPrevia } from "@/lib/portal-previa";
import { provaParaTela } from "@/lib/portal-curso";
```

Trecho atual (`:71-73`):

```js
// O que o servidor devolve a um aluno matriculado: aulas em ordem linear e NENHUMA questão (a prova só
// chega sorteada, sem gabarito, quando o aluno a abre: ação `iniciar_avaliacao`).
const { questoes: _questoesDaPrevia, ...itemSemQuestoes } = itemPrevia;
```

novo:

```js
// O que o servidor devolve a um aluno matriculado: aulas em ordem linear e NENHUMA questão (a prova só
// chega sorteada, sem gabarito, quando o aluno a abre: ação `iniciar_avaliacao`), nem o gabarito dos
// questionários ou o roteiro dos casos (só a prévia os tem, em `atividades_previa`).
const {
  questoes: _questoesDaPrevia,
  atividades_previa: _atividadesDaPrevia,
  ...itemSemQuestoes
} = itemPrevia;
```

No fim do arquivo acrescente:

```jsx

describe("prévia com as atividades dos módulos", () => {
  const aulasAtividades = [
    {
      id: "t1",
      ordem: 1,
      modulo: "M1 · Teste",
      tipo: "tarefa",
      titulo: "M1 · Atividade de estudo 1: Mapa",
      conteudo_texto: "Instruções sintéticas",
      duracao_seg: 2100,
    },
    {
      id: "qz",
      ordem: 2,
      modulo: "M1 · Teste",
      tipo: "questionario",
      titulo: "M1 · Questionário do módulo",
      duracao_seg: 900,
    },
    {
      id: "cs",
      ordem: 3,
      modulo: "M1 · Teste",
      tipo: "caso",
      titulo: "M1 · Caso 1: O quadro",
      duracao_seg: 600,
    },
  ];
  const doModulo = {
    id: "qm",
    aula_id: "qz",
    ordem: 1,
    pergunta: "Questão do módulo?",
    opcoes: ["x", "y"],
    correta: 0,
    comentario: "Comentário do módulo",
  };
  const roteiro = {
    contexto: "Contexto sintético do caso",
    etapas: [
      {
        id: "e1",
        pergunta: "Decide?",
        opcoes: [
          { texto: "Sim", comentario: "Bom.", segura: true, proxima: null },
          { texto: "Não", comentario: "Ruim.", segura: false, proxima: "e1" },
        ],
      },
    ],
    reflexao: "Reflexão sintética",
  };
  const item = montarItemPrevia({
    curso,
    aulas: aulasAtividades,
    questoes: [...questoes, doModulo],
    casos: [{ aula_id: "cs", conteudo: roteiro }],
    urls: {},
  });
  const api = criarApiPrevia({ item });
  const rotulo = (texto) => `<span class="block text-[11px] text-slate-400">${texto}</span>`;

  it("a lista mostra o rótulo de cada atividade e a prova conta só as questões dela", () => {
    const html = renderToStaticMarkup(
      <CursoPortal
        item={item}
        api={api}
        recarregar={async () => null}
        dadosCarregadosEm={() => Date.now()}
        onVoltar={semOperacao}
        onErroSessao={semOperacao}
      />
    );
    expect(html).toContain(rotulo("atividade de estudo"));
    expect(html).toContain(rotulo("questionário"));
    expect(html).toContain(rotulo("estudo de caso"));
    expect(html).toContain("Avaliação final · 2 questões");
    expect(html).not.toContain("Questão do módulo?");
  });

  it("o questionário e o caso abrem pela API da prévia: nada aparece antes da resposta dela", () => {
    const q = renderToStaticMarkup(
      <QuestionarioPortal
        api={api}
        item={item}
        aula={item.aulas[1]}
        fila={fila}
        tratarErro={semOperacao}
        onConcluida={semOperacao}
      />
    );
    expect(q).toContain("Preparando o questionário");
    expect(q).not.toContain("Questão do módulo?");
    const c = renderToStaticMarkup(
      <CasoPortal
        api={api}
        item={item}
        aula={item.aulas[2]}
        fila={fila}
        tratarErro={semOperacao}
        onConcluida={semOperacao}
      />
    );
    expect(c).toContain("Abrindo o caso");
    expect(c).not.toContain("Contexto sintético do caso");
  });

  it("PreviaAlunoCurso recebe os casos (padrão: nenhum) e os leva à montagem da prévia", () => {
    const fonte = readFileSync(
      fileURLToPath(new URL("../seguranca/PreviaAlunoCurso.jsx", import.meta.url)),
      "utf8"
    );
    expect(fonte).toMatch(
      /PreviaAlunoCurso\(\{ curso, aulas, questoes, casos = \[\], onFechar \}\)/
    );
    expect(fonte).toContain("useRef({ curso, aulas, questoes, casos })");
  });

  it("nada disso chamou o backend", () => {
    expect(sigo.functions.invoke).not.toHaveBeenCalled();
  });
});
```

Em `apps/web/src/components/portal-funcionario/sem-emoji.test.js`, trecho atual (da Task 12):

```js
  "../../lib/portal-caso.js",
];
```

novo:

```js
  "../../lib/portal-caso.js",
  "../../lib/portal-previa.js",
];
```

- [ ] **Step 2: Rodar e ver falhar**

Run:

```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas/apps/web && npx vitest run src/lib/portal-previa.test.js src/components/portal-funcionario/CursoPortal.previa.test.jsx src/components/portal-funcionario/sem-emoji.test.js
```

Expected: FAIL — em `portal-previa.test.js` os 11 casos novos (`item.questoes` ainda traz as do questionário,
`atividades_previa` é `undefined`, as ações novas caem em `codigo: "PREVIA"`); em `CursoPortal.previa.test.jsx`
"a prova conta só as questões dela" (`Avaliação final · 3 questões`) e "PreviaAlunoCurso recebe os casos".

- [ ] **Step 3: Implementar a prévia**

Em `apps/web/src/lib/portal-previa.js`, trecho atual (`:9-28`):

```js
 * - `refsDaPrevia`: quais arquivos (referências "bucket/caminho") a tela do RH precisa assinar;
 * - `montarItemPrevia`: o "item" do curso no formato da ação `dados` do portal, mas com todas as aulas
 *   liberadas e as questões COM gabarito e comentário (só o RT vê);
 * - `sortearPrevia`: o sorteio da prova, no formato da ação `iniciar_avaliacao` do servidor (a prova
 *   deixou de ser sorteada no navegador do aluno, T16; aqui o sorteio é local porque a prévia não fala
 *   com o servidor);
 * - `corrigirPrevia`: correção da prova, a mesma conta de `corrigirProva` (portal-funcionario/regras.ts);
 * - `criarApiPrevia`: a API injetada.
 *
 * As URLs assinadas chegam prontas (`urls`): a tela do RH as resolve com `resolveStorageUrl`; esta lib
 * não importa `@/api/sigoClient`. Testes em portal-previa.test.js.
 */

import { MAX_DEDICACAO_MIN, MAX_PRAZO_DIAS } from "./ead-projeto";

/** Id da matrícula de mentira da prévia: não existe no banco. */
export const ID_MATRICULA_PREVIA = "previa";

/** Mesmos padrões do servidor (portal-funcionario/index.ts e regras.ts). */
const NOTA_MINIMA_PADRAO = 70;
```

novo:

```js
 * - `refsDaPrevia`: quais arquivos (referências "bucket/caminho") a tela do RH precisa assinar;
 * - `montarItemPrevia`: o "item" do curso no formato da ação `dados` do portal, mas com todas as aulas
 *   liberadas e as questões da prova COM gabarito e comentário (só o RT vê); as questões dos questionários e os
 *   roteiros dos casos ficam em `atividades_previa`, que só a prévia tem;
 * - `sortearPrevia`: o sorteio da prova, no formato da ação `iniciar_avaliacao` do servidor (a prova
 *   deixou de ser sorteada no navegador do aluno, T16; aqui o sorteio é local porque a prévia não fala
 *   com o servidor);
 * - `corrigirPrevia`: correção da prova, a mesma conta de `corrigirProva` (portal-funcionario/regras.ts);
 * - `criarApiPrevia`: a API injetada (também o questionário e o caso, com as regras de lib/ead-caso.js).
 *
 * As URLs assinadas chegam prontas (`urls`): a tela do RH as resolve com `resolveStorageUrl`; esta lib
 * não importa `@/api/sigoClient`. Testes em portal-previa.test.js.
 */

import { MAX_DEDICACAO_MIN, MAX_PRAZO_DIAS } from "./ead-projeto";
import { estadoDoCaso, etapaParaAluno, resultadoDaEscolha } from "./ead-caso";

/** Id da matrícula de mentira da prévia: não existe no banco. */
export const ID_MATRICULA_PREVIA = "previa";

/** Mesmos padrões do servidor (portal-funcionario/index.ts, regras.ts e questionario.ts). */
const NOTA_MINIMA_PADRAO = 70;
const NOTA_MINIMA_MODULO_PADRAO = 80;
```

Trecho atual (`:47-50`):

```js
}

const lista = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const porOrdem = (itens) => [...itens].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
const tipoDaAula = (a) => a?.tipo || "video";
```

novo:

```js
}

/**
 * Nota mínima dos questionários dos módulos, como o servidor (`notaMinimaDoModulo`, questionario.ts): inteiro
 * de 0 a 100; ausente ou inválido vale 80. O formulário do RH pode mandar texto ("85").
 */
function notaMinimaDoModulo(valor) {
  if (valor === null || valor === undefined) return NOTA_MINIMA_MODULO_PADRAO;
  if (typeof valor === "string" && valor.trim() === "") return NOTA_MINIMA_MODULO_PADRAO;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : NOTA_MINIMA_MODULO_PADRAO;
}

/** O roteiro gravado (`treinamento_caso.conteudo`, jsonb): um objeto, ou o texto JSON de um objeto; senão null. */
function roteiroDoCaso(conteudo) {
  if (conteudo && typeof conteudo === "object" && !Array.isArray(conteudo)) return conteudo;
  if (typeof conteudo === "string") {
    try {
      const v = JSON.parse(conteudo);
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

const lista = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const porOrdem = (itens) => [...itens].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
const tipoDaAula = (a) => a?.tipo || "video";
const textoDe = (v) => (typeof v === "string" ? v : "");
```

Trecho atual (`:113-149`):

```js
/**
 * O "item" de um curso como o aluno o recebe do portal (ação `dados`), para a prévia do RT. Diferenças
 * propositais: matrícula de mentira, todas as aulas liberadas e nenhuma concluída, questões com
 * `correta` e `comentario`, sem certificado e sem dúvidas, curso sempre "publicado" (o selo de curso
 * despublicado é aviso para quem tem matrícula) e nenhuma tentativa usada. Não altera o que recebe.
 */
export function montarItemPrevia({ curso, aulas, questoes, urls } = {}) {
  const aulasPrevia = porOrdem(lista(aulas)).map((a) => {
    const tipo = tipoDaAula(a);
    return {
      id: a.id,
      ordem: a.ordem,
      modulo: a.modulo ?? null,
      tipo,
      titulo: a.titulo,
      fonte: a.fonte || "youtube",
      youtube_id: a.youtube_id ?? null,
      video_url: tipo === "video" && a.fonte === "upload" ? urlDe(urls, a.video_ref) : null,
      legenda_url: urlDe(urls, a.legenda_ref),
      arquivo_url: tipo === "pdf" ? urlDe(urls, a.arquivo_ref) : null,
      conteudo_texto: tipo === "texto" ? (a.conteudo_texto ?? null) : null,
      duracao_seg: a.duracao_seg || (tipo === "video" ? null : TEMPO_MINIMO_PADRAO),
      segundos_assistidos: 0,
      concluida: false,
      liberada: true,
    };
  });

  const questoesPrevia = porOrdem(lista(questoes)).map((q) => ({
    id: q.id,
    curso_id: q.curso_id ?? curso?.id ?? null,
    ordem: q.ordem,
    pergunta: q.pergunta,
    opcoes: opcoesDaQuestao(q.opcoes),
    correta: q.correta,
    comentario: q.comentario ?? null,
  }));
```

novo:

```js
/**
 * O "item" de um curso como o aluno o recebe do portal (ação `dados`), para a prévia do RT. Diferenças
 * propositais: matrícula de mentira, todas as aulas liberadas e nenhuma concluída, questões com
 * `correta` e `comentario`, sem certificado e sem dúvidas, curso sempre "publicado" (o selo de curso
 * despublicado é aviso para quem tem matrícula) e nenhuma tentativa usada. Não altera o que recebe.
 *
 * `questoes` são todas as do curso: as de `aula_id` vazio são a prova final (`item.questoes`); as outras são
 * dos questionários, por aula. `casos` são os roteiros (`[{ aula_id, conteudo }]`). Questões e roteiros dos
 * questionários e casos vão em `atividades_previa`, que o servidor nunca manda ao aluno: só a API da prévia
 * os usa (sorteio, correção e roteiro locais).
 */
export function montarItemPrevia({ curso, aulas, questoes, casos, urls } = {}) {
  const aulasPrevia = porOrdem(lista(aulas)).map((a) => {
    const tipo = tipoDaAula(a);
    return {
      id: a.id,
      ordem: a.ordem,
      modulo: a.modulo ?? null,
      tipo,
      titulo: a.titulo,
      fonte: a.fonte || "youtube",
      youtube_id: a.youtube_id ?? null,
      video_url: tipo === "video" && a.fonte === "upload" ? urlDe(urls, a.video_ref) : null,
      legenda_url: urlDe(urls, a.legenda_ref),
      arquivo_url: tipo === "pdf" ? urlDe(urls, a.arquivo_ref) : null,
      // texto e tarefa levam o texto da aula (a tarefa: instruções e o que produzir); questionário e caso
      // vêm das ações próprias, como no servidor
      conteudo_texto: tipo === "texto" || tipo === "tarefa" ? (a.conteudo_texto ?? null) : null,
      duracao_seg: a.duracao_seg || (tipo === "video" ? null : TEMPO_MINIMO_PADRAO),
      segundos_assistidos: 0,
      concluida: false,
      liberada: true,
    };
  });

  const paraAPrevia = (q) => ({
    id: q.id,
    curso_id: q.curso_id ?? curso?.id ?? null,
    ordem: q.ordem,
    pergunta: q.pergunta,
    opcoes: opcoesDaQuestao(q.opcoes),
    correta: q.correta,
    comentario: q.comentario ?? null,
  });
  const ativas = porOrdem(lista(questoes)).filter((q) => !q.deleted_at);
  // a prova final usa só as questões sem aula (`aula_id` vazio); as dos questionários ficam por aula
  const questoesPrevia = ativas.filter((q) => !q.aula_id).map(paraAPrevia);
  const questionarios = {};
  for (const q of ativas.filter((x) => x.aula_id)) {
    if (!questionarios[q.aula_id]) questionarios[q.aula_id] = [];
    questionarios[q.aula_id].push(paraAPrevia(q));
  }
  const roteiros = {};
  for (const c of lista(casos)) {
    const conteudo = roteiroDoCaso(c.conteudo);
    if (c.aula_id && !c.deleted_at && conteudo) roteiros[c.aula_id] = conteudo;
  }
```

Trecho atual (`:176-177`):

```js
    aulas: aulasPrevia,
    questoes: questoesPrevia,
```

novo:

```js
    aulas: aulasPrevia,
    questoes: questoesPrevia,
    // só da prévia (o servidor nunca manda isto ao aluno): gabarito dos questionários e roteiros dos casos
    atividades_previa: {
      nota_minima_modulo: notaMinimaDoModulo(curso?.nota_minima_modulo),
      questionarios,
      casos: roteiros,
    },
```

Trecho atual (`:255-332`, de `const MSG_NAO_FUNCIONA_NA_PREVIA` até o fim do arquivo):

```js
const MSG_NAO_FUNCIONA_NA_PREVIA =
  "Isto não funciona na prévia: nada é enviado nem gravado. Só um aluno matriculado usa este recurso.";

function erroDaPrevia() {
  return Object.assign(new Error(MSG_NAO_FUNCIONA_NA_PREVIA), { codigo: "PREVIA", extra: {} });
}

/**
 * API injetada nos componentes do portal durante a prévia (mesmo formato de `apiPortal` em
 * components/portal-funcionario/api.js). Nunca usa a rede.
 * - `evento`: aceito e descartado (nenhuma trilha);
 * - `progresso`: devolve o tempo recebido e NUNCA conclui a aula (nada fica gravado);
 * - `iniciar_avaliacao`: sorteia a prova aqui (`sortearPrevia`), com gabarito e comentário para o RT;
 * - `avaliacao`: corrige aqui, com o gabarito do item; a correção comentada só vem na aprovação (como
 *   no servidor: o RT já vê o gabarito na própria questão), o reprovado recebe o mesmo que o aluno
 *   (`REPROVADO_VE_NOTA`) e a nova tentativa não espera intervalo;
 * - o resto (dúvida, certificado, ciência, login...) falha com `codigo: "PREVIA"`.
 */
export function criarApiPrevia({ item } = {}) {
  const questoes = lista(item?.questoes);
  const avaliacao = item?.avaliacao ?? {};

  async function chamarPortal(acao, dados = {}) {
    switch (acao) {
```

novo:

```js
const MSG_NAO_FUNCIONA_NA_PREVIA =
  "Isto não funciona na prévia: nada é enviado nem gravado. Só um aluno matriculado usa este recurso.";

function erroDaPrevia() {
  return Object.assign(new Error(MSG_NAO_FUNCIONA_NA_PREVIA), { codigo: "PREVIA", extra: {} });
}

/** Recusa no formato do portal de verdade (ErroPortal, components/portal-funcionario/api.js): `extra` é o corpo. */
function erroDoPortal(mensagem, codigo = null, extra = {}) {
  return Object.assign(new Error(mensagem), {
    codigo,
    extra: { success: false, error: mensagem, codigo, ...extra },
  });
}

const MSG_CASO_INVALIDO = "Este caso está com problema — avise o RH";
const MSG_DO_CASO = {
  CASO_INVALIDO: MSG_CASO_INVALIDO,
  CASO_ENCERRADO: "Este caso já chegou ao fim",
  CASO_FORA_DE_ORDEM: "Esta etapa não é mais a atual do caso",
  OPCAO_INVALIDA: "Opção inválida",
};

/**
 * API injetada nos componentes do portal durante a prévia (mesmo formato de `apiPortal` em
 * components/portal-funcionario/api.js). Nunca usa a rede.
 * - `evento`: aceito e descartado (nenhuma trilha);
 * - `progresso`: devolve o tempo recebido e NUNCA conclui a aula (nada fica gravado);
 * - `iniciar_avaliacao`: sorteia a prova aqui (`sortearPrevia`), com gabarito e comentário para o RT;
 * - `avaliacao`: corrige aqui, com o gabarito do item; a correção comentada só vem na aprovação (como
 *   no servidor: o RT já vê o gabarito na própria questão), o reprovado recebe o mesmo que o aluno
 *   (`REPROVADO_VE_NOTA`) e a nova tentativa não espera intervalo;
 * - `questionario_abrir`/`questionario_enviar`: sorteio e correção aqui, com a nota mínima do módulo e a
 *   correção comentada nos dois resultados (A2); tentativas livres, contadas só na memória da prévia; a aula
 *   nunca conclui (`aula_concluida: false`);
 * - `caso_abrir`/`caso_escolher`/`caso_concluir`: o roteiro anda aqui, com as regras do servidor
 *   (`estadoDoCaso`, `etapaParaAluno`, `resultadoDaEscolha`, lib/ead-caso.js) e as escolhas só na memória;
 *   concluir não conclui a aula e recomeça o caso, para o RT andar por ele de novo;
 * - o resto (dúvida, certificado, ciência, login...) falha com `codigo: "PREVIA"`.
 * `aleatorio(n)` (inteiro em [0, n)) existe para o teste; o padrão é o sorteio do navegador.
 */
export function criarApiPrevia({ item, aleatorio = sorteioDoNavegador } = {}) {
  const questoes = lista(item?.questoes);
  const avaliacao = item?.avaliacao ?? {};
  const atividades = item?.atividades_previa ?? {};
  const notaDoModulo = notaMinimaDoModulo(atividades.nota_minima_modulo);
  const tipoDaAulaPrevia = (aulaId) =>
    lista(item?.aulas).find((a) => a.id === aulaId)?.tipo ?? null;
  // só na memória desta prévia (nada é gravado): tentativas enviadas por questionário e escolhas por caso
  const enviadas = new Map();
  const escolhasDoCaso = new Map();

  const questoesDoQuestionario = (aulaId) => {
    if (tipoDaAulaPrevia(aulaId) !== "questionario") {
      throw erroDoPortal("Esta aula não é um questionário");
    }
    const daAula = lista(atividades.questionarios?.[aulaId]);
    if (!daAula.length) {
      throw erroDoPortal(
        "Este questionário ainda não tem questões — avise o RH",
        "QUESTIONARIO_VAZIO"
      );
    }
    return daAula;
  };

  // o estado do caso é refeito a cada ação a partir das escolhas, como o servidor faz com a trilha
  const casoAtual = (aulaId) => {
    if (tipoDaAulaPrevia(aulaId) !== "caso") throw erroDoPortal("Esta aula não é um caso");
    const conteudo = atividades.casos?.[aulaId] ?? null;
    const escolhas = escolhasDoCaso.get(aulaId) ?? [];
    const estado = conteudo ? estadoDoCaso(conteudo, escolhas) : { valido: false };
    if (!estado.valido) throw erroDoPortal(MSG_CASO_INVALIDO, "CASO_INVALIDO");
    return { conteudo, escolhas, estado };
  };

  // a tela do caso como a ação `caso_abrir` do servidor a devolve (e o `estado` do CASO_FORA_DE_ORDEM)
  const telaDoCaso = (conteudo, estado) =>
    estado.fim
      ? {
          situacao: "fim",
          contexto: textoDe(conteudo.contexto),
          reflexao: textoDe(conteudo.reflexao),
          ultimo: estado.ultimo,
        }
      : {
          situacao: "etapa",
          contexto: textoDe(conteudo.contexto),
          etapa: etapaParaAluno(conteudo, estado.etapaAtual, aleatorio),
          passagem: estado.passagens[estado.etapaAtual] ?? 1,
          ultimo: estado.ultimo,
        };

  async function chamarPortal(acao, dados = {}) {
    switch (acao) {
```

E, dentro do mesmo `switch`, trecho atual (o fim do `case "avaliacao"` e o `default`):

```js
          revisao: aprovada
            ? questoes.map((q) => ({
                questao_id: q.id,
                acertou: acertou(q),
                resposta_correta: q.opcoes?.[q.correta] ?? null,
                comentario: q.comentario ?? null,
              }))
            : null,
        };
      }
      default:
        throw erroDaPrevia();
    }
  }
```

novo:

```js
          revisao: aprovada
            ? questoes.map((q) => ({
                questao_id: q.id,
                acertou: acertou(q),
                resposta_correta: q.opcoes?.[q.correta] ?? null,
                comentario: q.comentario ?? null,
              }))
            : null,
        };
      }
      case "questionario_abrir": {
        const daAula = questoesDoQuestionario(dados?.aula_id);
        return {
          success: true,
          concluida: false,
          tentativa: (enviadas.get(dados.aula_id) ?? 0) + 1,
          nota_minima: notaDoModulo,
          questoes: sortearPrevia(daAula, aleatorio),
        };
      }
      case "questionario_enviar": {
        const daAula = questoesDoQuestionario(dados?.aula_id);
        const tentativa = (enviadas.get(dados.aula_id) ?? 0) + 1;
        enviadas.set(dados.aula_id, tentativa);
        const { acertou, acertos, total, nota, minima, aprovada } = corrigirPrevia({
          questoes: daAula,
          respostas: dados?.respostas,
          notaMinima: notaDoModulo,
        });
        return {
          success: true,
          resultado: aprovada ? "satisfatorio" : "insatisfatorio",
          aprovada,
          nota,
          acertos,
          total,
          nota_minima: minima,
          tentativa,
          // a prévia nunca conclui a aula (nada é gravado), como o `progresso` dela
          aula_concluida: false,
          curso_concluido: false,
          // como o servidor (A2): a correção comentada vai aprovado ou não
          revisao: daAula.map((q) => ({
            questao_id: q.id,
            acertou: acertou(q),
            resposta_correta: q.opcoes?.[q.correta] ?? null,
            comentario: q.comentario ?? null,
          })),
        };
      }
      case "caso_abrir": {
        const { conteudo, estado } = casoAtual(dados?.aula_id);
        return { success: true, ...telaDoCaso(conteudo, estado) };
      }
      case "caso_escolher": {
        const aulaId = dados?.aula_id;
        const { conteudo, escolhas, estado } = casoAtual(aulaId);
        const r = resultadoDaEscolha(conteudo, estado, dados?.etapa_id, dados?.opcao);
        if (!r.ok) {
          throw erroDoPortal(
            MSG_DO_CASO[r.codigo] ?? MSG_CASO_INVALIDO,
            r.codigo,
            r.codigo === "CASO_FORA_DE_ORDEM" ? { estado: telaDoCaso(conteudo, estado) } : {}
          );
        }
        escolhasDoCaso.set(aulaId, [...escolhas, { etapa: dados.etapa_id, opcao: dados.opcao }]);
        return {
          success: true,
          comentario: r.comentario,
          segura: r.segura,
          passagem: r.passagem,
          fim: r.fim,
          etapa: r.fim ? null : etapaParaAluno(conteudo, r.proxima, aleatorio),
          reflexao: r.fim ? textoDe(conteudo.reflexao) : null,
        };
      }
      case "caso_concluir": {
        const aulaId = dados?.aula_id;
        const { estado } = casoAtual(aulaId);
        if (!estado.fim) {
          throw erroDoPortal("Chegue ao fim do caso para concluir", "CASO_INCOMPLETO");
        }
        // a prévia não conclui a aula: o caso recomeça do início para o RT andar por ele de novo
        escolhasDoCaso.delete(aulaId);
        return {
          success: true,
          aula_concluida: false,
          curso_concluido: false,
          precisa_avaliacao: false,
          status: "em_andamento",
        };
      }
      default:
        throw erroDaPrevia();
    }
  }
```

(O `sorteioDoNavegador`, `:196`, já está declarado antes de `criarApiPrevia`; o padrão do parâmetro o usa.)

- [ ] **Step 4: Aceitar os casos no `PreviaAlunoCurso.jsx`**

Em `apps/web/src/components/seguranca/PreviaAlunoCurso.jsx`, trecho atual (`:20-25`):

```jsx
 * Monte só enquanto a prévia estiver aberta: cada abertura refaz os dados a partir do que a tela do
 * curso mostra agora (o que `curso`, `aulas` e `questoes` tinham ao abrir).
 */
export default function PreviaAlunoCurso({ curso, aulas, questoes, onFechar }) {
  // fotografia do que o editor mostrava ao abrir: o editor recarrega por baixo e não deve mexer na prévia
  const origemRef = useRef({ curso, aulas, questoes });
```

novo:

```jsx
 * Monte só enquanto a prévia estiver aberta: cada abertura refaz os dados a partir do que a tela do
 * curso mostra agora (o que `curso`, `aulas`, `questoes` e `casos` tinham ao abrir). `questoes` são todas
 * as do curso (prova final e questionários, separadas pelo `aula_id`); `casos` são os roteiros dos casos
 * (`[{ aula_id, conteudo }]`), que a aba Treinamentos EAD passa.
 */
export default function PreviaAlunoCurso({ curso, aulas, questoes, casos = [], onFechar }) {
  // fotografia do que o editor mostrava ao abrir: o editor recarrega por baixo e não deve mexer na prévia
  const origemRef = useRef({ curso, aulas, questoes, casos });
```

(O `montar` já passa `...origem` a `montarItemPrevia`; nada mais muda.)

- [ ] **Step 5: Rodar e ver passar**

Run:

```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas/apps/web && npx vitest run src/lib/portal-previa.test.js src/components/portal-funcionario/CursoPortal.previa.test.jsx src/components/portal-funcionario/sem-emoji.test.js
```

Expected: PASS — `portal-previa.test.js` 52 testes (eram 41); `CursoPortal.previa.test.jsx` 24 (eram 20);
`sem-emoji.test.js` 2.

- [ ] **Step 6: Formato, lint, build e a suíte do front**

Run:

<!-- prettier-ignore -->
```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas && npx prettier --write apps/web/src/lib/portal-previa.js apps/web/src/lib/portal-previa.test.js apps/web/src/components/seguranca/PreviaAlunoCurso.jsx apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx apps/web/src/components/portal-funcionario/sem-emoji.test.js && npx prettier --check apps/web/src/lib/portal-previa.js apps/web/src/lib/portal-previa.test.js apps/web/src/components/seguranca/PreviaAlunoCurso.jsx apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx apps/web/src/components/portal-funcionario/sem-emoji.test.js && (cd apps/web && npx eslint --rule "no-undef: error" src/components/seguranca/PreviaAlunoCurso.jsx) && npm run lint && npm run build && npm test --workspace=apps/web
```

Expected: Prettier sem diferenças; ESLint sem erro; build ok; Vitest: o total da Task 12 + 15 testes (11 + 4), mesmo
número de arquivos, 0 falhas.

- [ ] **Step 7: Commit**

<!-- prettier-ignore -->
```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas && git status --short && git add apps/web/src/lib/portal-previa.js apps/web/src/lib/portal-previa.test.js apps/web/src/components/seguranca/PreviaAlunoCurso.jsx apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx apps/web/src/components/portal-funcionario/sem-emoji.test.js && git diff --staged --stat && git commit -F - -- apps/web/src/lib/portal-previa.js apps/web/src/lib/portal-previa.test.js apps/web/src/components/seguranca/PreviaAlunoCurso.jsx apps/web/src/components/portal-funcionario/CursoPortal.previa.test.jsx apps/web/src/components/portal-funcionario/sem-emoji.test.js <<'EOF'
feat(ead): "Ver como aluno" responde ao questionário e ao caso sem gravar nada

Spec de 14/10, §5.4: a prévia do RT passa a abrir as atividades dos módulos. O questionário é sorteado e
corrigido no navegador, com gabarito, a nota mínima do módulo e a correção comentada nos dois resultados; o
caso anda pelo roteiro com estadoDoCaso, etapaParaAluno e resultadoDaEscolha (as regras do servidor), com as
escolhas só na memória. A prova final da prévia usa só as questões de aula_id vazio. PreviaAlunoCurso aceita
os roteiros em `casos` (padrão: nenhum); quem os passa é a aba Treinamentos EAD (Task 16).

Produção: nada (só a prévia, que nunca fala com o servidor).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

---

### Task 14: Certificado — frase das atividades dos módulos na frente

**Depende de:** nada no front. Os certificados com `dados.atividades` passam a existir com a Task 7 (servidor).

**Files:**

- Modify: `apps/web/src/lib/certificado-ead.js` (funções novas depois de `textoDoLocalResumido`, `:93`; corpo da frente
  `:334-353`)
- Modify: `apps/web/src/lib/certificado-ead.test.js` (`:2` e `:13-16`; describes novos no fim)

**Interfaces:**

- Consumes: C4/C5 `dados.atividades = { questionarios, casos, tarefas, nota_minima_modulo }` (só quando a soma é maior
  que zero; congelado no certificado).
- Produces:
  - C6 `textoDasAtividades(atividades): string` — `""` sem atividades; senão
    `"e conclusão das atividades dos módulos: 12 questionários (nota mínima de 80%), 36 estudos de caso e 55 atividades
    de estudo"` (singular/plural; itens com zero omitidos; nota mínima inválida = sem o parêntese);
  - `listaDasAtividades(atividades): string` (a lista sem o "e conclusão ...");
  - `trechoDasAtividades(d): string` — o que entra no corpo: `" " + textoDasAtividades(...)` depois do aproveitamento;
    sem prova (sem `d.avaliacao.nota`), `", com conclusão das atividades dos módulos: ..."` logo depois do período;
    `""` sem atividades.

Regra de leiaute: com a frase, o corpo cresce; a fonte do corpo diminui (12,5 → 11,5 → 10,5 → 9,5) até a última linha
ficar 5,5 mm acima da primeira linha de detalhe (98 mm com o motivo do eventual, 104 mm sem). **Sem atividades nada
muda** (só 12,5 pt, como hoje): os certificados já emitidos saem iguais. O verso não muda.

- [ ] **Step 1: Escrever os testes**

Em `apps/web/src/lib/certificado-ead.test.js`, trecho atual (`:2`):

```js
import { baixarCertificadoPdf, distribuirConteudo, textoDoLocalResumido } from "./certificado-ead";
```

novo:

```js
import {
  baixarCertificadoPdf,
  distribuirConteudo,
  listaDasAtividades,
  textoDasAtividades,
  textoDoLocalResumido,
  trechoDasAtividades,
} from "./certificado-ead";
```

Trecho atual (`:13-16`):

```js
    doc.text = (texto, x, y, ...resto) => {
      registro.textos.push({ texto, x, y, pagina: doc.internal.getCurrentPageInfo().pageNumber });
      return desenhar(texto, x, y, ...resto);
    };
```

novo:

```js
    doc.text = (texto, x, y, ...resto) => {
      registro.textos.push({
        texto,
        x,
        y,
        pagina: doc.internal.getCurrentPageInfo().pageNumber,
        tamanho: doc.getFontSize(),
      });
      return desenhar(texto, x, y, ...resto);
    };
```

No fim do arquivo acrescente:

```js

describe("textoDasAtividades (A9: a frase das atividades dos módulos na frente)", () => {
  it("a frase da spec, com plural e a nota mínima dos módulos", () => {
    expect(
      textoDasAtividades({ questionarios: 12, casos: 36, tarefas: 55, nota_minima_modulo: 80 })
    ).toBe(
      "e conclusão das atividades dos módulos: 12 questionários (nota mínima de 80%), 36 estudos de caso e 55 atividades de estudo"
    );
  });

  it("singular", () => {
    expect(
      textoDasAtividades({ questionarios: 1, casos: 1, tarefas: 1, nota_minima_modulo: 70 })
    ).toBe(
      "e conclusão das atividades dos módulos: 1 questionário (nota mínima de 70%), 1 estudo de caso e 1 atividade de estudo"
    );
  });

  it("itens com zero ficam de fora e a lista se ajusta", () => {
    expect(
      textoDasAtividades({ questionarios: 0, casos: 3, tarefas: 5, nota_minima_modulo: 80 })
    ).toBe("e conclusão das atividades dos módulos: 3 estudos de caso e 5 atividades de estudo");
    expect(
      textoDasAtividades({ questionarios: 2, casos: 0, tarefas: 0, nota_minima_modulo: 80 })
    ).toBe("e conclusão das atividades dos módulos: 2 questionários (nota mínima de 80%)");
    expect(listaDasAtividades({ tarefas: 4 })).toBe("4 atividades de estudo");
  });

  it("sem atividades: texto vazio (o certificado sai como hoje)", () => {
    for (const v of [
      undefined,
      null,
      {},
      "x",
      { questionarios: 0, casos: 0, tarefas: 0, nota_minima_modulo: 80 },
    ]) {
      expect(textoDasAtividades(v)).toBe("");
    }
  });

  it("nota mínima ausente ou fora de 0 a 100: o questionário sai sem o parêntese", () => {
    for (const nota of [undefined, null, "abc", 150, -5]) {
      expect(textoDasAtividades({ questionarios: 2, nota_minima_modulo: nota })).toBe(
        "e conclusão das atividades dos módulos: 2 questionários"
      );
    }
    expect(textoDasAtividades({ questionarios: "3", nota_minima_modulo: "80" })).toBe(
      "e conclusão das atividades dos módulos: 3 questionários (nota mínima de 80%)"
    );
  });

  it("trechoDasAtividades: depois do aproveitamento ou, sem prova, com 'com'", () => {
    const atividades = { questionarios: 0, casos: 2, tarefas: 0, nota_minima_modulo: 80 };
    expect(trechoDasAtividades({ atividades, avaliacao: { nota: 90 } })).toBe(
      " e conclusão das atividades dos módulos: 2 estudos de caso"
    );
    expect(trechoDasAtividades({ atividades })).toBe(
      ", com conclusão das atividades dos módulos: 2 estudos de caso"
    );
    expect(trechoDasAtividades({ avaliacao: { nota: 90 } })).toBe("");
    expect(trechoDasAtividades(null)).toBe("");
  });
});

describe("baixarCertificadoPdf: atividades dos módulos (A9)", () => {
  const ATIVIDADES = { questionarios: 12, casos: 36, tarefas: 55, nota_minima_modulo: 80 };
  const comAtividades = (dadosExtra = {}) =>
    certificado({ dados: { ...certificado().dados, atividades: ATIVIDADES, ...dadosExtra } });
  const corpoDesenhado = () =>
    registro.textos.find((c) => /Certificamos que/.test([c.texto].flat().join(" ")));
  const gerar = (cert) =>
    baixarCertificadoPdf(cert, { gerarQr: async () => PNG_1X1, salvar: () => {} });

  it("a frase entra logo depois do aproveitamento, antes de 'promovido por'", async () => {
    registro.textos.length = 0;
    await gerar(comAtividades());
    expect([corpoDesenhado().texto].flat().join(" ")).toContain(
      "com aproveitamento de 100% na avaliação e conclusão das atividades dos módulos: 12 questionários (nota mínima de 80%), 36 estudos de caso e 55 atividades de estudo, promovido por"
    );
  });

  it("sem prova, a frase entra com 'com', logo depois do período", async () => {
    registro.textos.length = 0;
    await gerar(comAtividades({ avaliacao: undefined }));
    expect([corpoDesenhado().texto].flat().join(" ")).toContain(
      "a 10/01/2026, com conclusão das atividades dos módulos: 12 questionários"
    );
  });

  it("certificado sem atividades sai como sempre saiu: sem a frase e na fonte 12,5", async () => {
    registro.textos.length = 0;
    await gerar(certificado());
    const corpo = corpoDesenhado();
    expect([corpo.texto].flat().join(" ")).not.toContain("atividades dos módulos");
    expect(corpo.tamanho).toBe(12.5);
  });

  it("nome, curso e empresa longos, com a frase e o motivo do eventual: o texto termina acima das linhas de detalhe", async () => {
    registro.textos.length = 0;
    await gerar(
      comAtividades({
        aluno: {
          nome: "Nome Sintético Bem Comprido de Teste da Silva Pereira Santos Oliveira",
          cpf: "00000000000",
        },
        curso: {
          ...certificado().dados.curso,
          nome: "Curso Sintético de Segurança em Instalações e Serviços em Eletricidade com Nome Bem Comprido — Básico",
        },
        empresa: {
          nome: "Empresa Sintética de Engenharia, Construções, Montagens e Serviços Elétricos de Teste Ltda",
          cnpj: "00000000000000",
        },
        tipo_treinamento: "eventual",
        motivo_eventual: "palavra ".repeat(40).trim().slice(0, 200),
      })
    );
    const corpo = corpoDesenhado();
    const linhas = [corpo.texto].flat().length;
    // altura da linha do jsPDF: fonte (pt) × 1,6 (lineHeightFactor) × 0,3528 mm por pt
    const ultimaLinha = corpo.y + (linhas - 1) * corpo.tamanho * 1.6 * 0.3528;
    const tipo = registro.textos.find((c) => /Tipo de treinamento/.test([c.texto].flat().join(" ")));
    expect(tipo).toBeTruthy();
    expect(ultimaLinha).toBeLessThanOrEqual(tipo.y - 5.5);
    expect(corpo.tamanho).toBeLessThan(12.5); // coube porque a fonte diminuiu
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run:

```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas/apps/web && npx vitest run src/lib/certificado-ead.test.js
```

Expected: FAIL — os 6 casos de `textoDasAtividades` (`textoDasAtividades is not a function`) e 3 dos 4 de
`baixarCertificadoPdf: atividades dos módulos` (a frase não está no corpo; o caso longo passa da linha de detalhe em
12,5 pt). "certificado sem atividades" já passa.

- [ ] **Step 3: Implementar**

Em `apps/web/src/lib/certificado-ead.js`, trecho atual (`:93-95`):

```js
}

const fmtHoras = (h) => `${String(Math.round((Number(h) || 0) * 100) / 100).replace(".", ",")} h`;
```

novo:

```js
}

// ------------------------------------------------------------- a frente: atividades dos módulos (A9)

const quantidade = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};
const comPlural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * A lista das atividades dos módulos (A9, spec §9), a partir de `dados.atividades` congelado na emissão:
 * "12 questionários (nota mínima de 80%), 36 estudos de caso e 55 atividades de estudo". Singular e plural;
 * item com zero fica de fora; nota mínima fora de 0 a 100 sai sem o parêntese. "" sem atividades.
 */
export function listaDasAtividades(atividades) {
  if (!atividades || typeof atividades !== "object") return "";
  const itens = [];
  const questionarios = quantidade(atividades.questionarios);
  if (questionarios) {
    const nota =
      atividades.nota_minima_modulo === null || atividades.nota_minima_modulo === undefined
        ? NaN
        : Number(atividades.nota_minima_modulo);
    const comNota = Number.isFinite(nota) && nota >= 0 && nota <= 100;
    itens.push(
      comPlural(questionarios, "questionário", "questionários") +
        (comNota ? ` (nota mínima de ${nota}%)` : "")
    );
  }
  const casos = quantidade(atividades.casos);
  if (casos) itens.push(comPlural(casos, "estudo de caso", "estudos de caso"));
  const tarefas = quantidade(atividades.tarefas);
  if (tarefas) itens.push(comPlural(tarefas, "atividade de estudo", "atividades de estudo"));
  if (!itens.length) return "";
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** "e conclusão das atividades dos módulos: …" (contrato C6); "" quando o certificado não tem atividades. */
export function textoDasAtividades(atividades) {
  const lista = listaDasAtividades(atividades);
  return lista ? `e conclusão das atividades dos módulos: ${lista}` : "";
}

/**
 * O trecho das atividades no texto da frente: logo depois do aproveitamento ("..., com aproveitamento de 90%
 * na avaliação e conclusão das atividades...") ou, no curso sem prova, logo depois do período (", com
 * conclusão das atividades..."). "" sem atividades: o texto sai exatamente como antes.
 */
export function trechoDasAtividades(d) {
  const lista = listaDasAtividades(d?.atividades);
  if (!lista) return "";
  return d?.avaliacao?.nota != null
    ? ` ${textoDasAtividades(d.atividades)}`
    : `, com conclusão das atividades dos módulos: ${lista}`;
}

/** Fontes do texto da frente, da inteira à menor; só o certificado com atividades reduz. */
const TAMANHOS_DO_CORPO = [12.5, 11.5, 10.5, 9.5];
/** Distância mínima (mm) da última linha do texto da frente até a primeira linha de detalhe. */
const FOLGA_DO_CORPO = 5.5;

/**
 * As linhas do texto da frente na maior fonte da lista em que a última linha fica até `limite` (mm); sem
 * nenhuma que caiba, a menor. Deixa a fonte escolhida ligada no `doc`.
 */
function linhasDoCorpoQueCabem(doc, corpo, { tamanhos, largura, yInicio, limite }) {
  let linhas = [];
  for (const tamanho of tamanhos) {
    doc.setFontSize(tamanho);
    linhas = doc.splitTextToSize(corpo, largura);
    // altura da linha do jsPDF: fonte (pt) × 1,6 (lineHeightFactor) × 0,3528 mm por pt
    if (yInicio + (linhas.length - 1) * tamanho * 1.6 * 0.3528 <= limite) break;
  }
  return linhas;
}

const fmtHoras = (h) => `${String(Math.round((Number(h) || 0) * 100) / 100).replace(".", ",")} h`;
```

Trecho atual (`:334-353`):

```js
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12.5);
  const corpo =
    `Certificamos que ${d.aluno?.nome || "—"}, CPF ${fmtCpf(d.aluno?.cpf)}, concluiu o treinamento ` +
    `"${d.curso?.nome || "—"}"${d.curso?.codigo ? ` (${d.curso.codigo})` : ""}, na modalidade ` +
    `${d.curso?.modalidade || "EAD"}, com carga horária de ${d.curso?.carga_horaria_horas || "—"} horas, ` +
    `no período de ${fmtData(d.periodo?.inicio)} a ${fmtData(d.periodo?.conclusao)}` +
    (d.avaliacao?.nota != null ? `, com aproveitamento de ${d.avaliacao.nota}% na avaliação` : "") +
    `, promovido por ${d.empresa?.nome || "—"}${d.empresa?.cnpj ? `, CNPJ ${fmtCnpj(d.empresa.cnpj)}` : ""}.`;
  doc.text(doc.splitTextToSize(corpo, W - 60), W / 2, 64, {
    align: "center",
    lineHeightFactor: 1.6,
  });
  // linhas de rodapé do texto: tipo do treinamento (NR-1, 1.7.1.2; T23), validade e local de realização
  // (NR-1, 1.7.1.1). O certificado emitido antes da T8 não tem local e o de antes da T23 não tem tipo: saem sem a
  // linha. Tipo e validade dividem a primeira linha (o certificado não ganha altura); o motivo do eventual
  // (até 200 caracteres) vem numa linha própria, que pode quebrar em duas, e por isso o bloco sobe um pouco: as
  // imagens das assinaturas começam em y = 122,5 e nada do bloco pode chegar lá.
  const [linhaDoTipo, linhaDoMotivo] = linhasDoTipoNoCertificado(d);
  let yDetalhe = linhaDoMotivo ? 98 : 104;
```

novo:

```js
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12.5);
  // atividades dos módulos (A9, spec §9): a frase vem logo depois do aproveitamento; sem atividades, "" e o
  // texto sai exatamente como antes
  const atividades = trechoDasAtividades(d);
  const corpo =
    `Certificamos que ${d.aluno?.nome || "—"}, CPF ${fmtCpf(d.aluno?.cpf)}, concluiu o treinamento ` +
    `"${d.curso?.nome || "—"}"${d.curso?.codigo ? ` (${d.curso.codigo})` : ""}, na modalidade ` +
    `${d.curso?.modalidade || "EAD"}, com carga horária de ${d.curso?.carga_horaria_horas || "—"} horas, ` +
    `no período de ${fmtData(d.periodo?.inicio)} a ${fmtData(d.periodo?.conclusao)}` +
    (d.avaliacao?.nota != null ? `, com aproveitamento de ${d.avaliacao.nota}% na avaliação` : "") +
    atividades +
    `, promovido por ${d.empresa?.nome || "—"}${d.empresa?.cnpj ? `, CNPJ ${fmtCnpj(d.empresa.cnpj)}` : ""}.`;
  // linhas de rodapé do texto: tipo do treinamento (NR-1, 1.7.1.2; T23), validade e local de realização
  // (NR-1, 1.7.1.1). O certificado emitido antes da T8 não tem local e o de antes da T23 não tem tipo: saem sem a
  // linha. Tipo e validade dividem a primeira linha (o certificado não ganha altura); o motivo do eventual
  // (até 200 caracteres) vem numa linha própria, que pode quebrar em duas, e por isso o bloco sobe um pouco: as
  // imagens das assinaturas começam em y = 122,5 e nada do bloco pode chegar lá.
  const [linhaDoTipo, linhaDoMotivo] = linhasDoTipoNoCertificado(d);
  let yDetalhe = linhaDoMotivo ? 98 : 104;
  // com a frase das atividades o texto cresce: a fonte diminui até a última linha ficar acima das linhas de
  // detalhe. O certificado sem atividades sai como sempre saiu (12,5 pt).
  const linhasDoCorpo = linhasDoCorpoQueCabem(doc, corpo, {
    tamanhos: atividades ? TAMANHOS_DO_CORPO : [12.5],
    largura: W - 60,
    yInicio: 64,
    limite: yDetalhe - FOLGA_DO_CORPO,
  });
  doc.text(linhasDoCorpo, W / 2, 64, { align: "center", lineHeightFactor: 1.6 });
```

- [ ] **Step 4: Rodar e ver passar**

Run:

```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas/apps/web && npx vitest run src/lib/certificado-ead.test.js src/components/portal-funcionario/sem-emoji.test.js
```

Expected: PASS — `certificado-ead.test.js` 56 testes (eram 46); `sem-emoji.test.js` 2 (o arquivo já estava na lista).

- [ ] **Step 5: Formato, lint, build e a suíte do front**

Run:

<!-- prettier-ignore -->
```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas && npx prettier --write apps/web/src/lib/certificado-ead.js apps/web/src/lib/certificado-ead.test.js && npx prettier --check apps/web/src/lib/certificado-ead.js apps/web/src/lib/certificado-ead.test.js && npm run lint && npm run build && npm test --workspace=apps/web
```

Expected: Prettier sem diferenças; `npm run lint` sem erro (a task não toca `src/components`); build ok; Vitest: o
total da Task 13 + 10 testes, mesmo número de arquivos, 0 falhas.

- [ ] **Step 6: Commit**

<!-- prettier-ignore -->
```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas && git status --short && git add apps/web/src/lib/certificado-ead.js apps/web/src/lib/certificado-ead.test.js && git diff --staged --stat && git commit -F - -- apps/web/src/lib/certificado-ead.js apps/web/src/lib/certificado-ead.test.js <<'EOF'
feat(ead): certificado cita as atividades dos módulos na frente

A9 da spec de 14/10: nos cursos com atividades, a frente do certificado diz, logo depois do aproveitamento,
"e conclusão das atividades dos módulos: 12 questionários (nota mínima de 80%), 36 estudos de caso e 55
atividades de estudo", com singular/plural e itens zerados omitidos (a partir de dados.atividades, congelado na
emissão). Com a frase o texto cresce, e a fonte do texto diminui até caber acima das linhas de detalhe.
Certificado sem atividades sai exatamente como antes; o verso não muda.

Produção: nada sozinho; os certificados com dados.atividades começam com o portal-funcionario da Task 7.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 16: Tela do RH — tipos novos na "Nova aula", texto editável, nota dos questionários, questões por questionário e casos nos requisitos

**Files:**

- Create: `apps/web/src/lib/ead-aula-nova.js`, `apps/web/src/lib/ead-aula-nova.test.js`
- Create: `apps/web/src/components/seguranca/QuestoesEad.jsx`, `apps/web/src/components/seguranca/QuestoesEad.test.jsx`
- Create: `apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js`
- Modify: `apps/web/src/lib/ead-impacto.js` (`mudouNotaMinimaDoModulo` depois de :67; `avisoDeMudanca` :95-157) e
  `apps/web/src/lib/ead-impacto.test.js` (import :2-9, teste da duração :162-169, `describe` novos no fim)
- Modify: `apps/web/src/lib/ead-curso-numeros.js` (`REGRAS` :23-50, função nova no fim) e
  `apps/web/src/lib/ead-curso-numeros.test.js` (import :3, `describe` novo no fim)
- Modify: `apps/web/src/lib/ead-projeto.js` (`questoesVivas` :293, item "m" :394-411) e
  `apps/web/src/lib/ead-projeto.test.js` (teste novo depois de :287)
- Modify: `apps/web/src/components/seguranca/AulaLinhaEad.jsx` (arquivo inteiro, 207 linhas)
- Modify: `apps/web/src/components/seguranca/TreinamentosEadTab.jsx` (imports :19-57, :102, :121-134; estado
  :277-281; `recarregar` :341-359; efeitos :369-394; requisitos :542-583; `salvarCurso` :690-737; `adicionarAula`
  :769-886; `abrirEdicaoAula`/`salvarAulaEdicao` :1136-1205; questões :1326-1378; formulário do curso :2036-2047;
  lista de aulas :2289-2389; "Nova aula" :2390-2498; nota de rodapé :2561-2565; avaliação final :2591-2761;
  `PreviaAlunoCurso` :2765-2772; diálogo novo antes de `{dialogoConfirmar}` :2797)

**Interfaces:**

- Consumes: `requisitosDoCurso({ curso, aulas, questoes, casos })` (Task 5: `questoes` = todas, com `aula_id`;
  `casos` = `[{ aula_id, conteudo, deleted_at }]`); `<PreviaAlunoCurso curso aulas questoes casos onFechar />`
  (Task 13); `novoCasoVazio()` de `lib/ead-caso.js` (Task 2); entidade `TreinamentoCaso`; colunas
  `treinamento_questao.aula_id` e `treinamento_curso.nota_minima_modulo` (C1); tipos de aula do C1.
- Produces:
  - `lib/ead-aula-nova.js`: `TIPOS_DE_AULA: { valor, rotulo }[]`, `TIPOS_DE_ATIVIDADE`, `nomeDoTipoDeAula(tipo)`,
    `ehAtividade(tipo)`, `LIMITE_DE_MINUTOS_DA_AULA = 1440`, `segundosDosMinutos(valor): number`,
    `rotuloDoTempo(tipo): string`, `montarAulaSemArquivo(novaAula): { ok, erro } | { ok: true, dados }`,
    `camposDaEdicaoSemVideo(edicao): { ok, erro } | { ok: true, patch }`,
    `separarQuestoes(questoes): { prova: object[], porAula: Map<string, object[]> }`, `proximaOrdem(questoes): number`,
    `situacaoDaAtividade(aula, { questoes, temRoteiro }): { resumo: string | null, pendencia: string | null }`
  - `lib/ead-impacto.js`: `mudouNotaMinimaDoModulo(antes, nova)`; `avisoDeMudanca` com os tipos novos
    `"gabarito_questionario"`, `"nota_minima_modulo"`, `"atividades_novas"` (usado na Task 19) e `"caso_alterar"`
    (usado na Task 17); `"aula_duracao"` fora do vídeo passa a devolver `null` (A5).
  - `lib/ead-curso-numeros.js`: regra de `nota_minima_modulo` (0–100) e `notaMinimaDoModuloParaGravar(valor)`.
  - `<QuestoesEad questoes rascunho onRascunho onSalvar onExcluir salvando podeEditar grupo dicaDoComentario vazio />`
  - `<AulaLinhaEad ... onQuestoes? onCaso? resumo? pendencia? />` (`onCaso` é ligado na Task 17)
  - Na aba: estado `todosCasos`, `casoPorAula`, `questoesSeparadas`, `casoEditando` e `abrirCasoNovo(dados)` (o
    diálogo do caso é desenhado pela Task 17).

- [ ] **Step 1: Escrever os testes da lib nova (vão falhar)**

Crie `apps/web/src/lib/ead-aula-nova.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  LIMITE_DE_MINUTOS_DA_AULA,
  TIPOS_DE_ATIVIDADE,
  TIPOS_DE_AULA,
  camposDaEdicaoSemVideo,
  ehAtividade,
  montarAulaSemArquivo,
  nomeDoTipoDeAula,
  proximaOrdem,
  rotuloDoTempo,
  segundosDosMinutos,
  separarQuestoes,
  situacaoDaAtividade,
} from "./ead-aula-nova";

// Atividades interativas (spec 2026-10-14, §5.2): a "Nova aula" ganha questionário, caso e tarefa.

describe("tipos de aula", () => {
  it("a Nova aula oferece os seis tipos, na ordem da tela", () => {
    expect(TIPOS_DE_AULA.map((t) => t.valor)).toEqual([
      "video",
      "pdf",
      "texto",
      "questionario",
      "caso",
      "tarefa",
    ]);
    expect(TIPOS_DE_AULA.map((t) => t.rotulo)).toEqual([
      "Vídeo",
      "PDF",
      "Texto",
      "Questionário",
      "Caso",
      "Tarefa",
    ]);
  });

  it("nome de cada tipo na linha da aula; aula antiga sem tipo é vídeo", () => {
    expect(nomeDoTipoDeAula("questionario")).toBe("Questionário do módulo");
    expect(nomeDoTipoDeAula("caso")).toBe("Caso com decisões");
    expect(nomeDoTipoDeAula("tarefa")).toBe("Atividade de estudo");
    expect(nomeDoTipoDeAula(null)).toBe("Vídeo");
    expect(nomeDoTipoDeAula("constructor")).toBe("constructor");
  });

  it("as três atividades interativas", () => {
    expect(TIPOS_DE_ATIVIDADE).toEqual(["questionario", "caso", "tarefa"]);
    expect(ehAtividade("caso")).toBe(true);
    expect(ehAtividade("texto")).toBe(false);
    expect(ehAtividade(undefined)).toBe(false);
  });

  it("o rótulo do tempo: leitura no PDF e no texto; tempo previsto nas atividades", () => {
    expect(rotuloDoTempo("pdf")).toBe("Tempo previsto de leitura (min)");
    expect(rotuloDoTempo("texto")).toBe("Tempo previsto de leitura (min)");
    for (const tipo of TIPOS_DE_ATIVIDADE) expect(rotuloDoTempo(tipo)).toBe("Tempo previsto (min)");
  });
});

describe("segundosDosMinutos", () => {
  it("minutos (número ou texto, com vírgula) viram segundos inteiros", () => {
    expect(segundosDosMinutos(15)).toBe(900);
    expect(segundosDosMinutos("1,5")).toBe(90);
    expect(segundosDosMinutos(" 10 ")).toBe(600);
    expect(segundosDosMinutos(LIMITE_DE_MINUTOS_DA_AULA)).toBe(LIMITE_DE_MINUTOS_DA_AULA * 60);
  });

  it("vazio, zero, negativo, texto ou acima do limite valem 0 (a tela pede o tempo)", () => {
    for (const v of ["", "  ", null, undefined, 0, "-3", "abc", LIMITE_DE_MINUTOS_DA_AULA + 1]) {
      expect(segundosDosMinutos(v), String(v)).toBe(0);
    }
  });
});

describe("montarAulaSemArquivo", () => {
  const SEM_ARQUIVO = { fonte: "upload", youtube_id: null, arquivo_ref: null };

  it("questionário e caso: só o tempo previsto; nascem sem texto", () => {
    expect(montarAulaSemArquivo({ tipo: "questionario", minutos: "15", texto: "ignorado" })).toEqual({
      ok: true,
      dados: { ...SEM_ARQUIVO, conteudo_texto: null, duracao_seg: 900 },
    });
    expect(montarAulaSemArquivo({ tipo: "caso", minutos: 10 })).toEqual({
      ok: true,
      dados: { ...SEM_ARQUIVO, conteudo_texto: null, duracao_seg: 600 },
    });
  });

  it("tarefa e texto: o texto (aparado) vira o conteúdo", () => {
    expect(
      montarAulaSemArquivo({
        tipo: "tarefa",
        minutos: "35",
        texto: "  Faça o mapa.\n\nO que produzir: uma foto.  ",
      })
    ).toEqual({
      ok: true,
      dados: {
        ...SEM_ARQUIVO,
        conteudo_texto: "Faça o mapa.\n\nO que produzir: uma foto.",
        duracao_seg: 2100,
      },
    });
    expect(montarAulaSemArquivo({ tipo: "texto", minutos: 2, texto: "Leitura" }).dados).toEqual({
      ...SEM_ARQUIVO,
      conteudo_texto: "Leitura",
      duracao_seg: 120,
    });
  });

  it("sem tempo ou sem texto: o erro diz o que falta", () => {
    expect(montarAulaSemArquivo({ tipo: "questionario", minutos: "" })).toEqual({
      ok: false,
      erro: "Informe o tempo previsto (minutos)",
    });
    expect(montarAulaSemArquivo({ tipo: "texto", minutos: "", texto: "x" }).erro).toBe(
      "Informe o tempo previsto de leitura (minutos)"
    );
    expect(montarAulaSemArquivo({ tipo: "texto", minutos: 5, texto: "  " }).erro).toBe(
      "Escreva o texto da aula"
    );
    expect(montarAulaSemArquivo({ tipo: "tarefa", minutos: 5, texto: "" }).erro).toMatch(
      /instruções da atividade/
    );
  });

  it("vídeo e PDF não passam por aqui (sobem arquivo)", () => {
    expect(montarAulaSemArquivo({ tipo: "video", minutos: 5 }).ok).toBe(false);
    expect(montarAulaSemArquivo({ tipo: "pdf", minutos: 5 }).ok).toBe(false);
    expect(montarAulaSemArquivo(undefined).ok).toBe(false);
  });
});

describe("camposDaEdicaoSemVideo", () => {
  it("PDF, questionário e caso: só o tempo previsto", () => {
    expect(camposDaEdicaoSemVideo({ tipo: "pdf", minutos: "20" })).toEqual({
      ok: true,
      patch: { duracao_seg: 1200 },
    });
    expect(camposDaEdicaoSemVideo({ tipo: "caso", minutos: 12, texto: "ignorado" })).toEqual({
      ok: true,
      patch: { duracao_seg: 720 },
    });
  });

  it("texto e tarefa: o texto também (antes só se corrigia por SQL)", () => {
    expect(camposDaEdicaoSemVideo({ tipo: "texto", minutos: "5", texto: " novo " })).toEqual({
      ok: true,
      patch: { duracao_seg: 300, conteudo_texto: "novo" },
    });
    expect(camposDaEdicaoSemVideo({ tipo: "tarefa", minutos: "5", texto: "" }).ok).toBe(false);
  });

  it("sem tempo: erro com o nome do tempo de cada tipo", () => {
    expect(camposDaEdicaoSemVideo({ tipo: "questionario", minutos: "" }).erro).toBe(
      "Informe o tempo previsto (minutos)"
    );
    expect(camposDaEdicaoSemVideo({ tipo: "pdf", minutos: 0 }).erro).toBe(
      "Informe o tempo previsto de leitura (minutos)"
    );
  });
});

describe("separarQuestoes e proximaOrdem", () => {
  it("prova final = sem aula; cada questionário = as da aula; em ordem; apagadas fora", () => {
    const qs = [
      { id: "p2", ordem: 2, aula_id: null },
      { id: "q1b", ordem: 2, aula_id: "aq1" },
      { id: "p1", ordem: 1 },
      { id: "q1a", ordem: 1, aula_id: "aq1" },
      { id: "q2a", ordem: 1, aula_id: "aq2" },
      { id: "px", ordem: 3, deleted_at: "2026-10-01T00:00:00Z" },
    ];
    const { prova, porAula } = separarQuestoes(qs);
    expect(prova.map((q) => q.id)).toEqual(["p1", "p2"]);
    expect(porAula.get("aq1").map((q) => q.id)).toEqual(["q1a", "q1b"]);
    expect(porAula.get("aq2").map((q) => q.id)).toEqual(["q2a"]);
    expect(porAula.has("aq3")).toBe(false);
    expect(qs[0].id).toBe("p2"); // a lista recebida não muda
    expect(separarQuestoes(null).prova).toEqual([]);
    expect(separarQuestoes(undefined).porAula.size).toBe(0);
  });

  it("a próxima ordem é a maior do grupo + 1", () => {
    expect(proximaOrdem([])).toBe(1);
    expect(proximaOrdem([{ ordem: 2 }, { ordem: "5" }, {}])).toBe(6);
    expect(proximaOrdem(undefined)).toBe(1);
  });
});

describe("situacaoDaAtividade (selos da linha da aula)", () => {
  it("questionário: quantas questões, ou a pendência 'sem questões'", () => {
    const aula = { tipo: "questionario" };
    expect(situacaoDaAtividade(aula, { questoes: [{}, {}] })).toEqual({
      resumo: "2 questões",
      pendencia: null,
    });
    expect(situacaoDaAtividade(aula, { questoes: [{}] }).resumo).toBe("1 questão");
    expect(situacaoDaAtividade(aula, {})).toEqual({ resumo: null, pendencia: "sem questões" });
  });

  it("caso sem roteiro e tarefa sem instruções ficam pendentes", () => {
    expect(situacaoDaAtividade({ tipo: "caso" }, { temRoteiro: false }).pendencia).toBe(
      "sem roteiro"
    );
    expect(situacaoDaAtividade({ tipo: "caso" }, { temRoteiro: true }).pendencia).toBeNull();
    expect(situacaoDaAtividade({ tipo: "tarefa", conteudo_texto: " " }).pendencia).toBe(
      "sem instruções"
    );
    expect(situacaoDaAtividade({ tipo: "tarefa", conteudo_texto: "Faça." }).pendencia).toBeNull();
  });

  it("vídeo, PDF e texto não ganham selo daqui", () => {
    expect(situacaoDaAtividade({ tipo: "video" })).toEqual({ resumo: null, pendencia: null });
    expect(situacaoDaAtividade(null)).toEqual({ resumo: null, pendencia: null });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/lib/ead-aula-nova.test.js`
Expected: FAIL — `Failed to load url ./ead-aula-nova` (o arquivo não existe).

- [ ] **Step 3: Implementar `apps/web/src/lib/ead-aula-nova.js`**

```js
/**
 * Tipos de aula e a "Nova aula" da tela do RH (aba Treinamentos EAD) — regra pura, sem DOM e sem rede.
 *
 * Atividades interativas (spec 2026-10-14, §5.2): além de vídeo, PDF e texto, a aula pode ser questionário do
 * módulo, caso com decisões ou atividade de estudo (tarefa). As aulas sem arquivo (texto e as três atividades) são
 * montadas aqui; vídeo e PDF continuam na tela, que sobe o arquivo. O tempo informado é o tempo PREVISTO: soma na
 * carga horária (requisito LASTRO) e, fora do vídeo, não decide a conclusão (A5).
 *
 * Quem usa: components/seguranca/TreinamentosEadTab.jsx e AulaLinhaEad.jsx. Testes: ead-aula-nova.test.js.
 */

/** Os botões de tipo da "Nova aula", na ordem da tela. */
export const TIPOS_DE_AULA = Object.freeze([
  Object.freeze({ valor: "video", rotulo: "Vídeo" }),
  Object.freeze({ valor: "pdf", rotulo: "PDF" }),
  Object.freeze({ valor: "texto", rotulo: "Texto" }),
  Object.freeze({ valor: "questionario", rotulo: "Questionário" }),
  Object.freeze({ valor: "caso", rotulo: "Caso" }),
  Object.freeze({ valor: "tarefa", rotulo: "Tarefa" }),
]);

/** As atividades interativas (concluem pelas ações próprias ou pelo "Fiz a atividade"). */
export const TIPOS_DE_ATIVIDADE = Object.freeze(["questionario", "caso", "tarefa"]);

const NOME_DO_TIPO = {
  video: "Vídeo",
  pdf: "Apostila em PDF",
  texto: "Texto",
  questionario: "Questionário do módulo",
  caso: "Caso com decisões",
  tarefa: "Atividade de estudo",
};

/** Nome do tipo para a linha da aula; aula antiga, sem tipo, é vídeo. Tipo desconhecido aparece como veio. */
export function nomeDoTipoDeAula(tipo) {
  const t = tipo || "video";
  return Object.hasOwn(NOME_DO_TIPO, t) ? NOME_DO_TIPO[t] : String(t);
}

export function ehAtividade(tipo) {
  return TIPOS_DE_ATIVIDADE.includes(tipo);
}

/** Maior tempo previsto aceito numa aula (24 h): acima disso é engano de digitação. */
export const LIMITE_DE_MINUTOS_DA_AULA = 1440;

/** Minutos digitados (número ou texto, vírgula decimal) em segundos inteiros; inválido ou fora da faixa vale 0. */
export function segundosDosMinutos(valor) {
  if (valor === null || valor === undefined) return 0;
  const n = Number(String(valor).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > LIMITE_DE_MINUTOS_DA_AULA) return 0;
  return Math.round(n * 60);
}

/** O rótulo do campo de tempo: leitura no PDF e no texto; tempo previsto nas atividades. */
export function rotuloDoTempo(tipo) {
  return tipo === "pdf" || tipo === "texto"
    ? "Tempo previsto de leitura (min)"
    : "Tempo previsto (min)";
}

const SEM_ARQUIVO = ["texto", ...TIPOS_DE_ATIVIDADE];
const ERRO_DO_TEXTO = {
  texto: "Escreva o texto da aula",
  tarefa: "Escreva as instruções da atividade (o que fazer e o que produzir)",
};
const erroDoTempo = (tipo) =>
  tipo === "pdf" || tipo === "texto"
    ? "Informe o tempo previsto de leitura (minutos)"
    : "Informe o tempo previsto (minutos)";
const textoLimpo = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * Os dados de uma aula nova SEM arquivo (texto, questionário, caso, tarefa), a partir do formulário da tela
 * (`{ tipo, minutos, texto }`). Questionário e caso nascem sem texto (as questões e o roteiro vêm depois); texto e
 * tarefa exigem o texto. Devolve `{ ok: true, dados }` (campos da linha de `treinamento_aula`, sem título, módulo e
 * ordem) ou `{ ok: false, erro }`.
 */
export function montarAulaSemArquivo(novaAula) {
  const tipo = novaAula?.tipo;
  if (!SEM_ARQUIVO.includes(tipo)) {
    return { ok: false, erro: "Este tipo de aula precisa de arquivo ou link" };
  }
  const duracao_seg = segundosDosMinutos(novaAula.minutos);
  if (!duracao_seg) return { ok: false, erro: erroDoTempo(tipo) };
  const comTexto = tipo === "texto" || tipo === "tarefa";
  const texto = textoLimpo(novaAula.texto);
  if (comTexto && !texto) return { ok: false, erro: ERRO_DO_TEXTO[tipo] };
  return {
    ok: true,
    dados: {
      fonte: "upload",
      youtube_id: null,
      arquivo_ref: null,
      conteudo_texto: comTexto ? texto : null,
      duracao_seg,
    },
  };
}

/**
 * O que a edição de uma aula que não é vídeo grava, além do título e do módulo: o tempo previsto e, no texto e na
 * tarefa, o texto (§5.2: antes a tela não editava o texto, e a correção era por SQL). `{ ok: true, patch }` ou
 * `{ ok: false, erro }`.
 */
export function camposDaEdicaoSemVideo(edicao) {
  const tipo = edicao?.tipo;
  const duracao_seg = segundosDosMinutos(edicao?.minutos);
  if (!duracao_seg) return { ok: false, erro: erroDoTempo(tipo) };
  if (tipo !== "texto" && tipo !== "tarefa") return { ok: true, patch: { duracao_seg } };
  const texto = textoLimpo(edicao.texto);
  if (!texto) return { ok: false, erro: ERRO_DO_TEXTO[tipo] };
  return { ok: true, patch: { duracao_seg, conteudo_texto: texto } };
}

const porOrdem = (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0);

/**
 * As questões do curso separadas: `prova` (sem `aula_id`: a avaliação final) e `porAula` (Map aula_id → questões
 * do questionário daquela aula). Cada grupo em ordem; apagadas ficam de fora. A lista recebida não muda.
 */
export function separarQuestoes(questoes) {
  const prova = [];
  const porAula = new Map();
  for (const q of Array.isArray(questoes) ? questoes : []) {
    if (!q || q.deleted_at) continue;
    if (q.aula_id) {
      const doQuestionario = porAula.get(q.aula_id) ?? [];
      doQuestionario.push(q);
      porAula.set(q.aula_id, doQuestionario);
    } else {
      prova.push(q);
    }
  }
  prova.sort(porOrdem);
  for (const lista of porAula.values()) lista.sort(porOrdem);
  return { prova, porAula };
}

/** A ordem da próxima questão do grupo (a maior + 1). */
export function proximaOrdem(questoes) {
  return Math.max(0, ...(Array.isArray(questoes) ? questoes : []).map((q) => Number(q?.ordem) || 0)) + 1;
}

/**
 * Selos da linha de uma atividade na lista de aulas: `resumo` (ex.: "8 questões") e `pendencia` (o que impede o
 * aluno de fazer a aula: "sem questões", "sem roteiro", "sem instruções"). Vídeo, PDF e texto: nada daqui.
 */
export function situacaoDaAtividade(aula, { questoes = [], temRoteiro = false } = {}) {
  const tipo = aula?.tipo;
  if (tipo === "questionario") {
    const n = Array.isArray(questoes) ? questoes.length : 0;
    return n
      ? { resumo: n === 1 ? "1 questão" : `${n} questões`, pendencia: null }
      : { resumo: null, pendencia: "sem questões" };
  }
  if (tipo === "caso") return { resumo: null, pendencia: temRoteiro ? null : "sem roteiro" };
  if (tipo === "tarefa") {
    return { resumo: null, pendencia: textoLimpo(aula.conteudo_texto) ? null : "sem instruções" };
  }
  return { resumo: null, pendencia: null };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/lib/ead-aula-nova.test.js`
Expected: PASS.

- [ ] **Step 5: Escrever os testes do impacto, dos números do curso e do projeto pedagógico (vão falhar)**

Em `apps/web/src/lib/ead-impacto.test.js`, acrescente `mudouNotaMinimaDoModulo,` ao import (depois de
`mudouNotaMinima,`) e troque o teste "mudar a duração: texto próprio de vídeo e de leitura" (:162-169) por:

```js
  it("mudar a duração: o vídeo avisa (90%); fora do vídeo o tempo é só o previsto e não avisa (A5)", () => {
    expect(avisoDeMudanca("aula_duracao", { comProgresso: 0 })).toBeNull();
    const video = avisoDeMudanca("aula_duracao", { comProgresso: 2, ehVideo: true });
    expect(video.texto).toMatch(/90%/);
    // atividades interativas: leitura e atividades concluem sem tempo mínimo; o tempo só soma na carga
    expect(avisoDeMudanca("aula_duracao", { comProgresso: 2, ehVideo: false })).toBeNull();
  });
```

E acrescente no fim do arquivo:

```js
describe("avisoDeMudanca: atividades interativas", () => {
  it("gabarito do questionário: vale para as próximas tentativas do questionário", () => {
    expect(avisoDeMudanca("gabarito_questionario", { emAndamento: 0 })).toBeNull();
    const a = avisoDeMudanca("gabarito_questionario", { emAndamento: 2 });
    expect(a.titulo).toMatch(/questionário/i);
    expect(a.texto).toContain("2 matrículas em andamento");
    expect(a.texto).toMatch(/próximas tentativas do questionário/);
    expect(a.rotuloConfirmar).toBeTruthy();
  });

  it("nota mínima dos questionários dos módulos", () => {
    expect(avisoDeMudanca("nota_minima_modulo", { emAndamento: 0 })).toBeNull();
    const a = avisoDeMudanca("nota_minima_modulo", { emAndamento: 1 });
    expect(a.titulo).toMatch(/questionários/i);
    expect(a.texto).toContain("1 matrícula em andamento");
    expect(a.texto).toMatch(/já concluídos não mudam/);
  });

  it("importar atividades: entram depois da última aula de cada módulo e viram exigência", () => {
    expect(avisoDeMudanca("atividades_novas", { emAndamento: 0 })).toBeNull();
    const a = avisoDeMudanca("atividades_novas", { emAndamento: 3 });
    expect(a.texto).toContain("3 matrículas em andamento");
    expect(a.texto).toMatch(/última aula de cada módulo/);
  });

  it("mudar o roteiro do caso: só com alguém no caso, e diz o que acontece com quem está no meio", () => {
    expect(avisoDeMudanca("caso_alterar", { emAndamento: 3, comProgresso: 0 })).toBeNull();
    const a = avisoDeMudanca("caso_alterar", { comProgresso: 2, concluiramAula: 1 });
    expect(a.texto).toContain("2 matrículas já têm progresso nesta aula (1 já a concluiu)");
    expect(a.texto).toMatch(/continua com ele concluído/);
    expect(a.texto).toMatch(/recomeça da primeira etapa/);
    expect(avisoDeMudanca("caso_alterar", { comProgresso: 1 }).texto).not.toMatch(/concluído/);
  });
});

describe("mudouNotaMinimaDoModulo", () => {
  it("curso novo não é mudança; nota gravada vazia vale 80", () => {
    expect(mudouNotaMinimaDoModulo(null, 70)).toBe(false);
    expect(mudouNotaMinimaDoModulo({}, 80)).toBe(false);
    expect(mudouNotaMinimaDoModulo({ nota_minima_modulo: null }, 70)).toBe(true);
    expect(mudouNotaMinimaDoModulo({ nota_minima_modulo: 80 }, 80)).toBe(false);
    expect(mudouNotaMinimaDoModulo({ nota_minima_modulo: 70 }, 80)).toBe(true);
  });
});
```

Em `apps/web/src/lib/ead-curso-numeros.test.js`, troque o import (:3) por:

```js
import {
  notaMinimaDoModuloParaGravar,
  notaMinimaParaGravar,
  validarNumerosDoCurso,
} from "./ead-curso-numeros";
```

e acrescente no fim do arquivo:

```js
// Atividades interativas (spec 2026-10-14): a nota mínima dos questionários dos módulos é do curso, 0 a 100, padrão 80.
describe("nota mínima dos questionários dos módulos", () => {
  it("inteiro de 0 a 100; vazio vale (a tela grava o padrão)", () => {
    for (const v of [0, 80, 100, "75", "", null]) {
      expect(ok({ nota_minima_modulo: v }), String(v)).toEqual({ ok: true });
    }
  });

  it("fora da faixa, decimal ou texto: erro com o nome do campo; vem depois da nota da prova", () => {
    for (const v of [-1, 101, 7.5, "abc"]) {
      const r = erro({ nota_minima_modulo: v });
      expect(r.campo).toBe("nota_minima_modulo");
      expect(r.erro).toMatch(/questionários dos módulos/);
    }
    expect(erro({ nota_minima: 200, nota_minima_modulo: 200 }).campo).toBe("nota_minima");
  });

  it("notaMinimaDoModuloParaGravar: 0 continua 0; vazio vale 80", () => {
    expect(notaMinimaDoModuloParaGravar(0)).toBe(0);
    expect(notaMinimaDoModuloParaGravar("85")).toBe(85);
    for (const v of ["", "  ", null, undefined]) expect(notaMinimaDoModuloParaGravar(v)).toBe(80);
  });
});
```

Em `apps/web/src/lib/ead-projeto.test.js`, logo depois do teste "(o) exige o mínimo de questões do requisito de
publicação" (termina na linha 287), acrescente:

```js
  it("(m) e (o) com atividades interativas: o material lista as atividades e a prova conta só as questões sem aula", () => {
    const comAtividades = [
      ...aulas,
      { id: "a4", ordem: 4, modulo: "Módulo 2", titulo: "Questionário", tipo: "questionario" },
      { id: "a5", ordem: 5, modulo: "Módulo 2", titulo: "Caso", tipo: "caso" },
      { id: "a6", ordem: 6, modulo: "Módulo 2", titulo: "Tarefa 1", tipo: "tarefa" },
      { id: "a7", ordem: 7, modulo: "Módulo 2", titulo: "Tarefa 2", tipo: "tarefa" },
    ];
    const doQuestionario = Array.from({ length: 8 }, (_, i) => ({ id: `qq${i}`, aula_id: "a4" }));
    const p = montarProjeto({
      curso,
      aulas: comAtividades,
      questoes: [...questoes, ...doQuestionario],
    });
    expect(item(p, "m").linhas).toEqual([
      "Vídeos: 1 (1 com legenda)",
      "Apostilas em PDF: 1",
      "Aulas de texto: 1",
      "Questionários dos módulos: 1",
      "Estudos de caso: 1",
      "Atividades de estudo: 2",
    ]);
    expect(item(p, "o").linhas[0]).toBe("5 questões de múltipla escolha");
    // só as questões dos questionários não fazem a avaliação final
    const soDoQuestionario = montarProjeto({ curso, aulas: comAtividades, questoes: doQuestionario });
    expect(item(soDoQuestionario, "o").preenchido).toBe(false);
  });
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/lib/ead-impacto.test.js src/lib/ead-curso-numeros.test.js src/lib/ead-projeto.test.js`
Expected: FAIL — `mudouNotaMinimaDoModulo is not a function`, `notaMinimaDoModuloParaGravar is not a function`,
avisos novos `null`, a duração de leitura ainda avisa, e o item "m"/"o" do projeto sem as atividades.

- [ ] **Step 7: Implementar impacto, números do curso e projeto pedagógico**

Em `apps/web/src/lib/ead-impacto.js`, logo depois de `mudouNotaMinima` (:67), acrescente:

```js
/**
 * A nota mínima dos questionários dos módulos (atividades interativas) do formulário é diferente da gravada? Curso
 * ainda sem cadastro não é mudança; nota gravada vazia vale 80, o padrão da coluna (migração 0170).
 */
export function mudouNotaMinimaDoModulo(antes, nova) {
  if (!antes) return false;
  const gravada = Number(antes.nota_minima_modulo ?? 80);
  return Number(nova) !== (Number.isFinite(gravada) ? gravada : 80);
}
```

E troque a função `avisoDeMudanca` inteira (o comentário de cima e o corpo, :84-157) por:

```js
/**
 * Aviso a mostrar antes de salvar a mudança, ou null quando ninguém é afetado. `tipo`:
 *
 * - "gabarito" e "nota_minima": com matrícula em andamento no curso (`emAndamento`).
 * - "gabarito_questionario" e "nota_minima_modulo" (atividades interativas): o mesmo, para os questionários dos
 *   módulos (estudo guiado, tentativas livres).
 * - "aula_nova": com matrícula em andamento no curso; a aula entra no fim da trilha.
 * - "atividades_novas" (importação): com matrícula em andamento; entram depois da última aula de cada módulo.
 * - "aula_trocar" (arquivo, link ou texto novo) e "aula_duracao" (tempo novo): quando alguém já tem progresso
 *   NESTA aula (`comProgresso`; `concluiramAula` dessas). `ehVideo` escolhe o texto. Fora do vídeo, o tempo é só o
 *   previsto (soma na carga) e não decide a conclusão (A5): "aula_duracao" não avisa.
 * - "caso_alterar" (roteiro do caso com decisões): quando alguém já tem progresso nesta aula.
 *
 * Devolve `{ titulo, texto, rotuloConfirmar }` no formato de `useConfirmar` (a remoção da aula tem
 * texto próprio: textoConfirmarRemocaoAula).
 */
export function avisoDeMudanca(
  tipo,
  { emAndamento = 0, comProgresso = 0, concluiramAula = 0, ehVideo = false } = {}
) {
  const curso = emAndamento > 0 ? `Este curso tem ${quantidadeDeMatriculas(emAndamento)}.` : "";

  if (tipo === "gabarito" && emAndamento > 0) {
    return {
      titulo: "Mudar o gabarito com alunos em andamento?",
      texto:
        `${curso} A mudança vale para as próximas provas: quem ainda não foi aprovado será ` +
        "corrigido com o gabarito novo. Notas e aprovações já registradas não mudam.",
      rotuloConfirmar: "Salvar mesmo assim",
    };
  }
  if (tipo === "gabarito_questionario" && emAndamento > 0) {
    return {
      titulo: "Mudar o gabarito do questionário com alunos em andamento?",
      texto:
        `${curso} A mudança vale para as próximas tentativas do questionário. Tentativas já ` +
        "registradas e questionários já concluídos não mudam.",
      rotuloConfirmar: "Salvar mesmo assim",
    };
  }
  if (tipo === "nota_minima" && emAndamento > 0) {
    return {
      titulo: "Mudar a nota mínima com alunos em andamento?",
      texto:
        `${curso} A nova nota mínima vale para as próximas tentativas da prova. Notas e ` +
        "aprovações já registradas não mudam.",
      rotuloConfirmar: "Salvar mesmo assim",
    };
  }
  if (tipo === "nota_minima_modulo" && emAndamento > 0) {
    return {
      titulo: "Mudar a nota mínima dos questionários com alunos em andamento?",
      texto:
        `${curso} A nova nota mínima vale para as próximas tentativas dos questionários dos ` +
        "módulos. Questionários já concluídos não mudam.",
      rotuloConfirmar: "Salvar mesmo assim",
    };
  }
  if (tipo === "aula_nova" && emAndamento > 0) {
    return {
      titulo: "Adicionar aula com alunos em andamento?",
      texto:
        `${curso} A aula nova entra no fim da trilha e passa a ser exigida de quem ainda não ` +
        "concluiu o curso.",
      rotuloConfirmar: "Adicionar aula",
    };
  }
  if (tipo === "atividades_novas" && emAndamento > 0) {
    return {
      titulo: "Importar atividades com alunos em andamento?",
      texto:
        `${curso} As atividades entram depois da última aula de cada módulo e passam a ser ` +
        "exigidas de quem ainda não concluiu o curso, inclusive de quem já passou daquele módulo.",
      rotuloConfirmar: "Continuar",
    };
  }
  if (tipo === "caso_alterar" && comProgresso > 0) {
    return {
      titulo: "Mudar o roteiro do caso com alunos?",
      texto:
        `${fraseDeProgresso(comProgresso, concluiramAula)}. ` +
        (concluiramAula > 0 ? "Quem já concluiu o caso continua com ele concluído. " : "") +
        "Quem está no meio do caso recomeça da primeira etapa se o caminho que já fez deixar de " +
        "existir no roteiro novo (a trilha registra o recomeço).",
      rotuloConfirmar: "Salvar mesmo assim",
    };
  }
  // A5: fora do vídeo, o tempo novo não muda nada para quem está fazendo a aula
  if (tipo === "aula_duracao" && !ehVideo) return null;
  if ((tipo === "aula_trocar" || tipo === "aula_duracao") && comProgresso > 0) {
    const ficam =
      concluiramAula > 0
        ? "quem já terminou a aula continua com ela concluída; quem está no meio"
        : "quem está no meio";
    if (tipo === "aula_trocar") {
      return {
        titulo: "Trocar o conteúdo da aula com progresso?",
        texto:
          `${fraseDeProgresso(comProgresso, concluiramAula)}. O conteúdo novo vale para todos os ` +
          `alunos: ${ficam} mantém o ` +
          (ehVideo
            ? "tempo já assistido, que passa a ser contado contra a duração nova."
            : "tempo de leitura já registrado."),
        rotuloConfirmar: "Trocar mesmo assim",
      };
    }
    return {
      titulo: "Mudar o tempo da aula com progresso?",
      texto:
        `${fraseDeProgresso(comProgresso, concluiramAula)}. ` +
        "A duração nova muda o tempo exigido para concluir a aula (90% do vídeo) para todos: " +
        `${ficam} mantém o tempo já registrado, agora contado contra o valor novo.`,
      rotuloConfirmar: "Salvar mesmo assim",
    };
  }
  return null;
}
```

Em `apps/web/src/lib/ead-curso-numeros.js`, em `REGRAS`, logo depois da regra de `nota_minima`, acrescente:

```js
  {
    // atividades interativas: os questionários dos módulos (coluna da migração 0170, check 0-100)
    campo: "nota_minima_modulo",
    valido: (n) => n >= 0 && n <= 100,
    erro: "A nota mínima dos questionários dos módulos precisa ser um número inteiro de 0 a 100.",
  },
```

e no fim do arquivo:

```js
/** Nota mínima dos questionários dos módulos quando o curso não define uma (o padrão da coluna, 0170). */
const NOTA_MINIMA_DO_MODULO_PADRAO = 80;

/**
 * A nota mínima dos questionários dos módulos que a tela grava: campo vazio vale o padrão (80); qualquer outro
 * valor vira número, e 0 continua 0 (como `notaMinimaParaGravar`). A faixa é conferida por `validarNumerosDoCurso`.
 */
export function notaMinimaDoModuloParaGravar(valor) {
  return vazio(valor) ? NOTA_MINIMA_DO_MODULO_PADRAO : Number(String(valor).trim());
}
```

Em `apps/web/src/lib/ead-projeto.js`, troque (:293):

```js
  const questoesVivas = (Array.isArray(questoes) ? questoes : []).filter(viva);
```

por:

```js
  // a avaliação (item "o") é a prova final: as questões dos questionários dos módulos (com `aula_id`) não contam
  const questoesVivas = (Array.isArray(questoes) ? questoes : []).filter(
    (q) => viva(q) && !q.aula_id
  );
```

e, no item "m" (:394-411), troque:

```js
      const textos = vivas.filter((a) => a.tipo === "texto");
      const linhas = [];
```

por:

```js
      const textos = vivas.filter((a) => a.tipo === "texto");
      // atividades interativas (spec 2026-10-14)
      const questionarios = vivas.filter((a) => a.tipo === "questionario");
      const casos = vivas.filter((a) => a.tipo === "caso");
      const tarefas = vivas.filter((a) => a.tipo === "tarefa");
      const linhas = [];
```

e:

```js
      if (textos.length) linhas.push(`Aulas de texto: ${textos.length}`);
```

por:

```js
      if (textos.length) linhas.push(`Aulas de texto: ${textos.length}`);
      if (questionarios.length) linhas.push(`Questionários dos módulos: ${questionarios.length}`);
      if (casos.length) linhas.push(`Estudos de caso: ${casos.length}`);
      if (tarefas.length) linhas.push(`Atividades de estudo: ${tarefas.length}`);
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/lib/ead-impacto.test.js src/lib/ead-curso-numeros.test.js src/lib/ead-projeto.test.js`
Expected: PASS.

- [ ] **Step 9: Escrever o teste do `QuestoesEad` (vai falhar)**

Crie `apps/web/src/components/seguranca/QuestoesEad.test.jsx`:

```jsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// `lib/utils.js` (usado pelos componentes da ui) lê `window` ao carregar; o ambiente de teste não tem DOM.
vi.hoisted(() => {
  const janela = {};
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

import QuestoesEad from "./QuestoesEad";

/**
 * Lista e editor de questões da aba Treinamentos (prova final e questionários dos módulos). `renderToStaticMarkup`
 * não roda cliques: confere o que o RH vê; a regra do gabarito está em lib/ead-questao.test.js.
 */
const QUESTOES = [
  {
    id: "q1",
    pergunta: "Primeira pergunta?",
    opcoes: ["Certa", "Errada"],
    correta: 0,
    comentario: "Porque sim.",
  },
  { id: "q2", pergunta: "Segunda pergunta?", opcoes: ["X", "Y", "Z"], correta: 2 },
];
const semOperacao = () => {};
const desenhar = (extra = {}) =>
  renderToStaticMarkup(
    <QuestoesEad
      questoes={QUESTOES}
      onRascunho={semOperacao}
      onSalvar={semOperacao}
      onExcluir={semOperacao}
      {...extra}
    />
  );

describe("QuestoesEad", () => {
  it("lista as questões com a correta marcada por texto (não só pela cor) e o comentário", () => {
    const html = desenhar();
    expect(html).toContain("1. Primeira pergunta?");
    expect(html).toContain("2. Segunda pergunta?");
    expect(html).toContain("(correta)");
    expect(html).toContain("Porque sim.");
  });

  it("sem Editar: nem botões de editar e excluir, nem o editor", () => {
    const html = desenhar({ rascunho: { pergunta: "", opcoes: ["", ""], correta: 0 } });
    expect(html).not.toContain("Editar a questão");
    expect(html).not.toContain("Salvar questão");
  });

  it("com Editar: botões por questão e o editor do rascunho, com o grupo de rádio próprio", () => {
    const html = desenhar({
      podeEditar: true,
      grupo: "correta-aq1",
      dicaDoComentario: "Comentário (o aluno vê na correção)",
      rascunho: { pergunta: "Nova?", opcoes: ["a", "b", "c"], correta: 1, comentario: "" },
    });
    expect(html).toContain('aria-label="Editar a questão 1"');
    expect(html).toContain('aria-label="Excluir a questão 2"');
    expect(html).toContain('name="correta-aq1"');
    expect(html).toContain('placeholder="Comentário (o aluno vê na correção)"');
    expect(html).toContain("Salvar questão");
  });

  it("lista vazia mostra o aviso; nada de emoji", () => {
    const vazia = renderToStaticMarkup(
      <QuestoesEad
        questoes={[]}
        vazio="Nenhuma questão ainda."
        onRascunho={semOperacao}
        onSalvar={semOperacao}
        onExcluir={semOperacao}
      />
    );
    expect(vazia).toContain("Nenhuma questão ainda.");
    expect(desenhar({ podeEditar: true })).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
```

Run: `cd apps/web && npx vitest run src/components/seguranca/QuestoesEad.test.jsx`
Expected: FAIL — `Failed to load url ./QuestoesEad`.

- [ ] **Step 10: Implementar `apps/web/src/components/seguranca/QuestoesEad.jsx`**

O desenho é o da lista e do editor que hoje ficam dentro da aba (:2611-2756), sem emoji (o balão do comentário e o sinal de visto da correta viram
ícones e texto para leitor de tela):

```jsx
import React from "react";
import { Check, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const letra = (i) => String.fromCharCode(65 + i);

/**
 * Lista de questões de múltipla escolha com o editor, na aba Treinamentos EAD: a avaliação final do curso e cada
 * questionário de módulo (atividades interativas) usam a mesma tela. O gabarito é conferido por quem grava
 * (`onSalvar` usa `normalizarQuestao`, lib/ead-questao.js); aqui só se desenha e se edita o rascunho.
 *
 * - `questoes`: em ordem. `rascunho`: a questão aberta no editor ({ id?, aula_id?, pergunta, opcoes, correta,
 *   comentario }) ou null. `onRascunho(rascunho | null)` abre, muda e fecha o editor.
 * - `podeEditar`: sem a função Editar a lista só mostra (sem botões nem editor).
 * - `grupo`: nome único dos botões de rádio da alternativa correta (a prova e cada questionário têm o seu).
 * - `dicaDoComentario`: quando o aluno vê o comentário (na prova, depois da aprovação; no questionário, na
 *   correção de cada envio). `vazio`: o texto da lista sem questões.
 */
export default function QuestoesEad({
  questoes = [],
  rascunho = null,
  onRascunho,
  onSalvar,
  onExcluir,
  salvando = false,
  podeEditar = false,
  grupo = "correta",
  dicaDoComentario = "Comentário da resposta",
  vazio = "",
}) {
  const mudar = (campos) => onRascunho({ ...rascunho, ...campos });

  return (
    <div className="space-y-2">
      {questoes.length === 0 && vazio ? <p className="text-xs text-slate-500">{vazio}</p> : null}
      {questoes.map((q, qi) => (
        <div key={q.id} className="text-sm bg-slate-50 rounded p-2">
          <div className="flex items-start gap-2">
            <span className="flex-1 font-medium">
              {qi + 1}. {q.pergunta}
            </span>
            {podeEditar && (
              <>
                <button
                  type="button"
                  title="Editar questão"
                  aria-label={`Editar a questão ${qi + 1}`}
                  onClick={() =>
                    onRascunho({
                      id: q.id,
                      aula_id: q.aula_id ?? null,
                      pergunta: q.pergunta || "",
                      opcoes:
                        Array.isArray(q.opcoes) && q.opcoes.length >= 2 ? [...q.opcoes] : ["", ""],
                      correta: q.correta ?? 0,
                      comentario: q.comentario || "",
                    })
                  }
                >
                  <Pencil className="w-4 h-4 text-slate-400 hover:text-slate-800" />
                </button>
                <button
                  type="button"
                  title="Excluir questão"
                  aria-label={`Excluir a questão ${qi + 1}`}
                  onClick={() => onExcluir(q)}
                >
                  <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                </button>
              </>
            )}
          </div>
          <ul className="mt-1 ml-4 space-y-0.5">
            {(q.opcoes || []).map((o, i) => (
              <li
                key={i}
                className={i === q.correta ? "text-emerald-700 font-medium" : "text-slate-600"}
              >
                {letra(i)}) {o}
                {i === q.correta && (
                  <>
                    <Check className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only"> (correta)</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {q.comentario && (
            <p className="mt-1 ml-4 flex items-start gap-1 text-xs italic text-slate-500">
              <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {q.comentario}
            </p>
          )}
        </div>
      ))}
      {podeEditar && rascunho && (
        <div className="border rounded-lg p-3 space-y-2 bg-white">
          <Input
            placeholder="Pergunta"
            aria-label="Pergunta"
            value={rascunho.pergunta}
            onChange={(e) => mudar({ pergunta: e.target.value })}
            className="h-9"
          />
          {rascunho.opcoes.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={grupo}
                checked={rascunho.correta === i}
                onChange={() => mudar({ correta: i })}
                title="Marcar como correta"
                aria-label={`Marcar a opção ${letra(i)} como correta`}
              />
              <Input
                placeholder={`Opção ${letra(i)}`}
                value={o}
                onChange={(e) => {
                  const opcoes = [...rascunho.opcoes];
                  opcoes[i] = e.target.value;
                  mudar({ opcoes });
                }}
                className="h-8"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover opção ${letra(i)}`}
                disabled={rascunho.opcoes.length <= 2}
                onClick={() =>
                  mudar({
                    opcoes: rascunho.opcoes.filter((_, indice) => indice !== i),
                    correta:
                      rascunho.correta === i
                        ? -1
                        : rascunho.correta > i
                          ? rascunho.correta - 1
                          : rascunho.correta,
                  })
                }
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={rascunho.opcoes.length >= 6}
            onClick={() => mudar({ opcoes: [...rascunho.opcoes, ""] })}
          >
            <Plus className="w-4 h-4 mr-1" /> Adicionar alternativa
          </Button>
          <Input
            placeholder={dicaDoComentario}
            aria-label="Comentário da resposta"
            value={rascunho.comentario || ""}
            onChange={(e) => mudar({ comentario: e.target.value })}
            className="h-9"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onRascunho(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onSalvar} disabled={salvando}>
              Salvar questão
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

Run: `cd apps/web && npx vitest run src/components/seguranca/QuestoesEad.test.jsx`
Expected: PASS.

- [ ] **Step 11: Escrever o teste de contrato da aba (vai falhar)**

Crie `apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js`:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guardas de contrato das atividades interativas na aba Treinamentos (spec 2026-10-14, §5). A aba usa Sheet, Dialog
// e o cliente do backend, que não rodam sem DOM e sem produção: o que dá para travar é o texto do componente. A
// lógica está em lib/ead-aula-nova.js, lib/ead-impacto.js, lib/ead-curso-numeros.js e lib/ead-caso-edicao.js.
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const aba = ler("./TreinamentosEadTab.jsx");
const linha = ler("./AulaLinhaEad.jsx");

const funcao = (texto, nome) =>
  new RegExp(`const ${nome} = async[\\s\\S]*?\\n {2}\\};`).exec(texto)?.[0] ?? "";

describe("aba Treinamentos: atividades interativas (Task 16)", () => {
  it("requisitos e 'Ver como aluno' recebem os roteiros dos casos do curso", () => {
    expect(aba).toContain("sigo.entities.TreinamentoCaso.filter(filtro)");
    expect(aba.match(/casos: todosCasos\.filter\(\(c\) => c\.curso_id === curso\.id\)/g)).toHaveLength(
      2
    );
    expect(aba).toMatch(
      /<PreviaAlunoCurso[\s\S]*?casos=\{todosCasos\.filter\(\(c\) => c\.curso_id === cursoSel\.id\)\}/
    );
  });

  it("a avaliação final lista só as questões sem aula; o questionário, as da aula", () => {
    expect(aba).toContain("questoes={questoesSeparadas.prova}");
    expect(aba).toMatch(/Avaliação final \(\{questoesSeparadas\.prova\.length\}/);
    expect(aba).toContain("questoesSeparadas.porAula.get(questionarioAberto.id)");
  });

  it("questão nova do questionário grava a aula; a da prova, não", () => {
    const salvar = funcao(aba, "salvarQuestao");
    expect(salvar).toContain("...(aulaId ? { aula_id: aulaId } : {})");
    expect(salvar).toContain('aulaId ? "gabarito_questionario" : "gabarito"');
    expect(salvar).toContain("ordem: proximaOrdem(doGrupo)");
  });

  it("a nota mínima dos questionários vai pela regra, com o aviso de impacto", () => {
    const salvar = funcao(aba, "salvarCurso");
    expect(salvar).toContain(
      "nota_minima_modulo: notaMinimaDoModuloParaGravar(cursoSel.nota_minima_modulo),"
    );
    expect(salvar).toContain('confirmarImpacto("nota_minima_modulo"');
  });

  it("aula sem arquivo passa pela regra da lib; o caso abre o editor antes do aviso de aula nova", () => {
    const adicionar = funcao(aba, "adicionarAula");
    expect(adicionar).toContain("montarAulaSemArquivo(novaAula)");
    expect(adicionar).toMatch(/if \(novaAula\.tipo === "caso"\) \{\s*abrirCasoNovo\(/);
    expect(adicionar.indexOf("abrirCasoNovo(")).toBeLessThan(
      adicionar.indexOf('confirmarImpacto("aula_nova"')
    );
  });

  it("a edição da aula de texto e de tarefa grava o texto", () => {
    expect(funcao(aba, "salvarAulaEdicao")).toContain("camposDaEdicaoSemVideo(aulaEditando)");
    expect(aba).toMatch(/texto: a\.conteudo_texto \|\| ""/);
  });

  it("a linha da aula tem ícone e rótulo dos tipos novos e o menu Questões", () => {
    for (const icone of ["ListChecks", "GitBranch", "ClipboardList"]) {
      expect(linha).toContain(icone);
    }
    expect(linha).toContain("nomeDoTipoDeAula(tipo)");
    expect(linha).toContain("onQuestoes");
    expect(aba).toContain("onQuestoes={() => abrirQuestionario(a)}");
  });
});
```

Run: `cd apps/web && npx vitest run src/components/seguranca/TreinamentosEadTab.atividades.test.js`
Expected: FAIL nos 7 testes.

- [ ] **Step 12: `AulaLinhaEad.jsx` com os tipos novos**

Substitua `apps/web/src/components/seguranca/AulaLinhaEad.jsx` inteiro por:

```jsx
import React, { useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ClipboardList,
  FileText,
  GitBranch,
  ListChecks,
  MoreVertical,
  Pencil,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { videoSemDuracao } from "@/lib/ead-duracao";
import { ACCEPT_AULA, tipoDeArquivoDaAula } from "@/lib/ead-upload";
import { ehAtividade, nomeDoTipoDeAula } from "@/lib/ead-aula-nova";

// Setas de ordem: a cor está no botão (o ícone herda), então desabilitada (1ª/última aula ou
// gravação em andamento) ela esmaece e o hover não a escurece como se estivesse ativa.
const CLASSE_ICONE = "h-8 w-8 shrink-0 text-slate-400 hover:text-slate-800 hover:bg-slate-200";
const CLASSE_ICONE_DESABILITADO =
  "disabled:opacity-40 disabled:hover:text-slate-400 disabled:hover:bg-transparent disabled:cursor-not-allowed";

// ícone de cada tipo de aula (atividades interativas: questionário, caso e tarefa)
const ICONE_DO_TIPO = {
  video: Video,
  pdf: FileText,
  texto: BookOpen,
  questionario: ListChecks,
  caso: GitBranch,
  tarefa: ClipboardList,
};

/**
 * Linha de uma aula na lista do curso (T30). O título corta em até duas linhas, com reticências
 * (`line-clamp-2`), e os selos vão numa segunda linha, então a linha cabe em 360 px. Subir, descer e
 * editar ficam à vista; ver o arquivo, trocar o arquivo, legenda e remover ficam no menu "⋮".
 *
 * `aula.numero` vem de `numerarAulas`. Os arquivos escolhidos sobem pelas props `onTrocarArquivo`
 * e `onLegenda`; os seletores de arquivo ficam FORA do menu (o menu desmonta ao fechar e levaria o
 * seletor junto antes do `change`).
 *
 * Atividades interativas: questionário, caso e tarefa têm ícone e rótulo próprios. "Questões" (questionário,
 * `onQuestoes`) e "Editar caso" (caso, `onCaso`) ficam no menu e aparecem também sem Editar, só para ver.
 * `resumo` (ex.: "8 questões") e `pendencia` (ex.: "sem roteiro", em âmbar) vêm da tela (`situacaoDaAtividade`).
 * O tempo de PDF, texto e atividades é o previsto (soma na carga horária; A5: não decide a conclusão).
 */
export default function AulaLinhaEad({
  aula,
  primeira,
  ultima,
  ordemOcupada,
  envioEmCurso,
  onSubir,
  onDescer,
  onEditar,
  onVer,
  onRemover,
  onTrocarArquivo,
  onLegenda,
  onQuestoes,
  onCaso,
  resumo = null,
  pendencia = null,
  // T33: sem Treinamentos EAD → Editar a linha só mostra a aula (e "Ver"); quem protege é o banco
  somenteLeitura = false,
}) {
  const arquivoRef = useRef(null);
  const legendaRef = useRef(null);
  const tipo = aula.tipo || "video";
  const Icone = ICONE_DO_TIPO[tipo] ?? Video;
  const tipoArquivo = tipoDeArquivoDaAula(aula);
  const rotuloTipo = tipo === "pdf" ? "PDF" : "vídeo";
  const atividade = ehAtividade(tipo);
  const temArquivoParaVer = tipo === "video" || tipo === "pdf";
  const temQuestoes = tipo === "questionario" && typeof onQuestoes === "function";
  const temCaso = tipo === "caso" && typeof onCaso === "function";
  const temAcaoNoMenu = temArquivoParaVer || temQuestoes || temCaso;
  const temSelos =
    atividade ||
    (tipo !== "video" && aula.duracao_seg) ||
    videoSemDuracao(aula) ||
    (tipo === "video" && aula.legenda_ref) ||
    resumo ||
    pendencia;

  return (
    <div className="flex items-center gap-1 text-sm bg-slate-50 rounded p-2">
      <Icone className="w-4 h-4 mr-1 text-slate-400 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words" title={`${aula.numero}. ${aula.titulo}`}>
          {aula.numero}. {aula.titulo}
        </p>
        {temSelos && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {atividade && (
              <span className="text-xs font-medium text-slate-500">{nomeDoTipoDeAula(tipo)}</span>
            )}
            {tipo !== "video" && aula.duracao_seg ? (
              <span
                className="text-xs text-slate-400"
                title="Tempo previsto: soma na carga horária do curso"
              >
                {Math.round(aula.duracao_seg / 60)} min previstos
              </span>
            ) : null}
            {resumo && <span className="text-xs text-slate-400">{resumo}</span>}
            {pendencia && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 text-amber-700 border-amber-300"
                title="O aluno não consegue fazer esta aula enquanto isto não for resolvido."
              >
                {pendencia}
              </Badge>
            )}
            {videoSemDuracao(aula) && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 text-amber-700 border-amber-300"
                title="Vídeo sem duração cadastrada: o aluno não consegue concluir esta aula. Edite a aula e informe a duração (mm:ss)."
              >
                sem duração
              </Badge>
            )}
            {tipo === "video" && aula.legenda_ref && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0" title="Aula com legenda">
                CC
              </Badge>
            )}
          </div>
        )}
      </div>

      {!somenteLeitura && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Subir na ordem"
            aria-label={`Subir a aula ${aula.numero} na ordem`}
            disabled={primeira || ordemOcupada}
            onClick={onSubir}
            className={`${CLASSE_ICONE} ${CLASSE_ICONE_DESABILITADO}`}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Descer na ordem"
            aria-label={`Descer a aula ${aula.numero} na ordem`}
            disabled={ultima || ordemOcupada}
            onClick={onDescer}
            className={`${CLASSE_ICONE} ${CLASSE_ICONE_DESABILITADO}`}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Editar aula"
            aria-label={`Editar a aula ${aula.numero}`}
            onClick={onEditar}
            className={CLASSE_ICONE}
          >
            <Pencil />
          </Button>
        </>
      )}

      {(!somenteLeitura || temAcaoNoMenu) && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Mais ações"
              aria-label={`Mais ações da aula ${aula.numero}`}
              className={CLASSE_ICONE}
            >
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[9999] w-56">
            {temArquivoParaVer && (
              <DropdownMenuItem onSelect={onVer}>
                {tipo === "pdf" ? "Ver PDF" : "Ver vídeo"}
              </DropdownMenuItem>
            )}
            {temQuestoes && (
              <DropdownMenuItem onSelect={onQuestoes}>
                {somenteLeitura ? "Ver questões" : "Questões"}
              </DropdownMenuItem>
            )}
            {temCaso && (
              <DropdownMenuItem onSelect={onCaso}>
                {somenteLeitura ? "Ver caso" : "Editar caso"}
              </DropdownMenuItem>
            )}
            {!somenteLeitura && tipoArquivo && (
              <DropdownMenuItem
                disabled={envioEmCurso}
                onSelect={() => arquivoRef.current?.click()}
              >
                Trocar o arquivo ({rotuloTipo})
              </DropdownMenuItem>
            )}
            {!somenteLeitura && tipo === "video" && (
              <DropdownMenuItem onSelect={() => legendaRef.current?.click()}>
                {aula.legenda_ref ? "Trocar a legenda" : "Anexar legenda (.srt ou .vtt)"}
              </DropdownMenuItem>
            )}
            {!somenteLeitura && temAcaoNoMenu && <DropdownMenuSeparator />}
            {!somenteLeitura && (
              <DropdownMenuItem
                className="text-red-600 focus:bg-red-50 focus:text-red-700"
                onSelect={onRemover}
              >
                Remover aula
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {!somenteLeitura && tipoArquivo && (
        <input
          ref={arquivoRef}
          type="file"
          accept={ACCEPT_AULA[tipoArquivo]}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            if (arquivo) onTrocarArquivo(arquivo);
          }}
        />
      )}
      {!somenteLeitura && tipo === "video" && (
        <input
          ref={legendaRef}
          type="file"
          accept=".srt,.vtt"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            if (arquivo) onLegenda(arquivo);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 13: `TreinamentosEadTab.jsx` — imports, estado, cargas e requisitos**

13.1. Imports. Troque `import { normalizarQuestao } from "@/lib/ead-questao";` por:

```jsx
import { normalizarQuestao } from "@/lib/ead-questao";
import {
  TIPOS_DE_AULA,
  camposDaEdicaoSemVideo,
  montarAulaSemArquivo,
  proximaOrdem,
  rotuloDoTempo,
  segundosDosMinutos,
  separarQuestoes,
  situacaoDaAtividade,
} from "@/lib/ead-aula-nova";
import { novoCasoVazio } from "@/lib/ead-caso";
```

Logo depois de `import { notaMinimaParaGravar, validarNumerosDoCurso } from "@/lib/ead-curso-numeros";` (essa
linha fica como está: a guarda de `TreinamentosEadTab.acompanhamento.test.js` exige a importação numa linha só),
acrescente:

```jsx
// atividades interativas: a nota mínima dos questionários dos módulos (import à parte: a linha acima é travada
// pela guarda do acompanhamento A6/A7)
import { notaMinimaDoModuloParaGravar } from "@/lib/ead-curso-numeros";
```

No import de `@/lib/ead-impacto`, acrescente `mudouNotaMinimaDoModulo,` depois de `mudouNotaMinima,`. Depois de
`import AulaLinhaEad from "@/components/seguranca/AulaLinhaEad";` acrescente:

```jsx
import QuestoesEad from "@/components/seguranca/QuestoesEad";
```

Depois de `import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";` acrescente:

```jsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
```

No import de `lucide-react` (:122-134), retire `Trash2,` e `Pencil,` (só eram usados na lista de questões, que foi
para o `QuestoesEad`).

13.2. Estado. Depois de `const [todasQuestoes, setTodasQuestoes] = useState([]);` acrescente:

```jsx
  // roteiros dos casos com decisões (treinamento_caso) da empresa: requisitos, "Ver como aluno" e o editor do caso
  const [todosCasos, setTodosCasos] = useState([]);
  // diálogo "Questões" de um questionário do módulo: a aula aberta (ou null)
  const [questionarioAberto, setQuestionarioAberto] = useState(null);
  // editor do caso com decisões: null, { modo: "novo", dados, conteudo, ... } ou { modo: "editar", id, aula, ... }.
  // O diálogo é desenhado na Task 17; aqui nasce o estado e o `abrirCasoNovo` que a "Nova aula" chama.
  const [casoEditando, setCasoEditando] = useState(null);
```

13.3. `recarregar`. Troque:

```jsx
      const [cs, as, ms, fs, certs, tcfg, qs] = await Promise.all([
```

por:

```jsx
      const [cs, as, ms, fs, certs, tcfg, qs, casos] = await Promise.all([
```

acrescente, depois de `sigo.entities.TreinamentoQuestao.filter(filtro),`:

```jsx
        // atividades interativas: os roteiros dos casos (só quem tem a aba lê: policy restritiva da 0170)
        sigo.entities.TreinamentoCaso.filter(filtro),
```

e, depois de `setTodasQuestoes(qs);`:

```jsx
      setTodosCasos(casos);
```

13.4. Efeitos. Troque:

```jsx
  // fechou o editor (ou trocou de empresa): a prévia do curso não fica armada para o próximo
  useEffect(() => {
    if (!cursoSel?.id) setPreviaAberta(false);
  }, [cursoSel?.id]);
```

por:

```jsx
  // fechou o editor (ou trocou de empresa): a prévia do curso não fica armada para o próximo, e os diálogos de
  // questões do questionário e do caso eram do curso que estava aberto
  useEffect(() => {
    if (!cursoSel?.id) setPreviaAberta(false);
    setQuestionarioAberto(null);
    setCasoEditando(null);
  }, [cursoSel?.id]);
```

e, no efeito da troca de empresa, depois de `setAulaEditando(null);`:

```jsx
    setQuestionarioAberto(null);
    setCasoEditando(null);
```

13.5. Requisitos. Troque:

```jsx
  const requisitos = (curso) =>
    requisitosDoCurso({
      curso,
      aulas: aulasDoCurso(curso.id),
      questoes: todasQuestoes.filter((q) => q.curso_id === curso.id),
    });
```

por:

```jsx
  // `questoes` são TODAS as do curso (a prova final é a sem `aula_id`) e `casos` os roteiros: o requisito
  // CONTEUDO confere questionário e caso (atividades interativas, Task 5)
  const requisitos = (curso) =>
    requisitosDoCurso({
      curso,
      aulas: aulasDoCurso(curso.id),
      questoes: todasQuestoes.filter((q) => q.curso_id === curso.id),
      casos: todosCasos.filter((c) => c.curso_id === curso.id),
    });
```

Em `cursoMatriculavel`, troque:

```jsx
        requisitosDoCurso({
          curso,
          aulas: aulas.filter((a) => a.curso_id === curso.id),
          questoes: todasQuestoes.filter((q) => q.curso_id === curso.id),
        })
      );
      return pendencias.length ? "Curso com pendências para publicar" : null;
    },
    [aulas, todasQuestoes]
  );
```

por:

```jsx
        requisitosDoCurso({
          curso,
          aulas: aulas.filter((a) => a.curso_id === curso.id),
          questoes: todasQuestoes.filter((q) => q.curso_id === curso.id),
          casos: todosCasos.filter((c) => c.curso_id === curso.id),
        })
      );
      return pendencias.length ? "Curso com pendências para publicar" : null;
    },
    [aulas, todasQuestoes, todosCasos]
  );
```

Logo depois de `const pendenciasCurso = (curso) => pendenciasParaPublicar(requisitos(curso));` acrescente:

```jsx
  // questões do curso aberto: as da avaliação final (sem aula) e as de cada questionário do módulo (com a aula)
  const questoesSeparadas = useMemo(() => separarQuestoes(questoes), [questoes]);
  // o roteiro de cada aula de caso (o requisito, o selo "sem roteiro" e o editor do caso)
  const casoPorAula = useMemo(() => new Map(todosCasos.map((c) => [c.aula_id, c])), [todosCasos]);
```

- [ ] **Step 14: `TreinamentosEadTab.jsx` — curso, nova aula, edição e questões**

14.1. `salvarCurso`. Troque:

```jsx
      // 0 continua 0 (campo vazio vale 70), como no servidor (A7)
      nota_minima: notaMinimaParaGravar(cursoSel.nota_minima),
```

por:

```jsx
      // 0 continua 0 (campo vazio vale 70), como no servidor (A7)
      nota_minima: notaMinimaParaGravar(cursoSel.nota_minima),
      // questionários dos módulos (atividades interativas): campo vazio vale 80, o padrão da coluna (0170)
      nota_minima_modulo: notaMinimaDoModuloParaGravar(cursoSel.nota_minima_modulo),
```

e, logo depois do bloco que confirma o impacto da `nota_minima` (o `if` que termina em `return;` e `}` antes de
`await gravar("curso", ...`), acrescente:

```jsx
    // nota mínima dos questionários dos módulos: o mesmo aviso, para as próximas tentativas deles
    if (
      Object.hasOwn(paraGravar, "nota_minima_modulo") &&
      mudouNotaMinimaDoModulo(gravado, paraGravar.nota_minima_modulo) &&
      !(await confirmarImpacto("nota_minima_modulo", { cursoId: cursoSel.id }))
    ) {
      return;
    }
```

14.2. `adicionarAula`. Substitua a função inteira (de `const adicionarAula = async () => {` até o `};` que a fecha,
:769-886) por estas duas funções:

```jsx
  // Caso com decisões: a aula só nasce junto com o roteiro, no "Salvar caso" do editor (Task 17). `dados` é a linha
  // da aula como será gravada (empresa, curso, ordem, título, módulo, tipo e tempo previsto).
  const abrirCasoNovo = (dados) =>
    setCasoEditando(
      novoRascunho({ modo: "novo", dados, conteudo: novoCasoVazio(), casoId: null, original: null })
    );

  const adicionarAula = async () => {
    if (envioRef.current) return; // um envio por vez (o botão também fica desabilitado)
    if (!cursoSel?.id) {
      toast.error("Salve o curso antes de adicionar aulas");
      return;
    }
    if (!novaAula.titulo.trim()) {
      toast.error("Informe o título da aula");
      return;
    }
    const empresaId = empresaAtiva.id;
    const cursoId = cursoSel.id;
    const ordem = Math.max(0, ...aulasDoCurso(cursoId).map((a) => a.ordem || 0)) + 1;
    const base = {
      empresa_id: empresaId,
      curso_id: cursoId,
      ordem,
      titulo: novaAula.titulo.trim(),
      modulo: novaAula.modulo.trim() || null,
      tipo: novaAula.tipo,
    };
    // texto, questionário, caso e tarefa não sobem arquivo: o tempo previsto e o texto são conferidos pela regra
    // de lib/ead-aula-nova.js (atividades interativas)
    const semArquivo =
      novaAula.tipo === "video" || novaAula.tipo === "pdf" ? null : montarAulaSemArquivo(novaAula);
    if (semArquivo && !semArquivo.ok) {
      toast.error(semArquivo.erro);
      return;
    }
    if (novaAula.tipo === "caso") {
      abrirCasoNovo({ ...base, ...semArquivo.dados });
      return;
    }
    // PDF: o tempo previsto de leitura soma na carga horária; a conclusão não depende dele (A5)
    const tempoPrevisto = segundosDosMinutos(novaAula.minutos);

    // Tudo o que dá para conferir sem gravar nada vem antes de subir qualquer arquivo (T30)
    let youtube = null;
    if (novaAula.tipo === "pdf") {
      if (!tempoPrevisto) {
        toast.error("Informe o tempo previsto de leitura (minutos)");
        return;
      }
      if (!novaAula.arquivo) {
        toast.error("Anexe o PDF da aula");
        return;
      }
    } else if (novaAula.tipo === "video" && !novaAula.arquivo) {
      const ytId = extrairYouTubeId(novaAula.url);
      if (!ytId) {
        toast.error("Anexe o vídeo OU informe um link válido do YouTube");
        return;
      }
      const duracao_seg = parseDuracao(novaAula.duracao);
      if (!duracao_seg) {
        toast.error("Informe a duração do vídeo em mm:ss");
        return;
      }
      youtube = { ytId, duracao_seg };
    }
    const arquivo = semArquivo ? null : novaAula.arquivo;
    if (arquivo) {
      const valido = validarArquivoAula(arquivo, novaAula.tipo === "pdf" ? "pdf" : "video");
      if (!valido.ok) {
        toast.error(valido.erro);
        return;
      }
    }
    if (!(await confirmarImpacto("aula_nova", { cursoId }))) return;
    if (envioRef.current) return; // outro envio começou enquanto o aviso estava na tela

    const controle = iniciarEnvio("nova", arquivo);
    try {
      let dados;
      if (semArquivo) {
        // texto, questionário e tarefa: só a gravação (o questionário nasce vazio; as questões vêm depois)
        dados = semArquivo.dados;
      } else if (novaAula.tipo === "pdf") {
        const arquivo_ref = await subirArquivo(controle, arquivo);
        mudarFaseDoEnvio("gravando");
        dados = {
          fonte: "upload",
          youtube_id: null,
          arquivo_ref,
          conteudo_texto: null,
          duracao_seg: tempoPrevisto,
        };
      } else if (arquivo) {
        // HOSPEDAGEM PRÓPRIA: vídeo sobe pro bucket 'treinamentos' (até 1GB)
        mudarFaseDoEnvio("lendo");
        const duracao_seg = await lerDuracaoVideo(arquivo);
        mudarFaseDoEnvio("enviando");
        const video_ref = await subirArquivo(controle, arquivo);
        mudarFaseDoEnvio("gravando");
        dados = { fonte: "upload", video_ref, youtube_id: null, duracao_seg };
      } else {
        dados = { fonte: "youtube", youtube_id: youtube.ytId, duracao_seg: youtube.duracao_seg };
      }
      await sigo.entities.TreinamentoAula.create({ ...base, ...dados });
      // mantém o módulo para a próxima aula do mesmo bloco, a menos que a tela já seja outra durante o
      // envio: empresa diferente (o formulário já foi limpo e o módulo é da empresa anterior) ou OUTRO
      // curso aberto (o formulário é compartilhado e tem o que o RH digitou lá: não é sobrescrito)
      if (
        formularioDeAulaSegueOMesmo({
          mesmaEmpresa: cargas.mesmaEmpresa(empresaId),
          cursoAberto: cursoSelRef.current,
          cursoDoEnvio: cursoSel,
        })
      ) {
        setNovaAula({ ...NOVA_AULA, modulo: novaAula.modulo, tipo: novaAula.tipo });
      }
      toast.success(
        novaAula.tipo === "questionario"
          ? "Questionário adicionado: cadastre as questões em “Questões”, no menu da aula"
          : "Aula adicionada"
      );
      recarregar();
    } catch (e) {
      if (e?.cancelado) toast.info("Envio cancelado. Nenhuma aula foi criada.");
      else toast.error("Erro ao adicionar aula: " + (e?.message || e));
    } finally {
      encerrarEnvio(controle);
    }
  };
```

14.3. `abrirEdicaoAula`. Depois de `modulo: a.modulo || "",` acrescente:

```jsx
      // texto e tarefa: o texto da aula também é editado na tela (§5.2)
      texto: a.conteudo_texto || "",
```

14.4. `salvarAulaEdicao`. Troque:

```jsx
    if (!ehVideo) {
      const seg = Math.round(Number(aulaEditando.minutos || 0) * 60);
      if (!seg) {
        toast.error("Informe o tempo mínimo de leitura (minutos)");
        return;
      }
      patch.duracao_seg = seg;
    } else {
```

por:

```jsx
    if (!ehVideo) {
      // PDF, texto e atividades: o tempo previsto (soma na carga horária, A5); texto e tarefa levam também o
      // texto, que antes só se corrigia por SQL (§5.2)
      const campos = camposDaEdicaoSemVideo(aulaEditando);
      if (!campos.ok) {
        toast.error(campos.erro);
        return;
      }
      Object.assign(patch, campos.patch);
    } else {
```

e troque:

```jsx
    // vídeo ou tempo novo com alunos no meio desta aula: o RH vê quantos antes de salvar (T30)
    const mudouVideo = !!patch.youtube_id;
    const mudouTempo = !!original && patch.duracao_seg !== (Number(original.duracao_seg) || 0);
    if (
      original &&
      (mudouVideo || mudouTempo) &&
      !(await confirmarImpacto(mudouVideo ? "aula_trocar" : "aula_duracao", {
```

por:

```jsx
    // vídeo, texto ou tempo novo com alunos no meio desta aula: o RH vê quantos antes de salvar (T30). Fora do
    // vídeo, o tempo novo não afeta o aluno (A5) e não pede confirmação (lib/ead-impacto.js)
    const mudouVideo = !!patch.youtube_id;
    const mudouTexto =
      Object.hasOwn(patch, "conteudo_texto") &&
      patch.conteudo_texto !== String(original?.conteudo_texto ?? "").trim();
    const mudouTempo = !!original && patch.duracao_seg !== (Number(original.duracao_seg) || 0);
    if (
      original &&
      (mudouVideo || mudouTexto || mudouTempo) &&
      !(await confirmarImpacto(mudouVideo || mudouTexto ? "aula_trocar" : "aula_duracao", {
```

14.5. Questões. Substitua `salvarQuestao` e `excluirQuestao` inteiras (:1326-1378) por:

```jsx
  const salvarQuestao = async () => {
    const resultado = normalizarQuestao(novaQuestao);
    if (!resultado.ok) {
      toast.error(resultado.erro);
      return;
    }
    const dados = resultado.dados;
    const aberta = novaQuestao; // o formulário que o RH mandou salvar
    // a questão é da avaliação final (sem aula) ou do questionário de um módulo (com a aula)
    const aulaId = aberta.aula_id || null;
    const doGrupo = aulaId
      ? (questoesSeparadas.porAula.get(aulaId) ?? [])
      : questoesSeparadas.prova;
    // gabarito diferente com alunos no meio do curso: o RH vê quantos antes de salvar (T30)
    if (
      aberta.id &&
      mudouGabarito(
        doGrupo.find((q) => q.id === aberta.id),
        dados
      ) &&
      !(await confirmarImpacto(aulaId ? "gabarito_questionario" : "gabarito", {
        cursoId: cursoSel.id,
      }))
    ) {
      return;
    }
    // falhou: o formulário continua aberto, com o que o RH digitou
    await gravar("questao", "Erro ao salvar a questão", async () => {
      if (aberta.id) {
        await sigo.entities.TreinamentoQuestao.update(aberta.id, dados);
      } else {
        await sigo.entities.TreinamentoQuestao.create({
          ...dados,
          empresa_id: empresaAtiva.id,
          curso_id: cursoSel.id,
          // só a questão do questionário leva a aula; a da avaliação final fica sem (aula_id vazio = prova)
          ...(aulaId ? { aula_id: aulaId } : {}),
          ordem: proximaOrdem(doGrupo),
        });
      }
      // fecha só o formulário que foi gravado (outro, aberto durante a gravação, fica como está)
      setNovaQuestao((atual) => (mesmoFormulario(atual, aberta) ? null : atual));
      carregarQuestoes(cursoSel.id);
    });
  };

  const excluirQuestao = async (q) => {
    const onde = q.aula_id ? "do questionário" : "da avaliação";
    const confirmado = await confirmar({
      titulo: "Excluir esta questão?",
      texto: q.pergunta
        ? `Excluir ${onde} a questão "${resumoDaPergunta(q.pergunta)}"?`
        : `Excluir esta questão ${onde}?`,
      rotuloConfirmar: "Excluir questão",
      destrutivo: true,
    });
    if (!confirmado) return;
    await gravar(`excluir-questao-${q.id}`, "Erro ao excluir a questão", async () => {
      await sigo.entities.TreinamentoQuestao.delete(q.id);
      setNovaQuestao((atual) => (atual?.id === q.id ? null : atual));
      carregarQuestoes(cursoSel.id);
    });
  };

  // "Questões" de um questionário do módulo: a mesma lista e o mesmo editor da avaliação final, com as questões
  // daquela aula. Um rascunho de OUTRO questionário fecha; o da avaliação final fica.
  const abrirQuestionario = (aula) => {
    setNovaQuestao((atual) => (atual?.aula_id && atual.aula_id !== aula.id ? null : atual));
    setQuestionarioAberto(aula);
  };
  const fecharQuestionario = () => {
    setQuestionarioAberto(null);
    setNovaQuestao((atual) => (atual?.aula_id ? null : atual));
  };
```

- [ ] **Step 15: `TreinamentosEadTab.jsx` — o desenho**

15.1. Formulário do curso. Logo depois do `</div>` que fecha o campo "Nota mínima da avaliação (%)" (:2047),
acrescente:

```jsx
                  <div className="col-span-2">
                    <Label htmlFor="curso-nota-minima-modulo" className="text-xs">
                      Nota mínima dos questionários dos módulos (%)
                    </Label>
                    <Input
                      id="curso-nota-minima-modulo"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={cursoSel.nota_minima_modulo ?? 80}
                      onChange={(e) =>
                        setCursoSel({ ...cursoSel, nota_minima_modulo: e.target.value })
                      }
                      className="mt-0.5 sm:max-w-[12rem]"
                    />
                    <p className="text-xs text-slate-500 mt-0.5">
                      Vale para os questionários dos módulos (estudo guiado: tentativas livres, com a
                      correção comentada). A avaliação final usa a nota mínima acima.
                    </p>
                  </div>
```

15.2. Lista de aulas. No `map` de `numerarAulas(aulasDoCurso(cursoSel.id))`, troque:

```jsx
                      const novoModulo = a.modulo && a.modulo !== lista[i - 1]?.modulo;
                      return (
```

por:

```jsx
                      const novoModulo = a.modulo && a.modulo !== lista[i - 1]?.modulo;
                      // selos das atividades: quantas questões, ou o que falta para o aluno conseguir fazer
                      const situacao = situacaoDaAtividade(a, {
                        questoes: questoesSeparadas.porAula.get(a.id) ?? [],
                        temRoteiro: casoPorAula.has(a.id),
                      });
                      return (
```

e, no `<AulaLinhaEad`, troque:

```jsx
                            somenteLeitura={!pode.editar}
                            onSubir={() => moverAula(a, -1)}
```

por:

```jsx
                            somenteLeitura={!pode.editar}
                            resumo={situacao.resumo}
                            pendencia={situacao.pendencia}
                            onSubir={() => moverAula(a, -1)}
```

e:

```jsx
                            onLegenda={(arquivo) => enviarLegenda(a, arquivo)}
                          />
```

por:

```jsx
                            onLegenda={(arquivo) => enviarLegenda(a, arquivo)}
                            onQuestoes={() => abrirQuestionario(a)}
                          />
```

15.3. Edição da aula. Troque o campo de tempo das aulas que não são vídeo:

```jsx
                                {aulaEditando.tipo !== "video" && (
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="Tempo mín. de leitura (min)"
                                    value={aulaEditando.minutos}
                                    onChange={(e) =>
                                      setAulaEditando({ ...aulaEditando, minutos: e.target.value })
                                    }
                                    className="h-9"
                                  />
                                )}
```

por:

```jsx
                                {aulaEditando.tipo !== "video" && (
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder={rotuloDoTempo(aulaEditando.tipo)}
                                    aria-label={rotuloDoTempo(aulaEditando.tipo)}
                                    value={aulaEditando.minutos}
                                    onChange={(e) =>
                                      setAulaEditando({ ...aulaEditando, minutos: e.target.value })
                                    }
                                    className="h-9"
                                  />
                                )}
                                {(aulaEditando.tipo === "texto" || aulaEditando.tipo === "tarefa") && (
                                  <Textarea
                                    rows={6}
                                    placeholder={
                                      aulaEditando.tipo === "tarefa"
                                        ? "Instruções da atividade e o que o aluno deve produzir"
                                        : "Texto da aula"
                                    }
                                    aria-label={
                                      aulaEditando.tipo === "tarefa"
                                        ? "Instruções da atividade"
                                        : "Texto da aula"
                                    }
                                    value={aulaEditando.texto}
                                    onChange={(e) =>
                                      setAulaEditando({ ...aulaEditando, texto: e.target.value })
                                    }
                                    className="col-span-2"
                                  />
                                )}
```

15.4. "Nova aula". Substitua o trecho que vai de `{pode.editar && (` + `<div className="space-y-2 rounded-lg border
border-dashed p-3">` (:2390-2391) até o `)}` que fecha `{novaAula.tipo !== "video" && (` (:2498), inclusive, por o
trecho abaixo. O bloco `{novaAula.tipo === "video" && (...)}`, o `EnvioProgressoEad` e o fechamento da `div` (:2499
em diante) ficam como estão.

```jsx
                    {pode.editar && (
                      <div className="space-y-2 rounded-lg border border-dashed p-3">
                        <p className="text-xs font-medium text-slate-600">Nova aula</p>
                        <Input
                          placeholder="Módulo (ex.: B04 · Medidas de controle)"
                          aria-label="Módulo da aula"
                          value={novaAula.modulo}
                          onChange={(e) => setNovaAula({ ...novaAula, modulo: e.target.value })}
                          list="modulos-curso"
                          className="h-9"
                        />
                        <datalist id="modulos-curso">
                          {[
                            ...new Set(
                              aulasDoCurso(cursoSel.id)
                                .map((a) => a.modulo)
                                .filter(Boolean)
                            ),
                          ].map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                        {/* vídeo, PDF e texto e as atividades interativas (questionário, caso e tarefa) */}
                        <div
                          role="group"
                          aria-label="Tipo da aula"
                          className="grid grid-cols-3 overflow-hidden rounded-md border text-sm sm:grid-cols-6"
                        >
                          {TIPOS_DE_AULA.map(({ valor, rotulo }) => (
                            <button
                              key={valor}
                              type="button"
                              aria-pressed={novaAula.tipo === valor}
                              onClick={() => setNovaAula({ ...novaAula, tipo: valor, arquivo: null })}
                              className={`py-1.5 ${
                                novaAula.tipo === valor
                                  ? "bg-slate-900 text-white"
                                  : "bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {rotulo}
                            </button>
                          ))}
                        </div>
                        <Input
                          placeholder="Título da aula"
                          value={novaAula.titulo}
                          onChange={(e) => setNovaAula({ ...novaAula, titulo: e.target.value })}
                          className="h-9"
                        />
                        {novaAula.tipo !== "video" && (
                          <div className="space-y-2">
                            {novaAula.tipo === "pdf" && (
                              <label className="h-9 flex items-center gap-2 px-3 rounded-md border border-slate-200 text-sm text-slate-600 cursor-pointer hover:border-slate-400 truncate">
                                <FileText className="w-4 h-4 shrink-0" />
                                <span className="truncate">
                                  {novaAula.arquivo
                                    ? novaAula.arquivo.name
                                    : "Anexar PDF da aula (até 100 MB)"}
                                </span>
                                <input
                                  type="file"
                                  accept={ACCEPT_AULA.pdf}
                                  className="hidden"
                                  onChange={(e) =>
                                    setNovaAula({
                                      ...novaAula,
                                      arquivo: e.target.files?.[0] || null,
                                    })
                                  }
                                />
                              </label>
                            )}
                            {(novaAula.tipo === "texto" || novaAula.tipo === "tarefa") && (
                              <Textarea
                                rows={5}
                                placeholder={
                                  novaAula.tipo === "tarefa"
                                    ? "Instruções da atividade e o que o aluno deve produzir"
                                    : "Texto da aula"
                                }
                                aria-label={
                                  novaAula.tipo === "tarefa"
                                    ? "Instruções da atividade"
                                    : "Texto da aula"
                                }
                                value={novaAula.texto}
                                onChange={(e) =>
                                  setNovaAula({ ...novaAula, texto: e.target.value })
                                }
                              />
                            )}
                            {novaAula.tipo === "questionario" && (
                              <p className="text-xs text-slate-500">
                                O questionário nasce vazio: depois de adicionar, cadastre as questões em
                                “Questões”, no menu da aula. O aluno conclui com a nota mínima dos
                                questionários dos módulos (campo do curso).
                              </p>
                            )}
                            {novaAula.tipo === "caso" && (
                              <p className="text-xs text-slate-500">
                                Informe o título e o tempo previsto e clique em + para escrever o caso:
                                etapas, escolhas, comentários e a reflexão do fim.
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                placeholder={rotuloDoTempo(novaAula.tipo)}
                                aria-label={rotuloDoTempo(novaAula.tipo)}
                                value={novaAula.minutos}
                                onChange={(e) =>
                                  setNovaAula({ ...novaAula, minutos: e.target.value })
                                }
                                className="h-9"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                title="Adicionar aula"
                                aria-label="Adicionar aula"
                                onClick={adicionarAula}
                                disabled={!!envio}
                              >
                                {envio?.alvo === "nova" ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Plus className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        )}
```

15.5. Nota de rodapé das aulas. Troque o parágrafo:

```jsx
                    <p className="text-xs text-slate-400">
                      Aulas abrem em ordem. Vídeo conclui com 90% do tempo assistido (a duração é
                      cadastrada pelo RH); PDF e texto, com o tempo mínimo de leitura. O tempo só
                      conta com a tela do aluno aberta.
                    </p>
```

por:

```jsx
                    <p className="text-xs text-slate-400">
                      Aulas abrem em ordem. Vídeo conclui com 90% do tempo assistido (a duração é
                      cadastrada pelo RH). PDF, texto e atividade de estudo concluem quando o aluno chega
                      ao fim e confirma; o questionário, com a nota mínima dos questionários; o caso, ao
                      chegar ao fim do roteiro. O tempo previsto de cada aula soma na carga horária, e o
                      tempo de tela fica na trilha.
                    </p>
```

15.6. Avaliação final. Substitua o bloco inteiro de `{/* Avaliação final */}` até o `</div>` que fecha
`<div className="border-t pt-3 mt-3 space-y-2">` (:2591-2761) por:

```jsx
                    {/* Avaliação final: só as questões sem aula (as dos questionários ficam em cada um deles) */}
                    <div className="border-t pt-3 mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-slate-800">
                          Avaliação final ({questoesSeparadas.prova.length} questão(ões))
                        </h4>
                        {pode.editar && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setNovaQuestao(
                                novoRascunho({ pergunta: "", opcoes: ["", "", "", ""], correta: 0 })
                              )
                            }
                          >
                            <Plus className="w-4 h-4 mr-1" /> Questão
                          </Button>
                        )}
                      </div>
                      <QuestoesEad
                        questoes={questoesSeparadas.prova}
                        rascunho={novaQuestao && !novaQuestao.aula_id ? novaQuestao : null}
                        onRascunho={setNovaQuestao}
                        onSalvar={salvarQuestao}
                        onExcluir={excluirQuestao}
                        salvando={gravando.has("questao")}
                        podeEditar={pode.editar}
                        grupo="correta-prova"
                        dicaDoComentario="Comentário da resposta (aparece só depois da aprovação)"
                      />
                      <p className="text-xs text-slate-400">
                        Com questões cadastradas, o funcionário só conclui o curso depois de concluir
                        todas as aulas (as atividades inclusive) E ser aprovado na avaliação final (nota
                        mínima acima). As questões dos questionários dos módulos ficam em cada
                        questionário e não entram nesta prova.
                      </p>
                    </div>
```

15.7. "Ver como aluno". No `<PreviaAlunoCurso`, depois de
`questoes={todasQuestoes.filter((q) => q.curso_id === cursoSel.id)}`, acrescente:

```jsx
                  casos={todosCasos.filter((c) => c.curso_id === cursoSel.id)}
```

15.8. Diálogo "Questões" do questionário. Logo antes de `{dialogoConfirmar}` (:2797), acrescente:

```jsx
      {/* "Questões" de um questionário do módulo (atividades interativas): a lista e o editor da avaliação final */}
      <Dialog open={!!questionarioAberto} onOpenChange={(aberto) => !aberto && fecharQuestionario()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Questões do questionário</DialogTitle>
            <DialogDescription>
              {questionarioAberto?.titulo}. A cada tentativa o servidor sorteia a ordem das questões e
              das alternativas; o aluno conclui com{" "}
              {notaMinimaDoModuloParaGravar(cursoSel?.nota_minima_modulo)}% ou mais e vê a correção
              comentada depois de cada envio.
            </DialogDescription>
          </DialogHeader>
          {questionarioAberto && (
            <div className="space-y-2">
              {pode.editar && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setNovaQuestao(
                        novoRascunho({
                          pergunta: "",
                          opcoes: ["", "", "", ""],
                          correta: 0,
                          aula_id: questionarioAberto.id,
                        })
                      )
                    }
                  >
                    <Plus className="w-4 h-4 mr-1" /> Questão
                  </Button>
                </div>
              )}
              <QuestoesEad
                questoes={questoesSeparadas.porAula.get(questionarioAberto.id) ?? []}
                rascunho={novaQuestao?.aula_id === questionarioAberto.id ? novaQuestao : null}
                onRascunho={setNovaQuestao}
                onSalvar={salvarQuestao}
                onExcluir={excluirQuestao}
                salvando={gravando.has("questao")}
                podeEditar={pode.editar}
                grupo={`correta-${questionarioAberto.id}`}
                dicaDoComentario="Comentário da resposta (o aluno vê na correção, depois de cada envio)"
                vazio="Nenhuma questão ainda. Sem questões o aluno não consegue fazer esta aula."
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
```

- [ ] **Step 16: Rodar os testes da task**

Run: `cd apps/web && npx vitest run src/components/seguranca/TreinamentosEadTab.atividades.test.js src/components/seguranca/MatriculaAuditoriaSheet.test.js src/components/seguranca/TreinamentosEadTab.permissoes.test.js src/components/seguranca/TreinamentosEadTab.projeto.test.js src/lib/ead-curso-numeros.test.js src/components/seguranca/QuestoesEad.test.jsx src/lib/ead-aula-nova.test.js`
Expected: PASS (inclusive as guardas antigas: "nova aula depois de um envio lento (A2)" — um só `setNovaAula(` em
`adicionarAula` —, "aulas, nova aula, questões e sessões práticas só com Editar" e as do projeto pedagógico).

- [ ] **Step 17: Checagens**

```bash
npx prettier --write apps/web/src/lib/ead-aula-nova.js apps/web/src/lib/ead-aula-nova.test.js apps/web/src/lib/ead-impacto.js apps/web/src/lib/ead-impacto.test.js apps/web/src/lib/ead-curso-numeros.js apps/web/src/lib/ead-curso-numeros.test.js apps/web/src/lib/ead-projeto.js apps/web/src/lib/ead-projeto.test.js apps/web/src/components/seguranca/QuestoesEad.jsx apps/web/src/components/seguranca/QuestoesEad.test.jsx apps/web/src/components/seguranca/AulaLinhaEad.jsx apps/web/src/components/seguranca/TreinamentosEadTab.jsx apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js
npx prettier --check apps/web/src/lib/ead-aula-nova.js apps/web/src/lib/ead-aula-nova.test.js apps/web/src/lib/ead-impacto.js apps/web/src/lib/ead-impacto.test.js apps/web/src/lib/ead-curso-numeros.js apps/web/src/lib/ead-curso-numeros.test.js apps/web/src/lib/ead-projeto.js apps/web/src/lib/ead-projeto.test.js apps/web/src/components/seguranca/QuestoesEad.jsx apps/web/src/components/seguranca/QuestoesEad.test.jsx apps/web/src/components/seguranca/AulaLinhaEad.jsx apps/web/src/components/seguranca/TreinamentosEadTab.jsx apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js
(cd apps/web && npx eslint --rule "no-undef: error" src/components/seguranca/TreinamentosEadTab.jsx src/components/seguranca/AulaLinhaEad.jsx src/components/seguranca/QuestoesEad.jsx)
npm run lint
npm run build
npm test --workspace=apps/web
node --test "supabase/functions/**/*.test.ts"
```

Expected: prettier OK; ESLint sem erros (atenção a `Trash2`/`Pencil` sobrando no import da aba: o
`unused-imports/no-unused-imports` acusa; o aviso de `casoEditando` sem leitura é só aviso e some na Task 17, que
desenha o diálogo do caso); build OK; Vitest com cerca de **+38 testes** (3 arquivos novos) em relação à Task 15, 0
falhas; `node --test` sem mudança. Se a guarda A2 acusar mais de um `setNovaAula(` em `adicionarAula`, o trecho foi
colado com uma cópia a mais.

- [ ] **Step 18: Commit**

```bash
git add apps/web/src/lib/ead-aula-nova.js apps/web/src/lib/ead-aula-nova.test.js apps/web/src/lib/ead-impacto.js apps/web/src/lib/ead-impacto.test.js apps/web/src/lib/ead-curso-numeros.js apps/web/src/lib/ead-curso-numeros.test.js apps/web/src/lib/ead-projeto.js apps/web/src/lib/ead-projeto.test.js apps/web/src/components/seguranca/QuestoesEad.jsx apps/web/src/components/seguranca/QuestoesEad.test.jsx apps/web/src/components/seguranca/AulaLinhaEad.jsx apps/web/src/components/seguranca/TreinamentosEadTab.jsx apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js
git status --short && git diff --staged --stat
git commit -F - -- apps/web/src/lib/ead-aula-nova.js apps/web/src/lib/ead-aula-nova.test.js apps/web/src/lib/ead-impacto.js apps/web/src/lib/ead-impacto.test.js apps/web/src/lib/ead-curso-numeros.js apps/web/src/lib/ead-curso-numeros.test.js apps/web/src/lib/ead-projeto.js apps/web/src/lib/ead-projeto.test.js apps/web/src/components/seguranca/QuestoesEad.jsx apps/web/src/components/seguranca/QuestoesEad.test.jsx apps/web/src/components/seguranca/AulaLinhaEad.jsx apps/web/src/components/seguranca/TreinamentosEadTab.jsx apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js <<'EOF'
feat(ead): tela do RH com questionário, caso e tarefa como aulas

A "Nova aula" ganha os tipos questionário (nasce vazio), caso (abre o editor) e tarefa; a
edição passa a gravar o texto das aulas de texto e de tarefa (antes só por SQL). O curso
ganha a nota mínima dos questionários dos módulos (padrão 80), cada questionário tem o seu
diálogo de questões (gravando aula_id) e a avaliação final lista só as questões sem aula.
Requisitos e "Ver como aluno" passam a receber os roteiros dos casos. O projeto pedagógico
conta só as questões da prova final e lista as atividades; o aviso de tempo deixa de valer
fora do vídeo (A5).

Produção: nenhuma nesta task (vai junto com o push do fim do plano).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 17: Editor do caso com decisões

**Files:**

- Create: `apps/web/src/lib/ead-caso-edicao.js`, `apps/web/src/lib/ead-caso-edicao.test.js`
- Create: `apps/web/src/components/seguranca/CasoEditor.jsx`, `apps/web/src/components/seguranca/CasoEditor.test.jsx`
- Modify: `apps/web/src/components/seguranca/TreinamentosEadTab.jsx` (imports; `abrirCasoDaAula` e `salvarCaso`
  logo depois de `adicionarAula`; `problemasDoCaso` depois de `casoPorAula`; `onCaso` no `<AulaLinhaEad`; diálogo do
  caso depois do diálogo "Questões do questionário" criado na Task 16)
- Modify: `apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js` (`describe` novo no fim)

**Interfaces:**

- Consumes: `LIMITES_CASO`, `validarCaso`, `novoCasoVazio`, `proximoIdDeEtapa` de `lib/ead-caso.js` (C3, Task 2);
  `avisoDeMudanca("caso_alterar", ...)` e o estado `casoEditando`/`abrirCasoNovo`/`casoPorAula` da Task 16;
  `<AulaLinhaEad onCaso />` (Task 16); entidades `TreinamentoAula` e `TreinamentoCaso` (C1: `empresa_id`,
  `curso_id`, `aula_id`, `conteudo`).
- Produces:
  - `lib/ead-caso-edicao.js`: `FIM = "__fim__"`, `casoParaEditar(conteudo)`, `adicionarEtapa(conteudo)`,
    `removerEtapa(conteudo, indice)`, `renomearEtapa(conteudo, indice, novoId): { ok: true, conteudo } |
    { ok: false, erro }`, `alterarPergunta(conteudo, indice, pergunta)`, `adicionarOpcao(conteudo, indiceEtapa)`,
    `removerOpcao(conteudo, indiceEtapa, indiceOpcao)`, `alterarOpcao(conteudo, indiceEtapa, indiceOpcao, campos)`,
    `destinosDoCaso(conteudo): string[]`, `casoMudou(a, b): boolean`. Todas devolvem um roteiro NOVO no formato C3.
  - `<CasoEditor valor onChange desabilitado />` (C6): controlado; mostra os problemas de `validarCaso(valor)`;
    quem usa desabilita o "Salvar" com a mesma conta (`validarCaso(valor).length > 0`).

- [ ] **Step 1: Escrever os testes das operações de edição (vão falhar)**

Crie `apps/web/src/lib/ead-caso-edicao.test.js`:

```js
import { describe, it, expect } from "vitest";
import { LIMITES_CASO, novoCasoVazio, proximoIdDeEtapa, validarCaso } from "./ead-caso";
import {
  FIM,
  adicionarEtapa,
  adicionarOpcao,
  alterarOpcao,
  alterarPergunta,
  casoMudou,
  casoParaEditar,
  destinosDoCaso,
  removerEtapa,
  removerOpcao,
  renomearEtapa,
} from "./ead-caso-edicao";

// Roteiro sintético com recuperação, na forma dos casos ramificados do material (textos inventados).
const opcao = (texto, segura, proxima) => ({
  texto,
  comentario: `Comentário: ${texto}`,
  segura,
  proxima,
});
const CASO = {
  contexto: "Contexto sintético.",
  etapas: [
    {
      id: "e1",
      pergunta: "Primeira decisão?",
      opcoes: [opcao("Bloquear", true, "e2"), opcao("Seguir", false, "r1")],
    },
    {
      id: "r1",
      pergunta: "Como corrigir?",
      opcoes: [opcao("Voltar", true, "e1"), opcao("Insistir", false, "r1")],
    },
    {
      id: "e2",
      pergunta: "Segunda decisão?",
      opcoes: [opcao("Medir", true, null), opcao("Pular", false, "e2")],
    },
  ],
  reflexao: "Reflexão sintética.",
};
const codigos = (conteudo) => validarCaso(conteudo).map((p) => p.codigo);

describe("o roteiro de teste", () => {
  it("é válido pela mesma regra do servidor (C3)", () => {
    expect(validarCaso(CASO)).toEqual([]);
  });
});

describe("casoParaEditar", () => {
  it("roteiro ausente ou ilegível vira o caso vazio de partida", () => {
    expect(casoParaEditar(null)).toEqual(novoCasoVazio());
    expect(casoParaEditar("não é JSON")).toEqual(novoCasoVazio());
    expect(casoParaEditar({ etapas: "x" })).toEqual(novoCasoVazio());
  });

  it("aceita o JSON em texto e devolve uma cópia (mexer nela não mexe no original)", () => {
    expect(casoParaEditar(JSON.stringify(CASO))).toEqual(CASO);
    const copia = casoParaEditar(CASO);
    copia.etapas[0].opcoes[0].texto = "mudou";
    expect(CASO.etapas[0].opcoes[0].texto).toBe("Bloquear");
  });

  it("normaliza: segura só com true; destino vazio ou 'Fim' vira null; o que falta vira texto vazio", () => {
    const c = casoParaEditar({
      etapas: [
        {
          id: "e1",
          opcoes: [
            { texto: "A", segura: "sim", proxima: "" },
            { segura: true, proxima: FIM },
          ],
        },
      ],
    });
    expect(c).toEqual({
      contexto: "",
      etapas: [
        {
          id: "e1",
          pergunta: "",
          opcoes: [
            { texto: "A", comentario: "", segura: false, proxima: null },
            { texto: "", comentario: "", segura: true, proxima: null },
          ],
        },
      ],
      reflexao: "",
    });
  });
});

describe("adicionarEtapa e removerEtapa", () => {
  it("acrescenta uma etapa com código livre, uma saída segura (Fim) e uma insegura que volta a ela", () => {
    const id = proximoIdDeEtapa(CASO);
    const novo = adicionarEtapa(CASO);
    expect(["e1", "r1", "e2"]).not.toContain(id);
    expect(novo.etapas).toHaveLength(4);
    expect(novo.etapas[3]).toEqual({
      id,
      pergunta: "",
      opcoes: [
        { texto: "", comentario: "", segura: true, proxima: null },
        { texto: "", comentario: "", segura: false, proxima: id },
      ],
    });
    expect(CASO.etapas).toHaveLength(3);
  });

  it("não passa do limite de etapas", () => {
    const cheio = {
      ...CASO,
      etapas: Array.from({ length: LIMITES_CASO.etapas }, (_, i) => ({
        id: `x${i}`,
        pergunta: "P",
        opcoes: [],
      })),
    };
    expect(adicionarEtapa(cheio).etapas).toHaveLength(LIMITES_CASO.etapas);
  });

  it("remover a recuperação: a insegura que levava a ela volta para a própria etapa", () => {
    const sem = removerEtapa(CASO, 1);
    expect(sem.etapas.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(sem.etapas[0].opcoes[1]).toMatchObject({ texto: "Seguir", proxima: "e1" });
    expect(validarCaso(sem)).toEqual([]);
  });

  it("remover o destino de uma segura: a segura passa a encerrar o caso", () => {
    const sem = removerEtapa(CASO, 2);
    expect(sem.etapas[0].opcoes[0]).toMatchObject({ texto: "Bloquear", segura: true, proxima: null });
    expect(codigos(sem)).not.toContain("PROXIMA_INEXISTENTE");
  });

  it("a única etapa não sai, e índice que não existe não muda nada", () => {
    const uma = { ...CASO, etapas: [CASO.etapas[2]] };
    expect(removerEtapa(uma, 0).etapas).toHaveLength(1);
    expect(removerEtapa(CASO, 9)).toEqual(CASO);
  });
});

describe("renomearEtapa", () => {
  it("muda o código e leva junto toda opção que apontava para ele", () => {
    const r = renomearEtapa(CASO, 1, " rec1 ");
    expect(r.ok).toBe(true);
    expect(r.conteudo.etapas.map((e) => e.id)).toEqual(["e1", "rec1", "e2"]);
    expect(r.conteudo.etapas[0].opcoes[1].proxima).toBe("rec1");
    expect(r.conteudo.etapas[1].opcoes[1].proxima).toBe("rec1");
    expect(validarCaso(r.conteudo)).toEqual([]);
  });

  it("recusa código vazio, com espaço, longo demais ou repetido, dizendo por quê", () => {
    expect(renomearEtapa(CASO, 1, "")).toMatchObject({ ok: false });
    expect(renomearEtapa(CASO, 1, "r 1").erro).toMatch(/espaço/);
    expect(renomearEtapa(CASO, 1, "x".repeat(21)).erro).toMatch(/20 caracteres/);
    expect(renomearEtapa(CASO, 1, "e2").erro).toContain("e2");
    expect(renomearEtapa(CASO, 9, "novo").ok).toBe(false);
  });

  it("o mesmo código não muda nada", () => {
    expect(renomearEtapa(CASO, 1, "r1")).toEqual({ ok: true, conteudo: CASO });
  });
});

describe("opções", () => {
  it("opção nova é insegura e volta para a própria etapa; no máximo 6", () => {
    const tres = adicionarOpcao(CASO, 0);
    expect(tres.etapas[0].opcoes).toHaveLength(3);
    expect(tres.etapas[0].opcoes[2]).toEqual({
      texto: "",
      comentario: "",
      segura: false,
      proxima: "e1",
    });
    let cheia = CASO;
    for (let i = 0; i < 10; i += 1) cheia = adicionarOpcao(cheia, 0);
    expect(cheia.etapas[0].opcoes).toHaveLength(LIMITES_CASO.opcoesMax);
  });

  it("remover opção respeita o mínimo de 2", () => {
    expect(removerOpcao(CASO, 0, 1).etapas[0].opcoes).toHaveLength(2);
    expect(removerOpcao(adicionarOpcao(CASO, 0), 0, 2)).toEqual(CASO);
  });

  it("muda texto, comentário e destino", () => {
    const c = alterarOpcao(CASO, 1, 0, { texto: "Voltar ao bloqueio", proxima: "e2" });
    expect(c.etapas[1].opcoes[0]).toEqual({
      texto: "Voltar ao bloqueio",
      comentario: "Comentário: Voltar",
      segura: true,
      proxima: "e2",
    });
  });

  it("'Fim do caso' numa segura encerra; numa insegura, volta para a própria etapa", () => {
    expect(alterarOpcao(CASO, 0, 0, { proxima: FIM }).etapas[0].opcoes[0].proxima).toBeNull();
    expect(alterarOpcao(CASO, 0, 1, { proxima: FIM }).etapas[0].opcoes[1].proxima).toBe("e1");
  });

  it("tornar insegura a opção que encerrava: ela passa a voltar para a etapa", () => {
    expect(alterarOpcao(CASO, 2, 0, { segura: false }).etapas[2].opcoes[0]).toMatchObject({
      segura: false,
      proxima: "e2",
    });
  });

  it("índices que não existem não mudam nada", () => {
    expect(alterarOpcao(CASO, 0, 9, { texto: "x" })).toEqual(CASO);
    expect(alterarOpcao(CASO, 9, 0, { texto: "x" })).toEqual(CASO);
    expect(adicionarOpcao(CASO, 9)).toEqual(CASO);
  });
});

describe("alterarPergunta, destinosDoCaso e casoMudou", () => {
  it("muda só a pergunta da etapa", () => {
    const c = alterarPergunta(CASO, 1, "Nova pergunta?");
    expect(c.etapas[1]).toEqual({ ...CASO.etapas[1], pergunta: "Nova pergunta?" });
    expect(c.etapas[0]).toEqual(CASO.etapas[0]);
  });

  it("os destinos do 'leva para' são os códigos das etapas, sem vazio nem repetição", () => {
    expect(destinosDoCaso(CASO)).toEqual(["e1", "r1", "e2"]);
    expect(
      destinosDoCaso({ etapas: [{ id: "e1" }, { id: "" }, { id: "e1" }, { id: "r1" }] })
    ).toEqual(["e1", "r1"]);
  });

  it("casoMudou compara o roteiro normalizado", () => {
    expect(casoMudou(CASO, casoParaEditar(CASO))).toBe(false);
    expect(casoMudou(CASO, alterarOpcao(CASO, 0, 0, { comentario: "outro" }))).toBe(true);
    const fim = CASO.etapas[2];
    const comVazio = {
      ...CASO,
      etapas: [{ ...fim, opcoes: [{ ...fim.opcoes[0], proxima: "" }, fim.opcoes[1]] }],
    };
    expect(casoMudou(comVazio, { ...CASO, etapas: [fim] })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/lib/ead-caso-edicao.test.js`
Expected: FAIL — `Failed to load url ./ead-caso-edicao`.

- [ ] **Step 3: Implementar `apps/web/src/lib/ead-caso-edicao.js`**

```js
/**
 * Edição do roteiro do caso com decisões na tela do RH (CasoEditor.jsx) — regra pura, sem DOM e sem rede.
 *
 * Toda função recebe o roteiro e devolve um roteiro NOVO (o recebido não muda), sempre no formato do contrato C3:
 * { contexto, etapas: [{ id, pergunta, opcoes: [{ texto, comentario, segura, proxima }] }], reflexao }. As etapas
 * e opções são apontadas pela POSIÇÃO na lista (o código da etapa pode estar vazio ou repetido enquanto o RH
 * digita). A validade, o que impede salvar, é de `validarCaso` (lib/ead-caso.js), a mesma regra do servidor.
 * Testes: ead-caso-edicao.test.js.
 */
import { LIMITES_CASO, novoCasoVazio, proximoIdDeEtapa } from "./ead-caso.js";

/** Valor do "leva para" que encerra o caso (o Select do Radix não aceita valor vazio). */
export const FIM = "__fim__";
const MAX_CODIGO = 20;

const textoDe = (v) => (typeof v === "string" ? v : "");
const destinoDe = (v) => (typeof v === "string" && v !== "" && v !== FIM ? v : null);
const opcaoDe = (o) => ({
  texto: textoDe(o?.texto),
  comentario: textoDe(o?.comentario),
  segura: o?.segura === true,
  proxima: destinoDe(o?.proxima),
});
const opcaoNova = (segura, proxima) => ({ texto: "", comentario: "", segura, proxima });

/**
 * O roteiro pronto para editar: cópia normalizada (segura só com `true`; destino vazio ou FIM vira `null`; o que
 * falta vira texto vazio). JSON em texto é lido; roteiro ausente ou sem lista de etapas vira o caso vazio de
 * partida (`novoCasoVazio`).
 */
export function casoParaEditar(conteudo) {
  let c = conteudo;
  if (typeof c === "string") {
    try {
      c = JSON.parse(c);
    } catch {
      c = null;
    }
  }
  if (!c || typeof c !== "object" || !Array.isArray(c.etapas)) return novoCasoVazio();
  return {
    contexto: textoDe(c.contexto),
    etapas: c.etapas.map((e) => ({
      id: textoDe(e?.id),
      pergunta: textoDe(e?.pergunta),
      opcoes: Array.isArray(e?.opcoes) ? e.opcoes.map(opcaoDe) : [],
    })),
    reflexao: textoDe(c.reflexao),
  };
}

/** Aplica `mudar(etapa)` à etapa da posição `indice`; posição que não existe devolve o roteiro como está. */
function comEtapa(conteudo, indice, mudar) {
  const c = casoParaEditar(conteudo);
  const etapa = c.etapas[indice];
  if (!etapa) return c;
  const nova = mudar(etapa);
  return nova === etapa ? c : { ...c, etapas: c.etapas.map((e, i) => (i === indice ? nova : e)) };
}

/**
 * Etapa nova no fim, com código livre ("e<n>"), uma saída segura que encerra o caso e uma insegura que volta a ela.
 * Até LIMITES_CASO.etapas.
 */
export function adicionarEtapa(conteudo) {
  const c = casoParaEditar(conteudo);
  if (c.etapas.length >= LIMITES_CASO.etapas) return c;
  const id = proximoIdDeEtapa(c);
  return {
    ...c,
    etapas: [...c.etapas, { id, pergunta: "", opcoes: [opcaoNova(true, null), opcaoNova(false, id)] }],
  };
}

/**
 * Remove a etapa da posição `indice` (a única não sai). As opções que levavam a ela são corrigidas: a segura
 * passa a encerrar o caso e a insegura volta para a própria etapa (só a segura pode encerrar). Se outra etapa
 * tem o mesmo código, ele continua sendo um destino válido e nada muda nas opções.
 */
export function removerEtapa(conteudo, indice) {
  const c = casoParaEditar(conteudo);
  const alvo = c.etapas[indice];
  if (!alvo || c.etapas.length <= 1) return c;
  const restantes = c.etapas.filter((_, i) => i !== indice);
  const sumiu = !!alvo.id && !restantes.some((e) => e.id === alvo.id);
  return {
    ...c,
    etapas: restantes.map((e) => ({
      ...e,
      opcoes: e.opcoes.map((o) =>
        sumiu && o.proxima === alvo.id ? { ...o, proxima: o.segura ? null : e.id || null } : o
      ),
    })),
  };
}

/**
 * Troca o código da etapa da posição `indice` e leva junto toda opção que apontava para o código antigo.
 * Recusa (com o motivo em `erro`) código vazio, com espaço, com mais de 20 caracteres ou de outra etapa.
 */
export function renomearEtapa(conteudo, indice, novoId) {
  const c = casoParaEditar(conteudo);
  const etapa = c.etapas[indice];
  if (!etapa) return { ok: false, erro: "Etapa não encontrada." };
  const id = textoDe(novoId).trim();
  if (!id) return { ok: false, erro: "Informe o código da etapa (ex.: e2 ou r1)." };
  if (/\s/.test(id)) return { ok: false, erro: "O código da etapa não pode ter espaço." };
  if (id.length > MAX_CODIGO) {
    return { ok: false, erro: `Use até ${MAX_CODIGO} caracteres no código da etapa.` };
  }
  if (id === etapa.id) return { ok: true, conteudo: c };
  if (c.etapas.some((e, i) => i !== indice && e.id === id)) {
    return { ok: false, erro: `Já existe uma etapa com o código ${id}.` };
  }
  const antigo = etapa.id;
  const unico = !!antigo && c.etapas.filter((e) => e.id === antigo).length === 1;
  return {
    ok: true,
    conteudo: {
      ...c,
      etapas: c.etapas.map((e, i) => ({
        ...e,
        id: i === indice ? id : e.id,
        opcoes: unico
          ? e.opcoes.map((o) => (o.proxima === antigo ? { ...o, proxima: id } : o))
          : e.opcoes,
      })),
    },
  };
}

/** Muda a pergunta da etapa da posição `indice`. */
export function alterarPergunta(conteudo, indice, pergunta) {
  return comEtapa(conteudo, indice, (etapa) => ({ ...etapa, pergunta: textoDe(pergunta) }));
}

/** Opção nova (insegura, voltando para a própria etapa) no fim da etapa; até LIMITES_CASO.opcoesMax. */
export function adicionarOpcao(conteudo, indiceEtapa) {
  return comEtapa(conteudo, indiceEtapa, (etapa) =>
    etapa.opcoes.length >= LIMITES_CASO.opcoesMax
      ? etapa
      : { ...etapa, opcoes: [...etapa.opcoes, opcaoNova(false, etapa.id || null)] }
  );
}

/** Remove a opção; a etapa nunca fica com menos de LIMITES_CASO.opcoesMin. */
export function removerOpcao(conteudo, indiceEtapa, indiceOpcao) {
  return comEtapa(conteudo, indiceEtapa, (etapa) =>
    etapa.opcoes.length <= LIMITES_CASO.opcoesMin || !etapa.opcoes[indiceOpcao]
      ? etapa
      : { ...etapa, opcoes: etapa.opcoes.filter((_, i) => i !== indiceOpcao) }
  );
}

/**
 * Muda campos da opção (`texto`, `comentario`, `segura`, `proxima`; FIM encerra). Só a escolha segura encerra o
 * caso: a insegura sem destino volta para a própria etapa.
 */
export function alterarOpcao(conteudo, indiceEtapa, indiceOpcao, campos) {
  return comEtapa(conteudo, indiceEtapa, (etapa) => {
    const atual = etapa.opcoes[indiceOpcao];
    if (!atual) return etapa;
    const nova = opcaoDe({ ...atual, ...campos });
    if (!nova.segura && nova.proxima === null) nova.proxima = etapa.id || null;
    return { ...etapa, opcoes: etapa.opcoes.map((o, i) => (i === indiceOpcao ? nova : o)) };
  });
}

/** Os destinos do "leva para": os códigos das etapas, em ordem, sem vazio nem repetição. */
export function destinosDoCaso(conteudo) {
  const ids = [];
  for (const e of casoParaEditar(conteudo).etapas) {
    if (e.id && !ids.includes(e.id)) ids.push(e.id);
  }
  return ids;
}

/** O roteiro mudou? Compara os dois já normalizados (destino vazio e `null` são a mesma coisa). */
export function casoMudou(a, b) {
  return JSON.stringify(casoParaEditar(a)) !== JSON.stringify(casoParaEditar(b));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/lib/ead-caso-edicao.test.js`
Expected: PASS.

- [ ] **Step 5: Escrever o teste do `CasoEditor` (vai falhar)**

Crie `apps/web/src/components/seguranca/CasoEditor.test.jsx`:

```jsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Os componentes importam utilitários que leem `window` ao carregar; o ambiente de teste não tem DOM.
vi.hoisted(() => {
  const janela = {};
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

// Select e Switch do Radix trocados por caixas simples: o teste confere o valor e as opções desenhadas.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }) => <div data-valor={value}>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value, disabled }) => (
    <span data-opcao={value} data-desabilitada={disabled ? "sim" : "nao"}>
      {children}
    </span>
  ),
}));
vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, disabled }) => (
    <input type="checkbox" readOnly checked={!!checked} disabled={disabled} />
  ),
}));

import CasoEditor from "./CasoEditor";

/**
 * Editor do caso com decisões (atividades interativas). `renderToStaticMarkup` não roda cliques: confere o que o
 * RH vê; as operações de edição estão em lib/ead-caso-edicao.test.js e a validade em lib/ead-caso.test.js.
 */
const opcao = (texto, segura, proxima) => ({
  texto,
  comentario: `Comentário: ${texto}`,
  segura,
  proxima,
});
const VALIDO = {
  contexto: "Contexto sintético.",
  etapas: [
    { id: "e1", pergunta: "Primeira?", opcoes: [opcao("Bloquear", true, "e2"), opcao("Seguir", false, "r1")] },
    { id: "r1", pergunta: "Recuperar?", opcoes: [opcao("Voltar", true, "e1"), opcao("Insistir", false, "r1")] },
    { id: "e2", pergunta: "Segunda?", opcoes: [opcao("Medir", true, null), opcao("Pular", false, "e2")] },
  ],
  reflexao: "Reflexão sintética.",
};
const desenhar = (valor, extra = {}) =>
  renderToStaticMarkup(<CasoEditor valor={valor} onChange={() => {}} {...extra} />);

describe("CasoEditor", () => {
  it("roteiro válido: contexto, etapas, opções, destinos e 'Roteiro sem problemas'", () => {
    const html = desenhar(VALIDO);
    expect(html).toContain("Contexto sintético.");
    expect(html).toContain("Começo do caso");
    expect(html).toContain("Primeira?");
    expect(html).toContain('data-valor="r1"');
    expect(html).toContain('data-valor="__fim__"');
    expect(html).toContain("Reflexão sintética.");
    expect(html).toContain("Roteiro sem problemas");
  });

  it("roteiro com problema: a lista de validarCaso aparece e não diz 'sem problemas'", () => {
    const umaOpcao = {
      ...VALIDO,
      etapas: [{ ...VALIDO.etapas[0], opcoes: [opcao("Só uma", true, null)] }],
    };
    const html = desenhar(umaOpcao);
    expect(html).toMatch(/problemas? impede/);
    expect(html).not.toContain("Roteiro sem problemas");
  });

  it("'Fim do caso' fica desabilitado para a opção insegura", () => {
    const html = desenhar(VALIDO);
    expect(html.match(/data-opcao="__fim__" data-desabilitada="sim"/g)).toHaveLength(3);
    expect(html.match(/data-opcao="__fim__" data-desabilitada="nao"/g)).toHaveLength(3);
  });

  it("desabilitado (sem Editar ou gravando): nenhum campo editável", () => {
    const html = desenhar(VALIDO, { desabilitado: true });
    expect(html).not.toMatch(/<textarea(?![^>]*disabled)/);
    expect(html).not.toMatch(/<input(?![^>]*disabled)/);
    expect(html).not.toMatch(/<button(?![^>]*disabled)/);
  });
});
```

Run: `cd apps/web && npx vitest run src/components/seguranca/CasoEditor.test.jsx`
Expected: FAIL — `Failed to load url ./CasoEditor`.

- [ ] **Step 6: Implementar `apps/web/src/components/seguranca/CasoEditor.jsx`**

```jsx
import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LIMITES_CASO, validarCaso } from "@/lib/ead-caso";
import {
  FIM,
  adicionarEtapa,
  adicionarOpcao,
  alterarOpcao,
  alterarPergunta,
  casoParaEditar,
  destinosDoCaso,
  removerEtapa,
  removerOpcao,
  renomearEtapa,
} from "@/lib/ead-caso-edicao";

/**
 * Código da etapa: muda ao sair do campo (ou no Enter), e as opções que levavam a ela vão junto. Recusado
 * (vazio, repetido, com espaço), o campo volta ao código atual e mostra o motivo.
 */
function CodigoDaEtapa({ id, rotulo, desabilitado, onRenomear }) {
  const [rascunho, setRascunho] = useState(id);
  const [erro, setErro] = useState("");
  useEffect(() => {
    setRascunho(id);
    setErro("");
  }, [id]);
  const aplicar = () => {
    if (rascunho === id) return;
    const resultado = onRenomear(rascunho);
    if (resultado.ok) {
      setErro("");
    } else {
      setErro(resultado.erro);
      setRascunho(id);
    }
  };
  return (
    <div className="flex flex-col">
      <Input
        value={rascunho}
        aria-label={rotulo}
        maxLength={20}
        disabled={desabilitado}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={aplicar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            aplicar();
          }
        }}
        className="h-8 w-24 font-mono text-xs"
      />
      {erro && (
        <span role="alert" className="text-xs text-red-700">
          {erro}
        </span>
      )}
    </div>
  );
}

/**
 * Editor do roteiro do caso com decisões (atividades interativas, spec 2026-10-14 §4.3 e §5.2). Controlado:
 * recebe o roteiro em `valor` e devolve cada mudança em `onChange(roteiroNovo)`. O aluno começa na PRIMEIRA etapa;
 * cada opção tem o texto (o que o aluno lê), o comentário (o que ele vê depois de escolher), se é a escolha segura
 * e para onde leva (outra etapa ou "Fim do caso", só para a segura). Os problemas de `validarCaso` (a mesma regra
 * do servidor) aparecem na hora; quem usa desabilita o "Salvar" com `validarCaso(valor).length > 0`.
 * `desabilitado`: só leitura (sem Treinamentos EAD → Editar, ou gravando).
 */
export default function CasoEditor({ valor, onChange, desabilitado = false }) {
  const caso = casoParaEditar(valor);
  const problemas = validarCaso(caso);
  const destinos = destinosDoCaso(caso);
  const mudar = (novo) => {
    if (!desabilitado) onChange(novo);
  };

  return (
    <div className="space-y-4 text-sm">
      <div>
        <Label htmlFor="caso-contexto" className="text-xs">
          Situação apresentada ao aluno (contexto)
        </Label>
        <Textarea
          id="caso-contexto"
          rows={3}
          maxLength={LIMITES_CASO.longo}
          value={caso.contexto}
          onChange={(e) => mudar({ ...caso, contexto: e.target.value })}
          disabled={desabilitado}
          className="mt-0.5"
        />
      </div>

      {caso.etapas.map((etapa, ie) => {
        const nomeDaEtapa = etapa.id || String(ie + 1);
        return (
          <section
            key={ie}
            aria-label={`Etapa ${nomeDaEtapa}`}
            className="space-y-2 rounded-lg border bg-white p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px]">
                {ie === 0 ? "Começo do caso" : `Etapa ${ie + 1}`}
              </Badge>
              <span className="text-xs text-slate-600">Código</span>
              <CodigoDaEtapa
                id={etapa.id}
                rotulo={`Código da etapa ${ie + 1}`}
                desabilitado={desabilitado}
                onRenomear={(novoId) => {
                  const resultado = renomearEtapa(caso, ie, novoId);
                  if (resultado.ok) mudar(resultado.conteudo);
                  return resultado;
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto text-slate-500 hover:text-red-600"
                disabled={desabilitado || caso.etapas.length <= 1}
                onClick={() => mudar(removerEtapa(caso, ie))}
                aria-label={`Remover a etapa ${nomeDaEtapa}`}
              >
                <Trash2 className="w-4 h-4 mr-1" /> Remover etapa
              </Button>
            </div>
            <Textarea
              rows={2}
              placeholder="Pergunta: a decisão que o aluno toma nesta etapa"
              aria-label={`Pergunta da etapa ${nomeDaEtapa}`}
              maxLength={LIMITES_CASO.texto}
              value={etapa.pergunta}
              onChange={(e) => mudar(alterarPergunta(caso, ie, e.target.value))}
              disabled={desabilitado}
            />
            <ol className="space-y-2">
              {etapa.opcoes.map((op, io) => {
                const nome = `opção ${io + 1} da etapa ${nomeDaEtapa}`;
                return (
                  <li
                    key={io}
                    className={`space-y-1.5 rounded-md border-l-4 p-2 ${
                      op.segura ? "border-emerald-400 bg-emerald-50" : "border-amber-400 bg-amber-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={op.texto}
                        placeholder={`Opção ${io + 1}: o que o aluno lê`}
                        aria-label={`Texto da ${nome}`}
                        maxLength={LIMITES_CASO.texto}
                        onChange={(e) => mudar(alterarOpcao(caso, ie, io, { texto: e.target.value }))}
                        disabled={desabilitado}
                        className="h-8 bg-white"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover a ${nome}`}
                        disabled={desabilitado || etapa.opcoes.length <= LIMITES_CASO.opcoesMin}
                        onClick={() => mudar(removerOpcao(caso, ie, io))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <Textarea
                      rows={2}
                      value={op.comentario}
                      placeholder="Comentário que o aluno vê depois de escolher"
                      aria-label={`Comentário da ${nome}`}
                      maxLength={LIMITES_CASO.texto}
                      onChange={(e) =>
                        mudar(alterarOpcao(caso, ie, io, { comentario: e.target.value }))
                      }
                      disabled={desabilitado}
                      className="bg-white"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <Switch
                          checked={op.segura}
                          onCheckedChange={(v) => mudar(alterarOpcao(caso, ie, io, { segura: v }))}
                          disabled={desabilitado}
                          aria-label={`A ${nome} é a escolha segura`}
                        />
                        {op.segura ? "Escolha segura" : "Escolha insegura"}
                      </label>
                      <span className="text-xs text-slate-600">leva para</span>
                      <Select
                        value={op.proxima ?? FIM}
                        onValueChange={(v) => mudar(alterarOpcao(caso, ie, io, { proxima: v }))}
                        disabled={desabilitado}
                      >
                        <SelectTrigger className="h-8 w-48 bg-white" aria-label={`Para onde a ${nome} leva`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[9999]">
                          {destinos.map((id) => (
                            <SelectItem key={id} value={id}>
                              {id === etapa.id ? `${id} (a mesma etapa)` : id}
                            </SelectItem>
                          ))}
                          <SelectItem value={FIM} disabled={!op.segura}>
                            Fim do caso
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </li>
                );
              })}
            </ol>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={desabilitado || etapa.opcoes.length >= LIMITES_CASO.opcoesMax}
              onClick={() => mudar(adicionarOpcao(caso, ie))}
            >
              <Plus className="w-4 h-4 mr-1" /> Adicionar opção
            </Button>
          </section>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={desabilitado || caso.etapas.length >= LIMITES_CASO.etapas}
        onClick={() => mudar(adicionarEtapa(caso))}
      >
        <Plus className="w-4 h-4 mr-1" /> Adicionar etapa
      </Button>

      <div>
        <Label htmlFor="caso-reflexao" className="text-xs">
          Para refletir (o aluno lê no fim, antes de concluir o caso)
        </Label>
        <Textarea
          id="caso-reflexao"
          rows={3}
          maxLength={LIMITES_CASO.longo}
          value={caso.reflexao}
          onChange={(e) => mudar({ ...caso, reflexao: e.target.value })}
          disabled={desabilitado}
          className="mt-0.5"
        />
      </div>

      <div role="status" aria-live="polite" className="rounded-md border p-2 text-xs">
        {problemas.length === 0 ? (
          <p className="text-emerald-700">Roteiro sem problemas: pode salvar.</p>
        ) : (
          <>
            <p className="font-medium text-amber-800">
              {problemas.length === 1
                ? "1 problema impede salvar:"
                : `${problemas.length} problemas impedem salvar:`}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-800">
              {problemas.map((p, i) => (
                <li key={`${p.codigo}-${i}`}>
                  {p.etapa ? <span className="font-mono">[{p.etapa}] </span> : null}
                  {p.texto}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
```

Run: `cd apps/web && npx vitest run src/components/seguranca/CasoEditor.test.jsx`
Expected: PASS.

- [ ] **Step 7: Escrever as guardas da ligação na aba (vão falhar)**

Cole no fim de `apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js`:

```js
describe("aba Treinamentos: caso com decisões (Task 17)", () => {
  it("caso novo cria a aula e depois o roteiro; se o roteiro falhar, a aula sai", () => {
    const salvar = funcao(aba, "salvarCaso");
    const aula = salvar.indexOf("TreinamentoAula.create(editando.dados)");
    const roteiro = salvar.indexOf("TreinamentoCaso.create({");
    expect(aula).toBeGreaterThan(-1);
    expect(roteiro).toBeGreaterThan(aula);
    expect(salvar).toMatch(/aula_id: aula\.id,\s*conteudo: editando\.conteudo/);
    expect(salvar).toContain("TreinamentoAula.delete(aula.id)");
    expect(salvar).toContain('confirmarImpacto("aula_nova"');
  });

  it("editar o caso só muda o conteúdo, com o aviso de impacto quando o roteiro muda", () => {
    const salvar = funcao(aba, "salvarCaso");
    expect(salvar).toMatch(
      /TreinamentoCaso\.update\(editando\.casoId, \{\s*conteudo: editando\.conteudo,?\s*\}\)/
    );
    expect(salvar).toContain('confirmarImpacto("caso_alterar"');
    expect(salvar).toContain("casoMudou(editando.original, editando.conteudo)");
  });

  it("Salvar fica desabilitado com problema no roteiro (a mesma validarCaso do editor)", () => {
    expect(aba).toContain(
      "const problemasDoCaso = casoEditando ? validarCaso(casoEditando.conteudo) : [];"
    );
    expect(aba).toMatch(/disabled=\{gravando\.has\("caso"\) \|\| problemasDoCaso\.length > 0\}/);
    expect(aba).toMatch(/<CasoEditor[\s\S]*?desabilitado=\{!pode\.editar \|\| gravando\.has\("caso"\)\}/);
  });

  it("a linha da aula de caso abre o editor (Editar caso / Ver caso)", () => {
    expect(aba).toContain("onCaso={() => abrirCasoDaAula(a)}");
  });
});
```

Run: `cd apps/web && npx vitest run src/components/seguranca/TreinamentosEadTab.atividades.test.js`
Expected: FAIL nos 4 testes novos (os da Task 16 continuam passando).

- [ ] **Step 8: Ligar o editor na aba**

8.1. Imports de `TreinamentosEadTab.jsx`. Troque `import { novoCasoVazio } from "@/lib/ead-caso";` por:

```jsx
import { novoCasoVazio, validarCaso } from "@/lib/ead-caso";
import { casoMudou, casoParaEditar } from "@/lib/ead-caso-edicao";
```

Depois de `import QuestoesEad from "@/components/seguranca/QuestoesEad";` acrescente:

```jsx
import CasoEditor from "@/components/seguranca/CasoEditor";
```

e, no import de `@/components/ui/dialog`, acrescente `DialogFooter,` depois de `DialogDescription,`.

8.2. Depois de `const casoPorAula = useMemo(...)` (Task 16) acrescente:

```jsx
  // o "Salvar caso" fica desabilitado com qualquer problema do roteiro (a mesma conta que o editor mostra)
  const problemasDoCaso = casoEditando ? validarCaso(casoEditando.conteudo) : [];
```

8.3. Logo depois do `};` que fecha `adicionarAula`, acrescente:

```jsx
  // "Editar caso" (ou "Ver caso", sem Editar) na linha da aula: o roteiro gravado; aula sem roteiro abre o vazio
  const abrirCasoDaAula = (aula) => {
    const gravado = casoPorAula.get(aula.id) ?? null;
    const conteudo = gravado ? casoParaEditar(gravado.conteudo) : novoCasoVazio();
    setCasoEditando({
      modo: "editar",
      id: aula.id,
      aula,
      casoId: gravado?.id ?? null,
      conteudo,
      original: gravado ? conteudo : null,
    });
  };

  // Grava o caso com decisões. Caso novo: cria a aula e, em seguida, o roteiro; se o roteiro falhar, a aula criada
  // sai (sem roteiro ela ficaria pendente no curso, e o SDK não tem transação). Caso existente: só o roteiro muda,
  // com o aviso de impacto quando alguém já está nele (quem está no meio pode recomeçar, §4.3).
  const salvarCaso = async () => {
    const editando = casoEditando; // o editor que o RH mandou salvar
    if (!editando || validarCaso(editando.conteudo).length) return;
    const empresaId = empresaAtiva.id;
    if (editando.modo === "novo") {
      const cursoId = editando.dados.curso_id;
      if (!(await confirmarImpacto("aula_nova", { cursoId }))) return;
      await gravar("caso", "Erro ao criar o caso", async () => {
        const aula = await sigo.entities.TreinamentoAula.create(editando.dados);
        try {
          await sigo.entities.TreinamentoCaso.create({
            empresa_id: editando.dados.empresa_id,
            curso_id: cursoId,
            aula_id: aula.id,
            conteudo: editando.conteudo,
          });
        } catch (e) {
          await sigo.entities.TreinamentoAula.delete(aula.id).catch((erro) =>
            console.error("[caso] a aula sem roteiro não pôde ser removida:", erro)
          );
          throw e;
        }
        setCasoEditando((atual) => (mesmoFormulario(atual, editando) ? null : atual));
        // a "Nova aula" fica pronta para o próximo caso do mesmo módulo (só no mesmo curso e na mesma empresa)
        if (cargas.mesmaEmpresa(empresaId) && cursoSelRef.current?.id === cursoId) {
          setNovaAula((atual) => ({ ...NOVA_AULA, modulo: atual.modulo, tipo: "caso" }));
        }
        toast.success("Caso criado");
        recarregar();
      });
      return;
    }
    const aula = editando.aula;
    if (
      editando.original &&
      casoMudou(editando.original, editando.conteudo) &&
      !(await confirmarImpacto("caso_alterar", { cursoId: aula.curso_id, aulaId: aula.id }))
    ) {
      return;
    }
    await gravar("caso", "Erro ao salvar o caso", async () => {
      if (editando.casoId) {
        await sigo.entities.TreinamentoCaso.update(editando.casoId, {
          conteudo: editando.conteudo,
        });
      } else {
        // aula de caso sem roteiro (criada por fora da tela): o roteiro nasce agora
        await sigo.entities.TreinamentoCaso.create({
          empresa_id: empresaId,
          curso_id: aula.curso_id,
          aula_id: aula.id,
          conteudo: editando.conteudo,
        });
      }
      setCasoEditando((atual) => (mesmoFormulario(atual, editando) ? null : atual));
      toast.success("Caso salvo");
      recarregar();
    });
  };
```

8.4. No `<AulaLinhaEad`, depois de `onQuestoes={() => abrirQuestionario(a)}`, acrescente:

```jsx
                            onCaso={() => abrirCasoDaAula(a)}
```

8.5. Logo depois do `</Dialog>` do diálogo "Questões do questionário" (Task 16) e antes de `{dialogoConfirmar}`,
acrescente:

```jsx
      {/* caso com decisões (atividades interativas): criar (a partir da "Nova aula") e editar o roteiro */}
      <Dialog
        open={!!casoEditando}
        onOpenChange={(aberto) => {
          if (!aberto && !gravando.has("caso")) setCasoEditando(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {casoEditando?.modo === "novo" ? "Novo caso com decisões" : "Caso com decisões"}
            </DialogTitle>
            <DialogDescription>
              {casoEditando?.modo === "novo" ? casoEditando.dados.titulo : casoEditando?.aula?.titulo}
              . O aluno começa na primeira etapa e só vê o texto das opções; o comentário aparece
              depois da escolha, e só uma escolha segura que leva a “Fim do caso” encerra o caso.
            </DialogDescription>
          </DialogHeader>
          {casoEditando && (
            <CasoEditor
              valor={casoEditando.conteudo}
              onChange={(conteudo) =>
                setCasoEditando((atual) => (atual ? { ...atual, conteudo } : atual))
              }
              desabilitado={!pode.editar || gravando.has("caso")}
            />
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCasoEditando(null)}
              disabled={gravando.has("caso")}
            >
              {pode.editar ? "Cancelar" : "Fechar"}
            </Button>
            {pode.editar && (
              <Button
                onClick={salvarCaso}
                disabled={gravando.has("caso") || problemasDoCaso.length > 0}
                className="bg-slate-900 hover:bg-slate-800"
              >
                {gravando.has("caso") && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Salvar caso
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 9: Rodar os testes da task**

Run: `cd apps/web && npx vitest run src/lib/ead-caso-edicao.test.js src/components/seguranca/CasoEditor.test.jsx src/components/seguranca/TreinamentosEadTab.atividades.test.js src/components/seguranca/MatriculaAuditoriaSheet.test.js`
Expected: PASS (a guarda A2, em `MatriculaAuditoriaSheet.test.js`, segue com um só `setNovaAula(` em `adicionarAula`:
o do caso fica em `salvarCaso`).

- [ ] **Step 10: Checagens**

```bash
npx prettier --write apps/web/src/lib/ead-caso-edicao.js apps/web/src/lib/ead-caso-edicao.test.js apps/web/src/components/seguranca/CasoEditor.jsx apps/web/src/components/seguranca/CasoEditor.test.jsx apps/web/src/components/seguranca/TreinamentosEadTab.jsx apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js
npx prettier --check apps/web/src/lib/ead-caso-edicao.js apps/web/src/lib/ead-caso-edicao.test.js apps/web/src/components/seguranca/CasoEditor.jsx apps/web/src/components/seguranca/CasoEditor.test.jsx apps/web/src/components/seguranca/TreinamentosEadTab.jsx apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js
(cd apps/web && npx eslint --rule "no-undef: error" src/components/seguranca/CasoEditor.jsx src/components/seguranca/TreinamentosEadTab.jsx)
npm run lint
npm run build
npm test --workspace=apps/web
node --test "supabase/functions/**/*.test.ts"
```

Expected: prettier OK; ESLint sem erros; build OK; Vitest com cerca de **+29 testes** (2 arquivos novos) em relação à Task 16, 0
falhas; `node --test` sem mudança.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/lib/ead-caso-edicao.js apps/web/src/lib/ead-caso-edicao.test.js apps/web/src/components/seguranca/CasoEditor.jsx apps/web/src/components/seguranca/CasoEditor.test.jsx apps/web/src/components/seguranca/TreinamentosEadTab.jsx apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js
git status --short && git diff --staged --stat
git commit -F - -- apps/web/src/lib/ead-caso-edicao.js apps/web/src/lib/ead-caso-edicao.test.js apps/web/src/components/seguranca/CasoEditor.jsx apps/web/src/components/seguranca/CasoEditor.test.jsx apps/web/src/components/seguranca/TreinamentosEadTab.jsx apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js <<'EOF'
feat(ead): editor do caso com decisões na tela do RH

O RH escreve o caso na tela: contexto, etapas (código, pergunta, opções com texto,
comentário, segura e "leva para") e a reflexão, com os problemas de validarCaso na hora
e o "Salvar caso" desabilitado enquanto houver algum. Caso novo cria a aula e o roteiro
(a aula sai se o roteiro falhar); "Editar caso" muda só o roteiro, com aviso de impacto
para quem está no meio. As operações de edição ficam em lib/ead-caso-edicao.js.

Produção: nenhuma nesta task (vai junto com o push do fim do plano).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 18: Leitor e plano da importação (`lib/ead-atividades-importar.js`)

**Files:**

- Create: `apps/web/src/lib/ead-atividades-importar.js`
- Create: `apps/web/src/lib/ead-atividades-importar.test.js`

**Interfaces:**

- Consumes: `validarCaso(conteudo): ProblemaDoCaso[]` de `lib/ead-caso.js` (C3, Task 2), importado com a extensão
  (`./ead-caso.js`) para o arquivo também rodar direto no Node (script de conferência do pacote, Task 20); payload
  da RPC `importar_atividades_ead` (C1), com o campo opcional `depois_da_aula_id` (mudança de contrato de 14/10).
- Produces (contrato C6 e a mudança de 14/10; os demais exports são extras, nota 5 ao coordenador):

```js
export const TEMPOS_PADRAO = { questionarioMin: 15, casoMin: 10 };
export const TEMPO_PADRAO_POS_VIDEO_MIN = 5;
export const MODULO_NOVO = "__novo__";            // escolha "novo módulo no fim"
export const FORMATO_POR_VIDEO = "questionarios_por_video";
export function formatoDoArquivo(json): "pacote" | "por_video";
export function minutosDoTempo(valor): number | null; // inteiro 1..600
export function lerPacoteDeAtividades(json)
//   → { modulos: [{ id, titulo, casos: [{ titulo, conteudo }], questoes: [{ pergunta, opcoes, correta, comentario }],
//        tarefas: [{ titulo, instrucoes, evidencia, minutos }] }], erros: string[] }
export function lerQuestionariosPorVideo(json) // → { itens: [{ video, questoes }], erros: string[] } (video em maiúsculas)
export function casarModulo(idModulo, modulosDoCurso): string | null; // "M1" NÃO casa com "M10 · …"
export function modulosDasAulas(aulas): string[];   // módulos do curso, na ordem das aulas
export function codigosDasAulas(aulas): Set<string>; // codigo_origem das aulas não apagadas
export function acharAulaDoVideo(codigo, aulas): object | null;
export function planejarImportacao({ pacote, modulosDoCurso, codigosExistentes, tempos, escolhaDeModulo })
//   → { itens: [{ codigo_origem, tipo, modulo, titulo, duracao_seg, conteudo_texto?, caso?, questoes?, moduloPacote,
//        problemas: string[], jaExiste: boolean }], porModulo: [{ moduloPacote, tituloPacote, modulo,
//        origem: "casado" | "escolhido" | "novo", casos, questoes, tarefas, minutos }] }
export function planejarImportacaoPorVideo({ arquivo, aulas, codigosExistentes, minutos })
//   → { itens: [{ codigo_origem: "PV-<video>", tipo: "questionario", depois_da_aula_id, modulo, titulo, duracao_seg,
//        questoes, video, aulaDoVideo, problemas, jaExiste }] }
export function payloadDaImportacao(itens, desmarcados) // → payload da RPC (C1)
export function situacaoDaImportacao(itens, desmarcados)
//   → { aImportar, questoes, minutos, puladas, comProblema: string[], podeConfirmar: boolean }
export function textoDoResumoDaImportacao({ criadas, puladas, questoes }): string;
export function mensagemDoErroDaImportacao(erro): string;
```

- [ ] **Step 1: Escrever os testes (vão falhar)**

Crie `apps/web/src/lib/ead-atividades-importar.test.js` (todo texto é sintético: nada do material do NR-10):

```js
import { describe, it, expect } from "vitest";
import {
  FORMATO_POR_VIDEO,
  MODULO_NOVO,
  TEMPOS_PADRAO,
  TEMPO_PADRAO_POS_VIDEO_MIN,
  acharAulaDoVideo,
  casarModulo,
  codigosDasAulas,
  formatoDoArquivo,
  lerPacoteDeAtividades,
  lerQuestionariosPorVideo,
  mensagemDoErroDaImportacao,
  minutosDoTempo,
  modulosDasAulas,
  payloadDaImportacao,
  planejarImportacao,
  planejarImportacaoPorVideo,
  situacaoDaImportacao,
  textoDoResumoDaImportacao,
} from "./ead-atividades-importar";

// Pacote sintético na forma dos rascunhos de autoria: caso ramificado com recuperação, 8 questões e 2 tarefas.
const opcao = (texto, segura, proxima) => ({ texto, feedback: `Comentário: ${texto}`, segura, proxima });
const CASO_RAMIFICADO = {
  id: "M1-C1",
  titulo: "Quadro sem bloqueio",
  contexto: "Contexto sintético do caso.",
  etapas: [
    {
      id: "e1",
      pergunta: "Primeira decisão?",
      opcoes: [opcao("Bloquear", true, "e2"), opcao("Seguir", false, "r1")],
    },
    {
      id: "r1",
      pergunta: "Como corrigir?",
      opcoes: [opcao("Voltar e bloquear", true, "e1"), opcao("Insistir", false, "r1")],
    },
    {
      id: "e2",
      pergunta: "Segunda decisão?",
      opcoes: [opcao("Medir a tensão", true, null), opcao("Pular a medição", false, "e2")],
    },
  ],
  reflexao: "Reflexão sintética.",
};
const QUESTOES = Array.from({ length: 8 }, (_, i) => ({
  enunciado: `Pergunta sintética ${i + 1}?`,
  opcoes: ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
  correta: i % 4,
  explicacao: `Explicação ${i + 1}.`,
}));
const TAREFAS = [
  {
    titulo: "Mapa de riscos",
    instrucoes: "Desenhe o mapa do posto.",
    evidencia: "Uma foto do mapa.",
    tempoEstimadoMin: 35,
  },
  { titulo: "Lista de verificação", instrucoes: "Monte a lista.", evidencia: "", tempoEstimadoMin: 20 },
];
const PACOTE = [
  {
    id: "M1",
    titulo: "Introdução sintética",
    objetivos: ["Objetivo sintético"],
    apostila: {},
    episodios: [],
    casos: [CASO_RAMIFICADO],
    questoes: QUESTOES,
    estudo: TAREFAS,
    pratica: [{ titulo: "Estação prática sintética" }],
    fontes: [],
  },
  { id: "M2", titulo: "Módulo sem atividades", casos: [], questoes: [], estudo: [], pratica: [] },
];
const MODULOS_DO_CURSO = ["M10 · Revisão", "M1 · Introdução", "M3 Análise"];

describe("lerPacoteDeAtividades", () => {
  it("lê a lista de módulos e converte para o formato do SIGO (feedback → comentário, enunciado → pergunta)", () => {
    const { modulos, erros } = lerPacoteDeAtividades(PACOTE);
    expect(erros).toEqual([]);
    expect(modulos.map((m) => m.id)).toEqual(["M1", "M2"]);
    expect(Object.keys(modulos[0])).toEqual(["id", "titulo", "casos", "questoes", "tarefas"]);
    const [caso] = modulos[0].casos;
    expect(caso.titulo).toBe("Quadro sem bloqueio");
    expect(caso.conteudo.etapas.map((e) => e.id)).toEqual(["e1", "r1", "e2"]);
    expect(caso.conteudo.etapas[0].opcoes[1]).toEqual({
      texto: "Seguir",
      comentario: "Comentário: Seguir",
      segura: false,
      proxima: "r1",
    });
    expect(caso.conteudo.etapas[2].opcoes[0].proxima).toBeNull();
    expect(modulos[0].questoes[0]).toEqual({
      pergunta: "Pergunta sintética 1?",
      opcoes: ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
      correta: 0,
      comentario: "Explicação 1.",
    });
    expect(modulos[0].tarefas[0]).toEqual({
      titulo: "Mapa de riscos",
      instrucoes: "Desenhe o mapa do posto.",
      evidencia: "Uma foto do mapa.",
      minutos: 35,
    });
  });

  it("aceita { modulos: [...] } e JSON em texto", () => {
    expect(lerPacoteDeAtividades({ modulos: PACOTE }).modulos).toHaveLength(2);
    expect(lerPacoteDeAtividades(JSON.stringify(PACOTE)).modulos).toHaveLength(2);
  });

  it("arquivo fora do formato: erros legíveis, sem lançar", () => {
    expect(lerPacoteDeAtividades("não é json").erros[0]).toMatch(/JSON válido/);
    expect(lerPacoteDeAtividades({}).erros[0]).toMatch(/lista de módulos/);
    expect(lerPacoteDeAtividades([]).erros[0]).toMatch(/nenhum módulo/);
    expect(lerPacoteDeAtividades([{ titulo: "sem id" }]).erros[0]).toMatch(/código/);
    expect(lerPacoteDeAtividades([{ id: "M1" }, { id: "m1" }]).erros[0]).toMatch(/mais de uma vez/);
    expect(lerPacoteDeAtividades([{ id: "M1", casos: "x" }]).erros[0]).toMatch(/"casos" não é uma lista/);
    expect(() => lerPacoteDeAtividades(null)).not.toThrow();
  });
});

describe("casarModulo, modulosDasAulas e codigosDasAulas", () => {
  it("casa pelo código no começo do nome do módulo; M1 não casa com M10", () => {
    expect(casarModulo("M1", MODULOS_DO_CURSO)).toBe("M1 · Introdução");
    expect(casarModulo("M10", MODULOS_DO_CURSO)).toBe("M10 · Revisão");
    expect(casarModulo("M3", MODULOS_DO_CURSO)).toBe("M3 Análise");
    expect(casarModulo("m1", MODULOS_DO_CURSO)).toBe("M1 · Introdução");
    expect(casarModulo("M2", MODULOS_DO_CURSO)).toBeNull();
    expect(casarModulo("M4", ["M4"])).toBe("M4");
    expect(casarModulo("M5", ["M5·Sem espaço"])).toBe("M5·Sem espaço");
    expect(casarModulo("", MODULOS_DO_CURSO)).toBeNull();
    expect(casarModulo("M1", null)).toBeNull();
  });

  it("os módulos do curso, na ordem das aulas, sem repetir e sem os de aula apagada", () => {
    const aulas = [
      { ordem: 2, modulo: "B" },
      { ordem: 1, modulo: "A" },
      { ordem: 3, modulo: "A" },
      { ordem: 4, modulo: " " },
      { ordem: 5, modulo: "C", deleted_at: "2026-10-01T00:00:00Z" },
    ];
    expect(modulosDasAulas(aulas)).toEqual(["A", "B"]);
  });

  it("os códigos de origem que já existem no curso (aula apagada não conta)", () => {
    const codigos = codigosDasAulas([
      { codigo_origem: "M1-Q" },
      { codigo_origem: null },
      { codigo_origem: "M1-C1", deleted_at: "2026-10-01T00:00:00Z" },
    ]);
    expect([...codigos]).toEqual(["M1-Q"]);
  });
});

describe("planejarImportacao", () => {
  const pacote = lerPacoteDeAtividades(PACOTE);
  const planejar = (extra = {}) =>
    planejarImportacao({
      pacote,
      modulosDoCurso: MODULOS_DO_CURSO,
      codigosExistentes: [],
      tempos: TEMPOS_PADRAO,
      escolhaDeModulo: {},
      ...extra,
    });

  it("cada caso, o questionário e cada tarefa viram aulas, nesta ordem, com título e código de origem", () => {
    const { itens } = planejar();
    expect(itens.map((i) => [i.codigo_origem, i.tipo, i.titulo, i.duracao_seg])).toEqual([
      ["M1-C1", "caso", "M1 · Caso 1: Quadro sem bloqueio", 600],
      ["M1-Q", "questionario", "M1 · Questionário do módulo", 900],
      ["M1-T1", "tarefa", "M1 · Atividade de estudo 1: Mapa de riscos", 2100],
      ["M1-T2", "tarefa", "M1 · Atividade de estudo 2: Lista de verificação", 1200],
    ]);
    expect(itens.every((i) => i.modulo === "M1 · Introdução" && i.moduloPacote === "M1")).toBe(true);
    expect(itens.every((i) => i.problemas.length === 0 && i.jaExiste === false)).toBe(true);
    expect(itens[0].caso).toEqual(pacote.modulos[0].casos[0].conteudo);
    expect(itens[1].questoes).toHaveLength(8);
    expect(itens[1].questoes[3]).toEqual({
      pergunta: "Pergunta sintética 4?",
      opcoes: ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
      correta: 3,
      comentario: "Explicação 4.",
    });
    expect(itens[2].conteudo_texto).toBe("Desenhe o mapa do posto.\n\nO que produzir: Uma foto do mapa.");
    expect(itens[3].conteudo_texto).toBe("Monte a lista.");
  });

  it("o resumo por módulo leva só os módulos com atividades (o M2 fica de fora)", () => {
    expect(planejar().porModulo).toEqual([
      {
        moduloPacote: "M1",
        tituloPacote: "Introdução sintética",
        modulo: "M1 · Introdução",
        origem: "casado",
        casos: 1,
        questoes: 8,
        tarefas: 2,
        minutos: 80,
      },
    ]);
  });

  it("código de origem que já existe no curso: 'já existe' (pulado) e fora do tempo somado", () => {
    const { itens, porModulo } = planejar({ codigosExistentes: ["M1-Q"] });
    expect(itens.find((i) => i.codigo_origem === "M1-Q").jaExiste).toBe(true);
    expect(porModulo[0].minutos).toBe(65);
  });

  it("tempos padrão editáveis; valor inválido volta ao padrão", () => {
    const editados = planejar({ tempos: { questionarioMin: "20", casoMin: 12 } }).itens;
    expect(editados.find((i) => i.tipo === "questionario").duracao_seg).toBe(1200);
    expect(editados.find((i) => i.tipo === "caso").duracao_seg).toBe(720);
    const invalidos = planejar({ tempos: { questionarioMin: "0", casoMin: "abc" } }).itens;
    expect(invalidos.find((i) => i.tipo === "questionario").duracao_seg).toBe(900);
    expect(invalidos.find((i) => i.tipo === "caso").duracao_seg).toBe(600);
  });

  it("módulo sem par vai para um módulo novo; o RH pode escolher outro ou forçar o novo", () => {
    const outro = lerPacoteDeAtividades([
      { id: "M5", titulo: "Título cinco", estudo: [TAREFAS[0]] },
      ...PACOTE,
    ]);
    const semEscolha = planejar({ pacote: outro });
    expect(semEscolha.porModulo[0]).toMatchObject({ modulo: "M5 · Título cinco", origem: "novo" });
    const escolhido = planejar({ pacote: outro, escolhaDeModulo: { M5: "M3 Análise" } });
    expect(escolhido.porModulo[0]).toMatchObject({ modulo: "M3 Análise", origem: "escolhido" });
    expect(escolhido.itens[0].modulo).toBe("M3 Análise");
    const forcado = planejar({ escolhaDeModulo: { M1: MODULO_NOVO } });
    expect(forcado.porModulo[0]).toMatchObject({ modulo: "M1 · Introdução sintética", origem: "novo" });
    // escolha que não é um módulo do curso é ignorada
    expect(planejar({ escolhaDeModulo: { M1: "Outro" } }).porModulo[0].origem).toBe("casado");
  });
});

describe("problemas bloqueiam até a atividade ser desmarcada", () => {
  const COM_PROBLEMAS = [
    {
      id: "M3",
      titulo: "Problemas",
      casos: [
        CASO_RAMIFICADO,
        {
          ...CASO_RAMIFICADO,
          titulo: "Caso quebrado",
          etapas: [
            {
              id: "e1",
              pergunta: "Única?",
              opcoes: [opcao("Certa", true, null), opcao("Errada que encerra", false, null)],
            },
          ],
        },
      ],
      questoes: [
        QUESTOES[0],
        { enunciado: "Sem certa?", opcoes: ["a", "b"], correta: 7, explicacao: "" },
        { enunciado: "Uma só?", opcoes: ["a"], correta: 0 },
      ],
      estudo: [
        { titulo: "Sem instruções", instrucoes: "", evidencia: "x", tempoEstimadoMin: 10 },
        { titulo: "Sem tempo", instrucoes: "Faça.", evidencia: "" },
        TAREFAS[0],
      ],
    },
  ];
  const { itens } = planejarImportacao({
    pacote: lerPacoteDeAtividades(COM_PROBLEMAS),
    modulosDoCurso: [],
    codigosExistentes: [],
    tempos: TEMPOS_PADRAO,
    escolhaDeModulo: {},
  });
  const item = (codigo) => itens.find((i) => i.codigo_origem === codigo);

  it("caso inválido (validarCaso), questão sem resposta certa ou com 1 alternativa, tarefa sem instruções ou tempo", () => {
    expect(item("M3-C1").problemas).toEqual([]);
    expect(item("M3-C2").problemas.length).toBeGreaterThan(0);
    expect(item("M3-C2").problemas.every((p) => p.startsWith("Caso 2: "))).toBe(true);
    expect(item("M3-Q").problemas).toEqual([
      "Questão 2: sem resposta certa",
      "Questão 3: menos de 2 alternativas",
    ]);
    expect(item("M3-T1").problemas).toEqual(["Atividade de estudo 1: sem instruções"]);
    expect(item("M3-T2").problemas).toEqual(["Atividade de estudo 2: sem tempo estimado"]);
    expect(item("M3-T3").problemas).toEqual([]);
  });

  it("com problema marcado não confirma; desmarcadas, entram só as boas", () => {
    expect(situacaoDaImportacao(itens, [])).toMatchObject({
      podeConfirmar: false,
      comProblema: ["M3-C2", "M3-Q", "M3-T1", "M3-T2"],
    });
    const fora = ["M3-C2", "M3-Q", "M3-T1", "M3-T2"];
    expect(situacaoDaImportacao(itens, fora)).toMatchObject({
      podeConfirmar: true,
      aImportar: 2,
      comProblema: [],
    });
    expect(payloadDaImportacao(itens, fora).map((i) => i.codigo_origem)).toEqual(["M3-C1", "M3-T3"]);
    // o payload nunca leva atividade com problema, nem se o diálogo esquecer de desmarcar
    expect(payloadDaImportacao(itens, []).map((i) => i.codigo_origem)).toEqual(["M3-C1", "M3-T3"]);
  });
});

describe("payloadDaImportacao e situacaoDaImportacao", () => {
  const pacote = lerPacoteDeAtividades(PACOTE);
  const { itens } = planejarImportacao({
    pacote,
    modulosDoCurso: MODULOS_DO_CURSO,
    codigosExistentes: [],
    tempos: TEMPOS_PADRAO,
    escolhaDeModulo: {},
  });

  it("monta a lista da RPC (C1), sem os campos da prévia, sem as desmarcadas", () => {
    const modulo = "M1 · Introdução";
    expect(payloadDaImportacao(itens, new Set(["M1-T2"]))).toEqual([
      {
        codigo_origem: "M1-C1",
        tipo: "caso",
        modulo,
        titulo: "M1 · Caso 1: Quadro sem bloqueio",
        duracao_seg: 600,
        caso: pacote.modulos[0].casos[0].conteudo,
      },
      {
        codigo_origem: "M1-Q",
        tipo: "questionario",
        modulo,
        titulo: "M1 · Questionário do módulo",
        duracao_seg: 900,
        questoes: itens[1].questoes,
      },
      {
        codigo_origem: "M1-T1",
        tipo: "tarefa",
        modulo,
        titulo: "M1 · Atividade de estudo 1: Mapa de riscos",
        duracao_seg: 2100,
        conteudo_texto: "Desenhe o mapa do posto.\n\nO que produzir: Uma foto do mapa.",
      },
    ]);
  });

  it("a situação soma o que vai entrar e conta o que será pulado", () => {
    expect(situacaoDaImportacao(itens, [])).toEqual({
      aImportar: 4,
      questoes: 8,
      minutos: 80,
      puladas: 0,
      comProblema: [],
      podeConfirmar: true,
    });
    const jaFeito = itens.map((i) => ({ ...i, jaExiste: true }));
    expect(situacaoDaImportacao(jaFeito, [])).toMatchObject({ aImportar: 0, puladas: 4, podeConfirmar: false });
  });
});

describe("exercícios pós-vídeo (questionarios_por_video)", () => {
  const AULAS_DO_CURSO = [
    {
      id: "v1",
      ordem: 1,
      tipo: "video",
      modulo: "SEP 1",
      titulo: "Vídeo do S02A",
      video_ref: "treinamentos/emp/2026/10/1a2b-NR10_S02A_cena.mp4",
    },
    {
      id: "v2",
      ordem: 2,
      tipo: "video",
      modulo: "SEP 1",
      titulo: "Vídeo do S02AB",
      video_ref: "treinamentos/emp/2026/10/3c4d-S02AB.mp4",
    },
    {
      id: "v3",
      ordem: 3,
      tipo: null,
      modulo: "SEP 2",
      titulo: "Vídeo antigo, sem tipo",
      video_ref: "treinamentos/emp/2026/10/5e6f-s03b.mp4",
    },
    {
      id: "v4",
      ordem: 4,
      tipo: "video",
      modulo: "SEP 2",
      titulo: "Vídeo removido",
      video_ref: "treinamentos/emp/2026/10/7a8b-S04C.mp4",
      deleted_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "p1",
      ordem: 5,
      tipo: "pdf",
      modulo: "SEP 2",
      titulo: "Apostila",
      arquivo_ref: "treinamentos/emp/2026/10/9c0d-S05D.pdf",
    },
    {
      id: "y1",
      ordem: 6,
      tipo: "video",
      fonte: "youtube",
      youtube_id: "abcdefghijk",
      modulo: "SEP 3",
      titulo: "Vídeo do YouTube",
    },
  ];
  const POR_VIDEO = {
    tipo: FORMATO_POR_VIDEO,
    itens: [
      {
        video: "S02A",
        questoes: [
          {
            pergunta: "Pergunta pós-vídeo 1?",
            opcoes: ["Certa", "Errada 1", "Errada 2", "Errada 3"],
            correta: 0,
            comentario: "Comentário 1.",
          },
          { pergunta: "Pergunta pós-vídeo 2?", opcoes: ["Errada", "Certa"], correta: 1, comentario: "Comentário 2." },
        ],
      },
      {
        video: "s03b",
        questoes: [{ pergunta: "Pergunta 3?", opcoes: ["a", "b", "c", "d"], correta: 3, comentario: "" }],
      },
      { video: "S99Z", questoes: [{ pergunta: "Pergunta 4?", opcoes: ["a", "b"], correta: 0, comentario: "c" }] },
    ],
  };

  it("reconhece o formato do arquivo", () => {
    expect(formatoDoArquivo(POR_VIDEO)).toBe("por_video");
    expect(formatoDoArquivo(JSON.stringify(POR_VIDEO))).toBe("por_video");
    expect(formatoDoArquivo(PACOTE)).toBe("pacote");
    expect(formatoDoArquivo({ modulos: [] })).toBe("pacote");
  });

  it("lê os itens; o código do vídeo fica em maiúsculas", () => {
    const { itens, erros } = lerQuestionariosPorVideo(POR_VIDEO);
    expect(erros).toEqual([]);
    expect(itens.map((i) => i.video)).toEqual(["S02A", "S03B", "S99Z"]);
    expect(itens[0].questoes[1]).toEqual({
      pergunta: "Pergunta pós-vídeo 2?",
      opcoes: ["Errada", "Certa"],
      correta: 1,
      comentario: "Comentário 2.",
    });
  });

  it("arquivo fora do formato, item sem vídeo ou vídeo repetido: erros legíveis", () => {
    expect(lerQuestionariosPorVideo({ tipo: "outro" }).erros[0]).toMatch(/questionarios_por_video/);
    expect(lerQuestionariosPorVideo({ tipo: FORMATO_POR_VIDEO, itens: [] }).erros[0]).toMatch(/itens/);
    const ruins = lerQuestionariosPorVideo({
      tipo: FORMATO_POR_VIDEO,
      itens: [{ questoes: [] }, { video: "S02A" }, { video: "s02a" }],
    });
    expect(ruins.erros).toHaveLength(2);
    expect(ruins.erros[1]).toMatch(/S02A aparece mais de uma vez/);
  });

  it("acharAulaDoVideo: o código como pedaço do nome do arquivo do vídeo, sem caixa; S02A não casa com S02AB", () => {
    expect(acharAulaDoVideo("S02A", AULAS_DO_CURSO)?.id).toBe("v1");
    expect(acharAulaDoVideo("S02AB", AULAS_DO_CURSO)?.id).toBe("v2");
    // depois do uuid do upload pela tela ("<uuid>-<nome>") e com o tipo antigo vazio (= vídeo)
    expect(acharAulaDoVideo("S03B", AULAS_DO_CURSO)?.id).toBe("v3");
    expect(acharAulaDoVideo("S04C", AULAS_DO_CURSO)).toBeNull(); // aula apagada
    expect(acharAulaDoVideo("S05D", AULAS_DO_CURSO)).toBeNull(); // PDF não é vídeo
    expect(acharAulaDoVideo("S0", AULAS_DO_CURSO)).toBeNull();
    expect(acharAulaDoVideo("S.2A", AULAS_DO_CURSO)).toBeNull(); // o código não vira expressão regular
    expect(acharAulaDoVideo("", AULAS_DO_CURSO)).toBeNull();
  });

  it("planeja um questionário logo depois de cada vídeo, herdando o módulo; o que falta vira problema", () => {
    const arquivo = lerQuestionariosPorVideo(POR_VIDEO);
    const { itens } = planejarImportacaoPorVideo({
      arquivo,
      aulas: AULAS_DO_CURSO,
      codigosExistentes: ["PV-S03B"],
    });
    expect(itens.map((i) => i.codigo_origem)).toEqual(["PV-S02A", "PV-S03B", "PV-S99Z"]);
    expect(itens[0]).toMatchObject({
      tipo: "questionario",
      depois_da_aula_id: "v1",
      modulo: "SEP 1",
      titulo: "Exercícios do vídeo: Vídeo do S02A",
      duracao_seg: TEMPO_PADRAO_POS_VIDEO_MIN * 60,
      video: "S02A",
      problemas: [],
      jaExiste: false,
    });
    expect(itens[1]).toMatchObject({ depois_da_aula_id: "v3", jaExiste: true });
    expect(itens[2]).toMatchObject({
      depois_da_aula_id: null,
      titulo: "Exercícios do vídeo S99Z",
      problemas: ["vídeo S99Z não encontrado neste curso"],
    });
    const comTempo = planejarImportacaoPorVideo({ arquivo, aulas: AULAS_DO_CURSO, minutos: "7" });
    expect(comTempo.itens[0].duracao_seg).toBe(420);
  });

  it("código que casa com mais de uma aula de vídeo é problema (o RH confere antes)", () => {
    const duplicado = [
      ...AULAS_DO_CURSO,
      { id: "v9", ordem: 9, tipo: "video", titulo: "Outra cópia", video_ref: "t/e/9-S02A.mp4" },
    ];
    const { itens } = planejarImportacaoPorVideo({
      arquivo: lerQuestionariosPorVideo(POR_VIDEO),
      aulas: duplicado,
    });
    expect(itens[0].problemas[0]).toMatch(/2 aulas de vídeo/);
  });

  it("o payload leva depois_da_aula_id; a situação bloqueia até desmarcar o vídeo não encontrado", () => {
    const { itens } = planejarImportacaoPorVideo({
      arquivo: lerQuestionariosPorVideo(POR_VIDEO),
      aulas: AULAS_DO_CURSO,
      codigosExistentes: ["PV-S03B"],
    });
    expect(situacaoDaImportacao(itens, [])).toMatchObject({
      podeConfirmar: false,
      comProblema: ["PV-S99Z"],
      puladas: 1,
    });
    expect(situacaoDaImportacao(itens, ["PV-S99Z"])).toMatchObject({ podeConfirmar: true, aImportar: 1 });
    expect(payloadDaImportacao(itens, ["PV-S99Z"])).toEqual([
      {
        codigo_origem: "PV-S02A",
        tipo: "questionario",
        modulo: "SEP 1",
        titulo: "Exercícios do vídeo: Vídeo do S02A",
        duracao_seg: 300,
        questoes: itens[0].questoes,
        depois_da_aula_id: "v1",
      },
    ]);
  });
});

describe("minutosDoTempo, resumo e erros da RPC", () => {
  it("minutos inteiros de 1 a 600", () => {
    expect(minutosDoTempo("15")).toBe(15);
    expect(minutosDoTempo(600)).toBe(600);
    for (const v of ["", null, "0", "12.5", "abc", 601]) expect(minutosDoTempo(v), String(v)).toBeNull();
  });

  it("o resumo depois de importar", () => {
    expect(textoDoResumoDaImportacao({ criadas: 4, puladas: 0, questoes: 8 })).toBe(
      "4 aulas criadas e 8 questões gravadas."
    );
    expect(textoDoResumoDaImportacao({ criadas: 1, puladas: 2, questoes: 0 })).toBe(
      "1 aula criada; 2 já existiam e foram puladas."
    );
    expect(textoDoResumoDaImportacao({ criadas: 0, puladas: 3, questoes: 0 })).toBe(
      "Nada novo: as 3 atividades já existiam e foram puladas."
    );
    expect(textoDoResumoDaImportacao({ criadas: 0, puladas: 1, questoes: 0 })).toBe(
      "Nada novo: a atividade já existia e foi pulada."
    );
    expect(textoDoResumoDaImportacao(null)).toBe("Nenhuma atividade foi importada.");
  });

  it("erro da RPC vira frase em português", () => {
    expect(mensagemDoErroDaImportacao({ code: "42501", message: "x" })).toBe(
      "Sem permissão para importar atividades: é preciso Treinamentos EAD → Editar."
    );
    expect(mensagemDoErroDaImportacao({ code: "22023", message: "atividade M3-C1 malformada" })).toBe(
      "O banco recusou uma atividade do arquivo: atividade M3-C1 malformada"
    );
    expect(mensagemDoErroDaImportacao({ code: "23505" })).toMatch(/ao mesmo tempo/);
    expect(mensagemDoErroDaImportacao({ message: "falhou" })).toBe(
      "Não foi possível importar as atividades: falhou"
    );
    expect(mensagemDoErroDaImportacao(undefined)).toBe("Não foi possível importar as atividades.");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/lib/ead-atividades-importar.test.js`
Expected: FAIL — `Failed to load url ./ead-atividades-importar`.

- [ ] **Step 3: Implementar `apps/web/src/lib/ead-atividades-importar.js`**

```js
/**
 * Importação das atividades interativas para um curso EAD (tela do RH, "Importar atividades") — regra pura, sem
 * DOM e sem rede. Quem usa: components/seguranca/ImportarAtividadesDialog.jsx. Testes:
 * ead-atividades-importar.test.js. Spec: docs/superpowers/specs/2026-10-14-ead-atividades-interativas-design.md,
 * §5.1 (A7, A8). Os imports levam a extensão: o script de conferência do pacote (fora do repositório) roda este
 * arquivo direto no Node.
 *
 * Dois arquivos de entrada:
 *  1. O pacote do material (lista de módulos, ou { modulos: [...] }): cada módulo { id, titulo, casos, questoes,
 *     estudo } vira, depois da última aula do módulo do curso, um caso por caso ("Mx · Caso n: título", Mx-Cn), um
 *     questionário com todas as questões ("Mx · Questionário do módulo", Mx-Q) e uma atividade de estudo por tarefa
 *     ("Mx · Atividade de estudo n: título", Mx-Tn). Campos desconhecidos (objetivos, apostila, pratica...) ficam de
 *     fora (a prática presencial é das sessões práticas, §13).
 *  2. Os exercícios pós-vídeo ({ tipo: "questionarios_por_video", itens: [{ video, questoes }] }): cada item vira um
 *     questionário logo DEPOIS da aula de vídeo daquele código ("Exercícios do vídeo: <título>", PV-<código>), que
 *     herda o módulo dela.
 *
 * Nada é gravado aqui: o plano mostra a prévia, com os problemas de cada atividade e o que já existe no curso
 * (mesmo código de origem: pulado), e `payloadDaImportacao` monta a lista da RPC `importar_atividades_ead`
 * (contrato C1), que grava tudo ou nada.
 */
import { validarCaso } from "./ead-caso.js";

/** Tempos padrão das atividades sem tempo no pacote (A8); as tarefas trazem o próprio. */
export const TEMPOS_PADRAO = Object.freeze({ questionarioMin: 15, casoMin: 10 });
/** Tempo padrão de cada questionário pós-vídeo. */
export const TEMPO_PADRAO_POS_VIDEO_MIN = 5;
/** Escolha "novo módulo no fim do curso" no diálogo. */
export const MODULO_NOVO = "__novo__";
/** O `tipo` do arquivo dos exercícios pós-vídeo. */
export const FORMATO_POR_VIDEO = "questionarios_por_video";

const LIMITE_DE_MINUTOS = 600;
const MAX_ALTERNATIVAS = 6;

const lista = (v) => (Array.isArray(v) ? v : []);
const texto = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const conjunto = (v) => (v instanceof Set ? v : new Set(lista(v)));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const escaparRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function lerJson(json) {
  if (typeof json !== "string") return { dados: json, erro: null };
  try {
    return { dados: JSON.parse(json.replace(/^﻿/, "")), erro: null };
  } catch {
    return { dados: null, erro: "O arquivo não é um JSON válido." };
  }
}

/** O formato do arquivo: "por_video" (exercícios pós-vídeo) ou "pacote" (o material, lista de módulos). */
export function formatoDoArquivo(json) {
  const { dados } = lerJson(json);
  return dados &&
    typeof dados === "object" &&
    !Array.isArray(dados) &&
    dados.tipo === FORMATO_POR_VIDEO
    ? "por_video"
    : "pacote";
}

/** Minutos digitados no diálogo: inteiro de 1 a 600; o resto é inválido (null). */
export function minutosDoTempo(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const n = Number(String(valor).trim().replace(",", "."));
  return Number.isInteger(n) && n >= 1 && n <= LIMITE_DE_MINUTOS ? n : null;
}

// ------------------------------------------------------------------------------------------- leitura

function lerCaso(bruto) {
  const c = bruto && typeof bruto === "object" ? bruto : {};
  return {
    titulo: texto(c.titulo),
    conteudo: {
      contexto: texto(c.contexto),
      etapas: lista(c.etapas).map((e) => ({
        id: texto(e?.id),
        pergunta: texto(e?.pergunta),
        opcoes: lista(e?.opcoes).map((o) => ({
          texto: texto(o?.texto),
          // o pacote chama de "feedback" o que o SIGO chama de "comentario"
          comentario: texto(o?.feedback ?? o?.comentario),
          segura: o?.segura === true,
          proxima: texto(o?.proxima) || null,
        })),
      })),
      reflexao: texto(c.reflexao),
    },
  };
}

function lerQuestao(bruto) {
  const q = bruto && typeof bruto === "object" ? bruto : {};
  return {
    pergunta: texto(q.enunciado ?? q.pergunta),
    opcoes: lista(q.opcoes).map((o) => texto(o && typeof o === "object" ? o.texto : o)),
    correta: Number.isInteger(q.correta) ? q.correta : null,
    comentario: texto(q.explicacao ?? q.comentario),
  };
}

function lerTarefa(bruto) {
  const t = bruto && typeof bruto === "object" ? bruto : {};
  const minutos = Number(t.tempoEstimadoMin ?? t.minutos);
  return {
    titulo: texto(t.titulo),
    instrucoes: texto(t.instrucoes),
    evidencia: texto(t.evidencia),
    minutos:
      Number.isFinite(minutos) && minutos > 0 && minutos <= LIMITE_DE_MINUTOS
        ? Math.round(minutos)
        : null,
  };
}

/**
 * Lê o pacote do material: lista de módulos ou { modulos: [...] } (objeto ou o JSON em texto). Cada módulo sai como
 * { id, titulo, casos: [{ titulo, conteudo }], questoes, tarefas } no formato do SIGO (feedback → comentario,
 * enunciado → pergunta, explicacao → comentario, estudo → tarefas). `erros` lista o que impede ler o arquivo
 * (formato, módulo sem código, código repetido, campo que devia ser lista).
 */
export function lerPacoteDeAtividades(json) {
  const { dados, erro } = lerJson(json);
  if (erro) return { modulos: [], erros: [erro] };
  const brutos = Array.isArray(dados) ? dados : Array.isArray(dados?.modulos) ? dados.modulos : null;
  if (!brutos) {
    return {
      modulos: [],
      erros: ['O arquivo não traz a lista de módulos (uma lista, ou { "modulos": [...] }).'],
    };
  }
  if (!brutos.length) return { modulos: [], erros: ["O arquivo não tem nenhum módulo."] };
  const erros = [];
  const vistos = new Set();
  const modulos = [];
  brutos.forEach((m, i) => {
    const id = texto(m?.id);
    if (!id) {
      erros.push(`O ${i + 1}º módulo do arquivo não tem o código (id, ex.: "M3").`);
      return;
    }
    if (vistos.has(id.toUpperCase())) {
      erros.push(`O módulo ${id} aparece mais de uma vez no arquivo.`);
      return;
    }
    vistos.add(id.toUpperCase());
    const tarefas = m.estudo ?? m.tarefas;
    for (const [campo, valor] of [
      ["casos", m.casos],
      ["questoes", m.questoes],
      ["estudo", tarefas],
    ]) {
      if (valor !== undefined && valor !== null && !Array.isArray(valor)) {
        erros.push(`Módulo ${id}: "${campo}" não é uma lista.`);
      }
    }
    modulos.push({
      id,
      titulo: texto(m.titulo),
      casos: lista(m.casos).map(lerCaso),
      questoes: lista(m.questoes).map(lerQuestao),
      tarefas: lista(tarefas).map(lerTarefa),
    });
  });
  return { modulos, erros };
}

/**
 * Lê o arquivo dos exercícios pós-vídeo: { tipo: "questionarios_por_video", itens: [{ video, questoes }] }. O
 * código do vídeo sai em maiúsculas (o código de origem "PV-<video>" não duplica por diferença de caixa).
 */
export function lerQuestionariosPorVideo(json) {
  const { dados, erro } = lerJson(json);
  if (erro) return { itens: [], erros: [erro] };
  if (
    !dados ||
    typeof dados !== "object" ||
    Array.isArray(dados) ||
    dados.tipo !== FORMATO_POR_VIDEO
  ) {
    return { itens: [], erros: [`O arquivo não é do formato "${FORMATO_POR_VIDEO}".`] };
  }
  if (!Array.isArray(dados.itens) || !dados.itens.length) {
    return { itens: [], erros: ['O arquivo não traz a lista "itens", com os vídeos e as questões.'] };
  }
  const erros = [];
  const vistos = new Set();
  const itens = [];
  dados.itens.forEach((item, i) => {
    const video = texto(item?.video).toUpperCase();
    if (!video) {
      erros.push(`O ${i + 1}º item do arquivo não tem o código do vídeo ("video").`);
      return;
    }
    if (vistos.has(video)) {
      erros.push(`O vídeo ${video} aparece mais de uma vez no arquivo.`);
      return;
    }
    vistos.add(video);
    if (item.questoes !== undefined && item.questoes !== null && !Array.isArray(item.questoes)) {
      erros.push(`Vídeo ${video}: "questoes" não é uma lista.`);
    }
    itens.push({ video, questoes: lista(item.questoes).map(lerQuestao) });
  });
  return { itens, erros };
}

// ------------------------------------------------------------------------------------- o curso

/**
 * O módulo do curso que casa com o código do módulo do pacote: o texto que É o código ou começa com "M3 " ou
 * "M3·" (sem diferenciar maiúsculas). "M1" não casa com "M10 · ...". Devolve o texto como está no curso (é ele que
 * vai para a aula), ou null.
 */
export function casarModulo(idModulo, modulosDoCurso) {
  const id = texto(idModulo).toUpperCase();
  if (!id) return null;
  for (const m of lista(modulosDoCurso)) {
    const t = texto(m).toUpperCase();
    if (t === id || t.startsWith(`${id} `) || t.startsWith(`${id}·`)) return m;
  }
  return null;
}

const porOrdem = (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0);
const vivas = (aulas) => lista(aulas).filter((a) => a && !a.deleted_at);

/** Os módulos do curso (texto como gravado), na ordem das aulas, sem repetir; aula apagada não conta. */
export function modulosDasAulas(aulas) {
  const modulos = [];
  for (const a of vivas(aulas).sort(porOrdem)) {
    if (typeof a.modulo === "string" && a.modulo.trim() && !modulos.includes(a.modulo)) {
      modulos.push(a.modulo);
    }
  }
  return modulos;
}

/** Os códigos de origem que já existem no curso (aulas não apagadas): reimportar não duplica. */
export function codigosDasAulas(aulas) {
  return new Set(vivas(aulas).map((a) => a.codigo_origem).filter(Boolean));
}

/** As aulas de vídeo (não apagadas) cujo arquivo tem o código como pedaço do nome, em ordem. */
function aulasDoVideo(codigo, aulas) {
  const c = texto(codigo);
  if (!c) return [];
  // o upload pela tela grava "<uuid>-<nome>" (lib/ead-upload.js): o hífen também separa o código
  const padrao = new RegExp(`(^|[/_-])${escaparRegex(c)}(_|\\.)`, "i");
  return vivas(aulas)
    .filter(
      (a) =>
        (a.tipo || "video") === "video" &&
        typeof a.video_ref === "string" &&
        padrao.test(a.video_ref)
    )
    .sort(porOrdem);
}

/**
 * A aula de vídeo do código (ex.: "S02A"): a 1ª aula de vídeo não apagada cujo `video_ref` tem o código como
 * pedaço do nome do arquivo (entre "/", "_" ou "-" e "_" ou "."), sem diferenciar maiúsculas. "S02A" não casa com
 * "S02AB". Vídeo do YouTube (sem arquivo) nunca casa. Sem aula: null.
 */
export function acharAulaDoVideo(codigo, aulas) {
  return aulasDoVideo(codigo, aulas)[0] ?? null;
}

// ------------------------------------------------------------------------------------- o plano

/** As questões no formato da RPC (alternativas vazias saem, a correta acompanha) e os problemas de cada uma. */
function questoesParaGravar(questoes) {
  const problemas = [];
  const paraGravar = lista(questoes).map((q, i) => {
    const n = i + 1;
    const preenchidas = q.opcoes.filter(Boolean);
    const certaOk =
      q.correta !== null && q.correta >= 0 && q.correta < q.opcoes.length && !!q.opcoes[q.correta];
    if (!q.pergunta) problemas.push(`Questão ${n}: sem enunciado`);
    if (preenchidas.length < 2) problemas.push(`Questão ${n}: menos de 2 alternativas`);
    if (preenchidas.length > MAX_ALTERNATIVAS) {
      problemas.push(`Questão ${n}: mais de ${MAX_ALTERNATIVAS} alternativas`);
    }
    if (!certaOk) problemas.push(`Questão ${n}: sem resposta certa`);
    return {
      pergunta: q.pergunta,
      opcoes: preenchidas,
      correta: certaOk ? q.opcoes.slice(0, q.correta).filter(Boolean).length : 0,
      comentario: q.comentario || null,
    };
  });
  return { questoes: paraGravar, problemas };
}

/** Para onde vão as atividades do módulo do pacote: o escolhido, o casado pelo código ou um módulo novo. */
function destinoDoModulo(m, modulosDoCurso, escolha) {
  const novo = { modulo: m.titulo ? `${m.id} · ${m.titulo}` : m.id, origem: "novo" };
  if (escolha === MODULO_NOVO) return novo;
  if (typeof escolha === "string" && modulosDoCurso.includes(escolha)) {
    return { modulo: escolha, origem: "escolhido" };
  }
  const casado = casarModulo(m.id, modulosDoCurso);
  return casado ? { modulo: casado, origem: "casado" } : novo;
}

/**
 * O plano da importação do pacote: as aulas que seriam criadas (por módulo e nesta ordem: casos, questionário,
 * tarefas), cada uma com os problemas que bloqueiam o "Confirmar" e se já existe no curso (pulada), e o resumo por
 * módulo (só os módulos com atividades; `minutos` soma o que ainda não existe). `escolhaDeModulo`: { M3: texto de
 * um módulo do curso | MODULO_NOVO }. Tempos inválidos voltam ao padrão (o diálogo avisa antes).
 */
export function planejarImportacao({
  pacote,
  modulosDoCurso,
  codigosExistentes,
  tempos,
  escolhaDeModulo,
} = {}) {
  const existentes = conjunto(codigosExistentes);
  const doCurso = lista(modulosDoCurso);
  const escolhas = escolhaDeModulo && typeof escolhaDeModulo === "object" ? escolhaDeModulo : {};
  const minQuestionario = minutosDoTempo(tempos?.questionarioMin) ?? TEMPOS_PADRAO.questionarioMin;
  const minCaso = minutosDoTempo(tempos?.casoMin) ?? TEMPOS_PADRAO.casoMin;
  const itens = [];
  const porModulo = [];

  for (const m of lista(pacote?.modulos)) {
    if (!m.casos.length && !m.questoes.length && !m.tarefas.length) continue;
    const { modulo, origem } = destinoDoModulo(m, doCurso, escolhas[m.id]);
    const comum = (codigo_origem) => ({
      codigo_origem,
      modulo,
      moduloPacote: m.id,
      jaExiste: existentes.has(codigo_origem),
    });
    const doModulo = [];

    m.casos.forEach((c, i) => {
      const n = i + 1;
      doModulo.push({
        ...comum(`${m.id}-C${n}`),
        tipo: "caso",
        titulo: c.titulo ? `${m.id} · Caso ${n}: ${c.titulo}` : `${m.id} · Caso ${n}`,
        duracao_seg: minCaso * 60,
        caso: c.conteudo,
        problemas: validarCaso(c.conteudo).map((p) => `Caso ${n}: ${p.texto}`),
      });
    });

    if (m.questoes.length) {
      const { questoes, problemas } = questoesParaGravar(m.questoes);
      doModulo.push({
        ...comum(`${m.id}-Q`),
        tipo: "questionario",
        titulo: `${m.id} · Questionário do módulo`,
        duracao_seg: minQuestionario * 60,
        questoes,
        problemas,
      });
    }

    m.tarefas.forEach((t, i) => {
      const n = i + 1;
      const problemas = [];
      if (!t.instrucoes) problemas.push(`Atividade de estudo ${n}: sem instruções`);
      if (t.minutos === null) problemas.push(`Atividade de estudo ${n}: sem tempo estimado`);
      doModulo.push({
        ...comum(`${m.id}-T${n}`),
        tipo: "tarefa",
        titulo: t.titulo
          ? `${m.id} · Atividade de estudo ${n}: ${t.titulo}`
          : `${m.id} · Atividade de estudo ${n}`,
        duracao_seg: (t.minutos ?? 0) * 60,
        conteudo_texto: t.evidencia
          ? `${t.instrucoes}\n\nO que produzir: ${t.evidencia}`
          : t.instrucoes,
        problemas,
      });
    });

    itens.push(...doModulo);
    porModulo.push({
      moduloPacote: m.id,
      tituloPacote: m.titulo,
      modulo,
      origem,
      casos: m.casos.length,
      questoes: m.questoes.length,
      tarefas: m.tarefas.length,
      minutos: Math.round(
        doModulo.filter((i) => !i.jaExiste).reduce((s, i) => s + i.duracao_seg, 0) / 60
      ),
    });
  }
  return { itens, porModulo };
}

/**
 * O plano dos exercícios pós-vídeo (`arquivo` = o que `lerQuestionariosPorVideo` devolveu): um questionário por
 * vídeo, logo depois da aula de vídeo do código (`depois_da_aula_id`), com o módulo dela. Vídeo não encontrado,
 * código em mais de uma aula de vídeo e questão inválida são problemas; código de origem que já existe é pulado.
 */
export function planejarImportacaoPorVideo({ arquivo, aulas, codigosExistentes, minutos } = {}) {
  const existentes = conjunto(codigosExistentes);
  const min = minutosDoTempo(minutos) ?? TEMPO_PADRAO_POS_VIDEO_MIN;
  const itens = lista(arquivo?.itens).map((item) => {
    const achadas = aulasDoVideo(item.video, aulas);
    const aula = achadas[0] ?? null;
    const codigo_origem = `PV-${item.video}`;
    const { questoes, problemas } = questoesParaGravar(item.questoes);
    if (!questoes.length) problemas.push("sem questões");
    if (!aula) problemas.unshift(`vídeo ${item.video} não encontrado neste curso`);
    else if (achadas.length > 1) {
      problemas.unshift(
        `o código ${item.video} aparece em ${achadas.length} aulas de vídeo deste curso`
      );
    }
    return {
      codigo_origem,
      tipo: "questionario",
      depois_da_aula_id: aula ? aula.id : null,
      modulo: aula ? (aula.modulo ?? null) : null,
      titulo: aula ? `Exercícios do vídeo: ${aula.titulo}` : `Exercícios do vídeo ${item.video}`,
      duracao_seg: min * 60,
      questoes,
      video: item.video,
      aulaDoVideo: aula ? { id: aula.id, titulo: aula.titulo } : null,
      problemas,
      jaExiste: existentes.has(codigo_origem),
    };
  });
  return { itens };
}

// ------------------------------------------------------------------------------------ gravação

/**
 * A lista da RPC `importar_atividades_ead` (contrato C1): só as atividades sem problema, que ainda não existem e
 * não foram desmarcadas (`desmarcados`: Set ou lista de códigos de origem), sem os campos da prévia.
 */
export function payloadDaImportacao(itens, desmarcados) {
  const fora = conjunto(desmarcados);
  return lista(itens)
    .filter((i) => i && !i.jaExiste && !lista(i.problemas).length && !fora.has(i.codigo_origem))
    .map((i) => {
      const base = {
        codigo_origem: i.codigo_origem,
        tipo: i.tipo,
        modulo: i.modulo,
        titulo: i.titulo,
        duracao_seg: i.duracao_seg,
      };
      if (i.tipo === "caso") return { ...base, caso: i.caso };
      if (i.tipo === "questionario") {
        return {
          ...base,
          questoes: i.questoes,
          ...(i.depois_da_aula_id ? { depois_da_aula_id: i.depois_da_aula_id } : {}),
        };
      }
      return { ...base, conteudo_texto: i.conteudo_texto };
    });
}

/**
 * O rodapé do diálogo: quantas atividades entram (e quantas questões e minutos), quantas já existem (puladas) e
 * quais estão marcadas com problema. Só confirma com algo a importar e nenhuma marcada com problema.
 */
export function situacaoDaImportacao(itens, desmarcados) {
  const fora = conjunto(desmarcados);
  let aImportar = 0;
  let questoes = 0;
  let segundos = 0;
  let puladas = 0;
  const comProblema = [];
  for (const i of lista(itens)) {
    if (i.jaExiste) {
      puladas += 1;
      continue;
    }
    if (fora.has(i.codigo_origem)) continue;
    if (lista(i.problemas).length) {
      comProblema.push(i.codigo_origem);
      continue;
    }
    aImportar += 1;
    segundos += Number(i.duracao_seg) || 0;
    if (i.tipo === "questionario") questoes += lista(i.questoes).length;
  }
  return {
    aImportar,
    questoes,
    minutos: Math.round(segundos / 60),
    puladas,
    comProblema,
    podeConfirmar: aImportar > 0 && comProblema.length === 0,
  };
}

/** O resumo da RPC ({ criadas, puladas, questoes }) em uma frase. */
export function textoDoResumoDaImportacao(resumo) {
  const criadas = Number(resumo?.criadas) || 0;
  const puladas = Number(resumo?.puladas) || 0;
  const questoes = Number(resumo?.questoes) || 0;
  if (!criadas) {
    if (!puladas) return "Nenhuma atividade foi importada.";
    return puladas === 1
      ? "Nada novo: a atividade já existia e foi pulada."
      : `Nada novo: as ${puladas} atividades já existiam e foram puladas.`;
  }
  let frase = plural(criadas, "aula criada", "aulas criadas");
  if (questoes) frase += ` e ${plural(questoes, "questão gravada", "questões gravadas")}`;
  if (puladas) {
    frase +=
      puladas === 1 ? "; 1 já existia e foi pulada" : `; ${puladas} já existiam e foram puladas`;
  }
  return `${frase}.`;
}

/** O erro da RPC (PostgREST: `code` e `message`) numa frase para o toast. */
export function mensagemDoErroDaImportacao(erro) {
  const codigo = erro?.code;
  const mensagem = texto(erro?.message);
  if (codigo === "42501") {
    return "Sem permissão para importar atividades: é preciso Treinamentos EAD → Editar.";
  }
  if (codigo === "22023") return `O banco recusou uma atividade do arquivo: ${mensagem}`;
  if (codigo === "23505") {
    return "Outra importação gravou estas atividades ao mesmo tempo. Feche e abra de novo para ver o que já existe.";
  }
  return `Não foi possível importar as atividades${mensagem ? `: ${mensagem}` : "."}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/lib/ead-atividades-importar.test.js`
Expected: PASS.

- [ ] **Step 5: Checagens**

```bash
npx prettier --write apps/web/src/lib/ead-atividades-importar.js apps/web/src/lib/ead-atividades-importar.test.js
npx prettier --check apps/web/src/lib/ead-atividades-importar.js apps/web/src/lib/ead-atividades-importar.test.js
node --input-type=module -e "const m = await import('./apps/web/src/lib/ead-atividades-importar.js'); console.log(Object.keys(m).length)"
npm run lint
npm test --workspace=apps/web
```

Expected: prettier OK; o `node` imprime `18` (o arquivo carrega direto no Node, sem o alias do Vite: é o que o
script de conferência da Task 20 usa); lint OK; Vitest com cerca de **+25 testes** (1 arquivo novo) em relação à Task 17, 0 falhas.
(`src/lib` fica fora do ESLint; quem cobre é o teste. Sem mudança no front desenhado: `npm run build` fica para a
Task 19.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ead-atividades-importar.js apps/web/src/lib/ead-atividades-importar.test.js
git status --short && git diff --staged --stat
git commit -F - -- apps/web/src/lib/ead-atividades-importar.js apps/web/src/lib/ead-atividades-importar.test.js <<'EOF'
feat(ead): leitor e plano da importação de atividades

Lê o pacote do material (casos com recuperação, questões e tarefas por módulo) e o
arquivo dos exercícios pós-vídeo, casa os módulos pelo código ("M1" não casa com "M10"),
acha a aula de vídeo pelo código no nome do arquivo, aponta os problemas que bloqueiam o
"Confirmar" e o que já existe no curso, e monta o payload da RPC importar_atividades_ead
(tudo ou nada; reimportar pula pelo código de origem).

Produção: nenhuma nesta task (vai junto com o push do fim do plano).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 19: Diálogo "Importar atividades"

**Files:**

- Create: `apps/web/src/components/seguranca/ImportarAtividadesDialog.jsx`
- Create: `apps/web/src/components/seguranca/ImportarAtividadesDialog.test.jsx`
- Modify: `apps/web/src/components/seguranca/TreinamentosEadTab.jsx` (imports; estado depois de `casoEditando`;
  efeitos; `abrirImportacao` antes de `adicionarAula`; cabeçalho "Aulas" :2286-2288; o diálogo antes de
  `{dialogoConfirmar}`)
- Modify: `apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js` (`describe` novo no fim)

**Interfaces:**

- Consumes: tudo de `lib/ead-atividades-importar.js` (Task 18); `supabase.rpc("importar_atividades_ead",
  { p_curso_id, p_atividades })` (C1; devolve `{ criadas, puladas, questoes }`; erros `42501`, `22023`);
  `avisoDeMudanca("atividades_novas", ...)` (Task 16) pela `confirmarImpacto` da aba.
- Produces: `<ImportarAtividadesDialog aberto onFechar curso aulas onImportado />` (C6; `onImportado(resumo)` com
  `{ criadas, puladas, questoes }`); exports nomeados `PreviaDaImportacao` e `PreviaPorVideo` (a prévia de cada
  formato, desenhada sem estado próprio, para o teste); botão "Importar atividades" na seção "Aulas" do curso, só com
  `pode.editar`.

- [ ] **Step 1: Escrever o teste do diálogo (vai falhar)**

Crie `apps/web/src/components/seguranca/ImportarAtividadesDialog.test.jsx`:

```jsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Os componentes importam utilitários que leem `window` ao carregar; o ambiente de teste não tem DOM.
vi.hoisted(() => {
  const janela = {};
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

// O teste NUNCA carrega o cliente de produção: a RPC lança se for chamada.
vi.mock("@/api/sigoClient", () => ({
  supabase: {
    rpc: vi.fn(() => {
      throw new Error("o diálogo chamou o banco durante o teste");
    }),
  },
  sigo: {},
  resolveStorageUrl: vi.fn(),
}));

// O Dialog do Radix usa portal (precisa de `document`): aqui ele só entrega o conteúdo quando está aberto.
vi.mock("@/components/ui/dialog", () => {
  const Passa = ({ children }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
    DialogContent: Passa,
    DialogHeader: Passa,
    DialogFooter: Passa,
    DialogTitle: Passa,
    DialogDescription: Passa,
  };
});

// O Select do Radix trocado por caixas simples: o teste confere o valor escolhido e as opções.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }) => <div data-valor={value}>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <span data-opcao={value}>{children}</span>,
}));

import ImportarAtividadesDialog, { PreviaDaImportacao, PreviaPorVideo } from "./ImportarAtividadesDialog";
import {
  FORMATO_POR_VIDEO,
  MODULO_NOVO,
  TEMPOS_PADRAO,
  lerPacoteDeAtividades,
  lerQuestionariosPorVideo,
  planejarImportacao,
  planejarImportacaoPorVideo,
} from "@/lib/ead-atividades-importar";

/**
 * Diálogo "Importar atividades" (atividades interativas, A7). `renderToStaticMarkup` não roda efeitos nem
 * cliques: confere o passo 1 e as duas prévias; a leitura, o plano e o payload estão em
 * lib/ead-atividades-importar.test.js. Só dados sintéticos.
 */
const semOperacao = () => {};
const opcao = (texto, segura, proxima) => ({ texto, feedback: `Comentário: ${texto}`, segura, proxima });
const PACOTE = [
  {
    id: "M1",
    titulo: "Introdução sintética",
    casos: [
      {
        titulo: "Caso sintético",
        contexto: "Contexto.",
        etapas: [
          {
            id: "e1",
            pergunta: "Decisão?",
            opcoes: [opcao("Segura", true, null), opcao("Insegura", false, "e1")],
          },
        ],
        reflexao: "Reflexão.",
      },
    ],
    questoes: [
      { enunciado: "Pergunta 1?", opcoes: ["a", "b"], correta: 0, explicacao: "Porque a." },
      { enunciado: "Pergunta 2?", opcoes: ["a", "b"], correta: 5, explicacao: "" },
    ],
    estudo: [{ titulo: "Tarefa sintética", instrucoes: "Faça.", evidencia: "Foto.", tempoEstimadoMin: 30 }],
  },
  { id: "M2", titulo: "Sem atividades", casos: [], questoes: [], estudo: [] },
];
const MODULOS = ["M1 · Introdução", "M2 · Outro"];

describe("ImportarAtividadesDialog", () => {
  it("fechado não desenha nada", () => {
    expect(
      renderToStaticMarkup(
        <ImportarAtividadesDialog aberto={false} onFechar={semOperacao} curso={{ id: "c1" }} aulas={[]} />
      )
    ).toBe("");
  });

  it("aberto começa no passo 1: escolher o arquivo .json (nada é gravado antes do Confirmar)", () => {
    const html = renderToStaticMarkup(
      <ImportarAtividadesDialog
        aberto
        onFechar={semOperacao}
        curso={{ id: "c1", nome: "Curso Sintético" }}
        aulas={[]}
        onImportado={semOperacao}
      />
    );
    expect(html).toContain("Importar atividades");
    expect(html).toContain("Passo 1 de 3");
    expect(html).toContain('accept=".json,application/json"');
    expect(html).toContain("Escolher o arquivo");
    expect(html).not.toContain("Confirmar e importar");
  });
});

describe("PreviaDaImportacao (pacote do material)", () => {
  const plano = planejarImportacao({
    pacote: lerPacoteDeAtividades(PACOTE),
    modulosDoCurso: MODULOS,
    codigosExistentes: ["M1-T1"],
    tempos: TEMPOS_PADRAO,
    escolhaDeModulo: {},
  });
  const html = renderToStaticMarkup(
    <PreviaDaImportacao
      plano={plano}
      modulosDoCurso={MODULOS}
      semAtividades={["M2"]}
      tempos={{ questionarioMin: "15", casoMin: "10" }}
      onTempos={semOperacao}
      onEscolha={semOperacao}
      desmarcados={new Set()}
      onAlternar={semOperacao}
    />
  );

  it("mostra o módulo do arquivo, o módulo do curso casado pelo código e a opção de módulo novo", () => {
    expect(html).toContain("M1 · Introdução sintética");
    expect(html).toContain('data-valor="M1 · Introdução"');
    expect(html).toContain("casado pelo código");
    expect(html).toContain(`data-opcao="${MODULO_NOVO}"`);
    expect(html).toContain("Módulos do arquivo sem atividades: M2.");
  });

  it("cada atividade com o problema que bloqueia, e a que já existe sai desmarcada e travada", () => {
    expect(html).toContain("M1 · Caso 1: Caso sintético");
    expect(html).toContain("Questão 2: sem resposta certa");
    expect(html).toContain("já existe — será pulada");
    const tarefa = html.match(/<input type="checkbox"[^>]*aria-label="Importar M1 · Atividade de estudo 1: [^"]*"[^>]*>/);
    expect(tarefa?.[0]).toContain('disabled=""');
    expect(tarefa?.[0]).not.toContain("checked");
  });

  it("os tempos padrão são editáveis", () => {
    expect(html).toContain('id="importar-tempo-questionario"');
    expect(html).toContain('id="importar-tempo-caso"');
  });
});

describe("PreviaPorVideo (exercícios pós-vídeo)", () => {
  const aulas = [
    {
      id: "v1",
      ordem: 1,
      tipo: "video",
      modulo: "SEP 1",
      titulo: "Vídeo sintético",
      video_ref: "treinamentos/emp/2026/10/1a2b-S02A.mp4",
    },
  ];
  const arquivo = lerQuestionariosPorVideo({
    tipo: FORMATO_POR_VIDEO,
    itens: [
      { video: "S02A", questoes: [{ pergunta: "P1?", opcoes: ["a", "b"], correta: 1, comentario: "c" }] },
      { video: "S09Z", questoes: [{ pergunta: "P2?", opcoes: ["a", "b"], correta: 0, comentario: "c" }] },
    ],
  });
  const plano = planejarImportacaoPorVideo({ arquivo, aulas, codigosExistentes: [] });
  const html = renderToStaticMarkup(
    <PreviaPorVideo
      plano={plano}
      minutos="5"
      onMinutos={semOperacao}
      desmarcados={new Set()}
      onAlternar={semOperacao}
    />
  );

  it("por vídeo: o código, a aula achada, quantas questões e os problemas", () => {
    expect(html).toContain("Exercícios do vídeo: Vídeo sintético");
    expect(html).toContain("Vídeo S02A · depois da aula Vídeo sintético · 1 questão · 5 min");
    expect(html).toContain("vídeo S09Z não encontrado neste curso");
    expect(html).toContain('id="importar-tempo-pos-video"');
  });
});
```

Run: `cd apps/web && npx vitest run src/components/seguranca/ImportarAtividadesDialog.test.jsx`
Expected: FAIL — `Failed to load url ./ImportarAtividadesDialog`.

- [ ] **Step 2: Implementar `apps/web/src/components/seguranca/ImportarAtividadesDialog.jsx`**

```jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/api/sigoClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MODULO_NOVO,
  TEMPOS_PADRAO,
  TEMPO_PADRAO_POS_VIDEO_MIN,
  codigosDasAulas,
  formatoDoArquivo,
  lerPacoteDeAtividades,
  lerQuestionariosPorVideo,
  mensagemDoErroDaImportacao,
  minutosDoTempo,
  modulosDasAulas,
  payloadDaImportacao,
  planejarImportacao,
  planejarImportacaoPorVideo,
  situacaoDaImportacao,
  textoDoResumoDaImportacao,
} from "@/lib/ead-atividades-importar";

const ROTULO_DO_TIPO = {
  caso: "Caso com decisões",
  questionario: "Questionário",
  tarefa: "Atividade de estudo",
};
const TEMPOS_INICIAIS = {
  questionarioMin: String(TEMPOS_PADRAO.questionarioMin),
  casoMin: String(TEMPOS_PADRAO.casoMin),
};
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const minutosDe = (segundos) => Math.round((Number(segundos) || 0) / 60);

/** O texto do arquivo escolhido (o diálogo não guarda o arquivo: só o que foi lido dele). */
function lerArquivoComoTexto(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? ""));
    leitor.onerror = () => reject(leitor.error ?? new Error("falha ao ler o arquivo"));
    leitor.readAsText(arquivo, "utf-8");
  });
}

/** O rodapé da prévia: quanto entra, quanto é pulado e o que ainda bloqueia o "Confirmar". */
function textoDaSelecao(s) {
  let texto =
    `${plural(s.aImportar, "atividade a importar", "atividades a importar")} ` +
    `(${plural(s.questoes, "questão", "questões")}, ${s.minutos} min)`;
  if (s.puladas) {
    texto += `; ${plural(s.puladas, "já existe e será pulada", "já existem e serão puladas")}`;
  }
  texto += ".";
  if (s.comProblema.length) {
    texto +=
      s.comProblema.length === 1
        ? " Desmarque a atividade com problema para confirmar."
        : ` Desmarque as ${s.comProblema.length} atividades com problema para confirmar.`;
  } else if (!s.aImportar) {
    texto += " Nada novo para importar.";
  }
  return texto;
}

/** Uma atividade da prévia: marcar/desmarcar, o que ela é e o que a impede (ou que já existe e será pulada). */
function ItemDaImportacao({ item, marcado, desabilitado, onAlternar, detalhe }) {
  return (
    <li className="rounded-md bg-slate-50 p-2">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={marcado}
          disabled={desabilitado || item.jaExiste}
          onChange={() => onAlternar(item.codigo_origem)}
          aria-label={`Importar ${item.titulo}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-slate-800">{item.titulo}</span>
          <span className="block text-xs text-slate-500">{detalhe}</span>
          {item.jaExiste ? (
            <span className="block text-xs text-slate-500">já existe — será pulada</span>
          ) : item.problemas.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs text-red-700">
              {item.problemas.map((p, k) => (
                <li key={k} className="flex items-start gap-1">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          ) : null}
        </span>
      </label>
    </li>
  );
}

/**
 * Passo 2 do pacote do material: os tempos padrão (A8), e por módulo do arquivo o módulo do curso onde as
 * atividades entram (casado pelo código, escolhido ou novo no fim) e a lista de atividades com os problemas.
 */
export function PreviaDaImportacao({
  plano,
  modulosDoCurso,
  semAtividades = [],
  tempos,
  onTempos,
  onEscolha,
  desmarcados,
  onAlternar,
  desabilitado = false,
}) {
  const temposValidos =
    minutosDoTempo(tempos.questionarioMin) !== null && minutosDoTempo(tempos.casoMin) !== null;
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="importar-tempo-questionario" className="text-xs">
            Tempo de cada questionário (min)
          </Label>
          <Input
            id="importar-tempo-questionario"
            type="number"
            min={1}
            max={600}
            step={1}
            value={tempos.questionarioMin}
            onChange={(e) => onTempos({ ...tempos, questionarioMin: e.target.value })}
            disabled={desabilitado}
            className="mt-0.5 h-9"
          />
        </div>
        <div>
          <Label htmlFor="importar-tempo-caso" className="text-xs">
            Tempo de cada caso (min)
          </Label>
          <Input
            id="importar-tempo-caso"
            type="number"
            min={1}
            max={600}
            step={1}
            value={tempos.casoMin}
            onChange={(e) => onTempos({ ...tempos, casoMin: e.target.value })}
            disabled={desabilitado}
            className="mt-0.5 h-9"
          />
        </div>
        {!temposValidos && (
          <p role="alert" className="text-xs text-red-700 sm:col-span-2">
            Use minutos inteiros de 1 a 600 nos dois tempos.
          </p>
        )}
        <p className="text-xs text-slate-500 sm:col-span-2">
          As atividades de estudo trazem o próprio tempo. Os tempos somam na carga horária do curso e
          podem ser mudados depois, aula por aula.
        </p>
      </div>

      {plano.porModulo.length === 0 && (
        <p className="text-slate-500">O arquivo não tem atividades para importar.</p>
      )}
      {plano.porModulo.map((m) => {
        const itens = plano.itens.filter((i) => i.moduloPacote === m.moduloPacote);
        const idDoModulo = `importar-modulo-${m.moduloPacote}`;
        return (
          <section
            key={m.moduloPacote}
            aria-label={`Módulo ${m.moduloPacote} do arquivo`}
            className="space-y-2 rounded-lg border p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-semibold text-slate-800">
                {m.moduloPacote}
                {m.tituloPacote ? ` · ${m.tituloPacote}` : ""}
              </h4>
              <span className="text-xs text-slate-500">
                {[
                  m.casos && plural(m.casos, "caso", "casos"),
                  m.questoes && `questionário com ${plural(m.questoes, "questão", "questões")}`,
                  m.tarefas && plural(m.tarefas, "atividade de estudo", "atividades de estudo"),
                  `${m.minutos} min a importar`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={idDoModulo} className="text-xs text-slate-600">
                Entra no módulo do curso
              </Label>
              <Select
                value={m.origem === "novo" ? MODULO_NOVO : m.modulo}
                onValueChange={(valor) => onEscolha(m.moduloPacote, valor)}
                disabled={desabilitado}
              >
                <SelectTrigger id={idDoModulo} className="h-8 w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {modulosDoCurso.map((modulo) => (
                    <SelectItem key={modulo} value={modulo}>
                      {modulo}
                    </SelectItem>
                  ))}
                  <SelectItem value={MODULO_NOVO}>Novo módulo no fim do curso</SelectItem>
                </SelectContent>
              </Select>
              {m.origem === "casado" && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 text-emerald-700 border-emerald-300"
                >
                  casado pelo código
                </Badge>
              )}
              {m.origem === "novo" && (
                <span className="text-xs text-slate-500">Novo módulo: {m.modulo}</span>
              )}
            </div>
            <ul className="space-y-1">
              {itens.map((i) => (
                <ItemDaImportacao
                  key={i.codigo_origem}
                  item={i}
                  marcado={!i.jaExiste && !desmarcados.has(i.codigo_origem)}
                  desabilitado={desabilitado}
                  onAlternar={onAlternar}
                  detalhe={[
                    ROTULO_DO_TIPO[i.tipo] ?? i.tipo,
                    `${minutosDe(i.duracao_seg)} min`,
                    i.tipo === "questionario" && plural(i.questoes.length, "questão", "questões"),
                    i.codigo_origem,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {semAtividades.length > 0 && (
        <p className="text-xs text-slate-500">
          Módulos do arquivo sem atividades: {semAtividades.join(", ")}.
        </p>
      )}
    </div>
  );
}

/**
 * Passo 2 dos exercícios pós-vídeo: o tempo de cada questionário e, por vídeo, a aula achada pelo código, quantas
 * questões e os problemas (vídeo não encontrado, questão sem resposta certa).
 */
export function PreviaPorVideo({
  plano,
  minutos,
  onMinutos,
  desmarcados,
  onAlternar,
  desabilitado = false,
}) {
  const valido = minutosDoTempo(minutos) !== null;
  return (
    <div className="space-y-3 text-sm">
      <div className="max-w-xs">
        <Label htmlFor="importar-tempo-pos-video" className="text-xs">
          Tempo de cada questionário pós-vídeo (min)
        </Label>
        <Input
          id="importar-tempo-pos-video"
          type="number"
          min={1}
          max={600}
          step={1}
          value={minutos}
          onChange={(e) => onMinutos(e.target.value)}
          disabled={desabilitado}
          className="mt-0.5 h-9"
        />
        {!valido && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            Use minutos inteiros de 1 a 600.
          </p>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Cada questionário entra logo depois da aula de vídeo do mesmo código e fica no módulo dela. O
        código precisa estar no nome do arquivo do vídeo (ex.: NR10_S02A_cena.mp4 ou S02A.mp4); vídeo
        do YouTube não tem arquivo e não é achado.
      </p>
      <ul className="space-y-1">
        {plano.itens.map((i) => (
          <ItemDaImportacao
            key={i.codigo_origem}
            item={i}
            marcado={!i.jaExiste && !desmarcados.has(i.codigo_origem)}
            desabilitado={desabilitado}
            onAlternar={onAlternar}
            detalhe={[
              `Vídeo ${i.video}`,
              i.aulaDoVideo ? `depois da aula ${i.aulaDoVideo.titulo}` : "aula não encontrada",
              plural(i.questoes.length, "questão", "questões"),
              `${minutosDe(i.duracao_seg)} min`,
            ].join(" · ")}
          />
        ))}
      </ul>
    </div>
  );
}

/** Passo 1: o arquivo (.json). Os erros de leitura ficam aqui, legíveis; nada vai para a prévia. */
function PassoDoArquivo({ lendo, erros, onArquivo }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">
        Aceita o pacote do material (lista de módulos com casos, questões e atividades de estudo) e
        os exercícios pós-vídeo (arquivo com &quot;tipo&quot;: &quot;questionarios_por_video&quot;). Nada é
        gravado antes do &quot;Confirmar&quot;.
      </p>
      <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 text-slate-600 hover:border-slate-400">
        {lendo ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileUp className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{lendo ? "Lendo o arquivo..." : "Escolher o arquivo (.json)"}</span>
        <input
          type="file"
          accept=".json,application/json"
          className="hidden"
          disabled={lendo}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            onArquivo(arquivo);
          }}
        />
      </label>
      {erros.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          <p className="font-medium">O arquivo não pode ser importado:</p>
          <ul className="mt-1 list-disc pl-4">
            {erros.map((erro, i) => (
              <li key={i}>{erro}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * "Importar atividades" (atividades interativas, A7 e A8): passo 1, o arquivo (pacote do material ou exercícios
 * pós-vídeo); passo 2, a prévia (módulo de destino, tempos, problemas que bloqueiam o "Confirmar" até a atividade
 * ser desmarcada, o que já existe e será pulado); passo 3, a gravação de tudo de uma vez pela RPC
 * `importar_atividades_ead` (tudo ou nada) e o resumo. Quem abre confere a permissão (Treinamentos EAD → Editar)
 * e o aviso de impacto; o banco confere de novo (42501).
 */
export default function ImportarAtividadesDialog({ aberto, onFechar, curso, aulas, onImportado }) {
  // { formato: "pacote", nome, pacote } | { formato: "por_video", nome, porVideo } | null
  const [lido, setLido] = useState(null);
  const [errosDoArquivo, setErrosDoArquivo] = useState([]);
  const [lendo, setLendo] = useState(false);
  const [tempos, setTempos] = useState(TEMPOS_INICIAIS);
  const [minutosPosVideo, setMinutosPosVideo] = useState(String(TEMPO_PADRAO_POS_VIDEO_MIN));
  const [escolha, setEscolha] = useState({});
  const [desmarcados, setDesmarcados] = useState(() => new Set());
  const [resumo, setResumo] = useState(null);
  // uma gravação por vez: o ref vale já no 2º clique, antes de a tela redesenhar
  const [importando, setImportando] = useState(false);
  const importandoRef = useRef(false);

  // cada abertura começa do zero (o arquivo anterior não fica na tela)
  useEffect(() => {
    if (!aberto) return;
    setLido(null);
    setErrosDoArquivo([]);
    setLendo(false);
    setTempos(TEMPOS_INICIAIS);
    setMinutosPosVideo(String(TEMPO_PADRAO_POS_VIDEO_MIN));
    setEscolha({});
    setDesmarcados(new Set());
    setResumo(null);
  }, [aberto]);

  const plano = useMemo(() => {
    if (!lido) return null;
    const codigosExistentes = codigosDasAulas(aulas);
    if (lido.formato === "por_video") {
      return planejarImportacaoPorVideo({
        arquivo: lido.porVideo,
        aulas,
        codigosExistentes,
        minutos: minutosPosVideo,
      });
    }
    return planejarImportacao({
      pacote: lido.pacote,
      modulosDoCurso: modulosDasAulas(aulas),
      codigosExistentes,
      tempos,
      escolhaDeModulo: escolha,
    });
  }, [lido, aulas, tempos, escolha, minutosPosVideo]);
  const situacao = useMemo(
    () => (plano ? situacaoDaImportacao(plano.itens, desmarcados) : null),
    [plano, desmarcados]
  );
  const temposValidos =
    lido?.formato === "por_video"
      ? minutosDoTempo(minutosPosVideo) !== null
      : minutosDoTempo(tempos.questionarioMin) !== null && minutosDoTempo(tempos.casoMin) !== null;
  const semAtividades =
    lido?.formato === "pacote"
      ? lido.pacote.modulos
          .filter((m) => !m.casos.length && !m.questoes.length && !m.tarefas.length)
          .map((m) => m.id)
      : [];

  const escolherArquivo = async (arquivo) => {
    if (!arquivo) return;
    setLendo(true);
    setErrosDoArquivo([]);
    setLido(null);
    setEscolha({});
    setDesmarcados(new Set());
    try {
      let conteudo;
      try {
        conteudo = await lerArquivoComoTexto(arquivo);
      } catch (e) {
        setErrosDoArquivo([`Não foi possível ler o arquivo "${arquivo.name}" (${e?.message || e}).`]);
        return;
      }
      let json;
      try {
        json = JSON.parse(conteudo.replace(/^﻿/, ""));
      } catch (e) {
        setErrosDoArquivo([
          `O arquivo "${arquivo.name}" não é um JSON válido (${e?.message || e}). Confira se é o arquivo certo.`,
        ]);
        return;
      }
      if (formatoDoArquivo(json) === "por_video") {
        const porVideo = lerQuestionariosPorVideo(json);
        if (porVideo.erros.length) setErrosDoArquivo(porVideo.erros);
        else setLido({ formato: "por_video", nome: arquivo.name, porVideo });
      } else {
        const pacote = lerPacoteDeAtividades(json);
        if (pacote.erros.length) setErrosDoArquivo(pacote.erros);
        else setLido({ formato: "pacote", nome: arquivo.name, pacote });
      }
    } finally {
      setLendo(false);
    }
  };

  const alternar = (codigo) =>
    setDesmarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(codigo)) novo.delete(codigo);
      else novo.add(codigo);
      return novo;
    });
  const escolher = (moduloPacote, valor) =>
    setEscolha((atual) => ({ ...atual, [moduloPacote]: valor }));

  const confirmar = async () => {
    if (!plano || !situacao?.podeConfirmar || !temposValidos || !curso?.id) return;
    if (importandoRef.current) return;
    const payload = payloadDaImportacao(plano.itens, desmarcados);
    if (!payload.length) return;
    importandoRef.current = true;
    setImportando(true);
    try {
      const { data, error } = await supabase.rpc("importar_atividades_ead", {
        p_curso_id: curso.id,
        p_atividades: payload,
      });
      if (error) {
        console.error("[importar atividades] a RPC recusou:", error);
        toast.error(mensagemDoErroDaImportacao(error), { duration: 12000 });
        return;
      }
      const feito = {
        criadas: Number(data?.criadas) || 0,
        puladas: Number(data?.puladas) || 0,
        questoes: Number(data?.questoes) || 0,
      };
      setResumo(feito);
      toast.success(textoDoResumoDaImportacao(feito));
      onImportado?.(feito);
    } catch (e) {
      console.error("[importar atividades] falha:", e);
      toast.error(mensagemDoErroDaImportacao(e));
    } finally {
      importandoRef.current = false;
      setImportando(false);
    }
  };

  // durante a gravação, Esc, clicar fora e Cancelar não fecham: a importação está a caminho
  const fechar = () => {
    if (importandoRef.current) return;
    onFechar();
  };

  const passo = resumo ? 3 : lido ? 2 : 1;
  return (
    <Dialog open={!!aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar atividades</DialogTitle>
          <DialogDescription>
            {curso?.nome ? `${curso.nome}. ` : ""}Passo {passo} de 3:{" "}
            {passo === 1
              ? "escolha o arquivo."
              : passo === 2
                ? `confira a prévia de ${lido.nome}.`
                : "pronto."}
          </DialogDescription>
        </DialogHeader>

        {resumo ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {textoDoResumoDaImportacao(resumo)}
          </p>
        ) : !lido ? (
          <PassoDoArquivo lendo={lendo} erros={errosDoArquivo} onArquivo={escolherArquivo} />
        ) : lido.formato === "por_video" ? (
          <PreviaPorVideo
            plano={plano}
            minutos={minutosPosVideo}
            onMinutos={setMinutosPosVideo}
            desmarcados={desmarcados}
            onAlternar={alternar}
            desabilitado={importando}
          />
        ) : (
          <PreviaDaImportacao
            plano={plano}
            modulosDoCurso={modulosDasAulas(aulas)}
            semAtividades={semAtividades}
            tempos={tempos}
            onTempos={setTempos}
            onEscolha={escolher}
            desmarcados={desmarcados}
            onAlternar={alternar}
            desabilitado={importando}
          />
        )}

        {lido && !resumo && situacao && (
          <p
            role="status"
            aria-live="polite"
            className={`text-xs ${situacao.podeConfirmar ? "text-slate-600" : "text-amber-700"}`}
          >
            {textoDaSelecao(situacao)}
          </p>
        )}

        <DialogFooter className="gap-2">
          {resumo ? (
            <Button onClick={fechar}>Fechar</Button>
          ) : (
            <>
              {lido && (
                <Button variant="ghost" onClick={() => setLido(null)} disabled={importando}>
                  Escolher outro arquivo
                </Button>
              )}
              <Button variant="outline" onClick={fechar} disabled={importando}>
                Cancelar
              </Button>
              {lido && (
                <Button
                  onClick={confirmar}
                  disabled={importando || !temposValidos || !situacao?.podeConfirmar}
                  className="bg-slate-900 hover:bg-slate-800"
                >
                  {importando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Confirmar e importar
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Run: `cd apps/web && npx vitest run src/components/seguranca/ImportarAtividadesDialog.test.jsx`
Expected: PASS.

- [ ] **Step 3: Escrever as guardas do botão e da RPC (vão falhar)**

Cole no fim de `apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js`:

```js
describe("aba Treinamentos: Importar atividades (Task 19)", () => {
  const dialogo = ler("./ImportarAtividadesDialog.jsx");

  it("o botão só aparece com Editar e abre o diálogo depois do aviso de impacto", () => {
    expect(aba).toMatch(/\{pode\.editar && \(\s*<Button[\s\S]{0,600}Importar atividades/);
    expect(funcao(aba, "abrirImportacao")).toContain('confirmarImpacto("atividades_novas"');
    expect(aba).toMatch(/<ImportarAtividadesDialog[\s\S]*?curso=\{cursoSel\}[\s\S]*?\/>/);
    expect(aba).toMatch(/<ImportarAtividadesDialog[\s\S]*?onImportado=\{[\s\S]*?recarregar\(\)/);
  });

  it("o diálogo grava tudo de uma vez pela RPC do contrato e mostra o erro em português", () => {
    expect(dialogo).toContain('supabase.rpc("importar_atividades_ead", {');
    expect(dialogo).toMatch(/p_curso_id: curso\.id,\s*p_atividades: payload/);
    expect(dialogo).toContain("toast.error(mensagemDoErroDaImportacao(");
    expect(dialogo).not.toMatch(/sigo\.entities/);
    expect(dialogo).toContain('<SelectContent className="z-[9999]">');
  });

  it("uma gravação por vez: o ref trava já no 2º clique e é solto no fim", () => {
    const confirmar = funcao(dialogo, "confirmar");
    expect(confirmar).toContain("if (importandoRef.current) return;");
    expect(confirmar.slice(confirmar.indexOf("finally"))).toContain("importandoRef.current = false;");
  });
});
```

Run: `cd apps/web && npx vitest run src/components/seguranca/TreinamentosEadTab.atividades.test.js`
Expected: FAIL no primeiro teste novo (a aba ainda não tem o botão); os outros dois já passam.

- [ ] **Step 4: Ligar o diálogo na aba**

4.1. Imports de `TreinamentosEadTab.jsx`: depois de `import CasoEditor from "@/components/seguranca/CasoEditor";`
acrescente:

```jsx
import ImportarAtividadesDialog from "@/components/seguranca/ImportarAtividadesDialog";
```

e acrescente `FileUp,` ao import de `lucide-react` (depois de `Download,`).

4.2. Estado, depois de `const [casoEditando, setCasoEditando] = useState(null);`:

```jsx
  // diálogo "Importar atividades" (A7) do curso aberto
  const [importandoAtividades, setImportandoAtividades] = useState(false);
```

4.3. No efeito de `cursoSel?.id` e no da troca de empresa, depois de `setCasoEditando(null);`, acrescente:

```jsx
    setImportandoAtividades(false);
```

4.4. Logo antes de `const abrirCasoNovo = (dados) =>`, acrescente:

```jsx
  // "Importar atividades" (A7): com alunos no meio do curso, o RH vê quantos e o que acontece antes de abrir
  const abrirImportacao = async () => {
    if (!cursoSel?.id) return;
    if (!(await confirmarImpacto("atividades_novas", { cursoId: cursoSel.id }))) return;
    setImportandoAtividades(true);
  };
```

4.5. Cabeçalho da seção "Aulas". Troque:

```jsx
                    <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                      <Video className="w-4 h-4" /> Aulas
                    </h4>
```

por:

```jsx
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                        <Video className="w-4 h-4" /> Aulas
                      </h4>
                      {pode.editar && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={abrirImportacao}
                          disabled={!!envio}
                          title="Casos, questionários e atividades de estudo do pacote do material, ou os exercícios pós-vídeo"
                        >
                          <FileUp className="w-4 h-4 mr-1" /> Importar atividades
                        </Button>
                      )}
                    </div>
```

4.6. Logo antes de `{dialogoConfirmar}`, acrescente:

```jsx
      {/* "Importar atividades" (A7): pacote do material ou exercícios pós-vídeo, prévia e gravação pela RPC */}
      <ImportarAtividadesDialog
        aberto={importandoAtividades && !!cursoSel?.id}
        onFechar={() => setImportandoAtividades(false)}
        curso={cursoSel}
        aulas={cursoSel?.id ? aulasDoCurso(cursoSel.id) : []}
        onImportado={() => {
          recarregar();
          if (cursoSel?.id) carregarQuestoes(cursoSel.id);
        }}
      />
```

- [ ] **Step 5: Rodar os testes da task**

Run: `cd apps/web && npx vitest run src/components/seguranca/ImportarAtividadesDialog.test.jsx src/components/seguranca/TreinamentosEadTab.atividades.test.js src/components/seguranca/TreinamentosEadTab.permissoes.test.js src/components/seguranca/TreinamentosEadTab.dossie.test.js`
Expected: PASS.

- [ ] **Step 6: Checagens**

```bash
npx prettier --write apps/web/src/components/seguranca/ImportarAtividadesDialog.jsx apps/web/src/components/seguranca/ImportarAtividadesDialog.test.jsx apps/web/src/components/seguranca/TreinamentosEadTab.jsx apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js
npx prettier --check apps/web/src/components/seguranca/ImportarAtividadesDialog.jsx apps/web/src/components/seguranca/ImportarAtividadesDialog.test.jsx apps/web/src/components/seguranca/TreinamentosEadTab.jsx apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js
(cd apps/web && npx eslint --rule "no-undef: error" src/components/seguranca/ImportarAtividadesDialog.jsx src/components/seguranca/TreinamentosEadTab.jsx)
npm run lint
npm run build
npm test --workspace=apps/web
node --test "supabase/functions/**/*.test.ts"
```

Expected: prettier OK; ESLint sem erros (`FileReader` é global do navegador e passa no `no-undef`); build OK;
Vitest com cerca de **+9 testes** (1 arquivo novo) em relação à Task 18, 0 falhas; `node --test` sem mudança.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/seguranca/ImportarAtividadesDialog.jsx apps/web/src/components/seguranca/ImportarAtividadesDialog.test.jsx apps/web/src/components/seguranca/TreinamentosEadTab.jsx apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js
git status --short && git diff --staged --stat
git commit -F - -- apps/web/src/components/seguranca/ImportarAtividadesDialog.jsx apps/web/src/components/seguranca/ImportarAtividadesDialog.test.jsx apps/web/src/components/seguranca/TreinamentosEadTab.jsx apps/web/src/components/seguranca/TreinamentosEadTab.atividades.test.js <<'EOF'
feat(ead): diálogo "Importar atividades" no curso

Botão no painel do curso (só com Treinamentos EAD → Editar), depois do aviso de impacto.
O diálogo lê o pacote do material ou os exercícios pós-vídeo, mostra a prévia (módulo de
destino casado pelo código ou escolhido, tempos padrão 15/10/5 min editáveis, problemas
que bloqueiam o "Confirmar", o que já existe e será pulado) e grava tudo de uma vez pela
RPC importar_atividades_ead, com o resumo no fim.

Produção (do plano inteiro, na ordem do §12 da spec): migração 0170, smoke, deploy do
portal-funcionario e push em master; ver docs/HANDOFF-PORTAL-TREINAMENTO.md §9.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 20: Handoff, roteiro de teste, comandos de produção, cargas e verificação final da branch

**Files:**

- Modify: `docs/HANDOFF-PORTAL-TREINAMENTO.md` (§7, item 3 da preparação, :1035, e item 7 do fluxo do aluno,
  :1047-1048; seção nova "## 9" no fim do arquivo, depois de :1098)
- Modify (fora do repositório, arquivo não versionado): `C:/Users/javer/sigoobras-base/.superpowers/sdd/progress.md`
  (uma linha no fim)

**Interfaces:**

- Consumes: tudo das Tasks 1–19 (nomes de arquivo, RPC, eventos, telas); spec §12 (ordem da produção e da carga);
  `lib/ead-atividades-importar.js` (o script de conferência do pacote importa o arquivo direto no Node).
- Produces: a seção "9. Atividades interativas" do handoff (o que mudou, A1–A10, produção, carga do NR-10, carga dos
  exercícios pós-vídeo, roteiro de teste, verificação); a linha do `progress.md`.

- [ ] **Step 1: Atualizar o roteiro da seção 7 (leitura sem tempo mínimo, A5)**

Em `docs/HANDOFF-PORTAL-TREINAMENTO.md`, no item 3 da "Preparação" da seção 7 (linha 1035), troque:

```markdown
   leitura mínima de 60 min (a regra de lastro da T9 exige conteúdo de pelo menos 1 h para carga de 1 h); 1 vídeo curto
```

por:

```markdown
   tempo previsto de 60 min (a regra de lastro da T9 exige conteúdo de pelo menos 1 h para carga de 1 h); 1 vídeo curto
```

e, no item 7 do "Fluxo do aluno", troque:

```markdown
7. Abrir o curso: a 2ª aula está bloqueada. Abrir a apostila no celular (T11): ela aparece na página e o tempo conta;
   "Marcar como lida" só habilita no tempo mínimo. Deixar a aba visível até completar.
```

por:

```markdown
7. Abrir o curso: a 2ª aula está bloqueada. Abrir a apostila no celular e no computador (T11 e seção 9): ela aparece
   na página, desenhada pelo pdf.js; "Marcar como lida" só habilita ao chegar à última página (A5: sem tempo mínimo).
```

(Se o Prettier tiver realinhado essas linhas de outro jeito, procure pelos trechos "leitura mínima de 60 min" e
"só habilita no tempo mínimo".)

- [ ] **Step 2: Acrescentar a seção 9 no fim do handoff**

Cole no fim de `docs/HANDOFF-PORTAL-TREINAMENTO.md` (depois do último item da seção 8):

````markdown
---

## 9. Atividades interativas: questionário, caso e tarefa (14/10/2026)

- **Spec:** `docs/superpowers/specs/2026-10-14-ead-atividades-interativas-design.md` (decisões A1–A10). **Plano:**
  `docs/superpowers/plans/2026-10-14-ead-atividades-interativas.md`. **Branch:** `feat/ead-atividades-interativas`
  (worktree `C:\Users\javer\sigoobras-wt-ead-interativas`). **Migração:** `0170_ead_atividades_interativas.sql`.
- **Status:** código pronto na branch; a produção (9.3) e as cargas (9.4 e 9.5) esperam o OK do Javerson, passo a
  passo.

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
  recomeçar (evento "Caso recomeçado").
- **Tarefa:** instruções e o que produzir; o aluno faz fora da tela e clica "Fiz a atividade" (sem texto do aluno nem
  parecer do tutor, A4).
- **Leituras sem relógio (A5):** texto, PDF (agora pelo pdf.js em todas as telas) e tarefa liberam o botão ao rolar
  até o fim; o 409 `TEMPO_LEITURA` saiu. Vídeo continua com 90%.
- **Tela do RH:** "Nova aula" com os seis tipos; o texto das aulas de texto e de tarefa passa a ser editado na tela;
  "Questões" no menu de cada questionário; "Editar caso" com o editor (problemas na hora, "Salvar caso" só sem
  problema); campo "Nota mínima dos questionários dos módulos"; "Importar atividades" (9.4 e 9.5); a avaliação final
  lista só as questões sem aula; requisitos e "Ver como aluno" com questionário e caso.
- **Detalhes da matrícula e dossiê:** seção "Questionários dos módulos" (cada tentativa abre como a prova); trilha com
  os eventos novos ("Escolha no caso", "Confirmou a atividade de estudo", "Leu até o fim"...); dossiê com
  `questionarios.csv` nos cursos com questionário.
- **Certificado (A9):** nos cursos com atividades, a frente ganha a frase das atividades (quantidades congeladas); o
  verso não muda. Cursos sem atividades emitem exatamente como antes.
- **Não rodar** `tools/ead-sync-cursos.py` nos cursos com atividades: ele não conhece os tipos novos e apaga as aulas.

### 9.2 Decisões do Javerson

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

- **Spec:** `docs/superpowers/specs/2026-10-14-ead-atividades-interativas-design.md` (decisões A1–A10). **Plano:**
  `docs/superpowers/plans/2026-10-14-ead-atividades-interativas.md`. **Branch:** `feat/ead-atividades-interativas`
  (worktree `C:\Users\javer\sigoobras-wt-ead-interativas`). **Migração:** `0170_ead_atividades_interativas.sql`.
- **Status:** código pronto na branch; a produção (9.3) e as cargas (9.4 e 9.5) esperam o OK do Javerson, passo a
  passo.

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
  recomeçar (evento "Caso recomeçado").
- **Tarefa:** instruções e o que produzir; o aluno faz fora da tela e clica "Fiz a atividade" (sem texto do aluno nem
  parecer do tutor, A4).
- **Leituras sem relógio (A5):** texto, PDF (agora pelo pdf.js em todas as telas) e tarefa liberam o botão ao rolar
  até o fim; o 409 `TEMPO_LEITURA` saiu. Vídeo continua com 90%.
- **Tela do RH:** "Nova aula" com os seis tipos; o texto das aulas de texto e de tarefa passa a ser editado na tela;
  "Questões" no menu de cada questionário; "Editar caso" com o editor (problemas na hora, "Salvar caso" só sem
  problema); campo "Nota mínima dos questionários dos módulos"; "Importar atividades" (9.4 e 9.5); a avaliação final
  lista só as questões sem aula; requisitos e "Ver como aluno" com questionário e caso.
- **Detalhes da matrícula e dossiê:** seção "Questionários dos módulos" (cada tentativa abre como a prova); trilha com
  os eventos novos ("Escolha no caso", "Confirmou a atividade de estudo", "Leu até o fim"...); dossiê com
  `questionarios.csv` nos cursos com questionário.
- **Certificado (A9):** nos cursos com atividades, a frente ganha a frase das atividades (quantidades congeladas); o
  verso não muda. Cursos sem atividades emitem exatamente como antes.
- **Não rodar** `tools/ead-sync-cursos.py` nos cursos com atividades: ele não conhece os tipos novos e apaga as aulas.

### 9.2 Decisões do Javerson

| #   | Decisão                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------- |
| A1  | Entram as três atividades do pacote, nesta ordem: questionário do módulo, caso com decisões, tarefa de estudo   |
| A2  | Questionário = estudo guiado: nota ≥ mínima do módulo (80%), tentativas livres e gravadas, correção comentada   |
| A3  | Caso só por clique; a insegura mostra o comentário e segue o roteiro; no fim, "Para refletir" e "Concluir caso" |
| A4  | Tarefa só confirmando ("Fiz a atividade"); sem texto do aluno nem parecer do tutor                              |
| A5  | Sem relógio em atividades e leituras (botão ao rolar até o fim); vídeo segue em 90%; o tempo soma na carga      |
| A6  | Cada atividade é uma aula do curso                                                                              |
| A7  | "Importar atividades" (prévia, tudo ou nada, reimportar não duplica) e criação/edição na tela                   |
| A8  | Tempos padrão na importação: 15 min por questionário e 10 por caso (as tarefas trazem o seu)                    |
| A9  | Certificado: frase de resumo na frente nos cursos com atividades; o verso não muda                              |
| A10 | Migração 0170; produção na ordem de 9.3, cada passo com OK explícito                                            |

Decisão de 14/10, depois da spec: a importação aceita também os **exercícios pós-vídeo** já convertidos em múltipla
escolha (`{ "tipo": "questionarios_por_video", "itens": [{ "video", "questoes" }] }`): cada item vira um questionário
logo depois da aula de vídeo daquele código (código de origem `PV-<vídeo>`, título "Exercícios do vídeo: <título>",
5 min por padrão), no módulo do vídeo.

### 9.3 Produção (na ordem; cada passo só com o OK explícito do Javerson)

```bash
# 1. migração (estrutura, tabelas novas e a RPC importar_atividades_ead; nenhum dado existente muda)
npx supabase@2.118.0 db query --linked -f supabase/migrations/0170_ead_atividades_interativas.sql

# 2. smoke (begin; ... rollback;: desfaz tudo no fim)
npx supabase@2.118.0 db query --linked -f tools/smoke-ead-atividades.sql

# 3. função do portal (questionário, caso, leitura sem relógio, certificado)
npx supabase@2.118.0 functions deploy portal-funcionario --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt --use-api

# 4. front: merge da branch e push em master logo depois do passo 3 (o site novo das leituras precisa do servidor
#    novo, e o servidor novo do site novo)
```

Depois: a carga do NR-10 Básico (9.4), a dos exercícios pós-vídeo (9.5) e o roteiro de teste (9.6). Convém rodar o
roteiro de teste num curso "TESTE EAD — apagar" antes das cargas.

### 9.4 Carga das atividades do NR-10 Básico (Sinergia e Eletro)

**1.** Trazer de volta ao PC o zip do pacote final, `NR10_Parte_1_de_6_Curso_e_Documentos.zip` (em 14/10 ele não está no
PC; os rascunhos M1–M8 estão em `C:\Users\javer\NR10-Material-Avaliacao\conteudo`), e extraí-lo numa pasta própria,
fora do repositório (ex.: `C:\Users\javer\NR10-Material-Avaliacao\pacote-final\`).

**2.** Conferir o formato de `NR10_Basico_Javerson/data/*.json` contra o leitor (`lerPacoteDeAtividades`): módulos
`{ id, titulo, casos, questoes, estudo }`, casos `{ titulo, contexto, etapas[{ id, pergunta, opcoes[{ texto,
feedback, segura, proxima }] }], reflexao }`, questões `{ enunciado, opcoes, correta, explicacao }` e tarefas
`{ titulo, instrucoes, evidencia, tempoEstimadoMin }`. Se diferir, ajustar o leitor e o teste numa task própria
antes de seguir.

**3.** Gerar o arquivo de importação e o relatório de revisão, fora do repositório, com o script abaixo (salvo, por
exemplo, em `C:\Users\javer\NR10-Material-Avaliacao\conferir-pacote.mjs`). Ele só lê o pacote e grava o arquivo de
saída; não fala com o banco. O 3º argumento é um checkout do SIGO com esta branch (o worktree, ou o principal
depois do merge).

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

// cada arquivo pode ser a lista de módulos, { modulos: [...] } ou um módulo só
const brutos = readdirSync(pasta)
  .filter((f) => f.toLowerCase().endsWith(".json"))
  .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
  .flatMap((f) => {
    const j = JSON.parse(readFileSync(join(pasta, f), "utf8").replace(/^\uFEFF/, ""));
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

O relatório (contagens por módulo, quantos casos são ramificados, problemas) vai para o Javerson aprovar antes do
passo 4. Esperado no pacote completo: 36 casos e 96 questões nos 12 módulos, e "Nenhum problema".

**4.** O Javerson importa pela tela, em cada empresa (Sinergia e Eletro): Treinamentos EAD → curso NR-10 Básico → seção
"Aulas" → "Importar atividades" → o arquivo do passo 3. Na prévia, conferir que cada módulo M1–M12 entrou no módulo
do curso "casado pelo código" (se algum vier como "Novo módulo", escolher o módulo certo na lista), tempos 15/10 e
nenhuma atividade com problema; então "Confirmar e importar" e anotar o resumo (aulas criadas, questões, puladas).
Importar o mesmo arquivo de novo não duplica: tudo aparece como "já existe — será pulada".

**5.** Conferência (só leitura) no SQL do Supabase; o Javerson roda e devolve o resultado. As consultas escolhem o curso
pelo nome e a empresa pelo nome (a 1ª mostra quais cursos o filtro pegou: precisam ser os dois NR-10 Básico).

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

Esperado com o pacote completo: em cada empresa, 12 questionários com 8 questões cada e 0 com problema, 36 casos
todos com roteiro, 0 etapa sem escolha segura e 0 insegura que encerra, as tarefas do pacote, 0 código repetido e as
questões da prova final como antes da carga. `lastro_ok` diz se o conteúdo (aulas e atividades) já cobre a carga;
o que faltar é decisão do Javerson e do RT (D1 e D9 da seção 6).

**6.** Na tela: o painel "Requisitos para publicar e emitir certificado" do curso sem pendência de conteúdo; "Ver como
aluno" num módulo (questionário, caso e tarefa).

### 9.5 Carga dos exercícios pós-vídeo

**1.** Origem: o zip `Cursos_Sinergia_Conteudo_Plataforma_RECUPERADO_2026-10-02.zip` (Downloads), extraído numa pasta
própria fora do repositório: `Exercicios_Pos_Video_Rascunho/exercicios_por_video.json` (46 vídeos × 2 perguntas
abertas com a resposta esperada; códigos começando por S = NR-10 SEP, H = NR-35, E = NR-6, G = NR-1) e
`NR10_Basico_Expandido_Rascunho/exercicios_modulos.json` (módulos B01–B15 × 2 perguntas = NR-10 Básico
Reciclagem).

**2.** Conversão para múltipla escolha (trabalho de conteúdo, fora do repositório): cada pergunta aberta vira uma questão
em que a resposta esperada é a alternativa certa, mais 3 erradas plausíveis redigidas, e um comentário que explica a
certa. Um arquivo por curso no formato:

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
`<uuid>-S02A_...` como a tela grava): "S02A" não casa com "S02AB". Vídeo do YouTube não tem arquivo e não é achado.
Nos módulos B01–B15 da Reciclagem, `video` é o código que está no nome do arquivo do vídeo de cada módulo; se os
vídeos não tiverem B01... no nome, a prévia mostra "vídeo B01 não encontrado neste curso" e o caminho é decidido
com o Javerson antes de importar.

**3.** Revisão do Javerson, como RT, de todas as perguntas, alternativas e comentários antes de importar. Nenhum texto
desse material entra no repositório.

**4.** Importação pela tela, curso a curso, nas duas empresas: NR-10 SEP e Reciclagem, NR-35 e Reciclagem, NR-6, NR-1 e
NR-10 Básico Reciclagem ("Importar atividades" → o arquivo do curso → prévia por vídeo: código, aula achada,
número de questões e problemas → desmarcar o que tiver problema, se o Javerson concordar → "Confirmar e
importar"). Cada questionário entra logo depois da aula de vídeo e soma 5 min na carga (editável na prévia). Com 2
questões e nota mínima de 80%, o aluno precisa acertar as 2 (tentativas livres, com a correção comentada).

**5.** Conferência (só leitura), trocando o filtro do nome do curso (`ilike '%NR%35%'` etc.):

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

Depois de 9.3, em `https://www.sigoobras.com.br`, no curso "TESTE EAD — apagar" da seção 7 (ainda em rascunho), com o
funcionário de teste de lá. Só começar com o OK explícito do Javerson.

1. **Nota mínima:** no curso, "Nota mínima dos questionários dos módulos" = 80; salvar.
2. **Questionário pela tela:** "Nova aula" → tipo "Questionário", título "TESTE · Questionário", módulo
   "M1 · Teste", tempo 5 min → +. No menu da aula, "Questões": 3 questões, cada uma com comentário. A linha mostra
   "3 questões"; a "Avaliação final" continua com as suas questões (as do questionário não aparecem lá).
3. **Caso pela tela:** "Nova aula" → tipo "Caso", título "TESTE · Caso", módulo "M1 · Teste", tempo 5 min → + abre o
   editor. Montar e1 (segura → e2; insegura → uma etapa nova r1), r1 (segura → e1; insegura → r1) e e2 (segura → "Fim
   do caso"; insegura → e2), com contexto, comentários e reflexão. Conferir que "Salvar caso" só acende sem problema e
   que "Fim do caso" fica desabilitado numa opção insegura. Salvar.
4. **Tarefa e texto:** "Nova aula" → "Tarefa", título "TESTE · Tarefa", módulo "M1 · Teste", instruções longas (para
   precisar rolar), 5 min. Editar a aula de texto do curso de teste, trocar uma palavra do texto e salvar (antes, só
   por SQL).
5. **Ver como aluno:** errar 1 de 3 no questionário (67%: não conclui, mostra a correção comentada; "Tentar de novo"
   re-sorteia), acertar as 3; no caso, escolher a insegura (comentário em âmbar, vai para r1), voltar e terminar
   ("Para refletir" → "Concluir caso"); na tarefa e no texto, o botão só acende ao rolar até o fim. Nada é gravado.
6. **Importar um arquivo pequeno:** salvar fora do repositório um `teste-atividades.json` com o conteúdo abaixo
   (texto sintético) e importar no curso de teste: a prévia casa "M1" com "M1 · Teste", mostra 1 caso, 1
   questionário com 2 questões e 1 tarefa; confirmar e conferir o resumo (3 aulas, 2 questões). Importar de novo:
   tudo "já existe — será pulada" e o "Confirmar" fica desabilitado.

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

7. **Pós-vídeo (opcional):** se o vídeo do curso de teste foi enviado com o nome `TESTE_V01.mp4`, importar
   `{ "tipo": "questionarios_por_video", "itens": [{ "video": "V01", "questoes": [...] }] }` com 2 questões: o
   questionário entra logo depois do vídeo.
8. **Aluno de verdade** (portal, computador e celular), com a matrícula de teste: leitura até o fim (texto, PDF e
   tarefa), questionário (uma tentativa abaixo da nota e uma acima), caso (uma escolha insegura) e tarefa ("Fiz a
   atividade").
9. **RH:** Detalhes da matrícula → "Questionários dos módulos" (as 2 tentativas, cada uma expandida com as questões
   na ordem do aluno); trilha com "Escolha no caso", "Leu até o fim" e "Confirmou a atividade de estudo"; exportar o
   dossiê e abrir `questionarios.csv`.
10. **Roteiro alterado no meio:** com outra matrícula de teste parada no meio do caso, mudar uma opção do caso (aparece
    o aviso de impacto); no portal, o caso recomeça da primeira etapa e a trilha registra "Caso recomeçado".
11. **Certificado:** aprovar na prova e assinar; a frente traz a frase das atividades ("... 2 questionários (nota
    mínima de 80%), 2 estudos de caso e 2 atividades de estudo", conforme o que o curso de teste tiver).
12. **Limpeza:** como na seção 7. Apagar o curso leva as aulas, as questões e os roteiros dos casos; apagar o
    funcionário leva as matrículas e, com elas, as tentativas dos questionários (o `sigo.permitir_expurgo` da seção 7
    vale também para elas).

### 9.7 Verificação da branch (feita antes de entregar)

As duas suítes inteiras (`node --test "supabase/functions/**/*.test.ts"` e `npm test --workspace=apps/web`), `npm run
lint`, `npm run build`, `npx prettier --check --ignore-unknown` em todos os arquivos tocados pela branch e o
`no-undef` nos componentes alterados, todos sem erro; nenhum UUID real nem texto do material no repositório. Os
números ficam no relatório da Task 20 do plano.
````

- [ ] **Step 3: Formatar e conferir o handoff**

```bash
npx prettier --write docs/HANDOFF-PORTAL-TREINAMENTO.md
npx prettier --check docs/HANDOFF-PORTAL-TREINAMENTO.md
git diff --stat -- docs/HANDOFF-PORTAL-TREINAMENTO.md
```

Expected: o `--write` não muda nada (a seção já vem no formato do Prettier, com 120 colunas e a tabela alinhada; o
SQL não tem formatador e fica como está); `--check` OK; o diff só no item 3 (uma linha) e no item 7 da seção 7 e na
seção 9 nova. Os passos de 9.4 e 9.5 são parágrafos com o número em negrito, e não lista numerada, de propósito: um
bloco de código no meio de uma lista faz o Prettier juntar o passo seguinte ao parágrafo anterior.

- [ ] **Step 4: Verificação final da branch (Git Bash, na raiz do worktree)**

```bash
cd /c/Users/javer/sigoobras-wt-ead-interativas
git status --short
node --test "supabase/functions/**/*.test.ts"
npm test --workspace=apps/web
npm run lint
npm run build
npx prettier --check --ignore-unknown $(git diff --name-only --diff-filter=d master...HEAD) docs/HANDOFF-PORTAL-TREINAMENTO.md
(cd apps/web && npx eslint --rule "no-undef: error" $(git diff --name-only --relative --diff-filter=d master...HEAD -- src/components src/pages src/Layout.jsx))
git diff master...HEAD | grep -nE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" | grep -v "00000000-0000-4000-8000-"
git log --oneline master..HEAD
```

Expected:
- `git status --short`: só `docs/HANDOFF-PORTAL-TREINAMENTO.md` modificado (o commit vem no Step 5) e, se ainda
  estiverem fora de commit, o spec e o plano; nada mais.
- `node --test`: 0 falhas (linha de base 1534 + os testes das Tasks 1–9).
- Vitest: 0 falhas (linha de base 129 arquivos e 2448 testes + os das Tasks 2–19; só nas Tasks 15–19, cerca de
  +125 testes e +7 arquivos).
- `lint` e `build` sem erro; Prettier "All matched files use Prettier code style!"; ESLint sem erros (avisos antigos
  de `react-hooks/exhaustive-deps` podem aparecer).
- O `grep` de UUID não imprime nada.
- `git log`: um commit por task (Tasks 1–19) acima de `master`.

Se algo falhar, pare e corrija na task de origem (commit novo), sem `--amend`.

- [ ] **Step 5: Commit do handoff**

```bash
git add docs/HANDOFF-PORTAL-TREINAMENTO.md
git status --short && git diff --staged --stat
git commit -F - -- docs/HANDOFF-PORTAL-TREINAMENTO.md <<'EOF'
docs(ead): handoff das atividades interativas, produção e cargas

Seção 9 nova no handoff do portal: o que mudou (questionário, caso, tarefa, leitura sem
relógio, importação), as decisões A1-A10, a produção na ordem da spec, a carga do NR-10
Básico (script de conferência fora do repositório e consultas só de leitura), a carga dos
exercícios pós-vídeo e o roteiro de teste. O roteiro da seção 7 passa a dizer que a
leitura conclui ao chegar ao fim (A5).

Produção, na ordem e cada passo com OK do Javerson:
1. npx supabase@2.118.0 db query --linked -f supabase/migrations/0170_ead_atividades_interativas.sql
2. npx supabase@2.118.0 db query --linked -f tools/smoke-ead-atividades.sql
3. npx supabase@2.118.0 functions deploy portal-funcionario --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt --use-api
4. merge da branch e push em master logo depois do passo 3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Registrar no `progress.md` do checkout principal (arquivo não versionado)**

Troque `<node>` e `<vitest>` pelos totais do Step 4 (ex.: "1612 testes" e "135 arquivos, 2701 testes") e rode:

```bash
cat >> /c/Users/javer/sigoobras-base/.superpowers/sdd/progress.md <<'EOF'
- 14/10/2026 — feat/ead-atividades-interativas (worktree sigoobras-wt-ead-interativas): as 20 tasks do plano das atividades interativas (questionário do módulo, caso com decisões, tarefa, leitura sem relógio, tela do RH, importação do pacote e dos exercícios pós-vídeo, trilha/dossiê/certificado) implementadas; suítes verdes (node --test <node>; vitest <vitest>); lint, build e prettier OK. Falta revisão geral da branch e OK do Javerson para a produção (HANDOFF-PORTAL-TREINAMENTO.md §9: 0170, smoke, deploy portal-funcionario, push) e depois as cargas do NR-10 (zip do pacote final ainda fora do PC) e dos pós-vídeo (conversão para múltipla escolha revisada pelo RT).
EOF
tail -n 1 /c/Users/javer/sigoobras-base/.superpowers/sdd/progress.md
```

Expected: a última linha do arquivo é a linha acima, com os totais. Este arquivo não é versionado: não entra em
commit nenhum, e nada mais do checkout principal é tocado.

---

<!-- prettier-ignore-end -->

## Produção (só depois das Tasks 1–20, e cada passo só com o OK explícito do Javerson)

Antes de cada passo: dizer ao Javerson, em linguagem simples, o que vai ser aplicado e esperar o "sim" dele no chat,
para aquele passo. Nunca digitar senha nem colar chave.

1. Migração: `npx supabase@2.118.0 db query --linked -f supabase/migrations/0170_ead_atividades_interativas.sql`
   (esperado: `ok`).
2. Smoke (desfaz tudo no fim): `npx supabase@2.118.0 db query --linked -f tools/smoke-ead-atividades.sql`.
3. Função: `npx supabase@2.118.0 functions deploy portal-funcionario --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt --use-api`
   (o deploy leva a árvore de `_shared/` inteira: publicar com o worktree limpo).
4. Site: merge da branch `feat/ead-atividades-interativas` em `master` e push, **logo depois** do passo 3 (as leituras
   sem relógio precisam do servidor e da tela novos ao mesmo tempo).
5. Roteiro de teste do handoff (Task 20) com o curso "TESTE EAD — apagar".
6. Carga do NR-10 Básico (pacote `NR10_Parte_1_de_6_Curso_e_Documentos.zip` de volta ao PC): arquivo de importação
   gerado fora do repositório, relatório de revisão, importação pela tela pelo Javerson na Sinergia e na Eletro,
   conferência só de leitura (Task 20).
7. Exercícios pós-vídeo (A11): conversão das 122 perguntas para múltipla escolha fora do repositório, revisão do
   Javerson como RT, importação pela tela em cada curso das duas empresas, conferência só de leitura (Task 20).
