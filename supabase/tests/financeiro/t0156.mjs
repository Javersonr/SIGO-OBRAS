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
    "insert into conta_financeira(empresa_id,nome,tipo,saldo_inicial) values ($1,'Banco','Banco',1000) returning id",
    [E1]
  )
).id;
const conta2 = (
  await um(
    db,
    "insert into conta_financeira(empresa_id,nome,tipo,saldo_inicial) values ($1,'Caixa','Caixa',0) returning id",
    [E1]
  )
).id;
const saldo = async (c = conta) =>
  Number((await um(db, "select saldo_atual from conta_financeira where id=$1", [c])).saldo_atual);

// legado: pagamento do sistema (-100) + mesma saída importada do OFX em valor absoluto (+100)
const pago = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,data_pagamento,descricao) values ($1,'Despesa',$2,100,'2026-09-01','pago','2026-09-02','luz') returning id",
    [E1, conta]
  )
).id;
await db.query(
  "insert into extrato_bancario(empresa_id,conta_id,data,valor,origem,transacao_id) values ($1,$2,'2026-09-02',-100,'manual',$3)",
  [E1, conta, pago]
);
await db.query(
  "insert into extrato_bancario(empresa_id,conta_id,data,descricao,valor,tipo,status_conciliacao) values ($1,$2,'2026-09-02','PAG LUZ',100,'debito','pendente')",
  [E1, conta]
);
await db.query("select recalcular_saldo_conta($1)", [conta]);
assert.equal(await saldo(), 1000, "produção hoje: a saída de 100 não aparece no saldo");

await aplicar(db, "0155_extrato_derivado_da_transacao.sql");
await aplicar(db, "0156_conciliacao_ofx_atomica.sql");
assert.equal(await saldo(), 900, "linha importada não soma mais");

// importação: sinal preservado, dedup por FITID e por conteúdo
await comoUsuario(db, U1);
const linhas = [
  { data: "2026-09-10", valor: -50, descricao: "TARIFA", fitid: "A1" },
  { data: "2026-09-11", valor: "1.234,56", descricao: "TED RECEBIDA", fitid: "A2" },
  { data: "2026-09-12", valor: -10, descricao: "PIX" },
  { data: "2026-09-12", valor: -10, descricao: "PIX" }, // idêntica e legítima
  { data: "lixo", valor: -1 },
  { data: "2026-09-13", valor: 0 },
];
let r = (
  await um(db, "select importar_extrato_bancario($1,$2::jsonb,'set.ofx') as r", [
    conta,
    JSON.stringify(linhas),
  ])
).r;
assert.deepEqual(
  { ...r, upload_id: undefined },
  { upload_id: undefined, total: 6, importadas: 4, duplicadas: 0, invalidas: 2 }
);
const imp = await todos(
  db,
  "select valor::float as valor, tipo, origem, status_conciliacao from extrato_bancario where upload_id=$1 order by data, valor",
  [r.upload_id]
);
assert.deepEqual(
  imp.map((l) => l.valor),
  [-50, 1234.56, -10, -10]
);
assert.ok(imp.every((l) => l.origem === "OFX" && l.status_conciliacao === "pendente"));
assert.equal(await saldo(), 900, "importar não mexe no saldo");
r = (
  await um(db, "select importar_extrato_bancario($1,$2::jsonb,'set.ofx') as r", [
    conta,
    JSON.stringify(linhas),
  ])
).r;
assert.equal(r.importadas, 0);
assert.equal(r.duplicadas, 4, "reimportar o mesmo arquivo não duplica");
const up = await um(
  db,
  "select status, total_linhas, linhas_importadas, periodo_inicio::text as ini from upload_ofx where id=$1",
  [r.upload_id]
);
assert.deepEqual(up, { status: "Processado", total_linhas: 6, linhas_importadas: 0, ini: null });

// outra empresa não importa na minha conta
await comoUsuario(db, U2);
await falha(db.query("select importar_extrato_bancario($1,'[]'::jsonb)", [conta]), /outra empresa/);
await comoUsuario(db, U1);

// conciliação: despesa em aberto é baixada na data da linha
const tarifa = (await um(db, "select id from extrato_bancario where hash_linha='ofx:A1'")).id;
const desp = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,data_vencimento,status,descricao) values ($1,'Despesa',$2,50,'2026-09-01','2026-09-15','em_aberto','tarifa') returning id",
    [E1, conta]
  )
).id;
await db.query("select conciliar_extrato($1,$2)", [tarifa, desp]);
let t = await um(
  db,
  "select status, data_pagamento::text as dp, conciliado, extrato_id from transacao_financeira where id=$1",
  [desp]
);
assert.deepEqual(t, { status: "pago", dp: "2026-09-10", conciliado: true, extrato_id: tarifa });
let e = await um(
  db,
  "select status_conciliacao, transacao_id, conciliado from extrato_bancario where id=$1",
  [tarifa]
);
assert.deepEqual(e, { status_conciliacao: "conciliado", transacao_id: desp, conciliado: true });
assert.equal(await saldo(), 850, "pagamento entrou uma vez só (linha do sistema)");

