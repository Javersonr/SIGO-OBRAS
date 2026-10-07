import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  LIMITE_TEXTO_PROJETO,
  LIMITE_VALIDADO_POR,
  MAX_DEDICACAO_MIN,
  MAX_PRAZO_DIAS,
  aoMudarValidacao,
  comObjetivoDoModulo,
  estadoDoPdfDoFormulario,
  gatilhosDoCurso,
  modulosDoCurso,
  montarProjeto,
  objetivoDoModulo,
  rotuloDaRevisao,
  situacaoDaRevisao,
} from "@/lib/ead-projeto";
import { hojeEmBrasilia } from "@/lib/ead-vencimentos";
import { FileText, Loader2, FileDown } from "lucide-react";

/**
 * Seção "Projeto pedagógico (Anexo II 3.1)" do formulário do curso (T25): os 15 itens que a NR-1 exige, a
 * validação do responsável técnico (3.3) e o PDF do projeto. Os nove itens que o curso não tinha ficam em campos
 * do próprio curso (migração 0141) e o RH os escreve aqui; os outros seis vêm dos campos que o curso já tinha e
 * aparecem só para leitura. As regras (o que está preenchido, o que gravar, a revisão) estão em `@/lib/ead-projeto`
 * (testadas); aqui só se desenha. Quem grava (Salvar curso) e quem gera o PDF é o `TreinamentosEadTab`.
 *
 * O TEXTO do projeto é do responsável técnico (D5): a tela não sugere nem preenche conteúdo.
 */

const COR_DA_REVISAO = {
  em_dia: "bg-emerald-50 text-emerald-700 border-emerald-200",
  a_vencer: "bg-amber-50 text-amber-700 border-amber-200",
  vencida: "bg-red-50 text-red-700 border-red-200",
  sem_validacao: "bg-slate-50 text-slate-700 border-slate-200",
};

const fmtData = (dia) => String(dia).slice(0, 10).split("-").reverse().join("/");

function EtiquetaDoItem({ preenchido }) {
  return (
    <Badge
      variant="outline"
      className={
        preenchido
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-amber-50 text-amber-700 border-amber-200"
      }
    >
      {preenchido ? "Preenchido" : "Falta"}
    </Badge>
  );
}

/** O campo de edição de um item que o RH escreve aqui (os de `origem: "projeto"`). */
function EditorDoItem({ item, curso, modulos, onMudar }) {
  const id = `projeto-${item.campo}`;
  if (item.campo === "modulos_objetivos") {
    if (modulos.length === 0) {
      return (
        <p className="text-xs text-slate-600">
          Cadastre as aulas do curso (mais abaixo): o objetivo é escrito para cada módulo delas.
        </p>
      );
    }
    return (
      <div className="space-y-2">
        {modulos.map((m, i) => (
          <div key={m.modulo || "(sem-modulo)"}>
            <Label htmlFor={`${id}-${i}`} className="text-xs">
              Objetivo de: {m.rotulo}
            </Label>
            <Textarea
              id={`${id}-${i}`}
              rows={2}
              maxLength={LIMITE_TEXTO_PROJETO}
              value={objetivoDoModulo(curso.modulos_objetivos, m.modulo)}
              onChange={(e) =>
                onMudar({
                  modulos_objetivos: comObjetivoDoModulo(
                    curso.modulos_objetivos,
                    m.modulo,
                    e.target.value
                  ),
                })
              }
              className="mt-0.5"
            />
          </div>
        ))}
      </div>
    );
  }
  if (item.campo === "dedicacao_diaria_min" || item.campo === "prazo_conclusao_dias") {
    const minutos = item.campo === "dedicacao_diaria_min";
    return (
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          min={1}
          max={minutos ? MAX_DEDICACAO_MIN : MAX_PRAZO_DIAS}
          value={curso[item.campo] ?? ""}
          onChange={(e) => onMudar({ [item.campo]: e.target.value })}
          className="h-9 w-28"
          aria-label={item.titulo}
        />
        <span className="text-xs text-slate-600">
          {minutos ? "minutos por dia" : "dias, contados da matrícula"}
        </span>
      </div>
    );
  }
  const texto = String(curso[item.campo] ?? "");
  return (
    <div>
      <Textarea
        id={id}
        rows={3}
        maxLength={LIMITE_TEXTO_PROJETO}
        value={texto}
        onChange={(e) => onMudar({ [item.campo]: e.target.value })}
        aria-label={item.titulo}
      />
      <p className="mt-0.5 text-right text-[11px] text-slate-400">
        {texto.length}/{LIMITE_TEXTO_PROJETO}
      </p>
    </div>
  );
}

