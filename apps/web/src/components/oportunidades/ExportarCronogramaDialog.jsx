import React, { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { sigo } from "@/api/sigoClient";
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
import { formatarCpf } from "@/lib/cpf";
import { normalizarCronograma, resumoCronograma } from "@/lib/cronograma-ff";
import { validarRepresentante } from "@/lib/proposta-orcamento";

const AVISO_NAO_FECHA = "Todas as etapas precisam somar 100,00% para exportar";

const localDaEmpresa = (e) =>
  [e?.cidade, e?.estado]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join("/");

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
  const [local, setLocal] = useState("");
  const [data, setData] = useState("");
  const [representante, setRepresentante] = useState({ nome: "", cargo: "", cpf: "" });
  const [empresa, setEmpresa] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);

  // a empresa da sessão entra só como ponto de partida ao abrir; mudar de
  // referência depois não pode apagar o que o usuário já digitou
  const empresaAtivaRef = useRef(empresaAtiva);
  empresaAtivaRef.current = empresaAtiva;
  const empresaId = empresaAtiva?.id;

  useEffect(() => {
    if (!open || !empresaId) return undefined;
    let cancelado = false;
    const preencher = (e) => {
      setEmpresa(e || null);
      setLocal(localDaEmpresa(e));
      setRepresentante({
        nome: e?.representante_nome || "",
        cargo: e?.representante_cargo || "",
        cpf: e?.representante_cpf ? formatarCpf(e.representante_cpf) : "",
      });
    };
    setFormato("pdf");
    setData(format(new Date(), "yyyy-MM-dd"));
    preencher(empresaAtivaRef.current);
    setCarregando(true);
    sigo.entities.Empresa.get(empresaId)
      .then((e) => {
        if (!cancelado && e) preencher(e);
      })
      .catch((err) => console.error("Erro ao carregar a empresa:", err))
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
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

  const mudarRep = (campo) => (e) =>
    setRepresentante((prev) => ({
      ...prev,
      [campo]: campo === "cpf" ? formatarCpf(e.target.value) : e.target.value,
    }));

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

          <div>
            <Label className="text-xs text-slate-600">Formato</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={formato === "pdf" ? "default" : "outline"}
                onClick={() => setFormato("pdf")}
                disabled={gerando}
              >
                <FileText className="w-4 h-4" />
                PDF
              </Button>
              <Button
                type="button"
                size="sm"
                variant={formato === "xlsx" ? "default" : "outline"}
                onClick={() => setFormato("xlsx")}
                disabled={gerando}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel
              </Button>
            </div>
          </div>

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

          <div className="rounded-md border p-3 space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Representante legal
              {carregando && <Loader2 className="ml-2 inline w-3.5 h-3.5 animate-spin" />}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Label htmlFor="cronograma-rep-nome" className="text-xs text-slate-600">
                  Nome *
                </Label>
                <Input
                  id="cronograma-rep-nome"
                  value={representante.nome}
                  onChange={mudarRep("nome")}
                  placeholder={empresa?.responsavel_principal || ""}
                  disabled={gerando || carregando}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="cronograma-rep-cargo" className="text-xs text-slate-600">
                  Cargo
                </Label>
                <Input
                  id="cronograma-rep-cargo"
                  value={representante.cargo}
                  onChange={mudarRep("cargo")}
                  placeholder="Sócio-administrador"
                  disabled={gerando || carregando}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cronograma-rep-cpf" className="text-xs text-slate-600">
                  CPF
                </Label>
                <Input
                  id="cronograma-rep-cpf"
                  inputMode="numeric"
                  value={representante.cpf}
                  onChange={mudarRep("cpf")}
                  placeholder="000.000.000-00"
                  disabled={gerando || carregando}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {
                "Vale só para esta exportação. O padrão fica em Configurações → Empresa → Representante legal."
              }
            </p>
          </div>
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
