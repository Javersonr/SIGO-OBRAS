import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Edit, Trash2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import InspecaoCaminhaoCampoModal from "@/components/ferramental/InspecaoCaminhaoCampoModal";
import SolicitarEntregaCaminhaoModal from "@/components/seguranca/SolicitarEntregaCaminhaoModal";

export default function CaminhoesTab({
  caminhoes,
  inspecoesCaminhao,
  funcionarios,
  empresaAtiva,
  selectedCaminhao,
  setSelectedCaminhao,
  onNovoCaminhao,
  onEditarCaminhao,
  onRecarregar,
  user,
}) {
  const [showSolicitarEntrega, setShowSolicitarEntrega] = useState(false);
  const [caminhaoParaEntrega, setCaminhaoParaEntrega] = useState(null);

  if (selectedCaminhao) {
    return (
      <InspecaoCaminhaoCampoModal
        open={true}
        onOpenChange={(open) => {
          if (!open) setSelectedCaminhao(null);
        }}
        caminhao={selectedCaminhao}
        user={{ full_name: empresaAtiva?.responsavel_principal || "Usuário", email: "" }}
        empresaAtiva={empresaAtiva}
      />
    );
  }

  return (
    <>
      <SolicitarEntregaCaminhaoModal
        open={showSolicitarEntrega}
        onOpenChange={setShowSolicitarEntrega}
        caminhao={caminhaoParaEntrega}
        empresaAtiva={empresaAtiva}
        user={user}
        onSuccess={() => {
          setShowSolicitarEntrega(false);
          setCaminhaoParaEntrega(null);
        }}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Caminhões Cadastrados</CardTitle>
            <div className="flex gap-2">
              <Button className="bg-amber-500 hover:bg-amber-600" onClick={onNovoCaminhao}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Caminhão
              </Button>
              <Button variant="outline" className="border-blue-400 hover:bg-blue-50">
                <Plus className="w-4 h-4 mr-2" />
                Nova Inspeção
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="caminhoes" className="w-full">
            <TabsList>
              <TabsTrigger value="caminhoes">Caminhões</TabsTrigger>
              <TabsTrigger value="inspecoes">Histórico de Inspeções</TabsTrigger>
            </TabsList>

            <TabsContent value="caminhoes">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Foto</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Ano</TableHead>
                    <TableHead>KM Atual</TableHead>
                    <TableHead>Motorista Padrão</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {caminhoes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                        Nenhum caminhão cadastrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    caminhoes.map((caminhao) => (
                      <TableRow
                        key={caminhao.id}
                        onClick={() => setSelectedCaminhao(caminhao)}
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <TableCell>
                          {caminhao.foto_url ? (
                            <img
                              src={caminhao.foto_url}
                              alt={caminhao.placa}
                              className="w-12 h-12 rounded object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center">
                              <span className="text-xs text-slate-400">🚛</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono font-medium hover:text-amber-600">
                          {caminhao.placa}
                        </TableCell>
                        <TableCell>{caminhao.modelo || "-"}</TableCell>
                        <TableCell>{caminhao.marca || "-"}</TableCell>
                        <TableCell>{caminhao.ano || "-"}</TableCell>
                        <TableCell>
                          {caminhao.km_atual ? `${caminhao.km_atual.toLocaleString()} km` : "-"}
                        </TableCell>
                        <TableCell>
                          {caminhao.motorista_padrao_nome ? (
                            <Badge variant="outline">{caminhao.motorista_padrao_nome}</Badge>
                          ) : (
                            <span className="text-xs text-slate-400">Não definido</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Solicitar entrega de itens"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCaminhaoParaEntrega(caminhao);
                                setShowSolicitarEntrega(true);
                              }}
                            >
                              <PackageCheck className="w-4 h-4 text-blue-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditarCaminhao(caminhao);
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Desativar o caminhão ${caminhao.placa}?`)) return;
                                try {
                                  await sigo.entities.Caminhao.update(caminhao.id, {
                                    ativo: false,
                                  });
                                  toast.success("Caminhão desativado");
                                  onRecarregar();
                                } catch {
                                  toast.error("Erro ao desativar caminhão");
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="inspecoes">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Motorista</TableHead>
                    <TableHead>KM</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Próxima Inspeção</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspecoesCaminhao.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                        Nenhuma inspeção cadastrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    inspecoesCaminhao.map((insp) => (
                      <TableRow key={insp.id}>
                        <TableCell className="font-medium">
                          {format(new Date(insp.data_inspecao + "T00:00:00"), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{insp.placa}</TableCell>
                        <TableCell>{insp.modelo || "-"}</TableCell>
                        <TableCell>{insp.motorista || "-"}</TableCell>
                        <TableCell>
                          {insp.km_atual ? `${insp.km_atual.toLocaleString()} km` : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              insp.status === "Aprovado" && "bg-green-100 text-green-700",
                              insp.status === "Reprovado" && "bg-red-100 text-red-700",
                              insp.status === "Atenção" && "bg-yellow-100 text-yellow-700"
                            )}
                          >
                            {insp.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {insp.proxima_inspecao
                            ? format(new Date(insp.proxima_inspecao + "T00:00:00"), "dd/MM/yyyy")
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
