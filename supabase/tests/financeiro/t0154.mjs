import assert from "node:assert/strict";
import { novoBanco, um, comoUsuario, aplicar, falha } from "./harness.mjs";

const E1 = "00000000-0000-0000-0000-0000000000e1",
  E2 = "00000000-0000-0000-0000-0000000000e2";
const U1 = { sub: "00000000-0000-0000-0000-000000000001", app_metadata: { empresa_id: E1 } };

const db = await novoBanco();
await db.query("insert into empresa(id,nome) values ($1,'A'),($2,'B')", [E1, E2]);
// senha legada em texto puro, gravada ANTES da migração
const leg = await um(
  db,
  "insert into certificado_empresa(empresa_id,nome_arquivo,arquivo_url,senha_encriptada) values ($1,'a.pfx','x','senhaLegada') returning id",
  [E1]
);
const outro = await um(
  db,
  "insert into certificado_empresa(empresa_id,nome_arquivo,arquivo_url,senha_encriptada) values ($1,'b.pfx','y','senhaDaB') returning id",
  [E2]
);
await aplicar(db, "0154_certificado_senha_vault.sql");

// 1) backfill: coluna zerada, segredo no vault
let r = await um(
  db,
  "select senha_encriptada, senha_secret_id from certificado_empresa where id=$1",
  [leg.id]
);
assert.equal(r.senha_encriptada, null);
assert.ok(r.senha_secret_id);
assert.equal((await um(db, "select certificado_senha($1) s", [leg.id])).s, "senhaLegada");

// 2) insert pelo app (usuário da empresa) → vai para o vault
await comoUsuario(db, U1);
const novo = await um(
  db,
  "insert into certificado_empresa(empresa_id,nome_arquivo,arquivo_url,senha_encriptada,senha_secret_id) values ($1,'c.pfx','z','nova123', (select senha_secret_id from certificado_empresa where id=$2)) returning id, senha_encriptada, senha_secret_id",
  [E1, outro.id]
);
assert.equal(novo.senha_encriptada, null, "RETURNING não devolve a senha");
const idOutro = (
  await (async () => {
    await comoUsuario(db, null);
    return um(db, "select senha_secret_id from certificado_empresa where id=$1", [outro.id]);
  })()
).senha_secret_id;
assert.notEqual(novo.senha_secret_id, idOutro, "cliente não escolhe o secret_id");

// 3) usuário não lê a senha
await comoUsuario(db, U1);
await falha(db.query("select certificado_senha($1)", [novo.id]), /servidor/);

// 4) cliente não sobrescreve o segredo de outra empresa trocando o secret_id
await db.query(
  "update certificado_empresa set senha_secret_id=$1, senha_encriptada='hack' where id=$2",
  [idOutro, novo.id]
);
await comoUsuario(db, null);
assert.equal((await um(db, "select certificado_senha($1) s", [outro.id])).s, "senhaDaB");
assert.equal(
  (await um(db, "select certificado_senha($1) s", [novo.id])).s,
  "hack",
  "troca a própria senha"
);

// 5) update sem mexer na senha não apaga nada
await comoUsuario(db, U1);
await db.query("update certificado_empresa set ativo=false where id=$1", [novo.id]);
await comoUsuario(db, null);
assert.equal((await um(db, "select certificado_senha($1) s", [novo.id])).s, "hack");

// 6) delete apaga o segredo
const sid = (await um(db, "select senha_secret_id from certificado_empresa where id=$1", [novo.id]))
  .senha_secret_id;
await db.query("delete from certificado_empresa where id=$1", [novo.id]);
assert.equal((await um(db, "select count(*)::int n from vault.secrets where id=$1", [sid])).n, 0);

// 7) tokens bancários: cliente não grava, servidor grava
const conta = await um(
  db,
  "insert into conta_financeira(empresa_id,nome,tipo) values ($1,'Banco','Banco') returning id",
  [E1]
);
await comoUsuario(db, U1);
await falha(
  db.query(
    "insert into integracao_bancaria(empresa_id,conta_id,banco,tipo_integracao,token_acesso) values ($1,$2,'BB','Manual','tok')",
    [E1, conta.id]
  ),
  /servidor/
);
await falha(
  db.query("update conta_financeira set token_acesso='x' where id=$1", [conta.id]),
  /servidor/
);
const ib = await um(
  db,
  "insert into integracao_bancaria(empresa_id,conta_id,banco,tipo_integracao) values ($1,$2,'BB','Manual') returning id",
  [E1, conta.id]
);
await db.query("update integracao_bancaria set status='Inativa' where id=$1", [ib.id]);
await db.query("update conta_financeira set nome='Banco 2' where id=$1", [conta.id]);
await comoUsuario(db, null);
await db.query("update integracao_bancaria set token_acesso='cifrado' where id=$1", [ib.id]);
await comoUsuario(db, U1);
await db.query("update integracao_bancaria set status='Ativa' where id=$1", [ib.id]); // token inalterado → ok
console.log("0154 OK");
