import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trash2, Loader } from 'lucide-react';
import { toast } from 'sonner';

export default function SolicitacaoCompraModal({
  open,
  onOpenChange,
  itensPrevisao = [],
  fornecedores = [],
  empresaAtiva,
  user
}) {
  const [itens, setItens] = useState([]);
  const [fornecedorId, setFornecedorId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Preparar itens quando o modal abre
  React.useEffect(() => {
    if (open && itensPrevisao.length > 0) {
      const itensParaPedir = itensPrevisao
        .filter(item => item.nivelUrgencia === 'crítico' || item.nivelUrgencia === 'alto')
        .map(item => ({
          id: item.id,
          codigo: item.codigo,
          descricao: item.descricao,
          quantidade: item.quantidadeRecomendada,
          original: item
        }));
      setItens(itensParaPedir);
    }
  }, [open, itensPrevisao]);

  const atualizarQuantidade = (id, novaQuantidade) => {
    setItens(itens.map(item =>
      item.id === id ? { ...item, quantidade: Math.max(0, parseInt(novaQuantidade) || 0) } : item
    ));
  };

  const removerItem = (id) => {
    setItens(itens.filter(item => item.id !== id));
  };

  const salvarSolicitacao = async () => {
    if (!fornecedorId || itens.length === 0) {
      toast.error('Selecione um fornecedor e adicione itens');
      return;
    }

    setSalvando(true);
    try {
      // Criar solicitação de compra
      const solicitacao = await base44.entities.SolicitacaoCompra.create({
        empresa_id: empresaAtiva.id,
        fornecedor_id: fornecedorId,
        status: 'Rascunho',
        descricao: descricao || 'Solicitação gerada por previsão de demanda',
        usuario_solicitante_email: user.email,
        usuario_solicitante_nome: user.full_name,
        data_solicitacao: new Date().toISOString().split('T')[0],
        observacoes: 'Criada a partir de análise de previsão de demanda'
      });

      // Criar itens da solicitação
      for (const item of itens) {
        if (item.quantidade > 0) {
          await base44.entities.SolicitacaoCompraItem.create({
            empresa_id: empresaAtiva.id,
            solicitacao_id: solicitacao.id,
            ferramenta_id: item.id,
            ferramenta_codigo: item.codigo,
            ferramenta_descricao: item.descricao,
            quantidade_solicitada: item.quantidade,
            status: 'Aberto'
          });
        }
      }

      toast.success(`✓ Solicitação ${solicitacao.id} criada como rascunho`);
      onOpenChange(false);
      setItens([]);
      setFornecedorId('');
      setDescricao('');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao criar solicitação');
    } finally {
      setSalvando(false);
    }
  };

  const totalItens = itens.reduce((sum, item) => sum + item.quantidade, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Solicitação de Compra</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações Gerais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações Gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">Fornecedor *</Label>
                <Select value={fornecedorId} onValueChange={setFornecedorId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione o fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {fornecedores.map(f => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome_razao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-semibold">Observações (opcional)</Label>
                <Input
                  placeholder="Ex: Reposição urgente por previsão de demanda"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </CardContent>
          </Card>

          {/* Itens */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Itens para Reposição</span>
                <Badge className="bg-blue-100 text-blue-800">
                  {itens.length} item(ns) - {totalItens} unidades
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {itens.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-center">Quantidade</TableHead>
                        <TableHead className="w-12">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map(item => (
                        <TableRow key={item.id} className="hover:bg-slate-50">
                          <TableCell className="font-mono text-sm font-semibold">
                            {item.codigo}
                          </TableCell>
                          <TableCell className="text-sm">{item.descricao}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={item.quantidade}
                              onChange={(e) => atualizarQuantidade(item.id, e.target.value)}
                              className="w-20 text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removerItem(item.id)}
                              className="h-7 w-7"
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-center text-slate-600 py-6">Nenhum item selecionado</p>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={salvarSolicitacao}
            disabled={salvando || itens.length === 0 || !fornecedorId}
            className="bg-green-600 hover:bg-green-700 gap-2"
          >
            {salvando ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Criar como Rascunho'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}