// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/fornecedor-acesso/envio-senha.test.ts
//
// Envio da senha do Portal do Fornecedor pelo WhatsApp do SIGO (decisão do dono, 24/11): a ordem (envia antes
// de gravar; envio falho não troca nada), cada motivo, o texto, a máscara, o freio igual ao do enviar-whatsapp e
// que nenhuma resposta leva a senha, o hash ou o número inteiro. Dados sintéticos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CanalNaoConfiguradoError } from "../_shared/whatsapp-envio.ts";
import {
  FREIO_WHATSAPP,
  MENSAGENS_DO_MOTIVO,
  enderecoDoLoginDoPortal,
  MAX_NOME_NA_MENSAGEM,
  enviarSenhaDoFornecedor,
  limparNome,
  limitesDoFreio,
  mascararNumero,
  textoDaSenha,
  type DepsDoEnvio,
} from "./envio-senha.ts";
import { BASE_CANONICA, podeEnviarSenha } from "./regras.ts";

const EMPRESA = "3f2b8c1e-5d4a-4b6e-9c7d-0a1b2c3d4e5f";
const FORN = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SENHA = "SenhaSint3tica";
const HASH = "$2a$10$hash-sintetico";
const NUMERO = "5511999990000";

/** Dependências de mentira que anotam a ordem das chamadas. */
function deps(
  extra: Partial<DepsDoEnvio> = {},
  base: { ativos?: { id: string; fornecedor_email?: string | null }[] } = {}
) {
  const passos: string[] = [];
  const auditoria: Record<string, unknown>[] = [];
  const enviados: { numero: string; texto: string }[] = [];
  const d: DepsDoEnvio = {
    fornecedor: async () => (
      passos.push("fornecedor"),
      {
        id: FORN,
        nome_razao: "Fornecedor Sintético",
        email: "Forn@Exemplo.test",
        telefone: "(11) 99999-0000",
      }
    ),
    acessosAtivos: async () => (passos.push("acessos"), base.ativos ?? []),
    nomeDaEmpresa: async () => "Empresa Sintética",
    consumirFreio: async () => (passos.push("freio"), { permitido: true }),
    auditar: async (linha) => (passos.push("auditar:" + linha.status), auditoria.push(linha), null),
    gerarSenha: () => (passos.push("gerar"), SENHA),
    enviar: async (numero, texto) => {
      passos.push("enviar");
      enviados.push({ numero, texto });
    },
    canalNaoConfigurado: (e) => e instanceof CanalNaoConfiguradoError,
    hash: async () => (passos.push("hash"), HASH),
    novoId: () => "11111111-2222-4333-8444-555555555555",
    criarAcesso: async () => (passos.push("criar"), null),
    trocarTodas: async () => (passos.push("trocar"), { erro: null, trocados: 1 }),
    ...extra,
  };
  return { d, passos, auditoria, enviados };
}

const entrada = {
  empresaId: EMPRESA,
  chamadorEmail: "compras@exemplo.test",
  fornecedorId: FORN,
  base: BASE_CANONICA,
  ip: "203.0.113.7",
  userAgent: "teste",
};

/** Nada de senha, hash ou número inteiro no que sai da função (resposta e auditoria). */
function semSegredo(obj: unknown) {
  const s = JSON.stringify(obj);
  assert.doesNotMatch(s, new RegExp(SENHA));
  assert.doesNotMatch(s, /hash-sintetico/);
  assert.doesNotMatch(s, new RegExp(NUMERO));
}

// ------------------------------------------------------------ caminho feliz e ordem
test("acesso novo: freio → rastro → gera → ENVIA → grava (cria e troca todas) → sucesso", async () => {
  const { d, passos, auditoria, enviados } = deps();
  const r = await enviarSenhaDoFornecedor(d, entrada);
  assert.deepEqual(r, {
    tipo: "ok",
    corpo: { enviado: true, destino: "5511*****0000", login: "forn@exemplo.test" },
  });
  assert.deepEqual(passos, [
    "fornecedor",
    "acessos",
    "freio",
    "auditar:iniciado",
    "gerar",
    "enviar",
    "hash",
    "criar",
    "trocar",
    "auditar:sucesso",
  ]);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].numero, NUMERO);
  assert.match(enviados[0].texto, new RegExp(SENHA)); // a senha só vai para o canal
  semSegredo(r);
  semSegredo(auditoria);
  assert.equal((auditoria[1].dados_novos as Record<string, unknown>).destino, "5511*****0000");
});

test("acesso existente: troca todas as linhas ativas, sem criar; login do acesso normalizado", async () => {
  const { d, passos } = deps(
    {},
    { ativos: [{ id: "a1", fornecedor_email: " Login@Exemplo.TEST" }] }
  );
  const r = await enviarSenhaDoFornecedor(d, entrada);
  assert.equal(r.tipo === "ok" && r.corpo.enviado && r.corpo.login, "login@exemplo.test");
  assert.ok(!passos.includes("criar"));
  assert.ok(passos.indexOf("enviar") < passos.indexOf("trocar"));
});

