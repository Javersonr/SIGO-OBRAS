import React, { useState, useEffect } from "react";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Download,
  FileSpreadsheet,
  ChevronDown,
  Camera,
  MessageSquare,
  FileText,
  Archive,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sigo } from "@/api/sigoClient";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import BarraProgressoImportacao from "./BarraProgressoImportacao";
import NovoPreLancamentoModal from "./NovoPreLancamentoModal";
import GerenciadorPreLancamentosOffline from "./GerenciadorPreLancamentosOffline";
import PreLancamentosAReconciliar from "./PreLancamentosAReconciliar";
import HistoricoFechamentosCaixa from "./HistoricoFechamentosCaixa";
import { useOfflineSync } from "./hooks/useOfflineSync";

export default function PreLancamentosTab({
  empresaAtiva,
  contas = [],
  categorias = [],
  onReload = () => {},
  usuarioEmail,
  usuarioNome,
  verTodos,
  verProprios,
  podeAprovar,
  podePagar,
}) {
  const [importacao, setImportacao] = useState({
    ativo: false,
    total: 0,
    processados: 0,
    erros: 0,
  });
  const [mostrarNovoPreLancamento, setMostrarNovoPreLancamento] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    sigo.entities.UsuarioEmpresa.filter({ empresa_id: empresaAtiva.id, ativo: true })
      .then((users) => setUsuarios(users || []))
      .catch((err) => {
        console.warn("[PreLancamentosTab] falha carregando usuarios:", err);
        setUsuarios([]);
      });
  }, [empresaAtiva?.id]);

  const { online, itemsPendentes, sincronizando, marcarSincronizado, deletarOffline } =
    useOfflineSync();

  const handleSincronizar = async (itens) => {
    const response = await sigo.functions.invoke("sincronizarPreLancamentosOffline", {
      itensOffline: itens,
    });
    if (response.data.sucesso) {
      for (const item of response.data.detalhes.sucesso) {
        await marcarSincronizado(item.idLocal);
      }
      setReloadTrigger((prev) => prev + 1);
    }
  };

  const handleExportarExcel = async () => {
    if (!XLSX) return;
    setExportando(true);
    try {
      const filtro = { empresa_id: empresaAtiva.id, status: "Pendente" };
      if (!verTodos && usuarioEmail) filtro.usuario_email = usuarioEmail;
      const todos = await sigo.entities.PreLancamento.filter(filtro);
      if (todos.length === 0) {
        alert("Nenhum pré-lançamento encontrado");
        return;
      }
      const dados = todos.map((p) => {
        const d = safeParseJSON(p.dados_extraidos, {});
        return {
          Fornecedor: d.fornecedor || "",
          Descrição: d.descricao || "",
          "Valor (R$)": parseFloat(d.valor) || 0,
          Data: d.data || "",
          Projeto: p.projeto_nome || "",
          Status: p.status || "",
          Usuário: p.usuario_email || "",
          Comprovante: p.comprovante_url || "",
        };
      });
      const ws = XLSX.utils.json_to_sheet(dados);
      ws["!cols"] = [
        { wch: 25 },
        { wch: 35 },
        { wch: 14 },
        { wch: 14 },
        { wch: 20 },
        { wch: 12 },
        { wch: 30 },
        { wch: 50 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pré-Lançamentos");
      XLSX.writeFile(
        wb,
        `Pre_Lancamentos_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`
      );
    } catch (e) {
      alert("Erro ao exportar: " + e.message);
    } finally {
      setExportando(false);
    }
  };

  const handleExportarPDF = async () => {
    setExportando(true);
    try {
      const filtro = { empresa_id: empresaAtiva.id, status: "Pendente" };
      if (!verTodos && usuarioEmail) filtro.usuario_email = usuarioEmail;
      const todos = await sigo.entities.PreLancamento.filter(filtro);
      if (todos.length === 0) {
        alert("Nenhum pré-lançamento encontrado");
        return;
      }

      const totalValor = todos.reduce((s, p) => {
        const d = safeParseJSON(p.dados_extraidos, {});
        return s + (parseFloat(d.valor) || 0);
      }, 0);

      const linhas = todos
        .map((p, i) => {
          const d = safeParseJSON(p.dados_extraidos, {});
          const valor = parseFloat(d.valor) || 0;
          return `<tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"}">
          <td>${i + 1}</td><td>${d.fornecedor || "-"}</td><td>${d.descricao || "-"}</td>
          <td>${p.projeto_nome || "-"}</td>
          <td style="text-align:right;font-weight:600;color:#dc2626;">R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
          <td style="color:${p.status === "Conciliado" ? "#16a34a" : "#b45309"}">${p.status || "-"}</td>
        </tr>`;
        })
        .join("");

      const conteudo = `<html><head><title>Pré-Lançamentos</title>
        <style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#1e293b;}
        table{width:100%;border-collapse:collapse;margin-bottom:20px;}
        th{background:#1e293b;color:#fff;text-align:left;padding:8px 10px;font-size:10px;}
        td{padding:6px 10px;border-bottom:1px solid #e2e8f0;}
        tfoot td{font-weight:bold;background:#f1f5f9;border-top:2px solid #cbd5e1;}</style>
        </head><body>
        <h1 style="font-size:18px;margin-bottom:4px;">Relatório de Pré-Lançamentos</h1>
        <p style="color:#64748b;font-size:11px;">Gerado em: ${new Date().toLocaleDateString("pt-BR")} | Total: ${todos.length} pré-lançamentos</p>
        <table><thead><tr><th>#</th><th>Fornecedor</th><th>Descrição</th><th>Projeto</th><th>Valor</th><th>Status</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td colspan="4">Total: ${todos.length} pré-lançamentos</td>
          <td style="text-align:right">R$ ${totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td></td></tr></tfoot>
        </table></body></html>`;

      const w = window.open("", "_blank");
      w.document.write(conteudo);
      w.document.close();
      setTimeout(() => w.print(), 1500);
    } catch (e) {
      alert("Erro ao exportar: " + e.message);
    } finally {
      setExportando(false);
    }
  };

  const handleExportarComprovantesZip = async () => {
    setExportando(true);
    try {
      const filtro = { empresa_id: empresaAtiva.id };
      if (!verTodos && usuarioEmail) filtro.usuario_email = usuarioEmail;
      const todos = await sigo.entities.PreLancamento.filter(filtro);
      const comComprovante = todos.filter((p) => p.comprovante_url);

      if (comComprovante.length === 0) {
        alert("Nenhum pré-lançamento com comprovante encontrado");
        return;
      }

      const zip = new JSZip();
      let baixados = 0;

      for (let i = 0; i < comComprovante.length; i++) {
        const p = comComprovante[i];
        try {
          const resp = await fetch(p.comprovante_url);
          if (!resp.ok) continue;
          const blob = await resp.blob();
          const ext = p.comprovante_url.split("?")[0].split(".").pop() || "jpg";
          const d = safeParseJSON(p.dados_extraidos, {});
          const nomeArq = `${String(i + 1).padStart(3, "0")}_${(d.fornecedor || "sem_fornecedor").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30)}_${(d.data || "").replace(/-/g, "")}.${ext}`;
          zip.file(nomeArq, blob);
          baixados++;
        } catch (err) {
          console.warn("[PreLancamentosTab] falha baixando comprovante:", err);
        }
      }

      if (baixados === 0) {
        alert("Não foi possível baixar nenhum comprovante");
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Comprovantes_PreLancamentos_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      alert(`${baixados} comprovante(s) exportados com sucesso!`);
    } catch (e) {
      alert("Erro ao exportar comprovantes: " + e.message);
    } finally {
      setExportando(false);
    }
  };

  const handleBaixarModelo = () => {
    if (!XLSX) return;
    const dados = [
      {
        "Data Competência": "2026-01-07",
        "Data Vencimento": "2026-01-15",
        Descrição: "Descrição do pré-lançamento",
        Tipo: "Receita ou Despesa",
        Fornecedor: "Nome do Fornecedor (opcional)",
        Cliente: "Nome do Cliente (opcional)",
        Categoria: "Nome da Categoria",
        Conta: "Nome da Conta",
        Projeto: "Título do Projeto (opcional)",
        "Centro de Custo": "Nome do Centro de Custo (opcional)",
        Valor: 1000.0,
        Observações: "Observações adicionais",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "Modelo_Importacao_PreLancamentos.xlsx");
  };

  const handleImportarExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        setImportacao({ ativo: true, total: data.length, processados: 0, erros: 0 });

        const [todosFornecedores, todosClientes, todosProjetos, todasCategorias, todasContas] =
          await Promise.all([
            sigo.entities.Fornecedor.filter({ empresa_id: empresaAtiva.id }),
            sigo.entities.Cliente.filter({ empresa_id: empresaAtiva.id }),
            sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id }),
            sigo.entities.CategoriaFinanceira.filter({ empresa_id: empresaAtiva.id }),
            sigo.entities.ContaFinanceira.filter({ empresa_id: empresaAtiva.id }),
          ]);

        let importadas = 0,
          erros = 0;
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          try {
            const conta = todasContas.find((c) => c.nome === row.Conta);
            if (!conta) {
              erros++;
              setImportacao((prev) => ({ ...prev, processados: i + 1, erros: prev.erros + 1 }));
              continue;
            }
            await sigo.entities.TransacaoFinanceira.create({
              empresa_id: empresaAtiva.id,
              tipo: row["Tipo"]?.toLowerCase() === "receita" ? "receita" : "despesa",
              status: "pre_lancamento",
              descricao: row["Descrição"] || "",
              fornecedor_id:
                todosFornecedores.find((f) => f.nome_razao === row.Fornecedor)?.id || null,
              fornecedor_nome:
                todosFornecedores.find((f) => f.nome_razao === row.Fornecedor)?.nome_razao || null,
              cliente_id: todosClientes.find((c) => c.nome_razao === row.Cliente)?.id || null,
              cliente_nome:
                todosClientes.find((c) => c.nome_razao === row.Cliente)?.nome_razao || null,
              projeto_id: todosProjetos.find((p) => p.titulo === row.Projeto)?.id || null,
              projeto_nome: todosProjetos.find((p) => p.titulo === row.Projeto)?.titulo || null,
              categoria_id: todasCategorias.find((c) => c.nome === row.Categoria)?.id || null,
              categoria_nome: todasCategorias.find((c) => c.nome === row.Categoria)?.nome || null,
              conta_id: conta.id,
              conta_nome: conta.nome,
              centro_custo: row["Centro de Custo"] || null,
              valor: parseFloat(row.Valor) || 0,
              data_vencimento: row["Data Vencimento"] || new Date().toISOString().split("T")[0],
              data: row["Data Competência"] || new Date().toISOString().split("T")[0],
              observacoes: row["Observações"] || null,
            });
            importadas++;
            setImportacao((prev) => ({ ...prev, processados: i + 1 }));
          } catch {
            erros++;
            setImportacao((prev) => ({ ...prev, processados: i + 1, erros: prev.erros + 1 }));
          }
        }

        setTimeout(() => {
          setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
          alert(`Importação concluída!\n${importadas} importados, ${erros} erros`);
          onReload();
        }, 500);
      } catch (error) {
        setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
        alert("Erro ao processar arquivo Excel");
      } finally {
        e.target.value = null;
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-xl font-semibold text-slate-800">Pré-Lançamentos</h2>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Filtro de Usuário unificado */}
          {verTodos && (
            <Select
              value={filtroUsuario || "__all__"}
              onValueChange={(v) => setFiltroUsuario(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="h-9 text-sm w-48">
                <SelectValue placeholder="Todos os usuários" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os usuários</SelectItem>
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.usuario_email}>
                    {u.nome_completo || u.usuario_email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            onClick={() => setMostrarNovoPreLancamento(true)}
            className="bg-amber-600 hover:bg-amber-700 gap-2"
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">Novo (Câmera)</span>
            <span className="sm:hidden">Câmera</span>
          </Button>

          <a
            href={sigo.agents.getWhatsAppConnectURL("prelancamentos_whatsapp")}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              className="gap-2 border-green-500 text-green-600 hover:bg-green-50"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </Button>
          </a>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                Ações <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={handleExportarExcel} disabled={exportando}>
                <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
                {exportando ? "Exportando..." : "Exportar para Excel"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportarPDF} disabled={exportando}>
                <FileText className="w-4 h-4 mr-2 text-red-500" />
                {exportando ? "Exportando..." : "Exportar para PDF"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportarComprovantesZip} disabled={exportando}>
                <Archive className="w-4 h-4 mr-2 text-purple-600" />
                {exportando ? "Exportando..." : "Exportar Comprovantes (ZIP)"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleBaixarModelo}>
                <Download className="w-4 h-4 mr-2" />
                Baixar Modelo Excel
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => document.getElementById("importar-excel-pre").click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Importar Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            type="file"
            id="importar-excel-pre"
            accept=".xlsx,.xls"
            onChange={handleImportarExcel}
            className="hidden"
          />
        </div>
      </div>

      {/* Barra de Progresso */}
      <BarraProgressoImportacao
        ativo={importacao.ativo}
        total={importacao.total}
        processados={importacao.processados}
        erros={importacao.erros}
        titulo="Importando pré-lançamentos..."
      />

      {/* Gerenciador de Offline */}
      <GerenciadorPreLancamentosOffline
        itemsPendentes={itemsPendentes}
        online={online}
        sincronizando={sincronizando}
        onSincronizar={handleSincronizar}
        onDeletar={deletarOffline}
      />

      {/* Pré-Lançamentos (seleção + botão fechar caixa embutido) */}
      <PreLancamentosAReconciliar
        empresaId={empresaAtiva.id}
        usuarioEmail={usuarioEmail}
        usuarioNome={usuarioNome}
        verTodos={verTodos}
        verProprios={verProprios}
        contas={contas}
        categorias={categorias}
        filtroUsuario={filtroUsuario}
        podeAprovar={podeAprovar || verTodos}
        onReload={() => {
          setReloadTrigger((prev) => prev + 1);
          onReload();
        }}
        key={`reconciliar-${reloadTrigger}`}
      />

      {/* Histórico de Fechamentos */}
      <HistoricoFechamentosCaixa
        empresaId={empresaAtiva.id}
        usuarioEmail={usuarioEmail}
        usuarioNome={usuarioNome}
        podeAprovarPagamento={podePagar}
        onReload={() => {
          setReloadTrigger((prev) => prev + 1);
          onReload();
        }}
        key={`fechamentos-${reloadTrigger}`}
      />

      {/* Modal Novo Pré-Lançamento */}
      <NovoPreLancamentoModal
        open={mostrarNovoPreLancamento}
        onOpenChange={setMostrarNovoPreLancamento}
        empresaId={empresaAtiva.id}
        usuarioEmail={usuarioEmail}
        verTodos={verTodos}
        isAdmin={verTodos}
        onSucesso={() => {
          setReloadTrigger((prev) => prev + 1);
          onReload();
        }}
      />
    </div>
  );
}
