import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export const useEntityManagement = (entityName, empresaAtiva) => {
  const [selectedIds, setSelectedIds] = useState([]);
  const [importProgress, setImportProgress] = useState({ show: false, current: 0, total: 0 });
  const [deleteProgress, setDeleteProgress] = useState({ show: false, current: 0, total: 0 });

  const exportToExcel = (items, columns) => {
    const dados = items.map(item => 
      columns.map(col => item[col] || '')
    );

    const headers = columns;
    const linhas = [headers, ...dados];
    const csv = linhas.map(row => row.map(cell => {
      const cellStr = String(cell).replace(/"/g, '""');
      return cellStr.includes(';') || cellStr.includes('\n') || cellStr.includes('"') ? `"${cellStr}"` : cellStr;
    }).join(';')).join('\n');
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${entityName.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportToPDF = async (items, titulo, colunas) => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(16);
    doc.text(titulo, 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);
    
    let y = 30;
    doc.setFontSize(8);
    
    y += 5;
    doc.line(14, y, 280, y);
    y += 5;
    
    items.forEach(item => {
      if (y > 190) {
        doc.addPage();
        y = 20;
      }
      
      colunas.forEach(col => {
        const valor = item[col.key] || '-';
        doc.text(String(valor).substring(0, col.maxLen || 30), col.x, y);
      });
      
      y += 6;
    });
    
    doc.save(`${entityName.toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const deletarSelecionados = async (ids, entityObj) => {
    if (ids.length === 0) return;
    if (!confirm(`Deseja apagar ${ids.length} registro(s) selecionado(s)?`)) return;
    
    const total = ids.length;
    setDeleteProgress({ show: true, current: 0, total });
    
    let sucessos = 0;
    let erros = 0;
    const BATCH_SIZE = 200;
    const CONCURRENT_CHUNK = 10;
    
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      
      for (let j = 0; j < batch.length; j += CONCURRENT_CHUNK) {
        const chunk = batch.slice(j, j + CONCURRENT_CHUNK);
        
        const results = await Promise.allSettled(
          chunk.map(id => entityObj.delete(id))
        );
        
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            sucessos++;
          } else {
            erros++;
          }
        });
        
        setDeleteProgress({ show: true, current: sucessos + erros, total });
        
        if (j + CONCURRENT_CHUNK < batch.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      if (i + BATCH_SIZE < ids.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setDeleteProgress({ show: false, current: 0, total: 0 });
    setSelectedIds([]);
    
    if (erros === 0) {
      toast.success(`✅ ${sucessos} registro(s) apagado(s)`, { duration: 4000 });
    } else {
      toast.warning(`⚠️ ${sucessos} apagados, ${erros} erro(s)`, { duration: 4000 });
    }
  };

  const limparTodos = async (entityObj) => {
    if (!confirm('⚠️ ATENÇÃO: Isso irá apagar TODOS os registros. Esta ação não pode ser desfeita. Deseja continuar?')) return;
    if (!confirm('Tem certeza absoluta?')) return;
    
    try {
      const todosRegistros = await entityObj.filter({ empresa_id: empresaAtiva.id }, null, null);
      const total = todosRegistros.length;
      
      if (total === 0) {
        toast.info('Nenhum registro para apagar', { duration: 3000 });
        return;
      }
      
      setDeleteProgress({ show: true, current: 0, total, type: entityName });
      
      const BATCH_SIZE = 200;
      const CONCURRENT_CHUNK = 10;
      let totalSucessos = 0;
      let totalErros = 0;
      
      for (let i = 0; i < todosRegistros.length; i += BATCH_SIZE) {
        const batch = todosRegistros.slice(i, i + BATCH_SIZE);
        
        for (let j = 0; j < batch.length; j += CONCURRENT_CHUNK) {
          const chunk = batch.slice(j, j + CONCURRENT_CHUNK);
          
          const results = await Promise.allSettled(
            chunk.map(registro => entityObj.delete(registro.id))
          );
          
          results.forEach(result => {
            if (result.status === 'fulfilled') {
              totalSucessos++;
            } else {
              totalErros++;
            }
          });
          
          setDeleteProgress({ show: true, current: totalSucessos + totalErros, total });
          
          if (j + CONCURRENT_CHUNK < batch.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        if (i + BATCH_SIZE < todosRegistros.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      setDeleteProgress({ show: false, current: 0, total: 0 });
      
      if (totalErros === 0) {
        toast.success(`✅ ${totalSucessos} registros apagados`, { duration: 4000 });
      } else {
        toast.warning(`⚠️ ${totalSucessos} apagados, ${totalErros} erro(s)`, { duration: 4000 });
      }
      
      setSelectedIds([]);
    } catch (error) {
      setDeleteProgress({ show: false, current: 0, total: 0 });
      toast.error('❌ Erro ao apagar: ' + error.message, { duration: 6000 });
    }
  };

  return {
    selectedIds,
    setSelectedIds,
    importProgress,
    setImportProgress,
    deleteProgress,
    setDeleteProgress,
    exportToExcel,
    exportToPDF,
    deletarSelecionados,
    limparTodos
  };
};