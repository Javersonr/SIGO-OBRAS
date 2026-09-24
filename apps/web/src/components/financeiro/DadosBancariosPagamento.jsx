import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Landmark, Copy } from "lucide-react";
import { toast } from "sonner";

function Bloco({ titulo, texto, dica }) {
  const copiar = async () => {
    await navigator.clipboard.writeText(texto);
    toast.success("Dados copiados");
  };
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
          <Landmark className="w-4 h-4 text-slate-500" /> {titulo}
        </p>
        {texto && (
          <Button variant="ghost" size="sm" onClick={copiar} className="h-7 px-2">
            <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
          </Button>
        )}
      </div>
      {texto ? (
        <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{texto}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">{dica}</p>
      )}
    </div>
  );
}

/** Dados bancários do FORNECEDOR (como pagar) — detalhe da despesa e modal de pagamento. */
export function DadosBancariosFornecedor({ fornecedorId, fornecedorNome }) {
  const [texto, setTexto] = useState(null);

  useEffect(() => {
    let vivo = true;
    setTexto(null);
    if (!fornecedorId) return undefined;
    sigo.entities.Fornecedor.get(fornecedorId)
      .then((f) => vivo && setTexto(f?.dados_bancarios?.trim() || ""))
      .catch(() => vivo && setTexto(""));
    return () => {
      vivo = false;
    };
  }, [fornecedorId]);

  if (!fornecedorId || texto === null) return null;
  return (
    <Bloco
      titulo={`Dados bancários — ${fornecedorNome || "fornecedor"}`}
      texto={texto}
      dica="Sem dados bancários no cadastro. Preencha em Configurações → Fornecedores → editar → Dados bancários para pagamento."
    />
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
  return (
    <Bloco
      titulo={`Dados para recebimento — ${conta?.nome || "conta"}`}
      texto={partes.join("\n")}
      dica="A conta desta receita não tem banco/agência/PIX cadastrados. Preencha em Financeiro → Contas."
    />
  );
}
