import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function BuscaAvancada({ oportunidades, onResultsChange, statusList, usuarios }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchHistory, setSearchHistory] = useState([]);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Carregar histórico do localStorage
  useEffect(() => {
    const history = localStorage.getItem("oportunidades_search_history");
    if (history) {
      setSearchHistory(JSON.parse(history));
    }
  }, []);

  // Salvar busca no histórico
  const saveToHistory = (term) => {
    if (!term.trim()) return;
    const newHistory = [term, ...searchHistory.filter((h) => h !== term)].slice(0, 5);
    setSearchHistory(newHistory);
    localStorage.setItem("oportunidades_search_history", JSON.stringify(newHistory));
  };

  // Busca em múltiplos campos — memoizada para evitar recriação desnecessária
  const searchOportunidades = useCallback(
    (term) => {
      if (!term.trim()) return oportunidades;
      const lowerTerm = term.toLowerCase();
      return oportunidades.filter((op) => {
        const matchTitulo = (op.nome || op.titulo)?.toLowerCase().includes(lowerTerm);
        const matchCliente = op.cliente_nome?.toLowerCase().includes(lowerTerm);
        const matchStatus = op.status_nome?.toLowerCase().includes(lowerTerm);
        const matchCidade = op.cidade?.toLowerCase().includes(lowerTerm);
        const matchValor = op.valor_estimado?.toString().includes(term);
        const matchModalidade = op.licitacao_modalidade?.toLowerCase().includes(lowerTerm);
        let matchResponsavel = false;
        if (op.responsaveis_ids) {
          try {
            const ids = JSON.parse(op.responsaveis_ids);
            matchResponsavel = usuarios.some(
              (u) =>
                ids.includes(u.id) &&
                (u.usuario_email?.toLowerCase().includes(lowerTerm) ||
                  u.nome_completo?.toLowerCase().includes(lowerTerm))
            );
          } catch {}
        }
        return (
          matchTitulo ||
          matchCliente ||
          matchStatus ||
          matchCidade ||
          matchValor ||
          matchModalidade ||
          matchResponsavel
        );
      });
    },
    [oportunidades, usuarios]
  );

  // Gerar sugestões inteligentes
  const generateSuggestions = (term) => {
    if (!term.trim()) {
      return searchHistory.map((h) => ({ text: h, type: "history" }));
    }

    const results = searchOportunidades(term);
    const suggestions = [];
    const lowerTerm = term.toLowerCase();

    // Sugestões de oportunidades
    results.slice(0, 5).forEach((op) => {
      const nome = op.nome || op.titulo;
      if (nome?.toLowerCase().includes(lowerTerm)) {
        suggestions.push({
          text: nome,
          type: "oportunidade",
          icon: "🎯",
          subtitle: op.cliente_nome || "Sem cliente",
          value: nome,
        });
      }
    });

    // Sugestões de clientes
    const clientes = [...new Set(results.map((o) => o.cliente_nome).filter(Boolean))];
    clientes.slice(0, 3).forEach((cliente) => {
      if (cliente.toLowerCase().includes(lowerTerm)) {
        suggestions.push({
          text: cliente,
          type: "cliente",
          icon: "🏢",
          subtitle: `${results.filter((o) => o.cliente_nome === cliente).length} oportunidades`,
          value: cliente,
        });
      }
    });

    // Sugestões de cidades
    const cidades = [...new Set(results.map((o) => o.cidade).filter(Boolean))];
    cidades.slice(0, 3).forEach((cidade) => {
      if (cidade.toLowerCase().includes(lowerTerm)) {
        suggestions.push({
          text: cidade,
          type: "cidade",
          icon: "📍",
          subtitle: `${results.filter((o) => o.cidade === cidade).length} oportunidades`,
          value: cidade,
        });
      }
    });

    // Sugestões de status
    const statusUnicos = [...new Set(results.map((o) => o.status_nome).filter(Boolean))];
    statusUnicos.slice(0, 3).forEach((status) => {
      if (status.toLowerCase().includes(lowerTerm)) {
        const statusObj = statusList.find((s) => s.nome === status);
        suggestions.push({
          text: status,
          type: "status",
          icon: "🏷️",
          color: statusObj?.cor,
          subtitle: `${results.filter((o) => o.status_nome === status).length} oportunidades`,
          value: status,
        });
      }
    });

    return suggestions.slice(0, 8);
  };

  const suggestions = generateSuggestions(searchTerm);

  // Propagar resultados quando busca ou dados mudam
  useEffect(() => {
    const results = searchOportunidades(searchTerm);
    onResultsChange(results, searchTerm);
  }, [searchTerm, searchOportunidades, onResultsChange]);

  // Navegação por teclado
  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && suggestions[selectedIndex]) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  // Selecionar sugestão
  const handleSelectSuggestion = (suggestion) => {
    setSearchTerm(suggestion.value || suggestion.text);
    saveToHistory(suggestion.value || suggestion.text);
    setShowSuggestions(false);
    setSelectedIndex(0);
  };

  // Limpar busca
  const handleClear = () => {
    setSearchTerm("");
    setShowSuggestions(false);
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          ref={inputRef}
          placeholder="Buscar por oportunidade, cliente, cidade, status, valor..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowSuggestions(true);
            setSelectedIndex(0);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          className="pl-10 pr-10 h-11 text-base"
        />
        {searchTerm && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Sugestões */}
      {showSuggestions && suggestions.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowSuggestions(false)} />
          <Card
            className="absolute top-full mt-2 w-full z-50 shadow-xl border-2"
            ref={suggestionsRef}
          >
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-y-auto">
                {!searchTerm && searchHistory.length > 0 && (
                  <div className="px-3 py-2 text-xs font-medium text-slate-500 border-b bg-slate-50">
                    Buscas recentes
                  </div>
                )}
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className={cn(
                      "px-4 py-3 cursor-pointer transition-colors border-b last:border-b-0",
                      index === selectedIndex ? "bg-amber-50" : "hover:bg-slate-50"
                    )}
                    onClick={() => handleSelectSuggestion(suggestion)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{suggestion.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-800 truncate">{suggestion.text}</p>
                          {suggestion.color && (
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: suggestion.color }}
                            />
                          )}
                        </div>
                        {suggestion.subtitle && (
                          <p className="text-xs text-slate-500 mt-0.5">{suggestion.subtitle}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0">
                        {suggestion.type === "history"
                          ? "Histórico"
                          : suggestion.type === "oportunidade"
                            ? "Oportunidade"
                            : suggestion.type === "cliente"
                              ? "Cliente"
                              : suggestion.type === "cidade"
                                ? "Cidade"
                                : "Status"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Indicador de resultados */}
      {searchTerm &&
        (() => {
          const resultCount = searchOportunidades(searchTerm).length;
          return (
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <Filter className="w-4 h-4" />
              <span>
                {resultCount}{" "}
                {resultCount === 1 ? "resultado encontrado" : "resultados encontrados"}
              </span>
            </div>
          );
        })()}
    </div>
  );
}
