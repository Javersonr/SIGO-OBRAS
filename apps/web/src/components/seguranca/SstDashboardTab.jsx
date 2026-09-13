import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/api/sigoClient";
import { normalizarTexto } from "@/lib/busca";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  PenLine,
  FileSignature,
  RefreshCw,
  Search,
  HardHat,
} from "lucide-react";

/**
 * Dashboard SST — lê as tabelas sst_* alimentadas pelo sync da planilha
 * CONTROLE SST ELETRO.xlsx (sst-sync, a cada 10 min). Somente leitura:
 * a fonte da verdade continua sendo a planilha no OneDrive.
 *
 * Lê pelo cliente supabase direto (as tabelas sst_* não têm deleted_at,
 * então o wrapper de entidades do SDK não serve aqui).
 */

const CORES_ALERTA = {
  VENCIDO: "bg-red-100 text-red-700 border-red-200",
  "VENCE ≤30": "bg-amber-100 text-amber-700 border-amber-200",
  PENDENTE: "bg-orange-100 text-orange-700 border-orange-200",
  "SEM DATA": "bg-orange-100 text-orange-700 border-orange-200",
  "SEM ASSINATURA": "bg-sky-100 text-sky-700 border-sky-200",
  "PRESENÇA PENDENTE": "bg-sky-100 text-sky-700 border-sky-200",
  OK: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const PESO_ALERTA = {
  VENCIDO: 0,
  "VENCE ≤30": 1,
  PENDENTE: 2,
  "SEM DATA": 3,
  "SEM ASSINATURA": 4,
  "PRESENÇA PENDENTE": 5,
  OK: 9,
};

const fmtData = (iso) => {
  if (!iso) return "—";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : "—";
};

function BadgeAlerta({ alerta }) {
  if (!alerta) return null;
  return (
    <Badge variant="outline" className={CORES_ALERTA[alerta] || "bg-slate-100 text-slate-600"}>
      {alerta}
    </Badge>
  );
}

function KpiCard({ icone: Icone, rotulo, valor, tom }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`rounded-lg p-2 ${tom.fundo}`}>
          <Icone className={`w-5 h-5 ${tom.icone}`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800 leading-none">{valor}</p>
          <p className="text-xs text-slate-500 mt-1">{rotulo}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SstDashboardTab({ empresaAtiva }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [colabs, setColabs] = useState([]);
  const [treins, setTreins] = useState([]);
  const [exames, setExames] = useState([]);
  const [ultimoSync, setUltimoSync] = useState(null);
  const [busca, setBusca] = useState("");
  const [equipe, setEquipe] = useState("todas");

  useEffect(() => {
    if (!empresaAtiva?.id || !supabase) return;
    let ativo = true;
    (async () => {
      setCarregando(true);
      setErro(null);
      try {
        const q = (tabela, ordem) =>
          supabase
            .from(tabela)
            .select("*")
            .eq("empresa_id", empresaAtiva.id)
            .order(ordem, { ascending: true })
            .limit(3000);
        const [c, t, e, l] = await Promise.all([
          q("sst_colaborador", "numero"),
          q("sst_treinamento_colab", "linha_planilha"),
          q("sst_exame_colab", "linha_planilha"),
          supabase
            .from("sst_sync_log")
            .select("finalizado_em")
            .eq("empresa_id", empresaAtiva.id)
            .eq("ok", true)
            .order("id", { ascending: false })
            .limit(1),
        ]);
        const falha = c.error || t.error || e.error;
        if (falha) throw falha;
        if (!ativo) return;
        setColabs(c.data || []);
        setTreins(t.data || []);
        setExames(e.data || []);
        setUltimoSync(l.data?.[0]?.finalizado_em || null);
      } catch (err) {
        if (ativo) setErro(err?.message || String(err));
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [empresaAtiva?.id]);

  const equipes = useMemo(
    () => [...new Set(colabs.map((c) => c.equipe).filter(Boolean))].sort(),
    [colabs]
  );

  const filtrar = (lista) =>
    lista.filter(
      (item) =>
        (equipe === "todas" || item.equipe === equipe) &&
        (!busca || normalizarTexto(item.nome).includes(normalizarTexto(busca)))
    );

  const colabsVisiveis = useMemo(
    () => filtrar(colabs.filter((c) => c.status !== "INATIVO")),
    [colabs, busca, equipe]
  );

  // Alertas (treinamentos + exames) que precisam de ação, ordenados por gravidade
  const alertas = useMemo(() => {
    const doTreino = filtrar(treins)
      .filter((t) => t.alerta && t.alerta !== "OK")
      .map((t) => ({
        tipo: "Treinamento",
        nome: t.nome,
        equipe: t.equipe,
        item: t.treinamento || t.codigo,
        vencimento: t.vencimento,
        dias: t.dias_restantes,
        alerta: t.alerta,
      }));
    const doExame = filtrar(exames)
      .filter((e) => e.alerta && e.alerta !== "OK")
      .map((e) => ({
        tipo: "Exame",
        nome: e.nome,
        equipe: e.equipe,
        item: e.exame,
        vencimento: e.vencimento,
        dias: e.dias_restantes,
        alerta: e.alerta,
      }));
    return [...doTreino, ...doExame].sort(
      (a, b) =>
        (PESO_ALERTA[a.alerta] ?? 8) - (PESO_ALERTA[b.alerta] ?? 8) ||
        (a.dias ?? 9999) - (b.dias ?? 9999)
    );
  }, [treins, exames, busca, equipe]);

  const kpi = useMemo(() => {
    const conta = (lista, alvo) => lista.filter((x) => x.alerta === alvo).length;
    const tv = filtrar(treins);
    const ev = filtrar(exames);
    return {
      ativos: colabsVisiveis.length,
      vencidos: conta(tv, "VENCIDO") + conta(ev, "VENCIDO"),
      vence30: conta(tv, "VENCE ≤30") + conta(ev, "VENCE ≤30"),
      pendentes: conta(tv, "PENDENTE") + conta(tv, "SEM DATA") + conta(ev, "PENDENTE"),
      semAssinatura: conta(tv, "SEM ASSINATURA"),
      presencaPendente: conta(tv, "PRESENÇA PENDENTE"),
    };
  }, [colabsVisiveis, treins, exames, busca, equipe]);

  if (!supabase) return null;

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
        <RefreshCw className="w-4 h-4 animate-spin" /> Carregando painel SST...
      </div>
    );
  }

  if (erro) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-red-600">
          Erro ao carregar o painel SST: {erro}
        </CardContent>
      </Card>
    );
  }

  if (colabs.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center space-y-2">
          <HardHat className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-slate-600 font-medium">
            Nenhum dado SST sincronizado para esta empresa.
          </p>
          <p className="text-sm text-slate-500">
            O painel é alimentado pela planilha CONTROLE SST (OneDrive) via sincronização
            automática. Hoje a integração está ativa para a Eletro e Energia.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icone={Users}
          rotulo="Colaboradores ativos"
          valor={kpi.ativos}
          tom={{ fundo: "bg-slate-100", icone: "text-slate-600" }}
        />
        <KpiCard
          icone={AlertTriangle}
          rotulo="Vencidos"
          valor={kpi.vencidos}
          tom={{ fundo: "bg-red-100", icone: "text-red-600" }}
        />
        <KpiCard
          icone={CalendarClock}
          rotulo="Vencem em ≤30 dias"
          valor={kpi.vence30}
          tom={{ fundo: "bg-amber-100", icone: "text-amber-600" }}
        />
        <KpiCard
          icone={ClipboardList}
          rotulo="Pendentes"
          valor={kpi.pendentes}
          tom={{ fundo: "bg-orange-100", icone: "text-orange-600" }}
        />
        <KpiCard
          icone={FileSignature}
          rotulo="Sem assinatura"
          valor={kpi.semAssinatura}
          tom={{ fundo: "bg-sky-100", icone: "text-sky-600" }}
        />
        <KpiCard
          icone={PenLine}
          rotulo="Presença pendente"
          valor={kpi.presencaPendente}
          tom={{ fundo: "bg-sky-100", icone: "text-sky-600" }}
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar colaborador..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={equipe} onValueChange={setEquipe}>
          <SelectTrigger className="w-full md:w-56">
            <SelectValue placeholder="Equipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as equipes</SelectItem>
            {equipes.map((eq) => (
              <SelectItem key={eq} value={eq}>
                {eq}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Colaboradores */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Situação por colaborador</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3 font-medium">Nº</th>
                <th className="py-2 pr-3 font-medium">Nome</th>
                <th className="py-2 pr-3 font-medium">Função</th>
                <th className="py-2 pr-3 font-medium">Equipe</th>
                <th className="py-2 pr-3 font-medium">ASO</th>
                <th className="py-2 pr-3 font-medium text-center">Vencidos</th>
                <th className="py-2 pr-3 font-medium text-center">≤30 dias</th>
                <th className="py-2 pr-3 font-medium text-center">Pendências</th>
                <th className="py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {colabsVisiveis.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-2 pr-3 text-slate-500">{c.numero}</td>
                  <td className="py-2 pr-3 font-medium text-slate-800">{c.nome}</td>
                  <td className="py-2 pr-3 text-slate-600">{c.funcao}</td>
                  <td className="py-2 pr-3 text-slate-600">{c.equipe}</td>
                  <td className="py-2 pr-3 text-slate-600">{fmtData(c.data_aso)}</td>
                  <td
                    className={`py-2 pr-3 text-center font-semibold ${c.vencidos > 0 ? "text-red-600" : "text-slate-400"}`}
                  >
                    {c.vencidos ?? 0}
                  </td>
                  <td
                    className={`py-2 pr-3 text-center font-semibold ${c.vence_30 > 0 ? "text-amber-600" : "text-slate-400"}`}
                  >
                    {c.vence_30 ?? 0}
                  </td>
                  <td
                    className={`py-2 pr-3 text-center font-semibold ${c.pendencias > 0 ? "text-orange-600" : "text-slate-400"}`}
                  >
                    {c.pendencias ?? 0}
                  </td>
                  <td className="py-2">
                    <BadgeAlerta
                      alerta={
                        c.vencidos > 0
                          ? "VENCIDO"
                          : c.vence_30 > 0
                            ? "VENCE ≤30"
                            : c.pendencias > 0
                              ? "PENDENTE"
                              : "OK"
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Alertas detalhados */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Itens que precisam de ação ({alertas.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {alertas.length === 0 ? (
            <p className="text-sm text-emerald-600 py-4">
              Tudo em dia para o filtro selecionado. ✅
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-3 font-medium">Colaborador</th>
                  <th className="py-2 pr-3 font-medium">Equipe</th>
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Vencimento</th>
                  <th className="py-2 pr-3 font-medium text-center">Dias</th>
                  <th className="py-2 font-medium">Alerta</th>
                </tr>
              </thead>
              <tbody>
                {alertas.map((a, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-2 pr-3 font-medium text-slate-800">{a.nome}</td>
                    <td className="py-2 pr-3 text-slate-600">{a.equipe}</td>
                    <td className="py-2 pr-3 text-slate-600">{a.tipo}</td>
                    <td className="py-2 pr-3 text-slate-600">{a.item}</td>
                    <td className="py-2 pr-3 text-slate-600">{fmtData(a.vencimento)}</td>
                    <td
                      className={`py-2 pr-3 text-center font-semibold ${
                        a.dias != null && a.dias < 0 ? "text-red-600" : "text-slate-600"
                      }`}
                    >
                      {a.dias ?? "—"}
                    </td>
                    <td className="py-2">
                      <BadgeAlerta alerta={a.alerta} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400">
        Fonte: planilha CONTROLE SST (OneDrive), sincronizada automaticamente
        {ultimoSync ? ` — último sync ${new Date(ultimoSync).toLocaleString("pt-BR")}` : ""}.
      </p>
    </div>
  );
}
