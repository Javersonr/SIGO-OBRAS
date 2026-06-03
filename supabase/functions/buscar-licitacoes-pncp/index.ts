/**
 * buscar-licitacoes-pncp — 2ª fonte de licitações: PNCP (Portal Nacional de
 * Contratações Públicas, oficial — Lei 14.133/2021). Alimenta a MESMA tabela
 * licitacao_encontrada que o buscar-licitacoes (Alerta), com fonte = 'PNCP'.
 *
 * Diferença chave do Alerta: a API do PNCP NÃO filtra por palavra-chave. Então
 * baixamos as contratações publicadas (por UF + modalidade + data) e filtramos
 * as palavras-chave AQUI, com a mesma sintaxe da config (vírgula = OU,
 * "aspas" = frase, -palavra = excluir).
 *
 * Endpoint: GET /api/consulta/v1/contratacoes/publicacao
 *   ?dataInicial=YYYYMMDD&dataFinal=YYYYMMDD&codigoModalidadeContratacao=N
 *   &uf=MG&pagina=1&tamanhoPagina=50
 *
 * Body opcional: { full?: bool, data?: "YYYY-MM-DD", dias?: N }
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail } from "../_shared/cors.ts";
import { parseKeywords, matchKeywords } from "../_shared/keywords.ts";

// publicacao = por data de publicação (incremental, cron diário)
// proposta   = com período de recebimento de proposta EM ABERTO (botão "Buscar agora")
const API_PUBLICACAO = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
const API_PROPOSTA = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta";
const TAM_PAGINA = 50;
const MAX_PAGINAS = 12; // incremental — teto por (uf, modalidade)
const MAX_PAGINAS_ABERTO = 20; // varredura "todas em aberto" — teto maior

// Modalidades mais relevantes p/ obras/engenharia/serviços (código → nome)
const MODALIDADES: Record<number, string> = {
  6: "Pregão Eletrônico",
  4: "Concorrência Eletrônica",
  8: "Dispensa",
  12: "Credenciamento",
};

interface PncpItem {
  orgaoEntidade?: { cnpj?: string; razaoSocial?: string };
  unidadeOrgao?: {
    ufSigla?: string;
    municipioNome?: string;
    codigoIbge?: string;
    nomeUnidade?: string;
  };
  anoCompra?: number;
  sequencialCompra?: number;
  numeroCompra?: string;
  objetoCompra?: string;
  valorTotalEstimado?: number;
  dataAberturaProposta?: string;
  linkSistemaOrigem?: string;
}

/** "2026-06-17T09:00:00" -> "2026-06-17" */
function dateOnly(s?: string): string | null {
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Headers de navegador — portais .gov.br costumam bloquear requisições sem
// User-Agent (retornam página HTML de bloqueio em vez do JSON).
const PNCP_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Referer: "https://pncp.gov.br/app/editais",
};

async function fetchPncp(params: {
  uf: string;
  modalidade: number;
  modo: "publicacao" | "proposta";
  dataInicial?: string;
  dataFinal: string;
}): Promise<PncpItem[]> {
  const out: PncpItem[] = [];
  const base = params.modo === "proposta" ? API_PROPOSTA : API_PUBLICACAO;
  const teto = params.modo === "proposta" ? MAX_PAGINAS_ABERTO : MAX_PAGINAS;
  let pagina = 1;
  while (pagina <= teto) {
    const url = new URL(base);
    // publicacao usa janela [dataInicial, dataFinal]; proposta usa só dataFinal (horizonte)
    if (params.modo === "publicacao" && params.dataInicial) {
      url.searchParams.set("dataInicial", params.dataInicial);
    }
    url.searchParams.set("dataFinal", params.dataFinal);
    url.searchParams.set("codigoModalidadeContratacao", String(params.modalidade));
    url.searchParams.set("uf", params.uf);
    url.searchParams.set("pagina", String(pagina));
    url.searchParams.set("tamanhoPagina", String(TAM_PAGINA));

    const resp = await fetch(url.toString(), { headers: PNCP_HEADERS });
    if (resp.status === 204) break; // sem conteúdo
    // 400/422 = sem resultados pra combinação (não é erro fatal)
    if (resp.status === 400 || resp.status === 422) break;
    if (!resp.ok) throw new Error(`PNCP HTTP ${resp.status}`);

    // Defesa: se vier HTML (bloqueio/WAF) em vez de JSON, não exploda — para a paginação.
    const text = await resp.text();
    const trimmed = text.trimStart();
    if (!trimmed || trimmed.startsWith("<")) break;
    let json: { data?: PncpItem[]; totalPaginas?: number };
    try {
      json = JSON.parse(text);
    } catch {
      break; // resposta não-JSON inesperada — segue p/ próxima combinação
    }
    const arr: PncpItem[] = json?.data || [];
    out.push(...arr);
    const totalPaginas = Number(json?.totalPaginas) || 1;
    if (pagina >= totalPaginas || arr.length === 0) break;
    pagina++;
  }
  return out;
}

