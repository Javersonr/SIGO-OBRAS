import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useEmpresa } from "@/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardCheck,
  Search,
  Calendar,
  User,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  Filter,
  FileText,
  Download,
  Send,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import InspecaoDetalheHistoricoModal from "@/components/ferramental/InspecaoDetalheHistoricoModal";

export default function HistoricoInspecoes() {
  const navigate = useNavigate();
  const { empresaAtiva } = useEmpresa();
  const [inspecoes, setInspecoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [caminhoes, setCaminhoes] = useState([]);
  const [filtros, setFiltros] = useState({
    status: "todos",
    caminhao: "todos",
    data_inicio: "",
    data_fim: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedInspecao, setSelectedInspecao] = useState(null);
  const [showDetalheModal, setShowDetalheModal] = useState(false);
  const [showRelatorioDialog, setShowRelatorioDialog] = useState(false);
  const [emailsDestino, setEmailsDestino] = useState("");
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);

  useEffect(() => {
    if (empresaAtiva) {
      loadInspecoes();
      loadCaminhoes();
    }
  }, [empresaAtiva]);

  const loadCaminhoes = async () => {
    try {
      const data = await base44.entities.Caminhao.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });
      setCaminhoes(data);
    } catch (error) {
      console.error("Erro ao carregar caminhões:", error);
    }
  };

  const loadInspecoes = async () => {
    try {
      setLoading(true);
      const filtro = { empresa_id: empresaAtiva.id };

      if (filtros.status !== "todos") {
        filtro.status = filtros.status;
      }

      if (filtros.caminhao !== "todos") {
        filtro.caminhao_id = filtros.caminhao;
      }

      if (filtros.data_inicio) {
        filtro.data_inspecao = { $gte: filtros.data_inicio };
      }

      if (filtros.data_fim) {
        filtro.data_inspecao = {
          ...filtro.data_inspecao,
          $lte: filtros.data_fim,
        };
      }

      const data = await base44.entities.InspecaoCaminhao.filter(filtro, "-data_inspecao");
      setInspecoes(data);
    } catch (error) {
      console.error("Erro ao carregar inspeções:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGerarRelatorio = async () => {
    if (!filtros.data_inicio || !filtros.data_fim) {
      toast.error("Selecione o período para o relatório");
      return;
    }

    setGerandoRelatorio(true);
    try {
      const response = await base44.functions.invoke("gerarRelatorioConsolidado", {
        empresa_id: empresaAtiva.id,
        data_inicio: filtros.data_inicio,
        data_fim: filtros.data_fim,
        caminhao_id: filtros.caminhao !== "todos" ? filtros.caminhao : null,
        status: filtros.status !== "todos" ? filtros.status : null,
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio_consolidado_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      toast.success("Relatório gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar relatório:", error);
      toast.error("Erro ao gerar relatório");
    } finally {
      setGerandoRelatorio(false);
    }
  };

  const handleEnviarRelatorio = async () => {
    if (!filtros.data_inicio || !filtros.data_fim) {
      toast.error("Selecione o período para o relatório");
      return;
    }

    if (!emailsDestino.trim()) {
      toast.error("Informe pelo menos um email");
      return;
    }

    const emails = emailsDestino
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e);
    if (emails.length === 0) {
      toast.error("Informe emails válidos");
      return;
    }

    setGerandoRelatorio(true);
    try {
      const response = await base44.functions.invoke("gerarRelatorioConsolidado", {
        empresa_id: empresaAtiva.id,
        data_inicio: filtros.data_inicio,
        data_fim: filtros.data_fim,
        caminhao_id: filtros.caminhao !== "todos" ? filtros.caminhao : null,
        status: filtros.status !== "todos" ? filtros.status : null,
        enviar_email: true,
        emails_destino: emails,
      });

      if (response.data.success) {
        toast.success(`Relatório enviado para ${response.data.emails_enviados} email(s)!`);
        setShowRelatorioDialog(false);
        setEmailsDestino("");
      } else {
        toast.error("Erro ao enviar emails");
      }
    } catch (error) {
      console.error("Erro ao enviar relatório:", error);
      toast.error("Erro ao enviar relatório por email");
    } finally {
      setGerandoRelatorio(false);
    }
  };

  useEffect(() => {
    if (empresaAtiva) {
      loadInspecoes();
    }
  }, [filtros]);

  const getStatusInfo = (inspecao) => {
    const ferramentas = JSON.parse(inspecao.ferramentas_inspecionadas || "[]");
    const totalItens = ferramentas.reduce((sum, f) => sum + f.itens.length, 0);
    const concluidos = ferramentas.reduce(
      (sum, f) => sum + f.itens.filter((i) => i.status_foto === "concluida").length,
      0
    );
    const falhados = ferramentas.reduce(
      (sum, f) => sum + f.itens.filter((i) => i.status_foto === "falhou").length,
      0
    );

    if (falhados > 0) {
      return {
        label: "Com Pendências",
        color: "bg-amber-100 text-amber-700",
        icon: AlertCircle,
      };
    }
    if (concluidos === totalItens) {
      return {
        label: "Concluída",
        color: "bg-green-100 text-green-700",
        icon: CheckCircle2,
      };
    }
    return {
      label: "Incompleta",
      color: "bg-slate-100 text-slate-700",
      icon: Clock,
    };
  };

  const filteredInspecoes = inspecoes.filter(
    (insp) =>
      insp.usuario_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      insp.caminhao_placa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      insp.caminhao_modelo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Carregando inspeções...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-3">
            <ClipboardCheck className="w-8 h-8 text-amber-600" />
            Histórico de Inspeções
          </h1>
          <p className="text-slate-600 mt-1">Visualize e analise todas as inspeções realizadas</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            Filtros
          </Button>
          <Button
            size="sm"
            onClick={() => setShowRelatorioDialog(true)}
            className="bg-amber-500 hover:bg-amber-600 gap-2"
            disabled={!filtros.data_inicio || !filtros.data_fim}
          >
            <FileText className="w-4 h-4" />
            Relatório PDF
          </Button>
        </div>
      </div>

      {/* Filtros */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Filtros de Pesquisa</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFiltros({
                    status: "todos",
                    caminhao: "todos",
                    data_inicio: "",
                    data_fim: "",
                  });
                }}
              >
                Limpar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label>Status</Label>
                <Select
                  value={filtros.status}
                  onValueChange={(value) => setFiltros({ ...filtros, status: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="reprovada">Reprovada</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Caminhão</Label>
                <Select
                  value={filtros.caminhao}
                  onValueChange={(value) => setFiltros({ ...filtros, caminhao: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {caminhoes.map((cam) => (
                      <SelectItem key={cam.id} value={cam.id}>
                        {cam.placa} - {cam.modelo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Data Início</Label>
                <Input
                  type="date"
                  value={filtros.data_inicio}
                  onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Data Fim</Label>
                <Input
                  type="date"
                  value={filtros.data_fim}
                  onChange={(e) => setFiltros({ ...filtros, data_fim: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Total de Inspeções</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-800">{inspecoes.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Concluídas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {inspecoes.filter((i) => i.status === "concluida").length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Reprovadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">
              {inspecoes.filter((i) => i.status === "reprovada").length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Em Andamento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">
              {inspecoes.filter((i) => i.status === "em_andamento").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por inspetor, placa ou modelo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Lista de Inspeções */}
      {filteredInspecoes.length === 0 ? (
        <Card className="p-12 text-center">
          <ClipboardCheck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 text-lg font-medium mb-2">
            {searchTerm ? "Nenhuma inspeção encontrada" : "Nenhuma inspeção concluída"}
          </p>
          <p className="text-slate-500 text-sm">
            {searchTerm ? "Tente outro termo de busca" : "As inspeções concluídas aparecerão aqui"}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredInspecoes.map((inspecao) => {
            const statusConfig =
              inspecao.status === "concluida"
                ? { label: "Concluída", color: "bg-green-100 text-green-700", icon: CheckCircle2 }
                : inspecao.status === "reprovada"
                  ? { label: "Reprovada", color: "bg-red-100 text-red-700", icon: AlertCircle }
                  : { label: "Em Andamento", color: "bg-amber-100 text-amber-700", icon: Clock };

            const StatusIcon = statusConfig.icon;

            return (
              <Card
                key={inspecao.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  setSelectedInspecao(inspecao);
                  setShowDetalheModal(true);
                }}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-500" />
                          <span className="font-semibold text-slate-800">
                            {inspecao.usuario_nome}
                          </span>
                        </div>
                        <Badge className={statusConfig.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig.label}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 flex-wrap text-sm text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(inspecao.data_inspecao), "dd 'de' MMMM 'de' yyyy", {
                            locale: ptBR,
                          })}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" />
                          {inspecao.caminhao_placa} - {inspecao.caminhao_modelo}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-slate-600">
                          <span className="font-semibold text-slate-800">
                            {inspecao.ferramentas_inspecionadas}
                          </span>{" "}
                          de{" "}
                          <span className="font-semibold text-slate-800">
                            {inspecao.total_ferramentas}
                          </span>{" "}
                          ferramentas inspecionadas
                        </span>
                      </div>
                    </div>

                    <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog Relatório */}
      {showRelatorioDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Gerar Relatório Consolidado</h3>
              <p className="text-sm text-slate-500 mt-1">Escolha como deseja receber o relatório</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Período:</strong>{" "}
                  {filtros.data_inicio && filtros.data_fim
                    ? `${new Date(filtros.data_inicio).toLocaleDateString("pt-BR")} a ${new Date(filtros.data_fim).toLocaleDateString("pt-BR")}`
                    : "Não definido"}
                </p>
                {filtros.caminhao !== "todos" && (
                  <p className="text-sm text-blue-800 mt-1">
                    <strong>Caminhão:</strong>{" "}
                    {caminhoes.find((c) => c.id === filtros.caminhao)?.placa}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="emails">Enviar por Email (opcional)</Label>
                <Input
                  id="emails"
                  placeholder="email1@exemplo.com, email2@exemplo.com"
                  value={emailsDestino}
                  onChange={(e) => setEmailsDestino(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-slate-500 mt-1">Separe múltiplos emails por vírgula</p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRelatorioDialog(false);
                  setEmailsDestino("");
                }}
                disabled={gerandoRelatorio}
              >
                Cancelar
              </Button>

              {emailsDestino.trim() ? (
                <Button
                  onClick={handleEnviarRelatorio}
                  disabled={gerandoRelatorio}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  {gerandoRelatorio ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Enviar Email
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleGerarRelatorio}
                  disabled={gerandoRelatorio}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  {gerandoRelatorio ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Baixar PDF
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalhe */}
      {selectedInspecao && (
        <InspecaoDetalheHistoricoModal
          open={showDetalheModal}
          onOpenChange={setShowDetalheModal}
          inspecao={selectedInspecao}
        />
      )}
    </div>
  );
}
