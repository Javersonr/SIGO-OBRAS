import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Upload,
  Plus,
  Calendar,
  Trash2,
  FileText,
  CheckCircle2,
  Clock,
  Copy,
  Link2Off,
  X,
} from "lucide-react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AssociarMateriaisModal from "./AssociarMateriaisModal";
import NovoFornecedorConfigSheet from "../fornecedores/NovoFornecedorConfigSheet";
import ModalPagamento from "./ModalPagamento";
import ImportarFerramentasModal from "./ImportarFerramentasModal";

function DraggableComprovante({ url, onFechar }) {
  const [pos, setPos] = useState({ x: window.innerWidth - 440, y: window.innerHeight - 520 });
  const [size, setSize] = useState({ w: 420, h: 480 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef(null);

  const onMouseDownDrag = useCallback(
    (e) => {
      dragging.current = true;
      dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      e.preventDefault();
    },
    [pos]
  );

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const nx = Math.max(
        0,
        Math.min(window.innerWidth - size.w, e.clientX - dragOffset.current.x)
      );
      const ny = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y));
      setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [size]);

  const isPdf = url.toLowerCase().includes(".pdf") || url.toLowerCase().includes("pdf");

  return (
    <div
      ref={panelRef}
      className="fixed z-[99999] bg-white border border-slate-300 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        minWidth: 280,
        minHeight: 200,
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 bg-slate-800 text-white cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onMouseDownDrag}
      >
        <span className="text-xs font-medium truncate">⠿ Comprovante</span>
        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={onFechar} className="ml-1 hover:text-red-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        {isPdf ? (
          <iframe
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
            className="w-full border-0"
            style={{ height: "100%" }}
            title="Comprovante PDF"
          />
        ) : (
          <img src={url} alt="Comprovante" className="w-full h-auto object-contain" />
        )}
      </div>

      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        style={{ background: "transparent" }}
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX,
            startY = e.clientY;
          const startW = size.w,
            startH = size.h;
          const onMove = (ev) => {
            setSize({
              w: Math.max(280, startW + ev.clientX - startX),
              h: Math.max(200, startH + ev.clientY - startY),
            });
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className="absolute bottom-1 right-1 text-slate-400"
        >
          <path
            d="M13 1 L1 13 M13 7 L7 13 M13 13 L13 13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

export default function DespesaModal({
  showModal,
  setShowModal,
  selectedItem,
  form,
  setForm,
  contas,
  categorias,
  fornecedores,
  projetos,
  oportunidades,
  tipoDespesa,
  setTipoDespesa,
  numeroParcelas,
  handleNumeroParcelasChange,
  parcelas,
  setParcelas,
  anexos,
  handleAnexoUpload,
  handleRemoverAnexo,
  handleSave,
  empresaAtiva,
  onReload,
  onEmitirRecibo,
  onDuplicar,
  onDesfazerConciliacao,
  podeEditar,
}) {
  const [notaFiscal, setNotaFiscal] = useState({
    numero: "",
    dataEmissao: "",
    dataEntrada: "",
    valorNota: "",
    statusAprovacao: "pendente",
  });
  const [itensNota, setItensNota] = useState([]);
  const [permitirParcelamento, setPermitirParcelamento] = useState(false);
  const [mostrarParcelas, setMostrarParcelas] = useState(false);
  const [showAssociarMateriais, setShowAssociarMateriais] = useState(false);
  const [showLancamentoManual, setShowLancamentoManual] = useState(false);
  const [itemManual, setItemManual] = useState({
    descricao: "",
    codigo: "",
    unidade: "UN",
    quantidade: 0,
    valor_unitario: 0,
  });
  const [openFornecedor, setOpenFornecedor] = useState(false);
  const [searchFornecedor, setSearchFornecedor] = useState("");
  const [openCategoria, setOpenCategoria] = useState(false);
  const [searchCategoria, setSearchCategoria] = useState("");
  const [openCentroCusto, setOpenCentroCusto] = useState(false);
  const [searchCentroCusto, setSearchCentroCusto] = useState("");
  const [openProjeto, setOpenProjeto] = useState(false);
  const [searchProjeto, setSearchProjeto] = useState("");
  const [showNovoFornecedor, setShowNovoFornecedor] = useState(false);
  const [fornecedoresLocais, setFornecedoresLocais] = useState(fornecedores);

  useEffect(() => {
    setFornecedoresLocais(fornecedores);
  }, [fornecedores]);
  const [showNovoCentroCusto, setShowNovoCentroCusto] = useState(false);
  const [novoCentroCusto, setNovoCentroCusto] = useState({ nome: "", codigo: "" });
  const [centrosCusto, setCentrosCusto] = useState([]);
  const [showModalPagamento, setShowModalPagamento] = useState(false);
  const [despesaPagamento, setDespesaPagamento] = useState(null);
  const [showImportarFerramentas, setShowImportarFerramentas] = useState(false);
  const [visualizandoAnexoUrl, setVisualizandoAnexoUrl] = useState(null);

  const handleImportarXML = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      await sigo.integrations.Core.UploadFile({ file }); // upload registra comprovante
      // Processar o XML localmente para extrair dados
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const xmlText = event.target.result;
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "text/xml");

          // Extrair dados da nota fiscal
          const nfeProc =
            xmlDoc.getElementsByTagName("nfeProc")[0] || xmlDoc.getElementsByTagName("NFe")[0];
          const infNFe = nfeProc?.getElementsByTagName("infNFe")[0];
          const ide = infNFe?.getElementsByTagName("ide")[0];
          const emit = infNFe?.getElementsByTagName("emit")[0];
          const total = infNFe?.getElementsByTagName("total")[0];
          const ICMSTot = total?.getElementsByTagName("ICMSTot")[0];

          // Preencher dados da nota
          const numeroNota = ide?.getElementsByTagName("nNF")[0]?.textContent || "";
          const dataEmissao =
            ide?.getElementsByTagName("dhEmi")[0]?.textContent?.split("T")[0] || "";
          const valorTotal = ICMSTot?.getElementsByTagName("vNF")[0]?.textContent || "";
          const cnpjFornecedor = emit?.getElementsByTagName("CNPJ")[0]?.textContent || "";
          const nomeFornecedor = emit?.getElementsByTagName("xNome")[0]?.textContent || "";

          // Buscar fornecedor no sistema
          const fornecedorEncontrado = fornecedores.find(
            (f) => f.cnpj?.replace(/\D/g, "") === cnpjFornecedor.replace(/\D/g, "")
          );

          // Extrair chave NF-e (44 dígitos)
          const protNFe = xmlDoc.getElementsByTagName("protNFe")[0];
          const infProt = protNFe?.getElementsByTagName("infProt")[0];
          const chaveNFe =
            infProt?.getElementsByTagName("chNFe")[0]?.textContent ||
            infNFe?.getAttribute("Id")?.replace("NFe", "") ||
            "";

          // Extrair endereço do emitente para devolução futura
          const enderEmit = emit?.getElementsByTagName("enderEmit")[0];
          const ieEmit = emit?.getElementsByTagName("IE")[0]?.textContent || "";
          const enderecoEmit = {
            cnpj: cnpjFornecedor,
            nome: nomeFornecedor,
            ie: ieEmit,
            logradouro: enderEmit?.getElementsByTagName("xLgr")[0]?.textContent || "",
            numero: enderEmit?.getElementsByTagName("nro")[0]?.textContent || "",
            bairro: enderEmit?.getElementsByTagName("xBairro")[0]?.textContent || "",
            municipio: enderEmit?.getElementsByTagName("xMun")[0]?.textContent || "",
            uf: enderEmit?.getElementsByTagName("UF")[0]?.textContent || "",
            cep: enderEmit?.getElementsByTagName("CEP")[0]?.textContent || "",
          };

          // Salvar dados do emitente para uso na devolução
          sessionStorage.setItem(
            `nfe_emit_${chaveNFe || numeroNota}`,
            JSON.stringify(enderecoEmit)
          );

          // Atualizar form com dados da nota
          setNotaFiscal({
            numero: numeroNota,
            dataEmissao: dataEmissao,
            dataEntrada: new Date().toISOString().split("T")[0],
            valorNota: valorTotal,
            statusAprovacao: "pendente",
          });

          setForm((prev) => ({
            ...prev,
            valor: valorTotal,
            fornecedor_id: fornecedorEncontrado?.id || "",
            descricao: `Nota Fiscal ${numeroNota} - ${nomeFornecedor}`,
            numero_documento: chaveNFe || numeroNota,
          }));

          // Extrair itens da nota
          const det = infNFe?.getElementsByTagName("det");
          const itens = [];

          if (det) {
            for (let i = 0; i < det.length; i++) {
              const prod = det[i].getElementsByTagName("prod")[0];
              const item = {
                descricao: prod?.getElementsByTagName("xProd")[0]?.textContent || "",
                codigo: prod?.getElementsByTagName("cProd")[0]?.textContent || "",
                unidade: prod?.getElementsByTagName("uCom")[0]?.textContent || "UN",
                quantidade: parseFloat(prod?.getElementsByTagName("qCom")[0]?.textContent || 0),
                valor_unitario: parseFloat(
                  prod?.getElementsByTagName("vUnCom")[0]?.textContent || 0
                ),
                valor_total: parseFloat(prod?.getElementsByTagName("vProd")[0]?.textContent || 0),
              };
              itens.push(item);
            }
          }

          setItensNota(itens);

          // Adicionar anexo
          handleAnexoUpload({ target: { files: [file] } });

          // Se for material e tiver itens, abrir modal de associação
          if (itens.length > 0) {
            setTipoDespesa("material");
            setShowAssociarMateriais(true);
          }

          alert("Nota fiscal importada com sucesso!");
        } catch {
          alert("Erro ao processar XML da nota fiscal. Verifique o arquivo.");
        }
      };

      reader.readAsText(file);
    } catch {
      alert("Erro ao importar nota fiscal");
    }
  };

  useEffect(() => {
    if (selectedItem?.parcelado && selectedItem?.parcelas) {
      const parcelasData = safeParseJSON(selectedItem.parcelas, []);
      if (Array.isArray(parcelasData) && parcelasData.length > 0) {
        setPermitirParcelamento(true);
        setMostrarParcelas(true);
      }
    } else {
      setPermitirParcelamento(false);
      setMostrarParcelas(false);
    }
  }, [selectedItem]);

  const toggleParcelamento = (checked) => {
    setPermitirParcelamento(checked);
    if (!checked) {
      handleNumeroParcelasChange(1);
      setMostrarParcelas(false);
    } else {
      if (form.valor && form.data_vencimento) {
        const numParcelas = numeroParcelas > 1 ? numeroParcelas : 2;
        handleNumeroParcelasChange(numParcelas);
        setMostrarParcelas(true);
      }
    }
  };

  useEffect(() => {
    if (empresaAtiva?.id) {
      sigo.entities.CentroCusto.filter({ empresa_id: empresaAtiva.id }).then(setCentrosCusto);
    }
  }, [empresaAtiva?.id]);

  const fornecedoresOrdenados = useMemo(() => {
    return [...fornecedoresLocais].sort((a, b) =>
      (a.nome_razao || "").localeCompare(b.nome_razao || "")
    );
  }, [fornecedoresLocais]);

  const fornecedoresFiltrados = useMemo(() => {
    if (!searchFornecedor) return fornecedoresOrdenados;
    return fornecedoresOrdenados.filter(
      (f) =>
        f.nome_razao?.toLowerCase().includes(searchFornecedor.toLowerCase()) ||
        f.cnpj?.includes(searchFornecedor)
    );
  }, [fornecedoresOrdenados, searchFornecedor]);

  const handleSalvarCentroCusto = async () => {
    if (!novoCentroCusto.nome.trim()) {
      alert("Por favor, preencha o nome do centro de custo");
      return;
    }

    try {
      const centroCusto = await sigo.entities.CentroCusto.create({
        empresa_id: empresaAtiva.id,
        ...novoCentroCusto,
        ativo: true,
      });

      const centros = await sigo.entities.CentroCusto.filter({ empresa_id: empresaAtiva.id });
      setCentrosCusto(centros);
      setForm({ ...form, centro_custo_id: centroCusto.id, centro_custo_nome: centroCusto.nome });
      setShowNovoCentroCusto(false);
      setNovoCentroCusto({ nome: "", codigo: "" });

      alert("Centro de custo criado com sucesso!");
    } catch {
      alert("Erro ao criar centro de custo. Tente novamente.");
    }
  };

  const fornecedorSelecionado = fornecedoresLocais.find((f) => f.id === form.fornecedor_id);
  const categoriaSelecionada = categorias.find((c) => c.id === form.categoria_id);
  const centroCustoSelecionado = centrosCusto.find((c) => c.id === form.centro_custo_id);
  const projetoSelecionado = projetos.find((p) => p.id === form.projeto_id);

  const categoriasOrdenadas = useMemo(() => {
    return [...categorias]
      .filter((c) => c.tipo === "Despesa")
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  }, [categorias]);

  const categoriasFiltradas = useMemo(() => {
    if (!searchCategoria) return categoriasOrdenadas;
    return categoriasOrdenadas.filter((c) =>
      c.nome?.toLowerCase().includes(searchCategoria.toLowerCase())
    );
  }, [categoriasOrdenadas, searchCategoria]);

  const centrosCustoOrdenados = useMemo(() => {
    return [...centrosCusto].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  }, [centrosCusto]);

  const centrosCustoFiltrados = useMemo(() => {
    if (!searchCentroCusto) return centrosCustoOrdenados;
    return centrosCustoOrdenados.filter(
      (c) =>
        c.nome?.toLowerCase().includes(searchCentroCusto.toLowerCase()) ||
        c.codigo?.includes(searchCentroCusto)
    );
  }, [centrosCustoOrdenados, searchCentroCusto]);

  const contasOrdenadas = useMemo(() => {
    return [...contas].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  }, [contas]);

  const projetosOrdenados = useMemo(() => {
    return [...projetos].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  }, [projetos]);

  const projetosFiltrados = useMemo(() => {
    if (!searchProjeto) return projetosOrdenados;
    return projetosOrdenados.filter((p) =>
      p.nome?.toLowerCase().includes(searchProjeto.toLowerCase())
    );
  }, [projetosOrdenados, searchProjeto]);

  return (
    <>
      <Sheet
        open={showModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowModal(false);
            setVisualizandoAnexoUrl(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="h-full overflow-y-auto p-0 flex flex-col lg:!inset-[auto_0_0_256px] lg:!w-[calc(100%-256px)] lg:!max-w-none"
          data-fullscreen-modal
        >
          <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
            <SheetHeader className="flex-1">
              <SheetTitle>{selectedItem ? "Editar Despesa" : "Nova Despesa"}</SheetTitle>
              <p className="text-sm text-slate-500">Registre uma nova despesa do sistema</p>
            </SheetHeader>
            <button
              onClick={() => setShowModal(false)}
              className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <div className="p-6 flex-1 overflow-y-auto">
            <div className="space-y-6">
              {/* INFORMAÇÕES DA DESPESA */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4 pb-2 border-b">
                  Informações da Despesa
                </h3>

                <div className="space-y-4">
                  <div>
                    <Label>Descrição *</Label>
                    <Textarea
                      value={form.descricao}
                      onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                      placeholder="Descrição detalhada da despesa"
                      className="mt-1.5"
                      rows={2}
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
                        step="0.01"
                      />
                    </div>
                    <div>
                      <Label>Conta *</Label>
                      <Select
                        value={form.conta_id}
                        onValueChange={(v) => setForm({ ...form, conta_id: v })}
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Selecione a conta" />
                        </SelectTrigger>
                        <SelectContent>
                          {contasOrdenadas.map((c) => (
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
                      <div className="flex gap-2 mt-1.5">
                        <Popover open={openCategoria} onOpenChange={setOpenCategoria}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-between">
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
                    </div>
                    <div>
                      <Label>Fornecedor</Label>
                      <div className="flex gap-2 mt-1.5">
                        <Popover open={openFornecedor} onOpenChange={setOpenFornecedor}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-between">
                              {fornecedorSelecionado?.nome_razao || "Selecione o fornecedor"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0" align="start">
                            <Command>
                              <CommandInput
                                placeholder="Buscar fornecedor..."
                                value={searchFornecedor}
                                onValueChange={setSearchFornecedor}
                              />
                              <CommandList>
                                <CommandEmpty>Nenhum fornecedor encontrado</CommandEmpty>
                                <CommandGroup>
                                  {fornecedoresFiltrados.map((f) => (
                                    <CommandItem
                                      key={f.id}
                                      value={f.nome_razao}
                                      onSelect={() => {
                                        setForm({
                                          ...form,
                                          fornecedor_id: f.id,
                                          fornecedor_nome: f.nome_razao,
                                        });
                                        setOpenFornecedor(false);
                                        setSearchFornecedor("");
                                      }}
                                    >
                                      <div className="flex flex-col">
                                        <span className="font-medium">{f.nome_razao}</span>
                                        {f.cnpj && (
                                          <span className="text-xs text-slate-500">{f.cnpj}</span>
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
                          className="bg-red-600 hover:bg-red-700 shrink-0"
                          onClick={() => setShowNovoFornecedor(true)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
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
                                      setForm({
                                        ...form,
                                        centro_custo_id: c.id,
                                        centro_custo_nome: c.nome,
                                      });
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
                        className="bg-red-600 hover:bg-red-700 shrink-0"
                        onClick={() => setShowNovoCentroCusto(true)}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label>Projeto</Label>
                    <div className="mt-1.5">
                      <Popover open={openProjeto} onOpenChange={setOpenProjeto}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            {projetoSelecionado?.nome || "Selecione o projeto"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <Command>
                            <CommandInput
                              placeholder="Buscar projeto..."
                              value={searchProjeto}
                              onValueChange={setSearchProjeto}
                            />
                            <CommandList>
                              <CommandEmpty>Nenhum projeto encontrado</CommandEmpty>
                              <CommandGroup>
                                {projetosFiltrados.map((p) => (
                                  <CommandItem
                                    key={p.id}
                                    value={p.nome}
                                    onSelect={() => {
                                      setForm({ ...form, projeto_id: p.id, projeto_nome: p.nome });
                                      setOpenProjeto(false);
                                      setSearchProjeto("");
                                    }}
                                  >
                                    {p.nome}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Data de Competência *</Label>
                      <div className="relative mt-1.5">
                        <Input
                          type="date"
                          value={form.data_competencia || ""}
                          onChange={(e) => setForm({ ...form, data_competencia: e.target.value })}
                          onFocus={(e) => {
                            if (!form.data_competencia) {
                              setForm({
                                ...form,
                                data_competencia: new Date().toISOString().split("T")[0],
                              });
                            }
                          }}
                          className="pr-10"
                        />
                        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <Label>Data de Vencimento *</Label>
                      <div className="relative mt-1.5">
                        <Input
                          type="date"
                          value={form.data_vencimento}
                          onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
                          className="pr-10"
                        />
                        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <Label>Data de Pagamento</Label>
                      <div className="relative mt-1.5">
                        <Input
                          type="date"
                          value={form.data_pagamento || ""}
                          onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })}
                          className="pr-10"
                        />
                        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* DADOS DE NOTA FISCAL */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4 pb-2 border-b">
                  Anexar NFe (Opcional)
                </h3>

                <div className="space-y-4">
                  <div>
                    <Label>Nota Fiscal Eletrônica (XML)</Label>
                    <div className="flex gap-2 mt-1.5">
                      <input
                        type="file"
                        accept=".xml"
                        onChange={handleImportarXML}
                        className="hidden"
                        id="import-xml-nfe"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => document.getElementById("import-xml-nfe").click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Importar NFe (XML)
                      </Button>
                    </div>
                    {notaFiscal.numero && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                        <p className="text-green-700">
                          NFe #{notaFiscal.numero} importada com sucesso
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Lista de itens da nota */}
                  {itensNota.length > 0 && (
                    <div className="border rounded-lg p-4 bg-slate-50">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-sm font-semibold">Itens da Nota Fiscal</Label>
                        <div className="flex gap-2">
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => setShowImportarFerramentas(true)}
                            className="text-amber-600"
                          >
                            📦 Criar Ferramentas
                          </Button>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => setShowAssociarMateriais(true)}
                            className="text-blue-600"
                          >
                            Gerenciar Materiais
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {itensNota.map((item, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-white rounded border text-sm"
                          >
                            <div className="flex-1">
                              <p className="font-medium text-slate-800">{item.descricao}</p>
                              <p className="text-xs text-slate-500">
                                Qtd: {item.quantidade} {item.unidade} • Valor Unit: R${" "}
                                {item.valor_unitario?.toFixed(2)}
                              </p>
                            </div>
                            {item.material_nome && (
                              <span className="text-xs text-green-600 flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {item.material_nome}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Data Emissão</Label>
                      <div className="relative mt-1.5">
                        <Input
                          type="date"
                          value={notaFiscal.dataEmissao}
                          onChange={(e) =>
                            setNotaFiscal({ ...notaFiscal, dataEmissao: e.target.value })
                          }
                          className="pr-10"
                        />
                        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <Label>Data de Entrada</Label>
                      <div className="relative mt-1.5">
                        <Input
                          type="date"
                          value={notaFiscal.dataEntrada}
                          onChange={(e) =>
                            setNotaFiscal({ ...notaFiscal, dataEntrada: e.target.value })
                          }
                          className="pr-10"
                        />
                        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Valor (R$)</Label>
                      <Input
                        type="number"
                        value={notaFiscal.valorNota}
                        onChange={(e) =>
                          setNotaFiscal({ ...notaFiscal, valorNota: e.target.value })
                        }
                        placeholder="0,00"
                        className="mt-1.5"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Status de Aprovação</Label>
                    <Select
                      value={notaFiscal.statusAprovacao}
                      onValueChange={(v) => setNotaFiscal({ ...notaFiscal, statusAprovacao: v })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="aprovado">Aprovado</SelectItem>
                        <SelectItem value="reprovado">Reprovado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Forma de Pagamento</Label>
                    <Select
                      value={form.forma_pagamento || ""}
                      onValueChange={(v) => setForm({ ...form, forma_pagamento: v })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Selecione a forma de pagamento" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="cartao">Cartão</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Anexos de Comprovantes */}
                  <div>
                    <Label>Anexar Comprovantes</Label>
                    <div className="mt-1.5 space-y-2">
                      <input
                        type="file"
                        multiple
                        accept="image/*,.pdf"
                        onChange={handleAnexoUpload}
                        className="hidden"
                        id="upload-comprovantes"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => document.getElementById("upload-comprovantes").click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Adicionar Comprovante
                      </Button>

                      {anexos.length > 0 && (
                        <div className="space-y-2">
                          {anexos.map((anexo, index) => {
                            const isPdf =
                              anexo.tipo?.includes("pdf") || anexo.nome?.endsWith(".pdf");
                            const isImage =
                              anexo.tipo?.includes("image") ||
                              anexo.nome?.match(/\.(jpg|jpeg|png|gif)$/i);

                            return (
                              <div
                                key={anexo.id || index}
                                className="flex items-center justify-between p-3 bg-white rounded-lg border hover:border-slate-300 transition-colors"
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  {isImage ? (
                                    <div className="w-10 h-10 rounded overflow-hidden bg-slate-100 flex-shrink-0">
                                      <img
                                        src={anexo.url}
                                        alt={anexo.nome}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  ) : (
                                    <div
                                      className={`w-10 h-10 rounded flex items-center justify-center flex-shrink-0 ${
                                        isPdf ? "bg-red-100" : "bg-slate-100"
                                      }`}
                                    >
                                      <FileText
                                        className={`w-5 h-5 ${isPdf ? "text-red-600" : "text-slate-500"}`}
                                      />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700 truncate">
                                      {anexo.nome}
                                    </p>
                                    {anexo.tipo && (
                                      <p className="text-xs text-slate-500">{anexo.tipo}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 ml-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const isPdf = anexo.url.toLowerCase().includes(".pdf");
                                      if (isPdf) {
                                        window.open(
                                          `https://docs.google.com/viewer?url=${encodeURIComponent(anexo.url)}&embedded=true`,
                                          "_blank"
                                        );
                                      } else {
                                        window.open(anexo.url, "_blank");
                                      }
                                    }}
                                    title="Visualizar"
                                  >
                                    <FileText className="w-4 h-4 text-blue-600" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleRemoverAnexo(index)}
                                    title="Remover"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label>Número de Parcelas</Label>
                    <div className="space-y-2 mt-1.5">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="parcelamento"
                          checked={
                            permitirParcelamento || (selectedItem?.parcelado && parcelas.length > 0)
                          }
                          onCheckedChange={toggleParcelamento}
                          disabled={selectedItem?.parcelado && parcelas.length > 0}
                        />
                        <label
                          htmlFor="parcelamento"
                          className="text-sm text-slate-600 cursor-pointer"
                        >
                          {selectedItem?.parcelado ? "Despesa parcelada" : "Permitir parcelamento"}
                        </label>
                      </div>
                      {(permitirParcelamento ||
                        (selectedItem?.parcelado && parcelas.length > 0)) && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-4">
                            <Input
                              type="number"
                              value={numeroParcelas}
                              onChange={(e) => {
                                const num = parseInt(e.target.value) || 1;
                                handleNumeroParcelasChange(num);
                                if (num > 1) setMostrarParcelas(true);
                              }}
                              min="1"
                              max="120"
                              className="w-24"
                              disabled={selectedItem?.parcelado}
                            />
                            {numeroParcelas > 1 && parcelas.length > 0 && (
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => setMostrarParcelas(!mostrarParcelas)}
                                className="text-blue-600"
                              >
                                {mostrarParcelas ? "Ocultar" : "Mostrar"} {parcelas.length} parcelas
                              </Button>
                            )}
                          </div>
                          {numeroParcelas > 1 &&
                            parcelas.length === 0 &&
                            !selectedItem?.parcelado && (
                              <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
                                ⚠️ Preencha o Valor e Data de Vencimento para gerar as parcelas
                              </p>
                            )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gerenciamento de Parcelas */}
                  {mostrarParcelas &&
                    permitirParcelamento &&
                    numeroParcelas > 1 &&
                    parcelas.length > 0 && (
                      <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
                        <div className="flex items-center justify-between mb-3">
                          <Label className="text-sm font-semibold">Gerenciar Parcelas</Label>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="w-3 h-3" />
                              {parcelas.filter((p) => p.status === "pago").length} Pagas
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
                                <Label className="text-xs text-slate-500">Data Pagamento</Label>
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
                              <div className="col-span-2 flex items-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={parcela.status === "pago" ? "outline" : "default"}
                                  className={
                                    parcela.status === "pago"
                                      ? "w-full"
                                      : "w-full bg-green-600 hover:bg-green-700"
                                  }
                                  onClick={async () => {
                                    if (parcela.status === "pago") {
                                      if (!confirm("Desfazer o pagamento desta parcela?")) return;
                                      const novasParcelas = [...parcelas];
                                      novasParcelas[index].status = "em_aberto";
                                      novasParcelas[index].data_pagamento = null;
                                      novasParcelas[index].comprovante_url = null;
                                      setParcelas(novasParcelas);

                                      // Se é edição, salvar direto
                                      if (selectedItem?.id) {
                                        await sigo.entities.TransacaoFinanceira.update(
                                          selectedItem.id,
                                          {
                                            parcelas: JSON.stringify(novasParcelas),
                                          }
                                        );
                                        onReload();
                                      }
                                    } else {
                                      // Abrir modal de pagamento para esta parcela
                                      setDespesaPagamento({
                                        ...selectedItem,
                                        _parcelaIndex: index,
                                        _parcela: parcela,
                                        valor: parcela.valor,
                                      });
                                      setShowModalPagamento(true);
                                    }
                                  }}
                                >
                                  {parcela.status === "pago" ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      Pago
                                    </>
                                  ) : (
                                    <>
                                      <Clock className="w-3 h-3 mr-1" />
                                      Pagar
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 space-y-3">
            {/* Ações Adicionais - apenas quando editando */}
            {selectedItem && (
              <div className="flex flex-wrap gap-2 pb-3 border-b">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (onEmitirRecibo) onEmitirRecibo(selectedItem);
                  }}
                  className="text-blue-600"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Emitir Recibo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (onDuplicar) {
                      setShowModal(false);
                      onDuplicar(selectedItem);
                    }
                  }}
                  className="text-purple-600"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicar
                </Button>
                {selectedItem.conciliado && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (onDesfazerConciliacao) {
                        setShowModal(false);
                        onDesfazerConciliacao(selectedItem);
                      }
                    }}
                    className="text-orange-600"
                  >
                    <Link2Off className="w-4 h-4 mr-2" />
                    Desfazer Conciliação
                  </Button>
                )}
              </div>
            )}

            {/* Botões Principais */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">
                Cancelar
              </Button>
              {selectedItem && (
                <Button
                  onClick={async () => {
                    const isPago = selectedItem.status === "pago";

                    if (isPago) {
                      if (!confirm("Marcar esta despesa como pendente?")) return;
                      await sigo.entities.TransacaoFinanceira.update(selectedItem.id, {
                        status: "em_aberto",
                        data_pagamento: null,
                      });
                      setShowModal(false);
                      onReload();
                    } else {
                      setDespesaPagamento(selectedItem);
                      setShowModalPagamento(true);
                    }
                  }}
                  className={
                    selectedItem.status === "pago"
                      ? "bg-blue-600 hover:bg-blue-700 flex-1"
                      : "bg-green-600 hover:bg-green-700 flex-1"
                  }
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {selectedItem.status === "pago" ? "Marcar como Pendente" : "Marcar como Pago"}
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={!form.valor || !form.conta_id || !form.data_vencimento || !form.descricao}
                className="bg-red-600 hover:bg-red-700 flex-1"
              >
                Salvar Despesa
              </Button>
            </div>
          </div>
        </SheetContent>

        {/* Modal de Associação de Materiais */}
        <AssociarMateriaisModal
          open={showAssociarMateriais}
          onOpenChange={setShowAssociarMateriais}
          itensNota={itensNota}
          empresaAtiva={empresaAtiva}
          onConfirm={(itensAssociados) => {
            setItensNota(itensAssociados);
            // Aqui você pode criar movimentações de estoque automaticamente
            alert("Materiais associados! Os itens serão lançados no estoque ao salvar.");
          }}
        />

        {/* Modal de Importação de Ferramentas */}
        <ImportarFerramentasModal
          open={showImportarFerramentas}
          onOpenChange={setShowImportarFerramentas}
          itensNota={itensNota}
          empresaAtiva={empresaAtiva}
        />

        {/* Modal de Lançamento Manual */}
        <Sheet open={showLancamentoManual} onOpenChange={setShowLancamentoManual}>
          <SheetContent
            side="right"
            className="h-full overflow-y-auto p-0 flex flex-col w-full md:w-auto md:inset-auto md:right-0"
            data-fullscreen-modal
          >
            <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
              <SheetHeader className="flex-1">
                <SheetTitle>Lançar Item Manualmente</SheetTitle>
              </SheetHeader>
              <button
                onClick={() => setShowLancamentoManual(false)}
                className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <div>
                <Label>Descrição *</Label>
                <Input
                  value={itemManual.descricao}
                  onChange={(e) => setItemManual({ ...itemManual, descricao: e.target.value })}
                  placeholder="Descrição do item"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Código</Label>
                <Input
                  value={itemManual.codigo}
                  onChange={(e) => setItemManual({ ...itemManual, codigo: e.target.value })}
                  placeholder="Código do produto"
                  className="mt-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Unidade</Label>
                  <Input
                    value={itemManual.unidade}
                    onChange={(e) => setItemManual({ ...itemManual, unidade: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Quantidade *</Label>
                  <Input
                    type="number"
                    value={itemManual.quantidade}
                    onChange={(e) =>
                      setItemManual({ ...itemManual, quantidade: parseFloat(e.target.value) || 0 })
                    }
                    className="mt-1.5"
                    step="0.01"
                  />
                </div>
              </div>
              <div>
                <Label>Valor Unitário *</Label>
                <Input
                  type="number"
                  value={itemManual.valor_unitario}
                  onChange={(e) =>
                    setItemManual({
                      ...itemManual,
                      valor_unitario: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder="0,00"
                  className="mt-1.5"
                  step="0.01"
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowLancamentoManual(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (itemManual.descricao && itemManual.quantidade > 0) {
                    setItensNota([
                      ...itensNota,
                      {
                        ...itemManual,
                        valor_total: itemManual.quantidade * itemManual.valor_unitario,
                      },
                    ]);
                    setItemManual({
                      descricao: "",
                      codigo: "",
                      unidade: "UN",
                      quantidade: 0,
                      valor_unitario: 0,
                    });
                    setShowLancamentoManual(false);
                    setShowAssociarMateriais(true);
                  }
                }}
                disabled={!itemManual.descricao || itemManual.quantidade <= 0}
                className="flex-1"
              >
                Adicionar Item
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Modal Novo Fornecedor - usa o Sheet do módulo Configurações */}
        <NovoFornecedorConfigSheet
          open={showNovoFornecedor}
          onOpenChange={setShowNovoFornecedor}
          empresaAtiva={empresaAtiva}
          onFornecedorCriado={(fornecedor) => {
            setFornecedoresLocais((prev) => [...prev, fornecedor]);
            setForm((prev) => ({
              ...prev,
              fornecedor_id: fornecedor.id,
              fornecedor_nome: fornecedor.nome_razao,
            }));
            if (onReload) onReload();
          }}
        />

        {/* Modal Novo Centro de Custo */}
        <Sheet open={showNovoCentroCusto} onOpenChange={setShowNovoCentroCusto}>
          <SheetContent
            side="right"
            className="h-full overflow-y-auto p-0 flex flex-col w-full md:w-auto md:inset-auto md:right-0"
            data-fullscreen-modal
          >
            <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
              <SheetHeader className="flex-1">
                <SheetTitle>Novo Centro de Custo</SheetTitle>
              </SheetHeader>
              <button
                onClick={() => setShowNovoCentroCusto(false)}
                className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
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
                  onChange={(e) =>
                    setNovoCentroCusto({ ...novoCentroCusto, codigo: e.target.value })
                  }
                  placeholder="Código do centro"
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowNovoCentroCusto(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSalvarCentroCusto}
                disabled={!novoCentroCusto.nome}
                className="flex-1"
              >
                Salvar Centro de Custo
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <ModalPagamento
          open={showModalPagamento}
          onOpenChange={setShowModalPagamento}
          despesa={despesaPagamento}
          empresaAtiva={empresaAtiva}
          onConfirm={async (dataPagamento, comprovanteUrl) => {
            // Se é pagamento de parcela individual
            if (despesaPagamento?._parcelaIndex !== undefined) {
              const novasParcelas = [...parcelas];
              novasParcelas[despesaPagamento._parcelaIndex].status = "pago";
              novasParcelas[despesaPagamento._parcelaIndex].data_pagamento = dataPagamento;
              novasParcelas[despesaPagamento._parcelaIndex].comprovante_url = comprovanteUrl;
              setParcelas(novasParcelas);

              // Se está editando, salvar direto
              if (selectedItem?.id) {
                await sigo.entities.TransacaoFinanceira.update(selectedItem.id, {
                  parcelas: JSON.stringify(novasParcelas),
                });
                setShowModalPagamento(false);
                onReload();
              }
            } else {
              // Pagamento normal da despesa inteira
              setShowModalPagamento(false);
              setShowModal(false);
              onReload();
            }
          }}
          onExcluir={async (item) => {
            try {
              await sigo.entities.PreLancamento.delete(item.id);
              setShowModalPagamento(false);
              onReload();
            } catch (err) {
              alert("Erro ao excluir pré-lançamento: " + err.message);
            }
          }}
        />
      </Sheet>
    </>
  );
}
