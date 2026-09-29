# Pastas na aba Arquivos da oportunidade — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** organizar os arquivos da oportunidade em pastas recolhíveis:

- Edital, Credenciamento, Envelope 01 – Proposta, Envelope 02 – Habilitação e Outros;
- as pastas extras que o usuário criar.

Cada arquivo tem "Mover para…" e o envio já escolhe a pasta.

**Arquitetura:**

- **Dados:** coluna `arquivo_oportunidade.pasta` (texto) e `oportunidade.pastas_arquivos` (jsonb, pastas extras).
- **Regra:** módulo puro `lib/pastas-arquivo.js`, com testes. Um arquivo sem pasta cai em Edital (categorias do edital) ou em Outros.
- **Tela:**
  - componente novo `ArquivosPastas.jsx`, que desenha as pastas e recebe a linha de cada arquivo por _render prop_ do `OportunidadeDetalhe.jsx`;
  - a linha de hoje é reaproveitada e ganha só o menu "Mover para…".

**Stack:** React 18 + Vite, SDK `sigo.entities.*` (PostgREST), Vitest (ambiente node), shadcn/ui, lucide-react 0.475, Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-09-29-pastas-arquivos-oportunidade-design.md`

## Regras globais

- **Pastas padrão, nesta ordem:** `Edital`, `Credenciamento`, `Envelope 01 – Proposta`, `Envelope 02 – Habilitação`, `Outros`. O travessão é o en dash (U+2013).
- **Ordem na tela:** padrão (sem Outros), depois extras em ordem alfabética (pt-BR, sem diferenciar acento), depois `Outros` por último.
- **Categorias do edital** (vão para Edital quando `pasta` é nula): `edital`, `termo_referencia`, `anexo_edital`, `errata`.
- **Nome de pasta:** aparado, espaços repetidos viram um só, de 1 a 60 caracteres, sem repetir (sem diferenciar maiúsculas nem acento).
- **Arquivos dentro da pasta:** ordem de nome (`localeCompare` pt-BR, `numeric: true`).
- **Banco:** nenhuma linha antiga é alterada, sem backfill. A migração é aditiva e idempotente.
- **Ordem de publicação:** migração ANTES do push. O front novo grava `pasta` e `pastas_arquivos`, e sem as colunas o envio de arquivo falha.
- **Textos da tela** em português, no tom das telas atuais.
- **Commits** terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Outra sessão faz commits no mesmo `master`.** Faça `git add` só dos arquivos do plano (nunca `git add -A`) e confira o último número de migração antes de criar a `0125`.

---

## Mapa de arquivos

| Arquivo                                                                                         | Papel                                                                                                               |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/pastas-arquivo.js` (novo)                                                     | Regra pura: pastas padrão, pasta de cada arquivo, lista ordenada, agrupamento, validação de nome e leitura do jsonb |
| `apps/web/src/lib/pastas-arquivo.test.js` (novo)                                                | Testes Vitest da regra                                                                                              |
| `supabase/migrations/0130_pastas_arquivos.sql` (novo)                                           | Colunas `pasta` e `pastas_arquivos`                                                                                 |
| `apps/web/src/components/oportunidades/ArquivosPastas.jsx` (novo)                               | Pastas recolhíveis, "Nova pasta" e apagar pasta extra vazia; a linha do arquivo vem do pai                          |
| `apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx` (alterar ~l.1416-1603, 315-335) | Usa `ArquivosPastas`, seletor de pasta no envio, "Mover para…", criar e apagar pasta                                |
| `apps/web/src/pages/Oportunidades.jsx` (alterar `handleUploadFile`, ~l.823-864)                 | Recebe a pasta e grava `pasta` no `ArquivoOportunidade.create`                                                      |

---

### Task 1: Regra das pastas (módulo puro + testes)

**Arquivos:**

- Criar: `apps/web/src/lib/pastas-arquivo.js`
- Teste: `apps/web/src/lib/pastas-arquivo.test.js`

**Interfaces:**

