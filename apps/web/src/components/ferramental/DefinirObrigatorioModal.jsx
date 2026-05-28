import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Truck, HardHat, Search, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Modal para vincular ferramentas selecionadas como obrigatórias
 * para Caminhões ou Funções.
 *
 * Props:
 *   open, onOpenChange
 *   modo: 'caminhao' | 'funcao'
 *   ferramentasSelecionadas: array de objetos { id, descricao, codigo }
 *   empresaAtiva
 */
export default function DefinirObrigatorioModal({
  open,
  onOpenChange,
  modo,
  ferramentasSelecionadas = [],
  empresaAtiva,
}) {
  const [itens, setItens] = useState([]); // caminhões ou funções disponíveis
  const [selecionados, setSelecionados] = useState([]); // ids dos selecionados
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const isCaminhao = modo === "caminhao";

  useEffect(() => {
    if (open && empresaAtiva) {
      setSelecionados([]);
      setSearch("");
      loadItens();
    }
  }, [open, empresaAtiva, modo]);

  const loadItens = async () => {
    setLoading(true);
    try {
      if (isCaminhao) {
        const result = await sigo.entities.Caminhao.filter({
          empresa_id: empresaAtiva.id,
          ativo: true,
        });
        setItens(result);
      } else {
        const result = await sigo.entities.Funcao.filter({
          empresa_id: empresaAtiva.id,
          ativo: true,
        });
        setItens(result);
      }
    } catch (e) {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelecionado = (id) => {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const toggleTodos = () => {
    const filtrados = itensFiltrados.map((i) => i.id);
    const todosSelecionados = filtrados.every((id) => selecionados.includes(id));
    if (todosSelecionados) {
      setSelecionados((prev) => prev.filter((id) => !filtrados.includes(id)));
    } else {
      setSelecionados((prev) => [...new Set([...prev, ...filtrados])]);
    }
  };

  const handleSalvar = async () => {
    if (selecionados.length === 0) {
      toast.error(`Selecione ao menos um ${isCaminhao ? "caminhão" : "função"}`);
      return;
    }
    setSalvando(true);
    try {
      let count = 0;

      if (isCaminhao) {
        // Para cada caminhão selecionado, vincular todas as ferramentas nos campos obrigatórios
        for (const caminhaoId of selecionados) {
          const caminhao = itens.find((c) => c.id === caminhaoId);
          // Buscar campos obrigatórios existentes do caminhão
          const campos = await sigo.entities.CaminhaoCampoObrigatorio.filter({
            empresa_id: empresaAtiva.id,
            caminhao_id: caminhaoId,
          });

          for (const ferr of ferramentasSelecionadas) {
            // Verificar se já existe um campo com esse nome
            let campoExistente = campos.find(
              (c) => c.nome_campo?.toLowerCase() === ferr.descricao?.toLowerCase()
            );

            if (campoExistente) {
              // Adicionar ferramenta ao campo existente
              const ids = safeParseJSON(campoExistente.ferramenta_ids, []);
              if (!ids.includes(ferr.id)) {
                ids.push(ferr.id);
                await sigo.entities.CaminhaoCampoObrigatorio.update(campoExistente.id, {
                  ferramenta_ids: JSON.stringify(ids),
                });
              }
            } else {
              // Criar novo campo obrigatório
              await sigo.entities.CaminhaoCampoObrigatorio.create({
                empresa_id: empresaAtiva.id,
                caminhao_id: caminhaoId,
                caminhao_placa: caminhao?.placa || "",
                nome_campo: ferr.descricao || ferr.codigo,
                quantidade_obrigatoria: 1,
                descricao: ferr.codigo ? `Código: ${ferr.codigo}` : "",
                ferramenta_ids: JSON.stringify([ferr.id]),
              });
            }
            count++;
          }
        }
        toast.success(
          `${ferramentasSelecionadas.length} ferramenta(s) definidas como obrigatórias para ${selecionados.length} caminhão(ões)`
        );
      } else {
        // Para cada função, adicionar ferramentas ao modelo_ferramentas e EPIs ao modelo_epi
        for (const funcaoId of selecionados) {
          const funcao = itens.find((f) => f.id === funcaoId);
          let modeloFerramentas = safeParseJSON(funcao?.modelo_ferramentas, []);
          let modeloEpi = safeParseJSON(funcao?.modelo_epi, []);

          for (const ferr of ferramentasSelecionadas) {
            if (ferr.tipo === "EPI") {
              // Adicionar ao modelo_epi
              const jaExiste = modeloEpi.some(
                (m) =>
                  m.ferramenta_id === ferr.id ||
                  m.item?.toLowerCase() === ferr.descricao?.toLowerCase()
              );
              if (!jaExiste) {
                modeloEpi.push({
                  ferramenta_id: ferr.id,
                  item: ferr.descricao || "",
                  ca: ferr.ca || ferr.codigo || "",
                  quantidade: 1,
                  validade: "",
                });
              }
            } else {
              // Adicionar ao modelo_ferramentas
              const jaExiste = modeloFerramentas.some(
                (m) =>
                  m.ferramenta_id === ferr.id ||
                  m.ferramenta?.toLowerCase() === ferr.descricao?.toLowerCase()
              );
              if (!jaExiste) {
                modeloFerramentas.push({
                  ferramenta_id: ferr.id,
                  ferramenta: ferr.descricao || "",
                  codigo: ferr.codigo || "",
                  quantidade: 1,
                  numero_serie: "",
                });
              }
            }
          }

          await sigo.entities.Funcao.update(funcaoId, {
            modelo_ferramentas: JSON.stringify(modeloFerramentas),
            modelo_epi: JSON.stringify(modeloEpi),
          });
          count++;
        }
        const totalEpis = ferramentasSelecionadas.filter((f) => f.tipo === "EPI").length;
        const totalFerr = ferramentasSelecionadas.filter((f) => f.tipo !== "EPI").length;
        toast.success(
          `Vinculado a ${selecionados.length} função(ões): ${totalEpis} EPI(s) e ${totalFerr} ferramenta(s)`
        );
      }

      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  const itensFiltrados = itens.filter((item) => {
    const label = isCaminhao ? `${item.placa} ${item.modelo || ""}` : item.nome;
    return label.toLowerCase().includes(search.toLowerCase());
  });

  const todosFiltradosSelecionados =
    itensFiltrados.length > 0 && itensFiltrados.every((i) => selecionados.includes(i.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <SheetHeader className="p-6 border-b sticky top-0 bg-white z-20">
          <SheetTitle className="flex items-center gap-2">
            {isCaminhao ? (
              <Truck className="w-5 h-5 text-blue-600" />
            ) : (
              <HardHat className="w-5 h-5 text-amber-600" />
            )}
            Definir Obrigatório para {isCaminhao ? "Caminhões" : "Funções"}
          </SheetTitle>
          <p className="text-sm text-slate-500 mt-1">
            {ferramentasSelecionadas.length} ferramenta(s) selecionada(s) serão adicionadas como
            obrigatórias.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Ferramentas selecionadas */}
          <div className="p-3 bg-slate-50 rounded-lg border">
            <p className="text-xs font-semibold text-slate-600 mb-2">Ferramentas a vincular:</p>
            <div className="flex flex-wrap gap-2">
              {ferramentasSelecionadas.map((f) => (
                <Badge key={f.id} variant="outline" className="text-xs">
                  {f.codigo && <span className="font-mono text-amber-700 mr-1">{f.codigo}</span>}
                  {f.descricao}
                </Badge>
              ))}
            </div>
          </div>

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder={`Buscar ${isCaminhao ? "caminhão" : "função"}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          {/* Selecionar todos */}
          {itensFiltrados.length > 0 && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed cursor-pointer hover:bg-slate-50"
              onClick={toggleTodos}
            >
              <Checkbox checked={todosFiltradosSelecionados} />
              <span className="text-sm text-slate-600">
                Selecionar todos ({itensFiltrados.length})
              </span>
            </div>
          )}

          {/* Lista */}
          {loading ? (
            <p className="text-sm text-slate-500 text-center py-8">Carregando...</p>
          ) : itensFiltrados.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Nenhum {isCaminhao ? "caminhão" : "função"} encontrado
            </p>
          ) : (
            <div className="space-y-2">
              {itensFiltrados.map((item) => {
                const label = isCaminhao ? item.placa : item.nome;
                const sub = isCaminhao ? item.modelo : item.categoria;
                const isSel = selecionados.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelecionado(item.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isSel ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <Checkbox checked={isSel} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{label}</p>
                      {sub && <p className="text-xs text-slate-500">{sub}</p>}
                    </div>
                    {isSel && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <SheetFooter className="p-4 border-t bg-white flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={salvando || selecionados.length === 0}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
            size="sm"
          >
            {salvando
              ? "Salvando..."
              : `Vincular a ${selecionados.length} ${isCaminhao ? "caminhão(ões)" : "função(ões)"}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
