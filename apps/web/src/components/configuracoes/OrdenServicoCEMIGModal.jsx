import React, { useState } from "react";
// eslint-disable-next-line no-unused-vars
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Plus, GraduationCap } from "lucide-react";
import { toast } from "sonner";

export default function OrdenServicoCEMIGModal({
  open,
  onOpenChange,
  formData,
  setFormData,
  handleSave,
  loading,
  funcao,
  empresaAtiva,
  onTreinamentoCriado,
}) {
  const [novoTreinamento, setNovoTreinamento] = useState({
    nome: "",
    codigo: "",
    carga_horaria: "",
    validade_meses: 12,
    conteudo_programatico: "",
    obrigatorio: true,
  });
  const [salvandoTreinamento, setSalvandoTreinamento] = useState(false);
  const [showFormTreinamento, setShowFormTreinamento] = useState(false);

  const handleCriarTreinamento = async () => {
    if (!novoTreinamento.nome.trim()) {
      toast.error("Informe o nome do treinamento");
      return;
    }
    if (!empresaAtiva?.id) {
      toast.error("Empresa não identificada");
      return;
    }
    setSalvandoTreinamento(true);
    try {
      const dadosTreinamento = {
        nome: novoTreinamento.nome,
        codigo: novoTreinamento.codigo,
        carga_horaria: novoTreinamento.carga_horaria
          ? parseFloat(novoTreinamento.carga_horaria)
          : 0,
        validade_meses: novoTreinamento.validade_meses || 12,
        conteudo_programatico: novoTreinamento.conteudo_programatico,
        obrigatorio: novoTreinamento.obrigatorio,
        empresa_id: empresaAtiva.id,
        ativo: true,
      };
      if (funcao?.id) {
        dadosTreinamento.funcao_id = funcao.id;
      }
      await sigo.entities.Treinamento.create(dadosTreinamento);
      toast.success("Treinamento criado com sucesso!");
      setNovoTreinamento({
        nome: "",
        codigo: "",
        carga_horaria: "",
        validade_meses: 12,
        conteudo_programatico: "",
        obrigatorio: true,
      });
      setShowFormTreinamento(false);
      if (onTreinamentoCriado) onTreinamentoCriado();
    } catch (error) {
      console.error("Erro ao criar treinamento:", error);
      toast.error("Erro ao criar treinamento: " + (error.message || "Tente novamente"));
    } finally {
      setSalvandoTreinamento(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <SheetHeader className="p-6 border-b">
          <SheetTitle>Configurar Treinamento CEMIG</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                <div className="text-sm text-slate-700">
                  <p className="font-semibold mb-2">Treinamento CEMIG</p>
                  <p>
                    Configure as opções de autorização formal relacionadas aos treinamentos CEMIG
                    (NR-10, NR-33, NR-35) para esta função.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seção: Criar Treinamento */}
          <Card className="border-amber-200">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-amber-600" />
                  <h4 className="font-semibold text-sm text-slate-800">Criar Treinamento</h4>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFormTreinamento(!showFormTreinamento)}
                  className="gap-1"
                >
                  <Plus className="w-3 h-3" />
                  {showFormTreinamento ? "Cancelar" : "Novo Treinamento"}
                </Button>
              </div>

              {showFormTreinamento && (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs">Nome do Treinamento *</Label>
                      <Input
                        value={novoTreinamento.nome}
                        onChange={(e) =>
                          setNovoTreinamento({ ...novoTreinamento, nome: e.target.value })
                        }
                        placeholder="Ex: NR-10 SEGURANÇA EM INSTALAÇÕES"
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Código</Label>
                      <Input
                        value={novoTreinamento.codigo}
                        onChange={(e) =>
                          setNovoTreinamento({ ...novoTreinamento, codigo: e.target.value })
                        }
                        placeholder="Ex: TTRP-0011"
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Carga Horária (h)</Label>
                      <Input
                        type="number"
                        value={novoTreinamento.carga_horaria}
                        onChange={(e) =>
                          setNovoTreinamento({ ...novoTreinamento, carga_horaria: e.target.value })
                        }
                        placeholder="Ex: 40"
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Validade (meses)</Label>
                      <Input
                        type="number"
                        value={novoTreinamento.validade_meses}
                        onChange={(e) =>
                          setNovoTreinamento({
                            ...novoTreinamento,
                            validade_meses: parseInt(e.target.value) || 12,
                          })
                        }
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <input
                        type="checkbox"
                        checked={novoTreinamento.obrigatorio}
                        onChange={(e) =>
                          setNovoTreinamento({ ...novoTreinamento, obrigatorio: e.target.checked })
                        }
                        className="w-4 h-4"
                      />
                      <Label className="text-xs cursor-pointer">Obrigatório</Label>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Conteúdo Programático</Label>
                      <Textarea
                        value={novoTreinamento.conteudo_programatico}
                        onChange={(e) =>
                          setNovoTreinamento({
                            ...novoTreinamento,
                            conteudo_programatico: e.target.value,
                          })
                        }
                        placeholder="Descreva o conteúdo do treinamento..."
                        className="mt-1 text-sm"
                        rows={3}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleCriarTreinamento}
                    disabled={salvandoTreinamento || !novoTreinamento.nome.trim()}
                    className="w-full"
                    size="sm"
                  >
                    {salvandoTreinamento ? "Salvando..." : "Criar Treinamento"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Label className="text-base font-semibold">Opções de Autorização</Label>
            {(() => {
              const opcoes = safeParseJSON(formData.modelo_autorizacao_formal_opcoes, {});

              const handleCheckboxChange = (key, value) => {
                const novasOpcoes = { ...opcoes, [key]: value };
                setFormData({
                  ...formData,
                  modelo_autorizacao_formal_opcoes: JSON.stringify(novasOpcoes),
                });
              };

              return (
                <div className="space-y-3 border rounded-lg p-4 bg-white">
                  {/* NR-10 */}
                  <div className="flex items-start gap-3 pb-3 border-b">
                    <input
                      type="checkbox"
                      id="nr10"
                      checked={opcoes.nr10 === true}
                      onChange={(e) => handleCheckboxChange("nr10", e.target.checked)}
                      className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
                    />
                    <label htmlFor="nr10" className="text-sm text-slate-700 cursor-pointer flex-1">
                      <span className="font-medium">NR-10 - Sistema Elétrico de Potência</span>
                      <p className="text-xs text-slate-600 mt-1">
                        Intervenções em sistemas elétricos
                      </p>
                    </label>
                  </div>

                  {/* NR-33 */}
                  <div className="pb-3 border-b">
                    <div className="flex items-start gap-3 mb-2">
                      <input
                        type="checkbox"
                        id="nr33"
                        checked={opcoes.nr33 === true}
                        onChange={(e) => handleCheckboxChange("nr33", e.target.checked)}
                        className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
                      />
                      <label
                        htmlFor="nr33"
                        className="text-sm text-slate-700 cursor-pointer flex-1"
                      >
                        <span className="font-medium">NR-33 - Espaço Confinado</span>
                        <p className="text-xs text-slate-600 mt-1">
                          Atividades em espaços confinados
                        </p>
                      </label>
                    </div>
                    {opcoes.nr33 === true && (
                      <div className="ml-7 space-y-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="nr33_supervisor"
                            checked={opcoes.nr33_supervisor === true}
                            onChange={(e) =>
                              handleCheckboxChange("nr33_supervisor", e.target.checked)
                            }
                            className="w-3 h-3 cursor-pointer"
                          />
                          <label
                            htmlFor="nr33_supervisor"
                            className="text-xs text-slate-600 cursor-pointer"
                          >
                            Supervisor de Entrada
                          </label>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="nr33_vigia"
                            checked={opcoes.nr33_vigia === true}
                            onChange={(e) => handleCheckboxChange("nr33_vigia", e.target.checked)}
                            className="w-3 h-3 cursor-pointer"
                          />
                          <label
                            htmlFor="nr33_vigia"
                            className="text-xs text-slate-600 cursor-pointer"
                          >
                            Vigia/Trabalhador Autorizado
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* NR-35 */}
                  <div>
                    <div className="flex items-start gap-3 mb-2">
                      <input
                        type="checkbox"
                        id="nr35"
                        checked={opcoes.nr35 === true}
                        onChange={(e) => handleCheckboxChange("nr35", e.target.checked)}
                        className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
                      />
                      <label
                        htmlFor="nr35"
                        className="text-sm text-slate-700 cursor-pointer flex-1"
                      >
                        <span className="font-medium">NR-35 - Trabalho em Altura</span>
                        <p className="text-xs text-slate-600 mt-1">Atividades em altura</p>
                      </label>
                    </div>
                    {opcoes.nr35 === true && (
                      <div className="ml-7 space-y-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="nr35_rda"
                            checked={opcoes.nr35_rda === true}
                            onChange={(e) => handleCheckboxChange("nr35_rda", e.target.checked)}
                            className="w-3 h-3 cursor-pointer"
                          />
                          <label
                            htmlFor="nr35_rda"
                            className="text-xs text-slate-600 cursor-pointer"
                          >
                            Estruturas de RDA
                          </label>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="nr35_telhado"
                            checked={opcoes.nr35_telhado === true}
                            onChange={(e) => handleCheckboxChange("nr35_telhado", e.target.checked)}
                            className="w-3 h-3 cursor-pointer"
                          />
                          <label
                            htmlFor="nr35_telhado"
                            className="text-xs text-slate-600 cursor-pointer"
                          >
                            Telhado
                          </label>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="nr35_plataforma"
                            checked={opcoes.nr35_plataforma === true}
                            onChange={(e) =>
                              handleCheckboxChange("nr35_plataforma", e.target.checked)
                            }
                            className="w-3 h-3 cursor-pointer"
                          />
                          <label
                            htmlFor="nr35_plataforma"
                            className="text-xs text-slate-600 cursor-pointer"
                          >
                            Plataforma elevatória/Andaimes
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="p-6 border-t flex gap-2 bg-white">
          <Button onClick={handleSave} disabled={loading} className="flex-1">
            {loading ? "Salvando..." : "Salvar"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
