import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { FilePlus, Copy, Upload } from "lucide-react";

export default function NovoOrcamentoModal({ open, onOpenChange, onSelect }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-3/4 sm:max-w-sm lg:left-64 lg:w-[calc(100%-256px)] h-full overflow-y-auto p-0 flex flex-col"
      >
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0">
          <SheetHeader>
            <SheetTitle>Novo orçamento</SheetTitle>
            <p className="text-sm text-slate-500">
              Crie ou importe um orçamento e tenha acesso aos itens, fornecedores, grupos,
              categorias, valores, quantidades, unidades e muito mais!
            </p>
          </SheetHeader>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <div className="grid grid-cols-3 gap-6 py-8">
            <Card
              className="cursor-pointer hover:shadow-lg hover:border-blue-500 transition-all group"
              onClick={() => {
                onSelect("zero");
                onOpenChange(false);
              }}
            >
              <CardContent className="p-8 flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                  <FilePlus className="w-10 h-10 text-blue-600" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">Começar do zero</h3>
                <p className="text-sm text-slate-500">Começar orçamento em branco.</p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-lg hover:border-purple-500 transition-all group"
              onClick={() => {
                onSelect("modelo");
                onOpenChange(false);
              }}
            >
              <CardContent className="p-8 flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-2xl bg-purple-50 flex items-center justify-center mb-4 group-hover:bg-purple-100 transition-colors">
                  <Copy className="w-10 h-10 text-purple-600" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">Utilizar modelo</h3>
                <p className="text-sm text-slate-500">
                  Acelerar seu trabalho a partir de um modelo pronto.
                </p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-lg hover:border-green-500 transition-all group"
              onClick={() => {
                onSelect("importar");
                onOpenChange(false);
              }}
            >
              <CardContent className="p-8 flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-2xl bg-green-50 flex items-center justify-center mb-4 group-hover:bg-green-100 transition-colors">
                  <Upload className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">Importar</h3>
                <p className="text-sm text-slate-500">Importar um orçamento do Excel.</p>
              </CardContent>
            </Card>
          </div>

          <div className="border-t pt-6 bg-blue-50 px-6 py-4 rounded-lg">
            <h4 className="font-medium text-slate-800 mb-2">Dúvidas?</h4>
            <p className="text-sm text-slate-600">
              Se você quer saber mais sobre como funciona o orçamento ou ainda tem alguma dúvida,
              clique em <span className="text-blue-600 font-medium cursor-pointer">Saiba mais</span>
              .
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
