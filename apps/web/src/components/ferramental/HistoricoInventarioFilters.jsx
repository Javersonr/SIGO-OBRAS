import React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

export default function HistoricoInventarioFilters({
  filtros,
  onFiltrosChange,
  usuarios,
  ferramentas,
}) {
  const handleLimpar = () => {
    onFiltrosChange({
      ferramenta: "",
      usuario: "",
      dataInicio: "",
      dataFim: "",
      tipoOperacao: "",
    });
  };

  return (
    <Card className="p-4 bg-white border-slate-200">
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="font-semibold text-slate-800">Filtros</Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLimpar}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            <X className="w-3 h-3 mr-1" />
            Limpar
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Ferramenta */}
          <div>
            <Label className="text-xs font-medium text-slate-700">Ferramenta</Label>
            <Select
              value={filtros.ferramenta}
              onValueChange={(value) => onFiltrosChange({ ...filtros, ferramenta: value })}
            >
              <SelectTrigger className="mt-1.5 text-sm">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Todas as ferramentas</SelectItem>
                {ferramentas.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.descricao} ({f.codigo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Usuário */}
          <div>
            <Label className="text-xs font-medium text-slate-700">Usuário</Label>
            <Select
              value={filtros.usuario}
              onValueChange={(value) => onFiltrosChange({ ...filtros, usuario: value })}
            >
              <SelectTrigger className="mt-1.5 text-sm">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Todos os usuários</SelectItem>
                {usuarios.map((u) => (
                  <SelectItem key={u.email} value={u.email}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de Operação */}
          <div>
            <Label className="text-xs font-medium text-slate-700">Tipo</Label>
            <Select
              value={filtros.tipoOperacao}
              onValueChange={(value) => onFiltrosChange({ ...filtros, tipoOperacao: value })}
            >
              <SelectTrigger className="mt-1.5 text-sm">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Todas as operações</SelectItem>
                <SelectItem value="Entrada">Entrada</SelectItem>
                <SelectItem value="Ajuste">Ajuste</SelectItem>
                <SelectItem value="Confirmação">Confirmação</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Data Início */}
          <div>
            <Label className="text-xs font-medium text-slate-700">Data Início</Label>
            <Input
              type="date"
              value={filtros.dataInicio}
              onChange={(e) => onFiltrosChange({ ...filtros, dataInicio: e.target.value })}
              className="mt-1.5 text-sm"
            />
          </div>

          {/* Data Fim */}
          <div>
            <Label className="text-xs font-medium text-slate-700">Data Fim</Label>
            <Input
              type="date"
              value={filtros.dataFim}
              onChange={(e) => onFiltrosChange({ ...filtros, dataFim: e.target.value })}
              className="mt-1.5 text-sm"
            />
          </div>

          {/* Busca por código ou descrição */}
          <div>
            <Label className="text-xs font-medium text-slate-700">Buscar</Label>
            <div className="relative mt-1.5">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Código ou descrição..."
                value={filtros.busca || ""}
                onChange={(e) => onFiltrosChange({ ...filtros, busca: e.target.value })}
                className="pl-8 text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
