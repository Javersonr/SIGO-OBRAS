import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader, Search, Plus, Trash2 } from "lucide-react";

export default function SolicitacaoEPIModal({
  open,
  onOpenChange,
  funcionario,
  epis,
  empresaAtiva,
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [materiaisDoBanco, setMateriaisDoBanco] = useState([]);
  const [materiaisSelecionados, setMateriaisSelecionados] = useState([]);
  const [loadingMateriais, setLoadingMateriais] = useState(false);

  useEffect(() => {
    if (open && epis && epis.length > 0) {
      // Inicializar com EPIs do modelo
      const iniciaisSelecionados = epis.map((epi) => ({
        id: epi.id || `epi-${epi.item}`,
        item: epi.item,
        ca: epi.ca,
        quantidade: epi.quantidade || 1,
        tipo: "modelo",
      }));
      setMateriaisSelecionados(iniciaisSelecionados);
      buscarMateriais("");
    }
  }, [open, epis]);

  const buscarMateriais = async (termo) => {
    setLoadingMateriais(true);
    try {
      const materiais = await sigo.entities.Material.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });

      let filtered = materiais;
      if (termo) {
        const lower = termo.toLowerCase();
        filtered = materiais.filter(
          (m) =>
            m.nome?.toLowerCase().includes(lower) ||
            m.codigo?.toLowerCase().includes(lower) ||
            m.categoria?.toLowerCase().includes(lower)
        );
      }

      setMateriaisDoBanco(filtered);
    } catch (error) {
      console.error("Erro ao buscar materiais:", error);
    } finally {
      setLoadingMateriais(false);
    }
  };

  const handleAdicionar = (material) => {
    const jaSelecionado = materiaisSelecionados.find((m) => m.id === material.id);
    if (jaSelecionado) {
      toast.info("Este material já foi adicionado");
      return;
    }

    setMateriaisSelecionados([
      ...materiaisSelecionados,
      {
        id: material.id,
        codigo: material.codigo,
        nome: material.nome,
        quantidade: 1,
        tipo: "banco",
      },
    ]);
    toast.success(`${material.nome} adicionado`);
    setSearchTerm("");
  };

  const handleRemover = (id) => {
    setMateriaisSelecionados(materiaisSelecionados.filter((m) => m.id !== id));
  };

  const handleQuantidade = (id, novaQuantidade) => {
    const qtd = parseInt(novaQuantidade) || 1;
    if (qtd < 1) return;

    setMateriaisSelecionados(
      materiaisSelecionados.map((m) => (m.id === id ? { ...m, quantidade: qtd } : m))
    );
  };

  const handleSolicitar = async () => {
    if (materiaisSelecionados.length === 0) {
      toast.error("Adicione pelo menos um EPI");
      return;
    }

    setLoading(true);
    try {
      // Criar solicitação de compra para os EPIs
      const solicitacao = await sigo.entities.SolicitacaoCompra.create({
        empresa_id: empresaAtiva.id,
        numero: `SC-EPI-${Date.now()}`,
        solicitante_nome: funcionario.nome_completo,
        status: "Pendente Aprovação",
        prioridade: "Alta",
        observacoes: `EPIs para ${funcionario.nome_completo}. ${observacoes}`,
        total_itens: materiaisSelecionados.length,
      });

      // Criar itens da solicitação
      for (const material of materiaisSelecionados) {
        await sigo.entities.SolicitacaoCompraItem.create({
          empresa_id: empresaAtiva.id,
          solicitacao_id: solicitacao.id,
          material_id: material.id,
          descricao: material.nome || material.item,
          quantidade: material.quantidade,
          unidade: "UN",
        });
      }

      toast.success("Solicitação de EPI criada com sucesso! Almoxarife será notificado.");
      setObservacoes("");
      setMateriaisSelecionados([]);
      onOpenChange(false);

      if (onSuccess) {
        onSuccess(solicitacao);
      }
    } catch (error) {
      console.error("Erro ao criar solicitação:", error);
      toast.error("Erro ao criar solicitação de EPI");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Solicitar EPI para Almoxarifado</DialogTitle>
          <DialogDescription>
            {funcionario?.nome_completo} - Selecione e defina quantidades
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Busca de materiais */}
          <div>
            <label className="text-sm font-medium text-slate-700">Buscar e adicionar EPIs</label>
            <div className="flex gap-2 mt-1.5">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar por nome, código ou categoria..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    buscarMateriais(e.target.value);
                  }}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Sugestões de busca */}
            {searchTerm && materiaisDoBanco.length > 0 && (
              <div className="mt-2 border rounded-lg bg-white max-h-40 overflow-y-auto">
                {materiaisDoBanco.slice(0, 5).map((material) => (
                  <button
                    key={material.id}
                    onClick={() => handleAdicionar(material)}
                    className="w-full p-3 text-left hover:bg-slate-50 border-b flex items-center justify-between group transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{material.nome}</p>
                      <p className="text-xs text-slate-500">{material.codigo}</p>
                    </div>
                    <Plus className="w-4 h-4 text-slate-400 group-hover:text-amber-600 flex-shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tabela de EPIs selecionados */}
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-2">
              EPIs Selecionados ({materiaisSelecionados.length})
            </label>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-24">Código</TableHead>
                    <TableHead>Descrição / Item</TableHead>
                    <TableHead className="w-20">CA</TableHead>
                    <TableHead className="w-20">Quantidade</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materiaisSelecionados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4 text-slate-500">
                        Nenhum EPI selecionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    materiaisSelecionados.map((material) => (
                      <TableRow key={material.id} className="hover:bg-slate-50">
                        <TableCell className="text-xs text-slate-600">
                          {material.codigo || "-"}
                        </TableCell>
                        <TableCell className="text-sm">{material.nome || material.item}</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {material.ca || "-"}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={material.quantidade}
                            onChange={(e) => handleQuantidade(material.id, e.target.value)}
                            className="w-full h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleRemover(material.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="text-sm font-medium text-slate-700">Observações (opcional)</label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex: Entrega urgente, levar em caixa específica, etc."
              className="mt-1.5"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleSolicitar}
            disabled={loading || materiaisSelecionados.length === 0}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              `Solicitar ${materiaisSelecionados.length} EPI${materiaisSelecionados.length !== 1 ? "s" : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
