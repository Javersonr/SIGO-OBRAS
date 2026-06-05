# SPEC — Motor de Fluxos de Trabalho (executa → aprova)

> **Status:** PROPOSTA (não implementado). Documento de projeto para revisão.
> **Piloto escolhido:** Licitação → Obra.
> **Princípio:** reaproveitar o que já existe; nada é construído do zero.
> **Regra do dono:** nada vai pro banco/produção sem autorização explícita.

---

## 1. Objetivo

Ter um **motor único, configurável por empresa**, de fluxos de trabalho em que cada
etapa tem **quem executa** e (opcionalmente) **quem aprova** (gate). O fluxo anda
sozinho: ao concluir uma etapa, ela vai para "Em Revisão"; quando o aprovador
aprova, a **próxima etapa abre** e os responsáveis são notificados.

O **editor `docs/mapa-processos.html`** que já existe é o **configurador**: o JSON
exportado vira o **template** do fluxo. Ou seja, o desenho que o dono fez **é** a
especificação executável.

### Princípios de projeto

1. **Template × Instância.** O mapa é o molde (template). Cada obra/oportunidade
   recebe uma cópia viva (instância) das etapas.
2. **Reuso máximo.** Espelhar o motor de aprovação de Compras (já testado em
   produção) e o status "Em Revisão" das tarefas.
3. **Não destrutivo.** Só adiciona tabelas/colunas/funções novas. Nada é
   removido nem alterado nos módulos existentes.
4. **Genérico, mas tipado.** O motor serve qualquer entidade-alvo
   (`oportunidade`, `projeto`, etc.) via um par (tipo, registro_id).
5. **Configurável por empresa** (multi-tenant) e por **papel** (perfil).

---

## 2. O que JÁ existe e será reaproveitado (de-para)

| Peça existente                                                                     | Onde                          | Como entra no motor                                                                                                                                             |
| ---------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aprovar_solicitacao_compra()` / `rejeitar_solicitacao_compra()`                   | `0028_compras_aprovacao.sql`  | **Modelo** das funções `aprovar_etapa()` / `reprovar_etapa()`: anti-auto-aprovação, validação de perfil, multinível, notificação, histórico.                    |
| `nivel_aprovacao` (empresa, tipo, ordem, faixa de valor, `perfis_aprovadores`)     | `0028`                        | Reusar para **quem pode aprovar** uma etapa (por perfil e, opcional, por faixa de valor). Hoje `tipo='SolicitacaoCompra'`; passa a aceitar `tipo='EtapaFluxo'`. |
| `aprovacao_solicitacao` (histórico de decisões)                                    | `0007/0028`                   | Reusar como **histórico de aprovações** das etapas (generalizar a referência).                                                                                  |
| `tarefa_projeto` com status **"Em Revisão"** + `responsaveis_ids` + `dependencias` | `0005_projetos_orcamento.sql` | Conceito "executa → revisão → conclui". A régua de etapas do fluxo pode **gerar** tarefas, ou conviver com elas.                                                |
| `notificacao` + `notificar_gestores()`                                             | `0014/0036`                   | Avisar **quem executa** (etapa abriu) e **quem aprova** (etapa em revisão).                                                                                     |
| `usuario_empresa` (perfil, e-mail, ativo)                                          | `0002`                        | Resolver **quem** é responsável/aprovador por **papel** (perfil) na empresa.                                                                                    |
| `status_oportunidade` (tipo aberto/ganho/perdido), `motivo_perda`, `arquivado`     | `0004/0050`                   | O fluxo de Licitação grava o desfecho aqui (não duplica).                                                                                                       |
| Editor `docs/mapa-processos.html` (export JSON)                                    | `docs/`                       | **Configurador** do template (importa o JSON).                                                                                                                  |

> **Conclusão:** o motor de aprovação **multinível já existe e roda** (Compras). O
> trabalho é **generalizá-lo** para "etapa de fluxo" e dar a ele um **template
> configurável** (o mapa) + uma **régua de execução** na tela.

---

## 3. Conceito — máquina de estados de uma etapa

```
            (abre quando a anterior é concluída/aprovada)
A FAZER ──▶ EM EXECUÇÃO ──▶ EM REVISÃO ──▶ APROVADA ──▶ (abre próxima)
   │            │  (executor      │ (aprovador)  │
   │            │   concluiu)     │              └─▶ se não tem gate: CONCLUÍDA direto
   │            │                 └─▶ REPROVADA ──▶ volta p/ EM EXECUÇÃO (com motivo)
   └─ PULADA (decisão mandou por outro caminho)
