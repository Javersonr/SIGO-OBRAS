import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Hash, User, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

export default function NovoCanal({ open, onOpenChange, onCriar, empresaAtiva, user, usuariosEmpresa }) {
  const [tipo, setTipo] = useState('Geral');
  const [nome, setNome] = useState('');
  const [projetoId, setProjetoId] = useState('');
  const [oportunidadeId, setOportunidadeId] = useState('');
  const [solicitacaoId, setSolicitacaoId] = useState('');
  const [pedidoId, setPedidoId] = useState('');
  const [participantesSelecionados, setParticipantesSelecionados] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [oportunidades, setOportunidades] = useState([]);
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && empresaAtiva) {
      loadOptions();
    }
  }, [open, empresaAtiva]);

  const loadOptions = async () => {
    const [projs, ops, sols, peds] = await Promise.all([
      base44.entities.Projeto.filter({ empresa_id: empresaAtiva.id }),
      base44.entities.Oportunidade.filter({ empresa_id: empresaAtiva.id }),
      base44.entities.SolicitacaoCompra.filter({ empresa_id: empresaAtiva.id }),
      base44.entities.PedidoCompra.filter({ empresa_id: empresaAtiva.id })
    ]);
    setProjetos(projs);
    setOportunidades(ops);
    setSolicitacoes(sols);
    setPedidos(peds);
  };

  const handleCriar = async () => {
    if (!nome.trim()) return;

    setSaving(true);
    try {
      const participantes = tipo === 'Direto' 
        ? participantesSelecionados 
        : [user.id, ...participantesSelecionados];

      const participantesEmails = usuariosEmpresa
        .filter(u => participantes.includes(u.usuario_id || u.id))
        .map(u => u.usuario_email);

      const data = {
        empresa_id: empresaAtiva.id,
        tipo,
        nome,
        projeto_id: tipo === 'Projeto' ? projetoId : null,
        oportunidade_id: tipo === 'Oportunidade' ? oportunidadeId : null,
        solicitacao_id: tipo === 'Solicitacao' ? solicitacaoId : null,
        pedido_id: tipo === 'Tarefa' ? pedidoId : null,
        participantes: JSON.stringify(participantes),
        participantes_emails: JSON.stringify(participantesEmails),
        ativo: true
      };

      await onCriar(data);
      
      // Reset form
      setTipo('Geral');
      setNome('');
      setProjetoId('');
      setOportunidadeId('');
      setSolicitacaoId('');
      setPedidoId('');
      setParticipantesSelecionados([]);
    } catch (error) {
      console.error('Erro ao criar canal:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleParticipante = (usuarioId) => {
    setParticipantesSelecionados(prev => 
      prev.includes(usuarioId)
        ? prev.filter(id => id !== usuarioId)
        : [...prev, usuarioId]
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Novo Canal de Chat</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Tipo de Canal */}
          <div>
            <Label>Tipo de Canal</Label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {[
                { value: 'Geral', icon: MessageSquare, label: 'Geral', color: 'amber' },
                { value: 'Projeto', icon: Hash, label: 'Projeto', color: 'blue' },
                { value: 'Oportunidade', icon: Hash, label: 'Oportunidade', color: 'green' },
                { value: 'Solicitacao', icon: Hash, label: 'Solicitação', color: 'orange' },
                { value: 'Tarefa', icon: Hash, label: 'Pedido/Tarefa', color: 'cyan' },
                { value: 'Direto', icon: User, label: 'Mensagem Direta', color: 'purple' }
              ].map(option => (
                <Card
                  key={option.value}
                  className={`cursor-pointer transition-all ${
                    tipo === option.value 
                      ? `border-${option.color}-500 bg-${option.color}-50` 
                      : 'hover:border-slate-300'
                  }`}
                  onClick={() => setTipo(option.value)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <option.icon className={`w-5 h-5 text-${option.color}-600`} />
                    <span className="text-sm font-medium">{option.label}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Nome do Canal */}
          <div>
            <Label>Nome do Canal *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={
                tipo === 'Direto' ? 'Será gerado automaticamente' :
                tipo === 'Projeto' ? 'Ex: Discussão do Projeto' :
                'Ex: Canal Geral'
              }
              className="mt-1.5"
              disabled={tipo === 'Direto'}
            />
          </div>

          {/* Seleção de Projeto */}
          {tipo === 'Projeto' && (
            <div>
              <Label>Selecione o Projeto</Label>
              <Select value={projetoId} onValueChange={setProjetoId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Escolha um projeto" />
                </SelectTrigger>
                <SelectContent>
                  {projetos.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.titulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Seleção de Oportunidade */}
          {tipo === 'Oportunidade' && (
            <div>
              <Label>Selecione a Oportunidade</Label>
              <Select value={oportunidadeId} onValueChange={setOportunidadeId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Escolha uma oportunidade" />
                </SelectTrigger>
                <SelectContent>
                  {oportunidades.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.titulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Seleção de Solicitação */}
          {tipo === 'Solicitacao' && (
            <div>
              <Label>Selecione a Solicitação</Label>
              <Select value={solicitacaoId} onValueChange={setSolicitacaoId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Escolha uma solicitação" />
                </SelectTrigger>
                <SelectContent>
                  {solicitacoes.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.numero} - {s.status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Seleção de Pedido/Tarefa */}
          {tipo === 'Tarefa' && (
            <div>
              <Label>Selecione o Pedido</Label>
              <Select value={pedidoId} onValueChange={setPedidoId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Escolha um pedido" />
                </SelectTrigger>
                <SelectContent>
                  {pedidos.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.numero} - {p.fornecedor_nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Participantes */}
          {tipo !== 'Geral' && (
            <div>
              <Label>Participantes</Label>
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                {usuariosEmpresa.map(u => {
                  const usuarioId = u.usuario_id || u.id;
                  const isSelecionado = participantesSelecionados.includes(usuarioId);
                  
                  return (
                    <div key={u.id} className="flex items-center gap-3">
                      <Checkbox
                        id={`user-${u.id}`}
                        checked={isSelecionado}
                        onCheckedChange={() => toggleParticipante(usuarioId)}
                      />
                      <label
                        htmlFor={`user-${u.id}`}
                        className="flex-1 flex items-center gap-2 cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                          {u.usuario_email?.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {u.nome_completo || u.usuario_email}
                          </p>
                          <p className="text-xs text-slate-500">{u.perfil}</p>
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {participantesSelecionados.length} participante(s) selecionado(s)
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleCriar}
            disabled={saving || (!nome.trim() && tipo !== 'Direto') || (tipo === 'Direto' && participantesSelecionados.length === 0)}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {saving ? 'Criando...' : 'Criar Canal'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}