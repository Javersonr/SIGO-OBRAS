/**
 * Filtro de transações financeiras (busca/status/categoria/projeto/período).
 *
 * Estava duplicado em DespesasTab e ReceitasTab — só mudavam o `tipo` e o campo
 * de busca (fornecedor vs cliente). Centralizado aqui e testado, com atenção ao
 * filtro de PERÍODO (semana/mês/trimestre/ano), que é data-sensível.
 *
 * `hoje` é injetável p/ testes determinísticos (default = agora).
 */

// 'YYYY-MM-DD' no new Date() é interpretado como MEIA-NOITE UTC — em UTC-3
// vira 21h do dia ANTERIOR, então despesa com vencimento no dia 1º "mudava"
// de mês e sumia do filtro "Este Mês". Parse LOCAL (ao meio-dia) resolve.
function parseDataLocal(dataRef) {
  if (dataRef instanceof Date) return dataRef;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dataRef));
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
  return new Date(dataRef);
}

// Um registro está dentro do período relativo a `hoje`?
export function dentroDoPeriodo(dataRef, periodo, hoje = new Date()) {
  if (!periodo || periodo === "todos") return true;
  if (!dataRef) return false; // sem data não casa um período específico
  const d = parseDataLocal(dataRef);

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

// Normalização central em lib/busca.js; re-exportada aqui por compatibilidade.
import { normalizarTexto } from "./busca";
export { normalizarTexto };

export function filtrarTransacoes(transacoes, filtros = {}, opts = {}) {
  const { tipo, hoje = new Date() } = opts;
  let out = transacoes || [];

  if (tipo) {
    out = out.filter((t) => (t.tipo || "").toLowerCase() === tipo);
  }

  if (filtros.busca) {
    // Busca tolerante: ignora acento/caixa e aceita vários termos em QUALQUER
    // ordem ("cimento joao" acha "Compra de cimento — João Materiais"). Cada
    // termo precisa casar em algum campo: descrição, fornecedor ou cliente.
    const termos = normalizarTexto(filtros.busca).split(/\s+/).filter(Boolean);
    if (termos.length > 0) {
      out = out.filter((t) => {
        const alvo = normalizarTexto(
          `${t.descricao || ""} ${t.fornecedor_nome || ""} ${t.cliente_nome || ""}`
        );
        return termos.every((termo) => alvo.includes(termo));
      });
    }
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
