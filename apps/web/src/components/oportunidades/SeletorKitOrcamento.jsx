import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

export default function SeletorKitOrcamento({ empresaId, onAdicionarKit }) {
  const [kits, setKits] = useState([]);
  const [kitSelecionado, setKitSelecionado] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarKits();
  }, [empresaId]);

  const carregarKits = async () => {
    try {
      setCarregando(true);
      const data = await sigo.entities.Kit.filter({ empresa_id: empresaId, ativo: true });
      setKits(data || []);
    } catch (err) {
      console.error("Erro ao carregar kits:", err);
    } finally {
      setCarregando(false);
    }
  };

  const handleAdicionar = () => {
    if (!kitSelecionado) return;
    const kit = kits.find((k) => k.id === kitSelecionado);
    if (!kit) return;

    onAdicionarKit({
      kit_id: kit.id,
      kit_nome: kit.nome,
      quantidade: parseFloat(quantidade) || 1,
    });

    setKitSelecionado("");
    setQuantidade("1");
  };

  return (
    <div className="p-4 border rounded-lg bg-blue-50">
      <h3 className="font-semibold text-sm mb-3">Adicionar KIT ao Orçamento</h3>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs font-medium block mb-1">Selecione o KIT</label>
          <Select value={kitSelecionado} onValueChange={setKitSelecionado} disabled={carregando}>
            <SelectTrigger>
              <SelectValue placeholder={carregando ? "Carregando..." : "Escolha um kit..."} />
            </SelectTrigger>
            <SelectContent>
              {kits.map((kit) => (
                <SelectItem key={kit.id} value={kit.id}>
                  {kit.nome} ({kit.total_itens} itens)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-20">
          <label className="text-xs font-medium block mb-1">Qtd</label>
          <Input
            type="number"
            min="0.1"
            step="0.1"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className="h-9"
          />
        </div>
        <Button
          onClick={handleAdicionar}
          disabled={!kitSelecionado || carregando}
          className="bg-blue-600 hover:bg-blue-700 h-9"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
