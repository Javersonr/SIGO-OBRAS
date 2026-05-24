import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Truck, HardHat, X, RefreshCw, Link2 } from 'lucide-react';
import DefinirObrigatorioModal from './DefinirObrigatorioModal';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * Barra de ações em massa para a aba Ferramentas.
 * Props:
 *   itensSelecionados: array de chaves selecionadas
 *   ferramentasAgrupadas: objeto com todos os grupos
 *   ferramentas: array com todos os registros individuais
 *   onLaudoMassa: callback para abrir modal de laudo
 *   onClearSelecao: callback para limpar seleção
 *   empresaAtiva
 *   perfil, vinculo
 */
export default function BarraAcoesMassa({ itensSelecionados, ferramentasAgrupadas, ferramentas, onLaudoMassa, onClearSelecao, empresaAtiva, perfil, vinculo, onRefresh, onVincularMassa }) {
  const [showObrigatorio, setShowObrigatorio] = useState(false);
  const [obrigatorioModo, setObrigatorioModo] = useState('caminhao');
  const [alterandoTipo, setAlterandoTipo] = useState(false);

  if (itensSelecionados.length === 0 || (perfil !== 'Admin' && !vinculo?.is_owner)) return null;

  // Construir lista de ferramentas selecionadas (primeiro item de cada grupo, para ter id, descricao, codigo)
  const ferramentasSel = itensSelecionados.flatMap(itemKey => {
    const grupo = Object.values(ferramentasAgrupadas).find(f => `${f.codigo}-${f.descricao}` === itemKey);
    if (!grupo) return [];
    // Retorna todos os itens únicos por descrição para o modal
    const primeiro = ferramentas.find(f => f.id === grupo.itens[0]?.id);
    if (!primeiro) return [];
    return [{ id: primeiro.id, descricao: primeiro.descricao, codigo: grupo.codigo }];
  });

  const handleAlterarTipo = async (novoTipo) => {
    const ids = itensSelecionados.flatMap(itemKey => {
      const grupo = Object.values(ferramentasAgrupadas).find(f => `${f.codigo}-${f.descricao}` === itemKey);
      return grupo ? grupo.itens.map(i => i.id) : [];
    });
    if (ids.length === 0) return;
    if (!confirm(`Alterar tipo de ${ids.length} ferramenta(s) para "${novoTipo}"?`)) return;
    setAlterandoTipo(true);
    try {
      await Promise.all(ids.map(id => base44.entities.Ferramenta.update(id, { tipo: novoTipo })));
      toast.success(`${ids.length} ferramenta(s) alteradas para ${novoTipo}`);
      onClearSelecao?.();
      onRefresh?.();
    } catch (e) {
      toast.error('Erro ao alterar tipo');
    } finally {
      setAlterandoTipo(false);
    }
  };

  const abrirObrigatorio = (modo) => {
    setObrigatorioModo(modo);
    setShowObrigatorio(true);
  };

  return (
    <>
      <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex-wrap">
        <span className="text-sm font-medium text-amber-800">{itensSelecionados.length} grupo(s) selecionado(s)</span>

        <Button size="sm" variant="outline" className="border-amber-400 text-amber-800 hover:bg-amber-100 gap-2" onClick={onLaudoMassa}>
          <FileText className="w-4 h-4" />
          Laudo Obrigatório
        </Button>

        <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-2" onClick={() => abrirObrigatorio('caminhao')}>
          <Truck className="w-4 h-4" />
          Obrigatório p/ Caminhão
        </Button>

        <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-2" onClick={() => abrirObrigatorio('funcao')}>
          <HardHat className="w-4 h-4" />
          Obrigatório p/ Função
        </Button>

        <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50 gap-2" onClick={() => handleAlterarTipo('EPI')} disabled={alterandoTipo}>
          <RefreshCw className="w-4 h-4" />
          Mudar para EPI
        </Button>

        <Button size="sm" variant="outline" className="border-teal-300 text-teal-700 hover:bg-teal-50 gap-2" onClick={() => handleAlterarTipo('Ferramenta')} disabled={alterandoTipo}>
          <RefreshCw className="w-4 h-4" />
          Mudar para Ferramenta
        </Button>

        <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50 gap-2" onClick={onVincularMassa}>
          <Link2 className="w-4 h-4" />
          Vincular c/ Laudo
        </Button>

        <Button size="sm" variant="ghost" className="text-slate-500 ml-auto" onClick={onClearSelecao}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <DefinirObrigatorioModal
        open={showObrigatorio}
        onOpenChange={setShowObrigatorio}
        modo={obrigatorioModo}
        ferramentasSelecionadas={ferramentasSel}
        empresaAtiva={empresaAtiva}
      />
    </>
  );
}