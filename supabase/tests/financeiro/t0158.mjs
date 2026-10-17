import assert from "node:assert/strict";
import { novoBanco, um, todos, comoUsuario, aplicar, falha } from "./harness.mjs";

const E1 = "00000000-0000-0000-0000-0000000000e1",
  E2 = "00000000-0000-0000-0000-0000000000e2";
const U1 = {
  sub: "00000000-0000-0000-0000-000000000001",
  email: "camila@x.com",
  app_metadata: { empresa_id: E1 },
};
const U2 = { sub: "00000000-0000-0000-0000-000000000002", app_metadata: { empresa_id: E2 } };

const db = await novoBanco();
await db.exec(
  "create or replace function public.current_user_email() returns text language sql stable as $$ select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '') $$;"
);
await db.query("insert into empresa(id,nome) values ($1,'A'),($2,'B')", [E1, E2]);
const banco = (
  await um(
    db,
    "insert into conta_financeira(empresa_id,nome,tipo,saldo_inicial) values ($1,'Banco','Banco',5000) returning id",
    [E1]
  )
).id;
const fundo = (
  await um(
    db,
    "insert into conta_financeira(empresa_id,nome,tipo,saldo_inicial) values ($1,'Fundo Fixo','Fundo Fixo',1000) returning id",
    [E1]
  )
).id;
await db.query("select recalcular_saldo_conta($1), recalcular_saldo_conta($2)", [banco, fundo]);
const saldo = async (c) =>
  Number((await um(db, "select saldo_atual from conta_financeira where id=$1", [c])).saldo_atual);

// legado: 3 fechamentos, o 0002 desfeito (apagado) → o front geraria 0003 de novo
for (const n of ["0001", "0002", "0003"])
  await db.query("insert into fechamento_caixa(empresa_id,numero,status) values ($1,$2,'Pago')", [
    E1,
    n,
  ]);
await db.query("update fechamento_caixa set deleted_at=now() where numero='0002'");

await aplicar(db, "0155_extrato_derivado_da_transacao.sql");
await aplicar(db, "0158_fechamento_caixa_atomico.sql");

await comoUsuario(db, U1);
// front antigo manda count+1 = "0003" → trigger troca para 0004
const f4 = await um(
  db,
  "insert into fechamento_caixa(empresa_id,numero,status) values ($1,'0003','Aguardando Pagamento') returning numero",
  [E1]
);
assert.equal(f4.numero, "0004");
const f5 = await um(
  db,
  "insert into fechamento_caixa(empresa_id,numero,status) values ($1,'FF-ESPECIAL','Aguardando Pagamento') returning numero",
  [E1]
);
assert.equal(f5.numero, "FF-ESPECIAL", "número próprio que não repete é mantido");

// pré-lançamentos: 2 com despesa já conciliada (em aberto, na conta do fundo), 1 sem
const mkPL = async (valor, comTx) => {
  let tx = null;
  if (comTx)
    tx = (
      await um(
        db,
        "insert into transacao_financeira(empresa_id,tipo,conta_id,conta_nome,valor,data,status,descricao) values ($1,'Despesa',$2,'Fundo Fixo',$3,'2026-09-05','em_aberto','cupom') returning id",
        [E1, fundo, valor]
      )
    ).id;
  return (
    await um(
      db,
      "insert into pre_lancamento(empresa_id,usuario_email,comprovante_url,dados_extraidos,status,transacao_id) values ($1,'camila@x.com','c',$2::jsonb,$3,$4) returning id",
      [
        E1,
        JSON.stringify(JSON.stringify({ valor: String(valor).replace(".", ",") })),
        comTx ? "Conciliado" : "Pendente",
        tx,
      ]
    )
  ).id;
};
const pl1 = await mkPL(100.5, true),
  pl2 = await mkPL(49.5, true),
  pl3 = await mkPL(20, false);

const fc = (await um(db, "select fechar_caixa($1::uuid[],'Camila') as r", [[pl1, pl2]])).r;
assert.equal(Number(fc.valor_total), 150, "valor pelo dados_extraidos (string JSON, vírgula)");
assert.equal(fc.numero, "0005");
await falha(db.query("select fechar_caixa($1::uuid[])", [[pl1]]), /disponível|outro fechamento/);
assert.equal(
  (await um(db, "select status from pre_lancamento where id=$1", [pl1])).status,
  "Em Fechamento"
);