export default function ProjetoPedagogicoCurso({
  curso,
  aulas = [],
  questoes = [],
  onMudar,
  podeGerarPdf = false,
  // T33: por que não dá para gerar o PDF quando o motivo não é "salve o curso antes" (ex.: falta a permissão)
  motivoSemPdf,
  gerandoPdf = false,
  subindoPdf = false,
  // o curso está sendo salvo (A6, T25): gerar ou anexar o PDF junto desfazia o que o Salvar gravou
  salvandoCurso = false,
  onGerarPdf,
  onAnexarPdf,
  onVerPdf,
  hoje,
}) {
  const dia = hoje || hojeEmBrasilia();
  const ocupado = gerandoPdf || subindoPdf || salvandoCurso;
  const projeto = useMemo(
    () => montarProjeto({ curso, aulas, questoes }),
    [curso, aulas, questoes]
  );
  const modulos = useMemo(() => modulosDoCurso(aulas), [aulas]);
  const revisao = useMemo(() => situacaoDaRevisao(curso, dia), [curso, dia]);
  const gatilhos = useMemo(() => gatilhosDoCurso(curso), [curso]);
  // o PDF diz o mesmo que o projeto que está na tela? (a marca gravada com o PDF contra os 12 campos de agora)
  const estadoDoPdf = useMemo(
    () => estadoDoPdfDoFormulario(curso, { aulas, questoes }),
    [curso, aulas, questoes]
  );
  const pdfDesatualizado = estadoDoPdf === "desatualizado";
  const nomeDoRT = String(curso?.responsavel_tecnico_nome ?? "").trim();

  return (
    <section
      aria-labelledby="projeto-pedagogico-titulo"
      className="col-span-2 space-y-3 rounded-lg border p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-slate-600" aria-hidden="true" />
        <h3 id="projeto-pedagogico-titulo" className="text-sm font-semibold">
          Projeto pedagógico (Anexo II 3.1)
        </h3>
        <Badge
          variant="outline"
          className={
            projeto.completo
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-amber-50 text-amber-700 border-amber-200"
          }
        >
          {projeto.preenchidos}/{projeto.total} itens
        </Badge>
        <Badge variant="outline" className={COR_DA_REVISAO[revisao.estado]}>
          {rotuloDaRevisao(revisao)}
        </Badge>
        {pdfDesatualizado && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            PDF desatualizado
          </Badge>
        )}
      </div>
      <p className="text-xs text-slate-600">
        A NR-1 (Anexo II, item 3.1) pede 15 itens no projeto pedagógico de todo curso a distância. O
        texto é do responsável técnico: o sistema só organiza os itens, gera o PDF e controla a
        revisão a cada 2 anos. Os itens marcados "do curso" vêm dos campos do curso e se editam nos
        campos dele.
      </p>

      <ol className="space-y-2">
        {projeto.itens.map((item) => (
          <li key={item.letra} className="space-y-1.5 rounded-md border border-slate-200 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-800">
                {item.letra}) {item.titulo}
              </span>
              <EtiquetaDoItem preenchido={item.preenchido} />
              {item.origem === "curso" && (
                <span className="text-[11px] text-slate-500">do curso</span>
              )}
            </div>
            {item.origem === "projeto" ? (
              <>
                {item.ajuda && <p className="text-xs text-slate-500">{item.ajuda}</p>}
                <EditorDoItem item={item} curso={curso} modulos={modulos} onMudar={onMudar} />
              </>
            ) : (
              <>
                {item.linhas.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-slate-700">
                    {item.linhas.slice(0, 12).map((linha, i) => (
                      <li key={i}>{linha}</li>
                    ))}
                    {item.linhas.length > 12 && (
                      <li className="text-slate-500">e mais {item.linhas.length - 12} linha(s)</li>
                    )}
                  </ul>
                )}
                <p className="text-[11px] text-slate-500">Edite em: {item.onde}.</p>
              </>
            )}
            {!item.preenchido && item.pendencia && (
              <p className="text-xs text-amber-700">{item.pendencia}</p>
            )}
          </li>
        ))}
      </ol>

      <div className="space-y-2 rounded-md border border-slate-200 p-2">
        <h4 className="text-sm font-medium text-slate-800">Validação do projeto (Anexo II 3.3)</h4>
        <p className="text-xs text-slate-600">
          O responsável técnico valida o projeto a cada 2 anos, ou quando a norma do curso mudar. Só
          se registra a validação com os 15 itens preenchidos.
        </p>
        {gatilhos.map((g) => (
          <p key={g.norma} className="text-xs text-amber-700">
            {g.norma}, a partir de {fmtData(g.data)}: {g.texto}
          </p>
        ))}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <Label htmlFor="projeto-validado-por" className="text-xs">
              Validado por
            </Label>
            <Input
              id="projeto-validado-por"
              value={curso?.projeto_validado_por ?? ""}
              maxLength={LIMITE_VALIDADO_POR}
              onChange={(e) => onMudar({ projeto_validado_por: e.target.value })}
              placeholder="Nome do responsável técnico"
              className="mt-0.5"
            />
            {nomeDoRT && curso?.projeto_validado_por !== nomeDoRT && (
              <button
                type="button"
                className="mt-0.5 text-xs text-sky-700 hover:underline"
                onClick={() => onMudar({ projeto_validado_por: nomeDoRT })}
              >
                Usar o responsável técnico do curso
              </button>
            )}
          </div>
          <div>
            <Label htmlFor="projeto-validado-em" className="text-xs">
              Data da validação
            </Label>
            <Input
              id="projeto-validado-em"
              type="date"
              value={curso?.projeto_validado_em ?? ""}
              onChange={(e) => onMudar(aoMudarValidacao(curso, e.target.value))}
              className="mt-0.5"
            />
          </div>
          <div>
            <Label htmlFor="projeto-proxima-revisao" className="text-xs">
              Próxima revisão até
            </Label>
            <Input
              id="projeto-proxima-revisao"
              type="date"
              value={curso?.proxima_revisao ?? ""}
              onChange={(e) => onMudar({ proxima_revisao: e.target.value })}
              className="mt-0.5"
            />
            <p className="mt-0.5 text-[11px] text-slate-500">
              Sugerida: 2 anos depois da validação.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2">
        <span className="min-w-[10rem] flex-1 text-sm">
          PDF do projeto <span className="text-xs text-slate-500">— o aluno abre pelo portal</span>
        </span>
        {curso?.projeto_pedagogico_ref && (
          <button type="button" className="text-xs text-sky-600 hover:underline" onClick={onVerPdf}>
            ver atual
          </button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeGerarPdf || gerandoPdf || subindoPdf || salvandoCurso}
          onClick={onGerarPdf}
          title={
            podeGerarPdf
              ? "Grava o projeto escrito aqui e gera o PDF com os 15 itens"
              : motivoSemPdf || "Salve o curso antes de gerar o PDF do projeto"
          }
        >
          {gerandoPdf ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileDown className="mr-1 h-4 w-4" aria-hidden="true" />
          )}
          Gerar PDF do projeto
        </Button>
        {podeGerarPdf && (
          <label
            className={`rounded-md border px-2 py-1 text-xs ${
              ocupado ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-slate-400"
            }`}
          >
            {subindoPdf ? (
              <Loader2 className="inline h-3 w-3 animate-spin" aria-hidden="true" />
            ) : curso?.projeto_pedagogico_ref ? (
              "trocar por PDF próprio"
            ) : (
              "anexar PDF próprio"
            )}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={gerandoPdf || subindoPdf || salvandoCurso}
              onChange={(e) => {
                onAnexarPdf?.(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {pdfDesatualizado && (
          <p role="status" className="w-full text-xs text-amber-700">
            O PDF está desatualizado: o projeto, a validação ou a data de revisão mudaram depois de
            gerá-lo (ou o PDF foi anexado sem registro do projeto que ele diz). O aluno e a
            fiscalização ainda abrem o PDF antigo, e o requisito do projeto só fica em ordem com o
            PDF novo. Clique em "Gerar PDF do projeto" (ou anexe o seu de novo).
          </p>
        )}
        {estadoDoPdf === "atual" && (
          <p className="w-full text-xs text-emerald-700">
            O PDF diz o mesmo que o projeto e a validação desta tela.
          </p>
        )}
        <p className="w-full text-xs text-slate-500">
          {podeGerarPdf
            ? "O PDF usa o projeto escrito aqui e os dados já salvos do curso (nome, carga, responsável técnico, instrutor). Gerar de novo troca o PDF que o aluno vê. Um PDF próprio vale para o projeto salvo na hora do envio: mudou o projeto, anexe de novo."
            : motivoSemPdf || "Salve o curso para gerar o PDF do projeto."}
        </p>
      </div>
    </section>
  );
}
