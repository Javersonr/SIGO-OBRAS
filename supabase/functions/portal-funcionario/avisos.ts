/**
 * Avisos do portal ao RH (T24): o aluno gastou a última tentativa da prova e não passou.
 *
 * O aviso é uma notificação no sino dos gestores da empresa, pelo MESMO canal do resumo diário de
 * vencimentos (`alertar_treinamentos_ead`, migração 0138): `notificar_gestores` (0036). Pela 0110 essa
 * função só é executável pelo `service_role`, que é o cliente desta Edge Function (`createAdminClient`),
 * e já deduplica por `dedup_key`. Aqui ficam as regras, sem Deno e sem rede (o cliente do banco entra
 * por parâmetro), para serem testadas no Node.
 *
 * O aviso nunca atrapalha o aluno: qualquer falha ao avisar é só registrada no log.
 */

/** Mesmos perfis do resumo diário da 0039 (os donos da empresa entram sempre, dentro da função). */
export const PERFIS_DO_AVISO = ["Admin Holding", "Admin", "Gestor"];
const LINK_DO_AVISO = "/SegurancaTrabalho";
// `notificacao.tipo` não tem 'RH' nem 'SST' (CHECK da 0111): o SST usa 'Sistema', como a 0039
const TIPO_DO_AVISO = "Sistema";
const MAX_NOME = 120;

export type AvisoAoRh = {
  titulo: string;
  mensagem: string;
  link: string;
  tipo: string;
  prioridade: "Baixa" | "Normal" | "Alta" | "Urgente";
  perfis: string[];
  dedupKey: string;
};

/**
 * Reprovou na última tentativa que tinha? `max` é o teto da matrícula (tentativas do curso mais as extras
 * que o RH liberou); `null` = curso sem limite, que nunca esgota. Aprovado nunca esgota.
 */
export function esgotouAsTentativas(p: {
  aprovada: boolean;
  numero: number;
  max: number | null;
}): boolean {
  return !p.aprovada && p.max !== null && p.numero >= p.max;
}

// Uma linha só e de tamanho razoável: o nome vem do cadastro e vai para o sino
function umaLinha(texto: unknown, padrao: string): string {
  const limpo = String(texto ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return limpo ? limpo.slice(0, MAX_NOME) : padrao;
}

/**
 * Texto e chave do aviso. A mensagem diz quem, qual curso e onde liberar; não leva nota, acertos nem
 * nada do gabarito (o reprovado também não os vê, D10). A `dedupKey` leva a matrícula e o número da
 * tentativa que esgotou: depois de o RH liberar uma extra e o aluno esgotar de novo, o número é outro e o
 * RH é avisado outra vez; a mesma tentativa nunca avisa duas vezes.
 */
export function avisoDeTentativasEsgotadas(p: {
  matriculaId: string;
  numero: number;
  max: number | null;
  funcionarioNome?: unknown;
  cursoNome?: unknown;
}): AvisoAoRh {
  const quem = umaLinha(p.funcionarioNome, "Um aluno");
  const curso = umaLinha(p.cursoNome, "um curso do portal");
  const usou = p.max ?? p.numero;
  return {
    titulo: "Aluno esgotou as tentativas da prova",
    mensagem:
      `${quem} usou todas as ${usou} tentativas da prova de "${curso}" e não foi aprovado. ` +
      "Para liberar mais uma: RH e Segurança, aba Treinamentos, Detalhes da matrícula, Liberar tentativa.",
    link: LINK_DO_AVISO,
    tipo: TIPO_DO_AVISO,
    prioridade: "Alta",
    perfis: PERFIS_DO_AVISO,
    dedupKey: `ead_tentativas:${p.matriculaId}:${p.numero}`,
  };
}

/** O que a função precisa do cliente do banco (o `supabase-js` com a service role satisfaz). */
export type ClienteRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
};

/**
 * Manda o aviso aos gestores da empresa DA SESSÃO (`empresaId` nunca vem do corpo da requisição).
 * Devolve se o banco aceitou; erro do banco ou falha de rede viram log e `false`, nunca exceção.
 */
export async function avisarGestores(
  banco: ClienteRpc,
  empresaId: string,
  aviso: AvisoAoRh
): Promise<boolean> {
  try {
    const { error } = await banco.rpc("notificar_gestores", {
      p_empresa_id: empresaId,
      p_perfis: aviso.perfis,
      p_titulo: aviso.titulo,
      p_mensagem: aviso.mensagem,
      p_link: aviso.link,
      p_tipo: aviso.tipo,
      p_prioridade: aviso.prioridade,
      p_dedup_key: aviso.dedupKey,
    });
    if (error) {
      console.error(
        "[portal-funcionario] aviso ao RH:",
        String((error as { message?: unknown }).message ?? error)
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error("[portal-funcionario] aviso ao RH:", String((e as Error)?.message ?? e));
    return false;
  }
}
