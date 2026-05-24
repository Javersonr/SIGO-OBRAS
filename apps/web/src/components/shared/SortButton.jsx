import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function SortButton({ sortOptions, currentSort, onSortChange }) {
  const currentOption = sortOptions.find(opt => opt.value === currentSort?.field);
  const isAsc = currentSort?.direction === 'asc';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {currentSort?.direction === 'asc' ? (
            <ArrowUp className="w-4 h-4" />
          ) : currentSort?.direction === 'desc' ? (
            <ArrowDown className="w-4 h-4" />
          ) : (
            <ArrowUpDown className="w-4 h-4" />
          )}
          {currentOption ? `Ordenar: ${currentOption.label}` : 'Ordenar'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {sortOptions.map(option => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              if (currentSort?.field === option.value) {
                // Alternar direção
                onSortChange({
                  field: option.value,
                  direction: currentSort.direction === 'asc' ? 'desc' : 'asc'
                });
              } else {
                // Nova ordenação (padrão desc para datas, asc para texto)
                onSortChange({
                  field: option.value,
                  direction: option.defaultDirection || 'desc'
                });
              }
            }}
            className="gap-2"
          >
            {currentSort?.field === option.value && (
              currentSort.direction === 'asc' ? (
                <ArrowUp className="w-4 h-4 text-amber-600" />
              ) : (
                <ArrowDown className="w-4 h-4 text-amber-600" />
              )
            )}
            <span className={currentSort?.field === option.value ? 'font-medium text-amber-600' : ''}>
              {option.label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}