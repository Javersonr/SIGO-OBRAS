// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/travas-banco.test.ts
//
// Guarda da T32 (endurecimento do banco do EAD): migração `0139_ead_travas_de_integridade.sql`, script de
// conferência `tools/conferir-checks-ead.sql` e as três linhas de `verify_jwt` em `supabase/config.toml`.
// Não há banco de teste (nem Postgres no PC) e `npm run dev` fala com produção: o que se confere aqui é a
// FORMA dos arquivos, que é onde a T32 pode errar sem ninguém ver:
//   - todo CHECK nasce NOT VALID e é validado num passo à parte que NÃO derruba a migração se houver dado
//     velho fora da regra (a trava já vale para o dado novo desde o ADD);
//   - o índice único de matrícula aberta só é criado se não houver repetição (senão avisa e segue);
//   - a função da 0131 que copia a carga do cadastro central para o curso não grava 0/nulo que o CHECK
//     recusaria (C9), e continua copiando tudo o que copiava;
//   - o script de conferência só LÊ e é UM comando só (o `supabase db query` pode devolver só o último
//     resultado de um arquivo com vários).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const lerArquivo = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), "utf8");

const pastaMigracoes = join(RAIZ, "supabase", "migrations");
const arquivos0139 = readdirSync(pastaMigracoes).filter((n) => /^0139_.+\.sql$/.test(n));
test("existe exatamente uma migração 0139 (o número desta tarefa)", () => {
  assert.equal(arquivos0139.length, 1, `achei: ${arquivos0139.join(", ") || "nenhuma"}`);
});
const migracao = lerArquivo("supabase", "migrations", arquivos0139[0] ?? "0139_ausente.sql");
const migracao0131 = lerArquivo(
  "supabase",
  "migrations",
  "0131_treinamentos_cadastro_integrado.sql"
);
const conferencia = lerArquivo("tools", "conferir-checks-ead.sql");
const configToml = lerArquivo("supabase", "config.toml");

/** SQL sem comentário de linha e de bloco (nenhum dos arquivos tem `--` dentro de texto entre aspas). */
const semComentarios = (sql: string) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((linha) => linha.replace(/--.*$/, ""))
    .join("\n");

const sqlMigracao = semComentarios(migracao);
const sqlConferencia = semComentarios(conferencia);
/** Espaços em branco repetidos viram um só, para casar trechos que o Prettier/SQL quebra em linhas. */
const compacto = (sql: string) => sql.replace(/\s+/g, " ").trim();

// ----------------------------------------------------------------------------------- as 7 travas (CHECK)

const TRAVAS: Array<{ tabela: string; nome: string; coluna: string }> = [
  { tabela: "treinamento_curso", nome: "treinamento_curso_nota_minima_chk", coluna: "nota_minima" },
  {
    tabela: "treinamento_curso",
    nome: "treinamento_curso_max_tentativas_chk",
    coluna: "max_tentativas",
  },
  {
    tabela: "treinamento_curso",
    nome: "treinamento_curso_intervalo_tentativa_chk",
    coluna: "intervalo_tentativa_min",
  },
  {
    tabela: "treinamento_curso",
    nome: "treinamento_curso_carga_horaria_chk",
    coluna: "carga_horaria_horas",
  },
  {
    tabela: "treinamento_curso",
    nome: "treinamento_curso_validade_meses_chk",
    coluna: "validade_meses",
  },
  { tabela: "treinamento_aula", nome: "treinamento_aula_duracao_seg_chk", coluna: "duracao_seg" },
  { tabela: "treinamento_questao", nome: "treinamento_questao_correta_chk", coluna: "correta" },
];

/** O texto de `alter table public.<tabela> add constraint <nome> check (...) not valid`, ou null. */
function adicaoDaTrava(nome: string): string | null {
  const m = new RegExp(
    `alter table public\\.(\\w+)\\s+add constraint ${nome}\\s+check\\s*\\(([\\s\\S]*?)\\)\\s*not valid\\s*;`,
    "i"
  ).exec(sqlMigracao);
  return m ? compacto(`${m[1]} :: ${m[2]}`) : null;
}

