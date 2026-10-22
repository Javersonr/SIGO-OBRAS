/**
 * Download de arquivo por link PÚBLICO, feito pelo servidor (spec 2026-10-09 §5): o Claude manda a
 * URL do edital e o SIGO baixa. O servidor roda com a chave de serviço, então uma URL que o leve à rede
 * interna ou aos metadados da nuvem (SSRF) seria grave. Cada pedido passa por estas travas:
 *   - só https, porta 443, sem usuário nem senha na URL;
 *   - o nome tem de resolver SÓ para IP público: privado, loopback, link-local, CGNAT, documentação,
 *     multicast e tudo que em IPv6 não é unicast global são recusados; DNS sem resposta também;
 *   - a checagem vale para o host JÁ NORMALIZADO pelo parser de URL (0x7f.1, 2130706433, 127.1 e
 *     0177.0.0.1 viram 127.0.0.1) e a requisição usa o mesmo endereço normalizado (`url.href`);
 *   - o redirecionamento não é seguido pelo fetch: cada salto (no máximo 3) passa pelas mesmas travas;
 *   - até 50 MB (contados no fluxo, sem confiar no content-length) e 30 s para a operação inteira
 *     (DNS, saltos e corpo), mesmo se o fetch ou o DNS ignorarem o sinal de cancelamento.
 * Nenhuma mensagem de erro repete a URL pedida (pode trazer token na query).
 *
 * Risco aceito e conhecido: entre a consulta ao DNS e a conexão o nome pode mudar de IP (o fetch não deixa
 * fixar o IP). A resposta nunca volta ao Claude (só tipo e tamanho) e o arquivo só é aceito se os bytes
 * forem de PDF, ZIP ou Office.
 *
 * fetch e DNS injetados: roda no Node. Puro.
 */
export const MAX_REDIRECIONAMENTOS = 3;
export const TEMPO_LIMITE_DOWNLOAD_MS = 30_000;
export const LIMITE_DOWNLOAD = 52428800;
const MAX_URL = 2000;

export type CodigoErroDownload =
  | "url_invalida"
  | "destino_bloqueado"
  | "muitos_redirecionamentos"
  | "http"
  | "grande_demais"
  | "vazio"
  | "tempo_esgotado";

export class ErroDownload extends Error {
  codigo: CodigoErroDownload;
  constructor(codigo: CodigoErroDownload, mensagem: string) {
    super(mensagem);
    this.name = "ErroDownload";
    this.codigo = codigo;
  }
}

// ─── IP ──────────────────────────────────────────────────────────────────────

/**
 * "a.b.c.d" em decimal, sem zero à esquerda ("010" é octal em alguns resolvedores: ambíguo, então não é
 * IP para nós e quem chama recusa); null se não é IPv4.
 */
function ipv4ParaNumero(ip: string): number | null {
  const m = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) return null;
  return p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3];
}

/** [início, bits]: redes IPv4 que não são internet pública. */
const REDES_V4: [number, number][] = (
  [
    ["0.0.0.0", 8], // "esta rede"
    ["10.0.0.0", 8],
    ["100.64.0.0", 10], // CGNAT
    ["127.0.0.0", 8],
    ["169.254.0.0", 16], // link-local e metadados da nuvem
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24], // documentação
    ["192.88.99.0", 24], // 6to4 relay (obsoleto)
    ["192.168.0.0", 16],
    ["198.18.0.0", 15], // testes de desempenho
    ["198.51.100.0", 24], // documentação
    ["203.0.113.0", 24], // documentação
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reservado e broadcast
  ] as [string, number][]
).map(([base, bits]) => [ipv4ParaNumero(base) as number, bits]);

function v4Bloqueado(n: number): boolean {
  return REDES_V4.some(([inicio, bits]) => n >= inicio && n < inicio + 2 ** (32 - bits));
}

/** IPv6 → 8 grupos de 16 bits (aceita "::" e o final em IPv4); null se não é IPv6 (zona "%x" também não é). */
function gruposV6(ip: string): number[] | null {
  let texto = ip.toLowerCase();
  if (!/^[0-9a-f:.]+$/.test(texto) || !texto.includes(":")) return null;
  const ultimo = texto.slice(texto.lastIndexOf(":") + 1);
  if (ultimo.includes(".")) {
    const n = ipv4ParaNumero(ultimo);
    if (n === null) return null;
    const alto = Math.floor(n / 65536).toString(16);
    const baixo = (n % 65536).toString(16);
    texto = `${texto.slice(0, texto.lastIndexOf(":") + 1)}${alto}:${baixo}`;
  }
  const lados = texto.split("::");
  if (lados.length > 2) return null;
  const esquerda = lados[0] ? lados[0].split(":") : [];
  const direita = lados.length === 2 && lados[1] ? lados[1].split(":") : [];
  const faltam = 8 - esquerda.length - direita.length;
  if (lados.length === 1 ? faltam !== 0 : faltam < 1) return null;
  const partes = [...esquerda, ...Array(lados.length === 2 ? faltam : 0).fill("0"), ...direita];
  if (partes.length !== 8 || partes.some((p) => !/^[0-9a-f]{1,4}$/.test(p))) return null;
  return partes.map((p) => parseInt(p, 16));
}

