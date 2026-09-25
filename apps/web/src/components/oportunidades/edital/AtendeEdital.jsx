import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { safeParseJSON } from "@/lib/json-utils";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  HelpCircle,
  ListChecks,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";

/**
 * Exibe o AtendeResultado da análise do edital (edital_analise.atende):
 * veredito, exigências por grupo com selo, CATs a anexar, pendências, riscos
 * e alertas. Só exibe — quem roda a análise é o pai (onReanalisar).
 */

const VEREDITOS = {
  atende: {
    rotulo: "Atende",
    frase: "O acervo da empresa atende às exigências de habilitação lidas no edital.",
    icone: CheckCircle2,
    caixa: "bg-emerald-50 border-emerald-200",
    texto: "text-emerald-800",
    iconeCor: "text-emerald-600",
  },
  atende_parcialmente: {
    rotulo: "Atende parcialmente",
    frase: "Parte das exigências está coberta; veja as ressalvas e pendências abaixo.",
    icone: AlertTriangle,
    caixa: "bg-amber-50 border-amber-200",
    texto: "text-amber-800",
    iconeCor: "text-amber-600",
  },
  nao_atende: {
    rotulo: "Não atende",
    frase: "Há exigências que o acervo atual não comprova.",
    icone: XCircle,
    caixa: "bg-red-50 border-red-200",
    texto: "text-red-800",
    iconeCor: "text-red-600",
  },
};

