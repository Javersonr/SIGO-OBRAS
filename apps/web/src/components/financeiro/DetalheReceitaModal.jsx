import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, X, CheckCircle2 } from "lucide-react";

export default function DetalheReceitaModal({
  open,
  onOpenChange,
  receita,
  podeEditar,
  onEditar,
  onBaixar,
  empresaAtiva,
}) {
  if (!receita) return null;

  const formatCurrency = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

  const formatDate = (d) =>
    d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR") : "-";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle>Detalhes da Receita</SheetTitle>
          </SheetHeader>
          <button
            onClick={() => onOpenChange(false)}
            className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Informações Principais */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">
              Informações Gerais
            </h3>
            <div className="space-y-4">
              <div>
                <Label className="text-slate-500">Descrição</Label>
                <p className="mt-1 text-slate-800 font-medium">{receita.descricao || "-"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-500">Valor Total</Label>
                  <p className="mt-1 text-lg font-bold text-green-600">
                    {formatCurrency(receita.valor)}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500">Forma de Recebimento</Label>
                  <p className="mt-1 text-slate-800">
                    {receita.forma_pagamento ? (
                      <Badge variant="outline" className="capitalize">
                        {receita.forma_pagamento}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-slate-500">Data Competência</Label>
                  <p className="mt-1 text-slate-800">{formatDate(receita.data)}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Data Vencimento</Label>
                  <p className="mt-1 text-slate-800">{formatDate(receita.data_vencimento)}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Data Recebimento</Label>
                  <p className="mt-1 text-slate-800">{formatDate(receita.data_pagamento)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Relacionamentos */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">Relacionamentos</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-500">Cliente</Label>
                <p className="mt-1 text-slate-800">{receita.cliente_nome || "-"}</p>
              </div>
              <div>
                <Label className="text-slate-500">Categoria</Label>
                <p className="mt-1 text-slate-800">
                  {receita.categoria_nome ? (
                    <Badge variant="outline">{receita.categoria_nome}</Badge>
                  ) : (
                    "-"
                  )}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Conta</Label>
                <p className="mt-1 text-slate-800">{receita.conta_nome || "-"}</p>
              </div>
              <div>
                <Label className="text-slate-500">Centro de Custo</Label>
                <p className="mt-1 text-slate-800">
                  {receita.centro_custo_nome || receita.centro_custo || "-"}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Projeto</Label>
                <p className="mt-1 text-slate-800">{receita.projeto_nome || "-"}</p>
              </div>
              <div>
                <Label className="text-slate-500">Oportunidade</Label>
                <p className="mt-1 text-slate-800">{receita.oportunidade_nome || "-"}</p>
              </div>
            </div>
          </div>

          {/* Informações do Sistema */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">
              Informações do Sistema
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <Label className="text-slate-500">Criado em</Label>
                <p className="mt-1 text-slate-800">
                  {receita.created_date
                    ? new Date(receita.created_date).toLocaleString("pt-BR")
                    : "-"}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Criado por</Label>
                <p className="mt-1 text-slate-800">{receita.created_by || "-"}</p>
              </div>
              <div>
                <Label className="text-slate-500">Status</Label>
                <p className="mt-1">
                  <Badge
                    className={
                      receita.status === "pago" || receita.status === "Pago"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                    }
                  >
                    {receita.status === "pago" || receita.status === "Pago"
                      ? "Recebido"
                      : "Em aberto"}
                  </Badge>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t p-4 space-y-3">
          {onBaixar && (
            <Button
              variant={
                receita.status === "pago" || receita.status === "Pago" ? "outline" : "default"
              }
              size="sm"
              onClick={() => onBaixar(receita)}
              className={
                receita.status === "pago" || receita.status === "Pago"
                  ? "text-blue-600 w-full"
                  : "bg-green-600 hover:bg-green-700 w-full"
              }
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {receita.status === "pago" || receita.status === "Pago"
                ? "Desfazer Recebimento"
                : "Registrar Recebimento"}
            </Button>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Fechar
            </Button>
            {podeEditar && onEditar && (
              <Button
                onClick={() => {
                  onOpenChange(false);
                  onEditar(receita);
                }}
                className="bg-amber-500 hover:bg-amber-600 flex-1"
              >
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
