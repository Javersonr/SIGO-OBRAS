import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sigo } from "@/api/sigoClient";
import ReceitasTabFinanceiro from "../financeiro/ReceitasTab";
import DespesasTabFinanceiro from "../financeiro/DespesasTab";
import ResultadosTab from "../oportunidades/ResultadosTab";
import ResumoFinanceiroTab from "./ResumoFinanceiroTab";

export default function FinanceiroTab({
  projetoId,
  empresaAtiva,
  orcamentoItens,
  temPermissao,
  perfil,
}) {
  const [transacoes, setTransacoes] = useState([]);
  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Determinar aba padrão baseada nas permissões
  const getDefaultTab = () => {
    // Admin ou usuário sem permissões granulares vê Resumo
    if (perfil === "Admin") return "resumo";
    if (!temPermissao) return "receitas";

    // Com permissões granulares, só mostra Resumo se tem acesso à aba Financeiro
    const temAcessoFinanceiro = temPermissao("Projetos", "Financeiro");
    return temAcessoFinanceiro ? "resumo" : "receitas";
  };

  const loadData = React.useCallback(async () => {
    if (!empresaAtiva?.id) return;

    setLoading(true);
    try {
      const filterParams = { empresa_id: empresaAtiva.id };
      if (projetoId) {
        filterParams.projeto_id = projetoId;
      }

      const [trans, conts, cats, forns, clis, projs] = await Promise.all([
        sigo.entities.TransacaoFinanceira.filter(filterParams),
        sigo.entities.ContaFinanceira.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.CategoriaFinanceira.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Fornecedor.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Cliente.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id }),
      ]);

      setTransacoes(trans);
      setContas(conts);
      setCategorias(cats);
      setFornecedores(forns);
      setClientes(clis);
      setProjetos(projs);
    } catch (error) {
      console.error("Erro ao carregar dados financeiros:", error);
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id, projetoId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div>
      <Tabs defaultValue={getDefaultTab()} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="receitas">Receitas</TabsTrigger>
          <TabsTrigger value="despesas">Despesas</TabsTrigger>
          <TabsTrigger value="resultados">Resultados</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="mt-4">
          <ResumoFinanceiroTab
            projetoId={projetoId}
            empresaAtiva={empresaAtiva}
            orcamentoItens={orcamentoItens}
            transacoes={transacoes}
          />
        </TabsContent>

        <TabsContent value="receitas" className="mt-4">
          <ReceitasTabFinanceiro
            empresaAtiva={empresaAtiva}
            transacoes={transacoes}
            contas={contas}
            categorias={categorias}
            projetos={projetos}
            clientes={clientes}
            onReload={loadData}
            filtroProjetoInicial={projetoId}
            ocultarFiltrosProjeto={true}
          />
        </TabsContent>

        <TabsContent value="despesas" className="mt-4">
          <DespesasTabFinanceiro
            empresaAtiva={empresaAtiva}
            transacoes={transacoes}
            contas={contas}
            categorias={categorias}
            projetos={projetos}
            fornecedores={fornecedores}
            onReload={loadData}
            filtroProjetoInicial={projetoId}
            ocultarFiltrosProjeto={true}
          />
        </TabsContent>

        <TabsContent value="resultados" className="mt-4">
          <ResultadosTab
            oportunidadeId={projetoId}
            empresaAtiva={empresaAtiva}
            orcamentoItens={orcamentoItens}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
