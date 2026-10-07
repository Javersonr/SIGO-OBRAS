// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/migracoes-delimitadores.test.ts
//
// Guarda dos delimitadores `$$` das migrações e dos scripts SQL do EAD (A6, revisão 1, C1). O PostgreSQL só aceita
// `$$` ou `$tag$` para abrir e fechar o corpo de uma função; um `$` sozinho ("as $" ... "$;") dá "syntax error at or
// near $" e, como cada migração roda entre begin e commit, desfaz a migração INTEIRA. Aconteceu na 0143 (uma
// substituição de texto com `$$` vira `$` no JavaScript) e os testes de forma não pegaram: o regex preguiçoso que
// extraía o corpo da função atravessava até o `$$;` da função seguinte e achava tudo o que procurava.
//
// Não há Postgres nem parser de SQL no PC (e `npm run dev` fala com produção), então este arquivo faz o que dá para
// fazer sem banco: um leitor mínimo que anda pelo SQL como o PostgreSQL anda (comentários, textos entre aspas,
// identificadores entre aspas duplas e blocos entre `$tag$`) e acusa todo `$` solto e todo bloco que não fecha.
// Quem confere o resto continua sendo o primeiro `supabase db query` do Javerson.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

interface Achado {
  linha: number;
  problema: string;
}

const ehParteDeIdentificador = (c: string | undefined) => !!c && /[A-Za-z0-9_\u0080-￿]/.test(c);
const ABERTURA_DE_BLOCO = /^\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/;

/**
 * Anda pelo SQL e devolve quantos blocos entre `$tag$` ele tem e o que está errado: `$` solto (nem `$$`, nem
 * `$tag$`, nem parâmetro `$1`), bloco que não fecha, texto, identificador ou comentário de bloco que não fecha.
 * O que está DENTRO de um bloco (o corpo da função) não é lido: pode ter `$`, aspas e `--` à vontade.
 */
function examinarDelimitadores(sql: string): { blocos: number; problemas: Achado[] } {
  const problemas: Achado[] = [];
  let blocos = 0;
  const n = sql.length;
  const linhaDe = (posicao: number) => sql.slice(0, posicao).split("\n").length;
  let i = 0;
  while (i < n) {
    const c = sql[i];
    const proximo = sql[i + 1];
    if (c === "-" && proximo === "-") {
      const fim = sql.indexOf("\n", i);
      i = fim < 0 ? n : fim + 1;
      continue;
    }
    if (c === "/" && proximo === "*") {
      // comentário de bloco: o PostgreSQL aceita um dentro do outro
      let nivel = 1;
      let j = i + 2;
      while (j < n && nivel > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") {
          nivel++;
          j += 2;
        } else if (sql[j] === "*" && sql[j + 1] === "/") {
          nivel--;
          j += 2;
        } else {
          j++;
        }
      }
      if (nivel > 0) problemas.push({ linha: linhaDe(i), problema: "comentário /* sem */" });
      i = j;
      continue;
    }
    if (c === "'") {
      // E'...' aceita \ como escape; o texto comum só dobra a aspa ('')
      const comEscape =
        (sql[i - 1] === "E" || sql[i - 1] === "e") && !ehParteDeIdentificador(sql[i - 2]);
      let j = i + 1;
      let fechou = false;
      while (j < n) {
        if (comEscape && sql[j] === "\\") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          fechou = true;
          j++;
          break;
        }
        j++;
      }
      if (!fechou)
        problemas.push({ linha: linhaDe(i), problema: "texto entre aspas simples não fecha" });
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let fechou = false;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            j += 2;
            continue;
          }
          fechou = true;
          j++;
          break;
        }
        j++;
      }
      if (!fechou)
        problemas.push({
          linha: linhaDe(i),
          problema: "identificador entre aspas duplas não fecha",
        });
      i = j;
      continue;
    }
    if (c === "$") {
      if (ehParteDeIdentificador(sql[i - 1])) {
        i++; // `$` dentro de um identificador (nome$sufixo)
        continue;
      }
      const abertura = ABERTURA_DE_BLOCO.exec(sql.slice(i, i + 100))?.[0];
      if (abertura) {
        blocos++;
        const fim = sql.indexOf(abertura, i + abertura.length);
        if (fim < 0) {
          problemas.push({
            linha: linhaDe(i),
            problema: `bloco ${abertura} aberto e nunca fechado`,
          });
          i = n;
        } else {
          i = fim + abertura.length;
        }
        continue;
      }
      if (/[0-9]/.test(sql[i + 1] ?? "")) {
        i++; // parâmetro posicional ($1)
        continue;
      }
      problemas.push({
        linha: linhaDe(i),
        problema: "`$` solto: o PostgreSQL só aceita $$ ou $tag$ para abrir e fechar o corpo",
      });
    }
    i++;
  }
  return { blocos, problemas };
}

// ------------------------------------------------------------------------------------------ o leitor em si

test("leitor: a função com `as $` e `$;` (o defeito da 0143) é acusada duas vezes", () => {
  const quebrada = [
    "create or replace function public.f()",
    "returns trigger language plpgsql as $",
    "begin",
    "  return new;",
    "end;",
    "$;",
    "select 'ok' as res;",
  ].join("\n");
  const { problemas } = examinarDelimitadores(quebrada);
  assert.deepEqual(
    problemas.map((p) => p.linha),
    [2, 6]
  );
  assert.match(problemas[0].problema, /`\$` solto/);
});