for (const t of TRAVAS) {
  test(`${t.nome}: nasce NOT VALID na tabela e coluna certas`, () => {
    const adicao = adicaoDaTrava(t.nome);
    assert.ok(adicao, `${t.nome} não é adicionada com "check (...) not valid"`);
    assert.ok(adicao.startsWith(`${t.tabela} ::`), `tabela errada: ${adicao}`);
    assert.ok(adicao.includes(t.coluna), `a regra não olha ${t.coluna}: ${adicao}`);
  });
}

test("nenhum CHECK é adicionado sem NOT VALID (o ADD não varre a tabela nem falha por dado velho)", () => {
  const adicoes = sqlMigracao.match(/add constraint[\s\S]*?;/gi) ?? [];
  assert.ok(adicoes.length >= TRAVAS.length);
  for (const a of adicoes) assert.match(a, /\bnot valid\b/i, `sem NOT VALID: ${compacto(a)}`);
});

test("as regras dos CHECK são as da brief", () => {
  const regra = (nome: string) => adicaoDaTrava(nome) ?? "";
  assert.match(regra("treinamento_curso_nota_minima_chk"), /nota_minima between 0 and 100/i);
  assert.match(regra("treinamento_curso_max_tentativas_chk"), /max_tentativas >= 0/i);
  assert.match(regra("treinamento_curso_intervalo_tentativa_chk"), /intervalo_tentativa_min >= 0/i);
  assert.match(regra("treinamento_curso_carga_horaria_chk"), /carga_horaria_horas > 0/i);
  assert.match(regra("treinamento_curso_validade_meses_chk"), /validade_meses >= 0/i);
  assert.match(regra("treinamento_aula_duracao_seg_chk"), /duracao_seg >= 0/i);
});

test("correta dentro de opcoes: só lista JSON vale, e o tamanho só é medido depois de saber que é lista", () => {
  const regra = adicaoDaTrava("treinamento_questao_correta_chk") ?? "";
  // jsonb_array_length lança erro (não falso) em escalar/objeto: o CASE garante que ele só roda em lista
  assert.match(regra, /case when jsonb_typeof\(opcoes\) = 'array' then/i);
  assert.match(regra, /correta >= 0 and correta < jsonb_array_length\(opcoes\)/i);
  assert.match(regra, /else false end/i);
});

test("nenhuma trava mexe em nulos de coluna opcional: carga e validade nulas continuam valendo", () => {
  // CHECK só recusa quando a expressão dá FALSE; NULL passa. Não pode haver "is not null" nem coalesce
  // transformando nulo em reprovação (curso sem carga é pendência de requisito, não erro de banco).
  for (const nome of [
    "treinamento_curso_carga_horaria_chk",
    "treinamento_curso_validade_meses_chk",
    "treinamento_aula_duracao_seg_chk",
  ]) {
    const regra = adicaoDaTrava(nome) ?? "";
    assert.doesNotMatch(regra, /is not null|coalesce/i, nome);
  }
});

test("a validação é um passo à parte, só das 7 travas, que não derruba a migração por dado velho", () => {
  const compactoSql = compacto(sqlMigracao);
  for (const t of TRAVAS) {
    assert.ok(
      new RegExp(`'${t.nome}'`).test(compactoSql),
      `${t.nome} não está na lista que o passo de validação percorre`
    );
  }
  assert.match(compactoSql, /validate constraint/i);
  // falha de VALIDATE (23514) vira aviso e a trava fica NOT VALID, ainda valendo para dado novo
  assert.match(compactoSql, /exception when check_violation then raise warning/i);
  // o passo só pega o que ainda não foi validado (reaplicar não repete a varredura)
  assert.match(compactoSql, /not c\.convalidated/i);
  // a validação roda DEPOIS de todas as travas existirem
  const ultimaAdicao = sqlMigracao.lastIndexOf(") not valid;");
  const validacao = sqlMigracao.search(/validate constraint/i);
  assert.ok(validacao > ultimaAdicao, "a validação precisa vir depois das adições");
});

// ------------------------------------------------------------------------------ índice único de matrícula

test("índice único parcial da matrícula aberta: (funcionario_id, curso_id), só viva e não concluída", () => {
  const sql = compacto(sqlMigracao);
  assert.match(
    sql,
    /create unique index (if not exists )?treinamento_matricula_viva_uidx on public\.treinamento_matricula \(funcionario_id, curso_id\) where deleted_at is null and status <> 'concluido'/i
  );
});

