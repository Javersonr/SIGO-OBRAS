import React from 'react';
import { Button } from '@/components/ui/button';
import { Trophy, Copy, Archive, Trash2 } from 'lucide-react';

export default function EntityActions({ entity, onMarkAsComplete, onCopy, onArchive, onDelete, markAsCompleteTitle }) {
  const buttonSize = 'h-7 w-7';
  const iconSize = 'w-3.5 h-3.5';

  return (
    <div className="flex gap-1 justify-end">
      {onMarkAsComplete && (
        <Button
          variant="ghost"
          size="icon"
          className={buttonSize}
          title={markAsCompleteTitle || 'Marcar como Concluído'}
          onClick={(e) => { e.stopPropagation(); onMarkAsComplete(entity); }}
        >
          <Trophy className={iconSize} />
        </Button>
      )}
      {onCopy && (
        <Button
          variant="ghost"
          size="icon"
          className={buttonSize}
          title="Duplicar"
          onClick={(e) => { e.stopPropagation(); onCopy(entity); }}
        >
          <Copy className={iconSize} />
        </Button>
      )}
      {onArchive && (
        <Button
          variant="ghost"
          size="icon"
          className={buttonSize}
          title="Arquivar"
          onClick={(e) => { e.stopPropagation(); onArchive(entity); }}
        >
          <Archive className={iconSize} />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className={`${buttonSize} text-red-500 hover:text-red-600`}
          title="Excluir"
          onClick={(e) => { e.stopPropagation(); onDelete(entity); }}
        >
          <Trash2 className={iconSize} />
        </Button>
      )}
    </div>
  );
}