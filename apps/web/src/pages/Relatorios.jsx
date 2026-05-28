import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../Layout";
import { safeParseJSON } from "@/lib/json-utils";
import {
  BarChart3,
  Target,
  FolderKanban,
  ShoppingCart,
  Package,
  DollarSign,
  Shield,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FiltrosRelatorio from "../components/relatorios/FiltrosRelatorio";
import RelatorioVendas from "../components/relatorios/RelatorioVendas";
import RelatorioProjetos from "../components/relatorios/RelatorioProjetos";
import RelatorioCompras from "../components/relatorios/RelatorioCompras";
import RelatorioEstoque from "../components/relatorios/RelatorioEstoque";
import RelatorioFinanceiro from "../components/relatorios/RelatorioFinanceiro";
import RelatorioSeguranca from "../components/relatorios/RelatorioSeguranca";

export default function Relatorios() {
  const { empresaAtiva } = useEmpresa();
  const [loading, setLoading] = useState(true);
  const [modulosLiberados, setModulosLiberados] = useState({});
  const [dados, setDados] = useState({
    oportunidades: [],
    projetos: [],
    solicitacoes: [],
    cotacoes: [],
    pedidos: [],
  });
  const [filtros, setFiltros] = useState({
    dataInicio: "",
    dataFim: "",
    usuario: "all",
    status: "all",
    tipo: "all",
  });

  useEffect(() => {
    if (empresaAtiva?.id) loadModulos();
  }, [empresaAtiva?.id]);

  const loadModulos = async () => {
    try {
      const todasAssinaturas = await sigo.entities.Assinatura.filter({
        empresa_id: empresaAtiva.id,
      });
      const assinaturas = todasAssinaturas.filter(
        (a) => a.status === "Ativa" || a.status === "Trial"
      );
      let modulos = {};
      if (assinaturas.length > 0) {
        const planos = await sigo.entities.Plano.filter({ id: assinaturas[0].plano_id });
        if (planos.length > 0) {
          // modulos_liberados é JSONB → objeto pelo supabase-js (não string)
          modulos = safeParseJSON(planos[0].modulos_liberados, {});
        }
      }
      setModulosLiberados(modulos);
      await loadData(modulos);
    } catch (error) {
      console.error("Erro ao carregar módulos:", error);
      setLoading(false);
    }
  };

  const loadData = async (modulos) => {
    setLoading(true);
    try {
      const [ops, projs, sols, cots, peds] = await Promise.all([
        modulos["Oportunidades"]
          ? sigo.entities.Oportunidade.filter({ empresa_id: empresaAtiva.id })
          : Promise.resolve([]),
        modulos["Projetos"]
          ? sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id })
          : Promise.resolve([]),
        modulos["Compras"]
          ? sigo.entities.SolicitacaoCompra.filter({ empresa_id: empresaAtiva.id })
          : Promise.resolve([]),
        modulos["Compras"]
          ? sigo.entities.Cotacao.filter({ empresa_id: empresaAtiva.id })
          : Promise.resolve([]),
        modulos["Compras"]
          ? sigo.entities.PedidoCompra.filter({ empresa_id: empresaAtiva.id })
          : Promise.resolve([]),
      ]);
      setDados({
        oportunidades: ops,
        projetos: projs,
        solicitacoes: sols,
        cotacoes: cots,
        pedidos: peds,
      });
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const dadosFiltrados = React.useMemo(() => {
    const filtrarPorData = (item) => {
      if (!filtros.dataInicio && !filtros.dataFim) return true;
      const data = new Date(item.created_date);
      if (filtros.dataInicio && data < new Date(filtros.dataInicio)) return false;
      if (filtros.dataFim && data > new Date(filtros.dataFim)) return false;
      return true;
    };
    return {
      oportunidades: dados.oportunidades.filter(filtrarPorData),
      projetos: dados.projetos.filter(filtrarPorData),
      solicitacoes: dados.solicitacoes.filter(filtrarPorData),
      cotacoes: dados.cotacoes.filter(filtrarPorData),
      pedidos: dados.pedidos.filter(filtrarPorData),
    };
  }, [dados, filtros]);

  const temOportunidades = modulosLiberados["Oportunidades"];
  const temProjetos = modulosLiberados["Projetos"];
  const temCompras = modulosLiberados["Compras"];
  const temEstoque = modulosLiberados["Estoque"];
  const temFinanceiro = modulosLiberados["Financeiro"];
  const temSeguranca = modulosLiberados["Segurança do Trabalho"];

  const abas = [];
  if (temOportunidades) abas.push("vendas");
  if (temProjetos) abas.push("projetos");
  if (temCompras) abas.push("compras");
  if (temEstoque) abas.push("estoque");
  if (temFinanceiro) abas.push("financeiro");
  if (temSeguranca) abas.push("seguranca");

  const defaultTab = abas[0] || "";

  if (!empresaAtiva) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Relatórios</h1>
        <p className="text-slate-500 text-sm">
          Análises e métricas do seu negócio com exportação em PDF e Excel
        </p>
      </div>

      <FiltrosRelatorio filtros={filtros} onFiltrosChange={setFiltros} />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : abas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-slate-500">Nenhum módulo contratado possui relatórios disponíveis.</p>
        </div>
      ) : (
        <Tabs defaultValue={defaultTab} className="space-y-6">
          <TabsList className="bg-slate-100 flex-wrap h-auto gap-1 p-1">
            {temOportunidades && (
              <TabsTrigger value="vendas" className="gap-1.5">
                <Target className="w-3.5 h-3.5" /> Vendas
              </TabsTrigger>
            )}
            {temProjetos && (
              <TabsTrigger value="projetos" className="gap-1.5">
                <FolderKanban className="w-3.5 h-3.5" /> Projetos
              </TabsTrigger>
            )}
            {temCompras && (
              <TabsTrigger value="compras" className="gap-1.5">
                <ShoppingCart className="w-3.5 h-3.5" /> Compras
              </TabsTrigger>
            )}
            {temEstoque && (
              <TabsTrigger value="estoque" className="gap-1.5">
                <Package className="w-3.5 h-3.5" /> Estoque
              </TabsTrigger>
            )}
            {temFinanceiro && (
              <TabsTrigger value="financeiro" className="gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Financeiro
              </TabsTrigger>
            )}
            {temSeguranca && (
              <TabsTrigger value="seguranca" className="gap-1.5">
                <Shield className="w-3.5 h-3.5" /> Segurança
              </TabsTrigger>
            )}
          </TabsList>

          {temOportunidades && (
            <TabsContent value="vendas">
              <RelatorioVendas dados={dadosFiltrados} />
            </TabsContent>
          )}
          {temProjetos && (
            <TabsContent value="projetos">
              <RelatorioProjetos dados={dadosFiltrados} />
            </TabsContent>
          )}
          {temCompras && (
            <TabsContent value="compras">
              <RelatorioCompras dados={dadosFiltrados} />
            </TabsContent>
          )}
          {temEstoque && (
            <TabsContent value="estoque">
              <RelatorioEstoque empresaId={empresaAtiva.id} />
            </TabsContent>
          )}
          {temFinanceiro && (
            <TabsContent value="financeiro">
              <RelatorioFinanceiro empresaId={empresaAtiva.id} filtros={filtros} />
            </TabsContent>
          )}
          {temSeguranca && (
            <TabsContent value="seguranca">
              <RelatorioSeguranca empresaId={empresaAtiva.id} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
