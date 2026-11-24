// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/fornecedor-acesso/regras.test.ts
//
// Regras do fornecedor-acesso (Lote 2b-2): quem pode, o que volta em cada ação e o que vai para a
// auditoria. Dados sintéticos: nenhum nome, e-mail ou identificador real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ACOES_FORNECEDOR_ACESSO,
  BASE_CANONICA,
  baseDoLink,
  decidirCredencial,
  emailNormalizado,
  idValido,
  ipParaAuditoria,
  linkDaCotacao,
  montarLinks,
  podeUsarCotacoes,
  registroDaCredencial,
  registroDoLink,
  statusDosAcessos,
} from "./regras.ts";

const ID = "3f2b8c1e-5d4a-4b6e-9c7d-0a1b2c3d4e5f";
const ID2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const TOKEN = "A".repeat(20) + "b_-" + "9".repeat(20); // 43 caracteres no formato da 0113

const vinculo = (extra: Record<string, unknown> = {}) => ({
  perfil: "Compras",
  is_owner: false,
  ativo: true,
  deleted_at: null,
  permissoes: null,
  ...extra,
});

// ------------------------------------------------------------ ações
test("ações: as quatro combinadas com a tela", () => {
  assert.deepEqual([...ACOES_FORNECEDOR_ACESSO].sort(), [
    "credencial",
    "links",
    "reemitir_link",
    "status",
  ]);
});

// ------------------------------------------------------------ permissão
test("super admin passa mesmo sem vínculo", () => {
  assert.equal(podeUsarCotacoes({ superAdmin: true, vinculo: null }), true);
});

test("sem vínculo, vínculo inativo ou excluído: não passa (nem Admin)", () => {
  assert.equal(podeUsarCotacoes({ superAdmin: false, vinculo: null }), false);
  assert.equal(
    podeUsarCotacoes({ superAdmin: false, vinculo: vinculo({ perfil: "Admin", ativo: false }) }),
    false
  );
  assert.equal(
    podeUsarCotacoes({
      superAdmin: false,
      vinculo: vinculo({ perfil: "Admin", deleted_at: "2026-01-01T00:00:00Z" }),
    }),
    false
  );
});

test("Admin, Admin Holding e dono passam sem permissão marcada", () => {
  for (const extra of [{ perfil: "Admin" }, { perfil: "Admin Holding" }, { is_owner: true }]) {
    assert.equal(podeUsarCotacoes({ superAdmin: false, vinculo: vinculo(extra) }), true);
  }
});

test("aba Cotações de Compras (qualquer função marcada) passa; outra aba ou outro módulo, não", () => {
  const com = (permissoes: unknown) =>
    podeUsarCotacoes({ superAdmin: false, vinculo: vinculo({ permissoes }) });
  assert.equal(com({ Compras: { Cotações: { visualizar: true } } }), true);
  assert.equal(com(JSON.stringify({ Compras: { Cotações: { enviar: true } } })), true); // jsonb-string
  assert.equal(com({ Compras: { Cotações: { visualizar: false } } }), false);
  assert.equal(com({ Compras: { Histórico: { visualizar: true } } }), false);
  assert.equal(com({ Estoque: { Materiais: { editar: true } } }), false);
  assert.equal(com(null), false);
});

// ------------------------------------------------------------ ids
test("idValido: só uuid", () => {
  assert.equal(idValido(ID), true);
  assert.equal(idValido(ID.toUpperCase()), true);
  for (const v of ["", "abc", null, undefined, 123, `${ID}x`, "' or 1=1 --"]) {
    assert.equal(idValido(v), false, String(v));
  }
});

// ------------------------------------------------------------ links
test("baseDoLink: produção e origem desconhecida = endereço com www; dev = a própria origem", () => {
  assert.equal(BASE_CANONICA, "https://www.sigoobras.com.br");
  assert.equal(baseDoLink("https://sigoobras.com.br"), BASE_CANONICA);
  assert.equal(baseDoLink("https://www.sigoobras.com.br"), BASE_CANONICA);
  assert.equal(baseDoLink("https://site-qualquer.example"), BASE_CANONICA);
  assert.equal(baseDoLink(null), BASE_CANONICA);
  assert.equal(baseDoLink("http://localhost:5173"), "http://localhost:5173");
});

test("baseDoLink: as origens de dev são as mesmas do CORS", () => {
  const cors = readFileSync(fileURLToPath(new URL("../_shared/cors.ts", import.meta.url)), "utf8");
  for (const origem of [
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
  ]) {
    assert.ok(cors.includes(`"${origem}"`), origem);
    assert.equal(baseDoLink(origem), origem);
  }
});

