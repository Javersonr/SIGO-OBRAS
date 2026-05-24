import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter 
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { 
  Plus, Trash2, Upload, X, CheckCircle2, AlertCircle, Link2, Clock, Users, FileText, Eye, Pencil, DollarSign
} from 'lucide-react';
import { cn } from '@/lib/utils';
import AnexoViewer from '@/components/shared/AnexoViewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function EditarTarefas({ 
  tarefa, 
  projetoId, 
  empresaAtiva, 
  usuariosEmpresa, 
  tarefas,
  statusInicial,
  dataInicial,
  onClose 
}) {
  const [dados, setDados] = useState({
    titulo: '',
    descricao: '',
    status: statusInicial || 'A Fazer',
    prioridade: 'Normal',
    responsavel_principal_id: '',
    responsaveis_ids: [],
    data_inicio: dataInicial || '',
    data_fim: '',
    progresso: 0,
    dependencias: [],
    tags: [],
    tempo_estimado_horas: '',
    anexos: []
  });

  const [subtarefas, setSubtarefas] = useState([]);
  const [novaSubtarefa, setNovaSubtarefa] = useState('');
  const [novaSubtarefaDataInicio, setNovaSubtarefaDataInicio] = useState('');
  const [novaSubtarefaDataFim, setNovaSubtarefaDataFim] = useState('');
  const [uploading, setUploading] = useState(false);
  const [anexoVisualizacao, setAnexoVisualizacao] = useState(null);
  const [subtarefaEditando, setSubtarefaEditando] = useState(null);
  const [tituloEditando, setTituloEditando] = useState('');
  const [despesasVinculadas, setDespesasVinculadas] = useState([]);
  const [showVincularDespesa, setShowVincularDespesa] = useState(false);
  const [despesasDisponiveis, setDespesasDisponiveis] = useState([]);
  const [loadingDespesas, setLoadingDespesas] = useState(false);

  useEffect(() => {
    if (tarefa) {
      setDados({
        titulo: tarefa.titulo || '',
        descricao: tarefa.descricao || '',
        status: tarefa.status || 'A Fazer',
        prioridade: tarefa.prioridade || 'Normal',
        responsavel_principal_id: tarefa.responsavel_principal_id || '',
        responsaveis_ids: tarefa.responsaveis_ids ? JSON.parse(tarefa.responsaveis_ids) : [],
        data_inicio: tarefa.data_inicio || '',
        data_fim: tarefa.data_fim || '',
        progresso: tarefa.progresso || 0,
        dependencias: tarefa.dependencias ? JSON.parse(tarefa.dependencias) : [],
        tags: tarefa.tags ? JSON.parse(tarefa.tags) : [],
        tempo_estimado_horas: tarefa.tempo_estimado_horas || '',
        anexos: tarefa.anexos ? JSON.parse(tarefa.anexos) : []
      });

      // Carregar subtarefas
      loadSubtarefas();
      loadDespesasVinculadas();
    }
  }, [tarefa]);

  const loadSubtarefas = async () => {
    if (!tarefa?.id) return;
    const result = await base44.entities.TarefaProjeto.filter({
      empresa_id: empresaAtiva.id,
      projeto_id: projetoId,
      tarefa_pai_id: tarefa.id
    });
    setSubtarefas(result);
  };

  const loadDespesasVinculadas = async () => {
    if (!tarefa?.id) return;
    try {
      const result = await base44.entities.TransacaoFinanceira.filter({
        empresa_id: empresaAtiva.id,
        tipo: 'Despesa',
        referencia_id: tarefa.id
      });
      setDespesasVinculadas(result);
    } catch (e) { console.error(e); }
  };

  const handleAbrirVincularDespesa = async () => {
    setShowVincularDespesa(true);
    setLoadingDespesas(true);
    try {
      const result = await base44.entities.TransacaoFinanceira.filter({
        empresa_id: empresaAtiva.id,
        tipo: 'Despesa',
        projeto_id: projetoId
      });
      // Excluir as já vinculadas a esta tarefa
      setDespesasDisponiveis(result.filter(d => d.referencia_id !== tarefa?.id));
    } catch (e) { console.error(e); } finally {
      setLoadingDespesas(false);
    }
  };

  const handleVincularDespesa = async (despesa) => {
    await base44.entities.TransacaoFinanceira.update(despesa.id, {
      referencia_id: tarefa.id,
      referencia_tipo: 'Outro'
    });
    setDespesasDisponiveis(prev => prev.filter(d => d.id !== despesa.id));
    await loadDespesasVinculadas();
  };

  const handleDesvincularDespesa = async (despesa) => {
    await base44.entities.TransacaoFinanceira.update(despesa.id, {
      referencia_id: null
    });
    await loadDespesasVinculadas();
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const handleSalvar = async () => {
    if (!dados.titulo.trim()) return;

    const responsavelPrincipal = usuariosEmpresa.find(
      u => (u.usuario_id || u.id) === dados.responsavel_principal_id
    );

    const responsaveisNomes = dados.responsaveis_ids.map(id => {
      const usuario = usuariosEmpresa.find(u => (u.usuario_id || u.id) === id);
      return usuario?.nome_completo || usuario?.usuario_email || '';
    });

    const dataComum = {
      empresa_id: empresaAtiva.id,
      projeto_id: projetoId,
      titulo: dados.titulo,
      descricao: dados.descricao,
      status: dados.status,
      prioridade: dados.prioridade,
      responsavel_principal_id: dados.responsavel_principal_id,
      responsavel_principal_nome: responsavelPrincipal?.nome_completo || responsavelPrincipal?.usuario_email || '',
      responsavel_principal_email: responsavelPrincipal?.usuario_email || '',
      responsaveis_ids: JSON.stringify(dados.responsaveis_ids),
      responsaveis_nomes: JSON.stringify(responsaveisNomes),
      data_inicio: dados.data_inicio || null,
      data_fim: dados.data_fim || null,
      progresso: dados.progresso,
      dependencias: JSON.stringify(dados.dependencias),
      tags: JSON.stringify(dados.tags),
      tempo_estimado_horas: dados.tempo_estimado_horas || null,
      anexos: JSON.stringify(dados.anexos),
      data_conclusao: dados.status === 'Concluída' ? new Date().toISOString().split('T')[0] : null
    };

    if (tarefa) {
      await base44.entities.TarefaProjeto.update(tarefa.id, dataComum);
    } else {
      await base44.entities.TarefaProjeto.create(dataComum);
    }

    onClose();
  };

  const handleAdicionarSubtarefa = async () => {
    if (!novaSubtarefa.trim() || !tarefa?.id) return;

    await base44.entities.TarefaProjeto.create({
      empresa_id: empresaAtiva.id,
      projeto_id: projetoId,
      tarefa_pai_id: tarefa.id,
      titulo: novaSubtarefa,
      status: 'A Fazer',
      prioridade: 'Normal',
      data_inicio: novaSubtarefaDataInicio || null,
      data_fim: novaSubtarefaDataFim || null,
      responsaveis_ids: JSON.stringify([]),
      responsaveis_nomes: JSON.stringify([])
    });

    setNovaSubtarefa('');
    setNovaSubtarefaDataInicio('');
    setNovaSubtarefaDataFim('');
    loadSubtarefas();
  };

  const handleToggleSubtarefa = async (subtarefa) => {
    const novoStatus = subtarefa.status === 'Concluída' ? 'A Fazer' : 'Concluída';
    await base44.entities.TarefaProjeto.update(subtarefa.id, { 
      status: novoStatus,
      progresso: novoStatus === 'Concluída' ? 100 : 0
    });
    loadSubtarefas();
  };

  const handleConcluirSubtarefa = async (subtarefaId) => {
    await base44.entities.TarefaProjeto.update(subtarefaId, {
      status: 'Concluída',
      progresso: 100
    });
    loadSubtarefas();
  };

  const handleEditarDataSubtarefa = async (subtarefaId, campo, valor) => {
    await base44.entities.TarefaProjeto.update(subtarefaId, {
      [campo]: valor || null
    });
    loadSubtarefas();
  };

  const handleConcluirTarefa = async () => {
    if (!dados.titulo.trim()) return;

    const responsavelPrincipal = usuariosEmpresa.find(
      u => (u.usuario_id || u.id) === dados.responsavel_principal_id
    );
    const responsaveisNomes = dados.responsaveis_ids.map(id => {
      const usuario = usuariosEmpresa.find(u => (u.usuario_id || u.id) === id);
      return usuario?.nome_completo || usuario?.usuario_email || '';
    });

    const dataComum = {
      empresa_id: empresaAtiva.id,
      projeto_id: projetoId,
      titulo: dados.titulo,
      descricao: dados.descricao,
      status: 'Concluída',
      prioridade: dados.prioridade,
      responsavel_principal_id: dados.responsavel_principal_id,
      responsavel_principal_nome: responsavelPrincipal?.nome_completo || responsavelPrincipal?.usuario_email || '',
      responsavel_principal_email: responsavelPrincipal?.usuario_email || '',
      responsaveis_ids: JSON.stringify(dados.responsaveis_ids),
      responsaveis_nomes: JSON.stringify(responsaveisNomes),
      data_inicio: dados.data_inicio || null,
      data_fim: dados.data_fim || null,
      progresso: 100,
      dependencias: JSON.stringify(dados.dependencias),
      tags: JSON.stringify(dados.tags),
      tempo_estimado_horas: dados.tempo_estimado_horas || null,
      anexos: JSON.stringify(dados.anexos),
      data_conclusao: new Date().toISOString().split('T')[0]
    };

    if (tarefa) {
      await base44.entities.TarefaProjeto.update(tarefa.id, dataComum);

      // Liberar tarefas que dependiam desta e agora podem ser desbloqueadas
      const todasTarefas = await base44.entities.TarefaProjeto.filter({
        empresa_id: empresaAtiva.id,
        projeto_id: projetoId
      });

      const tarefasAtualizado = todasTarefas.map(t =>
        t.id === tarefa.id ? { ...t, status: 'Concluída' } : t
      );

      const tarefasParaLiberar = tarefasAtualizado.filter(t => {
        if (t.id === tarefa.id || t.status !== 'Bloqueada') return false;
        const deps = t.dependencias ? JSON.parse(t.dependencias) : [];
        if (!deps.includes(tarefa.id)) return false;
        // Verificar se TODAS as dependências desta tarefa estão concluídas agora
        return deps.every(depId => {
          const depTarefa = tarefasAtualizado.find(x => x.id === depId);
          return depTarefa?.status === 'Concluída';
        });
      });

      for (const t of tarefasParaLiberar) {
        await base44.entities.TarefaProjeto.update(t.id, { status: 'A Fazer' });
      }
    } else {
      await base44.entities.TarefaProjeto.create(dataComum);
    }

    onClose();
  };

  const handleIniciarEdicaoSubtarefa = (subtarefa) => {
    setSubtarefaEditando(subtarefa.id);
    setTituloEditando(subtarefa.titulo);
  };

  const handleSalvarEdicaoSubtarefa = async (subtarefaId) => {
    if (!tituloEditando.trim()) return;
    await base44.entities.TarefaProjeto.update(subtarefaId, {
      titulo: tituloEditando
    });
    setSubtarefaEditando(null);
    setTituloEditando('');
    loadSubtarefas();
  };

  const handleCancelarEdicaoSubtarefa = () => {
    setSubtarefaEditando(null);
    setTituloEditando('');
  };

  const handleRemoverSubtarefa = async (id) => {
    if (!confirm('Remover esta subtarefa?')) return;
    await base44.entities.TarefaProjeto.delete(id);
    loadSubtarefas();
  };

  const handleUploadAnexo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = result.file_url || result.url || result;
      
      // Determinar tipo do arquivo
      let tipo = file.type;
      if (!tipo || tipo === 'application/octet-stream') {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') tipo = 'application/pdf';
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) tipo = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      }
      
      setDados(prev => ({
        ...prev,
        anexos: [...prev.anexos, { url: fileUrl, nome: file.name, tipo: tipo || file.type }]
      }));
      e.target.value = '';
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert('Erro ao fazer upload: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const tarefasDisponiveis = tarefas.filter(t => 
    t.id !== tarefa?.id && !t.tarefa_pai_id && t.projeto_id === projetoId
  );

  const handleToggleDependencia = (tarefaId) => {
    setDados(prev => ({
      ...prev,
      dependencias: prev.dependencias.includes(tarefaId)
        ? prev.dependencias.filter(id => id !== tarefaId)
        : [...prev.dependencias, tarefaId]
    }));
  };

  const handleToggleResponsavel = (usuarioId) => {
    setDados(prev => ({
      ...prev,
      responsaveis_ids: prev.responsaveis_ids.includes(usuarioId)
        ? prev.responsaveis_ids.filter(id => id !== usuarioId)
        : [...prev.responsaveis_ids, usuarioId]
    }));
  };

  const handleVisualizarAnexo = (anexo) => {
    setAnexoVisualizacao(anexo);
  };

  return (
    <>
    <Sheet open onOpenChange={onClose}>
      <SheetContent 
        side="right" 
        className="h-full overflow-y-auto p-6 flex flex-col w-full" 
        style={{ inset: 'auto 0 0 256px', width: 'calc(100% - 256px)', maxWidth: 'none' }}
      >
        <SheetHeader>
          <SheetTitle>{tarefa ? 'Editar Tarefa' : 'Nova Tarefa'}</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 pb-4">
            {/* Título */}
            <div>
              <Label>Título *</Label>
              <Input
                value={dados.titulo}
                onChange={(e) => setDados({ ...dados, titulo: e.target.value })}
                placeholder="Ex: Implementar sistema de login"
                className="mt-1"
              />
            </div>

            {/* Status e Prioridade */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={dados.status} onValueChange={(v) => setDados({ ...dados, status: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A Fazer">A Fazer</SelectItem>
                    <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                    <SelectItem value="Em Revisão">Em Revisão</SelectItem>
                    <SelectItem value="Concluída">Concluída</SelectItem>
                    <SelectItem value="Bloqueada">Bloqueada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Prioridade</Label>
                <Select value={dados.prioridade} onValueChange={(v) => setDados({ ...dados, prioridade: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Baixa">Baixa</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Alta">Alta</SelectItem>
                    <SelectItem value="Urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Descrição */}
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={dados.descricao}
                onChange={(e) => setDados({ ...dados, descricao: e.target.value })}
                placeholder="Descreva os detalhes da tarefa..."
                className="mt-1"
                rows={3}
              />
            </div>

            {/* Responsável Principal */}
            <div>
              <Label>Responsável Principal</Label>
              <Select 
                value={dados.responsavel_principal_id} 
                onValueChange={(v) => setDados({ ...dados, responsavel_principal_id: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {usuariosEmpresa.map(u => (
                    <SelectItem key={u.usuario_id || u.id} value={u.usuario_id || u.id}>
                      {u.nome_completo || u.usuario_email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Múltiplos Responsáveis */}
            <div>
              <Label className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Responsáveis Adicionais
              </Label>
              <ScrollArea className="h-32 mt-2 border rounded-md p-2">
                <div className="space-y-2">
                  {usuariosEmpresa.map(usuario => {
                    const usuarioId = usuario.usuario_id || usuario.id;
                    return (
                      <div key={usuarioId} className="flex items-center gap-2">
                        <Checkbox
                          checked={dados.responsaveis_ids.includes(usuarioId)}
                          onCheckedChange={() => handleToggleResponsavel(usuarioId)}
                        />
                        <span className="text-sm">{usuario.nome_completo || usuario.usuario_email}</span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Datas e Tempo */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Data Início</Label>
                <Input
                  type="date"
                  value={dados.data_inicio}
                  onChange={(e) => setDados({ ...dados, data_inicio: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Data Fim</Label>
                <Input
                  type="date"
                  value={dados.data_fim}
                  onChange={(e) => setDados({ ...dados, data_fim: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Tempo Estimado (h)
                </Label>
                <Input
                  type="number"
                  value={dados.tempo_estimado_horas}
                  onChange={(e) => setDados({ ...dados, tempo_estimado_horas: e.target.value })}
                  placeholder="Ex: 8"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Progresso */}
            {dados.status !== 'Concluída' && (
              <div>
                <Label>Progresso: {dados.progresso}%</Label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={dados.progresso}
                  onChange={(e) => setDados({ ...dados, progresso: parseInt(e.target.value) })}
                  className="w-full mt-2"
                />
              </div>
            )}

            <Separator />

            {/* Dependências */}
            <div>
              <Label className="flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Dependências (tarefas que devem ser concluídas primeiro)
              </Label>
              {tarefasDisponiveis.length > 0 ? (
                <ScrollArea className="h-32 mt-2 border rounded-md p-2">
                  <div className="space-y-2">
                    {tarefasDisponiveis.map(t => (
                      <div key={t.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={dados.dependencias.includes(t.id)}
                          onCheckedChange={() => handleToggleDependencia(t.id)}
                        />
                        <span className="text-sm flex-1">{t.titulo}</span>
                        <Badge variant={t.status === 'Concluída' ? 'success' : 'secondary'} className="text-xs">
                          {t.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-slate-500 mt-2">Nenhuma tarefa disponível</p>
              )}
            </div>

            {/* Subtarefas */}
            {tarefa && (
              <>
                <Separator />
                <div>
                  <Label>Subtarefas ({subtarefas.length})</Label>
                  <div className="mt-2 space-y-2">
                    {subtarefas.map(sub => (
                      <div key={sub.id} className="p-3 bg-slate-50 rounded border space-y-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={sub.status === 'Concluída'}
                            onCheckedChange={() => handleToggleSubtarefa(sub)}
                          />
                          {subtarefaEditando === sub.id ? (
                            <>
                              <Input
                                value={tituloEditando}
                                onChange={(e) => setTituloEditando(e.target.value)}
                                className="flex-1 h-8"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSalvarEdicaoSubtarefa(sub.id);
                                  if (e.key === 'Escape') handleCancelarEdicaoSubtarefa();
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleSalvarEdicaoSubtarefa(sub.id)}
                              >
                                <CheckCircle2 className="w-3 h-3 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={handleCancelarEdicaoSubtarefa}
                              >
                                <X className="w-3 h-3 text-red-500" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className={cn(
                                "text-sm font-medium flex-1",
                                sub.status === 'Concluída' && "line-through text-slate-500"
                              )}>
                                {sub.titulo}
                              </span>
                              {sub.status !== 'Concluída' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleIniciarEdicaoSubtarefa(sub)}
                                    title="Editar"
                                  >
                                    <Pencil className="w-3 h-3 text-slate-600" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => handleConcluirSubtarefa(sub.id)}
                                  >
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    Concluir
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleRemoverSubtarefa(sub.id)}
                              >
                                <Trash2 className="w-3 h-3 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                        {subtarefaEditando !== sub.id && (
                          <div className="flex gap-2 ml-6">
                            <div className="flex-1">
                              <Label className="text-xs text-slate-600">Data Início</Label>
                              <Input
                                type="date"
                                value={sub.data_inicio || ''}
                                onChange={(e) => handleEditarDataSubtarefa(sub.id, 'data_inicio', e.target.value)}
                                className="h-8 text-xs mt-1"
                                disabled={sub.status === 'Concluída'}
                              />
                            </div>
                            <div className="flex-1">
                              <Label className="text-xs text-slate-600">Data Fim</Label>
                              <Input
                                type="date"
                                value={sub.data_fim || ''}
                                onChange={(e) => handleEditarDataSubtarefa(sub.id, 'data_fim', e.target.value)}
                                className="h-8 text-xs mt-1"
                                disabled={sub.status === 'Concluída'}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="space-y-2 p-3 border rounded bg-white">
                      <Input
                        value={novaSubtarefa}
                        onChange={(e) => setNovaSubtarefa(e.target.value)}
                        placeholder="Título da nova subtarefa..."
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAdicionarSubtarefa()}
                      />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-xs text-slate-600">Data Início</Label>
                          <Input
                            type="date"
                            value={novaSubtarefaDataInicio}
                            onChange={(e) => setNovaSubtarefaDataInicio(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs text-slate-600">Data Fim</Label>
                          <Input
                            type="date"
                            value={novaSubtarefaDataFim}
                            onChange={(e) => setNovaSubtarefaDataFim(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <Button onClick={handleAdicionarSubtarefa} className="self-end">
                          <Plus className="w-4 h-4 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Despesas Vinculadas */}
            {tarefa && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Despesas Vinculadas
                    {despesasVinculadas.length > 0 && (
                      <span className="text-xs font-normal text-slate-500">
                        ({formatCurrency(despesasVinculadas.reduce((s, d) => s + (d.valor || 0), 0))})
                      </span>
                    )}
                  </Label>
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handleAbrirVincularDespesa}>
                    <Plus className="w-3 h-3" />
                    Vincular
                  </Button>
                </div>
                {despesasVinculadas.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Nenhuma despesa vinculada</p>
                ) : (
                  <div className="space-y-2">
                    {despesasVinculadas.map(d => (
                      <div key={d.id} className="flex items-center gap-2 p-2 bg-red-50 border border-red-100 rounded text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 truncate">{d.descricao || 'Sem descrição'}</p>
                          <p className="text-xs text-slate-500">
                            {d.data ? new Date(d.data).toLocaleDateString('pt-BR') : ''} • {d.status}
                          </p>
                        </div>
                        <span className="font-semibold text-red-600 whitespace-nowrap">{formatCurrency(d.valor)}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => handleDesvincularDespesa(d)} title="Desvincular">
                          <X className="w-3 h-3 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Anexos */}
            <div>
              <Label className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Anexos
              </Label>
              <div className="mt-2 space-y-2">
                <input
                  ref={(ref) => { if (ref) window.tarefaAnexoInput = ref; }}
                  type="file"
                  className="hidden"
                  onChange={handleUploadAnexo}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.tarefaAnexoInput?.click()}
                  disabled={uploading}
                  className="w-full gap-2"
                  size="sm"
                >
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Enviando...' : 'Adicionar Anexo'}
                </Button>
                
                {dados.anexos.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {dados.anexos.map((anexo, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 bg-slate-50 rounded border hover:bg-slate-100 transition-colors">
                        <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <span className="flex-1 text-sm truncate">{anexo.nome}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-blue-100"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleVisualizarAnexo(anexo);
                          }}
                          title="Visualizar"
                          type="button"
                        >
                          <Eye className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-red-100"
                          onClick={() => setDados(prev => ({
                            ...prev,
                            anexos: prev.anexos.filter((_, i) => i !== index)
                          }))}
                          title="Remover"
                        >
                          <X className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="flex-shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          {tarefa && dados.status !== 'Concluída' && (
            <Button 
              onClick={handleConcluirTarefa} 
              variant="outline"
              className="border-green-500 text-green-600 hover:bg-green-50"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Concluir Tarefa
            </Button>
          )}
          <Button onClick={handleSalvar} disabled={!dados.titulo.trim()}>
            {tarefa ? 'Atualizar' : 'Criar'} Tarefa
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    {/* Modal de Visualização de Anexo - FORA do Sheet */}
    {anexoVisualizacao && (
      <AnexoViewer
        anexo={anexoVisualizacao}
        open={!!anexoVisualizacao}
        onOpenChange={() => setAnexoVisualizacao(null)}
      />
    )}

    {/* Modal Vincular Despesa */}
    <Dialog open={showVincularDespesa} onOpenChange={setShowVincularDespesa}>
      <DialogContent data-fullscreen-modal className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Vincular Despesa à Tarefa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-96 overflow-y-auto py-2">
          {loadingDespesas ? (
            <div className="text-center py-8 text-slate-500">Carregando despesas...</div>
          ) : despesasDisponiveis.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma despesa disponível para vincular.<br/>Cadastre despesas no financeiro vinculadas a este projeto.</p>
            </div>
          ) : (
            despesasDisponiveis.map(d => (
              <div key={d.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{d.descricao || 'Sem descrição'}</p>
                  <p className="text-xs text-slate-500">
                    {d.data ? new Date(d.data).toLocaleDateString('pt-BR') : ''} • {d.categoria_nome || ''} • {d.status}
                  </p>
                </div>
                <span className="font-semibold text-red-600 whitespace-nowrap">{formatCurrency(d.valor)}</span>
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 flex-shrink-0" onClick={() => handleVincularDespesa(d)}>
                  Vincular
                </Button>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowVincularDespesa(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}