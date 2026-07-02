import React, { useState, useEffect, useCallback } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../Layout";
import { Factory, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OrdensTab from "../components/manufatura/OrdensTab";
import EngenhariaTab from "../components/manufatura/EngenhariaTab";
import CentrosTab from "../components/manufatura/CentrosTab";
import ApontamentoTab from "../components/manufatura/ApontamentoTab";
import MrpTab from "../components/manufatura/MrpTab";
import QualidadeTab from "../components/manufatura/QualidadeTab";
import ManutencaoTab from "../components/manufatura/ManutencaoTab";
import OeeTab from "../components/manufatura/OeeTab";

/**
 * Manufatura — módulo MES/ERP de manufatura discreta.
 *
 * Reusa o motor de estoque do SIGO (material/almoxarifado/estoque_movimento/
 * reserva_material + RPCs atômicas). Tabelas próprias: ficha_tecnica, roteiro,
 * centro_trabalho, ordem_producao, apontamento_producao, mrp_*, inspeção e
 * manutenção (migrações 0076–0082).
 */
export default function Manufatura() {
  const { empresaAtiva, user } = useEmpresa();
  const [activeTab, setActiveTab] = useState("ordens");
  const [loading, setLoading] = useState(true);

  // Dados compartilhados entre as abas
  const [materiais, setMateriais] = useState([]);
  const [centros, setCentros] = useState([]);
  const [almoxarifados, setAlmoxarifados] = useState([]);
  const [fichas, setFichas] = useState([]);

  const reloadShared = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const [mats, cts, almoxs, fts] = await Promise.all([
        sigo.entities.Material.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.CentroTrabalho.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.Almoxarifado.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.FichaTecnica.filter({ empresa_id: empresaAtiva.id }),
      ]);
      setMateriais(mats || []);
      setCentros(cts || []);
      setAlmoxarifados(almoxs || []);
      setFichas(fts || []);
    } catch (e) {
      console.error("[Manufatura] Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    reloadShared();
  }, [reloadShared]);

  const shared = {
    empresaAtiva,
    user,
    materiais,
    centros,
    almoxarifados,
    fichas,
    reloadShared,
    loadingShared: loading,
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Factory className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Manufatura</h1>
            <p className="text-sm text-muted-foreground">
              Ordens de produção, engenharia, chão de fábrica e MRP
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={reloadShared} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="ordens">Ordens</TabsTrigger>
          <TabsTrigger value="apontamento">Apontamento</TabsTrigger>
          <TabsTrigger value="engenharia">Engenharia</TabsTrigger>
          <TabsTrigger value="centros">Centros</TabsTrigger>
          <TabsTrigger value="mrp">MRP</TabsTrigger>
          <TabsTrigger value="qualidade">Qualidade</TabsTrigger>
          <TabsTrigger value="manutencao">Manutenção</TabsTrigger>
          <TabsTrigger value="oee">OEE</TabsTrigger>
        </TabsList>

        <TabsContent value="ordens" className="mt-4">
          <OrdensTab {...shared} />
        </TabsContent>
        <TabsContent value="apontamento" className="mt-4">
          <ApontamentoTab {...shared} />
        </TabsContent>
        <TabsContent value="engenharia" className="mt-4">
          <EngenhariaTab {...shared} />
        </TabsContent>
        <TabsContent value="centros" className="mt-4">
          <CentrosTab {...shared} />
        </TabsContent>
        <TabsContent value="mrp" className="mt-4">
          <MrpTab {...shared} />
        </TabsContent>
        <TabsContent value="qualidade" className="mt-4">
          <QualidadeTab {...shared} />
        </TabsContent>
        <TabsContent value="manutencao" className="mt-4">
          <ManutencaoTab {...shared} />
        </TabsContent>
        <TabsContent value="oee" className="mt-4">
          <OeeTab {...shared} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
