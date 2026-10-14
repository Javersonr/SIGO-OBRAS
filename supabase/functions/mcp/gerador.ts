/**
 * Peças do mcp que só existem no Deno: as bibliotecas de PDF e Excel (as mesmas versões da tela) e
 * o resolvedor de DNS. Fica fora dos módulos puros: não é importável no Node (os testes injetam as
 * bibliotecas do node_modules e um DNS de mentira).
 *
 * Import DINÂMICO: jsPDF, jspdf-autotable e SheetJS só são carregados na primeira ferramenta que
 * gera arquivo; as outras ferramentas não pagam esse custo.
 */
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

/** DNS-over-HTTPS (reserva, quando o runtime não deixa usar Deno.resolveDns). */
async function resolverPorHttps(host: string, tipo: "A" | "AAAA"): Promise<string[]> {
  const r = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=${tipo}`,
    {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(TEMPO_DNS_MS),
    }
  );
  if (!r.ok) throw new Error(`DNS ${r.status}`);
  const corpo = (await r.json()) as { Answer?: { type: number; data: string }[] };
  const codigo = tipo === "A" ? 1 : 28;
  return (corpo.Answer ?? []).filter((a) => a.type === codigo).map((a) => a.data);
}

/** Endereços A e AAAA de um nome. Lista vazia = não resolveu (quem chama recusa). */
export async function resolverDns(host: string): Promise<string[]> {
  const tentar = async (tipo: "A" | "AAAA"): Promise<string[]> => {
    try {
      return await Deno.resolveDns(host, tipo);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) return [];
      return await resolverPorHttps(host, tipo).catch(() => []);
    }
  };
  const [a, aaaa] = await Promise.all([tentar("A"), tentar("AAAA")]);
  return [...a, ...aaaa];
}