- Usa: `normalizarTexto(s)` de `@/lib/busca` e `safeParseJSON(value, fallback)` de `@/lib/json-utils`.
- Produz:
  - constantes: `PASTAS_PADRAO: string[]`, `PASTA_EDITAL = "Edital"`, `PASTA_OUTROS = "Outros"`;
  - `ehPastaPadrao(nome: string): boolean`;
  - `pastaDoArquivo(arq: {pasta?, categoria?}): string`;
  - `lerPastasExtras(valor: unknown): string[]`;
  - `listarPastas(pastasExtras: string[], arquivos: object[]): string[]`;
  - `agruparPorPasta(arquivos: object[], pastas: string[]): {pasta: string, arquivos: object[]}[]`;
  - `nomePastaValido(nome: string, existentes: string[]): {ok: true, nome: string} | {ok: false, erro: string}`.

- [ ] **Passo 1: escrever o teste (falha)**

`apps/web/src/lib/pastas-arquivo.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  PASTAS_PADRAO,
  PASTA_EDITAL,
  PASTA_OUTROS,
  ehPastaPadrao,
  pastaDoArquivo,
  lerPastasExtras,
  listarPastas,
  agruparPorPasta,
  nomePastaValido,
} from "./pastas-arquivo";

describe("PASTAS_PADRAO", () => {
  it("tem as 5 pastas na ordem da spec, com Outros por último", () => {
    expect(PASTAS_PADRAO).toEqual([
      "Edital",
      "Credenciamento",
      "Envelope 01 – Proposta",
      "Envelope 02 – Habilitação",
      "Outros",
    ]);
  });
  it("ehPastaPadrao ignora maiúsculas e acento", () => {
    expect(ehPastaPadrao("envelope 02 – habilitacao")).toBe(true);
    expect(ehPastaPadrao("Recurso")).toBe(false);
  });
});

describe("pastaDoArquivo", () => {
  it("usa a pasta gravada (aparada)", () => {
    expect(pastaDoArquivo({ pasta: "  Recurso ", categoria: "edital" })).toBe("Recurso");
  });
  it("sem pasta: categorias do edital vão para Edital", () => {
    for (const categoria of ["edital", "termo_referencia", "anexo_edital", "errata"]) {
      expect(pastaDoArquivo({ pasta: null, categoria })).toBe(PASTA_EDITAL);
    }
  });
  it("sem pasta e sem categoria do edital: Outros", () => {
    expect(pastaDoArquivo({ pasta: "   ", categoria: null })).toBe(PASTA_OUTROS);
    expect(pastaDoArquivo({})).toBe(PASTA_OUTROS);
  });
});

describe("lerPastasExtras", () => {
  it("aceita array, string JSON (legado) e lixo", () => {
    expect(lerPastasExtras(["Recurso", " Contrato ", ""])).toEqual(["Recurso", "Contrato"]);
    expect(lerPastasExtras('["Recurso"]')).toEqual(["Recurso"]);
    expect(lerPastasExtras(null)).toEqual([]);
    expect(lerPastasExtras("não é json")).toEqual([]);
    expect(lerPastasExtras({ a: 1 })).toEqual([]);
  });
});

describe("listarPastas", () => {
  it("sem extras: só as padrão, Outros por último", () => {
    expect(listarPastas([], [])).toEqual(PASTAS_PADRAO);
  });
  it("extras em ordem alfabética entre as padrão e Outros", () => {
    expect(listarPastas(["Recurso", "Contrato"], [])).toEqual([
      "Edital",
      "Credenciamento",
      "Envelope 01 – Proposta",
      "Envelope 02 – Habilitação",
      "Contrato",
      "Recurso",
      "Outros",
    ]);
  });
  it("não repete pasta (maiúsculas/acento) e inclui pasta que só existe no arquivo", () => {
    const pastas = listarPastas(["recurso", "ENVELOPE 02 – HABILITACAO"], [{ pasta: "Recurso" }, { pasta: "Atas" }]);
    expect(pastas).toEqual([
      "Edital",
      "Credenciamento",
      "Envelope 01 – Proposta",
      "Envelope 02 – Habilitação",
      "Atas",
      "recurso",
      "Outros",
    ]);
  });
});

describe("agruparPorPasta", () => {
  it("devolve todas as pastas (vazias também) e ordena arquivos por nome numérico", () => {
    const arquivos = [
      { id: 1, nome: "10- CND.pdf", pasta: "Envelope 02 – Habilitação" },
      { id: 2, nome: "2- QSA.pdf", pasta: "Envelope 02 – Habilitação" },
      { id: 3, nome: "Edital.pdf", categoria: "edital" },
      { id: 4, nome: "foto.png" },
    ];
    const grupos = agruparPorPasta(arquivos, listarPastas([], arquivos));
    expect(grupos.map((g) => g.pasta)).toEqual(PASTAS_PADRAO);
    const hab = grupos.find((g) => g.pasta === "Envelope 02 – Habilitação");
    expect(hab.arquivos.map((a) => a.id)).toEqual([2, 1]);
    expect(grupos.find((g) => g.pasta === "Edital").arquivos.map((a) => a.id)).toEqual([3]);
    expect(grupos.find((g) => g.pasta === "Outros").arquivos.map((a) => a.id)).toEqual([4]);
    expect(grupos.find((g) => g.pasta === "Credenciamento").arquivos).toEqual([]);
  });
  it("casa a pasta do arquivo sem diferenciar maiúsculas/acento", () => {
    const grupos = agruparPorPasta([{ id: 9, nome: "a.pdf", pasta: "edital" }], PASTAS_PADRAO);
    expect(grupos.find((g) => g.pasta === "Edital").arquivos.map((a) => a.id)).toEqual([9]);
  });
});

describe("nomePastaValido", () => {
  it("apara e junta espaços", () => {
    expect(nomePastaValido("  Recurso   Administrativo ", [])).toEqual({
      ok: true,
      nome: "Recurso Administrativo",
    });
  });
  it("recusa vazio, longo demais e repetido (sem diferenciar acento)", () => {
    expect(nomePastaValido("   ", []).ok).toBe(false);
    expect(nomePastaValido("x".repeat(61), []).ok).toBe(false);
    expect(nomePastaValido("x".repeat(60), []).ok).toBe(true);
    expect(nomePastaValido("envelope 02 – habilitacao", PASTAS_PADRAO).ok).toBe(false);
    expect(nomePastaValido("RECURSO", ["Recurso"]).erro).toBe("Já existe uma pasta com esse nome");
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `cd apps/web && npx vitest run src/lib/pastas-arquivo.test.js`
Esperado: FALHA, porque `./pastas-arquivo` não existe.

- [ ] **Passo 3: implementar**

`apps/web/src/lib/pastas-arquivo.js`:

```js
/**
 * Pastas da aba Arquivos da oportunidade (spec 2026-09-29-pastas-arquivos-oportunidade).
 *
 * Módulo PURO (sem React, sem banco). O arquivo guarda o nome da pasta em
 * `arquivo_oportunidade.pasta`; as pastas extras criadas pelo usuário ficam em
 * `oportunidade.pastas_arquivos` (jsonb). Arquivo sem pasta: categorias do
 * edital → "Edital"; o resto → "Outros". Comparação de nomes sem
 * maiúsculas/acento (normalizarTexto).
 */
