import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { useEmpresa } from "@/Layout";
import SheetModalComponent from "@/components/ui/sheet-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wrench,
  TrendingUp,
  Clock,
  DollarSign,
  FileText,
  Plus,
  CheckCircle,
  XCircle,
  Paperclip,
  X,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

export default function FerramentaDetalheModal({ open, onOpenChange, ferramenta, onEdit }) {
  const { empresaAtiva, user } = useEmpresa();
  const [loading, setLoading] = useState(true);
  const [manutencoes, setManutencoes] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [notas, setNotas] = useState([]);
  const [showNotaForm, setShowNotaForm] = useState(false);
  const [novaNota, setNovaNota] = useState({
    titulo: "",
    descricao: "",
    tipo: "Observação",
    anexos: "[]",
  });
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [anexosTemp, setAnexosTemp] = useState([]);

  useEffect(() => {
    if (open && ferramenta) {
      loadData();
    }
  }, [open, ferramenta?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [manut, movim, notasData] = await Promise.all([
        sigo.entities.ManutencaoFerramenta.filter(
          {
            empresa_id: empresaAtiva.id,
            ferramenta_id: ferramenta.id,
          },
          "-data_manutencao"
        ),
        sigo.entities.MovimentacaoFerramenta.filter(
          {
            empresa_id: empresaAtiva.id,
            ferramenta_id: ferramenta.id,
          },
          "-created_date",
          50
        ),
        sigo.entities.FerramentaNota.filter(
          {
            empresa_id: empresaAtiva.id,
            ferramenta_id: ferramenta.id,
          },
          "-created_date"
        ),
      ]);

      setManutencoes(manut);
      setMovimentacoes(movim);
      setNotas(notasData);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  };

  const calcularCustoTotal = () => {
    return manutencoes.reduce((total, m) => {
      const custoMaoObra = parseFloat(m.custo) || 0;
      const custoPecas = m.pecas_substituidas
        ? safeParseJSON(m.pecas_substituidas, []).reduce(
            (sum, p) => sum + p.quantidade * p.custo_unitario,
            0
          )
        : 0;
      return total + custoMaoObra + custoPecas;
    }, 0);
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploadingFiles(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const { file_url } = await sigo.integrations.Core.UploadFile({ file });
        uploaded.push({ nome: file.name, url: file_url, tipo: file.type });
      }
      setAnexosTemp([...anexosTemp, ...uploaded]);
      toast.success(`${files.length} arquivo(s) anexado(s)`);
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao anexar arquivos");
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleSalvarNota = async () => {
    if (!novaNota.titulo.trim()) {
      toast.error("Informe o título da nota");
      return;
    }

    try {
      await sigo.entities.FerramentaNota.create({
        empresa_id: empresaAtiva.id,
        ferramenta_id: ferramenta.id,
        ferramenta_codigo: ferramenta.codigo,
        titulo: novaNota.titulo,
        descricao: novaNota.descricao,
        tipo: novaNota.tipo,
        usuario_nome: user.full_name,
        usuario_email: user.email,
        anexos: JSON.stringify(anexosTemp),
      });

      toast.success("Nota adicionada");
      setShowNotaForm(false);
      setNovaNota({ titulo: "", descricao: "", tipo: "Observação", anexos: "[]" });
      setAnexosTemp([]);
      loadData();
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao salvar nota");
    }
  };

  const handleRemoverNota = async (notaId) => {
    try {
      await sigo.entities.FerramentaNota.delete(notaId);
      toast.success("Nota removida");
      loadData();
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao remover nota");
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "Concluída":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "Cancelada":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "Em Andamento":
        return <Clock className="w-4 h-4 text-blue-600" />;
      default:
        return <Clock className="w-4 h-4 text-amber-600" />;
    }
  };

  const getTipoColor = (tipo) => {
    const colors = {
      Observação: "bg-slate-100 text-slate-700",
      Alerta: "bg-red-100 text-red-700",
      Manutenção: "bg-amber-100 text-amber-700",
      Uso: "bg-blue-100 text-blue-700",
      Outro: "bg-slate-100 text-slate-600",
    };
    return colors[tipo] || colors["Outro"];
  };

  if (!ferramenta) return null;

  return (
    <SheetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      title={ferramenta.codigo}
      subtitle={ferramenta.descricao}
      footer={
        <div className="flex justify-end gap-3">
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              Editar Ferramenta
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="resumo" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="manutencoes">Manutenções</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="custos">Custos</TabsTrigger>
            <TabsTrigger value="notas">Notas</TabsTrigger>
          </TabsList>

          {/* Resumo */}
          <TabsContent value="resumo" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="w-5 h-5 text-amber-600" />
                    <p className="text-xs text-slate-600">Manutenções</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{manutencoes.length}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    <p className="text-xs text-slate-600">Custo Total</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">
                    R$ {calcularCustoTotal().toFixed(2)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <p className="text-xs text-slate-600">Horas de Uso</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{ferramenta.horas_uso || 0}h</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                    <p className="text-xs text-slate-600">Movimentações</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{movimentacoes.length}</p>
                </CardContent>
              </Card>
            </div>

            {/* Info da Ferramenta */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Informações</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-600">Marca</p>
                  <p className="font-medium">{ferramenta.marca || "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Modelo</p>
                  <p className="font-medium">{ferramenta.modelo || "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Status</p>
                  <Badge>{ferramenta.status}</Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Localização</p>
                  <p className="font-medium">{ferramenta.localizacao || "N/A"}</p>
                </div>
                {ferramenta.proxima_manutencao && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-600">Próxima Manutenção</p>
                    <p className="font-medium text-amber-600">
                      {new Date(ferramenta.proxima_manutencao).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manutenções */}
          <TabsContent value="manutencoes" className="space-y-3">
            {manutencoes.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Wrench className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>Nenhuma manutenção registrada</p>
              </div>
            ) : (
              manutencoes.map((manut) => {
                const pecas = safeParseJSON(manut.pecas_substituidas, []);
                const custoTotal =
                  (parseFloat(manut.custo) || 0) +
                  pecas.reduce((s, p) => s + p.quantidade * p.custo_unitario, 0);

                return (
                  <Card key={manut.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(manut.status)}
                          <div>
                            <p className="font-medium text-slate-800">{manut.tipo_manutencao}</p>
                            <p className="text-xs text-slate-500">
                              {manut.data_manutencao
                                ? new Date(manut.data_manutencao).toLocaleDateString("pt-BR")
                                : `Previsto: ${new Date(manut.data_prevista).toLocaleDateString("pt-BR")}`}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline">{manut.status}</Badge>
                      </div>

                      {manut.descricao && (
                        <p className="text-sm text-slate-600 mb-2">{manut.descricao}</p>
                      )}

                      {pecas.length > 0 && (
                        <div className="bg-slate-50 rounded p-3 mb-2">
                          <p className="text-xs font-medium text-slate-700 mb-2">
                            Peças Substituídas:
                          </p>
                          <div className="space-y-1">
                            {pecas.map((peca, idx) => (
                              <div key={idx} className="flex justify-between text-xs">
                                <span className="text-slate-600">
                                  {peca.descricao} ({peca.quantidade}x)
                                </span>
                                <span className="font-medium">
                                  R$ {(peca.quantidade * peca.custo_unitario).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="text-xs text-slate-600">
                          {manut.responsavel_nome && (
                            <span>
                              Responsável: <strong>{manut.responsavel_nome}</strong>
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-green-600">
                          R$ {custoTotal.toFixed(2)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* Timeline */}
          <TabsContent value="timeline" className="space-y-4">
            <div className="relative">
              {[...manutencoes, ...movimentacoes]
                .sort((a, b) => {
                  const dateA = new Date(a.data_manutencao || a.created_date);
                  const dateB = new Date(b.data_manutencao || b.created_date);
                  return dateB - dateA;
                })
                .slice(0, 20)
                .map((evento, idx) => {
                  const isManutencao = evento.tipo_manutencao !== undefined;
                  return (
                    <div
                      key={`${isManutencao ? "m" : "mov"}-${evento.id}`}
                      className="flex gap-4 mb-4"
                    >
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            isManutencao ? "bg-amber-100" : "bg-blue-100"
                          }`}
                        >
                          {isManutencao ? (
                            <Wrench className="w-5 h-5 text-amber-600" />
                          ) : (
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                          )}
                        </div>
                        {idx < 19 && <div className="w-0.5 h-full bg-slate-200 my-1" />}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="text-sm font-medium text-slate-800">
                          {isManutencao ? `Manutenção ${evento.tipo_manutencao}` : evento.tipo}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(
                            evento.data_manutencao || evento.created_date
                          ).toLocaleDateString("pt-BR")}{" "}
                          às{" "}
                          {new Date(
                            evento.data_manutencao || evento.created_date
                          ).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {isManutencao && evento.descricao && (
                          <p className="text-xs text-slate-600 mt-1">{evento.descricao}</p>
                        )}
                        {!isManutencao && (
                          <p className="text-xs text-slate-600 mt-1">
                            {evento.funcionario_nome || evento.fornecedor_nome || "Sistema"}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </TabsContent>

          {/* Custos */}
          <TabsContent value="custos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo de Custos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm text-slate-600">Custo Total de Manutenções</span>
                    <span className="text-lg font-bold text-slate-800">
                      R$ {calcularCustoTotal().toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Valor da Ferramenta</span>
                    <span className="text-sm font-semibold text-slate-700">
                      R$ {(ferramenta.valor_unitario || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Total de Manutenções</span>
                    <span className="text-sm font-semibold text-slate-700">
                      {manutencoes.length}
                    </span>
                  </div>
                  {manutencoes.length > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Custo Médio por Manutenção</span>
                      <span className="text-sm font-semibold text-slate-700">
                        R$ {(calcularCustoTotal() / manutencoes.length).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Breakdown por tipo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Custos por Tipo de Manutenção</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {["Preventiva", "Corretiva", "Preditiva", "Inspeção"].map((tipo) => {
                  const manutTipo = manutencoes.filter((m) => m.tipo_manutencao === tipo);
                  const custoTipo = manutTipo.reduce((total, m) => {
                    const custoMaoObra = parseFloat(m.custo) || 0;
                    const custoPecas = m.pecas_substituidas
                      ? safeParseJSON(m.pecas_substituidas, []).reduce(
                          (sum, p) => sum + p.quantidade * p.custo_unitario,
                          0
                        )
                      : 0;
                    return total + custoMaoObra + custoPecas;
                  }, 0);

                  if (manutTipo.length === 0) return null;

                  return (
                    <div
                      key={tipo}
                      className="flex justify-between items-center p-2 bg-slate-50 rounded"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-700">{tipo}</p>
                        <p className="text-xs text-slate-500">{manutTipo.length} manutenções</p>
                      </div>
                      <p className="text-sm font-bold text-green-600">R$ {custoTipo.toFixed(2)}</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notas */}
          <TabsContent value="notas" className="space-y-4">
            <Button
              onClick={() => setShowNotaForm(!showNotaForm)}
              className="w-full bg-amber-500 hover:bg-amber-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Nota
            </Button>

            {showNotaForm && (
              <Card className="border-amber-200">
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Título *</Label>
                      <Input
                        value={novaNota.titulo}
                        onChange={(e) => setNovaNota({ ...novaNota, titulo: e.target.value })}
                        placeholder="Ex: Desgaste observado no cabo"
                      />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select
                        value={novaNota.tipo}
                        onValueChange={(v) => setNovaNota({ ...novaNota, tipo: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Observação">Observação</SelectItem>
                          <SelectItem value="Alerta">Alerta</SelectItem>
                          <SelectItem value="Manutenção">Manutenção</SelectItem>
                          <SelectItem value="Uso">Uso</SelectItem>
                          <SelectItem value="Outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Descrição</Label>
                    <Textarea
                      value={novaNota.descricao}
                      onChange={(e) => setNovaNota({ ...novaNota, descricao: e.target.value })}
                      placeholder="Detalhes da observação..."
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label>Anexos</Label>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      disabled={uploadingFiles}
                      className="hidden"
                      id="nota-file-upload"
                    />
                    <label
                      htmlFor="nota-file-upload"
                      className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                        uploadingFiles
                          ? "bg-slate-100 cursor-not-allowed opacity-50"
                          : "border-amber-300 bg-amber-50 hover:bg-amber-100"
                      }`}
                    >
                      {uploadingFiles ? (
                        <>
                          <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                          <span className="text-sm font-medium text-amber-700">Enviando...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-amber-600" />
                          <span className="text-sm font-medium text-amber-700">
                            Clique para anexar
                          </span>
                        </>
                      )}
                    </label>

                    {anexosTemp.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {anexosTemp.map((anexo, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between bg-slate-50 p-2 rounded text-xs"
                          >
                            <span className="truncate flex-1">{anexo.nome}</span>
                            <button
                              onClick={() => setAnexosTemp(anexosTemp.filter((_, i) => i !== idx))}
                              className="text-red-600 hover:text-red-700 ml-2"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowNotaForm(false);
                        setNovaNota({
                          titulo: "",
                          descricao: "",
                          tipo: "Observação",
                          anexos: "[]",
                        });
                        setAnexosTemp([]);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSalvarNota}
                      className="bg-amber-500 hover:bg-amber-600"
                    >
                      Salvar Nota
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {notas.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>Nenhuma nota registrada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notas.map((nota) => {
                  const anexos = safeParseJSON(nota.anexos, []);
                  return (
                    <Card key={nota.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={getTipoColor(nota.tipo)}>{nota.tipo}</Badge>
                              <h4 className="font-medium text-slate-800">{nota.titulo}</h4>
                            </div>
                            {nota.descricao && (
                              <p className="text-sm text-slate-600">{nota.descricao}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleRemoverNota(nota.id)}
                            className="text-red-600 hover:text-red-700 p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {anexos.length > 0 && (
                          <div className="flex gap-2 flex-wrap mt-2">
                            {anexos.map((anexo, idx) => (
                              <a
                                key={idx}
                                href={anexo.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs bg-slate-100 px-2 py-1 rounded hover:bg-slate-200"
                              >
                                <Paperclip className="w-3 h-3" />
                                {anexo.nome}
                              </a>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-3 pt-2 border-t text-xs text-slate-500">
                          <span>{nota.usuario_nome}</span>
                          <span>{new Date(nota.created_date).toLocaleDateString("pt-BR")}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </SheetModalComponent>
  );
}
