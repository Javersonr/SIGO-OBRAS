import { normalizarTexto } from "@/lib/busca";
import React, { useState, useEffect, useRef } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { ehBase44, ehImagem, ehPdf, extensaoDoArquivo, nomeDoArquivo } from "@/lib/anexo-ref";
import AnexoViewer from "@/components/shared/AnexoViewer";
import ImgStorage from "@/components/ImgStorage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  AlertCircle,
  Image,
  Trash2,
  MoreVertical,
  Undo2,
  CheckCheck,
  FileText,
  FileWarning,
  X,
  Package,
  Link2,
  Pencil,
} from "lucide-react";
import EditarPreLancamentoComDespesaModal from "./EditarPreLancamentoComDespesaModal";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import DesfazerConciliacaoModal from "./DesfazerConciliacaoModal.jsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Inline editable cell for text (descricao / observacao)
function InlineTextCell({ value, placeholder, onSave, className }) {
  const [local, setLocal] = useState(value || "");
  const lastSaved = useRef(value || "");

  useEffect(() => {
    setLocal(value || "");
    lastSaved.current = value || "";
  }, [value]);

  const handleBlur = () => {
    if (local !== lastSaved.current) {
      lastSaved.current = local;
      onSave(local);
    }
  };

  return (
    <Input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={`h-7 text-xs bg-transparent border-transparent hover:border-slate-300 focus:border-slate-400 focus:bg-white transition-colors ${className || ""}`}
    />
  );
}

