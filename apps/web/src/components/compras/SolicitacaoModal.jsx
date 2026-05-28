import React from "react";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Trash2, X, Upload } from "lucide-react";
import { sigo } from "@/api/sigoClient";
import ImportarItensSolicitacao from "./ImportarItensSolicitacao";

export default function SolicitacaoModal({
  open,
  onOpenChange,
  form,
  setForm,
  onSave,
  saving,
  projetos,
  empresaAtiva,
}) {
  const [loadingOrcamento, setLoadingOrcamento] = React.useState(false);
  const [materiais, setMateriais] = React.useState([]);
  const [multiProjeto, setMultiProjeto] = React.useState(false);
  const [sugestoesAberta, setSugestoesAberta] = React.useState(null);
  const [sugestaoFocada, setSugestaoFocada] = React.useState(-1);
  const [showImportar, setShowImportar] = React.useState(false);
  // Cache de OrcamentoItem dos projetos selecionados pra sugerir preço estimado.
  // Keys: material_id (uuid) e descricao.toLowerCase() — ambas resolvem pro mesmo valor_unitario.
  const [orcamentoPrecos, setOrcamentoPrecos] = React.useState({
    porMaterial: {},
    porDescricao: {},
  });
  const inputRefs = React.useRef({}); // refs para focar campos por index

  const fmtBRL = (v) =>
    (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Preço sugerido pra um item: orçamento manda > material.preco_medio > material.preco
  const sugerirPreco = React.useCallback(
    (item) => {
      if (form.origem === "Orcamento") {
        const porMat = item.material_id ? orcamentoPrecos.porMaterial[item.material_id] : null;
        const porDesc = item.descricao
          ? orcamentoPrecos.porDescricao[item.descricao.toLowerCase()]
          : null;
        if (porMat != null) return porMat;
        if (porDesc != null) return porDesc;
      }
      if (item.material_id) {
        const m = materiais.find((mat) => mat.id === item.material_id);
        if (m?.preco_medio != null) return m.preco_medio;
        if (m?.preco != null) return m.preco;
      }
      return null;
    },
    [form.origem, orcamentoPrecos, materiais]
  );

  const carregarMateriais = React.useCallback(async () => {
    if (!empresaAtiva?.id) return;
    try {
      const [mats, ferramentas] = await Promise.all([
        sigo.entities.Material.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }).catch(
          () => []
        ),
      ]);
      const matsMapeados = mats.map((m) => ({
        id: m.id,
        nome: m.nome,
        tipo: "Material",
        preco: m.preco || null,
        preco_medio: m.preco_medio || null,
        unidade: m.unidade || "UN",
        codigo: m.codigo || "",
      }));
      const ferrMapeadas = ferramentas
        .map((f) => ({
          id: f.id,
          nome: f.descricao || f.nome,
          tipo: "Ferramenta",
          preco: null,
          preco_medio: null,
          unidade: "UN",
          codigo: f.codigo || "",
        }))
        .filter((f) => f.nome);
      const todos = [...matsMapeados, ...ferrMapeadas].sort((a, b) =>
        (a.nome || "").localeCompare(b.nome || "", "pt-BR")
      );
      setMateriais(todos);
    } catch (error) {
      console.error("Erro ao carregar materiais:", error);
    }
  }, [empresaAtiva?.id]);

  React.useEffect(() => {
    if (open && empresaAtiva?.id) {
      carregarMateriais();
      setOrcamentoPrecos({ porMaterial: {}, porDescricao: {} });
    }
  }, [open, empresaAtiva?.id, carregarMateriais]);

  const addItem = (focusIndex = null) => {
    const novoItem = {
      descricao: "",
      quantidade: 1,
      unidade: "UN",
      data_necessidade: "",
      ultimo_preco: null,
      preco_unitario_estimado: null,
    };
    setForm((prev) => {
      const novos = [...prev.itens, novoItem];
      const newIndex = novos.length - 1;
      // Focar no campo descrição do novo item após render
      setTimeout(() => {
        if (inputRefs.current[`desc-${newIndex}`]) {
          inputRefs.current[`desc-${newIndex}`].focus();
        }
      }, 50);
      return { ...prev, itens: novos };
    });
  };

  const handleTabQuantidade = (e, index) => {
    // Tab na quantidade vai para o campo unidade do mesmo item
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (inputRefs.current[`unid-${index}`]) {
        inputRefs.current[`unid-${index}`].focus();
      }
    }
  };

  const handleTabUnidade = (e, index) => {
    // Tab na unidade: se é o último item e tem descrição, cria novo item; senão vai para próximo
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const isLast = index === form.itens.length - 1;
      const temDescricao = form.itens[index]?.descricao?.trim();
      if (isLast && temDescricao) {
        addItem();
      } else if (!isLast) {
        setTimeout(() => {
          if (inputRefs.current[`desc-${index + 1}`]) {
            inputRefs.current[`desc-${index + 1}`].focus();
          }
        }, 10);
      }
    }
  };

  const removeItem = (index) => {
    if (form.itens.length > 1) {
      setForm({
        ...form,
        itens: form.itens.filter((_, i) => i !== index),
      });
    }
  };

  const updateItem = async (index, field, value) => {
    const newItens = [...form.itens];
    newItens[index][field] = value;

    // Se mudou a descrição, buscar material/ferramenta e salvar id/codigo/unidade
    if (field === "descricao") {
      const found = materiais.find((m) => m.nome?.toLowerCase() === value?.toLowerCase());
      if (found) {
        newItens[index].ultimo_preco = found.preco || null;
        newItens[index].unidade = found.unidade || "UN";
        newItens[index].material_id = found.tipo === "Material" ? found.id : null;
        newItens[index].material_codigo = found.codigo || "";
      } else {
        newItens[index].material_id = null;
        newItens[index].material_codigo = "";
      }

      // Sugere preço estimado se o usuário ainda não digitou nada (não sobrescreve edição manual).
      // Orçamento manda > preco_medio > preço cadastrado.
      const jaTemPrecoManual =
        newItens[index].preco_unitario_estimado != null &&
        newItens[index].preco_unitario_estimado !== "";
      if (!jaTemPrecoManual) {
        const sugerido = sugerirPreco(newItens[index]);
        if (sugerido != null) {
          newItens[index].preco_unitario_estimado = sugerido;
        }
      }
    }

    setForm({ ...form, itens: newItens });
  };

  const carregarOrcamentoProjeto = async (projetoId) => {
    setLoadingOrcamento(true);
    try {
      const [orcamentoItens, todosPedidosItems, reservasAtivas] = await Promise.all([
        sigo.entities.OrcamentoItem.filter({
          empresa_id: empresaAtiva.id,
          projeto_id: projetoId,
        }),
        sigo.entities.PedidoCompraItem.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.ReservaMaterial.filter({
          empresa_id: empresaAtiva.id,
          projeto_id: projetoId,
          status: "Ativa",
        }),
      ]);

      // Index dos preços do orçamento pra sugerir em edições futuras
      const porMaterial = {};
      const porDescricao = {};
      for (const o of orcamentoItens) {
        if (o.valor_unitario == null) continue;
        if (o.material_id) porMaterial[o.material_id] = o.valor_unitario;
        if (o.descricao) porDescricao[o.descricao.toLowerCase()] = o.valor_unitario;
      }
      setOrcamentoPrecos({ porMaterial, porDescricao });

      if (orcamentoItens.length > 0) {
        const itensFormatados = orcamentoItens.map((item) => {
          const pedidoItem = todosPedidosItems.find((p) => p.descricao === item.descricao);
          const ultimoPreco = pedidoItem?.valor_unitario || null;
          const reserva = reservasAtivas.find(
            (r) => r.material_id && r.material_id === item.material_id
          );
          const qtdReservada = reserva?.quantidade_reservada || 0;
          const qtdComprar = Math.max(0, (item.quantidade || 0) - qtdReservada);
          return {
            descricao: item.descricao,
            quantidade: qtdComprar,
            quantidade_original: item.quantidade,
            qtd_reservada: qtdReservada,
            unidade: item.unidade,
            ultimo_preco: ultimoPreco,
            preco_unitario_estimado: item.valor_unitario || null,
            material_id: item.material_id || null,
            material_codigo: item.codigo || "",
          };
        });

        setForm((prev) => ({
          ...prev,
          projeto_id: projetoId,
          itens: itensFormatados.sort((a, b) =>
            (a.descricao || "").localeCompare(b.descricao || "", "pt-BR")
          ),
        }));
      } else {
        const projeto = projetos.find((p) => p.id === projetoId);
        setForm((prev) => ({
          ...prev,
          projeto_id: projetoId,
          projeto_nome: projeto?.nome || "",
          itens: [
            {
              descricao: "",
              quantidade: 1,
              unidade: "UN",
              data_necessidade: "",
              ultimo_preco: null,
              preco_unitario_estimado: null,
              qtd_reservada: 0,
            },
          ],
        }));
      }
    } catch (error) {
      console.error("Erro ao carregar orçamento:", error);
    } finally {
      setLoadingOrcamento(false);
    }
  };

  const carregarOrcamentosMultiProjetos = async (projetoIds) => {
    if (projetoIds.length === 0) return;
    setLoadingOrcamento(true);
    try {
      const [todosPedidosItems, todasReservas, ...todosOrcamentos] = await Promise.all([
        sigo.entities.PedidoCompraItem.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.ReservaMaterial.filter({ empresa_id: empresaAtiva.id, status: "Ativa" }),
        ...projetoIds.map((pid) =>
          sigo.entities.OrcamentoItem.filter({ empresa_id: empresaAtiva.id, projeto_id: pid })
        ),
      ]);

      // Reservas dos projetos selecionados
      const reservasDosProjetos = todasReservas.filter((r) => projetoIds.includes(r.projeto_id));

      const itensMap = {};
      // Index de preços pra sugestão posterior
      const porMaterial = {};
      const porDescricao = {};
      todosOrcamentos.flat().forEach((item) => {
        if (item.valor_unitario != null) {
          if (item.material_id) porMaterial[item.material_id] = item.valor_unitario;
          if (item.descricao) porDescricao[item.descricao.toLowerCase()] = item.valor_unitario;
        }
        const key = item.descricao?.toLowerCase();
        if (!key) return;
        if (itensMap[key]) {
          itensMap[key].quantidade_original += item.quantidade;
        } else {
          const pedidoItem = todosPedidosItems.find((p) => p.descricao === item.descricao);
          itensMap[key] = {
            descricao: item.descricao,
            quantidade_original: item.quantidade,
            unidade: item.unidade,
            ultimo_preco: pedidoItem?.valor_unitario || null,
            preco_unitario_estimado: item.valor_unitario || null,
            material_id: item.material_id || null,
            material_codigo: item.codigo || "",
          };
        }
      });
      setOrcamentoPrecos({ porMaterial, porDescricao });

      // Subtrair reservas
      const itens = Object.values(itensMap)
        .map((item) => {
          const reserva = reservasDosProjetos.find(
            (r) => r.material_id && r.material_id === item.material_id
          );
          const qtdReservada = reserva?.quantidade_reservada || 0;
          return {
            ...item,
            qtd_reservada: qtdReservada,
            quantidade: Math.max(0, item.quantidade_original - qtdReservada),
          };
        })
        .sort((a, b) => (a.descricao || "").localeCompare(b.descricao || "", "pt-BR"));

      const projsSelecionados = projetos.filter((p) => projetoIds.includes(p.id));
      setForm((prev) => ({
        ...prev,
        projetos_ids: JSON.stringify(projetoIds),
        projetos_nomes: JSON.stringify(projsSelecionados.map((p) => p.nome)),
        projeto_id: projetoIds[0],
        projeto_nome: projsSelecionados.map((p) => p.nome).join(", "),
        itens:
          itens.length > 0
            ? itens
            : [
                {
                  descricao: "",
                  quantidade: 1,
                  unidade: "UN",
                  data_necessidade: "",
                  ultimo_preco: null,
                  qtd_reservada: 0,
                },
              ],
      }));
    } catch (error) {
      console.error("Erro ao carregar orçamentos:", error);
    } finally {
      setLoadingOrcamento(false);
    }
  };

  const handleImportarItens = (itens) => {
    setForm((prev) => ({ ...prev, itens }));
  };

  return (
    <>
      {showImportar && (
        <ImportarItensSolicitacao
          onImportar={handleImportarItens}
          onClose={() => setShowImportar(false)}
          materiais={materiais}
        />
      )}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="h-full p-0 flex flex-col" data-fullscreen-modal>
          <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
            <SheetHeader className="flex-1">
              <SheetTitle>Nova Solicitação de Compra</SheetTitle>
            </SheetHeader>
            <button
              onClick={() => onOpenChange(false)}
              className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label>Projetos Vinculados</Label>
                <button
                  type="button"
                  onClick={() => {
                    setMultiProjeto((v) => !v);
                    setForm((prev) => ({
                      ...prev,
                      projetos_ids: "",
                      projetos_nomes: "",
                      projeto_id: "",
                      projeto_nome: "",
                    }));
                  }}
                  className="text-xs text-blue-600 underline ml-2"
                >
                  {multiProjeto ? "Selecionar apenas 1 projeto" : "Vincular múltiplos projetos"}
                </button>
              </div>

              {!multiProjeto ? (
                <>
                  <Select
                    value={form.projeto_id}
                    onValueChange={(v) => {
                      const projeto = projetos.find((p) => p.id === v);
                      setForm((prev) => ({
                        ...prev,
                        projeto_id: v,
                        projeto_nome: projeto?.nome || "",
                      }));
                      carregarOrcamentoProjeto(v);
                    }}
                    disabled={loadingOrcamento}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      {projetos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {loadingOrcamento && (
                    <p className="text-xs text-slate-500">Carregando itens do orçamento...</p>
                  )}
                  {!loadingOrcamento && form.itens.length > 0 && form.itens[0].descricao && (
                    <p className="text-xs text-blue-600">
                      {form.itens.filter((i) => i.descricao).length} itens do orçamento carregados
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="border border-slate-200 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {projetos.map((p) => {
                      // projetos_ids: JSONB → array do supabase-js, string em legacy
                      const selecionados = safeParseJSON(form.projetos_ids, []);
                      const marcado = selecionados.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => {
                              const novos = marcado
                                ? selecionados.filter((id) => id !== p.id)
                                : [...selecionados, p.id];
                              setForm((prev) => ({ ...prev, projetos_ids: JSON.stringify(novos) }));
                              carregarOrcamentosMultiProjetos(novos);
                            }}
                            className="w-4 h-4"
                          />
                          <span className="text-sm text-slate-700">{p.nome}</span>
                        </label>
                      );
                    })}
                  </div>
                  {(() => {
                    const selecionados = safeParseJSON(form.projetos_ids, []);
                    const nomes = projetos
                      .filter((p) => selecionados.includes(p.id))
                      .map((p) => p.nome);
                    return nomes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {nomes.map((n) => (
                          <Badge key={n} className="text-xs bg-blue-100 text-blue-700">
                            {n}
                          </Badge>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  {loadingOrcamento && (
                    <p className="text-xs text-slate-500">Carregando itens dos orçamentos...</p>
                  )}
                  {!loadingOrcamento && form.itens.length > 0 && form.itens[0].descricao && (
                    <p className="text-xs text-blue-600">
                      {form.itens.filter((i) => i.descricao).length} itens agrupados carregados
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Prioridade</Label>
                <Select
                  value={form.prioridade}
                  onValueChange={(v) => setForm({ ...form, prioridade: v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Baixa">Baixa</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Alta">Alta</SelectItem>
                    <SelectItem value="Urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data de Necessidade</Label>
                <Input
                  type="date"
                  value={form.data_necessidade}
                  onChange={(e) => setForm({ ...form, data_necessidade: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Itens Solicitados</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowImportar(true)}
                  >
                    <Upload className="w-4 h-4 mr-1" /> Importar
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="w-4 h-4 mr-1" /> Adicionar Item
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {form.itens.map((item, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex flex-col md:flex-row gap-3 items-start">
                      <div className="flex-1 relative">
                        <Label className="text-xs text-slate-600 mb-1.5 block">Descrição *</Label>
                        <Input
                          ref={(el) => (inputRefs.current[`desc-${index}`] = el)}
                          placeholder="Buscar material ou ferramenta..."
                          value={item.descricao}
                          onChange={(e) => {
                            updateItem(index, "descricao", e.target.value);
                            setSugestoesAberta(index);
                            setSugestaoFocada(-1);
                          }}
                          onFocus={() => setSugestoesAberta(index)}
                          onBlur={() =>
                            setTimeout(() => {
                              setSugestoesAberta(null);
                              setSugestaoFocada(-1);
                            }, 200)
                          }
                          onKeyDown={(e) => {
                            const filtrados =
                              sugestoesAberta === index && item.descricao.length >= 1
                                ? materiais
                                    .filter((m) =>
                                      m.nome?.toLowerCase().includes(item.descricao.toLowerCase())
                                    )
                                    .slice(0, 10)
                                : [];

                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setSugestaoFocada((prev) => Math.min(prev + 1, filtrados.length - 1));
                              return;
                            }
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setSugestaoFocada((prev) => Math.max(prev - 1, 0));
                              return;
                            }
                            if (
                              e.key === "Enter" &&
                              sugestaoFocada >= 0 &&
                              filtrados[sugestaoFocada]
                            ) {
                              e.preventDefault();
                              updateItem(index, "descricao", filtrados[sugestaoFocada].nome);
                              setSugestoesAberta(null);
                              setSugestaoFocada(-1);
                              return;
                            }
                            if (e.key === "Escape") {
                              setSugestoesAberta(null);
                              setSugestaoFocada(-1);
                              return;
                            }
                            if (e.key === "Tab" && !e.shiftKey) {
                              if (sugestaoFocada >= 0 && filtrados[sugestaoFocada]) {
                                updateItem(index, "descricao", filtrados[sugestaoFocada].nome);
                              }
                              e.preventDefault();
                              setSugestoesAberta(null);
                              setSugestaoFocada(-1);
                              setTimeout(() => {
                                if (inputRefs.current[`qtd-${index}`]) {
                                  inputRefs.current[`qtd-${index}`].focus();
                                }
                              }, 10);
                            }
                          }}
                          className="w-full"
                          autoComplete="off"
                        />
                        {sugestoesAberta === index &&
                          item.descricao.length >= 1 &&
                          (() => {
                            const filtrados = materiais
                              .filter((m) =>
                                m.nome?.toLowerCase().includes(item.descricao.toLowerCase())
                              )
                              .slice(0, 10);
                            if (filtrados.length === 0) return null;
                            return (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-52 overflow-y-auto">
                                {filtrados.map((m, mIdx) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      updateItem(index, "descricao", m.nome);
                                      setSugestoesAberta(null);
                                      setSugestaoFocada(-1);
                                      setTimeout(() => {
                                        if (inputRefs.current[`qtd-${index}`]) {
                                          inputRefs.current[`qtd-${index}`].focus();
                                        }
                                      }, 10);
                                    }}
                                    className={`w-full text-left px-3 py-2 border-b last:border-b-0 flex items-center justify-between gap-2 ${mIdx === sugestaoFocada ? "bg-blue-50" : "hover:bg-slate-50"}`}
                                  >
                                    <span className="text-sm text-slate-800">{m.nome}</span>
                                    <span
                                      className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${m.tipo === "Ferramenta" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}
                                    >
                                      {m.tipo}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                      </div>

                      <div className="w-24">
                        <Label className="text-xs text-slate-600 mb-1.5 block">Quantidade</Label>
                        <Input
                          ref={(el) => (inputRefs.current[`qtd-${index}`] = el)}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={item.quantidade}
                          onChange={(e) =>
                            updateItem(index, "quantidade", parseFloat(e.target.value) || 0)
                          }
                          onKeyDown={(e) => handleTabQuantidade(e, index)}
                          className="w-full"
                        />
                      </div>

                      <div className="w-20">
                        <Label className="text-xs text-slate-600 mb-1.5 block">Unidade</Label>
                        <Input
                          ref={(el) => (inputRefs.current[`unid-${index}`] = el)}
                          placeholder="UN"
                          value={item.unidade}
                          onChange={(e) =>
                            updateItem(index, "unidade", e.target.value.toUpperCase())
                          }
                          onKeyDown={(e) => handleTabUnidade(e, index)}
                          className="w-full"
                          maxLength={5}
                        />
                      </div>

                      <div className="w-28 hidden sm:block">
                        <Label className="text-xs text-slate-600 mb-1.5 block">Reservado</Label>
                        <Input
                          type="text"
                          value={
                            item.qtd_reservada > 0
                              ? `${item.qtd_reservada} ${item.unidade || ""}`
                              : "—"
                          }
                          disabled
                          className={`w-full ${item.qtd_reservada > 0 ? "bg-blue-50 text-blue-700 font-medium" : "bg-slate-50 text-slate-400"}`}
                        />
                      </div>

                      <div className="w-32 hidden sm:block">
                        <Label className="text-xs text-slate-600 mb-1.5 block">Último Preço</Label>
                        <Input
                          type="text"
                          value={item.ultimo_preco ? `R$ ${item.ultimo_preco.toFixed(2)}` : "0,00"}
                          disabled
                          className="w-full bg-slate-50 text-slate-600"
                        />
                      </div>

                      <div className="w-32">
                        <Label className="text-xs text-slate-600 mb-1.5 block">
                          Preço unit. estimado
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={
                            item.preco_unitario_estimado == null ? "" : item.preco_unitario_estimado
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            updateItem(
                              index,
                              "preco_unitario_estimado",
                              v === "" ? null : parseFloat(v) || 0
                            );
                          }}
                          className="w-full"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          Valor estimado:{" "}
                          {fmtBRL((item.quantidade || 0) * (item.preco_unitario_estimado || 0))}
                        </p>
                      </div>

                      {form.itens.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(index)}
                          className="h-10 mt-6"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex justify-end items-center gap-3 border-t pt-3">
                <span className="text-xs text-slate-500">Total estimado da solicitação</span>
                <span className="text-base font-semibold text-emerald-700">
                  {fmtBRL(
                    form.itens.reduce(
                      (acc, it) =>
                        acc +
                        (Number(it.quantidade) || 0) * (Number(it.preco_unitario_estimado) || 0),
                      0
                    )
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                * Campos obrigatórios. Digite as últimas palavras para adicionar novos itens
                automaticamente.
              </p>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                className="mt-1.5"
                rows={3}
                placeholder="Informações adicionais sobre a solicitação..."
              />
            </div>
          </div>
          <div className="bg-white border-t p-6 flex justify-end gap-3 flex-shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={onSave}
              disabled={saving || !form.itens.some((i) => i.descricao && i.descricao.trim())}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {saving ? "Salvando..." : "Criar Solicitação"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
