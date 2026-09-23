# Sub-projeto A — Fundação IA + remoção do Base44 (Plano de Implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ponte de IA (OpenAI) via edge functions com chave global gerenciada no SaaS Admin, e `sigoClient` 100% nativo sem `@base44/sdk`.

**Architecture:** Duas edge functions novas (`saas-config` para a chave, `ia-processar` para chamadas de IA com arquivos do Storage); frontend troca o cliente legado por um objeto nativo com a MESMA superfície (`entities/functions/integrations/auth`), então nenhum call-site muda de assinatura. Política RLS nova cobre a única consulta cross-tenant (`empresas do grupo`).

**Tech Stack:** Deno edge functions (padrão do repo: `_shared/cors.ts`, `_shared/supabase-admin.ts`), OpenAI Responses API (fetch puro), React/Vite no front, migração SQL aplicada via `supabase db query --linked -f`.

## Global Constraints

- Commits: mensagem ≤100 chars no título; rodapé `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; nunca amend/força.
- Migração aplicada ao vivo com `supabase db query --linked -f <arquivo>` (NUNCA `db push`).
- Edge functions deployadas com `supabase functions deploy <nome>` (PowerShell, cwd `C:\Users\javer\sigoobras-base`).
- A chave OpenAI NUNCA volta inteira em nenhuma resposta (só `configurada` + últimos 4).
- Build de verificação: `npm run build --workspace apps/web` e `npm run test --workspace apps/web` verdes antes de cada push.

---

### Task 1: Migração 0093 — tabela saas_config + policy empresas do grupo

**Files:**

- Create: `supabase/migrations/0093_saas_config_e_grupo.sql`

**Interfaces:**

- Produces: tabela `public.saas_config(chave text pk, valor text, updated_at)` acessível SÓ via service role (RLS ligada sem policies); policy `empresa_mesmo_grupo` em `public.empresa`.

- [ ] **Step 1: Escrever a migração**

```sql
-- 0093: config global do SaaS (só service role) + leitura de empresas do grupo
create table if not exists public.saas_config (
  chave text primary key,
  valor text not null,
  updated_at timestamptz not null default now()
);
alter table public.saas_config enable row level security;
-- sem policies: anon/authenticated não leem; service role bypassa.

-- Layout lia empresas do grupo via asServiceRole (que morre com o Base44).
-- Usuário autenticado passa a enxergar empresas ATIVAS do MESMO grupo da sua.
do $pol$ begin
  create policy empresa_mesmo_grupo on public.empresa for select
    using (
      grupo_id is not null
      and ativo = true
      and grupo_id = (select e.grupo_id from public.empresa e
                       where e.id = public.current_empresa_id())
    );
exception when duplicate_object then null; end $pol$;
```

- [ ] **Step 2: Aplicar ao vivo** — `supabase db query --linked -f supabase/migrations/0093_saas_config_e_grupo.sql`; esperado: sem erro.
- [ ] **Step 3: Verificar** — query `select relrowsecurity from pg_class where relname='saas_config'` → `true`; `select count(*) from pg_policies where tablename='empresa' and policyname='empresa_mesmo_grupo'` → 1.
- [ ] **Step 4: Commit** — `git add supabase/migrations/0093_saas_config_e_grupo.sql && git commit -m "feat(saas): tabela saas_config (service-role) + policy empresas do mesmo grupo"`.

### Task 2: `_shared/usuario-request.ts` — identificar usuário/super admin da requisição

**Files:**

- Create: `supabase/functions/_shared/usuario-request.ts`

**Interfaces:**

- Consumes: `createAdminClient()` de `_shared/supabase-admin.ts`.
- Produces: `usuarioDaRequisicao(req) → Promise<{ email: string; is_super_admin: boolean } | null>` (null = sem sessão válida).

- [ ] **Step 1: Implementar**

```ts
import { createAdminClient } from "./supabase-admin.ts";

