import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SolicitacaoCompraModal from "./SolicitacaoCompraModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AlertCircle, Clock, ShoppingCart, Calendar } from "lucide-react";

export default function PrevisaoDemanda({
  ferramentas = [],
  movimentacoes = [],
  empresaAtiva,
  user,
  fornecedores = [],
}) {
  const [filtroLocalizacao, setFiltroLocalizacao] = useState("");
  const [ordenarPor, setOrdenarPor] = useState("urgencia"); // urgencia, quantidade, prazo
  const [abrirSolicitacao, setAbrirSolicitacao] = useState(false);

  // Extrair localizações únicas
  const localizacoes = useMemo(() => {
    return [...new Set(ferramentas.map((f) => f.localizacao).filter(Boolean))];
  }, [ferramentas]);

  // Calcular previsão de demanda
  const previsoes = useMemo(() => {
    const resultado = ferramentas
      .filter((f) => !filtroLocalizacao || f.localizacao === filtroLocalizacao)
      .map((ferramenta) => {
        // Pegar movimentações do últimos 90 dias
        const agora = new Date();
        const data90DiasAtras = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);

        const movs = movimentacoes.filter((m) => {
          const dataMov = new Date(m.created_date || m.data_movimentacao);
          return m.ferramenta_id === ferramenta.id && dataMov >= data90DiasAtras;
        });

        // Calcular taxa de consumo (média por dia)
        const diasPassados = Math.max(
          1,
          Math.floor((agora - data90DiasAtras) / (1000 * 60 * 60 * 24))
        );
        const totalMovimentado = movs.reduce((sum, m) => sum + (m.quantidade || 0), 0);
        const taxaDiaria = totalMovimentado / diasPassados;

        // Prever quando o estoque acaba
        const estoque = ferramenta.quantidade_estoque || 0;
        const diasAteMorrer = taxaDiaria > 0 ? Math.floor(estoque / taxaDiaria) : 999;

        // Recomendação de quantidade (consumo de 30 dias)
        const consumo30Dias = Math.ceil(taxaDiaria * 30);
        const quantidadeRecomendada = Math.max(consumo30Dias * 2, 1); // 2 meses de consumo

        // Urgência (quanto menor, mais urgente)
        let nivelUrgencia = "baixo";
        let urgenciaScore = 100;

        if (diasAteMorrer < 7) {
          nivelUrgencia = "crítico";
          urgenciaScore = 1;
        } else if (diasAteMorrer < 15) {
          nivelUrgencia = "alto";
          urgenciaScore = 2;
        } else if (diasAteMorrer < 30) {
          nivelUrgencia = "médio";
          urgenciaScore = 3;
        } else {
          nivelUrgencia = "baixo";
          urgenciaScore = 4;
        }

        // Histórico para gráfico (últimos 30 dias)
        const historicoEstoque = [];
        for (let i = 30; i >= 0; i--) {
          const data = new Date(agora.getTime() - i * 24 * 60 * 60 * 1000);
          const movsAteData = movimentacoes.filter((m) => {
            const dataMov = new Date(m.created_date || m.data_movimentacao);
            return m.ferramenta_id === ferramenta.id && dataMov <= data;
          });
          const totalMovAteData = movsAteData.reduce((sum, m) => sum + (m.quantidade || 0), 0);
          const estoqueNoMomento = estoque + totalMovAteData; // + porque movimentação é saída

          historicoEstoque.push({
            data: `${data.getDate()}/${data.getMonth() + 1}`,
            estoque: Math.max(0, estoqueNoMomento),
          });
        }

        return {
          id: ferramenta.id,
          codigo: ferramenta.codigo,
          descricao: ferramenta.descricao,
          localizacao: ferramenta.localizacao,
          status: ferramenta.status,
          estoqueAtual: estoque,
          taxaDiaria: taxaDiaria.toFixed(2),
          diasAteMorrer,
          quantidadeRecomendada,
          consumo30Dias,
          nivelUrgencia,
          urgenciaScore,
          historicoEstoque,
          movimentacoes90Dias: movs.length,
        };
      });

    // Ordenar
    return resultado.sort((a, b) => {
      if (ordenarPor === "urgencia") return a.urgenciaScore - b.urgenciaScore;
      if (ordenarPor === "quantidade") return b.quantidadeRecomendada - a.quantidadeRecomendada;
      if (ordenarPor === "prazo") return a.diasAteMorrer - b.diasAteMorrer;
      return 0;
    });
  }, [ferramentas, movimentacoes, filtroLocalizacao, ordenarPor]);

  // Resumos
  const resumos = useMemo(() => {
    const criticas = previsoes.filter((p) => p.nivelUrgencia === "crítico").length;
    const altos = previsoes.filter((p) => p.nivelUrgencia === "alto").length;
    const investimentoTotal = previsoes.reduce(
      (sum, p) =>
        sum +
        p.quantidadeRecomendada *
          (p.estoqueAtual > 0 ? ferramentas.find((f) => f.id === p.id)?.valor_unitario || 0 : 0),
      0
    );

    return { criticas, altos, investimentoTotal };
  }, [previsoes, ferramentas]);

  const getBadgeClass = (nivelUrgencia) => {
    switch (nivelUrgencia) {
      case "crítico":
        return "bg-red-100 text-red-800";
      case "alto":
        return "bg-orange-100 text-orange-800";
      case "médio":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-green-100 text-green-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros e Ordenação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-700">Localização</label>
              <Select
                value={filtroLocalizacao || "__all__"}
                onValueChange={(v) => setFiltroLocalizacao(v === "__all__" ? null : v)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {localizacoes.map((local) => (
                    <SelectItem key={local} value={local}>
                      {local}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Ordenar por</label>
              <Select value={ordenarPor} onValueChange={setOrdenarPor}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgencia">Urgência (mais crítico)</SelectItem>
                  <SelectItem value="quantidade">Quantidade (maior)</SelectItem>
                  <SelectItem value="prazo">Prazo (menor)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo Executivo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Reposições Críticas</p>
                <p className="text-3xl font-bold text-red-600">{resumos.criticas}</p>
              </div>
              <AlertCircle className="w-10 h-10 text-red-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Reposições Altas</p>
                <p className="text-3xl font-bold text-orange-600">{resumos.altos}</p>
              </div>
              <Clock className="w-10 h-10 text-orange-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Investimento Total</p>
                <p className="text-2xl font-bold text-slate-800">
                  R$ {(resumos.investimentoTotal / 1000).toFixed(1)}k
                </p>
              </div>
              <ShoppingCart className="w-10 h-10 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas Críticos */}
      {previsoes.some((p) => p.nivelUrgencia === "crítico") && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-lg text-red-800">⚠️ Itens para Reposição Imediata</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {previsoes
                .filter((p) => p.nivelUrgencia === "crítico")
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-200"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">
                        {p.codigo} - {p.descricao}
                      </p>
                      <p className="text-xs text-slate-600">
                        Estoque: {p.estoqueAtual} | Taxa: {p.taxaDiaria} un/dia | Dias:{" "}
                        {p.diasAteMorrer}
                      </p>
                    </div>
                    <Badge className="bg-red-600 text-white">CRÍTICO</Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela de Recomendações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recomendações de Compra</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-center">Estoque</TableHead>
                  <TableHead className="text-center">Taxa/Dia</TableHead>
                  <TableHead className="text-center">Dias até 0</TableHead>
                  <TableHead className="text-center">Qtd. Compra</TableHead>
                  <TableHead>Urgência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previsoes.slice(0, 25).map((item) => (
                  <TableRow key={item.id} className="hover:bg-slate-50">
                    <TableCell className="font-mono text-sm font-semibold">{item.codigo}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{item.descricao}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{item.estoqueAtual}</Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">{item.taxaDiaria}</TableCell>
                    <TableCell className="text-center font-semibold">
                      {item.diasAteMorrer === 999 ? "∞" : item.diasAteMorrer}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-blue-100 text-blue-800 font-bold">
                        {item.quantidadeRecomendada}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getBadgeClass(item.nivelUrgencia)}>
                        {item.nivelUrgencia}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {previsoes.length > 25 && (
            <p className="text-xs text-slate-500 mt-2">Exibindo 25 de {previsoes.length} itens</p>
          )}
        </CardContent>
      </Card>

      {/* Gráficos de Tendência (Top 5) */}
      {previsoes.slice(0, 5).length > 0 && (
        <div className="grid grid-cols-1 gap-6">
          {previsoes.slice(0, 5).map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {item.codigo} - {item.descricao}
                    </CardTitle>
                    <p className="text-xs text-slate-600 mt-1">
                      Últimos 30 dias | Taxa: {item.taxaDiaria} un/dia
                    </p>
                  </div>
                  <Badge className={getBadgeClass(item.nivelUrgencia)}>{item.nivelUrgencia}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={item.historicoEstoque}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="data" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="estoque"
                      stroke="#f59e0b"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-4 gap-2 mt-4 text-center">
                  <div>
                    <p className="text-xs text-slate-600">Estoque Atual</p>
                    <p className="font-bold text-slate-800">{item.estoqueAtual}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Taxa/Dia</p>
                    <p className="font-bold text-slate-800">{item.taxaDiaria}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Dias até 0</p>
                    <p className="font-bold text-slate-800">{item.diasAteMorrer}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Comprar</p>
                    <p className="font-bold text-green-600">{item.quantidadeRecomendada}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* CTA de Ação */}
      {previsoes.some((p) => p.nivelUrgencia === "crítico" || p.nivelUrgencia === "alto") && (
        <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="w-6 h-6 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-900">Ações Recomendadas</p>
                  <p className="text-sm text-amber-700">
                    {resumos.criticas} item(ns) crítico(s) e {resumos.altos} item(ns) com urgência
                    alta
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setAbrirSolicitacao(true)}
                className="bg-amber-600 hover:bg-amber-700 gap-2"
              >
                <ShoppingCart className="w-4 h-4" />
                Criar Solicitação de Compra
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal de Solicitação de Compra */}
      <SolicitacaoCompraModal
        open={abrirSolicitacao}
        onOpenChange={setAbrirSolicitacao}
        itensPrevisao={previsoes}
        fornecedores={fornecedores}
        empresaAtiva={empresaAtiva}
        user={user}
      />
    </div>
  );
}
