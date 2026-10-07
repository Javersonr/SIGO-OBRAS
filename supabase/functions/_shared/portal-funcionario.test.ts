// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/_shared/portal-funcionario.test.ts
// ou com Deno:                           deno test supabase/functions/_shared/portal-funcionario.test.ts
//
// Só endereços de documentação (RFC 5737 e RFC 3849): nenhum IP real em repositório público.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EVENTO_CERTIFICADO_REVOGADO,
  EVENTO_TENTATIVA_LIBERADA,
  HASH_VERSAO_CANONICO,
  dataBrasilia,
  hashDoCertificado,
  inteiroAleatorioSeguro,
  jsonCanonico,
  origemDaRequisicao,
  registrarEvento,
  sha256Hex,
} from "./portal-funcionario.ts";

const req = (headers: Record<string, string>) =>
  new Request("https://x.supabase.co/functions/v1/portal-funcionario", {
    method: "POST",
    headers,
  });

test("origem: vale a entrada mais à direita do X-Forwarded-For (a da esquerda o cliente forja)", () => {
  const { ip } = origemDaRequisicao(req({ "x-forwarded-for": "198.51.100.7, 203.0.113.9" }));
  assert.equal(ip, "203.0.113.9");
});

test("origem: com vários saltos, ainda vale a última entrada", () => {
  const { ip } = origemDaRequisicao(
    req({ "x-forwarded-for": "198.51.100.7, 192.0.2.44, 203.0.113.9" })
  );
  assert.equal(ip, "203.0.113.9");
});

test("origem: uma entrada só, com espaços e vírgula sobrando", () => {
  assert.equal(
    origemDaRequisicao(req({ "x-forwarded-for": " 203.0.113.9 ,  " })).ip,
    "203.0.113.9"
  );
  assert.equal(origemDaRequisicao(req({ "x-forwarded-for": "203.0.113.9" })).ip, "203.0.113.9");
});

test("origem: sem X-Forwarded-For cai para o x-real-ip", () => {
  assert.equal(origemDaRequisicao(req({ "x-real-ip": "203.0.113.9" })).ip, "203.0.113.9");
  assert.equal(
    origemDaRequisicao(req({ "x-forwarded-for": "  ", "x-real-ip": " 203.0.113.9 " })).ip,
    "203.0.113.9"
  );
});

test("origem: o X-Forwarded-For tem prioridade sobre o x-real-ip", () => {
  const { ip } = origemDaRequisicao(
    req({ "x-forwarded-for": "198.51.100.7, 203.0.113.9", "x-real-ip": "192.0.2.44" })
  );
  assert.equal(ip, "203.0.113.9");
});

test("origem: x-real-ip enorme é gravado cortado em 64 caracteres (T4)", () => {
  const { ip } = origemDaRequisicao(req({ "x-real-ip": "7".repeat(300) }));
  assert.equal(ip?.length, 64);
});

test("origem: sem cabeçalho de IP o endereço é null (cf-connecting-ip é do cliente e não vale)", () => {
  assert.equal(origemDaRequisicao(req({})).ip, null);
  assert.equal(origemDaRequisicao(req({ "cf-connecting-ip": "198.51.100.7" })).ip, null);
});

test("origem: IPv6 fica completo na trilha (não é reduzido ao prefixo /64 do limitador)", () => {
  const { ip } = origemDaRequisicao(
    req({ "x-forwarded-for": "198.51.100.7, 2001:db8:abcd:12:1111:2222:3333:4444" })
  );
  assert.equal(ip, "2001:db8:abcd:12:1111:2222:3333:4444");
  assert.ok(!ip!.includes("/64"));
});

test("origem: user-agent é cortado em 400 caracteres", () => {
  const { dispositivo } = origemDaRequisicao(req({ "user-agent": "a".repeat(500) }));
  assert.equal(dispositivo, "a".repeat(400));
  assert.equal(
    origemDaRequisicao(req({ "user-agent": "Navegador/1.0" })).dispositivo,
    "Navegador/1.0"
  );
});

test("origem: sem user-agent o dispositivo é null", () => {
  assert.equal(origemDaRequisicao(req({})).dispositivo, null);
});

function fakeSupabase(resposta: { message: string } | null = null) {
  const linhas: { tabela: string; linha: Record<string, unknown> }[] = [];
  return {
    linhas,
    from: (tabela: string) => ({
      insert: async (linha: Record<string, unknown>) => {
        linhas.push({ tabela, linha });
        return { error: resposta };
      },
    }),
  };
}

const EVENTO = {
  empresa_id: "empresa-teste",
  funcionario_id: "funcionario-teste",
  evento: "login",
};

