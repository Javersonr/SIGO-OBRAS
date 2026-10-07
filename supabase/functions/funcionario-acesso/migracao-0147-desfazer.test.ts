// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/funcionario-acesso/migracao-0147-desfazer.test.ts
//
// Guarda do plano de emergência da 0147 (T33, revisão 2): tools/desfazer-permissoes-ead.sql tem de desfazer TUDO o que a
// migração faz. O bloco "PARA DESFAZER" do cabeçalho da 0147 ficou abreviado ("e nas outras 7 tabelas", "recriar como
// na 0130") e, rodado como estava escrito, deixava no ar 7 dos 8 triggers zz_permissao_ead, as policies de tentativa e
// de evento e as de UPDATE e DELETE do Storage: quem operava achava que tinha voltado ao estado de antes. Não há
// Postgres no PC; este teste lê os dois arquivos e acusa o que a migração cria, troca ou tira sem uma linha
// correspondente no desfazer:
//   * todo trigger e toda policy criados na 0147 têm o drop (if exists);
//   * toda função nova tem o drop com a assinatura certa; toda função que a 0147 reescreve e que já existia em migração
//     anterior volta com o MESMO texto da última definição (0119 e 0130);
//   * toda policy que a 0147 derruba (tenant_revogar) volta como na migração que a criou (0103);
//   * todo revoke de privilégio de tabela tem o grant de volta;
//   * a ordem roda (triggers e policies antes das funções que eles usam), tudo numa transação, sem tocar em dado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const pastaDasMigracoes = join(RAIZ, "supabase", "migrations");
const migracao = readFileSync(join(pastaDasMigracoes, "0147_permissoes_ead.sql"), "utf8");
const desfazer = readFileSync(join(RAIZ, "tools", "desfazer-permissoes-ead.sql"), "utf8");

// as migrações anteriores à 0147, na ordem em que foram aplicadas
const anteriores = readdirSync(pastaDasMigracoes)
  .filter((nome) => /^\d{4}_.+\.sql$/.test(nome) && nome < "0147")
  .sort()
  .map((nome) => readFileSync(join(pastaDasMigracoes, nome), "utf8"));

const semComentarios = (texto: string) => texto.replace(/--.*$/gm, "");
const compacto = (texto: string) => texto.replace(/\s+/g, " ").trim();
/** Texto sem comentário e sem espaço sobrando, em minúsculas: a forma de comparar dois trechos de SQL. */
const forma = (texto: string) => compacto(semComentarios(texto)).toLowerCase();
const semEspacos = (texto: string) => texto.replace(/\s+/g, "").toLowerCase();

interface Funcao {
  /** public.<nome> */
  nome: string;
  /** os tipos dos argumentos, sem espaço: "uuid,text" */
  assinatura: string;
}

function tiposDosArgumentos(argumentos: string): string {
  return argumentos
    .split(",")
    .map((arg) => arg.trim())
    .filter((arg) => arg !== "")
    .map((arg) => arg.split(/\s+/)[1] ?? "")
    .join(",")
    .toLowerCase();
}

/** As funções que o texto cria (create [or replace] function public.<nome>(...) returns ...). */
function funcoesCriadas(texto: string): Funcao[] {
  const limpo = semComentarios(texto);
  const re = /create (?:or replace )?function (public\.\w+)\s*\(([\s\S]*?)\)\s*returns\b/gi;
  return [...limpo.matchAll(re)].map((m) => ({
    nome: m[1].toLowerCase(),
    assinatura: tiposDosArgumentos(m[2]),
  }));
}

/** O texto inteiro (cabeçalho e corpo) da ÚLTIMA definição da função nas migrações dadas; null se nunca existiu. */
function ultimaDefinicao(nome: string, textos: string[]): string | null {
  const re = new RegExp(
    `create (?:or replace )?function ${nome.replace(".", "\\.")}\\s*\\([\\s\\S]*?\\bas\\s+\\$\\$[\\s\\S]*?\\n\\$\\$;`,
    "gi"
  );
  let achada: string | null = null;
  for (const texto of textos) {
    const todas = [...semComentarios(texto).matchAll(re)];
    if (todas.length > 0) achada = todas[todas.length - 1][0];
  }
  return achada;
}

