/**
 * Lembretes de vencimento dos documentos de habilitação (cartão "Lembretes" da aba Documentos e
 * certidões). Módulo PURO (sem React, sem banco). A linha é a da tabela habilitacao_config
 * (migração 0155): dias de antecedência (1 a 90), e-mails de quem recebe e WhatsApp ligado ou não.
 * Os usuários que podem ser escolhidos vêm da RPC habilitacao_usuarios_da_empresa (0155).
 */
import { safeParseJSON } from "@/lib/json-utils";

export const DIAS_PADRAO = 10;
export const DIAS_MIN = 1;
export const DIAS_MAX = 90;

/** O que a empresa tem enquanto não grava nada: 10 dias, ninguém escolhido (donos e Admins), sem WhatsApp. */
export function configPadrao() {
  return { dias_antecedencia: DIAS_PADRAO, destinatarios: [], whatsapp: false };
}

/** Lista de e-mails em minúsculas, aparados e sem repetir. Aceita lista ou texto JSON (jsonb do legado). */
function listaDeEmails(valor) {
  let lista = valor;
  // o jsonb vindo do legado pode chegar como texto, e até como texto dentro de texto
  for (let i = 0; i < 2 && typeof lista === "string"; i++) lista = safeParseJSON(lista, []);
  if (!Array.isArray(lista)) return [];
  const vistos = new Set();
  for (const item of lista) {
    if (typeof item !== "string") continue;
    const email = item.trim().toLowerCase();
    if (email) vistos.add(email);
  }
  return [...vistos];
}

/** Inteiro de 1 a 3 dígitos, vindo de número ou de texto só com dígitos; senão null. */
function inteiro(valor) {
  if (typeof valor === "number") return Number.isInteger(valor) ? valor : null;
  const texto = String(valor ?? "").trim();
  return /^\d{1,3}$/.test(texto) ? Number(texto) : null;
}

/** Linha do banco (ou null) → formulário. */
export function lerConfig(linha) {
  if (!linha) return configPadrao();
  const dias = inteiro(linha.dias_antecedencia);
  return {
    dias_antecedencia: dias !== null && dias >= DIAS_MIN && dias <= DIAS_MAX ? dias : DIAS_PADRAO,
    destinatarios: listaDeEmails(linha.destinatarios),
    whatsapp: linha.whatsapp === true,
  };
}

export const AVISO_SEM_TELEFONE = "sem telefone para o WhatsApp";
export const AVISO_FORA_DA_LISTA = "não está mais entre os usuários ativos";

const emailLimpo = (valor) =>
  String(valor ?? "")
    .trim()
    .toLowerCase();

/**
 * Quem aparece em "Quem recebe": [{ email, nome, aviso }]. `usuarios` = as linhas da RPC
 * habilitacao_usuarios_da_empresa (usuario_email, nome e tem_telefone; o telefone não vem), na ordem em
 * que chegaram e sem repetir e-mail. Depois entram os e-mails já gravados (`gravados`) que a lista não
 * traz: continuam na tela, marcados, em vez de sumirem no próximo salvar.
 * `listaCarregada: false` = quem está na tela não pode listar os usuários (só leitura): não dá para dizer
 * que o gravado saiu da empresa, então ele aparece sem nota.
 */
export function candidatosDeLembrete(usuarios, gravados, { listaCarregada = true } = {}) {
  const porEmail = new Map();
  for (const u of Array.isArray(usuarios) ? usuarios : []) {
    const email = emailLimpo(u?.usuario_email);
    if (!email || porEmail.has(email)) continue;
    porEmail.set(email, {
      email,
      nome: String(u.nome ?? "").trim() || email,
      aviso: u.tem_telefone === true ? null : AVISO_SEM_TELEFONE,
    });
  }
  for (const email of listaDeEmails(gravados)) {
    if (porEmail.has(email)) continue;
    porEmail.set(email, { email, nome: email, aviso: listaCarregada ? AVISO_FORA_DA_LISTA : null });
  }
  return [...porEmail.values()];
}

/**
 * A criação esbarrou na configuração que outra pessoa acabou de gravar? (índice único de uma linha viva
 * por empresa, migração 0155). Quem chama recarrega a linha e grava por cima.
 */
export function ehConfigDuplicada(erro) {
  return String(erro?.message ?? "").includes("habilitacao_config_empresa_uidx");
}

/**
 * Valida o formulário: { ok, erros[], dados }. `usuarios` = quem pode ser escolhido (objetos com
 * `usuario_email`: as linhas da RPC ou os candidatos da tela): só os e-mails deles ficam em
 * `dados.destinatarios`.
 */
export function validarConfig(form, usuarios) {
  const f = form || {};
  const erros = [];
  const dias = inteiro(f.dias_antecedencia);
  if (dias === null || dias < DIAS_MIN || dias > DIAS_MAX) {
    erros.push(`Dias de antecedência: de ${DIAS_MIN} a ${DIAS_MAX}`);
  }
  const ativos = new Set(
    (Array.isArray(usuarios) ? usuarios : [])
      .map((u) => emailLimpo(u?.usuario_email))
      .filter(Boolean)
  );
  return {
    ok: erros.length === 0,
    erros,
    dados: {
      dias_antecedencia: dias,
      destinatarios: listaDeEmails(f.destinatarios).filter((email) => ativos.has(email)),
      whatsapp: f.whatsapp === true,
    },
  };
}
