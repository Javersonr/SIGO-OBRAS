import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, TrendingUp, TrendingDown, FileText, CheckCircle, Clock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DashboardConsolidado({ grupoId, user }) {
  const [empresas, setEmpresas] = useState([]);
  const [vencimentos, setVencimentos] = useState([]);
  const [transacoes, setTransacoes] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [empresaSelecionada, setEmpresaSelecionada] = useState("todas");

  useEffect(() => {
    carregarDadosConsolidados();
  }, [grupoId]);

  const carregarDadosConsolidados = async () => {
    try {
      setLoading(true);

      // Carregar empresas do grupo
      const empresasGrupo = await sigo.asServiceRole.entities.Empresa.filter({
        grupo_id: grupoId,
        ativo: true,
      });
      setEmpresas(empresasGrupo);

      const empresaIds = empresasGrupo.map((e) => e.id);

      // Carregar todos os dados em paralelo
      const [vencimentosData, transacoesData, pedidosData, documentosData] = await Promise.all([
        sigo.asServiceRole.entities.Vencimento.filter({ empresa_id: { $in: empresaIds } }),
        sigo.asServiceRole.entities.TransacaoFinanceira.filter({
          empresa_id: { $in: empresaIds },
        }),
        sigo.asServiceRole.entities.PedidoCompra.filter({ empresa_id: { $in: empresaIds } }),
        sigo.asServiceRole.entities.DocumentoEmpresa.filter({ empresa_id: { $in: empresaIds } }),
      ]);

      setVencimentos(vencimentosData);
      setTransacoes(transacoesData);
      setPedidos(pedidosData);
      setDocumentos(documentosData);
    } catch (error) {
      console.error("Erro ao carregar dados consolidados:", error);
    } finally {
      setLoading(false);
    }
  };

  const filtrarPorEmpresa = (dados) => {
    if (empresaSelecionada === "todas") return dados;
    return dados.filter((d) => d.empresa_id === empresaSelecionada);
  };

  const calcularKPIs = () => {
    const dadosFiltrados = {
      vencimentos: filtrarPorEmpresa(vencimentos),
      transacoes: filtrarPorEmpresa(transacoes),
      pedidos: filtrarPorEmpresa(pedidos),
    };

    const vencidosRecentes = dadosFiltrados.vencimentos.filter((v) => {
      const dataVenc = new Date(v.data_vencimento);
      const hoje = new Date();
      return dataVenc <= hoje && v.status === "Vencido";
    }).length;

    const aVencer = dadosFiltrados.vencimentos.filter((v) => {
      const dataVenc = new Date(v.data_vencimento);
      const hoje = new Date();
      const dias30 = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
      return dataVenc > hoje && dataVenc <= dias30 && v.status !== "Vencido";
    }).length;

    const receitas = dadosFiltrados.transacoes
      .filter((t) => t.tipo === "Receita")
      .reduce((sum, t) => sum + (t.valor || 0), 0);

    const despesas = dadosFiltrados.transacoes
      .filter((t) => t.tipo === "Despesa")
      .reduce((sum, t) => sum + (t.valor || 0), 0);

    const pedidosPendentes = dadosFiltrados.pedidos.filter(
      (p) => p.status && (p.status.includes("Pendente") || p.status.includes("Processando"))
    ).length;

    return { vencidosRecentes, aVencer, receitas, despesas, pedidosPendentes };
  };

  const kpis = calcularKPIs();
  const dadosFiltrados = {
    vencimentos: filtrarPorEmpresa(vencimentos),
    documentos: filtrarPorEmpresa(documentos),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Carregando dados consolidados...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Seletor de Empresa */}
      <div className="bg-white p-4 rounded-lg border border-slate-200">
        <label className="text-sm font-medium text-slate-700 block mb-2">
          Visualizar dados de:
        </label>
        <Select value={empresaSelecionada} onValueChange={setEmpresaSelecionada}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as empresas (Consolidado)</SelectItem>
            {empresas.map((emp) => (
              <SelectItem key={emp.id} value={emp.id}>
                {emp.razao_social || emp.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Vencidos</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{kpis.vencidosRecentes}</p>
              </div>
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">A Vencer (30d)</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{kpis.aVencer}</p>
              </div>
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Receitas</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {(kpis.receitas / 1000).toFixed(1)}K
                </p>
              </div>
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Despesas</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  {(kpis.despesas / 1000).toFixed(1)}K
                </p>
              </div>
              <TrendingDown className="w-5 h-5 text-slate-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Pedidos Pendentes</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{kpis.pedidosPendentes}</p>
              </div>
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs com Detalhes */}
      <Tabs defaultValue="vencimentos" className="w-full">
        <TabsList>
          <TabsTrigger value="vencimentos">Vencimentos</TabsTrigger>
          <TabsTrigger value="documentos">Documentação</TabsTrigger>
        </TabsList>

        <TabsContent value="vencimentos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Vencimentos por Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Vencidos */}
                {dadosFiltrados.vencimentos
                  .filter((v) => v.status === "Vencido")
                  .slice(0, 5)
                  .map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{v.titulo}</p>
                        <p className="text-xs text-slate-500">
                          {empresas.find((e) => e.id === v.empresa_id)?.razao_social ||
                            v.empresa_nome}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-red-600">
                          {new Date(v.data_vencimento).toLocaleDateString("pt-BR")}
                        </p>
                        <Badge className="bg-red-600 text-white mt-1">Vencido</Badge>
                      </div>
                    </div>
                  ))}

                {/* A Vencer */}
                {dadosFiltrados.vencimentos
                  .filter((v) => {
                    const dataVenc = new Date(v.data_vencimento);
                    const hoje = new Date();
                    const dias30 = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
                    return dataVenc > hoje && dataVenc <= dias30;
                  })
                  .slice(0, 5)
                  .map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{v.titulo}</p>
                        <p className="text-xs text-slate-500">
                          {empresas.find((e) => e.id === v.empresa_id)?.razao_social ||
                            v.empresa_nome}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-orange-600">
                          {new Date(v.data_vencimento).toLocaleDateString("pt-BR")}
                        </p>
                        <Badge className="bg-orange-600 text-white mt-1">A Vencer</Badge>
                      </div>
                    </div>
                  ))}

                {dadosFiltrados.vencimentos.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    Nenhum vencimento cadastrado
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Documentação de Segurança</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {dadosFiltrados.documentos.slice(0, 10).map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-slate-800">{doc.tipo}</p>
                      <p className="text-xs text-slate-500">
                        {empresas.find((e) => e.id === doc.empresa_id)?.razao_social}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-xs text-slate-600">Documentado</span>
                    </div>
                  </div>
                ))}

                {dadosFiltrados.documentos.length === 0 && (
                  <div className="text-center py-8 text-slate-500">Nenhum documento cadastrado</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
