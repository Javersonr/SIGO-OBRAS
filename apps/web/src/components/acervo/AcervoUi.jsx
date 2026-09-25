import React from "react";
import { cn } from "@/lib/utils";
import { labelTipoDoc } from "./acervo-utils";

// Peças visuais pequenas repetidas nas abas do Acervo técnico.

const COR_TIPO = {
  cat: "bg-slate-800 text-white border-slate-800",
  atestado: "bg-slate-100 text-slate-700 border-slate-300",
  cao: "bg-amber-100 text-amber-800 border-amber-200",
  cat_profissional: "bg-white text-slate-600 border-dashed border-slate-400",
};

export function TipoDocBadge({ tipo, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        COR_TIPO[tipo] || COR_TIPO.atestado,
        className
      )}
    >
      {labelTipoDoc(tipo)}
    </span>
  );
}

/** Selo pequeno (âmbar = atenção, vermelho = problema, verde = ok). */
export function Selo({ cor = "slate", icon: Icon, children, className, title }) {
  const cores = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    amber: "bg-amber-50 text-amber-800 border-amber-300",
    red: "bg-red-50 text-red-700 border-red-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        cores[cor] || cores.slate,
        className
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

/** Rótulo + valor num grid de dados (some quando vazio, salvo `sempre`). */
export function Campo({ label, children, className, sempre = false }) {
  const vazio = children === null || children === undefined || children === "" || children === "—";
  if (vazio && !sempre) return null;
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-800 break-words">{vazio ? "—" : children}</dd>
    </div>
  );
}

/** Caixa de aviso com ícone (âmbar/vermelho/slate). */
export function Aviso({ cor = "amber", icon: Icon, titulo, children, className }) {
  const cores = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-sm", cores[cor], className)}>
      <div className="flex gap-2">
        {Icon && <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          {titulo && <p className="font-semibold">{titulo}</p>}
          <div className="whitespace-pre-line break-words">{children}</div>
        </div>
      </div>
    </div>
  );
}
