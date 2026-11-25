import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { sigo, supabase } from "@/api/sigoClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2,
  Calendar,
  Package,
  Check,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  ACEITA_ORCAMENTO,
  aplicarSugestoes,
  campoLido,
  erroArquivoOrcamento,
  limparSugeridos,
  marcaDoItem,
  MAX_MB_ORCAMENTO,
  perguntaAntesDeEnviar,
  resumoDaLeitura,
  tamanhoLegivel,
  textoForaDaCotacao,
} from "@/lib/orcamento-fornecedor";

const ROTULO_MARCA = {
  lido: "Lido do arquivo, confira",
  atencao: "Lido do arquivo, confira com atenção",
  mantido: "Valor digitado por você",
  nao_encontrado: "Não encontrado no arquivo, preencha à mão",
};
const ESTILO_MARCA = {
  lido: "bg-blue-50 text-blue-800 border-blue-200",
  atencao: "bg-amber-50 text-amber-900 border-amber-300",
  mantido: "bg-slate-100 text-slate-700 border-slate-200",
  nao_encontrado: "bg-slate-100 text-slate-600 border-slate-200",
};
// realce do campo que ainda está com o valor lido do arquivo
const CAMPO_LIDO = "border-blue-400 bg-blue-50";
const CAMPO_ATENCAO = "border-amber-400 bg-amber-50";

