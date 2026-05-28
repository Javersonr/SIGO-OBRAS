import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  LayoutDashboard,
  FileText,
  Folder,
  StickyNote,
  BookOpen,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import RelatorioObra from "@/components/cliente/RelatorioObra";

export default function PortalClienteEmbed({ projetoId, empresaAtiva }) {
  const [loading, setLoading] = useState(true);
  const [oportunidade, setOportunidade] = useState(null);
  const [orcamentoItens, setOrcamentoItens] = useState([]);
  const [cronogramaEtapas, setCronogramaEtapas] = useState([]);
  const [activeTab, setActiveTab] = useState("obra");
  const [arquivos, setArquivos] = useState([]);
  const [anotacoes, setAnotacoes] = useState([]);
  const [diarios, setDiarios] = useState([]);

  useEffect(() => {
    if (projetoId && empresaAtiva) {
      loadData();
    }
  }, [projetoId, empresaAtiva]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Tentar carregar como Projeto primeiro, se não encontrar, busca como Oportunidade
      let projeto = await sigo.entities.Projeto.filter({ id: projetoId });
      let oportunidadeData = null;

      if (projeto.length > 0) {
        oportunidadeData = projeto[0];
      } else {
        const op = await sigo.entities.Oportunidade.filter({ id: projetoId });
        if (op.length === 0) {
          setLoading(false);
          return;
        }
        oportunidadeData = op[0];
      }

      setOportunidade(oportunidadeData);

      // Carregar orçamento
      let itens = await sigo.entities.OrcamentoItem.filter({
        empresa_id: empresaAtiva.id,
        projeto_id: projetoId,
      });

      if (itens.length === 0) {
        itens = await sigo.entities.OrcamentoItem.filter({
          empresa_id: empresaAtiva.id,
          oportunidade_id: projetoId,
        });
      }
      setOrcamentoItens(itens.sort((a, b) => a.ordem - b.ordem));

      // Carregar cronograma
      let etapas = await sigo.entities.CronogramaEtapa.filter({
        empresa_id: empresaAtiva.id,
        projeto_id: projetoId,
      });

      if (etapas.length === 0) {
        etapas = await sigo.entities.CronogramaEtapa.filter({
          empresa_id: empresaAtiva.id,
          oportunidade_id: projetoId,
        });
      }
      setCronogramaEtapas(etapas.sort((a, b) => a.ordem - b.ordem));

      // Carregar arquivos
      let arqs = await sigo.entities.ArquivoOportunidade.filter({
        empresa_id: empresaAtiva.id,
        projeto_id: projetoId,
      });

      if (arqs.length === 0) {
        arqs = await sigo.entities.ArquivoOportunidade.filter({
          empresa_id: empresaAtiva.id,
          oportunidade_id: projetoId,
        });
      }
      setArquivos(arqs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));

      // Carregar anotações
      let notas = await sigo.entities.OportunidadeAtualizacao.filter({
        empresa_id: empresaAtiva.id,
        projeto_id: projetoId,
        tipo: "Nota",
      });

      if (notas.length === 0) {
        notas = await sigo.entities.OportunidadeAtualizacao.filter({
          empresa_id: empresaAtiva.id,
          oportunidade_id: projetoId,
          tipo: "Nota",
        });
      }
      setAnotacoes(notas.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));

      // Carregar diários de obra
      const diario = await sigo.entities.DiarioObra.filter({
        empresa_id: empresaAtiva.id,
        projeto_id: projetoId,
      });
      setDiarios(diario.sort((a, b) => new Date(b.data) - new Date(a.data)));
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const getClimaIcon = (clima) => {
    const emojis = {
      Sol: "☀️",
      Nublado: "☁️",
      Chuva: "🌧️",
      Vento: "💨",
    };
    return emojis[clima] || "☀️";
  };

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "obra", label: "Obra", icon: Calendar },
    { id: "diario", label: "Diário de Obra", icon: BookOpen },
    { id: "arquivos", label: "Arquivos", icon: Folder },
    { id: "anotacoes", label: "Anotações", icon: StickyNote },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Carregando visualização do cliente...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-200px)]">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b bg-blue-50">
          <p className="text-xs font-semibold text-blue-700 mb-1">VISUALIZAÇÃO DO CLIENTE</p>
          <p className="text-sm text-slate-700 truncate">{oportunidade?.nome}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left text-sm",
                activeTab === item.id
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <item.icon
                className={cn(
                  "w-4 h-4",
                  activeTab === item.id ? "text-blue-600" : "text-slate-400"
                )}
              />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {activeTab === "dashboard" && "Dashboard"}
            {activeTab === "obra" && "Obra"}
            {activeTab === "diario" && "Diário de Obra"}
            {activeTab === "arquivos" && "Arquivos"}
            {activeTab === "anotacoes" && "Anotações"}
          </h2>
        </header>

        <div className="flex-1 p-6 overflow-auto">
          {activeTab === "dashboard" && (
            <div className="space-y-6">
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
            </div>
          )}

          {activeTab === "obra" && (
            <RelatorioObra
              etapas={cronogramaEtapas}
              oportunidade={oportunidade}
              empresa={empresaAtiva}
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
                          onClick={() => window.open(arquivo.url, "_blank")}
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
          )}

          {activeTab === "anotacoes" && (
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
          )}
        </div>
      </main>
    </div>
  );
}