test("leitor: a quebrada NÃO se escondeu atrás de uma função certa logo depois (o caso da 0143)", () => {
  const sql = [
    "create or replace function public.a() returns trigger language plpgsql as $",
    "begin return new; end;",
    "$;",
    "create or replace function public.b() returns trigger language plpgsql as $$",
    "begin return new; end;",
    "$$;",
  ].join("\n");
  const { blocos, problemas } = examinarDelimitadores(sql);
  assert.equal(problemas.length, 2);
  assert.equal(blocos, 1); // só a função b abre e fecha um bloco
});

test("leitor: $$, $tag$, parâmetro $1 e `$` dentro de identificador, texto e comentário passam", () => {
  const sql = [
    "-- comentário com $ solto e 'aspas",
    "/* comentário /* aninhado */ com $ e '*/",
    "create or replace function public.f(p text) returns text language sql as $$",
    "  select p || '$' || $1 -- o corpo não é lido: $ solto, 'aspas, \"duas",
    "$$;",
    "do $corpo$ begin raise notice '$$'; end; $corpo$;",
    "select 'a''$b', E'\\'$', \"col$una\", nome$sufixo from t where x = $1;",
  ].join("\n");
  const { blocos, problemas } = examinarDelimitadores(sql);
  assert.deepEqual(problemas, []);
  assert.equal(blocos, 2);
});

test("leitor: bloco que não fecha, texto e comentário abertos são acusados", () => {
  assert.equal(examinarDelimitadores("select $$ sem fim;").problemas.length, 1);
  assert.equal(examinarDelimitadores("do $a$ begin end; $b$;").problemas.length, 1);
  assert.equal(examinarDelimitadores("select 'sem fim;").problemas.length, 1);
  assert.equal(examinarDelimitadores('select "sem fim;').problemas.length, 1);
  assert.equal(examinarDelimitadores("/* sem fim\nselect 1;").problemas.length, 1);
});

// ------------------------------------------------------------------------------ os arquivos do repositório

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const pastaDasMigracoes = join(RAIZ, "supabase", "migrations");
const pastaDasFerramentas = join(RAIZ, "tools");

const migracoes = readdirSync(pastaDasMigracoes)
  .filter((nome) => /^\d{4}_.+\.sql$/.test(nome))
  .map((nome) => ({ nome: `supabase/migrations/${nome}`, caminho: join(pastaDasMigracoes, nome) }));
// os smokes e conferências do EAD também rodam no banco (e o `tools/*.sql` é do Javerson, não do agente); T33: o
// smoke, a conferência e o desfazer das permissões do EAD também; T38: o smoke e os scripts do operador do portal
const scriptsDoEad = readdirSync(pastaDasFerramentas)
  .filter((nome) =>
    /^((smoke-ead-|conferir-checks-ead|ead-|portal-credencial-).+|(smoke|conferir|desfazer)-permissoes-ead|smoke-portal-credencial)\.sql$/.test(
      nome
    )
  )
  .map((nome) => ({ nome: `tools/${nome}`, caminho: join(pastaDasFerramentas, nome) }));

test("T38: o smoke e os scripts do operador do portal estão entre os scripts examinados", () => {
  const nomes = scriptsDoEad.map((s) => s.nome);
  for (const nome of [
    "tools/smoke-portal-credencial.sql",
    "tools/portal-credencial-alertas.sql",
    "tools/portal-credencial-conferir.sql",
    "tools/portal-credencial-redefinir.sql",
  ]) {
    assert.ok(nomes.includes(nome), nome);
  }
});

test("T33: o smoke, a conferência e o desfazer das permissões do EAD estão entre os scripts examinados", () => {
  const nomes = scriptsDoEad.map((s) => s.nome);
  assert.ok(nomes.includes("tools/smoke-permissoes-ead.sql"), nomes.join(", "));
  assert.ok(nomes.includes("tools/conferir-permissoes-ead.sql"), nomes.join(", "));
  assert.ok(nomes.includes("tools/desfazer-permissoes-ead.sql"), nomes.join(", "));
});

test("há migrações e scripts do EAD para examinar (o teste não passa vazio)", () => {
  assert.ok(migracoes.length > 100, `migrações achadas: ${migracoes.length}`);
  assert.ok(
    migracoes.some((m) => m.nome.includes("0143_")),
    "a 0143 tem de estar na lista"
  );
  assert.ok(scriptsDoEad.length >= 4, `scripts do EAD achados: ${scriptsDoEad.length}`);
});

for (const arquivo of [...migracoes, ...scriptsDoEad]) {
  test(`${arquivo.nome}: todo $$ ou $tag$ abre e fecha, e não há $ solto`, () => {
    const { problemas } = examinarDelimitadores(readFileSync(arquivo.caminho, "utf8"));
    assert.deepEqual(
      problemas.map((p) => `linha ${p.linha}: ${p.problema}`),
      []
    );
  });
}

test("0143: cada função abre e fecha o próprio bloco (3 funções, 3 blocos) e nenhum corpo atravessa outra função", () => {
  const caminho = migracoes.find((m) => m.nome.includes("0143_"))?.caminho ?? "";
  const sql = readFileSync(caminho, "utf8");
  const { blocos, problemas } = examinarDelimitadores(sql);
  assert.deepEqual(problemas, []);
  const funcoes = sql.replace(/--.*$/gm, "").match(/create or replace function/g)?.length ?? 0;
  assert.equal(funcoes, 3);
  assert.equal(blocos, funcoes);
});
