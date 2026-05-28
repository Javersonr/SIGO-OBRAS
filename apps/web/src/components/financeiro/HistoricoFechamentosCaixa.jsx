import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReconciliacaoComDespesaModal from "./ReconciliacaoComDespesaModal.jsx";
import DesfazerConciliacaoModal from "./DesfazerConciliacaoModal.jsx";
import FechamentoCaixaModal from "./FechamentoCaixaModal.jsx";
import AcrescentarPreLancamentoModal from "./AcrescentarPreLancamentoModal.jsx";
import {
  Loader2,
  Package,
  CheckCircle2,
  FileText,
  ChevronDown,
  ChevronRight,
  Undo2,
  ExternalLink,
  FileSpreadsheet,
  Pencil,
  Save,
  PlusCircle,
} from "lucide-react";

const STATUS_CORES = {
  Aberto: "bg-slate-100 text-slate-700",
  "Aguardando Pagamento": "bg-yellow-100 text-yellow-800",
  Pago: "bg-green-100 text-green-700",
};

export default function HistoricoFechamentosCaixa({
  empresaId,
  usuarioEmail,
  usuarioNome,
  podeAprovarPagamento,
  onReload,
}) {
  const [fechamentos, setFechamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [expandido, setExpandido] = useState(null);
  const [desfazendoId, setDesfazendoId] = useState(null);
  const [preLancamentosCache, setPreLancamentosCache] = useState({});
  const [gerandoPDFId, setGerandoPDFId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [conciliarPL, setConciliarPL] = useState(null);
  const [desfazendoConciliacaoPL, setDesfazendoConciliacaoPL] = useState(null);
  const [desfazendoPagamentoId, setDesfazendoPagamentoId] = useState(null);
  const [aprovandoPagamentoFechamento, setAprovandoPagamentoFechamento] = useState(null); // { fechamento, pls }
  const [acrescentandoEmFechamento, setAcrescentandoEmFechamento] = useState(null); // fechamento

  useEffect(() => {
    carregar();
  }, [empresaId]);

  const carregar = async () => {
    setCarregando(true);
    try {
      const data = await sigo.entities.FechamentoCaixa.filter({ empresa_id: empresaId });
      setFechamentos(data.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    } catch (err) {
      console.error("Erro:", err);
    } finally {
      setCarregando(false);
    }
  };

  const carregarPreLancamentos = async (fechamento) => {
    const ids = JSON.parse(fechamento.pre_lancamentos_ids || "[]");
    if (ids.length === 0) return;
    const key = fechamento.id;
    if (preLancamentosCache[key]) return;
    const pls = await Promise.all(
      ids.map((id) =>
        sigo.entities.PreLancamento.filter({ id })
          .then((r) => r[0])
          .catch(() => null)
      )
    );
    setPreLancamentosCache((prev) => ({ ...prev, [key]: pls.filter(Boolean) }));
  };

  const handleExpandir = (id, fechamento) => {
    if (expandido === id) {
      setExpandido(null);
    } else {
      setExpandido(id);
      carregarPreLancamentos(fechamento);
    }
  };

  const handleImprimirComComprovantes = async (fechamento, pls) => {
    const itens = pls.filter((pl) => pl.status === "Conciliado");
    if (itens.length === 0) {
      alert("Nenhum item conciliado encontrado.");
      return;
    }
    setGerandoPDFId(fechamento.id);
    try {
      const payload = {
        itens: itens.map((pl, i) => {
          const d =
            typeof pl.dados_extraidos === "string"
              ? JSON.parse(pl.dados_extraidos || "{}")
              : pl.dados_extraidos || {};
          return {
            idx: i,
            data: pl.data_competencia
              ? new Date(pl.data_competencia + "T12:00:00").toLocaleDateString("pt-BR")
              : d.data || "-",
            descricao: pl.descricao_caixa || d.fornecedor || d.descricao || "-",
            documento: d.tipo_documento || d.numero_documento || "",
            valor: parseFloat(d.valor) || 0,
            comprovante_url: pl.comprovante_url || null,
          };
        }),
        cabecalho: {
          numeroCaixa: fechamento.numero || fechamento.id.slice(0, 6),
          nomeResponsavel:
            fechamento.usuario_reposicao_nome || fechamento.usuario_reposicao_email || "",
          dataFormatada: fechamento.data_pagamento
            ? new Date(fechamento.data_pagamento + "T12:00:00").toLocaleDateString("pt-BR")
            : "",
          empresa: "",
          saldoAnterior: 0,
          saldoAtual: 0,
        },
      };
      const response = await sigo.functions.invoke("gerarPDFComprovantes", payload);
      const base64 = response.data.base64;
      const binary = atob(base64);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fechamento-${fechamento.numero}-comprovantes.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      alert("Erro ao gerar PDF: " + err.message);
    } finally {
      setGerandoPDFId(null);
    }
  };

  const handleImprimirPlanilha = (fechamento, pls) => {
    const itens = pls.filter((pl) => pl.status === "Conciliado");
    const total = itens.reduce((sum, pl) => {
      try {
        const d =
          typeof pl.dados_extraidos === "string"
            ? JSON.parse(pl.dados_extraidos)
            : pl.dados_extraidos || {};
        return sum + (parseFloat(d.valor) || 0);
      } catch {
        return sum;
      }
    }, 0);
    const saldoAnt = 0;
    const saldoAtu = saldoAnt - total;
    const dataFormatada = fechamento.data_fechamento
      ? new Date(fechamento.data_fechamento + "T12:00:00").toLocaleDateString("pt-BR")
      : "";
    const nomeResponsavel =
      fechamento.usuario_reposicao_nome || fechamento.usuario_reposicao_email || "";
    const numeroCaixa = fechamento.numero || fechamento.id.slice(0, 6);

    const linhasItens = itens
      .map((pl, i) => {
        const d =
          typeof pl.dados_extraidos === "string"
            ? JSON.parse(pl.dados_extraidos || "{}")
            : pl.dados_extraidos || {};
        const data = pl.data_competencia
          ? new Date(pl.data_competencia + "T12:00:00").toLocaleDateString("pt-BR")
          : d.data || "";
        const descricao = pl.descricao_caixa || d.descricao || d.fornecedor || "-";
        const documento = d.tipo_documento || d.numero_documento || "";
        const valor = parseFloat(d.valor) || 0;
        return `<tr>
        <td style="border:1px solid #999;padding:4px 8px;text-align:center;">${i + 1}</td>
        <td style="border:1px solid #999;padding:4px 8px;">${data}</td>
        <td style="border:1px solid #999;padding:4px 8px;">${descricao}</td>
        <td style="border:1px solid #999;padding:4px 8px;text-align:center;">${documento}</td>
        <td style="border:1px solid #999;padding:4px 8px;text-align:right;"></td>
        <td style="border:1px solid #999;padding:4px 8px;text-align:right;color:#c00;">R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      </tr>`;
      })
      .join("");

    const html = `<html><head><title>Fechamento de Caixa</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px;}table{border-collapse:collapse;width:100%;}
    th{background:#4a7c2e;color:#fff;padding:5px 8px;border:1px solid #999;}td{border:1px solid #999;padding:4px 8px;}
    .titulo{background:#4a7c2e;color:#fff;text-align:center;font-size:13px;font-weight:bold;padding:6px;}
    .subtitulo{background:#4a7c2e;color:#fff;text-align:center;font-size:11px;padding:4px;}
    .empresa{text-align:center;font-size:13px;font-weight:bold;padding:6px;border:1px solid #999;}
    .total-row td{font-weight:bold;background:#f5f5f5;}</style>
    </head><body><table>
    <tr><td colspan="6" class="titulo">${numeroCaixa} CAIXA FUNDO FIXO – ${nomeResponsavel.toUpperCase()}</td></tr>
    <tr><td colspan="6" class="subtitulo">PRESTAÇÃO DE CONTAS REF A: ${dataFormatada}</td></tr>
    <tr><th>Item</th><th>Data</th><th>HISTÓRICO</th><th>DOCUMENTOS</th><th>ENTRADAS</th><th>SAÍDAS</th></tr>
    <tr><td></td><td></td><td>Saldo Inicial – Último acerto realizado</td><td></td>
    <td style="text-align:right;">R$ ${saldoAnt.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td></td></tr>
    ${linhasItens}
    <tr><td colspan="5"></td><td style="text-align:right;background:#ffff00;font-weight:bold;">R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td></tr>
    <tr class="total-row"><td colspan="4">TOTAIS DO MOVIMENTO</td><td style="text-align:right;">ENTRADAS</td><td></td></tr>
    <tr class="total-row"><td colspan="4"></td><td style="text-align:right;background:#ffff00;">R$ 0,00</td><td style="text-align:right;background:#ffff00;">R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td></tr>
    <tr class="total-row"><td colspan="4">SALDO ANTERIOR</td><td style="text-align:right;">R$ ${saldoAnt.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td></td></tr>
    <tr class="total-row"><td colspan="4">SALDO ATUAL</td><td style="text-align:right;">R$ ${saldoAtu.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td></td></tr>
    <tr><td colspan="4" style="font-weight:bold;">TOTAL PARA CONFERÊNCIA</td>
    <td colspan="2" style="text-align:right;background:#ffff00;font-weight:bold;">R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td></tr>
    </table></body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 800);
  };

  const handleImprimir = (fechamento, pls) => {
    const itens = pls.filter((pl) => pl.status === "Conciliado");
    const total = itens.reduce((sum, pl) => {
      try {
        const d =
          typeof pl.dados_extraidos === "string"
            ? JSON.parse(pl.dados_extraidos)
            : pl.dados_extraidos || {};
        return sum + (parseFloat(d.valor) || 0);
      } catch {
        return sum;
      }
    }, 0);

    const linhas = itens
      .map((pl, i) => {
        const d =
          typeof pl.dados_extraidos === "string"
            ? JSON.parse(pl.dados_extraidos || "{}")
            : pl.dados_extraidos || {};
        const data = pl.data_competencia
          ? new Date(pl.data_competencia + "T12:00:00").toLocaleDateString("pt-BR")
          : "-";
        const descricao = pl.descricao_caixa || d.fornecedor || d.descricao || "-";
        const valor = parseFloat(d.valor) || 0;
        return `<tr>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;">${data}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;">${descricao}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;">${pl.projeto_nome || "-"}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:right;color:#c00;">R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      </tr>`;
      })
      .join("");

    const html = `<html><head><title>Conciliados - Fechamento #${fechamento.numero}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px;}table{border-collapse:collapse;width:100%;}
    th{background:#1e293b;color:#fff;padding:7px 10px;border:1px solid #ccc;text-align:left;}
    .titulo{font-size:15px;font-weight:bold;margin-bottom:4px;}
    .sub{font-size:12px;color:#555;margin-bottom:16px;}
    .total{text-align:right;font-weight:bold;font-size:14px;margin-top:12px;color:#c00;}
    </style></head><body>
    <p class="titulo">Pagamentos Conciliados – Fechamento #${fechamento.numero}</p>
    <p class="sub">Pago em: ${fechamento.data_pagamento ? new Date(fechamento.data_pagamento + "T12:00:00").toLocaleDateString("pt-BR") : "-"} | Responsável: ${fechamento.usuario_reposicao_nome || "-"} | Aprovado por: ${fechamento.usuario_pagamento_nome || "-"}</p>
    <table>
      <thead><tr><th>#</th><th>Data</th><th>Descrição</th><th>Projeto</th><th>Valor</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p class="total">Total Conciliado: R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
    </body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  };

  const getValor = (pl) => {
    try {
      const d =
        typeof pl.dados_extraidos === "string"
          ? JSON.parse(pl.dados_extraidos)
          : pl.dados_extraidos || {};
      return parseFloat(d.valor) || 0;
    } catch {
      return 0;
    }
  };

  const getDados = (pl) => {
    try {
      return typeof pl.dados_extraidos === "string"
        ? JSON.parse(pl.dados_extraidos)
        : pl.dados_extraidos || {};
    } catch {
      return {};
    }
  };

  const handleSalvarEdicaoFechamento = async (fechamentoId) => {
    setSalvandoEdicao(true);
    try {
      await sigo.entities.FechamentoCaixa.update(fechamentoId, editValues);
      setEditandoId(null);
      setEditValues({});
      carregar();
    } catch (err) {
      alert("Erro ao salvar: " + err.message);
    } finally {
      setSalvandoEdicao(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
          <Package className="w-4 h-4 text-amber-600" />
          Histórico de Fechamentos de Caixa
        </h3>
      </div>

      {carregando ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
        </div>
      ) : fechamentos.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          Nenhum fechamento de caixa registrado.
        </div>
      ) : (
        <div className="space-y-2">
          {fechamentos.map((f) => {
            const pls = preLancamentosCache[f.id] || [];
            return (
              <Card key={f.id} className="overflow-hidden">
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50"
                  onClick={() => handleExpandir(f.id, f)}
                >
                  {expandido === f.id ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {editandoId === f.id ? (
                        <input
                          className="border rounded px-2 py-1 text-sm font-semibold w-24"
                          value={editValues.numero ?? f.numero ?? ""}
                          onChange={(e) => setEditValues((p) => ({ ...p, numero: e.target.value }))}
                          placeholder="Nº Caixa"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="font-semibold text-slate-800">
                          Fechamento #{f.numero || f.id.slice(0, 6)}
                        </span>
                      )}
                      <Badge className={STATUS_CORES[f.status]}>{f.status}</Badge>
                      {f.usuario_reposicao_nome && (
                        <span className="text-xs text-slate-500">→ {f.usuario_reposicao_nome}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        Fechado por {f.usuario_fechamento_nome || f.usuario_fechamento_email}
                      </span>
                      {editandoId === f.id ? (
                        <input
                          type="date"
                          className="border rounded px-1 py-0.5 text-xs"
                          value={editValues.data_fechamento ?? f.data_fechamento ?? ""}
                          onChange={(e) =>
                            setEditValues((p) => ({ ...p, data_fechamento: e.target.value }))
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span>
                          em{" "}
                          {f.data_fechamento
                            ? new Date(f.data_fechamento + "T12:00:00").toLocaleDateString("pt-BR")
                            : "-"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <div className="font-bold text-red-600">
                      R${" "}
                      {(f.valor_total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-slate-400">
                      {JSON.parse(f.pre_lancamentos_ids || "[]").length} item(s)
                    </div>
                    {f.status !== "Pago" && editandoId !== f.id && (
                      <button
                        className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditandoId(f.id);
                          setEditValues({ numero: f.numero, data_fechamento: f.data_fechamento });
                        }}
                      >
                        <Pencil className="w-3 h-3" /> Editar
                      </button>
                    )}
                    {editandoId === f.id && (
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1"
                          onClick={() => handleSalvarEdicaoFechamento(f.id)}
                          disabled={salvandoEdicao}
                        >
                          {salvandoEdicao ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3" />
                          )}{" "}
                          Salvar
                        </button>
                        <button
                          className="text-xs text-slate-400 hover:text-slate-600"
                          onClick={() => {
                            setEditandoId(null);
                            setEditValues({});
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {expandido === f.id && (
                  <div className="border-t bg-slate-50 px-4 pb-4 pt-3 space-y-3">
                    {f.observacoes_fechamento && (
                      <p className="text-sm text-slate-600 italic">"{f.observacoes_fechamento}"</p>
                    )}

                    {/* Lista de pré-lançamentos */}
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-2">
                        PRÉ-LANÇAMENTOS INCLUÍDOS
                      </p>
                      {pls.length === 0 ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {pls.map((pl) => {
                            const d = getDados(pl);
                            const valor = getValor(pl);
                            const conciliado = pl.status === "Conciliado";
                            return (
                              <div
                                key={pl.id}
                                className={`flex items-center justify-between text-sm bg-white rounded border px-3 py-2 gap-2 ${conciliado ? "border-green-200" : ""}`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {conciliado && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-slate-700 truncate">
                                      {d.fornecedor || pl.projeto_nome || "-"}
                                    </p>
                                    {pl.data_competencia && (
                                      <p className="text-xs text-slate-400">
                                        {new Date(
                                          pl.data_competencia + "T12:00:00"
                                        ).toLocaleDateString("pt-BR")}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {conciliado && (
                                    <Badge className="bg-green-50 text-green-700 text-xs border-green-200">
                                      Conciliado
                                    </Badge>
                                  )}
                                  {pl.status === "Em Fechamento" && (
                                    <button
                                      className="text-xs bg-blue-600 text-white rounded px-2 py-0.5 hover:bg-blue-700"
                                      onClick={() => setConciliarPL(pl)}
                                    >
                                      Conciliar
                                    </button>
                                  )}
                                  {conciliado && (
                                    <button
                                      className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-0.5"
                                      title="Desfazer conciliação"
                                      onClick={() => setDesfazendoConciliacaoPL(pl)}
                                    >
                                      <Undo2 className="w-3 h-3" /> Desfazer
                                    </button>
                                  )}
                                  <span className="font-semibold text-red-600">
                                    R$ {valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </span>
                                  {pl.comprovante_url && (
                                    <a
                                      href={pl.comprovante_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-500 hover:text-blue-700"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Info pagamento realizado */}
                    {f.status === "Pago" && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                        <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                          <CheckCircle2 className="w-4 h-4" />
                          Pagamento Realizado
                        </div>
                        <p className="text-xs text-green-600">
                          Por {f.usuario_pagamento_nome} em{" "}
                          {f.data_pagamento
                            ? new Date(f.data_pagamento + "T12:00:00").toLocaleDateString("pt-BR")
                            : "-"}
                        </p>
                        {f.observacoes_pagamento && (
                          <p className="text-xs text-green-600 italic">
                            "{f.observacoes_pagamento}"
                          </p>
                        )}
                        {f.comprovante_pagamento_url && (
                          <a
                            href={f.comprovante_pagamento_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 underline flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" /> Ver comprovante
                          </a>
                        )}
                      </div>
                    )}

                    {/* Ações */}
                    <div className="flex gap-2 flex-wrap">
                      {/* Acrescentar pré-lançamento: disponível em qualquer status exceto Pago */}
                      {f.status !== "Pago" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-blue-600 border-blue-200 hover:bg-blue-50"
                          onClick={() => setAcrescentandoEmFechamento(f)}
                        >
                          <PlusCircle className="w-4 h-4 mr-1" />
                          Acrescentar Pré-lançamento
                        </Button>
                      )}

                      {f.status === "Aguardando Pagamento" && (
                        <>
                          {podeAprovarPagamento && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white gap-1"
                              onClick={() =>
                                setAprovandoPagamentoFechamento({ fechamento: f, pls })
                              }
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Aprovar Pagamento
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setDesfazendoId(f.id)}
                          >
                            <Undo2 className="w-4 h-4 mr-1" />
                            Desfazer Fechamento
                          </Button>
                        </>
                      )}
                      {f.status === "Pago" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-orange-600 border-orange-200 hover:bg-orange-50"
                            onClick={() => setDesfazendoPagamentoId(f.id)}
                          >
                            <Undo2 className="w-4 h-4 mr-1" />
                            Desfazer Pagamento
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-700 border-green-300 hover:bg-green-50"
                            onClick={() => handleImprimirPlanilha(f, pls)}
                          >
                            <FileSpreadsheet className="w-4 h-4 mr-1" />
                            Planilha
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-purple-600 border-purple-200 hover:bg-purple-50"
                            onClick={() => handleImprimirComComprovantes(f, pls)}
                            disabled={gerandoPDFId === f.id}
                          >
                            {gerandoPDFId === f.id ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <FileText className="w-4 h-4 mr-1" />
                            )}
                            PDF com Comprovantes
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {aprovandoPagamentoFechamento && (
        <FechamentoCaixaModal
          open={!!aprovandoPagamentoFechamento}
          onOpenChange={(v) => {
            if (!v) setAprovandoPagamentoFechamento(null);
          }}
          fechamento={aprovandoPagamentoFechamento.fechamento}
          itens={aprovandoPagamentoFechamento.pls}
          empresaId={empresaId}
          usuarioEmail={usuarioEmail}
          usuarioNome={usuarioNome}
          onSucesso={() => {
            setAprovandoPagamentoFechamento(null);
            setPreLancamentosCache({});
            carregar();
            if (onReload) onReload();
          }}
        />
      )}

      {conciliarPL && (
        <ReconciliacaoComDespesaModal
          open={!!conciliarPL}
          onOpenChange={(v) => {
            if (!v) setConciliarPL(null);
          }}
          preLancamento={conciliarPL}
          onReconciliado={() => {
            setConciliarPL(null);
            setPreLancamentosCache({});
            carregar();
            if (onReload) onReload();
          }}
        />
      )}

      {desfazendoId && (
        <ModalDesfazerFechamento
          fechamento={fechamentos.find((f) => f.id === desfazendoId)}
          onClose={() => setDesfazendoId(null)}
          onSucesso={() => {
            setDesfazendoId(null);
            carregar();
            if (onReload) onReload();
          }}
        />
      )}

      {desfazendoPagamentoId && (
        <ModalDesfazerPagamento
          fechamento={fechamentos.find((f) => f.id === desfazendoPagamentoId)}
          onClose={() => setDesfazendoPagamentoId(null)}
          onSucesso={() => {
            setDesfazendoPagamentoId(null);
            setPreLancamentosCache({});
            carregar();
            if (onReload) onReload();
          }}
        />
      )}

      {acrescentandoEmFechamento && (
        <AcrescentarPreLancamentoModal
          open={!!acrescentandoEmFechamento}
          onOpenChange={(v) => {
            if (!v) setAcrescentandoEmFechamento(null);
          }}
          fechamento={acrescentandoEmFechamento}
          empresaId={empresaId}
          onSucesso={() => {
            setAcrescentandoEmFechamento(null);
            setPreLancamentosCache({});
            carregar();
            if (onReload) onReload();
          }}
        />
      )}

      {desfazendoConciliacaoPL && (
        <DesfazerConciliacaoModal
          open={!!desfazendoConciliacaoPL}
          onOpenChange={(v) => {
            if (!v) setDesfazendoConciliacaoPL(null);
          }}
          preLancamento={desfazendoConciliacaoPL}
          transacao={
            desfazendoConciliacaoPL.transacao_id
              ? { id: desfazendoConciliacaoPL.transacao_id }
              : null
          }
          onSucesso={() => {
            setDesfazendoConciliacaoPL(null);
            setPreLancamentosCache({});
            carregar();
            if (onReload) onReload();
          }}
        />
      )}
    </div>
  );
}

// ===== MODAL DESFAZER PAGAMENTO (reverter Pago → Aguardando Pagamento) =====
function ModalDesfazerPagamento({ fechamento, onClose, onSucesso }) {
  const [desfazendo, setDesfazendo] = useState(false);

  const handleDesfazer = async () => {
    setDesfazendo(true);
    try {
      // Buscar e deletar transações financeiras vinculadas aos pré-lançamentos deste fechamento
      const ids = JSON.parse(fechamento.pre_lancamentos_ids || "[]");
      const pls = await Promise.all(
        ids.map((id) =>
          sigo.entities.PreLancamento.filter({ id })
            .then((r) => r[0])
            .catch(() => null)
        )
      );
      const plsFiltrados = pls.filter(Boolean);

      // Deletar transações e reverter pré-lançamentos para "Em Fechamento"
      for (const pl of plsFiltrados) {
        if (pl.transacao_id) {
          try {
            const anexos = await sigo.entities.TransacaoAnexo.filter({
              transacao_id: pl.transacao_id,
            });
            await Promise.all(anexos.map((a) => sigo.entities.TransacaoAnexo.delete(a.id)));
          } catch (err) {
            console.warn(
              "[HistoricoFechamentos] falha apagando anexos da transacao",
              pl.transacao_id,
              err
            );
          }
          try {
            await sigo.entities.TransacaoFinanceira.delete(pl.transacao_id);
          } catch (err) {
            console.warn("[HistoricoFechamentos] falha apagando transacao", pl.transacao_id, err);
          }
        }
        await sigo.entities.PreLancamento.update(pl.id, {
          status: "Em Fechamento",
          transacao_id: null,
        });
      }

      // Deletar também a transação de reposição (Receita) gerada no pagamento
      // Buscar pela descrição do fechamento
      try {
        const transacoesReposicao = await sigo.entities.TransacaoFinanceira.filter({
          empresa_id: fechamento.empresa_id,
          tipo: "Receita",
        });
        const reposicao = transacoesReposicao.find((t) =>
          t.descricao?.includes(`Fechamento #${fechamento.numero}`)
        );
        if (reposicao) await sigo.entities.TransacaoFinanceira.delete(reposicao.id);
      } catch (err) {
        console.warn("[HistoricoFechamentos] falha buscando/apagando transacao de reposicao:", err);
      }

      // Reverter fechamento para "Aguardando Pagamento"
      await sigo.entities.FechamentoCaixa.update(fechamento.id, {
        status: "Aguardando Pagamento",
        usuario_pagamento_email: null,
        usuario_pagamento_nome: null,
        data_pagamento: null,
        observacoes_pagamento: null,
        comprovante_pagamento_url: null,
      });

      onSucesso();
    } catch (err) {
      alert("Erro ao desfazer pagamento: " + err.message);
    } finally {
      setDesfazendo(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-700">
            <Undo2 className="w-5 h-5" />
            Desfazer Pagamento
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Deseja desfazer o pagamento do fechamento #{fechamento.numero}? As transações
            financeiras geradas serão removidas e os pré-lançamentos voltarão para{" "}
            <strong>Em Fechamento</strong>.
          </p>
          <div className="bg-orange-50 border border-orange-200 rounded p-3 text-sm text-orange-800">
            ⚠️ Esta ação irá deletar todas as despesas e a receita de reposição geradas neste
            pagamento.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={desfazendo} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleDesfazer}
              disabled={desfazendo}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              {desfazendo ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Undo2 className="w-4 h-4 mr-2" />
              )}
              Desfazer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===== MODAL DESFAZER FECHAMENTO =====
function ModalDesfazerFechamento({ fechamento, onClose, onSucesso }) {
  const [desfazendo, setDesfazendo] = useState(false);

  const handleDesfazer = async () => {
    setDesfazendo(true);
    try {
      // Voltar pré-lançamentos para "Pendente"
      const ids = JSON.parse(fechamento.pre_lancamentos_ids || "[]");
      await Promise.all(
        ids.map((id) =>
          sigo.entities.PreLancamento.update(id, { status: "Pendente" }).catch(() => null)
        )
      );
      await sigo.entities.FechamentoCaixa.delete(fechamento.id);
      onSucesso();
    } catch (err) {
      alert("Erro ao desfazer: " + err.message);
    } finally {
      setDesfazendo(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <Undo2 className="w-5 h-5" />
            Desfazer Fechamento
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Deseja desfazer o fechamento #{fechamento.numero}? Os pré-lançamentos voltarão para a
            lista de pendentes.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={desfazendo} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleDesfazer}
              disabled={desfazendo}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {desfazendo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Desfazer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
