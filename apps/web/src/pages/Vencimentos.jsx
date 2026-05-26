import React, { useState, useEffect, useContext } from "react";
import { base44 } from "@/api/base44Client";
import { EmpresaContext } from "../Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Search,
  Bell,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";
import VencimentoCard from "../components/vencimentos/VencimentoCard";
import VencimentoModal from "../components/vencimentos/VencimentoModal";

const FILTROS_STATUS = ["Todos", "Vencido", "A Vencer", "OK"];
const FILTROS_PRAZO = ["Todos", "Hoje", "7 dias", "15 dias", "30 dias", "60 dias"];

function atualizarStatus(v) {
  const diff = differenceInDays(new Date(v.data_vencimento + "T00:00:00"), new Date());
  if (diff < 0) return { ...v, status: "Vencido" };
  if (diff <= (v.alerta_dias || 30)) return { ...v, status: "A Vencer" };
  return { ...v, status: "OK" };
}

export default function Vencimentos() {
  const { empresaAtiva, empresas, perfil, vinculo } = useContext(EmpresaContext);
  const [vencimentos, setVencimentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [filtroTipo, setFiltroTipo] = useState("Todos");
  const [filtroPrazo, setFiltroPrazo] = useState("Todos");
  const [filtroEmpresa, setFiltroEmpresa] = useState("Todos");
  const [showModal, setShowModal] = useState(false);
  const [vencimentoEditando, setVencimentoEditando] = useState(null);
  const [estatisticasGrupo, setEstatisticasGrupo] = useState(null);

  // Determinar se é Admin Holding: verificar sessonStorage ou contexto
  const customAuth = JSON.parse(sessionStorage.getItem("custom_auth") || "{}");
  const grupoIdAuth = customAuth.grupo_id;
  const grupoIdVinculo = vinculo?.grupo_id;
  const isAdminHolding =
    (perfil === "Admin Holding" && (grupoIdVinculo || grupoIdAuth)) || !!grupoIdAuth;

  const loadData = async () => {
    if (!empresaAtiva && !isAdminHolding) return;
    setLoading(true);
    try {
      let todos = [];
      let grupoId = null;

      // Admin Holding: busca de todas as empresas do grupo
      if (isAdminHolding) {
        grupoId = grupoIdAuth || grupoIdVinculo;
        console.log("[Vencimentos] Admin Holding detectado, grupo_id:", grupoId);
        const todasEmpresas = await base44.entities.Empresa.filter({
          grupo_id: grupoId,
          ativo: true,
        });
        const results = await Promise.all(
          todasEmpresas.map((e) =>
            base44.entities.Vencimento.filter({ empresa_id: e.id, ativo: true })
          )
        );
        todos = results.flat();

        // Calcular estatísticas por empresa
        const stats = todasEmpresas
          .map((emp) => {
            const vencsDaEmpresa = todos.filter((v) => v.empresa_id === emp.id);
            return {
              empresa_nome: emp.nome_fantasia || emp.nome,
              total: vencsDaEmpresa.length,
              vencidos: vencsDaEmpresa.filter(
                (v) => differenceInDays(new Date(v.data_vencimento + "T00:00:00"), new Date()) < 0
              ).length,
              aVencer: vencsDaEmpresa.filter((v) => {
                const diff = differenceInDays(
                  new Date(v.data_vencimento + "T00:00:00"),
                  new Date()
                );
                return diff >= 0 && diff <= (v.alerta_dias || 30);
              }).length,
            };
          })
          .filter((s) => s.total > 0);

        setEstatisticasGrupo(stats);
      } else {
        // Usuário normal: busca só da empresa ativa ou do grupo se houver
        if (empresaAtiva.grupo_id && empresas?.length > 1) {
          const empresasDoGrupo = empresas.filter((e) => e.grupo_id === empresaAtiva.grupo_id);
          const results = await Promise.all(
            empresasDoGrupo.map((e) =>
              base44.entities.Vencimento.filter({ empresa_id: e.id, ativo: true })
            )
          );
          todos = results.flat();
        } else {
          todos = await base44.entities.Vencimento.filter({
            empresa_id: empresaAtiva.id,
            ativo: true,
          });
        }
        setEstatisticasGrupo(null);
      }

      setVencimentos(todos.map(atualizarStatus));
    } catch (error) {
      console.error("Erro ao carregar vencimentos:", error);
      toast.error("Erro ao carregar vencimentos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [empresaAtiva?.id, isAdminHolding, grupoIdAuth, grupoIdVinculo]);

  const handleNotificar = async (v) => {
    if (!v.responsavel_email) {
      toast.error("Responsável sem email cadastrado");
      return;
    }
    try {
      await base44.integrations.Core.SendEmail({
        to: v.responsavel_email,
        subject: `⚠️ Vencimento próximo: ${v.titulo}`,
        body: `Olá ${v.responsavel_nome || ""},\n\nO documento "${v.titulo}" da empresa ${v.empresa_nome} vence em ${v.data_vencimento}.\n\nStatus: ${v.status}\n\nPor favor, providencie a renovação.\n\nSIGO Obras`,
      });
      toast.success(`Notificação enviada para ${v.responsavel_email}`);
    } catch {
      toast.error("Erro ao enviar notificação");
    }
  };

  const handleVerDocumento = (v) => window.open(v.arquivo_url, "_blank");

  // Filtros
  const vencimentosFiltrados = vencimentos.filter((v) => {
    if (filtroStatus !== "Todos" && v.status !== filtroStatus) return false;
    if (filtroTipo !== "Todos" && v.tipo !== filtroTipo) return false;
    if (filtroEmpresa !== "Todos" && v.empresa_id !== filtroEmpresa) return false;
    if (
      busca &&
      !v.titulo?.toLowerCase().includes(busca.toLowerCase()) &&
      !v.tipo?.toLowerCase().includes(busca.toLowerCase())
    )
      return false;
    if (filtroPrazo !== "Todos") {
      const diff = differenceInDays(new Date(v.data_vencimento + "T00:00:00"), new Date());
      const limites = { Hoje: 0, "7 dias": 7, "15 dias": 15, "30 dias": 30, "60 dias": 60 };
      if (diff > limites[filtroPrazo] || diff < 0) return false;
    }
    return true;
  });

  // Resumo
  const vencidos = vencimentos.filter((v) => v.status === "Vencido").length;
  const aVencer = vencimentos.filter((v) => v.status === "A Vencer").length;
  const ok = vencimentos.filter((v) => v.status === "OK").length;

  const tipos = ["Todos", ...new Set(vencimentos.map((v) => v.tipo))];
  const mostrarFiltroEmpresa =
    empresaAtiva?.grupo_id &&
    empresas?.filter((e) => e.grupo_id === empresaAtiva.grupo_id).length > 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard de Vencimentos</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAdminHolding
              ? "📊 Visão consolidada do grupo empresarial"
              : empresaAtiva?.grupo_id
                ? "Visão consolidada do grupo empresarial"
                : `Empresa: ${empresaAtiva?.nome}`}
          </p>
        </div>
        {!isAdminHolding && (
          <Button
            onClick={() => {
              setVencimentoEditando(null);
              setShowModal(true);
            }}
            className="bg-amber-500 hover:bg-amber-600 gap-2"
          >
            <Plus className="w-4 h-4" /> Novo Vencimento
          </Button>
        )}
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold text-red-700">{vencidos}</p>
              <p className="text-sm text-red-600">Vencidos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-yellow-500 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold text-yellow-700">{aVencer}</p>
              <p className="text-sm text-yellow-600">A Vencer</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold text-green-700">{ok}</p>
              <p className="text-sm text-green-600">Em dia</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Estatísticas por empresa (Admin Holding) */}
      {isAdminHolding && estatisticasGrupo && estatisticasGrupo.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-5 h-5 text-amber-600" />
              <h3 className="font-semibold text-amber-900">Vencimentos por empresa</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {estatisticasGrupo.map((stat, idx) => (
                <div key={idx} className="bg-white rounded-lg p-2 border border-amber-100">
                  <p className="text-xs font-medium text-amber-900 truncate">{stat.empresa_nome}</p>
                  <div className="flex gap-2 mt-1 text-xs">
                    <span className="text-red-600">🔴 {stat.vencidos}</span>
                    <span className="text-yellow-600">🟡 {stat.aVencer}</span>
                    <span className="text-green-600">
                      ✓ {stat.total - stat.vencidos - stat.aVencer}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar vencimento..."
            className="pl-9"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTROS_STATUS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroPrazo} onValueChange={setFiltroPrazo}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTROS_PRAZO.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            {tipos.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(mostrarFiltroEmpresa || isAdminHolding) && (
          <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
            <SelectTrigger className="w-48">
              <Building2 className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todas as empresas</SelectItem>
              {isAdminHolding
                ? empresas
                    ?.filter((e) => e.grupo_id === vinculo.grupo_id)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome_fantasia || e.nome}
                      </SelectItem>
                    ))
                : empresas
                    .filter((e) => e.grupo_id === empresaAtiva.grupo_id)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome_fantasia || e.nome}
                      </SelectItem>
                    ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Carregando...</div>
      ) : vencimentosFiltrados.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl">
          <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Nenhum vencimento encontrado</p>
          <p className="text-slate-400 text-sm mt-1">
            Cadastre certidões, documentos e contratos para monitorar os vencimentos
          </p>
          {!isAdminHolding && (
            <Button
              onClick={() => {
                setVencimentoEditando(null);
                setShowModal(true);
              }}
              className="mt-4 bg-amber-500 hover:bg-amber-600 gap-2"
            >
              <Plus className="w-4 h-4" /> Cadastrar primeiro vencimento
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            {vencimentosFiltrados.length} vencimento(s) encontrado(s)
          </p>
          {/* Vencidos primeiro, depois A Vencer, depois OK */}
          {["Vencido", "A Vencer", "OK"].map((status) => {
            const grupo = vencimentosFiltrados.filter((v) => v.status === status);
            if (grupo.length === 0) return null;
            return (
              <div key={status}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-4">
                  {status} ({grupo.length})
                </h3>
                <div className="space-y-2">
                  {grupo.map((v) => (
                    <VencimentoCard
                      key={v.id}
                      vencimento={v}
                      onEdit={(venc) => {
                        setVencimentoEditando(venc);
                        setShowModal(true);
                      }}
                      onVerDocumento={handleVerDocumento}
                      onNotificar={handleNotificar}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isAdminHolding && (
        <VencimentoModal
          open={showModal}
          onOpenChange={setShowModal}
          vencimento={vencimentoEditando}
          empresaAtiva={empresaAtiva}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
