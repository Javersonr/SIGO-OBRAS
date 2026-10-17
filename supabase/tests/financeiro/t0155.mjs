import assert from "node:assert/strict";
import { novoBanco, um, todos, comoUsuario, aplicar, falha } from "./harness.mjs";

const E1 = "00000000-0000-0000-0000-0000000000e1",
  E2 = "00000000-0000-0000-0000-0000000000e2";
const U1 = { sub: "00000000-0000-0000-0000-000000000001", app_metadata: { empresa_id: E1 } };
const U2 = { sub: "00000000-0000-0000-0000-000000000002", app_metadata: { empresa_id: E2 } };

export async function montar(extras = []) {
  const db = await novoBanco();
  await db.query("insert into empresa(id,nome) values ($1,'A'),($2,'B')", [E1, E2]);
  return db;
}

const db = await montar();
const conta = (
  await um(
    db,
    "insert into conta_financeira(empresa_id,nome,tipo,saldo_inicial) values ($1,'Banco','Banco',1000) returning id",
    [E1]
  )
).id;
const conta2 = (
  await um(
    db,
    "insert into conta_financeira(empresa_id,nome,tipo,saldo_inicial) values ($1,'Caixa','Caixa',50) returning id",
    [E1]
  )
).id;
await db.query("select recalcular_saldo_conta($1), recalcular_saldo_conta($2)", [conta, conta2]);
const saldo = async (c = conta) =>
  Number((await um(db, "select saldo_atual from conta_financeira where id=$1", [c])).saldo_atual);
const linhas = async (tx) =>
  todos(
    db,
    "select hash_linha, valor::float as valor, data::text as data, deleted_at is null as viva from extrato_bancario where transacao_id=$1 order by hash_linha nulls first, created_at",
    [tx]
  );
const vivas = async (tx) => (await linhas(tx)).filter((l) => l.viva);

// ---------- LEGADO (antes da 0155): como o front grava hoje ----------
// a) paga pelo ModalPagamento: status Realizado e NENHUMA linha no extrato
const legPaga = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,data_pagamento,descricao) values ($1,'Despesa',$2,100,'2026-09-01','Realizado','2026-09-02','luz') returning id",
    [E1, conta]
  )
).id;
// b) parcelada: 3 parcelas em aberto, com as 3 lançadas no extrato ANTES de pagar
const parc = JSON.stringify([
  { numero: 1, valor: "200", data_vencimento: "2026-10-10", status: "em_aberto" },
  { numero: 2, valor: "200", data_vencimento: "2026-11-10", status: "em_aberto" },
  { numero: 3, valor: "200", data_vencimento: "2026-12-10", status: "em_aberto" },
]);
const legParc = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,parcelado,parcelas,descricao) values ($1,'Despesa',$2,600,'2026-09-01','em_aberto',true,to_jsonb($3::text),'material') returning id",
    [E1, conta, parc]
  )
).id;
for (const d of ["2026-10-10", "2026-11-10", "2026-12-10"])
  await db.query(
    "insert into extrato_bancario(empresa_id,conta_id,data,descricao,valor,tipo,origem,transacao_id) values ($1,$2,$3,'material',-200,'debito','manual',$4)",
    [E1, conta, d, legParc]
  );
// c) OFX importado com valor ABSOLUTO (débito de 100 entrou como +100)
await db.query(
  "insert into extrato_bancario(empresa_id,conta_id,data,descricao,valor,tipo,status_conciliacao) values ($1,$2,'2026-09-02','PAG LUZ',100,'debito','pendente')",
  [E1, conta]
);
// d) transferência atômica
await db.query("select criar_transferencia_atomica($1,$2,$3,30,'2026-09-03','t')", [
  E1,
  conta,
  conta2,
]);
assert.equal(await saldo(), 1000 - 600 + 100 - 30, "saldo legado errado como em produção");
// e) parcelada "paga pelo status" (baixa em lote antiga): parcelas em aberto no JSON e as
//    duas lançadas no extrato na criação (na conta 2, para não mexer nos saldos acima)
const legPagaStatus = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,data_pagamento,parcelado,parcelas,descricao) values ($1,'Despesa',$2,300,'2026-08-01','pago','2026-08-20',true,to_jsonb($3::text),'andaime') returning id",
    [
      E1,
      conta2,
      JSON.stringify([
        { numero: 1, valor: "150,00", data_vencimento: "2026-08-10", status: "em_aberto" },
        { numero: 2, valor: "150,00", data_vencimento: "2026-09-10", status: "em_aberto" },
      ]),
    ]
  )
).id;
for (const d of ["2026-08-10", "2026-09-10"])
  await db.query(
    "insert into extrato_bancario(empresa_id,conta_id,data,descricao,valor,tipo,origem,transacao_id) values ($1,$2,$3,'andaime',-150,'debito','manual',$4)",
    [E1, conta2, d, legPagaStatus]
  );
