import React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { gerarCertificadoDoc, parseInstrutor } from "./certificadoLayout";

export default function VisualizarCertificadoModal({
  open,
  onOpenChange,
  treinamento,
  funcionario,
  empresaAtiva,
  datasEditadas,
}) {
  const instrutor = treinamento
    ? parseInstrutor(treinamento.instrutor_nome, treinamento.instrutor_cpf)
    : null;

  const handleImprimir = async () => {
    if (!treinamento || !funcionario || !empresaAtiva) return;
    const doc = await gerarCertificadoDoc({
      treinamento,
      funcionario,
      empresaAtiva,
      datasEditadas,
    });
    doc.save(
      `certificado_${treinamento.codigo || treinamento.nome.replace(/\s+/g, "_")}_${funcionario.nome_completo.replace(/\s+/g, "_")}.pdf`
    );
  };

  const nomeEmpresa =
    empresaAtiva?.razao_social || empresaAtiva?.nome_fantasia || empresaAtiva?.nome || "";
  const localEmpresa =
    empresaAtiva?.cidade && empresaAtiva?.estado
      ? `${empresaAtiva.cidade} (${empresaAtiva.estado})`
      : "";
  const dataPorExtenso = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const aproveitamento = datasEditadas?.aproveitamento || treinamento?.aproveitamento || 100;
  const cargaHoraria = treinamento?.carga_horaria || 0;
  const dataInicio = datasEditadas?.data_inicio || treinamento?.data_inicio;
  const dataFim = datasEditadas?.data_fim || treinamento?.data_fim;

  if (!treinamento || !funcionario || !empresaAtiva) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="p-4" aria-describedby={undefined}>
          <DialogTitle>Certificado de Treinamento</DialogTitle>
        </DialogContent>
      </Dialog>
    );
  }

  const handleDownloadPDF = () => {
    const link = document.createElement("a");
    link.href = `https://docs.google.com/viewer?url=${encodeURIComponent(`${window.location.origin}/certificado_${treinamento.codigo || treinamento.nome.replace(/\s+/g, "_")}_${funcionario.nome_completo.replace(/\s+/g, "_")}.pdf`)}&embedded=true`;
    link.target = "_blank";
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 flex flex-col h-[95vh] max-w-5xl w-full"
        aria-describedby={undefined}
      >
        <div className="px-6 py-4 border-b bg-white flex-shrink-0 flex items-center justify-between">
          <DialogTitle>Certificado de Treinamento</DialogTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleImprimir}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-900">
          {/* Preview do Certificado */}
          <div
            className="bg-white rounded-lg shadow-2xl max-w-4xl mx-auto"
            style={{ aspectRatio: "1.414/1" }}
          >
            {/* Banner Azul Superior */}
            <div className="h-16 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 relative">
              <div className="absolute bottom-0 left-0 right-0 h-2 bg-yellow-500" />
            </div>

            {/* Conteúdo do Certificado */}
            <div className="p-12 relative h-full flex flex-col justify-between">
              {/* Logo marca d'água */}
              {empresaAtiva?.logo_url && (
                <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                  <img
                    src={empresaAtiva.logo_url}
                    alt="Logo"
                    className="w-64 h-64 object-contain"
                  />
                </div>
              )}

              <div className="relative space-y-4 text-center flex-1 flex flex-col justify-center">
                {/* Subtítulo */}
                <p className="text-gray-400 text-xs tracking-wide">
                  ESTE CERTIFICADO ORGULHA-SE DE EMITIR
                </p>

                {/* Título Principal */}
                <h1 className="text-7xl font-bold text-yellow-600 mb-2">CERTIFICADO</h1>

                {/* Linha decorativa */}
                <p className="text-gray-500 text-sm mb-4">{"——  DE PARTICIPAÇÃO  ——"}</p>

                {/* Texto empresa */}
                <p className="text-gray-600 text-sm">{nomeEmpresa} confere a:</p>

                {/* Nome do aluno */}
                <h2 className="text-4xl font-serif italic text-blue-900 my-3">
                  {funcionario.nome_completo.toUpperCase()}
                </h2>

                {/* CPF */}
                <p className="text-gray-600 text-sm">CPF: {funcionario.cpf}</p>

                {/* Texto treinamento */}
                <div className="mt-4 space-y-1">
                  <p className="text-gray-800 font-bold text-sm">
                    {treinamento.codigo && `${treinamento.codigo} – `}
                    {treinamento.nome.toUpperCase()}
                  </p>
                  <p className="text-gray-700 text-sm">
                    Aproveitamento: {aproveitamento}% | Carga Horária: {cargaHoraria} horas/aula
                  </p>
                  <p className="text-gray-700 text-sm">
                    {dataInicio && dataFim
                      ? `Data: ${format(new Date(dataInicio + "T00:00:00"), "dd/MM/yyyy")}`
                      : `Data: ${format(new Date(), "dd/MM/yyyy")}`}
                  </p>
                  <p className="text-gray-700 text-sm">{localEmpresa}</p>
                </div>
              </div>

              {/* Assinaturas - Banner Azul Inferior */}
              <div className="mt-8 pt-4 border-t border-gray-300">
                <div className="grid grid-cols-3 gap-6 text-center">
                  {/* Instrutor */}
                  <div>
                    {treinamento.instrutor_assinatura_url ? (
                      <img
                        src={treinamento.instrutor_assinatura_url}
                        alt="Assinatura Instrutor"
                        className="h-8 mx-auto mb-1 object-contain"
                      />
                    ) : (
                      <div className="border-t border-gray-400 mb-1 h-6" />
                    )}
                    <p className="text-xs font-medium text-gray-700">
                      {instrutor.nome || "_____________________"}
                    </p>
                    <p className="text-xs text-gray-600">Instrutor</p>
                  </div>

                  {/* Aluno */}
                  <div>
                    <div className="border-t border-gray-400 mb-1 h-6" />
                    <p className="text-xs font-medium text-gray-700">{funcionario.nome_completo}</p>
                    <p className="text-xs text-gray-600">Aluno</p>
                  </div>

                  {/* Responsável Técnico */}
                  <div>
                    {treinamento.responsavel_tecnico_assinatura_url ||
                    treinamento.engenheiro_responsavel_assinatura_url ? (
                      <img
                        src={
                          treinamento.responsavel_tecnico_assinatura_url ||
                          treinamento.engenheiro_responsavel_assinatura_url
                        }
                        alt="Assinatura Responsável"
                        className="h-8 mx-auto mb-1 object-contain"
                      />
                    ) : (
                      <div className="border-t border-gray-400 mb-1 h-6" />
                    )}
                    <p className="text-xs font-medium text-gray-700">
                      {treinamento.responsavel_tecnico_nome ||
                        treinamento.engenheiro_responsavel_nome ||
                        "_____________________"}
                    </p>
                    <p className="text-xs text-gray-600">Responsável Técnico</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Conteúdo Programático (se existir) */}
          {treinamento.conteudo_programatico && (
            <div className="bg-white rounded-lg shadow-2xl p-12 max-w-4xl mx-auto mt-8">
              <div className="h-12 bg-gradient-to-r from-blue-900 to-blue-700 relative mb-8 -mx-12 -mt-12">
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-yellow-500" />
              </div>

              <div className="relative">
                {/* Logo marca d'água */}
                {empresaAtiva?.logo_url && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                    <img
                      src={empresaAtiva.logo_url}
                      alt="Logo"
                      className="w-48 h-48 object-contain"
                    />
                  </div>
                )}

                <div className="relative space-y-4 text-center">
                  <h2 className="text-3xl font-bold text-yellow-600">Conteúdo Programático</h2>
                  <h3 className="text-xl font-semibold text-blue-900">{treinamento.nome}</h3>

                  {treinamento.codigo && (
                    <p className="text-sm text-gray-600">Código: {treinamento.codigo}</p>
                  )}
                  {treinamento.carga_horaria && (
                    <p className="text-sm text-gray-600">
                      Carga Horária: {treinamento.carga_horaria}h
                    </p>
                  )}

                  <div className="text-left mt-8 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                    {treinamento.conteudo_programatico}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
