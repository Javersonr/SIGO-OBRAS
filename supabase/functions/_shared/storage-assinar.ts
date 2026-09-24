/**
 * Arquivos do Storage para quem NÃO tem sessão da empresa (portal do cliente,
 * portal do fornecedor). O banco guarda a referência estável "bucket/caminho"
 * (a URL assinada expira em 1h); a Edge Function assina na hora, com service
 * role, e SÓ o que está na pasta da empresa do escopo — o 1º segmento do
 * caminho é o empresa_id (mesma regra da RLS do Storage).
 *
 * Aceita também URL legada do nosso Storage (…/storage/v1/object/{sign|public|
 * authenticated}/bucket/caminho). Base44 (plataforma antiga, arquivos apagados)
 * não é assinado; link externo (OneDrive, Drive, site) volta como está.
 */

// deno-lint-ignore no-explicit-any
type Db = any;

const TTL_PADRAO = 60 * 60 * 3; // 3h: o portal fica aberto; recarregar renova

const ehBase44 = (v: string) => /base44\./i.test(v);

/** "bucket/caminho" a partir da ref ou da URL do nosso Storage; senão null. */
export function refDoStorage(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  if (!v || ehBase44(v)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    if (!base || !v.startsWith(`${base}/storage/v1/object/`)) return null;
    const m = v.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/?#]+)\/([^?#]+)/);
    if (!m) return null;
    try {
      return `${m[1]}/${decodeURIComponent(m[2])}`;
    } catch {
      return `${m[1]}/${m[2]}`;
    }
  }
  const i = v.indexOf("/");
  return i > 0 && i < v.length - 1 ? v : null;
}

/**
 * A ref é da empresa? Devolve a ref normalizada ou null. Barra caminho de
 * outra empresa e "." / ".." / "//" (não dá para escapar da pasta).
 */
export function refDaEmpresa(valor: unknown, empresaId: string): string | null {
  const ref = refDoStorage(valor);
  if (!ref || !empresaId) return null;
  const partes = ref.split("/"); // [bucket, empresa_id, ...]
  if (partes.length < 3 || partes.some((p) => !p || p === "." || p === "..")) return null;
  return partes[1] === empresaId ? ref : null;
}

/** Link externo pronto: http(s) que não é do nosso Storage nem do Base44. */
export function ehLinkExterno(valor: unknown): boolean {
  return (
    typeof valor === "string" &&
    /^https?:\/\//i.test(valor) &&
    !ehBase44(valor) &&
    !refDoStorage(valor)
  );
}

/**
 * Assina em lote (createSignedUrls por bucket) os valores que são refs da
 * empresa. Mapa valorOriginal → URL assinada; o resto (outra empresa, Base44,
 * link externo, objeto inexistente) fica fora do mapa.
 */
export async function assinarDaEmpresa(
  supabase: Db,
  valores: unknown[],
  empresaId: string,
  ttl = TTL_PADRAO
): Promise<Map<string, string>> {
  const porBucket = new Map<string, Map<string, string[]>>(); // bucket → caminho → originais
  for (const v of valores) {
    const ref = refDaEmpresa(v, empresaId);
    if (!ref) continue;
    const i = ref.indexOf("/");
    const bucket = ref.slice(0, i);
    const caminho = ref.slice(i + 1);
    const caminhos = porBucket.get(bucket) ?? new Map<string, string[]>();
    caminhos.set(caminho, [...(caminhos.get(caminho) ?? []), v as string]);
    porBucket.set(bucket, caminhos);
  }
  const assinadas = new Map<string, string>();
  for (const [bucket, caminhos] of porBucket) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls([...caminhos.keys()], ttl);
    if (error) {
      console.error(`[storage-assinar] ${bucket}:`, error.message);
      continue;
    }
    for (const s of data ?? []) {
      if (!s?.signedUrl || !s.path) continue;
      for (const original of caminhos.get(s.path) ?? []) assinadas.set(original, s.signedUrl);
    }
  }
  return assinadas;
}

/**
 * URL para o navegador exibir: assinada (ref da empresa), link externo ou
 * imagem embutida (data:image, foto do diário salva offline) como estão; null
 * quando não há o que mostrar (Base44, arquivo sumido, ref de outra empresa).
 */
export function urlParaExibir(valor: unknown, assinadas: Map<string, string>): string | null {
  if (typeof valor !== "string" || !valor) return null;
  const assinada = assinadas.get(valor);
  if (assinada) return assinada;
  if (ehLinkExterno(valor) || /^data:image\//i.test(valor)) return valor;
  return null;
}

/** Empresa + `logo_url_assinada` (URL pronta do logo, ou null → mostrar só o nome). */
export async function comLogoAssinado<T extends { id?: string; logo_url?: string | null }>(
  supabase: Db,
  empresa: T | null
): Promise<(T & { logo_url_assinada: string | null }) | null> {
  if (!empresa) return null;
  const assinadas = await assinarDaEmpresa(supabase, [empresa.logo_url], empresa.id ?? "");
  return { ...empresa, logo_url_assinada: urlParaExibir(empresa.logo_url, assinadas) };
}
