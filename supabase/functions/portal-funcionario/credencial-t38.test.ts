// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/credencial-t38.test.ts
//
// Guarda da T38 (um login em mais de uma empresa). As regras estão em `_shared/portal-credencial.ts` e são testadas
// em `portal-credencial.test.ts`; os `index.ts` não são importáveis no Node (Deno.serve, imports de URL), então aqui
// se confere pelo TEXTO do código que eles USAM as regras e não voltam ao modelo antigo:
//   - nenhuma consulta ao vínculo lê ou grava as colunas que a 0146 apaga (o código tem de rodar antes e depois dela);
//   - o login faz as 4 comparações antes de decidir e a etapa da provisória não diz se há senha (defesas 2 e R10);
//   - a senha errada vai à trilha sem IP (defesa 4) e o resto da credencial só ao registro do operador (defesa 5);
//   - o 409 que revelava o CPF em outra empresa saiu do funcionario-acesso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLUNAS_CREDENCIAL, COLUNAS_VINCULO } from "../_shared/portal-credencial.ts";

const semComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const portal = semComentarios(readFileSync(new URL("./index.ts", import.meta.url), "utf8"));
const acesso = semComentarios(
  readFileSync(new URL("../funcionario-acesso/index.ts", import.meta.url), "utf8")
);

/** Colunas do vínculo que a 0146 apaga (foram para a credencial). */
const COLUNAS_QUE_SAEM = [
  "usuario",
  "senha_hash",
  "senha_provisoria",
  "tentativas",
  "bloqueado_ate",
  "ultimo_sinal_em",
];

/** Cada consulta a uma tabela: do `.from("<tabela>")` até o fim da instrução (`;`). */
function consultas(codigo: string, tabela: string): string[] {
  const achadas: string[] = [];
  let i = codigo.indexOf(`.from("${tabela}")`);
  while (i >= 0) {
    const fim = codigo.indexOf(";", i);
    achadas.push(codigo.slice(i, fim < 0 ? undefined : fim));
    i = codigo.indexOf(`.from("${tabela}")`, i + 1);
  }
  return achadas;
}

