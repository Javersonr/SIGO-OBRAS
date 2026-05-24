import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Mail, Copy, Calendar, Eye, Send, CheckCircle2, DollarSign } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ClienteViewModal({ 
  open, 
  onOpenChange, 
  oportunidade,
  empresaAtiva 
}) {
  const [emailCliente, setEmailCliente] = useState('');
  const [abasLiberadas, setAbasLiberadas] = useState({
    orcamento: true,
    obra: true
  });
  const [enviando, setEnviando] = useState(false);
  const [linkGerado, setLinkGerado] = useState('');
  const [enviado, setEnviado] = useState(false);

  const handleGerarLink = async () => {
    if (!emailCliente || !oportunidade) return;
    
    setEnviando(true);
    try {
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      const expiraEm = new Date();
      expiraEm.setDate(expiraEm.getDate() + 30);
      
      await base44.entities.TokenClienteOportunidade.create({
        empresa_id: empresaAtiva.id,
        oportunidade_id: oportunidade.id,
        token: token,
        email_cliente: emailCliente,
        expira_em: expiraEm.toISOString().split('T')[0],
        abas_liberadas: JSON.stringify(abasLiberadas),
        ativo: true
      });
      
      const linkCompleto = `${window.location.origin}${window.location.pathname}#/ClientePortal?token=${token}`;
      setLinkGerado(linkCompleto);
    } catch (error) {
      console.error('Erro ao gerar link:', error);
      alert('Erro ao gerar link');
    } finally {
      setEnviando(false);
    }
  };

  const handleEnviarEmail = async () => {
    if (!linkGerado || !emailCliente) return;
    
    setEnviando(true);
    try {
      await base44.integrations.Core.SendEmail({
        to: emailCliente,
        subject: `Acompanhe seu projeto: ${oportunidade.nome || oportunidade.titulo}`,
        body: `
          <h2>Olá!</h2>
          <p>Você foi convidado a acompanhar o andamento do projeto <strong>${oportunidade.nome || oportunidade.titulo}</strong>.</p>
          <p>Clique no link abaixo para visualizar o orçamento e cronograma da obra:</p>
          <p><a href="${linkGerado}" style="display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">Acessar Projeto</a></p>
          <p style="color: #666; font-size: 12px;">Este link expira em 30 dias.</p>
          <br>
          <p>Atenciosamente,<br>${empresaAtiva.nome}</p>
        `
      });
      
      setEnviado(true);
      setTimeout(() => {
        setEnviado(false);
        onOpenChange(false);
        setLinkGerado('');
        setEmailCliente('');
      }, 2000);
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      alert('Erro ao enviar email');
    } finally {
      setEnviando(false);
    }
  };

  const handleCopiarLink = () => {
    navigator.clipboard.writeText(linkGerado);
    alert('Link copiado!');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-3/4 sm:max-w-sm lg:left-64 lg:w-[calc(100%-256px)] h-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Compartilhar com Cliente</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 py-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              Gere um link seguro para que o cliente possa acompanhar o orçamento e cronograma da obra em tempo real.
            </p>
          </div>

          {!linkGerado ? (
            <>
              <div>
                <Label>Email do Cliente *</Label>
                <Input
                  type="email"
                  value={emailCliente}
                  onChange={(e) => setEmailCliente(e.target.value)}
                  placeholder="cliente@exemplo.com"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="mb-3 block">Informações Liberadas</Label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                        <DollarSign className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">Orçamento</p>
                        <p className="text-xs text-slate-500">Itens, valores e totais</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={abasLiberadas.orcamento}
                      onChange={(e) => setAbasLiberadas({ ...abasLiberadas, orcamento: e.target.checked })}
                      className="w-4 h-4 text-teal-600 rounded border-slate-300"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">Cronograma da Obra</p>
                        <p className="text-xs text-slate-500">Etapas e prazos</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={abasLiberadas.obra}
                      onChange={(e) => setAbasLiberadas({ ...abasLiberadas, obra: e.target.checked })}
                      className="w-4 h-4 text-teal-600 rounded border-slate-300"
                    />
                  </div>
                </div>
              </div>

              <Button 
                onClick={handleGerarLink}
                disabled={enviando || !emailCliente}
                className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
              >
                <Eye className="w-4 h-4" />
                {enviando ? 'Gerando...' : 'Gerar Link de Acesso'}
              </Button>
            </>
          ) : (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <p className="font-medium text-green-800">Link gerado com sucesso!</p>
                </div>
                <p className="text-sm text-green-700">
                  Válido até {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}
                </p>
              </div>

              <div>
                <Label>Link de Acesso</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    value={linkGerado}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button onClick={handleCopiarLink} variant="outline" size="icon">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {!enviado ? (
                <Button 
                  onClick={handleEnviarEmail}
                  disabled={enviando}
                  className="w-full bg-green-600 hover:bg-green-700 gap-2"
                >
                  <Send className="w-4 h-4" />
                  {enviando ? 'Enviando...' : `Enviar por Email para ${emailCliente}`}
                </Button>
              ) : (
                <div className="bg-green-100 border border-green-300 rounded-lg p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-green-600 mb-2" />
                  <p className="font-medium text-green-800">Email enviado com sucesso!</p>
                </div>
              )}

              <Button 
                variant="outline"
                onClick={() => {
                  setLinkGerado('');
                  setEmailCliente('');
                }}
                className="w-full"
              >
                Gerar Novo Link
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}