test("registrarEvento: a trilha grava o IP mais à direita, não o forjado", async () => {
  const supabase = fakeSupabase();
  await registrarEvento(
    supabase,
    req({
      "x-forwarded-for": "198.51.100.7, 203.0.113.9",
      "user-agent": "Navegador/1.0",
    }),
    EVENTO
  );
  assert.equal(supabase.linhas.length, 1);
  assert.equal(supabase.linhas[0].tabela, "treinamento_evento");
  assert.equal(supabase.linhas[0].linha.ip, "203.0.113.9");
  assert.equal(supabase.linhas[0].linha.dispositivo, "Navegador/1.0");
  assert.equal(supabase.linhas[0].linha.evento, "login");
  assert.equal(supabase.linhas[0].linha.empresa_id, "empresa-teste");
});

test("registrarEvento: evento do servidor não manda origem (vale o default 'servidor' do banco)", async () => {
  const supabase = fakeSupabase();
  await registrarEvento(supabase, req({}), EVENTO);
  assert.equal("origem" in supabase.linhas[0].linha, false);
});

test("registrarEvento: evento relatado pelo navegador grava origem 'navegador'", async () => {
  const supabase = fakeSupabase();
  await registrarEvento(supabase, req({}), { ...EVENTO, evento: "play", origem: "navegador" });
  assert.equal(supabase.linhas[0].linha.origem, "navegador");
  assert.equal(supabase.linhas[0].linha.evento, "play");
});

test("registrarEvento: semOrigem grava sem IP e sem dispositivo (T38, defesa 4: login_falha na trilha da empresa)", async () => {
  const supabase = fakeSupabase();
  const r = await registrarEvento(
    supabase,
    req({ "x-forwarded-for": "198.51.100.7, 203.0.113.9", "user-agent": "Navegador/1.0" }),
    { ...EVENTO, evento: "login_falha", detalhe: { tentativa: 1, bloqueou: false } },
    { semOrigem: true }
  );
  assert.equal(r, true);
  const linha = supabase.linhas[0].linha;
  assert.equal("ip" in linha, false);
  assert.equal("dispositivo" in linha, false);
  assert.equal(linha.evento, "login_falha");
  assert.deepEqual(linha.detalhe, { tentativa: 1, bloqueou: false });
  // sem a opção, continua gravando os dois
  await registrarEvento(supabase, req({ "user-agent": "Navegador/1.0" }), EVENTO);
  assert.equal(supabase.linhas[1].linha.dispositivo, "Navegador/1.0");
});

test("registrarEvento: a origem do evento não vem do detalhe que o navegador manda", async () => {
  const supabase = fakeSupabase();
  await registrarEvento(supabase, req({}), {
    ...EVENTO,
    evento: "play",
    detalhe: { origem: "servidor" },
    origem: "navegador",
  });
  assert.equal(supabase.linhas[0].linha.origem, "navegador");
  assert.deepEqual(supabase.linhas[0].linha.detalhe, { origem: "servidor" });
});

test("registrarEvento: falha ao gravar não derruba a ação principal", async (t) => {
  const erro = t.mock.method(console, "error", () => {});
  const supabase = fakeSupabase({ message: "falhou" });
  await assert.doesNotReject(() => registrarEvento(supabase, req({}), EVENTO));
  assert.equal(erro.mock.callCount(), 1);
});

// --------------------------------------------------------- jsonCanonico / hash do certificado
// Dados sintéticos: nenhum nome, CPF ou empresa reais.

