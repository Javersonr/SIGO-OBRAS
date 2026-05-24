import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '../Layout';
import { Link } from 'react-router-dom';
import { 
  Bell, X, Check, CheckCheck, Trash2, ShoppingCart, 
  FolderKanban, DollarSign, Package, AlertCircle, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const iconMap = {
  'Cotação': ShoppingCart,
  'Projeto': FolderKanban,
  'Compra': ShoppingCart,
  'Financeiro': DollarSign,
  'Estoque': Package,
  'Inspeção': AlertCircle,
  'Manutenção': AlertCircle,
  'Sistema': Info,
};

const priorityColors = {
  'Baixa': 'bg-slate-100 text-slate-600 border-slate-200',
  'Normal': 'bg-blue-100 text-blue-700 border-blue-200',
  'Alta': 'bg-orange-100 text-orange-700 border-orange-200',
  'Urgente': 'bg-red-100 text-red-700 border-red-200',
};

export default function NotificationsPanel({ open, onOpenChange }) {
  const { empresaAtiva, user } = useEmpresa();
  const [notificacoes, setNotificacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('todas'); // todas, nao-lidas

  useEffect(() => {
    if (open && empresaAtiva && user) {
      loadNotificacoes();
    }
  }, [open, empresaAtiva, user]);

  // Subscription em tempo real para notificações
  useEffect(() => {
    if (!empresaAtiva?.id || !user?.email) return;

    const unsubscribe = base44.entities.Notificacao.subscribe((event) => {
      // Apenas notificações para o usuário atual
      if (event.data?.empresa_id === empresaAtiva.id && event.data?.usuario_email === user.email) {
        if (event.type === 'create') {
          setNotificacoes(prev => [event.data, ...prev]);
          
          // Toast de notificação
          if (window.Notification && Notification.permission === 'granted') {
            new Notification(event.data.titulo, {
              body: event.data.mensagem,
              icon: '/favicon.ico',
              tag: event.data.id
            });
          }
        } else if (event.type === 'update') {
          setNotificacoes(prev => prev.map(n => n.id === event.id ? event.data : n));
        } else if (event.type === 'delete') {
          setNotificacoes(prev => prev.filter(n => n.id !== event.id));
        }
      }
    });

    return unsubscribe;
  }, [empresaAtiva?.id, user?.email]);

  // Solicitar permissão para notificações do navegador
  useEffect(() => {
    if (window.Notification && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const loadNotificacoes = async () => {
    setLoading(true);
    try {
      const result = await base44.entities.Notificacao.filter(
        { empresa_id: empresaAtiva.id, usuario_email: user.email },
        '-created_date',
        50
      );
      setNotificacoes(result);
    } catch (error) {
      console.error('Erro ao carregar notificações:', error);
    } finally {
      setLoading(false);
    }
  };

  const marcarComoLida = async (notificacao) => {
    try {
      await base44.entities.Notificacao.update(notificacao.id, { lida: true });
      setNotificacoes(notificacoes.map(n => 
        n.id === notificacao.id ? { ...n, lida: true } : n
      ));
    } catch (error) {
      console.error('Erro ao marcar notificação:', error);
    }
  };

  const marcarTodasComoLidas = async () => {
    try {
      const naoLidas = notificacoes.filter(n => !n.lida);
      await Promise.all(naoLidas.map(n => base44.entities.Notificacao.update(n.id, { lida: true })));
      setNotificacoes(notificacoes.map(n => ({ ...n, lida: true })));
    } catch (error) {
      console.error('Erro ao marcar todas:', error);
    }
  };

  const excluirNotificacao = async (id) => {
    try {
      await base44.entities.Notificacao.delete(id);
      setNotificacoes(notificacoes.filter(n => n.id !== id));
    } catch (error) {
      console.error('Erro ao excluir notificação:', error);
    }
  };

  const limparLidas = async () => {
    try {
      const lidas = notificacoes.filter(n => n.lida);
      await Promise.all(lidas.map(n => base44.entities.Notificacao.delete(n.id)));
      setNotificacoes(notificacoes.filter(n => !n.lida));
    } catch (error) {
      console.error('Erro ao limpar notificações:', error);
    }
  };

  const { filteredNotificacoes, naoLidasCount } = useMemo(() => ({
    filteredNotificacoes: filter === 'nao-lidas' 
      ? notificacoes.filter(n => !n.lida)
      : notificacoes,
    naoLidasCount: notificacoes.filter(n => !n.lida).length
  }), [notificacoes, filter]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notificações
              {naoLidasCount > 0 && (
                <Badge className="bg-red-500">{naoLidasCount}</Badge>
              )}
            </SheetTitle>
            <div className="flex items-center gap-2">
              {naoLidasCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={marcarTodasComoLidas}
                  className="text-xs"
                >
                  <CheckCheck className="w-4 h-4 mr-1" />
                  Marcar todas
                </Button>
              )}
              {notificacoes.some(n => n.lida) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={limparLidas}
                  className="text-xs text-slate-500"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Limpar lidas
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Filtros */}
        <div className="flex gap-2 mt-4">
          <Button
            variant={filter === 'todas' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('todas')}
            className="flex-1"
          >
            Todas ({notificacoes.length})
          </Button>
          <Button
            variant={filter === 'nao-lidas' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('nao-lidas')}
            className="flex-1"
          >
            Não lidas ({naoLidasCount})
          </Button>
        </div>

        {/* Lista de Notificações */}
        <ScrollArea className="h-[calc(100vh-200px)] mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredNotificacoes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Bell className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">
                {filter === 'nao-lidas' ? 'Nenhuma notificação não lida' : 'Nenhuma notificação'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNotificacoes.map((notif) => {
                const Icon = iconMap[notif.tipo] || Info;
                return (
                  <div
                    key={notif.id}
                    className={cn(
                      "p-3 rounded-lg border transition-all",
                      notif.lida 
                        ? "bg-slate-50 border-slate-200" 
                        : "bg-white border-amber-200 shadow-sm"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                        priorityColors[notif.prioridade]
                      )}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className={cn(
                            "text-sm font-semibold",
                            notif.lida ? "text-slate-600" : "text-slate-900"
                          )}>
                            {notif.titulo}
                          </h4>
                          <button
                            onClick={() => excluirNotificacao(notif.id)}
                            className="text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">{notif.mensagem}</p>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-400">
                            {new Date(notif.created_date).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <div className="flex items-center gap-2">
                            {notif.link && (
                              <Link
                                to={notif.link}
                                onClick={() => {
                                  marcarComoLida(notif);
                                  onOpenChange(false);
                                }}
                                className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                              >
                                Ver →
                              </Link>
                            )}
                            {!notif.lida && (
                              <button
                                onClick={() => marcarComoLida(notif)}
                                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                Marcar lida
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}