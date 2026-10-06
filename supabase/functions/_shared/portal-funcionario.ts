/**
 * Regras compartilhadas do Portal do Funcionário (login + trilha de auditoria).
 */

import { ipBrutoDaRequisicao } from "./limite-tentativas.ts";

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

/**
 * Origem gravada como evidência (trilha, tentativa da prova, assinatura do
 * certificado, ciência, recibo do fornecedor). O IP é o da entrada mais à
 * direita do X-Forwarded-For (a única que o cliente não forja) e fica completo:
 * IPv6 não é reduzido ao /64, que é só do limitador de tentativas.
 */
export function origemDaRequisicao(req: Request): {
  ip: string | null;
  dispositivo: string | null;
} {
  return {
    ip: ipBrutoDaRequisicao(req),
    dispositivo: req.headers.get("user-agent")?.slice(0, 400) || null,
  };
}

/**
 * De onde vem o conteúdo do evento (coluna `treinamento_evento.origem`, migração 0135).
 * `servidor`: o servidor viu e decidiu (login, aula concluída, prova aberta, certificado...).
 * `navegador`: o navegador do aluno INFORMOU (abriu a aula, play, pausa, saiu da aba...): o servidor
 * só carimba a hora e o IP. A tela de auditoria do RH marca esses eventos.
 */
export type OrigemEvento = "servidor" | "navegador";

/**
 * Eventos que só o servidor grava, a pedido do RH (`funcionario-acesso`, T18). Nenhum deles está na
 * lista de eventos que o navegador do aluno pode relatar (`EVENTOS_CLIENTE`, no portal): a liberação
 * zera o intervalo entre tentativas, então o aluno não pode gravar o próprio evento.
 */
export const EVENTO_TENTATIVA_LIBERADA = "tentativa_liberada";
export const EVENTO_CERTIFICADO_REVOGADO = "certificado_revogado";

export interface EventoPortal {
  empresa_id: string;
  funcionario_id: string;
  evento: string;
  matricula_id?: string | null;
  curso_id?: string | null;
  aula_id?: string | null;
  detalhe?: Record<string, unknown> | null;
  /**
   * Só a ação `evento` do portal (o navegador relata o que aconteceu) passa `navegador`. Sem
   * `origem`, a coluna não vai no INSERT e vale o default `servidor` do banco.
   */
  origem?: OrigemEvento;
}

/**
 * Grava na trilha de auditoria. Nunca derruba a ação principal. Devolve se o evento ficou gravado:
 * quase todo chamador ignora, mas quem depende da linha (a prova só abre se o início ficou na trilha)
 * confere. A trilha é só de inclusão: o banco recusa UPDATE e DELETE (migração 0135).
 */
export async function registrarEvento(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  e: EventoPortal
): Promise<boolean> {
  const { error } = await supabase
    .from("treinamento_evento")
    .insert({ ...e, ...origemDaRequisicao(req) });
  if (error) console.error("[portal-funcionario] evento:", e.evento, error.message);
  return !error;
}

/**
 * Inteiro uniforme em [0, n) com o sorteio criptográfico (`crypto.getRandomValues`), sem o viés do
 * `% n` simples: valores do topo que não completam uma volta de n são descartados e sorteados de novo.
 * Serve ao sorteio da prova (a ordem das questões e das alternativas é decidida no servidor).
 */
export function inteiroAleatorioSeguro(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new RangeError("n inválido");
  if (n === 1) return 0;
  const limite = Math.floor(2 ** 32 / n) * n; // maior múltiplo de n que cabe em 32 bits
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limite);
  return buf[0] % n;
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

/**
 * JSON canônico: mesmas chaves, mesma ordem, sempre. Objetos têm as chaves ordenadas (recursivamente) e
 * a saída não leva espaços; listas mantêm a ordem dos itens. Os valores seguem o `JSON.stringify`
 * (`undefined` some do objeto, vira `null` na lista, `NaN` vira `null`).
 *
 * Existe porque `dados` e `assinatura_aluno` do certificado vão para `jsonb`, que NÃO guarda a ordem das
 * chaves (ordena por tamanho e depois alfabeticamente). Um hash do `JSON.stringify` do objeto original
 * não dá para refazer a partir do que está no banco; o do JSON canônico dá.
 */
export function jsonCanonico(valor: unknown): string {
  const normalizado = (v: unknown): unknown => {
    // toJSON primeiro (Date, por exemplo), como o JSON.stringify faz
    const x =
      v !== null &&
      typeof v === "object" &&
      typeof (v as { toJSON?: unknown }).toJSON === "function"
        ? (v as { toJSON: () => unknown }).toJSON()
        : v;
    if (Array.isArray(x)) return x.map((i) => normalizado(i));
    if (x !== null && typeof x === "object") {
      const saida: Record<string, unknown> = {};
      for (const k of Object.keys(x).sort()) {
        const i = (x as Record<string, unknown>)[k];
        // o que o JSON.stringify descarta num objeto, descartamos também
        if (i === undefined || typeof i === "function" || typeof i === "symbol") continue;
        saida[k] = normalizado(i);
      }
      return saida;
    }
    return x;
  };
  return JSON.stringify(normalizado(valor)) ?? "null";
}

/**
 * Versão do hash gravada na assinatura do certificado (`assinatura_aluno.hash_versao`). Sem ela (certificados
 * emitidos antes da T10) o hash é o antigo: SHA-256 do `JSON.stringify` na ordem de montagem do objeto.
 */
export const HASH_VERSAO_CANONICO = 2;

/** Hash do certificado (versão 2): SHA-256 do JSON canônico de `{ codigo, dados, assinatura }`. */
export function hashDoCertificado(
  codigo: string,
  dados: unknown,
  assinatura: unknown
): Promise<string> {
  return sha256Hex(jsonCanonico({ codigo, dados, assinatura }));
}
