import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import BuscarCnpjButton from "@/components/shared/BuscarCnpjButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Edit, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

export default function ClientesTab({ empresaAtiva, clientes, loadData }) {
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [clienteForm, setClienteForm] = useState({
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
  });
  const [selectedClienteIds, setSelectedClienteIds] = useState([]);
  const [clientesPage, setClientesPage] = useState(1);
  const [importProgress, setImportProgress] = useState({ show: false, current: 0, total: 0 });
  const [searchCliente, setSearchCliente] = useState("");

  const handleExportarClientesExcel = () => {
    const dados = clientes.map((c) => [
      c.nome_razao || "",
      c.nome_fantasia || "",
      c.tipo_pessoa || "",
      c.documento || "",
      c.contato_email || "",
      c.contato_telefone || "",
      c.endereco || "",
      c.numero || "",
      c.complemento_bairro || "",
      c.cidade || "",
      c.estado || "",
      c.cep || "",
      c.contato_principal || "",
      c.observacoes || "",
    ]);
    const headers = [
      "Nome",
      "Nome Fantasia",
      "Tipo",
      "CPF/CNPJ",
      "Email",
      "Telefone",
      "Endereço",
      "Número",
      "Complemento Bairro",
      "Cidade",
      "Estado",
      "CEP",
      "Contato Principal",
      "Observações",
    ];
    const csv = [headers, ...dados]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell).replace(/"/g, '""');
            return s.includes(";") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
          })
          .join(";")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `clientes_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleExportarClientesPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF("landscape");
    doc.setFontSize(16);
    doc.text("Lista de Clientes", 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 22);
    let y = 30;
    doc.setFontSize(8);
    doc.text("Nome", 14, y);
    doc.text("Tipo", 80, y);
    doc.text("CPF/CNPJ", 100, y);
    doc.text("Email", 140, y);
    doc.text("Telefone", 190, y);
    doc.text("Cidade", 230, y);
    y += 5;
    doc.line(14, y, 280, y);
    y += 5;
    clientes.forEach((c) => {
      if (y > 190) {
        doc.addPage();
        y = 20;
      }
      doc.text((c.nome_razao || "").substring(0, 30), 14, y);
      doc.text(c.tipo_pessoa || "-", 80, y);
      doc.text(c.documento || "-", 100, y);
      doc.text((c.contato_email || "-").substring(0, 25), 140, y);
      doc.text(c.contato_telefone || "-", 190, y);
      doc.text((c.cidade || "-").substring(0, 20), 230, y);
      y += 6;
    });
    doc.save(`clientes_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const handleBaixarModeloClientes = () => {
    const csv = [
      "Nome;Nome Fantasia;Tipo;CPF/CNPJ;Email;Telefone;Endereço;Número;Complemento Bairro;Cidade;Estado;CEP;Contato Principal;Observações",
      "EXEMPLO CLIENTE;;PJ;;;;;;;;;;;",
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "modelo_importacao_clientes.csv";
    link.click();
  };

  const handleLimparTodosClientes = async () => {
    if (
      !confirm("Tem certeza que deseja excluir TODOS os clientes? Esta ação não pode ser desfeita.")
    )
      return;
    const todos = await sigo.entities.Cliente.filter({ empresa_id: empresaAtiva.id });
    for (const c of todos) {
      await sigo.entities.Cliente.update(c.id, { ativo: false });
    }
    toast.success("✅ Todos os clientes foram removidos");
    loadData();
  };

  const handleImportarClientes = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportProgress({ show: true, current: 0, total: 0 });
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target.result;
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        const firstLine = text.split(/\r?\n/)[0] || "";
        const sep =
          (firstLine.match(/\t/g) || []).length > 0 ? "\t" : firstLine.includes(";") ? ";" : ",";
        const rows = text
          .split(/\r?\n/)
          .filter((r) => r.trim())
          .map((r) => r.split(sep).map((v) => v.trim().replace(/^"|"$/g, "")));
        const data = rows.slice(1).filter((r) => r[0]);
        if (!data.length) {
          toast.error("❌ Nenhum dado válido no arquivo");
          setImportProgress({ show: false, current: 0, total: 0 });
          return;
        }
        setImportProgress({ show: true, current: 0, total: data.length });
        const batch = data.map((v) => ({
          empresa_id: empresaAtiva.id,
          nome_razao: v[0],
          nome_fantasia: v[1] || "",
          tipo_pessoa: v[2] || "PJ",
          documento: v[3] || "",
          contato_email: v[4] || "",
          contato_telefone: v[5] || "",
          endereco: v[6] || "",
          numero: v[7] || "",
          complemento_bairro: v[8] || "",
          cidade: v[9] || "",
          estado: v[10] || "",
          cep: v[11] || "",
          contato_principal: v[12] || "",
          observacoes: v[13] || "",
          ativo: true,
        }));
        const BATCH_SIZE = 200;
        let importados = 0;
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
          await sigo.entities.Cliente.bulkCreate(batch.slice(i, i + BATCH_SIZE));
          importados += Math.min(BATCH_SIZE, batch.length - i);
          setImportProgress({ show: true, current: importados, total: batch.length });
          if (i + BATCH_SIZE < batch.length) await new Promise((r) => setTimeout(r, 300));
        }
        setImportProgress({ show: false, current: 0, total: 0 });
        toast.success(`✅ ${importados} clientes importados!`);
        loadData();
      } catch (err) {
        setImportProgress({ show: false, current: 0, total: 0 });
        toast.error("❌ Erro: " + err.message);
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleSaveCliente = async () => {
    if (!clienteForm.nome_razao) return;
    try {
      if (selectedCliente) {
        await sigo.entities.Cliente.update(selectedCliente.id, clienteForm);
      } else {
        await sigo.entities.Cliente.create({
          empresa_id: empresaAtiva.id,
          ...clienteForm,
          ativo: true,
        });
      }
      setShowClienteModal(false);
      setClienteForm({
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
      });
      setSelectedCliente(null);
      loadData();
    } catch (error) {
      console.error("Erro:", error);
    }
  };

  const handleDeleteCliente = async (cliente) => {
    if (!confirm("Desativar este cliente?")) return;
    await sigo.entities.Cliente.update(cliente.id, { ativo: false });
    loadData();
  };

  const handleDeletarSelecionados = async () => {
    if (!confirm("Desativar selecionados?")) return;
    for (const id of selectedClienteIds) {
      await sigo.entities.Cliente.update(id, { ativo: false });
    }
    setSelectedClienteIds([]);
    loadData();
  };

  return (
    <>
      {importProgress.show && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Importando Clientes...</h3>
            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{
                  width: `${importProgress.total ? (importProgress.current / importProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-sm text-slate-600 text-center mt-2">
              {importProgress.current} de {importProgress.total}
            </p>
          </div>
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Clientes</CardTitle>
          <div className="flex gap-2">
            {selectedClienteIds.length > 0 && (
              <Button variant="destructive" onClick={handleDeletarSelecionados}>
                <Trash2 className="w-4 h-4 mr-2" />
                Apagar {selectedClienteIds.length} Selecionados
              </Button>
            )}
            <input
              id="fileInputClientes"
              type="file"
              className="hidden"
              accept=".csv"
              onChange={handleImportarClientes}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <FileText className="w-4 h-4 mr-2" />
                  Ações
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleExportarClientesExcel}>
                  <FileText className="w-4 h-4 mr-2" />
                  Exportar em Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportarClientesPDF}>
                  <FileText className="w-4 h-4 mr-2" />
                  Exportar em PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleBaixarModeloClientes}>
                  <FileText className="w-4 h-4 mr-2" />
                  Modelo de Importação
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => document.getElementById("fileInputClientes")?.click()}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Importar Clientes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLimparTodosClientes} className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpar Todos os Registros
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={() => {
                setSelectedCliente(null);
                setClienteForm({
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
                });
                setShowClienteModal(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" /> Novo Cliente
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Buscar por nome, email ou telefone..."
              value={searchCliente}
              onChange={(e) => {
                setSearchCliente(e.target.value);
                setClientesPage(1);
              }}
              className="w-full md:w-96"
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedClienteIds.length === clientes.length && clientes.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedClienteIds(clientes.map((c) => c.id));
                        } else {
                          setSelectedClienteIds([]);
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes
                  .filter(
                    (c) =>
                      searchCliente === "" ||
                      c.nome_razao?.toLowerCase().includes(searchCliente.toLowerCase()) ||
                      c.nome_fantasia?.toLowerCase().includes(searchCliente.toLowerCase()) ||
                      c.contato_email?.toLowerCase().includes(searchCliente.toLowerCase()) ||
                      c.contato_telefone?.includes(searchCliente) ||
                      c.documento?.includes(searchCliente)
                  )
                  .slice((clientesPage - 1) * 50, clientesPage * 50)
                  .map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedClienteIds.includes(c.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedClienteIds([...selectedClienteIds, c.id]);
                            } else {
                              setSelectedClienteIds(selectedClienteIds.filter((id) => id !== c.id));
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{c.nome_razao}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {c.tipo_pessoa}
                        </Badge>
                      </TableCell>
                      <TableCell>{c.documento || "-"}</TableCell>
                      <TableCell className="text-sm">{c.contato_email || "-"}</TableCell>
                      <TableCell className="text-sm">{c.contato_telefone || "-"}</TableCell>
                      <TableCell>{c.cidade || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedCliente(c);
                              setClienteForm(c);
                              setShowClienteModal(true);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteCliente(c)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          {clientes.filter(
            (c) =>
              searchCliente === "" ||
              c.nome_razao?.toLowerCase().includes(searchCliente.toLowerCase()) ||
              c.nome_fantasia?.toLowerCase().includes(searchCliente.toLowerCase()) ||
              c.contato_email?.toLowerCase().includes(searchCliente.toLowerCase()) ||
              c.contato_telefone?.includes(searchCliente) ||
              c.documento?.includes(searchCliente)
          ).length > 50 && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <p className="text-sm text-slate-600">
                Mostrando {(clientesPage - 1) * 50 + 1} a{" "}
                {Math.min(
                  clientesPage * 50,
                  clientes.filter(
                    (c) =>
                      searchCliente === "" ||
                      c.nome_razao?.toLowerCase().includes(searchCliente.toLowerCase()) ||
                      c.nome_fantasia?.toLowerCase().includes(searchCliente.toLowerCase()) ||
                      c.contato_email?.toLowerCase().includes(searchCliente.toLowerCase()) ||
                      c.contato_telefone?.includes(searchCliente) ||
                      c.documento?.includes(searchCliente)
                  ).length
                )}{" "}
                de{" "}
                {
                  clientes.filter(
                    (c) =>
                      searchCliente === "" ||
                      c.nome_razao?.toLowerCase().includes(searchCliente.toLowerCase()) ||
                      c.nome_fantasia?.toLowerCase().includes(searchCliente.toLowerCase()) ||
                      c.contato_email?.toLowerCase().includes(searchCliente.toLowerCase()) ||
                      c.contato_telefone?.includes(searchCliente) ||
                      c.documento?.includes(searchCliente)
                  ).length
                }{" "}
                clientes
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={clientesPage === 1}
                  onClick={() => setClientesPage(clientesPage - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={clientesPage * 50 >= clientes.length}
                  onClick={() => setClientesPage(clientesPage + 1)}
                >
                  Próximo
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Cliente */}
      <Sheet open={showClienteModal} onOpenChange={setShowClienteModal}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <SheetHeader>
            <SheetTitle>{selectedCliente ? "Editar Cliente" : "Novo Cliente"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4 px-6 flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome/Razão Social *</Label>
                <Input
                  value={clienteForm.nome_razao || ""}
                  onChange={(e) => setClienteForm({ ...clienteForm, nome_razao: e.target.value })}
                  placeholder="Nome completo ou razão social"
                  className="mt-1.5"
                />
              </div>
              <div className="col-span-2">
                <Label>Nome Fantasia</Label>
                <Input
                  value={clienteForm.nome_fantasia || ""}
                  onChange={(e) =>
                    setClienteForm({ ...clienteForm, nome_fantasia: e.target.value })
                  }
                  placeholder="Nome fantasia da empresa"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Tipo *</Label>
                <Select
                  value={clienteForm.tipo_pessoa}
                  onValueChange={(v) => setClienteForm({ ...clienteForm, tipo_pessoa: v })}
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
                    value={clienteForm.documento || ""}
                    onChange={(e) => setClienteForm({ ...clienteForm, documento: e.target.value })}
                    placeholder={
                      clienteForm.tipo_pessoa === "PF" ? "000.000.000-00" : "00.000.000/0000-00"
                    }
                  />
                  {clienteForm.tipo_pessoa === "PJ" && (
                    <BuscarCnpjButton
                      cnpj={clienteForm.documento}
                      onData={(d) =>
                        setClienteForm((f) => ({
                          ...f,
                          nome_razao: d.razao_social || f.nome_razao,
                          nome_fantasia: d.nome_fantasia || f.nome_fantasia,
                          contato_email: d.email || f.contato_email,
                          contato_telefone: d.telefone || f.contato_telefone,
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
                    value={clienteForm.contato_principal || ""}
                    onChange={(e) =>
                      setClienteForm({ ...clienteForm, contato_principal: e.target.value })
                    }
                    placeholder="Nome da pessoa de contato"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={clienteForm.contato_email || ""}
                    onChange={(e) =>
                      setClienteForm({ ...clienteForm, contato_email: e.target.value })
                    }
                    placeholder="email@exemplo.com"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={clienteForm.contato_telefone || ""}
                    onChange={(e) =>
                      setClienteForm({ ...clienteForm, contato_telefone: e.target.value })
                    }
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
                      value={clienteForm.cep || ""}
                      onChange={(e) => setClienteForm({ ...clienteForm, cep: e.target.value })}
                      placeholder="00000-000"
                      className="mt-1.5"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Endereço</Label>
                    <Input
                      value={clienteForm.endereco || ""}
                      onChange={(e) => setClienteForm({ ...clienteForm, endereco: e.target.value })}
                      placeholder="Rua, Avenida..."
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Cidade</Label>
                    <Input
                      value={clienteForm.cidade || ""}
                      onChange={(e) => setClienteForm({ ...clienteForm, cidade: e.target.value })}
                      placeholder="São Paulo"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Estado</Label>
                    <Input
                      value={clienteForm.estado || ""}
                      onChange={(e) => setClienteForm({ ...clienteForm, estado: e.target.value })}
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
                value={clienteForm.observacoes || ""}
                onChange={(e) => setClienteForm({ ...clienteForm, observacoes: e.target.value })}
                placeholder="Informações adicionais..."
                className="mt-1.5"
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 p-6 border-t">
            <Button variant="outline" onClick={() => setShowClienteModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCliente} className="bg-amber-500 hover:bg-amber-600">
              Salvar
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
