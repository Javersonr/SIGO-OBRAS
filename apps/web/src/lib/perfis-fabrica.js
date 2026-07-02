/**
 * Templates de permissões por FUNÇÃO (perfis de fábrica).
 *
 * Aplicados automaticamente no UsuarioEditModal quando o admin escolhe um
 * desses perfis — e continuam editáveis caso a caso na aba Permissões.
 *
 * As chaves são SEMPRE derivadas de ESTRUTURA_PERMISSOES (fonte canônica),
 * então novas abas/funções entram nos templates sem manutenção manual.
 */
import { ESTRUTURA_PERMISSOES } from "@/components/shared/PermissoesGranularesEditor";

/** Todas as funções de todas as abas de um módulo. */
function moduloCompleto(modulo) {
  const abas = ESTRUTURA_PERMISSOES[modulo]?.abas || {};
  const out = {};
  for (const [aba, cfg] of Object.entries(abas)) {
    out[aba] = Object.fromEntries(cfg.funcoes.map((f) => [f, true]));
  }
  return out;
}

/** Abas específicas de um módulo, com todas as suas funções. */
function abasCompletas(modulo, listaAbas) {
  const abas = ESTRUTURA_PERMISSOES[modulo]?.abas || {};
  const out = {};
  for (const aba of listaAbas) {
    if (abas[aba]) out[aba] = Object.fromEntries(abas[aba].funcoes.map((f) => [f, true]));
  }
  return out;
}

/** Funções específicas de uma aba. */
function somenteFuncoes(modulo, aba, funcoes) {
  const validas = ESTRUTURA_PERMISSOES[modulo]?.abas?.[aba]?.funcoes || [];
  return {
    [aba]: Object.fromEntries(funcoes.filter((f) => validas.includes(f)).map((f) => [f, true])),
  };
}

/** Template completo (todos os módulos) — Gerente Geral. */
function tudo() {
  const out = {};
  for (const modulo of Object.keys(ESTRUTURA_PERMISSOES)) {
    out[modulo] = moduloCompleto(modulo);
  }
  return out;
}

export const PERFIS_FABRICA = {
  "Gerente Geral": tudo(),

  "Gerente de Produção": {
    Manufatura: moduloCompleto("Manufatura"),
    Estoque: moduloCompleto("Estoque"),
    Compras: {
      ...somenteFuncoes("Compras", "Solicitações", ["visualizar", "criar"]),
      ...somenteFuncoes("Compras", "Pedidos", ["visualizar"]),
    },
    Relatórios: abasCompletas("Relatórios", ["Estoque"]),
  },

  "Gerente Comercial": {
    Manufatura: abasCompletas("Manufatura", ["Metas", "OEE"]),
    Financeiro: {
      ...somenteFuncoes("Financeiro", "Resumo", ["visualizar"]),
      ...abasCompletas("Financeiro", ["Receitas"]),
      ...somenteFuncoes("Financeiro", "Relatórios", ["visualizar", "exportar"]),
    },
    Oportunidades: moduloCompleto("Oportunidades"),
    Configurações: abasCompletas("Configurações", ["Clientes"]),
  },

  Vendedor: {
    Manufatura: somenteFuncoes("Manufatura", "Metas", ["visualizar"]),
    Financeiro: somenteFuncoes("Financeiro", "Receitas", ["visualizar", "criar"]),
    Oportunidades: somenteFuncoes("Oportunidades", "Lista", ["visualizar", "criar", "editar"]),
  },

  Operacional: {
    Manufatura: {
      ...somenteFuncoes("Manufatura", "Ordens", ["visualizar"]),
      ...abasCompletas("Manufatura", ["Apontamento"]),
      ...somenteFuncoes("Manufatura", "Qualidade", ["visualizar", "criar"]),
      ...somenteFuncoes("Manufatura", "Manutenção", ["visualizar", "criar"]),
      ...somenteFuncoes("Manufatura", "OEE", ["visualizar"]),
    },
    Estoque: {
      ...somenteFuncoes("Estoque", "Materiais", ["visualizar"]),
      ...somenteFuncoes("Estoque", "Movimento", ["visualizar"]),
    },
  },
};

export const DESCRICAO_PERFIS_FABRICA = {
  "Gerente Geral": "Acesso completo a todos os módulos contratados (sem ser Admin do sistema)",
  "Gerente de Produção":
    "Manufatura e Estoque completos + solicitações de compra + relatórios de estoque",
  "Gerente Comercial": "Metas e OEE, receitas do financeiro, oportunidades e cadastro de clientes",
  Vendedor: "Consulta metas, lança receitas e trabalha oportunidades",
  Operacional: "Chão de fábrica: vê ordens, aponta produção, registra qualidade e abre manutenção",
};
