import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../../../Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Wrench,
  Truck,
  User,
  Hammer,
  AlertTriangle,
  FileText,
  FileWarning,
  CheckCircle,
  XCircle,
  TrendingUp,
  ClipboardList,
} from "lucide-react";
import AlertasConformidadeFerramental from "../../ferramental/AlertasConformidadeFerramental";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];

export default function WidgetDashFerramental({ onDadosCarregados }) {
  const { empresaAtiva } = useEmpresa();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    load();
  }, [empresaAtiva?.id]);

  const load = async () => {
    try {
      const hoje = new Date();
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const em30Dias = new Date();
      em30Dias.setDate(em30Dias.getDate() + 30);
      const em7Dias = new Date();
      em7Dias.setDate(em7Dias.getDate() + 7);

      const [ferramentas, movimentacoes, laudos] = await Promise.all([
        sigo.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.MovimentacaoFerramenta.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.LaudoFerramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ]);

      // --- STATUS ---
      const disponivel = ferramentas.filter((f) => f.status === "Disponível").length;
      const emUso = ferramentas.filter((f) => f.status === "Em Uso").length;
      const emManutencao = ferramentas.filter((f) => f.status === "Em Manutenção").length;
      const danificado = ferramentas.filter((f) => f.status === "Danificado").length;
      const sucata = ferramentas.filter((f) => f.status === "Sucata").length;
      const noCaminhao = ferramentas.filter(
        (f) => f.localizacao?.toLowerCase().includes("caminhão") || f.campo_obrigatorio_id
      ).length;
      const comFuncionario = ferramentas.filter(
        (f) => f.status === "Em Uso" && f.funcionario_id
      ).length;

      const manutencaoProxima = ferramentas.filter((f) => {
        if (!f.proxima_manutencao) return false;
        const d = new Date(f.proxima_manutencao);
        return d >= hoje && d <= em7Dias;
      }).length;
      const manutencaoVencida = ferramentas.filter((f) => {
        if (!f.proxima_manutencao) return false;
        return new Date(f.proxima_manutencao) < hoje;
      }).length;

      const porStatus = [
        { name: "Disponível", value: disponivel },
        { name: "Em Uso", value: emUso },
        { name: "Manutenção", value: emManutencao },
        { name: "Danificado", value: danificado },
        { name: "Sucata", value: sucata },
      ].filter((s) => s.value > 0);

      // --- ITENS MAIS SAÍDOS NO MÊS (Entregas para Funcionário no mês) ---
      const movMes = movimentacoes.filter((m) => {
        const d = new Date(m.created_date);
        return (
          d >= inicioMes &&
          d <= hoje &&
          (m.tipo_movimentacao === "Entrega para Funcionário" ||
            m.tipo_movimentacao === "Empréstimo")
        );
      });

      const saidasPorItem = {};
      movMes.forEach((m) => {
        const key = m.ferramenta_descricao || m.ferramenta_codigo || m.ferramenta_id;
        if (!key) return;
        saidasPorItem[key] = (saidasPorItem[key] || 0) + (m.quantidade || 1);
      });
      const topSaidas = Object.entries(saidasPorItem)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, value]) => ({
          name: name.length > 25 ? name.substring(0, 25) + "…" : name,
          value,
        }));

      // Movimentações do mês com/sem lista assinada
      const movComLista = movMes.filter((m) => m.numero_laudo).length; // usando numero_laudo como campo de referência de lista
      const movSemLista = movMes.length - movComLista;

      // --- LAUDOS ---
      // Ferramentas que TÊM campo numero_laudo preenchido (precisam de laudo)
      const ferramentasComLaudo = ferramentas.filter(
        (f) => f.numero_laudo || f.data_vencimento_laudo
      );
      const laudoVencido = ferramentasComLaudo.filter(
        (f) => f.data_vencimento_laudo && new Date(f.data_vencimento_laudo) < hoje
      );
      const laudoVencendo30 = ferramentasComLaudo.filter((f) => {
        if (!f.data_vencimento_laudo) return false;
        const d = new Date(f.data_vencimento_laudo);
        return d >= hoje && d <= em30Dias;
      });
      // Ferramentas que precisam de laudo mas não têm arquivo anexado
      const semArquivoLaudo = ferramentasComLaudo.filter((f) => !f.laudo_url);

      // Laudos da entidade LaudoFerramenta
      const laudosVencidos = laudos.filter(
        (l) => l.data_vencimento && new Date(l.data_vencimento) < hoje
      ).length;
      const laudosVencendo = laudos.filter((l) => {
        if (!l.data_vencimento) return false;
        const d = new Date(l.data_vencimento);
        return d >= hoje && d <= em30Dias;
      }).length;
      // Laudos sem arquivo de documento
      const laudosSemDoc = laudos.filter((l) => !l.foto_laudo_url).length;

      // --- EPI: Lista assinada ---
      // Movimentações de EPI (ferramentas tipo EPI) com/sem lista
      const ferramentasEPI = ferramentas.filter((f) => f.tipo === "EPI");
      const movEPIMes = movimentacoes.filter((m) => {
        const d = new Date(m.created_date);
        return d >= inicioMes && d <= hoje;
      });
      // Verificar quantas movimentações do mês têm observações (proxy para lista assinada)
      const movComObservacao = movEPIMes.filter(
        (m) => m.observacoes && m.observacoes.length > 0
      ).length;

      const d = {
        total: ferramentas.length,
        disponivel,
        emUso,
        emManutencao,
        danificado,
        noCaminhao,
        comFuncionario,
        manutencaoProxima,
        manutencaoVencida,
        porStatus,
        topSaidas,
        totalSaidasMes: movMes.length,
        // Laudos
        ferramentasComLaudo: ferramentasComLaudo.length,
        laudoVencido: laudoVencido.length,
        laudoVencendo30: laudoVencendo30.length,
        semArquivoLaudo: semArquivoLaudo.length,
        laudosVencidos,
        laudosVencendo,
        laudosSemDoc,
        // Listas assinadas
        totalMovMes: movMes.length,
        movComLista,
        movSemLista,
        epiTotal: ferramentasEPI.length,
      };

      setData(d);
      onDadosCarregados?.(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Disponíveis</p>
                <p className="text-2xl font-bold text-green-600">{data.disponivel}</p>
              </div>
              <Wrench className="w-8 h-8 text-green-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">de {data.total} total</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Nos Caminhões</p>
                <p className="text-2xl font-bold text-blue-600">{data.noCaminhao}</p>
              </div>
              <Truck className="w-8 h-8 text-blue-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">&nbsp;</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">c/ Funcionário</p>
                <p className="text-2xl font-bold text-purple-600">{data.comFuncionario}</p>
              </div>
              <User className="w-8 h-8 text-purple-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">&nbsp;</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Manutenção</p>
                <p className="text-2xl font-bold text-yellow-600">{data.emManutencao}</p>
              </div>
              <Hammer className="w-8 h-8 text-yellow-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{data.manutencaoVencida} vencidas</p>
          </CardContent>
        </Card>
      </div>

      {/* Itens mais saídos no mês + Distribuição por Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              Mais Saídas no Mês ({data.totalSaidasMes} movimentações)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {data.topSaidas.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Nenhuma saída no mês</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.topSaidas} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" name="Saídas" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-sm">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={data.porStatus}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                  fontSize={9}
                >
                  {data.porStatus.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Laudos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-orange-500" />
              Situação dos Laudos
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            <div className="flex justify-between items-center p-2 bg-red-50 rounded">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-xs font-medium text-red-700">Laudos Vencidos</span>
              </div>
              <Badge className="bg-red-100 text-red-700 border-red-200">
                {data.laudoVencido + data.laudosVencidos}
              </Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-yellow-50 rounded">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                <span className="text-xs font-medium text-yellow-700">Vencem em 30 dias</span>
              </div>
              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                {data.laudoVencendo30 + data.laudosVencendo}
              </Badge>
            </div>
            <div
              className={`flex justify-between items-center p-2 rounded ${data.semArquivoLaudo + data.laudosSemDoc > 0 ? "bg-orange-50" : "bg-green-50"}`}
            >
              <div className="flex items-center gap-2">
                {data.semArquivoLaudo + data.laudosSemDoc > 0 ? (
                  <FileWarning className="w-4 h-4 text-orange-500" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                <span
                  className={`text-xs font-medium ${data.semArquivoLaudo + data.laudosSemDoc > 0 ? "text-orange-700" : "text-green-700"}`}
                >
                  Sem arquivo anexado
                </span>
              </div>
              <Badge
                className={
                  data.semArquivoLaudo + data.laudosSemDoc > 0
                    ? "bg-orange-100 text-orange-700 border-orange-200"
                    : "bg-green-100 text-green-700 border-green-200"
                }
              >
                {data.semArquivoLaudo + data.laudosSemDoc}
              </Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
              <span className="text-xs text-slate-600 font-medium">Total c/ laudo obrigatório</span>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                {data.ferramentasComLaudo}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Listas assinadas */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-500" />
              Listas de Entrega no Mês
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
              <span className="text-xs font-medium text-blue-700">Total de entregas</span>
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                {data.totalMovMes}
              </Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-green-50 rounded">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-xs font-medium text-green-700">Lista c/ referência</span>
              </div>
              <Badge className="bg-green-100 text-green-700 border-green-200">
                {data.movComLista}
              </Badge>
            </div>
            <div
              className={`flex justify-between items-center p-2 rounded ${data.movSemLista > 0 ? "bg-yellow-50" : "bg-green-50"}`}
            >
              <div className="flex items-center gap-2">
                {data.movSemLista > 0 ? (
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                <span
                  className={`text-xs font-medium ${data.movSemLista > 0 ? "text-yellow-700" : "text-green-700"}`}
                >
                  Sem referência de lista
                </span>
              </div>
              <Badge
                className={
                  data.movSemLista > 0
                    ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                    : "bg-green-100 text-green-700 border-green-200"
                }
              >
                {data.movSemLista}
              </Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
              <span className="text-xs text-slate-600 font-medium">EPIs cadastrados</span>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                {data.epiTotal}
              </Badge>
            </div>

            {/* Barra de progresso */}
            {data.totalMovMes > 0 && (
              <div className="mt-1">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Com referência</span>
                  <span className="font-medium">
                    {Math.round((data.movComLista / data.totalMovMes) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-green-500 transition-all"
                    style={{ width: `${Math.round((data.movComLista / data.totalMovMes) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alertas de Manutenção */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">Alertas de Manutenção</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center p-2 bg-red-50 rounded text-center">
            <XCircle className="w-5 h-5 text-red-500 mb-1" />
            <span className="text-xl font-bold text-red-600">{data.manutencaoVencida}</span>
            <span className="text-xs text-red-700">Vencida</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-yellow-50 rounded text-center">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mb-1" />
            <span className="text-xl font-bold text-yellow-600">{data.manutencaoProxima}</span>
            <span className="text-xs text-yellow-700">Vence 7d</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-red-50 rounded text-center">
            <Hammer className="w-5 h-5 text-red-400 mb-1" />
            <span className="text-xl font-bold text-red-600">{data.danificado}</span>
            <span className="text-xs text-red-700">Danificados</span>
          </div>
        </CardContent>
      </Card>

      {/* Alertas de Conformidade */}
      <AlertasConformidadeFerramental empresaAtiva={empresaAtiva} />
    </div>
  );
}
