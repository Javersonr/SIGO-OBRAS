import React from "react";
import { Hash, User, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function ChannelList({ canais, canalSelecionado, onSelectCanal, loading }) {
  const getIconeCanal = (tipo) => {
    switch (tipo) {
      case "Projeto":
      case "Oportunidade":
      case "Solicitacao":
      case "Tarefa":
        return Hash;
      case "Direto":
        return User;
      case "Geral":
        return MessageSquare;
      default:
        return Hash;
    }
  };

  const getCorTipo = (tipo) => {
    switch (tipo) {
      case "Projeto":
        return "text-blue-600";
      case "Oportunidade":
        return "text-green-600";
      case "Solicitacao":
        return "text-orange-600";
      case "Tarefa":
        return "text-cyan-600";
      case "Direto":
        return "text-purple-600";
      case "Geral":
        return "text-amber-600";
      default:
        return "text-slate-600";
    }
  };

  if (loading) {
    return (
      <div className="flex-1 p-4">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-12 bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-2 space-y-1">
        {canais.map((canal) => {
          const Icone = getIconeCanal(canal.tipo);
          const isSelected = canalSelecionado?.id === canal.id;

          return (
            <button
              key={canal.id}
              onClick={() => onSelectCanal(canal)}
              className={cn(
                "w-full p-3 rounded-lg text-left transition-all",
                isSelected
                  ? "bg-amber-50 border border-amber-200"
                  : "hover:bg-slate-50 border border-transparent"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                    isSelected ? "bg-amber-100" : "bg-slate-100"
                  )}
                >
                  <Icone
                    className={cn(
                      "w-5 h-5",
                      isSelected ? "text-amber-600" : getCorTipo(canal.tipo)
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium text-slate-800 truncate">{canal.nome}</h3>
                    {canal.tipo !== "Geral" && (
                      <Badge variant="outline" className="text-xs">
                        {canal.tipo}
                      </Badge>
                    )}
                  </div>
                  {canal.ultima_mensagem && (
                    <p className="text-xs text-slate-500 truncate mt-1">{canal.ultima_mensagem}</p>
                  )}
                  {canal.ultima_mensagem_data && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(canal.ultima_mensagem_data).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {canais.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum canal encontrado</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
