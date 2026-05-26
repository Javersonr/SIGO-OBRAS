import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export default function ReservaDetalheModal({ open, onOpenChange, reservas, grupo, onUpdate }) {
  if (!grupo) return null;

  const itens = reservas.filter(
    (r) => (r.grupo_id && r.grupo_id === grupo.grupo_id) || (!r.grupo_id && r.id === grupo.grupo_id)
  );

  const statusColor = (s) =>
    s === "Ativa"
      ? "bg-blue-100 text-blue-700"
      : s === "Concluída"
        ? "bg-green-100 text-green-700"
        : "bg-slate-100 text-slate-600";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0 flex flex-col" data-fullscreen-modal>
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0">
          <SheetHeader>
            <SheetTitle>Reserva {grupo.numero}</SheetTitle>
          </SheetHeader>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
            <span>
              <strong>Projeto:</strong> {grupo.projeto_nome || "-"}
            </span>
            <span>
              <strong>Solicitante:</strong> {grupo.solicitante_nome || "-"}
            </span>
            <span>
              <strong>Data:</strong>{" "}
              {grupo.data_reserva ? new Date(grupo.data_reserva).toLocaleDateString("pt-BR") : "-"}
            </span>
            {grupo.data_necessidade && (
              <span>
                <strong>Necessidade:</strong>{" "}
                {new Date(grupo.data_necessidade).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
          {grupo.observacoes && (
            <p className="mt-2 text-sm text-slate-500 italic">{grupo.observacoes}</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Materiais ({itens.length})</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Almoxarifado</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-medium">{item.material_descricao || "-"}</p>
                    {item.material_codigo && (
                      <p className="text-xs text-slate-500">{item.material_codigo}</p>
                    )}
                  </TableCell>
                  <TableCell>{item.almoxarifado_nome || "-"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {item.quantidade_reservada} {item.unidade}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColor(item.status)}>{item.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="sticky bottom-0 bg-white border-t p-4 flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
