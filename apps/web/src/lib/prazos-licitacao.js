/**
 * Prazos da licitação que viram eventos nos calendários (Dashboard e
 * Oportunidades): impugnação, esclarecimento, limite da proposta, sessão e —
 * sem data de sessão — o fechamento previsto.
 *
 * Datas "AAAA-MM-DD" são tratadas como TEXTO: new Date("2026-09-30") é meia-
 * noite UTC e cai no dia anterior no fuso BR. As colunas da 0111
 * (esclarecimento, horário da impugnação) podem ainda não existir: todo campo
 * é opcional e null/ausente simplesmente não gera evento.
 */

// Rótulo, emoji e cor (chip e ponto da legenda) de cada tipo de evento.
export const TIPOS_PRAZO = {
  impugnacao: {
    rotulo: "Impugnação",
    emoji: "⚖️",
    classe: "bg-rose-50 border-rose-200 text-rose-800",
    ponto: "bg-rose-400",
  },
  esclarecimento: {
    rotulo: "Esclarecimento",
    emoji: "💬",
    classe: "bg-sky-50 border-sky-200 text-sky-800",
    ponto: "bg-sky-400",
  },
  proposta: {
    rotulo: "Limite da proposta",
    emoji: "📋",
    // violeta (não âmbar): âmbar já marca o "Hoje" no calendário de Oportunidades
    classe: "bg-violet-50 border-violet-200 text-violet-800",
    ponto: "bg-violet-400",
  },
  sessao: {
    rotulo: "Sessão",
    emoji: "🏛️",
    classe: "bg-blue-50 border-blue-200 text-blue-800",
    ponto: "bg-blue-400",
  },
  fechamento: {
    rotulo: "Fechamento previsto",
    emoji: "📅",
    classe: "bg-slate-50 border-slate-200 text-slate-700",
    ponto: "bg-slate-400",
  },
};

// Desempate dentro do mesmo dia/horário.
const ORDEM = { impugnacao: 0, esclarecimento: 1, proposta: 2, sessao: 3, fechamento: 4 };

const dois = (n) => String(n).padStart(2, "0");

/** "2026-09-30" ou "2026-09-30T00:00:00Z" → "2026-09-30"; outro formato → null. */
export function dataDoPrazo(valor) {
  if (typeof valor !== "string") return null;
  const m = valor.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Hora livre ("09:00", "9h30", "14:00 (Brasília)", "9h") → "HH:MM" — mesma
 * regra do alertar_prazos_licitacao (0111). Não reconheceu → o texto como
 * veio (encurtado); vazio → null.
 */
export function formatarHora(txt) {
  if (txt === null || txt === undefined) return null;
  const s = String(txt).trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*[:hH.]\s*(\d{2})/) || s.match(/^(\d{1,2})\s*[hH]?$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h <= 23 && min <= 59) return `${dois(h)}:${dois(min)}`;
  }
  return s.length > 14 ? `${s.slice(0, 14)}…` : s;
}

/** Chave "AAAA-MM-DD" de um Date LOCAL (toISOString usa UTC e pode trocar o dia). */
export function chaveDoDia(date) {
  return `${date.getFullYear()}-${dois(date.getMonth() + 1)}-${dois(date.getDate())}`;
}

// "HH:MM" → minutos do dia; texto livre → null.
const minutos = (hora) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hora || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Limite da proposta "é" a sessão: mesmo dia e mesma hora, sem hora em um
// dos dois, ou até 5 min antes (editais usam 07:59 → sessão 08:00).
function propostaColadaNaSessao(propData, propHora, sessaoData, sessaoHora) {
  if (!propData || propData !== sessaoData) return false;
  if (!propHora || !sessaoHora || propHora === sessaoHora) return true;
  const p = minutos(propHora);
  const s = minutos(sessaoHora);
  return p !== null && s !== null && s - p >= 0 && s - p <= 5;
}

/**
 * Eventos de uma oportunidade: [{ tipo, data, hora, junto, horaProposta }].
 * - Limite da proposta colado na sessão (ver propostaColadaNaSessao) NÃO vira
 *   outro evento: a sessão leva junto=["proposta"] (+ horaProposta se diferir).
 * - Fechamento previsto só sem data de sessão (regra antiga: sessão || fechamento).
 */
export function prazosDaOportunidade(op) {
  if (!op) return [];
  const eventos = [];
  const add = (tipo, data, hora, extra = {}) => {
    if (data) eventos.push({ tipo, data, hora: hora || null, junto: [], ...extra });
  };

  const sessaoData = dataDoPrazo(op.licitacao_data);
  const sessaoHora = formatarHora(op.licitacao_horario);
  const propData = dataDoPrazo(op.licitacao_data_proposta);
  const propHora = formatarHora(op.licitacao_horario_proposta);
  const propostaNaSessao = propostaColadaNaSessao(propData, propHora, sessaoData, sessaoHora);

  add(
    "impugnacao",
    dataDoPrazo(op.licitacao_data_impugnacao),
    formatarHora(op.licitacao_horario_impugnacao)
  );
  add(
    "esclarecimento",
    dataDoPrazo(op.licitacao_data_esclarecimento),
    formatarHora(op.licitacao_horario_esclarecimento)
  );
  if (!propostaNaSessao) add("proposta", propData, propHora);

  if (sessaoData) {
    const hora = sessaoHora || (propostaNaSessao ? propHora : null);
    add(
      "sessao",
      sessaoData,
      hora,
      propostaNaSessao
        ? { junto: ["proposta"], horaProposta: propHora && propHora !== hora ? propHora : null }
        : {}
    );
  } else {
    add("fechamento", dataDoPrazo(op.data_fechamento_prevista), null);
  }
  return eventos;
}

/** "Impugnação · 18:00", "Sessão + proposta · 09:00", "Sessão · 08:00 (proposta até 07:59)" */
export function rotuloEvento(ev) {
  const base = TIPOS_PRAZO[ev?.tipo]?.rotulo || "";
  const comProposta = ev?.junto?.includes("proposta");
  const hora = ev?.hora ? ` · ${ev.hora}` : "";
  if (comProposta && ev.horaProposta) return `${base}${hora} (proposta até ${ev.horaProposta})`;
  return `${base}${comProposta ? " + proposta" : ""}${hora}`;
}

/**
 * Agrupa por dia: { "AAAA-MM-DD": [{ tipo, data, hora, junto, op }] },
 * cada dia ordenado por horário (sem horário por último) e depois por tipo.
 */
export function eventosPorDia(oportunidades) {
  const mapa = {};
  for (const op of oportunidades || []) {
    for (const ev of prazosDaOportunidade(op)) {
      if (!mapa[ev.data]) mapa[ev.data] = [];
      mapa[ev.data].push({ ...ev, op });
    }
  }
  for (const lista of Object.values(mapa)) {
    lista.sort(
      (a, b) =>
        (a.hora || "99:99").localeCompare(b.hora || "99:99") || ORDEM[a.tipo] - ORDEM[b.tipo]
    );
  }
  return mapa;
}
