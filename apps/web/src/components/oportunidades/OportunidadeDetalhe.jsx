import React, { useState, useRef } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Settings,
  Edit,
  Eye,
  Copy,
  FilePlus,
  Trash2,
  X,
  Target,
  Calendar,
  User,
  FileText,
  Download,
  Plus,
  Upload,
  FileSpreadsheet,
  Link2,
  ExternalLink,
  Check,
  Building2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ResponsaveisSelect from "../shared/ResponsaveisSelect";
import PermissionGate from "../PermissionGate";
import ChatContextual from "../chat/ChatContextual";
import DiarioObraTab from "../projetos/DiarioObraTab";
import VisualizarArquivoModal from "./VisualizarArquivoModal";
import PropostasOportunidade from "./PropostasOportunidade";

export default function OportunidadeDetalhe({
  open,
  onOpenChange,
  selectedOp,
  setSelectedOp,
  statusList,
  usuariosEmpresa,
  empresaAtiva,
  user,
  perfil,
  temPermissao,
  podeVerValores,
  atualizacoes,
  orcamentoItens,
  setOrcamentoItens,
  cronogramaEtapas,
  arquivos,
  materiais,
  novaNota,
  setNovaNota,
  itensSelecionados,
  setItensSelecionados,
  filtroTipoOrcamento,
  setFiltroTipoOrcamento,
  updateTimeoutRef,
  onAddNota,
  onDeleteArquivo,
  onUploadFile,
  onLimparOrcamento,
  onExportarExcel,
  onExportarPDF,
  onBaixarModelo,
  onImportarOrcamento,
  onDeleteOrcamentoItem,
  onDeleteSelecionados,
  onNovoOrcamentoSelect,
  onOpenModal,
  onDelete,
  onShowStatusConfig,
  onShowSalvarTemplate,
  onShowAplicarTemplate,
  onShowRelatoriosOrcamento,
  onShowClienteView,
  setOportunidades,
  fileInputOrcamentoRef,
  uploadingFile,
  onReloadArquivos,
}) {
  const [showPreviewArquivo, setShowPreviewArquivo] = useState(false);
  const [arquivoPreview, setArquivoPreview] = useState(null);
  const [showAddLink, setShowAddLink] = useState(false);
  const [showTransferirEmpresa, setShowTransferirEmpresa] = useState(false);
  const [empresasDisponiveis, setEmpresasDisponiveis] = useState([]);
  const [empresaSelecionada, setEmpresaSelecionada] = useState("");
  const [transferindo, setTransferindo] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNome, setLinkNome] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingValues, setEditingValues] = useState({});
  const [itemSearchTerm, setItemSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeTab, setActiveTab] = useState("geral");
  const [visitedTabs, setVisitedTabs] = useState(new Set(["geral"]));
  const fileInputArquivosRef = useRef(null);
  const [perdidoOpen, setPerdidoOpen] = useState(false);
  const [motivoPerda, setMotivoPerda] = useState("");
  const [salvandoPerda, setSalvandoPerda] = useState(false);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => new Set([...prev, tab]));
  };

  // Marca a oportunidade como Perdida: move para o status tipo "perdido",
  // grava o motivo (win-rate) e arquiva (sai do funil ativo).
  const handleMarcarPerdido = async () => {
    const statusPerdido = (statusList || []).find((s) => s.tipo === "perdido");
    const patch = {
      status_id: statusPerdido?.id ?? selectedOp.status_id,
      status_nome: statusPerdido?.nome ?? "Perdido",
      motivo_perda: motivoPerda.trim() || null,
      arquivado: true,
    };
    setSalvandoPerda(true);
    try {
      await sigo.entities.Oportunidade.update(selectedOp.id, patch);
      setSelectedOp((prev) => ({ ...prev, ...patch }));
      setOportunidades((prev) =>
        prev.map((o) => (o.id === selectedOp.id ? { ...o, ...patch } : o))
      );
      setPerdidoOpen(false);
      setMotivoPerda("");
      handleOpenChange(false);
    } catch (e) {
      alert("Erro ao marcar como perdido: " + (e?.message || e));
    } finally {
      setSalvandoPerda(false);
    }
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

  const formatModalidade = (modalidade) => {
    if (!modalidade) return "";
    const formatos = {
      concorrencia: "CONCORR\u00caNCIA",
      tomada_precos: "TOMADA DE PRE\u00c7OS",
      convite: "CONVITE",
      pregao: "PREG\u00c3O",
      dispensa: "DISPENSA",
      inexigibilidade: "INEXIGIBILIDADE",
    };
    return formatos[modalidade] || modalidade.toUpperCase();
  };

  const handleUpdateItem = (itemId, field, value) => {
    const item = orcamentoItens.find((i) => i.id === itemId);
    if (!item) return;
    const updatedData = { ...item, [field]: value };
    const numFields = ["quantidade", "valor_unitario", "bdi", "imposto"];
    if (numFields.includes(field)) {
      const qtd = field === "quantidade" ? parseFloat(value) || 0 : item.quantidade || 0;
      const vlrUnit =
        field === "valor_unitario" ? parseFloat(value) || 0 : item.valor_unitario || 0;
      const bdi = field === "bdi" ? parseFloat(value) || 0 : item.bdi || 0;
      const imp = field === "imposto" ? parseFloat(value) || 0 : item.imposto || 0;
      updatedData.valor_total = qtd * vlrUnit * (1 + bdi / 100) * (1 + imp / 100);
    }
    setOrcamentoItens((prev) => prev.map((i) => (i.id === itemId ? updatedData : i)));
    const key = `${itemId}-${field}`;
    clearTimeout(updateTimeoutRef.current[key]);
    updateTimeoutRef.current[key] = setTimeout(async () => {
      try {
        await sigo.entities.OrcamentoItem.update(itemId, updatedData);
      } catch {}
      delete updateTimeoutRef.current[key];
    }, 1500);
  };

  const handleSalvarLink = async () => {
    if (!linkUrl.trim()) return;
    const isOneDrive = linkUrl.includes("onedrive") || linkUrl.includes("sharepoint");
    const isGDrive = linkUrl.includes("drive.google") || linkUrl.includes("docs.google");
    const nome =
      linkNome.trim() ||
      (isOneDrive ? "Link OneDrive" : isGDrive ? "Link Google Drive" : "Link externo");
    await sigo.entities.ArquivoOportunidade.create({
      empresa_id: empresaAtiva.id,
      oportunidade_id: selectedOp.id,
      nome,
      url: linkUrl.trim(),
      tipo: "link",
      usuario_nome: user?.full_name || "",
    });
    setLinkUrl("");
    setLinkNome("");
    setShowAddLink(false);
    onReloadArquivos();
  };

  // Reset tab quando abre nova oportunidade
  const handleAbrirTransferencia = async () => {
    try {
      const vinculos = await sigo.entities.UsuarioEmpresa.filter({
        usuario_email: user.email,
        ativo: true,
      });
      const ids = vinculos.map((v) => v.empresa_id).filter((id) => id !== empresaAtiva.id);
      if (ids.length === 0) {
        alert("Você não tem acesso a outras empresas.");
        return;
      }
      const resultados = await Promise.all(
        ids.map((id) => sigo.entities.Empresa.filter({ id, ativo: true }))
      );
      setEmpresasDisponiveis(resultados.flat());
      setEmpresaSelecionada("");
      setShowTransferirEmpresa(true);
    } catch (e) {
      console.error("Erro ao buscar empresas:", e);
    }
  };

  const handleTransferir = async () => {
    if (!empresaSelecionada) return;
    setTransferindo(true);
    try {
      await sigo.entities.Oportunidade.update(selectedOp.id, { empresa_id: empresaSelecionada });
      setOportunidades((prev) => prev.filter((o) => o.id !== selectedOp.id));
      setShowTransferirEmpresa(false);
      handleOpenChange(false);
    } catch (e) {
      console.error("Erro ao transferir:", e);
    } finally {
      setTransferindo(false);
    }
  };

  const handleOpenChange = (val) => {
    if (!val) {
      setActiveTab("geral");
      setVisitedTabs(new Set(["geral"]));
      setShowPreviewArquivo(false);
      setArquivoPreview(null);
    }
    onOpenChange(val);
  };

  if (!open) return null;

  const currentStatus = selectedOp ? statusList.find((s) => s.id === selectedOp.status_id) : null;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          {!selectedOp ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-500">Carregando...</p>
            </div>
          ) : (
            <>
              <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0">
                <SheetHeader>
                  <div className="mb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <SheetTitle className="text-xl">
                            {selectedOp.nome || selectedOp.titulo}
                          </SheetTitle>
                          <button
                            onClick={() => handleOpenChange(false)}
                            className="ml-2 p-1 rounded-lg hover:bg-slate-100 text-slate-500 flex-shrink-0"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <p className="text-slate-500 mt-1 mb-4">
                          {selectedOp.cliente_nome || "Sem cliente"}
                        </p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="gap-2">
                                <Settings className="w-4 h-4" />
                                {"A\u00e7\u00f5es"}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56">
                              <DropdownMenuItem
                                onClick={() => {
                                  handleOpenChange(false);
                                  onOpenModal(selectedOp);
                                }}
                              >
                                <Edit className="w-4 h-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onShowClienteView(true)}>
                                <Eye className="w-4 h-4 mr-2" />
                                Ver como cliente
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onShowSalvarTemplate(true)}>
                                <Copy className="w-4 h-4 mr-2" />
                                Salvar como template
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  onOpenModal({
                                    ...selectedOp,
                                    nome: (selectedOp.nome || selectedOp.titulo) + " (c\u00f3pia)",
                                  });
                                  handleOpenChange(false);
                                }}
                              >
                                <FilePlus className="w-4 h-4 mr-2" />
                                Duplicar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={handleAbrirTransferencia}>
                                <Building2 className="w-4 h-4 mr-2" />
                                Transferir Empresa
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onShowStatusConfig(true)}>
                                <Settings className="w-4 h-4 mr-2" />
                                Gerenciar Status
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setPerdidoOpen(true)}
                                className="text-amber-700"
                              >
                                <X className="w-4 h-4 mr-2" />
                                Marcar como Perdido
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  onDelete(selectedOp);
                                  handleOpenChange(false);
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Dialog open={perdidoOpen} onOpenChange={setPerdidoOpen}>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle>Marcar como Perdido</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-3">
                                <Label>Motivo da perda</Label>
                                <Textarea
                                  value={motivoPerda}
                                  onChange={(e) => setMotivoPerda(e.target.value)}
                                  placeholder="Ex.: preço acima do teto, não habilitado, desistimos…"
                                  rows={3}
                                />
                                <div className="flex justify-end gap-2 pt-2">
                                  <Button variant="outline" onClick={() => setPerdidoOpen(false)}>
                                    Cancelar
                                  </Button>
                                  <Button
                                    onClick={handleMarcarPerdido}
                                    disabled={salvandoPerda}
                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                  >
                                    {salvandoPerda ? "Salvando…" : "Marcar Perdido"}
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>

                          <ResponsaveisSelect
                            // responsaveis_ids é JSONB: vem como array pelo
                            // supabase-js. Em registros legacy pode vir string —
                            // safeParseJSON aceita ambos.
                            responsaveisEmails={safeParseJSON(selectedOp.responsaveis_ids, [])}
                            usuarios={usuariosEmpresa}
                            onUpdate={async (newIds) => {
                              const novoValor = JSON.stringify(newIds);
                              setSelectedOp((prev) => ({ ...prev, responsaveis_ids: novoValor }));
                              setOportunidades((prev) =>
                                prev.map((o) =>
                                  o.id === selectedOp.id ? { ...o, responsaveis_ids: novoValor } : o
                                )
                              );
                              await sigo.entities.Oportunidade.update(selectedOp.id, {
                                responsaveis_ids: novoValor,
                              });
                            }}
                            buttonSize="h-9 w-9"
                          />

                          {currentStatus && (
                            <Badge
                              style={{
                                backgroundColor: currentStatus.cor + "20",
                                color: currentStatus.cor,
                                borderColor: currentStatus.cor,
                              }}
                              className="border text-sm"
                            >
                              {selectedOp.status_nome}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </SheetHeader>
              </div>

              <div className="p-6 flex-1 overflow-y-auto">
                <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-2">
                  <div className="overflow-x-auto -mx-6 px-6 pb-1">
                    <TabsList className="flex flex-nowrap gap-1 h-auto bg-slate-100 p-1 w-max min-w-full">
                      <TabsTrigger value="geral" className="flex-shrink-0 text-xs sm:text-sm">
                        Geral
                      </TabsTrigger>
                      {(perfil === "Admin" || temPermissao("Oportunidades", "Orcamento")) && (
                        <TabsTrigger value="orcamento" className="flex-shrink-0 text-xs sm:text-sm">
                          {"Or\u00e7amento"}
                        </TabsTrigger>
                      )}
                      {(perfil === "Admin" || temPermissao("Oportunidades", "Cronograma")) && (
                        <TabsTrigger value="obra" className="flex-shrink-0 text-xs sm:text-sm">
                          Planejamento
                        </TabsTrigger>
                      )}
                      {(perfil === "Admin" || temPermissao("Oportunidades", "Arquivos")) && (
                        <TabsTrigger value="arquivos" className="flex-shrink-0 text-xs sm:text-sm">
                          Arquivos
                        </TabsTrigger>
                      )}
                      <TabsTrigger value="anotacoes" className="flex-shrink-0 text-xs sm:text-sm">
                        {"Anota\u00e7\u00f5es"}
                      </TabsTrigger>
                      <TabsTrigger value="chat" className="flex-shrink-0 text-xs sm:text-sm">
                        Chat
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* ABA GERAL */}
                  <TabsContent value="geral" className="space-y-4 mt-4">
                    <PropostasOportunidade
                      oportunidadeId={selectedOp.id}
                      empresaAtiva={empresaAtiva}
                      user={user}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-500">Nome</Label>
                        <p className="font-medium text-slate-800 mt-1">
                          {selectedOp.nome || selectedOp.titulo}
                        </p>
                      </div>
                      <div>
                        <Label className="text-slate-500">Cliente</Label>
                        <p className="font-medium text-slate-800 mt-1">
                          {selectedOp.cliente_nome || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-slate-500">Valor Estimado</Label>
                        <p className="text-lg font-bold text-green-600 mt-1">
                          {podeVerValores ? formatCurrency(selectedOp.valor_estimado) : "-"}
                        </p>
                      </div>
                      <div>
                        <Label className="text-slate-500">Status</Label>
                        {currentStatus && (
                          <Badge style={{ backgroundColor: currentStatus.cor }} className="mt-1">
                            {selectedOp.status_nome}
                          </Badge>
                        )}
                      </div>
                      <div>
                        <Label className="text-slate-500">Origem</Label>
                        <p className="font-medium text-slate-800 mt-1">
                          {selectedOp.origem_nome || "-"}
                        </p>
                      </div>
                    </div>

                    {(selectedOp.licitacao_modalidade || selectedOp.licitacao_data) && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-slate-700 mb-3">
                          {"Dados da Licita\u00e7\u00e3o"}
                        </h4>
                        <div className="grid grid-cols-3 gap-4">
                          {selectedOp.licitacao_modalidade && (
                            <div>
                              <Label className="text-slate-500">Modalidade</Label>
                              <p className="font-medium text-blue-700 mt-1">
                                {formatModalidade(selectedOp.licitacao_modalidade)}
                              </p>
                            </div>
                          )}
                          {selectedOp.licitacao_data && (
                            <div>
                              <Label className="text-slate-500">Data</Label>
                              <p className="font-medium text-slate-800 mt-1">
                                {new Date(
                                  selectedOp.licitacao_data + "T00:00:00"
                                ).toLocaleDateString("pt-BR")}
                              </p>
                            </div>
                          )}
                          {selectedOp.licitacao_horario && (
                            <div>
                              <Label className="text-slate-500">{"Hor\u00e1rio"}</Label>
                              <p className="font-medium text-slate-800 mt-1">
                                {selectedOp.licitacao_horario}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {(selectedOp.cep || selectedOp.endereco) && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-slate-700 mb-3">
                          {"Endere\u00e7o da Obra"}
                        </h4>
                        <p className="text-sm text-slate-700">
                          {[
                            selectedOp.endereco,
                            selectedOp.numero,
                            selectedOp.complemento,
                            selectedOp.bairro,
                            selectedOp.cidade,
                            selectedOp.estado,
                            selectedOp.cep,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </div>
                    )}

                    {selectedOp.descricao && (
                      <div className="border-t pt-4">
                        <Label className="text-slate-500">{"Descri\u00e7\u00e3o"}</Label>
                        {/* React escapa HTML automaticamente; whitespace-pre-wrap
                            preserva quebras de linha sem precisar de <br/> manual.
                            ANTES: dangerouslySetInnerHTML deixava aberto pra XSS
                            se algum admin colasse HTML/script na descri\u00e7\u00e3o. */}
                        <div className="mt-2 p-4 bg-slate-50 rounded-lg max-w-none text-sm text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                          {selectedOp.descricao}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* ABA ORÇAMENTO */}
                  <TabsContent value="orcamento" className="mt-4 space-y-4">
                    {visitedTabs.has("orcamento") && (
                      <div className="space-y-4">
                        <input
                          ref={fileInputOrcamentoRef}
                          type="file"
                          className="hidden"
                          accept=".csv"
                          onChange={onImportarOrcamento}
                        />

                        {orcamentoItens.length > 0 && (
                          <div className="flex items-center justify-between gap-4 border-b pb-4 flex-wrap">
                            <div className="flex items-center gap-2">
                              {itensSelecionados.size > 0 && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="gap-1"
                                  onClick={onDeleteSelecionados}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Excluir {itensSelecionados.size}
                                </Button>
                              )}
                              <Select
                                value={filtroTipoOrcamento}
                                onValueChange={setFiltroTipoOrcamento}
                              >
                                <SelectTrigger className="w-[150px]">
                                  <SelectValue placeholder="Tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Todos</SelectItem>
                                  <SelectItem value="Material">Material</SelectItem>
                                  <SelectItem value="M\u00e3o de Obra">
                                    {"M\u00e3o de Obra"}
                                  </SelectItem>
                                  <SelectItem value="Ferramental">Ferramental</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center gap-2">
                              <PermissionGate
                                modulo="Oportunidades"
                                aba="Or\u00e7amento"
                                funcao="editar"
                              >
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="gap-2">
                                      <FileText className="w-4 h-4" />
                                      {"A\u00e7\u00f5es"}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem
                                      onClick={() => onShowSalvarTemplate(true)}
                                      className="gap-2"
                                    >
                                      <Copy className="w-4 h-4 text-purple-600" />
                                      Salvar como Template
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => onShowAplicarTemplate(true)}
                                      className="gap-2"
                                    >
                                      <Copy className="w-4 h-4 text-indigo-600" />
                                      Aplicar Template
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={onBaixarModelo} className="gap-2">
                                      <Download className="w-4 h-4 text-purple-600" />
                                      Baixar Modelo
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => fileInputOrcamentoRef.current?.click()}
                                      className="gap-2"
                                    >
                                      <Download className="w-4 h-4 text-blue-600" />
                                      Importar Planilha
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={onExportarExcel} className="gap-2">
                                      <FileText className="w-4 h-4 text-green-600" />
                                      Exportar Excel
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={onExportarPDF} className="gap-2">
                                      <FileText className="w-4 h-4 text-red-600" />
                                      Exportar PDF
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={onLimparOrcamento}
                                      className="gap-2 text-red-600"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      Apagar Lista Completa
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </PermissionGate>
                              <PermissionGate
                                modulo="Oportunidades"
                                aba="Or\u00e7amento"
                                funcao="gerar_pdf"
                              >
                                <Button
                                  variant="outline"
                                  onClick={() => onShowRelatoriosOrcamento(true)}
                                  className="gap-2"
                                >
                                  <FileText className="w-4 h-4" />
                                  {"Relat\u00f3rios"}
                                </Button>
                              </PermissionGate>
                            </div>
                          </div>
                        )}

                        {orcamentoItens.length === 0 ? (
                          <div className="text-center py-16">
                            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
                              <FileSpreadsheet className="w-10 h-10 text-blue-600" />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-800 mb-3">
                              {"Novo or\u00e7amento"}
                            </h3>
                            <p className="text-slate-500 mb-8">
                              {"Crie ou importe um or\u00e7amento"}
                            </p>
                            <div className="grid grid-cols-3 gap-6 max-w-2xl mx-auto">
                              {[
                                {
                                  tipo: "zero",
                                  icon: FilePlus,
                                  color: "blue",
                                  label: "Começar do zero",
                                },
                                {
                                  tipo: "modelo",
                                  icon: Copy,
                                  color: "purple",
                                  label: "Utilizar modelo",
                                },
                                {
                                  tipo: "importar",
                                  icon: Upload,
                                  color: "green",
                                  label: "Importar",
                                },
                              ].map(({ tipo, icon: IconComp, color, label }) => (
                                <Card
                                  key={tipo}
                                  className={`cursor-pointer hover:shadow-lg transition-all group`}
                                  onClick={() => onNovoOrcamentoSelect(tipo)}
                                >
                                  <CardContent className="p-8 flex flex-col items-center text-center">
                                    <div
                                      className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4`}
                                      style={{
                                        backgroundColor:
                                          color === "blue"
                                            ? "#eff6ff"
                                            : color === "purple"
                                              ? "#f5f3ff"
                                              : "#f0fdf4",
                                      }}
                                    >
                                      <IconComp
                                        className={`w-8 h-8`}
                                        style={{
                                          color:
                                            color === "blue"
                                              ? "#2563eb"
                                              : color === "purple"
                                                ? "#7c3aed"
                                                : "#16a34a",
                                        }}
                                      />
                                    </div>
                                    <h3 className="font-semibold text-slate-800">{label}</h3>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="border rounded-lg overflow-auto">
                            <table className="w-full" style={{ tableLayout: "auto" }}>
                              <thead className="bg-slate-100 border-b-2">
                                <tr>
                                  <th className="px-3 py-2 w-8">
                                    <input
                                      type="checkbox"
                                      checked={
                                        orcamentoItens.filter(
                                          (i) =>
                                            filtroTipoOrcamento === "all" ||
                                            i.tipo === filtroTipoOrcamento
                                        ).length > 0 &&
                                        orcamentoItens
                                          .filter(
                                            (i) =>
                                              filtroTipoOrcamento === "all" ||
                                              i.tipo === filtroTipoOrcamento
                                          )
                                          .every((i) => itensSelecionados.has(i.id))
                                      }
                                      onChange={(e) => {
                                        const vis = orcamentoItens.filter(
                                          (i) =>
                                            filtroTipoOrcamento === "all" ||
                                            i.tipo === filtroTipoOrcamento
                                        );
                                        setItensSelecionados(
                                          e.target.checked
                                            ? new Set(vis.map((i) => i.id))
                                            : new Set()
                                        );
                                      }}
                                    />
                                  </th>
                                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-700">
                                    {"N\u00ba"}
                                  </th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700 min-w-[300px]">
                                    {"Descri\u00e7\u00e3o"}
                                  </th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700">
                                    {"C\u00f3digo"}
                                  </th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700">
                                    Unid.
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">
                                    Qtd
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">
                                    Vlr Unit.
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">
                                    BDI %
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">
                                    Imp. %
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">
                                    Vlr Total
                                  </th>
                                  <th className="w-12"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {orcamentoItens
                                  .filter(
                                    (item) =>
                                      filtroTipoOrcamento === "all" ||
                                      item.tipo === filtroTipoOrcamento
                                  )
                                  .map((item, index) => {
                                    const podeEditar =
                                      perfil === "Admin" ||
                                      !item.created_by ||
                                      item.created_by === user?.email;
                                    return (
                                      <tr
                                        key={item.id}
                                        className={`border-b hover:bg-slate-50 ${itensSelecionados.has(item.id) ? "bg-amber-50" : ""}`}
                                      >
                                        <td className="px-3 py-2 text-center">
                                          <input
                                            type="checkbox"
                                            checked={itensSelecionados.has(item.id)}
                                            onChange={(e) => {
                                              const n = new Set(itensSelecionados);
                                              e.target.checked ? n.add(item.id) : n.delete(item.id);
                                              setItensSelecionados(n);
                                            }}
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-center text-xs text-slate-500">
                                          {index + 1}
                                        </td>
                                        <td className="px-3 py-2 min-w-[300px]">
                                          <div className="relative">
                                            <Input
                                              className="h-8 text-xs"
                                              value={
                                                editingItemId === item.id
                                                  ? (editingValues.descricao ?? item.descricao)
                                                  : item.descricao || ""
                                              }
                                              onFocus={() => {
                                                if (podeEditar) {
                                                  setEditingItemId(item.id);
                                                  setEditingValues(item);
                                                  setItemSearchTerm(item.descricao || "");
                                                }
                                              }}
                                              onChange={(e) => {
                                                setEditingValues({
                                                  ...editingValues,
                                                  descricao: e.target.value,
                                                });
                                                setItemSearchTerm(e.target.value);
                                                setShowSuggestions(true);
                                              }}
                                              onBlur={() => {
                                                setTimeout(() => {
                                                  setShowSuggestions(false);
                                                  if (
                                                    editingItemId === item.id &&
                                                    editingValues.descricao !== item.descricao
                                                  ) {
                                                    handleUpdateItem(
                                                      item.id,
                                                      "descricao",
                                                      editingValues.descricao
                                                    );
                                                  }
                                                  setEditingItemId(null);
                                                }, 200);
                                              }}
                                              placeholder={
                                                podeEditar
                                                  ? "Clique para editar..."
                                                  : "Sem permissão"
                                              }
                                              disabled={!podeEditar}
                                              readOnly={editingItemId !== item.id}
                                            />
                                            {editingItemId === item.id &&
                                              showSuggestions &&
                                              itemSearchTerm &&
                                              (() => {
                                                const filtered = materiais.filter(
                                                  (m) =>
                                                    m.nome_item
                                                      ?.toLowerCase()
                                                      .includes(itemSearchTerm.toLowerCase()) ||
                                                    m.codigo
                                                      ?.toLowerCase()
                                                      .includes(itemSearchTerm.toLowerCase())
                                                );
                                                if (filtered.length === 0) return null;
                                                return (
                                                  <div className="absolute top-full left-0 z-50 bg-white border rounded-lg shadow-lg max-h-[250px] overflow-y-auto mt-1 w-full">
                                                    {filtered.slice(0, 20).map((m) => (
                                                      <button
                                                        key={m.id}
                                                        type="button"
                                                        className="w-full text-left px-3 py-2 text-xs border-b hover:bg-slate-100"
                                                        onMouseDown={async (e) => {
                                                          e.preventDefault();
                                                          const valorUnitario =
                                                            m.preco_referencia ||
                                                            m.preco ||
                                                            m.preco_medio ||
                                                            0;
                                                          const updatedItem = {
                                                            ...item,
                                                            descricao: m.nome_item,
                                                            codigo: m.codigo || "",
                                                            unidade: m.unidade || "UN",
                                                            valor_unitario: valorUnitario,
                                                          };
                                                          setOrcamentoItens((prev) =>
                                                            prev.map((i) =>
                                                              i.id === item.id ? updatedItem : i
                                                            )
                                                          );
                                                          setShowSuggestions(false);
                                                          setEditingItemId(null);
                                                          await sigo.entities.OrcamentoItem.update(
                                                            item.id,
                                                            updatedItem
                                                          );
                                                        }}
                                                      >
                                                        <div className="font-medium text-slate-800">
                                                          {m.nome_item}
                                                        </div>
                                                        {m.codigo && (
                                                          <div className="text-slate-500">
                                                            {"C\u00f3digo"}: {m.codigo}
                                                          </div>
                                                        )}
                                                      </button>
                                                    ))}
                                                  </div>
                                                );
                                              })()}
                                          </div>
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            className="h-8 text-xs"
                                            value={item.codigo || ""}
                                            disabled={!podeEditar}
                                            onChange={(e) =>
                                              setOrcamentoItens((prev) =>
                                                prev.map((i) =>
                                                  i.id === item.id
                                                    ? { ...i, codigo: e.target.value }
                                                    : i
                                                )
                                              )
                                            }
                                            onBlur={(e) =>
                                              handleUpdateItem(item.id, "codigo", e.target.value)
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            className="h-8 text-xs"
                                            value={item.unidade || ""}
                                            disabled={!podeEditar}
                                            onChange={(e) =>
                                              setOrcamentoItens((prev) =>
                                                prev.map((i) =>
                                                  i.id === item.id
                                                    ? { ...i, unidade: e.target.value }
                                                    : i
                                                )
                                              )
                                            }
                                            onBlur={(e) =>
                                              handleUpdateItem(item.id, "unidade", e.target.value)
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            type="number"
                                            className="h-8 text-xs"
                                            value={item.quantidade || 0}
                                            disabled={!podeEditar}
                                            onChange={(e) => {
                                              const v = parseFloat(e.target.value) || 0;
                                              const u = {
                                                ...item,
                                                quantidade: v,
                                                valor_total:
                                                  v *
                                                  (item.valor_unitario || 0) *
                                                  (1 + (item.bdi || 0) / 100) *
                                                  (1 + (item.imposto || 0) / 100),
                                              };
                                              setOrcamentoItens((prev) =>
                                                prev.map((i) => (i.id === item.id ? u : i))
                                              );
                                            }}
                                            onBlur={(e) =>
                                              handleUpdateItem(
                                                item.id,
                                                "quantidade",
                                                e.target.value
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            type="number"
                                            className="h-8 text-xs"
                                            value={item.valor_unitario || 0}
                                            disabled={!podeEditar}
                                            onChange={(e) => {
                                              const v = parseFloat(e.target.value) || 0;
                                              const u = {
                                                ...item,
                                                valor_unitario: v,
                                                valor_total:
                                                  (item.quantidade || 0) *
                                                  v *
                                                  (1 + (item.bdi || 0) / 100) *
                                                  (1 + (item.imposto || 0) / 100),
                                              };
                                              setOrcamentoItens((prev) =>
                                                prev.map((i) => (i.id === item.id ? u : i))
                                              );
                                            }}
                                            onBlur={(e) =>
                                              handleUpdateItem(
                                                item.id,
                                                "valor_unitario",
                                                e.target.value
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            type="number"
                                            className="h-8 text-xs"
                                            value={item.bdi || 0}
                                            disabled={!podeEditar}
                                            onChange={(e) => {
                                              const v = parseFloat(e.target.value) || 0;
                                              const u = {
                                                ...item,
                                                bdi: v,
                                                valor_total:
                                                  (item.quantidade || 0) *
                                                  (item.valor_unitario || 0) *
                                                  (1 + v / 100) *
                                                  (1 + (item.imposto || 0) / 100),
                                              };
                                              setOrcamentoItens((prev) =>
                                                prev.map((i) => (i.id === item.id ? u : i))
                                              );
                                            }}
                                            onBlur={(e) =>
                                              handleUpdateItem(item.id, "bdi", e.target.value)
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            type="number"
                                            className="h-8 text-xs"
                                            value={item.imposto || 0}
                                            disabled={!podeEditar}
                                            onChange={(e) => {
                                              const v = parseFloat(e.target.value) || 0;
                                              const u = {
                                                ...item,
                                                imposto: v,
                                                valor_total:
                                                  (item.quantidade || 0) *
                                                  (item.valor_unitario || 0) *
                                                  (1 + (item.bdi || 0) / 100) *
                                                  (1 + v / 100),
                                              };
                                              setOrcamentoItens((prev) =>
                                                prev.map((i) => (i.id === item.id ? u : i))
                                              );
                                            }}
                                            onBlur={(e) =>
                                              handleUpdateItem(item.id, "imposto", e.target.value)
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <span className="text-xs font-medium text-green-700 whitespace-nowrap">
                                            {formatCurrency(item.valor_total)}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => onDeleteOrcamentoItem(item.id)}
                                            disabled={!podeEditar}
                                          >
                                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                          </Button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                              <tfoot className="bg-slate-100 border-t-2">
                                <tr>
                                  <td colSpan={2} className="px-3 py-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="gap-1 text-xs text-blue-600 hover:text-blue-800"
                                      onClick={() => onNovoOrcamentoSelect("zero")}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      Novo item
                                    </Button>
                                  </td>
                                  <td
                                    colSpan={7}
                                    className="px-3 py-3 text-right font-semibold text-sm"
                                  >
                                    Total:
                                  </td>
                                  <td className="px-3 py-3 font-bold text-green-600 text-sm">
                                    {formatCurrency(
                                      orcamentoItens
                                        .filter(
                                          (i) =>
                                            filtroTipoOrcamento === "all" ||
                                            i.tipo === filtroTipoOrcamento
                                        )
                                        .reduce((s, i) => s + (i.valor_total || 0), 0)
                                    )}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  {/* ABA PLANEJAMENTO */}
                  <TabsContent value="obra" className="space-y-4 mt-4">
                    {visitedTabs.has("obra") && (
                      <DiarioObraTab
                        projetoId={selectedOp.id}
                        empresaAtiva={empresaAtiva}
                        usuariosEmpresa={usuariosEmpresa}
                        showOnlyTasks={true}
                      />
                    )}
                  </TabsContent>

                  {/* ABA ARQUIVOS */}
                  <TabsContent value="arquivos" className="space-y-4 mt-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-slate-800">Arquivos</h3>
                      <div className="flex gap-2">
                        <input
                          ref={fileInputArquivosRef}
                          type="file"
                          className="hidden"
                          onChange={onUploadFile}
                          accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowAddLink(true)}
                          className="gap-2"
                        >
                          <Link2 className="w-4 h-4" /> Adicionar Link
                        </Button>
                        <Button
                          size="sm"
                          disabled={uploadingFile}
                          onClick={() => fileInputArquivosRef.current?.click()}
                          className="gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          {uploadingFile ? "Enviando..." : "Upload"}
                        </Button>
                      </div>
                    </div>

                    {showAddLink && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                        <p className="text-sm font-medium text-blue-800">
                          Adicionar Link (OneDrive, Google Drive, etc.)
                        </p>
                        <Input
                          placeholder="URL do arquivo (ex: https://drive.google.com/...)"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                        />
                        <Input
                          placeholder="Nome do arquivo (opcional)"
                          value={linkNome}
                          onChange={(e) => setLinkNome(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleSalvarLink}
                            disabled={!linkUrl.trim()}
                            className="gap-2"
                          >
                            <Check className="w-4 h-4" /> Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setShowAddLink(false);
                              setLinkUrl("");
                              setLinkNome("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      {arquivos.map((arq) => {
                        const isLink = arq.tipo === "link";
                        const isPdf =
                          !isLink &&
                          (arq.tipo?.includes("pdf") || arq.nome?.toLowerCase().endsWith(".pdf"));
                        const isImage =
                          !isLink &&
                          (arq.tipo?.includes("image") ||
                            /\.(jpg|jpeg|png|gif|webp)$/i.test(arq.nome));
                        const canPreview = isPdf || isImage;
                        const isOneDrive =
                          isLink &&
                          (arq.url?.includes("onedrive") || arq.url?.includes("sharepoint"));
                        const isGDrive =
                          isLink &&
                          (arq.url?.includes("drive.google") || arq.url?.includes("docs.google"));
                        return (
                          <div
                            key={arq.id}
                            className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              {isImage ? (
                                <div className="w-12 h-12 rounded overflow-hidden bg-slate-200">
                                  <img
                                    src={arq.url}
                                    alt={arq.nome}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : isLink ? (
                                <div
                                  className={`w-12 h-12 rounded flex items-center justify-center ${isOneDrive ? "bg-blue-100" : isGDrive ? "bg-green-100" : "bg-slate-200"}`}
                                >
                                  <Link2
                                    className={`w-6 h-6 ${isOneDrive ? "text-blue-600" : isGDrive ? "text-green-600" : "text-slate-600"}`}
                                  />
                                </div>
                              ) : (
                                <div
                                  className={`w-12 h-12 rounded flex items-center justify-center ${isPdf ? "bg-red-100" : "bg-slate-200"}`}
                                >
                                  <FileText
                                    className={`w-6 h-6 ${isPdf ? "text-red-600" : "text-slate-600"}`}
                                  />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-slate-800">{arq.nome}</p>
                                {isLink && (
                                  <p className="text-xs text-blue-500 truncate max-w-[200px]">
                                    {arq.url}
                                  </p>
                                )}
                                <p className="text-xs text-slate-500">
                                  {arq.usuario_nome} •{" "}
                                  {new Date(arq.created_date).toLocaleDateString("pt-BR")}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {isLink && (
                                <Button
                                  size="icon"
                                  className="h-8 w-8 bg-blue-500 hover:bg-blue-600 text-white"
                                  onClick={() => window.open(arq.url, "_blank")}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </Button>
                              )}
                              {canPreview && (
                                <Button
                                  size="icon"
                                  className="h-8 w-8 bg-green-500 hover:bg-green-600 text-white"
                                  onClick={() => {
                                    setArquivoPreview({ url: arq.url, nome: arq.nome });
                                    setShowPreviewArquivo(true);
                                  }}
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDeleteArquivo(arq.id)}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      {arquivos.length === 0 && (
                        <div className="text-center py-12 text-slate-500">
                          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>Nenhum arquivo enviado</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* ABA ANOTAÇÕES */}
                  <TabsContent value="anotacoes" className="space-y-4 mt-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder={"Adicionar anota\u00e7\u00e3o..."}
                        value={novaNota}
                        onChange={(e) => setNovaNota(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && onAddNota()}
                      />
                      <Button onClick={onAddNota} disabled={!novaNota.trim()}>
                        Adicionar
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {atualizacoes.map((atualiz) => (
                        <div key={atualiz.id} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${atualiz.tipo === "Status" ? "bg-blue-100" : atualiz.tipo === "Sistema" ? "bg-slate-200" : "bg-amber-100"}`}
                          >
                            {atualiz.tipo === "Status" ? (
                              <Target className="w-4 h-4 text-blue-600" />
                            ) : atualiz.tipo === "Sistema" ? (
                              <Calendar className="w-4 h-4 text-slate-600" />
                            ) : (
                              <User className="w-4 h-4 text-amber-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-slate-800">{atualiz.descricao}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {atualiz.usuario_nome} •{" "}
                              {new Date(atualiz.created_date).toLocaleString("pt-BR")}
                            </p>
                          </div>
                        </div>
                      ))}
                      {atualizacoes.length === 0 && (
                        <div className="text-center py-12 text-slate-500">
                          <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>{"Nenhuma anota\u00e7\u00e3o"}</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* ABA CHAT */}
                  <TabsContent value="chat" className="mt-4">
                    {visitedTabs.has("chat") && (
                      <ChatContextual
                        tipo="Oportunidade"
                        contextoId={selectedOp.id}
                        contextoNome={selectedOp.nome || selectedOp.titulo}
                        empresaAtiva={empresaAtiva}
                        user={user}
                      />
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Modal Transferir Empresa */}
      <Dialog open={showTransferirEmpresa} onOpenChange={setShowTransferirEmpresa}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir para outra empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-500">
              Selecione a empresa de destino. A oportunidade <strong>{selectedOp?.nome}</strong>{" "}
              será movida e não aparecerá mais na empresa atual.
            </p>
            <Select value={empresaSelecionada} onValueChange={setEmpresaSelecionada}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa..." />
              </SelectTrigger>
              <SelectContent className="z-[9999]" position="popper">
                {empresasDisponiveis.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.razao_social || e.nome_fantasia || e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowTransferirEmpresa(false)}>
                Cancelar
              </Button>
              <Button onClick={handleTransferir} disabled={!empresaSelecionada || transferindo}>
                {transferindo ? "Transferindo..." : "Transferir"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <VisualizarArquivoModal
        arquivo={arquivoPreview}
        open={showPreviewArquivo}
        onOpenChange={(val) => {
          setShowPreviewArquivo(val);
          if (!val) setArquivoPreview(null);
        }}
      />
    </>
  );
}
