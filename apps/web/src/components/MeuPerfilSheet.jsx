import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '../Layout';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, User, X, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function MeuPerfilSheet({ open, onOpenChange }) {
  const { empresaAtiva, user } = useEmpresa();

  const [perfilForm, setPerfilForm] = useState({});
  const [savingPerfil, setSavingPerfil] = useState(false);
  const [uploadingFotoPerfil, setUploadingFotoPerfil] = useState(false);
  const [buscandoCepPerfil, setBuscandoCepPerfil] = useState(false);
  const [vinculoAtual, setVinculoAtual] = useState(null);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [alterandoSenha, setAlterandoSenha] = useState(false);

  useEffect(() => {
    if (open && empresaAtiva?.id && user?.email) {
      loadPerfil();
    }
  }, [open, empresaAtiva?.id, user?.email]);

  const loadPerfil = async () => {
    const vinculos = await base44.entities.UsuarioEmpresa.filter({
      empresa_id: empresaAtiva.id,
      usuario_email: user.email
    });
    if (vinculos.length > 0) {
      const vinculo = vinculos[0];
      setVinculoAtual(vinculo);
      setPerfilForm({
        nome_completo: vinculo.nome_completo || '',
        telefone: vinculo.telefone || '',
        documento: vinculo.documento || '',
        cep: vinculo.cep || '',
        endereco: vinculo.endereco || '',
        numero: vinculo.numero || '',
        complemento: vinculo.complemento || '',
        bairro: vinculo.bairro || '',
        cidade: vinculo.cidade || '',
        estado: vinculo.estado || '',
        foto_url: vinculo.foto_url || ''
      });
    }
  };

  const handleSavePerfil = async () => {
    if (!vinculoAtual) return;
    setSavingPerfil(true);
    try {
      await base44.entities.UsuarioEmpresa.update(vinculoAtual.id, perfilForm);
      toast.success('✅ Perfil atualizado com sucesso');
    } catch (error) {
      toast.error('❌ Erro ao salvar perfil');
    } finally {
      setSavingPerfil(false);
    }
  };

  const handleUploadFotoPerfil = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFotoPerfil(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPerfilForm(prev => ({ ...prev, foto_url: file_url }));
      toast.success('✅ Foto enviada com sucesso');
    } catch (error) {
      toast.error('❌ Erro ao enviar foto');
    } finally {
      setUploadingFotoPerfil(false);
    }
  };

  const handleBuscarCep = async (cep) => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;
    setBuscandoCepPerfil(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setPerfilForm(prev => ({
          ...prev,
          endereco: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          estado: data.uf || ''
        }));
        toast.success('✅ CEP encontrado');
      } else {
        toast.error('❌ CEP não encontrado');
      }
    } catch {
      toast.error('❌ Erro ao buscar CEP');
    } finally {
      setBuscandoCepPerfil(false);
    }
  };

  const handleAlterarSenha = async () => {
    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      toast.error('❌ Preencha todos os campos');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      toast.error('❌ As senhas não coincidem');
      return;
    }
    if (novaSenha.length < 6) {
      toast.error('❌ A senha deve ter no mínimo 6 caracteres');
      return;
    }
    setAlterandoSenha(true);
    try {
      const response = await base44.functions.invoke('alterarSenha', {
        email: user.email,
        senha_atual: senhaAtual,
        nova_senha: novaSenha
      });
      if (response.data.success) {
        toast.success('✅ Senha alterada com sucesso!');
        setSenhaAtual('');
        setNovaSenha('');
        setConfirmarSenha('');
      } else {
        toast.error('❌ ' + (response.data.error || 'Erro ao alterar senha'));
      }
    } catch {
      toast.error('❌ Erro ao alterar senha');
    } finally {
      setAlterandoSenha(false);
    }
  };

  const estados = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const estadoNomes = { AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins' };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col" style={{ inset: 'auto 0 0 256px', width: 'calc(100% - 256px)', maxWidth: 'none' }}>
        <SheetHeader className="p-6 border-b">
          <SheetTitle>Meu Perfil</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>Informações Pessoais</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Foto */}
              <div>
                <Label>Foto de Perfil</Label>
                <div className="mt-2 flex items-start gap-4">
                  {perfilForm.foto_url ? (
                    <div className="relative">
                      <img src={perfilForm.foto_url} alt="Avatar" className="w-24 h-24 object-cover rounded-full border-4 border-amber-200" />
                      <Button variant="ghost" size="icon" className="absolute -top-1 -right-1 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full" onClick={() => setPerfilForm(p => ({ ...p, foto_url: '' }))}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50">
                      <User className="w-10 h-10 text-slate-300" />
                    </div>
                  )}
                  <label>
                    <Button variant="outline" disabled={uploadingFotoPerfil} asChild>
                      <span className="gap-2"><Plus className="w-4 h-4" />{uploadingFotoPerfil ? 'Enviando...' : 'Upload da Foto'}</span>
                    </Button>
                    <input type="file" className="hidden" accept="image/*" onChange={handleUploadFotoPerfil} disabled={uploadingFotoPerfil} />
                  </label>
                </div>
              </div>

              <div>
                <Label>Nome Completo</Label>
                <Input value={perfilForm.nome_completo || ''} onChange={(e) => setPerfilForm(p => ({ ...p, nome_completo: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={user?.email || ''} disabled className="mt-1.5 bg-slate-50" />
                <p className="text-xs text-slate-500 mt-1">O email não pode ser alterado</p>
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={perfilForm.telefone || ''} onChange={(e) => setPerfilForm(p => ({ ...p, telefone: e.target.value }))} placeholder="(00) 00000-0000" className="mt-1.5" />
              </div>
              <div>
                <Label>CPF/CNPJ</Label>
                <Input value={perfilForm.documento || ''} onChange={(e) => setPerfilForm(p => ({ ...p, documento: e.target.value }))} placeholder="000.000.000-00" className="mt-1.5" />
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium text-slate-700 mb-3">Endereço</h4>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input value={perfilForm.cep || ''} onChange={(e) => { setPerfilForm(p => ({ ...p, cep: e.target.value })); if (e.target.value.replace(/\D/g,'').length === 8) handleBuscarCep(e.target.value); }} placeholder="00000-000" maxLength={9} />
                    <Button variant="outline" onClick={() => handleBuscarCep(perfilForm.cep)} disabled={buscandoCepPerfil}>{buscandoCepPerfil ? 'Buscando...' : 'Buscar'}</Button>
                  </div>
                  <Input value={perfilForm.endereco || ''} onChange={(e) => setPerfilForm(p => ({ ...p, endereco: e.target.value }))} placeholder="Rua/Avenida" />
                  <div className="grid grid-cols-3 gap-3">
                    <Input value={perfilForm.numero || ''} onChange={(e) => setPerfilForm(p => ({ ...p, numero: e.target.value }))} placeholder="Nº" />
                    <Input className="col-span-2" value={perfilForm.complemento || ''} onChange={(e) => setPerfilForm(p => ({ ...p, complemento: e.target.value }))} placeholder="Complemento" />
                  </div>
                  <Input value={perfilForm.bairro || ''} onChange={(e) => setPerfilForm(p => ({ ...p, bairro: e.target.value }))} placeholder="Bairro" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input value={perfilForm.cidade || ''} onChange={(e) => setPerfilForm(p => ({ ...p, cidade: e.target.value }))} placeholder="Cidade" />
                    <Select value={perfilForm.estado || ''} onValueChange={(v) => setPerfilForm(p => ({ ...p, estado: v }))}>
                      <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
                      <SelectContent>{estados.map(uf => <SelectItem key={uf} value={uf}>{estadoNomes[uf]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Button onClick={handleSavePerfil} disabled={savingPerfil} className="bg-amber-500 hover:bg-amber-600 w-full">
                <Save className="w-4 h-4 mr-2" />{savingPerfil ? 'Salvando...' : 'Salvar Informações'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Alterar Senha</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Senha Atual</Label>
                <Input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} placeholder="Digite sua senha atual" className="mt-1.5" />
              </div>
              <div>
                <Label>Nova Senha</Label>
                <Input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Mín. 6 caracteres" className="mt-1.5" />
              </div>
              <div>
                <Label>Confirmar Nova Senha</Label>
                <Input type="password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} placeholder="Confirme a nova senha" className="mt-1.5" />
              </div>
              <Button onClick={handleAlterarSenha} disabled={alterandoSenha} className="bg-amber-500 hover:bg-amber-600 w-full">
                {alterandoSenha ? 'Alterando...' : 'Alterar Senha'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}