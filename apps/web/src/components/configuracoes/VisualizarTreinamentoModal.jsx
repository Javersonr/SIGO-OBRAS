import React from 'react';
import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';

const parseInstrutor = (valor) => {
  if (!valor) return null;
  if (typeof valor === 'object') {
    if (Array.isArray(valor)) return valor[0]?.nome || null;
    return valor.nome || null;
  }
  if (typeof valor === 'string') {
    try {
      const parsed = JSON.parse(valor);
      if (Array.isArray(parsed)) return parsed[0]?.nome || null;
      if (typeof parsed === 'object') return parsed.nome || null;
    } catch {}
    // string pura
    return valor;
  }
  return null;
};

const parseInstrutorCpf = (valor) => {
  if (!valor) return null;
  if (typeof valor === 'object') {
    if (Array.isArray(valor)) return valor[0]?.cpf || null;
    return valor.cpf || null;
  }
  if (typeof valor === 'string') {
    try {
      const parsed = JSON.parse(valor);
      if (Array.isArray(parsed)) return parsed[0]?.cpf || null;
      if (typeof parsed === 'object') return parsed.cpf || null;
    } catch {}
  }
  return null;
};

export default function VisualizarTreinamentoModal({ open, onClose, treinamento }) {
  const [dados, setDados] = useState(treinamento);
  const [loading, setLoading] = useState(false);

  const recarregarDados = async () => {
    if (!treinamento?.id) return;
    setLoading(true);
    try {
      const treinamentos = await base44.entities.Treinamento.filter({ id: treinamento.id });
      if (treinamentos.length > 0) {
        setDados(treinamentos[0]);
      }
    } catch (err) {
      console.error('Erro ao recarregar treinamento:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && treinamento?.id) {
      recarregarDados();
    }
  }, [open, treinamento?.id]);

  if (!dados) return null;

  const instrutorNome = parseInstrutor(dados.instrutor_nome);
  const instrutorCpf = parseInstrutorCpf(dados.instrutor_nome) || dados.instrutor_cpf;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col" style={{ inset: 'auto 0 0 256px', width: 'calc(100% - 256px)', maxWidth: 'none' }}>
        <SheetHeader className="p-6 border-b space-y-3">
           <div className="flex items-center justify-between">
             <SheetTitle>Detalhes do Treinamento</SheetTitle>
             <Button
               size="sm"
               variant="outline"
               onClick={recarregarDados}
               disabled={loading}
               className="gap-2">
               {loading ? '⟳ Recarregando...' : '⟳ Recarregar'}
             </Button>
           </div>
         </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Informações Básicas */}
          <div className="space-y-4">
            <div>
              <Label className="text-slate-500 text-xs">Nome do Treinamento</Label>
               <p className="text-lg font-semibold text-slate-800 mt-1">{dados.nome}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {dados.codigo && (
                <div>
                  <Label className="text-slate-500 text-xs">Código</Label>
                  <p className="text-slate-800 mt-1">{dados.codigo}</p>
                </div>
              )}
              {dados.carga_horaria && (
                <div>
                  <Label className="text-slate-500 text-xs">Carga Horária</Label>
                  <p className="text-slate-800 mt-1">{dados.carga_horaria} horas</p>
                </div>
              )}
            </div>

            {dados.conteudo_programatico && (
               <div>
                 <Label className="text-slate-500 text-xs">Conteúdo Programático</Label>
                 <div className="text-slate-700 mt-1 whitespace-pre-wrap bg-slate-50 p-4 rounded border border-slate-200 max-h-96 overflow-y-auto">{dados.conteudo_programatico}</div>
               </div>
             )}
          </div>

          {/* Instrutor */}
          {(instrutorNome || instrutorCpf) && (
            <div className="border-t pt-6 space-y-4">
              <h4 className="font-semibold text-slate-800">Instrutor</h4>
              <div className="grid grid-cols-2 gap-4">
                {instrutorNome && (
                  <div>
                    <Label className="text-slate-500 text-xs">Nome</Label>
                    <p className="text-slate-800 mt-1">{instrutorNome}</p>
                  </div>
                )}
                {instrutorCpf && (
                  <div>
                    <Label className="text-slate-500 text-xs">CPF</Label>
                    <p className="text-slate-800 mt-1">{instrutorCpf}</p>
                  </div>
                )}
              </div>
              {dados.instrutor_assinatura_url && (
                <div>
                  <Label className="text-slate-500 text-xs">Assinatura</Label>
                  <img src={dados.instrutor_assinatura_url} alt="Assinatura" className="mt-2 max-w-xs border rounded" />
                </div>
              )}
            </div>
          )}

          {/* Engenheiro Responsável */}
          {(dados.engenheiro_responsavel_nome || dados.engenheiro_responsavel_crea) && (
            <div className="border-t pt-6 space-y-4">
              <h4 className="font-semibold text-slate-800">Engenheiro Responsável</h4>
              <div className="grid grid-cols-2 gap-4">
                {dados.engenheiro_responsavel_nome && (
                  <div>
                    <Label className="text-slate-500 text-xs">Nome</Label>
                    <p className="text-slate-800 mt-1">{dados.engenheiro_responsavel_nome}</p>
                  </div>
                )}
                {dados.engenheiro_responsavel_crea && (
                  <div>
                    <Label className="text-slate-500 text-xs">CREA</Label>
                    <p className="text-slate-800 mt-1">{dados.engenheiro_responsavel_crea}</p>
                  </div>
                )}
              </div>
              {dados.engenheiro_responsavel_assinatura_url && (
                <div>
                  <Label className="text-slate-500 text-xs">Assinatura</Label>
                  <img src={dados.engenheiro_responsavel_assinatura_url} alt="Assinatura" className="mt-2 max-w-xs border rounded" />
                </div>
              )}
            </div>
          )}

          {/* Informações Adicionais */}
          <div className="border-t pt-6 space-y-4">
            <h4 className="font-semibold text-slate-800">Informações Adicionais</h4>
            <div className="grid grid-cols-2 gap-4">
              {dados.data_inicio && (
                <div>
                  <Label className="text-slate-500 text-xs">Data de Início</Label>
                  <p className="text-slate-800 mt-1">
                    {format(new Date(dados.data_inicio), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
              )}
              {dados.data_fim && (
                <div>
                  <Label className="text-slate-500 text-xs">Data de Término</Label>
                  <p className="text-slate-800 mt-1">
                    {format(new Date(dados.data_fim), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
              )}
              {dados.local && (
                <div className="col-span-2">
                  <Label className="text-slate-500 text-xs">Local</Label>
                  <p className="text-slate-800 mt-1">{dados.local}</p>
                </div>
              )}
              {dados.aproveitamento && (
                <div>
                  <Label className="text-slate-500 text-xs">Aproveitamento</Label>
                  <p className="text-slate-800 mt-1">{dados.aproveitamento}%</p>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              {dados.obrigatorio && (
                <Badge className="bg-red-100 text-red-700">Obrigatório</Badge>
              )}
              {dados.usar_como_modelo && (
                <Badge className="bg-blue-100 text-blue-700">Modelo</Badge>
              )}
              {dados.ativo ? (
                <Badge className="bg-green-100 text-green-700">Ativo</Badge>
              ) : (
                <Badge variant="outline">Inativo</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t">
          <Button variant="outline" onClick={onClose} className="w-full">
            Fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}