import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  PackageCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Plus,
  Wrench,
  Shield,
  Truck,
  Pencil,
  Trash2,
} from "lucide-react";
import SolicitarEntregaFerramentasModal from "./SolicitarEntregaFerramentasModal";
import SolicitarEntregaCaminhaoModal from "./SolicitarEntregaCaminhaoModal";

const STATUS_CONFIG = {
  Pendente: { color: "bg-amber-100 text-amber-700", icon: Clock },
  Entregue: { color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  Cancelada: { color: "bg-red-100 text-red-700", icon: XCircle },
};

export default function SolicitacoesEntregaTab({ empresaAtiva, user }) {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Pendente");
  const [funcionarios, setFuncionarios] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [showNovaSolicitacao, setShowNovaSolicitacao] = useState(false);
  const [funcionarioSelecionado, setFuncionarioSelecionado] = useState(null);
  const [buscaFuncionario, setBuscaFuncionario] = useState("");
  const [showSelecionarFuncionario, setShowSelecionarFuncionario] = useState(false);
  const [showSolicitacaoCaminhao, setShowSolicitacaoCaminhao] = useState(false);
  const [solicitacaoEditando, setSolicitacaoEditando] = useState(null);

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadData();
    }
  }, [empresaAtiva?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sols, funcs, funcoesList] = await Promise.all([
        sigo.entities.EntregaFerramental.filter(
          { empresa_id: empresaAtiva.id },
          "-created_date",
          200
        ),
        sigo.entities.Funcionario.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Funcao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ]);
      setSolicitacoes(sols);
      setFuncionarios(funcs);
      setFuncoes(funcoesList);
    } catch {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = user?.role === "admin" || user?.perfil === "Admin";

  const handleCancelar = async (sol) => {
    if (!confirm(`Cancelar solicitação para ${sol.funcionario_nome}?`)) return;
    try {
      await sigo.entities.EntregaFerramental.update(sol.id, { status: "Cancelada" });
      toast.success("Solicitação cancelada");
      loadData();
    } catch {
      toast.error("Erro ao cancelar");
    }
  };

  const handleExcluir = async (sol) => {
    if (
      !confirm(
        `Excluir permanentemente a solicitação de ${sol.funcionario_nome || sol.caminhao_placa}? Esta ação não pode ser desfeita.`
      )
    )
      return;
    try {
      await sigo.entities.EntregaFerramental.delete(sol.id);
      toast.success("Solicitação excluída");
      loadData();
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const solicitacoesFiltradas = solicitacoes
    .filter((s) => filtroStatus === "Todas" || s.status === filtroStatus)
    .filter(
      (s) =>
        !busca ||
        s.funcionario_nome?.toLowerCase().includes(busca.toLowerCase()) ||
        s.funcao_nome?.toLowerCase().includes(busca.toLowerCase())
    );

  const stats = {
    pendentes: solicitacoes.filter((s) => s.status === "Pendente").length,
    entregues: solicitacoes.filter((s) => s.status === "Entregue").length,
  };

  const funcionariosFiltrados = funcionarios.filter(
    (f) =>
      !buscaFuncionario || f.nome_completo?.toLowerCase().includes(buscaFuncionario.toLowerCase())
  );

  const funcaoDoFuncionario = funcionarioSelecionado
    ? funcoes.find((f) => f.id === funcionarioSelecionado.funcao_id)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Solicitações de Entrega</h2>
          <p className="text-sm text-slate-500">
            Solicite entrega de ferramentas e EPIs para o almoxarife
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowSelecionarFuncionario(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            Para Funcionário
          </Button>
          <Button
            onClick={() => setShowSolicitacaoCaminhao(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
          >
            <Truck className="w-4 h-4" />
            Para Caminhão
          </Button>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">{stats.pendentes}</p>
                <p className="text-sm text-amber-600">Aguardando Almoxarife</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-700">{stats.entregues}</p>
                <p className="text-sm text-green-600">Entregas Realizadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar funcionário..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {["Pendente", "Entregue", "Cancelada", "Todas"].map((s) => (
            <Button
              key={s}
              variant={filtroStatus === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroStatus(s)}
            >
              {s}
            </Button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={loadData} className="gap-1">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Carregando...</div>
      ) : solicitacoesFiltradas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <PackageCheck className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p>
              Nenhuma solicitação {filtroStatus !== "Todas" ? filtroStatus.toLowerCase() : ""}{" "}
              encontrada
            </p>
            {filtroStatus === "Pendente" && (
              <Button
                onClick={() => setShowSelecionarFuncionario(true)}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white gap-2"
              >
                <Plus className="w-4 h-4" />
                Criar primeira solicitação
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {solicitacoesFiltradas.map((sol) => {
            const statusCfg = STATUS_CONFIG[sol.status] || STATUS_CONFIG["Pendente"];
            const StatusIcon = statusCfg.icon;
            const itens = (() => {
              try {
                return JSON.parse(sol.itens || "[]");
              } catch {
                return [];
              }
            })();
            const temFerramentas = itens.some((i) => i.tipo === "Ferramenta");
            const temEPIs = itens.some((i) => i.tipo === "EPI");

            return (
              <Card key={sol.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-slate-800">{sol.funcionario_nome}</h3>
                        <Badge className={`text-xs ${statusCfg.color} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {sol.status}
                        </Badge>
                        {temFerramentas && (
                          <Badge className="text-xs bg-blue-100 text-blue-700 flex items-center gap-1">
                            <Wrench className="w-3 h-3" />
                            Ferramentas
                          </Badge>
                        )}
                        {temEPIs && (
                          <Badge className="text-xs bg-green-100 text-green-700 flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            EPIs
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">
                        {sol.funcao_nome} • {itens.length} item(ns)
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Solicitado por {sol.solicitante_nome} em{" "}
                        {sol.data_solicitacao
                          ? format(new Date(sol.data_solicitacao + "T12:00:00"), "dd/MM/yyyy")
                          : "-"}
                      </p>
                      {sol.status === "Entregue" && sol.data_entrega && (
                        <p className="text-xs text-green-600 mt-0.5">
                          Entregue em{" "}
                          {format(new Date(sol.data_entrega + "T12:00:00"), "dd/MM/yyyy")} por{" "}
                          {sol.responsavel_entrega_nome}
                        </p>
                      )}
                      {sol.observacoes && (
                        <p className="text-xs text-slate-500 mt-1 italic">"{sol.observacoes}"</p>
                      )}
                    </div>

                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const func = funcionarios.find((f) => f.id === sol.funcionario_id);
                          setFuncionarioSelecionado(
                            func || {
                              id: sol.funcionario_id,
                              nome_completo: sol.funcionario_nome,
                              funcao_id: sol.funcao_id,
                              funcao_nome: sol.funcao_nome,
                            }
                          );
                          setSolicitacaoEditando(sol);
                          setShowNovaSolicitacao(true);
                        }}
                        className="text-blue-500 hover:text-blue-700"
                        title="Editar solicitação"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {sol.status === "Pendente" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCancelar(sol)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleExcluir(sol)}
                          className="text-red-400 hover:text-red-700 hover:bg-red-50"
                          title="Excluir permanentemente (Admin)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal seleção de funcionário */}
      {showSelecionarFuncionario && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="p-5 border-b">
              <h3 className="font-semibold text-lg">Selecionar Funcionário</h3>
              <p className="text-sm text-slate-500 mt-1">Para quem é a solicitação?</p>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar funcionário..."
                  value={buscaFuncionario}
                  onChange={(e) => setBuscaFuncionario(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {funcionariosFiltrados.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setFuncionarioSelecionado(f);
                    setShowSelecionarFuncionario(false);
                    setBuscaFuncionario("");
                    setShowNovaSolicitacao(true);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-blue-700">
                      {f.nome_completo?.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{f.nome_completo}</p>
                    <p className="text-xs text-slate-500">{f.funcao_nome || "Sem função"}</p>
                  </div>
                </button>
              ))}
              {funcionariosFiltrados.length === 0 && (
                <p className="text-center text-slate-400 py-6 text-sm">
                  Nenhum funcionário encontrado
                </p>
              )}
            </div>
            <div className="p-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowSelecionarFuncionario(false);
                  setBuscaFuncionario("");
                }}
                className="w-full"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Solicitar Entrega */}
      {showNovaSolicitacao && funcionarioSelecionado && (
        <SolicitarEntregaFerramentasModal
          open={showNovaSolicitacao}
          onOpenChange={(v) => {
            setShowNovaSolicitacao(v);
            if (!v) {
              setFuncionarioSelecionado(null);
              setSolicitacaoEditando(null);
            }
          }}
          funcionario={funcionarioSelecionado}
          funcao={funcaoDoFuncionario}
          empresaAtiva={empresaAtiva}
          user={user}
          entregaExistente={solicitacaoEditando}
          onSuccess={() => {
            setShowNovaSolicitacao(false);
            setFuncionarioSelecionado(null);
            setSolicitacaoEditando(null);
            loadData();
            toast.success(
              solicitacaoEditando
                ? "Solicitação atualizada!"
                : "Solicitação criada! O almoxarife verá no módulo Ferramental."
            );
          }}
        />
      )}

      {/* Modal Solicitar Entrega para Caminhão */}
      {showSolicitacaoCaminhao && (
        <SolicitarEntregaCaminhaoModal
          open={showSolicitacaoCaminhao}
          onOpenChange={setShowSolicitacaoCaminhao}
          empresaAtiva={empresaAtiva}
          user={user}
          onSuccess={() => {
            setShowSolicitacaoCaminhao(false);
            loadData();
            toast.success("Solicitação criada! O almoxarife verá no módulo Ferramental.");
          }}
        />
      )}
    </div>
  );
}
