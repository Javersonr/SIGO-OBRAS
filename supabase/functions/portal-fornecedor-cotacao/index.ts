/**
 * portal-fornecedor-cotacao — carrega UMA cotação pelo token de acesso (magic
 * link) da participação, enriquecendo os itens com o código do material.
 *
 * Porte fiel da função legada Base44 `carregarCotacaoFornecedor` para o
 * Supabase (service role). O credential aqui é o `token` único da
 * `cotacao_fornecedor` (capacidade por link) — não o portal_token de login.
 * Formato/validação do token: _shared/cotacao-portal.ts.
 *
 * Service role enxerga tudo: a resposta leva SÓ colunas listadas abaixo — nada
 * de select("*") (a cotação tem fornecedor_vencedor_*, valor_aprovado, etc.).
 *
 * Entrada:  { token, marcar_visualizada? }
 * Resposta: { success, cotacaoFornecedor, cotacao, itens, empresa, respostas,
 *             aceita_respostas, motivo_bloqueio }
 *   empresa.logo_url_assinada = URL pronta do logo (o fornecedor não tem
 *   sessão da empresa para assinar a ref); null → mostrar só o nome.
 *   aceita_respostas=false → cotação encerrada ou prazo vencido (motivo_bloqueio).
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { comLogoAssinado } from "../_shared/storage-assinar.ts";
import { motivoCotacaoFechada, participacaoPorToken } from "../_shared/cotacao-portal.ts";

const normalize = (s: string) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");

// O que o fornecedor pode ver (e o front usa)
const COLS_PARTICIPACAO =
  "id, cotacao_id, empresa_id, status, motivo_recusa, fornecedor_nome, data_resposta, data_visualizacao";
const COLS_COTACAO = "numero, projeto_nome, data_limite, observacoes, status";
const COLS_ITEM =
  "id, descricao, material_codigo, quantidade, unidade, especificacoes, solicitacao_item_id";
const COLS_RESPOSTA = "item_id, valor_unitario, valor_total, prazo_entrega_dias, observacoes";

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    let body: { token?: string; marcar_visualizada?: boolean };
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    const supabase = createAdminClient();

    const achou = await participacaoPorToken(supabase, body.token, COLS_PARTICIPACAO);
    if ("erro" in achou) {
      return fail(achou.erro, achou.status, achou.codigo ? { codigo: achou.codigo } : undefined);
    }
    const cotFornecedor = achou.cf;

    const [cotRes, itensRes, empresaRes, respostasRes] = await Promise.all([
      supabase
        .from("cotacao")
        .select(`${COLS_COTACAO}, solicitacao_id, projeto_id`)
        .eq("id", cotFornecedor.cotacao_id)
        .eq("empresa_id", cotFornecedor.empresa_id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("cotacao_item")
        .select(COLS_ITEM)
        .eq("cotacao_id", cotFornecedor.cotacao_id)
        .is("deleted_at", null),
      supabase
        .from("empresa")
        .select("id, nome, nome_fantasia, razao_social, logo_url")
        .eq("id", cotFornecedor.empresa_id)
        .maybeSingle(),
      supabase
        .from("cotacao_resposta")
        .select(COLS_RESPOSTA)
        .eq("cotacao_fornecedor_id", cotFornecedor.id)
        .is("deleted_at", null),
    ]);

    // cotação apagada pela empresa = link morto
    if (!cotRes.data) return fail("Cotação não encontrada", 404);
    const { solicitacao_id: solicitacaoId, projeto_id: projetoId, ...cotacao } = cotRes.data;
    const itens = itensRes.data ?? [];

    // Marca como visualizada se pedido e ainda estava "Enviada"
    if (body.marcar_visualizada && cotFornecedor.status === "Enviada") {
      const agora = new Date().toISOString();
      await supabase
        .from("cotacao_fornecedor")
        .update({ status: "Visualizada", data_visualizacao: agora })
        .eq("id", cotFornecedor.id);
      cotFornecedor.status = "Visualizada";
      cotFornecedor.data_visualizacao = agora;
    }

    // Enriquecimento de código: SolicitacaoCompraItem + OrcamentoItem (por descrição) + Material
    const [solItemsRes, orcItemsRes] = await Promise.all([
      solicitacaoId
        ? supabase
            .from("solicitacao_compra_item")
            .select("id, material_id, material_codigo")
            .eq("solicitacao_id", solicitacaoId)
        : Promise.resolve({ data: [] as unknown[] }),
      projetoId
        ? supabase
            .from("orcamento_item")
            .select("id, descricao, codigo")
            .eq("projeto_id", projetoId)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    // deno-lint-ignore no-explicit-any
    const solItemMap: Record<string, any> = {};
    // deno-lint-ignore no-explicit-any
    (solItemsRes.data ?? []).forEach((si: any) => {
      solItemMap[si.id] = si;
    });

    const orcamentoItemMap: Record<string, string> = {};
    // deno-lint-ignore no-explicit-any
    (orcItemsRes.data ?? []).forEach((oi: any) => {
      if (oi.codigo) orcamentoItemMap[normalize(oi.descricao)] = oi.codigo;
    });

    // Materiais referenciados por solicitacao_compra_item sem material_codigo
    const materialIds = [
      ...new Set(
        Object.values(solItemMap)
          // deno-lint-ignore no-explicit-any
          .filter((si: any) => si.material_id && !si.material_codigo)
          // deno-lint-ignore no-explicit-any
          .map((si: any) => si.material_id)
      ),
    ];
    // deno-lint-ignore no-explicit-any
    const materialMap: Record<string, any> = {};
    if (materialIds.length > 0) {
      const { data: mats } = await supabase
        .from("material")
        .select("id, codigo")
        .in("id", materialIds as string[]);
      // deno-lint-ignore no-explicit-any
      (mats ?? []).forEach((m: any) => {
        materialMap[m.id] = m;
      });
    }

    // deno-lint-ignore no-explicit-any
    const itensEnriquecidos = itens.map(({ solicitacao_item_id, ...item }: any) => {
      if (item.material_codigo) return { ...item, codigo: item.material_codigo };
      const solItem = solItemMap[solicitacao_item_id];
      if (solItem) {
        if (solItem.material_codigo) return { ...item, codigo: solItem.material_codigo };
        if (solItem.material_id && materialMap[solItem.material_id]?.codigo) {
          return { ...item, codigo: materialMap[solItem.material_id].codigo };
        }
      }
      const codigoOrc = orcamentoItemMap[normalize(item.descricao)];
      if (codigoOrc) return { ...item, codigo: codigoOrc };
      return item;
    });

    const motivoBloqueio = motivoCotacaoFechada(cotacao);
    const { id: _id, cotacao_id: _c, empresa_id: _e, ...participacao } = cotFornecedor;

    return ok({
      cotacaoFornecedor: participacao,
      cotacao,
      itens: itensEnriquecidos,
      empresa: await comLogoAssinado(supabase, empresaRes.data ?? null),
      respostas: respostasRes.data ?? [],
      aceita_respostas: motivoBloqueio === null,
      motivo_bloqueio: motivoBloqueio,
    });
  })
);
