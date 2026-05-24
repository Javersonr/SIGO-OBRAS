import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Building2 } from 'lucide-react';

export default function FiltroHoldingOportunidades({ 
  empresas, 
  empresaSelecionada, 
  onEmpresaChange,
  isHoldingMode 
}) {
  if (!isHoldingMode || !empresas || empresas.length <= 1) {
    return null;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-600" />
          <span className="text-sm font-medium text-slate-700">Modo Consolidado:</span>
        </div>
        <Select value={empresaSelecionada} onValueChange={onEmpresaChange}>
          <SelectTrigger className="w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">📊 Todas as Empresas (Consolidado)</SelectItem>
            {empresas.map(emp => (
              <SelectItem key={emp.id} value={emp.id}>
                {emp.razao_social || emp.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => onEmpresaChange('todas')}>
          Reset
        </Button>
      </div>
    </div>
  );
}