/** A definição da função dentro de `texto` (o desfazer), ou null. */
const definicaoEm = (nome: string, texto: string) => ultimaDefinicao(nome, [texto]);

const comoCreateOrReplace = (definicao: string) =>
  forma(definicao).replace(/^create function /, "create or replace function ");

/**
 * Tudo o que a migração faz sem uma linha correspondente no desfazer. Lista vazia = o desfazer cobre a migração.
 * `anteriores` são as migrações com número menor, para saber o que já existia (e como era).
 */
function problemasDoDesfazer(mig: string, desf: string, antes: string[]): string[] {
  const problemas: string[] = [];
  const limpoMig = semComentarios(mig);
  const limpoDesf = semComentarios(desf);
  const desfComEspacos = semEspacos(limpoDesf);

  // 1. triggers
  const triggers = [
    ...limpoMig.matchAll(/create trigger (\w+)\s+(?:before|after)[\s\S]*?\bon\s+([\w.]+)/gi),
  ];
  if (triggers.length === 0) problemas.push("o leitor não achou nenhum create trigger na migração");
  for (const [, nome, tabela] of triggers) {
    if (!desfComEspacos.includes(semEspacos(`drop trigger if exists ${nome} on ${tabela};`)))
      problemas.push(`falta: drop trigger if exists ${nome} on ${tabela}`);
  }

  // 2. policies criadas
  const policies = [...limpoMig.matchAll(/create policy (\w+)\s+on\s+([\w.]+)/gi)];
  if (policies.length === 0) problemas.push("o leitor não achou nenhum create policy na migração");
  for (const [, nome, tabela] of policies) {
    if (!desfComEspacos.includes(semEspacos(`drop policy if exists ${nome} on ${tabela};`)))
      problemas.push(`falta: drop policy if exists ${nome} on ${tabela}`);
  }

  // 3. funções: nova = drop com a assinatura; já existia = volta com o texto da última definição
  const funcoes = funcoesCriadas(mig);
  if (funcoes.length === 0) problemas.push("o leitor não achou nenhuma função na migração");
  for (const f of funcoes) {
    const anterior = ultimaDefinicao(f.nome, antes);
    if (anterior === null) {
      if (
        !desfComEspacos.includes(semEspacos(`drop function if exists ${f.nome}(${f.assinatura});`))
      )
        problemas.push(`falta: drop function if exists ${f.nome}(${f.assinatura})`);
    } else {
      const restaurada = definicaoEm(f.nome, desf);
      if (restaurada === null) {
        problemas.push(`falta: create or replace function ${f.nome} com o texto de antes da 0147`);
      } else if (comoCreateOrReplace(restaurada) !== comoCreateOrReplace(anterior)) {
        problemas.push(`${f.nome}: o texto restaurado não é o da última definição anterior à 0147`);
      }
    }
  }

  // 4. policies que a migração derruba e não recria: voltam como na migração que as criou
  const criadas = new Set(policies.map(([, nome, tabela]) => `${nome}@${tabela}`.toLowerCase()));
  const derrubadas = [...limpoMig.matchAll(/drop policy if exists (\w+)\s+on\s+([\w.]+);/gi)];
  for (const [, nome, tabela] of derrubadas) {
    if (criadas.has(`${nome}@${tabela}`.toLowerCase())) continue;
    const re = new RegExp(
      `create policy ${nome}\\s+on\\s+${tabela.replace(".", "\\.")}\\b[\\s\\S]*?;`,
      "i"
    );
    const original = antes
      .map((texto) => semComentarios(texto).match(re)?.[0])
      .filter((trecho): trecho is string => !!trecho)
      .pop();
    if (!original) {
      problemas.push(
        `${nome}@${tabela}: a migração a derruba, mas nenhuma migração anterior a cria`
      );
      continue;
    }
    if (!forma(limpoDesf).includes(forma(original)))
      problemas.push(`falta: recriar a policy ${nome} on ${tabela} como na migração que a criou`);
    if (!desfComEspacos.includes(semEspacos(`drop policy if exists ${nome} on ${tabela};`)))
      problemas.push(`falta: drop policy if exists ${nome} on ${tabela} antes de recriar`);
  }

  // 5. privilégios de tabela tirados de authenticated voltam
  for (const m of limpoMig.matchAll(
    /revoke\s+([a-z, ]+?)\s+on\s+(public\.\w+)\s+from\s+authenticated;/gi
  )) {
    const privilegios = m[1].trim();
    if (/^all$/i.test(privilegios)) continue;
    if (!desfComEspacos.includes(semEspacos(`grant ${privilegios} on ${m[2]} to authenticated;`)))
      problemas.push(`falta: grant ${privilegios} on ${m[2]} to authenticated`);
  }

  // 6. a forma do arquivo: uma transação, repetível, sem tocar em dado, na ordem que roda
  const forma6 = forma(limpoDesf);
  if (!forma6.startsWith("begin;")) problemas.push("o desfazer precisa começar com begin;");
  if (!forma6.includes(" commit;")) problemas.push("o desfazer precisa ter commit;");
  if (!forma6.endsWith("select 'ok' as res;"))
    problemas.push("o desfazer precisa terminar em select 'ok' as res;");
  const semCorpos = limpoDesf.replace(/\$\$[\s\S]*?\$\$/g, "$$$$");
  for (const m of semCorpos.matchAll(/\bdrop\s+(trigger|policy|function)\s+(?!if exists)/gi))
    problemas.push(`drop ${m[1]} sem "if exists": o arquivo não seria repetível`);
  if (
    /\b(insert\s+into|delete\s+from|truncate)\b/i.test(semCorpos) ||
    /\bupdate\s+(public|storage)\./i.test(semCorpos)
  )
    problemas.push("o desfazer não pode alterar dado (insert, update, delete ou truncate)");
  // os triggers e as policies CRIADOS pela migração usam as funções novas: o drop deles vem antes do primeiro drop
  // function (o Postgres recusa derrubar função em uso). A policy tenant_revogar não usa nenhuma e é recriada depois.
  const comandos = forma(semCorpos);
  const primeiroDropFunction = comandos.indexOf("drop function");
  const usuarias = [
    ...triggers.map(([, nome, tabela]) => `drop trigger if exists ${nome} on ${tabela};`),
    ...policies.map(([, nome, tabela]) => `drop policy if exists ${nome} on ${tabela};`),
  ];
  for (const comando of usuarias) {
    const posicao = comandos.lastIndexOf(comando.toLowerCase());
    if (posicao >= 0 && primeiroDropFunction >= 0 && posicao > primeiroDropFunction)
      problemas.push(
        `${comando.slice(0, -1)} vem depois de um drop function (a função ainda estaria em uso)`
      );
  }

  return problemas.sort();
}

