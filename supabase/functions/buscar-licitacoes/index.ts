/**
 * buscar-licitacoes — busca automática de licitações via API Alerta Licitação.
 *
 * Fluxo:
 *   1. Lê as configs ativas de licitacao_busca (UFs, palavras-chave, modalidades,
 *      faixa de valor, flag criar_oportunidade_auto).
 *   2. Pra cada config: chama a API (paginada, filtrada por uf + palavra_chave),
 *      por padrão restringindo a data_insercao = hoje (incremental; evita puxar
 *      todo o backlog aberto). Body { full: true } ignora o filtro de data.
 *   3. Dedup por (empresa_id, id_licitacao). Grava as novas em licitacao_encontrada.
 *   4. Se criar_oportunidade_auto e o valor cai na faixa [valor_minimo, valor_maximo],
 *      cria Oportunidade e marca a licitação como "Convertida".
 *   5. Notifica gestores no sino.
 *
 * Token: header "Token" (secret ALERTA_LICITACAO_TOKEN). Regra da API: NUNCA
 * varrer sem filtro (uf + palavra_chave sempre presentes), senão bloqueia o token.
 * Janela de manutenção da API: 05:50-06:10 UTC (o cron roda fora disso).
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail } from "../_shared/cors.ts";
import { filtrarConteudoDuplicado } from "../_shared/licitacoes-dedup.ts";
import { resolverStatusOportunidade } from "../_shared/oportunidade-status.ts";

const API_BASE = "https://alertalicitacao.com.br/api/v1/licitacoesAbertas/";
const TOKEN = Deno.env.get("ALERTA_LICITACAO_TOKEN") ?? "";
const MAX_PAGINAS = 50; // teto de segurança (100/página = até 5000/UF-config)

interface ApiLicitacao {
  id_licitacao: string;
  titulo?: string;
  municipio_IBGE?: string;
  uf?: string;
  orgao?: string;
  abertura_datetime?: string;
  objeto?: string;
  link?: string;
  linkExterno?: string;
  municipio?: string;
  abertura?: string;
  aberturaComHora?: string;
  id_tipo?: string;
  tipo?: string;
  valor?: string;
  id_portal?: string;
}

/** "117900" -> 117900 ; "117.900,00" -> 117900 ; "117900,00" -> 117900 */
function parseValor(v?: string): number | null {
  if (v == null) return null;
  let s = String(v)
    .trim()
    .replace(/[^0-9.,]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** "30/12/2019" -> "2019-12-30" ; "2026-07-22 09:00:00" -> "2026-07-22" */
function parseAberturaDate(s?: string): string | null {
  if (!s) return null;
  const br = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

async function fetchAll(params: {
  uf: string;
  palavra_chave: string;
  modalidade: string;
  data_insercao?: string;
}): Promise<ApiLicitacao[]> {
  const out: ApiLicitacao[] = [];
  let pagina = 1;
  while (pagina <= MAX_PAGINAS) {
    const url = new URL(API_BASE);
    url.searchParams.set("uf", params.uf);
    if (params.palavra_chave) url.searchParams.set("palavra_chave", params.palavra_chave);
    if (params.modalidade) url.searchParams.set("modalidade", params.modalidade);
    if (params.data_insercao) url.searchParams.set("data_insercao", params.data_insercao);
    url.searchParams.set("licitacoesPorPagina", "100");
    url.searchParams.set("pagina", String(pagina));

    const resp = await fetch(url.toString(), { headers: { Token: TOKEN } });
    if (!resp.ok) throw new Error(`API HTTP ${resp.status}`);
    const data = await resp.json();
    if (Number(data.totalErros) > 0) {
      throw new Error("API erros: " + JSON.stringify(data.erros));
    }
    const arr: ApiLicitacao[] = data.licitacoes || [];
    out.push(...arr);
    const paginas = parseInt(data.paginas, 10) || 1;
    if (pagina >= paginas || arr.length === 0) break;
    pagina++;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (!TOKEN) return fail("ALERTA_LICITACAO_TOKEN não configurado", 500);

  let body: { full?: boolean; data_insercao?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* sem body é ok (cron) */
  }

  const supabase = createAdminClient();

  const { data: buscas, error: bErr } = await supabase
    .from("licitacao_busca")
    .select("*")
    .eq("ativo", true)
    .is("deleted_at", null);
  if (bErr) return fail("Erro lendo configs: " + bErr.message, 500);

  // "hoje" em America/Sao_Paulo (UTC-3, sem DST atualmente)
  const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const dataInsercao = body.full ? undefined : body.data_insercao || hojeBRT;

  const resumo: unknown[] = [];

  for (const busca of buscas || []) {
    try {
      const ufs: string[] = Array.isArray(busca.ufs) ? busca.ufs : [];
      if (ufs.length === 0) {
        resumo.push({ busca_id: busca.id, skip: "sem UFs" });
        continue;
      }
      const modalidades: number[] = Array.isArray(busca.modalidades) ? busca.modalidades : [];

      const fetched = await fetchAll({
        uf: ufs.join(","),
        palavra_chave: busca.palavras_chave || "",
        modalidade: modalidades.length ? modalidades.join(",") : "",
        data_insercao: dataInsercao,
      });

      // dedup dentro do lote
      const byId = new Map<string, ApiLicitacao>();
      for (const l of fetched) if (l.id_licitacao) byId.set(l.id_licitacao, l);
      const ids = [...byId.keys()];

      let inseridas: Array<Record<string, unknown>> = [];
      if (ids.length > 0) {
        // quais já existem?
        const { data: existentes } = await supabase
          .from("licitacao_encontrada")
          .select("id_licitacao")
          .eq("empresa_id", busca.empresa_id)
          .in("id_licitacao", ids);
        const existSet = new Set((existentes || []).map((e) => e.id_licitacao));

        let rows = ids
          .filter((id) => !existSet.has(id))
          .map((id) => byId.get(id)!)
          .map((l) => ({
            empresa_id: busca.empresa_id,
            busca_id: busca.id,
            id_licitacao: l.id_licitacao,
            titulo: l.titulo ?? null,
            orgao: l.orgao ?? null,
            uf: l.uf ?? null,
            municipio: l.municipio ?? null,
            municipio_ibge: l.municipio_IBGE ?? null,
            objeto: l.objeto ?? null,
            valor: parseValor(l.valor),
            tipo: l.tipo ?? null,
            id_tipo: l.id_tipo ?? null,
            id_portal: l.id_portal ?? null,
            abertura_datetime: l.abertura_datetime ?? null,
            abertura: parseAberturaDate(l.abertura || l.abertura_datetime),
            link: l.link ?? null,
            link_externo: l.linkExterno ?? null,
            status: "Nova",
          }))
          // só de hoje pra frente: descarta as com abertura já passada (mantém sem data)
          .filter((r) => !r.abertura || (r.abertura as string) >= hojeBRT);

        // Cross-source: não re-inserir como "Nova" algo já Excluído/Convertido
        // (mesmo vindo da outra fonte com id_licitacao diferente).
        rows = await filtrarConteudoDuplicado(supabase, busca.empresa_id, rows);

        if (rows.length > 0) {
          const { data: ins, error: insErr } = await supabase
            .from("licitacao_encontrada")
            .upsert(rows, { onConflict: "empresa_id,id_licitacao", ignoreDuplicates: true })
            .select(
              "id, titulo, objeto, valor, abertura, tipo, link_externo, uf, municipio, orgao"
            );
          if (insErr) throw new Error("insert: " + insErr.message);
          inseridas = ins || [];
        }
      }

      // auto-criar oportunidade pelas que passam no filtro de valor
      let criadas = 0;
      if (busca.criar_oportunidade_auto && inseridas.length > 0) {
        const vmin = Number(busca.valor_minimo ?? 0);
        const vmax = busca.valor_maximo != null ? Number(busca.valor_maximo) : null;
        // Resolve o status_id uma vez (Kanban agrupa por status_id; sem ele a
        // oportunidade auto-criada some do funil).
        const { status_id: statusId, status_nome: statusNomeOk } = await resolverStatusOportunidade(
          supabase,
          busca.empresa_id,
          busca.status_oportunidade_nome || "Triagem Licitação"
        );
        for (const li of inseridas) {
          const val = li.valor != null ? Number(li.valor) : null;
          if (val == null || val < vmin) continue;
          if (vmax != null && val > vmax) continue;

          const { data: op, error: opErr } = await supabase
            .from("oportunidade")
            .insert({
              empresa_id: busca.empresa_id,
              nome: String(li.titulo || li.objeto || "Licitação").slice(0, 200),
              valor_estimado: val,
              descricao: li.objeto ?? null,
              origem_nome: "Licitação (Alerta Licitação)",
              status_id: statusId,
              status_nome: statusNomeOk ?? busca.status_oportunidade_nome ?? "Triagem Licitação",
              data_fechamento_prevista: li.abertura ?? null,
              licitacao_modalidade: li.tipo ?? null,
              licitacao_data: li.abertura ?? null,
              observacoes: li.link_externo ?? null,
            })
            .select("id")
            .single();

          if (!opErr && op) {
            await supabase
              .from("licitacao_encontrada")
              .update({ status: "Convertida", oportunidade_id: op.id })
              .eq("id", li.id);
            criadas++;
          }
        }
      }

      // notificar gestores
      if (inseridas.length > 0) {
        try {
          await supabase.rpc("notificar_gestores", {
            p_empresa_id: busca.empresa_id,
            p_perfis: ["Admin Holding", "Admin", "Gestor"],
            p_titulo: "Novas licitações encontradas",
            p_mensagem:
              `${inseridas.length} nova(s) licitação(ões)` +
              (criadas ? `, ${criadas} viraram oportunidade.` : "."),
            p_link: "/Oportunidades",
            p_tipo: "Sistema",
            p_prioridade: "Normal",
            p_dedup_key: `licitacoes:${busca.empresa_id}:${hojeBRT}`,
          });
        } catch (_) {
          /* notificação é best-effort */
        }
      }

      await supabase
        .from("licitacao_busca")
        .update({
          ultima_execucao: new Date().toISOString(),
          ultima_qtd_novas: inseridas.length,
        })
        .eq("id", busca.id);

      resumo.push({
        busca_id: busca.id,
        empresa_id: busca.empresa_id,
        retornadas: fetched.length,
        novas: inseridas.length,
        oportunidades_criadas: criadas,
      });
    } catch (e) {
      resumo.push({ busca_id: busca.id, erro: String((e as Error)?.message || e) });
    }
  }

  return ok({ data_insercao: dataInsercao ?? "full", resumo });
});
