import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Settings } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function RegrasConciliacao({ empresaAtiva }) {
  const [regras, setRegras] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedRegra, setSelectedRegra] = useState(null);
  const [form, setForm] = useState({
    nome: '',
    tipo_match: 'contem',
    tolerancia_valor: 0,
    tolerancia_dias: 3,
    ignorar_descricao: false,
    palavras_chave: '',
    prioridade: 1,
    ativo: true
  });

  useEffect(() => {
    if (empresaAtiva) {
      loadRegras();
    }
  }, [empresaAtiva]);

  const loadRegras = async () => {
    const data = await base44.entities.RegraConciliacao.filter({ empresa_id: empresaAtiva.id });
    setRegras(data.sort((a, b) => (a.prioridade || 0) - (b.prioridade || 0)));
  };

  const handleOpen = (regra = null) => {
    if (regra) {
      setForm({
        nome: regra.nome || '',
        tipo_match: regra.tipo_match || 'contem',
        tolerancia_valor: regra.tolerancia_valor || 0,
        tolerancia_dias: regra.tolerancia_dias || 3,
        ignorar_descricao: regra.ignorar_descricao || false,
        palavras_chave: regra.palavras_chave ? JSON.parse(regra.palavras_chave).join(', ') : '',
        prioridade: regra.prioridade || 1,
        ativo: regra.ativo !== false
      });
      setSelectedRegra(regra);
    } else {
      setForm({
        nome: '',
        tipo_match: 'contem',
        tolerancia_valor: 0,
        tolerancia_dias: 3,
        ignorar_descricao: false,
        palavras_chave: '',
        prioridade: regras.length + 1,
        ativo: true
      });
      setSelectedRegra(null);
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nome) {
      alert('Por favor, preencha o nome da regra');
      return;
    }

    const data = {
      empresa_id: empresaAtiva.id,
      nome: form.nome,
      tipo_match: form.tipo_match,
      tolerancia_valor: parseFloat(form.tolerancia_valor) || 0,
      tolerancia_dias: parseInt(form.tolerancia_dias) || 0,
      ignorar_descricao: form.ignorar_descricao,
      palavras_chave: form.palavras_chave 
        ? JSON.stringify(form.palavras_chave.split(',').map(p => p.trim()).filter(p => p))
        : null,
      prioridade: parseInt(form.prioridade) || 1,
      ativo: form.ativo
    };

    if (selectedRegra) {
      await base44.entities.RegraConciliacao.update(selectedRegra.id, data);
    } else {
      await base44.entities.RegraConciliacao.create(data);
    }

    setShowModal(false);
    loadRegras();
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta regra?')) return;
    await base44.entities.RegraConciliacao.delete(id);
    loadRegras();
  };

  const handleToggleAtivo = async (regra) => {
    await base44.entities.RegraConciliacao.update(regra.id, { ativo: !regra.ativo });
    loadRegras();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Regras de Conciliação</h3>
          <p className="text-sm text-slate-500">Configure regras para conciliação automática</p>
        </div>
        <Button onClick={() => handleOpen()} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Regra
        </Button>
      </div>

      <div className="space-y-2">
        {regras.map(regra => (
          <Card key={regra.id} className={!regra.ativo ? 'opacity-50' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-slate-800">{regra.nome}</h4>
                    <Badge variant={regra.ativo ? 'default' : 'outline'}>
                      {regra.ativo ? 'Ativa' : 'Inativa'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Prioridade: {regra.prioridade}
                    </Badge>
                  </div>
                  <div className="flex gap-4 text-xs text-slate-600">
                    <span>Match: {regra.tipo_match === 'exato' ? 'Exato' : regra.tipo_match === 'contem' ? 'Contém' : 'Palavra-chave'}</span>
                    <span>Valor: ±R$ {regra.tolerancia_valor?.toFixed(2)}</span>
                    <span>Data: ±{regra.tolerancia_dias} dias</span>
                    {regra.palavras_chave && (
                      <span>Palavras: {JSON.parse(regra.palavras_chave).join(', ')}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleToggleAtivo(regra)}
                    className="h-8 w-8"
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleOpen(regra)}
                    className="h-8 w-8"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(regra.id)}
                    className="h-8 w-8"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Sheet open={showModal} onOpenChange={setShowModal}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selectedRegra ? 'Editar Regra' : 'Nova Regra'}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 py-6">
            <div>
              <Label>Nome da Regra *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: PIX Recebido"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Tipo de Match</Label>
              <Select value={form.tipo_match} onValueChange={(v) => setForm({ ...form, tipo_match: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exato">Descrição Exata</SelectItem>
                  <SelectItem value="contem">Descrição Contém</SelectItem>
                  <SelectItem value="palavra_chave">Palavras-chave</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.tipo_match === 'palavra_chave' && (
              <div>
                <Label>Palavras-chave (separadas por vírgula)</Label>
                <Input
                  value={form.palavras_chave}
                  onChange={(e) => setForm({ ...form, palavras_chave: e.target.value })}
                  placeholder="pix, transferencia, ted"
                  className="mt-1.5"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tolerância Valor (R$)</Label>
                <Input
                  type="number"
                  value={form.tolerancia_valor}
                  onChange={(e) => setForm({ ...form, tolerancia_valor: e.target.value })}
                  placeholder="0.00"
                  className="mt-1.5"
                  step="0.01"
                />
              </div>
              <div>
                <Label>Tolerância Dias</Label>
                <Input
                  type="number"
                  value={form.tolerancia_dias}
                  onChange={(e) => setForm({ ...form, tolerancia_dias: e.target.value })}
                  placeholder="3"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label>Prioridade</Label>
              <Input
                type="number"
                value={form.prioridade}
                onChange={(e) => setForm({ ...form, prioridade: e.target.value })}
                className="mt-1.5"
                min="1"
              />
              <p className="text-xs text-slate-500 mt-1">Regras com prioridade menor são executadas primeiro</p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="ignorar"
                checked={form.ignorar_descricao}
                onCheckedChange={(v) => setForm({ ...form, ignorar_descricao: v })}
              />
              <Label htmlFor="ignorar" className="cursor-pointer">
                Ignorar descrição (apenas valor e data)
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="ativo"
                checked={form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
              />
              <Label htmlFor="ativo" className="cursor-pointer">
                Regra ativa
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar Regra</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}