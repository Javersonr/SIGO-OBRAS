import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "@/Layout";
import { toast } from "sonner";
import {
  abrirConvite,
  acessosDaCotacao,
  enviarSenhaFornecedor,
  linhaSobreSenha,
  linksDaCotacao,
  prepararConvite,
  precisaEnviarSenhaAntes,
  situacaoAtual,
  textoDoMotivo,
} from "@/lib/senha-portal";
import { ehAdministrador } from "@/lib/compras-aprovacao";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Mail,
  MessageSquare,
  ExternalLink,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
  ArrowUpDown,
  X,
  Trash2,
  KeyRound,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function LinksModal({ open, onOpenChange, cotacao, empresaAtiva, onDelete }) {
  const { temPermissao, vinculo, isSuperAdmin } = useEmpresa();
  // "Enviar nova senha": a mesma permissão do "Enviar aos Fornecedores" (o servidor confere de novo)
  const podeEnviarSenha =
    temPermissao("Compras", "Cotações", "enviar") || ehAdministrador({ isSuperAdmin, vinculo });

  const [fornecedores, setFornecedores] = useState([]);
  // situação de cada fornecedor no portal (tem_acesso, ativo, tem_email, tem_telefone, email): a senha
  // nunca vem para a tela; ela vai ao fornecedor pelo WhatsApp do SIGO
  const [acessos, setAcessos] = useState({});
  const [senhaEnviadaAgora, setSenhaEnviadaAgora] = useState({});
  // links montados pelo servidor, por participação (cotacao_fornecedor.id)
  const [links, setLinks] = useState({});
  const [erroCarregar, setErroCarregar] = useState("");
  // falha só do servidor (links e acesso ao portal): a lista fica, o aviso aparece em cima dela
  const [erroAcesso, setErroAcesso] = useState("");
  // envio da senha em curso, por fornecedor (desabilita os botões dele: "Enviando senha...")
  const [enviandoSenha, setEnviandoSenha] = useState({});
  const enviandoSenhaRef = React.useRef(new Set());
  // "Enviar nova senha": confirmação dentro do modal e o resultado (destino mascarado)
  const [confirmandoSenha, setConfirmandoSenha] = useState({});
  const [resultadoSenha, setResultadoSenha] = useState({});
  // o navegador não abriu a janela do WhatsApp: a tela mostra o botão "Abrir WhatsApp" com o convite pronto
  const [conviteBloqueado, setConviteBloqueado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reenviando, setReenviando] = useState({});
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [ordenacao, setOrdenacao] = useState("nome");
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    if (open && cotacao) {
      loadFornecedores();
    }
  }, [open, cotacao]);

  const loadFornecedores = async () => {
    setLoading(true);
    // status e valores vêm da tabela; links e acesso ao portal, do servidor. Se só o servidor falhar, a
    // lista continua na tela e ficam indisponíveis apenas o link e o acesso (revisão do 2b-2).
    const [tabela, servidor] = await Promise.allSettled([
      sigo.entities.CotacaoFornecedor.filter({ cotacao_id: cotacao.id }),
      Promise.all([linksDaCotacao(sigo, cotacao.id), acessosDaCotacao(sigo, cotacao.id)]),
    ]);
    if (tabela.status === "fulfilled") {
      setFornecedores(tabela.value);
      setErroCarregar("");
    } else {
      console.error("Erro ao carregar fornecedores:", tabela.reason);
      setFornecedores([]);
      setErroCarregar(tabela.reason?.message || "Erro ao carregar os fornecedores da cotação");
    }
    if (servidor.status === "fulfilled") {
      const [{ porParticipacao }, situacoes] = servidor.value;
      setLinks(porParticipacao);
      setAcessos(situacoes);
      setErroAcesso("");
    } else {
      console.error("Erro ao carregar links e acesso ao portal:", servidor.reason);
      setLinks({});
      setAcessos({});
      setErroAcesso(servidor.reason?.message || "Erro ao carregar os links dos fornecedores");
    }
    setLoading(false);
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link);
    alert("Link copiado!");
  };

  // um envio de senha por fornecedor de cada vez: o 2º clique em curso é ignorado
  const comTrava = async (fornecedor, fn) => {
    if (enviandoSenhaRef.current.has(fornecedor.id)) return { ignorado: true };
    enviandoSenhaRef.current.add(fornecedor.id);
    setEnviandoSenha((prev) => ({ ...prev, [fornecedor.id]: true }));
    try {
      return await fn();
    } finally {
      enviandoSenhaRef.current.delete(fornecedor.id);
      setEnviandoSenha((prev) => ({ ...prev, [fornecedor.id]: false }));
    }
  };

  const marcarSenhaEnviada = (fornecedor, destino) => {
    setSenhaEnviadaAgora((prev) => ({ ...prev, [fornecedor.fornecedor_id]: true }));
    setAcessos((prev) => ({
      ...prev,
      [fornecedor.fornecedor_id]: {
        ...(prev[fornecedor.fornecedor_id] || {}),
        tem_acesso: true,
        ativo: true,
      },
    }));
    setResultadoSenha((prev) => ({
      ...prev,
      [fornecedor.id]: `Senha enviada para ${destino || "o telefone do cadastro"}`,
    }));
  };

  const enviarWhatsApp = async (fornecedor) => {
    const link = links[fornecedor.id];
    if (!link) {
      toast.error("O link deste fornecedor não está disponível. Feche e abra o painel de novo.");
      return;
    }
    // Convite: quem ainda NÃO tem acesso recebe a senha pelo WhatsApp do SIGO antes; quem já tem não tem
    // a senha trocada. Falha no envio da senha não impede o convite (avisa o motivo).
    if (enviandoSenhaRef.current.has(fornecedor.id)) return; // 2º clique durante o envio da senha
    const acesso = acessos[fornecedor.fornecedor_id];
    const enviadaAgora = senhaEnviadaAgora[fornecedor.fornecedor_id];
    // a janela do WhatsApp abre NA HORA do clique quando há envio de senha (senão o navegador a bloqueia
    // depois da espera); sem envio, abre direto, como antes
    const r = await abrirConvite({
      precisaEnviar: precisaEnviarSenhaAntes(acesso, enviadaAgora),
      abrirJanela: (url) => window.open(url, "_blank"),
      preparar: async () => {
        const jaSabida = situacaoAtual(acesso, enviadaAgora);
        if (jaSabida) return { situacao: jaSabida };
        const p = await comTrava(fornecedor, () =>
          prepararConvite(sigo, { acesso, fornecedorId: fornecedor.fornecedor_id })
        );
        if (p.ignorado) return { situacao: null };
        if (p.situacao === "enviada") marcarSenhaEnviada(fornecedor, p.resultado?.destino);
        if (p.tipoAviso === "sucesso") toast.success(p.aviso);
        else if (p.tipoAviso === "alerta") toast.warning(p.aviso, { duration: 12000 });
        return { situacao: p.situacao };
      },
      montarUrl: (situacao) =>
        `https://wa.me/?text=${encodeURIComponent(mensagemDoConvite(fornecedor, link, situacao))}`,
    });
    if (!r.aberta) setConviteBloqueado({ nome: fornecedor.fornecedor_nome, url: r.url });
  };

  // O convite que o COMPRADOR envia (wa.me): sem login e senha; só a linha que diz onde está o login
  const mensagemDoConvite = (fornecedor, link, situacao) => {
    const linha = linhaSobreSenha(situacao);
    const credLine = linha ? `\n${linha}` : "";

    const mensagem = `Olá *${fornecedor.fornecedor_nome}*!

Você foi convidado a participar da cotação *${cotacao.numero}*.

${cotacao.projeto_nome ? `📋 Projeto: ${cotacao.projeto_nome}\n` : ""}${cotacao.data_limite ? `📅 Prazo: ${new Date(cotacao.data_limite).toLocaleDateString("pt-BR")}\n` : ""}${credLine}
🔗 Clique para acessar a cotação:
${link}

Atenciosamente,
*${empresaAtiva.nome_fantasia || empresaAtiva.razao_social || empresaAtiva.nome}*`;

    return mensagem;
  };

  // "Enviar nova senha" (sob pedido, depois da confirmação): o servidor envia pelo WhatsApp do SIGO
  const enviarNovaSenha = async (fornecedor) => {
    setConfirmandoSenha((prev) => ({ ...prev, [fornecedor.id]: false }));
    const r = await comTrava(fornecedor, () =>
      enviarSenhaFornecedor(sigo, fornecedor.fornecedor_id)
    );
    if (r.ignorado) return;
    if (r.enviado) {
      marcarSenhaEnviada(fornecedor, r.destino);
      toast.success(`Senha enviada para ${r.destino || "o telefone do cadastro"}.`);
    } else {
      const texto = `A senha não foi enviada: ${textoDoMotivo(r)}.`;
      setResultadoSenha((prev) => ({ ...prev, [fornecedor.id]: texto }));
      toast.error(texto, { duration: 12000 });
    }
  };

  const enviarEmail = async (fornecedor, isReenvio = false) => {
    const link = links[fornecedor.id];
    if (!link) {
      toast.error("O link deste fornecedor não está disponível. Feche e abra o painel de novo.");
      return;
    }

    try {
      setReenviando((prev) => ({ ...prev, [fornecedor.id]: true }));

      const diasRestantes = cotacao.data_limite
        ? Math.ceil((new Date(cotacao.data_limite) - new Date()) / (1000 * 60 * 60 * 24))
        : null;

      await sigo.functions.invoke("enviarEmailSMTP", {
        to: fornecedor.fornecedor_email,
        subject: isReenvio
          ? `LEMBRETE - Cotação ${cotacao.numero} - ${empresaAtiva.nome_fantasia || empresaAtiva.razao_social || empresaAtiva.nome}`
          : `Cotação ${cotacao.numero} - ${empresaAtiva.nome_fantasia || empresaAtiva.razao_social || empresaAtiva.nome}`,
        body: `
Olá ${fornecedor.fornecedor_nome},

${isReenvio ? `Este é um LEMBRETE sobre a cotação ${cotacao.numero} que ainda aguarda sua resposta.\n\n` : `Você foi convidado a participar da cotação ${cotacao.numero}.\n\n`}${cotacao.projeto_nome ? `Projeto: ${cotacao.projeto_nome}\n` : ""}${cotacao.data_limite ? `⏰ Prazo para resposta: ${new Date(cotacao.data_limite).toLocaleDateString("pt-BR")}${diasRestantes !== null && diasRestantes <= 3 ? ` (${diasRestantes} dias restantes!)` : ""}\n` : ""}
🔗 Clique para acessar a cotação:
${link}

Atenciosamente,
${empresaAtiva.nome_fantasia || empresaAtiva.razao_social || empresaAtiva.nome}
        `,
      });

      alert(isReenvio ? "Lembrete enviado com sucesso!" : "Email enviado com sucesso!");

      await sigo.entities.CotacaoFornecedor.update(fornecedor.id, {
        ultima_notificacao: new Date().toISOString(),
      });

      loadFornecedores();
    } catch (error) {
      console.error("Erro ao enviar email:", error);
      alert("Erro ao enviar email");
    } finally {
      setReenviando((prev) => ({ ...prev, [fornecedor.id]: false }));
    }
  };

  const reenviarParaTodos = async () => {
    const naoRespondidos = fornecedores.filter(
      (f) =>
        f.status === "Enviada" ||
        f.status === "Visualizada" ||
        f.status === "Respondida Parcialmente"
    );

    if (naoRespondidos.length === 0) {
      alert("Todos os fornecedores já responderam!");
      return;
    }

    if (
      !confirm(
        `Enviar lembrete para ${naoRespondidos.length} fornecedor(es) que ainda não responderam?`
      )
    ) {
      return;
    }

    for (const fornecedor of naoRespondidos) {
      if (fornecedor.fornecedor_email) {
        await enviarEmail(fornecedor, true);
      }
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const deleteSequential = async (items, deleteFn) => {
    for (const item of items) {
      await deleteFn(item.id);
      await sleep(300);
    }
  };

  const handleExcluirCotacao = async () => {
    if (
      !confirm(
        `Tem certeza que deseja excluir a cotação ${cotacao.numero}? Esta ação não pode ser desfeita.`
      )
    )
      return;
    setExcluindo(true);
    try {
      const cotRespostas = await sigo.entities.CotacaoResposta.filter({ cotacao_id: cotacao.id });
      await sleep(300);
      const cotItens = await sigo.entities.CotacaoItem.filter({ cotacao_id: cotacao.id });
      await sleep(300);
      const cotFornecedores = await sigo.entities.CotacaoFornecedor.filter({
        cotacao_id: cotacao.id,
      });
      await sleep(300);

      await deleteSequential(cotRespostas, (id) => sigo.entities.CotacaoResposta.delete(id));
      await deleteSequential(cotItens, (id) => sigo.entities.CotacaoItem.delete(id));
      await deleteSequential(cotFornecedores, (id) => sigo.entities.CotacaoFornecedor.delete(id));
      await sigo.entities.Cotacao.delete(cotacao.id);

      onOpenChange(false);
      if (onDelete) onDelete();
    } catch (error) {
      console.error("Erro ao excluir cotação:", error);
      alert("Erro ao excluir cotação");
    } finally {
      setExcluindo(false);
    }
  };

  const calcularDiasRestantes = () => {
    if (!cotacao.data_limite) return null;
    const dias = Math.ceil((new Date(cotacao.data_limite) - new Date()) / (1000 * 60 * 60 * 24));
    return dias;
  };

  const getProgressoRespostas = () => {
    const total = fornecedores.length;
    const respondidas = fornecedores.filter((f) => f.status === "Respondida Totalmente").length;
    return total > 0 ? (respondidas / total) * 100 : 0;
  };

  if (loading) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="h-full overflow-y-auto p-0 flex flex-col w-full sm:w-[90%] md:w-[80%] lg:w-[70%]"
        >
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-slate-600">Carregando...</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const diasRestantes = calcularDiasRestantes();
  const progressoRespostas = getProgressoRespostas();
  const totalRespondidas = fornecedores.filter((f) => f.status === "Respondida Totalmente").length;
  const totalParciais = fornecedores.filter((f) => f.status === "Respondida Parcialmente").length;
  const totalVisualizadas = fornecedores.filter((f) => f.status === "Visualizada").length;
  const totalAguardando = fornecedores.filter((f) => f.status === "Enviada").length;
  const totalImpossivel = fornecedores.filter((f) => f.status === "Impossível Responder").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full p-0 flex flex-col w-full md:w-[calc(100%-256px)] md:inset-auto md:right-0 md:left-256px md:top-16"
        data-fullscreen-modal
      >
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle>Painel de Cotação {cotacao?.numero}</SheetTitle>
            <p className="text-sm text-slate-500">
              Acompanhe o status de resposta de cada fornecedor
            </p>
          </SheetHeader>
          <div className="flex items-center gap-2 ml-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExcluirCotacao}
              disabled={excluindo}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {excluindo ? "Excluindo..." : "Excluir"}
            </Button>
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {/* Status Geral */}
          <div className="mt-6 space-y-4">
            <Card className="border-2 bg-gradient-to-br from-amber-50 to-orange-50">
              <CardContent className="p-4 space-y-4">
                {/* Indicadores */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div className="text-center">
                    <div className="text-xl font-bold text-amber-600">{fornecedores.length}</div>
                    <div className="text-xs text-slate-600">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-green-600">{totalRespondidas}</div>
                    <div className="text-xs text-slate-600">Completas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-blue-600">{totalParciais}</div>
                    <div className="text-xs text-slate-600">Parciais</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-purple-600">{totalVisualizadas}</div>
                    <div className="text-xs text-slate-600">Visualizadas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-orange-600">{totalAguardando}</div>
                    <div className="text-xs text-slate-600">Aguardando</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-red-600">{totalImpossivel}</div>
                    <div className="text-xs text-slate-600">Impossível</div>
                  </div>
                </div>

                {/* Progresso */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 font-medium">Progresso das Respostas</span>
                    <span className="text-slate-600">{Math.round(progressoRespostas)}%</span>
                  </div>
                  <Progress value={progressoRespostas} className="h-2" />
                </div>

                {/* Prazo */}
                {cotacao.data_limite && (
                  <div
                    className={`flex items-center gap-2 p-3 rounded-lg ${
                      diasRestantes <= 0
                        ? "bg-red-100 text-red-700"
                        : diasRestantes <= 3
                          ? "bg-orange-100 text-orange-700"
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {diasRestantes <= 0
                          ? "Prazo VENCIDO"
                          : diasRestantes === 1
                            ? "1 dia restante"
                            : `${diasRestantes} dias restantes`}
                      </div>
                      <div className="text-xs opacity-90">
                        Prazo limite: {new Date(cotacao.data_limite).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                  </div>
                )}

                {/* Botão Reenviar para Todos */}
                {totalAguardando > 0 && (
                  <Button
                    onClick={reenviarParaTodos}
                    variant="outline"
                    className="w-full text-orange-600 border-orange-600 hover:bg-orange-50"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Enviar Lembrete para {totalAguardando} Fornecedor(es)
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Filtros e Ordenação */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                Filtrar Status
              </label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="Enviada">Enviada</SelectItem>
                  <SelectItem value="Visualizada">Visualizada</SelectItem>
                  <SelectItem value="Respondida Parcialmente">Parcial</SelectItem>
                  <SelectItem value="Respondida Totalmente">Totalmente</SelectItem>
                  <SelectItem value="Impossível Responder">Impossível</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" />
                Ordenar Por
              </label>
              <Select value={ordenacao} onValueChange={setOrdenacao}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nome">Nome</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="data_resposta">Data Resposta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4 mt-6">
            {conviteBloqueado && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-800 flex flex-wrap items-center justify-between gap-3"
              >
                <span>
                  O navegador não abriu a janela do WhatsApp para {conviteBloqueado.nome}. O convite
                  está pronto:
                </span>
                <div className="flex gap-2">
                  <a
                    href={conviteBloqueado.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setConviteBloqueado(null)}
                    className="inline-flex items-center rounded-md border border-green-600 px-3 py-1 text-green-700 hover:bg-green-50"
                  >
                    Abrir WhatsApp
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => setConviteBloqueado(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            )}
            {!erroCarregar && erroAcesso && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 flex items-start justify-between gap-3"
              >
                <span>
                  Não deu para carregar os links e o acesso dos fornecedores ao portal: {erroAcesso}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadFornecedores()}
                  className="flex-shrink-0"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Tentar de novo
                </Button>
              </div>
            )}
            {erroCarregar ? (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-6 text-center space-y-3" role="alert">
                  <p className="text-sm text-red-700">
                    Não deu para carregar os fornecedores da cotação: {erroCarregar}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => loadFornecedores()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Tentar de novo
                  </Button>
                </CardContent>
              </Card>
            ) : fornecedores.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-slate-500">Nenhum fornecedor vinculado a esta cotação</p>
                </CardContent>
              </Card>
            ) : (
              fornecedores
                .filter((f) => filtroStatus === "todos" || f.status === filtroStatus)
                .sort((a, b) => {
                  if (ordenacao === "nome")
                    return a.fornecedor_nome.localeCompare(b.fornecedor_nome);
                  if (ordenacao === "status") return a.status.localeCompare(b.status);
                  if (ordenacao === "data_resposta") {
                    if (!a.data_resposta) return 1;
                    if (!b.data_resposta) return -1;
                    return new Date(b.data_resposta) - new Date(a.data_resposta);
                  }
                  return 0;
                })
                .map((fornecedor) => {
                  const link = links[fornecedor.id] || "";

                  return (
                    <Card
                      key={fornecedor.id}
                      className={`border-2 ${
                        fornecedor.status === "Respondida"
                          ? "border-green-200 bg-green-50/30"
                          : "border-slate-200"
                      }`}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Cabeçalho */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {fornecedor.status === "Respondida" ? (
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                              ) : (
                                <AlertCircle className="w-5 h-5 text-orange-600" />
                              )}
                              <h3 className="font-semibold text-slate-800">
                                {fornecedor.fornecedor_nome}
                              </h3>
                            </div>
                            {fornecedor.fornecedor_email && (
                              <p className="text-sm text-slate-500 flex items-center gap-1 mt-1 ml-7">
                                <Mail className="w-3 h-3" />
                                {fornecedor.fornecedor_email}
                              </p>
                            )}
                            {fornecedor.ultima_notificacao &&
                              fornecedor.status === "Aguardando" && (
                                <p className="text-xs text-slate-400 mt-1 ml-7">
                                  Último envio:{" "}
                                  {new Date(fornecedor.ultima_notificacao).toLocaleDateString(
                                    "pt-BR"
                                  )}{" "}
                                  às{" "}
                                  {new Date(fornecedor.ultima_notificacao).toLocaleTimeString(
                                    "pt-BR",
                                    { hour: "2-digit", minute: "2-digit" }
                                  )}
                                </p>
                              )}
                          </div>
                          <Badge
                            className={
                              fornecedor.status === "Respondida Totalmente"
                                ? "bg-green-100 text-green-700 border-green-200"
                                : fornecedor.status === "Respondida Parcialmente"
                                  ? "bg-blue-100 text-blue-700 border-blue-200"
                                  : fornecedor.status === "Impossível Responder"
                                    ? "bg-red-100 text-red-700 border-red-200"
                                    : fornecedor.status === "Visualizada"
                                      ? "bg-purple-100 text-purple-700 border-purple-200"
                                      : "bg-orange-100 text-orange-700 border-orange-200"
                            }
                          >
                            {fornecedor.status}
                          </Badge>
                        </div>

                        {/* Motivo de Recusa */}
                        {fornecedor.motivo_recusa && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                            <p className="text-xs font-medium text-red-800">Motivo:</p>
                            <p className="text-xs text-red-700">{fornecedor.motivo_recusa}</p>
                          </div>
                        )}

                        {/* Acesso ao portal (a senha nunca aparece aqui: vai pelo WhatsApp do SIGO) */}
                        {acessos[fornecedor.fornecedor_id] && (
                          <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
                            <p className="font-medium text-slate-700">Acesso ao portal:</p>
                            {acessos[fornecedor.fornecedor_id].ativo ? (
                              <p className="text-slate-600">
                                Login:{" "}
                                <span className="font-mono">
                                  {acessos[fornecedor.fornecedor_id].email}
                                </span>
                              </p>
                            ) : acessos[fornecedor.fornecedor_id].tem_acesso ? (
                              <p className="text-amber-700">
                                Acesso ao portal desativado. Use &quot;Enviar nova senha&quot; para
                                reativar.
                              </p>
                            ) : (
                              <p className="text-slate-600">
                                Ainda sem acesso: a senha vai junto com o primeiro convite.
                              </p>
                            )}
                            <p className="text-slate-500">
                              A senha não aparece na tela: vai direto para o WhatsApp cadastrado do
                              fornecedor.
                            </p>
                            {!acessos[fornecedor.fornecedor_id].tem_telefone && (
                              <p className="text-amber-700">
                                Sem telefone válido no cadastro do fornecedor: a senha não pode ser
                                enviada.
                              </p>
                            )}
                            {!acessos[fornecedor.fornecedor_id].tem_email && (
                              <p className="text-amber-700">
                                Sem e-mail no cadastro do fornecedor: não há login para o portal.
                              </p>
                            )}
                            {resultadoSenha[fornecedor.id] && (
                              <p className="text-slate-700 font-medium" role="status">
                                {resultadoSenha[fornecedor.id]}
                              </p>
                            )}
                            {podeEnviarSenha &&
                              (confirmandoSenha[fornecedor.id] ? (
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <span className="text-red-700">
                                    A senha atual deixa de valer. Enviar uma nova?
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => enviarNovaSenha(fornecedor)}
                                    className="h-7 text-red-700 border-red-300 hover:bg-red-50"
                                  >
                                    Confirmar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setConfirmandoSenha((prev) => ({
                                        ...prev,
                                        [fornecedor.id]: false,
                                      }))
                                    }
                                    className="h-7"
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!!enviandoSenha[fornecedor.id]}
                                  onClick={() =>
                                    setConfirmandoSenha((prev) => ({
                                      ...prev,
                                      [fornecedor.id]: true,
                                    }))
                                  }
                                  className="h-7 mt-1"
                                >
                                  <KeyRound className="w-3 h-3 mr-1" />
                                  {enviandoSenha[fornecedor.id]
                                    ? "Enviando senha..."
                                    : "Enviar nova senha"}
                                </Button>
                              ))}
                          </div>
                        )}

                        {/* Link */}
                        <div>
                          <p className="text-xs text-slate-500 mb-1.5">Link de Acesso</p>
                          <div className="flex gap-2">
                            <Input
                              value={link || "Link indisponível"}
                              readOnly
                              className="text-xs bg-slate-50 flex-1"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!link}
                              onClick={() => copyLink(link)}
                              className="text-slate-600 hover:bg-slate-100"
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              Copiar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!link}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                window.open(link, "_blank", "noopener,noreferrer");
                              }}
                              className="text-blue-600 border-blue-600 hover:bg-blue-50"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Abrir
                            </Button>
                          </div>
                        </div>

                        {/* Ações de Compartilhamento */}
                        <div className="flex gap-2 pt-2">
                          {(fornecedor.status === "Enviada" ||
                            fornecedor.status === "Visualizada" ||
                            fornecedor.status === "Respondida Parcialmente") &&
                            fornecedor.fornecedor_email && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => enviarEmail(fornecedor, true)}
                                disabled={reenviando[fornecedor.id]}
                                className="flex-1 text-orange-600 border-orange-600 hover:bg-orange-50"
                              >
                                {reenviando[fornecedor.id] ? (
                                  <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Enviando...
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Reenviar Lembrete
                                  </>
                                )}
                              </Button>
                            )}
                          {fornecedor.status === "Respondida Totalmente" &&
                            fornecedor.fornecedor_email && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => enviarEmail(fornecedor, false)}
                                disabled={reenviando[fornecedor.id]}
                                className="flex-1 text-blue-600 border-blue-600 hover:bg-blue-50"
                              >
                                <Mail className="w-4 h-4 mr-2" />
                                Enviar Email
                              </Button>
                            )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => enviarWhatsApp(fornecedor)}
                            disabled={!link || !!enviandoSenha[fornecedor.id]}
                            className="flex-1 text-green-600 border-green-600 hover:bg-green-50"
                          >
                            <MessageSquare className="w-4 h-4 mr-2" />
                            {enviandoSenha[fornecedor.id] ? "Enviando senha..." : "WhatsApp"}
                          </Button>
                        </div>

                        {/* Info da Resposta */}
                        {(fornecedor.status === "Respondida Totalmente" ||
                          fornecedor.status === "Respondida Parcialmente") && (
                          <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700">
                            ✅ Respondido em{" "}
                            {fornecedor.data_resposta
                              ? new Date(fornecedor.data_resposta).toLocaleDateString("pt-BR")
                              : "-"}
                            {fornecedor.total_cotado > 0 &&
                              ` • Total: R$ ${fornecedor.total_cotado.toFixed(2)}`}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
