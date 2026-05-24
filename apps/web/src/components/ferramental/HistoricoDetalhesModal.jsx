import React, { useState } from 'react';
import SheetModal from '@/components/ui/sheet-modal';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, User, MapPin, Camera, Zap, Hash, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function HistoricoDetalhesModal({ open, onOpenChange, item }) {
  const [fotoExpandida, setFotoExpandida] = useState(false);

  if (!item) return null;

  const statusConfianca = (confianca) => {
    if (confianca >= 80) return { cor: 'bg-green-100 text-green-800', label: 'Alta' };
    if (confianca >= 60) return { cor: 'bg-yellow-100 text-yellow-800', label: 'Média' };
    return { cor: 'bg-red-100 text-red-800', label: 'Baixa' };
  };

  const confiancaStyle = statusConfianca(item.confianca_ia || 0);

  return (
    <>
      <SheetModal
        open={open}
        onOpenChange={onOpenChange}
        title="Detalhes do Histórico"
        subtitle={`${item.ferramenta_descricao} - ${format(new Date(item.timestamp), 'd MMM yyyy HH:mm', { locale: ptBR })}`}
      >
        <div className="space-y-4">
          {/* Informações Principais */}
          <Card className="p-4 bg-slate-50 border-slate-200">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium">FERRAMENTA</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    {item.ferramenta_descricao}
                  </p>
                  <p className="text-xs text-slate-600">Código: {item.ferramenta_codigo}</p>
                </div>
                <Badge className="bg-blue-100 text-blue-800 text-xs">
                  {item.tipo_operacao}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200">
                <div>
                  <p className="text-xs text-slate-500 font-medium">QUANTIDADE</p>
                  <p className="text-lg font-bold text-slate-900 mt-1">{item.quantidade}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">LOCALIZAÇÃO</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {item.localizacao}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Dados de Usuário e Data */}
          <Card className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">{item.usuario_nome}</span>
              <span className="text-xs text-slate-400">({item.usuario_email})</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">
                {format(new Date(item.timestamp), 'd MMM yyyy HH:mm', { locale: ptBR })}
              </span>
            </div>
          </Card>

          {/* Método de Identificação */}
          <Card className="p-3 bg-blue-50 border-blue-200">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="text-xs font-medium text-blue-900">MÉTODO DE IDENTIFICAÇÃO</p>
                <Badge className="mt-2 bg-blue-200 text-blue-900 text-xs capitalize">
                  {item.metodo_identificacao}
                </Badge>
              </div>
              {item.confianca_ia !== undefined && (
                <div className="flex-1">
                  <p className="text-xs font-medium text-slate-700">CONFIANÇA IA</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={`${confiancaStyle.cor} text-xs`}>
                      {item.confianca_ia}% - {confiancaStyle.label}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Número de Série */}
          {item.numero_serie_verificado && (
            <Card className="p-3 bg-amber-50 border-amber-200">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-amber-600" />
                <div>
                  <p className="text-xs font-medium text-amber-900">NÚMERO DE SÉRIE</p>
                  <p className="text-sm font-semibold text-amber-900 mt-0.5">
                    {item.numero_serie_verificado}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Tabs de Foto e Observações */}
          <Tabs defaultValue="foto" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              {item.foto_url && <TabsTrigger value="foto" className="gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                Foto
              </TabsTrigger>}
              {item.observacoes && <TabsTrigger value="observacoes" className="gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Observações
              </TabsTrigger>}
            </TabsList>

            {item.foto_url && (
              <TabsContent value="foto" className="space-y-3">
                <Card className="p-2 bg-slate-50 border-slate-200 relative">
                  <img
                    src={item.foto_url}
                    alt="Foto capturada"
                    className="w-full h-48 object-contain rounded cursor-pointer hover:opacity-80 transition"
                    onClick={() => setFotoExpandida(true)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-3 right-3 bg-white/80 hover:bg-white"
                    onClick={() => setFotoExpandida(true)}
                  >
                    <Eye className="w-4 h-4 text-slate-600" />
                  </Button>
                </Card>
                <p className="text-xs text-slate-500 text-center">Clique na foto para ampliar</p>
              </TabsContent>
            )}

            {item.observacoes && (
              <TabsContent value="observacoes" className="space-y-3">
                <Card className="p-3 bg-slate-50 border-slate-200">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {item.observacoes}
                  </p>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </SheetModal>

      {/* Modal de Foto Expandida */}
      {fotoExpandida && item.foto_url && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setFotoExpandida(false)}
        >
          <div className="max-w-2xl max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={item.foto_url}
              alt="Foto expandida"
              className="w-full h-full object-contain rounded-lg"
            />
            <button
              onClick={() => setFotoExpandida(false)}
              className="absolute top-3 right-3 bg-white/20 hover:bg-white/40 rounded-full p-2 transition"
            >
              <span className="text-white text-2xl">×</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}