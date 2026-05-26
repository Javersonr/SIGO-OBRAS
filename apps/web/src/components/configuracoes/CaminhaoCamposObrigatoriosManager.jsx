import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Upload, Download, Wrench, X, Search, Sparkles, Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function CaminhaoCamposObrigatoriosManager({
  caminhao,
  open,
  onOpenChange,
  empresaAtiva,
  onSave,
}) {
  const [campos, setCampos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [novoCampo, setNovoCampo] = useState({
    nome_campo: "",
    quantidade_obrigatoria: 1,
    descricao: "",
  });
  const [ferramentasDisponiveis, setFerramentasDisponiveis] = useState([]);
  const [campoExpandido, setCampoExpandido] = useState(null);
  const [searchFerramenta, setSearchFerramenta] = useState("");
  const [sugestoes, setSugestoes] = useState(null); // { campoId, ferramentas[] }
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);

  useEffect(() => {
    if (open && caminhao?.id) {
      loadCampos();
      loadFerramentas();
    }
  }, [open, caminhao?.id]);

  const loadCampos = async () => {
    try {
      setLoading(true);
      const dados = await sigo.entities.CaminhaoCampoObrigatorio.filter({
        empresa_id: empresaAtiva?.id,
        caminhao_id: caminhao.id,
        ativo: true,
      });
      setCampos(dados.sort((a, b) => (a.nome_campo || "").localeCompare(b.nome_campo || "")));
    } catch (error) {
      console.error("Erro ao carregar campos:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadFerramentas = async () => {
    try {
      const ferrs = await sigo.entities.Ferramenta.filter({
        empresa_id: empresaAtiva?.id,
        ativo: true,
      });
      setFerramentasDisponiveis(ferrs);
    } catch (error) {
      console.error("Erro ao carregar ferramentas:", error);
    }
  };

  const adicionarCampo = async () => {
    if (!novoCampo.nome_campo.trim() || novoCampo.quantidade_obrigatoria <= 0) {
      alert("Preencha o nome do campo e a quantidade");
      return;
    }

    try {
      setLoading(true);
      await sigo.entities.CaminhaoCampoObrigatorio.create({
        empresa_id: empresaAtiva?.id,
        caminhao_id: caminhao.id,
        caminhao_placa: caminhao.placa,
        nome_campo: novoCampo.nome_campo.trim(),
        quantidade_obrigatoria: novoCampo.quantidade_obrigatoria,
        descricao: novoCampo.descricao.trim(),
        ferramenta_ids: "[]",
      });

      setNovoCampo({ nome_campo: "", quantidade_obrigatoria: 1, descricao: "" });
      await loadCampos();
    } catch (error) {
      console.error("Erro ao adicionar campo:", error);
      alert("Erro ao adicionar campo");
    } finally {
      setLoading(false);
    }
  };

  const deletarCampo = async (id) => {
    if (!confirm("Tem certeza que deseja deletar este campo?")) return;
    try {
      setLoading(true);
      await sigo.entities.CaminhaoCampoObrigatorio.delete(id);
      await loadCampos();
    } catch (error) {
      console.error("Erro ao deletar:", error);
      alert("Erro ao deletar campo");
    } finally {
      setLoading(false);
    }
  };

  const getFerramentaIds = (campo) => {
    try {
      return JSON.parse(campo.ferramenta_ids || "[]");
    } catch {
      return [];
    }
  };

  const vincularFerramenta = async (campo, ferramentaId) => {
    const ids = getFerramentaIds(campo);
    if (ids.includes(ferramentaId)) return;
    const novosIds = [...ids, ferramentaId];
    await sigo.entities.CaminhaoCampoObrigatorio.update(campo.id, {
      ferramenta_ids: JSON.stringify(novosIds),
    });
    await loadCampos();
  };

  // Normaliza texto para comparação (remove acentos, minúscula, espaços extras)
  const normalizar = (str) =>
    (str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const gerarSugestoes = (campo) => {
    const ids = getFerramentaIds(campo);
    const palavrasChave = normalizar(campo.nome_campo)
      .split(" ")
      .filter((p) => p.length > 3);

    const sugeridas = ferramentasDisponiveis
      .filter((f) => {
        if (ids.includes(f.id)) return false; // já vinculada
        const descNorm = normalizar(f.descricao);
        // pontua por quantidade de palavras-chave encontradas
        return palavrasChave.some((p) => descNorm.includes(p));
      })
      .map((f) => {
        const descNorm = normalizar(f.descricao);
        const pontos = palavrasChave.filter((p) => descNorm.includes(p)).length;
        return { ...f, pontos };
      })
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, 15);

    setSugestoes({ campoId: campo.id, ferramentas: sugeridas });
  };

  const desvincularFerramenta = async (campo, ferramentaId) => {
    const ids = getFerramentaIds(campo);
    const novosIds = ids.filter((id) => id !== ferramentaId);
    await sigo.entities.CaminhaoCampoObrigatorio.update(campo.id, {
      ferramenta_ids: JSON.stringify(novosIds),
    });
    await loadCampos();
  };

  const importarPlanilha = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const dados = XLSX.utils.sheet_to_json(sheet);
      for (const linha of dados) {
        if (linha["Nome Campo"] && linha["Quantidade"]) {
          await sigo.entities.CaminhaoCampoObrigatorio.create({
            empresa_id: empresaAtiva?.id,
            caminhao_id: caminhao.id,
            caminhao_placa: caminhao.placa,
            nome_campo: String(linha["Nome Campo"]).trim(),
            quantidade_obrigatoria: Number(linha["Quantidade"]) || 1,
            descricao: String(linha["Descrição"] || "").trim(),
            ferramenta_ids: "[]",
          });
        }
      }
      await loadCampos();
      alert("Planilha importada com sucesso!");
    } catch (error) {
      console.error("Erro ao importar:", error);
      alert("Erro ao importar planilha");
    } finally {
      setLoading(false);
    }
  };

  const exportarPlanilha = () => {
    const dadosExportar = campos.map((campo) => ({
      "Nome Campo": campo.nome_campo,
      Quantidade: campo.quantidade_obrigatoria,
      Descrição: campo.descricao || "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(dadosExportar);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Campos");
    XLSX.writeFile(workbook, `campos_${caminhao?.placa || "caminhao"}.xlsx`);
  };

  const downloadTemplate = () => {
    const template = [
      { "Nome Campo": "Exemplo: Chave Inglesa", Quantidade: 2, Descrição: "Descrição opcional" },
    ];
    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    XLSX.writeFile(workbook, "template_campos_obrigatorios.xlsx");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full h-full overflow-y-auto !p-0"
        data-fullscreen-modal
      >
        <SheetHeader className="p-6 border-b border-slate-200 sticky top-0 bg-white">
          <SheetTitle>Campos Obrigatórios - {caminhao?.placa}</SheetTitle>
        </SheetHeader>

        <div className="p-6 space-y-6">
          <Tabs defaultValue="gerenciar" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="gerenciar">Gerenciar</TabsTrigger>
              <TabsTrigger value="importar">Importar</TabsTrigger>
            </TabsList>

            {/* ABA GERENCIAR */}
            <TabsContent value="gerenciar" className="space-y-4">
              <Card className="bg-slate-50">
                <CardHeader>
                  <CardTitle className="text-base">Adicionar Campo Manual</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Nome do campo/ferramenta"
                    value={novoCampo.nome_campo}
                    onChange={(e) => setNovoCampo({ ...novoCampo, nome_campo: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      placeholder="Quantidade"
                      value={novoCampo.quantidade_obrigatoria}
                      onChange={(e) =>
                        setNovoCampo({
                          ...novoCampo,
                          quantidade_obrigatoria: Number(e.target.value) || 1,
                        })
                      }
                      className="w-32"
                    />
                    <Input
                      placeholder="Descrição (opcional)"
                      value={novoCampo.descricao}
                      onChange={(e) => setNovoCampo({ ...novoCampo, descricao: e.target.value })}
                    />
                  </div>
                  <Button
                    onClick={adicionarCampo}
                    disabled={loading}
                    className="w-full bg-amber-500 hover:bg-amber-600"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Campo
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-3">
                {campos.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">Nenhum campo adicionado</p>
                ) : (
                  campos.map((campo) => {
                    const ferrIds = getFerramentaIds(campo);
                    const ferrVinculadas = ferramentasDisponiveis.filter((f) =>
                      ferrIds.includes(f.id)
                    );
                    const isExpandido = campoExpandido === campo.id;
                    const ferrFiltradas = ferramentasDisponiveis.filter(
                      (f) =>
                        !ferrIds.includes(f.id) &&
                        (f.descricao?.toLowerCase().includes(searchFerramenta.toLowerCase()) ||
                          f.codigo?.toLowerCase().includes(searchFerramenta.toLowerCase()))
                    );

                    return (
                      <Card key={campo.id} className="bg-white border border-slate-200">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-slate-900">{campo.nome_campo}</h4>
                              <p className="text-sm text-slate-600 mt-1">
                                Qtd. obrigatória:{" "}
                                <span className="font-semibold">
                                  {campo.quantidade_obrigatoria}
                                </span>
                                {ferrVinculadas.length > 0 && (
                                  <span className="ml-2 text-green-600">
                                    • {ferrVinculadas.length} ferramenta(s) vinculada(s)
                                  </span>
                                )}
                              </p>
                              {campo.descricao && (
                                <p className="text-xs text-slate-500 mt-1">{campo.descricao}</p>
                              )}
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (sugestoes?.campoId === campo.id) {
                                    setSugestoes(null);
                                  } else {
                                    gerarSugestoes(campo);
                                  }
                                  setCampoExpandido(null);
                                }}
                                className="gap-1 text-xs border-purple-300 text-purple-700 hover:bg-purple-50"
                              >
                                <Sparkles className="w-3 h-3" />
                                Sugestões IA
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setCampoExpandido(isExpandido ? null : campo.id);
                                  setSugestoes(null);
                                  setSearchFerramenta("");
                                }}
                                className="gap-1 text-xs"
                              >
                                <Wrench className="w-3 h-3" />
                                {isExpandido ? "Fechar" : "Vincular"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deletarCampo(campo.id)}
                                disabled={loading}
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Ferramentas já vinculadas */}
                          {ferrVinculadas.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {ferrVinculadas.map((f) => (
                                <Badge
                                  key={f.id}
                                  className="bg-blue-50 text-blue-700 border border-blue-200 gap-1 pr-1"
                                >
                                  <span className="text-xs">
                                    {f.codigo} - {f.descricao?.substring(0, 30)}
                                  </span>
                                  <button
                                    onClick={() => desvincularFerramenta(campo, f.id)}
                                    className="ml-1 hover:text-red-600"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Painel de sugestões */}
                          {sugestoes?.campoId === campo.id && (
                            <div className="border-t border-purple-100 pt-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                                  <Sparkles className="w-3 h-3" />
                                  Sugestões baseadas no nome do campo
                                </p>
                                <button
                                  onClick={() => setSugestoes(null)}
                                  className="text-slate-400 hover:text-slate-600"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              {sugestoes.ferramentas.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-2">
                                  Nenhuma sugestão encontrada. Tente vincular manualmente.
                                </p>
                              ) : (
                                <div className="space-y-1 max-h-56 overflow-y-auto">
                                  {sugestoes.ferramentas.map((f) => (
                                    <div
                                      key={f.id}
                                      className="flex items-center justify-between p-2 rounded-lg border border-purple-100 bg-purple-50"
                                    >
                                      <div>
                                        <span className="text-xs font-mono text-purple-700">
                                          {f.codigo}
                                        </span>
                                        <p className="text-xs text-slate-700">{f.descricao}</p>
                                        <p className="text-xs text-slate-400">{f.status}</p>
                                      </div>
                                      <Button
                                        size="sm"
                                        className="bg-purple-600 hover:bg-purple-700 text-white gap-1 text-xs h-7"
                                        onClick={async () => {
                                          await vincularFerramenta(campo, f.id);
                                          setSugestoes((prev) => ({
                                            ...prev,
                                            ferramentas: prev.ferramentas.filter(
                                              (s) => s.id !== f.id
                                            ),
                                          }));
                                          toast.success(`${f.codigo} vinculada!`);
                                        }}
                                      >
                                        <Check className="w-3 h-3" /> Vincular
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Painel de vinculação manual */}
                          {isExpandido && (
                            <div className="border-t border-slate-100 pt-3 space-y-2">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                  placeholder="Buscar ferramentas por código ou descrição..."
                                  value={searchFerramenta}
                                  onChange={(e) => setSearchFerramenta(e.target.value)}
                                  className="pl-9 h-8 text-sm"
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {ferrFiltradas.length === 0 ? (
                                  <p className="text-xs text-slate-400 text-center py-2">
                                    Nenhuma ferramenta disponível
                                  </p>
                                ) : (
                                  ferrFiltradas.slice(0, 20).map((f) => (
                                    <div
                                      key={f.id}
                                      onClick={() => vincularFerramenta(campo, f.id)}
                                      className="flex items-center justify-between p-2 rounded hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200"
                                    >
                                      <div>
                                        <span className="text-xs font-mono text-amber-600">
                                          {f.codigo}
                                        </span>
                                        <p className="text-xs text-slate-700">{f.descricao}</p>
                                      </div>
                                      <Plus className="w-4 h-4 text-green-600 flex-shrink-0" />
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>

              {campos.length > 0 && (
                <Button variant="outline" onClick={exportarPlanilha} className="w-full gap-2">
                  <Download className="w-4 h-4" />
                  Exportar para Excel
                </Button>
              )}
            </TabsContent>

            {/* ABA IMPORTAR */}
            <TabsContent value="importar" className="space-y-4">
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4 text-sm text-blue-900">
                  <p className="font-medium mb-2">Formato esperado da planilha:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>
                      <strong>Nome Campo</strong> - Nome do campo/ferramenta
                    </li>
                    <li>
                      <strong>Quantidade</strong> - Quantidade obrigatória (número)
                    </li>
                    <li>
                      <strong>Descrição</strong> - Descrição opcional
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2">
                <Download className="w-4 h-4" />
                Baixar Template
              </Button>

              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={importarPlanilha}
                  disabled={loading}
                  className="hidden"
                  id="file-input"
                />
                <label htmlFor="file-input" className="cursor-pointer">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-900">
                    Clique para selecionar arquivo
                  </p>
                  <p className="text-xs text-slate-500 mt-1">ou arraste um arquivo Excel aqui</p>
                </label>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
