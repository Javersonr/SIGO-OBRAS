import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import PermissionGate from '../PermissionGate';

export default function OportunidadesHeader({ onOpenModal, onExport, onStatusConfig, onHandleOpenModal }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Oportunidades</h1>
        <p className="text-slate-500">Gerencie seu pipeline comercial</p>
      </div>
      <div className="flex gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              Ações
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <PermissionGate modulo="Oportunidades" aba="Lista" funcao="exportar">
              <DropdownMenuItem onClick={onExport} className="gap-2">
                Exportar CSV
              </DropdownMenuItem>
            </PermissionGate>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onStatusConfig} className="gap-2">
              Gerenciar Status e Origens
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <PermissionGate modulo="Oportunidades" aba="Lista" funcao="criar">
          <Button onClick={onOpenModal} className="bg-amber-500 hover:bg-amber-600" size="icon">
            <Plus className="w-4 h-4" />
          </Button>
        </PermissionGate>
      </div>
    </div>
  );
}