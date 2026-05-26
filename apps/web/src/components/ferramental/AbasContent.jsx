import React from "react";
import { TabsContent } from "@/components/ui/tabs";
import MovimentacoesTab from "@/components/ferramental/MovimentacoesTab";
import ManutencaoTab from "@/components/ferramental/ManutencaoTab";
import EntregasTab from "@/components/ferramental/EntregasTab";
import RelatorioFerramental from "@/components/ferramental/RelatorioFerramental";
import RelatorioFerramentaisPorCaminhao from "@/components/ferramental/RelatorioFerramentaisPorCaminhao";

export default function AbasContent({
  empresaAtiva,
  user,
  ferramentas,
  historicoMovimentacoes,
  almoxarifados,
}) {
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
    </>
  );
}
