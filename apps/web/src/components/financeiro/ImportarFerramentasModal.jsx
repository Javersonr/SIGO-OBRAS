import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { sigo } from "@/api/sigoClient";
import { Wrench, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function ImportarFerramentasModal({ open, onOpenChange, itensNota, empresaAtiva }) {
  const [selecionados, setSelecionados] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [ferramentasBanco, setFerramentasBanco] = useState([]);
  const [associacoes, setAssociacoes] = useState({});

  React.useEffect(() => {
    if (open && empresaAtiva?.id) {
      loadFerramentasBanco();
    }
  }, [open, empresaAtiva?.id]);

  const loadFerramentasBanco = async () => {
    try {
      const ferramentas = await sigo.entities.Ferramenta.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });
      setFerramentasBanco(ferramentas);
    } catch (error) {
      console.error("Erro ao carregar ferramentas:", error);
    }
  };

  const handleToggleItem = (index) => {
    setSelecionados((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleAssociar = (indexItem, ferramentaId) => {
    setAssociacoes((prev) => ({
      ...prev,
      [indexItem]: ferramentaId,
    }));
  };

  const handleSalvarFeramentas = async () => {
    const itemsSelecionados = itensNota
      .map((item, i) => ({ item, index: i }))
      .filter(({ index }) => selecionados[index]);

    if (itemsSelecionados.length === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    setSalvando(true);
    try {
      const ferramentasParaCriar = [];
      const ferramentasParaAtualizar = [];

      itemsSelecionados.forEach(({ item, index }) => {
        const ferramentaAssociada = associacoes[index];

        if (ferramentaAssociada) {
          // Atualizar ferramenta existente
          ferramentasParaAtualizar.push({
            id: ferramentaAssociada,
            quantidade_estoque: Math.round(item.quantidade) || 1,
            valor_aquisicao: parseFloat(item.valor_unitario) || 0,
            data_aquisicao: new Date().toISOString().split("T")[0],
          });
        } else {
          // Criar nova ferramenta
          ferramentasParaCriar.push({
            empresa_id: empresaAtiva.id,
            codigo: item.codigo || `FER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            descricao: item.descricao,
            marca: "",
            modelo: "",
            numero_serie: "",
            status: "Disponível",
            localizacao: "Almoxarifado Central",
            quantidade_estoque: Math.round(item.quantidade) || 1,
            valor_aquisicao: parseFloat(item.valor_unitario) || 0,
            data_aquisicao: new Date().toISOString().split("T")[0],
            ativo: true,
            observacoes: `Importada da NF - ${item.descricao}`,
          });
        }
      });

      if (ferramentasParaCriar.length > 0) {
        await sigo.entities.Ferramenta.bulkCreate(ferramentasParaCriar);
      }

      for (const ferr of ferramentasParaAtualizar) {
        await sigo.entities.Ferramenta.update(ferr.id, ferr);
      }

      toast.success(
        `${ferramentasParaCriar.length} criada(s), ${ferramentasParaAtualizar.length} atualizada(s)`
      );
      setSelecionados({});
      setAssociacoes({});
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao salvar ferramentas:", error);
      toast.error("Erro ao salvar ferramentas");
    } finally {
      setSalvando(false);
    }
  };

  const totalSelecionados = Object.values(selecionados).filter(Boolean).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-600" />
            Importar Ferramentas
          </SheetTitle>
          <p className="text-sm text-slate-500 mt-2">
            Selecione os itens da nota fiscal para criar ferramentas
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {itensNota.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <AlertCircle className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-slate-500">Nenhum item disponível</p>
            </div>
          ) : (
            <div className="space-y-3">
              {itensNota.map((item, index) => {
                const ferramentasSimilares = ferramentasBanco.filter(
                  (f) =>
                    f.descricao?.toLowerCase().includes(item.descricao?.toLowerCase()) ||
                    f.codigo?.toLowerCase().includes(item.codigo?.toLowerCase())
                );

                return (
                  <div
                    key={index}
                    className="flex items-start gap-4 p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <Checkbox
                      checked={selecionados[index] || false}
                      onCheckedChange={() => handleToggleItem(index)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0 space-y-3">
                      <div>
                        <p className="font-medium text-slate-800 break-words">{item.descricao}</p>
                        <div className="grid grid-cols-3 gap-4 mt-2 text-xs text-slate-500">
                          <div>
                            <p className="text-slate-400">Código</p>
                            <p className="font-mono text-slate-700">{item.codigo || "-"}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Quantidade</p>
                            <p className="font-semibold text-slate-700">
                              {item.quantidade} {item.unidade}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400">Valor Unit.</p>
                            <p className="font-semibold text-slate-700">
                              R$ {parseFloat(item.valor_unitario || 0).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {ferramentasSimilares.length > 0 && (
                        <div className="pl-4 border-l-2 border-blue-200 bg-blue-50 p-3 rounded">
                          <Label className="text-xs text-blue-700 mb-2 block">
                            Associar com ferramenta existente:
                          </Label>
                          <select
                            value={associacoes[index] || ""}
                            onChange={(e) => handleAssociar(index, e.target.value)}
                            className="w-full text-xs border rounded px-2 py-1.5 bg-white"
                          >
                            <option value="">Nova ferramenta</option>
                            {ferramentasSimilares.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.descricao} - N° Série: {f.numero_serie || "Sem N° Série"} -{" "}
                                {f.codigo}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t p-6 space-y-3">
          {totalSelecionados > 0 && (
            <p className="text-sm text-slate-600">{totalSelecionados} item(ns) selecionado(s)</p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarFeramentas}
              disabled={totalSelecionados === 0 || salvando}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {salvando ? "Criando..." : `Criar ${totalSelecionados} Ferramenta(s)`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
