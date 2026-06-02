import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Edit, Trash2, Calendar, RefreshCw } from "lucide-react";
import { sigo } from "@/api/sigoClient";
import { Switch } from "@/components/ui/switch";

export default function RecorrentesTab({
  empresaAtiva,
  contas,
  categorias,
  fornecedores,
  clientes,
  projetos,
  oportunidades,
}) {
  const [recorrencias, setRecorrencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [form, setForm] = useState({
    tipo: "despesa",
    descricao: "",
    valor: "",
    conta_id: "",
    categoria_id: "",
    fornecedor_id: "",
    cliente_id: "",
    projeto_id: "",
    frequencia: "mensal",
    data_inicio: "",
    data_fim: "",
    dia_vencimento: "",
    forma_pagamento: "",
    observacoes: "",
    ativo: true,
  });

  const loadRecorrencias = React.useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    const data = await sigo.entities.TransacaoRecorrente.filter({ empresa_id: empresaAtiva.id });
    setRecorrencias(data);
    setLoading(false);
  }, [empresaAtiva?.id]);

  useEffect(() => {
    loadRecorrencias();
  }, [empresaAtiva?.id]);

  const handleOpen = (item = null) => {
    if (item) {
      setForm({
        tipo: item.tipo,
        descricao: item.descricao,
        valor: item.valor?.toString() || "",
        conta_id: item.conta_id || "",
        categoria_id: item.categoria_id || "",
        fornecedor_id: item.fornecedor_id || "",
        cliente_id: item.cliente_id || "",
        projeto_id: item.projeto_id || "",
        frequencia: item.frequencia,
        data_inicio: item.data_inicio,
        data_fim: item.data_fim || "",
        dia_vencimento: item.dia_vencimento?.toString() || "",
        forma_pagamento: item.forma_pagamento || "",
        observacoes: item.observacoes || "",
        ativo: item.ativo,
      });
      setSelectedItem(item);
    } else {
      setForm({
        tipo: "despesa",
        descricao: "",
        valor: "",
        conta_id: contas[0]?.id || "",
        categoria_id: "",
        fornecedor_id: "",
        cliente_id: "",
        projeto_id: "",
        frequencia: "mensal",
        data_inicio: new Date().toISOString().split("T")[0],
        data_fim: "",
        dia_vencimento: "",
        forma_pagamento: "",
        observacoes: "",
        ativo: true,
      });
      setSelectedItem(null);
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.descricao || !form.valor || !form.conta_id || !form.data_inicio) {
      alert("Preencha os campos obrigatórios");
      return;
    }

    // Validação dia_vencimento: 1..31 e, se mensal e > 28, alerta o usuário
    // que meses curtos (fev = 28/29; abr/jun/set/nov = 30) vão ajustar pro
    // último dia. Antes o sistema aceitava 31 silenciosamente e pulava meses
    // que não tinham aquele dia ou gerava data inválida.
    if (form.dia_vencimento !== "" && form.dia_vencimento != null) {
      const dia = parseInt(form.dia_vencimento, 10);
      if (Number.isNaN(dia) || dia < 1 || dia > 31) {
        alert("Dia de vencimento deve estar entre 1 e 31.");
        return;
      }
      if (form.frequencia === "mensal" && dia > 28) {
        const ok = confirm(
          `Dia ${dia} não existe em todos os meses (fev tem 28/29, abr/jun/set/nov têm 30).\n\n` +
            `Nos meses curtos, a recorrência será gerada no último dia disponível.\n\n` +
            `Deseja continuar?`
        );
        if (!ok) return;
      }
    }

    const conta = contas.find((c) => c.id === form.conta_id);
    const categoria = categorias.find((c) => c.id === form.categoria_id);
    const fornecedor = fornecedores.find((f) => f.id === form.fornecedor_id);
    const cliente = clientes.find((c) => c.id === form.cliente_id);
    const projeto = projetos.find((p) => p.id === form.projeto_id);

    const data = {
      empresa_id: empresaAtiva.id,
      tipo: form.tipo,
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      conta_id: form.conta_id,
      conta_nome: conta?.nome,
      categoria_id: form.categoria_id || null,
      categoria_nome: categoria?.nome || null,
      fornecedor_id: form.fornecedor_id || null,
      fornecedor_nome: fornecedor?.nome_razao || null,
      cliente_id: form.cliente_id || null,
      cliente_nome: cliente?.nome_razao || null,
      projeto_id: form.projeto_id || null,
      projeto_nome: projeto?.nome || null,
      frequencia: form.frequencia,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
      proxima_geracao: form.data_inicio,
      dia_vencimento: form.dia_vencimento ? parseInt(form.dia_vencimento) : null,
      forma_pagamento: form.forma_pagamento || null,
      observacoes: form.observacoes || null,
      ativo: form.ativo,
    };

    if (selectedItem) {
      const updated = await sigo.entities.TransacaoRecorrente.update(selectedItem.id, data);
      setRecorrencias((prev) =>
        prev.map((r) => (r.id === selectedItem.id ? { ...r, ...data, ...updated } : r))
      );
    } else {
      const created = await sigo.entities.TransacaoRecorrente.create(data);
      setRecorrencias((prev) => [...prev, created]);
    }

    setShowModal(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir esta recorrência?")) return;
    await sigo.entities.TransacaoRecorrente.delete(id);
    setRecorrencias((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggleAtivo = async (item) => {
    const novoAtivo = !item.ativo;
    setRecorrencias((prev) => prev.map((r) => (r.id === item.id ? { ...r, ativo: novoAtivo } : r)));
    await sigo.entities.TransacaoRecorrente.update(item.id, { ativo: novoAtivo });
  };

  const handleProcessarAgora = async () => {
    if (!confirm("Processar todas as recorrências agora?")) return;
    await sigo.functions.invoke("processarRecorrencias", {});
    alert("Recorrências processadas!");
    loadRecorrencias();
  };

  const getFrequenciaLabel = (freq) => {
    const labels = {
      diaria: "Diária",
      semanal: "Semanal",
      mensal: "Mensal",
      anual: "Anual",
    };
    return labels[freq] || freq;
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const categoriasFiltered = categorias.filter(
    (c) => c.tipo === (form.tipo === "despesa" ? "Despesa" : "Receita")
  );

  if (loading) return <div className="p-8 text-center">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">
          Transações Recorrentes ({recorrencias.length})
        </h2>
        <div className="flex gap-2">
          <Button onClick={handleProcessarAgora} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Processar Agora
          </Button>
          <Button onClick={() => handleOpen()} className="gap-2 bg-amber-500 hover:bg-amber-600">
            <Plus className="w-4 h-4" />
            Nova Recorrência
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {recorrencias.map((rec) => (
          <div key={rec.id} className="border rounded-lg p-4 bg-white">
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    className={
                      rec.tipo === "despesa"
                        ? "bg-red-100 text-red-700"
                        : "bg-green-100 text-green-700"
                    }
                  >
                    {rec.tipo === "despesa" ? "Despesa" : "Receita"}
                  </Badge>
                  <Badge variant={rec.ativo ? "default" : "secondary"}>
                    {rec.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <h3 className="font-semibold text-slate-800">{rec.descricao}</h3>
                <p className="text-2xl font-bold text-slate-900 mt-2">
                  {formatCurrency(rec.valor)}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleOpen(rec)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleDelete(rec.id)}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{getFrequenciaLabel(rec.frequencia)}</span>
              </div>
              <div>
                <span className="font-medium">Início:</span>{" "}
                {new Date(rec.data_inicio).toLocaleDateString("pt-BR")}
              </div>
              {rec.data_fim && (
                <div>
                  <span className="font-medium">Fim:</span>{" "}
                  {new Date(rec.data_fim).toLocaleDateString("pt-BR")}
                </div>
              )}
              <div>
                <span className="font-medium">Próxima:</span>{" "}
                {rec.proxima_geracao
                  ? new Date(rec.proxima_geracao).toLocaleDateString("pt-BR")
                  : "-"}
              </div>
              <div>
                <span className="font-medium">Conta:</span> {rec.conta_nome}
              </div>
              {rec.categoria_nome && (
                <div>
                  <span className="font-medium">Categoria:</span> {rec.categoria_nome}
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t flex items-center justify-between">
              <span className="text-sm text-slate-600">Status</span>
              <Switch checked={rec.ativo} onCheckedChange={() => handleToggleAtivo(rec)} />
            </div>
          </div>
        ))}
      </div>

      {recorrencias.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhuma transação recorrente cadastrada</p>
        </div>
      )}

      {/* Modal */}
      <Sheet open={showModal} onOpenChange={setShowModal}>
        <SheetContent
          className="overflow-y-auto"
          style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
        >
          <SheetHeader>
            <SheetTitle>{selectedItem ? "Editar" : "Nova"} Transação Recorrente</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-6">
            <div>
              <Label>Tipo *</Label>
              <Select
                value={form.tipo}
                onValueChange={(val) =>
                  setForm({
                    ...form,
                    tipo: val,
                    categoria_id: "",
                    fornecedor_id: "",
                    cliente_id: "",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="receita">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Descrição *</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                />
              </div>
              <div>
                <Label>Frequência *</Label>
                <Select
                  value={form.frequencia}
                  onValueChange={(val) => setForm({ ...form, frequencia: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diaria">Diária</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Conta *</Label>
              <Select
                value={form.conta_id}
                onValueChange={(val) => setForm({ ...form, conta_id: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Categoria</Label>
              <Select
                value={form.categoria_id}
                onValueChange={(val) => setForm({ ...form, categoria_id: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {categoriasFiltered.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.tipo === "despesa" && (
              <div>
                <Label>Fornecedor</Label>
                <Select
                  value={form.fornecedor_id}
                  onValueChange={(val) => setForm({ ...form, fornecedor_id: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {fornecedores.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome_razao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.tipo === "receita" && (
              <div>
                <Label>Cliente</Label>
                <Select
                  value={form.cliente_id}
                  onValueChange={(val) => setForm({ ...form, cliente_id: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome_razao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Projeto</Label>
              <Select
                value={form.projeto_id}
                onValueChange={(val) => setForm({ ...form, projeto_id: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data Início *</Label>
                <Input
                  type="date"
                  value={form.data_inicio}
                  onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                />
              </div>
              <div>
                <Label>Data Fim</Label>
                <Input
                  type="date"
                  value={form.data_fim}
                  onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
                />
              </div>
            </div>

            {form.frequencia === "mensal" && (
              <div>
                <Label>Dia do Vencimento (1-31)</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={form.dia_vencimento}
                  onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })}
                />
              </div>
            )}

            <div>
              <Label>Forma de Pagamento</Label>
              <Input
                value={form.forma_pagamento}
                onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}
                placeholder="PIX, Boleto, etc"
              />
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <Label>Ativo</Label>
              <Switch
                checked={form.ativo}
                onCheckedChange={(val) => setForm({ ...form, ativo: val })}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={() => setShowModal(false)} variant="outline" className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleSave} className="flex-1 bg-amber-500 hover:bg-amber-600">
                Salvar
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
