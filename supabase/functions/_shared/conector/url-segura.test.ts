// node --test supabase/functions/_shared/conector/url-segura.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  baixarUrlPublica,
  conferirDestino,
  ErroDownload,
  ipBloqueado,
  LIMITE_DOWNLOAD,
  MAX_REDIRECIONAMENTOS,
  origemDaUrl,
  TEMPO_LIMITE_DOWNLOAD_MS,
  validarUrlPublica,
} from "./url-segura.ts";

const PDF = new TextEncoder().encode("%PDF-1.7 edital");
const publico = async () => ["200.160.2.3"];

test("constantes da spec", () => {
  assert.equal(MAX_REDIRECIONAMENTOS, 3);
  assert.equal(TEMPO_LIMITE_DOWNLOAD_MS, 30_000);
  assert.equal(LIMITE_DOWNLOAD, 52428800);
});

test("validarUrlPublica: só https, porta 443, sem credencial, sem rede interna", () => {
  const ok = (u: unknown) => validarUrlPublica(u).ok;
  assert.equal(ok("https://portal.exemplo.gov.br/editais/009.pdf"), true);
  assert.equal(ok("https://portal.exemplo.gov.br:443/x?id=1"), true);
  assert.equal(ok("  https://portal.exemplo.gov.br/x  "), true);
  for (const ruim of [
    "http://portal.exemplo.gov.br/x",
    "ftp://portal.exemplo.gov.br/x",
    "https://portal.exemplo.gov.br:8443/x",
    "https://usuario:senha@portal.exemplo.gov.br/x",
    "https://usuario@portal.exemplo.gov.br/x",
    "https://localhost/x",
    "https://intranet/x",
    "https://servidor.local/x",
    "https://api.internal/x",
    "https://127.0.0.1/x",
    "https://2130706433/x",
    "https://0x7f.0.0.1/x",
    "https://10.0.0.5/x",
    "https://192.168.1.10/x",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/x",
    "https://[fd00::1]/x",
    "https://[fe80::1]/x",
    "https://[::ffff:10.0.0.1]/x",
    "https://portal.exemplo.gov.br/a b",
    "nao e url",
    "",
    null,
    123,
    `https://portal.exemplo.gov.br/${"a".repeat(2000)}`,
  ]) {
    assert.equal(ok(ruim), false, String(ruim).slice(0, 60));
  }
  const r = validarUrlPublica("http://x.gov.br/a");
  assert.equal(r.ok === false && r.mensagem, "Só é aceito endereço https.");
});

test("validarUrlPublica: IPv4 em formas alternativas (o URL normaliza para 127.0.0.1) e IPv6 equivalentes são recusados", () => {
  const recusa = (u: string) => {
    const r = validarUrlPublica(u);
    assert.equal(r.ok, false, u);
    assert.equal(r.ok === false && r.mensagem, "Endereço de rede interna não é aceito.", u);
  };
  for (const u of [
    "https://0x7f.1/",
    "https://2130706433/",
    "https://127.1/",
    "https://0177.0.0.1/",
    "https://0x7f000001/",
    "https://017700000001/",
    "https://0/",
    "https://0.0.0.0/",
    "https://127。0。0。1/", // ponto ideográfico: o URL troca por "."
    "https://１２７.０.０.１/", // dígitos de largura total
    "https://10.1/", // 10.0.0.1
    "https://0xa9fea9fe/", // 169.254.169.254
    "https://[::ffff:127.0.0.1]/",
    "https://[::ffff:7f00:1]/",
    "https://[0:0:0:0:0:ffff:7f00:1]/",
    "https://[0:0:0:0:0:0:0:1]/",
    "https://[::]/",
    "https://[::127.0.0.1]/",
    "https://[::ffff:169.254.169.254]/",
    "https://[64:ff9b::10.0.0.1]/",
    "https://[64:ff9b::7f00:1]/",
    "https://[64:ff9b:1::1]/",
    "https://[2002:0a00:0001::1]/",
    "https://[2002:7f00:1::]/",
    "https://[fc00::1]/",
    "https://[fdff:ffff::1]/",
    "https://[febf::1]/",
    "https://[fec0::1]/",
    "https://[ff02::1]/",
    "https://[2001:db8::1]/",
    "https://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/", // Teredo
  ]) {
    recusa(u);
  }
  // zona/escopo no IPv6 não existe em URL: o parser recusa
  const zona = validarUrlPublica("https://[fe80::1%25eth0]/x");
  assert.equal(zona.ok, false);
  // IPs públicos escritos de forma alternativa passam (viram 8.8.8.8)
  const oito = validarUrlPublica("https://0x08080808/x");
  assert.equal(oito.ok && oito.url.hostname, "8.8.8.8");
  assert.equal(validarUrlPublica("https://[2001:4860:4860::8888]/x").ok, true);
  assert.equal(validarUrlPublica("https://[::ffff:8.8.8.8]/x").ok, true);
});

