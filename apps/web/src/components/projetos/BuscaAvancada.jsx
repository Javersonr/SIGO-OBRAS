import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Filter, MapPin, DollarSign, Calendar, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function BuscaAvancada({ projetos, onResultsChange, statusList, usuarios }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchHistory, setSearchHistory] = useState([]);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Carregar histórico do localStorage
  useEffect(() => {
    const history = localStorage.getItem('projetos_search_history');
    if (history) {
      setSearchHistory(JSON.parse(history));
    }
  }, []);

  // Salvar busca no histórico
  const saveToHistory = (term) => {
    if (!term.trim()) return;
    const newHistory = [term, ...searchHistory.filter(h => h !== term)].slice(0, 5);
    setSearchHistory(newHistory);
    localStorage.setItem('projetos_search_history', JSON.stringify(newHistory));
  };

  // Busca em múltiplos campos
  const searchProjects = (term) => {
    if (!term.trim()) {
      return projetos;
    }

    const lowerTerm = term.toLowerCase();
    return projetos.filter(proj => {
      // Buscar em nome/título
      const matchNome = (proj.nome || proj.titulo)?.toLowerCase().includes(lowerTerm);
      
      // Buscar em cliente
      const matchCliente = proj.cliente_nome?.toLowerCase().includes(lowerTerm);
      
      // Buscar em status
      const matchStatus = proj.status_nome?.toLowerCase().includes(lowerTerm);
      
      // Buscar em cidade
      const matchCidade = proj.cidade?.toLowerCase().includes(lowerTerm);
      
      // Buscar em valor (se for número)
      const matchValor = proj.valor_estimado?.toString().includes(term);
      
      // Buscar em modalidade
      const matchModalidade = proj.licitacao_modalidade?.toLowerCase().includes(lowerTerm);
      
      // Buscar em responsáveis (campo correto: responsaveis_emails)
      let matchResponsavel = false;
      if (proj.responsaveis_emails) {
        try {
          const emails = JSON.parse(proj.responsaveis_emails);
          matchResponsavel = emails.some(email => email?.toLowerCase().includes(lowerTerm)) ||
            usuarios.some(u => emails.includes(u.usuario_email) && u.nome_completo?.toLowerCase().includes(lowerTerm));
        } catch {}
      }

      return matchNome || matchCliente || matchStatus || matchCidade || matchValor || matchModalidade || matchResponsavel;
    });
  };

  // Gerar sugestões inteligentes
  const generateSuggestions = (term) => {
    if (!term.trim()) {
      return searchHistory.map(h => ({ text: h, type: 'history' }));
    }

    const results = searchProjects(term);
    const suggestions = [];
    const lowerTerm = term.toLowerCase();

    // Sugestões de projetos apenas
    results.slice(0, 10).forEach(proj => {
      const nome = proj.nome || proj.titulo;
      if (nome?.toLowerCase().includes(lowerTerm)) {
        suggestions.push({
          text: nome,
          type: 'projeto',
          icon: 'folder',
          subtitle: proj.cliente_nome || 'Sem cliente',
          value: nome
        });
      }
    });

    return suggestions.slice(0, 8);
  };

  const suggestions = generateSuggestions(searchTerm);

  // Handler para mudança de busca
  useEffect(() => {
    const results = searchProjects(searchTerm);
    onResultsChange(results, searchTerm);
  }, [searchTerm, projetos, onResultsChange]);

  // Navegação por teclado
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && suggestions[selectedIndex]) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
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
    setSearchTerm('');
    setShowSuggestions(false);
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  // Ícones por tipo
  const getIcon = (type) => {
    switch (type) {
      case 'projeto': return '📁';
      case 'cliente': return '🏢';
      case 'cidade': return '📍';
      case 'status': return '🏷️';
      case 'history': return '🕒';
      default: return '🔍';
    }
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          ref={inputRef}
          placeholder="Buscar por projeto, cliente, cidade, status, valor..."
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
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowSuggestions(false)}
          />
          <Card className="absolute top-full mt-2 w-full z-50 shadow-xl border-2" ref={suggestionsRef}>
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
                      <span className="text-lg">{getIcon(suggestion.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-800 truncate">
                            {suggestion.text}
                          </p>
                          {suggestion.color && (
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: suggestion.color }}
                            />
                          )}
                        </div>
                        {suggestion.subtitle && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {suggestion.subtitle}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0">
                        {suggestion.type === 'history' ? 'Histórico' : 
                         suggestion.type === 'projeto' ? 'Projeto' :
                         suggestion.type === 'cliente' ? 'Cliente' :
                         suggestion.type === 'cidade' ? 'Cidade' : 'Status'}
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
      {searchTerm && (() => {
        const resultCount = searchProjects(searchTerm).length;
        return (
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <Filter className="w-4 h-4" />
            <span>
              {resultCount} {resultCount === 1 ? 'resultado encontrado' : 'resultados encontrados'}
            </span>
          </div>
        );
      })()}
    </div>
  );
}