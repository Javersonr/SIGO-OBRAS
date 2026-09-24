import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { refDoUpload, nomeDoArquivo, extensaoDoArquivo, ehImagem, ehPdf } from "@/lib/anexo-ref";
import DespesaModal from "./DespesaModal";

/** Mime do comprovante pela extensão da ref; sem extensão, costuma ser foto. */
function tipoDoComprovante(ref) {
  const ext = extensaoDoArquivo(ref);
  if (ehPdf(ref)) return "application/pdf";
  if (!ext) return "image/jpeg";
  if (ehImagem(ref)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  return "";
}

export default function EditarPreLancamentoComDespesaModal({
  open,
  onOpenChange,
  preLancamento,
  empresaAtiva,
  contas,
  categorias,
  onSucesso,
}) {
  const [fornecedores, setFornecedores] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [form, setForm] = useState({});
  const [parcelas, setParcelas] = useState([]);
  const [numeroParcelas, setNumeroParcelas] = useState(1);
  const [anexos, setAnexos] = useState([]);
  const [tipoDespesa, setTipoDespesa] = useState("servico");

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    sigo.entities.Fornecedor.filter({ empresa_id: empresaAtiva.id })
      .then(setFornecedores)
      .catch((err) => {
        console.warn("[EditarPreLancamento] falha carregando fornecedores:", err);
        setFornecedores([]);
      });
    sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id })
      .then(setProjetos)
      .catch((err) => {
        console.warn("[EditarPreLancamento] falha carregando projetos:", err);
        setProjetos([]);
      });
  }, [empresaAtiva?.id]);

  useEffect(() => {
    if (!preLancamento) return;
    const dados = safeParseJSON(preLancamento.dados_extraidos, {});

    setForm({
      descricao:
        preLancamento.descricao_caixa || dados.descricao || dados.fornecedor || "Comprovante",
      valor: String(dados.valor || 0),
      conta_id: preLancamento.conta_financeira_id || contas[0]?.id || "",
      categoria_id: "",
      projeto_id: preLancamento.projeto_id || "",
      projeto_nome: preLancamento.projeto_nome || "",
      fornecedor_id: "",
      fornecedor_nome: dados.fornecedor || "",
      centro_custo_id: "",
      centro_custo_nome: "",
      data_competencia:
        preLancamento.data_competencia || dados.data || new Date().toLocaleDateString("en-CA"),
      data_vencimento: dados.data || new Date().toLocaleDateString("en-CA"),
      data_pagamento: "",
      status: "em_aberto",
      forma_pagamento: dados.forma_pagamento || "",
    });

    // Carregar comprovante como anexo se existir (ref "bucket/path" ou URL legada;
    // nome/tipo sem o ?token=... da URL assinada)
    if (preLancamento.comprovante_url) {
      const ref = preLancamento.comprovante_url;
      setAnexos([
        { nome: nomeDoArquivo(ref, "comprovante"), url: ref, tipo: tipoDoComprovante(ref) },
      ]);
    } else {
      setAnexos([]);
    }
  }, [preLancamento]);

  const handleAnexoUpload = async (e) => {
    const files = Array.from(e.target.files);
    const novos = [];
    for (const file of files) {
      // grava a REFERÊNCIA "bucket/path": a file_url assinada expira em 1h
      const ref = refDoUpload(await sigo.integrations.Core.UploadFile({ file }));
      if (!ref) {
        alert(`Falha no envio de ${file.name}`);
        continue;
      }
      novos.push({ nome: file.name, url: ref, tipo: file.type });
    }
    setAnexos((prev) => [...prev, ...novos]);
  };

  const handleRemoverAnexo = (index) => {
    setAnexos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNumeroParcelasChange = (num) => {
    setNumeroParcelas(parseInt(num) || 1);
    setParcelas([]);
  };

  const handleSave = async () => {
    if (!form.valor || !form.data_vencimento || !form.conta_id || !form.descricao) {
      alert("Preencha todos os campos obrigatórios (Descrição, Valor, Data Vencimento, Conta).");
      return;
    }

    const conta = contas.find((c) => c.id === form.conta_id);
    const categoria = categorias.find((c) => c.id === form.categoria_id);
    const projeto = projetos.find((p) => p.id === form.projeto_id);

    // Atualizar dados_extraidos do pré-lançamento com os novos valores
    const dadosAtualizados = {
      descricao: form.descricao,
      valor: parseFloat(form.valor) || 0,
      fornecedor: form.fornecedor_nome || "",
      data: form.data_competencia || form.data_vencimento,
      forma_pagamento: form.forma_pagamento || "",
    };

    await sigo.entities.PreLancamento.update(preLancamento.id, {
      dados_extraidos: JSON.stringify(dadosAtualizados),
      descricao_caixa: form.descricao,
      projeto_id: form.projeto_id || null,
      projeto_nome: projeto?.nome || form.projeto_nome || null,
      conta_financeira_id: form.conta_id || null,
      data_competencia: form.data_competencia || null,
      // comprovante trocado: anexos[0].url já é a ref "bucket/path" do upload
      ...(anexos.length > 0 && anexos[0].url !== preLancamento.comprovante_url
        ? { comprovante_url: anexos[0].url }
        : {}),
    });

    onOpenChange(false);
    if (onSucesso) onSucesso();
  };

  if (!open || !preLancamento) return null;

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
      oportunidades={[]}
      tipoDespesa={tipoDespesa}
      setTipoDespesa={setTipoDespesa}
      numeroParcelas={numeroParcelas}
      handleNumeroParcelasChange={handleNumeroParcelasChange}
      parcelas={parcelas}
      setParcelas={setParcelas}
      anexos={anexos}
      handleAnexoUpload={handleAnexoUpload}
      handleRemoverAnexo={handleRemoverAnexo}
      handleSave={handleSave}
      empresaAtiva={empresaAtiva}
      onReload={() => {}}
      podeEditar={true}
    />
  );
}
