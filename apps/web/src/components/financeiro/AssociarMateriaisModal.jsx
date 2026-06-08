import React, { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Plus, ChevronDown, X, AlertCircle, Barcode } from "lucide-react";
import { sigo } from "@/api/sigoClient";

const formatBRL = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

function normalize(str) {
  return (str || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Heurística simples de "fuzzy": razão de tokens em comum.
function tokenOverlap(a, b) {
  const ta = normalize(a).split(/\s+/).filter(Boolean);
  const tb = normalize(b).split(/\s+/).filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  const hits = ta.filter((t) => setB.has(t)).length;
  return hits / Math.max(ta.length, tb.length);
}

// Componente de busca inline que NÃO usa portal/popover para evitar abrir fora do modal
function BuscaMaterialInline({ materiais, value, onChange, onCriar }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  const selected = materiais.find((m) => m.id === value);

  const filtrados = materiais
    .filter(
      (m) =>
        !search ||
        m.nome?.toLowerCase().includes(search.toLowerCase()) ||
        m.codigo?.toLowerCase().includes(search.toLowerCase()) ||
        m.ean?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setSearch("");
        }}
        className="w-full flex items-center justify-between px-3 py-2 border rounded-md bg-white text-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected
            ? `${selected.nome}${selected.codigo ? ` (${selected.codigo})` : ""}`
            : "Selecione o material..."}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <X
              className="w-3 h-3 text-slate-400 hover:text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            />
          )}
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-56 flex flex-col">
          <div className="p-2 border-b">
            <Input
              autoFocus
              placeholder="Buscar por nome, código ou EAN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtrados.length === 0 && (
              <p className="text-sm text-slate-400 p-3 text-center">Nenhum material encontrado</p>
            )}
            {filtrados.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                  setSearch("");
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${value === m.id ? "bg-blue-50 text-blue-700" : ""}`}
              >
                <div className="flex flex-col">
                  <span>{m.nome}</span>
                  {m.ean && (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Barcode className="w-2.5 h-2.5" /> {m.ean}
                    </span>
                  )}
                </div>
                {m.codigo && (
                  <span className="text-xs text-slate-400 ml-2 shrink-0">{m.codigo}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={onCriar} className="mt-2 w-full">
        <Plus className="w-4 h-4 mr-2" /> Criar Novo Material
      </Button>
    </div>
  );
}

export default function AssociarMateriaisModal({
  open,
  onOpenChange,
  itensNota,
  empresaAtiva,
  onConfirm,
}) {
  const [materiais, setMateriais] = useState([]);
  // associacoes[index] = { materialId: uuid|null, pendente: boolean }
  const [associacoes, setAssociacoes] = useState({});

  const [criandoMaterial, setCriandoMaterial] = useState(null);
  const [novoMaterial, setNovoMaterial] = useState({
    nome: "",
    codigo: "",
    ean: "",
    unidade: "UN",
    categoria: "",
    ncm: "",
    preco: 0,
  });

  useEffect(() => {
    if (open && empresaAtiva) {
      loadMateriais();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, empresaAtiva]);

  const loadMateriais = async () => {
    const mats = await sigo.entities.Material.filter({
      empresa_id: empresaAtiva.id,
      ativo: true,
    });
    setMateriais(mats);

    // Auto-match: cProd, EAN, fuzzy nome
    const autoAssoc = {};
    itensNota.forEach((item, index) => {
      // 1. EAN exato (mais confiável)
      if (item.ean && item.ean.trim() && item.ean !== "SEM GTIN") {
        const porEan = mats.find(
          (m) => m.ean && m.ean.trim().toLowerCase() === item.ean.trim().toLowerCase()
        );
        if (porEan) {
          autoAssoc[index] = { materialId: porEan.id, pendente: false };
          return;
        }
      }

      // 2. Código exato (cProd == material.codigo)
      if (item.codigo && item.codigo.trim()) {
        const porCodigo = mats.find(
          (m) => m.codigo && m.codigo.toLowerCase().trim() === item.codigo.toLowerCase().trim()
        );
        if (porCodigo) {
          autoAssoc[index] = { materialId: porCodigo.id, pendente: false };
          return;
        }
      }

      // 3. Fuzzy nome (>= 60% de tokens em comum)
      let bestScore = 0;
      let bestMat = null;
      for (const m of mats) {
        const score = tokenOverlap(item.descricao, m.nome);
        if (score > bestScore) {
          bestScore = score;
          bestMat = m;
        }
      }
      if (bestMat && bestScore >= 0.6) {
        autoAssoc[index] = { materialId: bestMat.id, pendente: false };
      }
    });
    if (Object.keys(autoAssoc).length > 0) setAssociacoes(autoAssoc);
  };

  const handleAssociar = (indexItem, materialId) => {
    setAssociacoes((prev) => ({
      ...prev,
      [indexItem]: { materialId: materialId || null, pendente: false },
    }));
  };

  const handleMarcarPendente = (indexItem) => {
    setAssociacoes((prev) => {
      const atual = prev[indexItem];
      const jaPendente = atual?.pendente;
      return {
        ...prev,
        [indexItem]: jaPendente
          ? { materialId: null, pendente: false }
          : { materialId: null, pendente: true },
      };
    });
  };

  const handleCriarMaterial = async () => {
    if (!novoMaterial.nome) return;

    try {
      const materialCriado = await sigo.entities.Material.create({
        empresa_id: empresaAtiva.id,
        nome: novoMaterial.nome,
        codigo: novoMaterial.codigo || null,
        ean: novoMaterial.ean || null,
        unidade: novoMaterial.unidade,
        categoria: novoMaterial.categoria || null,
        ncm: novoMaterial.ncm || null,
        preco: parseFloat(novoMaterial.preco) || 0,
        estoque: 0,
        ativo: true,
      });

      setMateriais((prev) => [...prev, materialCriado]);

      if (criandoMaterial !== null) {
        handleAssociar(criandoMaterial, materialCriado.id);
      }

      setNovoMaterial({
        nome: "",
        codigo: "",
        ean: "",
        unidade: "UN",
        categoria: "",
        ncm: "",
        preco: 0,
      });
      setCriandoMaterial(null);
    } catch (error) {
      console.error("Erro ao criar material:", error);
      alert("Erro ao criar material");
    }
  };

  const handleConfirmar = () => {
    const itensAssociados = itensNota.map((item, index) => {
      const assoc = associacoes[index] || {};
      const materialId = assoc.materialId || null;
      const material = materialId ? materiais.find((m) => m.id === materialId) : null;
      return {
        ...item,
        material_id: materialId,
        material_id_associado: materialId,
        material_nome: material?.nome || null,
        material_codigo: material?.codigo || null,
        material_pendente: !!assoc.pendente,
      };
    });
    onConfirm(itensAssociados);
    onOpenChange(false);
  };

  const totaisResumo = useMemo(() => {
    let associados = 0;
    let pendentes = 0;
    itensNota.forEach((_, i) => {
      const a = associacoes[i];
      if (a?.materialId) associados++;
      else if (a?.pendente) pendentes++;
    });
    const naoTratados = itensNota.length - associados - pendentes;
    return { associados, pendentes, naoTratados };
  }, [associacoes, itensNota]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="sm:max-w-5xl overflow-y-auto"
        style={{ left: "256px", right: 0, width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <SheetHeader>
          <SheetTitle>Conciliar Itens da NFe com o Estoque</SheetTitle>
          <p className="text-sm text-slate-500">
            Para cada item da nota, escolha o material do cadastro. Itens não associados podem ser
            marcados como pendentes para conciliação manual posterior.
          </p>
        </SheetHeader>

        <div className="space-y-3 py-6">
          {itensNota.map((item, index) => {
            const assoc = associacoes[index] || {};
            const materialAssociado = assoc.materialId
              ? materiais.find((m) => m.id === assoc.materialId)
              : null;
            const pendente = !!assoc.pendente;

            return (
              <div
                key={index}
                className={`border rounded-lg p-4 ${
                  materialAssociado
                    ? "border-green-200 bg-green-50/40"
                    : pendente
                      ? "border-amber-300 bg-amber-50/60"
                      : "border-slate-200"
                }`}
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* COLUNA ESQUERDA: Item da NF */}
                  <div className="border-r-0 lg:border-r lg:pr-4 border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">Item {index + 1} da NFe</Badge>
                      {materialAssociado && (
                        <Badge className="bg-green-100 text-green-700 border-green-200">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Associado
                        </Badge>
                      )}
                      {pendente && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Pendente
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-medium text-slate-800 break-words">{item.descricao}</h4>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-sm text-slate-600">
                      <div>
                        <span className="text-xs text-slate-500">cProd:</span>
                        <p className="font-medium">{item.codigo || "-"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">EAN:</span>
                        <p className="font-medium flex items-center gap-1">
                          {item.ean && item.ean !== "SEM GTIN" ? (
                            <>
                              <Barcode className="w-3 h-3 text-slate-400" /> {item.ean}
                            </>
                          ) : (
                            "-"
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Unidade (uCom):</span>
                        <p className="font-medium">{item.unidade}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Qtd (qCom):</span>
                        <p className="font-medium">{item.quantidade}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Valor Unit (vUnCom):</span>
                        <p className="font-medium">{formatBRL(item.valor_unitario)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">NCM:</span>
                        <p className="font-medium">{item.ncm || "-"}</p>
                      </div>
                    </div>
                  </div>

                  {/* COLUNA DIREITA: Material do cadastro */}
                  <div>
                    <Label className="text-xs text-slate-500 uppercase">Material do estoque</Label>

                    {criandoMaterial === index ? (
                      <div className="border rounded-lg p-3 bg-blue-50 space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold">Criar Novo Material</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCriandoMaterial(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                        <div>
                          <Label className="text-xs">Nome *</Label>
                          <Input
                            value={novoMaterial.nome}
                            onChange={(e) =>
                              setNovoMaterial({ ...novoMaterial, nome: e.target.value })
                            }
                            placeholder={item.descricao}
                            className="mt-1"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Código</Label>
                            <Input
                              value={novoMaterial.codigo}
                              onChange={(e) =>
                                setNovoMaterial({ ...novoMaterial, codigo: e.target.value })
                              }
                              placeholder={item.codigo}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">EAN</Label>
                            <Input
                              value={novoMaterial.ean}
                              onChange={(e) =>
                                setNovoMaterial({ ...novoMaterial, ean: e.target.value })
                              }
                              placeholder={item.ean}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Unidade</Label>
                            <Input
                              value={novoMaterial.unidade}
                              onChange={(e) =>
                                setNovoMaterial({ ...novoMaterial, unidade: e.target.value })
                              }
                              placeholder={item.unidade}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">NCM</Label>
                            <Input
                              value={novoMaterial.ncm}
                              onChange={(e) =>
                                setNovoMaterial({ ...novoMaterial, ncm: e.target.value })
                              }
                              placeholder={item.ncm}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Categoria</Label>
                            <Input
                              value={novoMaterial.categoria}
                              onChange={(e) =>
                                setNovoMaterial({ ...novoMaterial, categoria: e.target.value })
                              }
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Preço</Label>
                            <Input
                              type="number"
                              value={novoMaterial.preco}
                              onChange={(e) =>
                                setNovoMaterial({ ...novoMaterial, preco: e.target.value })
                              }
                              className="mt-1"
                              step="0.01"
                            />
                          </div>
                        </div>
                        <Button
                          onClick={handleCriarMaterial}
                          disabled={!novoMaterial.nome}
                          className="w-full bg-green-600 hover:bg-green-700 mt-1"
                          size="sm"
                        >
                          Criar e Associar
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <BuscaMaterialInline
                          materiais={materiais}
                          value={assoc.materialId || ""}
                          onChange={(v) => handleAssociar(index, v)}
                          onCriar={() => {
                            setNovoMaterial({
                              nome: item.descricao,
                              codigo: item.codigo || "",
                              ean: item.ean && item.ean !== "SEM GTIN" ? item.ean : "",
                              unidade: item.unidade || "UN",
                              categoria: "",
                              ncm: item.ncm || "",
                              preco: item.valor_unitario,
                            });
                            setCriandoMaterial(index);
                          }}
                        />

                        <Button
                          variant={pendente ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleMarcarPendente(index)}
                          className={`mt-2 w-full ${
                            pendente
                              ? "bg-amber-500 hover:bg-amber-600 text-white"
                              : "text-amber-700 border-amber-300 hover:bg-amber-50"
                          }`}
                        >
                          <AlertCircle className="w-4 h-4 mr-2" />
                          {pendente
                            ? "Pendente (clique p/ desmarcar)"
                            : "Marcar como Não Cadastrado"}
                        </Button>
                      </div>
                    )}

                    {materialAssociado && criandoMaterial !== index && (
                      <div className="mt-2 p-2 bg-white border border-green-200 rounded text-sm space-y-1">
                        <p className="text-green-800">
                          ✓ <strong>{materialAssociado.nome}</strong>
                          {materialAssociado.codigo && ` (${materialAssociado.codigo})`}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                          <span>
                            Preço médio:{" "}
                            <strong className="text-slate-800">
                              {formatBRL(materialAssociado.preco_medio)}
                            </strong>
                          </span>
                          <span>
                            NF:{" "}
                            <strong className="text-slate-800">
                              {formatBRL(item.valor_unitario)}
                            </strong>
                          </span>
                          {(() => {
                            const pm = parseFloat(materialAssociado.preco_medio) || 0;
                            const pn = parseFloat(item.valor_unitario) || 0;
                            if (!pm || !pn) return null;
                            const diffPct = ((pn - pm) / pm) * 100;
                            const cor =
                              Math.abs(diffPct) < 5
                                ? "text-slate-500"
                                : diffPct > 0
                                  ? "text-red-600"
                                  : "text-green-700";
                            return (
                              <span className={cor}>
                                Δ {diffPct >= 0 ? "+" : ""}
                                {diffPct.toFixed(1)}%
                              </span>
                            );
                          })()}
                          <span>
                            Estoque atual:{" "}
                            <strong className="text-slate-800">
                              {materialAssociado.estoque ?? 0} {materialAssociado.unidade}
                            </strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center border-t pt-4 sticky bottom-0 bg-white pb-2">
          <div className="text-sm text-slate-600 flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1 text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              {totaisResumo.associados} associados
            </span>
            <span className="flex items-center gap-1 text-amber-700">
              <AlertCircle className="w-4 h-4" />
              {totaisResumo.pendentes} pendentes
            </span>
            {totaisResumo.naoTratados > 0 && (
              <span className="text-slate-500">{totaisResumo.naoTratados} sem decisão</span>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmar} className="bg-green-600 hover:bg-green-700">
              Confirmar Conciliação
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
