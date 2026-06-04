import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { createPageUrl } from "../utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Building2,
  LogOut,
  Search,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  Package,
  Calendar,
  Award,
  ChevronRight,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function HistoricoCotacoes() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [cotacoesFornecedor, setCotacoesFornecedor] = useState([]);
  const [empresa, setEmpresa] = useState(null);
  const [fornecedor, setFornecedor] = useState(null);
  const [busca, setBusca] = useState("");
  const [selectedCotacao, setSelectedCotacao] = useState(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const customAuth = sessionStorage.getItem("custom_auth");
        if (!customAuth) {
          navigate(createPageUrl("EntrarSistema"), { replace: true });
          return;
        }

        const userData = safeParseJSON(customAuth, {});
        if (!userData || userData.perfil !== "Fornecedor" || !userData.portal_token) {
          navigate(createPageUrl("EntrarSistema"), { replace: true });
          return;
        }

        // Tudo via Edge Function service-role: sob RLS o fornecedor é `anon`, então
        // a function valida o portal_token e devolve empresa + fornecedor + cotações.
        const { data } = await sigo.functions.invoke("portalFornecedorCotacoes", {
          portal_token: userData.portal_token,
        });

        if (!data?.success) {
          // token expirado/inválido → de volta ao login
          navigate(createPageUrl("EntrarSistema"), { replace: true });
          return;
        }

        if (data.empresa) setEmpresa(data.empresa);
        if (data.fornecedor) setFornecedor(data.fornecedor);
        setCotacoesFornecedor(data.cotacoes || []);
      } catch (error) {
        console.error("Erro ao carregar histórico:", error);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.clear();
    navigate(createPageUrl("EntrarSistema"), { replace: true });
  };

  const handleAbrirCotacao = (cotacao) => {
    const token = cotacao.participacao?.token;
    if (token) {
      navigate(createPageUrl("AcessoFornecedor") + `?token=${token}`);
    }
  };

  const handleVerDetalhes = async (cotacao) => {
    setLoadingDetalhes(true);
    setDetalhesOpen(true);
    try {
      const token = cotacao.participacao?.token;
      if (token) {
        // Edge Function service-role: enriquece os itens com código (RLS-safe)
        const result = await sigo.functions.invoke("portalFornecedorCotacao", { token });
        const data = result.data;
        setSelectedCotacao({
          ...cotacao,
          itens: data.itens || [],
          respostas: data.respostas || [],
        });
      } else {
        // Sem token não dá pra carregar os itens com segurança sob RLS
        setSelectedCotacao({ ...cotacao, itens: [], respostas: [] });
      }
    } catch (error) {
      console.error("Erro ao carregar detalhes:", error);
    } finally {
      setLoadingDetalhes(false);
    }
  };

  const getStatusParticipacao = (participacao) => {
    const statusMap = {
      Enviada: { label: "Aguardando resposta", color: "bg-blue-100 text-blue-700", icon: Clock },
      Visualizada: { label: "Visualizada", color: "bg-purple-100 text-purple-700", icon: Eye },
      "Respondida Parcialmente": {
        label: "Respondida parcialmente",
        color: "bg-yellow-100 text-yellow-700",
        icon: CheckCircle2,
      },
      "Respondida Totalmente": {
        label: "Respondida",
        color: "bg-green-100 text-green-700",
        icon: CheckCircle2,
      },
      "Impossível Responder": {
        label: "Impossível responder",
        color: "bg-red-100 text-red-700",
        icon: XCircle,
      },
    };
    const s = statusMap[participacao?.status] || {
      label: participacao?.status || "-",
      color: "bg-slate-100 text-slate-700",
      icon: Clock,
    };
    const Icon = s.icon;
    return (
      <Badge className={s.color}>
        <Icon className="w-3 h-3 mr-1" />
        {s.label}
      </Badge>
    );
  };

  const getStatusCotacao = (cotacao) => {
    const statusMap = {
      Aprovada: { label: "Aprovada", color: "bg-green-100 text-green-700" },
      Cancelada: { label: "Cancelada", color: "bg-red-100 text-red-700" },
      "Respostas Recebidas": { label: "Em análise", color: "bg-blue-100 text-blue-700" },
      "Aguardando Respostas": { label: "Aguardando", color: "bg-yellow-100 text-yellow-700" },
      Aberta: { label: "Aberta", color: "bg-slate-100 text-slate-700" },
    };
    const s = statusMap[cotacao.status] || {
      label: cotacao.status,
      color: "bg-slate-100 text-slate-700",
    };
    return <Badge className={s.color}>{s.label}</Badge>;
  };

  const podeResponder = (cotacao) => {
    // Cotação deve estar em status que permita respostas
    const cotacaoPermite = [
      "Aberta",
      "Enviada aos Fornecedores",
      "Aguardando Respostas",
      "Respostas Recebidas",
    ].includes(cotacao.status);
    // Participação deve estar pendente (incluindo reaberta pelo admin)
    const participacaoPendente = ["Enviada", "Visualizada"].includes(cotacao.participacao?.status);
    return cotacaoPermite && participacaoPendente;
  };

  const isAberta = (cotacao) => {
    return podeResponder(cotacao);
  };

  const cotacoesFiltradas = cotacoesFornecedor.filter(
    (cot) =>
      !busca ||
      cot.numero?.toLowerCase().includes(busca.toLowerCase()) ||
      cot.projeto_nome?.toLowerCase().includes(busca.toLowerCase())
  );

  const stats = {
    total: cotacoesFornecedor.length,
    respondidas: cotacoesFornecedor.filter(
      (c) =>
        c.participacao?.status === "Respondida Totalmente" ||
        c.participacao?.status === "Respondida Parcialmente"
    ).length,
    pendentes: cotacoesFornecedor.filter(
      (c) => c.participacao?.status === "Enviada" || c.participacao?.status === "Visualizada"
    ).length,
    vencidas: cotacoesFornecedor.filter(
      (c) => c.fornecedor_vencedor_id === c.participacao?.fornecedor_id
    ).length,
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600">Carregando histórico...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800">
                {empresa?.nome_fantasia || empresa?.razao_social || "Portal do Fornecedor"}
              </h1>
              {fornecedor && <p className="text-xs text-slate-500">{fornecedor.nome_razao}</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-1" />
            Sair
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Minhas Cotações</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Histórico de todas as cotações em que você participou
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-slate-700", bg: "bg-white" },
            {
              label: "Respondidas",
              value: stats.respondidas,
              color: "text-green-600",
              bg: "bg-white",
            },
            {
              label: "Pendentes",
              value: stats.pendentes,
              color: "text-yellow-600",
              bg: "bg-white",
            },
            { label: "Vencidas", value: stats.vencidas, color: "text-blue-600", bg: "bg-white" },
          ].map((stat) => (
            <Card key={stat.label} className={stat.bg}>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">{stat.label}</p>
                <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número ou projeto..."
            className="pl-9 bg-white"
          />
        </div>

        {/* Lista */}
        {cotacoesFiltradas.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Package className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Nenhuma cotação encontrada</p>
              <p className="text-xs text-slate-400 mt-1">
                Você ainda não participou de nenhuma cotação
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {cotacoesFiltradas.map((cot) => (
              <Card key={cot.id} className="bg-white hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">
                          Cotação {cot.numero || cot.id.slice(0, 8).toUpperCase()}
                        </span>
                        {getStatusCotacao(cot)}
                        {cot.fornecedor_vencedor_id === cot.participacao?.fornecedor_id && (
                          <Badge className="bg-amber-100 text-amber-700">
                            <Award className="w-3 h-3 mr-1" />
                            Vencedor
                          </Badge>
                        )}
                      </div>
                      {cot.projeto_nome && (
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {cot.projeto_nome}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(cot.created_date), "dd 'de' MMM 'de' yyyy", {
                            locale: ptBR,
                          })}
                        </span>
                        {cot.data_limite && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Prazo: {format(new Date(cot.data_limite), "dd/MM/yyyy")}
                          </span>
                        )}
                      </div>
                      <div className="mt-2">{getStatusParticipacao(cot.participacao)}</div>
                      {cot.participacao?.status === "Impossível Responder" &&
                        cot.participacao?.motivo_recusa && (
                          <p className="text-xs text-red-600 mt-1 italic">
                            "{cot.participacao.motivo_recusa}"
                          </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {isAberta(cot) && (
                        <Button
                          size="sm"
                          className="bg-amber-500 hover:bg-amber-600 text-xs"
                          onClick={() => handleAbrirCotacao(cot)}
                        >
                          Responder
                          <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => handleVerDetalhes(cot)}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Detalhes
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Sheet de Detalhes */}
      <Sheet open={detalhesOpen} onOpenChange={setDetalhesOpen}>
        <SheetContent
          side="right"
          className="w-full h-full overflow-y-auto !p-0"
          style={{
            maxWidth: "100%",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            height: "100%",
          }}
        >
          <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center gap-3 z-10">
            <button
              onClick={() => setDetalhesOpen(false)}
              className="p-1.5 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
            <SheetTitle className="text-base">
              Detalhes — Cotação {selectedCotacao?.numero}
            </SheetTitle>
          </div>

          {loadingDetalhes ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            selectedCotacao && (
              <div className="space-y-5 p-4">
                {/* Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Informações Gerais</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Status da cotação:</span>
                      {getStatusCotacao(selectedCotacao)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sua participação:</span>
                      {getStatusParticipacao(selectedCotacao.participacao)}
                    </div>
                    {selectedCotacao.projeto_nome && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Projeto:</span>
                        <span className="font-medium">{selectedCotacao.projeto_nome}</span>
                      </div>
                    )}
                    {selectedCotacao.data_limite && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Prazo:</span>
                        <span className="font-medium">
                          {format(new Date(selectedCotacao.data_limite), "dd/MM/yyyy")}
                        </span>
                      </div>
                    )}
                    {selectedCotacao.fornecedor_vencedor_nome && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Fornecedor vencedor:</span>
                        <span
                          className={`font-medium ${selectedCotacao.fornecedor_vencedor_id === selectedCotacao.participacao?.fornecedor_id ? "text-green-600" : ""}`}
                        >
                          {selectedCotacao.fornecedor_vencedor_id ===
                          selectedCotacao.participacao?.fornecedor_id
                            ? "🏆 Você"
                            : selectedCotacao.fornecedor_vencedor_nome}
                        </span>
                      </div>
                    )}
                    {selectedCotacao.valor_aprovado > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Valor aprovado:</span>
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
                        <p className="text-slate-500 mb-1">Observações:</p>
                        <p className="text-slate-700">{selectedCotacao.observacoes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Itens e suas respostas */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Itens da Cotação</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedCotacao.itens?.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-4">Nenhum item</p>
                    )}
                    {selectedCotacao.itens?.map((item, idx) => {
                      const resposta = selectedCotacao.respostas?.find(
                        (r) => r.item_id === item.id
                      );
                      return (
                        <div key={item.id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold text-slate-400 mt-0.5 w-5 flex-shrink-0">
                              {idx + 1}.
                            </span>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-slate-800">{item.descricao}</p>
                              {(item.codigo || item.material_codigo) && (
                                <p className="text-xs font-semibold text-blue-600">
                                  Cód: {item.codigo || item.material_codigo}
                                </p>
                              )}
                              <p className="text-xs text-slate-500">
                                {item.quantidade} {item.unidade}
                              </p>
                            </div>
                          </div>
                          {resposta ? (
                            <div className="ml-7 grid grid-cols-2 gap-2 text-xs bg-green-50 rounded p-2">
                              <div>
                                <span className="text-slate-500">Valor unit.:</span>
                                <span className="ml-1 font-medium text-green-700">
                                  R${" "}
                                  {Number(resposta.valor_unitario).toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500">Total:</span>
                                <span className="ml-1 font-medium text-green-700">
                                  R${" "}
                                  {Number(resposta.valor_total).toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                              {resposta.prazo_entrega_dias && (
                                <div>
                                  <span className="text-slate-500">Prazo:</span>
                                  <span className="ml-1">{resposta.prazo_entrega_dias} dias</span>
                                </div>
                              )}
                              {resposta.observacoes && (
                                <div className="col-span-2">
                                  <span className="text-slate-500">Obs:</span>
                                  <span className="ml-1 italic">{resposta.observacoes}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="ml-7 text-xs text-slate-400 italic">
                              Sem resposta para este item
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {isAberta(selectedCotacao) && (
                  <Button
                    className="w-full bg-amber-500 hover:bg-amber-600"
                    onClick={() => {
                      setDetalhesOpen(false);
                      handleAbrirCotacao(selectedCotacao);
                    }}
                  >
                    Ir para Cotação
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            )
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
