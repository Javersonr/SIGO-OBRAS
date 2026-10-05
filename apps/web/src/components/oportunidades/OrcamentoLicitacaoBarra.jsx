import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileDown, Loader2, Sparkles, Upload } from "lucide-react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/formatters";
import { aplicarDesconto, resumoOrcamento, validarDesconto } from "@/lib/orcamento-desconto";
import {
  cancelarGravacoesPendentes,
  emLotes,
  ordenarItensOportunidade,
  temGravacaoPendente,
} from "@/lib/orcamento-registros";
import { CAMINHO_SKILL, montarZipSkill, textoSkillValido } from "@/lib/skill-orcamento";
import ImportarPlanilhaOrcamentoDialog from "./ImportarPlanilhaOrcamentoDialog";
import ExportarPropostaDialog from "./ExportarPropostaDialog";

const AVISO_APLICAR =
  "Recalcula todos os itens importados a partir do preço da prefeitura; ajustes feitos à mão nesses itens serão substituídos.";

// 12.35 → "12,35" (campo de digitação, sem casas forçadas)
const pctParaCampo = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(n).replace(".", ",") : "0";
};
// 12.3 → "12,30" (exibição)
const formatPct = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Barra da aba Orçamento da oportunidade (licitação): Baixar modelo, Skill do
 * Claude, Importar planilha, Desconto (%) + Aplicar e o resumo dos totais.
 *
 * Autocontida: grava direto pelo sigo.entities e atualiza o estado pelos
 * setters recebidos (o CalendarioConsolidado passa callbacks vazios para as
 * ações antigas do OportunidadeDetalhe; esta barra não depende delas).
 * `importarAberto`/`onImportarAbertoChange` são opcionais: o
 * OportunidadeDetalhe os passa para o card "Importar" do estado vazio abrir o
 * mesmo diálogo; sem eles a barra usa estado próprio.
 * `onAplicandoChange(bool)` é opcional: avisa quando o Aplicar começa e termina, para o
 * OportunidadeDetalhe travar a tabela enquanto o desconto grava.
 */
