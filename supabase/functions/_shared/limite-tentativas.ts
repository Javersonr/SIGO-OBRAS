/**
 * limite-tentativas — freio de força bruta nas funções públicas de
 * autenticação (login, portal do fornecedor, recuperação/troca de senha).
 *
 * Contador por janela fixa em public.auth_rate_limit (migração 0112), mexido
 * só pelas RPCs atômicas: a tentativa é CONSUMIDA antes de conferir a senha,
 * então uma rajada paralela não passa do limite. Autenticação certa devolve a
 * tentativa do IP (escritório atrás de um NAT não se tranca) e zera a da conta.
 *
 * Chaves vão para o banco como SHA-256 de "escopo:tipo:valor" — IP e e-mail
 * nunca ficam gravados em claro. Sem imports de URL: roda no Node p/ teste.
 */

export const MSG_MUITAS_TENTATIVAS =
  "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";

export type TipoLimite = "ip" | "conta";

export interface Limite {
  tipo: TipoLimite;
  /** null/vazio = não limita por este tipo (ex.: IP ausente). */
  valor: string | null | undefined;
  max: number;
}

export interface Consumo {
  permitido: boolean;
  chaves: Partial<Record<TipoLimite, string>>;
}

/**
 * IPv4 como veio; IPv6 reduzido ao prefixo /64 (um único cliente costuma ter
 * o /64 inteiro — limitar por endereço deixaria girar entre 2^64 IPs).
 */
export function normalizarIp(bruto: string): string {
  let ip = bruto.trim().toLowerCase();
  if (ip.startsWith("[")) ip = ip.slice(1, ip.indexOf("]") > 0 ? ip.indexOf("]") : undefined);
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (v4) return v4[1];
  if (!ip.includes(":")) return ip;

  ip = ip.split("%")[0];
  const temAbreviacao = ip.includes("::");
  const [esq, dir = ""] = ip.split("::");
  const a = esq ? esq.split(":") : [];
  const b = temAbreviacao && dir ? dir.split(":") : [];
  const zeros = temAbreviacao ? Array(Math.max(8 - a.length - b.length, 0)).fill("0") : [];
  const grupos = [...a, ...zeros, ...b].slice(0, 4).map((g) => g.replace(/^0+(?=.)/, ""));
  return `${grupos.join(":")}::/64`;
}

/**
 * IP do cliente. O gateway do Supabase CONCATENA o X-Forwarded-For que o
 * cliente mandar ("falso, ip-real"), então vale a entrada mais à DIREITA — a
 * primeira é forjável e deixaria girar o limite por requisição.
 */
export function ipDaRequisicao(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const ultimo = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  const bruto = ultimo || req.headers.get("x-real-ip")?.trim() || "";
  return bruto ? normalizarIp(bruto) : null;
}

export async function chaveLimite(
  escopo: string,
  tipo: TipoLimite,
  valor: string
): Promise<string> {
  const texto = `${escopo}:${tipo}:${valor.trim().toLowerCase()}`;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Consome 1 tentativa de cada limite (IP e/ou conta) numa janela de
 * `janelaSeg`. Limitador fora do ar NÃO derruba a autenticação (a conferência
 * da senha segue valendo) — só registra o erro.
 */
export async function consumirTentativa(
  // deno-lint-ignore no-explicit-any
  admin: any,
  escopo: string,
  janelaSeg: number,
  limites: Limite[]
): Promise<Consumo> {
  const ativos = limites.filter((l) => !!l.valor);
  const chaves = await Promise.all(ativos.map((l) => chaveLimite(escopo, l.tipo, l.valor!)));
  const porTipo: Consumo["chaves"] = {};
  ativos.forEach((l, i) => (porTipo[l.tipo] = chaves[i]));
  if (chaves.length === 0) return { permitido: true, chaves: porTipo };

  const { data, error } = await admin.rpc("auth_rate_limit_consumir", {
    p_chaves: chaves,
    p_limites: ativos.map((l) => l.max),
    p_janela_seg: janelaSeg,
  });
  if (error) {
    console.error(`[limite-tentativas] ${escopo}: limitador indisponível:`, error.message);
    return { permitido: true, chaves: porTipo };
  }
  return { permitido: data !== false, chaves: porTipo };
}

/** Autenticação certa: devolve a tentativa do IP e zera a da conta. */
export async function liberarTentativas(
  // deno-lint-ignore no-explicit-any
  admin: any,
  consumo: Consumo
): Promise<void> {
  const { ip, conta } = consumo.chaves;
  if (!ip && !conta) return;
  const { error } = await admin.rpc("auth_rate_limit_liberar", {
    p_devolver: ip ? [ip] : [],
    p_zerar: conta ? [conta] : [],
  });
  if (error) console.error("[limite-tentativas] liberar:", error.message);
}
