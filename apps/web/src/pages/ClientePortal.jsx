import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar,
  DollarSign,
  Building2,
  AlertCircle,
  LayoutDashboard,
  FileText,
  MessageSquare,
  Folder,
  StickyNote,
  BookOpen,
  LogOut,
  Upload,
  Eye,
  Download,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import RelatorioObra from "@/components/cliente/RelatorioObra";
import AnexoViewer from "@/components/shared/AnexoViewer";

export default function ClientePortal() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tokenData, setTokenData] = useState(null);
  const [oportunidade, setOportunidade] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [orcamentoItens, setOrcamentoItens] = useState([]);
  const [cronogramaEtapas, setCronogramaEtapas] = useState([]);
  const [abasLiberadas, setAbasLiberadas] = useState({ orcamento: false, obra: false });
  const [activeTab, setActiveTab] = useState("obra");
  const [arquivos, setArquivos] = useState([]);
  const [anotacoes, setAnotacoes] = useState([]);
  const [novaAnotacao, setNovaAnotacao] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [diarios, setDiarios] = useState([]);
  const [showBanner, setShowBanner] = useState(true);
  const [anexoVisualizacao, setAnexoVisualizacao] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const urlParams = new URLSearchParams(window.location.hash.split("?")[1]);
      const token = urlParams.get("token");

      let clienteInfo;
      let isVisualizacao = false;

      // MODO 1: Preview (visualização interna pelo sistema - SEM RESTRIÇÕES)
      if (token && token.startsWith("preview_")) {
        const projetoId = token.replace("preview_", "");

        // Buscar projeto para pegar empresa_id
        const projetos = await sigo.entities.Projeto.filter({ id: projetoId });
        if (projetos.length === 0) {
          const ops = await sigo.entities.Oportunidade.filter({ id: projetoId });
          if (ops.length === 0) {
            setError("Projeto não encontrado.");
            setLoading(false);
            return;
          }
          clienteInfo = {
            empresa_id: ops[0].empresa_id,
            oportunidade_id: projetoId,
            email_cliente: "preview@sistema.com",
          };
        } else {
          clienteInfo = {
            empresa_id: projetos[0].empresa_id,
            oportunidade_id: projetoId,
            email_cliente: "preview@sistema.com",
          };
        }

        setAbasLiberadas({ orcamento: true, obra: true });
        isVisualizacao = true;
      }
      // MODO 2: Acesso por token de cliente
      else if (token) {
        const tokens = await sigo.entities.TokenClienteOportunidade.filter({
          token,
          ativo: true,
        });

        if (tokens.length === 0) {
          setError("Link inválido ou expirado.");
          setLoading(false);
          return;
        }

        const tokenInfo = tokens[0];

        const hoje = new Date();
        const expira = new Date(tokenInfo.expira_em);
        if (expira < hoje) {
          setError("Este link expirou. Solicite um novo link.");
          setLoading(false);
          return;
        }

        clienteInfo = {
          empresa_id: tokenInfo.empresa_id,
          oportunidade_id: tokenInfo.oportunidade_id,
          email_cliente: tokenInfo.email_cliente,
        };

        const abas = safeParseJSON(tokenInfo.abas_liberadas, {});
        setAbasLiberadas(abas);
        isVisualizacao = true;
      }
      // MODO 3: Acesso por login de cliente (UsuarioEmpresa com perfil Cliente)
      else {
        const customAuth = sessionStorage.getItem("custom_auth");
        if (!customAuth) {
          setError("Você precisa fazer login para acessar o portal.");
          setLoading(false);
          return;
        }

        const userData = safeParseJSON(customAuth, {});

        // Buscar vínculo do usuário
        const vinculos = await sigo.entities.UsuarioEmpresa.filter({
          empresa_id: userData.empresa_id,
          usuario_email: userData.email,
          perfil: "Cliente",
          ativo: true,
        });

        if (vinculos.length === 0 || !vinculos[0].projeto_id) {
          setError("Nenhum projeto vinculado a este usuário.");
          setLoading(false);
          return;
        }

        const vinculo = vinculos[0];

        clienteInfo = {
          empresa_id: userData.empresa_id,
          oportunidade_id: vinculo.projeto_id,
          email_cliente: userData.email,
        };

        setAbasLiberadas({ orcamento: true, obra: true });
      }

      setTokenData(clienteInfo);
      setShowBanner(isVisualizacao);

      // Carregar empresa
      const emp = await sigo.entities.Empresa.filter({ id: clienteInfo.empresa_id });
      if (emp.length === 0) {
        setError("Empresa não encontrada.");
        setLoading(false);
        return;
      }
      setEmpresa(emp[0]);

      // Tentar carregar como Projeto primeiro, se não encontrar, busca como Oportunidade
      let projeto = await sigo.entities.Projeto.filter({ id: clienteInfo.oportunidade_id });
      let oportunidadeData = null;

      if (projeto.length > 0) {
        oportunidadeData = projeto[0];
      } else {
        const op = await sigo.entities.Oportunidade.filter({ id: clienteInfo.oportunidade_id });
        if (op.length === 0) {
          setError("Projeto não encontrado.");
          setLoading(false);
          return;
        }
        oportunidadeData = op[0];
      }

      setOportunidade(oportunidadeData);

      // Carregar orçamento (tenta projeto_id primeiro, depois oportunidade_id)
      let itens = await sigo.entities.OrcamentoItem.filter({
        empresa_id: clienteInfo.empresa_id,
        projeto_id: clienteInfo.oportunidade_id,
      });

      if (itens.length === 0) {
        itens = await sigo.entities.OrcamentoItem.filter({
          empresa_id: clienteInfo.empresa_id,
          oportunidade_id: clienteInfo.oportunidade_id,
        });
      }
      setOrcamentoItens(itens.sort((a, b) => a.ordem - b.ordem));

      // Carregar cronograma
      let etapas = await sigo.entities.CronogramaEtapa.filter({
        empresa_id: clienteInfo.empresa_id,
        projeto_id: clienteInfo.oportunidade_id,
      });

      if (etapas.length === 0) {
        etapas = await sigo.entities.CronogramaEtapa.filter({
          empresa_id: clienteInfo.empresa_id,
          oportunidade_id: clienteInfo.oportunidade_id,
        });
      }
      setCronogramaEtapas(etapas.sort((a, b) => a.ordem - b.ordem));

      // Carregar arquivos
      let arqs = await sigo.entities.ArquivoOportunidade.filter({
        empresa_id: clienteInfo.empresa_id,
        projeto_id: clienteInfo.oportunidade_id,
      });

      if (arqs.length === 0) {
        arqs = await sigo.entities.ArquivoOportunidade.filter({
          empresa_id: clienteInfo.empresa_id,
          oportunidade_id: clienteInfo.oportunidade_id,
        });
      }
      setArquivos(arqs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));

      // Carregar anotações
      let notas = await sigo.entities.OportunidadeAtualizacao.filter({
        empresa_id: clienteInfo.empresa_id,
        projeto_id: clienteInfo.oportunidade_id,
        tipo: "Nota",
      });

      if (notas.length === 0) {
        notas = await sigo.entities.OportunidadeAtualizacao.filter({
          empresa_id: clienteInfo.empresa_id,
          oportunidade_id: clienteInfo.oportunidade_id,
          tipo: "Nota",
        });
      }
      setAnotacoes(notas.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));

      // Carregar diários de obra
      const diario = await sigo.entities.DiarioObra.filter({
        empresa_id: clienteInfo.empresa_id,
        projeto_id: clienteInfo.oportunidade_id,
      });
      setDiarios(diario.sort((a, b) => new Date(b.data) - new Date(a.data)));
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      setError("Erro ao carregar informações. Tente novamente mais tarde.");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const uploadResult = await sigo.integrations.Core.UploadFile({ file });
      const fileUrl = uploadResult.file_url || uploadResult.url || uploadResult;

      await sigo.entities.ArquivoOportunidade.create({
        empresa_id: tokenData.empresa_id,
        oportunidade_id: tokenData.oportunidade_id,
        nome: file.name,
        url: fileUrl,
        tipo: file.type,
        tamanho: file.size,
        usuario_nome: tokenData.email_cliente || "Cliente",
        enviado_por_cliente: true,
      });

      await loadData();
      e.target.value = "";
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      alert("Erro ao fazer upload do arquivo");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleAddAnotacao = async () => {
    if (!novaAnotacao.trim()) return;

    await sigo.entities.OportunidadeAtualizacao.create({
      empresa_id: tokenData.empresa_id,
      oportunidade_id: tokenData.oportunidade_id,
      usuario_id: null,
      usuario_nome: tokenData.email_cliente || "Cliente",
      tipo: "Nota",
      descricao: novaAnotacao,
    });

    setNovaAnotacao("");
    await loadData();
  };

  const handleSairModo = () => {
    if (confirm("Deseja sair do portal?")) {
      sessionStorage.clear();
      window.location.href = "/EntrarSistema";
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Carregando informações...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Negado</h2>
            <p className="text-slate-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "orcamento", label: "Orçamento", icon: DollarSign },
    { id: "obra", label: "Obra", icon: Calendar },
    { id: "diario", label: "Diário de Obra", icon: BookOpen },
    { id: "arquivos", label: "Arquivos", icon: Folder },
    { id: "anotacoes", label: "Anotações", icon: StickyNote },
    { id: "chat", label: "Chat", icon: MessageSquare },
  ];

  const getClimaIcon = (clima) => {
    const emojis = {
      Sol: "☀️",
      Nublado: "☁️",
      Chuva: "🌧️",
      Vento: "💨",
    };
    return emojis[clima] || "☀️";
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b">
          {empresa?.logo_url ? (
            <img src={empresa.logo_url} alt={empresa.nome} className="h-10 object-contain" />
          ) : (
            <h2 className="text-xl font-bold text-blue-600">vobi</h2>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left",
                activeTab === item.id
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <item.icon
                className={cn(
                  "w-5 h-5",
                  activeTab === item.id ? "text-blue-600" : "text-slate-400"
                )}
              />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t">
          <p className="text-xs text-slate-500 mb-2">Projeto</p>
          <p className="text-sm font-medium text-slate-800 truncate">{oportunidade?.nome}</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Top Banner */}
        {showBanner ? (
          <div className="bg-blue-600 text-white px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">
                Você está visualizando como seu cliente vê. Saia desse modo para poder fazer
                alterações no projeto
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                onClick={() => window.close()}
              >
                Sair deste modo
              </Button>
              <button
                onClick={() => setShowBanner(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-blue-600 text-white px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              <span className="text-sm font-medium">Portal do Cliente - {oportunidade?.nome}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              onClick={handleSairModo}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        )}

        {/* Header */}
        <header className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                {activeTab === "dashboard" && "Dashboard"}
                {activeTab === "orcamento" && "Orçamento"}
                {activeTab === "obra" && "Obra"}
                {activeTab === "diario" && "Diário de Obra"}
                {activeTab === "arquivos" && "Arquivos"}
                {activeTab === "anotacoes" && "Anotações"}
                {activeTab === "chat" && "Chat"}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" className="gap-2">
                <Eye className="w-4 h-4" />
                Como funciona
              </Button>
              <Badge variant="outline" className="text-sm">
                Primeiro passo
              </Badge>
              <Button className="bg-blue-600 hover:bg-blue-700">
                Projeto: {oportunidade?.nome}
              </Button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-auto">
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Bem-vindo ao Portal do Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm text-slate-500 mb-2">Valor do Projeto</p>
                        <p className="text-2xl font-bold text-green-600">
                          {formatCurrency(oportunidade?.valor_estimado || 0)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm text-slate-500 mb-2">Etapas Concluídas</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {cronogramaEtapas.filter((e) => e.status === "Concluída").length} /{" "}
                          {cronogramaEtapas.length}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm text-slate-500 mb-2">Progresso Geral</p>
                        <p className="text-2xl font-bold text-amber-600">
                          {cronogramaEtapas.length > 0
                            ? Math.round(
                                cronogramaEtapas.reduce(
                                  (s, e) => s + (e.percentual_conclusao || 0),
                                  0
                                ) / cronogramaEtapas.length
                              )
                            : 0}
                          %
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "orcamento" && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Orçamento Detalhado</CardTitle>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Valor Total</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(orcamentoItens.reduce((s, i) => s + (i.valor_total || 0), 0))}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-auto">
                  <table className="w-full">
                    <thead className="bg-slate-100 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                          Nº
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                          Código
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                          Descrição
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                          Unid.
                        </th>
                        <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                          Qtd
                        </th>
                        <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                          Vlr Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {orcamentoItens.map((item, index) => (
                        <tr key={item.id} className="border-b last:border-b-0 hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm text-slate-500">{index + 1}</td>
                          <td className="px-4 py-3 text-sm font-mono text-blue-600">
                            {item.codigo || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-800">{item.descricao}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{item.unidade}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right">
                            {item.quantidade}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-green-600 text-right">
                            {formatCurrency(item.valor_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t-2">
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-4 text-right font-semibold text-slate-800"
                        >
                          Total Geral:
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-green-600 text-lg">
                          {formatCurrency(
                            orcamentoItens.reduce((s, i) => s + (i.valor_total || 0), 0)
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "obra" && (
            <RelatorioObra
              etapas={cronogramaEtapas}
              oportunidade={oportunidade}
              empresa={empresa}
            />
          )}

          {activeTab === "diario" && (
            <div className="space-y-4">
              {diarios.map((diario) => {
                const fotosData = safeParseJSON(diario.fotos, []);
                const maoDeObraData = safeParseJSON(diario.mao_de_obra, []);

                return (
                  <Card key={diario.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Calendar className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-800">
                            {new Date(diario.data).toLocaleDateString("pt-BR", {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-2xl">{getClimaIcon(diario.clima)}</span>
                            <span className="text-sm text-slate-600">{diario.clima}</span>
                            {diario.temperatura && (
                              <Badge variant="outline">{diario.temperatura}°C</Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium text-slate-600 mb-1">
                            Atividades Realizadas
                          </p>
                          <p className="text-slate-800 whitespace-pre-wrap">{diario.atividades}</p>
                        </div>

                        {diario.observacoes && (
                          <div>
                            <p className="text-sm font-medium text-slate-600 mb-1">Observações</p>
                            <p className="text-slate-700">{diario.observacoes}</p>
                          </div>
                        )}

                        {maoDeObraData.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-slate-600 mb-2">Mão de Obra</p>
                            <div className="flex flex-wrap gap-2">
                              {maoDeObraData.map((m, idx) => (
                                <Badge key={idx} variant="outline" className="bg-blue-50">
                                  {m.nome} - {m.quantidade}{" "}
                                  {m.quantidade > 1 ? "pessoas" : "pessoa"}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {fotosData.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-slate-600 mb-2">Fotos</p>
                            <div className="grid grid-cols-4 gap-2">
                              {fotosData.map((foto, idx) => (
                                <img
                                  key={idx}
                                  src={foto}
                                  alt={`Foto ${idx + 1}`}
                                  className="w-full h-32 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => window.open(foto, "_blank")}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {diarios.length === 0 && (
                <Card>
                  <CardContent className="text-center py-12 text-slate-500">
                    <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhum registro no diário de obra</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {activeTab === "arquivos" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <input
                  type="file"
                  className="hidden"
                  id="upload-arquivo-cliente"
                  onChange={handleUploadFile}
                />
                <Button
                  onClick={() => document.getElementById("upload-arquivo-cliente").click()}
                  disabled={uploadingFile}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <Upload className="w-4 h-4" />
                  {uploadingFile ? "Enviando..." : "Adicionar arquivo"}
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {arquivos.map((arquivo) => (
                  <Card key={arquivo.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{arquivo.nome}</p>
                            <p className="text-xs text-slate-500">
                              {arquivo.usuario_nome} •{" "}
                              {new Date(arquivo.created_date).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setAnexoVisualizacao(arquivo)}
                            title="Visualizar"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(arquivo.url, "_blank")}
                            title="Baixar"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {arquivos.length === 0 && (
                  <Card>
                    <CardContent className="text-center py-12 text-slate-500">
                      <Folder className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Nenhum arquivo disponível</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {activeTab === "anotacoes" && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex gap-2">
                    <Textarea
                      value={novaAnotacao}
                      onChange={(e) => setNovaAnotacao(e.target.value)}
                      placeholder="Escreva uma anotação..."
                      rows={3}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleAddAnotacao}
                      disabled={!novaAnotacao.trim()}
                      className="shrink-0 bg-blue-600 hover:bg-blue-700"
                    >
                      Adicionar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                {anotacoes.map((nota) => (
                  <Card key={nota.id} className="bg-yellow-50 border-yellow-200">
                    <CardContent className="p-4">
                      <p className="text-slate-800 whitespace-pre-wrap">{nota.descricao}</p>
                      <p className="text-xs text-slate-500 mt-2">
                        {nota.usuario_nome} •{" "}
                        {new Date(nota.created_date).toLocaleDateString("pt-BR")} às{" "}
                        {new Date(nota.created_date).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </CardContent>
                  </Card>
                ))}

                {anotacoes.length === 0 && (
                  <Card>
                    <CardContent className="text-center py-12 text-slate-500">
                      <StickyNote className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Nenhuma anotação criada</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {activeTab === "chat" && (
            <Card>
              <CardContent className="p-6 text-center py-12 text-slate-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Funcionalidade de chat em desenvolvimento</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Visualizador de Anexos */}
      {anexoVisualizacao && (
        <AnexoViewer
          anexo={anexoVisualizacao}
          open={!!anexoVisualizacao}
          onOpenChange={() => setAnexoVisualizacao(null)}
        />
      )}
    </div>
  );
}
