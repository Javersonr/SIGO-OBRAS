#!/usr/bin/env node
/**
 * create-super-admin.mjs — gera SQL para inserir o 1º super_admin
 *
 * Não toca no banco. Apenas:
 *   1. Gera uma senha provisória de 12 chars
 *   2. Calcula bcrypt hash
 *   3. Imprime SQL pronto pra colar no Supabase Dashboard SQL Editor
 *
 * O usuário precisa trocar a senha no primeiro login (senha_provisoria=true).
 *
 * Uso:
 *   node tools/create-super-admin.mjs <email> "<nome completo>"
 */

import bcryptjs from "bcryptjs";
import crypto from "node:crypto";

const email = (process.argv[2] || "").trim().toLowerCase();
const nome = (process.argv[3] || "").trim();

if (!email || !nome) {
  console.error('Uso: node tools/create-super-admin.mjs <email> "<nome>"');
  process.exit(1);
}

// 1. Gera senha provisória (12 chars, sem 0/O/1/l, mistura forçada)
function gerarSenhaProvisoria() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowers = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = alphabet + lowers + digits;
  const pick = (set) => set[crypto.randomInt(set.length)];

  let pwd = pick(alphabet) + pick(digits);
  for (let i = 0; i < 10; i++) pwd += pick(all);

  // Embaralha
  return pwd
    .split("")
    .sort(() => crypto.randomInt(2) - 1)
    .join("");
}

const senhaProvisoria = gerarSenhaProvisoria();
const hash = bcryptjs.hashSync(senhaProvisoria, 10);
const empresaId = crypto.randomUUID();
const usuarioId = crypto.randomUUID();
const vinculoId = crypto.randomUUID();

console.log("=".repeat(70));
console.log("SUPER ADMIN — SIGO Obras");
console.log("=".repeat(70));
console.log("");
console.log(`📧 Email:           ${email}`);
console.log(`👤 Nome:            ${nome}`);
console.log(`🔐 Senha provisória: ${senhaProvisoria}`);
console.log(`     (você é OBRIGADO a trocar no primeiro login)`);
console.log("");
console.log("=".repeat(70));
console.log("SQL — cole no Dashboard Supabase → SQL Editor → Run");
console.log("=".repeat(70));
console.log("");
console.log("-- ============================================================");
console.log(`-- Criação do 1º super_admin: ${email}`);
console.log(`-- Gerado em ${new Date().toISOString()}`);
console.log("-- ============================================================");
console.log("");
console.log("-- 1. Empresa placeholder (home do super_admin)");
console.log("insert into public.empresa (");
console.log("  id, nome, razao_social, nome_fantasia, cnpj, ativo, is_holding");
console.log(") values (");
console.log(`  '${empresaId}',`);
console.log(`  'SINERGIA — Admin',`);
console.log(`  'Sinergia Construções e Serviços Ltda',`);
console.log(`  'SINERGIA',`);
console.log(`  null, true, false`);
console.log(");");
console.log("");
console.log("-- 2. Usuario custom (admin com senha provisória)");
console.log("insert into public.usuario_custom (");
console.log("  id, email, senha_hash, nome_completo, empresa_id,");
console.log("  is_super_admin, ativo, senha_provisoria");
console.log(") values (");
console.log(`  '${usuarioId}',`);
console.log(`  '${email}',`);
console.log(`  '${hash}',`);
console.log(`  '${nome.replace(/'/g, "''")}',`);
console.log(`  '${empresaId}',`);
console.log(`  true, true, true`);
console.log(");");
console.log("");
console.log("-- 3. Vínculo na usuario_empresa (perfil Owner/Admin)");
console.log("insert into public.usuario_empresa (");
console.log("  id, usuario_email, empresa_id, nome_completo, perfil, is_owner, ativo");
console.log(") values (");
console.log(`  '${vinculoId}',`);
console.log(`  '${email}',`);
console.log(`  '${empresaId}',`);
console.log(`  '${nome.replace(/'/g, "''")}',`);
console.log(`  'Admin', true, true`);
console.log(");");
console.log("");
console.log("=".repeat(70));
console.log("Após executar o SQL acima:");
console.log("=".repeat(70));
console.log("");
console.log("1. Abra https://sigoobras.com.br");
console.log(`2. Email:   ${email}`);
console.log(`3. Senha:   ${senhaProvisoria}`);
console.log("4. Sistema vai forçar troca de senha no primeiro acesso");
console.log("");
console.log("⚠️  Guarde essa senha agora — ela só existe nesta tela.");
console.log("    Se perder, rode este script de novo (gera nova).");
