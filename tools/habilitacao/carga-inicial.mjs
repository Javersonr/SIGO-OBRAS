#!/usr/bin/env node
/**
 * Carga inicial da biblioteca de habilitação (Acervo Técnico → Documentos e certidões).
 *
 * Lê o inventário (CSV subpasta;arquivo;tipo;emissao;validade) e a pasta dos documentos e ESCREVE,
 * numa pasta de saída FORA do repositório, dois arquivos:
 *   enviar.sh   um "supabase storage cp" por documento (bucket habilitacao, pasta da empresa);
 *   carga.sql   um bloco com guardas que grava as linhas em acervo_documento.
 * Este script NÃO envia nem grava nada: quem roda os dois arquivos é o Javerson, com o OK dele.
 * Os nomes dos arquivos têm dado pessoal: a saída não pode ser versionada.
 *
 * Uso (na raiz do repositório, Node >= 23.6):
 *   node tools/habilitacao/carga-inicial.mjs --csv <inventario.csv> --pasta <pasta dos documentos> \
 *     --empresa <uuid da empresa> --saida <pasta de saída fora do repositório>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  comandosDeEnvio,
  lerInventario,
  planejarCarga,
  sqlDaCarga,
} from "../../supabase/functions/_shared/habilitacao/carga-inicial.ts";

const arg = (nome) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 ? process.argv[i + 1] : null;
};
const [csv, pasta, empresa, saida] = ["csv", "pasta", "empresa", "saida"].map(arg);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!csv || !pasta || !empresa || !saida || !UUID.test(empresa)) {
  console.error(
    "Uso: --csv <arquivo> --pasta <pasta> --empresa <uuid> --saida <pasta fora do repositório>"
  );
  process.exit(2);
}
const raiz = path.resolve(import.meta.dirname, "..", "..");
// Fora do repositório = o caminho relativo sobe ("..") ou, em outra unidade (C: x D:), é absoluto.
const relativo = path.relative(raiz, path.resolve(saida));
const fora = relativo === ".." || relativo.startsWith(`..${path.sep}`) || path.isAbsolute(relativo);
if (!fora) {
  console.error("A pasta de saída tem de ficar FORA do repositório (os nomes têm dado pessoal).");
  process.exit(2);
}

const lido = lerInventario(readFileSync(csv, "utf8"));
if (lido.erros.length) {
  console.error(lido.erros.join("\n"));
  process.exit(1);
}
const agora = new Date();
const anoMes = `${agora.getFullYear()}/${String(agora.getMonth() + 1).padStart(2, "0")}`;
const plano = planejarCarga(lido.linhas, {
  empresaId: empresa.toLowerCase(),
  pastaBase: pasta.replace(/\\/g, "/").replace(/\/+$/, ""),
  anoMes,
  novoUuid: randomUUID,
});
const presentes = [];
const ausentes = [];
for (const item of plano.itens) (existsSync(item.caminhoLocal) ? presentes : ausentes).push(item);

mkdirSync(saida, { recursive: true });
writeFileSync(
  path.join(saida, "enviar.sh"),
  ["set -e", ...comandosDeEnvio(presentes), ""].join("\n")
);
writeFileSync(path.join(saida, "carga.sql"), sqlDaCarga(presentes, empresa.toLowerCase()));
console.log(`Documentos no plano: ${presentes.length}`);
console.log(`Ignorados: ${plano.ignorados.length}`);
for (const g of plano.ignorados) console.log(`  - ${g.arquivo}: ${g.motivo}`);
console.log(`Não encontrados na pasta: ${ausentes.length}`);
for (const a of ausentes) console.log(`  - ${a.caminhoLocal}`);
console.log(`Saída: ${path.resolve(saida)} (enviar.sh e carga.sql). Nada foi enviado nem gravado.`);
