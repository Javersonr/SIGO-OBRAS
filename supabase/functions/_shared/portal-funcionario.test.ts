// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/_shared/portal-funcionario.test.ts
// ou com Deno:                           deno test supabase/functions/_shared/portal-funcionario.test.ts
//
// Só endereços de documentação (RFC 5737 e RFC 3849): nenhum IP real em repositório público.
import { test } from "node:test";
import assert from "node:assert/strict";
import { origemDaRequisicao, registrarEvento } from "./portal-funcionario.ts";

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

test("registrarEvento: falha ao gravar não derruba a ação principal", async (t) => {
  const erro = t.mock.method(console, "error", () => {});
  const supabase = fakeSupabase({ message: "falhou" });
  await assert.doesNotReject(() => registrarEvento(supabase, req({}), EVENTO));
  assert.equal(erro.mock.callCount(), 1);
});
