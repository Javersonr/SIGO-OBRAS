/**
 * portal-fornecedor-cotacao — carrega UMA cotação pelo token de acesso (magic
 * link) da participação, enriquecendo os itens com o código do material.
 *
 * Porte fiel da função legada Base44 `carregarCotacaoFornecedor` para o
 * Supabase (service role). O credential aqui é o `token` único da
 * `cotacao_fornecedor` (capacidade por link) — não o portal_token de login.
 *
 * Entrada:  { token, marcar_visualizada? }
 * Resposta: { success, cotacaoFornecedor, cotacao, itens, empresa, respostas }
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail } from "../_shared/cors.ts";

const normalize = (s: string) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") return fail("Método não permitido", 405);

  let body: { token?: string; marcar_visualizada?: boolean };
  try {
    body = await req.json();
  } catch {
    return fail("Payload inválido", 400);
  }

  const token = body.token;
  if (!token) return fail("Token obrigatório", 400);

  const supabase = createAdminClient();

  const { data: cotFornecedor } = await supabase
    .from("cotacao_fornecedor")
    .select("*")
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!cotFornecedor) return fail("Cotação não encontrada", 404);

  // Marca como visualizada se pedido e ainda estava "Enviada"
  if (body.marcar_visualizada && cotFornecedor.status === "Enviada") {
    await supabase
      .from("cotacao_fornecedor")
      .update({ status: "Visualizada", data_visualizacao: new Date().toISOString() })
      .eq("id", cotFornecedor.id);
    cotFornecedor.status = "Visualizada";
  }

  const [cotRes, itensRes, empresaRes, respostasRes] = await Promise.all([
    supabase.from("cotacao").select("*").eq("id", cotFornecedor.cotacao_id).maybeSingle(),
    supabase.from("cotacao_item").select("*").eq("cotacao_id", cotFornecedor.cotacao_id),
    supabase
      .from("empresa")
      .select("id, nome, nome_fantasia, razao_social, logo_url")
      .eq("id", cotFornecedor.empresa_id)
      .maybeSingle(),
    supabase.from("cotacao_resposta").select("*").eq("cotacao_fornecedor_id", cotFornecedor.id),
  ]);

  const cotacao = cotRes.data;
  const itens = itensRes.data ?? [];

  // Enriquecimento de código: SolicitacaoCompraItem + OrcamentoItem (por descrição) + Material
  const solicitacaoId = cotacao?.solicitacao_id;
  const projetoId = cotacao?.projeto_id;

  const [solItemsRes, orcItemsRes] = await Promise.all([
    solicitacaoId
      ? supabase.from("solicitacao_compra_item").select("*").eq("solicitacao_id", solicitacaoId)
      : Promise.resolve({ data: [] as unknown[] }),
    projetoId
      ? supabase.from("orcamento_item").select("id, descricao, codigo").eq("projeto_id", projetoId)
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
  const itensEnriquecidos = itens.map((item: any) => {
    if (item.material_codigo) return { ...item, codigo: item.material_codigo };
    const solItem = solItemMap[item.solicitacao_item_id];
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

  return ok({
    cotacaoFornecedor: cotFornecedor,
    cotacao: cotacao ?? null,
    itens: itensEnriquecidos,
    empresa: empresaRes.data ?? null,
    respostas: respostasRes.data ?? [],
  });
});
