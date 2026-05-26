import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Truck, User, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function VinculacoesTab({ empresaAtiva }) {
  const [caminhoes, setCaminhoes] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState("caminhao");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadData();
    }
  }, [empresaAtiva?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cams, funcs, ferrs] = await Promise.all([
        sigo.entities.Caminhao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Funcionario.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }, "", 1000),
      ]);

      setCaminhoes(cams.sort((a, b) => (a.placa || "").localeCompare(b.placa || "")));
      setFuncionarios(
        funcs.sort((a, b) => (a.nome_completo || "").localeCompare(b.nome_completo || ""))
      );
      setFerramentas(ferrs);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  // Ferramentas vinculadas a caminhões
  const ferramentasCaminhao = caminhoes
    .map((caminhao) => {
      const ferramentasVinculadas = ferramentas.filter((f) => f.caminhao_id === caminhao.id);
      return {
        ...caminhao,
        ferramentasVinculadas,
      };
    })
    .filter((c) => searchTerm === "" || c.placa.toLowerCase().includes(searchTerm.toLowerCase()));

  // Ferramentas vinculadas a funcionários
  const ferramentasFuncionario = funcionarios
    .map((funcionario) => {
      const ferramentasVinculadas = ferramentas.filter((f) => f.funcionario_id === funcionario.id);
      return {
        ...funcionario,
        ferramentasVinculadas,
      };
    })
    .filter(
      (f) => searchTerm === "" || f.nome_completo.toLowerCase().includes(searchTerm.toLowerCase())
    );

  if (loading) {
    return <div className="text-center py-8">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-800">Ferramentas Vinculadas</h2>
          </div>
          <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="caminhao">🚛 Caminhões</SelectItem>
              <SelectItem value="funcionario">👤 Funcionários</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder={
              tipoFiltro === "caminhao" ? "Buscar por placa..." : "Buscar por funcionário..."
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 text-sm"
          />
        </div>
      </div>

      {tipoFiltro === "caminhao" ? (
        <div className="space-y-4">
          {ferramentasCaminhao.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-slate-500">
                Nenhum caminhão encontrado
              </CardContent>
            </Card>
          ) : (
            ferramentasCaminhao.map((caminhao) => (
              <Card key={caminhao.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Truck className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">{caminhao.placa}</h3>
                        {caminhao.modelo && (
                          <p className="text-xs text-slate-500">
                            {caminhao.marca || ""} {caminhao.modelo}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                      {caminhao.ferramentasVinculadas.length} ferramenta(s)
                    </Badge>
                  </div>

                  {caminhao.ferramentasVinculadas.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhuma ferramenta vinculada</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs">Código</TableHead>
                            <TableHead className="text-xs">Descrição</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {caminhao.ferramentasVinculadas.map((ferr) => (
                            <TableRow key={ferr.id} className="hover:bg-slate-50">
                              <TableCell className="font-mono text-slate-700">
                                {ferr.codigo}
                              </TableCell>
                              <TableCell className="text-slate-800">{ferr.descricao}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${
                                    ferr.status === "Disponível"
                                      ? "bg-green-100 text-green-700 border-green-200"
                                      : ferr.status === "Em Uso"
                                        ? "bg-blue-100 text-blue-700 border-blue-200"
                                        : ferr.status === "Em Manutenção"
                                          ? "bg-orange-100 text-orange-700 border-orange-200"
                                          : "bg-slate-100 text-slate-700 border-slate-200"
                                  }`}
                                >
                                  {ferr.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {ferramentasFuncionario.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-slate-500">
                Nenhum funcionário encontrado
              </CardContent>
            </Card>
          ) : (
            ferramentasFuncionario.map((funcionario) => (
              <Card key={funcionario.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <User className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">
                          {funcionario.nome_completo}
                        </h3>
                        {funcionario.funcao_nome && (
                          <p className="text-xs text-slate-500">{funcionario.funcao_nome}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                      {funcionario.ferramentasVinculadas.length} ferramenta(s)
                    </Badge>
                  </div>

                  {funcionario.ferramentasVinculadas.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhuma ferramenta vinculada</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs">Código</TableHead>
                            <TableHead className="text-xs">Descrição</TableHead>
                            <TableHead className="text-xs">N° Série</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {funcionario.ferramentasVinculadas.map((ferr) => (
                            <TableRow key={ferr.id} className="hover:bg-slate-50">
                              <TableCell className="font-mono text-slate-700">
                                {ferr.codigo}
                              </TableCell>
                              <TableCell className="text-slate-800">{ferr.descricao}</TableCell>
                              <TableCell className="font-mono text-slate-600">
                                {ferr.numero_serie || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${
                                    ferr.status === "Disponível"
                                      ? "bg-green-100 text-green-700 border-green-200"
                                      : ferr.status === "Em Uso"
                                        ? "bg-blue-100 text-blue-700 border-blue-200"
                                        : ferr.status === "Em Manutenção"
                                          ? "bg-orange-100 text-orange-700 border-orange-200"
                                          : "bg-slate-100 text-slate-700 border-slate-200"
                                  }`}
                                >
                                  {ferr.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
