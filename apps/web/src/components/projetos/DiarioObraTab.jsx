import React, { useState } from "react";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Plus,
  Camera,
  Users,
  Cloud,
  Sun,
  CloudRain,
  Wind,
  Trash2,
  LayoutGrid,
  CalendarDays,
  GanttChartSquare,
  Settings,
  FileText,
  Eye,
  Edit,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import DiarioSincOffline from "./DiarioSincOffline";
import DiarioOfflineBanner from "../offline/DiarioOfflineBanner";
import { useDiarioOffline } from "../offline/useDiarioOffline";
import { sigo } from "@/api/sigoClient";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import TarefasKanban from "./TarefasKanban";
import TarefasCalendario from "./TarefasCalendario";
import TarefasTimeline from "./TarefasTimeline";
import VisualizarDiarioModal from "./VisualizarDiarioModal";
import RelatoriosCronograma from "../oportunidades/RelatoriosCronograma";
import AnexoViewer from "@/components/shared/AnexoViewer";
import RelatorioDiarioObra from "./RelatorioDiarioObra";
import { gerarRelatorioDiarioPDF, imprimirDiario } from "./RelatorioPDFDiario";

export default function DiarioObraTab({
  projetoId,
  empresaAtiva,
  usuariosEmpresa,
  showOnlyTasks,
  showOnlyDiary,
  projeto,
}) {
  const { isOnline, salvarOffline } = useDiarioOffline();
  const [diarios, setDiarios] = React.useState([]);
  const [funcoes, setFuncoes] = React.useState([]);
  const [sugestoesAtividades, setSugestoesAtividades] = useState([]);
  const [todosItens, setTodosItens] = useState([]);
  const [itensPlanejamento, setItensPlanejamento] = useState([]);
  const [atividadesSelecionadas, setAtividadesSelecionadas] = useState([]);
  const getHorarioBrasilia = () => {
    return new Date().toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const [showAdd, setShowAdd] = React.useState(false);

  const handleAbrirFormulario = async () => {
    if (!showAdd) {
      setNovoDiario((prev) => ({ ...prev, horario_inicio: getHorarioBrasilia(), horario_fim: "" }));
      // Puxar dados do projeto automaticamente
      if (projeto) {
        let cliente_nome = "";
        let endereco_completo = "";
        let numero_contrato = "";

        if (projeto.cliente_id) {
          try {
            const clientes = await sigo.entities.Cliente.filter({ id: projeto.cliente_id });
            if (clientes.length > 0) {
              const cliente = clientes[0];
              cliente_nome = cliente.nome_razao || cliente.nome_fantasia || "";
              // Montar endereço completo do cliente
              const partes = [];
              if (cliente.endereco) partes.push(cliente.endereco);
              if (cliente.numero) partes.push(cliente.numero);
              if (cliente.complemento_bairro) partes.push(cliente.complemento_bairro);
              if (cliente.cidade) partes.push(cliente.cidade);
              if (cliente.estado) partes.push(cliente.estado);
              endereco_completo = partes.join(", ");
            }
          } catch (e) {
            console.error("Erro ao buscar cliente:", e);
          }
        }

        // Se não tiver endereço do cliente, usa o do projeto
        if (!endereco_completo && projeto.endereco) {
          const partes = [projeto.endereco];
          if (projeto.numero) partes.push(projeto.numero);
          if (projeto.complemento) partes.push(projeto.complemento);
          if (projeto.bairro) partes.push(projeto.bairro);
          if (projeto.cidade) partes.push(projeto.cidade);
          if (projeto.estado) partes.push(projeto.estado);
          endereco_completo = partes.join(", ");
        }

        // Buscar número do contrato do projeto
        if (projeto.numero_contrato) {
          numero_contrato = projeto.numero_contrato;
        }

        setNovoDiario((prev) => ({
          ...prev,
          obra_nome: projeto.nome || "",
          obra_local: endereco_completo,
          contratante_nome: cliente_nome,
          numero_contrato: numero_contrato,
          horario_inicio: getHorarioBrasilia(),
          horario_fim: "",
        }));
      }
    }
    setShowAdd(!showAdd);
  };
  const [uploading, setUploading] = React.useState(false);
  const [filterResponsavel, setFilterResponsavel] = React.useState("all");
  const [showConfigColunas, setShowConfigColunas] = React.useState(false);
  const [diarioVisualizar, setDiarioVisualizar] = React.useState(null);
  const [diarioEditar, setDiarioEditar] = React.useState(null);
  const [editForm, setEditForm] = React.useState(null);
  const [salvandoEdicao, setSalvandoEdicao] = React.useState(false);
  const [showRelatoriosCronograma, setShowRelatoriosCronograma] = React.useState(false);
  const [showRelatorioDiario, setShowRelatorioDiario] = React.useState(false);
  const [etapas, setEtapas] = React.useState([]);
  const [anexoViewer, setAnexoViewer] = React.useState({ open: false, anexo: null });
  const [colunasVisiveis, setColunasVisiveis] = React.useState({
    numeracao: true,
    quantidade: true,
    duracao: true,
    datas: true,
    responsavel: true,
    predecessoras: false,
  });
  const [showCameraModal, setShowCameraModal] = React.useState(false);

  const getDataLocal = () => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  };

  const [novoDiario, setNovoDiario] = React.useState({
    data: getDataLocal(),
    horario_inicio: "",
    horario_fim: "",
    numero_contrato: "",
    prazo_decorrido: "",
    obra_nome: "",
    obra_local: "",
    contratante_nome: "",
    responsavel: "",
    clima: "Sol",
    temperatura: "",
    atividades: "",
    observacoes: "",
    problemas: "",
    mao_de_obra: [],
    fotos: [],
  });

  const [diarioAberto, setDiarioAberto] = React.useState(null); // Diário em edição

  const loadDiarios = React.useCallback(async () => {
    const result = await sigo.entities.DiarioObra.filter({
      empresa_id: empresaAtiva.id,
      projeto_id: projetoId,
    });
    setDiarios(result.sort((a, b) => new Date(b.data) - new Date(a.data)));
  }, [empresaAtiva.id, projetoId]);

  const loadFuncoes = React.useCallback(async () => {
    const result = await sigo.entities.Funcao.filter({
      empresa_id: empresaAtiva.id,
      ativo: true,
    });
    setFuncoes(result);
  }, [empresaAtiva.id]);

  const loadItensConfiguracao = React.useCallback(async () => {
    // Otimizado: Carregar apenas primeiros 100 itens para sugestões
    const [mats, maoObra, ferram] = await Promise.all([
      sigo.entities.Material.filter({ empresa_id: empresaAtiva.id, ativo: true }, "", 100),
      sigo.entities.MaoDeObra.filter({ empresa_id: empresaAtiva.id, ativo: true }, "", 100),
      sigo.entities.Ferramental.filter({ empresa_id: empresaAtiva.id, ativo: true }, "", 100),
    ]);

    setTodosItens([
      ...mats.map((m) => ({ ...m, tipo: "Material", nome_item: m.nome })),
      ...maoObra.map((m) => ({ ...m, tipo: "Mão de Obra", nome_item: m.nome })),
      ...ferram.map((f) => ({ ...f, tipo: "Ferramental", nome_item: f.nome })),
    ]);
  }, [empresaAtiva.id]);

  const loadEtapas = React.useCallback(async () => {
    const result = await sigo.entities.TarefaProjeto.filter({
      empresa_id: empresaAtiva.id,
      projeto_id: projetoId,
    });
    setEtapas(result.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
  }, [empresaAtiva.id, projetoId]);

  const loadItensPlanejamento = React.useCallback(async () => {
    try {
      // Buscar tarefas do planejamento (TarefaProjeto)
      const tarefas = await sigo.entities.TarefaProjeto.filter({
        empresa_id: empresaAtiva.id,
        projeto_id: projetoId,
      });
      const todos = tarefas
        .map((t) => ({
          id: t.id,
          nome: t.titulo,
          tipo: t.status || "Tarefa",
          percentual: t.progresso || 0,
        }))
        .filter((i) => i.nome)
        .sort((a, b) => a.nome.localeCompare(b.nome));
      setItensPlanejamento(todos);
    } catch (error) {
      console.error("Erro ao carregar itens de planejamento:", error);
    }
  }, [empresaAtiva.id, projetoId]);

  React.useEffect(() => {
    if (!projetoId) return;
    if (showOnlyTasks) {
      // No modo Oportunidades (Planejamento), só carrega etapas para o cronograma
      loadEtapas();
      return;
    }
    // Modo diário de obra completo
    loadDiarios();
    loadFuncoes();
    loadItensConfiguracao();
    loadEtapas();
    loadItensPlanejamento();
  }, [
    projetoId,
    showOnlyTasks,
    loadDiarios,
    loadFuncoes,
    loadItensConfiguracao,
    loadEtapas,
    loadItensPlanejamento,
  ]);

  const fotoInputRef = React.useRef(null);

  const abrirGaleria = () => {
    const input = fotoInputRef.current;
    if (!input) return;
    input.removeAttribute("capture");
    input.setAttribute("multiple", "multiple");
    input.value = "";
    input.click();
  };

  const abrirCamera = () => {
    const input = fotoInputRef.current;
    if (!input) return;
    input.removeAttribute("multiple");
    input.setAttribute("capture", "environment");
    input.value = "";
    input.click();
  };

  const handleUploadFoto = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await sigo.integrations.Core.UploadFile({ file });
        const fileUrl = result.file_url || result.url || result;
        setNovoDiario((prev) => ({
          ...prev,
          fotos: [...prev.fotos, fileUrl],
        }));
      }
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      alert("Erro ao fazer upload da foto");
    } finally {
      setUploading(false);
    }
    e.target.value = "";
  };

  const handleToggleAtividade = (item) => {
    setAtividadesSelecionadas((prev) => {
      const exists = prev.find((a) => a.id === item.id);
      if (exists) return prev.filter((a) => a.id !== item.id);
      return [...prev, { ...item, percentual_dia: 0 }];
    });
  };

  const handlePercentualAtividade = (id, valor) => {
    setAtividadesSelecionadas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, percentual_dia: parseFloat(valor) || 0 } : a))
    );
  };

  const buildAtividadesTexto = () => {
    return atividadesSelecionadas
      .map((a) => `${a.nome} - ${a.percentual_dia}% concluído no dia`)
      .join("\n");
  };

  const handleRemoverFoto = (index) => {
    setNovoDiario((prev) => ({
      ...prev,
      fotos: prev.fotos.filter((_, i) => i !== index),
    }));
  };

  const handleAddMaoDeObra = (maoObraId) => {
    const mao = funcoes.find((f) => f.id === maoObraId);
    if (!mao) return;

    const exists = novoDiario.mao_de_obra.find((m) => m.id === maoObraId);
    if (exists) return;

    setNovoDiario((prev) => ({
      ...prev,
      mao_de_obra: [...prev.mao_de_obra, { id: mao.id, nome: mao.nome, quantidade: 1 }],
    }));
  };

  const handleUpdateQuantidade = (index, quantidade) => {
    const newMaoObra = [...novoDiario.mao_de_obra];
    newMaoObra[index].quantidade = parseInt(quantidade) || 0;
    setNovoDiario((prev) => ({ ...prev, mao_de_obra: newMaoObra }));
  };

  const handleRemoverMaoObra = (index) => {
    setNovoDiario((prev) => ({
      ...prev,
      mao_de_obra: prev.mao_de_obra.filter((_, i) => i !== index),
    }));
  };

  const handleSalvar = async () => {
    const atividadesTexto =
      atividadesSelecionadas.length > 0 ? buildAtividadesTexto() : novoDiario.atividades;
    if (!atividadesTexto) return;

    const dadosDiario = {
      empresa_id: empresaAtiva.id,
      projeto_id: projetoId,
      data: novoDiario.data,
      horario_inicio: novoDiario.horario_inicio,
      horario_fim: novoDiario.horario_fim,
      numero_contrato: novoDiario.numero_contrato,
      prazo_decorrido: novoDiario.prazo_decorrido,
      obra_nome: novoDiario.obra_nome,
      obra_local: novoDiario.obra_local,
      contratante_nome: novoDiario.contratante_nome,
      responsavel: novoDiario.responsavel,
      clima: novoDiario.clima,
      temperatura: novoDiario.temperatura,
      atividades: atividadesTexto,
      observacoes: novoDiario.observacoes,
      problemas: novoDiario.problemas,
      mao_de_obra: JSON.stringify(novoDiario.mao_de_obra),
      fotos: JSON.stringify(novoDiario.fotos),
    };

    if (!isOnline) {
      // Salvar offline no IndexedDB (fotos já são URLs ou base64)
      await salvarOffline({ ...dadosDiario, fotos_offline: [] });
      toast.success("📴 Registro salvo offline — será sincronizado quando conectar");
    } else {
      await sigo.entities.DiarioObra.create(dadosDiario);

      // Atualizar etapas no cronograma com progresso do diário
      if (atividadesSelecionadas.length > 0) {
        try {
          await Promise.all(
            atividadesSelecionadas.map((atividade) =>
              sigo.entities.TarefaProjeto.update(atividade.id, {
                progresso: atividade.percentual_dia || 0,
              })
            )
          );
        } catch (error) {
          console.error("Erro ao atualizar etapas no cronograma:", error);
        }
      }

      loadDiarios();
      loadEtapas();
    }

    setNovoDiario({
      data: getDataLocal(),
      horario_inicio: "",
      horario_fim: "",
      numero_contrato: "",
      prazo_decorrido: "",
      obra_nome: "",
      obra_local: "",
      contratante_nome: "",
      responsavel: "",
      clima: "Sol",
      temperatura: "",
      atividades: "",
      observacoes: "",
      problemas: "",
      mao_de_obra: [],
      fotos: [],
    });
    setAtividadesSelecionadas([]);
    setShowAdd(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este registro do diário?")) return;
    await sigo.entities.DiarioObra.delete(id);
    loadDiarios();
  };

  const getClimaIcon = (clima) => {
    switch (clima) {
      case "Sol":
        return <Sun className="w-5 h-5 text-yellow-500" />;
      case "Nublado":
        return <Cloud className="w-5 h-5 text-slate-400" />;
      case "Chuva":
        return <CloudRain className="w-5 h-5 text-blue-500" />;
      case "Vento":
        return <Wind className="w-5 h-5 text-cyan-500" />;
      default:
        return <Sun className="w-5 h-5" />;
    }
  };

  const handleVisualizarDiario = (diario) => {
    setDiarioVisualizar(diario);
  };

  const handleEditarDiario = (diario) => {
    // mao_de_obra/fotos são JSONB → vêm como array pelo supabase-js, string em legacy
    const maoObra = safeParseJSON(diario.mao_de_obra, []);
    const fotos = safeParseJSON(diario.fotos, []);
    setEditForm({
      data: diario.data,
      horario_inicio: diario.horario_inicio || "",
      horario_fim: diario.horario_fim || "",
      numero_contrato: diario.numero_contrato || "",
      prazo_decorrido: diario.prazo_decorrido || "",
      obra_nome: diario.obra_nome || "",
      obra_local: diario.obra_local || "",
      contratante_nome: diario.contratante_nome || "",
      responsavel: diario.responsavel || "",
      clima: diario.clima || "Sol",
      temperatura: diario.temperatura || "",
      atividades: diario.atividades || "",
      observacoes: diario.observacoes || "",
      problemas: diario.problemas || "",
      mao_de_obra: maoObra,
      fotos,
    });
    setDiarioEditar(diario);
  };

  const handleSalvarEdicao = async () => {
    setSalvandoEdicao(true);
    try {
      await sigo.entities.DiarioObra.update(diarioEditar.id, {
        data: editForm.data,
        horario_inicio: editForm.horario_inicio,
        horario_fim: editForm.horario_fim,
        numero_contrato: editForm.numero_contrato,
        prazo_decorrido: editForm.prazo_decorrido,
        obra_nome: editForm.obra_nome,
        obra_local: editForm.obra_local,
        contratante_nome: editForm.contratante_nome,
        responsavel: editForm.responsavel,
        clima: editForm.clima,
        temperatura: editForm.temperatura,
        atividades: editForm.atividades,
        observacoes: editForm.observacoes,
        problemas: editForm.problemas,
        mao_de_obra: JSON.stringify(editForm.mao_de_obra),
        fotos: JSON.stringify(editForm.fotos),
      });

      // Atualizar etapas do cronograma baseado nas atividades
      const atividadesNoDiario = editForm.atividades
        ? etapas.filter((e) => editForm.atividades.includes(e.titulo))
        : [];

      if (atividadesNoDiario.length > 0) {
        try {
          await Promise.all(
            atividadesNoDiario.map((atividade) => {
              // Extrair percentual da atividade se estiver no formato "titulo - XX% concluído"
              const match = editForm.atividades.match(new RegExp(`${atividade.titulo}.*?(\\d+)%`));
              const percentual = match ? parseInt(match[1]) : atividade.progresso || 0;
              return sigo.entities.TarefaProjeto.update(atividade.id, {
                progresso: percentual,
              });
            })
          );
        } catch (error) {
          console.error("Erro ao atualizar etapas no cronograma:", error);
        }
      }

      toast.success("Diário atualizado com sucesso!");
      setDiarioEditar(null);
      setEditForm(null);
      loadDiarios();
      loadEtapas();
      loadItensPlanejamento();
    } catch (e) {
      toast.error("Erro ao salvar edição");
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const handleExportarPDFDiario = (diario) => {
    gerarRelatorioDiarioPDF(diario, empresaAtiva);
  };

  const handleImprimirDiario = (diario) => {
    imprimirDiario(diario, empresaAtiva);
  };

  // Se for apenas tarefas, mostrar as 3 abas de gestão
  if (showOnlyTasks) {
    return (
      <div className="space-y-4">
        <Tabs defaultValue="kanban" className="space-y-4">
          <div className="flex items-center justify-between border-b pb-4">
            <TabsList className="bg-slate-100">
              <TabsTrigger value="kanban" className="gap-2">
                <LayoutGrid className="w-4 h-4" />
                Kanban
              </TabsTrigger>
              <TabsTrigger value="calendario" className="gap-2">
                <CalendarDays className="w-4 h-4" />
                Calendário
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-2">
                <GanttChartSquare className="w-4 h-4" />
                Timeline/Gantt
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos os responsáveis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os responsáveis</SelectItem>
                  {usuariosEmpresa.map((u) => (
                    <SelectItem key={u.id} value={u.usuario_id || u.id}>
                      {u.usuario_email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="icon" onClick={() => setShowConfigColunas(true)}>
                <Settings className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowRelatoriosCronograma(true)}
              >
                <FileText className="w-4 h-4" />
                Relatórios
              </Button>
            </div>
          </div>

          <TabsContent value="kanban">
            <TarefasKanban
              projetoId={projetoId}
              empresaAtiva={empresaAtiva}
              usuariosEmpresa={usuariosEmpresa}
              filterResponsavel={filterResponsavel}
            />
          </TabsContent>

          <TabsContent value="calendario">
            <TarefasCalendario
              projetoId={projetoId}
              empresaAtiva={empresaAtiva}
              usuariosEmpresa={usuariosEmpresa}
              filterResponsavel={filterResponsavel}
            />
          </TabsContent>

          <TabsContent value="timeline">
            <TarefasTimeline
              projetoId={projetoId}
              empresaAtiva={empresaAtiva}
              usuariosEmpresa={usuariosEmpresa}
              filterResponsavel={filterResponsavel}
            />
          </TabsContent>
        </Tabs>

        <Sheet open={showConfigColunas} onOpenChange={setShowConfigColunas}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Configurar</SheetTitle>
            </SheetHeader>
            <div className="space-y-6 py-6">
              <div className="flex items-center justify-between">
                <Label>Vincular datas dos níveis aos itens</Label>
                <Checkbox defaultChecked />
              </div>

              <div>
                <h4 className="font-medium text-slate-800 mb-4">Visualizações</h4>
                <Tabs defaultValue="lista" className="w-full">
                  <TabsList className="w-full">
                    <TabsTrigger value="lista" className="flex-1">
                      Lista
                    </TabsTrigger>
                    <TabsTrigger value="timeline" className="flex-1">
                      Linha do Tempo
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <Label className="font-medium text-slate-700">Coluna</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Label className="text-sm text-slate-600 text-center">Habilitado</Label>
                    <Label className="text-sm text-slate-600 text-center">Cliente</Label>
                  </div>
                </div>

                <div className="space-y-3">
                  {Object.entries({
                    numeracao: "Numeração",
                    quantidade: "Quantidade",
                    duracao: "Duração",
                    datas: "Datas",
                    responsavel: "Responsável",
                    predecessoras: "Predecessoras",
                  }).map(([key, label]) => (
                    <div key={key} className="grid grid-cols-2 gap-4 items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                        <span className="text-sm text-slate-700">{label}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex justify-center">
                          <Checkbox
                            checked={colunasVisiveis[key]}
                            onCheckedChange={(checked) =>
                              setColunasVisiveis((prev) => ({ ...prev, [key]: checked }))
                            }
                          />
                        </div>
                        <div className="flex justify-center">
                          <Checkbox defaultChecked />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowConfigColunas(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => setShowConfigColunas(false)}>Confirmar</Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={showRelatoriosCronograma} onOpenChange={setShowRelatoriosCronograma}>
          <SheetContent
            side="right"
            className="h-full overflow-y-auto p-0 flex flex-col"
            style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
          >
            <div className="sticky top-0 bg-white border-b p-6 z-10">
              <SheetHeader>
                <SheetTitle>Relatórios do Cronograma</SheetTitle>
              </SheetHeader>
            </div>
            <div className="p-6">
              <RelatoriosCronograma
                etapas={etapas}
                nomeObra={projeto?.nome || "Obra"}
                clienteNome={projeto?.cliente_nome || "Cliente"}
                empresaAtiva={empresaAtiva}
                onExportKanban={(tipo) => {
                  const kanbanRef = document.querySelector("[data-kanban-export]");
                  if (kanbanRef) {
                    if (tipo === "pdf") kanbanRef.click();
                    else kanbanRef.nextSibling?.click();
                  }
                }}
                onExportCalendar={(tipo) => {
                  const calendarRef = document.querySelector("[data-calendar-export]");
                  if (calendarRef) {
                    if (tipo === "pdf") calendarRef.click();
                    else calendarRef.nextSibling?.click();
                  }
                }}
                onExportTimeline={(tipo) => {
                  const timelineRef = document.querySelector("[data-timeline-export]");
                  if (timelineRef) {
                    if (tipo === "pdf") timelineRef.click();
                    else timelineRef.nextSibling?.click();
                  }
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // Se for apenas diário, mostrar só o conteúdo do diário
  if (showOnlyDiary) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-slate-800">Diário de Obra</h3>
          <div className="flex items-center gap-2">
            <DiarioOfflineBanner empresaAtiva={empresaAtiva} onSincronizado={loadDiarios} />
            <Button
              variant="outline"
              onClick={() => setShowRelatorioDiario(true)}
              className="gap-2"
            >
              <FileText className="w-4 h-4" />
              Relatórios
            </Button>
            <Button onClick={handleAbrirFormulario} className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Registro
            </Button>
          </div>
        </div>

        <VisualizarDiarioModal
          diario={diarioVisualizar}
          open={!!diarioVisualizar}
          onOpenChange={(open) => !open && setDiarioVisualizar(null)}
          empresaAtiva={empresaAtiva}
        />

        {/* Modal de Edição */}
        <Sheet
          open={!!diarioEditar}
          onOpenChange={(open) => {
            if (!open) {
              setDiarioEditar(null);
              setEditForm(null);
            }
          }}
        >
          <SheetContent side="right" className="w-full h-full overflow-y-auto">
            <SheetHeader className="mb-4">
              <SheetTitle>Editar Registro do Diário</SheetTitle>
            </SheetHeader>
            {editForm && (
              <div className="space-y-4 pb-8">
                {/* Dados da Obra */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <h4 className="font-semibold text-slate-800 text-sm">Dados da Obra</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm">Obra / Projeto</Label>
                      <Input
                        type="text"
                        value={editForm.obra_nome}
                        onChange={(e) => setEditForm((f) => ({ ...f, obra_nome: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">Contratante</Label>
                      <Input
                        type="text"
                        value={editForm.contratante_nome}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, contratante_nome: e.target.value }))
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm">Local da Obra</Label>
                      <Input
                        type="text"
                        value={editForm.obra_local}
                        onChange={(e) => setEditForm((f) => ({ ...f, obra_local: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">Responsável</Label>
                      <Input
                        type="text"
                        value={editForm.responsavel}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, responsavel: e.target.value }))
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm">Nº do Contrato</Label>
                      <Input
                        type="text"
                        value={editForm.numero_contrato}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, numero_contrato: e.target.value }))
                        }
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">Prazo Decorrido</Label>
                      <Input
                        type="text"
                        value={editForm.prazo_decorrido}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, prazo_decorrido: e.target.value }))
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Campos do formulário */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={editForm.data}
                      onChange={(e) => setEditForm((f) => ({ ...f, data: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Início</Label>
                      <Input
                        type="time"
                        value={editForm.horario_inicio}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, horario_inicio: e.target.value }))
                        }
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Término</Label>
                      <Input
                        type="time"
                        value={editForm.horario_fim}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, horario_fim: e.target.value }))
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Clima</Label>
                    <Select
                      value={editForm.clima}
                      onValueChange={(v) => setEditForm((f) => ({ ...f, clima: v }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Sol">☀️ Sol</SelectItem>
                        <SelectItem value="Nublado">☁️ Nublado</SelectItem>
                        <SelectItem value="Chuva">🌧️ Chuva</SelectItem>
                        <SelectItem value="Vento">💨 Vento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Temperatura (°C)</Label>
                    <Input
                      type="number"
                      value={editForm.temperatura}
                      onChange={(e) => setEditForm((f) => ({ ...f, temperatura: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>Atividades Realizadas *</Label>
                  <Textarea
                    value={editForm.atividades}
                    onChange={(e) => setEditForm((f) => ({ ...f, atividades: e.target.value }))}
                    rows={4}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea
                    value={editForm.observacoes}
                    onChange={(e) => setEditForm((f) => ({ ...f, observacoes: e.target.value }))}
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Problemas / Ocorrências</Label>
                  <Textarea
                    value={editForm.problemas}
                    onChange={(e) => setEditForm((f) => ({ ...f, problemas: e.target.value }))}
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Mão de Obra</Label>
                  <div className="space-y-2 mt-2">
                    {editForm.mao_de_obra.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-white rounded border">
                        <span className="flex-1 text-sm">{m.nome}</span>
                        <Input
                          type="number"
                          value={m.quantidade}
                          min="1"
                          className="w-20 h-8 text-xs"
                          onChange={(e) => {
                            const updated = [...editForm.mao_de_obra];
                            updated[i].quantidade = parseInt(e.target.value) || 0;
                            setEditForm((f) => ({ ...f, mao_de_obra: updated }));
                          }}
                        />
                        <span className="text-xs text-slate-500">pessoas</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            setEditForm((f) => ({
                              ...f,
                              mao_de_obra: f.mao_de_obra.filter((_, idx) => idx !== i),
                            }))
                          }
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                    <Select
                      onValueChange={(id) => {
                        const fn = funcoes.find((f) => f.id === id);
                        if (!fn || editForm.mao_de_obra.find((m) => m.id === id)) return;
                        setEditForm((f) => ({
                          ...f,
                          mao_de_obra: [
                            ...f.mao_de_obra,
                            { id: fn.id, nome: fn.nome, quantidade: 1 },
                          ],
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="+ Adicionar mão de obra" />
                      </SelectTrigger>
                      <SelectContent>
                        {funcoes
                          .filter((f) => !editForm.mao_de_obra.find((m) => m.id === f.id))
                          .map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.nome}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {editForm.fotos.length > 0 && (
                  <div>
                    <Label>Fotos ({editForm.fotos.length})</Label>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {editForm.fotos.map((foto, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={foto}
                            alt={`Foto ${i + 1}`}
                            className="w-full h-24 object-cover rounded"
                          />
                          <button
                            onClick={() =>
                              setEditForm((f) => ({
                                ...f,
                                fotos: f.fotos.filter((_, idx) => idx !== i),
                              }))
                            }
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSalvarEdicao}
                    disabled={salvandoEdicao || !editForm.atividades}
                    className="flex-1"
                  >
                    {salvandoEdicao ? "Salvando..." : "Salvar Alterações"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDiarioEditar(null);
                      setEditForm(null);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {showAdd && (
          <Card
            className="border-blue-200 bg-blue-50"
            style={{
              left: "256px !important",
              right: "0 !important",
              width: "calc(100% - 256px) !important",
              maxWidth: "none !important",
            }}
          >
            <CardContent className="p-6 space-y-4">
              {/* Banner offline + sincronização de fotos */}
              <DiarioSincOffline onFotosSincronizadas={() => {}} />

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 mb-4">
                <h4 className="font-semibold text-slate-800 text-sm">Dados da Obra</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Obra / Projeto</Label>
                    <Input
                      type="text"
                      value={novoDiario.obra_nome}
                      onChange={(e) => setNovoDiario({ ...novoDiario, obra_nome: e.target.value })}
                      disabled
                      className="mt-1 bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Contratante</Label>
                    <Input
                      type="text"
                      value={novoDiario.contratante_nome}
                      onChange={(e) =>
                        setNovoDiario({ ...novoDiario, contratante_nome: e.target.value })
                      }
                      disabled
                      className="mt-1 bg-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Local da Obra</Label>
                    <Input
                      type="text"
                      value={novoDiario.obra_local}
                      onChange={(e) => setNovoDiario({ ...novoDiario, obra_local: e.target.value })}
                      disabled
                      className="mt-1 bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Responsável</Label>
                    <Input
                      type="text"
                      value={novoDiario.responsavel}
                      onChange={(e) =>
                        setNovoDiario({ ...novoDiario, responsavel: e.target.value })
                      }
                      placeholder="Nome do responsável"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Nº do Contrato</Label>
                    <Input
                      type="text"
                      value={novoDiario.numero_contrato}
                      onChange={(e) =>
                        setNovoDiario({ ...novoDiario, numero_contrato: e.target.value })
                      }
                      placeholder="Ex: 001/2024"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Prazo Decorrido</Label>
                    <Input
                      type="text"
                      value={novoDiario.prazo_decorrido}
                      onChange={(e) =>
                        setNovoDiario({ ...novoDiario, prazo_decorrido: e.target.value })
                      }
                      placeholder="Ex: 30 dias"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={novoDiario.data}
                    onChange={(e) => setNovoDiario({ ...novoDiario, data: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Início</Label>
                    <Input
                      type="time"
                      value={novoDiario.horario_inicio}
                      onChange={(e) =>
                        setNovoDiario({ ...novoDiario, horario_inicio: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Término</Label>
                    <Input
                      type="time"
                      value={novoDiario.horario_fim}
                      onChange={(e) =>
                        setNovoDiario({ ...novoDiario, horario_fim: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Clima</Label>
                  <Select
                    value={novoDiario.clima}
                    onValueChange={(v) => setNovoDiario({ ...novoDiario, clima: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sol">☀️ Sol</SelectItem>
                      <SelectItem value="Nublado">☁️ Nublado</SelectItem>
                      <SelectItem value="Chuva">🌧️ Chuva</SelectItem>
                      <SelectItem value="Vento">💨 Vento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Temperatura (°C)</Label>
                  <Input
                    type="number"
                    value={novoDiario.temperatura}
                    onChange={(e) => setNovoDiario({ ...novoDiario, temperatura: e.target.value })}
                    placeholder="Ex: 28"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label>Atividades Realizadas *</Label>
                {itensPlanejamento.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-slate-500 mb-2">
                      Selecione os itens do planejamento e informe o % executado hoje:
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2 bg-white">
                      {itensPlanejamento.map((item) => {
                        const selecionado = atividadesSelecionadas.find((a) => a.id === item.id);
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={!!selecionado}
                              onChange={() => handleToggleAtividade(item)}
                              className="w-4 h-4 accent-amber-500"
                            />
                            <span className="flex-1 text-sm text-slate-700 truncate">
                              {item.nome}
                            </span>
                            <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.tipo}
                            </span>
                            {selecionado && (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={selecionado.percentual_dia}
                                  onChange={(e) =>
                                    handlePercentualAtividade(item.id, e.target.value)
                                  }
                                  className="w-16 h-7 text-xs"
                                  placeholder="%"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <span className="text-xs text-slate-500">%</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {atividadesSelecionadas.length > 0 && (
                      <div className="text-xs text-green-700 font-medium">
                        ✓ {atividadesSelecionadas.length} atividade(s) selecionada(s)
                      </div>
                    )}
                    <p className="text-xs text-slate-400">
                      Ou adicione uma atividade manual abaixo:
                    </p>
                    <Textarea
                      value={novoDiario.atividades}
                      onChange={(e) => setNovoDiario({ ...novoDiario, atividades: e.target.value })}
                      placeholder="Atividade extra não listada no planejamento..."
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                ) : (
                  <Textarea
                    value={novoDiario.atividades}
                    onChange={(e) => setNovoDiario({ ...novoDiario, atividades: e.target.value })}
                    placeholder="Digite as atividades realizadas..."
                    className="mt-1"
                    rows={3}
                  />
                )}
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  value={novoDiario.observacoes}
                  onChange={(e) => setNovoDiario({ ...novoDiario, observacoes: e.target.value })}
                  placeholder="Observações gerais..."
                  className="mt-1"
                  rows={2}
                />
              </div>

              <div>
                <Label>Problemas / Ocorrências</Label>
                <Textarea
                  value={novoDiario.problemas}
                  onChange={(e) => setNovoDiario({ ...novoDiario, problemas: e.target.value })}
                  placeholder="Registre problemas ou ocorrências..."
                  className="mt-1"
                  rows={2}
                />
              </div>

              <div>
                <Label>Mão de Obra Utilizada</Label>
                <div className="mt-2 space-y-2">
                  {novoDiario.mao_de_obra.map((m, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 bg-white rounded border"
                    >
                      <span className="flex-1 text-sm">{m.nome}</span>
                      <Input
                        type="number"
                        value={m.quantidade}
                        onChange={(e) => handleUpdateQuantidade(index, e.target.value)}
                        className="w-20 h-8 text-xs"
                        min="1"
                      />
                      <span className="text-xs text-slate-500">pessoas</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRemoverMaoObra(index)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  <Select onValueChange={handleAddMaoDeObra}>
                    <SelectTrigger>
                      <SelectValue placeholder="+ Adicionar mão de obra" />
                    </SelectTrigger>
                    <SelectContent>
                      {funcoes
                        .filter((f) => !novoDiario.mao_de_obra.find((nm) => nm.id === f.id))
                        .map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.nome}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Fotos do Dia</Label>
                <div className="mt-2">
                  <input
                    ref={fotoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadFoto}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={abrirGaleria}
                      disabled={uploading}
                      className="gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      {uploading ? "Enviando..." : "Galeria"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={abrirCamera}
                      disabled={uploading}
                      className="gap-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                    >
                      <Camera className="w-4 h-4" />
                      Tirar Foto
                    </Button>
                  </div>
                  {novoDiario.fotos.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      {novoDiario.fotos.map((foto, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={foto}
                            alt={`Foto ${index + 1}`}
                            className="w-full h-24 object-cover rounded"
                          />
                          <button
                            onClick={() => handleRemoverFoto(index)}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleSalvar}
                  disabled={atividadesSelecionadas.length === 0 && !novoDiario.atividades}
                  className="flex-1"
                >
                  Salvar Registro
                </Button>
                <Button variant="outline" onClick={() => setShowAdd(false)}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {diarios.map((diario) => {
            const parsedMao = safeParseJSON(diario.mao_de_obra, []);
            const maoDeObraData = Array.isArray(parsedMao) ? parsedMao : [];
            const parsedFotos = safeParseJSON(diario.fotos, []);
            const fotosData = Array.isArray(parsedFotos) ? parsedFotos : [];

            return (
              <Card key={diario.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Calendar className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-800">
                          {new Date(diario.data).toLocaleDateString("pt-BR", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {getClimaIcon(diario.clima)}
                          <span className="text-sm text-slate-600">{diario.clima}</span>
                          {diario.temperatura && (
                            <Badge variant="outline">{diario.temperatura}°C</Badge>
                          )}
                          {(diario.horario_inicio || diario.horario_fim) && (
                            <Badge variant="outline" className="gap-1">
                              🕐 {diario.horario_inicio || "--:--"} →{" "}
                              {diario.horario_fim || "--:--"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleVisualizarDiario(diario)}
                          className="gap-2"
                        >
                          <Eye className="w-4 h-4" />
                          Visualizar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleEditarDiario(diario)}
                          className="gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(diario.id)}
                          className="gap-2 text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                          Deletar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-slate-600 text-sm">Atividades Realizadas</Label>
                      <p className="text-slate-800 mt-1 whitespace-pre-wrap">{diario.atividades}</p>
                    </div>

                    {diario.observacoes && (
                      <div>
                        <Label className="text-slate-600 text-sm">Observações</Label>
                        <p className="text-slate-700 mt-1">{diario.observacoes}</p>
                      </div>
                    )}

                    {diario.problemas && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <Label className="text-red-700 text-sm">Problemas / Ocorrências</Label>
                        <p className="text-red-800 mt-1">{diario.problemas}</p>
                      </div>
                    )}

                    {maoDeObraData.length > 0 && (
                      <div>
                        <Label className="text-slate-600 text-sm flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          Mão de Obra Utilizada
                        </Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {maoDeObraData.map((m, index) => (
                            <Badge key={index} variant="outline" className="bg-teal-50">
                              {m.nome} - {m.quantidade} {m.quantidade > 1 ? "pessoas" : "pessoa"}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {fotosData.length > 0 && (
                      <div>
                        <Label className="text-slate-600 text-sm">Fotos</Label>
                        <div className="grid grid-cols-4 gap-2 mt-2">
                          {fotosData.map((foto, index) => (
                            <img
                              key={index}
                              src={foto}
                              alt={`Foto ${index + 1}`}
                              className="w-full h-32 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() =>
                                setAnexoViewer({
                                  open: true,
                                  anexo: { url: foto, nome: `Foto ${index + 1}`, tipo: "image" },
                                })
                              }
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {diarios.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum registro no diário de obra</p>
            </div>
          )}
        </div>

        <AnexoViewer
          anexo={anexoViewer.anexo}
          open={anexoViewer.open}
          onOpenChange={(open) => setAnexoViewer({ open, anexo: null })}
        />

        <RelatorioDiarioObra
          open={showRelatorioDiario}
          onOpenChange={setShowRelatorioDiario}
          diarios={diarios}
          projeto={projeto}
          empresaAtiva={empresaAtiva}
        />
      </div>
    );
  }

  // Fallback: nunca deve chegar aqui (sempre showOnlyTasks ou showOnlyDiary)
  return null;
}
