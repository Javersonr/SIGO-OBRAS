import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileSpreadsheet, Loader2, XCircle } from "lucide-react";
import { sigo } from "@/api/sigoClient";
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
import { formatBRL } from "@/lib/formatters";
import {
  cancelarGravacoesPendentes,
  emLotes,
  montarInfoOrcamento,
  montarRegistrosImportacao,
  ordenarItensOportunidade,
} from "@/lib/orcamento-registros";

const MAX_LISTADAS = 50;

/** Erros ou avisos da importação (reusada pelo ImportarCronogramaDialog). */
export function ListaMensagens({ titulo, mensagens, tom }) {
  if (!mensagens?.length) return null;
  const Icone = tom === "erro" ? XCircle : AlertTriangle;
  const cores =
    tom === "erro"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={`rounded-md border p-3 text-sm ${cores}`}>
      <p className="flex items-center gap-2 font-semibold">
        <Icone className="w-4 h-4" />
        {titulo} ({mensagens.length})
      </p>
      <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
        {mensagens.slice(0, MAX_LISTADAS).map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
      {mensagens.length > MAX_LISTADAS && (
        <p className="mt-1 text-xs">{`… e mais ${mensagens.length - MAX_LISTADAS}`}</p>
      )}
    </div>
  );
}

/**
 * Importa o .xlsx no modelo do SIGO (feito pela skill do Claude ou à mão) no
 * orçamento da oportunidade: prévia com totais, erros e avisos; ao confirmar,
 * APAGA os itens atuais (soft delete) e grava os novos em lotes de 200, com o
 * desconto atual da oportunidade já aplicado.
 *
 * onImportado(itensGravadosOrdenados, orcamentoInfo): orcamentoInfo = null
 * quando a gravação falhou no meio (a lista vem recarregada do banco) ou
 * quando só as informações da planilha não foram gravadas.
 */
