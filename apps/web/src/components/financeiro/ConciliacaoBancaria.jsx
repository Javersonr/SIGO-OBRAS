import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  CheckCircle2,
  XCircle,
  Link2,
  AlertCircle,
  Loader2,
  Undo2,
  Wallet,
} from "lucide-react";
import { sigo, supabase } from "@/api/sigoClient";
import { refDoUpload } from "@/lib/anexo-ref";
import { formatFullDate } from "@/lib/formatters";
import { isStatusPago } from "@/lib/financeiro-utils";
import { useConfirmar } from "@/components/shared/ConfirmarDialog";
import { decodificarArquivoExtrato, lerExtrato, resumoDaImportacao } from "@/lib/extrato-importado";
import {
  centavos,
  dataDaTransacao,
  ehLinhaDoBanco,
  ehSugestao,
  extratoConciliado,
  extratoPendente,
  ordenarRegras,
  mesmoSentido,
  pontuarCandidato,
  regraCasa,
  seraBaixadoAoConciliar,
  transacaoConciliavel,
  valorDaTransacao,
  valorDoExtrato,
} from "@/lib/conciliacao-bancaria";

// Desde a 0156 o extrato_bancario tem dois tipos de linha: as "do sistema"
// (geradas pelo banco quando um lançamento é pago — são o saldo da conta) e as
// "do banco" (importadas do OFX/CSV, só para conciliar, fora do saldo). Esta
// tela mostra só as do banco; o saldo vem de conta.saldo_atual, que o banco
// mantém. Importar, conciliar e desfazer são RPCs atômicas (0156).
export default function ConciliacaoBancaria({ empresaAtiva, contas, onReload }) {
  const [extratosBancarios, setExtratosBancarios] = useState([]);
  const [transacoesSistema, setTransacoesSistema] = useState([]);
  const [contaSelecionada, setContaSelecionada] = useState("");
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importando, setImportando] = useState(false);
  const [conciliando, setConciliando] = useState(false);
  const [desfazendoId, setDesfazendoId] = useState(null);
  const [confirmar, dialogoConfirmar] = useConfirmar();

  useEffect(() => {
    if (empresaAtiva && contaSelecionada) {
      loadDados();
    }
  }, [empresaAtiva, contaSelecionada]);

  const buscarExtratosETransacoes = () =>
    Promise.all([
      sigo.entities.ExtratoBancario.filter({
        empresa_id: empresaAtiva.id,
        conta_id: contaSelecionada,
      }),
      sigo.entities.TransacaoFinanceira.filter({
        empresa_id: empresaAtiva.id,
        conta_id: contaSelecionada,
      }),
    ]);

  const loadDados = async () => {
    setLoading(true);
    try {
      const [extratos, transacoes] = await buscarExtratosETransacoes();
      setExtratosBancarios(extratos);
      setTransacoesSistema(transacoes);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadExtrato = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // deixa escolher o mesmo arquivo de novo
    if (!file || !contaSelecionada || importando) return;
    if (!supabase) {
      alert("Backend indisponível — não foi possível importar o extrato.");
      return;
    }

    setImportando(true);
    try {
      const texto = decodificarArquivoExtrato(await file.arrayBuffer());
      const { formato, linhas, descartadas } = lerExtrato(texto, file.name);
      if (!formato) {
        alert("Formato não reconhecido. Use um arquivo OFX ou CSV (Data; Descrição; Valor; Tipo).");
        return;
      }
      if (linhas.length === 0) {
        alert(
          descartadas > 0
            ? `Nenhuma linha válida no arquivo: ${descartadas} descartada(s) por data ou valor inválido.`
            : "Nenhuma transação encontrada no arquivo."
        );
        return;
      }

      // Guarda o arquivo original (ref estável "bucket/caminho"; a URL assinada
      // vence em 1h). Se o upload falhar, importa mesmo assim, sem o arquivo.
      let urlArquivo = null;
      try {
        urlArquivo = refDoUpload(await sigo.integrations.Core.UploadFile({ file }));
      } catch (err) {
        console.warn("[Conciliação] upload do arquivo do extrato falhou:", err);
      }

      // UMA chamada, UMA transação: grava upload_ofx + as linhas do banco, com
      // deduplicação por FITID (ou conteúdo) — reimportar não duplica.
      const { data, error } = await supabase.rpc("importar_extrato_bancario", {
        p_conta_id: contaSelecionada,
        p_linhas: linhas,
        p_nome_arquivo: file.name,
        p_url_arquivo: urlArquivo,
      });
      if (error) {
        console.error("Erro ao importar extrato:", error);
        alert(`Erro ao importar o extrato: ${error.message}`);
        return;
      }

      let mensagem = resumoDaImportacao(data, descartadas);
      try {
        const auto = await conciliacaoAutomatica();
        if (auto.conciliadas > 0) {
          mensagem += `\n${auto.conciliadas} linha(s) conciliada(s) automaticamente pelas regras.`;
        }
        if (auto.falhas > 0) {
          mensagem += `\n${auto.falhas} linha(s) não puderam ser conciliadas automaticamente — confira em Pendentes.`;
        }
      } catch (err) {
        console.error("Erro na conciliação automática:", err);
      }
      await loadDados();
      alert(mensagem);
    } catch (error) {
      console.error("Erro ao processar arquivo:", error);
      alert(`Erro ao processar arquivo: ${error?.message || error}`);
    } finally {
      setImportando(false);
    }
  };

  // Aplica as regras de conciliação às linhas pendentes, com dados frescos (a
  // versão antiga usava o estado de antes da importação, então as linhas novas
  // nunca entravam). Só liga lançamentos JÁ PAGOS: baixar lançamento em aberto
  // pela conciliação fica para a conciliação manual, com confirmação.
  const conciliacaoAutomatica = async () => {
    const [[extratos, transacoes], regrasDb] = await Promise.all([
      buscarExtratosETransacoes(),
      sigo.entities.RegraConciliacao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
    ]);
    const regras = ordenarRegras(regrasDb);
    let conciliadas = 0;
    let falhas = 0;
    if (regras.length === 0) return { conciliadas, falhas };

    const livres = transacoes.filter((t) => transacaoConciliavel(t) && isStatusPago(t.status));
    for (const extrato of extratos.filter(extratoPendente)) {
      for (const regra of regras) {
        const match = livres.find((t) => regraCasa(regra, extrato, t));
        if (!match) continue;
        const { error } = await supabase.rpc("conciliar_extrato", {
          p_extrato_id: extrato.id,
          p_transacao_id: match.id,
        });
        if (error) {
          falhas += 1;
          console.warn("[Conciliação automática]", error.message);
        } else {
          conciliadas += 1;
          livres.splice(livres.indexOf(match), 1); // um lançamento, uma linha
        }
        break;
      }
    }
    return { conciliadas, falhas };
  };

  // conciliar_extrato liga os dois lados numa transação só. Lançamento ainda
  // em aberto é BAIXADO (status pago, data de pagamento = data da linha do
  // extrato) — por isso pede confirmação antes.
  const handleConciliacaoManual = async (transacao) => {
    const extrato = itemSelecionado;
    if (!extrato || conciliando) return;
    if (!supabase) {
      alert("Backend indisponível — não foi possível conciliar.");
      return;
    }

    if (seraBaixadoAoConciliar(transacao)) {
      const valorDiferente =
        centavos(Math.abs(valorDoExtrato(extrato))) !== centavos(Math.abs(transacao.valor));
      const ok = await confirmar({
        titulo: "Baixar o lançamento ao conciliar?",
        texto:
          `"${transacao.descricao || "Lançamento"}" ainda está em aberto.\n\n` +
          `Ao conciliar, ele será marcado como pago em ${formatFullDate(extrato.data)} ` +
          `(data da linha do extrato), nesta conta, e o pagamento passa a contar no saldo.` +
          (valorDiferente
            ? `\n\nAtenção: o lançamento é de ${formatCurrency(transacao.valor)} e a linha do ` +
              `extrato de ${formatCurrency(Math.abs(valorDoExtrato(extrato)))}. A baixa usa o ` +
              `valor do lançamento.`
            : ""),
        rotuloConfirmar: "Baixar e conciliar",
      });
      if (!ok) return;
    }

    setConciliando(true);
    try {
      const { error } = await supabase.rpc("conciliar_extrato", {
        p_extrato_id: extrato.id,
        p_transacao_id: transacao.id,
      });
      if (error) {
        console.error("Erro ao conciliar:", error);
        alert(`Não foi possível conciliar: ${error.message}`);
        return;
      }
      setShowMatchModal(false);
      setItemSelecionado(null);
      await loadDados();
      onReload?.(); // baixa de lançamento em aberto muda o saldo da conta
    } finally {
      setConciliando(false);
    }
  };

  const handleDesfazerConciliacao = async (extrato) => {
    if (!extrato?.transacao_id || desfazendoId) return;
    if (!supabase) {
      alert("Backend indisponível — não foi possível desfazer.");
      return;
    }
    const ok = await confirmar({
      titulo: "Desfazer a conciliação?",
      texto:
        "A linha do extrato volta para Pendentes e o lançamento deixa de estar conciliado.\n\n" +
        "O lançamento continua pago. Se ele foi baixado pela conciliação e não deveria estar " +
        "pago, estorne o pagamento na tela do lançamento.",
      rotuloConfirmar: "Desfazer",
      destrutivo: true,
    });
    if (!ok) return;

    setDesfazendoId(extrato.id);
    try {
      const { error } = await supabase.rpc("desconciliar_transacao", {
        p_transacao_id: extrato.transacao_id,
      });
      if (error) {
        console.error("Erro ao desfazer conciliação:", error);
        alert(`Não foi possível desfazer: ${error.message}`);
        return;
      }
      await loadDados();
    } finally {
      setDesfazendoId(null);
    }
  };

  const porData = (a, b) => String(a.data || "").localeCompare(String(b.data || ""));
  const linhasDoBanco = extratosBancarios.filter(ehLinhaDoBanco);
  const extratosPendentes = linhasDoBanco.filter(extratoPendente).sort(porData);
  const extratosConciliados = linhasDoBanco.filter(extratoConciliado).sort(porData);
  // o que conciliar_extrato aceita (pagos e em aberto não parcelados)
  const candidatos = transacoesSistema.filter(transacaoConciliavel);
  const pagosSemConciliar = candidatos.filter((t) => isStatusPago(t.status));
  const transacaoPorId = new Map(transacoesSistema.map((t) => [t.id, t]));
  const contaAtual = contas.find((c) => c.id === contaSelecionada);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const descricaoDoExtrato = (e) => e.descricao || e.historico || "-";
  const corDoValor = (v) => (v < 0 ? "text-red-600" : "text-green-600");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Conciliação Bancária</h3>
          <p className="text-sm text-slate-500">
            Confira as linhas do extrato do banco com os lançamentos do sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={contaSelecionada} onValueChange={setContaSelecionada}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecione a conta" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="file"
            accept=".ofx,.csv,.OFX,.CSV"
            onChange={handleUploadExtrato}
            className="hidden"
            id="upload-extrato"
          />
          <Button
            onClick={() => document.getElementById("upload-extrato").click()}
            disabled={!contaSelecionada || importando}
            className="gap-2"
          >
            {importando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {importando ? "Importando..." : "Importar Extrato"}
          </Button>
        </div>
      </div>

      {contaSelecionada && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-blue-600" />
                  <p className="text-sm text-slate-600">Saldo no sistema</p>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {formatCurrency(contaAtual?.saldo_atual ?? contaAtual?.saldo_inicial)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Lançamentos pagos e transferências. O extrato importado não altera o saldo.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-yellow-600" />
                  <p className="text-sm text-slate-600">Extrato do banco: pendentes</p>
                </div>
                <p className="text-2xl font-bold text-slate-900">{extratosPendentes.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <p className="text-sm text-slate-600">Extrato do banco: conciliadas</p>
                </div>
                <p className="text-2xl font-bold text-slate-900">{extratosConciliados.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <p className="text-sm text-slate-600">Sistema: pagos sem conciliar</p>
                </div>
                <p className="text-2xl font-bold text-slate-900">{pagosSemConciliar.length}</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="pendentes">
            <TabsList>
              <TabsTrigger value="pendentes">Pendentes ({extratosPendentes.length})</TabsTrigger>
              <TabsTrigger value="conciliadas">
                Conciliadas ({extratosConciliados.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pendentes" className="space-y-4">
              <p className="text-xs text-slate-500">
                Linhas importadas do extrato do banco (OFX/CSV), para conciliar com os lançamentos.
              </p>
              {extratosPendentes.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-4" />
                    <p className="text-slate-600">
                      Nenhuma linha do extrato do banco pendente de conciliação.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-100 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                          Data
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                          Descrição
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                          Valor
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                          Status
                        </th>
                        <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {extratosPendentes.map((e) => {
                        const valor = valorDoExtrato(e);
                        const sugestoes = candidatos.filter((t) => ehSugestao(e, t)).length;
                        return (
                          <tr key={e.id} className="border-b hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm">{formatFullDate(e.data)}</td>
                            <td className="px-4 py-3 text-sm">{descricaoDoExtrato(e)}</td>
                            <td className="px-4 py-3 text-sm">
                              <span className={corDoValor(valor)}>{formatCurrency(valor)}</span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className="text-yellow-600 border-yellow-600"
                              >
                                Pendente
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex gap-2 justify-center">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setItemSelecionado(e);
                                    setShowMatchModal(true);
                                  }}
                                  className="gap-2"
                                >
                                  <Link2 className="w-4 h-4" />
                                  Conciliar
                                </Button>
                                {sugestoes > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="text-green-600 border-green-600"
                                  >
                                    {sugestoes} {sugestoes === 1 ? "sugestão" : "sugestões"}
                                  </Badge>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="conciliadas">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-100 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                        Data
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                        Descrição
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                        Valor
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                        Lançamento
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                        Conciliado em
                      </th>
                      <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {extratosConciliados.map((e) => {
                      const valor = valorDoExtrato(e);
                      const lancamento = e.transacao_id ? transacaoPorId.get(e.transacao_id) : null;
                      return (
                        <tr key={e.id} className="border-b hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm">{formatFullDate(e.data)}</td>
                          <td className="px-4 py-3 text-sm">{descricaoDoExtrato(e)}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={corDoValor(valor)}>{formatCurrency(valor)}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {lancamento?.descricao || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {e.data_conciliacao ? formatFullDate(e.data_conciliacao) : "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {e.transacao_id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDesfazerConciliacao(e)}
                                disabled={!!desfazendoId}
                                className="gap-2 text-orange-700 hover:text-orange-800"
                              >
                                {desfazendoId === e.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Undo2 className="w-4 h-4" />
                                )}
                                Desfazer
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Modal de Conciliação Manual */}
      <Sheet open={showMatchModal} onOpenChange={setShowMatchModal}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Conciliar Transação</SheetTitle>
          </SheetHeader>

          {itemSelecionado && (
            <div className="space-y-6 py-6">
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <p className="text-sm text-slate-600 mb-2">Linha do extrato do banco:</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Data</p>
                      <p className="font-semibold">{formatFullDate(itemSelecionado.data)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Descrição</p>
                      <p className="font-semibold">{descricaoDoExtrato(itemSelecionado)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Valor</p>
                      <p className="font-semibold text-blue-700">
                        {formatCurrency(valorDoExtrato(itemSelecionado))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div>
                <h4 className="font-semibold text-slate-800 mb-1">Sugestões de Conciliação</h4>
                <p className="text-xs text-slate-500 mb-3">
                  Lançamento em aberto é baixado (marcado como pago) na data da linha do extrato ao
                  conciliar.
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {candidatos
                    // o banco recusa sentidos opostos (receita × saída, despesa × entrada)
                    .filter((t) => mesmoSentido(itemSelecionado, t))
                    .map((t) => ({ t, ...pontuarCandidato(itemSelecionado, t) }))
                    .sort((a, b) => b.score - a.score)
                    .map(({ t, score, valorExato, dataProxima }) => {
                      const emAberto = seraBaixadoAoConciliar(t);
                      return (
                        <div
                          key={t.id}
                          className={`p-4 border rounded-lg transition-colors ${
                            conciliando
                              ? "opacity-60 cursor-wait"
                              : "hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
                          }`}
                          onClick={() => handleConciliacaoManual(t)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium text-slate-800">{t.descricao}</p>
                                {score >= 70 && (
                                  <Badge className="bg-green-100 text-green-700 text-xs">
                                    Alta compatibilidade
                                  </Badge>
                                )}
                                {score >= 50 && score < 70 && (
                                  <Badge
                                    variant="outline"
                                    className="text-amber-600 border-amber-600 text-xs"
                                  >
                                    Possível match
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500">
                                {emAberto ? "Vence em" : "Pago em"}{" "}
                                {formatFullDate(dataDaTransacao(t))} • {t.categoria_nome}
                              </p>
                            </div>
                            <p className={`text-lg font-bold ${corDoValor(valorDaTransacao(t))}`}>
                              {formatCurrency(valorDaTransacao(t))}
                            </p>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {emAberto && (
                              <Badge
                                variant="outline"
                                className="text-orange-700 border-orange-600 text-xs"
                              >
                                Em aberto: será baixado em {formatFullDate(itemSelecionado.data)}
                              </Badge>
                            )}
                            {valorExato && (
                              <Badge className="bg-green-100 text-green-700 text-xs">
                                ✓ Valor exato
                              </Badge>
                            )}
                            {dataProxima && (
                              <Badge className="bg-blue-100 text-blue-700 text-xs">
                                ✓ Data próxima
                              </Badge>
                            )}
                            {score < 50 && (
                              <Badge variant="outline" className="text-slate-500 text-xs">
                                Score: {score}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {candidatos.length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                      <p>Nenhum lançamento desta conta disponível para conciliar</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {dialogoConfirmar}
    </div>
  );
}