import { normalizarTexto } from "@/lib/busca";
import { safeParseJSON } from "@/lib/json-utils";

export const PASTA_EDITAL = "Edital";
export const PASTA_OUTROS = "Outros";
export const PASTAS_PADRAO = [
  PASTA_EDITAL,
  "Credenciamento",
  "Envelope 01 – Proposta",
  "Envelope 02 – Habilitação",
  PASTA_OUTROS,
];

const CATEGORIAS_DO_EDITAL = new Set(["edital", "termo_referencia", "anexo_edital", "errata"]);
const MAX_NOME = 60;
const ORDEM = { sensitivity: "base", numeric: true };

const limpar = (s) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
const chave = (s) => normalizarTexto(limpar(s));

export function ehPastaPadrao(nome) {
  const k = chave(nome);
  return PASTAS_PADRAO.some((p) => chave(p) === k);
}

/** Pasta de um arquivo: a gravada; senão Edital (categorias do edital) ou Outros. */
export function pastaDoArquivo(arq) {
  const p = limpar(arq?.pasta);
  if (p) return p;
  return CATEGORIAS_DO_EDITAL.has(arq?.categoria) ? PASTA_EDITAL : PASTA_OUTROS;
}

/** jsonb `oportunidade.pastas_arquivos` → nomes (aceita a string JSON do legado). */
export function lerPastasExtras(valor) {
  const arr = Array.isArray(valor) ? valor : safeParseJSON(valor, []);
  return (Array.isArray(arr) ? arr : []).map(limpar).filter(Boolean);
}

