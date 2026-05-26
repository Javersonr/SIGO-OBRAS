import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEmpresa } from "@/Layout";
import SheetModalComponent from "@/components/ui/sheet-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Camera,
  X,
  Clock,
  FileText,
  Download,
  Mail,
  Send,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import FotografarFerramentaStep from "./FotografarFerramentaStep";
import HistoricoInspecaoTab from "./HistoricoInspecaoTab";

export default function InspecaoDetalheModal({
  open,
  onOpenChange,
  inspecao,
  onComplete,
  onEditar,
  onExcluir,
}) {
  const { empresaAtiva } = useEmpresa();
  const [ferramentasInsp, setFerramentasInsp] = useState([]);
  const [selectedFerramenta, setSelectedFerramenta] = useState(null);
  const [showFotoStep, setShowFotoStep] = useState(false);
  const [inspecaoAtualizada, setInspecaoAtualizada] = useState(inspecao);
  const [fotoExpandida, setFotoExpandida] = useState(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailsDestino, setEmailsDestino] = useState("");
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const [mostrarComparacao, setMostrarComparacao] = useState(null);
  const [mostrarExpandida, setMostrarExpandida] = useState(null);

  useEffect(() => {
    if (inspecao?.ferramentas_inspecionadas) {
      const parsed = JSON.parse(inspecao.ferramentas_inspecionadas);
      // Ordenar alfabeticamente por descrição
      const ordenadas = parsed.sort((a, b) =>
        (a.descricao || "").localeCompare(b.descricao || "", "pt-BR")
      );
      setFerramentasInsp(ordenadas);
    }
  }, [inspecao]);

  const handleFotoSalva = async (ferramentaIdx, itemIdx, fotoValidada) => {
    try {
      const novasFerramentas = [...ferramentasInsp];
      const ferramenta = novasFerramentas[ferramentaIdx];
      const item = ferramenta.itens[itemIdx];

      novasFerramentas[ferramentaIdx].itens[itemIdx].status_foto = fotoValidada
        ? "concluida"
        : "falhou";
      novasFerramentas[ferramentaIdx].itens[itemIdx].foto_url = fotoValidada?.foto_url;

      setFerramentasInsp(novasFerramentas);

      const totalFotografadas = novasFerramentas.reduce(
        (sum, f) => sum + f.itens.filter((i) => i.status_foto === "concluida").length,
        0
      );

      await base44.entities.InspecaoFerramenta.update(inspecao.id, {
        ferramentas_inspecionadas: JSON.stringify(novasFerramentas),
        total_fotografadas: totalFotografadas,
      });

      // Registrar no histórico
      const tipoAcao = fotoValidada?.confianca_validacao >= 70 ? "foto_validada" : "foto_capturada";
      await base44.entities.InspecaoHistorico.create({
        empresa_id: empresaAtiva.id,
        inspecao_id: inspecao.id,
        ferramenta_id: item.id,
        ferramenta_codigo: ferramenta.codigo,
        ferramenta_descricao: ferramenta.descricao,
        tipo_acao: tipoAcao,
        descricao: `Foto ${tipoAcao === "foto_validada" ? "validada" : "capturada"} com sucesso`,
        usuario_email: empresaAtiva.email,
        timestamp: new Date().toISOString(),
        confianca_validacao: fotoValidada?.confianca_validacao || 0,
        foto_url: fotoValidada?.foto_url,
      });

      const atualizada = await base44.entities.InspecaoFerramenta.filter({ id: inspecao.id });
      setInspecaoAtualizada(atualizada[0]);

      toast.success("Foto salva com sucesso!");

      // Notificar se houve falha na validação
      if (!fotoValidada) {
        try {
          await base44.functions.invoke("enviarNotificacao", {
            empresa_id: empresaAtiva.id,
            usuarios_emails: inspecao.usuario_email,
            tipo_notificacao: "inspecao_falha",
            dados: {
              ferramenta_descricao: novasFerramentas[ferramentaIdx].descricao,
              ferramenta_codigo: novasFerramentas[ferramentaIdx].codigo,
              funcionario_nome: inspecao.funcionario_nome,
            },
          });
        } catch (error) {
          console.error("Erro ao enviar notificação:", error);
        }
      }

      // Buscar próxima ferramenta a ser fotografada
      const proximaFerramenta = encontrarProximaFerramenta(
        novasFerramentas,
        ferramentaIdx,
        itemIdx
      );

      if (proximaFerramenta) {
        // Abrir próxima ferramenta automaticamente
        setSelectedFerramenta({
          ...proximaFerramenta.ferramenta,
          itemIdx: proximaFerramenta.itemIdx,
          ferramentaIdx: proximaFerramenta.ferramentaIdx,
        });
      } else {
        // Se não há próxima, fechar o modal
        setShowFotoStep(false);
      }
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao salvar foto");
    }
  };

  const handleGerarPDF = async () => {
    setGerandoPDF(true);
    try {
      const response = await base44.functions.invoke("gerarRelatorioInspecao", {
        inspecao_id: inspecao.id,
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inspecao_${inspecao.caminhao_localizacao}_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      toast.success("Relatório gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar relatório");
    } finally {
      setGerandoPDF(false);
    }
  };

  const handleEnviarPorEmail = async () => {
    if (!emailsDestino.trim()) {
      toast.error("Informe pelo menos um email");
      return;
    }

    const emails = emailsDestino
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e);
    if (emails.length === 0) {
      toast.error("Informe emails válidos");
      return;
    }

    setEnviandoEmail(true);
    try {
      const response = await base44.functions.invoke("gerarRelatorioInspecao", {
        inspecao_id: inspecao.id,
        enviar_email: true,
        emails_destino: emails,
      });

      if (response.data.success) {
        toast.success(`Relatório enviado para ${response.data.emails_enviados} email(s)!`);
        setShowEmailDialog(false);
        setEmailsDestino("");
      } else {
        toast.error("Erro ao enviar emails");
      }
    } catch (error) {
      console.error("Erro ao enviar email:", error);
      toast.error("Erro ao enviar relatório por email");
    } finally {
      setEnviandoEmail(false);
    }
  };

  const encontrarProximaFerramenta = (ferramentas, ferramentaIdxAtual, itemIdxAtual) => {
    // Procurar a partir do item atual
    for (let i = ferramentaIdxAtual; i < ferramentas.length; i++) {
      const ferramenta = ferramentas[i];
      const inicioItem = i === ferramentaIdxAtual ? itemIdxAtual + 1 : 0;

      for (let j = inicioItem; j < ferramenta.itens.length; j++) {
        if (ferramenta.itens[j].status_foto !== "concluida") {
          return { ferramenta, itemIdx: j, ferramentaIdx: i };
        }
      }
    }
    return null;
  };

  if (!inspecao) return null;

  const progresso = inspecaoAtualizada?.total_fotografadas || inspecao.total_fotografadas;
  const total = inspecaoAtualizada?.total_ferramentas || inspecao.total_ferramentas;
  const percentual = Math.round((progresso / total) * 100);

  return (
    <>
      <SheetModalComponent
        open={open && !showFotoStep}
        onOpenChange={onOpenChange}
        title={`Inspeção - ${inspecao.funcionario_nome}`}
        subtitle={
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-slate-600">{inspecao.caminhao_localizacao}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={gerandoPDF || enviandoEmail}>
                  <FileText className="w-4 h-4 mr-2" />
                  {gerandoPDF ? "Gerando..." : "Relatório"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleGerarPDF}>
                  <Download className="w-4 h-4 mr-2" />
                  Baixar PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowEmailDialog(true)}>
                  <Mail className="w-4 h-4 mr-2" />
                  Enviar por Email
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Progresso */}
          <Card className="p-4 bg-blue-50">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold text-slate-700">Progresso da Inspeção</p>
                <Badge className="bg-blue-600 text-white">
                  {progresso}/{total}
                </Badge>
              </div>
              <div className="w-full bg-slate-300 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all"
                  style={{ width: `${percentual}%` }}
                />
              </div>
              <p className="text-xs text-slate-600">{percentual}% concluído</p>
            </div>
          </Card>

          {/* Abas */}
          <Tabs defaultValue="ferramentas" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ferramentas">Ferramentas ({ferramentasInsp.length})</TabsTrigger>
              <TabsTrigger value="historico" className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Histórico
              </TabsTrigger>
            </TabsList>

            {/* Tab Ferramentas com Tabela */}
            <TabsContent value="ferramentas" className="space-y-4">
              {/* Tabela de Ferramentas */}
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="w-12">Item</TableHead>
                      <TableHead className="w-32">Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-20">Marca</TableHead>
                      <TableHead className="w-24">Nº Série</TableHead>
                      <TableHead className="w-20">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      let itemNumber = 0;
                      return ferramentasInsp.flatMap((ferramenta, ferIdx) =>
                        ferramenta.itens.map((item, itemIdx) => {
                          itemNumber++;
                          return (
                            <TableRow key={`${ferIdx}-${itemIdx}`}>
                              <TableCell className="text-sm font-semibold text-slate-700">
                                {itemNumber}
                              </TableCell>
                              <TableCell className="font-mono text-sm font-medium">
                                {ferramenta.codigo}
                              </TableCell>
                              <TableCell className="text-sm">{ferramenta.descricao}</TableCell>
                              <TableCell className="text-sm">-</TableCell>
                              <TableCell className="text-sm">{item.numero_serie || "-"}</TableCell>
                              <TableCell>
                                {item.status_foto === "concluida" ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                        <MoreVertical className="w-4 h-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setMostrarComparacao({
                                            ferramentaIdx: ferIdx,
                                            itemIdx: itemIdx,
                                            fotoReferencia: ferramenta.foto_url,
                                            fotoCapturada: item.foto_url,
                                            descricao: ferramenta.descricao,
                                          });
                                        }}
                                      >
                                        <Eye className="w-4 h-4 mr-2" />
                                        Visualizar Fotos
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={async () => {
                                          try {
                                            const novasFerramentas = [...ferramentasInsp];
                                            novasFerramentas[ferIdx].itens[itemIdx].status_foto =
                                              "pendente";
                                            novasFerramentas[ferIdx].itens[itemIdx].foto_url = null;

                                            setFerramentasInsp(novasFerramentas);

                                            const totalFotografadas = novasFerramentas.reduce(
                                              (sum, f) =>
                                                sum +
                                                f.itens.filter((i) => i.status_foto === "concluida")
                                                  .length,
                                              0
                                            );

                                            await base44.entities.InspecaoFerramenta.update(
                                              inspecao.id,
                                              {
                                                ferramentas_inspecionadas:
                                                  JSON.stringify(novasFerramentas),
                                                total_fotografadas: totalFotografadas,
                                              }
                                            );

                                            // Registrar no histórico
                                            await base44.entities.InspecaoHistorico.create({
                                              empresa_id: empresaAtiva.id,
                                              inspecao_id: inspecao.id,
                                              ferramenta_codigo: ferramenta.codigo,
                                              ferramenta_descricao: ferramenta.descricao,
                                              tipo_acao: "confirmacao_desfeita",
                                              descricao: "Confirmação da validação desfeita",
                                              usuario_email: empresaAtiva.email,
                                              timestamp: new Date().toISOString(),
                                            });

                                            const atualizada =
                                              await base44.entities.InspecaoFerramenta.filter({
                                                id: inspecao.id,
                                              });
                                            setInspecaoAtualizada(atualizada[0]);

                                            toast.success(
                                              "Confirmação desfeita. Fotografe novamente."
                                            );
                                          } catch (error) {
                                            console.error("Erro ao desfazer:", error);
                                            toast.error("Erro ao desfazer confirmação");
                                          }
                                        }}
                                      >
                                        <Edit className="w-4 h-4 mr-2" />
                                        Desfazer Confirmação
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => {
                                          if (window.confirm("Excluir esta ferramenta?")) {
                                            onExcluir && onExcluir(ferramenta);
                                          }
                                        }}
                                        className="text-red-600"
                                      >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Excluir
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : item.status_foto === "falhou" ? (
                                  <Badge className="bg-red-100 text-red-700">Falhou</Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedFerramenta({
                                        ...ferramenta,
                                        itemIdx,
                                        ferramentaIdx: ferIdx,
                                      });
                                      setShowFotoStep(true);
                                    }}
                                    className="gap-1 text-xs h-7"
                                  >
                                    <Camera className="w-3 h-3" />
                                    Fotografar
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      );
                    })()}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Tab Histórico */}
            <TabsContent value="historico" className="space-y-4">
              <HistoricoInspecaoTab inspecaoId={inspecao.id} empresaId={empresaAtiva.id} />
            </TabsContent>
          </Tabs>

          {progresso === total && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onComplete?.();
              }}
              className="w-full bg-green-600 hover:bg-green-700 gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Inspeção Concluída
            </Button>
          )}
        </div>
      </SheetModalComponent>

      {/* Dialog de Envio por Email */}
      {showEmailDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Enviar Relatório por Email</h3>
              <p className="text-sm text-slate-500 mt-1">Informe os emails separados por vírgula</p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <Label htmlFor="emails">Emails de Destino</Label>
                <Input
                  id="emails"
                  placeholder="email1@exemplo.com, email2@exemplo.com"
                  value={emailsDestino}
                  onChange={(e) => setEmailsDestino(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEmailDialog(false);
                  setEmailsDestino("");
                }}
                disabled={enviandoEmail}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleEnviarPorEmail}
                disabled={enviandoEmail || !emailsDestino.trim()}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {enviandoEmail ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showFotoStep && selectedFerramenta && (
        <FotografarFerramentaStep
          open={showFotoStep}
          onOpenChange={setShowFotoStep}
          ferramenta={selectedFerramenta}
          onFotoSalva={(fotoValidada) =>
            handleFotoSalva(
              selectedFerramenta.ferramentaIdx,
              selectedFerramenta.itemIdx,
              fotoValidada
            )
          }
          onEditar={(ferramenta) => {
            // Implementar edição da ferramenta
            toast.info("Edição disponível na página de ferramentas");
          }}
          onExcluir={async (ferramenta) => {
            try {
              await base44.entities.Ferramenta.delete(ferramenta.id);
              toast.success("Ferramenta excluída");
              // Recarregar inspeção
              const atualizada = await base44.entities.InspecaoFerramenta.filter({
                id: inspecao.id,
              });
              setInspecaoAtualizada(atualizada[0]);
            } catch (error) {
              console.error("Erro ao excluir:", error);
              toast.error("Erro ao excluir ferramenta");
            }
          }}
        />
      )}

      {/* Modal Comparação de Fotos */}
      {mostrarComparacao && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Comparação de Fotos - {mostrarComparacao.descricao}
              </h3>
              <button
                onClick={() => setMostrarComparacao(null)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">📸 Foto de Referência</p>
                  <img
                    src={mostrarComparacao.fotoReferencia}
                    alt="Referência"
                    className="w-full h-64 object-contain rounded-lg bg-slate-100 border cursor-pointer hover:opacity-90"
                    onClick={() => setMostrarExpandida(mostrarComparacao.fotoReferencia)}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">✓ Foto Capturada</p>
                  <img
                    src={mostrarComparacao.fotoCapturada}
                    alt="Capturada"
                    className="w-full h-64 object-contain rounded-lg bg-slate-100 border cursor-pointer hover:opacity-90"
                    onClick={() => setMostrarExpandida(mostrarComparacao.fotoCapturada)}
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end">
              <Button onClick={() => setMostrarComparacao(null)} variant="outline">
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Foto Expandida */}
      {mostrarExpandida && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
          onClick={() => setMostrarExpandida(null)}
        >
          <div className="relative max-w-2xl max-h-[90vh] w-full h-full">
            <img
              src={mostrarExpandida}
              alt="Foto expandida"
              className="w-full h-full object-contain"
            />
            <button
              onClick={() => setMostrarExpandida(null)}
              className="absolute top-4 right-4 bg-white rounded-full p-2 hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5 text-slate-800" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