test("o índice só é criado se não houver matrícula aberta repetida (senão avisa e segue)", () => {
  const sql = compacto(sqlMigracao);
  const dup = sql.search(/group by funcionario_id, curso_id having count\(\*\) > 1/i);
  const indice = sql.search(/create unique index/i);
  assert.ok(dup >= 0, "falta a conferência de repetidas");
  assert.ok(dup < indice, "a conferência precisa vir antes do CREATE UNIQUE INDEX");
  assert.match(sql, /raise warning/i);
});

test("não existe único em (curso_id, ordem): a troca de ordem passa por estado repetido", () => {
  assert.doesNotMatch(compacto(sqlMigracao), /unique[^;]*\(\s*curso_id\s*,\s*ordem\s*\)/i);
  assert.doesNotMatch(compacto(sqlMigracao), /unique[^;]*\(\s*ordem\s*,\s*curso_id\s*\)/i);
});

// ------------------------------------------------------------------------------ default de ativo e anon

test("treinamento_curso.ativo passa a nascer false (curso novo é rascunho)", () => {
  assert.match(
    compacto(sqlMigracao),
    /alter table public\.treinamento_curso alter column ativo set default false\s*;/i
  );
});

const TABELAS_SEM_ANON = [
  "treinamento_curso",
  "treinamento_aula",
  "treinamento_questao",
  "treinamento_matricula",
  "treinamento_progresso",
  "treinamento_tentativa",
  "treinamento_evento",
  "treinamento_duvida",
  "treinamento_certificado",
  "funcionario_portal_acesso",
  "entrega_ciencia",
];

for (const tabela of TABELAS_SEM_ANON) {
  test(`anon sem nenhum privilégio em ${tabela}`, () => {
    assert.match(
      compacto(sqlMigracao),
      new RegExp(`revoke all on (table )?public\\.${tabela} from anon\\s*;`, "i")
    );
  });
}

// ----------------------------------------------------------- C9: a propagação da 0131 não quebra no CHECK

/** As atribuições `new.x := modelo.y;` de um trecho do SQL, sem a da carga do curso. */
function atribuicoes(sql: string): string[] {
  return (sql.match(/new\.\w+ := modelo\.\w+;/g) ?? []).filter((a) => !/carga_horaria/.test(a));
}

test("a função validar_modelo_de_treinamento é recriada, sem perder nenhuma cópia que a 0131 fazia", () => {
  const original = semComentarios(migracao0131);
  const nova = sqlMigracao;
  assert.match(nova, /create or replace function public\.validar_modelo_de_treinamento\(\)/i);
  const antes = atribuicoes(original).sort();
  const depois = atribuicoes(nova).sort();
  assert.ok(antes.length >= 13, "a 0131 mudou: reveja este teste");
  assert.deepEqual(depois, antes);
  // continua intacta a carga do cadastro das funções (a tabela treinamento não tem o CHECK)
  assert.match(compacto(nova), /new\.carga_horaria := modelo\.carga_horaria;/);
});

test("carga do modelo nula, zero ou negativa vira NULL no curso (o CHECK > 0 recusaria o zero)", () => {
  const sql = compacto(sqlMigracao);
  assert.match(
    sql,
    /new\.carga_horaria_horas := case when modelo\.carga_horaria > 0 then modelo\.carga_horaria else null end;/i
  );
  // a atribuição crua da 0131 não pode sobrar na função nova
  assert.doesNotMatch(sql, /new\.carga_horaria_horas := modelo\.carga_horaria;/i);
});

test("a função nova mantém o mesmo gatilho de segurança da 0131 (sem security definer, revoke de execução)", () => {
  const sql = compacto(sqlMigracao);
  assert.match(
    sql,
    /create or replace function public\.validar_modelo_de_treinamento\(\) returns trigger language plpgsql set search_path = public as/i
  );
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(
    sql,
    /revoke all on function public\.validar_modelo_de_treinamento\(\) from public, anon, authenticated;/i
  );
  // o aviso do despublicar-se-modelo-inativo segue nos dois ramos
  assert.equal(
    (sql.match(/if modelo\.ativo is false then new\.ativo := false; end if;/g) ?? []).length,
    2
  );
});

// -------------------------------------------------------------------------- regras do repositório e forma