const saldoConta2Legado = await saldo(conta2);

await aplicar(db, "0155_extrato_derivado_da_transacao.sql");

// a migração normaliza o JSON da parcelada paga pelo status (tudo pago, na data de pagamento
// da despesa), sem mexer no extrato: as 2 linhas antigas continuam e o saldo não muda
const jsonNorm = await um(db, "select parcelas from transacao_financeira where id=$1", [
  legPagaStatus,
]);
const parcNorm =
  typeof jsonNorm.parcelas === "string" ? JSON.parse(jsonNorm.parcelas) : jsonNorm.parcelas;
assert.deepEqual(
  parcNorm.map((x) => [x.status, x.data_pagamento]),
  [
    ["pago", "2026-08-20"],
    ["pago", "2026-08-20"],
  ]
);
assert.equal((await vivas(legPagaStatus)).length, 2);
assert.equal(await saldo(conta2), saldoConta2Legado);

// mudança que não mexe em dinheiro NÃO corrige o legado de carona: descrição editada e o
// cron de atrasados (em_aberto → atrasado) deixam as parcelas lançadas antes de pagar
await db.query("update transacao_financeira set descricao='material (obra 2)' where id=$1", [
  legParc,
]);
await db.query("update transacao_financeira set descricao='andaime alugado' where id=$1", [
  legPagaStatus,
]);
await db.query("update transacao_financeira set status='atrasado' where id=$1", [legParc]);
assert.equal((await vivas(legParc)).length, 3, "legado só muda pelo ressincronizar");
assert.equal((await vivas(legPagaStatus)).length, 2);
assert.equal(
  await saldo(conta2),
  saldoConta2Legado,
  "parcelada paga pelo status não perdeu linhas"
);
await db.query("update transacao_financeira set status='em_aberto' where id=$1", [legParc]);

// ---------- diagnóstico do legado ----------
let diag = await todos(
  db,
  "select transacao_id, valor_esperado::float as e, valor_gravado::float as g from financeiro_diagnostico_extrato($1) order by 1",
  [E1]
);
assert.equal(diag.length, 2);
assert.deepEqual(
  diag.find((d) => d.transacao_id === legPaga),
  { transacao_id: legPaga, e: -100, g: 0 }
);
assert.deepEqual(
  diag.find((d) => d.transacao_id === legParc),
  { transacao_id: legParc, e: 0, g: -600 }
);
assert.equal((await um(db, "select financeiro_ressincronizar_extrato($1) as n", [E1])).n, 2);
assert.equal((await todos(db, "select * from financeiro_diagnostico_extrato($1)", [E1])).length, 0);
assert.equal(
  await saldo(),
  1000 - 100 + 100 - 30,
  "saldo após ressincronizar (OFX ainda conta até a 0156)"
);

// ---------- fluxo novo, como usuário da empresa ----------
await comoUsuario(db, U1);
await falha(db.query("select * from financeiro_diagnostico_extrato($1)", [E1]), /servidor/);
const tx = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,conta_nome,valor,data,data_vencimento,status,descricao) values ($1,'Despesa',$2,'Banco',50,'2026-09-10','2026-09-15','em_aberto','aluguel') returning id",
    [E1, conta]
  )
).id;
const base = await saldo();
assert.equal((await vivas(tx)).length, 0, "em aberto não mexe no extrato");

await db.query(
  "update transacao_financeira set status='Realizado', data_pagamento='2026-09-14' where id=$1",
  [tx]
);
assert.deepEqual(await vivas(tx), [
  { hash_linha: `tx:${tx}`, valor: -50, data: "2026-09-14", viva: true },
]);
assert.equal(await saldo(), base - 50);

