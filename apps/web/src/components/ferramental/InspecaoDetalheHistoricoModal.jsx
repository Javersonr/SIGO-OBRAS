import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import SheetModalComponent from "@/components/ui/sheet-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  User,
  Truck,
  Download,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export default function InspecaoDetalheHistoricoModal({ open, onOpenChange, inspecao }) {
  const [ferramentas, setFerramentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fotoExpandida, setFotoExpandida] = useState(null);
  const [gerandoPDF, setGerandoPDF] = useState(false);

  useEffect(() => {
    if (inspecao && open) {
      loadFerramentas();
    }
  }, [inspecao, open]);

  const loadFerramentas = async () => {
    try {
      setLoading(true);

      // Buscar ferramentas do caminhão
      const ferramentasData = await base44.entities.Ferramenta.filter({
        empresa_id: inspecao.empresa_id,
        localizacao: inspecao.caminhao_placa,
      });

      // Buscar dados de inspeção
      const inspecoesFerramental = await base44.entities.InspecaoFerramental.filter({
        empresa_id: inspecao.empresa_id,
        inspecao_id: inspecao.id,
      });

      // Combinar dados
      const ferramentasComInspecao = ferramentasData.map((ferramenta) => {
        const inspecaoFerramenta = inspecoesFerramental.find(
          (i) => i.ferramenta_id === ferramenta.id
        );
        return {
          ...ferramenta,
          inspecao: inspecaoFerramenta,
        };
      });

      setFerramentas(ferramentasComInspecao);
    } catch (error) {
      console.error("Erro ao carregar ferramentas:", error);
      toast.error("Erro ao carregar detalhes");
    } finally {
      setLoading(false);
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
      a.download = `inspecao_${inspecao.caminhao_placa}_${new Date(inspecao.data_inspecao).toISOString().split("T")[0]}.pdf`;
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

  if (!inspecao) return null;

  const statusConfig =
    inspecao.status === "concluida"
      ? { label: "Concluída", color: "bg-green-100 text-green-700", icon: CheckCircle2 }
      : inspecao.status === "reprovada"
        ? { label: "Reprovada", color: "bg-red-100 text-red-700", icon: XCircle }
        : { label: "Em Andamento", color: "bg-amber-100 text-amber-700", icon: Clock };

  const StatusIcon = statusConfig.icon;

  const aprovadas = ferramentas.filter((f) => f.inspecao?.status_validacao === "aprovada").length;
  const reprovadas = ferramentas.filter((f) => f.inspecao?.status_validacao === "reprovada").length;
  const pendentes = ferramentas.filter((f) => !f.inspecao).length;

  return (
    <>
      <SheetModalComponent
        open={open}
        onOpenChange={onOpenChange}
        title={`Inspeção - ${inspecao.caminhao_placa}`}
        subtitle={
          <div className="flex items-center gap-2 mt-2">
            <Badge className={statusConfig.color}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusConfig.label}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGerarPDF}
              disabled={gerandoPDF}
              className="ml-auto"
            >
              {gerandoPDF ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin mr-2" />
                  Gerando...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  PDF
                </>
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Informações Gerais */}
          <Card className="p-4 bg-slate-50">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                  <Calendar className="w-4 h-4" />
                  Data da Inspeção
                </div>
                <p className="font-semibold text-slate-800">
                  {format(new Date(inspecao.data_inspecao), "dd 'de' MMMM 'de' yyyy", {
                    locale: ptBR,
                  })}
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                  <User className="w-4 h-4" />
                  Inspetor
                </div>
                <p className="font-semibold text-slate-800">{inspecao.usuario_nome}</p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                  <Truck className="w-4 h-4" />
                  Veículo
                </div>
                <p className="font-semibold text-slate-800">
                  {inspecao.caminhao_placa} - {inspecao.caminhao_modelo}
                </p>
              </div>

              <div>
                <div className="text-sm text-slate-600 mb-1">Progresso</div>
                <p className="font-semibold text-slate-800">
                  {inspecao.ferramentas_inspecionadas} / {inspecao.total_ferramentas}
                </p>
              </div>
            </div>

            {inspecao.observacoes && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-sm text-slate-600 mb-1">Observações:</p>
                <p className="text-sm text-slate-800">{inspecao.observacoes}</p>
              </div>
            )}
          </Card>

          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3 bg-green-50 border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-sm text-green-600">Aprovadas</p>
                  <p className="text-2xl font-bold text-green-700">{aprovadas}</p>
                </div>
              </div>
            </Card>

            <Card className="p-3 bg-red-50 border-red-200">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <div>
                  <p className="text-sm text-red-600">Reprovadas</p>
                  <p className="text-2xl font-bold text-red-700">{reprovadas}</p>
                </div>
              </div>
            </Card>

            <Card className="p-3 bg-slate-50 border-slate-200">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-600" />
                <div>
                  <p className="text-sm text-slate-600">Pendentes</p>
                  <p className="text-2xl font-bold text-slate-700">{pendentes}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Tabela de Ferramentas */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Ferramentas Inspecionadas</h3>
            {loading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-slate-500">Carregando...</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20">Foto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ferramentas.map((ferramenta) => (
                      <TableRow key={ferramenta.id}>
                        <TableCell className="font-mono text-sm">{ferramenta.codigo}</TableCell>
                        <TableCell className="text-sm">{ferramenta.descricao}</TableCell>
                        <TableCell>
                          {ferramenta.inspecao?.status_validacao === "aprovada" ? (
                            <Badge className="bg-green-100 text-green-700">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Aprovada
                            </Badge>
                          ) : ferramenta.inspecao?.status_validacao === "reprovada" ? (
                            <Badge className="bg-red-100 text-red-700">
                              <XCircle className="w-3 h-3 mr-1" />
                              Reprovada
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-700">
                              <Clock className="w-3 h-3 mr-1" />
                              Pendente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {ferramenta.inspecao?.foto_url ? (
                            <button
                              onClick={() => setFotoExpandida(ferramenta.inspecao.foto_url)}
                              className="p-1 hover:bg-slate-100 rounded"
                            >
                              <ImageIcon className="w-4 h-4 text-blue-600" />
                            </button>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </SheetModalComponent>

      {/* Foto Expandida */}
      {fotoExpandida && (
        <div
          className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4"
          onClick={() => setFotoExpandida(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full">
            <img
              src={fotoExpandida}
              alt="Foto da ferramenta"
              className="w-full h-full object-contain"
            />
            <button
              onClick={() => setFotoExpandida(null)}
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
