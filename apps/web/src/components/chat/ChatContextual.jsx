import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { MessageSquare, Plus, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

/**
 * Componente de Chat Contextual para usar dentro de detalhes de Projetos, Oportunidades, Solicitações e Tarefas/Pedidos
 * 
 * @param {string} tipo - Tipo do contexto: 'Projeto', 'Oportunidade', 'Solicitacao', 'Tarefa'
 * @param {string} contextoId - ID do projeto/oportunidade/solicitacao/pedido
 * @param {string} contextoNome - Nome do projeto/oportunidade/solicitacao/pedido
 * @param {object} empresaAtiva - Empresa ativa
 * @param {object} user - Usuário atual
 */
export default function ChatContextual({ tipo, contextoId, contextoNome, empresaAtiva, user }) {
  const [canal, setCanal] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const scrollRef = React.useRef(null);

  useEffect(() => {
    if (contextoId && empresaAtiva?.id) {
      initChat();
      
      // Polling para novas mensagens
      const interval = setInterval(() => {
        if (canal?.id) loadMensagens();
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [contextoId, empresaAtiva?.id]);

  useEffect(() => {
    // Auto-scroll
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens]);

  const initChat = async () => {
    setLoading(true);
    try {
      // Buscar canal existente
      const filtro = {
        empresa_id: empresaAtiva.id,
        tipo,
        ativo: true
      };

      if (tipo === 'Projeto') filtro.projeto_id = contextoId;
      if (tipo === 'Oportunidade') filtro.oportunidade_id = contextoId;
      if (tipo === 'Solicitacao') filtro.solicitacao_id = contextoId;
      if (tipo === 'Tarefa') filtro.pedido_id = contextoId;

      const canais = await base44.entities.CanalChat.filter(filtro);

      if (canais.length > 0) {
        setCanal(canais[0]);
        await loadMensagens(canais[0].id);
      } else {
        // Criar canal automaticamente
        const novoCanal = await criarCanal();
        setCanal(novoCanal);
      }
    } catch (error) {
      console.error('Erro ao inicializar chat:', error);
    } finally {
      setLoading(false);
    }
  };

  const criarCanal = async () => {
    const data = {
      empresa_id: empresaAtiva.id,
      tipo,
      nome: `Chat - ${contextoNome || 'Sem nome'}`,
      projeto_id: tipo === 'Projeto' ? contextoId : null,
      oportunidade_id: tipo === 'Oportunidade' ? contextoId : null,
      solicitacao_id: tipo === 'Solicitacao' ? contextoId : null,
      pedido_id: tipo === 'Tarefa' ? contextoId : null,
      participantes: JSON.stringify([user.id]),
      participantes_emails: JSON.stringify([user.email]),
      ativo: true
    };

    return await base44.entities.CanalChat.create(data);
  };

  const loadMensagens = async (canalId = canal?.id) => {
    if (!canalId) return;
    
    try {
      const msgs = await base44.entities.MensagemChat.filter(
        { canal_id: canalId },
        'created_date',
        50
      );
      setMensagens(msgs);
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
    }
  };

  const handleEnviar = async () => {
    if (!novaMensagem.trim() || !canal) return;

    setEnviando(true);
    try {
      const msg = await base44.entities.MensagemChat.create({
        empresa_id: empresaAtiva.id,
        canal_id: canal.id,
        usuario_id: user.id,
        usuario_email: user.email,
        usuario_nome: user.full_name,
        mensagem: novaMensagem,
        lida_por: JSON.stringify([user.id])
      });

      // Atualizar última mensagem do canal
      await base44.entities.CanalChat.update(canal.id, {
        ultima_mensagem: novaMensagem.substring(0, 100),
        ultima_mensagem_data: new Date().toISOString()
      });

      setMensagens([...mensagens, msg]);
      setNovaMensagem('');
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    } finally {
      setEnviando(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Chat
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Chat
          <Badge variant="outline" className="ml-auto text-xs">
            {mensagens.length} mensagens
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mensagens */}
        <ScrollArea className="h-96 pr-4" ref={scrollRef}>
          <div className="space-y-3">
            {mensagens.map((msg, idx) => {
              const isOwn = msg.usuario_email === user.email;
              const showAvatar = idx === 0 || mensagens[idx - 1].usuario_email !== msg.usuario_email;

              return (
                <div key={msg.id} className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                  {showAvatar ? (
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarFallback className={`text-xs ${
                        isOwn ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {msg.usuario_nome?.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="w-8 flex-shrink-0" />
                  )}

                  <div className={`max-w-[80%] ${isOwn ? 'items-end' : ''}`}>
                    {showAvatar && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-slate-600">
                          {msg.usuario_nome}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(msg.created_date).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    )}
                    <div className={`rounded-lg p-3 ${
                      isOwn 
                        ? 'bg-amber-500 text-white' 
                        : 'bg-slate-100 text-slate-800'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {msg.mensagem}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {mensagens.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma mensagem ainda</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="flex gap-2">
          <Textarea
            value={novaMensagem}
            onChange={(e) => setNovaMensagem(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Digite sua mensagem..."
            rows={2}
            className="resize-none"
          />
          <Button
            onClick={handleEnviar}
            disabled={!novaMensagem.trim() || enviando}
            className="bg-amber-500 hover:bg-amber-600"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-slate-400">
          Enter para enviar, Shift+Enter para nova linha
        </p>
      </CardContent>
    </Card>
  );
}