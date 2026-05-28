import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { useEmpresa } from "@/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar, Clock, Search, AlertTriangle, Wrench, CheckCircle2, X, Eye } from "lucide-react";
import { toast } from "sonner";

import ManutencaoDetalheModal from "./ManutencaoDetalheModal";
import AgendarManutencaoModal from "./AgendarManutencaoModal";
import ManutencaoEditarModal from "./ManutencaoEditarModal";

export default function ManutencaoTab() {
  const { empresaAtiva } = useEmpresa();
  const [manutencoes, setManutencoes] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todas");
  const [showDetalhe, setShowDetalhe] = useState(false);
  const [showAgendar, setShowAgendar] = useState(false);
  const [manutencaoSelecionada, setManutencaoSelecionada] = useState(null);
  const [ferramentaSelecionada, setFerramentaSelecionada] = useState(null);
  const [alertas, setAlertas] = useState({ atrasadas: 0, proximas: 0 });
  const [showEditar, setShowEditar] = useState(false);

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadData();
    }
  }, [empresaAtiva?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [manus, ferrs] = await Promise.all([
        sigo.entities.ManutencaoFerramenta.filter(
          { empresa_id: empresaAtiva.id },
          "-data_prevista",
          500
        ),
        sigo.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }, "", 1000),
      ]);

      setManutencoes(manus);
      setFerramentas(ferrs);
      calcularAlertas(manus, ferrs);
    } catch (error) {
      console.error("Erro ao carregar manutenções:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const calcularAlertas = (manus, ferrs) => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const seteDiasFrente = new Date(hoje);
    seteDiasFrente.setDate(seteDiasFrente.getDate() + 7);

    // Manutenções agendadas atrasadas
    const atrasadas = manus.filter((m) => {
      if (m.status !== "Agendada") return false;
      const dataPrevista = new Date(m.data_prevista);
      return dataPrevista < hoje;
    }).length;

    // Ferramentas com manutenção próxima (próximos 7 dias)
    const proximas = ferrs.filter((f) => {
      if (!f.proxima_manutencao) return false;
      const proxManut = new Date(f.proxima_manutencao);
      return proxManut >= hoje && proxManut <= seteDiasFrente;
    }).length;

    setAlertas({ atrasadas, proximas });
  };

  const handleSalvar = async (dados) => {
    try {
      if (manutencaoSelecionada?.id) {
        await sigo.entities.ManutencaoFerramenta.update(manutencaoSelecionada.id, dados);
        toast.success("Manutenção atualizada");
      } else {
        await sigo.entities.ManutencaoFerramenta.create(dados);
        toast.success("Manutenção registrada");
      }

      setManutencaoSelecionada(null);
      loadData();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar manutenção");
    }
  };

  const [extrasEditar, setExtrasEditar] = useState([]);
  const [ferramentasListEditar, setFerramentasListEditar] = useState([]);

  const handleEditar = (manutencao, extras = [], ferramentasList = []) => {
    setManutencaoSelecionada(manutencao);
    setExtrasEditar(extras);
    setFerramentasListEditar(ferramentasList);
    setShowEditar(true);
  };

  const handleAprovar = async (manutencao) => {
    try {
      await sigo.entities.ManutencaoFerramenta.update(manutencao.id, { status: "Em Andamento" });
      toast.success("Pedido aprovado!");
      loadData();
    } catch (error) {
      console.error("Erro ao aprovar:", error);
      toast.error("Erro ao aprovar pedido");
    }
  };

  const handleReprovar = async (manutencao, extras = []) => {
    try {
      await sigo.entities.ManutencaoFerramenta.update(manutencao.id, { status: "Cancelada" });
      await Promise.all(
        extras.map((e) => sigo.entities.ManutencaoFerramenta.update(e.id, { status: "Cancelada" }))
      );
      toast.success("Pedido reprovado.");
      loadData();
    } catch (error) {
      console.error("Erro ao reprovar:", error);
      toast.error("Erro ao reprovar pedido");
    }
  };

  const getNumeroFerramentas = (manutencao) => {
    const lista = safeParseJSON(manutencao.ferramentas, []);
    return lista.length > 0 ? lista.length : 1;
  };

  const handleVisualizar = (manutencao) => {
    setManutencaoSelecionada(manutencao);
    setShowDetalhe(true);
  };

  const getStatusColor = (status) => {
    const colors = {
      Agendada: "bg-blue-100 text-blue-800",
      "Em Andamento": "bg-yellow-100 text-yellow-800",
      Concluída: "bg-green-100 text-green-800",
      Cancelada: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-slate-100 text-slate-800";
  };

  const getTipoIcon = (tipo) => {
    const icons = {
      Preventiva: Clock,
      Corretiva: Wrench,
      Preditiva: AlertTriangle,
      Inspeção: Eye,
    };
    return icons[tipo] || Clock;
  };

  const isAtrasada = (manutencao) => {
    if (manutencao.status !== "Agendada") return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataPrevista = new Date(manutencao.data_prevista);
    return dataPrevista < hoje;
  };

  // Agrupar manutenções: registros criados dentro de 60s são do mesmo pedido
  const pedidosAgrupados = React.useMemo(() => {
    const filtered = manutencoes.filter((m) => {
      const matchBusca =
        !busca ||
        m.ferramenta_codigo?.toLowerCase().includes(busca.toLowerCase()) ||
        m.ferramenta_descricao?.toLowerCase().includes(busca.toLowerCase());
      const matchStatus = filtroStatus === "Todas" || m.status === filtroStatus;
      return matchBusca && matchStatus;
    });

    const grupos = [];
    const usados = new Set();

    for (const m of filtered) {
      if (usados.has(m.id)) continue;

      // Se já tem ferramentas JSON (novo fluxo), é um pedido único
      const ferramentasJson = safeParseJSON(m.ferramentas, []);

      if (ferramentasJson.length > 0) {
        grupos.push({ principal: m, extras: [], ferramentasList: ferramentasJson });
        usados.add(m.id);
        continue;
      }

      // Agrupar por proximidade de tempo (60s) + mesmo status + mesma descricao
      const mTime = new Date(m.created_date).getTime();
      const irmãos = filtered.filter((outro) => {
        if (outro.id === m.id || usados.has(outro.id)) return false;
        const diff = Math.abs(new Date(outro.created_date).getTime() - mTime);
        return diff <= 60000 && outro.status === m.status && outro.descricao === m.descricao;
      });

      const todos = [m, ...irmãos];
      todos.forEach((t) => usados.add(t.id));
      grupos.push({
        principal: m,
        extras: irmãos,
        ferramentasList: todos.map((t) => ({
          codigo: t.ferramenta_codigo,
          descricao: t.ferramenta_descricao,
          numero_serie: t.numero_serie || "",
        })),
      });
    }

    return grupos;
  }, [manutencoes, busca, filtroStatus]);

  if (loading && manutencoes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alertas */}
      {(alertas.atrasadas > 0 || alertas.proximas > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alertas.atrasadas > 0 && (
            <Card className="p-4 bg-red-50 border-red-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-red-600 font-medium">Manutenções Atrasadas</p>
                  <p className="text-2xl font-bold text-red-700">{alertas.atrasadas}</p>
                </div>
              </div>
            </Card>
          )}

          {alertas.proximas > 0 && (
            <Card className="p-4 bg-amber-50 border-amber-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-amber-600 font-medium">Próximas 7 dias</p>
                  <p className="text-2xl font-bold text-amber-700">{alertas.proximas}</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Filtros e Ações */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por código ou descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            {["Todas", "Agendada", "Em Andamento", "Concluída", "Cancelada"].map((status) => (
              <Button
                key={status}
                variant={filtroStatus === status ? "default" : "outline"}
                size="sm"
                onClick={() => setFiltroStatus(status)}
                className={filtroStatus === status ? "bg-amber-500 hover:bg-amber-600" : ""}
              >
                {status}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setFerramentaSelecionada(null);
              setShowAgendar(true);
            }}
            className="border-amber-500 text-amber-600 hover:bg-amber-50"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Agendar Preventiva
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ferramenta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Data Prevista</TableHead>
              <TableHead>Data Realizada</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Custo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pedidosAgrupados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                  Nenhuma manutenção encontrada
                </TableCell>
              </TableRow>
            ) : (
              pedidosAgrupados.map(({ principal, extras, ferramentasList }) => {
                const TipoIcon = getTipoIcon(principal.tipo_manutencao);
                const atrasada = isAtrasada(principal);
                const totalFerramentas = ferramentasList.length;

                return (
                  <TableRow key={principal.id} className={atrasada ? "bg-red-50" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {atrasada && <AlertTriangle className="w-4 h-4 text-red-500" />}
                        <div>
                          {totalFerramentas > 1 ? (
                            <>
                              <p className="font-medium text-slate-900">
                                Pedido com {totalFerramentas} ferramentas
                              </p>
                              <div className="mt-1 space-y-0.5">
                                {ferramentasList.slice(0, 3).map((f, i) => (
                                  <p key={i} className="text-xs text-slate-500">
                                    {f.codigo && <span className="font-mono mr-1">{f.codigo}</span>}
                                    {f.descricao}
                                  </p>
                                ))}
                                {ferramentasList.length > 3 && (
                                  <p className="text-xs text-slate-400 italic">
                                    +{ferramentasList.length - 3} mais...
                                  </p>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="font-medium text-slate-900">
                                {principal.ferramenta_codigo}
                              </p>
                              <p className="text-sm text-slate-500">
                                {principal.ferramenta_descricao}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TipoIcon className="w-4 h-4 text-slate-400" />
                        <span className="text-sm">{principal.tipo_manutencao}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {principal.data_prevista ? (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span className="text-sm">
                            {new Date(principal.data_prevista).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {principal.data_manutencao
                        ? new Date(principal.data_manutencao).toLocaleDateString("pt-BR")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(principal.status)}>{principal.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {principal.custo > 0 ? `R$ ${principal.custo.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {principal.status === "Agendada" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs text-green-700 border-green-300 hover:bg-green-50"
                              onClick={() => {
                                handleAprovar(principal);
                                extras.forEach((e) =>
                                  sigo.entities.ManutencaoFerramenta.update(e.id, {
                                    status: "Em Andamento",
                                  })
                                );
                              }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Aprovar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs text-red-700 border-red-300 hover:bg-red-50"
                              onClick={() => handleReprovar(principal, extras)}
                            >
                              <X className="w-3.5 h-3.5 mr-1" />
                              Reprovar
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVisualizar(principal)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditar(principal, extras, ferramentasList)}
                        >
                          <Wrench className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Modais */}
      {showDetalhe && manutencaoSelecionada && (
        <ManutencaoDetalheModal
          open={showDetalhe}
          onOpenChange={setShowDetalhe}
          manutencao={manutencaoSelecionada}
          onEdit={() => {
            setShowDetalhe(false);
            setShowEditar(true);
          }}
        />
      )}

      {showEditar && manutencaoSelecionada && (
        <ManutencaoEditarModal
          open={showEditar}
          onOpenChange={setShowEditar}
          manutencao={manutencaoSelecionada}
          extras={extrasEditar}
          ferramentasList={ferramentasListEditar}
          onSave={() => {
            setManutencaoSelecionada(null);
            loadData();
          }}
        />
      )}

      {showAgendar && (
        <AgendarManutencaoModal
          open={showAgendar}
          onOpenChange={setShowAgendar}
          ferramenta={ferramentaSelecionada}
          onSave={loadData}
        />
      )}
    </div>
  );
}
