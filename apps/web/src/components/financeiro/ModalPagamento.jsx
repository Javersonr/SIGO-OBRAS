import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Upload, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ModalPagamento({ open, onOpenChange, despesa, empresaAtiva, onConfirm, onExcluir }) {
  const [dataPagamento, setDataPagamento] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [comprovanteUrl, setComprovanteUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open && !dataPagamento) {
      setDataPagamento(new Date().toISOString().split('T')[0]);
      setFormaPagamento(despesa?.forma_pagamento || '');
      setComprovanteUrl('');
      setUploading(false);
      setSalvando(false);
    }
  }, [open]);

  const handleUploadComprovante = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setComprovanteUrl(file_url);
    } catch (err) {
      alert('Erro ao fazer upload: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmar = async () => {
    if (!dataPagamento) {
      alert('Informe a data de pagamento.');
      return;
    }
    setSalvando(true);
    try {
      // Só atualiza no banco se for pagamento da despesa inteira (não de parcela individual)
      if (despesa?.id && despesa?._parcelaIndex === undefined) {
        await base44.entities.TransacaoFinanceira.update(despesa.id, {
          status: 'Realizado',
          data_pagamento: dataPagamento,
          ...(formaPagamento ? { forma_pagamento: formaPagamento } : {}),
        });
      }
      onOpenChange(false);
      if (onConfirm) onConfirm(dataPagamento, comprovanteUrl);
    } catch (err) {
      alert('Erro ao confirmar pagamento: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const isParcela = despesa?._parcelaIndex !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-fullscreen-modal
        className="!fixed !inset-auto !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !w-full !max-w-md !h-auto !max-h-[90vh] !rounded-xl !border !shadow-2xl flex flex-col overflow-hidden p-0"
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          maxWidth: '480px',
          height: 'auto',
          maxHeight: '90vh',
          borderRadius: '12px',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {isParcela
                ? `Confirmar Pagamento — Parcela ${(despesa?._parcelaIndex ?? 0) + 1}`
                : 'Confirmar Pagamento'}
            </h2>
            {despesa && (
              <p className="text-sm text-slate-500 mt-0.5">
                {despesa.descricao || 'Despesa'}
                {despesa.valor ? ` — R$ ${parseFloat(despesa.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Resumo */}
          {despesa && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              {despesa.fornecedor_nome && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Fornecedor</span>
                  <span className="font-medium text-slate-800">{despesa.fornecedor_nome}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Valor</span>
                <span className="font-bold text-red-600 text-base">
                  R$ {parseFloat(despesa.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {despesa.conta_nome && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Conta</span>
                  <span className="font-medium text-slate-800">{despesa.conta_nome}</span>
                </div>
              )}
            </div>
          )}

          {/* Data */}
          <div>
            <Label>Data de Pagamento *</Label>
            <Input
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Forma de pagamento */}
          <div>
            <Label>Forma de Pagamento</Label>
            <Select value={formaPagamento} onValueChange={setFormaPagamento}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Selecione a forma de pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Comprovante */}
          <div>
            <Label>Comprovante (opcional)</Label>
            <div className="mt-1.5 space-y-2">
              <input
                type="file"
                id="upload-comprovante-pagamento"
                accept="image/*,.pdf"
                onChange={handleUploadComprovante}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={uploading}
                onClick={() => document.getElementById('upload-comprovante-pagamento').click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? 'Enviando...' : 'Adicionar Comprovante'}
              </Button>
              {comprovanteUrl && (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  Comprovante anexado com sucesso
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={!dataPagamento || salvando}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {salvando ? 'Salvando...' : 'Confirmar Pagamento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}