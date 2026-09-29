# Pastas na aba Arquivos da oportunidade

**Data:** 29/09/2026. **Aprovado por:** Javerson.

Os arquivos da oportunidade passam a ficar organizados em pastas: Edital, Credenciamento, Envelope 01 – Proposta, Envelope 02 – Habilitação, pastas criadas pelo usuário e Outros.

É a primeira parte da Etapa 4 do conector (`2026-09-25-conector-claude-editais-design.md`, que diz "`arquivo_oportunidade` ganha pastas"). O ZIP, o PDF único e o agente de pastas ficam para depois.

## 1. Motivo

A aba Arquivos é uma lista plana, em ordem de envio. Numa licitação ficam 40 ou mais arquivos misturados (edital, anexos, certidões, declarações, CATs), e fica difícil achar e conferir o envelope. A estrutura precisa seguir a das pastas do OneDrive (`01- Arquivo`, `02- Habilitação`…).

## 2. Escopo

**Entra:**

- Pastas padrão, sempre visíveis: **Edital**, **Credenciamento**, **Envelope 01 – Proposta**, **Envelope 02 – Habilitação**, **Outros**.
- **Nova pasta:** o usuário cria pastas extras por oportunidade. Uma pasta extra vazia pode ser apagada. As padrão não podem ser apagadas.
- **Mover para…:** muda a pasta de um arquivo.
- **Seletor de pasta ao enviar** arquivo ou link, com a pasta aberta como padrão.
- Arquivos em **ordem de nome** dentro de cada pasta.
- Os arquivos de Itatinga (oportunidade `5a1e0c2e-9c0b-4d2a-8f3e-1a7a7a0e0926`) organizados nas pastas.

**Não entra (YAGNI):** subpastas, renomear pasta, mover vários de uma vez, ZIP, juntar PDFs, pastas na aba de arquivos do Projeto, ferramenta do conector.

## 3. Dados

Migração `0125_pastas_arquivos.sql`, só aditiva e idempotente:

```sql
alter table public.arquivo_oportunidade add column if not exists pasta text;
alter table public.oportunidade add column if not exists pastas_arquivos jsonb not null default '[]'::jsonb;
```

- **`arquivo_oportunidade.pasta`:** nome da pasta. `null` = sem pasta escolhida, e aí vale a regra da §4.
- **`oportunidade.pastas_arquivos`:** array JSON com os nomes das pastas extras. Guarda as pastas criadas mesmo quando ainda estão vazias.
- **Não há backfill:** nenhuma linha antiga é alterada.
- **RLS:** não muda, porque são as mesmas tabelas com a política `empresa_id = current_empresa_id()`.
- **Oportunidade que vira projeto ("Ganho"):** a coluna `pasta` vai junto com a linha do arquivo, que já é migrada hoje.

## 4. Regra das pastas

Fica no módulo puro `apps/web/src/lib/pastas-arquivo.js`, com testes em Vitest.

- **`PASTAS_PADRAO`:** `["Edital", "Credenciamento", "Envelope 01 – Proposta", "Envelope 02 – Habilitação", "Outros"]`.
- **`pastaDoArquivo(arq)`:**
  - `arq.pasta`, se estiver preenchida;
  - senão, se `categoria` ∈ {edital, termo_referencia, anexo_edital, errata}, **Edital**;
  - senão, **Outros**.
- **`listarPastas(pastasExtras, arquivos)`:** junta, sem repetir:
  - as pastas padrão;
  - as extras gravadas;
  - as pastas que aparecem nos arquivos. Assim um valor que não esteja na lista não some da tela.

  **Ordem:** as padrão primeiro, na ordem acima, sem Outros; depois as demais em ordem alfabética (pt-BR, sem diferenciar acento); **Outros por último**.

- **`agruparPorPasta(arquivos, pastas)`:** devolve `{ pasta, arquivos }` para cada pasta, com os arquivos ordenados por nome (`localeCompare` pt-BR, numérico). As pastas vazias entram na lista.
- **`nomePastaValido(nome, existentes)`:**
  - apara os espaços;
  - aceita de 1 a 60 caracteres;
  - recusa nome repetido, sem diferenciar maiúsculas nem acento.

## 5. Tela (`OportunidadeDetalhe.jsx`, aba Arquivos)

**Lista.** Cada pasta vira uma seção recolhível:

- o cabeçalho tem ícone de pasta, nome e contagem;
- a seção abre ao clicar;
- a pasta aberta fica marcada como pasta atual.

A linha de cada arquivo continua como é hoje (ícones, visualizar, abrir link, apagar). Ganha só um menu **"Mover para…"**, que lista as pastas menos a atual e grava com `ArquivoOportunidade.update(id, { pasta })`.

**Cabeçalho da aba.** Ganha um seletor **Pasta** (padrão: a pasta aberta, ou Outros) e o botão **Nova pasta**.

- Upload e link gravam `pasta` com a escolha do seletor.
- A lógica de gravação fica nos handlers de `Oportunidades.jsx` (`handleUploadFile`, `handleSalvarLink`). Eles recebem a pasta como argumento; hoje o upload recebe o evento.

**Nova pasta:**

1. abre um campo inline;
2. valida com `nomePastaValido`;
3. grava `Oportunidade.update(id, { pastas_arquivos: [...extras, nome] })`;
4. abre a pasta recém-criada.

**Apagar pasta extra.** O ícone de lixeira aparece só em pasta extra vazia. Grava a lista `pastas_arquivos` sem essa pasta.

Os arquivos da leitura de edital e do portal do cliente continuam sem `pasta`. Pela regra da §4 caem em Edital ou em Outros.

**Erros.** Toast em caso de falha, com o estado local revertido, no mesmo padrão dos outros updates da tela.

## 6. Itatinga (dados)

Os 33 arquivos com `categoria is null` da oportunidade `5a1e0c2e-…0926` recebem `pasta = 'Envelope 02 – Habilitação'`. Os 8 arquivos do edital já têm categoria e aparecem em Edital sem alteração.

A atualização roda depois da migração, filtrada pelo id da oportunidade e da empresa.

## 7. Testes e publicação

1. **Testes:**
   - Vitest para `pastas-arquivo.js`: regra de pasta, ordem, deduplicação, validação de nome e agrupamento com pasta vazia;
   - depois `npm run lint` e `npm run build`.
2. **Migração:** `supabase db query --linked -f supabase/migrations/0125_pastas_arquivos.sql`, que é aditiva.
3. **Publicação:** commit e push em `master` publicam o site.
4. **Dados de Itatinga:** SQL da §6.

Os passos 2 a 4 mexem na produção e precisam do OK do Javerson, que pode rodá-los ou aprovar a execução.
