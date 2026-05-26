import React, { useState, useEffect, useMemo, useCallback } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  Search,
  Calendar,
  TrendingUp,
  TrendingDown,
  Clock,
  XCircle,
  Eye,
  Award,
  Users,
} from "lucide-react";

export default function HistoricoTab({ empresaAtiva, projetos }) {
  const [cotacoes, setCotacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCotacao, setSelectedCotacao] = useState(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);

  // Filtros
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [filtroProjeto, setFiltroProjeto] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (empresaAtiva) {
      loadData();
    }
  }, [empresaAtiva]);

  const loadData = async () => {
    setLoading(true);
    try {
      const cotacoesData = await sigo.entities.Cotacao.filter({
        empresa_id: empresaAtiva.id,
      });

      setCotacoes(cotacoesData);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDetalhes = useCallback(async (cotacao) => {
    try {
      const [fornecedores, itens, respostasData] = await Promise.all([
        sigo.entities.CotacaoFornecedor.filter({ cotacao_id: cotacao.id }),
        sigo.entities.CotacaoItem.filter({ cotacao_id: cotacao.id }),
        sigo.entities.CotacaoResposta.filter({ cotacao_id: cotacao.id }),
      ]);

      setSelectedCotacao({
        ...cotacao,
        fornecedores,
        itens,
        respostas: respostasData,
      });
      setDetalhesOpen(true);
    } catch (error) {
      console.error("Erro ao carregar detalhes:", error);
    }
  }, []);

  const getStatusBadge = useCallback((cotacao) => {
    const statusMap = {
      Aprovada: { bg: "bg-green-100", text: "text-green-700", icon: Award, label: "Ganha" },
      Cancelada: {
        bg: "bg-red-100",
        text: "text-red-700",
        icon: XCircle,
        label: "Perdida/Cancelada",
      },
      default: { bg: "bg-blue-100", text: "text-blue-700", icon: Clock, label: "Concluída" },
    };
    const config = statusMap[cotacao.status] || statusMap.default;
    const Icon = config.icon;
    return (
      <Badge className={`${config.bg} ${config.text} border-${config.bg.split("-")[1]}-200`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  }, []);

  const { cotacoesFiltradas, stats } = useMemo(() => {
    const buscaLower = busca.toLowerCase();
    const dataInicio = filtroDataInicio ? new Date(filtroDataInicio) : null;
    const dataFim = filtroDataFim ? new Date(filtroDataFim) : null;

    const filtradas = cotacoes.filter((cot) => {
      if (
        busca &&
        !cot.numero?.toLowerCase().includes(buscaLower) &&
        !cot.projeto_nome?.toLowerCase().includes(buscaLower)
      ) {
        return false;
      }
      if (dataInicio && new Date(cot.created_date) < dataInicio) return false;
      if (dataFim && new Date(cot.created_date) > dataFim) return false;
      if (filtroProjeto !== "todos" && cot.projeto_id !== filtroProjeto) return false;
      if (filtroStatus === "ganha" && cot.status !== "Aprovada") return false;
      if (filtroStatus === "perdida" && cot.status !== "Cancelada") return false;
      return true;
    });

    return {
      cotacoesFiltradas: filtradas,
      stats: {
        total: filtradas.length,
        ganhas: filtradas.filter((c) => c.status === "Aprovada").length,
        perdidas: filtradas.filter((c) => c.status === "Cancelada").length,
        valorTotal: filtradas
          .filter((c) => c.status === "Aprovada")
          .reduce((sum, c) => sum + (c.valor_aprovado || 0), 0),
      },
    };
  }, [cotacoes, busca, filtroDataInicio, filtroDataFim, filtroProjeto, filtroStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total de Cotações</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
              </div>
              <Calendar className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Cotações Ganhas</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{stats.ganhas}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Perdidas/Canceladas</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{stats.perdidas}</p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Valor Total Ganho</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">
                  R$ {stats.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <Award className="w-8 h-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Busca */}
            <div className="md:col-span-2">
              <Label>Buscar</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Número ou projeto..."
                  className="pl-9"
                />
              </div>
            </div>

            {/* Data Início */}
            <div>
              <Label>Data Início</Label>
              <Input
                type="date"
                value={filtroDataInicio}
                onChange={(e) => setFiltroDataInicio(e.target.value)}
                className="mt-1.5"
              />
            </div>

            {/* Data Fim */}
            <div>
              <Label>Data Fim</Label>
              <Input
                type="date"
                value={filtroDataFim}
                onChange={(e) => setFiltroDataFim(e.target.value)}
                className="mt-1.5"
              />
            </div>

            {/* Status */}
            <div>
              <Label>Status</Label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ganha">Ganhas</SelectItem>
                  <SelectItem value="perdida">Perdidas/Canceladas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Projeto</Label>
            <Select value={filtroProjeto} onValueChange={setFiltroProjeto}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Projetos</SelectItem>
                {projetos.map((proj) => (
                  <SelectItem key={proj.id} value={proj.id}>
                    {proj.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(busca ||
            filtroDataInicio ||
            filtroDataFim ||
            filtroProjeto !== "todos" ||
            filtroStatus !== "todos") && (
            <Button
              variant="outline"
              onClick={() => {
                setBusca("");
                setFiltroDataInicio("");
                setFiltroDataFim("");
                setFiltroProjeto("todos");
                setFiltroStatus("todos");
              }}
              className="text-slate-600"
            >
              Limpar
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Lista de Cotações */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Projeto</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Fornecedores</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valor Aprovado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cotacoesFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    Nenhuma cotação encontrada
                  </TableCell>
                </TableRow>
              ) : (
                cotacoesFiltradas.map((cot) => (
                  <TableRow key={cot.id}>
                    <TableCell className="font-medium">{cot.numero}</TableCell>
                    <TableCell className="text-slate-600">{cot.projeto_nome || "-"}</TableCell>
                    <TableCell className="text-slate-600">
                      {new Date(cot.created_date).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-slate-600">
                        <Users className="w-4 h-4" />
                        {cot.total_fornecedores || 0}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(cot)}</TableCell>
                    <TableCell className="text-slate-900 font-medium">
                      {cot.valor_aprovado
                        ? `R$ ${cot.valor_aprovado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => loadDetalhes(cot)}>
                        <Eye className="w-4 h-4 mr-1" />
                        Ver Detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de Detalhes */}
      <Sheet open={detalhesOpen} onOpenChange={setDetalhesOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl">
          {selectedCotacao && (
            <>
              <SheetHeader>
                <SheetTitle>Detalhes da Cotação {selectedCotacao.numero}</SheetTitle>
                <div className="flex items-center gap-2 mt-2">
                  {getStatusBadge(selectedCotacao)}
                  {selectedCotacao.data_limite && (
                    <Badge variant="outline" className="text-slate-600">
                      <Clock className="w-3 h-3 mr-1" />
                      Prazo: {new Date(selectedCotacao.data_limite).toLocaleDateString("pt-BR")}
                    </Badge>
                  )}
                </div>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                {/* Info Geral */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Informações Gerais</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {selectedCotacao.projeto_nome && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Projeto:</span>
                        <span className="font-medium">{selectedCotacao.projeto_nome}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-600">Data de Criação:</span>
                      <span className="font-medium">
                        {new Date(selectedCotacao.created_date).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    {selectedCotacao.fornecedor_vencedor_nome && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Fornecedor Vencedor:</span>
                        <span className="font-medium text-green-600">
                          {selectedCotacao.fornecedor_vencedor_nome}
                        </span>
                      </div>
                    )}
                    {selectedCotacao.valor_aprovado > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Valor Aprovado:</span>
                        <span className="font-medium text-green-600">
                          R${" "}
                          {selectedCotacao.valor_aprovado.toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    )}
                    {selectedCotacao.observacoes && (
                      <div className="pt-2 border-t">
                        <span className="text-slate-600">Observações:</span>
                        <p className="mt-1 text-slate-800">{selectedCotacao.observacoes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Itens Cotados */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Itens da Cotação</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedCotacao.itens?.map((item, idx) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 p-2 bg-slate-50 rounded"
                        >
                          <span className="text-sm font-medium text-slate-600 w-6">{idx + 1}.</span>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.descricao}</p>
                            {item.especificacoes && (
                              <p className="text-xs text-slate-500">{item.especificacoes}</p>
                            )}
                          </div>
                          <Badge variant="outline">
                            {item.quantidade} {item.unidade}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Fornecedores e Propostas */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Fornecedores Participantes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedCotacao.fornecedores?.map((forn) => {
                      const respostasForn = selectedCotacao.respostas?.filter(
                        (r) => r.fornecedor_id === forn.fornecedor_id
                      );
                      const totalForn = respostasForn?.reduce(
                        (sum, r) => sum + (r.valor_total || 0),
                        0
                      );

                      return (
                        <div
                          key={forn.id}
                          className={`p-4 rounded-lg border-2 ${
                            forn.fornecedor_id === selectedCotacao.fornecedor_vencedor_id
                              ? "border-green-300 bg-green-50"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-slate-900">
                                  {forn.fornecedor_nome}
                                </h4>
                                {forn.fornecedor_id === selectedCotacao.fornecedor_vencedor_id && (
                                  <Badge className="bg-green-100 text-green-700">
                                    <Award className="w-3 h-3 mr-1" />
                                    Vencedor
                                  </Badge>
                                )}
                              </div>
                              {forn.fornecedor_email && (
                                <p className="text-xs text-slate-500 mt-1">
                                  {forn.fornecedor_email}
                                </p>
                              )}
                            </div>
                            <Badge
                              className={
                                forn.status === "Respondida"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-orange-100 text-orange-700"
                              }
                            >
                              {forn.status}
                            </Badge>
                          </div>

                          {forn.status === "Respondida" &&
                            respostasForn &&
                            respostasForn.length > 0 && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm pt-2 border-t">
                                  <span className="text-slate-600">Valor Total da Proposta:</span>
                                  <span className="font-bold text-slate-900">
                                    R${" "}
                                    {totalForn.toLocaleString("pt-BR", {
                                      minimumFractionDigits: 2,
                                    })}
                                  </span>
                                </div>
                                {forn.prazo_entrega_dias && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-600">Prazo de Entrega:</span>
                                    <span className="text-slate-800">
                                      {forn.prazo_entrega_dias} dias
                                    </span>
                                  </div>
                                )}
                                {forn.condicao_pagamento && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-600">Condição de Pagamento:</span>
                                    <span className="text-slate-800">
                                      {forn.condicao_pagamento}
                                    </span>
                                  </div>
                                )}
                                {forn.observacoes && (
                                  <div className="text-xs pt-2">
                                    <span className="text-slate-600">Observações:</span>
                                    <p className="text-slate-800 mt-1">{forn.observacoes}</p>
                                  </div>
                                )}
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
