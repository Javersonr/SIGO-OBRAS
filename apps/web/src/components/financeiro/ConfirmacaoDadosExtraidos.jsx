import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function ConfirmacaoDadosExtraidos({ dados, comprovanteUrl, onConfirm, onCancel, loading }) {
  const [dadosEditados, setDadosEditados] = useState(dados || {});
  const [erros, setErros] = useState({});

  const validar = () => {
    const novosErros = {};
    
    if (!dadosEditados.valor || parseFloat(dadosEditados.valor) <= 0) {
      novosErros.valor = 'Valor deve ser maior que zero';
    }
    if (!dadosEditados.fornecedor?.trim()) {
      novosErros.fornecedor = 'Fornecedor é obrigatório';
    }

    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  };

  const handleConfirm = () => {
    if (validar()) {
      onConfirm({
        ...dadosEditados,
        valor: parseFloat(dadosEditados.valor)
      });
    }
  };

  const handleChange = (field, value) => {
    setDadosEditados(prev => ({
      ...prev,
      [field]: value
    }));
    if (erros[field]) {
      setErros(prev => {
        const novoErros = { ...prev };
        delete novoErros[field];
        return novoErros;
      });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          Confirmar Dados Extraídos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Preview do Comprovante */}
        {comprovanteUrl && (
          <div>
            <Label className="text-sm text-slate-600 mb-2 block">Comprovante</Label>
            <img 
              src={comprovanteUrl} 
              alt="Comprovante" 
              className="w-full rounded-lg max-h-48 object-cover border border-slate-200"
            />
          </div>
        )}

        {/* Dados Extraídos para Edição */}
        <div className="space-y-4">
          
          {/* Valor */}
          <div>
            <Label htmlFor="valor" className="text-sm font-medium">
              Valor *
            </Label>
            <Input
              id="valor"
              type="number"
              step="0.01"
              min="0"
              value={dadosEditados.valor || ''}
              onChange={(e) => handleChange('valor', e.target.value)}
              className={erros.valor ? 'border-red-500' : ''}
              placeholder="0.00"
            />
            {erros.valor && (
              <p className="text-red-500 text-xs mt-1">{erros.valor}</p>
            )}
          </div>

          {/* Fornecedor */}
          <div>
            <Label htmlFor="fornecedor" className="text-sm font-medium">
              Fornecedor *
            </Label>
            <Input
              id="fornecedor"
              value={dadosEditados.fornecedor || ''}
              onChange={(e) => handleChange('fornecedor', e.target.value)}
              className={erros.fornecedor ? 'border-red-500' : ''}
              placeholder="Nome do fornecedor"
            />
            {erros.fornecedor && (
              <p className="text-red-500 text-xs mt-1">{erros.fornecedor}</p>
            )}
          </div>

          {/* CNPJ */}
          <div>
            <Label htmlFor="cnpj" className="text-sm font-medium">
              CNPJ
            </Label>
            <Input
              id="cnpj"
              value={dadosEditados.cnpj || ''}
              onChange={(e) => handleChange('cnpj', e.target.value)}
              placeholder="00.000.000/0000-00"
            />
          </div>

          {/* Endereço */}
          <div>
            <Label htmlFor="endereco" className="text-sm font-medium">
              Endereço
            </Label>
            <Input
              id="endereco"
              value={dadosEditados.endereco || ''}
              onChange={(e) => handleChange('endereco', e.target.value)}
              placeholder="Rua, número, complemento"
            />
          </div>

          {/* Telefone */}
          <div>
            <Label htmlFor="telefone" className="text-sm font-medium">
              Telefone
            </Label>
            <Input
              id="telefone"
              value={dadosEditados.telefone || ''}
              onChange={(e) => handleChange('telefone', e.target.value)}
              placeholder="(XX) XXXXX-XXXX"
            />
          </div>

          {/* Descrição */}
          <div>
            <Label htmlFor="descricao" className="text-sm font-medium">
              Descrição / Itens
            </Label>
            <Textarea
              id="descricao"
              value={dadosEditados.descricao || ''}
              onChange={(e) => handleChange('descricao', e.target.value)}
              placeholder="Descrição dos itens ou serviços"
              rows={3}
            />
          </div>

          {/* Data */}
          <div>
            <Label htmlFor="data" className="text-sm font-medium">
              Data
            </Label>
            <Input
              id="data"
              type="date"
              value={dadosEditados.data || ''}
              onChange={(e) => handleChange('data', e.target.value)}
            />
          </div>
        </div>

        {/* Aviso */}
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            Revise os dados extraídos. Você poderá ajustá-los após confirmação durante a seleção de projeto e lançamento.
          </AlertDescription>
        </Alert>

        {/* Botões */}
        <div className="flex gap-2">
          <Button
            onClick={handleConfirm}
            className="flex-1 bg-green-600 hover:bg-green-700"
            disabled={loading}
          >
            {loading ? 'Processando...' : 'Confirmar e Continuar'}
          </Button>
          <Button
            onClick={onCancel}
            variant="outline"
            className="flex-1"
            disabled={loading}
          >
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}