/**
 * true = não é internet pública (ou nem é um IP exato): o servidor não vai até lá.
 *
 * IPv4: as redes de REDES_V4. IPv6, nesta ordem:
 *  - ::ffff:a.b.c.d (IPv4 mapeado), 64:ff9b::/96 (NAT64) e 2002::/16 (6to4): vale o IPv4 que vem dentro;
 *  - todo o resto só passa se for unicast global (2000::/3). Isso recusa de uma vez ::, ::1, ::/96 (IPv4
 *    compatível), SIIT, 64:ff9b:1::/48 (NAT64 de uso local), 100::/64, fc00::/7, fe80::/10, fec0::/10,
 *    ff00::/8 e toda faixa ainda não alocada;
 *  - dentro de 2000::/3 ficam de fora 2001::/23 (Teredo e protocolos), 2001:db8::/32 e 3fff::/20
 *    (documentação).
 */
export function ipBloqueado(ip: string): boolean {
  if (typeof ip !== "string") return true;
  const limpo = ip.trim().replace(/^\[|\]$/g, "");
  const v4 = ipv4ParaNumero(limpo);
  if (v4 !== null) return v4Bloqueado(v4);
  const g = gruposV6(limpo);
  if (!g) return true;
  const embutido = (alto: number, baixo: number) => v4Bloqueado(alto * 65536 + baixo);
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return embutido(g[6], g[7]);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return embutido(g[6], g[7]);
  }
  if (g[0] === 0x2002) return embutido(g[1], g[2]);
  if ((g[0] & 0xe000) !== 0x2000) return true;
  if (g[0] === 0x2001 && g[1] < 0x0200) return true;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;
  if (g[0] === 0x3fff && g[1] < 0x1000) return true;
  return false;
}

const ehIpLiteral = (host: string) => ipv4ParaNumero(host) !== null || gruposV6(host) !== null;
/** O host em minúsculas, sem colchetes (IPv6) e sem o(s) ponto(s) final(is) ("localhost." e "localhost.." são localhost). */
const hostDe = (url: URL) =>
  url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");

// ─── URL ─────────────────────────────────────────────────────────────────────

/** Últimos rótulos que nunca são internet pública (localhost, .local, .internal, .home.arpa, TLDs reservados…). */
const NOMES_INTERNOS =
  /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|private|arpa|test|example|invalid)$/;

export function validarUrlPublica(
  texto: unknown
): { ok: true; url: URL } | { ok: false; mensagem: string } {
  const nao = (mensagem: string) => ({ ok: false as const, mensagem });
  if (typeof texto !== "string" || !texto.trim())
    return nao("Informe o endereço (URL) do arquivo.");
  const bruto = texto.trim();
  if (bruto.length > MAX_URL) return nao("A URL passa de 2000 caracteres.");
  if (/[\s\u0000-\u001f\u007f-\u009f]/.test(bruto)) {
    return nao("A URL não pode ter espaço nem caractere de controle.");
  }
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    return nao("URL inválida.");
  }
  if (url.protocol !== "https:") return nao("Só é aceito endereço https.");
  if (url.username || url.password) return nao("A URL não pode ter usuário nem senha.");
  if (url.port && url.port !== "443") return nao("Só é aceita a porta 443.");
  const host = hostDe(url);
  if (!host) return nao("URL inválida.");
  if (ehIpLiteral(host)) {
    if (ipBloqueado(host)) return nao("Endereço de rede interna não é aceito.");
  } else if (!host.includes(".") || NOMES_INTERNOS.test(host)) {
    return nao("Endereço de rede interna não é aceito.");
  }
  return { ok: true, url };
}

/** Confere para onde o nome aponta ANTES de cada requisição. Lança ErroDownload("destino_bloqueado"). */
export async function conferirDestino(
  url: URL,
  resolverDns: (host: string) => Promise<string[]>
): Promise<void> {
  const host = hostDe(url);
  if (ehIpLiteral(host)) {
    if (ipBloqueado(host)) {
      throw new ErroDownload("destino_bloqueado", "O endereço aponta para uma rede interna.");
    }
    return;
  }
  let ips: unknown = null;
  try {
    ips = await resolverDns(host);
  } catch {
    ips = null;
  }
  if (!Array.isArray(ips) || ips.length === 0) {
    throw new ErroDownload(
      "destino_bloqueado",
      "Não foi possível confirmar o endereço do servidor do link."
    );
  }
  if (ips.some((ip) => typeof ip !== "string" || ipBloqueado(ip))) {
    throw new ErroDownload("destino_bloqueado", "O endereço aponta para uma rede interna.");
  }
}

// ─── Download ────────────────────────────────────────────────────────────────

