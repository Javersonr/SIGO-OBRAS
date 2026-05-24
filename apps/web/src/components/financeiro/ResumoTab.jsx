import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, Wallet } from 'lucide-react';
import { formatCurrency } from './utils';

export default function ResumoTab({ empresaAtiva, transacoes, contas }) {
  const hoje = new Date().toISOString().split('T')[0];

  // Calcular tudo em uma única passagem
  const resumo = React.useMemo(() => {
    const result = {
      receitasEmAberto: 0,
      receitasVencidas: 0,
      receitasRecebidas: 0,
      despesasEmAberto: 0,
      despesasVencidas: 0,
      despesasPagas: 0,
      contagens: {
        receitasEmAbertoCount: 0,
        receitasVencidasCount: 0,
        receitasRecebidasCount: 0,
        despesasEmAbertoCount: 0,
        despesasVencidasCount: 0,
        despesasPagasCount: 0
      }
    };

    transacoes.forEach(t => {
      const valor = t.valor || 0;
      if (t.tipo === 'receita') {
        if (t.status === 'em_aberto') {
          result.receitasEmAberto += valor;
          result.contagens.receitasEmAbertoCount++;
          if (t.data_vencimento < hoje) {
            result.receitasVencidas += valor;
            result.contagens.receitasVencidasCount++;
          }
        } else if (t.status === 'pago') {
          result.receitasRecebidas += valor;
          result.contagens.receitasRecebidasCount++;
        }
      } else if (t.tipo === 'despesa') {
        if (t.status === 'em_aberto') {
          result.despesasEmAberto += valor;
          result.contagens.despesasEmAbertoCount++;
          if (t.data_vencimento < hoje) {
            result.despesasVencidas += valor;
            result.contagens.despesasVencidasCount++;
          }
        } else if (t.status === 'pago') {
          result.despesasPagas += valor;
          result.contagens.despesasPagasCount++;
        }
      }
    });

    return result;
  }, [transacoes, hoje]);

  const balancoPeriodo = resumo.receitasRecebidas - resumo.despesasPagas;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Receitas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Receitas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs md:text-sm text-slate-600">Em aberto</span>
              <Badge className="bg-blue-100 text-blue-700 text-xs">
                {resumo.contagens.receitasEmAbertoCount}
              </Badge>
            </div>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{formatCurrency(resumo.receitasEmAberto)}</p>

            <div className="border-t pt-2 md:pt-3 space-y-2 md:space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-sm text-slate-600">Vencido</span>
                <Badge className="bg-red-100 text-red-700 text-xs">
                  {resumo.contagens.receitasVencidasCount}
                </Badge>
              </div>
              <p className="text-lg md:text-xl font-bold text-red-600">{formatCurrency(resumo.receitasVencidas)}</p>
            </div>

            <div className="border-t pt-2 md:pt-3 space-y-2 md:space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-sm text-slate-600">Recebido</span>
                <Badge className="bg-green-100 text-green-700 text-xs">
                  {resumo.contagens.receitasRecebidasCount}
                </Badge>
              </div>
              <p className="text-lg md:text-xl font-bold text-green-600">{formatCurrency(resumo.receitasRecebidas)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Despesas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Despesas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs md:text-sm text-slate-600">Em aberto</span>
              <Badge className="bg-blue-100 text-blue-700 text-xs">
                {resumo.contagens.despesasEmAbertoCount}
              </Badge>
            </div>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{formatCurrency(resumo.despesasEmAberto)}</p>

            <div className="border-t pt-2 md:pt-3 space-y-2 md:space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-sm text-slate-600">Vencido</span>
                <Badge className="bg-red-100 text-red-700 text-xs">
                  {resumo.contagens.despesasVencidasCount}
                </Badge>
              </div>
              <p className="text-lg md:text-xl font-bold text-red-600">{formatCurrency(resumo.despesasVencidas)}</p>
            </div>

            <div className="border-t pt-2 md:pt-3 space-y-2 md:space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-sm text-slate-600">Pago</span>
                <Badge className="bg-green-100 text-green-700 text-xs">
                  {resumo.contagens.despesasPagasCount}
                </Badge>
              </div>
              <p className="text-lg md:text-xl font-bold text-green-600">{formatCurrency(resumo.despesasPagas)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Resultado */}
        <Card className={balancoPeriodo >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Resultado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4">
            <div>
              <span className="text-xs md:text-sm text-slate-600">Balanço do Período</span>
              <p className={`text-2xl md:text-3xl font-bold mt-2 ${balancoPeriodo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(balancoPeriodo)}
              </p>
            </div>

            <div className="border-t pt-3 md:pt-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-xs md:text-sm text-slate-600">RECEITAS</span>
                </div>
                <div className="h-6 md:h-8 bg-slate-200 rounded-lg overflow-hidden">
                  <div 
                    className="h-full bg-green-500"
                    style={{ width: `${resumo.receitasRecebidas > 0 && resumo.despesasPagas > 0 ? (resumo.receitasRecebidas / (resumo.receitasRecebidas + resumo.despesasPagas)) * 100 : resumo.receitasRecebidas > 0 ? 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Saldo das Contas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-lg">Saldo das Contas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {contas.map(conta => (
              <div key={conta.id} className="p-3 md:p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-slate-800 text-sm md:text-base truncate">{conta.nome}</p>
                  <Wallet className="w-4 h-4 text-slate-400 flex-shrink-0" />
                </div>
                <p className="text-lg md:text-2xl font-bold text-slate-800">{formatCurrency(conta.saldo_atual || conta.saldo_inicial || 0)}</p>
                <p className="text-xs text-slate-500 mt-1">{conta.banco || conta.tipo}</p>
              </div>
            ))}
            {contas.length === 0 && (
              <div className="col-span-1 sm:col-span-2 lg:col-span-3 text-center py-8 text-slate-500">
                <p>Nenhuma conta cadastrada</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}