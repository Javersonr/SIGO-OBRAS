import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import DespesaModal from './DespesaModal';

export default function EditarPreLancamentoComDespesaModal({ open, onOpenChange, preLancamento, empresaAtiva, contas, categorias, onSucesso }) {
  const [fornecedores, setFornecedores] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [form, setForm] = useState({});
  const [parcelas, setParcelas] = useState([]);
  const [numeroParcelas, setNumeroParcelas] = useState(1);
  const [anexos, setAnexos] = useState([]);
  const [tipoDespesa, setTipoDespesa] = useState('servico');

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    base44.entities.Fornecedor.filter({ empresa_id: empresaAtiva.id }).then(setFornecedores).catch(() => {});
    base44.entities.Projeto.filter({ empresa_id: empresaAtiva.id }).then(setProjetos).catch(() => {});
  }, [empresaAtiva?.id]);

  useEffect(() => {
    if (!preLancamento) return;
    const dados = typeof preLancamento.dados_extraidos === 'string'
      ? JSON.parse(preLancamento.dados_extraidos || '{}')
      : (preLancamento.dados_extraidos || {});

    setForm({
      descricao: preLancamento.descricao_caixa || dados.descricao || dados.fornecedor || 'Comprovante',
      valor: String(dados.valor || 0),
      conta_id: preLancamento.conta_financeira_id || contas[0]?.id || '',
      categoria_id: '',
      projeto_id: preLancamento.projeto_id || '',
      projeto_nome: preLancamento.projeto_nome || '',
      fornecedor_id: '',
      fornecedor_nome: dados.fornecedor || '',
      centro_custo_id: '',
      centro_custo_nome: '',
      data_competencia: preLancamento.data_competencia || dados.data || new Date().toLocaleDateString('en-CA'),
      data_vencimento: dados.data || new Date().toLocaleDateString('en-CA'),
      data_pagamento: '',
      status: 'em_aberto',
      forma_pagamento: dados.forma_pagamento || ''
    });

    // Carregar comprovante como anexo se existir
    if (preLancamento.comprovante_url) {
      const nome = preLancamento.comprovante_url.split('/').pop() || 'comprovante';
      const tipo = nome.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
      setAnexos([{ nome, url: preLancamento.comprovante_url, tipo }]);
    } else {
      setAnexos([]);
    }
  }, [preLancamento]);

  const handleAnexoUpload = async (e) => {
    const files = Array.from(e.target.files);
    const novos = [];
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      novos.push({ nome: file.name, url: file_url, tipo: file.type });
    }
    setAnexos(prev => [...prev, ...novos]);
  };

  const handleRemoverAnexo = (index) => {
    setAnexos(prev => prev.filter((_, i) => i !== index));
  };

  const handleNumeroParcelasChange = (num) => {
    setNumeroParcelas(parseInt(num) || 1);
    setParcelas([]);
  };

  const handleSave = async () => {
    if (!form.valor || !form.data_vencimento || !form.conta_id || !form.descricao) {
      alert('Preencha todos os campos obrigatórios (Descrição, Valor, Data Vencimento, Conta).');
      return;
    }

    const conta = contas.find(c => c.id === form.conta_id);
    const categoria = categorias.find(c => c.id === form.categoria_id);
    const projeto = projetos.find(p => p.id === form.projeto_id);

    // Atualizar dados_extraidos do pré-lançamento com os novos valores
    const dadosAtualizados = {
      descricao: form.descricao,
      valor: parseFloat(form.valor) || 0,
      fornecedor: form.fornecedor_nome || '',
      data: form.data_competencia || form.data_vencimento,
      forma_pagamento: form.forma_pagamento || ''
    };

    await base44.entities.PreLancamento.update(preLancamento.id, {
      dados_extraidos: JSON.stringify(dadosAtualizados),
      descricao_caixa: form.descricao,
      projeto_id: form.projeto_id || null,
      projeto_nome: projeto?.nome || form.projeto_nome || null,
      conta_financeira_id: form.conta_id || null,
      data_competencia: form.data_competencia || null,
      ...(anexos.length > 0 && anexos[0].url !== preLancamento.comprovante_url
        ? { comprovante_url: anexos[0].url }
        : {})
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