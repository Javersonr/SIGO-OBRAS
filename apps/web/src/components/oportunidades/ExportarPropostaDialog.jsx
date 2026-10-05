import React, { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
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
import { formatarCpf } from "@/lib/cpf";
import { resumoOrcamento } from "@/lib/orcamento-desconto";
import {
  descricaoVersaoProposta,
  montarDadosProposta,
  nomeArquivoProposta,
  validarRepresentante,
} from "@/lib/proposta-orcamento";

const localDaEmpresa = (e) =>
  [e?.cidade, e?.estado]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join("/");

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
  const [local, setLocal] = useState("");
  const [data, setData] = useState("");
  const [representante, setRepresentante] = useState({ nome: "", cargo: "", cpf: "" });
  const [registrar, setRegistrar] = useState(true);
  const [empresa, setEmpresa] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [versaoRegistrada, setVersaoRegistrada] = useState(null);

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
    setValidade("60");
    setData(format(new Date(), "yyyy-MM-dd"));
    setRegistrar(true);
    setVersaoRegistrada(null);
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
          <DialogTitle>Exportar proposta</DialogTitle>
          <DialogDescription>
            {`Total da proposta: ${formatBRL(resumo.totalProposta)} · ${resumo.qtdItens} ${
              resumo.qtdItens === 1 ? "item" : "itens"
            } · desconto de ${formatPct(descontoPct)}% (real ${formatPct(resumo.descontoReal)}%)`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="rounded-md border p-3 space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Representante legal
              {carregando && <Loader2 className="ml-2 inline w-3.5 h-3.5 animate-spin" />}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Label htmlFor="proposta-rep-nome" className="text-xs text-slate-600">
                  Nome *
                </Label>
                <Input
                  id="proposta-rep-nome"
                  value={representante.nome}
                  onChange={mudarRep("nome")}
                  placeholder={empresa?.responsavel_principal || ""}
                  disabled={gerando || carregando}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="proposta-rep-cargo" className="text-xs text-slate-600">
                  Cargo
                </Label>
                <Input
                  id="proposta-rep-cargo"
                  value={representante.cargo}
                  onChange={mudarRep("cargo")}
                  placeholder="Sócio-administrador"
                  disabled={gerando || carregando}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="proposta-rep-cpf" className="text-xs text-slate-600">
                  CPF
                </Label>
                <Input
                  id="proposta-rep-cpf"
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
