/**
 * Datas de vencimento de um parcelamento — mesma data a cada mês.
 *
 * Resolve DOIS problemas que viviam copiados em DespesasTab e ReceitasTab:
 *
 * 1) Timezone (já tratado lá, agora centralizado): `new Date("2026-01-31")` é
 *    interpretado em UTC; em UTC-3 o toISOString voltava 1 dia antes. Aqui o
 *    parse é manual em horário local (meio-dia, longe da fronteira do dia).
 *
 * 2) Overflow de mês (BUG que estava ESCONDIDO): `new Date(2026, 1, 31)` não
 *    "capa" pro fim de fevereiro — ele TRANSBORDA pra 3 de março. Então uma
 *    parcela "todo dia 31" caía em mar/03 em vez de fev/28. Aqui o dia é
 *    limitado ao último dia do mês alvo (convenção de boleto/parcelamento BR).
 *
 * Retorna um array de strings "yyyy-mm-dd". Array vazio se entrada inválida.
 */
export function gerarDatasParcelas(numParcelas, dataVencimentoISO) {
  const count = parseInt(numParcelas, 10);
  if (!dataVencimentoISO || !count || count < 1) return [];

  const [ano, mes, dia] = String(dataVencimentoISO)
    .split("-")
    .map((n) => parseInt(n, 10));
  if (!ano || !mes || !dia) return [];

  const datas = [];
  for (let i = 0; i < count; i++) {
    const alvoMes = mes - 1 + i; // 0-based; pode passar de 11 (vira ano seguinte)
    // último dia do mês alvo: dia 0 do mês seguinte
    const ultimoDiaDoMes = new Date(ano, alvoMes + 1, 0).getDate();
    const diaClamp = Math.min(dia, ultimoDiaDoMes);
    const d = new Date(ano, alvoMes, diaClamp, 12, 0, 0);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    datas.push(`${yyyy}-${mm}-${dd}`);
  }
  return datas;
}
