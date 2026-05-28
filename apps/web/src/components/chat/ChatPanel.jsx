import React, { useState, useEffect, useMemo } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { MessageSquare, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ChatWindow from "./ChatWindow";
import NovoCanal from "./NovoCanal";

export default function ChatPanel({ open, onOpenChange, empresaAtiva, user }) {
  const [canais, setCanais] = useState([]);
  const [canalSelecionado, setCanalSelecionado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNovoCanal, setShowNovoCanal] = useState(false);
  const [usuariosEmpresa, setUsuariosEmpresa] = useState([]);
  const [activeTab, setActiveTab] = useState("canais");

  useEffect(() => {
    if (open && empresaAtiva?.id && user?.email) {
      loadData();
    }
  }, [open, empresaAtiva?.id, user?.email]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [canaisData, usuarios] = await Promise.all([
        sigo.entities.CanalChat.filter(
          {
            empresa_id: empresaAtiva.id,
            ativo: true,
          },
          "-ultima_mensagem_data"
        ),
        sigo.entities.UsuarioEmpresa.filter({
          empresa_id: empresaAtiva.id,
          ativo: true,
        }),
      ]);

      // Filtrar apenas canais que o usuário participa
      const meusCanais = canaisData.filter((canal) => {
        const participantes = safeParseJSON(canal.participantes, []);
        return participantes.includes(user.id) || canal.tipo === "Geral";
      });

      setCanais(meusCanais);
      setUsuariosEmpresa(usuarios);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCriarCanal = async (novoCanal) => {
    const canal = await sigo.entities.CanalChat.create(novoCanal);
    setCanais([canal, ...canais]);
    setCanalSelecionado(canal);
    setShowNovoCanal(false);
    setActiveTab("conversa");
    return canal;
  };

  const filteredCanais = useMemo(
    () => canais.filter((canal) => canal.nome?.toLowerCase().includes(searchTerm.toLowerCase())),
    [canais, searchTerm]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0">
        <div className="h-full flex flex-col">
          <SheetHeader className="p-4 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Chat
              </SheetTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowNovoCanal(true)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-2">
              <TabsTrigger value="canais" className="flex-1">
                Canais
              </TabsTrigger>
              <TabsTrigger value="conversa" className="flex-1" disabled={!canalSelecionado}>
                Conversa
              </TabsTrigger>
            </TabsList>

            <TabsContent value="canais" className="flex-1 mt-0 p-4">
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar canais..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                {filteredCanais.map((canal) => (
                  <button
                    key={canal.id}
                    onClick={() => {
                      setCanalSelecionado(canal);
                      setActiveTab("conversa");
                    }}
                    className="w-full p-3 rounded-lg text-left hover:bg-slate-50 border border-slate-200 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-slate-800">{canal.nome}</h3>
                        {canal.ultima_mensagem && (
                          <p className="text-xs text-slate-500 truncate mt-1">
                            {canal.ultima_mensagem}
                          </p>
                        )}
                      </div>
                      {canal.ultima_mensagem_data && (
                        <span className="text-xs text-slate-400">
                          {new Date(canal.ultima_mensagem_data).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </button>
                ))}

                {filteredCanais.length === 0 && !loading && (
                  <div className="text-center py-12 text-slate-500">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhum canal encontrado</p>
                    <Button
                      size="sm"
                      className="mt-4 bg-amber-500 hover:bg-amber-600"
                      onClick={() => setShowNovoCanal(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Criar Canal
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="conversa" className="flex-1 mt-0 flex flex-col">
              {canalSelecionado ? (
                <>
                  <div className="p-3 border-b flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-800">{canalSelecionado.nome}</h3>
                      <p className="text-xs text-slate-500">
                        {canalSelecionado.tipo === "Direto"
                          ? "Mensagem direta"
                          : `Canal ${canalSelecionado.tipo}`}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setActiveTab("canais")}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <ChatWindow
                      canal={canalSelecionado}
                      user={user}
                      empresaAtiva={empresaAtiva}
                      usuariosEmpresa={usuariosEmpresa}
                      onUpdateCanal={loadData}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500">
                  <div className="text-center">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Selecione um canal</p>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <NovoCanal
          open={showNovoCanal}
          onOpenChange={setShowNovoCanal}
          onCriar={handleCriarCanal}
          empresaAtiva={empresaAtiva}
          user={user}
          usuariosEmpresa={usuariosEmpresa}
        />
      </SheetContent>
    </Sheet>
  );
}