export default function ImportarPlanilhaOrcamentoDialog({
  open,
  onOpenChange,
  selectedOp,
  empresaAtiva,
  orcamentoItens,
  updateTimeoutRef,
  onImportado,
}) {
  const [arquivoNome, setArquivoNome] = useState("");
  const [lendo, setLendo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [gravando, setGravando] = useState(false);
  const [progresso, setProgresso] = useState("");

  // fechou (ou trocou de oportunidade): começa do zero na próxima vez
  useEffect(() => {
    if (!open) {
      setArquivoNome("");
      setResultado(null);
      setProgresso("");
    }
  }, [open, selectedOp?.id]);

  const descontoPct = Number(selectedOp?.desconto_proposta_pct) || 0;
  const qtdAtuais = (orcamentoItens || []).length;
  const podeConfirmar =
    !!resultado &&
    resultado.erros.length === 0 &&
    resultado.itens.length > 0 &&
    !lendo &&
    !gravando;

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
      const { lerArquivoModelo } = await import("@/lib/orcamento-modelo");
      setResultado(lerArquivoModelo(await file.arrayBuffer()));
    } catch (err) {
      console.error("Erro ao ler a planilha:", err);
      toast.error(`Não foi possível ler a planilha: ${err?.message || "arquivo inválido"}`);
    } finally {
      setLendo(false);
    }
  };

  const confirmar = async () => {
    if (!podeConfirmar || !selectedOp?.id || !empresaAtiva?.id) return;
    const empresaId = empresaAtiva.id;
    const oportunidadeId = selectedOp.id;

    // Monta os registros ANTES de perguntar e de cancelar as gravações pendentes: se lançar,
    // nada foi descartado nem apagado.
    let lotes;
    try {
      const registros = montarRegistrosImportacao(resultado.itens, {
        empresaId,
        oportunidadeId,
        descontoPct,
      });
      lotes = emLotes(registros, 200);
    } catch (err) {
      // desconto salvo fora de 0 a 99,99% ou preço de referência inválido (RangeError)
      console.error("Erro ao montar os registros da importação:", err);
      toast.error(
        `Não foi possível importar: ${err?.message || "dados inválidos"}. Nada foi alterado.`
      );
      return;
    }

    if (qtdAtuais > 0 && !window.confirm(`Substituir os ${qtdAtuais} itens atuais?`)) return;

    cancelarGravacoesPendentes(updateTimeoutRef);
    setGravando(true);
    const idToast = toast.loading("Importando o orçamento…");
    let gravados = [];
    try {
      setProgresso("Apagando os itens atuais…");
      await sigo.entities.OrcamentoItem.deleteMany({
        empresa_id: empresaId,
        oportunidade_id: oportunidadeId,
      });
      for (let i = 0; i < lotes.length; i++) {
        setProgresso(`Gravando os itens: lote ${i + 1} de ${lotes.length}…`);
        gravados = gravados.concat(await sigo.entities.OrcamentoItem.bulkCreate(lotes[i]));
      }
    } catch (err) {
      console.error("Erro ao importar o orçamento:", err);
      toast.error(
        `Erro ao importar: ${err?.message || "erro desconhecido"}. A lista foi recarregada; importe de novo.`,
        { id: idToast }
      );
      try {
        const lista = await sigo.entities.OrcamentoItem.filter({
          empresa_id: empresaId,
          oportunidade_id: oportunidadeId,
        });
        onImportado?.(ordenarItensOportunidade(lista), null);
      } catch (e2) {
        console.error("Erro ao recarregar o orçamento:", e2);
      }
      setGravando(false);
      setProgresso("");
      return;
    }

    const itensOrdenados = ordenarItensOportunidade(gravados);
    const orcamentoInfo = montarInfoOrcamento(resultado.info, {
      arquivoNome,
      importadoEm: new Date().toISOString(),
    });
    try {
      await sigo.entities.Oportunidade.update(oportunidadeId, { orcamento_info: orcamentoInfo });
      onImportado?.(itensOrdenados, orcamentoInfo);
      toast.success(
        `Orçamento importado: ${resultado.totais.qtdEtapas} etapas e ${resultado.totais.qtdItens} itens`,
        { id: idToast }
      );
    } catch (err) {
      console.error("Erro ao gravar as informações da planilha:", err);
      onImportado?.(itensOrdenados, null);
      toast.warning(
        `Itens importados, mas as informações da planilha (órgão, objeto, edital) não foram gravadas: ${err?.message || "erro desconhecido"}`,
        { id: idToast }
      );
    }
    setGravando(false);
    setProgresso("");
    onOpenChange(false);
  };

  const totais = resultado?.totais;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!gravando) onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar planilha (modelo SIGO)</DialogTitle>
          <DialogDescription>
            {
              "Escolha o .xlsx no modelo do SIGO (gerado pela Skill do Claude ou preenchido no Baixar modelo). A importação substitui todo o orçamento desta oportunidade."
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

          {resultado && totais && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                {arquivoNome}
              </p>
              <div className="grid grid-cols-2 gap-3 rounded-md border bg-slate-50 p-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Etapas</p>
                  <p className="font-semibold">{totais.qtdEtapas}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Itens</p>
                  <p className="font-semibold">{totais.qtdItens}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total de referência</p>
                  <p className="font-semibold">{formatBRL(totais.referencia)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total da prefeitura</p>
                  <p className="font-semibold">
                    {totais.prefeitura != null ? formatBRL(totais.prefeitura) : "não informado"}
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                {`Os itens são gravados com o desconto atual da oportunidade: ${descontoPct.toLocaleString("pt-BR")}%.`}
                {qtdAtuais > 0 && ` Os ${qtdAtuais} itens atuais serão apagados.`}
              </p>
              <ListaMensagens
                titulo="Erros (corrija a planilha e escolha de novo)"
                mensagens={resultado.erros}
                tom="erro"
              />
              <ListaMensagens titulo="Avisos" mensagens={resultado.avisos} tom="aviso" />
            </div>
          )}

          {gravando && progresso && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              {progresso}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gravando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!podeConfirmar}>
            {gravando
              ? "Importando…"
              : resultado?.itens?.length
                ? `Importar ${resultado.itens.length} linhas`
                : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
