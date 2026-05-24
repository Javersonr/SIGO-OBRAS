import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Edit, Trash2, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function FornecedoresTab({ empresaAtiva, fornecedores, loadData }) {
  const [showFornecedorModal, setShowFornecedorModal] = useState(false);
  const [selectedFornecedor, setSelectedFornecedor] = useState(null);
  const [fornecedorForm, setFornecedorForm] = useState({
    nome_razao: '', nome_fantasia: '', tipo_pessoa: 'PJ', cnpj: '',
    inscricao_estadual: '', inscricao_municipal: '', contato_nome: '',
    email: '', telefone: '', endereco: '', numero: '', complemento_bairro: '',
    cidade: '', estado: '', cep: '', contato_principal: '', categorias: [], observacoes: ''
  });
  const [selectedFornecedorIds, setSelectedFornecedorIds] = useState([]);
  const [fornecedoresPage, setFornecedoresPage] = useState(1);
  const [importProgress, setImportProgress] = useState({ show: false, current: 0, total: 0 });
  const [searchFornecedor, setSearchFornecedor] = useState('');

  const handleExportarFornecedoresExcel = () => {
    const dados = fornecedores.map(f => [
      f.nome_razao || '', f.nome_fantasia || '', f.tipo_pessoa || 'PJ', f.cnpj || '',
      f.inscricao_estadual || '', f.inscricao_municipal || '', f.email || '', f.telefone || '',
      f.contato_principal || '', f.categorias?.join(', ') || '', f.endereco || '', f.numero || '',
      f.complemento_bairro || '', f.cidade || '', f.estado || '', f.cep || '', f.observacoes || ''
    ]);
    const headers = ['Nome', 'Nome Fantasia', 'Tipo', 'CPF/CNPJ', 'Insc. Estadual', 'Insc. Municipal', 'Email', 'Telefone', 'Contato Principal', 'Categoria', 'Endereço', 'Número', 'Complemento Bairro', 'Cidade', 'Estado', 'CEP', 'Observações'];
    const csv = [headers, ...dados].map(row => row.map(cell => {
      const s = String(cell).replace(/"/g, '""');
      return s.includes(';') || s.includes('\n') || s.includes('"') ? `"${s}"` : s;
    }).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `fornecedores_${new Date().toISOString().split('T')[0]}.csv`; link.click();
  };

  const handleExportarFornecedoresPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF('landscape');
    doc.setFontSize(16); doc.text('Lista de Fornecedores', 14, 15);
    doc.setFontSize(10); doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);
    let y = 30; doc.setFontSize(8);
    doc.text('Nome', 14, y); doc.text('Tipo', 80, y); doc.text('CNPJ', 100, y);
    doc.text('Email', 140, y); doc.text('Telefone', 190, y); doc.text('Cidade', 230, y);
    y += 5; doc.line(14, y, 280, y); y += 5;
    fornecedores.forEach(f => {
      if (y > 190) { doc.addPage(); y = 20; }
      doc.text((f.nome_razao || '').substring(0, 30), 14, y); doc.text(f.tipo_pessoa || '-', 80, y);
      doc.text(f.cnpj || '-', 100, y); doc.text((f.email || '-').substring(0, 25), 140, y);
      doc.text(f.telefone || '-', 190, y); doc.text((f.cidade || '-').substring(0, 20), 230, y);
      y += 6;
    });
    doc.save(`fornecedores_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleBaixarModeloFornecedores = () => {
    const csv = ['Nome;Nome Fantasia;Tipo;CPF/CNPJ;Insc. Estadual;Insc. Municipal;Email;Telefone;Contato Principal;Categoria;Endereço;Número;Complemento Bairro;Cidade;Estado;CEP;Observações', 'EXEMPLO FORNECEDOR;;PJ;;;;;;;;;;;;;;'].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = 'modelo_importacao_fornecedores.csv'; link.click();
  };

  const handleLimparTodosFornecedores = async () => {
    if (!confirm('Tem certeza que deseja excluir TODOS os fornecedores?')) return;
    const todos = await base44.entities.Fornecedor.filter({ empresa_id: empresaAtiva.id });
    for (const f of todos) { await base44.entities.Fornecedor.update(f.id, { ativo: false }); }
    toast.success('✅ Todos os fornecedores foram removidos');
    loadData();
  };

  const handleImportarFornecedores = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportProgress({ show: true, current: 0, total: 0 });
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target.result;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const firstLine = text.split(/\r?\n/)[0] || '';
        const sep = (firstLine.match(/\t/g) || []).length > 0 ? '\t' : (firstLine.includes(';') ? ';' : ',');
        const rows = text.split(/\r?\n/).filter(r => r.trim()).map(r => r.split(sep).map(v => v.trim().replace(/^"|"$/g, '')));
        const data = rows.slice(1).filter(r => r[0]);
        if (!data.length) { toast.error('❌ Nenhum dado válido no arquivo'); setImportProgress({ show: false, current: 0, total: 0 }); return; }
        setImportProgress({ show: true, current: 0, total: data.length });
        const batch = data.map(v => ({
          empresa_id: empresaAtiva.id, nome_razao: v[0], nome_fantasia: v[1] || '', tipo_pessoa: v[2] || 'PJ',
          cnpj: v[3] || '', inscricao_estadual: v[4] || '', inscricao_municipal: v[5] || '',
          email: v[6] || '', telefone: v[7] || '', contato_principal: v[8] || '',
          categorias: v[9] ? v[9].split(',').map(c => c.trim()).filter(Boolean) : [],
          endereco: v[10] || '', numero: v[11] || '', complemento_bairro: v[12] || '',
          cidade: v[13] || '', estado: v[14] || '', cep: v[15] || '',
          observacoes: v[16] || '', ativo: true
        }));
        const BATCH_SIZE = 200; let importados = 0;
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
          await base44.entities.Fornecedor.bulkCreate(batch.slice(i, i + BATCH_SIZE));
          importados += Math.min(BATCH_SIZE, batch.length - i);
          setImportProgress({ show: true, current: importados, total: batch.length });
          if (i + BATCH_SIZE < batch.length) await new Promise(r => setTimeout(r, 300));
        }
        setImportProgress({ show: false, current: 0, total: 0 });
        toast.success(`✅ ${importados} fornecedores importados!`);
        loadData();
      } catch (err) {
        setImportProgress({ show: false, current: 0, total: 0 });
        toast.error('❌ Erro: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleSaveFornecedor = async () => {
    if (!fornecedorForm.nome_razao) return;
    try {
      if (selectedFornecedor) {
        await base44.entities.Fornecedor.update(selectedFornecedor.id, fornecedorForm);
      } else {
        await base44.entities.Fornecedor.create({ empresa_id: empresaAtiva.id, ...fornecedorForm, ativo: true });
      }
      setShowFornecedorModal(false);
      setFornecedorForm({ nome_razao: '', nome_fantasia: '', tipo_pessoa: 'PJ', cnpj: '', inscricao_estadual: '', inscricao_municipal: '', contato_nome: '', email: '', telefone: '', endereco: '', numero: '', complemento_bairro: '', cidade: '', estado: '', cep: '', contato_principal: '', categorias: [], observacoes: '' });
      setSelectedFornecedor(null);
      loadData();
    } catch (error) { console.error('Erro:', error); }
  };

  const handleDeleteFornecedor = async (f) => {
    if (!confirm('Desativar este fornecedor?')) return;
    await base44.entities.Fornecedor.update(f.id, { ativo: false });
    loadData();
  };

  const handleDeletarSelecionados = async () => {
    if (!confirm('Desativar selecionados?')) return;
    for (const id of selectedFornecedorIds) {
      await base44.entities.Fornecedor.update(id, { ativo: false });
    }
    setSelectedFornecedorIds([]);
    loadData();
  };

  return (
    <>
      {importProgress.show && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Importando Fornecedores...</h3>
            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${importProgress.total ? (importProgress.current / importProgress.total) * 100 : 0}%` }} />
            </div>
            <p className="text-sm text-slate-600 text-center mt-2">{importProgress.current} de {importProgress.total}</p>
          </div>
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Fornecedores</CardTitle>
          <div className="flex gap-2">
            {selectedFornecedorIds.length > 0 && (
              <Button variant="destructive" onClick={handleDeletarSelecionados}>
                <Trash2 className="w-4 h-4 mr-2" />Apagar {selectedFornecedorIds.length} Selecionados
              </Button>
            )}
            <input id="fileInputFornecedores" type="file" className="hidden" accept=".csv" onChange={handleImportarFornecedores} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><FileText className="w-4 h-4 mr-2" />Ações</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleExportarFornecedoresExcel}><FileText className="w-4 h-4 mr-2" />Exportar em Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportarFornecedoresPDF}><FileText className="w-4 h-4 mr-2" />Exportar em PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={handleBaixarModeloFornecedores}><FileText className="w-4 h-4 mr-2" />Modelo de Importação</DropdownMenuItem>
                <DropdownMenuItem onClick={() => document.getElementById('fileInputFornecedores')?.click()}><FileText className="w-4 h-4 mr-2" />Importar Fornecedores</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLimparTodosFornecedores} className="text-red-600"><Trash2 className="w-4 h-4 mr-2" />Limpar Todos os Registros</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => { setSelectedFornecedor(null); setFornecedorForm({ nome_razao: '', nome_fantasia: '', tipo_pessoa: 'PJ', cnpj: '', inscricao_estadual: '', inscricao_municipal: '', contato_nome: '', email: '', telefone: '', endereco: '', numero: '', complemento_bairro: '', cidade: '', estado: '', cep: '', contato_principal: '', categorias: [], observacoes: '' }); setShowFornecedorModal(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Novo Fornecedor
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Buscar por nome, email ou telefone..."
              value={searchFornecedor}
              onChange={(e) => {
                setSearchFornecedor(e.target.value);
                setFornecedoresPage(1);
              }}
              className="w-full md:w-96"
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedFornecedorIds.length === fornecedores.length && fornecedores.length > 0}
                      onCheckedChange={checked => { if (checked) setSelectedFornecedorIds(fornecedores.map(f => f.id)); else setSelectedFornecedorIds([]); }}
                    />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fornecedores
                  .filter(f =>
                    searchFornecedor === '' ||
                    f.nome_razao?.toLowerCase().includes(searchFornecedor.toLowerCase()) ||
                    f.nome_fantasia?.toLowerCase().includes(searchFornecedor.toLowerCase()) ||
                    f.email?.toLowerCase().includes(searchFornecedor.toLowerCase()) ||
                    f.telefone?.includes(searchFornecedor) ||
                    f.cnpj?.includes(searchFornecedor)
                  )
                  .slice((fornecedoresPage - 1) * 50, fornecedoresPage * 50)
                  .map(f => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedFornecedorIds.includes(f.id)}
                        onCheckedChange={checked => { if (checked) setSelectedFornecedorIds([...selectedFornecedorIds, f.id]); else setSelectedFornecedorIds(selectedFornecedorIds.filter(id => id !== f.id)); }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{f.nome_razao}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{f.tipo_pessoa || 'PJ'}</Badge></TableCell>
                    <TableCell>{f.cnpj || '-'}</TableCell>
                    <TableCell className="text-sm">{f.email || '-'}</TableCell>
                    <TableCell className="text-sm">{f.telefone || '-'}</TableCell>
                    <TableCell>{f.cidade || '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedFornecedor(f); setFornecedorForm(f); setShowFornecedorModal(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteFornecedor(f)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {fornecedores.filter(f =>
            searchFornecedor === '' ||
            f.nome_razao?.toLowerCase().includes(searchFornecedor.toLowerCase()) ||
            f.nome_fantasia?.toLowerCase().includes(searchFornecedor.toLowerCase()) ||
            f.email?.toLowerCase().includes(searchFornecedor.toLowerCase()) ||
            f.telefone?.includes(searchFornecedor) ||
            f.cnpj?.includes(searchFornecedor)
          ).length > 50 && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <p className="text-sm text-slate-600">Mostrando {(fornecedoresPage - 1) * 50 + 1} a {Math.min(fornecedoresPage * 50, fornecedores.filter(f => searchFornecedor === '' || f.nome_razao?.toLowerCase().includes(searchFornecedor.toLowerCase()) || f.nome_fantasia?.toLowerCase().includes(searchFornecedor.toLowerCase()) || f.email?.toLowerCase().includes(searchFornecedor.toLowerCase()) || f.telefone?.includes(searchFornecedor) || f.cnpj?.includes(searchFornecedor)).length)} de {fornecedores.filter(f => searchFornecedor === '' || f.nome_razao?.toLowerCase().includes(searchFornecedor.toLowerCase()) || f.nome_fantasia?.toLowerCase().includes(searchFornecedor.toLowerCase()) || f.email?.toLowerCase().includes(searchFornecedor.toLowerCase()) || f.telefone?.includes(searchFornecedor) || f.cnpj?.includes(searchFornecedor)).length}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={fornecedoresPage === 1} onClick={() => setFornecedoresPage(fornecedoresPage - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={fornecedoresPage * 50 >= fornecedores.length} onClick={() => setFornecedoresPage(fornecedoresPage + 1)}>Próximo</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Fornecedor */}
      <Sheet open={showFornecedorModal} onOpenChange={setShowFornecedorModal}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <SheetHeader>
            <SheetTitle>{selectedFornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4 px-6 flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome/Razão Social *</Label>
                <Input value={fornecedorForm.nome_razao || ''} onChange={e => setFornecedorForm({ ...fornecedorForm, nome_razao: e.target.value })} placeholder="Nome completo ou razão social" className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label>Nome Fantasia</Label>
                <Input value={fornecedorForm.nome_fantasia || ''} onChange={e => setFornecedorForm({ ...fornecedorForm, nome_fantasia: e.target.value })} placeholder="Nome fantasia" className="mt-1.5" />
              </div>
              <div>
                <Label>Tipo *</Label>
                <Select value={fornecedorForm.tipo_pessoa || 'PJ'} onValueChange={v => setFornecedorForm({ ...fornecedorForm, tipo_pessoa: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>CPF/CNPJ</Label>
                <Input value={fornecedorForm.cnpj || ''} onChange={e => setFornecedorForm({ ...fornecedorForm, cnpj: e.target.value })} placeholder={fornecedorForm.tipo_pessoa === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'} className="mt-1.5" />
              </div>
            </div>
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Contato</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Contato Principal</Label>
                  <Input value={fornecedorForm.contato_principal || ''} onChange={e => setFornecedorForm({ ...fornecedorForm, contato_principal: e.target.value })} placeholder="Nome da pessoa de contato" className="mt-1.5" />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input type="email" value={fornecedorForm.email || ''} onChange={e => setFornecedorForm({ ...fornecedorForm, email: e.target.value })} placeholder="email@exemplo.com" className="mt-1.5" />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={fornecedorForm.telefone || ''} onChange={e => setFornecedorForm({ ...fornecedorForm, telefone: e.target.value })} placeholder="(00) 00000-0000" className="mt-1.5" />
                </div>
              </div>
            </div>
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Categorias</h4>
              <Input value={fornecedorForm.categorias?.join(', ') || ''} onChange={e => setFornecedorForm({ ...fornecedorForm, categorias: e.target.value.split(',').map(c => c.trim()).filter(Boolean) })} placeholder="Ex: Elétrica, Hidráulica" className="mt-1.5" />
            </div>
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Endereço</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div><Label>CEP</Label><Input value={fornecedorForm.cep || ''} onChange={e => setFornecedorForm({ ...fornecedorForm, cep: e.target.value })} placeholder="00000-000" className="mt-1.5" /></div>
                  <div className="col-span-2"><Label>Endereço</Label><Input value={fornecedorForm.endereco || ''} onChange={e => setFornecedorForm({ ...fornecedorForm, endereco: e.target.value })} placeholder="Rua, Avenida..." className="mt-1.5" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Cidade</Label><Input value={fornecedorForm.cidade || ''} onChange={e => setFornecedorForm({ ...fornecedorForm, cidade: e.target.value })} placeholder="São Paulo" className="mt-1.5" /></div>
                  <div><Label>Estado</Label><Input value={fornecedorForm.estado || ''} onChange={e => setFornecedorForm({ ...fornecedorForm, estado: e.target.value })} placeholder="SP" maxLength={2} className="mt-1.5" /></div>
                </div>
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={fornecedorForm.observacoes || ''} onChange={e => setFornecedorForm({ ...fornecedorForm, observacoes: e.target.value })} placeholder="Informações adicionais..." className="mt-1.5" rows={3} />
            </div>
          </div>
          <div className="flex justify-end gap-3 p-6 border-t">
            <Button variant="outline" onClick={() => setShowFornecedorModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveFornecedor} className="bg-amber-500 hover:bg-amber-600">Salvar</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}