// Inline project selector
function InlineProjetoCell({ item, projetos, onSave }) {
  const [query, setQuery] = useState(item.projeto_nome || "");
  const [sugestoes, setSugestoes] = useState([]);
  const [aberto, setAberto] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setQuery(item.projeto_nome || "");
  }, [item.projeto_nome]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setAberto(false);
        setSugestoes([]);
        // Se o texto não bate com nenhum projeto selecionado, restaura
        if (!item.projeto_nome && query) setQuery("");
        if (item.projeto_nome && query !== item.projeto_nome) setQuery(item.projeto_nome);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [item.projeto_nome, query]);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    const filtered = val
      ? projetos
          .filter((p) => normalizarTexto(p.nome).includes(normalizarTexto(val.toLowerCase())))
          .slice(0, 6)
      : projetos.slice(0, 6);
    setSugestoes(filtered);
    setAberto(true);
  };

  const handleFocus = () => {
    setSugestoes(projetos.slice(0, 6));
    setAberto(true);
  };

  const handleSelect = (projeto) => {
    setQuery(projeto.nome);
    setSugestoes([]);
    setAberto(false);
    onSave(projeto);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setQuery("");
    setSugestoes([]);
    setAberto(false);
    onSave(null);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex items-center gap-1">
        <Input
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder="Projeto..."
          className="h-7 text-xs bg-transparent border-transparent hover:border-slate-300 focus:border-slate-400 focus:bg-white transition-colors"
        />
        {item.projeto_nome && (
          <button onClick={handleClear} className="text-slate-400 hover:text-red-500 flex-shrink-0">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {aberto && sugestoes.length > 0 && (
        <div className="absolute top-8 left-0 z-50 bg-white border border-slate-200 rounded shadow-lg w-56 max-h-40 overflow-y-auto">
          {sugestoes.map((p) => (
            <button
              key={p.id}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 truncate"
              onMouseDown={() => handleSelect(p)}
            >
              {p.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Miniatura do comprovante na tabela. comprovante_url guarda a ref estável
// "bucket/caminho" (ou URL legada) — resolvida na hora pelo ImgStorage.
// Base44: a plataforma antiga apagou os arquivos → placeholder, não imagem quebrada.
function MiniaturaComprovante({ referencia, onAbrir }) {
  const caixa = "w-12 h-12 rounded border flex flex-col items-center justify-center gap-0.5";

  if (ehBase44(referencia)) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        title="Comprovante do sistema antigo (Base44): arquivo indisponível. Reanexe em Editar."
        className={`${caixa} bg-slate-50 border-dashed border-slate-300 text-slate-400 hover:bg-slate-100 cursor-pointer`}
      >
        <FileWarning className="w-4 h-4" />
        <span className="text-[8px] leading-none text-center">sistema antigo</span>
      </button>
    );
  }

  if (ehPdf(referencia)) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        className={`${caixa} bg-red-50 border-red-200 hover:opacity-80 transition-opacity cursor-pointer`}
      >
        <FileText className="w-5 h-5 text-red-500" />
        <span className="text-[9px] text-red-500 font-medium">PDF</span>
      </button>
    );
  }

  // sem extensão (legado) também tenta como imagem; se não carregar, fica o ícone
  const ext = extensaoDoArquivo(referencia);
  if (ehImagem(referencia) || !ext) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        className={`${caixa} relative overflow-hidden bg-slate-100 border-slate-200 hover:opacity-80 transition-opacity cursor-pointer`}
      >
        <Image className="w-5 h-5 text-slate-400" />
        <ImgStorage
          key={referencia}
          referencia={referencia}
          alt="Comprovante"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`${caixa} bg-slate-50 border-slate-200 hover:opacity-80 transition-opacity cursor-pointer`}
    >
      <FileText className="w-5 h-5 text-slate-500" />
      <span className="text-[9px] text-slate-500 font-medium uppercase">{ext}</span>
    </button>
  );
}

export default function PreLancamentosAReconciliar({
  empresaId,
  usuarioEmail,
  usuarioNome = "",
  verTodos,
  verProprios,
  filtroUsuario = "",
  onReload,
  onSelecionadosChange,
  podeAprovar,
  contas = [],
  categorias = [],
}) {
  const [preLancamentos, setPreLancamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [desfazendoItem, setDesfazendoItem] = useState(null);
  const [transacaoDesfazer, setTransacaoDesfazer] = useState(null);
  const [anexoAberto, setAnexoAberto] = useState(null);
  const [editandoItem, setEditandoItem] = useState(null);
  const [tabAtiva, setTabAtiva] = useState("pendentes");
  const [conciliados, setConciliados] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const [fechandoCaixa, setFechandoCaixa] = useState(false);
  const [mostrarTabela, setMostrarTabela] = useState(true);

  // Aplicar filtro externo de usuário
  const listaAtiva = tabAtiva === "pendentes" ? preLancamentos : conciliados;
  const listaFiltrada = filtroUsuario
    ? listaAtiva.filter((item) => item.usuario_email === filtroUsuario)
    : listaAtiva;

  // Total apenas dos selecionados (ou de todos se nenhum selecionado)
  const itensSelecionadosFiltrados = listaFiltrada.filter((item) => selecionados.includes(item.id));
  const listaTotalizador =
    itensSelecionadosFiltrados.length > 0 ? itensSelecionadosFiltrados : listaFiltrada;
  const totalFiltrado = listaTotalizador.reduce((sum, item) => {
    const d = safeParseJSON(item.dados_extraidos, {});
    return sum + (parseFloat(d.valor) || 0);
  }, 0);

  const todosSelecionados =
    listaFiltrada.length > 0 && listaFiltrada.every((item) => selecionados.includes(item.id));

  const toggleSelecionado = (id) => {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const toggleTodos = () => {
    if (todosSelecionados) {
      setSelecionados((prev) => prev.filter((id) => !listaFiltrada.some((item) => item.id === id)));
    } else {
      setSelecionados((prev) => [...new Set([...prev, ...listaFiltrada.map((item) => item.id)])]);
    }
  };

  // Notifica o pai sempre que a seleção mudar (opcional, mantido para compatibilidade)
  useEffect(() => {
    if (onSelecionadosChange) {
      const itensSel = preLancamentos.filter((item) => selecionados.includes(item.id));
      onSelecionadosChange(itensSel);
    }
  }, [selecionados]);

  // Apenas pendentes selecionados vão para o fechamento de caixa
  const itensSelecionadosParaCaixa = preLancamentos.filter((item) =>
    selecionados.includes(item.id)
  );

  useEffect(() => {
    carregarPreLancamentos();
    carregarProjetos();
    carregarUsuarios();
  }, [empresaId, usuarioEmail, verTodos]);

  const carregarProjetos = async () => {
    try {
      // Limita ao status ativo: empresas com 200+ projetos antigos travavam
      // a lista no select. Mantém ordenação por nome.
      const data = await sigo.entities.Projeto.filter(
        { empresa_id: empresaId, status: ["Planejamento", "Em Andamento"] },
        "nome",
        500
      );
      setProjetos(data || []);
    } catch (err) {
      // Fallback: sem filtro de status (alguns clientes não usam status)
      console.warn("[PreLancamentos] falha carregando projetos com filtro:", err);
      try {
        const fallback = await sigo.entities.Projeto.filter({ empresa_id: empresaId }, "nome", 500);
        setProjetos(fallback || []);
      } catch (err2) {
        console.warn("[PreLancamentos] fallback também falhou:", err2);
        setProjetos([]);
      }
    }
  };

  const carregarUsuarios = async () => {
    try {
      const data = await sigo.entities.UsuarioEmpresa.filter({
        empresa_id: empresaId,
        ativo: true,
      });
      setUsuarios(data || []);
    } catch (err) {
      console.warn("[PreLancamentos] falha carregando usuarios:", err);
      setUsuarios([]);
    }
  };

  const carregarPreLancamentos = async () => {
    try {
      setCarregando(true);
      setErro(null);

      if (!verTodos && !verProprios) {
        setPreLancamentos([]);
        setConciliados([]);
        setCarregando(false);
        return;
      }

      const filtroPendente = { empresa_id: empresaId, status: "Pendente" };
      const filtroConciliado = { empresa_id: empresaId, status: "Conciliado" };

      if (!verTodos && usuarioEmail) {
        filtroPendente.usuario_email = usuarioEmail;
        filtroConciliado.usuario_email = usuarioEmail;
      }

      const [pendentes, conciliadosData] = await Promise.all([
        sigo.entities.PreLancamento.filter(filtroPendente),
        sigo.entities.PreLancamento.filter(filtroConciliado),
      ]);

      setPreLancamentos(pendentes || []);
      setConciliados(conciliadosData || []);
    } catch (err) {
      setErro("Erro ao carregar pré-lançamentos: " + err.message);
    } finally {
      setCarregando(false);
    }
  };

  const updateLocal = (id, patch) => {
    const apply = (list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setPreLancamentos(apply);
    setConciliados(apply);
  };

  const handleSalvarDescricao = async (item, novaDescricao) => {
    const dados = safeParseJSON(item.dados_extraidos, {});
    dados.descricao = novaDescricao;
    const dadosStr = JSON.stringify(dados);
    updateLocal(item.id, { dados_extraidos: dadosStr });
    await sigo.entities.PreLancamento.update(item.id, { dados_extraidos: dadosStr });
  };

  const handleSalvarObservacao = async (item, novaObs) => {
    updateLocal(item.id, { observacoes: novaObs });
    await sigo.entities.PreLancamento.update(item.id, { observacoes: novaObs });
  };

  const handleSalvarProjeto = async (item, projeto) => {
    const patch = { projeto_id: projeto?.id || null, projeto_nome: projeto?.nome || null };
    updateLocal(item.id, patch);
    await sigo.entities.PreLancamento.update(item.id, patch);
  };

  const handleFecharCaixaDireto = async () => {
    if (itensSelecionadosParaCaixa.length === 0) return;
    setFechandoCaixa(true);
    try {
      const existentes = await sigo.entities.FechamentoCaixa.filter({ empresa_id: empresaId });
      const numero = String(existentes.length + 1).padStart(4, "0");
      const total = itensSelecionadosParaCaixa.reduce((sum, pl) => {
        const d = safeParseJSON(pl.dados_extraidos, {});
        return sum + (parseFloat(d.valor) || 0);
      }, 0);
      await sigo.entities.FechamentoCaixa.create({
        empresa_id: empresaId,
        numero,
        status: "Aguardando Pagamento",
        // pre_lancamentos_ids é JSONB no banco (default '[]'::jsonb). Salvar
        // JSON.stringify(...) gravava como texto literal e quebrava queries
        // jsonb_array_elements no Supabase. Passa o array cru — o supabase-js
        // serializa pra JSON certo na request.
        pre_lancamentos_ids: itensSelecionadosParaCaixa.map((p) => p.id),
        valor_total: total,
        usuario_fechamento_email: usuarioEmail,
        usuario_fechamento_nome: usuarioNome,
        data_fechamento: new Date().toLocaleDateString("en-CA"),
      });
      // allSettled: se 1 update falhar, ainda fechamos a UI mas avisamos.
      const updateResults = await Promise.allSettled(
        itensSelecionadosParaCaixa.map((pl) =>
          sigo.entities.PreLancamento.update(pl.id, { status: "Em Fechamento" })
        )
      );
      const updateFails = updateResults.filter((r) => r.status === "rejected");
      if (updateFails.length > 0) {
        console.error("Falhas marcando pré-lançamentos como Em Fechamento:", updateFails);
        alert(
          `Atenção: ${updateFails.length} pré-lançamento(s) não foram atualizados. Verifique no histórico.`
        );
      }
      setSelecionados([]);
      await carregarPreLancamentos();
      if (onReload) onReload();
    } catch (err) {
      alert("Erro ao fechar caixa: " + err.message);
    } finally {
      setFechandoCaixa(false);
    }
  };

  const handleDeletar = async (item) => {
    if (!window.confirm("Deseja excluir este pré-lançamento?")) return;
    try {
      await sigo.entities.PreLancamento.delete(item.id);
      await carregarPreLancamentos();
      if (onReload) onReload();
    } catch (err) {
      alert("Erro ao excluir: " + err.message);
    }
  };

  const podeManiputar = (item) => verTodos || item.usuario_email === usuarioEmail;

  if (carregando) {
    return (
      <Card>
        <CardContent className="flex justify-center items-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
        </CardContent>
      </Card>
    );
  }

  if (preLancamentos.length === 0 && conciliados.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4 text-blue-600" />
              Pré-Lançamentos
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {(podeAprovar || verTodos) && selecionados.length > 0 && tabAtiva === "pendentes" && (
                <Button
                  size="sm"
                  onClick={handleFecharCaixaDireto}
                  disabled={fechandoCaixa}
                  className="gap-1.5 text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {fechandoCaixa ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Package className="w-3.5 h-3.5" />
                  )}
                  Fechar Caixa ({selecionados.length})
                </Button>
              )}
              <Button
                size="sm"
                variant={tabAtiva === "pendentes" ? "default" : "outline"}
                onClick={() => setTabAtiva("pendentes")}
                className="text-xs h-7"
              >
                Pendentes{" "}
                <Badge className="ml-1 bg-yellow-200 text-yellow-800 text-xs px-1">
                  {filtroUsuario
                    ? preLancamentos.filter((p) => p.usuario_email === filtroUsuario).length
                    : preLancamentos.length}
                </Badge>
              </Button>
              <Button
                size="sm"
                variant={tabAtiva === "conciliados" ? "default" : "outline"}
                onClick={() => setTabAtiva("conciliados")}
                className="text-xs h-7"
              >
                Conciliados{" "}
                <Badge className="ml-1 bg-green-200 text-green-800 text-xs px-1">
                  {filtroUsuario
                    ? conciliados.filter((p) => p.usuario_email === filtroUsuario).length
                    : conciliados.length}
                </Badge>
              </Button>
              <Button
                size="sm"
                variant={mostrarTabela ? "default" : "outline"}
                onClick={() => setMostrarTabela(!mostrarTabela)}
                className="text-xs h-7 ml-auto bg-blue-600 hover:bg-blue-700 text-white"
              >
                {mostrarTabela ? "👁️ Ocultar" : "👁️ Mostrar"} Tabela
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {erro && (
            <div className="px-4 pb-3">
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <AlertDescription className="text-red-800">{erro}</AlertDescription>
              </Alert>
            </div>
          )}
          {mostrarTabela && (
            <div className="border rounded-lg overflow-x-auto mx-4 mb-4">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-slate-100 border-b">
                  <tr>
                    <th className="w-10 px-3 py-3">
                      <Checkbox checked={todosSelecionados} onCheckedChange={toggleTodos} />
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">
                      Comprovante
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Fornecedor</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Projeto</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Descrição</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Observação</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-700">Valor</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Status</th>
                    {verTodos && (
                      <th className="text-left px-4 py-3 font-semibold text-slate-700">Usuário</th>
                    )}
                    <th className="text-center px-4 py-3 font-semibold text-slate-700">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {listaFiltrada.map((item) => {
                    const dados = safeParseJSON(item.dados_extraidos, {});
                    const valor = parseFloat(dados.valor) || 0;
                    const podeAcionar = podeManiputar(item);
                    const isConciliado = tabAtiva === "conciliados";
                    const isChecked = selecionados.includes(item.id);

                    return (
                      <tr
                        key={item.id}
                        className={`border-b hover:bg-slate-50 ${isChecked ? "bg-blue-50" : ""}`}
                      >
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleSelecionado(item.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {item.comprovante_url ? (
                            <MiniaturaComprovante
                              referencia={item.comprovante_url}
                              onAbrir={() =>
                                setAnexoAberto({
                                  url: item.comprovante_url,
                                  nome: nomeDoArquivo(item.comprovante_url, "Comprovante"),
                                })
                              }
                            />
                          ) : (
                            <div className="w-12 h-12 bg-slate-100 rounded border border-slate-200 flex items-center justify-center">
                              <Image className="w-5 h-5 text-slate-400" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {dados.fornecedor || "-"}
                        </td>
                        <td className="px-4 py-2 min-w-[160px]">
                          <InlineProjetoCell
                            item={item}
                            projetos={projetos}
                            onSave={(projeto) => handleSalvarProjeto(item, projeto)}
                          />
                        </td>
                        <td className="px-4 py-2 min-w-[160px]">
                          <InlineTextCell
                            value={dados.descricao}
                            placeholder="Descrição..."
                            onSave={(val) => handleSalvarDescricao(item, val)}
                          />
                        </td>
                        <td className="px-4 py-2 min-w-[160px]">
                          <InlineTextCell
                            value={item.observacoes}
                            placeholder="Observação..."
                            onSave={(val) => handleSalvarObservacao(item, val)}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-red-600">
                          R$ {valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3">
                          {isConciliado ? (
                            <Badge
                              variant="outline"
                              className="bg-green-50 text-green-700 border-green-300"
                            >
                              <CheckCheck className="w-3 h-3 mr-1" /> Conciliado
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-yellow-50 text-yellow-800 border-yellow-300"
                            >
                              Pendente
                            </Badge>
                          )}
                        </td>
                        {verTodos && (
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {item.usuario_email || "-"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {/* Editar à mão (antes só na janela do comprovante): dá
                              para editar com o comprovante aberto ao lado */}
                          {!isConciliado && podeAcionar && (
                            <Button
                              variant="outline"
                              size="sm"
                              title="Editar"
                              aria-label="Editar"
                              onClick={() => setEditandoItem(item)}
                              className="h-8 w-8 p-0 mr-1 text-amber-600 hover:text-amber-700"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!isConciliado && podeAcionar && (
                                <DropdownMenuItem
                                  onClick={() => setEditandoItem(item)}
                                  className="gap-2"
                                >
                                  Editar
                                </DropdownMenuItem>
                              )}
                              {!isConciliado && podeAcionar && (
                                <DropdownMenuItem
                                  onClick={async () => {
                                    const response = await sigo.functions.invoke(
                                      "reconciliarPreLancamento",
                                      {
                                        preLancamentoId: item.id,
                                        empresaId: item.empresa_id,
                                      }
                                    );
                                    if (response.data?.sucesso) {
                                      await carregarPreLancamentos();
                                      if (onReload) onReload();
                                    } else {
                                      alert(
                                        "Erro ao conciliar: " +
                                          (response.data?.error || "Tente novamente")
                                      );
                                    }
                                  }}
                                  className="gap-2 text-green-600 focus:text-green-600"
                                >
                                  <CheckCheck className="w-4 h-4" /> Conciliar (→ Despesa Paga)
                                </DropdownMenuItem>
                              )}
                              {isConciliado && podeAcionar && (
                                <DropdownMenuItem
                                  onClick={async () => {
                                    let transacao = null;
                                    if (item.transacao_id) {
                                      const ts = await sigo.entities.TransacaoFinanceira.filter({
                                        id: item.transacao_id,
                                      });
                                      transacao = ts[0] || null;
                                    }
                                    setTransacaoDesfazer(transacao);
                                    setDesfazendoItem(item);
                                  }}
                                  className="gap-2 text-orange-600 focus:text-orange-600"
                                >
                                  <Undo2 className="w-4 h-4" /> Desfazer Conciliação
                                </DropdownMenuItem>
                              )}
                              {podeAcionar && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDeletar(item)}
                                    className="gap-2 text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4" /> Excluir
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                  {listaFiltrada.length === 0 && (
                    <tr>
                      <td colSpan={verTodos ? 9 : 8} className="text-center py-8 text-slate-500">
                        Nenhum pré-lançamento {tabAtiva === "pendentes" ? "pendente" : "conciliado"}
                        {filtroUsuario ? " para este usuário" : ""}.
                      </td>
                    </tr>
                  )}
                  {listaFiltrada.length > 0 && (
                    <tr className="bg-slate-50 border-t-2 border-slate-300">
                      <td
                        colSpan={verTodos ? 8 : 7}
                        className="px-4 py-2 text-xs font-semibold text-slate-600 text-right"
                      >
                        {itensSelecionadosFiltrados.length > 0
                          ? `Total selecionados (${itensSelecionadosFiltrados.length} itens):`
                          : `Total (${listaFiltrada.length} itens):`}
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-red-600 text-sm">
                        R$ {totalFiltrado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* janela flutuante não-modal: fica aberta por cima do "Editar" */}
      <AnexoViewer
        anexo={anexoAberto}
        open={!!anexoAberto}
        onOpenChange={(v) => !v && setAnexoAberto(null)}
      />

      {editandoItem && (
        <EditarPreLancamentoComDespesaModal
          open={!!editandoItem}
          onOpenChange={(v) => {
            if (!v) setEditandoItem(null);
          }}
          preLancamento={editandoItem}
          empresaAtiva={{ id: empresaId }}
          contas={contas}
          categorias={categorias}
          onSucesso={() => {
            setEditandoItem(null);
            carregarPreLancamentos();
            if (onReload) onReload();
          }}
        />
      )}

      {desfazendoItem && (
        <DesfazerConciliacaoModal
          open={!!desfazendoItem}
          onOpenChange={(v) => {
            if (!v) {
              setDesfazendoItem(null);
              setTransacaoDesfazer(null);
            }
          }}
          preLancamento={desfazendoItem}
          transacao={transacaoDesfazer}
          onSucesso={() => {
            setDesfazendoItem(null);
            setTransacaoDesfazer(null);
            carregarPreLancamentos();
            if (onReload) onReload();
            setTabAtiva("pendentes");
          }}
        />
      )}
    </>
  );
}
