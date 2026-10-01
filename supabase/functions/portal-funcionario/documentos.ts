/** Arquivos que o RH enviou explicitamente ao portal deste funcionário. */
export function documentosPublicados(valor: unknown, funcionarioId: string) {
  let itens = valor;
  if (typeof itens === "string") {
    try {
      itens = JSON.parse(itens);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(itens)) return [];
  return itens
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        item.origem === "portal_funcionario" &&
        item.funcionario_id === funcionarioId &&
        item.publicado === true &&
        ["documentacao", "contracheque", "folha_ponto"].includes(item.tipo) &&
        typeof item.id === "string" &&
        typeof item.url === "string"
    )
    .map((item) => ({
      id: item.id,
      tipo: item.tipo,
      nome: typeof item.nome_arquivo === "string" ? item.nome_arquivo : "Documento PDF",
      competencia: typeof item.competencia === "string" ? item.competencia : null,
      data_upload: typeof item.data_upload === "string" ? item.data_upload : null,
      ref: item.url,
    }));
}

/** Service role: os dois filtros são obrigatórios em cada consulta. */
// deno-lint-ignore no-explicit-any
export async function carregarDocumentos(
  supabase: any,
  funcionarioId: string,
  empresaId: string,
  assinar: (refs: string[], empresaId: string) => Promise<Map<string, string>>
) {
  const [func, advs] = await Promise.all([
    supabase
      .from("funcionario")
      .select("documentos_rh_anexos")
      .eq("id", funcionarioId)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("funcionario_advertencia")
      .select("id, data, tipo, motivo, anexo_ref")
      .eq("funcionario_id", funcionarioId)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .order("data", { ascending: false }),
  ]);
  if (func.error || advs.error || !func.data)
    throw new Error("Não foi possível carregar seus documentos");
  const docs = documentosPublicados(func.data.documentos_rh_anexos, funcionarioId);
  const advertencias = advs.data ?? [];
  const assinadas = await assinar(
    [
      ...docs.map((d) => d.ref),
      ...advertencias.map((a: { anexo_ref: string }) => a.anexo_ref).filter(Boolean),
    ],
    empresaId
  );
  return {
    documentos: docs.map(({ ref, ...doc }) => ({ ...doc, url: assinadas.get(ref) ?? null })),
    advertencias: advertencias.map(
      (a: { id: string; data: string; tipo: string; motivo: string; anexo_ref: string }) => ({
        id: a.id,
        data: a.data,
        tipo: a.tipo,
        motivo: a.motivo,
        url: assinadas.get(a.anexo_ref) ?? null,
      })
    ),
  };
}

export function funcionarioPodeEntrar(
  func: { ativo?: boolean; deleted_at?: string | null } | null
) {
  return !!func && func.ativo !== false && !func.deleted_at;
}