// front antigo ainda insere a linha na mão → duplicata descartada
await db.query(
  "insert into extrato_bancario(empresa_id,conta_id,data,descricao,valor,tipo,origem,transacao_id) values ($1,$2,'2026-09-14','aluguel',-50,'debito','manual',$3)",
  [E1, conta, tx]
);
assert.equal((await vivas(tx)).length, 1);
assert.equal(await saldo(), base - 50);

// muda valor e conta da transação paga → linha acompanha
await db.query("update transacao_financeira set valor=70 where id=$1", [tx]);
assert.equal(await saldo(), base - 70);
const base2 = await saldo(conta2);
await db.query("update transacao_financeira set conta_id=$2, conta_nome='Caixa' where id=$1", [
  tx,
  conta2,
]);
assert.equal(await saldo(), base, "saiu da conta antiga");
assert.equal(await saldo(conta2), base2 - 70, "entrou na nova");
await db.query("update transacao_financeira set conta_id=$2, conta_nome='Banco' where id=$1", [
  tx,
  conta,
]);
assert.equal(await saldo(conta2), base2);

// estorno (Marcar como Pendente) → linha sai; pagar de novo → revive (sem violar o unique)
await db.query(
  "update transacao_financeira set status='em_aberto', data_pagamento=null where id=$1",
  [tx]
);
assert.equal((await vivas(tx)).length, 0);
assert.equal(await saldo(), base);
await db.query(
  "update transacao_financeira set status='pago', data_pagamento='2026-09-20' where id=$1",
  [tx]
);
assert.equal(await saldo(), base - 70);

// baixa em lote antiga (só status, sem data) → usa o vencimento
const tx2 = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,data_vencimento,status,descricao) values ($1,'receita',$2,300,'2026-09-10','2026-09-25','em_aberto','medição') returning id",
    [E1, conta]
  )
).id;
await db.query("update transacao_financeira set status='pago' where id=$1", [tx2]);
assert.deepEqual(await vivas(tx2), [
  { hash_linha: `tx:${tx2}`, valor: 300, data: "2026-09-25", viva: true },
]);

// parcelada nova: nada no extrato até pagar a parcela
const p3 = JSON.stringify([
  { numero: 1, valor: "1.000,50", data_vencimento: "2026-10-01", status: "em_aberto" },
  { numero: 2, valor: 999.5, data_vencimento: "lixo", status: "em_aberto" },
]);
const tp = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,parcelado,parcelas,descricao) values ($1,'Despesa',$2,2000,'2026-09-10','em_aberto',true,to_jsonb($3::text),'obra') returning id",
    [E1, conta, p3]
  )
).id;
// front antigo lança as 2 parcelas no extrato na criação → descartadas
await db.query(
  "insert into extrato_bancario(empresa_id,conta_id,data,valor,origem,transacao_id) values ($1,$2,'2026-10-01',-1000.5,'manual',$3),($1,$2,'2026-11-01',-999.5,'manual',$3)",
  [E1, conta, tp]
);
assert.equal((await vivas(tp)).length, 0);
const base3 = await saldo();
const pagas = JSON.stringify([
  { numero: 1, valor: "1.000,50", data_vencimento: "2026-10-01", status: "em_aberto" },
  {
    numero: 2,
    valor: 999.5,
    data_vencimento: "lixo",
    status: "pago",
    data_pagamento: "2026-10-05",
  },
]);
await db.query("update transacao_financeira set parcelas=to_jsonb($2::text) where id=$1", [
  tp,
  pagas,
]);
assert.deepEqual(await vivas(tp), [
  { hash_linha: `tx:${tp}:p2`, valor: -999.5, data: "2026-10-05", viva: true },
]);
assert.equal(await saldo(), base3 - 999.5);
// parcela 1 paga com valor "1.000,50" (formato BR)
const ambas = JSON.stringify([
  { numero: 1, valor: "1.000,50", data_vencimento: "2026-10-01", status: "pago" },
  {
    numero: 2,
    valor: 999.5,
    data_vencimento: "lixo",
    status: "pago",
    data_pagamento: "2026-10-05",
  },
]);
await db.query("update transacao_financeira set parcelas=$2::jsonb where id=$1", [tp, ambas]); // jsonb de verdade também
assert.equal(await saldo(), base3 - 2000);
// desfaz as parcelas
await db.query("update transacao_financeira set parcelas=to_jsonb($2::text) where id=$1", [tp, p3]);
assert.equal(await saldo(), base3);
// JSON inválido não derruba
await db.query("update transacao_financeira set parcelas=to_jsonb('{quebrado'::text) where id=$1", [
  tp,
]);

