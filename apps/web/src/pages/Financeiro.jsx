import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../Layout";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ResumoTab from "../components/financeiro/ResumoTab";
import ReceitasTab from "../components/financeiro/ReceitasTab";
import DespesasTab from "../components/financeiro/DespesasTab";
import PreLancamentosTab from "../components/financeiro/PreLancamentosTab";
import RelatoriosTab from "../components/financeiro/RelatoriosTab";
import TransferenciasTab from "../components/financeiro/TransferenciasTab";
import ContasExtratosTab from "../components/financeiro/ContasExtratosTab";
import RecorrentesTab from "../components/financeiro/RecorrentesTab";

export default function Financeiro() {
  const { empresaAtiva, setEmpresaAtiva, empresas, perfil, user, temPermissao, vinculo } =
    useEmpresa();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("resumo");
  const [transacaoIdInicial, setTransacaoIdInicial] = useState(null);
  const transacaoIdRef = React.useRef(null); // ref sempre atualizado com o id atual
  const [transacaoKey, setTransacaoKey] = useState(0); // força re-disparo mesmo com mesmo id
  // (removido pendingTransacaoRef — agora o Layout redireciona de volta com os params)
  const [loading, setLoading] = useState(true);
  const [transacoes, setTransacoes] = useState([]);
  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [clientes, setClientes] = useState([]);

  // Determinar quais abas o usuário pode acessar
  const permissoes = React.useMemo(() => {
    try {
      return vinculo?.permissoes ? JSON.parse(vinculo.permissoes) : {};
    } catch {
      return {};
    }
  }, [vinculo?.permissoes]);

  // Resumo apenas para Admin ou para quem tem permissão específica
  const temAbaResumo = perfil === "Admin" || temPermissao("Financeiro", "Resumo");
  const temAbaReceitas = perfil === "Admin" || temPermissao("Financeiro", "Receitas");
  const temAbaDespesas = perfil === "Admin" || temPermissao("Financeiro", "Despesas");
  const temAbaRecorrentes =
    perfil === "Admin" || temPermissao("Financeiro", "Transações Recorrentes");
  const temAbaPreLancamentos = perfil === "Admin" || temPermissao("Financeiro", "Pré-Lançamentos");
  // ver_todos: admin sempre pode, ou se tem a função 'Ver Todos' nas permissões granulares
  const preLancamentosVerTodos =
    perfil === "Admin" ||
    vinculo?.is_owner === true ||
    !!permissoes?.Financeiro?.["Pré-Lançamentos"]?.["ver_todos"];
  // ver_proprios: pode ver seus próprios pré-lançamentos
  const preLancamentosVerProprios =
    preLancamentosVerTodos || !!permissoes?.Financeiro?.["Pré-Lançamentos"]?.["ver_proprios"];
  // aprovar: pode aprovar pré-lançamentos
  const preLancamentosPodeAprovar =
    perfil === "Admin" ||
    vinculo?.is_owner === true ||
    !!permissoes?.Financeiro?.["Pré-Lançamentos"]?.["aprovar"];
  // pagar: pode executar pagamento de pré-lançamentos
  const preLancamentosPodePagar =
    perfil === "Admin" ||
    vinculo?.is_owner === true ||
    !!permissoes?.Financeiro?.["Pré-Lançamentos"]?.["pagar"];
  const temAbaRelatorios = perfil === "Admin" || temPermissao("Financeiro", "Relatórios");
  const temAbaTransferencias = perfil === "Admin" || temPermissao("Financeiro", "Transferências");
  const temAbaContas = perfil === "Admin" || temPermissao("Financeiro", "Contas");

  // Ler parâmetros da URL para abrir transação diretamente
  // Roda quando searchParams muda (nova navegação) OU quando empresaAtiva muda (troca de empresa concluída)
  useEffect(() => {
    const tid = searchParams.get("transacaoId") || searchParams.get("transacao_id");
    const aba = searchParams.get("tab") || searchParams.get("aba");
    const empresaIdParam = searchParams.get("empresaId");

    if (!tid) {
      // Só muda aba se veio parâmetro de aba
      if (aba === "despesas" || aba === "receitas") {
        setActiveTab(aba);
        setSearchParams({}, { replace: true });
      }
      return;
    }

    // Há um transacaoId — verificar se precisa trocar empresa
    if (empresaIdParam && empresaAtiva && empresaAtiva.id !== empresaIdParam) {
      // Trocar empresa e redirecionar de volta para /Financeiro com os mesmos params
      const empresaAlvo = empresas?.find((e) => e.id === empresaIdParam);
      if (empresaAlvo) {
        const abaAlvo = aba || "despesas";
        const redirectUrl = `/Financeiro?transacaoId=${tid}&tab=${abaAlvo}&empresaId=${empresaIdParam}`;
        setSearchParams({}, { replace: true });
        setEmpresaAtiva(empresaAlvo, redirectUrl);
      }
      return;
    }

    // Empresa correta — abrir modal diretamente
    const abaAlvo = aba || "despesas";
    transacaoIdRef.current = tid;
    setActiveTab(abaAlvo);
    setTransacaoIdInicial(tid);
    setTransacaoKey((k) => k + 1);
    setSearchParams({}, { replace: true });
  }, [searchParams, empresaAtiva?.id]);

  // Ajustar aba ativa se usuário não tem permissão para a aba padrão
  useEffect(() => {
    if (!temAbaResumo && activeTab === "resumo") {
      // Encontrar primeira aba disponível
      const abasPrioritarias = [
        { tab: "receitas", tem: temAbaReceitas },
        { tab: "despesas", tem: temAbaDespesas },
        { tab: "contas-extratos", tem: temAbaContas },
        { tab: "relatorios", tem: temAbaRelatorios },
        { tab: "recorrentes", tem: temAbaRecorrentes },
        { tab: "pre-lancamentos", tem: temAbaPreLancamentos },
        { tab: "transferencias", tem: temAbaTransferencias },
      ];

      const primeiraAba = abasPrioritarias.find((a) => a.tem);
      if (primeiraAba) {
        setActiveTab(primeiraAba.tab);
      }
    }
  }, [
    temAbaResumo,
    temAbaReceitas,
    temAbaDespesas,
    temAbaContas,
    temAbaRelatorios,
    temAbaRecorrentes,
    temAbaPreLancamentos,
    temAbaTransferencias,
  ]);

  useEffect(() => {
    if (empresaAtiva) {
      loadData();
    }
  }, [empresaAtiva?.id]);

  const loadData = async () => {
    if (!empresaAtiva?.id) return;

    setLoading(true);
    try {
      const [trans, conts, cats, projs, forns, clis] = await Promise.all([
        sigo.entities.TransacaoFinanceira.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.ContaFinanceira.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.CategoriaFinanceira.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.Fornecedor.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Cliente.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ]);

      setTransacoes(trans);
      setContas(conts);
      setCategorias(cats);
      setProjetos(projs);
      setFornecedores(forns);
      setClientes(clis);
    } catch (error) {
      console.error("Erro ao carregar dados do Financeiro:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!empresaAtiva) return null;

  const abasDisponiveis = [
    temAbaResumo && { value: "resumo", label: "Resumo" },
    temAbaReceitas && { value: "receitas", label: "Receitas" },
    temAbaDespesas && { value: "despesas", label: "Despesas" },
    temAbaRecorrentes && { value: "recorrentes", label: "Recorrentes" },
    temAbaPreLancamentos && { value: "pre-lancamentos", label: "Pré-Lançamentos" },
    temAbaRelatorios && { value: "relatorios", label: "Relatórios" },
    temAbaTransferencias && { value: "transferencias", label: "Transferências" },
    temAbaContas && { value: "contas-extratos", label: "Contas e Extratos" },
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Financeiro</h1>
          <p className="text-slate-500">Controle completo das finanças</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Abas no desktop, dropdown no mobile */}
        <div className="hidden md:block">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-slate-100 p-1">
            {abasDisponiveis.map((aba) => (
              <TabsTrigger key={aba.value} value={aba.value} className="text-sm">
                {aba.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="md:hidden">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full bg-white border-slate-300 font-medium text-slate-800">
              <SelectValue placeholder="Selecionar aba" />
            </SelectTrigger>
            <SelectContent>
              {abasDisponiveis.map((aba) => (
                <SelectItem key={aba.value} value={aba.value}>
                  {aba.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="resumo" className="mt-6">
          <ResumoTab
            empresaAtiva={empresaAtiva}
            transacoes={transacoes}
            contas={contas}
            onReload={loadData}
          />
        </TabsContent>

        <TabsContent value="receitas" className="mt-6">
          <ReceitasTab
            empresaAtiva={empresaAtiva}
            transacoes={transacoes}
            contas={contas}
            categorias={categorias}
            projetos={projetos}
            clientes={clientes}
            onReload={loadData}
            transacaoIdInicial={transacaoIdInicial}
            transacaoIdRef={transacaoIdRef}
            transacaoKey={transacaoKey}
            onTransacaoInicialConsumed={() => {
              setTransacaoIdInicial(null);
              transacaoIdRef.current = null;
            }}
          />
        </TabsContent>

        <TabsContent value="despesas" className="mt-6">
          <DespesasTab
            empresaAtiva={empresaAtiva}
            transacoes={transacoes}
            contas={contas}
            categorias={categorias}
            projetos={projetos}
            fornecedores={fornecedores}
            onReload={loadData}
            transacaoIdInicial={transacaoIdInicial}
            transacaoIdRef={transacaoIdRef}
            transacaoKey={transacaoKey}
            onTransacaoInicialConsumed={() => {
              setTransacaoIdInicial(null);
              transacaoIdRef.current = null;
            }}
          />
        </TabsContent>

        <TabsContent value="recorrentes" className="mt-6">
          <RecorrentesTab
            empresaAtiva={empresaAtiva}
            contas={contas}
            categorias={categorias}
            fornecedores={fornecedores}
            clientes={clientes}
            projetos={projetos}
          />
        </TabsContent>

        <TabsContent value="pre-lancamentos" className="mt-6">
          <PreLancamentosTab
            empresaAtiva={empresaAtiva}
            transacoes={transacoes}
            contas={contas}
            categorias={categorias}
            onReload={loadData}
            usuarioEmail={user?.email}
            usuarioNome={user?.full_name}
            verTodos={preLancamentosVerTodos}
            verProprios={preLancamentosVerProprios}
            podeAprovar={preLancamentosPodeAprovar}
            podePagar={preLancamentosPodePagar}
          />
        </TabsContent>

        <TabsContent value="relatorios" className="mt-6">
          <RelatoriosTab transacoes={transacoes} contas={contas} categorias={categorias} />
        </TabsContent>

        <TabsContent value="transferencias" className="mt-6">
          <TransferenciasTab empresaAtiva={empresaAtiva} contas={contas} onReload={loadData} />
        </TabsContent>

        <TabsContent value="contas-extratos" className="mt-6">
          <ContasExtratosTab empresaAtiva={empresaAtiva} contas={contas} onReload={loadData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