test("migração: transação, sem mexer em dado real, termina em select 'ok' as res (com a conferência)", () => {
  assert.match(sqlMigracao, /^\s*begin;/i);
  assert.match(sqlMigracao, /\bcommit;/i);
  // o último comando devolve res = 'ok' (A6: ele também traz a conferência, ver o teste abaixo)
  assert.match(migracao.trimEnd(), /select 'ok' as res,[\s\S]*;$/);
  // nenhum UPDATE/DELETE/INSERT/TRUNCATE de dado (o único "update" do arquivo é palavra de comentário)
  assert.doesNotMatch(sqlMigracao, /\b(update|delete from|insert into|truncate)\b/i);
  // e nenhum apagar de objeto que não seja o desta migração
  assert.doesNotMatch(sqlMigracao, /\bdrop (table|column|function|policy|trigger)\b/i);
});

test("migração e script não levam UUID, e-mail, token nem URL (repositório público)", () => {
  for (const [nome, texto] of [
    ["migração", migracao],
    ["conferência", conferencia],
  ] as const) {
    assert.doesNotMatch(
      texto,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      nome
    );
    assert.doesNotMatch(texto, /[\w.+-]+@[\w-]+\.[\w.]+/, nome);
    assert.doesNotMatch(texto, /https?:\/\//i, nome);
  }
});

// ------------------------------------------------------------------------- script de conferência (só leitura)

test("conferência: um comando só, que só lê", () => {
  const comandos = sqlConferencia
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
  assert.equal(comandos.length, 1, "o db query pode devolver só o último comando de um arquivo");
  assert.match(comandos[0], /^with\s/i);
  assert.doesNotMatch(
    sqlConferencia,
    /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|begin|commit|rollback)\b/i
  );
});

test("conferência: uma linha para cada CHECK, o índice, o default e o anon", () => {
  for (const t of TRAVAS) {
    assert.ok(sqlConferencia.includes(`'${t.nome}'`), `falta a linha de ${t.nome}`);
  }
  assert.ok(sqlConferencia.includes("treinamento_matricula_viva_uidx"));
  // a mesma regra dos CHECK é medida no dado (FALSE reprova; NULL passa), incluindo linha excluída logicamente
  assert.match(compacto(sqlConferencia), /nota_minima between 0 and 100\) is false/i);
  assert.match(
    compacto(sqlConferencia),
    /correta >= 0 and correta < jsonb_array_length\(opcoes\)/i
  );
  assert.match(compacto(sqlConferencia), /jsonb_typeof\(opcoes\) = 'array'/i);
  // o anon é conferido pela lista de privilégios da própria tabela (aclexplode), sem nomear os comandos de escrita
  assert.match(compacto(sqlConferencia), /aclexplode\(c\.relacl\).*r\.rolname = 'anon'/i);
  assert.match(sqlConferencia, /column_default/i);
});

test("conferência: C9, o cadastro central (treinamento) dos modelos ligados a curso EAD", () => {
  const sql = compacto(sqlConferencia);
  // modelos de verdade: sem função, sem modelo, vivos, com curso EAD vivo ligado a eles
  assert.match(
    sql,
    /from public\.treinamento m where m\.funcao_id is null and m\.modelo_treinamento_id is null and m\.deleted_at is null/i
  );
  assert.match(sql, /m\.carga_horaria is null/i);
  assert.match(sql, /m\.carga_horaria <= 0/i);
  assert.match(sql, /m\.validade_meses < 0/i);
  assert.match(sql, /c\.modelo_treinamento_id = m\.id and c\.deleted_at is null/i);
});

test("conferência: confere se a função da 0131 em produção ainda é a que a 0139 vai substituir", () => {
  const sql = compacto(sqlConferencia);
  assert.match(
    sql,
    /from pg_proc p where p\.pronamespace = 'public'::regnamespace and p\.proname = 'validar_modelo_de_treinamento'/i
  );
  // reconhece a 0131 (carga crua), a 0139 (carga com guarda) e avisa de qualquer outra coisa
  assert.match(sql, /like '%case when modelo\.carga_horaria > 0%'/i);
  assert.match(sql, /like '%new\.carga_horaria_horas := modelo\.carga_horaria%'/i);
  assert.match(sql, /'DIVERGENTE/);
});

test("conferência: matrícula aberta repetida conta as mesmas linhas que o índice recusaria", () => {
  const sql = compacto(sqlConferencia);
  assert.match(sql, /where deleted_at is null and status <> 'concluido'/i);
  assert.match(sql, /partition by funcionario_id, curso_id\) as qtd/i);
  assert.match(sql, /where d\.qtd > 1/i);
});