// acrescentar: só pendente, sem perder itens
await db.query("select acrescentar_ao_fechamento($1,$2::uuid[])", [fc.id, [pl3]]);
let f = await um(
  db,
  "select pre_lancamentos_ids, valor_total::float as v from fechamento_caixa where id=$1",
  [fc.id]
);
assert.deepEqual(f.pre_lancamentos_ids.sort(), [pl1, pl2, pl3].sort());
assert.equal(f.v, 170);
await falha(db.query("select acrescentar_ao_fechamento($1,$2::uuid[])", [fc.id, [pl3]]), /novo/);

// outra empresa não aprova
await comoUsuario(db, U2);
await falha(
  db.query("select aprovar_pagamento_fechamento($1,'2026-09-30')", [fc.id]),
  /outra empresa/
);
await comoUsuario(db, U1);

// aprovar com reposição: despesas pagas saem do fundo; banco repõe SÓ o que saiu do fundo
// (pl3 não tem despesa: não tirou dinheiro de conta nenhuma, não entra na reposição)
const sb = await saldo(banco),
  sf = await saldo(fundo);
await falha(
  db.query("select aprovar_pagamento_fechamento($1,'2026-09-30','ok',null,'Samira',$2,$2)", [
    fc.id,
    fundo,
  ]),
  /próprio fundo/
);
await comoUsuario(db, null);
const contaOutra = (
  await um(
    db,
    "insert into conta_financeira(empresa_id,nome,tipo) values ($1,'Conta da B','Banco') returning id",
    [E2]
  )
).id;
await comoUsuario(db, U1);
await falha(
  db.query("select aprovar_pagamento_fechamento($1,'2026-09-30','ok',null,'Samira',null,$2)", [
    fc.id,
    contaOutra,
  ]),
  /não encontrada nesta empresa/
);
const ap = (
  await um(
    db,
    "select aprovar_pagamento_fechamento($1,'2026-09-30','ok',null,'Samira',$2,$3) as r",
    [fc.id, banco, fundo]
  )
).r;
assert.ok(ap.transferencia_id);
assert.equal(Number(ap.valor_reposicao), 150);
assert.equal(ap.despesas_baixadas, 2);
assert.equal(await saldo(fundo), sf, "fundo: -150 das despesas +150 da reposição");
assert.equal(await saldo(banco), sb - 150, "banco pagou só a reposição do que saiu do fundo");
f = await um(
  db,
  "select status, usuario_pagamento_email as e, numero from fechamento_caixa where id=$1",
  [fc.id]
);
assert.deepEqual(f, { status: "Pago", e: "camila@x.com", numero: "0005" });
assert.equal(
  (
    await todos(
      db,
      "select 1 from pre_lancamento where id = any($1::uuid[]) and status='Conciliado'",
      [[pl1, pl2, pl3]]
    )
  ).length,
  3
);
await falha(
  db.query("select aprovar_pagamento_fechamento($1,'2026-09-30')", [fc.id]),
  /aguardando pagamento/
);
await falha(db.query("select desfazer_fechamento_caixa($1)", [fc.id]), /desfaça o pagamento/);

// desfazer pagamento: saldos e transferência voltam; despesas REABERTAS (não apagadas) e
// continuam ligadas aos itens
let dp = (await um(db, "select desfazer_pagamento_fechamento($1) as r", [fc.id])).r;
assert.equal(dp.despesas_reabertas, 2);
assert.equal(await saldo(banco), sb);
assert.equal(await saldo(fundo), sf, "despesas voltaram a em aberto: o fundo não pagou nada");
f = await um(db, "select status, transferencia_id from fechamento_caixa where id=$1", [fc.id]);
assert.deepEqual(f, { status: "Aguardando Pagamento", transferencia_id: null });
assert.equal(
  (
    await todos(
      db,
      "select 1 from pre_lancamento where id = any($1::uuid[]) and status='Em Fechamento' and transacao_id is not null",
      [[pl1, pl2]]
    )
  ).length,
  2
);
assert.equal(
  (
    await todos(
      db,
      "select 1 from transacao_financeira t join pre_lancamento pl on pl.transacao_id=t.id where pl.id = any($1::uuid[]) and t.deleted_at is null and t.status='em_aberto'",
      [[pl1, pl2]]
    )
  ).length,
  2
);