test("validarUrlPublica: usuário e senha na URL, porta e o que normaliza para 443", () => {
  for (const u of [
    "https://user:pass@portal.exemplo.gov.br/",
    "https://:pass@portal.exemplo.gov.br/",
    "https://user:@portal.exemplo.gov.br/",
    "https://portal.exemplo.gov.br@127.0.0.1/",
    "https://portal.exemplo.gov.br:80/",
    "https://portal.exemplo.gov.br:0/",
    "https://portal.exemplo.gov.br:8443/",
    "https://portal.exemplo.gov.br:444/",
  ]) {
    assert.equal(validarUrlPublica(u).ok, false, u);
  }
  const mensagem = (u: string) => {
    const r = validarUrlPublica(u);
    return r.ok ? null : r.mensagem;
  };
  assert.equal(
    mensagem("https://user:pass@portal.exemplo.gov.br/"),
    "A URL não pode ter usuário nem senha."
  );
  assert.equal(mensagem("https://portal.exemplo.gov.br:8443/"), "Só é aceita a porta 443.");
  for (const u of [
    "https://portal.exemplo.gov.br:443/",
    "https://portal.exemplo.gov.br:0443/",
    "https://[2001:4860:4860::8888]:443/",
  ]) {
    assert.equal(validarUrlPublica(u).ok, true, u);
  }
  // a barra invertida vira "/" no URL: o host é o que vem antes dela e nada do resto escapa para a checagem
  const contrabarra = validarUrlPublica(String.raw`https://portal.exemplo.gov.br\@127.0.0.1/x`);
  assert.equal(contrabarra.ok && contrabarra.url.hostname, "portal.exemplo.gov.br");
  assert.equal(
    contrabarra.ok && contrabarra.url.href,
    "https://portal.exemplo.gov.br/@127.0.0.1/x"
  );
});

test("validarUrlPublica: nome interno, ponto final e nome codificado", () => {
  for (const u of [
    "https://localhost./x",
    "https://localhost../x",
    "https://LOCALHOST/x",
    "https://app.localhost/x",
    "https://app.localhost./x",
    "https://servidor.local./x",
    "https://servidor.local../x",
    "https://metadata.google.internal/x",
    "https://metadata.google.internal./x",
    "https://intranet./x",
    "https://%6c%6f%63%61%6c%68%6f%73%74/x",
    "https://wpad.localdomain/x",
    "https://roteador.home.arpa/x",
    "https://servico.test/x",
    "https://servico.example/x",
    "https://servico.invalid/x",
  ]) {
    const r = validarUrlPublica(u);
    assert.equal(r.ok, false, u);
  }
  assert.equal(validarUrlPublica("https://portal.exemplo.gov.br./x").ok, true);
});

test("ipBloqueado: privado, loopback, link-local, CGNAT, multicast e os IPv6 equivalentes", () => {
  for (const ip of [
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:c0a8:0101",
    "64:ff9b::a00:1",
    "2001:db8::1",
    "2002:0a00:0001::1",
    "nao-e-ip",
    "",
  ]) {
    assert.equal(ipBloqueado(ip), true, ip);
  }
  for (const ip of [
    "8.8.8.8",
    "200.160.2.3",
    "172.32.0.1",
    "100.128.0.1",
    "2001:4860:4860::8888",
    "2804:14c::1",
    "::ffff:8.8.8.8",
  ]) {
    assert.equal(ipBloqueado(ip), false, ip);
  }
});