export default function OrcamentoLicitacaoBarra({
  selectedOp,
  setSelectedOp,
  setOportunidades,
  orcamentoItens,
  setOrcamentoItens,
  empresaAtiva,
  updateTimeoutRef,
  podeEditar,
  importarAberto,
  onImportarAbertoChange,
  onAplicandoChange,
  user,
}) {
  const [importarInterno, setImportarInterno] = useState(false);
  const dialogoAberto = importarAberto ?? importarInterno;
  const mudarDialogo = onImportarAbertoChange ?? setImportarInterno;

  const opId = selectedOp?.id;
  const pctSalvo = selectedOp?.desconto_proposta_pct ?? 0;
  const [desconto, setDesconto] = useState(() => pctParaCampo(pctSalvo));
  useEffect(() => {
    setDesconto(pctParaCampo(pctSalvo));
  }, [opId, pctSalvo]);

  const [aplicando, setAplicandoLocal] = useState(false);
  const setAplicando = (valor) => {
    setAplicandoLocal(valor);
    onAplicandoChange?.(valor);
  };
  const [baixandoSkill, setBaixandoSkill] = useState(false);
  const [exportarAberto, setExportarAberto] = useState(false);

  const resumo = useMemo(() => resumoOrcamento(orcamentoItens || []), [orcamentoItens]);
  const qtdSemReferencia = resumo.itensSemReferencia;

  const atualizarOportunidadeLocal = (patch) => {
    setSelectedOp?.((prev) => (prev?.id === opId ? { ...prev, ...patch } : prev));
    setOportunidades?.((prev) => prev.map((o) => (o.id === opId ? { ...o, ...patch } : o)));
  };

  const recarregarItens = async () => {
    try {
      const lista = await sigo.entities.OrcamentoItem.filter({
        empresa_id: empresaAtiva.id,
        oportunidade_id: opId,
      });
      setOrcamentoItens(ordenarItensOportunidade(lista));
    } catch (e) {
      console.error("Erro ao recarregar o orçamento:", e);
    }
  };

  const handleBaixarModelo = async () => {
    try {
      const [XLSX, { gerarModelo }] = await Promise.all([
        import("xlsx"),
        import("@/lib/orcamento-modelo"),
      ]);
      XLSX.writeFile(gerarModelo(), "Modelo de orcamento SIGO.xlsx");
    } catch (e) {
      console.error("Erro ao gerar o modelo:", e);
      toast.error(`Erro ao gerar o modelo: ${e?.message || "erro desconhecido"}`);
    }
  };

  const handleBaixarSkill = async () => {
    setBaixandoSkill(true);
    try {
      const resp = await fetch(CAMINHO_SKILL, { cache: "no-store" });
      const texto = resp.ok ? await resp.text() : "";
      // o .htaccess devolve o index.html com 200 quando o arquivo não existe
      if (!textoSkillValido(texto)) throw new Error("arquivo da skill não encontrado no site");
      const [{ default: JSZip }, { saveAs }] = await Promise.all([
        import("jszip"),
        import("file-saver"),
      ]);
      const blob = await montarZipSkill(JSZip, texto);
      saveAs(blob, "orcamento-prefeitura-sigo.zip");
      toast.success(
        "Skill baixada. Para instalar: Claude → Configurações → Capacidades → Skills → Enviar (escolha o .zip).",
        { duration: 12000 }
      );
    } catch (e) {
      console.error("Erro ao baixar a skill:", e);
      toast.error(`Erro ao baixar a skill: ${e?.message || "erro desconhecido"}`);
    } finally {
      setBaixandoSkill(false);
    }
  };

  const handleAplicar = async () => {
    if (!opId || !empresaAtiva?.id) return;
    // Edição por campo ainda no debounce de 1,5 s (ou gravando: a chave só sai do mapa depois do
    // await). Cancelar o timer perderia a edição, e o desconto recalculado a partir do estado
    // local deixaria o banco com a quantidade antiga e o total novo. Espera gravar e aplica de novo.
    if (temGravacaoPendente(updateTimeoutRef)) {
      toast.info("Aguarde a gravação da última edição e aplique de novo");
      return;
    }
    const validacao = validarDesconto(desconto);
    if (!validacao.ok) {
      toast.error(validacao.erro);
      return;
    }
    const pct = validacao.valor; // number de 0 a 99,99, o que o aplicarDesconto exige
    let alteracoes;
    try {
      alteracoes = aplicarDesconto(orcamentoItens || [], pct);
    } catch (e) {
      // preço de referência inválido (ex.: negativo) em algum item: nada foi gravado
      console.error("Erro ao calcular o desconto:", e);
      toast.error(`Nada foi alterado: ${e?.message || "erro ao calcular o desconto"}`);
      return;
    }
    if (alteracoes.length > 0 && !window.confirm(AVISO_APLICAR)) return;

    cancelarGravacoesPendentes(updateTimeoutRef);
    setAplicando(true);
    const idToast = toast.loading("Aplicando o desconto…");
    try {
      let feitos = 0;
      for (const lote of emLotes(alteracoes, 10)) {
        await Promise.all(
          lote.map((a) =>
            sigo.entities.OrcamentoItem.update(a.id, {
              valor_unitario: a.valor_unitario,
              valor_total: a.valor_total,
            })
          )
        );
        feitos += lote.length;
        toast.loading(`Aplicando o desconto… ${feitos} de ${alteracoes.length}`, { id: idToast });
      }
      // Uma edição escapou da trava durante a gravação: o timer dela regrava a linha inteira com
      // o preço de antes do desconto. Mostra o que há no banco e pede para aplicar de novo (o
      // Aplicar espera essa gravação terminar). O % só é gravado numa aplicação completa.
      if (temGravacaoPendente(updateTimeoutRef)) {
        await recarregarItens();
        toast.warning(
          "Uma edição foi feita durante o Aplicar. Aguarde a gravação dela e aplique o desconto de novo",
          { id: idToast, duration: 10000 }
        );
        return;
      }
      const porId = new Map(alteracoes.map((a) => [a.id, a]));
      setOrcamentoItens((prev) =>
        prev.map((i) => {
          const a = porId.get(i.id);
          return a ? { ...i, valor_unitario: a.valor_unitario, valor_total: a.valor_total } : i;
        })
      );
      const patch = { desconto_proposta_pct: pct };
      await sigo.entities.Oportunidade.update(opId, patch);
      atualizarOportunidadeLocal(patch);
      toast.success(
        alteracoes.length > 0
          ? `Desconto de ${formatPct(pct)}% aplicado em ${alteracoes.length} itens`
          : `Desconto de ${formatPct(pct)}% gravado; nenhum item tem preço de referência`,
        { id: idToast }
      );
    } catch (e) {
      console.error("Erro ao aplicar o desconto:", e);
      toast.error(`Erro ao aplicar o desconto: ${e?.message || "erro desconhecido"}`, {
        id: idToast,
      });
      await recarregarItens();
    } finally {
      setAplicando(false);
    }
  };

  // Depois da importação (ou da recarga, se ela falhou no meio)
  const handleImportado = (itensGravados, orcamentoInfo) => {
    setOrcamentoItens(itensGravados);
    if (orcamentoInfo) atualizarOportunidadeLocal({ orcamento_info: orcamentoInfo });
  };

  const temItens = (orcamentoItens || []).length > 0;

  return (
    <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBaixarModelo}>
            <Download className="w-4 h-4" />
            Baixar modelo
          </Button>
          <Button variant="outline" size="sm" onClick={handleBaixarSkill} disabled={baixandoSkill}>
            {baixandoSkill ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Skill do Claude
          </Button>
          {podeEditar && (
            <Button size="sm" onClick={() => mudarDialogo(true)} disabled={aplicando}>
              <Upload className="w-4 h-4" />
              Importar planilha
            </Button>
          )}
          {temItens && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportarAberto(true)}
              disabled={aplicando}
            >
              <FileDown className="w-4 h-4" />
              Exportar proposta
            </Button>
          )}
          <ExportarPropostaDialog
            open={exportarAberto}
            onOpenChange={setExportarAberto}
            selectedOp={selectedOp}
            empresaAtiva={empresaAtiva}
            orcamentoItens={orcamentoItens}
            user={user}
          />
        </div>
        {podeEditar && (
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="desconto-proposta" className="text-xs text-slate-600">
                Desconto (%)
              </Label>
              <Input
                id="desconto-proposta"
                inputMode="decimal"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAplicar();
                }}
                disabled={aplicando}
                className="mt-1 h-9 w-24 bg-white"
              />
            </div>
            <Button size="sm" className="h-9" onClick={handleAplicar} disabled={aplicando}>
              {aplicando ? "Aplicando…" : "Aplicar"}
            </Button>
          </div>
        )}
      </div>

      {temItens && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
          <span>
            {"Total de referência: "}
            <strong>{formatBRL(resumo.totalReferencia)}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            {"Total da proposta: "}
            <strong className="text-green-700">{formatBRL(resumo.totalProposta)}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            {"Desconto real: "}
            <strong>{formatPct(resumo.descontoReal)}%</strong>
          </span>
          {qtdSemReferencia > 0 && (
            <span className="w-full text-amber-700">
              {qtdSemReferencia === 1
                ? "1 item sem preço de referência não recebe o desconto"
                : `${qtdSemReferencia} itens sem preço de referência não recebem o desconto`}
            </span>
          )}
        </div>
      )}

      {podeEditar && (
        <ImportarPlanilhaOrcamentoDialog
          open={dialogoAberto}
          onOpenChange={mudarDialogo}
          selectedOp={selectedOp}
          empresaAtiva={empresaAtiva}
          orcamentoItens={orcamentoItens}
          updateTimeoutRef={updateTimeoutRef}
          onImportado={handleImportado}
        />
      )}
    </div>
  );
}
