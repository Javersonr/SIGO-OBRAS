# Análise de gap — fluxo Licitação → Obra (ponta a ponta)

> Pergunta do dono: o SIGO já atende o ciclo
> _Analista pesquisa licitações → agente confere o edital e monta → Responsável
> Técnico cria a proposta → agente de licitações participa → Analista assina
> contrato + emite ART e CNO → Engenharia faz visita de campo → elabora projeto
> (se for o caso) ou parte pro planejamento → planejamento organiza compra de
> materiais e execução?_
>
> **Veredito: ATENDE PARCIALMENTE.** As duas pontas estão cobertas; o MEIO
> (proposta de licitação, participação/resultado, contrato/ART/CNO, visita de
> campo, projeto técnico) e a AMARRAÇÃO (papéis + máquina de estados) faltam.

## Mapeamento passo a passo

| #   | Etapa (papel)                                                | Hoje                                  | Evidência / lacuna                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Analista** pesquisa licitações de interesse                | ✅ **Existe**                         | Aba Licitações: `buscar-licitacoes` + `-pncp`, inbox `licitacao_encontrada`, filtros (UF/cidade/órgão/valor/data), palavra-chave por empresa.                                                                                                                                                |
| 2   | **Agente** confere TODO o edital e "monta" a licitação       | ⚠️ **Fraco**                          | Existe Nova→**Em análise**→Convertida. NÃO existe: leitura/extração do edital (PDF), **checklist de habilitação**, parecer go/no-go. (Tarefa #126 pendente: IA de risco de habilitação.)                                                                                                     |
| 3   | **Responsável Técnico** cria a proposta                      | ❌ **Falta**                          | `proposta_comercial` é só do SaaS (venda do sistema) — desligada da licitação. Há `orcamento_item`, mas **não há geração de proposta/planilha de preços** do certame. Papel "Resp. Técnico" não existe na oportunidade.                                                                      |
| 4   | **Agente de licitações** participa                           | ⚠️ **Parcial / inviável automatizar** | Há campos do certame (data/garantia da proposta), mas **não há registro de participação** (sessão, lances, resultado/colocação). Participar _automaticamente_ no portal do governo geralmente **não é viável** (sem API pública; igual ao caso do WhatsApp). O "agente" aqui é a **pessoa**. |
| 5   | **Analista** assina contrato + emite **ART** e **CNO**       | ❌ **Falta**                          | `projeto.numero_contrato`/`data_vencimento_contrato` existem (pós-conversão). NÃO há: registro/anexo do contrato assinado, **ART** ligada ao projeto (só existe como _tipo de vencimento_ no RH/SST), **CNO** (não existe em lugar nenhum).                                                  |
| 6   | **Engenharia** faz a visita de campo                         | ❌ **Falta**                          | `inspecao_campo` existe, mas é **inspeção de conformidade durante a execução**, não vistoria de **levantamento pré-projeto** (fotos do local, medições, restrições). Papel "Engenharia" não existe.                                                                                          |
| 7   | Elaboração de **projeto técnico** (se for o caso)            | ❌ **Falta**                          | Não há módulo de engenharia (memorial descritivo, plantas, ART de projeto). O `projeto` do sistema é **comercial/obra**, não técnico.                                                                                                                                                        |
| 8   | Senão, **planejamento** da obra                              | ✅ **Existe**                         | `cronograma_etapa` (etapas, datas planejado×real, % conclusão, responsáveis, prioridade).                                                                                                                                                                                                    |
| 9   | Planejamento organiza **compra de materiais** + **execução** | ✅ **Existe e integrado**             | Orçamento → `ReservarItensOrcamentoModal` → `solicitacao_compra` (origem "Orçamento") → cotação → pedido; execução via `cronograma_etapa` + `diario_obra`. Tudo amarrado por `projeto_id`.                                                                                                   |

## O que está faltando criar (resumo)

**A. Papéis** — os perfis hoje são `Admin Holding / Admin / Gestor / Compras / Estoque / Financeiro / Cliente`. Faltam **Analista (licitações)**, **Responsável Técnico**, **Engenharia**. Decisão: adicionar perfis OU um conceito de "papel por etapa" na oportunidade/projeto.

**B. Máquina de estados Licitação→Obra** — não existe um campo/fluxo que rastreie a obra passando por _Triagem → Análise/Go-No-Go → Proposta → Disputa → Habilitação → Ganho → Contrato/ART/CNO → Visita → Projeto → Planejamento → Compras → Execução → Encerramento_. Cada módulo é ligado por `projeto_id`, mas sem "fase" explícita. (A revisão de Oportunidades já pedia o **pipeline de licitação** — E2.)

**C. Conferência do edital + checklist de habilitação** — tabela de itens de habilitação (template por empresa, com vencimento de documentos), parecer go/no-go, e (opcional) **IA** que lê o PDF do edital e extrai exigências/risco (tarefa #126).

**D. Proposta de licitação** — gerar a partir do `orcamento_item` (planilha de preços/BDI formatada pro certame), com nº/validade/assinatura, ligada à oportunidade. (Diferente da `proposta_comercial` do SaaS.)

**E. Resultado do certame** — registro de participação: colocação, valor adjudicado, ganho/perdido **com motivo** (a coluna `motivo_perda` ainda não existe — já estava na revisão, item E4). Habilita win-rate.

**F. Contrato + ART + CNO** — anexo do contrato assinado + campos de **ART** (nº, CREA, responsável, anexo) e **CNO** (nº, data) ligados ao projeto, com vencimentos no painel.

**G. Visita de campo (engenharia)** — tabela de vistoria de levantamento (data, responsável, fotos, medições, restrições, parecer) que **antecede** o projeto/planejamento.

**H. Projeto técnico (engenharia)** — opcional/maior: memorial, plantas, ART de projeto. Pode começar simples (anexos + status "projeto em elaboração").

## Prioridade sugerida (valor × esforço)

1. **Pré-requisito já em andamento:** segurança (RLS) ✅ feita; bug do `status_id` na conversão e "Marcar Perdido com motivo" (E4) — rápidos e destravam o funil.
2. **Pipeline de licitação (B)** + **fase do projeto** — a espinha que amarra tudo. Médio.
3. **Checklist de habilitação (C)** — diferencial de mercado (Effecti). Médio.
4. **Proposta de licitação (D)** + **Resultado/motivo (E)** — fecham o ciclo comercial. Médio.
5. **Contrato + ART + CNO (F)** — campos + anexos + vencimentos. Pequeno/médio.
6. **Visita de campo (G)** — tabela + tela. Pequeno/médio.
7. **Projeto técnico (H)** e **IA de edital (#126)** — maiores; fazer por último.

> Nota: "agente de licitações participa" de forma **automática** não entra (portais do governo não permitem). O sistema apoia a **pessoa** (alertas de prazo, checklist, proposta pronta), não substitui a participação manual.
