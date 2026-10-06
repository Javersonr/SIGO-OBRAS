import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarRange, Columns3, Loader2, Repeat, Trash2, Upload } from "lucide-react";
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
import {
  MAX_MESES,
  ajustarMeses,
  etapasDoOrcamento,
  lerPercentual,
  normalizarCronograma,
  reperiodizar,
  resumoCronograma,
} from "@/lib/cronograma-ff";
import { filasPorChave } from "@/lib/fila-gravacao";
import ImportarCronogramaDialog from "./ImportarCronogramaDialog";
import { BotaoExportarCronograma } from "./ExportarCronogramaDialog";

// Uma fila de gravação por oportunidade, no escopo do módulo, e não uma por montagem: o quadro
// desmonta ao trocar de aba e monta de novo ao voltar, e a gravação que a montagem anterior
// deixou em voo tem de sair antes da próxima (senão a próxima, feita sobre o valor velho,
// termina depois e apaga a edição). A montagem nova parte do valor que a fila ainda grava.
const obterFilaDoCronograma = filasPorChave({
  esperaMs: 1000,
  gravar: (id, cron) => sigo.entities.Oportunidade.update(id, { cronograma_ff: cron }),
});

/** O cronograma mais novo da oportunidade: o que a fila ainda grava; senão, o do banco. */
function cronogramaMaisNovo(fila, opId, cronogramaFF) {
  const pendente = fila?.valorPendente(opId);
  return normalizarCronograma(pendente === undefined ? cronogramaFF : pendente);
}

const SEM_ITENS = "Importe o orçamento com etapas para montar o cronograma.";
const SEM_ETAPAS =
  "O orçamento não tem etapas. Reimporte a planilha com as etapas (a skill cria a etapa quando o edital tem uma só).";

// colunas fixas à esquerda quando a grade rola na horizontal (até 60 meses)
const FIXA_ITEM = "sticky left-0 z-10 w-12 min-w-[3rem] px-2";
const FIXA_ETAPA = "sticky left-12 z-10 min-w-[14rem] max-w-[18rem] px-2";

