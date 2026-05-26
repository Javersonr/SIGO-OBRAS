import React from "react";
import { Button } from "@/components/ui/button";
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
import { Plus, Edit, Trash2, KeyRound, Shield } from "lucide-react";

export default function UsuariosTab({
  usuarios,
  user,
  enviandoReset,
  setSelectedUser,
  setShowUserModal,
  handleDeleteUser,
  handleGerarLinkReset,
}) {
  return (
    <>
      {/* Análise de Permissões */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Análise de Permissões</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Total de Usuários</p>
              <p className="text-2xl font-bold text-slate-800">{usuarios.length}</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-slate-500 mb-1">Apenas Perfil</p>
              <p className="text-2xl font-bold text-blue-700">
                {
                  usuarios.filter((u) => {
                    const p = u.permissoes ? JSON.parse(u.permissoes) : {};
                    return Object.keys(p).length === 0;
                  }).length
                }
              </p>
              <p className="text-xs text-slate-400 mt-1">Sem permissões granulares</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <p className="text-xs text-slate-500 mb-1">Permissões Granulares</p>
              <p className="text-2xl font-bold text-purple-700">
                {
                  usuarios.filter((u) => {
                    const p = u.permissoes ? JSON.parse(u.permissoes) : {};
                    return Object.keys(p).length > 0;
                  }).length
                }
              </p>
              <p className="text-xs text-slate-400 mt-1">Com configuração detalhada</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-xs text-slate-500 mb-1">Admins</p>
              <p className="text-2xl font-bold text-green-700">
                {usuarios.filter((u) => u.perfil === "Admin").length}
              </p>
              <p className="text-xs text-slate-400 mt-1">Acesso completo</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800 flex items-start gap-2">
              <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Importante:</strong> Usuários com perfil "Admin" têm acesso total
                independente das permissões granulares.
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Usuários da Empresa</CardTitle>
          <Button
            onClick={() => {
              setSelectedUser(null);
              setShowUserModal(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" /> Novo Usuário
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Permissões</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.nome_completo || "-"}
                    {u.perfil === "Cliente" && u.projeto_nome && (
                      <div className="text-xs text-blue-600 mt-1">Projeto: {u.projeto_nome}</div>
                    )}
                  </TableCell>
                  <TableCell>{u.usuario_email}</TableCell>
                  <TableCell>{u.telefone || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{u.perfil}</Badge>
                  </TableCell>
                  <TableCell>
                    {u.perfil === "Admin" ? (
                      <Badge className="bg-green-100 text-green-700">Acesso Total</Badge>
                    ) : u.perfil === "Cliente" ? (
                      <Badge className="bg-blue-100 text-blue-700">Portal do Cliente</Badge>
                    ) : (
                      (() => {
                        const perms = u.permissoes ? JSON.parse(u.permissoes) : {};
                        let total = 0;
                        Object.values(perms).forEach((mod) => {
                          if (typeof mod === "object")
                            Object.values(mod).forEach((aba) => {
                              if (typeof aba === "object") total += Object.keys(aba).length;
                            });
                        });
                        return total > 0 ? (
                          <Badge className="bg-blue-100 text-blue-700">{total} funções</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">Sem permissões</span>
                        );
                      })()
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedUser(u);
                          setShowUserModal(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={enviandoReset === u.id}
                        onClick={() => handleGerarLinkReset(u)}
                      >
                        <KeyRound
                          className={`w-4 h-4 text-amber-500 ${enviandoReset === u.id ? "animate-pulse" : ""}`}
                        />
                      </Button>
                      {u.usuario_email !== user?.email && (
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
