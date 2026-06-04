import React from "react";
import { sigo } from "@/api/sigoClient";
import { safeUrl } from "@/lib/safe-url";
import { safeParseJSON } from "@/lib/json-utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, FileText, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";

export default function DocumentacaoTab({
  funcionarioForm,
  setFuncionarioForm,
  uploadingDoc,
  setUploadingDoc,
}) {
  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>CPF *</Label>
          <Input
            value={funcionarioForm.cpf}
            onChange={(e) => setFuncionarioForm({ ...funcionarioForm, cpf: e.target.value })}
            placeholder="000.000.000-00"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>PIS</Label>
          <Input
            value={funcionarioForm.pis}
            onChange={(e) => setFuncionarioForm({ ...funcionarioForm, pis: e.target.value })}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>RG</Label>
          <Input
            value={funcionarioForm.rg}
            onChange={(e) => setFuncionarioForm({ ...funcionarioForm, rg: e.target.value })}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>Data de Expedição do RG</Label>
          <Input
            type="date"
            value={funcionarioForm.rg_data_expedicao}
            onChange={(e) =>
              setFuncionarioForm({ ...funcionarioForm, rg_data_expedicao: e.target.value })
            }
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>UF do RG</Label>
          <Input
            value={funcionarioForm.rg_uf}
            onChange={(e) => setFuncionarioForm({ ...funcionarioForm, rg_uf: e.target.value })}
            placeholder="SP"
            maxLength={2}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>Data de Nascimento</Label>
          <Input
            type="date"
            value={funcionarioForm.data_nascimento}
            onChange={(e) =>
              setFuncionarioForm({ ...funcionarioForm, data_nascimento: e.target.value })
            }
            className="mt-1.5"
          />
        </div>

        <div className="col-span-2">
          <Label>Naturalidade</Label>
          <Input
            value={funcionarioForm.naturalidade}
            onChange={(e) =>
              setFuncionarioForm({ ...funcionarioForm, naturalidade: e.target.value })
            }
            placeholder="Ex: São Paulo - SP"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>Título de Eleitor</Label>
          <Input
            value={funcionarioForm.titulo_eleitor}
            onChange={(e) =>
              setFuncionarioForm({ ...funcionarioForm, titulo_eleitor: e.target.value })
            }
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>Zona</Label>
          <Input
            value={funcionarioForm.titulo_eleitor_zona}
            onChange={(e) =>
              setFuncionarioForm({ ...funcionarioForm, titulo_eleitor_zona: e.target.value })
            }
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>Seção</Label>
          <Input
            value={funcionarioForm.titulo_eleitor_secao}
            onChange={(e) =>
              setFuncionarioForm({ ...funcionarioForm, titulo_eleitor_secao: e.target.value })
            }
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>Reservista</Label>
          <Input
            value={funcionarioForm.reservista}
            onChange={(e) => setFuncionarioForm({ ...funcionarioForm, reservista: e.target.value })}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>Estado Civil</Label>
          <Select
            value={funcionarioForm.estado_civil}
            onValueChange={(v) => setFuncionarioForm({ ...funcionarioForm, estado_civil: v })}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Solteiro">Solteiro</SelectItem>
              <SelectItem value="Casado">Casado</SelectItem>
              <SelectItem value="Divorciado">Divorciado</SelectItem>
              <SelectItem value="Viúvo">Viúvo</SelectItem>
              <SelectItem value="União Estável">União Estável</SelectItem>
              <SelectItem value="Outros">Outros</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Raça/Cor</Label>
          <Select
            value={funcionarioForm.raca_cor}
            onValueChange={(v) => setFuncionarioForm({ ...funcionarioForm, raca_cor: v })}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Indígena">Indígena</SelectItem>
              <SelectItem value="Branca">Branca</SelectItem>
              <SelectItem value="Negra">Negra</SelectItem>
              <SelectItem value="Amarela">Amarela</SelectItem>
              <SelectItem value="Parda">Parda</SelectItem>
              <SelectItem value="Outros">Outros</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Dependentes */}
      <div className="border-t pt-4">
        <h4 className="font-medium mb-3">Dependentes</h4>
        <div className="space-y-3">
          {safeParseJSON(funcionarioForm.dependentes, []).map((dep, idx) => {
            const calcularIdade = (dataNascimento) => {
              if (!dataNascimento) return 0;
              const hoje = new Date();
              const nasc = new Date(dataNascimento);
              let idade = hoje.getFullYear() - nasc.getFullYear();
              const m = hoje.getMonth() - nasc.getMonth();
              if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
              return idade;
            };

            const idade = calcularIdade(dep.data_nascimento);
            const requerComprovante = idade >= 7 && idade <= 14;

            return (
              <div key={idx} className="p-3 bg-slate-50 rounded-lg">
                <div className="flex items-start justify-between mb-3">
                  <h5 className="font-medium text-sm">
                    Dependente {idx + 1}
                    {idade > 0 && (
                      <span className="ml-2 text-xs text-slate-500">({idade} anos)</span>
                    )}
                  </h5>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      const deps = safeParseJSON(funcionarioForm.dependentes, []);
                      deps.splice(idx, 1);
                      setFuncionarioForm({ ...funcionarioForm, dependentes: JSON.stringify(deps) });
                    }}
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3">
                    <Label className="text-xs">Nome Completo</Label>
                    <Input
                      value={dep.nome || ""}
                      onChange={(e) => {
                        const deps = safeParseJSON(funcionarioForm.dependentes, []);
                        deps[idx].nome = e.target.value;
                        setFuncionarioForm({
                          ...funcionarioForm,
                          dependentes: JSON.stringify(deps),
                        });
                      }}
                      placeholder="Nome completo do dependente"
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Data de Nascimento</Label>
                    <Input
                      type="date"
                      value={dep.data_nascimento || ""}
                      onChange={(e) => {
                        const deps = safeParseJSON(funcionarioForm.dependentes, []);
                        deps[idx].data_nascimento = e.target.value;
                        setFuncionarioForm({
                          ...funcionarioForm,
                          dependentes: JSON.stringify(deps),
                        });
                      }}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">CPF</Label>
                    <Input
                      value={dep.cpf || ""}
                      onChange={(e) => {
                        const deps = safeParseJSON(funcionarioForm.dependentes, []);
                        deps[idx].cpf = e.target.value;
                        setFuncionarioForm({
                          ...funcionarioForm,
                          dependentes: JSON.stringify(deps),
                        });
                      }}
                      placeholder="000.000.000-00"
                      className="mt-1 h-8 text-sm"
                    />
                  </div>

                  {requerComprovante && (
                    <div className="col-span-3 pt-2 border-t mt-2">
                      <Label className="text-xs text-amber-700 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Comprovante de Matrícula Escolar (Obrigatório - 7 a 14 anos)
                      </Label>
                      {dep.comprovante_escolar_url ? (
                        <div className="flex items-center gap-2 mt-1">
                          <a
                            href={safeUrl(dep.comprovante_escolar_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            Ver comprovante
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => {
                              const deps = safeParseJSON(funcionarioForm.dependentes, []);
                              deps[idx].comprovante_escolar_url = "";
                              setFuncionarioForm({
                                ...funcionarioForm,
                                dependentes: JSON.stringify(deps),
                              });
                            }}
                          >
                            <X className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                      ) : (
                        <label className="mt-1 block">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs w-full"
                            disabled={uploadingDoc}
                            asChild
                          >
                            <span>
                              <Upload className="w-3 h-3 mr-1" />
                              Anexar Comprovante
                            </span>
                          </Button>
                          <input
                            type="file"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploadingDoc(true);
                              try {
                                const { file_url } = await sigo.integrations.Core.UploadFile({
                                  file,
                                });
                                const deps = safeParseJSON(funcionarioForm.dependentes, []);
                                deps[idx].comprovante_escolar_url = file_url;
                                setFuncionarioForm({
                                  ...funcionarioForm,
                                  dependentes: JSON.stringify(deps),
                                });
                                toast.success("Comprovante anexado");
                              } catch {
                                toast.error("Erro ao anexar comprovante");
                              } finally {
                                setUploadingDoc(false);
                              }
                              e.target.value = "";
                            }}
                            disabled={uploadingDoc}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            const deps = safeParseJSON(funcionarioForm.dependentes, []);
            deps.push({ nome: "", data_nascimento: "", cpf: "", comprovante_escolar_url: "" });
            setFuncionarioForm({ ...funcionarioForm, dependentes: JSON.stringify(deps) });
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Dependente
        </Button>
      </div>
    </div>
  );
}
