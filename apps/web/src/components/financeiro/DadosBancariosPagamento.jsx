import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Landmark, Copy, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Dados bancários do FORNECEDOR (como pagar) — detalhe da despesa e modal de
 * pagamento. Editável ali mesmo: o texto é salvo NO CADASTRO do fornecedor e
 * vale para todas as despesas dele.
 */
export function DadosBancariosFornecedor({ fornecedorId, fornecedorNome }) {
  const [texto, setTexto] = useState(null); // null = carregando
  const [rascunho, setRascunho] = useState(null); // != null = editando
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setTexto(null);
    setRascunho(null);
    if (!fornecedorId) return undefined;
    sigo.entities.Fornecedor.get(fornecedorId)
      .then((f) => vivo && setTexto(f?.dados_bancarios?.trim() || ""))
      .catch(() => vivo && setTexto(""));
    return () => {
      vivo = false;
    };
  }, [fornecedorId]);

  if (!fornecedorId || texto === null) return null;

  const salvar = async () => {
    setSalvando(true);
    try {
      const novo = (rascunho || "").trim();
      await sigo.entities.Fornecedor.update(fornecedorId, { dados_bancarios: novo || null });
      setTexto(novo);
      setRascunho(null);
      toast.success("Dados bancários salvos no cadastro do fornecedor");
    } catch (e) {
      toast.error("Erro ao salvar: " + (e?.message || e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
          <Landmark className="w-4 h-4 text-slate-500" /> Dados bancários —{" "}
          {fornecedorNome || "fornecedor"}
        </p>
        {rascunho === null && (
          <div className="flex gap-1">
            {texto && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(texto);
                  toast.success("Dados copiados");
                }}
              >
                <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setRascunho(texto)}
            >
              <Pencil className="w-3.5 h-3.5 mr-1" /> {texto ? "Editar" : "Cadastrar agora"}
            </Button>
          </div>
        )}
      </div>
      {rascunho !== null ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            placeholder={"Banco, agência, conta e favorecido\nPIX: chave"}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRascunho(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Salvar no
              fornecedor
            </Button>
          </div>
        </div>
      ) : texto ? (
        <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{texto}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          Sem dados bancários no cadastro — clique em “Cadastrar agora”.
        </p>
      )}
    </div>
  );
}

/** Dados da CONTA da empresa (como o cliente paga) — detalhe da receita. */
export function DadosRecebimentoConta({ contaId }) {
  const [conta, setConta] = useState(null);

  useEffect(() => {
    let vivo = true;
    setConta(null);
    if (!contaId) return undefined;
    sigo.entities.ContaFinanceira.get(contaId)
      .then((c) => vivo && setConta(c || false))
      .catch(() => vivo && setConta(false));
    return () => {
      vivo = false;
    };
  }, [contaId]);

  if (!contaId || conta === null) return null;
  const partes = conta
    ? [
        conta.banco &&
          `Banco: ${conta.banco}${conta.codigo_banco ? ` (${conta.codigo_banco})` : ""}`,
        conta.agencia && `Agência: ${conta.agencia}`,
        conta.numero_conta && `Conta: ${conta.numero_conta}`,
        conta.chave_pix && `PIX: ${conta.chave_pix}`,
      ].filter(Boolean)
    : [];
  const texto = partes.join("\n");
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
          <Landmark className="w-4 h-4 text-slate-500" /> Dados para recebimento —{" "}
          {conta?.nome || "conta"}
        </p>
        {texto && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={async () => {
              await navigator.clipboard.writeText(texto);
              toast.success("Dados copiados");
            }}
          >
            <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
          </Button>
        )}
      </div>
      {texto ? (
        <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{texto}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          A conta desta receita não tem banco/agência/PIX cadastrados. Preencha em Financeiro →
          Contas.
        </p>
      )}
    </div>
  );
}
