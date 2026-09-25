/**
 * Localização informada pelo aparelho de quem confirma um recibo pelo link do
 * WhatsApp (evidência da quitação). Vem do navegador (Geolocation API) com a
 * permissão da pessoa — é declarada pelo aparelho, não verificada: o PDF diz
 * isso. Recusa/indisponível também fica registrado. Puro (Deno e Node).
 */

export type Localizacao =
  | {
      status: "concedida";
      origem: "aparelho";
      lat: number;
      lng: number;
      precisao_m: number | null;
      capturada_em: string | null;
    }
  | { status: "negada" | "indisponivel" | "sem_resposta"; origem: "aparelho" };

const SEM_COORDENADA = new Set(["negada", "indisponivel", "sem_resposta"]);
const seis = (n: number) => Math.round(n * 1e6) / 1e6;

export function lerLocalizacao(v: unknown): Localizacao | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.status === "string" && SEM_COORDENADA.has(o.status)) {
    return { status: o.status as "negada" | "indisponivel" | "sem_resposta", origem: "aparelho" };
  }
  if (o.status !== "concedida") return null;
  const { lat, lng } = o;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return null;
  const p = o.precisao_m;
  const precisao =
    typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 100_000 ? Math.round(p) : null;
  const c = o.capturada_em;
  const capturada =
    typeof c === "string" && c.length <= 40 && !Number.isNaN(Date.parse(c))
      ? new Date(c).toISOString()
      : null;
  return {
    status: "concedida",
    origem: "aparelho",
    lat: seis(lat),
    lng: seis(lng),
    precisao_m: precisao,
    capturada_em: capturada,
  };
}

const coord = (l: { lat: number; lng: number }) => `${l.lat.toFixed(6)}, ${l.lng.toFixed(6)}`;

/** Linha "Localização" da evidência no PDF do recibo quitado. */
export function textoLocalizacao(l: Localizacao | null | undefined): string {
  if (!l) return "—";
  if (l.status === "concedida") {
    const precisao = l.precisao_m != null ? ` (±${l.precisao_m} m)` : "";
    return `${coord(l)}${precisao} — informada pelo aparelho`;
  }
  if (l.status === "negada") return "não autorizada por quem confirmou";
  if (l.status === "indisponivel") return "aparelho sem localização disponível";
  return "não obtida (o aparelho não respondeu a tempo)";
}

export function linkMapa(l: Localizacao | null | undefined): string | null {
  if (!l || l.status !== "concedida") return null;
  return `https://maps.google.com/?q=${l.lat.toFixed(6)},${l.lng.toFixed(6)}`;
}
