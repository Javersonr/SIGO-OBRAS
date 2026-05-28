import React from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import RichTextEditor from "../shared/RichTextEditor";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Plus, Search, FileText } from "lucide-react";
import ResponsaveisSelect from "../shared/ResponsaveisSelect";
import NovoClienteModal from "../clientes/NovoClienteModal";

export default function ProjetoFormSheet({
  open,
  onOpenChange,
  selectedProj,
  statusList,
  origensList,
  clientes,
  templates,
  usuariosEmpresa,
  empresaAtiva,
  user,
  onSaved, // callback(projAtualizado) após salvar
}) {
  const [formData, setFormData] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [showTemplateSelection, setShowTemplateSelection] = React.useState(false);
  const [templateSearchTerm, setTemplateSearchTerm] = React.useState("");
  const [openClientePopover, setOpenClientePopover] = React.useState(false);
  const [searchCliente, setSearchCliente] = React.useState("");
  const [showNovoCliente, setShowNovoCliente] = React.useState(false);
  const [showNovaOrigem, setShowNovaOrigem] = React.useState(false);
  const [novaOrigem, setNovaOrigem] = React.useState("");
  const [clientesLocais, setClientesLocais] = React.useState([]);
  const [buscandoCep, setBuscandoCep] = React.useState(false);

  // Inicializa form quando abre
  React.useEffect(() => {
    if (!open) return;
    if (selectedProj) {
      // responsaveis_emails é JSONB → array do supabase-js, string em legacy
      const respEmails = safeParseJSON(selectedProj.responsaveis_emails, []);

      setFormData({
        nome: selectedProj.nome || "",
        cliente_id: selectedProj.cliente_id || "",
        status_id: selectedProj.status_id || "",
        origem_id: selectedProj.origem_id || "",
        valor_estimado: selectedProj.valor_estimado
          ? String(selectedProj.valor_estimado).replace(".", ",")
          : "",
        probabilidade: selectedProj.probabilidade || 50,
        data_fechamento_prevista: selectedProj.data_fechamento_prevista || "",
        descricao: selectedProj.descricao || "",
        observacoes: selectedProj.observacoes || "",
        responsaveis_emails: respEmails,
        licitacao_modalidade: selectedProj.licitacao_modalidade || "",
        licitacao_data: selectedProj.licitacao_data || "",
        licitacao_horario: selectedProj.licitacao_horario || "",
        numero_contrato: selectedProj.numero_contrato || "",
        data_vencimento_contrato: selectedProj.data_vencimento_contrato || "",
        cep: selectedProj.cep || "",
        endereco: selectedProj.endereco || "",
        numero: selectedProj.numero || "",
        complemento: selectedProj.complemento || "",
        bairro: selectedProj.bairro || "",
        cidade: selectedProj.cidade || "",
        estado: selectedProj.estado || "",
      });
      setShowTemplateSelection(false);
    } else {
      // Criação
      const meVinculo = usuariosEmpresa.find((u) => u.usuario_email === user?.email);
      setFormData({
        nome: "",
        cliente_id: "",
        status_id: statusList[0]?.id || "",
        origem_id: "",
        valor_estimado: "",
        probabilidade: 50,
        data_fechamento_prevista: "",
        descricao: "",
        observacoes: "",
        responsaveis_emails: meVinculo ? [meVinculo.usuario_email] : [],
        licitacao_modalidade: "",
        licitacao_data: "",
        licitacao_horario: "",
        numero_contrato: "",
        data_vencimento_contrato: "",
        cep: "",
        endereco: "",
        numero: "",
        complemento: "",
        bairro: "",
        cidade: "",
        estado: "",
      });
      setShowTemplateSelection(true);
    }
  }, [open, selectedProj]);

  const handleBuscarCep = async (cep) => {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setFormData((prev) => ({
          ...prev,
          cep,
          endereco: data.logradouro || "",
          bairro: data.bairro || "",
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
    if (!formData?.nome) return;
    setSaving(true);
    try {
      const cliente = clientes.find((c) => c.id === formData.cliente_id);
      const status = statusList.find((s) => s.id === formData.status_id);
      const origem = origensList.find((o) => o.id === formData.origem_id);

      // Sempre salvar responsaveis_emails como JSON string
      const responsaveisEmails = Array.isArray(formData.responsaveis_emails)
        ? formData.responsaveis_emails
        : [];

      const data = {
        empresa_id: empresaAtiva.id,
        nome: formData.nome,
        cliente_id: formData.cliente_id || null,
        cliente_nome: cliente?.nome_razao || null,
        status_id: formData.status_id,
        status_nome: status?.nome || null,
        origem_id: formData.origem_id || null,
        origem_nome: origem?.nome || null,
        valor_estimado:
          parseFloat(
            String(formData.valor_estimado || "0")
              .replace(/\./g, "")
              .replace(",", ".")
          ) || 0,
        probabilidade: formData.probabilidade,
        data_fechamento_prevista: formData.data_fechamento_prevista || null,
        descricao: formData.descricao,
        observacoes: formData.observacoes,
        responsaveis_emails: JSON.stringify(responsaveisEmails),
        licitacao_modalidade: formData.licitacao_modalidade || null,
        licitacao_data: formData.licitacao_data || null,
        licitacao_horario: formData.licitacao_horario || null,
        numero_contrato: formData.numero_contrato || null,
        data_vencimento_contrato: formData.data_vencimento_contrato || null,
        cep: formData.cep || null,
        endereco: formData.endereco || null,
        numero: formData.numero || null,
        complemento: formData.complemento || null,
        bairro: formData.bairro || null,
        cidade: formData.cidade || null,
        estado: formData.estado || null,
      };

      let projResult;
      if (selectedProj) {
        if (selectedProj.status_id !== formData.status_id) {
          const statusAnterior = statusList.find((s) => s.id === selectedProj.status_id);
          await sigo.entities.OportunidadeAtualizacao.create({
            empresa_id: empresaAtiva.id,
            projeto_id: selectedProj.id,
            usuario_id: user?.id,
            usuario_nome: user?.full_name,
            tipo: "Status",
            descricao: `Status alterado de "${statusAnterior?.nome}" para "${status?.nome}"`,
          });
        }
        await sigo.entities.Projeto.update(selectedProj.id, data);
        projResult = { ...selectedProj, ...data, id: selectedProj.id };
      } else {
        projResult = await sigo.entities.Projeto.create(data);
        await sigo.entities.OportunidadeAtualizacao.create({
          empresa_id: empresaAtiva.id,
          projeto_id: projResult.id,
          usuario_id: user?.id,
          usuario_nome: user?.full_name,
          tipo: "Sistema",
          descricao: "Projeto criado",
        });
      }

      onSaved(projResult, !!selectedProj);
    } catch (error) {
      console.error("Erro ao salvar projeto:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleApplyTemplate = (templateId) => {
    const template = templates.find((t) => t.id === templateId);
    if (template?.campos_padrao) {
      const campos = safeParseJSON(template.campos_padrao, null);
      if (campos && typeof campos === "object") {
        setFormData((prev) => ({ ...prev, ...campos }));
      }
    }
    setShowTemplateSelection(false);
  };

  const todosClientes = React.useMemo(() => {
    const map = new Map();
    [...clientes, ...clientesLocais].forEach((c) => map.set(c.id, c));
    return Array.from(map.values());
  }, [clientes, clientesLocais]);

  const clienteSelecionado = todosClientes.find((c) => c.id === formData?.cliente_id);
  const clientesFiltrados = React.useMemo(() => {
    const sorted = [...todosClientes].sort((a, b) =>
      (a.nome_razao || "").localeCompare(b.nome_razao || "")
    );
    if (!searchCliente) return sorted;
    return sorted.filter(
      (c) =>
        c.nome_razao?.toLowerCase().includes(searchCliente.toLowerCase()) ||
        c.documento?.includes(searchCliente)
    );
  }, [todosClientes, searchCliente]);

  if (!formData) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="p-6 border-b">
            <SheetTitle>{selectedProj ? "Editar Projeto" : "Novo Projeto"}</SheetTitle>
          </SheetHeader>

          {showTemplateSelection ? (
            <div className="space-y-4 p-6">
              <div
                className="border rounded-lg p-4 cursor-pointer hover:border-blue-500 hover:shadow transition-all"
                onClick={() => setShowTemplateSelection(false)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold">Começar do Zero</p>
                    <p className="text-sm text-slate-500">Criar um novo projeto sem template</p>
                  </div>
                </div>
              </div>

              {templates.filter((t) => t.tipo !== "orcamento").length > 0 && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Buscar template..."
                      value={templateSearchTerm}
                      onChange={(e) => setTemplateSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="space-y-2">
                    {templates
                      .filter(
                        (t) =>
                          t.tipo !== "orcamento" &&
                          (!templateSearchTerm ||
                            t.nome.toLowerCase().includes(templateSearchTerm.toLowerCase()))
                      )
                      .map((t) => (
                        <div
                          key={t.id}
                          className="border rounded-lg p-4 cursor-pointer hover:shadow transition-all"
                          onClick={() => handleApplyTemplate(t.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-purple-600" />
                            </div>
                            <div>
                              <p className="font-medium">{t.nome}</p>
                              <p className="text-xs text-slate-500">Clique para usar</p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4 p-6 flex-1 overflow-y-auto">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Nome do projeto"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>Cliente</Label>
                <div className="flex gap-2 mt-1.5">
                  <Popover open={openClientePopover} onOpenChange={setOpenClientePopover}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {clienteSelecionado?.nome_razao || "Selecione um cliente"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Buscar cliente..."
                          value={searchCliente}
                          onValueChange={setSearchCliente}
                        />
                        <CommandList>
                          <CommandEmpty>Nenhum cliente encontrado</CommandEmpty>
                          <CommandGroup>
                            {clientesFiltrados.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={c.nome_razao}
                                onSelect={() => {
                                  setFormData((p) => ({ ...p, cliente_id: c.id }));
                                  setOpenClientePopover(false);
                                  setSearchCliente("");
                                }}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">{c.nome_razao}</span>
                                  {c.documento && (
                                    <span className="text-xs text-slate-500">{c.documento}</span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowNovoCliente(true)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label>Responsáveis</Label>
                <div className="mt-1.5">
                  <ResponsaveisSelect
                    responsaveisEmails={formData.responsaveis_emails}
                    usuarios={usuariosEmpresa}
                    onUpdate={(newEmails) =>
                      setFormData((p) => ({ ...p, responsaveis_emails: newEmails }))
                    }
                    buttonSize="h-10 w-10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <Select
                    value={formData.status_id}
                    onValueChange={(v) => setFormData((p) => ({ ...p, status_id: v }))}
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
                      onValueChange={(v) => setFormData((p) => ({ ...p, origem_id: v }))}
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
                        size="sm"
                        disabled={!novaOrigem.trim()}
                        onClick={async () => {
                          const o = await sigo.entities.OrigemOportunidade.create({
                            empresa_id: empresaAtiva.id,
                            nome: novaOrigem,
                          });
                          setFormData((p) => ({ ...p, origem_id: o.id }));
                          setNovaOrigem("");
                          setShowNovaOrigem(false);
                        }}
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
                      formData._valorDisplay !== undefined
                        ? formData._valorDisplay
                        : formData.valor_estimado
                          ? String(formData.valor_estimado).replace(".", ",")
                          : ""
                    }
                    onFocus={() => {
                      const raw =
                        parseFloat(String(formData.valor_estimado).replace(",", ".")) || 0;
                      setFormData((p) => ({
                        ...p,
                        _valorDisplay: raw === 0 ? "" : String(raw).replace(".", ","),
                      }));
                    }}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d,]/g, "");
                      setFormData((p) => ({
                        ...p,
                        _valorDisplay: raw,
                        valor_estimado: raw.replace(",", "."),
                      }));
                    }}
                    onBlur={() => {
                      const num =
                        parseFloat(String(formData.valor_estimado).replace(",", ".")) || 0;
                      setFormData((p) => ({
                        ...p,
                        valor_estimado: num ? String(num).replace(".", ",") : "",
                        _valorDisplay: undefined,
                      }));
                    }}
                    placeholder="0,00"
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
                      setFormData((p) => ({ ...p, probabilidade: parseInt(e.target.value) || 0 }))
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
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, data_fechamento_prevista: e.target.value }))
                  }
                  className="mt-1.5"
                />
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium text-slate-700 mb-3">Dados da Licitação</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Modalidade</Label>
                    <Select
                      value={formData.licitacao_modalidade}
                      onValueChange={(v) => setFormData((p) => ({ ...p, licitacao_modalidade: v }))}
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
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, licitacao_data: e.target.value }))
                      }
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Horário</Label>
                    <Input
                      type="time"
                      value={formData.licitacao_horario}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, licitacao_horario: e.target.value }))
                      }
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label>Número do Contrato</Label>
                    <Input
                      value={formData.numero_contrato}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, numero_contrato: e.target.value }))
                      }
                      placeholder="Ex: 001/2024"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Data de Vencimento do Contrato</Label>
                    <Input
                      type="date"
                      value={formData.data_vencimento_contrato}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, data_vencimento_contrato: e.target.value }))
                      }
                      className="mt-1.5"
                    />
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
                          setFormData((p) => ({ ...p, cep: e.target.value }));
                          if (e.target.value.replace(/\D/g, "").length === 8)
                            handleBuscarCep(e.target.value);
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
                        onChange={(e) => setFormData((p) => ({ ...p, endereco: e.target.value }))}
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
                        onChange={(e) => setFormData((p) => ({ ...p, numero: e.target.value }))}
                        placeholder="123"
                        className="mt-1.5"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Complemento</Label>
                      <Input
                        value={formData.complemento}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, complemento: e.target.value }))
                        }
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
                        onChange={(e) => setFormData((p) => ({ ...p, bairro: e.target.value }))}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label>Cidade</Label>
                      <Input
                        value={formData.cidade}
                        onChange={(e) => setFormData((p) => ({ ...p, cidade: e.target.value }))}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label>UF</Label>
                      <Input
                        value={formData.estado}
                        onChange={(e) => setFormData((p) => ({ ...p, estado: e.target.value }))}
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
                    onChange={(val) => setFormData((p) => ({ ...p, descricao: val }))}
                    placeholder="Detalhes sobre o projeto..."
                  />
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData((p) => ({ ...p, observacoes: e.target.value }))}
                  placeholder="Observações adicionais..."
                  className="mt-1.5"
                  rows={2}
                />
              </div>
            </div>
          )}

          {!showTemplateSelection && (
            <div className="flex justify-end gap-3 p-6 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !formData.nome}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <NovoClienteModal
        open={showNovoCliente}
        onOpenChange={setShowNovoCliente}
        empresaAtiva={empresaAtiva}
        onClienteCriado={(clienteCriado) => {
          setClientesLocais((prev) => [...prev, clienteCriado]);
          setFormData((p) => ({ ...p, cliente_id: clienteCriado.id }));
        }}
      />
    </>
  );
}
