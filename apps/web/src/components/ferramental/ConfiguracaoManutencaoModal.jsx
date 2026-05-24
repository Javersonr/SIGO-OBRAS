import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function ConfiguracaoManutencaoModal({ open, onOpenChange, ferramenta, onSave }) {
  const [dados, setDados] = useState({
    intervalo_manutencao_dias: 0,
    intervalo_manutencao_horas: 0,
    ultima_manutencao: '',
    proxima_manutencao: '',
    horas_uso: 0
  });
  const [usarDias, setUsarDias] = useState(false);
  const [usarHoras, setUsarHoras] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ferramenta) {
      setDados({
        intervalo_manutencao_dias: ferramenta.intervalo_manutencao_dias || 0,
        intervalo_manutencao_horas: ferramenta.intervalo_manutencao_horas || 0,
        ultima_manutencao: ferramenta.ultima_manutencao || '',
        proxima_manutencao: ferramenta.proxima_manutencao || '',
        horas_uso: ferramenta.horas_uso || 0
      });
      setUsarDias((ferramenta.intervalo_manutencao_dias || 0) > 0);
      setUsarHoras((ferramenta.intervalo_manutencao_horas || 0) > 0);
    }
  }, [ferramenta]);

  const calcularProximaManutencao = () => {
    if (!usarDias || !dados.ultima_manutencao || dados.intervalo_manutencao_dias <= 0) {
      return '';
    }

    const ultima = new Date(dados.ultima_manutencao);
    const proxima = new Date(ultima);
    proxima.setDate(proxima.getDate() + dados.intervalo_manutencao_dias);
    return proxima.toISOString().split('T')[0];
  };

  const handleSalvar = async () => {
    setLoading(true);
    try {
      const updates = {
        intervalo_manutencao_dias: usarDias ? dados.intervalo_manutencao_dias : 0,
        intervalo_manutencao_horas: usarHoras ? dados.intervalo_manutencao_horas : 0,
        ultima_manutencao: dados.ultima_manutencao || null,
        horas_uso: dados.horas_uso
      };

      // Calcular próxima manutenção automaticamente se houver intervalo
      if (usarDias && dados.ultima_manutencao && dados.intervalo_manutencao_dias > 0) {
        updates.proxima_manutencao = calcularProximaManutencao();
      } else {
        updates.proxima_manutencao = null;
      }

      await base44.entities.Ferramenta.update(ferramenta.id, updates);
      toast.success('Configurações de manutenção atualizadas');
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar Manutenção</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Info da Ferramenta */}
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm font-medium text-slate-900">{ferramenta?.codigo}</p>
            <p className="text-sm text-slate-600">{ferramenta?.descricao}</p>
          </div>

          {/* Manutenção por Tempo */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <Label className="text-base">Manutenção por Tempo</Label>
              </div>
              <Switch
                checked={usarDias}
                onCheckedChange={setUsarDias}
              />
            </div>

            {usarDias && (
              <div className="pl-6 space-y-3">
                <div>
                  <Label>Intervalo (dias)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={dados.intervalo_manutencao_dias}
                    onChange={(e) => setDados({ ...dados, intervalo_manutencao_dias: parseInt(e.target.value) || 0 })}
                    placeholder="Ex: 30, 60, 90..."
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    A cada quantos dias deve ser feita a manutenção
                  </p>
                </div>

                <div>
                  <Label>Última Manutenção</Label>
                  <Input
                    type="date"
                    value={dados.ultima_manutencao}
                    onChange={(e) => setDados({ ...dados, ultima_manutencao: e.target.value })}
                  />
                </div>

                {dados.ultima_manutencao && dados.intervalo_manutencao_dias > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm font-medium">Próxima Manutenção:</span>
                      <span className="text-sm font-bold">
                        {new Date(calcularProximaManutencao()).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Manutenção por Horas de Uso */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <Label className="text-base">Manutenção por Horas de Uso</Label>
              </div>
              <Switch
                checked={usarHoras}
                onCheckedChange={setUsarHoras}
              />
            </div>

            {usarHoras && (
              <div className="pl-6 space-y-3">
                <div>
                  <Label>Intervalo (horas)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={dados.intervalo_manutencao_horas}
                    onChange={(e) => setDados({ ...dados, intervalo_manutencao_horas: parseInt(e.target.value) || 0 })}
                    placeholder="Ex: 100, 500, 1000..."
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    A cada quantas horas de uso deve ser feita a manutenção
                  </p>
                </div>

                <div>
                  <Label>Horas de Uso Atual</Label>
                  <Input
                    type="number"
                    min="0"
                    value={dados.horas_uso}
                    onChange={(e) => setDados({ ...dados, horas_uso: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                {dados.intervalo_manutencao_horas > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-blue-700">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm">
                        Próxima manutenção em: <strong>{dados.intervalo_manutencao_horas - (dados.horas_uso % dados.intervalo_manutencao_horas)}h</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {!usarDias && !usarHoras && (
            <div className="text-center text-sm text-slate-500 py-4">
              Ative ao menos um tipo de controle de manutenção
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSalvar} 
            disabled={loading || (!usarDias && !usarHoras)}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {loading ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}