```

- **Etapa sem gate** (`exige_aprovacao = false`): EM EXECUÇÃO → CONCLUÍDA direto
  (sem revisão). Ex.: "Participar do certame".
- **Etapa com gate** (`exige_aprovacao = true`): EM EXECUÇÃO → EM REVISÃO →
  APROVADA/REPROVADA. Ex.: "Contrato + ART + CNO" (✔ Gestor).
- **Etapa de decisão** (`tipo='decisao'`): a aprovação **escolhe a saída** (qual
  próxima etapa abre), conforme as opções do mapa ("Se Aprovado", "Se Não").
- **Anti-auto-aprovação:** quem executou **não** pode aprovar (regra herdada de
  Compras).

---

## 4. Modelo de dados (novas tabelas — proposta)

> Tudo `empresa_id` + RLS por `current_empresa_id()`, igual ao resto do sistema.
> Nomes são propostas; ajustar na implementação.

### 4.1 Template (o "molde" = o mapa)

**`fluxo_template`**
| coluna | tipo | nota |
| --- | --- | --- |
| id | uuid pk | |
| empresa_id | uuid | multi-tenant |
| nome | text | ex.: "Licitação → Obra" |
| entidade_alvo | text | `'oportunidade' \| 'projeto'` |
| ativo | bool | |
| origem_json | jsonb | o export do mapa-processos (auditoria) |

**`fluxo_etapa_template`** (cada etapa do mapa)
| coluna | tipo | nota |
| --- | --- | --- |
| id | uuid pk | |
| fluxo_template_id | uuid fk | |
| ordem | int | |
| nome | text | "Análise de Habilitação" |
| tipo | text | `inicio\|etapa\|decisao\|fim` |
| papel_responsavel | text | perfil que executa (ex.: "Analista") |
| papel_aprovador | text | perfil que aprova (ex.: "Responsável Técnico") |
| exige_aprovacao | bool | tem gate? |
| checklist | jsonb | itens (do campo "Atividades" do mapa) |
| opcoes | jsonb | saídas da decisão `[{rotulo, proxima_etapa_ordem \| 'fim'}]` |
| proxima_etapa_ordem | int | fluxo linear (quando não é decisão) |

### 4.2 Instância (a "execução real" numa obra)

**`fluxo_instancia`**
| coluna | tipo | nota |
| --- | --- | --- |
| id | uuid pk | |
| empresa_id | uuid | |
| fluxo_template_id | uuid fk | |
| entidade_alvo | text | `'oportunidade'` |
| registro_id | uuid | id da oportunidade/projeto |
| etapa_atual_id | uuid | aponta p/ a etapa em aberto |
| status | text | `Em Andamento \| Concluído \| Cancelado` |

**`fluxo_etapa_instancia`** (a régua de etapas viva)
| coluna | tipo | nota |
| --- | --- | --- |
| id | uuid pk | |
| empresa_id | uuid | |
| fluxo_instancia_id | uuid fk | |
| etapa_template_id | uuid fk | |
| ordem | int | |
| nome | text | (cópia, p/ histórico estável) |
| status | text | `A Fazer\|Em Execução\|Em Revisão\|Aprovada\|Reprovada\|Concluída\|Pulada` |
| executor_email / executor_nome | text | quem concluiu |
| data_execucao | timestamptz | |
| aprovador_email / aprovador_nome | text | quem aprovou/reprovou |
| data_decisao | timestamptz | |
| comentario | text | motivo (obrigatório na reprovação) |
| checklist_estado | jsonb | itens marcados ☑ |

### 4.3 Generalização das tabelas existentes (mínima)

- **`nivel_aprovacao`**: nada muda na estrutura — só passa a ter linhas com
  `tipo='EtapaFluxo'` (e a função aceita esse tipo). Faixa de valor é **opcional**
  aqui (uma etapa pode aprovar sempre, sem depender de R$).
- **`aprovacao_solicitacao`**: hoje referencia `solicitacao_id`. Para não quebrar,
  adicionar colunas **opcionais** `ref_tipo text` + `ref_id uuid` (quando for
  aprovação de etapa de fluxo, `ref_tipo='fluxo_etapa_instancia'`). `solicitacao_id`
  continua existindo para Compras.

> Alternativa mais limpa (decisão em aberto, ver §11): criar uma tabela nova
> `aprovacao` 100% genérica e migrar Compras pra ela depois — **não** no piloto.

---

## 5. Funções (RPC) — espelhando o motor de Compras

Todas SECURITY DEFINER + `grant execute ... to authenticated`, com `for update`
(lock), validação de perfil e notificação — exatamente como `aprovar_solicitacao_compra`.

1. **`fluxo_instanciar(template_id, entidade_alvo, registro_id)`**
   - Cria `fluxo_instancia` + copia as etapas para `fluxo_etapa_instancia`.
   - Marca a 1ª etapa como **"Em Execução"** e notifica o(s) responsável(eis) por papel.

2. **`fluxo_concluir_etapa(etapa_instancia_id, executor_email, executor_nome, checklist_estado)`**
   - Valida que o status é "Em Execução".
   - Se a etapa **exige aprovação** → status **"Em Revisão"** + notifica o aprovador (por papel).
   - Se **não exige** → status **"Concluída"** e chama `fluxo_abrir_proxima()`.

3. **`fluxo_aprovar_etapa(etapa_instancia_id, aprovador_email, aprovador_nome, aprovador_perfil, comentario, opcao_escolhida?)`**
   - **Anti-auto-aprovação:** `aprovador_email != executor_email`.
   - **Valida perfil** contra `nivel_aprovacao` (`tipo='EtapaFluxo'`) ou contra
     `papel_aprovador` da etapa (Admin é super-aprovador).
   - Status → **"Aprovada"**, grava em `aprovacao_solicitacao` (ref genérica).
   - Chama `fluxo_abrir_proxima()` — em decisão, usa `opcao_escolhida` p/ escolher a saída.

4. **`fluxo_reprovar_etapa(etapa_instancia_id, aprovador_*, motivo)`**
   - Motivo obrigatório (mín. 5 chars).
   - Status → **"Reprovada"** → volta a etapa para "Em Execução" (re-trabalho) e
     notifica o executor com o motivo.

5. **`fluxo_abrir_proxima(instancia_id, etapa_concluida)`** (interna)
   - Decide a próxima etapa (linear via `proxima_etapa_ordem`, ou via `opcoes` na
     decisão). Marca como "Em Execução" e notifica. Se não há próxima (`fim`),
     fecha a instância (`status='Concluído'`) e, no caso de Licitação, grava o
     desfecho na `oportunidade` (ganho/perdido/arquivado).

> **Notificação:** reusa o mesmo padrão de `0028` — uma `notificacao` por usuário
> cujo `perfil` casa com o papel, `link_destino` apontando para a tela do registro.

---

## 6. Importar o mapa-processos como template

O `mapa-processos.html` já exporta um JSON com `processes[].steps[]` (nome,
responsavel, aprova, tipo, opcoes/links, atividades). Um importador (tela ou
função) converte:

| Campo do mapa                     | Vira no template                                       |
| --------------------------------- | ------------------------------------------------------ |
| `steps[].nome`                    | `fluxo_etapa_template.nome`                            |
| `steps[].responsavel`             | `papel_responsavel`                                    |
| `steps[].aprova`                  | `papel_aprovador` + `exige_aprovacao = (aprova != '')` |
| `steps[].tipo`                    | `tipo`                                                 |
| `steps[].atividades` (linhas/`;`) | `checklist` (array)                                    |
| `links[]` com `label` (decisão)   | `opcoes` `[{rotulo, destino}]`                         |
| ordem dos `links` lineares        | `proxima_etapa_ordem`                                  |

→ **O dono desenha no editor, exporta, importa: o fluxo está configurado.**
Sem programador no meio.

---

## 7. Telas / UX (proposta)

1. **Configurações → Fluxos** — lista de templates; botão **"Importar do mapa
   (JSON)"**; ativar/desativar; ver as etapas (read-only) e quem aprova cada uma.
2. **"Minhas pendências"** (no topo / dashboard) — duas listas:
   - _Para executar_ (etapas "Em Execução" cujo papel é o meu).
   - _Para aprovar_ (etapas "Em Revisão" cujo papel de aprovador é o meu).
     Botões **Concluir** / **Aprovar** / **Reprovar (com motivo)**.
3. **Régua de etapas** na tela da Oportunidade/Projeto — mostra a esteira
   (✓ concluídas, ● em execução, ⏳ em revisão, ○ a fazer), com o checklist de
   cada etapa e quem executou/aprovou.

---

## 8. Piloto — Licitação → Obra (de-para com o que já existe)

A esteira instanciada numa **oportunidade**. "Encaixe" = como a etapa se liga ao
que o sistema **já faz** (não recria):

| #   | Etapa                        | Executa              | Aprova (gate) | Encaixe no sistema atual                                              |
| --- | ---------------------------- | -------------------- | ------------- | --------------------------------------------------------------------- |
| 1   | Pesquisar licitações         | Agente de licitações | Resp. Técnico | `licitacao_encontrada` + inbox (já existe); concluir = "triada"       |
| 2   | Análise de Habilitação       | Analista             | Resp. Técnico | **checklist da etapa** (novo) + anexo do edital; decisão Aprovado/Não |
| 3   | Análise Financeira do Edital | Resp. Técnico        | Analista      | usa filtro de valor já existente; decisão                             |
| 4   | Criar Oportunidade (Kanban)  | Analista             | Resp. Técnico | cria/atualiza `oportunidade` (já existe)                              |
| 5   | Montar proposta + anexar     | Analista             | Resp. Técnico | aba Orçamento/Arquivos (já existe)                                    |
| 6   | Participar do certame        | Agente de licitações | — (sem gate)  | registra participação (campo novo simples)                            |
| 7   | Resultado (Ganhou/Perdeu)    | Agente de licitações | —             | decisão; grava em `status_oportunidade` + `motivo_perda` (já existe)  |
| 8   | Contrato + ART + CNO         | Analista             | **Gestor**    | precisa dos campos ART/CNO (gap já mapeado)                           |
| 9   | Arquivar                     | Analista             | Resp. Técnico | `arquivado = true` (já existe)                                        |

> Observação: o piloto **não exige** criar todos os gaps de uma vez. As etapas
> que hoje já têm onde "cair" funcionam imediatamente; as que dependem de gap
> (checklist de habilitação, ART/CNO) entram quando o gap for criado — o motor é
> o mesmo.

---

## 9. Fases de implementação (incremental, não destrutivo)

> **Reordenado conforme decisão do dono:** o EDITOR de fluxos passa a ser uma
> **página dentro do SIGO** (ver §13) e é a **Fase 1** — entrega valor sozinha,
> independente do motor.

- **Fase 1 — Editor de Fluxos no SIGO (a sua ideia):** nova página React que
  porta o `mapa-processos.html` e **salva no banco** (`fluxo_template` /
  `fluxo_etapa_template`) por empresa. Sem motor ainda — serve para **moldar e
  documentar** os processos vivos. Detalhe em §13.
- **Fase A — Núcleo do motor (sem UI rica):** funções
  `instanciar/concluir/aprovar/reprovar` (espelhando Compras) + tabelas de
  instância (`fluxo_instancia`/`fluxo_etapa_instancia`) + generalizar
  `nivel_aprovacao`/`aprovacao_solicitacao`. Teste por RPC.
- **Fase C — "Minhas pendências":** a lista executar/aprovar com os 3 botões.
- **Fase D — Régua na Oportunidade:** esteira visual + checklist por etapa.
- **Fase E — Piloto real:** ligar o template "Licitação → Obra" e rodar 1 ciclo
  ponta-a-ponta numa empresa de teste.
- **Fase F (depois):** estender a outros processos (Execução/CEMIG, RH, etc.) — só
  desenhar/publicar outro fluxo no editor; o motor não muda.

> _Antes a "Fase B — Importador de JSON" deixa de existir: com o editor já dentro
> do SIGO salvando no banco, não há import/export — o template já está lá._

Cada fase é um deploy isolado e reversível (migrations novas, sem alterar as antigas).

---

## 10. Segurança / multi-tenant

- Todas as `fluxo_*` com `empresa_id` + RLS `tenant_isolation` (igual ao resto).
- Funções `SECURITY DEFINER` com `for update` e checagem de perfil (não confiar no
  cliente), exatamente como `aprovar_solicitacao_compra`.
- Anti-auto-aprovação obrigatória.
- `grant execute` só para `authenticated` (sem `anon`).

---

## 11. Decisões em aberto (preciso da sua opinião na hora de construir)

1. **`aprovacao_solicitacao` genérica vs tabela `aprovacao` nova?**
   Recomendo, no piloto, **adicionar `ref_tipo/ref_id`** à existente (menos
   atrito). Unificar tudo numa `aprovacao` nova fica para depois.
2. **Responsável por papel (perfil) vs pessoa específica?**
   Começar por **papel** (qualquer Analista executa) é mais simples e casa com o
   mapa. "Atribuir a uma pessoa" pode vir como refinamento.
3. **O fluxo gera `tarefa_projeto` ou é uma régua própria?**
   Recomendo **régua própria** (`fluxo_etapa_instancia`) para não poluir as
   tarefas; integração com tarefas pode ser opcional.
4. **Reprovar volta 1 etapa ou para uma etapa escolhida?**
   Piloto: volta para a **mesma etapa** (re-trabalho). "Devolver para a etapa X"
   é refinamento.

---

## 12. Resumo

- O motor **executa → aprova** já existe em forma madura (Compras). Falta
  **generalizar** e dar a ele um **template configurável** — que é o seu mapa.
- **Nada é jogado fora**: oportunidade, status, motivo_perda, notificação,
  nivel_aprovacao, aprovacao_solicitacao, tarefa "Em Revisão" — tudo entra.
- O piloto **Licitação → Obra** roda com o que já existe + 2 gaps pequenos
  (checklist de habilitação e ART/CNO), sem bloquear o restante.
- **Próximo passo após aprovar esta spec:** Fase A (núcleo) num branch, sem
  cron/UI, validável por RPC — e só então seguimos.

> **Este documento não alterou o sistema.** É a planta. Ao OK do dono, começo
> pela Fase 1 (Editor de Fluxos no SIGO — §13).

---

## 13. Editor de Fluxos DENTRO do SIGO (decisão do dono)

> Em vez do HTML solto (`docs/mapa-processos.html`), o editor vira uma **página
> do sistema**. Molda-se o fluxo direto no SIGO e ele **já fica salvo** como
> template — pronto para o motor instanciar depois.

### 13.1 O que é

Uma nova página (ex.: **Configurações → Processos/Fluxos**, ou item de menu
"Fluxos") que **porta toda a lógica** do `mapa-processos.html` para React em
`apps/web`:

- canvas de arrastar, etapas, **decisão com opções**, **vínculo a outro
  processo** (+ retorno), **checklist** (campo Atividades), linhas ortogonais,
  hover com checklist — **mesma experiência** que já existe no HTML.
- **Persistência no banco** (Supabase) em `fluxo_template` / `fluxo_etapa_template`
  por `empresa_id`, em vez de `localStorage`.

### 13.2 Por que é melhor que o HTML standalone

| HTML solto (hoje)                | Página no SIGO (proposto)                                |
| -------------------------------- | -------------------------------------------------------- |
| Salva só no navegador (1 pessoa) | Salva no banco, por empresa, **multiusuário**            |
| Exporta/importa JSON na mão      | **Sem import/export** — já está no sistema               |
| É só documentação                | É documentação **e** template executável do motor        |
| Sem permissão/versão             | Permissão (só Admin/Gestor edita) + **versão publicada** |

### 13.3 Ciclo de vida do template

```
Desenha (rascunho)  ──Publicar versão──▶  Template ATIVO (vN)
                                              │
                          motor instancia ────┘  (obras novas usam vN;
                                                  obras em andamento mantêm a
                                                  versão com que começaram)
