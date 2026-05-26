import React, { useState } from "react";
import { TabsContent, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MovimentacoesTab from "@/components/ferramental/MovimentacoesTab";
import ManutencaoTab from "@/components/ferramental/ManutencaoTab";
import EntregasTab from "@/components/ferramental/EntregasTab";
import RelatorioFerramental from "@/components/ferramental/RelatorioFerramental";
import RelatorioFerramentaisPorCaminhao from "@/components/ferramental/RelatorioFerramentaisPorCaminhao";

export default function ConteudoAbas({
  empresaAtiva,
  user,
  ferramentas,
  historicoMovimentacoes,
  almoxarifados,
}) {
  const [relatorioTab, setRelatorioTab] = useState("geral");

  return (
    <>
      <TabsContent value="movimentacoes">
        <MovimentacoesTab empresaAtiva={empresaAtiva} />
      </TabsContent>

      <TabsContent value="manutencao">
        <ManutencaoTab />
      </TabsContent>

      <TabsContent value="entregas">
        <EntregasTab empresaAtiva={empresaAtiva} user={user} />
      </TabsContent>

      <TabsContent value="relatorios">
        <Tabs value={relatorioTab} onValueChange={setRelatorioTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="geral">Relatório Geral</TabsTrigger>
            <TabsTrigger value="caminhoes">Ferramentas por Caminhão</TabsTrigger>
          </TabsList>

          <TabsContent value="geral">
            <RelatorioFerramental
              ferramentas={ferramentas}
              movimentacoes={historicoMovimentacoes}
              almoxarifados={almoxarifados}
              empresaAtiva={empresaAtiva}
            />
          </TabsContent>

          <TabsContent value="caminhoes">
            <RelatorioFerramentaisPorCaminhao empresaAtiva={empresaAtiva} />
          </TabsContent>
        </Tabs>
      </TabsContent>
    </>
  );
}
