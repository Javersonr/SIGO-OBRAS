import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Award,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BellRing,
  ClipboardList,
  Download,
  MessageCircle,
  Plus,
  RotateCw,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { podeRemoverMatricula } from "@/lib/ead-gestao";
import { hojeEmBrasilia, rotuloDoVencimento } from "@/lib/ead-vencimentos";
import { MSG_CURSO_DE_APOIO } from "@/lib/portal-curso";
import {
  FILTROS_VAZIOS,
  csvDasLinhas,
  diasDePrazoValidos,
  filtrarLinhas,
  montarLinhas,
  ordenarLinhas,
  resumirLinhas,
} from "@/lib/ead-matriculas";
import AvisoAtrasadosDialog from "@/components/seguranca/AvisoAtrasadosDialog";

/**
 * Tabela de matrículas da aba Treinamentos (T22): busca, filtros (curso, status, vencimento), ordenação por
 * coluna, andamento (aulas feitas, nota, tentativas), "Renovar", exportação em CSV e aviso em lote aos
 * atrasados. Mostra 50 linhas por vez (com centenas de matrículas a página continua leve); o CSV leva todas
 * as linhas do filtro. As regras (montar as linhas, filtrar, ordenar, o CSV) estão em `lib/ead-matriculas.js`
 * (testadas); aqui só se desenha e se liga a tela.
 *
 * Quem grava (remover, renovar, avisar, abrir os detalhes) é a aba, pelos callbacks.
 */

const LINHAS_POR_VEZ = 50;

const CLASSE_DO_STATUS = {
  pendente: "bg-slate-100 text-slate-600",
  em_andamento: "bg-amber-100 text-amber-700 border-amber-200",
  concluido: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

// primeiro clique no cabeçalho: texto e datas de vencimento do menor para o maior; números e a data da
// matrícula do maior para o menor (os mais recentes e os mais adiantados primeiro)
const DIRECAO_INICIAL = {
  progresso: "desc",
  nota: "desc",
  tentativas: "desc",
  matriculadoEm: "desc",
};

const fmtData = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const fmtNota = (n) => String(Number(n.toFixed(1))).replace(".", ",");

// O prazo padrão fica só neste navegador (por empresa) e vale para os cursos que não têm prazo próprio: o
// prazo do curso (`prazo_conclusao_dias`, escrito no projeto pedagógico, T25) vale mais que este número.
const chavePrazo = (empresaId) => `sigo:ead:prazo-padrao:${empresaId}`;
function lerPrazo(empresaId) {
  try {
    return localStorage.getItem(chavePrazo(empresaId)) || "";
  } catch {
    return "";
  }
}
function gravarPrazo(empresaId, texto) {
  try {
    if (texto) localStorage.setItem(chavePrazo(empresaId), texto);
    else localStorage.removeItem(chavePrazo(empresaId));
  } catch {
    /* sem storage: o prazo vale só até fechar a tela */
  }
}

function Cabecalho({ campo, rotulo, ordem, onOrdenar, className = "" }) {
  const ativa = ordem.campo === campo;
  const Seta = !ativa ? ArrowUpDown : ordem.direcao === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={ativa ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"}
      className={`py-2 pr-3 font-medium ${className}`}
    >
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        className="inline-flex items-center gap-1 font-medium hover:text-slate-900"
        title={`Ordenar por ${rotulo.toLowerCase()}`}
      >
        {rotulo}
        <Seta className={`h-3 w-3 ${ativa ? "text-slate-900" : "text-slate-300"}`} />
      </button>
    </th>
  );
}

function CelulaProgresso({ linha, andamento }) {
  if (!andamento.carregado) return <span className="text-slate-300">…</span>;
  if (linha.aulasFeitas === null || !linha.aulasTotal) {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <div className="min-w-[88px]">
      <span className="text-slate-700">
        {linha.aulasFeitas}/{linha.aulasTotal}
      </span>
      <span className="ml-1 text-xs text-slate-400">aulas</span>
      <div
        role="progressbar"
        aria-label={`${linha.percentual}% das aulas concluídas`}
        aria-valuenow={linha.percentual}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className={`h-full ${linha.percentual === 100 ? "bg-emerald-500" : "bg-sky-500"}`}
          style={{ width: `${linha.percentual}%` }}
        />
      </div>
    </div>
  );
}

function CelulaCertificado({ linha }) {
  if (linha.certificadoSituacao === "emitido") {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
        <Award className="w-3 h-3 mr-1" />
        {linha.certificadoCodigo}
      </Badge>
    );
  }
  if (linha.certificadoSituacao === "revogado") {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
        <Award className="w-3 h-3 mr-1" />
        revogado
      </Badge>
    );
  }
  if (linha.certificadoSituacao === "nao_emite") {
    return (
      <span className="text-xs text-slate-500" title={MSG_CURSO_DE_APOIO}>
        não emite
      </span>
    );
  }
  return <span className="text-slate-400">—</span>;
}