/** Resolve o usuário logado a partir do JWT Supabase Auth do header. */
export async function usuarioDaRequisicao(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.getUser(jwt);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;
  const { data: uc } = await supabase
    .from("usuario_custom")
    .select("email, is_super_admin, ativo")
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();
  if (!uc || !uc.ativo) return null;
  return { email: uc.email, is_super_admin: !!uc.is_super_admin };
}
```

- [ ] **Step 2: Commit** junto da Task 3 (arquivo compartilhado sem deploy próprio).

### Task 3: Edge function `saas-config`

**Files:**

- Create: `supabase/functions/saas-config/index.ts`

**Interfaces:**

- Consumes: `usuarioDaRequisicao`; tabela `saas_config` (Task 1).
- Produces: POST `{acao:"status"}` → `{success, openai:{configurada, final, modelo}}`; POST `{acao:"definir", chave_openai?, modelo?}` → `{success}`. 401 sem sessão; 403 sem super admin.

- [ ] **Step 1: Implementar** — validar super admin; `definir` faz upsert de `openai_api_key` (se veio `chave_openai`, trim, exigir prefixo `sk-`) e `openai_modelo` (se veio); `status` lê `openai_api_key` (env `OPENAI_API_KEY` tem precedência) e responde `configurada` + `final` (últimos 4) + `modelo` (default `gpt-4o-mini`). Nunca retornar a chave.
- [ ] **Step 2: Deploy** — `supabase functions deploy saas-config`.
- [ ] **Step 3: Teste REST** — sem Authorization de usuário → 401; (super admin real será testado via UI na Task 6).
- [ ] **Step 4: Commit** — `feat(saas): edge function saas-config (chave OpenAI global, so super admin)`.

### Task 4: `_shared/openai.ts` + edge function `ia-processar`

**Files:**

- Create: `supabase/functions/_shared/openai.ts`
- Create: `supabase/functions/ia-processar/index.ts`

**Interfaces:**

- Consumes: `saas_config` (chave/modelo), Storage via service role (refs `"bucket/caminho"` — mesma convenção do `resolveStorageUrl` do front).
- Produces: POST `{acao:"llm", prompt, json_schema?, file_refs?}` → `{success, resultado}` (JSON parseado quando há schema, senão texto). `{acao:"extrair_documentos", file_refs, checklist}` e `{acao:"validar_exames_pcmso", pcmso_ref, exames_refs, funcao}` → prompts prontos sobre o mesmo núcleo. 401 sem sessão; 503 `"IA não configurada"` sem chave.

- [ ] **Step 1: `_shared/openai.ts`**

```ts
import { createAdminClient } from "./supabase-admin.ts";

const LIMITE_ARQUIVO = 15 * 1024 * 1024; // 15MB por arquivo

export async function lerConfigOpenAI() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("saas_config")
    .select("chave, valor")
    .in("chave", ["openai_api_key", "openai_modelo"]);
  const mapa = new Map((data ?? []).map((r) => [r.chave, r.valor]));
  const apiKey = Deno.env.get("OPENAI_API_KEY") || mapa.get("openai_api_key") || null;
  const modelo = mapa.get("openai_modelo") || "gpt-4o-mini";
  return { apiKey, modelo };
}

