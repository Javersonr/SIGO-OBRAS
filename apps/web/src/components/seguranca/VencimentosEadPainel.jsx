import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  hojeEmBrasilia,
  selecionarVencimentos,
  atividadeSemTreinamento,
  rotuloDoVencimento,
  rotuloDoMotivo,
  JANELA_VENCIMENTO_DIAS,
} from "@/lib/ead-vencimentos";
import { CalendarClock, ShieldAlert, Plus } from "lucide-react";

/**
 * Painel "Vencimentos" da aba Treinamentos (T24): treinamentos do portal vencidos ou a vencer em 30, 60 e
 * 90 dias, os que ainda estão sem matrícula de renovação, e os funcionários ativos sem matrícula válida
 * nos cursos EAD da sua função (NR-1, 1.7.1.2.1). As regras estão em `@/lib/ead-vencimentos` (testadas);
 * aqui só se desenha e se liga o botão "Matricular" ao painel de matrícula da própria aba.
 */

const LINHAS_INICIAIS = 10;

const CONTADORES = [
  { chave: "vencido", rotulo: "Vencidos", campo: "vencidos", alerta: true },
  { chave: "ate30", rotulo: "Em até 30 dias", campo: "ate30" },
  { chave: "ate60", rotulo: "31 a 60 dias", campo: "ate60" },
  { chave: "ate90", rotulo: "61 a 90 dias", campo: "ate90" },
  { chave: "semRenovacao", rotulo: "Sem nova matrícula", campo: "semRenovacao", alerta: true },
];

const fmtData = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

