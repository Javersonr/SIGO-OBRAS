import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Edit,
  Trash2,
  GraduationCap,
  FileText,
  Download,
  Upload,
  Copy,
  Eye,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import FuncaoModal from "./FuncaoModal";
import TreinamentoModal from "./TreinamentoModal";
import VisualizarTreinamentoModal from "./VisualizarTreinamentoModal";
import { toast } from "sonner";

export default function FuncoesTab({ empresaAtiva }) {
  const [funcoes, setFuncoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedFuncao, setSelectedFuncao] = useState(null);
  const [showTreinamentoModal, setShowTreinamentoModal] = useState(false);
  const [selectedTreinamento, setSelectedTreinamento] = useState(null);
  const [treinamentos, setTreinamentos] = useState([]);
  const [showVisualizarTreinamento, setShowVisualizarTreinamento] = useState(false);
  const [treinamentoParaVisualizar, setTreinamentoParaVisualizar] = useState(null);

  const loadFuncoes = React.useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const result = await base44.entities.Funcao.filter({
        empresa_id: empresaAtiva.id,
      });
      // Mostrar todas as funções, independente do status ativo
      setFuncoes(result.sort((a, b) => a.nome.localeCompare(b.nome)));
    } catch (error) {
      console.error("Erro ao carregar funções:", error);
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id]);

  const loadTreinamentos = React.useCallback(async () => {
    if (!empresaAtiva?.id) return;
    try {
      // Buscar todos os treinamentos marcados como modelo
      const result = await base44.entities.Treinamento.filter({
        empresa_id: empresaAtiva.id,
        usar_como_modelo: true,
      });

      // Filtrar apenas ativos (true ou não definido) e remover duplicatas
      const treinamentosAtivos = result.filter((t) => t.ativo !== false);
      const treinamentosUnicos = treinamentosAtivos.reduce((acc, t) => {
        const chave = `${t.nome}_${t.codigo || ""}`;
        if (!acc.has(chave)) {
          acc.set(chave, t);
        }
        return acc;
      }, new Map());

      setTreinamentos(
        Array.from(treinamentosUnicos.values()).sort((a, b) => a.nome.localeCompare(b.nome))
      );
    } catch (error) {
      console.error("Erro ao carregar treinamentos:", error);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    loadFuncoes();
    loadTreinamentos();
  }, [loadFuncoes, loadTreinamentos]);

  const handleSave = async (formData) => {
    try {
      if (selectedFuncao) {
        await base44.entities.Funcao.update(selectedFuncao.id, formData);
      } else {
        await base44.entities.Funcao.create({
          ...formData,
          empresa_id: empresaAtiva.id,
        });
      }
      loadFuncoes();
      setShowModal(false);
      setSelectedFuncao(null);
    } catch (error) {
      console.error("Erro ao salvar função:", error);
      alert("Erro ao salvar função");
    }
  };

  const handleEdit = (funcao) => {
    setSelectedFuncao(funcao);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Deseja excluir esta função?")) return;
    try {
      await base44.entities.Funcao.delete(id);
      loadFuncoes();
    } catch (error) {
      console.error("Erro ao excluir função:", error);
      alert("Erro ao excluir função");
    }
  };

  const handleDuplicate = async (funcao) => {
    try {
      // Criar nova função
      const novaFuncao = {
        empresa_id: empresaAtiva.id,
        nome: `${funcao.nome} (cópia)`,
        descricao: funcao.descricao,
        categoria: funcao.categoria,
        salario: funcao.salario,
        ativo: funcao.ativo,
        modelo_epi: funcao.modelo_epi,
        modelo_ferramentas: funcao.modelo_ferramentas,
        modelo_autorizacao_formal: funcao.modelo_autorizacao_formal,
        modelo_direito_recusa: funcao.modelo_direito_recusa,
        modelo_ordem_servicos: funcao.modelo_ordem_servicos,
      };
      const [funcaoCriada, treinamentos] = await Promise.all([
        base44.entities.Funcao.create(novaFuncao),
        base44.entities.Treinamento.filter({ empresa_id: empresaAtiva.id, funcao_id: funcao.id }),
      ]);

      // Duplicar treinamentos para a nova função
      if (treinamentos.length > 0) {
        const treinamentosDuplicados = treinamentos.map((t) => {
          // Garantir que a assinatura do instrutor seja propagada corretamente
          let instrutorAssinaturaUrl = t.instrutor_assinatura_url || "";
          try {
            const instrutoresParsed = JSON.parse(t.instrutor_nome);
            if (Array.isArray(instrutoresParsed)) {
              const assinaturas = instrutoresParsed.map((i) => i.assinatura_url).filter(Boolean);
              if (assinaturas.length > 0 && !instrutorAssinaturaUrl) {
                instrutorAssinaturaUrl = assinaturas.join("|");
              }
            }
          } catch {}
          return {
            empresa_id: empresaAtiva.id,
            funcao_id: funcaoCriada.id,
            nome: t.nome,
            codigo: t.codigo,
            descricao: t.descricao,
            carga_horaria: t.carga_horaria,
            validade_meses: t.validade_meses,
            data_inicio: t.data_inicio,
            data_fim: t.data_fim,
            obrigatorio: t.obrigatorio,
            // Instrutor
            instrutor_nome: t.instrutor_nome,
            instrutor_cpf: t.instrutor_cpf,
            instrutor_assinatura_url: instrutorAssinaturaUrl,
            // Responsável Técnico
            responsavel_tecnico_nome: t.responsavel_tecnico_nome,
            responsavel_tecnico_criacao: t.responsavel_tecnico_criacao,
            responsavel_tecnico_assinatura_url: t.responsavel_tecnico_assinatura_url,
            // Campos legados
            engenheiro_responsavel_nome: t.engenheiro_responsavel_nome,
            engenheiro_responsavel_crea: t.engenheiro_responsavel_crea,
            engenheiro_responsavel_assinatura_url: t.engenheiro_responsavel_assinatura_url,
            conteudo_programatico: t.conteudo_programatico,
            aproveitamento: t.aproveitamento,
            local: t.local,
            ativo: t.ativo,
          };
        });
        await base44.entities.Treinamento.bulkCreate(treinamentosDuplicados);
      }

      toast.success("Função duplicada com tudo!");
      loadFuncoes();
    } catch (error) {
      console.error("Erro ao duplicar função:", error);
      toast.error("Erro ao duplicar função");
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedFuncao(null);
  };

  const handleExportarFuncoes = () => {
    const dados = funcoes.map((f) => [
      f.nome || "",
      f.descricao || "",
      f.categoria || "",
      f.salario || 0,
      f.ativo ? "Sim" : "Não",
    ]);

    const headers = ["Nome", "Descrição", "Categoria", "Salário", "Ativo"];
    const linhas = [headers, ...dados];
    const csv = linhas
      .map((row) =>
        row
          .map((cell) => {
            const cellStr = String(cell).replace(/"/g, '""');
            return cellStr.includes(";") || cellStr.includes("\n") || cellStr.includes('"')
              ? `"${cellStr}"`
              : cellStr;
          })
          .join(";")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `funcoes_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    toast.success(`✅ ${funcoes.length} funções exportadas`);
  };

  const handleImportarFuncoes = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
    const isCsv = fileName.endsWith(".csv");

    if (!isExcel && !isCsv) {
      toast.error("❌ Formato inválido. Use .xlsx, .xls ou .csv");
      e.target.value = "";
      return;
    }

    if (isExcel) {
      // Importar Excel como CSV (ler como texto)
      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          let text = event.target.result;

          if (text.charCodeAt(0) === 0xfeff) {
            text = text.slice(1);
          }

          const lines = text.split(/\r?\n/).filter((l) => l.trim());

          if (lines.length <= 1) {
            toast.error("❌ Arquivo vazio ou sem dados válidos");
            return;
          }

          const funcoesImportadas = [];

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = [];
            let currentValue = "";
            let insideQuotes = false;

            for (let j = 0; j < line.length; j++) {
              const char = line[j];
              const nextChar = line[j + 1];

              if (char === '"' && nextChar === '"' && insideQuotes) {
                currentValue += '"';
                j++;
              } else if (char === '"') {
                insideQuotes = !insideQuotes;
              } else if (char === "," && !insideQuotes) {
                values.push(currentValue.trim());
                currentValue = "";
              } else {
                currentValue += char;
              }
            }
            values.push(currentValue.trim());

            const nome = values[0]?.trim();
            if (!nome) continue;

            funcoesImportadas.push({
              empresa_id: empresaAtiva.id,
              nome: nome,
              descricao: values[1]?.trim() || "",
              categoria: values[2]?.trim() || "",
              salario: parseFloat(values[3]) || 0,
              ativo: values[4]?.toLowerCase() !== "não",
            });
          }

          if (funcoesImportadas.length === 0) {
            toast.error("❌ Nenhuma função válida encontrada");
            return;
          }

          await base44.entities.Funcao.bulkCreate(funcoesImportadas);
          toast.success(`✅ ${funcoesImportadas.length} funções importadas`);
          loadFuncoes();
        } catch (error) {
          console.error("Erro ao importar Excel:", error);
          toast.error("❌ Erro ao importar: " + error.message);
        }
      };

      reader.readAsText(file, "UTF-8");
    } else {
      // Importar CSV
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          let text = event.target.result;

          if (text.charCodeAt(0) === 0xfeff) {
            text = text.slice(1);
          }

          const lines = text.split(/\r?\n/).filter((l) => l.trim());

          if (lines.length <= 1) {
            toast.error("❌ Arquivo vazio ou sem dados válidos");
            return;
          }

          const funcoesImportadas = [];

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = [];
            let currentValue = "";
            let insideQuotes = false;

            for (let j = 0; j < line.length; j++) {
              const char = line[j];
              const nextChar = line[j + 1];

              if (char === '"' && nextChar === '"' && insideQuotes) {
                currentValue += '"';
                j++;
              } else if (char === '"') {
                insideQuotes = !insideQuotes;
              } else if (char === ";" && !insideQuotes) {
                values.push(currentValue.trim());
                currentValue = "";
              } else {
                currentValue += char;
              }
            }
            values.push(currentValue.trim());

            const nome = values[0]?.trim();
            if (!nome) continue;

            funcoesImportadas.push({
              empresa_id: empresaAtiva.id,
              nome: nome,
              descricao: values[1]?.trim() || "",
              categoria: values[2]?.trim() || "",
              salario: parseFloat(values[3]) || 0,
              ativo: values[4]?.toLowerCase() !== "não",
            });
          }

          if (funcoesImportadas.length === 0) {
            toast.error("❌ Nenhuma função válida encontrada");
            return;
          }

          await base44.entities.Funcao.bulkCreate(funcoesImportadas);
          toast.success(`✅ ${funcoesImportadas.length} funções importadas`);
          loadFuncoes();
        } catch (error) {
          console.error("Erro ao importar CSV:", error);
          toast.error("❌ Erro ao importar: " + error.message);
        }
      };

      reader.readAsText(file, "UTF-8");
    }

    e.target.value = "";
  };

  const filteredFuncoes = funcoes.filter(
    (f) =>
      f.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.descricao && f.descricao.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Barra de ações */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex-1 w-full">
          <Input
            placeholder="Buscar funções..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <FileText className="w-4 h-4" />
                Ações
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleExportarFuncoes}>
                <Download className="w-4 h-4 mr-2" />
                Exportar Funções
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => document.getElementById("importFuncoesInput")?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Importar Funções
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            onClick={() => {
              setSelectedTreinamento(null);
              setShowTreinamentoModal(true);
            }}
            variant="outline"
            className="gap-2 whitespace-nowrap"
          >
            <GraduationCap className="w-4 h-4" />
            Novo Treinamento
          </Button>
          <Button
            onClick={() => setShowModal(true)}
            className="bg-amber-500 hover:bg-amber-600 gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Nova Função
          </Button>
        </div>
      </div>

      <input
        id="importFuncoesInput"
        type="file"
        className="hidden"
        accept=".csv,.xlsx,.xls"
        onChange={handleImportarFuncoes}
      />

      {/* Lista de Treinamentos Cadastrados */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-800">Treinamentos Cadastrados</h3>
              <p className="text-xs text-slate-500">Modelos disponíveis para vincular às funções</p>
            </div>
            <div className="flex gap-2 items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    // Buscar todos os treinamentos vinculados a funções
                    const treinamentosVinculados = await base44.entities.Treinamento.filter({
                      empresa_id: empresaAtiva.id,
                      usar_como_modelo: true,
                    });

                    const treinamentosParaMigrar = treinamentosVinculados.filter(
                      (t) => t.funcao_id
                    );

                    if (treinamentosParaMigrar.length === 0) {
                      toast.error("Nenhum treinamento vinculado a funções encontrado");
                      return;
                    }

                    // Copiar para modelos genéricos
                    const novosModelos = treinamentosParaMigrar.map((t) => ({
                      empresa_id: empresaAtiva.id,
                      funcao_id: null,
                      nome: t.nome,
                      codigo: t.codigo,
                      carga_horaria: t.carga_horaria,
                      conteudo_programatico: t.conteudo_programatico,
                      validade_meses: t.validade_meses || 12,
                      obrigatorio: t.obrigatorio !== false,
                      usar_como_modelo: true,
                      ativo: true,
                    }));

                    await base44.entities.Treinamento.bulkCreate(novosModelos);
                    loadTreinamentos();
                    toast.success(`✅ ${novosModelos.length} treinamentos migrados para modelos`);
                  } catch (error) {
                    console.error("Erro ao migrar:", error);
                    toast.error("Erro ao migrar treinamentos");
                  }
                }}
                className="gap-2 text-xs"
              >
                <Download className="w-3 h-3" />
                Importar das Funções
              </Button>
              <Badge variant="outline">
                {treinamentos.length} treinamento{treinamentos.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </div>

          {treinamentos.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">
              Nenhum treinamento cadastrado ainda
            </div>
          ) : (
            <div className="grid gap-2">
              {treinamentos.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h5 className="font-medium text-sm">{t.nome}</h5>
                      {t.codigo && (
                        <Badge variant="outline" className="text-xs">
                          {t.codigo}
                        </Badge>
                      )}
                      {t.obrigatorio && (
                        <Badge className="bg-red-100 text-red-700 text-xs">Obrigatório</Badge>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-slate-600">
                      {t.carga_horaria && <span>Carga: {t.carga_horaria}h</span>}
                      {t.validade_meses && <span>Validade: {t.validade_meses} meses</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setTreinamentoParaVisualizar(t);
                        setShowVisualizarTreinamento(true);
                      }}
                      title="Visualizar"
                    >
                      <Eye className="w-3 h-3 text-slate-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setSelectedTreinamento(t);
                        setShowTreinamentoModal(true);
                      }}
                      title="Editar"
                    >
                      <Edit className="w-3 h-3 text-blue-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={async () => {
                        if (!confirm("Excluir este treinamento?")) return;
                        try {
                          await base44.entities.Treinamento.delete(t.id);
                          loadTreinamentos();
                          toast.success("Treinamento excluído");
                        } catch (error) {
                          toast.error("Erro ao excluir treinamento");
                        }
                      }}
                      title="Excluir"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de funções */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Carregando funções...</div>
      ) : filteredFuncoes.length === 0 ? (
        <div className="text-center py-12">
          <GraduationCap className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">
            {searchTerm ? "Nenhuma função encontrada" : "Nenhuma função cadastrada"}
          </p>
          {!searchTerm && (
            <Button onClick={() => setShowModal(true)} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Cadastrar Primeira Função
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredFuncoes.map((funcao) => (
            <Card key={funcao.id} className="hover:shadow-md transition-all">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-slate-800">{funcao.nome}</h4>
                      {funcao.ativo ? (
                        <Badge
                          variant="outline"
                          className="bg-green-50 text-green-700 border-green-200"
                        >
                          Ativa
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-100 text-slate-600">
                          Inativa
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1">
                      {funcao.categoria && (
                        <p className="text-xs text-slate-500">
                          <span className="font-medium">Categoria:</span> {funcao.categoria}
                        </p>
                      )}
                      {funcao.salario && (
                        <p className="text-xs text-slate-500">
                          <span className="font-medium">Salário:</span> R${" "}
                          {funcao.salario.toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      )}
                      {funcao.descricao && (
                        <p className="text-sm text-slate-600 mt-1">{funcao.descricao}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(funcao)}
                      title="Editar"
                    >
                      <Edit className="w-4 h-4 text-blue-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDuplicate(funcao)}
                      title="Duplicar"
                    >
                      <Copy className="w-4 h-4 text-slate-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDelete(funcao.id)}
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Função */}
      <FuncaoModal
        open={showModal}
        onClose={handleCloseModal}
        funcao={selectedFuncao}
        empresaAtiva={empresaAtiva}
        onSave={handleSave}
        treinamentosDisponiveis={treinamentos}
      />

      {/* Modal de Treinamento */}
      <TreinamentoModal
        open={showTreinamentoModal}
        onClose={() => {
          setShowTreinamentoModal(false);
          setSelectedTreinamento(null);
        }}
        treinamento={selectedTreinamento}
        empresaAtiva={empresaAtiva}
        onSave={() => {
          loadTreinamentos();
          loadFuncoes();
          setShowTreinamentoModal(false);
          setSelectedTreinamento(null);
        }}
      />

      {/* Modal Visualizar Treinamento */}
      <VisualizarTreinamentoModal
        open={showVisualizarTreinamento}
        onClose={() => {
          setShowVisualizarTreinamento(false);
          setTreinamentoParaVisualizar(null);
        }}
        treinamento={treinamentoParaVisualizar}
      />
    </div>
  );
}
