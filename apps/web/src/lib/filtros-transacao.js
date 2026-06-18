/**
 * Filtro de transações financeiras (busca/status/categoria/projeto/período).
 *
 * Estava duplicado em DespesasTab e ReceitasTab — só mudavam o `tipo` e o campo
 * de busca (fornecedor vs cliente). Centralizado aqui e testado, com atenção ao
 * filtro de PERÍODO (semana/mês/trimestre/ano), que é data-sensível.
 *
 * `hoje` é injetável p/ testes determinísticos (default = agora).
 */

// Um registro está dentro do período relativo a `hoje`? Comportamento idêntico
// ao que vivia nos dois componentes (mantido 1:1 para não mudar o que aparece).
export function dentroDoPeriodo(dataRef, periodo, hoje = new Date()) {
  if (!periodo || periodo === "todos") return true;
  if (!dataRef) return false; // sem data não casa um período específico
  const d = new Date(dataRef);

  switch (periodo) {
    case "hoje":
      return d.toDateString() === hoje.toDateString();
    case "semana": {
      const inicioSemana = new Date(hoje);
      inicioSemana.setDate(hoje.getDate() - hoje.getDay()); // domingo
      const fimSemana = new Date(inicioSemana);
      fimSemana.setDate(inicioSemana.getDate() + 6); // sábado
      return d >= inicioSemana && d <= fimSemana;
    }
    case "mes":
      return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
    case "trimestre": {
      const trimestreInicio = Math.floor(hoje.getMonth() / 3) * 3;
      const mesItem = d.getMonth();
      return (
        mesItem >= trimestreInicio &&
        mesItem < trimestreInicio + 3 &&
        d.getFullYear() === hoje.getFullYear()
      );
    }
    case "ano":
      return d.getFullYear() === hoje.getFullYear();
    default:
      return true; // período desconhecido não filtra (igual ao switch original)
  }
}

export function filtrarTransacoes(transacoes, filtros = {}, opts = {}) {
  const { tipo, hoje = new Date() } = opts;
  let out = transacoes || [];

  if (tipo) {
    out = out.filter((t) => (t.tipo || "").toLowerCase() === tipo);
  }

  if (filtros.busca) {
    const busca = filtros.busca.toLowerCase();
    out = out.filter(
      (t) =>
        t.descricao?.toLowerCase().includes(busca) ||
        t.fornecedor_nome?.toLowerCase().includes(busca) ||
        t.cliente_nome?.toLowerCase().includes(busca)
    );
  }

  if (filtros.status && filtros.status !== "all") {
    out = out.filter((t) => t.status === filtros.status);
  }

  if (filtros.categoriaId && filtros.categoriaId !== "all") {
    out = out.filter((t) => t.categoria_id === filtros.categoriaId);
  }

  if (filtros.projetoId && filtros.projetoId !== "all") {
    out = out.filter((t) => t.projeto_id === filtros.projetoId);
  }

  if (filtros.periodo && filtros.periodo !== "todos") {
    out = out.filter((t) => dentroDoPeriodo(t.data_vencimento || t.data, filtros.periodo, hoje));
  }

  return out;
}