// ---------------------------------------------------------------------------------------------- o arquivo real

test("0147 x desfazer: o desfazer cobre tudo o que a migração cria, troca ou tira", () => {
  assert.deepEqual(problemasDoDesfazer(migracao, desfazer, anteriores), []);
});

test("0147 x desfazer: o leitor enxerga os objetos que importam (não passa vazio)", () => {
  const limpa = semComentarios(migracao);
  assert.equal([...limpa.matchAll(/create trigger zz_permissao_ead\b/gi)].length, 8);
  assert.equal([...limpa.matchAll(/create trigger zz_documentos_portal\b/gi)].length, 1);
  assert.equal([...limpa.matchAll(/create policy ead_leitura_com_permissao\b/gi)].length, 3);
  assert.equal([...limpa.matchAll(/create policy treinamentos_\w+_com_permissao\b/gi)].length, 3);
  const nomes = funcoesCriadas(migracao).map((f) => f.nome);
  assert.equal(nomes.length, 11, nomes.join(", "));
  // as duas que já existiam voltam; as outras 9 saem
  const jaExistiam = nomes.filter((nome) => ultimaDefinicao(nome, anteriores) !== null).sort();
  assert.deepEqual(jaExistiam, [
    "public.certificado_so_revogacao",
    "public.matricula_andamento_so_servidor",
  ]);
  const novas = (desfazer.match(/drop function if exists /gi) ?? []).length;
  assert.equal(novas, 9);
  // a 0130 e a 0119 são as últimas definições (nenhuma migração entre elas e a 0147 reescreveu as funções)
  assert.match(
    ultimaDefinicao("public.matricula_andamento_so_servidor", anteriores) ?? "",
    /'tentativas_extras', 'deleted_at', 'updated_at'/
  );
  assert.match(
    ultimaDefinicao("public.certificado_so_revogacao", anteriores) ?? "",
    /certificado emitido não pode ser alterado \(só revogado\)/
  );
});