test("linkDaCotacao: mesmo caminho que a tela montava; token fora do formato não vira link", () => {
  assert.equal(
    linkDaCotacao(BASE_CANONICA, TOKEN),
    `https://www.sigoobras.com.br/AcessoFornecedor?token=${TOKEN}`
  );
  assert.equal(linkDaCotacao(BASE_CANONICA, null), null);
  assert.equal(linkDaCotacao(BASE_CANONICA, "curto"), null);
  assert.equal(linkDaCotacao(BASE_CANONICA, TOKEN + "&x=1"), null);
});

test("montarLinks: um item por participação, sem devolver o token solto", () => {
  const links = montarLinks(BASE_CANONICA, [
    { id: ID, fornecedor_id: ID2, token: TOKEN },
    { id: ID2, fornecedor_id: ID, token: null },
  ]);
  assert.deepEqual(links, [
    {
      cotacao_fornecedor_id: ID,
      fornecedor_id: ID2,
      link: `${BASE_CANONICA}/AcessoFornecedor?token=${TOKEN}`,
    },
    { cotacao_fornecedor_id: ID2, fornecedor_id: ID, link: null },
  ]);
  assert.ok(links.every((l) => !("token" in l)));
  assert.deepEqual(montarLinks(BASE_CANONICA, null), []);
});

// ------------------------------------------------------------ status
test("statusDosAcessos: primeiro ativo vale; sem ativo, mostra que existe mas inativo; nunca o hash", () => {
  const r = statusDosAcessos(
    [ID, ID2, "sem-acesso", ID],
    [
      { id: "a1", fornecedor_id: ID, fornecedor_email: "inativo@exemplo.test", ativo: false },
      { id: "a2", fornecedor_id: ID, fornecedor_email: "ativo@exemplo.test", ativo: true },
      { id: "a3", fornecedor_id: ID2, fornecedor_email: "velho@exemplo.test", ativo: false },
    ]
  );
  assert.deepEqual(r, [
    { fornecedor_id: ID, email: "ativo@exemplo.test", tem_acesso: true, ativo: true },
    { fornecedor_id: ID2, email: "velho@exemplo.test", tem_acesso: true, ativo: false },
    { fornecedor_id: "sem-acesso", email: null, tem_acesso: false, ativo: false },
  ]);
  for (const item of r) assert.ok(!("senha_acesso" in item));
});

// ------------------------------------------------------------ credencial
test("emailNormalizado: sem espaços e minúsculo; não-texto vira vazio", () => {
  assert.equal(emailNormalizado("  Fulano@Exemplo.TEST "), "fulano@exemplo.test");
  assert.equal(emailNormalizado(null), "");
  assert.equal(emailNormalizado(42), "");
});

test("decidirCredencial: com acesso ativo, troca a senha dele e mantém o e-mail de login", () => {
  assert.deepEqual(
    decidirCredencial({
      acessoAtivo: { id: ID, fornecedor_email: "Login@Exemplo.test" },
      emailDoCadastro: "outro@exemplo.test",
    }),
    { tipo: "rotacionar", acessoId: ID, email: "Login@Exemplo.test" }
  );
});

test("decidirCredencial: sem acesso ativo, cria com o e-mail do cadastro; sem e-mail, nada", () => {
  assert.deepEqual(
    decidirCredencial({ acessoAtivo: null, emailDoCadastro: " Forn@Exemplo.test " }),
    { tipo: "criar", email: "forn@exemplo.test" }
  );
  assert.deepEqual(decidirCredencial({ acessoAtivo: null, emailDoCadastro: "  " }), {
    tipo: "sem_email",
  });
  assert.deepEqual(decidirCredencial({ acessoAtivo: undefined, emailDoCadastro: null }), {
    tipo: "sem_email",
  });
});

// ------------------------------------------------------------ auditoria
const baseRegistro = {
  empresaId: ID,
  chamadorEmail: "compras@exemplo.test",
  fornecedorId: ID2,
  fornecedorNome: "Fornecedor Sintético",
  ip: "203.0.113.7",
  userAgent: "navegador de teste",
};

