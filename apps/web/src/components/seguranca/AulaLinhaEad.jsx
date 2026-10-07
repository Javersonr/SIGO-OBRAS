import React, { useRef } from "react";
import { ArrowDown, ArrowUp, BookOpen, FileText, MoreVertical, Pencil, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { videoSemDuracao } from "@/lib/ead-duracao";
import { ACCEPT_AULA, tipoDeArquivoDaAula } from "@/lib/ead-upload";

// Setas de ordem: a cor está no botão (o ícone herda), então desabilitada (1ª/última aula ou
// gravação em andamento) ela esmaece e o hover não a escurece como se estivesse ativa.
const CLASSE_ICONE = "h-8 w-8 shrink-0 text-slate-400 hover:text-slate-800 hover:bg-slate-200";
const CLASSE_ICONE_DESABILITADO =
  "disabled:opacity-40 disabled:hover:text-slate-400 disabled:hover:bg-transparent disabled:cursor-not-allowed";

/**
 * Linha de uma aula na lista do curso (T30). O título corta em até duas linhas, com reticências
 * (`line-clamp-2`), e os selos vão numa segunda linha, então a linha cabe em 360 px. Subir, descer e
 * editar ficam à vista; ver o arquivo, trocar o arquivo, legenda e remover ficam no menu "⋮".
 *
 * `aula.numero` vem de `numerarAulas`. Os arquivos escolhidos sobem pelas props `onTrocarArquivo`
 * e `onLegenda`; os seletores de arquivo ficam FORA do menu (o menu desmonta ao fechar e levaria o
 * seletor junto antes do `change`).
 */
export default function AulaLinhaEad({
  aula,
  primeira,
  ultima,
  ordemOcupada,
  envioEmCurso,
  onSubir,
  onDescer,
  onEditar,
  onVer,
  onRemover,
  onTrocarArquivo,
  onLegenda,
  // T33: sem Treinamentos EAD → Editar a linha só mostra a aula (e "Ver"); quem protege é o banco
  somenteLeitura = false,
}) {
  const arquivoRef = useRef(null);
  const legendaRef = useRef(null);
  const tipo = aula.tipo || "video";
  const Icone = tipo === "pdf" ? FileText : tipo === "texto" ? BookOpen : Video;
  const tipoArquivo = tipoDeArquivoDaAula(aula);
  const rotuloTipo = tipo === "pdf" ? "PDF" : "vídeo";
  const temSelos =
    (tipo !== "video" && aula.duracao_seg) ||
    videoSemDuracao(aula) ||
    (tipo === "video" && aula.legenda_ref);

  return (
    <div className="flex items-center gap-1 text-sm bg-slate-50 rounded p-2">
      <Icone className="w-4 h-4 mr-1 text-slate-400 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words" title={`${aula.numero}. ${aula.titulo}`}>
          {aula.numero}. {aula.titulo}
        </p>
        {temSelos && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {tipo !== "video" && aula.duracao_seg ? (
              <span className="text-xs text-slate-400">
                mín. {Math.round(aula.duracao_seg / 60)} min
              </span>
            ) : null}
            {videoSemDuracao(aula) && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 text-amber-700 border-amber-300"
                title="Vídeo sem duração cadastrada: o aluno não consegue concluir esta aula. Edite a aula e informe a duração (mm:ss)."
              >
                sem duração
              </Badge>
            )}
            {tipo === "video" && aula.legenda_ref && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0" title="Aula com legenda">
                CC
              </Badge>
            )}
          </div>
        )}
      </div>

      {!somenteLeitura && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Subir na ordem"
            aria-label={`Subir a aula ${aula.numero} na ordem`}
            disabled={primeira || ordemOcupada}
            onClick={onSubir}
            className={`${CLASSE_ICONE} ${CLASSE_ICONE_DESABILITADO}`}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Descer na ordem"
            aria-label={`Descer a aula ${aula.numero} na ordem`}
            disabled={ultima || ordemOcupada}
            onClick={onDescer}
            className={`${CLASSE_ICONE} ${CLASSE_ICONE_DESABILITADO}`}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Editar aula"
            aria-label={`Editar a aula ${aula.numero}`}
            onClick={onEditar}
            className={CLASSE_ICONE}
          >
            <Pencil />
          </Button>
        </>
      )}

      {(!somenteLeitura || tipo !== "texto") && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Mais ações"
              aria-label={`Mais ações da aula ${aula.numero}`}
              className={CLASSE_ICONE}
            >
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[9999] w-56">
            {tipo !== "texto" && (
              <DropdownMenuItem onSelect={onVer}>
                {tipo === "pdf" ? "Ver PDF" : "Ver vídeo"}
              </DropdownMenuItem>
            )}
            {!somenteLeitura && tipoArquivo && (
              <DropdownMenuItem
                disabled={envioEmCurso}
                onSelect={() => arquivoRef.current?.click()}
              >
                Trocar o arquivo ({rotuloTipo})
              </DropdownMenuItem>
            )}
            {!somenteLeitura && tipo === "video" && (
              <DropdownMenuItem onSelect={() => legendaRef.current?.click()}>
                {aula.legenda_ref ? "Trocar a legenda" : "Anexar legenda (.srt ou .vtt)"}
              </DropdownMenuItem>
            )}
            {!somenteLeitura && tipo !== "texto" && <DropdownMenuSeparator />}
            {!somenteLeitura && (
              <DropdownMenuItem
                className="text-red-600 focus:bg-red-50 focus:text-red-700"
                onSelect={onRemover}
              >
                Remover aula
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {!somenteLeitura && tipoArquivo && (
        <input
          ref={arquivoRef}
          type="file"
          accept={ACCEPT_AULA[tipoArquivo]}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            if (arquivo) onTrocarArquivo(arquivo);
          }}
        />
      )}
      {!somenteLeitura && tipo === "video" && (
        <input
          ref={legendaRef}
          type="file"
          accept=".srt,.vtt"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            if (arquivo) onLegenda(arquivo);
          }}
        />
      )}
    </div>
  );
}