/** Padrão (sem Outros) → demais em ordem alfabética → Outros. Sem repetir. */
export function listarPastas(pastasExtras = [], arquivos = []) {
  const vistas = new Map(); // chave → nome exibido (o primeiro que aparecer)
  const add = (nome) => {
    const k = chave(nome);
    if (k && !vistas.has(k)) vistas.set(k, limpar(nome));
  };
  PASTAS_PADRAO.forEach(add);
  pastasExtras.forEach(add);
  arquivos.forEach((a) => add(pastaDoArquivo(a)));
  const extras = [...vistas.values()]
    .filter((n) => !ehPastaPadrao(n))
    .sort((a, b) => a.localeCompare(b, "pt-BR", ORDEM));
  return [...PASTAS_PADRAO.filter((p) => p !== PASTA_OUTROS), ...extras, PASTA_OUTROS];
}

/** Uma entrada por pasta (vazias também), arquivos em ordem de nome. */
export function agruparPorPasta(arquivos = [], pastas = []) {
  const grupos = pastas.map((pasta) => ({ pasta, arquivos: [] }));
  const porChave = new Map(grupos.map((g) => [chave(g.pasta), g]));
  const outros = porChave.get(chave(PASTA_OUTROS));
  for (const arq of arquivos) {
    const grupo = porChave.get(chave(pastaDoArquivo(arq))) || outros;
    if (grupo) grupo.arquivos.push(arq);
  }
  for (const g of grupos) {
    g.arquivos.sort((x, y) => String(x.nome ?? "").localeCompare(String(y.nome ?? ""), "pt-BR", ORDEM));
  }
  return grupos;
}

