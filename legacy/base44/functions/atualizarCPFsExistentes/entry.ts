import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const formatCPF = (value) => {
  if (!value) return '';
  const numbers = value.replace(/\D/g, '');
  const limited = numbers.slice(0, 11);
  if (limited.length <= 3) return limited;
  if (limited.length <= 6) return `${limited.slice(0, 3)}.${limited.slice(3)}`;
  if (limited.length <= 9) return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6)}`;
  return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6, 9)}-${limited.slice(9)}`;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const empresaId = new URL(req.url).searchParams.get('empresa_id');
    if (!empresaId) {
      return Response.json({ error: 'empresa_id é obrigatório' }, { status: 400 });
    }

    const entidades = [
      'Funcionario', 'UsuarioEmpresa', 'Cliente', 'Fornecedor'
    ];

    let totalAtualizados = 0;

    for (const entidade of entidades) {
      const records = await base44.asServiceRole.entities[entidade].filter({ empresa_id: empresaId });
      
      for (const record of records) {
        if (record.cpf && !record.cpf.includes('.')) {
          const cpfFormatado = formatCPF(record.cpf);
          await base44.asServiceRole.entities[entidade].update(record.id, { cpf: cpfFormatado });
          totalAtualizados++;
        }
      }
    }

    return Response.json({ 
      success: true, 
      message: `${totalAtualizados} CPFs atualizados com sucesso`,
      total: totalAtualizados
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});