test("jsonCanonico: ordena as chaves, sem espaços", () => {
  assert.equal(jsonCanonico({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(jsonCanonico([]), "[]");
  assert.equal(jsonCanonico({}), "{}");
});

test("jsonCanonico: a ordenação vale em todos os níveis, inclusive dentro de listas", () => {
  const um = {
    z: {
      y: 1,
      x: [
        { d: 1, c: 2 },
        { b: 3, a: 4 },
      ],
    },
    a: null,
  };
  const outro = {
    a: null,
    z: {
      x: [
        { c: 2, d: 1 },
        { a: 4, b: 3 },
      ],
      y: 1,
    },
  };
  assert.equal(jsonCanonico(um), '{"a":null,"z":{"x":[{"c":2,"d":1},{"a":4,"b":3}],"y":1}}');
  assert.equal(jsonCanonico(um), jsonCanonico(outro));
});

test("jsonCanonico: a ordem dos itens de uma lista é preservada (lista não é conjunto)", () => {
  assert.notEqual(jsonCanonico({ a: [1, 2] }), jsonCanonico({ a: [2, 1] }));
});

test("jsonCanonico: valores como no JSON.stringify (undefined some, null fica, texto escapado)", () => {
  assert.equal(
    jsonCanonico({ a: undefined, b: null, c: 1.5, d: true }),
    '{"b":null,"c":1.5,"d":true}'
  );
  assert.equal(jsonCanonico([undefined, 1]), "[null,1]");
  const texto = 'aspas " e \ barra\nlinha';
  assert.equal(jsonCanonico({ t: texto }), JSON.stringify({ t: texto }));
  assert.equal(jsonCanonico("ação — NR-1"), JSON.stringify("ação — NR-1"));
  assert.equal(jsonCanonico(Number.NaN), "null");
});

test("jsonCanonico: o resultado volta a ser o mesmo valor (JSON.parse)", () => {
  const v = { b: [1, { y: "á", x: null }], a: 0.1 + 0.2 };
  assert.deepEqual(JSON.parse(jsonCanonico(v)), v);
});

const CERT = {
  codigo: "ABCD-2345-WXYZ",
  dados: {
    aluno: { nome: "Aluno Teste", cpf: "00000000000", funcao: null },
    curso: { nome: "Curso Teste", carga_horaria_horas: 8, aulas: [{ modulo: "1", titulo: "A" }] },
    periodo: { inicio: "2026-10-01", conclusao: "2026-10-02", validade: "2027-10-02" },
  },
  assinatura: {
    metodo: "senha_pessoal_portal_funcionario",
    assinado_em: "2026-10-02T12:00:00.000Z",
    ip: "203.0.113.9",
    hash_versao: HASH_VERSAO_CANONICO,
  },
};

test("hash do certificado: o mesmo conteúdo com chaves em outra ordem gera o mesmo hash", async () => {
  const embaralhado = {
    assinatura: {
      ip: "203.0.113.9",
      hash_versao: HASH_VERSAO_CANONICO,
      assinado_em: "2026-10-02T12:00:00.000Z",
      metodo: "senha_pessoal_portal_funcionario",
    },
    codigo: CERT.codigo,
    dados: {
      periodo: { validade: "2027-10-02", conclusao: "2026-10-02", inicio: "2026-10-01" },
      curso: { aulas: [{ titulo: "A", modulo: "1" }], carga_horaria_horas: 8, nome: "Curso Teste" },
      aluno: { funcao: null, cpf: "00000000000", nome: "Aluno Teste" },
    },
  };
  const a = await hashDoCertificado(CERT.codigo, CERT.dados, CERT.assinatura);
  const b = await hashDoCertificado(embaralhado.codigo, embaralhado.dados, embaralhado.assinatura);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("hash do certificado: é o SHA-256 do JSON canônico de { codigo, dados, assinatura }", async () => {
  const esperado = await sha256Hex(
    jsonCanonico({ codigo: CERT.codigo, dados: CERT.dados, assinatura: CERT.assinatura })
  );
  assert.equal(await hashDoCertificado(CERT.codigo, CERT.dados, CERT.assinatura), esperado);
});

test("hash do certificado: mudar qualquer campo, o código ou a assinatura muda o hash", async () => {
  const base = await hashDoCertificado(CERT.codigo, CERT.dados, CERT.assinatura);
  const nome = { ...CERT.dados, aluno: { ...CERT.dados.aluno, nome: "Outro Aluno" } };
  assert.notEqual(await hashDoCertificado(CERT.codigo, nome, CERT.assinatura), base);
  assert.notEqual(await hashDoCertificado("ABCD-2345-WXYA", CERT.dados, CERT.assinatura), base);
  const ass = { ...CERT.assinatura, ip: "203.0.113.10" };
  assert.notEqual(await hashDoCertificado(CERT.codigo, CERT.dados, ass), base);
});

test("hash do certificado: sobrevive à ida e volta pelo jsonb (undefined some, chaves reordenadas)", async () => {
  const comUndefined = { ...CERT.dados, aluno: { ...CERT.dados.aluno, extra: undefined } };
  const idaEVolta = JSON.parse(JSON.stringify(comUndefined));
  assert.equal(
    await hashDoCertificado(CERT.codigo, comUndefined, CERT.assinatura),
    await hashDoCertificado(CERT.codigo, idaEVolta, CERT.assinatura)
  );
});

test("registrarEvento: diz se gravou (a prova só abre se o início ficou na trilha)", async (t) => {
  const erro = t.mock.method(console, "error", () => {});
  assert.equal(await registrarEvento(fakeSupabase(), req({}), EVENTO), true);
  assert.equal(await registrarEvento(fakeSupabase({ message: "falhou" }), req({}), EVENTO), false);
  assert.equal(erro.mock.callCount(), 1);
});

// --------------------------------------------------------- inteiroAleatorioSeguro
test("inteiroAleatorioSeguro: sempre dentro de [0, n) e cobre todos os valores", () => {
  for (const n of [1, 2, 3, 4, 7, 15, 100]) {
    const vistos = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = inteiroAleatorioSeguro(n);
      assert.ok(Number.isInteger(v) && v >= 0 && v < n, `n=${n} v=${v}`);
      vistos.add(v);
    }
    if (n <= 15) assert.equal(vistos.size, n, `n=${n}: faltou algum valor em 2000 sorteios`);
  }
  assert.equal(inteiroAleatorioSeguro(1), 0);
});

test("inteiroAleatorioSeguro: sem viés visível (3 valores em 6000 sorteios ficam perto de 2000)", () => {
  const cont = [0, 0, 0];
  for (let i = 0; i < 6000; i++) cont[inteiroAleatorioSeguro(3)]++;
  // desvio-padrão ~ 36: a faixa de 1700 a 2300 é de mais de 8 desvios (o teste não oscila)
  for (const c of cont) assert.ok(c > 1700 && c < 2300, `contagens: ${cont}`);
});

test("inteiroAleatorioSeguro: não aceita n inválido", () => {
  for (const ruim of [0, -1, 1.5, Number.NaN, Infinity, 2 ** 32 + 1]) {
    assert.throws(() => inteiroAleatorioSeguro(ruim), RangeError, String(ruim));
  }
});

// ------------------------------------------- eventos que o RH gera (funcionario-acesso, T18)
test("eventos do RH: nomes combinados com a tela e com o portal", () => {
  assert.equal(EVENTO_TENTATIVA_LIBERADA, "tentativa_liberada");
  assert.equal(EVENTO_CERTIFICADO_REVOGADO, "certificado_revogado");
});

test("eventos do RH: o navegador do aluno não consegue gravar nenhum deles", () => {
  // `tentativa_liberada` zera o intervalo entre tentativas: se o aluno pudesse gravar o evento pela
  // ação `evento` do portal, ele mesmo se liberaria. A lista de eventos aceitos do navegador é o
  // `EVENTOS_CLIENTE` do index.ts (não importável no Node): confere pelo texto.
  const codigo = readFileSync(
    fileURLToPath(new URL("../portal-funcionario/index.ts", import.meta.url)),
    "utf8"
  );
  const inicio = codigo.indexOf("const EVENTOS_CLIENTE = new Set([");
  assert.ok(inicio > 0, "EVENTOS_CLIENTE não encontrado");
  const lista = codigo.slice(inicio, codigo.indexOf("]);", inicio));
  assert.ok(lista.includes('"abrir_aula"'), "a leitura da lista precisa achar os eventos do aluno");
  for (const nome of [EVENTO_TENTATIVA_LIBERADA, EVENTO_CERTIFICADO_REVOGADO]) {
    assert.ok(!lista.includes(`"${nome}"`), `${nome} não pode estar em EVENTOS_CLIENTE`);
  }
});

// ------------------------------------------------------------------ dataBrasilia (T8)
test("dataBrasilia: 23h30 de Brasília (02h30Z do dia seguinte) ainda é o mesmo dia", () => {
  assert.equal(dataBrasilia(new Date("2026-10-06T02:30:00.000Z")), "2026-10-05");
});

test("dataBrasilia: a virada do dia é à meia-noite de Brasília (03h00Z)", () => {
  assert.equal(dataBrasilia(new Date("2026-10-06T02:59:59.999Z")), "2026-10-05");
  assert.equal(dataBrasilia(new Date("2026-10-06T03:00:00.000Z")), "2026-10-06");
});

test("dataBrasilia: dia claro continua no mesmo dia do UTC", () => {
  assert.equal(dataBrasilia(new Date("2026-10-05T15:00:00.000Z")), "2026-10-05");
});

test("dataBrasilia: virada de mês e de ano", () => {
  assert.equal(dataBrasilia(new Date("2026-11-01T02:30:00.000Z")), "2026-10-31");
  assert.equal(dataBrasilia(new Date("2027-01-01T02:59:59.000Z")), "2026-12-31");
  assert.equal(dataBrasilia(new Date("2027-01-01T03:00:00.000Z")), "2027-01-01");
});

test("dataBrasilia: ano bissexto (29/02) e formato AAAA-MM-DD com zeros", () => {
  assert.equal(dataBrasilia(new Date("2028-03-01T02:30:00.000Z")), "2028-02-29");
  assert.equal(dataBrasilia(new Date("2026-03-04T12:00:00.000Z")), "2026-03-04");
});
