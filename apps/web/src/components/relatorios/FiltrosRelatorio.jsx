import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function FiltrosRelatorio({ filtros, onFiltrosChange }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs text-slate-600">Data Início</Label>
            <Input
              type="date"
              value={filtros.dataInicio}
              onChange={(e) => onFiltrosChange({ ...filtros, dataInicio: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Data Fim</Label>
            <Input
              type="date"
              value={filtros.dataFim}
              onChange={(e) => onFiltrosChange({ ...filtros, dataFim: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Tipo</Label>
            <Select
              value={filtros.tipo}
              onValueChange={(v) => onFiltrosChange({ ...filtros, tipo: v })}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="oportunidades">Oportunidades</SelectItem>
                <SelectItem value="projetos">Projetos</SelectItem>
                <SelectItem value="solicitacoes">Solicitações</SelectItem>
                <SelectItem value="cotacoes">Cotações</SelectItem>
                <SelectItem value="pedidos">Pedidos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() =>
                onFiltrosChange({
                  dataInicio: "",
                  dataFim: "",
                  usuario: "all",
                  status: "all",
                  tipo: "all",
                })
              }
            >
              Limpar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