test("ipBloqueado: IPv6 fora da internet pública, IPv4 embutido e escritas estranhas", () => {
  for (const ip of [
    // laço, não especificado e as formas longas, em maiúsculas e entre colchetes
    "0:0:0:0:0:0:0:1",
    "0000:0000:0000:0000:0000:0000:0000:0001",
    "0:0:0:0:0:0:0:0",
    "[::1]",
    "[fe80::1]",
    // IPv4 mapeado e compatível com IPv4 privado ou público (a faixa ::/96 não tem uso legítimo)
    "::FFFF:7F00:1",
    "0:0:0:0:0:ffff:7f00:1",
    "0000:0000:0000:0000:0000:ffff:7f00:0001",
    "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe",
    "::ffff:10.0.0.1",
    "::127.0.0.1",
    "::8.8.8.8",
    "::808:808",
    "::ffff:0:7f00:1", // SIIT
    // NAT64 e 6to4 com IPv4 privado dentro; NAT64 de uso local
    "64:ff9b::10.0.0.1",
    "64:ff9b::7f00:1",
    "64:ff9b::a9fe:a9fe",
    "64:ff9b:1::1",
    "64:ff9b:1:2:3:4:5:6",
    "2002:7f00:1::1",
    "2002:c0a8:101::",
    "2002:a9fe:a9fe::1",
    // Teredo, faixa de protocolos, documentação e o que não é unicast global
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "2001:1::1",
    "2001:db8:abcd::1",
    "3fff::1",
    "100::1",
    "fe80::",
    "febf::1",
    "fec0::1",
    "fc00::",
    "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    "ff00::",
    "4000::1",
    "8000::1",
    "e000::1",
    // zona ou escopo, lixo e escritas ambíguas: se não é um IP exato, é recusado
    "fe80::1%eth0",
    "::1%1",
    "2001:4860:4860::8888%eth0",
    "[::1",
    ":::",
    "1::2::3",
    "12345::1",
    "g::1",
    "127.1",
    "0x7f.0.0.1",
    "010.0.0.1",
    "08.8.8.8",
    "1.2.3",
    "1.2.3.4.5",
    "256.1.1.1",
    "8.8.8.8/32",
    "8.8.8.8:443",
  ]) {
    assert.equal(ipBloqueado(ip), true, ip);
  }
  for (const ip of [
    "::ffff:808:808",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
    "64:ff9b::8.8.8.8",
    "2002:0808:0808::1",
    "2001:200::1", // APNIC: fora da faixa 2001::/23
    "2606:4700:4700::1111",
    "2a00:1450:4001::200e",
    "2804:14c::1",
    "[2001:4860:4860::8888]",
    " 8.8.8.8 ",
  ]) {
    assert.equal(ipBloqueado(ip), false, ip);
  }
  for (const nao of [undefined, null, 8, {}, ["8.8.8.8"]]) {
    assert.equal(ipBloqueado(nao as unknown as string), true, String(nao));
  }
});

test("ipBloqueado: nenhuma faixa de IPv4 reservada escapa (início, fim e vizinhos)", () => {
  const faixas: [string, string][] = [
    ["0.0.0.0", "0.255.255.255"],
    ["10.0.0.0", "10.255.255.255"],
    ["100.64.0.0", "100.127.255.255"],
    ["127.0.0.0", "127.255.255.255"],
    ["169.254.0.0", "169.254.255.255"],
    ["172.16.0.0", "172.31.255.255"],
    ["192.0.0.0", "192.0.0.255"],
    ["192.0.2.0", "192.0.2.255"],
    ["192.88.99.0", "192.88.99.255"],
    ["192.168.0.0", "192.168.255.255"],
    ["198.18.0.0", "198.19.255.255"],
    ["198.51.100.0", "198.51.100.255"],
    ["203.0.113.0", "203.0.113.255"],
    ["224.0.0.0", "255.255.255.255"],
  ];
  for (const [de, ate] of faixas) {
    assert.equal(ipBloqueado(de), true, de);
    assert.equal(ipBloqueado(ate), true, ate);
  }
  for (const vizinho of [
    "1.0.0.0",
    "9.255.255.255",
    "11.0.0.0",
    "100.63.255.255",
    "100.128.0.0",
    "126.255.255.255",
    "128.0.0.0",
    "169.253.255.255",
    "169.255.0.0",
    "172.15.255.255",
    "172.32.0.0",
    "192.0.1.0",
    "192.0.3.0",
    "192.167.255.255",
    "192.169.0.0",
    "198.17.255.255",
    "198.20.0.0",
    "198.51.99.255",
    "198.51.101.0",
    "203.0.112.255",
    "203.0.114.0",
    "223.255.255.255",
  ]) {
    assert.equal(ipBloqueado(vizinho), false, vizinho);
  }
});

test("conferirDestino: todo IP do nome tem de ser público; sem resposta do DNS, recusa", async () => {
  const url = new URL("https://portal.exemplo.gov.br/x");
  await conferirDestino(url, publico);
  const codigo = async (resolver: (h: string) => Promise<string[]>) => {
    try {
      await conferirDestino(url, resolver);
      return "ok";
    } catch (e) {
      return e instanceof ErroDownload ? e.codigo : "outro";
    }
  };
  assert.equal(await codigo(async () => ["10.0.0.7"]), "destino_bloqueado");
  assert.equal(await codigo(async () => ["200.160.2.3", "127.0.0.1"]), "destino_bloqueado");
  assert.equal(await codigo(async () => []), "destino_bloqueado");
  assert.equal(
    await codigo(async () => {
      throw new Error("dns fora");
    }),
    "destino_bloqueado"
  );
  // IP literal público não consulta o DNS
  let consultou = false;
  await conferirDestino(new URL("https://200.160.2.3/x"), async () => ((consultou = true), []));
  assert.equal(consultou, false);
});