/** Lê o corpo contando bytes e desiste (cancelando o fluxo) assim que passa do limite. */
async function lerComLimite(resp: Response, limite: number): Promise<Uint8Array> {
  const leitor = resp.body?.getReader();
  if (!leitor) {
    const tudo = new Uint8Array(await resp.arrayBuffer());
    if (tudo.length > limite) throw new ErroDownload("grande_demais", "O arquivo passa de 50 MB.");
    return tudo;
  }
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > limite) {
      await leitor.cancel().catch(() => {});
      throw new ErroDownload("grande_demais", "O arquivo passa de 50 MB.");
    }
    partes.push(value);
  }
  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    junto.set(p, pos);
    pos += p.length;
  }
  return junto;
}

const REDIRECIONA = new Set([301, 302, 303, 307, 308]);

interface OpcoesDownload {
  fetchFn: typeof fetch;
  resolverDns: (host: string) => Promise<string[]>;
  limiteBytes?: number;
  tempoMs?: number;
}

/** O laço de saltos: cada URL é validada e o destino conferido ANTES de o fetch ser chamado. */
async function seguirEBaixar(
  urlTexto: string,
  deps: OpcoesDownload,
  limite: number,
  sinal: AbortSignal
): Promise<{ bytes: Uint8Array; contentType: string | null; urlFinal: string; saltos: number }> {
  let atual = urlTexto;
  for (let saltos = 0; ; saltos++) {
    if (sinal.aborted) throw new DOMException("prazo", "AbortError");
    const v = validarUrlPublica(atual);
    if (!v.ok) {
      throw new ErroDownload(saltos === 0 ? "url_invalida" : "destino_bloqueado", v.mensagem);
    }
    await conferirDestino(v.url, deps.resolverDns);
    // o endereço pedido ao fetch é o normalizado que acabou de ser conferido (nunca o texto cru)
    const resp = await deps.fetchFn(v.url.href, {
      method: "GET",
      redirect: "manual",
      signal: sinal,
      headers: { accept: "*/*", "user-agent": "SIGO-Obras/1.0 (+https://www.sigoobras.com.br)" },
    });
    if (REDIRECIONA.has(resp.status)) {
      await resp.body?.cancel().catch(() => {});
      const destino = resp.headers.get("location");
      if (!destino) throw new ErroDownload("http", "O servidor redirecionou sem dizer para onde.");
      if (saltos >= MAX_REDIRECIONAMENTOS) {
        throw new ErroDownload(
          "muitos_redirecionamentos",
          "O link redireciona vezes demais (máximo de 3)."
        );
      }
      try {
        atual = new URL(destino, v.url).href;
      } catch {
        throw new ErroDownload("http", "O servidor redirecionou para um endereço inválido.");
      }
      continue;
    }
    if (!resp.ok) {
      await resp.body?.cancel().catch(() => {});
      throw new ErroDownload("http", `O servidor do link respondeu ${resp.status}.`);
    }
    const declarado = Number(resp.headers.get("content-length"));
    if (Number.isFinite(declarado) && declarado > limite) {
      await resp.body?.cancel().catch(() => {});
      throw new ErroDownload("grande_demais", "O arquivo passa de 50 MB.");
    }
    const bytes = await lerComLimite(resp, limite);
    if (!bytes.length) throw new ErroDownload("vazio", "O arquivo veio vazio.");
    return { bytes, contentType: resp.headers.get("content-type"), urlFinal: v.url.href, saltos };
  }
}

export async function baixarUrlPublica(
  urlTexto: string,
  deps: OpcoesDownload
): Promise<{ bytes: Uint8Array; contentType: string | null; urlFinal: string; saltos: number }> {
  const limite = deps.limiteBytes ?? LIMITE_DOWNLOAD;
  const tempoMs = deps.tempoMs ?? TEMPO_LIMITE_DOWNLOAD_MS;
  const mensagemPrazo = `O servidor do link demorou mais de ${Math.round(tempoMs / 1000)} segundos.`;
  const controle = new AbortController();
  const sinal = controle.signal;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  // o prazo é de TODA a operação e vale mesmo que o fetch, o corpo ou o DNS ignorem o sinal: a corrida
  // abandona o que estiver pendente (o sinal ainda cancela o fetch de verdade)
  const prazo = new Promise<never>((_ok, rejeita) => {
    temporizador = setTimeout(() => {
      rejeita(new ErroDownload("tempo_esgotado", mensagemPrazo));
      controle.abort();
    }, tempoMs);
  });
  try {
    return await Promise.race([seguirEBaixar(urlTexto, deps, limite, sinal), prazo]);
  } catch (e) {
    if (e instanceof ErroDownload) throw e;
    if (sinal.aborted) throw new ErroDownload("tempo_esgotado", mensagemPrazo);
    // texto fixo: o erro de rede do runtime costuma repetir a URL inteira (com token da query)
    throw new ErroDownload(
      "http",
      "Não foi possível baixar o arquivo: falha na conexão com o servidor do link."
    );
  } finally {
    clearTimeout(temporizador);
  }
}

/** "url:" + os 16 primeiros hex do SHA-256 da URL pedida: a `origem` do arquivo (o mesmo link troca no lugar). */
export async function origemDaUrl(url: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(url).trim()));
  const hex = [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `url:${hex.slice(0, 16)}`;
}
