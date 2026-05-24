import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '../Layout';
import { Target, FolderKanban, ShoppingCart, Package, Wrench, Shield, DollarSign, LayoutDashboard, CalendarDays, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Widgets por módulo
import WidgetDashOportunidades from '../components/dashboard/widgets/WidgetDashOportunidades';
import WidgetDashProjetos from '../components/dashboard/widgets/WidgetDashProjetos';
import WidgetDashCompras from '../components/dashboard/widgets/WidgetDashCompras';
import WidgetDashEstoque from '../components/dashboard/widgets/WidgetDashEstoque';
import WidgetDashFerramental from '../components/dashboard/widgets/WidgetDashFerramental';
import WidgetDashSeguranca from '../components/dashboard/widgets/WidgetDashSeguranca';
import WidgetDashFinanceiro from '../components/dashboard/widgets/WidgetDashFinanceiro';
import DashboardIAAnalise from '../components/dashboard/DashboardIAAnalise';
import CalendarioConsolidado from '../components/dashboard/CalendarioConsolidado';
import CalendarioFinanceiro from '../components/financeiro/CalendarioFinanceiro';
import AlertasVencimento from '../components/dashboard/AlertasVencimento';

const MODULOS = [
  { id: 'oportunidades', label: 'Oportunidades', icon: Target, modulo: 'Oportunidades', color: 'blue' },
  { id: 'projetos', label: 'Projetos', icon: FolderKanban, modulo: 'Projetos', color: 'indigo' },
  { id: 'compras', label: 'Compras', icon: ShoppingCart, modulo: 'Compras', color: 'orange' },
  { id: 'estoque', label: 'Estoque', icon: Package, modulo: 'Estoque', color: 'purple' },
  { id: 'ferramental', label: 'Ferramental', icon: Wrench, modulo: 'Ferramental e EPI', color: 'yellow' },
  { id: 'seguranca', label: 'Segurança', icon: Shield, modulo: 'Segurança do Trabalho', color: 'red' },
  { id: 'financeiro', label: 'Financeiro', icon: DollarSign, modulo: 'Financeiro', color: 'green' },
];

const WIDGET_MAP = {
  oportunidades: WidgetDashOportunidades,
  projetos: WidgetDashProjetos,
  compras: WidgetDashCompras,
  estoque: WidgetDashEstoque,
  ferramental: WidgetDashFerramental,
  seguranca: WidgetDashSeguranca,
  financeiro: WidgetDashFinanceiro,
};

const colorVariants = {
  blue: 'bg-blue-500 hover:bg-blue-600 border-blue-500',
  indigo: 'bg-indigo-500 hover:bg-indigo-600 border-indigo-500',
  orange: 'bg-orange-500 hover:bg-orange-600 border-orange-500',
  purple: 'bg-purple-500 hover:bg-purple-600 border-purple-500',
  yellow: 'bg-yellow-500 hover:bg-yellow-600 border-yellow-500',
  red: 'bg-red-500 hover:bg-red-600 border-red-500',
  green: 'bg-green-500 hover:bg-green-600 border-green-500',
};

const colorActiveVariants = {
  blue: 'ring-blue-500',
  indigo: 'ring-indigo-500',
  orange: 'ring-orange-500',
  purple: 'ring-purple-500',
  yellow: 'ring-yellow-500',
  red: 'ring-red-500',
  green: 'ring-green-500',
};

export default function Dashboard() {
  const { empresaAtiva, user, perfil, temPermissao, vinculo } = useEmpresa();
  const [moduloAtivo, setModuloAtivo] = useState(null);
  const [modulosLiberados, setModulosLiberados] = useState({});
  const [loading, setLoading] = useState(true);
  const [dadosIA, setDadosIA] = useState(null);
  const [calendarioVisivel, setCalendarioVisivel] = useState(true);
  const [calendarioFinanceiroVisivel, setCalendarioFinanceiroVisivel] = useState(true);

  const permissoes = useMemo(() => {
    try { return vinculo?.permissoes ? JSON.parse(vinculo.permissoes) : {}; } catch { return {}; }
  }, [vinculo?.permissoes]);
  const temPermissoesGranulares = Object.keys(permissoes).length > 0;

  useEffect(() => {
    if (empresaAtiva?.id) loadModulos();
    else setLoading(false);
  }, [empresaAtiva?.id]);

  const loadModulos = async () => {
    try {
      const assinaturas = await base44.entities.Assinatura.filter({ empresa_id: empresaAtiva.id });
      const ativas = assinaturas.filter(a => a.status === 'Ativa' || a.status === 'Trial');
      let modulos = {};
      if (ativas.length > 0) {
        const planos = await base44.entities.Plano.filter({ id: ativas[0].plano_id });
        if (planos.length > 0 && planos[0].modulos_liberados) {
          try { modulos = JSON.parse(planos[0].modulos_liberados); } catch {}
        }
      }
      setModulosLiberados(modulos);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const modulosVisiveis = useMemo(() => {
    return MODULOS.filter(m => {
      // Admin vê tudo que está contratado
      if (perfil === 'Admin' || vinculo?.is_owner) return modulosLiberados[m.modulo] === true;
      // Financeiro: só admin ou sem granular
      if (m.id === 'financeiro') {
        if (!modulosLiberados[m.modulo]) return false;
        if (perfil === 'Admin') return true;
        return temPermissao('Financeiro') && !temPermissoesGranulares;
      }
      // Verificar módulo contratado e permissão
      if (!modulosLiberados[m.modulo]) return false;
      return perfil === 'Admin' || temPermissao(m.modulo);
    });
  }, [modulosLiberados, perfil, vinculo, temPermissao, temPermissoesGranulares]);

  // Seleciona o primeiro módulo disponível automaticamente
  useEffect(() => {
    if (!loading && modulosVisiveis.length > 0 && !moduloAtivo) {
      setModuloAtivo(modulosVisiveis[0].id);
    }
  }, [loading, modulosVisiveis]);

  if (!empresaAtiva) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500">Selecione uma empresa para visualizar o dashboard</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (modulosVisiveis.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <LayoutDashboard className="w-12 h-12 text-slate-300" />
        <p className="text-slate-500 text-center">Nenhum módulo disponível para exibição.<br />Verifique sua assinatura ou permissões.</p>
      </div>
    );
  }

  const moduloInfo = MODULOS.find(m => m.id === moduloAtivo);
  const WidgetComponent = moduloAtivo ? WIDGET_MAP[moduloAtivo] : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-xs text-slate-500">Selecione um módulo para visualizar os indicadores</p>
      </div>

      {/* Alertas de vencimento - apenas para quem tem permissão no Financeiro */}
      {modulosLiberados['Financeiro'] && (perfil === 'Admin' || vinculo?.is_owner || temPermissao('Financeiro')) && (
        <AlertasVencimento />
      )}

      {/* Calendário consolidado de oportunidades */}
      <div>
        <button
          onClick={() => setCalendarioVisivel(v => !v)}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-2 transition-colors"
        >
          <CalendarDays className="w-4 h-4" />
          Calendário de Oportunidades
          {calendarioVisivel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {calendarioVisivel && <CalendarioConsolidado />}
      </div>

      {/* Calendário Financeiro - apenas para quem tem permissão */}
      {modulosLiberados['Financeiro'] && (perfil === 'Admin' || vinculo?.is_owner || temPermissao('Financeiro')) && (
        <div>
          <button
            onClick={() => setCalendarioFinanceiroVisivel(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-2 transition-colors"
          >
            <DollarSign className="w-4 h-4" />
            Calendário Financeiro
            {calendarioFinanceiroVisivel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {calendarioFinanceiroVisivel && <CalendarioFinanceiro />}
        </div>
      )}

      {/* Navegação por módulos */}
      <div className="flex flex-wrap gap-2">
        {modulosVisiveis.map(m => {
          const Icon = m.icon;
          const isActive = moduloAtivo === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setModuloAtivo(m.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border-2',
                isActive
                  ? `${colorVariants[m.color]} text-white border-transparent ring-2 ring-offset-2 ${colorActiveVariants[m.color]}`
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo do módulo ativo */}
      {moduloAtivo && WidgetComponent && (
        <div className="space-y-4">
          {/* Título do módulo */}
          <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
            {moduloInfo && <moduloInfo.icon className="w-5 h-5 text-slate-600" />}
            <h2 className="text-base font-semibold text-slate-700">{moduloInfo?.label}</h2>
          </div>

          {/* Widget do módulo */}
          <React.Suspense fallback={<div className="h-48 bg-slate-100 rounded-xl animate-pulse" />}>
            <WidgetComponent onDadosCarregados={setDadosIA} />
          </React.Suspense>

          {/* Análise por IA */}
          <DashboardIAAnalise moduloAtivo={moduloInfo?.label} dadosModulo={dadosIA} />
        </div>
      )}
    </div>
  );
}