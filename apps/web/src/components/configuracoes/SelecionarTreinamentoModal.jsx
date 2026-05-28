import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SelecionarTreinamentoModal({
  open,
  onOpenChange,
  treinamentosDisponiveis,
  treinamentosVinculados,
  funcao,
  empresaAtiva,
  onTreinamentoAdicionado,
}) {
  const [buscaTreinamento, setBuscaTreinamento] = useState("");

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) setBuscaTreinamento("");
      }}
    >
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <SheetHeader className="p-6 border-b">
          <SheetTitle>Selecionar Treinamento</SheetTitle>
          <p className="text-sm text-slate-600">
            Escolha um treinamento existente para adicionar aos modelos
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Campo de Busca */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou código do treinamento..."
                value={buscaTreinamento}
                onChange={(e) => setBuscaTreinamento(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {treinamentosDisponiveis.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <GraduationCap className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p>Nenhum treinamento cadastrado</p>
              <p className="text-xs mt-2">Crie treinamentos na aba Funções</p>
            </div>
          ) : (
            <div className="space-y-2">
              {treinamentosDisponiveis
                .filter((t) => {
                  const busca = buscaTreinamento.toLowerCase().trim();
                  if (!busca) return true;
                  return (
                    t.nome?.toLowerCase().includes(busca) || t.codigo?.toLowerCase().includes(busca)
                  );
                })
                .map((treinamento) => {
                  const jaAdicionado = treinamentosVinculados.some(
                    (t) => t.nome === treinamento.nome && t.codigo === treinamento.codigo
                  );

                  return (
                    <Card
                      key={treinamento.id}
                      className={cn("cursor-pointer transition-all", jaAdicionado && "opacity-50")}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="font-semibold text-sm">{treinamento.nome}</h5>
                              {treinamento.codigo && (
                                <Badge variant="outline" className="text-xs">
                                  {treinamento.codigo}
                                </Badge>
                              )}
                              {jaAdicionado && (
                                <Badge className="bg-green-100 text-green-700 text-xs">
                                  Já adicionado
                                </Badge>
                              )}
                            </div>
                            {treinamento.carga_horaria && (
                              <p className="text-xs text-slate-600">
                                Carga horária: {treinamento.carga_horaria}h
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            disabled={jaAdicionado}
                            onClick={async () => {
                              if (!jaAdicionado && funcao?.id) {
                                try {
                                  // Extrair assinatura_url dos instrutores se estiver em formato JSON array
                                  let instrutorAssinaturaUrl =
                                    treinamento.instrutor_assinatura_url || "";
                                  try {
                                    const instrutoresParsed = safeParseJSON(
                                      treinamento.instrutor_nome,
                                      null
                                    );
                                    if (Array.isArray(instrutoresParsed)) {
                                      // Extrair assinaturas do array de instrutores
                                      const assinaturas = instrutoresParsed
                                        .map((i) => i.assinatura_url)
                                        .filter(Boolean);
                                      if (assinaturas.length > 0) {
                                        instrutorAssinaturaUrl = assinaturas.join("|");
                                      }
                                    }
                                  } catch {}

                                  // Criar um novo treinamento vinculado à função com TODOS os dados
                                  await sigo.entities.Treinamento.create({
                                    empresa_id: empresaAtiva.id,
                                    funcao_id: funcao.id,
                                    nome: treinamento.nome,
                                    codigo: treinamento.codigo,
                                    carga_horaria: treinamento.carga_horaria,
                                    conteudo_programatico: treinamento.conteudo_programatico,
                                    validade_meses: treinamento.validade_meses || 12,
                                    obrigatorio: treinamento.obrigatorio,
                                    // Instrutor
                                    instrutor_nome: treinamento.instrutor_nome,
                                    instrutor_cpf: treinamento.instrutor_cpf,
                                    instrutor_assinatura_url: instrutorAssinaturaUrl,
                                    // Responsável Técnico
                                    responsavel_tecnico_nome: treinamento.responsavel_tecnico_nome,
                                    responsavel_tecnico_criacao:
                                      treinamento.responsavel_tecnico_criacao,
                                    responsavel_tecnico_assinatura_url:
                                      treinamento.responsavel_tecnico_assinatura_url,
                                    // Campos legados (manter por compatibilidade)
                                    engenheiro_responsavel_nome:
                                      treinamento.engenheiro_responsavel_nome,
                                    engenheiro_responsavel_crea:
                                      treinamento.engenheiro_responsavel_crea,
                                    engenheiro_responsavel_assinatura_url:
                                      treinamento.engenheiro_responsavel_assinatura_url,
                                    aluno_nome: "", // Vazio pois será preenchido depois
                                    usar_como_modelo: false,
                                    ativo: true,
                                  });

                                  // Recarregar lista de treinamentos
                                  onTreinamentoAdicionado();
                                  onOpenChange(false);
                                  setBuscaTreinamento("");
                                  toast.success("Treinamento adicionado à função");
                                } catch (error) {
                                  console.error("Erro ao adicionar treinamento:", error);
                                  toast.error("Erro ao adicionar treinamento");
                                }
                              }
                            }}
                          >
                            {jaAdicionado ? "Adicionado" : "Adicionar"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

              {treinamentosDisponiveis.filter((t) => {
                const busca = buscaTreinamento.toLowerCase().trim();
                if (!busca) return true;
                return (
                  t.nome?.toLowerCase().includes(busca) || t.codigo?.toLowerCase().includes(busca)
                );
              }).length === 0 &&
                buscaTreinamento && (
                  <div className="text-center py-8 text-slate-500">
                    <p>Nenhum treinamento encontrado</p>
                    <p className="text-xs mt-1">Tente outro termo de busca</p>
                  </div>
                )}
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-white">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setBuscaTreinamento("");
            }}
            className="w-full"
          >
            Fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
