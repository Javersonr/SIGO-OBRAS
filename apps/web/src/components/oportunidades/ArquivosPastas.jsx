import React, { useState } from "react";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { agruparPorPasta, ehPastaPadrao, nomePastaValido } from "@/lib/pastas-arquivo";

/**
 * Arquivos da oportunidade agrupados em pastas recolhíveis
 * (spec 2026-09-29-pastas-arquivos-oportunidade). A linha de cada arquivo vem
 * do pai (renderArquivo), que já tem pré-visualização, link, mover e excluir.
 */
export default function ArquivosPastas({
  arquivos,
  pastas,
  pastaAtual,
  onAbrirPasta,
  onCriarPasta,
  onApagarPasta,
  renderArquivo,
}) {
  const [abertas, setAbertas] = useState(() => new Set([pastaAtual]));
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const grupos = agruparPorPasta(arquivos, pastas);

  const alternar = (pasta) => {
    setAbertas((prev) => {
      const nova = new Set(prev);
      if (nova.has(pasta)) nova.delete(pasta);
      else {
        nova.add(pasta);
        onAbrirPasta?.(pasta);
      }
      return nova;
    });
  };

  const cancelar = () => {
    setCriando(false);
    setNome("");
    setErro("");
  };

  const confirmar = async () => {
    const v = nomePastaValido(nome, pastas);
    if (!v.ok) {
      setErro(v.erro);
      return;
    }
    setSalvando(true);
    try {
      const ok = await onCriarPasta(v.nome);
      if (ok) {
        cancelar();
        setAbertas((prev) => new Set(prev).add(v.nome));
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        {criando ? (
          <div className="flex w-full items-start gap-2 sm:w-auto">
            <div className="flex-1">
              <Input
                autoFocus
                placeholder="Nome da pasta (ex.: Recurso)"
                value={nome}
                maxLength={60}
                onChange={(e) => {
                  setNome(e.target.value);
                  setErro("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmar();
                  if (e.key === "Escape") cancelar();
                }}
              />
              {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
            </div>
            <Button
              size="icon"
              className="h-9 w-9"
              disabled={salvando}
              onClick={confirmar}
              title="Criar pasta"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9"
              onClick={cancelar}
              title="Cancelar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setCriando(true)}>
            <FolderPlus className="h-4 w-4" /> Nova pasta
          </Button>
        )}
      </div>

      {grupos.map(({ pasta, arquivos: lista }) => {
        const aberta = abertas.has(pasta);
        const podeApagar = !ehPastaPadrao(pasta) && lista.length === 0;
        return (
          <div key={pasta} className="rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left"
                onClick={() => alternar(pasta)}
                aria-expanded={aberta}
              >
                {aberta ? (
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                )}
                {aberta ? (
                  <FolderOpen className="h-5 w-5 text-amber-500" />
                ) : (
                  <Folder className="h-5 w-5 text-amber-500" />
                )}
                <span
                  className={`font-medium ${pasta === pastaAtual ? "text-slate-900" : "text-slate-700"}`}
                >
                  {pasta}
                </span>
                <span className="text-xs text-slate-500">
                  {lista.length === 0
                    ? "vazia"
                    : `${lista.length} ${lista.length === 1 ? "arquivo" : "arquivos"}`}
                </span>
              </button>
              {podeApagar && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Apagar pasta vazia"
                  onClick={() => onApagarPasta(pasta)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              )}
            </div>
            {aberta && (
              <div className="space-y-2 border-t border-slate-100 p-2">
                {lista.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-500">
                    Nenhum arquivo nesta pasta
                  </p>
                ) : (
                  lista.map((arq) => (
                    <React.Fragment key={arq.id}>{renderArquivo(arq)}</React.Fragment>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