// ------------------------------------------------------------ motivos antes de qualquer troca
test("fornecedor de outra empresa ou inexistente: não encontrado, nada enviado", async () => {
  const { d, passos } = deps({ fornecedor: async () => null });
  assert.deepEqual(await enviarSenhaDoFornecedor(d, entrada), { tipo: "nao_encontrado" });
  assert.ok(!passos.includes("enviar"));
});

const naoMudouNada = (passos: string[]) => {
  for (const p of ["gerar", "enviar", "hash", "criar", "trocar"]) assert.ok(!passos.includes(p), p);
};

test("SEM_EMAIL: sem e-mail no acesso nem no cadastro", async () => {
  const { d, passos } = deps({
    fornecedor: async () => ({ id: FORN, nome_razao: "F", email: "  ", telefone: "11999990000" }),
  });
  const r = await enviarSenhaDoFornecedor(d, entrada);
  assert.deepEqual(r, {
    tipo: "ok",
    corpo: { enviado: false, motivo: "SEM_EMAIL", mensagem: MENSAGENS_DO_MOTIVO.SEM_EMAIL },
  });
  naoMudouNada(passos);
  assert.ok(!passos.includes("freio"));
});

test("SEM_TELEFONE: telefone ausente ou inválido no cadastro", async () => {
  for (const telefone of [null, "", "123", "abc"]) {
    const { d, passos } = deps({
      fornecedor: async () => ({ id: FORN, nome_razao: "F", email: "f@exemplo.test", telefone }),
    });
    const r = await enviarSenhaDoFornecedor(d, entrada);
    assert.equal(r.tipo === "ok" && !r.corpo.enviado && r.corpo.motivo, "SEM_TELEFONE");
    naoMudouNada(passos);
  }
});

test("LIMITE: freio estourou; CANAL_INDISPONIVEL: limitador fora do ar NEGA", async () => {
  const lim = deps({ consumirFreio: async () => ({ permitido: false }) });
  const r1 = await enviarSenhaDoFornecedor(lim.d, entrada);
  assert.equal(r1.tipo === "ok" && !r1.corpo.enviado && r1.corpo.motivo, "LIMITE");
  naoMudouNada(lim.passos);
  const fora = deps({ consumirFreio: async () => ({ permitido: false, indisponivel: true }) });
  const r2 = await enviarSenhaDoFornecedor(fora.d, entrada);
  assert.equal(r2.tipo === "ok" && !r2.corpo.enviado && r2.corpo.motivo, "CANAL_INDISPONIVEL");
  naoMudouNada(fora.passos);
});

test("SEM_RASTRO: sem a linha 'iniciado' na auditoria, nada é gerado nem enviado", async () => {
  const { d, passos } = deps({ auditar: async () => "audit_log fora do ar" });
  const r = await enviarSenhaDoFornecedor(d, entrada);
  assert.equal(r.tipo === "ok" && !r.corpo.enviado && r.corpo.motivo, "SEM_RASTRO");
  naoMudouNada(passos);
});

// ------------------------------------------------------------ envio falho não troca nada
test("envio falhou (Evolution): FALHA_NO_ENVIO, nada é gravado, auditoria 'erro' sem o texto", async () => {
  const { d, passos, auditoria } = deps({
    enviar: async () => {
      throw new Error(`Evolution 500: corpo que ecoa ${SENHA}`);
    },
  });
  const r = await enviarSenhaDoFornecedor(d, entrada);
  assert.equal(r.tipo === "ok" && !r.corpo.enviado && r.corpo.motivo, "FALHA_NO_ENVIO");
  for (const p of ["hash", "criar", "trocar"]) assert.ok(!passos.includes(p), p);
  assert.deepEqual(
    auditoria.map((a) => a.status),
    ["iniciado", "erro"]
  );
  assert.equal(auditoria[1].mensagem_erro, "Evolution 500");
  assert.match(String(auditoria[1].descricao), /a senha anterior continua valendo/);
  semSegredo(auditoria);
  semSegredo(r);
});

test("canal não configurado: CANAL_INDISPONIVEL, nada é gravado", async () => {
  const { d, passos } = deps({
    enviar: async () => {
      throw new CanalNaoConfiguradoError();
    },
  });
  const r = await enviarSenhaDoFornecedor(d, entrada);
  assert.equal(r.tipo === "ok" && !r.corpo.enviado && r.corpo.motivo, "CANAL_INDISPONIVEL");
  for (const p of ["hash", "criar", "trocar"]) assert.ok(!passos.includes(p), p);
});