test("registroDaCredencial: quem, qual fornecedor e qual acesso; nada de senha", () => {
  const r = registroDaCredencial({
    ...baseRegistro,
    acessoId: ID,
    acessoNovo: true,
    status: "sucesso",
  });
  assert.equal(r.empresa_id, ID);
  assert.equal(r.usuario_email, "compras@exemplo.test");
  assert.equal(r.tipo_acao, "senha_portal_fornecedor");
  assert.equal(r.entidade, "fornecedor_acesso");
  assert.equal(r.entidade_id, ID);
  assert.equal(r.entidade_nome, "Fornecedor Sintético");
  assert.equal(r.modulo, "Compras");
  assert.equal(r.status, "sucesso");
  assert.equal(r.mensagem_erro, null);
  assert.equal(r.endereco_ip, "203.0.113.7");
  assert.deepEqual(r.dados_novos, { fornecedor_id: ID2, acesso_novo: true });
  assert.match(r.descricao, /compras@exemplo\.test gerou senha nova/);
  assert.match(r.descricao, /acesso criado agora/);
  assert.doesNotMatch(JSON.stringify(r), /senha_acesso|hash/i);
  // as colunas obrigatórias da audit_log (0002): empresa_id, usuario_email, tipo_acao, entidade, descricao
  for (const k of ["empresa_id", "usuario_email", "tipo_acao", "entidade", "descricao"]) {
    assert.ok(r[k as keyof typeof r], k);
  }
});

test("registroDaCredencial: a falha diz que a senha anterior continua valendo e corta o erro", () => {
  const r = registroDaCredencial({
    ...baseRegistro,
    acessoId: ID,
    acessoNovo: false,
    status: "erro",
    erro: "x".repeat(1000),
  });
  assert.equal(r.status, "erro");
  assert.equal(r.mensagem_erro?.length, 300);
  assert.match(r.descricao, /senha anterior continua valendo/);
});

test("registroDoLink: troca de link registrada com a cotação", () => {
  const r = registroDoLink({
    ...baseRegistro,
    cotacaoFornecedorId: ID,
    cotacaoId: ID2,
    status: "sucesso",
  });
  assert.equal(r.tipo_acao, "link_cotacao_reemitido");
  assert.equal(r.entidade, "cotacao_fornecedor");
  assert.equal(r.entidade_id, ID);
  assert.deepEqual(r.dados_novos, { fornecedor_id: ID2, cotacao_id: ID2 });
  assert.match(r.descricao, /link anterior deixou de valer/);
});

test("ipParaAuditoria: lixo no cabeçalho vira null (a coluna é inet)", () => {
  assert.equal(ipParaAuditoria("2001:db8::/64"), "2001:db8::/64");
  assert.equal(ipParaAuditoria("<script>"), null);
  assert.equal(ipParaAuditoria(null), null);
});

// ------------------------------------------------------------ index.ts (conferência de texto)
const index = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

test("index.ts: identidade só pelo JWT e empresa só da sessão", () => {
  assert.match(index, /usuarioDaRequisicao\(req\)/);
  assert.match(index, /const empresaId = chamador\.empresa_id;/);
  assert.doesNotMatch(index, /body\.empresa_id/);
  assert.doesNotMatch(index, /body\.email/);
});

test("index.ts: toda leitura/gravação de tabela de negócio é filtrada pela empresa", () => {
  const tabelas = index.match(/\.from\("(\w+)"\)/g) ?? [];
  assert.ok(tabelas.length > 0);
  // cada bloco .from("x") que não é audit_log tem um .eq("empresa_id", empresaId) antes do próximo .from
  const blocos = index.split(/\.from\("/).slice(1);
  for (const bloco of blocos) {
    const tabela = bloco.slice(0, bloco.indexOf('"'));
    if (tabela === "audit_log") continue;
    if (tabela === "fornecedor_acesso" && /^fornecedor_acesso"\)\.insert\(\{/.test(bloco)) {
      assert.match(bloco, /empresa_id: empresaId/);
      continue;
    }
    assert.match(bloco.split(";")[0], /\.eq\("empresa_id", empresaId\)/, tabela);
  }
});

test("index.ts: a senha nunca vai para o registro de auditoria nem para o log", () => {
  assert.doesNotMatch(index, /registroDaCredencial\([^)]*\b(senha|hash)\b/);
  // nenhum console.* recebe a variável da senha ou do hash como argumento
  assert.doesNotMatch(index, /console\.\w+\([^)]*,\s*(senha|hash)\b/);
});

test("index.ts: o rastro é gravado ANTES da senha nova", () => {
  const rastro = index.indexOf('registroDaCredencial({ ...dadosDoRegistro, status: "sucesso" })');
  const gravar = index.indexOf(".update({ senha_acesso: hash })");
  assert.ok(rastro > 0 && gravar > 0 && rastro < gravar);
  const rastroLink = index.indexOf('registroDoLink({ ...dadosDoLink, status: "sucesso" })');
  const trocaLink = index.indexOf(".update({ token: null })");
  assert.ok(rastroLink > 0 && trocaLink > 0 && rastroLink < trocaLink);
});
