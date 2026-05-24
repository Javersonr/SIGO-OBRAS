import React from 'react';
import { Progress } from '@/components/ui/progress';
import { FileDown, X } from 'lucide-react';

export default function ExportarLaudosProgress({ progresso, total, atual, fase }) {
  if (!progresso && progresso !== 0) return null;

  const percentual = total > 0 ? Math.round((atual / total) * 100) : 0;

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-72">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <FileDown className="w-5 h-5 text-blue-600 animate-bounce" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">Exportando laudos</p>
          <p className="text-xs text-slate-500 truncate">{fase}</p>
        </div>
      </div>
      <Progress value={percentual} className="h-2 mb-1" />
      <p className="text-xs text-slate-500 text-right">
        {fase === 'Compactando...' ? 'Compactando...' : `${atual} de ${total} arquivos`}
      </p>
    </div>
  );
}