import React, { useState } from "react";
import { toast } from "sonner";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { consultarCnpj, limparCnpj } from "@/lib/cnpj";

/**
 * Botão "Buscar CNPJ" para colocar ao lado do campo de CNPJ.
 * Consulta a Receita (BrasilAPI/minhareceita) e devolve os dados mapeados.
 *
 * @param {string} cnpj      valor atual do campo (com ou sem máscara)
 * @param {(dados) => void} onData  callback com os dados neutros (ver lib/cnpj.js)
 */
export default function BuscarCnpjButton({ cnpj, onData, className = "" }) {
  const [buscando, setBuscando] = useState(false);
  const habilitado = limparCnpj(cnpj).length === 14;

  const buscar = async () => {
    setBuscando(true);
    try {
      const dados = await consultarCnpj(cnpj);
      onData(dados);
      if (dados.situacao && dados.situacao.toUpperCase() !== "ATIVA") {
        toast.warning(`Atenção: situação cadastral "${dados.situacao}" na Receita.`);
      } else {
        toast.success(`Dados de ${dados.razao_social || "CNPJ"} preenchidos.`);
      }
    } catch (e) {
      toast.error(e.message || "Erro ao consultar CNPJ");
    } finally {
      setBuscando(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={buscar}
      disabled={!habilitado || buscando}
      title={habilitado ? "Buscar dados na Receita" : "Digite os 14 dígitos do CNPJ"}
      className={`shrink-0 ${className}`}
    >
      {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
      <span className="ml-1 hidden sm:inline">{buscando ? "Buscando…" : "Buscar"}</span>
    </Button>
  );
}
