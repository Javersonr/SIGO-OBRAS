import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, FileSpreadsheet, ChevronDown, Sparkles, Award } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createPageUrl } from "@/utils";
import PermissionGate from "../PermissionGate";

export default function OportunidadesHeader({
  onOpenModal,
  onNovaDoEdital,
  onExport,
  onStatusConfig,
  onHandleOpenModal,
}) {
  const navigate = useNavigate();

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
            {/* mesma regra de "ver" da página AcervoTecnico */}
            <PermissionGate modulo="Oportunidades" aba="Lista">
              <DropdownMenuItem
                onClick={() => navigate(createPageUrl("AcervoTecnico"))}
                className="gap-2"
              >
                <Award className="w-4 h-4 text-amber-600" />
                Acervo técnico
              </DropdownMenuItem>
            </PermissionGate>
          </DropdownMenuContent>
        </DropdownMenu>

        <PermissionGate modulo="Oportunidades" aba="Lista" funcao="criar">
          {onNovaDoEdital && (
            <Button
              variant="outline"
              onClick={onNovaDoEdital}
              className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              title="Nova oportunidade a partir do edital (leitura com IA)"
              aria-label="Nova a partir do edital"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Nova a partir do edital</span>
            </Button>
          )}
          <Button
            onClick={onOpenModal}
            className="bg-amber-500 hover:bg-amber-600"
            size="icon"
            title="Nova oportunidade"
            aria-label="Nova oportunidade"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </PermissionGate>
      </div>
    </div>
  );
}
