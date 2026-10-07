/**
 * Ciência de entrega (EPI, ferramenta, documento) dada pelo funcionário no portal.
 *
 * Só o servidor confirma: o trigger `ciencia_so_servidor` (migração 0134) impede a empresa de
 * gravar `status`, `confirmada_em` e `evidencia` pela API. Aqui fica a regra da confirmação, sem
 * Deno e sem rede (o cliente do banco entra por parâmetro), para ser testada no Node.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deixa nos logs da função a causa de um erro do banco (a resposta ao aluno é só "Erro ao registrar
 * ciência"). Vai a etapa, o código e a mensagem do banco; nunca a evidência (IP, dispositivo, usuário).
 */
function registrarErro(etapa: "leitura" | "confirmação", erro: unknown) {
  const e = erro as { message?: unknown; code?: unknown } | null;
  console.error(
    "[portal-funcionario] ciência:",
    etapa,
    "falhou:",
    e?.code ? `[${String(e.code)}]` : "",
    String(e?.message ?? erro)
  );
}

export type ResultadoCiencia =
  | { resultado: "confirmada" }
  | { resultado: "ja_confirmada" }
  | { resultado: "nao_encontrada" }
  | { resultado: "erro" };

export type PedidoCiencia = {
  cienciaId: string;
  /** Da sessão do portal (nunca do corpo da requisição). */
  funcionarioId: string;
  /** Da sessão do portal (nunca do corpo da requisição). */
  empresaId: string;
  /** Quem, quando e de onde; `confirmado_em` vira a data da confirmação. */
  evidencia: { confirmado_em: string; [campo: string]: unknown };
};

/**
 * Confirma a ciência. Service role ignora a RLS: toda consulta leva empresa e funcionário da
 * sessão. O UPDATE exige `status = 'pendente'` e devolve as linhas atingidas, então uma 2ª aba
 * (ou um duplo clique) que chega depois não sobrescreve a evidência da 1ª: não atualiza nada e
 * a resposta é "já confirmada".
 */
// deno-lint-ignore no-explicit-any
export async function confirmarCiencia(supabase: any, p: PedidoCiencia): Promise<ResultadoCiencia> {
  // o corpo da requisição é do navegador: o que não é UUID nem chega ao banco (que responderia
  // erro de sintaxe, não "sem linhas"), e a resposta segue sendo "não encontrada"
  if (typeof p.cienciaId !== "string" || !UUID.test(p.cienciaId)) {
    return { resultado: "nao_encontrada" };
  }

  const { data: ciencia, error: erroLeitura } = await supabase
    .from("entrega_ciencia")
    .select("id, status")
    .eq("id", p.cienciaId)
    .eq("funcionario_id", p.funcionarioId)
    .eq("empresa_id", p.empresaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (erroLeitura) {
    registrarErro("leitura", erroLeitura);
    return { resultado: "erro" };
  }
  if (!ciencia) return { resultado: "nao_encontrada" };
  if (ciencia.status === "confirmada") return { resultado: "ja_confirmada" };

  const { data: atualizadas, error } = await supabase
    .from("entrega_ciencia")
    .update({
      status: "confirmada",
      confirmada_em: p.evidencia.confirmado_em,
      evidencia: p.evidencia,
    })
    .eq("id", ciencia.id)
    .eq("funcionario_id", p.funcionarioId)
    .eq("empresa_id", p.empresaId)
    .eq("status", "pendente")
    .is("deleted_at", null)
    .select("id");
  if (error) {
    registrarErro("confirmação", error);
    return { resultado: "erro" };
  }
  if (!Array.isArray(atualizadas) || atualizadas.length === 0) {
    return { resultado: "ja_confirmada" };
  }
  return { resultado: "confirmada" };
}

/** Quantas ciências CONFIRMADAS o portal recebe no histórico (as mais recentes). */
export const LIMITE_HISTORICO_CIENCIAS = 30;

const COLUNAS_DA_LISTA = "id, tipo, descricao, itens, status, created_at, confirmada_em";

/**
 * Entregas do funcionário para o portal (`dados.ciencias`): TODAS as pendentes, mais as
 * `LIMITE_HISTORICO_CIENCIAS` confirmadas mais recentes. Antes um `.limit(30)` valia para as duas juntas,
 * ordenadas por criação: com mais de 30 entregas, a pendente mais antiga saía da lista e o aluno nunca a
 * via nem a confirmava. Pendente é pedido de ação do aluno e não pode ser cortada (o PostgREST ainda aplica
 * o teto de linhas do projeto, 1000 por padrão, longe de qualquer uso real); só o histórico tem limite.
 * A lista sai com as pendentes primeiro; dentro de cada grupo, da mais nova para a mais antiga. Se uma das
 * duas leituras falha, não devolve a outra metade: `{ ok: false }` (o chamador responde 503) e a causa vai
 * para o log. Service role ignora a RLS: as duas consultas levam empresa e funcionário da sessão.
 */
export async function listarCienciasDoAluno(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  p: { funcionarioId: string; empresaId: string }
  // deno-lint-ignore no-explicit-any
): Promise<{ ok: true; ciencias: any[] } | { ok: false }> {
  const consulta = (status: "pendente" | "confirmada") =>
    supabase
      .from("entrega_ciencia")
      .select(COLUNAS_DA_LISTA)
      .eq("funcionario_id", p.funcionarioId)
      .eq("empresa_id", p.empresaId)
      .eq("status", status)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
  const [pendentes, confirmadas] = await Promise.all([
    consulta("pendente"),
    consulta("confirmada").limit(LIMITE_HISTORICO_CIENCIAS),
  ]);
  const erro = pendentes.error ?? confirmadas.error;
  if (erro) {
    const e = erro as { message?: unknown; code?: unknown };
    console.error(
      "[portal-funcionario] ciências: lista falhou:",
      e?.code ? `[${String(e.code)}]` : "",
      String(e?.message ?? erro)
    );
    return { ok: false };
  }
  return { ok: true, ciencias: [...(pendentes.data ?? []), ...(confirmadas.data ?? [])] };
}
