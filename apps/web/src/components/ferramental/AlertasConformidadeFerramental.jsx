import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  User,
  Truck,
  FileWarning,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export default function AlertasConformidadeFerramental({ empresaAtiva, compact = false }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [expandidos, setExpandidos] = useState({});

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    load();
  }, [empresaAtiva?.id]);

  const load = async () => {
    setLoading(true);
    try {
      const [funcionarios, caminhoes, laudos, funcoes, ferramentas] = await Promise.all([
        sigo.entities.Funcionario.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Caminhao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.LaudoFerramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Funcao.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ]);

      // --- LAUDOS SEM ARQUIVO ---
      // Laudos de funcionários sem foto_laudo_url
      const laudosFuncIds = new Set(
        laudos.filter((l) => l.foto_laudo_url && l.funcionario_id).map((l) => l.funcionario_id)
      );
      const funcsSemLaudo = funcionarios.filter((f) => !laudosFuncIds.has(f.id));

      // Laudos de caminhões sem foto_laudo_url
      const laudosCamIds = new Set(
        laudos.filter((l) => l.foto_laudo_url && l.caminhao_id).map((l) => l.caminhao_id)
      );
      const caminhoeSemLaudo = caminhoes.filter((c) => !laudosCamIds.has(c.id));

      // --- FERRAMENTAS FALTANDO POR FUNÇÃO ---
      const funcaoMap = {};
      funcoes.forEach((f) => {
        const itens = safeParseJSON(f.modelo_ferramentas, []);
        if (itens.length > 0) funcaoMap[f.id] = { nome: f.nome, itens };
      });

      // Ferramentas por funcionário (verificar entidades Ferramenta com funcionario_id)
      const ferramentasPorFunc = {};
      ferramentas.forEach((ferr) => {
        if (ferr.funcionario_id) {
          if (!ferramentasPorFunc[ferr.funcionario_id])
            ferramentasPorFunc[ferr.funcionario_id] = [];
          ferramentasPorFunc[ferr.funcionario_id].push(ferr);
        }
      });

      const funcsFaltandoFerramentas = [];
      funcionarios.forEach((func) => {
        if (!func.funcao_id || !funcaoMap[func.funcao_id]) return;
        const { nome: nomeFuncao, itens } = funcaoMap[func.funcao_id];
        const ferrFunc = ferramentasPorFunc[func.id] || [];
        const ferrDescricoes = ferrFunc.map((f) => (f.descricao || "").toLowerCase().trim());

        const faltando = itens.filter((item) => {
          const descItem = (item.ferramenta || item.descricao || "").toLowerCase().trim();
          if (!descItem) return false;
          return !ferrDescricoes.some((d) => d.includes(descItem) || descItem.includes(d));
        });

        if (faltando.length > 0) {
          funcsFaltandoFerramentas.push({
            funcionario: func.nome_completo,
            funcao: nomeFuncao,
            faltando: faltando.map((i) => i.ferramenta || i.descricao),
          });
        }
      });

      setData({ funcsSemLaudo, caminhoeSemLaudo, funcsFaltandoFerramentas });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key) => setExpandidos((prev) => ({ ...prev, [key]: !prev[key] }));

  if (loading) return <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />;
  if (!data) return null;

  const totalAlertas =
    data.funcsSemLaudo.length + data.caminhoeSemLaudo.length + data.funcsFaltandoFerramentas.length;

  if (totalAlertas === 0) {
    return (
      <Card className="border-green-300">
        <CardContent className="p-4 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-green-500" />
          <span className="text-sm text-green-700 font-medium">
            Conformidade OK — Nenhum alerta de laudo ou ferramentas obrigatórias
          </span>
        </CardContent>
      </Card>
    );
  }

  const sections = [
    {
      key: "funcsSemLaudo",
      icon: <User className="w-4 h-4 text-red-500" />,
      titulo: `Funcionários sem laudo anexado`,
      count: data.funcsSemLaudo.length,
      cor: "red",
      itens: data.funcsSemLaudo.map((f) => f.nome_completo),
    },
    {
      key: "caminhoeSemLaudo",
      icon: <Truck className="w-4 h-4 text-orange-500" />,
      titulo: `Caminhões sem laudo anexado`,
      count: data.caminhoeSemLaudo.length,
      cor: "orange",
      itens: data.caminhoeSemLaudo.map((c) => `${c.placa}${c.modelo ? ` — ${c.modelo}` : ""}`),
    },
    {
      key: "funcsFaltando",
      icon: <FileWarning className="w-4 h-4 text-yellow-500" />,
      titulo: `Funcionários com ferramentas obrigatórias faltando`,
      count: data.funcsFaltandoFerramentas.length,
      cor: "yellow",
      itens: data.funcsFaltandoFerramentas.map(
        (f) => `${f.funcionario} (${f.funcao}): falta ${f.faltando.join(", ")}`
      ),
    },
  ].filter((s) => s.count > 0);

  const corMap = {
    red: {
      bg: "bg-red-50",
      border: "border-red-200",
      badge: "bg-red-100 text-red-700",
      text: "text-red-800",
      sub: "text-red-600",
    },
    orange: {
      bg: "bg-orange-50",
      border: "border-orange-200",
      badge: "bg-orange-100 text-orange-700",
      text: "text-orange-800",
      sub: "text-orange-600",
    },
    yellow: {
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      badge: "bg-yellow-100 text-yellow-700",
      text: "text-yellow-800",
      sub: "text-yellow-600",
    },
  };

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          Alertas de Conformidade
          <Badge className="bg-red-100 text-red-700 border-red-200 ml-auto">
            {totalAlertas} pendências
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {sections.map((sec) => {
          const c = corMap[sec.cor];
          const expanded = expandidos[sec.key];
          return (
            <div key={sec.key} className={`rounded border ${c.border} ${c.bg}`}>
              <button
                className="w-full flex items-center justify-between p-2.5 text-left"
                onClick={() => toggle(sec.key)}
              >
                <div className="flex items-center gap-2">
                  {sec.icon}
                  <span className={`text-xs font-medium ${c.text}`}>{sec.titulo}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`${c.badge} text-xs`}>{sec.count}</Badge>
                  {expanded ? (
                    <ChevronUp className="w-3 h-3 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  )}
                </div>
              </button>
              {expanded && (
                <div className={`px-3 pb-2 space-y-1 border-t ${c.border}`}>
                  {sec.itens.map((item, i) => (
                    <p key={i} className={`text-xs ${c.sub} py-0.5`}>
                      • {item}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
