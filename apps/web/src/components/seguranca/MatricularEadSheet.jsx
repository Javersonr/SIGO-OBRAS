import React, { useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { normalizarTexto } from "@/lib/busca";
import { matriculasNovas } from "@/lib/ead-gestao";
import { hojeEmBrasilia } from "@/lib/ead-vencimentos";
import { motivoSemCertificado } from "@/lib/ead-requisitos";
import {
  funcoesDosFuncionarios,
  idsQueFaltam,
  matriculasDoPlano,
  planoDaFuncao,
  rotuloDaSituacao,
  selecaoDaFuncao,
} from "@/lib/ead-matricula-funcao";

/**
 * Painel "Matricular funcionários" da aba Treinamentos. Dois jeitos (T22):
 *  - Por funcionário: escolhe o curso e marca as pessoas (como sempre foi);
 *  - Por função: escolhe a função e o painel mostra os treinamentos EAD que ela exige (função → exigência →
 *    treinamento central → curso do portal, migração 0131) e quem ainda não tem matrícula válida neles.
 *    Já vem marcado quem falta, e só se criam as matrículas que faltam.
 *
 * Curso de apoio (D3) aceita matrícula, mas NÃO emite certificado: o painel avisa antes de matricular.
 * A conta das matrículas é de `lib/ead-matricula-funcao.js` (testada); aqui só se desenha. Quem grava é
 * `onConfirmar({ novas, ignorados })`, que devolve `true` se gravou (o painel então fecha).
 *
 * `inicial` = como o painel abre: `{ modo, cursoId, funcionarioIds, funcaoId, chave }`; cada `chave` nova
 * monta o formulário do zero (o estado nasce já com a função e as pessoas marcadas). `cursoMatriculavel(curso)` devolve null (aceita) ou o motivo de não aceitar.
 */
const FORM_VAZIO = {
  modo: "funcionario",
  cursoId: "",
  funcionarioIds: [],
  funcaoId: "",
  exigenciaIds: [],
  busca: "",
};

// O que o formulário traz marcado ao abrir (por exemplo, a função e a pessoa da sugestão de admissão).
function formularioInicial({ inicial, ...dadosDoPlano }) {
  const modo = inicial?.modo === "funcao" ? "funcao" : "funcionario";
  if (modo === "funcao" && inicial?.funcaoId) {
    const plano = planoDaFuncao({ funcaoId: inicial.funcaoId, ...dadosDoPlano });
    return {
      ...FORM_VAZIO,
      modo,
      funcaoId: inicial.funcaoId,
      ...selecaoDaFuncao(plano, inicial.funcionarioIds || null),
    };
  }
  return {
    ...FORM_VAZIO,
    modo,
    cursoId: inicial?.cursoId || "",
    funcionarioIds: modo === "funcionario" ? inicial?.funcionarioIds || [] : [],
  };
}

export function FormularioDeMatricula({
  inicial,
  cursos,
  funcionarios,
  treinamentos,
  matriculas,
  certificados,
  empresaId,
  cursoMatriculavel,
  gravando,
  onConfirmar,
}) {
  const hoje = hojeEmBrasilia();
  const [form, setForm] = useState(() =>
    formularioInicial({
      inicial,
      funcionarios,
      treinamentos,
      cursos,
      matriculas,
      certificados,
      hoje,
      cursoMatriculavel,
    })
  );

  const funcoes = useMemo(() => funcoesDosFuncionarios(funcionarios), [funcionarios]);
  const plano = useMemo(
    () =>
      form.funcaoId
        ? planoDaFuncao({
            funcaoId: form.funcaoId,
            funcionarios,
            treinamentos,
            cursos,
            matriculas,
            certificados,
            hoje,
            cursoMatriculavel,
          })
        : null,
    [
      form.funcaoId,
      funcionarios,
      treinamentos,
      cursos,
      matriculas,
      certificados,
      hoje,
      cursoMatriculavel,
    ]
  );

  // Escolher a função marca os treinamentos que têm curso disponível e quem falta neles.
  const escolherFuncao = (funcaoId) => {
    if (!funcaoId) {
      setForm((f) => ({ ...f, funcaoId: "", exigenciaIds: [], funcionarioIds: [] }));
      return;
    }
    const p = planoDaFuncao({
      funcaoId,
      funcionarios,
      treinamentos,
      cursos,
      matriculas,
      certificados,
      hoje,
      cursoMatriculavel,
    });
    setForm((f) => ({ ...f, funcaoId, ...selecaoDaFuncao(p) }));
  };

  const alternar = (campo, id) =>
    setForm((f) => ({
      ...f,
      [campo]: f[campo].includes(id) ? f[campo].filter((x) => x !== id) : [...f[campo], id],
    }));

  // ---- por funcionário
  const cursosAbertos = cursos.filter((c) => !cursoMatriculavel(c));
  const cursoEscolhido = cursos.find((c) => c.id === form.cursoId);
  const avisoDoCurso = cursoEscolhido ? avisoDeCertificado(cursoEscolhido) : null;
  const funcsFiltrados = funcionarios.filter(
    (f) => !form.busca || normalizarTexto(f.nome_completo).includes(normalizarTexto(form.busca))
  );

  // ---- por função: o que seria criado com a seleção de agora
  const previa = useMemo(
    () =>
      plano
        ? matriculasDoPlano({
            plano,
            exigenciaIds: form.exigenciaIds,
            funcionarioIds: form.funcionarioIds,
            matriculas,
            empresaId,
          })
        : { novas: [], ignorados: 0 },
    [plano, form.exigenciaIds, form.funcionarioIds, matriculas, empresaId]
  );
  const faltamNaSelecao = useMemo(
    () => (plano ? new Set(idsQueFaltam(plano, form.exigenciaIds)) : new Set()),
    [plano, form.exigenciaIds]
  );

  const confirmar = async () => {
    let resultado;
    if (form.modo === "funcao") {
      resultado = previa;
    } else {
      if (!form.cursoId || form.funcionarioIds.length === 0) {
        toast.error("Escolha o curso e ao menos um funcionário");
        return;
      }
      resultado = matriculasNovas({
        matriculas,
        cursoId: form.cursoId,
        funcionarioIds: form.funcionarioIds,
        empresaId,
      });
    }
    await onConfirmar(resultado);
  };

  const quantas = form.modo === "funcao" ? previa.novas.length : form.funcionarioIds.length;

  return (
    <SheetContent
      className={
        "w-full overflow-y-auto " + (form.modo === "funcao" ? "sm:max-w-xl" : "sm:max-w-md")
      }
    >
      <SheetHeader>
        <SheetTitle>Matricular funcionários</SheetTitle>
      </SheetHeader>
      <div className="space-y-4 py-4">
        <div
          role="group"
          aria-label="Como matricular"
          className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm"
        >
          {[
            ["funcionario", "Por funcionário"],
            ["funcao", "Por função"],
          ].map(([modo, rotulo]) => (
            <button
              key={modo}
              type="button"
              aria-pressed={form.modo === modo}
              onClick={() => setForm((f) => ({ ...f, modo }))}
              className={
                "rounded-md px-3 py-1.5 font-medium transition-colors " +
                (form.modo === modo
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900")
              }
            >
              {rotulo}
            </button>
          ))}
        </div>

        {form.modo === "funcionario" ? (
          <>
            <div>
              <Label className="text-xs" htmlFor="mat-curso">
                Curso
              </Label>
              <select
                id="mat-curso"
                className="mt-0.5 w-full h-9 rounded-md border border-slate-200 px-2 text-sm"
                value={form.cursoId}
                onChange={(e) => setForm((f) => ({ ...f, cursoId: e.target.value }))}
              >
                <option value="">Selecionar...</option>
                {cursosAbertos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.modalidade === "apoio" ? " (apoio, sem certificado)" : ""}
                  </option>
                ))}
              </select>
              {avisoDoCurso && (
                <p
                  role="note"
                  className="mt-2 flex items-start gap-1.5 rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900"
                >
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {avisoDoCurso}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs" htmlFor="mat-busca">
                Funcionários
              </Label>
              <Input
                id="mat-busca"
                placeholder="Buscar..."
                value={form.busca}
                onChange={(e) => setForm((f) => ({ ...f, busca: e.target.value }))}
                className="mt-0.5 h-9"
              />
              <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
                {funcsFiltrados.map((f) => (
                  <label
                    key={f.id}
                    className="flex items-center gap-2 text-sm p-2 rounded hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form.funcionarioIds.includes(f.id)}
                      onChange={() => alternar("funcionarioIds", f.id)}
                    />
                    <span className="flex-1">{f.nome_completo}</span>
                    <span className="text-xs text-slate-400">{f.funcao_nome || ""}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <Label className="text-xs" htmlFor="mat-funcao">
                Função
              </Label>
              <select
                id="mat-funcao"
                className="mt-0.5 w-full h-9 rounded-md border border-slate-200 px-2 text-sm"
                value={form.funcaoId}
                onChange={(e) => escolherFuncao(e.target.value)}
              >
                <option value="">Selecionar...</option>
                {funcoes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome} ({f.total})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Vale o que a função exige em Configurações → Funções → Treinamentos, para quem tem
                curso EAD no portal. Só entram funcionários ativos.
              </p>
            </div>

            {plano && plano.exigencias.length === 0 && (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Esta função não tem treinamento obrigatório ligado ao cadastro central. Cadastre em
                Configurações → Funções → Treinamentos.
              </p>
            )}

            {plano && plano.exigencias.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-600">
                  Treinamentos que a função exige
                </p>
                <ul className="mt-1 space-y-1">
                  {plano.exigencias.map((e) => (
                    <li key={e.id} className="rounded-md border border-slate-200 p-2 text-sm">
                      <label
                        className={
                          "flex items-start gap-2 " +
                          (e.curso ? "cursor-pointer" : "cursor-not-allowed text-slate-400")
                        }
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          disabled={!e.curso}
                          checked={form.exigenciaIds.includes(e.id)}
                          onChange={() => alternar("exigenciaIds", e.id)}
                        />
                        <span className="flex-1">
                          <span className="font-medium">{e.nome}</span>
                          {e.curso ? (
                            <span className="block text-xs text-slate-500">
                              Curso: {e.curso.nome}
                            </span>
                          ) : (
                            <span className="block text-xs">
                              {e.motivo === "sem_curso"
                                ? "Sem curso no portal: não dá para matricular."
                                : `Curso indisponível${e.detalheMotivo ? `: ${e.detalheMotivo}` : ""}.`}
                            </span>
                          )}
                        </span>
                        {e.apoio && (
                          <Badge variant="outline" className="shrink-0 text-slate-700">
                            Apoio, sem certificado
                          </Badge>
                        )}
                      </label>
                      {e.apoio && (
                        <p
                          role="note"
                          className="mt-1 flex items-start gap-1.5 rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900"
                        >
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {motivoSemCertificado("apoio")}. O funcionário estuda o material no
                          portal, mas não recebe certificado.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plano && plano.exigencias.length > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-600">
                    Funcionários ({plano.pessoas.length})
                  </p>
                  <button
                    type="button"
                    className="text-xs text-sky-700 underline"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        funcionarioIds: idsQueFaltam(plano, f.exigenciaIds),
                      }))
                    }
                  >
                    Marcar quem falta
                  </button>
                </div>
                <ul className="mt-1 max-h-72 space-y-1 overflow-y-auto">
                  {plano.pessoas.map((p) => {
                    const precisa = faltamNaSelecao.has(p.funcionario.id);
                    return (
                      <li key={p.funcionario.id}>
                        <label
                          className={
                            "flex items-start gap-2 rounded p-2 text-sm " +
                            (precisa
                              ? "cursor-pointer hover:bg-slate-50"
                              : "cursor-not-allowed text-slate-400")
                          }
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            disabled={!precisa}
                            checked={precisa && form.funcionarioIds.includes(p.funcionario.id)}
                            onChange={() => alternar("funcionarioIds", p.funcionario.id)}
                          />
                          <span className="flex-1">
                            {p.funcionario.nome_completo}
                            <span className="block text-xs text-slate-500">
                              {plano.exigencias
                                .map((e) => `${e.nome}: ${rotuloDaSituacao(p.itens[e.id])}`)
                                .join(" · ")}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                  {plano.pessoas.length === 0 && (
                    <li className="p-2 text-sm text-slate-500">
                      Nenhum funcionário ativo nesta função.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </>
        )}

        {form.modo === "funcao" && plano && (
          <p className="text-xs text-slate-600" aria-live="polite">
            {previa.novas.length === 0
              ? "Nada a matricular com esta seleção."
              : `${previa.novas.length} matrícula(s) serão criadas, só nos treinamentos que faltam a cada pessoa.`}
          </p>
        )}

        <Button
          onClick={confirmar}
          disabled={gravando || (form.modo === "funcao" && quantas === 0)}
          className="w-full bg-slate-900 hover:bg-slate-800"
        >
          {gravando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Matricular ({quantas})
        </Button>
      </div>
    </SheetContent>
  );
}

// O painel em si: o `Sheet` do Radix e, dentro, o formulário. Cada abertura traz uma `chave` nova e remonta o
// formulário (estado novo); ao fechar guarda a última, para o conteúdo não esvaziar durante a animação.
export default function MatricularEadSheet({ aberto, inicial, onFechar, ...resto }) {
  const ultimo = useRef(inicial);
  if (inicial) ultimo.current = inicial;
  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <FormularioDeMatricula
        key={ultimo.current?.chave ?? "sem-chave"}
        inicial={ultimo.current}
        {...resto}
      />
    </Sheet>
  );
}

// O aviso que aparece ao escolher um curso que não emite certificado (hoje só o de apoio: os outros não
// chegam a aparecer na lista de cursos que aceitam matrícula).
function avisoDeCertificado(curso) {
  if (curso.modalidade !== "apoio") return null;
  return `${motivoSemCertificado("apoio")}. O funcionário estuda o material no portal, mas não recebe certificado.`;
}
