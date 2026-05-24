import { toast } from 'sonner';
import { gerarCertificadoDoc } from './certificadoLayout';

export async function gerarCertificados({ treinamentosSelecionados, treinamentosFuncao, editandoDatasTreinamento, funcionarioTreinamentos, empresaAtiva }) {
  if (treinamentosSelecionados.length === 0) {
    toast.error('Selecione pelo menos um treinamento');
    return;
  }
  try {
    for (const treinamentoId of treinamentosSelecionados) {
      let treinamentoData = treinamentosFuncao.find(t => t.id === treinamentoId);
      if (!treinamentoData) continue;
      if (editandoDatasTreinamento[treinamentoId]) {
        treinamentoData = {
          ...treinamentoData,
          data_inicio: editandoDatasTreinamento[treinamentoId].data_inicio || treinamentoData.data_inicio,
          data_fim: editandoDatasTreinamento[treinamentoId].data_fim || treinamentoData.data_fim
        };
      }
      const doc = await gerarCertificadoDoc({ treinamento: treinamentoData, funcionario: funcionarioTreinamentos, empresaAtiva });
      doc.save(`certificado_${treinamentoData.codigo || treinamentoData.nome.replace(/\s+/g, '_')}_${funcionarioTreinamentos.nome_completo.replace(/\s+/g, '_')}.pdf`);
    }
    toast.success(`${treinamentosSelecionados.length} certificado(s) gerado(s)`);
  } catch (error) {
    console.error('Erro ao gerar certificados:', error);
    toast.error('Erro ao gerar certificados');
  }
}