// ------------------------------------------------------------------------------------- supabase/config.toml

/** O valor de `verify_jwt` do bloco `[functions.<nome>]`, ou undefined se o bloco não existe. */
function verifyJwtDe(funcao: string): boolean | undefined {
  const bloco = new RegExp(`^\\[functions\\.${funcao}\\]\\s*\\n((?:(?!\\[).*\\n?)*)`, "m").exec(
    configToml
  );
  if (!bloco) return undefined;
  const linha = /^\s*verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/m.exec(bloco[1]);
  return linha ? linha[1] === "true" : undefined;
}

test("config.toml: portal-funcionario e funcionario-acesso sem JWT no gateway (têm autenticação própria)", () => {
  assert.equal(verifyJwtDe("portal-funcionario"), false);
  assert.equal(verifyJwtDe("funcionario-acesso"), false);
});

test("config.toml: validar-certificado com JWT no gateway (única função do EAD com verify_jwt = true)", () => {
  assert.equal(verifyJwtDe("validar-certificado"), true);
});

test("config.toml: as funções do conector continuam como estavam (verify_jwt = false)", () => {
  assert.equal(verifyJwtDe("mcp"), false);
  assert.equal(verifyJwtDe("mcp-oauth"), false);
});

// ------------------------------------------------------------------------------------------ A6 (revisão 1)

test("validade negativa do modelo vira NULL no curso (o CHECK validade_meses >= 0 recusaria)", () => {
  const sql = compacto(sqlMigracao);
  // no ramo do curso (depois da carga), e o ramo das exigências das funções continua copiando como era
  const nova =
    /new\.validade_meses := case when modelo\.validade_meses >= 0 then modelo\.validade_meses else null end;/i;
  assert.match(sql, nova);
  const posNova = sql.search(nova);
  const posCarga = sql.search(/new\.carga_horaria_horas := case when/i);
  assert.ok(posNova > posCarga, "a guarda da validade fica no ramo do curso, junto da carga");
  assert.match(sql, /new\.validade_meses := modelo\.validade_meses;/);
  // a cópia crua só sobra uma vez (a das duas tabelas, antes do ramo do curso sobrescrever)
  assert.equal((sql.match(/new\.validade_meses := modelo\.validade_meses;/g) ?? []).length, 1);
});

test("a conferência é o ÚLTIMO resultado: um comando só, res = 'ok' e a situação das 7 travas e do índice", () => {
  const depoisDoCommit = sqlMigracao.slice(sqlMigracao.search(/\bcommit;/i) + "commit;".length);
  const comandos = depoisDoCommit
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
  assert.equal(comandos.length, 1, "depois do commit só pode haver o resultado final");
  const ultimo = compacto(comandos[0]);
  assert.match(ultimo, /^with travas as \(/i);
  assert.match(ultimo, /select 'ok' as res,/i);
  for (const coluna of ["travas_validadas", "travas_not_valid", "indice_unico", "conferencia"]) {
    assert.ok(ultimo.includes(` as ${coluna}`), `falta a coluna ${coluna}`);
  }
  for (const t of TRAVAS) assert.ok(ultimo.includes(`'${t.nome}'`), `falta ${t.nome}`);
  assert.ok(ultimo.includes("treinamento_matricula_viva_uidx"));
  assert.match(ultimo, /'tudo aplicado'/);
  assert.match(ultimo, /ATENÇÃO/);
  // só lê
  assert.doesNotMatch(
    ultimo,
    /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke)\b/i
  );
});

test("o comentário do passo 3 não diz que o VALIDATE não bloqueia, e a migração pede o bloqueio com prazo", () => {
  assert.doesNotMatch(migracao, /VALIDATE CONSTRAINT não bloqueia/i);
  assert.match(migracao, /ACCESS EXCLUSIVE/);
  // lock_timeout só vale nesta transação: se outra sessão segura a tabela, desiste e desfaz tudo
  assert.match(sqlMigracao, /begin;\s*set local lock_timeout = '10s';/i);
});
