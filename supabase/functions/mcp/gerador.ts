/**
 * Peças do mcp que só existem no Deno: as bibliotecas de PDF e Excel (as mesmas versões da tela) e
 * o resolvedor de DNS. Fica fora dos módulos puros: não é importável no Node (os testes injetam as
 * bibliotecas do node_modules e um DNS de mentira).
 *
 * Import DINÂMICO: jsPDF, jspdf-autotable e SheetJS só são carregados na primeira ferramenta que
 * gera arquivo; as outras ferramentas não pagam esse custo.
 */
import {
  combinarConsultasDns,
  interpretarRespostaDoh,
  type ConsultaDns,
} from "../_shared/conector/dns-combinar.ts";
import { resolverAutoTable, type LibsDocumentos } from "../_shared/documentos/proposta-export.ts";

let carregando: Promise<LibsDocumentos> | null = null;

export function carregarLibs(): Promise<LibsDocumentos> {
  carregando ??= (async () => {
    const [jspdf, autotable, xlsx] = await Promise.all([
      import("npm:jspdf@2.5.2"),
      import("npm:jspdf-autotable@3.8.4"),
      import("npm:xlsx@0.18.5"),
    ]);
    // conforme o runtime, o que o import devolve é o módulo (named exports) ou o CommonJS dentro de `default`
    // deno-lint-ignore no-explicit-any
    const jspdfMod = jspdf as any;
    const jsPDF = jspdfMod.jsPDF ?? jspdfMod.default?.jsPDF ?? jspdfMod.default;
    // deno-lint-ignore no-explicit-any
    const xlsxMod = xlsx as any;
    const XLSX = xlsxMod.utils ? xlsxMod : xlsxMod.default;
    if (typeof jsPDF !== "function") throw new Error("jspdf não carregou");
    if (typeof XLSX?.utils?.encode_cell !== "function" || typeof XLSX?.write !== "function") {
      throw new Error("xlsx não carregou");
    }
    // lança "jspdf-autotable não carregou" se a função não está em nenhum dos formatos do módulo
    return { jsPDF, autoTable: resolverAutoTable(autotable), XLSX };
  })().catch((e) => {
    carregando = null; // falhou: a próxima chamada tenta de novo
    throw e;
  });
  return carregando;
}

const TEMPO_DNS_MS = 5000;

/**
 * DNS-over-HTTPS (reserva, quando o runtime não deixa usar Deno.resolveDns): o JSON da resposta, que quem chama
 * lê com `interpretarRespostaDoh` (o campo Status separa "o nome não existe" de erro do servidor).
 */
async function resolverPorHttps(host: string, tipo: "A" | "AAAA"): Promise<unknown> {
  const r = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=${tipo}`,
    {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(TEMPO_DNS_MS),
    }
  );
  if (!r.ok) throw new Error(`DNS ${r.status}`);
  return await r.json();
}

/**
 * Uma consulta (A ou AAAA): o runtime primeiro, com o mesmo tempo-limite da reserva (o `signal` é a opção da
 * `Deno.ResolveDnsOptions`); erro que não é "não existe" (inclusive o tempo esgotado) cai na reserva por HTTPS.
 */
async function consultar(host: string, tipo: "A" | "AAAA"): Promise<ConsultaDns> {
  try {
    const enderecos = await Deno.resolveDns(host, tipo, {
      signal: AbortSignal.timeout(TEMPO_DNS_MS),
    });
    return { situacao: "ok", enderecos };
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return { situacao: "nao_existe" };
  }
  try {
    return interpretarRespostaDoh(await resolverPorHttps(host, tipo), tipo);
  } catch {
    return { situacao: "falhou" };
  }
}

/**
 * Endereços A e AAAA de um nome. Lista vazia = não resolveu, ou uma das duas consultas falhou e deixou um
 * lado sem conferir (quem chama recusa; a regra está em `combinarConsultasDns`).
 */
export async function resolverDns(host: string): Promise<string[]> {
  const [a, aaaa] = await Promise.all([consultar(host, "A"), consultar(host, "AAAA")]);
  return combinarConsultasDns(a, aaaa);
}
