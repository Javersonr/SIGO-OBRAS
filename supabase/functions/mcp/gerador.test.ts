// node --test supabase/functions/mcp/gerador.test.ts
// O gerador.ts só roda no Deno (import dinâmico `npm:`), então o teste lê o texto dele.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./gerador.ts", import.meta.url), "utf8");

/** Onde o npm pode ter instalado o pacote: na raiz (o normal, workspaces) ou, se ele foi para dentro do app, em apps/web. */
const PASTAS_DE_PACOTES = ["../../../apps/web/node_modules", "../../../node_modules"];

/** A versão que está em node_modules: a que a tela e os testes de paridade usam. */
const versaoInstalada = (pacote: string): string => {
  for (const pasta of PASTAS_DE_PACOTES) {
    try {
      return JSON.parse(
        readFileSync(new URL(`${pasta}/${pacote}/package.json`, import.meta.url), "utf8")
      ).version;
    } catch (e) {
      // só "não está nesta pasta" passa para a próxima; um package.json quebrado deve aparecer
      if ((e as { code?: string }).code !== "ENOENT") throw e;
    }
  }
  throw new Error(
    `O pacote "${pacote}" não está instalado em node_modules/ da raiz nem em apps/web/node_modules/: rode npm install na raiz do repositório.`
  );
};

test("gerador.ts: as versões dos imports npm: são as instaladas (as da tela e da paridade), sem faixa", () => {
  const imports = [...fonte.matchAll(/import\("npm:([^@"]+)@([^"]+)"\)/g)].map(
    (m) => [m[1], m[2]] as const
  );
  assert.deepEqual(imports.map(([pacote]) => pacote).sort(), ["jspdf", "jspdf-autotable", "xlsx"]);
  for (const [pacote, versao] of imports) {
    assert.match(versao, /^\d+\.\d+\.\d+$/, `${pacote}: versão exata, sem ^ nem ~`);
    assert.equal(versao, versaoInstalada(pacote), `${pacote}: gerador.ts × node_modules`);
  }
});

test("gerador.ts: a consulta DNS do runtime tem tempo-limite e o erro de tempo cai na reserva por HTTPS", () => {
  // Deno.resolveDns(host, tipo, { signal }) é a opção ResolveDnsOptions.signal do Deno
  assert.match(
    fonte,
    /Deno\.resolveDns\(\s*host,\s*tipo,\s*\{\s*signal:\s*AbortSignal\.timeout\(TEMPO_DNS_MS\),?\s*\}\s*\)/
  );
  // só "não existe" encerra a consulta; qualquer outro erro (inclusive o tempo esgotado) segue para a reserva
  const consultar = fonte.slice(
    fonte.indexOf("async function consultar("),
    fonte.indexOf("export async function resolverDns")
  );
  assert.match(
    consultar,
    /catch \(e\) \{\s*if \(e instanceof Deno\.errors\.NotFound\) return \{ situacao: "nao_existe" \};\s*\}\s*try \{\s*return interpretarRespostaDoh\(await resolverPorHttps\(host, tipo\), tipo\);/
  );
});
