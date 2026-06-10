import { useState, useEffect, useCallback, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { sigo, supabase } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { toast } from "sonner";
import {
  Wrench,
  Shield,
  PackageCheck,
  Loader2,
  Minus,
  Plus,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";

export default function SolicitarEntregaFerramentasModal({
  open,
  onOpenChange,
  funcionario,
  funcao,
  empresaAtiva,
  user,
  onSuccess,
  entregaExistente,
}) {
  const [abaAtiva, setAbaAtiva] = useState("ferramentas");
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(false);
  const [novoItemDesc, setNovoItemDesc] = useState("");
  const [novoItemQtd, setNovoItemQtd] = useState(1);
  const [buscaFerramenta, setBuscaFerramenta] = useState("");
  const [ferramentasDisponiveis, setFerramentasDisponiveis] = useState([]);
  const [episDisponiveis, setEpisDisponiveis] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);
  const [epis, setEpis] = useState([]);
  const [laudosNumeros, setLaudosNumeros] = useState({});
  const [numerosSerie, setNumerosSerie] = useState({});

  // ── Bloqueio operacional SST (ASO) ────────────────────────────────────────
  const [aptidao, setAptidao] = useState(null); // {apto, motivos, liberado_excepcionalmente, liberacao}
  const [mostrarLiberar, setMostrarLiberar] = useState(false);
  const [motivoLiberacao, setMotivoLiberacao] = useState("");
  const [liberando, setLiberando] = useState(false);

  const perfilUsuario = user?.perfil || (user?.role === "admin" ? "Admin" : "");
  const podeLiberar = ["Admin", "Admin Holding", "Gestor"].includes(perfilUsuario);

  const checarAptidao = useCallback(async () => {
    if (!funcionario?.id || !supabase) return;
    try {
      const { data, error } = await supabase.rpc("funcionario_apto_campo", {
        p_funcionario_id: funcionario.id,
      });
      if (error) throw error;
      setAptidao(data);
    } catch (err) {
      // falha técnica não trava a operação (fail-open); o trigger airtight é fase 2
      console.error("Erro ao checar aptidão SST:", err);
      setAptidao(null);
    }
  }, [funcionario?.id]);

  const handleLiberar = async () => {
    if (motivoLiberacao.trim().length < 5) {
      toast.error("Justifique a liberação (mín. 5 caracteres)");
      return;
    }
    setLiberando(true);
    try {
      const { error } = await supabase.rpc("liberar_sst", {
        p_funcionario_id: funcionario.id,
        p_motivo: motivoLiberacao.trim(),
        p_liberado_por_email: user?.email || "",
        p_liberado_por_nome: user?.full_name || user?.email || "",
        p_perfil: perfilUsuario,
        p_dias_validade: 30,
      });
      if (error) throw error;
      toast.success("Liberado excepcionalmente. Entrega permitida por 30 dias.");
      setMostrarLiberar(false);
      setMotivoLiberacao("");
      await checarAptidao();
    } catch (err) {
      toast.error("Erro ao liberar: " + (err?.message || "tente de novo"));
    } finally {
      setLiberando(false);
    }
  };

  // Refs para manter seleção atual ao atualizar
  const ferramentasRef = useRef([]);
  const episRef = useRef([]);
  ferramentasRef.current = ferramentas;
  episRef.current = epis;

  const isItemSeriado = (desc) => {
    const d = (desc || "").toLowerCase();
    return (
      (d.includes("luva") && d.includes("borracha")) ||
      (d.includes("luva") && d.includes("couro")) ||
      d.includes("manga isolante") ||
      d.includes("manga de borracha")
    );
  };

  const itensEPIBase = safeParseJSON(funcao?.modelo_epi, [])
    .map((i) => ({
      descricao: i.item || i.descricao || i.nome || "",
      tipo: "EPI",
      quantidade_modelo: i.quantidade || 1,
    }))
    .filter((item, idx, arr) => {
      if (isItemSeriado(item.descricao)) return true;
      return (
        arr.findIndex(
          (x) => x.descricao.toLowerCase().trim() === item.descricao.toLowerCase().trim()
        ) === idx
      );
    });

  const itensFerramentasBase = safeParseJSON(funcao?.modelo_ferramentas, [])
    .map((i) => ({
      descricao: i.ferramenta || i.item || i.descricao || i.nome || "",
      tipo: "Ferramenta",
      quantidade_modelo: i.quantidade || 1,
    }))
    .filter((item, idx, arr) => {
      if (isItemSeriado(item.descricao)) return true;
      return (
        arr.findIndex(
          (x) => x.descricao.toLowerCase().trim() === item.descricao.toLowerCase().trim()
        ) === idx
      );
    });

  const processarItens = (ferramentasData, episData) => {
    const usadasFerr = new Set();
    const usadasEPIFerr = new Set();
    const ferramentasIniciaisTemp = [];
    const episDeFerramentasTemp = [];

    itensFerramentasBase.forEach((i) => {
      const descNorm = (i.descricao || "").toLowerCase().trim();
      const seriado = isItemSeriado(i.descricao);

      // Buscar nos registros de Ferramenta
      const matchesFerr = ferramentasData.filter(
        (f) => !usadasFerr.has(f.id) && (f.descricao || "").toLowerCase().trim() === descNorm
      );

      if (matchesFerr.length > 0) {
        const lista = seriado ? matchesFerr.slice(0, 2) : [matchesFerr[0]];
        lista.forEach((matchFerr) => {
          usadasFerr.add(matchFerr.id);
          const tipoReal = matchFerr.tipo === "EPI" ? "EPI" : "Ferramenta";
          if (tipoReal === "EPI") {
            usadasEPIFerr.add(matchFerr.id);
            episDeFerramentasTemp.push({
              ...i,
              tipo: "EPI",
              quantidade: 1,
              selecionado: true,
              numero_laudo: matchFerr.numero_laudo || matchFerr.ca || "",
              numero_serie: matchFerr.numero_serie || "",
              epi_id: matchFerr.id,
            });
          } else {
            ferramentasIniciaisTemp.push({
              ...i,
              quantidade: 1,
              selecionado: true,
              numero_laudo: matchFerr.numero_laudo || "",
              numero_serie: matchFerr.numero_serie || "",
              ferramenta_id: matchFerr.id,
            });
          }
        });
        return;
      }

      // Tentar nos EPIs
      const matchesEPI = episData.filter(
        (e) =>
          !usadasEPIFerr.has(e.id) &&
          ((e.descricao || "").toLowerCase().trim() === descNorm ||
            (e.nome || "").toLowerCase().trim() === descNorm)
      );
      if (matchesEPI.length > 0) {
        const lista = seriado ? matchesEPI.slice(0, 2) : [matchesEPI[0]];
        lista.forEach((matchEPI) => {
          usadasEPIFerr.add(matchEPI.id);
          episDeFerramentasTemp.push({
            ...i,
            tipo: "EPI",
            quantidade: 1,
            selecionado: true,
            numero_laudo: matchEPI.numero_laudo || matchEPI.ca || "",
            numero_serie: matchEPI.numero_serie || "",
            epi_id: matchEPI.id,
          });
        });
      }
      // Não encontrou: ignorar (item excluído/desativado)
    });

    const usadasEPI = new Set([...usadasEPIFerr]);
    const episDoModelo = [];
    itensEPIBase.forEach((i) => {
      const descNorm = (i.descricao || "").toLowerCase().trim();
      const seriado = isItemSeriado(i.descricao);
      const matchesEPI = episData.filter(
        (e) =>
          !usadasEPI.has(e.id) &&
          ((e.descricao || "").toLowerCase().trim() === descNorm ||
            (e.nome || "").toLowerCase().trim() === descNorm)
      );
      if (matchesEPI.length === 0) return; // ignorar
      const lista = seriado ? matchesEPI.slice(0, 2) : [matchesEPI[0]];
      lista.forEach((match) => {
        usadasEPI.add(match.id);
        episDoModelo.push({
          ...i,
          quantidade: 1,
          selecionado: true,
          numero_laudo: match.numero_laudo || match.ca || "",
          numero_serie: match.numero_serie || "",
          epi_id: match.id,
        });
      });
    });

    const episIniciais = [...episDeFerramentasTemp, ...episDoModelo];

    return { ferramentasFinais: ferramentasIniciaisTemp, episFinais: episIniciais };
  };

  const carregarItens = useCallback(
    async (preservarSelecao = false) => {
      if (!empresaAtiva?.id) return;
      try {
        const [ferramentasData, episData] = await Promise.all([
          sigo.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }),
          sigo.entities.EPI.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        ]);
        setFerramentasDisponiveis(ferramentasData || []);
        setEpisDisponiveis(episData || []);

        const { ferramentasFinais, episFinais } = processarItens(ferramentasData, episData);

        if (preservarSelecao) {
          // Manter seleção/quantidade dos itens que ainda existem, remover os excluídos
          setFerramentas((prev) => {
            const existentes = prev
              .filter((p) =>
                ferramentasFinais.some(
                  (f) =>
                    (f.descricao || "").toLowerCase().trim() ===
                    (p.descricao || "").toLowerCase().trim()
                )
              )
              .map((p) => {
                const novo = ferramentasFinais.find(
                  (f) =>
                    (f.descricao || "").toLowerCase().trim() ===
                    (p.descricao || "").toLowerCase().trim()
                );
                return { ...novo, selecionado: p.selecionado, quantidade: p.quantidade };
              });
            const novos = ferramentasFinais.filter(
              (f) =>
                !prev.some(
                  (p) =>
                    (p.descricao || "").toLowerCase().trim() ===
                    (f.descricao || "").toLowerCase().trim()
                )
            );
            return [...existentes, ...novos].sort((a, b) =>
              (a.descricao || "").localeCompare(b.descricao || "", "pt-BR")
            );
          });
          setEpis((prev) => {
            const existentes = prev
              .filter((p) =>
                episFinais.some(
                  (e) =>
                    (e.descricao || "").toLowerCase().trim() ===
                    (p.descricao || "").toLowerCase().trim()
                )
              )
              .map((p) => {
                const novo = episFinais.find(
                  (e) =>
                    (e.descricao || "").toLowerCase().trim() ===
                    (p.descricao || "").toLowerCase().trim()
                );
                return { ...novo, selecionado: p.selecionado, quantidade: p.quantidade };
              });
            const novos = episFinais.filter(
              (e) =>
                !prev.some(
                  (p) =>
                    (p.descricao || "").toLowerCase().trim() ===
                    (e.descricao || "").toLowerCase().trim()
                )
            );
            return [...existentes, ...novos].sort((a, b) =>
              (a.descricao || "").localeCompare(b.descricao || "", "pt-BR")
            );
          });
        } else {
          setFerramentas(
            ferramentasFinais.sort((a, b) =>
              (a.descricao || "").localeCompare(b.descricao || "", "pt-BR")
            )
          );
          setEpis(
            episFinais.sort((a, b) => (a.descricao || "").localeCompare(b.descricao || "", "pt-BR"))
          );
        }
      } catch (err) {
        console.error("Erro ao carregar ferramentas/EPIs:", err);
      }
    },
    [empresaAtiva?.id, funcao?.modelo_ferramentas, funcao?.modelo_epi]
  );

  // Carregar ao abrir modal
  useEffect(() => {
    if (open && empresaAtiva?.id) {
      setAbaAtiva("ferramentas");
      setNovoItemDesc("");
      setNovoItemQtd(1);
      setBuscaFerramenta("");
      setLaudosNumeros({});
      setNumerosSerie({});

      if (entregaExistente) {
        // Modo edição: carregar itens existentes
        setObservacoes(entregaExistente.observacoes || "");
        const itensExistentes = safeParseJSON(entregaExistente.itens, []);
        const ferrs = itensExistentes
          .filter((i) => i.tipo !== "EPI")
          .map((i) => ({ ...i, selecionado: true, quantidade: i.quantidade || 1 }));
        const episList = itensExistentes
          .filter((i) => i.tipo === "EPI")
          .map((i) => ({ ...i, selecionado: true, quantidade: i.quantidade || 1 }));
        setFerramentas(ferrs);
        setEpis(episList);
      } else {
        setObservacoes("");
        setFerramentas([]);
        setEpis([]);
        carregarItens(false);
      }
    }
  }, [open, empresaAtiva?.id, entregaExistente?.id]);

  // Checa aptidão SST (ASO) ao abrir / trocar de funcionário
  useEffect(() => {
    if (open && funcionario?.id) {
      setMostrarLiberar(false);
      setMotivoLiberacao("");
      checarAptidao();
    } else {
      setAptidao(null);
    }
  }, [open, funcionario?.id, checarAptidao]);

  // Subscriptions para atualização automática quando itens são adicionados/excluídos
  useEffect(() => {
    if (!open || !empresaAtiva?.id) return;
    const unsubFerramenta = sigo.entities.Ferramenta.subscribe(() => carregarItens(true));
    const unsubEPI = sigo.entities.EPI.subscribe(() => carregarItens(true));
    return () => {
      unsubFerramenta();
      unsubEPI();
    };
  }, [open, empresaAtiva?.id, carregarItens]);

  const updateQtd = (lista, setLista, idx, delta) => {
    setLista(
      lista.map((item, i) =>
        i === idx ? { ...item, quantidade: Math.max(0, (item.quantidade || 1) + delta) } : item
      )
    );
  };

  const setQtd = (lista, setLista, idx, val) => {
    const n = parseInt(val);
    if (!isNaN(n) && n >= 0) {
      setLista(lista.map((item, i) => (i === idx ? { ...item, quantidade: n } : item)));
    }
  };

  const toggleItem = (lista, setLista, idx) => {
    setLista(
      lista.map((item, i) => (i === idx ? { ...item, selecionado: !item.selecionado } : item))
    );
  };

  const itensSelecionados = [
    ...ferramentas.filter((i) => i.selecionado && (i.quantidade || 0) > 0),
    ...epis.filter((i) => i.selecionado && (i.quantidade || 0) > 0),
  ];

  const handleSolicitar = async () => {
    if (itensSelecionados.length === 0) {
      toast.error("Selecione ao menos um item para entregar");
      return;
    }
    if (aptidao && !aptidao.apto) {
      toast.error(
        "Funcionário bloqueado por SST (ASO). Regularize o ASO ou peça liberação ao Admin."
      );
      return;
    }
    setLoading(true);
    try {
      const temFerramenta = itensSelecionados.some((i) => i.tipo === "Ferramenta");
      const temEPI = itensSelecionados.some((i) => i.tipo === "EPI");
      const tipo =
        temFerramenta && temEPI ? "Ferramentas e EPIs" : temFerramenta ? "Ferramentas" : "EPIs";

      const payload = {
        empresa_id: empresaAtiva.id,
        funcionario_id: funcionario.id,
        funcionario_nome: funcionario.nome_completo,
        funcao_id: funcionario.funcao_id,
        funcao_nome: funcionario.funcao_nome || funcao?.nome || "",
        status: "Pendente",
        tipo,
        itens: JSON.stringify(
          itensSelecionados.map((i) => ({
            descricao: i.descricao,
            tipo: i.tipo,
            quantidade: i.quantidade,
            numero_laudo: i.numero_laudo || "",
            numero_serie: i.numero_serie || "",
            ferramenta_id: i.ferramenta_id || null,
          }))
        ),
        solicitante_nome: user?.full_name || "",
        solicitante_email: user?.email || "",
        data_solicitacao: format(new Date(), "yyyy-MM-dd"),
        observacoes,
      };

      if (entregaExistente) {
        await sigo.entities.EntregaFerramental.update(entregaExistente.id, payload);
      } else {
        await sigo.entities.EntregaFerramental.create(payload);
      }
      toast.success("Solicitação de entrega criada! O almoxarife verá no módulo Ferramental.");
      onSuccess ? onSuccess() : onOpenChange(false);
    } catch (err) {
      toast.error("Erro ao criar solicitação");
    } finally {
      setLoading(false);
    }
  };

  const renderTabela = (lista, setLista) => {
    if (lista.length === 0) {
      return (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 text-center">
          Nenhum item selecionado.
        </div>
      );
    }
    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-8"></th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Item</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-32">
                Laudo/Série
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-36">
                Qtd. Solicitada
              </th>
            </tr>
          </thead>
          <tbody>
            {lista.map((item, idx) => (
              <tr
                key={idx}
                className={`${idx % 2 === 0 ? "bg-white" : "bg-slate-50"} ${!item.selecionado || item.quantidade === 0 ? "opacity-40" : ""}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={item.selecionado}
                    onChange={() => toggleItem(lista, setLista, idx)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={item.descricao}
                    onChange={(e) =>
                      setLista(
                        lista.map((it, i) =>
                          i === idx ? { ...it, descricao: e.target.value } : it
                        )
                      )
                    }
                    className="w-full text-sm font-medium text-slate-800 border border-transparent hover:border-slate-300 focus:border-blue-400 rounded px-1 py-0.5 bg-transparent focus:bg-white outline-none"
                    title="Clique para editar"
                  />
                </td>
                <td className="px-3 py-2 text-xs text-slate-600 space-y-1">
                  <input
                    type="text"
                    placeholder="Nº Laudo"
                    value={item.numero_laudo || ""}
                    onChange={(e) =>
                      setLista(
                        lista.map((it, i) =>
                          i === idx ? { ...it, numero_laudo: e.target.value } : it
                        )
                      )
                    }
                    className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white outline-none focus:border-blue-400"
                  />
                  <input
                    type="text"
                    placeholder="Nº Série"
                    value={item.numero_serie || ""}
                    onChange={(e) =>
                      setLista(
                        lista.map((it, i) =>
                          i === idx ? { ...it, numero_serie: e.target.value } : it
                        )
                      )
                    }
                    className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white outline-none focus:border-blue-400"
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => updateQtd(lista, setLista, idx, -1)}
                      disabled={!item.selecionado}
                      className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={item.quantidade}
                      onChange={(e) => setQtd(lista, setLista, idx, e.target.value)}
                      disabled={!item.selecionado}
                      className="w-12 text-center text-sm border border-slate-300 rounded px-1 py-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
                    />
                    <button
                      onClick={() => updateQtd(lista, setLista, idx, 1)}
                      disabled={!item.selecionado}
                      className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderBuscaFerramentas = () => {
    const ferramentasFiltradas = ferramentasDisponiveis.filter((f) => {
      // Filtro de disponibilidade: sem vínculo ativo OU vinculado ao mesmo funcionário/caminhão
      const temVincAtivoOutro =
        (f.funcionario_id && f.funcionario_id !== funcionario?.id) ||
        (f.caminhao_id && f.caminhao_id !== entregaExistente?.caminhao_id);
      if (temVincAtivoOutro) return false; // Não mostrar se vinculado a outro funcionário/caminhão

      return (
        f.descricao?.toLowerCase().includes(buscaFerramenta.toLowerCase()) ||
        f.codigo?.toLowerCase().includes(buscaFerramenta.toLowerCase())
      );
    });

    return (
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Buscar ferramenta (ex: LUVA ISOLANTE 0,5KV)..."
          value={buscaFerramenta}
          onChange={(e) => setBuscaFerramenta(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        {buscaFerramenta && ferramentasFiltradas.length > 0 && (
          <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
            {ferramentasFiltradas.map((f, idx) => (
              <button
                key={f.id}
                onClick={() => {
                  const tipoReal = f.tipo === "EPI" ? "EPI" : "Ferramenta";
                  const novoItem = {
                    descricao: f.descricao,
                    tipo: tipoReal,
                    quantidade: 1,
                    selecionado: true,
                    numero_laudo: f.numero_laudo || f.ca || "",
                    numero_serie: f.numero_serie || "",
                    ferramenta_id: tipoReal === "Ferramenta" ? f.id : null,
                    epi_id: tipoReal === "EPI" ? f.id : null,
                  };
                  if (tipoReal === "EPI") {
                    setEpis((prev) => [...prev, novoItem]);
                    setAbaAtiva("epis");
                  } else {
                    setFerramentas((prev) => [...prev, novoItem]);
                  }
                  setBuscaFerramenta("");
                }}
                className={`w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
              >
                <div className="font-medium text-slate-800">{f.descricao}</div>
                {f.codigo && <div className="text-xs text-slate-400">{f.codigo}</div>}
                {(f.numero_laudo || f.numero_serie) && (
                  <div className="text-xs text-slate-500 mt-0.5">
                    {f.numero_laudo && <span>Laudo: {f.numero_laudo}</span>}
                    {f.numero_laudo && f.numero_serie && <span> • </span>}
                    {f.numero_serie && <span>Série: {f.numero_serie}</span>}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
        {buscaFerramenta && ferramentasFiltradas.length === 0 && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500 text-center">
            Nenhuma ferramenta encontrada
          </div>
        )}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full h-full overflow-y-auto p-0"
        data-fullscreen-modal
        onOpenChange={(open) => {
          if (!open) {
            setAbaAtiva("ferramentas");
            setObservacoes("");
            setNovoItemDesc("");
            setNovoItemQtd(1);
            setLaudosNumeros({});
            setNumerosSerie({});
          }
          onOpenChange(open);
        }}
      >
        <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-white z-10">
          <SheetTitle>
            {entregaExistente
              ? "Editar Solicitação de Entrega"
              : "Solicitar Entrega de Ferramentas/EPIs"}
          </SheetTitle>
          <p className="text-sm text-slate-500">
            Funcionário: <strong>{funcionario?.nome_completo}</strong> — Função:{" "}
            <strong>{funcao?.nome}</strong>
          </p>
        </SheetHeader>

        <div className="p-6 space-y-5">
          {/* Bloqueio operacional SST (ASO vencido) */}
          {aptidao && !aptidao.apto && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-800">
                  <p className="font-semibold">
                    Funcionário não pode receber ferramenta / ir a campo
                  </p>
                  <ul className="list-disc list-inside mt-1">
                    {(Array.isArray(aptidao.motivos) ? aptidao.motivos : []).map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {podeLiberar && !mostrarLiberar && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-100"
                  onClick={() => setMostrarLiberar(true)}
                >
                  Liberar excepcionalmente (Admin)
                </Button>
              )}
              {podeLiberar && mostrarLiberar && (
                <div className="space-y-2">
                  <textarea
                    value={motivoLiberacao}
                    onChange={(e) => setMotivoLiberacao(e.target.value)}
                    rows={2}
                    placeholder="Justificativa da liberação (obrigatória, fica registrada)..."
                    className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleLiberar}
                      disabled={liberando}
                      className="bg-red-600 hover:bg-red-700 text-white gap-2"
                    >
                      {liberando && <Loader2 className="w-4 h-4 animate-spin" />}
                      Confirmar liberação (30 dias)
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setMostrarLiberar(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
              {!podeLiberar && (
                <p className="text-xs text-red-600">
                  Apenas Admin/Gestor pode liberar excepcionalmente.
                </p>
              )}
            </div>
          )}
          {aptidao && aptidao.apto && aptidao.liberado_excepcionalmente && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">Liberado excepcionalmente</p>
                <p className="text-xs">
                  {aptidao.liberacao?.motivo} — por {aptidao.liberacao?.liberado_por}
                </p>
              </div>
            </div>
          )}

          {/* Abas Ferramentas / EPIs */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setAbaAtiva("ferramentas")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${abaAtiva === "ferramentas" ? "bg-white text-blue-700 shadow-sm border border-blue-200" : "text-slate-600 hover:text-slate-800"}`}
            >
              <Wrench className="w-4 h-4" />
              Ferramentas
              {ferramentas.length > 0 && (
                <span
                  className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${abaAtiva === "ferramentas" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"}`}
                >
                  {ferramentas.filter((i) => i.selecionado).length}/{ferramentas.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setAbaAtiva("epis")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${abaAtiva === "epis" ? "bg-white text-green-700 shadow-sm border border-green-200" : "text-slate-600 hover:text-slate-800"}`}
            >
              <Shield className="w-4 h-4" />
              EPIs
              {epis.length > 0 && (
                <span
                  className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${abaAtiva === "epis" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}
                >
                  {epis.filter((i) => i.selecionado).length}/{epis.length}
                </span>
              )}
            </button>
          </div>

          {/* Conteúdo da aba */}
          {abaAtiva === "ferramentas" ? (
            <div className="space-y-3">
              <label className="text-sm font-semibold text-slate-700 block">
                Selecionar Ferramentas
              </label>
              {renderBuscaFerramentas()}
              {ferramentas.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-700">
                      Ferramentas selecionadas
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setFerramentas(ferramentas.map((i) => ({ ...i, selecionado: true })))
                        }
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Todos
                      </button>
                      <button
                        onClick={() =>
                          setFerramentas(ferramentas.map((i) => ({ ...i, selecionado: false })))
                        }
                        className="text-xs text-slate-500 hover:underline"
                      >
                        Nenhum
                      </button>
                    </div>
                  </div>
                  {renderTabela(ferramentas, setFerramentas)}
                </>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-700">EPIs a entregar</label>
                {epis.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEpis(epis.map((i) => ({ ...i, selecionado: true })))}
                      className="text-xs text-green-600 hover:underline"
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setEpis(epis.map((i) => ({ ...i, selecionado: false })))}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      Nenhum
                    </button>
                  </div>
                )}
              </div>
              {renderTabela(epis, setEpis)}
            </div>
          )}

          {/* Resumo */}
          {itensSelecionados.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="text-sm text-blue-700">
                <strong>{itensSelecionados.length}</strong> item(ns) selecionado(s) para entrega
                {ferramentas.filter((i) => i.selecionado).length > 0 &&
                  epis.filter((i) => i.selecionado).length > 0 && (
                    <span className="text-blue-500 ml-1">
                      ({ferramentas.filter((i) => i.selecionado).length} ferr. +{" "}
                      {epis.filter((i) => i.selecionado).length} EPIs)
                    </span>
                  )}
              </span>
            </div>
          )}

          {/* Adicionar item avulso */}
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-2 block">
              Adicionar item avulso
            </label>
            {/* Sugestões de preenchimento automático */}
            {novoItemDesc.length > 0 && (
              <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700 font-semibold mb-1">
                  Sugestões de Alto Preenchimento:
                </p>
                <div className="space-y-1">
                  {ferramentas
                    .filter(
                      (f) =>
                        f.descricao?.toLowerCase().includes(novoItemDesc.toLowerCase()) &&
                        f.descricao !== novoItemDesc
                    )
                    .slice(0, 3)
                    .map((f, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setNovoItemDesc(f.descricao);
                          setNovoItemQtd(f.quantidade_modelo || 1);
                        }}
                        className="w-full text-left px-2 py-1.5 bg-white rounded border border-amber-100 hover:bg-amber-100 text-xs text-amber-900 transition-colors"
                      >
                        <div className="font-medium">{f.descricao}</div>
                        <div className="text-amber-700">
                          Qtd. sugerida: {f.quantidade_modelo || 1}
                        </div>
                      </button>
                    ))}
                  {epis
                    .filter(
                      (e) =>
                        e.descricao?.toLowerCase().includes(novoItemDesc.toLowerCase()) &&
                        e.descricao !== novoItemDesc
                    )
                    .slice(0, 3)
                    .map((e, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setNovoItemDesc(e.descricao);
                          setNovoItemQtd(e.quantidade_modelo || 1);
                        }}
                        className="w-full text-left px-2 py-1.5 bg-white rounded border border-amber-100 hover:bg-amber-100 text-xs text-amber-900 transition-colors"
                      >
                        <div className="font-medium">{e.descricao}</div>
                        <div className="text-amber-700">
                          Qtd. sugerida: {e.quantidade_modelo || 1}
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={
                  abaAtiva === "ferramentas" ? "Nome da ferramenta..." : "Nome do EPI..."
                }
                value={novoItemDesc}
                onChange={(e) => setNovoItemDesc(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && novoItemDesc.trim()) {
                    const item = {
                      descricao: novoItemDesc.trim(),
                      tipo: abaAtiva === "ferramentas" ? "Ferramenta" : "EPI",
                      quantidade_modelo: novoItemQtd,
                      quantidade: novoItemQtd,
                      selecionado: true,
                    };
                    if (abaAtiva === "ferramentas") setFerramentas((prev) => [...prev, item]);
                    else setEpis((prev) => [...prev, item]);
                    setNovoItemDesc("");
                    setNovoItemQtd(1);
                  }
                }}
              />
              <input
                type="number"
                min={1}
                value={novoItemQtd}
                onChange={(e) => setNovoItemQtd(parseInt(e.target.value) || 1)}
                className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-center"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (!novoItemDesc.trim()) return;
                  const item = {
                    descricao: novoItemDesc.trim(),
                    tipo: abaAtiva === "ferramentas" ? "Ferramenta" : "EPI",
                    quantidade_modelo: novoItemQtd,
                    quantidade: novoItemQtd,
                    selecionado: true,
                    status: "Pendente",
                  };
                  if (abaAtiva === "ferramentas") setFerramentas((prev) => [...prev, item]);
                  else setEpis((prev) => [...prev, item]);
                  setNovoItemDesc("");
                  setNovoItemQtd(1);
                }}
                disabled={!novoItemDesc.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1 block">
              Observações (opcional)
            </label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              placeholder="Ex: Funcionário iniciando na obra X, entregar com urgência..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* Ações */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleSolicitar}
              disabled={loading || itensSelecionados.length === 0 || (aptidao && !aptidao.apto)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PackageCheck className="w-4 h-4" />
              )}
              {loading
                ? entregaExistente
                  ? "Salvando..."
                  : "Criando..."
                : entregaExistente
                  ? `Salvar Alterações (${itensSelecionados.length})`
                  : `Solicitar Entrega (${itensSelecionados.length})`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