/** Valida o nome de uma pasta nova contra as existentes. */
export function nomePastaValido(nome, existentes = []) {
  const n = limpar(nome);
  if (!n) return { ok: false, erro: "Informe o nome da pasta" };
  if (n.length > MAX_NOME) return { ok: false, erro: `Use até ${MAX_NOME} caracteres` };
  const k = chave(n);
  if (existentes.some((e) => chave(e) === k)) {
    return { ok: false, erro: "Já existe uma pasta com esse nome" };
  }
  return { ok: true, nome: n };
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `cd apps/web && npx vitest run src/lib/pastas-arquivo.test.js`
Esperado: PASS (todos).

- [ ] **Passo 5: commit**

```bash
git add apps/web/src/lib/pastas-arquivo.js apps/web/src/lib/pastas-arquivo.test.js
git commit -m "feat(oportunidades): regra das pastas da aba Arquivos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migração das colunas

**Arquivos:**

- Criar: `supabase/migrations/0130_pastas_arquivos.sql`. Antes de criar, rode `ls supabase/migrations | tail -3`; se a `0125` já existir, use o próximo número livre.

**Interfaces:**

- Produz as colunas `public.arquivo_oportunidade.pasta text` e `public.oportunidade.pastas_arquivos jsonb not null default '[]'`.

- [ ] **Passo 1: escrever a migração**

```sql
-- ============================================================================
-- 0130_pastas_arquivos.sql — pastas na aba Arquivos da oportunidade
--   (spec docs/superpowers/specs/2026-09-29-pastas-arquivos-oportunidade-design.md)
--
--   arquivo_oportunidade.pasta      nome da pasta; null = regra do front
--                                   (categorias do edital → "Edital"; resto → "Outros")
--   oportunidade.pastas_arquivos    pastas EXTRAS criadas pelo usuário (array jsonb)
--
-- Aditiva e idempotente. Sem backfill. RLS inalterada (mesmas tabelas).
-- ============================================================================

alter table public.arquivo_oportunidade
  add column if not exists pasta text;

alter table public.oportunidade
  add column if not exists pastas_arquivos jsonb not null default '[]'::jsonb;

comment on column public.arquivo_oportunidade.pasta is
  'Pasta do arquivo na aba Arquivos (ex.: Envelope 02 – Habilitação). Null = Edital (categorias do edital) ou Outros.';
comment on column public.oportunidade.pastas_arquivos is
  'Pastas extras da aba Arquivos criadas pelo usuário (array de nomes). As padrão ficam no front.';
```

- [ ] **Passo 2: conferir a sintaxe sem aplicar**

Rodar: `grep -c "add column if not exists" supabase/migrations/0130_pastas_arquivos.sql`
Esperado: `2`

- [ ] **Passo 3: commit**

```bash
git add supabase/migrations/0130_pastas_arquivos.sql
git commit -m "feat(db): 0125 — colunas de pasta dos arquivos da oportunidade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

A migração é aplicada na Task 5, com o OK do Javerson.

---

### Task 3: Componente `ArquivosPastas`

**Arquivos:**

- Criar: `apps/web/src/components/oportunidades/ArquivosPastas.jsx`

**Interfaces:**

- Usa, da Task 1: `agruparPorPasta`, `ehPastaPadrao` e `nomePastaValido`.
- Produz: `<ArquivosPastas arquivos pastas pastaAtual onAbrirPasta onCriarPasta onApagarPasta renderArquivo />`.
  - `arquivos: object[]`: linhas de `arquivo_oportunidade`.
  - `pastas: string[]`: saída de `listarPastas`.
  - `pastaAtual: string`.
  - `onAbrirPasta(pasta: string): void`: chamada ao abrir uma pasta.
  - `onCriarPasta(nome: string): Promise<boolean>`: `true` se gravou.
  - `onApagarPasta(pasta: string): Promise<void>`.
  - `renderArquivo(arq: object): ReactNode`: a linha do arquivo, desenhada pelo pai.

- [ ] **Passo 1: implementar**

```jsx
import React, { useState } from "react";
import { Folder, FolderOpen, FolderPlus, ChevronDown, ChevronRight, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { agruparPorPasta, ehPastaPadrao, nomePastaValido } from "@/lib/pastas-arquivo";

/**
 * Arquivos da oportunidade agrupados em pastas recolhíveis
 * (spec 2026-09-29-pastas-arquivos-oportunidade). A linha de cada arquivo vem
 * do pai (renderArquivo), que já tem pré-visualização, link, mover e excluir.
 */
export default function ArquivosPastas({
  arquivos,
  pastas,
  pastaAtual,
  onAbrirPasta,
  onCriarPasta,
  onApagarPasta,
  renderArquivo,
}) {
  const [abertas, setAbertas] = useState(() => new Set([pastaAtual]));
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const grupos = agruparPorPasta(arquivos, pastas);

  const alternar = (pasta) => {
    setAbertas((prev) => {
      const nova = new Set(prev);
      if (nova.has(pasta)) nova.delete(pasta);
      else {
        nova.add(pasta);
        onAbrirPasta?.(pasta);
      }
      return nova;
    });
  };

  const cancelar = () => {
    setCriando(false);
    setNome("");
    setErro("");
  };

  const confirmar = async () => {
    const v = nomePastaValido(nome, pastas);
    if (!v.ok) {
      setErro(v.erro);
      return;
    }
    setSalvando(true);
    try {
      const ok = await onCriarPasta(v.nome);
      if (ok) {
        cancelar();
        setAbertas((prev) => new Set(prev).add(v.nome));
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        {criando ? (
          <div className="flex w-full items-start gap-2 sm:w-auto">
            <div className="flex-1">
              <Input
                autoFocus
                placeholder="Nome da pasta (ex.: Recurso)"
                value={nome}
                maxLength={60}
                onChange={(e) => {
                  setNome(e.target.value);
                  setErro("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmar();
                  if (e.key === "Escape") cancelar();
                }}
              />
              {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
            </div>
            <Button size="icon" className="h-9 w-9" disabled={salvando} onClick={confirmar} title="Criar pasta">
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" className="h-9 w-9" onClick={cancelar} title="Cancelar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setCriando(true)}>
            <FolderPlus className="h-4 w-4" /> Nova pasta
          </Button>
        )}
      </div>

      {grupos.map(({ pasta, arquivos: lista }) => {
        const aberta = abertas.has(pasta);
        const podeApagar = !ehPastaPadrao(pasta) && lista.length === 0;
        return (
          <div key={pasta} className="rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left"
                onClick={() => alternar(pasta)}
                aria-expanded={aberta}
              >
                {aberta ? (
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                )}
                {aberta ? (
                  <FolderOpen className="h-5 w-5 text-amber-500" />
                ) : (
                  <Folder className="h-5 w-5 text-amber-500" />
                )}
                <span className={`font-medium ${pasta === pastaAtual ? "text-slate-900" : "text-slate-700"}`}>
                  {pasta}
                </span>
                <span className="text-xs text-slate-500">
                  {lista.length === 0 ? "vazia" : `${lista.length} ${lista.length === 1 ? "arquivo" : "arquivos"}`}
                </span>
              </button>
              {podeApagar && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Apagar pasta vazia"
                  onClick={() => onApagarPasta(pasta)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              )}
            </div>
            {aberta && (
              <div className="space-y-2 border-t border-slate-100 p-2">
                {lista.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-500">Nenhum arquivo nesta pasta</p>
                ) : (
                  lista.map((arq) => <React.Fragment key={arq.id}>{renderArquivo(arq)}</React.Fragment>)
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Passo 2: lint do arquivo**

Rodar: `cd apps/web && npx eslint src/components/oportunidades/ArquivosPastas.jsx --quiet`
Esperado: sem saída (sem erro).

- [ ] **Passo 3: commit**

```bash
git add apps/web/src/components/oportunidades/ArquivosPastas.jsx
git commit -m "feat(oportunidades): componente de pastas da aba Arquivos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ligar as pastas na tela da oportunidade

**Arquivos:**

- Alterar: `apps/web/src/pages/Oportunidades.jsx`, em `handleUploadFile` (~l.823-864).
- Alterar: `apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx`:
  - imports (l.24-46 e topo);
  - estado (~l.171);
  - `handleSalvarLink` (~l.315-335);
  - aba Arquivos (~l.1416-1603).

**Interfaces:**

- Usa, da Task 1: `PASTA_OUTROS`, `lerPastasExtras`, `listarPastas` e `pastaDoArquivo`.
- Usa, da Task 3: `ArquivosPastas`.
- Muda a assinatura de `onUploadFile(e, pasta)`. `pasta` é o nome da pasta ou `null`.

- [ ] **Passo 1: `Oportunidades.jsx` grava a pasta no upload**

Troque a assinatura e o `create` em `handleUploadFile`:

```js
  const handleUploadFile = async (e, pasta = null) => {
```

e, dentro do `sigo.entities.ArquivoOportunidade.create({ ... })`, acrescente depois de `tamanho: file.size,`:

```js
        pasta: pasta || null,
```

- [ ] **Passo 2: imports e estado em `OportunidadeDetalhe.jsx`**

No import de `lucide-react`, acrescente `Folder,` à lista. Depois de `import EditalResumoCard from "./EditalResumoCard";`, acrescente:

```js
import ArquivosPastas from "./ArquivosPastas";
import { PASTA_OUTROS, lerPastasExtras, listarPastas, pastaDoArquivo } from "@/lib/pastas-arquivo";
```

Logo depois de `const fileInputArquivosRef = useRef(null);`, acrescente:

```js
// Pasta atual da aba Arquivos: destino do upload/link e primeira aberta
const [pastaAtual, setPastaAtual] = useState(PASTA_OUTROS);
const pastasExtras = lerPastasExtras(selectedOp?.pastas_arquivos);
const pastasArquivos = listarPastas(pastasExtras, arquivos || []);

const gravarPastasExtras = async (novas) => {
  await sigo.entities.Oportunidade.update(selectedOp.id, { pastas_arquivos: novas });
  const aplicar = (o) => (o?.id === selectedOp.id ? { ...o, pastas_arquivos: novas } : o);
  setSelectedOp?.((prev) => aplicar(prev));
  setOportunidades?.((prev) => (Array.isArray(prev) ? prev.map(aplicar) : prev));
};

const handleCriarPasta = async (nome) => {
  try {
    await gravarPastasExtras([...pastasExtras, nome]);
    setPastaAtual(nome);
    toast.success(`Pasta "${nome}" criada`);
    return true;
  } catch (e) {
    toast.error(`Não foi possível criar a pasta: ${e?.message || "erro"}`);
    return false;
  }
};

const handleApagarPasta = async (nome) => {
  if (!confirm(`Apagar a pasta "${nome}"?`)) return;
  try {
    await gravarPastasExtras(pastasExtras.filter((p) => p !== nome));
    if (pastaAtual === nome) setPastaAtual(PASTA_OUTROS);
  } catch (e) {
    toast.error(`Não foi possível apagar a pasta: ${e?.message || "erro"}`);
  }
};

const handleMoverArquivo = async (arq, pasta) => {
  try {
    await sigo.entities.ArquivoOportunidade.update(arq.id, { pasta });
    toast.success(`"${arq.nome}" movido para ${pasta}`);
    onReloadArquivos();
  } catch (e) {
    toast.error(`Não foi possível mover: ${e?.message || "erro"}`);
  }
};
```

- [ ] **Passo 3: o link grava a pasta**

Em `handleSalvarLink`, no `sigo.entities.ArquivoOportunidade.create({ ... })`, acrescente depois de `tipo: "link",`:

```js
      pasta: pastaAtual,
```

- [ ] **Passo 4: cabeçalho da aba com o seletor de pasta**

Na aba Arquivos, troque o `onChange={onUploadFile}` do `<input ref={fileInputArquivosRef}>` por:

```jsx
                          onChange={(e) => onUploadFile(e, pastaAtual)}
```

e, dentro de `<div className="flex gap-2">` (antes do botão "Adicionar Link"), acrescente o seletor:

```jsx
<Select value={pastaAtual} onValueChange={setPastaAtual}>
  <SelectTrigger className="h-9 w-[210px]" title="Pasta onde o upload/link é gravado">
    <Folder className="mr-1 h-4 w-4 text-amber-500" />
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {pastasArquivos.map((p) => (
      <SelectItem key={p} value={p}>
        {p}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

- [ ] **Passo 5: lista em pastas, com "Mover para…" na linha**

Troque o bloco da lista, que vai de `<div className="space-y-2">` com `{arquivos.map((arq) => {` até o fechamento do estado vazio (`{arquivos.length === 0 && (... "Nenhum arquivo enviado" ...)}` e o `</div>` correspondente), por:

```jsx
                    <ArquivosPastas
                      arquivos={arquivos}
                      pastas={pastasArquivos}
                      pastaAtual={pastaAtual}
                      onAbrirPasta={setPastaAtual}
                      onCriarPasta={handleCriarPasta}
                      onApagarPasta={handleApagarPasta}
                      renderArquivo={(arq) => {
```

A linha continua a mesma de hoje. **Mova** para dentro de `renderArquivo` o corpo inteiro que estava dentro de `arquivos.map((arq) => { ... })`: as `const isLink / isPdf / isImage / canPreview / isOneDrive / isGDrive` e o `return (<div key={arq.id} ...> ... </div>)`. Tire o `key={arq.id}` do `<div>` externo, porque o componente já põe a key.

Feche com:

```jsx
                      }}
                    />
```

Na `<div className="flex gap-2">` de ações da linha, **antes** do botão de excluir (`onDeleteArquivo`), acrescente o menu "Mover para…":

```jsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" title="Mover para outra pasta">
      <Folder className="w-4 h-4 text-amber-600" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    {pastasArquivos
      .filter((p) => p !== pastaDoArquivo(arq))
      .map((p) => (
        <DropdownMenuItem key={p} onClick={() => handleMoverArquivo(arq, p)}>
          Mover para {p}
        </DropdownMenuItem>
      ))}
  </DropdownMenuContent>
</DropdownMenu>
```

- [ ] **Passo 6: testes, lint e build**

Rodar:

```bash
cd apps/web && npx vitest run && npx eslint src/components/oportunidades src/lib/pastas-arquivo.js src/pages/Oportunidades.jsx --quiet && npm run build
```

Esperado:

- Vitest: todos passam, inclusive os de `pastas-arquivo`.
- eslint: sem saída.
- build: `✓ built in …`, sem erro.

- [ ] **Passo 7: commit**

```bash
git add apps/web/src/pages/Oportunidades.jsx apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx
git commit -m "feat(oportunidades): aba Arquivos em pastas, com mover e pasta no envio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Publicação e dados de Itatinga (PRODUÇÃO — só com OK do Javerson)

**Arquivos:** nenhum código novo. Os comandos rodam na produção.

- [ ] **Passo 1: aplicar a migração ANTES do push**

```bash
cd /c/Users/javer/sigoobras-base && supabase db query --linked -f supabase/migrations/0130_pastas_arquivos.sql
```

Conferir:

```bash
printf "select column_name from information_schema.columns where table_schema='public' and ((table_name='arquivo_oportunidade' and column_name='pasta') or (table_name='oportunidade' and column_name='pastas_arquivos'));" > /tmp/conf.sql && supabase db query --linked -f /tmp/conf.sql
```

Esperado: 2 linhas, `pasta` e `pastas_arquivos`.

- [ ] **Passo 2: publicar o site**

`git fetch && git rev-list --left-right --count origin/master...HEAD` deve mostrar `0 N`. Se mostrar atraso, faça rebase antes. Depois:

```bash
git push origin master
```

- [ ] **Passo 3: arquivos de habilitação de Itatinga → Envelope 02**

Grave em `/tmp/itatinga_pastas.sql` (UTF-8):

```sql
update public.arquivo_oportunidade
   set pasta = 'Envelope 02 – Habilitação'
 where oportunidade_id = '5a1e0c2e-9c0b-4d2a-8f3e-1a7a7a0e0926'
   and empresa_id = '00000000-695c-339e-bec0-d89449ec981c'
   and categoria is null
   and deleted_at is null;
select pasta, count(*) from public.arquivo_oportunidade
 where oportunidade_id = '5a1e0c2e-9c0b-4d2a-8f3e-1a7a7a0e0926' and deleted_at is null
 group by pasta order by pasta nulls first;
```

Rodar: `supabase db query --linked -f /tmp/itatinga_pastas.sql`
Esperado: `null` = 8 (os do edital, que aparecem em Edital) e `Envelope 02 – Habilitação` = 33, com o travessão intacto (sem `?`).

- [ ] **Passo 4: conferir na tela**

Abrir a oportunidade "PM Itatinga - SP" → aba Arquivos:

- Edital (8);
- Credenciamento (vazia);
- Envelope 01 – Proposta (vazia);
- Envelope 02 – Habilitação (33, em ordem 00-, 01a-, 01b-, 02-…);
- Outros (vazia).

"Mover para…" funciona, e "Nova pasta" cria e apaga uma pasta vazia.