export default function MatriculasEadCard({
  empresaId,
  matriculas,
  cursos,
  funcionariosTodos,
  aulas,
  progresso,
  tentativas,
  certificados,
  andamento,
  cursoAceitaMatricula,
  onMatricular,
  onDetalhes,
  onAvisar,
  onRemover,
  onRenovar,
}) {
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [ordem, setOrdem] = useState({ campo: "matriculadoEm", direcao: "desc" });
  const [limite, setLimite] = useState(LINHAS_POR_VEZ);
  const [prazoTexto, setPrazoTexto] = useState(() => lerPrazo(empresaId));
  const [avisandoAtrasados, setAvisandoAtrasados] = useState(false);

  // o dia é o de Brasília; muda só à meia-noite
  const hoje = hojeEmBrasilia();
  const prazoPadraoDias = diasDePrazoValidos(prazoTexto);

  const linhas = useMemo(
    () =>
      montarLinhas({
        matriculas,
        cursos,
        funcionarios: funcionariosTodos,
        aulas,
        progresso,
        tentativas,
        certificados,
        hoje,
        prazoPadraoDias,
        andamentoCarregado: andamento.carregado && !andamento.erro,
      }),
    [
      matriculas,
      cursos,
      funcionariosTodos,
      aulas,
      progresso,
      tentativas,
      certificados,
      hoje,
      prazoPadraoDias,
      andamento.carregado,
      andamento.erro,
    ]
  );
  const filtradas = useMemo(
    () => ordenarLinhas(filtrarLinhas(linhas, filtros), ordem),
    [linhas, filtros, ordem]
  );
  const atrasadas = useMemo(() => linhas.filter((l) => l.atrasada), [linhas]);
  const resumo = useMemo(() => resumirLinhas(filtradas), [filtradas]);
  const temPrazo = useMemo(() => linhas.some((l) => l.prazo), [linhas]);
  const cursosParaFiltro = useMemo(
    () =>
      [...cursos].sort((a, b) =>
        String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR", { numeric: true })
      ),
    [cursos]
  );

  // mudou filtro ou ordem: volta ao começo da lista
  useEffect(() => setLimite(LINHAS_POR_VEZ), [filtros, ordem]);

  const mudarFiltro = (campo, valor) => setFiltros((f) => ({ ...f, [campo]: valor }));
  const filtrando = Object.values(filtros).some(Boolean);
  const ordenarPor = (campo) =>
    setOrdem((atual) =>
      atual.campo === campo
        ? { campo, direcao: atual.direcao === "asc" ? "desc" : "asc" }
        : { campo, direcao: DIRECAO_INICIAL[campo] || "asc" }
    );

  const mudarPrazo = (bruto) => {
    const texto = bruto.replace(/\D/g, "").slice(0, 4);
    setPrazoTexto(texto);
    gravarPrazo(empresaId, texto);
  };

  const baixarCsv = () => {
    try {
      // o BOM faz o Excel ler os acentos; vão todas as linhas do filtro, não só as 50 da tela
      const blob = new Blob(["\uFEFF" + csvDasLinhas(filtradas)], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `matriculas_ead_${hoje}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${filtradas.length} matrícula(s) exportada(s) em CSV`);
    } catch (e) {
      console.error("Erro ao exportar as matrículas:", e);
      toast.error("Não foi possível exportar o CSV. Tente novamente.");
    }
  };

  const visiveis = filtradas.slice(0, limite);
  const colunas = 11 + (temPrazo ? 1 : 0);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-5 h-5" /> Matrículas ({matriculas.length})
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {atrasadas.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setAvisandoAtrasados(true)}>
              <BellRing className="w-4 h-4 mr-1" /> Avisar atrasados ({atrasadas.length})
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={baixarCsv}
            disabled={filtradas.length === 0 || !andamento.carregado}
            title={
              andamento.carregado
                ? "Baixa as matrículas que estão no filtro, com andamento, nota e vencimento"
                : "Aguarde: as aulas e tentativas ainda estão carregando"
            }
          >
            <Download className="w-4 h-4 mr-1" /> Exportar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={onMatricular}>
            <Plus className="w-4 h-4 mr-1" /> Matricular funcionários
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {matriculas.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="mat-filtro-busca" className="text-xs">
                Buscar
              </Label>
              <Input
                id="mat-filtro-busca"
                type="search"
                placeholder="Funcionário, curso, função ou certificado"
                value={filtros.busca}
                onChange={(e) => mudarFiltro("busca", e.target.value)}
                className="mt-0.5 h-9"
              />
            </div>
            <div>
              <Label htmlFor="mat-filtro-curso" className="text-xs">
                Curso
              </Label>
              <select
                id="mat-filtro-curso"
                className="mt-0.5 block h-9 max-w-[220px] rounded-md border border-slate-200 bg-white px-2 text-sm"
                value={filtros.cursoId}
                onChange={(e) => mudarFiltro("cursoId", e.target.value)}
              >
                <option value="">Todos</option>
                {cursosParaFiltro.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="mat-filtro-status" className="text-xs">
                Status
              </Label>
              <select
                id="mat-filtro-status"
                className="mt-0.5 block h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                value={filtros.status}
                onChange={(e) => mudarFiltro("status", e.target.value)}
              >
                <option value="">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluido">Concluído</option>
                <option value="atrasada">Atrasada</option>
              </select>
            </div>
            <div>
              <Label htmlFor="mat-filtro-venc" className="text-xs">
                Vencimento
              </Label>
              <select
                id="mat-filtro-venc"
                className="mt-0.5 block h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                value={filtros.vencimento}
                onChange={(e) => mudarFiltro("vencimento", e.target.value)}
              >
                <option value="">Todos</option>
                <option value="vencido">Vencidos</option>
                <option value="ate30">Em até 30 dias</option>
                <option value="ate60">31 a 60 dias</option>
                <option value="ate90">61 a 90 dias</option>
                <option value="sem_renovacao">Sem nova matrícula</option>
              </select>
            </div>
            {filtrando && (
              <Button size="sm" variant="ghost" onClick={() => setFiltros(FILTROS_VAZIOS)}>
                Limpar filtros
              </Button>
            )}
          </div>
        )}

        {matriculas.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span aria-live="polite">
              {filtrando
                ? `${filtradas.length} de ${linhas.length} no filtro`
                : `${linhas.length} ${linhas.length === 1 ? "matrícula" : "matrículas"}`}
              {resumo.atrasadas > 0 && ` · ${resumo.atrasadas} atrasada(s)`}
            </span>
            <span className="flex items-center gap-1.5">
              <Label htmlFor="mat-prazo" className="text-xs font-normal">
                Prazo para concluir
              </Label>
              <Input
                id="mat-prazo"
                inputMode="numeric"
                placeholder="sem prazo"
                value={prazoTexto}
                onChange={(e) => mudarPrazo(e.target.value)}
                className="h-7 w-20 px-2 text-xs"
              />
              dias após a matrícula. Vale para os cursos sem prazo no projeto pedagógico e fica
              salvo só neste navegador.
            </span>
            {andamento.carregado && andamento.erro && (
              <span role="alert" className="text-amber-700">
                Não foi possível carregar as aulas e tentativas: atualize a página. Até lá, essas
                colunas ficam em branco, também no CSV.
              </span>
            )}
            {andamento.carregado && andamento.parcial && (
              <span role="alert" className="text-amber-700">
                São tantas aulas e tentativas que a lista foi cortada: esses números podem estar
                incompletos.
              </span>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <Cabecalho
                  campo="funcionario"
                  rotulo="Funcionário"
                  ordem={ordem}
                  onOrdenar={ordenarPor}
                />
                <Cabecalho campo="curso" rotulo="Curso" ordem={ordem} onOrdenar={ordenarPor} />
                <Cabecalho campo="status" rotulo="Status" ordem={ordem} onOrdenar={ordenarPor} />
                <Cabecalho
                  campo="progresso"
                  rotulo="Progresso"
                  ordem={ordem}
                  onOrdenar={ordenarPor}
                />
                <Cabecalho campo="nota" rotulo="Nota" ordem={ordem} onOrdenar={ordenarPor} />
                <Cabecalho
                  campo="tentativas"
                  rotulo="Tentativas"
                  ordem={ordem}
                  onOrdenar={ordenarPor}
                />
                <Cabecalho
                  campo="matriculadoEm"
                  rotulo="Matrícula"
                  ordem={ordem}
                  onOrdenar={ordenarPor}
                />
                {temPrazo && (
                  <Cabecalho campo="prazo" rotulo="Prazo" ordem={ordem} onOrdenar={ordenarPor} />
                )}
                <Cabecalho
                  campo="conclusao"
                  rotulo="Conclusão"
                  ordem={ordem}
                  onOrdenar={ordenarPor}
                />
                <Cabecalho
                  campo="renovacao"
                  rotulo="Próx. renovação"
                  ordem={ordem}
                  onOrdenar={ordenarPor}
                />
                <th scope="col" className="py-2 pr-3 font-medium">
                  Certificado
                </th>
                <th scope="col" className="py-2 font-medium">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => {
                // a tabela tem centenas de linhas iguais: o rótulo diz de quem é a matrícula
                const quem = l.funcionario?.nome_completo
                  ? ` de ${l.funcionario.nome_completo}`
                  : "";
                const bloqueada = !podeRemoverMatricula(l.matricula, l.certificado);
                // só a linha que pode renovar precisa saber se o curso ainda aceita matrícula
                const cursoAberto = l.podeRenovar && cursoAceitaMatricula(l.cursoId);
                return (
                  <tr key={l.id} className="border-b last:border-0 align-top hover:bg-slate-50">
                    <td className="py-2 pr-3">
                      <span
                        className={
                          "font-medium " + (l.inativo ? "text-slate-500" : "text-slate-800")
                        }
                      >
                        {l.funcionarioNome}
                      </span>
                      {l.funcaoNome && (
                        <span className="block text-xs text-slate-400">{l.funcaoNome}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {l.cursoNome}
                      {l.apoio && (
                        <Badge
                          variant="outline"
                          className="ml-1 text-slate-700"
                          title={MSG_CURSO_DE_APOIO}
                        >
                          Apoio
                        </Badge>
                      )}
                      {/* tipo do treinamento (T23): só o que foge do comum (periódico e eventual) */}
                      {l.matricula?.tipo && l.matricula.tipo !== "inicial" && (
                        <span className="block text-xs text-slate-500">{l.tipoTexto}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className={CLASSE_DO_STATUS[l.status] || ""}>
                        {l.statusRotulo}
                      </Badge>
                      {l.atrasada && (
                        <Badge
                          variant="outline"
                          className="ml-1 border-red-200 bg-red-50 text-red-700"
                          title={`Prazo venceu em ${fmtData(l.prazo.limite)}`}
                        >
                          Atrasada
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <CelulaProgresso linha={l} andamento={andamento} />
                    </td>
                    <td className="py-2 pr-3">
                      {l.nota === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span
                          className={
                            l.aprovada === true
                              ? "font-medium text-emerald-700"
                              : l.aprovada === false
                                ? "font-medium text-red-600"
                                : "text-slate-700"
                          }
                          title={
                            l.aprovada === true
                              ? "Nota da última prova: aprovado"
                              : l.aprovada === false
                                ? "Nota da última prova: reprovado"
                                : "Nota da última prova"
                          }
                        >
                          {fmtNota(l.nota)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {!andamento.carregado ? (
                        <span className="text-slate-300">…</span>
                      ) : !l.tentativas ? (
                        <span className="text-slate-400">—</span>
                      ) : l.tentativasMax ? (
                        `${l.tentativas} de ${l.tentativasMax}`
                      ) : (
                        l.tentativas
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{fmtData(l.matriculadoEm)}</td>
                    {temPrazo && (
                      <td
                        className={
                          "py-2 pr-3 " +
                          (l.atrasada ? "font-medium text-red-600" : "text-slate-600")
                        }
                      >
                        {l.prazo ? fmtData(l.prazo.limite) : "—"}
                        {l.atrasada && (
                          <span className="block text-xs font-normal">
                            {l.prazo.diasDeAtraso} dia(s) de atraso
                          </span>
                        )}
                      </td>
                    )}
                    <td className="py-2 pr-3 text-slate-600">{fmtData(l.dataConclusao)}</td>
                    {/* curso de apoio não renova (D3): `renovacao` já vem vazia nele */}
                    <td className="py-2 pr-3 text-slate-600">
                      {fmtData(l.renovacao)}
                      {l.vigente && l.faixa && typeof l.dias === "number" && (
                        <span
                          className={
                            "block text-xs " + (l.dias < 0 ? "text-red-600" : "text-amber-700")
                          }
                        >
                          {rotuloDoVencimento(l.dias)}
                          {l.renovacaoEmAndamento && " · renovando"}
                        </span>
                      )}
                      {l.substituida && l.renovacao && (
                        <span className="block text-xs text-slate-400">renovada</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <CelulaCertificado linha={l} />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          title="Detalhes: tempo por aula, tentativas, trilha de acessos e certificado"
                          aria-label={`Detalhes da matrícula${quem}`}
                          onClick={() => onDetalhes(l.id)}
                        >
                          <ClipboardList className="w-4 h-4 text-slate-600 hover:text-slate-900" />
                        </button>
                        <button
                          type="button"
                          title={
                            l.inativo
                              ? "Funcionário inativo: não há a quem avisar"
                              : "Avisar pelo WhatsApp (cria o acesso ao portal se ainda não tiver)"
                          }
                          aria-label={`Avisar no WhatsApp${quem}`}
                          disabled={l.inativo}
                          onClick={() => onAvisar(l.funcionario)}
                          className="disabled:cursor-not-allowed"
                        >
                          <MessageCircle
                            className={
                              l.inativo
                                ? "w-4 h-4 text-slate-300"
                                : "w-4 h-4 text-emerald-600 hover:text-emerald-800"
                            }
                          />
                        </button>
                        {l.podeRenovar && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={!cursoAberto}
                            title={
                              cursoAberto
                                ? "Cria uma nova matrícula neste curso, do zero; esta fica como histórico"
                                : "O curso está em rascunho ou com pendências: não aceita matrícula"
                            }
                            aria-label={`Renovar o treinamento${quem}`}
                            onClick={() => onRenovar(l)}
                          >
                            <RotateCw className="w-3 h-3 mr-1" /> Renovar
                          </Button>
                        )}
                        <button
                          type="button"
                          title={
                            bloqueada
                              ? "Revogue o certificado antes de remover a matrícula"
                              : "Remover matrícula"
                          }
                          aria-label={
                            bloqueada
                              ? `Remover matrícula${quem} (bloqueado: revogue o certificado antes)`
                              : `Remover matrícula${quem}`
                          }
                          aria-disabled={bloqueada}
                          onClick={() => onRemover(l.matricula)}
                        >
                          <Trash2
                            className={
                              bloqueada
                                ? "w-4 h-4 text-slate-300 cursor-not-allowed"
                                : "w-4 h-4 text-slate-400 hover:text-red-500"
                            }
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {matriculas.length === 0 && (
                <tr>
                  <td colSpan={colunas} className="py-6 text-center text-slate-500">
                    Nenhuma matrícula — matricule funcionários num curso pra liberar o portal.
                  </td>
                </tr>
              )}
              {matriculas.length > 0 && filtradas.length === 0 && (
                <tr>
                  <td colSpan={colunas} className="py-6 text-center text-slate-500">
                    Nenhuma matrícula com estes filtros.{" "}
                    <button
                      type="button"
                      className="text-sky-700 underline"
                      onClick={() => setFiltros(FILTROS_VAZIOS)}
                    >
                      Limpar filtros
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filtradas.length > visiveis.length && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-500">
              Mostrando {visiveis.length} de {filtradas.length}
            </span>
            <button
              type="button"
              className="text-sky-700 underline"
              onClick={() => setLimite((n) => n + LINHAS_POR_VEZ)}
            >
              Mostrar mais {Math.min(LINHAS_POR_VEZ, filtradas.length - visiveis.length)}
            </button>
            <button
              type="button"
              className="text-sky-700 underline"
              onClick={() => setLimite(filtradas.length)}
            >
              Mostrar todas ({filtradas.length})
            </button>
          </div>
        )}
      </CardContent>

      <AvisoAtrasadosDialog
        aberto={avisandoAtrasados}
        linhas={atrasadas}
        empresaId={empresaId}
        onFechar={() => setAvisandoAtrasados(false)}
      />
    </Card>
  );
}
