import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Download, CheckCircle2, Eye, Copy, Link2Off, Paperclip, Link2, Trash2, Edit, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AnexoViewer from '../shared/AnexoViewer';
import ModalPagamento from './ModalPagamento';

export default function DetalheDespesaModal({ 
  open, 
  onOpenChange, 
  despesa, 
  anexos,
  podeEditar,
  onEditar,
  onBaixar,
  empresaAtiva,
  onEmitirRecibo,
  onAdicionarAnexo,
  onDuplicar,
  onDesfazerConciliacao,
  onExcluir,
  somenteLeitura = false
}) {
  const [anexoSelecionado, setAnexoSelecionado] = useState(null);
  const [showAnexoViewer, setShowAnexoViewer] = useState(false);
  const [showModalPagamento, setShowModalPagamento] = useState(false);
  const [despesaPagamento, setDespesaPagamento] = useState(null);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  const formatDate = (date) => {
    return date ? new Date(date).toLocaleDateString('pt-BR') : '-';
  };

  const handleVisualizarAnexo = (anexo) => {
    setAnexoSelecionado(anexo);
    setShowAnexoViewer(true);
  };

  if (!despesa) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col" style={{ inset: 'auto 0 0 256px', width: 'calc(100% - 256px)', maxWidth: 'none' }}>
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle className="flex items-center gap-3">
              <span>Detalhes da Despesa</span>
              {despesa?.conciliado && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  <Link2 className="w-4 h-4 mr-1" />
                  Conciliado
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          <button 
            onClick={() => onOpenChange(false)}
            className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Parcelas */}
          {despesa.parcelado && despesa.parcelas && (() => {
            try {
              const parcelasData = JSON.parse(despesa.parcelas);
              return (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h3 className="text-sm font-semibold text-blue-800 mb-3">
                    Despesa Parcelada ({parcelasData.length}x)
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {parcelasData.map((parcela, index) => (
                      <div 
                        key={index} 
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          parcela.status === 'pago' 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {parcela.status === 'pago' ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-orange-400" />
                          )}
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              Parcela {parcela.numero}/{parcelasData.length}
                            </p>
                            <p className="text-xs text-slate-500">
                              Vencimento: {formatDate(parcela.data_vencimento)}
                              {parcela.data_pagamento && ` • Pago em: ${formatDate(parcela.data_pagamento)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-800">{formatCurrency(parcela.valor)}</p>
                            <Badge 
                              variant="outline" 
                              className={parcela.status === 'pago' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-orange-100 text-orange-700 border-orange-300'}
                            >
                              {parcela.status === 'pago' ? 'Pago' : 'Pendente'}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            variant={parcela.status === 'pago' ? 'outline' : 'default'}
                            className={parcela.status === 'pago' ? '' : 'bg-green-600 hover:bg-green-700'}
                            onClick={async () => {
                              if (parcela.status === 'pago') {
                                if (!confirm('Desfazer pagamento desta parcela?')) return;
                                const novasParcelas = [...parcelasData];
                                novasParcelas[index].status = 'em_aberto';
                                novasParcelas[index].data_pagamento = null;
                                novasParcelas[index].comprovante_url = null;
                                
                                await base44.entities.TransacaoFinanceira.update(despesa.id, {
                                  parcelas: JSON.stringify(novasParcelas)
                                });
                                
                                if (onBaixar) onBaixar(despesa);
                              } else {
                                // Abrir modal de pagamento para esta parcela
                                setDespesaPagamento({ 
                                  ...despesa,
                                  _parcelaIndex: index,
                                  _parcela: parcela,
                                  _parcelasData: parcelasData,
                                  valor: parcela.valor
                                });
                                setShowModalPagamento(true);
                              }
                            }}
                          >
                            {parcela.status === 'pago' ? 'Desfazer' : 'Pagar'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            } catch (e) {
              return null;
            }
          })()}

          {/* Informações Principais */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">
              Informações Gerais
            </h3>
            <div className="space-y-4">
              <div>
                <Label className="text-slate-500">Descrição</Label>
                <p className="mt-1 text-slate-800 font-medium">{despesa.descricao || '-'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-500">Valor Total</Label>
                  <p className="mt-1 text-lg font-bold text-red-600">{formatCurrency(despesa.valor)}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Forma de Pagamento</Label>
                  <p className="mt-1 text-slate-800">
                    {despesa.forma_pagamento ? (
                      <Badge variant="outline" className="capitalize">{despesa.forma_pagamento}</Badge>
                    ) : '-'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-slate-500">Data Competência</Label>
                  <p className="mt-1 text-slate-800">{formatDate(despesa.data)}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Data Vencimento</Label>
                  <p className="mt-1 text-slate-800">{formatDate(despesa.data_vencimento)}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Data Pagamento</Label>
                  <p className="mt-1 text-slate-800">{formatDate(despesa.data_pagamento)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Relacionamentos */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">
              Relacionamentos
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-500">Fornecedor</Label>
                <p className="mt-1 text-slate-800">{despesa.fornecedor_nome || '-'}</p>
              </div>
              <div>
                <Label className="text-slate-500">Categoria</Label>
                <p className="mt-1 text-slate-800">
                  {despesa.categoria_nome ? (
                    <Badge variant="outline">{despesa.categoria_nome}</Badge>
                  ) : '-'}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Conta</Label>
                <p className="mt-1 text-slate-800">{despesa.conta_nome || '-'}</p>
              </div>
              <div>
                <Label className="text-slate-500">Centro de Custo</Label>
                <p className="mt-1 text-slate-800">{despesa.centro_custo_nome || despesa.centro_custo || '-'}</p>
              </div>
              <div>
                <Label className="text-slate-500">Projeto</Label>
                <p className="mt-1 text-slate-800">{despesa.projeto_nome || '-'}</p>
              </div>
            </div>
          </div>

          {/* Anexos */}
          {anexos.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">
                Anexos ({anexos.length})
              </h3>
              <div className="space-y-2">
                {anexos.map((anexo) => {
                  const isPdf = anexo.tipo?.includes('pdf') || anexo.nome?.endsWith('.pdf');
                  const isImage = anexo.tipo?.includes('image') || anexo.nome?.match(/\.(jpg|jpeg|png|gif)$/i);
                  
                  return (
                    <div key={anexo.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {isImage ? (
                          <div className="w-10 h-10 rounded overflow-hidden bg-slate-100 flex-shrink-0">
                            <img src={anexo.url} alt={anexo.nome} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className={`w-10 h-10 rounded flex items-center justify-center flex-shrink-0 ${
                            isPdf ? 'bg-red-100' : 'bg-slate-100'
                          }`}>
                            <FileText className={`w-5 h-5 ${isPdf ? 'text-red-600' : 'text-slate-500'}`} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{anexo.nome}</p>
                          {anexo.tipo && (
                            <p className="text-xs text-slate-500">{anexo.tipo}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleVisualizarAnexo(anexo)}
                          title="Visualizar"
                        >
                          <Eye className="w-4 h-4 text-slate-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = anexo.url;
                            link.download = anexo.nome || 'anexo';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          title="Baixar arquivo"
                        >
                          <Download className="w-4 h-4 text-blue-600" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Informações Adicionais */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">
              Informações do Sistema
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <Label className="text-slate-500">Criado em</Label>
                <p className="mt-1 text-slate-800">
                  {despesa.created_date ? new Date(despesa.created_date).toLocaleDateString('pt-BR') + ' ' + 
                   new Date(despesa.created_date).toLocaleTimeString('pt-BR') : '-'}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Criado por</Label>
                <p className="mt-1 text-slate-800">{despesa.created_by || '-'}</p>
              </div>
              <div>
                <Label className="text-slate-500">Última atualização</Label>
                <p className="mt-1 text-slate-800">
                  {despesa.updated_date ? new Date(despesa.updated_date).toLocaleDateString('pt-BR') + ' ' + 
                   new Date(despesa.updated_date).toLocaleTimeString('pt-BR') : '-'}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Conciliado</Label>
                <p className="mt-1 text-slate-800">
                  {despesa.conciliado ? (
                    <Badge className="bg-green-100 text-green-700">Sim</Badge>
                  ) : (
                    <Badge variant="outline">Não</Badge>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          {/* Ações Rápidas - ocultas em modo somente leitura */}
          {!somenteLeitura && <div className="flex flex-wrap gap-2 pb-3 border-b">
            {!despesa.parcelado && (
              <Button 
                variant={despesa.status === 'Realizado' ? 'outline' : 'default'}
                size="sm"
                onClick={() => {
                  if (despesa.status === 'Realizado') {
                    if (confirm('Desfazer pagamento desta despesa?')) {
                      onBaixar(despesa);
                    }
                  } else {
                    setShowModalPagamento(true);
                  }
                }}
                className={despesa.status === 'Realizado' ? 'text-blue-600' : 'bg-green-600 hover:bg-green-700'}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {despesa.status === 'Realizado' ? 'Desfazer Pagamento' : 'Registrar Pagamento'}
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                if (onEmitirRecibo) onEmitirRecibo(despesa);
              }}
              className="text-blue-600"
            >
              <FileText className="w-4 h-4 mr-2" />
              Emitir Recibo
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                if (onAdicionarAnexo) {
                  onAdicionarAnexo(despesa);
                }
              }}
              className="text-green-600"
            >
              <Paperclip className="w-4 h-4 mr-2" />
              Adicionar Anexo
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                if (onDuplicar) {
                  onOpenChange(false);
                  onDuplicar(despesa);
                }
              }}
              className="text-purple-600"
            >
              <Copy className="w-4 h-4 mr-2" />
              Duplicar
            </Button>
            {despesa.conciliado && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  if (onDesfazerConciliacao) {
                    onOpenChange(false);
                    onDesfazerConciliacao(despesa);
                  }
                }}
                className="text-orange-600"
              >
                <Link2Off className="w-4 h-4 mr-2" />
                Desfazer Conciliação
              </Button>
            )}
          </div>}

          {/* Botões Principais */}
          <div className="flex gap-3">
            {podeEditar && onExcluir && (
              <Button 
                variant="outline" 
                onClick={() => {
                  if (confirm('Deseja realmente excluir esta despesa?')) {
                    onOpenChange(false);
                    onExcluir(despesa);
                  }
                }}
                className="text-red-600 hover:bg-red-50 flex-1"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Fechar
            </Button>
            {podeEditar && (
              <Button 
                onClick={() => {
                  onOpenChange(false);
                  onEditar(despesa);
                }} 
                className="bg-amber-500 hover:bg-amber-600 flex-1"
              >
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Button>
            )}
          </div>
        </div>
      </SheetContent>

      <AnexoViewer
        anexo={anexoSelecionado}
        open={showAnexoViewer}
        onOpenChange={setShowAnexoViewer}
      />

      <ModalPagamento
        open={showModalPagamento}
        onOpenChange={setShowModalPagamento}
        despesa={despesaPagamento || despesa}
        empresaAtiva={empresaAtiva}
        onConfirm={async (dataPagamento, comprovanteUrl) => {
          try {
            // Se é pagamento de parcela individual
            if (despesaPagamento?._parcelaIndex !== undefined) {
              const novasParcelas = [...despesaPagamento._parcelasData];
              novasParcelas[despesaPagamento._parcelaIndex].status = 'pago';
              novasParcelas[despesaPagamento._parcelaIndex].data_pagamento = dataPagamento;
              novasParcelas[despesaPagamento._parcelaIndex].comprovante_url = comprovanteUrl;
              
              await base44.entities.TransacaoFinanceira.update(despesa.id, {
                parcelas: JSON.stringify(novasParcelas)
              });
            } else {
              // Pagamento normal da despesa inteira
              await base44.entities.TransacaoFinanceira.update(despesa.id, {
                status: 'Realizado',
                data_pagamento: dataPagamento
              });
              
              // Salvar comprovante se foi enviado
              if (comprovanteUrl) {
                await base44.entities.TransacaoAnexo.create({
                  empresa_id: empresaAtiva.id,
                  transacao_id: despesa.id,
                  nome: 'Comprovante de Pagamento',
                  url: comprovanteUrl,
                  tipo: 'comprovante'
                });
              }
            }
            
            setDespesaPagamento(null);
            setShowModalPagamento(false);
            if (onBaixar) onBaixar(despesa);
          } catch (err) {
            alert('Erro ao registrar pagamento: ' + err.message);
          }
        }}
      />
    </Sheet>
  );
}