const SELOS = {
  atende: {
    emoji: "✅",
    rotulo: "Atende",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  ressalva: { emoji: "⚠️", rotulo: "Ressalva", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  nao_atende: { emoji: "❌", rotulo: "Não atende", cls: "bg-red-50 text-red-700 border-red-200" },
  verificar: {
    emoji: "❓",
    rotulo: "Verificar",
    cls: "bg-slate-50 text-slate-600 border-slate-200",
  },
};

const GRUPOS = [
  { chave: "tecnica_operacional", rotulo: "Capacidade técnico-operacional" },
  { chave: "tecnica_profissional", rotulo: "Capacidade técnico-profissional" },
  { chave: "economica", rotulo: "Qualificação econômico-financeira" },
  { chave: "registros", rotulo: "Registros e cadastros" },
];

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function qtdExigida(it) {
  const q = it.qtd_exigida;
  if (q === null || q === undefined || q === "") return "—";
  const n = typeof q === "number" ? NUM.format(q) : String(q);
  if (/^r\$$/i.test(String(it.unidade || "").trim())) {
    return typeof q === "number" ? BRL.format(q) : `R$ ${n}`;
  }
  return it.unidade ? `${n} ${it.unidade}` : n;
}

// analisado_em é timestamp ISO completo (com fuso) — aqui o Date é seguro.
function dataHoraBR(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// pendências/riscos/alertas são strings; tolera objeto vindo da IA
const textoDoItem = (it) =>
  typeof it === "string" ? it : it?.texto || it?.descricao || JSON.stringify(it);

function Selo({ status }) {
  const s = SELOS[status] || SELOS.verificar;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${s.cls}`}
    >
      <span aria-hidden>{s.emoji}</span>
      {s.rotulo}
    </span>
  );
}

function ListaSecao({ titulo, icone: Icone, cor, itens, render }) {
  if (!itens?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Icone className={`h-4 w-4 ${cor}`} />
        {titulo}
        <span className="text-xs font-normal text-slate-400">({itens.length})</span>
      </h4>
      <ul className="space-y-1.5 text-sm text-slate-700">
        {itens.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-slate-400" />
            <span className="min-w-0">{render ? render(it) : textoDoItem(it)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AtendeEdital({ analise, onReanalisar }) {
  const [reanalisando, setReanalisando] = useState(false);
  const dados = safeParseJSON(analise, null);
  const at = dados?.atende ? safeParseJSON(dados.atende, null) : null;

  const reanalisar = async () => {
    if (!onReanalisar || reanalisando) return;
    setReanalisando(true);
    try {
      await onReanalisar();
    } finally {
      setReanalisando(false);
    }
  };

  const botaoReanalisar = onReanalisar ? (
    <Button variant="outline" size="sm" onClick={reanalisar} disabled={reanalisando}>
      {reanalisando ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 h-4 w-4" />
      )}
      {reanalisando ? "Analisando…" : at ? "Reanalisar" : "Analisar acervo"}
    </Button>
  ) : null;

  if (!at) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <ListChecks className="mx-auto mb-2 h-8 w-8 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">Acervo ainda não conferido</p>
        <p className="mb-3 text-xs text-slate-500">
          A IA compara as exigências de habilitação do edital com o acervo técnico da empresa.
        </p>
        {botaoReanalisar}
      </div>
    );
  }

  const itens = Array.isArray(at.itens) ? at.itens : [];
  const v = VEREDITOS[at.veredito] || VEREDITOS.atende_parcialmente;
  const IconeV = v.icone;
  const contagem = itens.reduce((acc, it) => {
    const k = SELOS[it.status] ? it.status : "verificar";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const quando = dataHoraBR(at.analisado_em || dados.analisado_em);
  const empresa = at.empresa?.nome;

  return (
    <div className="space-y-4">
      {/* Veredito */}
      <div className={`rounded-lg border p-4 ${v.caixa}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <IconeV className={`mt-0.5 h-6 w-6 flex-shrink-0 ${v.iconeCor}`} />
            <div className="min-w-0">
              <p className={`text-lg font-semibold leading-tight ${v.texto}`}>{v.rotulo}</p>
              <p className={`text-sm ${v.texto} opacity-90`}>{v.frase}</p>
            </div>
          </div>
          {botaoReanalisar}
        </div>
        {itens.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.keys(SELOS).map((k) =>
              contagem[k] ? (
                <span
                  key={k}
                  className="rounded-md border border-white/60 bg-white/70 px-2 py-0.5 text-xs text-slate-700"
                >
                  {SELOS[k].emoji} {contagem[k]} {SELOS[k].rotulo.toLowerCase()}
                </span>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Exigências por grupo */}
      {GRUPOS.map((g) => {
        const doGrupo = itens.filter((it) => it.grupo === g.chave);
        if (!doGrupo.length) return null;
        return (
          <div
            key={g.chave}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h4 className="text-sm font-semibold text-slate-700">{g.rotulo}</h4>
            </div>
            <div className="overflow-x-auto">
              {/* table-fixed: mesmas colunas alinhadas em todos os grupos */}
              <table className="w-full min-w-[680px] table-fixed text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="w-[130px] px-4 py-2 font-medium">Situação</th>
                    <th className="px-4 py-2 font-medium">Exigência</th>
                    <th className="w-[150px] px-4 py-2 font-medium">Exigido</th>
                    <th className="w-[34%] px-4 py-2 font-medium">Comprovação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {doGrupo.map((it, i) => {
                    const cats = Array.isArray(it.atestados) ? it.atestados : [];
                    return (
                      <tr key={it.exigencia_id || i} className="align-top">
                        <td className="px-4 py-3">
                          <Selo status={it.status} />
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-800">{it.exigencia || "—"}</p>
                          {it.justificativa && (
                            <p className="mt-1 text-xs text-slate-500">{it.justificativa}</p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {qtdExigida(it)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-700">{it.comprovacao || "—"}</p>
                          {cats.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {cats.map((c, j) => (
                                <span
                                  key={c.id || j}
                                  title={c.contratante || ""}
                                  className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800"
                                >
                                  <FileCheck2 className="h-3 w-3" />
                                  CAT {c.numero || "s/ nº"}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="grid gap-3 md:grid-cols-2">
        <ListaSecao
          titulo="CATs para anexar"
          icone={FileCheck2}
          cor="text-amber-600"
          itens={at.cats_anexar}
          render={(c) => (
            <>
              <span className="font-medium">CAT {c?.numero || "s/ nº"}</span>
              {c?.motivo && <span className="text-slate-500"> — {c.motivo}</span>}
            </>
          )}
        />
        <ListaSecao
          titulo="Pendências"
          icone={ListChecks}
          cor="text-slate-500"
          itens={at.pendencias}
        />
        <ListaSecao titulo="Riscos" icone={ShieldAlert} cor="text-red-500" itens={at.riscos} />
        <ListaSecao titulo="Alertas" icone={HelpCircle} cor="text-amber-600" itens={at.alertas} />
      </div>

      {(quando || empresa) && (
        <p
          className="text-xs text-slate-400"
          title={at.modelo ? `Modelo: ${at.modelo}` : undefined}
        >
          Analisado{quando ? ` em ${quando}` : ""}
          {empresa ? ` com o acervo da ${empresa}` : ""}
        </p>
      )}
    </div>
  );
}
