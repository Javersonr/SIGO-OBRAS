import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Edit, Trash2, Search, Eye, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function MateriaisTab({
  empresaAtiva,
  materiais,
  categoriasMaterial,
  loadData,
  setShowVisualizarCatalog,
  setCatalogItemId,
  setCatalogItemTipo,
}) {
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [materialForm, setMaterialForm] = useState({
    nome: '',
    categoria: '',
    codigo: '',
    ean: '',
    unidade: 'UN',
    preco: '',
    estoque: '',
    estoque_minimo: '',
    localizacao: '',
    foto_url: '',
    observacoes: '',
  });
  const [uploadingMaterialFoto, setUploadingMaterialFoto] = useState(false);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState([]);
  const [materiaisPage, setMateriaisPage] = useState(1);
  const [buscaMaterial, setBuscaMaterial] = useState('');
  const [filtroCategoriaMaterial, setFiltroCategoriaMaterial] = useState('');
  const [importProgress, setImportProgress] = useState({ show: false, current: 0, total: 0 });
  const [showNovaCatMaterial, setShowNovaCatMaterial] = useState(false);
  const [novaCatMaterial, setNovaCatMaterial] = useState('');

  const fileInputMateriaisRef = React.useRef(null);

  const handleSaveMaterial = async () => {
    if (!materialForm.nome) return;
    try {
      let codigoFinal = materialForm.codigo;

      if (!codigoFinal && !selectedMaterial) {
        const ultimoCodigo = materiais.length > 0 ? Math.max(...materiais.map(m => parseInt(m.codigo) || 0)) : 0;
        codigoFinal = (ultimoCodigo + 1).toString().padStart(6, '0');
      }

      const data = {
        ...materialForm,
        codigo: codigoFinal,
        preco: parseFloat(materialForm.preco) || 0,
        estoque: parseFloat(materialForm.estoque) || 0,
        estoque_minimo: parseFloat(materialForm.estoque_minimo) || 0,
      };

      if (selectedMaterial) {
        await base44.entities.Material.update(selectedMaterial.id, data);
      } else {
        await base44.entities.Material.create({
          empresa_id: empresaAtiva.id,
          ...data,
          ativo: true,
        });
      }
      setShowMaterialModal(false);
      setMaterialForm({
        nome: '',
        categoria: '',
        codigo: '',
        ean: '',
        unidade: 'UN',
        preco: '',
        estoque: '',
        estoque_minimo: '',
        localizacao: '',
        foto_url: '',
        observacoes: '',
      });
      setSelectedMaterial(null);
      loadData();
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao salvar material');
    }
  };

  const handleUploadMaterialFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMaterialFoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setMaterialForm({ ...materialForm, foto_url: file_url });
      toast.success('✅ Foto enviada');
    } catch (error) {
      console.error('Erro:', error);
      toast.error('❌ Erro ao enviar foto');
    } finally {
      setUploadingMaterialFoto(false);
    }
  };

  const handleDeleteMaterial = async (material) => {
    if (!confirm('Desativar este material?')) return;
    await base44.entities.Material.update(material.id, { ativo: false });
    loadData();
  };

  const handleLimparTodosMateriais = async () => {
    if (!confirm('Tem certeza? Isso não pode ser desfeito')) return;
    try {
      const toDelete = materiais.filter(m => m.ativo);
      for (const m of toDelete) {
        await base44.entities.Material.update(m.id, { ativo: false });
      }
      setSelectedMaterialIds([]);
      loadData();
      toast.success('✅ Todos os materiais foram desativados');
    } catch (error) {
      toast.error('❌ Erro ao limpar');
    }
  };

  const handleDeletarSelecionadosMateriais = async () => {
    if (!confirm('Desativar selecionados?')) return;
    try {
      for (const id of selectedMaterialIds) {
        await base44.entities.Material.update(id, { ativo: false });
      }
      setSelectedMaterialIds([]);
      loadData();
      toast.success('✅ Materiais desativados');
    } catch (error) {
      toast.error('❌ Erro ao desativar');
    }
  };

  const handleExportarExcel = () => {
    const dados = materiais.map(m => [
      m.nome || '',
      '',
      m.unidade || '',
      m.codigo || '',
      m.ean || '',
      m.ncm || '',
      m.categoria || '',
      m.preco || 0,
      m.preco_medio || 0,
      m.estoque || 0,
      m.estoque_minimo || 0,
      m.localizacao || '',
      m.observacoes || '',
    ]);

    const headers = [
      'Nome',
      'Descrição',
      'Unidade de Medida',
      'Código Interno',
      'Código de Barras',
      'NCM',
      'Categoria',
      'Preço Referência',
      'Preço Médio',
      'Estoque Atual',
      'Estoque Mínimo',
      'Localização',
      'Observações',
    ];
    const linhas = [headers, ...dados];
    const csv = linhas
      .map(row =>
        row
          .map(cell => {
            const cellStr = String(cell).replace(/"/g, '""');
            return cellStr.includes(';') || cellStr.includes('\n') || cellStr.includes('"')
              ? `"${cellStr}"`
              : cellStr;
          })
          .join(';')
      )
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `materiais_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleBaixarModelo = () => {
    const modelo = [
      [
        'Nome',
        'Descrição',
        'Unidade de Medida',
        'Código Interno',
        'Código de Barras',
        'NCM',
        'Categoria',
        'Preço Referência',
        'Preço Médio',
        'Estoque Atual',
        'Estoque Mínimo',
        'Localização',
        'Observações',
      ],
      [
        'Cimento Portland CP-II saco 50kg',
        '',
        'SC',
        'MAT001',
        '7891234567890',
        '25232900',
        'Cimento',
        '35.5',
        '36',
        '100',
        '20',
        'Prateleira A1',
        '',
      ],
    ];

    const csv = modelo.map(row => row.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'modelo_importacao_materiais.csv';
    link.click();
  };

  const handleImportarMaterial = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportProgress({ show: true, current: 0, total: 0 });

    const isExcel = file.name.match(/\.(xlsx|xls)$/i);

    const processarDados = async (rows) => {
      const materaisImportados = [];
      let linhasIgnoradas = 0;

      const codigosNumericos = materiais
        .map(m => m.codigo || '')
        .filter(c => /^\d+$/.test(c.trim()))
        .map(c => parseInt(c.trim(), 10) || 0);
      let proximoCodigo = codigosNumericos.length > 0 ? Math.max(...codigosNumericos) + 1 : 1;

      const toMoeda = val => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return val;
        let s = val.toString().trim().replace(/R\$\s*/gi, '').replace(/\s/g, '');
        if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
        return parseFloat(s) || 0;
      };

      const toNum = val => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return val;
        return parseFloat(val.toString().replace(',', '.')) || 0;
      };

      for (let i = 0; i < rows.length; i++) {
        try {
          const values = rows[i];
          const nome = (values[0] ?? '').toString().trim();
          if (!nome) {
            linhasIgnoradas++;
            continue;
          }

          const codigoRaw = (values[3] ?? '').toString().trim();
          const codigo = codigoRaw.length > 0 ? codigoRaw : (proximoCodigo++).toString().padStart(6, '0');

          materaisImportados.push({
            empresa_id: empresaAtiva.id,
            nome,
            unidade: (values[2] ?? '').toString().trim() || 'UN',
            codigo,
            ean: (values[4] ?? '').toString().trim(),
            ncm: (values[5] ?? '').toString().trim(),
            categoria: (values[6] ?? '').toString().trim(),
            preco: toMoeda(values[7]),
            preco_medio: toMoeda(values[8]),
            estoque: toNum(values[9]),
            estoque_minimo: toNum(values[10]),
            localizacao: (values[11] ?? '').toString().trim(),
            observacoes: (values[12] ?? '').toString().trim(),
            ativo: true,
          });
        } catch {
          linhasIgnoradas++;
        }
      }

      if (materaisImportados.length === 0) {
        setImportProgress({ show: false, current: 0, total: 0 });
        toast.error('❌ Nenhum material válido encontrado', { duration: 4000 });
        return;
      }

      setImportProgress({ show: true, current: 0, total: materaisImportados.length });

      const BATCH_SIZE = 200;
      let importados = 0;
      for (let i = 0; i < materaisImportados.length; i += BATCH_SIZE) {
        const batch = materaisImportados.slice(i, i + BATCH_SIZE).map(mat => {
          const limpo = { ...mat };
          Object.keys(limpo).forEach(key => {
            if (
              (limpo[key] === '' || limpo[key] === null || limpo[key] === undefined) &&
              key !== 'nome' &&
              key !== 'unidade' &&
              key !== 'empresa_id'
            ) {
              delete limpo[key];
            }
          });
          return limpo;
        });
        await base44.entities.Material.bulkCreate(batch);
        importados += batch.length;
        setImportProgress({ show: true, current: importados, total: materaisImportados.length });
        if (i + BATCH_SIZE < materaisImportados.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setImportProgress({ show: false, current: 0, total: 0 });
      let mensagem = `✅ ${importados} materiais importados!`;
      if (linhasIgnoradas > 0) mensagem += ` (${linhasIgnoradas} vazias ignoradas)`;
      toast.success(mensagem, { duration: 4000 });
      loadData();
    };

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = async event => {
        try {
          let text = event.target.result;
          if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

          const firstLine = text.split(/\r?\n/)[0] || '';
          const totalTabFirst = (firstLine.match(/\t/g) || []).length;
          const totalSemiFirst = (firstLine.match(/;/g) || []).length;
          const totalCommaFirst = (firstLine.match(/,/g) || []).length;
          const sep =
            totalTabFirst > 0 && totalTabFirst >= totalSemiFirst && totalTabFirst >= totalCommaFirst
              ? '\t'
              : totalSemiFirst > 0
                ? ';'
                : ',';

          const parseCSVFull = (rawText, separator) => {
            const rows = [];
            let cur = '';
            let inQ = false;
            for (let i = 0; i < rawText.length; i++) {
              const c = rawText[i];
              const next = rawText[i + 1];
              if (c === '"') {
                if (inQ && next === '"') {
                  cur += '"';
                  i++;
                } else {
                  inQ = !inQ;
                }
              } else if ((c === '\r' && next === '\n') || c === '\n') {
                if (inQ) {
                  cur += '\n';
                  if (c === '\r') i++;
                } else {
                  if (c === '\r') i++;
                  rows.push(cur);
                  cur = '';
                }
              } else {
                cur += c;
              }
            }
            if (cur.trim()) rows.push(cur);

            return rows.map(row => {
              const vals = [];
              let field = '';
              let inQuote = false;
              for (let k = 0; k < row.length; k++) {
                const ch = row[k];
                if (ch === '"') {
                  if (inQuote && row[k + 1] === '"') {
                    field += '"';
                    k++;
                  } else {
                    inQuote = !inQuote;
                  }
                } else if (ch === separator && !inQuote) {
                  vals.push(field.trim());
                  field = '';
                } else {
                  field += ch;
                }
              }
              vals.push(field.trim());
              return vals;
            });
          };

          const allRows = parseCSVFull(text, sep);
          if (allRows.length <= 1) {
            toast.error('❌ Arquivo vazio ou sem dados válidos', { duration: 4000 });
            setImportProgress({ show: false, current: 0, total: 0 });
            return;
          }
          const rows = allRows.slice(1).filter(r => r.some(v => v.trim()));
          await processarDados(rows);
        } catch (error) {
          setImportProgress({ show: false, current: 0, total: 0 });
          toast.error(`❌ Erro ao processar Excel: ${error.message}`, { duration: 6000 });
        }
      };
      reader.readAsText(file, 'UTF-8');
    } else {
      const reader = new FileReader();
      reader.onload = async event => {
        try {
          let text = event.target.result;
          if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

          const firstLine = text.split(/\r?\n/)[0] || '';
          const totalTabFirst = (firstLine.match(/\t/g) || []).length;
          const totalSemiFirst = (firstLine.match(/;/g) || []).length;
          const totalCommaFirst = (firstLine.match(/,/g) || []).length;
          const sep =
            totalTabFirst > 0 && totalTabFirst >= totalSemiFirst && totalTabFirst >= totalCommaFirst
              ? '\t'
              : totalSemiFirst > 0
                ? ';'
                : ',';

          const parseCSVFull = (rawText, separator) => {
            const rows = [];
            let cur = '';
            let inQ = false;
            for (let i = 0; i < rawText.length; i++) {
              const c = rawText[i];
              const next = rawText[i + 1];
              if (c === '"') {
                if (inQ && next === '"') {
                  cur += '"';
                  i++;
                } else {
                  inQ = !inQ;
                }
              } else if ((c === '\r' && next === '\n') || c === '\n') {
                if (inQ) {
                  cur += '\n';
                  if (c === '\r') i++;
                } else {
                  if (c === '\r') i++;
                  rows.push(cur);
                  cur = '';
                }
              } else {
                cur += c;
              }
            }
            if (cur.trim()) rows.push(cur);

            return rows.map(row => {
              const vals = [];
              let field = '';
              let inQuote = false;
              for (let k = 0; k < row.length; k++) {
                const ch = row[k];
                if (ch === '"') {
                  if (inQuote && row[k + 1] === '"') {
                    field += '"';
                    k++;
                  } else {
                    inQuote = !inQuote;
                  }
                } else if (ch === separator && !inQuote) {
                  vals.push(field.trim());
                  field = '';
                } else {
                  field += ch;
                }
              }
              vals.push(field.trim());
              return vals;
            });
          };

          const allRows = parseCSVFull(text, sep);
          if (allRows.length <= 1) {
            toast.error('❌ Arquivo vazio ou sem dados válidos', { duration: 4000 });
            setImportProgress({ show: false, current: 0, total: 0 });
            return;
          }
          const rows = allRows.slice(1).filter(r => r.some(v => v.trim()));
          await processarDados(rows);
        } catch (error) {
          setImportProgress({ show: false, current: 0, total: 0 });
          toast.error(`❌ Erro ao processar: ${error.message}`, { duration: 6000 });
        }
      };
      reader.readAsText(file, 'UTF-8');
    }
    e.target.value = '';
  };

  const handleCriarCategoriaMaterial = async () => {
    if (!novaCatMaterial.trim()) return;
    await base44.entities.CategoriaMaterial.create({
      empresa_id: empresaAtiva.id,
      nome: novaCatMaterial,
      ativo: true,
    });
    setNovaCatMaterial('');
    setShowNovaCatMaterial(false);
    loadData();
  };

  const handleDeleteCategoriaMaterial = async (catId) => {
    if (!confirm('Excluir esta categoria?')) return;
    await base44.entities.CategoriaMaterial.delete(catId);
    loadData();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <CardTitle>Materiais</CardTitle>
          <div className="flex gap-2">
            {selectedMaterialIds.length > 0 && (
              <Button variant="destructive" onClick={handleDeletarSelecionadosMateriais}>
                <Trash2 className="w-4 h-4 mr-2" />
                Apagar {selectedMaterialIds.length} Selecionados
              </Button>
            )}
            <input
              ref={fileInputMateriaisRef}
              type="file"
              className="hidden"
              accept=".csv,.tsv,.xlsx,.xls"
              onChange={handleImportarMaterial}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <FileText className="w-4 h-4 mr-2" />
                  Ações
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleExportarExcel}>
                  <FileText className="w-4 h-4 mr-2" />
                  Exportar em Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleBaixarModelo}>
                  <FileText className="w-4 h-4 mr-2" />
                  Modelo de Importação
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileInputMateriaisRef.current?.click()}>
                  <FileText className="w-4 h-4 mr-2" />
                  Importar Material
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLimparTodosMateriais} className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpar Todos os Registros
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={() => {
                setSelectedMaterial(null);
                setMaterialForm({
                  nome: '',
                  categoria: '',
                  codigo: '',
                  ean: '',
                  unidade: 'UN',
                  preco: '',
                  estoque: '',
                  estoque_minimo: '',
                  localizacao: '',
                  foto_url: '',
                  observacoes: '',
                });
                setShowMaterialModal(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" /> Novo Material
            </Button>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={buscaMaterial}
              onChange={e => setBuscaMaterial(e.target.value)}
              placeholder="Buscar por nome, código ou EAN..."
              className="pl-10"
            />
          </div>
          <Select value={filtroCategoriaMaterial} onValueChange={setFiltroCategoriaMaterial}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Todas as categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todas as categorias</SelectItem>
              {categoriasMaterial.map(c => (
                <SelectItem key={c.id} value={c.nome}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedMaterialIds.length === materiais.length && materiais.length > 0}
                    onCheckedChange={checked => {
                      if (checked) {
                        setSelectedMaterialIds(materiais.map(m => m.id));
                      } else {
                        setSelectedMaterialIds([]);
                      }
                    }}
                  />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Preço Ref.</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materiais
                .filter(m => {
                  const matchBusca =
                    !buscaMaterial ||
                    m.nome?.toLowerCase().includes(buscaMaterial.toLowerCase()) ||
                    m.codigo?.toLowerCase().includes(buscaMaterial.toLowerCase()) ||
                    m.ean?.toLowerCase().includes(buscaMaterial.toLowerCase());
                  const matchCategoria = !filtroCategoriaMaterial || m.categoria === filtroCategoriaMaterial;
                  return matchBusca && matchCategoria;
                })
                .slice((materiaisPage - 1) * 50, materiaisPage * 50)
                .map(m => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedMaterialIds.includes(m.id)}
                        onCheckedChange={checked => {
                          if (checked) {
                            setSelectedMaterialIds([...selectedMaterialIds, m.id]);
                          } else {
                            setSelectedMaterialIds(selectedMaterialIds.filter(id => id !== m.id));
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{m.nome}</TableCell>
                    <TableCell>{m.categoria || '-'}</TableCell>
                    <TableCell>
                      <div className="text-xs">
                        {m.codigo && <div>int: {m.codigo}</div>}
                        {m.ean && <div>EAN: {m.ean}</div>}
                      </div>
                    </TableCell>
                    <TableCell>{m.unidade}</TableCell>
                    <TableCell>R$ {(m.preco || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {m.estoque || 0}
                        {(m.estoque || 0) <= (m.estoque_minimo || 0) && <span className="text-red-500">⚠️</span>}
                      </div>
                    </TableCell>
                    <TableCell>{m.localizacao || '-'}</TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-700">Ativo</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setCatalogItemId(m.id);
                            setCatalogItemTipo('material');
                            setShowVisualizarCatalog(true);
                          }}
                          title="Visualizar imagem"
                        >
                          <Eye className="w-4 h-4 text-blue-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedMaterial(m);
                            setMaterialForm(m);
                            setShowMaterialModal(true);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteMaterial(m)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
        {materiais.length > 50 && (
          <div className="flex justify-between items-center mt-4 pt-4 border-t">
            <p className="text-sm text-slate-600">
              Mostrando {(materiaisPage - 1) * 50 + 1} a {Math.min(materiaisPage * 50, materiais.length)} de{' '}
              {materiais.length} materiais
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={materiaisPage === 1}
                onClick={() => setMateriaisPage(materiaisPage - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={materiaisPage * 50 >= materiais.length}
                onClick={() => setMateriaisPage(materiaisPage + 1)}
              >
                Próximo
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Modal Material */}
      <Sheet open={showMaterialModal} onOpenChange={setShowMaterialModal}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <SheetHeader>
            <SheetTitle>{selectedMaterial ? 'Editar Material' : 'Novo Material'}</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 py-4 px-6 flex-1">
            <div>
              <Label>Nome *</Label>
              <Input
                value={materialForm.nome || ''}
                onChange={e => setMaterialForm({ ...materialForm, nome: e.target.value })}
                placeholder="Nome do material"
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria</Label>
                <div className="flex gap-2 mt-1.5">
                  <Select value={materialForm.categoria || ''} onValueChange={v => setMaterialForm({ ...materialForm, categoria: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriasMaterial.map(c => (
                        <SelectItem key={c.id} value={c.nome}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowNovaCatMaterial(!showNovaCatMaterial)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={materialForm.unidade} onValueChange={v => setMaterialForm({ ...materialForm, unidade: v })}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UN">Unidade</SelectItem>
                    <SelectItem value="PC">Peça</SelectItem>
                    <SelectItem value="KG">Quilograma</SelectItem>
                    <SelectItem value="M">Metro</SelectItem>
                    <SelectItem value="M2">Metro Quadrado</SelectItem>
                    <SelectItem value="M3">Metro Cúbico</SelectItem>
                    <SelectItem value="L">Litro</SelectItem>
                    <SelectItem value="CX">Caixa</SelectItem>
                    <SelectItem value="SC">Saco</SelectItem>
                    <SelectItem value="TN">Tonelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Código Interno</Label>
              <Input
                value={materialForm.codigo || ''}
                onChange={e => setMaterialForm({ ...materialForm, codigo: e.target.value })}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Preço de Referência</Label>
              <Input
                type="number"
                value={materialForm.preco || ''}
                onChange={e => setMaterialForm({ ...materialForm, preco: e.target.value })}
                className="mt-1.5"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <Label>Estoque Atual</Label>
                <Input
                  type="number"
                  value={materialForm.estoque || ''}
                  onChange={e => setMaterialForm({ ...materialForm, estoque: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="flex-1">
                <Label>Estoque Mínimo</Label>
                <Input
                  type="number"
                  value={materialForm.estoque_minimo || ''}
                  onChange={e => setMaterialForm({ ...materialForm, estoque_minimo: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label>Localização</Label>
              <Input
                value={materialForm.localizacao || ''}
                onChange={e => setMaterialForm({ ...materialForm, localizacao: e.target.value })}
                placeholder="Prateleira, Corredor..."
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 p-6 border-t">
            <Button variant="outline" onClick={() => setShowMaterialModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveMaterial} className="bg-amber-500 hover:bg-amber-600">
              Salvar
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}