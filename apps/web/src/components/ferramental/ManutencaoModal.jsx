import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "@/Layout";
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
import SheetModalComponent from "@/components/ui/sheet-modal";
import { toast } from "sonner";
import { Plus, XCircle, Search } from "lucide-react";

export default function ManutencaoModal({ open, onOpenChange, manutencao, ferramentas, onSave }) {
  const { empresaAtiva, user } = useEmpresa();
  // Lista de ferramentas na manutenção
  const [ferramentasList, setFerramentasList] = useState([]);
  // Busca inline por linha
  const [buscasPorLinha, setBuscasPorLinha] = useState({});
  const [showSugestoesPorLinha, setShowSugestoesPorLinha] = useState({});
  const portalRefs = useRef({});
  const inputRefs = useRef({});

  // Legado (mantido para compatibilidade)
  const [buscaFerramenta, setBuscaFerramenta] = useState("");
  const ferramentaInputRef = useRef(null);
  const portalRef = useRef(null);
  const getRect = () => ferramentaInputRef.current?.getBoundingClientRect() || null;
  const [dados, setDados] = useState({
    empresa_id: empresaAtiva?.id || "",
    ferramenta_id: "",
    ferramenta_codigo: "",
    ferramenta_descricao: "",
    tipo_manutencao: "Preventiva",
    data_prevista: "",
    data_manutencao: "",
    descricao: "",
    custo: 0,
    fornecedor_id: "",
    fornecedor_nome: "",
    responsavel_id: user?.id || "",
    responsavel_nome: user?.full_name || "",
    status: "Agendada",
    observacoes: "",
    horas_uso_no_momento: 0,
    proxima_manutencao_prevista: "",
    pecas_substituidas: "[]",
  });

  const [fornecedores, setFornecedores] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [pecas, setPecas] = useState([]);
  const [loading, setLoading] = useState(false);

  const getSugestoes = (busca) =>
    ferramentas
      .filter(
        (f) =>
          !busca ||
          (f.codigo || "").toLowerCase().includes(busca.toLowerCase()) ||
          (f.descricao || "").toLowerCase().includes(busca.toLowerCase()) ||
          (f.numero_serie || "").toLowerCase().includes(busca.toLowerCase())
      )
      .slice(0, 50);

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadFornecedores();
      loadUsuarios();
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    if (manutencao) {
      const pecasArray = manutencao.pecas_substituidas
        ? JSON.parse(manutencao.pecas_substituidas)
        : [];
      setPecas(pecasArray);
      setDados({
        ...dados,
        ...manutencao,
        pecas_substituidas: manutencao.pecas_substituidas || "[]",
      });
      // Carregar lista de ferramentas
      try {
        const lista = manutencao.ferramentas_lista ? JSON.parse(manutencao.ferramentas_lista) : [];
        if (lista.length > 0) {
          setFerramentasList(lista);
        } else if (manutencao.ferramenta_id) {
          const ferr = ferramentas.find((f) => f.id === manutencao.ferramenta_id);
          if (ferr)
            setFerramentasList([
              {
                id: ferr.id,
                codigo: ferr.codigo,
                descricao: ferr.descricao,
                numero_serie: ferr.numero_serie,
              },
            ]);
        }
      } catch {}
    } else {
      setFerramentasList([{ id: "", codigo: "", descricao: "", numero_serie: "" }]);
    }
  }, [manutencao]);

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      const clickedInAnyInput = Object.values(inputRefs.current).some((r) => r?.contains(e.target));
      const clickedInAnyPortal = Object.values(portalRefs.current).some((r) =>
        r?.contains(e.target)
      );
      if (!clickedInAnyInput && !clickedInAnyPortal) {
        setShowSugestoesPorLinha({});
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const adicionarFerramentaLinha = () => {
    setFerramentasList((prev) => [
      ...prev,
      { id: "", codigo: "", descricao: "", numero_serie: "" },
    ]);
  };

  const removerFerramentaLinha = (idx) => {
    setFerramentasList((prev) => prev.filter((_, i) => i !== idx));
  };

  const selecionarFerramentaLinha = (idx, ferr) => {
    const localizacao = ferr.funcionario_nome || ferr.caminhao_placa || ferr.localizacao || "-";
    setFerramentasList((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              id: ferr.id,
              codigo: ferr.codigo,
              descricao: ferr.descricao,
              numero_serie: ferr.numero_serie,
              localizacao,
            }
          : item
      )
    );
    setBuscasPorLinha((prev) => {
      const n = { ...prev };
      delete n[idx];
      return n;
    });
    setShowSugestoesPorLinha((prev) => ({ ...prev, [idx]: false }));
  };

  const loadFornecedores = async () => {
    try {
      const forns = await sigo.entities.Fornecedor.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });
      setFornecedores(forns);
    } catch (error) {
      console.error("Erro ao carregar fornecedores:", error);
    }
  };

  const loadUsuarios = async () => {
    try {
      const users = await sigo.entities.UsuarioEmpresa.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });
      setUsuarios(users);
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
    }
  };

  const handleFerramentaChange = (ferr) => {
    // legado, não usado mais diretamente
  };

  const handleFornecedorChange = (fornecedorId) => {
    const forn = fornecedores.find((f) => f.id === fornecedorId);
    if (forn) {
      setDados({
        ...dados,
        fornecedor_id: fornecedorId,
        fornecedor_nome: forn.nome_razao,
      });
    }
  };

  const handleResponsavelChange = (usuarioId) => {
    const usr = usuarios.find((u) => u.id === usuarioId);
    if (usr) {
      setDados({
        ...dados,
        responsavel_id: usuarioId,
        responsavel_nome: usr.nome_completo,
      });
    }
  };

  const adicionarPeca = () => {
    const novaPeca = { descricao: "", quantidade: 1, custo_unitario: 0 };
    setPecas([...pecas, novaPeca]);
  };

  const removerPeca = (index) => {
    setPecas(pecas.filter((_, i) => i !== index));
  };

  const atualizarPeca = (index, campo, valor) => {
    const novasPecas = [...pecas];
    novasPecas[index][campo] = valor;
    setPecas(novasPecas);
  };

  const calcularCustoTotal = () => {
    const custoPecas = pecas.reduce((total, p) => {
      return total + (parseFloat(p.quantidade) || 0) * (parseFloat(p.custo_unitario) || 0);
    }, 0);
    return custoPecas + (parseFloat(dados.custo) || 0);
  };

  const handleSalvar = async () => {
    if (!dados.data_prevista && dados.status === "Agendada") {
      toast.error("Informe a data prevista");
      return;
    }

    if (!dados.data_manutencao && dados.status === "Concluída") {
      toast.error("Informe a data de realização");
      return;
    }

    if (ferramentasList.length === 0 || !ferramentasList.some((f) => f.id)) {
      toast.error("Selecione pelo menos uma ferramenta");
      return;
    }
    setLoading(true);
    try {
      const primeiraFerr = ferramentasList.find((f) => f.id) || {};
      const dadosCompletos = {
        ...dados,
        ferramenta_id: primeiraFerr.id || "",
        ferramenta_codigo: primeiraFerr.codigo || "",
        ferramenta_descricao: primeiraFerr.descricao || "",
        ferramentas_lista: JSON.stringify(ferramentasList.filter((f) => f.id)),
        pecas_substituidas: JSON.stringify(pecas),
      };
      await onSave(dadosCompletos);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SheetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      title={manutencao ? "Editar Manutenção" : "Nova Manutenção"}
      footer={
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={loading}
            className="flex-1 bg-amber-500 hover:bg-amber-600"
          >
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Ferramentas - lista editável */}
        <div>
          <Label className="text-base font-semibold">Ferramentas *</Label>
          <div className="border rounded-lg overflow-hidden mt-1">
            <table className="w-full" style={{ tableLayout: "auto" }}>
              <thead className="bg-slate-100 border-b">
                <tr>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-600 w-8">
                    #
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">
                    Código / Descrição
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 w-36">
                    Nº Série
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 w-40">
                    Localização
                  </th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {ferramentasList.map((linha, idx) => (
                  <tr key={idx} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-center text-xs text-slate-400 font-medium">
                      {idx + 1}
                    </td>
                    <td
                      className="px-2 py-1.5 relative"
                      ref={(el) => (inputRefs.current[idx] = el)}
                    >
                      <div className="flex items-center gap-1">
                        <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <Input
                          placeholder="Buscar ferramenta..."
                          value={
                            buscasPorLinha[idx] !== undefined
                              ? buscasPorLinha[idx]
                              : linha.id
                                ? `${linha.codigo} - ${linha.descricao}`
                                : ""
                          }
                          onChange={(e) => {
                            setBuscasPorLinha((prev) => ({ ...prev, [idx]: e.target.value }));
                            setShowSugestoesPorLinha((prev) => ({ ...prev, [idx]: true }));
                            if (!e.target.value)
                              setFerramentasList((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? { id: "", codigo: "", descricao: "", numero_serie: "" }
                                    : item
                                )
                              );
                          }}
                          onFocus={() => {
                            if (linha.id && buscasPorLinha[idx] === undefined) {
                              setBuscasPorLinha((prev) => ({ ...prev, [idx]: "" }));
                            }
                            setShowSugestoesPorLinha((prev) => ({ ...prev, [idx]: true }));
                          }}
                          onBlur={() => {
                            setTimeout(() => {
                              if (buscasPorLinha[idx] !== undefined && !ferramentasList[idx]?.id)
                                return;
                              setBuscasPorLinha((prev) => {
                                const n = { ...prev };
                                delete n[idx];
                                return n;
                              });
                            }, 200);
                          }}
                          className="h-7 text-xs border-0 bg-transparent focus:bg-white focus:border flex-1"
                        />
                      </div>
                      {showSugestoesPorLinha[idx] &&
                        (() => {
                          const busca = buscasPorLinha[idx] || "";
                          const sugs = getSugestoes(busca);
                          if (sugs.length === 0) return null;
                          const rect = inputRefs.current[idx]?.getBoundingClientRect();
                          if (!rect) return null;
                          return ReactDOM.createPortal(
                            <div
                              ref={(el) => (portalRefs.current[idx] = el)}
                              onMouseDown={(e) => e.preventDefault()}
                              style={{
                                position: "fixed",
                                top: rect.bottom + 2,
                                left: rect.left,
                                width: Math.max(rect.width, 320),
                                zIndex: 99999,
                                background: "white",
                                border: "1px solid #e2e8f0",
                                borderRadius: 8,
                                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                                maxHeight: 220,
                                overflowY: "auto",
                              }}
                            >
                              {sugs.map((f) => (
                                <button
                                  key={f.id}
                                  type="button"
                                  style={{
                                    display: "flex",
                                    width: "100%",
                                    textAlign: "left",
                                    padding: "8px 12px",
                                    gap: 8,
                                    alignItems: "center",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                  }}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    selecionarFerramentaLinha(idx, f);
                                  }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.background = "#f1f5f9")
                                  }
                                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                                >
                                  <div
                                    style={{ display: "flex", flexDirection: "column", flex: 1 }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontFamily: "monospace",
                                          fontSize: 11,
                                          background: "#f1f5f9",
                                          padding: "2px 6px",
                                          borderRadius: 4,
                                          color: "#475569",
                                        }}
                                      >
                                        {f.codigo}
                                      </span>
                                      {f.numero_serie && (
                                        <span
                                          style={{
                                            fontFamily: "monospace",
                                            fontSize: 11,
                                            background: "#eff6ff",
                                            padding: "2px 6px",
                                            borderRadius: 4,
                                            color: "#2563eb",
                                            border: "1px solid #bfdbfe",
                                          }}
                                        >
                                          S/N: {f.numero_serie}
                                        </span>
                                      )}
                                      <span style={{ color: "#1e293b", fontSize: 13 }}>
                                        {f.descricao}
                                      </span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                                      {f.status && (
                                        <span
                                          style={{
                                            fontSize: 10,
                                            color:
                                              f.status === "Disponível" ? "#16a34a" : "#d97706",
                                            fontWeight: 600,
                                          }}
                                        >
                                          {f.status}
                                        </span>
                                      )}
                                      {f.funcionario_nome && (
                                        <span style={{ fontSize: 10, color: "#64748b" }}>
                                          👤 {f.funcionario_nome}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>,
                            document.body
                          );
                        })()}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-slate-500 font-mono">
                      {linha.numero_serie || "-"}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-slate-500">
                      {linha.localizacao || "-"}
                    </td>
                    <td className="px-2 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removerFerramentaLinha(idx)}
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t">
                <tr>
                  <td colSpan={5} className="px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs text-blue-600 hover:text-blue-800"
                      onClick={adicionarFerramentaLinha}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar Ferramenta
                    </Button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Tipo e Status */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Tipo de Manutenção</Label>
            <Select
              value={dados.tipo_manutencao}
              onValueChange={(v) => setDados({ ...dados, tipo_manutencao: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Preventiva", "Corretiva", "Preditiva", "Inspeção"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={dados.status} onValueChange={(v) => setDados({ ...dados, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Agendada", "Em Andamento", "Concluída", "Cancelada"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Data Prevista */}
          <div>
            <Label>Data Prevista</Label>
            <Input
              type="date"
              value={dados.data_prevista}
              onChange={(e) => setDados({ ...dados, data_prevista: e.target.value })}
            />
          </div>

          {/* Data Realizada */}
          <div>
            <Label>Data Realizada</Label>
            <Input
              type="date"
              value={dados.data_manutencao}
              onChange={(e) => setDados({ ...dados, data_manutencao: e.target.value })}
            />
          </div>
        </div>

        {/* Descrição */}
        <div>
          <Label>Descrição dos Serviços</Label>
          <Textarea
            value={dados.descricao}
            onChange={(e) => setDados({ ...dados, descricao: e.target.value })}
            placeholder="Descreva os serviços realizados..."
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Fornecedor */}
          <div>
            <Label>Fornecedor</Label>
            <Select value={dados.fornecedor_id} onValueChange={handleFornecedorChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o fornecedor" />
              </SelectTrigger>
              <SelectContent>
                {fornecedores.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome_razao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custo */}
          <div>
            <Label>Custo (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={dados.custo}
              onChange={(e) => setDados({ ...dados, custo: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Horas de Uso */}
          <div>
            <Label>Horas de Uso no Momento</Label>
            <Input
              type="number"
              value={dados.horas_uso_no_momento}
              onChange={(e) =>
                setDados({ ...dados, horas_uso_no_momento: parseFloat(e.target.value) || 0 })
              }
            />
          </div>

          {/* Próxima Manutenção */}
          <div>
            <Label>Próxima Manutenção Prevista</Label>
            <Input
              type="date"
              value={dados.proxima_manutencao_prevista}
              onChange={(e) => setDados({ ...dados, proxima_manutencao_prevista: e.target.value })}
            />
          </div>
        </div>

        {/* Responsável */}
        <div>
          <Label>Responsável/Técnico</Label>
          <Select value={dados.responsavel_id} onValueChange={handleResponsavelChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o responsável" />
            </SelectTrigger>
            <SelectContent>
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome_completo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Peças Substituídas */}
        <div className="border-t pt-4">
          <div className="flex justify-between items-center mb-3">
            <Label className="text-base font-semibold">Peças Substituídas</Label>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full" style={{ tableLayout: "auto" }}>
              <thead className="bg-slate-100 border-b">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">
                    Descrição
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600 w-24">
                    Qtd
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600 w-32">
                    Custo Unit. (R$)
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600 w-32">
                    Total
                  </th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {pecas.map((peca, index) => (
                  <tr key={index} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-1.5">
                      <Input
                        placeholder="Descrição da peça"
                        value={peca.descricao}
                        onChange={(e) => atualizarPeca(index, "descricao", e.target.value)}
                        className="h-7 text-xs border-0 bg-transparent focus:bg-white focus:border"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        value={peca.quantidade}
                        onChange={(e) => atualizarPeca(index, "quantidade", e.target.value)}
                        className="h-7 text-xs text-right border-0 bg-transparent focus:bg-white focus:border"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        step="0.01"
                        value={peca.custo_unitario}
                        onChange={(e) => atualizarPeca(index, "custo_unitario", e.target.value)}
                        className="h-7 text-xs text-right border-0 bg-transparent focus:bg-white focus:border"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <span className="text-xs font-medium text-green-700">
                        R${" "}
                        {(
                          (parseFloat(peca.quantidade) || 0) *
                          (parseFloat(peca.custo_unitario) || 0)
                        ).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removerPeca(index)}
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t">
                <tr>
                  <td colSpan={2} className="px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs text-blue-600 hover:text-blue-800"
                      onClick={adicionarPeca}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar Peça
                    </Button>
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                    Total Peças:
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-green-700 text-xs">
                    R${" "}
                    {pecas
                      .reduce(
                        (t, p) =>
                          t + (parseFloat(p.quantidade) || 0) * (parseFloat(p.custo_unitario) || 0),
                        0
                      )
                      .toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Resumo de Custos */}
        {pecas.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex justify-between text-sm">
              <span>Custo de Mão de Obra:</span>
              <span className="font-semibold">R$ {(parseFloat(dados.custo) || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span>Custo de Peças:</span>
              <span className="font-semibold">
                R$ {pecas.reduce((t, p) => t + p.quantidade * p.custo_unitario, 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold mt-2 pt-2 border-t border-amber-300">
              <span>Total:</span>
              <span>R$ {calcularCustoTotal().toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Observações */}
        <div>
          <Label>Observações</Label>
          <Textarea
            value={dados.observacoes}
            onChange={(e) => setDados({ ...dados, observacoes: e.target.value })}
            placeholder="Observações adicionais..."
            rows={2}
          />
        </div>
      </div>
    </SheetModalComponent>
  );
}
