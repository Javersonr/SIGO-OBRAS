import React, { useMemo, useState } from "react";
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
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Combobox de busca reutilizável (Popover + cmdk Command).
 *
 * Substitui o padrão "Popover + Command + estado de busca" que estava copiado
 * em ~6 telas (Despesa, Receita, Estoque, Usuário, Projeto). Centraliza:
 *   - estado de aberto/busca
 *   - ordenação + filtro client-side
 *   - **blindagem do bug do cmdk**: o `value` do item NUNCA é nulo/vazio
 *     (cai para o id, depois para o índice) — o crash "Cannot use 'in'
 *     operator ... in null" não pode mais acontecer.
 *
 * Props principais:
 *   items          array de objetos
 *   value          id selecionado (string) ou "" / null
 *   onValueChange  (id, item) => void  — id="" quando escolhe "nenhum"
 *   getId/getLabel acessores (default x.id / x.nome)
 *   getSearchText  texto extra pra busca (ex.: cnpj)
 *   renderItem     JSX custom por item (ex.: nome + subtítulo)
 *   noneLabel      se definido, mostra opção "nenhum" no topo
 */
export default function EntityCombobox({
  items = [],
  value,
  onValueChange,
  getId = (x) => x.id,
  getLabel = (x) => x.nome,
  getSearchText,
  renderItem,
  placeholder = "Selecione...",
  searchPlaceholder = "Buscar...",
  emptyText = "Nenhum resultado",
  noneLabel,
  disabled = false,
  className,
  contentClassName = "w-[320px]",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => items.find((x) => String(getId(x)) === String(value)) || null,
    [items, value, getId]
  );

  const filtered = useMemo(() => {
    const ordered = [...items].sort((a, b) =>
      String(getLabel(a) || "").localeCompare(String(getLabel(b) || ""))
    );
    if (!search) return ordered;
    const q = search.toLowerCase();
    return ordered.filter((x) => {
      const base = String(getLabel(x) || "").toLowerCase();
      const extra = getSearchText ? String(getSearchText(x) || "").toLowerCase() : "";
      return base.includes(q) || extra.includes(q);
    });
  }, [items, search, getLabel, getSearchText]);

  const choose = (item) => {
    onValueChange?.(item ? getId(item) : "", item || null);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">{selected ? getLabel(selected) : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", contentClassName)} align="start">
        {/* shouldFilter={false}: nós já filtramos em `filtered` */}
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {noneLabel != null && (
                <CommandItem value="__none__" onSelect={() => choose(null)}>
                  {noneLabel}
                </CommandItem>
              )}
              {filtered.map((item, i) => (
                <CommandItem
                  key={getId(item) ?? i}
                  // value SEMPRE string não-vazia → blinda o crash do cmdk
                  value={String(getId(item) ?? getLabel(item) ?? i)}
                  onSelect={() => choose(item)}
                >
                  {renderItem ? renderItem(item) : getLabel(item)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
