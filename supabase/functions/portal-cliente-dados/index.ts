/**
 * portal-cliente-dados — carrega TODOS os dados que o portal do cliente mostra,
 * escopados à oportunidade/projeto a que o cliente tem acesso.
 *
 * Substitui as leituras diretas (sigo.entities.*) de ClientePortal.jsx, que
 * voltariam vazias sob RLS (cliente opera como `anon`). Service role devolve só
 * o escopo permitido — menor privilégio.
 *
 * Credencial (uma das duas):
 *   - { token }        → magic link (token_cliente_oportunidade)
 *   - { portal_token } → login do cliente (HMAC, perfil "Cliente")
 *
 * (O modo "preview" interno NÃO passa por aqui — é o admin logado lendo direto,
 *  já protegido pela RLS da própria sessão.)
 *
 * Arquivos (logo, anexos, fotos do diário) ficam no banco como ref
 * "bucket/caminho"; o cliente não tem sessão da empresa para assinar, então a
 * resposta traz a URL pronta ao lado do valor original: empresa.logo_url_assinada,
 * arquivos[].url_assinada e diarios[].fotos_assinadas (mesma ordem de `fotos`).
 * null = nada a exibir (Base44, arquivo sumido).
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { resolveClienteScope } from "../_shared/portal-cliente-scope.ts";
import { assinarDaEmpresa, urlParaExibir } from "../_shared/storage-assinar.ts";

// deno-lint-ignore no-explicit-any
function alias(rows: any[] | null) {
  return (rows ?? []).map((r) => {
    if (r && r.created_at !== undefined && r.created_date === undefined)
      r.created_date = r.created_at;
    return r;
  });
}

/** diario_obra.fotos: jsonb (lista) ou string JSON do legado → lista de refs/URLs. */
function fotosDoDiario(fotos: unknown): unknown[] {
  let v = fotos;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  // deno-lint-ignore no-explicit-any
  return Array.isArray(v) ? v.map((f: any) => (typeof f === "string" ? f : (f?.url ?? null))) : [];
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    // deno-lint-ignore no-explicit-any
    let body: any;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    const supabase = createAdminClient();
    const { scope, error, status } = await resolveClienteScope(supabase, body);
    if (!scope) return fail(error ?? "Acesso negado", status ?? 401);

    const { empresa_id, oportunidade_id } = scope;

    // Empresa
    const { data: empresa } = await supabase
      .from("empresa")
      .select("id, nome, nome_fantasia, razao_social, logo_url")
      .eq("id", empresa_id)
      .maybeSingle();
    if (!empresa) return fail("Empresa não encontrada", 404);

    // Projeto OU Oportunidade (mesma id) — sempre da empresa do escopo (o
    // resolveClienteScope já confere; aqui é defesa em profundidade)
    let oportunidade = null;
    const { data: projeto } = await supabase
      .from("projeto")
      .select("*")
      .eq("id", oportunidade_id)
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    if (projeto) {
      oportunidade = projeto;
    } else {
      const { data: op } = await supabase
        .from("oportunidade")
        .select("*")
        .eq("id", oportunidade_id)
        .eq("empresa_id", empresa_id)
        .maybeSingle();
      if (!op) return fail("Projeto não encontrado", 404);
      oportunidade = op;
    }

    // Helper: tenta projeto_id; se vazio, oportunidade_id
    // deno-lint-ignore no-explicit-any
    async function porProjetoOuOportunidade(table: string, extra: Record<string, unknown> = {}) {
      let { data } = await supabase
        .from(table)
        .select("*")
        .eq("empresa_id", empresa_id)
        .eq("projeto_id", oportunidade_id)
        .match(extra);
      if (!data || data.length === 0) {
        const r = await supabase
          .from(table)
          .select("*")
          .eq("empresa_id", empresa_id)
          .eq("oportunidade_id", oportunidade_id)
          .match(extra);
        data = r.data;
      }
      return data ?? [];
    }

    const [orcamentoItens, cronogramaEtapas, arquivos, anotacoes, diariosRes] = await Promise.all([
      porProjetoOuOportunidade("orcamento_item"),
      porProjetoOuOportunidade("cronograma_etapa"),
      porProjetoOuOportunidade("arquivo_oportunidade"),
      porProjetoOuOportunidade("oportunidade_atualizacao", { tipo: "Nota" }),
      supabase
        .from("diario_obra")
        .select("*")
        .eq("empresa_id", empresa_id)
        .eq("projeto_id", oportunidade_id),
    ]);

    // deno-lint-ignore no-explicit-any
    const sortByOrdem = (a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0);
    // deno-lint-ignore no-explicit-any
    const sortByCreatedDesc = (a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

    // Assina tudo de uma vez (só refs da pasta desta empresa)
    const diarios = alias(diariosRes.data);
    const assinadas = await assinarDaEmpresa(
      supabase,
      [
        empresa.logo_url,
        // deno-lint-ignore no-explicit-any
        ...arquivos.map((a: any) => a.url),
        // deno-lint-ignore no-explicit-any
        ...diarios.flatMap((d: any) => fotosDoDiario(d.fotos)),
      ],
      empresa_id
    );

    return ok({
      empresa: { ...empresa, logo_url_assinada: urlParaExibir(empresa.logo_url, assinadas) },
      oportunidade,
      abas_liberadas: scope.abas,
      email_cliente: scope.email_cliente,
      orcamento_itens: alias(orcamentoItens).sort(sortByOrdem),
      cronograma_etapas: alias(cronogramaEtapas).sort(sortByOrdem),
      arquivos: alias(arquivos)
        // deno-lint-ignore no-explicit-any
        .map((a: any) => ({ ...a, url_assinada: urlParaExibir(a.url, assinadas) }))
        .sort(sortByCreatedDesc),
      anotacoes: alias(anotacoes).sort(sortByCreatedDesc),
      diarios: diarios
        // deno-lint-ignore no-explicit-any
        .map((d: any) => ({
          ...d,
          fotos_assinadas: fotosDoDiario(d.fotos).map((f) => urlParaExibir(f, assinadas)),
        }))
        // deno-lint-ignore no-explicit-any
        .sort((a: any, b: any) => new Date(b.data).getTime() - new Date(a.data).getTime()),
    });
  })
);
