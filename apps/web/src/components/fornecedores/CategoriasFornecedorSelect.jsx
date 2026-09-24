import React, { useEffect, useMemo, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { normalizarTexto } from "@/lib/busca";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const chave = (nome) => normalizarTexto(String(nome || "").trim());

/** `categorias` do fornecedor como lista (aceita o legado em texto). */
export function listaCategorias(valor) {
  if (Array.isArray(valor)) return valor.filter(Boolean);
  if (typeof valor === "string" && valor.trim()) {
    try {
      const v = JSON.parse(valor);
      if (Array.isArray(v)) return v.filter(Boolean);
    } catch {
      /* texto separado por vírgula */
    }
    return valor
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }
  return [];
}

/** 1ª categoria financeira (de `categorias`) que bate com as do fornecedor. */
export function categoriaDoFornecedor(fornecedor, categorias) {
  const porChave = new Map((categorias || []).map((c) => [chave(c.nome), c]));
  for (const nome of listaCategorias(fornecedor?.categorias)) {
    const c = porChave.get(chave(nome));
    if (c) return c;
  }
  return null;
}

/**
 * Categorias do fornecedor vinculadas às Categorias Financeiras de DESPESA
 * (Configurações → Categorias). Guarda os nomes em `fornecedor.categorias`
 * (mesmo formato de sempre — exportação/importação continuam iguais).
 * Categoria antiga digitada à mão que não existe em Configurações aparece
 * destacada para o usuário trocar ou remover.
 */
export default function CategoriasFornecedorSelect({ empresaId, value, onChange }) {
  const [categorias, setCategorias] = useState(null);
  const [aberto, setAberto] = useState(false);
  const selecionadas = listaCategorias(value);

  useEffect(() => {
    if (!empresaId) return undefined;
    let vivo = true;
    sigo.entities.CategoriaFinanceira.filter({ empresa_id: empresaId, tipo: "Despesa" })
      .then((lista) => {
        if (!vivo) return;
        // Configurações tem nomes repetidos ("Pedágio", "Pedágio ") — mostra 1 de cada
        const unicas = new Map();
        for (const c of lista || []) {
          const k = chave(c.nome);
          if (k && !unicas.has(k)) unicas.set(k, { ...c, nome: String(c.nome).trim() });
        }
        setCategorias([...unicas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      })
      .catch(() => vivo && setCategorias([]));
    return () => {
      vivo = false;
    };
  }, [empresaId]);

  const cadastradas = useMemo(
    () => new Set((categorias || []).map((c) => chave(c.nome))),
    [categorias]
  );
  const marcadas = useMemo(() => new Set(selecionadas.map(chave)), [selecionadas]);

  const alternar = (nome) => {
    const k = chave(nome);
    onChange(
      marcadas.has(k) ? selecionadas.filter((s) => chave(s) !== k) : [...selecionadas, nome]
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {selecionadas.map((nome) => {
          const orfa = categorias !== null && !cadastradas.has(chave(nome));
          return (
            <Badge
              key={nome}
              variant="outline"
              title={orfa ? "Não existe em Configurações → Categorias" : undefined}
              className={cn(
                "gap-1 pr-1 font-normal",
                orfa ? "border-amber-300 bg-amber-50 text-amber-800" : "bg-slate-50"
              )}
            >
              {nome}
              {orfa && <span className="text-[10px]">(não cadastrada)</span>}
              <button
                type="button"
                onClick={() => alternar(nome)}
                className="rounded p-0.5 hover:bg-black/10"
                aria-label={`Remover ${nome}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          );
        })}
        <Popover open={aberto} onOpenChange={setAberto}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-7">
              <Plus className="w-3.5 h-3.5 mr-1" />
              {selecionadas.length ? "Adicionar" : "Selecionar categorias"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[320px]" align="start">
            <Command>
              <CommandInput placeholder="Buscar categoria..." />
              <CommandList>
                <CommandEmpty>
                  {categorias === null
                    ? "Carregando..."
                    : "Nenhuma categoria. Cadastre em Configurações → Categorias."}
                </CommandEmpty>
                <CommandGroup heading="Categorias de despesa (Configurações)">
                  {(categorias || []).map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.nome}
                      keywords={[chave(c.nome)]}
                      onSelect={() => alternar(c.nome)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          marcadas.has(chave(c.nome)) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {c.nome}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <p className="text-xs text-slate-500">
        Vêm de Configurações → Categorias. Ao lançar uma despesa deste fornecedor, a categoria é
        preenchida automaticamente.
      </p>
    </div>
  );
}
