import React from "react";
import { safeParseJSON } from "@/lib/json-utils";
import { Settings, Edit, Eye, Copy, FilePlus, Archive, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SheetTitle } from "@/components/ui/sheet";
import ResponsaveisSelect from "../shared/ResponsaveisSelect";
import { sigo } from "@/api/sigoClient";

export default function ProjetoDetailHeader({
  selectedProj,
  statusList,
  usuariosEmpresa,
  perfil,
  temPermissao,
  onClose,
  onEdit,
  onClienteView,
  onSalvarTemplate,
  onDuplicar,
  onStatusConfig,
  onArchive,
  onDelete,
  setSelectedProj,
  setProjetos,
}) {
  const statusAtual = statusList.find((s) => s.id === selectedProj.status_id);

  return (
    <div className="sticky top-0 bg-white border-b px-4 py-4 md:p-6 z-10 flex-shrink-0">
      <div className="mb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <SheetTitle className="text-lg md:text-xl pr-2">{selectedProj.nome}</SheetTitle>
              <button
                onClick={onClose}
                className="ml-2 p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex-shrink-0 touch-manipulation"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-slate-500 mt-1 mb-4">{selectedProj.cliente_nome || "Sem cliente"}</p>

            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Settings className="w-4 h-4" />
                    Ações
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {(perfil === "Admin" || temPermissao("Projetos", "Lista", "editar")) && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Edit className="w-4 h-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={onClienteView}>
                    <Eye className="w-4 h-4 mr-2" />
                    Ver como cliente
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onSalvarTemplate}>
                    <Copy className="w-4 h-4 mr-2" />
                    Salvar como template
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDuplicar}>
                    <FilePlus className="w-4 h-4" />
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onStatusConfig}>
                    <Settings className="w-4 h-4 mr-2" />
                    Gerenciar Status
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onArchive(selectedProj)}
                    className="text-orange-600"
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    Arquivar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {(perfil === "Admin" || temPermissao("Projetos", "Lista", "excluir")) && (
                    <DropdownMenuItem
                      onClick={() => onDelete(selectedProj)}
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Excluir
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onClose}>
                    <X className="w-4 h-4 mr-2" />
                    Fechar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <ResponsaveisSelect
                // responsaveis_emails: JSONB → array (supabase-js) ou string (legacy)
                responsaveisEmails={safeParseJSON(selectedProj.responsaveis_emails, [])}
                usuarios={usuariosEmpresa}
                onUpdate={async (newEmails) => {
                  const novoValor = JSON.stringify(newEmails);
                  setSelectedProj((prev) => ({ ...prev, responsaveis_emails: novoValor }));
                  setProjetos((prev) =>
                    prev.map((p) =>
                      p.id === selectedProj.id ? { ...p, responsaveis_emails: novoValor } : p
                    )
                  );
                  await sigo.entities.Projeto.update(selectedProj.id, {
                    responsaveis_emails: novoValor,
                  });
                }}
                buttonSize="h-9 w-9"
              />

              <Badge
                style={{
                  backgroundColor: statusAtual?.cor + "20",
                  color: statusAtual?.cor,
                  borderColor: statusAtual?.cor,
                }}
                className="border text-sm"
              >
                {selectedProj.status_nome}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
