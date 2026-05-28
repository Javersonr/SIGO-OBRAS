import React, { useState, useEffect, useRef } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Hash, User, Users } from "lucide-react";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";

export default function ChatWindow({ canal, user, empresaAtiva, usuariosEmpresa, onUpdateCanal }) {
  const [mensagens, setMensagens] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (canal?.id) {
      loadMensagens();

      // Polling para novas mensagens a cada 3 segundos
      const interval = setInterval(loadMensagens, 3000);
      return () => clearInterval(interval);
    }
  }, [canal?.id]);

  useEffect(() => {
    // Auto-scroll para última mensagem
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens]);

  const loadMensagens = async () => {
    try {
      const msgs = await sigo.entities.MensagemChat.filter(
        { canal_id: canal.id },
        "created_date",
        100
      );
      setMensagens(msgs);
      setLoading(false);

      // Marcar mensagens como lidas
      const naoLidas = msgs.filter((m) => {
        const lidaPor = safeParseJSON(m.lida_por, []);
        return !lidaPor.includes(user.id) && m.usuario_id !== user.id;
      });

      for (const msg of naoLidas) {
        const lidaPor = safeParseJSON(msg.lida_por, []);
        if (!lidaPor.includes(user.id)) {
          await sigo.entities.MensagemChat.update(msg.id, {
            lida_por: JSON.stringify([...lidaPor, user.id]),
          });
        }
      }
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error);
      setLoading(false);
    }
  };

  const handleEnviarMensagem = async (mensagem, arquivo = null, mencoes = []) => {
    try {
      const novaMensagem = {
        empresa_id: empresaAtiva.id,
        canal_id: canal.id,
        usuario_id: user.id,
        usuario_email: user.email,
        usuario_nome: user.full_name,
        mensagem,
        mencoes: mencoes.length > 0 ? JSON.stringify(mencoes) : null,
        arquivo_url: arquivo?.url || null,
        arquivo_nome: arquivo?.nome || null,
        arquivo_tipo: arquivo?.tipo || null,
        lida_por: JSON.stringify([user.id]),
      };

      const msg = await sigo.entities.MensagemChat.create(novaMensagem);

      // Atualizar última mensagem do canal
      await sigo.entities.CanalChat.update(canal.id, {
        ultima_mensagem: mensagem.substring(0, 100),
        ultima_mensagem_data: new Date().toISOString(),
      });

      setMensagens([...mensagens, msg]);

      // Criar notificações para usuários mencionados
      for (const usuarioId of mencoes) {
        const usuarioMencionado = usuariosEmpresa.find((u) => (u.usuario_id || u.id) === usuarioId);
        if (usuarioMencionado && usuarioMencionado.usuario_email !== user.email) {
          await sigo.entities.Notificacao.create({
            empresa_id: empresaAtiva.id,
            usuario_email: usuarioMencionado.usuario_email,
            tipo: "Sistema",
            titulo: `${user.full_name} mencionou você`,
            mensagem: `No canal "${canal.nome}": ${mensagem.substring(0, 100)}`,
            link: "#/Chat",
            prioridade: "Normal",
            icone: "MessageSquare",
          });
        }
      }

      if (onUpdateCanal) onUpdateCanal();
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
    }
  };

  const getIconeCanal = () => {
    switch (canal.tipo) {
      case "Direto":
        return <User className="w-5 h-5 text-purple-600" />;
      case "Geral":
        return <Users className="w-5 h-5 text-amber-600" />;
      case "Projeto":
        return <Hash className="w-5 h-5 text-blue-600" />;
      case "Oportunidade":
        return <Hash className="w-5 h-5 text-green-600" />;
      case "Solicitacao":
        return <Hash className="w-5 h-5 text-orange-600" />;
      case "Tarefa":
        return <Hash className="w-5 h-5 text-cyan-600" />;
      default:
        return <Hash className="w-5 h-5 text-blue-600" />;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <MessageList
          mensagens={mensagens}
          loading={loading}
          currentUserId={user.id}
          usuariosEmpresa={usuariosEmpresa}
        />
      </div>

      {/* Input */}
      <MessageInput onEnviar={handleEnviarMensagem} usuariosEmpresa={usuariosEmpresa} />
    </div>
  );
}
