import React, { useState, useEffect } from "react";
import { sigo, supabase } from "@/api/sigoClient";
import { useEmpresa } from "@/Layout";

/**
 * Escapa caracteres HTML pra prevenir XSS quando interpolamos dados
 * do banco em template literals de impressão (innerHTML).
 * Ex: "<script>alert(1)</script>" → "&lt;script&gt;alert(1)&lt;/script&gt;"
 */
const escHtml = (val) =>
  val == null
    ? ""
    : String(val)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Printer,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AprovacaoModal({
  open,
  onOpenChange,
  solicitacao,
  empresaAtiva,
  user,
  onApproved,
}) {
  // Pegamos o perfil do vínculo (Admin, Supervisor, Gerente, etc).
  // Usado pra validar quem pode aprovar cada faixa (RPC valida server-side
  // mas evitamos a viagem de rede quando obviamente não tem perfil).
  const { vinculo } = useEmpresa();
  const perfilUsuario = vinculo?.perfil || "Operador";

  const [loading, setLoading] = useState(true);
  const [itens, setItens] = useState([]);
  const [itensEnriquecidos, setItensEnriquecidos] = useState([]);
  const [comentarios, setComentarios] = useState("");
  const [processando, setProcessando] = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [aprovarTodos, setAprovarTodos] = useState(true);
  const [aprovacoes, setAprovacoes] = useState([]);
  const [niveis, setNiveis] = useState([]);

  // Solicitante não pode aprovar a si mesmo — server-side bloqueia,
  // aqui apenas escondemos o botão pra evitar confusão.
  const isSolicitante =
    solicitacao?.solicitante_id === user?.id ||
    String(solicitacao?.solicitante_nome || "").toLowerCase() ===
      String(user?.full_name || "").toLowerCase();

  useEffect(() => {
    if (open && solicitacao) {
      const loadApprovalData = async () => {
        setLoading(true);
        try {
          const [itensData, materiais, orcamentoItens, aprovacoesData, niveisData] =
            await Promise.all([
              sigo.entities.SolicitacaoCompraItem.filter({ solicitacao_id: solicitacao.id }),
              sigo.entities.Material.filter({ empresa_id: empresaAtiva.id }, "-created_date", 9999),
              solicitacao.projeto_id
                ? sigo.entities.OrcamentoItem.filter({ projeto_id: solicitacao.projeto_id })
                : Promise.resolve([]),
              sigo.entities.AprovacaoSolicitacao.filter({ solicitacao_id: solicitacao.id }),
              sigo.entities.NivelAprovacao.filter({
                empresa_id: empresaAtiva.id,
                tipo: "SolicitacaoCompra",
              }).catch(() => []),
            ]);
          // Ordena cronologicamente
          aprovacoesData.sort((a, b) => {
            const da = new Date(a.data_decisao || a.created_at || 0).getTime();
            const db = new Date(b.data_decisao || b.created_at || 0).getTime();
            return da - db;
          });
          niveisData.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
          setAprovacoes(aprovacoesData);
          setNiveis(niveisData);

          const itensEnriquecidosData = itensData.map((item) => {
            const material = materiais.find(
              (m) =>
                (item.material_id && m.id === item.material_id) ||
                m.nome?.toLowerCase() === item.descricao?.toLowerCase()
            );
            // Buscar código no orçamento como fallback
            const orcItem = orcamentoItens.find(
              (o) => o.descricao?.toLowerCase() === item.descricao?.toLowerCase()
            );
            return {
              ...item,
              codigo: item.material_codigo || material?.codigo || orcItem?.codigo || "-",
              valor_medio: material?.preco || 0,
              quantidade_estoque: 0,
              quantidade_editavel: item.quantidade,
            };
          });

          const itensOrdenados = itensEnriquecidosData.sort((a, b) =>
            (a.descricao || "").localeCompare(b.descricao || "")
          );
          setItens(itensData);
          setItensEnriquecidos(itensOrdenados);
          setItensSelecionados(itensData.map((i) => i.id));
          setAprovarTodos(true);
        } catch (error) {
          console.error("Erro ao carregar itens:", error);
        } finally {
          setLoading(false);
        }
      };
      loadApprovalData();
    }
  }, [open, solicitacao, empresaAtiva]);

  const toggleItem = (itemId) => {
    if (itensSelecionados.includes(itemId)) {
      setItensSelecionados(itensSelecionados.filter((id) => id !== itemId));
      setAprovarTodos(false);
    } else {
      const novosItens = [...itensSelecionados, itemId];
      setItensSelecionados(novosItens);
      if (novosItens.length === itens.length) {
        setAprovarTodos(true);
      }
    }
  };

  const toggleTodos = () => {
    if (aprovarTodos) {
      setItensSelecionados([]);
      setAprovarTodos(false);
    } else {
      setItensSelecionados(itens.map((i) => i.id));
      setAprovarTodos(true);
    }
  };

  const updateQuantidade = (itemId, novaQuantidade) => {
    setItensEnriquecidos(
      itensEnriquecidos.map((item) =>
        item.id === itemId
          ? { ...item, quantidade_editavel: parseFloat(novaQuantidade) || 0 }
          : item
      )
    );
  };

  const handleDecisao = async (decisao) => {
    if (!solicitacao?.id) {
      alert("Erro: Dados inválidos");
      return;
    }
    if (!supabase) {
      alert("Erro: backend Supabase não disponível");
      return;
    }

    // Rejeição exige motivo claro (a RPC valida mínimo 5 chars)
    if (decisao === "Rejeitado" && (!comentarios || comentarios.trim().length < 5)) {
      alert("Informe o motivo da rejeição no campo de comentários (mínimo 5 caracteres).");
      return;
    }

    setProcessando(true);
    try {
      // 1) Salva alterações de quantidade nos itens (mesma lógica original).
      //    O trigger trg_sync_total_solicitacao recalcula valor_total_estimado
      //    automaticamente — não precisamos atualizar manualmente.
      const itensAlterados = itensEnriquecidos.filter(
        (item) => item.quantidade_editavel !== item.quantidade
      );
      for (const item of itensAlterados) {
        await sigo.entities.SolicitacaoCompraItem.update(item.id, {
          quantidade: item.quantidade_editavel,
        });
      }

      // 2) Chama a RPC apropriada. Ela faz:
      //    - bloqueio de auto-aprovação (solicitante != aprovador)
      //    - validação de perfil contra perfis_aprovadores do nível
      //    - validação de valor contra faixa do nível
      //    - avança pro próximo nível ou marca Aprovada/Rejeitada
      //    - registra em aprovacao_solicitacao + dispara notificação
      const fn =
        decisao === "Aprovado" ? "aprovar_solicitacao_compra" : "rejeitar_solicitacao_compra";

      const args =
        decisao === "Aprovado"
          ? {
              p_solicitacao_id: solicitacao.id,
              p_aprovador_email: user?.email,
              p_aprovador_nome: user?.full_name,
              p_aprovador_perfil: perfilUsuario,
              p_comentario: comentarios || null,
            }
          : {
              p_solicitacao_id: solicitacao.id,
              p_aprovador_email: user?.email,
              p_aprovador_nome: user?.full_name,
              p_aprovador_perfil: perfilUsuario,
              p_motivo: comentarios,
            };

      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw error;

      // Resposta de aprovar é jsonb { aprovada_final, proximo_nivel, mensagem }
      if (decisao === "Aprovado") {
        const r = typeof data === "string" ? JSON.parse(data) : data;
        alert(
          (r?.aprovada_final
            ? "✅ Solicitação APROVADA em todos os níveis!"
            : "✅ Aprovado neste nível.") + (r?.mensagem ? "\n\n" + r.mensagem : "")
        );
      } else {
        alert("Solicitação rejeitada. O solicitante foi notificado.");
      }

      onApproved?.();
      onOpenChange(false);
    } catch (err) {
      console.error("[AprovacaoModal] erro na decisão:", err);
      // PostgreSQL erros vêm com message; supabase-js encapsula em err.message
      alert("❌ " + (err?.message || "Erro ao processar aprovação"));
    } finally {
      setProcessando(false);
    }
  };

  const getStatusIcon = (status) => {
    if (status === "Aprovado") {
      return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    }
    if (status === "Rejeitado") {
      return <XCircle className="w-5 h-5 text-red-600" />;
    }
    return <Clock className="w-5 h-5 text-orange-600" />;
  };

  const getStatusBadge = (status) => {
    const classes = {
      Pendente: "bg-orange-100 text-orange-700 border-orange-200",
      Aprovado: "bg-green-100 text-green-700 border-green-200",
      Rejeitado: "bg-red-100 text-red-700 border-red-200",
    };
    return <Badge className={classes[status]}>{status}</Badge>;
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
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <SheetTitle>Revisar Solicitação - {solicitacao?.numero}</SheetTitle>
                <div className="flex gap-2">
                  {isSolicitante ? (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
                      Você é o solicitante — outra pessoa precisa aprovar.
                    </div>
                  ) : (
                    <>
                      <Button
                        onClick={() => handleDecisao("Aprovado")}
                        disabled={processando || (!aprovarTodos && itensSelecionados.length === 0)}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <ThumbsUp className="w-4 h-4 mr-2" />
                        Aprovar
                      </Button>
                      <Button
                        onClick={() => handleDecisao("Rejeitado")}
                        disabled={processando || (!aprovarTodos && itensSelecionados.length === 0)}
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-600 hover:bg-red-50"
                      >
                        <ThumbsDown className="w-4 h-4 mr-2" />
                        Reprovar
                      </Button>
                    </>
                  )}
                  <Button
                    onClick={async () => {
                      if (
                        !confirm(
                          "⚠️ Tem certeza que deseja EXCLUIR esta solicitação?\n\nEsta ação não pode ser desfeita!"
                        )
                      )
                        return;
                      try {
                        const delay = (ms) => new Promise((res) => setTimeout(res, ms));

                        // Excluir aprovações sequencialmente
                        const aprovs = await sigo.entities.AprovacaoSolicitacao.filter({
                          solicitacao_id: solicitacao.id,
                        });
                        for (const a of aprovs) {
                          await sigo.entities.AprovacaoSolicitacao.delete(a.id);
                          await delay(300);
                        }

                        // Excluir itens sequencialmente
                        const its = await sigo.entities.SolicitacaoCompraItem.filter({
                          solicitacao_id: solicitacao.id,
                        });
                        for (const i of its) {
                          await sigo.entities.SolicitacaoCompraItem.delete(i.id);
                          await delay(300);
                        }

                        // Excluir solicitação
                        await sigo.entities.SolicitacaoCompra.delete(solicitacao.id);

                        alert("✅ Solicitação excluída com sucesso!");
                        onOpenChange(false);
                        onApproved();
                      } catch (error) {
                        console.error("Erro:", error);
                        alert("❌ Erro ao excluir solicitação");
                      }
                    }}
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir
                  </Button>
                  <Button
                    onClick={() => {
                      const printContent = document.createElement("div");
                      printContent.innerHTML = `
                        <style>
                          @media print {
                            body { font-family: Arial, sans-serif; margin: 20px; }
                            h1 { font-size: 24px; margin-bottom: 10px; }
                            h2 { font-size: 18px; margin-top: 20px; margin-bottom: 10px; border-bottom: 2px solid #333; padding-bottom: 5px; }
                            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                            th { background-color: #f5f5f5; font-weight: bold; }
                            .info-row { display: flex; justify-content: space-between; margin: 5px 0; }
                            .label { font-weight: bold; }
                          }
                        </style>
                        <h1>Solicitação de Compra - ${escHtml(solicitacao?.numero)}</h1>

                        <div style="margin: 20px 0;">
                          <div class="info-row"><span class="label">Solicitante:</span> ${escHtml(solicitacao?.solicitante_nome)}</div>
                          <div class="info-row"><span class="label">Projeto:</span> ${escHtml(solicitacao?.projeto_nome || "-")}</div>
                          <div class="info-row"><span class="label">Valor Total:</span> R$ ${(solicitacao?.valor_total || 0).toFixed(2)}</div>
                          <div class="info-row"><span class="label">Prioridade:</span> ${escHtml(solicitacao?.prioridade || "Normal")}</div>
                        </div>

                        <h2>Itens da Solicitação</h2>
                        <table>
                          <thead>
                            <tr>
                              <th>Código</th>
                              <th>Descrição</th>
                              <th>Quantidade</th>
                              <th>Unidade</th>
                              <th>Valor Médio</th>
                              <th>Qtd. Estoque</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${itensEnriquecidos
                              .map(
                                (item) => `
                              <tr>
                                <td>${escHtml(item.codigo)}</td>
                                <td>${escHtml(item.descricao)}</td>
                                <td style="text-align: right;">${Number(item.quantidade_editavel) || 0}</td>
                                <td>${escHtml(item.unidade)}</td>
                                <td style="text-align: right;">R$ ${(Number(item.valor_medio) || 0).toFixed(2)}</td>
                                <td style="text-align: right;">${(Number(item.quantidade_estoque) || 0).toFixed(2)}</td>
                              </tr>
                            `
                              )
                              .join("")}
                          </tbody>
                        </table>

                        ''
                      `;

                      const printWindow = window.open("", "", "width=800,height=600");
                      printWindow.document.write(printContent.innerHTML);
                      printWindow.document.close();
                      printWindow.focus();
                      setTimeout(() => {
                        printWindow.print();
                        printWindow.close();
                      }, 250);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Imprimir
                  </Button>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="ml-2 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
                  >
                    <X className="w-5 h-5 text-slate-600" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-2 block">Comentários (opcional)</label>
                <Textarea
                  value={comentarios}
                  onChange={(e) => setComentarios(e.target.value)}
                  placeholder="Adicione observações sobre sua decisão..."
                  rows={2}
                  className="bg-white"
                />
              </div>
            </div>
          </SheetHeader>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Informações da Solicitação */}
              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Solicitante:</span>
                    <span className="font-medium">{solicitacao.solicitante_nome}</span>
                  </div>
                  {solicitacao.projeto_nome && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Projeto:</span>
                      <span className="font-medium">{solicitacao.projeto_nome}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600">Status:</span>
                    <span className="font-medium">{solicitacao.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Prioridade:</span>
                    <Badge
                      variant="outline"
                      className={
                        solicitacao.prioridade === "Urgente"
                          ? "border-red-500 text-red-600"
                          : solicitacao.prioridade === "Alta"
                            ? "border-orange-500 text-orange-600"
                            : "border-blue-500 text-blue-600"
                      }
                    >
                      {solicitacao.prioridade}
                    </Badge>
                  </div>
                  {solicitacao.valor_total_estimado != null && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Valor estimado:</span>
                      <span className="font-medium text-emerald-700">
                        {(Number(solicitacao.valor_total_estimado) || 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Timeline de aprovação */}
              {(aprovacoes.length > 0 || niveis.length > 0) && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-sm mb-3">Histórico de Aprovação</h3>
                    <ol className="space-y-2">
                      {niveis.length > 0
                        ? niveis.map((n) => {
                            // Casa cada nivel.ordem com o registro de aprovacao do nivel
                            // (a RPC anota "Aprovado nível X" no comentário).
                            const reg = aprovacoes.find(
                              (a) =>
                                a.status === "Aprovado" &&
                                String(a.comentarios || "").match(
                                  new RegExp("nível\\s*" + n.ordem + "\\b", "i")
                                )
                            );
                            const nivelAtual = solicitacao.nivel_aprovacao_atual || 1;
                            const passou = !!reg;
                            const atual =
                              !passou &&
                              n.ordem === nivelAtual &&
                              solicitacao.status === "Pendente Aprovação";
                            return (
                              <li
                                key={n.id}
                                className={cn(
                                  "flex items-start gap-3 p-2 rounded border",
                                  passou
                                    ? "bg-emerald-50 border-emerald-200"
                                    : atual
                                      ? "bg-amber-50 border-amber-200"
                                      : "bg-slate-50 border-slate-200"
                                )}
                              >
                                <span className="mt-0.5">
                                  {passou ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  ) : atual ? (
                                    <Clock className="w-4 h-4 text-amber-600" />
                                  ) : (
                                    <Clock className="w-4 h-4 text-slate-400" />
                                  )}
                                </span>
                                <div className="flex-1 text-xs">
                                  <div className="font-medium text-slate-800">
                                    Nível {n.ordem} — {n.nome}
                                  </div>
                                  <div className="text-slate-600">
                                    {passou
                                      ? `${reg.aprovador_nome || "—"} • ${new Date(
                                          reg.data_decisao || reg.created_at
                                        ).toLocaleString("pt-BR")}`
                                      : atual
                                        ? "Aguardando aprovação"
                                        : "Pendente"}
                                  </div>
                                  {passou && reg.comentarios && (
                                    <div className="text-slate-500 mt-0.5 italic">
                                      “{reg.comentarios}”
                                    </div>
                                  )}
                                </div>
                              </li>
                            );
                          })
                        : aprovacoes.map((a, i) => (
                            <li
                              key={a.id}
                              className={cn(
                                "flex items-start gap-3 p-2 rounded border",
                                a.status === "Aprovado"
                                  ? "bg-emerald-50 border-emerald-200"
                                  : a.status === "Rejeitado"
                                    ? "bg-red-50 border-red-200"
                                    : "bg-amber-50 border-amber-200"
                              )}
                            >
                              <span className="mt-0.5">{getStatusIcon(a.status)}</span>
                              <div className="flex-1 text-xs">
                                <div className="font-medium text-slate-800">
                                  Decisão {i + 1} — {a.status}
                                </div>
                                <div className="text-slate-600">
                                  {a.aprovador_nome || "—"}
                                  {a.data_decisao
                                    ? ` • ${new Date(a.data_decisao).toLocaleString("pt-BR")}`
                                    : ""}
                                </div>
                                {a.comentarios && (
                                  <div className="text-slate-500 mt-0.5 italic">
                                    “{a.comentarios}”
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                      {/* Mostra rejeição se vier separado */}
                      {niveis.length > 0 &&
                        aprovacoes
                          .filter((a) => a.status === "Rejeitado")
                          .map((r) => (
                            <li
                              key={r.id}
                              className="flex items-start gap-3 p-2 rounded border bg-red-50 border-red-200"
                            >
                              <XCircle className="w-4 h-4 text-red-600 mt-0.5" />
                              <div className="flex-1 text-xs">
                                <div className="font-medium text-red-700">Rejeitado</div>
                                <div className="text-slate-600">
                                  {r.aprovador_nome || "—"}
                                  {r.data_decisao
                                    ? ` • ${new Date(r.data_decisao).toLocaleString("pt-BR")}`
                                    : ""}
                                </div>
                                {r.comentarios && (
                                  <div className="text-slate-500 mt-0.5 italic">
                                    “{r.comentarios}”
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                    </ol>
                  </CardContent>
                </Card>
              )}

              {/* Itens */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">Itens da Solicitação</h3>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="todos-itens"
                        checked={aprovarTodos}
                        onCheckedChange={toggleTodos}
                      />
                      <label htmlFor="todos-itens" className="text-sm font-medium cursor-pointer">
                        Selecionar Todos
                      </label>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead className="w-24">Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-32 text-right">Valor Médio</TableHead>
                          <TableHead className="w-28">Quantidade</TableHead>
                          <TableHead className="w-28 text-right">Qtd. Estoque</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensEnriquecidos.map((item) => (
                          <TableRow
                            key={item.id}
                            className={cn(itensSelecionados.includes(item.id) && "bg-green-50")}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={itensSelecionados.includes(item.id)}
                                onCheckedChange={() => toggleItem(item.id)}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{item.codigo}</TableCell>
                            <TableCell>{item.descricao}</TableCell>
                            <TableCell className="text-right font-medium text-green-600">
                              R$ {item.valor_medio.toFixed(2)}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.quantidade_editavel}
                                  onChange={(e) => {
                                    updateQuantidade(item.id, e.target.value);
                                  }}
                                  className="w-20 h-8 text-sm"
                                />
                                <span className="text-xs text-slate-500">{item.unidade}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant="outline"
                                className={
                                  item.quantidade_estoque < item.quantidade_editavel
                                    ? "border-red-500 text-red-600"
                                    : ""
                                }
                              >
                                {item.quantidade_estoque.toFixed(2)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {!aprovarTodos && (
                    <p className="text-xs text-slate-600 mt-3 bg-amber-50 p-2 rounded">
                      {itensSelecionados.length} de {itens.length} item(ns) selecionado(s)
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
