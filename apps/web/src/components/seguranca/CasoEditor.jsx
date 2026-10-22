import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LIMITES_CASO, validarCaso } from "@/lib/ead-caso";
import {
  FIM,
  adicionarEtapa,
  adicionarOpcao,
  alterarOpcao,
  alterarPergunta,
  casoParaEditar,
  destinosDoCaso,
  removerEtapa,
  removerOpcao,
  renomearEtapa,
} from "@/lib/ead-caso-edicao";

/**
 * Código da etapa: muda ao sair do campo (ou no Enter), e as opções que levavam a ela vão junto. Recusado
 * (vazio, repetido, com espaço), o campo volta ao código atual e mostra o motivo.
 */
function CodigoDaEtapa({ id, rotulo, desabilitado, onRenomear }) {
  const [rascunho, setRascunho] = useState(id);
  const [erro, setErro] = useState("");
  useEffect(() => {
    setRascunho(id);
    setErro("");
  }, [id]);
  const aplicar = () => {
    if (rascunho === id) return;
    const resultado = onRenomear(rascunho);
    if (resultado.ok) {
      setErro("");
      // espaços das pontas saem do campo mesmo quando o código não muda (ex.: "r1 " continua sendo "r1")
      setRascunho(rascunho.trim());
    } else {
      setErro(resultado.erro);
      setRascunho(id);
    }
  };
  return (
    <div className="flex flex-col">
      <Input
        value={rascunho}
        aria-label={rotulo}
        maxLength={20}
        disabled={desabilitado}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={aplicar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            aplicar();
          }
        }}
        className="h-8 w-24 font-mono text-xs"
      />
      {erro && (
        <span role="alert" className="text-xs text-red-700">
          {erro}
        </span>
      )}
    </div>
  );
}

/**
 * Editor do roteiro do caso com decisões (atividades interativas, spec 2026-10-14 §4.3 e §5.2). Controlado:
 * recebe o roteiro em `valor` e devolve cada mudança em `onChange(roteiroNovo)`. O aluno começa na PRIMEIRA etapa;
 * cada opção tem o texto (o que o aluno lê), o comentário (o que ele vê depois de escolher), se é a escolha segura
 * e para onde leva (outra etapa ou "Fim do caso", só para a segura). Os problemas de `validarCaso` (a mesma regra
 * do servidor) aparecem na hora; quem usa desabilita o "Salvar" com `validarCaso(valor).length > 0`.
 * `desabilitado`: só leitura (sem Treinamentos EAD → Editar, ou gravando).
 */
