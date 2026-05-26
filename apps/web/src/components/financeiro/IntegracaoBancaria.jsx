import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { sigo } from "@/api/sigoClient";
import { Link2, RefreshCw, Trash2 } from "lucide-react";

const bancosList = [
  { codigo: "001", nome: "Banco do Brasil", suportaOpenFinance: true },
  { codigo: "237", nome: "Bradesco", suportaOpenFinance: true },
  { codigo: "341", nome: "Itaú", suportaOpenFinance: true },
  { codigo: "033", nome: "Santander", suportaOpenFinance: true },
  { codigo: "104", nome: "Caixa Econômica", suportaOpenFinance: true },
  { codigo: "077", nome: "Inter", suportaOpenFinance: true },
  { codigo: "260", nome: "Nu Pagamentos (Nubank)", suportaOpenFinance: true },
  { codigo: "290", nome: "PagSeguro", suportaOpenFinance: false },
  { codigo: "336", nome: "C6 Bank", suportaOpenFinance: true },
];

export default function IntegracaoBancaria({ empresaAtiva, contas, onReload }) {
  const [integracoes, setIntegracoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedConta, setSelectedConta] = useState(null);
  const [syncing, setSyncing] = useState({});
  const [form, setForm] = useState({
    conta_id: "",
    banco: "",
    tipo_integracao: "Open Finance",
    frequencia_sincronizacao: "Diária",
    sincronizar_automaticamente: true,
  });

  useEffect(() => {
    if (empresaAtiva) {
      loadIntegracoes();
    }
  }, [empresaAtiva]);

  const loadIntegracoes = async () => {
    setLoading(true);
    try {
      const data = await sigo.entities.IntegracaoBancaria.filter({ empresa_id: empresaAtiva.id });
      setIntegracoes(data);
    } catch (error) {
      console.error("Erro ao carregar integrações:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (conta) => {
    setSelectedConta(conta);
    setForm({
      conta_id: conta.id,
      banco: conta.banco || "",
      tipo_integracao: "Open Finance",
      frequencia_sincronizacao: "Diária",
      sincronizar_automaticamente: true,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const banco = bancosList.find((b) => b.nome === form.banco);

      await sigo.entities.IntegracaoBancaria.create({
        empresa_id: empresaAtiva.id,
        conta_id: form.conta_id,
        banco: form.banco,
        tipo_integracao: form.tipo_integracao,
        status: "Pendente Autorização",
        frequencia_sincronizacao: form.frequencia_sincronizacao,
        sincronizar_automaticamente: form.sincronizar_automaticamente,
        transacoes_importadas: 0,
        config: JSON.stringify({ codigo_banco: banco?.codigo }),
      });

      // Atualizar conta
      await sigo.entities.ContaFinanceira.update(form.conta_id, {
        integracao_bancaria: true,
        codigo_banco: banco?.codigo,
      });

      alert(
        "Integração criada! Em produção, você seria redirecionado para autorizar o acesso via Open Finance."
      );
      setShowModal(false);
      loadIntegracoes();
      onReload();
    } catch (error) {
      console.error("Erro ao salvar integração:", error);
      alert("Erro ao criar integração");
    }
  };

  const handleSincronizar = async (integracao) => {
    setSyncing({ ...syncing, [integracao.id]: true });

    try {
      // Simular sincronização - em produção, chamaria API do banco
      const resultado = await sigo.functions.invoke("sincronizarContaBancaria", {
        integracao_id: integracao.id,
      });

      await sigo.entities.IntegracaoBancaria.update(integracao.id, {
        status: "Ativa",
        ultima_sincronizacao: new Date().toISOString(),
        transacoes_importadas:
          (integracao.transacoes_importadas || 0) + (resultado.novasTransacoes || 0),
      });

      alert(
        `Sincronização concluída! ${resultado.novasTransacoes || 0} novas transações importadas.`
      );
      loadIntegracoes();
      onReload();
    } catch (error) {
      console.error("Erro ao sincronizar:", error);
      alert("Erro ao sincronizar conta");
    } finally {
      setSyncing({ ...syncing, [integracao.id]: false });
    }
  };

  const handleDesconectar = async (integracao) => {
    if (!confirm("Desconectar esta integração bancária?")) return;

    await sigo.entities.IntegracaoBancaria.delete(integracao.id);
    await sigo.entities.ContaFinanceira.update(integracao.conta_id, {
      integracao_bancaria: false,
    });

    loadIntegracoes();
    onReload();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Ativa":
        return "bg-green-100 text-green-700";
      case "Inativa":
        return "bg-slate-100 text-slate-700";
      case "Erro":
        return "bg-red-100 text-red-700";
      case "Pendente Autorização":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const contasSemIntegracao = contas.filter(
    (c) => c.tipo === "Banco" && !integracoes.some((i) => i.conta_id === c.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Integração Bancária</h2>
          <p className="text-sm text-slate-500">
            Conecte suas contas via Open Finance para importação automática
          </p>
        </div>
      </div>

      {/* Integrações Ativas */}
      {integracoes.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-medium text-slate-700">Contas Conectadas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integracoes.map((int) => {
              const conta = contas.find((c) => c.id === int.conta_id);
              return (
                <Card key={int.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Link2 className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{conta?.nome}</p>
                          <p className="text-sm text-slate-500">{int.banco}</p>
                        </div>
                      </div>
                      <Badge className={getStatusColor(int.status)}>{int.status}</Badge>
                    </div>

                    <div className="space-y-2 text-sm mb-3">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Tipo:</span>
                        <span className="font-medium">{int.tipo_integracao}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Transações:</span>
                        <span className="font-medium">{int.transacoes_importadas || 0}</span>
                      </div>
                      {int.ultima_sincronizacao && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Última sync:</span>
                          <span className="font-medium">
                            {new Date(int.ultima_sincronizacao).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleSincronizar(int)}
                        disabled={syncing[int.id]}
                      >
                        {syncing[int.id] ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                            Sincronizando...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Sincronizar
                          </>
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDesconectar(int)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Contas Disponíveis */}
      {contasSemIntegracao.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-medium text-slate-700">Conectar Novas Contas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contasSemIntegracao.map((conta) => (
              <Card key={conta.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-slate-800">{conta.nome}</p>
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                      <Link2 className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 mb-3">
                    {conta.banco || "Banco não especificado"}
                  </p>
                  <Button size="sm" className="w-full" onClick={() => handleOpenModal(conta)}>
                    <Link2 className="w-4 h-4 mr-1" />
                    Conectar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {integracoes.length === 0 && contasSemIntegracao.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Link2 className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 mb-2">Nenhuma conta bancária</h3>
            <p className="text-slate-500">Crie contas bancárias na aba "Contas" para conectá-las</p>
          </CardContent>
        </Card>
      )}

      {/* Modal de Configuração */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar Conta Bancária</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Banco *</Label>
              <Select value={form.banco} onValueChange={(v) => setForm({ ...form, banco: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione o banco" />
                </SelectTrigger>
                <SelectContent>
                  {bancosList.map((banco) => (
                    <SelectItem key={banco.codigo} value={banco.nome}>
                      {banco.nome}
                      {banco.suportaOpenFinance && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Open Finance
                        </Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo de Integração</Label>
              <Select
                value={form.tipo_integracao}
                onValueChange={(v) => setForm({ ...form, tipo_integracao: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open Finance">Open Finance</SelectItem>
                  <SelectItem value="API Proprietária">API Proprietária</SelectItem>
                  <SelectItem value="Manual">Manual (Importação de OFX)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Frequência de Sincronização</Label>
              <Select
                value={form.frequencia_sincronizacao}
                onValueChange={(v) => setForm({ ...form, frequencia_sincronizacao: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Manual">Manual</SelectItem>
                  <SelectItem value="Hora">A cada hora</SelectItem>
                  <SelectItem value="4 horas">A cada 4 horas</SelectItem>
                  <SelectItem value="Diária">Diariamente</SelectItem>
                  <SelectItem value="Semanal">Semanalmente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Sincronização Automática</Label>
              <Switch
                checked={form.sincronizar_automaticamente}
                onCheckedChange={(checked) =>
                  setForm({ ...form, sincronizar_automaticamente: checked })
                }
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700">
                💡 Com Open Finance, você autoriza o acesso seguro aos seus dados bancários. Suas
                credenciais nunca são armazenadas.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!form.banco}>
              Conectar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