test("conferirDestino: IPv4 e IPv6 misturados, lixo do resolvedor e o nome que o resolvedor recebe", async () => {
  const codigo = async (url: string, resolver: (h: string) => Promise<unknown>) => {
    try {
      await conferirDestino(new URL(url), resolver as (h: string) => Promise<string[]>);
      return "ok";
    } catch (e) {
      return e instanceof ErroDownload ? e.codigo : "outro";
    }
  };
  const nome = "https://portal.exemplo.gov.br/x";
  // público e privado juntos (A público + AAAA interno, e o contrário): recusa
  assert.equal(await codigo(nome, async () => ["200.160.2.3", "fd00::1"]), "destino_bloqueado");
  assert.equal(await codigo(nome, async () => ["2804:14c::1", "10.0.0.1"]), "destino_bloqueado");
  assert.equal(
    await codigo(nome, async () => ["200.160.2.3", "::ffff:127.0.0.1"]),
    "destino_bloqueado"
  );
  assert.equal(
    await codigo(nome, async () => ["200.160.2.3", "fe80::1%eth0"]),
    "destino_bloqueado"
  );
  assert.equal(await codigo(nome, async () => ["200.160.2.3", "not-an-ip"]), "destino_bloqueado");
  // vários, todos públicos: passa
  assert.equal(await codigo(nome, async () => ["200.160.2.3", "2804:14c::1", "8.8.8.8"]), "ok");
  // o resolvedor devolve lixo: recusa, nunca "passa por falta de prova"
  for (const lixo of [null, undefined, "200.160.2.3", {}, [null], [123], [""], [["8.8.8.8"]]]) {
    assert.equal(await codigo(nome, async () => lixo), "destino_bloqueado", JSON.stringify(lixo));
  }
  // nome que parece público mas resolve para a rede interna (ex.: 127.0.0.1.nip.io)
  assert.equal(
    await codigo("https://127.0.0.1.nip.exemplo.gov.br/x", async () => ["127.0.0.1"]),
    "destino_bloqueado"
  );
  // o resolvedor recebe o nome já normalizado (minúsculas, sem o ponto final)
  const recebidos: string[] = [];
  await conferirDestino(new URL("https://Portal.Exemplo.GOV.br./x"), async (h) => {
    recebidos.push(h);
    return ["200.160.2.3"];
  });
  assert.deepEqual(recebidos, ["portal.exemplo.gov.br"]);
  // IP literal: o IPv6 público entre colchetes não passa pelo DNS; o interno é recusado sem consultar
  let consultas = 0;
  const conta = async () => (consultas++, ["200.160.2.3"]);
  assert.equal(await codigo("https://[2001:4860:4860::8888]/x", conta), "ok");
  assert.equal(await codigo("https://[::1]/x", conta), "destino_bloqueado");
  assert.equal(await codigo("https://127.0.0.1/x", conta), "destino_bloqueado");
  assert.equal(consultas, 0);
});

/** fetch de mentira: um roteiro por URL; registra as chamadas. */
function rede(rotas: Record<string, () => Response | Promise<Response>>) {
  const chamadas: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    chamadas.push({ url: u, init });
    const rota = rotas[u];
    if (!rota) return new Response("nao achei", { status: 404 });
    return await rota();
  }) as typeof fetch;
  return { fetchFn, chamadas };
}
const redireciona =
  (para: string, status = 302) =>
  () =>
    new Response(null, { status, headers: { location: para } });
const erroDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof ErroDownload ? e.codigo : `outro: ${(e as Error)?.message}`;
  }
};

test("baixarUrlPublica: baixa, sem seguir redirecionamento sozinho", async () => {
  const { fetchFn, chamadas } = rede({
    "https://portal.exemplo.gov.br/edital.pdf": () =>
      new Response(PDF, { headers: { "content-type": "application/pdf" } }),
  });
  const r = await baixarUrlPublica("https://portal.exemplo.gov.br/edital.pdf", {
    fetchFn,
    resolverDns: publico,
  });
  assert.deepEqual(r.bytes, PDF);
  assert.equal(r.contentType, "application/pdf");
  assert.equal(r.urlFinal, "https://portal.exemplo.gov.br/edital.pdf");
  assert.equal(r.saltos, 0);
  assert.equal(chamadas[0].init?.redirect, "manual");
  assert.equal(chamadas[0].init?.method, "GET");
});