/** O trecho de uma ação: do `if (body.acao === "<nome>")` até o próximo `// ----` de seção. */
function trechoDaAcao(codigo: string, nome: string): string {
  const inicio = codigo.indexOf(`if (body.acao === "${nome}")`);
  assert.ok(inicio >= 0, `ação ${nome} não encontrada`);
  const resto = codigo.slice(inicio + 10);
  const proximo = resto.search(/\n {4}(?:if \(body\.acao === |\/\/ -{5,})/);
  return codigo.slice(inicio, proximo >= 0 ? inicio + 10 + proximo : undefined);
}

test("as colunas lidas do vínculo e da credencial não incluem as que a 0146 apaga do vínculo", () => {
  const vinculo = COLUNAS_VINCULO.split(",").map((c) => c.trim());
  for (const coluna of COLUNAS_QUE_SAEM) assert.equal(vinculo.includes(coluna), false, coluna);
  const credencial = COLUNAS_CREDENCIAL.split(",").map((c) => c.trim());
  for (const coluna of [
    "usuario",
    "senha_hash",
    "tentativas",
    "bloqueado_ate",
    "ultimo_sinal_em",
  ]) {
    assert.ok(credencial.includes(coluna), coluna);
  }
});

test("nenhuma consulta ao vínculo usa select(*) nem as colunas que a 0146 apaga (portal e funcionario-acesso)", () => {
  for (const [nome, codigo] of [
    ["portal-funcionario", portal],
    ["funcionario-acesso", acesso],
  ] as const) {
    const lista = consultas(codigo, "funcionario_portal_acesso");
    assert.ok(lista.length >= 3, `${nome}: esperava achar as consultas ao vínculo`);
    for (const c of lista) {
      assert.equal(/select\(\s*"\*"/.test(c), false, `${nome}: ${c.slice(0, 120)}`);
      for (const coluna of COLUNAS_QUE_SAEM) {
        assert.equal(
          new RegExp(`\\b${coluna}\\b`).test(c),
          false,
          `${nome} usa ${coluna}: ${c.slice(0, 160)}`
        );
      }
    }
  }
});

test("o login lê a pessoa, faz as 4 comparações e só então decide (o tempo não diz o que existe)", () => {
  const login = trechoDaAcao(portal, "login");
  const leitura = login.indexOf("lerPessoaDoBanco(supabase, { usuario })");
  const conferencia = login.indexOf("conferirLogin({");
  const decisao = login.indexOf("decidirLogin({");
  assert.ok(leitura > 0 && conferencia > leitura && decisao > conferencia);
  // entre a leitura e a conferência, só a saída por leitura que falhou (503)
  const meio = login.slice(leitura, conferencia);
  assert.equal([...meio.matchAll(/return /g)].length, 1);
  assert.match(meio, /if \(!lida\.ok\) return fail\(MSG_SEM_LEITURA, 503\)/);
  // o comparador só aceita bcrypt (outro formato paga o fictício)
  assert.match(login, /comparar: compararSenha/);
  assert.match(portal, /const compararSenha = criarComparador\(/);
  // o limitador do login continua antes de tudo
  assert.ok(login.indexOf("consumirTentativa(") < leitura);
});

test("a etapa da senha provisória é a mesma com e sem senha: nada de tem_senha (defesa 2)", () => {
  assert.equal(/tem_senha/.test(portal), false);
  const login = trechoDaAcao(portal, "login");
  const etapa = login.slice(login.indexOf('etapa: "senha_provisoria"'));
  const resposta = etapa.slice(0, etapa.indexOf("});"));
  const chaves = [...resposta.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
  assert.deepEqual(chaves, ["etapa", "token_ativacao", "empresa"]);
});

test("a senha errada vai à trilha sem IP (defesa 4); a credencial só ao registro do operador (defesa 5)", () => {
  assert.match(
    portal,
    /eventosDaFalhaDeLogin\(\{[\s\S]{0,300}\}\),\s*\{ semOrigemNaTrilha: true \}/
  );
  assert.match(
    portal,
    /registrarEvento\(supabase, req, e, \{ semOrigem: !!opcoes\.semOrigemNaTrilha \}\)/
  );
  assert.match(
    portal,
    /registrarEventoDaCredencial\(supabase, req, \{ credencial_id: credencialId, \.\.\.e \}\)/
  );
  // os eventos da ativação e da recusa saem da regra pura (a trilha da empresa é a mesma nas três formas)
  const ativar = trechoDaAcao(portal, "ativar");
  for (const forma of ["senha_nova", "senha_atual", "troca"]) {
    assert.match(ativar, new RegExp(`eventosDaAtivacao\\(\\{[\\s\\S]{0,40}forma: "${forma}"`));
  }
  assert.match(ativar, /eventoDoResetRecusado\(item\)/);
  assert.match(ativar, /podeCriarSenhaNova\(\{ credencial, vinculo: item\.vinculo \}\)/);
  assert.match(ativar, /exigeTrocaNaAtivacao\(\{ credencial, empresaId: empresaDaProvisoria \}\)/);
  // nenhum nome de evento do operador é gravado à mão na trilha
  for (const doOperador of [
    "senha_criada",
    "reset_recusado",
    "acesso_confirmado",
    "credencial_bloqueada",
  ]) {
    assert.equal(portal.includes(`"${doOperador}"`), false, doOperador);
  }
});

test("a sessão é conferida por sessaoValida e o relógio e os limites são da pessoa (credencial)", () => {
  assert.match(portal, /const sessaoConferida = sessaoValida\(\{/);
  assert.match(portal, /payload\.scope !== ESCOPO_SESSAO/);
  // nada mais lê a linha antiga do acesso com "acesso."
  assert.equal(
    /\bacesso\.(senha_hash|usuario|ultimo_sinal_em|senha_provisoria|sessao_versao)/.test(portal),
    false
  );
  // a trava TROCAR_SENHA saiu: o primeiro acesso é a etapa "ativar"
  assert.equal(portal.includes("TROCAR_SENHA"), false);
  // a troca de senha exige sempre a senha atual
  const troca = trechoDaAcao(portal, "trocar_senha");
  assert.match(troca, /if \(!body\.senha_atual\) return fail\("Informe a sua senha atual", 400\)/);
  assert.match(troca, /\.from\("portal_credencial"\)/);
});

test("trocar de empresa: só vínculo liberado da credencial, e o token novo vence junto com o de origem", () => {
  const trecho = trechoDaAcao(portal, "empresas");
  assert.match(trecho, /outrosVinculosLiberados\(\{/);
  assert.match(trecho, /ttlDaTroca\(\{ expOrigem: payload\.exp/);
  assert.match(trecho, /entrarComSenha\(lida\.credencial, item, ttl\)/);
  const escolha = trechoDaAcao(portal, "escolher_empresa");
  assert.match(escolha, /credencial\.sessao_versao !== escolha\.vc/);
  assert.match(escolha, /escolha\.scope !== ESCOPO_ESCOLHA/);
});

test("funcionario-acesso: o 409 que revelava o CPF em outra empresa saiu; criar e redefinir usam as regras", () => {
  assert.equal(/já está em uso/.test(acesso), false);
  const criar = acesso.slice(acesso.indexOf('if (body.acao === "criar")'));
  assert.match(criar, /usuarioDoAcesso\(\{ cpf: func\.cpf, usuarioInformado: body\.usuario \}\)/);
  assert.match(criar, /decidirCriarVinculo\(\{/);
  assert.match(criar, /return ok\(respostaDoCriar\(\{ usuario: usuario\.usuario, senha \}\)\)/);
  assert.match(criar, /\.\.\.provisoriaNova\(Date\.now\(\)\)/);
  const redefinir = acesso.slice(acesso.indexOf('if (body.acao === "redefinir")'));
  assert.match(redefinir, /alvoDaRedefinicao\(\{/);
  assert.match(redefinir, /efeitoDaRedefinicao\(\{/);
  // o RH de uma empresa não mexe no bloqueio nem na senha da pessoa
  const ateAtivo = redefinir.slice(0, redefinir.indexOf('if (body.acao === "ativo")'));
  assert.equal(/\.from\("portal_credencial"\)\s*\.update\(/.test(ateAtivo), false);
  const status = acesso.slice(acesso.indexOf('if (acao === "status")'));
  assert.match(status, /statusDoVinculo\(\{/);
});