// ------------------------------------------------------------ envio aceito, gravação falhou
test("FALHA_AO_GRAVAR: a mensagem saiu mas a gravação falhou; auditoria 'erro' na gravação", async () => {
  for (const extra of [
    { trocarTodas: async () => ({ erro: "banco fora", trocados: 0 }) },
    { trocarTodas: async () => ({ erro: null, trocados: 0 }) },
    { criarAcesso: async () => "insert recusado" },
    {
      hash: async () => {
        throw new Error("bcrypt");
      },
    },
  ] as Partial<DepsDoEnvio>[]) {
    const { d, passos, auditoria } = deps(extra);
    const r = await enviarSenhaDoFornecedor(d, entrada);
    assert.equal(r.tipo === "ok" && !r.corpo.enviado && r.corpo.motivo, "FALHA_AO_GRAVAR");
    assert.ok(passos.includes("enviar"));
    assert.equal(auditoria.at(-1)?.status, "erro");
    assert.match(String(auditoria.at(-1)?.descricao), /não foi gravada/);
    semSegredo(r);
    semSegredo(auditoria);
  }
});

test("cada motivo tem mensagem em linguagem simples", () => {
  for (const [motivo, msg] of Object.entries(MENSAGENS_DO_MOTIVO)) {
    assert.ok(msg.length > 20, motivo);
  }
  assert.match(MENSAGENS_DO_MOTIVO.FALHA_AO_GRAVAR, /Envie uma senha nova/);
});

