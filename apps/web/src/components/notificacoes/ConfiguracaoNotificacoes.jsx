import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../../Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  Mail,
  Package,
  FolderKanban,
  DollarSign,
  Target,
  Save,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const ALERTAS = [
  {
    key: "estoque_baixo",
    icon: Package,
    cor: "text-orange-600 bg-orange-50",
    label: "Estoque Baixo",
    desc: "Quando materiais atingem o estoque mínimo",
    perfis: ["Admin", "Estoque", "Compras"],
  },
  {
    key: "projetos_atrasados",
    icon: FolderKanban,
    cor: "text-red-600 bg-red-50",
    label: "Projetos Atrasados",
    desc: "Quando a data prevista de conclusão é ultrapassada",
    perfis: ["Admin"],
  },
  {
    key: "contas_vencer",
    icon: DollarSign,
    cor: "text-blue-600 bg-blue-50",
    label: "Contas a Vencer",
    desc: "Contas vencidas ou vencendo nos próximos 7 dias",
    perfis: ["Admin", "Financeiro"],
  },
  {
    key: "oportunidades_quentes",
    icon: Target,
    cor: "text-green-600 bg-green-50",
    label: "Oportunidades Quentes",
    desc: "Oportunidades com alta probabilidade ou fechamento em 3 dias",
    perfis: ["Admin", "Gestor"],
  },
];

const DEFAULT_PREFS = {
  estoque_baixo: { app: true, email: false },
  projetos_atrasados: { app: true, email: false },
  contas_vencer: { app: true, email: false },
  oportunidades_quentes: { app: true, email: false },
};

export default function ConfiguracaoNotificacoes() {
  const { empresaAtiva, user, perfil } = useEmpresa();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [prefId, setPrefId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disparando, setDisparando] = useState(null);

  useEffect(() => {
    if (empresaAtiva && user) loadPrefs();
  }, [empresaAtiva?.id, user?.email]);

  const loadPrefs = async () => {
    setLoading(true);
    try {
      const result = await sigo.entities.PreferenciaNotificacao.filter({
        empresa_id: empresaAtiva.id,
        usuario_email: user.email,
      });
      if (result.length > 0) {
        setPrefId(result[0].id);
        try {
          setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(result[0].preferencias || "{}") });
        } catch {
          setPrefs(DEFAULT_PREFS);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const salvar = async () => {
    setSaving(true);
    try {
      const data = {
        empresa_id: empresaAtiva.id,
        usuario_email: user.email,
        preferencias: JSON.stringify(prefs),
        ativo: true,
      };
      if (prefId) {
        await sigo.entities.PreferenciaNotificacao.update(prefId, data);
      } else {
        const novo = await sigo.entities.PreferenciaNotificacao.create(data);
        setPrefId(novo.id);
      }
      toast.success("Preferências salvas com sucesso!");
    } catch (e) {
      toast.error("Erro ao salvar preferências");
    } finally {
      setSaving(false);
    }
  };

  const disparar = async (tipo) => {
    setDisparando(tipo);
    try {
      const resp = await sigo.functions.invoke("dispararAlertas", {
        empresa_id: empresaAtiva.id,
        tipo,
      });
      const data = resp.data;
      toast.success(
        `Alertas disparados! ${data.notificacoes_criadas || 0} notificação(ões) criada(s), ${data.emails_enviados || 0} email(s) enviado(s).`
      );
    } catch (e) {
      toast.error("Erro ao disparar alertas: " + e.message);
    } finally {
      setDisparando(null);
    }
  };

  const toggle = (key, canal) => {
    setPrefs((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [canal]: !prev[key]?.[canal] },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Configuração de Notificações</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Escolha como deseja ser notificado para cada tipo de alerta
          </p>
        </div>
        <Button onClick={salvar} disabled={saving} className="bg-amber-500 hover:bg-amber-600">
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Salvar Preferências
        </Button>
      </div>

      {/* Legenda de canais */}
      <div className="flex items-center gap-6 p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
        <div className="flex items-center gap-2 text-slate-600">
          <Bell className="w-4 h-4 text-amber-500" />
          <span>
            <strong>App</strong>: Notificação no sistema
          </span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <Mail className="w-4 h-4 text-blue-500" />
          <span>
            <strong>E-mail</strong>: Notificação por e-mail
          </span>
        </div>
      </div>

      {/* Cards de alertas */}
      <div className="grid gap-4">
        {ALERTAS.map((alerta) => {
          const Icon = alerta.icon;
          const pref = prefs[alerta.key] || { app: true, email: false };
          const isDisparando = disparando === alerta.key;
          const temAcesso = perfil === "Admin" || alerta.perfis.includes(perfil);

          return (
            <Card key={alerta.key} className={!temAcesso ? "opacity-50" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${alerta.cor}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800 text-sm">{alerta.label}</p>
                        {!temAcesso && (
                          <Badge variant="outline" className="text-xs">
                            Sem permissão
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{alerta.desc}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Para perfis: {alerta.perfis.join(", ")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* App */}
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Bell className="w-3.5 h-3.5" />
                        <span>App</span>
                      </div>
                      <Switch
                        checked={pref.app !== false}
                        onCheckedChange={() => toggle(alerta.key, "app")}
                        disabled={!temAcesso}
                      />
                    </div>

                    {/* Email */}
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Mail className="w-3.5 h-3.5" />
                        <span>E-mail</span>
                      </div>
                      <Switch
                        checked={pref.email === true}
                        onCheckedChange={() => toggle(alerta.key, "email")}
                        disabled={!temAcesso}
                      />
                    </div>

                    {/* Disparar manualmente */}
                    {perfil === "Admin" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disparar(alerta.key)}
                        disabled={isDisparando}
                        className="text-xs"
                        title="Disparar alerta agora"
                      >
                        {isDisparando ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Disparar todos (admin only) */}
      {perfil === "Admin" && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-amber-800 text-sm">Verificação Manual Completa</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Disparar todos os alertas agora para todos os usuários da empresa
                </p>
              </div>
              <Button
                onClick={() => disparar("todos")}
                disabled={!!disparando}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                {disparando === "todos" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verificando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" /> Verificar Tudo Agora
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
