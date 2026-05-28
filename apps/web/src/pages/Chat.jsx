import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../Layout";
import { safeParseJSON } from "@/lib/json-utils";
import { MessageSquare, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ChannelList from "../components/chat/ChannelList";
import ChatWindow from "../components/chat/ChatWindow";
import NovoCanal from "../components/chat/NovoCanal";

export default function Chat() {
  const { empresaAtiva, user } = useEmpresa();
  const [canais, setCanais] = useState([]);
  const [canalSelecionado, setCanalSelecionado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNovoCanal, setShowNovoCanal] = useState(false);
  const [usuariosEmpresa, setUsuariosEmpresa] = useState([]);

  useEffect(() => {
    if (empresaAtiva?.id && user?.email) {
      loadData();
    }
  }, [empresaAtiva?.id, user?.email]);

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
        if (!Array.isArray(participantes)) return canal.tipo === "Geral";
        return participantes.includes(user.id) || canal.tipo === "Geral";
      });

      setCanais(meusCanais);
      setUsuariosEmpresa(usuarios);

      // Selecionar primeiro canal se nenhum estiver selecionado
      if (meusCanais.length > 0 && !canalSelecionado) {
        setCanalSelecionado(meusCanais[0]);
      }
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
    return canal;
  };

  const filteredCanais = canais.filter((canal) =>
    canal.nome?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!empresaAtiva || !user) return null;

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* Sidebar - Lista de Canais */}
      <div className="w-80 flex flex-col bg-white rounded-lg border border-slate-200">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Chat
            </h2>
            <Button size="icon" variant="ghost" onClick={() => setShowNovoCanal(true)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
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

        <ChannelList
          canais={filteredCanais}
          canalSelecionado={canalSelecionado}
          onSelectCanal={setCanalSelecionado}
          loading={loading}
        />
      </div>

      {/* Área de Chat */}
      <div className="flex-1 bg-white rounded-lg border border-slate-200">
        {canalSelecionado ? (
          <ChatWindow
            canal={canalSelecionado}
            user={user}
            empresaAtiva={empresaAtiva}
            usuariosEmpresa={usuariosEmpresa}
            onUpdateCanal={loadData}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Selecione um canal para começar</p>
            <p className="text-sm">Ou crie um novo canal de comunicação</p>
          </div>
        )}
      </div>

      {/* Modal Novo Canal */}
      <NovoCanal
        open={showNovoCanal}
        onOpenChange={setShowNovoCanal}
        onCriar={handleCriarCanal}
        empresaAtiva={empresaAtiva}
        user={user}
        usuariosEmpresa={usuariosEmpresa}
      />
    </div>
  );
}
