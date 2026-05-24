import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ESTRUTURA CANÔNICA DE PERMISSÕES
// ATENÇÃO: Este é o ÚNICO local onde a estrutura deve ser definida
// Qualquer alteração aqui deve ser mantida consistente em toda aplicação
export const ESTRUTURA_PERMISSOES = {
  Oportunidades: {
    abas: {
      'Lista': { funcoes: ['visualizar', 'criar', 'editar', 'excluir', 'exportar', 'aprovar'] },
      'Orçamento': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Cronograma': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Arquivos': { funcoes: ['visualizar', 'criar', 'deletar'] },
      'Anotações': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Chat': { funcoes: ['visualizar', 'enviar'] }
    }
  },
  Projetos: {
    abas: {
      'Lista': { funcoes: ['visualizar', 'criar', 'editar', 'excluir', 'exportar', 'aprovar'] },
      'Orçamento': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Cronograma': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Financeiro': { funcoes: ['visualizar', 'criar', 'editar'] },
      'Diário de Obra': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Arquivos': { funcoes: ['visualizar', 'criar', 'deletar'] },
      'Anotações': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Chat': { funcoes: ['visualizar', 'enviar'] }
    }
  },
  Compras: {
    abas: {
      'Solicitações': { funcoes: ['visualizar', 'criar', 'editar', 'deletar', 'aprovar'] },
      'Cotações': { funcoes: ['visualizar', 'criar', 'editar'] },
      'Pedidos': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Fornecedores': { funcoes: ['visualizar', 'criar', 'editar'] }
    }
  },
  Estoque: {
    abas: {
      'Materiais': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Movimento': { funcoes: ['visualizar', 'criar', 'editar'] },
      'Almoxarifados': { funcoes: ['visualizar', 'criar', 'editar'] },
      'Retiradas': { funcoes: ['visualizar', 'criar', 'editar'] }
    }
  },
  Financeiro: {
    abas: {
      'Resumo': { funcoes: ['visualizar'] },
      'Receitas': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Despesas': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Recorrentes': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Pré-Lançamentos': { funcoes: ['visualizar', 'criar', 'editar', 'deletar', 'ver_todos', 'ver_proprios', 'aprovar', 'pagar'] },
      'Relatórios': { funcoes: ['visualizar', 'exportar'] },
      'Transferências': { funcoes: ['visualizar', 'criar', 'editar'] },
      'Contas e Extratos': { funcoes: ['visualizar', 'editar'] }
    }
  },
  Contabilidade: {
    abas: {
      'Plano de Contas': { funcoes: ['visualizar', 'criar', 'editar'] },
      'Lançamentos': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Relatórios': { funcoes: ['visualizar', 'exportar'] }
    }
  },
  'Ferramental e EPI': {
    abas: {
      'Ferramental': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Inspeção': { funcoes: ['visualizar', 'criar', 'editar'] }
    }
  },
  'Segurança do Trabalho': {
    abas: {
      'Funcionários': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Dados Pessoais': { funcoes: ['visualizar', 'editar'] },
      'Documentação': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Dados Bancários': { funcoes: ['visualizar', 'editar'] },
      'RH': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'TST': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Inspeção de Campo': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Inspeção de Ferramental': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Inspeção de Caminhão': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Documentação da Empresa': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] }
    }
  },
  Relatórios: {
    abas: {
      'Oportunidades': { funcoes: ['visualizar', 'exportar'] },
      'Projetos': { funcoes: ['visualizar', 'exportar'] },
      'Compras': { funcoes: ['visualizar', 'exportar'] },
      'Estoque': { funcoes: ['visualizar', 'exportar'] }
    }
  },
  Configurações: {
    abas: {
      'Empresa': { funcoes: ['visualizar', 'editar'] },
      'Usuários': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Permissões': { funcoes: ['visualizar', 'editar'] },
      'Clientes': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Fornecedores': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Materiais': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Mão de Obra': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Ferramentas': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] },
      'Categorias': { funcoes: ['visualizar', 'criar', 'editar', 'deletar'] }
    }
  }
};

