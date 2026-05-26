import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Download, Eye, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";

const tipoAcaoColors = {
  criar: "bg-green-100 text-green-800",
  editar: "bg-blue-100 text-blue-800",
  deletar: "bg-red-100 text-red-800",
  visualizar: "bg-gray-100 text-gray-800",
  exportar: "bg-purple-100 text-purple-800",
  configurar: "bg-orange-100 text-orange-800",
  arquivar: "bg-yellow-100 text-yellow-800",
};

export default function AuditoriaTab({ empresaAtiva }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterEntidade, setFilterEntidade] = useState("all");
  const [filterUsuario, setFilterUsuario] = useState("all");
  const [selectedLog, setSelectedLog] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    loadData();
  }, [empresaAtiva?.id]);

  const loadData = async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const [auditLogs, usuariosList] = await Promise.all([
        base44.entities.AuditLog.filter({ empresa_id: empresaAtiva.id }, "-created_date", 100),
        base44.entities.UsuarioEmpresa.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ]);

      setLogs(auditLogs);
      setUsuarios([...new Map(usuariosList.map((u) => [u.usuario_email, u])).values()]);
    } catch (error) {
      console.error("Erro ao carregar logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = React.useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        !searchTerm ||
        log.usuario_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entidade_nome?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchTipo = filterTipo === "all" || log.tipo_acao === filterTipo;
      const matchEntidade = filterEntidade === "all" || log.entidade === filterEntidade;
      const matchUsuario = filterUsuario === "all" || log.usuario_email === filterUsuario;

      return matchSearch && matchTipo && matchEntidade && matchUsuario;
    });
  }, [logs, searchTerm, filterTipo, filterEntidade, filterUsuario]);

  const entidades = [...new Set(logs.map((l) => l.entidade))].sort();
  const emailsUnicos = [...new Set(logs.map((l) => l.usuario_email))].sort();

  const handleExport = () => {
    const csv = [
      ["Data/Hora", "Usuário", "Ação", "Entidade", "Descrição", "Status"].join(","),
      ...filteredLogs.map((log) =>
        [
          new Date(log.created_date).toLocaleString("pt-BR"),
          log.usuario_nome,
          log.tipo_acao,
          log.entidade,
          log.descricao,
          log.status,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `auditoria_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  if (loading) {
    return <div className="text-center py-12">Carregando logs...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Buscar por usuário, descrição ou entidade..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={handleExport} className="gap-2">
          <Download className="w-4 h-4" />
          Exportar
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <Label className="text-xs text-slate-500">Tipo de Ação</Label>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.keys(tipoAcaoColors).map((tipo) => (
                <SelectItem key={tipo} value={tipo}>
                  {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-slate-500">Entidade</Label>
          <Select value={filterEntidade} onValueChange={setFilterEntidade}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {entidades.map((ent) => (
                <SelectItem key={ent} value={ent}>
                  {ent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-slate-500">Usuário</Label>
          <Select value={filterUsuario} onValueChange={setFilterUsuario}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {emailsUnicos.map((email) => (
                <SelectItem key={email} value={email}>
                  {email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-slate-500">Status</Label>
          <Select defaultValue="all" onValueChange={() => {}}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="sucesso">Sucesso</SelectItem>
              <SelectItem value="erro">Erro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        {filteredLogs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              Nenhum log encontrado
            </CardContent>
          </Card>
        ) : (
          filteredLogs.map((log) => (
            <Card
              key={log.id}
              className={`cursor-pointer hover:shadow-md transition-all ${log.requer_atencao ? "border-yellow-300 bg-yellow-50" : ""}`}
              onClick={() => {
                setSelectedLog(log);
                setShowDetail(true);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge className={tipoAcaoColors[log.tipo_acao] || "bg-gray-100"}>
                        {log.tipo_acao}
                      </Badge>
                      <span className="font-medium text-slate-800">{log.entidade}</span>
                      {log.requer_atencao && <AlertCircle className="w-4 h-4 text-yellow-600" />}
                    </div>
                    <p className="text-slate-700 mb-2">{log.descricao}</p>
                    <div className="text-xs text-slate-500 space-y-1">
                      <p>
                        👤 {log.usuario_nome} ({log.usuario_email})
                      </p>
                      <p>⏱️ {new Date(log.created_date).toLocaleString("pt-BR")}</p>
                      {log.entidade_nome && <p>📌 {log.entidade_nome}</p>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedLog(log);
                      setShowDetail(true);
                    }}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Sheet open={showDetail} onOpenChange={setShowDetail}>
        <SheetContent className="overflow-y-auto max-w-2xl">
          {selectedLog && (
            <>
              <SheetHeader>
                <SheetTitle>Detalhes da Auditoria</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 py-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-slate-500">Tipo de Ação</Label>
                    <Badge className={tipoAcaoColors[selectedLog.tipo_acao] + " mt-2"}>
                      {selectedLog.tipo_acao}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Status</Label>
                    <Badge
                      className={
                        selectedLog.status === "sucesso"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }
                      style={{ marginTop: "0.5rem" }}
                    >
                      {selectedLog.status}
                    </Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-slate-500">Usuário</Label>
                  <p className="font-medium text-slate-800 mt-1">{selectedLog.usuario_nome}</p>
                  <p className="text-sm text-slate-600">{selectedLog.usuario_email}</p>
                </div>

                <div>
                  <Label className="text-xs text-slate-500">Entidade</Label>
                  <p className="font-medium text-slate-800 mt-1">{selectedLog.entidade}</p>
                  {selectedLog.entidade_nome && (
                    <p className="text-sm text-slate-600">{selectedLog.entidade_nome}</p>
                  )}
                </div>

                <div>
                  <Label className="text-xs text-slate-500">Descrição</Label>
                  <p className="text-slate-700 mt-1">{selectedLog.descricao}</p>
                </div>

                <div>
                  <Label className="text-xs text-slate-500">Data/Hora</Label>
                  <p className="text-slate-800 mt-1">
                    {new Date(selectedLog.created_date).toLocaleString("pt-BR")}
                  </p>
                </div>

                {selectedLog.modulo && (
                  <div>
                    <Label className="text-xs text-slate-500">Módulo</Label>
                    <p className="text-slate-800 mt-1">{selectedLog.modulo}</p>
                  </div>
                )}

                {selectedLog.endereco_ip && (
                  <div>
                    <Label className="text-xs text-slate-500">Endereço IP</Label>
                    <p className="text-slate-800 mt-1 font-mono text-sm">
                      {selectedLog.endereco_ip}
                    </p>
                  </div>
                )}

                {selectedLog.dados_anteriores && (
                  <div>
                    <Label className="text-xs text-slate-500">Dados Anteriores</Label>
                    <pre className="bg-slate-100 p-3 rounded mt-1 text-xs overflow-auto max-h-48">
                      {JSON.stringify(JSON.parse(selectedLog.dados_anteriores), null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.dados_novos && (
                  <div>
                    <Label className="text-xs text-slate-500">Dados Novos</Label>
                    <pre className="bg-slate-100 p-3 rounded mt-1 text-xs overflow-auto max-h-48">
                      {JSON.stringify(JSON.parse(selectedLog.dados_novos), null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.mensagem_erro && (
                  <div>
                    <Label className="text-xs text-slate-500 text-red-600">Mensagem de Erro</Label>
                    <p className="text-slate-800 mt-1 text-red-600">{selectedLog.mensagem_erro}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
