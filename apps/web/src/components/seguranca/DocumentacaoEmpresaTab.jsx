import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Plus,
  Upload,
  Eye,
  Trash2,
  FileText,
  Clock,
  Search,
  AlertCircle,
  CheckCircle2,
  Download,
  X,
  Edit,
  Bell,
} from "lucide-react";
import { differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const TIPO_CORES = {
  PCMSO: "bg-blue-100 text-blue-700 border-blue-200",
  PGR: "bg-purple-100 text-purple-700 border-purple-200",
  "Lista de Presença": "bg-green-100 text-green-700 border-green-200",
  Outro: "bg-slate-100 text-slate-700 border-slate-200",
};

const STATUS_CORES = {
  Vigente: "bg-green-100 text-green-700",
  Rascunho: "bg-yellow-100 text-yellow-700",
  Vencido: "bg-red-100 text-red-700",
  Arquivado: "bg-slate-100 text-slate-600",
};

function getStatusVencimento(dataVencimento) {
  if (!dataVencimento) return null;
  const hoje = new Date();
  const venc = new Date(dataVencimento);
  const diff = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: "Vencido", cor: "text-red-600", icone: AlertCircle };
  if (diff <= 30) return { label: `Vence em ${diff}d`, cor: "text-yellow-600", icone: Clock };
  return { label: "Em dia", cor: "text-green-600", icone: CheckCircle2 };
}

const FORM_INICIAL = {
  tipo: "",
  nome: "",
  descricao: "",
  treinamento_nome: "",
  data_documento: "",
  data_vencimento: "",
  responsavel_tecnico: "",
  crea_responsavel: "",
  status: "Vigente",
};

