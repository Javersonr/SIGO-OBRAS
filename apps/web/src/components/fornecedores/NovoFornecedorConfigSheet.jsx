import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import BuscarCnpjButton from "@/components/shared/BuscarCnpjButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const FORM_VAZIO = {
  nome_razao: "",
  nome_fantasia: "",
  tipo_pessoa: "PJ",
  cnpj: "",
  inscricao_estadual: "",
  inscricao_municipal: "",
  contato_nome: "",
  email: "",
  telefone: "",
  endereco: "",
  numero: "",
  complemento_bairro: "",
  cidade: "",
  estado: "",
  cep: "",
  contato_principal: "",
  categorias: [],
  observacoes: "",
};

export default function NovoFornecedorConfigSheet({
  open,
  onOpenChange,
  empresaAtiva,
  onFornecedorCriado,
}) {
  const [form, setForm] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) setForm(FORM_VAZIO);
  }, [open]);

  const handleSave = async () => {
    if (!form.nome_razao) return;
    setSaving(true);
    try {
      const fornecedor = await sigo.entities.Fornecedor.create({
        empresa_id: empresaAtiva.id,
        ...form,
        ativo: true,
      });
      toast.success("✅ Fornecedor criado com sucesso");
      if (onFornecedorCriado) onFornecedorCriado(fornecedor);
      onOpenChange(false);
    } catch (error) {
      toast.error("❌ Erro ao criar fornecedor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col"
        data-fullscreen-modal
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <SheetTitle>Novo Fornecedor</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4 px-6 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nome/Razão Social *</Label>
              <Input
                value={form.nome_razao}
                onChange={(e) => setForm({ ...form, nome_razao: e.target.value })}
                placeholder="Nome completo ou razão social"
                className="mt-1.5"
              />
            </div>
            <div className="col-span-2">
              <Label>Nome Fantasia</Label>
              <Input
                value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                placeholder="Nome fantasia"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select
                value={form.tipo_pessoa}
                onValueChange={(v) => setForm({ ...form, tipo_pessoa: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa Física</SelectItem>
                  <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CPF/CNPJ</Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder={form.tipo_pessoa === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
                />
                {form.tipo_pessoa === "PJ" && (
                  <BuscarCnpjButton
                    cnpj={form.cnpj}
                    onData={(d) =>
                      setForm((f) => ({
                        ...f,
                        nome_razao: d.razao_social || f.nome_razao,
                        nome_fantasia: d.nome_fantasia || f.nome_fantasia,
                        email: d.email || f.email,
                        telefone: d.telefone || f.telefone,
                        endereco: d.endereco || f.endereco,
                        numero: d.numero || f.numero,
                        complemento_bairro:
                          [d.complemento, d.bairro].filter(Boolean).join(" - ") ||
                          f.complemento_bairro,
                        cidade: d.cidade || f.cidade,
                        estado: d.estado || f.estado,
                        cep: d.cep || f.cep,
                      }))
                    }
                  />
                )}
              </div>
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Contato</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Contato Principal</Label>
                <Input
                  value={form.contato_principal}
                  onChange={(e) => setForm({ ...form, contato_principal: e.target.value })}
                  placeholder="Nome da pessoa de contato"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@exemplo.com"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  placeholder="(00) 00000-0000"
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Categorias</h4>
            <Input
              value={form.categorias?.join(", ") || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  categorias: e.target.value
                    .split(",")
                    .map((c) => c.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Ex: Elétrica, Hidráulica"
              className="mt-1.5"
            />
          </div>
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Endereço</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>CEP</Label>
                  <Input
                    value={form.cep}
                    onChange={(e) => setForm({ ...form, cep: e.target.value })}
                    placeholder="00000-000"
                    className="mt-1.5"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Endereço</Label>
                  <Input
                    value={form.endereco}
                    onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                    placeholder="Rua, Avenida..."
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cidade</Label>
                  <Input
                    value={form.cidade}
                    onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                    placeholder="São Paulo"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Estado</Label>
                  <Input
                    value={form.estado}
                    onChange={(e) => setForm({ ...form, estado: e.target.value })}
                    placeholder="SP"
                    maxLength={2}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Informações adicionais..."
              className="mt-1.5"
              rows={3}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !form.nome_razao}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
