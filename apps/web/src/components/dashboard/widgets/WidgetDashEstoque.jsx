import React, { useEffect, useState, useMemo } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../../../Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  AlertTriangle,
  BookmarkCheck,
  ArrowUpCircle,
  RotateCcw,
  ClipboardList,
  CheckCircle,
  XCircle,
  Calendar,
  Filter,
} from "lucide-react";

export default function WidgetDashEstoque({ onDadosCarregados }) {
  const { empresaAtiva } = useEmpresa();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtroProjeto, setFiltroProjeto] = useState("todos");

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    load();
  }, [empresaAtiva?.id]);

  const load = async () => {
    try {
      const [materiais, reservas, movimentos, retiradas, retiradaItens, projetos] =
        await Promise.all([
          sigo.entities.Material.filter({ empresa_id: empresaAtiva.id }),
          sigo.entities.ReservaMaterial.filter({ empresa_id: empresaAtiva.id }),
          sigo.entities.EstoqueMovimento.filter({ empresa_id: empresaAtiva.id }),
          sigo.entities.RetiradaEstoque.filter({ empresa_id: empresaAtiva.id }),
          sigo.entities.RetiradaEstoqueItem.filter({ empresa_id: empresaAtiva.id }),
          sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        ]);

      // --- MATERIAIS ---
      const ativos = materiais.filter((m) => m.ativo !== false);
      const emBaixa = ativos.filter(
        (m) => (m.estoque || 0) <= (m.estoque_minimo || 0) && (m.estoque_minimo || 0) > 0
      );
      const semEstoque = ativos.filter((m) => (m.estoque || 0) <= 0);
      const valorTotal = ativos.reduce(
        (acc, m) => acc + (m.estoque || 0) * (m.preco_medio || m.preco || 0),
        0
      );

      // --- MOVIMENTOS DO MÊS ---
      const movMes = movimentos.filter((m) => {
        const d = new Date(m.created_date);
        return d >= inicioMes && d <= fimMes;
      });

      // Itens que movimentaram no mês (únicos)
      const itensMovimentados = [...new Set(movMes.map((m) => m.material_id).filter(Boolean))].map(
        (id) => {
          const mat = materiais.find((m) => m.id === id);
          const movItem = movMes.filter((m) => m.material_id === id);
          const entradas = movItem
            .filter((m) => m.tipo === "Entrada" || m.tipo === "entrada")
            .reduce((a, m) => a + (m.quantidade || 0), 0);
          const saidas = movItem
            .filter((m) => m.tipo === "Saída" || m.tipo === "saida")
            .reduce((a, m) => a + (m.quantidade || 0), 0);
          const devolucoes = movItem
            .filter(
              (m) =>
                m.tipo === "Devolução" ||
                m.tipo === "devolucao" ||
                m.motivo?.toLowerCase().includes("devol")
            )
            .reduce((a, m) => a + (m.quantidade || 0), 0);
          return {
            id,
            nome: mat?.nome || "Desconhecido",
            codigo: mat?.codigo || "",
            projeto_id: movItem[0]?.projeto_id || "",
            projeto_nome: movItem[0]?.projeto_nome || "",
            entradas,
            saidas,
            devolucoes,
            totalMov: entradas + saidas + devolucoes,
          };
        }
      );

      // Devoluções do mês
      const devolucoesMes = movMes.filter(
        (m) =>
          m.tipo === "Devolução" ||
          m.tipo === "devolucao" ||
          m.motivo?.toLowerCase().includes("devol")
      );
      const itensDevolvidos = [
        ...new Set(devolucoesMes.map((m) => m.material_id).filter(Boolean)),
      ].map((id) => {
        const mat = materiais.find((m) => m.id === id);
        const qty = devolucoesMes
          .filter((m) => m.material_id === id)
          .reduce((a, m) => a + (m.quantidade || 0), 0);
        return { nome: mat?.nome || "Desconhecido", qty };
      });

      // --- RESERVAS ATIVAS ---
      const reservasAtivas = reservas.filter((r) => r.status === "Ativa");

      // Reservas por projeto
      const reservasPorProjeto = {};
      reservasAtivas.forEach((r) => {
        const key = r.projeto_nome || r.caminhao_placa || "Sem vínculo";
        reservasPorProjeto[key] = (reservasPorProjeto[key] || 0) + 1;
      });

      // --- INVENTÁRIOS DO MÊS ---
      const inventarioHistoricoMes = movimentos.filter((m) => {
        const d = new Date(m.created_date);
        return (
          d >= inicioMes &&
          d <= fimMes &&
          (m.tipo === "Inventário" ||
            m.motivo?.toLowerCase().includes("inventário") ||
            m.motivo?.toLowerCase().includes("inventario"))
        );
      });

      // Semanas do mês
      const semanasDoMes = [];
      let dataIter = new Date(inicioMes);
      while (dataIter <= fimMes) {
        const fimSemana = new Date(dataIter);
        fimSemana.setDate(fimSemana.getDate() + 6);
        semanasDoMes.push({
          inicio: new Date(dataIter),
          fim: new Date(Math.min(fimSemana, fimMes)),
        });
        dataIter.setDate(dataIter.getDate() + 7);
      }

      const inventariosPorSemana = semanasDoMes.map((sem, i) => {
        const feito = inventarioHistoricoMes.some((m) => {
          const d = new Date(m.created_date);
          return d >= sem.inicio && d <= sem.fim;
        });
        return { semana: `Sem ${i + 1}`, feito };
      });

      // Inventário mensal (pelo menos um no mês)
      const inventarioMensalFeito = inventarioHistoricoMes.length > 0;

      // --- PEDIDOS DE MATERIAIS (RETIRADAS) ---
      const retiradaMes = retiradas.filter((r) => {
        const d = new Date(r.created_date);
        return d >= inicioMes && d <= fimMes;
      });

      const retiradaPendente = retiradaMes.filter(
        (r) => r.status !== "Concluída" && r.status !== "Concluido" && r.status !== "Cancelada"
      );
      const retiradaConcluida = retiradaMes.filter(
        (r) => r.status === "Concluída" || r.status === "Concluido"
      );
      const totalRetiradas = retiradaMes.length;

      const d = {
        totalAtivos: ativos.length,
        emBaixa: emBaixa.length,
        semEstoque: semEstoque.length,
        valorTotal,
        reservasAtivas: reservasAtivas.length,
        reservasPorProjeto,
        itensMovimentados,
        itensDevolvidos,
        devolucoesMes: devolucoesMes.length,
        inventariosPorSemana,
        inventarioMensalFeito,
        retiradaMes: totalRetiradas,
        retiradaConcluida: retiradaConcluida.length,
        retiradaPendente: retiradaPendente.length,
        projetos,
      };

      setData(d);
      onDadosCarregados?.(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
    }).format(v);

  const itensFiltrados = useMemo(() => {
    if (!data) return [];
    if (filtroProjeto === "todos") return data.itensMovimentados;
    return data.itensMovimentados.filter(
      (i) => i.projeto_id === filtroProjeto || i.projeto_nome?.includes(filtroProjeto)
    );
  }, [data, filtroProjeto]);

  if (loading) return <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />;
  if (!data) return null;

  const porcentagemPedidos =
    data.retiradaMes > 0 ? Math.round((data.retiradaConcluida / data.retiradaMes) * 100) : 100;

  return (
    <div className="space-y-4">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Itens Ativos</p>
                <p className="text-2xl font-bold text-blue-600">{data.totalAtivos}</p>
              </div>
              <Package className="w-8 h-8 text-blue-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{fmt(data.valorTotal)} em estoque</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Em Baixa</p>
                <p className="text-2xl font-bold text-yellow-600">{data.emBaixa}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{data.semEstoque} zerados</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Reservas Ativas</p>
                <p className="text-2xl font-bold text-purple-600">{data.reservasAtivas}</p>
              </div>
              <BookmarkCheck className="w-8 h-8 text-purple-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">&nbsp;</p>
          </CardContent>
        </Card>

        <Card
          className={`border-l-4 ${data.retiradaPendente > 0 ? "border-l-red-500" : "border-l-green-500"}`}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Pedidos do Mês</p>
                <p
                  className={`text-2xl font-bold ${data.retiradaPendente > 0 ? "text-red-600" : "text-green-600"}`}
                >
                  {porcentagemPedidos}%
                </p>
              </div>
              <ClipboardList
                className={`w-8 h-8 ${data.retiradaPendente > 0 ? "text-red-200" : "text-green-200"}`}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {data.retiradaConcluida}/{data.retiradaMes} concluídos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Itens Movimentados no Mês */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowUpCircle className="w-4 h-4 text-blue-500" />
              Itens Movimentados no Mês ({data.itensMovimentados.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="w-3 h-3 text-slate-400" />
              <Select value={filtroProjeto} onValueChange={setFiltroProjeto}>
                <SelectTrigger className="h-7 text-xs w-44">
                  <SelectValue placeholder="Filtrar por obra" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as obras</SelectItem>
                  {data.projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {itensFiltrados.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">
              Nenhum item movimentado no período
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              <div className="grid grid-cols-5 gap-1 text-xs text-slate-400 font-medium px-1 pb-1 border-b border-slate-100">
                <span className="col-span-2">Item</span>
                <span className="text-center text-green-600">Entradas</span>
                <span className="text-center text-red-600">Saídas</span>
                <span className="text-center text-blue-600">Devol.</span>
              </div>
              {itensFiltrados.map((item, i) => (
                <div
                  key={i}
                  className="grid grid-cols-5 gap-1 text-xs px-1 py-1 rounded hover:bg-slate-50"
                >
                  <div className="col-span-2">
                    <p className="font-medium text-slate-700 truncate">{item.nome}</p>
                    {item.projeto_nome && (
                      <p className="text-slate-400 truncate">{item.projeto_nome}</p>
                    )}
                  </div>
                  <span className="text-center text-green-600 font-medium">
                    {item.entradas || "-"}
                  </span>
                  <span className="text-center text-red-600 font-medium">{item.saidas || "-"}</span>
                  <span className="text-center text-blue-600 font-medium">
                    {item.devolucoes || "-"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linha: Devoluções + Reservas por Projeto */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Itens devolvidos ao estoque */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-blue-500" />
              Devoluções ao Estoque ({data.devolucoesMes})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {data.itensDevolvidos.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Nenhuma devolução no mês</p>
            ) : (
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {data.itensDevolvidos.map((item, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center p-1.5 bg-blue-50 rounded text-xs"
                  >
                    <span className="text-slate-700 truncate">{item.nome}</span>
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200 flex-shrink-0">
                      {item.qty} un
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reservas por projeto */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookmarkCheck className="w-4 h-4 text-purple-500" />
              Reservas Ativas por Obra
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {Object.keys(data.reservasPorProjeto).length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Nenhuma reserva ativa</p>
            ) : (
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {Object.entries(data.reservasPorProjeto).map(([nome, qty], i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center p-1.5 bg-purple-50 rounded text-xs"
                  >
                    <span className="text-slate-700 truncate">{nome}</span>
                    <Badge className="bg-purple-100 text-purple-700 border-purple-200 flex-shrink-0">
                      {qty} reserva{qty > 1 ? "s" : ""}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inventários + Pedidos de materiais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Inventários */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-orange-500" />
              Inventários do Mês
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {/* Mensal */}
            <div
              className={`flex justify-between items-center p-2 rounded ${data.inventarioMensalFeito ? "bg-green-50" : "bg-red-50"}`}
            >
              <div className="flex items-center gap-2">
                {data.inventarioMensalFeito ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span
                  className={`text-xs font-medium ${data.inventarioMensalFeito ? "text-green-700" : "text-red-700"}`}
                >
                  Inventário Mensal
                </span>
              </div>
              <Badge
                className={
                  data.inventarioMensalFeito
                    ? "bg-green-100 text-green-700 border-green-200"
                    : "bg-red-100 text-red-700 border-red-200"
                }
              >
                {data.inventarioMensalFeito ? "Realizado" : "Pendente"}
              </Badge>
            </div>

            {/* Por semana */}
            <p className="text-xs text-slate-500 font-medium pt-1">Inventários Semanais:</p>
            <div className="grid grid-cols-2 gap-1">
              {data.inventariosPorSemana.map((sem, i) => (
                <div
                  key={i}
                  className={`flex justify-between items-center p-1.5 rounded text-xs ${sem.feito ? "bg-green-50" : "bg-red-50"}`}
                >
                  <span className={sem.feito ? "text-green-700" : "text-red-700"}>
                    {sem.semana}
                  </span>
                  {sem.feito ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pedidos de materiais (retiradas) */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-500" />
              Pedidos de Materiais no Mês
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            <div className="flex justify-between items-center p-2 bg-green-50 rounded">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-xs font-medium text-green-700">Saída dada (Concluídos)</span>
              </div>
              <Badge className="bg-green-100 text-green-700 border-green-200">
                {data.retiradaConcluida}
              </Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-50 rounded">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-xs font-medium text-red-700">Sem saída (Pendentes)</span>
              </div>
              <Badge className="bg-red-100 text-red-700 border-red-200">
                {data.retiradaPendente}
              </Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
              <span className="text-xs font-medium text-slate-600">Total de pedidos</span>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                {data.retiradaMes}
              </Badge>
            </div>
            {/* Barra de progresso */}
            <div className="mt-2">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Atendimento</span>
                <span className="font-medium">{porcentagemPedidos}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${porcentagemPedidos === 100 ? "bg-green-500" : porcentagemPedidos >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${porcentagemPedidos}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