test("baixarUrlPublica: cada salto é conferido de novo (rede interna, http e limite de 3)", async () => {
  const dns = async (host: string) =>
    host === "interno.exemplo.gov.br" ? ["10.0.0.9"] : ["200.160.2.3"];
  const ok = rede({
    "https://a.exemplo.gov.br/1": redireciona("/2"),
    "https://a.exemplo.gov.br/2": redireciona("https://b.exemplo.gov.br/3", 301),
    "https://b.exemplo.gov.br/3": redireciona("https://b.exemplo.gov.br/arquivo.pdf", 307),
    "https://b.exemplo.gov.br/arquivo.pdf": () => new Response(PDF),
  });
  const r = await baixarUrlPublica("https://a.exemplo.gov.br/1", {
    fetchFn: ok.fetchFn,
    resolverDns: dns,
  });
  assert.equal(r.saltos, 3);
  assert.equal(r.urlFinal, "https://b.exemplo.gov.br/arquivo.pdf");

  const interno = rede({
    "https://a.exemplo.gov.br/1": redireciona("https://interno.exemplo.gov.br/segredo"),
  });
  assert.equal(
    await erroDe(
      baixarUrlPublica("https://a.exemplo.gov.br/1", {
        fetchFn: interno.fetchFn,
        resolverDns: dns,
      })
    ),
    "destino_bloqueado"
  );
  assert.equal(interno.chamadas.length, 1, "o destino interno não foi chamado");

  const semTls = rede({ "https://a.exemplo.gov.br/1": redireciona("http://a.exemplo.gov.br/2") });
  assert.equal(
    await erroDe(
      baixarUrlPublica("https://a.exemplo.gov.br/1", { fetchFn: semTls.fetchFn, resolverDns: dns })
    ),
    "destino_bloqueado"
  );

  const metadados = rede({
    "https://a.exemplo.gov.br/1": redireciona("https://169.254.169.254/latest/meta-data"),
  });
  assert.equal(
    await erroDe(
      baixarUrlPublica("https://a.exemplo.gov.br/1", {
        fetchFn: metadados.fetchFn,
        resolverDns: dns,
      })
    ),
    "destino_bloqueado"
  );

  const voltas = rede({
    "https://a.exemplo.gov.br/1": redireciona("/2"),
    "https://a.exemplo.gov.br/2": redireciona("/3"),
    "https://a.exemplo.gov.br/3": redireciona("/4"),
    "https://a.exemplo.gov.br/4": redireciona("/5"),
    "https://a.exemplo.gov.br/5": () => new Response(PDF),
  });
  assert.equal(
    await erroDe(
      baixarUrlPublica("https://a.exemplo.gov.br/1", {
        fetchFn: voltas.fetchFn,
        resolverDns: dns,
      })
    ),
    "muitos_redirecionamentos"
  );
  assert.equal(voltas.chamadas.length, 4);
});

test("baixarUrlPublica: erro HTTP, vazio, grande demais (declarado e no fluxo) e tempo esgotado", async () => {
  const base = "https://portal.exemplo.gov.br";
  const r = rede({
    [`${base}/vazio`]: () => new Response(new Uint8Array(0)),
    [`${base}/declarado`]: () => new Response(PDF, { headers: { "content-length": "999999" } }),
    [`${base}/fluxo`]: () => new Response(new Uint8Array(5000)),
    [`${base}/lento`]: () => new Promise<Response>(() => {}),
  });
  const opcoes = { fetchFn: r.fetchFn, resolverDns: publico };
  assert.equal(await erroDe(baixarUrlPublica(`${base}/nao-existe`, opcoes)), "http");
  assert.equal(await erroDe(baixarUrlPublica(`${base}/vazio`, opcoes)), "vazio");
  assert.equal(
    await erroDe(baixarUrlPublica(`${base}/declarado`, { ...opcoes, limiteBytes: 1000 })),
    "grande_demais"
  );
  assert.equal(
    await erroDe(baixarUrlPublica(`${base}/fluxo`, { ...opcoes, limiteBytes: 1000 })),
    "grande_demais"
  );
  assert.equal(await erroDe(baixarUrlPublica("http://x.gov.br/a", opcoes)), "url_invalida");
  // o fetch de mentira não olha o sinal: o módulo tem de desistir sozinho quando o prazo passa
  const lento = (async (_u: string | URL | Request, init?: RequestInit) =>
    await new Promise<Response>((_ok, falha) => {
      init?.signal?.addEventListener("abort", () =>
        falha(new DOMException("abortado", "AbortError"))
      );
    })) as typeof fetch;
  assert.equal(
    await erroDe(
      baixarUrlPublica(`${base}/lento`, { fetchFn: lento, resolverDns: publico, tempoMs: 30 })
    ),
    "tempo_esgotado"
  );
});