// ------------------------------------------------------------ texto, endereço e máscara
test("textoDaSenha: empresa, fornecedor, endereço de login, login, senha e o aviso de mensagem automática", () => {
  const t = textoDaSenha({
    empresa: "Empresa Sintética",
    fornecedor: "Fornecedor Sintético",
    enderecoLogin: enderecoDoLoginDoPortal(BASE_CANONICA),
    login: "forn@exemplo.test",
    senha: SENHA,
  });
  assert.match(t, /Fornecedor Sintético/);
  assert.match(t, /Empresa Sintética/);
  assert.match(t, /https:\/\/www\.sigoobras\.com\.br\/FornecedorLogin/);
  assert.match(t, /Login: forn@exemplo\.test/);
  assert.match(t, new RegExp(`Senha: ${SENHA}`));
  assert.match(t, /Mensagem automática do SIGO Obras/);
  assert.match(t, /não recebe respostas/);
  assert.match(t, /fale com o comprador/);
  assert.ok(t.length < 600);
  assert.doesNotMatch(t, /#|\[|\]\(|```/); // sem markdown além do *negrito* do WhatsApp
});

test("o endereço de login é a página do portal do fornecedor que existe no front", () => {
  const paginas = readFileSync(
    fileURLToPath(new URL("../../../apps/web/src/pages.config.js", import.meta.url)),
    "utf8"
  );
  assert.match(paginas, /FornecedorLogin:/);
  assert.equal(
    enderecoDoLoginDoPortal("http://localhost:5173"),
    "http://localhost:5173/FornecedorLogin"
  );
});

const irmao = readFileSync(
  fileURLToPath(new URL("../enviar-whatsapp/index.ts", import.meta.url)),
  "utf8"
);

test("mascararNumero: o mesmo formato do enviar-whatsapp", () => {
  assert.equal(mascararNumero(NUMERO), "5511*****0000");
  assert.equal(mascararNumero("123"), "****");
  assert.ok(
    irmao.includes(
      'return n.length > 8 ? n.slice(0, 4) + "*".repeat(n.length - 8) + n.slice(-4) : "****";'
    )
  );
});

test("freio: escopo, janela, chaves e tetos IGUAIS aos do enviar-whatsapp (somam no mesmo limite)", () => {
  assert.match(irmao, /"enviar-whatsapp",\s*JANELA_SEG,/);
  assert.match(irmao, new RegExp(`const JANELA_SEG = 60 \\* 60;`));
  assert.match(irmao, new RegExp(`const MAX_POR_USUARIO = ${FREIO_WHATSAPP.maxPorUsuario};`));
  assert.match(irmao, new RegExp(`const MAX_POR_EMPRESA = ${FREIO_WHATSAPP.maxPorEmpresa};`));
  assert.match(irmao, /valor: `usuario:\$\{usuario\.email\}`/);
  assert.match(irmao, /`empresa:\$\{usuario\.empresa_id\}`/);
  assert.match(irmao, /falharFechado: true/);
  assert.equal(FREIO_WHATSAPP.escopo, "enviar-whatsapp");
  assert.equal(FREIO_WHATSAPP.janelaSeg, 3600);
  assert.deepEqual(limitesDoFreio("compras@exemplo.test", EMPRESA), [
    { tipo: "conta", valor: "usuario:compras@exemplo.test", max: 60 },
    { tipo: "conta", valor: `empresa:${EMPRESA}`, max: 300 },
  ]);
});

// ------------------------------------------------------------ permissão do envio
test("podeEnviarSenha: Cotações → enviar, Admin, Admin Holding, dono e super admin; só visualizar não", () => {
  const v = (extra: Record<string, unknown>) => ({
    perfil: "Compras",
    is_owner: false,
    ativo: true,
    deleted_at: null,
    permissoes: null,
    ...extra,
  });
  const pode = (vinculo: Record<string, unknown> | null, superAdmin = false) =>
    podeEnviarSenha({ superAdmin, vinculo });
  assert.equal(pode(null, true), true);
  assert.equal(pode(v({ perfil: "Admin" })), true);
  assert.equal(pode(v({ perfil: "Admin Holding" })), true);
  assert.equal(pode(v({ is_owner: true })), true);
  assert.equal(pode(v({ permissoes: { Compras: { Cotações: { enviar: true } } } })), true);
  assert.equal(
    pode(v({ ativo: null, permissoes: { Compras: { Cotações: { enviar: true } } } })),
    true
  );
  assert.equal(
    pode(v({ permissoes: { Compras: { Cotações: { visualizar: true, editar: true } } } })),
    false
  );
  assert.equal(pode(v({ ativo: false, perfil: "Admin" })), false);
  assert.equal(pode(null), false);
});

test("a tela exige a mesma função para Enviar aos Fornecedores", () => {
  const compras = readFileSync(
    fileURLToPath(new URL("../../../apps/web/src/pages/Compras.jsx", import.meta.url)),
    "utf8"
  );
  assert.match(compras, /temPermissao\("Compras", "Cotações", "enviar"\)/);
});

// ------------------------------------------------------------ index.ts (conferência de texto)
const index = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

test("index.ts: nenhuma resposta devolve credencial/senha; enviar_senha exige podeEnviarSenha", () => {
  assert.doesNotMatch(index, /credencial:\s*\{/);
  assert.doesNotMatch(index, /ok\(\{[^}]*\bsenha\b/);
  assert.match(index, /podeEnviarSenha\(\{ superAdmin: chamador\.is_super_admin, vinculo \}\)/);
  assert.match(
    index,
    /consumirTentativa\(supabase, FREIO_WHATSAPP\.escopo, FREIO_WHATSAPP\.janelaSeg/
  );
  // nada de senha, hash ou número em console.*
  assert.doesNotMatch(index, /console\.\w+\([^)]*\b(senha|hash|numero|texto|telefone)\b/);
});

// ------------------------------------------------------------ nomes limpos na mensagem (2ª revisão)
test("limparNome: tira quebras de linha, controles e o * do negrito; junta espaços; corta em 80", () => {
  assert.equal(limparNome("  Fornecedor\n\nSintético\tLtda  "), "Fornecedor Sintético Ltda");
  assert.equal(limparNome("A\u0000B\u0007C" + String.fromCharCode(0x2028) + "D"), "A B C D");
  assert.equal(limparNome("*Promoção* clique aqui"), "Promoção clique aqui");
  assert.equal(limparNome(null), "");
  assert.equal(limparNome(undefined), "");
  const longo = "x".repeat(200);
  assert.equal(limparNome(longo).length, MAX_NOME_NA_MENSAGEM);
  assert.equal(MAX_NOME_NA_MENSAGEM, 80);
});

test("textoDaSenha usa os nomes limpos: nome do cadastro não cria linhas nem quebra o texto", () => {
  const t = textoDaSenha({
    empresa: "Empresa\nSintética " + "y".repeat(150),
    fornecedor: "Fornecedor\r\nLINHA FALSA: senha 123\n*negrito*",
    enderecoLogin: enderecoDoLoginDoPortal(BASE_CANONICA),
    login: "forn@exemplo.test",
    senha: SENHA,
  });
  const linhas = t.split("\n");
  assert.equal(linhas[0], "Olá, Fornecedor LINHA FALSA: senha 123 negrito!");
  assert.ok(!linhas.some((l) => l.startsWith("LINHA FALSA")));
  for (const l of linhas) assert.ok(!l.includes("y".repeat(81)), "nome da empresa cortado");
  assert.equal(linhas.length, 10);
});

test("textoDaSenha: nomes vazios depois da limpeza caem no padrão", () => {
  const t = textoDaSenha({
    empresa: "\n\n",
    fornecedor: " * ",
    enderecoLogin: "https://www.sigoobras.com.br/FornecedorLogin",
    login: "f@exemplo.test",
    senha: SENHA,
  });
  assert.match(t, /^Olá, fornecedor!/);
  assert.match(t, /de \*a empresa\*/);
});
