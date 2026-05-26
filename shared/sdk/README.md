# @sigoobras/sdk

SDK do frontend que conversa com Supabase preservando a superfície de API do cliente legado. Isso permite migrar o app gradualmente: o frontend muda apenas **1 linha de import** para passar a usar o novo backend.

## Antes (SDK legado)

```jsx
import { base44 } from "@/api/base44Client";

const projetos = await base44.entities.Projeto.filter({ status_nome: "Ativo" });
const user = await base44.auth.me();
```

## Depois (Supabase via @sigoobras/sdk)

```jsx
import { sigo } from "@sigoobras/sdk";

const projetos = await sigo.entities.Projeto.filter({ status_nome: "Ativo" });
const user = await sigo.auth.me();
```

A mesma API, falando com Supabase por baixo.

## Setup

`apps/web/src/api/sigoClient.js` (rename do antigo `base44Client.js` no momento da troca):

```js
import { createClient } from "@sigoobras/sdk";

export const sigo = createClient({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});
```

E o resto do código não muda na semântica das chamadas — apenas a referência ao objeto exportado.

## Mapeamentos automáticos

| SDK legado                                                   | Supabase                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `entities.UsuarioCustom`                                     | tabela `usuario_custom` (PascalCase → snake_case)                      |
| `entities.X.filter({ ativo: true })`                         | `.from(t).select('*').match({ ativo: true })`                          |
| `entities.X.filter({ id: { $in: [...] } })`                  | `.in('id', [...])`                                                     |
| `entities.X.list({ limit, skip, sort_by: '-created_date' })` | `.range(skip, skip+limit-1).order('created_at', { ascending: false })` |
| `entities.X.get(id)`                                         | `.select('*').eq('id', id).maybeSingle()`                              |
| `entities.X.create(data)`                                    | `.insert(data).select().single()`                                      |
| `entities.X.update(id, data)`                                | `.update(data).eq('id', id).select().single()`                         |
| `entities.X.delete(id)`                                      | `.update({ deleted_at: now() }).eq('id', id)` (soft delete)            |
| `entities.X.bulkCreate([...])`                               | `.insert([...]).select()`                                              |
| `auth.me()`                                                  | `supabase.auth.getUser()` + JOIN com profiles                          |
| `auth.logout()`                                              | `supabase.auth.signOut()`                                              |
| `functions.invoke(name, payload)`                            | `supabase.functions.invoke(name, { body: payload })`                   |
| `integrations.Core.UploadFile({ file, fileName })`           | `supabase.storage.from(bucket).upload(path, file)`                     |
| `integrations.Core.SendEmail({...})`                         | Edge Function `send-email`                                             |
| `integrations.Core.InvokeLLM({...})`                         | Edge Function `invoke-llm`                                             |

## Particularidades semânticas

- **`created_date` ↔ `created_at`**: o SDK legado usa `created_date`, Postgres usa `created_at`. O wrapper traduz nos dois sentidos (escrita ignora, leitura adiciona `created_date` como alias).
- **Soft delete**: `delete()` faz `UPDATE deleted_at = now()` em vez de DELETE físico. `restore(id)` desfaz.
- **RLS**: ao usar a chave anon, RLS filtra automaticamente por `empresa_id` do JWT. Não passe `empresa_id` no filter — é redundante (e ignorado).

## Limitações conhecidas (v0.1.0)

- `asServiceRole` não implementado (só faz sentido em Edge Functions, não no frontend)
- `bulkUpdate` indisponível (Supabase JS não tem upsert sem `onConflict`)
- `restore()` ainda não implementado
- `integrations.Core.GenerateImage` / `ExtractDataFromUploadedFile` mapeados para Edge Functions que ainda não existem (chamada vai falhar até a Fase 4 do roadmap)

Veja `src/` para detalhes.