test("0147 x desfazer: as 8 tabelas do EAD têm o drop do trigger, uma a uma", () => {
  const tabelas = [
    "treinamento_curso",
    "treinamento_aula",
    "treinamento_questao",
    "treinamento_matricula",
    "treinamento_duvida",
    "treinamento_sessao_pratica",
    "treinamento_pratica_participante",
    "treinamento_declaracao_texto",
  ];
  for (const tabela of tabelas) {
    assert.match(
      semComentarios(desfazer),
      new RegExp(`drop trigger if exists zz_permissao_ead on public\\.${tabela};`),
      tabela
    );
  }
});

// ----------------------------------------------------------------------------- o leitor acusa o que falta

/** Tira do desfazer as linhas que casam com `padrao` (o que um desfazer abreviado esqueceria). */
const semAsLinhas = (padrao: RegExp) =>
  desfazer
    .split("\n")
    .filter((linha) => !padrao.test(linha))
    .join("\n");

test("leitor: o bloco abreviado de antes (só 1 trigger, 1 policy, sem as funções) é acusado", () => {
  const abreviado = [
    "begin;",
    "drop trigger if exists zz_permissao_ead on public.treinamento_curso;",
    "drop trigger if exists zz_documentos_portal on public.funcionario;",
    "drop policy if exists ead_leitura_com_permissao on public.treinamento_questao;",
    "drop policy if exists treinamentos_insert_com_permissao on storage.objects;",
    "drop function if exists public.portal_documento_publicar(uuid, text, text, text, text);",
    "drop function if exists public.portal_documento_retirar(uuid, text);",
    "commit;",
    "select 'ok' as res;",
  ].join("\n");
  const problemas = problemasDoDesfazer(migracao, abreviado, anteriores);
  assert.ok(
    problemas.includes(
      "falta: drop trigger if exists zz_permissao_ead on public.treinamento_matricula"
    ),
    problemas.join("\n")
  );
  assert.ok(
    problemas.includes(
      "falta: drop policy if exists ead_leitura_com_permissao on public.treinamento_tentativa"
    )
  );
  assert.ok(
    problemas.includes(
      "falta: drop policy if exists treinamentos_delete_com_permissao on storage.objects"
    )
  );
  assert.ok(
    problemas.includes(
      "falta: create or replace function public.matricula_andamento_so_servidor com o texto de antes da 0147"
    )
  );
  assert.ok(
    problemas.includes(
      "falta: create or replace function public.certificado_so_revogacao com o texto de antes da 0147"
    )
  );
  assert.ok(
    problemas.includes("falta: grant update on public.treinamento_certificado to authenticated")
  );
  assert.ok(problemas.some((p) => p.startsWith("falta: recriar a policy tenant_revogar")));
});

test("leitor: tirar um drop trigger, um drop policy ou um drop function do arquivo real é acusado", () => {
  const semTrigger = semAsLinhas(
    /drop trigger if exists zz_permissao_ead on public\.treinamento_duvida;/
  );
  assert.deepEqual(problemasDoDesfazer(migracao, semTrigger, anteriores), [
    "falta: drop trigger if exists zz_permissao_ead on public.treinamento_duvida",
  ]);
  const semPolicy = semAsLinhas(/drop policy if exists treinamentos_update_com_permissao/);
  assert.deepEqual(problemasDoDesfazer(migracao, semPolicy, anteriores), [
    "falta: drop policy if exists treinamentos_update_com_permissao on storage.objects",
  ]);
  const semFuncao = semAsLinhas(/drop function if exists public\.portal_documento_retirar/);
  assert.deepEqual(problemasDoDesfazer(migracao, semFuncao, anteriores), [
    "falta: drop function if exists public.portal_documento_retirar(uuid,text)",
  ]);
});

