import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

const formatCNPJ = (value) => {
  const cnpj = value.replace(/\D/g, "").slice(0, 14);
  return cnpj
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{2})/, "$1-$2");
};

const formatCPF = (value) => {
  const cpf = value.replace(/\D/g, "").slice(0, 11);
  return cpf
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{2})/, "$1-$2");
};

const FORM_INICIAL = {
  nome_razao: "",
  nome_fantasia: "",
  documento: "",
  tipo_pessoa: "PJ",
  contato_email: "",
  contato_telefone: "",
  endereco: "",
  numero: "",
  complemento_bairro: "",
  cidade: "",
  estado: "",
  cep: "",
  contato_principal: "",
  observacoes: "",
};

export default function NovoClienteModal({ open, onOpenChange, empresaAtiva, onClienteCriado }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [saving, setSaving] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const buscarCep = async (cep) => {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((f) => ({
          ...f,
          endereco: data.logradouro || "",
          complemento_bairro: data.bairro || "",
          cidade: data.localidade || "",
          estado: data.uf || "",
        }));
      }
    } catch {
    } finally {
      setBuscandoCep(false);
    }
  };

  const handleSave = async () => {
    if (!form.nome_razao) {
      toast.error("❌ Nome/Razão Social é obrigatório");
      return;
    }
    if (!empresaAtiva?.id) {
      toast.error("❌ Empresa não selecionada");
      return;
    }
    setSaving(true);
    try {
      const clienteCriado = await sigo.entities.Cliente.create({
        empresa_id: empresaAtiva.id,
        nome_razao: form.nome_razao.trim(),
        nome_fantasia: form.nome_fantasia.trim(),
        documento: form.documento.replace(/\D/g, ""),
        tipo_pessoa: form.tipo_pessoa,
        contato_email: form.contato_email.trim(),
        contato_telefone: form.contato_telefone.trim(),
        endereco: form.endereco.trim(),
        numero: form.numero.trim(),
        complemento_bairro: form.complemento_bairro.trim(),
        cidade: form.cidade.trim(),
        estado: form.estado.trim(),
        cep: form.cep.trim(),
        contato_principal: form.contato_principal.trim(),
        observacoes: form.observacoes.trim(),
        ativo: true,
      });
      toast.success("✅ Cliente criado com sucesso");
      setForm(FORM_INICIAL);
      onClienteCriado(clienteCriado);
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao criar cliente:", error);
      toast.error("❌ Erro ao criar cliente: " + (error.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setForm(FORM_INICIAL);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col max-w-2xl lg:max-w-none lg:w-[calc(100%-256px)]"
        data-fullscreen-modal
      >
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0">
          <SheetHeader>
            <SheetTitle>Novo Cliente</SheetTitle>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
                placeholder="Nome fantasia da empresa"
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
              <Input
                value={form.documento}
                onChange={(e) => {
                  const formatted =
                    form.tipo_pessoa === "PF"
                      ? formatCPF(e.target.value)
                      : formatCNPJ(e.target.value);
                  setForm({ ...form, documento: formatted });
                }}
                placeholder={form.tipo_pessoa === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
                className="mt-1.5"
              />
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
                  value={form.contato_email}
                  onChange={(e) => setForm({ ...form, contato_email: e.target.value })}
                  placeholder="email@exemplo.com"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={form.contato_telefone}
                  onChange={(e) => setForm({ ...form, contato_telefone: e.target.value })}
                  placeholder="(00) 00000-0000"
                  className="mt-1.5"
                />
              </div>
            </div>
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
                    onBlur={(e) => buscarCep(e.target.value)}
                    placeholder="00000-000"
                    className="mt-1.5"
                  />
                  {buscandoCep && (
                    <p className="text-xs text-slate-400 mt-1">Buscando endereço...</p>
                  )}
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
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Número</Label>
                  <Input
                    value={form.numero}
                    onChange={(e) => setForm({ ...form, numero: e.target.value })}
                    placeholder="123"
                    className="mt-1.5"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Complemento/Bairro</Label>
                  <Input
                    value={form.complemento_bairro}
                    onChange={(e) => setForm({ ...form, complemento_bairro: e.target.value })}
                    placeholder="Apto 101, Centro"
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
              placeholder="Informações adicionais sobre o cliente..."
              className="mt-1.5"
              rows={3}
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !form.nome_razao}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {saving ? "Salvando..." : "Salvar Cliente"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
