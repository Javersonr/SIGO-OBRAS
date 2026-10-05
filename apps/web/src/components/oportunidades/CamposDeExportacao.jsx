import React, { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarCpf } from "@/lib/cpf";
import { localDaEmpresa } from "@/lib/proposta-orcamento";

/**
 * Peças em comum dos diálogos "Exportar proposta" e "Exportar cronograma": a empresa, o local
 * e o representante legal (o hook), o bloco de campos do representante e o seletor PDF/Excel.
 * Uma regra nova (de onde vem o representante, a máscara do CPF, o local padrão) muda só aqui.
 */

/**
 * Empresa, local e representante legal de um diálogo de exportação.
 *
 * Ao abrir, parte da empresa da sessão e lê `Empresa.get` de novo (a da sessão pode ser
 * anterior à migração 0127, sem `representante_*`). Local e representante podem ser editados
 * só para a exportação: nada é gravado. `carregando` vale enquanto a leitura não volta.
 */
export function useRepresentanteDaEmpresa(open, empresaAtiva) {
  const [empresa, setEmpresa] = useState(null);
  const [local, setLocal] = useState("");
  const [representante, setRepresentante] = useState({ nome: "", cargo: "", cpf: "" });
  const [carregando, setCarregando] = useState(false);

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

  return { empresa, local, setLocal, representante, setRepresentante, carregando };
}

/** Seletor PDF / Excel. */
export function SeletorFormatoExportacao({ formato, setFormato, gerando }) {
  return (
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
  );
}

/**
 * Bloco "Representante legal" (nome, cargo e CPF com máscara). `idPrefixo` separa os ids dos
 * campos de cada diálogo (`<idPrefixo>-rep-nome`, `-rep-cargo` e `-rep-cpf`); `empresa` só
 * entra com o `responsavel_principal` como dica do nome.
 */
export function RepresentanteLegalCampos({
  idPrefixo,
  representante,
  setRepresentante,
  empresa,
  carregando,
  gerando,
}) {
  const mudar = (campo) => (e) =>
    setRepresentante((prev) => ({
      ...prev,
      [campo]: campo === "cpf" ? formatarCpf(e.target.value) : e.target.value,
    }));

  return (
    <div className="rounded-md border p-3 space-y-3">
      <p className="text-sm font-medium text-slate-700">
        Representante legal
        {carregando && <Loader2 className="ml-2 inline w-3.5 h-3.5 animate-spin" />}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Label htmlFor={`${idPrefixo}-rep-nome`} className="text-xs text-slate-600">
            Nome *
          </Label>
          <Input
            id={`${idPrefixo}-rep-nome`}
            value={representante.nome}
            onChange={mudar("nome")}
            placeholder={empresa?.responsavel_principal || ""}
            disabled={gerando || carregando}
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`${idPrefixo}-rep-cargo`} className="text-xs text-slate-600">
            Cargo
          </Label>
          <Input
            id={`${idPrefixo}-rep-cargo`}
            value={representante.cargo}
            onChange={mudar("cargo")}
            placeholder="Sócio-administrador"
            disabled={gerando || carregando}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefixo}-rep-cpf`} className="text-xs text-slate-600">
            CPF
          </Label>
          <Input
            id={`${idPrefixo}-rep-cpf`}
            inputMode="numeric"
            value={representante.cpf}
            onChange={mudar("cpf")}
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
  );
}