/** Marca do item depois da leitura do orçamento anexado (regra em lib/orcamento-fornecedor.js). */
function MarcaLeitura({ marca }) {
  if (!marca) return null;
  return (
    <div className={`rounded border px-2 py-1 text-xs ${ESTILO_MARCA[marca.tipo]}`}>
      <p className="font-medium flex items-center gap-1">
        {marca.tipo === "atencao" && <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
        {ROTULO_MARCA[marca.tipo]}
      </p>
      {marca.textos.map((texto) => (
        <p key={texto}>{texto}</p>
      ))}
      {marca.noDocumento && <p className="italic">No arquivo: {marca.noDocumento}</p>}
    </div>
  );
}

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
  // cotação encerrada / prazo vencido: o servidor recusa resposta; a tela só mostra
  const [motivoBloqueio, setMotivoBloqueio] = useState(null);
  const somenteLeitura = enviado || Boolean(motivoBloqueio);
  const [cotacaoFornecedor, setCotacaoFornecedor] = useState(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [token, setToken] = useState(null);

  // Orçamento (PDF ou foto) anexado pelo fornecedor e lido pela IA — função
  // portal-fornecedor-orcamento. A leitura só PREENCHE os campos vazios; quem grava
  // preço continua sendo o "Enviar Cotação". orcamento = null → função fora do ar: o
  // cartão some e o preenchimento à mão segue igual.
  const [orcamento, setOrcamento] = useState(null); // { disponivel, anexo, limites }
  const [faseOrcamento, setFaseOrcamento] = useState(null); // "enviando" | "lendo" | "removendo"
  const [leitura, setLeitura] = useState(null);
  const [sugerido, setSugerido] = useState({});
  const [mantidos, setMantidos] = useState([]);
  const inputOrcamentoRef = useRef(null);
  // o envio e a leitura demoram: o que o fornecedor digitar nesse meio-tempo não pode
  // ser sobrescrito por um estado antigo
  const respostasRef = useRef(respostas);
  respostasRef.current = respostas;
  const sugeridoRef = useRef(sugerido);
  sugeridoRef.current = sugerido;

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
        setOrcamento({ disponivel: true, anexo: null, limites: { max_mb: MAX_MB_ORCAMENTO } });
        setLoading(false);
        return;
      }
      setError("Token não informado. Verifique o link recebido.");
      setLoading(false);
      return;
    }

    setToken(t);
    loadCotacao(t);
    carregarOrcamento(t);
  }, []);

  const carregarOrcamento = async (t) => {
    const { data } = await sigo.functions.invoke("portalFornecedorOrcamento", {
      token: t,
      action: "situacao",
    });
    setOrcamento(
      data?.success
        ? { disponivel: !!data.disponivel, anexo: data.anexo || null, limites: data.limites || {} }
        : null
    );
  };

  const loadCotacao = async (t) => {
    try {
      const result = await sigo.functions.invoke("portalFornecedorCotacao", { token: t });
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
      setMotivoBloqueio(data.aceita_respostas === false ? data.motivo_bloqueio : null);

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
        await sigo.functions.invoke("portalFornecedorCotacao", {
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

  // Anexo do orçamento: o fornecedor é `anon`, então a Edge Function prepara um envio
  // ASSINADO na pasta da participação (como no portal do cliente); o arquivo vai direto
  // ao Storage e a função confere, guarda a referência e devolve a leitura da IA.
  const aplicarLeitura = (lida) => {
    const aplicado = aplicarSugestoes(
      respostasRef.current,
      lida?.feita ? lida.sugestoes : {},
      sugeridoRef.current
    );
    setRespostas(aplicado.respostas);
    setSugerido(aplicado.sugerido);
    setMantidos(aplicado.mantidos);
    setLeitura(lida || null);
    if (lida?.feita && lida.lidos > 0) {
      toast.success("Orçamento lido. Confira os valores destacados.");
    } else {
      toast.warning(resumoDaLeitura(lida)?.titulo || "Arquivo anexado");
    }
  };

  const handleArquivoOrcamento = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // deixa escolher o mesmo arquivo de novo
    if (!arquivo) return;
    const erro = erroArquivoOrcamento(arquivo, orcamento?.limites?.max_mb || MAX_MB_ORCAMENTO);
    if (erro) {
      toast.error(erro);
      return;
    }

    // Preview de desenvolvimento (sem token): simula a leitura, sem rede
    if (import.meta.env.DEV && !token) {
      setOrcamento((o) => ({ ...o, anexo: { nome: arquivo.name, tamanho: arquivo.size } }));
      aplicarLeitura({
        feita: true,
        lidos: 2,
        total: itens.length,
        avisos: [],
        sugestoes: {
          [itens[0]?.id]: {
            valor_unitario: 48.9,
            prazo_entrega: 7,
            observacoes: "Marca/modelo: Exemplo",
            descricao_no_documento: "ITEM COMO ESTÁ NO ARQUIVO",
            atencao: [],
          },
          [itens[1]?.id]: {
            valor_unitario: 185,
            prazo_entrega: 7,
            observacoes: "",
            descricao_no_documento: "",
            atencao: ['No documento a unidade é "CX C/100"; nesta cotação é "UN".'],
          },
        },
        nao_encontrados: itens.slice(2).map((i) => i.id),
        fora_da_cotacao: [{ descricao: "Fita isolante 20 m", valor_unitario: 7.9 }],
      });
      return;
    }

    setFaseOrcamento("enviando");
    try {
      const { data: prep } = await sigo.functions.invoke("portalFornecedorOrcamento", {
        token,
        action: "preparar_upload",
        nome: arquivo.name,
        tamanho: arquivo.size,
      });
      if (!prep?.success) {
        if (prep?.codigo === "COTACAO_ENCERRADA") setMotivoBloqueio(prep.error);
        throw new Error(prep?.error || "Não foi possível preparar o envio do arquivo");
      }
      if (!supabase) throw new Error("Não foi possível enviar o arquivo");
      const { error: upErr } = await supabase.storage
        .from(prep.bucket)
        .uploadToSignedUrl(prep.path, prep.token, arquivo, {
          contentType: prep.content_type || arquivo.type || "application/octet-stream",
        });
      if (upErr) throw new Error("Não foi possível enviar o arquivo. Tente de novo.");

      setFaseOrcamento("lendo");
      const { data: res } = await sigo.functions.invoke("portalFornecedorOrcamento", {
        token,
        action: "anexar",
        ref: prep.ref,
        nome: arquivo.name,
      });
      if (!res?.success) throw new Error(res?.error || "Não foi possível anexar o arquivo");
      setOrcamento((o) => ({ ...(o || {}), disponivel: true, anexo: res.anexo || null }));
      aplicarLeitura(res.leitura);
    } catch (err) {
      toast.error(err?.message || "Não foi possível anexar o arquivo");
    } finally {
      setFaseOrcamento(null);
    }
  };

  const handleRemoverOrcamento = async () => {
    if (
      !window.confirm(
        "Remover o orçamento anexado? Os valores lidos dele que você não alterou também saem."
      )
    ) {
      return;
    }
    setFaseOrcamento("removendo");
    try {
      const { data } =
        import.meta.env.DEV && !token
          ? { data: { success: true } }
          : await sigo.functions.invoke("portalFornecedorOrcamento", { token, action: "remover" });
      if (!data?.success) throw new Error(data?.error || "Não foi possível remover o arquivo");
      setOrcamento((o) => ({ ...(o || {}), anexo: null }));
      setRespostas(limparSugeridos(respostasRef.current, sugeridoRef.current));
      setSugerido({});
      setMantidos([]);
      setLeitura(null);
      toast.success("Orçamento removido");
    } catch (err) {
      toast.error(err?.message || "Não foi possível remover o arquivo");
    } finally {
      setFaseOrcamento(null);
    }
  };

  const handleMarcarImpossivel = async () => {
    if (!motivoRecusa.trim()) {
      toast.error("Por favor, informe o motivo");
      return;
    }
    setEnviando(true);
    try {
      const result = await sigo.functions.invoke("portalFornecedorResposta", {
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
        if (result.data?.codigo === "COTACAO_ENCERRADA") setMotivoBloqueio(result.data.error);
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
    // valores que a leitura do arquivo pôs e ninguém mexeu: o fornecedor confirma que conferiu
    const pergunta = perguntaAntesDeEnviar(respostas, sugerido);
    if (pergunta && !window.confirm(pergunta)) return;

    setEnviando(true);
    try {
      // itens/quantidades o servidor lê da própria cotação
      const result = await sigo.functions.invoke("portalFornecedorResposta", {
        token,
        action: "responder",
        respostas,
        responsavel,
      });
      if (result.data?.success) {
        setEnviado(true);
        toast.success("Cotação enviada com sucesso!");
      } else {
        if (result.data?.codigo === "COTACAO_ENCERRADA") setMotivoBloqueio(result.data.error);
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

  const contextoLeitura = { respostas, sugerido, leitura, mantidos };
  const resumo = resumoDaLeitura(leitura);
  const foraDaCotacao = leitura?.feita ? textoForaDaCotacao(leitura.fora_da_cotacao) : "";
  const maxMbOrcamento = orcamento?.limites?.max_mb || MAX_MB_ORCAMENTO;
  /** realce do campo enquanto ele está com o valor lido do arquivo */
  const classeCampoLido = (itemId, campo, marca) =>
    campoLido(respostas, sugerido, itemId, campo)
      ? marca?.tipo === "atencao"
        ? CAMPO_ATENCAO
        : CAMPO_LIDO
      : "";

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
                  {/* data pura gravada como meia-noite UTC: em BRT mostraria o dia anterior */}
                  <strong>
                    {new Date(cotacao.data_limite).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                  </strong>
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

        {/* Cotação encerrada / prazo vencido */}
        {motivoBloqueio && (
          <Card className="border-slate-300 bg-slate-100">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-slate-600" />
              <div>
                <p className="font-medium text-slate-900">Cotação fechada para respostas</p>
                <p className="text-sm text-slate-700">{motivoBloqueio}</p>
              </div>
            </CardContent>
          </Card>
        )}

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

        {/* Orçamento em PDF ou foto: a IA preenche, o fornecedor confere */}
        {!somenteLeitura && orcamento?.disponivel && (
          <Card className="border-blue-200">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">Já tem o orçamento pronto?</p>
                  <p className="text-sm text-slate-600">
                    Anexe o PDF ou a foto e nós preenchemos os valores para você conferir.
                  </p>
                </div>
                <input
                  ref={inputOrcamentoRef}
                  type="file"
                  accept={ACEITA_ORCAMENTO}
                  onChange={handleArquivoOrcamento}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => inputOrcamentoRef.current?.click()}
                  disabled={Boolean(faseOrcamento)}
                  className="border-blue-300 text-blue-700 hover:bg-blue-50 flex-shrink-0"
                >
                  {faseOrcamento ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {faseOrcamento === "enviando"
                    ? "Enviando o arquivo..."
                    : faseOrcamento === "lendo"
                      ? "Lendo o orçamento..."
                      : orcamento.anexo
                        ? "Trocar o arquivo"
                        : "Anexar orçamento"}
                </Button>
              </div>
              {faseOrcamento === "lendo" && (
                <p className="text-xs text-blue-700">
                  A leitura pode levar até 2 minutos. Você pode continuar preenchendo enquanto isso.
                </p>
              )}
              {orcamento.anexo && (
                <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 border rounded px-3 py-2">
                  <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="truncate flex-1" title={orcamento.anexo.nome}>
                    {orcamento.anexo.nome}
                  </span>
                  <span className="text-xs text-slate-500 flex-shrink-0">
                    {tamanhoLegivel(orcamento.anexo.tamanho)}
                  </span>
                  <button
                    type="button"
                    onClick={handleRemoverOrcamento}
                    disabled={Boolean(faseOrcamento)}
                    title="Remover o arquivo"
                    aria-label="Remover o arquivo"
                    className="p-1 text-slate-500 hover:text-red-600 disabled:opacity-50 flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-500">
                PDF, JPG ou PNG, até {maxMbOrcamento} MB. O arquivo é lido por um serviço de
                inteligência artificial (Google Gemini ou OpenAI) só para preencher os valores e
                fica guardado junto da cotação, para a empresa consultar. Não envie documentos
                pessoais.
              </p>
            </CardContent>
          </Card>
        )}
        {somenteLeitura && orcamento?.anexo && (
          <Card>
            <CardContent className="p-4 flex items-center gap-2 text-sm text-slate-700">
              <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <span className="truncate">Orçamento anexado: {orcamento.anexo.nome}</span>
            </CardContent>
          </Card>
        )}

        {/* Resultado da leitura do orçamento */}
        {!somenteLeitura && resumo && (
          <Card
            className={
              resumo.tom === "ok" ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"
            }
          >
            <CardContent className="p-4 flex items-start gap-3">
              {resumo.tom === "ok" ? (
                <Check className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              )}
              <div
                className={`space-y-1 ${resumo.tom === "ok" ? "text-blue-900" : "text-amber-900"}`}
              >
                <p className="font-medium">{resumo.titulo}</p>
                <p className="text-sm">{resumo.detalhe}</p>
                {leitura?.feita &&
                  (leitura.avisos || []).map((aviso) => (
                    <p key={aviso} className="text-sm">
                      {aviso}
                    </p>
                  ))}
                {foraDaCotacao && <p className="text-xs">{foraDaCotacao}</p>}
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

            {itens.map((item, idx) => {
              const marca = marcaDoItem(item.id, contextoLeitura);
              return (
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
                        disabled={somenteLeitura}
                        className={`h-8 text-sm text-center ${classeCampoLido(item.id, "valor_unitario", marca)}`}
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
                        disabled={somenteLeitura}
                        className={`h-8 text-sm text-center ${classeCampoLido(item.id, "prazo_entrega", marca)}`}
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
                        onChange={(e) =>
                          handleRespostaChange(item.id, "observacoes", e.target.value)
                        }
                        disabled={somenteLeitura}
                        className="h-8 text-xs"
                        title="Observações"
                      />
                    </div>
                  </div>
                  {!somenteLeitura && marca && (
                    <div className="hidden sm:block px-4 pb-3">
                      <MarcaLeitura marca={marca} />
                    </div>
                  )}

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
                          disabled={somenteLeitura}
                          className={`mt-1 h-8 text-sm ${classeCampoLido(item.id, "valor_unitario", marca)}`}
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
                          disabled={somenteLeitura}
                          className={`mt-1 h-8 text-sm ${classeCampoLido(item.id, "prazo_entrega", marca)}`}
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
                          disabled={somenteLeitura}
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
                    {!somenteLeitura && <MarcaLeitura marca={marca} />}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Responsável */}
        {!somenteLeitura && (
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
        {!somenteLeitura && (
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
      {!somenteLeitura && (
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
