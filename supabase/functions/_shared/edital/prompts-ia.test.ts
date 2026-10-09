// node --test supabase/functions/_shared/edital/prompts-ia.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promptAtende, promptExtracao } from "./prompts-ia.ts";
import { METODO_LEITURA_EDITAL, REGRAS_ATENDE } from "./metodo.ts";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

// Hashes dos prompts como estavam no ia-processar/edital.ts do master e8f4ced (calculados
// antes da mudança, no Step 1 da T6). Se um destes falhar, o texto que vai para a IA mudou.
const HASH_EXTRACAO_EDITAL = "ca68593736e596867b4407c26a957c0c34d335aea9bd9f8b6aaaf75811ebe773";
const HASH_EXTRACAO_ERRATA = "b395f932397931d6b3dcb5d05ae360f550312085389d27ddc49010191fd29f1e";
const HASH_ATENDE = "099a37606bb68fbf37ef26c3b3e957a3951db5a63dbacd38d81682bf59511f82";

test("promptExtracao: texto idêntico ao de antes da mudança", () => {
  assert.equal(sha256(promptExtracao("edital.pdf", 1, 2, false)), HASH_EXTRACAO_EDITAL);
  assert.equal(sha256(promptExtracao("errata.pdf", 2, 2, true)), HASH_EXTRACAO_ERRATA);
});

test("promptAtende: texto idêntico ao de antes da mudança", () => {
  assert.equal(sha256(promptAtende("Empresa X", ["op1", "pr1"])), HASH_ATENDE);
});

test("metodo: limites do recorte e as 15 regras numeradas", () => {
  assert.equal(
    METODO_LEITURA_EDITAL[0],
    "O QUE MAIS IMPORTA (decide se a empresa pode participar):"
  );
  assert.match(
    METODO_LEITURA_EDITAL[METODO_LEITURA_EDITAL.length - 1],
    /^- observacoes_importantes:/
  );
  assert.equal(REGRAS_ATENDE.length, 15);
  REGRAS_ATENDE.forEach((r, i) => assert.ok(r.startsWith(`${i + 1}. `), r));
  assert.ok(promptExtracao("a.pdf", 1, 1, false).includes(METODO_LEITURA_EDITAL.join("\n")));
  assert.ok(promptAtende("E", ["op1"]).includes(REGRAS_ATENDE.join("\n")));
});
