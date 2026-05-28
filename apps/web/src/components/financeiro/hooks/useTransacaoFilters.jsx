import { useMemo, useState } from "react";

const ITENS_POR_PAGINA = 50;

const aplicarFiltros = (transacoes, tipo, filtros) => {
  const campoNome = tipo === "receita" ? "cliente_nome" : "fornecedor_nome";
  let filtered = (transacoes || []).filter((t) => (t.tipo || "").toLowerCase() === tipo);

  if (filtros.busca) {
    const busca = filtros.busca.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.descricao?.toLowerCase().includes(busca) || t[campoNome]?.toLowerCase().includes(busca)
    );
  }

  if (filtros.status && filtros.status !== "all") {
    filtered = filtered.filter((t) => t.status === filtros.status);
  }

  if (filtros.categoriaId && filtros.categoriaId !== "all") {
    filtered = filtered.filter((t) => t.categoria_id === filtros.categoriaId);
  }

  if (filtros.projetoId && filtros.projetoId !== "all") {
    filtered = filtered.filter((t) => t.projeto_id === filtros.projetoId);
  }

  if (filtros.periodo && filtros.periodo !== "todos") {
    const hoje = new Date();
    const dataVencimento = (t) => new Date(t.data_vencimento || t.data);

    switch (filtros.periodo) {
      case "hoje":
        filtered = filtered.filter((t) => dataVencimento(t).toDateString() === hoje.toDateString());
        break;
      case "semana": {
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(hoje.getDate() - hoje.getDay());
        const fimSemana = new Date(inicioSemana);
        fimSemana.setDate(inicioSemana.getDate() + 6);
        filtered = filtered.filter((t) => {
          const d = dataVencimento(t);
          return d >= inicioSemana && d <= fimSemana;
        });
        break;
      }
      case "mes":
        filtered = filtered.filter((t) => {
          const d = dataVencimento(t);
          return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
        });
        break;
      case "trimestre": {
        const trimestreInicio = Math.floor(hoje.getMonth() / 3) * 3;
        filtered = filtered.filter((t) => {
          const d = dataVencimento(t);
          const mesItem = d.getMonth();
          return (
            mesItem >= trimestreInicio &&
            mesItem < trimestreInicio + 3 &&
            d.getFullYear() === hoje.getFullYear()
          );
        });
        break;
      }
      case "ano":
        filtered = filtered.filter((t) => dataVencimento(t).getFullYear() === hoje.getFullYear());
        break;
    }
  }

  return filtered;
};

const ordenar = (lista, sortConfig) => {
  const camposData = new Set(["data", "data_vencimento", "data_pagamento", "created_date"]);

  return [...lista].sort((a, b) => {
    let aVal;
    let bVal;

    if (camposData.has(sortConfig.field)) {
      aVal = a[sortConfig.field] ? new Date(a[sortConfig.field]).getTime() : 0;
      bVal = b[sortConfig.field] ? new Date(b[sortConfig.field]).getTime() : 0;
    } else if (sortConfig.field === "valor") {
      aVal = a[sortConfig.field] || 0;
      bVal = b[sortConfig.field] || 0;
    } else {
      aVal = (a[sortConfig.field] || "").toString().toLowerCase();
      bVal = (b[sortConfig.field] || "").toString().toLowerCase();
    }

    if (sortConfig.direction === "asc") {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    }
    return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
  });
};

/**
 * Hook compartilhado entre ReceitasTab e DespesasTab.
 *
 * Despesa tem um pre-filtro extra que oculta lançamentos conciliados via
 * pré-lançamento ainda não aprovados — mantido aqui pra evitar regressão.
 */
export function useTransacaoFilters(tipo, transacoes, { filtroProjetoInicial } = {}) {
  const [sortConfig, setSortConfig] = useState({
    field: "data_vencimento",
    direction: "desc",
  });
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [filtros, setFiltros] = useState({
    busca: "",
    status: "all",
    periodo: "mes",
    categoriaId: "all",
    projetoId: filtroProjetoInicial || "all",
    contaId: "all",
  });

  const transacoesFiltradas = useMemo(() => {
    const fonte =
      tipo === "despesa"
        ? (transacoes || []).filter(
            (t) => !(t.pre_lancamento_id && t.conciliado && !t.pre_lancamento_aprovado)
          )
        : transacoes;
    return aplicarFiltros(fonte, tipo, filtros);
  }, [tipo, transacoes, filtros]);

  const totalPaginas = Math.ceil(transacoesFiltradas.length / ITENS_POR_PAGINA);
  const indiceInicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
  const indiceFim = indiceInicio + ITENS_POR_PAGINA;

  const transacoesPaginadas = useMemo(
    () => ordenar(transacoesFiltradas, sortConfig).slice(indiceInicio, indiceFim),
    [transacoesFiltradas, sortConfig, indiceInicio, indiceFim]
  );

  return {
    filtros,
    setFiltros,
    sortConfig,
    setSortConfig,
    paginaAtual,
    setPaginaAtual,
    itensPorPagina: ITENS_POR_PAGINA,
    totalPaginas,
    indiceInicio,
    indiceFim,
    transacoesFiltradas,
    transacoesPaginadas,
  };
}