// imposto retido da medição e transação sem conta: nunca no extrato
const imp = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,valor,data,status,referencia_tipo,descricao) values ($1,'Despesa',10,'2026-09-10','pago','medicao_obra_imposto','ISS') returning id",
    [E1]
  )
).id;
assert.equal((await vivas(imp)).length, 0);
const imp2 = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,referencia_tipo,descricao) values ($1,'Despesa',$2,10,'2026-09-10','pago','medicao_obra_imposto','ISS') returning id",
    [E1, conta]
  )
).id;
assert.equal((await vivas(imp2)).length, 0);
// cancelada: sem linha
const canc = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,descricao) values ($1,'Despesa',$2,10,'2026-09-10','Cancelado','c') returning id",
    [E1, conta]
  )
).id;
assert.equal((await vivas(canc)).length, 0);

// tipo desconhecido (legado): intocado
await comoUsuario(db, null);
const legTipo = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,descricao) values ($1,'Transferência',$2,5,'2026-09-10','pago','x') returning id",
    [E1, conta]
  )
).id;
await db.query(
  "insert into extrato_bancario(empresa_id,conta_id,data,valor,origem,transacao_id,hash_linha) values ($1,$2,'2026-09-10',-5,'Manual',$3,'legado:1')",
  [E1, conta, legTipo]
);
await db.query("update transacao_financeira set descricao='y' where id=$1", [legTipo]);
assert.equal((await vivas(legTipo)).length, 1);
await comoUsuario(db, U1);

// conciliação: transação paga ligada a uma linha do banco
const ofx = (
  await um(
    db,
    "insert into extrato_bancario(empresa_id,conta_id,data,descricao,valor,tipo,status_conciliacao,origem,hash_linha) values ($1,$2,'2026-09-20','ALUGUEL',-70,'debito','conciliado','OFX','ofx:F1') returning id",
    [E1, conta]
  )
).id;
await db.query("update extrato_bancario set transacao_id=$2 where id=$1", [ofx, tx]);
await db.query("update transacao_financeira set conciliado=true, extrato_id=$2 where id=$1", [
  tx,
  ofx,
]);
await falha(
  db.query("update transacao_financeira set status='em_aberto' where id=$1", [tx]),
  /conciliação/
);
await falha(
  db.query("update transacao_financeira set deleted_at=now() where id=$1", [tx]),
  /conciliação/
);
await falha(
  db.query("update extrato_bancario set deleted_at=now() where id=$1", [ofx]),
  /conciliada/
);
// desfaz a conciliação (conciliado=false) e exclui: linha do banco volta a pendente, a do sistema sai
await db.query("update transacao_financeira set conciliado=false where id=$1", [tx]);
const antes = await saldo();
await db.query("update transacao_financeira set deleted_at=now() where id=$1", [tx]);
assert.equal((await vivas(tx)).filter((l) => l.hash_linha?.startsWith("tx:")).length, 0);
const o = await um(
  db,
  "select transacao_id, status_conciliacao, deleted_at from extrato_bancario where id=$1",
  [ofx]
);
assert.deepEqual(o, { transacao_id: null, status_conciliacao: "pendente", deleted_at: null });
assert.equal(await saldo(), antes + 70);

// hard delete também limpa
await db.query("delete from transacao_financeira where id=$1", [tx2]);
assert.equal((await vivas(tx2)).length, 0);

// tenant: usuário de outra empresa não re-sincroniza transação alheia
const tx3 = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,descricao) values ($1,'Despesa',$2,1,'2026-09-10','pago','z') returning id",
    [E1, conta]
  )
).id;
await comoUsuario(db, U2);
await falha(
  db.query(
    "insert into extrato_bancario(empresa_id,conta_id,data,valor,transacao_id) values ($1,$2,'2026-09-10',-1,$3)",
    [E2, conta, tx3]
  ),
  /outra empresa/
);