export default function VencimentosEadPainel({
  cursos,
  matriculas,
  certificados,
  funcionarios,
  treinamentos,
  podeMatricular,
  onMatricular,
}) {
  const [filtro, setFiltro] = useState(null);
  const [todos, setTodos] = useState(false);
  const [todosSemTreino, setTodosSemTreino] = useState(false);

  // o dia é o de Brasília; muda só à meia-noite, e as listas abaixo só são refeitas quando ele ou os dados mudam
  const hoje = hojeEmBrasilia();
  const { itens, resumo } = useMemo(
    () => selecionarVencimentos({ matriculas, cursos, funcionarios, certificados, hoje }),
    [matriculas, cursos, funcionarios, certificados, hoje]
  );
  const semTreinamento = useMemo(
    () =>
      atividadeSemTreinamento({
        funcionarios,
        treinamentos,
        cursos,
        matriculas,
        certificados,
        hoje,
      }),
    [funcionarios, treinamentos, cursos, matriculas, certificados, hoje]
  );

  const visiveis = itens.filter((i) =>
    !filtro ? true : filtro === "semRenovacao" ? i.renovacao === "sem" : i.faixa === filtro
  );
  const linhas = todos ? visiveis : visiveis.slice(0, LINHAS_INICIAIS);
  const pessoas = todosSemTreino ? semTreinamento : semTreinamento.slice(0, LINHAS_INICIAIS);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="w-5 h-5" /> Vencimentos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Treinamentos concluídos no portal que já venceram ou vencem em até{" "}
            {JANELA_VENCIMENTO_DIAS} dias. O resumo diário de quem precisa de ação (vencido ou até
            30 dias, sem nova matrícula) também chega no sino. Curso de apoio e curso sem validade
            não entram.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {CONTADORES.map((c) => {
              const valor = resumo[c.campo];
              const ativo = filtro === c.chave;
              const destaque = c.alerta && valor > 0;
              return (
                <button
                  key={c.chave}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => {
                    setFiltro(ativo ? null : c.chave);
                    setTodos(false);
                  }}
                  className={
                    "text-left rounded-lg border p-3 transition-colors " +
                    (ativo
                      ? "border-slate-900 bg-slate-50 "
                      : "border-slate-200 hover:border-slate-400 ") +
                    (destaque ? "bg-amber-50" : "bg-white")
                  }
                >
                  <p
                    className={
                      "text-2xl font-semibold " + (destaque ? "text-amber-700" : "text-slate-800")
                    }
                  >
                    {valor}
                  </p>
                  <p className="text-xs text-slate-500">{c.rotulo}</p>
                </button>
              );
            })}
          </div>

          {itens.length === 0 ? (
            <p className="text-sm text-slate-500 py-3">
              Nenhum treinamento do portal vencido ou vencendo nos próximos {JANELA_VENCIMENTO_DIAS}{" "}
              dias.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-3 font-medium">Funcionário</th>
                    <th className="py-2 pr-3 font-medium">Curso</th>
                    <th className="py-2 pr-3 font-medium">Vencimento</th>
                    <th className="py-2 pr-3 font-medium">Renovação</th>
                    <th className="py-2 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((i) => (
                    <tr key={i.matricula.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 pr-3 font-medium text-slate-800">
                        {i.funcionario?.nome_completo || "—"}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{i.curso?.nome || "—"}</td>
                      <td className="py-2 pr-3">
                        <span className="text-slate-700">{fmtData(i.vencimento)}</span>
                        <span
                          className={
                            "block text-xs " + (i.dias < 0 ? "text-red-600" : "text-slate-500")
                          }
                        >
                          {rotuloDoVencimento(i.dias)}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {i.renovacao === "andamento" ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200"
                          >
                            Nova matrícula em andamento
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-700 border-amber-200"
                          >
                            Sem nova matrícula
                          </Badge>
                        )}
                      </td>
                      <td className="py-2">
                        {i.renovacao === "sem" && podeMatricular(i.curso?.id) && (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Matricular ${i.funcionario?.nome_completo || ""} em ${i.curso?.nome || ""}`}
                            onClick={() => onMatricular(i.curso.id, i.funcionario.id)}
                          >
                            <Plus className="w-3 h-3 mr-1" /> Matricular
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visiveis.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">
                        Nenhum item neste filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {visiveis.length > LINHAS_INICIAIS && (
                <button
                  type="button"
                  className="mt-2 text-sm text-sky-700 underline"
                  onClick={() => setTodos((v) => !v)}
                >
                  {todos ? "Mostrar menos" : `Mostrar todos (${visiveis.length})`}
                </button>
              )}
              <p className="mt-2 text-xs text-slate-500">
                "Sem nova matrícula" quer dizer sem outra matrícula aberta no mesmo curso. Uma
                reciclagem feita em outro curso (por exemplo, a reciclagem de uma NR) não é
                reconhecida como renovação.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" /> Atividade sem treinamento ({semTreinamento.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Funcionários ativos sem matrícula válida em um curso EAD que a função deles exige (NR-1,
            item 1.7.1.2.1: o treinamento vem antes da atividade). Só entram as exigências ligadas a
            um treinamento do cadastro central que tenha curso EAD publicado: treinamento presencial
            registrado na Ficha do funcionário não é considerado aqui.
          </p>
          {semTreinamento.length === 0 ? (
            <p className="text-sm text-slate-500 py-1">
              Nenhum funcionário ativo sem matrícula válida nos cursos EAD da sua função.
            </p>
          ) : (
            <div className="space-y-2">
              {pessoas.map(({ funcionario, pendencias }) => (
                <div key={funcionario.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-medium text-slate-800">
                    {funcionario.nome_completo}
                    {funcionario.funcao_nome && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {funcionario.funcao_nome}
                      </span>
                    )}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {pendencias.map((p) => {
                      const curso = p.cursos.find((c) => podeMatricular(c.id));
                      return (
                        <li
                          key={p.exigencia.id}
                          className="flex flex-wrap items-center gap-2 text-sm text-slate-600"
                        >
                          <span className="font-medium">
                            {p.cursos.map((c) => c.nome).join(" ou ")}
                          </span>
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-700 border-amber-200"
                          >
                            {rotuloDoMotivo(p.motivo)}
                          </Badge>
                          {curso && (
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`Matricular ${funcionario.nome_completo} em ${curso.nome}`}
                              onClick={() => onMatricular(curso.id, funcionario.id)}
                            >
                              <Plus className="w-3 h-3 mr-1" /> Matricular
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {semTreinamento.length > LINHAS_INICIAIS && (
                <button
                  type="button"
                  className="text-sm text-sky-700 underline"
                  onClick={() => setTodosSemTreino((v) => !v)}
                >
                  {todosSemTreino ? "Mostrar menos" : `Mostrar todos (${semTreinamento.length})`}
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
