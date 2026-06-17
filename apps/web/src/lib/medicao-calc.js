/**
 * Matemática da medição de obra — fonte única da verdade no frontend.
 *
 * Espelha o cálculo do backend (faturar_medicao, migrations 0058/0064):
 *   líquido = medido − retenção contratual − ISS − INSS
 *
 * Regra dos valores:
 *   - Medição **Faturada**: usa os SNAPSHOTS gravados (valor_retencao/iss/
 *     inss/liquido) — são o que de fato foi lançado no Financeiro.
 *   - Medição ainda **não faturada**: calcula a PRÉVIA a partir dos
 *     percentuais configurados no contrato (retencao/iss/inss_percentual).
 *
 * Mantém o boletim PDF, a aba Medições e qualquer relatório alinhados —
 * antes essa conta vivia copiada dentro do gerador de PDF.
 */

const num = (v) => Number(v) || 0;

export function calcularValoresMedicao(medicao) {
  const faturada = medicao?.status === "Faturada";

  const medido = num(medicao?.valor_medido);
  const retPct = num(medicao?.retencao_percentual);
  const issPct = num(medicao?.iss_percentual);
  const inssPct = num(medicao?.inss_percentual);

  const retencao = faturada ? num(medicao?.valor_retencao) : (medido * retPct) / 100;
  const iss = faturada ? num(medicao?.valor_iss) : (medido * issPct) / 100;
  const inss = faturada ? num(medicao?.valor_inss) : (medido * inssPct) / 100;
  const liquido = faturada ? num(medicao?.valor_liquido) : medido - retencao - iss - inss;

  return { faturada, medido, retPct, issPct, inssPct, retencao, iss, inss, liquido };
}
