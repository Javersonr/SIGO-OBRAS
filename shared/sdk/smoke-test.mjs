#!/usr/bin/env node
/**
 * Smoke test do @sigoobras/sdk contra o Supabase real.
 *
 * Uso:
 *   cd shared/sdk
 *   node smoke-test.mjs
 *
 * Lê SUPABASE_URL e SUPABASE_ANON_KEY do ambiente.
 * Espera que o Supabase esteja com as 15 migrations aplicadas + buckets criados.
 */

import { createClient } from "./src/index.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://fpyvdwpvxrubrkdwrqbs.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZweXZkd3B2eHJ1YnJrZHdycWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNTQyNTYsImV4cCI6MjA5MzczMDI1Nn0.Npvrjuu8gGrGugw-RVHI6ZgvoKqJSPW93inC4rw3lWU";

const base44 = createClient({
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
});

let pass = 0,
  fail = 0;
function ok(name) {
  pass++;
  console.log(`  ✓ ${name}`);
}
function ko(name, err) {
  fail++;
  console.log(`  ✗ ${name}: ${err?.message || err}`);
}

console.log("=== Smoke test @sigoobras/sdk ===\n");

// 1. Estrutura do client
console.log("[1] Estrutura do client:");
try {
  if (typeof base44.entities === "object") ok("base44.entities existe");
  else throw new Error("entities ausente");
  if (typeof base44.auth.me === "function") ok("base44.auth.me é função");
  else throw new Error("auth.me não é função");
  if (typeof base44.functions.invoke === "function") ok("base44.functions.invoke é função");
  else throw new Error("functions.invoke não é função");
  if (typeof base44.integrations.Core.UploadFile === "function")
    ok("integrations.Core.UploadFile é função");
  else throw new Error("UploadFile não é função");
} catch (e) {
  ko("estrutura", e);
}

// 2. Proxy de entities responde dinamicamente
console.log("\n[2] Proxy de entities:");
try {
  const e1 = base44.entities.Empresa;
  const e2 = base44.entities.TransacaoFinanceira;
  if (typeof e1.filter === "function" && typeof e2.create === "function")
    ok("entities.Empresa e .TransacaoFinanceira respondem");
  else throw new Error("Proxy não retornou métodos esperados");
} catch (e) {
  ko("proxy", e);
}

// 3. Name mapping
console.log("\n[3] Name mapping:");
try {
  const { entityToTable } = await import("./src/name-mapper.js");
  const cases = [
    ["Empresa", "empresa"],
    ["UsuarioCustom", "usuario_custom"],
    ["TransacaoFinanceira", "transacao_financeira"],
    ["HistoricoDocumentoAssinado", "historico_documento_assinado"],
    ["EPI", "epi"],
    ["NotaFiscalDevolucao", "nota_fiscal_devolucao"],
  ];
  for (const [pascal, snake] of cases) {
    const got = entityToTable(pascal);
    if (got === snake) ok(`${pascal} → ${snake}`);
    else ko(`${pascal} → ${snake}`, `got ${got}`);
  }
} catch (e) {
  ko("name-mapper", e);
}

// 4. Query real contra Supabase (sem autenticação — deve retornar [] devido a RLS)
console.log("\n[4] Query real (RLS bloqueia, esperado []):");
try {
  const empresas = await base44.entities.Empresa.list({ limit: 5 });
  if (Array.isArray(empresas)) ok(`Empresa.list retornou array (length=${empresas.length})`);
  else throw new Error("não retornou array");
} catch (e) {
  ko("Empresa.list", e);
}

try {
  const planos = await base44.entities.Plano.list({ limit: 5 });
  if (Array.isArray(planos)) ok(`Plano.list retornou array (length=${planos.length})`);
  else throw new Error("não retornou array");
} catch (e) {
  ko("Plano.list", e);
}

// 5. auth.me sem login
console.log("\n[5] auth.me sem sessão (deve dar erro NOT_AUTHENTICATED):");
try {
  await base44.auth.me();
  ko("auth.me", "deveria ter falhado");
} catch (e) {
  if (e.code === "NOT_AUTHENTICATED") ok("rejeitou corretamente sem auth");
  else ko("auth.me", e);
}

// 6. Filter com operadores
console.log("\n[6] Filter com operadores ($in, $gte):");
try {
  const r1 = await base44.entities.Plano.filter({ ativo: true });
  if (Array.isArray(r1)) ok(`filter({ativo: true}) retornou array`);
  const r2 = await base44.entities.Plano.filter({ valor_mensal: { $gte: 0 } });
  if (Array.isArray(r2)) ok(`filter com $gte retornou array`);
} catch (e) {
  ko("filter operadores", e);
}

// 7. Functions.invoke (vai falhar pq não existe ainda — esperado)
console.log("\n[7] Functions.invoke em function inexistente (deve falhar):");
try {
  await base44.functions.invoke("teste-inexistente", { foo: "bar" });
  ko("functions.invoke", "deveria ter falhado");
} catch (e) {
  ok(`falhou como esperado: ${e.message?.slice(0, 80)}`);
}

console.log(`\n=== RESULTADO ===\n${pass} passou | ${fail} falhou\n`);
process.exit(fail > 0 ? 1 : 0);
