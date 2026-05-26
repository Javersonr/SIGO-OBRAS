import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import SheetModalComponent from "@/components/ui/sheet-modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Camera,
  History,
  AlertCircle,
  CheckCircle2,
  Package,
  ChevronRight,
  ArrowLeft,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

export default function InspecaoCaminhaoCampoModal({
  open,
  onOpenChange,
  caminhao,
  user,
  empresaAtiva,
}) {
  const [campos, setCampos] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);
  const [inspecoes, setInspecoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [emInspecao, setEmInspecao] = useState(false);
  const [campoAtual, setCampoAtual] = useState(null);
  const [fotoReferencia, setFotoReferencia] = useState(null);
  const [inspecaoAtiva, setInspecaoAtiva] = useState(null);

  useEffect(() => {
    if (open && caminhao && empresaAtiva) {
      loadData();
    }
  }, [open, caminhao?.id, empresaAtiva?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [camposDb, ferramentasDb, inspecoesDb] = await Promise.all([
        sigo.entities.CaminhaoCampoObrigatorio.filter({
          empresa_id: empresaAtiva.id,
          caminhao_id: caminhao.id,
          ativo: true,
        }),
        sigo.entities.Ferramenta.filter(
          {
            empresa_id: empresaAtiva.id,
            ativo: true,
          },
          "-descricao",
          1000
        ),
        sigo.entities.InspecaoCaminhao.filter(
          {
            empresa_id: empresaAtiva.id,
            caminhao_id: caminhao.id,
          },
          "-data_inspecao",
          50
        ),
      ]);

      // Coletar todos os IDs de ferramentas configuradas como obrigatórias nos campos
      const idsObrigatorios = new Set();
      camposDb.forEach((campo) => {
        try {
          const ids = JSON.parse(campo.ferramenta_ids || "[]");
          ids.forEach((id) => idsObrigatorios.add(id));
        } catch {}
      });

      // Filtrar apenas as ferramentas que estão marcadas como obrigatórias nos campos
      const ferramentasFiltradas = ferramentasDb.filter((f) => idsObrigatorios.has(f.id));

      setCampos(camposDb.sort((a, b) => a.nome_campo.localeCompare(b.nome_campo)));
      setFerramentas(ferramentasFiltradas);
      setInspecoes(inspecoesDb);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados do caminhão");
    } finally {
      setLoading(false);
    }
  };

  const handleNovaInspecao = async () => {
    if (campos.length === 0) {
      toast.error("Nenhum campo obrigatório encontrado neste caminhão");
      return;
    }

    try {
      const novaInspecao = await sigo.entities.InspecaoCaminhao.create({
        empresa_id: empresaAtiva.id,
        caminhao_id: caminhao.id,
        caminhao_placa: caminhao.placa,
        caminhao_modelo: caminhao.modelo,
        data_inspecao: new Date().toISOString().split("T")[0],
        usuario_nome: user.full_name,
        usuario_email: user.email,
        total_campos: campos.length,
        campos_inspecionados: 0,
        observacoes: "",
        status: "em_andamento",
      });

      setInspecaoAtiva(novaInspecao);
      setEmInspecao(true);
      setCampoAtual(campos[0]);
      toast.success("Inspeção iniciada!");
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao iniciar inspeção");
    }
  };

  const getFerramentasDoaCampo = (campo) => {
    try {
      const ids = JSON.parse(campo.ferramenta_ids || "[]");
      return ferramentas.filter((f) => ids.includes(f.id));
    } catch {
      return [];
    }
  };

  const handleConfirmarCampo = async () => {
    if (!campoAtual || !inspecaoAtiva) return;

    try {
      const indexAtual = campos.findIndex((c) => c.id === campoAtual.id);
      const proximoIndex = indexAtual + 1;

      // Atualizar contagem de campos inspecionados
      await sigo.entities.InspecaoCaminhao.update(inspecaoAtiva.id, {
        campos_inspecionados: proximoIndex,
      });

      if (proximoIndex < campos.length) {
        setCampoAtual(campos[proximoIndex]);
        setFotoReferencia(null);
      } else {
        // Inspeção concluída
        await sigo.entities.InspecaoCaminhao.update(inspecaoAtiva.id, {
          status: "concluida",
        });
        toast.success("Inspeção concluída com sucesso!");
        setEmInspecao(false);
        setCampoAtual(null);
        setInspecaoAtiva(null);
        loadData();
      }
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao atualizar inspeção");
    }
  };

  const statusColors = {
    Disponível: "bg-green-100 text-green-700",
    "Em Uso": "bg-blue-100 text-blue-700",
    "Em Manutenção": "bg-orange-100 text-orange-700",
    Danificado: "bg-red-100 text-red-700",
    Inativo: "bg-slate-100 text-slate-700",
    Sucata: "bg-red-100 text-red-700",
  };

  // Tela de inspeção em andamento
  if (emInspecao && campoAtual) {
    const ferramentasDoCampo = getFerramentasDoaCampo(campoAtual);
    const indexAtual = campos.findIndex((c) => c.id === campoAtual.id);
    const progresso = Math.round((indexAtual / campos.length) * 100);

    return (
      <SheetModalComponent
        open={open}
        onOpenChange={() => {
          if (confirm("Cancelar inspeção em andamento?")) {
            setEmInspecao(false);
            setCampoAtual(null);
            setInspecaoAtiva(null);
            setFotoReferencia(null);
            onOpenChange(false);
          }
        }}
        title={`Inspeção: ${caminhao?.placa || ""}`}
        footer={
          <div className="flex justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setEmInspecao(false);
                setCampoAtual(null);
              }}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
            <Button
              onClick={handleConfirmarCampo}
              disabled={!fotoReferencia}
              className="bg-green-600 hover:bg-green-700 gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {indexAtual === campos.length - 1 ? "Concluir Inspeção" : "Próximo Campo"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-4">
          {/* Progresso */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-600">Progresso</span>
              <span className="text-sm font-bold text-slate-800">
                {indexAtual + 1}/{campos.length}
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{ width: `${progresso}%` }}
              />
            </div>
          </div>

          {/* Campo obrigatório */}
          <Card className="border-amber-200 bg-amber-50 p-4">
            <h3 className="font-bold text-lg text-slate-800">{campoAtual.nome_campo}</h3>
            {campoAtual.descricao && (
              <p className="text-sm text-slate-600 mt-1">{campoAtual.descricao}</p>
            )}
            <p className="text-xs text-slate-500 mt-2">
              Quantidade obrigatória: <strong>{campoAtual.quantidade_obrigatoria}</strong>
            </p>
          </Card>

          {/* Ferramentas vinculadas */}
          {ferramentasDoCampo.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-600 mb-2">
                Ferramentas vinculadas ({ferramentasDoCampo.length}):
              </p>
              <div className="space-y-2">
                {ferramentasDoCampo.map((f) => (
                  <Card key={f.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm font-semibold text-blue-600">{f.codigo}</p>
                        <p className="text-sm text-slate-700">{f.descricao}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {f.numero_serie && (
                            <span className="text-xs text-slate-500">Série: {f.numero_serie}</span>
                          )}
                          <Badge
                            className={statusColors[f.status] || "bg-slate-100 text-slate-700"}
                          >
                            {f.status}
                          </Badge>
                        </div>
                      </div>
                      {f.foto_url && (
                        <img
                          src={f.foto_url}
                          alt={f.descricao}
                          className="w-16 h-16 rounded object-cover cursor-pointer hover:opacity-80"
                          onClick={() => setFotoReferencia(f.foto_url)}
                          title="Clique para usar como referência"
                        />
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Foto de referência */}
          <div>
            <p className="text-sm font-semibold text-slate-600 mb-2">Foto de Referência</p>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
              {fotoReferencia ? (
                <div className="relative">
                  <img
                    src={fotoReferencia}
                    alt="Referência"
                    className="max-w-full h-auto rounded mx-auto"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFotoReferencia(null)}
                    className="absolute top-2 right-2"
                  >
                    ✕
                  </Button>
                </div>
              ) : ferramentasDoCampo.some((f) => f.foto_url) ? (
                <div className="text-slate-500">
                  <ImageIcon className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">
                    Clique em uma ferramenta acima para usar como referência
                  </p>
                </div>
              ) : (
                <div className="text-slate-400">
                  <ImageIcon className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">Nenhuma foto disponível</p>
                </div>
              )}
            </div>
          </div>

          {/* Confirmação */}
          <Card className="border-blue-200 bg-blue-50 p-3">
            <p className="text-sm text-blue-900">
              ✓ Confirme que o campo obrigatório <strong>{campoAtual.nome_campo}</strong> está
              presente no caminhão e clique em "Próximo Campo"
            </p>
          </Card>
        </div>
      </SheetModalComponent>
    );
  }

  return (
    <SheetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      title={`Inspeção: ${caminhao?.placa || ""}`}
      subtitle={caminhao?.modelo || ""}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            onClick={handleNovaInspecao}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
            disabled={campos.length === 0}
          >
            <Camera className="w-4 h-4" />
            Iniciar Inspeção
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : (
        <Tabs defaultValue="campos" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="campos" className="gap-2">
              <Package className="w-4 h-4" />
              Campos Obrigatórios ({campos.length})
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-2">
              <History className="w-4 h-4" />
              Histórico ({inspecoes.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campos" className="space-y-4">
            {campos.length === 0 ? (
              <Card className="p-8">
                <div className="text-center text-slate-500">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>Nenhum campo obrigatório configurado para este caminhão</p>
                  <p className="text-sm mt-2">
                    Configure os campos em <strong>Configurações → Caminhões</strong>
                  </p>
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {campos.map((campo, idx) => {
                  const ferramentasDoCampo = getFerramentasDoaCampo(campo);
                  return (
                    <Card
                      key={campo.id}
                      className="p-4 hover:border-amber-300 transition-colors cursor-pointer"
                      onClick={() => {
                        setCampoAtual(campo);
                        setFotoReferencia(null);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">
                              {idx + 1}. {campo.nome_campo}
                            </span>
                            <Badge className="bg-blue-100 text-blue-700 text-xs">
                              {ferramentasDoCampo.length}/{campo.quantidade_obrigatoria}
                            </Badge>
                          </div>
                          {campo.descricao && (
                            <p className="text-sm text-slate-500 mt-1">{campo.descricao}</p>
                          )}
                          {ferramentasDoCampo.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {ferramentasDoCampo.map((f) => (
                                <Badge key={f.id} variant="outline" className="text-xs">
                                  {f.codigo}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" />
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="historico" className="space-y-4">
            {inspecoes.length === 0 ? (
              <Card className="p-8">
                <div className="text-center text-slate-500">
                  <History className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>Nenhuma inspeção realizada ainda</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-3">
                {inspecoes.map((insp) => (
                  <Card key={insp.id} className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-800">
                            {new Date(insp.data_inspecao).toLocaleDateString("pt-BR")}
                          </p>
                          <p className="text-sm text-slate-500">Por: {insp.usuario_nome}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {insp.status === "em_andamento" ? (
                            <Badge className="bg-blue-100 text-blue-700">Em andamento</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Concluída
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full transition-all"
                          style={{
                            width:
                              insp.total_campos > 0
                                ? `${(insp.campos_inspecionados / insp.total_campos) * 100}%`
                                : "0%",
                          }}
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        {insp.campos_inspecionados}/{insp.total_campos} campos inspecionados
                      </p>
                      {insp.observacoes && (
                        <p className="text-sm text-slate-600 mt-2">{insp.observacoes}</p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </SheetModalComponent>
  );
}
