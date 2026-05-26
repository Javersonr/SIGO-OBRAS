import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function ComprasHeader({ onOpenSolicitacao }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Compras</h1>
        <p className="text-slate-500">Solicitações, Cotações e Pedidos de Compra</p>
      </div>
      <Button onClick={onOpenSolicitacao} className="bg-amber-500 hover:bg-amber-600">
        <Plus className="w-4 h-4 mr-2" />
        Nova Solicitação
      </Button>
    </div>
  );
}
