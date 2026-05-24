import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Criar workbook
    const wb = XLSX.utils.book_new();

    // Aba 1: Instrções
    const instrucoes = [
      ['MODELO DE IMPORTAÇÃO - CHECKLIST DE INSPEÇÃO DE CAMPO'],
      [],
      ['INSTRUÇÕES:'],
      ['1. Preencha os dados nos campos obrigatórios marcados com *'],
      ['2. Cada linha representa um item do checklist'],
      ['3. Use exatamente os valores nas colunas: id, nome, descricao, foto_referencia_url, obrigatorio'],
      ['4. A coluna "id" deve ser única para cada item'],
      ['5. A coluna "obrigatorio" aceita: Sim ou Não'],
      ['6. URLs de fotos devem ser válidas e acessíveis'],
      [],
      ['COLUNAS:'],
      ['* id: Identificador único do item (ex: ITEM_001)'],
      ['* nome: Nome do item a inspecionar (ex: EPI - Capacete)'],
      ['  descricao: Descrição detalhada (opcional)'],
      ['  foto_referencia_url: URL da foto de referência (opcional)'],
      ['* obrigatorio: Se é obrigatório inspecionar (Sim/Não)'],
    ];

    const wsInstrucoes = XLSX.utils.aoa_to_sheet(instrucoes);
    XLSX.utils.book_append_sheet(wb, wsInstrucoes, 'Instruções');

    // Aba 2: Dados
    const headers = ['id', 'nome', 'descricao', 'foto_referencia_url', 'obrigatorio'];
    const exemplos = [
      ['ITEM_001', 'EPI - Capacete', 'Capacete de proteção em bom estado', '', 'Sim'],
      ['ITEM_002', 'EPI - Colete', 'Colete salva-vidas certificado', 'https://example.com/colete.jpg', 'Sim'],
      ['ITEM_003', 'Ferramental', 'Kit de ferramentas completo', '', 'Não'],
      ['ITEM_004', 'Documentação', 'Certificado de segurança atualizado', '', 'Sim'],
    ];

    const dados = [headers, ...exemplos];
    const wsDados = XLSX.utils.aoa_to_sheet(dados);
    wsDados['!cols'] = [
      { wch: 15 },
      { wch: 25 },
      { wch: 35 },
      { wch: 40 },
      { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(wb, wsDados, 'Dados');

    // Gerar buffer
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const uint8Array = new Uint8Array(excelBuffer);

    return new Response(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=modelo_checklist_inspecao.xlsx'
      }
    });
  } catch (error) {
    console.error('Erro ao gerar modelo Excel:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});