// não concilia de novo nem com conta diferente
await falha(db.query("select conciliar_extrato($1,$2)", [tarifa, desp]), /já está conciliada/);
const pix = (
  await um(
    db,
    "select id from extrato_bancario where upload_id is not null and valor=-10 and transacao_id is null limit 1"
  )
).id;
await falha(db.query("select conciliar_extrato($1,$2)", [pix, desp]), /já está conciliado/);
const outraConta = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,descricao) values ($1,'Despesa',$2,10,'2026-09-01','pago','pix') returning id",
    [E1, conta2]
  )
).id;
await falha(db.query("select conciliar_extrato($1,$2)", [pix, outraConta]), /outra conta/);
// linha do sistema não é conciliável
const linhaSist = (
  await um(db, "select id from extrato_bancario where hash_linha=$1", [`tx:${desp}`])
).id;
const d2 = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,descricao) values ($1,'Despesa',$2,5,'2026-09-01','pago','x') returning id",
    [E1, conta]
  )
).id;
await falha(db.query("select conciliar_extrato($1,$2)", [linhaSist, d2]), /importadas/);

// estorno bloqueado enquanto conciliado; desconciliar libera
await falha(
  db.query("update transacao_financeira set status='em_aberto' where id=$1", [desp]),
  /conciliação/
);
assert.equal((await um(db, "select desconciliar_transacao($1) as n", [desp])).n, 1);
e = await um(
  db,
  "select status_conciliacao, transacao_id, conciliado from extrato_bancario where id=$1",
  [tarifa]
);
assert.deepEqual(e, { status_conciliacao: "pendente", transacao_id: null, conciliado: false });
await db.query(
  "update transacao_financeira set status='em_aberto', data_pagamento=null where id=$1",
  [desp]
);
assert.equal(await saldo(), 895, "volta ao saldo sem a tarifa (d2 de 5 continua paga)");

// reimportar período já importado ANTES da 0156 (sem hash, valor sem sinal) não duplica:
// a linha legada "PAG LUZ" de 100 (débito) em 02/09 casa com a saída de 100 do arquivo novo,
// mesmo com outra descrição; uma segunda saída igual no arquivo entra (só havia 1 no legado)
r = (
  await um(db, "select importar_extrato_bancario($1,$2::jsonb,'reimport.ofx') as r", [
    conta,
    JSON.stringify([
      { data: "2026-09-02", valor: -100, descricao: "PAGAMENTO ENERGIA", fitid: "L1" },
      { data: "2026-09-02", valor: -100, descricao: "PAGAMENTO ENERGIA", fitid: "L2" },
      { data: "2026-09-02", valor: 100, descricao: "ESTORNO", fitid: "L3" }, // entrada: não casa com o débito legado
    ]),
  ])
).r;
assert.equal(r.duplicadas, 1, "a saída legada conta como já importada");
assert.equal(r.importadas, 2);

// sentido: receita não concilia com saída do banco (nem despesa com entrada)
const rec = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,descricao) values ($1,'Receita',$2,10,'2026-09-12','pago','pix recebido') returning id",
    [E1, conta]
  )
).id;
const pixLivre = (
  await um(
    db,
    "select id from extrato_bancario where upload_id is not null and valor=-10 and transacao_id is null limit 1"
  )
).id;
await falha(db.query("select conciliar_extrato($1,$2)", [pixLivre, rec]), /Sentidos diferentes/);
const legadoLuz = (
  await um(db, "select id from extrato_bancario where hash_linha is null and descricao='PAG LUZ'")
).id;
// linha antiga positiva com "debito" e sem hash: o leitor antigo gravava "debito" para todo
// TRNTYPE que não fosse CREDIT, então o sentido é desconhecido e não barra a conciliação
assert.equal(
  (
    await um(db, "select public._extrato_sentido(e) as s from extrato_bancario e where id=$1", [
      legadoLuz,
    ])
  ).s,
  0
);

// transação excluída solta a linha do banco por inteiro (sem sobrar conciliado = true)
await comoUsuario(db, null);
const solta = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,descricao) values ($1,'Despesa',$2,10,'2026-09-12','pago','pix 2') returning id",
    [E1, conta]
  )
).id;
await db.query(
  "update extrato_bancario set transacao_id=$2, status_conciliacao='conciliado', conciliado=true where id=$1",
  [pixLivre, solta]
);
await db.query("update transacao_financeira set deleted_at=now() where id=$1", [solta]);
e = await um(
  db,
  "select status_conciliacao, transacao_id, conciliado from extrato_bancario where id=$1",
  [pixLivre]
);
assert.deepEqual(e, { status_conciliacao: "pendente", transacao_id: null, conciliado: false });
await comoUsuario(db, U1);

// regras: colunas novas aceitas
await db.query(
  "insert into regra_conciliacao(empresa_id,nome,tipo_match,palavras_chave,ignorar_descricao) values ($1,'r','palavra_chave','[\"TARIFA\"]',false)",
  [E1]
);
console.log("0156 OK");
