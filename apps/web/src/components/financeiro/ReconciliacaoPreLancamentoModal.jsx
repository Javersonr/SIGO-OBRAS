import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, X } from 'lucide-react';

export default function ReconciliacaoPreLancamentoModal({
  open,
  onOpenChange,
  preLancamento,
  onReconciliado
}) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(false);
  const [observacoes, setObservacoes] = useState('');

  const dados = typeof preLancamento.dados_extraidos === 'string'
    ? JSON.parse(preLancamento.dados_extraidos)
    : preLancamento.dados_extraidos;

  const handleReconciliar = async () => {
    setCarregando(true);
    setErro(null);

    try {
      const response = await base44.functions.invoke('reconciliarPreLancamento', {
        preLancamentoId: preLancamento.id,
        empresaId: preLancamento.empresa_id,
        observacoes
      });

      if (response.data.sucesso) {
        setSucesso(true);
        setTimeout(() => {
          onOpenChange(false);
          setSucesso(false);
          setObservacoes('');
          onReconciliado();
        }, 2000);
      } else {
        setErro(response.data.error);
      }
    } catch (err) {
      setErro('Erro ao reconciliar: ' + err.message);
      console.error('Erro:', err);
    } finally {
      setCarregando(false);
    }
  };

  if (sucesso) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md w-full h-full sm:h-auto rounded-none sm:rounded-lg p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <span className="font-semibold text-slate-900">Reconciliar</span>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-col items-center gap-4 py-8 px-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-slate-900">Reconciliado com Sucesso!</h3>
              <p className="text-sm text-slate-600 mt-1">
                O pré-lançamento foi convertido em despesa.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl w-full h-full sm:h-auto max-h-screen sm:max-h-[90vh] rounded-none sm:rounded-lg p-0 flex flex-col">
        {/* Header fixo com X */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Reconciliar Pré-Lançamento</h2>
            <p className="text-xs text-slate-500">Confirme os dados antes de converter em despesa formal</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {erro && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">{erro}</AlertDescription>
            </Alert>
          )}

          {/* Dados do Pré-Lançamento */}
          <div className="bg-slate-50 p-4 rounded-lg space-y-3">
            <h4 className="font-semibold text-slate-900">Dados Extraídos</h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-slate-600">Fornecedor</Label>
                <p className="font-medium mt-1">{dados.fornecedor}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-600">Valor</Label>
                <p className="font-medium mt-1">R$ {parseFloat(dados.valor).toFixed(2)}</p>
              </div>

              {dados.cnpj && (
                <div>
                  <Label className="text-xs text-slate-600">CNPJ</Label>
                  <p className="font-medium mt-1">{dados.cnpj}</p>
                </div>
              )}

              {dados.endereco && (
                <div>
                  <Label className="text-xs text-slate-600">Endereço</Label>
                  <p className="font-medium mt-1 text-sm">{dados.endereco}</p>
                </div>
              )}
            </div>

            {dados.descricao && (
              <div>
                <Label className="text-xs text-slate-600">Descrição</Label>
                <p className="text-sm mt-1">{dados.descricao}</p>
              </div>
            )}
          </div>

          {/* Projeto e Conta */}
          <div className="bg-blue-50 p-4 rounded-lg space-y-3">
            <h4 className="font-semibold text-slate-900">Alocação</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-slate-600">Projeto</Label>
                <p className="font-medium mt-1 text-sm">{preLancamento.projeto_nome}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-600">Conta</Label>
                <p className="font-medium mt-1 text-sm">{preLancamento.conta_financeira_id}</p>
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <Label htmlFor="observacoes" className="text-sm font-medium">
              Observações (opcional)
            </Label>
            <Textarea
              id="observacoes"
              placeholder="Adicione qualquer observação sobre este pré-lançamento"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="mt-2 h-24"
            />
          </div>

          {/* Botões */}
          <div className="flex gap-2 pb-4">
            <Button
              onClick={handleReconciliar}
              className="flex-1 bg-green-600 hover:bg-green-700"
              disabled={carregando}
            >
              {carregando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Reconciliando...
                </>
              ) : (
                'Reconciliar Agora'
              )}
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="flex-1"
              disabled={carregando}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}