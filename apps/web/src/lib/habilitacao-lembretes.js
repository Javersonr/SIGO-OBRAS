/**
 * Lembretes de vencimento dos documentos de habilitação (cartão "Lembretes" da aba Documentos e
 * certidões). Módulo PURO (sem React, sem banco). A linha é a da tabela habilitacao_config
 * (migração 0155): dias de antecedência (1 a 90), e-mails de quem recebe e WhatsApp ligado ou não.
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

/**
 * Valida o formulário: { ok, erros[], dados }. `usuarios` = os usuários ativos da empresa (linhas de
 * usuario_empresa): só os e-mails deles ficam em `dados.destinatarios`.
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
      .map((u) =>
        String(u?.usuario_email ?? "")
          .trim()
          .toLowerCase()
      )
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
