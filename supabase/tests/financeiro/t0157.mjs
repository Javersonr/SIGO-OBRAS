import assert from "node:assert/strict";
import { novoBanco, um, todos, comoUsuario, aplicar, falha } from "./harness.mjs";

const E1 = "00000000-0000-0000-0000-0000000000e1",
  E2 = "00000000-0000-0000-0000-0000000000e2";
const U1 = { sub: "00000000-0000-0000-0000-000000000001", app_metadata: { empresa_id: E1 } };
const U2 = { sub: "00000000-0000-0000-0000-000000000002", app_metadata: { empresa_id: E2 } };

const db = await novoBanco();
await db.query("insert into empresa(id,nome) values ($1,'A'),($2,'B')", [E1, E2]);
const conta = (
  await um(
    db,
    "insert into conta_financeira(empresa_id,nome,tipo) values ($1,'Banco','Banco') returning id",
    [E1]
  )
).id;
const conta2 = (
  await um(
    db,
    "insert into conta_financeira(empresa_id,nome,tipo) values ($1,'Banco B','Banco') returning id",
    [E2]
  )
).id;

// reproduz o bug ANTES da 0157: gerou jan..hoje, editou (proxima volta p/ início), cron duplica
const inicio = "2026-01-05";
const rec = (
  await um(
    db,
    "insert into transacao_recorrente(empresa_id,tipo,descricao,valor,conta_id,frequencia,data_inicio,proxima_geracao,dia_vencimento) values ($1,'despesa','aluguel',1000,$2,'mensal',$3,$3,5) returning id",
    [E1, conta, inicio]
  )
).id;
const n1 = (await um(db, "select processar_recorrencias_vencidas() as n")).n;
await db.query("update transacao_recorrente set proxima_geracao=$2 where id=$1", [rec, inicio]); // edição antiga
const n2 = (await um(db, "select processar_recorrencias_vencidas() as n")).n;
assert.equal(n2, n1, "bug reproduzido: gera tudo de novo");
const dup = (
  await um(db, "select count(*)::int as n from transacao_financeira where referencia_id=$1", [rec])
).n;
assert.equal(dup, 2 * n1);

await aplicar(db, "0155_extrato_derivado_da_transacao.sql");
await aplicar(db, "0157_recorrencia_idempotente.sql");

// nova recorrência: gera, edição não volta, cron não duplica
const rec2 = (
  await um(
    db,
    "insert into transacao_recorrente(empresa_id,tipo,descricao,valor,conta_id,frequencia,data_inicio,proxima_geracao,dia_vencimento) values ($1,'receita','contrato',500,$2,'mensal',$3,$3,10) returning id",
    [E1, conta, "2026-03-10"]
  )
).id;
const g = (await um(db, "select processar_recorrencias_vencidas() as n")).n;
assert.ok(g >= 6, "gerou mar..set");
const prox = (
  await um(db, "select proxima_geracao::text as p from transacao_recorrente where id=$1", [rec2])
).p;

await comoUsuario(db, U1);
// edição pelo app mandando proxima_geracao = data_inicio (como o front antigo)
await db.query(
  "update transacao_recorrente set valor=600, proxima_geracao=data_inicio where id=$1",
  [rec2]
);
assert.equal(
  (await um(db, "select proxima_geracao::text as p from transacao_recorrente where id=$1", [rec2]))
    .p,
  prox,
  "não volta"
);
assert.equal((await um(db, "select processar_recorrencias_empresa() as n")).n, 0);

// mesmo que o servidor volte a data, não duplica; ocorrência excluída não volta
await comoUsuario(db, null);
const umaOc = (
  await um(db, "select id from transacao_financeira where referencia_id=$1 order by data limit 1", [
    rec2,
  ])
).id;
await db.query("update transacao_financeira set deleted_at=now() where id=$1", [umaOc]);
await db.query("update transacao_recorrente set proxima_geracao=data_inicio where id=$1", [rec2]);
assert.equal((await um(db, "select processar_recorrencias_vencidas() as n")).n, 0);
const porData = await todos(
  db,
  "select data, count(*)::int as n from transacao_financeira where referencia_id=$1 group by data having count(*)>1",
  [rec2]
);
assert.equal(porData.length, 0);

// recorrência nova, sem ocorrências: o app pode ajustar a data livremente
await comoUsuario(db, U1);
const rec3 = (
  await um(
    db,
    "insert into transacao_recorrente(empresa_id,tipo,descricao,valor,conta_id,frequencia,data_inicio,proxima_geracao) values ($1,'despesa','seguro',80,$2,'anual','2027-01-01','2027-01-01') returning id",
    [E1, conta]
  )
).id;
await db.query(
  "update transacao_recorrente set data_inicio='2026-12-01', proxima_geracao='2026-12-01' where id=$1",
  [rec3]
);
assert.equal(
  (await um(db, "select proxima_geracao::text as p from transacao_recorrente where id=$1", [rec3]))
    .p,
  "2026-12-01"
);

// botão só processa a própria empresa (começa no dia 1 do mês corrente: exatamente 1 ocorrência vencida)
await comoUsuario(db, null);
const rB = (
  await um(
    db,
    "insert into transacao_recorrente(empresa_id,tipo,descricao,valor,conta_id,frequencia,data_inicio,proxima_geracao) values ($1,'despesa','b',1,$2,'mensal',date_trunc('month', current_date)::date,date_trunc('month', current_date)::date) returning id",
    [E2, conta2]
  )
).id;
await comoUsuario(db, U1);
await db.query("select processar_recorrencias_empresa()");
assert.equal(
  (await um(db, "select count(*)::int as n from transacao_financeira where referencia_id=$1", [rB]))
    .n,
  0,
  "não tocou a empresa B"
);
await comoUsuario(db, U2);
assert.equal((await um(db, "select processar_recorrencias_empresa() as n")).n, 1);
// o botão roda com o login do usuário e AVANÇA a próxima geração (só voltar é proibido)
assert.ok(
  (
    await um(
      db,
      "select proxima_geracao > date_trunc('month', current_date)::date as ok from transacao_recorrente where id=$1",
      [rB]
    )
  ).ok,
  "Processar Agora avança a próxima geração"
);
await comoUsuario(db, { sub: "00000000-0000-0000-0000-000000000009" }); // sem empresa
await falha(db.query("select processar_recorrencias_empresa()"), /outra empresa|login/);
console.log("0157 OK");
