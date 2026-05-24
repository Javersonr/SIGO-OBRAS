import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import * as XLSX from 'xlsx';
import { Upload, Download, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

// Colunas da planilha modelo (campos simples, sem JSON)
const COLUNAS = [
  { key: 'nome_completo', label: 'Nome Completo *', obrigatorio: true },
  { key: 'cpf', label: 'CPF *', obrigatorio: true },
  { key: 'data_admissao', label: 'Data de Admissão (AAAA-MM-DD)' },
  { key: 'funcao_nome', label: 'Função (Nome)' },
  { key: 'aso_vencimento', label: 'ASO Vencimento (AAAA-MM-DD)' },
  { key: 'email', label: 'Email' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'numero_registro', label: 'Número de Registro' },
  { key: 'rg', label: 'RG' },
  { key: 'rg_data_expedicao', label: 'RG Data de Expedição (AAAA-MM-DD)' },
  { key: 'rg_uf', label: 'RG UF' },
  { key: 'pis', label: 'PIS' },
  { key: 'data_nascimento', label: 'Data de Nascimento (AAAA-MM-DD)' },
  { key: 'naturalidade', label: 'Naturalidade' },
  { key: 'nome_mae', label: 'Nome da Mãe' },
  { key: 'nome_pai', label: 'Nome do Pai' },
  { key: 'titulo_eleitor', label: 'Título de Eleitor' },
  { key: 'titulo_eleitor_zona', label: 'Zona Eleitoral' },
  { key: 'titulo_eleitor_secao', label: 'Seção Eleitoral' },
  { key: 'reservista', label: 'Reservista' },
  { key: 'estado_civil', label: 'Estado Civil (Solteiro/Casado/Divorciado/Viúvo/União Estável/Outros)' },
  { key: 'raca_cor', label: 'Raça/Cor (Indígena/Branca/Negra/Amarela/Parda/Outros)' },
  { key: 'grau_instrucao', label: 'Grau de Instrução' },
  { key: 'cep', label: 'CEP' },
  { key: 'endereco', label: 'Endereço' },
  { key: 'numero', label: 'Número' },
  { key: 'complemento', label: 'Complemento' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'estado', label: 'Estado (UF)' },
  { key: 'banco_codigo', label: 'Banco Código' },
  { key: 'banco_tipo_conta', label: 'Banco Tipo Conta (Conta Corrente/Conta Poupança)' },
  { key: 'banco_agencia', label: 'Agência' },
  { key: 'banco_conta', label: 'Número da Conta' },
  { key: 'observacoes', label: 'Observações' },
];

function baixarPlanilhaModelo() {
  const wb = XLSX.utils.book_new();

  // Cabeçalhos
  const cabecalhos = COLUNAS.map(c => c.label);

  // Linha de exemplo
  const exemplo = [
    'João da Silva',            // nome_completo
    '123.456.789-00',           // cpf
    '2024-01-15',               // data_admissao
    'Eletricista',              // funcao_nome
    '2025-01-15',               // aso_vencimento
    'joao@email.com',           // email
    '(31) 99999-0000',          // telefone
    'REG001',                   // numero_registro
    '1.234.567',                // rg
    '2010-03-20',               // rg_data_expedicao
    'MG',                       // rg_uf
    '123.45678.90-0',           // pis
    '1990-05-10',               // data_nascimento
    'Belo Horizonte - MG',      // naturalidade
    'Maria da Silva',           // nome_mae
    'José da Silva',            // nome_pai
    '1234567890',               // titulo_eleitor
    '148',                      // titulo_eleitor_zona
    '0292',                     // titulo_eleitor_secao
    '',                         // reservista
    'Casado',                   // estado_civil
    'Parda',                    // raca_cor
    'Ensino Médio Completo',    // grau_instrucao
    '30000-000',                // cep
    'Rua das Flores',           // endereco
    '100',                      // numero
    'Apto 1',                   // complemento
    'Centro',                   // bairro
    'Belo Horizonte',           // cidade
    'MG',                       // estado
    '237',                      // banco_codigo
    'Conta Corrente',           // banco_tipo_conta
    '1234',                     // banco_agencia
    '12345-6',                  // banco_conta
    '',                         // observacoes
  ];

  const dados = [cabecalhos, exemplo];
  const ws = XLSX.utils.aoa_to_sheet(dados);

  // Largura das colunas
  ws['!cols'] = COLUNAS.map(() => ({ wch: 30 }));

  XLSX.utils.book_append_sheet(wb, ws, 'Funcionários');
  XLSX.writeFile(wb, 'modelo_importacao_funcionarios.xlsx');
}

export default function ImportarFuncionariosModal({ open, onOpenChange, empresaAtiva, funcoes = [], onSuccess }) {
  const [arquivo, setArquivo] = useState(null);
  const [preview, setPreview] = useState([]);
  const [erros, setErros] = useState([]);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const handleArquivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setArquivo(file);
    setResultado(null);
    setErros([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (rows.length < 2) {
        setErros(['Planilha vazia ou sem dados além do cabeçalho.']);
        setPreview([]);
        return;
      }

      const cabecalho = rows[0];
      const novosErros = [];
      const dadosParseados = [];

      // Mapear colunas pelo label
      const colMap = {};
      COLUNAS.forEach(col => {
        const idx = cabecalho.findIndex(h =>
          String(h).toLowerCase().trim().startsWith(col.key) ||
          String(h).toLowerCase().trim() === col.label.toLowerCase().split(' (')[0].replace(' *', '').trim().toLowerCase()
        );
        if (idx >= 0) colMap[col.key] = idx;
      });

      // Tentar mapear por posição (ordem da planilha modelo)
      COLUNAS.forEach((col, i) => {
        if (colMap[col.key] === undefined && cabecalho[i] !== undefined) {
          colMap[col.key] = i;
        }
      });

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        // Ignorar linhas completamente vazias
        if (row.every(c => c === '' || c === null || c === undefined)) continue;

        const obj = {};
        COLUNAS.forEach(col => {
          const idx = colMap[col.key];
          const val = idx !== undefined ? String(row[idx] ?? '').trim() : '';
          if (val !== '') obj[col.key] = val;
        });

        // Validar obrigatórios
        if (!obj.nome_completo) {
          novosErros.push(`Linha ${r + 1}: Nome Completo é obrigatório.`);
        }
        if (!obj.cpf) {
          novosErros.push(`Linha ${r + 1}: CPF é obrigatório.`);
        }

        dadosParseados.push({ linha: r + 1, ...obj });
      }

      setErros(novosErros);
      setPreview(dadosParseados);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleImportar = async () => {
    if (preview.length === 0) return;
    if (erros.length > 0) {
      toast.error('Corrija os erros antes de importar');
      return;
    }

    setImportando(true);
    let importados = 0;
    let falhas = 0;

    for (const row of preview) {
      // Ignorar linha se faltam obrigatórios
      if (!row.nome_completo || !row.cpf) { falhas++; continue; }

      // Resolver funcao_id se veio funcao_nome
      let funcao_id = '';
      if (row.funcao_nome && funcoes.length > 0) {
        const fMatch = funcoes.find(f =>
          f.nome?.toLowerCase().trim() === row.funcao_nome.toLowerCase().trim()
        );
        if (fMatch) funcao_id = fMatch.id;
      }

      const { linha, funcao_nome, ...campos } = row;

      const dados = {
        empresa_id: empresaAtiva.id,
        ativo: true,
        dependentes: '[]',
        documentos_pessoais: '[]',
        documentos_rh_estruturados: JSON.stringify([
          { nome: 'ASO - Atestado de Saúde Ocupacional *', anexado: false, url: '', data_upload: '', anexos: [] },
          { nome: 'Exames Médicos', anexado: false, url: '', data_upload: '', anexos: [] },
          { nome: 'Registro de Empregado', anexado: false, url: '', data_upload: '', anexos: [] },
        ]),
        documentos_demissionais: JSON.stringify([
          { nome: 'Aviso Prévio', anexado: false, url: '', data_upload: '', anexos: [] },
          { nome: 'Comprovante de Acordo Judicial', anexado: false, url: '', data_upload: '', anexos: [] },
          { nome: 'Declaração de Empregado Desligado do Contrato', anexado: false, url: '', data_upload: '', anexos: [] },
          { nome: 'Declaração de Pedido de Demissão', anexado: false, url: '', data_upload: '', anexos: [] },
          { nome: 'Demonstrativo do Trabalhador de Recolhimento FGTS Rescisório', anexado: false, url: '', data_upload: '', anexos: [] },
          { nome: 'Exame Demissional', anexado: false, url: '', data_upload: '', anexos: [] },
          { nome: 'GRRF - Guia de Recolhimento Rescisório do FGTS e Comprovante de Pagamento', anexado: false, url: '', data_upload: '', anexos: [] },
          { nome: 'PPP - Perfil Profissiográfico Previdenciário', anexado: false, url: '', data_upload: '', anexos: [] },
          { nome: 'TRCT - Termo de Rescisão de Contrato de Trabalho', anexado: false, url: '', data_upload: '', anexos: [] },
        ]),
        documentos_obrigatorios: JSON.stringify([
          { nome: 'Cópia do CPF *', anexado: false, url: '', data_upload: '' },
          { nome: 'Cópia do PIS *', anexado: false, url: '', data_upload: '' },
          { nome: 'Cópia da Cédula de Identidade *', anexado: false, url: '', data_upload: '' },
          { nome: 'Cópia do Título de Eleitor *', anexado: false, url: '', data_upload: '' },
          { nome: '1 Foto 3x4 recente para crachá', anexado: false, url: '', data_upload: '' },
          { nome: 'Cópia da Certidão de Casamento ou Declaração de Convívio Marital', anexado: false, url: '', data_upload: '' },
          { nome: 'Cópia da Certidão de Nascimento dos filhos', anexado: false, url: '', data_upload: '' },
          { nome: 'Cópia da Caderneta de vacinação dos filhos menores de 7 anos', anexado: false, url: '', data_upload: '' },
          { nome: 'Cópia da declaração de frequência escolar menores de 14 anos', anexado: false, url: '', data_upload: '' },
          { nome: 'Cópia do Certificado de Reservista (Masculino)', anexado: false, url: '', data_upload: '' },
          { nome: 'Cópia do Comprovante de Residência atualizado *', anexado: false, url: '', data_upload: '' },
          { nome: 'Certidão de Antecedentes Criminais *', anexado: false, url: '', data_upload: '' },
          { nome: 'Cópia do cartão da conta para portabilidade', anexado: false, url: '', data_upload: '' },
          { nome: 'Cópia da Carteira de Trabalho *', anexado: false, url: '', data_upload: '' },
        ]),
        treinamentos_anexos: '[]',
        ferramentais_anexos: '[]',
        epis_anexos: '[]',
        documentos_rh_anexos: '[]',
        autorizacao_formal_anexos: '[]',
        direito_recusa_anexos: '[]',
        ordem_servicos_anexos: '[]',
        ...campos,
        ...(funcao_id ? { funcao_id, funcao_nome } : funcao_nome ? { funcao_nome } : {}),
      };

      try {
        await base44.entities.Funcionario.create(dados);
        importados++;
      } catch (e) {
        console.error('Erro ao importar linha', linha, e);
        falhas++;
      }
    }

    setImportando(false);
    setResultado({ importados, falhas });
    if (importados > 0) {
      toast.success(`${importados} funcionário(s) importado(s) com sucesso`);
      onSuccess?.();
    }
    if (falhas > 0) {
      toast.error(`${falhas} linha(s) com falha`);
    }
  };

  const handleFechar = () => {
    setArquivo(null);
    setPreview([]);
    setErros([]);
    setResultado(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleFechar}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Funcionários</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Baixar modelo */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-800">1. Baixe a planilha modelo</p>
              <p className="text-xs text-blue-600 mt-0.5">Preencha os dados e faça o upload abaixo. Células em branco serão ignoradas.</p>
            </div>
            <Button variant="outline" size="sm" onClick={baixarPlanilhaModelo} className="border-blue-400 text-blue-700 hover:bg-blue-100 gap-2 whitespace-nowrap">
              <Download className="w-4 h-4" />
              Baixar Modelo
            </Button>
          </div>

          {/* Upload */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">2. Envie a planilha preenchida</p>
            <label className="flex items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-colors">
              <div className="text-center">
                <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                <p className="text-sm text-slate-500">{arquivo ? arquivo.name : 'Clique para selecionar .xlsx ou .xls'}</p>
              </div>
              <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleArquivo} />
            </label>
          </div>

          {/* Erros */}
          {erros.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-700 flex items-center gap-1 mb-2">
                <AlertCircle className="w-4 h-4" /> {erros.length} erro(s) encontrado(s)
              </p>
              <ul className="space-y-0.5">
                {erros.map((e, i) => (
                  <li key={i} className="text-xs text-red-600">• {e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && erros.length === 0 && !resultado && (
            <div className="border rounded-lg overflow-hidden">
              <div className="p-3 bg-slate-50 border-b flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">{preview.length} funcionário(s) encontrado(s)</p>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Nome</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">CPF</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Função</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Admissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t hover:bg-slate-50">
                        <td className="px-3 py-2">{row.nome_completo || '-'}</td>
                        <td className="px-3 py-2">{row.cpf || '-'}</td>
                        <td className="px-3 py-2">{row.funcao_nome || '-'}</td>
                        <td className="px-3 py-2">{row.data_admissao || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">Importação concluída</p>
                <p className="text-xs text-green-700 mt-0.5">
                  {resultado.importados} importado(s) com sucesso
                  {resultado.falhas > 0 && ` · ${resultado.falhas} com falha`}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleFechar}>Fechar</Button>
          {preview.length > 0 && erros.length === 0 && !resultado && (
            <Button
              onClick={handleImportar}
              disabled={importando}
              className="bg-amber-500 hover:bg-amber-600 gap-2"
            >
              {importando ? <><Loader2 className="w-4 h-4 animate-spin" />Importando...</> : `Importar ${preview.length} funcionário(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}