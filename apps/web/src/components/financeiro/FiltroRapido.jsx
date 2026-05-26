import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Filter, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function FiltroRapido({
  filtros,
  onFiltrosChange,
  categorias = [],
  projetos = [],
  contas = [],
  tipo = "receitas", // 'receitas' ou 'despesas'
}) {
  const hasFilters = Object.values(filtros).some((v) => v && v !== "all" && v !== "todos");

  const limparFiltros = () => {
    onFiltrosChange({
      busca: "",
      status: "all",
      periodo: "todos",
      categoriaId: "all",
      projetoId: "all",
      contaId: "all",
      dataInicio: "",
      dataFim: "",
    });
  };

  const periodosRapidos = [
    { value: "hoje", label: "Hoje" },
    { value: "semana", label: "Esta Semana" },
    { value: "mes", label: "Este Mês" },
    { value: "trimestre", label: "Este Trimestre" },
    { value: "ano", label: "Este Ano" },
    { value: "todos", label: "Todos" },
  ];

  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <h4 className="font-medium text-slate-700">Filtros</h4>
          {hasFilters && (
            <Badge variant="secondary" className="ml-2">
              {Object.values(filtros).filter((v) => v && v !== "all" && v !== "todos").length}
            </Badge>
          )}
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={limparFiltros}>
            <X className="w-4 h-4 mr-1" />
            Limpar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="lg:col-span-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por descrição..."
              value={filtros.busca || ""}
              onChange={(e) => onFiltrosChange({ ...filtros, busca: e.target.value })}
              className="pl-9"
            />
          </div>
        </div>

        <Select
          value={filtros.status || "all"}
          onValueChange={(v) => onFiltrosChange({ ...filtros, status: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="em_aberto">Pendente</SelectItem>
            <SelectItem value="pago">{tipo === "receitas" ? "Recebido" : "Pago"}</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filtros.periodo || "todos"}
          onValueChange={(v) => onFiltrosChange({ ...filtros, periodo: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            {periodosRapidos.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filtros.categoriaId || "all"}
          onValueChange={(v) => onFiltrosChange({ ...filtros, categoriaId: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filtros.projetoId || "all"}
          onValueChange={(v) => onFiltrosChange({ ...filtros, projetoId: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Projeto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Projetos</SelectItem>
            {projetos.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filtros de data customizados */}
      {filtros.periodo === "personalizado" && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Data Início</label>
            <Input
              type="date"
              value={filtros.dataInicio || ""}
              onChange={(e) => onFiltrosChange({ ...filtros, dataInicio: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Data Fim</label>
            <Input
              type="date"
              value={filtros.dataFim || ""}
              onChange={(e) => onFiltrosChange({ ...filtros, dataFim: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
