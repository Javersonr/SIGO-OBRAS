import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  GraduationCap,
  HardHat,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export default function RelatorioSeguranca({ empresaId }) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState({ funcionarios: [], treinamentos: [], epis: [] });

  useEffect(() => {
    if (empresaId) loadData();
  }, [empresaId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [funcs, treins, episList] = await Promise.all([
        sigo.entities.Funcionario.filter({ empresa_id: empresaId, ativo: true }),
        sigo.entities.Treinamento.filter({ empresa_id: empresaId, ativo: true }),
        sigo.entities.EPI.filter({ empresa_id: empresaId, ativo: true }),
      ]);
      setDados({ funcionarios: funcs, treinamentos: treins, epis: episList });
    } catch (error) {
      console.error("Erro ao carregar dados de segurança:", error);
    } finally {
      setLoading(false);
    }
  };

  const hoje = new Date();
  const em30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

  // ASO vencidos ou a vencer
  const asoVencidos = dados.funcionarios.filter(
    (f) => f.aso_vencimento && new Date(f.aso_vencimento) < hoje
  );
  const asoAVencer = dados.funcionarios.filter(
    (f) =>
      f.aso_vencimento &&
      new Date(f.aso_vencimento) >= hoje &&
      new Date(f.aso_vencimento) <= em30dias
  );
  const asoOk = dados.funcionarios.filter(
    (f) => f.aso_vencimento && new Date(f.aso_vencimento) > em30dias
  );
  const asoSemData = dados.funcionarios.filter((f) => !f.aso_vencimento);

  // Treinamentos por validade
  const treinsVencidos = dados.treinamentos.filter(
    (t) =>
      t.data_fim &&
      (() => {
        const valMeses = t.validade_meses || 12;
        const fim = new Date(t.data_fim);
        fim.setMonth(fim.getMonth() + valMeses);
        return fim < hoje;
      })()
  );
  const treinsAVencer = dados.treinamentos.filter(
    (t) =>
      t.data_fim &&
      (() => {
        const valMeses = t.validade_meses || 12;
        const fim = new Date(t.data_fim);
        fim.setMonth(fim.getMonth() + valMeses);
        return fim >= hoje && fim <= em30dias;
      })()
  );

  // Por função
  const porFuncao = dados.funcionarios.reduce((acc, f) => {
    const fn = f.funcao_nome || "Sem função";
    acc[fn] = (acc[fn] || 0) + 1;
    return acc;
  }, {});
  const dataFuncao = Object.entries(porFuncao).map(([name, value]) => ({ name, value }));

  // Treinamentos por nome (mais comuns)
  const porTreinamento = dados.treinamentos.reduce((acc, t) => {
    acc[t.nome] = (acc[t.nome] || 0) + 1;
    return acc;
  }, {});
  const dataTreinamentos = Object.entries(porTreinamento)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({
      name: name.length > 20 ? name.substring(0, 20) + "..." : name,
      value,
    }));

  const COLORS = ["#10b981", "#f59e0b", "#ef4444", "#94a3b8"];
  const asoData = [
    { name: "Em dia", value: asoOk.length },
    { name: "A vencer", value: asoAVencer.length },
    { name: "Vencido", value: asoVencidos.length },
    { name: "Sem ASO", value: asoSemData.length },
  ].filter((d) => d.value > 0);

  if (loading)
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Cards Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{dados.funcionarios.length}</p>
              <p className="text-xs text-slate-500">Funcionários Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{dados.treinamentos.length}</p>
              <p className="text-xs text-slate-500">Treinamentos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <HardHat className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{dados.epis.length}</p>
              <p className="text-xs text-slate-500">EPIs Cadastrados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">
                {asoVencidos.length + asoAVencer.length}
              </p>
              <p className="text-xs text-slate-500">ASOs Críticos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status dos ASOs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Status dos ASOs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="w-40 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={asoData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={60}
                      dataKey="value"
                    >
                      {asoData.map((entry, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-slate-600">Em dia:</span>
                  <Badge className="bg-green-100 text-green-700 ml-auto">{asoOk.length}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-slate-600">A vencer (30d):</span>
                  <Badge className="bg-amber-100 text-amber-700 ml-auto">{asoAVencer.length}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-slate-600">Vencido:</span>
                  <Badge className="bg-red-100 text-red-700 ml-auto">{asoVencidos.length}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-600">Sem ASO:</span>
                  <Badge variant="secondary" className="ml-auto">
                    {asoSemData.length}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Treinamentos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4" /> Treinamentos Mais Frequentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dataTreinamentos.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dataTreinamentos} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-400 text-sm text-center py-8">
                Nenhum treinamento cadastrado
              </p>
            )}
          </CardContent>
        </Card>

        {/* Funcionários por Função */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Funcionários por Função
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dataFuncao.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dataFuncao}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-400 text-sm text-center py-8">
                Nenhum funcionário cadastrado
              </p>
            )}
          </CardContent>
        </Card>

        {/* Alertas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Alertas de Segurança
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {asoVencidos.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-700">ASOs Vencidos</p>
                <div className="mt-2 space-y-1">
                  {asoVencidos.slice(0, 4).map((f) => (
                    <div key={f.id} className="flex justify-between text-xs text-red-600">
                      <span>{f.nome_completo}</span>
                      <span>
                        {f.aso_vencimento
                          ? new Date(f.aso_vencimento).toLocaleDateString("pt-BR")
                          : "-"}
                      </span>
                    </div>
                  ))}
                  {asoVencidos.length > 4 && (
                    <p className="text-xs text-red-500">+{asoVencidos.length - 4} mais</p>
                  )}
                </div>
              </div>
            )}
            {asoAVencer.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-700">ASOs a Vencer em 30 dias</p>
                <div className="mt-2 space-y-1">
                  {asoAVencer.slice(0, 4).map((f) => (
                    <div key={f.id} className="flex justify-between text-xs text-amber-600">
                      <span>{f.nome_completo}</span>
                      <span>
                        {f.aso_vencimento
                          ? new Date(f.aso_vencimento).toLocaleDateString("pt-BR")
                          : "-"}
                      </span>
                    </div>
                  ))}
                  {asoAVencer.length > 4 && (
                    <p className="text-xs text-amber-500">+{asoAVencer.length - 4} mais</p>
                  )}
                </div>
              </div>
            )}
            {treinsVencidos.length > 0 && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm font-medium text-orange-700">
                  Treinamentos Vencidos: {treinsVencidos.length}
                </p>
              </div>
            )}
            {asoVencidos.length === 0 && asoAVencer.length === 0 && treinsVencidos.length === 0 && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-1" />
                <p className="text-sm text-green-700">Tudo em dia!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