test("baixarUrlPublica: o fetch recebe o endereço normalizado, GET manual e sem credencial; destino recusado nem é chamado", async () => {
  const { fetchFn, chamadas } = rede({
    "https://portal.exemplo.gov.br/edital.pdf": () => new Response(PDF),
  });
  await baixarUrlPublica("  HTTPS://Portal.Exemplo.GOV.br:443/edital.pdf  ", {
    fetchFn,
    resolverDns: publico,
  });
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, "https://portal.exemplo.gov.br/edital.pdf");
  const init = chamadas[0].init!;
  assert.equal(init.method, "GET");
  assert.equal(init.redirect, "manual");
  assert.ok(init.signal, "o pedido leva o sinal do prazo");
  const cabecalhos = Object.keys((init.headers ?? {}) as Record<string, string>).map((h) =>
    h.toLowerCase()
  );
  for (const proibido of ["authorization", "cookie", "proxy-authorization", "x-api-key"]) {
    assert.ok(!cabecalhos.includes(proibido), proibido);
  }
  assert.equal(init.credentials === undefined || init.credentials === "omit", true);

  // nenhum destino recusado chega ao fetch, em nenhuma das formas
  const recusadas = rede({});
  for (const ruim of [
    "https://127.0.0.1/x",
    "https://2130706433/x",
    "https://0x7f.1/x",
    "https://[::1]/x",
    "https://localhost/x",
    "https://user:pass@portal.exemplo.gov.br/x",
    "https://portal.exemplo.gov.br:8443/x",
    "http://portal.exemplo.gov.br/x",
  ]) {
    const codigo = await erroDe(
      baixarUrlPublica(ruim, { fetchFn: recusadas.fetchFn, resolverDns: publico })
    );
    assert.equal(codigo, "url_invalida", ruim);
  }
  const dnsInterno = await erroDe(
    baixarUrlPublica("https://portal.exemplo.gov.br/x", {
      fetchFn: recusadas.fetchFn,
      resolverDns: async () => ["10.0.0.1", "200.160.2.3"],
    })
  );
  assert.equal(dnsInterno, "destino_bloqueado");
  assert.equal(recusadas.chamadas.length, 0);
});

test("baixarUrlPublica: Location estranho (relativo ao protocolo, credencial, porta, outro esquema, lixo)", async () => {
  const dns = publico;
  const alvo = async (location: string | null) => {
    const r = rede({
      "https://a.exemplo.gov.br/1": () =>
        new Response(null, { status: 302, headers: location === null ? {} : { location } }),
    });
    const codigo = await erroDe(
      baixarUrlPublica("https://a.exemplo.gov.br/1", { fetchFn: r.fetchFn, resolverDns: dns })
    );
    return { codigo, chamadas: r.chamadas.length };
  };
  // vai para a rede interna por um caminho "relativo": conferido como qualquer outro salto
  assert.deepEqual(await alvo("//127.0.0.1/x"), { codigo: "destino_bloqueado", chamadas: 1 });
  assert.deepEqual(await alvo("//[::1]/x"), { codigo: "destino_bloqueado", chamadas: 1 });
  assert.deepEqual(await alvo("https://user:senha@b.exemplo.gov.br/x"), {
    codigo: "destino_bloqueado",
    chamadas: 1,
  });
  assert.deepEqual(await alvo("https://b.exemplo.gov.br:8080/x"), {
    codigo: "destino_bloqueado",
    chamadas: 1,
  });
  assert.deepEqual(await alvo("ftp://b.exemplo.gov.br/x"), {
    codigo: "destino_bloqueado",
    chamadas: 1,
  });
  assert.deepEqual(await alvo("file:///etc/passwd"), { codigo: "destino_bloqueado", chamadas: 1 });
  assert.deepEqual(await alvo("javascript:alert(1)"), { codigo: "destino_bloqueado", chamadas: 1 });
  assert.deepEqual(await alvo("https://b.exemplo.gov.br/" + "a".repeat(2100)), {
    codigo: "destino_bloqueado",
    chamadas: 1,
  });
  // sem Location, ou um Location que nem endereço é: erro de HTTP, não explosão
  assert.deepEqual(await alvo(null), { codigo: "http", chamadas: 1 });
  assert.deepEqual(await alvo("https://[/x"), { codigo: "http", chamadas: 1 });
});

