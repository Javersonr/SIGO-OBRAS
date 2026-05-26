import React, { useState, useEffect, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, CheckCircle2, AlertCircle, ArrowRight, MapPin, Eye } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ScannerCodigoBarras({
  open,
  onClose,
  empresaAtiva,
  user,
  onFerramentaScaneada,
  ferramentas,
  funcionarios = [],
  projetos = [],
  almoxarifados = [],
}) {
  const [codigoScaneado, setCodigoScaneado] = useState("");
  const [ferramentaEncontrada, setFerramentaEncontrada] = useState(null);
  const [ferramentasEncontradas, setFerramentasEncontradas] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [acao, setAcao] = useState(""); // 'consultar', 'movimentar', 'entrada'
  const [tipoMovimentacao, setTipoMovimentacao] = useState("Entrega para Funcionário");
  const [formMovimentacao, setFormMovimentacao] = useState({
    funcionario_id: "",
    funcionario_nome: "",
    projeto_id: "",
    projeto_nome: "",
    destino: "",
    observacoes: "",
    data_movimentacao: new Date().toISOString().split("T")[0],
  });

  const scannerRef = useRef(null);
  const html5QrcodeScannerRef = useRef(null);

  useEffect(() => {
    if (open && scanning) {
      initScanner();
    }

    return () => {
      if (html5QrcodeScannerRef.current) {
        html5QrcodeScannerRef.current.clear().catch(console.error);
        html5QrcodeScannerRef.current = null;
      }
    };
  }, [open, scanning]);

  const initScanner = () => {
    if (!scannerRef.current || html5QrcodeScannerRef.current) return;

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      rememberLastUsedCamera: true,
    };

    html5QrcodeScannerRef.current = new Html5QrcodeScanner("qr-reader", config, false);

    html5QrcodeScannerRef.current.render(onScanSuccess, onScanError);
  };

  const onScanSuccess = (decodedText) => {
    setCodigoScaneado(decodedText);
    buscarFerramentaPorCodigo(decodedText);

    // Parar o scanner
    if (html5QrcodeScannerRef.current) {
      html5QrcodeScannerRef.current.clear().catch(console.error);
      html5QrcodeScannerRef.current = null;
    }
    setScanning(false);
  };

  const onScanError = (error) => {
    // Ignorar erros de scanner (muito frequentes durante scan)
  };

  const buscarFerramentaPorCodigo = async (codigo) => {
    try {
      // Buscar por código exato ou número de série
      const ferramentasPorCodigo = ferramentas.filter(
        (f) =>
          f.codigo?.toLowerCase() === codigo.toLowerCase() ||
          f.numero_serie?.toLowerCase() === codigo.toLowerCase()
      );

      if (ferramentasPorCodigo.length === 0) {
        toast.error("Nenhuma ferramenta encontrada com este código");
        setFerramentaEncontrada(null);
        setFerramentasEncontradas([]);
        return;
      }

      if (ferramentasPorCodigo.length === 1) {
        setFerramentaEncontrada(ferramentasPorCodigo[0]);
        setFerramentasEncontradas([]);
        toast.success("Ferramenta encontrada!");
      } else {
        // Múltiplas ferramentas com mesmo código (unidades diferentes)
        setFerramentasEncontradas(ferramentasPorCodigo);
        setFerramentaEncontrada(null);
        toast.success(`${ferramentasPorCodigo.length} unidades encontradas`);
      }
    } catch (error) {
      console.error("Erro ao buscar ferramenta:", error);
      toast.error("Erro ao buscar ferramenta");
    }
  };

  const handleIniciarScanner = () => {
    setScanning(true);
    setCodigoScaneado("");
    setFerramentaEncontrada(null);
    setFerramentasEncontradas([]);
    setAcao("");
  };

  const handleMovimentar = async (ferramentaSelecionada) => {
    if (!ferramentaSelecionada) return;

    try {
      const dadosMovimentacao = {
        empresa_id: empresaAtiva.id,
        ferramenta_id: ferramentaSelecionada.id,
        ferramenta_codigo: ferramentaSelecionada.codigo,
        ferramenta_descricao: ferramentaSelecionada.descricao,
        tipo_movimentacao: tipoMovimentacao,
        quantidade: 1,
        usuario_nome: user.full_name,
        usuario_email: user.email,
        funcionario_id: formMovimentacao.funcionario_id || null,
        funcionario_nome: formMovimentacao.funcionario_nome || null,
        projeto_id: formMovimentacao.projeto_id || null,
        projeto_nome: formMovimentacao.projeto_nome || null,
        destino: formMovimentacao.destino || formMovimentacao.funcionario_nome || "",
        observacoes: formMovimentacao.observacoes || "",
        data_movimentacao: formMovimentacao.data_movimentacao,
        status: "Realizada",
      };

      await base44.entities.MovimentacaoFerramenta.create(dadosMovimentacao);

      // Atualizar status da ferramenta
      let novoStatus = ferramentaSelecionada.status;
      let novosDados = {};

      if (tipoMovimentacao === "Entrega para Funcionário") {
        novoStatus = "Em Uso";
        novosDados = {
          status: novoStatus,
          funcionario_id: formMovimentacao.funcionario_id,
          funcionario_nome: formMovimentacao.funcionario_nome,
          localizacao: formMovimentacao.funcionario_nome,
        };
      } else if (tipoMovimentacao === "Devolução") {
        novoStatus = "Disponível";
        novosDados = {
          status: novoStatus,
          funcionario_id: null,
          funcionario_nome: null,
          localizacao: formMovimentacao.destino || "Almoxarifado",
        };
      } else if (tipoMovimentacao === "Manutenção") {
        novoStatus = "Em Manutenção";
        novosDados = {
          status: novoStatus,
          localizacao: "Em Manutenção",
        };
      }

      await base44.entities.Ferramenta.update(ferramentaSelecionada.id, novosDados);

      toast.success("Movimentação registrada com sucesso!");

      // Reset
      setFerramentaEncontrada(null);
      setFerramentasEncontradas([]);
      setAcao("");
      setCodigoScaneado("");
      setFormMovimentacao({
        funcionario_id: "",
        funcionario_nome: "",
        projeto_id: "",
        projeto_nome: "",
        destino: "",
        observacoes: "",
        data_movimentacao: new Date().toISOString().split("T")[0],
      });

      if (onFerramentaScaneada) {
        onFerramentaScaneada();
      }
    } catch (error) {
      console.error("Erro ao movimentar:", error);
      toast.error("Erro ao registrar movimentação");
    }
  };

  const handleConsultarDetalhes = (ferramenta) => {
    if (onFerramentaScaneada) {
      onFerramentaScaneada(ferramenta);
    }
    handleFechar();
  };

  const handleFechar = () => {
    if (html5QrcodeScannerRef.current) {
      html5QrcodeScannerRef.current.clear().catch(console.error);
      html5QrcodeScannerRef.current = null;
    }
    setScanning(false);
    setCodigoScaneado("");
    setFerramentaEncontrada(null);
    setFerramentasEncontradas([]);
    setAcao("");
    onClose();
  };

  const statusColors = {
    Disponível: "bg-green-100 text-green-700",
    "Em Uso": "bg-blue-100 text-blue-700",
    "Em Manutenção": "bg-orange-100 text-orange-700",
    Danificado: "bg-red-100 text-red-700",
    Inativo: "bg-slate-100 text-slate-700",
    Sucata: "bg-red-100 text-red-700",
  };

  return (
    <Dialog open={open} onOpenChange={handleFechar}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-amber-600" />
            Scanner de Código de Barras / QR Code
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scanner ou Resultado */}
          {!scanning && !ferramentaEncontrada && ferramentasEncontradas.length === 0 && (
            <div className="text-center py-8">
              <Camera className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-600 mb-4">
                Escaneie o código de barras ou QR code de uma ferramenta
              </p>
              <Button
                onClick={handleIniciarScanner}
                className="bg-amber-500 hover:bg-amber-600 gap-2"
              >
                <Camera className="w-4 h-4" />
                Iniciar Scanner
              </Button>
            </div>
          )}

          {/* Scanner Ativo */}
          {scanning && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <div id="qr-reader" ref={scannerRef}></div>
                </CardContent>
              </Card>
              <Button
                onClick={() => {
                  if (html5QrcodeScannerRef.current) {
                    html5QrcodeScannerRef.current.clear().catch(console.error);
                    html5QrcodeScannerRef.current = null;
                  }
                  setScanning(false);
                }}
                variant="outline"
                className="w-full"
              >
                Cancelar Scanner
              </Button>
            </div>
          )}

          {/* Ferramenta Única Encontrada */}
          {ferramentaEncontrada && !acao && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
                <CheckCircle2 className="w-5 h-5 mt-0.5" />
                <div>
                  <p className="font-semibold">Ferramenta encontrada!</p>
                  <p className="text-sm">Código: {codigoScaneado}</p>
                </div>
              </div>

              <Card className="bg-slate-50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-800 text-lg">
                        {ferramentaEncontrada.descricao}
                      </p>
                      <p className="text-sm text-slate-500">
                        Código: {ferramentaEncontrada.codigo}
                      </p>
                      {ferramentaEncontrada.numero_serie && (
                        <p className="text-sm text-slate-500">
                          Nº Série: {ferramentaEncontrada.numero_serie}
                        </p>
                      )}
                    </div>
                    <Badge className={statusColors[ferramentaEncontrada.status]}>
                      {ferramentaEncontrada.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                    <div>
                      <p className="text-xs text-slate-500">Localização</p>
                      <p className="text-sm font-medium flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {ferramentaEncontrada.localizacao || "-"}
                      </p>
                    </div>
                    {ferramentaEncontrada.marca && (
                      <div>
                        <p className="text-xs text-slate-500">Marca</p>
                        <p className="text-sm font-medium">{ferramentaEncontrada.marca}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Ações */}
              <div className="grid grid-cols-1 gap-3">
                <Button
                  onClick={() => handleConsultarDetalhes(ferramentaEncontrada)}
                  className="gap-2"
                  variant="outline"
                >
                  <Eye className="w-4 h-4" />
                  Consultar Detalhes
                </Button>
                <Button
                  onClick={() => setAcao("movimentar")}
                  className="bg-amber-500 hover:bg-amber-600 gap-2"
                >
                  <ArrowRight className="w-4 h-4" />
                  Criar Movimentação
                </Button>
              </div>

              <Button onClick={handleIniciarScanner} variant="outline" className="w-full">
                <Camera className="w-4 h-4 mr-2" />
                Escanear Outro
              </Button>
            </div>
          )}

          {/* Múltiplas Ferramentas Encontradas */}
          {ferramentasEncontradas.length > 0 && !acao && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
                <AlertCircle className="w-5 h-5 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    {ferramentasEncontradas.length} unidades encontradas
                  </p>
                  <p className="text-sm">Código: {codigoScaneado}</p>
                </div>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {ferramentasEncontradas.map((ferr, idx) => (
                  <Card
                    key={ferr.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => {
                      setFerramentaEncontrada(ferr);
                      setFerramentasEncontradas([]);
                    }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-800">Unidade #{idx + 1}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={statusColors[ferr.status]} variant="outline">
                              {ferr.status}
                            </Badge>
                            {ferr.numero_serie && (
                              <span className="text-xs text-slate-500">
                                NS: {ferr.numero_serie}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {ferr.localizacao || "-"}
                          </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-400" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button onClick={handleIniciarScanner} variant="outline" className="w-full">
                <Camera className="w-4 h-4 mr-2" />
                Escanear Outro
              </Button>
            </div>
          )}

          {/* Formulário de Movimentação */}
          {acao === "movimentar" && ferramentaEncontrada && (
            <div className="space-y-4">
              <Card className="bg-slate-50">
                <CardContent className="p-3">
                  <p className="text-sm text-slate-600">
                    <strong>{ferramentaEncontrada.codigo}</strong> -{" "}
                    {ferramentaEncontrada.descricao}
                  </p>
                </CardContent>
              </Card>

              <div>
                <Label>Tipo de Movimentação *</Label>
                <Select value={tipoMovimentacao} onValueChange={setTipoMovimentacao}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Entrega para Funcionário">
                      Entrega para Funcionário
                    </SelectItem>
                    <SelectItem value="Devolução">Devolução</SelectItem>
                    <SelectItem value="Empréstimo">Empréstimo</SelectItem>
                    <SelectItem value="Manutenção">Manutenção</SelectItem>
                    <SelectItem value="Baixa para Sucata">Baixa para Sucata</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {tipoMovimentacao === "Entrega para Funcionário" && (
                <div>
                  <Label>Funcionário *</Label>
                  <Select
                    value={formMovimentacao.funcionario_id}
                    onValueChange={(v) => {
                      const func = funcionarios.find((f) => f.id === v);
                      setFormMovimentacao({
                        ...formMovimentacao,
                        funcionario_id: v,
                        funcionario_nome: func?.nome || "",
                      });
                    }}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Selecione o funcionário" />
                    </SelectTrigger>
                    <SelectContent>
                      {funcionarios.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(tipoMovimentacao === "Devolução" || tipoMovimentacao === "Empréstimo") && (
                <div>
                  <Label>Destino</Label>
                  <Select
                    value={formMovimentacao.destino}
                    onValueChange={(v) => setFormMovimentacao({ ...formMovimentacao, destino: v })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Selecione o local" />
                    </SelectTrigger>
                    <SelectContent>
                      {almoxarifados.map((local) => (
                        <SelectItem key={local} value={local}>
                          {local}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Projeto (Opcional)</Label>
                <Select
                  value={formMovimentacao.projeto_id}
                  onValueChange={(v) => {
                    const proj = projetos.find((p) => p.id === v);
                    setFormMovimentacao({
                      ...formMovimentacao,
                      projeto_id: v,
                      projeto_nome: proj?.nome || "",
                    });
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione o projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    {projetos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Data</Label>
                <Input
                  type="date"
                  value={formMovimentacao.data_movimentacao}
                  onChange={(e) =>
                    setFormMovimentacao({ ...formMovimentacao, data_movimentacao: e.target.value })
                  }
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  value={formMovimentacao.observacoes}
                  onChange={(e) =>
                    setFormMovimentacao({ ...formMovimentacao, observacoes: e.target.value })
                  }
                  placeholder="Informações adicionais..."
                  className="mt-1.5"
                  rows={2}
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setAcao("")} className="flex-1">
                  Voltar
                </Button>
                <Button
                  onClick={() => handleMovimentar(ferramentaEncontrada)}
                  className="bg-amber-500 hover:bg-amber-600 flex-1"
                  disabled={
                    tipoMovimentacao === "Entrega para Funcionário" &&
                    !formMovimentacao.funcionario_id
                  }
                >
                  Confirmar Movimentação
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
