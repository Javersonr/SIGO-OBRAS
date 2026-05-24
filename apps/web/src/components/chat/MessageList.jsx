import React from 'react';
import { FileText, Image, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function MessageList({ mensagens, loading, currentUserId, usuariosEmpresa }) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse flex gap-3">
            <div className="w-10 h-10 bg-slate-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-1/4" />
              <div className="h-16 bg-slate-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const renderMensagem = (texto) => {
    // Processar menções @usuario
    const parts = texto.split(/(@\w+)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('@')) {
        return (
          <span key={idx} className="bg-blue-100 text-blue-700 px-1 rounded font-medium">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="space-y-4">
      {mensagens.map((msg, idx) => {
        const isOwn = msg.usuario_id === currentUserId;
        const showAvatar = idx === 0 || mensagens[idx - 1].usuario_id !== msg.usuario_id;
        const showNome = showAvatar;

        return (
          <div key={msg.id} className={cn("flex gap-3", isOwn && "flex-row-reverse")}>
            {showAvatar ? (
              <Avatar className="w-10 h-10 flex-shrink-0">
                <AvatarFallback className={cn(
                  "text-sm font-semibold",
                  isOwn ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                )}>
                  {msg.usuario_nome?.substring(0, 2).toUpperCase() || msg.usuario_email?.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="w-10 flex-shrink-0" />
            )}

            <div className={cn("flex-1 max-w-[70%]", isOwn && "flex flex-col items-end")}>
              {showNome && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-slate-700">
                    {msg.usuario_nome || msg.usuario_email}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(msg.created_date).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              )}

              <div className={cn(
                "rounded-lg p-3",
                isOwn 
                  ? "bg-amber-500 text-white" 
                  : "bg-slate-100 text-slate-800"
              )}>
                <p className="text-sm whitespace-pre-wrap break-words">
                  {renderMensagem(msg.mensagem)}
                </p>

                {msg.arquivo_url && (
                  <div className={cn(
                    "mt-3 p-3 rounded-lg border",
                    isOwn ? "bg-amber-600 border-amber-400" : "bg-white border-slate-200"
                  )}>
                    <div className="flex items-center gap-3">
                      {msg.arquivo_tipo?.includes('image') ? (
                        <div className="w-full">
                          <img 
                            src={msg.arquivo_url} 
                            alt={msg.arquivo_nome}
                            className="max-w-full max-h-64 rounded"
                          />
                        </div>
                      ) : (
                        <>
                          <div className={cn(
                            "w-10 h-10 rounded flex items-center justify-center",
                            isOwn ? "bg-amber-500" : "bg-slate-200"
                          )}>
                            <FileText className={cn(
                              "w-5 h-5",
                              isOwn ? "text-white" : "text-slate-600"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-sm font-medium truncate",
                              isOwn ? "text-white" : "text-slate-800"
                            )}>
                              {msg.arquivo_nome}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(msg.arquivo_url, '_blank')}
                            className={isOwn ? "text-white hover:bg-amber-600" : ""}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {mensagens.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <p>Nenhuma mensagem ainda. Seja o primeiro a enviar!</p>
        </div>
      )}
    </div>
  );
}