// PlanoContas antigo zerava saldo_atual → agora saldo_atual é recalculado
await comoUsuario(db, U1);
const s = await saldo();
await db.query("update conta_financeira set codigo_contabil='1.1', saldo_atual=0 where id=$1", [
  conta,
]);
assert.equal(await saldo(), s, "saldo_atual não é mais sobrescrito");
await db.query("update conta_financeira set saldo_inicial=0, saldo_atual=0 where id=$1", [conta]);
assert.equal(
  await saldo(),
  s - 1000,
  "saldo_inicial zerado reflete só o inicial (o front deixa de mandar)"
);

// transferência continua intocada pelas regras novas
await db.query("select criar_transferencia_atomica($1,$2,$3,10,'2026-09-03','t2')", [
  E1,
  conta,
  conta2,
]);
assert.equal(
  (
    await todos(
      db,
      "select 1 from extrato_bancario where hash_linha like 'transf:%' and deleted_at is null"
    )
  ).length,
  4
);

// ---------- parcela paga/desfeita no banco (financeiro_marcar_parcela) ----------
await comoUsuario(db, U1);
const tpar = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,parcelado,parcelas,descricao) values ($1,'Despesa',$2,90,'2026-09-01','em_aberto',true,to_jsonb($3::text),'brita') returning id",
    [
      E1,
      conta,
      JSON.stringify([
        { numero: 1, valor: 30, data_vencimento: "2026-09-10", status: "em_aberto" },
        { numero: 2, valor: 30, data_vencimento: "2026-10-10", status: "em_aberto" },
        { numero: 3, valor: 30, data_vencimento: "2026-11-10", status: "em_aberto" },
      ]),
    ]
  )
).id;
const antesPar = await saldo();
await db.query("select financeiro_marcar_parcela($1,0,true,'2026-09-11')", [tpar]);
// a tela com a cópia velha não regrava o JSON: pagar a 2 mantém a 1 paga
await db.query("select financeiro_marcar_parcela($1,1,true,'2026-10-11')", [tpar]);
assert.equal(await saldo(), antesPar - 60);
assert.deepEqual((await vivas(tpar)).map((l) => l.data).sort(), ["2026-09-11", "2026-10-11"]);
assert.equal(
  (await um(db, "select status from transacao_financeira where id=$1", [tpar])).status,
  "em_aberto"
);
await db.query("select financeiro_marcar_parcela($1,2,true,'2026-11-11')", [tpar]);
let tparRow = await um(
  db,
  "select status, data_pagamento::text as dp from transacao_financeira where id=$1",
  [tpar]
);
assert.deepEqual(tparRow, { status: "pago", dp: "2026-11-11" }, "todas pagas → despesa paga");
await db.query("select financeiro_marcar_parcela($1,0,false)", [tpar]);
tparRow = await um(db, "select status, data_pagamento from transacao_financeira where id=$1", [
  tpar,
]);
assert.deepEqual(tparRow, { status: "em_aberto", data_pagamento: null });
assert.equal(await saldo(), antesPar - 60, "desfazer a 1 devolve só os 30 dela");
await falha(db.query("select financeiro_marcar_parcela($1,3,true)", [tpar]), /não existe/);
const simples = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,descricao) values ($1,'Despesa',$2,5,'2026-09-01','em_aberto','simples') returning id",
    [E1, conta]
  )
).id;
await falha(db.query("select financeiro_marcar_parcela($1,0,true)", [simples]), /não é parcelado/);
await comoUsuario(db, U2);
await falha(db.query("select financeiro_marcar_parcela($1,0,true)", [tpar]), /outra empresa/);
await comoUsuario(db, U1);

// descrição alterada numa transação com linha da regra nova: o texto da linha acompanha
await db.query("update transacao_financeira set descricao='brita lavada' where id=$1", [tpar]);
assert.ok(
  (
    await todos(
      db,
      "select historico from extrato_bancario where transacao_id=$1 and deleted_at is null",
      [tpar]
    )
  ).every((l) => l.historico === "brita lavada")
);

// cron de atrasados (servidor) continua funcionando com o trigger
await comoUsuario(db, null);
await db.query(
  "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,data_vencimento,status,descricao) values ($1,'Despesa',$2,9,'2026-01-01','2026-01-10','em_aberto','velha')",
  [E1, conta]
);
assert.ok((await um(db, "select marcar_transacoes_atrasadas() as n")).n >= 1);
console.log("0155 OK");
