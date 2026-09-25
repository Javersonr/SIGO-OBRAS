/**
 * Localização do aparelho para a evidência da quitação do recibo (página
 * pública do link do WhatsApp). Pede permissão ao navegador; NUNCA trava a
 * confirmação: recusa, erro ou demora viram um status registrado no recibo.
 * O servidor valida de novo (supabase/functions/_shared/localizacao.ts).
 */
export function obterLocalizacao({
  geolocation = typeof navigator !== "undefined" ? navigator.geolocation : null,
  timeoutMs = 10000,
  folgaMs = 2000,
} = {}) {
  return new Promise((resolve) => {
    if (!geolocation) {
      resolve({ status: "indisponivel" });
      return;
    }
    let pronto = false;
    const fim = (v) => {
      if (pronto) return;
      pronto = true;
      clearTimeout(relogio);
      resolve(v);
    };
    // alguns navegadores não chamam nenhum callback se o aviso de permissão fica aberto
    const relogio = setTimeout(() => fim({ status: "sem_resposta" }), timeoutMs + folgaMs);
    geolocation.getCurrentPosition(
      (p) =>
        fim({
          status: "concedida",
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          precisao_m: Math.round(p.coords.accuracy),
          capturada_em: new Date(p.timestamp).toISOString(),
        }),
      (e) =>
        fim({ status: e?.code === 1 ? "negada" : e?.code === 3 ? "sem_resposta" : "indisponivel" }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}
