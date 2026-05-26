import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../../../Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, AlertTriangle, Clock, UserCheck, FileWarning, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function WidgetDashSeguranca({ onDadosCarregados }) {
  const { empresaAtiva } = useEmpresa();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    load();
  }, [empresaAtiva?.id]);

  const load = async () => {
    try {
      const funcionarios = await sigo.entities.Funcionario.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });

      const hoje = new Date();
      const em30Dias = new Date();
      em30Dias.setDate(em30Dias.getDate() + 30);
      const em90Dias = new Date();
      em90Dias.setDate(em90Dias.getDate() + 90);

      // Treinamentos/cursos próximos de vencer (data_vencimento nos próximos 30 dias)
      let cursosVencendo = 0,
        cursosVencidos = 0;
      let asoVencendo = 0,
        asoVencido = 0;
      let contratoVencendo90 = 0; // contratados nos últimos 90 dias (período de experiência)

      funcionarios.forEach((f) => {
        // ASO (data_aso ou data_exame_admissional)
        const dataAso = f.data_aso || f.data_exame_medico;
        if (dataAso) {
          const venc = new Date(dataAso);
          venc.setFullYear(venc.getFullYear() + 1); // ASO anual
          if (venc < hoje) asoVencido++;
          else if (venc <= em30Dias) asoVencendo++;
        }

        // Contrato de experiência (90 dias após admissão)
        const dataAdmissao = f.data_admissao;
        if (dataAdmissao) {
          const fim90 = new Date(dataAdmissao);
          fim90.setDate(fim90.getDate() + 90);
          if (fim90 >= hoje && fim90 <= em90Dias) contratoVencendo90++;
        }
      });

      // Treinamentos
      let treinamentos = [];
      try {
        treinamentos = await sigo.entities.Treinamento.filter({ empresa_id: empresaAtiva.id });
        treinamentos.forEach((t) => {
          if (!t.data_vencimento) return;
          const d = new Date(t.data_vencimento);
          if (d < hoje) cursosVencidos++;
          else if (d <= em30Dias) cursosVencendo++;
        });
      } catch {}

      // Inspeções (InspecaoCampo do mês atual)
      let inspecoesMes = 0;
      try {
        const inspecoes = await sigo.entities.InspecaoCampo.filter({ empresa_id: empresaAtiva.id });
        const mesAtual = hoje.getMonth();
        const anoAtual = hoje.getFullYear();
        inspecoesMes = inspecoes.filter((i) => {
          const d = new Date(i.created_date);
          return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
        }).length;
      } catch {}

      const d = {
        totalFuncionarios: funcionarios.length,
        cursosVencendo,
        cursosVencidos,
        asoVencendo,
        asoVencido,
        contratoVencendo90,
        inspecoesMes,
      };
      setData(d);
      onDadosCarregados?.(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />;
  if (!data) return null;

  const alertas = [
    { label: "ASO Vencidos", value: data.asoVencido, color: "red", icon: AlertTriangle },
    { label: "ASO Vencendo (30d)", value: data.asoVencendo, color: "yellow", icon: Clock },
    { label: "Cursos Vencidos", value: data.cursosVencidos, color: "red", icon: FileWarning },
    { label: "Cursos Vencendo (30d)", value: data.cursosVencendo, color: "yellow", icon: Calendar },
    {
      label: "Contrato 90d Vencendo",
      value: data.contratoVencendo90,
      color: "orange",
      icon: UserCheck,
    },
    { label: "Inspeções no Mês", value: data.inspecoesMes, color: "blue", icon: Shield },
  ];

  const colorMap = {
    red: {
      bg: "bg-red-50",
      text: "text-red-700",
      badge: "bg-red-100 text-red-700 border-red-200",
      icon: "text-red-500",
    },
    yellow: {
      bg: "bg-yellow-50",
      text: "text-yellow-700",
      badge: "bg-yellow-100 text-yellow-700 border-yellow-200",
      icon: "text-yellow-500",
    },
    orange: {
      bg: "bg-orange-50",
      text: "text-orange-700",
      badge: "bg-orange-100 text-orange-700 border-orange-200",
      icon: "text-orange-500",
    },
    blue: {
      bg: "bg-blue-50",
      text: "text-blue-700",
      badge: "bg-blue-100 text-blue-700 border-blue-200",
      icon: "text-blue-500",
    },
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-blue-500 sm:col-span-1">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Funcionários</p>
                <p className="text-2xl font-bold text-blue-600">{data.totalFuncionarios}</p>
              </div>
              <UserCheck className="w-8 h-8 text-blue-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">ativos</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">ASO Vencidos</p>
                <p className="text-2xl font-bold text-red-600">{data.asoVencido}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{data.asoVencendo} vencendo em 30d</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Contratos 90d</p>
                <p className="text-2xl font-bold text-orange-600">{data.contratoVencendo90}</p>
              </div>
              <Clock className="w-8 h-8 text-orange-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">vencendo em breve</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">Alertas de Segurança</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {alertas.map((a, i) => {
            const c = colorMap[a.color];
            const Icon = a.icon;
            return (
              <div key={i} className={`flex justify-between items-center p-2 rounded ${c.bg}`}>
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${c.icon}`} />
                  <span className={`text-xs font-medium ${c.text}`}>{a.label}</span>
                </div>
                <Badge className={c.badge}>{a.value}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
