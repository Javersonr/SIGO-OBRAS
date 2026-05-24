import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertCircle, Save } from 'lucide-react';

export default function CodigoDuplicadoModal({ open, onClose, empresaAtiva, onSave }) {
  const [duplicados, setDuplicados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && empresaAtiva?.id) {
      buscarDuplicados();
    }
  }, [open, empresaAtiva?.id]);

  const buscarDuplicados = async () => {
    setLoading(true);
    try {
      const [ferramentas, epis] = await Promise.all([
        base44.entities.Ferramenta.filter({
          empresa_id: empresaAtiva.id,
          ativo: true
        }),
        base44.entities.EPI.filter({
          empresa_id: empresaAtiva.id,
          ativo: true
        })
      ]);

      const todosItens = [
        ...ferramentas.map(f => ({ ...f, tipo: 'Ferramenta' })),
        ...epis.map(e => ({ ...e, tipo: 'EPI' }))
      ];

      // Agrupar por código
      const codigosMap = {};
      todosItens.forEach(item => {
        if (item.codigo) {
          if (!codigosMap[item.codigo]) {
            codigosMap[item.codigo] = [];
          }
          codigosMap[item.codigo].push(item);
        }
      });

      // Filtrar apenas códigos duplicados
      const duplicadosEncontrados = Object.entries(codigosMap)
        .filter(([_, items]) => items.length > 1)
        .map(([codigo, items]) => ({
          codigo,
          items: items.map(item => ({
            ...item,
            novoCodigoTemp: `${codigo}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`
          }))
        }));

      setDuplicados(duplicadosEncontrados);

      if (duplicadosEncontrados.length === 0) {
        toast.success('Nenhum código duplicado encontrado!');
      }
    } catch (error) {
      console.error('Erro ao buscar duplicados:', error);
      toast.error('Erro ao buscar códigos duplicados');
    } finally {
      setLoading(false);
    }
  };

  const atualizarCodigoTemp = (codigoOriginal, itemIdx, novoCodigoTemp) => {
    const novosDuplicados = [...duplicados];
    const grupoIdx = novosDuplicados.findIndex(d => d.codigo === codigoOriginal);
    if (grupoIdx >= 0) {
      novosDuplicados[grupoIdx].items[itemIdx].novoCodigoTemp = novoCodigoTemp;
      setDuplicados(novosDuplicados);
    }
  };

  const salvarAlteracoes = async () => {
    setSaving(true);
    try {
      let totalAlterados = 0;

      for (const grupo of duplicados) {
        for (const item of grupo.items) {
          if (item.novoCodigoTemp && item.novoCodigoTemp !== item.codigo) {
            const entidade = item.tipo === 'Ferramenta' ? base44.entities.Ferramenta : base44.entities.EPI;
            await entidade.update(item.id, {
              codigo: item.novoCodigoTemp
            });
            totalAlterados++;
          }
        }
      }

      toast.success(`${totalAlterados} código(s) atualizado(s) com sucesso!`);
      onSave();
      onClose();
    } catch (error) {
      console.error('Erro ao salvar alterações:', error);
      toast.error('Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
  };

  const verificarCodigosValidos = () => {
    for (const grupo of duplicados) {
      for (const item of grupo.items) {
        if (!item.novoCodigoTemp || item.novoCodigoTemp.trim() === '') {
          return false;
        }
      }
    }
    return true;
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col" style={{ inset: 'auto 0 0 256px', width: 'calc(100% - 256px)', maxWidth: 'none' }}>
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            Rastrear e Corrigir Códigos Duplicados
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-2 text-slate-600">Analisando ferramentas...</p>
            </div>
          ) : duplicados.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <p className="text-green-800 font-medium">✓ Nenhum código duplicado encontrado!</p>
            </div>
          ) : (
            duplicados.map((grupo, grupoIdx) => (
              <div key={grupoIdx} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="destructive" className="text-base">
                    {grupo.codigo}
                  </Badge>
                  <span className="text-sm text-slate-600">
                    {grupo.items.length} itens com este código
                  </span>
                </div>

                <div className="space-y-3">
                  {grupo.items.map((item, itemIdx) => (
                    <div key={item.id} className="bg-slate-50 rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.descricao}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {item.tipo}
                            </Badge>
                            {item.marca && (
                              <Badge variant="outline" className="text-xs">
                                {item.marca}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-slate-600">Código Atual</Label>
                          <Input
                            type="text"
                            value={item.codigo}
                            disabled
                            className="mt-1 h-8 text-xs bg-white"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600">Novo Código *</Label>
                          <Input
                            type="text"
                            value={item.novoCodigoTemp}
                            onChange={(e) => atualizarCodigoTemp(grupo.codigo, itemIdx, e.target.value)}
                            placeholder="Ex: FEAT-001"
                            className="mt-1 h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {duplicados.length > 0 && (
          <div className="border-t p-6 flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={salvarAlteracoes}
              disabled={saving || !verificarCodigosValidos()}
              className="flex-1 bg-amber-500 hover:bg-amber-600 gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}