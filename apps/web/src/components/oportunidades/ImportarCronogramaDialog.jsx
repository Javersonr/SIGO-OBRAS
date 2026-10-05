import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ListaMensagens } from "./ImportarPlanilhaOrcamentoDialog";

/**
 * Importa a aba `Cronograma` do modelo SIGO (.xlsx; pode ser o mesmo arquivo do orçamento,
 * preenchido pela skill do Claude): prévia com meses, etapas, erros e avisos (regras da spec
 * §6, em `lerArquivoCronograma`). Com erros, não importa.
 *
 * `numerosEtapas` = números das etapas de nível 1 do orçamento. Com `temCronograma`, pergunta
 * "Substituir o cronograma atual?". `onImportar(cronograma, arquivoNome)` grava e resolve
 * `true` (o diálogo fecha) ou `false` (o quadro já avisou da falha; o diálogo fica aberto).
 */
export default function ImportarCronogramaDialog({
  open,
  onOpenChange,
  numerosEtapas,
  temCronograma,
  onImportar,
}) {
  const [arquivoNome, setArquivoNome] = useState("");
  const [lendo, setLendo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [gravando, setGravando] = useState(false);

  // fechou: começa do zero na próxima vez
  useEffect(() => {
    if (!open) {
      setArquivoNome("");
      setResultado(null);
    }
  }, [open]);

  const podeConfirmar =
    !!resultado?.cronograma && resultado.erros.length === 0 && !lendo && !gravando;

  const escolherArquivo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setResultado(null);
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error("Escolha o arquivo .xlsx no modelo do SIGO");
      return;
    }
    setArquivoNome(file.name);
    setLendo(true);
    try {
      const { lerArquivoCronograma } = await import("@/lib/cronograma-modelo");
      setResultado(lerArquivoCronograma(await file.arrayBuffer(), numerosEtapas || []));
    } catch (err) {
      console.error("Erro ao ler a planilha:", err);
      toast.error(`Não foi possível ler a planilha: ${err?.message || "arquivo inválido"}`);
    } finally {
      setLendo(false);
    }
  };

  const confirmar = async () => {
    if (!podeConfirmar) return;
    if (temCronograma && !window.confirm("Substituir o cronograma atual?")) return;
    setGravando(true);
    try {
      if (await onImportar?.(resultado.cronograma, arquivoNome)) onOpenChange(false);
    } catch (err) {
      console.error("Erro ao importar o cronograma:", err);
      toast.error(`Erro ao importar o cronograma: ${err?.message || "erro desconhecido"}`);
    } finally {
      setGravando(false);
    }
  };

  const resumo = resultado?.resumo;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!gravando) onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar cronograma (modelo SIGO)</DialogTitle>
          <DialogDescription>
            {
              "Escolha o .xlsx no modelo do SIGO com a aba Cronograma (pode ser o mesmo arquivo do orçamento, preenchido pela Skill do Claude). A importação substitui o cronograma desta oportunidade."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={escolherArquivo}
            disabled={lendo || gravando}
          />

          {lendo && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              Lendo a planilha…
            </p>
          )}

          {resultado && resumo && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                {arquivoNome}
              </p>
              <div className="grid grid-cols-2 gap-3 rounded-md border bg-slate-50 p-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Meses</p>
                  <p className="font-semibold">{resumo.meses}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Etapas com linha</p>
                  <p className="font-semibold">{resumo.linhas}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Linhas ignoradas</p>
                  <p className="font-semibold">{resumo.ignoradas}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Etapas sem linha</p>
                  <p className="font-semibold">{resumo.faltando}</p>
                </div>
              </div>
              {temCronograma && resultado.cronograma && (
                <p className="text-sm text-slate-600">O cronograma atual será substituído.</p>
              )}
              <ListaMensagens
                titulo="Erros (corrija a planilha e escolha de novo)"
                mensagens={resultado.erros}
                tom="erro"
              />
              <ListaMensagens titulo="Avisos" mensagens={resultado.avisos} tom="aviso" />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gravando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!podeConfirmar}>
            {gravando && <Loader2 className="w-4 h-4 animate-spin" />}
            {gravando ? "Importando…" : "Importar cronograma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
