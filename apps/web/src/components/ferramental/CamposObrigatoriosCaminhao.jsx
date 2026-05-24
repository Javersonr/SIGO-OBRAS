import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Search, AlertCircle } from 'lucide-react';

/**
 * Painel que mostra os campos obrigatórios de um caminhão e permite
 * vincular ferramentas da lista de movimentação a esses campos.
 */
export default function CamposObrigatoriosCaminhao({
  campos,
  ferramentasMovimentacao,
  campoVinculacoes,
  onToggleVinculacao,
  ferramentasTodas
}) {
  const [expandido, setExpandido] = useState(null);
  const [busca, setBusca] = useState('');

  // Ferramentas que foram selecionadas na movimentação (com id válido)
  const ferramentasDaMovimentacao = ferramentasMovimentacao.filter(f => f.ferramenta_id);

  // Todas as ferramentas disponíveis para vinculação (da movimentação OU do catálogo completo)
  const ferramentasParaVincular = ferramentasTodas.filter(f => {
    if (!busca) return true;
    return (
      f.descricao?.toLowerCase().includes(busca.toLowerCase()) ||
      f.codigo?.toLowerCase().includes(busca.toLowerCase())
    );
  });

  const getVinculadas = (campoId) => campoVinculacoes[campoId] || [];

  const getStatusCampo = (campo) => {
    const ids = getVinculadas(campo.id);
    if (ids.length === 0) return 'vazio';
    if (ids.length >= campo.quantidade_obrigatoria) return 'ok';
    return 'parcial';
  };

  const statusColor = {
    vazio: 'bg-slate-100 text-slate-500 border-slate-200',
    parcial: 'bg-amber-50 text-amber-700 border-amber-200',
    ok: 'bg-green-50 text-green-700 border-green-200',
  };

  const totalPreenchidos = campos.filter(c => getStatusCampo(c) === 'ok').length;

  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span>📋 Campos Obrigatórios do Caminhão</span>
          </span>
          <Badge className={totalPreenchidos === campos.length ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
            {totalPreenchidos}/{campos.length} preenchidos
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {campos.map(campo => {
          const status = getStatusCampo(campo);
          const vinculadas = getVinculadas(campo.id);
          const isExpanded = expandido === campo.id;
          const ferramentasDoCampo = ferramentasTodas.filter(f => vinculadas.includes(f.id));

          // Ferramentas da movimentação não ainda vinculadas a este campo
          const ferrsDaMovNaoVinculadas = ferramentasDaMovimentacao.filter(
            fm => !vinculadas.includes(fm.ferramenta_id)
          );

          // Todas as ferramentas do catálogo filtradas por busca
          const ferrsFiltradas = ferramentasParaVincular.filter(
            f => !vinculadas.includes(f.id)
          );

          return (
            <div key={campo.id} className={`rounded-lg border p-3 ${statusColor[status]}`}>
              {/* Header do campo */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandido(isExpanded ? null : campo.id)}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {status === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  ) : status === 'parcial' ? (
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{campo.nome_campo}</p>
                    {campo.descricao && (
                      <p className="text-xs opacity-70 truncate">{campo.descricao}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <Badge variant="outline" className="text-xs">
                    {vinculadas.length}/{campo.quantidade_obrigatoria}
                  </Badge>
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </div>

              {/* Ferramentas já vinculadas */}
              {vinculadas.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ferramentasDoCampo.map(f => (
                    <Badge
                      key={f.id}
                      className="bg-white text-slate-700 border border-slate-300 gap-1 cursor-pointer hover:bg-red-50 hover:text-red-600 hover:border-red-300 text-xs"
                      onClick={() => onToggleVinculacao(campo.id, f.id)}
                    >
                      {f.codigo} — {f.descricao?.substring(0, 25)}
                      <span className="ml-1 opacity-60">×</span>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Painel de vinculação expandido */}
              {isExpanded && (
                <div className="mt-3 space-y-2 border-t border-current/20 pt-3">
                  {/* Ferramentas da movimentação (sugestão rápida) */}
                  {ferrsDaMovNaoVinculadas.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1 opacity-70">Da movimentação atual:</p>
                      <div className="flex flex-wrap gap-1">
                        {ferrsDaMovNaoVinculadas.map(fm => {
                          const f = ferramentasTodas.find(x => x.id === fm.ferramenta_id);
                          if (!f) return null;
                          return (
                            <Button
                              key={f.id}
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 bg-white"
                              onClick={() => onToggleVinculacao(campo.id, f.id)}
                            >
                              + {f.codigo} — {f.descricao?.substring(0, 20)}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Busca no catálogo completo */}
                  <div>
                    <p className="text-xs font-semibold mb-1 opacity-70">Buscar no catálogo:</p>
                    <div className="relative mb-2">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50" />
                      <Input
                        placeholder="Buscar por código ou descrição..."
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        className="pl-7 h-7 text-xs"
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                    <div className="max-h-64 overflow-auto rounded border bg-white">
                      {ferrsFiltradas.length === 0 ? (
                        <p className="text-xs text-center py-3 opacity-50">Nenhuma ferramenta encontrada</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="bg-slate-100 border-b sticky top-0">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">Sub-Código</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Descrição</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">Localização</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Status</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">N° Série</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">N° Laudo</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">Venc. Laudo</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-slate-600">CA</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ferrsFiltradas.slice(0, 20).map(f => (
                              <tr
                                key={f.id}
                                className="border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors"
                                onClick={() => onToggleVinculacao(campo.id, f.id)}
                              >
                                <td className="px-2 py-1.5 font-mono text-slate-700 whitespace-nowrap">{f.codigo_secundario || f.codigo || '-'}</td>
                                <td className="px-2 py-1.5 font-medium text-slate-800">{f.descricao}</td>
                                <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">
                                  {f.localizacao ? (
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"></span>
                                      {f.localizacao}
                                    </span>
                                  ) : '-'}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    f.status === 'Disponível' ? 'bg-green-100 text-green-700' :
                                    f.status === 'Em Uso' ? 'bg-blue-100 text-blue-700' :
                                    f.status === 'Em Manutenção' ? 'bg-orange-100 text-orange-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {f.status || '-'}
                                  </span>
                                </td>
                                <td className="px-2 py-1.5 font-mono text-slate-600 whitespace-nowrap">{f.numero_serie || '-'}</td>
                                <td className="px-2 py-1.5 font-mono text-slate-600 whitespace-nowrap">{f.numero_laudo || '-'}</td>
                                <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">
                                  {f.data_vencimento_laudo
                                    ? new Date(f.data_vencimento_laudo).toLocaleDateString('pt-BR')
                                    : '-'}
                                </td>
                                <td className="px-2 py-1.5 text-slate-600">{f.ca || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}