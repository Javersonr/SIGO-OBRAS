import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Truck, Wrench, Search, Check, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { toast } from 'sonner';

export default function CaminhoesConfigTab({ empresaAtiva }) {
  const [caminhoes, setCaminhoes] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCaminhaoId, setExpandedCaminhaoId] = useState(null);
  const [searchFerramentas, setSearchFerramentas] = useState('');
  const [saving, setSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [ferramentasObrigatorias, setFerramentasObrigatorias] = useState([]);
  const [ferramentasSelecionadas, setFerramentasSelecionadas] = useState([]);

  const loadData = async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const [cam, ferr] = await Promise.all([
        base44.entities.Caminhao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        base44.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }, '', 1000)
      ]);
      setCaminhoes(cam.sort((a, b) => (a.placa || '').localeCompare(b.placa || '')));
      setFerramentas(ferr);
    } catch {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [empresaAtiva?.id]);

  const carregarFerramentasObrigatorias = async () => {
    if (!empresaAtiva?.id) return;
    try {
      const obrigatorias = await base44.entities.Ferramenta.filter({
        empresa_id: empresaAtiva.id,
        obrigatoria_caminhao: true,
        ativo: true
      });
      setFerramentasObrigatorias(obrigatorias);
      setFerramentasSelecionadas(obrigatorias.map(f => f.id));
    } catch {
      toast.error('Erro ao carregar ferramentas obrigatórias');
    }
  };

  const aplicarFerramentasObrigatorias = async () => {
    if (ferramentasSelecionadas.length === 0) {
      toast.error('Selecione ao menos uma ferramenta');
      return;
    }

    setSaving(true);
    try {
      for (const caminhao of caminhoes) {
        for (const ferramentaId of ferramentasSelecionadas) {
          const ferramenta = ferramentas.find(f => f.id === ferramentaId);
          if (ferramenta && ferramenta.caminhao_id !== caminhao.id) {
            await base44.entities.Ferramenta.update(ferramentaId, {
              caminhao_id: caminhao.id,
              localizacao: caminhao.placa,
              obrigatoria_caminhao: true
            });
          }
        }
      }
      await loadData();
      setShowImportModal(false);
      toast.success('Ferramentas obrigatórias definidas em todos os caminhões');
    } catch {
      toast.error('Erro ao aplicar ferramentas obrigatórias');
    } finally {
      setSaving(false);
    }
  };

  const getFerramentasCaminhao = (caminhaoId) => {
    return ferramentas.filter(f => f.caminhao_id === caminhaoId);
  };

  const toggleCaminhao = (caminhaoId) => {
    setExpandedCaminhaoId(expandedCaminhaoId === caminhaoId ? null : caminhaoId);
    setSearchFerramentas('');
  };

  const handleToggleFerramenta = async (ferramentaId, isAdicionando) => {
    setSaving(true);
    try {
      if (isAdicionando) {
        await base44.entities.Ferramenta.update(ferramentaId, {
          caminhao_id: selectedCaminhao.id,
          localizacao: selectedCaminhao.placa
        });
        toast.success('Ferramenta vinculada');
      } else {
        await base44.entities.Ferramenta.update(ferramentaId, {
          caminhao_id: null,
          localizacao: ''
        });
        toast.success('Ferramenta desvinculada');
      }
      await loadData();
    } catch {
      toast.error('Erro ao atualizar ferramenta');
    } finally {
      setSaving(false);
    }
  };

  const selectedCaminhao = expandedCaminhaoId ? caminhoes.find(c => c.id === expandedCaminhaoId) : null;
  const ferramentasDoCaminhao = selectedCaminhao ? getFerramentasCaminhao(selectedCaminhao.id) : [];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-slate-600" />
              Caminhões ({caminhoes.length})
            </CardTitle>
            <Button
              onClick={() => {
                carregarFerramentasObrigatorias();
                setShowImportModal(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              <Upload className="w-4 h-4" />
              Ferramentas Obrigatórias
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-slate-500 py-8">Carregando...</p>
          ) : caminhoes.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum caminhão cadastrado</p>
            </div>
          ) : (
            <div className="space-y-3">
              {caminhoes.map(c => {
                const ferrs = getFerramentasCaminhao(c.id);
                const valorTotal = ferrs.reduce((s, f) => s + (f.valor_unitario || 0), 0);

                return (
                  <Card key={c.id} className="border border-slate-200">
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-bold text-base font-mono">{c.placa}</span>
                            {c.marca && <span className="text-slate-500 text-sm">{c.marca}</span>}
                            {c.modelo && <span className="text-slate-500 text-sm">{c.modelo}</span>}
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              <Wrench className="w-3 h-3 mr-1" />
                              {ferrs.length} ferramentas
                            </Badge>
                            {valorTotal > 0 && (
                              <span className="text-xs text-slate-600">R$ {valorTotal.toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                        <Button
                           onClick={() => toggleCaminhao(c.id)}
                           variant="outline"
                           className="gap-2"
                         >
                           {expandedCaminhaoId === c.id ? (
                             <ChevronUp className="w-4 h-4" />
                           ) : (
                             <ChevronDown className="w-4 h-4" />
                           )}
                           Ferramentas
                         </Button>
                      </div>
                    </div>
                  {/* Lista expansível de ferramentas */}
                  {expandedCaminhaoId === c.id && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                      {/* Ferramentas Vinculadas */}
                      {ferramentasDoCaminhao.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2 text-green-700">
                            <Check className="w-4 h-4" />
                            Ferramentas Vinculadas ({ferramentasDoCaminhao.length})
                          </h4>
                          <div className="space-y-2">
                            {ferramentasDoCaminhao.map(f => {
                              const temLaudo = f.laudo_url && f.laudo_url.trim() !== '';
                              return (
                                <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-mono font-semibold text-amber-600">{f.codigo}</span>
                                      {temLaudo && (
                                        <Badge className="bg-blue-100 text-blue-700 text-xs">📄 Laudo</Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-slate-800">{f.descricao}</p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleToggleFerramenta(f.id, false)}
                                    disabled={saving}
                                    className="text-red-600 hover:bg-red-50"
                                  >
                                    Remover
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Ferramentas Disponíveis */}
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Ferramentas Disponíveis</h4>

                        <div className="relative mb-4">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            placeholder="Buscar por código ou descrição..."
                            value={searchFerramentas}
                            onChange={(e) => setSearchFerramentas(e.target.value)}
                            className="pl-9"
                          />
                        </div>

                        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                          {ferramentas
                            .filter(f => f.caminhao_id !== c.id && (
                              !searchFerramentas ||
                              f.codigo?.toLowerCase().includes(searchFerramentas.toLowerCase()) ||
                              f.descricao?.toLowerCase().includes(searchFerramentas.toLowerCase())
                            ))
                            .length === 0 ? (
                            <div className="p-4 text-center text-slate-500">
                              <p className="text-sm">Nenhuma ferramenta disponível</p>
                            </div>
                          ) : (
                            <div className="space-y-1 p-2">
                              {ferramentas
                                .filter(f => f.caminhao_id !== c.id && (
                                  !searchFerramentas ||
                                  f.codigo?.toLowerCase().includes(searchFerramentas.toLowerCase()) ||
                                  f.descricao?.toLowerCase().includes(searchFerramentas.toLowerCase())
                                ))
                                .sort((a, b) => (a.descricao || '').localeCompare(b.descricao || ''))
                                .map(f => {
                                  const outrosCaminhoes = caminhoes.find(cm => cm.id === f.caminhao_id);
                                  return (
                                    <div key={f.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50">
                                      <div className="flex-1">
                                        <span className="text-xs font-mono font-semibold text-amber-600">{f.codigo}</span>
                                        <p className="text-sm text-slate-800">{f.descricao}</p>
                                        {outrosCaminhoes && (
                                          <p className="text-xs text-slate-500">Vinculado: {outrosCaminhoes.placa}</p>
                                        )}
                                        {f.valor_unitario && (
                                          <p className="text-xs text-slate-600">R$ {f.valor_unitario.toFixed(2)}</p>
                                        )}
                                      </div>
                                      <Button
                                        size="sm"
                                        onClick={() => handleToggleFerramenta(f.id, true)}
                                        disabled={saving}
                                        className="bg-green-600 hover:bg-green-700"
                                      >
                                        Adicionar
                                      </Button>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  </Card>
                  );
                  })}
                  </div>
                  )}
                  </CardContent>
                  </Card>

      {/* Modal Ferramentas Obrigatórias */}
      <Sheet open={showImportModal} onOpenChange={setShowImportModal}>
        <SheetContent side="right" className="w-full sm:w-96 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Ferramentas Obrigatórias para Caminhões</SheetTitle>
            <p className="text-sm text-slate-600 mt-2">Selecione as ferramentas que serão obrigatórias em todos os caminhões</p>
          </SheetHeader>

          <div className="mt-6 space-y-3">
            {ferramentas.length === 0 ? (
              <p className="text-center text-slate-500 py-4">Nenhuma ferramenta disponível</p>
            ) : (
              ferramentas.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50">
                  <Checkbox
                    checked={ferramentasSelecionadas.includes(f.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setFerramentasSelecionadas([...ferramentasSelecionadas, f.id]);
                      } else {
                        setFerramentasSelecionadas(ferramentasSelecionadas.filter(id => id !== f.id));
                      }
                    }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">{f.descricao}</p>
                    <p className="text-xs text-slate-500">{f.codigo}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowImportModal(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={aplicarFerramentasObrigatorias}
              disabled={saving || ferramentasSelecionadas.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {saving ? 'Aplicando...' : 'Aplicar'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

    </>
  );
}