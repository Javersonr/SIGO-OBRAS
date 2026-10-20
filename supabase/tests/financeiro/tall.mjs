import { novoBanco, aplicar } from "./harness.mjs";
const db = await novoBanco();
const todas = [
  "0154_certificado_senha_vault.sql",
  "0155_extrato_derivado_da_transacao.sql",
  "0156_conciliacao_ofx_atomica.sql",
  "0157_recorrencia_idempotente.sql",
  "0158_fechamento_caixa_atomico.sql",
];
for (const f of todas) await aplicar(db, f);
for (const f of todas) await aplicar(db, f);
console.log("todas as migrações aplicam em sequência e reaplicam: OK");