test("baixarUrlPublica: só 301, 302, 303, 307 e 308 são redirecionamento; 300 e 304 são erro HTTP", async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const r = rede({
      "https://a.exemplo.gov.br/1": redireciona("/2", status),
      "https://a.exemplo.gov.br/2": () => new Response(PDF),
    });
    const ok = await baixarUrlPublica("https://a.exemplo.gov.br/1", {
      fetchFn: r.fetchFn,
      resolverDns: publico,
    });
    assert.equal(ok.saltos, 1, String(status));
  }
  for (const status of [300, 304, 305, 306]) {
    const r = rede({
      "https://a.exemplo.gov.br/1": () =>
        new Response(null, { status, headers: { location: "/2" } }),
      "https://a.exemplo.gov.br/2": () => new Response(PDF),
    });
    const codigo = await erroDe(
      baixarUrlPublica("https://a.exemplo.gov.br/1", { fetchFn: r.fetchFn, resolverDns: publico })
    );
    assert.equal(codigo, "http", String(status));
    assert.equal(r.chamadas.length, 1, String(status));
  }
});

/** Corpo gerado sob demanda (sem content-length): conta quanto foi puxado e se o leitor desistiu. */
function corpoEmPedacos(total: number, pedaco = 1024 * 1024) {
  const estado = { puxados: 0, cancelado: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controle) {
      const faltam = total - estado.puxados;
      if (faltam <= 0) {
        controle.close();
        return;
      }
      const n = Math.min(pedaco, faltam);
      estado.puxados += n;
      controle.enqueue(new Uint8Array(n).fill(0x25));
    },
    cancel() {
      estado.cancelado = true;
    },
  });
  return { stream, estado };
}

test("baixarUrlPublica: o limite vale no fluxo (sem content-length, ou com um que mente) e para de ler ao passar", async () => {
  const base = "https://portal.exemplo.gov.br";
  // 1 byte acima do limite, sem content-length: recusa; no limite exato: passa
  const exato = rede({ [`${base}/x`]: () => new Response(new Uint8Array(1000).fill(0x25)) });
  const dentro = await baixarUrlPublica(`${base}/x`, {
    fetchFn: exato.fetchFn,
    resolverDns: publico,
    limiteBytes: 1000,
  });
  assert.equal(dentro.bytes.length, 1000);
  const acima = rede({ [`${base}/x`]: () => new Response(new Uint8Array(1001)) });
  assert.equal(
    await erroDe(
      baixarUrlPublica(`${base}/x`, {
        fetchFn: acima.fetchFn,
        resolverDns: publico,
        limiteBytes: 1000,
      })
    ),
    "grande_demais"
  );
  // content-length pequeno e corpo grande: vale o que chega, não o que o servidor diz
  const mente = rede({
    [`${base}/x`]: () =>
      new Response(new Uint8Array(5000), { headers: { "content-length": "10" } }),
  });
  assert.equal(
    await erroDe(
      baixarUrlPublica(`${base}/x`, {
        fetchFn: mente.fetchFn,
        resolverDns: publico,
        limiteBytes: 1000,
      })
    ),
    "grande_demais"
  );
  // content-length absurdo, ilegível ou negativo não derruba nem libera nada
  for (const valor of ["abc", "-5", "1e400", ""]) {
    const r = rede({
      [`${base}/x`]: () => new Response(PDF, { headers: { "content-length": valor } }),
    });
    const resultado = await erroDe(
      baixarUrlPublica(`${base}/x`, { fetchFn: r.fetchFn, resolverDns: publico })
    );
    assert.ok(resultado === "ok" || resultado === "http", `${valor}: ${resultado}`);
  }

  // o limite da spec (52428800): um byte a mais, fluxo sem content-length → recusa sem juntar o resto
  const grande = corpoEmPedacos(LIMITE_DOWNLOAD + 1);
  const r1 = rede({ [`${base}/x`]: () => new Response(grande.stream) });
  assert.equal(
    await erroDe(baixarUrlPublica(`${base}/x`, { fetchFn: r1.fetchFn, resolverDns: publico })),
    "grande_demais"
  );
  // (o fluxo de 52428801 bytes termina sozinho no último byte: aqui não há o que cancelar)
  assert.ok(grande.estado.puxados <= LIMITE_DOWNLOAD + 2 * 1024 * 1024);

  // um fluxo sem fim (1 GiB, gerado sob demanda) é cortado perto do limite, não lido até o fim
  const sem_fim = corpoEmPedacos(1024 * 1024 * 1024);
  const r2 = rede({ [`${base}/x`]: () => new Response(sem_fim.stream) });
  assert.equal(
    await erroDe(baixarUrlPublica(`${base}/x`, { fetchFn: r2.fetchFn, resolverDns: publico })),
    "grande_demais"
  );
  assert.equal(sem_fim.estado.cancelado, true);
  assert.ok(
    sem_fim.estado.puxados <= LIMITE_DOWNLOAD + 2 * 1024 * 1024,
    String(sem_fim.estado.puxados)
  );
});

