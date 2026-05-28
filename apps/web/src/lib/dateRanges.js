/**
 * Ranges de data usados em widgets/dashboards.
 *
 * Antes: cálculos "hoje + N dias", "início do mês", "últimos 6 meses"
 * apareciam duplicados em 6+ widgets. Centralizado aqui.
 */

/** Retorna { hoje, em7Dias, em30Dias } como Date no início do dia. */
export function getProximosDias() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const em7Dias = new Date(hoje);
  em7Dias.setDate(hoje.getDate() + 7);
  const em30Dias = new Date(hoje);
  em30Dias.setDate(hoje.getDate() + 30);
  return { hoje, em7Dias, em30Dias };
}

/**
 * Array dos últimos N meses no formato { ano, mes, label, inicio, fim },
 * do mais antigo pro mais recente. label = "Jan/26".
 *
 * Útil pra renderizar gráficos comparativos sem reinventar o cálculo
 * em cada widget.
 */
export function getUltimosMeses(n = 6) {
  const meses = [];
  const hoje = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const inicio = new Date(d.getFullYear(), d.getMonth(), 1);
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const label = d
      .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
      .replace(/\.\s*/, "/")
      .replace(/^\w/, (c) => c.toUpperCase());
    meses.push({ ano: d.getFullYear(), mes: d.getMonth(), label, inicio, fim });
  }
  return meses;
}

/** { inicio, fim } do mês corrente. */
export function getMesAtual() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);
  return { inicio, fim };
}
