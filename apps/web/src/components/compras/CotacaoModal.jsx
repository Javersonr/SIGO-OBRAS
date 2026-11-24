import { normalizarTexto } from "@/lib/busca";
import {
  credenciaisDaCotacao,
  credencialParaEnvio,
  linksDaCotacao,
  rotacionarCredencialFornecedor,
} from "@/lib/senha-portal";
import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageSquare, Copy, X } from "lucide-react";
import { sigo } from "@/api/sigoClient";

export default function CotacaoModal({
  open,
  onOpenChange,
  solicitacao,
  itens,
  fornecedores,
  empresaAtiva,
  onSave,
}) {
  const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState([]);
  const [dataLimite, setDataLimite] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [linksCotacao, setLinksCotacao] = useState({});
  const [searchFornecedor, setSearchFornecedor] = useState("");
  const [emailsFornecedores, setEmailsFornecedores] = useState({});
  const [linksFornecedores, setLinksFornecedores] = useState({});
  const [credenciaisFornecedores, setCredenciaisFornecedores] = useState({});
  const [cotacaoExistente, setCotacaoExistente] = useState(null);
  const [mensagemExpandida, setMensagemExpandida] = useState({});
  const [codigosOrcamento, setCodigosOrcamento] = useState({});
  // falha ao pedir ao servidor os links e o acesso dos fornecedores (a tela avisa em vez de ficar pela metade)
  const [erroAcesso, setErroAcesso] = useState("");

  const carregarCotacaoExistente = React.useCallback(async () => {
    if (!open || !solicitacao) return;
    try {
      const cotacoes = await sigo.entities.Cotacao.filter({
        empresa_id: empresaAtiva.id,
        solicitacao_id: solicitacao.id,
      });

      if (cotacoes.length > 0) {
        const cotacao = cotacoes[0];
        setCotacaoExistente(cotacao);
        setDataLimite(cotacao.data_limite || "");
        setObservacoes(cotacao.observacoes || "");

        // Carregar fornecedores já vinculados
        const fornecedoresVinculados = await sigo.entities.CotacaoFornecedor.filter({
          cotacao_id: cotacao.id,
        });

        const fornecIds = fornecedoresVinculados.map((f) => f.fornecedor_id);
        setFornecedoresSelecionados(fornecIds);

        // Carregar emails dos fornecedores
        const emails = {};
        for (const fv of fornecedoresVinculados) {
          const fornecedor = fornecedores.find((f) => f.id === fv.fornecedor_id);
          emails[fv.fornecedor_id] = fornecedor?.email || "";
        }
        setEmailsFornecedores(emails);

        // Links e acesso ao portal: o servidor monta o link e diz quem já tem acesso (a senha
        // nunca vem: o banco só tem o hash, e a senha nova só nasce ao ENVIAR)
        try {
          const [{ porFornecedor }, creds] = await Promise.all([
            linksDaCotacao(sigo, cotacao.id),
            credenciaisDaCotacao(sigo, cotacao.id),
          ]);
          const links = {};
          for (const [fornecedorId, link] of Object.entries(porFornecedor)) {
            links[fornecedorId] = { link };
          }
          setLinksFornecedores(links);
          setCredenciaisFornecedores(creds);
          setErroAcesso("");
        } catch (e) {
          setLinksFornecedores({});
          setCredenciaisFornecedores({});
          setErroAcesso(e?.message || "Erro ao carregar os links dos fornecedores");
        }
      } else {
        setCotacaoExistente(null);
        setFornecedoresSelecionados([]);
        setDataLimite("");
        setObservacoes("");
        setEmailsFornecedores({});
        setLinksFornecedores({});
        setCredenciaisFornecedores({});
        setErroAcesso("");
      }
    } catch (error) {
      console.error("Erro ao carregar cotação:", error);
    }
  }, [open, solicitacao, empresaAtiva.id, fornecedores]);

  // Carregar cotação existente ao abrir o modal
  React.useEffect(() => {
    if (open && solicitacao) {
      carregarCotacaoExistente();
      // Carregar códigos do orçamento para exibir na lista de itens
      if (solicitacao.projeto_id) {
        sigo.entities.OrcamentoItem.filter({ projeto_id: solicitacao.projeto_id })
          .then((orcItens) => {
            const mapa = {};
            orcItens.forEach((o) => {
              if (o.descricao) mapa[o.descricao.toLowerCase()] = o.codigo || "";
            });
            setCodigosOrcamento(mapa);
          })
          .catch(() => {});
      }
    }
  }, [open, solicitacao, carregarCotacaoExistente]);

  const adicionarFornecedor = (fornecedor) => {
    if (!fornecedoresSelecionados.includes(fornecedor.id)) {
      // Link será gerado após criação da cotação com o ID dela
      setFornecedoresSelecionados([...fornecedoresSelecionados, fornecedor.id]);
      setEmailsFornecedores({ ...emailsFornecedores, [fornecedor.id]: fornecedor.email || "" });
      setSearchFornecedor("");
    }
  };

  const removerFornecedor = (fornecedorId) => {
    setFornecedoresSelecionados(fornecedoresSelecionados.filter((id) => id !== fornecedorId));
  };

  const fornecedoresFiltrados = useMemo(() => {
    const searchLower = searchFornecedor.toLowerCase();
    return fornecedores.filter(
      (f) =>
        !fornecedoresSelecionados.includes(f.id) &&
        (normalizarTexto(f.nome_razao).includes(normalizarTexto(searchLower)) ||
          normalizarTexto(f.email).includes(normalizarTexto(searchLower)))
    );
  }, [fornecedores, fornecedoresSelecionados, searchFornecedor]);

  const handleCriarCotacao = async () => {
    if (fornecedoresSelecionados.length === 0) {
      alert("Selecione pelo menos um fornecedor");
      return;
    }

    setEnviandoEmail(true);
    try {
      let cotacao;
      const ano = new Date().getFullYear();

      if (cotacaoExistente) {
        await sigo.entities.Cotacao.update(cotacaoExistente.id, {
          status: "Enviada aos Fornecedores",
          data_limite: dataLimite || null,
          observacoes,
          total_fornecedores: fornecedoresSelecionados.length,
        });
        cotacao = cotacaoExistente;

        const fornecedoresExistentes = await sigo.entities.CotacaoFornecedor.filter({
          cotacao_id: cotacaoExistente.id,
        });
        const idsExistentes = fornecedoresExistentes.map((f) => f.fornecedor_id);
        const novosFornecedores = fornecedoresSelecionados.filter(
          (fId) => !idsExistentes.includes(fId)
        );

        // Otimizado: Processar fornecedores em paralelo
        await Promise.all(
          novosFornecedores.map(async (fId) => {
            const fornecedor = fornecedores.find((f) => f.id === fId);

            // token do link: o banco gera (32 bytes aleatórios, migração 0113)
            await sigo.entities.CotacaoFornecedor.create({
              empresa_id: empresaAtiva.id,
              cotacao_id: cotacaoExistente.id,
              fornecedor_id: fId,
              fornecedor_nome: fornecedor.nome_razao,
              fornecedor_email: emailsFornecedores[fId] || fornecedor.email,
              status: "Enviada",
            });
          })
        );
      } else {
        const cotacoes = await sigo.entities.Cotacao.filter({ empresa_id: empresaAtiva.id });
        const numero = `COT${ano}-${String(cotacoes.length + 1).padStart(4, "0")}`;

        cotacao = await sigo.entities.Cotacao.create({
          empresa_id: empresaAtiva.id,
          numero,
          solicitacao_id: solicitacao.id,
          solicitacao_numero: solicitacao.numero,
          projeto_id: solicitacao.projeto_id,
          projeto_nome: solicitacao.projeto_nome,
          status: "Enviada aos Fornecedores",
          data_limite: dataLimite || null,
          observacoes,
          total_fornecedores: fornecedoresSelecionados.length,
        });

        const itensPromises = itens.map((item) =>
          sigo.entities.CotacaoItem.create({
            empresa_id: empresaAtiva.id,
            cotacao_id: cotacao.id,
            solicitacao_item_id: item.id,
            descricao: item.descricao,
            material_codigo: item.material_codigo || "",
            quantidade: item.quantidade,
            unidade: item.unidade,
            especificacoes: item.especificacoes || "",
          })
        );

        await Promise.all(itensPromises);

        // Otimizado: Processar fornecedores em paralelo
        await Promise.all(
          fornecedoresSelecionados.map(async (fId) => {
            const fornecedor = fornecedores.find((f) => f.id === fId);

            // token do link: o banco gera (32 bytes aleatórios, migração 0113)
            await sigo.entities.CotacaoFornecedor.create({
              empresa_id: empresaAtiva.id,
              cotacao_id: cotacao.id,
              fornecedor_id: fId,
              fornecedor_nome: fornecedor.nome_razao,
              fornecedor_email: emailsFornecedores[fId] || fornecedor.email,
              status: "Enviada",
            });
          })
        );
      }

      // Links dos fornecedores: o servidor monta (o token do link é gerado pelo banco, 0113)
      let porFornecedor = null;
      let erroLinks = "";
      try {
        ({ porFornecedor } = await linksDaCotacao(sigo, cotacao.id));
      } catch (e) {
        erroLinks = e?.message || "erro desconhecido";
      }

      if (porFornecedor) {
        const links = {};
        for (const [fornecedorId, link] of Object.entries(porFornecedor)) {
          links[fornecedorId] = { link };
        }
        setLinksCotacao(links);

        // ENVIO da cotação = senha nova do portal para cada fornecedor: o SERVIDOR gera,
        // grava só o hash e devolve a senha em claro uma vez, para a mensagem.
        const credenciais = {};
        const semSenha = [];
        for (const fornecedorId of Object.keys(porFornecedor)) {
          try {
            const cred = await rotacionarCredencialFornecedor(sigo, { fornecedorId });
            if (cred) credenciais[fornecedorId] = cred;
          } catch (e) {
            console.error("Erro ao gerar a senha do portal do fornecedor:", e);
            semSenha.push(fornecedores.find((f) => f.id === fornecedorId)?.nome_razao || "?");
          }
        }
        setCredenciaisFornecedores(credenciais);
        setErroAcesso("");
        if (semSenha.length) {
          toast.error(
            `Não deu para gerar a senha do portal de: ${semSenha.join(", ")}. ` +
              "O botão WhatsApp tenta de novo antes de abrir a mensagem."
          );
        }
      }

      await sigo.entities.SolicitacaoCompra.update(solicitacao.id, { status: "Em Cotação" });

      if (erroLinks) {
        alert(
          `A cotação foi gravada, mas não deu para gerar os links dos fornecedores: ${erroLinks}\n\n` +
            "Tente de novo pelo Painel de Status da cotação, na aba Cotações."
        );
        onSave();
        return;
      }

      alert(
        cotacaoExistente
          ? "Atualizado!"
          : "Cotação criada! Links gerados para compartilhar por WhatsApp."
      );
      onSave();
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro ao salvar cotação");
    } finally {
      setEnviandoEmail(false);
    }
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link);
    alert("Link copiado!");
  };

  const buildMensagemWhatsApp = (fornecedor, link, creds) => {
    // senha null = já está em hash no banco; nova senha só nasce na ação de enviar
    const credLine = creds
      ? `\n🔑 *Login:* ${creds.email}\n🔑 *Senha:* ${creds.senha || "(a mesma enviada anteriormente)"}`
      : "";
    return `Olá *${fornecedor.nome_razao}*!\n\nVocê foi convidado a participar da cotação *${solicitacao?.numero}*.\n\n${solicitacao?.projeto_nome ? `📋 Projeto: ${solicitacao.projeto_nome}\n` : ""}${dataLimite ? `📅 Prazo: ${new Date(dataLimite).toLocaleDateString("pt-BR")}\n` : ""}${credLine}\n🔗 Acesse aqui:\n${link}\n\nAtenciosamente,\n*${empresaAtiva.nome_fantasia || empresaAtiva.razao_social || empresaAtiva.nome}*`;
  };

  const enviarWhatsApp = async (fornecedor, linkData) => {
    const link = typeof linkData === "string" ? linkData : linkData.link;
    const telefone = fornecedor.telefone?.replace(/\D/g, "");
    if (!telefone) {
      alert("Fornecedor não tem telefone cadastrado");
      return;
    }
    const creds = await credencialDoEnvio(fornecedor);
    if (creds === false) return;
    const mensagem = buildMensagemWhatsApp(fornecedor, link, creds);
    window.open(`https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`, "_blank");
  };

  // Enviar = senha nova pelo servidor se a tela só conhece o hash (a mensagem sai com a senha nova).
  // Devolve a credencial (ou null, sem acesso e sem e-mail); `false` = o servidor falhou e a tela já avisou.
  const credencialDoEnvio = async (fornecedor) => {
    try {
      const atual = credenciaisFornecedores[fornecedor.id];
      const creds = await credencialParaEnvio(sigo, { atual, fornecedorId: fornecedor.id });
      if (creds && creds !== atual) {
        setCredenciaisFornecedores((prev) => ({ ...prev, [fornecedor.id]: creds }));
      }
      return creds;
    } catch (e) {
      console.error("Erro ao gerar a senha do portal do fornecedor:", e);
      toast.error(
        `Não deu para gerar a senha do portal do fornecedor: ${e.message} A mensagem não foi aberta; tente de novo.`
      );
      return false;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full p-0 flex flex-col w-full md:w-[calc(100%-256px)] md:inset-auto md:right-0 md:left-256px md:top-16"
        data-fullscreen-modal
      >
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle>
              {cotacaoExistente ? "Editar" : "Criar"} Cotação - {solicitacao?.numero}
            </SheetTitle>
          </SheetHeader>
          <button
            onClick={() => onOpenChange(false)}
            className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Itens da Solicitação */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-slate-800 mb-3">Itens a Cotar</h3>
                <div className="space-y-2">
                  {itens.map((item, idx) => {
                    const codigo =
                      item.material_codigo || codigosOrcamento[item.descricao?.toLowerCase()] || "";
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-2 bg-slate-50 rounded"
                      >
                        <span className="text-sm font-medium text-slate-600 w-8">{idx + 1}.</span>
                        {codigo && (
                          <span className="font-mono text-xs text-slate-500 w-20 flex-shrink-0">
                            {codigo}
                          </span>
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.descricao}</p>
                          {item.especificacoes && (
                            <p className="text-xs text-slate-500">{item.especificacoes}</p>
                          )}
                        </div>
                        <Badge variant="outline">
                          {item.quantidade} {item.unidade}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Seleção de Fornecedores */}
            <div>
              <Label className="mb-3 block">Selecionar Fornecedores</Label>

              {erroAcesso && (
                <div
                  role="alert"
                  className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 flex items-start justify-between gap-3"
                >
                  <span>
                    Não deu para carregar os links e o acesso dos fornecedores: {erroAcesso}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => carregarCotacaoExistente()}
                    className="flex-shrink-0"
                  >
                    Tentar de novo
                  </Button>
                </div>
              )}

              {/* Fornecedores Selecionados */}
              {fornecedoresSelecionados.length > 0 && (
                <div className="mb-3 space-y-3">
                  {fornecedoresSelecionados.map((fornecedorId) => {
                    const fornecedor = fornecedores.find((f) => f.id === fornecedorId);
                    const linkData = linksFornecedores[fornecedorId];
                    if (!fornecedor) return null;
                    return (
                      <div
                        key={fornecedor.id}
                        className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 space-y-2">
                            <p className="font-medium text-sm text-slate-800">
                              {fornecedor.nome_razao}
                            </p>
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              <Input
                                type="email"
                                placeholder="Email do fornecedor..."
                                value={emailsFornecedores[fornecedor.id] || ""}
                                onChange={(e) =>
                                  setEmailsFornecedores({
                                    ...emailsFornecedores,
                                    [fornecedor.id]: e.target.value,
                                  })
                                }
                                className="h-8 text-sm flex-1"
                              />
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removerFornecedor(fornecedor.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            ×
                          </Button>
                        </div>

                        {/* Link gerado */}
                        {linkData && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200">
                              <Input
                                type="text"
                                value={linkData.link}
                                readOnly
                                className="h-8 text-xs flex-1 bg-slate-50"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  navigator.clipboard.writeText(linkData.link);
                                  alert("Link copiado!");
                                }}
                                className="text-slate-600 hover:bg-slate-100"
                              >
                                <Copy className="w-3 h-3 mr-1" />
                                Copiar
                              </Button>
                              {fornecedor.telefone && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    const telefone = fornecedor.telefone?.replace(/\D/g, "");
                                    // enviar = senha nova pelo servidor se só existe o hash
                                    const creds = await credencialDoEnvio(fornecedor);
                                    if (creds === false) return;
                                    const mensagem = buildMensagemWhatsApp(
                                      fornecedor,
                                      linkData.link,
                                      creds
                                    );
                                    window.open(
                                      `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`,
                                      "_blank"
                                    );
                                  }}
                                  className="text-green-600 hover:bg-green-50"
                                >
                                  <MessageSquare className="w-3 h-3 mr-1" />
                                  WhatsApp
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setMensagemExpandida((prev) => ({
                                    ...prev,
                                    [fornecedor.id]: !prev[fornecedor.id],
                                  }))
                                }
                                className="text-slate-500 hover:bg-slate-100 text-xs"
                              >
                                {mensagemExpandida[fornecedor.id] ? "▲ Ocultar" : "▼ Mensagem"}
                              </Button>
                            </div>
                            {mensagemExpandida[fornecedor.id] && (
                              <div className="space-y-1">
                                <Textarea
                                  readOnly
                                  value={buildMensagemWhatsApp(
                                    fornecedor,
                                    linkData.link,
                                    credenciaisFornecedores[fornecedor.id]
                                  )}
                                  className="text-xs bg-slate-50 resize-none"
                                  rows={8}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const creds = credenciaisFornecedores[fornecedor.id];
                                    const mensagem = buildMensagemWhatsApp(
                                      fornecedor,
                                      linkData.link,
                                      creds
                                    );
                                    navigator.clipboard.writeText(mensagem);
                                    alert("Mensagem copiada!");
                                  }}
                                  className="w-full text-slate-600"
                                >
                                  <Copy className="w-3 h-3 mr-1" />
                                  Copiar Mensagem
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Campo de Busca */}
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Digite para buscar fornecedores..."
                  value={searchFornecedor}
                  onChange={(e) => setSearchFornecedor(e.target.value)}
                  className="w-full"
                />

                {/* Resultados da Busca */}
                {searchFornecedor && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {fornecedoresFiltrados.length > 0 ? (
                      fornecedoresFiltrados.map((fornecedor) => (
                        <button
                          key={fornecedor.id}
                          type="button"
                          onClick={() => adicionarFornecedor(fornecedor)}
                          className="w-full text-left p-3 hover:bg-slate-50 transition-colors border-b last:border-b-0"
                        >
                          <p className="font-medium text-sm text-slate-800">
                            {fornecedor.nome_razao}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            {fornecedor.email && (
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {fornecedor.email}
                              </span>
                            )}
                            {fornecedor.telefone && (
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {fornecedor.telefone}
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-sm text-slate-500 text-center">
                        Nenhum fornecedor encontrado
                      </div>
                    )}
                  </div>
                )}
              </div>

              {fornecedores.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4 mt-2">
                  Nenhum fornecedor cadastrado
                </p>
              )}
            </div>

            <div>
              <Label>Data Limite para Resposta</Label>
              <Input
                type="date"
                value={dataLimite}
                onChange={(e) => setDataLimite(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="mt-1.5"
                rows={3}
                placeholder="Informações adicionais para os fornecedores..."
              />
            </div>

            {/* Links gerados */}
            {Object.keys(linksCotacao).length > 0 && (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-semibold text-green-800 mb-3">
                    ✅ Links Gerados - Compartilhe com os Fornecedores
                  </h3>
                  {Object.entries(linksCotacao).map(([fornecedorId, link]) => {
                    const fornecedor = fornecedores.find((f) => f.id === fornecedorId);
                    return (
                      <div
                        key={fornecedorId}
                        className="p-3 bg-white rounded border border-green-200 space-y-2"
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{fornecedor?.nome_razao}</p>
                            {fornecedor?.email && (
                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3" />
                                {fornecedor.email}
                              </p>
                            )}
                            {fornecedor?.telefone && (
                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                <MessageSquare className="w-3 h-3" />
                                {fornecedor.telefone}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {fornecedor?.telefone && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => enviarWhatsApp(fornecedor, link)}
                                className="text-green-600 border-green-600 hover:bg-green-50"
                              >
                                <MessageSquare className="w-4 h-4 mr-1" />
                                WhatsApp
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyLink(link)}
                              className="text-slate-600 hover:bg-slate-50"
                            >
                              <Copy className="w-4 h-4 mr-1" />
                              Copiar Link
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setMensagemExpandida((prev) => ({
                                  ...prev,
                                  [`gen_${fornecedorId}`]: !prev[`gen_${fornecedorId}`],
                                }))
                              }
                              className="text-slate-500 text-xs"
                            >
                              {mensagemExpandida[`gen_${fornecedorId}`]
                                ? "▲ Ocultar"
                                : "▼ Mensagem"}
                            </Button>
                          </div>
                        </div>
                        {mensagemExpandida[`gen_${fornecedorId}`] && (
                          <div className="space-y-1">
                            <Textarea
                              readOnly
                              value={buildMensagemWhatsApp(
                                fornecedor,
                                typeof link === "string" ? link : link.link,
                                credenciaisFornecedores[fornecedorId]
                              )}
                              className="text-xs bg-slate-50 resize-none"
                              rows={8}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const mensagem = buildMensagemWhatsApp(
                                  fornecedor,
                                  typeof link === "string" ? link : link.link,
                                  credenciaisFornecedores[fornecedorId]
                                );
                                navigator.clipboard.writeText(mensagem);
                                alert("Mensagem copiada!");
                              }}
                              className="w-full text-slate-600"
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              Copiar Mensagem
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-xs text-slate-600 mt-2 italic">
                    💡 Use o botão WhatsApp para enviar o link aos fornecedores ou copie o link para
                    compartilhar.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleCriarCotacao}
            disabled={enviandoEmail || fornecedoresSelecionados.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {enviandoEmail
              ? "Gerando links..."
              : cotacaoExistente
                ? "Atualizar Cotação"
                : "Criar Cotação"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
