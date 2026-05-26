import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

const formatCurrency = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const formatDate = (d) =>
  d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR") : "-";

export default function OportunidadeDetalheSimples({ open, onOpenChange, oportunidade }) {
  if (!oportunidade) return null;

  const op = oportunidade;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle>{op.nome || op.titulo}</SheetTitle>
            <p className="text-sm text-slate-500">{op.cliente_nome || "Sem cliente"}</p>
          </SheetHeader>
          <button
            onClick={() => onOpenChange(false)}
            className="ml-4 p-2 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-500">Valor Estimado</Label>
              <p className="mt-1 text-lg font-bold text-green-600">
                {formatCurrency(op.valor_estimado)}
              </p>
            </div>
            <div>
              <Label className="text-slate-500">Status</Label>
              <p className="mt-1">
                {op.status_nome ? <Badge variant="outline">{op.status_nome}</Badge> : "-"}
              </p>
            </div>
            <div>
              <Label className="text-slate-500">Probabilidade</Label>
              <p className="mt-1 font-medium text-slate-800">
                {op.probabilidade != null ? `${op.probabilidade}%` : "-"}
              </p>
            </div>
            <div>
              <Label className="text-slate-500">Origem</Label>
              <p className="mt-1 font-medium text-slate-800">{op.origem_nome || "-"}</p>
            </div>
          </div>

          {(op.licitacao_modalidade || op.licitacao_data) && (
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-medium text-slate-700">Dados da Licitação</h4>
              <div className="grid grid-cols-2 gap-4">
                {op.licitacao_modalidade && (
                  <div>
                    <Label className="text-slate-500">Modalidade</Label>
                    <p className="mt-1 font-medium text-blue-700">{op.licitacao_modalidade}</p>
                  </div>
                )}
                {op.licitacao_data && (
                  <div>
                    <Label className="text-slate-500">Data Licitação</Label>
                    <p className="mt-1 font-medium text-slate-800">
                      {formatDate(op.licitacao_data)}
                    </p>
                  </div>
                )}
                {op.licitacao_horario && (
                  <div>
                    <Label className="text-slate-500">Horário</Label>
                    <p className="mt-1 font-medium text-slate-800">{op.licitacao_horario}</p>
                  </div>
                )}
                {op.licitacao_data_proposta && (
                  <div>
                    <Label className="text-slate-500">Limite Proposta</Label>
                    <p className="mt-1 font-medium text-slate-800">
                      {formatDate(op.licitacao_data_proposta)}
                    </p>
                  </div>
                )}
                {op.licitacao_data_impugnacao && (
                  <div>
                    <Label className="text-slate-500">Data Impugnação</Label>
                    <p className="mt-1 font-medium text-slate-800">
                      {formatDate(op.licitacao_data_impugnacao)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {op.data_fechamento_prevista && (
            <div className="border-t pt-4">
              <Label className="text-slate-500">Fechamento Previsto</Label>
              <p className="mt-1 font-medium text-slate-800">
                {formatDate(op.data_fechamento_prevista)}
              </p>
            </div>
          )}

          {(op.cidade || op.estado || op.endereco) && (
            <div className="border-t pt-4">
              <Label className="text-slate-500">Localização</Label>
              <p className="mt-1 text-slate-800">
                {[op.endereco, op.numero, op.bairro, op.cidade, op.estado]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          )}

          {op.descricao && (
            <div className="border-t pt-4">
              <Label className="text-slate-500">Descrição</Label>
              <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                {op.descricao.replace(/<[^>]*>/g, "")}
              </p>
            </div>
          )}
        </div>

        <div className="border-t p-4">
          <button
            onClick={() => onOpenChange(false)}
            className="w-full py-2 px-4 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Fechar
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
