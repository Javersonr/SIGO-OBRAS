import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const gerarReciboMovimentacao = (movimentacao, empresa) => {
  const doc = new jsPDF();

  // Cores
  const corPrimaria = "#f59e0b";

  // Cabeçalho
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 0, 210, 25, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont(undefined, "bold");
  doc.text("RECIBO DE MOVIMENTAÇÃO", 15, 12);
  doc.text("DE FERRAMENTA", 15, 18);

  // Informações da empresa
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(empresa?.nome || "Empresa", 15, 35);
  if (empresa?.cnpj) {
    doc.text(`CNPJ: ${empresa.cnpj}`, 15, 41);
  }

  // Número do recibo
  doc.setFont(undefined, "bold");
  doc.text(`Recibo #${movimentacao.id?.substring(0, 8).toUpperCase()}`, 180, 35, {
    align: "right",
  });

  // Data de emissão
  doc.setFont(undefined, "normal");
  doc.setFontSize(9);
  doc.text(`Emitido em: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}`, 180, 41, {
    align: "right",
  });

  // Seção de informações
  let yPos = 55;

  // Tipo de movimentação
  doc.setFillColor(245, 158, 11);
  doc.rect(15, yPos - 4, 180, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, "bold");
  doc.setFontSize(11);
  doc.text(`${movimentacao.tipo_movimentacao}`, 105, yPos + 1, { align: "center" });

  yPos += 15;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);

  // Informações da ferramenta
  doc.setFont(undefined, "bold");
  doc.text("FERRAMENTA", 15, yPos);
  yPos += 6;

  doc.setFont(undefined, "normal");
  doc.setFontSize(9);
  doc.text(`Código: ${movimentacao.ferramenta_codigo}`, 15, yPos);
  yPos += 5;
  doc.text(`Descrição: ${movimentacao.ferramenta_descricao}`, 15, yPos);
  yPos += 5;
  if (movimentacao.quantidade && movimentacao.quantidade > 1) {
    doc.text(`Quantidade: ${movimentacao.quantidade}`, 15, yPos);
    yPos += 5;
  }

  yPos += 5;

  // Informações da movimentação
  doc.setFont(undefined, "bold");
  doc.setFontSize(10);
  doc.text("DETALHES DA MOVIMENTAÇÃO", 15, yPos);
  yPos += 6;

  doc.setFont(undefined, "normal");
  doc.setFontSize(9);

  // Data
  doc.text(
    `Data da Movimentação: ${format(new Date(movimentacao.data_movimentacao), "dd/MM/yyyy", { locale: ptBR })}`,
    15,
    yPos
  );
  yPos += 5;

  // Funcionário
  if (movimentacao.funcionario_nome) {
    doc.text(`Funcionário: ${movimentacao.funcionario_nome}`, 15, yPos);
    yPos += 5;
  }

  // Projeto
  if (movimentacao.projeto_nome) {
    doc.text(`Projeto: ${movimentacao.projeto_nome}`, 15, yPos);
    yPos += 5;
  }

  // Data prevista de devolução (para empréstimos)
  if (movimentacao.tipo_movimentacao === "Empréstimo" && movimentacao.data_prevista_devolucao) {
    doc.text(
      `Data Prevista de Devolução: ${format(new Date(movimentacao.data_prevista_devolucao), "dd/MM/yyyy", { locale: ptBR })}`,
      15,
      yPos
    );
    yPos += 5;
  }

  // Motivo (para manutenção ou baixa)
  if (movimentacao.motivo_manutencao) {
    doc.text(`Motivo: ${movimentacao.motivo_manutencao}`, 15, yPos);
    yPos += 5;
  }

  if (movimentacao.motivo_baixa) {
    doc.text(`Motivo da Baixa: ${movimentacao.motivo_baixa}`, 15, yPos);
    yPos += 5;
  }

  // Status
  if (movimentacao.status) {
    doc.text(`Status: ${movimentacao.status}`, 15, yPos);
    yPos += 5;
  }

  // Observações
  if (movimentacao.observacoes) {
    yPos += 3;
    doc.setFont(undefined, "bold");
    doc.text("OBSERVAÇÕES", 15, yPos);
    yPos += 4;
    doc.setFont(undefined, "normal");
    const observacoes = doc.splitTextToSize(movimentacao.observacoes, 180);
    doc.text(observacoes, 15, yPos);
    yPos += observacoes.length * 4 + 5;
  }

  // Rodapé com assinatura
  yPos = 250;
  doc.setDrawColor(200, 200, 200);
  doc.line(15, yPos, 195, yPos);
  yPos += 8;

  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.text("Responsável pela Movimentação", 35, yPos, { align: "center" });
  doc.text("Recebedor/Funcionário", 140, yPos, { align: "center" });

  yPos += 15;
  doc.text("_________________________", 35, yPos, { align: "center" });
  doc.text("_________________________", 140, yPos, { align: "center" });

  yPos += 6;
  doc.text(movimentacao.usuario_nome || "", 35, yPos, { align: "center" });
  doc.text(movimentacao.funcionario_nome || "", 140, yPos, { align: "center" });

  // Download
  const nomeArquivo = `recibo_${movimentacao.ferramenta_codigo}_${format(new Date(), "ddMMyyyy")}`;
  doc.save(`${nomeArquivo}.pdf`);
};