/** YYYYMMDD a partir de uma Date */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflightResponse();

  let body: { full?: boolean; aberto?: boolean; data?: string; dias?: number } = {};
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

  // Modo:
  //  - incremental (publicacao): só as publicadas hoje BRT (cron diário). body.dias amplia.
  //  - aberto (proposta): TODAS com proposta em aberto até hoje+90d (botão "Buscar agora").
  const aberto = Boolean(body.aberto || body.full);
  const modo: "publicacao" | "proposta" = aberto ? "proposta" : "publicacao";
  const agoraBRT = new Date(Date.now() - 3 * 3600 * 1000);
  const dias = Math.max(0, Math.min(Number(body.dias) || 0, 30));
  const ini = new Date(agoraBRT);
  ini.setUTCDate(ini.getUTCDate() - dias);
  const horizonte = new Date(agoraBRT);
  horizonte.setUTCDate(horizonte.getUTCDate() + 90); // proposta: até 90 dias à frente
  const dataInicial = body.data ? body.data.replace(/-/g, "") : ymd(ini);
  const dataFinal = aberto
    ? ymd(horizonte)
    : body.data
      ? body.data.replace(/-/g, "")
      : ymd(agoraBRT);

  const resumo: unknown[] = [];

  for (const busca of buscas || []) {
    try {
      const ufs: string[] = Array.isArray(busca.ufs) ? busca.ufs : [];
      if (ufs.length === 0) {
        resumo.push({ busca_id: busca.id, skip: "sem UFs" });
        continue;
      }
      const kw = parseKeywords(busca.palavras_chave || "");

      // coleta UF × modalidade
      const brutos: Array<{ item: PncpItem; modalidadeNome: string }> = [];
      for (const uf of ufs) {
        for (const [codStr, modNome] of Object.entries(MODALIDADES)) {
          const itens = await fetchPncp({
            uf,
            modalidade: Number(codStr),
            modo,
            dataInicial,
            dataFinal,
          });
          for (const item of itens) brutos.push({ item, modalidadeNome: modNome });
        }
      }

      // filtra por palavra-chave (objeto + órgão)
      const filtrados = brutos.filter(({ item }) =>
        matchKeywords(`${item.objetoCompra || ""} ${item.orgaoEntidade?.razaoSocial || ""}`, kw)
      );

      // monta linhas + id estável
      const byId = new Map<string, Record<string, unknown>>();
      for (const { item, modalidadeNome } of filtrados) {
        const cnpj = item.orgaoEntidade?.cnpj || "x";
        const ano = item.anoCompra || 0;
        const seq = item.sequencialCompra || 0;
        const idLic = `PNCP-${cnpj}-${ano}-${seq}`;
        if (byId.has(idLic)) continue;
        const abertura = dateOnly(item.dataAberturaProposta);
        byId.set(idLic, {
          empresa_id: busca.empresa_id,
          busca_id: busca.id,
          id_licitacao: idLic,
          titulo: `${modalidadeNome} ${item.numeroCompra || ""}/${ano}`.trim(),
          orgao:
            [item.orgaoEntidade?.razaoSocial, item.unidadeOrgao?.nomeUnidade]
              .filter(Boolean)
              .join(" — ") || null,
          uf: item.unidadeOrgao?.ufSigla ?? null,
          municipio: item.unidadeOrgao?.municipioNome ?? null,
          municipio_ibge: item.unidadeOrgao?.codigoIbge ?? null,
          objeto: item.objetoCompra ?? null,
          valor: item.valorTotalEstimado != null ? Number(item.valorTotalEstimado) : null,
          tipo: modalidadeNome,
          abertura_datetime: item.dataAberturaProposta ?? null,
          abertura,
          link: `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`,
          link_externo: item.linkSistemaOrigem ?? null,
          status: "Nova",
          fonte: "PNCP",
        });
      }
      const ids = [...byId.keys()];

      let inseridas = 0;
      if (ids.length > 0) {
        const { data: existentes } = await supabase
          .from("licitacao_encontrada")
          .select("id_licitacao")
          .eq("empresa_id", busca.empresa_id)
          .in("id_licitacao", ids);
        const existSet = new Set((existentes || []).map((e) => e.id_licitacao));
        const rows = ids.filter((id) => !existSet.has(id)).map((id) => byId.get(id)!);

        if (rows.length > 0) {
          const { data: ins, error: insErr } = await supabase
            .from("licitacao_encontrada")
            .upsert(rows, { onConflict: "empresa_id,id_licitacao", ignoreDuplicates: true })
            .select("id");
          if (insErr) throw new Error("insert: " + insErr.message);
          inseridas = (ins || []).length;
        }
      }

      if (inseridas > 0) {
        try {
          await supabase.rpc("notificar_gestores", {
            p_empresa_id: busca.empresa_id,
            p_perfis: ["Admin Holding", "Admin", "Gestor"],
            p_titulo: "Novas licitações (PNCP)",
            p_mensagem: `${inseridas} nova(s) licitação(ões) do PNCP entraram na lista.`,
            p_link: "/Oportunidades",
            p_tipo: "Sistema",
            p_prioridade: "Normal",
            p_dedup_key: `licitacoes-pncp:${busca.empresa_id}:${dataFinal}`,
          });
        } catch (_) {
          /* best-effort */
        }
      }

      resumo.push({
        busca_id: busca.id,
        empresa_id: busca.empresa_id,
        baixadas: brutos.length,
        casaram_keyword: filtrados.length,
        novas: inseridas,
      });
    } catch (e) {
      resumo.push({ busca_id: busca.id, erro: String((e as Error)?.message || e) });
    }
  }

  return ok({ fonte: "PNCP", modo, periodo: { dataInicial, dataFinal }, resumo });
});