// aprovar sem conta pagadora: só baixa as despesas (o fundo paga 150); reaprovar não infla
await db.query("select aprovar_pagamento_fechamento($1,'2026-10-01')", [fc.id]);
assert.equal(await saldo(fundo), sf - 150, "sem reposição: o fundo pagou as despesas");
dp = (await um(db, "select desfazer_pagamento_fechamento($1) as r", [fc.id])).r;
assert.equal(dp.despesas_reabertas, 2);
assert.equal(await saldo(fundo), sf);

// despesa lançada no banco (não no fundo): não entra na reposição
const plBanco = await (async () => {
  const tx = (
    await um(
      db,
      "insert into transacao_financeira(empresa_id,tipo,conta_id,conta_nome,valor,data,status,descricao) values ($1,'Despesa',$2,'Banco',300,'2026-09-06','em_aberto','nota') returning id",
      [E1, banco]
    )
  ).id;
  return (
    await um(
      db,
      "insert into pre_lancamento(empresa_id,usuario_email,comprovante_url,dados_extraidos,status,transacao_id) values ($1,'camila@x.com','c','{\"valor\":300}'::jsonb,'Conciliado',$2) returning id",
      [E1, tx]
    )
  ).id;
})();
const fcB = (await um(db, "select fechar_caixa($1::uuid[],'Camila') as r", [[plBanco]])).r;
const sb2 = await saldo(banco);
await falha(
  db.query("select aprovar_pagamento_fechamento($1,'2026-10-02','ok',null,'Samira',$2,$3)", [
    fcB.id,
    banco,
    fundo,
  ]),
  /Nenhuma despesa paga/
);
assert.equal(await saldo(banco), sb2, "a recusa não deixou nada pela metade");
const apB = (await um(db, "select aprovar_pagamento_fechamento($1,'2026-10-02') as r", [fcB.id])).r;
assert.equal(apB.transferencia_id, null);
assert.equal(await saldo(banco), sb2 - 300, "a despesa saiu do banco uma vez só");

// fechamento aprovado ANTES da 0158 (sem despesas_baixadas_ids): reabre as despesas pagas
await comoUsuario(db, null);
const txLeg = (
  await um(
    db,
    "insert into transacao_financeira(empresa_id,tipo,conta_id,valor,data,status,data_pagamento,descricao) values ($1,'Despesa',$2,40,'2026-08-01','pago','2026-08-02','legado') returning id",
    [E1, fundo]
  )
).id;
const plLeg = (
  await um(
    db,
    "insert into pre_lancamento(empresa_id,usuario_email,comprovante_url,dados_extraidos,status,transacao_id) values ($1,'x','c','{\"valor\":40}'::jsonb,'Conciliado',$2) returning id",
    [E1, txLeg]
  )
).id;
const fcLeg = (
  await um(
    db,
    "insert into fechamento_caixa(empresa_id,numero,status,pre_lancamentos_ids,valor_total) values ($1,'LEG-1','Pago',$2::jsonb,40) returning id",
    [E1, JSON.stringify([plLeg])]
  )
).id;
await comoUsuario(db, U1);
dp = (await um(db, "select desfazer_pagamento_fechamento($1) as r", [fcLeg])).r;
assert.equal(dp.despesas_reabertas, 1);
assert.equal(
  (await um(db, "select status from transacao_financeira where id=$1", [txLeg])).status,
  "em_aberto"
);

// desfazer o fechamento: item com despesa volta a Conciliado, sem despesa a Pendente;
// número não é reaproveitado
await db.query("select desfazer_fechamento_caixa($1)", [fc.id]);
assert.deepEqual(
  (
    await todos(
      db,
      "select id, status from pre_lancamento where id = any($1::uuid[]) order by status",
      [[pl1, pl2, pl3]]
    )
  ).map((r) => r.status),
  ["Conciliado", "Conciliado", "Pendente"]
);
const f6 = (await um(db, "select fechar_caixa($1::uuid[]) as r", [[pl3]])).r;
assert.ok(Number(f6.numero) > 5, "não repete o 0005 desfeito");
console.log("0158 OK");
