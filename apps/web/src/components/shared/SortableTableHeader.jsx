import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';

export default function SortableTableHeader({ 
  field, 
  label, 
  currentSort, 
  onSortChange, 
  className = '',
  align = 'left'
}) {
  const isActive = currentSort?.field === field;
  const direction = currentSort?.direction;

  const handleClick = () => {
    if (isActive) {
      // Alternar direção
      onSortChange({
        field,
        direction: direction === 'asc' ? 'desc' : 'asc'
      });
    } else {
      // Nova ordenação (padrão desc)
      onSortChange({
        field,
        direction: 'desc'
      });
    }
  };

  return (
    <TableHead 
      className={`cursor-pointer hover:bg-slate-200 transition-colors select-none ${className}`}
      onClick={handleClick}
    >
      <div className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
        <span className={isActive ? 'font-bold text-amber-700' : ''}>{label}</span>
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="w-4 h-4 text-amber-600" />
          ) : (
            <ArrowDown className="w-4 h-4 text-amber-600" />
          )
        ) : (
          <ArrowUpDown className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100" />
        )}
      </div>
    </TableHead>
  );
}