// 12.3 → "12,30"
const formatPct = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// centavos → "1.234,56" (a coluna diz que é R$)
const formatValor = (centavos) =>
  ((Number(centavos) || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const formatDataHora = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};
const agoraISO = () => new Date().toISOString();
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Total % da linha: verde com 100,00; vermelho com a soma e a diferença quando não fecha. */
function TotalLinha({ linha }) {
  if (linha.fecha) return <span className="font-semibold text-green-700">100,00%</span>;
  return (
    <div className="flex flex-col items-end">
      <span className="font-semibold text-red-600">{`${formatPct(100 - linha.diferenca)}%`}</span>
      <span className="text-[11px] text-red-600">
        {linha.diferenca > 0
          ? `falta ${formatPct(linha.diferenca)}`
          : `passa ${formatPct(-linha.diferenca)}`}
      </span>
    </div>
  );
}

/**
 * Pede o número de meses: "meses" acrescenta ou corta colunas; "reperiodizar" redistribui os %
 * mantendo a curva. `onConfirmar(modo, n)` resolve `true` quando gravou (o diálogo fecha).
 */
function MesesDialog({ modo, mesesAtuais, onFechar, onConfirmar }) {
  const aberto = modo !== null;
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) setTexto(mesesAtuais > 0 ? String(mesesAtuais) : "");
  }, [aberto, mesesAtuais]);

  const reperiodizando = modo === "reperiodizar";

  const confirmar = async () => {
    const n = Number(texto.trim());
    if (!texto.trim() || !Number.isInteger(n) || n < 1 || n > MAX_MESES) {
      toast.error(`O número de meses vai de 1 a ${MAX_MESES}`);
      return;
    }
    if (n === mesesAtuais) {
      toast.info(`O cronograma já tem ${plural(n, "mês", "meses")}`);
      return;
    }
    setSalvando(true);
    try {
      if (await onConfirmar(modo, n)) onFechar();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v && !salvando) onFechar();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {reperiodizando ? "Reperiodizar o cronograma" : "Número de meses"}
          </DialogTitle>
          <DialogDescription>
            {reperiodizando
              ? `Redistribui os % de cada etapa no novo número de meses, mantendo a forma da curva (ex.: 20/35/30/15 em 4 meses vira 55/45 em 2). Hoje: ${plural(mesesAtuais, "mês", "meses")}.`
              : "Mais meses acrescentam colunas com 0%. Menos meses cortam as colunas do fim, sem redistribuir os % (para manter a curva, use Reperiodizar)."}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="cronograma-meses" className="text-xs text-slate-600">
            {`Meses (1 a ${MAX_MESES})`}
          </Label>
          <Input
            id="cronograma-meses"
            inputMode="numeric"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmar();
            }}
            disabled={salvando}
            className="mt-1 w-28"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={salvando}>
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            {reperiodizando ? "Reperiodizar" : "Mudar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Quadro "Cronograma físico-financeiro" da aba Planejamento da oportunidade (spec
 * 2026-10-05-cronograma-fisico-financeiro-design.md §4 e §5).
 *
 * Linhas = etapas de nível 1 do orçamento; células = % de cada mês, com o R$ calculado do
 * subtotal com desconto (nada de R$ é gravado). Grava o objeto inteiro em
 * `oportunidade.cronograma_ff`: ao sair de uma célula, com espera de 1 s (fila de gravação em
 * ordem); Importar, Meses, Reperiodizar e apagar linha gravam na hora. Falha = toast e a tela
 * volta ao último gravado.
 *
 * Todas as props são opcionais: o CalendarioConsolidado reusa o OportunidadeDetalhe sem
 * `setOportunidades`. `user` é aceito (contrato) e não é usado: o cronograma não grava autor.
 * Edita quem pode editar o orçamento (`podeEditar`); os demais só veem.
 */
