import React, { useState, useEffect, useRef } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SheetModalComponent from "@/components/ui/sheet-modal";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function CampoObrigatorioRow({
  campo,
  ferramentasVinculadas,
  ferramentasMovimentacao,
  ferramentas,
  onToggle,
}) {
  const [buscaCampo, setBuscaCampo] = useState("");

  const ferramentasDisponiveisParaCampo = ferramentasMovimentacao
    .filter((f) => f.ferramenta_id)
    .map((f) => ferramentas.find((ferr) => ferr.id === f.ferramenta_id))
    .filter(Boolean);
  const ferramentasFiltradas = ferramentasDisponiveisParaCampo.filter(
    (f) =>
      f.descricao?.toLowerCase().includes(buscaCampo.toLowerCase()) ||
      f.codigo?.toLowerCase().includes(buscaCampo.toLowerCase())
  );

  return (
    <div className="bg-white rounded-lg border border-amber-100 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-sm text-slate-800">{campo.nome_campo}</p>
        <Badge
          className={
            ferramentasVinculadas.length > 0
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }
        >
          {ferramentasVinculadas.length} vinculada(s)
        </Badge>
      </div>
      <div className="relative mb-2">
        <Input
          placeholder="Buscar ferramenta para este campo..."
          value={buscaCampo}
          onChange={(e) => setBuscaCampo(e.target.value)}
          className="h-8 text-xs"
        />
        {buscaCampo && ferramentasFiltradas.length > 0 && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {ferramentasFiltradas.map((f) => {
              const jaVinculada = ferramentasVinculadas.includes(f.id);
              return (
                <div
                  key={f.id}
                  onClick={() => {
                    onToggle(campo.id, f.id);
                    setBuscaCampo("");
                  }}
                  className={`px-3 py-2 border-b last:border-b-0 cursor-pointer transition-colors ${jaVinculada ? "bg-green-50 hover:bg-green-100" : "hover:bg-slate-100"}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-xs text-slate-800">{f.descricao}</div>
                      <div className="text-xs text-slate-500 font-mono">{f.codigo}</div>
                    </div>
                    {jaVinculada && <span className="text-green-700 font-bold text-sm">✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {ferramentasVinculadas.length > 0 && (
        <div className="space-y-1">
          {ferramentasVinculadas.map((ferrId) => {
            const ferr = ferramentas.find((f) => f.id === ferrId);
            if (!ferr) return null;
            return (
              <div
                key={ferrId}
                className="flex items-center justify-between bg-green-50 border border-green-100 rounded px-2 py-1 text-xs"
              >
                <span className="font-medium text-green-800 truncate flex-1">{ferr.descricao}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-red-500 hover:text-red-700 flex-shrink-0"
                  onClick={() => onToggle(campo.id, ferrId)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {ferramentasDisponiveisParaCampo.length === 0 && (
        <p className="text-xs text-slate-400 italic">Nenhuma ferramenta na movimentação ainda</p>
      )}
    </div>
  );
}

export default function MovimentacaoModal({ open, onClose, empresaAtiva, onSave, movimentacao }) {
  const [form, setForm] = useState({
    tipo_movimentacao: "",
    status: "Pendente",
    funcionario_id: "",
    funcionario_nome: "",
    projeto_id: "",
    projeto_nome: "",
    data_movimentacao: new Date().toISOString().split("T")[0],
    data_prevista_devolucao: "",
    motivo_manutencao: "",
    motivo_baixa: "",
    observacoes: "",
    numero_laudo: "", // referência da lista assinada (opcional)
    almoxarifado_id: "",
    almoxarifado_nome: "",
  });

  const [ferramentasMovimentacao, setFerramentasMovimentacao] = useState([]);
  const tdRefs = useRef({});

  const [funcionarios, setFuncionarios] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [ferramentasPorFuncao, setFerramentasPorFuncao] = useState([]);
  const [selecoesFuncao, setSelecoesFuncao] = useState({}); // { idx: { ferramenta_id, codigo, descricao, numero_serie } }
  const [buscaFuncao, setBuscaFuncao] = useState({}); // { idx: string }
  const [saving, setSaving] = useState(false);
  const [openFerramentaSearch, setOpenFerramentaSearch] = useState(false);
  const [metodoEntrega, setMetodoEntrega] = useState("individual"); // 'individual' ou 'funcao'
  const [almoxarifados, setAlmoxarifados] = useState([]);
  const [buscaFerramentas, setBuscaFerramentas] = useState({});
  const [dropdownAberto, setDropdownAberto] = useState(null); // idx ou null
  const inputRefs = useRef({});
  const dropdownRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [caminhoes, setCaminhoes] = useState([]);
  const [caminhaoSelecionado, setCaminhaoSelecionado] = useState(null);
  const [camposObrigatorios, setCamposObrigatorios] = useState([]);
  const [campoVinculacoes, setCampoVinculacoes] = useState({}); // { campo_id: [ferramenta_id, ...] }
  const [ferramentasDoCaminhao, setFerramentasDoCaminhao] = useState([]);

  useEffect(() => {
    if (open && empresaAtiva?.id) {
      loadData();
      if (movimentacao) {
        setForm({
          tipo_movimentacao: movimentacao.tipo_movimentacao,
          status: movimentacao.status,
          funcionario_id: movimentacao.funcionario_id || "",
          funcionario_nome: movimentacao.funcionario_nome || "",
          projeto_id: movimentacao.projeto_id || "",
          projeto_nome: movimentacao.projeto_nome || "",
          data_movimentacao: movimentacao.data_movimentacao,
          data_prevista_devolucao: movimentacao.data_prevista_devolucao || "",
          motivo_manutencao: movimentacao.motivo_manutencao || "",
          motivo_baixa: movimentacao.motivo_baixa || "",
          observacoes: movimentacao.observacoes || "",
          almoxarifado_id: movimentacao.almoxarifado_id || "",
          almoxarifado_nome: movimentacao.almoxarifado_nome || "",
        });
        if (movimentacao.ferramentas) {
          setFerramentasMovimentacao(movimentacao.ferramentas);
        }
      } else {
        // Adicionar primeira linha vazia automaticamente quando abre modal novo
        if (ferramentasMovimentacao.length === 0) {
          adicionarFerramenta();
        }
      }
    }
  }, [open, empresaAtiva?.id, movimentacao]);

  const loadData = async () => {
    try {
      const [funcs, prjs, ferrs, funcoesData, almox, cams] = await Promise.all([
        sigo.entities.Funcionario.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Funcao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Almoxarifado.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Caminhao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ]);

      const funcionariosUnificados = funcs.map((func) => {
        if (!func.funcao_id && func.funcao_nome) {
          const funcaoEncontrada = funcoesData.find((f) => f.nome === func.funcao_nome);
          return { ...func, funcao_id: funcaoEncontrada?.id || func.funcao_id };
        }
        return func;
      });

      setFuncionarios(
        funcionariosUnificados.sort((a, b) =>
          (a.nome_completo || "").localeCompare(b.nome_completo || "")
        )
      );
      setProjetos(prjs.sort((a, b) => (a.nome || "").localeCompare(b.nome || "")));
      setFerramentas(ferrs.sort((a, b) => (a.codigo || "").localeCompare(b.codigo || "")));
      setFuncoes(funcoesData.sort((a, b) => (a.nome || "").localeCompare(b.nome || "")));
      setAlmoxarifados(almox.sort((a, b) => (a.nome || "").localeCompare(b.nome || "")));
      setCaminhoes(cams.sort((a, b) => (a.placa || "").localeCompare(b.placa || "")));
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    }
  };

  const handleFuncaoSelect = async (funcaoId) => {
    if (!funcaoId) {
      setFerramentasPorFuncao([]);
      setSelecoesFuncao({});
      setBuscaFuncao({});
      return;
    }

    try {
      const funcoesAtualizada = await sigo.entities.Funcao.filter({ id: funcaoId });
      if (funcoesAtualizada.length === 0) {
        setFerramentasPorFuncao([]);
        return;
      }

      const funcao = funcoesAtualizada[0];

      let modeloFerramentas = [];
      if (funcao.modelo_ferramentas) {
        try {
          const parsed = JSON.parse(funcao.modelo_ferramentas);
          modeloFerramentas = Array.isArray(parsed)
            ? parsed.map((i) => ({ ...i, _tipo: "Ferramenta" }))
            : [];
        } catch (e) {
          modeloFerramentas = [];
        }
      }

      let modeloEpis = [];
      if (funcao.modelo_epi) {
        try {
          const parsed = JSON.parse(funcao.modelo_epi);
          modeloEpis = Array.isArray(parsed) ? parsed.map((i) => ({ ...i, _tipo: "EPI" })) : [];
        } catch (e) {
          modeloEpis = [];
        }
      }

      const todosItens = [...modeloFerramentas, ...modeloEpis];

      if (todosItens.length === 0) {
        setFerramentasPorFuncao([]);
        return;
      }

      // Para cada item do modelo, buscar candidatos disponíveis no estoque
      const todasFerramentas = await sigo.entities.Ferramenta.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });

      const itensFuncao = todosItens.map((item) => {
        const itemNome = item.ferramenta || item.item || item.codigo || item.descricao || "";
        const candidatos = todasFerramentas.filter(
          (f) =>
            f.status === "Disponível" &&
            (f.descricao?.toLowerCase() === itemNome.toLowerCase() ||
              f.codigo?.toLowerCase() === itemNome.toLowerCase() ||
              f.descricao?.toLowerCase().includes(itemNome.toLowerCase()) ||
              itemNome.toLowerCase().includes(f.descricao?.toLowerCase()))
        );
        return {
          nome: itemNome,
          tipo: item._tipo,
          quantidade_necessaria: parseInt(item.quantidade) || 1,
          candidatos,
        };
      });

      setFerramentasPorFuncao(itensFuncao);
      setSelecoesFuncao({});
      setBuscaFuncao({});
    } catch (error) {
      console.error("Erro ao processar ferramentas da função:", error);
      setFerramentasPorFuncao([]);
    }
  };

  const handleSave = async () => {
    // Validação para entrega por função
    if (metodoEntrega === "funcao") {
      if (!form.funcionario_id) {
        toast.error("Selecione um funcionário");
        return;
      }
      // Coletar todas as ferramentas selecionadas (apenas as que foram selecionadas)
      const todasSelecionadas = Object.values(selecoesFuncao).filter(Boolean);

      if (todasSelecionadas.length === 0) {
        toast.error("Selecione ao menos uma ferramenta para entregar");
        return;
      }

      setSaving(true);
      try {
        let total = 0;
        for (const ferramenta of todasSelecionadas) {
          await sigo.entities.MovimentacaoFerramenta.create({
            ferramenta_id: ferramenta.id,
            ferramenta_codigo: ferramenta.codigo,
            ferramenta_descricao: ferramenta.descricao,
            tipo_movimentacao: "Entrega para Funcionário",
            status: "Realizada",
            funcionario_id: form.funcionario_id,
            funcionario_nome: form.funcionario_nome,
            data_movimentacao: form.data_movimentacao,
            observacoes: form.observacoes,
            quantidade: 1,
            empresa_id: empresaAtiva.id,
            destino: form.funcionario_nome,
            origem: ferramenta.localizacao || "Almoxarifado",
            usuario_nome: "Sistema",
          });
          await sigo.entities.Ferramenta.update(ferramenta.id, {
            status: "Em Uso",
            funcionario_id: form.funcionario_id,
            funcionario_nome: form.funcionario_nome,
            localizacao: form.funcionario_nome,
          });
          total++;
        }
        toast.success(`${total} ferramentas entregues`);
        resetForm();
        onClose();
        setTimeout(() => onSave({}), 500);
      } catch (error) {
        console.error("Erro:", error);
        toast.error("Erro ao registrar movimentação");
      } finally {
        setSaving(false);
      }
      return;
    }

    // Validação para entrega individual
    const ferramentasValidas = ferramentasMovimentacao.filter((f) => f.ferramenta_id);
    if (ferramentasValidas.length === 0 || !form.tipo_movimentacao || !form.data_movimentacao) {
      toast.error("Preencha os campos obrigatórios: selecione ao menos uma ferramenta");
      return;
    }

    if (
      (form.tipo_movimentacao === "Entrega para Funcionário" ||
        form.tipo_movimentacao === "Empréstimo") &&
      !form.funcionario_id
    ) {
      toast.error("Selecione um funcionário para este tipo de movimentação");
      return;
    }

    if (form.tipo_movimentacao === "Movimentação para Caminhão" && !form.almoxarifado_id) {
      toast.error("Selecione um caminhão para este tipo de movimentação");
      return;
    }

    // Definir destino baseado no tipo de movimentação
    let destino = "";
    if (
      form.tipo_movimentacao === "Entrega para Funcionário" ||
      form.tipo_movimentacao === "Empréstimo"
    ) {
      destino = form.funcionario_nome;
    } else if (form.tipo_movimentacao === "Manutenção") {
      destino = "Em Manutenção";
    } else if (form.tipo_movimentacao === "Baixa para Sucata") {
      destino = "Baixado";
    } else if (form.tipo_movimentacao === "Devolução") {
      destino = "Almoxarifado";
    } else if (form.tipo_movimentacao === "Entrada Estoque") {
      destino = "Almoxarifado";
    } else if (form.tipo_movimentacao === "Movimentação para Caminhão") {
      destino = form.almoxarifado_nome || "Caminhão";
    }

    setSaving(true);
    try {
      // Salvar cada ferramenta como movimentação
      for (const ferr of ferramentasMovimentacao) {
        await onSave({
          ...form,
          ferramenta_id: ferr.ferramenta_id,
          ferramenta_codigo: ferr.codigo,
          ferramenta_descricao: ferr.descricao,
          quantidade: ferr.quantidade,
          empresa_id: empresaAtiva.id,
          destino: destino,
          status: "Realizada",
          usuario_nome: "Usuário",
        });
      }

      // Se for Manutenção: criar UM único pedido de manutenção com todas as ferramentas
      if (form.tipo_movimentacao === "Manutenção") {
        const ferramentasLista = ferramentasValidas.map((f) => ({
          ferramenta_id: f.ferramenta_id,
          codigo: f.codigo,
          descricao: f.descricao,
          numero_serie: f.numero_serie || "",
        }));
        await sigo.entities.ManutencaoFerramenta.create({
          empresa_id: empresaAtiva.id,
          ferramenta_id: ferramentasValidas[0]?.ferramenta_id || "",
          ferramenta_codigo: ferramentasValidas[0]?.codigo || "",
          ferramenta_descricao:
            ferramentasValidas.length === 1
              ? ferramentasValidas[0]?.descricao
              : `${ferramentasValidas.length} ferramentas`,
          ferramentas: JSON.stringify(ferramentasLista),
          tipo_manutencao: "Corretiva",
          status: "Agendada",
          data_prevista: form.data_movimentacao,
          descricao: form.motivo_manutencao || "Registrado via Movimentação",
          observacoes: form.observacoes || "",
        });
        // Atualizar status de todas as ferramentas para Em Manutenção
        await Promise.all(
          ferramentasValidas.map((ferr) =>
            sigo.entities.Ferramenta.update(ferr.ferramenta_id, { status: "Em Manutenção" })
          )
        );
      }

      // Se for movimentação para caminhão: salvar caminhao_id nas ferramentas + vincular campos obrigatórios
      if (form.tipo_movimentacao === "Movimentação para Caminhão" && form.almoxarifado_id) {
        // Atualizar caminhao_id em cada ferramenta movimentada
        await Promise.all(
          ferramentasMovimentacao
            .filter((f) => f.ferramenta_id)
            .map((f) =>
              sigo.entities.Ferramenta.update(f.ferramenta_id, {
                caminhao_id: form.almoxarifado_id,
                localizacao: form.almoxarifado_nome || "Caminhão",
              })
            )
        );
        // Salvar vinculações de campos obrigatórios se houver
        if (Object.keys(campoVinculacoes).length > 0) {
          await Promise.all(
            Object.entries(campoVinculacoes).map(([campoId, ferrIds]) =>
              sigo.entities.CaminhaoCampoObrigatorio.update(campoId, {
                ferramenta_ids: JSON.stringify(ferrIds),
              })
            )
          );
        }
      }

      toast.success("Movimentação registrada com sucesso");
      resetForm();
      onClose();
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao salvar movimentação");
    } finally {
      setSaving(false);
    }
  };

  const handleCaminhaoSelect = async (caminhaoId) => {
    const caminhao = caminhoes.find((c) => c.id === caminhaoId);
    setCaminhaoSelecionado(caminhao || null);
    setCampoVinculacoes({});
    setForm((prev) => ({
      ...prev,
      almoxarifado_id: caminhaoId,
      almoxarifado_nome: caminhao?.placa || "",
    }));
    if (!caminhaoId) {
      setCamposObrigatorios([]);
      setFerramentasDoCaminhao([]);
      setFerramentasMovimentacao([]);
      return;
    }
    try {
      const [campos, ferrsNoCaminhao] = await Promise.all([
        sigo.entities.CaminhaoCampoObrigatorio.filter({
          empresa_id: empresaAtiva.id,
          caminhao_id: caminhaoId,
          ativo: true,
        }),
        sigo.entities.Ferramenta.filter({
          empresa_id: empresaAtiva.id,
          caminhao_id: caminhaoId,
          ativo: true,
        }),
      ]);
      setCamposObrigatorios(
        campos.sort((a, b) => (a.nome_campo || "").localeCompare(b.nome_campo || ""))
      );
      setFerramentasDoCaminhao(
        ferrsNoCaminhao.sort((a, b) => (a.descricao || "").localeCompare(b.descricao || ""))
      );

      // Auto-preencher ferramentas obrigatórias na tabela de movimentação
      const ferramentasObrigatorias = [];
      campos.forEach((campo) => {
        if (campo.ferramenta_ids) {
          try {
            const ids = JSON.parse(campo.ferramenta_ids);
            if (Array.isArray(ids)) {
              ids.forEach((ferrId) => {
                const ferr = ferramentas.find((f) => f.id === ferrId);
                if (ferr) {
                  ferramentasObrigatorias.push({
                    ferramenta_id: ferr.id,
                    codigo: ferr.codigo,
                    descricao: ferr.descricao,
                    numero_serie: ferr.numero_serie || "",
                    quantidade: 1,
                    valor_unitario: ferr.valor_unitario || 0,
                  });
                }
              });
            }
          } catch (e) {
            console.error("Erro ao parsear ferramenta_ids:", e);
          }
        }
      });

      setFerramentasMovimentacao(ferramentasObrigatorias.length > 0 ? ferramentasObrigatorias : []);
    } catch {
      setCamposObrigatorios([]);
      setFerramentasDoCaminhao([]);
      setFerramentasMovimentacao([]);
    }
  };

  const toggleVinculacaoCampo = (campoId, ferramentaId) => {
    setCampoVinculacoes((prev) => {
      const ids = prev[campoId] || [];
      if (ids.includes(ferramentaId)) {
        return { ...prev, [campoId]: ids.filter((id) => id !== ferramentaId) };
      }
      return { ...prev, [campoId]: [...ids, ferramentaId] };
    });
  };

  const resetForm = () => {
    setForm({
      tipo_movimentacao: "",
      status: "Pendente",
      funcionario_id: "",
      funcionario_nome: "",
      projeto_id: "",
      projeto_nome: "",
      data_movimentacao: new Date().toISOString().split("T")[0],
      data_prevista_devolucao: "",
      motivo_manutencao: "",
      motivo_baixa: "",
      observacoes: "",
      numero_laudo: "",
      almoxarifado_id: "",
      almoxarifado_nome: "",
    });
    setFerramentasMovimentacao([]);
    setMetodoEntrega("individual");
    setFerramentasPorFuncao([]);
    setSelecoesFuncao({});
    setBuscaFuncao({});
    setCaminhaoSelecionado(null);
    setCamposObrigatorios([]);
    setFerramentasDoCaminhao([]);
    setCampoVinculacoes({});
  };

  const adicionarFerramenta = () => {
    setFerramentasMovimentacao([
      ...ferramentasMovimentacao,
      {
        ferramenta_id: "",
        codigo: "",
        descricao: "",
        numero_serie: "",
        quantidade: 1,
        valor_unitario: 0,
      },
    ]);
  };

  const removerFerramenta = (idx) => {
    setFerramentasMovimentacao(ferramentasMovimentacao.filter((_, i) => i !== idx));
  };

  const atualizarFerramenta = (idx, campo, valor) => {
    const novas = [...ferramentasMovimentacao];
    novas[idx][campo] = valor;
    setFerramentasMovimentacao(novas);
  };

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleMouseDown = (e) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      const inputEl = dropdownAberto !== null ? inputRefs.current[dropdownAberto] : null;
      if (inputEl && inputEl.contains(e.target)) return;
      setDropdownAberto(null);
    };
    if (dropdownAberto !== null) {
      document.addEventListener("mousedown", handleMouseDown);
    }
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [dropdownAberto]);

  const exportarParaExcel = async () => {
    try {
      const xlsx = await import("xlsx");
      const dados = ferramentasMovimentacao.map((f) => ({
        Código: f.codigo,
        Descrição: f.descricao,
        Quantidade: f.quantidade,
        "Valor Unitário": f.valor_unitario,
      }));
      const ws = xlsx.utils.json_to_sheet(dados);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Ferramentas");
      xlsx.writeFile(
        wb,
        `ferramentas_${form.tipo_movimentacao}_${new Date().toISOString().split("T")[0]}.xlsx`
      );
      toast.success("Exportação concluída");
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao exportar Excel");
    }
  };

  const exportarParaPDF = async () => {
    try {
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text("Movimentação de Ferramentas", 20, 20);
      doc.setFontSize(10);
      doc.text(`Tipo: ${form.tipo_movimentacao}`, 20, 35);
      doc.text(`Data: ${new Date(form.data_movimentacao).toLocaleDateString("pt-BR")}`, 20, 45);
      let y = 60;
      doc.setFontSize(9);
      doc.text("Código", 20, y);
      doc.text("Descrição", 60, y);
      doc.text("Qtd.", 150, y);
      doc.text("V. Unit.", 170, y);
      y += 10;
      ferramentasMovimentacao.forEach((f) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(f.codigo || "", 20, y);
        doc.text((f.descricao || "").substring(0, 40), 60, y);
        doc.text(String(f.quantidade), 150, y);
        doc.text(Number(f.valor_unitario).toFixed(2), 170, y);
        y += 8;
      });
      doc.save(`ferramentas_${new Date().toISOString().split("T")[0]}.pdf`);
      toast.success("Exportação PDF concluída");
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      toast.error("Erro ao exportar PDF");
    }
  };

  const downloadModelo = async () => {
    try {
      const xlsx = await import("xlsx");
      const dados = [{ Código: "", Descrição: "", Quantidade: 1, "Valor Unitário": 0 }];
      const ws = xlsx.utils.json_to_sheet(dados);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Ferramentas");
      xlsx.writeFile(wb, "modelo_ferramentas.xlsx");
      toast.success("Modelo baixado com sucesso");
    } catch (error) {
      console.error("Erro ao baixar modelo:", error);
      toast.error("Erro ao baixar modelo");
    }
  };

  const importarDoExcel = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        const xlsx = await import("xlsx");
        const reader = new FileReader();
        reader.onload = (event) => {
          const wb = xlsx.read(event.target.result);
          const ws = wb.Sheets[wb.SheetNames[0]];
          const dados = xlsx.utils.sheet_to_json(ws);
          const novasFerramentas = dados.map((row) => {
            const descricaoLimpada = (row["Descrição"] || row.descricao || "").toLowerCase().trim();
            const ferramentaMatching = ferramentas.find(
              (f) =>
                f.descricao.toLowerCase().includes(descricaoLimpada) ||
                descricaoLimpada.includes(f.descricao.toLowerCase())
            );
            return {
              ferramenta_id: ferramentaMatching?.id || "",
              codigo: ferramentaMatching?.codigo || row["Código"] || row.codigo || "",
              descricao: ferramentaMatching?.descricao || row["Descrição"] || row.descricao || "",
              quantidade: parseInt(row["Quantidade"] || row.quantidade || 1),
              valor_unitario: parseFloat(row["Valor Unitário"] || row["valor_unitario"] || 0),
            };
          });
          setFerramentasMovimentacao(novasFerramentas);
          toast.success(`${novasFerramentas.length} ferramentas importadas`);
        };
        reader.readAsArrayBuffer(file);
      } catch (error) {
        console.error("Erro ao importar:", error);
        toast.error("Erro ao importar Excel");
      }
    };
    input.click();
  };

  return (
    <SheetModalComponent
      open={open}
      onOpenChange={onClose}
      title={movimentacao ? "Editar Movimentação" : "Nova Movimentação de Ferramenta"}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              saving ||
              !form.tipo_movimentacao ||
              (metodoEntrega !== "funcao" &&
                ferramentasMovimentacao.filter((f) => f.ferramenta_id).length === 0) ||
              (metodoEntrega === "funcao" && Object.keys(selecoesFuncao).length === 0)
            }
            className="flex-1 bg-amber-500 hover:bg-amber-600"
          >
            {saving
              ? "Salvando..."
              : metodoEntrega === "funcao"
                ? "Entregar Ferramentas"
                : movimentacao
                  ? "Atualizar"
                  : "Registrar Movimentação"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Tipo de Movimentação */}
        <div>
          <Label>Tipo de Movimentação *</Label>
          <Select
            value={form.tipo_movimentacao}
            onValueChange={(v) => {
              setForm({ ...form, tipo_movimentacao: v });
              if (v !== "Entrega para Funcionário") setMetodoEntrega("individual");
            }}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Entrega para Funcionário">Entrega para Funcionário</SelectItem>
              <SelectItem value="Empréstimo">Empréstimo</SelectItem>
              <SelectItem value="Movimentação para Caminhão">Movimentação para Caminhão</SelectItem>
              <SelectItem value="Manutenção">Manutenção</SelectItem>
              <SelectItem value="Baixa para Sucata">Baixa para Sucata</SelectItem>
              <SelectItem value="Devolução">Devolução</SelectItem>
              <SelectItem value="Entrada Estoque">Entrada Estoque</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.tipo_movimentacao === "Entrega para Funcionário" && !movimentacao && (
          <div>
            <Label>Método de Entrega</Label>
            <Select
              value={metodoEntrega}
              onValueChange={(v) => {
                setMetodoEntrega(v);
                setFerramentasPorFuncao([]);
                // Se já há funcionário selecionado e mudou para 'funcao', carregar as ferramentas
                if (v === "funcao" && form.funcionario_id) {
                  const func = funcionarios.find((f) => f.id === form.funcionario_id);
                  if (func?.funcao_id) handleFuncaoSelect(func.funcao_id);
                  else if (func?.funcao_nome) {
                    const funcaoEncontrada = funcoes.find((f) => f.nome === func.funcao_nome);
                    if (funcaoEncontrada?.id) handleFuncaoSelect(funcaoEncontrada.id);
                  }
                }
              }}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Item por Item</SelectItem>
                <SelectItem value="funcao">Por Função (lista padronizada)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {form.tipo_movimentacao === "Movimentação para Caminhão" && (
          <div className="space-y-4">
            <div>
              <Label>Caminhão *</Label>
              <Select value={form.almoxarifado_id} onValueChange={handleCaminhaoSelect}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione um caminhão" />
                </SelectTrigger>
                <SelectContent>
                  {caminhoes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-mono font-bold">{c.placa}</span>
                      {c.marca || c.modelo
                        ? ` — ${[c.marca, c.modelo].filter(Boolean).join(" ")}`
                        : ""}
                      {c.motorista_padrao_nome ? ` · ${c.motorista_padrao_nome}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {caminhaoSelecionado && ferramentasDoCaminhao.length > 0 && (
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="p-3">
                  <p className="text-xs font-semibold text-blue-800 mb-2">
                    🚛 Itens já neste caminhão ({ferramentasDoCaminhao.length})
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {ferramentasDoCaminhao.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between bg-white rounded px-2 py-1 text-xs border border-blue-100"
                      >
                        <span className="font-medium text-slate-700 truncate flex-1">
                          {f.descricao}
                        </span>
                        <span className="font-mono text-slate-400 ml-2 flex-shrink-0">
                          {f.codigo_secundario || f.codigo}
                        </span>
                        <Badge
                          className={`ml-2 flex-shrink-0 text-xs ${f.status === "Disponível" ? "bg-green-100 text-green-700" : f.status === "Em Uso" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {f.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {caminhaoSelecionado && ferramentasDoCaminhao.length === 0 && (
              <p className="text-xs text-slate-400 italic">
                Nenhum item vinculado a este caminhão ainda.
              </p>
            )}
            {caminhaoSelecionado && camposObrigatorios.length > 0 && (
              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-sm text-amber-900 mb-4">
                    ⚙️ Campos Obrigatórios — Busque e vincule ferramentas
                  </h4>
                  <div className="space-y-3">
                    {camposObrigatorios.map((campo) => (
                      <CampoObrigatorioRow
                        key={campo.id}
                        campo={campo}
                        ferramentasVinculadas={campoVinculacoes[campo.id] || []}
                        ferramentasMovimentacao={ferramentasMovimentacao}
                        ferramentas={ferramentas}
                        onToggle={toggleVinculacaoCampo}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {caminhaoSelecionado && camposObrigatorios.length === 0 && (
              <Card className="bg-slate-50 border-slate-200">
                <CardContent className="p-3 text-xs text-slate-500 text-center">
                  Este caminhão não possui campos obrigatórios configurados.
                  <br />
                  Configure em Configurações → Caminhões.
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {(form.tipo_movimentacao === "Entrega para Funcionário" ||
          form.tipo_movimentacao === "Empréstimo") && (
          <div>
            <Label>Funcionário *</Label>
            <Select
              value={form.funcionario_id}
              onValueChange={(v) => {
                const func = funcionarios.find((f) => f.id === v);
                setForm({
                  ...form,
                  funcionario_id: v,
                  funcionario_nome: func?.nome_completo || "",
                });
                if (metodoEntrega === "funcao") {
                  if (func?.funcao_id) handleFuncaoSelect(func.funcao_id);
                  else if (func?.funcao_nome) {
                    const funcaoEncontrada = funcoes.find((f) => f.nome === func.funcao_nome);
                    if (funcaoEncontrada?.id) handleFuncaoSelect(funcaoEncontrada.id);
                    else setFerramentasPorFuncao([]);
                  } else setFerramentasPorFuncao([]);
                }
              }}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {funcionarios.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome_completo} {f.funcao_nome ? `- ${f.funcao_nome}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {metodoEntrega === "funcao" && form.funcionario_id && ferramentasPorFuncao.length > 0 && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <h4 className="font-semibold text-sm text-blue-900 mb-3">
                Ferramentas da Função — Selecione cada item
              </h4>
              <div className="space-y-3">
                {ferramentasPorFuncao.map((item, itemIdx) => {
                  const slots = Array.from({ length: item.quantidade_necessaria }, (_, slotIdx) => {
                    const globalIdx = `${itemIdx}_${slotIdx}`;
                    const selecionada = selecoesFuncao[globalIdx];
                    const busca = buscaFuncao[globalIdx] || "";
                    const candidatosFiltrados = item.candidatos.filter((f) => {
                      const jaUsada = Object.entries(selecoesFuncao).some(
                        ([k, v]) => k !== globalIdx && v?.id === f.id
                      );
                      if (jaUsada) return false;
                      if (!busca) return true;
                      return (
                        f.descricao?.toLowerCase().includes(busca.toLowerCase()) ||
                        f.codigo?.toLowerCase().includes(busca.toLowerCase())
                      );
                    });
                    return { globalIdx, selecionada, busca, candidatosFiltrados };
                  });
                  return (
                    <div key={itemIdx} className="bg-white rounded-lg p-3 border border-blue-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-slate-800">{item.nome}</p>
                          {item.tipo && (
                            <Badge
                              className={
                                item.tipo === "EPI"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-slate-100 text-slate-600"
                              }
                            >
                              {item.tipo}
                            </Badge>
                          )}
                        </div>
                        <Badge
                          className={
                            item.candidatos.length === 0
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                          }
                        >
                          {item.candidatos.length} disponível(is)
                        </Badge>
                      </div>
                      {item.candidatos.length === 0 ? (
                        <p className="text-xs text-red-600">
                          ⚠️ Nenhuma ferramenta disponível no estoque para este item
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {slots.map(({ globalIdx, selecionada, busca, candidatosFiltrados }) => (
                            <div key={globalIdx} className="relative">
                              {selecionada ? (
                                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                  <div className="flex-1">
                                    <span className="text-xs font-medium text-green-800">
                                      {selecionada.descricao}
                                    </span>
                                    <span className="text-xs text-slate-500 ml-2 font-mono">
                                      {selecionada.codigo}
                                    </span>
                                    {selecionada.numero_serie && (
                                      <span className="text-xs text-blue-600 ml-2">
                                        SN: {selecionada.numero_serie}
                                      </span>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                                    onClick={() => {
                                      const novas = { ...selecoesFuncao };
                                      delete novas[globalIdx];
                                      setSelecoesFuncao(novas);
                                    }}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <Input
                                    placeholder={`Buscar ferramenta para ${item.nome}...`}
                                    value={busca}
                                    onChange={(e) =>
                                      setBuscaFuncao((prev) => ({
                                        ...prev,
                                        [globalIdx]: e.target.value,
                                      }))
                                    }
                                    className="h-8 text-xs"
                                  />
                                  {busca && candidatosFiltrados.length > 0 && (
                                    <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                      {candidatosFiltrados.map((f) => (
                                        <div
                                          key={f.id}
                                          onClick={() => {
                                            setSelecoesFuncao((prev) => ({
                                              ...prev,
                                              [globalIdx]: f,
                                            }));
                                            setBuscaFuncao((prev) => ({
                                              ...prev,
                                              [globalIdx]: "",
                                            }));
                                          }}
                                          className="px-3 py-2 hover:bg-slate-100 cursor-pointer border-b last:border-b-0"
                                        >
                                          <div className="font-medium text-sm">{f.descricao}</div>
                                          <div className="flex gap-3 mt-0.5">
                                            <span className="text-xs text-slate-500 font-mono">
                                              {f.codigo}
                                            </span>
                                            {f.numero_serie && (
                                              <span className="text-xs text-blue-600">
                                                SN: {f.numero_serie}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {busca && candidatosFiltrados.length === 0 && (
                                    <p className="text-xs text-slate-400 mt-1">
                                      Nenhuma ferramenta encontrada
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {metodoEntrega === "funcao" && form.funcionario_id && ferramentasPorFuncao.length === 0 && (
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-4">
              <p className="text-sm text-amber-800">
                ⚠️ Esta função não tem ferramentas padronizadas configuradas.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Data da Movimentação *</Label>
            <Input
              type="date"
              value={form.data_movimentacao}
              onChange={(e) => setForm({ ...form, data_movimentacao: e.target.value })}
              className="mt-1.5"
            />
          </div>
          {form.tipo_movimentacao === "Empréstimo" && (
            <div>
              <Label>Data Prevista de Devolução</Label>
              <Input
                type="date"
                value={form.data_prevista_devolucao}
                onChange={(e) => setForm({ ...form, data_prevista_devolucao: e.target.value })}
                className="mt-1.5"
              />
            </div>
          )}
        </div>

        {form.tipo_movimentacao === "Manutenção" && (
          <div>
            <Label>Motivo da Manutenção</Label>
            <Input
              value={form.motivo_manutencao}
              onChange={(e) => setForm({ ...form, motivo_manutencao: e.target.value })}
              placeholder="Ex: Calibração, Reparo, Inspeção"
              className="mt-1.5"
            />
          </div>
        )}

        {form.tipo_movimentacao === "Baixa para Sucata" && (
          <div>
            <Label>Motivo da Baixa</Label>
            <Input
              value={form.motivo_baixa}
              onChange={(e) => setForm({ ...form, motivo_baixa: e.target.value })}
              placeholder="Ex: Danificado, Obsoleto"
              className="mt-1.5"
            />
          </div>
        )}

        {/* Ferramentas - Lista Editável */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label>Ferramentas *</Label>
            <Button variant="outline" size="sm" className="text-xs" onClick={adicionarFerramenta}>
              + Adicionar Ferramenta
            </Button>
          </div>
          <div className="border rounded-lg" style={{ overflow: "visible" }}>
            <table className="w-full text-sm" style={{ overflow: "visible" }}>
              <thead className="bg-slate-100 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Código</th>
                  <th className="px-3 py-2 text-left font-semibold">Descrição</th>
                  <th className="px-3 py-2 text-left font-semibold">N° de Série</th>
                  <th className="px-3 py-2 text-center font-semibold">Qtd.</th>
                  <th className="px-3 py-2 text-right font-semibold">V. Unit.</th>
                  <th className="px-3 py-2 text-center font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody>
                {ferramentasMovimentacao.map((ferr, idx) => {
                  const termo = (buscaFerramentas[idx] || "").toLowerCase();
                  const ferramentasFiltradas = ferramentas.filter((f) => {
                    if (!termo) return false;
                    return (
                      f.descricao?.toLowerCase().includes(termo) ||
                      f.codigo?.toLowerCase().includes(termo) ||
                      f.codigo_secundario?.toLowerCase().includes(termo) ||
                      f.numero_serie?.toLowerCase().includes(termo) ||
                      f.localizacao?.toLowerCase().includes(termo)
                    );
                  });
                  return (
                    <React.Fragment key={idx}>
                      <tr className="border-b hover:bg-slate-50" style={{ overflow: "visible" }}>
                        <td className="px-3 py-2 text-slate-600 font-mono text-xs">
                          {ferr.codigo}
                        </td>
                        <td className="px-3 py-2 relative" style={{ overflow: "visible" }}>
                          <Input
                            ref={(el) => (inputRefs.current[idx] = el)}
                            placeholder="Digite para buscar..."
                            value={
                              ferr.ferramenta_id ? ferr.descricao : buscaFerramentas[idx] || ""
                            }
                            onChange={(e) => {
                              setBuscaFerramentas({ ...buscaFerramentas, [idx]: e.target.value });
                              setDropdownAberto(idx);
                            }}
                            onFocus={(e) => {
                              if (ferr.ferramenta_id) {
                                atualizarFerramenta(idx, "ferramenta_id", "");
                                atualizarFerramenta(idx, "codigo", "");
                                atualizarFerramenta(idx, "descricao", "");
                                setBuscaFerramentas({ ...buscaFerramentas, [idx]: "" });
                              }
                              setDropdownAberto(idx);
                            }}
                            className="h-8 text-xs"
                          />
                          {!ferr.ferramenta_id &&
                            termo &&
                            ferramentasFiltradas.length > 0 &&
                            dropdownAberto === idx && (
                              <div
                                ref={dropdownRef}
                                onMouseDown={(e) => e.stopPropagation()}
                                style={{
                                  position: "absolute",
                                  top: "100%",
                                  left: 0,
                                  minWidth: 700,
                                  zIndex: 9999,
                                  background: "white",
                                  border: "2px solid #cbd5e1",
                                  borderRadius: 8,
                                  boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                                  maxHeight: 320,
                                  overflowY: "auto",
                                }}
                              >
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-100 border-b border-slate-200 sticky top-0">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">
                                        Código
                                      </th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-600">
                                        Descrição
                                      </th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">
                                        Localização
                                      </th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-600">
                                        Status
                                      </th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">
                                        N° Série
                                      </th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">
                                        N° Laudo
                                      </th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">
                                        Venc. Laudo
                                      </th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-600">
                                        CA
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ferramentasFiltradas.slice(0, 15).map((f) => {
                                      const jaNosCaminhoes = ferramentasDoCaminhao.some(
                                        (fc) => fc.id === f.id
                                      );
                                      return (
                                        <tr
                                          key={f.id}
                                          onPointerDown={(e) => {
                                            e.preventDefault();
                                            setFerramentasMovimentacao((prev) =>
                                              prev.map((item, i) =>
                                                i === idx
                                                  ? {
                                                      ...item,
                                                      ferramenta_id: f.id,
                                                      codigo: f.codigo,
                                                      descricao: f.descricao,
                                                      numero_serie: f.numero_serie || "",
                                                      valor_unitario: f.valor_unitario || 0,
                                                    }
                                                  : item
                                              )
                                            );
                                            setBuscaFerramentas((p) => ({ ...p, [idx]: "" }));
                                            setDropdownAberto(null);
                                          }}
                                          className={`border-b border-slate-100 cursor-pointer transition-colors ${jaNosCaminhoes ? "bg-green-50 hover:bg-green-100" : "hover:bg-blue-50"}`}
                                        >
                                          <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                                            {f.codigo || "-"}
                                          </td>
                                          <td className="px-3 py-2 font-medium text-slate-800">
                                            {f.descricao}
                                            {jaNosCaminhoes && (
                                              <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                                ✓ neste caminhão
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                                            {f.localizacao || "-"}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap">
                                            <span
                                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                f.status === "Disponível"
                                                  ? "bg-green-100 text-green-700"
                                                  : f.status === "Em Uso"
                                                    ? "bg-blue-100 text-blue-700"
                                                    : f.status === "Em Manutenção"
                                                      ? "bg-orange-100 text-orange-700"
                                                      : "bg-slate-100 text-slate-600"
                                              }`}
                                            >
                                              {f.status || "-"}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                                            {f.numero_serie || "-"}
                                          </td>
                                          <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                                            {f.numero_laudo || "-"}
                                          </td>
                                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                            {f.data_vencimento_laudo
                                              ? new Date(
                                                  f.data_vencimento_laudo
                                                ).toLocaleDateString("pt-BR")
                                              : "-"}
                                          </td>
                                          <td className="px-3 py-2 text-slate-600">
                                            {f.ca || "-"}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600 font-mono whitespace-nowrap">
                          {ferr.numero_serie || "-"}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="1"
                            value={ferr.quantidade}
                            onChange={(e) => {
                              const novaQtd = parseInt(e.target.value) || 1;
                              atualizarFerramenta(idx, "quantidade", novaQtd);
                              if (
                                novaQtd > 0 &&
                                ferr.ferramenta_id &&
                                idx === ferramentasMovimentacao.length - 1
                              )
                                setTimeout(() => adicionarFerramenta(), 100);
                            }}
                            className="h-8 text-center w-16"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={ferr.valor_unitario}
                            onChange={(e) =>
                              atualizarFerramenta(
                                idx,
                                "valor_unitario",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="h-8 text-right w-24"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removerFerramenta(idx)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="w-4 h-4 text-red-600" />
                          </Button>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
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
    </SheetModalComponent>
  );
}