export default function CasoEditor({ valor, onChange, desabilitado = false }) {
  const caso = casoParaEditar(valor);
  const problemas = validarCaso(caso);
  const destinos = destinosDoCaso(caso);
  const mudar = (novo) => {
    if (!desabilitado) onChange(novo);
  };

  return (
    <div className="space-y-4 text-sm">
      <div>
        <Label htmlFor="caso-contexto" className="text-xs">
          Situação apresentada ao aluno (contexto)
        </Label>
        <Textarea
          id="caso-contexto"
          rows={3}
          maxLength={LIMITES_CASO.longo}
          value={caso.contexto}
          onChange={(e) => mudar({ ...caso, contexto: e.target.value })}
          disabled={desabilitado}
          className="mt-0.5"
        />
      </div>

      {caso.etapas.map((etapa, ie) => {
        const nomeDaEtapa = etapa.id || String(ie + 1);
        return (
          <section
            key={ie}
            aria-label={`Etapa ${nomeDaEtapa}`}
            className="space-y-2 rounded-lg border bg-white p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px]">
                {ie === 0 ? "Começo do caso" : `Etapa ${ie + 1}`}
              </Badge>
              <span className="text-xs text-slate-600">Código</span>
              <CodigoDaEtapa
                id={etapa.id}
                rotulo={`Código da etapa ${ie + 1}`}
                desabilitado={desabilitado}
                onRenomear={(novoId) => {
                  const resultado = renomearEtapa(caso, ie, novoId);
                  if (resultado.ok) mudar(resultado.conteudo);
                  return resultado;
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto text-slate-500 hover:text-red-600"
                disabled={desabilitado || caso.etapas.length <= 1}
                onClick={() => mudar(removerEtapa(caso, ie))}
                aria-label={`Remover a etapa ${nomeDaEtapa}`}
              >
                <Trash2 className="w-4 h-4 mr-1" /> Remover etapa
              </Button>
            </div>
            <Textarea
              rows={2}
              placeholder="Pergunta: a decisão que o aluno toma nesta etapa"
              aria-label={`Pergunta da etapa ${nomeDaEtapa}`}
              maxLength={LIMITES_CASO.texto}
              value={etapa.pergunta}
              onChange={(e) => mudar(alterarPergunta(caso, ie, e.target.value))}
              disabled={desabilitado}
            />
            <ol className="space-y-2">
              {etapa.opcoes.map((op, io) => {
                const nome = `opção ${io + 1} da etapa ${nomeDaEtapa}`;
                return (
                  <li
                    key={io}
                    className={`space-y-1.5 rounded-md border-l-4 p-2 ${
                      op.segura
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-amber-400 bg-amber-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={op.texto}
                        placeholder={`Opção ${io + 1}: o que o aluno lê`}
                        aria-label={`Texto da ${nome}`}
                        maxLength={LIMITES_CASO.texto}
                        onChange={(e) =>
                          mudar(alterarOpcao(caso, ie, io, { texto: e.target.value }))
                        }
                        disabled={desabilitado}
                        className="h-8 bg-white"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover a ${nome}`}
                        disabled={desabilitado || etapa.opcoes.length <= LIMITES_CASO.opcoesMin}
                        onClick={() => mudar(removerOpcao(caso, ie, io))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <Textarea
                      rows={2}
                      value={op.comentario}
                      placeholder="Comentário que o aluno vê depois de escolher"
                      aria-label={`Comentário da ${nome}`}
                      maxLength={LIMITES_CASO.texto}
                      onChange={(e) =>
                        mudar(alterarOpcao(caso, ie, io, { comentario: e.target.value }))
                      }
                      disabled={desabilitado}
                      className="bg-white"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <Switch
                          checked={op.segura}
                          onCheckedChange={(v) => mudar(alterarOpcao(caso, ie, io, { segura: v }))}
                          disabled={desabilitado}
                          aria-label={`A ${nome} é a escolha segura`}
                        />
                        {op.segura ? "Escolha segura" : "Escolha insegura"}
                      </label>
                      <span className="text-xs text-slate-600">leva para</span>
                      <Select
                        value={op.proxima ?? FIM}
                        onValueChange={(v) => mudar(alterarOpcao(caso, ie, io, { proxima: v }))}
                        disabled={desabilitado}
                      >
                        <SelectTrigger
                          className="h-8 w-48 bg-white"
                          aria-label={`Para onde a ${nome} leva`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[9999]">
                          {destinos.map((id) => (
                            <SelectItem key={id} value={id}>
                              {id === etapa.id ? `${id} (a mesma etapa)` : id}
                            </SelectItem>
                          ))}
                          <SelectItem value={FIM} disabled={!op.segura}>
                            Fim do caso
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </li>
                );
              })}
            </ol>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={desabilitado || etapa.opcoes.length >= LIMITES_CASO.opcoesMax}
              onClick={() => mudar(adicionarOpcao(caso, ie))}
            >
              <Plus className="w-4 h-4 mr-1" /> Adicionar opção
            </Button>
          </section>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={desabilitado || caso.etapas.length >= LIMITES_CASO.etapas}
        onClick={() => mudar(adicionarEtapa(caso))}
      >
        <Plus className="w-4 h-4 mr-1" /> Adicionar etapa
      </Button>

      <div>
        <Label htmlFor="caso-reflexao" className="text-xs">
          Para refletir (o aluno lê no fim, antes de concluir o caso)
        </Label>
        <Textarea
          id="caso-reflexao"
          rows={3}
          maxLength={LIMITES_CASO.longo}
          value={caso.reflexao}
          onChange={(e) => mudar({ ...caso, reflexao: e.target.value })}
          disabled={desabilitado}
          className="mt-0.5"
        />
      </div>

      <div role="status" aria-live="polite" className="rounded-md border p-2 text-xs">
        {problemas.length === 0 ? (
          <p className="text-emerald-700">Roteiro sem problemas: pode salvar.</p>
        ) : (
          <>
            <p className="font-medium text-amber-800">
              {problemas.length === 1
                ? "1 problema impede salvar:"
                : `${problemas.length} problemas impedem salvar:`}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-800">
              {problemas.map((p, i) => (
                <li key={`${p.codigo}-${i}`}>
                  {p.etapa ? <span className="font-mono">[{p.etapa}] </span> : null}
                  {p.texto}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
