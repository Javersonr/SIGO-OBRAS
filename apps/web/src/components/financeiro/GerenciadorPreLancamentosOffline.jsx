import React, { useState } from "react";
import { safeParseJSON } from "@/lib/json-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CloudOff, RefreshCw, Trash2, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

export default function GerenciadorPreLancamentosOffline({
  itemsPendentes,
  online,
  sincronizando,
  onSincronizar,
  onDeletar,
}) {
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState(null);
  const [mensagem, setMensagem] = useState(null);

  const handleSincronizar = async () => {
    if (itemsPendentes.length === 0) {
      setMensagem("Nenhum item para sincronizar");
      return;
    }

    try {
      await onSincronizar(itemsPendentes);
      setMensagem(`${itemsPendentes.length} item(s) sincronizado(s) com sucesso!`);
      setMostrarDetalhes(false);
      setTimeout(() => setMensagem(null), 3000);
    } catch (error) {
      setMensagem(`Erro ao sincronizar: ${error.message}`);
    }
  };

  const handleDeletar = async (id) => {
    if (confirm("Tem certeza que deseja deletar este pré-lançamento?")) {
      await onDeletar(id);
      setMostrarDetalhes(false);
      setMensagem("Pré-lançamento deletado");
      setTimeout(() => setMensagem(null), 2000);
    }
  };

  if (itemsPendentes.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CloudOff className="w-5 h-5 text-amber-600" />
              Pré-Lançamentos Offline
            </CardTitle>
            <span className="bg-amber-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
              {itemsPendentes.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-amber-800">
            Você tem {itemsPendentes.length} pré-lançamento(s) aguardando sincronização.
            {online ? " Sincronize agora!" : " Será sincronizado quando conectar à internet."}
          </p>

          {!online && (
            <Alert className="border-amber-300 bg-amber-100">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <AlertDescription className="text-amber-700 text-sm">
                Você está offline. Os dados serão sincronizados quando sua conexão for restaurada.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => setMostrarDetalhes(true)}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              Ver Detalhes
            </Button>
            {online && (
              <Button
                onClick={handleSincronizar}
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
                disabled={sincronizando}
              >
                {sincronizando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Sincronizar Agora
                  </>
                )}
              </Button>
            )}
          </div>

          {mensagem && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <AlertDescription className="text-green-800 text-sm">{mensagem}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Detalhes */}
      <Dialog open={mostrarDetalhes} onOpenChange={setMostrarDetalhes}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pré-Lançamentos Offline</DialogTitle>
            <DialogDescription>
              {itemsPendentes.length} item(s) aguardando sincronização
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {itemsPendentes.map((item) => {
              const dados = safeParseJSON(item.dados_extraidos, {});

              return (
                <Card key={item.id} className="bg-slate-50">
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-slate-900">
                            {dados.fornecedor || "Fornecedor não informado"}
                          </p>
                          <p className="text-sm text-slate-600">
                            R$ {parseFloat(dados.valor || 0).toFixed(2)}
                          </p>
                        </div>
                        <Button
                          onClick={() => handleDeletar(item.id)}
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      {item.projeto_nome && (
                        <p className="text-xs text-slate-500">Projeto: {item.projeto_nome}</p>
                      )}
                      {item.dataCriacao && (
                        <p className="text-xs text-slate-500">
                          {new Date(item.dataCriacao).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {online && (
            <Button
              onClick={handleSincronizar}
              className="w-full bg-green-600 hover:bg-green-700 gap-2"
              disabled={sincronizando}
            >
              {sincronizando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Sincronizar Todos Agora
                </>
              )}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