/** Baixa um ref "bucket/caminho" do Storage e devolve item de input da OpenAI. */
export async function refParaInput(ref: string) {
  const slash = ref.indexOf("/");
  if (slash < 1) throw new Error(`ref inválido: ${ref}`);
  const bucket = ref.slice(0, slash),
    path = ref.slice(slash + 1);
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download falhou (${ref}): ${error?.message}`);
  const buf = new Uint8Array(await data.arrayBuffer());
  if (buf.byteLength > LIMITE_ARQUIVO) throw new Error(`arquivo ${ref} acima de 15MB`);
  let b64 = "";
  const CH = 32768;
  for (let i = 0; i < buf.length; i += CH) b64 += String.fromCharCode(...buf.subarray(i, i + CH));
  b64 = btoa(b64);
  const nome = path.split("/").pop() || "arquivo";
  const ehImagem = /\.(png|jpe?g|webp|gif)$/i.test(nome);
  return ehImagem
    ? { type: "input_image", image_url: `data:image/${nome.split(".").pop()};base64,${b64}` }
    : { type: "input_file", filename: nome, file_data: `data:application/pdf;base64,${b64}` };
}

export async function chamarOpenAI(opts: {
  prompt: string;
  fileRefs?: string[];
  jsonSchema?: unknown;
  modelo?: string;
}) {
  const { apiKey, modelo } = await lerConfigOpenAI();
  if (!apiKey) return { ok: false as const, erro: "IA_NAO_CONFIGURADA" };
  const conteudo: unknown[] = [{ type: "input_text", text: opts.prompt }];
  for (const ref of opts.fileRefs ?? []) conteudo.push(await refParaInput(ref));
  const body: Record<string, unknown> = {
    model: opts.modelo || modelo,
    input: [{ role: "user", content: conteudo }],
  };
  if (opts.jsonSchema) {
    body.text = { format: { type: "json_schema", name: "resposta", schema: opts.jsonSchema, strict: false } };
  }
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) return { ok: false as const, erro: j?.error?.message || `OpenAI ${r.status}` };
  const texto =
    j.output_text ??
    j.output
      ?.flatMap((o: any) => o.content ?? [])
      .filter((c: any) => c.type === "output_text")
      .map((c: any) => c.text)
      .join("") ??
    "";
  if (opts.jsonSchema) {
    try {
      return { ok: true as const, resultado: JSON.parse(texto) };
    } catch {
      return { ok: false as const, erro: "IA devolveu JSON inválido" };
    }
  }
  return { ok: true as const, resultado: texto };
}
```

- [ ] **Step 2: `ia-processar/index.ts`** — `withCors`; exigir `usuarioDaRequisicao` (401); switch da `acao`:
  - `llm`: repassa `{prompt, json_schema, file_refs}`;
  - `extrair_documentos`: prompt fixo que pede JSON `{campos:{nome_completo,cpf,rg,data_nascimento,telefone,endereco,cidade,estado,cep,pis_nis,ctps_numero}, classificacao:[{arquivo, item_checklist}], observacoes}` recebendo `checklist` (array de nomes) e os arquivos;
  - `validar_exames_pcmso`: prompt fixo que pede JSON `{aprovado:boolean, pendencias:[{exame, motivo}], resumo}` com o PCMSO como primeiro arquivo e os exames em seguida, informando a `funcao`;
  - erro `IA_NAO_CONFIGURADA` → `fail(..., 503)`.
- [ ] **Step 3: Deploy** — `supabase functions deploy ia-processar`.
- [ ] **Step 4: Teste REST** — sem JWT → 401; com JWT válido (login real) e sem chave → 503 "IA não configurada". (Com chave real: smoke `acao:"llm"` prompt "responda ok".)
- [ ] **Step 5: Commit** — `feat(ia): edge function ia-processar (OpenAI Responses, arquivos do Storage)`.

### Task 5: SaaS Admin → aba Integrações

**Files:**

- Create: `apps/web/src/components/saas/IntegracoesTab.jsx`
- Modify: `apps/web/src/pages/SaasAdmin.jsx` (TabsTrigger "Integrações" após "Financeiro" ~linha 807 + TabsContent com o componente)

**Interfaces:**

- Consumes: `sigo.functions.invoke("saasConfig", {...})` (mapeado na Task 6 para `saas-config`).
- Produces: UI com status (● configurada / ○ não configurada, final ...XXXX, modelo) + form pra colar chave nova e escolher modelo (`gpt-4o-mini` default, `gpt-4o` opção) + botão salvar; nunca exibe a chave salva.

- [ ] **Step 1: Implementar componente** (Card com status carregado no mount via `{acao:"status"}`; input password pra chave; Select modelo; salvar chama `{acao:"definir"}` e recarrega status; toasts de sucesso/erro).
- [ ] **Step 2: Plugar aba no SaasAdmin.jsx**.
- [ ] **Step 3: Commit** — `feat(saas): aba Integracoes no SaaS Admin (chave OpenAI)`.

### Task 6: `sigoClient` nativo (remoção do @base44/sdk)

**Files:**

- Modify: `apps/web/src/api/sigoClient.js` (reescrita)
- Modify: `apps/web/src/Layout.jsx:186` (`asServiceRole` → `sigo.entities`)
- Modify: `apps/web/src/components/seguranca/VisualizarFerramentasModal.jsx:221` (idem)
- Delete: `apps/web/src/lib/app-params.js`
- Modify: `apps/web/package.json` (remover `@base44/sdk`)

**Interfaces:**

- Produces (superfície idêntica à atual): `sigo.entities.*` (inalterado), `sigo.functions.invoke(nome, payload)` (REWRITE + novos `saasConfig: "saas-config"`, `iaProcessar: "ia-processar"`; nome fora do mapa → `{data:{success:false,error:"função <nome> não migrada do Base44"}}`), `sigo.integrations.Core.UploadFile` (inalterado), `sigo.integrations.Core.InvokeLLM({prompt, response_json_schema, file_urls})` → `invoke("iaProcessar", {acao:"llm", prompt, json_schema: response_json_schema, file_refs: file_urls})` devolvendo `resultado`, `sigo.integrations.Core.SendEmail` → throw `Error("Envio de e-mail ainda não migrado do Base44")`, `sigo.auth.me()` → objeto da sessão custom (`sessionStorage.custom_auth`) com alias `full_name`; `sigo.auth.logout()` → limpa sessão custom + `encerrarSessao()`; `sigo.asServiceRole` REMOVIDO (os 2 call-sites migrados).
- Exports mantidos: `sigo`, `supabase`, `resolveStorageUrl`, `aplicarSessao`, `encerrarSessao`.

- [ ] **Step 1: Reescrever sigoClient.js** (sem import `@base44/sdk` e sem `appParams`; `supa` do `@sigoobras/sdk` como única base; wrapper `subscribe` no-op mantido).
- [ ] **Step 2: Migrar os 2 call-sites de `asServiceRole`** para `sigo.entities` (Layout mantém try/catch de fallback — a policy da Task 1 garante o SELECT das empresas do grupo).
- [ ] **Step 3: Remover dependência** — tirar `@base44/sdk` de `apps/web/package.json`, apagar `lib/app-params.js`, `npm install` p/ atualizar lockfile.
- [ ] **Step 4: Verificar** — `grep -rn "base44" apps/web/src` só pode sobrar em comentários; `npm run build` e `npm run test` verdes.
- [ ] **Step 5: Smoke em produção pós-deploy** — login REST no `login-custom` (200), abrir site, anexar comprovante (UploadFile) segue OK.
- [ ] **Step 6: Commit + push** — `feat(core)!: sigoClient nativo — fim do @base44/sdk no bundle`.

## Self-review

- Cobertura da spec (Sub-projeto A): itens 1 (ia-processar ✓ Task 4), 2 (SaaS Admin ✓ Tasks 3+5), 3 (sigoClient nativo ✓ Task 6, incluindo InvokeLLM→ia-processar, SendEmail erro claro, funções não migradas erro claro, auth nativo, asServiceRole eliminado, dep removida) — completo.
- Riscos da spec endereçados: RLS do grupo (policy Task 1 + fallback do Layout); custo OpenAI (limite 15MB/arquivo, modelo econômico default).
- Tipos/nomes consistentes entre tasks (`saasConfig`/`iaProcessar`, refs `bucket/caminho`).
