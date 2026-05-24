import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, CheckCircle2, XCircle, Link2, Settings, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ConciliacaoBancaria({ empresaAtiva, contas, onReload }) {
  const [extratosBancarios, setExtratosBancarios] = useState([]);
  const [transacoesSistema, setTransacoesSistema] = useState([]);
  const [regras, setRegras] = useState([]);
  const [contaSelecionada, setContaSelecionada] = useState('');
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (empresaAtiva && contaSelecionada) {
      loadDados();
    }
  }, [empresaAtiva, contaSelecionada]);

  const loadDados = async () => {
    setLoading(true);
    try {
      const [extratos, transacoes, regrasDb] = await Promise.all([
        base44.entities.ExtratoBancario.filter({ empresa_id: empresaAtiva.id, conta_id: contaSelecionada }),
        base44.entities.TransacaoFinanceira.filter({ empresa_id: empresaAtiva.id, conta_id: contaSelecionada }),
        base44.entities.RegraConciliacao.filter({ empresa_id: empresaAtiva.id, ativo: true })
      ]);
      setExtratosBancarios(extratos);
      setTransacoesSistema(transacoes);
      setRegras(regrasDb);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadExtrato = async (e) => {
    const file = e.target.files[0];
    if (!file || !contaSelecionada) return;

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      await base44.entities.UploadOFX.create({
        empresa_id: empresaAtiva.id,
        conta_id: contaSelecionada,
        arquivo_url: file_url,
        data_upload: new Date().toISOString().split('T')[0],
        status: 'processado'
      });

      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target.result;
        let transacoes = [];
        
        // Detectar tipo de arquivo
        if (file.name.endsWith('.ofx') || file.name.endsWith('.OFX')) {
          transacoes = parseOFX(content);
        } else if (file.name.endsWith('.csv') || file.name.endsWith('.CSV')) {
          transacoes = parseCSV(content);
        }
        
        // Importar sequencialmente com delay
        for (let i = 0; i < transacoes.length; i++) {
          const trans = transacoes[i];
          await base44.entities.ExtratoBancario.create({
            empresa_id: empresaAtiva.id,
            conta_id: contaSelecionada,
            data: trans.data,
            descricao: trans.descricao,
            valor: trans.valor,
            tipo: trans.tipo,
            status_conciliacao: 'pendente'
          });
          
          // Delay para evitar rate limit
          if (i < transacoes.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        await conciliacaoAutomatica();
        loadDados();
        alert(`${transacoes.length} transações importadas com sucesso!`);
      };
      
      reader.readAsText(file);
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      alert('Erro ao processar arquivo');
    }
  };

  const parseOFX = (content) => {
    const transacoes = [];
    const lines = content.split('\n');
    let currentTrans = null;

    lines.forEach(line => {
      if (line.includes('<STMTTRN>')) {
        currentTrans = { tipo: 'debito', valor: 0, data: '', descricao: '' };
      } else if (line.includes('</STMTTRN>') && currentTrans) {
        transacoes.push(currentTrans);
        currentTrans = null;
      } else if (currentTrans) {
        if (line.includes('<TRNTYPE>')) {
          const tipo = line.match(/<TRNTYPE>(.*?)</)?.[1];
          currentTrans.tipo = tipo === 'CREDIT' ? 'credito' : 'debito';
        } else if (line.includes('<DTPOSTED>')) {
          const data = line.match(/<DTPOSTED>(.*?)</)?.[1];
          if (data) {
            const ano = data.substring(0, 4);
            const mes = data.substring(4, 6);
            const dia = data.substring(6, 8);
            currentTrans.data = `${ano}-${mes}-${dia}`;
          }
        } else if (line.includes('<TRNAMT>')) {
          currentTrans.valor = Math.abs(parseFloat(line.match(/<TRNAMT>(.*?)</)?.[1] || 0));
        } else if (line.includes('<MEMO>')) {
          currentTrans.descricao = line.match(/<MEMO>(.*?)</)?.[1] || '';
        }
      }
    });

    return transacoes;
  };

  const parseCSV = (content) => {
    const transacoes = [];
    const lines = content.split('\n');
    
    // Pular cabeçalho se existir
    const startIndex = lines[0].toLowerCase().includes('data') || lines[0].toLowerCase().includes('date') ? 1 : 0;
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Separar por vírgula ou ponto-e-vírgula
      const parts = line.split(/[,;]/).map(p => p.trim().replace(/['"]/g, ''));
      
      if (parts.length >= 3) {
        try {
          // Formato esperado: Data, Descrição, Valor [, Tipo]
          let data = parts[0];
          
          // Tentar diferentes formatos de data
          if (data.includes('/')) {
            const dateParts = data.split('/');
            if (dateParts.length === 3) {
              // DD/MM/YYYY ou MM/DD/YYYY
              const d = dateParts[0].length === 4 ? dateParts : dateParts.reverse();
              data = `${d[0]}-${d[1].padStart(2, '0')}-${d[2].padStart(2, '0')}`;
            }
          }
          
          const descricao = parts[1];
          let valor = parseFloat(parts[2].replace(/[^\d.,-]/g, '').replace(',', '.'));
          
          // Determinar tipo (crédito/débito)
          let tipo = 'debito';
          if (parts.length >= 4) {
            const tipoStr = parts[3].toLowerCase();
            if (tipoStr.includes('cred') || tipoStr.includes('+') || tipoStr === 'c') {
              tipo = 'credito';
            }
          } else if (valor > 0 && (descricao.toLowerCase().includes('receb') || descricao.toLowerCase().includes('deposit'))) {
            tipo = 'credito';
          }
          
          valor = Math.abs(valor);
          
          if (data && descricao && valor) {
            transacoes.push({ data, descricao, valor, tipo });
          }
        } catch (err) {
          console.error('Erro ao processar linha CSV:', line, err);
        }
      }
    }
    
    return transacoes;
  };

  const conciliacaoAutomatica = async () => {
    const extratosPendentes = extratosBancarios.filter(e => e.status_conciliacao === 'pendente');
    const transacoesPendentes = transacoesSistema.filter(t => !t.conciliado);

    for (const extrato of extratosPendentes) {
      for (const regra of regras) {
        const match = encontrarMatch(extrato, transacoesPendentes, regra);
        if (match) {
          await conciliarTransacao(extrato.id, match.id);
          break;
        }
      }
    }
  };

  const encontrarMatch = (extrato, transacoes, regra) => {
    return transacoes.find(t => {
      const toleranciaValor = regra.tolerancia_valor || 0;
      const toleranciaDias = regra.tolerancia_dias || 0;

      const valorMatch = Math.abs(t.valor - extrato.valor) <= toleranciaValor;
      const diasDiff = Math.abs(
        (new Date(t.data) - new Date(extrato.data)) / (1000 * 60 * 60 * 24)
      );
      const dataMatch = diasDiff <= toleranciaDias;

      let descMatch = false;
      if (regra.tipo_match === 'exato') {
        descMatch = t.descricao === extrato.descricao;
      } else if (regra.tipo_match === 'contem') {
        descMatch = t.descricao?.toLowerCase().includes(extrato.descricao?.toLowerCase());
      } else if (regra.tipo_match === 'palavra_chave' && regra.palavras_chave) {
        const palavras = JSON.parse(regra.palavras_chave);
        descMatch = palavras.some(p => 
          extrato.descricao?.toLowerCase().includes(p.toLowerCase())
        );
      }

      return valorMatch && dataMatch && (regra.ignorar_descricao || descMatch);
    });
  };

  const conciliarTransacao = async (extratoId, transacaoId) => {
    await Promise.all([
      base44.entities.ExtratoBancario.update(extratoId, {
        status_conciliacao: 'conciliado',
        transacao_id: transacaoId,
        data_conciliacao: new Date().toISOString().split('T')[0]
      }),
      base44.entities.TransacaoFinanceira.update(transacaoId, {
        conciliado: true,
        extrato_id: extratoId
      })
    ]);
    loadDados();
  };

  const handleConciliacaoManual = async (transacaoId) => {
    if (!itemSelecionado) return;
    await conciliarTransacao(itemSelecionado.id, transacaoId);
    setShowMatchModal(false);
    setItemSelecionado(null);
  };

  const extratosPendentes = extratosBancarios.filter(e => e.status_conciliacao === 'pendente');
  const extratosConciliados = extratosBancarios.filter(e => e.status_conciliacao === 'conciliado');
  const transacoesPendentes = transacoesSistema.filter(t => !t.conciliado && t.status === 'pago');

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Conciliação Bancária</h3>
          <p className="text-sm text-slate-500">Concilie transações do extrato com o sistema</p>
        </div>
        <div className="flex gap-2">
          <Select value={contaSelecionada} onValueChange={setContaSelecionada}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecione a conta" />
            </SelectTrigger>
            <SelectContent>
              {contas.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="file"
            accept=".ofx,.csv,.OFX,.CSV"
            onChange={handleUploadExtrato}
            className="hidden"
            id="upload-extrato"
          />
          <Button
            onClick={() => document.getElementById('upload-extrato').click()}
            disabled={!contaSelecionada}
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            Importar Extrato
          </Button>
        </div>
      </div>

      {contaSelecionada && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-yellow-600" />
                  <p className="text-sm text-slate-600">Pendentes</p>
                </div>
                <p className="text-2xl font-bold text-slate-900">{extratosPendentes.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <p className="text-sm text-slate-600">Conciliadas</p>
                </div>
                <p className="text-2xl font-bold text-slate-900">{extratosConciliados.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <p className="text-sm text-slate-600">Divergências</p>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {transacoesPendentes.length}
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="pendentes">
            <TabsList>
              <TabsTrigger value="pendentes">Pendentes ({extratosPendentes.length})</TabsTrigger>
              <TabsTrigger value="conciliadas">Conciliadas ({extratosConciliados.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="pendentes" className="space-y-4">
              {extratosPendentes.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-4" />
                    <p className="text-slate-600">Todas as transações foram conciliadas!</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-100 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Data</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Descrição</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Valor</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Status</th>
                        <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extratosPendentes.map(e => (
                        <tr key={e.id} className="border-b hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm">
                            {new Date(e.data).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 text-sm">{e.descricao}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={e.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}>
                              {formatCurrency(e.valor)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                              Pendente
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                           <div className="flex gap-2 justify-center">
                             <Button
                               size="sm"
                               variant="outline"
                               onClick={() => {
                                 setItemSelecionado(e);
                                 setShowMatchModal(true);
                               }}
                               className="gap-2"
                             >
                               <Link2 className="w-4 h-4" />
                               Conciliar
                             </Button>
                             {(() => {
                               // Buscar sugestões automáticas
                               const sugestoes = transacoesPendentes.filter(t => {
                                 const valorMatch = Math.abs(t.valor - e.valor) <= 0.10;
                                 const diasDiff = Math.abs(
                                   (new Date(t.data) - new Date(e.data)) / (1000 * 60 * 60 * 24)
                                 );
                                 return valorMatch && diasDiff <= 5;
                               });

                               if (sugestoes.length > 0) {
                                 return (
                                   <Badge variant="outline" className="text-green-600 border-green-600">
                                     {sugestoes.length} {sugestoes.length === 1 ? 'sugestão' : 'sugestões'}
                                   </Badge>
                                 );
                               }
                             })()}
                           </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="conciliadas">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-100 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Data</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Descrição</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Valor</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Status</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Conciliado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extratosConciliados.map(e => (
                      <tr key={e.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm">
                          {new Date(e.data).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 text-sm">{e.descricao}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={e.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(e.valor)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Conciliado
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {e.data_conciliacao ? new Date(e.data_conciliacao).toLocaleDateString('pt-BR') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Modal de Conciliação Manual */}
      <Sheet open={showMatchModal} onOpenChange={setShowMatchModal}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Conciliar Transação</SheetTitle>
          </SheetHeader>

          {itemSelecionado && (
            <div className="space-y-6 py-6">
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <p className="text-sm text-slate-600 mb-2">Transação do Extrato Bancário:</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Data</p>
                      <p className="font-semibold">{new Date(itemSelecionado.data).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Descrição</p>
                      <p className="font-semibold">{itemSelecionado.descricao}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Valor</p>
                      <p className="font-semibold text-blue-700">{formatCurrency(itemSelecionado.valor)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div>
                <h4 className="font-semibold text-slate-800 mb-3">Sugestões de Conciliação</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {(() => {
                    // Calcular score de similaridade para cada transação
                    const scored = transacoesPendentes.map(t => {
                      let score = 0;
                      
                      // Score por valor (40 pontos)
                      const diffValor = Math.abs(t.valor - itemSelecionado.valor);
                      if (diffValor === 0) score += 40;
                      else if (diffValor <= 0.10) score += 30;
                      else if (diffValor <= 1) score += 20;
                      else if (diffValor <= 10) score += 10;
                      
                      // Score por data (30 pontos)
                      const diasDiff = Math.abs(
                        (new Date(t.data) - new Date(itemSelecionado.data)) / (1000 * 60 * 60 * 24)
                      );
                      if (diasDiff === 0) score += 30;
                      else if (diasDiff <= 1) score += 25;
                      else if (diasDiff <= 3) score += 20;
                      else if (diasDiff <= 7) score += 10;
                      
                      // Score por descrição (30 pontos)
                      const descExtrato = itemSelecionado.descricao?.toLowerCase() || '';
                      const descTransacao = t.descricao?.toLowerCase() || '';
                      if (descExtrato.includes(descTransacao) || descTransacao.includes(descExtrato)) {
                        score += 30;
                      } else {
                        const palavrasExtrato = descExtrato.split(' ');
                        const palavrasTransacao = descTransacao.split(' ');
                        const palavrasComuns = palavrasExtrato.filter(p => palavrasTransacao.includes(p) && p.length > 3);
                        score += Math.min(30, palavrasComuns.length * 10);
                      }
                      
                      return { ...t, score };
                    });
                    
                    // Ordenar por score (maior primeiro)
                    const sorted = scored.sort((a, b) => b.score - a.score);
                    
                    return sorted.map(t => (
                      <div
                        key={t.id}
                        className="p-4 border rounded-lg hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => handleConciliacaoManual(t.id)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-slate-800">{t.descricao}</p>
                              {t.score >= 70 && (
                                <Badge className="bg-green-100 text-green-700 text-xs">
                                  Alta compatibilidade
                                </Badge>
                              )}
                              {t.score >= 50 && t.score < 70 && (
                                <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">
                                  Possível match
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {new Date(t.data).toLocaleDateString('pt-BR')} • {t.categoria_nome}
                            </p>
                          </div>
                          <p className={`text-lg font-bold ${t.tipo === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(t.valor)}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {Math.abs(t.valor - itemSelecionado.valor) === 0 && (
                            <Badge className="bg-green-100 text-green-700 text-xs">
                              ✓ Valor exato
                            </Badge>
                          )}
                          {Math.abs(
                            (new Date(t.data) - new Date(itemSelecionado.data)) / (1000 * 60 * 60 * 24)
                          ) <= 1 && (
                            <Badge className="bg-blue-100 text-blue-700 text-xs">
                              ✓ Data próxima
                            </Badge>
                          )}
                          {t.score < 50 && (
                            <Badge variant="outline" className="text-slate-500 text-xs">
                              Score: {t.score}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                  
                  {transacoesPendentes.length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                      <p>Nenhuma transação pendente encontrada</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}