export default function PermissoesGranularesEditor({ permissoes = {}, onChange, modulosPermitidos = [] }) {
   const [expandedModulos, setExpandedModulos] = useState({});
   const [expandedAbas, setExpandedAbas] = useState({});

   // Se modulosPermitidos foi especificado, filtrar apenas esses módulos
   const modulosParaExibir = modulosPermitidos.length > 0 
     ? Object.keys(ESTRUTURA_PERMISSOES).filter(m => modulosPermitidos.includes(m))
     : Object.keys(ESTRUTURA_PERMISSOES);

  const toggleModulo = (modulo) => {
    setExpandedModulos(prev => ({
      ...prev,
      [modulo]: !prev[modulo]
    }));
  };

  const toggleAba = (modulo, aba) => {
    const key = `${modulo}-${aba}`;
    setExpandedAbas(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleModuloChange = (modulo, checked) => {
    const novasPermissoes = { ...permissoes };
    
    if (checked) {
      // Ativar módulo com todas as abas e funções
      const modInfo = ESTRUTURA_PERMISSOES[modulo];
      novasPermissoes[modulo] = {};
      
      Object.keys(modInfo.abas || {}).forEach(aba => {
        novasPermissoes[modulo][aba] = {};
        modInfo.abas[aba].funcoes.forEach(funcao => {
          novasPermissoes[modulo][aba][funcao] = true;
        });
      });
    } else {
      delete novasPermissoes[modulo];
    }
    
    onChange(novasPermissoes);
  };

  const handleAbaChange = (modulo, aba, checked) => {
    const novasPermissoes = { ...permissoes };
    
    if (!novasPermissoes[modulo]) {
      novasPermissoes[modulo] = {};
    }
    
    if (checked) {
      const funcoes = ESTRUTURA_PERMISSOES[modulo].abas[aba].funcoes;
      novasPermissoes[modulo][aba] = {};
      funcoes.forEach(f => {
        novasPermissoes[modulo][aba][f] = true;
      });
    } else {
      delete novasPermissoes[modulo][aba];
      
      // Remover módulo se não tiver mais abas
      if (Object.keys(novasPermissoes[modulo]).length === 0) {
        delete novasPermissoes[modulo];
      }
    }
    
    onChange(novasPermissoes);
  };

  const handleFuncaoChange = (modulo, aba, funcao, checked) => {
    const novasPermissoes = { ...permissoes };
    
    if (!novasPermissoes[modulo]) {
      novasPermissoes[modulo] = {};
    }
    if (!novasPermissoes[modulo][aba]) {
      novasPermissoes[modulo][aba] = {};
    }
    
    if (checked) {
      novasPermissoes[modulo][aba][funcao] = true;
    } else {
      delete novasPermissoes[modulo][aba][funcao];
      
      // Remover aba se não tiver mais funções
      if (Object.keys(novasPermissoes[modulo][aba]).length === 0) {
        delete novasPermissoes[modulo][aba];
      }
      
      // Remover módulo se não tiver mais abas
      if (Object.keys(novasPermissoes[modulo]).length === 0) {
        delete novasPermissoes[modulo];
      }
    }
    
    onChange(novasPermissoes);
  };

  const isModuloChecked = (modulo) => {
    return !!permissoes[modulo] && Object.keys(permissoes[modulo]).length > 0;
  };

  const isAbaChecked = (modulo, aba) => {
    return !!permissoes[modulo]?.[aba] && Object.keys(permissoes[modulo][aba]).length > 0;
  };

  return (
    <div className="space-y-2">
      {modulosParaExibir.map(modulo => (
        <Card key={modulo} className="overflow-hidden">
          <div 
            className="p-4 bg-slate-50 border-b cursor-pointer hover:bg-slate-100 flex items-center gap-3"
            onClick={() => toggleModulo(modulo)}
          >
            <Checkbox
              checked={isModuloChecked(modulo)}
              onCheckedChange={(checked) => handleModuloChange(modulo, checked)}
              onClick={(e) => e.stopPropagation()}
              className="w-5 h-5"
            />
            {expandedModulos[modulo] ? (
              <ChevronDown className="w-4 h-4 text-slate-600" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-600" />
            )}
            <span className="font-semibold text-slate-800">{modulo}</span>
          </div>

          {expandedModulos[modulo] && (
            <CardContent className="p-4 space-y-3">
              {Object.keys(ESTRUTURA_PERMISSOES[modulo].abas || {}).map(aba => (
                <div key={`${modulo}-${aba}`} className="ml-4 space-y-2">
                  <div 
                    className="p-2 rounded bg-slate-50 hover:bg-slate-100 cursor-pointer flex items-center gap-2"
                    onClick={() => toggleAba(modulo, aba)}
                  >
                    <Checkbox
                      checked={isAbaChecked(modulo, aba)}
                      onCheckedChange={(checked) => handleAbaChange(modulo, aba, checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {expandedAbas[`${modulo}-${aba}`] ? (
                      <ChevronDown className="w-3 h-3 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-slate-500" />
                    )}
                    <span className="text-sm font-medium text-slate-700">{aba}</span>
                  </div>

                  {expandedAbas[`${modulo}-${aba}`] && (
                    <div className="ml-8 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {ESTRUTURA_PERMISSOES[modulo].abas[aba].funcoes.map(funcao => (
                        <label 
                          key={funcao}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 p-1 rounded"
                        >
                          <Checkbox
                            checked={permissoes[modulo]?.[aba]?.[funcao] || false}
                            onCheckedChange={(checked) => handleFuncaoChange(modulo, aba, funcao, checked)}
                          />
                          <span className="capitalize text-slate-600">{funcao.replace(/_/g, ' ')}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}