```

- `fluxo_template.versao` + `status` (`rascunho` | `ativo` | `arquivado`).
- Cada `fluxo_instancia` guarda a **cópia** das etapas (já previsto em §4.2), então
  publicar uma versão nova **não quebra** obras em andamento.

### 13.4 Escopo da Fase 1 (só o editor + persistência)

1. **Tabelas** `fluxo_template` + `fluxo_etapa_template` (§4.1) com RLS por empresa.
2. **Página React** (porta do `mapa-processos.html`) com **load/save** via
   `sigo`/Supabase.
3. **Permissão**: leitura para todos; edição só Admin/Gestor.
4. **Migração opcional**: botão "Importar do editor antigo (JSON)" — aproveita o
   mapa que o dono já desenhou (`mapa-processos-sigo.json`) para popular o banco
   **uma vez**. Depois o HTML pode ser aposentado.

> **Fase 1 não tem motor**: não executa, não aprova, não cria etapa em obra. Só
> **desenha e guarda** — risco baixíssimo (página nova + 2 tabelas novas; nada
> existente é tocado). O motor (Fase A em diante) lê esses templates.

### 13.5 Reaproveitamento do código do editor

O `mapa-processos.html` é **vanilla JS** com toda a lógica de canvas/estado já
pronta. A port para React reusa **a mesma estrutura de dados** (steps/links) e os
algoritmos (auto-ligar, elbow das linhas, decisão, vínculo de processo). O esforço
é "envelopar em React + trocar `localStorage` por chamadas ao Supabase", não
reescrever do zero.
