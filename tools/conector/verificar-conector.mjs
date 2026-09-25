// Verificação ponta a ponta do conector do Claude (Plano 1).
// Uso:  node tools/conector/verificar-conector.mjs
//       SIGO_CHAVE=sigo_pk_... node tools/conector/verificar-conector.mjs   (+ checagens com a chave manual)
// A chave manual é gerada em Meu Perfil → Claude (IA). Rode no SEU terminal;
// não cole a chave no chat.
const SUPABASE = "https://fpyvdwpvxrubrkdwrqbs.supabase.co";
const MCP = `${SUPABASE}/functions/v1/mcp`;
const OAUTH = `${SUPABASE}/functions/v1/mcp-oauth`;
const AS = "https://www.sigoobras.com.br/.well-known/oauth-authorization-server";

let falhas = 0;
const conferir = (nome, cond, detalhe = "") => {
  console.log(`${cond ? "OK   " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas++;
};
const rpc = (method, params = {}, id = 1) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const post = (url, body, headers = {}) =>
  fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body,
  });
const json = (r) => r.json().catch(() => null);

// 1. Metadata do servidor de autorização (Hostgator)
const as = await fetch(AS);
const asJson = await json(as);
conferir(
  "metadata do AS: 200 e issuer certo",
  as.status === 200 && asJson?.issuer === "https://www.sigoobras.com.br",
  `status ${as.status}`
);
conferir(
  "metadata do AS: application/json",
  (as.headers.get("content-type") ?? "").includes("application/json")
);
conferir("metadata do AS: PKCE S256", !!asJson?.code_challenge_methods_supported?.includes("S256"));

// 2. MCP sem chave → 401 + resource_metadata
const r401 = await post(MCP, rpc("tools/list"));
const www = r401.headers.get("www-authenticate") ?? "";
conferir("MCP sem chave → 401", r401.status === 401, `status ${r401.status}`);
conferir(
  "WWW-Authenticate com resource_metadata",
  /resource_metadata="[^"]+\/oauth-protected-resource"/.test(www),
  www
);

// 3. Metadata do recurso protegido
const prm = await json(await fetch(`${MCP}/.well-known/oauth-protected-resource`));
conferir("PRM: resource = URL do MCP", prm?.resource === MCP, prm?.resource);
conferir("PRM: AS do SIGO", prm?.authorization_servers?.[0] === "https://www.sigoobras.com.br");

// 4. Chave falsa → 401 invalid_token
const falsa = await post(MCP, rpc("tools/list"), { authorization: "Bearer sigo_at_falsa" });
conferir(
  "chave falsa → 401 invalid_token",
  falsa.status === 401 && /invalid_token/.test(falsa.headers.get("www-authenticate") ?? "")
);

// 5. Registro dinâmico
const ruim = await post(
  `${OAUTH}/register`,
  JSON.stringify({ client_name: "x", redirect_uris: ["https://evil.example/cb"] })
);
conferir("registro com redirect estranho → 400", ruim.status === 400, `status ${ruim.status}`);
const bom = await post(
  `${OAUTH}/register`,
  JSON.stringify({
    client_name: "Verificação do plano 1",
    redirect_uris: ["http://localhost:53682/callback"],
    token_endpoint_auth_method: "none",
  })
);
const bomJson = await json(bom);
conferir(
  "registro loopback → 201 com client_id",
  bom.status === 201 && /^sigo_c_/.test(bomJson?.client_id ?? ""),
  `status ${bom.status}`
);

// 6. Token com código falso
const tk = await fetch(`${OAUTH}/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: "sigo_ac_falso",
    redirect_uri: "http://localhost:53682/callback",
    client_id: bomJson?.client_id ?? "x",
    code_verifier: "a".repeat(43),
  }),
});
const tkJson = await json(tk);
conferir(
  "token com código falso → 400 invalid_grant",
  tk.status === 400 && tkJson?.error === "invalid_grant",
  `status ${tk.status}`
);
conferir(
  "token com Cache-Control no-store",
  (tk.headers.get("cache-control") ?? "").includes("no-store")
);

// 7. Com a chave manual
const chave = process.env.SIGO_CHAVE;
if (chave) {
  const h = { authorization: `Bearer ${chave}` };
  const init = await json(
    await post(
      MCP,
      rpc("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "verificacao", version: "1" },
      }),
      h
    )
  );
  conferir("initialize (legado)", init?.result?.protocolVersion === "2025-11-25");
  const disc = await json(
    await post(
      MCP,
      rpc("server/discover", {
        _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" },
      }),
      {
        ...h,
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "server/discover",
      }
    )
  );
  conferir(
    "server/discover (2026-07-28)",
    !!disc?.result?.supportedVersions?.includes("2026-07-28")
  );
  const lista = await json(
    await post(MCP, rpc("tools/list"), { ...h, "mcp-protocol-version": "2025-11-25" })
  );
  conferir(
    "tools/list tem empresa_atual",
    !!lista?.result?.tools?.some((t) => t.name === "empresa_atual")
  );
  const emp = await json(
    await post(MCP, rpc("tools/call", { name: "empresa_atual", arguments: {} }), {
      ...h,
      "mcp-protocol-version": "2025-11-25",
    })
  );
  const sc = emp?.result?.structuredContent;
  console.log(`      empresa: ${sc?.empresa?.nome} | usuário: ${sc?.usuario?.email}`);
  conferir("empresa_atual devolve a empresa da chave", !!sc?.empresa?.id);
  // a chave NÃO vale fora do conector
  const rest = await fetch(`${SUPABASE}/rest/v1/empresa?select=id&limit=1`, {
    headers: { ...h, apikey: process.env.SIGO_ANON ?? chave },
  });
  conferir(
    "chave recusada na API REST",
    rest.status === 401 || rest.status === 403,
    `status ${rest.status}`
  );
  const troca = await post(
    `${SUPABASE}/functions/v1/trocar-empresa`,
    JSON.stringify({ empresa_id: "00000000-0000-0000-0000-000000000000" }),
    h
  );
  conferir("chave recusada em trocar-empresa", troca.status === 401, `status ${troca.status}`);
  const tela = await post(OAUTH, JSON.stringify({ acao: "listar" }), h);
  conferir(
    "chave recusada nas ações da tela (mcp-oauth)",
    tela.status === 401,
    `status ${tela.status}`
  );
} else {
  console.log("(sem SIGO_CHAVE: pulei as checagens com a chave manual)");
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
