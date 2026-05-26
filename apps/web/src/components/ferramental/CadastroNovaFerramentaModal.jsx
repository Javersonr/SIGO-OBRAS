import React, { useState } from "react";
import SheetModal from "@/components/ui/sheet-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Plus } from "lucide-react";
import { toast } from "sonner";

export default function CadastroNovaFerramentaModal({
  open,
  onOpenChange,
  fotoUrl,
  tipoIdentificado,
  onCadastrar,
  onCancelar,
}) {
  const [dados, setDados] = useState({
    codigo: "",
    descricao: "",
    marca: "",
    modelo: "",
    numero_serie: "",
    observacoes: "",
  });
  const [cadastrando, setCadastrando] = useState(false);

  const handleCadastrar = async () => {
    if (!dados.codigo || !dados.descricao) {
      toast.error("Preencha código e descrição");
      return;
    }

    setCadastrando(true);
    try {
      if (onCadastrar) {
        await onCadastrar({
          ...dados,
          foto_url: fotoUrl,
          tipo_detectado: tipoIdentificado,
        });
      }
      setDados({
        codigo: "",
        descricao: "",
        marca: "",
        modelo: "",
        numero_serie: "",
        observacoes: "",
      });
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao cadastrar ferramenta");
    } finally {
      setCadastrando(false);
    }
  };

  return (
    <SheetModal
      open={open}
      onOpenChange={onOpenChange}
      title="Cadastrar Nova Ferramenta"
      footer={
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              if (onCancelar) onCancelar();
            }}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCadastrar}
            disabled={cadastrando}
            className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
          >
            <Plus className="w-4 h-4" />
            {cadastrando ? "Cadastrando..." : "Cadastrar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Card className="p-3 bg-green-50 border-green-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-green-900">Nenhuma ferramenta similar encontrada</p>
              <p className="text-xs text-green-700 mt-1">
                Deseja cadastrar esta ferramenta no banco de dados?
              </p>
              {tipoIdentificado && (
                <p className="text-xs text-green-700 mt-1">
                  <strong>Tipo detectado:</strong> {tipoIdentificado}
                </p>
              )}
            </div>
          </div>
        </Card>

        {fotoUrl && (
          <Card className="p-2 bg-slate-50 border-slate-200">
            <img src={fotoUrl} alt="Ferramenta" className="w-full h-32 object-contain rounded" />
          </Card>
        )}

        <div>
          <Label className="text-sm font-semibold">Código *</Label>
          <Input
            placeholder="Ex: FERR-001"
            value={dados.codigo}
            onChange={(e) => setDados({ ...dados, codigo: e.target.value })}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label className="text-sm font-semibold">Descrição *</Label>
          <Input
            placeholder="Ex: Martelo de carpinteiro"
            value={dados.descricao}
            onChange={(e) => setDados({ ...dados, descricao: e.target.value })}
            className="mt-1.5"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-semibold">Marca</Label>
            <Input
              placeholder="Ex: Stanley"
              value={dados.marca}
              onChange={(e) => setDados({ ...dados, marca: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-sm font-semibold">Modelo</Label>
            <Input
              placeholder="Ex: MT-100"
              value={dados.modelo}
              onChange={(e) => setDados({ ...dados, modelo: e.target.value })}
              className="mt-1.5"
            />
          </div>
        </div>

        <div>
          <Label className="text-sm font-semibold">Número de Série</Label>
          <Input
            placeholder="Opcional"
            value={dados.numero_serie}
            onChange={(e) => setDados({ ...dados, numero_serie: e.target.value })}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label className="text-sm font-semibold">Observações</Label>
          <Textarea
            placeholder="Informações adicionais"
            value={dados.observacoes}
            onChange={(e) => setDados({ ...dados, observacoes: e.target.value })}
            className="mt-1.5 h-24"
          />
        </div>
      </div>
    </SheetModal>
  );
}
