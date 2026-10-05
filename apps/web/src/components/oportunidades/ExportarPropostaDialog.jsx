import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { resumoOrcamento } from "@/lib/orcamento-desconto";
import {
  descricaoVersaoProposta,
  montarDadosProposta,
  nomeArquivoProposta,
  validarRepresentante,
} from "@/lib/proposta-orcamento";
import {
  RepresentanteLegalCampos,
  SeletorFormatoExportacao,
  useRepresentanteDaEmpresa,
} from "./CamposDeExportacao";

const formatPct = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * "Exportar proposta" (PDF ou Excel) do orçamento da oportunidade, com a opção
 * de registrar a versão (proposta_oportunidade, status Rascunho) na aba Geral.
 *
 * O representante legal vem de `empresa.representante_*` (lido de novo ao
 * abrir: o empresaAtiva da sessão pode ser anterior à migração 0127) e pode ser
 * editado aqui só para esta exportação: em produção só o super admin grava na
 * tabela `empresa` (RLS), então o Admin de uma empresa cliente ajusta por aqui.
 */
export default function ExportarPropostaDialog({
  open,
  onOpenChange,
  selectedOp,
  empresaAtiva,
  orcamentoItens,
  user,
}) {
  const [formato, setFormato] = useState("pdf");
  const [validade, setValidade] = useState("60");
  const [data, setData] = useState("");
  const [registrar, setRegistrar] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [versaoRegistrada, setVersaoRegistrada] = useState(null);
  const { empresa, local, setLocal, representante, setRepresentante, carregando } =
    useRepresentanteDaEmpresa(open, empresaAtiva);
  const empresaId = empresaAtiva?.id;

  // ao abrir: PDF, validade de 60 dias, a data de hoje e o registro da versão ligado
  useEffect(() => {
    if (!open || !empresaId) return;
    setFormato("pdf");
    setValidade("60");
    setData(format(new Date(), "yyyy-MM-dd"));
    setRegistrar(true);
    setVersaoRegistrada(null);
  }, [open, empresaId]);

  const resumo = useMemo(() => resumoOrcamento(orcamentoItens || []), [orcamentoItens]);
  const descontoPct = Number(selectedOp?.desconto_proposta_pct) || 0;

  const gerar = async () => {
    if (!selectedOp?.id || !empresaId) return;
    if (resumo.qtdItens === 0) {
      toast.error("O orçamento não tem itens para exportar");
      return;
    }
    const validacao = validarRepresentante(representante);
    if (!validacao.ok) {
      toast.error(validacao.erros.join(". "));
      return;
    }
    const dias = Number(validade);
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
      toast.error("Validade: informe de 1 a 365 dias");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      toast.error("Informe a data da proposta");
      return;
    }

    setGerando(true);
    try {
      const dados = montarDadosProposta({
        itens: orcamentoItens || [],
        info: selectedOp.orcamento_info,
        oportunidade: selectedOp,
        empresa: empresa || empresaAtiva,
        representante,
        opcoes: { validadeDias: dias, local, dataISO: data },
      });
      const nomeOp = selectedOp.nome || selectedOp.titulo || "";
      // import dinâmico: xlsx, jspdf e jspdf-autotable só descem no clique
      const { baixarPropostaExcel, baixarPropostaPdf } = await import("@/lib/proposta-export");
      if (formato === "pdf") {
        await baixarPropostaPdf(dados, nomeArquivoProposta(nomeOp, data, "pdf"));
      } else {
        await baixarPropostaExcel(dados, nomeArquivoProposta(nomeOp, data, "xlsx"));
      }

      if (!registrar) {
        toast.success("Proposta gerada");
        return;
      }
      try {
        const criada = await sigo.entities.PropostaOportunidade.create({
          empresa_id: empresaId,
          oportunidade_id: selectedOp.id,
          valor: dados.totalGeral,
          descricao: descricaoVersaoProposta({
            descontoPct,
            descontoReal: resumo.descontoReal,
            qtdItens: resumo.qtdItens,
          }),
          status: "Rascunho",
          criado_por_email: user?.email || null,
          criado_por_nome: user?.full_name || user?.email || null,
        });
        // gerar o outro formato em seguida não registra a mesma versão de novo
        setRegistrar(false);
        setVersaoRegistrada(criada?.versao ?? null);
        toast.success(
          `Proposta gerada e registrada como versão v${criada?.versao ?? "?"} (Rascunho), na aba Geral`
        );
      } catch (err) {
        console.error("Erro ao registrar a versão da proposta:", err);
        toast.error(
          `Arquivo gerado, mas a versão não foi registrada: ${err?.message || "erro desconhecido"}`
        );
      }
    } catch (err) {
      console.error("Erro ao gerar a proposta:", err);
      toast.error(`Erro ao gerar a proposta: ${err?.message || "erro desconhecido"}`);
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
          <DialogTitle>Exportar proposta</DialogTitle>
          <DialogDescription>
            {`Total da proposta: ${formatBRL(resumo.totalProposta)} · ${resumo.qtdItens} ${
              resumo.qtdItens === 1 ? "item" : "itens"
            } · desconto de ${formatPct(descontoPct)}% (real ${formatPct(resumo.descontoReal)}%)`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SeletorFormatoExportacao formato={formato} setFormato={setFormato} gerando={gerando} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="proposta-validade" className="text-xs text-slate-600">
                Validade (dias)
              </Label>
              <Input
                id="proposta-validade"
                inputMode="numeric"
                value={validade}
                onChange={(e) => setValidade(e.target.value.replace(/\D/g, ""))}
                disabled={gerando}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="proposta-local" className="text-xs text-slate-600">
                Local
              </Label>
              <Input
                id="proposta-local"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Cidade/UF"
                disabled={gerando}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="proposta-data" className="text-xs text-slate-600">
                Data
              </Label>
              <Input
                id="proposta-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                disabled={gerando}
                className="mt-1"
              />
            </div>
          </div>

          <RepresentanteLegalCampos
            idPrefixo="proposta"
            representante={representante}
            setRepresentante={setRepresentante}
            empresa={empresa}
            carregando={carregando}
            gerando={gerando}
          />

          <div className="flex items-center gap-2">
            <Checkbox
              id="proposta-registrar"
              checked={registrar}
              onCheckedChange={(v) => setRegistrar(v === true)}
              disabled={gerando}
            />
            <Label htmlFor="proposta-registrar" className="text-sm font-normal">
              Registrar como nova versão da proposta
            </Label>
          </div>
          {versaoRegistrada != null && (
            <p className="text-xs text-green-700">
              {`Versão v${versaoRegistrada} registrada como Rascunho (aba Geral → Propostas).`}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>
            Fechar
          </Button>
          <Button onClick={gerar} disabled={gerando || carregando}>
            {gerando && <Loader2 className="w-4 h-4 animate-spin" />}
            {formato === "pdf" ? "Gerar PDF" : "Gerar Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
