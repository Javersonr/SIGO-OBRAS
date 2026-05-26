import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SheetModalComponent from "@/components/ui/sheet-modal";
import { ChevronLeft, Link2, SkipForward, FileText, Wrench } from "lucide-react";
import { toast } from "sonner";

export default function VincularMassaCarrosselModal({
  open,
  onOpenChange,
  ferramentas,
  funcionarios,
  caminhoes,
  empresaAtiva,
  onRefresh,
}) {
  const [index, setIndex] = useState(0);
  const [tipoVinculo, setTipoVinculo] = useState("funcionario");
  const [destinoId, setDestinoId] = useState("");
  const [saving, setSaving] = useState(false);
  const [concluidos, setConcluidos] = useState(0);

  // Apenas ferramentas com laudo (numero_laudo ou data_vencimento_laudo preenchidos)
  const ferramentasComLaudo = ferramentas.filter(
    (f) => f.numero_laudo || f.data_vencimento_laudo || f.laudo_obrigatorio
  );

  const ferramenta = ferramentasComLaudo[index];
  const total = ferramentasComLaudo.length;

  useEffect(() => {
    if (open) {
      setIndex(0);
      setTipoVinculo("funcionario");
      setDestinoId("");
      setConcluidos(0);
    }
  }, [open]);

  useEffect(() => {
    setDestinoId("");
  }, [index, tipoVinculo]);

  const handleSalvar = async () => {
    if (!destinoId || !ferramenta) return;
    setSaving(true);
    try {
      let updateData = {};
      if (tipoVinculo === "funcionario") {
        const func = funcionarios.find((f) => f.id === destinoId);
        updateData = {
          funcionario_id: destinoId,
          funcionario_nome: func?.nome_completo || "",
          localizacao: `Funcionário - ${func?.nome_completo || ""}`,
          caminhao_id: "",
          status: "Em Uso",
        };
      } else {
        const cam = caminhoes.find((c) => c.id === destinoId);
        updateData = {
          caminhao_id: destinoId,
          localizacao: cam?.placa || "",
          funcionario_id: "",
          funcionario_nome: "",
          status: "Em Uso",
        };
      }
      await sigo.entities.Ferramenta.update(ferramenta.id, updateData);
      setConcluidos((c) => c + 1);
      toast.success(`Ferramenta vinculada!`);
      avancar();
    } catch (e) {
      toast.error("Erro ao vincular ferramenta");
    } finally {
      setSaving(false);
    }
  };

  const avancar = () => {
    if (index < total - 1) {
      setIndex((i) => i + 1);
      setDestinoId("");
    } else {
      onRefresh?.();
      onOpenChange(false);
    }
  };

  const voltar = () => {
    if (index > 0) {
      setIndex((i) => i - 1);
      setDestinoId("");
    }
  };

  if (!open) return null;

  if (total === 0) {
    return (
      <SheetModalComponent
        open={open}
        onOpenChange={onOpenChange}
        title="Vinculação em Massa"
        footer={
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        }
      >
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-500">
          <Wrench className="w-12 h-12 text-slate-300" />
          <p className="text-sm">Nenhuma ferramenta com laudo encontrada.</p>
        </div>
      </SheetModalComponent>
    );
  }

  if (!ferramenta) {
    onRefresh?.();
    onOpenChange(false);
    return null;
  }

  const progresso = Math.round((index / total) * 100);
  const laudoVencido =
    ferramenta.data_vencimento_laudo && new Date(ferramenta.data_vencimento_laudo) < new Date();

  return (
    <SheetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      title="Vinculação em Massa — Ferramentas com Laudo"
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" onClick={voltar} disabled={index === 0} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={avancar} className="gap-2 text-slate-500">
              <SkipForward className="w-4 h-4" />
              Pular
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={saving || !destinoId}
              className="bg-green-600 hover:bg-green-700 gap-2"
            >
              <Link2 className="w-4 h-4" />
              {saving ? "Salvando..." : "Vincular e Avançar"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-1">
        {/* Progresso */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>
              {index + 1} de {total} ferramentas
            </span>
            <span className="font-medium text-green-600">{concluidos} vinculadas</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>

        {/* Card da ferramenta */}
        <Card
          className={`border-2 ${laudoVencido ? "border-red-300 bg-red-50" : "border-amber-200 bg-amber-50"}`}
        >
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-lg text-slate-800">{ferramenta.descricao}</p>
                <p className="font-mono text-sm text-blue-600">{ferramenta.codigo}</p>
              </div>
              <div className="flex flex-col gap-1 items-end">
                {ferramenta.tipo && <Badge variant="outline">{ferramenta.tipo}</Badge>}
                {ferramenta.status && (
                  <Badge
                    className={
                      ferramenta.status === "Disponível"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                    }
                  >
                    {ferramenta.status}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-amber-200">
              {ferramenta.numero_serie && (
                <div>
                  <p className="text-xs text-slate-500">Série</p>
                  <p className="text-sm font-medium">{ferramenta.numero_serie}</p>
                </div>
              )}
              {ferramenta.numero_laudo && (
                <div>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    Nº Laudo
                  </p>
                  <p className="text-sm font-medium">{ferramenta.numero_laudo}</p>
                </div>
              )}
              {ferramenta.data_vencimento_laudo && (
                <div>
                  <p className="text-xs text-slate-500">Venc. Laudo</p>
                  <p
                    className={`text-sm font-medium ${laudoVencido ? "text-red-600" : "text-slate-700"}`}
                  >
                    {new Date(ferramenta.data_vencimento_laudo).toLocaleDateString("pt-BR")}
                    {laudoVencido && " ⚠️ VENCIDO"}
                  </p>
                </div>
              )}
              {ferramenta.localizacao && (
                <div>
                  <p className="text-xs text-slate-500">Local atual</p>
                  <p className="text-sm font-medium">{ferramenta.localizacao}</p>
                </div>
              )}
              {ferramenta.funcionario_nome && (
                <div>
                  <p className="text-xs text-slate-500">Funcionário atual</p>
                  <p className="text-sm font-medium">{ferramenta.funcionario_nome}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Seleção de destino */}
        <div className="space-y-3">
          <div>
            <Label>Vincular para</Label>
            <div className="flex gap-2 mt-1.5">
              <button
                className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${tipoVinculo === "funcionario" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
                onClick={() => setTipoVinculo("funcionario")}
              >
                👤 Funcionário / Eletricista
              </button>
              <button
                className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${tipoVinculo === "caminhao" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
                onClick={() => setTipoVinculo("caminhao")}
              >
                🚛 Caminhão
              </button>
            </div>
          </div>

          {tipoVinculo === "funcionario" ? (
            <div>
              <Label>Selecione o funcionário</Label>
              <Select value={destinoId} onValueChange={setDestinoId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Buscar funcionário..." />
                </SelectTrigger>
                <SelectContent>
                  {[...funcionarios]
                    .sort((a, b) => (a.nome_completo || "").localeCompare(b.nome_completo || ""))
                    .map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome_completo}
                        {f.funcao_nome ? ` — ${f.funcao_nome}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>Selecione o caminhão</Label>
              <Select value={destinoId} onValueChange={setDestinoId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione o caminhão..." />
                </SelectTrigger>
                <SelectContent>
                  {caminhoes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.placa}
                      {c.modelo ? ` — ${c.modelo}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Mini navegação */}
        <div className="flex gap-1 flex-wrap justify-center pt-2">
          {ferramentasComLaudo.map((f, i) => (
            <button
              key={f.id}
              onClick={() => {
                setIndex(i);
                setDestinoId("");
              }}
              className={`w-7 h-7 rounded-full text-xs font-bold transition-all ${i === index ? "bg-blue-600 text-white" : i < index ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500 hover:bg-slate-300"}`}
              title={f.descricao}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </SheetModalComponent>
  );
}
