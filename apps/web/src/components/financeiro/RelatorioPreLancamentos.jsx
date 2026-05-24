import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function RelatorioPreLancamentos({ empresaId, usuarioEmail, verTodos }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const CORES = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6'];

  useEffect(() => {
    carregarDados();
  }, [empresaId, usuarioEmail, verTodos]);

  const carregarDados = async () => {
    try {
      setCarregando(true);

      const filtro = { empresa_id: empresaId };
      if (!verTodos && usuarioEmail) {
        filtro.usuario_email = usuarioEmail;
      }
      const preLancamentos = await base44.entities.PreLancamento.filter(filtro);

      // Processar dados
      const porStatus = {};
      const porProjeto = {};
      let totalValor = 0;
      let totalItens = preLancamentos.length;

      preLancamentos.forEach(item => {
        const dados = typeof item.dados_extraidos === 'string'
          ? JSON.parse(item.dados_extraidos)
          : item.dados_extraidos;

        const valor = parseFloat(dados.valor || 0);
        totalValor += valor;

        // Por status
        porStatus[item.status] = (porStatus[item.status] || 0) + 1;

        // Por projeto
        const projeto = item.projeto_nome || 'Sem Projeto';
        if (!porProjeto[projeto]) {
          porProjeto[projeto] = { quantidade: 0, valor: 0 };
        }
        porProjeto[projeto].quantidade += 1;
        porProjeto[projeto].valor += valor;
      });

      const statusData = Object.entries(porStatus).map(([status, qtd]) => ({
        name: status,
        quantidade: qtd
      }));

      const projetoData = Object.entries(porProjeto).map(([projeto, dados]) => ({
        name: projeto,
        valor: dados.valor,
        quantidade: dados.quantidade
      }));

      setDados({
        totalItens,
        totalValor,
        statusData,
        projetoData,
        porStatus
      });
    } catch (error) {
      console.error('Erro ao carregar relatório:', error);
    } finally {
      setCarregando(false);
    }
  };

  if (carregando) {
    return (
      <Card>
        <CardContent className="flex justify-center items-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
        </CardContent>
      </Card>
    );
  }

  if (!dados) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-slate-600 text-sm">Total de Itens</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{dados.totalItens}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-slate-600 text-sm">Valor Total</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">
                R$ {dados.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-slate-600 text-sm">Pendentes</p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">
                {dados.porStatus['Pendente'] || 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuição por Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={dados.statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, quantidade }) => `${name}: ${quantidade}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="quantidade"
              >
                {dados.statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CORES[index % CORES.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => value} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Projeto Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Valor por Projeto</CardTitle>
        </CardHeader>
        <CardContent>
          {dados.projetoData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dados.projetoData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip
                  formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                />
                <Legend />
                <Bar dataKey="valor" fill="#f59e0b" name="Valor (R$)" />
                <Bar dataKey="quantidade" fill="#3b82f6" name="Quantidade" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-slate-500 py-8">Nenhum dado disponível</p>
          )}
        </CardContent>
      </Card>

      {/* Status Badges */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo por Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(dados.porStatus).map(([status, quantidade]) => {
              const cores = {
                'Pendente': 'bg-yellow-100 text-yellow-800',
                'Confirmado': 'bg-blue-100 text-blue-800',
                'Conciliado': 'bg-green-100 text-green-800',
                'Rejeitado': 'bg-red-100 text-red-800'
              };

              return (
                <Badge
                  key={status}
                  className={`${cores[status] || 'bg-slate-100 text-slate-800'} px-4 py-2 text-base font-semibold`}
                >
                  {status}: {quantidade}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}