export default function CronogramaFisicoFinanceiro({
  selectedOp,
  setSelectedOp,
  setOportunidades,
  orcamentoItens,
  empresaAtiva,
  podeEditar,
}) {
  const opId = selectedOp?.id;
  const cronogramaFF = selectedOp?.cronograma_ff;
  const podeGravar = !!podeEditar && !!opId && !!empresaAtiva?.id;

  const etapas = useMemo(() => etapasDoOrcamento(orcamentoItens || []), [orcamentoItens]);
  const numerosEtapas = useMemo(() => etapas.map((e) => e.numero), [etapas]);

  const fila = useMemo(() => (opId ? obterFilaDoCronograma(opId) : null), [opId]);
  const [cronograma, setCronograma] = useState(() => cronogramaMaisNovo(fila, opId, cronogramaFF));
  const [edicao, setEdicao] = useState(null); // { numero, mes, texto } da célula em foco
  const [importarAberto, setImportarAberto] = useState(false);
  const [modoMeses, setModoMeses] = useState(null); // null | "meses" | "reperiodizar"

  // último estado (para os handlers), último gravado (para voltar na falha) e o último
  // cronograma_ff que esta tela gravou ou leu (para não reler o próprio eco do pai)
  const cronogramaRef = useRef(cronograma);
  const salvoRef = useRef(cronograma);
  const ecoRef = useRef(cronogramaFF);
  const opRef = useRef(selectedOp);
  opRef.current = selectedOp;
  const opIdRef = useRef(opId);
  opIdRef.current = opId;
  const paiRef = useRef({ setSelectedOp, setOportunidades });
  paiRef.current = { setSelectedOp, setOportunidades };
  const cancelarEdicaoRef = useRef(false);

  // Esc numa célula só desfaz a edição, sem fechar o detalhe da oportunidade. O Sheet (Radix)
  // escuta o Esc em captura no document e fecha a gaveta se o evento não vier com
  // defaultPrevented; a captura na window roda antes (padrão do AnexoViewer e da janela flutuante).
  useEffect(() => {
    const aoTeclarEsc = (e) => {
      if (e.key !== "Escape" || e.isComposing) return;
      const alvo = e.target;
      if (!alvo?.closest?.("[data-celula-cronograma]")) return;
      e.preventDefault();
      cancelarEdicaoRef.current = true;
      alvo.blur(); // o onBlur lê a marca, descarta o texto digitado e a limpa
      cancelarEdicaoRef.current = false; // se o blur não rodou o onBlur, não deixa a marca presa
    };
    window.addEventListener("keydown", aoTeclarEsc, true);
    return () => window.removeEventListener("keydown", aoTeclarEsc, true);
  }, []);

  const aplicarLocal = (novo) => {
    cronogramaRef.current = novo;
    setCronograma(novo);
  };

  // Avisos da fila desta oportunidade: esta montagem passa a recebê-los, também os das gravações
  // que uma montagem anterior deixou na fila. Lê os callbacks do pai e a oportunidade atual
  // pelos refs.
  useEffect(() => {
    if (!fila) return;
    fila.definirAvisos({
      aoGravar: (id, cron) => {
        if (opIdRef.current === id) salvoRef.current = cron;
        ecoRef.current = cron;
        const aplicar = (o) => (o?.id === id ? { ...o, cronograma_ff: cron } : o);
        paiRef.current.setSelectedOp?.((prev) => aplicar(prev));
        paiRef.current.setOportunidades?.((prev) =>
          Array.isArray(prev) ? prev.map(aplicar) : prev
        );
      },
      aoFalhar: (id, erro) => {
        console.error("Erro ao gravar o cronograma:", erro);
        toast.error(
          `Não foi possível gravar o cronograma: ${erro?.message || "erro desconhecido"}. A tela voltou ao último gravado.`
        );
        if (opIdRef.current === id) {
          cronogramaRef.current = salvoRef.current;
          setCronograma(salvoRef.current);
        }
      },
    });
  }, [fila]);

  // Outra oportunidade (ou o quadro montou de novo): começa do valor mais novo, o que a fila
  // ainda grava (de uma montagem anterior) ou, sem ele, o do banco; o último gravado é o do
  // banco. Ao sair (troca de oportunidade ou de aba, detalhe fechado), a edição que esperava o
  // 1 s é gravada na hora.
  useEffect(() => {
    const doBanco = opRef.current?.cronograma_ff;
    const inicial = cronogramaMaisNovo(fila, opId, doBanco);
    ecoRef.current = doBanco;
    salvoRef.current = normalizarCronograma(doBanco);
    cronogramaRef.current = inicial;
    setCronograma(inicial);
    setEdicao(null);
    return () => {
      fila?.descarregar();
    };
  }, [opId, fila]);

  // O pai trouxe outro cronograma_ff da mesma oportunidade (ex.: a gravação de um quadro
  // anterior terminou depois de este montar): adota, se aqui nada espera para gravar.
  useEffect(() => {
    if (cronogramaFF === ecoRef.current || fila?.ocupada()) return;
    ecoRef.current = cronogramaFF;
    const novo = normalizarCronograma(cronogramaFF);
    salvoRef.current = novo;
    cronogramaRef.current = novo;
    setCronograma(novo);
  }, [cronogramaFF, fila]);

  const resumo = useMemo(() => resumoCronograma(etapas, cronograma), [etapas, cronograma]);

  // Importar, Meses, Reperiodizar e apagar linha: mostra já e grava na hora (resolve true/false)
  const gravarAgora = (novo) => {
    aplicarLocal(novo);
    return fila ? fila.gravarJa(opId, novo) : Promise.resolve(false);
  };

  const confirmarCelula = (numero, mes, texto) => {
    setEdicao(null);
    if (cancelarEdicaoRef.current) {
      cancelarEdicaoRef.current = false;
      return;
    }
    if (!podeGravar) return;
    const valor = lerPercentual(texto);
    if (Number.isNaN(valor)) {
      toast.error(`"${String(texto).trim()}" não é um % de 0 a 100 (até 2 casas, ex.: 12,5)`);
      return;
    }
    const atual = cronogramaRef.current;
    const linha = atual.pct[numero];
    if (!linha && valor === null) return; // etapa sem linha e a célula continua vazia
    const novoValor = valor ?? 0;
    if (linha && linha[mes] === novoValor) return;
    const novaLinha = linha ? [...linha] : new Array(atual.meses).fill(0);
    novaLinha[mes] = novoValor;
    const novo = {
      ...atual,
      pct: { ...atual.pct, [numero]: novaLinha },
      origem: "manual",
      atualizado_em: agoraISO(),
    };
    aplicarLocal(novo);
    fila?.agendar(opId, novo);
  };

  const importar = async (cron, arquivoNome) => {
    if (!podeGravar) return false;
    const novo = {
      ...normalizarCronograma(cron),
      origem: "importado",
      ...(arquivoNome ? { arquivo_nome: arquivoNome } : {}),
      atualizado_em: agoraISO(),
    };
    const ok = await gravarAgora(novo);
    if (ok) {
      const qtd = Object.keys(novo.pct).length;
      toast.success(
        `Cronograma importado: ${plural(novo.meses, "mês", "meses")} e ${plural(qtd, "etapa", "etapas")}`
      );
    }
    return ok;
  };

  const mudarMeses = async (modo, n) => {
    if (!podeGravar) return false;
    const atual = cronogramaRef.current;
    let novo;
    try {
      if (modo === "reperiodizar") {
        const pergunta = `Reperiodizar de ${atual.meses} para ${n} meses? Os % de cada etapa são redistribuídos mantendo a forma da curva e substituem os atuais.`;
        if (!window.confirm(pergunta)) return false;
        novo = reperiodizar(atual, n);
      } else {
        const { cronograma: ajustado, cortouValores } = ajustarMeses(atual, n);
        if (cortouValores) {
          const cortados =
            n + 1 === atual.meses
              ? `O mês ${atual.meses} tem valores.`
              : `Os meses ${n + 1} a ${atual.meses} têm valores.`;
          const pergunta = `${cortados} Cortar mesmo assim? (as linhas deixam de fechar 100%)`;
          if (!window.confirm(pergunta)) return false;
        }
        novo = { ...ajustado, origem: "manual" };
      }
    } catch (e) {
      toast.error(e?.message || "Número de meses inválido");
      return false;
    }
    const ok = await gravarAgora({ ...novo, atualizado_em: agoraISO() });
    if (ok) {
      toast.success(
        modo === "reperiodizar"
          ? `Cronograma reperiodizado para ${plural(n, "mês", "meses")}`
          : `Cronograma com ${plural(n, "mês", "meses")}`
      );
    }
    return ok;
  };

  const apagarOrfa = async (numero) => {
    if (!podeGravar) return;
    const pergunta = `Apagar a linha da etapa ${numero} do cronograma? Essa etapa não existe mais no orçamento.`;
    if (!window.confirm(pergunta)) return;
    const atual = cronogramaRef.current;
    const pct = { ...atual.pct };
    delete pct[numero];
    if (await gravarAgora({ ...atual, pct, origem: "manual", atualizado_em: agoraISO() })) {
      toast.success(`Linha da etapa ${numero} apagada`);
    }
  };

  const qtdMeses = cronograma.meses;
  const meses = Array.from({ length: qtdMeses }, (_, j) => j);
  const temItens = (orcamentoItens || []).length > 0;
  const semEtapas = etapas.length === 0;
  const temCronograma = qtdMeses > 0 && Object.keys(cronograma.pct).length > 0;
  const mostrarGrade = qtdMeses > 0 && (!semEtapas || resumo.orfas.length > 0);

  const legenda = [
    plural(qtdMeses, "mês", "meses"),
    `total ${formatBRL(resumo.totalCentavos / 100)}`,
    cronograma.origem === "importado"
      ? `importado de ${cronograma.arquivo_nome || "planilha"}`
      : cronograma.origem === "manual"
        ? "ajustado na tela"
        : "",
    cronograma.atualizado_em ? `em ${formatDataHora(cronograma.atualizado_em)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const rodape = [
    {
      rotulo: "Total do mês (R$)",
      valor: formatValor(resumo.totalCentavos),
      peso: resumo.totalCentavos > 0 ? "100,00%" : "",
      mes: (m) => formatValor(m.centavos),
    },
    { rotulo: "% do mês", mes: (m) => `${formatPct(m.pct)}%` },
    { rotulo: "Acumulado (R$)", mes: (m) => formatValor(m.acumCentavos) },
    { rotulo: "Acumulado (%)", mes: (m) => `${formatPct(m.acumPct)}%` },
  ];

  const celula = (linha, mes, temLinha) => {
    const pct = temLinha ? linha.pct[mes] : null;
    const textoPct = pct === null ? "" : formatPct(pct);
    const emEdicao = edicao?.numero === linha.numero && edicao?.mes === mes;
    const reais = temLinha && linha.valores[mes] !== 0 ? formatValor(linha.valores[mes]) : "";
    return (
      <div className="flex min-w-[6.5rem] flex-col items-end gap-0.5">
        {podeGravar ? (
          <input
            type="text"
            inputMode="decimal"
            aria-label={`Etapa ${linha.numero}, Mês ${mes + 1} (%)`}
            data-celula-cronograma
            value={emEdicao ? edicao.texto : textoPct}
            onFocus={(e) => {
              setEdicao({ numero: linha.numero, mes, texto: textoPct });
              e.target.select();
            }}
            onChange={(e) => {
              const texto = e.target.value;
              setEdicao((prev) => (prev ? { ...prev, texto } : prev));
            }}
            onBlur={(e) => confirmarCelula(linha.numero, mes, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={`h-7 w-20 rounded border px-1.5 text-right text-sm focus:border-blue-500 focus:text-slate-900 focus:outline-none ${
              pct ? "border-slate-300 text-slate-800" : "border-slate-200 text-slate-400"
            }`}
          />
        ) : (
          <span className={`text-sm ${pct ? "text-slate-800" : "text-slate-400"}`}>{textoPct}</span>
        )}
        <span className="min-h-[11px] text-[11px] leading-none text-slate-400">{reais}</span>
      </div>
    );
  };

  return (
    <div className="space-y-3 rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-800">
            <CalendarRange className="w-4 h-4 text-slate-500" />
            Cronograma físico-financeiro
          </h3>
          {qtdMeses > 0 && <p className="mt-0.5 text-xs text-slate-500">{legenda}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {podeGravar && !semEtapas && (
            <>
              <Button size="sm" onClick={() => setImportarAberto(true)}>
                <Upload className="w-4 h-4" />
                Importar
              </Button>
              <Button variant="outline" size="sm" onClick={() => setModoMeses("meses")}>
                <Columns3 className="w-4 h-4" />
                Meses
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModoMeses("reperiodizar")}
                disabled={qtdMeses === 0}
              >
                <Repeat className="w-4 h-4" />
                Reperiodizar
              </Button>
            </>
          )}
          <BotaoExportarCronograma
            selectedOp={selectedOp}
            empresaAtiva={empresaAtiva}
            etapas={etapas}
            cronograma={cronograma}
          />
        </div>
      </div>

      {semEtapas && (
        <p className="rounded-md border border-dashed bg-slate-50 p-4 text-center text-sm text-slate-600">
          {temItens ? SEM_ETAPAS : SEM_ITENS}
        </p>
      )}

      {!semEtapas && qtdMeses === 0 && (
        <p className="rounded-md border border-dashed bg-slate-50 p-4 text-center text-sm text-slate-600">
          {podeGravar
            ? "Sem cronograma. Importe a aba Cronograma da planilha (a mesma do orçamento, preenchida pela skill do Claude) ou defina os Meses para preencher à mão."
            : "Sem cronograma."}
        </p>
      )}

      {mostrarGrade && (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className={`${FIXA_ITEM} bg-slate-50 py-2 text-left`}>Item</th>
                <th className={`${FIXA_ETAPA} bg-slate-50 py-2 text-left`}>Etapa</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Valor (R$)</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Peso</th>
                {meses.map((j) => (
                  <th key={j} className="whitespace-nowrap px-2 py-2 text-right">
                    {`Mês ${j + 1}`}
                  </th>
                ))}
                <th className="whitespace-nowrap px-2 py-2 text-right">Total %</th>
              </tr>
            </thead>
            <tbody>
              {resumo.linhas.map((linha) => {
                const temLinha = Array.isArray(cronograma.pct[linha.numero]);
                return (
                  <tr key={linha.numero} className="border-t align-top">
                    <td className={`${FIXA_ITEM} bg-white py-2 font-medium text-slate-700`}>
                      {linha.numero}
                    </td>
                    <td className={`${FIXA_ETAPA} bg-white py-2 text-slate-700`}>
                      <span className="line-clamp-2" title={linha.descricao}>
                        {linha.descricao}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      {formatValor(linha.centavos)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-slate-600">
                      {`${formatPct(linha.peso)}%`}
                    </td>
                    {meses.map((j) => (
                      <td key={j} className="px-1 py-1 text-right">
                        {celula(linha, j, temLinha)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <TotalLinha linha={linha} />
                    </td>
                  </tr>
                );
              })}
              {resumo.orfas.map((numero) => (
                <tr key={`orfa-${numero}`} className="border-t bg-slate-50 text-slate-400">
                  <td className={`${FIXA_ITEM} bg-slate-50 py-2`}>{numero}</td>
                  <td className={`${FIXA_ETAPA} bg-slate-50 py-2 italic`}>
                    Etapa não existe mais no orçamento
                  </td>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2" />
                  {meses.map((j) => (
                    <td key={j} className="whitespace-nowrap px-2 py-2 text-right">
                      {formatPct(cronograma.pct[numero]?.[j])}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right">
                    {podeGravar && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-700"
                        title="Apagar a linha"
                        onClick={() => apagarOrfa(numero)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-slate-50 text-xs font-medium text-slate-700">
              {rodape.map((r) => (
                <tr key={r.rotulo} className="border-t">
                  <td className={`${FIXA_ITEM} bg-slate-50 py-1.5`} />
                  <td className={`${FIXA_ETAPA} bg-slate-50 py-1.5`}>{r.rotulo}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">{r.valor || ""}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">{r.peso || ""}</td>
                  {resumo.meses.map((m, j) => (
                    <td key={j} className="whitespace-nowrap px-2 py-1.5 text-right">
                      {r.mes(m)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5" />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}

      {mostrarGrade && !semEtapas && (
        <p className="text-xs text-slate-500">
          {resumo.todasFecham
            ? "O R$ de cada mês sai do valor da etapa com o desconto do orçamento; os centavos do arredondamento ficam no último mês com % da etapa."
            : "Etapas em vermelho não somam 100,00%. O Exportar só fica disponível com todas em 100,00%."}
        </p>
      )}

      {podeGravar && (
        <ImportarCronogramaDialog
          open={importarAberto}
          onOpenChange={setImportarAberto}
          numerosEtapas={numerosEtapas}
          temCronograma={temCronograma}
          onImportar={importar}
        />
      )}
      {podeGravar && (
        <MesesDialog
          modo={modoMeses}
          mesesAtuais={qtdMeses}
          onFechar={() => setModoMeses(null)}
          onConfirmar={mudarMeses}
        />
      )}
    </div>
  );
}
