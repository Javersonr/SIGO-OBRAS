import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '@/Layout';
import { createPageUrl } from '../utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, User, Calendar, MapPin, CheckCircle2, 
  AlertCircle, Clock, X, Image as ImageIcon, TrendingUp
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function InspecaoDetalhes() {
  const navigate = useNavigate();
  const { empresaAtiva } = useEmpresa();
  const [inspecao, setInspecao] = useState(null);
  const [ferramentasInsp, setFerramentasInsp] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fotoExpandida, setFotoExpandida] = useState(null);

  useEffect(() => {
    if (empresaAtiva) {
      loadInspecao();
    }
  }, [empresaAtiva]);

  const loadInspecao = async () => {
    try {
      setLoading(true);
      const urlParams = new URLSearchParams(window.location.search);
      const id = urlParams.get('id');

      if (!id) {
        navigate(createPageUrl('HistoricoInspecoes'));
        return;
      }

      const data = await base44.entities.InspecaoFerramenta.filter({ id });
      
      if (data.length === 0) {
        navigate(createPageUrl('HistoricoInspecoes'));
        return;
      }

      setInspecao(data[0]);
      
      if (data[0].ferramentas_inspecionadas) {
        const parsed = JSON.parse(data[0].ferramentas_inspecionadas);
        setFerramentasInsp(parsed);
      }
    } catch (error) {
      console.error('Erro ao carregar inspeção:', error);
      navigate(createPageUrl('HistoricoInspecoes'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Carregando detalhes...</p>
        </div>
      </div>
    );
  }

  if (!inspecao) return null;

  const totalItens = ferramentasInsp.reduce((sum, f) => sum + f.itens.length, 0);
  const concluidos = ferramentasInsp.reduce(
    (sum, f) => sum + f.itens.filter(i => i.status_foto === 'concluida').length,
    0
  );
  const falhados = ferramentasInsp.reduce(
    (sum, f) => sum + f.itens.filter(i => i.status_foto === 'falhou').length,
    0
  );
  const percentual = Math.round((concluidos / totalItens) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate(createPageUrl('HistoricoInspecoes'))}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
            Detalhes da Inspeção
          </h1>
          <p className="text-slate-600 mt-1">
            Visualize todas as informações e fotos da inspeção
          </p>
        </div>
      </div>

      {/* Informações Gerais */}
      <Card>
        <CardHeader>
          <CardTitle>Informações da Inspeção</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-sm text-slate-600">Funcionário</p>
                <p className="font-semibold text-slate-800">{inspecao.funcionario_nome}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-sm text-slate-600">Data da Inspeção</p>
                <p className="font-semibold text-slate-800">
                  {format(new Date(inspecao.created_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>

            {inspecao.caminhao_localizacao && (
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-slate-500" />
                <div>
                  <p className="text-sm text-slate-600">Localização</p>
                  <p className="font-semibold text-slate-800">{inspecao.caminhao_localizacao}</p>
                </div>
              </div>
            )}
          </div>

          {inspecao.observacoes && (
            <div className="pt-4 border-t">
              <p className="text-sm text-slate-600 mb-1">Observações</p>
              <p className="text-slate-800">{inspecao.observacoes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progresso */}
      <Card>
        <CardHeader>
          <CardTitle>Progresso da Inspeção</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-green-700">{concluidos}</p>
              <p className="text-sm text-green-600">Concluídas</p>
            </div>

            <div className="text-center p-4 bg-red-50 rounded-lg">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-red-700">{falhados}</p>
              <p className="text-sm text-red-600">Falhadas</p>
            </div>

            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-slate-700">{totalItens - concluidos - falhados}</p>
              <p className="text-sm text-slate-600">Pendentes</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700">Progresso Total</span>
              <span className="text-sm font-bold text-slate-800">{percentual}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3">
              <div 
                className="bg-green-600 h-3 rounded-full transition-all"
                style={{ width: `${percentual}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ferramentas Inspecionadas */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Ferramentas Inspecionadas</h2>
        
        {ferramentasInsp.map((ferramenta, ferIdx) => (
          <Card key={ferIdx}>
            <CardHeader className="bg-slate-50">
              <div className="flex items-center gap-3">
                {ferramenta.foto_url && (
                  <button
                    onClick={() => setFotoExpandida(ferramenta.foto_url)}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <img 
                      src={ferramenta.foto_url} 
                      alt={ferramenta.descricao}
                      className="w-16 h-16 rounded-lg object-cover border-2 border-white shadow"
                    />
                  </button>
                )}
                <div>
                  <CardTitle className="text-lg">{ferramenta.descricao}</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">{ferramenta.codigo}</p>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-4">
              <div className="space-y-3">
                {ferramenta.itens.map((item, itemIdx) => (
                  <div 
                    key={itemIdx} 
                    className="p-4 bg-slate-50 rounded-lg space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-semibold text-slate-800">Item #{itemIdx + 1}</p>
                          {item.status_foto === 'concluida' ? (
                            <Badge className="bg-green-100 text-green-700 gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Validada
                            </Badge>
                          ) : item.status_foto === 'falhou' ? (
                            <Badge className="bg-red-100 text-red-700 gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Falhou
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-700">Pendente</Badge>
                          )}
                        </div>

                        {item.numero_serie && (
                          <p className="text-sm text-slate-600">
                            Número de Série: <span className="font-medium">{item.numero_serie}</span>
                          </p>
                        )}

                        {item.ai_confidence !== undefined && (
                          <div className="flex items-center gap-2 mt-2">
                            <TrendingUp className="w-4 h-4 text-blue-600" />
                            <span className="text-sm text-slate-700">
                              Confiança IA:{' '}
                              <span className="font-semibold text-blue-600">
                                {Math.round(item.ai_confidence * 100)}%
                              </span>
                            </span>
                          </div>
                        )}
                      </div>

                      {item.foto_url && (
                        <button
                          onClick={() => setFotoExpandida(item.foto_url)}
                          className="cursor-pointer hover:opacity-80 transition-opacity group"
                        >
                          <div className="relative">
                            <img 
                              src={item.foto_url} 
                              alt={`Item ${itemIdx + 1}`}
                              className="w-24 h-24 rounded-lg object-cover border-2 border-white shadow-md"
                            />
                            <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <ImageIcon className="w-6 h-6 text-white" />
                            </div>
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal de Foto Expandida */}
      {fotoExpandida && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setFotoExpandida(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full">
            <img 
              src={fotoExpandida} 
              alt="Foto expandida"
              className="w-full h-full object-contain"
            />
            <button
              onClick={() => setFotoExpandida(null)}
              className="absolute top-4 right-4 bg-white rounded-full p-2 hover:bg-slate-200 transition-colors shadow-lg"
            >
              <X className="w-6 h-6 text-slate-800" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}