import React from "react";
import { safeParseJSON } from "@/lib/json-utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import RichTextEditor from "../shared/RichTextEditor";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Shield } from "lucide-react";
import ResponsaveisSelect from "../shared/ResponsaveisSelect";

export default function FormularioOportunidade({
  formData,
  setFormData,
  clientes,
  statusList,
  origensList,
  usuariosEmpresa,
  onNovoCliente,
  onNovaOrigem,
  buscandoCep,
  handleBuscarCep,
}) {
  const [showNovaOrigem, setShowNovaOrigem] = React.useState(false);
  const [novaOrigem, setNovaOrigem] = React.useState("");

  const formatarMoeda = (valor) => {
    const num =
      typeof valor === "number"
        ? valor
        : parseFloat(
            String(valor)
              .replace(/[^\d,]/g, "")
              .replace(",", ".")
          ) || 0;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
  };

  const parseMoeda = (str) => {
    // Remove tudo exceto dígitos e vírgula, trata vírgula como separador decimal
    const s = String(str || "");
    // Se vier como float string com ponto (ex: "28308471.5"), converter ponto para vírgula primeiro
    const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    return parseFloat(normalized) || 0;
  };

  return (
    <div className="space-y-4 py-4 p-6">
      <div>
        <Label htmlFor="titulo">Título *</Label>
        <Input
          id="titulo"
          value={formData.titulo}
          onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
          placeholder="Ex: Construção Residencial - João"
          className="mt-1.5"
        />
      </div>

      <div>
        <Label>Cliente</Label>
        <div className="flex gap-2 mt-1.5">
          <Select
            value={formData.cliente_id}
            onValueChange={(v) => setFormData({ ...formData, cliente_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um cliente" />
            </SelectTrigger>
            <SelectContent>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome_razao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="icon" onClick={onNovoCliente}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div>
        <Label>Responsável *</Label>
        <div className="mt-1.5">
          <ResponsaveisSelect
            // responsaveis_ids é JSONB: pode vir array (supabase-js) ou string (legacy)
            responsaveisEmails={safeParseJSON(formData.responsaveis_ids, [])}
            usuarios={usuariosEmpresa}
            onUpdate={(newIds) => setFormData({ ...formData, responsaveis_ids: newIds })}
            buttonSize="h-10 w-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Status</Label>
          <Select
            value={formData.status_id}
            onValueChange={(v) => setFormData({ ...formData, status_id: v })}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {statusList.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Origem</Label>
          <div className="flex gap-2 mt-1.5">
            <Select
              value={formData.origem_id}
              onValueChange={(v) => setFormData({ ...formData, origem_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {origensList.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowNovaOrigem(!showNovaOrigem)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {showNovaOrigem && (
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Nome da origem"
                value={novaOrigem}
                onChange={(e) => setNovaOrigem(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (!novaOrigem.trim()) return;
                  onNovaOrigem(novaOrigem);
                  setNovaOrigem("");
                  setShowNovaOrigem(false);
                }}
                disabled={!novaOrigem.trim()}
              >
                Criar
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Valor Estimado (R$)</Label>
          <Input
            type="text"
            value={
              formData._valorEstimadoDisplay !== undefined
                ? formData._valorEstimadoDisplay
                : formatarMoeda(formData.valor_estimado || 0)
            }
            onFocus={(e) => {
              const num = parseMoeda(formData.valor_estimado);
              // Exibir sem casas decimais se for inteiro
              const display =
                num === 0
                  ? ""
                  : Number.isInteger(num)
                    ? String(num)
                    : String(num).replace(".", ",");
              setFormData({ ...formData, _valorEstimadoDisplay: display });
            }}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d,]/g, "");
              setFormData({
                ...formData,
                _valorEstimadoDisplay: raw,
                valor_estimado: parseMoeda(raw),
              });
            }}
            onBlur={(e) => {
              const num = parseMoeda(formData.valor_estimado);
              setFormData({ ...formData, valor_estimado: num, _valorEstimadoDisplay: undefined });
            }}
            placeholder="R$ 0,00"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label>Probabilidade (%)</Label>
          <Input
            type="number"
            min="0"
            max="100"
            value={formData.probabilidade}
            onChange={(e) =>
              setFormData({ ...formData, probabilidade: parseInt(e.target.value) || 0 })
            }
            className="mt-1.5"
          />
        </div>
      </div>

      <div>
        <Label>Data de Fechamento Prevista</Label>
        <Input
          type="date"
          value={formData.data_fechamento_prevista}
          onChange={(e) => setFormData({ ...formData, data_fechamento_prevista: e.target.value })}
          className="mt-1.5"
        />
      </div>

      <div className="border-t pt-4">
        <h4 className="font-medium text-slate-700 mb-3">Dados da Licitação</h4>
        <div className="space-y-4">
          {/* Linha 1: Modalidade + Data Licitação + Horário Licitação */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Modalidade</Label>
              <Select
                value={formData.licitacao_modalidade}
                onValueChange={(v) => setFormData({ ...formData, licitacao_modalidade: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Não informada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="concorrencia">Concorrência</SelectItem>
                  <SelectItem value="tomada_precos">Tomada de Preços</SelectItem>
                  <SelectItem value="convite">Convite</SelectItem>
                  <SelectItem value="pregao">Pregão</SelectItem>
                  <SelectItem value="dispensa">Dispensa</SelectItem>
                  <SelectItem value="inexigibilidade">Inexigibilidade</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data da Licitação</Label>
              <Input
                type="date"
                value={formData.licitacao_data}
                onChange={(e) => setFormData({ ...formData, licitacao_data: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Horário da Licitação</Label>
              <Input
                type="time"
                value={formData.licitacao_horario}
                onChange={(e) => setFormData({ ...formData, licitacao_horario: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Linha 2: Data de Impugnação */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Data de Impugnação</Label>
              <Input
                type="date"
                value={formData.licitacao_data_impugnacao || ""}
                onChange={(e) =>
                  setFormData({ ...formData, licitacao_data_impugnacao: e.target.value })
                }
                className="mt-1.5"
              />
              <p className="text-xs text-slate-400 mt-1">Aparece no calendário</p>
            </div>
          </div>

          {/* Linha 3: Data Limite Proposta + Horário + Garantia */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Data Limite da Proposta</Label>
              <Input
                type="date"
                value={formData.licitacao_data_proposta || ""}
                onChange={(e) =>
                  setFormData({ ...formData, licitacao_data_proposta: e.target.value })
                }
                className="mt-1.5"
              />
              <p className="text-xs text-slate-400 mt-1">
                Aparece no calendário + aviso 2 dias antes
              </p>
            </div>
            <div>
              <Label>Horário Limite da Proposta</Label>
              <Input
                type="time"
                value={formData.licitacao_horario_proposta || ""}
                onChange={(e) =>
                  setFormData({ ...formData, licitacao_horario_proposta: e.target.value })
                }
                className="mt-1.5"
              />
            </div>
            <div className="flex flex-col justify-center">
              <Label className="mb-2">Garantia de Proposta</Label>
              <label className="flex items-center gap-2 cursor-pointer mt-1.5">
                <div
                  onClick={() =>
                    setFormData({
                      ...formData,
                      licitacao_garantia_proposta: !formData.licitacao_garantia_proposta,
                    })
                  }
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${formData.licitacao_garantia_proposta ? "bg-amber-500 border-amber-500" : "border-slate-300 bg-white"}`}
                >
                  {formData.licitacao_garantia_proposta && (
                    <svg
                      className="w-3 h-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-slate-700 flex items-center gap-1">
                  <Shield className="w-4 h-4 text-amber-600" />
                  Necessário garantia
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h4 className="font-medium text-slate-700 mb-3">Endereço da Obra</h4>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>CEP</Label>
              <Input
                value={formData.cep}
                onChange={(e) => {
                  setFormData({ ...formData, cep: e.target.value });
                  if (e.target.value.replace(/\D/g, "").length === 8) {
                    handleBuscarCep(e.target.value);
                  }
                }}
                placeholder="00000-000"
                maxLength={9}
                className="mt-1.5"
              />
              {buscandoCep && <p className="text-xs text-slate-500 mt-1">Buscando...</p>}
            </div>
            <div className="col-span-2">
              <Label>Endereço</Label>
              <Input
                value={formData.endereco}
                onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                placeholder="Rua, Avenida..."
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Número</Label>
              <Input
                value={formData.numero}
                onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                placeholder="123"
                className="mt-1.5"
              />
            </div>
            <div className="col-span-2">
              <Label>Complemento</Label>
              <Input
                value={formData.complemento}
                onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                placeholder="Apto, Bloco..."
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Bairro</Label>
              <Input
                value={formData.bairro}
                onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input
                value={formData.cidade}
                onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>UF</Label>
              <Input
                value={formData.estado}
                onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                maxLength={2}
                className="mt-1.5"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <Label>Descrição</Label>
        <div className="mt-1.5">
          <RichTextEditor
            value={formData.descricao}
            onChange={(val) => setFormData({ ...formData, descricao: val })}
            placeholder="Detalhes sobre a oportunidade..."
          />
        </div>
      </div>

      <div>
        <Label>Observações</Label>
        <Textarea
          value={formData.observacoes}
          onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
          placeholder="Observações adicionais..."
          className="mt-1.5"
          rows={2}
        />
      </div>
    </div>
  );
}