test("baixarUrlPublica: o prazo vale mesmo se o fetch, o corpo ou o DNS ignoram o sinal", async () => {
  const base = "https://portal.exemplo.gov.br";
  const prazo = { tempoMs: 30 };
  // fetch que nunca responde e não olha o sinal
  const mudo = (() => new Promise<Response>(() => {})) as typeof fetch;
  assert.equal(
    await erroDe(baixarUrlPublica(`${base}/x`, { fetchFn: mudo, resolverDns: publico, ...prazo })),
    "tempo_esgotado"
  );
  // cabeçalhos chegam, o corpo trava
  const travado = rede({
    [`${base}/x`]: () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            return new Promise(() => {});
          },
        })
      ),
  });
  assert.equal(
    await erroDe(
      baixarUrlPublica(`${base}/x`, { fetchFn: travado.fetchFn, resolverDns: publico, ...prazo })
    ),
    "tempo_esgotado"
  );
  // o DNS que nunca responde
  const naoVai = rede({ [`${base}/x`]: () => new Response(PDF) });
  assert.equal(
    await erroDe(
      baixarUrlPublica(`${base}/x`, {
        fetchFn: naoVai.fetchFn,
        resolverDns: () => new Promise<string[]>(() => {}),
        ...prazo,
      })
    ),
    "tempo_esgotado"
  );
  assert.equal(naoVai.chamadas.length, 0, "sem confirmar o destino, nada é chamado");
  // o prazo é de TODA a operação (os saltos somam), não de cada requisição
  const lentoAoSaltar = (async (url: string | URL | Request) => {
    await new Promise((r) => setTimeout(r, 25));
    return String(url).endsWith("/1")
      ? new Response(null, { status: 302, headers: { location: "/2" } })
      : new Response(PDF);
  }) as typeof fetch;
  assert.equal(
    await erroDe(
      baixarUrlPublica("https://a.exemplo.gov.br/1", {
        fetchFn: lentoAoSaltar,
        resolverDns: publico,
        tempoMs: 40,
      })
    ),
    "tempo_esgotado"
  );
});

test("baixarUrlPublica: falha desconhecida do fetch vira erro de HTTP sem eco da URL, do token nem do texto original", async () => {
  const segredo = "https://portal.exemplo.gov.br/baixar?token=SEGREDO123&id=9";
  const quebra = (async () => {
    throw new TypeError(`error sending request for url (${segredo}): connection refused`);
  }) as typeof fetch;
  try {
    await baixarUrlPublica(segredo, { fetchFn: quebra, resolverDns: publico });
    assert.fail("devia lançar");
  } catch (e) {
    assert.ok(e instanceof ErroDownload);
    assert.equal(e.codigo, "http");
    for (const proibido of [
      "SEGREDO123",
      "token",
      "https://",
      "portal.exemplo.gov.br",
      "refused",
    ]) {
      assert.ok(!e.message.includes(proibido), `${proibido} em ${e.message}`);
    }
    assert.ok(e.message.length > 10);
  }
  // as mensagens dos erros próprios também não repetem a URL pedida
  const ruim = "https://usuario:SEGREDO123@portal.exemplo.gov.br/x";
  try {
    await baixarUrlPublica(ruim, { fetchFn: quebra, resolverDns: publico });
    assert.fail("devia lançar");
  } catch (e) {
    assert.ok(e instanceof ErroDownload);
    assert.ok(!e.message.includes("SEGREDO123"), e.message);
  }
});

test("origemDaUrl: estável e sem expor a URL", async () => {
  const a = await origemDaUrl("https://portal.exemplo.gov.br/edital.pdf");
  assert.match(a, /^url:[0-9a-f]{16}$/);
  assert.equal(a, await origemDaUrl("  https://portal.exemplo.gov.br/edital.pdf "));
  assert.notEqual(a, await origemDaUrl("https://portal.exemplo.gov.br/edital2.pdf"));
  // conferido contra o SHA-256 do node:crypto (os 16 primeiros caracteres hexadecimais)
  const esperado = createHash("sha256")
    .update("https://portal.exemplo.gov.br/edital.pdf")
    .digest("hex");
  assert.equal(a, `url:${esperado.slice(0, 16)}`);
});
