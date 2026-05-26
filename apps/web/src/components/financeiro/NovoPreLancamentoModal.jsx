import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import CapturaComprovanteCamera from "./CapturaComprovanteCamera";
import ConfirmacaoDadosExtraidos from "./ConfirmacaoDadosExtraidos";
import SelecionarProjetoeConta from "./SelecionarProjetoeConta.jsx";
import { CheckCircle2, Loader2, X } from "lucide-react";

export default function NovoPreLancamentoModal({
  open,
  onOpenChange,
  empresaId,
  onSucesso,
  usuarioEmail,
  verTodos,
  isAdmin,
}) {
  const [etapa, setEtapa] = useState("captura"); // 'captura' | 'confirmacao' | 'selecao' | 'sucesso'
  const [comprovanteUrl, setComprovanteUrl] = useState(null);
  const [dadosExtraidos, setDadosExtraidos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [preLancamentoCriado, setPreLancamentoCriado] = useState(null);

  const handleCaptura = async (fileUrl) => {
    setLoading(true);
    setErro(null);

    try {
      const response = await sigo.functions.invoke("extrairDadosComprovante", {
        file_url: fileUrl,
      });

      if (response.data.sucesso) {
        setComprovanteUrl(fileUrl);
        setDadosExtraidos(response.data.dados);
        setEtapa("confirmacao");
      } else {
        setErro(response.data.error || "Erro ao extrair dados");
      }
    } catch (err) {
      setErro("Erro ao processar comprovante: " + err.message);
      console.error("Erro:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmacao = (dadosEditados) => {
    setDadosExtraidos(dadosEditados);
    setEtapa("selecao");
  };

  const handleSelecao = async (dadosSelecao) => {
    setLoading(true);
    setErro(null);

    try {
      const response = await sigo.functions.invoke("criarPreLancamento", {
        empresa_id: empresaId,
        comprovante_url: comprovanteUrl,
        dados_extraidos: dadosExtraidos,
        projeto_id: dadosSelecao.projeto_id,
        projeto_nome: dadosSelecao.projeto_nome,
        conta_financeira_id: dadosSelecao.conta_financeira_id,
        usuario_email_override: usuarioEmail,
      });

      if (response.data.sucesso) {
        setPreLancamentoCriado(response.data.preLancamento);
        setEtapa("sucesso");
        setTimeout(() => {
          fechar();
          if (onSucesso) {
            onSucesso(response.data.preLancamento);
          }
        }, 2000);
      } else {
        setErro(response.data.error);
      }
    } catch (err) {
      setErro("Erro ao criar pré-lançamento: " + err.message);
      console.error("Erro:", err);
    } finally {
      setLoading(false);
    }
  };

  const voltar = () => {
    if (etapa === "confirmacao") {
      setEtapa("captura");
    } else if (etapa === "selecao") {
      setEtapa("confirmacao");
    }
  };

  const fechar = () => {
    setEtapa("captura");
    setComprovanteUrl(null);
    setDadosExtraidos(null);
    setErro(null);
    setPreLancamentoCriado(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-2xl w-full h-full sm:h-auto max-h-screen sm:max-h-[90vh] overflow-y-auto rounded-none sm:rounded-lg p-0 flex flex-col">
        {/* Header fixo com X */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
          <h2 className="text-base font-semibold text-slate-900">
            {etapa === "captura" && "Novo Pré-Lançamento"}
            {etapa === "confirmacao" && "Confirmar Dados"}
            {etapa === "selecao" && "Selecionar Projeto"}
            {etapa === "sucesso" && "Sucesso!"}
          </h2>
          <Button variant="ghost" size="icon" onClick={fechar} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {erro && (
            <Alert className="border-red-200 bg-red-50 mb-4">
              <AlertDescription className="text-red-800">{erro}</AlertDescription>
            </Alert>
          )}

          {etapa === "captura" && (
            <CapturaComprovanteCamera onCaptura={handleCaptura} loading={loading} />
          )}

          {etapa === "confirmacao" && (
            <ConfirmacaoDadosExtraidos
              dados={dadosExtraidos}
              comprovanteUrl={comprovanteUrl}
              onConfirm={handleConfirmacao}
              onCancel={voltar}
              loading={loading}
            />
          )}

          {etapa === "selecao" && (
            <SelecionarProjetoeConta
              empresaId={empresaId}
              dados={dadosExtraidos}
              comprovanteUrl={comprovanteUrl}
              onConfirm={handleSelecao}
              onBack={voltar}
              loading={loading}
              usuarioEmail={usuarioEmail}
              verTodos={verTodos}
              isAdmin={isAdmin}
            />
          )}

          {etapa === "sucesso" && preLancamentoCriado && (
            <div className="text-center space-y-4 py-8">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Pré-Lançamento Criado!</h3>
                <p className="text-slate-600 mt-2">ID: {preLancamentoCriado.id}</p>
                <p className="text-slate-600">
                  Valor: R$ {parseFloat(preLancamentoCriado.valor).toFixed(2)}
                </p>
              </div>
              {loading && (
                <div className="flex justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
