import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";

const WIDGETS_DISPONIVEIS = [
  {
    id: "metricas-gerais",
    nome: "Métricas Gerais",
    descricao: "Visão geral de oportunidades e projetos",
    modulo: null,
  },
  {
    id: "resumo-financeiro",
    nome: "Resumo Financeiro",
    descricao: "Receitas, despesas e saldo do mês",
    modulo: "Financeiro",
  },
  {
    id: "oportunidades",
    nome: "Oportunidades Recentes",
    descricao: "Últimas oportunidades cadastradas",
    modulo: "Oportunidades",
  },
  {
    id: "projetos-ativos",
    nome: "Projetos Ativos",
    descricao: "Projetos em andamento",
    modulo: "Projetos",
  },
  {
    id: "pedidos-pendentes",
    nome: "Pedidos Pendentes",
    descricao: "Pedidos de compra em aberto",
    modulo: "Compras",
  },
  {
    id: "solicitacoes-pendentes",
    nome: "Solicitações Pendentes",
    descricao: "Solicitações aguardando aprovação",
    modulo: "Compras",
  },
  {
    id: "estoque-baixo",
    nome: "Estoque Baixo",
    descricao: "Materiais abaixo do estoque mínimo",
    modulo: "Estoque",
  },
  {
    id: "contas-pagar",
    nome: "Próximas Contas a Pagar",
    descricao: "Contas com vencimento próximo",
    modulo: "Financeiro",
  },
  {
    id: "seguranca",
    nome: "Segurança do Trabalho",
    descricao: "Documentos e alertas de segurança",
    modulo: "Segurança do Trabalho",
  },
];

export default function DashboardConfigModal({
  open,
  onOpenChange,
  config,
  onSave,
  perfil,
  temPermissao,
  modulosLiberados = {},
  user,
}) {
  const [selectedWidgets, setSelectedWidgets] = React.useState(config || []);

  React.useEffect(() => {
    setSelectedWidgets(config || []);
  }, [config]);

  const handleToggleWidget = (widgetId) => {
    if (selectedWidgets.includes(widgetId)) {
      setSelectedWidgets(selectedWidgets.filter((id) => id !== widgetId));
    } else {
      setSelectedWidgets([...selectedWidgets, widgetId]);
    }
  };

  const handleSave = () => {
    onSave(selectedWidgets);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Personalizar Dashboard</DialogTitle>
          <p className="text-sm text-slate-500">
            Escolha quais widgets deseja exibir no seu dashboard
          </p>
        </DialogHeader>

        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {WIDGETS_DISPONIVEIS.filter((widget) => {
            // Remover widgets específicos para Matheus
            if (user?.full_name === "Matheus Leal Barbosa") {
              if (
                widget.id === "metricas-gerais" ||
                widget.id === "resumo-financeiro" ||
                widget.id === "contas-pagar"
              ) {
                return false;
              }
            }
            // Filtrar por módulo contratado
            if (widget.modulo && !modulosLiberados[widget.modulo]) return false;
            // Filtrar por permissão de usuário
            if (!widget.modulo) return true;
            if (perfil === "Admin") return true;
            return temPermissao ? temPermissao(widget.modulo) : true;
          }).map((widget) => (
            <div
              key={widget.id}
              className="flex items-start gap-3 p-3 border rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Checkbox
                checked={selectedWidgets.includes(widget.id)}
                onCheckedChange={() => handleToggleWidget(widget.id)}
                id={widget.id}
              />
              <div className="flex-1">
                <Label htmlFor={widget.id} className="font-medium text-slate-800 cursor-pointer">
                  {widget.nome}
                </Label>
                <p className="text-xs text-slate-500 mt-0.5">{widget.descricao}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <p className="text-sm text-slate-600">
            {selectedWidgets.length} widget{selectedWidgets.length !== 1 ? "s" : ""} selecionado
            {selectedWidgets.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="bg-amber-500 hover:bg-amber-600">
              <Save className="w-4 h-4 mr-2" />
              Salvar Configuração
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
