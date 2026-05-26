import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { formatCPF } from "@/components/utils/cpfFormatter";

// Parseia instrutores do campo instrutor_nome (suporta JSON array ou string legada)
const parseInstrutores = (instrutor_nome, instrutor_cpf, instrutor_assinatura_url) => {
  try {
    const parsed = JSON.parse(instrutor_nome);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  if (instrutor_nome) {
    return [
      {
        nome: instrutor_nome,
        cpf: instrutor_cpf || "",
        formacao: "",
        assinatura_url: instrutor_assinatura_url || "",
      },
    ];
  }
  return [{ nome: "", cpf: "", formacao: "", assinatura_url: "" }];
};

export default function TreinamentoModal({ open, onClose, treinamento, empresaAtiva, onSave }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    codigo: "",
    carga_horaria: "",
    conteudo_programatico: "",
    validade_meses: 12,
    obrigatorio: true,
    responsavel_tecnico_nome: "",
    responsavel_tecnico_criacao: "",
    responsavel_tecnico_assinatura_url: "",
    engenheiro_responsavel_assinatura_url: "",
  });
  const [instrutores, setInstrutores] = useState([
    { nome: "", cpf: "", formacao: "", assinatura_url: "" },
  ]);

  useEffect(() => {
    if (treinamento) {
      setFormData({
        nome: treinamento.nome || "",
        codigo: treinamento.codigo || "",
        carga_horaria: treinamento.carga_horaria || "",
        conteudo_programatico: treinamento.conteudo_programatico || "",
        validade_meses: treinamento.validade_meses || 12,
        obrigatorio: treinamento.obrigatorio !== false,
        responsavel_tecnico_nome: treinamento.responsavel_tecnico_nome || "",
        responsavel_tecnico_criacao: treinamento.responsavel_tecnico_criacao || "",
        responsavel_tecnico_assinatura_url: treinamento.responsavel_tecnico_assinatura_url || "",
        engenheiro_responsavel_assinatura_url:
          treinamento.engenheiro_responsavel_assinatura_url || "",
      });
      setInstrutores(
        parseInstrutores(
          treinamento.instrutor_nome,
          treinamento.instrutor_cpf,
          treinamento.instrutor_assinatura_url
        )
      );
    } else {
      setFormData({
        nome: "",
        codigo: "",
        carga_horaria: "",
        conteudo_programatico: "",
        validade_meses: 12,
        obrigatorio: true,
        responsavel_tecnico_nome: "",
        responsavel_tecnico_criacao: "",
        responsavel_tecnico_assinatura_url: "",
        engenheiro_responsavel_assinatura_url: "",
      });
      setInstrutores([{ nome: "", cpf: "", formacao: "", assinatura_url: "" }]);
    }
  }, [treinamento, open]);

  const addInstrutor = () =>
    setInstrutores([...instrutores, { nome: "", cpf: "", formacao: "", assinatura_url: "" }]);
  const removeInstrutor = (idx) => setInstrutores(instrutores.filter((_, i) => i !== idx));
  const updateInstrutor = (idx, field, value) => {
    const updated = instrutores.map((inst, i) => (i === idx ? { ...inst, [field]: value } : inst));
    setInstrutores(updated);
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      alert("Preencha o nome do treinamento");
      return;
    }

    setLoading(true);
    try {
      // Serializar instrutores: se só um e sem formação, manter compatibilidade legada
      const instrutoresValidos = instrutores.filter((i) => i.nome.trim());
      const instrutor_nome =
        instrutoresValidos.length === 1 && !instrutoresValidos[0].formacao
          ? instrutoresValidos[0].nome
          : JSON.stringify(instrutoresValidos);
      const instrutor_cpf = instrutoresValidos.length === 1 ? instrutoresValidos[0].cpf : "";

      const data = {
        nome: formData.nome,
        codigo: formData.codigo,
        carga_horaria: formData.carga_horaria ? parseFloat(formData.carga_horaria) : 0,
        conteudo_programatico: formData.conteudo_programatico,
        validade_meses: formData.validade_meses || 12,
        obrigatorio: formData.obrigatorio,
        responsavel_tecnico_nome: formData.responsavel_tecnico_nome,
        responsavel_tecnico_criacao: formData.responsavel_tecnico_criacao,
        responsavel_tecnico_assinatura_url: formData.responsavel_tecnico_assinatura_url,
        engenheiro_responsavel_assinatura_url: formData.engenheiro_responsavel_assinatura_url,
        instrutor_nome,
        instrutor_cpf,
        instrutor_assinatura_url:
          instrutores
            .map((i) => i.assinatura_url)
            .filter(Boolean)
            .join("|") || "",
        empresa_id: empresaAtiva.id,
        funcao_id: treinamento ? treinamento.funcao_id : null,
        usar_como_modelo: treinamento ? treinamento.usar_como_modelo : true,
      };

      console.log("Dados sendo salvos:", data);

      if (treinamento) {
        await sigo.entities.Treinamento.update(treinamento.id, data);

        // Propagar atualizações para treinamentos vinculados às funções com o mesmo nome/código
        try {
          const vinculados = await sigo.entities.Treinamento.filter({
            empresa_id: empresaAtiva.id,
            nome: treinamento.nome,
          });
          const paraAtualizar = vinculados.filter(
            (t) =>
              t.id !== treinamento.id &&
              t.funcao_id &&
              (t.codigo || "") === (treinamento.codigo || "")
          );
          if (paraAtualizar.length > 0) {
            const camposParaPropagar = {
              nome: data.nome,
              codigo: data.codigo,
              carga_horaria: data.carga_horaria,
              conteudo_programatico: data.conteudo_programatico,
              validade_meses: data.validade_meses,
              obrigatorio: data.obrigatorio,
              instrutor_nome: data.instrutor_nome,
              instrutor_cpf: data.instrutor_cpf,
              instrutor_assinatura_url: data.instrutor_assinatura_url,
              responsavel_tecnico_nome: data.responsavel_tecnico_nome,
              responsavel_tecnico_criacao: data.responsavel_tecnico_criacao,
              responsavel_tecnico_assinatura_url: data.responsavel_tecnico_assinatura_url,
            };
            await Promise.all(
              paraAtualizar.map((t) => sigo.entities.Treinamento.update(t.id, camposParaPropagar))
            );
          }
        } catch (syncErr) {
          console.warn("Erro ao propagar atualização para funções:", syncErr);
        }
      } else {
        await sigo.entities.Treinamento.create(data);
      }

      onSave();
      onClose();
    } catch (error) {
      console.error("Erro ao salvar treinamento:", error);
      alert("Erro ao salvar treinamento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <SheetHeader className="p-6 border-b">
          <SheetTitle>{treinamento ? "Editar Treinamento" : "Novo Treinamento"}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nome do Treinamento *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: NR-10 Básico"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Código</Label>
              <Input
                value={formData.codigo}
                onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                placeholder="Ex: TTRP-0011"
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Carga Horária (h)</Label>
              <Input
                type="number"
                value={formData.carga_horaria}
                onChange={(e) =>
                  setFormData({ ...formData, carga_horaria: parseFloat(e.target.value) || "" })
                }
                placeholder="Ex: 40"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Validade (meses)</Label>
              <Input
                type="number"
                value={formData.validade_meses}
                onChange={(e) =>
                  setFormData({ ...formData, validade_meses: parseInt(e.target.value) || 12 })
                }
                placeholder="Ex: 12, 24"
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label>Conteúdo Programático</Label>
            <Textarea
              value={formData.conteudo_programatico}
              onChange={(e) => setFormData({ ...formData, conteudo_programatico: e.target.value })}
              placeholder="Descreva os tópicos abordados no treinamento..."
              className="mt-1.5"
              rows={6}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="obrigatorio"
              checked={formData.obrigatorio}
              onChange={(e) => setFormData({ ...formData, obrigatorio: e.target.checked })}
              className="w-4 h-4"
            />
            <Label htmlFor="obrigatorio" className="cursor-pointer">
              Treinamento obrigatório
            </Label>
          </div>

          <div className="border-t pt-4 mt-4">
            <h3 className="font-semibold text-sm mb-4 text-slate-700">Responsável Técnico</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={formData.responsavel_tecnico_nome}
                  onChange={(e) =>
                    setFormData({ ...formData, responsavel_tecnico_nome: e.target.value })
                  }
                  placeholder="Nome completo"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>CREA</Label>
                <Input
                  value={formData.responsavel_tecnico_criacao}
                  onChange={(e) =>
                    setFormData({ ...formData, responsavel_tecnico_criacao: e.target.value })
                  }
                  placeholder="Número do CREA"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="mt-3">
              <Label className="text-xs">Assinatura do Responsável Técnico</Label>
              <div className="flex gap-2 mt-1">
                <label className="flex-1 flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer p-3 hover:bg-slate-50">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const { file_url } = await sigo.integrations.Core.UploadFile({ file });
                          setFormData({
                            ...formData,
                            responsavel_tecnico_assinatura_url: file_url,
                          });
                        } catch (error) {
                          console.error("Erro ao fazer upload:", error);
                        }
                      }
                    }}
                  />
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Upload className="w-3.5 h-3.5" />
                    {formData.responsavel_tecnico_assinatura_url ? "Trocar" : "Enviar"} assinatura
                  </div>
                </label>
                {formData.responsavel_tecnico_assinatura_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setFormData({ ...formData, responsavel_tecnico_assinatura_url: "" })
                    }
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {formData.responsavel_tecnico_assinatura_url && (
                <div className="mt-2 flex items-center gap-2">
                  <img
                    src={formData.responsavel_tecnico_assinatura_url}
                    alt="Assinatura"
                    className="h-12 border rounded"
                  />
                  <span className="text-xs text-slate-500">Assinatura carregada</span>
                </div>
              )}
            </div>
          </div>

          <div className="border-t pt-4 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-slate-700">Instrutores</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addInstrutor}
                className="gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </Button>
            </div>
            <div className="space-y-3">
              {instrutores.map((inst, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Nome</Label>
                      <Input
                        value={inst.nome}
                        onChange={(e) => updateInstrutor(idx, "nome", e.target.value)}
                        placeholder="Nome completo"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">CPF</Label>
                      <Input
                        value={formatCPF(inst.cpf)}
                        onChange={(e) => updateInstrutor(idx, "cpf", e.target.value)}
                        placeholder="000.000.000-00"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Formação</Label>
                      <Input
                        value={inst.formacao}
                        onChange={(e) => updateInstrutor(idx, "formacao", e.target.value)}
                        placeholder="Ex: Engenheiro Elétrico"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Assinatura do Instrutor</Label>
                    <div className="flex gap-2 mt-1">
                      <label className="flex-1 flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer p-3 hover:bg-slate-50">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                const { file_url } = await sigo.integrations.Core.UploadFile({
                                  file,
                                });
                                updateInstrutor(idx, "assinatura_url", file_url);
                              } catch (error) {
                                console.error("Erro ao fazer upload:", error);
                              }
                            }
                          }}
                        />
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Upload className="w-3.5 h-3.5" />
                          {inst.assinatura_url ? "Trocar" : "Enviar"} assinatura
                        </div>
                      </label>
                      {inst.assinatura_url && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => updateInstrutor(idx, "assinatura_url", "")}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {inst.assinatura_url && (
                      <div className="mt-2 flex items-center gap-2">
                        <img
                          src={inst.assinatura_url}
                          alt="Assinatura"
                          className="h-12 border rounded"
                        />
                        <span className="text-xs text-slate-500">Assinatura carregada</span>
                      </div>
                    )}
                  </div>

                  {instrutores.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeInstrutor(idx)}
                      className="w-full text-red-500 hover:text-red-700 border-red-200"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Remover Instrutor
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t flex gap-2">
          <Button
            onClick={handleSave}
            disabled={loading || !formData.nome.trim()}
            className="flex-1 bg-amber-500 hover:bg-amber-600"
          >
            {loading ? "Salvando..." : treinamento ? "Atualizar" : "Criar"}
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