export default function DocumentacaoEmpresaTab({ empresaAtiva, temPermissao, perfil }) {
  const [documentos, setDocumentos] = useState([]);
  const [vencimentos, setVencimentos] = useState([]);
  const [activeTab, setActiveTab] = useState("documentos");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showVisualizarModal, setShowVisualizarModal] = useState(false);
  const [docSelecionado, setDocSelecionado] = useState(null);
  const [vencimentoEditando, setVencimentoEditando] = useState(null);
  const [showVencimentoModal, setShowVencimentoModal] = useState(false);
  const [showNovoTipo, setShowNovoTipo] = useState(false);
  const [novoTipo, setNovoTipo] = useState("");
  const [tiposCustom, setTiposCustom] = useState(["PCMSO", "PGR", "Lista de Presença", "Outro"]);

  const podeEditar =
    perfil === "Admin" ||
    temPermissao("Segurança do Trabalho", "Documentação da Empresa", "editar");
  const podeCriar =
    perfil === "Admin" || temPermissao("Segurança do Trabalho", "Documentação da Empresa", "criar");
  const podeDeletar =
    perfil === "Admin" ||
    temPermissao("Segurança do Trabalho", "Documentação da Empresa", "deletar");

  useEffect(() => {
    if (empresaAtiva?.id) loadDocumentos();
  }, [empresaAtiva?.id]);

  const loadDocumentos = async () => {
    setLoading(true);
    try {
      const [docs, vencs] = await Promise.all([
        base44.entities.DocumentoEmpresa.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        base44.entities.Vencimento.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ]);
      setDocumentos(docs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      setVencimentos(
        vencs.map((v) => ({
          ...v,
          status: v.status || atualizarStatus(v).status,
        }))
      );
    } catch (error) {
      toast.error("Erro ao carregar documentos");
    } finally {
      setLoading(false);
    }
  };

  const atualizarStatus = (v) => {
    const diff = differenceInDays(new Date(v.data_vencimento + "T00:00:00"), new Date());
    if (diff < 0) return { ...v, status: "Vencido" };
    if (diff <= (v.alerta_dias || 30)) return { ...v, status: "A Vencer" };
    return { ...v, status: "OK" };
  };

  const handleSalvar = async () => {
    if (!form.tipo || !form.nome) {
      toast.error("Preencha o tipo e o nome do documento");
      return;
    }
    setSaving(true);
    try {
      const data = { ...form, empresa_id: empresaAtiva.id };
      if (editando) {
        await base44.entities.DocumentoEmpresa.update(editando.id, data);
        toast.success("Documento atualizado");
      } else {
        await base44.entities.DocumentoEmpresa.create({ ...data, anexos: "[]" });
        toast.success("Documento criado");
      }
      setShowModal(false);
      setEditando(null);
      setForm(FORM_INICIAL);
      loadDocumentos();
    } catch {
      toast.error("Erro ao salvar documento");
    } finally {
      setSaving(false);
    }
  };

  const handleEditar = (doc) => {
    setEditando(doc);
    setForm({
      tipo: doc.tipo,
      nome: doc.nome,
      descricao: doc.descricao || "",
      treinamento_nome: doc.treinamento_nome || "",
      data_documento: doc.data_documento || "",
      data_vencimento: doc.data_vencimento || "",
      responsavel_tecnico: doc.responsavel_tecnico || "",
      crea_responsavel: doc.crea_responsavel || "",
      status: doc.status || "Vigente",
    });
    setShowModal(true);
  };

  const handleExcluir = async (doc) => {
    if (!confirm(`Excluir o documento "${doc.nome}"?`)) return;
    try {
      await base44.entities.DocumentoEmpresa.update(doc.id, { ativo: false });
      toast.success("Documento excluído");
      loadDocumentos();
    } catch {
      toast.error("Erro ao excluir documento");
    }
  };

  const handleUploadAnexo = async (e, docId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const doc = documentos.find((d) => d.id === docId);
      const anexos = JSON.parse(doc.anexos || "[]");
      anexos.push({ nome: file.name, url: file_url, data_upload: new Date().toISOString() });
      await base44.entities.DocumentoEmpresa.update(docId, { anexos: JSON.stringify(anexos) });
      toast.success("Arquivo anexado");
      loadDocumentos();
    } catch {
      toast.error("Erro ao anexar arquivo");
    } finally {
      setUploading(false);
    }
    e.target.value = "";
  };

  const handleRemoverAnexo = async (docId, anexoIdx) => {
    const doc = documentos.find((d) => d.id === docId);
    const anexos = JSON.parse(doc.anexos || "[]");
    anexos.splice(anexoIdx, 1);
    try {
      await base44.entities.DocumentoEmpresa.update(docId, { anexos: JSON.stringify(anexos) });
      toast.success("Arquivo removido");
      loadDocumentos();
    } catch {
      toast.error("Erro ao remover arquivo");
    }
  };

  const docsFiltrados = documentos.filter((d) => {
    const matchTipo = tipoFiltro === "todos" || d.tipo === tipoFiltro;
    const matchSearch =
      !searchTerm ||
      d.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.treinamento_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.responsavel_tecnico?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchTipo && matchSearch;
  });

  const resumo = {
    PCMSO: documentos.filter((d) => d.tipo === "PCMSO").length,
    PGR: documentos.filter((d) => d.tipo === "PGR").length,
    "Lista de Presença": documentos.filter((d) => d.tipo === "Lista de Presença").length,
    vencidos: documentos.filter((d) => {
      if (!d.data_vencimento) return false;
      return new Date(d.data_vencimento) < new Date();
    }).length,
  };

  const handleNotificarVencimento = async (v) => {
    if (!v.responsavel_email) {
      toast.error("Responsável sem email cadastrado");
      return;
    }
    try {
      await base44.integrations.Core.SendEmail({
        to: v.responsavel_email,
        subject: `⚠️ Vencimento próximo: ${v.titulo}`,
        body: `Olá ${v.responsavel_nome || ""},\n\nO documento "${v.titulo}" vence em ${v.data_vencimento}.\n\nStatus: ${v.status}\n\nPor favor, providencie a renovação.`,
      });
      toast.success(`Notificação enviada para ${v.responsavel_email}`);
    } catch {
      toast.error("Erro ao enviar notificação");
    }
  };

  const handleSalvarVencimento = async (vencData) => {
    try {
      if (vencimentoEditando) {
        await base44.entities.Vencimento.update(vencimentoEditando.id, vencData);
        toast.success("Vencimento atualizado");
      } else {
        await base44.entities.Vencimento.create({ ...vencData, empresa_id: empresaAtiva.id });
        toast.success("Vencimento criado");
      }
      setShowVencimentoModal(false);
      setVencimentoEditando(null);
      loadDocumentos();
    } catch {
      toast.error("Erro ao salvar vencimento");
    }
  };

  const handleExcluirVencimento = async (v) => {
    if (!confirm(`Excluir o vencimento "${v.titulo}"?`)) return;
    try {
      await base44.entities.Vencimento.update(v.id, { ativo: false });
      toast.success("Vencimento excluído");
      loadDocumentos();
    } catch {
      toast.error("Erro ao excluir vencimento");
    }
  };

  const vencidos = vencimentos.filter((v) => v.status === "Vencido").length;
  const aVencer = vencimentos.filter((v) => v.status === "A Vencer").length;
  const ok = vencimentos.filter((v) => v.status === "OK").length;

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="vencimentos">Vencimentos</TabsTrigger>
        </TabsList>

        <TabsContent value="documentos" className="space-y-6">
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "PCMSO", value: resumo.PCMSO, cor: "text-blue-600", bg: "bg-blue-50" },
              { label: "PGR", value: resumo.PGR, cor: "text-purple-600", bg: "bg-purple-50" },
              {
                label: "Listas de Presença",
                value: resumo["Lista de Presença"],
                cor: "text-green-600",
                bg: "bg-green-50",
              },
              { label: "Vencidos", value: resumo.vencidos, cor: "text-red-600", bg: "bg-red-50" },
            ].map((item) => (
              <Card key={item.label} className={cn("border-0", item.bg)}>
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className={cn("text-2xl font-bold", item.cor)}>{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Barra de ações */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-1">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar documento..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="PCMSO">PCMSO</SelectItem>
                  <SelectItem value="PGR">PGR</SelectItem>
                  <SelectItem value="Lista de Presença">Lista de Presença</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {podeCriar && (
              <Button
                onClick={() => {
                  setEditando(null);
                  setForm(FORM_INICIAL);
                  setShowModal(true);
                }}
                className="bg-amber-500 hover:bg-amber-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Documento
              </Button>
            )}
          </div>

          {/* Lista de documentos */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : docsFiltrados.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">Nenhum documento encontrado</p>
              <p className="text-xs text-slate-400 mt-1">
                Crie documentos como PCMSO, PGR e Listas de Presença
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {docsFiltrados.map((doc) => {
                const anexos = JSON.parse(doc.anexos || "[]");
                const statusVenc = getStatusVencimento(doc.data_vencimento);
                const StatusIcon = statusVenc?.icone;

                return (
                  <Card key={doc.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        {/* Info principal */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge className={cn("text-xs border", TIPO_CORES[doc.tipo])}>
                              {doc.tipo}
                            </Badge>
                            <Badge className={cn("text-xs", STATUS_CORES[doc.status])}>
                              {doc.status}
                            </Badge>
                            {statusVenc && StatusIcon && (
                              <span
                                className={cn(
                                  "flex items-center gap-1 text-xs font-medium",
                                  statusVenc.cor
                                )}
                              >
                                <StatusIcon className="w-3 h-3" />
                                {statusVenc.label}
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-slate-800 truncate">{doc.nome}</h3>
                          {doc.treinamento_nome && (
                            <p className="text-sm text-slate-500">
                              Treinamento: {doc.treinamento_nome}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                            {doc.data_documento && (
                              <span>
                                📅{" "}
                                {format(new Date(doc.data_documento + "T00:00:00"), "dd/MM/yyyy")}
                              </span>
                            )}
                            {doc.data_vencimento && (
                              <span>
                                ⏰ Vence:{" "}
                                {format(new Date(doc.data_vencimento + "T00:00:00"), "dd/MM/yyyy")}
                              </span>
                            )}
                            {doc.responsavel_tecnico && <span>👤 {doc.responsavel_tecnico}</span>}
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {anexos.length} arquivo(s)
                            </span>
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {podeEditar && (
                            <label title="Anexar arquivo">
                              <Button variant="outline" size="sm" disabled={uploading} asChild>
                                <span>
                                  <Upload className="w-4 h-4" />
                                </span>
                              </Button>
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => handleUploadAnexo(e, doc.id)}
                                disabled={uploading}
                              />
                            </label>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDocSelecionado(doc);
                              setShowVisualizarModal(true);
                            }}
                            title="Ver detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditar(doc)}
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {podeDeletar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleExcluir(doc)}
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Anexos */}
                      {anexos.length > 0 && (
                        <div className="mt-3 pt-3 border-t space-y-1.5">
                          {anexos.map((anexo, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2 bg-slate-50 rounded-lg"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <FileText className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                <a
                                  href={anexo.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:text-blue-700 truncate"
                                >
                                  {anexo.nome}
                                </a>
                                {anexo.data_upload && (
                                  <span className="text-xs text-slate-400 flex-shrink-0">
                                    {format(new Date(anexo.data_upload), "dd/MM/yy")}
                                  </span>
                                )}
                              </div>
                              {podeEditar && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 ml-1"
                                  onClick={() => handleRemoverAnexo(doc.id, idx)}
                                >
                                  <X className="w-3 h-3 text-red-500" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Modal criar/editar - Fullscreen */}
          <Sheet open={showModal} onOpenChange={setShowModal}>
            <SheetContent
              side="right"
              className="w-full h-full overflow-y-auto !p-0 flex flex-col"
              data-fullscreen-modal
            >
              <SheetHeader className="border-b p-6 flex-shrink-0">
                <SheetTitle>{editando ? "Editar Documento" : "Novo Documento"}</SheetTitle>
              </SheetHeader>
              <div className="p-6 flex-1 overflow-y-auto space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label>Tipo *</Label>
                        <Select
                          value={form.tipo}
                          onValueChange={(v) => setForm({ ...form, tipo: v })}
                        >
                          <SelectTrigger className="mt-1.5">
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            {tiposCustom.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowNovoTipo(true)}
                        className="gap-1"
                        title="Criar novo tipo de documento"
                      >
                        <Plus className="w-4 h-4" />
                        Novo Tipo
                      </Button>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <Label>Nome *</Label>
                    <Input
                      value={form.nome}
                      onChange={(e) => setForm({ ...form, nome: e.target.value })}
                      placeholder={
                        form.tipo === "Lista de Presença"
                          ? "Ex: Lista de Presença - NR-35 Jan/2026"
                          : "Ex: PCMSO 2026"
                      }
                      className="mt-1.5"
                    />
                  </div>

                  {form.tipo === "Lista de Presença" && (
                    <div className="col-span-2">
                      <Label>Nome do Treinamento</Label>
                      <Input
                        value={form.treinamento_nome}
                        onChange={(e) => setForm({ ...form, treinamento_nome: e.target.value })}
                        placeholder="Ex: NR-35 - Trabalho em Altura"
                        className="mt-1.5"
                      />
                    </div>
                  )}

                  <div>
                    <Label>Data do Documento</Label>
                    <Input
                      type="date"
                      value={form.data_documento}
                      onChange={(e) => setForm({ ...form, data_documento: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>

                  {(form.tipo === "PCMSO" || form.tipo === "PGR") && (
                    <div>
                      <Label>Data de Vencimento</Label>
                      <Input
                        type="date"
                        value={form.data_vencimento}
                        onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                  )}

                  <div>
                    <Label>Responsável Técnico</Label>
                    <Input
                      value={form.responsavel_tecnico}
                      onChange={(e) => setForm({ ...form, responsavel_tecnico: e.target.value })}
                      placeholder="Nome do médico/engenheiro"
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label>CREA / CRM</Label>
                    <Input
                      value={form.crea_responsavel}
                      onChange={(e) => setForm({ ...form, crea_responsavel: e.target.value })}
                      placeholder="Ex: CREA-MG 12345"
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label>Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) => setForm({ ...form, status: v })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Vigente">Vigente</SelectItem>
                        <SelectItem value="Rascunho">Rascunho</SelectItem>
                        <SelectItem value="Vencido">Vencido</SelectItem>
                        <SelectItem value="Arquivado">Arquivado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2">
                    <Label>Descrição / Observações</Label>
                    <Textarea
                      value={form.descricao}
                      onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                      className="mt-1.5"
                      rows={3}
                    />
                  </div>
                </div>
              </div>
              <SheetFooter className="border-t p-6 flex-shrink-0 flex gap-3">
                <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">
                  Cancelar
                </Button>
                <Button
                  onClick={handleSalvar}
                  disabled={saving}
                  className="bg-amber-500 hover:bg-amber-600 flex-1"
                >
                  {saving ? "Salvando..." : editando ? "Atualizar" : "Criar"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          {/* Modal novo tipo de documento */}
          <Dialog open={showNovoTipo} onOpenChange={setShowNovoTipo}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Novo Tipo de Documento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Nome do Tipo *</Label>
                  <Input
                    value={novoTipo}
                    onChange={(e) => setNovoTipo(e.target.value)}
                    placeholder="Ex: Licença Ambiental"
                    className="mt-1.5"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowNovoTipo(false);
                    setNovoTipo("");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    if (novoTipo.trim() && !tiposCustom.includes(novoTipo)) {
                      setTiposCustom([...tiposCustom, novoTipo]);
                      setForm({ ...form, tipo: novoTipo });
                      setShowNovoTipo(false);
                      setNovoTipo("");
                      toast.success("Tipo de documento criado");
                    } else if (tiposCustom.includes(novoTipo)) {
                      toast.error("Este tipo já existe");
                    } else {
                      toast.error("Digite um nome válido");
                    }
                  }}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Modal visualizar detalhes */}
          <Dialog open={showVisualizarModal} onOpenChange={setShowVisualizarModal}>
            {docSelecionado && (
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Badge className={cn("text-xs border", TIPO_CORES[docSelecionado.tipo])}>
                      {docSelecionado.tipo}
                    </Badge>
                    {docSelecionado.nome}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2 text-sm">
                  {docSelecionado.treinamento_nome && (
                    <div>
                      <span className="font-medium text-slate-600">Treinamento:</span>{" "}
                      {docSelecionado.treinamento_nome}
                    </div>
                  )}
                  {docSelecionado.data_documento && (
                    <div>
                      <span className="font-medium text-slate-600">Data:</span>{" "}
                      {format(new Date(docSelecionado.data_documento + "T00:00:00"), "dd/MM/yyyy")}
                    </div>
                  )}
                  {docSelecionado.data_vencimento && (
                    <div>
                      <span className="font-medium text-slate-600">Vencimento:</span>{" "}
                      {format(new Date(docSelecionado.data_vencimento + "T00:00:00"), "dd/MM/yyyy")}
                    </div>
                  )}
                  {docSelecionado.responsavel_tecnico && (
                    <div>
                      <span className="font-medium text-slate-600">Responsável:</span>{" "}
                      {docSelecionado.responsavel_tecnico}
                    </div>
                  )}
                  {docSelecionado.crea_responsavel && (
                    <div>
                      <span className="font-medium text-slate-600">CREA/CRM:</span>{" "}
                      {docSelecionado.crea_responsavel}
                    </div>
                  )}
                  {docSelecionado.descricao && (
                    <div>
                      <span className="font-medium text-slate-600">Observações:</span>{" "}
                      {docSelecionado.descricao}
                    </div>
                  )}

                  <div className="pt-2 border-t">
                    <p className="font-medium text-slate-600 mb-2">Arquivos Anexados</p>
                    {JSON.parse(docSelecionado.anexos || "[]").length === 0 ? (
                      <p className="text-slate-400 text-xs">Nenhum arquivo anexado</p>
                    ) : (
                      <div className="space-y-1.5">
                        {JSON.parse(docSelecionado.anexos || "[]").map((anexo, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 p-2 bg-slate-50 rounded"
                          >
                            <FileText className="w-4 h-4 text-slate-400" />
                            <a
                              href={anexo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline flex-1 truncate"
                            >
                              {anexo.nome}
                            </a>
                            <a
                              href={anexo.url}
                              download
                              className="text-slate-500 hover:text-slate-700"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowVisualizarModal(false)}>
                    Fechar
                  </Button>
                </DialogFooter>
              </DialogContent>
            )}
          </Dialog>
        </TabsContent>

        <TabsContent value="vencimentos" className="space-y-6">
          {/* Cards de resumo de vencimentos */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertCircle className="w-8 h-8 text-red-500 flex-shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-red-700">{vencidos}</p>
                  <p className="text-sm text-red-600">Vencidos</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="w-8 h-8 text-yellow-500 flex-shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-yellow-700">{aVencer}</p>
                  <p className="text-sm text-yellow-600">A Vencer</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-500 flex-shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-green-700">{ok}</p>
                  <p className="text-sm text-green-600">Em dia</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Botão novo vencimento */}
          {podeCriar && (
            <Button
              onClick={() => {
                setVencimentoEditando(null);
                setShowVencimentoModal(true);
              }}
              className="bg-amber-500 hover:bg-amber-600 gap-2"
            >
              <Plus className="w-4 h-4" /> Novo Vencimento
            </Button>
          )}

          {/* Lista de vencimentos */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : vencimentos.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
              <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">Nenhum vencimento cadastrado</p>
            </div>
          ) : (
            <div className="space-y-3">
              {["Vencido", "A Vencer", "OK"].map((status) => {
                const grupo = vencimentos.filter((v) => v.status === status);
                if (grupo.length === 0) return null;
                return (
                  <div key={status}>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-4">
                      {status} ({grupo.length})
                    </h3>
                    <div className="space-y-2">
                      {grupo.map((v) => (
                        <Card key={v.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge
                                    className={
                                      status === "Vencido"
                                        ? "bg-red-100 text-red-700"
                                        : status === "A Vencer"
                                          ? "bg-yellow-100 text-yellow-700"
                                          : "bg-green-100 text-green-700"
                                    }
                                  >
                                    {status}
                                  </Badge>
                                  <Badge variant="outline">{v.tipo}</Badge>
                                </div>
                                <h4 className="font-semibold text-slate-800">{v.titulo}</h4>
                                <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                                  <span>
                                    📅 Vence:{" "}
                                    {format(
                                      new Date(v.data_vencimento + "T00:00:00"),
                                      "dd/MM/yyyy",
                                      { locale: ptBR }
                                    )}
                                  </span>
                                  {v.responsavel_nome && <span>👤 {v.responsavel_nome}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {podeEditar && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setVencimentoEditando(v);
                                      setShowVencimentoModal(true);
                                    }}
                                    title="Editar"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                )}
                                {podeDeletar && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleExcluirVencimento(v)}
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleNotificarVencimento(v)}
                                  title="Notificar responsável"
                                >
                                  <Bell className="w-4 h-4 text-blue-500" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal vencimento */}
          {showVencimentoModal && (
            <Dialog open={showVencimentoModal} onOpenChange={setShowVencimentoModal}>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>
                    {vencimentoEditando ? "Editar Vencimento" : "Novo Vencimento"}
                  </DialogTitle>
                </DialogHeader>
                <VencimentoModalContent
                  vencimento={vencimentoEditando}
                  onSave={handleSalvarVencimento}
                  onCancel={() => {
                    setShowVencimentoModal(false);
                    setVencimentoEditando(null);
                  }}
                />
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VencimentoModalContent({ vencimento, onSave, onCancel }) {
  const [form, setForm] = useState(
    vencimento || {
      tipo: "",
      titulo: "",
      data_vencimento: "",
      data_emissao: "",
      responsavel_nome: "",
      responsavel_email: "",
      alerta_dias: 30,
      observacao: "",
    }
  );

  return (
    <>
      <div className="space-y-4 py-2">
        <div>
          <Label>Tipo *</Label>
          <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Certidão Federal (CND)">Certidão Federal (CND)</SelectItem>
              <SelectItem value="Certidão Estadual">Certidão Estadual</SelectItem>
              <SelectItem value="Certidão Municipal">Certidão Municipal</SelectItem>
              <SelectItem value="PCMSO">PCMSO</SelectItem>
              <SelectItem value="PGR">PGR</SelectItem>
              <SelectItem value="Contrato">Contrato</SelectItem>
              <SelectItem value="Outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Título *</Label>
          <Input
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="mt-1.5"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Data de Vencimento *</Label>
            <Input
              type="date"
              value={form.data_vencimento}
              onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Data de Emissão</Label>
            <Input
              type="date"
              value={form.data_emissao}
              onChange={(e) => setForm({ ...form, data_emissao: e.target.value })}
              className="mt-1.5"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Responsável</Label>
            <Input
              value={form.responsavel_nome}
              onChange={(e) => setForm({ ...form, responsavel_nome: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.responsavel_email}
              onChange={(e) => setForm({ ...form, responsavel_email: e.target.value })}
              className="mt-1.5"
            />
          </div>
        </div>
        <div>
          <Label>Alerta (dias antes do vencimento)</Label>
          <Input
            type="number"
            value={form.alerta_dias}
            onChange={(e) => setForm({ ...form, alerta_dias: parseInt(e.target.value) || 30 })}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label>Observações</Label>
          <Textarea
            value={form.observacao}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            className="mt-1.5"
            rows={3}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          onClick={() => onSave(form)}
          disabled={!form.tipo || !form.titulo || !form.data_vencimento}
          className="bg-amber-500 hover:bg-amber-600"
        >
          {vencimento ? "Atualizar" : "Criar"}
        </Button>
      </DialogFooter>
    </>
  );
}
