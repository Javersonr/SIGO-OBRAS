/**
 * Regras compartilhadas do Portal do Funcionário (login + trilha de auditoria).
 */

/** CPF digitado com ou sem pontuação vira só dígitos; outro usuário, minúsculo. */
export function normalizarUsuario(bruto: string): string {
  const u = (bruto || "").trim().toLowerCase();
  return /^[\d.\-\s/]+$/.test(u) ? u.replace(/\D/g, "") : u;
}

/**
 * Senha provisória fácil de digitar no celular: 8 caracteres maiúsculos e
 * dígitos, sem os que se confundem (0/O, 1/I). Vale só até o primeiro acesso.
 */
export function gerarSenhaProvisoria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(8));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

const SENHAS_FRACAS = new Set([
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "654321",
  "123123",
  "000000",
  "111111",
  "222222",
  "999999",
  "senha1",
  "senha123",
  "abc123",
  "qwerty",
]);

/** null = senha aceita; senão, o motivo da recusa. */
export function motivoSenhaInvalida(nova: string, usuario: string): string | null {
  if (!nova || nova.length < 6) return "A senha precisa ter pelo menos 6 caracteres";
  if (nova.length > 72) return "Senha longa demais";
  const n = nova.toLowerCase();
  if (n === usuario || n.replace(/\D/g, "") === usuario)
    return "A senha não pode ser o seu usuário/CPF";
  if (SENHAS_FRACAS.has(n) || /^(.)\1+$/.test(n)) return "Senha fácil demais — escolha outra";
  return null;
}

export function origemDaRequisicao(req: Request): {
  ip: string | null;
  dispositivo: string | null;
} {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    dispositivo: req.headers.get("user-agent")?.slice(0, 400) || null,
  };
}

export interface EventoPortal {
  empresa_id: string;
  funcionario_id: string;
  evento: string;
  matricula_id?: string | null;
  curso_id?: string | null;
  aula_id?: string | null;
  detalhe?: Record<string, unknown> | null;
}

/** Grava na trilha de auditoria. Nunca derruba a ação principal. */
export async function registrarEvento(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  e: EventoPortal
): Promise<void> {
  const { error } = await supabase
    .from("treinamento_evento")
    .insert({ ...e, ...origemDaRequisicao(req) });
  if (error) console.error("[portal-funcionario] evento:", e.evento, error.message);
}

/** Código do certificado: 12 caracteres em 3 blocos (ex.: K7QM-2XRA-94TD). */
export function gerarCodigoCertificado(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  const s = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

export async function sha256Hex(texto: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
