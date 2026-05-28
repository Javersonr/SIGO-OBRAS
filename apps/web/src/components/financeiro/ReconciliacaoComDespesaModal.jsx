import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import DespesaModal from "./DespesaModal";

export default function ReconciliacaoComDespesaModal({
  open,
  onOpenChange,
  preLancamento,
  onReconciliado,
}) {
  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [oportunidades, setOportunidades] = useState([]);
  const [empresaAtiva, setEmpresaAtiva] = useState(null);
  const [anexos, setAnexos] = useState([]);
  const [form, setForm] = useState({});
  const [carregando, setCarregando] = useState(true);

  // Dados extraídos do pré-lançamento
  const dados = React.useMemo(
    () => safeParseJSON(preLancamento?.dados_extraidos, {}),
    [preLancamento]
  );

  useEffect(() => {
    if (open && preLancamento?.empresa_id) {
      carregarDados();
    }
  }, [open, preLancamento]);

  const carregarDados = async () => {
    setCarregando(true);
    try {
      const [empresa, contsData, catsData, fornsData, projsData, optsData] = await Promise.all([
        sigo.entities.Empresa.filter({ id: preLancamento.empresa_id }),
        sigo.entities.ContaFinanceira.filter({ empresa_id: preLancamento.empresa_id, ativo: true }),
        sigo.entities.CategoriaFinanceira.filter({
          empresa_id: preLancamento.empresa_id,
          ativo: true,
        }),
        sigo.entities.Fornecedor.filter({ empresa_id: preLancamento.empresa_id, ativo: true }),
        sigo.entities.Projeto.filter({ empresa_id: preLancamento.empresa_id }),
        sigo.entities.Oportunidade.filter({ empresa_id: preLancamento.empresa_id }),
      ]);

      setEmpresaAtiva(empresa[0] || { id: preLancamento.empresa_id });
      setContas(contsData);
      setCategorias(catsData);
      setFornecedores(fornsData);
      setProjetos(projsData);
      setOportunidades(optsData);

      // Tentar encontrar fornecedor pelo nome/CNPJ
      let fornecedorId = "";
      let fornecedorNome = dados.fornecedor || "";
      if (dados.cnpj) {
        const cnpjLimpo = dados.cnpj.replace(/\D/g, "");
        const fornExistente = fornsData.find((f) => f.cnpj?.replace(/\D/g, "") === cnpjLimpo);
        if (fornExistente) {
          fornecedorId = fornExistente.id;
          fornecedorNome = fornExistente.nome_razao;
        }
      }

      // Conta pré-selecionada do pré-lançamento
      const contaId = preLancamento.conta_financeira_id || contsData[0]?.id || "";

      // Pré-preencher form com dados do pré-lançamento
      setForm({
        conta_id: contaId,
        categoria_id: "",
        projeto_id: preLancamento.projeto_id || "",
        oportunidade_id: "",
        fornecedor_id: fornecedorId,
        fornecedor_nome: fornecedorNome,
        centro_custo_id: "",
        centro_custo_nome: "",
        valor: dados.valor ? String(dados.valor) : "",
        data_competencia: new Date().toLocaleDateString("en-CA"),
        data_vencimento: new Date().toLocaleDateString("en-CA"),
        data_pagamento: "",
        descricao:
          dados.descricao || (dados.fornecedor ? `Compra - ${dados.fornecedor}` : "Pré-lançamento"),
        status: "em_aberto",
        forma_pagamento: "",
      });

      // Anexar o comprovante automaticamente
      if (preLancamento.comprovante_url) {
        setAnexos([
          {
            nome: "Comprovante",
            url: preLancamento.comprovante_url,
            tipo: "image",
          },
        ]);
      } else {
        setAnexos([]);
      }
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setCarregando(false);
    }
  };

  const handleAnexoUpload = async (e) => {
    const files = Array.from(e.target.files);
    const novosAnexos = [];
    for (const file of files) {
      const { file_url } = await sigo.integrations.Core.UploadFile({ file });
      novosAnexos.push({ nome: file.name, url: file_url, tipo: file.type });
    }
    setAnexos((prev) => [...prev, ...novosAnexos]);
  };

  const handleRemoverAnexo = (index) => {
    setAnexos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!form.valor || !form.data_vencimento || !form.conta_id || !form.descricao) {
      alert(
        "Por favor, preencha todos os campos obrigatórios (Descrição, Valor, Data Vencimento, Conta)."
      );
      return;
    }

    const conta = contas.find((c) => c.id === form.conta_id);
    const categoria = categorias.find((c) => c.id === form.categoria_id);
    const projeto = projetos.find((p) => p.id === form.projeto_id);
    const fornecedor = fornecedores.find((f) => f.id === form.fornecedor_id);

    // Criar a despesa
    const transacao = await sigo.entities.TransacaoFinanceira.create({
      empresa_id: preLancamento.empresa_id,
      tipo: "Despesa",
      conta_id: form.conta_id,
      conta_nome: conta?.nome,
      categoria_id: form.categoria_id || null,
      categoria_nome: categoria?.nome || null,
      projeto_id: form.projeto_id || null,
      projeto_nome: projeto?.nome || preLancamento.projeto_nome || null,
      fornecedor_id: form.fornecedor_id || null,
      fornecedor_nome: form.fornecedor_nome || fornecedor?.nome_razao || null,
      centro_custo_id: form.centro_custo_id || null,
      centro_custo_nome: form.centro_custo_nome || null,
      valor: parseFloat(form.valor) || 0,
      data_vencimento: form.data_vencimento,
      data_pagamento: form.data_pagamento || null,
      data: form.data_competencia || new Date().toLocaleDateString("en-CA"),
      descricao: form.descricao,
      status: form.status,
      forma_pagamento: form.forma_pagamento || null,
      pre_lancamento_id: preLancamento.id,
    });

    // Salvar anexos
    for (const anexo of anexos) {
      await sigo.entities.TransacaoAnexo.create({
        empresa_id: preLancamento.empresa_id,
        transacao_id: transacao.id,
        nome: anexo.nome,
        url: anexo.url,
        tipo: anexo.tipo || "comprovante",
      });
    }

    // Atualizar pré-lançamento como Conciliado e linkar à transação
    await sigo.entities.PreLancamento.update(preLancamento.id, {
      status: "Conciliado",
      transacao_id: transacao.id,
    });

    // Marcar a despesa como aguardando aprovação do pré-lançamento
    // A despesa só aparecerá na lista quando o pré-lançamento for aprovado (pre_lancamento_aprovado=true)
    await sigo.entities.TransacaoFinanceira.update(transacao.id, {
      pre_lancamento_id: preLancamento.id,
      pre_lancamento_aprovado: false,
    });

    onOpenChange(false);
    onReconciliado();
  };

  if (!open) return null;
  if (carregando) return null;

  return (
    <DespesaModal
      showModal={open}
      setShowModal={onOpenChange}
      selectedItem={null}
      form={form}
      setForm={setForm}
      contas={contas}
      categorias={categorias}
      fornecedores={fornecedores}
      projetos={projetos}
      oportunidades={oportunidades}
      tipoDespesa="servico"
      setTipoDespesa={() => {}}
      numeroParcelas={1}
      handleNumeroParcelasChange={() => {}}
      parcelas={[]}
      setParcelas={() => {}}
      anexos={anexos}
      handleAnexoUpload={handleAnexoUpload}
      handleRemoverAnexo={handleRemoverAnexo}
      handleSave={handleSave}
      empresaAtiva={empresaAtiva}
      onReload={() => {}}
      onEmitirRecibo={() => {}}
      onDuplicar={() => {}}
      onDesfazerConciliacao={() => {}}
      podeEditar={true}
    />
  );
}
