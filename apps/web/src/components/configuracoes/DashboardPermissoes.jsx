import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Shield, Users, Edit, Search, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function DashboardPermissoes({ empresaAtiva, onEditUsuario }) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPerfil, setFilterPerfil] = useState("all");
  const [filterModulo, setFilterModulo] = useState("all");
  const [viewMode, setViewMode] = useState("resumo"); // 'resumo' ou 'detalhado'

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadUsuarios();
    }
  }, [empresaAtiva?.id]);

  const loadUsuarios = async () => {
    setLoading(true);
    try {
      const vinculos = await base44.entities.UsuarioEmpresa.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });
      setUsuarios(vinculos);
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
    } finally {
      setLoading(false);
    }
  };

  const analisarPermissoes = (usuario) => {
    if (usuario.perfil === "Admin") {
      return { total: "Todas", modulos: ["Todos"], abas: ["Todas"], funcoes: ["Todas"] };
    }

    if (usuario.perfil === "Cliente") {
      return { total: "Portal Cliente", modulos: ["Portal Cliente"], abas: [], funcoes: [] };
    }

    try {
      const perms = usuario.permissoes ? JSON.parse(usuario.permissoes) : {};
      const modulos = Object.keys(perms);
      let totalFuncoes = 0;
      const todasAbas = [];

      modulos.forEach((modulo) => {
        if (typeof perms[modulo] === "object") {
          Object.keys(perms[modulo]).forEach((aba) => {
            todasAbas.push(`${modulo} → ${aba}`);
            if (typeof perms[modulo][aba] === "object") {
              totalFuncoes += Object.keys(perms[modulo][aba]).length;
            }
          });
        }
      });

      return {
        total: totalFuncoes,
        modulos,
        abas: todasAbas,
        funcoes: totalFuncoes,
      };
    } catch (error) {
      console.error("Erro ao analisar permissões:", error);
      return { total: 0, modulos: [], abas: [], funcoes: 0 };
    }
  };

  const verificarPermissaoModulo = (usuario, modulo) => {
    if (usuario.perfil === "Admin") return "total";

    try {
      const perms = usuario.permissoes ? JSON.parse(usuario.permissoes) : {};
      if (!perms[modulo]) return "nenhuma";

      const moduloPerms = perms[modulo];
      if (typeof moduloPerms !== "object") return "nenhuma";

      const totalAbas = Object.keys(moduloPerms).length;
      if (totalAbas === 0) return "nenhuma";

      // Verificar se tem todas as abas
      const estrutura = ESTRUTURA_PERMISSOES[modulo];
      if (estrutura && Object.keys(estrutura.abas).length === totalAbas) {
        return "total";
      }

      return "parcial";
    } catch (error) {
      return "nenhuma";
    }
  };

  const ESTRUTURA_PERMISSOES = {
    Dashboard: { abas: { Visualização: {} } },
    Oportunidades: {
      abas: { Lista: {}, Orçamento: {}, Cronograma: {}, Arquivos: {}, Cliente: {} },
    },
    Projetos: {
      abas: {
        Lista: {},
        Orçamento: {},
        Cronograma: {},
        "Diário de Obra": {},
        Financeiro: {},
        Arquivos: {},
      },
    },
    Compras: { abas: { Solicitações: {}, Cotações: {}, Pedidos: {}, Histórico: {} } },
    Estoque: { abas: { Materiais: {}, Movimentações: {}, Retiradas: {}, Inventário: {} } },
    "Ferramental e EPI": { abas: { Ferramentas: {}, EPIs: {}, Empréstimos: {} } },
    "Segurança do Trabalho": {
      abas: {
        Funcionários: {},
        "Inspeções de Campo": {},
        "Inspeção de Ferramental": {},
        "Inspeção de Caminhão": {},
        Treinamentos: {},
      },
    },
    Financeiro: {
      abas: {
        Resumo: {},
        Receitas: {},
        Despesas: {},
        Transferências: {},
        Contas: {},
        Relatórios: {},
      },
    },
    Contabilidade: { abas: { DRE: {}, Balanço: {}, Conciliação: {} } },
  };

  const modulos = Object.keys(ESTRUTURA_PERMISSOES);

  const filteredUsuarios = usuarios.filter((u) => {
    const matchSearch =
      !searchTerm ||
      u.nome_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.usuario_email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchPerfil = filterPerfil === "all" || u.perfil === filterPerfil;

    let matchModulo = true;
    if (filterModulo !== "all") {
      const status = verificarPermissaoModulo(u, filterModulo);
      matchModulo = status !== "nenhuma";
    }

    return matchSearch && matchPerfil && matchModulo;
  });

  const estatisticas = {
    totalUsuarios: usuarios.length,
    admins: usuarios.filter((u) => u.perfil === "Admin").length,
    clientes: usuarios.filter((u) => u.perfil === "Cliente").length,
    comPermissoes: usuarios.filter((u) => {
      if (u.perfil === "Admin" || u.perfil === "Cliente") return false;
      try {
        const perms = u.permissoes ? JSON.parse(u.permissoes) : {};
        return Object.keys(perms).length > 0;
      } catch {
        return false;
      }
    }).length,
    semPermissoes: usuarios.filter((u) => {
      if (u.perfil === "Admin" || u.perfil === "Cliente") return false;
      try {
        const perms = u.permissoes ? JSON.parse(u.permissoes) : {};
        return Object.keys(perms).length === 0;
      } catch {
        return true;
      }
    }).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cards de Estatísticas */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Total Usuários</p>
                <p className="text-2xl font-bold text-slate-800">{estatisticas.totalUsuarios}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Admins</p>
                <p className="text-2xl font-bold text-green-600">{estatisticas.admins}</p>
              </div>
              <Shield className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Clientes</p>
                <p className="text-2xl font-bold text-blue-600">{estatisticas.clientes}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Com Permissões</p>
                <p className="text-2xl font-bold text-amber-600">{estatisticas.comPermissoes}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Sem Permissões</p>
                <p className="text-2xl font-bold text-red-600">{estatisticas.semPermissoes}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar usuário..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterPerfil} onValueChange={setFilterPerfil}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os perfis</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Gestor">Gestor</SelectItem>
                <SelectItem value="Compras">Compras</SelectItem>
                <SelectItem value="Estoque">Estoque</SelectItem>
                <SelectItem value="Financeiro">Financeiro</SelectItem>
                <SelectItem value="Cliente">Cliente</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterModulo} onValueChange={setFilterModulo}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os módulos</SelectItem>
                {modulos.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                variant={viewMode === "resumo" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("resumo")}
              >
                Resumo
              </Button>
              <Button
                variant={viewMode === "detalhado" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("detalhado")}
              >
                Detalhado
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Permissões */}
      {viewMode === "resumo" ? (
        <Card>
          <CardHeader>
            <CardTitle>Permissões por Usuário</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Módulos</TableHead>
                  <TableHead>Total Funções</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsuarios.map((u) => {
                  const analise = analisarPermissoes(u);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-800">{u.nome_completo || "-"}</p>
                          <p className="text-xs text-slate-500">{u.usuario_email}</p>
                          {u.perfil === "Cliente" && u.projeto_nome && (
                            <p className="text-xs text-blue-600 mt-1">Projeto: {u.projeto_nome}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            u.perfil === "Admin"
                              ? "bg-green-100 text-green-700"
                              : u.perfil === "Cliente"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-100 text-slate-700"
                          }
                        >
                          {u.perfil}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {typeof analise.modulos === "string" ? (
                          <Badge className="bg-green-100 text-green-700">{analise.modulos}</Badge>
                        ) : analise.modulos.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {analise.modulos.slice(0, 2).map((m) => (
                              <Badge key={m} variant="outline" className="text-xs">
                                {m}
                              </Badge>
                            ))}
                            {analise.modulos.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{analise.modulos.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Nenhum</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {typeof analise.total === "string" ? (
                          <Badge className="bg-green-100 text-green-700">{analise.total}</Badge>
                        ) : analise.total > 0 ? (
                          <Badge className="bg-amber-100 text-amber-700">
                            {analise.total} funções
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700">Sem permissões</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEditUsuario(u)}
                            title="Editar permissões"
                          >
                            <Edit className="w-4 h-4 text-blue-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Matriz de Permissões Detalhada</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-white z-10 min-w-[200px]">
                      Usuário
                    </TableHead>
                    {modulos.map((m) => (
                      <TableHead key={m} className="text-center min-w-[120px]">
                        {m}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsuarios.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="sticky left-0 bg-white z-10">
                        <div>
                          <p className="font-medium text-sm text-slate-800">
                            {u.nome_completo || "-"}
                          </p>
                          <p className="text-xs text-slate-500">{u.usuario_email}</p>
                          <Badge variant="secondary" className="mt-1 text-xs">
                            {u.perfil}
                          </Badge>
                        </div>
                      </TableCell>
                      {modulos.map((m) => {
                        const status = verificarPermissaoModulo(u, m);
                        return (
                          <TableCell key={m} className="text-center">
                            {status === "total" ? (
                              <CheckCircle2
                                className="w-5 h-5 text-green-600 mx-auto"
                                title="Acesso total"
                              />
                            ) : status === "parcial" ? (
                              <AlertCircle
                                className="w-5 h-5 text-amber-600 mx-auto"
                                title="Acesso parcial"
                              />
                            ) : (
                              <XCircle
                                className="w-5 h-5 text-slate-300 mx-auto"
                                title="Sem acesso"
                              />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legenda */}
      {viewMode === "detalhado" && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-slate-600">Acesso Total</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span className="text-slate-600">Acesso Parcial</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-slate-300" />
                <span className="text-slate-600">Sem Acesso</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
