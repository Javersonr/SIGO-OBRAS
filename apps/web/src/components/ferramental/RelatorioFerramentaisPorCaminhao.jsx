import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Truck, Wrench, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function RelatorioFerramentaisPorCaminhao({ empresaAtiva }) {
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadData();
    }
  }, [empresaAtiva?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [caminhoes, ferramentas] = await Promise.all([
        base44.entities.Caminhao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        base44.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }, "", 1000),
      ]);

      // Agrupar ferramentas por caminhão
      const relatorio = caminhoes.map((caminhao) => {
        const ferramentasCaminhao = ferramentas.filter((f) => f.caminhao_id === caminhao.id);
        const valorTotal = ferramentasCaminhao.reduce((sum, f) => sum + (f.valor_unitario || 0), 0);
        const comLaudo = ferramentasCaminhao.filter(
          (f) => f.laudo_url && f.laudo_url.trim()
        ).length;

        return {
          id: caminhao.id,
          placa: caminhao.placa,
          marca: caminhao.marca,
          modelo: caminhao.modelo,
          quantidade: ferramentasCaminhao.length,
          valorTotal,
          comLaudo,
          ferramentas: ferramentasCaminhao.sort((a, b) =>
            (a.descricao || "").localeCompare(b.descricao || "")
          ),
        };
      });

      setDados(relatorio.sort((a, b) => (a.placa || "").localeCompare(b.placa || "")));
    } catch (error) {
      console.error("Erro ao carregar relatório:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDados = dados.filter(
    (d) =>
      d.placa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.marca?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.modelo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalGeral = dados.reduce((sum, d) => sum + d.quantidade, 0);
  const valorGeral = dados.reduce((sum, d) => sum + d.valorTotal, 0);

  return (
    <div className="space-y-6">
      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Caminhões</p>
                <p className="text-2xl font-bold text-slate-800">{dados.length}</p>
              </div>
              <Truck className="w-8 h-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Ferramentas Total</p>
                <p className="text-2xl font-bold text-slate-800">{totalGeral}</p>
              </div>
              <Wrench className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Valor Total</p>
                <p className="text-2xl font-bold text-slate-800">R$ {valorGeral.toFixed(2)}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por placa, marca ou modelo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabela por caminhão */}
      {loading ? (
        <Card>
          <CardContent className="pt-6 text-center text-slate-500">Carregando...</CardContent>
        </Card>
      ) : filteredDados.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-slate-500">
            Nenhum caminhão encontrado
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredDados.map((caminhao) => (
            <Card key={caminhao.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 rounded-lg">
                      <Truck className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-mono">{caminhao.placa}</CardTitle>
                      <p className="text-xs text-slate-500">
                        {caminhao.marca && `${caminhao.marca}`}
                        {caminhao.marca && caminhao.modelo && " - "}
                        {caminhao.modelo && `${caminhao.modelo}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      {caminhao.quantidade} ferramentas
                    </Badge>
                    {caminhao.comLaudo > 0 && (
                      <Badge className="bg-blue-100 text-blue-700 text-xs">
                        📄 {caminhao.comLaudo} com laudo
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {caminhao.ferramentas.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    Nenhuma ferramenta vinculada
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Código</TableHead>
                          <TableHead className="text-xs">Descrição</TableHead>
                          <TableHead className="text-xs">Tipo</TableHead>
                          <TableHead className="text-xs">Número Série</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Vencimento Laudo</TableHead>
                          <TableHead className="text-xs text-right">Valor Unit.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {caminhao.ferramentas.map((ferr) => (
                          <TableRow key={ferr.id} className="text-xs">
                            <TableCell className="font-mono font-semibold text-amber-600">
                              {ferr.codigo}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {ferr.descricao}
                                {ferr.laudo_url && (
                                  <Badge className="bg-blue-100 text-blue-700 text-xs">📄</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={ferr.tipo === "EPI" ? "default" : "outline"}
                                className="text-xs"
                              >
                                {ferr.tipo}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-slate-600">
                              {ferr.numero_serie || "-"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {ferr.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {ferr.data_vencimento_laudo ? (
                                <span
                                  className={
                                    ferr.data_vencimento_laudo <
                                    new Date().toISOString().split("T")[0]
                                      ? "text-red-600 font-semibold"
                                      : ""
                                  }
                                >
                                  {new Date(ferr.data_vencimento_laudo).toLocaleDateString("pt-BR")}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              R$ {(ferr.valor_unitario || 0).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Subtotal do caminhão */}
                    <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end">
                      <div className="text-right">
                        <p className="text-xs text-slate-500 mb-1">Subtotal do caminhão:</p>
                        <p className="text-lg font-bold text-slate-800">
                          R$ {caminhao.valorTotal.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