test("leitor: função restaurada com texto diferente do de antes é acusada", () => {
  const trocada = desfazer.replace(
    "array['tentativas_extras', 'deleted_at', 'updated_at']",
    "array['deleted_at', 'updated_at']"
  );
  assert.notEqual(trocada, desfazer);
  assert.deepEqual(problemasDoDesfazer(migracao, trocada, anteriores), [
    "public.matricula_andamento_so_servidor: o texto restaurado não é o da última definição anterior à 0147",
  ]);
});

test("leitor: policy tenant_revogar e grant de UPDATE sem recriar são acusados", () => {
  const semGrant = semAsLinhas(/^grant update on public\.treinamento_certificado/);
  assert.deepEqual(problemasDoDesfazer(migracao, semGrant, anteriores), [
    "falta: grant update on public.treinamento_certificado to authenticated",
  ]);
  const semPolicy = desfazer.replace(/create policy tenant_revogar[\s\S]*?;\n/, "-- (esqueci)\n");
  assert.notEqual(semPolicy, desfazer);
  assert.deepEqual(problemasDoDesfazer(migracao, semPolicy, anteriores), [
    "falta: recriar a policy tenant_revogar on public.treinamento_certificado como na migração que a criou",
  ]);
});

test("leitor: drop sem if exists, dado alterado, ordem errada e falta de transação são acusados", () => {
  const semIfExists = desfazer.replace(
    "drop trigger if exists zz_documentos_portal on public.funcionario;",
    "drop trigger zz_documentos_portal on public.funcionario;"
  );
  assert.ok(
    problemasDoDesfazer(migracao, semIfExists, anteriores).some((p) =>
      p.includes('sem "if exists"')
    )
  );

  const comDado = desfazer.replace("commit;", "delete from public.funcionario;\ncommit;");
  assert.ok(
    problemasDoDesfazer(migracao, comDado, anteriores).some((p) =>
      p.includes("não pode alterar dado")
    )
  );

  // a função derrubada antes da policy que a usa: o Postgres recusaria
  const ordemErrada = desfazer.replace(
    "drop function if exists public.zz_permissao_ead();",
    "drop function if exists public.zz_permissao_ead();\ndrop policy if exists ead_leitura_com_permissao on public.treinamento_evento;"
  );
  assert.ok(
    problemasDoDesfazer(migracao, ordemErrada, anteriores).some((p) =>
      p.includes("a função ainda estaria em uso")
    )
  );

  const semTransacao = desfazer.replace(/^begin;$/m, "").replace(/^commit;$/m, "");
  const problemas = problemasDoDesfazer(migracao, semTransacao, anteriores);
  assert.ok(problemas.includes("o desfazer precisa começar com begin;"));
  assert.ok(problemas.includes("o desfazer precisa ter commit;"));
});

test("leitor: objeto novo na migração sem o drop correspondente é acusado (a migração e o desfazer andam juntos)", () => {
  const maisUmTrigger =
    migracao +
    "\ncreate trigger zz_permissao_ead\n  before insert or update on public.treinamento_nova\n  for each row execute function public.zz_permissao_ead();\n";
  assert.deepEqual(problemasDoDesfazer(maisUmTrigger, desfazer, anteriores), [
    "falta: drop trigger if exists zz_permissao_ead on public.treinamento_nova",
  ]);
  const maisUmaFuncao =
    migracao +
    "\ncreate or replace function public.nova_t33(a uuid, b text default null)\nreturns boolean\nlanguage sql\nas $$ select true $$;\n";
  assert.deepEqual(problemasDoDesfazer(maisUmaFuncao, desfazer, anteriores), [
    "falta: drop function if exists public.nova_t33(uuid,text)",
  ]);
});

test("o cabeçalho da 0147 e o do smoke mandam para o arquivo certo", () => {
  assert.match(migracao, /supabase db query --linked -f tools\/desfazer-permissoes-ead\.sql/);
  const smoke = readFileSync(join(RAIZ, "tools", "smoke-permissoes-ead.sql"), "utf8");
  assert.match(smoke, /tools\/desfazer-permissoes-ead\.sql/);
});
