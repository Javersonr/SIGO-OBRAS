import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';

export default function HoldingModeInfo({ isHoldingMode, empresaSelecionada, empresas }) {
  if (!isHoldingMode) return null;

  const empresaNome = empresaSelecionada === 'todas' 
    ? 'Todas as Empresas'
    : empresas?.find(e => e.id === empresaSelecionada)?.razao_social || 'Empresa';

  return (
    <Badge className="bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-2 px-3 py-1.5">
      <Building2 className="w-3 h-3" />
      <span className="text-xs font-medium">
        {empresaSelecionada === 'todas' ? '📊 Consolidado' : `📍 ${empresaNome}`}
      </span>
    </Badge>
  );
}