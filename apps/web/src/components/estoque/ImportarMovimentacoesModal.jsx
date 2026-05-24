import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Upload, FileText, AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ImportarMovimentacoesModal({ open, onOpenChange, empresaAtiva, materiais, almoxarifados, projetos, user, onSave }) {
  const [tipo, setTipo] = useState('Entrada');
  const [preview, setPreview] = useState([]);
  const [erros, setErros] = useState([]);
  const [importing, setImporting] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const fileRef = useRef();

  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  const baixarModelo = () => {
    const dados = [
      ['Código Material', 'Descrição Material', 'Almoxarifado', 'Quantidade', 'Valor Unitário', 'Projeto (opcional)', 'Observações (opcional)'],
      ['MAT-001', 'Cimento CP II 50kg', 'Almoxarifado Central', 10, 45.00, 'Projeto A', ''],
      ['MAT-002', 'Areia Grossa m³', 'Almoxarifado Central', 5, 120.00, '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 25 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    XLSX.writeFile(wb, `modelo_importacao_${tipo.toLowerCase()}.xlsx`);
  };

  const exportarInventario = () => {
    const dados = [['Código', 'Descrição', 'Almoxarifado', 'Qtd Atual', 'Unidade', 'Estoque Mínimo', 'Status']];
    materiais.forEach(mat => {
      almoxarifados.forEach(almox => {
        dados.push([mat.codigo || '', mat.nome || mat.descricao, almox.nome, 0, mat.unidade, mat.estoque_minimo || 0, 'OK']);
      });
    });
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
    XLSX.writeFile(wb, 'inventario_materiais.xlsx');
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) { setPreview([]); setErros(['Arquivo vazio ou sem dados']); return; }

      const errosEncontrados = [];
      const linhas = rows.slice(1)
        .filter(r => r.some(c => c !== '' && c !== null && c !== undefined))
        .filter(r => {
          const codigoVal = String(r[0] || '').trim();
          const descricaoVal = String(r[1] || '').trim();
          const almoxVal = String(r[2] || '').trim();
          const qtdVal = r[3];
          return (codigoVal || descricaoVal) && almoxVal && qtdVal !== '' && qtdVal !== null && qtdVal !== undefined && !isNaN(Number(qtdVal));
        })
        .map((row, idx) => {
          const [codigo, descricao, almoxNome, qtd, valorUnit, projNome, obs] = row;
          const codigoStr = String(codigo || '').trim();
          const descricaoStr = String(descricao || '').trim();

          let material = codigoStr ? materiais.find(m => m.codigo === codigoStr) : null;
          if (!material && descricaoStr) {
            material = materiais.find(m => (m.nome || m.descricao || '').toLowerCase() === descricaoStr.toLowerCase());
          }

          const almox = almoxarifados.find(a => a.nome?.toLowerCase() === String(almoxNome).trim().toLowerCase());
          const proj = projNome ? projetos.find(p => p.nome?.toLowerCase() === String(projNome).trim().toLowerCase()) : null;

          if (!almox) errosEncontrados.push(`Linha ${idx + 2}: Almoxarifado "${almoxNome}" não encontrado`);
          if (!qtd || isNaN(Number(qtd)) || Number(qtd) <= 0) errosEncontrados.push(`Linha ${idx + 2}: Quantidade inválida`);
          if (!codigoStr && !descricaoStr) errosEncontrados.push(`Linha ${idx + 2}: Código ou Descrição obrigatório`);

          return {
            material_id: material?.id || null,
            material_descricao: material?.nome || material?.descricao || descricaoStr,
            material_codigo: material?.codigo || codigoStr,
            material_unidade: material?.unidade || 'UN',
            criar_material: !material && (codigoStr || descricaoStr) && !!almox && Number(qtd) > 0,
            almoxarifado_id: almox?.id,
            almoxarifado_nome: almox?.nome || almoxNome,
            quantidade: Number(qtd) || 0,
            valor_unitario: Number(valorUnit) || 0,
            projeto_id: proj?.id || null,
            projeto_nome: proj?.nome || projNome || null,
            observacoes: obs || '',
            valido: !!almox && Number(qtd) > 0 && (!!material || (codigoStr || descricaoStr)),
          };
        });

      setPreview(linhas);
      setErros(errosEncontrados);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleImportar = async () => {
    const validos = preview.filter(l => l.valido);
    if (!validos.length) return;
    setImporting(true);
    setProgresso(0);
    try {
      for (let i = 0; i < validos.length; i++) {
        const item = validos[i];

        // Delay a cada 5 itens para evitar rate limit
        if (i > 0 && i % 5 === 0) await sleep(1000);

        // Criar material se não existir
        if (item.criar_material) {
          const novoMaterial = await base44.entities.Material.create({
            empresa_id: empresaAtiva.id,
            codigo: item.material_codigo || undefined,
            nome: item.material_descricao,
            descricao: item.material_descricao,
            unidade: item.material_unidade || 'UN',
            ativo: true,
          });
          item.material_id = novoMaterial.id;
          item.material_codigo = novoMaterial.codigo || item.material_codigo;
        }

        const saldos = await base44.entities.EstoqueSaldo.filter({
          empresa_id: empresaAtiva.id,
          material_id: item.material_id,
          almoxarifado_id: item.almoxarifado_id,
        });
        const saldoExistente = saldos[0] || null;

        const movimento = {
          empresa_id: empresaAtiva.id,
          material_id: item.material_id,
          material_descricao: item.material_descricao,
          almoxarifado_id: item.almoxarifado_id,
          almoxarifado_nome: item.almoxarifado_nome,
          tipo,
          quantidade: item.quantidade,
          valor_unitario: item.valor_unitario,
          valor_total: item.quantidade * item.valor_unitario,
          data_movimento: new Date().toISOString().split('T')[0],
          projeto_id: item.projeto_id || null,
          projeto_nome: item.projeto_nome || null,
          referencia_tipo: 'Importação',
          usuario_nome: user?.full_name,
          observacoes: item.observacoes,
        };

        await base44.entities.EstoqueMovimento.create(movimento);
        await sleep(200);

        if (saldoExistente) {
          const novaQtd = tipo === 'Entrada' || tipo === 'Ajuste'
            ? saldoExistente.quantidade + item.quantidade
            : Math.max(0, saldoExistente.quantidade - item.quantidade);
          await base44.entities.EstoqueSaldo.update(saldoExistente.id, { quantidade: novaQtd });
        } else {
          await base44.entities.EstoqueSaldo.create({
            empresa_id: empresaAtiva.id,
            material_id: item.material_id,
            material_codigo: item.material_codigo,
            material_descricao: item.material_descricao,
            almoxarifado_id: item.almoxarifado_id,
            almoxarifado_nome: item.almoxarifado_nome,
            quantidade: item.quantidade,
            valor_medio: item.valor_unitario,
            estoque_minimo: 0,
            unidade: materiais.find(m => m.id === item.material_id)?.unidade || 'UN',
          });
        }

        setProgresso(Math.round(((i + 1) / validos.length) * 100));
        await sleep(200);
      }
      onSave();
      onOpenChange(false);
      setPreview([]);
      setErros([]);
      setProgresso(0);
    } catch (err) {
      console.error('Erro ao importar:', err);
      alert('Erro ao importar: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setPreview([]); setErros([]); setProgresso(0); } }}>
      <SheetContent side="right" className="w-full h-full flex flex-col !p-0" data-fullscreen-modal>
        <div className="sticky top-0 bg-white border-b px-6 py-4 z-10 flex items-center justify-between flex-shrink-0">
          <SheetTitle>Importar / Exportar Movimentações</SheetTitle>
          <button onClick={() => onOpenChange(false)} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4 max-w-4xl mx-auto">

            {/* Exportar */}
            <div className="border rounded-lg p-4 space-y-2">
              <p className="font-medium text-sm text-slate-700">Exportar / Modelos</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={baixarModelo} className="gap-2">
                  <Download className="w-4 h-4" /> Baixar Modelo de Importação
                </Button>
                <Button variant="outline" size="sm" onClick={exportarInventario} className="gap-2 text-blue-600 border-blue-300">
                  <FileText className="w-4 h-4" /> Exportar Inventário de Materiais
                </Button>
              </div>
            </div>

            {/* Importar */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm text-slate-700">Importar Lote</p>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Label className="text-xs">Tipo de Movimento</Label>
                  <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Entrada">Entrada</SelectItem>
                      <SelectItem value="Saída">Saída</SelectItem>
                      <SelectItem value="Ajuste">Ajuste</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4" /> Selecionar Arquivo Excel
                </Button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              </div>

              {erros.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                  {erros.map((e, i) => (
                    <p key={i} className="text-xs text-red-600 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {e}
                    </p>
                  ))}
                </div>
              )}

              {importing && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Importando...</span>
                    <span>{progresso}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progresso}%` }}
                    />
                  </div>
                </div>
              )}

              {preview.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-600">{preview.filter(l => l.valido).length} de {preview.length} linhas válidas</p>
                    <div className="flex gap-2">
                      <Badge className="bg-green-100 text-green-700">{preview.filter(l => l.valido).length} OK</Badge>
                      {preview.filter(l => !l.valido).length > 0 && (
                        <Badge className="bg-red-100 text-red-700">{preview.filter(l => !l.valido).length} Erro</Badge>
                      )}
                    </div>
                  </div>
                  <div className="border rounded overflow-auto" style={{ maxHeight: 'calc(100vh - 420px)' }}>
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1 text-left"></th>
                          <th className="px-2 py-1 text-left">Material</th>
                          <th className="px-2 py-1 text-left">Almoxarifado</th>
                          <th className="px-2 py-1 text-right">Qtd</th>
                          <th className="px-2 py-1 text-right">Valor Unit.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((l, i) => (
                          <tr key={i} className={l.valido ? '' : 'bg-red-50'}>
                            <td className="px-2 py-1">
                              {l.valido
                                ? l.criar_material
                                  ? <span title="Novo material será criado"><CheckCircle2 className="w-3 h-3 text-blue-500" /></span>
                                  : <CheckCircle2 className="w-3 h-3 text-green-500" />
                                : <AlertTriangle className="w-3 h-3 text-red-500" />}
                            </td>
                            <td className="px-2 py-1">{l.material_descricao}</td>
                            <td className="px-2 py-1">{l.almoxarifado_nome}</td>
                            <td className="px-2 py-1 text-right">{l.quantidade}</td>
                            <td className="px-2 py-1 text-right">{l.valor_unitario?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => { setPreview([]); setErros([]); }} disabled={importing}>Limpar</Button>
                    <Button
                      onClick={handleImportar}
                      disabled={importing || !preview.some(l => l.valido)}
                      className="bg-amber-500 hover:bg-amber-600 gap-2"
                    >
                      {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                      {importing ? `Importando... ${progresso}%` : `Importar ${preview.filter(l => l.valido).length} Linhas`}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}