import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Wallet, CreditCard, Link2, FolderTree, TrendingUp, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ConciliacaoBancaria from "./ConciliacaoBancaria";
import RegrasConciliacao from "./RegrasConciliacao";
import IntegracaoBancaria from "./IntegracaoBancaria";
import PlanoContas from "./PlanoContas";
import FluxoContaDetalhado from "./FluxoContaDetalhado";

export default function ContasExtratosTab({ empresaAtiva, contas, onReload }) {
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState({
    nome: "",
    tipo: "Banco",
    banco: "",
    agencia: "",
    numero_conta: "",
    saldo_inicial: 0,
    responsavel_email: "",
  });

  const handleOpen = async (conta = null) => {
    // Carregar usuários da empresa para vínculo Fundo Fixo
    try {
      const usrs = await base44.entities.UsuarioEmpresa.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });
      setUsuarios(usrs);
    } catch (e) {
      setUsuarios([]);
    }

    if (conta) {
      setForm({
        nome: conta.nome || "",
        tipo: conta.tipo || "Banco",
        banco: conta.banco || "",
        agencia: conta.agencia || "",
        numero_conta: conta.numero_conta || "",
        saldo_inicial: conta.saldo_inicial || 0,
        responsavel_email: conta.responsavel_email || "",
      });
      setSelectedItem(conta);
    } else {
      setForm({
        nome: "",
        tipo: "Banco",
        banco: "",
        agencia: "",
        numero_conta: "",
        saldo_inicial: 0,
        responsavel_email: "",
      });
      setSelectedItem(null);
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nome) return;

    const data = {
      empresa_id: empresaAtiva.id,
      ...form,
      saldo_atual: form.saldo_inicial,
      ativo: true,
    };

    if (selectedItem) {
      await base44.entities.ContaFinanceira.update(selectedItem.id, data);
    } else {
      await base44.entities.ContaFinanceira.create(data);
    }

    setShowModal(false);
    onReload();
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    if (!confirm("Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita."))
      return;

    await base44.entities.ContaFinanceira.delete(selectedItem.id);
    setShowModal(false);
    onReload();
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="contas">
        <TabsList>
          <TabsTrigger value="contas">Contas</TabsTrigger>
          <TabsTrigger value="integracao">
            <Link2 className="w-4 h-4 mr-1" />
            Integração Bancária
          </TabsTrigger>
          <TabsTrigger value="plano">
            <FolderTree className="w-4 h-4 mr-1" />
            Plano de Contas
          </TabsTrigger>
          <TabsTrigger value="fluxo">
            <TrendingUp className="w-4 h-4 mr-1" />
            Fluxo Detalhado
          </TabsTrigger>
          <TabsTrigger value="conciliacao">Conciliação</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
        </TabsList>

        <TabsContent value="contas" className="space-y-6">
          <div className="flex justify-between">
            <h2 className="text-xl font-semibold text-slate-800">Contas Financeiras</h2>
            <Button onClick={() => handleOpen()} className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Conta
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {contas.map((conta) => (
              <Card
                key={conta.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => handleOpen(conta)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        conta.tipo === "Banco"
                          ? "bg-blue-100"
                          : conta.tipo === "Caixa"
                            ? "bg-green-100"
                            : conta.tipo === "Cartão"
                              ? "bg-purple-100"
                              : "bg-amber-100"
                      }`}
                    >
                      {conta.tipo === "Banco" || conta.tipo === "Cartão" ? (
                        <CreditCard
                          className={`w-6 h-6 ${conta.tipo === "Banco" ? "text-blue-600" : "text-purple-600"}`}
                        />
                      ) : (
                        <Wallet className="w-6 h-6 text-green-600" />
                      )}
                    </div>
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-1">{conta.nome}</h3>
                  <p className="text-sm text-slate-500 mb-3">{conta.banco || conta.tipo}</p>
                  <p className="text-2xl font-bold text-slate-800">
                    {formatCurrency(conta.saldo_atual || conta.saldo_inicial || 0)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="integracao">
          <IntegracaoBancaria empresaAtiva={empresaAtiva} contas={contas} onReload={onReload} />
        </TabsContent>

        <TabsContent value="plano">
          <PlanoContas empresaAtiva={empresaAtiva} contas={contas} onReload={onReload} />
        </TabsContent>

        <TabsContent value="fluxo">
          <FluxoContaDetalhado empresaAtiva={empresaAtiva} contas={contas} />
        </TabsContent>

        <TabsContent value="conciliacao">
          <ConciliacaoBancaria empresaAtiva={empresaAtiva} contas={contas} onReload={onReload} />
        </TabsContent>

        <TabsContent value="regras">
          <RegrasConciliacao empresaAtiva={empresaAtiva} />
        </TabsContent>
      </Tabs>

      <Sheet open={showModal} onOpenChange={setShowModal}>
        <SheetContent
          style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
        >
          <SheetHeader>
            <SheetTitle>{selectedItem ? "Editar Conta" : "Nova Conta"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Conta Corrente"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Banco">Banco</SelectItem>
                  <SelectItem value="Caixa">Caixa</SelectItem>
                  <SelectItem value="Cartão">Cartão</SelectItem>
                  <SelectItem value="Investimento">Investimento</SelectItem>
                  <SelectItem value="Fundo Fixo">Fundo Fixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.tipo === "Fundo Fixo" && (
              <div>
                <Label>Responsável (Usuário)</Label>
                {usuarios.length > 0 ? (
                  <select
                    value={form.responsavel_email}
                    onChange={(e) => setForm({ ...form, responsavel_email: e.target.value })}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 mt-1.5"
                  >
                    <option value="">-- Selecione um usuário --</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.usuario_email}>
                        {u.nome_completo || u.usuario_email} ({u.usuario_email})
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={form.responsavel_email}
                    onChange={(e) => setForm({ ...form, responsavel_email: e.target.value })}
                    placeholder="email@responsavel.com"
                    className="mt-1.5"
                    type="email"
                  />
                )}
                <p className="text-xs text-slate-500 mt-1">
                  Vincula os pré-lançamentos deste usuário a esta conta automaticamente.
                </p>
              </div>
            )}
            <div>
              <Label>Banco</Label>
              <Input
                value={form.banco}
                onChange={(e) => setForm({ ...form, banco: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Agência</Label>
                <Input
                  value={form.agencia}
                  onChange={(e) => setForm({ ...form, agencia: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Conta</Label>
                <Input
                  value={form.numero_conta}
                  onChange={(e) => setForm({ ...form, numero_conta: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label>Saldo Inicial</Label>
              <Input
                type="number"
                value={form.saldo_inicial}
                onChange={(e) =>
                  setForm({ ...form, saldo_inicial: parseFloat(e.target.value) || 0 })
                }
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="flex justify-between gap-3">
            {selectedItem && (
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir Conta
              </Button>
            )}
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!form.nome}>
                Salvar
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
