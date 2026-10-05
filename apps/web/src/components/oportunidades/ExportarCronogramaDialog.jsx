import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/formatters";
import { normalizarCronograma, resumoCronograma } from "@/lib/cronograma-ff";
import { validarRepresentante } from "@/lib/proposta-orcamento";
import {
  RepresentanteLegalCampos,
  SeletorFormatoExportacao,
  useRepresentanteDaEmpresa,
} from "./CamposDeExportacao";

const AVISO_NAO_FECHA = "Todas as etapas precisam somar 100,00% para exportar";

/** Resumo do cronograma como a tela mostra (as etapas do orçamento, sem as órfãs). */
function useResumo(etapas, cronograma) {
  return useMemo(
    () => resumoCronograma(etapas || [], normalizarCronograma(cronograma)),
    [etapas, cronograma]
  );
}

/** Pronto para exportar: tem etapa, tem mês e todas as linhas fecham 100,00%. */
const prontoParaExportar = (resumo) =>
  resumo.linhas.length > 0 && resumo.meses.length > 0 && resumo.todasFecham;

/**
 * "Exportar cronograma" (PDF ou Excel) do cronograma físico-financeiro da oportunidade.
 *
 * `etapas` e `cronograma` são os do quadro (o estado local, que pode estar à frente do
 * que já foi gravado). O representante legal vem de `empresa.representante_*` (lido de
 * novo ao abrir, como na proposta) e pode ser editado aqui só para esta exportação.
 * Não grava nada no banco.
 */
export default function ExportarCronogramaDialog({
  open,
  onOpenChange,
  selectedOp,
  empresaAtiva,
  etapas,
  cronograma,
}) {
  const [formato, setFormato] = useState("pdf");
  const [data, setData] = useState("");
  const [gerando, setGerando] = useState(false);
  const { empresa, local, setLocal, representante, setRepresentante, carregando } =
    useRepresentanteDaEmpresa(open, empresaAtiva);
  const empresaId = empresaAtiva?.id;

  // ao abrir: PDF e a data de hoje
  useEffect(() => {
    if (!open || !empresaId) return;
    setFormato("pdf");
    setData(format(new Date(), "yyyy-MM-dd"));
  }, [open, empresaId]);

  const resumo = useResumo(etapas, cronograma);
  const qtdMeses = resumo.meses.length;
  const qtdEtapas = resumo.linhas.length;

  const gerar = async () => {
    if (!selectedOp?.id || !empresaId) return;
    if (qtdEtapas === 0 || qtdMeses === 0) {
      toast.error("O cronograma está vazio");
      return;
    }
    if (!resumo.todasFecham) {
      toast.error(AVISO_NAO_FECHA);
      return;
    }
    const validacao = validarRepresentante(representante);
    if (!validacao.ok) {
      toast.error(validacao.erros.join(". "));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      toast.error("Informe a data do cronograma");
      return;
    }

    setGerando(true);
    try {
      // import dinâmico: xlsx, jspdf e jspdf-autotable só descem no clique
      const {
        baixarCronogramaExcel,
        baixarCronogramaPdf,
        montarDadosCronograma,
        nomeArquivoCronograma,
      } = await import("@/lib/cronograma-export");
      const dados = montarDadosCronograma({
        etapas: etapas || [],
        cronograma,
        info: selectedOp.orcamento_info,
        oportunidade: selectedOp,
        empresa: empresa || empresaAtiva,
        representante,
        opcoes: { local, dataISO: data },
      });
      const nomeOp = selectedOp.nome || selectedOp.titulo || "";
      if (formato === "pdf") {
        await baixarCronogramaPdf(dados, nomeArquivoCronograma(nomeOp, data, "pdf"));
      } else {
        await baixarCronogramaExcel(dados, nomeArquivoCronograma(nomeOp, data, "xlsx"));
      }
      toast.success("Cronograma gerado");
    } catch (err) {
      console.error("Erro ao gerar o cronograma:", err);
      toast.error(`Erro ao gerar o cronograma: ${err?.message || "erro desconhecido"}`);
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!gerando) onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exportar cronograma</DialogTitle>
          <DialogDescription>
            {`Prazo de ${qtdMeses} ${qtdMeses === 1 ? "mês" : "meses"} · ${qtdEtapas} ${
              qtdEtapas === 1 ? "etapa" : "etapas"
            } · total de ${formatBRL(resumo.totalCentavos / 100)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!resumo.todasFecham && <p className="text-sm text-red-600">{AVISO_NAO_FECHA}</p>}

          <SeletorFormatoExportacao formato={formato} setFormato={setFormato} gerando={gerando} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cronograma-local" className="text-xs text-slate-600">
                Local
              </Label>
              <Input
                id="cronograma-local"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Cidade/UF"
                disabled={gerando}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cronograma-data" className="text-xs text-slate-600">
                Data
              </Label>
              <Input
                id="cronograma-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                disabled={gerando}
                className="mt-1"
              />
            </div>
          </div>

          <RepresentanteLegalCampos
            idPrefixo="cronograma"
            representante={representante}
            setRepresentante={setRepresentante}
            empresa={empresa}
            carregando={carregando}
            gerando={gerando}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>
            Fechar
          </Button>
          <Button onClick={gerar} disabled={gerando || carregando || !prontoParaExportar(resumo)}>
            {gerando && <Loader2 className="w-4 h-4 animate-spin" />}
            {formato === "pdf" ? "Gerar PDF" : "Gerar Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Botão "Exportar" do quadro do cronograma, com o diálogo. Habilitado só quando todas as
 * etapas somam 100,00%. Não grava nada: aparece também para quem só vê a aba.
 * O `span` leva a dica porque o botão desabilitado não recebe o mouse.
 */
export function BotaoExportarCronograma({ selectedOp, empresaAtiva, etapas, cronograma }) {
  const [aberto, setAberto] = useState(false);
  const resumo = useResumo(etapas, cronograma);
  const pronto = prontoParaExportar(resumo);
  return (
    <>
      <span title={pronto ? "Exportar o cronograma em PDF ou Excel" : AVISO_NAO_FECHA}>
        <Button variant="outline" size="sm" onClick={() => setAberto(true)} disabled={!pronto}>
          <FileDown className="w-4 h-4" />
          Exportar
        </Button>
      </span>
      <ExportarCronogramaDialog
        open={aberto}
        onOpenChange={setAberto}
        selectedOp={selectedOp}
        empresaAtiva={empresaAtiva}
        etapas={etapas}
        cronograma={cronograma}
      />
    </>
  );
}
