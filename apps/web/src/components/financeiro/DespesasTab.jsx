import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Edit,
  Trash2,
  Upload,
  Download,
  FileSpreadsheet,
  ChevronDown,
  CheckCircle2,
  MoreVertical,
  FileText,
  Paperclip,
  Eye,
  Link2Off,
  Copy,
  Settings,
  Link2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sigo, supabase } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";

import FiltroRapido from "./FiltroRapido";
import CardsResumo from "./CardsResumo";
import BarraProgressoImportacao from "./BarraProgressoImportacao";
import DetalheDespesaModal from "./DetalheDespesaModal";
import { parseData, parseValor, formatCurrency } from "./utils";
import SortableTableHeader from "../shared/SortableTableHeader";
import DespesaModal from "./DespesaModal";

export default function DespesasTab({
  empresaAtiva,
  transacoes: transacoesIniciais,
  contas,
  categorias,
  projetos,
  fornecedores,
  onReload,
  filtroProjetoInicial,
  ocultarFiltrosProjeto,
  transacaoIdInicial,
  transacaoIdRef,
  transacaoKey,
  onTransacaoInicialConsumed,
}) {
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [despesaDetalhes, setDespesaDetalhes] = useState(null);
  const [anexosDetalhes, setAnexosDetalhes] = useState([]);
  const [sortConfig, setSortConfig] = useState({ field: "data_vencimento", direction: "desc" });
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [oportunidades, setOportunidades] = useState([]);
  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [ultimoItemClicado, setUltimoItemClicado] = useState(null);
  const [importacao, setImportacao] = useState({
    ativo: false,
    total: 0,
    processados: 0,
    erros: 0,
  });
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 50;

  const [filtros, setFiltros] = useState({
    busca: "",
    status: "all",
    periodo: "mes",
    categoriaId: "all",
    projetoId: filtroProjetoInicial || "all",
    contaId: "all",
  });

  // Colunas visíveis - carregar do localStorage
  const colunasDisponiveis = [
    { id: "data", label: "Data Competência" },
    { id: "vencimento", label: "Data Vencimento" },
    { id: "pagamento", label: "Data Pagamento" },
    { id: "descricao", label: "Descrição" },
    { id: "fornecedor", label: "Fornecedor" },
    { id: "categoria", label: "Categoria" },
    { id: "conta", label: "Conta" },
    { id: "projeto", label: "Projeto" },
    { id: "centro_custo", label: "Centro de Custo" },
    { id: "valor", label: "Valor" },
    { id: "status", label: "Status" },
    { id: "forma_pagamento", label: "Forma Pagamento" },
  ];

  const [colunasVisiveis, setColunasVisiveis] = useState(() => {
    const saved = localStorage.getItem("despesas_colunas_visiveis");
    if (saved) {
      return safeParseJSON(
        saved,
        colunasDisponiveis.map((c) => c.id)
      );
    }
    return colunasDisponiveis.map((c) => c.id); // Todas visíveis por padrão
  });

  const toggleColuna = (colunaId) => {
    setColunasVisiveis((prev) => {
      const novas = prev.includes(colunaId)
        ? prev.filter((id) => id !== colunaId)
        : [...prev, colunaId];
      localStorage.setItem("despesas_colunas_visiveis", JSON.stringify(novas));
      return novas;
    });
  };
  const [numeroParcelas, setNumeroParcelas] = useState(1);
  const [parcelas, setParcelas] = useState([]);
  const [anexos, setAnexos] = useState([]);
  // Bloqueia clique duplo no toggle de status (criava 2 ExtratoBancario).
  const [togglingIds, setTogglingIds] = useState(() => new Set());

  const [form, setForm] = useState({
    conta_id: contas[0]?.id || "",
    categoria_id: "",
    projeto_id: "",
    oportunidade_id: "",
    fornecedor_id: "",
    fornecedor_nome: "",
    centro_custo_id: "",
    centro_custo_nome: "",
    valor: "",
    data_vencimento: "",
    descricao: "",
    status: "em_aberto",
    forma_pagamento: "",
  });

  useEffect(() => {
    let mounted = true;
    if (empresaAtiva?.id && oportunidades.length === 0) {
      sigo.entities.Oportunidade.filter({ empresa_id: empresaAtiva.id }).then((ops) => {
        if (mounted) setOportunidades(ops);
      });
    }
    return () => {
      mounted = false;
    };
  }, [empresaAtiva?.id]);

  // Abrir automaticamente se vier transacaoIdInicial da URL
  useEffect(() => {
    const tid = transacaoIdRef?.current ?? transacaoIdInicial;
    if (!tid) return;
    const abrirTransacao = async () => {
      let t = transacoesIniciais.find((tr) => tr.id === tid);
      if (!t) {
        const results = await sigo.entities.TransacaoFinanceira.filter({ id: tid });
        t = results[0];
      }
      if (t && (t.tipo || "").toLowerCase() === "despesa") {
        await handleVerDetalhes(t);
      }
      onTransacaoInicialConsumed?.();
    };
    abrirTransacao();
  }, [transacaoKey]);

  const gerarParcelas = (numParcelas, valorTotal, dataVencimento) => {
    if (!valorTotal || !dataVencimento || numParcelas <= 1) {
      setParcelas([]);
      return;
    }

    const valorParcela = parseFloat(valorTotal) / numParcelas;
    const novasParcelas = [];

    for (let i = 0; i < numParcelas; i++) {
      const data = new Date(dataVencimento);
      data.setMonth(data.getMonth() + i);

      novasParcelas.push({
        numero: i + 1,
        valor: parseFloat(valorParcela.toFixed(2)),
        data_vencimento: data.toISOString().split("T")[0],
        data_pagamento: null,
        status: "em_aberto",
      });
    }

    setParcelas(novasParcelas);
  };

  const handleNumeroParcelasChange = (num) => {
    const numParcelas = parseInt(num) || 1;
    setNumeroParcelas(numParcelas);

    if (numParcelas > 1 && form.valor && form.data_vencimento) {
      gerarParcelas(numParcelas, parseFloat(form.valor), form.data_vencimento);
    } else {
      setParcelas([]);
    }
  };

  const handleAnexoUpload = async (e) => {
    const files = Array.from(e.target.files);
    const novosAnexos = [];

    for (const file of files) {
      const { file_url } = await sigo.integrations.Core.UploadFile({ file });
      novosAnexos.push({
        nome: file.name,
        url: file_url,
        tipo: file.type,
      });
    }

    setAnexos([...anexos, ...novosAnexos]);
  };

  const handleRemoverAnexo = (index) => {
    setAnexos(anexos.filter((_, i) => i !== index));
  };

  const handleExportarExcel = async () => {
    const despesasExportar = transacoesIniciais.filter(
      (t) => (t.tipo || "").toLowerCase() === "despesa"
    );
    setImportacao({ ativo: true, total: despesasExportar.length, processados: 0, erros: 0 });

    const headers = [
      "Data Competência",
      "Data Vencimento",
      "Data Pagamento",
      "Descrição",
      "Fornecedor",
      "Categoria",
      "Conta",
      "Projeto",
      "Centro de Custo",
      "Valor",
      "Status",
      "Forma Pagamento",
      "Observações",
    ];
    const rows = despesasExportar.map((t, index) => {
      setImportacao((prev) => ({ ...prev, processados: index + 1 }));
      return [
        t.data || t.created_date || "",
        t.data_vencimento || "",
        t.data_pagamento || "",
        t.descricao || "",
        t.fornecedor_nome || "",
        t.categoria_nome || "",
        t.conta_nome || "",
        t.projeto_nome || "",
        t.centro_custo || "",
        t.valor || 0,
        t.status === "pago" ? "Pago" : t.status === "em_aberto" ? "Pendente" : "Atrasado",
        t.forma_pagamento || "",
        t.observacoes || "",
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Despesas_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    setTimeout(() => {
      setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
    }, 500);
  };

  const handleBaixarModelo = async () => {
    const headers = [
      "Data Competência",
      "Data Vencimento",
      "Data Pagamento",
      "Descrição",
      "Fornecedor",
      "Categoria",
      "Conta",
      "Projeto",
      "Centro de Custo",
      "Valor",
      "Status",
      "Forma Pagamento",
      "Observações",
    ];
    const row = [
      "2026-01-07",
      "2026-01-15",
      "2026-01-15",
      "Descrição da despesa",
      "Nome do Fornecedor",
      "Nome da Categoria",
      "Nome da Conta",
      "Título do Projeto (opcional)",
      "Nome do Centro de Custo (opcional)",
      "1000.00",
      "Pendente ou Pago",
      "PIX, Boleto, etc",
      "Observações adicionais",
    ];

    const csv = [headers, row]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Modelo_Importacao_Despesas.csv";
    link.click();
  };

  const handleImportarXML = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const xmlText = evt.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        // Verificar se é NF-e válida - aceitar diversos formatos
        const nfeNode =
          xmlDoc.getElementsByTagName("NFe")[0] ||
          xmlDoc.getElementsByTagName("nfeProc")[0] ||
          xmlDoc.getElementsByTagName("nfe")[0] ||
          xmlDoc.getElementsByTagNameNS("*", "NFe")[0] ||
          xmlDoc.getElementsByTagNameNS("*", "nfeProc")[0];

        const infNFeNode =
          xmlDoc.getElementsByTagName("infNFe")[0] ||
          xmlDoc.getElementsByTagNameNS("*", "infNFe")[0];

        if (!nfeNode && !infNFeNode) {
          alert(
            "❌ Arquivo XML inválido. Não foi possível identificar como NF-e.\n\nVerifique se o arquivo é uma Nota Fiscal Eletrônica válida."
          );
          return;
        }

        setImportacao({ ativo: true, total: 1, processados: 0, erros: 0 });

        // Extrair dados da NF-e - buscar em múltiplos namespaces
        const getTag = (tagName) => {
          return (
            xmlDoc.getElementsByTagName(tagName)[0] ||
            xmlDoc.getElementsByTagNameNS("*", tagName)[0]
          );
        };

        const infNFe = getTag("infNFe");
        const emit = getTag("emit");
        const total = getTag("total");
        const ICMSTot = getTag("ICMSTot");
        const ide = getTag("ide");

        const fornecedorNome =
          emit?.getElementsByTagName("xNome")[0]?.textContent ||
          emit?.getElementsByTagNameNS("*", "xNome")[0]?.textContent ||
          "Fornecedor Desconhecido";

        const fornecedorCNPJ =
          emit?.getElementsByTagName("CNPJ")[0]?.textContent ||
          emit?.getElementsByTagNameNS("*", "CNPJ")[0]?.textContent ||
          "";

        const dataEmissao = (
          ide?.getElementsByTagName("dhEmi")[0]?.textContent ||
          ide?.getElementsByTagNameNS("*", "dhEmi")[0]?.textContent ||
          ide?.getElementsByTagName("dEmi")[0]?.textContent ||
          ide?.getElementsByTagNameNS("*", "dEmi")[0]?.textContent ||
          new Date().toISOString()
        ).split("T")[0];

        const numeroNFe =
          ide?.getElementsByTagName("nNF")[0]?.textContent ||
          ide?.getElementsByTagNameNS("*", "nNF")[0]?.textContent ||
          "";

        const valorTotal = parseFloat(
          ICMSTot?.getElementsByTagName("vNF")[0]?.textContent ||
            ICMSTot?.getElementsByTagNameNS("*", "vNF")[0]?.textContent ||
            "0"
        );

        // Buscar ou criar fornecedor
        let fornecedores = await sigo.entities.Fornecedor.filter({
          empresa_id: empresaAtiva.id,
          cnpj: fornecedorCNPJ,
        });

        let fornecedor;
        if (fornecedores.length === 0) {
          fornecedor = await sigo.entities.Fornecedor.create({
            empresa_id: empresaAtiva.id,
            nome_razao: fornecedorNome,
            cnpj: fornecedorCNPJ,
            tipo_pessoa: "PJ",
          });
        } else {
          fornecedor = fornecedores[0];
        }

        // Criar despesa
        const despesaData = {
          empresa_id: empresaAtiva.id,
          tipo: "Despesa",
          conta_id: contas[0]?.id,
          conta_nome: contas[0]?.nome,
          fornecedor_id: fornecedor.id,
          fornecedor_nome: fornecedor.nome_razao,
          valor: valorTotal,
          data: dataEmissao,
          data_vencimento: dataEmissao,
          descricao: `NF-e ${numeroNFe} - ${fornecedorNome}`,
          status: "em_aberto",
          observacoes: `Importado de XML - NF-e ${numeroNFe}`,
        };

        await sigo.entities.TransacaoFinanceira.create(despesaData);

        setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
        alert(
          `✅ NF-e importada com sucesso!\n\nFornecedor: ${fornecedorNome}\nValor: ${formatCurrency(valorTotal)}`
        );
        onReload();
      } catch {
        setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
        alert("❌ Erro ao processar arquivo XML. Verifique se é uma NF-e válida.");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleImportarExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        let text = evt.target.result;
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

        const firstLine = text.split(/\r?\n/)[0] || "";
        const totalTabFirst = (firstLine.match(/\t/g) || []).length;
        const totalSemiFirst = (firstLine.match(/;/g) || []).length;
        const totalCommaFirst = (firstLine.match(/,/g) || []).length;
        const sep =
          totalTabFirst > 0 && totalTabFirst >= totalSemiFirst && totalTabFirst >= totalCommaFirst
            ? "\t"
            : totalSemiFirst > 0
              ? ";"
              : ",";

        const parseCSVFull = (rawText, separator) => {
          const rows = [];
          let cur = "";
          let inQ = false;
          for (let i = 0; i < rawText.length; i++) {
            const c = rawText[i];
            const next = rawText[i + 1];
            if (c === '"') {
              if (inQ && next === '"') {
                cur += '"';
                i++;
              } else {
                inQ = !inQ;
              }
            } else if ((c === "\r" && next === "\n") || c === "\n") {
              if (inQ) {
                cur += "\n";
                if (c === "\r") i++;
              } else {
                if (c === "\r") i++;
                rows.push(cur);
                cur = "";
              }
            } else {
              cur += c;
            }
          }
          if (cur.trim()) rows.push(cur);

          return rows.map((row) => {
            const vals = [];
            let field = "";
            let inQuote = false;
            for (let k = 0; k < row.length; k++) {
              const ch = row[k];
              if (ch === '"') {
                if (inQuote && row[k + 1] === '"') {
                  field += '"';
                  k++;
                } else {
                  inQuote = !inQuote;
                }
              } else if (ch === separator && !inQuote) {
                vals.push(field.trim());
                field = "";
              } else {
                field += ch;
              }
            }
            vals.push(field.trim());
            return vals;
          });
        };

        const allRows = parseCSVFull(text, sep);
        const headers = allRows[0] || [];
        const data = allRows.slice(1).map((row) => {
          const obj = {};
          headers.forEach((header, idx) => {
            obj[header] = row[idx] || "";
          });
          return obj;
        });

        setImportacao({ ativo: true, total: data.length, processados: 0, erros: 0 });

        // PRÉ-CARREGAR TODOS OS DADOS
        const [todosFornecedores, todosProjetos, todasCategorias, todasContas] = await Promise.all([
          sigo.entities.Fornecedor.filter({ empresa_id: empresaAtiva.id }),
          sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id }),
          sigo.entities.CategoriaFinanceira.filter({
            empresa_id: empresaAtiva.id,
            tipo: "Despesa",
          }),
          sigo.entities.ContaFinanceira.filter({ empresa_id: empresaAtiva.id }),
        ]);

        // Criar mapas para busca rápida
        const fornecedoresMap = new Map(todosFornecedores.map((f) => [f.nome_razao, f]));
        const projetosMap = new Map(todosProjetos.map((p) => [p.nome, p]));
        const categoriasMap = new Map(todasCategorias.map((c) => [c.nome, c]));
        const contasMap = new Map(todasContas.map((c) => [c.nome, c]));

        // Carregar apenas as últimas 1000 transações para verificar duplicidade (otimização)
        const transacoesExistentes = await sigo.entities.TransacaoFinanceira.filter(
          {
            empresa_id: empresaAtiva.id,
            tipo: "despesa",
          },
          "-created_date",
          1000
        );

        // Criar Set de chaves únicas para verificação rápida
        const chavesExistentes = new Set(
          transacoesExistentes.map((t) => `${t.descricao}|${t.valor}|${t.data_vencimento}`)
        );

        let importadas = 0;
        let erros = 0;
        let duplicadas = 0;
        const transacoesParaCriar = [];
        const novosRegistros = { fornecedores: [], projetos: [], categorias: [], contas: [] };
        const errosDetalhados = [];

        // PROCESSAR DADOS E PREPARAR CRIAÇÕES
        for (let index = 0; index < data.length; index++) {
          const row = data[index];

          try {
            // Buscar ou preparar Fornecedor
            let fornecedor = null;
            if (row.Fornecedor) {
              fornecedor = fornecedoresMap.get(row.Fornecedor);
              if (!fornecedor) {
                fornecedor = {
                  nome_razao: row.Fornecedor,
                  empresa_id: empresaAtiva.id,
                  tipo_pessoa: "PJ",
                };
                novosRegistros.fornecedores.push(fornecedor);
                fornecedoresMap.set(row.Fornecedor, fornecedor);
              }
            }

            // Buscar ou preparar Projeto
            let projeto = null;
            if (row.Projeto) {
              projeto = projetosMap.get(row.Projeto);
              if (!projeto) {
                projeto = {
                  nome: row.Projeto,
                  empresa_id: empresaAtiva.id,
                };
                novosRegistros.projetos.push(projeto);
                projetosMap.set(row.Projeto, projeto);
              }
            }

            // Buscar ou preparar Categoria
            let categoria = null;
            if (row.Categoria) {
              categoria = categoriasMap.get(row.Categoria);
              if (!categoria) {
                categoria = { nome: row.Categoria, empresa_id: empresaAtiva.id, tipo: "Despesa" };
                novosRegistros.categorias.push(categoria);
                categoriasMap.set(row.Categoria, categoria);
              }
            }

            // Buscar ou preparar Conta
            let conta = null;
            if (row.Conta) {
              conta = contasMap.get(row.Conta);
              if (!conta) {
                conta = { nome: row.Conta, empresa_id: empresaAtiva.id, tipo: "Corrente" };
                novosRegistros.contas.push(conta);
                contasMap.set(row.Conta, conta);
              }
            }

            if (!conta) {
              const erro = `Linha ${index + 2}: Nenhuma conta informada`;
              errosDetalhados.push(erro);
              erros++;
              setImportacao((prev) => ({ ...prev, processados: index + 1, erros: prev.erros + 1 }));
              continue;
            }

            const status =
              row.Status === "Pago" ? "pago" : row.Status === "Atrasado" ? "atrasado" : "em_aberto";
            const dataVencimento = parseData(row["Data Vencimento"]);
            const dataCompetencia = parseData(row["Data Competência"]);
            const dataPagamento = row["Data Pagamento"] ? parseData(row["Data Pagamento"]) : null;
            const valorParsed = parseValor(row.Valor);

            // Verificar duplicidade
            const chaveUnica = `${row["Descrição"]}|${valorParsed}|${dataVencimento}`;
            if (chavesExistentes.has(chaveUnica)) {
              duplicadas++;
              setImportacao((prev) => ({ ...prev, processados: index + 1 }));
              continue;
            }

            transacoesParaCriar.push({
              empresa_id: empresaAtiva.id,
              tipo: "Despesa",
              descricao: row["Descrição"] || "",
              fornecedor_nome: row.Fornecedor || null,
              projeto_nome: row.Projeto || null,
              categoria_nome: row.Categoria || null,
              conta_nome: row.Conta,
              centro_custo: row["Centro de Custo"] || null,
              valor: valorParsed,
              data_vencimento: dataVencimento,
              data_pagamento: dataPagamento,
              data: dataCompetencia,
              status: status,
              forma_pagamento: row["Forma Pagamento"] || null,
              observacoes: row["Observações"] || null,
            });

            setImportacao((prev) => ({ ...prev, processados: index + 1 }));
          } catch (err) {
            const erro = `Linha ${index + 2}: ${err?.message || "Erro desconhecido"}`;
            errosDetalhados.push(erro);
            erros++;
            setImportacao((prev) => ({ ...prev, processados: index + 1, erros: prev.erros + 1 }));
          }
        }

        // CRIAR NOVOS REGISTROS EM LOTE
        if (novosRegistros.fornecedores.length > 0) {
          const criados = await sigo.entities.Fornecedor.bulkCreate(novosRegistros.fornecedores);
          criados.forEach((f) => fornecedoresMap.set(f.nome_razao, f));
        }
        if (novosRegistros.projetos.length > 0) {
          const criados = await sigo.entities.Projeto.bulkCreate(novosRegistros.projetos);
          criados.forEach((p) => projetosMap.set(p.nome, p));
        }
        if (novosRegistros.categorias.length > 0) {
          const criados = await sigo.entities.CategoriaFinanceira.bulkCreate(
            novosRegistros.categorias
          );
          criados.forEach((c) => categoriasMap.set(c.nome, c));
        }
        if (novosRegistros.contas.length > 0) {
          const criados = await sigo.entities.ContaFinanceira.bulkCreate(novosRegistros.contas);
          criados.forEach((c) => contasMap.set(c.nome, c));
        }

        // ATUALIZAR IDs nas transações
        transacoesParaCriar.forEach((t) => {
          if (t.fornecedor_nome)
            t.fornecedor_id = fornecedoresMap.get(t.fornecedor_nome)?.id || null;
          if (t.projeto_nome) t.projeto_id = projetosMap.get(t.projeto_nome)?.id || null;
          if (t.categoria_nome) t.categoria_id = categoriasMap.get(t.categoria_nome)?.id || null;
          t.conta_id = contasMap.get(t.conta_nome)?.id;
        });

        // CRIAR TRANSAÇÕES EM LOTES DE 50 (reduzido para evitar rate limit)
        const LOTE_SIZE = 50;
        for (let i = 0; i < transacoesParaCriar.length; i += LOTE_SIZE) {
          const lote = transacoesParaCriar.slice(i, i + LOTE_SIZE);

          try {
            await sigo.entities.TransacaoFinanceira.bulkCreate(lote);
            importadas += lote.length;
          } catch (error) {
            // Se for rate limit, aguarda mais tempo e tenta novamente
            if (error.message?.includes("rate limit")) {
              await new Promise((resolve) => setTimeout(resolve, 3000));
              await sigo.entities.TransacaoFinanceira.bulkCreate(lote);
              importadas += lote.length;
            } else {
              throw error;
            }
          }

          // Delay maior entre lotes para evitar rate limit
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        setTimeout(() => {
          setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });

          let mensagem = `✅ Importação concluída!\n\n${importadas} despesas importadas\n${duplicadas} duplicadas ignoradas\n${erros} erros`;

          if (errosDetalhados.length > 0) {
            mensagem += "\n\n❌ Detalhes dos erros:\n" + errosDetalhados.slice(0, 10).join("\n");
            if (errosDetalhados.length > 10) {
              mensagem += `\n... e mais ${errosDetalhados.length - 10} erros`;
            }
          }

          alert(mensagem);
          onReload();
        }, 500);
      } catch {
        setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
        alert("Erro ao processar arquivo Excel");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const aplicarFiltros = (transacoes) => {
    let filtered = transacoes.filter((t) => (t.tipo || "").toLowerCase() === "despesa");

    // Busca
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.descricao?.toLowerCase().includes(busca) ||
          t.fornecedor_nome?.toLowerCase().includes(busca)
      );
    }

    // Status
    if (filtros.status && filtros.status !== "all") {
      filtered = filtered.filter((t) => t.status === filtros.status);
    }

    // Categoria
    if (filtros.categoriaId && filtros.categoriaId !== "all") {
      filtered = filtered.filter((t) => t.categoria_id === filtros.categoriaId);
    }

    // Projeto
    if (filtros.projetoId && filtros.projetoId !== "all") {
      filtered = filtered.filter((t) => t.projeto_id === filtros.projetoId);
    }

    // Período
    if (filtros.periodo && filtros.periodo !== "todos") {
      const hoje = new Date();
      const dataVencimento = (t) => new Date(t.data_vencimento || t.data);

      switch (filtros.periodo) {
        case "hoje":
          filtered = filtered.filter((t) => {
            const d = dataVencimento(t);
            return d.toDateString() === hoje.toDateString();
          });
          break;
        case "semana":
          const inicioSemana = new Date(hoje);
          inicioSemana.setDate(hoje.getDate() - hoje.getDay());
          const fimSemana = new Date(inicioSemana);
          fimSemana.setDate(inicioSemana.getDate() + 6);
          filtered = filtered.filter((t) => {
            const d = dataVencimento(t);
            return d >= inicioSemana && d <= fimSemana;
          });
          break;
        case "mes":
          filtered = filtered.filter((t) => {
            const d = dataVencimento(t);
            return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
          });
          break;
        case "trimestre":
          const mesAtual = hoje.getMonth();
          const trimestreInicio = Math.floor(mesAtual / 3) * 3;
          filtered = filtered.filter((t) => {
            const d = dataVencimento(t);
            const mesItem = d.getMonth();
            return (
              mesItem >= trimestreInicio &&
              mesItem < trimestreInicio + 3 &&
              d.getFullYear() === hoje.getFullYear()
            );
          });
          break;
        case "ano":
          filtered = filtered.filter((t) => {
            const d = dataVencimento(t);
            return d.getFullYear() === hoje.getFullYear();
          });
          break;
      }
    }

    return filtered;
  };

  const despesasFiltradas = useMemo(() => {
    // Ocultar despesas conciliadas via pré-lançamento que ainda não foram aprovadas
    const semConciliadasPendentes = transacoesIniciais.filter((t) => {
      if (t.pre_lancamento_id && t.conciliado && !t.pre_lancamento_aprovado) {
        return false; // ocultar até aprovação
      }
      return true;
    });
    return aplicarFiltros(semConciliadasPendentes);
  }, [transacoesIniciais, filtros]);

  // Paginação
  const totalPaginas = Math.ceil(despesasFiltradas.length / itensPorPagina);
  const indiceInicio = (paginaAtual - 1) * itensPorPagina;
  const indiceFim = indiceInicio + itensPorPagina;

  const despesas = useMemo(() => {
    const sorted = [...despesasFiltradas].sort((a, b) => {
      let aVal, bVal;

      if (
        sortConfig.field === "data" ||
        sortConfig.field === "data_vencimento" ||
        sortConfig.field === "data_pagamento"
      ) {
        aVal = a[sortConfig.field] ? new Date(a[sortConfig.field]).getTime() : 0;
        bVal = b[sortConfig.field] ? new Date(b[sortConfig.field]).getTime() : 0;
      } else if (sortConfig.field === "valor") {
        aVal = a[sortConfig.field] || 0;
        bVal = b[sortConfig.field] || 0;
      } else {
        aVal = (a[sortConfig.field] || "").toString().toLowerCase();
        bVal = (b[sortConfig.field] || "").toString().toLowerCase();
      }

      if (sortConfig.direction === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    // Aplicar paginação
    return sorted.slice(indiceInicio, indiceFim);
  }, [despesasFiltradas, sortConfig, indiceInicio, indiceFim]);

  const handleBaixarEmLote = async () => {
    if (itensSelecionados.length === 0) {
      alert("Selecione pelo menos uma despesa");
      return;
    }

    for (const id of itensSelecionados) {
      await sigo.entities.TransacaoFinanceira.update(id, { status: "pago" });
    }

    setItensSelecionados([]);
    onReload();
  };

  const handleExcluirEmLote = async () => {
    if (itensSelecionados.length === 0) {
      alert("Selecione pelo menos uma despesa");
      return;
    }

    const despesasSelecionadas = despesas.filter((d) => itensSelecionados.includes(d.id));
    const despesasConciliadas = despesasSelecionadas.filter((d) => d.conciliado);

    if (despesasConciliadas.length > 0) {
      alert(
        `❌ ${despesasConciliadas.length} despesa(s) selecionada(s) está(ão) conciliada(s) e não pode(m) ser excluída(s).`
      );
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir ${itensSelecionados.length} despesas?`)) return;

    setImportacao({
      ativo: true,
      total: itensSelecionados.length,
      processados: 0,
      erros: 0,
      tipo: "exclusao",
    });

    let erros = 0;
    for (const id of itensSelecionados) {
      try {
        await sigo.entities.TransacaoFinanceira.delete(id);
      } catch {
        erros++;
      }
      setImportacao((prev) => ({ ...prev, processados: prev.processados + 1, erros }));
    }

    alert(
      `${itensSelecionados.length - erros} despesas excluídas com sucesso.${erros > 0 ? `\n${erros} falharam.` : ""}`
    );
    setItensSelecionados([]);
    setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
    onReload();
  };

  const handleOpen = (item = null) => {
    setSelectedItem(item);

    if (item) {
      setForm({
        conta_id: item.conta_id || "",
        categoria_id: item.categoria_id || "",
        projeto_id: item.projeto_id || filtroProjetoInicial || "",
        oportunidade_id: item.oportunidade_id || "",
        fornecedor_id: item.fornecedor_id || "",
        fornecedor_nome: item.fornecedor_nome || "",
        centro_custo_id: item.centro_custo_id || "",
        centro_custo_nome: item.centro_custo_nome || item.centro_custo || "",
        valor: item.valor?.toString() || "",
        data_competencia: item.data ? item.data : new Date().toLocaleDateString("en-CA"),
        data_vencimento: item.data_vencimento || "",
        data_pagamento: item.data_pagamento || "",
        descricao: item.descricao || "",
        status: item.status || "em_aberto",
        forma_pagamento: item.forma_pagamento || "",
      });

      loadAnexos(item.id);
      // Carregar parcelas se existirem
      if (item.parcelado && item.parcelas) {
        const parcelasCarregadas = safeParseJSON(item.parcelas, null);
        if (Array.isArray(parcelasCarregadas)) {
          setParcelas(parcelasCarregadas);
          setNumeroParcelas(parcelasCarregadas.length);
        } else {
          setNumeroParcelas(1);
          setParcelas([]);
        }
      } else {
        setNumeroParcelas(1);
        setParcelas([]);
      }
    } else {
      setForm({
        conta_id: contas[0]?.id || "",
        categoria_id: "",
        projeto_id: filtroProjetoInicial || "",
        oportunidade_id: "",
        fornecedor_id: "",
        fornecedor_nome: "",
        centro_custo_id: "",
        centro_custo_nome: "",
        valor: "",
        data_competencia: new Date().toLocaleDateString("en-CA"),
        data_vencimento: "",
        data_pagamento: "",
        descricao: "",
        status: "em_aberto",
        forma_pagamento: "",
      });
      setAnexos([]);
      setNumeroParcelas(1);
      setParcelas([]);
      setSelectedItem(null);
    }

    setShowModal(true);
  };

  const loadAnexos = async (transacaoId) => {
    try {
      const anexosDb = await sigo.entities.TransacaoAnexo.filter({
        empresa_id: empresaAtiva.id,
        transacao_id: transacaoId,
      });
      setAnexos(anexosDb.map((a) => ({ id: a.id, nome: a.nome, url: a.url, tipo: a.tipo })));
    } catch {
      setAnexos([]);
    }
  };

  const handleSave = async (extras = {}) => {
    if (!form.valor || !form.data_vencimento || !form.conta_id || !form.descricao) {
      alert(
        "Por favor, preencha todos os campos obrigatórios (Descrição, Valor, Data Vencimento, Conta)."
      );
      return;
    }

    const {
      itensNota = [],
      almoxarifadoId = null,
      chaveNfe = null,
      tipoDespesa = "geral",
    } = extras;

    // Validação dura de duplicidade da chave NFe (caso o modal não tenha
    // bloqueado por algum motivo — defense in depth).
    if (chaveNfe) {
      try {
        const duplicadas = await sigo.entities.TransacaoFinanceira.filter({
          empresa_id: empresaAtiva.id,
          chave_nfe: chaveNfe,
        });
        const outra = duplicadas.find((t) => t.id !== selectedItem?.id);
        if (outra) {
          alert(
            `❌ NFe já lançada (ID ${outra.id}). Não foi possível salvar duplicado.\n\nDescrição existente: ${outra.descricao}`
          );
          return;
        }
      } catch (err) {
        console.warn("Falha ao verificar duplicidade NFe no handleSave:", err);
      }
    }

    const conta = contas.find((c) => c.id === form.conta_id);
    const categoria = categorias.find((c) => c.id === form.categoria_id);
    const projeto = projetos.find((p) => p.id === form.projeto_id);
    const oportunidade = oportunidades.find((o) => o.id === form.oportunidade_id);
    const fornecedor = fornecedores.find((f) => f.id === form.fornecedor_id);

    const dataBase = {
      empresa_id: empresaAtiva.id,
      tipo: "Despesa",
      conta_id: form.conta_id,
      conta_nome: conta?.nome,
      categoria_id: form.categoria_id || null,
      categoria_nome: categoria?.nome || null,
      projeto_id: form.projeto_id || filtroProjetoInicial || null,
      projeto_nome: projeto?.nome || null,
      oportunidade_id: form.oportunidade_id || null,
      oportunidade_nome: oportunidade?.nome || null,
      fornecedor_id: form.fornecedor_id || null,
      fornecedor_nome: form.fornecedor_nome || fornecedor?.nome_razao || null,
      centro_custo_id: form.centro_custo_id || null,
      centro_custo_nome: form.centro_custo_nome || null,
      valor: parseFloat(form.valor) || 0,
      data_vencimento: form.data_vencimento,
      data_pagamento: form.data_pagamento || null,
      data: form.data_competencia || new Date().toLocaleDateString("en-CA"),
      descricao: form.descricao,
      status: form.status,
      forma_pagamento: form.forma_pagamento || null,
      chave_nfe: chaveNfe || null,
    };

    const temParcelamento = numeroParcelas > 1 && parcelas.length > 0;

    // Transação resultante do salvamento, qualquer que seja o cenário.
    // Usada depois pra criar EstoqueMovimento (entrada via NFe).
    let transacaoSalva = null;

    // CENÁRIO 1: Nova despesa com parcelamento
    if (temParcelamento && !selectedItem) {
      // Criar uma única despesa com as parcelas dentro
      const transacao = await sigo.entities.TransacaoFinanceira.create({
        ...dataBase,
        parcelado: true,
        parcelas: JSON.stringify(parcelas),
      });
      transacaoSalva = transacao;

      // Salvar anexos
      for (const anexo of anexos) {
        await sigo.entities.TransacaoAnexo.create({
          empresa_id: empresaAtiva.id,
          transacao_id: transacao.id,
          nome: anexo.nome,
          url: anexo.url,
          tipo: anexo.tipo || "comprovante",
        });
      }

      // Criar um lançamento no extrato para cada parcela
      for (const parcela of parcelas) {
        await sigo.entities.ExtratoBancario.create({
          empresa_id: empresaAtiva.id,
          conta_id: form.conta_id,
          data: parcela.data_vencimento,
          descricao: `${form.descricao} - Parcela ${parcela.numero}/${parcelas.length}`,
          valor: -Math.abs(parseFloat(parcela.valor) || 0),
          tipo: "debito",
          categoria: categoria?.nome || "Despesa",
          conciliado: false,
          transacao_id: transacao.id,
          origem: "manual",
        });
      }
    }
    // CENÁRIO 2: Edição de despesa com parcelamento habilitado
    //
    // Aqui caem 2 subcasos:
    //   2A — selectedItem já era parcelado (parcelado=true e tem parcelas
    //        salvas no banco). Editar dados (descrição, fornecedor) NÃO deve
    //        regravar o extrato: o usuário só tá ajustando metadados.
    //   2B — selectedItem era despesa simples e o usuário acabou de habilitar
    //        parcelamento agora. Aí confirma e reescreve o extrato.
    //
    // Antes não havia distinção: sempre confirmava "transformar em N parcelas"
    // e recriava todos os lançamentos do extrato, inclusive em edição trivial.
    // Resultado: se o delete falhasse no meio (network), ficavam linhas
    // duplicadas. Agora detecta o caso 2A e atualiza in-place sem mexer no
    // extrato, e o 2B usa allSettled pra registrar falhas em vez de mascarar.
    else if (temParcelamento && selectedItem) {
      const jaEraParcelada =
        selectedItem.parcelado === true &&
        Array.isArray(safeParseJSON(selectedItem.parcelas, null));

      if (!jaEraParcelada) {
        // 2B — transformação real: pede confirmação
        if (
          !confirm(
            `Deseja transformar esta despesa de ${formatCurrency(dataBase.valor)} em ${parcelas.length} parcelas?\n\nEsta ação não pode ser desfeita!`
          )
        ) {
          return;
        }
      }

      // Atualiza a despesa em si (sempre)
      await sigo.entities.TransacaoFinanceira.update(selectedItem.id, {
        ...dataBase,
        parcelado: true,
        parcelas: JSON.stringify(parcelas),
      });
      transacaoSalva = { ...selectedItem, ...dataBase, id: selectedItem.id };

      // Carrega o extrato atual da transação
      const lancamentosAntigos = await sigo.entities.ExtratoBancario.filter({
        empresa_id: empresaAtiva.id,
        transacao_id: selectedItem.id,
      });

      // Detecta se a estrutura de parcelas mudou (quantidade, valores ou datas).
      // Se NÃO mudou, só atualizamos a descrição dos lançamentos existentes
      // em paralelo e nem deletamos nada — evita janela de "0 extratos" no
      // meio do save e zera o risco de duplicata.
      const mesmaQtd = lancamentosAntigos.length === parcelas.length;
      const estruturaInalterada =
        jaEraParcelada &&
        mesmaQtd &&
        parcelas.every((p, idx) => {
          const lanc = lancamentosAntigos[idx];
          if (!lanc) return false;
          const valorIgual =
            Math.abs((lanc.valor || 0) + Math.abs(parseFloat(p.valor) || 0)) < 0.01;
          return lanc.data === p.data_vencimento && valorIgual;
        });

      if (estruturaInalterada) {
        // Só atualiza descrição/conta/categoria nos lançamentos existentes.
        const results = await Promise.allSettled(
          lancamentosAntigos.map((lanc, idx) =>
            sigo.entities.ExtratoBancario.update(lanc.id, {
              conta_id: form.conta_id,
              descricao: `${form.descricao} - Parcela ${parcelas[idx].numero}/${parcelas.length}`,
              categoria: categoria?.nome || "Despesa",
            })
          )
        );
        const falhas = results.filter((r) => r.status === "rejected");
        if (falhas.length > 0) {
          console.error("Falhas ao atualizar parcelas do extrato:", falhas);
        }
      } else {
        // Estrutura mudou: precisa reescrever. Faz delete + create em
        // allSettled pra não mascarar falhas e logar pra investigação.
        const deletes = await Promise.allSettled(
          lancamentosAntigos.map((lanc) => sigo.entities.ExtratoBancario.delete(lanc.id))
        );
        const deleteFails = deletes.filter((r) => r.status === "rejected");
        if (deleteFails.length > 0) {
          console.error("Falhas ao apagar extrato antigo:", deleteFails);
        }

        const creates = await Promise.allSettled(
          parcelas.map((parcela) =>
            sigo.entities.ExtratoBancario.create({
              empresa_id: empresaAtiva.id,
              conta_id: form.conta_id,
              data: parcela.data_vencimento,
              descricao: `${form.descricao} - Parcela ${parcela.numero}/${parcelas.length}`,
              valor: -Math.abs(parseFloat(parcela.valor) || 0),
              tipo: "debito",
              categoria: categoria?.nome || "Despesa",
              conciliado: false,
              transacao_id: selectedItem.id,
              origem: "manual",
            })
          )
        );
        const createFails = creates.filter((r) => r.status === "rejected");
        if (createFails.length > 0) {
          console.error("Falhas ao recriar extrato das parcelas:", createFails);
          alert(
            `Atenção: ${createFails.length} parcela(s) não foram lançadas no extrato. Verifique e ajuste manualmente.`
          );
        }
      }
    }
    // CENÁRIO 3: Edição simples (sem parcelamento)
    else if (selectedItem) {
      await sigo.entities.TransacaoFinanceira.update(selectedItem.id, dataBase);
      transacaoSalva = { ...selectedItem, ...dataBase, id: selectedItem.id };

      // Atualizar lançamento existente no extrato
      const lancamentosExistentes = await sigo.entities.ExtratoBancario.filter({
        empresa_id: empresaAtiva.id,
        transacao_id: selectedItem.id,
      });

      if (lancamentosExistentes.length > 0 && dataBase.status === "pago") {
        await sigo.entities.ExtratoBancario.update(lancamentosExistentes[0].id, {
          conta_id: form.conta_id,
          data: form.data_pagamento || form.data_vencimento,
          descricao: form.descricao,
          valor: -Math.abs(parseFloat(form.valor) || 0),
          categoria: categoria?.nome || "Despesa",
          conciliado: false, // Re-set conciliado status
        });
      } else if (lancamentosExistentes.length > 0 && dataBase.status !== "pago") {
        // If the expense is no longer paid, remove the bank record
        for (const lanc of lancamentosExistentes) {
          await sigo.entities.ExtratoBancario.delete(lanc.id);
        }
      }

      // Gerenciar anexos - remover e recriar
      const anexosExistentes = await sigo.entities.TransacaoAnexo.filter({
        empresa_id: empresaAtiva.id,
        transacao_id: selectedItem.id,
      });

      for (const anexo of anexosExistentes) {
        if (!anexos.find((a) => a.id === anexo.id)) {
          await sigo.entities.TransacaoAnexo.delete(anexo.id);
        }
      }

      for (const anexo of anexos) {
        if (!anexo.id) {
          await sigo.entities.TransacaoAnexo.create({
            empresa_id: empresaAtiva.id,
            transacao_id: selectedItem.id,
            nome: anexo.nome,
            url: anexo.url,
            tipo: anexo.tipo || "comprovante",
          });
        }
      }
    }
    // CENÁRIO 4: Nova despesa simples (sem parcelamento)
    else {
      const transacao = await sigo.entities.TransacaoFinanceira.create(dataBase);
      transacaoSalva = transacao;

      // Salvar anexos
      for (const anexo of anexos) {
        await sigo.entities.TransacaoAnexo.create({
          empresa_id: empresaAtiva.id,
          transacao_id: transacao.id,
          nome: anexo.nome,
          url: anexo.url,
          tipo: anexo.tipo || "comprovante",
        });
      }

      if (transacao.status === "pago") {
        // Criar lançamento no extrato bancário apenas se já estiver paga
        await sigo.entities.ExtratoBancario.create({
          empresa_id: empresaAtiva.id,
          conta_id: form.conta_id,
          data: form.data_pagamento || form.data_vencimento,
          descricao: form.descricao,
          valor: -Math.abs(parseFloat(form.valor) || 0),
          tipo: "debito",
          categoria: categoria?.nome || "Despesa",
          conciliado: false,
          transacao_id: transacao.id,
          origem: "manual",
        });
      }
    }

    // INTEGRAÇÃO NFe → ESTOQUE
    // Para cada item da NFe que tem material associado, dispara
    // entrada_estoque_atomica (RPC). Saída atômica + CMP + saldo numa única tx.
    const itensAssociaveis = (itensNota || []).filter(
      (i) => (i.material_id_associado || i.material_id) && i.quantidade > 0
    );

    if (
      tipoDespesa === "material" &&
      itensAssociaveis.length > 0 &&
      almoxarifadoId &&
      transacaoSalva?.id
    ) {
      if (!supabase) {
        alert(
          "⚠️ Supabase client não disponível. Lançamento financeiro salvo, mas estoque não foi atualizado."
        );
      } else {
        let user = null;
        try {
          user = await sigo.auth.me();
        } catch {
          /* anônimo ok */
        }

        let sucesso = 0;
        const erros = [];
        for (const item of itensAssociaveis) {
          const materialId = item.material_id_associado || item.material_id;
          try {
            const { error } = await supabase.rpc("entrada_estoque_atomica", {
              p_empresa_id: empresaAtiva.id,
              p_material_id: materialId,
              p_almoxarifado_id: almoxarifadoId,
              p_quantidade: parseFloat(item.quantidade),
              p_valor_unitario: parseFloat(item.valor_unitario),
              p_referencia_tipo: "NotaFiscal",
              p_referencia_id: transacaoSalva.id,
              p_projeto_id: form.projeto_id || null,
              p_usuario_nome: user?.full_name || null,
              p_observacoes: `Entrada via NFe ${chaveNfe ? chaveNfe.slice(0, 10) + "…" : "(s/ chave)"}`,
            });
            if (error) throw error;
            sucesso++;
          } catch (err) {
            erros.push(`${item.descricao}: ${err.message || err}`);
          }
        }

        if (sucesso > 0) {
          await sigo.entities.TransacaoFinanceira.update(transacaoSalva.id, {
            gerou_entrada_estoque: true,
          });
        }

        if (erros.length > 0) {
          alert(
            `Entrada de estoque parcial: ${sucesso}/${itensAssociaveis.length} OK.\n\nErros:\n${erros.join("\n")}`
          );
        } else if (sucesso > 0) {
          alert(`✅ ${sucesso} entrada(s) de estoque registrada(s) com sucesso.`);
        }
      }
    }

    setShowModal(false);
    setSelectedItem(null);
    setNumeroParcelas(1);
    setParcelas([]);
    setAnexos([]);

    await onReload();
  };

  const handleDelete = async (id) => {
    const despesa = despesas.find((d) => d.id === id);
    if (despesa?.conciliado) {
      alert("❌ Esta despesa está conciliada e não pode ser excluída.");
      return;
    }
    if (!confirm("Tem certeza que deseja excluir esta despesa?")) return;

    try {
      // Cascade: limpa extratos, anexos e pré-lançamentos vinculados antes de
      // deletar a transação. Antes ficava tudo órfão afetando saldo da conta
      // e referências quebradas em PreLancamento.transacao_id.
      const [extratos, anexosT, prelancs] = await Promise.allSettled([
        sigo.entities.ExtratoBancario.filter({ empresa_id: empresaAtiva.id, transacao_id: id }),
        sigo.entities.TransacaoAnexo.filter({ transacao_id: id }),
        sigo.entities.PreLancamento.filter({ empresa_id: empresaAtiva.id, transacao_id: id }),
      ]);
      const list = (r) => (r.status === "fulfilled" ? r.value || [] : []);

      await Promise.allSettled([
        ...list(extratos).map((e) => sigo.entities.ExtratoBancario.delete(e.id)),
        ...list(anexosT).map((a) => sigo.entities.TransacaoAnexo.delete(a.id)),
        // Pré-lançamento volta pra "Pendente" em vez de ser apagado — preserva
        // dado do operador (foto do cupom etc).
        ...list(prelancs).map((p) =>
          sigo.entities.PreLancamento.update(p.id, { status: "Pendente", transacao_id: null })
        ),
      ]);

      await sigo.entities.TransacaoFinanceira.delete(id);
      alert("Despesa excluída com sucesso!");
      onReload();
    } catch (err) {
      console.error("[DespesasTab] erro ao excluir:", err);
      alert("❌ Erro ao excluir: " + (err?.message || "desconhecido"));
    }
  };

  const handleToggleStatus = async (item) => {
    if (togglingIds.has(item.id)) return; // bloqueia clique duplo
    setTogglingIds((s) => new Set(s).add(item.id));

    const statusAtual = String(item.status || "").toLowerCase();
    const eraPago = statusAtual === "pago" || statusAtual === "realizado";
    const newStatus = eraPago ? "em_aberto" : "pago";

    try {
      await sigo.entities.TransacaoFinanceira.update(item.id, {
        status: newStatus,
        data_pagamento: newStatus === "pago" ? new Date().toISOString().split("T")[0] : null,
      });

      // Sincronizar com ExtratoBancario
      if (newStatus === "pago") {
        const lancamentosExistentes = await sigo.entities.ExtratoBancario.filter({
          empresa_id: empresaAtiva.id,
          transacao_id: item.id,
        });

        if (lancamentosExistentes.length === 0) {
          await sigo.entities.ExtratoBancario.create({
            empresa_id: empresaAtiva.id,
            conta_id: item.conta_id,
            data: new Date().toISOString().split("T")[0],
            descricao: item.descricao,
            valor: -Math.abs(item.valor),
            tipo: "debito",
            categoria: item.categoria_nome || "Despesa",
            conciliado: false,
            transacao_id: item.id,
            origem: "manual",
          });
        }
      } else {
        const lancamentosExistentes = await sigo.entities.ExtratoBancario.filter({
          empresa_id: empresaAtiva.id,
          transacao_id: item.id,
        });
        await Promise.allSettled(
          lancamentosExistentes.map((l) => sigo.entities.ExtratoBancario.delete(l.id))
        );
      }

      onReload();
    } catch (err) {
      console.error("[DespesasTab] erro toggle status:", err);
      alert("❌ Erro ao atualizar status: " + (err?.message || "desconhecido"));
    } finally {
      setTogglingIds((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  };

  const handleEmitirRecibo = async (despesa) => {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();

      // Header
      doc.setFontSize(20);
      doc.text("RECIBO DE PAGAMENTO", 105, 20, { align: "center" });

      // Linha separadora
      doc.setLineWidth(0.5);
      doc.line(20, 25, 190, 25);

      // Informações da empresa
      doc.setFontSize(10);
      doc.text(`Empresa: ${empresaAtiva.razao_social || empresaAtiva.nome}`, 20, 35);
      if (empresaAtiva.cnpj) {
        doc.text(`CNPJ: ${empresaAtiva.cnpj}`, 20, 42);
      }

      // Dados do recibo
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text("DADOS DO PAGAMENTO", 20, 55);

      doc.setFont(undefined, "normal");
      doc.setFontSize(10);

      let y = 65;
      doc.text(
        `Valor: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(despesa.valor)}`,
        20,
        y
      );
      y += 7;
      doc.text(`Descrição: ${despesa.descricao || "-"}`, 20, y);
      y += 7;
      doc.text(`Fornecedor: ${despesa.fornecedor_nome || "-"}`, 20, y);
      y += 7;
      doc.text(
        `Data de Pagamento: ${despesa.data_pagamento ? new Date(despesa.data_pagamento).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR")}`,
        20,
        y
      );
      y += 7;
      doc.text(`Forma de Pagamento: ${despesa.forma_pagamento || "-"}`, 20, y);
      y += 7;
      if (despesa.conta_nome) {
        doc.text(`Conta: ${despesa.conta_nome}`, 20, y);
        y += 7;
      }

      // Linha separadora
      y += 10;
      doc.line(20, y, 190, y);

      // Texto de declaração
      y += 15;
      doc.setFontSize(10);
      const texto = `Declaro que recebi da empresa ${empresaAtiva.razao_social || empresaAtiva.nome} a quantia de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(despesa.valor)} referente a ${despesa.descricao || "pagamento"}.`;

      const linhasTexto = doc.splitTextToSize(texto, 170);
      doc.text(linhasTexto, 20, y);
      y += linhasTexto.length * 7 + 20;

      // Linha para assinatura
      doc.line(20, y + 30, 90, y + 30);
      doc.setFontSize(9);
      doc.text("Assinatura do Fornecedor", 20, y + 35);

      doc.line(110, y + 30, 190, y + 30);
      doc.text("Data", 110, y + 35);

      // Rodapé
      doc.setFontSize(8);
      doc.text(
        `Emitido em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`,
        105,
        280,
        { align: "center" }
      );

      // Salvar PDF
      doc.save(
        `Recibo_${despesa.descricao?.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`
      );
    } catch (error) {
      console.error("Erro ao emitir recibo:", error);
      alert("Erro ao gerar recibo");
    }
  };

  const handleAdicionarAnexo = (despesa) => {
    setDespesaDetalhes(despesa);
    // Abrir input de arquivo
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,.pdf";
    input.onchange = async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        const { file_url } = await sigo.integrations.Core.UploadFile({ file });
        await sigo.entities.TransacaoAnexo.create({
          empresa_id: empresaAtiva.id,
          transacao_id: despesa.id,
          nome: file.name,
          url: file_url,
          tipo: file.type || "recibo",
        });
      }
      alert("Anexo(s) adicionado(s) com sucesso!");
      onReload();
    };
    input.click();
  };

  const handleVerDetalhes = async (despesa) => {
    // Carregar anexos
    const anexosDb = await sigo.entities.TransacaoAnexo.filter({
      empresa_id: empresaAtiva.id,
      transacao_id: despesa.id,
    });
    setAnexosDetalhes(anexosDb);
    setDespesaDetalhes(despesa);
    setShowDetalhes(true);
  };

  const handleDesfazerConciliacao = async (despesa) => {
    if (!confirm("Desfazer a conciliação bancária desta despesa?")) return;

    try {
      await sigo.entities.TransacaoFinanceira.update(despesa.id, { conciliado: false });

      // Atualizar extrato bancário relacionado
      const lancamentos = await sigo.entities.ExtratoBancario.filter({
        empresa_id: empresaAtiva.id,
        transacao_id: despesa.id,
      });

      for (const lanc of lancamentos) {
        await sigo.entities.ExtratoBancario.update(lanc.id, { conciliado: false });
      }

      alert("Conciliação desfeita com sucesso!");
      onReload();
    } catch (error) {
      console.error("Erro ao desfazer conciliação:", error);
      alert("Erro ao desfazer conciliação");
    }
  };

  const handleDuplicarDespesa = async (despesa) => {
    if (!confirm("Duplicar esta despesa?")) return;

    try {
      const novaDespesa = {
        empresa_id: despesa.empresa_id,
        tipo: despesa.tipo,
        conta_id: despesa.conta_id,
        conta_nome: despesa.conta_nome,
        categoria_id: despesa.categoria_id,
        categoria_nome: despesa.categoria_nome,
        projeto_id: despesa.projeto_id,
        projeto_nome: despesa.projeto_nome,
        fornecedor_id: despesa.fornecedor_id,
        fornecedor_nome: despesa.fornecedor_nome,
        centro_custo_id: despesa.centro_custo_id,
        centro_custo_nome: despesa.centro_custo_nome,
        valor: despesa.valor,
        data: new Date().toISOString().split("T")[0],
        data_vencimento: new Date().toISOString().split("T")[0],
        descricao: despesa.descricao + " (Cópia)",
        status: "em_aberto",
        forma_pagamento: despesa.forma_pagamento,
      };

      await sigo.entities.TransacaoFinanceira.create(novaDespesa);
      alert("Despesa duplicada com sucesso!");
      onReload();
    } catch (error) {
      console.error("Erro ao duplicar despesa:", error);
      alert("Erro ao duplicar despesa");
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de Progresso */}
      <BarraProgressoImportacao
        ativo={importacao.ativo}
        total={importacao.total}
        processados={importacao.processados}
        erros={importacao.erros}
        titulo={importacao.tipo === "exclusao" ? "Excluindo despesas..." : "Importando despesas..."}
      />

      {/* Cards de Resumo */}
      <CardsResumo transacoes={despesasFiltradas} tipo="despesas" />

      {/* Filtros */}
      <FiltroRapido
        filtros={filtros}
        onFiltrosChange={setFiltros}
        categorias={categorias.filter((c) => c.tipo === "Despesa")}
        projetos={projetos}
        contas={contas}
        tipo="despesas"
      />

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-slate-800">
            Despesas ({despesasFiltradas.length})
          </h2>
          {itensSelecionados.length > 0 && (
            <div className="flex gap-2">
              <Badge variant="secondary">{itensSelecionados.length} selecionados</Badge>
              <Button size="sm" variant="outline" onClick={handleBaixarEmLote}>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Baixar Selecionados
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExcluirEmLote}
                className="text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Excluir Selecionados
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => handleOpen()} className="gap-2 bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4" />
            Nova Despesa
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                Ações
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleBaixarModelo}>
                <Download className="w-4 h-4 mr-2" />
                Baixar Modelo Excel
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => document.getElementById("importar-excel-despesas").click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Importar Excel
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => document.getElementById("importar-xml-despesas")?.click()}
              >
                <FileText className="w-4 h-4 mr-2" />
                Importar XML / NF-e
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportarExcel}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Exportar Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Configuração de Colunas */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon">
                <Settings className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Colunas Visíveis</h4>
                {colunasDisponiveis.map((coluna) => (
                  <div key={coluna.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={coluna.id}
                      checked={colunasVisiveis.includes(coluna.id)}
                      onCheckedChange={() => toggleColuna(coluna.id)}
                    />
                    <label htmlFor={coluna.id} className="text-sm cursor-pointer flex-1">
                      {coluna.label}
                    </label>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <input
        type="file"
        id="importar-excel-despesas"
        accept=".xlsx,.xls"
        onChange={handleImportarExcel}
        className="hidden"
      />
      <input
        type="file"
        id="importar-xml-despesas"
        accept=".xml"
        onChange={handleImportarXML}
        className="hidden"
      />

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px]">
            <thead className="bg-slate-100 border-b group">
              <tr>
                <th className="w-12 px-4 py-3">
                  <Checkbox
                    checked={itensSelecionados.length === despesas.length && despesas.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setItensSelecionados(despesas.map((d) => d.id));
                      } else {
                        setItensSelecionados([]);
                      }
                    }}
                  />
                </th>
                {colunasVisiveis.includes("data") && (
                  <SortableTableHeader
                    field="data"
                    label="Data Competência"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                )}
                {colunasVisiveis.includes("vencimento") && (
                  <SortableTableHeader
                    field="data_vencimento"
                    label="Data Vencimento"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                )}
                {colunasVisiveis.includes("pagamento") && (
                  <SortableTableHeader
                    field="data_pagamento"
                    label="Data Pagamento"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                )}
                {colunasVisiveis.includes("descricao") && (
                  <SortableTableHeader
                    field="descricao"
                    label="Descrição"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                )}
                {colunasVisiveis.includes("fornecedor") && (
                  <SortableTableHeader
                    field="fornecedor_nome"
                    label="Fornecedor"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                )}
                {colunasVisiveis.includes("categoria") && (
                  <SortableTableHeader
                    field="categoria_nome"
                    label="Categoria"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                )}
                {colunasVisiveis.includes("conta") && (
                  <SortableTableHeader
                    field="conta_nome"
                    label="Conta"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                )}
                {colunasVisiveis.includes("projeto") && (
                  <SortableTableHeader
                    field="projeto_nome"
                    label="Projeto"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                )}
                {colunasVisiveis.includes("centro_custo") && (
                  <SortableTableHeader
                    field="centro_custo_nome"
                    label="Centro de Custo"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                )}
                {colunasVisiveis.includes("valor") && (
                  <SortableTableHeader
                    field="valor"
                    label="Valor"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                    align="right"
                  />
                )}
                {colunasVisiveis.includes("status") && (
                  <SortableTableHeader
                    field="status"
                    label="Status"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                )}
                {colunasVisiveis.includes("forma_pagamento") && (
                  <SortableTableHeader
                    field="forma_pagamento"
                    label="Forma Pagamento"
                    currentSort={sortConfig}
                    onSortChange={setSortConfig}
                  />
                )}
                <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {despesas.length === 0 ? (
                <tr>
                  <td colSpan="14" className="px-4 py-8 text-center text-slate-500">
                    Nenhuma despesa encontrada
                  </td>
                </tr>
              ) : (
                despesas.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b hover:bg-slate-50 cursor-pointer"
                    onClick={() => handleVerDetalhes(d)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={itensSelecionados.includes(d.id)}
                        onCheckedChange={(checked, event) => {
                          // Seleção em lote com Shift - sempre seleciona tudo no intervalo
                          if (event?.nativeEvent?.shiftKey && ultimoItemClicado) {
                            const todasDespesas = [...despesasFiltradas].sort((a, b) => {
                              let aVal, bVal;

                              if (
                                sortConfig.field === "data" ||
                                sortConfig.field === "data_vencimento" ||
                                sortConfig.field === "data_pagamento"
                              ) {
                                aVal = a[sortConfig.field]
                                  ? new Date(a[sortConfig.field]).getTime()
                                  : 0;
                                bVal = b[sortConfig.field]
                                  ? new Date(b[sortConfig.field]).getTime()
                                  : 0;
                              } else if (sortConfig.field === "valor") {
                                aVal = a[sortConfig.field] || 0;
                                bVal = b[sortConfig.field] || 0;
                              } else {
                                aVal = (a[sortConfig.field] || "").toString().toLowerCase();
                                bVal = (b[sortConfig.field] || "").toString().toLowerCase();
                              }

                              if (sortConfig.direction === "asc") {
                                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
                              } else {
                                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
                              }
                            });
                            const indiceUltimo = todasDespesas.findIndex(
                              (item) => item.id === ultimoItemClicado
                            );
                            const indiceAtual = todasDespesas.findIndex((item) => item.id === d.id);

                            const inicio = Math.min(indiceUltimo, indiceAtual);
                            const fim = Math.max(indiceUltimo, indiceAtual);

                            const idsNoIntervalo = todasDespesas
                              .slice(inicio, fim + 1)
                              .map((item) => item.id);
                            setItensSelecionados([
                              ...new Set([...itensSelecionados, ...idsNoIntervalo]),
                            ]);
                          } else {
                            // Seleção normal
                            if (checked) {
                              setItensSelecionados([...itensSelecionados, d.id]);
                            } else {
                              setItensSelecionados(itensSelecionados.filter((id) => id !== d.id));
                            }
                          }
                          setUltimoItemClicado(d.id);
                        }}
                      />
                    </td>
                    {colunasVisiveis.includes("data") && (
                      <td className="px-4 py-3 text-sm">
                        {d.data ? new Date(d.data).toLocaleDateString("pt-BR") : "-"}
                      </td>
                    )}
                    {colunasVisiveis.includes("vencimento") && (
                      <td className="px-4 py-3 text-sm">
                        {d.data_vencimento
                          ? new Date(d.data_vencimento).toLocaleDateString("pt-BR")
                          : "-"}
                      </td>
                    )}
                    {colunasVisiveis.includes("pagamento") && (
                      <td className="px-4 py-3 text-sm">
                        {d.data_pagamento
                          ? new Date(d.data_pagamento).toLocaleDateString("pt-BR")
                          : "-"}
                      </td>
                    )}
                    {colunasVisiveis.includes("descricao") && (
                      <td className="px-4 py-3 text-sm">{d.descricao || "-"}</td>
                    )}
                    {colunasVisiveis.includes("fornecedor") && (
                      <td className="px-4 py-3 text-sm">{d.fornecedor_nome || "-"}</td>
                    )}
                    {colunasVisiveis.includes("categoria") && (
                      <td className="px-4 py-3 text-sm">
                        {d.categoria_nome && (
                          <Badge variant="outline" className="text-xs">
                            {d.categoria_nome}
                          </Badge>
                        )}
                      </td>
                    )}
                    {colunasVisiveis.includes("conta") && (
                      <td className="px-4 py-3 text-sm">{d.conta_nome || "-"}</td>
                    )}
                    {colunasVisiveis.includes("projeto") && (
                      <td className="px-4 py-3 text-sm">{d.projeto_nome || "-"}</td>
                    )}
                    {colunasVisiveis.includes("centro_custo") && (
                      <td className="px-4 py-3 text-sm">
                        {d.centro_custo_nome || d.centro_custo || "-"}
                      </td>
                    )}
                    {colunasVisiveis.includes("valor") && (
                      <td className="px-4 py-3 text-sm font-semibold text-red-600">
                        {formatCurrency(d.valor)}
                      </td>
                    )}
                    {colunasVisiveis.includes("status") && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              d.status === "pago" || d.status === "Pago"
                                ? "bg-green-100 text-green-700 cursor-pointer"
                                : "bg-blue-100 text-blue-700 cursor-pointer"
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleStatus(d);
                            }}
                          >
                            {d.status === "pago" || d.status === "Pago" ? "Pago" : "Em aberto"}
                          </Badge>
                          {d.conciliado && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-purple-50 text-purple-700 border-purple-200"
                            >
                              <Link2 className="w-3 h-3 mr-1" />
                              Conciliado
                            </Badge>
                          )}
                        </div>
                      </td>
                    )}
                    {colunasVisiveis.includes("forma_pagamento") && (
                      <td className="px-4 py-3 text-sm">
                        {d.forma_pagamento ? (
                          <Badge variant="outline" className="text-xs capitalize">
                            {d.forma_pagamento}
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => handleEmitirRecibo(d)}>
                              <FileText className="w-4 h-4 mr-2" />
                              Emitir recibo
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAdicionarAnexo(d)}>
                              <Paperclip className="w-4 h-4 mr-2" />
                              Adicionar anexo
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleVerDetalhes(d)}>
                              <Eye className="w-4 h-4 mr-2" />
                              Detalhes da despesa
                            </DropdownMenuItem>
                            {d.conciliado && (
                              <DropdownMenuItem onClick={() => handleDesfazerConciliacao(d)}>
                                <Link2Off className="w-4 h-4 mr-2" />
                                Desfazer conciliação
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleOpen(d)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Ver/editar despesa
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicarDespesa(d)}>
                              <Copy className="w-4 h-4 mr-2" />
                              Duplicar despesa
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(d.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-slate-600">
              Mostrando {indiceInicio + 1} a {Math.min(indiceFim, despesasFiltradas.length)} de{" "}
              {despesasFiltradas.length} despesas
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaginaAtual(Math.max(1, paginaAtual - 1))}
                disabled={paginaAtual === 1}
              >
                Anterior
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                  let pageNum;
                  if (totalPaginas <= 5) {
                    pageNum = i + 1;
                  } else if (paginaAtual <= 3) {
                    pageNum = i + 1;
                  } else if (paginaAtual >= totalPaginas - 2) {
                    pageNum = totalPaginas - 4 + i;
                  } else {
                    pageNum = paginaAtual - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={paginaAtual === pageNum ? "default" : "outline"}
                      size="sm"
                      className={paginaAtual === pageNum ? "bg-amber-500 hover:bg-amber-600" : ""}
                      onClick={() => setPaginaAtual(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaginaAtual(Math.min(totalPaginas, paginaAtual + 1))}
                disabled={paginaAtual === totalPaginas}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>

      <DetalheDespesaModal
        open={showDetalhes}
        onOpenChange={setShowDetalhes}
        despesa={despesaDetalhes}
        anexos={anexosDetalhes}
        podeEditar={true}
        onEditar={(despesa) => {
          setShowDetalhes(false);
          handleOpen(despesa);
        }}
        onBaixar={handleToggleStatus}
        empresaAtiva={empresaAtiva}
        onEmitirRecibo={handleEmitirRecibo}
        onAdicionarAnexo={handleAdicionarAnexo}
        onDuplicar={handleDuplicarDespesa}
        onDesfazerConciliacao={handleDesfazerConciliacao}
      />

      {/* Modal de Criação/Edição */}
      {showModal && (
        <DespesaModal
          showModal={showModal}
          setShowModal={setShowModal}
          selectedItem={selectedItem}
          form={form}
          setForm={setForm}
          contas={contas}
          categorias={categorias}
          fornecedores={fornecedores}
          projetos={projetos}
          oportunidades={oportunidades}
          numeroParcelas={numeroParcelas}
          handleNumeroParcelasChange={handleNumeroParcelasChange}
          parcelas={parcelas}
          setParcelas={setParcelas}
          anexos={anexos}
          handleAnexoUpload={handleAnexoUpload}
          handleRemoverAnexo={handleRemoverAnexo}
          handleSave={handleSave}
          empresaAtiva={empresaAtiva}
          onReload={onReload}
          onEmitirRecibo={handleEmitirRecibo}
          onDuplicar={handleDuplicarDespesa}
          onDesfazerConciliacao={handleDesfazerConciliacao}
          podeEditar={true}
        />
      )}
    </div>
  );
}
