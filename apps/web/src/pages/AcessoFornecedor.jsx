import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Calendar, Package, Check, AlertCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function AcessoFornecedor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cotacao, setCotacao] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [itens, setItens] = useState([]);
  const [respostas, setRespostas] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [cotacaoFornecedor, setCotacaoFornecedor] = useState(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [arquivosAnexados, setArquivosAnexados] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [token, setToken] = useState(null);

  useEffect(() => {
    // Pegar token da query param: ?token=xxx
    // Com hash routing (#/AcessoFornecedor?token=xxx), os params ficam no hash
    const hash = window.location.hash; // ex: "#/AcessoFornecedor?token=abc123"
    const queryString = hash.includes("?") ? hash.split("?")[1] : window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const t = urlParams.get("token");

    if (!t) {
      // Em desenvolvimento, carregar dados mock para preview
      if (import.meta.env.DEV) {
        setCotacao({
          numero: "COT2026-0001",
          projeto_nome: "Projeto Teste",
          data_limite: "2026-03-31",
          observacoes: "Cotação de teste para desenvolvimento",
        });
        setEmpresa({ razao_social: "Empresa Teste Ltda", nome_fantasia: "Empresa Teste" });
        setItens([
          {
            id: "1",
            descricao: "Terminal de pressão/compressão para cabo",
            codigo: "EL-001",
            especificacoes: "Para cabo de 6 a 10mm²",
            quantidade: 4,
            unidade: "UN",
          },
          {
            id: "2",
            descricao: "Tuxa Phdomar",
            codigo: "EL-002",
            especificacoes: "",
            quantidade: 1,
            unidade: "UN",
          },
          {
            id: "3",
            descricao: "Cabo de cobre flexível 70mm² AZUL",
            codigo: "EL-003",
            especificacoes: "Isolamento 0,6/1kV - voltagem HEPR 90°C",
            quantidade: 100,
            unidade: "M",
          },
        ]);
        setCotacaoFornecedor({ status: "Visualizada" });
        setLoading(false);
        return;
      }
      setError("Token não informado. Verifique o link recebido.");
      setLoading(false);
      return;
    }

    setToken(t);
    loadCotacao(t);
  }, []);

  const loadCotacao = async (t) => {
    try {
      const result = await base44.functions.invoke("carregarCotacaoFornecedor", { token: t });
      const data = result.data;

      if (!data || data.error) {
        setError(data?.error || "Cotação não encontrada");
        setLoading(false);
        return;
      }

      setCotacao(data.cotacao);
      setEmpresa(data.empresa);
      setItens((data.itens || []).sort((a, b) => a.descricao?.localeCompare(b.descricao, "pt-BR")));
      setCotacaoFornecedor(data.cotacaoFornecedor);

      // Mapear respostas já existentes
      const respostasMap = {};
      (data.respostas || []).forEach((resp) => {
        respostasMap[resp.item_id] = {
          valor_unitario: resp.valor_unitario,
          prazo_entrega: resp.prazo_entrega_dias,
          observacoes: resp.observacoes,
        };
      });
      setRespostas(respostasMap);

      // Verificar se já respondeu (status "Enviada" = reaberto pelo admin, pode editar novamente)
      const statusJaRespondido = [
        "Respondida Totalmente",
        "Respondida Parcialmente",
        "Impossível Responder",
      ];
      const foiReaberto = data.cotacaoFornecedor?.status === "Enviada";
      if (statusJaRespondido.includes(data.cotacaoFornecedor?.status) && !foiReaberto) {
        setEnviado(true);
      } else {
        setEnviado(false);
      }

      // Marcar como visualizada
      if (data.cotacaoFornecedor?.status === "Enviada") {
        await base44.functions.invoke("carregarCotacaoFornecedor", {
          token: t,
          marcar_visualizada: true,
        });
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar cotação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleRespostaChange = (itemId, campo, valor) => {
    setRespostas((prev) => ({
      ...prev,
      [itemId]: {
        valor_unitario: prev[itemId]?.valor_unitario || "",
        prazo_entrega: prev[itemId]?.prazo_entrega || "",
        observacoes: prev[itemId]?.observacoes || "",
        [campo]: valor,
      },
    }));
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0 || !cotacaoFornecedor) return;

    setUploadingFiles(true);
    try {
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const arquivo = await base44.functions.invoke("salvarRespostaFornecedor", {
          token,
          action: "upload_arquivo",
          arquivo: {
            nome_arquivo: file.name,
            url_arquivo: file_url,
            tamanho: file.size,
            tipo: file.type,
          },
        });
        if (arquivo?.data?.arquivo) {
          setArquivosAnexados((prev) => [...prev, arquivo.data.arquivo]);
        }
      }
      toast.success(`${files.length} arquivo(s) anexado(s)!`);
    } catch (err) {
      toast.error("Erro ao anexar arquivos");
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleMarcarImpossivel = async () => {
    if (!motivoRecusa.trim()) {
      toast.error("Por favor, informe o motivo");
      return;
    }
    setEnviando(true);
    try {
      const result = await base44.functions.invoke("salvarRespostaFornecedor", {
        token,
        action: "impossivel",
        motivo_recusa: motivoRecusa,
      });
      if (result.data?.success) {
        setEnviado(true);
        setCotacaoFornecedor((prev) => ({
          ...prev,
          status: "Impossível Responder",
          motivo_recusa: motivoRecusa,
        }));
        toast.success("Status atualizado");
      } else {
        toast.error(result.data?.error || "Erro ao atualizar");
      }
    } catch (err) {
      toast.error("Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  };

  const handleEnviarResposta = async () => {
    const itensComResposta = itens.filter((item) => respostas[item.id]?.valor_unitario);
    if (itensComResposta.length === 0) {
      toast.error("Preencha pelo menos um item");
      return;
    }
    if (!responsavel.trim()) {
      toast.error("Informe o responsável pela cotação");
      return;
    }

    setEnviando(true);
    try {
      const result = await base44.functions.invoke("salvarRespostaFornecedor", {
        token,
        action: "responder",
        respostas,
        responsavel,
        itens: itens.map((i) => ({
          id: i.id,
          descricao: i.descricao,
          quantidade: i.quantidade,
          unidade: i.unidade,
        })),
      });
      if (result.data?.success) {
        setEnviado(true);
        toast.success("Cotação enviada com sucesso!");
      } else {
        toast.error(result.data?.error || "Erro ao enviar");
      }
    } catch (err) {
      toast.error("Erro ao enviar cotação");
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Carregando cotação...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">Erro ao acessar cotação</h2>
            <p className="text-slate-600 text-sm">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white shadow-sm">
        <div className="w-full px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(createPageUrl("HistoricoCotacoes"))}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
            title="Voltar ao histórico"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-800 flex-shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800">
              {empresa?.nome_fantasia || empresa?.razao_social || "Cotação"}
            </h1>
            <p className="text-xs text-slate-500">Cotação {cotacao?.numero}</p>
          </div>
        </div>
      </div>

      <div className="w-full p-4 space-y-4 pb-24">
        {/* Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Informações da Cotação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {cotacao?.projeto_nome && (
              <div className="flex items-center gap-2 text-sm">
                <Package className="w-4 h-4 text-slate-400" />
                <span>
                  Projeto: <strong>{cotacao.projeto_nome}</strong>
                </span>
              </div>
            )}
            {cotacao?.data_limite && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>
                  Prazo:{" "}
                  <strong>{new Date(cotacao.data_limite).toLocaleDateString("pt-BR")}</strong>
                </span>
              </div>
            )}
            {cotacao?.observacoes && (
              <div className="p-3 bg-slate-50 rounded border text-sm">
                <p className="font-medium mb-1">Observações:</p>
                <p className="text-slate-600">{cotacao.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status de envio */}
        {enviado && cotacaoFornecedor?.status === "Impossível Responder" && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900">Marcado como Impossível Responder</p>
                <p className="text-sm text-amber-700">{cotacaoFornecedor.motivo_recusa}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {enviado && cotacaoFornecedor?.status !== "Impossível Responder" && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4 flex items-center gap-3">
              <Check className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-medium text-green-900">Cotação Enviada com Sucesso!</p>
                <p className="text-sm text-green-700">Suas respostas foram registradas.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Itens */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Itens para Cotação</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-0">
            {/* Cabeçalho da tabela */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-slate-100 text-xs font-semibold text-slate-600 border-b">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-1 text-center">Código</div>
              <div className="col-span-3">Descrição</div>
              <div className="col-span-1 text-center">Qtd</div>
              <div className="col-span-2 text-center">Vlr Unit (R$) *</div>
              <div className="col-span-1 text-center">Prazo (d)</div>
              <div className="col-span-2 text-center">Total</div>
              <div className="col-span-1 text-center">Obs</div>
            </div>

            {itens.map((item, idx) => (
              <div
                key={item.id}
                className={`border-b last:border-b-0 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
              >
                {/* Layout Desktop - linha única */}
                <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-3 items-center">
                  <div className="col-span-1 text-center">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mx-auto">
                      {idx + 1}
                    </span>
                  </div>
                  <div className="col-span-1 text-center">
                    <p className="text-xs font-semibold text-blue-600">{item.codigo || "-"}</p>
                  </div>
                  <div className="col-span-3 min-w-0">
                    <p className="text-sm font-medium text-slate-900 leading-snug">
                      {item.descricao}
                    </p>
                    {item.especificacoes && (
                      <p className="text-xs text-slate-400 italic truncate">
                        {item.especificacoes}
                      </p>
                    )}
                  </div>
                  <div className="col-span-1 text-center text-sm font-medium text-slate-700">
                    {item.quantidade}
                    <br />
                    <span className="text-xs text-slate-400">{item.unidade}</span>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={respostas[item.id]?.valor_unitario || ""}
                      onChange={(e) =>
                        handleRespostaChange(item.id, "valor_unitario", e.target.value)
                      }
                      disabled={enviado}
                      className="h-8 text-sm text-center"
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      type="text"
                      placeholder="15"
                      value={respostas[item.id]?.prazo_entrega || ""}
                      onChange={(e) =>
                        handleRespostaChange(item.id, "prazo_entrega", e.target.value)
                      }
                      disabled={enviado}
                      className="h-8 text-sm text-center"
                    />
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="text-sm font-semibold text-green-700">
                      {respostas[item.id]?.valor_unitario
                        ? `R$ ${(parseFloat(respostas[item.id].valor_unitario) * item.quantidade).toFixed(2)}`
                        : "R$ 0,00"}
                    </span>
                  </div>
                  <div className="col-span-1">
                    <Input
                      type="text"
                      placeholder="..."
                      value={respostas[item.id]?.observacoes || ""}
                      onChange={(e) => handleRespostaChange(item.id, "observacoes", e.target.value)}
                      disabled={enviado}
                      className="h-8 text-xs"
                      title="Observações"
                    />
                  </div>
                </div>

                {/* Layout Mobile */}
                <div className="sm:hidden p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{item.descricao}</p>
                      {item.codigo && (
                        <p className="text-xs font-semibold text-blue-600">Cód: {item.codigo}</p>
                      )}
                      {item.especificacoes && (
                        <p className="text-xs text-slate-400 italic">{item.especificacoes}</p>
                      )}
                      <p className="text-xs text-slate-600 mt-0.5">
                        Qtd:{" "}
                        <strong>
                          {item.quantidade} {item.unidade}
                        </strong>
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-slate-500">Vlr Unit (R$) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={respostas[item.id]?.valor_unitario || ""}
                        onChange={(e) =>
                          handleRespostaChange(item.id, "valor_unitario", e.target.value)
                        }
                        disabled={enviado}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Prazo (dias)</Label>
                      <Input
                        type="text"
                        placeholder="15"
                        value={respostas[item.id]?.prazo_entrega || ""}
                        onChange={(e) =>
                          handleRespostaChange(item.id, "prazo_entrega", e.target.value)
                        }
                        disabled={enviado}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Obs</Label>
                      <Input
                        type="text"
                        placeholder="..."
                        value={respostas[item.id]?.observacoes || ""}
                        onChange={(e) =>
                          handleRespostaChange(item.id, "observacoes", e.target.value)
                        }
                        disabled={enviado}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-green-700">
                    Total:{" "}
                    {respostas[item.id]?.valor_unitario
                      ? `R$ ${(parseFloat(respostas[item.id].valor_unitario) * item.quantidade).toFixed(2)}`
                      : "R$ 0,00"}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Responsável */}
        {!enviado && (
          <Card>
            <CardContent className="p-4">
              <Label className="text-sm font-medium">Nome do Responsável *</Label>
              <Input
                placeholder="Digite seu nome completo"
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
                className="mt-2"
              />
            </CardContent>
          </Card>
        )}

        {/* Impossível Responder */}
        {!enviado && (
          <Card className="border-amber-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
                <AlertCircle className="w-4 h-4" />
                Não consegue responder?
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <Textarea
                placeholder="Informe o motivo (obrigatório)..."
                value={motivoRecusa}
                onChange={(e) => setMotivoRecusa(e.target.value)}
                rows={2}
              />
              <Button
                onClick={handleMarcarImpossivel}
                disabled={enviando || !motivoRecusa.trim()}
                variant="outline"
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                Marcar como Impossível Responder
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Botão fixo */}
      {!enviado && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg">
          <Button
            onClick={handleEnviarResposta}
            disabled={enviando}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base"
          >
            {enviando ? "Enviando..." : "Enviar Cotação"}
          </Button>
        </div>
      )}
    </div>
  );
}
