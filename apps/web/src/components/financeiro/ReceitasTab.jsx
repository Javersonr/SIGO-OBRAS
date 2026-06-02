import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
  Download,
  Upload,
  ChevronDown,
  Clock,
  Eye,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sigo } from "@/api/sigoClient";
import * as XLSX from "xlsx";
import { createPortal } from "react-dom";
import NovoClienteModal from "../clientes/NovoClienteModal";
import FiltroRapido from "./FiltroRapido";
import CardsResumo from "./CardsResumo";
import BarraProgressoImportacao from "./BarraProgressoImportacao";
import { parseData, parseValor, formatCurrency } from "./utils";
import SortButton from "../shared/SortButton";
import SortableTableHeader from "../shared/SortableTableHeader";
import AnexoViewer from "../shared/AnexoViewer";
import DetalheReceitaModal from "./DetalheReceitaModal";

export default function ReceitasTab({
  empresaAtiva,
  transacoes: transacoesIniciais,
  contas,
  categorias,
  projetos,
  clientes,
  onReload,
  filtroProjetoInicial,
  ocultarFiltrosProjeto,
  transacaoIdInicial,
  transacaoIdRef,
  transacaoKey,
  onTransacaoInicialConsumed,
}) {
  const [sortConfig, setSortConfig] = useState({ field: "data_vencimento", direction: "desc" });
  const [anexoSelecionado, setAnexoSelecionado] = useState(null);
  const [showAnexoViewer, setShowAnexoViewer] = useState(false);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [receitaDetalhes, setReceitaDetalhes] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [oportunidades, setOportunidades] = useState([]);
  const [numeroParcelas, setNumeroParcelas] = useState(1);
  const [parcelas, setParcelas] = useState([]);
  const [anexos, setAnexos] = useState([]);
  const [tipoReceita, setTipoReceita] = useState("servico");
  // Bloqueia clique duplo no botão Salvar e no toggle de status individual.
  const [saving, setSaving] = useState(false);
  const [togglingIds, setTogglingIds] = useState(() => new Set());
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
  const [form, setForm] = useState({
    conta_id: "",
    categoria_id: "",
    projeto_id: filtroProjetoInicial || "",
    oportunidade_id: "",
    cliente_id: "",
    cliente_nome: "",
    valor: "",
    data_competencia: new Date().toLocaleDateString("en-CA"),
    data_vencimento: "",
    data_pagamento: "",
    descricao: "",
    status: "em_aberto",
    forma_pagamento: "",
    observacoes: "",
  });
  const [openCliente, setOpenCliente] = useState(false);
  const [searchCliente, setSearchCliente] = useState("");
  const [openCategoria, setOpenCategoria] = useState(false);
  const [searchCategoria, setSearchCategoria] = useState("");
  const [openCentroCusto, setOpenCentroCusto] = useState(false);
  const [searchCentroCusto, setSearchCentroCusto] = useState("");
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [showNovoCentroCusto, setShowNovoCentroCusto] = useState(false);
  const [novoCentroCusto, setNovoCentroCusto] = useState({ nome: "", codigo: "" });
  const [centrosCusto, setCentrosCusto] = useState([]);

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

  const gerarParcelas = (numParcelas, valorTotal, dataVencimento) => {
    if (!valorTotal || !dataVencimento || numParcelas <= 1) {
      setParcelas([]);
      return;
    }

    const valorParcela = valorTotal / numParcelas;
    const novasParcelas = [];

    // Bug histórico: `new Date("2026-01-15")` é interpretado em UTC, e em
    // UTC-3 o toISOString().split("T")[0] volta como "2026-01-14" — todas
    // as parcelas saíam 1 dia antes. Parse manual local + formato manual.
    const [anoBase, mesBase, diaBase] = dataVencimento.split("-").map((n) => parseInt(n, 10));

    for (let i = 0; i < numParcelas; i++) {
      const data = new Date(anoBase, mesBase - 1 + i, diaBase, 12, 0, 0);

      const yyyy = data.getFullYear();
      const mm = String(data.getMonth() + 1).padStart(2, "0");
      const dd = String(data.getDate()).padStart(2, "0");

      novasParcelas.push({
        numero: i + 1,
        valor: valorParcela,
        data_vencimento: `${yyyy}-${mm}-${dd}`,
        data_pagamento: "",
        status: "em_aberto",
      });
    }

    setParcelas(novasParcelas);
  };

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
      if (t && (t.tipo || "").toLowerCase() === "receita") {
        setReceitaDetalhes(t);
        setShowDetalhes(true);
      }
      onTransacaoInicialConsumed?.();
    };
    abrirTransacao();
  }, [transacaoKey]);

  // Carregar centros de custo apenas uma vez
  useEffect(() => {
    let mounted = true;
    if (empresaAtiva?.id && centrosCusto.length === 0) {
      sigo.entities.CentroCusto.filter({ empresa_id: empresaAtiva.id }).then((centros) => {
        if (mounted) setCentrosCusto(centros);
      });
    }
    return () => {
      mounted = false;
    };
  }, [empresaAtiva?.id]);

  const handleSalvarCentroCusto = async () => {
    if (!novoCentroCusto.nome) return;
    await sigo.entities.CentroCusto.create({
      empresa_id: empresaAtiva.id,
      ...novoCentroCusto,
      ativo: true,
    });
    const centros = await sigo.entities.CentroCusto.filter({ empresa_id: empresaAtiva.id });
    setCentrosCusto(centros);
    setShowNovoCentroCusto(false);
    setNovoCentroCusto({ nome: "", codigo: "" });
  };

  const [clientesLocais, setClientesLocais] = useState(clientes || []);
  useEffect(() => {
    setClientesLocais(clientes || []);
  }, [clientes]);

  // Clientes ordenados alfabeticamente
  const clientesOrdenados = useMemo(() => {
    return [...clientesLocais].sort((a, b) =>
      (a.nome_razao || "").localeCompare(b.nome_razao || "")
    );
  }, [clientesLocais]);

  // Filtrar clientes
  const clientesFiltrados = useMemo(() => {
    if (!searchCliente) return clientesOrdenados;
    return clientesOrdenados.filter(
      (c) =>
        c.nome_razao?.toLowerCase().includes(searchCliente.toLowerCase()) ||
        c.documento?.includes(searchCliente)
    );
  }, [clientesOrdenados, searchCliente]);

  const clienteSelecionado = clientesLocais.find((c) => c.id === form.cliente_id);
  const categoriaSelecionada = categorias.find((c) => c.id === form.categoria_id);
  const centroCustoSelecionado = centrosCusto.find((c) => c.id === form.centro_custo_id);

  // Categorias ordenadas alfabeticamente
  const categoriasOrdenadas = useMemo(() => {
    return [...categorias]
      .filter((c) => c.tipo === "Receita")
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  }, [categorias]);

  // Filtrar categorias
  const categoriasFiltradas = useMemo(() => {
    if (!searchCategoria) return categoriasOrdenadas;
    return categoriasOrdenadas.filter((c) =>
      c.nome?.toLowerCase().includes(searchCategoria.toLowerCase())
    );
  }, [categoriasOrdenadas, searchCategoria]);

  // Centros de custo ordenados
  const centrosCustoOrdenados = useMemo(() => {
    return [...centrosCusto].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  }, [centrosCusto]);

  // Filtrar centros de custo
  const centrosCustoFiltrados = useMemo(() => {
    if (!searchCentroCusto) return centrosCustoOrdenados;
    return centrosCustoOrdenados.filter(
      (c) =>
        c.nome?.toLowerCase().includes(searchCentroCusto.toLowerCase()) ||
        c.codigo?.includes(searchCentroCusto)
    );
  }, [centrosCustoOrdenados, searchCentroCusto]);

  const handleNumeroParcelasChange = (num) => {
    setNumeroParcelas(num);
    if (num > 1 && form.valor && form.data_vencimento) {
      gerarParcelas(num, parseFloat(form.valor), form.data_vencimento);
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
    setImportacao({ ativo: true, total: transacoesIniciais.length, processados: 0, erros: 0 });

    const dadosExportacao = transacoesIniciais
      .filter((t) => (t.tipo || "").toLowerCase() === "receita")
      .map((t, index) => {
        setImportacao((prev) => ({ ...prev, processados: index + 1 }));
        return {
          Descrição: t.descricao || "",
          Cliente: t.cliente_nome || "",
          Oportunidade: t.oportunidade_nome || "",
          Projeto: t.projeto_nome || "",
          Categoria: t.categoria_nome || "",
          Conta: t.conta_nome || "",
          Valor: t.valor || 0,
          "Data Vencimento": t.data_vencimento || "",
          Status:
            t.status === "pago" ? "Recebido" : t.status === "em_aberto" ? "Pendente" : "Atrasado",
          "Data Pagamento": t.data_pagamento || "",
          Observações: t.observacoes || "",
        };
      });

    if (!XLSX) return;
    const ws = XLSX.utils.json_to_sheet(dadosExportacao);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Receitas");

    // Ajustar largura das colunas
    const wscols = [
      { wch: 30 }, // Descrição
      { wch: 25 }, // Cliente
      { wch: 25 }, // Oportunidade
      { wch: 25 }, // Projeto
      { wch: 20 }, // Categoria
      { wch: 20 }, // Conta
      { wch: 12 }, // Valor
      { wch: 15 }, // Data Vencimento
      { wch: 12 }, // Status
      { wch: 15 }, // Data Pagamento
      { wch: 30 }, // Observações
    ];
    ws["!cols"] = wscols;

    XLSX.writeFile(wb, `Receitas_${new Date().toISOString().split("T")[0]}.xlsx`);

    setTimeout(() => {
      setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
    }, 500);
  };

  const handleBaixarModelo = async () => {
    const dadosModelo = [
      {
        Descrição: "Exemplo: Pagamento de serviço",
        Cliente: "Nome do Cliente (opcional)",
        Oportunidade: "Título da Oportunidade (opcional)",
        Projeto: "Título do Projeto (opcional)",
        Categoria: "Nome da Categoria",
        Conta: "Nome da Conta",
        Valor: 1000.0,
        "Data Vencimento": "2026-01-15",
        Status: "Pendente ou Recebido",
        "Data Pagamento": "2026-01-15 (se recebido)",
        Observações: "Observações adicionais (opcional)",
      },
    ];

    if (!XLSX) return;
    const ws = XLSX.utils.json_to_sheet(dadosModelo);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");

    const wscols = [
      { wch: 30 },
      { wch: 25 },
      { wch: 25 },
      { wch: 25 },
      { wch: 20 },
      { wch: 20 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 30 },
    ];
    ws["!cols"] = wscols;

    XLSX.writeFile(wb, "Modelo_Importacao_Receitas.xlsx");
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

        // Verificar erros de parsing
        const parserError = xmlDoc.getElementsByTagName("parsererror");
        if (parserError.length > 0) {
          alert(
            "❌ Arquivo XML mal formatado ou corrompido.\n\nO arquivo não pôde ser lido corretamente."
          );
          e.target.value = "";
          return;
        }

        // Função auxiliar para buscar tags em qualquer namespace
        const getTag = (tagName) => {
          return (
            xmlDoc.getElementsByTagName(tagName)[0] ||
            xmlDoc.getElementsByTagNameNS("*", tagName)[0]
          );
        };

        const getText = (element, tagName) => {
          if (!element) return null;
          const tag =
            element.getElementsByTagName(tagName)[0] ||
            element.getElementsByTagNameNS("*", tagName)[0];
          return tag?.textContent || null;
        };

        // DETECTAR TIPO DE NOTA
        // 1. Tentar NF-e (Nota Fiscal de Produto)
        let nfeNode = getTag("NFe") || getTag("nfeProc") || getTag("nfe");
        let infNFeNode = getTag("infNFe");

        // 2. Tentar NFS-e (Nota Fiscal de Serviço)
        let nfseNode = getTag("CompNfse") || getTag("Nfse") || getTag("nfse");
        let infNfseNode = getTag("InfNfse") || getTag("infNfse");

        // Verificar se é NF-e
        if (nfeNode || infNFeNode) {
          setImportacao({ ativo: true, total: 1, processados: 0, erros: 0 });

          const ide = getTag("ide");
          const emit = getTag("emit");
          const dest = getTag("dest");
          const ICMSTot = getTag("ICMSTot");

          // IMPORTANTE: Para receita, o DESTINATÁRIO é quem está pagando (cliente)
          const clienteNome = getText(dest, "xNome") || "Cliente Desconhecido";
          const clienteCNPJ = getText(dest, "CNPJ") || getText(dest, "CPF") || "";

          const dataEmissao = (
            getText(ide, "dhEmi") ||
            getText(ide, "dEmi") ||
            new Date().toISOString()
          ).split("T")[0];
          const numeroNFe = getText(ide, "nNF") || "S/N";
          const valorTotal = parseFloat(getText(ICMSTot, "vNF") || "0");

          if (valorTotal === 0) {
            alert("⚠️ NF-e sem valor total detectado.\n\nVerifique se o XML está completo.");
            setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
            e.target.value = "";
            return;
          }

          // Buscar ou criar cliente
          let clientesEncontrados = await sigo.entities.Cliente.filter({
            empresa_id: empresaAtiva.id,
            documento: clienteCNPJ,
          });

          let cliente;
          if (clienteCNPJ && clientesEncontrados.length === 0) {
            cliente = await sigo.entities.Cliente.create({
              empresa_id: empresaAtiva.id,
              nome_razao: clienteNome,
              documento: clienteCNPJ,
              tipo_pessoa: clienteCNPJ.length > 11 ? "PJ" : "PF",
            });
          } else if (clienteCNPJ) {
            cliente = clientesEncontrados[0];
          }

          // Criar receita
          await sigo.entities.TransacaoFinanceira.create({
            empresa_id: empresaAtiva.id,
            tipo: "receita",
            conta_id: contas[0]?.id,
            conta_nome: contas[0]?.nome,
            cliente_id: cliente?.id || null,
            cliente_nome: clienteNome,
            valor: valorTotal,
            data: dataEmissao,
            data_vencimento: dataEmissao,
            descricao: `NF-e ${numeroNFe} - ${clienteNome}`,
            status: "em_aberto",
            observacoes: `Importado de XML - NF-e ${numeroNFe}`,
          });

          setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
          alert(
            `✅ NF-e importada com sucesso!\n\nCliente: ${clienteNome}\nNúmero: ${numeroNFe}\nValor: ${formatCurrency(valorTotal)}`
          );
          onReload();
        }
        // Verificar se é NFS-e
        else if (nfseNode || infNfseNode) {
          setImportacao({ ativo: true, total: 1, processados: 0, erros: 0 });

          const infNfse = infNfseNode || nfseNode;
          const tomador = getTag("TomadorServico") || getTag("tomadorServico");
          const servico = getTag("Servico") || getTag("servico");
          const valores = getTag("Valores") || getTag("valores");

          const clienteNome =
            getText(tomador, "RazaoSocial") ||
            getText(tomador, "razaoSocial") ||
            "Cliente Desconhecido";
          const clienteCNPJ =
            getText(tomador, "Cnpj") ||
            getText(tomador, "cnpj") ||
            getText(tomador, "Cpf") ||
            getText(tomador, "cpf") ||
            "";

          const dataEmissao = (
            getText(infNfse, "DataEmissao") ||
            getText(infNfse, "dataEmissao") ||
            new Date().toISOString()
          ).split("T")[0];
          const numeroNFSe = getText(infNfse, "Numero") || getText(infNfse, "numero") || "S/N";
          const valorTotal = parseFloat(
            getText(valores, "ValorServicos") || getText(valores, "valorServicos") || "0"
          );

          if (valorTotal === 0) {
            alert("⚠️ NFS-e sem valor detectado.\n\nVerifique se o XML está completo.");
            setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
            e.target.value = "";
            return;
          }

          // Buscar ou criar cliente
          let clientesEncontrados = await sigo.entities.Cliente.filter({
            empresa_id: empresaAtiva.id,
            documento: clienteCNPJ,
          });

          let cliente;
          if (clienteCNPJ && clientesEncontrados.length === 0) {
            cliente = await sigo.entities.Cliente.create({
              empresa_id: empresaAtiva.id,
              nome_razao: clienteNome,
              documento: clienteCNPJ,
              tipo_pessoa: clienteCNPJ.length > 11 ? "PJ" : "PF",
            });
          } else if (clienteCNPJ) {
            cliente = clientesEncontrados[0];
          }

          // Criar receita
          await sigo.entities.TransacaoFinanceira.create({
            empresa_id: empresaAtiva.id,
            tipo: "receita",
            conta_id: contas[0]?.id,
            conta_nome: contas[0]?.nome,
            cliente_id: cliente?.id || null,
            cliente_nome: clienteNome,
            valor: valorTotal,
            data: dataEmissao,
            data_vencimento: dataEmissao,
            descricao: `NFS-e ${numeroNFSe} - ${clienteNome}`,
            status: "em_aberto",
            observacoes: `Importado de XML - NFS-e ${numeroNFSe}`,
          });

          setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
          alert(
            `✅ NFS-e importada com sucesso!\n\nCliente: ${clienteNome}\nNúmero: ${numeroNFSe}\nValor: ${formatCurrency(valorTotal)}`
          );
          onReload();
        } else {
          alert(
            "❌ Arquivo XML não reconhecido.\n\nFormatos aceitos:\n• NF-e (Nota Fiscal Eletrônica de Produto)\n• NFS-e (Nota Fiscal de Serviço Eletrônica)\n\nVerifique se o arquivo foi baixado corretamente da prefeitura ou SEFAZ."
          );
          e.target.value = "";
          return;
        }
      } catch (error) {
        console.error("Erro ao processar XML:", error);
        setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
        alert(
          `❌ Erro ao processar arquivo XML.\n\nDetalhes: ${error.message}\n\nVerifique se o arquivo está correto.`
        );
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
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        setImportacao({ ativo: true, total: data.length, processados: 0, erros: 0 });

        // PRÉ-CARREGAR TODOS OS DADOS
        const [todosClientes, todasOportunidades, todosProjetos, todasCategorias, todasContas] =
          await Promise.all([
            sigo.entities.Cliente.filter({ empresa_id: empresaAtiva.id }),
            sigo.entities.Oportunidade.filter({ empresa_id: empresaAtiva.id }),
            sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id }),
            sigo.entities.CategoriaFinanceira.filter({
              empresa_id: empresaAtiva.id,
              tipo: "Receita",
            }),
            sigo.entities.ContaFinanceira.filter({ empresa_id: empresaAtiva.id }),
          ]);

        // Criar mapas para busca rápida
        const clientesMap = new Map(todosClientes.map((c) => [c.nome_razao, c]));
        const oportunidadesMap = new Map(todasOportunidades.map((o) => [o.nome, o]));
        const projetosMap = new Map(todosProjetos.map((p) => [p.nome, p]));
        const categoriasMap = new Map(todasCategorias.map((c) => [c.nome, c]));
        const contasMap = new Map(todasContas.map((c) => [c.nome, c]));

        // Carregar apenas as últimas 1000 transações para verificar duplicidade (otimização)
        const transacoesExistentes = await sigo.entities.TransacaoFinanceira.filter(
          {
            empresa_id: empresaAtiva.id,
            tipo: "receita",
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

        // PROCESSAR DADOS E PREPARAR CRIAÇÕES
        for (let index = 0; index < data.length; index++) {
          const row = data[index];

          try {
            const cliente = row.Cliente ? clientesMap.get(row.Cliente) : null;
            const oportunidade = row.Oportunidade ? oportunidadesMap.get(row.Oportunidade) : null;
            const projeto = row.Projeto ? projetosMap.get(row.Projeto) : null;
            const categoria = row.Categoria ? categoriasMap.get(row.Categoria) : null;
            const conta = row.Conta ? contasMap.get(row.Conta) : null;

            if (!conta) {
              erros++;
              setImportacao((prev) => ({ ...prev, processados: index + 1, erros: prev.erros + 1 }));
              continue;
            }

            const status =
              row.Status === "Recebido"
                ? "pago"
                : row.Status === "Atrasado"
                  ? "atrasado"
                  : "em_aberto";
            const dataVencimento = parseData(row["Data Vencimento"]);
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
              tipo: "Receita",
              descricao: row["Descrição"] || "",
              cliente_id: cliente?.id || null,
              cliente_nome: cliente?.nome_razao || null,
              oportunidade_id: oportunidade?.id || null,
              oportunidade_nome: oportunidade?.nome || null,
              projeto_id: projeto?.id || null,
              projeto_nome: projeto?.nome || null,
              categoria_id: categoria?.id || null,
              categoria_nome: categoria?.nome || null,
              conta_id: conta.id,
              conta_nome: conta.nome,
              valor: valorParsed,
              data_vencimento: dataVencimento,
              data: dataVencimento,
              status: status,
              data_pagamento: dataPagamento,
              observacoes: row["Observações"] || null,
            });

            setImportacao((prev) => ({ ...prev, processados: index + 1 }));
          } catch (err) {
            erros++;
            setImportacao((prev) => ({ ...prev, processados: index + 1, erros: prev.erros + 1 }));
          }
        }

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
          alert(
            `Importação concluída!\n${importadas} receitas importadas\n${duplicadas} duplicadas ignoradas\n${erros} erros`
          );
          onReload();
        }, 500);
      } catch {
        setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
        alert("Erro ao processar arquivo Excel");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  const aplicarFiltros = (transacoes) => {
    let filtered = (transacoes || []).filter((t) => (t.tipo || "").toLowerCase() === "receita");

    // Busca
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.descricao?.toLowerCase().includes(busca) ||
          t.cliente_nome?.toLowerCase().includes(busca)
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

  const receitasFiltradas = useMemo(
    () => aplicarFiltros(transacoesIniciais),
    [transacoesIniciais, filtros]
  );

  // Paginação
  const totalPaginas = Math.ceil(receitasFiltradas.length / itensPorPagina);
  const indiceInicio = (paginaAtual - 1) * itensPorPagina;
  const indiceFim = indiceInicio + itensPorPagina;

  const receitas = useMemo(() => {
    const sorted = [...receitasFiltradas].sort((a, b) => {
      let aVal, bVal;

      if (
        sortConfig.field === "data_vencimento" ||
        sortConfig.field === "data_pagamento" ||
        sortConfig.field === "created_date"
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

    return sorted.slice(indiceInicio, indiceFim);
  }, [receitasFiltradas, sortConfig, indiceInicio, indiceFim]);

  const handleBaixarEmLote = async () => {
    if (itensSelecionados.length === 0) {
      alert("Selecione pelo menos uma receita");
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
      alert("Selecione pelo menos uma receita");
      return;
    }

    if (!confirm(`Excluir ${itensSelecionados.length} receitas selecionadas?`)) return;

    setImportacao({ ativo: true, total: itensSelecionados.length, processados: 0, erros: 0 });

    let excluidas = 0;
    let erros = 0;

    // Processar em lotes de 50
    const idsComErro = [];
    const LOTE_SIZE = 50;
    for (let i = 0; i < itensSelecionados.length; i += LOTE_SIZE) {
      const lote = itensSelecionados.slice(i, i + LOTE_SIZE);

      for (const id of lote) {
        let tentativas = 0;
        let sucesso = false;

        while (tentativas < 3 && !sucesso) {
          try {
            await sigo.entities.TransacaoFinanceira.delete(id);
            excluidas++;
            sucesso = true;
          } catch (error) {
            tentativas++;
            if (tentativas < 3) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            } else {
              console.error(`Erro ao excluir receita ${id}:`, error);
              idsComErro.push(id);
              erros++;
            }
          }
        }

        setImportacao((prev) => ({
          ...prev,
          processados: i + lote.indexOf(id) + 1,
          erros: idsComErro.length,
        }));
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Delay maior entre lotes
      if (i + LOTE_SIZE < itensSelecionados.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    setTimeout(() => {
      setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
      setItensSelecionados([]);

      if (erros > 0) {
        alert(
          `Exclusão concluída!\n${excluidas} receitas excluídas\n${erros} erros\n\nDica: Tente excluir os itens restantes novamente.`
        );
      } else {
        alert(`Exclusão concluída!\n${excluidas} receitas excluídas com sucesso!`);
      }
    }, 500);
  };

  const handleOpen = (item = null) => {
    if (item) {
      setForm({
        conta_id: item.conta_id || "",
        categoria_id: item.categoria_id || "",
        projeto_id: item.projeto_id || filtroProjetoInicial || "",
        oportunidade_id: item.oportunidade_id || "",
        cliente_id: item.cliente_id || "",
        cliente_nome: item.cliente_nome || "",
        valor: item.valor?.toString() || "",
        data_competencia: item.data || new Date().toLocaleDateString("en-CA"),
        data_vencimento: item.data_vencimento || "",
        data_pagamento: item.data_pagamento || "",
        descricao: item.descricao || "",
        status: item.status || "em_aberto",
        forma_pagamento: item.forma_pagamento || "",
        observacoes: item.observacoes || "",
      });
      setSelectedItem(item);
      // Edit de receita parcelada: o item clicado é UMA das parcelas. Ao
      // re-salvar SEM essa info, o user perdia as outras 11 parcelas. Aqui
      // detectamos pelo padrão "Parcela N/T" na descrição e desabilitamos
      // o parcelamento durante a edição (avisa que vai editar só essa parcela).
      const matchParcela = /Parcela\s+\d+\s*\/\s*\d+/i.test(item.descricao || "");
      if (matchParcela) {
        setNumeroParcelas(1);
        setParcelas([]);
      }
    } else {
      setForm({
        conta_id: contas[0]?.id || "",
        categoria_id: "",
        projeto_id: filtroProjetoInicial || "",
        oportunidade_id: "",
        cliente_id: "",
        cliente_nome: "",
        valor: "",
        data_competencia: new Date().toLocaleDateString("en-CA"),
        data_vencimento: "",
        data_pagamento: "",
        descricao: "",
        status: "em_aberto",
        forma_pagamento: "",
        observacoes: "",
      });
      // Reset parcelas/anexos no Novo (evita lixo do registro anterior)
      setNumeroParcelas(1);
      setParcelas([]);
      setAnexos([]);
      setSelectedItem(null);
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    // Validação: campos obrigatórios para o backend gravar corretamente.
    // Antes só checava valor — perdia descricao/conta/vencimento silenciosamente.
    if (!form.valor || parseFloat(form.valor) <= 0) {
      alert("Informe um valor válido.");
      return;
    }
    if (!form.conta_id) {
      alert("Selecione uma conta financeira.");
      return;
    }
    if (!form.data_vencimento) {
      alert("Informe a data de vencimento.");
      return;
    }
    if (!form.descricao || !form.descricao.trim()) {
      alert("Informe a descrição.");
      return;
    }

    setSaving(true);
    const conta = contas.find((c) => c.id === form.conta_id);
    const categoria = categorias.find((c) => c.id === form.categoria_id);
    const projeto = projetos.find((p) => p.id === form.projeto_id);
    const oportunidade = oportunidades.find((o) => o.id === form.oportunidade_id);
    const cliente = clientes.find((c) => c.id === form.cliente_id);

    const dataBase = {
      empresa_id: empresaAtiva.id,
      tipo: "receita",
      conta_id: form.conta_id,
      conta_nome: conta?.nome,
      categoria_id: form.categoria_id || null,
      categoria_nome: categoria?.nome || null,
      projeto_id: form.projeto_id || filtroProjetoInicial || null,
      projeto_nome: projeto?.nome || null,
      oportunidade_id: form.oportunidade_id || null,
      oportunidade_nome: oportunidade?.nome || null,
      cliente_id: form.cliente_id || null,
      cliente_nome: form.cliente_nome || cliente?.nome_razao || null,
      valor: parseFloat(form.valor) || 0,
      data_vencimento: form.data_vencimento,
      data: form.data_competencia || form.data_vencimento,
      data_pagamento: form.data_pagamento || null,
      descricao: form.descricao,
      status: form.status,
      forma_pagamento: form.forma_pagamento || null,
      tipo_receita: tipoReceita,
      anexos: JSON.stringify(anexos),
      observacoes: form.observacoes || null,
    };

    try {
      if (numeroParcelas > 1 && parcelas.length > 0) {
        // Criar uma transação para cada parcela
        for (const parcela of parcelas) {
          await sigo.entities.TransacaoFinanceira.create({
            ...dataBase,
            valor: parcela.valor,
            data_vencimento: parcela.data_vencimento,
            status: parcela.status,
            descricao: `${form.descricao} - Parcela ${parcela.numero}/${parcelas.length}`,
          });
        }
      } else {
        if (selectedItem) {
          await sigo.entities.TransacaoFinanceira.update(selectedItem.id, dataBase);
        } else {
          await sigo.entities.TransacaoFinanceira.create(dataBase);
        }
      }

      // Reset só se gravou com sucesso
      setShowModal(false);
      setNumeroParcelas(1);
      setParcelas([]);
      setAnexos([]);
      setTipoReceita("servico");
      onReload();
    } catch (err) {
      console.error("[ReceitasTab] erro ao salvar:", err);
      alert("❌ Erro ao salvar receita: " + (err?.message || "desconhecido"));
      // NÃO fechar o modal — usuário pode corrigir e tentar de novo
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir esta receita?")) return;
    try {
      // Cascade: remove lançamentos de extrato vinculados antes de excluir a transação
      // (evita órfãos no ExtratoBancario que afetam o saldo da conta).
      const extratos = await sigo.entities.ExtratoBancario.filter({
        empresa_id: empresaAtiva.id,
        transacao_id: id,
      });
      await Promise.allSettled(
        (extratos || []).map((e) => sigo.entities.ExtratoBancario.delete(e.id))
      );

      await sigo.entities.TransacaoFinanceira.delete(id);
      onReload();
    } catch (err) {
      console.error("[ReceitasTab] erro ao excluir:", err);
      alert("❌ Erro ao excluir: " + (err?.message || "desconhecido"));
      // Não chama onReload se falhou — registro continua na lista
    }
  };

  // Set de ids sendo togglados — bloqueia clique duplo que criava 2 ExtratoBancario.
  // useState ficaria mais idiomático mas como precisamos de Set mutável referenciável
  // entre cliques rápidos, usamos useRef através de um state-set.
  const handleToggleStatus = async (item) => {
    if (togglingIds.has(item.id)) return; // já está em processamento
    setTogglingIds((s) => new Set(s).add(item.id));

    const isPagoAtual = String(item.status || "").toLowerCase();
    const eraPago = isPagoAtual === "pago" || isPagoAtual === "realizado";
    const newStatus = eraPago ? "em_aberto" : "pago";

    try {
      await sigo.entities.TransacaoFinanceira.update(item.id, {
        status: newStatus,
        data_pagamento: newStatus === "pago" ? new Date().toISOString().split("T")[0] : null,
      });

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
            valor: Math.abs(item.valor),
            tipo: "credito",
            categoria: item.categoria_nome || "Receita",
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
      console.error("[ReceitasTab] erro toggle status:", err);
      alert("❌ Erro ao atualizar status: " + (err?.message || "desconhecido"));
    } finally {
      setTogglingIds((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
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
        titulo="Importando receitas..."
      />

      {/* Cards de Resumo */}
      <CardsResumo transacoes={receitasFiltradas} tipo="receitas" />

      {/* Filtros */}
      <FiltroRapido
        filtros={filtros}
        onFiltrosChange={setFiltros}
        categorias={categorias.filter((c) => c.tipo === "Receita")}
        projetos={projetos}
        contas={contas}
        tipo="receitas"
      />

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-800">
              Receitas ({receitasFiltradas.length})
            </h2>
          </div>
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
          <SortButton
            sortOptions={[
              { label: "Data Vencimento", value: "data_vencimento", defaultDirection: "desc" },
              { label: "Data Pagamento", value: "data_pagamento", defaultDirection: "desc" },
              { label: "Valor", value: "valor", defaultDirection: "desc" },
              { label: "Descrição", value: "descricao", defaultDirection: "asc" },
              { label: "Cliente", value: "cliente_nome", defaultDirection: "asc" },
            ]}
            currentSort={sortConfig}
            onSortChange={setSortConfig}
          />
          <Button onClick={() => handleOpen()} className="gap-2 bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4" />
            Nova Receita
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
              <DropdownMenuItem onClick={() => document.getElementById("importar-excel").click()}>
                <Upload className="w-4 h-4 mr-2" />
                Importar Excel
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => document.getElementById("importar-xml-receitas")?.click()}
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
        </div>
      </div>
      <input
        type="file"
        id="importar-excel"
        accept=".xlsx,.xls"
        onChange={handleImportarExcel}
        className="hidden"
      />
      <input
        type="file"
        id="importar-xml-receitas"
        accept=".xml"
        onChange={handleImportarXML}
        className="hidden"
      />

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead className="bg-slate-100 border-b group">
            <tr>
              <th className="w-12 px-4 py-3">
                <Checkbox
                  checked={itensSelecionados.length === receitas.length && receitas.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setItensSelecionados(receitas.map((r) => r.id));
                    } else {
                      setItensSelecionados([]);
                    }
                  }}
                />
              </th>
              <SortableTableHeader
                field="descricao"
                label="Descrição"
                currentSort={sortConfig}
                onSortChange={setSortConfig}
              />
              <SortableTableHeader
                field="cliente_nome"
                label="Cliente"
                currentSort={sortConfig}
                onSortChange={setSortConfig}
              />
              <SortableTableHeader
                field="categoria_nome"
                label="Categoria"
                currentSort={sortConfig}
                onSortChange={setSortConfig}
              />
              <SortableTableHeader
                field="data_vencimento"
                label="Vencimento"
                currentSort={sortConfig}
                onSortChange={setSortConfig}
              />
              <SortableTableHeader
                field="valor"
                label="Valor"
                currentSort={sortConfig}
                onSortChange={setSortConfig}
                align="right"
              />
              <SortableTableHeader
                field="status"
                label="Status"
                currentSort={sortConfig}
                onSortChange={setSortConfig}
              />
              <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Ações</th>
            </tr>
          </thead>
          <tbody>
            {receitas.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-4 py-8 text-center text-slate-500">
                  Nenhuma receita encontrada
                </td>
              </tr>
            ) : (
              receitas.map((r) => (
                <tr
                  key={r.id}
                  className="border-b hover:bg-slate-50 cursor-pointer"
                  onClick={() => {
                    setReceitaDetalhes(r);
                    setShowDetalhes(true);
                  }}
                >
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={itensSelecionados.includes(r.id)}
                      onCheckedChange={(checked, event) => {
                        // Seleção em lote com Shift
                        if (event?.nativeEvent?.shiftKey && ultimoItemClicado) {
                          const todasReceitas = [...receitasFiltradas].sort((a, b) => {
                            let aVal, bVal;
                            if (
                              sortConfig.field === "data_vencimento" ||
                              sortConfig.field === "data_pagamento" ||
                              sortConfig.field === "created_date"
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
                          const indiceUltimo = todasReceitas.findIndex(
                            (item) => item.id === ultimoItemClicado
                          );
                          const indiceAtual = todasReceitas.findIndex((item) => item.id === r.id);
                          const inicio = Math.min(indiceUltimo, indiceAtual);
                          const fim = Math.max(indiceUltimo, indiceAtual);
                          const idsNoIntervalo = todasReceitas
                            .slice(inicio, fim + 1)
                            .map((item) => item.id);
                          setItensSelecionados([
                            ...new Set([...itensSelecionados, ...idsNoIntervalo]),
                          ]);
                        } else {
                          if (checked) {
                            setItensSelecionados([...itensSelecionados, r.id]);
                          } else {
                            setItensSelecionados(itensSelecionados.filter((id) => id !== r.id));
                          }
                        }
                        setUltimoItemClicado(r.id);
                      }}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm">{r.descricao || "-"}</td>
                  <td className="px-4 py-3 text-sm">{r.cliente_nome || "-"}</td>
                  <td className="px-4 py-3 text-sm">
                    {r.categoria_nome && (
                      <Badge variant="outline" className="text-xs">
                        {r.categoria_nome}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.data_vencimento
                      ? new Date(r.data_vencimento).toLocaleDateString("pt-BR")
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-green-600">
                    {formatCurrency(r.valor)}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Badge
                      className={
                        r.status === "pago" || r.status === "Pago"
                          ? "bg-green-100 text-green-700 cursor-pointer"
                          : "bg-blue-100 text-blue-700 cursor-pointer"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStatus(r);
                      }}
                    >
                      {r.status === "pago" || r.status === "Pago" ? "Recebido" : "Em aberto"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpen(r)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDelete(r.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
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
        <div className="flex items-center justify-between px-4 py-3 border rounded-lg bg-white">
          <div className="text-sm text-slate-600">
            Mostrando {indiceInicio + 1} a {Math.min(indiceFim, receitasFiltradas.length)} de{" "}
            {receitasFiltradas.length} receitas
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

      <Sheet open={showModal} onOpenChange={setShowModal}>
        <SheetContent
          side="right"
          className="h-full overflow-y-auto p-0 flex flex-col lg:!inset-[auto_0_0_256px] lg:!w-[calc(100%-256px)] lg:!max-w-none"
          data-fullscreen-modal
        >
          <SheetHeader>
            <SheetTitle>{selectedItem ? "Editar Receita" : "Nova Receita"}</SheetTitle>
            <p className="text-sm text-slate-500">Registre uma nova receita do sistema</p>
          </SheetHeader>

          <label
            htmlFor="importar-xml-modal"
            className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-center gap-2 my-4 cursor-pointer hover:bg-blue-100 transition-colors"
          >
            <Upload className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-blue-700 font-medium">Importar XML ou NF-e</span>
          </label>
          <input
            type="file"
            id="importar-xml-modal"
            accept=".xml"
            onChange={handleImportarXML}
            className="hidden"
          />

          <div className="space-y-6 py-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase mb-4">
                Informações da Receita
              </h3>

              <div className="space-y-4">
                <div>
                  <Label>Descrição *</Label>
                  <Input
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    placeholder="Ex: Pagamento da obra X"
                    className="mt-1.5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Valor (R$) *</Label>
                    <Input
                      type="number"
                      value={form.valor}
                      onChange={(e) => setForm({ ...form, valor: e.target.value })}
                      placeholder="0,00"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Conta *</Label>
                    <Select
                      value={form.conta_id}
                      onValueChange={(v) => setForm({ ...form, conta_id: v })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Digite para buscar conta..." />
                      </SelectTrigger>
                      <SelectContent>
                        {contas.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Categoria</Label>
                    <Popover open={openCategoria} onOpenChange={setOpenCategoria}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between mt-1.5">
                          {categoriaSelecionada?.nome || "Selecione a categoria"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Buscar categoria..."
                            value={searchCategoria}
                            onValueChange={setSearchCategoria}
                          />
                          <CommandList>
                            <CommandEmpty>Nenhuma categoria encontrada</CommandEmpty>
                            <CommandGroup>
                              {categoriasFiltradas.map((c) => (
                                <CommandItem
                                  key={c.id}
                                  value={c.nome}
                                  onSelect={() => {
                                    setForm({
                                      ...form,
                                      categoria_id: c.id,
                                      categoria_nome: c.nome,
                                    });
                                    setOpenCategoria(false);
                                    setSearchCategoria("");
                                  }}
                                >
                                  {c.nome}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label>Centro de Custo</Label>
                    <div className="flex gap-2 mt-1.5">
                      <Popover open={openCentroCusto} onOpenChange={setOpenCentroCusto}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            {centroCustoSelecionado?.nome || "Selecione o centro de custo"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start">
                          <Command>
                            <CommandInput
                              placeholder="Buscar centro de custo..."
                              value={searchCentroCusto}
                              onValueChange={setSearchCentroCusto}
                            />
                            <CommandList>
                              <CommandEmpty>Nenhum centro de custo encontrado</CommandEmpty>
                              <CommandGroup>
                                {centrosCustoFiltrados.map((c) => (
                                  <CommandItem
                                    key={c.id}
                                    value={c.nome}
                                    onSelect={() => {
                                      setForm({ ...form, centro_custo_id: c.id });
                                      setOpenCentroCusto(false);
                                      setSearchCentroCusto("");
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-medium">{c.nome}</span>
                                      {c.codigo && (
                                        <span className="text-xs text-slate-500">{c.codigo}</span>
                                      )}
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <Button
                        size="icon"
                        className="bg-green-600 hover:bg-green-700 shrink-0"
                        onClick={() => setShowNovoCentroCusto(true)}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Cliente</Label>
                  <div className="flex gap-2 mt-1.5">
                    <Popover open={openCliente} onOpenChange={setOpenCliente}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          {clienteSelecionado?.nome_razao || "Selecione o cliente"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Buscar cliente..."
                            value={searchCliente}
                            onValueChange={setSearchCliente}
                          />
                          <CommandList>
                            <CommandEmpty>Nenhum cliente encontrado</CommandEmpty>
                            <CommandGroup>
                              {clientesFiltrados.map((c) => (
                                <CommandItem
                                  key={c.id}
                                  value={c.nome_razao}
                                  onSelect={() => {
                                    setForm({
                                      ...form,
                                      cliente_id: c.id,
                                      cliente_nome: c.nome_razao,
                                    });
                                    setOpenCliente(false);
                                    setSearchCliente("");
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{c.nome_razao}</span>
                                    {c.documento && (
                                      <span className="text-xs text-slate-500">{c.documento}</span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Button
                      size="icon"
                      className="bg-green-600 hover:bg-green-700 shrink-0"
                      onClick={() => setShowNovoCliente(true)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Oportunidade</Label>
                    <Select
                      value={form.oportunidade_id || ""}
                      onValueChange={(v) => setForm({ ...form, oportunidade_id: v })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>Nenhuma</SelectItem>
                        {oportunidades.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Projeto</Label>
                    <Select
                      value={form.projeto_id || ""}
                      onValueChange={(v) => setForm({ ...form, projeto_id: v })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>Nenhum</SelectItem>
                        {projetos.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Data de Competência</Label>
                    <Input
                      type="date"
                      value={form.data_competencia || ""}
                      onChange={(e) => setForm({ ...form, data_competencia: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Data de Vencimento *</Label>
                    <Input
                      type="date"
                      value={form.data_vencimento}
                      onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Data de Recebimento</Label>
                    <Input
                      type="date"
                      value={form.data_pagamento || ""}
                      onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Status *</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) => setForm({ ...form, status: v })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="em_aberto">Pendente</SelectItem>
                        <SelectItem value="pago">Recebido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Forma de Recebimento</Label>
                    <Select
                      value={form.forma_pagamento || ""}
                      onValueChange={(v) => setForm({ ...form, forma_pagamento: v })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>Nenhuma</SelectItem>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tipo de Receita</Label>
                    <Select value={tipoReceita} onValueChange={setTipoReceita}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="servico">Serviço</SelectItem>
                        <SelectItem value="material">Material (Entrada Estoque)</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Número de Parcelas</Label>
                    <Input
                      type="number"
                      value={numeroParcelas}
                      onChange={(e) => handleNumeroParcelasChange(parseInt(e.target.value) || 1)}
                      min="1"
                      className="mt-1.5"
                    />
                  </div>
                </div>

                {numeroParcelas > 1 && parcelas.length > 0 && (
                  <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-semibold">Gerenciar Parcelas</Label>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="w-3 h-3" />
                          {parcelas.filter((p) => p.status === "pago").length} Recebidas
                        </span>
                        <span className="flex items-center gap-1 text-orange-600">
                          <Clock className="w-3 h-3" />
                          {parcelas.filter((p) => p.status === "em_aberto").length} Pendentes
                        </span>
                        <span className="text-slate-600 font-semibold">
                          Total:{" "}
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(
                            parcelas.reduce((acc, p) => acc + (parseFloat(p.valor) || 0), 0)
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {parcelas.map((parcela, index) => (
                        <div
                          key={index}
                          className={`grid grid-cols-12 gap-3 p-3 rounded-lg border-2 transition-all ${
                            parcela.status === "pago"
                              ? "bg-green-50 border-green-200"
                              : "bg-white border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="col-span-2 flex items-center">
                            <div className="flex flex-col">
                              <Label className="text-xs text-slate-500 mb-1">Parcela</Label>
                              <div className="flex items-center gap-2">
                                {parcela.status === "pago" ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                                ) : (
                                  <Clock className="w-4 h-4 text-orange-500" />
                                )}
                                <span className="text-sm font-bold">
                                  {parcela.numero}/{parcelas.length}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="col-span-3">
                            <Label className="text-xs text-slate-500">Vencimento</Label>
                            <Input
                              type="date"
                              value={parcela.data_vencimento}
                              onChange={(e) => {
                                const novasParcelas = [...parcelas];
                                novasParcelas[index].data_vencimento = e.target.value;
                                setParcelas(novasParcelas);
                              }}
                              className="h-9 text-sm mt-1"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs text-slate-500">Valor</Label>
                            <Input
                              type="number"
                              value={parcela.valor}
                              onChange={(e) => {
                                const novasParcelas = [...parcelas];
                                novasParcelas[index].valor = parseFloat(e.target.value) || 0;
                                setParcelas(novasParcelas);
                              }}
                              className="h-9 text-sm mt-1"
                              step="0.01"
                            />
                          </div>
                          <div className="col-span-3">
                            <Label className="text-xs text-slate-500">Data Recebimento</Label>
                            <Input
                              type="date"
                              value={parcela.data_pagamento || ""}
                              onChange={(e) => {
                                const novasParcelas = [...parcelas];
                                novasParcelas[index].data_pagamento = e.target.value;
                                setParcelas(novasParcelas);
                              }}
                              className="h-9 text-sm mt-1"
                              disabled={parcela.status !== "pago"}
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs text-slate-500">Status</Label>
                            <Select
                              value={parcela.status}
                              onValueChange={(v) => {
                                const novasParcelas = [...parcelas];
                                novasParcelas[index].status = v;
                                if (v === "pago" && !novasParcelas[index].data_pagamento) {
                                  novasParcelas[index].data_pagamento = new Date()
                                    .toISOString()
                                    .split("T")[0];
                                }
                                setParcelas(novasParcelas);
                              }}
                            >
                              <SelectTrigger className="h-9 text-sm mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="em_aberto">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-3 h-3 text-orange-500" />
                                    Pendente
                                  </div>
                                </SelectItem>
                                <SelectItem value="pago">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                                    Recebido
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label>Anexos (Recibo, NF, Comprovante)</Label>
                  <div className="mt-1.5 space-y-2">
                    <div className="border-2 border-dashed rounded-lg p-4 text-center">
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png,.xml"
                        onChange={handleAnexoUpload}
                        className="hidden"
                        id="anexo-upload"
                      />
                      <label htmlFor="anexo-upload" className="cursor-pointer">
                        <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                        <p className="text-sm text-slate-600">Clique para anexar arquivos</p>
                        <p className="text-xs text-slate-400">PDF, XML, JPG, PNG</p>
                      </label>
                    </div>
                    {anexos.length > 0 && (
                      <div className="space-y-1">
                        {anexos.map((anexo, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-slate-50 rounded"
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-slate-400" />
                              <span className="text-sm text-slate-700">{anexo.nome}</span>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setAnexoSelecionado(anexo);
                                  setShowAnexoViewer(true);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoverAnexo(index)}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label>Observação</Label>
                  <Textarea
                    placeholder="Observações adicionais..."
                    className="mt-1.5"
                    rows={3}
                    value={form.observacoes || ""}
                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => {
                // Reset completo no Cancelar: antes só fechava o modal e
                // estados auxiliares (anexos, parcelas, selectedItem)
                // persistiam — podia vazar pra outro fluxo se o usuário
                // abrir Novo logo em seguida e algo lesse esse estado
                // antes do handleOpen reescrever.
                setShowModal(false);
                setSelectedItem(null);
                setAnexos([]);
                setParcelas([]);
                setNumeroParcelas(1);
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !form.valor ||
                !form.conta_id ||
                !form.data_vencimento ||
                !form.descricao?.trim()
              }
              className="bg-green-600 hover:bg-green-700"
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal Novo Cliente - via portal para z-index correto */}
      {showNovoCliente &&
        createPortal(
          <NovoClienteModal
            open={showNovoCliente}
            onOpenChange={setShowNovoCliente}
            empresaAtiva={empresaAtiva}
            onClienteCriado={(cliente) => {
              setClientesLocais((prev) => [...prev, cliente]);
              setForm((prev) => ({
                ...prev,
                cliente_id: cliente.id,
                cliente_nome: cliente.nome_razao,
              }));
              onReload();
            }}
          />,
          document.body
        )}

      {/* Modal Novo Centro de Custo */}
      <Sheet open={showNovoCentroCusto} onOpenChange={setShowNovoCentroCusto}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Novo Centro de Custo</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={novoCentroCusto.nome}
                onChange={(e) => setNovoCentroCusto({ ...novoCentroCusto, nome: e.target.value })}
                placeholder="Nome do centro de custo"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Código</Label>
              <Input
                value={novoCentroCusto.codigo}
                onChange={(e) => setNovoCentroCusto({ ...novoCentroCusto, codigo: e.target.value })}
                placeholder="Código do centro"
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowNovoCentroCusto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarCentroCusto} disabled={!novoCentroCusto.nome}>
              Salvar Centro de Custo
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AnexoViewer
        anexo={anexoSelecionado}
        open={showAnexoViewer}
        onOpenChange={setShowAnexoViewer}
      />

      <DetalheReceitaModal
        open={showDetalhes}
        onOpenChange={setShowDetalhes}
        receita={receitaDetalhes}
        podeEditar={true}
        empresaAtiva={empresaAtiva}
        onEditar={(r) => {
          setShowDetalhes(false);
          handleOpen(r);
        }}
        onBaixar={handleToggleStatus}
      />
    </div>
  );
}
