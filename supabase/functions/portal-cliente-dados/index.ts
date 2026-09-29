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
 * Service role enxerga tudo: a resposta leva SÓ as colunas que o ClientePortal
 * (modo externo) usa — nada de select("*") (observações internas, probabilidade,
 * análise de edital, retenções, BDI/imposto, custo unitário ficam de fora).
 *
 * Abas liberadas (abas_liberadas do magic link; o login libera as duas) valem
 * AQUI, não só na tela:
 *   - "orcamento" fechada → sem orcamento_itens e sem valor do projeto
 *   - "obra" fechada      → sem cronograma_etapas e sem diarios (fotos)
 * Arquivos e anotações não dependem de aba.
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

// Colunas que o ClientePortal.jsx (modo externo) exibe ou usa. projeto e
// oportunidade têm as mesmas; valor_estimado só com a aba "orcamento".
const COLS_OPORTUNIDADE = "id, nome";
const COLS_OPORTUNIDADE_VALOR = "id, nome, valor_estimado";
// sem valor_unitario, bdi, imposto, kit/material, campos_customizados
const COLS_ORCAMENTO_ITEM = "id, codigo, descricao, unidade, quantidade, valor_total, ordem";
// RelatorioObra: sem responsável/prioridade
const COLS_CRONOGRAMA =
  "id, etapa, descricao, status, data_inicio_planejada, data_fim_planejada, data_inicio_real, data_fim_real, percentual_conclusao, ordem";
const COLS_ARQUIVO = "id, nome, url, usuario_nome, created_at";
const COLS_NOTA = "id, descricao, usuario_nome, created_at";
// sem problemas, responsável, contrato, contratante, horários
const COLS_DIARIO = "id, data, clima, temperatura, atividades, observacoes, mao_de_obra, fotos";

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
    // abas já normalizadas no resolveClienteScope: só `true` libera
    const liberaOrcamento = scope.abas.orcamento === true;
    const liberaObra = scope.abas.obra === true;

    // Empresa
    const { data: empresa } = await supabase
      .from("empresa")
      .select("id, nome, nome_fantasia, razao_social, logo_url")
      .eq("id", empresa_id)
      .maybeSingle();
    if (!empresa) return fail("Empresa não encontrada", 404);

    // Projeto OU Oportunidade (mesma id) — sempre da empresa do escopo (o
    // resolveClienteScope já confere; aqui é defesa em profundidade)
    const colsOportunidade = liberaOrcamento ? COLS_OPORTUNIDADE_VALOR : COLS_OPORTUNIDADE;
    let oportunidade = null;
    const { data: projeto } = await supabase
      .from("projeto")
      .select(colsOportunidade)
      .eq("id", oportunidade_id)
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    if (projeto) {
      oportunidade = projeto;
    } else {
      const { data: op } = await supabase
        .from("oportunidade")
        .select(colsOportunidade)
        .eq("id", oportunidade_id)
        .eq("empresa_id", empresa_id)
        .maybeSingle();
      if (!op) return fail("Projeto não encontrado", 404);
      oportunidade = op;
    }

    // Helper: tenta projeto_id; se vazio, oportunidade_id (só linhas não apagadas)
    async function porProjetoOuOportunidade(
      table: string,
      colunas: string,
      extra: Record<string, unknown> = {}
      // deno-lint-ignore no-explicit-any
    ): Promise<any[]> {
      const r1 = await supabase
        .from(table)
        .select(colunas)
        .eq("empresa_id", empresa_id)
        .eq("projeto_id", oportunidade_id)
        .is("deleted_at", null)
        .match(extra);
      if (r1.error) console.error(`[portal-cliente-dados] ${table}:`, r1.error.message);
      let data = r1.data;
      if (!data || data.length === 0) {
        const r = await supabase
          .from(table)
          .select(colunas)
          .eq("empresa_id", empresa_id)
          .eq("oportunidade_id", oportunidade_id)
          .is("deleted_at", null)
          .match(extra);
        if (r.error) console.error(`[portal-cliente-dados] ${table}:`, r.error.message);
        data = r.data;
      }
      return data ?? [];
    }

    // Aba fechada = nem consulta (nada sai do banco)
    const [orcamentoItens, cronogramaEtapas, arquivos, anotacoes, diariosRes] = await Promise.all([
      liberaOrcamento ? porProjetoOuOportunidade("orcamento_item", COLS_ORCAMENTO_ITEM) : [],
      liberaObra ? porProjetoOuOportunidade("cronograma_etapa", COLS_CRONOGRAMA) : [],
      porProjetoOuOportunidade("arquivo_oportunidade", COLS_ARQUIVO),
      porProjetoOuOportunidade("oportunidade_atualizacao", COLS_NOTA, { tipo: "Nota" }),
      liberaObra
        ? supabase
            .from("diario_obra")
            .select(COLS_DIARIO)
            .eq("empresa_id", empresa_id)
            .eq("projeto_id", oportunidade_id)
            .is("deleted_at", null)
        : { data: [], error: null },
    ]);
    if (diariosRes.error) {
      console.error("[portal-cliente-dados] diario_obra:", diariosRes.error.message);
    }

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
      abas_liberadas: { orcamento: liberaOrcamento, obra: liberaObra },
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
